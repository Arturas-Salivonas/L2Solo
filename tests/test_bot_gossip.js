'use strict';
const assert = require('assert');

require('../src/Global');

// Gossip (Bot/AI/BotGossip): what a player does to bots spreads among bots in town.

const Gossip = invoke('GameServer/Bot/AI/BotGossip');
const Memory = invoke('GameServer/Social/InteractionMemoryRuntime');
const Queries = require('../src/GameServer/World/ActorSpatialQueries');
const TendencyRoll = require('../src/GameServer/Bot/AI/TendencyRoll');
const Response = invoke('GameServer/Network/Response');
const Budget = invoke('GameServer/Bot/AI/BotChatterBudget');
const Config = invoke('GameServer/Bot/Population/PopulationConfig');
const Policy = invoke('GameServer/Social/InteractionMemoryPolicy');

const saved = { enqueue: Memory.events.enqueue, nearest: Queries.nearestPlayer, near: Queries.near, roll: TendencyRoll.roll,
    speak: Response.speak, peace: utils.isInPeaceZone, enabled: Config.gossipEnabled };
const said = [], episodes = [];
let peers = [], rollValue = 0, nextId = 2000700;

function character(name, bot = true) {
    const actor = { id: ++nextId, name, fetchId() { return this.id; }, fetchName() { return this.name; }, fetchLocX: () => 0, fetchLocY: () => 0,
        isDead: () => false };
    actor.session = { accountId: bot ? `bot_pop_${actor.id}` : 'player1', actor, plan: 'hunting',
        dataSendToOthers(packet) { said.push([name, packet.text]); } };
    return actor;
}

try {
    Memory.events.enqueue = (event) => { episodes.push(event); return true; };
    Queries.nearestPlayer = () => ({ session: { accountId: 'player1' }, distance: 500 });
    Queries.near = () => peers.map((actor) => actor.session);
    TendencyRoll.roll = () => rollValue;
    Response.speak = (actor, { text }) => ({ text });
    utils.isInPeaceZone = () => true;
    Config.gossipEnabled = true;
    Gossip.reset(); Budget.reset();

    const player = character('Arturas', false);
    const victim = character('Pingu');
    victim.session.currentSpot = { name: 'Ruins of Agony - Undead' };
    const otherBot = character('BotKiller');
    assert.strictEqual(Gossip.killed({ attacker: otherBot, victim, outcome: 'pk' }), null, 'only a real player is talked about');
    const piece = Gossip.killed({ attacker: player, victim, outcome: 'pk' });
    assert.strictEqual(piece.type, 'pk');
    assert.strictEqual(piece.place, 'Ruins of Agony', 'where it happened, short');

    // Telling: in town, with the player around, to the bots beside it.
    const a = character('Listener1'), b = character('Listener2');
    peers = [a, b];
    const now = 5000000;
    assert.strictEqual(Gossip.tick(victim.session, victim, now), true, 'the victim tells the bots around it');
    assert.ok(Gossip.LINES.pk('Arturas', 'Ruins of Agony').includes(said[0][1]), `out loud: ${said[0][1]}`);
    assert.deepStrictEqual(episodes.map((e) => [e.sourceId, e.targetId, e.type]),
        [[a.id, player.id, 'heard_pk'], [b.id, player.id, 'heard_pk']], 'each listener now holds it against the player');
    assert.ok(episodes.every((e) => e.key.length <= 96 && /^[a-zA-Z0-9:_.-]+$/.test(e.key)), 'memory keys are valid');
    assert.strictEqual(Gossip.news.get(a.id)?.[0]?.hops, 1, 'a listener may pass it on');
    // Once per TELL_MS, each listener once.
    assert.strictEqual(Gossip.tick(victim.session, victim, now + 20000), false, 'not again so soon');
    assert.strictEqual(Gossip.tick(victim.session, victim, now + Gossip.TELL_MS + 20000), false, 'everyone around already heard it');
    // Second-hand, to a new bot: "heard ...", and the listener's memory takes it once an hour.
    const c = character('Newcomer');
    peers = [c, victim];
    episodes.length = 0; said.length = 0; Budget.reset();
    assert.strictEqual(Gossip.tick(a.session, a, now + 30000), true, 'the listener retells it');
    assert.ok(Gossip.LINES.pk_heard('Arturas', 'Ruins of Agony').includes(said[0][1]), 'as something it heard');
    assert.deepStrictEqual(episodes.map((e) => e.sourceId), [c.id], 'the newcomer hears it; the victim already knew');
    // Not in town and not resting: quiet.
    utils.isInPeaceZone = () => false;
    const field = character('FieldBot');
    Gossip.killed({ attacker: player, victim: field, outcome: 'pk' });
    peers = [character('X')];
    assert.strictEqual(Gossip.tick(field.session, field, now), false, 'out hunting, it keeps it to itself');
    field.session.plan = 'resting';
    assert.strictEqual(Gossip.tick(field.session, field, now + 20000), true, 'resting, it talks');
    utils.isInPeaceZone = () => true;

    // Kindness spreads too; a fair kill is told but changes no feeling.
    Gossip.reset(); Budget.reset(); episodes.length = 0; said.length = 0;
    const healed = character('Healed');
    assert.ok(Gossip.helped(player, healed, 'heal', now), 'a heal is news');
    assert.strictEqual(Gossip.helped(player, healed, 'heal', now + 1000), null, 'once per 10 minutes per bot');
    peers = [a];
    Gossip.tick(healed.session, healed, now);
    assert.ok(Gossip.LINES.kind_heal('Arturas').includes(said[0][1]), 'kind words');
    assert.deepStrictEqual(episodes.map((e) => e.type), ['heard_kind'], 'and a kinder memory of the player');
    const beaten = character('Beaten');
    Gossip.killed({ attacker: player, victim: beaten, outcome: 'pvp' });
    episodes.length = 0; peers = [b];
    Budget.reset();
    Gossip.tick(beaten.session, beaten, now);
    assert.deepStrictEqual(episodes, [], 'a fair fight is talked about, not held against the player');

    Config.gossipEnabled = false;
    assert.strictEqual(Gossip.killed({ attacker: player, victim, outcome: 'pk' }), null, 'gossipEnabled = false');
} finally {
    Memory.events.enqueue = saved.enqueue; Queries.nearestPlayer = saved.nearest; Queries.near = saved.near; TendencyRoll.roll = saved.roll;
    Response.speak = saved.speak; utils.isInPeaceZone = saved.peace; Config.gossipEnabled = saved.enabled;
    Gossip.reset(); Budget.reset();
}

// The memory episodes themselves (InteractionMemoryPolicy).
{
    const at = Date.now();
    const relation = (type) => Policy.apply(Policy.empty(1), { key: `g-${type}`, sourceId: 1, targetId: 2, type, at,
        playedHours: 10, hours: 0.01, traits: { loyalty: 0.5, resilience: 0.5 } }, at).snapshot.relations[0];
    const pk = relation('heard_pk');
    assert.ok(pk.hostility > 0 && pk.fear > 0 && pk.trust < 0, 'heard_pk: wary and afraid of the player');
    const kind = relation('heard_kind');
    assert.ok(kind.trust > 0 && kind.hostility === 0, 'heard_kind: a little trust');
    assert.ok(relation('remembered_foe').hostility >= 10, 'remembered_foe: a grudge over the wipe');
    assert.ok(relation('remembered_friend').trust >= 5, 'remembered_friend: trust over the wipe');
}

console.log('Bot gossip checks passed');
