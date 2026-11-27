'use strict';

// Bot fighters for Last Hero.
//
// Each bot fighter is a short-lived copy of a real bot: its name, class, level, worn gear,
// shots and skills, the same way the Giran arena makes its duel opponents
// (World/ArenaDuelService.js). The copy is marked arenaEphemeral, so nothing it does or
// suffers reaches the real bot, the bot simulation or the database; it is deleted when it
// falls or the event ends. While it fights it uses the server's own bot PvP brain
// (BotAI.executePvPCombat), like the arena duel bot (World/ArenaBotAI.js).

const FailureLog = require('../../../FailureLog');
const ItemTemplateIndex = require('../../Item/ItemTemplateIndex');
const { isAutomaticArenaBuff } = require('../../World/ArenaBuffEligibility');

const Database = () => invoke('Database');
const DataCache = () => invoke('GameServer/DataCache');
const World = () => invoke('GameServer/World/World');
const Response = () => invoke('GameServer/Network/Response');

const MIN_BOT_LEVEL = 10;
// Ids of their own, apart from the arena duel copies (2100000000+, items 900000000+).
let nextActorId = 2120000000;
let nextItemId = 920000000;

function cloneJson(value, fallback = {}) {
    try { return structuredClone(value); } catch { return fallback; }
}

// ---------- picking bots ----------

// Bots that can enter: every bot the arena would offer (BotAvailability.catalogForPlayer),
// not a town service, level 10 or more, picked closest to level. levelGap keeps them within
// that many levels while there are enough of them; the rest come from the next closest.
function pick(count, level, { playerSession = null, levelGap = 10, random = Math.random } = {}) {
    if (count <= 0) return [];
    const BotAvailability = invoke('GameServer/Bot/AI/BotAvailability');
    const catalog = BotAvailability.catalogForPlayer(playerSession, invoke('GameServer/Bot/BotManager').sessions || [],
        invoke('GameServer/Bot/Population/BotLifeState').everyState());
    const seen = new Set();
    const pool = catalog.filter((candidate) => {
        const id = sourceIdOf(candidate);
        if (!id || seen.has(id) || Number(candidate.level) < MIN_BOT_LEVEL) return false;
        if (candidate.session?.staticService || candidate.session?.arenaEphemeral) return false;
        seen.add(id);
        return true;
    }).map((candidate) => ({ candidate, gap: Math.abs(Number(candidate.level) - level), roll: random() }));
    pool.sort((a, b) => a.gap - b.gap || a.roll - b.roll);
    const near = pool.filter((entry) => entry.gap <= levelGap);
    const chosen = near.length >= count ? near.slice(0, count) : pool.slice(0, count);
    return chosen.map((entry) => entry.candidate);
}

function sourceIdOf(candidate) {
    return Number(candidate?.subject?.fetchId?.() || candidate?.state?.characterId || candidate?.subject?.characterId || 0) || 0;
}

// ---------- copying a bot ----------

function snapshotItems(items = []) {
    const ShotStock = invoke('GameServer/Inventory/ShotStock');
    return items.map((item) => cloneJson(item?.model || item, {}))
        .filter((item) => Number(item.selfId) > 0)
        .filter((item) => {
            const kind = String(item.kind || '');
            return kind.startsWith('Armor.') || kind.startsWith('Weapon.') || !!ShotStock.kindForSelfId?.(Number(item.selfId));
        })
        .map((item) => ({ ...item, id: nextItemId++, characterId: 0, amount: Math.max(1, Number(item.amount) || 1) }));
}

function hydrateItemRows(items = []) {
    return items.map((item) => {
        const definition = ItemTemplateIndex.find(DataCache().items, item?.selfId);
        if (!definition) return item;
        const details = cloneJson(definition, {});
        if (Number(item?.slot) > 0 && details.etc) delete details.etc.slot;
        return { ...item, ...utils.crushOb(details) };
    });
}

