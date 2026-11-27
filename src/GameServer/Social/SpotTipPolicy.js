'use strict';
// Word of mouth: a hunting-spot tip from a bot the listener trusts. Pure, for both threads:
// - main gives it (Bot/AI/BotSpotTips: two trusted bots together near the player, the one
//   doing better names its best spot) on the listener's row, stats.spotTip, which reaches
//   the background thread with the body's next post;
// - the background thread's route sends the listener to try that spot while the tip lasts
//   and it has no samples of its own there (Bot/Population/BotRoute.huntSpot);
// - once it has hunted there (BotHuntEfficiency.sampledRows names the spot), its own
//   experience decides, as for any spot: a tip is a reason to try, never a verdict.
// Before this a bot calibrated spots with its own samples only (BotHuntEfficiency: "No
// cohort median"); nothing one bot learned reached another.
//
// stats.spotTip = { spotId, fromId, fromName, perHour, at, until }
const TIP_MS = 2 * 60 * 60 * 1000;

// Does the row's tip still send the bot to try the spot (fresh, untried, no karma)?
// sampled: the bot's sampled hunt rows when the caller has them.
function active(state, timestamp = Date.now(), sampled = null) {
    const tip = state?.stats?.spotTip;
    if (!tip || tip.spotId == null || !(Number(tip.until) > timestamp) || Number(state.stats?.karma) > 0) return false;
    const rows = sampled || invoke('GameServer/Bot/AI/BotHuntEfficiency').sampledRows(state, timestamp);
    return !rows.some(row => String(row.spotId) === String(tip.spotId));
}

// The part of the bot's held hunting choice a tip moves (BotRoute.heldHuntSpot's key).
function routeKey(state, timestamp = Date.now()) {
    return active(state, timestamp) ? `tip:${state.stats.spotTip.spotId}` : '';
}

function open({ spotId, fromId, fromName = '', perHour = 0, at, minutes = TIP_MS / 60000 }) {
    return { spotId: String(spotId), fromId: Number(fromId), fromName: String(fromName || '').replace(/[^\w .-]/g, '').slice(0, 24),
        perHour: Math.round(Number(perHour) || 0), at: Number(at), until: Number(at) + Math.round(Number(minutes) * 60000) };
}

module.exports = { active, routeKey, open, TIP_MS };
