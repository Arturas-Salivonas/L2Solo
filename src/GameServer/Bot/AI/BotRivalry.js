'use strict';
// Rivalries (Living Bots): grudges between bots, played out when they meet.
// - A grudge is the bot's memory of another bot (InteractionMemoryRuntime): attacked or killed
//   by it, or its mobs taken (mob_contested). A kill-steal, a claimed mob finished off by another
//   bot, counts once more (mobKilled), so a few of them make a rival.
// - Meeting: a calm bot looks at the bots within RADIUS every SCAN_MS. Toward one it holds ARGUE
//   hostility or more, it says so out loud, once per ARGUE_MS for the pair, and the rival answers
//   a moment later (reply).
// - At FIGHT hostility or more, a bot with a taste for it (pvp inclination and assertiveness:
//   fightChance) may pick a fight outside town through the revenge path (BotRevenge.request: its
//   warning, the participation vote, can-I-win), once per FIGHT_MS for the pair.
// Settings: [BotPopulation] rivalriesEnabled.
const Config = require('../Population/PopulationConfig');
const TendencyRoll = require('./TendencyRoll');
const Situations = require('../Situations');

const ARGUE = 8;
const FIGHT = 14;
const RADIUS = 700;
const SCAN_MS = 4000;
const ARGUE_MS = 15 * 60000;
const FIGHT_MS = 30 * 60000;
const REPLY_MS = 2500;
const PLANS = new Set(['hunting', 'resting', 'shopping']);

const pairs = new Map();

const clamp = (n, low = 0, high = 1) => Math.max(low, Math.min(high, Number(n) || 0));
const isBot = session => String(session?.accountId || '').startsWith('bot_');
const idOf = actor => Number(actor?.fetchId?.() || 0);
const nameOf = actor => String(actor?.fetchName?.() || '').replace(/[^\w .-]/g, '').slice(0, 24);
const enabled = () => Config.rivalriesEnabled !== false;

const LINES = Object.freeze({
    argue: name => [`${name}, you KS'd me earlier`, `stay away from my mobs, ${name}`, `${name}... you again`, `still remember you, ${name}`,
        `watch it, ${name}`],
    reply: name => ['whatever', 'cry more lol', `your mobs? lol ${name}`, 'go away', `${name}, chill`, 'mind your own business'],
    fight: name => [`${name}, enough. let's settle this`, `that's it ${name}`, `${name}, you asked for it`]
});

function who(actor) {
    return { id: idOf(actor), clanId: Number(actor.fetchClanId?.() || 0) };
}

function hostility(bot, other, now) {
    try {
        const relation = invoke('GameServer/Social/InteractionMemoryRuntime').assess(who(bot), who(other), {}, now);
        const feeling = relation?.ready ? relation.personal : null;
        return Number(feeling?.hostility) || 0;
    } catch { return 0; }
}

// The chance a rival this angry picks a fight, by persona.
function fightChance(persona) {
    const pvp = clamp(persona?.inclinations?.pvp ?? 0.15), assertive = clamp(persona?.traits?.assertiveness ?? 0.5);
    return clamp(0.05 + 0.6 * pvp * assertive);
}

function calm(session, bot) {
    return isBot(session) && !!bot && !session.partyCompanion && !session.followPlayerSession && !session.staticService
        && !session.arenaEphemeral && !bot.isDead?.() && !bot.fetchPrivateStore?.() && PLANS.has(session.plan)
        && !session.pvpDefense && !session.pvpRevenge && !session.pendingPvpProvocation && !session.pvpAggressors?.size
        && !session.currentTargetId;
}

function say(session, text, now) {
    const Budget = invoke('GameServer/Bot/AI/BotChatterBudget');
    if (!text || !session.dataSendToOthers || !Budget.canReply(session, now)) return false;
    session.dataSendToOthers(invoke('GameServer/Network/Response').speak(session.actor, { kind: 0, text }), session.actor);
    Budget.recordSpeaker(idOf(session.actor), now);
    return true;
}

