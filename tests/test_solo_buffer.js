const assert = require('assert');
const fs = require('fs');
const os = require('os');
const nodePath = require('path');

const setsDir = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'solo-buffer-'));
process.env.L2SOLO_BUFFER_SETS_FILE = nodePath.join(setsDir, 'buff-sets.json');

require('../src/Global');
// The checks run on the defaults: a player's own config/local.ini (buffSlots = 28, say) must not move them.
global.options.default.SoloHelper = {};

// Buffs schedule 60-minute expiry timers; collect them so the file can exit.
const originalSetTimeout = global.setTimeout;
const timers = [];
global.setTimeout = (...args) => {
    const timer = originalSetTimeout(...args);
    timers.push(timer);
    return timer;
};

const SoloBuffer = invoke('GameServer/Solo/SoloBuffer');
const SoloHelper = invoke('GameServer/Solo/SoloHelper');
const { config } = invoke('GameServer/Solo/SoloConfig');
const ShowBoard = invoke('GameServer/Solo/ShowBoardPacket');
const AdminFullBuff = invoke('GameServer/World/Generics/NpcBypasses/AdminFullBuff');
const EffectStore = invoke('GameServer/Effects/EffectStore');
const PlayerBoardWindow = invoke('GameServer/AfkTrade/PlayerBoardWindow');

const refreshed = [];
SoloBuffer.hooks.refresh = (session, actor) => refreshed.push(actor);
SoloBuffer.hooks.refreshSummon = (session, summon) => refreshed.push(summon);
SoloBuffer.hooks.vitals = (session, actor) => refreshed.push(actor);

function player(name = 'Tester', options = {}) {
    const actor = {
        effects: {},
        activeBuffs: {},
        fetchId: () => options.id ?? 268480001,
        fetchName: () => name,
        fetchClassId: () => options.classId ?? 0,
        isSpellcaster: () => 0,
        isDead: () => options.dead === true,
        hp: 10, mp: 5, cp: 0,
        fillupVitals() { this.hp = 100; this.mp = 50; this.cp = 80; }
    };
    return { actor, sent: [], dataSendToMe(packet) { this.sent.push(packet); } };
}
const buffs = (actor) => EffectStore.list(actor, { includeDebuffs: false }).filter(EffectStore.includedInBuffCount);
const levelOf = (actor, selfId) => buffs(actor).find((effect) => Number(effect.id) === selfId)?.level;
const savedOptions = global.options.default.SoloHelper;
const withOptions = (options, run) => {
    global.options.default.SoloHelper = options;
    try { return run(); } finally { global.options.default.SoloHelper = savedOptions; }
};

// Reads the UTF-16 strings of a ShowBoard packet: 8 top bypasses, then "<id>\b<html>".
function decodeBoard(buffer) {
    assert.strictEqual(buffer[0], 0x6e, 'ShowBoard opcode is 0x6e');
    assert.strictEqual(buffer[1], 0x01, 'ShowBoard show flag is 1');
    const strings = [];
    let offset = 2;
    while (strings.length < 9) {
        let end = offset;
        while (!(buffer[end] === 0 && buffer[end + 1] === 0)) end += 2;
        strings.push(buffer.slice(offset, end).toString('ucs2'));
        offset = end + 2;
    }
    const [id, html] = strings[8].split('\u0008');
    return { top: strings.slice(0, 8), id, html };
}
const boardHtml = (session) => session.sent.filter((packet) => packet[0] === 0x6e).slice(-3).map((packet) => decodeBoard(packet).html).join('');

