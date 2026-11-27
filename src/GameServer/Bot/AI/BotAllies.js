'use strict';
// Allies (Living Bots): a character under attack gets help from the bots around it, the way
// players stand up for their clan and their friends.
// - A bot attacked by someone outside its party: its clanmates and the bots that trust it
//   (BotSpotTips.trusts) may join; against a red attacker, so may the justice-minded; now and
//   then a kind, bold stranger does too.
// - A real player attacked: the bots that like that player come to help (friends defend you).
// - A bot under CALL_HP calls for help once ("help!"): its clan and friends hear it from
//   CALL_RADIUS, farther than they would notice the fight by themselves.
// - Each bot judges each fight once, by one seeded roll (TendencyRoll) on its bond to the victim
//   and its persona, scaled by allyDefenseRate. A helper first checks it can win
//   (BotPvpRisk.defenseDecision); at most MAX_HELPERS join one fight.
// - Joining is the existing PvP defense: the attacker goes into the helper's pvpAggressors and
//   BotPvpDefense fights it (focus, flee at critical HP), never re-rolling the choice to help
//   (decided). C4 rules hold: a defense engages only a flagged or red attacker, so a helper
//   never takes karma, and nobody defends a PK against the player who hunts it.
// Fights are noticed through BotPvpThreats.record (notice); each hot bot looks at them in its
// tick (tick), as TownAttention does. A helper stays on that side while blows go on.
// Settings: [BotPopulation] allyDefenseEnabled, allyDefenseRate.
const Config = require('../Population/PopulationConfig');
const TendencyRoll = require('./TendencyRoll');
const Situations = require('../Situations');

const NOTICE_RADIUS = 1200;
const CALL_RADIUS = 2500;
const CALL_HP = 0.5;
const MAX_HELPERS = 3;
const FIGHT_QUIET_MS = 10000;
const FIGHT_MAX_MS = 180000;
const MAX_FIGHTS = 24;
const SCAN_MS = 800;
const MAX_RATE = 5;

const fights = new Map();

const clamp = (n, low = 0, high = 1) => Math.max(low, Math.min(high, Number(n) || 0));
const isBot = session => String(session?.accountId || '').startsWith('bot_');
const idOf = actor => Number(actor?.fetchId?.() || 0);
const nameOf = actor => String(actor?.fetchName?.() || '').replace(/[^\w .-]/g, '').slice(0, 24);
const gap = (a, b) => Math.hypot(Number(a.fetchLocX()) - Number(b.fetchLocX()), Number(a.fetchLocY()) - Number(b.fetchLocY()));
const enabled = () => Config.allyDefenseEnabled !== false;
const rate = () => Math.max(0, Math.min(MAX_RATE, Number(Config.allyDefenseRate ?? 1)));
const alive = actor => !!actor && !actor.isDead?.() && !actor.state?.fetchDead?.();
const hpOf = actor => Number(actor.fetchHp?.()) / Math.max(1, Number(actor.fetchMaxHp?.()) || 1);

const LINES = Object.freeze({
    clan: victim => [`${victim}, I got you!`, 'leave our clanmate alone!', 'back off!', `hold on ${victim}!`],
    friend: victim => [`leave ${victim} alone!`, `hold on ${victim}!`, 'hey! back off', `${victim}, coming!`],
    justice: () => ['not on my watch, PK!', 'PK! get him!', 'die, PK!', 'PKs get no mercy here'],
    stranger: victim => ['2v1 now', 'pick on someone your size', `leave ${victim} alone!`, 'hey, stop that!'],
    player: victim => [`I got you ${victim}!`, `hold on ${victim}!`, `back off from ${victim}!`, `${victim}, I'm here!`],
    help: () => ['help!!', 'help me pls!', 'someone help!', 'help!'],
    helpPk: () => ['help, PK!', 'PK!! help!', 'help, a PK!']
});

function who(actor) {
    return { id: idOf(actor), clanId: Number(actor.fetchClanId?.() || 0) };
}

function feelingOf(helper, victim, now) {
    try {
        const relation = invoke('GameServer/Social/InteractionMemoryRuntime').assess(who(helper), who(victim), {}, now);
        return relation?.ready ? (relation.personal || relation.effective || null) : null;
    } catch { return null; }
}

