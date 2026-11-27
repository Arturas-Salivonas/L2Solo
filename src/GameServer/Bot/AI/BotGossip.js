'use strict';
// Gossip (Living Bots): what a player does to bots spreads among bots in town, and colours how
// bots who never met that player feel about them.
// - News: a player kills a bot (ReceivedHit.creditKill: 'pk' for a PK, 'kill' in a fair fight)
//   or really helps one (a heal, buff or res: BotMoments.helped). The bot it happened to carries
//   it, NEWS_MS long, at most MAX_NEWS pieces.
// - Telling: a bot with news, standing in town or resting (settled) with the player around, tells
//   the bots within RADIUS out loud, at most once per TELL_MS, each piece at most TELLS times.
// - Hearing: each listener hears a piece once. Its memory of the player takes a heard_pk or
//   heard_kind episode (InteractionMemoryPolicy), so its title and choices show it: wary of a PK,
//   then afraid; friendly to a kind player. A listener may pass it on (PASS_ON), HOPS times at most.
// Settings: [BotPopulation] gossipEnabled.
const Config = require('../Population/PopulationConfig');
const TendencyRoll = require('./TendencyRoll');
const Situations = require('../Situations');

const NEWS_MS = 2 * 3600000;
const MAX_NEWS = 3;
const TELL_MS = 3 * 60000;
const TELLS = 4;
const SCAN_MS = 15000;
const RADIUS = 600;
const HEAR_PLAYER = 1800;
const HOPS = 2;
const HELP_MS = 10 * 60000;
const PASS_ON = Object.freeze({ pk: 0.5, kill: 0.3, kind: 0.3 });
const MEMORY = Object.freeze({ pk: 'heard_pk', kind: 'heard_kind' });
const PLANS = new Set(['resting', 'shopping', 'hunting']);

const news = new Map();
const helpedAt = new Map();
// A listener takes one episode per player and kind per HEARD_MS, however many tell it.
const HEARD_MS = 3600000;
const heardAt = new Map();
let serial = 0;

const isBot = session => String(session?.accountId || '').startsWith('bot_');
const idOf = actor => Number(actor?.fetchId?.() || 0);
const nameOf = actor => String(actor?.fetchName?.() || '').replace(/[^\w .-]/g, '').slice(0, 24);
const enabled = () => Config.gossipEnabled !== false;

const LINES = Object.freeze({
    pk: (name, place) => place
        ? [`careful, ${name} PKs at ${place}`, `${name} killed me at ${place}, watch out`, `PK ${name} at ${place}, stay away`]
        : [`careful, ${name} is a PK`, `${name} PKed me, watch out`, `PK ${name} around, stay away`],
    pk_heard: (name, place) => place
        ? [`heard ${name} PKs at ${place}`, `watch out for ${name} at ${place}`, `they say ${name} PKs at ${place}`]
        : [`heard ${name} is a PK`, `watch out for ${name}`, `they say ${name} is a PK`],
    kill: (name, place) => place
        ? [`${name} beat me at ${place}, strong one`, `got owned by ${name} at ${place} lol`]
        : [`${name} beat me, strong one`, `got owned by ${name} lol`],
    kill_heard: name => [`heard ${name} is strong`, `${name}? strong, they say`],
    kind_heal: name => [`${name} healed me earlier, so nice`, `${name} saved me with a heal`],
    kind_buff: name => [`${name} buffed me, what a legend`, `got buffs from ${name}, nice`],
    kind_res: name => [`${name} res'd me, legend`, `${name} brought me back, real one`],
    kind_heard: name => [`heard ${name} helps people`, `${name} is a good one, they say`]
});

