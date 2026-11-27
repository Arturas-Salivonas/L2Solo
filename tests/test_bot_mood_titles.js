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
// What it does to you now comes first; what it is busy with replaces "Neutral".
assert.strictEqual(Titles.mood(null, { fighting: true }), 'Fights you', 'a bot attacking you says so at once');
assert.strictEqual(Titles.mood({ trust: 9, affinity: 9 }, { fighting: true }), 'Fights you', 'even a friend');
assert.strictEqual(Titles.mood(null, { watching: 'revenge' }), 'Revenge', 'a grudge waiting for you to come close');
assert.strictEqual(Titles.mood(null, { watching: 'clan_war' }), 'War');
assert.strictEqual(Titles.mood(null, { angry: true }), 'Angry', 'you hit it lately');
assert.strictEqual(Titles.mood(null, { activity: 'Hunting' }), 'Hunting', 'a stranger shows what it is doing');
assert.strictEqual(Titles.mood({ hostility: 12 }, { activity: 'Hunting' }), 'Grudge', 'a feeling still beats a doing');
const bag = (extra = {}) => ({ fetchHp: () => extra.hp ?? 100, fetchMaxHp: () => 100, fetchMp: () => extra.mp ?? 100,
    fetchMaxMp: () => 100, fetchPrivateStore: () => extra.store || 0, isDead: () => !!extra.dead, fetchMaxLoad: () => 1000,
    backpack: { fetchTotalLoad: () => extra.load ?? 0 },
    state: { fetchTowards: () => extra.moving ? 'move' : false, fetchSeated: () => !!extra.seated } });
const TransitPolicy = invoke('GameServer/Bot/AI/TownTransitPolicy');
const Ambient = invoke('GameServer/Bot/AI/BotAmbientDirector');
const NpcIndex = require('../src/GameServer/World/NpcObjectIndex');
const kept = { townAt: TransitPolicy.townAt, deriveMood: Ambient.deriveMood, find: NpcIndex.find };
let town = null, ambientMood = 'calm', mob = null;
TransitPolicy.townAt = () => town;
Ambient.deriveMood = () => ({ mood: ambientMood });
NpcIndex.find = () => mob;
const idle = (plan, extra = {}, short = false) => Titles.activityOf({ plan, ...extra }, bag(extra), short, 1000);
try {
    assert.strictEqual(idle('resting'), 'Resting');
    town = 'Gludin';
    assert.strictEqual(idle('shopping'), 'Shopping');
    assert.strictEqual(idle('shopping', {}, true), 'Buying', 'the faces style has short words');
    town = null;
    assert.strictEqual(idle('shopping'), 'To town', 'a shopping trip starts with the way back to town');
    assert.strictEqual(idle('hunting', { freeLoot: { itemId: 1 } }), 'Looting', 'running for free loot');
    assert.strictEqual(idle('hunting', { attentionWatch: { eventId: 1 } }), 'Watching', 'watching a fight');
    assert.strictEqual(idle('fleeing'), 'Fleeing');
    assert.strictEqual(idle('nonsense'), null);
    // The hunting plan says where the bot really is.
    mob = { isDead: () => false, fetchAttackable: () => true };
    assert.strictEqual(idle('hunting', { currentTargetId: 7 }), 'Fighting', 'a live monster as its target');
    assert.strictEqual(idle('hunting', { currentTargetId: 7 }, true), 'Fights');
    mob = { isDead: () => true, fetchAttackable: () => true };
    assert.strictEqual(idle('hunting', { currentTargetId: 7 }), 'Hunting', 'a dead target is no fight');
    mob = null;
    assert.strictEqual(idle('hunting', { moving: true }), 'Roaming', 'looking for a monster');
    assert.strictEqual(idle('hunting', { noTargetTicks: 3 }), 'No mobs', 'none around');
    assert.strictEqual(idle('hunting', { seated: true }), 'Resting');
    assert.strictEqual(idle('hunting', { spotRelocation: { spotId: 1 } }), 'Heading out', 'on its way to a spot');
    assert.strictEqual(idle('hunting', { spotRelocation: { spotId: 1 } }, true), 'To spot');
    assert.strictEqual(idle('hunting', { stuckTicks: 4 }), 'Stuck');
    town = 'Gludin';
    assert.strictEqual(idle('hunting', { moving: true }), 'Heading out', 'walking out of town');
    assert.strictEqual(idle('hunting'), 'AFK', 'standing in town is not hunting');
    ambientMood = 'restless';
    assert.strictEqual(idle('hunting'), 'Bored', 'its own mood when it stands about');
    ambientMood = 'tired';
    assert.strictEqual(idle('hunting'), 'Tired');
    ambientMood = 'sociable';
    assert.strictEqual(idle('hunting', {}, true), 'Chill');
    ambientMood = 'calm';
    assert.strictEqual(idle('hunting', { ambientScene: { expiresAt: 5000 } }), 'Chatting', 'talking with another bot');
    assert.strictEqual(idle('hunting', { ambientScene: { expiresAt: 500 } }), 'AFK', 'a finished chat');
    // A gear goal replaces a plain AFK or Hunting, never a real doing.
    const doing = (extra, stats) => Titles.doingOf({ plan: 'hunting', coldLifeState: { stats }, ...extra }, bag(extra), false, 1000);
    const market = { equipmentPlan: { status: 'active', strategy: 'market' } };
    assert.strictEqual(doing({}, market), 'Saving up', 'standing in town, saving up');
    assert.strictEqual(doing({ moving: true }, market), 'Heading out', 'the trip beats the goal');
    town = null;
    assert.strictEqual(doing({}, { equipmentPlan: { status: 'active', strategy: 'direct_drop' } }), 'Farming', 'at its spot');
    assert.strictEqual(doing({}, { equipmentPlan: { status: 'done', strategy: 'market' } }), 'Hunting', 'a finished plan');
} finally {
    TransitPolicy.townAt = kept.townAt; Ambient.deriveMood = kept.deriveMood; NpcIndex.find = kept.find;
}
// What it needs.
const want = (extra = {}, stats = {}, short = false) => Titles.wantOf({ coldLifeState: { stats } }, bag(extra), short);
assert.strictEqual(want({ dead: true }), 'Needs res', 'a dead bot');
assert.strictEqual(want({ dead: true }, {}, true), 'Res pls');
assert.strictEqual(want({ hp: 20 }), 'Needs heal', 'low on HP');
assert.strictEqual(want({ hp: 20 }, {}, true), 'Heal me');
assert.strictEqual(want({ store: 1 }), 'Selling', 'a private store');
assert.strictEqual(want({ mp: 5 }), 'Out of MP');
assert.strictEqual(want({ load: 850 }), 'Heavy bag', 'a full bag');
assert.strictEqual(want({}, { partyRequest: { status: 'open' } }), 'LFP', 'looking for a party');
assert.strictEqual(want(), null);
assert.strictEqual(Titles.goalOf({ coldLifeState: { stats: { equipmentPlan: { status: 'active', strategy: 'craft' } } } }, true), 'Gathers');
assert.strictEqual(Titles.mood(null, { want: 'Needs heal', activity: 'Hunting' }), 'Needs heal', 'a need beats a doing');

