const assert = require('assert');

require('../src/Global');

const Actor = invoke('GameServer/Actor/Actor');
const DataCache = invoke('GameServer/DataCache');
const Database = invoke('Database');
const Progression = invoke('GameServer/ClassProgression');
const SoloClass = invoke('GameServer/Solo/SoloClass');
const SoloHelper = invoke('GameServer/Solo/SoloHelper');
const ShowBoard = invoke('GameServer/Solo/ShowBoardPacket');

DataCache.init();

// The same database stand-ins as tests/test_change_class.js: a class change saves the
// class, then hands out and saves the new skills.
let storedSkills = [];
const classWrites = [];
Database.updateCharacterClassId = (id, classId) => { classWrites.push([id, classId]); return Promise.resolve(); };
Database.updateCharacterVitals = () => Promise.resolve();
Database.fetchSkill = (characterId, selfId) => Promise.resolve(storedSkills.filter((skill) => skill.selfId === selfId));
Database.setSkill = (skill) => { storedSkills.push(skill); return Promise.resolve(); };
Database.updateSkillLevel = (characterId, selfId, level) => {
    const stored = storedSkills.find((skill) => skill.selfId === selfId);
    if (stored) stored.level = level;
    return Promise.resolve();
};
Database.fetchSkills = () => Promise.resolve(storedSkills);
Database.fetchShortcuts = async () => [];

function createSession({ level = 20, classId = 31 } = {}) {
    storedSkills = [];
    const classInfo = DataCache.classTemplates.find((row) => row.classId === classId);
    const session = {
        packets: [],
        dataSendToMe(packet) { this.packets.push(packet); },
        dataSendToOthers() {},
        dataSendToMeAndOthers() {}
    };
    session.actor = new Actor(session, {
        id: 9201, name: 'ClassTabTester', username: 'tester', level,
        exp: DataCache.experience[level - 1] ?? 0, sp: 0, hp: 80, mp: 30, sex: 0, classId,
        locX: 0, locY: 0, locZ: 0, head: 0, face: 0, hair: 0, hairColor: 0, title: '',
        karma: 0, pk: 0, pvp: 0, evalScore: 0, recRemain: 0, isGM: 0, isActive: 1,
        ...utils.crushOb(classInfo), items: [], paperdoll: utils.tupleAlloc(16, {})
    });
    return session;
}

const boardPackets = (session) => session.packets.filter((packet) => packet[0] === 0x6e);

