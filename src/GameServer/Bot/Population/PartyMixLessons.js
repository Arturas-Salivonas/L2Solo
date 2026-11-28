'use strict';

// Living Bots: what party mixes work where. Bots learn, from their own background parties,
// which class mix earns most at a spot and level band, as C4 players learn that "dagger +
// two nukers" clears a zone faster than "tank + healer + archer": each member's commit in an
// ordinary party adds its hour there (the exp, the Adena and the deaths since its last commit)
// to the row of its party's spot, its level band and its mix (the members' roles: 'dps2+healer1').
//
// Recruiting reads it (BackgroundPartyComposition.selectRecruits, options.mix): among the
// candidates, the one whose role makes the mix that earned most there, and a support role is
// skipped when the mix without it clearly earned more. One recruit choice in EXPLORE tries
// another mix, so the lessons keep growing. A row needs MIN_HOURS of member-hours before it
// counts. Kept across restarts (and bot wipes) beside the world database (tmp/nodel2.party-mix.json), at most MAX_ROWS rows.
// Main only. [BotPopulation] partyMixLessons, partyMixExplore.

const fs = require('fs');
const nodePath = require('path');
const Config = require('./PopulationConfig');

const MAX_ROWS = 4000;
const MIN_HOURS = 1;            // member-hours before a row counts
const STEP_CAP_MS = 10 * 60000; // a longer gap between two commits is not one hour of hunting
const HALF_LIFE_HOURS = 48;     // older hours weigh less as new ones come
const SAVE_MS = 5 * 60000;
const BAND = 5;

const rows = new Map();          // key -> { spot, band, mix, hours, exp, adena, deaths, at }
const last = new Map();          // characterId -> { at, exp, adena, deaths, partyId }
let loaded = false, dirty = false, timer = null;

// Beside the world database (tmp/nodel2.party-mix.json): a test's own database has its own.
function file() {
    if (process.env.L2SOLO_PARTY_MIX_FILE) return nodePath.resolve(process.env.L2SOLO_PARTY_MIX_FILE);
    const world = String(globalThis.options?.default?.Database?.path || 'tmp/nodel2.sqlite');
    return nodePath.resolve(`${world.replace(/\.sqlite$/i, '')}.party-mix.json`);
}
function load() {
    if (loaded) return;
    loaded = true;
    try {
        const saved = JSON.parse(fs.readFileSync(file(), 'utf8'));
        for (const row of Array.isArray(saved?.rows) ? saved.rows : []) if (row?.spot && row.mix) rows.set(keyOf(row.spot, row.band, row.mix), row);
    } catch { /* none yet */ }
}
function save() {
    if (!dirty) return;
    dirty = false;
    try {
        const target = file(), temp = `${target}.tmp`;
        fs.mkdirSync(nodePath.dirname(target), { recursive: true });
        fs.writeFileSync(temp, `${JSON.stringify({ version: 1, rows: [...rows.values()] })}\n`);
        fs.renameSync(temp, target);
    } catch (error) {
        invoke('FailureLog')?.note?.('party_mix.save', error);
    }
}

const keyOf = (spot, band, mix) => `${spot}|${band}|${mix}`;
const bandOf = level => Math.floor(Math.max(1, Number(level) || 1) / BAND) * BAND;
const roleOf = state => invoke('GameServer/Bot/Population/BackgroundPartyComposition').roleForState(state);
function mixOf(roles) {
    const counts = {};
    for (const role of roles) counts[role] = (counts[role] || 0) + 1;
    return Object.keys(counts).sort().map(role => `${role}${counts[role]}`).join('+');
}
const ordinary = party => {
    const objective = party?.stats?.objective;
    return party?.status === 'active' && !objective?.clanGoalKey && !objective?.raidBoss && !objective?.opportunisticRaid
        && !['raid', 'war'].includes(objective?.sourceKind) && !party.stats?.warOperation;
};
const facts = state => ({ exp: Number(state.stats?.exp ?? state.exp) || 0, adena: Number(state.adena) || 0,
    deaths: Number(state.stats?.deaths) || 0 });

