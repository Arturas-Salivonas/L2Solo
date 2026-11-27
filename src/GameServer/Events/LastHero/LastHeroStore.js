'use strict';

// What Last Hero keeps across restarts, in tmp/solo/last-hero.json (L2SOLO_LAST_HERO_FILE in tests):
//   hero     the current Last Hero: { id, name, classId, level, at } - glows until the next winner
//   nextAt   when the next scheduled event opens its registration
//   history  the last 10 results: { at, winner, fighters, you: { place, kills } | null, mode }
//   prizes   Adena owed to bot winners, paid the next time the bot is active: { [characterId]: amount }

const fs = require('fs');
const nodePath = require('path');

const MAX_HISTORY = 10;

function file() {
    return nodePath.resolve(process.env.L2SOLO_LAST_HERO_FILE || 'tmp/solo/last-hero.json');
}

let cache = null;

function empty() {
    return { hero: null, nextAt: 0, history: [], prizes: {} };
}

function read() {
    if (cache) return cache;
    try {
        const parsed = JSON.parse(fs.readFileSync(file(), 'utf8'));
        cache = { ...empty(), ...(parsed && typeof parsed === 'object' ? parsed : {}) };
        if (!Array.isArray(cache.history)) cache.history = [];
        if (!cache.prizes || typeof cache.prizes !== 'object') cache.prizes = {};
    } catch {
        cache = empty();
    }
    return cache;
}

function write(next = cache) {
    cache = next;
    try {
        const target = file();
        fs.mkdirSync(nodePath.dirname(target), { recursive: true });
        const temp = `${target}.tmp`;
        fs.writeFileSync(temp, `${JSON.stringify(cache, null, 2)}\n`);
        fs.renameSync(temp, target);
    } catch (error) {
        utils.infoWarn('LastHero', 'could not save %s: %s', file(), error.message);
    }
    return cache;
}

function update(change) {
    const state = read();
    change(state);
    state.history = state.history.slice(0, MAX_HISTORY);
    return write(state);
}

// Tests start from a clean file.
function reset() {
    cache = null;
}

module.exports = { file, read, write, update, reset, MAX_HISTORY };
