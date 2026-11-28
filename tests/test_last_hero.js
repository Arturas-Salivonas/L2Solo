const assert = require('assert');
const fs = require('fs');
const os = require('os');
const nodePath = require('path');

const storeFile = nodePath.join(os.tmpdir(), `last-hero-test-${process.pid}.json`);
process.env.L2SOLO_LAST_HERO_FILE = storeFile;
try { fs.unlinkSync(storeFile); } catch {}

require('../src/Global');

const Arena = invoke('GameServer/Events/LastHero/LastHeroArena');
const Config = invoke('GameServer/Events/LastHero/LastHeroConfig');
const Fighters = invoke('GameServer/Events/LastHero/LastHeroFighters');
const Store = invoke('GameServer/Events/LastHero/LastHeroStore');
const LastHero = invoke('GameServer/Events/LastHero/LastHero');
const Window = invoke('GameServer/Events/LastHero/LastHeroWindow');
const Chatter = invoke('GameServer/Events/LastHero/LastHeroChatter');
const Buffs = invoke('GameServer/Events/LastHero/LastHeroBuffs');
invoke('GameServer/DataCache').init(); // item names for the prize
const ArenaCombatRules = invoke('GameServer/World/ArenaCombatRules');
const Generics = invoke('GameServer/Actor/Generics');
const PvpFlag = invoke('GameServer/Actor/PvpFlag');
const Companions = invoke('GameServer/Bot/AI/PartyCompanionService');
const World = invoke('GameServer/World/World');
const Database = invoke('Database');
const Response = invoke('GameServer/Network/Response');
const EffectTicker = invoke('GameServer/Effects/EffectTicker');
const BotManager = invoke('GameServer/Bot/BotManager');

// ---------- stand-ins: no world, no database, no client ----------
const teleports = [];
const revives = [];
Generics.teleportTo = (session, actor, coords, options = {}) => {
    teleports.push([actor.fetchName(), { ...coords }]); actor.moveTo(coords); options.onArrival?.(coords); return true;
};
Generics.revive = (session, actor) => { revives.push(actor.fetchName()); actor.revive(); };
Generics.calculateStats = () => {};
EffectTicker.refreshEffects = () => {};
EffectTicker.clearAll = () => {};
EffectTicker.scheduleExpiry = () => {};
const EffectStore = invoke('GameServer/Effects/EffectStore');
EffectStore.list = (actor) => [...(actor?.fakeEffects || [])];
EffectStore.remove = (actor, key) => { actor.fakeEffects = (actor.fakeEffects || []).filter((effect) => effect.key !== key); };
EffectStore.apply = (actor, effect) => { (actor.fakeEffects ||= []).push({ key: effect.key, id: effect.id }); return effect; };
const Quests = invoke('GameServer/Quest/QuestService');
const itemsGiven = [];
Quests.giveItem = async (session, selfId, amount) => { itemsGiven.push([session.actor.fetchName(), selfId, amount]); };
PvpFlag.mark = (session, actor) => actor.setPvpFlag(1);
Companions.membersForLeader = (session) => session.companions || [];
Companions.detachAll = (session) => { session.companions = []; return 1; };
Response.userInfo = () => Buffer.from([0x04]);
const charInfoFor = [];
Response.charInfo = (actor) => { charInfoFor.push(actor?.fetchName?.()); return Buffer.from([0x03]); };
Response.relationChanged = () => Buffer.from([0xce]);
Response.itemsList = () => Buffer.from([0x1b]);
Response.npcHtml = (id, html) => Object.assign(Buffer.from([0x0f]), { html });
Response.abnormalStatusUpdate = { fromActor: () => Buffer.from([0x7f]) };
Response.shortBuffStatusUpdate = { fromActor: () => Buffer.from([0xf4]) };
const adenaWrites = [];
Database.updateItemAmount = (...args) => { adenaWrites.push(args); return Promise.resolve(); };
Database.setItem = (characterId, row) => { adenaWrites.push([characterId, row.selfId, row.amount]); return Promise.resolve({ insertId: 777 }); };

