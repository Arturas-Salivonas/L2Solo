'use strict';

// Living Bots: bots look after their own, in the background simulation where most of them live.
//
// Patronage: a bot with far more Adena than it needs (an event prize, lucky drops, years of
// saving) helps a clanmate or friend who is struggling: poor, or missing gear for its level.
// Like a player who funds his clan's new members, it gives a share of what it holds beyond its
// own needs; the gift wakes the taker's own spending plan (its windfall), which buys the gear.
//
// Hand-me-downs: a piece of gear a bot carries but does not wear (it wears better) goes to a
// clanmate or friend who would wear it now, by the same equip rules the simulation applies
// (GearAcquisitionPlanner.equipInventoryUpgrades), instead of being sold to a shop.
//
// Both run every SCAN_MS over the cold bots, a few gifts per scan, and only between two
// cold bots (Database.giftAdena / giftItem, BotGiftRepository). Each gift is a 'gift'
// memory (trust and affinity both ways) and a journal line the World Observer shows.
// Settings: [BotPopulation] patronageEnabled, handMeDownsEnabled.

const Config = require('../Population/PopulationConfig');

const SCAN_MS = 5 * 60000;
const MAX_GIFTS = 3;                 // patronage gifts per scan
const MAX_HAND_ME_DOWNS = 3;         // items per scan
// Sized on a C4 x1 world's bots (Nov 2026: a level 20-29 bot earns about 250k an hour and
// holds about an hour of it; one in a hundred holds 9 hours): a patron is the rare bot far
// past that, an event winner or a lucky drop, fully geared itself.
const PATRON_MIN_WALLET = 3e6;       // a patron holds at least this much
const KEEP_HOURS = 8;                // and keeps 8 hours of its own income besides
const KEEP_MIN = 1.5e6;
const SHARE = 0.4;                   // of its surplus at most, per gift
const GIFT_MAX = 20e6;
const GIFT_MIN = 500000;
const NEED_HOURS = 6;                // a gift covers about this much of the taker's income
const NEED_MIN = 1e6;
const PATRON_COOLDOWN_MS = 6 * 3600000;
const TAKER_COOLDOWN_MS = 3 * 3600000;
const TAKER_MIN_LEVEL = 10;
const FRIEND_POOL = 60;              // same-region bots checked for a bond, per patron

const LifeState = () => invoke('GameServer/Bot/Population/BotLifeState');
const Database = () => invoke('Database');
const Persona = () => invoke('GameServer/Bot/AI/BotPersona');

const recently = { patron: new Map(), taker: new Map(), item: new Map() };
let timer = null;
let running = false;

const income = (state) => Math.max(50000, Number(state?.stats?.earning?.income) || 200000);
const clanOf = (state) => Number(state?.stats?.clanId || 0);
const isService = (state) => {
    try { return invoke('GameServer/Bot/AI/BotServiceIdentity').isStaticService(state); } catch { return false; }
};
const usable = (state) => state && state.phase === 'cold' && String(state.accountName || '').startsWith('bot_') && !isService(state);

// The bond from a giver to a taker: 'clan', 'friend', 'friendly' or null (as BotAllies reads it).
function bondOf(giver, taker, now) {
    if (clanOf(giver) > 0 && clanOf(giver) === clanOf(taker)) return 'clan';
    try {
        const relation = invoke('GameServer/Social/InteractionMemoryRuntime').assess({ id: giver.characterId, clanId: clanOf(giver) },
            { id: taker.characterId, clanId: clanOf(taker) }, {}, now);
        const feeling = relation?.ready ? (relation.personal || relation.effective) : null;
        if (!feeling || Number(feeling.hostility) > 0) return null;
        if (Number(feeling.trust) >= 6 && Number(feeling.affinity) > 0) return 'friend';
        if (Number(feeling.trust) >= 2 || Number(feeling.affinity) >= 2) return 'friendly';
    } catch { /* no memory yet: strangers */ }
    return null;
}
const BOND_RANK = Object.freeze({ clan: 3, friend: 2, friendly: 1 });

