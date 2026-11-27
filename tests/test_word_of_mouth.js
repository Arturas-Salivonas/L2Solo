'use strict';
const assert = require('assert');

require('../src/Global');

// Word of mouth (Social/SpotTipPolicy, Bot/AI/BotSpotTips, BotRoute.huntSpot): a trusted bot
// doing better names its best spot; the listener tries it until it has samples there.

invoke('GameServer/DataCache').init();
const Policy = require('../src/GameServer/Social/SpotTipPolicy');
const BotRoute = invoke('GameServer/Bot/Population/BotRoute');
const Hunt = invoke('GameServer/Bot/AI/BotHuntEfficiency');
const Tips = invoke('GameServer/Bot/AI/BotSpotTips');

const at = Date.now();
// ---------- the rule ----------
{
    const tip = Policy.open({ spotId: 'tip46', fromId: 9, fromName: 'Teller<b>', perHour: 120000.4, at });
    assert.deepStrictEqual(tip, { spotId: 'tip46', fromId: 9, fromName: 'Tellerb', perHour: 120000, at, until: at + Policy.TIP_MS });
    const row = (extra = {}) => ({ stats: { spotTip: tip, ...extra } });
    assert(Policy.active(row(), at + 1000, []), 'a fresh tip sends the bot');
    assert(!Policy.active(row(), at + Policy.TIP_MS + 1, []), 'an old one does not');
    assert(!Policy.active(row({ karma: 30 }), at + 1000, []), 'a bot with karma washes it first');
    assert(!Policy.active(row(), at + 1000, [{ spotId: 'tip46' }]), 'tried: its own samples decide');
    assert.strictEqual(Policy.routeKey({ stats: {} }, at), '');
}

// ---------- the route tries the tip ----------
{
    const spot = (id, level, locX) => ({ id, name: id, avgLevel: level, minLevel: level - 1, maxLevel: level + 1,
        density: 20, center: { locX, locY: 0, locZ: 0 }, tags: [], tagsAuthoritative: true });
    const spots = [spot('ground46', 46, 30000), spot('tip46', 46, 60000)];
    const bot = (stats = {}) => ({ characterId: 9201, name: 'Bot9201', accountName: 'bot_9201', phase: 'cold', activity: 'hunting',
        level: 46, spotId: 'ground46', loc: { ...spots[0].center }, inventory: {}, vitals: { hp: 100, maxHp: 100, mp: 100, maxMp: 100 },
        timing: {}, stats: { classId: 1, role: 'melee', earning: { spotId: 'ground46', income: 1000 }, ...stats } });
    const choose = (state, timestamp = at + 1000) => BotRoute.huntSpot(state, null, { spots, timestamp })?.spotId ?? null;
    const usual = choose(bot());
    assert.notStrictEqual(usual, 'tip46', `without a tip the bot keeps its own choice (${usual})`);
    const tip = Policy.open({ spotId: 'tip46', fromId: 9, at });
    assert.strictEqual(choose(bot({ spotTip: tip })), 'tip46', 'a tip sends the bot to try that spot');
    assert.strictEqual(choose(bot({ spotTip: tip }), at + Policy.TIP_MS + 1), usual, 'an old tip does not');
    assert.strictEqual(choose(bot({ spotTip: { ...tip, spotId: 'gone' } })), usual, 'a spot not in the catalogue sends nowhere');
    const owner = {};
    const held = (state, timestamp = at + 1000) => BotRoute.heldHuntSpot(owner, state, null, { spots, timestamp })?.spotId ?? null;
    assert.strictEqual(held(bot()), usual);
    assert.strictEqual(held(bot({ spotTip: tip })), 'tip46', 'a new tip moves the held choice');
    assert.strictEqual(held(bot({ spotTip: tip }), at + Policy.TIP_MS + 1), usual, 'its end moves it back');
}

// ---------- two trusted bots in town ----------
const World = invoke('GameServer/World/World');
const Profiles = invoke('GameServer/Bot/Population/SpotProfiles');
const SpotService = invoke('GameServer/Bot/AI/SpotService');
const Memory = invoke('GameServer/Social/InteractionMemoryRuntime');
const Budget = invoke('GameServer/Bot/AI/BotChatterBudget');
const Response = invoke('GameServer/Network/Response');
const Life = invoke('GameServer/Bot/Population/BotLifeState');
const saved = { user: World.user, native: World.actorSpatialIndex, sampled: Hunt.sampledRows, find: Profiles.findById,
    suitable: SpotService.isSuitable, assess: Memory.assess, canReply: Budget.canReply, speaker: Budget.recordSpeaker,
    speak: Response.speak, notify: Life.notifyNearFacts, peace: utils.isInPeaceZone };
