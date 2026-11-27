'use strict';
// Feelings across a wipe (Living Bots): a returning bot (ReturningBots) carries how it felt about
// the last world's players, by name, in stats.legacy.feelings. When it first meets a player of
// that name in the new world, it remembers, in broad strokes:
// - a grudge (hostility GRUDGE or more, or trust FOE_TRUST or less): a remembered_foe episode,
//   twice for a deep one (STRONG);
// - a friend (trust or affinity FRIEND or more): a remembered_friend episode, twice for STRONG;
// - anything milder is forgotten.
// It may say so once ("I remember you..."). Each feeling applies once: the memory key is fixed
// per bot, player and kind, and the session keeps the names it has dealt with.
// Settings: [BotPopulation] legacyFeelingsEnabled.
const Config = require('../Population/PopulationConfig');
const TendencyRoll = require('../AI/TendencyRoll');
const Situations = require('../Situations');

const GRUDGE = 10;
const FOE_TRUST = -6;
const FRIEND = 4;
const STRONG = 24;
const SCAN_MS = 5000;
const SAY_RADIUS = 1200;

const isBot = session => String(session?.accountId || '').startsWith('bot_');
const idOf = actor => Number(actor?.fetchId?.() || 0);
const enabled = () => Config.legacyFeelingsEnabled !== false;
const nameOf = actor => String(actor?.fetchName?.() || '').replace(/[^\w .-]/g, '').slice(0, 24);

const LINES = Object.freeze({
    remembered_foe: name => [`${name}... I remember you`, `you again, ${name}? I haven't forgotten`, 'I know you. I remember what you did'],
    remembered_friend: name => [`${name}! I remember you`, `hey ${name}, good to see you again`, `${name}, been a while!`]
});

// The episodes a saved feeling turns into: [] when it was mild.
function episodesFor(feeling = {}) {
    const hostility = Number(feeling.hostility) || 0, trust = Number(feeling.trust) || 0, affinity = Number(feeling.affinity) || 0;
    if (hostility >= GRUDGE || trust <= FOE_TRUST) {
        return hostility >= STRONG || trust <= -STRONG ? ['remembered_foe', 'remembered_foe'] : ['remembered_foe'];
    }
    if (trust >= FRIEND || affinity >= FRIEND) {
        return trust >= STRONG || affinity >= STRONG ? ['remembered_friend', 'remembered_friend'] : ['remembered_friend'];
    }
    return [];
}

function say(session, text, now) {
    const Budget = invoke('GameServer/Bot/AI/BotChatterBudget');
    if (!session.dataSendToOthers || !Budget.canReply(session, now)) return false;
    session.dataSendToOthers(invoke('GameServer/Network/Response').speak(session.actor, { kind: 0, text }), session.actor);
    Budget.recordSpeaker(idOf(session.actor), now);
    return true;
}

// One look (BotAI.tick): applies a saved feeling toward the nearest player, once.
function tick(session, bot, now = Date.now()) {
    if (!enabled() || !isBot(session) || !bot || session.legacyFeelingsDone || now < Number(session.legacyFeelingsAt || 0)) return false;
    session.legacyFeelingsAt = now + SCAN_MS;
    const saved = session.coldLifeState?.stats?.legacy?.feelings;
    if (!Array.isArray(saved) || !saved.length) { session.legacyFeelingsDone = true; return false; }
    let near = null;
    try { near = require('../../World/ActorSpatialQueries').nearestPlayer(invoke('GameServer/World/World'), bot); } catch { near = null; }
    const player = near?.session?.actor;
    if (!player || isBot(near.session)) return false;
    const name = String(player.fetchName?.() || '').toLowerCase();
    const dealt = session.legacyFeelingsSeen || (session.legacyFeelingsSeen = new Set());
    if (!name || dealt.has(name)) return false;
    dealt.add(name);
    if (dealt.size >= saved.length) session.legacyFeelingsDone = true;
    const feeling = saved.find(entry => String(entry?.player || '').toLowerCase() === name);
    const episodes = feeling ? episodesFor(feeling) : [];
    if (!episodes.length) return false;
    const Memory = invoke('GameServer/Social/InteractionMemoryRuntime');
    const botId = idOf(bot), playerId = idOf(player);
    let written = 0;
    episodes.forEach((type, index) => {
        try {
            if (Memory.events.enqueue({ key: `legacy:${botId}:${playerId}:${type}:${index}`, sourceId: botId, targetId: playerId,
                type, at: now, kind: 'character' }) === true) written++;
        } catch { /* a full queue: the next world meeting is not retried, the feeling is simply lost */ }
    });
    if (written && Number(near.distance) <= SAY_RADIUS) {
        const lines = LINES[episodes[0]](nameOf(player));
        say(session, lines[Math.floor(TendencyRoll.roll('legacy_line', botId, playerId) * lines.length)], now);
    }
    if (written) Situations.note(`legacy:${episodes[0]}`);
    return written > 0;
}

module.exports = { tick, episodesFor, LINES, GRUDGE, FRIEND, STRONG };
