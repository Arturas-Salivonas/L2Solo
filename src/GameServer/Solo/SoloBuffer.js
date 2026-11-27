'use strict';

// Solo Buffer (fork-only, branch mine/solo-buffer): the Buffer tab of the Solo
// Helper (SoloHelper.js, Alt+B or ".buffer").
//
// The real player buffs themself, and their servitor, for free: one buff at a
// time, from a preset, or from a saved set. Every buff lasts [SoloHelper]
// buffMinutes (default 60). Two views share one set of actions (act): the
// full-width Community Board (boardBody) and the small chat window (chatHandle,
// [SoloHelper] window = chat).
//
// Skill ids and levels come only from the catalog below, never from the link
// the client sends back, so a crafted bypass cannot grant an arbitrary skill.

const fs = require('fs');
const nodePath = require('path');

const Html = require('../World/Generics/HtmlKit');
const { config } = require('./SoloConfig');
const skillTree = require('../../../data/Skills/Tree/tree.json');

const MAX_CHAT_HTML = 8192;
const MAX_TREE_LEVEL = 100; // enchanted skill levels (101+) are not C4 buffer levels
const Style = require('./BoardStyle');
const Servitor = require('./ServitorBuffs');
const BOARD_WIDTH = Style.WIDTH;
const BOARD_COLUMNS = 3;

// Buffer-class buffs from the C4 datapack, grouped the way players know them.
// Names and max levels are read from data at runtime. Groups stay at 19 or fewer
// so one board page fits the client's packet and row limits.
const GROUPS = Object.freeze([
    { id: 'prophet', label: 'Prophet', ids: [1204, 1086, 1068, 1040, 1077, 1242, 1240, 1062, 1268, 1045, 1048,
        1035, 1036, 1059, 1085, 1078, 1303, 1087, 1243] },
    { id: 'resist', label: 'Resists', ids: [1259, 1304, 1073, 1044, 1032, 1033, 1182, 1189, 1191, 1257] },
    // Each class line with its 3rd class: Doomcryer's Chant of Spirit (1362), Dominator buffs (1364, 1365).
    { id: 'chants', label: 'Chants', ids: [1007, 1009, 1006, 1002, 1251, 1252, 1253, 1284, 1308, 1309, 1310, 1362] },
    { id: 'paagrio', label: 'Overlord', ids: [1003, 1004, 1005, 1008, 1249, 1250, 1260, 1261, 1282, 1364, 1365] },
    { id: 'dances', label: 'Dances', ids: [271, 272, 273, 274, 275, 276, 277, 307, 309, 310, 365, 366] },
    { id: 'songs', label: 'Songs', ids: [264, 265, 266, 267, 268, 269, 270, 304, 305, 306, 308, 349, 363, 364] },
    // Other 3rd-class buffs (Chant of Victory 1363 among them) and the summoner servitors' buffs
    // (ServitorBuffs: Feline Queen, Unicorn Seraphim).
    { id: 'third', label: 'Special', ids: [1352, 1353, 1354, 1355, 1356, 1357, 1363, ...Servitor.IDS] }
]);

// Presets reuse the admin full-buff profiles (AdminFullBuff.PROFILES), so the
// two stay in step. icon is the skill whose icon stands for the preset on the board.
const PRESETS = Object.freeze([
    { id: 'tank', label: 'Tank', profile: 'tank', icon: 1243 },
    { id: 'fighter', label: 'Fighter', profile: 'melee', icon: 1068 },
    { id: 'mage', label: 'Mage', profile: 'mage', icon: 1085 },
    { id: 'support', label: 'Support', profile: 'support', icon: 1078 }
]);
const MY_SET_ICON = 1045;

