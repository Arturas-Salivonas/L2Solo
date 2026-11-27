'use strict';

// Solo Helper Class tab (fork-only, branch mine/solo-buffer): change your class at
// level 20, 40 and 76 without the class quests.
//
// The tab shows your race's whole C4 class tree (ClassProgression), your path in
// green, and a card for each class you can take next. A pick asks to confirm, then
// runs the server's own transfer (ClassTransfer.transfer): it saves the new class,
// hands out its skills up to your level, and refreshes your stats and the client.
// Which classes you can take, and at what level, comes only from
// ClassTransfer.eligibility, never from the link the client sends back.

const Html = require('../World/Generics/HtmlKit');
const Progression = require('../ClassProgression');
const Style = require('./BoardStyle');

const BOARD_WIDTH = Style.WIDTH;
const STEP_LEVELS = Object.freeze([0, 20, 40, 76]);
const ICON = 32;

// What each class does, and the skill whose icon stands for it on the board.
// Every icon skill is in the C4 datapack (tests/test_solo_class.js checks).
const ROLES = Object.freeze({
    start: { label: 'Starting class', icon: 3 },
    startMystic: { label: 'Starting class', icon: 1177 },
    tank: { label: 'Tank', icon: 28 },
    warrior: { label: 'Melee damage', icon: 190 },
    raider: { label: 'Melee damage', icon: 176 },
    monk: { label: 'Fist fighter', icon: 284 },
    scout: { label: 'Dagger or bow', icon: 30 },
    dagger: { label: 'Dagger', icon: 263 },
    archer: { label: 'Archer', icon: 56 },
    mage: { label: 'Mage', icon: 1220 },
    sorcerer: { label: 'Nuker', icon: 1230 },
    necro: { label: 'Nuker, curses', icon: 1159 },
    water: { label: 'Nuker', icon: 1235 },
    dark: { label: 'Nuker', icon: 1267 },
    warlock: { label: 'Summoner', icon: 1111 },
    unicorn: { label: 'Summoner', icon: 1226 },
    shadow: { label: 'Summoner', icon: 1228 },
    healer: { label: 'Healer', icon: 1217 },
    cleric: { label: 'Healer', icon: 1011 },
    prophet: { label: 'Buffer', icon: 1068 },
    shaman: { label: 'Buffer', icon: 1006 },
    overlord: { label: 'Clan buffer', icon: 1003 },
    songs: { label: 'Songs', icon: 264 },
    dances: { label: 'Dances', icon: 271 },
    spoiler: { label: 'Spoiler', icon: 254 },
    crafter: { label: 'Crafter', icon: 172 }
});

const CLASS_ROLE = Object.freeze({
    0: 'start', 18: 'start', 31: 'start', 44: 'start', 53: 'start',
    10: 'startMystic', 25: 'startMystic', 38: 'startMystic', 49: 'startMystic',
    1: 'warrior', 2: 'warrior', 3: 'warrior', 88: 'warrior', 89: 'warrior',
    4: 'tank', 5: 'tank', 6: 'tank', 90: 'tank', 91: 'tank',
    7: 'scout', 8: 'dagger', 9: 'archer', 92: 'archer', 93: 'dagger',
    11: 'mage', 12: 'sorcerer', 13: 'necro', 14: 'warlock', 94: 'sorcerer', 95: 'necro', 96: 'warlock',
    15: 'cleric', 16: 'healer', 17: 'prophet', 97: 'healer', 98: 'prophet',
    19: 'tank', 20: 'tank', 21: 'songs', 99: 'tank', 100: 'songs',
    22: 'scout', 23: 'dagger', 24: 'archer', 101: 'dagger', 102: 'archer',
    26: 'mage', 27: 'water', 28: 'unicorn', 103: 'water', 104: 'unicorn',
    29: 'healer', 30: 'healer', 105: 'healer',
    32: 'tank', 33: 'tank', 34: 'dances', 106: 'tank', 107: 'dances',
    35: 'scout', 36: 'dagger', 37: 'archer', 108: 'dagger', 109: 'archer',
    39: 'mage', 40: 'dark', 41: 'shadow', 110: 'dark', 111: 'shadow',
    42: 'healer', 43: 'healer', 112: 'healer',
    45: 'raider', 46: 'raider', 113: 'raider', 47: 'monk', 48: 'monk', 114: 'monk',
    50: 'shaman', 51: 'overlord', 52: 'shaman', 115: 'overlord', 116: 'shaman',
    54: 'spoiler', 55: 'spoiler', 117: 'spoiler', 56: 'crafter', 57: 'crafter', 118: 'crafter'
});

const DataCache = () => invoke('GameServer/DataCache');
const Transfer = () => invoke('GameServer/ClassTransfer');
const Quests = () => invoke('GameServer/Quest/QuestService');

const roleOf = (classId) => ROLES[CLASS_ROLE[classId]] || ROLES.start;
const iconOf = (classId) => `icon.skill${String(roleOf(classId).icon).padStart(4, '0')}`;

