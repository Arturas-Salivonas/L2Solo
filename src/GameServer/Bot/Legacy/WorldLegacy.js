'use strict';
// World legacy: what a world taught its bots, kept across a wipe.
//
// A wipe (scripts/world-wipe.js: the launcher's wipe panel, npm run wipe:bots) deletes
// the characters and every row they own: their memories, personas and samples. Right
// before it, `saveBeforeWipe` reads the same connection and writes world-legacy.json in a
// legacy folder beside the world database (tmp/legacy for tmp/nodel2.sqlite; a dated copy
// too, the last KEEP kept):
// - bots: each generated bot's name, race, sex and starting class, its persona (type,
//   traits, inclinations), its know-how (stats.lifelongKills and stats.peoplePoints: the
//   experience KnowledgeLearning shrinks its estimate errors by), the level it reached
//   and its feelings toward human characters, by their names. Bots of an older legacy
//   that did not come back this world are carried on, so nobody is forgotten for
//   missing one world (at most MAX_BOTS).
// - spots: what bots really earned per spot, class and level band when hunting alone
//   (their BotHuntEfficiency rows), at the rates they earned it at.
// The next world reads it: ReturningBots brings bots back by name at level 1 with their
// persona and know-how (a fresh start, the same people); SpotLessons corrects the spot
// table's estimates by what bots measured.
//
// Plain Node (fs, path): the wipe script loads it without the game's globals.
const fs = require('fs');
const path = require('path');

const VERSION = 1;
const FILE = 'world-legacy.json';
const KEEP = 5;
const MAX_BOTS = 4000;
const BAND = 5;
const HOUR_MS = 3600000;
// The starting class of each class, by race (C4: a race's fighter and mystic roots).
const STARTS = Object.freeze({ 0: [0, 10], 1: [18, 25], 2: [31, 38], 3: [44, 49], 4: [53, 53] });
const MYSTIC = new Set([10, 11, 12, 13, 14, 15, 16, 17, 25, 26, 27, 28, 29, 30, 38, 39, 40, 41, 42, 43, 49, 50, 51, 52,
    94, 95, 96, 97, 98, 103, 104, 105, 110, 111, 112, 115, 116]);

const ROOT = path.resolve(__dirname, '../../../..');
// The legacy folder of a world: beside its database (a test's world keeps its own), or
// L2SOLO_LEGACY_DIR. Without a path, the running server's configured database.
function dir(databasePath = null) {
    if (process.env.L2SOLO_LEGACY_DIR) return process.env.L2SOLO_LEGACY_DIR;
    const world = databasePath || path.resolve(ROOT, global.options?.default?.Database?.path || 'tmp/nodel2.sqlite');
    return path.join(path.dirname(world), 'legacy');
}
const parse = (json, fallback) => { try { return json ? JSON.parse(json) : fallback; } catch { return fallback; } };
const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;

// The starting class a character of this race and class began as.
function startClassOf(race, classId) {
    const roots = STARTS[Number(race)] || [0, 10];
    return MYSTIC.has(Number(classId)) ? roots[1] : roots[0];
}

function hasTable(db, name) {
    return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
}

// One BotHuntEfficiency row as a solo sample: { spotId, classId, level, rates, exp, income, kills } an hour.
function sampleOf(row) {
    const parts = String(row?.signature || '').split(':');
    if (parts[0] !== 'net-income-v3' || parts[3] !== 'solo' || !(num(row.cycleMs) > 0) || !row.spotId) return null;
    const rate = HOUR_MS / num(row.cycleMs);
    return { spotId: String(row.spotId), classId: num(parts[1]), level: num(parts[2]), rates: parts.slice(4, 8).join(':'),
        samples: Math.max(1, num(row.samples)), exp: num(row.exp) * rate,
        income: (num(row.adena) + num(row.loot) - Math.max(0, num(row.costs))) * rate, kills: num(row.kills) * rate };
}

