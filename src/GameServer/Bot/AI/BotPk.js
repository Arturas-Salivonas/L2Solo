'use strict';
// PK bots, the C4 way: no scripted hunters, ordinary bots with a lifecycle rule.
//
// Upstream switched the old PK encounter bots off on 2026-07-23 (BotManager: "they can
// be reintroduced as a later population phase with an explicit lifecycle rule") and
// removed their spawner in a2aed31b2; PkProfiles and PkHuntingState are left unused.
// This is that rule, for bots of the population itself:
// - Who: a solo bot whose persona leans to PvP (the pvp inclination: brawler 0.85,
//   competitive climber 0.45, most types 0.15), held back by justice, empathy and
//   caution, at level pkMinLevel or more, with no karma, not right after another PK.
// - Whom: a white player (no karma) of level pkMinLevel or more, at most LEVEL_BELOW
//   levels below the bot and LEVEL_ABOVE above it, alone (no party), never one the bot
//   counts as a friend.
// - When: once a stay, at first sight (BotRevenge.playerSeen), a seeded roll decides the
//   intent. The bot then waits (BotPvpWatch) for its moment: the player within reach,
//   busy fighting or sitting, or hurt, and a fight the bot thinks it can win by what it
//   sees (BotPvpRisk, patient: it waits out worse odds). The fight itself is a revenge
//   objective of reason 'pk' (BotRevenge.meet), so every native guard still applies.
// - After: C4 does the rest. A kill makes the bot red (PvpRules); a red bot starts no
//   fight until it has washed its karma (RevengePolicy.startsNoFight, ColdKarmaPolicy);
//   hunting bots and guards go for red names; killing it costs the player no karma.
// Settings: [BotPopulation] pkBotsEnabled, pkRate (scales every intent, 0 = none) and
// pkMinLevel; pvpAggression scales it as it scales every attack.
const Config = require('../Population/PopulationConfig');
const { scaleChance } = require('../../Social/PvpAggression');
const Situations = require('../Situations');
const TendencyRoll = require('./TendencyRoll');
const Threats = invoke('GameServer/Bot/AI/BotPvpThreats');
const Voice = invoke('GameServer/Bot/AI/BotChatVoice');

const LEVEL_BELOW = 8;
const LEVEL_ABOVE = 2;
// The moment: the player at or under this share of HP, or busy with a monster.
const HURT = 0.6;
// The bot itself starts nothing below this share of HP.
const OWN_HP = 0.7;
// One PK intent per bot at most this often (its body's memory, our choice).
const COOLDOWN_MS = 30 * 60 * 1000;
// How long an intent waits for its moment on one stay.
const WATCH_MS = 20 * 60 * 1000;
const NOTICE_RADIUS = require('../../Social/RevengePolicy').NOTICE_RADIUS;

const clamp = (n, low = 0, high = 1) => Math.max(low, Math.min(high, Number(n) || 0));
const isBot = session => String(session?.accountId || '').startsWith('bot_');
const level = actor => Number(actor?.fetchLevel?.() || 0);
const karma = actor => Number(actor?.fetchKarma?.() || 0);
const alone = session => Threats.members(session).filter(member => member !== session && member.actor).length === 0;

function settings() {
    return { enabled: Config.pkBotsEnabled !== false, rate: Math.max(0, Math.min(5, Number(Config.pkRate) || 0)),
        minLevel: Math.max(1, Number(Config.pkMinLevel) || 20) };
}

// The persona's chance to mean a PK on one stay (before pkRate and pvpAggression). A friend
// is never picked on. persona: BotPersona's ({ traits, inclinations }).
function chance(persona, relation = null) {
    const feeling = relation?.ready ? (relation.effective || relation.personal) : null;
    if (feeling && feeling.trust >= 5 && feeling.affinity > 0) return 0;
    const t = key => clamp(persona?.traits?.[key] ?? 0.5);
    const i = key => clamp(persona?.inclinations?.[key] ?? 0.15);
    return clamp(0.3 * i('pvp') ** 2 * (1 - i('justice')) * (1.3 - t('empathy')) * (1.2 - 0.6 * t('caution')), 0, 0.5);
}

function botMay(session, now, minLevel) {
    const bot = session?.actor;
    return isBot(session) && !!bot && !session.partyCompanion && !session.followPlayerSession && !session.staticService
        && !session.arenaEphemeral && !session.coldLifeState?.party?.partyId && alone(session)
        && karma(bot) === 0 && level(bot) >= minLevel && now >= Number(session.lastPkAt || 0) + COOLDOWN_MS;
}

function targetFits(bot, player, minLevel) {
    const own = level(bot), theirs = level(player);
    return !!player && !isBot(player.session) && karma(player) === 0 && theirs >= minLevel
        && theirs >= own - LEVEL_BELOW && theirs <= own + LEVEL_ABOVE;
}

// The moment a PK waits for: the player in reach, still white and alone, busy or hurt, and
// the bot fit to fight.
function moment(session, target) {
    const bot = session.actor;
    if (!targetFits(bot, target, settings().minLevel) || !alone(target.session)) return false;
    if (Threats.distance(bot, target) > NOTICE_RADIUS) return false;
    if (Number(bot.fetchHp?.()) / Math.max(1, Number(bot.fetchMaxHp?.())) < OWN_HP) return false;
    const hurt = Number(target.fetchHp?.()) / Math.max(1, Number(target.fetchMaxHp?.())) <= HURT;
    const busy = !!(target.state?.fetchHits?.() || target.state?.fetchCasts?.() || target.state?.fetchSeated?.());
    return hurt || busy;
}

function done(session, _target, outcome, now) {
    if (outcome === 'started' || outcome === 'pending') {
        session.lastPkAt = now;
        Situations.note('pk:started');
    } else Situations.note(`pk:${outcome}`);
}

// At first sight of a player with no grudge acted on (BotRevenge.playerSeen): the stay's PK
// intent, as a watch entry (BotPvpWatch.start), or null. One seeded roll per (bot, player,
// stay). relation: the bot's memory of the player (InteractionMemoryRuntime.assess).
function intent(session, player, { stay = 0, relation = null } = {}, now = Date.now()) {
    const { enabled, rate, minLevel } = settings();
    if (!enabled || !(rate > 0) || !botMay(session, now, minLevel) || !targetFits(session.actor, player, minLevel)) return null;
    const odds = scaleChance(clamp(chance(Voice.profile(session), relation) * rate), Config.pvpAggression);
    if (!(odds > 0)) return null;
    const botId = Number(session.actor.fetchId()), playerId = Number(player.fetchId());
    const roll = TendencyRoll.roll('pk_intent', botId, playerId, Number(stay) || 0);
    if (roll >= odds) return null;
    Situations.note('pk:intent');
    return { reason: 'pk', roll: 0, key: `pk:${botId}:${playerId}:${stay}`, fightKey: ['pk_fight', botId, playerId, Number(stay) || 0],
        patient: true, watchMs: WATCH_MS, ready: moment, done };
}

module.exports = { intent, chance, moment, settings, LEVEL_BELOW, LEVEL_ABOVE, HURT, OWN_HP, COOLDOWN_MS, WATCH_MS };
