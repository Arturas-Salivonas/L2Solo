const assert = require('assert');

require('../src/Global');

const SoloAdena = invoke('GameServer/Solo/SoloAdena');
const SoloHelper = invoke('GameServer/Solo/SoloHelper');
const ShowBoard = invoke('GameServer/Solo/ShowBoardPacket');
const Database = invoke('Database');
const Response = invoke('GameServer/Network/Response');

const saved = { updateItemAmount: Database.updateItemAmount, setItem: Database.setItem,
    userInfo: Response.userInfo, itemsList: Response.itemsList };
const writes = [];
Database.updateItemAmount = (...args) => { writes.push(['update', ...args]); return Promise.resolve({ affectedRows: 1 }); };
Database.setItem = (characterId, row) => { writes.push(['set', characterId, row.selfId, row.amount]); return Promise.resolve({ insertId: 9001 }); };
Response.userInfo = () => Buffer.from([0x04]);
Response.itemsList = () => Buffer.from([0x1b]);

function player(adena = null) {
    const items = [];
    const item = (id, selfId, amount) => ({ fetchId: () => id, fetchSelfId: () => selfId, fetchStackable: () => true,
        fetchAmount: () => amount, setAmount(value) { amount = value; } });
    if (adena !== null) items.push(item(500, 57, adena));
    const backpack = {
        fetchItems: () => items,
        fetchTotalAdena: () => items.find((entry) => entry.fetchSelfId() === 57)?.fetchAmount() ?? 0,
        updateAmount: (id, amount) => items.find((entry) => entry.fetchId() === id).setAmount(amount),
        insertItem: (id, selfId, { amount }) => items.push(item(id, selfId, amount))
    };
    const actor = { backpack, fetchId: () => 268480001, fetchName: () => 'Tester' };
    return { actor, sent: [], dataSendToMe(packet) { this.sent.push(packet); } };
}
const sentOf = (session, opcode) => session.sent.filter((packet) => packet[0] === opcode);
function boardHtml(session) {
    return sentOf(session, 0x6e).slice(-3).map((packet) => {
        const text = packet.slice(2).toString('ucs2');
        return text.split('\u0008').slice(1).join('\u0008').replace(/\u0000+$/, '');
    }).join('');
}

