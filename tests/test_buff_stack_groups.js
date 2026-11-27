'use strict';
const assert = require('assert');

require('../src/Global');

// Buffs of one C4 kind share one slot (Skills/C4BuffStackGroups, from the L2J Mobius C4 datapack):
// a new one replaces the old unless the old is stronger.

const AdminFullBuff = invoke('GameServer/World/Generics/NpcBypasses/AdminFullBuff');
const EffectStore = invoke('GameServer/Effects/EffectStore');
const Groups = require('../src/GameServer/Skills/C4BuffStackGroups');

const actor = () => ({ effects: {}, activeBuffs: {} });
const cast = (target, selfId, level) => EffectStore.apply(target, AdminFullBuff.effectFromSkill(AdminFullBuff.skillData(selfId, level),
    Date.now() + 60000));
const ids = (target) => EffectStore.list(target, { includeDebuffs: false }).map((effect) => Number(effect.id)).sort((a, b) => a - b);

const pairs = [
    [1077, 3, 1308, 3, 'Focus and Chant of Predator (critical rate)'],
    [1242, 3, 1253, 3, 'Death Whisper and Chant of Rage (critical damage)'],
    [1253, 3, 1364, 1, 'Chant of Rage and Eye of Paagrio'],
    [1268, 4, 1310, 4, 'Vampiric Rage and Chant of Vampire'],
    [1240, 3, 1309, 3, 'Guidance and Chant of Eagle (accuracy)'],
    [1087, 3, 1252, 3, 'Agility and Chant of Evasion'],
    [1062, 2, 1261, 2, 'Berserker Spirit and Rage of Paagrio'],
    [1250, 3, 1243, 6, 'Shield of Paagrio, then the stronger Bless Shield'],
    [78, 2, 94, 2, 'War Cry and Rage'],
    [139, 3, 176, 3, 'Guts and Frenzy']
];
for (const [first, firstLevel, second, secondLevel, label] of pairs) {
    const target = actor();
    assert.ok(cast(target, first, firstLevel), `${label}: the first lands`);
    assert.ok(cast(target, second, secondLevel), `${label}: the second lands`);
    assert.deepStrictEqual(ids(target), [second], `${label}: only one of them stays`);
}

// The stronger stays: a scroll (C4 level 4) beats the buff (3), and the buff cannot push it out.
{
    const target = actor();
    cast(target, 2052, 1);
    assert.strictEqual(cast(target, 1077, 3), null, 'Focus does not replace a Scroll of Focus');
    assert.deepStrictEqual(ids(target), [2052]);
    const other = actor();
    cast(other, 1077, 3);
    cast(other, 2052, 1);
    assert.deepStrictEqual(ids(other), [2052], 'the scroll replaces Focus');
}
// A lower level of the same kind does not replace a higher one.
{
    const target = actor();
    cast(target, 1077, 3);
    assert.strictEqual(cast(target, 1308, 1), null, 'Chant of Predator 1 does not replace Focus 3');
}
// Groups this server already had still work, and different kinds still stack.
{
    const target = actor();
    cast(target, 1068, 3); cast(target, 1007, 3);
    assert.deepStrictEqual(ids(target), [1007], 'Might and Chant of Battle: one slot, as before');
    cast(target, 1077, 3); cast(target, 1242, 3); cast(target, 1268, 4);
    assert.deepStrictEqual(ids(target), [1007, 1077, 1242, 1268], 'different kinds stack');
}
// Every table entry is a known skill whose rules now name its group.
for (const [selfId, [group, levels]] of Object.entries(Groups.GROUPS)) {
    assert.ok(levels.length > 0, `${selfId} has a strength`);
    const skill = AdminFullBuff.skillData(Number(selfId), 1);
    if (!skill) continue;
    assert.strictEqual(AdminFullBuff.effectFromSkill(skill, 1).stackFamily, group, `${selfId} ${skill.name} is in ${group}`);
}
assert.strictEqual(Groups.order(1077, 9), 3, 'a level past the list reads its last entry');
assert.strictEqual(Groups.family(999999), null);

console.log('Buff stack group checks passed');
