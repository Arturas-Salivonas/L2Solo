'use strict';
// Moments: a bot near the player says a short line in local chat when something happens to it,
// the way players do:
// - thanks: a real player healed it (a meaningful heal), buffed it, or brought it back to life
//   (C4SkillEffects' result, Revive);
// - ding: it gained a level (LevelUp);
// - rare drop: it picked up a graded item (D grade or better) or something worth RARE_VALUE
//   Adena or more (PickupItem).
// One seeded roll per moment by persona (sociability makes it talk more; a resurrection is
// almost always thanked), at most one line per bot per COOLDOWN_MS, and only when a real player
// is within EARSHOT to hear it. Lines use the speaker's own chatter window (BotChatterBudget),
// so several bots can talk at once.
// Settings: [BotPopulation] botMoments.
const Config = require('../Population/PopulationConfig');
const TendencyRoll = require('./TendencyRoll');
const Situations = require('../Situations');

const COOLDOWN_MS = 60000;
const EARSHOT = 1500;
const RARE_VALUE = 100000;
const LINES = Object.freeze({
    heal: () => ['ty!', 'thanks!', 'thx :)', 'ty, saved me'],
    buff: () => ['ty for buffs!', 'thx for the buff', 'ty :)', 'oh nice, ty'],
    res: () => ['ty for res!!', 'you saved me, thanks!', 'ty! back in action', 'thank you so much'],
    ding: level => ['ding!', 'ding :)', `finally ${level}!`, `${level}, nice`, 'lvl up!'],
    drop: name => ['nice drop!', 'wow, lucky!', 'yes! a drop', `got ${name}!`]
});

const clamp = (n, low = 0, high = 1) => Math.max(low, Math.min(high, Number(n) || 0));
const isBot = session => String(session?.accountId || '').startsWith('bot_');
let items = null;

function chance(kind, persona) {
    const sociability = clamp(persona?.traits?.sociability ?? 0.5);
    if (kind === 'res') return 0.9;
    if (kind === 'heal' || kind === 'buff') return clamp(0.35 + 0.5 * sociability);
    if (kind === 'ding') return clamp(0.2 + 0.4 * sociability);
    if (kind === 'drop') return clamp(0.3 + 0.4 * sociability);
    return 0;
}

function playerNear(bot) {
    try {
        const near = require('../../World/ActorSpatialQueries').nearestPlayer(invoke('GameServer/World/World'), bot);
        return !!near?.session && Number(near.distance) <= EARSHOT;
    } catch { return false; }
}

// Say a moment's line now, if the bot may (returns the line, or null).
function moment(session, kind, arg = '', now = Date.now()) {
    const bot = session?.actor;
    if (Config.botMoments === false || !isBot(session) || !bot) return null;
    if (session.staticService || session.arenaEphemeral || bot.isDead?.()) return null;
    if (now < Number(session.momentAt || 0) + COOLDOWN_MS || !playerNear(bot)) return null;
    const botId = Number(bot.fetchId());
    const persona = invoke('GameServer/Bot/AI/BotChatVoice').profile(session);
    if (!(TendencyRoll.roll('moment', botId, kind, Math.floor(now / COOLDOWN_MS)) < chance(kind, persona))) return null;
    const Budget = invoke('GameServer/Bot/AI/BotChatterBudget');
    if (!session.dataSendToOthers || !Budget.canReply(session, now)) return null;
    const lines = LINES[kind](arg);
    const text = lines[Math.floor(TendencyRoll.roll('moment_line', botId, kind, now) * lines.length)];
    session.dataSendToOthers(invoke('GameServer/Network/Response').speak(bot, { kind: 0, text }), bot);
    Budget.recordSpeaker(botId, now);
    session.momentAt = now;
    Situations.note(`moment:${kind}`);
    return text;
}

// A skill or revive from `helper` landed on `target` (C4SkillEffects, Revive).
function helped(helper, target, result = {}) {
    if (!helper || !target || helper === target || helper.fetchKind || isBot(helper.session)) return null;
    if (!isBot(target.session)) return null;
    // A heal counts when the bot was below 90% before it (the result is already applied).
    const before = Number(target.fetchHp?.()) - Number(result.heal || 0);
    const kind = result.resurrected ? 'res'
        : Number(result.heal) > 0 && before < Number(target.fetchMaxHp?.()) * 0.9 ? 'heal'
            : result.effect?.type === 'buff' ? 'buff' : null;
    if (!kind) return null;
    // The bot remembers who helped and may tell others in town (BotGossip).
    invoke('GameServer/Bot/AI/BotGossip').helped(helper, target, kind);
    return moment(target.session, kind);
}

function leveled(session, level) {
    return moment(session, 'ding', String(level));
}

function itemInfo(selfId) {
    if (!items) {
        items = new Map();
        for (const row of invoke('GameServer/DataCache').items || []) {
            items.set(Number(row.selfId), { name: String(row.template?.name || ''), price: Number(row.template?.price) || 0,
                rank: String(row.etc?.rank || 'none') });
        }
    }
    return items.get(Number(selfId)) || null;
}

// A bot picked something up (PickupItem): a rare one is worth a word.
function looted(session, selfId, amount = 1) {
    if (!isBot(session) || Number(selfId) === 57) return null;
    const item = itemInfo(selfId);
    if (!item) return null;
    const graded = item.rank && item.rank !== 'none';
    if (!graded && item.price * Math.max(1, Number(amount) || 1) < RARE_VALUE) return null;
    return moment(session, 'drop', item.name.replace(/[^\w '.-]/g, '').slice(0, 24));
}

module.exports = { moment, helped, leveled, looted, chance, LINES, COOLDOWN_MS, EARSHOT, RARE_VALUE };
