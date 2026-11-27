'use strict';
// Mood titles: a bot's title above its name says its level and what it thinks of you
// ("Lv20 Friendly", "Lv31 Grudge", "Lv18 Hunting you"), clan or no clan.
//
// The word is about the nearest real player (a solo server has one), the liveliest first:
// - what the bot does to you now: fights you (a PvP objective or defense against you), hunting
//   you (a manhunt), out for revenge or war (a watched meeting), angry (you hit it lately), party;
// - then its feelings (InteractionMemoryRuntime: hostility, fear, trust, affinity): hates you,
//   grudge, afraid, friend, friendly, wary;
// - else what it is doing: hunting, resting, looting, watching a fight, hurt, selling, fleeing...
//   A bot's memory of you moves only after you hurt or help it, so its doings say more than a
//   "Neutral" would. A PK that waits for its moment does not give itself away.
// CharInfo writes it in place of the stored title; the stored title (a clan title) is untouched
// and comes back when this is off. C4 titles are at most 16 characters.
// - Cost: a CharInfo reads the bot's cached title (CACHE_MS); a hot bot's tick re-reads it every
//   REFRESH_MS and resends its CharInfo to the players around only when the text changed.
// Settings: [BotPopulation] botMoodTitles.
const Config = require('../Population/PopulationConfig');

const MAX_LENGTH = 16;
const CACHE_MS = 2000;
const REFRESH_MS = 2500;
const ACTIVITY = Object.freeze({ hunting: 'Hunting', pk_hunting: 'Hunting', resting: 'Resting', shopping: 'Shopping',
    merchant: 'Selling', following: 'Following', fleeing: 'Fleeing', pk_fleeing: 'Fleeing', traveling: 'Traveling',
    getting_buffed: 'Buffing', crafting: 'Crafting' });

const isBot = session => String(session?.accountId || '').startsWith('bot_');

// The word for the bot toward the player, the liveliest first. ctx: { fighting, hunting,
// watching ('revenge' | 'clan_war'), angry, party, activity }; feeling: its memory of the player.
function mood(feeling, { fighting = false, hunting = false, watching = null, angry = false, party = false, activity = null } = {}) {
    if (fighting) return 'Fights you';
    if (hunting) return 'Hunting you';
    if (watching === 'clan_war') return 'War';
    if (watching === 'revenge') return 'Revenge';
    if (angry) return 'Angry';
    if (party) return 'Party';
    const f = feeling || {};
    const hostility = Number(f.hostility) || 0, trust = Number(f.trust) || 0, affinity = Number(f.affinity) || 0;
    if (hostility >= 24) return 'Hates you';
    if (hostility >= 10) return 'Grudge';
    if ((Number(f.fear) || 0) >= 10) return 'Afraid';
    if (trust >= 6 && affinity > 0) return 'Friend';
    if (trust >= 2 || affinity >= 2) return 'Friendly';
    if (trust <= -3 || hostility >= 4) return 'Wary';
    if (activity) return activity;
    if ((Number(f.familiarity) || 0) >= 2) return 'Knows you';
    return 'Neutral';
}

// What the bot is doing now, as one word, or null.
function activityOf(session, bot) {
    if (session.freeLoot) return 'Looting';
    if (session.attentionWatch) return 'Watching';
    const hp = Number(bot.fetchHp?.()) / Math.max(1, Number(bot.fetchMaxHp?.()) || 1);
    if (hp > 0 && hp < 0.3) return 'Hurt';
    if (bot.fetchPrivateStore?.()) return 'Selling';
    return ACTIVITY[session.plan] || null;
}

function text(level, word) {
    return `Lv${Math.max(1, Number(level) || 1)} ${word}`.slice(0, MAX_LENGTH);
}

// The title of a bot toward `player` now (no cache), or null.
function compute(bot, player, now = Date.now()) {
    const session = bot?.session;
    if (!player?.fetchId || !session) return null;
    const who = actor => ({ id: Number(actor.fetchId()), clanId: Number(actor.fetchClanId?.() || 0) });
    let feeling = null;
    try {
        const relation = invoke('GameServer/Social/InteractionMemoryRuntime').assess(who(bot), who(player), {}, now);
        feeling = relation?.ready ? (relation.personal || relation.effective) : null;
    } catch { feeling = null; }
    const playerId = Number(player.fetchId());
    const hunt = (session.coldLifeState || {}).stats?.manhunt;
    const hunting = !!hunt && !hunt.found && Number(hunt.targetId) === playerId && Number(hunt.until) > now;
    const hitBy = session.pvpAggressors?.has?.(playerId) === true;
    const fighting = session.pvpRevenge?.target === player || session.pendingPvpProvocation?.target === player
        || hitBy && !!session.pvpDefense && session.pvpDefense.action !== 'flee';
    const watched = session.pvpWatch?.get?.(playerId)?.reason;
    const party = invoke('GameServer/Bot/AI/BotPvpRisk').sameParty(session, player.session);
    return text(bot.fetchLevel?.(), mood(feeling, { fighting, hunting, watching: ['revenge', 'clan_war'].includes(watched) ? watched : null,
        angry: hitBy, party, activity: activityOf(session, bot) }));
}

function nearestPlayer(bot) {
    const World = invoke('GameServer/World/World');
    try { return require('../../World/ActorSpatialQueries').nearestPlayer(World, bot)?.session?.actor || null; }
    catch { return null; }
}

// CharInfo's title for this actor: a bot's mood title, or null (its own title stays).
function titleOf(actor, now = Date.now()) {
    if (Config.botMoodTitles === false || !isBot(actor?.session) || actor.fetchKind) return null;
    const session = actor.session, cached = session.moodTitle;
    if (cached && now - cached.at < CACHE_MS) return cached.text;
    const player = nearestPlayer(actor);
    const title = player ? compute(actor, player, now) : null;
    session.moodTitle = { text: title, at: now };
    return title;
}

// A hot bot's tick (BotAI.tick): when its title changed, the players around get its new CharInfo.
function tick(session, bot, now = Date.now()) {
    if (Config.botMoodTitles === false || !isBot(session) || now < Number(session.moodTitleCheckAt || 0)) return false;
    session.moodTitleCheckAt = now + REFRESH_MS;
    delete session.moodTitle;
    const title = titleOf(bot, now);
    if (title === null || title === session.moodTitleShown) return false;
    const shown = session.moodTitleShown;
    session.moodTitleShown = title;
    // The first one rides the bot's next CharInfo anyway; a change is sent now.
    if (shown !== undefined) session.dataSendToOthers?.(invoke('GameServer/Network/Response').charInfo(bot), bot);
    return true;
}

module.exports = { titleOf, tick, mood, text, compute, activityOf, MAX_LENGTH, CACHE_MS, REFRESH_MS };
