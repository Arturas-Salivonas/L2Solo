'use strict';
// A player's WTB shout is demand the bots' market can see.
//
// Bots read customer demand from item flow per town (MarketTradeDemand: completed board
// and NPC-shop purchases, fed by MarketCounters.supplyDeal and published to the workers
// as the 'market' table). Crafters stock and bid for what that flow shows (CrafterStock,
// MarketPricing, ProductionSalePolicy). A player's "WTB" in chat was only words: no bot
// heard what he wanted.
// - Heard: a real player's local, shout or trade chat line saying WTB / buying / buy.
//   The part after it (up to a WTS) is read for item names from the item data, longest
//   name first, at most MAX_ITEMS a line; a count only when marked (x100, 100x, 100 pcs).
// - Recorded: one receipt of that many units (1 unmarked, at most MAX_UNITS) for the
//   town nearest the player (MarketCounters.supplyDeal), the same evidence an NPC-shop
//   purchase gives. Like every item flow, it needs two receipts to show and fades with
//   the demand window. One receipt per player and item per COOLDOWN_MS, so spamming the
//   same line adds nothing.
// - Not a price signal: it moves no price index, only the units bots expect to sell.
// Settings: [BotPopulation] playerTradeShoutsEnabled.
const Config = require('../Population/PopulationConfig');
const Situations = require('../Situations');

const COOLDOWN_MS = 10 * 60 * 1000;
const MAX_UNITS = 50;
const MAX_ITEMS = 3;
const MIN_NAME = 4;
const MAX_REMEMBERED = 512;
const BUY = /(?:^|[^a-z])(wtb|buying|buy)(?![a-z])/i;
const SELL = /(?:^|[^a-z])(wts|selling|sell)(?![a-z])/i;

let names = null;
const recent = new Map();

const normal = text => ` ${String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;

// The item names, normalized, longest first (one id per name: the lowest).
function catalog() {
    if (names) return names;
    const byName = new Map();
    for (const row of invoke('GameServer/DataCache').items || []) {
        const id = Number(row?.selfId), name = normal(row?.template?.name);
        if (!(id > 0) || id === 57 || name.trim().length < MIN_NAME) continue;
        if (!byName.has(name) || byName.get(name) > id) byName.set(name, id);
    }
    names = [...byName].map(([name, selfId]) => ({ name, selfId })).sort((a, b) => b.name.length - a.name.length);
    return names;
}

// What a line asks to buy: [{ selfId, units }], or [] when it is not a WTB line.
function wanted(text) {
    const raw = String(text || '');
    const buy = BUY.exec(raw);
    if (!buy) return [];
    let part = raw.slice(buy.index + buy[0].length);
    const sell = SELL.exec(part);
    if (sell) part = part.slice(0, sell.index);
    let rest = normal(part);
    const found = [];
    for (const { name, selfId } of catalog()) {
        if (found.length >= MAX_ITEMS) break;
        const at = rest.indexOf(name);
        if (at < 0) continue;
        // The name is padded with spaces: what follows starts at the next word, what precedes
        // ends at the last one ("x100 ", "100 pcs ", " 100x").
        const after = rest.slice(at + name.length, at + name.length + 12), before = rest.slice(Math.max(0, at - 12), at);
        const count = /^x ?(\d{1,5}) /.exec(after) || /^(\d{1,5}) ?(?:pcs|pc) /.exec(after) || /(?:^| )(\d{1,5}) ?x$/.exec(before);
        found.push({ selfId, units: Math.max(1, Math.min(MAX_UNITS, Number(count?.[1]) || 1)) });
        rest = `${rest.slice(0, at)} ${rest.slice(at + name.length)}`;
    }
    return found;
}

function nearestTown(actor) {
    const x = Number(actor?.fetchLocX?.()), y = Number(actor?.fetchLocY?.());
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    let best = null;
    for (const town of Object.values(require('../../World/TownRespawn').towns)) {
        const gap = Math.hypot(town.locX - x, town.locY - y);
        if (!best || gap < best.gap) best = { name: town.name, gap };
    }
    return best?.name || null;
}

// A chat line was said (Network/Request/Speak.consume). Returns the receipts recorded.
function heard(session, data, now = Date.now()) {
    if (Config.playerTradeShoutsEnabled === false || !session?.actor || ![0, 1, 8].includes(Number(data?.kind))
        || String(session.accountId || '').startsWith('bot_')) return [];
    const items = wanted(data.text);
    if (!items.length) return [];
    const town = nearestTown(session.actor);
    if (!town) return [];
    const playerId = Number(session.actor.fetchId());
    const recorded = [];
    for (const { selfId, units } of items) {
        const key = `${playerId}:${selfId}`;
        if (now < Number(recent.get(key) || 0)) continue;
        recent.delete(key);
        recent.set(key, now + COOLDOWN_MS);
        while (recent.size > MAX_REMEMBERED) recent.delete(recent.keys().next().value);
        // A WTB names a plain item: +0 (an enchantable item's flow needs its enchant).
        invoke('GameServer/Bot/Economy/MarketCounters').supplyDeal(selfId, units, town, now, 0);
        recorded.push({ selfId, units, town });
        Situations.note('player_wtb:recorded');
    }
    return recorded;
}

function reset() {
    recent.clear();
    names = null;
}

module.exports = { heard, wanted, nearestTown, reset, COOLDOWN_MS, MAX_UNITS, MAX_ITEMS };
