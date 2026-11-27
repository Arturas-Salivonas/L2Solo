'use strict';

// The Last Hero window, two sizes:
//   boardBody(session, state)  the 610-wide Community Board body. The Solo Helper (Alt+B,
//                              branch mine/solo-buffer) shows it as its Last Hero tab.
//   chat(session, args)        the small chat window: ".lasthero" in chat, bypass "last-hero <action>".
// Both run the same actions (LastHero.act): join, leave, start, home.

const Html = require('../../World/Generics/HtmlKit');
const LastHero = require('./LastHero');

const WIDTH = 610;
const BUTTON_WIDTH = 83; // the C4 client draws L2UI_ch3.Btn1 at this size (Solo/BoardStyle.js)
const BUTTON_CELL = 92;
const EVENT_ICON = 'icon.skill0121';
const ADENA_ICON = 'icon.etc_adena_i00';

const Response = () => invoke('GameServer/Network/Response');

function className(classId) {
    const DataCache = invoke('GameServer/DataCache');
    const row = DataCache.classTemplates ? invoke('GameServer/ClassProgression').firstClassRow(DataCache.classTemplates, classId) : null;
    return row?.template?.class || 'Fighter';
}

// 10000000 -> "10kk", 1500000 -> "1.5kk", 250000 -> "250k"
function short(amount) {
    const value = Number(amount || 0);
    if (value >= 1e6) return `${Number((value / 1e6).toFixed(1))}kk`;
    if (value >= 1e3) return `${Number((value / 1e3).toFixed(1))}k`;
    return String(value);
}

function ago(at) {
    const minutes = Math.max(0, Math.floor((Date.now() - Number(at || 0)) / 60000));
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    return hours < 48 ? `${hours} h ago` : `${Math.floor(hours / 24)} days ago`;
}

// What you can do now, as [label, action] pairs.
function actions(view) {
    const out = [];
    if (view.phase === 'off') return out;
    if (view.mine && !view.mine.alive && !view.mine.returned) out.push(['Return now', 'home']);
    if (view.phase === 'registration') out.push(view.registered ? ['Leave queue', 'leave'] : ['Join', 'join']);
    if (view.phase === 'idle' || view.phase === 'registration') out.push(['Start now', 'start']);
    return out;
}

function yourLine(view) {
    if (view.mine?.alive) return 'You are fighting.';
    if (view.mine) return `You are out: #${view.mine.place}, ${view.mine.kills} kills.`;
    if (view.registered) return `You are registered (${view.registeredCount}).`;
    return '';
}

// ---------- board ----------

const B = (action) => `_bbssolo hero ${action}`;

function heading(label) {
    return `<br1><table width=${WIDTH}><tr><td>${Html.font(label, Html.COLOR.title)}</td></tr></table>`
        + `<img src="L2UI.SquareGray" width=${WIDTH} height=1><br1>`;
}

function statusBar(view, message) {
    return `<table width=${WIDTH} bgcolor=222222><tr>`
        + `<td width=6></td><td width=36 height=36><img src="${EVENT_ICON}" width=32 height=32></td>`
        + `<td width=300>${Html.font('Last Hero', Html.COLOR.title)}<br1>${Html.esc(view.text)}</td>`
        + `<td width=262 align=right>${message ? Html.font(message, Html.COLOR.link) : Html.font(yourLine(view), Html.COLOR.ok)}</td><td width=6></td>`
        + '</tr></table>';
}

function tiles(view) {
    const s = view.settings;
    const list = [
        ['icon.skill0121', `${s.fighters} fighters`, 'everyone for themselves'],
        ['icon.skill1204', `${s.prepareSeconds} seconds`, 'to buff on the floor'],
        [ADENA_ICON, `${short(s.prize)} Adena`, 'and the Hero aura'],
        ['icon.skill1016', 'No penalty', 'you go back after']
    ];
    const width = Math.floor(WIDTH / list.length);
    const cells = list.map(([icon, value, label]) => `<td width=${width}><table><tr>`
        + `<td width=36 height=36><img src="${icon}" width=32 height=32></td>`
        + `<td width=${width - 40}>${Html.font(value, 'FFFFFF')}<br1>${Html.font(label)}</td></tr></table></td>`).join('');
    return `<table width=${WIDTH}><tr>${cells}</tr></table>`;
}

