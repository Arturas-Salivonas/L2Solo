const assert = require('assert');
const fs = require('fs');
const os = require('os');
const nodePath = require('path');

const setsDir = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'solo-buffer-'));
process.env.L2SOLO_BUFFER_SETS_FILE = nodePath.join(setsDir, 'buff-sets.json');

require('../src/Global');

// Buffs schedule 60-minute expiry timers; collect them so the file can exit.
const originalSetTimeout = global.setTimeout;
const timers = [];
global.setTimeout = (...args) => {
    const timer = originalSetTimeout(...args);
    timers.push(timer);
    return timer;
};

const SoloBuffer = invoke('GameServer/Solo/SoloBuffer');
const AdminFullBuff = invoke('GameServer/World/Generics/NpcBypasses/AdminFullBuff');
const EffectStore = invoke('GameServer/Effects/EffectStore');
const PlayerBoardWindow = invoke('GameServer/AfkTrade/PlayerBoardWindow');

const refreshed = [];
SoloBuffer.hooks.refresh = (session, actor) => refreshed.push(actor);
SoloBuffer.hooks.refreshSummon = (session, summon) => refreshed.push(summon);

function player(name = 'Tester', options = {}) {
    const actor = {
        effects: {},
        activeBuffs: {},
        fetchId: () => options.id ?? 268480001,
        fetchName: () => name,
        fetchClassId: () => options.classId ?? 0,
        isSpellcaster: () => 0,
        isDead: () => options.dead === true
    };
    return { actor, sent: [], dataSendToMe(packet) { this.sent.push(packet); } };
}
const buffs = (actor) => EffectStore.list(actor, { includeDebuffs: false }).filter(EffectStore.includedInBuffCount);
const levelOf = (actor, selfId) => buffs(actor).find((effect) => Number(effect.id) === selfId)?.level;

// ---------- catalog ----------
const catalog = SoloBuffer.catalog();
const groupIds = SoloBuffer.GROUPS.flatMap((group) => group.ids);
assert.strictEqual(new Set(groupIds).size, groupIds.length, 'a buff must be listed in only one group');
assert.strictEqual(catalog.byId.size, groupIds.length, 'every catalog buff must exist in the active skill data');
assert.strictEqual(SoloBuffer.maxLevel(1204), 2, 'Wind Walk comes from the Cleric tree at level 2');
assert.strictEqual(SoloBuffer.maxLevel(1068), 3, 'Might tops out at level 3');
assert.strictEqual(SoloBuffer.maxLevel(1045), 6, 'Bless the Body tops out at level 6');
assert.strictEqual(SoloBuffer.maxLevel(1078), 6, 'Concentration tops out at level 6');
assert.strictEqual(catalog.byId.get(271).level, 1, 'dances have one level');

// ---------- presets ----------
for (const preset of SoloBuffer.PRESETS) {
    const { entries } = SoloBuffer.presetEntries(preset, player().actor);
    assert.strictEqual(entries.length, EffectStore.BUFF_LIMIT, `${preset.id} preset should fill the 20 C4 buff slots`);
    entries.forEach(([selfId, level]) => assert.ok(AdminFullBuff.skillData(selfId, level), `${preset.id} uses sourced skill ${selfId}`));
}
assert.strictEqual(SoloBuffer.presetEntries({ profile: null }, player('Tank', { classId: 5 }).actor).profile, 'tank',
    'the My class preset should follow the class profile');

// ---------- config ----------
assert.deepStrictEqual(SoloBuffer.config(), { enabled: true, altB: true, buffMinutes: 60 }, 'defaults: on, Alt+B, 60 minutes');
const savedOptions = global.options.default.SoloHelper;
global.options.default.SoloHelper = { buffMinutes: '30', altB: 'false' };
assert.deepStrictEqual(SoloBuffer.config(), { enabled: true, altB: false, buffMinutes: 30 }, 'local.ini values override the defaults');
global.options.default.SoloHelper = { buffMinutes: 'nonsense', enabled: false };
assert.deepStrictEqual(SoloBuffer.config(), { enabled: false, altB: true, buffMinutes: 60 }, 'a bad minute value falls back to 60');
global.options.default.SoloHelper = savedOptions;

// ---------- one buff: 60 minutes, level from the catalog only ----------
{
    const session = player();
    const before = Date.now();
    const html = SoloBuffer.handle(session, ['one', '1068', '9']);
    const might = buffs(session.actor).find((effect) => Number(effect.id) === 1068);
    assert.ok(might, 'clicking Might should buff the player');
    assert.strictEqual(might.level, 3, 'the level comes from the catalog, not from the link');
    const minutes = (might.expiresAt - before) / 60000;
    assert.ok(minutes > 59.9 && minutes < 60.1, `buffs should last 60 minutes, got ${minutes}`);
    assert.ok(html.includes('Might 3 on.'), 'the page should confirm the buff');
    assert.ok(refreshed.includes(session.actor), 'the client should be refreshed after a buff');
    assert.ok(session.sent.length === 1, 'one page goes back to the client');

    const group = SoloBuffer.groupPage(session, 'prophet');
    assert.ok(group.includes(`<font color="${'00FF00'}">Might 3</font>`), 'active buffs are shown green');
}
{
    const session = player();
    SoloBuffer.handle(session, ['one', '99999']);
    SoloBuffer.handle(session, ['one', '1068abc']);
    SoloBuffer.handle(session, ['one', '4']);
    assert.strictEqual(buffs(session.actor).length, 0, 'ids outside the catalog or malformed ids buff nothing');
}
{
    const session = player('Ghost', { dead: true });
    const html = SoloBuffer.handle(session, ['preset', 'tank']);
    assert.strictEqual(buffs(session.actor).length, 0, 'a dead player cannot be buffed');
    assert.ok(html.includes('You cannot be buffed while dead.'), 'the page says why');
}