// ---------- catalog ----------
const catalog = SoloBuffer.catalog();
const groupIds = SoloBuffer.GROUPS.flatMap((group) => group.ids);
assert.strictEqual(new Set(groupIds).size, groupIds.length, 'a buff must be listed in only one group');
assert.strictEqual(catalog.byId.size, groupIds.length, 'every catalog buff must exist in the active skill data');
assert.strictEqual(groupIds.length, 89, 'the catalog covers 85 C4 buffer buffs and the 4 servitor buffs');
assert.ok(SoloBuffer.GROUPS.every((group) => group.ids.length <= 19), 'a group stays small enough for one board page');
assert.strictEqual(SoloBuffer.maxLevel(1204), 2, 'Wind Walk comes from the Cleric tree at level 2');
assert.strictEqual(SoloBuffer.maxLevel(1068), 3, 'Might tops out at level 3');
assert.strictEqual(SoloBuffer.maxLevel(1045), 6, 'Bless the Body tops out at level 6');
assert.strictEqual(SoloBuffer.maxLevel(1078), 6, 'Concentration tops out at level 6');
assert.strictEqual(catalog.byId.get(271).level, 1, 'dances have one level');
assert.strictEqual(SoloBuffer.iconFor(271), 'icon.skill0271', 'skill icons use the 4-digit client texture name');
assert.strictEqual(SoloBuffer.iconFor(1068), 'icon.skill1068', 'four-digit ids keep their digits');

// ---------- each class line with its 3rd class ----------
{
    const ids = (groupId) => catalog.groups.find((group) => group.id === groupId).buffs.map((buff) => buff.selfId);
    assert.ok([1364, 1365].every((id) => ids('paagrio').includes(id)), 'the Dominator buffs sit with the Overlord ones');
    assert.ok([1003, 1004, 1005, 1008, 1249, 1250, 1260, 1261, 1282].every((id) => ids('paagrio').includes(id)),
        'every Overlord buff of the C4 tree');
    assert.ok(ids('chants').includes(1362), 'Chant of Spirit sits with the Warcryer chants');
    assert.ok(ids('third').includes(1363) && !ids('chants').includes(1363), 'Chant of Victory is in Special');
    assert.ok(![1362, 1364, 1365].some((id) => ids('third').includes(id)), 'the others no longer in Special');
}

// ---------- the summoner servitor buffs (ServitorBuffs, Lisvus C4) ----------
{
    const special = catalog.groups.find((group) => group.id === 'third');
    assert.strictEqual(special.label, 'Special');
    const names = special.buffs.filter((buff) => buff.selfId >= 4699 && buff.selfId <= 4703).map((buff) => buff.name);
    assert.deepStrictEqual(names, ['Blessing of Queen', 'Gift of Queen', 'Blessing of Seraphim', 'Gift of Seraphim'], 'the four of them');
    assert.strictEqual(SoloBuffer.iconFor(4699), 'icon.skill1331', 'Queen buffs show the Summon Queen of Cat icon');
    assert.strictEqual(SoloBuffer.iconFor(4703), 'icon.skill1332', 'Seraphim buffs show the Summon Unicorn Seraphim icon');
    const hero = player('Summoner');
    SoloBuffer.applyEntries(hero, hero.actor, [[4699, 3]], { scheduleExpiry: false });
    const blessing = buffs(hero.actor).find((effect) => effect.id === 4699);
    assert.deepStrictEqual(blessing.stats, { pCritRateMul: 1.3, pCritDamageMul: 1.25 }, 'Blessing of Queen: crit rate and damage');
    SoloBuffer.applyEntries(hero, hero.actor, [[4700, 3]], { scheduleExpiry: false });
    assert.deepStrictEqual(buffs(hero.actor).filter((effect) => effect.id === 4699 || effect.id === 4700).map((effect) => effect.id), [4700],
        'Gift of Queen replaces Blessing of Queen (C4 stack group QueenBuff)');
    SoloBuffer.applyEntries(hero, hero.actor, [[4702, 3], [4703, 3]], { scheduleExpiry: false });
    assert.deepStrictEqual(buffs(hero.actor).filter((effect) => effect.id === 4702 || effect.id === 4703).map((effect) => effect.id), [4703],
        'the Seraphim pair works the same way');
    assert.strictEqual(buffs(hero.actor).find((effect) => effect.id === 4703).stats.mReuseMul, 0.65, 'Gift of Seraphim: magic reuse');
    assert.strictEqual(buffs(hero.actor).find((effect) => effect.id === 4700).stats.pAtkMul, 1.1, 'Gift of Queen: P.Atk');
}