// The Adena a patron can spare: beyond 8 hours of its income (at least KEEP_MIN).
function surplus(state) {
    return Number(state.adena || 0) - Math.max(KEEP_MIN, KEEP_HOURS * income(state));
}

// How much a taker is struggling: 0 = not; more = poorer and with more gear missing.
function struggle(state) {
    if (Number(state.level || 1) < TAKER_MIN_LEVEL) return 0;
    const wallet = Number(state.adena || 0), poor = wallet < Math.max(300000, 2 * income(state));
    const gaps = gearGaps(state);
    if (!poor && !gaps) return 0;
    return (poor ? 2 : 0) + gaps + (wallet < 100000 ? 1 : 0);
}

// The pieces of gear a bot misses for its level (PersonalGearProgression), 0 when unknown.
function gearGaps(state) {
    try { return invoke('GameServer/Bot/AI/PersonalGearProgression').assess(state).gaps?.size || 0; } catch { return 0; }
}

const Memory = () => invoke('GameServer/Social/InteractionMemoryRuntime');

// A bot's memory is loaded on main only when something reads it: load the giver's first.
async function loadMemory(giver) {
    try { await Memory().ensureMany([Number(giver.characterId)]); return true; } catch { return false; }
}

// The people a bot would help: its cold clanmates, and the cold bots it remembers kindly
// (its own memory rows, at most FRIEND_POOL of them). byId: characterId -> state.
function circleOf(giver, indexes, now) {
    const out = [], seen = new Set([Number(giver.characterId)]);
    for (const taker of indexes.byClan.get(clanOf(giver)) || []) {
        if (seen.has(Number(taker.characterId))) continue;
        seen.add(Number(taker.characterId));
        out.push({ taker, bond: 'clan' });
    }
    let relations = [];
    try { relations = Memory().inspect(Number(giver.characterId), now).relations || []; } catch { relations = []; }
    for (const row of relations.filter((entry) => entry.kind === 'character').slice(0, FRIEND_POOL)) {
        const taker = indexes.byId.get(Number(row.targetId));
        if (!taker || seen.has(Number(taker.characterId))) continue;
        seen.add(Number(taker.characterId));
        const bond = bondOf(giver, taker, now);
        if (bond) out.push({ taker, bond });
    }
    return out;
}

function remember(giver, taker, what, now) {
    try {
        invoke('GameServer/Social/InteractionMemoryRuntime').events.enqueue({
            key: `gift:${giver.characterId}:${taker.characterId}:${now}`, sourceId: giver.characterId, targetId: taker.characterId,
            type: 'gift', at: now, kind: 'character' });
    } catch { /* memory is optional */ }
    try {
        const Journal = invoke('GameServer/Bot/AI/BotEventJournal');
        Journal.record({ botId: giver.characterId, eventType: 'gift', summary: `${giver.name} gave ${what} to ${taker.name}.`,
            weight: 3, dedupeKey: `gift:${giver.characterId}:${taker.characterId}`, coalesceWindowMs: 60000 });
        Journal.record({ botId: taker.characterId, eventType: 'gift', summary: `${taker.name} got ${what} from ${giver.name}.`,
            weight: 3, dedupeKey: `gift_in:${taker.characterId}:${giver.characterId}`, coalesceWindowMs: 60000 });
    } catch { /* the journal is optional */ }
}

function publish(rows) {
    const Commit = invoke('GameServer/Bot/Economy/EconomyCommit');
    for (const row of Object.values(rows || {})) if (row) Commit.acceptRow(row);
}

// ---------- patronage ----------

