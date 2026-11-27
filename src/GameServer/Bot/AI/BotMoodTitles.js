'use strict';
// Mood titles: a bot's title above its name says its level, what it thinks of you and what it
// is doing or wants, clan or no clan. Two styles (C4 titles are at most 16 characters):
// - faces (moodTitleFaces = true, the default): "Lv20 :) Hunting", "Lv31 >:( Attacks",
//   "Lv14 o_O LFP". The face is the bot's attitude to you, the word what it does or wants.
// - words: one word, the liveliest first: "Lv20 Fights you", "Lv31 Grudge", "Lv18 Needs heal".
//
// All of it is about the nearest real player (a solo server has one):
// - what the bot does to you now: fights you (a PvP objective or defense against you), hunts you
//   (a manhunt), out for revenge or war (a watched meeting), angry (you hit it lately), party;
// - its feelings (InteractionMemoryRuntime: hostility, fear, trust, affinity): hates you, grudge,
//   afraid, friend, friendly, wary;
// - what it needs: a res (dead), a heal (under 30% HP), buyers (its private store), MP (under
//   10%), room in its bag (80% of its weight), a party (an open party request: LFP);
// - what it does, where it really is: fighting a monster, heading out to its spot, roaming for
//   one, finding none (No mobs), stuck, chatting in town, looting, watching a fight, on its way
//   back to town, buying, fleeing, following...;
// - standing about: its gear goal (saving, farming, gathering) or its own mood (tired, bored,
//   chilling), else AFK.
// A bot's memory of you moves only after you hurt or help it, so its doings and wants say more
// than a "Neutral" would. A PK that waits for its moment does not give itself away.
// CharInfo writes it in place of the stored title; the stored title (a clan title) is untouched
// and comes back when this is off.
// - Cost: a CharInfo reads the bot's cached title (CACHE_MS); a hot bot's tick re-reads it every
//   REFRESH_MS and resends its CharInfo to the players around only when the text changed.
// Settings: [BotPopulation] botMoodTitles, moodTitleFaces.
const Config = require('../Population/PopulationConfig');

const MAX_LENGTH = 16;
const CACHE_MS = 2000;
const REFRESH_MS = 2500;
const HEAVY = 0.8;
const LOW_MP = 0.1;
// The word for a plan, long (words style) and short (faces style: at most 7 letters, so
// "Lv80 >:( Hunting" stays within 16).
const ACTIVITY = Object.freeze({
    hunting: ['Hunting', 'Hunting'], pk_hunting: ['Hunting', 'Hunting'], resting: ['Resting', 'Resting'],
    shopping: ['Shopping', 'Buying'], merchant: ['Selling', 'Selling'], following: ['Following', 'Follows'],
    fleeing: ['Fleeing', 'Fleeing'], pk_fleeing: ['Fleeing', 'Fleeing'], traveling: ['Traveling', 'Travels'],
    getting_buffed: ['Buffing', 'Buffing'], crafting: ['Crafting', 'Crafts']
});
// A standing bot's own mood (BotAmbientDirector), long and short.
const IDLE = Object.freeze({ tired: ['Tired', 'Tired'], restless: ['Bored', 'Bored'], sociable: ['Chilling', 'Chill'] });
// Words a gear goal says more than.
const PLAIN = new Set(['Hunting', 'AFK']);
const FACES = Object.freeze({ fighting: '>:(', hunting: '>:(', angry: '>:(', hates: '>:(', grudge: '>:|', afraid: 'o_O',
    friend: '^_^', friendly: ':)', wary: '-_-', party: ':D' });

const isBot = session => String(session?.accountId || '').startsWith('bot_');
const facesOn = () => Config.moodTitleFaces !== false;

// The feeling a memory row holds toward the player, or null.
function feelingOf(feeling) {
    const f = feeling || {};
    const hostility = Number(f.hostility) || 0, trust = Number(f.trust) || 0, affinity = Number(f.affinity) || 0;
    if (hostility >= 24) return 'hates';
    if (hostility >= 10) return 'grudge';
    if ((Number(f.fear) || 0) >= 10) return 'afraid';
    if (trust >= 6 && affinity > 0) return 'friend';
    if (trust >= 2 || affinity >= 2) return 'friendly';
    if (trust <= -3 || hostility >= 4) return 'wary';
    return null;
}
const FEELING_WORDS = Object.freeze({ hates: 'Hates you', grudge: 'Grudge', afraid: 'Afraid', friend: 'Friend',
    friendly: 'Friendly', wary: 'Wary' });

// The one word of the words style, the liveliest first. ctx: { fighting, hunting, watching
// ('revenge' | 'clan_war'), angry, party, want, activity }; feeling: its memory of the player.
function mood(feeling, { fighting = false, hunting = false, watching = null, angry = false, party = false, want = null,
    activity = null } = {}) {
    if (fighting) return 'Fights you';
    if (hunting) return 'Hunting you';
    if (watching === 'clan_war') return 'War';
    if (watching === 'revenge') return 'Revenge';
    if (angry) return 'Angry';
    if (party) return 'Party';
    const felt = feelingOf(feeling);
    if (felt) return FEELING_WORDS[felt];
    if (want) return want;
    if (activity) return activity;
    if ((Number(feeling?.familiarity) || 0) >= 2) return 'Knows you';
    return 'Neutral';
}

// The faces style: [face, word]. The face is its attitude (what it does to you first, then its
// feeling), the word what it does to you, wants or does.
function faceParts(feeling, { fighting = false, hunting = false, watching = null, angry = false, party = false, want = null,
    activity = null } = {}) {
    const key = fighting ? 'fighting' : hunting ? 'hunting' : angry ? 'angry' : party ? 'party' : feelingOf(feeling);
    const face = key ? FACES[key] : '';
    const word = fighting ? 'Attacks' : hunting ? 'Revenge' : watching === 'clan_war' ? 'War' : watching === 'revenge' ? 'Revenge'
        : want || activity || (party ? 'Party' : face ? '' : 'Neutral');
    return [face, word];
}