// A short name for where the bot is: its spot, else its town.
function placeOf(session) {
    const spot = String(session?.currentSpot?.name || '').split(/ - |\(/)[0].trim();
    if (spot) return spot.slice(0, 24);
    try { return String(invoke('GameServer/Bot/AI/TownTransitPolicy').townAt(session.actor) || '').slice(0, 24) || null; }
    catch { return null; }
}

function carry(botId, piece) {
    const list = (news.get(botId) || []).filter(item => !(item.type === piece.type && item.playerId === piece.playerId));
    list.unshift(piece);
    news.set(botId, list.slice(0, MAX_NEWS));
    return piece;
}

function fresh(botId, now) {
    const list = (news.get(botId) || []).filter(item => now - item.at < NEWS_MS && item.told < TELLS);
    if (list.length) news.set(botId, list); else news.delete(botId);
    return list;
}

// ReceivedHit.creditKill: a real player killed a bot.
function killed({ attacker, victim, outcome, at = Date.now() } = {}) {
    if (!enabled() || !attacker?.session || !victim?.session || isBot(attacker.session) || !isBot(victim.session)) return null;
    const type = outcome === 'pk' ? 'pk' : 'kill';
    return carry(idOf(victim), { id: ++serial, type, playerId: idOf(attacker), name: nameOf(attacker), place: placeOf(victim.session),
        at, hops: 0, told: 0, heard: new Set([idOf(victim)]) });
}

// BotMoments.helped: a real player healed, buffed or resurrected a bot (help: 'heal' | 'buff' | 'res').
function helped(helper, target, help, now = Date.now()) {
    if (!enabled() || !helper?.session || !target?.session || isBot(helper.session) || !isBot(target.session)) return null;
    const key = `${idOf(helper)}:${idOf(target)}`;
    if (now - Number(helpedAt.get(key) || 0) < HELP_MS) return null;
    helpedAt.set(key, now);
    if (helpedAt.size > 512) helpedAt.delete(helpedAt.keys().next().value);
    return carry(idOf(target), { id: ++serial, type: 'kind', help, playerId: idOf(helper), name: nameOf(helper), place: null,
        at: now, hops: 0, told: 0, heard: new Set([idOf(target)]) });
}

function settled(session, bot) {
    return isBot(session) && !!bot && !session.partyCompanion && !session.staticService && !session.arenaEphemeral
        && !bot.isDead?.() && PLANS.has(session.plan) && !session.pvpDefense && !session.pvpRevenge
        && (session.plan === 'resting' || !!utils.isInPeaceZone?.(bot.fetchLocX(), bot.fetchLocY()));
}

function lineFor(piece) {
    if (piece.type === 'kind') return LINES[piece.hops ? 'kind_heard' : `kind_${piece.help || 'heal'}`](piece.name);
    return LINES[piece.hops ? `${piece.type}_heard` : piece.type](piece.name, piece.place);
}

function say(session, text, now) {
    const Budget = invoke('GameServer/Bot/AI/BotChatterBudget');
    if (!session.dataSendToOthers || !Budget.canReply(session, now)) return false;
    session.dataSendToOthers(invoke('GameServer/Network/Response').speak(session.actor, { kind: 0, text }), session.actor);
    Budget.recordSpeaker(idOf(session.actor), now);
    return true;
}

// The listener's memory of the player hears of it.
function remember(listenerId, piece, now) {
    const type = MEMORY[piece.type];
    if (!type) return false;
    const key = `${listenerId}:${piece.playerId}:${type}`;
    if (now - Number(heardAt.get(key) || 0) < HEARD_MS) return false;
    heardAt.set(key, now);
    if (heardAt.size > 2048) heardAt.delete(heardAt.keys().next().value);
    try {
        return invoke('GameServer/Social/InteractionMemoryRuntime').events.enqueue({
            key: `gossip:${listenerId}:${piece.playerId}:${type}:${piece.id}`, sourceId: listenerId, targetId: piece.playerId,
            type, at: now, kind: 'character' }) === true;
    } catch { return false; }
}

// One look (BotAI.tick): true when this bot told the bots around it something.
function tick(session, bot, now = Date.now()) {
    if (!enabled() || !session || !bot || now < Number(session.gossipScanAt || 0)) return false;
    session.gossipScanAt = now + SCAN_MS;
    const botId = idOf(bot);
    if (!news.has(botId) || now < Number(session.gossipToldAt || 0) + TELL_MS || !settled(session, bot)) return false;
    const pieces = fresh(botId, now);
    if (!pieces.length) return false;
    const World = invoke('GameServer/World/World');
    const Queries = require('../../World/ActorSpatialQueries');
    try {
        const near = Queries.nearestPlayer(World, bot);
        if (!near?.session || Number(near.distance) > HEAR_PLAYER) return false;
    } catch { return false; }
    const peers = Queries.near(World, bot, RADIUS, peer => peer !== session && isBot(peer) && !!peer.actor && !peer.actor.isDead?.());
    for (const piece of pieces) {
        const listeners = peers.filter(peer => !piece.heard.has(idOf(peer.actor)) && idOf(peer.actor) !== piece.playerId);
        if (!listeners.length) continue;
        const lines = lineFor(piece);
        if (!say(session, lines[Math.floor(TendencyRoll.roll('gossip_line', botId, piece.id) * lines.length)], now)) return false;
        for (const peer of listeners) {
            const listenerId = idOf(peer.actor);
            piece.heard.add(listenerId);
            remember(listenerId, piece, now);
            if (piece.hops < HOPS && TendencyRoll.roll('gossip_pass', listenerId, piece.id) < PASS_ON[piece.type]) {
                carry(listenerId, { ...piece, id: ++serial, hops: piece.hops + 1, told: 0, at: piece.at, heard: new Set(piece.heard) });
            }
        }
        piece.told++;
        session.gossipToldAt = now;
        Situations.note(`gossip:${piece.type}`);
        return true;
    }
    return false;
}

function reset() {
    news.clear();
    helpedAt.clear();
    heardAt.clear();
}

module.exports = { killed, helped, tick, reset, news, placeOf, LINES, MEMORY, NEWS_MS, TELL_MS, TELLS, RADIUS, HOPS };
