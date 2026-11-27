'use strict';
const assert = require('assert');

require('../src/Global');

// Living Bots: a solo bot's hunt round on ground more than OUTLEVELED_GAP levels below it marks
// that ground (SpotRiskPolicy.recordHunt), so its route leaves it and no search keeps it.

const Risk = require('../src/GameServer/Bot/Population/SpotRiskPolicy');
const SpotTable = invoke('GameServer/Bot/AI/SpotValueTable');

const saved = SpotTable.spotLevel;
try {
    const levels = { '-9_-20': 2, '-4_7': 17, '-8_-19': 3 };
    SpotTable.spotLevel = (id) => levels[id] ?? null;
    const at = Date.now();
    const bot = (level, stats = {}) => ({ characterId: 1, level, stats });
    const round = (state, spotId, extra = {}) => Risk.recordHunt(state, { spotId, timestamp: at, fights: 3, wins: 3, deaths: 0, ...extra });

    const marked = round(bot(19), '-9_-20');
    assert.deepStrictEqual(marked.spotMarks, [{ spotId: '-9_-20', reason: 'outleveled' }], 'a level-19 bot on a level-2 field marks it');
    assert.strictEqual(Risk.isMarked({ spotMarks: marked.spotMarks }, '-9_-20'), true);
    assert.ok(Risk.excludedSpotIdsForStates([{ ...bot(19), stats: { spotMarks: marked.spotMarks } }]).has('-9_-20'),
        'the route now excludes that ground');
    assert.strictEqual(round(bot(19), '-8_-19:f2').spotMarks?.[0]?.spotId, '-8_-19:f2', 'a sub-spot reads its field\'s level');
    assert.strictEqual(round(bot(19), '-4_7').spotMarks, undefined, 'a fitting spot is not marked');
    assert.strictEqual(Risk.OUTLEVELED_GAP, 5, 'the leveling window: 5 levels below');
    assert.strictEqual(round(bot(7), '-9_-20').spotMarks, undefined, `${Risk.OUTLEVELED_GAP} levels or fewer below is fine`);
    assert.strictEqual(round(bot(8), '-9_-20').spotMarks?.length, 1, 'more than that is not');
    assert.strictEqual(round({ ...bot(19), classId: 54 }, '-9_-20').spotMarks, undefined, 'a spoiler farms lower mobs for their spoil');
    // Item hunts keep their ground.
    assert.strictEqual(round(bot(19), '-9_-20', { itemHunt: true }).spotMarks, undefined, 'a material hunt there');
    const plan = { equipmentPlan: { status: 'active', next: { spotId: '-9_-20' } } };
    assert.strictEqual(round(bot(19, plan), '-9_-20').spotMarks, undefined, 'its gear plan farms a drop there');
    // Parties and already marked ground.
    assert.strictEqual(round({ ...bot(19), party: { partyId: 'p1' } }, '-9_-20').spotMarks, undefined, 'a party member: its party decides');
    assert.strictEqual(round(bot(19, { spotMarks: marked.spotMarks }), '-9_-20').spotMarks, undefined, 'marked once');
    // The mark lasts the outing: back in town it is forgotten (and set again if it hunts there again).
    assert.ok(Risk.forget({ spotMarks: marked.spotMarks }, 'arrived_town'), 'forgotten when it next reaches a town');
    assert.strictEqual(round(bot(19), null).spotMarks, undefined, 'no spot, no mark');
} finally {
    SpotTable.spotLevel = saved;
}

console.log('Outleveled ground checks passed');
