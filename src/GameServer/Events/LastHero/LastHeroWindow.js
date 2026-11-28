'use strict';

// The Last Hero window, two sizes:
//   boardBody(session, state)  the 610-wide Community Board body. The Solo Helper (Alt+B,
//                              branch mine/solo-buffer) shows it as its Last Hero tab.
//   chat(session, args)        the small chat window: ".lasthero" in chat, bypass "last-hero <action>".
// Both run the same actions (LastHero.act): join, leave, start, home.
//
// Board style (as Solo/BoardStyle.js): the window is dark and see-through, so no bgcolor
// panels (they draw as grey boxes) and a light grey for second lines. Every cell has a width
// and align=left: the C4 client otherwise floats short text away from the left edge.

const Html = require('../../World/Generics/HtmlKit');
const LastHero = require('./LastHero');

const WIDTH = 610;
const BUTTON_WIDTH = 83; // the C4 client draws L2UI_ch3.Btn1 at this size
const BUTTON_CELL = 92;
const EVENT_ICON = 'icon.skill0121';
const ADENA_ICON = 'icon.etc_adena_i00';
const SOFT = 'B5B5B5';
const soft = (text) => Html.font(text, SOFT);

const Response = () => invoke('GameServer/Network/Response');

function className(classId) {
    const DataCache = invoke('GameServer/DataCache');
    const row = DataCache.classTemplates ? invoke('GameServer/ClassProgression').firstClassRow(DataCache.classTemplates, classId) : null;
    return row?.template?.class || 'Fighter';
}

const short = (amount) => LastHero.shortAmount(amount);

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
    if (view.mine?.draftPending) out.push(['Pick buffs', 'buffs']);
    if (view.mine && !view.mine.alive && !view.mine.returned) out.push(['Return now', 'home']);
    if (view.phase === 'registration') out.push(view.registered ? ['Leave queue', 'leave'] : ['Join', 'join']);
    if (view.phase === 'idle' || view.phase === 'registration') out.push(['Start now', 'start']);
    return out;
}

function yourLine(view) {
    if (view.mine?.alive) return 'You are fighting.';
    if (view.mine) return `You are out: #${view.mine.place}, ${view.mine.kills} kills.`;
    if (view.registered) return `You are in the queue (${view.registeredCount} players).`;
    return '';
}

// ---------- board ----------

const B = (action) => `_bbssolo hero ${action}`;

function heading(label) {
    return `<br><table width=${WIDTH}><tr><td width=6></td><td width=${WIDTH - 6} align=left>${Html.font(label, Html.COLOR.title)}</td></tr></table>`
        + `<img src="L2UI.SquareGray" width=${WIDTH} height=1><br1>`;
}

function buttons(view) {
    const list = actions(view);
    if (!list.length) return '';
    return `<table><tr>${list.map(([label, action]) => `<td width=${BUTTON_CELL} align=center>`
        + `${Html.button(label, B(action), { width: BUTTON_WIDTH, hide: false })}</td>`).join('')}</tr></table>`;
}

// Icon, title and what is happening; your own line or the last message under it; the buttons right.
function statusRow(view, message) {
    const second = message ? Html.font(message, Html.COLOR.link) : yourLine(view) ? Html.font(yourLine(view), Html.COLOR.ok) : '';
    return `<table width=${WIDTH}><tr>`
        + `<td width=6></td><td width=38 height=44><img src="${EVENT_ICON}" width=32 height=32></td>`
        + `<td width=370 align=left>${Html.font('Last Hero', Html.COLOR.title)}  ${Html.font(view.text, 'FFFFFF')}`
        + `${second ? `<br1>${second}` : ''}</td>`
        + `<td width=196 align=right>${buttons(view)}</td></tr></table>`;
}

