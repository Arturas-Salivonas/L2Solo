// Living Bots: bots learn which party mix earns most at a spot and level (PartyMixLessons), from
// their own parties' hours, keep it across restarts, and recruit by it, trying another mix now
// and then (BackgroundPartyComposition.selectRecruits, options.mix).
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const store = path.join(os.tmpdir(), `party-mix-${process.pid}.json`);
process.env.L2SOLO_PARTY_MIX_FILE = store;
require('../src/Global');

const Lessons = require('../src/GameServer/Bot/Population/PartyMixLessons');
const Composition = invoke('GameServer/Bot/Population/BackgroundPartyComposition');
const BotPersona = invoke('GameServer/Bot/AI/BotPersona');
const PartyState = invoke('GameServer/Bot/Population/BackgroundPartyState');
const Life = invoke('GameServer/Bot/Population/BotLifeState');
BotPersona.useRowSource((id) => BotPersona.tableRow(BotPersona.generate({ characterId: id })));

const at = 1795000000000;
try { fs.rmSync(store, { force: true }); } catch { /* none */ }
Lessons._reset();

// The mix of a roster: its roles, counted, in name order.
assert.strictEqual(Lessons.mixOf(['healer', 'dps', 'dps']), 'dps2+healer1');
assert.strictEqual(Lessons.bandOf(22), 20);

// Two mixes at one spot and band: three damage dealers earned twice what two and a healer did.
Lessons.add('cruma', 20, 'dps2+healer1', 2, { exp: 2000, adena: 200000, deaths: 0 }, at);
Lessons.add('cruma', 20, 'dps3', 2, { exp: 4000, adena: 400000, deaths: 0 }, at);
Lessons.add('cruma', 20, 'dps1+tank1', 0.5, { exp: 9000, adena: 0, deaths: 0 }, at);
const known = Lessons.known('cruma', 23);
assert.deepStrictEqual(known.map(row => row.mix), ['dps3', 'dps2+healer1'], 'the better mix first; half an hour is not a lesson yet');
assert.ok(known[0].score > known[1].score + 1);
assert.deepStrictEqual(Lessons.known('cruma', 31), [], 'another level band knows nothing');
const reader = Lessons.reader({ spotId: 'cruma', level: 22 }, () => 0.99);
assert.strictEqual(reader.explore, false);
assert.ok(reader.score(['dps', 'dps', 'dps']) > reader.score(['dps', 'healer', 'dps']));
assert.strictEqual(reader.score(['dps', 'mage']), null, 'an unknown mix: no score');
assert.strictEqual(Lessons.reader({ spotId: 'nowhere', level: 22 }), null, 'a spot with no lessons: no reader');

// Recruiting: without lessons a missing healer comes first; at a spot where the healer-less mix
// earned clearly more, the damage dealer is taken; exploring, the usual mix stands.
const dps = (id) => ({ characterId: id, level: 22, stats: { role: 'dps' }, party: { role: 'dps' } });
const leader = dps(1), mate = dps(2);
const healer = { characterId: 3, level: 22, stats: { role: 'healer' }, party: { role: 'healer' } };
const candidates = [healer, dps(4)];
assert.deepStrictEqual(Composition.selectRecruits([leader, mate], candidates, { maxSize: 3 }).map(row => row.characterId), [3],
    'no lessons: the healer');
assert.deepStrictEqual(Composition.selectRecruits([leader, mate], candidates, { maxSize: 3, mix: reader }).map(row => row.characterId), [4],
    'the lessons of this spot: three damage dealers');
const exploring = Lessons.reader({ spotId: 'cruma', level: 22 }, () => 0);
assert.strictEqual(exploring.explore, true);
assert.deepStrictEqual(Composition.selectRecruits([leader, mate], candidates, { maxSize: 3, mix: exploring }).map(row => row.characterId), [3],
    'exploring: the usual mix is tried again');

// A member's commits in an ordinary party add its hour to the party's row.
const realFind = PartyState.find, realCached = Life.cachedState;
try {
    const party = { partyId: 'p1', status: 'active', spotId: 'marsh', memberIds: [11, 12], stats: {} };
    PartyState.find = id => (id === 'p1' ? party : null);
    const states = { 12: { characterId: 12, level: 31, stats: { role: 'healer' }, party: { partyId: 'p1', role: 'healer' } } };
    Life.cachedState = id => states[id] || null;
    const member = (exp, adena, deaths = 0) => ({ characterId: 11, phase: 'cold', level: 33, adena, party: { partyId: 'p1', role: 'dps' },
        stats: { role: 'dps', exp, deaths } });
    assert.strictEqual(Lessons.committed(null, member(1000, 5000), at), false, 'a first commit only marks the clock');
    assert.strictEqual(Lessons.committed(member(1000, 5000), member(1600, 9000), at + 60000), true, 'its next adds the minute');
    assert.strictEqual(Lessons.committed(member(1600, 9000), member(1700, 9100), at + 60000 + 11 * 60000), false,
        'a gap past 10 minutes is no hour of hunting');
    party.stats = { objective: { clanGoalKey: 'clan:1' } };
    assert.strictEqual(Lessons.committed(member(1700, 9100), member(1800, 9200), at + 12 * 60000), false, 'a clan duty is no lesson');
} finally { PartyState.find = realFind; Life.cachedState = realCached; }

// Kept across restarts.
Lessons.save();
assert.ok(fs.existsSync(store), 'saved beside the world (here: the test file)');
const saved = JSON.parse(fs.readFileSync(store, 'utf8'));
assert.ok(saved.rows.some(row => row.spot === 'marsh' && row.band === 30 && row.mix === 'dps1+healer1' && row.exp === 600));
delete require.cache[require.resolve('../src/GameServer/Bot/Population/PartyMixLessons')];
const Reloaded = require('../src/GameServer/Bot/Population/PartyMixLessons');
assert.strictEqual(Reloaded.known('cruma', 22)[0].mix, 'dps3', 'a restart remembers');

// Off by config.
invoke('GameServer/Bot/Population/PopulationConfig').partyMixLessons = false;
assert.strictEqual(Reloaded.reader({ spotId: 'cruma', level: 22 }), null, 'switched off');
invoke('GameServer/Bot/Population/PopulationConfig').partyMixLessons = true;

// Lone wolves: a loner with no clan takes a party only when it is far better; a clan brings it in.
const Progress = require('../src/GameServer/Bot/Population/PartyProgressComparison');
const base = BotPersona.generate({ characterId: 5 });
const persona = (sociability, clanId) => ({ characterId: 5, persona: { ...base, traits: { ...base.traits, sociability } }, stats: { clanId } });
assert.ok(Math.abs(Progress.partyLean(persona(0.2, 0)) - 1.6) < 1e-9, 'a lone wolf: a party ~1.6x faster');
assert.ok(Math.abs(Progress.partyLean(persona(0.2, 7)) - 1.3) < 1e-9, 'in a clan: as any loner');
assert.ok(Math.abs(Progress.partyLean(persona(0.6, 0)) - 0.9) < 1e-9, 'a social bot: unchanged');

fs.rmSync(store, { force: true });
console.log('Party mix lessons checks passed');
