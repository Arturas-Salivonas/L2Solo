'use strict';
const assert = require('assert');

require('../src/Global');

// Fear and bravado (Bot/AI/BotNerve): an afraid bot keeps away from the player; a bold one with
// a grudge says so.

const Nerve = invoke('GameServer/Bot/AI/BotNerve');
const Memory = invoke('GameServer/Social/InteractionMemoryRuntime');
const Queries = require('../src/GameServer/World/ActorSpatialQueries');
const Voice = invoke('GameServer/Bot/AI/BotChatVoice');
const Response = invoke('GameServer/Network/Response');
const Budget = invoke('GameServer/Bot/AI/BotChatterBudget');
const Awareness = invoke('GameServer/Bot/AI/PartyAwareness');
const Config = invoke('GameServer/Bot/Population/PopulationConfig');

const ActorGenerics = invoke(path.actor);
const saved = { assess: Memory.assess, nearest: Queries.nearestPlayer, profile: Voice.profile, speak: Response.speak,
    attackers: Awareness.npcsAttackingActor, stop: ActorGenerics.stopAutomation, enabled: Config.nerveEnabled };
const said = [], moves = [];
let feeling = null, distance = 500, persona = { traits: { assertiveness: 0.8 }, inclinations: { pvp: 0.5 } };

const player = { fetchId: () => 268480001, fetchName: () => 'Arturas', fetchLocX: () => 0, fetchLocY: () => 0, fetchClanId: () => 0 };
function bot(extra = {}) {
    const actor = { fetchId: () => 2000901, fetchName: () => 'Scared', fetchLocX: () => 300, fetchLocY: () => 400, fetchLocZ: () => -3000,
        fetchClanId: () => 0, isDead: () => false, fetchPrivateStore: () => 0, state: { fetchHits: () => false, fetchCasts: () => false,
            fetchSeated: () => false }, moveTo(route) { moves.push(route); }, ...extra };
    actor.session = { accountId: 'bot_pop_2000901', actor, plan: 'hunting', dataSendToOthers(packet) { said.push(packet.text); } };
    return actor;
}

try {
    Memory.assess = () => ({ ready: true, personal: feeling });
    Queries.nearestPlayer = () => ({ session: { actor: player }, distance });
    Voice.profile = () => persona;
    Response.speak = (actor, { text }) => ({ text });
    Awareness.npcsAttackingActor = () => [];
    ActorGenerics.stopAutomation = () => {};
    Config.nerveEnabled = true;
    Budget.reset();
    const now = 7000000;

    // Afraid: walks away, along the line from the player through it.
    feeling = { fear: 12, hostility: 4 };
    const scared = bot();
    assert.strictEqual(Nerve.tick(scared.session, scared, now), true, 'an afraid bot keeps away');
    assert.strictEqual(moves.length, 1);
    const { to } = moves[0];
    assert.ok(Math.hypot(to.locX, to.locY) > 500 + Nerve.STEP - 5, 'farther from the player');
    assert.ok(Math.abs(to.locY / to.locX - 400 / 300) < 0.01, 'straight away from them');
    assert.ok(Nerve.LINES.afraid().includes(said[0]), 'with a nervous word');
    assert.strictEqual(Nerve.tick(scared.session, scared, now + 1000), true, 'the walk owns its tick for a few seconds');
    Budget.reset();
    Nerve.tick(scared.session, scared, now + 8000);
    assert.strictEqual(said.length, 1, 'the nervous word once per 10 minutes');
    assert.strictEqual(moves.length, 2, 'still close: it steps away again');
    // Busy with a monster: it holds its ground.
    const busy = bot();
    busy.session.currentTargetId = 123;
    assert.strictEqual(Nerve.tick(busy.session, busy, now), false, 'a bot in a fight does not run from the player');
    // Out of range.
    distance = 2000;
    const far = bot();
    assert.strictEqual(Nerve.tick(far.session, far, now), false, 'the player is far away');
    distance = 500;

    // Bold with a grudge: says so, does not step aside.
    feeling = { fear: 2, hostility: 14 };
    said.length = 0; moves.length = 0; Budget.reset();
    const brave = bot();
    assert.strictEqual(Nerve.tick(brave.session, brave, now), false, 'a bold bot stays');
    assert.ok(Nerve.LINES.bold('Arturas').includes(said[0]), `and says so: ${said[0]}`);
    assert.strictEqual(moves.length, 0);
    persona = { traits: { assertiveness: 0.3 }, inclinations: { pvp: 0.1 } };
    said.length = 0; Budget.reset();
    const quiet = bot();
    Nerve.tick(quiet.session, quiet, now);
    assert.strictEqual(said.length, 0, 'a mild bot with a grudge keeps it to itself');

    // No feeling, or switched off.
    feeling = null;
    const stranger = bot();
    assert.strictEqual(Nerve.tick(stranger.session, stranger, now), false, 'a stranger does nothing');
    Config.nerveEnabled = false;
    feeling = { fear: 30 };
    const off = bot();
    assert.strictEqual(Nerve.tick(off.session, off, now), false, 'nerveEnabled = false');
} finally {
    Memory.assess = saved.assess; Queries.nearestPlayer = saved.nearest; Voice.profile = saved.profile; Response.speak = saved.speak;
    Awareness.npcsAttackingActor = saved.attackers; ActorGenerics.stopAutomation = saved.stop; Config.nerveEnabled = saved.enabled;
    Budget.reset();
}

console.log('Bot nerve checks passed');
