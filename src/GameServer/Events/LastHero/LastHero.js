'use strict';

// Last Hero (fork-only, branch feat/last-hero): a free-for-all at the Coliseum.
//
// Every [LastHero] everyMinutes (default 120) registration opens for registerMinutes, with
// an announcement. At the start you (if you joined) and bot fighters, up to 100 in all, are
// put on random spots of the Coliseum floor. Parties are broken up and none can be made.
// After prepareSeconds (60) to buff, everyone fights for themselves. The last one standing
// wins prizeAdena (10,000,000) and any prizeItems, plus the Hero aura, and the server announces it. The aura
// stays until the next winner. Nobody loses anything: no EXP loss, no drops, no karma.
// You can also start one by hand (Alt+B > Last Hero > Start now, or the .lasthero window).
//
// Bot fighters are copies of real bots (LastHeroFighters.js). When no player has joined,
// the event runs in the background: the result is drawn from the fighters' levels, the
// winner is announced and gets the aura and the prize all the same.
//
// The combat code asks this module through four small hooks: ArenaCombatRules (who may
// hit whom, no consequences), Actor/Generics/Die.js (a fall here is an elimination),
// RestartPoint.js (a fallen player stands up at the gate) and the Hero byte of
// UserInfo/CharInfo (heroAura). While you fight, your session carries the arena mark
// (session.arenaDuelId = PLAYER_MARK), so area skills and the no-death-penalty rule of
// the arena code apply to you as they do in a Giran arena duel.

const Arena = require('./LastHeroArena');
const Fighters = require('./LastHeroFighters');
const Store = require('./LastHeroStore');
const Chatter = require('./LastHeroChatter');
const Buffs = require('./LastHeroBuffs');
const { config } = require('./LastHeroConfig');

const PLAYER_MARK = 'last-hero';
const TICK_MS = 250;
const SCHEDULER_MS = 1000;
const PRIZE_SCAN_MS = 30000;
const REVIVE_MS = 4000;
const REMOVE_BODY_MS = 4000;
const END_HOLD_MS = 10000;
const OUTSIDE_GRACE_MS = 3000;
const MILESTONES = Object.freeze([50, 25, 10, 5, 3, 2]);
const PREPARE_COUNTDOWN = Object.freeze([30, 20, 10, 5, 3, 2, 1]);
const SIMULATED_MS = Object.freeze({ half: 60000, last: 120000, end: 150000 });
const GOOD_LUCK = Object.freeze(['gl', 'gl hf', 'gg', 'come at me', 'not today', 'lets go', 'o/']);

const Response = () => invoke('GameServer/Network/Response');
const Generics = () => invoke('GameServer/Actor/Generics');
const World = () => invoke('GameServer/World/World');

let registration = null; // { startsAt, players: Map(characterId -> session), said: Set }
let run = null; // the event under way, see startLive / startSimulated
let starting = false;
let scheduler = null;
let lastPrizeScan = 0;

// ---------- small helpers ----------

const now = () => Date.now();
const isRealPlayer = (session) => !!session?.actor && !String(session.accountId || '').startsWith('bot_');
const realPlayers = () => (World().user?.sessions || []).filter((session) => isRealPlayer(session) && session.socket);
const format = (value) => Number(value || 0).toLocaleString('en-US');

function className(classId) {
    const DataCache = invoke('GameServer/DataCache');
    const row = DataCache.classTemplates ? invoke('GameServer/ClassProgression').firstClassRow(DataCache.classTemplates, classId) : null;
    return row?.template?.class || 'Fighter';
}

// The Say2 ANNOUNCEMENT channel (10, L2JLisvus Say2.java): the client shows it in the
// announcement colour, without a speaker.
function announcementPacket(text) {
    const SendPacket = invoke('Packet/Send');
    return new SendPacket(0x4a).writeD(0).writeD(10).writeS('').writeS(String(text)).fetchBuffer();
}

function announce(text) {
    for (const session of realPlayers()) session.dataSendToMe(announcementPacket(text));
    run?.log?.push(text);
    utils.infoSuccess('LastHero', '%s', text); // the server console follows the event too
}

function tell(session, text) {
    session?.dataSendToMe?.(Response().systemMessage.text(text));
}

function later(ms, work) {
    const timer = setTimeout(() => {
        run?.timers?.delete(timer);
        try { work(); } catch (error) { invoke('FailureLog')?.note?.('last_hero.timer', error); }
    }, ms);
    timer.unref?.();
    run?.timers?.add(timer);
    return timer;
}