// The helper's bond to the victim: 'clan', 'friend', 'friendly' or null.
function bondOf(session, victim, now) {
    const helper = session.actor;
    const clan = Number(helper.fetchClanId?.() || 0);
    if (clan > 0 && clan === Number(victim.fetchClanId?.() || 0)) return 'clan';
    const feeling = feelingOf(helper, victim, now);
    if (!feeling || Number(feeling.hostility) > 0) return null;
    if (Number(feeling.trust) >= 6 && Number(feeling.affinity) > 0) return 'friend';
    if (Number(feeling.trust) >= 2 || Number(feeling.affinity) >= 2) return 'friendly';
    return null;
}

// The chance and the reason a bot joins this fight on the victim's side.
function chanceFor(session, fight, now, persona = invoke('GameServer/Bot/AI/BotChatVoice').profile(session)) {
    const t = key => clamp(persona?.traits?.[key] ?? 0.5);
    const i = key => clamp(persona?.inclinations?.[key] ?? 0.1);
    const bond = bondOf(session, fight.victim, now);
    const red = Number(fight.attacker.fetchKarma?.() || 0) > 0;
    const player = !isBot(fight.victim.session);
    let chance = 0, why = null;
    if (bond === 'clan') { chance = 0.55; why = 'clan'; }
    else if (bond === 'friend') { chance = 0.5; why = player ? 'player' : 'friend'; }
    else if (bond === 'friendly') { chance = 0.25; why = player ? 'player' : 'friend'; }
    if (red) {
        const justice = 0.1 + 0.7 * i('justice');
        if (justice > chance) { chance = justice; why = 'justice'; }
    }
    if (!why && !player) { chance = 0.02 + 0.15 * t('empathy') * t('assertiveness'); why = 'stranger'; }
    if (!why) return { chance: 0, why: null };
    return { chance: clamp(chance * (1.15 - 0.5 * t('caution')) * rate(), 0, 0.95), why };
}

function say(session, text, now) {
    const bot = session.actor;
    const Budget = invoke('GameServer/Bot/AI/BotChatterBudget');
    if (!text || !session.dataSendToOthers || !Budget.canReply(session, now)) return false;
    session.dataSendToOthers(invoke('GameServer/Network/Response').speak(bot, { kind: 0, text }), bot);
    Budget.recordSpeaker(idOf(bot), now);
    return true;
}

function pick(lines, ...parts) {
    return lines[Math.floor(TendencyRoll.roll('ally_line', ...parts) * lines.length)];
}

function prune(now) {
    for (const [key, fight] of fights) {
        if (now - fight.at > FIGHT_QUIET_MS || now - fight.startedAt > FIGHT_MAX_MS || !alive(fight.attacker)) fights.delete(key);
    }
    while (fights.size > MAX_FIGHTS) fights.delete(fights.keys().next().value);
}

// A blow between characters (BotPvpThreats.record, after its own checks): the fight is noticed,
// its helpers keep their side, and a hurt bot may call for help.
function notice(victim, attacker, now = Date.now()) {
    if (!enabled() || !victim?.session || !attacker || victim === attacker) return null;
    const key = `${idOf(victim)}:${idOf(attacker)}`;
    let fight = fights.get(key);
    if (!fight) {
        prune(now);
        fight = { key, victim, attacker, startedAt: now, at: now, judged: new Set(), joined: new Set(), called: false };
        fights.set(key, fight);
    }
    fight.at = now;
    const Index = invoke('GameServer/Bot/AI/BotPvpIndex');
    for (const helperId of fight.joined) {
        const entry = Index.actor(helperId)?.session?.pvpAggressors?.get(idOf(attacker));
        if (entry) entry.at = now;
    }
    if (!fight.called && isBot(victim.session) && alive(victim) && hpOf(victim) < CALL_HP) {
        fight.called = true;
        const red = Number(attacker.fetchKarma?.() || 0) > 0;
        say(victim.session, pick(LINES[red ? 'helpPk' : 'help'](), idOf(victim), idOf(attacker)), now);
        Situations.note('ally:call');
    }
    return fight;
}

