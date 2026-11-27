'use strict';
// Dangerous spots (Living Bots): a bot that died at a spot already keeps away from it for a while
// (SpotRiskPolicy: death pressure after two deaths there, death marks). Now it also warns its
// friends. Standing in town or resting, it tells a bot within RADIUS that trusts it
// (BotSpotTips.trusts) and could hunt there (SpotService.isSuitable), out loud, and that bot
// stays away too until its next trip back to town: a spot mark with reason heard_dangerous, which
// keeps SpotRiskPolicy's outing lifetime. A bot warns at most once per WARN_MS, and a listener
// that already marks a spot is not told again.
// Settings: [BotPopulation] spotDangerEnabled.
const Config = require('../Population/PopulationConfig');
const TendencyRoll = require('./TendencyRoll');
const Situations = require('../Situations');

const SCAN_MS = 30000;
const WARN_MS = 20 * 60000;
const RADIUS = 600;
const REASON = 'heard_dangerous';
const PLANS = new Set(['resting', 'shopping', 'hunting']);

const isBot = session => String(session?.accountId || '').startsWith('bot_');
const idOf = actor => Number(actor?.fetchId?.() || 0);
const nameOf = actor => String(actor?.fetchName?.() || '').replace(/[^\w .-]/g, '').slice(0, 24);
const enabled = () => Config.spotDangerEnabled !== false;
const Risk = () => invoke('GameServer/Bot/Population/SpotRiskPolicy');
const Life = () => invoke('GameServer/Bot/Population/BotLifeState');

const LINES = Object.freeze({
    warn: (name, spot) => [`${name}, stay away from ${spot}, I died there twice`, `careful at ${spot}, ${name}, it killed me`,
        `${name}, don't go to ${spot}, too dangerous`]
});

function rowOf(session) {
    return session?.coldLifeState || Life().cachedState?.(idOf(session?.actor)) || null;
}

// The spots a bot keeps away from because it died there.
function deadlySpots(state) {
    if (!state) return [];
    const spots = new Set(Risk().activeBackoffs(state).map(entry => String(entry.spotId)));
    const pressure = Risk().deathPressure(state);
    if (pressure?.spotId) spots.add(String(pressure.spotId));
    return [...spots];
}

function settled(session, bot) {
    return isBot(session) && !!bot && !session.partyCompanion && !session.followPlayerSession && !session.staticService
        && !session.arenaEphemeral && !bot.isDead?.() && PLANS.has(session.plan) && !session.pvpDefense && !session.pvpRevenge
        && (session.plan === 'resting' || !!utils.isInPeaceZone?.(bot.fetchLocX(), bot.fetchLocY()));
}

function say(session, text, now) {
    const Budget = invoke('GameServer/Bot/AI/BotChatterBudget');
    if (!session.dataSendToOthers || !Budget.canReply(session, now)) return false;
    session.dataSendToOthers(invoke('GameServer/Network/Response').speak(session.actor, { kind: 0, text }), session.actor);
    Budget.recordSpeaker(idOf(session.actor), now);
    return true;
}

function shortName(spot) {
    return String(spot?.name || 'that spot').split(/ - |\(/)[0].trim().slice(0, 28) || 'that spot';
}

// One look (BotAI.tick): true when this bot warned a friend.
function tick(session, bot, now = Date.now()) {
    if (!enabled() || !session || !bot || now < Number(session.dangerScanAt || 0)) return false;
    session.dangerScanAt = now + SCAN_MS;
    if (now < Number(session.dangerWarnedAt || 0) + WARN_MS || !settled(session, bot)) return false;
    const spots = deadlySpots(rowOf(session));
    if (!spots.length) return false;
    const World = invoke('GameServer/World/World');
    let peers = [];
    try {
        peers = require('../../World/ActorSpatialQueries').near(World, bot, RADIUS,
            peer => peer !== session && isBot(peer) && !!peer.actor && settled(peer, peer.actor));
    } catch { peers = []; }
    const Tips = invoke('GameServer/Bot/AI/BotSpotTips');
    const Profiles = invoke('GameServer/Bot/Population/SpotProfiles');
    const Spots = invoke('GameServer/Bot/AI/SpotService');
    for (const listener of peers) {
        const state = rowOf(listener);
        if (!state || !Tips.trusts(listener, session, now)) continue;
        const level = Number(listener.actor.fetchLevel?.() || state.level || 1);
        const spotId = spots.find(id => {
            const spot = Profiles.findById(id);
            return spot && !Risk().isMarked(state.stats, id) && Spots.isSuitable(spot, level);
        });
        if (!spotId) continue;
        const spot = Profiles.findById(spotId);
        const lines = LINES.warn(nameOf(listener.actor), shortName(spot));
        if (!say(session, lines[Math.floor(TendencyRoll.roll('danger_line', idOf(bot), spotId) * lines.length)], now)) return false;
        const stats = state.stats || {};
        listener.coldLifeState = { ...state, stats: { ...stats, spotMarks: Risk().withSpotMark(stats, spotId, REASON) } };
        Life().notifyNearFacts(listener, 'spot_warning');
        session.dangerWarnedAt = now;
        Situations.note('spot_danger:warned');
        return true;
    }
    return false;
}

module.exports = { tick, deadlySpots, LINES, REASON, WARN_MS, RADIUS };
