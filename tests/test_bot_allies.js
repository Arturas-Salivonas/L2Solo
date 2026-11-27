'use strict';
const assert = require('assert');

require('../src/Global');

// Allies (Bot/AI/BotAllies): bots outside a victim's party may take its side in a fight.

const Allies = invoke('GameServer/Bot/AI/BotAllies');
const Memory = invoke('GameServer/Social/InteractionMemoryRuntime');
const TendencyRoll = require('../src/GameServer/Bot/AI/TendencyRoll');
const Risk = invoke('GameServer/Bot/AI/BotPvpRisk');
const Threats = invoke('GameServer/Bot/AI/BotPvpThreats');
const Voice = invoke('GameServer/Bot/AI/BotChatVoice');
const Response = invoke('GameServer/Network/Response');
const Index = invoke('GameServer/Bot/AI/BotPvpIndex');
const Budget = invoke('GameServer/Bot/AI/BotChatterBudget');
const Config = invoke('GameServer/Bot/Population/PopulationConfig');
const BotAI = invoke('GameServer/Bot/BotAI');

const saved = { assess: Memory.assess, roll: TendencyRoll.roll, decision: Risk.defenseDecision, party: Risk.sameParty,
    peace: Threats.inPeace, profile: Voice.profile, speak: Response.speak, actor: Index.actor, promote: BotAI.promoteForPlayerInteraction,
    enabled: Config.allyDefenseEnabled, rate: Config.allyDefenseRate };
const said = [];
let feelings = new Map(), rollValue = 0, verdict = 'fight', persona = { traits: { empathy: 0.5, assertiveness: 0.5, caution: 0.3 },
    inclinations: { justice: 0.1 } };
const actors = new Map();
let nextId = 2000500;

function character(name, { bot = true, x = 0, y = 0, clan = 0, karma = 0, hp = 100 } = {}) {
    const actor = { id: ++nextId, name, x, y, clan, karma, hp,
        fetchId() { return this.id; }, fetchName() { return this.name; }, fetchLocX() { return this.x; }, fetchLocY() { return this.y; },
        fetchClanId() { return this.clan; }, fetchKarma() { return this.karma; }, fetchHp() { return this.hp; }, fetchMaxHp() { return 100; },
        isDead() { return this.hp <= 0; }, fetchPrivateStore() { return 0; } };
    actor.session = { accountId: bot ? `bot_pop_${actor.id}` : 'player1', actor, aiActive: true,
        dataSendToOthers(packet) { said.push([name, packet.text]); } };
    actors.set(actor.id, actor);
    return actor;
}

