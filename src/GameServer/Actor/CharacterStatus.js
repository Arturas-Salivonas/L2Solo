const EffectStore  = invoke('GameServer/Effects/EffectStore');
const EffectTicker = invoke('GameServer/Effects/EffectTicker');

function activeBuffs(actor) {
    return EffectStore.list(actor)
        .filter((effect) => effect.type !== 'debuff' && effect.toggle !== true && Number(effect.expiresAt) > Date.now());
}

// A saved buff keeps the time it had left (remainingMs): as in C4, the clock does not run while
// the character is offline or the server is down. restoreEffects starts it again at login.
function serializeEffects(actor, now = Date.now()) {
    return JSON.stringify(activeBuffs(actor).map((effect) => ({ ...effect, remainingMs: Number(effect.expiresAt) - now })));
}

// A real player's saved buff runs its time left from now. A bot's keeps its absolute expiry, so a
// stale row cannot bring back old buffs, and so does an entry without it (a cold snapshot).
function resumed(effect, now, resume) {
    if (!effect || typeof effect !== 'object' || !('remainingMs' in effect)) return effect;
    const { remainingMs, ...rest } = effect;
    const remaining = Number(remainingMs);
    if (!resume || !Number.isFinite(remaining)) return rest;
    return { ...rest, expiresAt: remaining > 0 ? now + remaining : 0 };
}

const isBot = (session) => String(session?.accountId || '').startsWith('bot_');

function parseEffects(value) {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string' || !value.trim()) return [];

    try {
        const effects = JSON.parse(value);
        return Array.isArray(effects) ? effects : [];
    } catch (_) {
        return [];
    }
}

function restoreEffects(session, actor, value, now = Date.now()) {
    const restored = [];
    const resume = !isBot(session);
    parseEffects(value).map((effect) => resumed(effect, now, resume)).forEach((effect) => {
        if (
            !effect ||
            effect.type === 'debuff' ||
            effect.toggle === true ||
            !effect.key ||
            !Number(effect.id) ||
            Number(effect.expiresAt) <= now
        ) {
            return;
        }

        const applied = EffectStore.apply(actor, effect);
        if (!applied) return;

        if (!actor.activeBuffs) actor.activeBuffs = {};
        actor.activeBuffs[applied.key] = applied.expiresAt;
        if (applied.dot) EffectTicker.applyDot(session, actor, actor, applied);
        if (applied.manaDot) EffectTicker.applyManaDot(session, actor, actor, applied);
        if (applied.manaHot) EffectTicker.applyManaHot(session, actor, actor, applied);
        if (applied.hot) EffectTicker.applyHot(session, actor, actor, applied);
        EffectTicker.scheduleExpiry(session, actor, applied);
        restored.push(applied);
    });
    return restored;
}

function savedVitals(actor) {
    const cp = actor?.model?.cp;
    return {
        hp: Number(actor.fetchHp()),
        mp: Number(actor.fetchMp()),
        cp: cp !== null && cp !== undefined && Number.isFinite(Number(cp)) ? Number(cp) : null
    };
}

function restoreVitals(actor, vitals) {
    const clamp = (value, maximum) => Math.max(0, Math.min(Number(value), Number(maximum)));

    if (Number.isFinite(vitals?.hp)) actor.setHp(clamp(vitals.hp, actor.fetchMaxHp()));
    if (Number.isFinite(vitals?.mp)) actor.setMp(clamp(vitals.mp, actor.fetchMaxMp()));
    if (Number.isFinite(vitals?.cp) && typeof actor.setCp === 'function') {
        actor.setCp(clamp(vitals.cp, actor.fetchMaxCp()));
    }
}

function persistenceRecord(actor) {
    return {
        hp: Number(actor.fetchHp()),
        mp: Number(actor.fetchMp()),
        cp: Number(actor.fetchCp?.()) || 0,
        effects: serializeEffects(actor),
        skillCooldowns: JSON.stringify(invoke('GameServer/Skills/SkillReuse').entries(actor))
    };
}

module.exports = {
    serializeEffects,
    parseEffects,
    restoreEffects,
    savedVitals,
    restoreVitals,
    persistenceRecord
};