function pairOf(a, b) {
    const key = [idOf(a), idOf(b)].sort((x, y) => x - y).join(':');
    let pair = pairs.get(key);
    if (!pair) {
        pair = { arguedAt: 0, foughtAt: 0 };
        pairs.set(key, pair);
        if (pairs.size > 1024) pairs.delete(pairs.keys().next().value);
    }
    return pair;
}

// Npc Die: a mob a bot had claimed (BotMobCompetition) killed by another character.
function mobKilled(mob, killer, now = Date.now()) {
    if (!enabled() || !mob || !killer) return false;
    const Competition = invoke('GameServer/Bot/AI/BotMobCompetition');
    const owner = Competition.owner(mob, now);
    const taker = invoke('GameServer/Bot/AI/BotPvpThreats').character(killer);
    if (!owner?.session || !taker || owner === taker || !isBot(owner.session)) return false;
    if (invoke('GameServer/Bot/AI/BotPvpRisk').sameParty(owner.session, taker.session)) return false;
    try {
        return invoke('GameServer/Social/InteractionMemoryRuntime').events.enqueue({
            key: `ks:${idOf(owner)}:${idOf(taker)}:${idOf(mob)}:${Math.floor(now / 1000)}`, sourceId: idOf(owner), targetId: idOf(taker),
            type: 'mob_contested', at: now, kind: 'character' }) === true;
    } catch { return false; }
}

// One look (BotAI.tick): true when the bot picked a fight (that owns the tick); words do not.
function tick(session, bot, now = Date.now()) {
    if (!enabled() || !session || !bot) return false;
    const reply = session.rivalReply;
    if (reply && now >= reply.at) {
        delete session.rivalReply;
        if (now - reply.at < 10000 && calm(session, bot)) say(session, reply.text, now);
    }
    if (now < Number(session.rivalScanAt || 0)) return false;
    session.rivalScanAt = now + SCAN_MS;
    if (!calm(session, bot)) return false;
    const World = invoke('GameServer/World/World');
    let peers = [];
    try {
        peers = require('../../World/ActorSpatialQueries').near(World, bot, RADIUS,
            peer => peer !== session && isBot(peer) && !!peer.actor && !peer.actor.isDead?.());
    } catch { peers = []; }
    for (const peer of peers) {
        const rival = peer.actor;
        const anger = hostility(bot, rival, now);
        if (anger < ARGUE) continue;
        const pair = pairOf(bot, rival);
        if (anger >= FIGHT && now - pair.foughtAt >= FIGHT_MS && pickFight(session, bot, rival, pair, now)) return true;
        if (now - pair.arguedAt < ARGUE_MS) continue;
        const lines = LINES.argue(nameOf(rival));
        if (!say(session, lines[Math.floor(TendencyRoll.roll('rival_line', idOf(bot), idOf(rival), now) * lines.length)], now)) return false;
        pair.arguedAt = now;
        const answers = LINES.reply(nameOf(bot));
        if (calm(peer, rival)) {
            peer.rivalReply = { text: answers[Math.floor(TendencyRoll.roll('rival_reply', idOf(rival), idOf(bot), now) * answers.length)],
                at: now + REPLY_MS };
        }
        Situations.note('rivalry:argue');
        return false;
    }
    return false;
}

function pickFight(session, bot, rival, pair, now) {
    const Threats = invoke('GameServer/Bot/AI/BotPvpThreats');
    if (Threats.inPeace(bot) || Threats.inPeace(rival) || Number(bot.fetchKarma?.() || 0) > 0) return false;
    pair.foughtAt = now;
    const persona = invoke('GameServer/Bot/AI/BotChatVoice').profile(session);
    if (!(TendencyRoll.roll('rival_fight', idOf(bot), idOf(rival), Math.floor(now / FIGHT_MS)) < fightChance(persona))) return false;
    const started = invoke('GameServer/Bot/AI/BotRevenge').request(session, rival, 'rivalry', LINES.fight(nameOf(rival)), true, now);
    Situations.note(started ? 'rivalry:fight' : 'rivalry:fight_refused');
    return started || !!session.pendingPvpProvocation;
}

function reset() {
    pairs.clear();
}

module.exports = { tick, mobKilled, fightChance, reset, LINES, ARGUE, FIGHT, RADIUS, ARGUE_MS, FIGHT_MS };