function nameOf(classId) {
    const templates = DataCache().classTemplates;
    const row = templates ? Progression.firstClassRow(templates, classId) : null;
    return row?.template?.class || Progression.getThirdClass(classId)?.name || `Class ${classId}`;
}

// The classes one step after classId: 1st or 2nd profession from the maps, the 3rd
// class from its parent.
function childrenOf(classId) {
    const id = Number(classId);
    const native = Progression.firstProfMap[id] || Progression.secondProfMap[id];
    if (native) return [...native];
    return Object.entries(Progression.thirdClasses)
        .filter(([, entry]) => entry.parentClassId === id).map(([child]) => Number(child));
}

// Every full path from the race's starting class to a 3rd class, as rows of class
// ids: [start, 1st, 2nd, 3rd]. A class without children (a dead end) ends its row.
function tree(classId) {
    const line = Progression.lineage(classId);
    if (!line.length) return [];
    const rows = [];
    const walk = (path) => {
        const children = childrenOf(path.at(-1));
        if (!children.length || path.length >= STEP_LEVELS.length) { rows.push(path); return; }
        for (const child of children) walk([...path, child]);
    };
    walk([line[0]]);
    return rows;
}

// What the tab can offer the actor now: the next classes, the level they need, and
// whether each one is open. Only eligibility() decides; the maps only list them.
function choices(actor) {
    const classId = Number(actor.fetchClassId());
    const level = Number(actor.fetchLevel());
    return childrenOf(classId).map((target) => {
        const check = Transfer().eligibility(actor, target);
        if (!check.ok) return null;
        return { classId: target, name: nameOf(target), requiredLevel: check.requiredLevel, ready: level >= check.requiredLevel };
    }).filter(Boolean);
}

// Board action "_bbssolo class <action> [classId]". Resolves the tab's state:
// { confirm, message }.
async function act(session, action = '', arg = '') {
    const actor = session.actor;
    if (!actor) return {};
    if (action !== 'pick' && action !== 'yes') return {};
    if (actor.isDead?.()) return { message: 'You cannot change class while dead.' };
    const target = Number(arg);
    const choice = String(target) === String(arg) ? choices(actor).find((entry) => entry.classId === target) : null;
    if (!choice) return { message: 'That class is not open to you.' };
    if (!choice.ready) return { message: `${choice.name} needs level ${choice.requiredLevel}.` };
    if (action === 'pick') return { confirm: choice.classId };

    // Same queue as the class quests (NpcBypasses/ChangeClass.js), so a quest hand-in
    // landing at the same moment cannot race this transfer.
    let result;
    try {
        result = await Quests().mutate(session, () => Transfer().transfer(session, choice.classId));
    } catch (error) {
        invoke('FailureLog')?.note?.('solo.class', error);
        return { message: 'The class change failed. Nothing was changed.' };
    }
    if (result?.ok) return { message: `You are now a ${choice.name}. Your new skills are learned.` };
    if (result?.reason === 'level') return { message: `${choice.name} needs level ${result.requiredLevel}.` };
    if (result?.reason === 'persistence') return { message: 'The class change could not be saved. You kept your class.' };
    return { message: 'That class is not open to you.' };
}

// ---------- board view ----------

const C = (command) => `_bbssolo class ${command}`;

function icon(classId, command) {
    const texture = iconOf(classId);
    if (!command) return `<img src="${texture}" width=${ICON} height=${ICON}>`;
    return `<button action="bypass ${C(command)}" width=${ICON} height=${ICON} back="${texture}" fore="${texture}">`;
}

function heading(label) {
    return `<br1><table width=${BOARD_WIDTH}><tr><td>${Html.font(label, Html.COLOR.title)}</td></tr></table>`
        + `<img src="L2UI.SquareGray" width=${BOARD_WIDTH} height=1><br1>`;
}

function status(actor, message) {
    const classId = Number(actor.fetchClassId());
    return `<table width=${BOARD_WIDTH} bgcolor=222222><tr>`
        + `<td width=6></td><td width=36 height=36>${icon(classId)}</td>`
        + `<td width=250>${Html.font(nameOf(classId), Html.COLOR.ok)}<br1>${Html.font(`Level ${actor.fetchLevel()} - ${roleOf(classId).label}`)}</td>`
        + `<td width=312 align=right>${message ? Html.font(message, Html.COLOR.link) : ''}</td><td width=6></td>`
        + '</tr></table>';
}

// The race's class tree, one row per final class. Green = your path, yellow = what
// you can take next, white = later on your path, grey = a path you left.
const COLUMNS = Object.freeze([136, 158, 158, 158]);

