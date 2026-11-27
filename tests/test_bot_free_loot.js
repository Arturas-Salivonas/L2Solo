'use strict';
const assert = require('assert');

require('../src/Global');

// Free loot (Bot/AI/BotFreeLoot, World/GroundItems): bots take items that are nobody's any
// more, by persona, one bot an item, through the native pickup; and the cell index it reads.

const GroundItems = require('../src/GameServer/World/GroundItems');
const FreeLoot = invoke('GameServer/Bot/AI/BotFreeLoot');
const TendencyRoll = require('../src/GameServer/Bot/AI/TendencyRoll');
const World = invoke('GameServer/World/World');
const Party = invoke('GameServer/Bot/AI/PartyCompanionService');
const Awareness = invoke('GameServer/Bot/AI/PartyAwareness');
const Automation = invoke('GameServer/Automation');
const Generics = invoke(path.actor);
const Config = invoke('GameServer/Bot/Population/PopulationConfig');

const item = (id, x, y, { selfId = 1060, owner = 0 } = {}) => ({ id, x, y, selfId, partyLootLeaderId: owner,
    fetchId: () => id, fetchSelfId: () => selfId, fetchLocX: () => x, fetchLocY: () => y, fetchLocZ: () => 0 });

// ---------- the cell index ----------
{
    const items = { spawns: [] };
    const a = item(1, 100, 100), b = item(2, 1100, 100), c = item(3, 5000, 5000);
    [a, b, c].forEach(entry => GroundItems.put(items, entry, 1000));
    assert.strictEqual(a.groundSince, 1000, 'an item remembers when it fell');
    assert.deepStrictEqual(GroundItems.near(items, { locX: 600, locY: 100 }, 600).map(entry => entry.id).sort(), [1, 2],
        'near reads every cell the radius touches');
    assert.deepStrictEqual(GroundItems.near(items, { locX: 600, locY: 100 }, 400).map(entry => entry.id), [],
        'and only within the radius');
    GroundItems.take(items, items.spawns.indexOf(b));
    assert.deepStrictEqual(GroundItems.near(items, { locX: 1100, locY: 100 }, 50), [], 'a taken item leaves its cell');
    assert.strictEqual(items.byCell.has('1:0'), false, 'an empty cell is dropped');
}

// ---------- the rules ----------
const savedRoll = TendencyRoll.roll;
const savedOwner = Party.groundLootOwnerKey;
Party.groundLootOwnerKey = session => session.lootKey || 0;
{
    const me = { lootKey: 501 };
    const now = 100000;
    const discard = { ...item(10, 0, 0), groundSince: now - 1000 };
    assert(!FreeLoot.free(discard, me, now), 'a fresh discard waits out its grace');
    assert(FreeLoot.free({ ...discard, groundSince: now - FreeLoot.GRACE_MS }, me, now), 'then it is anyone\'s');
    const theirs = { ...item(11, 0, 0, { owner: 777 }), groundSince: now - 5000 };
    assert(!FreeLoot.free(theirs, me, now), 'another party\'s drop is protected');
    assert(FreeLoot.free({ ...theirs, groundSince: now - FreeLoot.PROTECT_MS }, me, now), 'until 15 seconds pass');
    const mine = { ...item(12, 0, 0, { owner: 501 }), groundSince: now - 60000 };
    assert(!FreeLoot.free(mine, me, now), 'its own party\'s drop is its party loot\'s, never free loot');

    const greedy = { traits: { ambition: 0.9, empathy: 0.2 } }, kind = { traits: { ambition: 0.4, empathy: 0.9 } };
    assert(FreeLoot.interest(greedy, item(1, 0, 0)) > FreeLoot.interest(kind, item(1, 0, 0)), 'greed draws, kindness holds back');
    assert(FreeLoot.interest(kind, item(1, 0, 0, { selfId: 57 })) > FreeLoot.interest(kind, item(1, 0, 0)), 'Adena tempts more');
    assert(FreeLoot.interest(kind, item(1, 0, 0)) > 0, 'nobody is above it entirely');
}

// ---------- a bot goes and takes it ----------
const saved = { items: World.items, attacking: Awareness.npcsAttackingActor, run: Automation.pickupRun,
    exec: Generics.pickupExec, stop: Generics.stopAutomation, can: Party.canPickupLoot, enabled: Config.freeLootEnabled };
