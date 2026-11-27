'use strict';
// Buffs of one C4 kind share one slot: a new one replaces the old, unless the old is stronger.
// This server's rules left these groups without a stack family, so they piled up (Focus with
// Chant of Predator, Death Whisper with Chant of Rage, Vampiric Rage with Chant of Vampire...).
// Source: L2J Mobius C4 (Scions of Destiny) datapack, stats/skills: each skill's abnormalType is
// the group and its abnormalLevel per skill level the strength (C4: a higher level wins, an
// equal one replaces). Only groups whose members are all buffs and had no family here.
// skillId: [group, strength by skill level]; a level past the list reads its last entry.
const GROUPS = Object.freeze({
    // AB_HAWK_EYE: Hawk Eye, NPC Hawkeye
    131: ['AB_HAWK_EYE', [1, 2, 3]],
    4096: ['AB_HAWK_EYE', [1, 2, 3]],
    // AVOID_UP: Agility, Chant of Evasion, Tact of Paagrio, Scroll of Agility
    1087: ['AVOID_UP', [1, 2, 3]],
    1252: ['AVOID_UP', [1, 2, 3]],
    1260: ['AVOID_UP', [1, 2, 3]],
    2055: ['AVOID_UP', [4]],
    // AVOID_UP_SPECIAL: Ultimate Evasion, NPC Ultimate Evasion
    111: ['AVOID_UP_SPECIAL', [1, 2]],
    4103: ['AVOID_UP_SPECIAL', [1, 2]],
    // BERSERKER: Berserker Spirit, Rage of Paagrio, NPC Berserk
    1062: ['BERSERKER', [1, 2]],
    1261: ['BERSERKER', [1, 2]],
    4099: ['BERSERKER', [1, 2]],
    // CRITICAL_DMG_UP: Death Whisper, Chant of Rage, Eye of Paagrio, Scroll of Death Whisper
    1242: ['CRITICAL_DMG_UP', [1, 2, 3]],
    1253: ['CRITICAL_DMG_UP', [1, 2, 3]],
    1364: ['CRITICAL_DMG_UP', [3]],
    2051: ['CRITICAL_DMG_UP', [4]],
    // CRITICAL_PROB_UP: Focus, Chant of Predator, Scroll of Focus
    1077: ['CRITICAL_PROB_UP', [1, 2, 3]],
    1308: ['CRITICAL_PROB_UP', [1, 2, 3]],
    2052: ['CRITICAL_PROB_UP', [4]],
    // DETECT_WEAKNESS: Detect Insect Weakness, Detect Monster Weakness, Detect Animal Weakness, Detect Dragon Weakness, Detect Plant Weakness, Eye of Hunter, Eye of Slayer
    75: ['DETECT_WEAKNESS', [1]],
    80: ['DETECT_WEAKNESS', [1]],
    87: ['DETECT_WEAKNESS', [1]],
    88: ['DETECT_WEAKNESS', [1]],
    104: ['DETECT_WEAKNESS', [1]],
    359: ['DETECT_WEAKNESS', [2]],
    360: ['DETECT_WEAKNESS', [2]],
    // FOCUS_DAGGER: Focus Death, Focus Chance, Focus Power
    355: ['FOCUS_DAGGER', [1]],
    356: ['FOCUS_DAGGER', [1]],
    357: ['FOCUS_DAGGER', [1]],
    // HIT_UP: Guidance, Sight of Paagrio, Chant of Eagle, Endeavor Potion, Scroll of Guidance
    1240: ['HIT_UP', [1, 2, 3]],
    1249: ['HIT_UP', [1, 2, 3]],
    1309: ['HIT_UP', [1, 2, 3]],
    2010: ['HIT_UP', [1]],
    2050: ['HIT_UP', [4]],
    // MAX_BREATH_UP: Kiss of Eva, Bless of Eva
    1073: ['MAX_BREATH_UP', [2, 3]],
    2076: ['MAX_BREATH_UP', [2]],
    // MAX_MP_UP: Soul of Sagittarius, Bless the Soul
    303: ['MAX_MP_UP', [1, 2, 3, 4]],
    1048: ['MAX_MP_UP', [1, 2, 3, 4, 5, 6]],
    // MP_REGEN_UP: Mana Regeneration, Scroll of Mana Regeneration
    1047: ['MP_REGEN_UP', [1, 2, 3, 4]],
    2064: ['MP_REGEN_UP', [4]],
    // PA_UP_SPECIAL: War Cry, Rage
    78: ['PA_UP_SPECIAL', [1, 2]],
    94: ['PA_UP_SPECIAL', [1, 2]],
    // PD_UP_SPECIAL: Ultimate Defense, Vengeance, Servitor Ultimate Defense
    110: ['PD_UP_SPECIAL', [1, 2]],
    368: ['PD_UP_SPECIAL', [3]],
    1299: ['PD_UP_SPECIAL', [1, 2]],
    // PINCH: Guts, Frenzy
    139: ['PINCH', [1, 2, 3]],
    176: ['PINCH', [1, 2, 3]],
    // REFLECT_ABNORMAL: Physical Mirror, Magical Mirror
    350: ['REFLECT_ABNORMAL', [1]],
    351: ['REFLECT_ABNORMAL', [1]],
    // RESIST_DEBUFF_DISPEL: Arcane Protection, Chant of Spirit
    1354: ['RESIST_DEBUFF_DISPEL', [3]],
    1362: ['RESIST_DEBUFF_DISPEL', [3]],
    // SHIELD_PROB_UP: Bless Shield, Shield of Paagrio
    1243: ['SHIELD_PROB_UP', [1, 2, 3, 4, 5, 6]],
    1250: ['SHIELD_PROB_UP', [1, 2, 3]],
    // SPEED_UP_SPECIAL: Dash, Evade Shot
    4: ['SPEED_UP_SPECIAL', [1, 2]],
    369: ['SPEED_UP_SPECIAL', [2]],
    // VALAKAS_ITEM: Amulet: Protection of Valakas, Amulet: Slay Valakas
    2231: ['VALAKAS_ITEM', [1]],
    2232: ['VALAKAS_ITEM', [1]],
    // VAMPIRIC_ATTACK: Vampiric Rage, Chant of Vampire
    1268: ['VAMPIRIC_ATTACK', [1, 2, 3, 4]],
    1310: ['VAMPIRIC_ATTACK', [1, 2, 3, 4]],
});

function family(skillId) {
    return GROUPS[Number(skillId)]?.[0] || null;
}

function order(skillId, level) {
    const entry = GROUPS[Number(skillId)];
    if (!entry) return null;
    const levels = entry[1];
    const index = Math.max(0, Math.min(levels.length - 1, Math.floor(Number(level) || 1) - 1));
    return levels[index];
}

module.exports = { GROUPS, family, order };
