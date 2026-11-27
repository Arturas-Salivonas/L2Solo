'use strict';
// Word of mouth, the main-thread half (Social/SpotTipPolicy has the rule and the row's
// shape): two bots that trust each other, standing together near the player in town or
// resting, talk shop. The one doing better names its best hunting spot to the other, out
// loud, and the listener's row carries the tip to the background thread, whose route sends
// it to try the spot.
// - Trust: the same clan, the same party, or the listener's memory of the teller (trust 3
//   or more, no hostility: InteractionMemoryRuntime).
// - Worth telling: the teller's best sampled row (BotHuntEfficiency) earns BETTER times the
//   listener's best or more, on a spot the listener has not hunted, holds no tip for, and
//   may hunt at its level (SpotService.isSuitable).
// - Bounded: a bot looks at most every SCAN_MS, tells at most once per TELL_MS, and a
//   listener holds one tip at a time.
// Settings: [BotPopulation] wordOfMouthEnabled.
const Config = require('../Population/PopulationConfig');
const Policy = require('../../Social/SpotTipPolicy');
const Situations = require('../Situations');

const SCAN_MS = 30000;
const TELL_MS = 20 * 60 * 1000;
const RADIUS = 600;
const BETTER = 1.25;
const TRUST = 3;
const HOUR_MS = 3600000;
const PLANS = new Set(['resting', 'shopping', 'hunting']);

const isBot = session => String(session?.accountId || '').startsWith('bot_');
const Hunt = () => invoke('GameServer/Bot/AI/BotHuntEfficiency');
const Life = () => invoke('GameServer/Bot/Population/BotLifeState');

function rowOf(session) {
    return session?.coldLifeState || Life().cachedState?.(Number(session?.actor?.fetchId?.())) || null;
}

// A state's best sampled hunt: { spotId, perHour } (income per hour), or null.
function best(state, timestamp) {
    if (!state) return null;
    const top = Hunt().bestIncome(Hunt().sampledRows(state, timestamp));
    return top && top.perHour > 0 ? { spotId: String(top.spotId), perHour: top.perHour } : null;
}

function trusts(listener, teller, now) {
    const a = listener.actor, b = teller.actor;
    const clan = Number(a.fetchClanId?.() || 0);
    if (clan > 0 && clan === Number(b.fetchClanId?.() || 0)) return true;
    if (invoke('GameServer/Bot/AI/BotPvpRisk').sameParty(listener, teller)) return true;
    const who = actor => ({ id: Number(actor.fetchId()), clanId: Number(actor.fetchClanId?.() || 0) });
    const relation = invoke('GameServer/Social/InteractionMemoryRuntime').assess(who(a), who(b), {}, now);
    const feeling = relation?.ready ? relation.personal : null;
    return !!feeling && feeling.trust >= TRUST && feeling.hostility <= 0;
}

function settled(session, bot) {
    return isBot(session) && !session.partyCompanion && !session.followPlayerSession && !session.staticService
        && !session.arenaEphemeral && !bot.isDead?.() && PLANS.has(session.plan)
        && (session.plan === 'resting' || utils.isInPeaceZone?.(bot.fetchLocX(), bot.fetchLocY()))
        && !session.pvpDefense && !session.pvpRevenge;
}

function say(session, text, now) {
    const Budget = invoke('GameServer/Bot/AI/BotChatterBudget');
    if (!session.dataSendToOthers || !Budget.canReply(session, now)) return;
    session.dataSendToOthers(invoke('GameServer/Network/Response').speak(session.actor, { kind: 0, text }), session.actor);
    Budget.recordSpeaker(Number(session.actor.fetchId()), now);
}

// Is this listener worth telling about `tip` (the teller's best)?
function worth(listener, state, tip, now) {
    if (!state || Policy.active(state, now)) return false;
    const sampled = Hunt().sampledRows(state, now);
    if (sampled.some(row => String(row.spotId) === tip.spotId) || String(state.spotId ?? '') === tip.spotId) return false;
    const own = Hunt().bestIncome(sampled);
    if (own && !(tip.perHour >= own.perHour * BETTER)) return false;
    const spot = invoke('GameServer/Bot/Population/SpotProfiles').findById(tip.spotId);
    return !!spot && spot.raidBoss !== true
        && invoke('GameServer/Bot/AI/SpotService').isSuitable(spot, Number(listener.actor.fetchLevel?.() || state.level || 1));
}

// One look (BotAI.tick): true when this bot told someone a tip.
function tick(session, bot, now = Date.now()) {
    if (Config.wordOfMouthEnabled === false || !session || !bot || now < Number(session.tipScanAt || 0)) return false;
    session.tipScanAt = now + SCAN_MS;
    if (now < Number(session.tipToldAt || 0) + TELL_MS || !settled(session, bot)) return false;
    const tip = best(rowOf(session), now);
    if (!tip) return false;
    const World = invoke('GameServer/World/World');
    const peers = require('../../World/ActorSpatialQueries').near(World, bot, RADIUS,
        peer => peer !== session && isBot(peer) && !!peer.actor && settled(peer, peer.actor));
    for (const listener of peers) {
        const state = rowOf(listener);
        if (!worth(listener, state, tip, now) || !trusts(listener, session, now)) continue;
        const spot = invoke('GameServer/Bot/Population/SpotProfiles').findById(tip.spotId);
        listener.coldLifeState = { ...state, stats: { ...(state.stats || {}), spotTip: Policy.open({ spotId: tip.spotId,
            fromId: bot.fetchId(), fromName: bot.fetchName?.(), perHour: tip.perHour, at: now }) } };
        Life().notifyNearFacts(listener, 'spot_tip');
        session.tipToldAt = now;
        const name = String(listener.actor.fetchName?.() || '').replace(/[^\w .-]/g, '').slice(0, 24);
        const where = String(spot?.name || 'my spot').slice(0, 40);
        const kAdena = Math.max(1, Math.round(tip.perHour / 1000));
        say(session, `${name}, try ${where}. I make about ${kAdena}k an hour there.`, now);
        Situations.note('word_of_mouth:told');
        return true;
    }
    return false;
}

module.exports = { tick, best, trusts, worth, SCAN_MS, TELL_MS, RADIUS, BETTER, HOUR_MS };
