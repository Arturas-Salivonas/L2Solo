'use strict';
const assert = require('assert');

require('../src/Global');

// Rivalries (Bot/AI/BotRivalry): grudges between bots, played out when they meet.

const Rivalry = invoke('GameServer/Bot/AI/BotRivalry');
const Memory = invoke('GameServer/Social/InteractionMemoryRuntime');
const Queries = require('../src/GameServer/World/ActorSpatialQueries');
const TendencyRoll = require('../src/GameServer/Bot/AI/TendencyRoll');
const Voice = invoke('GameServer/Bot/AI/BotChatVoice');
const Response = invoke('GameServer/Network/Response');
const Budget = invoke('GameServer/Bot/AI/BotChatterBudget');
const Revenge = invoke('GameServer/Bot/AI/BotRevenge');
const Threats = invoke('GameServer/Bot/AI/BotPvpThreats');
const Competition = invoke('GameServer/Bot/AI/BotMobCompetition');
const Config = invoke('GameServer/Bot/Population/PopulationConfig');

const saved = { assess: Memory.assess, enqueue: Memory.events.enqueue, near: Queries.near, roll: TendencyRoll.roll, profile: Voice.profile,
    speak: Response.speak, request: Revenge.request, peace: Threats.inPeace, owner: Competition.owner, enabled: Config.rivalriesEnabled };
const said = [], fights = [], episodes = [];
let anger = 0, peers = [], rollValue = 0, peace = false, nextId = 2001100;

function bot(name) {
    const actor = { id: ++nextId, name, fetchId() { return this.id; }, fetchName() { return this.name; }, fetchClanId: () => 0,
        isDead: () => false, fetchPrivateStore: () => 0, fetchKarma: () => 0 };
    actor.session = { accountId: `bot_pop_${actor.id}`, actor, plan: 'hunting', dataSendToOthers(packet) { said.push([name, packet.text]); } };
    return actor;
}

try {
    Memory.assess = () => ({ ready: true, personal: { hostility: anger } });
    Memory.events.enqueue = (event) => { episodes.push(event); return true; };
    Queries.near = () => peers.map((actor) => actor.session);
    TendencyRoll.roll = () => rollValue;
    Voice.profile = () => ({ traits: { assertiveness: 0.9 }, inclinations: { pvp: 0.8 } });
    Response.speak = (actor, { text }) => ({ text });
    Revenge.request = (session, target, reason) => { fights.push([session.actor.name, target.name, reason]); return true; };
    Threats.inPeace = () => peace;
    Config.rivalriesEnabled = true;
    Rivalry.reset(); Budget.reset();
    const now = 4000000;

    // No grudge: nothing.
    const a = bot('Alpha'), b = bot('Bravo');
    peers = [b];
    anger = 3;
    assert.strictEqual(Rivalry.tick(a.session, a, now), false);
    assert.strictEqual(said.length, 0, 'no grudge, no words');

    // A grudge: words, and the rival answers.
    anger = Rivalry.ARGUE + 1;
    assert.strictEqual(Rivalry.tick(a.session, a, now + 5000), false, 'words do not take over its tick');
    assert.ok(Rivalry.LINES.argue('Bravo').includes(said[0][1]), `it says so: ${said[0][1]}`);
    assert.ok(b.session.rivalReply, 'the rival will answer');
    Rivalry.tick(b.session, b, b.session.rivalReply.at);
    assert.ok(Rivalry.LINES.reply('Alpha').includes(said[1][1]), `and it does: ${said[1][1]}`);
    assert.strictEqual(fights.length, 0, 'a grudge this size stays words');
    said.length = 0; Budget.reset();
    Rivalry.tick(a.session, a, now + 60000);
    assert.strictEqual(said.length, 0, 'once per 15 minutes per pair');

    // A deep grudge outside town: a fight through the revenge path.
    Rivalry.reset();
    anger = Rivalry.FIGHT + 2;
    const c = bot('Charlie'), d = bot('Delta');
    peers = [d];
    assert.strictEqual(Rivalry.tick(c.session, c, now), true, 'a deep grudge: it picks a fight');
    assert.deepStrictEqual(fights, [['Charlie', 'Delta', 'rivalry']]);
    assert.strictEqual(Rivalry.tick(c.session, c, now + 10000), false, 'once per 30 minutes per pair');
    // In town, or not the fighting kind: words only.
    Rivalry.reset(); fights.length = 0; Budget.reset();
    peace = true;
    const e = bot('Echo'), f = bot('Foxtrot');
    peers = [f];
    Rivalry.tick(e.session, e, now);
    assert.strictEqual(fights.length, 0, 'no fights in town');
    peace = false;
    assert.ok(Rivalry.fightChance({ traits: { assertiveness: 0.2 }, inclinations: { pvp: 0.1 } }) < 0.1, 'a mild bot rarely fights');
    // Busy bots.
    Rivalry.reset();
    const g = bot('Golf');
    g.session.currentTargetId = 5;
    peers = [bot('Hotel')];
    assert.strictEqual(Rivalry.tick(g.session, g, now), false, 'a bot on a mob is not looking for trouble');

    // Kill-steals count toward a grudge.
    const owner = bot('Owner'), thief = bot('Thief'), mob = { fetchId: () => 123456 };
    Competition.owner = () => owner;
    assert.strictEqual(Rivalry.mobKilled(mob, thief, now), true, 'a claimed mob killed by another bot');
    assert.deepStrictEqual(episodes.map((ev) => [ev.sourceId, ev.targetId, ev.type]), [[owner.id, thief.id, 'mob_contested']],
        'the owner holds it against the killer');
    assert.strictEqual(Rivalry.mobKilled(mob, owner, now), false, 'killing its own mob is fine');
    Competition.owner = () => null;
    assert.strictEqual(Rivalry.mobKilled(mob, thief, now), false, 'an unclaimed mob is fair game');
    Config.rivalriesEnabled = false;
    assert.strictEqual(Rivalry.tick(a.session, a, now + ARGUE_LATER()), false, 'rivalriesEnabled = false');
} finally {
    Memory.assess = saved.assess; Memory.events.enqueue = saved.enqueue; Queries.near = saved.near; TendencyRoll.roll = saved.roll;
    Voice.profile = saved.profile; Response.speak = saved.speak; Revenge.request = saved.request; Threats.inPeace = saved.peace;
    Competition.owner = saved.owner; Config.rivalriesEnabled = saved.enabled; Rivalry.reset(); Budget.reset();
}

function ARGUE_LATER() { return Rivalry.ARGUE_MS * 2; }

console.log('Bot rivalry checks passed');
