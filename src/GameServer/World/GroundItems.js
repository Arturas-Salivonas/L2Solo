'use strict';

// Ground items of the world (`World.items`): the spawns list, and the items a
// party drop was made for, by its leader's id (NpcRewards `partyLootLeaderId`),
// so a party's loot scan reads its own drops instead of every item on the
// ground. `put` (SpawnItem) and `take` (PickupItem) are the only writers; a
// drop's leader is fixed when it spawns. Every item is also kept by its CELL
// square of the map, with the time it fell (`groundSince`), so a bot can look
// for free items near it (`near`, BotFreeLoot) without reading every spawn.
const NONE = new Set();
const CELL = 1024;
const cellKey = (x, y) => `${Math.floor(Number(x) / CELL)}:${Math.floor(Number(y) / CELL)}`;
const cellOf = item => cellKey(item?.fetchLocX?.(), item?.fetchLocY?.());

function leaderOf(item) {
    return Number(item?.model?.partyLootLeaderId ?? item?.partyLootLeaderId ?? 0);
}

function ownerOf(item) {
    return item?.model?.partyLootGroupKey || item?.partyLootGroupKey || leaderOf(item);
}

function put(items, item, now = Date.now()) {
    items.spawns.push(item);
    item.groundSince ??= now;
    if (item.fetchLocX && item.fetchLocY) {
        items.byCell ??= new Map();
        const key = cellOf(item), cell = items.byCell.get(key) ?? new Set();
        cell.add(item);
        items.byCell.set(key, cell);
    }
    const leaderId = ownerOf(item);
    if (!leaderId || typeof leaderId === 'number' && leaderId <= 0) return item;
    items.byLeader ??= new Map();
    const owned = items.byLeader.get(leaderId) ?? new Set();
    owned.add(item);
    items.byLeader.set(leaderId, owned);
    return item;
}

// Removes the spawn at `index` and returns it.
function take(items, index) {
    const [item] = items.spawns.splice(index, 1);
    const key = item?.fetchLocX ? cellOf(item) : null, cell = key && items.byCell?.get(key);
    if (cell?.delete(item) && cell.size === 0) items.byCell.delete(key);
    const leaderId = ownerOf(item);
    const owned = items.byLeader?.get(leaderId);
    if (owned?.delete(item) && owned.size === 0) items.byLeader.delete(leaderId);
    return item;
}

function ownedBy(items, leaderId) {
    const key = typeof leaderId === 'string' && leaderId.startsWith('command:') ? leaderId : Number(leaderId);
    return items?.byLeader?.get(key) ?? NONE;
}

// The items on the ground within `radius` of `loc` (2D), from the cells it touches.
function near(items, loc, radius) {
    if (!items?.byCell?.size || !loc) return [];
    const found = [], x = Number(loc.locX), y = Number(loc.locY);
    for (let cx = Math.floor((x - radius) / CELL); cx <= Math.floor((x + radius) / CELL); cx++) {
        for (let cy = Math.floor((y - radius) / CELL); cy <= Math.floor((y + radius) / CELL); cy++) {
            for (const item of items.byCell.get(`${cx}:${cy}`) || NONE) {
                if (Math.hypot(item.fetchLocX() - x, item.fetchLocY() - y) <= radius) found.push(item);
            }
        }
    }
    return found;
}

module.exports = { put, take, ownedBy, leaderOf, ownerOf, near, CELL };