function patrons(states, now, random) {
    // Its own gear first: a bot still missing a piece for its level spends on itself (its windfall
    // wakes that plan), and helps once it has nothing left to buy.
    return states.filter((state) => usable(state) && Number(state.level || 1) >= 15 && Number(state.adena || 0) >= PATRON_MIN_WALLET
        && surplus(state) >= GIFT_MIN && now - (recently.patron.get(state.characterId) || 0) >= PATRON_COOLDOWN_MS
        && !gearGaps(state))
        .filter((state) => {
            // A generous bot gives more often: empathy draws it, ambition holds it back a little.
            const traits = Persona().of(state)?.traits || {};
            const chance = Math.max(0.05, Math.min(0.9, 0.2 + 0.6 * Number(traits.empathy ?? 0.5) - 0.2 * Number(traits.ambition ?? 0.5)));
            return random() < chance;
        })
        .sort((a, b) => surplus(b) - surplus(a));
}

function giftAmount(giver, taker) {
    const amount = Math.min(GIFT_MAX, surplus(giver) * SHARE, Math.max(NEED_MIN, NEED_HOURS * income(taker)));
    return Math.floor(amount / 100000) * 100000;
}

async function patronage(states, indexes, now, random) {
    let given = 0;
    for (const giver of patrons(states, now, random)) {
        if (given >= MAX_GIFTS) break;
        await loadMemory(giver);
        const candidates = circleOf(giver, indexes, now)
            .filter(({ taker }) => usable(taker) && now - (recently.taker.get(taker.characterId) || 0) >= TAKER_COOLDOWN_MS)
            .map((entry) => ({ ...entry, need: struggle(entry.taker) }))
            .filter((entry) => entry.need > 0)
            .sort((a, b) => BOND_RANK[b.bond] - BOND_RANK[a.bond] || b.need - a.need || Number(a.taker.adena) - Number(b.taker.adena));
        const pick = candidates[0];
        if (!pick) continue;
        const amount = giftAmount(giver, pick.taker);
        if (amount < GIFT_MIN) continue;
        const result = await Database().giftAdena({ fromId: giver.characterId, toId: pick.taker.characterId, amount });
        if (!result?.ok) continue;
        publish(result.rows);
        recently.patron.set(giver.characterId, now);
        recently.taker.set(pick.taker.characterId, now);
        remember(giver, pick.taker, `${amount >= 1e6 ? `${(amount / 1e6).toFixed(1).replace(/\.0$/, '')}kk` : `${amount / 1000}k`} Adena`, now);
        given += 1;
    }
    return given;
}

// ---------- hand-me-downs ----------

function templateOf(selfId) {
    try { return require('../../Item/ItemTemplateIndex').find(invoke('GameServer/DataCache').items, selfId); } catch { return null; }
}

// A giver's unworn gear it may part with: wearable, of a grade its level allows now (a piece of a
// higher grade is kept for later), not worn, and not held for a purpose: the copies its gear
// plan, a craft, a crystal kit or its clan keep (ItemDisposition.saleReservations, the same
// copies it would never sell). [{ selfId, instance, template }]
function spares(state) {
    const Grade = invoke('GameServer/Bot/AI/GearGradeRule');
    const allowed = Grade.rankOf(Grade.gradeForLevel(state.level));
    let reserved;
    try { reserved = invoke('GameServer/Bot/Economy/ItemDisposition').saleReservations(state); } catch { return []; }
    const out = [];
    for (const entry of Object.values(state.inventory || {})) {
        if (!entry || entry.stackable || !Array.isArray(entry.instances)) continue;
        const template = templateOf(entry.selfId);
        if (!(Number(template?.etc?.slot || 0) > 0)) continue; // worn in a paperdoll slot: gear
        if (Grade.rankOf(template.etc.rank) > allowed) continue;
        const worn = Number(entry.equippedCount || (entry.equipped ? 1 : 0));
        let free = Number(entry.amount || 0) - worn - Number(reserved[entry.selfId] || 0);
        for (const instance of entry.instances) {
            if (free <= 0) break;
            if (instance.equipped || !(Number(instance.id) > 0)) continue;
            out.push({ selfId: entry.selfId, instance, template });
            free -= 1;
        }
    }
    return out;
}

