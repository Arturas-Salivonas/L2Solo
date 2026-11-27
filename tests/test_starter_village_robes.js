'use strict';
const assert = require('assert');

require('../src/Global');

// Every C4 starter armor dealer sells the No-Grade robe set beside its fighter armor
// (Lisvus fdc7e33a buylists 12, 34, 40, 78, 84; L2J Mobius C4 agrees). Talking Island,
// the Elven Village and the Dark Elven Village sold fighter armor only.

const DataCache = invoke('GameServer/DataCache');
DataCache.init();
const NpcShopBuyLists = invoke('GameServer/World/Generics/NpcShopBuyLists');

// The ten robe pieces and their C4 shop prices (1.15 x the item's price).
const ROBES = [[462, 106], [426, 169], [1103, 1748], [1100, 2795], [463, 1748], [428, 2795],
    [464, 5716], [429, 9154], [1104, 14605], [1101, 23345]];
const DEALERS = { 7002: 'Jackson, Talking Island', 7136: 'Payne, Elven Village', 7148: 'Ariel, Dark Elven Village',
    7517: 'Shari, Dwarven Village', 7559: 'Kunai, Orc Village' };
const kind = selfId => DataCache.items.find(item => item.selfId === selfId)?.template?.kind;

for (const [selfId] of ROBES) assert.strictEqual(kind(selfId), 'Armor.Fabric', `${selfId} is a robe piece`);
for (const [npc, who] of Object.entries(DEALERS)) {
    const rows = NpcShopBuyLists.fetchForNpc(Number(npc));
    for (const [selfId, price] of ROBES) {
        const row = rows.find(entry => Number(entry.selfId) === selfId);
        assert(row, `${who} sells robe piece ${selfId}`);
        if (row.price !== undefined) assert.strictEqual(row.price, price, `${who} sells ${selfId} at the C4 price`);
    }
    assert(rows.some(entry => kind(Number(entry.selfId)) === 'Armor.Leather'), `${who} still sells fighter armor`);
}

console.log('Starter village robe checks passed');