const admin = () => invoke('GameServer/World/Generics/NpcBypasses/AdminFullBuff');
const response = () => invoke('GameServer/Network/Response');
const effects = () => invoke('GameServer/Effects/EffectStore');
const ticker = () => invoke('GameServer/Effects/EffectTicker');
const summonOf = (actor) => invoke('GameServer/Npc/SummonControl').activeSummon(actor);
// A servitor buff shows its summon skill's icon (ServitorBuffs.iconOf).
// The buff slots of an actor: EffectStore.limitFor (the buffSlots setting), or C4's 20 on a
// server where the Solo Helper was copied in without that EffectStore edit.
const slotsOf = (actor) => (typeof effects().limitFor === 'function' ? effects().limitFor(actor) : effects().BUFF_LIMIT);
const iconFor = (selfId) => `icon.skill${String(Math.max(0, Number(Servitor.iconOf(selfId) ?? selfId) || 0)).padStart(4, '0')}`;

// ---------- catalog ----------

let treeLevels = null;
// A skill's highest level across every class tree: a 1st-class buff such as Wind
// Walk is learned in the Cleric tree, not the Prophet one.
function maxLevel(selfId) {
    if (Servitor.has(selfId)) return Servitor.LEVEL;
    if (!treeLevels) {
        treeLevels = new Map();
        for (const cls of skillTree) {
            for (const skill of cls.skills || []) {
                for (const entry of skill.levels || []) {
                    const level = Number(entry.level) || 0;
                    if (level <= MAX_TREE_LEVEL && level > (treeLevels.get(skill.selfId) || 0)) treeLevels.set(skill.selfId, level);
                }
            }
        }
    }
    return treeLevels.get(selfId) || 1;
}

let catalogCache = null;
function catalog() {
    if (catalogCache) return catalogCache;
    const missing = [];
    const groups = GROUPS.map((group) => ({
        id: group.id,
        label: group.label,
        buffs: group.ids.map((selfId) => {
            const level = maxLevel(selfId);
            const skill = admin().skillData(selfId, level) || Servitor.skill(selfId);
            if (!skill) {
                missing.push(`${selfId}@${level}`);
                return null;
            }
            return { selfId, level, name: skill.name };
        }).filter(Boolean)
    }));
    if (missing.length) utils.infoWarn('SoloBuffer', 'skipped buffs missing from active skills: %s', missing.join(', '));
    const byId = new Map();
    for (const group of groups) for (const buff of group.buffs) byId.set(buff.selfId, { ...buff, group: group.id });
    catalogCache = { groups, byId };
    return catalogCache;
}

const groupById = (id) => catalog().groups.find((group) => group.id === id) || null;

function presetEntries(preset) {
    return { profile: preset.profile, entries: admin().PROFILES[preset.profile] || [] };
}

// ---------- saved sets ----------

function setsFile() {
    return nodePath.resolve(process.env.L2SOLO_BUFFER_SETS_FILE || 'tmp/solo/buff-sets.json');
}