try {
    Memory.assess = (a, b) => ({ ready: true, personal: feelings.get(`${a.id}:${b.id}`) || null });
    TendencyRoll.roll = () => rollValue;
    Risk.defenseDecision = () => ({ action: verdict });
    Risk.sameParty = (a, b) => !!a?.party && a.party === b?.party;
    Threats.inPeace = () => false;
    Voice.profile = () => persona;
    Response.speak = (actor, { text }) => ({ text });
    Index.actor = (id) => actors.get(Number(id)) || null;
    BotAI.promoteForPlayerInteraction = () => {};
    Config.allyDefenseEnabled = true;
    Config.allyDefenseRate = 1;
    const now = 9000000;
    const fresh = () => { Allies.reset(); Budget.reset(); said.length = 0; };

    // ---------- who helps, and how likely ----------
    fresh();
    const player = character('Arturas', { bot: false, x: 0 });
    const victim = character('Pingu', { x: 100, clan: 7 });
    const fight = { victim, attacker: player, startedAt: now };
    const clanmate = character('Clanny', { x: 300, clan: 7 });
    assert.strictEqual(Allies.chanceFor(clanmate.session, fight, now).why, 'clan', 'a clanmate helps its clan');
    const friend = character('Buddy', { x: 300 });
    feelings.set(`${friend.id}:${victim.id}`, { trust: 8, affinity: 4, hostility: 0 });
    assert.strictEqual(Allies.chanceFor(friend.session, fight, now).why, 'friend', 'a bot that trusts the victim');
    const stranger = character('Nobody', { x: 300 });
    const strangerOdds = Allies.chanceFor(stranger.session, fight, now);
    assert.strictEqual(strangerOdds.why, 'stranger');
    assert.ok(strangerOdds.chance < Allies.chanceFor(clanmate.session, fight, now).chance, 'a stranger rarely does');
    // Against a red attacker, the justice-minded step in.
    persona = { traits: { caution: 0.3 }, inclinations: { justice: 0.85 } };
    const pk = character('RedGuy', { bot: false, karma: 500 });
    assert.strictEqual(Allies.chanceFor(stranger.session, { victim, attacker: pk, startedAt: now }, now).why, 'justice', 'a justice keeper vs a PK');
    persona = { traits: { empathy: 0.5, assertiveness: 0.5, caution: 0.3 }, inclinations: { justice: 0.1 } };
    // A real player victim: only bots that like the player.
    const attackerBot = character('Bully', { x: 0 });
    const playerFight = { victim: player, attacker: attackerBot, startedAt: now };
    assert.strictEqual(Allies.chanceFor(stranger.session, playerFight, now).why, null, 'a stranger does not defend the player');
    feelings.set(`${friend.id}:${player.id}`, { trust: 3, affinity: 1, hostility: 0 });
    assert.strictEqual(Allies.chanceFor(friend.session, playerFight, now).why, 'player', 'a bot that likes the player defends them');
    feelings.set(`${stranger.id}:${victim.id}`, { trust: 9, affinity: 9, hostility: 5 });
    assert.strictEqual(Allies.bondOf(stranger.session, victim, now), null, 'a bond with a grudge in it is no bond');
    Config.allyDefenseRate = 0;
    assert.strictEqual(Allies.chanceFor(clanmate.session, fight, now).chance, 0, 'allyDefenseRate = 0: nobody helps');
    Config.allyDefenseRate = 1;

    // ---------- joining a fight ----------
    fresh();
    Allies.notice(victim, player, now);
    assert.strictEqual(Allies.tick(clanmate.session, clanmate, now), true, 'the clanmate joins');
    assert.ok(clanmate.session.pvpAggressors.has(player.id), 'the attacker is now its own aggressor: its defense fights them');
    assert.strictEqual(clanmate.session.pvpAggressors.get(player.id).ally, 'clan');
    assert.ok(said.some(([who, text]) => who === 'Clanny' && Allies.LINES.clan('Pingu').includes(text)), 'with a shout');
    assert.strictEqual(Allies.decided(clanmate.session, player, now), true, 'and it will not roll again to run');
    assert.strictEqual(Allies.decided(clanmate.session, attackerBot, now), false, 'only against that attacker');
    // A fight goes on: its entry stays fresh.
    clanmate.session.pvpAggressors.get(player.id).at = now - 5000;
    Allies.notice(victim, player, now + 1000);
    assert.strictEqual(clanmate.session.pvpAggressors.get(player.id).at, now + 1000, 'each blow keeps the helper on that side');
    // Outmatched: it stays out.
    const coward = character('Weakling', { x: 300, clan: 7 });
    verdict = 'flee';
    assert.strictEqual(Allies.tick(coward.session, coward, now), false, 'a bot that cannot win stays out');
    verdict = 'fight';
    // Too far away, then a call for help.
    const farClan = character('FarClan', { x: 2000, clan: 7 });
    const farStranger = character('FarStranger', { x: 2000 });
    assert.strictEqual(Allies.tick(farClan.session, farClan, now), false, 'too far to notice the fight');
    victim.hp = 40;
    Allies.notice(victim, player, now + 2000);
    assert.ok(said.some(([who, text]) => who === 'Pingu' && Allies.LINES.help().includes(text)), 'a hurt bot calls for help');
    assert.strictEqual(Allies.tick(farClan.session, farClan, now + 2000), true, 'its clan hears it from farther');
    assert.strictEqual(Allies.tick(farStranger.session, farStranger, now + 2000), false, 'a stranger that far does not');
    // MAX_HELPERS.
    const late = character('Late', { x: 200, clan: 7 });
    const later = character('Later', { x: 200, clan: 7 });
    Allies.tick(late.session, late, now + 2000);
    assert.strictEqual(Allies.tick(later.session, later, now + 2000), false, `at most ${Allies.MAX_HELPERS} helpers`);
    // Nobody turns on their own: the attacker's clanmate or the victim's party.
    fresh();
    const attackerMate = character('Mate', { x: 200, clan: 9 });
    const clanAttacker = character('Brute', { x: 0, clan: 9 });
    Allies.notice(victim, clanAttacker, now);
    feelings.set(`${attackerMate.id}:${victim.id}`, { trust: 9, affinity: 9, hostility: 0 });
    assert.strictEqual(Allies.tick(attackerMate.session, attackerMate, now), false, 'a bot never fights its own clanmate');
    const partyMate = character('PartyMate', { x: 200, clan: 7 });
    partyMate.session.party = 'p1';
    victim.session.party = 'p1';
    assert.strictEqual(Allies.tick(partyMate.session, partyMate, now), false, 'its party already defends it');
    delete victim.session.party;
    // Busy bots and the switch.
    const busy = character('Busy', { x: 200, clan: 7 });
    busy.session.pvpDefense = { action: 'fight' };
    assert.strictEqual(Allies.tick(busy.session, busy, now), false, 'a bot in its own fight');
    Config.allyDefenseEnabled = false;
    assert.strictEqual(Allies.notice(victim, player, now), null, 'allyDefenseEnabled = false');
    Config.allyDefenseEnabled = true;
    // Friends defend the player.
    fresh();
    Allies.notice(player, attackerBot, now);
    assert.strictEqual(Allies.tick(friend.session, friend, now), true, 'a friend of the player joins');
    assert.ok(friend.session.pvpAggressors.has(attackerBot.id), 'against the bot attacking the player');
    assert.strictEqual(Allies.tick(stranger.session, stranger, now), false, 'a stranger does not');
} finally {
    Memory.assess = saved.assess; TendencyRoll.roll = saved.roll; Risk.defenseDecision = saved.decision; Risk.sameParty = saved.party;
    Threats.inPeace = saved.peace; Voice.profile = saved.profile; Response.speak = saved.speak; Index.actor = saved.actor;
    BotAI.promoteForPlayerInteraction = saved.promote; Config.allyDefenseEnabled = saved.enabled; Config.allyDefenseRate = saved.rate;
    Allies.reset(); Budget.reset();
}

console.log('Bot ally checks passed');