(async () => {
    // ---------- the class data ----------
    const allClasses = DataCache.classTemplates.map((row) => row.classId);
    assert.strictEqual(allClasses.length, 89, 'C4 has 89 classes (0-57 and 88-118)');
    for (const classId of allClasses) {
        assert.ok(SoloClass.CLASS_ROLE[classId], `class ${classId} (${SoloClass.nameOf(classId)}) has a role`);
        assert.ok(!SoloClass.nameOf(classId).startsWith('Class '), `class ${classId} has a name`);
    }
    for (const [key, role] of Object.entries(SoloClass.ROLES)) {
        assert.ok(DataCache.skills.some((skill) => skill.selfId === role.icon), `role ${key} icon skill ${role.icon} is a C4 skill`);
    }

    // Every starting class: its tree walks to 3rd classes only along real transfers.
    const starts = [0, 10, 18, 25, 31, 38, 44, 49, 53];
    let leaves = 0;
    for (const start of starts) {
        const rows = SoloClass.tree(start);
        assert.ok(rows.length >= 2, `${SoloClass.nameOf(start)} has at least two paths`);
        for (const row of rows) {
            assert.strictEqual(row.length, 4, `${row.map(SoloClass.nameOf).join(' > ')} runs from start to a 3rd class`);
            assert.strictEqual(row[0], start);
            assert.ok(Progression.getThirdClass(row[3]), `${SoloClass.nameOf(row[3])} is a 3rd class`);
            assert.deepStrictEqual(Progression.lineage(row[3]), row, 'the row is the 3rd class lineage');
        }
        leaves += rows.length;
    }
    assert.strictEqual(leaves, 31, 'the nine trees end in all 31 C4 3rd classes');
    // The tree is the race's, from wherever you stand on it.
    assert.deepStrictEqual(SoloClass.tree(106), SoloClass.tree(31), 'a Shillien Templar sees the Dark Elf fighter tree');
    assert.deepStrictEqual(SoloClass.tree(31).map((row) => row.slice(1).map(SoloClass.nameOf)), [
        ['Palus Knight', 'Shillien Knight', 'Shillien Templar'],
        ['Palus Knight', 'Bladedancer', 'Spectral Dancer'],
        ['Assassin', 'Abyss Walker', 'Ghost Hunter'],
        ['Assassin', 'Phantom Ranger', 'Ghost Sentinel']
    ], 'Dark Elven Fighter: Palus Knight or Assassin, then their 2nd and 3rd classes');

    // ---------- what the tab offers ----------
    {
        const low = createSession({ level: 19, classId: 31 });
        assert.deepStrictEqual(SoloClass.choices(low.actor).map((entry) => [entry.name, entry.requiredLevel, entry.ready]),
            [['Palus Knight', 20, false], ['Assassin', 20, false]], 'at 19 both 1st classes show, not ready');
        const html = await SoloHelper.handleBoard(low, ['class']);
        assert.ok(html.includes('Needs level 20'), 'a locked card says the level it needs');
        assert.ok(!html.includes('bypass _bbssolo class pick'), 'nothing is pickable below level 20');
        const forced = await SoloHelper.handleBoard(low, ['class', 'yes', '32']);
        assert.ok(forced.includes('Palus Knight needs level 20.'), 'a crafted link below the level is refused');
        assert.strictEqual(low.actor.fetchClassId(), 31, 'and the class stays');

        const third = createSession({ level: 76, classId: 106 });
        assert.deepStrictEqual(SoloClass.choices(third.actor), [], 'a 3rd class has nothing next');
        assert.ok((await SoloHelper.handleBoard(third, ['class'])).includes('is your last class in C4.'));

        const skipper = createSession({ level: 45, classId: 31 });
        assert.deepStrictEqual(SoloClass.choices(skipper.actor).map((entry) => entry.requiredLevel), [20, 20],
            'a level 45 Dark Elven Fighter still takes the 1st class first');
    }

    // ---------- pick, confirm, change ----------
    {
        const session = createSession({ level: 20, classId: 31 });
        const html = await SoloHelper.handleBoard(session, ['class']);
        assert.ok(html.length < ShowBoard.MAX_LENGTH, `the tab fits one community board page (${html.length})`);
        assert.ok(boardPackets(session).length >= 3, 'the tab goes out as board packets');
        assert.match(html, /value="Class"[^>]*fore="L2UI_ch3\.Btn1_normalOn"/, 'the Class top tab is pressed');
        assert.ok(html.includes('Choose your level 20 class'));
        for (const name of ['Palus Knight', 'Assassin', 'Shillien Templar', 'Spectral Dancer', 'Ghost Hunter', 'Ghost Sentinel'])
            assert.ok(html.includes(name), `the tree shows ${name}`);
        assert.ok(html.includes('bypass _bbssolo class pick 32') && html.includes('bypass _bbssolo class pick 35'), 'both 1st classes are pickable');
        assert.ok(html.includes('Then: Shillien Knight or Bladedancer'), 'a card says where the class leads');
        assert.ok(!html.includes('pick 33'), 'a 2nd class is not pickable yet');

        const wrong = await SoloHelper.handleBoard(session, ['class', 'pick', '36']);
        assert.ok(wrong.includes('That class is not open to you.'), 'a class from further down the tree is refused');
        const otherRace = await SoloHelper.handleBoard(session, ['class', 'yes', '4']);
        assert.ok(otherRace.includes('That class is not open to you.'), 'another race\'s class is refused');
        assert.strictEqual(session.actor.fetchClassId(), 31);

        const confirm = await SoloHelper.handleBoard(session, ['class', 'pick', '32']);
        assert.ok(confirm.includes('Become a Palus Knight?') && confirm.includes('You cannot change back.'), 'a pick asks first');
        assert.ok(confirm.includes('bypass _bbssolo class yes 32'), 'with a Yes button');
        assert.strictEqual(session.actor.fetchClassId(), 31, 'asking changes nothing');
        assert.strictEqual(classWrites.length, 0);

        const done = await SoloHelper.handleBoard(session, ['class', 'yes', '32']);
        assert.strictEqual(session.actor.fetchClassId(), 32, 'Yes makes you a Palus Knight');
        assert.deepStrictEqual(classWrites.at(-1), [9201, 32], 'the new class is saved');
        assert.ok(session.actor.skillset.fetchSkills().length > 0, 'the new class skills are learned');
        assert.ok(session.packets.some((packet) => packet[0] === 0x58), 'the client gets the new skill list');
        assert.ok(done.includes('You are now a Palus Knight.'), 'the board says so');
        assert.ok(done.includes('Choose your level 40 class') && done.includes('Needs level 40'), 'and shows the 2nd class cards next');
        assert.ok(!done.includes('pick 35'), 'the Assassin path is closed');

        const again = await SoloHelper.handleBoard(session, ['class', 'yes', '35']);
        assert.ok(again.includes('That class is not open to you.'), 'a second 1st class is refused');
        assert.strictEqual(session.actor.fetchClassId(), 32);
    }
    {
        const session = createSession({ level: 76, classId: 33 });
        await SoloHelper.handleBoard(session, ['class', 'yes', '106']);
        assert.strictEqual(session.actor.fetchClassId(), 106, 'a level 76 Shillien Knight becomes a Shillien Templar');
        const dead = createSession({ level: 40, classId: 32 });
        dead.actor.isDead = () => true;
        assert.ok((await SoloHelper.handleBoard(dead, ['class', 'yes', '33'])).includes('while dead'), 'no class change while dead');
        assert.strictEqual(dead.actor.fetchClassId(), 32);
    }

    // ---------- chat command and config ----------
    {
        const session = createSession({ level: 20, classId: 0 });
        assert.strictEqual(SoloHelper.command(session, '.class'), true, '.class opens the tab');
        assert.ok(boardPackets(session).length >= 3);
        const savedOptions = global.options.default.SoloHelper;
        global.options.default.SoloHelper = { classChange: 'false' };
        try {
            assert.strictEqual(SoloHelper.command(session, '.class'), false, 'classChange = false turns .class off');
            const html = await SoloHelper.handleBoard(session, ['class', 'yes', '4']);
            assert.ok(!String(html).includes('value="Class"'), 'classChange = false hides the tab');
            assert.strictEqual(session.actor.fetchClassId(), 0, 'and changes nothing');
        } finally {
            global.options.default.SoloHelper = savedOptions;
        }
    }

    console.log('solo class: ok');
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
