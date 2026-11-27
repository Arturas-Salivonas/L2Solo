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
Generics.teleportTo = (session, actor, coords) => { teleports.push([actor.fetchName(), { ...coords }]); actor.moveTo(coords); return true; };
Generics.revive = (session, actor) => { revives.push(actor.fetchName()); actor.revive(); };
Generics.calculateStats = () => {};
EffectTicker.refreshEffects = () => {};
PvpFlag.mark = (session, actor) => actor.setPvpFlag(1);
Companions.membersForLeader = (session) => session.companions || [];
Companions.detachAll = (session) => { session.companions = []; return 1; };
Response.userInfo = () => Buffer.from([0x04]);
Response.charInfo = () => Buffer.from([0x03]);
Response.relationChanged = () => Buffer.from([0xce]);
Response.itemsList = () => Buffer.from([0x1b]);
Response.npcHtml = (id, html) => Object.assign(Buffer.from([0x0f]), { html });
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
        fightMinutes: 10, fighters: 100, prize: 10000000, botBuffs: 'full', levelGap: 10 }, 'defaults');
    options({ fighters: '500', prepareSeconds: '1', botBuffs: 'SELF', everyMinutes: 'x' });
    const odd = Config.config();
    assert.strictEqual(odd.fighters, 136, 'no more fighters than spawn spots');
    assert.strictEqual(odd.prepareSeconds, 5, 'at least 5 seconds to buff');
    assert.strictEqual(odd.botBuffs, 'self');
    assert.strictEqual(odd.everyMinutes, 120, 'a bad value falls back');

    // ---------- a live event ----------
    options({ fighters: '6', prepareSeconds: '30', prize: '10000000' });
    bench = Array.from({ length: 10 }, () => bot());
    const me = actorFor(268480001, 'Arturas', { level: 32, point: { locX: 83400, locY: 147943, locZ: -3404 } });
    const player = sessionFor(me, 'admin');
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
    LastHero._tick();
    assert.strictEqual(run.state, 'ending', 'one left: the fight is over');
    const store = Store.read();
    assert.strictEqual(store.hero.name, b5.fetchName(), 'the last one standing is the Last Hero');
    assert.strictEqual(LastHero.heroAura(b5), true, 'and glows');
    assert.strictEqual(LastHero.heroAura(me), false, 'you do not');
    assert.ok(texts(player).includes(`${b5.fetchName()} (Lv 20`) && texts(player).includes('10,000,000 Adena and the Hero aura'), 'the winner is announced');
    assert.strictEqual(store.prizes[run.fighters.find((fighter) => fighter.actor === b5).sourceId], 10000000, 'a bot winner is owed its prize');
    assert.deepStrictEqual(store.history[0].you, { name: 'Arturas', place: 5, kills: 1 }, 'your result is kept');
    assert.ok(store.nextAt > Date.now() + 119 * 60000, 'the next one is in two hours');

    const board = Window.boardBody(player);
    assert.ok(board.includes('Return now'), 'out: the window offers Return now');
    assert.ok(board.includes(b5.fetchName()) && board.includes('You: #5, 1 kills'), 'the window shows the hero and your result');

    run.endsAt = Date.now() - 1;
    LastHero._tick();
    assert.strictEqual(LastHero._state().run, null, 'ten seconds later it is over');
    assert.deepStrictEqual(teleports.at(-1), ['Arturas', { locX: 83400, locY: 147943, locZ: -3404, head: 0 }], 'you go back where you were');
    assert.ok(!me.isDead(), 'alive');
    assert.ok(removed.length >= 5, 'the bot copies are removed');
    assert.strictEqual(ArenaCombatRules.canInteract(me, outsider), true, 'and the normal rules are back');

    // ---------- you win ----------
    options({ fighters: '3', prepareSeconds: '30', prize: '10000000' });
    LastHero.startNow(player);
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    const second = LastHero._state().run;
    second.prepareEndsAt = Date.now() - 1;
    LastHero._tick();
    for (const fighter of second.fighters.filter((entry) => entry.kind === 'bot')) { fighter.actor.kill(); LastHero.onDeath(null, fighter.actor, me); }
    LastHero._tick();
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    assert.strictEqual(Store.read().hero.name, 'Arturas', 'you are the Last Hero');
    assert.strictEqual(LastHero.heroAura(me), true, 'you glow');
    assert.strictEqual(me.backpack.fetchTotalAdena(), 10000000, 'and get 10,000,000 Adena');
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
    background.startedAt = Date.now() - 200000;
    LastHero.schedulerTick();
    assert.strictEqual(LastHero._state().run, null, 'it ends on its own');
    const drawn = Store.read().hero;
    assert.ok(drawn && drawn.name.startsWith('Bot'), 'a bot wins it');
    assert.ok(Store.read().prizes[drawn.id] >= 10000000, 'and is owed the prize');

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
    assert.strictEqual(Window.short(10000000), '10kk');
    assert.strictEqual(Window.short(1500000), '1.5kk');

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
