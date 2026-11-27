'use strict';

// Solo helper buffer (fork-only, branch mine/solo-buffer).
//
// Alt+B or ".buffer" opens it. The real player buffs themself, and their
// servitor, for free: one buff at a time, from a preset, or from a saved set.
// Every buff lasts [SoloHelper] buffMinutes (default 60). Upstream's Market
// Board, which Alt+B used to open, is one click away on the same page.
//
// Skill ids and levels come only from the catalog below, never from the link
// the client sends back, so a crafted bypass cannot grant an arbitrary skill.

const fs = require('fs');
const nodePath = require('path');

const Html = require('../World/Generics/HtmlKit');
const skillTree = require('../../../data/Skills/Tree/tree.json');

const DEFAULTS = Object.freeze({ enabled: true, altB: true, buffMinutes: 60 });
const MAX_HTML = 8192;
const MAX_TREE_LEVEL = 100; // enchanted skill levels (101+) are not C4 buffer levels

// Buffer-class buffs from the C4 datapack, grouped the way C4 buffers are known.
// Names and max levels are read from data at runtime.
const GROUPS = Object.freeze([
    { id: 'prophet', label: 'Prophet and Elders', ids: [1204, 1086, 1068, 1040, 1077, 1242, 1240, 1062, 1268, 1045, 1048,
        1035, 1036, 1059, 1085, 1078, 1303, 1087, 1243, 1259, 1304, 1073, 1044, 1032, 1033, 1182, 1189, 1191, 1257] },
    { id: 'chants', label: 'Warcryer chants', ids: [1007, 1009, 1006, 1002, 1251, 1252, 1253, 1284, 1308, 1309, 1310] },
    { id: 'paagrio', label: 'Overlord', ids: [1003, 1004, 1005, 1008, 1249, 1250, 1260, 1261, 1282] },
    { id: 'dances', label: 'Dances', ids: [271, 272, 273, 274, 275, 276, 277, 307, 309, 310, 365, 366] },
    { id: 'songs', label: 'Songs', ids: [264, 265, 266, 267, 268, 269, 270, 304, 305, 306, 308, 349, 363, 364] },
    { id: 'third', label: '3rd class', ids: [1352, 1353, 1354, 1355, 1356, 1357, 1362, 1363, 1364, 1365] }
]);

// Presets reuse the admin full-buff profiles (AdminFullBuff.PROFILES), so the
// two stay in step. 'auto' picks the profile for the player's class.
const PRESETS = Object.freeze([
    { id: 'tank', label: 'Tank', profile: 'tank' },
    { id: 'fighter', label: 'Fighter', profile: 'melee' },
    { id: 'mage', label: 'Mage', profile: 'mage' },
    { id: 'support', label: 'Support', profile: 'support' },
    { id: 'auto', label: 'My class', profile: null }
]);

const admin = () => invoke('GameServer/World/Generics/NpcBypasses/AdminFullBuff');
const response = () => invoke('GameServer/Network/Response');
const effects = () => invoke('GameServer/Effects/EffectStore');
const ticker = () => invoke('GameServer/Effects/EffectTicker');

// ---------- config ----------

function flag(value, fallback) {
    if (value === undefined || value === null || value === '') return fallback;
    return !/^(false|0|no|off)$/i.test(String(value).trim());
}

function config() {
    const raw = global.options?.default?.SoloHelper || {};
    const minutes = Math.floor(Number(raw.buffMinutes));
    return {
        enabled: flag(raw.enabled, DEFAULTS.enabled),
        altB: flag(raw.altB, DEFAULTS.altB),
        buffMinutes: Number.isFinite(minutes) && minutes >= 1 ? Math.min(minutes, 24 * 60) : DEFAULTS.buffMinutes
    };
}

// ---------- catalog ----------

