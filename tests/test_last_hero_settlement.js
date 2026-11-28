// Last Hero pays a background (cold) bot winner through the board settlement queue,
// on a real throwaway database: the prize waits for the bot's next save, as a sale it
// made while away. A live bot gets nothing written there (its bag is the main thread's).
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const storeFile = path.join(os.tmpdir(), `last-hero-settle-${process.pid}.json`);
process.env.L2SOLO_LAST_HERO_FILE = storeFile;
require('../src/Global');

const Database = invoke('Database');
const DataCache = invoke('GameServer/DataCache');
const LifeState = invoke('GameServer/Bot/Population/BotLifeState');
const World = invoke('GameServer/World/World');
const Store = invoke('GameServer/Events/LastHero/LastHeroStore');
const LastHero = invoke('GameServer/Events/LastHero/LastHero');

const databasePath = path.join(process.cwd(), 'tmp', 'test-last-hero-settlement.sqlite');
// Windows keeps the open database locked until the process ends: a file that cannot go
// now is replaced by the next run's own clean start.
function clean() {
    for (const file of [databasePath, databasePath.replace(/\.sqlite$/, '.history.sqlite'), storeFile]) {
        for (const suffix of file === storeFile ? [''] : ['', '-wal', '-shm']) {
            try { fs.rmSync(file + suffix, { force: true }); } catch (error) { if (error.code !== 'EBUSY') throw error; }
        }
    }
}

let created = 0;
async function bot(account, adena, phase) {
    await Database.createAccount(account, 'pw');
    const id = Number((await Database.createCharacter(account, {
        name: `Hero${++created}`, race: 0, classId: 0, maxHp: 100, maxMp: 100, sex: 0, face: 0, hair: 0, hairColor: 0,
        locX: 82700, locY: 148600, locZ: -3470
    })).insertId);
    await Database.setItem(id, { selfId: 57, name: 'Adena', amount: adena, enchant: 0, equipped: false, slot: 0 });
    const inventory = LifeState.inventorySummaryFromItems(await Database.fetchItems(id));
    await LifeState.upsertState({
        characterId: id, accountName: account, name: `Hero${created}`, level: 20, adena, phase, activity: 'hunting',
        currentRegion: 'Giran', loc: { locX: 82700, locY: 148600, locZ: -3470 }, inventory,
        vitals: { hp: 100, maxHp: 100, mp: 100, maxMp: 100 }, stats: { generatedCold: true }, timing: {}
    }, 'test_seed');
    return id;
}

const settlements = async (id) => Database.execute(['SELECT selfId, amount FROM board_settlements WHERE ownerId = ? ORDER BY id', [id]]);
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

(async () => {
    clean();
    options.default.Database.path = path.relative(process.cwd(), databasePath);
    Database.init();
    DataCache.init();
    World.user = { sessions: [], revision: 0 };
    invoke('GameServer/Bot/BotManager').sessions = [];
    await LifeState.init();

    const cold = await bot('bot_hero_cold', 173734, 'cold');
    const hot = await bot('bot_hero_hot', 5000, 'hot');

    // The database entry: a cold bot's prize waits on the board, a live bot's is not written.
    assert.strictEqual(await Database.settleColdCharacter(cold, { selfId: 57, name: 'Adena', stackable: 1 }, 1000), 'settlement',
        'a cold bot is paid by settlement');
    assert.deepStrictEqual((await settlements(cold)).map((row) => [Number(row.selfId), Number(row.amount)]), [[57, 1000]]);
    assert.strictEqual(await Database.settleColdCharacter(hot, { selfId: 57, name: 'Adena', stackable: 1 }, 1000), null,
        'a live bot is not written to');
    assert.strictEqual((await settlements(hot)).length, 0);
    const bag = await Database.execute(['SELECT SUM(amount) AS amount FROM items WHERE characterId = ? AND selfId = 57', [cold]]);
    assert.strictEqual(Number(bag[0].amount), 173734, 'the bag waits for the bot\'s own save (the simulation owns it)');

    // Through Last Hero: an owed winner in the background is paid and no longer owed;
    // a bot that is live but not spawned here keeps its prize owed.
    Store.update((state) => { state.prizes = { [cold]: { adena: 5000000, items: [[3470, 2]] }, [hot]: { adena: 7000000, items: [] } }; });
    LastHero.payBotPrizes();
    await settle(); await settle();
    const paid = (await settlements(cold)).map((row) => [Number(row.selfId), Number(row.amount)]);
    assert.deepStrictEqual(paid, [[57, 1000], [57, 5000000], [3470, 2]], 'the prize and its items wait for the cold winner');
    assert.strictEqual(Store.read().prizes[cold], undefined, 'and it is no longer owed');
    assert.deepStrictEqual(Store.read().prizes[hot], { adena: 7000000, items: [] }, 'a live bot not spawned here stays owed');
    assert.strictEqual((await settlements(hot)).length, 0);

    LastHero._reset();
    clean();
    console.log('last hero settlement: ok');
    process.exit(0);
})().catch((error) => {
    console.error(error);
    clean();
    process.exit(1);
});
