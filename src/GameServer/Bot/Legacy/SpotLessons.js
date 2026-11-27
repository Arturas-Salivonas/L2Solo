'use strict';
// Spot lessons: what the last world's bots really earned on each spot (Bot/Legacy/WorldLegacy),
// as a correction of the spot table's estimate. Both threads, the same file, the same answer.
//
// The spot table is a simulation: it cannot know that a camp was always crowded, that its
// monsters hit harder than they look, or that a quiet field paid better than its rank. A world
// that ran for a while measured it: every bot's BotHuntEfficiency rows (solo hunts). A new world
// reads those as lessons where a bot has no samples of its own on a spot (SpotEconomics):
// - a lesson is a (spot, table role, 5-level band) at the same server rates;
// - its ratio is the measured exp an hour over the table's for this bot there;
// - ratios are divided by their median over the band's lessons, so a lesson says how a spot
//   did against the others, not how strong the bots of that world were (the bot's own
//   calibration says that);
// - it is shrunk toward 1 by its evidence (samples / (samples + SHRINK)) and held within
//   [MIN, MAX]. A band with fewer than MIN_SPOTS lessons teaches nothing.
// The bot's own samples always win: a spot it has hunted is valued by them, as before.
const Legacy = require('./WorldLegacy');

const MIN = 0.6;
const MAX = 1.5;
const SHRINK = 24;
const MIN_SPOTS = 3;

let loaded = null;

function lessons() {
    if (loaded) return loaded;
    const legacy = Legacy.read();
    const Table = invoke('GameServer/Bot/AI/SpotValueTable');
    const groups = new Map();
    for (const spot of legacy?.spots || []) {
        if (!(spot.expPerHour > 0) || !(spot.samples > 0)) continue;
        const level = spot.band * Legacy.BAND + 2;
        let role = null;
        try { role = Table.roleFor({ classId: spot.classId, level, stats: { classId: spot.classId } }); } catch { role = null; }
        if (!role) continue;
        const key = `${role}|${spot.band}|${spot.rates}`;
        const group = groups.get(key) || new Map();
        // Classes of one role on one spot are one lesson, weighted by their samples.
        const prior = group.get(spot.spotId);
        group.set(spot.spotId, prior ? { spotId: spot.spotId, samples: prior.samples + spot.samples,
            expPerHour: (prior.expPerHour * prior.samples + spot.expPerHour * spot.samples) / (prior.samples + spot.samples) }
            : { spotId: spot.spotId, samples: spot.samples, expPerHour: spot.expPerHour });
        groups.set(key, group);
    }
    loaded = { groups, revision: Number(legacy?.exportedAt || 0) };
    return loaded;
}

const ratesKey = () => {
    const rates = invoke('GameServer/ProgressionRates').profile();
    return [rates.exp, rates.adena, rates.drop, rates.spoil].join(':');
};
const median = values => {
    const sorted = [...values].sort((a, b) => a - b), mid = sorted.length >> 1;
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

// A bot's lesson factors (SpotEconomics.create): factor(spotId) is 1 without a lesson.
// valueOf(spotId): the table row of this bot (its role, level and shots) on that spot.
function forBot(state, role, valueOf) {
    const group = lessons().groups.get(`${role}|${Math.floor(Number(state?.level || 1) / Legacy.BAND)}|${ratesKey()}`);
    if (!group || group.size < MIN_SPOTS) return () => 1;
    let factors = null;
    const build = () => {
        const ratios = new Map();
        for (const lesson of group.values()) {
            const table = Number(valueOf(lesson.spotId)?.exp);
            if (table > 0) ratios.set(lesson.spotId, { ratio: lesson.expPerHour / table, samples: lesson.samples });
        }
        factors = new Map();
        if (ratios.size < MIN_SPOTS) return;
        const middle = median([...ratios.values()].map(entry => entry.ratio));
        if (!(middle > 0)) return;
        for (const [spotId, { ratio, samples }] of ratios) {
            const weight = samples / (samples + SHRINK);
            factors.set(spotId, Math.max(MIN, Math.min(MAX, 1 + weight * (ratio / middle - 1))));
        }
    };
    return spotId => {
        if (!factors) build();
        return factors.get(String(spotId)) ?? 1;
    };
}

function revision() {
    return lessons().revision;
}

function reset() {
    loaded = null;
}

module.exports = { forBot, revision, reset, MIN, MAX, SHRINK, MIN_SPOTS };
