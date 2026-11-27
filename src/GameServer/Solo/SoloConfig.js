'use strict';

// [SoloHelper] settings from config/local.ini. Every key is optional.
//   enabled     = true    false turns the helper off (Alt+B is the Market Board again)
//   altB        = true    false keeps Alt+B on the Market Board; .buffer still opens the helper
//   buffMinutes = 60      length of every buff from the helper, 1-1440
//   window      = board   board = full-width Community Board, chat = the small chat window
//   adena       = true    false hides the Adena tab and turns off .adena
//   buffSlots   = 20      your buff slots, 20 (C4) to 28; bots keep 20

const DEFAULTS = Object.freeze({ enabled: true, altB: true, buffMinutes: 60, window: 'board', adena: true, buffSlots: 20 });
const MIN_SLOTS = 20;
const MAX_SLOTS = 28;

function flag(value, fallback) {
    if (value === undefined || value === null || value === '') return fallback;
    return !/^(false|0|no|off)$/i.test(String(value).trim());
}

function slots(value) {
    const count = Math.floor(Number(value));
    return Number.isFinite(count) ? Math.max(MIN_SLOTS, Math.min(MAX_SLOTS, count)) : DEFAULTS.buffSlots;
}

function config() {
    const raw = global.options?.default?.SoloHelper || {};
    const minutes = Math.floor(Number(raw.buffMinutes));
    return {
        enabled: flag(raw.enabled, DEFAULTS.enabled),
        altB: flag(raw.altB, DEFAULTS.altB),
        buffMinutes: Number.isFinite(minutes) && minutes >= 1 ? Math.min(minutes, 24 * 60) : DEFAULTS.buffMinutes,
        window: String(raw.window || '').trim().toLowerCase() === 'chat' ? 'chat' : 'board',
        adena: flag(raw.adena, DEFAULTS.adena),
        buffSlots: slots(raw.buffSlots)
    };
}

module.exports = { DEFAULTS, MIN_SLOTS, MAX_SLOTS, config };
