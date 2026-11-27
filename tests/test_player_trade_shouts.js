'use strict';
const assert = require('assert');

require('../src/Global');

// A player's WTB chat line is item demand in the nearest town (Bot/Economy/PlayerTradeShouts),
// the evidence MarketDemand gives crafters and pricing.

invoke('GameServer/DataCache').init();
const Shouts = invoke('GameServer/Bot/Economy/PlayerTradeShouts');
const Demand = invoke('GameServer/Bot/Economy/MarketDemand');
const TradeDemand = invoke('GameServer/Bot/Economy/MarketTradeDemand');
const Config = invoke('GameServer/Bot/Population/PopulationConfig');
const names = id => invoke('GameServer/DataCache').items.find(row => row.selfId === id)?.template?.name;
const read = text => Shouts.wanted(text).map(({ selfId, units }) => [names(selfId), units]);

// ---------- reading a line ----------
assert.deepStrictEqual(read('WTB Soulshot: No Grade x1000'), [['Soulshot: No Grade', Shouts.MAX_UNITS]], 'a marked count, capped');
assert.deepStrictEqual(read('wtb 20x Spiritshot: No Grade'), [['Spiritshot: No Grade', 20]], 'a count before the name');
assert.deepStrictEqual(read('buying Wooden Arrow 300 pcs'), [['Wooden Arrow', Shouts.MAX_UNITS]], 'pcs counts too');
assert.deepStrictEqual(read('WTB Leather Tunic and Cotton Tunic'), [['Leather Tunic', 1], ['Cotton Tunic', 1]], 'several items');
assert.deepStrictEqual(read('+WTB Elven Long Sword 300k'), [['Elven Long Sword', 1]], 'a price is no count');
assert.deepStrictEqual(read('WTS Bone Arrow, WTB Wooden Arrow'), [['Wooden Arrow', 1]], 'only the WTB part');
assert.deepStrictEqual(read('WTB Wooden Arrow WTS Bone Arrow'), [['Wooden Arrow', 1]], 'up to a WTS');
assert.deepStrictEqual(read('selling Elven Long Sword'), [], 'a WTS line is no demand');
assert.deepStrictEqual(read('hello everyone'), [], 'ordinary chat is nothing');
assert.deepStrictEqual(read('WTB Adena'), [], 'Adena is no item to buy');
assert(read('WTB a b c d e f g h Leather Tunic Cotton Tunic Tunic of Devotion Feriotic Tunic').length <= Shouts.MAX_ITEMS,
    'a few items a line at most');

// ---------- what is recorded ----------
const Counters = invoke('GameServer/Bot/Economy/MarketCounters');
const savedDeal = Counters.supplyDeal;
const deals = [];
Counters.supplyDeal = (...args) => deals.push(args);
const player = (x, y, bot = false) => ({ accountId: bot ? 'bot_1' : 'player_1',
    actor: { fetchId: () => 268480001, fetchLocX: () => x, fetchLocY: () => y } });
try {
    const now = Date.now();
    const inGludin = player(-80826, 149775); // Gludin village
    assert.strictEqual(Shouts.nearestTown(inGludin.actor), 'Gludin');
    const got = Shouts.heard(inGludin, { kind: 8, text: 'WTB Leather Tunic x3' }, now);
    assert.deepStrictEqual(got.map(r => [names(r.selfId), r.units, r.town]), [['Leather Tunic', 3, 'Gludin']]);
    assert.deepStrictEqual(deals.map(d => [d[1], d[2]]), [[3, 'Gludin']], 'one receipt, in the nearest town');
    assert.deepStrictEqual(Shouts.heard(inGludin, { kind: 8, text: 'WTB Leather Tunic x3' }, now + 1000), [],
        'the same line again soon adds nothing');
    assert.strictEqual(Shouts.heard(inGludin, { kind: 8, text: 'WTB Leather Tunic' }, now + Shouts.COOLDOWN_MS).length, 1,
        'after the cooldown it counts again');
    assert.deepStrictEqual(Shouts.heard(player(0, 0, true), { kind: 8, text: 'WTB Cotton Tunic' }, now), [], 'bots\' own lines are not');
    assert.deepStrictEqual(Shouts.heard(inGludin, { kind: 2, text: 'WTB Cotton Tunic' }, now), [], 'a private tell is not public demand');
    Config.playerTradeShoutsEnabled = false;
    assert.deepStrictEqual(Shouts.heard(inGludin, { kind: 1, text: 'WTB Cotton Tunic' }, now), [], 'playerTradeShoutsEnabled = false');
    Config.playerTradeShoutsEnabled = true;
} finally {
    Counters.supplyDeal = savedDeal;
    Shouts.reset();
}

// ---------- end to end: the demand bots read ----------
{
    TradeDemand.reset();
    const now = Date.now();
    const tunic = Shouts.wanted('WTB Cotton Tunic')[0].selfId;
    assert.strictEqual(Demand.forecast(tunic, 'Gludin', { timestamp: now }), null, 'no demand before');
    const first = { accountId: 'player_1', actor: { fetchId: () => 1, fetchLocX: () => -80826, fetchLocY: () => 149775 } };
    const second = { accountId: 'player_2', actor: { fetchId: () => 2, fetchLocX: () => -80826, fetchLocY: () => 149775 } };
    Shouts.heard(first, { kind: 8, text: 'WTB Cotton Tunic x10' }, now);
    Shouts.heard(second, { kind: 8, text: 'WTB Cotton Tunic x10' }, now + 1000);
    const demand = Demand.forecast(tunic, 'Gludin', { timestamp: now + 2000 });
    assert(demand?.applicableUnits > 0, `two WTB lines are demand crafters see: ${JSON.stringify(demand)}`);
    TradeDemand.reset();
    Shouts.reset();
}

console.log('Player trade shout checks passed');
