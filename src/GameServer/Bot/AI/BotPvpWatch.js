'use strict';
// A fight a bot decided to start against a player but could not start yet: the bot keeps
// it and tries again as the player comes in reach.
//
// Why: a bot judges a player once a stay, when the player's client first receives it
// (BotRevenge.playerSeen). A client receives characters up to 6000 units away
// (WorldConstants), but a fight starts only within RevengePolicy.NOTICE_RADIUS (900).
// So nearly every rolled meeting was spent at once as `too_far`, and a bot with a real
// grudge almost never acted on it. The watch holds the decided meeting (its roll and
// keys, never a new roll) and retries BotRevenge.meet at most once a second while it
// lasts.
//
// An entry: { reason, roll, key, fightKey } as BotRevenge.meet reads them, plus
//   until     when it lapses (default WATCH_MS from now; watchMs overrides)
//   stay      the bot's stay it was decided on (session.nearSpot.seq): a new stay
//             ends it, as a new stay rolls anew; anyStay keeps it across stays
//   patient   also waits out `outmatched` (the bot waits for a better moment,
//             BotPvpRisk reads the target's condition); else that ends it
//   ready     (session, target, now) => bool: the moment the bot waits for (none: any)
//   approach  a radius: a target seen within it but out of reach is walked up to
//             (the bot's hunting AI waits meanwhile, BotPvpDefense); none: the bot waits
//   done      (session, target, outcome, now): called once it starts or is given up
// Main only (bodies near a player). Cost: one Map check per hot tick with no entry.
const Situations = require('../Situations');
const Threats = invoke('GameServer/Bot/AI/BotPvpThreats');
const Restrictions = invoke('GameServer/Effects/EffectRestrictions');

const WATCH_MS = 10 * 60 * 1000;
const CHECK_MS = 1000;
const MAX_WATCHED = 8;
// meet's outcomes worth waiting out: the player is still out of reach, or the bot busy.
const RETRY = new Set(['too_far', 'not_ready']);
// An approach walks to this far short of the target, one leg a check; the leg owns the
// bot's ticks for APPROACH_LEG_MS. A bot under APPROACH_HP of its HP walks up to nobody.
const APPROACH_STOP = 600;
const APPROACH_LEG_MS = 1500;
const APPROACH_HP = 0.5;
const waits = (entry, outcome) => RETRY.has(outcome) || entry.patient === true && outcome === 'outmatched';
const stayOf = session => Number(session?.nearSpot?.seq || 0);

function keep(session, target, entry, now) {
    const watch = session.pvpWatch instanceof Map ? session.pvpWatch : (session.pvpWatch = new Map());
    const id = Number(target.fetchId());
    watch.delete(id);
    watch.set(id, { ...entry, targetId: id, stay: stayOf(session),
        until: Math.min(Number(entry.until) || Infinity, now + (Number(entry.watchMs) || WATCH_MS)) });
    while (watch.size > MAX_WATCHED) watch.delete(watch.keys().next().value);
    Situations.note('enemy_met:watching');
}

// One leg toward a target out of reach: a point APPROACH_STOP short of it on the line
// between them, the native move (geodata pathing). True when the bot is on its way.
function approach(session, target, entry, now) {
    const bot = session.actor, radius = Number(entry.approach) || 0, gap = Threats.distance(bot, target);
    if (!(radius > 0) || gap > radius || gap <= APPROACH_STOP || !bot.moveTo || !Restrictions.canMove(bot)
        || bot.state?.fetchCasts?.() || Number(bot.fetchHp?.()) / Math.max(1, Number(bot.fetchMaxHp?.())) < APPROACH_HP) return false;
    const k = (gap - APPROACH_STOP) / gap;
    const locX = Math.round(bot.fetchLocX() + (target.fetchLocX() - bot.fetchLocX()) * k);
    const locY = Math.round(bot.fetchLocY() + (target.fetchLocY() - bot.fetchLocY()) * k);
    const near = Number(target.fetchLocZ?.() || 0);
    const locZ = invoke('GameServer/Geodata/GeodataEngine').getHeight?.(locX, locY, near) ?? near;
    invoke('GameServer/Bot/AI/BotPvpTactics').stop(session, bot);
    session.currentTargetId = undefined;
    bot.moveTo({ from: { locX: bot.fetchLocX(), locY: bot.fetchLocY(), locZ: bot.fetchLocZ() }, to: { locX, locY, locZ } });
    session.pvpApproach = { targetId: Number(target.fetchId()), until: now + APPROACH_LEG_MS };
    Situations.note(`enemy_met:approach_${entry.reason}`);
    return true;
}

