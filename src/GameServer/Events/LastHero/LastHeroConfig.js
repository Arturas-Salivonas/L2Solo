'use strict';

// [LastHero] settings from config/local.ini. Every key is optional.
//   enabled         = true      false turns the event off
//   everyMinutes    = 120       an event starts this long after the last one ended (0 = only by hand)
//   registerMinutes = 5         registration is open this long before an event
//   prepareSeconds  = 30        time to buff on the Coliseum floor before the fight
//   fightMinutes    = 10        when time runs out, most kills (then most HP) wins
//   fighters        = 100       fighters in one event, you included (2-136)
//   prize           = 10000000  Adena for the winner
//   botBuffs        = full      full = bots get a full buff set, self = their own buffs, none
//   levelGap        = 10        bots are picked closest to your level, at most this far when there are enough

const DEFAULTS = Object.freeze({ enabled: true, everyMinutes: 120, registerMinutes: 5, prepareSeconds: 30,
    fightMinutes: 10, fighters: 100, prize: 10000000, botBuffs: 'full', levelGap: 10 });
const MAX_FIGHTERS = 136; // LastHeroArena.SPAWNS

function flag(value, fallback) {
    if (value === undefined || value === null || value === '') return fallback;
    return !/^(false|0|no|off)$/i.test(String(value).trim());
}

function number(value, fallback, min, max) {
    const parsed = Math.floor(Number(value));
    if (value === undefined || value === null || value === '' || !Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
}

function config() {
    const raw = global.options?.default?.LastHero || {};
    const buffs = String(raw.botBuffs || '').trim().toLowerCase();
    return {
        enabled: flag(raw.enabled, DEFAULTS.enabled),
        everyMinutes: number(raw.everyMinutes, DEFAULTS.everyMinutes, 0, 7 * 24 * 60),
        registerMinutes: number(raw.registerMinutes, DEFAULTS.registerMinutes, 0, 60),
        prepareSeconds: number(raw.prepareSeconds, DEFAULTS.prepareSeconds, 5, 300),
        fightMinutes: number(raw.fightMinutes, DEFAULTS.fightMinutes, 1, 60),
        fighters: number(raw.fighters, DEFAULTS.fighters, 2, MAX_FIGHTERS),
        prize: number(raw.prize, DEFAULTS.prize, 0, 2147483647),
        botBuffs: ['full', 'self', 'none'].includes(buffs) ? buffs : DEFAULTS.botBuffs,
        levelGap: number(raw.levelGap, DEFAULTS.levelGap, 0, 80)
    };
}

module.exports = { DEFAULTS, MAX_FIGHTERS, config };
