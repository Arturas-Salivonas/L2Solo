'use strict';
const assert = require('assert');

require('../src/Global');

// Town attention (Bot/AI/TownAttention): bots say gz to a player's level-up, call out a PK,
// and walk over to watch a fight; one roll per bot and event, a few bots at most.

const Attention = invoke('GameServer/Bot/AI/TownAttention');
const TendencyRoll = require('../src/GameServer/Bot/AI/TendencyRoll');
const Budget = invoke('GameServer/Bot/AI/BotChatterBudget');
const Response = invoke('GameServer/Network/Response');
const Awareness = invoke('GameServer/Bot/AI/PartyAwareness');
const Geodata = invoke('GameServer/Geodata/GeodataEngine');
const Generics = invoke(path.actor);
const Config = invoke('GameServer/Bot/Population/PopulationConfig');

const saved = { roll: TendencyRoll.roll, canReply: Budget.canReply, speaker: Budget.recordSpeaker, speak: Response.speak,
    attackers: Awareness.npcsAttackingActor, height: Geodata.getHeight, stop: Generics.stopAutomation, enabled: Config.townAttentionEnabled };
const said = [];
let attackers = 0;
TendencyRoll.roll = () => 0;
Budget.canReply = () => true;
Budget.recordSpeaker = () => {};
Response.speak = (_actor, data) => data.text;
Awareness.npcsAttackingActor = () => new Array(attackers).fill({});
Geodata.getHeight = (_x, _y, z) => z;
Generics.stopAutomation = () => {};

let serial = 7000;
function character({ bot = true, x = 0, name } = {}) {
    const id = serial++;
    const actor = { id, x, moves: [], fetchId: () => id, fetchName: () => name || `actor_${id}`, fetchLocX: () => actor.x, fetchLocY: () => 0,
        fetchLocZ: () => 0, isDead: () => false, moveTo(move) { actor.moves.push(move.to); },
        state: { fetchHits: () => false, fetchCasts: () => false, fetchSeated: () => false, setSeated() {} } };
    actor.session = { actor, accountId: `${bot ? 'bot' : 'player'}_${id}`, plan: 'shopping',
        persona: { traits: { sociability: 0.6, caution: 0.4 }, inclinations: { justice: 0.3, pvp: 0.2 } },
        dataSendToOthers(text) { said.push([id, text]); } };
    return actor;
}
const run = (bots, now) => bots.forEach(bot => Attention.tick(bot.session, bot, now));