// Four short facts in one row: no wrapping, one line each.
function tiles(view) {
    const s = view.settings;
    const prize = s.prizeAdena > 0 ? `${short(s.prizeAdena)} Adena` : s.prizeItems.length ? 'Item prize' : 'Hero aura';
    const list = [
        ['icon.skill0121', `${s.fighters} fighters`, 'free for all'],
        ['icon.skill1204', `${s.prepareSeconds} s to buff`, 'buffs reset first'],
        [ADENA_ICON, prize, s.prizeAdena > 0 || s.prizeItems.length ? '+ Hero aura' : 'for the winner'],
        ['icon.skill1016', 'No penalty', 'back after']
    ];
    const width = Math.floor(WIDTH / list.length);
    const cells = list.map(([icon, value, label]) => `<td width=38 height=40><img src="${icon}" width=32 height=32></td>`
        + `<td width=${width - 38} align=left>${Html.font(value, 'FFFFFF')}<br1>${soft(label)}</td>`).join('');
    return `<table width=${WIDTH}><tr>${cells}</tr></table>`;
}

function heroRow(view) {
    const hero = view.hero;
    if (!hero) {
        return `<table width=${WIDTH}><tr><td width=6></td><td width=38 height=40><img src="${EVENT_ICON}" width=32 height=32></td>`
            + `<td width=566 align=left>${soft('No Last Hero yet. Win one and you glow.')}</td></tr></table>`;
    }
    return `<table width=${WIDTH}><tr><td width=6></td><td width=38 height=40><img src="${EVENT_ICON}" width=32 height=32></td>`
        + `<td width=386 align=left>${Html.font(hero.name, Html.COLOR.ok)}<br1>${soft(`Lv ${hero.level} ${className(hero.classId)}`)}</td>`
        + `<td width=180 align=right>${soft(`won ${ago(hero.at)}`)}<br1>${soft('glows until the next winner')}</td></tr></table>`;
}

function historyTable(view) {
    const entries = (view.history || []).slice(0, 5);
    if (!entries.length) {
        return `<table width=${WIDTH}><tr><td width=6></td><td width=604 align=left height=22>${soft('No events yet.')}</td></tr></table>`;
    }
    const head = `<tr><td width=6></td><td width=110 align=left height=20>${soft('When')}</td>`
        + `<td width=300 align=left>${soft('Winner')}</td><td width=194 align=left>${soft('You')}</td></tr>`;
    const rows = entries.map((entry) => {
        const winner = entry.winner
            ? `${Html.font(entry.winner.name, 'FFFFFF')} ${soft(`Lv ${entry.winner.level} ${className(entry.winner.classId)}`)}` : soft('no winner');
        const you = entry.you
            ? (entry.you.place === 1 ? Html.font('You won!', Html.COLOR.ok) : Html.font(`#${entry.you.place}, ${entry.you.kills} kills`, 'FFFFFF'))
            : soft(entry.mode === 'simulated' ? 'did not join' : '-');
        return `<tr><td width=6></td><td width=110 align=left height=20>${soft(ago(entry.at))}</td>`
            + `<td width=300 align=left>${winner}</td><td width=194 align=left>${you}</td></tr>`;
    }).join('');
    return `<table width=${WIDTH}>${head}${rows}</table>`;
}

// The last event's most kills, one per row: rank, name (you in green), kills.
function topTable(view) {
    const top = view.history?.[0]?.topKills || [];
    const rows = top.map((entry, index) => `<tr><td width=6></td><td width=30 align=left height=18>${Html.font(`${index + 1}.`, Html.COLOR.title)}</td>`
        + `<td width=300 align=left>${Html.font(entry.name, entry.kind === 'player' ? Html.COLOR.ok : 'FFFFFF')}</td>`
        + `<td width=274 align=left>${soft(`${entry.kills} kill${entry.kills === 1 ? '' : 's'}`)}</td></tr>`).join('');
    return `<table width=${WIDTH}>${rows}</table>`;
}

