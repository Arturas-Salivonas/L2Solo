'use strict';
const assert = require('assert');

require('../src/Global');

// Mood titles (Bot/AI/BotMoodTitles): a bot's title shows its level and what it thinks of the
// nearest player, in at most 16 characters, refreshed only when it changes.

const Titles = invoke('GameServer/Bot/AI/BotMoodTitles');
const Memory = invoke('GameServer/Social/InteractionMemoryRuntime');
const Queries = require('../src/GameServer/World/ActorSpatialQueries');
const Risk = invoke('GameServer/Bot/AI/BotPvpRisk');
const Response = invoke('GameServer/Network/Response');
const Config = invoke('GameServer/Bot/Population/PopulationConfig');

// ---------- the words ----------
const cases = [
    [{ hostility: 30, trust: -20 }, 'Hates you'], [{ hostility: 12, trust: -6 }, 'Grudge'], [{ fear: 12 }, 'Afraid'],
    [{ trust: 8, affinity: 4 }, 'Friend'], [{ trust: 3 }, 'Friendly'], [{ affinity: 2 }, 'Friendly'],
    [{ trust: -4 }, 'Wary'], [{ hostility: 5 }, 'Wary'], [{ familiarity: 3 }, 'Knows you'], [null, 'Neutral']
];
for (const [feeling, word] of cases) assert.strictEqual(Titles.mood(feeling), word, `${JSON.stringify(feeling)} reads ${word}`);
assert.strictEqual(Titles.mood({ hostility: 40 }, { hunting: true }), 'Hunting you', 'a manhunt says so first');
assert.strictEqual(Titles.mood({ trust: 9, affinity: 9 }, { party: true }), 'Party', 'a party member is party');
assert.strictEqual(Titles.text(20, 'Friendly'), 'Lv20 Friendly');
assert.strictEqual(Titles.text(76, 'Hunting you'), 'Lv76 Hunting you');
assert(Titles.text(76, 'Hunting you').length <= Titles.MAX_LENGTH, 'every title fits C4’s 16 characters');
for (const [, word] of cases) assert(Titles.text(80, word).length <= Titles.MAX_LENGTH, `${word} fits`);

// ---------- titleOf and the refresh ----------
const saved = { assess: Memory.assess, nearest: Queries.nearestPlayer, party: Risk.sameParty, charInfo: Response.charInfo,
    enabled: Config.botMoodTitles };
let feeling = { trust: 3, affinity: 1 }, assessed = 0;
const sent = [];
try {
    Memory.assess = () => { assessed++; return { ready: true, personal: feeling }; };
    const player = { fetchId: () => 268480001, fetchClanId: () => 0, session: { accountId: 'player1' } };
    Queries.nearestPlayer = () => ({ session: { actor: player } });
    Risk.sameParty = () => false;
    Response.charInfo = actor => ({ charInfoOf: actor.fetchId() });
    const bot = { level: 20, fetchId: () => 2000101, fetchClanId: () => 0, fetchLevel() { return this.level; } };
    bot.session = { accountId: 'bot_pop_1', actor: bot, dataSendToOthers(packet) { sent.push(packet); } };
    const now = 1000000;
    assert.strictEqual(Titles.titleOf(bot, now), 'Lv20 Friendly', 'a bot shows its level and its mood toward the player');
    assert.strictEqual(Titles.titleOf(bot, now + 100), 'Lv20 Friendly');
    assert.strictEqual(assessed, 1, 'one memory read per few seconds (cached)');
    assert.strictEqual(Titles.titleOf({ fetchId: () => 5, session: { accountId: 'player2' } }, now), null, 'a player keeps their own title');
    assert.strictEqual(Titles.titleOf({ fetchKind: () => 'Summon', session: bot.session }, now), null, 'a summon keeps its own');

    // The refresh: the first title rides the next CharInfo; a change is sent at once.
    assert.strictEqual(Titles.tick(bot.session, bot, now), true);
    assert.deepStrictEqual(sent, [], 'nothing sent for the first title');
    assert.strictEqual(Titles.tick(bot.session, bot, now + 1000), false, 'checked every few seconds');
    feeling = { hostility: 14, trust: -6 };
    assert.strictEqual(Titles.tick(bot.session, bot, now + Titles.REFRESH_MS), true);
    assert.strictEqual(Titles.titleOf(bot, now + Titles.REFRESH_MS), 'Lv20 Grudge', 'a new grudge shows');
    assert.deepStrictEqual(sent, [{ charInfoOf: 2000101 }], 'and the players around get its CharInfo');
    bot.level = 21;
    Titles.tick(bot.session, bot, now + 2 * Titles.REFRESH_MS);
    assert.strictEqual(sent.length, 2, 'a level-up shows too');
    Titles.tick(bot.session, bot, now + 3 * Titles.REFRESH_MS);
    assert.strictEqual(sent.length, 2, 'no change, nothing sent');

    // A manhunt on this player, and switching it off.
    bot.session.coldLifeState = { stats: { manhunt: { targetId: 268480001, until: now + 3600000, found: 0 } } };
    delete bot.session.moodTitle;
    assert.strictEqual(Titles.titleOf(bot, now + 4 * Titles.REFRESH_MS), 'Lv21 Hunting you');
    Config.botMoodTitles = false;
    delete bot.session.moodTitle;
    assert.strictEqual(Titles.titleOf(bot, now), null, 'botMoodTitles = false: its own title again');
    Config.botMoodTitles = true;
    Queries.nearestPlayer = () => ({ session: null });
    delete bot.session.moodTitle;
    assert.strictEqual(Titles.titleOf(bot, now), null, 'no player online: its own title');
} finally {
    Memory.assess = saved.assess; Queries.nearestPlayer = saved.nearest; Risk.sameParty = saved.party;
    Response.charInfo = saved.charInfo; Config.botMoodTitles = saved.enabled;
}

console.log('Bot mood title checks passed');