// ---------- preset, clear ----------
{
    const session = player();
    const debuff = EffectStore.apply(session.actor, { key: 'poison', id: 4035, level: 1, type: 'debuff', durationMs: 60000 });
    assert.ok(debuff, 'fixture debuff should apply');
    const html = SoloBuffer.handle(session, ['preset', 'mage']);
    assert.strictEqual(buffs(session.actor).length, 20, 'the mage preset applies 20 buffs');
    assert.ok(html.includes('Mage preset: 20 buffs on.'), 'the page reports the preset');
    assert.strictEqual(levelOf(session.actor, 1085), 3, 'the mage preset includes Acumen 3');

    SoloBuffer.handle(session, ['clear']);
    assert.strictEqual(buffs(session.actor).length, 0, 'clear removes every buff');
    assert.ok(EffectStore.list(session.actor).some((effect) => effect.key === 'poison'), 'clear leaves debuffs alone');
}

// ---------- saved set ----------
{
    const session = player('Saver', { id: 268480777 });
    assert.ok(SoloBuffer.handle(session, ['mine']).includes('No saved set yet'), 'no set before saving');
    SoloBuffer.handle(session, ['one', '1204']);
    SoloBuffer.handle(session, ['one', '275']);
    assert.ok(SoloBuffer.handle(session, ['save']).includes('Saved 2 buffs'), 'save stores the current catalog buffs');
    SoloBuffer.handle(session, ['clear']);
    SoloBuffer.handle(session, ['mine']);
    assert.strictEqual(levelOf(session.actor, 1204), 2, 'My set restores Wind Walk 2');
    assert.strictEqual(levelOf(session.actor, 275), 1, 'My set restores Dance of Fury');

    const reused = player('NewCharacter', { id: 268480777 });
    assert.strictEqual(SoloBuffer.savedSet(reused.actor), null, 'a wiped world reusing the id must not inherit the old set');
}

// ---------- servitor ----------
{
    const session = player();
    assert.ok(SoloBuffer.handle(session, ['pet']).includes('You have no servitor out.'), 'pet needs a servitor');
}

// ---------- pages fit the packet ----------
{
    const session = player();
    assert.ok(SoloBuffer.homePage(session).length < 8192, 'home page fits the HTML guard');
    for (const group of SoloBuffer.GROUPS) {
        const html = SoloBuffer.groupPage(session, group.id);
        assert.ok(html.length < 8192, `${group.id} page fits the HTML guard`);
        group.ids.forEach((selfId) => assert.ok(html.includes(`solo-buffer one ${selfId}`), `${group.id} lists ${selfId}`));
    }
    const home = SoloBuffer.homePage(session);
    for (const command of ['solo-buffer preset tank', 'solo-buffer preset fighter', 'solo-buffer preset mage',
        'solo-buffer preset support', 'solo-buffer preset auto', 'solo-buffer mine', 'solo-buffer save',
        'solo-buffer clear', 'solo-buffer market', 'solo-buffer group songs']) {
        assert.ok(home.includes(command), `home page offers ${command}`);
    }
}

// ---------- Alt+B, .buffer, the bypass route ----------
{
    const originalOpen = PlayerBoardWindow.open;
    let marketOpened = 0;
    PlayerBoardWindow.open = () => { marketOpened += 1; return 'market'; };

    const session = player();
    const altB = invoke('GameServer/Network/Opcodes').table[0x57];
    assert.ok(String(altB(session)).includes('Solo Buffer'), 'Alt+B opens the solo buffer');
    assert.strictEqual(marketOpened, 0, 'Alt+B no longer opens the Market Board directly');

    SoloBuffer.handle(session, ['market']);
    assert.strictEqual(marketOpened, 1, 'the Market Board link opens upstream\'s board');

    global.options.default.SoloHelper = { altB: 'false' };
    altB(session);
    assert.strictEqual(marketOpened, 2, 'with altB = false, Alt+B is the Market Board again');
    global.options.default.SoloHelper = savedOptions;
    PlayerBoardWindow.open = originalOpen;

    assert.strictEqual(SoloBuffer.command(session, ' .BUFFER '), true, '.buffer opens the window');
    assert.strictEqual(SoloBuffer.command(session, '.buff'), false, '.buff stays the bot buff-sale command');
    assert.strictEqual(SoloBuffer.command(session, 'hello'), false, 'ordinary chat is not a command');

    const originalHandle = SoloBuffer.handle;
    let routed = null;
    SoloBuffer.handle = (routedSession, args) => { routed = args; };
    invoke('GameServer/World/Generics/NpcTalkResponse')(session, { link: 'solo-buffer group songs' });
    SoloBuffer.handle = originalHandle;
    assert.deepStrictEqual(routed, ['group', 'songs'], 'bypass solo-buffer reaches the handler with its arguments');
}

timers.forEach((timer) => clearTimeout(timer));
global.setTimeout = originalSetTimeout;
fs.rmSync(setsDir, { recursive: true, force: true });
console.log('solo buffer: ok');