// ---------- presets ----------
for (const preset of SoloBuffer.PRESETS) {
    const { entries } = SoloBuffer.presetEntries(preset, player().actor);
    assert.strictEqual(entries.length, EffectStore.BUFF_LIMIT, `${preset.id} preset should fill the 20 C4 buff slots`);
    entries.forEach(([selfId, level]) => assert.ok(AdminFullBuff.skillData(selfId, level), `${preset.id} uses sourced skill ${selfId}`));
}
assert.deepStrictEqual(SoloBuffer.PRESETS.map((preset) => preset.label), ['Tank', 'Fighter', 'Mage', 'Support'], 'no My class preset');

// ---------- config ----------
assert.deepStrictEqual(config(), { enabled: true, altB: true, buffMinutes: 60, window: 'board', adena: true, classChange: true, buffSlots: 20 }, 'defaults: on, Alt+B, 60 minutes, board');
withOptions({ buffMinutes: '30', altB: 'false', window: 'CHAT' }, () => assert.deepStrictEqual(config(),
    { enabled: true, altB: false, buffMinutes: 30, window: 'chat', adena: true, classChange: true, buffSlots: 20 }, 'local.ini values override the defaults'));
withOptions({ buffMinutes: 'nonsense', enabled: false, window: 'weird' }, () => assert.deepStrictEqual(config(),
    { enabled: false, altB: true, buffMinutes: 60, window: 'board', adena: true, classChange: true, buffSlots: 20 }, 'bad values fall back to the defaults'));

withOptions({ buffSlots: '28' }, () => assert.strictEqual(config().buffSlots, 28, 'up to 28 buff slots'));
withOptions({ buffSlots: '35' }, () => assert.strictEqual(config().buffSlots, 28, 'never more than 28'));
withOptions({ buffSlots: '12' }, () => assert.strictEqual(config().buffSlots, 20, 'never fewer than the C4 20'));

// ---------- buff slots: a player may have up to 28, bots and summons keep C4's 20 ----------
{
    const withSession = (bot) => {
        const session = player(bot ? 'Botty' : 'Hero', { id: bot ? 268480002 : 268480003 });
        session.accountId = bot ? 'bot_pop_1' : 'player1';
        session.actor.session = session;
        return session;
    };
    const many = SoloBuffer.catalog().groups.flatMap((group) => group.buffs).slice(0, 30).map((buff) => [buff.selfId, buff.level]);
    withOptions({ buffSlots: '28' }, () => {
        const hero = withSession(false), bot = withSession(true);
        assert.strictEqual(EffectStore.limitFor(hero.actor), 28, 'the player gets the configured slots');
        assert.strictEqual(EffectStore.limitFor(bot.actor), 20, 'a bot keeps 20');
        assert.strictEqual(EffectStore.limitFor({ fetchKind: () => 'Summon', session: hero }), 20, 'a summon keeps 20');
        SoloBuffer.applyEntries(hero, hero.actor, many, { scheduleExpiry: false });
        assert.strictEqual(buffs(hero.actor).length, 28, 'the player holds 28 buffs');
        SoloBuffer.applyEntries(bot, bot.actor, many, { scheduleExpiry: false });
        assert.strictEqual(buffs(bot.actor).length, 20, 'the bot holds 20');
        assert.ok(SoloHelper.handleBoard(hero, ['buff']).includes('28/28'), 'the board counts the slots of the player');
    });
    assert.strictEqual(EffectStore.limitFor(withSession(false).actor), 20, 'by default a player has the C4 20');
}

// A server where the Solo Helper was copied in by hand without the EffectStore edit: the board
// still works, with C4's 20 slots.
{
    const limitFor = EffectStore.limitFor;
    delete EffectStore.limitFor;
    try {
        const page = SoloHelper.handleBoard(player('Copied'), ['buff']);
        assert.ok(page.includes('0/20'), 'without limitFor the board counts 20 slots');
    } finally { EffectStore.limitFor = limitFor; }
}

