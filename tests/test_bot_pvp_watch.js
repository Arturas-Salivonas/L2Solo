require('./helpers/databaseIsolation');
delete process.env.L2NODE_CONFIG_FILE;
delete process.env.L2NODE_SHARED_CONFIG_FILE;
delete process.env.N53_GAME_ROOT;
const fixture = require('./helpers/isolatedSocialDatabase')('pvp-watch');
process.once('exit', () => require('node:fs').rmSync(fixture.directory, { recursive: true, force: true }));
const assert = require('assert');
require('../src/Global');
fixture.assertConfigured(options.default);
invoke('GameServer/DataCache').init();
// The can-I-win and meeting rolls: 0 passes every chance above 0.
const Tendency = require('../src/GameServer/Bot/AI/TendencyRoll');
const rolls = [];
let fightRoll = 0; // the can-I-win roll of the test's own entries (keys starting 'test')
Tendency.roll = (...key) => { rolls.push(key.join(':')); return key[0] === 'test' ? fightRoll : 0; };
const SocialMemory = invoke('GameServer/Social/InteractionMemoryRuntime');
const SocialPolicy = require('../src/GameServer/Social/InteractionMemoryPolicy');
const Revenge = invoke('GameServer/Bot/AI/BotRevenge');
const Watch = invoke('GameServer/Bot/AI/BotPvpWatch');
const Defense = invoke('GameServer/Bot/AI/BotPvpDefense');
const World = invoke('GameServer/World/World');
const Budget = invoke('GameServer/Bot/AI/BotPvpChat');
const Response = invoke('GameServer/Network/Response');
const BotAI = invoke('GameServer/Bot/BotAI');
const Life = invoke('GameServer/Bot/Population/BotLifeState');

let now = Date.now(), serial = 2300000;
const events = [];
function character(bot = true, level = 40) {
    const a = { id: serial++, x: 0, hp: 100, mp: 100, level, gear: 100000, flag: 0, dead: false, clan: 0, effects: {}, rank: bot ? 'c' : 'none',
        fetchId() { return this.id; }, fetchName() { return `actor_${this.id}`; }, fetchLevel() { return this.level; },
        fetchClassId: () => 0, fetchLocX() { return this.x; }, fetchLocY: () => 0, fetchLocZ: () => 0,
        fetchHp() { return this.hp; }, fetchMaxHp: () => 100, fetchMp() { return this.mp; }, fetchMaxMp: () => 100,
        fetchPvpFlag() { return this.flag; }, fetchKarma: () => 0, fetchClanId() { return this.clan; },
        fetchIsOnline: () => true, isDead() { return this.dead; }, unselect() {}, select() {},
        state: { fetchDead: () => a.dead, fetchSeated: () => false, fetchCasts: () => false, fetchHits: () => false,
            fetchTowards: () => false, setHits() {}, setCasts() {} },
        automation: { abortAll() {} },
        skillset: { fetchSkills: () => [] },
        backpack: { fetchItems: () => [{ fetchEquipped: () => true, fetchSelfId: () => 999999, fetchPrice: () => a.gear,
            fetchSlot: () => 7, fetchRank: () => a.rank }] }
    };
    a.session = { actor: a, aiActive: bot, accountId: `${bot ? 'bot' : 'player'}_${a.id}`, plan: 'hunting',
        persona: { traits: { caution: 0.3, assertiveness: 0.8, empathy: 0.4, resilience: 0.8 } },
        fetchAccountId() { return this.accountId; },
        dataSendToOthers(packet) { events.push(['chat', a.id, packet]); } };
    if (bot) SocialMemory.accept(SocialPolicy.empty(a.id));
    return a;
}
// A holder's memory grows from its own last snapshot: the runtime takes only a newer revision.
const snapshots = new Map();
function grudge(holder, target, tag) {
    let snapshot = snapshots.get(holder.id) || SocialPolicy.empty(holder.id);
    for (const [i, type] of ['attacked', 'killed', 'killed'].entries()) snapshot = SocialPolicy.apply(snapshot,
        { key: `${tag}:${i}`, sourceId: holder.id, targetId: target.id, type, at: now }, now).snapshot;
    snapshots.set(holder.id, snapshot);
    SocialMemory.accept(snapshot);
}
const reset = session => { Defense.clear(session); delete session.pendingPvpProvocation; Watch.clear(session); };

const original = { peace: utils.isInPeaceZone, world: World.user, remember: Life.rememberEnemies,
    canSend: Budget.canSend, record: Budget.record, speak: Response.speak, promote: BotAI.promoteForPlayerInteraction };
