'use strict';
const assert = require('assert');

require('../src/Global');

// Moments (Bot/AI/BotMoments): a bot near the player says a short line in local chat when a
// real player heals, buffs or resurrects it, when it levels up, or when it picks up a rare item.

const Moments = invoke('GameServer/Bot/AI/BotMoments');
const Queries = require('../src/GameServer/World/ActorSpatialQueries');
const TendencyRoll = require('../src/GameServer/Bot/AI/TendencyRoll');
const Voice = invoke('GameServer/Bot/AI/BotChatVoice');
const Budget = invoke('GameServer/Bot/AI/BotChatterBudget');
const Response = invoke('GameServer/Network/Response');
const DataCache = invoke('GameServer/DataCache');
const Config = invoke('GameServer/Bot/Population/PopulationConfig');

// ---------- the odds ----------
assert.strictEqual(Moments.chance('res', {}), 0.9, 'a resurrection is almost always thanked');
assert(Moments.chance('heal', { traits: { sociability: 1 } }) > Moments.chance('heal', { traits: { sociability: 0 } }),
    'a sociable bot talks more');
assert.strictEqual(Moments.chance('nonsense', {}), 0);
for (const kind of ['heal', 'buff', 'res', 'ding', 'drop']) assert(Moments.LINES[kind]('x').length >= 4, `${kind} has lines`);

const saved = { nearest: Queries.nearestPlayer, roll: TendencyRoll.roll, profile: Voice.profile, speak: Response.speak,
    items: DataCache.items, enabled: Config.botMoments };
const said = [];
let distance = 500, rollValue = 0;
try {
    Queries.nearestPlayer = () => ({ session: { accountId: 'player1' }, distance });
    TendencyRoll.roll = () => rollValue;
    Voice.profile = () => ({ traits: { sociability: 0.5 } });
    Response.speak = (actor, { text }) => ({ speak: text });
    DataCache.items = [
        { selfId: 57, template: { name: 'Adena', price: 1 }, etc: { rank: 'none' } },
        { selfId: 1, template: { name: 'Short Sword', price: 590 }, etc: { rank: 'none' } },
        { selfId: 2, template: { name: 'Bow of Peril', price: 2000000 }, etc: { rank: 'c' } },
        { selfId: 3, template: { name: 'Coarse Bone Powder', price: 120000 }, etc: { rank: 'none' } }
    ];
    let id = 2000100;
    const makeBot = (extra = {}) => {
        const bot = { hp: 50, fetchId: () => bot.id, fetchHp: () => bot.hp, fetchMaxHp: () => 100, isDead: () => false, ...extra };
        bot.id = ++id;
        bot.session = { accountId: `bot_pop_${bot.id}`, actor: bot, dataSendToOthers(packet) { said.push(packet.speak); } };
        return bot;
    };
    const player = { fetchId: () => 268480001, session: { accountId: 'player1' } };
    const now = 5000000;
    Budget.reset();

    // Thanks.
    const hurt = makeBot();
    assert(Moments.LINES.heal().includes(Moments.helped(player, hurt, { heal: 40 }, now)), 'a meaningful heal is thanked');
    assert.strictEqual(said.length, 1, 'in local chat');
    assert.strictEqual(Moments.helped(player, hurt, { heal: 40 }), null, 'at most one line a minute per bot');
    const full = makeBot({ hp: 95 });
    assert.strictEqual(Moments.helped(player, full, { heal: 5 }), null, 'topping up a full bot is not worth a word');
    assert(Moments.LINES.buff().includes(Moments.helped(player, makeBot(), { effect: { type: 'buff' } })), 'a buff');
    assert.strictEqual(Moments.helped(player, makeBot(), { effect: { type: 'debuff' } }), null, 'a debuff is no gift');
    assert(Moments.LINES.res().includes(Moments.helped(player, makeBot(), { resurrected: true })), 'a resurrection');
    const other = makeBot();
    assert.strictEqual(Moments.helped(other, makeBot(), { heal: 40 }), null, 'bots do not thank bots');

    // Nobody to hear it, a failed roll, or switched off: silence.
    distance = 5000;
    assert.strictEqual(Moments.helped(player, makeBot(), { resurrected: true }), null, 'no player within earshot');
    distance = 500;
    rollValue = 0.99;
    assert.strictEqual(Moments.helped(player, makeBot(), { heal: 40 }), null, 'the persona roll can say no');
    rollValue = 0;
    Config.botMoments = false;
    assert.strictEqual(Moments.helped(player, makeBot(), { resurrected: true }), null, 'botMoments = false');
    Config.botMoments = true;
    const dead = makeBot({ isDead: () => true });
    assert.strictEqual(Moments.leveled(dead.session, 20), null, 'a dead bot says nothing');

    // Ding.
    const ding = Moments.leveled(makeBot().session, 20);
    assert(Moments.LINES.ding('20').includes(ding), 'a level-up');

    // Drops: graded or worth a lot, never Adena or junk.
    const looter = () => makeBot().session;
    assert.strictEqual(Moments.looted(looter(), 57, 5000000), null, 'Adena is not a drop');
    assert.strictEqual(Moments.looted(looter(), 1, 1), null, 'a cheap no-grade item is not worth a word');
    assert(Moments.LINES.drop('Bow of Peril').includes(Moments.looted(looter(), 2, 1)), 'a graded item');
    assert(Moments.LINES.drop('Coarse Bone Powder').includes(Moments.looted(looter(), 3, 1)), 'something worth 100k');
    assert.strictEqual(Moments.looted(looter(), 999, 1), null, 'an unknown item');
    assert.strictEqual(Moments.looted({ accountId: 'player1', actor: player }, 2, 1), null, 'only bots');
} finally {
    Queries.nearestPlayer = saved.nearest; TendencyRoll.roll = saved.roll; Voice.profile = saved.profile;
    Response.speak = saved.speak; DataCache.items = saved.items; Config.botMoments = saved.enabled;
    Budget.reset();
}

console.log('Bot moment checks passed');