// ---------- one buff: 60 minutes, level from the catalog only ----------
{
    const session = player();
    const before = Date.now();
    const state = SoloBuffer.act(session, 'one', '1068');
    const might = buffs(session.actor).find((effect) => Number(effect.id) === 1068);
    assert.ok(might, 'clicking Might should buff the player');
    assert.strictEqual(might.level, 3, 'the level comes from the catalog, never from the link');
    const minutes = (might.expiresAt - before) / 60000;
    assert.ok(minutes > 59.9 && minutes < 60.1, `buffs should last 60 minutes, got ${minutes}`);
    assert.deepStrictEqual(state, { group: 'prophet', message: 'Might 3 on.' }, 'the page goes back to the buff\'s group');
    assert.ok(refreshed.includes(session.actor), 'the client should be refreshed after a buff');
}
{
    const session = player();
    for (const arg of ['99999', '1068abc', '4', '']) SoloBuffer.act(session, 'one', arg);
    assert.strictEqual(buffs(session.actor).length, 0, 'ids outside the catalog or malformed ids buff nothing');
}
{
    const session = player('Ghost', { dead: true });
    assert.strictEqual(SoloBuffer.act(session, 'preset', 'tank').message, 'You cannot be buffed while dead.', 'the page says why');
    SoloBuffer.act(session, 'one', '1068');
    assert.strictEqual(buffs(session.actor).length, 0, 'a dead player cannot be buffed');
}

// ---------- preset, clear ----------
{
    const session = player();
    assert.ok(EffectStore.apply(session.actor, { key: 'poison', id: 4035, level: 1, type: 'debuff', durationMs: 60000 }), 'fixture debuff applies');
    assert.strictEqual(SoloBuffer.act(session, 'preset', 'mage').message, 'Mage preset: 20 buffs on.', 'the page reports the preset');
    assert.strictEqual(buffs(session.actor).length, 20, 'the mage preset applies 20 buffs');
    assert.strictEqual(levelOf(session.actor, 1085), 3, 'the mage preset includes Acumen 3');
    SoloBuffer.act(session, 'clear');
    assert.strictEqual(buffs(session.actor).length, 0, 'clear removes every buff');
    assert.ok(EffectStore.list(session.actor).some((effect) => effect.key === 'poison'), 'clear leaves debuffs alone');
}

// ---------- saved set ----------
{
    const session = player('Saver', { id: 268480777 });
    assert.ok(SoloBuffer.act(session, 'mine').message.includes('No saved set yet'), 'no set before saving');
    SoloBuffer.act(session, 'one', '1204');
    SoloBuffer.act(session, 'one', '275');
    assert.strictEqual(SoloBuffer.act(session, 'save').message, 'Saved 2 buffs as My set.', 'save stores the current catalog buffs');
    SoloBuffer.act(session, 'clear');
    SoloBuffer.act(session, 'mine');
    assert.strictEqual(levelOf(session.actor, 1204), 2, 'My set restores Wind Walk 2');
    assert.strictEqual(levelOf(session.actor, 275), 1, 'My set restores Dance of Fury');
    assert.strictEqual(SoloBuffer.savedSet(player('NewCharacter', { id: 268480777 }).actor), null,
        'a wiped world reusing the id must not inherit the old set');
}
assert.strictEqual(SoloBuffer.act(player(), 'pet').message, 'You have no servitor out.', 'pet needs a servitor');

