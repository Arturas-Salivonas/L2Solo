'use strict';
// A personal manhunt: a bot a player killed may come back for that player. Pure, for
// both threads:
// - main opens it at the bot's death (Bot/AI/BotManhunt.onKilled) on the bot's row,
//   stats.manhunt, which reaches the background thread with the body's next post;
// - the background thread sends the bot back to the spot where it died while the
//   manhunt lasts (Bot/Population/BotRoute.huntSpot, before its own hunting choice);
// - main starts the fight when the bot sees the player again (BotManhunt.meeting,
//   through BotPvpWatch), and marks the manhunt found.
// It never gives the bot knowledge it lacks: it goes where it last met its killer. A
// bot with karma washes it first (no fight outside a war, RevengePolicy.startsNoFight).
//
// stats.manhunt = { targetId, targetName, spotId, at, until, kills, found }
//   kills: the target's kills of this bot that this manhunt counts (escalation)
//   found: when the bot met the target and went for it (0: still looking)

const clamp = (n, low = 0, high = 1) => Math.max(low, Math.min(high, Number(n) || 0));

// The chance one death opens a manhunt (before the setting's rate and pvpAggression):
// assertive and PvP-minded bots come back, empathy and caution hold them back, and each
// further kill by the same player while one lasts adds to it (ours, not C4).
// At average traits: about 5% for a first kill, 20% for a second; a brawler about 48%.
function chance(persona, kills = 1) {
    const t = key => clamp(persona?.traits?.[key] ?? 0.5);
    const i = key => clamp(persona?.inclinations?.[key] ?? 0.15);
    return clamp(0.05 + 0.25 * t('assertiveness') + 0.35 * i('pvp') + 0.15 * (Math.max(1, Number(kills) || 1) - 1)
        - 0.2 * t('empathy') - 0.15 * t('caution'), 0, 0.75);
}

// Does the row's manhunt still send the bot looking (not found, not lapsed, no karma)?
function active(state, timestamp = Date.now()) {
    const hunt = state?.stats?.manhunt;
    return !!hunt && !hunt.found && Number(hunt.targetId) > 0 && hunt.spotId != null && Number(hunt.until) > timestamp
        && !(Number(state.stats?.karma) > 0);
}

// The part of the bot's held hunting choice the manhunt moves (BotRoute.heldHuntSpot's key).
function routeKey(state, timestamp = Date.now()) {
    return active(state, timestamp) ? `${state.stats.manhunt.targetId}@${state.stats.manhunt.spotId}` : '';
}

// The kills a new death by `targetId` counts: one more than a manhunt on the same target
// that still lasts (found or not), else one.
function kills(previous, targetId, at) {
    return previous && Number(previous.targetId) === Number(targetId) && Number(previous.until) > at
        ? Math.max(1, Number(previous.kills) || 1) + 1 : 1;
}

function open({ targetId, targetName = '', spotId, at, minutes = 120, kills: count = 1 }) {
    return { targetId: Number(targetId), targetName: String(targetName || '').replace(/[^\w .-]/g, '').slice(0, 24),
        spotId: String(spotId), at: Number(at), until: Number(at) + Math.round(Number(minutes) * 60000),
        kills: Math.max(1, Number(count) || 1), found: 0 };
}

module.exports = { chance, active, routeKey, kills, open };