function paperdollFor(items) {
    const paperdoll = Array.from({ length: 16 }, () => ({}));
    items.filter((item) => item.equipped && Number(item.slot) > 0).forEach((item) => {
        const slot = Number(item.slot);
        if (slot >= 0 && slot < paperdoll.length) paperdoll[slot] = { id: item.id, selfId: item.selfId };
    });
    if (paperdoll[14]?.id && paperdoll[8]?.id) paperdoll[8] = {};
    return paperdoll;
}

const skillSnapshot = (skills = []) => skills.map((skill) => cloneJson(skill?.model || skill, {}))
    .filter((skill) => Number(skill.selfId) > 0 && Number(skill.level) > 0);

function model(source, character, classInfo, items, point) {
    const base = {
        ...utils.crushOb(cloneJson(classInfo, {})),
        ...(source?.model ? cloneJson(source.model, {}) : {}),
        ...character,
        id: nextActorId++,
        username: `bot_lasthero_${character.id}`,
        name: character.name,
        title: 'Last Hero',
        locX: point.locX, locY: point.locY, locZ: point.locZ, head: point.head || 0,
        isOnline: true, pvpFlag: 0, karma: 0, pvp: 0, pk: 0,
        privateStoreType: 0, privateStore: null, manufactureShop: null,
        hp: 1, mp: 1, cp: 1, effects: {}, activeBuffs: {}, stateDead: false,
        items, paperdoll: paperdollFor(items)
    };
    delete base.idleSince;
    delete base.clanId;
    return base;
}

// The gear, skills and look of one bot: its live body when it is active, else its saved rows.
async function snapshot(candidate, point) {
    const live = candidate?.session?.actor || null;
    if (live?.backpack?.fetchItems && live?.skillset?.fetchSkills) {
        const character = { id: Number(live.fetchId()), name: live.fetchName(), classId: live.fetchClassId(),
            race: live.fetchRace(), sex: live.fetchSex(), level: live.fetchLevel() };
        const items = snapshotItems(live.backpack.fetchItems());
        return { character, model: model(live, character, {}, items, point), skills: skillSnapshot(live.skillset.fetchSkills()) };
    }
    const sourceId = sourceIdOf(candidate);
    const rows = await Database().execute(['SELECT * FROM characters WHERE id = ?', [sourceId]]);
    const character = rows?.[0];
    if (!character) return null;
    const [items, skills] = await Promise.all([Database().fetchItems(sourceId, 'last_hero_snapshot'), Database().fetchSkills(sourceId)]);
    const Progression = invoke('GameServer/ClassProgression');
    const classInfo = (DataCache().classTemplates ? Progression.firstClassRow(DataCache().classTemplates, character.classId) : null) || {};
    return { character, model: model(null, character, classInfo, snapshotItems(hydrateItemRows(items)), point), skills: skillSnapshot(skills) };
}

// Puts one copy on the Coliseum floor. Resolves the fighter's session, or null.
async function spawn(candidate, point) {
    const copy = await snapshot(candidate, point).catch((error) => { FailureLog.note('last_hero.snapshot', error); return null; });
    if (!copy) return null;
    const BotSession = invoke('GameServer/Bot/BotSession');
    const session = new BotSession(`bot_lasthero_${copy.character.id}`);
    session.arenaEphemeral = true;
    session.persistenceMode = 'ephemeral';
    session.plan = 'last_hero';
    session.aiActive = false;
    session.lastHero = true;
    session.setActor(copy.model);
    const actor = session.actor;
    actor.skillset.populateSnapshot(copy.skills);
    invoke('GameServer/Inventory/ShotStock').enableAutoShot(actor);
    actor.setIsOnline(true);
    actor.state.setDead(false);
    invoke('GameServer/Actor/Generics/CalculateStats')(session, actor);
    actor.fillupVitals();
    World().insertUser(session);
    session.dataSendToOthers(Response().charInfo(actor), actor);
    return { session, actor, sourceId: Number(copy.character.id), name: actor.fetchName(), classId: actor.fetchClassId(), level: actor.fetchLevel() };
}

