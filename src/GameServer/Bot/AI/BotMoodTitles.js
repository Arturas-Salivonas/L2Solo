'use strict';
// Mood titles: a bot's title above its name says its level and what it thinks of you
// ("Lv20 Friendly", "Lv31 Grudge", "Lv18 Hunting you"), clan or no clan.
//
// The title is the bot's feeling toward the nearest real player (a solo server has one): its
// interaction memory of that player (InteractionMemoryRuntime: trust, affinity, hostility, fear,
// familiarity), a manhunt on them (stats.manhunt) or a shared party. CharInfo writes it in place
// of the stored title; the stored title (a clan title) is untouched and comes back when this is
// off. C4 titles are at most 16 characters.
// - Cost: a CharInfo reads the bot's cached title (CACHE_MS); a hot bot's tick re-reads it every
//   REFRESH_MS and resends its CharInfo to the players around only when the text changed.
// Settings: [BotPopulation] botMoodTitles.
const Config = require('../Population/PopulationConfig');

const MAX_LENGTH = 16;
const CACHE_MS = 3000;
const REFRESH_MS = 5000;

const isBot = session => String(session?.accountId || '').startsWith('bot_');

// The word for a feeling (the bot's toward the player), most telling first.
function mood(feeling, { hunting = false, party = false } = {}) {
    if (hunting) return 'Hunting you';
    if (party) return 'Party';
    const f = feeling || {};
    const hostility = Number(f.hostility) || 0, trust = Number(f.trust) || 0, affinity = Number(f.affinity) || 0;
    if (hostility >= 24) return 'Hates you';
    if (hostility >= 10) return 'Grudge';
    if ((Number(f.fear) || 0) >= 10) return 'Afraid';
    if (trust >= 6 && affinity > 0) return 'Friend';
    if (trust >= 2 || affinity >= 2) return 'Friendly';
    if (trust <= -3 || hostility >= 4) return 'Wary';
    if ((Number(f.familiarity) || 0) >= 2) return 'Knows you';
    return 'Neutral';
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
    const hunt = (session.coldLifeState || {}).stats?.manhunt;
    const hunting = !!hunt && !hunt.found && Number(hunt.targetId) === Number(player.fetchId()) && Number(hunt.until) > now;
    const party = invoke('GameServer/Bot/AI/BotPvpRisk').sameParty(session, player.session);
    return text(bot.fetchLevel?.(), mood(feeling, { hunting, party }));
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

module.exports = { titleOf, tick, mood, text, compute, MAX_LENGTH, CACHE_MS, REFRESH_MS };