try {
    utils.isInPeaceZone = () => false;
    Life.rememberEnemies = () => Promise.resolve(true);
    Budget.canSend = () => true; Budget.record = () => {};
    Response.speak = (_actor, data) => data.text;
    BotAI.promoteForPlayerInteraction = () => {};
    World.user = { sessions: [], revision: 0 };

    // The bug: a client sees a bot from 6000 units, a fight starts within 900. A grudge rolled
    // at first sight from 3000 away used to end as too_far, its one roll spent.
    {
        const bot = character(), player = character(false, 38);
        World.insertUser(bot.session); World.insertUser(player.session);
        grudge(bot, player, 'far');
        bot.session.nearSpot = { seq: 1, spotId: 'stay-1' };
        player.x = 3000;
        assert.strictEqual(Revenge.playerSeen(bot, player, now), 'too_far', 'first sight from 3000 units is out of reach');
        assert.deepStrictEqual(Watch.list(bot.session).map(e => [e.targetId, e.reason]), [[player.id, 'revenge']],
            'the decided meeting is kept, not spent');
        assert.strictEqual(Watch.tick(bot.session, now + 10), null, 'retries wait a second');
        assert.strictEqual(Watch.tick(bot.session, now + Watch.CHECK_MS), null, 'still out of reach: still watched');
        assert.strictEqual(Watch.list(bot.session).length, 1);
        const meetingRolls = rolls.filter(key => key.startsWith('enemy_met:')).length;
        player.x = 600;
        const outcome = Watch.tick(bot.session, now + 2 * Watch.CHECK_MS);
        assert(['started', 'pending'].includes(outcome), `in reach, the kept meeting starts: ${outcome}`);
        assert(bot.session.pvpRevenge?.target === player || bot.session.pendingPvpProvocation?.target === player,
            'the bot goes for the player it remembered');
        assert(events.some(e => e[0] === 'chat' && e[1] === bot.id && /remember|score|forgotten/i.test(e[2])), 'with its warning line');
        assert.strictEqual(rolls.filter(key => key.startsWith('enemy_met:')).length, meetingRolls, 'no new meeting roll on a retry');
        assert.deepStrictEqual(Watch.list(bot.session), [], 'a started meeting leaves the watch');
        reset(bot.session);
    }
    // The watch ends with the stay it was decided on, and when it lapses.
    {
        const bot = character(), player = character(false, 38);
        World.insertUser(bot.session); World.insertUser(player.session);
        grudge(bot, player, 'stay');
        bot.session.nearSpot = { seq: 4, spotId: 'stay-4' };
        player.x = 4000;
        assert.strictEqual(Revenge.playerSeen(bot, player, now), 'too_far');
        bot.session.nearSpot = { seq: 5, spotId: 'stay-5' };
        player.x = 100;
        assert.strictEqual(Watch.tick(bot.session, now + 5000), null, 'a new stay lapses the old decision');
        assert.deepStrictEqual(Watch.list(bot.session), []);
        assert(!bot.session.pvpRevenge && !bot.session.pendingPvpProvocation, 'and starts nothing');

        player.x = 4000;
        const another = character(false, 38);
        World.insertUser(another.session);
        grudge(bot, another, 'lapse');
        another.x = 4000;
        assert.strictEqual(Revenge.playerSeen(bot, another, now), 'too_far');
        another.x = 100;
        assert.strictEqual(Watch.tick(bot.session, now + Watch.WATCH_MS + 1), null, 'a lapsed decision starts nothing');
        assert.deepStrictEqual(Watch.list(bot.session), []);
        reset(bot.session);
    }
    // No grudge, nothing watched; the bot's death clears what it watched.
    {
        const bot = character(), stranger = character(false, 38), foe = character(false, 38);
        World.insertUser(bot.session); World.insertUser(stranger.session); World.insertUser(foe.session);
        bot.session.nearSpot = { seq: 1, spotId: 'stay-1' };
        stranger.x = foe.x = 3000;
        grudge(bot, foe, 'death');
        assert.strictEqual(Revenge.playerSeen(bot, stranger, now), null, 'a stranger is no meeting');
        assert.strictEqual(Revenge.playerSeen(bot, foe, now), 'too_far');
        assert.strictEqual(Watch.list(bot.session).length, 1);
        Defense.clear(bot.session, { dead: true });
        assert.deepStrictEqual(Watch.list(bot.session), [], 'a dead bot watches nobody');
    }
    // An entry's own moment (ready) and patience (outmatched), as PK and manhunt entries use them.
    {
        const bot = character(), player = character(false, 38);
        World.insertUser(bot.session); World.insertUser(player.session);
        grudge(bot, player, 'moment');
        player.x = 300;
        let moment = false;
        const done = [];
        const entry = { reason: 'revenge', roll: 0, key: 'test:moment', fightKey: ['test', bot.id, player.id], patient: true,
            ready: () => moment, done: (_s, _t, outcome) => done.push(outcome) };
        assert.strictEqual(Watch.start(bot.session, player, entry, now), 'watching', 'before its moment it only watches');
        assert.strictEqual(Watch.tick(bot.session, now + Watch.CHECK_MS), null);
        assert.deepStrictEqual(done, []);
        fightRoll = 0.99; // above every can-I-win chance (at most 0.98): outmatched, a patient bot waits
        moment = true;
        assert.strictEqual(Watch.tick(bot.session, now + 2 * Watch.CHECK_MS), null, 'outmatched: a patient entry waits');
        assert.strictEqual(Watch.list(bot.session).length, 1);
        fightRoll = 0;
        const outcome = Watch.tick(bot.session, now + 3 * Watch.CHECK_MS);
        assert(['started', 'pending'].includes(outcome), `the moment and the odds came: ${outcome}`);
        assert.deepStrictEqual(done, [outcome], 'done hears the outcome once');
        reset(bot.session);
    }
} finally {
    utils.isInPeaceZone = original.peace; World.user = original.world; Life.rememberEnemies = original.remember;
    Budget.canSend = original.canSend; Budget.record = original.record; Response.speak = original.speak;
    BotAI.promoteForPlayerInteraction = original.promote;
}
console.log('Bot PvP watch checks passed');