function boardBody(session, state = {}) {
    const view = LastHero.status(session);
    const top = view.history?.[0]?.topKills?.length ? heading('Most kills - last event') + topTable(view) : '';
    return statusRow(view, state.message)
        + heading('How it works') + tiles(view)
        + heading('The Hero') + heroRow(view)
        + top
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
    const hero = view.hero ? `${Html.font('Hero: ', Html.COLOR.title)}${Html.esc(view.hero.name)} ${soft(`Lv ${view.hero.level} ${className(view.hero.classId)}`)}` : soft('No Last Hero yet.');
    const results = (view.history || []).slice(0, 3).map((entry) => `${soft(ago(entry.at))} ${Html.esc(entry.winner?.name || 'no winner')}`
        + (entry.you ? soft(` (you #${entry.you.place})`) : '')).join('<br1>');
    const s = view.settings;
    const body = `${Html.font('Last Hero', Html.COLOR.title)}<br1>${Html.esc(view.text)}<br1>`
        + (yourLine(view) ? `${Html.font(yourLine(view), Html.COLOR.ok)}<br1>` : '')
        + (message ? `${Html.font(message, Html.COLOR.link)}<br1>` : '')
        + Html.line('L2UI.SquareGray')
        + (links ? `${links}<br1>${Html.line('L2UI.SquareGray')}` : '')
        + soft(`${s.fighters} fighters, everyone for themselves, no parties. Buffs are reset, then ${s.prepareSeconds} s to buff. `
            + `The last one standing wins ${LastHero.prizeText(s)}. No death penalty.`) + '<br1>'
        + Html.line('L2UI.SquareGray') + hero + (results ? `<br1>${results}` : '');
    return `<html><body>${body}</body></html>`;
}

// ---------- the buff draft dialog (270 px) ----------

// Pick N of the offered buffs. "bypass -h" closes the dialog in the client, so only the click
// that completes the picks carries it; the others keep the dialog open and redraw it.
function draftPage(view) {
    const remaining = view.needed - view.picked.length;
    const cell = (buff, index) => {
        const picked = view.picked.includes(index);
        const hide = !picked && remaining === 1;
        const action = `${hide ? 'bypass -h' : 'bypass'} last-hero draft ${index}`;
        const icon = `icon.skill${String(buff.selfId).padStart(4, '0')}`;
        return `<td width=34 height=36><button action="${action}" width=32 height=32 back="${icon}" fore="${icon}"></td>`
            + `<td width=101 align=left><a action="${action}">${Html.font(buff.name, picked ? Html.COLOR.ok : 'FFFFFF')}</a>`
            + `<br1>${picked ? Html.font('picked', Html.COLOR.ok) : soft(`Lv ${buff.level}`)}</td>`;
    };
    const rows = [];
    for (let i = 0; i < view.choices.length; i += 2) {
        rows.push(`<tr>${cell(view.choices[i], i)}${view.choices[i + 1] ? cell(view.choices[i + 1], i + 1) : '<td width=34></td><td width=101></td>'}</tr>`);
    }
    return '<html><body>'
        + `${Html.font(`Last Hero - pick ${view.needed} buffs`, Html.COLOR.title)}<br1>`
        + `${Html.font(`${view.picked.length} of ${view.needed} picked`, Html.COLOR.ok)}  ${soft(`${view.secondsLeft} s left`)}<br1>`
        + Html.line('L2UI.SquareGray')
        + `<table width=270>${rows.join('')}</table>`
        + Html.line('L2UI.SquareGray')
        + soft('Click a picked one again to put it back.')
        + '</body></html>';
}

function showDraft(session) {
    const view = LastHero.draftView(session);
    if (!view || view.done || !session?.actor) return null;
    const html = draftPage(view);
    session.dataSendToMe(Response().npcHtml(session.actor.fetchId(), html));
    return html;
}

// ".lasthero" and bypass "last-hero <action>".
function chat(session, args = []) {
    if (!session?.actor) return null;
    const action = String(args[0] || '').toLowerCase();
    if (action === 'close') return null;
    if (action === 'draft') {
        // The completing click already closed the dialog: nothing is sent back, only the buffs.
        const { done } = LastHero.draftPick(session, args[1]);
        return done ? null : showDraft(session);
    }
    const message = LastHero.act(session, action);
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

module.exports = { WIDTH, boardBody, act, chat, chatPage, command, actions, short, draftPage, showDraft };
