'use strict';

// The four summoner servitor buffs of C4, for the Solo Helper's Buffer tab. They are servitor
// skills (summon actions 1007/1008/1010/1011, Npc/SummonControl) and not in this server's
// player skill data, so the buffer defines them here.
//
// Source: Lisvus C4 at fdc7e33a, datapack/data/stats/skills/4600-4699.xml (4699) and
// 4700-4799.xml (4700, 4702, 4703); L2J Mobius C4 agrees. Values are level 3, the level a normal
// (unenchanted) summon casts at its top levels (Lisvus npcskills). Cure of Queen (4701) and Cure
// of Seraphim (4704) are cleanses, not buffs, and are left out.
// - Feline Queen ("Queen of Cat", Warlock's Summon Queen of Cat 1331): Blessing of Queen and
//   Gift of Queen share the stack group QueenBuff: the newer one replaces the other, as in C4.
// - Unicorn Seraphim (Elemental Summoner's Summon Unicorn Seraphim 1332): Blessing of Seraphim
//   and Gift of Seraphim share SeraphimBuff the same way.
// The board shows each with its summon skill's icon, which every C4 client has.
const LEVEL = 3;
const DEFS = Object.freeze({
    4699: { name: 'Blessing of Queen', key: 'blessing_of_queen', icon: 1331, stackFamily: 'QueenBuff',
        stats: { pCritRateMul: 1.3, pCritDamageMul: 1.25 } },
    4700: { name: 'Gift of Queen', key: 'gift_of_queen', icon: 1331, stackFamily: 'QueenBuff',
        stats: { pAtkMul: 1.1, pAccuracyCombatAdd: 3 } },
    4702: { name: 'Blessing of Seraphim', key: 'blessing_of_seraphim', icon: 1332, stackFamily: 'SeraphimBuff',
        stats: { regMp: 1.35 } },
    4703: { name: 'Gift of Seraphim', key: 'gift_of_seraphim', icon: 1332, stackFamily: 'SeraphimBuff',
        stats: { mReuseMul: 0.65 } }
});
const IDS = Object.freeze(Object.keys(DEFS).map(Number));

const has = (selfId) => Object.hasOwn(DEFS, Number(selfId));

// The buffer's catalog row of one, or null.
function skill(selfId) {
    const def = DEFS[Number(selfId)];
    return def ? { selfId: Number(selfId), level: LEVEL, name: def.name } : null;
}

// Its effect, shaped as AdminFullBuff.effectFromSkill shapes a player buff's.
function effect(selfId, expiresAt) {
    const def = DEFS[Number(selfId)];
    if (!def) return null;
    return { key: def.key, id: Number(selfId), level: LEVEL, name: def.name, type: 'buff', category: 'buff',
        stackFamily: def.stackFamily, stackOrder: LEVEL, stats: { ...def.stats }, dispellable: true, expiresAt };
}

// The skill id whose icon the board shows for it (its summon skill), or null.
function iconOf(selfId) {
    return DEFS[Number(selfId)]?.icon ?? null;
}

module.exports = { IDS, LEVEL, has, skill, effect, iconOf };