// What the bot needs now, as one word (short: the faces style), or null: these beat what it does.
function wantOf(session, bot, short = false) {
    if (bot.isDead?.() || bot.state?.fetchDead?.()) return short ? 'Res pls' : 'Needs res';
    const hp = Number(bot.fetchHp?.()) / Math.max(1, Number(bot.fetchMaxHp?.()) || 1);
    if (hp > 0 && hp < 0.3) return short ? 'Heal me' : 'Needs heal';
    if (bot.fetchPrivateStore?.()) return 'Selling';
    const mp = Number(bot.fetchMp?.()) / Math.max(1, Number(bot.fetchMaxMp?.()) || 0);
    if (Number(bot.fetchMaxMp?.()) > 0 && mp < LOW_MP) return short ? 'No MP' : 'Out of MP';
    const load = Number(bot.backpack?.fetchTotalLoad?.()) / Math.max(1, Number(bot.fetchMaxLoad?.()) || 0);
    if (load >= HEAVY) return short ? 'Heavy' : 'Heavy bag';
    if (session.coldLifeState?.stats?.partyRequest?.status === 'open') return 'LFP';
    return null;
}

// What its gear plan is after, or null: shown in place of a plain "Hunting" or "AFK".
function goalOf(session, short = false) {
    const plan = session.coldLifeState?.stats?.equipmentPlan;
    if (plan?.status !== 'active') return null;
    if (plan.strategy === 'market') return short ? 'Saving' : 'Saving up';
    if (plan.strategy === 'direct_drop') return 'Farming';
    if (plan.strategy === 'craft') return short ? 'Gathers' : 'Gathering';
    return null;
}

const word = (pair, short) => pair[short ? 1 : 0];

function inTown(bot) {
    try { return !!invoke('GameServer/Bot/AI/TownTransitPolicy').townAt(bot); } catch { return false; }
}

// Its current target is a live monster: it is in a fight, not just out hunting.
function fightingMob(session) {
    if (!session.currentTargetId) return false;
    try {
        const npc = require('../../World/NpcObjectIndex').find(invoke('GameServer/World/World'), session.currentTargetId);
        return !!npc && !npc.isDead?.() && npc.fetchAttackable?.() !== false;
    } catch { return false; }
}

// A bot standing about says how it feels (BotAmbientDirector's mood): tired, bored, chilling, or AFK.
function idleWord(session, short) {
    let mood = null;
    try { mood = invoke('GameServer/Bot/AI/BotAmbientDirector').deriveMood(session)?.mood; } catch { mood = null; }
    return IDLE[mood] ? word(IDLE[mood], short) : 'AFK';
}

// The hunting plan covers the whole trip, so the word follows where the bot really is: in a
// fight, on its way out of town, standing in town, sitting, finding no monsters, roaming for one.
function huntingWord(session, bot, short) {
    if (fightingMob(session)) return short ? 'Fights' : 'Fighting';
    const moving = !!bot.state?.fetchTowards?.(), town = inTown(bot);
    if (session.spotRelocation || town && moving) return short ? 'To spot' : 'Heading out';
    if (town) return idleWord(session, short);
    if (bot.state?.fetchSeated?.()) return 'Resting';
    if (Number(session.noTargetTicks) >= 3) return 'No mobs';
    return moving ? 'Roaming' : 'Hunting';
}

// What the bot is doing now, as one word (short: the faces style), or null.
function activityOf(session, bot, short = false, now = Date.now()) {
    if (session.freeLoot) return 'Looting';
    if (session.attentionWatch) return short ? 'Watches' : 'Watching';
    const scene = session.ambientScene;
    if (scene && !scene.finished && Number(scene.expiresAt) > now) return short ? 'Chats' : 'Chatting';
    if (Number(session.stuckTicks) >= 3) return 'Stuck';
    if (session.plan === 'hunting' || session.plan === 'pk_hunting') return huntingWord(session, bot, short);
    // Town errands that start in the field: the walk or teleport back comes first.
    if (['shopping', 'getting_buffed'].includes(session.plan) && !inTown(bot)) return 'To town';
    return ACTIVITY[session.plan] ? word(ACTIVITY[session.plan], short) : null;
}

// The word for what it does: a goal replaces a plain "Hunting" or "AFK".
function doingOf(session, bot, short = false, now = Date.now()) {
    const activity = activityOf(session, bot, short, now);
    const goal = goalOf(session, short);
    return goal && (!activity || PLAIN.has(activity)) ? goal : activity;
}

function text(level, word) {
    return `Lv${Math.max(1, Number(level) || 1)} ${word}`.slice(0, MAX_LENGTH);
}

function faceText(level, [face, word]) {
    return [`Lv${Math.max(1, Number(level) || 1)}`, face, word].filter(Boolean).join(' ').slice(0, MAX_LENGTH);
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
    const faces = facesOn();
    const ctx = { fighting, hunting, watching: ['revenge', 'clan_war'].includes(watched) ? watched : null, angry: hitBy, party,
        want: wantOf(session, bot, faces), activity: doingOf(session, bot, faces, now) };
    return faces ? faceText(bot.fetchLevel?.(), faceParts(feeling, ctx)) : text(bot.fetchLevel?.(), mood(feeling, ctx));
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

module.exports = { titleOf, tick, mood, faceParts, feelingOf, text, faceText, compute, wantOf, goalOf, activityOf, doingOf, FACES, MAX_LENGTH,
    CACHE_MS, REFRESH_MS };