// ---------- board: packet, size, content ----------
{
    const parts = ShowBoard.split('x'.repeat(5000));
    assert.deepStrictEqual(parts.map(([id, part]) => [id, part.length]), [['101', 4090], ['102', 910], ['103', 0]],
        'a page splits into 4090-character parts 101, 102 and 103');
    assert.throws(() => ShowBoard.split('x'.repeat(ShowBoard.MAX_LENGTH)), /C4 limit/, 'an oversized page is refused, not sent');

    const session = player();
    SoloHelper.openBoard(session);
    assert.strictEqual(session.sent.length, 3, 'a board page goes out as three packets');
    const decoded = session.sent.map(decodeBoard);
    assert.deepStrictEqual(decoded.map((part) => part.id), ['101', '102', '103'], 'parts carry ids 101, 102, 103');
    assert.ok(decoded[0].top.every((bypass) => bypass.startsWith('bypass _bbssolo')), 'the board top buttons lead into the helper');
    const html = boardHtml(session);
    assert.ok(html.startsWith('<html><body>') && html.endsWith('</body></html>'), 'the joined parts are one page');
    for (const command of ['_bbssolo buff preset tank', '_bbssolo buff preset fighter', '_bbssolo buff preset mage',
        '_bbssolo buff preset support', '_bbssolo buff restore', '_bbssolo buff mine', '_bbssolo buff save',
        '_bbssolo buff clear', '_bbssolo market', '_bbssolo buff group songs', '_bbssolo buff one 1204']) {
        assert.ok(html.includes(`bypass ${command}"`), `the board offers ${command}`);
    }
    assert.ok(html.includes('back="icon.skill1243" fore="icon.skill1243"'), 'presets are skill-icon buttons');
    assert.ok(!html.includes('preset auto') && !html.includes('My class'), 'no My class preset on the board');
    assert.ok(!html.includes('>Active<'), 'no Active row');

    // Worst case per group: 20 active buffs from that group.
    for (const group of catalog.groups) {
        const full = player();
        SoloBuffer.applyEntries(full, full.actor, group.buffs.slice(0, 20).map((buff) => [buff.selfId, buff.level]), { scheduleExpiry: false });
        const page = SoloHelper.handleBoard(full, ['buff', 'group', group.id]);
        assert.ok(page.length < ShowBoard.MAX_LENGTH, `${group.id} board page fits the packet (${page.length})`);
        assert.ok((page.match(/<tr>/g) || []).length <= 25, `${group.id} board page stays under the client row limit`);
        group.buffs.forEach((buff) => assert.ok(page.includes(`_bbssolo buff one ${buff.selfId}"`), `${group.id} lists ${buff.selfId}`));
        assert.ok(!page.includes('width=24 height=24>'), 'no Active row of icons');
        assert.ok(!page.includes('>remove</a>'), 'no remove links on the board');
        assert.ok(page.includes('60 min</font>'), 'active buffs show their time left');
    }

    // Remove one buff, and full HP, MP and CP.
    const remover = player();
    SoloHelper.handleBoard(remover, ['buff', 'one', '1068']);
    SoloHelper.handleBoard(remover, ['buff', 'one', '1040']);
    assert.strictEqual(SoloBuffer.removeBuff(remover, remover.actor, 1068), true, 'removeBuff takes one buff off');
    assert.deepStrictEqual(buffs(remover.actor).map((effect) => Number(effect.id)), [1040], 'and only that one');
    assert.strictEqual(SoloBuffer.removeBuff(remover, remover.actor, 1068), false, 'removing it twice');
    assert.deepStrictEqual(SoloBuffer.act(remover, 'off', '1040'), {}, 'the board has no remove action');
    const healed = SoloHelper.handleBoard(remover, ['buff', 'restore']);
    assert.ok(healed.includes('HP, MP and CP full.'), 'the restore button reports it');
    assert.deepStrictEqual([remover.actor.hp, remover.actor.mp, remover.actor.cp], [100, 50, 80], 'HP, MP and CP are full');
    assert.deepStrictEqual(SoloBuffer.act(player('Ghost', { dead: true }), 'restore'), { message: 'You cannot be healed while dead.' },
        'a dead player is not healed');

    const clicked = player();
    const page = SoloHelper.handleBoard(clicked, ['buff', 'one', '271']);
    assert.ok(page.includes('Dance of Warrior 1 on.'), 'a board click buffs and reports it');
    const pressed = (html, label) => new RegExp(`value="${label}" [^>]*fore="L2UI_ch3\\.Btn1_normalOn"`).test(html);
    assert.ok(pressed(page, 'Dances') && !pressed(page, 'Prophet'), 'the clicked buff\'s group tab is the pressed one');
    assert.strictEqual(clicked.soloBuffGroup, 'dances', 'the board remembers the open group');
    assert.ok(pressed(SoloHelper.handleBoard(clicked, ['buff', 'preset', 'tank']), 'Dances'), 'a preset keeps the open group');
    assert.ok(pressed(page, 'Buffer') && !pressed(page, 'Market Board'), 'the Buffer tab is the pressed top tab');

    // The C4 client draws a text button's texture at one size (BoardStyle.BUTTON_WIDTH): no board
    // button may ask for more, or its label runs past the texture (seen in game 2026-11-27).
    const Style = invoke('GameServer/Solo/BoardStyle');
    const withServitor = player();
    const SummonControl = invoke('GameServer/Npc/SummonControl');
    const activeSummon = SummonControl.activeSummon;
    SummonControl.activeSummon = () => ({ fetchId: () => 1, fetchName: () => 'Kat' });
    try {
        const pages = [SoloHelper.handleBoard(withServitor, ['buff']), ...catalog.groups.map((group) => SoloHelper.handleBoard(withServitor, ['buff', 'group', group.id]))];
        const buttons = pages.flatMap((html) => [...html.matchAll(/<button value="([^"]*)"[^>]*width=(\d+)/g)]);
        assert.ok(buttons.some(([, label]) => label === 'Buff servitor'), 'the servitor button is on the page');
        for (const [, label, width] of buttons) {
            assert.ok(Number(width) <= Style.BUTTON_WIDTH, `"${label}" asks for ${width}, more than ${Style.BUTTON_WIDTH}`);
            assert.ok(label.length <= 13, `"${label}" is too long for one button`);
        }
    } finally { SummonControl.activeSummon = activeSummon; }
}

// ---------- chat view still works (window = chat) ----------
{
    const session = player();
    for (const group of SoloBuffer.GROUPS) assert.ok(SoloBuffer.groupPage(session, group.id).length < 8192, `${group.id} chat page fits`);
    assert.ok(SoloBuffer.homePage(session).length < 8192, 'chat home page fits');
    const html = SoloBuffer.chatHandle(session, ['one', '1068']);
    assert.ok(html.includes('Might 3 on.') && html.includes('solo-buffer one 1068'), 'chat view buffs and shows its group');
    assert.strictEqual(session.sent.at(-1)[0], 0x0f, 'the chat view is an NpcHtml packet');
    withOptions({ window: 'chat' }, () => {
        const chat = player();
        SoloHelper.openBoard(chat);
        assert.strictEqual(chat.sent.at(-1)[0], 0x0f, 'window = chat opens the chat view on Alt+B');
    });
}

// ---------- Alt+B, .buffer, bypass routes ----------
{
    const originalOpen = PlayerBoardWindow.open;
    let marketOpened = 0;
    PlayerBoardWindow.open = () => { marketOpened += 1; return 'market'; };

    const session = player();
    const altB = invoke('GameServer/Network/Opcodes').table[0x57];
    assert.ok(String(altB(session)).includes('Solo Helper'), 'Alt+B opens the Solo Helper board');
    assert.strictEqual(marketOpened, 0, 'Alt+B no longer opens the Market Board directly');
    SoloHelper.handleBoard(session, ['market']);
    assert.strictEqual(marketOpened, 1, 'the Market Board tab opens upstream\'s board');
    withOptions({ altB: 'false' }, () => altB(session));
    assert.strictEqual(marketOpened, 2, 'with altB = false, Alt+B is the Market Board again');
    withOptions({ enabled: 'false' }, () => altB(session));
    assert.strictEqual(marketOpened, 3, 'with the helper off, Alt+B is the Market Board');
    PlayerBoardWindow.open = originalOpen;

    assert.strictEqual(SoloHelper.command(session, ' .BUFFER '), true, '.buffer opens the helper');
    assert.strictEqual(SoloHelper.command(session, '.buff'), false, '.buff stays the bot buff-sale command');
    assert.strictEqual(SoloHelper.command(session, 'hello'), false, 'ordinary chat is not a command');

    const NpcTalkResponse = invoke('GameServer/World/Generics/NpcTalkResponse');
    const originalBoard = SoloHelper.handleBoard;
    const originalChat = SoloBuffer.chatHandle;
    const routed = [];
    SoloHelper.handleBoard = (routedSession, args) => routed.push(['board', ...args]);
    SoloBuffer.chatHandle = (routedSession, args) => routed.push(['chat', ...args]);
    NpcTalkResponse(session, { link: '_bbssolo buff group songs' });
    NpcTalkResponse(session, { link: 'solo-buffer group songs' });
    SoloHelper.handleBoard = originalBoard;
    SoloBuffer.chatHandle = originalChat;
    assert.deepStrictEqual(routed, [['board', 'buff', 'group', 'songs'], ['chat', 'group', 'songs']],
        'board and chat bypasses reach their handlers with their arguments');
}

timers.forEach((timer) => clearTimeout(timer));
global.setTimeout = originalSetTimeout;
fs.rmSync(setsDir, { recursive: true, force: true });
console.log('solo buffer: ok');