function remove(session) {
    const actor = session?.actor;
    if (!actor) return;
    try {
        invoke('GameServer/Effects/EffectTicker').clearAll(actor);
        actor.attack?.destructor?.();
        session.dataSendToOthers?.(Response().deleteOb(actor.fetchId()), actor);
        actor.destructor();
    } catch (error) {
        FailureLog.note('last_hero.remove', error);
    }
    World().removeUser(session);
}

// ---------- buffs ----------

function buff(session, actor, mode) {
    if (mode === 'none') return;
    try {
        if (mode === 'full') {
            invoke('GameServer/World/Generics/NpcBypasses/AdminFullBuff').applyFullBuff(session, actor, { refresh: false });
        } else {
            const SkillEffects = invoke('GameServer/Skills/C4SkillEffects');
            for (const skill of (actor.skillset?.fetchSkills?.() || []).filter(isAutomaticArenaBuff)) {
                SkillEffects.execute(session, actor, actor, skill, { selfEffectOnly: true });
            }
        }
        invoke(path.actor).calculateStats(session, actor);
        actor.fillupVitals();
        actor.statusUpdateVitals?.(actor);
        invoke('GameServer/Effects/EffectTicker').refreshEffects?.(session, actor);
    } catch (error) {
        FailureLog.note('last_hero.buff', error);
    }
}

// ---------- fighting ----------

const distance = (a, b) => Math.hypot(a.fetchLocX() - b.fetchLocX(), a.fetchLocY() - b.fetchLocY());

// Whom a bot fighter goes for: whoever hit it last if still standing and close, else
// its current target, else one of the two nearest (so they do not all pile on one).
function chooseTarget(fighter, standing, random = Math.random) {
    const self = fighter.actor;
    const alive = (other) => other && other !== fighter && other.alive && !other.actor.isDead?.();
    const threat = standing.find((other) => other.actor.fetchId() === Number(fighter.session.incomingThreatId));
    if (alive(threat) && Date.now() - Number(fighter.session.incomingThreatAt || 0) < 4000 && distance(self, threat.actor) < 900) return threat;
    if (alive(fighter.target) && distance(self, fighter.target.actor) < 1500) return fighter.target;
    const nearest = standing.filter(alive).map((other) => ({ other, d: distance(self, other.actor) }))
        .sort((a, b) => a.d - b.d).slice(0, 2);
    if (!nearest.length) return null;
    return (nearest.length > 1 && random() < 0.3 ? nearest[1] : nearest[0]).other;
}

function fight(fighter, standing) {
    const { session, actor } = fighter;
    if (!fighter.alive || actor.isDead?.() || actor.state?.fetchDead?.()) return false;
    if (actor.state?.fetchTowards?.() || actor.state?.fetchHits?.() || actor.state?.fetchCasts?.()) return false;
    const target = chooseTarget(fighter, standing);
    fighter.target = target;
    if (!target) return false;
    try {
        invoke('GameServer/Bot/BotAI').executePvPCombat(session, actor, target.actor, invoke('GameServer/Actor/Generics'), { arena: true });
        return true;
    } catch (error) {
        FailureLog.note('last_hero.fight', error);
        return false;
    }
}

function stop(fighter) {
    try {
        fighter.actor?.automation?.abortAll?.(fighter.actor);
        fighter.actor?.attack?.destructor?.();
        fighter.actor?.state?.setHits?.(false);
        fighter.actor?.state?.setCasts?.(false);
    } catch (error) {
        FailureLog.note('last_hero.stop', error);
    }
}

function say(fighter, text) {
    fighter.session?.dataSendToOthers?.(Response().speak(fighter.actor, { kind: 0, text }), fighter.actor);
}

function social(fighter, action) {
    fighter.session?.dataSendToMeAndOthers?.(Response().socialAction(fighter.actor.fetchId(), action), fighter.actor);
}

module.exports = { MIN_BOT_LEVEL, pick, sourceIdOf, snapshot, spawn, remove, buff, chooseTarget, fight, stop, say, social };