function buttonRow(view) {
    const list = actions(view);
    if (!list.length) return '';
    const cells = list.map(([label, action]) => `<td width=${BUTTON_CELL} align=center>`
        + `${Html.button(label, B(action), { width: BUTTON_WIDTH, hide: false })}</td>`).join('');
    return `<br1><table width=${list.length * BUTTON_CELL}><tr>${cells}</tr></table>`;
}

function heroCard(view) {
    const hero = view.hero;
    const body = hero
        ? `${Html.font(hero.name, Html.COLOR.ok)}<br1>${Html.font(`Lv ${hero.level} ${className(hero.classId)} - won ${ago(hero.at)}, glows until the next winner`)}`
        : Html.font('No Last Hero yet. Win one and you glow.');
    return `<table width=${WIDTH} bgcolor=222222><tr><td width=6></td>`
        + `<td width=36 height=36><img src="${EVENT_ICON}" width=32 height=32></td><td width=562>${body}</td><td width=6></td></tr></table>`;
}

function historyTable(view) {
    const rows = (view.history || []).slice(0, 5).map((entry) => {
        const winner = entry.winner ? `${Html.esc(entry.winner.name)} ${Html.font(`Lv ${entry.winner.level} ${className(entry.winner.classId)}`)}` : Html.font('no winner');
        const you = entry.you ? Html.font(entry.you.place === 1 ? 'You won!' : `You: #${entry.you.place}, ${entry.you.kills} kills`, entry.you.place === 1 ? Html.COLOR.ok : Html.COLOR.muted)
            : Html.font(entry.mode === 'simulated' ? 'You did not join' : '');
        return `<tr><td width=110 height=20>${Html.font(ago(entry.at))}</td><td width=300>${winner}</td><td width=200>${you}</td></tr>`;
    }).join('');
    return rows ? `<table width=${WIDTH}>${rows}</table>` : `<table width=${WIDTH}><tr><td height=20>${Html.font('No events yet.')}</td></tr></table>`;
}

function boardBody(session, state = {}) {
    const view = LastHero.status(session);
    return statusBar(view, state.message) + buttonRow(view)
        + heading('How it works') + tiles(view)
        + heading('The Hero') + heroCard(view)
        + heading('Last results') + historyTable(view);
}

// Board action: resolves { message } for boardBody.
async function act(session, action = '') {
    return { message: LastHero.act(session, action) };
}

// ---------- chat window (270 px) ----------

function chatPage(session, message = '') {
    const view = LastHero.status(session);
    const links = actions(view).map(([label, action]) => Html.link(label, `last-hero ${action}`)).join('<br1>');
    const hero = view.hero ? `${Html.font('Hero: ', Html.COLOR.title)}${Html.esc(view.hero.name)} ${Html.font(`Lv ${view.hero.level} ${className(view.hero.classId)}`)}` : Html.font('No Last Hero yet.');
    const results = (view.history || []).slice(0, 3).map((entry) => `${Html.font(ago(entry.at))} ${Html.esc(entry.winner?.name || 'no winner')}`
        + (entry.you ? Html.font(` (you #${entry.you.place})`) : '')).join('<br1>');
    const s = view.settings;
    const body = `${Html.font('Last Hero', Html.COLOR.title)}<br1>${Html.esc(view.text)}<br1>`
        + (yourLine(view) ? `${Html.font(yourLine(view), Html.COLOR.ok)}<br1>` : '')
        + (message ? `${Html.font(message, Html.COLOR.link)}<br1>` : '')
        + Html.line('L2UI.SquareGray')
        + (links ? `${links}<br1>${Html.line('L2UI.SquareGray')}` : '')
        + Html.font(`${s.fighters} fighters, everyone for themselves, no parties. ${s.prepareSeconds} s to buff. `
            + `The last one standing wins ${short(s.prize)} Adena and the Hero aura. No death penalty.`) + '<br1>'
        + Html.line('L2UI.SquareGray') + hero + (results ? `<br1>${results}` : '');
    return `<html><body>${body}</body></html>`;
}

// ".lasthero" and bypass "last-hero <action>".
function chat(session, args = []) {
    if (!session?.actor) return null;
    const message = LastHero.act(session, String(args[0] || '').toLowerCase());
    const html = chatPage(session, message);
    session.dataSendToMe(Response().npcHtml(session.actor.fetchId(), html));
    return html;
}

// Local chat ".lasthero" (Request/Speak.js dispatchLocalCommand).
function command(session, text) {
    if (String(text || '').trim().toLowerCase() !== '.lasthero' || !session?.actor) return false;
    chat(session, []);
    return true;
}

module.exports = { WIDTH, boardBody, act, chat, chatPage, command, actions, short };