const said = [], posts = [];
try {
    World.actorSpatialIndex = false;
    Hunt.sampledRows = state => state?.rows || [];
    Profiles.findById = id => ({ id, name: id === 'agony' ? 'Ruins of Agony' : id, avgLevel: 20 });
    SpotService.isSuitable = () => true;
    let trust = 5;
    Memory.assess = () => ({ ready: true, personal: { trust, affinity: 3, hostility: 0 } });
    Budget.canReply = () => true; Budget.recordSpeaker = () => {};
    Response.speak = (_actor, data) => data.text;
    Life.notifyNearFacts = (session, reason) => posts.push([session.actor.fetchId(), reason]);
    utils.isInPeaceZone = () => true;
    const hunt = (spotId, adenaPerHour) => ({ spotId, adena: adenaPerHour, loot: 0, kills: 10, cycleMs: 3600000, costs: 0 });
    let serial = 9300;
    const bot = (rows, x = 0, name) => {
        const id = serial++;
        const actor = { fetchId: () => id, fetchName: () => name || `Bot${id}`, fetchLocX: () => x, fetchLocY: () => 0, fetchLocZ: () => 0,
            fetchLevel: () => 20, fetchClanId: () => 0, isDead: () => false };
        const session = { actor, accountId: `bot_${id}`, plan: 'shopping', coldLifeState: { characterId: id, level: 20, spotId: 'field', stats: {}, rows },
            dataSendToOthers(text) { said.push([id, text]); } };
        actor.session = session;
        return session;
    };
    const teller = bot([hunt('agony', 90000)], 0, 'Teller'), listener = bot([hunt('field', 30000)], 200, 'Listener');
    World.user = { sessions: [teller, listener] };

    assert.strictEqual(Tips.tick(teller, teller.actor, at), true, 'the bot doing better tells the other');
    const tip = listener.coldLifeState.stats.spotTip;
    assert.strictEqual(tip.spotId, 'agony', 'the listener holds the tip');
    assert.strictEqual(tip.fromName, 'Teller');
    assert.deepStrictEqual(posts.at(-1), [listener.actor.fetchId(), 'spot_tip'], 'and the background thread hears it');
    assert(said.some(([id, text]) => id === teller.actor.fetchId() && /Listener, try Ruins of Agony\. I make about 90k an hour there\./.test(text)),
        `out loud: ${JSON.stringify(said)}`);
    assert.strictEqual(Tips.tick(teller, teller.actor, at + Tips.SCAN_MS), false, 'a teller tells once in a while');
    assert.strictEqual(Tips.tick(listener, listener.actor, at), false, 'the one doing worse has nothing to tell');

    // Not worth it, not trusted, not settled: nothing.
    const other = bot([hunt('field', 80000)], 300, 'Other');
    World.user = { sessions: [bot([hunt('agony', 90000)], 0), other] };
    assert.strictEqual(Tips.tick(World.user.sessions[0], World.user.sessions[0].actor, at), false,
        'a listener earning nearly as much hears no tip (BETTER)');
    trust = 0;
    const stranger = bot([hunt('field', 10000)], 300);
    World.user = { sessions: [bot([hunt('agony', 90000)], 0), stranger] };
    assert.strictEqual(Tips.tick(World.user.sessions[0], World.user.sessions[0].actor, at), false, 'a stranger hears nothing');
    trust = 5;
    const away = bot([hunt('field', 10000)], 300);
    away.plan = 'hunting'; utils.isInPeaceZone = () => false;
    World.user = { sessions: [bot([hunt('agony', 90000)], 0), away] };
    assert.strictEqual(Tips.tick(World.user.sessions[0], World.user.sessions[0].actor, at), false, 'hunting in the field, nobody talks shop');
} finally {
    World.user = saved.user; World.actorSpatialIndex = saved.native; Hunt.sampledRows = saved.sampled; Profiles.findById = saved.find;
    SpotService.isSuitable = saved.suitable; Memory.assess = saved.assess; Budget.canReply = saved.canReply;
    Budget.recordSpeaker = saved.speaker; Response.speak = saved.speak; Life.notifyNearFacts = saved.notify; utils.isInPeaceZone = saved.peace;
}

console.log('Word of mouth checks passed');
