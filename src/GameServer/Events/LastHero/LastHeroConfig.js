'use strict';

// [LastHero] settings. Every key is optional: config/default.ini lists them all with their
// defaults; put your own values in config/local.ini (it survives updates).
//   enabled         = true      false turns the event off
//   everyMinutes    = 120       an event starts this long after the last one ended (0 = only with Start now)
//   registerMinutes = 5         registration is open this long before an event
//   prepareSeconds  = 30        time to buff on the Coliseum floor before the fight
//   fightMinutes    = 10        when time runs out, most kills (then most HP) wins
//   fighters        = 100       fighters in one event, you included (2-136)
//   prizeAdena      = 10000000  Adena for the winner (0 = none). The old key "prize" still works.
//   prizeItems      =           extra items for the winner: itemId:count, comma separated (3470:1, 1539:5)
//   botBuffs        = self      self = bots cast their own buffs, full = a full buff set, none
//   levelGap        = 10        bots are picked near your level, at most this far when there are enough
//   winnerChat      = true      false = no "gz" chatter after the winner
//   baseBuffs       = 1204, 1086, 1085   everyone's buffs on the floor (Wind Walk, Haste, Acumen), highest level
//   draftChoices    = 10        random buffs offered to you on the floor
//   draftPicks      = 3         how many of them you pick (bots get this many at random); 0 = no draft
//   lockBuffer      = false     true = no Solo Helper buffer or Full HP/MP/CP while you are in Last Hero

const DEFAULTS = Object.freeze({ enabled: true, everyMinutes: 120, registerMinutes: 5, prepareSeconds: 30,
    fightMinutes: 10, fighters: 100, prizeAdena: 10000000, prizeItems: Object.freeze([]), botBuffs: 'self',
    levelGap: 10, winnerChat: true, baseBuffs: Object.freeze([1204, 1086, 1085]), draftChoices: 10, draftPicks: 3,
    lockBuffer: false });
const MAX_FIGHTERS = 136; // LastHeroArena.SPAWNS
const MAX_ADENA = 2147483647;

function flag(value, fallback) {
    if (value === undefined || value === null || value === '') return fallback;
    return !/^(false|0|no|off)$/i.test(String(value).trim());
}

function number(value, fallback, min, max) {
    const parsed = Math.floor(Number(String(value ?? '').replace(/[\s,_]/g, '')));
    if (value === undefined || value === null || value === '' || !Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
}

// "1204, 1086" -> [1204, 1086]; junk is skipped. An empty value keeps the default.
function ids(value, fallback) {
    if (value === undefined || value === null || String(value).trim() === '') return [...fallback];
    return String(value).split(/[,;\s]+/).map(Number).filter((id) => Number.isInteger(id) && id > 0);
}

// "3470:1, 1539:5" -> [[3470, 1], [1539, 5]]. A bad entry is skipped (and named once in the log).
const warned = new Set();
function items(value) {
    const out = [];
    for (const part of String(value || '').split(/[,;]/).map((entry) => entry.trim()).filter(Boolean)) {
        const match = /^(\d+)\s*(?:[:x*]\s*(\d+))?$/i.exec(part);
        const id = Number(match?.[1]), count = Number(match?.[2] ?? 1);
        if (!match || id <= 0 || count <= 0 || count > MAX_ADENA) {
            if (!warned.has(part)) { warned.add(part); utils.infoWarn('LastHero', 'prizeItems: "%s" is not itemId:count, skipped', part); }
            continue;
        }
        out.push([id, count]);
    }
    return out;
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
        prizeAdena: number(raw.prizeAdena ?? raw.prize, DEFAULTS.prizeAdena, 0, MAX_ADENA),
        prizeItems: items(raw.prizeItems),
        botBuffs: ['full', 'self', 'none'].includes(buffs) ? buffs : DEFAULTS.botBuffs,
        levelGap: number(raw.levelGap, DEFAULTS.levelGap, 0, 80),
        winnerChat: flag(raw.winnerChat, DEFAULTS.winnerChat),
        baseBuffs: ids(raw.baseBuffs, DEFAULTS.baseBuffs),
        draftChoices: number(raw.draftChoices, DEFAULTS.draftChoices, 1, 20),
        draftPicks: number(raw.draftPicks, DEFAULTS.draftPicks, 0, 10),
        lockBuffer: flag(raw.lockBuffer, DEFAULTS.lockBuffer)
    };
}

module.exports = { DEFAULTS, MAX_FIGHTERS, config, items };
