'use strict';
// The main-thread half of a personal manhunt (Social/ManhuntPolicy has the rule and the
// row's shape):
// - onKilled (Actor/Generics/Die, the bot's death near a player): a player who killed
//   the bot may be marked, by one seeded roll per kill count; the bot says so.
// - meeting (BotRevenge.playerSeen): the bot sees its target again, wherever, while the
//   manhunt lasts: a watched meeting (BotPvpWatch) that walks up to the player and waits
//   out bad odds, then fights through BotRevenge.meet like any revenge.
// - found: the fight started: the row's manhunt is marked found, so the background
//   thread stops sending the bot back.
// Settings: [BotPopulation] manhuntEnabled, manhuntRate (0..5), manhuntMinutes (5..1440).
const Config = require('../Population/PopulationConfig');
const Policy = require('../../Social/ManhuntPolicy');
const { scaleChance } = require('../../Social/PvpAggression');
const Situations = require('../Situations');
const TendencyRoll = require('./TendencyRoll');

// A hunter walks up to its target from this far (BotPvpWatch approach).
const APPROACH = 3000;
const LINES = name => [`I'll be back for you, ${name}.`, `This isn't over, ${name}.`, `Remember my face, ${name}.`];

const clamp = (n, low, high) => Math.max(low, Math.min(high, Number(n) || 0));
const isBot = session => String(session?.accountId || '').startsWith('bot_');
const loc = actor => ({ locX: actor.fetchLocX(), locY: actor.fetchLocY(), locZ: actor.fetchLocZ?.() || 0 });

function settings() {
    const minutes = Number(Config.manhuntMinutes);
    return { enabled: Config.manhuntEnabled !== false, rate: clamp(Config.manhuntRate, 0, 5),
        minutes: Number.isFinite(minutes) && minutes > 0 ? clamp(minutes, 5, 1440) : 120 };
}

function rowOf(session) {
    return session?.coldLifeState
        || invoke('GameServer/Bot/Population/BotLifeState').cachedState?.(Number(session?.actor?.fetchId?.())) || null;
}

// The player's kills of this bot its enemy memory holds (BotEnemyMemory), or 0.
function rememberedKills(session, targetId) {
    try {
        const entry = invoke('GameServer/Bot/AI/BotEnemyMemory').entries(session).find(row => Number(row.id) === targetId);
        return Math.max(0, Number(entry?.kills) || 0);
    } catch { return 0; }
}

function vow(session, rival, now) {
    const Budget = invoke('GameServer/Bot/AI/BotPvpChat');
    if (!session.dataSendToOthers || !Budget.canSend(session, 'manhunt', now)) return;
    const name = String(rival.fetchName?.() || '').replace(/[^\w .-]/g, '').slice(0, 24);
    const lines = LINES(name);
    const text = lines[Math.floor(TendencyRoll.roll('manhunt_vow', Number(session.actor.fetchId()), now) * lines.length)];
    session.dataSendToOthers(invoke('GameServer/Network/Response').speak(session.actor, { kind: 0, text }), session.actor);
    Budget.record(session, 'manhunt', now);
}

// The bot's row after its death to `killer` (Die's life row): with a manhunt opened, or as it was.
function onKilled(session, state, killer, timestamp = Date.now()) {
    const { enabled, rate, minutes } = settings();
    if (!enabled || !(rate > 0) || !state || !isBot(session) || !session.actor || session.partyCompanion
        || session.staticService || session.arenaEphemeral) return state;
    const Threats = invoke('GameServer/Bot/AI/BotPvpThreats'), Risk = invoke('GameServer/Bot/AI/BotPvpRisk');
    const rival = killer ? Threats.character(killer) : null;
    if (!rival || rival === session.actor || !rival.fetchId || isBot(rival.session)
        || Risk.sameClan(session.actor, rival) || Risk.sameParty(session, rival.session)) return state;
    const targetId = Number(rival.fetchId()), botId = Number(session.actor.fetchId());
    const kills = Math.max(Policy.kills(state.stats?.manhunt, targetId, timestamp), rememberedKills(session, targetId));
    const persona = invoke('GameServer/Bot/AI/BotChatVoice').profile(session);
    const odds = scaleChance(clamp(Policy.chance(persona, kills) * rate, 0, 1), Config.pvpAggression);
    if (!(TendencyRoll.roll('manhunt', botId, targetId, kills) < odds)) {
        Situations.note('manhunt:let_go');
        return state;
    }
    const SpotService = invoke('GameServer/Bot/AI/SpotService');
    const spot = SpotService.findCurrentSpot(loc(session.actor)) || SpotService.findCurrentSpot(loc(rival));
    if (!spot) {
        Situations.note('manhunt:no_spot');
        return state;
    }
    Situations.note('manhunt:opened');
    try { vow(session, rival, timestamp); } catch (error) { invoke('FailureLog').note('manhunt.vow', error); }
    return { ...state, stats: { ...(state.stats || {}), manhunt: Policy.open({ targetId, targetName: rival.fetchName?.(),
        spotId: spot.id, at: timestamp, minutes, kills }) } };
}

function found(session, _target, outcome, now) {
    if (outcome !== 'started' && outcome !== 'pending') return;
    const state = rowOf(session), hunt = state?.stats?.manhunt;
    if (!hunt) return;
    session.coldLifeState = { ...state, stats: { ...state.stats, manhunt: { ...hunt, found: now } } };
    Situations.note('manhunt:found');
    invoke('GameServer/Bot/Population/BotLifeState').notifyNearFacts(session, 'manhunt_found');
}

// At first sight of a player (BotRevenge.playerSeen): the manhunt's meeting when the
// player is the bot's target, as a watch entry (BotPvpWatch.start), or null.
function meeting(session, player, now = Date.now()) {
    if (!settings().enabled || !isBot(session) || !player) return null;
    const state = rowOf(session);
    if (!Policy.active(state, now)) return null;
    const hunt = state.stats.manhunt, playerId = Number(player.fetchId());
    if (Number(hunt.targetId) !== playerId) return null;
    const botId = Number(session.actor.fetchId());
    Situations.note('manhunt:sighted');
    return { reason: 'manhunt', roll: 0, key: `manhunt:${botId}:${playerId}:${hunt.at}`,
        fightKey: ['manhunt_fight', botId, playerId, Number(hunt.at)], patient: true, anyStay: true, approach: APPROACH,
        until: Number(hunt.until), watchMs: Math.max(1000, Number(hunt.until) - now), done: found };
}

module.exports = { onKilled, meeting, found, settings, APPROACH };
