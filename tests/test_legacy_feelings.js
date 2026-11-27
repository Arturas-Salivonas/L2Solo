'use strict';
const assert = require('assert');

require('../src/Global');

// Feelings across a wipe (Bot/Legacy/LegacyFeelings): a returning bot remembers how it felt about
// a player of the same name.

const Feelings = invoke('GameServer/Bot/Legacy/LegacyFeelings');
const Memory = invoke('GameServer/Social/InteractionMemoryRuntime');
const Queries = require('../src/GameServer/World/ActorSpatialQueries');
const Response = invoke('GameServer/Network/Response');
const Budget = invoke('GameServer/Bot/AI/BotChatterBudget');
const Config = invoke('GameServer/Bot/Population/PopulationConfig');

// ---------- what a saved feeling becomes ----------
assert.deepStrictEqual(Feelings.episodesFor({ hostility: 30 }), ['remembered_foe', 'remembered_foe'], 'a deep grudge, twice');
assert.deepStrictEqual(Feelings.episodesFor({ hostility: 12 }), ['remembered_foe'], 'a grudge');
assert.deepStrictEqual(Feelings.episodesFor({ trust: -8 }), ['remembered_foe'], 'deep distrust');
assert.deepStrictEqual(Feelings.episodesFor({ trust: 30, affinity: 10 }), ['remembered_friend', 'remembered_friend'], 'a close friend');
assert.deepStrictEqual(Feelings.episodesFor({ affinity: 5 }), ['remembered_friend'], 'a friend');
assert.deepStrictEqual(Feelings.episodesFor({ familiarity: 9, trust: 1 }), [], 'a mild feeling is forgotten');

const saved = { enqueue: Memory.events.enqueue, nearest: Queries.nearestPlayer, speak: Response.speak, enabled: Config.legacyFeelingsEnabled };
const episodes = [], said = [];
let near = null;
try {
    Memory.events.enqueue = (event) => { episodes.push(event); return true; };
    Queries.nearestPlayer = () => near;
    Response.speak = (actor, { text }) => ({ text });
    Config.legacyFeelingsEnabled = true;
    Budget.reset();
    const player = { fetchId: () => 268480009, fetchName: () => 'Arturas' };
    const stranger = { fetchId: () => 268480010, fetchName: () => 'Someone' };
    const bot = { fetchId: () => 2001001, fetchName: () => 'Returner' };
    const session = { accountId: 'bot_pop_2001001', actor: bot, dataSendToOthers(packet) { said.push(packet.text); },
        coldLifeState: { stats: { legacy: { feelings: [{ player: 'Arturas', hostility: 14, trust: -5 }, { player: 'Friendo', trust: 9 }] } } } };
    const now = 3000000;
    near = { session: { accountId: 'player2', actor: stranger }, distance: 800 };
    assert.strictEqual(Feelings.tick(session, bot, now), false, 'a player it never knew');
    near = { session: { accountId: 'player1', actor: player }, distance: 800 };
    assert.strictEqual(Feelings.tick(session, bot, now + 1000), false, 'checked every few seconds');
    assert.strictEqual(Feelings.tick(session, bot, now + 6000), true, 'it remembers Arturas');
    assert.deepStrictEqual(episodes.map((e) => [e.sourceId, e.targetId, e.type]), [[2001001, 268480009, 'remembered_foe']],
        'as a grudge, toward the new character');
    assert.ok(episodes.every((e) => /^[a-zA-Z0-9:_.-]{1,96}$/.test(e.key)), 'a valid, fixed key');
    assert.ok(Feelings.LINES.remembered_foe('Arturas').includes(said[0]), `and says so: ${said[0]}`);
    assert.strictEqual(Feelings.tick(session, bot, now + 20000), false, 'once only');
    assert.strictEqual(episodes.length, 1);
    // Switched off, or no legacy.
    Config.legacyFeelingsEnabled = false;
    const other = { accountId: 'bot_pop_2', actor: bot, coldLifeState: { stats: { legacy: { feelings: [{ player: 'Arturas', trust: 30 }] } } } };
    assert.strictEqual(Feelings.tick(other, bot, now + 30000), false, 'legacyFeelingsEnabled = false');
    Config.legacyFeelingsEnabled = true;
    const fresh = { accountId: 'bot_pop_3', actor: bot, coldLifeState: { stats: {} } };
    assert.strictEqual(Feelings.tick(fresh, bot, now), false, 'a new bot has nothing to remember');
    assert.strictEqual(fresh.legacyFeelingsDone, true, 'and stops looking');
} finally {
    Memory.events.enqueue = saved.enqueue; Queries.nearestPlayer = saved.nearest; Response.speak = saved.speak;
    Config.legacyFeelingsEnabled = saved.enabled; Budget.reset();
}

console.log('Legacy feelings checks passed');
