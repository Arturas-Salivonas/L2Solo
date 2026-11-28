// Living Bots: a bot that does well solo stays solo; one that would do better in a party on
// stronger ground asks for a party there (PartyRequestPlanner party_progress, higherGround),
// and says so in trade chat (BotLfpShout).
const assert = require('assert');
require('../src/Global');

const Request = require('../src/GameServer/Bot/Population/PartyRequestPlanner');
const Progress = require('../src/GameServer/Bot/Population/PartyProgressComparison');
const Profiles = invoke('GameServer/Bot/Population/SpotProfiles');
const Table = invoke('GameServer/Bot/AI/SpotValueTable');
const Shout = require('../src/GameServer/Bot/AI/BotLfpShout');
const TradeChat = invoke('GameServer/Bot/Economy/BotTradeChat');
const Config = invoke('GameServer/Bot/Population/PopulationConfig');
const Route = invoke('GameServer/Bot/Population/BotRoute');

const at = 1795000000000;
const real = { compare: Progress.compare, partnerFor: Progress.partnerFor, find: Profiles.findForState, level: Table.spotLevel,
    deliver: TradeChat.deliver, fits: Route.soloLevelFits };
// Its own ground fits it solo (no 'no solo ground' ask): the comparison decides.
const spots = [{ id: 'low20', name: 'Low Field', minLevel: 18, maxLevel: 22 }, { id: 'up24', name: 'Cruma Marshlands', minLevel: 23, maxLevel: 26 }];
const levels = { low20: 20, up24: 24 };
const bot = { characterId: 4101, accountName: 'bot_ask', name: 'Asker', level: 22, spotId: 'low20', phase: 'cold',
    activity: 'hunting', stats: { classId: 0, role: 'warrior', earning: { spotId: 'low20', at: at - 1000, income: 200000 } } };

try {
    Route.soloLevelFits = () => true;
    Progress.partnerFor = () => ({ characterId: -1, level: 22 });
    Profiles.findForState = (state, options) => (options.mode === 'party' ? { id: 'up24' } : null);
    Table.spotLevel = id => levels[id];
    let compared = [];
    const verdicts = rows => { Progress.compare = (state, peers, options) => { compared.push(options.objective.spotId); return rows[options.objective.spotId]; }; };

    // Solo does well: no party anywhere beats it, no request.
    verdicts({ low20: { accept: false, reason: 'solo_sooner' }, up24: { accept: false, reason: 'solo_sooner' } });
    assert.strictEqual(Request.partyRequestForPlan(bot, null, at, { spots }), null, 'a bot that does well solo stays solo');
    assert.deepStrictEqual(compared, ['low20', 'up24'], 'both its own ground and the stronger one are weighed');

    // A party on the stronger ground beats its solo hunt: it asks for a party there.
    compared = [];
    verdicts({ low20: { accept: false, reason: 'solo_sooner' }, up24: { accept: true, reason: 'party_sooner', partyHours: 3 } });
    const up = Request.partyRequestForPlan(bot, null, at, { spots });
    assert.deepStrictEqual([up.reason, up.spotId, up.objectiveKey], ['party_progress', 'up24', 'spot:up24'],
        'it asks for a party on the stronger ground');

    // Both pay: the sooner of the two.
    verdicts({ low20: { accept: true, partyHours: 2 }, up24: { accept: true, partyHours: 3 } });
    assert.strictEqual(Request.partyRequestForPlan(bot, null, at, { spots }).spotId, 'low20', 'its own ground is sooner: there');
    verdicts({ low20: { accept: true, partyHours: 4 }, up24: { accept: true, partyHours: 3 } });
    assert.strictEqual(Request.partyRequestForPlan(bot, null, at, { spots }).spotId, 'up24', 'the stronger ground is sooner: there');

    // The party search finds nothing above its own ground: only its own ground is weighed.
    compared = [];
    Profiles.findForState = () => ({ id: 'low20' });
    verdicts({ low20: { accept: false } });
    assert.strictEqual(Request.partyRequestForPlan(bot, null, at, { spots }), null);
    assert.deepStrictEqual(compared, ['low20'], 'no stronger ground: one comparison, as before');

    // The ask is held on what it stands on: the spot it chose with it.
    Profiles.findForState = (state, options) => (options.mode === 'party' ? { id: 'up24' } : null);
    let weighed = 0;
    Progress.compare = (state, peers, options) => { weighed++; return options.objective.spotId === 'up24' ? { accept: true, partyHours: 1 } : { accept: false }; };
    const memo = {};
    assert.strictEqual(Request.partyRequestForPlan(bot, null, at, { spots, memo }).spotId, 'up24');
    assert.strictEqual(Request.partyRequestForPlan(bot, null, at + 60000, { spots, memo }).spotId, 'up24', 'held: still the stronger ground');
    assert.strictEqual(weighed, 2, 'an unchanged ask is not weighed again');

    // ---------- the shout ----------
    const said = [];
    TradeChat.deliver = (source, text) => { said.push([source.name, text]); return true; };
    const ask = (key, spotId = 'up24') => ({ ...bot, stats: { ...bot.stats, partyRequest: { status: 'open', reason: 'party_progress',
        objectiveKey: `spot:${key}`, spotId } } });
    Shout._reset();
    const line = Shout.committed(bot, ask('up24'), { now: at, random: () => 0 });
    assert.ok(typeof line === 'string' && line.length > 0 && line.length <= 120, `it shouts its LFP (${line})`);
    assert.ok(!/[–—]/.test(line), 'plain text');
    assert.strictEqual(Shout.committed(ask('up24'), ask('up24'), { now: at + 1000, random: () => 0 }), false, 'the same request: no second shout');
    assert.strictEqual(Shout.committed(bot, ask('other'), { now: at + 60000, random: () => 0 }), false, 'a new request within 10 minutes: quiet');
    assert.ok(Shout.committed(bot, ask('other'), { now: at + Shout.SHOUT_MS + 1, random: () => 0 }), 'after 10 minutes it may shout again');
    assert.strictEqual(Shout.committed(bot, { ...ask('x'), stats: { ...bot.stats, partyRequest: { status: 'open', reason: 'shared_target',
        objectiveKey: 'spot:x' } } }, { now: at + 2 * Shout.SHOUT_MS, random: () => 0 }), false, 'a clan or drop request is not an LFP');
    Config.lfpShoutsEnabled = false;
    Shout._reset();
    assert.strictEqual(Shout.committed(bot, ask('up24'), { now: at, random: () => 0 }), false, 'switched off');
    Config.lfpShoutsEnabled = true;
    assert.ok(said.length >= 2 && said.every(([name]) => name === 'Asker'));
    // A healer asks for damage dealers instead.
    const heal = Shout.lineFor({ ...bot, stats: { ...bot.stats, role: 'healer', classId: 15 } }, { spotId: 'up24' }, () => 0);
    assert.ok(/heal|LF dd|lf party|LFP/i.test(heal), heal);
} finally {
    Progress.compare = real.compare; Progress.partnerFor = real.partnerFor; Profiles.findForState = real.find;
    Table.spotLevel = real.level; TradeChat.deliver = real.deliver; Route.soloLevelFits = real.fits;
}
console.log('Living party ask checks passed');