function actorFor(id, name, { level = 20, classId = 33, point = Arena.CENTER } = {}) {
    let at = { ...point }, dead = false, flag = 0, hp = 100;
    const items = [];
    return {
        fetchId: () => id, fetchName: () => name, fetchLevel: () => level, fetchClassId: () => classId,
        fetchLocX: () => at.locX, fetchLocY: () => at.locY, fetchLocZ: () => at.locZ, fetchHead: () => 0,
        fetchHp: () => hp, fetchMaxHp: () => 100, fetchKarma: () => 0, fetchPrivateStoreType: () => 0,
        fetchPvpFlag: () => flag, setPvpFlag(value) { flag = value; },
        isDead: () => dead, state: { fetchDead: () => dead }, kill() { dead = true; hp = 0; }, revive() { dead = false; hp = 100; },
        moveTo(coords) { at = { locX: coords.locX, locY: coords.locY, locZ: coords.locZ }; },
        effects: {}, fillupVitals() { hp = 100; }, statusUpdateVitals() {},
        backpack: {
            fetchItems: () => items,
            fetchTotalAdena: () => items.find((item) => item.fetchSelfId() === 57)?.fetchAmount() || 0,
            insertItem: (itemId, selfId, { amount }) => items.push({ fetchId: () => itemId, fetchSelfId: () => selfId,
                fetchStackable: () => true, fetchAmount: () => amount, setAmount(value) { amount = value; } }),
            updateAmount: (itemId, amount) => items.find((item) => item.fetchId() === itemId).setAmount(amount)
        }
    };
}

function sessionFor(actor, accountId) {
    return { accountId, actor, socket: {}, sent: [], dataSendToMe(packet) { this.sent.push(packet); },
        dataSendToOthers() {}, dataSendToMeAndOthers() {} };
}

const texts = (session) => session.sent.map((packet) => {
    if (packet[0] !== 0x4a && packet[0] !== 0x64) return '';
    return packet.toString('ucs2', 1);
}).join('\n');

let botSeq = 0;
function bot(level = 20) {
    botSeq += 1;
    const actor = actorFor(2120000000 + botSeq, `Bot${botSeq}`, { level });
    return { candidate: { name: `Bot${botSeq}`, level, state: { characterId: 268400000 + botSeq } }, actor };
}

let bench = [];
const realPick = Fighters.pick;
Fighters.pick = (count) => bench.slice(0, count).map((entry) => entry.candidate);
Fighters.spawn = async (candidate, point) => {
    const entry = bench.find((item) => item.candidate === candidate);
    entry.actor.moveTo(point);
    const session = sessionFor(entry.actor, `bot_lasthero_${candidate.state.characterId}`);
    return { session, actor: entry.actor, sourceId: candidate.state.characterId, name: candidate.name, classId: 33, level: candidate.level };
};
const removed = [];
Fighters.remove = (session) => removed.push(session.actor.fetchName());
Fighters.buff = () => {};
Fighters.fight = () => false;
Fighters.stop = () => {};
Fighters.say = () => {};
Fighters.social = () => {};

const options = (values) => { global.options.default.LastHero = values; };