(async () => {
    // ---------- amounts ----------
    const cases = [['250000', 250000], ['1,000,000', 1000000], ['1 000 000', 1000000], ['250k', 250000], ['5kk', 5000000],
        ['5M', 5000000], ['2kkk', 2000000000], ['1b', 1000000000], [' 42 ', 42]];
    for (const [text, value] of cases) assert.strictEqual(SoloAdena.parseAmount(text), value, `"${text}" reads as ${value}`);
    for (const text of ['', '0', '-5', 'abc', '$solo_adena', '5x', '1.5kk extra', null])
        assert.strictEqual(SoloAdena.parseAmount(text), null, `"${text}" is not an amount`);

    // ---------- the grant ----------
    {
        const session = player(1000);
        const result = await SoloAdena.give(session, 5000);
        assert.deepStrictEqual(result, { added: 5000, message: 'Added 5,000 Adena.' });
        assert.strictEqual(session.actor.backpack.fetchTotalAdena(), 6000, 'an existing stack grows');
        assert.deepStrictEqual(writes.at(-1), ['update', 268480001, 500, 6000], 'the stack is saved with its new total');
        assert.ok(sentOf(session, 0x04).length && sentOf(session, 0x1b).length, 'the client gets the new user info and items');
    }
    {
        const session = player(null);
        await SoloAdena.give(session, 750);
        assert.strictEqual(session.actor.backpack.fetchTotalAdena(), 750, 'a first stack is created');
        assert.deepStrictEqual(writes.at(-1), ['set', 268480001, 57, 750], 'the new stack is inserted as Adena');
    }
    {
        const session = player(SoloAdena.MAX_ADENA - 10);
        const result = await SoloAdena.give(session, 1000);
        assert.strictEqual(result.added, 10, 'the grant stops at the C4 stack cap');
        assert.strictEqual(session.actor.backpack.fetchTotalAdena(), SoloAdena.MAX_ADENA);
        assert.match(result.message, /stops at 2,147,483,647/);
        const full = await SoloAdena.give(session, 1);
        assert.strictEqual(full.added, 0, 'a full stack takes nothing more');
        assert.match(full.message, /maximum/);
    }
    {
        // Two grants at once must not overwrite each other (InventoryMutationQueue).
        const session = player(0);
        await Promise.all([SoloAdena.give(session, 100), SoloAdena.give(session, 200), SoloAdena.give(session, 300)]);
        assert.strictEqual(session.actor.backpack.fetchTotalAdena(), 600, 'queued grants add up');
    }

    // ---------- the board tab ----------
    {
        const session = player(1234567);
        const html = await SoloHelper.handleBoard(session, ['adena']);
        assert.ok(html.includes('1,234,567'), 'the tab shows what you carry');
        assert.ok(html.includes('<edit var="solo_adena"'), 'the tab has an amount box');
        assert.ok(html.includes('bypass _bbssolo adena add $solo_adena'), 'Add sends the typed amount');
        assert.strictEqual(SoloAdena.QUICK.length, 6);
        for (const amount of SoloAdena.QUICK) assert.ok(html.includes(`bypass _bbssolo adena add ${amount}"`), `a +${amount} button`);
        assert.ok(html.length < ShowBoard.MAX_LENGTH, 'the tab fits one community board page');
        assert.match(html, /value="Adena"[^>]*fore="L2UI_ch3\.Btn1_normalOn"|fore="L2UI_ch3\.Btn1_normalOn"[^>]*value="Adena"/,
            'the Adena top tab is pressed');

        const after = await SoloHelper.handleBoard(session, ['adena', 'add', '1', '000', '000']);
        assert.strictEqual(session.actor.backpack.fetchTotalAdena(), 2234567, 'a typed amount with spaces is added');
        assert.ok(after.includes('Added 1,000,000 Adena.') && boardHtml(session).includes('2,234,567'), 'the board shows the result');

        const bad = await SoloHelper.handleBoard(session, ['adena', 'add', '$solo_adena']);
        assert.ok(bad.includes('Type a number'), 'an empty box explains itself');
        assert.strictEqual(session.actor.backpack.fetchTotalAdena(), 2234567, 'nothing is added for a bad amount');
    }

    // ---------- chat command and config ----------
    {
        const session = player(0);
        assert.strictEqual(SoloHelper.command(session, '.adena 5kk'), true, '.adena <amount> is handled');
        await new Promise((resolve) => setImmediate(resolve));
        await new Promise((resolve) => setImmediate(resolve));
        assert.strictEqual(session.actor.backpack.fetchTotalAdena(), 5000000, '.adena 5kk adds 5,000,000');
        assert.strictEqual(SoloHelper.command(session, '.adena'), true, '.adena alone opens the tab');
        assert.ok(boardHtml(session).includes('Quick add'), '.adena shows the Adena tab');
        assert.strictEqual(SoloHelper.command(session, '.adena lots'), true, 'a bad amount still answers');
        assert.strictEqual(session.actor.backpack.fetchTotalAdena(), 5000000);
        assert.strictEqual(SoloHelper.command(session, '.adenas 5'), false, 'other words are ordinary chat');

        const savedOptions = global.options.default.SoloHelper;
        global.options.default.SoloHelper = { adena: 'false' };
        try {
            assert.strictEqual(SoloHelper.command(session, '.adena 5'), false, 'adena = false turns the command off');
            const html = SoloHelper.handleBoard(session, ['adena', 'add', '5']);
            assert.ok(!String(html).includes('value="Adena"'), 'adena = false hides the tab');
            assert.strictEqual(session.actor.backpack.fetchTotalAdena(), 5000000, 'and adds nothing');
        } finally {
            global.options.default.SoloHelper = savedOptions;
        }
    }

    Object.assign(Database, { updateItemAmount: saved.updateItemAmount, setItem: saved.setItem });
    Object.assign(Response, { userInfo: saved.userInfo, itemsList: saved.itemsList });
    console.log('solo adena: ok');
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
