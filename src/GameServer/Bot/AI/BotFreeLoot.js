'use strict';
// Free loot, C4-style: an item on the ground that is nobody's any more is anyone's, and
// bots near it notice.
//
// Before this, a bot only ever picked up its own party's drops (PartyCompanionService
// reads GroundItems.ownedBy), so a player's discard, a PK's drop or a drop its owners
// walked away from lay on the ground for good.
// - Free: an item with no owner (a discard, a PK's drop) from GRACE_MS after it fell; a
//   party's drop once PROTECT_MS have passed (L2J keeps a drop its killer's for 15 s;
//   ours); never the bot's own party's drop (its party loot takes those).
// - Who: a hot bot of its own: no player's companion, no store or service, alive, not
//   fighting (no PvP, swing, cast or monster on it), not already collecting, in a field
//   or town plan.
// - Whether: one seeded roll per (bot, item) by persona (TendencyRoll): ambition draws
//   it, empathy holds it back, Adena tempts more. One bot goes for an item at a time
//   (a claim on the item for CLAIM_MS).
// - How: the native pickup (Generics.pickupExec: the run, PickupItem's atomic claim and
//   its bag checks). The bot's tick is owned until the pickup ends; anything that needs
//   the bot (a fight) ends it first.
// Settings: [BotPopulation] freeLootEnabled.
const Config = require('../Population/PopulationConfig');
const GroundItems = require('../../World/GroundItems');
const TendencyRoll = require('./TendencyRoll');
const Situations = require('../Situations');

const PROTECT_MS = 15000;
const GRACE_MS = 3000;
const SCAN_MS = 2500;
const RADIUS = 700;
const CLAIM_MS = 12000;
const PLANS = new Set(['hunting', 'resting', 'shopping']);
const MAX_SKIPPED = 32;

const clamp = (n, low = 0, high = 1) => Math.max(low, Math.min(high, Number(n) || 0));
const world = () => invoke('GameServer/World/World');
const Party = () => invoke('GameServer/Bot/AI/PartyCompanionService');
const isBot = session => String(session?.accountId || '').startsWith('bot_');

// Is the item free for this bot at `now`: unowned past its grace, or another party's past
// its protection; never its own party's.
function free(item, session, now) {
    const owner = GroundItems.ownerOf(item), age = now - Number(item.groundSince ?? now);
    if (!owner || typeof owner === 'number' && owner <= 0) return age >= GRACE_MS;
    if (owner === Party().groundLootOwnerKey(session)) return false;
    return age >= PROTECT_MS;
}

// How much this bot wants a free item (the roll's chance), by persona.
function interest(persona, item) {
    const t = key => clamp(persona?.traits?.[key] ?? 0.5);
    const adena = Number(item?.fetchSelfId?.()) === 57;
    return clamp(0.2 + 0.5 * t('ambition') - 0.35 * t('empathy') + (adena ? 0.2 : 0), 0.02, 0.9);
}

function wants(session, item) {
    const persona = invoke('GameServer/Bot/AI/BotChatVoice').profile(session);
    return TendencyRoll.roll('free_loot', Number(session.actor.fetchId()), Number(item.fetchId())) < interest(persona, item);
}

// Is the bot free to wander off for an item?
function idle(session, bot, now) {
    return isBot(session) && !session.partyCompanion && !session.followPlayerSession && !session.staticService
        && !session.arenaEphemeral && !session.buffServiceCasting && PLANS.has(session.plan)
        && !bot.isDead?.() && !bot.fetchPrivateStore?.()
        && !session.pvpDefense && !session.pvpRevenge && !session.pendingPvpProvocation && !session.pvpAggressors?.size
        && !session.partyGroundPickupInProgress && !session.partyGroundPickupQueue?.length
        && !bot.state?.fetchHits?.() && !bot.state?.fetchCasts?.() && !bot.state?.fetchPickinUp?.()
        && !session.currentTargetId
        && Party().canPickupLoot(session)
        && invoke('GameServer/Bot/AI/PartyAwareness').npcsAttackingActor(bot, 900).length === 0
        && now >= Number(session.freeLootCooldownUntil || 0);
}