const execs = [];
let attackers = 0;
try {
    Awareness.npcsAttackingActor = () => new Array(attackers).fill({});
    Automation.pickupRun = () => ({ inReach: true });
    Generics.stopAutomation = () => {};
    Party.canPickupLoot = () => true;
    Generics.pickupExec = (session, actor, data, done) => execs.push({ session, id: data.id, done });
    TendencyRoll.roll = () => 0;
    const bot = (id, x = 0) => {
        const actor = { id, x, fetchId: () => id, fetchLocX: () => actor.x, fetchLocY: () => 0, fetchLocZ: () => 0,
            isDead: () => false, state: { fetchHits: () => false, fetchCasts: () => false, fetchPickinUp: () => false,
                fetchSeated: () => false, setPickinUp() {} }, automation: { abortAll() {} } };
        return { actor, accountId: `bot_${id}`, plan: 'shopping', persona: { traits: { ambition: 0.6, empathy: 0.5 } } };
    };
    const now = Date.now();
    World.items = { spawns: [], nextId: 1 };
    const drop = item(40, 300, 0, { selfId: 57 });
    GroundItems.put(World.items, drop, now - 10000);
    const first = bot(9001), second = bot(9002, 50);

    assert.strictEqual(FreeLoot.tick(first, first.actor, now), true, 'a town bot goes for free Adena');
    assert.strictEqual(execs.length, 1);
    assert.strictEqual(execs[0].id, 40, 'through the native pickup');
    assert.strictEqual(FreeLoot.tick(second, second.actor, now), false, 'a second bot leaves an item someone is going for');
    assert.strictEqual(FreeLoot.tick(first, first.actor, now + 500), true, 'the pickup owns the bot\'s tick');
    World.items.spawns.splice(0, 1); // PickupItem's claim took it
    execs[0].done();
    assert(!first.freeLoot && !drop.freeLootClaim, 'done: the claim is released');

    // Not interested, busy, or switched off: nothing.
    const other = item(41, 200, 0);
    GroundItems.put(World.items, other, now - 10000);
    TendencyRoll.roll = () => 0.99;
    second.freeLootScanAt = 0;
    assert.strictEqual(FreeLoot.tick(second, second.actor, now + 5000), false, 'a roll above its interest: it walks on');
    TendencyRoll.roll = () => 0;
    second.freeLootScanAt = 0; second.plan = 'merchant';
    assert.strictEqual(FreeLoot.tick(second, second.actor, now + 5000), false, 'a merchant at its store stays');
    second.freeLootScanAt = 0; second.plan = 'hunting'; attackers = 1;
    assert.strictEqual(FreeLoot.tick(second, second.actor, now + 5000), false, 'a bot with a monster on it fights first');
    attackers = 0; second.freeLootScanAt = 0; second.partyCompanion = true;
    assert.strictEqual(FreeLoot.tick(second, second.actor, now + 5000), false, 'a player\'s companion follows its own rules');
    delete second.partyCompanion; second.freeLootScanAt = 0; Config.freeLootEnabled = false;
    assert.strictEqual(FreeLoot.tick(second, second.actor, now + 5000), false, 'freeLootEnabled = false: nothing');
    Config.freeLootEnabled = true; second.freeLootScanAt = 0;
    assert.strictEqual(FreeLoot.tick(second, second.actor, now + 5000), true, 'otherwise it goes');

    // A monster on it mid-run ends the pickup and the bot leaves that item for good.
    attackers = 1;
    assert.strictEqual(FreeLoot.tick(second, second.actor, now + 6000), false, 'a fight ends the pickup');
    assert(!second.freeLoot && !other.freeLootClaim && second.freeLootSkipped.has(41), 'and the item is left');
} finally {
    World.items = saved.items; Awareness.npcsAttackingActor = saved.attacking; Automation.pickupRun = saved.run;
    Generics.pickupExec = saved.exec; Generics.stopAutomation = saved.stop; Party.canPickupLoot = saved.can;
    Config.freeLootEnabled = saved.enabled; TendencyRoll.roll = savedRoll; Party.groundLootOwnerKey = savedOwner;
}

console.log('Bot free loot checks passed');
