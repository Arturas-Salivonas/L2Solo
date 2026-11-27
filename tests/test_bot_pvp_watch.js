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
const Config = invoke('GameServer/Bot/Population/PopulationConfig');
// The grudge cases meet only grudges: every roll here is 0, which a PK intent would pass.
const savedPk = Config.pkBotsEnabled;
Config.pkBotsEnabled = false;

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

    // ---------- PK bots (BotPk) ----------
    const Pk = invoke('GameServer/Bot/AI/BotPk');
    Config.pkBotsEnabled = true;
    const persona = (traits, inclinations) => ({ traits: { sociability: 0.5, commitment: 0.5, ambition: 0.5, resilience: 0.7, ...traits },
        inclinations: { pvp: 0.15, justice: 0.1, speculation: 0.1, ...inclinations } });
    const BRAWLER = persona({ caution: 0.22, assertiveness: 0.88, empathy: 0.25 }, { pvp: 0.85 });
    const ACHIEVER = persona({ caution: 0.6, assertiveness: 0.53, empathy: 0.55 }, {});
    const KEEPER = persona({ caution: 0.3, assertiveness: 0.76, empathy: 0.84 }, { pvp: 0.4, justice: 0.85 });
    {
        const brawler = Pk.chance(BRAWLER), achiever = Pk.chance(ACHIEVER), keeper = Pk.chance(KEEPER);
        assert(brawler > 0.15 && brawler <= 0.5, `a brawler means a PK on a fair share of stays: ${brawler}`);
        assert(achiever < 0.01, `an ordinary bot almost never: ${achiever}`);
        assert(keeper < brawler / 20, `a justice keeper next to never: ${keeper}`);
        const friend = { ready: true, personal: { trust: 8, affinity: 6, hostility: 0, fear: 0 } };
        assert.strictEqual(Pk.chance(BRAWLER, friend), 0, 'a friend is never picked on');
    }
    const pkBot = (lvl = 40) => { const bot = character(true, lvl); bot.session.persona = BRAWLER; World.insertUser(bot.session); return bot; };
    const pkPlayer = (lvl = 38) => { const player = character(false, lvl); World.insertUser(player.session); return player; };
    {
        const saved = { rate: Config.pkRate, enabled: Config.pkBotsEnabled, min: Config.pkMinLevel };
        try {
            const bot = pkBot();
            const fits = player => !!Pk.intent(bot.session, player, { stay: 1 }, now);
            assert(fits(pkPlayer(38)), 'a white player near its level is a PK target');
            assert(!fits(pkPlayer(31)), `more than ${Pk.LEVEL_BELOW} levels below: left alone`);
            assert(!fits(pkPlayer(43)), `more than ${Pk.LEVEL_ABOVE} levels above: left alone`);
            const red = pkPlayer(38); red.fetchKarma = () => 50;
            assert(!fits(red), 'a red player is a hunt for PK hunters, not a PK');
            Config.pkRate = 0;
            assert(!fits(pkPlayer(38)), 'pkRate = 0: no PK bots');
            Config.pkRate = 1; Config.pkBotsEnabled = false;
            assert(!fits(pkPlayer(38)), 'pkBotsEnabled = false: no PK bots');
            Config.pkBotsEnabled = true;
            const low = pkBot(15);
            assert(!Pk.intent(low.session, pkPlayer(15), { stay: 1 }, now), 'under pkMinLevel nobody PKs');
            const redBot = pkBot(); redBot.fetchKarma = () => 10;
            assert(!Pk.intent(redBot.session, pkPlayer(38), { stay: 1 }, now), 'a red bot washes its karma first');
            const grouped = pkBot(); grouped.session.coldLifeState = { party: { partyId: 'p1' } };
            assert(!Pk.intent(grouped.session, pkPlayer(38), { stay: 1 }, now), 'a PK hunts alone');
            const gentle = pkBot(); gentle.session.persona = ACHIEVER;
            const intentRolls = Tendency.roll;
            Tendency.roll = (...key) => key[0] === 'pk_intent' ? 0.05 : intentRolls(...key);
            try { assert(!Pk.intent(gentle.session, pkPlayer(38), { stay: 1 }, now), 'a roll above the persona\'s odds means nothing'); }
            finally { Tendency.roll = intentRolls; }
        } finally { Config.pkRate = saved.rate; Config.pkBotsEnabled = saved.enabled; Config.pkMinLevel = saved.min; }
    }
    // The flow: decided at first sight, waits for the moment, then a revenge objective of reason pk.
    {
        const bot = pkBot(), player = pkPlayer(38);
        bot.session.nearSpot = { seq: 3, spotId: 'stay-3' };
        player.x = 400;
        const chatBefore = events.length;
        assert.strictEqual(Revenge.playerSeen(bot, player, now), 'watching', 'a healthy, idle player: the PK waits');
        assert.deepStrictEqual(Watch.list(bot.session).map(e => e.reason), ['pk']);
        assert.strictEqual(Watch.tick(bot.session, now + Watch.CHECK_MS), null, 'no moment yet');
        player.hp = 45;
        const outcome = Watch.tick(bot.session, now + 2 * Watch.CHECK_MS);
        assert(['started', 'pending'].includes(outcome), `a hurt player is the moment: ${outcome}`);
        assert.strictEqual((bot.session.pvpRevenge || bot.session.pendingPvpProvocation).reason, 'pk');
        assert(Revenge.allows(bot.session, player, now + 2 * Watch.CHECK_MS), 'the native guards may let the PK swing');
        assert(events.slice(chatBefore).some(e => e[0] === 'chat' && e[1] === bot.id && /Nothing personal|Wrong place|mine now/.test(e[2])),
            'with a PK line');
        assert.strictEqual(bot.session.lastPkAt, now + 2 * Watch.CHECK_MS, 'the PK is remembered');
        reset(bot.session);
        const next = pkPlayer(38);
        assert(!Pk.intent(bot.session, next, { stay: 4 }, now + 3 * Watch.CHECK_MS), `one PK per ${Pk.COOLDOWN_MS / 60000} minutes`);
        assert(Pk.intent(bot.session, next, { stay: 4 }, now + Pk.COOLDOWN_MS + 3 * Watch.CHECK_MS), 'then it may again');
        // A busy player is a moment too, near enough to walk up to; farther is not.
        const busy = pkPlayer(38); busy.x = 300; busy.state.fetchHits = () => true;
        assert(Pk.moment(bot.session, busy), 'a player fighting a monster is the moment');
        busy.x = Pk.APPROACH + 200;
        assert(!Pk.moment(bot.session, busy), 'too far to walk up to is not');
    }

    // ---------- personal manhunts (BotManhunt) ----------
    Config.pkBotsEnabled = false;
    const Manhunt = invoke('GameServer/Bot/AI/BotManhunt');
    const SpotService = invoke('GameServer/Bot/AI/SpotService');
    const Geodata = invoke('GameServer/Geodata/GeodataEngine');
    const stubs = { spot: SpotService.findCurrentSpot, notify: Life.notifyNearFacts, height: Geodata.getHeight,
        enabled: Config.manhuntEnabled, rate: Config.manhuntRate };
    const posts = [];
    SpotService.findCurrentSpot = () => ({ id: 'hunt46' });
    Life.notifyNearFacts = (session, reason) => posts.push([session.actor.id, reason]);
    Geodata.getHeight = (_x, _y, z) => z;
    try {
        // Opening at death: by persona, never for a bot killer, a clanmate, or when switched off.
        {
            const bot = character(), killer = character(false, 40);
            bot.session.persona = BRAWLER;
            World.insertUser(bot.session); World.insertUser(killer.session);
            const before = events.length;
            const state = Manhunt.onKilled(bot.session, { stats: { deaths: 3 } }, killer, now);
            assert.deepStrictEqual({ ...state.stats.manhunt, until: 0 }, { targetId: killer.id, targetName: `actor_${killer.id}`,
                spotId: 'hunt46', at: now, until: 0, kills: 1, found: 0 }, 'the killer is marked, with the spot it happened on');
            assert.strictEqual(state.stats.manhunt.until, now + Config.manhuntMinutes * 60000);
            assert.strictEqual(state.stats.deaths, 3, 'the rest of the row stays');
            assert(events.slice(before).some(e => e[0] === 'chat' && e[1] === bot.id && /back for you|isn't over|my face/.test(e[2])),
                'the bot swears it out loud');
            const again = Manhunt.onKilled(bot.session, state, killer, now + 60000);
            assert.strictEqual(again.stats.manhunt.kills, 2, 'a second kill while it lasts escalates');
            const botKiller = character();
            const untouched = { stats: {} };
            assert.strictEqual(Manhunt.onKilled(bot.session, untouched, botKiller, now), untouched, 'bot killers are no manhunt (yet)');
            killer.clan = bot.clan = 77;
            assert.strictEqual(Manhunt.onKilled(bot.session, untouched, killer, now), untouched, 'a clanmate is forgiven');
            killer.clan = bot.clan = 0;
            Config.manhuntEnabled = false;
            assert.strictEqual(Manhunt.onKilled(bot.session, untouched, killer, now), untouched, 'manhuntEnabled = false: none');
            Config.manhuntEnabled = true; Config.manhuntRate = 0;
            assert.strictEqual(Manhunt.onKilled(bot.session, untouched, killer, now), untouched, 'manhuntRate = 0: none');
            Config.manhuntRate = 1;
            const rolls = Tendency.roll;
            Tendency.roll = (...key) => key[0] === 'manhunt' ? 0.9 : rolls(...key);
            try { assert.strictEqual(Manhunt.onKilled(bot.session, untouched, killer, now), untouched, 'a roll above the odds lets it go'); }
            finally { Tendency.roll = rolls; }
        }
        // The hunt: the bot sees its target from afar, walks up, goes for it, and stops looking.
        {
            const bot = character(), player = character(false, 40);
            bot.session.persona = BRAWLER;
            World.insertUser(bot.session); World.insertUser(player.session);
            bot.session.coldLifeState = Manhunt.onKilled(bot.session, { stats: {} }, player, now - 60000);
            const moves = [];
            bot.moveTo = ({ to }) => moves.push(to);
            bot.session.nearSpot = { seq: 7, spotId: 'hunt46' };
            player.x = 2500;
            assert.strictEqual(Revenge.playerSeen(bot, player, now), 'too_far', 'its target, seen from 2500 units');
            assert.deepStrictEqual(Watch.list(bot.session).map(e => e.reason), ['manhunt'], 'without any revenge roll');
            bot.session.nearSpot = { seq: 8, spotId: 'hunt46' };
            assert.strictEqual(Watch.tick(bot.session, now + Watch.CHECK_MS), 'approaching', 'a new stay does not end a manhunt; it walks up');
            assert(Watch.approaching(bot.session, now + Watch.CHECK_MS + 500), 'the walk owns the bot\'s ticks');
            assert.strictEqual(moves.length, 1);
            assert(Math.abs(moves[0].locX - (2500 - Watch.APPROACH_STOP)) <= 1, `it stops short of the player: ${moves[0].locX}`);
            bot.x = 2000;
            const outcome = Watch.tick(bot.session, now + 3 * Watch.CHECK_MS);
            assert(['started', 'pending'].includes(outcome), `in reach, it goes for the player: ${outcome}`);
            assert.strictEqual((bot.session.pvpRevenge || bot.session.pendingPvpProvocation).reason, 'manhunt');
            assert(events.some(e => e[0] === 'chat' && e[1] === bot.id && /Found you|came back for you|My turn/.test(e[2])), 'with its line');
            assert.strictEqual(bot.session.coldLifeState.stats.manhunt.found, now + 3 * Watch.CHECK_MS, 'the manhunt is found');
            assert.deepStrictEqual(posts.at(-1), [bot.id, 'manhunt_found'], 'and the background thread hears it');
            assert(!Watch.approaching(bot.session, now + 3 * Watch.CHECK_MS), 'the walk is over');
            reset(bot.session);
            bot.session.nearSpot = { seq: 9, spotId: 'hunt46' };
            assert.strictEqual(Manhunt.meeting(bot.session, player, now + 5000), null, 'a found manhunt meets nobody again');
            // Someone else is not its target.
            const other = character(false, 40);
            World.insertUser(other.session);
            bot.session.coldLifeState = Manhunt.onKilled(bot.session, { stats: {} }, player, now);
            assert.strictEqual(Manhunt.meeting(bot.session, other, now + 1000), null, 'only its killer is hunted');
            assert(Manhunt.meeting(bot.session, player, now + 1000), 'its killer is');
        }
    } finally {
        SpotService.findCurrentSpot = stubs.spot; Life.notifyNearFacts = stubs.notify; Geodata.getHeight = stubs.height;
        Config.manhuntEnabled = stubs.enabled; Config.manhuntRate = stubs.rate;
    }
} finally {
    utils.isInPeaceZone = original.peace; World.user = original.world; Life.rememberEnemies = original.remember;
    Budget.canSend = original.canSend; Budget.record = original.record; Response.speak = original.speak;
    BotAI.promoteForPlayerInteraction = original.promote; Config.pkBotsEnabled = savedPk;
}
console.log('Bot PvP watch checks passed');
