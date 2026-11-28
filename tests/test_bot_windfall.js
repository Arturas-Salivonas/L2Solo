// Living Bots: a bot that comes into money spends it like a person would. A windfall wakes
// its spending plan (DecisionSections.windfallAt), and money is worth less to a bot that
// holds plenty of it (WishNetwork.wealthFloor).
const assert = require('assert');
require('../src/Global');

const Sections = invoke('GameServer/Bot/Economy/DecisionSections');
const Network = require('../src/GameServer/Bot/Economy/WishNetwork');

// The threshold: the next power of two above twice the wallet, at least about 1kk.
assert.strictEqual(Sections.windfallAtOf(173734), Sections.WINDFALL_MIN, 'a small wallet: about a million wakes it');
assert.strictEqual(Sections.windfallAtOf(3e6), 2 ** 23, 'three million: past eight million');
assert.strictEqual(Sections.windfallAtOf(3.1e6), Sections.windfallAtOf(3.5e6), 'a few Adena more or less is the same baseline');

// The wake: crossing it raises the build, as reaching a planned price does.
const baseline = { at: 1, windfallAt: Sections.windfallAtOf(173734) };
assert.deepStrictEqual(Sections.moneyCrossings(180000, baseline), [], 'ordinary earnings wake nothing');
assert.deepStrictEqual(Sections.moneyCrossings(5173734, baseline), ['goal_affordable:focus'], 'a 5kk prize wakes its plan');
assert.deepStrictEqual(Sections.moneyCrossings(5173734, { ...baseline, affordAt: { at: 1e6, kind: 'focus' } }), ['goal_affordable:focus'],
    'once, beside a planned price it reached too');
const spent = Sections.unspent(baseline, 5173734);
assert.strictEqual(spent.windfallAt, undefined, 'a crossed windfall is spent until the next build');
assert.strictEqual(Sections.unspent(baseline, 180000), baseline, 'one not crossed stands');

// The floor: up to a day of income, full; then falling with the wallet, never below its minimum.
assert.strictEqual(Network.wealthFloor(500000, 4e6), 1 / 500000, 'eight hours of income: the full floor');
assert.ok(Math.abs(Network.wealthFloor(500000, 12e6) - 1 / 500000) < 1e-15, 'a day of income (12kk): still full');
assert.ok(Math.abs(Network.wealthFloor(500000, 24e6) - 0.5 / 500000) < 1e-15, 'two days: half');
assert.ok(Math.abs(Network.wealthFloor(500000, 1e8) - Network.WEALTH_MIN_FACTOR / 500000) < 1e-15,
    '100kk on 500k an hour (200 hours): the minimum share');
assert.ok(Math.abs(Network.wealthFloor(500000, 1e10) - Network.WEALTH_MIN_FACTOR / 500000) < 1e-15, 'a fortune: the minimum share');
assert.strictEqual(Network.wealthFloor(0, 1e8), 0, 'no income known: no floor, as before');

// The queue funds a dear upgrade for the rich bot that the poor one leaves.
const wish = { key: 'power:2499:7', valueHours: 2, price: 3e6, paths: [] };
const poor = Network.moneyQueue([{ ...wish }], 4e6, 0, Network.wealthFloor(500000, 4e6));
const rich = Network.moneyQueue([{ ...wish }], 1e8, 0, Network.wealthFloor(500000, 1e8));
assert.strictEqual(poor.queue[0].funded, false, 'two hours saved for 3kk: too dear for a bot on 500k an hour');
assert.strictEqual(rich.queue[0].funded, true, 'the same bot with 100kk buys it');

console.log('Bot windfall checks passed');