try {
    // ---------- persona ----------
    const sociable = { traits: { sociability: 0.9 } }, shy = { traits: { sociability: 0.1 } };
    assert(Attention.chance('level_up', sociable) > Attention.chance('level_up', shy), 'sociable bots say gz more');
    assert(Attention.chance('pk', { inclinations: { justice: 0.85 } }) > Attention.chance('pk', { inclinations: { justice: 0.1 } }),
        'justice keepers call out PKs more');
    assert(Attention.chance('fight', { traits: { caution: 0.1 } }) > Attention.chance('fight', { traits: { caution: 0.9 } }),
        'cautious bots watch fights less');

    // ---------- gz ----------
    {
        Attention.reset(); said.length = 0;
        const now = Date.now();
        const player = character({ bot: false, name: 'Hero' });
        const bots = [1, 2, 3, 4, 5].map(i => character({ x: i * 100 }));
        assert(Attention.notice('level_up', player, { now }), 'a player\'s level-up is an event');
        assert.strictEqual(Attention.notice('level_up', bots[0], { now }), null, 'a bot\'s own level-up is not');
        run(bots, now);
        assert.deepStrictEqual(said, [], 'nobody answers in the same instant');
        run(bots, now + 4500);
        assert.strictEqual(said.length, Attention.REACTORS.level_up, 'a few bots say it, not the whole town');
        assert(said.every(([, text]) => /gz|grats|gratz|congrats/.test(text)), `they say gz: ${JSON.stringify(said)}`);
        said.length = 0;
        run(bots, now + 9000);
        assert.deepStrictEqual(said, [], 'each bot judges an event once');
        const far = character({ x: Attention.HEAR.level_up + 500 });
        Attention.notice('level_up', player, { now: now + 10000 });
        run([far], now + 10000); run([far], now + 15000);
        assert.deepStrictEqual(said, [], 'out of earshot, nothing');
    }

    // ---------- PK ----------
    {
        Attention.reset(); said.length = 0;
        const now = Date.now();
        const killer = character({ name: 'Brok' }), victim = character({ bot: false, name: 'Hero', x: 100 });
        const bystanders = [character({ x: 300 }), character({ x: 400 }), character({ x: 500 })];
        Attention.notice('pk', killer, { other: victim, now });
        run([killer, ...bystanders], now); run([killer, ...bystanders], now + 4500);
        assert.strictEqual(said.length, Attention.REACTORS.pk, 'two bystanders call it out');
        assert(said.every(([id, text]) => id !== killer.id && /Brok/.test(text) || text === 'PK!!'), `naming the PK: ${JSON.stringify(said)}`);
    }

    // ---------- a fight draws watchers ----------
    {
        Attention.reset(); said.length = 0;
        const now = Date.now();
        const a = character({ x: 2000 }), b = character({ bot: false, x: 2100 });
        const watcher = character({ x: 800 }), busy = character({ x: 900 });
        busy.session.currentTargetId = 12345;
        Attention.notice('fight', a, { other: b, now });
        Attention.notice('fight', b, { other: a, now: now + 100 });
        assert.strictEqual(Attention.events.filter(e => e.kind === 'fight').length, 1, 'both sides\' blows are one fight');
        assert.strictEqual(Attention.tick(watcher.session, watcher, now + 200), true, 'a bot walks over to watch');
        assert.strictEqual(watcher.moves.length, 1);
        const stop = watcher.moves[0].locX;
        assert(Math.abs((2050 - stop) - Attention.WATCH_GAP) <= 1, `it stops ${Attention.WATCH_GAP} short of the fight: ${stop}`);
        assert.strictEqual(Attention.tick(busy.session, busy, now + 200), false, 'a bot with a target keeps fighting its own fight');
        assert.strictEqual(Attention.tick(watcher.session, watcher, now + 3000), true, 'watching owns its tick');
        Attention.notice('fight', a, { other: b, now: now + 5000 });
        assert.strictEqual(Attention.tick(watcher.session, watcher, now + 10000), true, 'while blows go on, it keeps watching');
        assert.strictEqual(Attention.tick(watcher.session, watcher, now + 5000 + Attention.FIGHT_QUIET_MS + 1), false,
            'a quiet fight is over');
        assert(!watcher.session.attentionWatch);
        assert(said.some(([id, text]) => id === watcher.id && /gg|nice fight|close|wow/.test(text)), 'now and then a word after');

        // A monster on a watcher ends the watch.
        const other = character({ x: 900 });
        Attention.notice('fight', a, { other: b, now: now + 20000 });
        assert.strictEqual(Attention.tick(other.session, other, now + 20000), true);
        attackers = 1;
        assert.strictEqual(Attention.tick(other.session, other, now + 21000), false, 'a monster on it: back to its own fight');
        attackers = 0;
    }

    // ---------- the switch ----------
    Config.townAttentionEnabled = false;
    assert.strictEqual(Attention.notice('level_up', character({ bot: false }), {}), null, 'townAttentionEnabled = false: nothing');
} finally {
    TendencyRoll.roll = saved.roll; Budget.canReply = saved.canReply; Budget.recordSpeaker = saved.speaker; Response.speak = saved.speak;
    Awareness.npcsAttackingActor = saved.attackers; Geodata.getHeight = saved.height; Generics.stopAutomation = saved.stop;
    Config.townAttentionEnabled = saved.enabled;
    Attention.reset();
}

console.log('Town attention checks passed');
