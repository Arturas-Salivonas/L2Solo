'use strict';
// Fear and bravado (Living Bots): how a bot carries itself near a player it has feelings about.
// - Afraid (its memory's fear of the player is FEAR or more: you killed it, or it heard you PK,
//   BotGossip): when you come within FEAR_RADIUS and nothing is on it, it says a nervous word
//   (once per LINE_MS) and walks STEP away from you, and again while you stay close. Its title
//   shows o_O (BotMoodTitles).
// - Bold with a grudge (hostility GRUDGE or more, little fear, an assertive persona with a taste
//   for PvP): it tells you so to your face, once per LINE_MS, and does not step aside. Whether
//   it fights is the revenge system's call (BotRevenge), not this.
// Settings: [BotPopulation] nerveEnabled.
const Config = require('../Population/PopulationConfig');
const TendencyRoll = require('./TendencyRoll');
const Situations = require('../Situations');

const FEAR = 10;
const GRUDGE = 10;
const FEAR_RADIUS = 700;
const BOLD_RADIUS = 600;
const STEP = 700;
const AWAY_MS = 6000;
const SCAN_MS = 1500;
const LINE_MS = 10 * 60000;
const PLANS = new Set(['hunting', 'resting', 'shopping']);

const clamp = (n, low = 0, high = 1) => Math.max(low, Math.min(high, Number(n) || 0));
const isBot = session => String(session?.accountId || '').startsWith('bot_');
const idOf = actor => Number(actor?.fetchId?.() || 0);
const nameOf = actor => String(actor?.fetchName?.() || '').replace(/[^\w .-]/g, '').slice(0, 24);
const enabled = () => Config.nerveEnabled !== false;

const LINES = Object.freeze({
    afraid: () => ['uh oh', 'not you again...', 'stay away from me!', 'o_O', 'nope nope nope', 'please no'],
    bold: name => ['you again?', `${name}, I remember you`, 'wanna go again?', `come at me ${name}`, 'still mad about last time']
});

function calm(session, bot) {
    return isBot(session) && !!bot && !session.partyCompanion && !session.followPlayerSession && !session.staticService
        && !session.arenaEphemeral && !bot.isDead?.() && !bot.fetchPrivateStore?.() && PLANS.has(session.plan)
        && !session.pvpDefense && !session.pvpRevenge && !session.pendingPvpProvocation && !session.pvpAggressors?.size
        && !session.currentTargetId && !bot.state?.fetchHits?.() && !bot.state?.fetchCasts?.()
        && invoke('GameServer/Bot/AI/PartyAwareness').npcsAttackingActor(bot, 900).length === 0;
}

function feelingOf(bot, player, now) {
    const who = actor => ({ id: idOf(actor), clanId: Number(actor.fetchClanId?.() || 0) });
    try {
        const relation = invoke('GameServer/Social/InteractionMemoryRuntime').assess(who(bot), who(player), {}, now);
        return relation?.ready ? (relation.personal || relation.effective || null) : null;
    } catch { return null; }
}

function bold(persona) {
    return clamp(persona?.traits?.assertiveness ?? 0.5) >= 0.6 && clamp(persona?.inclinations?.pvp ?? 0.15) >= 0.25;
}

function say(session, text, now) {
    const Budget = invoke('GameServer/Bot/AI/BotChatterBudget');
    if (!session.dataSendToOthers || !Budget.canReply(session, now)) return false;
    session.dataSendToOthers(invoke('GameServer/Network/Response').speak(session.actor, { kind: 0, text }), session.actor);
    Budget.recordSpeaker(idOf(session.actor), now);
    return true;
}

// Once per LINE_MS per player and kind.
function speak(session, kind, player, now) {
    const said = session.nerveSaid || (session.nerveSaid = {});
    const key = `${kind}:${idOf(player)}`;
    if (now - Number(said[key] || 0) < LINE_MS) return false;
    const lines = LINES[kind](nameOf(player));
    if (!say(session, lines[Math.floor(TendencyRoll.roll('nerve_line', idOf(session.actor), kind, now) * lines.length)], now)) return false;
    said[key] = now;
    return true;
}

// A point STEP farther from the player, along the line from the player through the bot.
function awayPoint(bot, player) {
    const bx = Number(bot.fetchLocX()), by = Number(bot.fetchLocY()), bz = Number(bot.fetchLocZ?.() || 0);
    let dx = bx - Number(player.fetchLocX()), dy = by - Number(player.fetchLocY());
    const length = Math.hypot(dx, dy) || 1;
    if (length < 1) { dx = 1; dy = 0; }
    const to = { locX: Math.round(bx + dx / length * STEP), locY: Math.round(by + dy / length * STEP) };
    try { to.locZ = invoke('GameServer/Geodata/GeodataEngine').getHeight?.(to.locX, to.locY, bz) ?? bz; } catch { to.locZ = bz; }
    return { from: { locX: bx, locY: by, locZ: bz }, to };
}

function keepAway(session, bot, player, now) {
    if (bot.state?.fetchSeated?.()) {
        bot.state.setSeated(false);
        session.dataSendToMeAndOthers?.(invoke('GameServer/Network/Response').sitAndStand(bot), bot);
    }
    const route = awayPoint(bot, player);
    if (bot.moveTo) {
        invoke(path.actor).stopAutomation(session, bot);
        bot.moveTo(route);
    }
    session.nerveAway = { playerId: idOf(player), until: now + AWAY_MS };
    speak(session, 'afraid', player, now);
    Situations.note('nerve:keep_away');
    return route;
}

// One look (BotAI.tick): true while an afraid bot walks away (that walk owns the tick).
function tick(session, bot, now = Date.now()) {
    if (!enabled() || !session || !bot) return false;
    const away = session.nerveAway;
    if (away) {
        if (now < away.until && calm(session, bot)) return true;
        delete session.nerveAway;
    }
    if (now < Number(session.nerveScanAt || 0)) return false;
    session.nerveScanAt = now + SCAN_MS;
    if (!calm(session, bot)) return false;
    let near = null;
    try { near = require('../../World/ActorSpatialQueries').nearestPlayer(invoke('GameServer/World/World'), bot); } catch { near = null; }
    const player = near?.session?.actor;
    if (!player || !(Number(near.distance) <= FEAR_RADIUS)) return false;
    const feeling = feelingOf(bot, player, now);
    if (!feeling) return false;
    if (Number(feeling.fear) >= FEAR) return !!keepAway(session, bot, player, now);
    if (Number(feeling.hostility) >= GRUDGE && Number(near.distance) <= BOLD_RADIUS
        && bold(invoke('GameServer/Bot/AI/BotChatVoice').profile(session))) {
        if (speak(session, 'bold', player, now)) Situations.note('nerve:bold');
    }
    return false;
}

module.exports = { tick, awayPoint, bold, LINES, FEAR, GRUDGE, FEAR_RADIUS, BOLD_RADIUS, STEP, LINE_MS };