// Would the taker wear this piece now, by the simulation's own equip rules?
function wouldWear(taker, spare) {
    const inventory = { ...(taker.inventory || {}) };
    const key = String(spare.selfId), held = inventory[key];
    const gift = { id: -1, amount: 1, enchant: Number(spare.instance.enchant || 0), equipped: false, slot: spare.instance.slot };
    inventory[key] = held
        ? { ...held, amount: Number(held.amount || 0) + 1, instances: [...(held.instances || []), gift] }
        : { selfId: spare.selfId, amount: 1, equipped: false, equippedCount: 0, equippedSlots: [], stackable: false,
            slot: spare.instance.slot, enchant: gift.enchant, instances: [gift] };
    try {
        const equipped = invoke('GameServer/Bot/AI/GearAcquisitionPlanner').equipInventoryUpgrades({ ...taker, inventory }, inventory);
        const after = equipped[key];
        return !!after && Number(after.equippedCount || (after.equipped ? 1 : 0)) > Number(held?.equippedCount || (held?.equipped ? 1 : 0));
    } catch {
        return false;
    }
}

async function handMeDowns(states, indexes, now) {
    let given = 0;
    for (const giver of states) {
        if (given >= MAX_HAND_ME_DOWNS) break;
        if (!usable(giver)) continue;
        const pieces = spares(giver).filter((spare) => now - (recently.item.get(spare.instance.id) || 0) >= PATRON_COOLDOWN_MS);
        if (!pieces.length) continue;
        await loadMemory(giver);
        const circle = circleOf(giver, indexes, now).filter(({ taker }) => usable(taker));
        if (!circle.length) continue;
        for (const spare of pieces) {
            recently.item.set(spare.instance.id, now);
            const pick = circle.sort((a, b) => BOND_RANK[b.bond] - BOND_RANK[a.bond]).find(({ taker }) => wouldWear(taker, spare));
            if (!pick) continue;
            const result = await Database().giftItem({ fromId: giver.characterId, toId: pick.taker.characterId, itemId: spare.instance.id,
                selfId: spare.selfId, enchant: spare.instance.enchant });
            if (!result?.ok) continue;
            publish(result.rows);
            const enchant = Number(spare.instance.enchant || 0);
            remember(giver, pick.taker, `${enchant ? `+${enchant} ` : ''}${spare.template?.template?.name || 'gear'}`, now);
            given += 1;
            break; // one piece per giver per scan
        }
    }
    return given;
}

// ---------- the scan ----------

function indexesOf(states) {
    const byClan = new Map(), byId = new Map();
    for (const state of states) {
        if (!usable(state)) continue;
        byId.set(Number(state.characterId), state);
        const clan = clanOf(state);
        if (clan > 0) { if (!byClan.has(clan)) byClan.set(clan, []); byClan.get(clan).push(state); }
    }
    return { byClan, byId };
}

async function scan(now = Date.now(), { random = Math.random, states = null } = {}) {
    if (running) return { patronage: 0, handMeDowns: 0 };
    running = true;
    try {
        const all = (states || LifeState().everyState?.() || []).filter(Boolean);
        const indexes = indexesOf(all);
        const result = { patronage: 0, handMeDowns: 0 };
        if (Config.patronageEnabled !== false) result.patronage = await patronage(all, indexes, now, random);
        if (Config.handMeDownsEnabled !== false) result.handMeDowns = await handMeDowns(all, indexes, now);
        return result;
    } catch (error) {
        invoke('FailureLog')?.note?.('living_bots.patronage', error);
        return { patronage: 0, handMeDowns: 0 };
    } finally {
        running = false;
    }
}

function start() {
    if (timer) return;
    timer = setInterval(() => { scan().catch(() => {}); }, SCAN_MS);
    timer.unref?.();
}

function stop() { clearInterval(timer); timer = null; }

module.exports = { start, stop, scan, surplus, struggle, giftAmount, spares, wouldWear, bondOf, SCAN_MS, PATRON_MIN_WALLET,
    GIFT_MIN, GIFT_MAX, _reset() { recently.patron.clear(); recently.taker.clear(); recently.item.clear(); running = false; } };