function treeTable(actor, next) {
    const classId = Number(actor.fetchClassId());
    const mine = Progression.lineage(classId);
    const nextIds = new Set(next.map((entry) => entry.classId));
    const readyIds = new Set(next.filter((entry) => entry.ready).map((entry) => entry.classId));
    const ahead = new Set();
    const collect = (id) => { for (const child of childrenOf(id)) { ahead.add(child); collect(child); } };
    collect(classId);
    const color = (id) => {
        if (mine.includes(id)) return Html.COLOR.ok;
        if (nextIds.has(id)) return Html.COLOR.title;
        return ahead.has(id) ? 'FFFFFF' : Html.COLOR.muted;
    };

    const header = COLUMNS.map((width, index) => `<td width=${width} height=20>${Html.font(index ? `Level ${STEP_LEVELS[index]}` : 'Start')}</td>`).join('');
    const seen = new Set();
    const rows = tree(classId).map((path) => {
        const cells = COLUMNS.map((width, index) => {
            const id = path[index];
            // A class shared by several rows shows once, on its first row.
            if (id === undefined || seen.has(id)) return `<td width=${width} height=38></td>`;
            seen.add(id);
            const pick = readyIds.has(id) ? `pick ${id}` : null;
            const name = pick ? `<a action="bypass ${C(pick)}">${Html.font(nameOf(id), color(id))}</a>` : Html.font(nameOf(id), color(id));
            return `<td width=${width} height=38><table><tr><td width=36>${icon(id, pick)}</td>`
                + `<td width=${width - 40}>${name}<br1>${Html.font(roleOf(id).label)}</td></tr></table></td>`;
        }).join('');
        return `<tr>${cells}</tr>`;
    }).join('');
    return `<table width=${BOARD_WIDTH}><tr>${header}</tr>${rows}</table>`;
}

function choiceCards(actor, next) {
    if (!next.length) {
        return `<table width=${BOARD_WIDTH}><tr><td width=6></td><td height=24>`
            + `${Html.font(`${nameOf(actor.fetchClassId())} is your last class in C4.`)}</td></tr></table>`;
    }
    const width = Math.floor(BOARD_WIDTH / Math.max(next.length, 2));
    const cells = next.map((entry) => {
        const action = entry.ready
            ? Html.button('Choose', C(`pick ${entry.classId}`), { width: Style.BUTTON_WIDTH, hide: false })
            : Html.font(`Needs level ${entry.requiredLevel}`, Html.COLOR.warn);
        const leads = childrenOf(entry.classId).map(nameOf);
        return `<td width=${width}><table width=${width - 4} bgcolor=222222><tr><td width=6></td>`
            + `<td width=38 height=44>${icon(entry.classId, entry.ready ? `pick ${entry.classId}` : null)}</td>`
            + `<td width=${width - 54}>${Html.font(entry.name, Html.COLOR.title)}<br1>${Html.font(roleOf(entry.classId).label)}`
            + (leads.length ? `<br1>${Html.font(`Then: ${leads.join(' or ')}`)}` : '')
            + `</td><td width=6></td></tr><tr><td></td><td></td><td height=26>${action}</td><td></td></tr></table></td>`;
    }).join('');
    return `<table width=${BOARD_WIDTH}><tr>${cells}</tr></table>`;
}

function confirmCard(choice) {
    const buttons = `<table><tr><td width=${Style.BUTTON_CELL}>${Html.button('Yes, change', C(`yes ${choice.classId}`), { width: Style.BUTTON_WIDTH, hide: false })}</td>`
        + `<td width=${Style.BUTTON_CELL}>${Html.button('Cancel', C(''), { width: Style.BUTTON_WIDTH, hide: false })}</td></tr></table>`;
    return `<table width=${BOARD_WIDTH} bgcolor=222222><tr><td width=6></td>`
        + `<td width=38 height=44>${icon(choice.classId)}</td>`
        + `<td width=${BOARD_WIDTH - 50}>${Html.font(`Become a ${choice.name}?`, Html.COLOR.title)}<br1>`
        + `${Html.font(`${roleOf(choice.classId).label}. You cannot change back.`)}</td><td width=6></td></tr>`
        + `<tr><td></td><td></td><td height=28>${buttons}</td><td></td></tr></table>`;
}

function stepLabel(next) {
    if (!next.length) return 'Your class';
    return `Choose your level ${next[0].requiredLevel} class`;
}

// The Class tab body; SoloHelper adds the window chrome and tabs.
function boardBody(session, state = {}) {
    const actor = session.actor;
    const next = choices(actor);
    const confirm = state.confirm !== undefined ? next.find((entry) => entry.classId === Number(state.confirm) && entry.ready) : null;
    return status(actor, state.message)
        + heading(confirm ? 'Confirm' : stepLabel(next)) + (confirm ? confirmCard(confirm) : choiceCards(actor, next))
        + heading('Class tree') + treeTable(actor, next);
}

module.exports = { STEP_LEVELS, ROLES, CLASS_ROLE, nameOf, roleOf, iconOf, childrenOf, tree, choices, act, boardBody };