// One member's commit: its time in its party since its last commit, added to the party's row.
function committed(previous, state, now = Date.now()) {
    try {
        if (Config.partyMixLessons === false || !state || state.phase !== 'cold') return false;
        const id = Number(state.characterId), partyId = state.party?.partyId || state.partyId || null;
        const before = last.get(id), seen = { at: now, partyId, ...facts(state) };
        if (!partyId) { last.delete(id); return false; }
        if (!last.has(id) && last.size >= 8192) last.delete(last.keys().next().value);
        last.set(id, seen);
        if (!before || before.partyId !== partyId) return false;
        const elapsed = now - before.at;
        if (!(elapsed > 0) || elapsed > STEP_CAP_MS) return false;
        const party = invoke('GameServer/Bot/Population/BackgroundPartyState').find(partyId);
        if (!ordinary(party) || !party.spotId) return false;
        const Life = invoke('GameServer/Bot/Population/BotLifeState');
        const members = (party.memberIds || []).map(member => Number(member) === id ? state : Life.cachedState(member)).filter(Boolean);
        if (members.length < 2) return false;
        return add(String(party.spotId), bandOf(Math.max(...members.map(member => Number(member.level) || 1))),
            mixOf(members.map(roleOf)), elapsed / 3600000, {
                exp: Math.max(0, seen.exp - before.exp), adena: Math.max(0, seen.adena - before.adena),
                deaths: Math.max(0, seen.deaths - before.deaths) }, now);
    } catch (error) {
        invoke('FailureLog')?.note?.('party_mix.committed', error);
        return false;
    }
}

function add(spot, band, mix, hours, gained, now = Date.now()) {
    load();
    const key = keyOf(spot, band, mix);
    let row = rows.get(key);
    if (!row) {
        if (rows.size >= MAX_ROWS) {
            let oldest = null;
            for (const [name, held] of rows) if (!oldest || held.at < oldest[1].at) oldest = [name, held];
            if (oldest) rows.delete(oldest[0]);
        }
        row = { spot, band, mix, hours: 0, exp: 0, adena: 0, deaths: 0, at: now };
        rows.set(key, row);
    }
    // Older hours fade (their half-life in hours of this row's own time).
    const keep = Math.pow(0.5, Math.max(0, (now - row.at) / 3600000) / HALF_LIFE_HOURS);
    for (const name of ['hours', 'exp', 'adena', 'deaths']) row[name] *= keep;
    row.hours += hours; row.exp += gained.exp; row.adena += gained.adena; row.deaths += gained.deaths; row.at = now;
    dirty = true;
    return true;
}

// The known mixes at a spot and band, each scored against the others there: its exp and its
// Adena per member-hour over their means, its deaths per hour taken off. [{ mix, score, hours }]
function known(spot, level) {
    load();
    const band = bandOf(level);
    const here = [...rows.values()].filter(row => row.spot === String(spot) && row.band === band && row.hours >= MIN_HOURS);
    if (!here.length) return [];
    const mean = name => here.reduce((sum, row) => sum + row[name] / row.hours, 0) / here.length || 1;
    const exp = mean('exp'), adena = mean('adena');
    return here.map(row => ({ mix: row.mix, hours: row.hours,
        score: row.exp / row.hours / exp + row.adena / row.hours / adena - row.deaths / row.hours }))
        .sort((a, b) => b.score - a.score);
}

// A recruiter's reader: the score of the mix a roster makes (null: not known there), and
// whether this choice explores. options.mix = { spotId, level } (BackgroundPartyComposition).
function reader({ spotId, level } = {}, random = Math.random) {
    if (Config.partyMixLessons === false || !spotId) return null;
    const scores = new Map(known(spotId, level).map(row => [row.mix, row.score]));
    if (!scores.size) return null;
    const explore = random() < Math.max(0, Math.min(1, Number(Config.partyMixExplore ?? 0.1)));
    return { explore, score: roles => (scores.has(mixOf(roles)) ? scores.get(mixOf(roles)) : null) };
}

function start() {
    load();
    if (timer) return;
    timer = setInterval(save, SAVE_MS);
    timer.unref?.();
}
function stop() { clearInterval(timer); timer = null; save(); }

module.exports = { committed, add, known, reader, mixOf, bandOf, start, stop, save, MIN_HOURS,
    _reset() { rows.clear(); last.clear(); loaded = true; dirty = false; } };
