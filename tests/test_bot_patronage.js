// Living Bots: patronage and hand-me-downs, on a real throwaway database. A background bot far
// richer than it needs gives a share of its spare Adena to a struggling clanmate; a piece of
// gear it carries but does not wear goes to a clanmate who wears it now. Both move real item
// rows between two cold bots (Database.giftAdena / giftItem): nothing appears or vanishes,
// and a live bot is never written to.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
require('../src/Global');

const Database = invoke('Database');
const DataCache = invoke('GameServer/DataCache');
const LifeState = invoke('GameServer/Bot/Population/BotLifeState');
const World = invoke('GameServer/World/World');
const Patronage = require('../src/GameServer/Bot/Economy/BotPatronage');

const databasePath = path.join(process.cwd(), 'tmp', 'test-bot-patronage.sqlite');
// Windows keeps the open database locked until the process ends: a file that cannot go
// now is replaced by the next run's own clean start.
function clean() {
    for (const file of [databasePath, databasePath.replace(/\.sqlite$/, '.history.sqlite')]) {
        for (const suffix of ['', '-wal', '-shm']) {
            try { fs.rmSync(file + suffix, { force: true }); } catch (error) { if (error.code !== 'EBUSY') throw error; }
        }
    }
}

let created = 0;
async function bot(account, { adena, level = 25, phase = 'cold', clanId = 0, items = [] }) {
    await Database.createAccount(account, 'pw');
    const name = `Patron${++created}`;
    const id = Number((await Database.createCharacter(account, {
        name, race: 0, classId: 0, maxHp: 100, maxMp: 100, sex: 0, face: 0, hair: 0, hairColor: 0,
        locX: 82700, locY: 148600, locZ: -3470
    })).insertId);
    await Database.setItem(id, { selfId: 57, name: 'Adena', amount: adena, enchant: 0, equipped: false, slot: 0 });
    for (const item of items) await Database.setItem(id, { amount: 1, enchant: 0, equipped: false, ...item });
    const inventory = LifeState.inventorySummaryFromItems(await Database.fetchItems(id));
    await LifeState.upsertState({
        characterId: id, accountName: account, name, level, adena, phase, activity: 'hunting',
        currentRegion: 'Giran', loc: { locX: 82700, locY: 148600, locZ: -3470 }, inventory,
        vitals: { hp: 100, maxHp: 100, mp: 100, maxMp: 100 },
        stats: { generatedCold: true, clanId, earning: { income: 300000 } }, timing: {}
    }, 'test_seed');
    return id;
}

const adenaOf = async (id) => Number((await Database.execute(['SELECT SUM(amount) AS amount FROM items WHERE characterId = ? AND selfId = 57', [id]]))[0].amount || 0);
const rowsOf = async (id, selfId) => Database.execute(['SELECT id, enchant, equipped FROM items WHERE characterId = ? AND selfId = ?', [id, selfId]]);
const lifeAdena = async (id) => Number((await Database.execute(['SELECT adena FROM bot_life_state WHERE characterId = ?', [id]]))[0].adena);

