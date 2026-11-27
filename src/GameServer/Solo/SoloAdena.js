'use strict';

// Solo Helper Adena tab (fork-only, branch mine/solo-buffer): add any amount of Adena to
// your own inventory, from quick buttons, a typed amount, or ".adena <amount>" in chat.
//
// The write mirrors upstream's GM grant (NpcBypasses/AdminGiveAdena.js): update the one
// Adena stack, or insert it, inside InventoryMutationQueue so a sale or pickup landing at
// the same moment cannot overwrite the new amount. C4 sends item counts as a signed 32-bit
// number, so one stack stops at 2,147,483,647.

const Html = require('../World/Generics/HtmlKit');
const Mutations = require('../Inventory/InventoryMutationQueue');

const ADENA_ID = 57;
const ADENA_ICON = 'icon.etc_adena_i00';
const MAX_ADENA = 2147483647;
const Style = require('./BoardStyle');
const BOARD_WIDTH = Style.WIDTH;
const QUICK = Object.freeze([10000, 100000, 1000000, 10000000, 100000000, 1000000000]);
// L2 shorthand: 500k = 500,000, 5kk (or 5m) = 5,000,000, 1kkk (or 1b) = 1,000,000,000.
const SUFFIX = Object.freeze({ '': 1, k: 1e3, kk: 1e6, kkk: 1e9, m: 1e6, b: 1e9 });

const database = () => invoke('Database');
const response = () => invoke('GameServer/Network/Response');
const consoleText = () => invoke('GameServer/ConsoleText');

const format = (value) => Number(value || 0).toLocaleString('en-US');

