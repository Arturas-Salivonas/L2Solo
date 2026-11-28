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
// - Whether: what the item is to the bot (worth): an upgrade it would wear now
//   (BotEquipmentUpgrade.wouldEquip), something of value (Adena, anything a shop pays
//   for), or nothing (left for others: a mage does not run for heavy armour it cannot
//   wear and cannot sell). Then one seeded roll per (bot, item) by persona
//   (TendencyRoll): ambition draws it, empathy holds it back, Adena tempts more; an
//   upgrade draws almost anyone, and empathy holds it back only a little.
// - Who: one bot goes for an item at a time (a claim on it for CLAIM_MS), but a bot
//   that needs the item (an upgrade) takes over the claim of a bot that only values it,
//   so the armour goes to the bot that wears it.
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

// What a free item is to this bot: 'upgrade' (it would wear it now), 'value' (Adena or
// anything a shop pays for), or null (nothing to it). NEED ranks them for the claim.
const NEED = Object.freeze({ upgrade: 2, value: 1 });
function worth(bot, item) {
    if (Number(item?.fetchSelfId?.()) === 57) return 'value';
    try {
        if (invoke('GameServer/Bot/AI/BotEquipmentUpgrade').wouldEquip(bot, item)) return 'upgrade';
    } catch (error) {
        invoke('FailureLog')?.note?.('free_loot.worth', error);
    }
    return Number(item?.fetchPrice?.() || 0) > 0 ? 'value' : null;
}

// How much this bot wants a free item (the roll's chance), by persona and what it is to it.
function interest(persona, item, need = 'value') {
    const t = key => clamp(persona?.traits?.[key] ?? 0.5);
    if (need === 'upgrade') return clamp(0.7 + 0.25 * t('ambition') - 0.15 * t('empathy'), 0.5, 0.97);
    const adena = Number(item?.fetchSelfId?.()) === 57;
    return clamp(0.2 + 0.5 * t('ambition') - 0.35 * t('empathy') + (adena ? 0.2 : 0), 0.02, 0.9);
}

function wants(session, item, need) {
    const persona = invoke('GameServer/Bot/AI/BotChatVoice').profile(session);
    return TendencyRoll.roll('free_loot', Number(session.actor.fetchId()), Number(item.fetchId())) < interest(persona, item, need);
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

// The free item this bot wants most (an upgrade before mere value, then the nearest) and
// can run straight to, or null. Another bot's live claim stands unless this bot needs the
// item more (start takes the claim over). Returns { item, need }.
function pick(session, bot, now) {
    const botId = Number(bot.fetchId());
    const loc = { locX: bot.fetchLocX(), locY: bot.fetchLocY() };
    const Automation = invoke('GameServer/Automation');
    const distance = item => Math.hypot(item.fetchLocX() - loc.locX, item.fetchLocY() - loc.locY);
    return GroundItems.near(world().items, loc, RADIUS)
        .filter(item => !session.freeLootSkipped?.has(Number(item.fetchId())) && Math.abs(item.fetchLocZ() - bot.fetchLocZ()) <= 300
            && free(item, session, now))
        .map(item => ({ item, need: worth(bot, item) }))
        .filter(({ item, need }) => need
            && !(item.freeLootClaim?.until > now && item.freeLootClaim.botId !== botId && Number(item.freeLootClaim.need || 1) >= NEED[need])
            && wants(session, item, need))
        .sort((a, b) => NEED[b.need] - NEED[a.need] || distance(a.item) - distance(b.item)
            || Number(a.item.fetchId()) - Number(b.item.fetchId()))
        .find(({ item }) => Automation.pickupRun(bot, item).inReach) || null;
}

function start(session, bot, item, now, need = 'value') {
    const botId = Number(bot.fetchId()), itemId = Number(item.fetchId());
    item.freeLootClaim = { botId, until: now + CLAIM_MS, need: NEED[need] || 1 };
    if (need === 'upgrade') Situations.note('free_loot:upgrade');
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
        // A bot that needs the item took the claim over: this one leaves it to it.
        const outbid = !!item && item.freeLootClaim && item.freeLootClaim.botId !== Number(bot.fetchId());
        const interrupted = !item || outbid || running.until <= now || session.pvpDefense || session.pvpRevenge
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
    const choice = pick(session, bot, now);
    if (!choice) return false;
    start(session, bot, choice.item, now, choice.need);
    return true;
}

module.exports = { tick, free, interest, worth, pick, NEED, PROTECT_MS, GRACE_MS, RADIUS, SCAN_MS, CLAIM_MS };