(async () => {
    // ---------- the Coliseum ----------
    assert.ok(Arena.SPAWNS.length >= 100, 'room for 100 fighters');
    assert.ok(Arena.SPAWNS.every((point) => Arena.isInside(point.locX, point.locY, point.locZ)), 'every spawn is on the fight floor');
    assert.ok(!Arena.isInside(Arena.EXIT.locX, Arena.EXIT.locY, Arena.EXIT.locZ), 'the gate is outside it');
    assert.ok(!Arena.isInside(147900, 46720, -3408), 'the west gate passage is outside');
    const spread = Arena.spawnPoints(100);
    assert.strictEqual(new Set(spread.map((point) => `${point.locX},${point.locY}`)).size, 100, '100 different spots');

    // ---------- settings ----------
    options({});
    assert.deepStrictEqual(Config.config(), { enabled: true, everyMinutes: 120, registerMinutes: 5, prepareSeconds: 30,
        fightMinutes: 10, fighters: 100, prizeAdena: 10000000, prizeItems: [], botBuffs: 'self', levelGap: 10, winnerChat: true,
        baseBuffs: [1204, 1086, 1085], draftChoices: 10, draftPicks: 3, lockBuffer: false },
        'defaults: bots cast only their own buffs');
    options({ prize: '5,000,000' });
    assert.strictEqual(Config.config().prizeAdena, 5000000, 'the old key prize still works, with commas');
    options({ prizeAdena: '25000000', prizeItems: '3470:2, 729, x:1' });
    assert.strictEqual(Config.config().prizeAdena, 25000000, 'prizeAdena sets the Adena');
    assert.deepStrictEqual(Config.config().prizeItems, [[3470, 2], [729, 1]], 'prizeItems: id:count, a bare id is 1, junk is skipped');
    assert.strictEqual(LastHero.prizeText(Config.config()), '25,000,000 Adena, 2 Gold Bar, Scroll: Enchant Weapon (Grade A) and the Hero aura',
        'the announcement names the whole prize');
    options({ fighters: '500', prepareSeconds: '1', botBuffs: 'SELF', everyMinutes: 'x' });
    const odd = Config.config();
    assert.strictEqual(odd.fighters, 136, 'no more fighters than spawn spots');
    assert.strictEqual(odd.prepareSeconds, 5, 'at least 5 seconds to buff');
    assert.strictEqual(odd.botBuffs, 'self');
    assert.strictEqual(odd.everyMinutes, 120, 'a bad value falls back');

    // ---------- a live event ----------
    options({ fighters: '6', prepareSeconds: '30', prizeAdena: '10000000', winnerChat: 'false' });
    bench = Array.from({ length: 10 }, () => bot());
    const me = actorFor(268480001, 'Arturas', { level: 32, point: { locX: 83400, locY: 147943, locZ: -3404 } });
    const player = sessionFor(me, 'admin');
    me.fakeEffects = [{ key: 'buff:1068', id: 1068 }, { key: 'buff:1040', id: 1040 }];
    player.companions = [{ accountId: 'bot_friend' }];
    World.user = { sessions: [player], revision: 0 };

    assert.strictEqual(LastHero.join(player), null, 'join with no registration open asks for Start now');
    assert.match(LastHero.startNow(player), /starting/);
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    const { run } = LastHero._state();
    assert.ok(run && run.state === 'prepare', 'Start now goes straight to the 30 seconds of buffing');
    assert.strictEqual(run.fighters.length, 6, 'you and 5 bots');
    assert.strictEqual(player.arenaDuelId, LastHero.PLAYER_MARK, 'you carry the arena mark (area skills, no death penalty)');
    assert.deepStrictEqual(player.companions, [], 'your party is broken up');
    assert.ok(Arena.isInsideActor(me), 'you are teleported onto the floor');
    assert.deepStrictEqual(me.fakeEffects.map((effect) => effect.id), [1204, 1086, 1085],
        'your buffs are cancelled, then everyone gets Wind Walk, Haste and Acumen');
    const someBot = run.fighters.find((fighter) => fighter.kind === 'bot').actor;
    assert.strictEqual(someBot.fakeEffects.length, 6, 'a bot gets the same base and 3 random buffs');
    assert.deepStrictEqual(someBot.fakeEffects.slice(0, 3).map((effect) => effect.id), [1204, 1086, 1085]);
    assert.strictEqual(LastHero.buffsLocked(me), false, 'Alt+B stays open by default');
    global.options.default.LastHero = { ...global.options.default.LastHero, lockBuffer: 'true' };
    assert.strictEqual(LastHero.buffsLocked(me), true, 'lockBuffer = true locks the Solo Helper buffer for you');

    // The draft: 10 random buffs, pick 3, the last pick closes the dialog and buffs you.
    const dialog = player.sent.filter((packet) => packet[0] === 0x0f && packet.html?.includes('pick 3 buffs')).at(-1);
    assert.ok(dialog, 'the draft dialog opens when you land');
    const view = LastHero.draftView(player);
    assert.strictEqual(view.choices.length, 10, '10 buffs to choose from');
    const banned = new Set([1204, 1086, 1085, 1282, 1251, 1002, 1004, 268, 275, 276, 366, 277]);
    assert.ok(view.choices.every((buff) => !banned.has(buff.selfId)), 'no base buff and no alternative to one');
    assert.strictEqual(new Set(view.choices.map(Buffs.slot)).size, 10, 'no two choices replace each other');
    assert.ok(dialog.html.includes('bypass last-hero draft 9') && !dialog.html.includes('bypass -h'), 'first picks keep the dialog open');
    assert.ok(Window.chat(player, ['draft', '0']), 'a pick redraws the dialog');
    Window.chat(player, ['draft', '0']);
    assert.deepStrictEqual(LastHero.draftView(player).picked, [], 'a second click puts it back');
    Window.chat(player, ['draft', '4']);
    const two = Window.chat(player, ['draft', '7']);
    assert.ok(two.includes('bypass -h last-hero draft 0') && two.includes('bypass last-hero draft 4'),
        'with one pick left, the others close the dialog; a picked one stays a plain click');
    assert.strictEqual(Window.chat(player, ['draft', '9']), null, 'the last pick sends no dialog back');
    const chosen = [4, 7, 9].map((index) => view.choices[index].selfId);
    assert.deepStrictEqual(me.fakeEffects.map((effect) => effect.id).slice(3), chosen, 'you are buffed with your 3 picks');
    assert.ok(texts(player).includes('Buffed:'), 'and told');
    assert.strictEqual(Window.chat(player, ['draft', '1']), null, 'a late click changes nothing');
    assert.strictEqual(me.fakeEffects.length, 6);
    assert.ok(texts(player).includes('all buffs are cancelled'), 'and you are told');
    assert.ok(texts(player).includes('no parties') || texts(player).includes('No parties'), 'you are told the rules');
    assert.ok(LastHero.partyBlocked(player), 'no party invites while in it');

    const [b1, b2, b3, b4, b5] = run.fighters.filter((fighter) => fighter.kind === 'bot').map((fighter) => fighter.actor);
    assert.strictEqual(ArenaCombatRules.canInteract(b1, me), false, 'nobody fights while buffing');
    assert.strictEqual(ArenaCombatRules.suppressConsequences(b1, me), true, 'and nothing has consequences');
    const outsider = actorFor(268400999, 'Outsider');
    assert.strictEqual(ArenaCombatRules.canInteract(outsider, me), false, 'outsiders cannot touch a fighter');

    // The countdown says only what fits in the buffing time.
    run.prepareMs = 15000; // as with prepareSeconds = 15
    run.prepareEndsAt = Date.now() + 9000;
    LastHero._tick();
    assert.ok(texts(player).includes('starts in 10 seconds'), 'the 10 second mark');
    assert.ok(!texts(player).includes('starts in 20 seconds'), 'never a mark longer than the buffing time');

    // Walking out while buffing puts you back.
    me.moveTo(Arena.EXIT);
    LastHero._tick();
    assert.ok(Arena.isInsideActor(me), 'leaving the floor while buffing teleports you back');

    run.prepareEndsAt = Date.now() - 1;
    LastHero._tick();
    assert.strictEqual(run.state, 'fight', 'then the fight starts');
    assert.ok(texts(player).includes('FIGHT'), 'with an announcement');
    assert.strictEqual(me.fetchPvpFlag(), 1, 'everyone is flagged (plain-click attacks)');
    assert.strictEqual(ArenaCombatRules.canInteract(b1, me), true, 'a bot may hit you');
    assert.strictEqual(ArenaCombatRules.canInteract(me, b2), true, 'you may hit a bot');
    assert.strictEqual(ArenaCombatRules.canInteract(b1, b2), true, 'bots fight each other');
    assert.strictEqual(ArenaCombatRules.canInteract(outsider, b1), false, 'outsiders still cannot');
    const summon = { fetchKind: () => 'summon', fetchOwnerId: () => me.fetchId() };
    assert.strictEqual(ArenaCombatRules.canInteract(summon, b1), true, 'your servitor fights for you');
    assert.strictEqual(ArenaCombatRules.canInteract(summon, me), false, 'but never against you');

    // You kill one bot: it is out, you get the kill.
    b1.kill();
    assert.strictEqual(LastHero.onDeath(null, b1, me), true, 'a fall in the Coliseum is an elimination');
    assert.strictEqual(run.fighters.find((fighter) => fighter.actor === me).kills, 1, 'the kill is yours');
    assert.ok(texts(player).includes('You defeated Bot'), 'and you are told');
    assert.strictEqual(ArenaCombatRules.canInteract(me, b1), false, 'a fallen fighter is out of the fight');
    assert.strictEqual(LastHero.onDeath(null, outsider, me), false, 'other deaths are not the event\'s');

    // A bot gets you: you are out, revived at the gate, sent home at the end.
    me.kill();
    LastHero.onDeath(player, me, b2);
    const mine = run.fighters.find((fighter) => fighter.actor === me);
    assert.strictEqual(mine.alive, false);
    assert.strictEqual(mine.place, 5, 'you placed #5 of 6');
    assert.strictEqual(player.arenaDuelId, undefined, 'the arena mark is gone');
    assert.strictEqual(me.fetchPvpFlag(), 0, 'and your flag');
    assert.ok(texts(player).includes('placed #5 of 6 with 1 kills'), 'you are told your place');
    assert.deepStrictEqual(LastHero.restartPoint(player), Arena.EXIT, '"to village" stands you up at the gate');
    assert.strictEqual(LastHero.isParticipant(me), false);

    // The rest fall; the last bot standing wins.
    for (const actor of [b2, b3, b4]) { actor.kill(); LastHero.onDeath(null, actor, null); }
    charInfoFor.length = 0;
    LastHero._tick();
    assert.ok(![b1, b2, b3, b4].some((actor) => charInfoFor.includes(actor.fetchName())),
        'a fallen bot is never drawn again at the end (it would stand up on the floor)');
    assert.strictEqual(b2.fetchPvpFlag(), 0, 'its flag is gone all the same');
    assert.ok(texts(player).includes('You go back where you were in 10 seconds'), 'you are told when you go back');
    assert.ok(texts(player).includes('is the last one standing with 0 kills'), 'the winner line says the kills');
    const said = texts(player);
    const list = said.slice(said.indexOf('Last Hero - most kills:'));
    assert.ok(said.includes('Last Hero - most kills:'), 'then the most kills, as a list');
    assert.ok(/1\. Bot\d+ - 1 kill/.test(list) && /2\. Arturas - 1 kill/.test(list),
        'one per row: same kills, the one who lasted longer first; nobody without a kill');
    assert.ok(!/3\. Bot/.test(list), 'only fighters with kills are listed');
    assert.deepStrictEqual(Store.read().history[0].topKills.map((entry) => entry.kills), [1, 1], 'and the list is kept');
    assert.strictEqual(run.state, 'ending', 'one left: the fight is over');
    const store = Store.read();
    assert.strictEqual(store.hero.name, b5.fetchName(), 'the last one standing is the Last Hero');
    assert.strictEqual(LastHero.heroAura(b5), true, 'and glows');
    assert.strictEqual(LastHero.heroAura(me), false, 'you do not');
    assert.ok(texts(player).includes(`${b5.fetchName()} (Lv 20`) && texts(player).includes('10,000,000 Adena and the Hero aura'), 'the winner is announced');
    assert.deepStrictEqual(store.prizes[run.fighters.find((fighter) => fighter.actor === b5).sourceId], { adena: 10000000, items: [] },
        'a bot winner is owed its prize');
    assert.deepStrictEqual(store.history[0].you, { name: 'Arturas', place: 5, kills: 1 }, 'your result is kept');
    assert.ok(store.nextAt > Date.now() + 119 * 60000, 'the next one is in two hours');

    const board = Window.boardBody(player);
    assert.ok(board.includes('Return now'), 'out: the window offers Return now');
    assert.ok(board.includes('Most kills - last event') && board.includes('Arturas'), 'the window lists the most kills');
    assert.ok(board.includes(b5.fetchName()) && board.includes('#5, 1 kills'), 'the window shows the hero and your result');

    run.endsAt = Date.now() - 1;
    LastHero._tick();
    assert.strictEqual(LastHero._state().run, null, 'ten seconds later it is over');
    assert.deepStrictEqual(teleports.at(-1), ['Arturas', { locX: 83400, locY: 147943, locZ: -3404, head: 0 }], 'you go back where you were');
    assert.ok(!me.isDead(), 'alive');
    assert.deepStrictEqual(me.fakeEffects.map((effect) => effect.id), [1068, 1040], 'with the buffs you came in with, not the event ones');
    assert.strictEqual(LastHero.buffsLocked(me), false, 'and the buffer is yours again');
    assert.ok(removed.length >= 5, 'the bot copies are removed');
    assert.strictEqual(ArenaCombatRules.canInteract(me, outsider), true, 'and the normal rules are back');

    // ---------- you win ----------
    options({ fighters: '3', prepareSeconds: '30', prizeAdena: '10000000', prizeItems: '3470:2', winnerChat: 'false' });
    LastHero.startNow(player);
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    const second = LastHero._state().run;
    assert.ok(Window.boardBody(player).includes('Pick buffs'), 'the window can reopen the draft');
    second.prepareEndsAt = Date.now() - 1;
    LastHero._tick();
    assert.ok(texts(player).includes('Time is up, picked for you'), 'no picks by the fight: picked for you');
    assert.strictEqual(LastHero.draftView(player).picked.length, 3);
    for (const fighter of second.fighters.filter((entry) => entry.kind === 'bot')) { fighter.actor.kill(); LastHero.onDeath(null, fighter.actor, me); }
    LastHero._tick();
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    assert.strictEqual(Store.read().hero.name, 'Arturas', 'you are the Last Hero');
    assert.strictEqual(LastHero.heroAura(me), true, 'you glow');
    assert.strictEqual(me.backpack.fetchTotalAdena(), 10000000, 'and get 10,000,000 Adena');
    assert.deepStrictEqual(itemsGiven.at(-1), ['Arturas', 3470, 2], 'and the prize items');
    assert.ok(texts(player).includes('Gold Bar'), 'named in the announcement');
    assert.strictEqual(LastHero.heroAura(b5), false, 'the old hero stops glowing');
    second.endsAt = Date.now() - 1;
    LastHero._tick();

    // ---------- registration on the schedule ----------
    options({ fighters: '4', everyMinutes: '120', registerMinutes: '5' });
    Store.update((state) => { state.nextAt = Date.now() + 4 * 60000; });
    LastHero.schedulerTick();
    assert.ok(LastHero._state().registration, 'five minutes before, registration opens');
    assert.ok(texts(player).includes('registration is open'), 'with an announcement');
    assert.match(LastHero.join(player), /You are in/);
    assert.ok(Window.boardBody(player).includes('Leave queue'), 'the window lets you leave the queue');
    assert.match(LastHero.leaveQueue(player), /left/);
    assert.match(LastHero.join(player), /You are in/);

    // ---------- nobody joined: a background event ----------
    LastHero.leaveQueue(player);
    LastHero._state().registration.startsAt = Date.now() - 1;
    LastHero.schedulerTick();
    await new Promise((resolve) => setImmediate(resolve));
    const background = LastHero._state().run;
    assert.strictEqual(background?.mode, 'simulated', 'nobody joined: it runs in the background');
    assert.ok(texts(player).includes('Last Hero has begun at the Coliseum'));
    const before = texts(player).length;
    background.startedAt = Date.now() - 200000;
    LastHero.schedulerTick();
    assert.strictEqual(LastHero._state().run, null, 'it ends on its own');
    const drawn = Store.read().hero;
    assert.ok(drawn && drawn.name.startsWith('Bot'), 'a bot wins it');
    assert.ok(texts(player).slice(before).includes('Last Hero - most kills:'), 'a background event has its most kills too');
    assert.ok(Store.read().history[0].topKills.length >= 2 && Store.read().history[0].topKills[0].kills >= Store.read().history[0].topKills.at(-1).kills,
        'sorted, most first');
    assert.ok(Store.read().prizes[drawn.id]?.adena >= 10000000, 'and is owed the prize');

    // The prize lands when that bot is active.
    const hot = actorFor(drawn.id, drawn.name);
    BotManager.sessions = [sessionFor(hot, `bot_${drawn.name}`)];
    LastHero.payBotPrizes();
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(hot.backpack.fetchTotalAdena() >= 10000000, 'paid into its bag');
    assert.strictEqual(Store.read().prizes[drawn.id], undefined, 'and no longer owed');
    assert.strictEqual(LastHero.heroAura(hot), true, 'the real bot glows');

    // ---------- the window ----------
    const chat = Window.chat(player, []);
    assert.ok(chat.length < 8192, 'the chat window fits');
    assert.ok(chat.includes('last-hero start'), 'Start now from the chat window');
    assert.strictEqual(Window.command(player, '.lasthero'), true, '.lasthero opens it');
    assert.strictEqual(Window.command(player, '.lastheros'), false);
    const page = Window.boardBody(player, { message: 'hello' });
    assert.ok(page.length < 9000, 'the board body leaves room for the Solo Helper tabs');
    assert.ok(page.includes('bypass _bbssolo hero start'), 'board Start now');
    assert.ok(!page.includes('bgcolor'), 'no grey panels on the board');
    assert.strictEqual(Window.short(10000000), '10kk');
    assert.strictEqual(Window.short(1500000), '1.5kk');

    // ---------- bots from every class ----------
    {
        const BotAvailability = invoke('GameServer/Bot/AI/BotAvailability');
        const savedCatalog = BotAvailability.catalogForPlayer;
        const cold = (id, classId, level) => ({ name: `C${id}`, level, phase: 'cold', state: { characterId: id, stats: { classId } } });
        const catalog = [
            ...Array.from({ length: 30 }, (_, i) => cold(1000 + i, 35, 24)),   // assassins, the most common
            ...Array.from({ length: 20 }, (_, i) => cold(2000 + i, 19, 25)),   // elven knights
            cold(3001, 39, 23), cold(3002, 29, 22), cold(3003, 50, 26),          // a dark wizard, an oracle, a shaman
            cold(4001, 42, 70), cold(4002, 1, 5)                                 // too far, too low
        ];
        BotAvailability.catalogForPlayer = () => catalog;
        try {
            const picked = realPick(8, 25, { levelGap: 10, random: () => 0.5 });
            const classes = picked.map((candidate) => candidate.state.stats.classId);
            assert.strictEqual(picked.length, 8);
            for (const classId of [35, 19, 39, 29, 50]) assert.ok(classes.includes(classId), `class ${classId} gets a place`);
            assert.ok(!classes.includes(42) && !classes.includes(1), 'nobody from far outside your levels');
        } finally {
            BotAvailability.catalogForPlayer = savedCatalog;
        }
    }
    {
        let seed = 7;
        const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
        const fallen = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, name: `Fallen${i}` }));
        const world = Array.from({ length: 30 }, (_, i) => ({ id: i + 100, name: `Far${i}` }));
        const lines = Chatter.script({ winner: { name: 'Bogner', level: 20, kind: 'bot', sourceId: 9 }, fallen, world, prize: '10kk', random });
        assert.ok(lines.length >= 24, `a couple of dozen lines (${lines.length})`);
        assert.ok(lines.some((line) => line.text.includes('Bogner')), 'they name the winner');
        for (const channel of [0, 1, 8]) assert.ok(lines.some((line) => line.channel === channel), `channel ${channel} is used`);
        assert.ok(lines.some((line) => line.speaker.name === 'Bogner'), 'the bot winner answers');
        assert.strictEqual(new Set(lines.map((line) => line.text)).size, lines.length - 0, 'no line twice');
        const counts = new Map();
        lines.forEach((line) => counts.set(line.speaker.name, (counts.get(line.speaker.name) || 0) + 1));
        assert.ok([...counts.values()].every((n) => n <= 2), 'nobody talks more than twice');
        const mine = Chatter.script({ winner: { name: 'Arturas', level: 32, kind: 'player' }, fallen, world, random });
        assert.ok(!mine.some((line) => line.speaker.name === 'Arturas'), 'you are not made to speak');
        const background = Chatter.script({ winner: { name: 'Bogner', level: 20, kind: 'bot' }, fallen: [], world, live: false, count: 10, random });
        assert.ok(background.length === 10 && background.every((line) => line.channel !== 0), 'a background event: shout and trade only');
    }

    // ---------- turned off ----------
    options({ enabled: 'false' });
    assert.match(LastHero.startNow(player), /turned off/);
    assert.ok(!Window.actions(LastHero.status(player)).length, 'no buttons when off');

    LastHero._reset();
    try { fs.unlinkSync(storeFile); } catch {}
    console.log('last hero: ok');
})().catch((error) => {
    console.error(error);
    LastHero._reset();
    process.exit(1);
});