// The legacy of the world in `db` (a node:sqlite connection), merged with `previous`.
function collect(db, previous = null, now = Date.now()) {
    const bots = [], spotSums = new Map();
    if (!hasTable(db, 'bot_life_state') || !hasTable(db, 'bot_personas')) return { version: VERSION, exportedAt: now, bots: [], spots: [] };
    const humans = new Map(db.prepare("SELECT id, name FROM characters WHERE username NOT LIKE 'bot\\_%' ESCAPE '\\'").all()
        .map(row => [Number(row.id), String(row.name)]));
    const feelings = new Map();
    if (humans.size && hasTable(db, 'interaction_relations')) {
        for (const row of db.prepare("SELECT ownerId, targetId, rowJson FROM interaction_relations WHERE kind = 'character'").all()) {
            const name = humans.get(Number(row.targetId));
            if (!name) continue;
            const r = parse(row.rowJson, {});
            const feeling = { player: name, affinity: num(r.affinity), trust: num(r.trust), hostility: num(r.hostility),
                fear: num(r.fear), familiarity: num(r.familiarity) };
            if (!feelings.has(Number(row.ownerId))) feelings.set(Number(row.ownerId), []);
            feelings.get(Number(row.ownerId)).push(feeling);
        }
    }
    const rows = db.prepare(`SELECT c.id, c.name, c.race, c.sex, c.classId, c.level, s.statsJson,
            p.seed, p.archetype, p.traitsJson, p.inclinationsJson, p.textCard
        FROM characters c JOIN bot_life_state s ON s.characterId = c.id JOIN bot_personas p ON p.characterId = c.id
        WHERE c.username LIKE 'bot\\_%' ESCAPE '\\'`).all();
    const earlier = new Map((previous?.bots || []).map(bot => [String(bot.name).toLowerCase(), bot]));
    for (const row of rows) {
        const stats = parse(row.statsJson, {});
        if (stats.generatedIndex === undefined && !stats.generatedCold) continue;
        const before = earlier.get(String(row.name).toLowerCase());
        bots.push({ name: String(row.name), race: num(row.race), sex: num(row.sex), startClassId: startClassOf(row.race, row.classId),
            lastClassId: num(row.classId), level: num(row.level), worlds: num(before?.worlds) + 1,
            persona: { seed: String(row.seed || ''), archetype: String(row.archetype || ''), traits: parse(row.traitsJson, {}),
                inclinations: parse(row.inclinationsJson, {}), textCard: String(row.textCard || '') },
            knowhow: { lifelongKills: Math.max(num(stats.lifelongKills), num(before?.knowhow?.lifelongKills)),
                peoplePoints: Math.max(num(stats.peoplePoints), num(before?.knowhow?.peoplePoints)) },
            feelings: feelings.get(Number(row.id)) || before?.feelings || [] });
        for (const hunt of Array.isArray(stats.huntEfficiency) ? stats.huntEfficiency : []) {
            const sample = sampleOf(hunt);
            if (!sample) continue;
            const key = `${sample.spotId}|${sample.classId}|${Math.floor(sample.level / BAND)}|${sample.rates}`;
            const sum = spotSums.get(key) || { spotId: sample.spotId, classId: sample.classId, band: Math.floor(sample.level / BAND),
                rates: sample.rates, samples: 0, bots: 0, exp: 0, income: 0, kills: 0 };
            sum.samples += sample.samples; sum.bots += 1;
            sum.exp += sample.exp * sample.samples; sum.income += sample.income * sample.samples; sum.kills += sample.kills * sample.samples;
            spotSums.set(key, sum);
        }
    }
    // Bots of the older legacy that did not come back this world stay on the roster.
    const present = new Set(bots.map(bot => bot.name.toLowerCase()));
    for (const bot of previous?.bots || []) if (!present.has(String(bot.name).toLowerCase())) bots.push(bot);
    const spots = [...spotSums.values()].map(sum => ({ spotId: sum.spotId, classId: sum.classId, band: sum.band, rates: sum.rates,
        samples: sum.samples, bots: sum.bots, expPerHour: Math.round(sum.exp / sum.samples),
        incomePerHour: Math.round(sum.income / sum.samples), killsPerHour: Math.round(sum.kills / sum.samples * 10) / 10 }));
    // A spot measured in an older world and not in this one keeps its lesson.
    const measured = new Set(spots.map(spot => `${spot.spotId}|${spot.classId}|${spot.band}|${spot.rates}`));
    for (const spot of previous?.spots || []) if (!measured.has(`${spot.spotId}|${spot.classId}|${spot.band}|${spot.rates}`)) spots.push(spot);
    return { version: VERSION, exportedAt: now, worlds: num(previous?.worlds) + 1, bots: bots.slice(0, MAX_BOTS), spots };
}

function read(folder = dir()) {
    const file = path.join(folder, FILE);
    if (!fs.existsSync(file)) return null;
    const legacy = parse(fs.readFileSync(file, 'utf8'), null);
    return legacy?.version === VERSION ? legacy : null;
}

function write(legacy, folder = dir()) {
    fs.mkdirSync(folder, { recursive: true });
    const text = JSON.stringify(legacy);
    const stamp = new Date(legacy.exportedAt).toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(path.join(folder, `world-legacy-${stamp}.json`), text);
    const tmp = path.join(folder, `${FILE}.tmp`);
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, path.join(folder, FILE));
    const copies = fs.readdirSync(folder).filter(name => /^world-legacy-.+\.json$/.test(name)).sort();
    for (const old of copies.slice(0, Math.max(0, copies.length - KEEP))) fs.rmSync(path.join(folder, old), { force: true });
    return path.join(folder, FILE);
}

// Before a wipe of the bots (scope bots or all). Returns { file, bots, spots }, or null
// when the world has no generated bots to remember (the old legacy is then kept as is).
function saveBeforeWipe(db, scope, { folder = dir(), now = Date.now() } = {}) {
    if (!['bots', 'all'].includes(String(scope))) return null;
    const legacy = collect(db, read(folder), now);
    if (!legacy.bots.length && !legacy.spots.length) return null;
    return { file: write(legacy, folder), bots: legacy.bots.length, spots: legacy.spots.length };
}

module.exports = { collect, read, write, saveBeforeWipe, sampleOf, startClassOf, dir, VERSION, BAND, MAX_BOTS };
