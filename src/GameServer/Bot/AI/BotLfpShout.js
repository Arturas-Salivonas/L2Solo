'use strict';

// Living Bots: a bot that opens a party request for a spot says so in trade chat, as a C4
// player does: "LF healer for Cruma Tower, 31+". A request for a stronger zone a party pays
// for (PartyRequestPlanner party_progress) or for any party at all (no_solo_ground). Sent
// through the trade chat line (BotTradeChat.deliver: online players hear it, at its global
// and per-bot pace, so it never floods), at most once per SHOUT_MS a bot, a social bot more
// often than a loner. Main only: read where every committed state lands (BotLifeState's
// publications). [BotPopulation] lfpShoutsEnabled.

const Config = require('../Population/PopulationConfig');

const REASONS = new Set(['party_progress', 'no_solo_ground']);
const SHOUT_MS = 10 * 60000;
const HISTORY = 2048;
const lastAt = new Map();

const openKey = (request) => (request?.status === 'open' && REASONS.has(request.reason) ? `${request.reason}:${request.objectiveKey}` : null);
const pick = (rows, random) => rows[Math.min(rows.length - 1, Math.floor(random() * rows.length))];

function spotName(spotId) {
    try {
        const spots = invoke('GameServer/Bot/Population/SpotProfiles').ensure();
        const name = invoke('GameServer/Bot/AI/SpotIndex').spotById(spots, spotId)?.name;
        // A spot named for its raid or its id is no place a player would name.
        return name && !/^raid:|^\d/.test(String(name)) ? String(name).replace(/\s+/g, ' ').trim() : null;
    } catch {
        return null;
    }
}

function healer(state) {
    try { return invoke('GameServer/Bot/AI/BotRoles').isHealer(state); } catch { return false; }
}

// The line a bot shouts, or null. The partner it wants is the one its party ask weighed
// (PartyProgressComparison.partnerFor): a healer for any other bot, a damage dealer for a healer.
function lineFor(state, request, random = Math.random) {
    const level = Number(state.level || 1);
    const role = String(state.stats?.role || '').replace(/_/g, ' ') || 'dd';
    const spot = spotName(request.spotId);
    if (healer(state)) {
        return spot ? pick([`healer ${level} LFP ${spot}`, `LF dd for ${spot}, I heal`, `${role} ${level} lf party, ${spot}`,
            `any pt for ${spot}? healer ${level} here`], random) : pick([`healer ${level} LFP`, `${role} ${level} lf party`], random);
    }
    if (!spot) return pick([`${role} ${level} LFP`, `lfp ${role} ${level}`, `LF healer, ${role} ${level}`], random);
    return pick([`LF healer for ${spot}, ${level}+`, `lfp ${spot}, need heal`, `${role} ${level} LFP ${spot}`,
        `LF2M ${spot}: healer + dd`, `anyone for ${spot}? need a healer`], random);
}

function committed(previous, state, { now = Date.now(), random = Math.random } = {}) {
    try {
        if (Config.lfpShoutsEnabled === false || !state || !String(state.accountName || '').startsWith('bot_')) return false;
        const request = state.stats?.partyRequest, key = openKey(request);
        if (!key || key === openKey(previous?.stats?.partyRequest)) return false;
        const id = Number(state.characterId);
        if (now - (lastAt.get(id) || -Infinity) < SHOUT_MS) return false;
        const sociability = Number(invoke('GameServer/Bot/AI/BotPersona').of(state)?.traits?.sociability ?? 0.5);
        if (random() >= 0.3 + 0.6 * sociability) return false;
        const text = lineFor(state, request, random);
        if (!text || !invoke('GameServer/Bot/Economy/BotTradeChat').deliver(state, text, now)) return false;
        if (!lastAt.has(id) && lastAt.size >= HISTORY) lastAt.delete(lastAt.keys().next().value);
        lastAt.set(id, now);
        return text;
    } catch (error) {
        invoke('FailureLog')?.note?.('lfp_shout', error);
        return false;
    }
}

module.exports = { committed, lineFor, SHOUT_MS, _reset() { lastAt.clear(); } };