// ---------- the faces ----------
const face = (feeling, ctx, level = 21) => Titles.faceText(level, Titles.faceParts(feeling, ctx));
assert.strictEqual(face(null, { fighting: true }), 'Lv21 >:( Attacks');
assert.strictEqual(face(null, { hunting: true }), 'Lv21 >:( Revenge', 'a manhunt');
assert.strictEqual(face({ trust: 3 }, { activity: 'Hunting' }), 'Lv21 :) Hunting', 'a friendly bot at work');
assert.strictEqual(face({ fear: 12 }, { want: 'LFP', activity: 'Hunting' }), 'Lv21 o_O LFP', 'a want beats a doing');
assert.strictEqual(face({ hostility: 12 }, { activity: 'Resting' }), 'Lv21 >:| Resting', 'a grudge');
assert.strictEqual(face({}, { party: true }), 'Lv21 :D Party');
assert.strictEqual(face(null, { watching: 'revenge' }), 'Lv21 Revenge', 'a grudge waiting: no face yet');
assert.strictEqual(face({ trust: 8, affinity: 4 }, {}), 'Lv21 ^_^', 'a friend with nothing to do');
assert.strictEqual(face(null, {}), 'Lv21 Neutral');
assert.strictEqual(face(null, { activity: 'Hunting' }), 'Lv21 Hunting', 'a stranger at work');
const shortWords = ['Attacks', 'Revenge', 'War', 'Party', 'Neutral', 'Res pls', 'Heal me', 'Selling', 'No MP', 'Heavy', 'LFP', 'Saving',
    'Farming', 'Gathers', 'Looting', 'Watches', 'Chats', 'Stuck', 'Fights', 'To spot', 'Roaming', 'No mobs', 'AFK', 'Bored', 'Tired',
    'Chill', 'To town', 'Hunting', 'Resting', 'Buying', 'Follows', 'Fleeing', 'Travels', 'Buffing', 'Crafts'];