function skip(session, itemId) {
    const skipped = session.freeLootSkipped || (session.freeLootSkipped = new Set());
    skipped.add(itemId);
    while (skipped.size > MAX_SKIPPED) skipped.delete(skipped.values().next().value);
}

function release(session, item) {
    if (item?.freeLootClaim?.botId === Number(session.actor?.fetchId?.())) delete item.freeLootClaim;
    delete session.freeLoot;
}

// The nearest free item this bot wants and can run straight to, or null.
function pick(session, bot, now) {
    const botId = Number(bot.fetchId());
    const loc = { locX: bot.fetchLocX(), locY: bot.fetchLocY() };
    const Automation = invoke('GameServer/Automation');
    return GroundItems.near(world().items, loc, RADIUS)
        .filter(item => !(item.freeLootClaim?.until > now && item.freeLootClaim.botId !== botId)
            && !session.freeLootSkipped?.has(Number(item.fetchId())) && Math.abs(item.fetchLocZ() - bot.fetchLocZ()) <= 300
            && free(item, session, now) && wants(session, item))
        .sort((a, b) => Math.hypot(a.fetchLocX() - loc.locX, a.fetchLocY() - loc.locY)
            - Math.hypot(b.fetchLocX() - loc.locX, b.fetchLocY() - loc.locY) || Number(a.fetchId()) - Number(b.fetchId()))
        .find(item => Automation.pickupRun(bot, item).inReach) || null;
}

function start(session, bot, item, now) {
    const botId = Number(bot.fetchId()), itemId = Number(item.fetchId());
    item.freeLootClaim = { botId, until: now + CLAIM_MS };
    const attempt = Number(session.freeLootAttempt || 0) + 1;
    session.freeLootAttempt = attempt;
    session.freeLoot = { itemId, attempt, until: now + CLAIM_MS };
    if (bot.state?.fetchSeated?.()) {
        bot.state.setSeated(false);
        session.dataSendToMeAndOthers?.(invoke('GameServer/Network/Response').sitAndStand(bot), bot);
    }
    const Generics = invoke(path.actor);
    Generics.stopAutomation(session, bot);
    Situations.note('free_loot:going');
    Generics.pickupExec(session, bot, { id: itemId }, () => {
        if (Number(session.freeLootAttempt) !== attempt) return;
        bot.state?.setPickinUp?.(false);
        const left = world().items.spawns.some(spawn => Number(spawn.fetchId()) === itemId);
        // Still there: the bag refused it, or the run failed. The bot leaves that one.
        if (left) skip(session, itemId);
        Situations.note(left ? 'free_loot:left' : 'free_loot:taken');
        release(session, item);
        session.freeLootCooldownUntil = Date.now() + SCAN_MS;
    }, () => session.freeLoot?.attempt === attempt && !session.pvpDefense && !session.pvpRevenge
        && !session.pvpAggressors?.size);
}

// One look (BotAI.tick, after the party's own loot): true while a free-loot pickup owns the tick.
function tick(session, bot, now = Date.now()) {
    if (Config.freeLootEnabled === false || !session || !bot) return false;
    const running = session.freeLoot;
    if (running) {
        const item = world().items.spawns.find(spawn => Number(spawn.fetchId()) === running.itemId);
        const interrupted = !item || running.until <= now || session.pvpDefense || session.pvpRevenge
            || session.pvpAggressors?.size || bot.isDead?.()
            || invoke('GameServer/Bot/AI/PartyAwareness').npcsAttackingActor(bot, 900).length > 0;
        if (!interrupted) return true;
        if (item) skip(session, running.itemId);
        if (!bot.state?.fetchCasts?.()) bot.automation?.abortAll?.(bot);
        bot.state?.setPickinUp?.(false);
        session.freeLootAttempt = Number(session.freeLootAttempt || 0) + 1;
        release(session, item);
        Situations.note('free_loot:interrupted');
        return false;
    }
    if (now < Number(session.freeLootScanAt || 0)) return false;
    session.freeLootScanAt = now + SCAN_MS;
    if (!world().items?.byCell?.size || !idle(session, bot, now)) return false;
    const item = pick(session, bot, now);
    if (!item) return false;
    start(session, bot, item, now);
    return true;
}

module.exports = { tick, free, interest, PROTECT_MS, GRACE_MS, RADIUS, SCAN_MS, CLAIM_MS };
