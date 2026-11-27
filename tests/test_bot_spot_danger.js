'use strict';
const assert = require('assert');

require('../src/Global');

// Dangerous spots (Bot/AI/BotSpotDanger): a bot that died at a spot warns its friends, who keep
// away from it too until their next trip back to town.

const Danger = invoke('GameServer/Bot/AI/BotSpotDanger');
const Risk = invoke('GameServer/Bot/Population/SpotRiskPolicy');
const Queries = require('../src/GameServer/World/ActorSpatialQueries');
const Tips = invoke('GameServer/Bot/AI/BotSpotTips');
const Profiles = invoke('GameServer/Bot/Population/SpotProfiles');
const Spots = invoke('GameServer/Bot/AI/SpotService');
const Life = invoke('GameServer/Bot/Population/BotLifeState');
const Response = invoke('GameServer/Network/Response');
const Budget = invoke('GameServer/Bot/AI/BotChatterBudget');
const TendencyRoll = require('../src/GameServer/Bot/AI/TendencyRoll');
const Config = invoke('GameServer/Bot/Population/PopulationConfig');

const saved = { near: Queries.near, trusts: Tips.trusts, find: Profiles.findById, suitable: Spots.isSuitable, notify: Life.notifyNearFacts,
    speak: Response.speak, peace: utils.isInPeaceZone, roll: TendencyRoll.roll, enabled: Config.spotDangerEnabled };
const said = [], notified = [];
let peers = [], trusted = true, suitable = true, nextId = 2001200;

function bot(name, stats = {}) {
    const actor = { id: ++nextId, name, fetchId() { return this.id; }, fetchName() { return this.name; }, fetchLevel: () => 20,
        fetchLocX: () => 0, fetchLocY: () => 0, isDead: () => false };
    actor.session = { accountId: `bot_pop_${actor.id}`, actor, plan: 'hunting', coldLifeState: { level: 20, stats },
        dataSendToOthers(packet) { said.push([name, packet.text]); } };
    return actor;
}

try {
    Queries.near = () => peers.map((actor) => actor.session);
    Tips.trusts = () => trusted;
    Profiles.findById = (id) => (id === 'cruma_1' ? { id, name: 'Cruma Marshlands - Lizardmen' } : null);
    Spots.isSuitable = () => suitable;
    Life.notifyNearFacts = (session, reason) => notified.push([session.actor.name, reason]);
    Response.speak = (actor, { text }) => ({ text });
    utils.isInPeaceZone = () => true;
    TendencyRoll.roll = () => 0;
    Config.spotDangerEnabled = true;
    Budget.reset();
    const now = 6000000;

    // The spots a bot died at: its death marks.
    const died = bot('Survivor', { stepCount: 10, spotBackoffs: [{ spotId: 'cruma_1', untilStep: 100 }] });
    assert.deepStrictEqual(Danger.deadlySpots(died.session.coldLifeState), ['cruma_1'], 'an active death mark');
    assert.deepStrictEqual(Danger.deadlySpots({ stats: { stepCount: 200, spotBackoffs: [{ spotId: 'cruma_1', untilStep: 100 }] } }), [],
        'a mark that ran out');

    // In town with a friend: a warning, and the friend marks the spot.
    const friend = bot('Friend');
    peers = [friend];
    assert.strictEqual(Danger.tick(died.session, died, now), true, 'it warns its friend');
    assert.ok(Danger.LINES.warn('Friend', 'Cruma Marshlands').includes(said[0][1]), `out loud: ${said[0][1]}`);
    assert.strictEqual(Risk.isMarked(friend.session.coldLifeState.stats, 'cruma_1'), true, 'the friend keeps away now');
    assert.strictEqual(friend.session.coldLifeState.stats.spotMarks[0].reason, Danger.REASON);
    assert.deepStrictEqual(notified, [['Friend', 'spot_warning']], 'and the background thread hears of it');
    assert.ok(Risk.forget(friend.session.coldLifeState.stats, 'arrived_town'), 'until its next trip back to town');
    // Once per WARN_MS; a friend who knows is not told again.
    const other = bot('Other');
    peers = [other];
    Budget.reset();
    assert.strictEqual(Danger.tick(died.session, died, now + 40000), false, 'not again so soon');
    peers = [friend];
    Budget.reset();
    assert.strictEqual(Danger.tick(died.session, died, now + Danger.WARN_MS + 40000), false, 'the friend already knows');
    // A stranger, or a spot the listener could not hunt anyway.
    const died2 = bot('Survivor2', { stepCount: 1, spotBackoffs: [{ spotId: 'cruma_1', untilStep: 100 }] });
    trusted = false;
    peers = [bot('Stranger')];
    assert.strictEqual(Danger.tick(died2.session, died2, now), false, 'a stranger is not told');
    trusted = true; suitable = false;
    const died3 = bot('Survivor3', { stepCount: 1, spotBackoffs: [{ spotId: 'cruma_1', untilStep: 100 }] });
    peers = [bot('Lowbie')];
    assert.strictEqual(Danger.tick(died3.session, died3, now), false, 'nor one who could not hunt there');
    suitable = true;
    // Out in the field: it keeps hunting.
    utils.isInPeaceZone = () => false;
    const died4 = bot('Survivor4', { stepCount: 1, spotBackoffs: [{ spotId: 'cruma_1', untilStep: 100 }] });
    peers = [bot('FieldFriend')];
    assert.strictEqual(Danger.tick(died4.session, died4, now), false, 'out hunting, no talk');
    Config.spotDangerEnabled = false;
    utils.isInPeaceZone = () => true;
    assert.strictEqual(Danger.tick(died4.session, died4, now + 60000), false, 'spotDangerEnabled = false');
} finally {
    Queries.near = saved.near; Tips.trusts = saved.trusts; Profiles.findById = saved.find; Spots.isSuitable = saved.suitable;
    Life.notifyNearFacts = saved.notify; Response.speak = saved.speak; utils.isInPeaceZone = saved.peace; TendencyRoll.roll = saved.roll;
    Config.spotDangerEnabled = saved.enabled; Budget.reset();
}

console.log('Bot spot danger checks passed');