for (const w of shortWords) assert(w.length <= 7, `${w} is a short word`);
for (const w of ['Heading out', 'Needs res', 'Out of MP', 'Fighting', 'Chatting', 'Chilling', 'Needs heal', 'Heavy bag', 'Saving up'])
    assert(Titles.text(80, w).length <= Titles.MAX_LENGTH, `${w} fits at level 80`);
for (const f of Object.values(Titles.FACES)) for (const word of shortWords)
    assert(Titles.faceText(80, [f, word]).length <= Titles.MAX_LENGTH, `${f} ${word} fits at level 80`);
assert.strictEqual(Titles.text(20, 'Friendly'), 'Lv20 Friendly');
assert.strictEqual(Titles.text(76, 'Hunting you'), 'Lv76 Hunting you');
assert(Titles.text(76, 'Hunting you').length <= Titles.MAX_LENGTH, 'every title fits C4’s 16 characters');
for (const [, word] of cases) assert(Titles.text(80, word).length <= Titles.MAX_LENGTH, `${word} fits`);
for (const word of ['Fights you', 'Hunting you', 'Revenge', 'War', 'Angry', 'Party', 'Traveling', 'Following', 'Shopping', 'Watching'])
    assert(Titles.text(80, word).length <= Titles.MAX_LENGTH, `${word} fits at level 80`);

// ---------- titleOf and the refresh ----------
const saved = { assess: Memory.assess, nearest: Queries.nearestPlayer, party: Risk.sameParty, charInfo: Response.charInfo,
    enabled: Config.botMoodTitles, faces: Config.moodTitleFaces };
let feeling = { trust: 3, affinity: 1 }, assessed = 0;
const sent = [];
try {
    // The words style first.
    Config.moodTitleFaces = false;
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

    // Live PvP: the bot attacking the player, then hit by the player.
    feeling = null;
    bot.session.plan = 'hunting';
    delete bot.session.moodTitle;
    assert.strictEqual(Titles.titleOf(bot, now + 4 * Titles.REFRESH_MS), 'Lv21 Hunting', 'a stranger at work');
    bot.session.pvpRevenge = { target: player };
    delete bot.session.moodTitle;
    assert.strictEqual(Titles.titleOf(bot, now + 4 * Titles.REFRESH_MS), 'Lv21 Fights you', 'attacking the player');
    delete bot.session.pvpRevenge;
    bot.session.pvpAggressors = new Map([[268480001, { at: now }]]);
    bot.session.pvpDefense = { action: 'flee' };
    delete bot.session.moodTitle;
    assert.strictEqual(Titles.titleOf(bot, now + 4 * Titles.REFRESH_MS), 'Lv21 Angry', 'hit by the player and running');
    bot.session.pvpDefense = { action: 'fight' };
    delete bot.session.moodTitle;
    assert.strictEqual(Titles.titleOf(bot, now + 4 * Titles.REFRESH_MS), 'Lv21 Fights you', 'hit by the player and fighting back');
    delete bot.session.pvpAggressors; delete bot.session.pvpDefense;
    bot.session.pvpWatch = new Map([[268480001, { reason: 'pk' }]]);
    delete bot.session.moodTitle;
    assert.strictEqual(Titles.titleOf(bot, now + 4 * Titles.REFRESH_MS), 'Lv21 Hunting', 'a PK waiting for its moment does not give itself away');
    bot.session.pvpWatch = new Map([[268480001, { reason: 'revenge' }]]);
    delete bot.session.moodTitle;
    assert.strictEqual(Titles.titleOf(bot, now + 4 * Titles.REFRESH_MS), 'Lv21 Revenge');
    delete bot.session.pvpWatch;

    // The faces style (the default), on the same bot.
    Config.moodTitleFaces = true;
    bot.session.pvpRevenge = { target: player };
    delete bot.session.moodTitle;
    assert.strictEqual(Titles.titleOf(bot, now + 4 * Titles.REFRESH_MS), 'Lv21 >:( Attacks', 'faces: attacking the player');
    delete bot.session.pvpRevenge;
    feeling = { trust: 3 };
    bot.session.coldLifeState = { stats: { partyRequest: { status: 'open' } } };
    delete bot.session.moodTitle;
    assert.strictEqual(Titles.titleOf(bot, now + 4 * Titles.REFRESH_MS), 'Lv21 :) LFP', 'faces: friendly and wants a party');
    delete bot.session.coldLifeState;
    feeling = null;
    Config.moodTitleFaces = false;

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
    Response.charInfo = saved.charInfo; Config.botMoodTitles = saved.enabled; Config.moodTitleFaces = saved.faces;
}

console.log('Bot mood title checks passed');