// Can this bot look at fights now?
function free(session, bot) {
    if (!isBot(session) || session.staticService || session.arenaEphemeral || session.partyCompanion === true) return false;
    if (!alive(bot) || session.pvpDefense || session.pvpRevenge || bot.fetchPrivateStore?.()) return false;
    // A red helper's defense may strike a white attacker (BotPvpThreats.canDefendWhileChaotic): PKs don't help.
    if (Number(bot.fetchKarma?.() || 0) > 0) return false;
    return session.aiActive !== false;
}

function join(session, bot, fight, why, now) {
    const attackerId = idOf(fight.attacker);
    const history = session.pvpAggressors || (session.pvpAggressors = new Map());
    history.delete(attackerId);
    history.set(attackerId, { at: now, victimId: idOf(fight.victim), ally: why });
    fight.joined.add(idOf(bot));
    session.allyJoined = { attackerId, victimId: idOf(fight.victim), why, at: now };
    const victim = nameOf(fight.victim);
    say(session, pick(LINES[why](victim), idOf(bot), attackerId, fight.startedAt), now);
    Situations.note(`ally:${why}`);
    try { invoke('GameServer/Bot/BotAI').promoteForPlayerInteraction(session, 'ally_defense'); } catch { /* the tick runs anyway */ }
    return true;
}

// Judge one fight: stays unjudged while the bot is too far to know of it.
function judge(session, bot, fight, now) {
    const botId = idOf(bot);
    if (fight.judged.has(botId) || fight.joined.size >= MAX_HELPERS) return false;
    if (botId === idOf(fight.victim) || botId === idOf(fight.attacker) || !alive(fight.victim) || !alive(fight.attacker)) return false;
    const distance = gap(bot, fight.victim);
    if (distance > CALL_RADIUS) return false;
    const Risk = invoke('GameServer/Bot/AI/BotPvpRisk');
    const Threats = invoke('GameServer/Bot/AI/BotPvpThreats');
    if (Threats.inPeace(bot) || Risk.sameParty(session, fight.victim.session) || Risk.sameParty(session, fight.attacker.session)) {
        fight.judged.add(botId);
        return false;
    }
    const ownClan = Number(bot.fetchClanId?.() || 0);
    if (ownClan > 0 && ownClan === Number(fight.attacker.fetchClanId?.() || 0)) { fight.judged.add(botId); return false; }
    const { chance, why } = chanceFor(session, fight, now);
    const bonded = why === 'clan' || why === 'friend' || why === 'player';
    // Only a call for help carries past NOTICE_RADIUS, and only to the victim's own.
    if (distance > NOTICE_RADIUS && !(fight.called && bonded)) return false;
    fight.judged.add(botId);
    if (!why || !(TendencyRoll.roll('ally', botId, idOf(fight.victim), idOf(fight.attacker), fight.startedAt) < chance)) return false;
    const decision = Risk.defenseDecision(session, [fight.attacker], { key: ['ally', botId, idOf(fight.attacker), fight.startedAt] });
    if (decision?.action !== 'fight') { Situations.note('ally:outmatched'); return false; }
    return join(session, bot, fight, why, now);
}

// A hot bot's tick, before its PvP defense (BotAI.tick).
function tick(session, bot, now = Date.now()) {
    if (!enabled() || !fights.size || now < Number(session.allyScanAt || 0)) return false;
    session.allyScanAt = now + SCAN_MS;
    if (!free(session, bot)) return false;
    prune(now);
    for (const fight of fights.values()) {
        if (judge(session, bot, fight, now)) return true;
    }
    return false;
}

// BotPvpDefense: a bot that chose to join a fight against this target fights it; it does not
// roll again whether to run.
function decided(session, target, now = Date.now()) {
    const joined = session?.allyJoined;
    return !!joined && joined.attackerId === idOf(target) && now - joined.at < FIGHT_MAX_MS;
}

function reset() {
    fights.clear();
}

module.exports = { notice, tick, decided, chanceFor, bondOf, reset, fights, LINES, NOTICE_RADIUS, CALL_RADIUS, CALL_HP, MAX_HELPERS };
