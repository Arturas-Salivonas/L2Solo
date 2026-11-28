'use strict';

// Living Bots: one score for a piece of gear, read by both sides of a bot's life, so a bot
// ranks its gear the same way near the player (BotEquipmentUpgrade, the live body) and far
// from him (GearAcquisitionPlanner, the background simulation's equip and gear plans), and
// never swaps its weapon just because it became live.
//
// Before, a weapon scored pAtk x2 + mAtk (mAtk x3 + pAtk for a caster) whatever its speed or
// critical rate, and armour its P.Def (+ MP). Now:
// - a fighter's weapon also counts its attack speed and its critical rate against a sword's
//   (379 speed, 8% crit): a two-handed sword hits harder but slower, a dagger softer but
//   faster and more often critically. A caster's weapon stays M.Atk first (its casts do not
//   use the swing speed).
// - an enchanted copy counts its enchant, as C4 adds it (C4EnchantRules.statBonus): a +6
//   sword beats the same sword at +0, and can beat a slightly better one at +0. Only an
//   item in hand knows its enchant; a template (a planned purchase) is +0.

const BotWeaponCompatibility = require('./BotWeaponCompatibility');

const SWORD_SPEED = 379; // C4 one-handed sword: the yardstick
const SWORD_CRIT = 80;   // the datapack's 8% (crit is stored x10)

function enchantBonus(item, stat) {
    if (!item || typeof item.fetchEnchant !== 'function' && item.enchant === undefined) return 0;
    try { return Number(invoke('GameServer/Items/C4EnchantRules').statBonus(item, stat)) || 0; } catch { return 0; }
}

// A fighter's swing rate and crits against a sword's, kept near 1 so a slot's scores stay comparable.
function weaponPace(atkSpd, crit) {
    const speed = Number(atkSpd) > 0 ? Number(atkSpd) / SWORD_SPEED : 1;
    const critical = Number(crit) > 0 ? 1 + (Number(crit) - SWORD_CRIT) / 1000 * 2 : 1;
    return Math.max(0.5, Math.min(1.6, speed * critical));
}

function weapon({ pAtk = 0, mAtk = 0, atkSpd = 0, crit = 0 } = {}, role, classId, enchant = { pAtk: 0, mAtk: 0 }) {
    const physical = Number(pAtk) + Number(enchant.pAtk || 0), magical = Number(mAtk) + Number(enchant.mAtk || 0);
    const base = BotWeaponCompatibility.scoreWeapon(physical, magical, role, classId);
    return BotWeaponCompatibility.isCasterRole(role, classId) ? base : base * weaponPace(atkSpd, crit);
}

function armour({ pDef = 0, mp = 0 } = {}, enchant = 0) {
    return Number(pDef) + Number(enchant || 0) + Number(mp || 0);
}

function jewel({ mDef = 0 } = {}, enchant = 0) {
    return Number(mDef) + Number(enchant || 0);
}

module.exports = { SWORD_SPEED, SWORD_CRIT, weaponPace, weapon, armour, jewel, enchantBonus };
