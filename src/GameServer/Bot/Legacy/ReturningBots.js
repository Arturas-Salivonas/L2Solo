'use strict';
// Returning bots: the people of the last world come back (Bot/Legacy/WorldLegacy).
//
// The seeder (GeneratedColdSeeder.seedPopulation) fills each new slot with a race and a starting
// class by its quotas. A bot of the legacy roster with that race and starting class, not yet
// back in this world, takes the slot: veterans first (most worlds, then the highest level).
// It comes back as anyone does in a new world, at level 1 with a starter's kit, but as itself:
// - its name, when no character holds it (else a new one: it is still the same person);
// - its sex, and its persona exactly as it was (type, traits, inclinations: BotPersona.restore);
// - its know-how: stats.lifelongKills and stats.peoplePoints, the experience KnowledgeLearning
//   shrinks a bot's estimate errors by. A veteran judges spots, prices and people well from its
//   first day; it has to earn its levels and gear again.
// - stats.legacy: the worlds it lived, the level and class it reached, and its feelings toward
//   players by name (kept for the future; not applied yet).
// Main thread only. Settings: [BotPopulation] worldLegacyEnabled.
const Config = require('../Population/PopulationConfig');
const Legacy = require('./WorldLegacy');

let roster = null;

function load() {
    if (roster) return roster;
    const legacy = Legacy.read();
    const byStart = new Map();
    const bots = (legacy?.bots || []).filter(bot => bot?.name && bot.persona?.archetype)
        .sort((a, b) => Number(b.worlds || 0) - Number(a.worlds || 0) || Number(b.level || 0) - Number(a.level || 0)
            || String(a.name).localeCompare(String(b.name)));
    for (const bot of bots) {
        const key = `${Number(bot.race)}:${Number(bot.startClassId)}`;
        if (!byStart.has(key)) byStart.set(key, []);
        byStart.get(key).push(bot);
    }
    roster = { byStart, back: new Set(), size: bots.length };
    return roster;
}

// The world's current bots (populationSeedStates): those already back are not claimed again,
// after a restart too.
function prepare(states = []) {
    const { back } = load();
    for (const state of states) if (state?.name) back.add(String(state.name).toLowerCase());
}

// The returning bot for a slot of this race and starting class, or null.
function claim(race, classId) {
    if (Config.worldLegacyEnabled === false) return null;
    const queue = load().byStart.get(`${Number(race)}:${Number(classId)}`);
    while (queue?.length) {
        const bot = queue.shift();
        if (roster.back.has(String(bot.name).toLowerCase())) continue;
        roster.back.add(String(bot.name).toLowerCase());
        return bot;
    }
    return null;
}

// Its old name when free, else `fallback()` (the seeder's own unique name).
function nameFor(bot, fallback) {
    if (!bot?.name) return fallback();
    return invoke('Database').fetchCharacterName(bot.name)
        .then(rows => rows?.[0] ? fallback() : bot.name, () => fallback());
}

// The seeded state with the bot's know-how and its past (before its first save).
function welcome(state, bot) {
    if (!bot || !state) return state;
    const stats = state.stats || {};
    return { ...state, stats: { ...stats,
        lifelongKills: Math.max(Number(stats.lifelongKills) || 0, Number(bot.knowhow?.lifelongKills) || 0),
        peoplePoints: Math.max(Number(stats.peoplePoints) || 0, Number(bot.knowhow?.peoplePoints) || 0),
        legacy: { worlds: Number(bot.worlds) || 1, level: Number(bot.level) || 1, classId: Number(bot.lastClassId) || null,
            name: String(bot.name), feelings: (bot.feelings || []).slice(0, 8) } } };
}

function reset() {
    roster = null;
}

module.exports = { claim, prepare, nameFor, welcome, reset, load };