let treeLevels = null;
// A skill's highest level across every class tree: a 1st-class buff such as Wind
// Walk is learned in the Cleric tree, not the Prophet one.
function maxLevel(selfId) {
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
            const skill = admin().skillData(selfId, level);
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

function presetEntries(preset, actor) {
    const profile = preset.profile || admin().profileForActor(actor);
    return { profile, entries: admin().PROFILES[profile] || [] };
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

function setKey(actor) {
    return String(actor?.fetchId?.() ?? '');
}

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
        const skill = admin().skillData(selfId, level);
        if (!skill) continue;
        const effect = effects().apply(target, admin().effectFromSkill(skill, expiresAt));
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

// ---------- pages ----------

function slotsText(actor) {
    const used = currentBuffs(actor).length;
    const limit = effects().BUFF_LIMIT;
    return Html.font(`Buffs ${used}/${limit}`, used >= limit ? Html.COLOR.warn : Html.COLOR.ok)
        + Html.font(used >= limit ? ' - a new buff replaces your oldest' : ` - each lasts ${config().buffMinutes} min`);
}

function header(actor, message) {
    return Html.font('Solo Buffer', Html.COLOR.title) + '<br1>' + slotsText(actor) + '<br1>'
        + (message ? Html.font(message, Html.COLOR.link) + '<br1>' : '') + Html.line('L2UI.SquareGray');
}

function buttonGrid(items, perRow = 3) {
    const rows = [];
    for (let i = 0; i < items.length; i += perRow) {
        rows.push(Html.row(items.slice(i, i + perRow).map(([label, command]) => Html.cell(Html.button(label, command), { align: 'center' }))));
    }
    return Html.table(rows);
}

function linkGrid(items, perRow = 2) {
    const width = Math.floor(Html.WIDTH / perRow);
    const rows = [];
    for (let i = 0; i < items.length; i += perRow) {
        rows.push(Html.row(items.slice(i, i + perRow).map((item) => Html.cell(item, { width, align: 'left' }))));
    }
    return Html.table(rows);
}

function homePage(session, message = '') {
    const actor = session.actor;
    const summon = invoke('GameServer/Npc/SummonControl').activeSummon(actor);
    const presets = PRESETS.map((preset) => [preset.label, `solo-buffer preset ${preset.id}`]);
    presets.push(['My set', 'solo-buffer mine']);
    let body = header(actor, message)
        + Html.font('Presets', Html.COLOR.title) + '<br1>' + buttonGrid(presets)
        + Html.link('Save my current buffs as My set', 'solo-buffer save') + '<br1>';
    if (summon) body += Html.link('Buff my servitor', 'solo-buffer pet') + '<br1>';
    body += Html.line('L2UI.SquareGray') + Html.font('Pick buffs one by one', Html.COLOR.title) + '<br1>'
        + linkGrid(catalog().groups.map((group) => Html.link(`${group.label} (${group.buffs.length})`, `solo-buffer group ${group.id}`)));
    return page(body, [
        { label: 'Clear my buffs', command: 'solo-buffer clear' },
        { label: 'Market Board', command: 'solo-buffer market' }
    ]);
}

function groupPage(session, groupId, message = '') {
    const group = catalog().groups.find((entry) => entry.id === groupId);
    if (!group) return homePage(session, message);
    const active = new Set(currentBuffs(session.actor).map((effect) => Number(effect.id)));
    const links = group.buffs.map((buff) => Html.link(`${buff.name} ${buff.level}`, `solo-buffer one ${buff.selfId}`,
        { color: active.has(buff.selfId) ? Html.COLOR.ok : Html.COLOR.link }));
    const body = header(session.actor, message) + Html.font(group.label, Html.COLOR.title)
        + Html.font('  green = active', Html.COLOR.muted) + '<br1>' + linkGrid(links);
    return page(body, [
        { label: 'Back', command: 'solo-buffer' },
        { label: 'Clear my buffs', command: 'solo-buffer clear' }
    ]);
}

function page(body, actions) {
    const html = Html.page(Html.table([Html.row([Html.cell(body, { width: Html.WIDTH, align: 'left' })])]),
        { footer: Html.actionFooter(actions) });
    if (html.length > MAX_HTML) throw new Error(`solo buffer page is ${html.length} chars, over ${MAX_HTML}`);
    return html;
}

function send(session, html) {
    session.dataSendToMe(response().npcHtml(session.actor.fetchId(), html));
    return html;
}

function show(session, message = '') {
    if (!session?.actor) return null;
    return send(session, homePage(session, message));
}

// ---------- entry points ----------

// Bypass "solo-buffer <action> [arg]" (NpcBypasses/SoloBuffer.js).
function handle(session, args = []) {
    const actor = session?.actor;
    if (!actor) return null;
    if (!config().enabled) return null;
    const [action = 'home', arg = ''] = args.map((value) => String(value || '').toLowerCase());
    const blocked = () => (actor.isDead?.() ? 'You cannot be buffed while dead.' : '');

    switch (action) {
        case 'home':
            return show(session);
        case 'group':
            return send(session, groupPage(session, arg));
        case 'one': {
            const buff = catalog().byId.get(Number(arg));
            if (!buff || String(Number(arg)) !== arg) return show(session);
            const reason = blocked();
            if (reason) return send(session, groupPage(session, buff.group, reason));
            const applied = buffSelf(session, [[buff.selfId, buff.level]]);
            return send(session, groupPage(session, buff.group, applied.length ? `${buff.name} ${buff.level} on.` : `${buff.name} did not take.`));
        }
        case 'preset': {
            const preset = PRESETS.find((entry) => entry.id === arg);
            if (!preset) return show(session);
            const reason = blocked();
            if (reason) return show(session, reason);
            const { profile, entries } = presetEntries(preset, actor);
            const applied = buffSelf(session, entries);
            return show(session, `${preset.label} preset${preset.profile ? '' : ` (${profile})`}: ${applied.length} buffs on.`);
        }
        case 'mine': {
            const entries = savedSet(actor);
            if (!entries?.length) return show(session, 'No saved set yet. Buff up, then save it.');
            const reason = blocked();
            if (reason) return show(session, reason);
            return show(session, `My set: ${buffSelf(session, entries).length} buffs on.`);
        }
        case 'save': {
            const count = saveSet(actor);
            return show(session, count ? `Saved ${count} buffs as My set.` : 'You have no buffs from this window to save.');
        }
        case 'pet': {
            const summon = invoke('GameServer/Npc/SummonControl').activeSummon(actor);
            if (!summon) return show(session, 'You have no servitor out.');
            const applied = applyEntries(session, summon, admin().PROFILES.servitor);
            if (applied.length) hooks.refreshSummon(session, summon);
            return show(session, `Servitor: ${applied.length} buffs on.`);
        }
        case 'clear':
            return show(session, `Removed ${clearBuffs(session, actor)} buffs.`);
        case 'market':
            return invoke('GameServer/AfkTrade/PlayerBoardWindow').open(session);
        default:
            return show(session);
    }
}

// Alt+B (RequestShowBoard). Without the helper it is upstream's Market Board.
function openBoard(session) {
    const settings = config();
    if (settings.enabled && settings.altB && session?.actor) return show(session);
    return invoke('GameServer/AfkTrade/PlayerBoardWindow').open(session);
}

// Local chat ".buffer" (Speak.dispatchLocalCommand).
function command(session, text) {
    const line = String(text || '').trim().toLowerCase();
    if (line !== '.buffer' || !config().enabled || !session?.actor) return false;
    show(session);
    return true;
}

module.exports = {
    GROUPS,
    PRESETS,
    config,
    maxLevel,
    catalog,
    presetEntries,
    applyEntries,
    clearBuffs,
    homePage,
    groupPage,
    handle,
    openBoard,
    command,
    savedSet,
    saveSet,
    hooks
};
