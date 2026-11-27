'use strict';
// Town attention: bots near the player notice what happens around them and react the way
// players do. A real player's level-up gets a few "gz"; a PK gets a warning from bystanders;
// a fight draws a small crowd that walks over and watches.
//
// Before this, bots only answered when named or selected, and reacted to each other's own
// small events (BotChatReactions); nothing a player did around them was noticed.
// - Events come from the game: LevelUp (level_up), ReceivedHit's kill tally (pk) and
//   BotPvpThreats.record (fight, refreshed while it lasts). At most MAX_EVENTS live, each
//   EVENT_MS long.
// - Each hot bot judges each event once, by one seeded roll (TendencyRoll) on its persona
//   (sociability, justice, caution). At most REACTORS[kind] bots react to one event.
// - A reaction is one local chat line, said after a short human pause, or for a fight a
//   walk to WATCH_GAP from it and a watch while it lasts. Watching owns the bot's tick;
//   anything that needs the bot (a monster on it, PvP) ends it.
// Chat: a speaker says at most one line per BotChatterBudget speaker window; these lines
// don't silence the area, so several bots can say "gz" at once.
// Settings: [BotPopulation] townAttentionEnabled.
const Config = require('../Population/PopulationConfig');
const TendencyRoll = require('./TendencyRoll');
const Situations = require('../Situations');

const EVENT_MS = 30000;
const MAX_EVENTS = 24;
const HEAR = Object.freeze({ level_up: 1200, pk: 1800, fight: 1500 });
const REACTORS = Object.freeze({ level_up: 3, pk: 2, fight: 3 });
// A fight is over when no blow has refreshed it for this long.
const FIGHT_QUIET_MS = 8000;
const WATCH_GAP = 500;
const WATCH_MAX_MS = 30000;
const SCAN_MS = 1000;
const SEEN_MAX = 64;
const PLANS = new Set(['hunting', 'resting', 'shopping']);

const events = [];
let serial = 0;

const clamp = (n, low = 0, high = 1) => Math.max(low, Math.min(high, Number(n) || 0));
const isBot = session => String(session?.accountId || '').startsWith('bot_');
const loc = actor => ({ locX: Number(actor.fetchLocX()), locY: Number(actor.fetchLocY()), locZ: Number(actor.fetchLocZ?.() || 0) });
const gap = (a, b) => Math.hypot(a.locX - b.locX, a.locY - b.locY);
const nameOf = actor => String(actor?.fetchName?.() || '').replace(/[^\w .-]/g, '').slice(0, 24);
const enabled = () => Config.townAttentionEnabled !== false;

const LINES = Object.freeze({
    level_up: name => ['gz', 'gz!', 'grats', 'gratz', `gz ${name}`, 'congrats', 'nice, gz'],
    pk: (killer, victim) => [`PK! ${killer} just killed ${victim}!`, `Careful, ${killer} is PKing here!`,
        `${killer} is a PK, watch out!`, 'PK!!'],
    fight_end: () => ['gg', 'nice fight', 'that was close', 'wow']
});

// The chance a bot reacts to an event of this kind, by persona.
function chance(kind, persona) {
    const t = key => clamp(persona?.traits?.[key] ?? 0.5);
    const i = key => clamp(persona?.inclinations?.[key] ?? 0.1);
    if (kind === 'level_up') return clamp(0.15 + 0.45 * t('sociability'));
    if (kind === 'pk') return clamp(0.15 + 0.45 * i('justice') + 0.2 * t('sociability'));
    if (kind === 'fight') return clamp(0.08 + 0.3 * t('sociability') + 0.2 * (1 - t('caution')) + 0.2 * i('pvp'));
    return 0;
}

function prune(now) {
    for (let i = events.length - 1; i >= 0; i--) if (events[i].until <= now) events.splice(i, 1);
}

// Something happened (the game's hooks). actor: who did it (the one levelling, the killer,
// the attacker); other: the victim. Returns the event, or null when it is not one.
function notice(kind, actor, { other = null, now = Date.now() } = {}) {
    if (!enabled() || !HEAR[kind] || !actor?.fetchId || !actor.fetchLocX) return null;
    if (kind === 'level_up' && isBot(actor.session)) return null;
    prune(now);
    const actorId = Number(actor.fetchId()), otherId = Number(other?.fetchId?.() || 0);
    if (kind === 'fight') {
        if (!otherId || utils.isInPeaceZone?.(actor.fetchLocX(), actor.fetchLocY())) return null;
        const going = events.find(e => e.kind === 'fight' && [e.actorId, e.otherId].includes(actorId)
            && [e.actorId, e.otherId].includes(otherId));
        if (going) {
            going.loc = midpoint(actor, other);
            going.until = now + FIGHT_QUIET_MS;
            return going;
        }
    }
    const event = { id: ++serial, kind, at: now, until: now + (kind === 'fight' ? FIGHT_QUIET_MS : EVENT_MS),
        loc: kind === 'fight' ? midpoint(actor, other) : loc(actor), actorId, otherId,
        name: nameOf(actor), otherName: nameOf(other), reactors: new Set() };
    events.push(event);
    while (events.length > MAX_EVENTS) events.shift();
    Situations.note(`attention:${kind}`);
    return event;
}

function midpoint(a, b) {
    const one = loc(a), two = b?.fetchLocX ? loc(b) : one;
    return { locX: (one.locX + two.locX) / 2, locY: (one.locY + two.locY) / 2, locZ: (one.locZ + two.locZ) / 2 };
}

function free(session, bot) {
    return isBot(session) && !session.partyCompanion && !session.followPlayerSession && !session.staticService
        && !session.arenaEphemeral && !bot.isDead?.() && !bot.fetchPrivateStore?.()
        && !session.pvpDefense && !session.pvpRevenge && !session.pendingPvpProvocation && !session.pvpAggressors?.size;
}