function readSets() {
    try {
        const parsed = JSON.parse(fs.readFileSync(setsFile(), 'utf8'));
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function writeSets(sets) {
    const file = setsFile();
    fs.mkdirSync(nodePath.dirname(file), { recursive: true });
    const temp = `${file}.tmp`;
    fs.writeFileSync(temp, `${JSON.stringify(sets, null, 2)}\n`);
    fs.renameSync(temp, file);
}

const setKey = (actor) => String(actor?.fetchId?.() ?? '');

function savedSet(actor) {
    const entry = readSets()[setKey(actor)];
    // A world wipe can hand the same id to a new character; the name must match too.
    if (!entry || entry.name !== actor?.fetchName?.()) return null;
    return Array.isArray(entry.buffs) ? entry.buffs.filter(([selfId]) => catalog().byId.has(Number(selfId))) : null;
}

function saveSet(actor) {
    const buffs = currentBuffs(actor)
        .filter((effect) => catalog().byId.has(Number(effect.id)))
        .map((effect) => [Number(effect.id), catalog().byId.get(Number(effect.id)).level]);
    const sets = readSets();
    sets[setKey(actor)] = { name: actor.fetchName?.() || '', buffs, savedAt: new Date().toISOString() };
    writeSets(sets);
    return buffs.length;
}

// ---------- buffing ----------

function currentBuffs(actor) {
    const store = effects();
    return store.list(actor, { includeDebuffs: false }).filter((effect) => store.includedInBuffCount(effect));
}

function applyEntries(session, target, entries, options = {}) {
    if (!target || !entries?.length) return [];
    const expiresAt = Number(options.expiresAt) || Date.now() + config().buffMinutes * 60000;
    if (!target.activeBuffs) target.activeBuffs = {};
    const applied = [];
    for (const [selfId, level] of entries) {
        const servitor = Servitor.has(selfId);
        const skill = servitor ? Servitor.skill(selfId) : admin().skillData(selfId, level);
        if (!skill) continue;
        const effect = effects().apply(target, servitor ? Servitor.effect(selfId, expiresAt) : admin().effectFromSkill(skill, expiresAt));
        if (!effect) continue;
        target.activeBuffs[effect.key] = expiresAt;
        if (options.scheduleExpiry !== false) ticker().scheduleExpiry(session, target, effect);
        applied.push(effect);
    }
    return applied;
}

// Same refresh as AdminFullBuff, which keeps its own private.
function refreshActor(session, actor) {
    invoke(path.actor).calculateStats(session, actor);
    actor.statusUpdateVitals(actor);
    session.dataSendToMe(response().userInfo(actor));
    session.dataSendToMe(response().abnormalStatusUpdate.fromActor(actor));
    session.dataSendToMe(response().shortBuffStatusUpdate.fromActor(actor));
    try {
        invoke('GameServer/Bot/AI/PartyCompanionService').updateActorEffects(session);
    } catch (err) {
        utils.infoWarn('SoloBuffer', 'party effect refresh failed: %s', err.message);
    }
}

// Client refreshes after a change. Tests swap these for spies: they need a live client actor.
const hooks = {
    refresh: refreshActor,
    vitals: (session, actor) => actor.statusUpdateVitals(actor),
    refreshSummon: (session, summon) => admin().refreshSummon(session, summon)
};

function buffSelf(session, entries) {
    const applied = applyEntries(session, session.actor, entries);
    if (applied.length) hooks.refresh(session, session.actor);
    return applied;
}

function clearBuffs(session, actor) {
    const removed = currentBuffs(actor);
    for (const effect of removed) {
        effects().remove(actor, effect.key);
        ticker().clear(actor, effect.key);
        if (actor.activeBuffs) delete actor.activeBuffs[effect.key];
    }
    if (removed.length) hooks.refresh(session, actor);
    return removed.length;
}

// One buff off, by its skill id.
function removeBuff(session, actor, selfId) {
    const effect = currentBuffs(actor).find((entry) => Number(entry.id) === Number(selfId));
    if (!effect) return false;
    effects().remove(actor, effect.key);
    ticker().clear(actor, effect.key);
    if (actor.activeBuffs) delete actor.activeBuffs[effect.key];
    hooks.refresh(session, actor);
    return true;
}

// Full HP, MP and CP for the player, and HP and MP for a live servitor.
function restore(session, actor) {
    actor.fillupVitals();
    hooks.vitals(session, actor);
    const summon = summonOf(actor);
    if (!summon || summon.isDead?.()) return false;
    summon.fillupVitals?.();
    hooks.refreshSummon(session, summon);
    return true;
}

// ---------- actions (shared by both views) ----------

// Runs one action and returns what the page shows next: { group, message }.
// group is set when the action belongs to a group page; message is one status line.
function act(session, action = '', arg = '') {
    const actor = session.actor;
    const deadReason = () => (actor.isDead?.() ? 'You cannot be buffed while dead.' : '');
    switch (String(action || '')) {
        case 'group':
            return { group: groupById(arg) ? arg : undefined };
        case 'one': {
            const buff = catalog().byId.get(Number(arg));
            if (!buff || String(Number(arg)) !== String(arg)) return {};
            const reason = deadReason();
            if (reason) return { group: buff.group, message: reason };
            const applied = buffSelf(session, [[buff.selfId, buff.level]]);
            return { group: buff.group, message: applied.length ? `${buff.name} ${buff.level} on.` : `${buff.name} did not take.` };
        }
        case 'preset': {
            const preset = PRESETS.find((entry) => entry.id === arg);
            if (!preset) return {};
            const reason = deadReason();
            if (reason) return { message: reason };
            const applied = buffSelf(session, presetEntries(preset).entries);
            return { message: `${preset.label} preset: ${applied.length} buffs on.` };
        }
        case 'mine': {
            const entries = savedSet(actor);
            if (!entries?.length) return { message: 'No saved set yet. Buff up, then save it.' };
            const reason = deadReason();
            if (reason) return { message: reason };
            return { message: `My set: ${buffSelf(session, entries).length} buffs on.` };
        }
        case 'save': {
            const count = saveSet(actor);
            return { message: count ? `Saved ${count} buffs as My set.` : 'You have no buffs from this window to save.' };
        }
        case 'pet': {
            const summon = summonOf(actor);
            if (!summon) return { message: 'You have no servitor out.' };
            const applied = applyEntries(session, summon, admin().PROFILES.servitor);
            if (applied.length) hooks.refreshSummon(session, summon);
            return { message: `Servitor: ${applied.length} buffs on.` };
        }
        case 'restore': {
            if (actor.isDead?.()) return { message: 'You cannot be healed while dead.' };
            return { message: restore(session, actor) ? 'HP, MP and CP full, your servitor too.' : 'HP, MP and CP full.' };
        }
        case 'clear':
            return { message: `Removed ${clearBuffs(session, actor)} buffs.` };
        default:
            return {};
    }
}

// ---------- board view (full width) ----------

const B = (command) => `_bbssolo buff ${command}`;

function iconButton(selfId, command, size = 32) {
    const icon = iconFor(selfId);
    return `<button action="bypass ${B(command)}" width=${size} height=${size} back="${icon}" fore="${icon}">`;
}

function minutesLeft(effect) {
    const ms = Number(effect?.expiresAt || 0) - Date.now();
    return ms > 0 ? `${Math.max(1, Math.ceil(ms / 60000))} min` : '';
}

function boardStatus(actor, message) {
    const used = currentBuffs(actor).length;
    const limit = slotsOf(actor);
    const count = Html.font(`${used}/${limit}`, used >= limit ? Html.COLOR.warn : Html.COLOR.ok);
    const note = used >= limit ? 'full - a new buff replaces your oldest' : `${config().buffMinutes} min each`;
    return `<table width=${BOARD_WIDTH} bgcolor=222222><tr>`
        + `<td width=6></td><td width=250 height=24>Buffs ${count} ${Html.font(note)}</td>`
        + `<td width=348 align=right>${message ? Html.font(message, Html.COLOR.link) : ''}</td><td width=6></td>`
        + '</tr></table>';
}

function heading(label) {
    return `<br1><table width=${BOARD_WIDTH}><tr><td>${Html.font(label, Html.COLOR.title)}</td></tr></table>`
        + `<img src="L2UI.SquareGray" width=${BOARD_WIDTH} height=1><br1>`;
}

function presetTiles() {
    const tiles = [
        ...PRESETS.map((preset) => [preset.icon, `preset ${preset.id}`, preset.label]),
        [MY_SET_ICON, 'mine', 'My set']
    ];
    const width = Math.floor(BOARD_WIDTH / tiles.length);
    const cells = tiles.map(([icon, command, label]) => `<td width=${width} align=center>${iconButton(icon, command)}<br1>${label}</td>`).join('');
    return `<table width=${BOARD_WIDTH}><tr>${cells}</tr></table>`;
}

function groupTabs(activeId) {
    const width = Math.floor(BOARD_WIDTH / GROUPS.length);
    const cells = catalog().groups.map((group) => {
        const pressed = group.id === activeId;
        const fore = pressed ? Html.TEXTURE.defaultButtonDown : Html.TEXTURE.defaultButton;
        return `<td width=${width} align=center><button value="${group.label}" action="bypass ${B(`group ${group.id}`)}" width=${Style.BUTTON_WIDTH} height=21 back="${Html.TEXTURE.defaultButtonDown}" fore="${fore}"></td>`;
    }).join('');
    return `<table width=${BOARD_WIDTH}><tr>${cells}</tr></table><br1>`;
}

function buffGrid(group, active) {
    const cellWidth = Math.floor(BOARD_WIDTH / BOARD_COLUMNS);
    const rows = [];
    for (let i = 0; i < group.buffs.length; i += BOARD_COLUMNS) {
        const cells = group.buffs.slice(i, i + BOARD_COLUMNS).map((buff) => {
            const effect = active.get(buff.selfId);
            const name = effect ? Html.font(buff.name, Html.COLOR.ok) : Html.esc(buff.name);
            const detail = Html.font(`Lv ${buff.level}`) + (effect ? ` ${Html.font(minutesLeft(effect), Html.COLOR.ok)}` : '');
            return `<td width=38 height=38>${iconButton(buff.selfId, `one ${buff.selfId}`)}</td>`
                + `<td width=${cellWidth - 38}><a action="bypass ${B(`one ${buff.selfId}`)}">${name}</a><br1>${detail}</td>`;
        });
        while (cells.length < BOARD_COLUMNS) cells.push(`<td width=38></td><td width=${cellWidth - 38}></td>`);
        rows.push(`<tr>${cells.join('')}</tr>`);
    }
    return `<table width=${BOARD_WIDTH}>${rows.join('')}</table>`;
}

function boardFooter(session) {
    const buttons = [['Full HP/MP/CP', 'restore'], ['Save my set', 'save'], ['Clear buffs', 'clear']];
    if (summonOf(session.actor)) buttons.splice(2, 0, ['Buff servitor', 'pet']);
    const cell = Style.BUTTON_CELL + 8;
    const cells = buttons.map(([label, command]) => `<td width=${cell} align=center>${Html.button(label, B(command), { width: Style.BUTTON_WIDTH, hide: false })}</td>`).join('');
    return `<br1><img src="L2UI.SquareGray" width=${BOARD_WIDTH} height=1><br1><table width=${buttons.length * cell}><tr>${cells}</tr></table>`;
}

// The Buffer tab body; SoloHelper adds the window chrome and tabs.
function boardBody(session, state = {}) {
    const group = groupById(state.group) || groupById(session.soloBuffGroup) || catalog().groups[0];
    session.soloBuffGroup = group.id;
    const active = new Map(currentBuffs(session.actor).map((effect) => [Number(effect.id), effect]));
    return boardStatus(session.actor, state.message)
        + heading('Presets') + presetTiles()
        + heading('Pick any buff') + groupTabs(group.id) + buffGrid(group, active)
        + boardFooter(session);
}

// ---------- chat view (270 px NPC window, [SoloHelper] window = chat) ----------

function chatSlots(actor) {
    const used = currentBuffs(actor).length;
    const limit = slotsOf(actor);
    return Html.font(`Buffs ${used}/${limit}`, used >= limit ? Html.COLOR.warn : Html.COLOR.ok)
        + Html.font(used >= limit ? ' - a new buff replaces your oldest' : ` - each lasts ${config().buffMinutes} min`);
}

function chatHeader(actor, message) {
    return Html.font('Solo Buffer', Html.COLOR.title) + '<br1>' + chatSlots(actor) + '<br1>'
        + (message ? Html.font(message, Html.COLOR.link) + '<br1>' : '') + Html.line('L2UI.SquareGray');
}

function chatButtons(items, perRow = 3) {
    const rows = [];
    for (let i = 0; i < items.length; i += perRow) {
        rows.push(Html.row(items.slice(i, i + perRow).map(([label, command]) => Html.cell(Html.button(label, command), { align: 'center' }))));
    }
    return Html.table(rows);
}

function chatLinks(items, perRow = 2) {
    const width = Math.floor(Html.WIDTH / perRow);
    const rows = [];
    for (let i = 0; i < items.length; i += perRow) {
        rows.push(Html.row(items.slice(i, i + perRow).map((item) => Html.cell(item, { width, align: 'left' }))));
    }
    return Html.table(rows);
}

function chatPage(body, actions) {
    const html = Html.page(Html.table([Html.row([Html.cell(body, { width: Html.WIDTH, align: 'left' })])]),
        { footer: Html.actionFooter(actions) });
    if (html.length > MAX_CHAT_HTML) throw new Error(`solo buffer page is ${html.length} chars, over ${MAX_CHAT_HTML}`);
    return html;
}

function homePage(session, message = '') {
    const presets = PRESETS.map((preset) => [preset.label, `solo-buffer preset ${preset.id}`]);
    presets.push(['My set', 'solo-buffer mine']);
    let body = chatHeader(session.actor, message)
        + Html.font('Presets', Html.COLOR.title) + '<br1>' + chatButtons(presets)
        + Html.link('Save my current buffs as My set', 'solo-buffer save') + '<br1>'
        + Html.link('Full HP, MP and CP', 'solo-buffer restore') + '<br1>';
    if (summonOf(session.actor)) body += Html.link('Buff my servitor', 'solo-buffer pet') + '<br1>';
    body += Html.line('L2UI.SquareGray') + Html.font('Pick buffs one by one', Html.COLOR.title) + '<br1>'
        + chatLinks(catalog().groups.map((group) => Html.link(`${group.label} (${group.buffs.length})`, `solo-buffer group ${group.id}`)));
    return chatPage(body, [
        { label: 'Clear my buffs', command: 'solo-buffer clear' },
        { label: 'Market Board', command: 'solo-buffer market' }
    ]);
}

function groupPage(session, groupId, message = '') {
    const group = groupById(groupId);
    if (!group) return homePage(session, message);
    const active = new Set(currentBuffs(session.actor).map((effect) => Number(effect.id)));
    const links = group.buffs.map((buff) => Html.link(`${buff.name} ${buff.level}`, `solo-buffer one ${buff.selfId}`,
        { color: active.has(buff.selfId) ? Html.COLOR.ok : Html.COLOR.link }));
    const body = chatHeader(session.actor, message) + Html.font(group.label, Html.COLOR.title)
        + Html.font('  green = active', Html.COLOR.muted) + '<br1>' + chatLinks(links);
    return chatPage(body, [
        { label: 'Back', command: 'solo-buffer' },
        { label: 'Clear my buffs', command: 'solo-buffer clear' }
    ]);
}

// Bypass "solo-buffer <action> [arg]" (NpcBypasses/SoloBuffer.js): the chat view.
function chatHandle(session, args = []) {
    if (!session?.actor || !config().enabled) return null;
    const [action = '', arg = ''] = args.map((value) => String(value || '').toLowerCase());
    if (action === 'market') return invoke('GameServer/AfkTrade/PlayerBoardWindow').open(session);
    const state = act(session, action, arg);
    const html = state.group && action !== 'preset' ? groupPage(session, state.group, state.message)
        : homePage(session, state.message);
    session.dataSendToMe(response().npcHtml(session.actor.fetchId(), html));
    return html;
}

module.exports = {
    GROUPS,
    PRESETS,
    BOARD_WIDTH,
    iconFor,
    maxLevel,
    catalog,
    presetEntries,
    currentBuffs,
    applyEntries,
    clearBuffs,
    removeBuff,
    restore,
    savedSet,
    saveSet,
    act,
    boardBody,
    homePage,
    groupPage,
    chatHandle,
    hooks
};
