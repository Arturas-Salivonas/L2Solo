'use strict';

// Last Hero buffs: everyone gets the same base (Wind Walk, Haste, Acumen at their highest C4
// level), then a draft. You pick 3 of 10 random buffs; every bot gets 3 random ones.
//
// The pool is the buffer-class buffs of C4 (Prophet, chants, Overlord, dances, songs, the 3rd
// class prophecies). Taken out of it: whatever would replace a base buff (the same C4 stack
// family, C4SkillRules), the plain speed, attack-speed and casting-speed songs and dances (the
// base already gives those), and Dance of Light (only against undead). The 10 choices never
// hold two buffs that replace each other, so every pick counts.
//
// Levels and effects come from the datapack through the GM full-buff code (AdminFullBuff), as
// the Solo Helper buffer does; nothing is read from the client.

const POOL_IDS = Object.freeze([
    // Prophet
    1068, 1040, 1077, 1242, 1240, 1062, 1268, 1045, 1048, 1035, 1036, 1059, 1078, 1303, 1087, 1243,
    // Chants (Warcryer, Doomcryer)
    1007, 1009, 1006, 1252, 1253, 1284, 1308, 1309, 1310, 1362,
    // Overlord, Dominator
    1003, 1005, 1008, 1249, 1250, 1260, 1261, 1364, 1365,
    // Dances
    271, 272, 273, 274, 307, 309, 310, 365,
    // Songs
    264, 265, 266, 267, 269, 270, 304, 305, 306, 308, 349, 363, 364,
    // 3rd class prophecies and protections, Chant of Victory
    1352, 1353, 1354, 1355, 1356, 1357, 1363
]);
// A buff whose every stat is one of these only repeats the base buffs.
const BASE_STATS = new Set(['runSpdAdd', 'runSpdMul', 'pAtkSpdMul', 'castSpdMul', 'cancelAdd', 'silentMoving']);
const MAX_TREE_LEVEL = 100; // enchanted levels (101+) are not buffer levels

const admin = () => invoke('GameServer/World/Generics/NpcBypasses/AdminFullBuff');

let levels = null;
// A skill's highest level in any class tree (Wind Walk is learned in the Cleric tree, for one).
function maxLevel(selfId) {
    if (!levels) {
        levels = new Map();
        for (const tree of require('../../../../data/Skills/Tree/tree.json')) {
            for (const skill of tree.skills || []) {
                for (const row of skill.levels || []) {
                    const level = Number(row.level) || 0;
                    if (level <= MAX_TREE_LEVEL && level > (levels.get(skill.selfId) || 0)) levels.set(skill.selfId, level);
                }
            }
        }
    }
    return levels.get(Number(selfId)) || 1;
}

const entries = new Map();
// { selfId, level, name, key, family, stats } for one buff, or null if the datapack lacks it.
function entry(selfId) {
    const id = Number(selfId);
    if (entries.has(id)) return entries.get(id);
    let value = null;
    try {
        const level = maxLevel(id);
        const skill = admin().skillData(id, level);
        if (skill) {
            const effect = admin().effectFromSkill(skill, 0);
            value = Object.freeze({ selfId: id, level, name: skill.name, key: effect.key, family: effect.stackFamily || null,
                stats: Object.keys(effect.stats || {}) });
        }
    } catch (error) {
        invoke('FailureLog')?.note?.('last_hero.buff_entry', error);
    }
    entries.set(id, value);
    return value;
}

const slot = (buff) => buff.family || buff.key; // what a buff replaces, and is replaced by

function base(ids) {
    return ids.map(entry).filter(Boolean);
}

// The draft pool for these base buffs.
function pool(baseBuffs) {
    const taken = new Set(baseBuffs.map(slot));
    return POOL_IDS.map(entry).filter((buff) => buff && !taken.has(slot(buff))
        && !(buff.stats.length && buff.stats.every((stat) => BASE_STATS.has(stat))));
}

// count buffs from the pool, no two that replace each other. random is injectable for tests.
function draw(available, count, random = Math.random) {
    const shuffled = [...available];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const out = [], used = new Set();
    for (const buff of shuffled) {
        if (out.length >= count) break;
        if (used.has(slot(buff))) continue;
        used.add(slot(buff));
        out.push(buff);
    }
    return out;
}

// Puts the buffs on an actor until expiresAt. refresh sends a player's client the new stats
// and buff bar. Returns the buffs that took.
function apply(session, actor, buffs, expiresAt, { refresh = false } = {}) {
    const EffectStore = invoke('GameServer/Effects/EffectStore');
    const EffectTicker = invoke('GameServer/Effects/EffectTicker');
    const applied = [];
    if (!actor) return applied;
    if (!actor.activeBuffs) actor.activeBuffs = {};
    for (const buff of buffs) {
        try {
            const skill = admin().skillData(buff.selfId, buff.level);
            if (!skill) continue;
            const effect = EffectStore.apply(actor, admin().effectFromSkill(skill, expiresAt));
            if (!effect) continue;
            actor.activeBuffs[effect.key] = expiresAt;
            EffectTicker.scheduleExpiry?.(session, actor, effect);
            applied.push(buff);
        } catch (error) {
            invoke('FailureLog')?.note?.('last_hero.buff_apply', error);
        }
    }
    try {
        invoke(path.actor).calculateStats(session, actor);
        actor.statusUpdateVitals?.(actor);
        if (refresh) {
            const Response = invoke('GameServer/Network/Response');
            session.dataSendToMe?.(Response.userInfo(actor));
            session.dataSendToMe?.(Response.abnormalStatusUpdate.fromActor(actor));
            session.dataSendToMe?.(Response.shortBuffStatusUpdate.fromActor(actor));
        }
    } catch (error) {
        invoke('FailureLog')?.note?.('last_hero.buff_refresh', error);
    }
    return applied;
}

const iconOf = (buff) => `icon.skill${String(buff.selfId).padStart(4, '0')}`;

module.exports = { POOL_IDS, BASE_STATS, maxLevel, entry, base, pool, draw, apply, iconOf, slot };