// Free to walk off and watch: in a field or town plan, no target, nothing on it.
function idle(session, bot) {
    return free(session, bot) && PLANS.has(session.plan) && !session.currentTargetId && !session.freeLoot
        && !session.partyGroundPickupInProgress && !session.partyGroundPickupQueue?.length
        && !bot.state?.fetchHits?.() && !bot.state?.fetchCasts?.()
        && invoke('GameServer/Bot/AI/PartyAwareness').npcsAttackingActor(bot, 900).length === 0;
}

function say(session, text, now) {
    const Budget = invoke('GameServer/Bot/AI/BotChatterBudget');
    if (!session.dataSendToOthers || !Budget.canReply(session, now)) return false;
    session.dataSendToOthers(invoke('GameServer/Network/Response').speak(session.actor, { kind: 0, text }), session.actor);
    Budget.recordSpeaker(Number(session.actor.fetchId()), now);
    return true;
}

function pickLine(lines, botId, event) {
    return lines[Math.floor(TendencyRoll.roll('attention_line', botId, event.id) * lines.length)];
}

function seen(session, id) {
    const judged = session.attentionSeen || (session.attentionSeen = new Set());
    if (judged.has(id)) return true;
    judged.add(id);
    while (judged.size > SEEN_MAX) judged.delete(judged.values().next().value);
    return false;
}

// The bot's reaction to one event it has not judged yet: queues a line or starts a watch.
function react(session, bot, event, now) {
    const botId = Number(bot.fetchId());
    if (botId === event.actorId || botId === event.otherId || seen(session, event.id)) return false;
    if (event.reactors.size >= REACTORS[event.kind]) return false;
    if (gap(loc(bot), event.loc) > HEAR[event.kind]) return false;
    const persona = invoke('GameServer/Bot/AI/BotChatVoice').profile(session);
    if (!(TendencyRoll.roll('attention', botId, event.kind, event.id) < chance(event.kind, persona))) return false;
    if (event.kind === 'fight') {
        if (!idle(session, bot)) return false;
        event.reactors.add(botId);
        watch(session, bot, event, now);
        return true;
    }
    event.reactors.add(botId);
    const lines = event.kind === 'level_up' ? LINES.level_up(event.name) : LINES.pk(event.name, event.otherName);
    // A human pause: 1-4 s, the gz of several bots spread out.
    session.attentionSay = { text: pickLine(lines, botId, event), at: now + 1000 + Math.floor(TendencyRoll.roll('attention_wait', botId, event.id) * 3000),
        until: now + 10000, eventId: event.id };
    Situations.note(`attention:react_${event.kind}`);
    return true;
}

function watch(session, bot, event, now) {
    const here = loc(bot), d = gap(here, event.loc);
    const k = d > WATCH_GAP ? (d - WATCH_GAP) / d : 0;
    const to = { locX: Math.round(here.locX + (event.loc.locX - here.locX) * k), locY: Math.round(here.locY + (event.loc.locY - here.locY) * k) };
    to.locZ = invoke('GameServer/Geodata/GeodataEngine').getHeight?.(to.locX, to.locY, event.loc.locZ) ?? event.loc.locZ;
    session.attentionWatch = { eventId: event.id, until: now + WATCH_MAX_MS };
    if (bot.state?.fetchSeated?.()) {
        bot.state.setSeated(false);
        session.dataSendToMeAndOthers?.(invoke('GameServer/Network/Response').sitAndStand(bot), bot);
    }
    if (k > 0 && bot.moveTo) {
        invoke(path.actor).stopAutomation(session, bot);
        bot.moveTo({ from: here, to });
    }
    Situations.note('attention:watch');
}

// ended: the fight is over (no blow for FIGHT_QUIET_MS), not the bot pulled away or bored.
function endWatch(session, ended, now) {
    const watching = session.attentionWatch;
    delete session.attentionWatch;
    // The fight ended on its own: now and then a word about it.
    if (watching && ended && TendencyRoll.roll('attention_gg', Number(session.actor.fetchId()), watching.eventId) < 0.3) {
        say(session, pickLine(LINES.fight_end(), Number(session.actor.fetchId()), { id: watching.eventId }), now);
    }
}

// One look (BotAI.tick): speaks a queued line when its time comes, keeps a watch, judges
// new events. True while the bot is watching a fight (the watch owns the tick).
function tick(session, bot, now = Date.now()) {
    if (!enabled() || !session || !bot) return false;
    const line = session.attentionSay;
    if (line && now >= line.at) {
        delete session.attentionSay;
        if (line.until > now && free(session, bot)) say(session, line.text, now);
    }
    const watching = session.attentionWatch;
    if (watching) {
        prune(now);
        const event = events.find(e => e.id === watching.eventId);
        const needed = !free(session, bot) || invoke('GameServer/Bot/AI/PartyAwareness').npcsAttackingActor(bot, 900).length > 0;
        if (!needed && event && watching.until > now) return true;
        endWatch(session, !needed && !event, now);
        return false;
    }
    if (!events.length || now < Number(session.attentionScanAt || 0)) return false;
    session.attentionScanAt = now + SCAN_MS;
    if (!free(session, bot) || session.attentionSay) return false;
    prune(now);
    for (const event of events) {
        if (react(session, bot, event, now)) return !!session.attentionWatch;
    }
    return false;
}

function reset() {
    events.length = 0;
}

module.exports = { notice, tick, chance, reset, events, LINES, HEAR, REACTORS, EVENT_MS, FIGHT_QUIET_MS, WATCH_GAP };
