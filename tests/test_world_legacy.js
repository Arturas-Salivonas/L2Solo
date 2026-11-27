'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

// World legacy (Bot/Legacy): what a world taught its bots, saved before a wipe and read by the next
// world: returning bots (name, persona, know-how) and spot lessons.

const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'world-legacy-'));
process.env.L2SOLO_LEGACY_DIR = folder;
process.once('exit', () => fs.rmSync(folder, { recursive: true, force: true }));
require('../src/Global');
const Legacy = require('../src/GameServer/Bot/Legacy/WorldLegacy');
const Returning = invoke('GameServer/Bot/Legacy/ReturningBots');
const Lessons = require('../src/GameServer/Bot/Legacy/SpotLessons');

// ---------- a small world ----------
function world() {
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE characters (id INTEGER PRIMARY KEY, username TEXT, name TEXT, race INT, sex INT, classId INT, level INT);
        CREATE TABLE bot_life_state (characterId INTEGER PRIMARY KEY, statsJson TEXT);
        CREATE TABLE bot_personas (characterId INTEGER PRIMARY KEY, version INT, seed TEXT, primaryDrive TEXT, archetype TEXT,
            traitsJson TEXT, inclinationsJson TEXT, textCard TEXT);
        CREATE TABLE interaction_relations (ownerId INT, kind TEXT, targetId INT, rowJson TEXT);`);
    const hunt = (spotId, classId, level, exp, samples = 6) => ({ spotId, signature: `net-income-v3:${classId}:${level}:solo:10:10:10:10:1:0`,
        cycleMs: 3600000, exp, adena: 2000, loot: 500, costs: 100, kills: 40, samples, at: 1 });
    const bot = (id, name, race, sex, classId, level, stats, archetype) => {
        db.prepare('INSERT INTO characters VALUES (?,?,?,?,?,?,?)').run(id, `bot_pop_${id}`, name, race, sex, classId, level);
        db.prepare('INSERT INTO bot_life_state VALUES (?,?)').run(id, JSON.stringify(stats));
        if (archetype) db.prepare('INSERT INTO bot_personas VALUES (?,?,?,?,?,?,?,?)').run(id, 2, `seed${id}`, 'progression', archetype,
            JSON.stringify({ caution: 0.2, assertiveness: 0.9 }), JSON.stringify({ pvp: 0.85 }), 'card');
    };
    bot(1, 'Kael', 0, 0, 1, 24, { generatedIndex: 10001, lifelongKills: 3200, peoplePoints: 40,
        huntEfficiency: [hunt('22_23', 1, 22, 5000), hunt('20_21', 1, 22, 3000, 3)] }, 'brawler');
    bot(2, 'Lyra', 1, 1, 27, 41, { generatedIndex: 10002, lifelongKills: 9000, peoplePoints: 300,
        huntEfficiency: [hunt('22_23', 1, 23, 7000), { ...hunt('x', 27, 41, 1), signature: 'net-income-v3:27:41:party:10:10:10:10' }] }, 'party_regular');
    bot(3, 'Shopkeep', 4, 0, 56, 30, { craftShop: true }, null); // a service: no persona, no generated index
    db.prepare('INSERT INTO characters VALUES (?,?,?,?,?,?,?)').run(9, 'player1', 'Hero', 0, 0, 2, 30);
    db.prepare('INSERT INTO interaction_relations VALUES (?,?,?,?)').run(1, 'character', 9,
        JSON.stringify({ targetId: 9, affinity: -8, trust: -9, hostility: 30, fear: 6, familiarity: 4 }));
    db.prepare('INSERT INTO interaction_relations VALUES (?,?,?,?)').run(2, 'character', 1, JSON.stringify({ trust: 5 }));
    return db;
}

{
    const legacy = Legacy.collect(world(), null, 1000);
    assert.deepStrictEqual(legacy.bots.map(bot => bot.name).sort(), ['Kael', 'Lyra'], 'generated bots with a persona; no services');
    const kael = legacy.bots.find(bot => bot.name === 'Kael'), lyra = legacy.bots.find(bot => bot.name === 'Lyra');
    assert.strictEqual(kael.startClassId, 0, 'a Warrior began as a Human Fighter');
    assert.strictEqual(lyra.startClassId, 25, 'an elven mystic class began as an Elven Mystic');
    assert.deepStrictEqual(kael.knowhow, { lifelongKills: 3200, peoplePoints: 40 }, 'its know-how');
    assert.strictEqual(kael.persona.archetype, 'brawler');
    assert.deepStrictEqual(kael.persona.traits, { caution: 0.2, assertiveness: 0.9 }, 'its persona exactly');
    assert.deepStrictEqual(kael.feelings, [{ player: 'Hero', affinity: -8, trust: -9, hostility: 30, fear: 6, familiarity: 4 }],
        'its feelings toward players, by name');
    assert.deepStrictEqual(lyra.feelings, [], 'feelings toward other bots are not players\'');
    const spot = legacy.spots.find(row => row.spotId === '22_23' && row.classId === 1 && row.band === 4);
    assert.strictEqual(spot.bots, 2, 'two bots measured the spot');
    assert.strictEqual(spot.expPerHour, 6000, 'their exp an hour, by samples');
    assert.strictEqual(spot.incomePerHour, 2400, 'adena and loot less costs, an hour');
    assert(!legacy.spots.some(row => row.spotId === 'x'), 'party hunts teach no solo lesson');

    // The next legacy: a bot back this world counts one more world; one that missed it is carried on.
    const previous = { version: 1, exportedAt: 1, worlds: 1, bots: [{ ...kael, worlds: 2, knowhow: { lifelongKills: 99999, peoplePoints: 1 } },
        { name: 'Oldtimer', race: 2, startClassId: 31, worlds: 1, level: 50, persona: { archetype: 'lone_wolf' }, knowhow: {} }],
    spots: [{ spotId: 'old', classId: 1, band: 4, rates: '10:10:10:10', samples: 5, expPerHour: 100 }] };
    const next = Legacy.collect(world(), previous, 2000);
    assert.strictEqual(next.worlds, 2);
    assert.strictEqual(next.bots.find(bot => bot.name === 'Kael').worlds, 3, 'a returning bot\'s worlds add up');
    assert.strictEqual(next.bots.find(bot => bot.name === 'Kael').knowhow.lifelongKills, 99999, 'know-how never shrinks');
    assert(next.bots.some(bot => bot.name === 'Oldtimer'), 'a bot that missed a world is not forgotten');
    assert(next.spots.some(row => row.spotId === 'old'), 'a spot this world did not measure keeps its lesson');
}

// ---------- saved before a wipe ----------
{
    assert.strictEqual(Legacy.saveBeforeWipe(world(), 'players', { folder }), null, 'a players-only wipe keeps the bots: nothing to save');
    const saved = Legacy.saveBeforeWipe(world(), 'bots', { folder, now: Date.UTC(2026, 10, 27) });
    assert.strictEqual(saved.bots, 2);
    assert.strictEqual(Legacy.read(folder).bots.length, 2, 'the next world reads it');
    for (let i = 1; i <= 7; i++) Legacy.saveBeforeWipe(world(), 'all', { folder, now: Date.UTC(2026, 10, 27, i) });
    const copies = fs.readdirSync(folder).filter(name => /^world-legacy-.+\.json$/.test(name));
    assert(copies.length <= 5, `a few dated copies are kept: ${copies.length}`);
    assert.strictEqual(Legacy.read(folder).worlds, 8, 'each save is one more world (1 + 7)');
    const empty = new DatabaseSync(':memory:');
    empty.exec(`CREATE TABLE characters (id INTEGER PRIMARY KEY, username TEXT, name TEXT, race INT, sex INT, classId INT, level INT);
        CREATE TABLE bot_life_state (characterId INTEGER PRIMARY KEY, statsJson TEXT);
        CREATE TABLE bot_personas (characterId INTEGER PRIMARY KEY, version INT, seed TEXT, primaryDrive TEXT, archetype TEXT,
            traitsJson TEXT, inclinationsJson TEXT, textCard TEXT);`);
    const before = fs.readFileSync(path.join(folder, 'world-legacy.json'), 'utf8');
    Legacy.saveBeforeWipe(empty, 'all', { folder });
    assert(JSON.parse(fs.readFileSync(path.join(folder, 'world-legacy.json'), 'utf8')).bots.length >= 2,
        'an empty world keeps the roster it inherited');
    assert.notStrictEqual(before, '', 'sanity');
}

// ---------- returning bots ----------
{
    Returning.reset();
    const first = Returning.claim(0, 0);
    assert.strictEqual(first?.name, 'Kael', 'a human fighter slot takes Kael back');
    assert.strictEqual(Returning.claim(0, 0), null, 'once');
    assert.strictEqual(Returning.claim(1, 18), null, 'a slot of another class does not take Lyra');
    Returning.reset();
    Returning.prepare([{ name: 'kael' }]);
    assert.strictEqual(Returning.claim(0, 0), null, 'a bot already back in this world (a restart) is not claimed again');
    const welcomed = Returning.welcome({ stats: { generatedIndex: 5, lifelongKills: 0 } }, first);
    assert(welcomed.stats.lifelongKills >= 3200 && welcomed.stats.peoplePoints >= 40, 'it keeps its know-how');
    assert.strictEqual(welcomed.stats.legacy.level, 24, 'and remembers where it got to');
    assert.strictEqual(welcomed.stats.generatedIndex, 5, 'the rest of its new state stays');
    assert.strictEqual(Returning.welcome({ stats: {} }, null).stats.lifelongKills, undefined, 'a new bot is a new bot');

    const Database = invoke('Database');
    const savedFetch = Database.fetchCharacterName;
    (async () => {
        try {
            Database.fetchCharacterName = () => Promise.resolve([]);
            assert.strictEqual(await Returning.nameFor(first, () => Promise.resolve('Other')), 'Kael', 'its old name when free');
            Database.fetchCharacterName = () => Promise.resolve([{ id: 77 }]);
            assert.strictEqual(await Returning.nameFor(first, () => Promise.resolve('Other')), 'Other', 'else a new one');
            const Config = invoke('GameServer/Bot/Population/PopulationConfig');
            Config.worldLegacyEnabled = false; Returning.reset();
            assert.strictEqual(Returning.claim(0, 0), null, 'worldLegacyEnabled = false: no bot comes back');
            Config.worldLegacyEnabled = true;

            // ---------- the persona comes back exactly ----------
            const BotPersona = invoke('GameServer/Bot/AI/BotPersona');
            const savedExecute = Database.execute;
            const writes = [];
            Database.execute = (...args) => { writes.push(args); return Promise.resolve([]); };
            try {
                const restored = await BotPersona.restore({ characterId: 4242, stats: { generatedIndex: 777 } }, first.persona);
                assert.strictEqual(restored.archetype, 'brawler');
                assert.strictEqual(restored.traits.assertiveness, 0.9, 'its traits as they were');
                assert.strictEqual(restored.inclinations.pvp, 0.85, 'its inclinations as they were');
                assert(writes.some(([statement]) => /INSERT INTO bot_personas/.test(statement[0])), 'and it is saved');
            } finally { Database.execute = savedExecute; }
        } finally { Database.fetchCharacterName = savedFetch; }

        // ---------- spot lessons ----------
        const Table = invoke('GameServer/Bot/AI/SpotValueTable'), Rates = invoke('GameServer/ProgressionRates');
        const saved = { role: Table.roleFor, profile: Rates.profile };
        try {
            Table.roleFor = () => 'fighter';
            Rates.profile = () => ({ exp: 1, adena: 1, drop: 1, spoil: 1 });
            const spots = [['A', 2000], ['B', 1000], ['C', 1000], ['D', 500], ['E', 1000]]
                .map(([spotId, expPerHour]) => ({ spotId, classId: 1, band: 4, rates: '1:1:1:1', samples: 100, bots: 5, expPerHour }));
            Legacy.write({ version: 1, exportedAt: 5, bots: [], spots: [...spots,
                { spotId: 'F', classId: 1, band: 9, rates: '1:1:1:1', samples: 100, expPerHour: 900 }] }, folder);
            Lessons.reset();
            const factor = Lessons.forBot({ level: 22 }, 'fighter', () => ({ exp: 1000 }));
            assert.strictEqual(factor('A'), Lessons.MAX, 'a spot that paid twice the others is better, held at MAX');
            assert.strictEqual(factor('D'), Lessons.MIN, 'one that paid half is worse, held at MIN');
            assert.strictEqual(factor('B'), 1, 'one like the others is as the table says');
            assert.strictEqual(factor('Z'), 1, 'a spot nobody measured is as the table says');
            assert.strictEqual(Lessons.forBot({ level: 47 }, 'fighter', () => ({ exp: 1000 }))('F'), 1,
                'a band with too few lessons teaches nothing');
            const shy = spots.map(spot => ({ ...spot, samples: 2 }));
            Legacy.write({ version: 1, exportedAt: 6, bots: [], spots: shy }, folder);
            Lessons.reset();
            const weak = Lessons.forBot({ level: 22 }, 'fighter', () => ({ exp: 1000 }))('A');
            assert(weak > 1 && weak < 1.1, `a lesson of two samples barely moves the estimate: ${weak}`);
            Rates.profile = () => ({ exp: 10, adena: 10, drop: 10, spoil: 10 });
            Lessons.reset();
            assert.strictEqual(Lessons.forBot({ level: 22 }, 'fighter', () => ({ exp: 1000 }))('A'), 1, 'lessons of other rates do not apply');
            assert.strictEqual(Lessons.revision(), 6, 'the lessons\' revision is the legacy\'s');
        } finally { Table.roleFor = saved.role; Rates.profile = saved.profile; Lessons.reset(); }
        console.log('World legacy checks passed');
    })().catch((error) => { console.error(error); process.exit(1); });
}
