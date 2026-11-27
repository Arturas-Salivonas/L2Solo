'use strict';

// Solo Helper (fork-only, branch mine/solo-buffer): Alt+B for the one real player.
//
// A full-width Community Board window with tabs along the top. Buffer is the
// first tab (SoloBuffer.js), Adena the second (SoloAdena.js), Class the third
// (SoloClass.js); Market Board opens
// upstream's board window, which Alt+B used to open. A new tool is a TABS row plus
// a branch in handleBoard().
//
// Board links are "bypass _bbssolo <tab> <action> [arg]". The client sends them
// back as RequestBypassToServer, and NpcBypasses/Bbssolo.js routes them here.

const Html = require('../World/Generics/HtmlKit');
const ShowBoard = require('./ShowBoardPacket');
const { config } = require('./SoloConfig');
const Style = require('./BoardStyle');

const WIDTH = Style.WIDTH;
const ROOT = '_bbssolo';
const TABS = Object.freeze([
    { id: 'buff', label: 'Buffer' },
    { id: 'adena', label: 'Adena', enabled: () => config().adena },
    { id: 'class', label: 'Class', enabled: () => config().classChange },
    { id: 'market', label: 'Market Board' }
]);
// The board's own top buttons (home, favorite, region, clan, memo, mail, friends,
// add favorite) all lead back into the helper.
const TOP_BYPASSES = Object.freeze([
    `bypass ${ROOT}`, `bypass ${ROOT} buff`, `bypass ${ROOT}`, `bypass ${ROOT}`,
    `bypass ${ROOT}`, `bypass ${ROOT}`, `bypass ${ROOT}`, `bypass ${ROOT}`
]);

const buffer = () => require('./SoloBuffer');
const adena = () => require('./SoloAdena');
const classes = () => require('./SoloClass');
const tabs = () => TABS.filter((tab) => !tab.enabled || tab.enabled());
const market = (session) => invoke('GameServer/AfkTrade/PlayerBoardWindow').open(session);

function tabBar(activeId) {
    const cells = tabs().map((tab) => {
        const fore = tab.id === activeId ? Html.TEXTURE.defaultButtonDown : Html.TEXTURE.defaultButton;
        return `<td width=${Style.BUTTON_CELL} align=center><button value="${tab.label}" action="bypass ${ROOT} ${tab.id}" width=${Style.BUTTON_WIDTH} height=21 `
            + `back="${Html.TEXTURE.defaultButtonDown}" fore="${fore}"></td>`;
    }).join('');
    return cells;
}

function chrome(activeId, body) {
    const tabsWidth = tabs().length * Style.BUTTON_CELL;
    return '<html><body><br><center>'
        + `<table width=${WIDTH}><tr>`
        + `<td width=${WIDTH - tabsWidth} height=30>${Html.font('Solo Helper', Html.COLOR.title)}</td>`
        + tabBar(activeId)
        + '</tr></table>'
        + `<img src="L2UI.SquareWhite" width=${WIDTH} height=1><br1>`
        + body
        + '</center></body></html>';
}

function sendBoard(session, html) {
    for (const packet of ShowBoard.packets(html, TOP_BYPASSES)) session.dataSendToMe(packet);
    return html;
}

function showBuffer(session, state = {}) {
    return sendBoard(session, chrome('buff', buffer().boardBody(session, state)));
}

function showAdena(session, state = {}) {
    return sendBoard(session, chrome('adena', adena().boardBody(session, state)));
}

function showClass(session, state = {}) {
    return sendBoard(session, chrome('class', classes().boardBody(session, state)));
}

// Opens the helper in the configured window: the board, or the chat window.
function open(session) {
    if (config().window === 'chat') return buffer().chatHandle(session, []);
    return showBuffer(session);
}

// Bypass "_bbssolo <tab> <action> [arg]" (NpcBypasses/Bbssolo.js). A typed amount may
// hold spaces ("1 000 000"), so everything after the action is one argument.
function handleBoard(session, args = []) {
    if (!session?.actor || !config().enabled) return null;
    const [tab = 'buff', action = '', ...rest] = args.map((value) => String(value || '').toLowerCase());
    const arg = rest.join(' ');
    if (tab === 'market') return market(session);
    if (tab === 'adena' && config().adena) {
        const actor = session.actor;
        return adena().act(session, action, arg).then((state) => (session.actor === actor ? showAdena(session, state) : null));
    }
    if (tab === 'class' && config().classChange) {
        const actor = session.actor;
        return classes().act(session, action, arg).then((state) => (session.actor === actor ? showClass(session, state) : null));
    }
    if (tab !== 'buff') return showBuffer(session);
    return showBuffer(session, buffer().act(session, action, arg));
}

// Alt+B (RequestShowBoard, Network/Opcodes.js 0x57). Without the helper it is upstream's Market Board.
function openBoard(session) {
    const settings = config();
    if (settings.enabled && settings.altB && session?.actor) return open(session);
    return market(session);
}

// Local chat ".buffer", ".class", ".adena" and ".adena <amount>" (Request/Speak.js dispatchLocalCommand).
function command(session, text) {
    const line = String(text || '').trim().toLowerCase();
    if (!config().enabled || !session?.actor) return false;
    if (line === '.buffer') { open(session); return true; }
    if (line === '.class' && config().classChange) { showClass(session); return true; }
    if (!config().adena) return false;
    const handled = adena().command(session, line);
    if (handled === 'open') { showAdena(session); return true; }
    return handled === true;
}

module.exports = { WIDTH, ROOT, TABS, TOP_BYPASSES, chrome, open, handleBoard, openBoard, command };
