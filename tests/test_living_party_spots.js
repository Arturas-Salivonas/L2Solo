'use strict';
const assert = require('assert');

require('../src/Global');

// Living Bots: a party re-decides a held spot its leader stands more than PARTY_UNFIT_GAP levels
// above (Situations.unfitSpot), before the deep-blue gap.

const Situations = require('../src/GameServer/Bot/Situations');
const SpotTable = invoke('GameServer/Bot/AI/SpotValueTable');

const saved = { spotLevel: SpotTable.spotLevel, outleveled: SpotTable.outleveled };
try {
    const levels = { low: 9, fit: 14, unknown: null };
    SpotTable.spotLevel = (id) => levels[id] ?? null;
    SpotTable.outleveled = (id, level) => (levels[id] != null && level - levels[id] > 9 ? 1 : 0);

    assert.strictEqual(Situations.unfitSpot('low', 18), 1, 'a level-18 leader on a level-9 spot');
    assert.strictEqual(Situations.unfitSpot('fit', 18), 0, 'a spot within the band');
    assert.strictEqual(Situations.unfitSpot('unknown', 18), 0, 'a spot the table lacks');
    assert.strictEqual(Situations.unfitSpot(null, 18), 0);
    assert.strictEqual(Situations.outleveledSpot('low', 18), 0, 'not yet past the deep-blue gap: the old rule never woke it');

    const party = { partyId: 'p1', leaderId: 1, memberIds: [1, 2, 3], stats: {} };
    const roster = Situations.partySpotAnswer(party, { spotId: 'fit' }, 1000, { leaderLevel: 18 }).roster;
    // A held answer taken on a level-9 spot by a level-18 leader (or one saved before this rule).
    const held = { spotId: 'low', roster, deaths: 0, outleveled: 0 };
    assert.ok(Situations.detectParty(party, held, { leaderLevel: 18 }).includes('spot_outleveled'), 'the party re-decides');
    const answered = Situations.partySpotAnswer(party, { spotId: 'low' }, 2000, { leaderLevel: 18 });
    assert.strictEqual(answered.unfit, 1, 'an answer that keeps the spot (a committed goal) records it');
    assert.deepStrictEqual(Situations.detectParty(party, answered, { leaderLevel: 18 }), [], 'and is not woken again');
    const fit = Situations.partySpotAnswer(party, { spotId: 'fit' }, 3000, { leaderLevel: 18 });
    assert.deepStrictEqual(Situations.detectParty(party, fit, { leaderLevel: 18 }), [], 'a fitting spot stays');
    assert.ok(Situations.detectParty(party, fit, { leaderLevel: 23 }).includes('spot_outleveled'), 'until the leader outgrows it');
} finally {
    SpotTable.spotLevel = saved.spotLevel; SpotTable.outleveled = saved.outleveled;
}

console.log('Living party spot checks passed');