// Is the bot walking up to a watched target now (BotPvpDefense: the leg owns the tick)?
function approaching(session, now = Date.now()) {
    const leg = session?.pvpApproach;
    if (!leg) return false;
    if (leg.until > now && session.pvpWatch?.has(leg.targetId) && !session.pvpDefense && !session.pvpRevenge) return true;
    delete session.pvpApproach;
    return false;
}

function finish(session, target, entry, outcome, now) {
    delete session.pvpApproach;
    try { entry.done?.(session, target, outcome, now); }
    catch (error) { invoke('FailureLog').note('pvp_watch.done', error); }
}

// The first try of a decided meeting (at first sight): BotRevenge.meet now when its
// moment has come, else, or when meet could not start it yet, it is watched.
// Returns meet's outcome, or 'watching'.
function start(session, target, entry, now = Date.now()) {
    if (!session || !target) return 'not_eligible';
    if (entry.ready && !entry.ready(session, target, now)) {
        keep(session, target, entry, now);
        return 'watching';
    }
    const outcome = invoke('GameServer/Bot/AI/BotRevenge').meet(session, target, entry, now);
    if (waits(entry, outcome)) keep(session, target, entry, now);
    else finish(session, target, entry, outcome, now);
    return outcome;
}

// One retry pass (BotPvpDefense.tick, every hot tick of a living bot): at most one meeting
// a pass, at most one pass a second. Returns the outcome of a meeting tried and settled,
// 'approaching' when the bot set off toward one, or null.
function tick(session, now = Date.now()) {
    const watch = session?.pvpWatch;
    if (!watch?.size || now < Number(session.pvpWatchAt || 0)) return null;
    session.pvpWatchAt = now + CHECK_MS;
    const stay = stayOf(session);
    let settled = null;
    for (const [id, entry] of watch) {
        const target = invoke('GameServer/Bot/AI/BotPvpIndex').actor(id);
        if (entry.until <= now || !entry.anyStay && entry.stay !== stay || !target || !Threats.alive(target)) {
            watch.delete(id);
            Situations.note('enemy_met:watch_lapsed');
            finish(session, target, entry, 'lapsed', now);
            continue;
        }
        if (entry.ready && !entry.ready(session, target, now)) continue;
        const outcome = invoke('GameServer/Bot/AI/BotRevenge').meet(session, target, entry, now);
        if (outcome === 'too_far' && approach(session, target, entry, now)) { settled = 'approaching'; break; }
        if (waits(entry, outcome)) continue;
        watch.delete(id);
        Situations.note(`enemy_met:watched_${outcome}`);
        finish(session, target, entry, outcome, now);
        settled = outcome;
        break;
    }
    if (!watch.size) delete session.pvpWatch;
    return settled;
}

// What the bot watches for (tests, status): [{ targetId, reason, until }].
function list(session) {
    return [...(session?.pvpWatch?.values() || [])].map(({ targetId, reason, until }) => ({ targetId, reason, until }));
}

function clear(session) {
    delete session?.pvpWatch;
    delete session?.pvpWatchAt;
    delete session?.pvpApproach;
}

module.exports = { start, tick, approaching, list, clear, WATCH_MS, CHECK_MS, MAX_WATCHED, APPROACH_STOP };