(async () => {
    clean();
    options.default.Database.path = path.relative(process.cwd(), databasePath);
    Database.init();
    DataCache.init();
    World.user = { sessions: [], revision: 0 };
    invoke('GameServer/Bot/BotManager').sessions = [];
    await LifeState.init();

    // ---------- the gift itself ----------
    const rich = await bot('bot_patron_rich', { adena: 40e6 });
    const poor = await bot('bot_patron_poor', { adena: 120000, level: 22 });
    const live = await bot('bot_patron_live', { adena: 5000, phase: 'hot' });

    const paid = await Database.giftAdena({ fromId: rich, toId: poor, amount: 5e6 });
    assert.strictEqual(paid.ok, true, 'a cold bot gives Adena to a cold bot');
    assert.strictEqual(await adenaOf(rich), 35e6, 'the giver\'s bag loses it');
    assert.strictEqual(await adenaOf(poor), 5120000, 'the taker\'s bag gains it');
    assert.strictEqual(await lifeAdena(poor), 5120000, 'and the simulation\'s wallet says so');
    assert.strictEqual(Number(paid.rows[poor].adena), 5120000, 'the returned row is the taker\'s new state');
    assert.strictEqual(Number(paid.rows[rich].adena), 35e6);

    assert.strictEqual((await Database.giftAdena({ fromId: rich, toId: live, amount: 1e6 })).code, 'gift_not_cold',
        'a live bot\'s bag is its actor\'s: refused');
    assert.strictEqual(await adenaOf(rich), 35e6, 'and nothing moved');
    assert.strictEqual((await Database.giftAdena({ fromId: poor, toId: rich, amount: 9e9 })).code, 'gift_changed',
        'more than the giver holds: refused');
    assert.strictEqual((await Database.giftAdena({ fromId: rich, toId: rich, amount: 1 })).code, 'gift_invalid');

    // An item: one unworn row moves with its enchant.
    await Database.setItem(rich, { selfId: 2, name: 'Long Sword', amount: 1, enchant: 3, equipped: false, slot: 7 });
    const [sword] = await rowsOf(rich, 2);
    const handed = await Database.giftItem({ fromId: rich, toId: poor, itemId: sword.id, selfId: 2, enchant: 3 });
    assert.strictEqual(handed.ok, true, 'a cold bot hands a piece of gear down');
    assert.strictEqual((await rowsOf(rich, 2)).length, 0, 'the giver no longer has it');
    const got = await rowsOf(poor, 2);
    assert.strictEqual(got.length, 1, 'the taker has it');
    assert.strictEqual(Number(got[0].enchant), 3, 'with its enchant');
    assert.ok(handed.rows[poor].inventory?.[2] || handed.rows[poor].inventoryPatch?.[2], 'the taker\'s summary knows it');
    assert.strictEqual((await Database.giftItem({ fromId: rich, toId: poor, itemId: sword.id, selfId: 2, enchant: 3 })).code,
        'gift_changed', 'a piece already given cannot be given twice');

    // ---------- the rules ----------
    const state = (fields) => ({ characterId: 1, level: 30, adena: 0, inventory: {}, stats: { earning: { income: 300000 } }, ...fields });
    assert.strictEqual(Patronage.surplus(state({ adena: 40e6 })), 40e6 - 24 * 300000, 'it keeps a day of its own income');
    assert.strictEqual(Patronage.surplus(state({ adena: 6e6, stats: { earning: { income: 10000 } } })), 1e6, 'at least 5kk');
    assert.strictEqual(Patronage.giftAmount(state({ adena: 200e6 }), state({ stats: { earning: { income: 300000 } } })), 3e6,
        'a gift covers about ten hours of the taker\'s income');
    assert.strictEqual(Patronage.giftAmount(state({ adena: 13e6 }), state()), 1.7e6, 'never more than 30% of the surplus (5.8kk spare: 1.74kk, in 100k steps)');
    assert.strictEqual(Patronage.giftAmount(state({ adena: 2e9 }), state({ stats: { earning: { income: 9e6 } } })), Patronage.GIFT_MAX,
        'and never more than 20kk at once');
    assert.strictEqual(Patronage.struggle(state({ level: 8, adena: 0 })), 0, 'a newbie below level 10 is not a charity case');
    assert.ok(Patronage.struggle(state({ level: 30, adena: 50000 })) > 0, 'a poor bot is struggling');

    // ---------- the scan ----------
    const clan = 77;
    const patron = await bot('bot_patron_clan_rich', { adena: 60e6, level: 45, clanId: clan,
        items: [{ selfId: 1, name: 'Short Sword', slot: 7 }] });
    const member = await bot('bot_patron_clan_poor', { adena: 80000, level: 14, clanId: clan });
    const outsider = await bot('bot_patron_other_poor', { adena: 80000, level: 14, clanId: 0 });
    Patronage._reset();
    const states = LifeState.everyState().filter((entry) => [patron, member, outsider].includes(Number(entry.characterId)));
    assert.strictEqual(states.length, 3, 'the three bots are cached');
    const result = await Patronage.scan(Date.now(), { random: () => 0, states });
    assert.strictEqual(result.patronage, 1, 'the rich bot helps one clanmate');
    const gained = await adenaOf(member);
    assert.ok(gained >= 80000 + Patronage.GIFT_MIN, `the clanmate got at least 1kk (now ${gained})`);
    assert.strictEqual(await adenaOf(outsider), 80000, 'a stranger gets nothing');
    assert.strictEqual(await adenaOf(patron), 60e6 + 80000 - gained, 'what one bag lost the other gained');
    assert.strictEqual(result.handMeDowns, 1, 'the spare Short Sword goes to the clanmate who wears it');
    assert.strictEqual((await rowsOf(patron, 1)).length, 0);
    assert.strictEqual((await rowsOf(member, 1)).length, 1);

    // Cooldown: the same patron does not give again at once.
    const again = await Patronage.scan(Date.now() + 1000, { random: () => 0, states: LifeState.everyState()
        .filter((entry) => [patron, member, outsider].includes(Number(entry.characterId))) });
    assert.strictEqual(again.patronage, 0, 'one gift per patron per few hours');

    // Off by config.
    const Config = invoke('GameServer/Bot/Population/PopulationConfig');
    Patronage._reset();
    Config.patronageEnabled = false; Config.handMeDownsEnabled = false;
    assert.deepStrictEqual(await Patronage.scan(Date.now(), { random: () => 0, states }), { patronage: 0, handMeDowns: 0 }, 'switched off');
    Config.patronageEnabled = true; Config.handMeDownsEnabled = true;

    clean();
    console.log('Bot patronage checks passed');
    process.exit(0);
})().catch((error) => {
    console.error(error);
    clean();
    process.exit(1);
});