// "1,000,000", "1 000 000", "250k", "5kk", "2b" -> a whole number above 0, or null.
function parseAmount(text) {
    const raw = String(text ?? '').trim().toLowerCase().replace(/[\s,._']/g, '');
    const match = /^(\d{1,13})(kkk|kk|k|m|b)?$/.exec(raw);
    if (!match) return null;
    const value = Number(match[1]) * SUFFIX[match[2] || ''];
    return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function adenaStack(backpack) {
    return backpack.fetchItems().find((item) => item.fetchSelfId() === ADENA_ID && item.fetchStackable()) || null;
}

function notify(session, actor, added) {
    if (session.actor !== actor || !session.dataSendToMe) return;
    const Response = response();
    session.dataSendToMe(Response.userInfo(actor));
    session.dataSendToMe(Response.itemsList(actor.backpack.fetchItems()));
    const ConsoleText = consoleText();
    ConsoleText.transmit(session, ConsoleText.caption.earnedAdena, [{ kind: ConsoleText.kind.number, value: added }]);
}

// Adds up to `amount` Adena to the session's own character. Resolves { added, message }.
function give(session, amount) {
    const actor = session?.actor;
    const backpack = actor?.backpack;
    if (!backpack) return Promise.resolve({ added: 0, message: 'No character.' });
    if (!Number.isSafeInteger(amount) || amount <= 0) return Promise.resolve({ added: 0, message: 'Type an amount above 0.' });
    return Mutations.run(backpack, async () => {
        const room = MAX_ADENA - backpack.fetchTotalAdena();
        if (room <= 0) return { added: 0, message: `You already carry the C4 maximum (${format(MAX_ADENA)}).` };
        const added = Math.min(amount, room);
        const stack = adenaStack(backpack);
        if (stack) {
            const total = stack.fetchAmount() + added;
            await database().updateItemAmount(actor.fetchId(), stack.fetchId(), total);
            backpack.updateAmount(stack.fetchId(), total);
        } else {
            const row = await database().setItem(actor.fetchId(), { selfId: ADENA_ID, name: 'Adena', amount: added, equipped: false, slot: 0 });
            backpack.insertItem(Number(row.insertId), ADENA_ID, { amount: added });
        }
        notify(session, actor, added);
        return { added, message: added < amount
            ? `Added ${format(added)} Adena - one stack stops at ${format(MAX_ADENA)} in C4.`
            : `Added ${format(added)} Adena.` };
    });
}

// Board action "_bbssolo adena <action> [amount]". Resolves the tab's state.
async function act(session, action = '', arg = '') {
    if (action !== 'add') return {};
    const amount = parseAmount(arg);
    if (amount === null) return { message: 'Type a number, like 250000, 250k or 5kk.' };
    try {
        return { message: (await give(session, amount)).message };
    } catch (error) {
        invoke('FailureLog')?.note?.('solo.adena', error);
        return { message: 'The Adena could not be saved. Try again.' };
    }
}

// Local chat ".adena <amount>": the same grant without the window. Returns true when handled.
function command(session, text) {
    const match = /^\.adena(?:\s+(.*))?$/i.exec(String(text || '').trim());
    if (!match) return false;
    if (!match[1]) return 'open';
    const amount = parseAmount(match[1]);
    const say = (message) => session.dataSendToMe?.(response().systemMessage.text(message));
    if (amount === null) { say('Usage: .adena 250000, .adena 250k or .adena 5kk'); return true; }
    give(session, amount).then(({ message }) => say(message), (error) => {
        invoke('FailureLog')?.note?.('solo.adena', error);
        say('The Adena could not be saved. Try again.');
    });
    return true;
}

const A = (command) => `_bbssolo adena ${command}`;

function status(actor, message) {
    const have = Number(actor?.backpack?.fetchTotalAdena?.() || 0);
    return `<table width=${BOARD_WIDTH} bgcolor=222222><tr>`
        + `<td width=6></td><td width=34 height=34><img src="${ADENA_ICON}" width=32 height=32></td>`
        + `<td width=230>You carry ${Html.font(format(have), Html.COLOR.ok)} Adena</td>`
        + `<td width=334 align=right>${message ? Html.font(Html.esc(message), Html.COLOR.link) : ''}</td><td width=6></td>`
        + '</tr></table>';
}

function heading(label) {
    return `<br1><table width=${BOARD_WIDTH}><tr><td>${Html.font(label, Html.COLOR.title)}</td></tr></table>`
        + `<img src="L2UI.SquareGray" width=${BOARD_WIDTH} height=1><br1>`;
}

function quickTiles() {
    const width = Math.floor(BOARD_WIDTH / QUICK.length);
    const cells = QUICK.map((amount) => `<td width=${width} align=center>`
        + `<button action="bypass ${A(`add ${amount}`)}" width=32 height=32 back="${ADENA_ICON}" fore="${ADENA_ICON}"><br1>`
        + `<a action="bypass ${A(`add ${amount}`)}">+${format(amount)}</a></td>`).join('');
    return `<table width=${BOARD_WIDTH}><tr>${cells}</tr></table>`;
}

function typedAmount() {
    return `<table width=${BOARD_WIDTH}><tr>`
        + '<td width=6></td><td width=170><edit var="solo_adena" width=160 height=15 length=16></td>'
        + `<td width=${Style.BUTTON_CELL}>${Html.button('Add', `${A('add')} $solo_adena`, { width: Style.BUTTON_WIDTH, hide: false })}</td>`
        + `<td width=${BOARD_WIDTH - 176 - Style.BUTTON_CELL}>${Html.font('250000, 250k, 5kk or 1b')}</td>`
        + '</tr></table><br1>'
        + `<table width=${BOARD_WIDTH}><tr><td width=6></td><td>`
        + Html.font('Same from chat: .adena 5kk. One stack holds up to 2,147,483,647 in C4.')
        + '</td></tr></table>';
}

// The Adena tab body; SoloHelper adds the window chrome and tabs.
function boardBody(session, state = {}) {
    return status(session.actor, state.message)
        + heading('Quick add') + quickTiles()
        + heading('Any amount') + typedAmount();
}

module.exports = { MAX_ADENA, QUICK, parseAmount, give, act, command, boardBody };
