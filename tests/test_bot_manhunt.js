'use strict';
const assert = require('assert');

require('../src/Global');

// Personal manhunts, the rule and the background thread's half (Social/ManhuntPolicy,
// Bot/Population/BotRoute.huntSpot): the odds by persona and kills, when a row's manhunt
// sends the bot, and the route taking the bot back to the spot where it met its killer.
// Main's half (opening at death, the meeting, the walk-up) is in test_bot_pvp_watch.

invoke('GameServer/DataCache').init();
const Policy = require('../src/GameServer/Social/ManhuntPolicy');
const BotRoute = invoke('GameServer/Bot/Population/BotRoute');

// ---------- the odds ----------
const persona = (traits, inclinations = {}) => ({ traits, inclinations: { pvp: 0.15, justice: 0.1, ...inclinations } });
const AVERAGE = persona({ assertiveness: 0.5, empathy: 0.5, caution: 0.5 });
const BRAWLER = persona({ assertiveness: 0.88, empathy: 0.25, caution: 0.22 }, { pvp: 0.85 });
const HELPER = persona({ assertiveness: 0.46, empathy: 0.9, caution: 0.64 });
const near = (value, expected, label) => assert(Math.abs(value - expected) < 0.01, `${label}: ${value}`);
near(Policy.chance(AVERAGE, 1), 0.0525, 'an average bot rarely comes back after one kill');
near(Policy.chance(AVERAGE, 2), 0.2025, 'a second kill makes it likelier');
near(Policy.chance(BRAWLER, 1), 0.4845, 'a brawler comes back about half the time');
assert.strictEqual(Policy.chance(HELPER, 1), 0, 'a gentle helper lets one kill go');
assert(Policy.chance(HELPER, 3) > 0.1, 'but not a third');
assert.strictEqual(Policy.chance(BRAWLER, 20), 0.75, 'the odds are capped');

// ---------- the row ----------
const at = Date.now();
const hunt = Policy.open({ targetId: 268480001, targetName: 'Hero<script>', spotId: 'hunt46', at, minutes: 120, kills: 1 });
assert.deepStrictEqual(hunt, { targetId: 268480001, targetName: 'Heroscript', spotId: 'hunt46', at, until: at + 7200000, kills: 1, found: 0 });
const row = (manhunt, extra = {}) => ({ stats: { manhunt, ...extra } });
assert(Policy.active(row(hunt), at + 1000), 'a fresh manhunt sends the bot');
assert(!Policy.active(row(hunt), at + 7200001), 'a lapsed one does not');
assert(!Policy.active(row({ ...hunt, found: at + 5 }), at + 1000), 'a found one does not');
assert(!Policy.active(row(hunt, { karma: 50 }), at + 1000), 'a bot with karma washes it first');
assert(!Policy.active(row(null), at), 'no manhunt, nothing');
assert.strictEqual(Policy.routeKey(row(hunt), at), '268480001@hunt46');
assert.strictEqual(Policy.routeKey(row(hunt), at + 7200001), '', 'the held choice moves when it lapses');
assert.strictEqual(Policy.kills(hunt, 268480001, at + 60000), 2, 'the same killer again while it lasts: escalation');
assert.strictEqual(Policy.kills(hunt, 268480002, at + 60000), 1, 'another killer starts at one');
assert.strictEqual(Policy.kills(hunt, 268480001, at + 7200001), 1, 'after it lapsed, at one again');

// ---------- the route ----------
const spot = (id, level, locX) => ({ id, name: id, avgLevel: level, minLevel: level - 1, maxLevel: level + 1,
    density: 20, center: { locX, locY: 0, locZ: 0 }, tags: [], tagsAuthoritative: true });
const spots = [spot('ground46', 46, 30000), spot('hunt46', 46, 60000)];
const bot = (stats = {}) => ({ characterId: 9101, name: 'Bot9101', accountName: 'bot_9101', phase: 'cold', activity: 'hunting',
    level: 46, spotId: 'ground46', loc: { ...spots[0].center }, inventory: {}, vitals: { hp: 100, maxHp: 100, mp: 100, maxMp: 100 },
    timing: {}, stats: { classId: 1, role: 'melee', earning: { spotId: 'ground46', income: 1000 }, ...stats } });
const choose = (state, timestamp = at + 1000) => BotRoute.huntSpot(state, null, { spots, timestamp })?.spotId ?? null;
const usual = choose(bot());
assert.notStrictEqual(usual, 'hunt46', `without a manhunt the bot keeps its own choice (${usual})`);
assert.strictEqual(choose(bot({ manhunt: hunt })), 'hunt46', 'a manhunt sends the bot back to where it met its killer');
assert.strictEqual(choose(bot({ manhunt: hunt }), at + 7200001), usual, 'after it lapses, the bot\'s own choice again');
assert.strictEqual(choose(bot({ manhunt: { ...hunt, found: at + 5 } })), usual, 'found: the bot stops going back');
assert.strictEqual(choose(bot({ manhunt: hunt, karma: 40 })), usual, 'with karma: the karma wash first');
assert.strictEqual(choose(bot({ manhunt: { ...hunt, spotId: 'gone' } })), usual, 'a spot no longer in the catalogue sends nowhere');
assert.strictEqual(choose(bot({ manhunt: hunt, earning: { spotId: 'ground46', command: true } })), 'ground46',
    'a player\'s command comes first');
// The held choice (the worker's kernel record) is chosen again when a manhunt opens and when it lapses.
{
    const owner = {};
    const held = (state, timestamp = at + 1000) => BotRoute.heldHuntSpot(owner, state, null, { spots, timestamp })?.spotId ?? null;
    assert.strictEqual(held(bot()), usual);
    assert.strictEqual(held(bot({ manhunt: hunt })), 'hunt46', 'a new manhunt moves the held choice');
    assert.strictEqual(held(bot({ manhunt: hunt }), at + 7200001), usual, 'its end moves it back');
}

console.log('Bot manhunt rule and route checks passed');
