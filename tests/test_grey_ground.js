'use strict';
const assert = require('assert');

require('../src/Global');

// Living Bots: a hot solo bot takes no spot it outlevels by more than SpotRiskPolicy.OUTLEVELED_GAP
// and picks no recovery fights there (HuntingState.greyGround, reconcilePhysicalSpot).

const Hunting = require('../src/GameServer/Bot/AI/States/HuntingState');
const SpotService = invoke('GameServer/Bot/AI/SpotService');
const SpotTable = invoke('GameServer/Bot/AI/SpotValueTable');

const saved = { level: SpotTable.spotLevel, find: SpotService.findCurrentSpot, assign: SpotService.assignSpot };
try {
    const levels = { keltir: 3, fit: 14 };

    SpotTable.spotLevel = (id) => levels[id] ?? null;
    const bot = (level) => ({ fetchLevel: () => level, fetchLocX: () => 0, fetchLocY: () => 0, fetchLocZ: () => 0 });
    const session = (extra = {}) => ({ accountId: 'bot_pop_1', coldLifeState: { stats: {} }, ...extra });

    const keltir = { id: 'keltir', minLevel: 2, maxLevel: 5, avgLevel: 3 };
    const fit = { id: 'fit', minLevel: 13, maxLevel: 16, avgLevel: 14 };
    assert.strictEqual(Hunting.greyGround(session(), bot(19), keltir), true, 'a level 2-5 field for a level-19 bot');
    assert.strictEqual(Hunting.greyGround(session(), bot(19), fit), false, 'a level 13-16 spot is fine');
    assert.strictEqual(Hunting.greyGround(session(), bot(12), keltir), false, 'a level-12 bot may hunt it (its strongest mobs are 7 below)');
    assert.strictEqual(Hunting.greyGround(session(), bot(19), { id: 'keltir' }), true, 'a spot without levels reads the table');
    assert.strictEqual(Hunting.greyGround(session(), bot(19), null), false, 'stranded (no spot): its recovery fights stay, as before');
    const farming = session({ coldLifeState: { stats: { equipmentPlan: { status: 'active', next: { spotId: 'keltir' } } } } });
    assert.strictEqual(Hunting.greyGround(farming, bot(19), 'keltir'), false, 'farming its gear plan\'s drop there');

    // Stepping out of town onto the keltir field: it does not take it as its spot.
    let assigned = null;
    SpotService.assignSpot = (s, spot) => { assigned = spot.id; s.currentSpot = spot; };
    SpotService.findCurrentSpot = () => keltir;
    const walker = session();
    Hunting.reconcilePhysicalSpot(walker, bot(19));
    assert.strictEqual(assigned, null, 'a level-19 bot does not adopt the level-3 field');
    assert.strictEqual(walker.currentSpot, undefined);
    SpotService.findCurrentSpot = () => fit;
    Hunting.reconcilePhysicalSpot(walker, bot(19));
    assert.strictEqual(assigned, 'fit', 'but takes a fitting field it stands on, as before');
} finally {
    SpotTable.spotLevel = saved.level; SpotService.findCurrentSpot = saved.find; SpotService.assignSpot = saved.assign;
}

console.log('Grey ground checks passed');