function clock(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    if (total >= 3600) return `${Math.floor(total / 3600)} h ${Math.floor((total % 3600) / 60)} min`;
    if (total >= 120) return `${Math.ceil(total / 60)} min`;
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

// ---------- who is in it (the combat hooks call these, so they stay cheap) ----------

function fighterOf(actor) {
    if (!run?.byActor || !actor) return null;
    const own = run.byActor.get(actor);
    if (own) return own;
    const ownerId = Number(actor.fetchOwnerId?.()) || 0; // a summon fights for its owner
    return ownerId > 0 ? run.byId.get(ownerId) || null : null;
}

function involves(...actors) {
    return !!run?.byActor && actors.some((actor) => !!fighterOf(actor));
}

// Only standing fighters, once the fight is on, and never someone on their own side.
function canInteract(attacker, victim) {
    if (!run || run.state !== 'fight') return false;
    const a = fighterOf(attacker), v = fighterOf(victim);
    return !!a && !!v && a !== v && a.alive && v.alive;
}

const suppressConsequences = (attacker, victim) => involves(attacker, victim);
const isParticipant = (actor) => !!fighterOf(actor)?.alive;
const partyBlocked = (session) => !!fighterOf(session?.actor) || !!registration?.players?.has(Number(session?.actor?.fetchId?.()));

function heroAura(actor) {
    const hero = Store.read().hero;
    if (!hero || !actor) return false;
    if (Number(actor.fetchId?.()) === Number(hero.id) && !actor.fetchKind) return true;
    return run?.byActor ? fighterOf(actor)?.sourceId === Number(hero.id) : false;
}

// Die.js: a fall in the Coliseum is an elimination, nothing else. True when it was one.
function onDeath(session, actor, killer) {
    const fighter = run?.byActor?.get(actor);
    if (!fighter) return false;
    if (fighter.alive) eliminate(fighter, fighterOf(killer), 'fell');
    return true;
}

// RestartPoint.js: a fallen fighter who presses "to village" stands up at the gate instead.
function restartPoint(session) {
    const fighter = run?.byActor?.get(session?.actor);
    return fighter && fighter.kind === 'player' ? { ...Arena.EXIT } : null;
}

// ---------- joining ----------

function refusal(session) {
    const actor = session?.actor;
    if (!actor) return 'No character.';
    if (actor.isDead?.()) return 'You cannot join while dead.';
    if (Number(actor.fetchKarma?.()) > 0) return 'Fighters with karma cannot join.';
    if (Number(actor.fetchPrivateStoreType?.()) > 0) return 'Close your private store first.';
    if (session.arenaDuelId && session.arenaDuelId !== PLAYER_MARK) return 'Finish your arena duel first.';
    if (fighterOf(actor)) return 'You are already in Last Hero.';
    return null;
}

function join(session) {
    if (!config().enabled) return 'Last Hero is turned off.';
    if (run || starting) return 'Last Hero is under way. Join the next one.';
    if (!registration) return null; // not open: the window offers Start now
    const reason = refusal(session);
    if (reason) return reason;
    registration.players.set(Number(session.actor.fetchId()), session);
    return `You are in. Last Hero starts in ${clock(registration.startsAt - now())}.`;
}

function leaveQueue(session) {
    if (!registration?.players?.delete(Number(session?.actor?.fetchId?.()))) return 'You are not registered.';
    return 'You left the Last Hero queue.';
}

// Start now: registration closes, everyone registered and the starter go in.
function startNow(session) {
    if (!config().enabled) return 'Last Hero is turned off.';
    if (run || starting) return 'Last Hero is already under way.';
    const reason = refusal(session);
    if (reason) return reason;
    const players = new Map(registration?.players || []);
    players.set(Number(session.actor.fetchId()), session);
    registration = null;
    startLive([...players.values()], { manual: true }).catch((error) => {
        invoke('FailureLog')?.note?.('last_hero.start', error);
        abort('could not start');
    });
    return 'Last Hero is starting. Get ready!';
}

// ---------- the schedule ----------

function openRegistration(startsAt) {
    registration = { startsAt, players: new Map(), said: new Set() };
    announce(`Last Hero registration is open: Alt+B > Last Hero, or type .lasthero. The fight starts in ${clock(startsAt - now())} at the Coliseum.`);
}

function schedulerTick(at = now()) {
    const settings = config();
    if (at - lastPrizeScan >= PRIZE_SCAN_MS) { lastPrizeScan = at; payBotPrizes(); }
    if (!settings.enabled) { registration = null; return; }
    if (run) { if (run.mode === 'simulated') simulatedTick(at); return; }
    if (starting) return;
    if (registration) {
        const left = registration.startsAt - at;
        for (const mark of [60000, 30000]) {
            if (left <= mark && !registration.said.has(mark) && left > 0) {
                registration.said.add(mark);
                announce(`Last Hero starts in ${clock(left)}. Join in Alt+B > Last Hero.`);
            }
        }
        if (left <= 0) {
            const players = [...registration.players.values()].filter((session) => !refusal(session));
            registration = null;
            const start = players.length ? startLive(players, { manual: false }) : Promise.resolve(startSimulated());
            start.catch((error) => { invoke('FailureLog')?.note?.('last_hero.start', error); abort('could not start'); });
        }
        return;
    }
    if (settings.everyMinutes <= 0) return;
    const store = Store.read();
    if (!store.nextAt) {
        Store.update((state) => { state.nextAt = at + settings.everyMinutes * 60000; });
        return;
    }
    const opensAt = store.nextAt - settings.registerMinutes * 60000;
    if (at >= opensAt) openRegistration(Math.max(store.nextAt, at + settings.registerMinutes * 60000));
}

function start() {
    if (scheduler) return;
    scheduler = setInterval(() => {
        try { schedulerTick(); } catch (error) { invoke('FailureLog')?.note?.('last_hero.scheduler', error); }
    }, SCHEDULER_MS);
    scheduler.unref?.();
    // A live bots-only event this many seconds after boot, to watch the event without a client.
    const testStart = Number(process.env.L2SOLO_LAST_HERO_TEST_START);
    if (testStart > 0) {
        const timer = setTimeout(() => startLive([], { manual: true }).catch((error) => {
            utils.infoWarn('LastHero', 'test start failed: %s', error.message);
        }), testStart * 1000);
        timer.unref?.();
    }
}

function stopScheduler() {
    clearInterval(scheduler);
    scheduler = null;
}

// ---------- a live event ----------

function newRun(mode, manual) {
    return { id: `${mode}-${now()}`, mode, manual, state: 'starting', startedAt: now(), fighters: [],
        byActor: new Map(), byId: new Map(), timers: new Set(), said: new Set(), log: [], ticks: 0 };
}

function addFighter(fighter) {
    fighter.kills = 0;
    fighter.alive = true;
    fighter.place = null;
    run.fighters.push(fighter);
    run.byActor.set(fighter.actor, fighter);
    run.byId.set(Number(fighter.actor.fetchId()), fighter);
    return fighter;
}

const standing = () => (run?.fighters || []).filter((fighter) => fighter.alive);

async function startLive(playerSessions, { manual = false } = {}) {
    if (run || starting) return false;
    starting = true;
    try {
        const settings = config();
        const players = playerSessions.filter((session) => !refusal(session)).slice(0, settings.fighters);
        const level = players.length
            ? Math.round(players.reduce((sum, session) => sum + Number(session.actor.fetchLevel()), 0) / players.length) : 20;
        const points = Arena.spawnPoints(settings.fighters);
        const candidates = Fighters.pick(settings.fighters - players.length, level,
            { playerSession: players[0] || null, levelGap: settings.levelGap });
        run = newRun('live', manual);
        announce(`Last Hero begins: ${players.length + candidates.length} fighters are on their way to the Coliseum.`);

        for (let i = 0; i < candidates.length; i += 10) {
            const batch = await Promise.all(candidates.slice(i, i + 10)
                .map((candidate, index) => Fighters.spawn(candidate, points[players.length + i + index])));
            if (!run) { batch.forEach((spawned) => spawned && Fighters.remove(spawned.session)); return false; }
            batch.filter(Boolean).forEach((spawned) => addFighter({ kind: 'bot', ...spawned }));
        }
        players.forEach((session, index) => enterPlayer(session, points[index]));
        if (run.fighters.length < 2) { abort('not enough fighters'); return false; }
        const bots = run.fighters.filter((fighter) => fighter.kind === 'bot');
        utils.infoSuccess('LastHero', '%d bot fighters ready in %d ms: %d classes, levels %s', bots.length, now() - run.startedAt,
            new Set(bots.map((fighter) => fighter.classId)).size,
            [...new Set(bots.map((fighter) => fighter.level))].sort((a, b) => a - b).join(' '));

        // Bots: their own buffs (botBuffs), then the same base as you and a random draft of their own.
        const base = Buffs.base(settings.baseBuffs), draftPool = Buffs.pool(base), expiresAt = eventBuffExpiry(settings);
        for (const fighter of run.fighters) {
            if (fighter.kind !== 'bot') continue;
            Fighters.buff(fighter.session, fighter.actor, settings.botBuffs);
            Buffs.apply(fighter.session, fighter.actor, [...base, ...Buffs.draw(draftPool, settings.draftPicks)], expiresAt);
            fighter.actor.fillupVitals?.();
        }
        const botFighters = run.fighters.filter((fighter) => fighter.kind === 'bot');
        if (botFighters.length) {
            const EffectStore = invoke('GameServer/Effects/EffectStore');
            const total = botFighters.reduce((sum, fighter) => sum + EffectStore.list(fighter.actor).length, 0);
            utils.infoSuccess('LastHero', 'bot buffs: %s per bot on average (base %d + draft %d + their own)',
                (total / botFighters.length).toFixed(1), base.length, settings.draftPicks);
        }
        run.state = 'prepare';
        run.total = run.fighters.length;
        run.prepareMs = settings.prepareSeconds * 1000;
        run.prepareEndsAt = now() + run.prepareMs;
        run.timer = setInterval(() => {
            try { runTick(); } catch (error) { invoke('FailureLog')?.note?.('last_hero.tick', error); }
        }, TICK_MS);
        run.timer.unref?.();
        announce(`Last Hero: ${run.total} fighters on the floor, all buffs cancelled. ${settings.prepareSeconds} seconds to buff, then everyone for themselves.`);
        return true;
    } finally {
        starting = false;
    }
}

const summonOf = (actor) => { try { return invoke('GameServer/Npc/SummonControl').activeSummon(actor) || null; } catch { return null; } };
const effectsOf = (actor) => { try { return actor ? structuredClone(invoke('GameServer/Effects/EffectStore').list(actor)) : []; } catch { return []; } };

// Every effect off an actor (buffs, debuffs, toggles), as the Giran arena does before a duel
// (ArenaDuelService.clearArenaEffects), then its stats and buff bar refreshed.
function stripEffects(session, actor, { summon = false } = {}) {
    if (!actor) return 0;
    const EffectStore = invoke('GameServer/Effects/EffectStore');
    const EffectTicker = invoke('GameServer/Effects/EffectTicker');
    let effects = [];
    try {
        effects = EffectStore.list(actor);
        EffectTicker.clearAll(actor);
        effects.forEach((effect) => EffectStore.remove(actor, effect.key));
        actor.activeBuffs = {};
        const silent = effects.find((effect) => effect?.stats?.silentMoving);
        if (silent) invoke('GameServer/Skills/ToggleSkills').cleanupState(session, actor, silent);
        if (summon) {
            invoke('GameServer/World/Generics/NpcBypasses/AdminFullBuff').refreshSummon(session, actor);
        } else {
            invoke(path.actor).calculateStats(session, actor);
            actor.statusUpdateVitals?.(actor);
            session.dataSendToMe?.(Response().userInfo(actor));
            EffectTicker.refreshEffects?.(session, actor);
        }
    } catch (error) {
        invoke('FailureLog')?.note?.('last_hero.strip_effects', error);
    }
    return effects.length;
}

function enterPlayer(session, point) {
    const actor = session.actor;
    const summon = summonOf(actor);
    const fighter = addFighter({
        kind: 'player', session, actor, name: actor.fetchName(), classId: actor.fetchClassId(), level: actor.fetchLevel(),
        sourceId: Number(actor.fetchId()), point,
        origin: { locX: actor.fetchLocX(), locY: actor.fetchLocY(), locZ: actor.fetchLocZ(), head: actor.fetchHead?.() || 0 },
        effectsBefore: effectsOf(actor), summon, summonEffectsBefore: effectsOf(summon)
    });
    const Companions = invoke('GameServer/Bot/AI/PartyCompanionService');
    if (Companions.membersForLeader(session).length) {
        Companions.detachAll(session, { event: 'last_hero', source: 'last_hero', message: 'Last Hero is everyone for themselves. See you after!' });
        tell(session, 'Last Hero allows no parties: your party was broken up.');
    }
    // Everyone starts clean: the bot copies arrive with no effects, and yours come off. They
    // come back when you leave the Coliseum (sendHome).
    stripEffects(session, actor);
    if (summon) stripEffects(session, summon, { summon: true });
    session.arenaDuelId = PLAYER_MARK;
    actor.setTarget?.(null);
    // Then everyone's base buffs, and your draft: a few of a random handful, in a dialog.
    const settings = config();
    const base = Buffs.base(settings.baseBuffs);
    Buffs.apply(session, actor, base, eventBuffExpiry(settings), { refresh: true });
    fighter.draft = settings.draftPicks > 0
        ? { choices: Buffs.draw(Buffs.pool(base), settings.draftChoices), picked: [], done: false, needed: settings.draftPicks }
        : null;
    if (fighter.draft) fighter.draft.needed = Math.min(fighter.draft.needed, fighter.draft.choices.length);
    Generics().teleportTo(session, actor, point, { onArrival: () => openDraft(fighter) });
    tell(session, `Last Hero: all buffs are cancelled. Everyone gets ${base.map((buff) => buff.name).join(', ')}`
        + (fighter.draft ? `, and you pick ${fighter.draft.needed} more.` : '.')
        + ` ${settings.prepareSeconds} seconds, then the last one standing wins.`);
    return fighter;
}

// Event buffs last the whole event; they come off on the way home all the same.
const eventBuffExpiry = (settings) => now() + (settings.prepareSeconds + settings.fightMinutes * 60 + 120) * 1000;

// ---------- the buff draft ----------

function openDraft(fighter) {
    if (!run || !fighter.draft || fighter.draft.done || fighter.session.actor !== fighter.actor) return;
    invoke('GameServer/Events/LastHero/LastHeroWindow').showDraft(fighter.session);
}

// What the draft dialog shows: { choices, picked, needed, done, secondsLeft } or null.
function draftView(session) {
    const fighter = run?.byActor?.get(session?.actor);
    if (!fighter?.draft) return null;
    return { ...fighter.draft, secondsLeft: Math.max(0, Math.ceil((Number(run.prepareEndsAt || 0) - now()) / 1000)) };
}

// A click in the draft dialog. The last pick buffs you; the dialog's link closes it.
// Returns { done, message }.
function draftPick(session, index) {
    const fighter = run?.byActor?.get(session?.actor);
    const draft = fighter?.draft;
    if (!draft) return { done: true, message: '' };
    if (draft.done) return { done: true, message: 'Your Last Hero buffs are already picked.' };
    const choice = Number(index);
    if (!Number.isInteger(choice) || choice < 0 || choice >= draft.choices.length) return { done: false, message: '' };
    if (draft.picked.includes(choice)) draft.picked = draft.picked.filter((picked) => picked !== choice); // a second click puts it back
    else draft.picked.push(choice);
    if (draft.picked.length < draft.needed) return { done: false, message: '' };
    return { done: true, message: finishDraft(fighter) };
}

// The picks (topped up at random when time ran out) go on, once.
function finishDraft(fighter, { auto = false } = {}) {
    const draft = fighter.draft;
    if (!draft || draft.done) return '';
    const rest = draft.choices.map((_, index) => index).filter((index) => !draft.picked.includes(index));
    while (draft.picked.length < draft.needed && rest.length) draft.picked.push(rest.splice(Math.floor(Math.random() * rest.length), 1)[0]);
    draft.done = true;
    const buffs = draft.picked.map((index) => draft.choices[index]);
    const got = Buffs.apply(fighter.session, fighter.actor, buffs, eventBuffExpiry(config()), { refresh: true });
    const text = `${auto ? 'Time is up, picked for you' : 'Buffed'}: ${got.map((buff) => `${buff.name} ${buff.level}`).join(', ')}.`;
    tell(fighter.session, `Last Hero: ${text}`);
    return text;
}

// The Solo Helper asks this before its buffer or Full HP/MP/CP: no outside help in the event.
function buffsLocked(actor) {
    return !!fighterOf(actor) && config().lockBuffer;
}

function runTick() {
    if (!run) return;
    run.ticks += 1;
    const at = now();
    if (run.state === 'prepare') prepareTick(at);
    else if (run.state === 'fight') fightTick(at);
    else if (run.state === 'ending' && at >= run.endsAt) cleanup();
}

function prepareTick(at) {
    const left = run.prepareEndsAt - at;
    for (const mark of PREPARE_COUNTDOWN) {
        // Only marks inside the buffing time: 15 seconds of it never says "starts in 20 seconds".
        if (mark * 1000 < run.prepareMs && left <= mark * 1000 && !run.said.has(`prep${mark}`)) {
            run.said.add(`prep${mark}`);
            announce(mark > 5 ? `Last Hero: the fight starts in ${mark} seconds.` : `${mark}...`);
        }
    }
    for (const fighter of run.fighters) {
        if (fighter.kind === 'player') keepPlayerIn(fighter, at, { prepare: true });
    }
    if (run.ticks % 20 === 0) {
        const bots = run.fighters.filter((fighter) => fighter.kind === 'bot');
        const speaker = bots[Math.floor(Math.random() * bots.length)];
        if (speaker && Math.random() < 0.6) Fighters.say(speaker, GOOD_LUCK[Math.floor(Math.random() * GOOD_LUCK.length)]);
    }
    if (left <= 0) beginFight(at);
}

function beginFight(at) {
    run.state = 'fight';
    run.fightStartedAt = at;
    run.fightEndsAt = at + config().fightMinutes * 60000;
    const PvpFlag = invoke('GameServer/Actor/PvpFlag');
    // Purple names: a flagged character is attacked with a plain click, no Ctrl.
    for (const fighter of standing()) PvpFlag.mark(fighter.session, fighter.actor, config().fightMinutes * 60000 + 60000);
    for (const fighter of standing()) if (fighter.draft && !fighter.draft.done) finishDraft(fighter, { auto: true });
    announce('Last Hero: FIGHT!');
}

function keepPlayerIn(fighter, at, { prepare = false } = {}) {
    const { session, actor } = fighter;
    if (session.actor !== actor || session.characterLeaving || session.socket?.destroyed) {
        eliminate(fighter, null, 'left'); // logged out or switched character
        return;
    }
    if (actor.isDead?.()) { eliminate(fighter, null, 'fell'); return; } // a death the Die hook did not see
    if (session.pendingActorTeleport) { fighter.outsideSince = 0; return; }
    if (Arena.isInsideActor(actor)) { fighter.outsideSince = 0; return; }
    if (prepare) { Generics().teleportTo(session, actor, fighter.point); return; }
    fighter.outsideSince = fighter.outsideSince || at;
    if (at - fighter.outsideSince >= OUTSIDE_GRACE_MS) eliminate(fighter, null, 'left');
}

function fightTick(at) {
    const up = standing();
    up.forEach((fighter, index) => {
        if (fighter.kind === 'player') { keepPlayerIn(fighter, at); return; }
        if (fighter.actor.isDead?.() || fighter.actor.state?.fetchDead?.()) { eliminate(fighter, null, 'fell'); return; }
        if ((run.ticks + index) % 2) return; // every bot thinks every 500 ms, half of them per tick
        if (!Arena.isInsideActor(fighter.actor) && !fighter.session.pendingActorTeleport) {
            Fighters.stop(fighter);
            Generics().teleportTo(fighter.session, fighter.actor, Arena.spawnPoints(1)[0]);
            return;
        }
        Fighters.fight(fighter, up);
    });
    if (!run || run.state !== 'fight') return;
    const left = standing();
    if (left.length <= 1) { finish(left[0] || null, 'last'); return; }
    if (at >= run.fightEndsAt) {
        const best = [...left].sort((a, b) => b.kills - a.kills
            || (b.actor.fetchHp() / Math.max(1, b.actor.fetchMaxHp())) - (a.actor.fetchHp() / Math.max(1, a.actor.fetchMaxHp())))[0];
        finish(best, 'time');
    }
}

function clearFlag(fighter) {
    const { session, actor } = fighter;
    if (!session || !actor) return;
    clearTimeout(session.pvpFlagTimer);
    session.pvpFlagTimer = undefined;
    session.pvpFlagUntil = 0;
    if (Number(actor.fetchPvpFlag?.()) === 0) return;
    actor.setPvpFlag(0);
    session.dataSendToMe?.(Response().userInfo(actor));
    session.dataSendToOthers?.(Response().charInfo(actor), actor);
    session.dataSendToOthers?.(Response().relationChanged(actor), actor);
}

// A fallen bot's flag ends without a word to the client: sending its look again (charInfo)
// would stand its body back up on the floor.
function quietFlag(fighter) {
    clearTimeout(fighter.session?.pvpFlagTimer);
    if (fighter.session) { fighter.session.pvpFlagTimer = undefined; fighter.session.pvpFlagUntil = 0; }
    fighter.actor?.setPvpFlag?.(0);
}

function eliminate(fighter, by, how) {
    if (!run || !fighter.alive) return;
    fighter.place = standing().length;
    fighter.alive = false;
    fighter.how = how;
    if (by && by !== fighter && by.alive) by.kills += 1;
    const left = standing().length;

    if (fighter.kind === 'bot') {
        quietFlag(fighter);
        Fighters.stop(fighter);
        later(REMOVE_BODY_MS, () => { if (!fighter.removed) { fighter.removed = true; Fighters.remove(fighter.session); } });
    } else {
        playerOut(fighter, by, how);
    }
    if (by?.kind === 'player' && by.alive) tell(by.session, `You defeated ${fighter.name}. ${left} left.`);
    if (MILESTONES.includes(left) && !run.said.has(`left${left}`) && run.state === 'fight') {
        run.said.add(`left${left}`);
        announce(`Last Hero: ${left} fighters left.`);
    }
}

function playerOut(fighter, by, how) {
    const { session, actor } = fighter;
    clearFlag(fighter);
    if (session.arenaDuelId === PLAYER_MARK) session.arenaDuelId = undefined;
    const reason = how === 'left' ? 'you left the arena' : by ? `${by.name} got you` : 'you fell';
    tell(session, `Last Hero: you are out (${reason}). You placed #${fighter.place} of ${run.total || run.fighters.length} with ${fighter.kills} kills.`);
    if (how === 'fell') {
        tell(session, 'You stand up at the gate in a moment. Watch, or press Return in Alt+B > Last Hero. You go back where you were when it ends.');
        later(REVIVE_MS, () => {
            if (session.actor !== actor || !actor.isDead?.()) return;
            Generics().revive(session, actor, { delayMs: 0 });
            session.dataSendToMe?.(Response().userInfo(actor));
            Generics().teleportTo(session, actor, { ...Arena.EXIT });
        });
    }
}

function finish(winner, reason) {
    if (!run || run.state === 'ending') return;
    run.state = 'ending';
    run.endsAt = now() + END_HOLD_MS;
    for (const fighter of run.fighters) {
        if (fighter.kind === 'bot') Fighters.stop(fighter);
        if (fighter.alive || fighter.kind === 'player') clearFlag(fighter);
        else quietFlag(fighter);
    }
    const top = topKills(run.fighters);
    if (winner) {
        winner.place = 1;
        Fighters.social(winner, 3); // Victory
        crown(winner, reason, top);
    } else {
        announce('Last Hero ended with no one standing.');
        announceTop(top);
    }
    for (const fighter of run.fighters) {
        if (fighter.kind === 'player' && !fighter.returned) tell(fighter.session, `You go back where you were in ${Math.round(END_HOLD_MS / 1000)} seconds.`);
    }
    record(winner, reason, top);
}

const killWord = (count) => `${count} kill${count === 1 ? '' : 's'}`;

// The five with the most kills: more kills first, then whoever lasted longer (the winner's
// place is 1). Nobody without a kill. [{ name, kills, kind, place }]
function topKills(fighters, size = 5) {
    return fighters.filter((fighter) => Number(fighter.kills) > 0)
        .sort((a, b) => b.kills - a.kills || (a.place ?? 0) - (b.place ?? 0))
        .slice(0, size)
        .map((fighter) => ({ name: fighter.name, kills: fighter.kills, kind: fighter.kind, place: fighter.place ?? 1 }));
}

// One announcement per row, so the list reads as a list.
function announceTop(top) {
    if (!top.length) return;
    announce('Last Hero - most kills:');
    top.forEach((entry, index) => announce(`${index + 1}. ${entry.name} - ${killWord(entry.kills)}`));
}

function itemName(selfId) {
    try {
        const definition = require('../../Item/ItemTemplateIndex').find(invoke('GameServer/DataCache').items, selfId);
        return definition?.template?.name || `item ${selfId}`;
    } catch { return `item ${selfId}`; }
}

// "10,000,000 Adena, 5 Gold Bar and the Hero aura"
function prizeText(settings = config()) {
    const parts = [];
    if (settings.prizeAdena > 0) parts.push(`${format(settings.prizeAdena)} Adena`);
    for (const [id, count] of settings.prizeItems) parts.push(`${count > 1 ? `${format(count)} ` : ''}${itemName(id)}`);
    return parts.length ? `${parts.join(', ')} and the Hero aura` : 'the Hero aura';
}

// The winner's prize in their own bag: the Adena, then each prize item (QuestService.giveItem:
// a stack grows, an unstackable item comes one at a time).
async function givePrize(session, adena, items) {
    const got = [];
    if (adena > 0) {
        const { added } = await giveAdena(session, adena);
        if (added > 0) got.push(`${format(added)} Adena`);
    }
    const Quests = invoke('GameServer/Quest/QuestService');
    for (const [id, count] of items || []) {
        const definition = require('../../Item/ItemTemplateIndex').find(invoke('GameServer/DataCache').items, id);
        if (!definition) { utils.infoWarn('LastHero', 'prizeItems: no item %d in the datapack, skipped', id); continue; }
        if (definition.etc?.stackable) await Quests.giveItem(session, id, count);
        else for (let i = 0; i < Math.min(count, 100); i++) await Quests.giveItem(session, id, 1);
        got.push(`${count > 1 ? `${format(count)} ` : ''}${definition.template?.name || id}`);
    }
    return got;
}

// The winner: announced, the Hero aura, the prize. Works for a live fighter or a drawn one.
function crown(winner, reason, top = []) {
    const settings = config();
    const what = `${winner.name} (Lv ${winner.level} ${className(winner.classId)})`;
    announce(reason === 'time'
        ? `Last Hero: time is up! ${what} wins with ${killWord(winner.kills || 0)}: ${prizeText(settings)}!`
        : `Last Hero: ${what} is the last one standing with ${killWord(winner.kills || 0)} and wins ${prizeText(settings)}!`);
    announceTop(top);
    if (settings.winnerChat) {
        try {
            Chatter.afterWin({ winner, live: run?.mode === 'live', prize: shortAmount(settings.prizeAdena),
                fallen: (run?.fighters || []).filter((fighter) => fighter !== winner && fighter.kind === 'bot')
                    .map((fighter) => ({ id: fighter.sourceId, name: fighter.name })),
                count: run?.mode === 'live' ? 24 : 10 });
        } catch (error) {
            invoke('FailureLog')?.note?.('last_hero.chatter', error);
        }
    }
    const previous = Store.read().hero;
    Store.update((state) => {
        state.hero = { id: winner.sourceId, name: winner.name, classId: winner.classId, level: winner.level, at: now() };
    });
    refreshAura(previous?.id);
    refreshAura(winner.sourceId);
    if (winner.actor) refreshAuraFor(winner.session, winner.actor);
    if (settings.prizeAdena <= 0 && !settings.prizeItems.length) return;
    if (winner.kind === 'player' && winner.session?.actor === winner.actor) {
        givePrize(winner.session, settings.prizeAdena, settings.prizeItems)
            .then((got) => { if (got.length) tell(winner.session, `You won ${got.join(', ')}.`); })
            .catch((error) => invoke('FailureLog')?.note?.('last_hero.prize', error));
    } else {
        Store.update((state) => {
            const owed = owedPrize(state.prizes[winner.sourceId]);
            owed.adena += settings.prizeAdena;
            owed.items.push(...settings.prizeItems);
            state.prizes[winner.sourceId] = owed;
        });
        payBotPrizes();
    }
}

// A bot's owed prize: { adena, items }. Older files kept only a number of Adena.
function owedPrize(value) {
    if (value && typeof value === 'object') return { adena: Number(value.adena) || 0, items: Array.isArray(value.items) ? [...value.items] : [] };
    return { adena: Number(value) || 0, items: [] };
}

// 10000000 -> "10kk", 1500000 -> "1.5kk", 250000 -> "250k"
function shortAmount(amount) {
    const value = Number(amount || 0);
    if (value >= 1e6) return `${Number((value / 1e6).toFixed(1))}kk`;
    if (value >= 1e3) return `${Number((value / 1e3).toFixed(1))}k`;
    return String(value);
}

function refreshAuraFor(session, actor) {
    if (!session || !actor) return;
    if (isRealPlayer(session)) session.dataSendToMe?.(Response().userInfo(actor));
    session.dataSendToOthers?.(Response().charInfo(actor), actor);
}

// Every body of this character in the world shows (or stops showing) the aura.
function refreshAura(characterId) {
    if (!characterId) return;
    for (const session of World().user?.sessions || []) {
        if (session.actor && Number(session.actor.fetchId()) === Number(characterId)) refreshAuraFor(session, session.actor);
    }
}

function record(winner, reason, top = []) {
    const you = run.fighters.find((fighter) => fighter.kind === 'player');
    const settings = config();
    Store.update((state) => {
        state.history.unshift({
            at: now(), mode: run.mode, reason, fighters: run.total || run.fighters.length,
            winner: winner ? { name: winner.name, classId: winner.classId, level: winner.level, kind: winner.kind, kills: winner.kills || 0 } : null,
            you: you ? { name: you.name, place: you.place, kills: you.kills } : null,
            topKills: top
        });
        state.nextAt = settings.everyMinutes > 0 ? now() + settings.everyMinutes * 60000 : 0;
    });
}

// Ten seconds after the winner: the bot copies go, players go back where they came from.
function cleanup() {
    const ending = run;
    if (!ending) return;
    clearInterval(ending.timer);
    for (const timer of ending.timers) clearTimeout(timer);
    for (const fighter of ending.fighters) {
        if (fighter.kind === 'bot') { if (!fighter.removed) { fighter.removed = true; Fighters.remove(fighter.session); } continue; }
        sendHome(fighter);
    }
    run = null;
}

function sendHome(fighter) {
    if (fighter.returned) return;
    fighter.returned = true;
    const { session, actor } = fighter;
    clearFlag(fighter);
    if (session.arenaDuelId === PLAYER_MARK) session.arenaDuelId = undefined;
    run?.byActor?.delete(actor);
    run?.byId?.delete(Number(actor.fetchId()));
    if (session.actor !== actor) return;
    const G = Generics();
    if (actor.isDead?.()) G.revive(session, actor, { delayMs: 0 });
    // The event's buffs stay in the Coliseum: the ones you came with come back, yours and your servitor's.
    stripEffects(session, actor);
    restoreEffects(session, actor, fighter.effectsBefore);
    const summon = summonOf(actor);
    if (summon && summon === fighter.summon) {
        stripEffects(session, summon, { summon: true });
        restoreEffects(session, summon, fighter.summonEffectsBefore, { summon: true });
    }
    actor.fillupVitals?.();
    actor.statusUpdateVitals?.(actor);
    session.dataSendToMe?.(Response().userInfo(actor));
    G.teleportTo(session, actor, fighter.origin);
}

// The buffs you came in with come back, with the time they had left (as the Giran arena does).
function restoreEffects(session, actor, effects = [], { summon = false } = {}) {
    const EffectStore = invoke('GameServer/Effects/EffectStore');
    const EffectTicker = invoke('GameServer/Effects/EffectTicker');
    for (const effect of effects) {
        const expiresAt = Number(effect.expiresAt || 0);
        if (expiresAt > 0 && expiresAt <= now()) continue;
        try {
            const restored = EffectStore.apply(actor, { ...effect, ...(expiresAt > 0 ? { durationMs: expiresAt - now() } : {}) });
            if (restored) EffectTicker.scheduleExpiry(session, actor, restored);
        } catch (error) {
            invoke('FailureLog')?.note?.('last_hero.restore_effect', error);
        }
    }
    try {
        if (summon) { invoke('GameServer/World/Generics/NpcBypasses/AdminFullBuff').refreshSummon(session, actor); return; }
        invoke(path.actor).calculateStats(session, actor);
        EffectTicker.refreshEffects?.(session, actor);
    } catch (error) {
        invoke('FailureLog')?.note?.('last_hero.restore_refresh', error);
    }
}

// Return now (Alt+B): a player who is out goes back without waiting for the end.
function returnHome(session) {
    const fighter = run?.byActor?.get(session?.actor);
    if (!fighter || fighter.kind !== 'player') return 'You are not in Last Hero.';
    if (fighter.alive) return 'You are still fighting!';
    sendHome(fighter);
    return 'Back where you were.';
}

function abort(reason) {
    const ending = run;
    run = null;
    if (!ending) return;
    clearInterval(ending.timer);
    for (const timer of ending.timers || []) clearTimeout(timer);
    for (const fighter of ending.fighters) {
        if (fighter.kind === 'bot') Fighters.remove(fighter.session);
        else sendHome(fighter);
    }
    announce(`Last Hero was called off (${reason}).`);
}

// ---------- a background event (nobody joined) ----------

function startSimulated() {
    const settings = config();
    const candidates = Fighters.pick(settings.fighters, 20, { levelGap: 80 });
    if (candidates.length < 2) return false;
    run = newRun('simulated', false);
    run.total = candidates.length;
    run.state = 'fight';
    const entries = candidates.map((candidate) => ({
        kind: 'bot', sourceId: Fighters.sourceIdOf(candidate), name: candidate.name, level: Number(candidate.level),
        classId: Number(candidate.subject?.fetchClassId?.() ?? candidate.state?.stats?.classId ?? candidate.state?.classId ?? 0)
    }));
    // Stronger bots win more often: chance grows with level to the 4th power.
    const weights = entries.map((entry) => Math.pow(Math.max(1, entry.level), 4));
    let roll = Math.random() * weights.reduce((sum, weight) => sum + weight, 0);
    run.simulated = entries.find((entry, index) => (roll -= weights[index]) <= 0) || entries[0];
    run.simulated.kills = 3 + Math.floor(Math.random() * 8);
    run.simulated.place = 1;
    // The rest of the most-kills list is drawn the same way, among the others.
    const others = entries.filter((entry) => entry !== run.simulated).sort(() => Math.random() - 0.5).slice(0, 4);
    others.forEach((entry, index) => {
        entry.place = 2 + index;
        entry.kills = 1 + Math.floor(Math.random() * (run.simulated.kills + 2));
    });
    run.simulatedTop = topKills([run.simulated, ...others]);
    announce(`Last Hero has begun at the Coliseum: ${run.total} fighters, everyone for themselves.`);
    return true;
}

function simulatedTick(at) {
    const elapsed = at - run.startedAt;
    // Counted down only when there is room to count: half, then 3 (a small event skips them).
    if (elapsed >= SIMULATED_MS.half && !run.said.has('half') && run.total >= 8) {
        run.said.add('half');
        announce(`Last Hero: ${Math.round(run.total / 2)} fighters left.`);
    }
    if (elapsed >= SIMULATED_MS.last && !run.said.has('last') && run.total >= 5) {
        run.said.add('last');
        announce('Last Hero: 3 fighters left.');
    }
    if (elapsed >= SIMULATED_MS.end) {
        crown(run.simulated, 'last', run.simulatedTop || []);
        record({ ...run.simulated }, 'last', run.simulatedTop || []);
        run = null;
    }
}

// ---------- Adena ----------

// Adds Adena to one character's own inventory, as the GM grant does (AdminGiveAdena.js):
// one stack, inside InventoryMutationQueue, capped at the C4 stack size.
function giveAdena(session, amount) {
    const MAX_ADENA = 2147483647;
    const actor = session?.actor;
    const backpack = actor?.backpack;
    if (!backpack || amount <= 0) return Promise.resolve({ added: 0 });
    const Mutations = require('../../Inventory/InventoryMutationQueue');
    const Database = invoke('Database');
    return Mutations.run(backpack, async () => {
        const added = Math.min(amount, Math.max(0, MAX_ADENA - backpack.fetchTotalAdena()));
        if (added <= 0) return { added: 0 };
        const stack = backpack.fetchItems().find((item) => item.fetchSelfId() === 57 && item.fetchStackable());
        if (stack) {
            const total = stack.fetchAmount() + added;
            await Database.updateItemAmount(actor.fetchId(), stack.fetchId(), total);
            backpack.updateAmount(stack.fetchId(), total);
        } else {
            const row = await Database.setItem(actor.fetchId(), { selfId: 57, name: 'Adena', amount: added, equipped: false, slot: 0 });
            backpack.insertItem(Number(row.insertId), 57, { amount: added });
        }
        if (isRealPlayer(session)) {
            session.dataSendToMe?.(Response().userInfo(actor));
            session.dataSendToMe?.(Response().itemsList(backpack.fetchItems()));
        }
        return { added };
    });
}

// A bot winner's prize waits until the bot is active (near you), then lands in its bag.
function payBotPrizes() {
    const owed = Store.read().prizes;
    const ids = Object.keys(owed || {});
    if (!ids.length) return;
    const sessions = invoke('GameServer/Bot/BotManager').sessions || [];
    for (const id of ids) {
        const session = sessions.find((entry) => !entry.arenaEphemeral && Number(entry.actor?.fetchId?.()) === Number(id));
        if (!session || session.paying) continue;
        session.paying = true;
        const prize = owedPrize(owed[id]);
        // Owed once: the debt is cleared before the bag is filled, so a second scan cannot pay it twice.
        Store.update((state) => { delete state.prizes[id]; });
        givePrize(session, prize.adena, prize.items)
            .catch((error) => invoke('FailureLog')?.note?.('last_hero.bot_prize', error))
            .finally(() => { session.paying = false; });
    }
}

// ---------- what the window shows ----------

function status(session) {
    const settings = config();
    const at = now();
    const store = Store.read();
    const me = Number(session?.actor?.fetchId?.());
    const mine = run?.byActor?.get(session?.actor);
    let phase = 'idle', text;
    if (!settings.enabled) { phase = 'off'; text = 'Last Hero is turned off.'; }
    else if (starting || run?.state === 'starting') { phase = 'starting'; text = 'Fighters are going to the Coliseum...'; }
    else if (run?.mode === 'simulated') { phase = 'background'; text = `Under way at the Coliseum: ${run.total} fighters.`; }
    else if (run?.state === 'prepare') { phase = 'prepare'; text = `Buff up! The fight starts in ${clock(run.prepareEndsAt - at)}.`; }
    else if (run?.state === 'fight') { phase = 'fight'; text = `Fight: ${standing().length} of ${run.total} standing.`; }
    else if (run?.state === 'ending') { phase = 'ending'; text = 'The fight is over.'; }
    else if (registration) { phase = 'registration'; text = `Registration open: starts in ${clock(registration.startsAt - at)}.`; }
    else if (settings.everyMinutes > 0 && store.nextAt) text = `Next Last Hero in ${clock(store.nextAt - at)}.`;
    else text = 'No Last Hero is scheduled. Start one now.';
    return {
        phase, text, settings,
        registered: !!registration?.players?.has(me),
        registeredCount: registration?.players?.size || 0,
        mine: mine ? { alive: mine.alive, place: mine.place, kills: mine.kills, returned: !!mine.returned,
            draftPending: !!mine.draft && !mine.draft.done && mine.alive } : null,
        standing: run?.mode === 'live' ? standing().length : null,
        hero: store.hero, history: store.history
    };
}

// The window's actions: join, leave, start, home. Resolves a message for the window.
function act(session, action) {
    switch (String(action || '')) {
        case 'join': return join(session) || 'Registration is not open. Start one now, or wait for the next.';
        case 'leave': return leaveQueue(session);
        case 'start': return startNow(session);
        case 'home': return returnHome(session);
        case 'buffs':
            return invoke('GameServer/Events/LastHero/LastHeroWindow').showDraft(session) ? 'Pick your buffs in the dialog.' : 'Your buffs are already picked.';
        default: return '';
    }
}

module.exports = {
    PLAYER_MARK, start, stopScheduler, schedulerTick, startLive, startSimulated, startNow, join, leaveQueue, returnHome,
    involves, canInteract, suppressConsequences, isParticipant, partyBlocked, heroAura, onDeath, restartPoint,
    fighterOf, status, act, giveAdena, givePrize, payBotPrizes, prizeText, shortAmount, stripEffects, announcementPacket, clock,
    draftView, draftPick, finishDraft, buffsLocked,
    _state: () => ({ run, registration, starting }),
    _reset() {
        if (run) { clearInterval(run.timer); for (const timer of run.timers || []) clearTimeout(timer); }
        run = null; registration = null; starting = false; stopScheduler();
    },
    _tick: () => runTick()
};
