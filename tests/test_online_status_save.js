'use strict';
const assert = require('assert');

require('../src/Global');

// A server stop saves the online players' status (OnlineStatusSave), and a saved buff keeps the
// time it had left (CharacterStatus): the next login finds the buffs it logged out with.

const CharacterStatus = invoke('GameServer/Actor/CharacterStatus');
const OnlineStatusSave = invoke('GameServer/World/OnlineStatusSave');
const EffectStore = invoke('GameServer/Effects/EffectStore');

const HOUR = 3600000;
const actor = () => ({ effects: {}, activeBuffs: {} });
const might = (expiresAt) => ({ key: 'might', id: 1068, level: 3, type: 'buff', stats: { pAtkMul: 1.15 }, durationMs: HOUR, expiresAt });

// ---------- the time left is kept ----------
{
    const saved = actor();
    EffectStore.apply(saved, might(Date.now() + 40 * 60000));
    const stored = CharacterStatus.serializeEffects(saved);
    const [entry] = JSON.parse(stored);
    assert.ok(Math.abs(entry.remainingMs - 40 * 60000) < 2000, 'a saved buff records the time it has left');

    // The server is down for two hours: a player's buff still has its 40 minutes.
    const later = Date.now() + 2 * HOUR;
    const player = actor();
    const restored = CharacterStatus.restoreEffects({ accountId: 'player1' }, player, stored, later);
    assert.strictEqual(restored.length, 1, 'the buff comes back after a long stop');
    assert.ok(Math.abs(restored[0].expiresAt - (later + 40 * 60000)) < 2000, 'with the 40 minutes it had left');
    assert.ok(!('remainingMs' in restored[0]), 'the saved field does not stay on the live effect');

    // A bot keeps the absolute expiry: an old row cannot bring back stale buffs.
    const bot = actor();
    assert.strictEqual(CharacterStatus.restoreEffects({ accountId: 'bot_pop_1' }, bot, stored, later).length, 0, 'a bot does not');
    const soon = CharacterStatus.restoreEffects({ accountId: 'bot_pop_1' }, actor(), stored, Date.now() + 60000);
    assert.strictEqual(soon.length, 1, 'a bot back within the time keeps its buff');
    assert.ok(Math.abs(soon[0].expiresAt - (Date.now() + 40 * 60000)) < 2000, 'at its old expiry');

    // A saved buff with no time left, and an old row with no remainingMs: as before.
    const spent = JSON.stringify([{ ...might(Date.now() + 60000), remainingMs: 0 }]);
    assert.strictEqual(CharacterStatus.restoreEffects({ accountId: 'player1' }, actor(), spent).length, 0, 'no time left, no buff');
    const legacy = JSON.stringify([might(Date.now() + 60000)]);
    assert.strictEqual(CharacterStatus.restoreEffects({ accountId: 'player1' }, actor(), legacy).length, 1, 'an old row still restores');
    assert.strictEqual(CharacterStatus.restoreEffects({ accountId: 'player1' }, actor(), JSON.stringify([might(Date.now() - 1000)])).length, 0,
        'an old row that expired does not');
}

// ---------- the stop saves every online player ----------
(async () => {
    const saved = [];
    const session = (accountId, name, fail = false) => ({
        accountId,
        characterName: name,
        actor: { fetchId: () => 1, fetchName: () => name },
        persistCharacterStatus(options) {
            if (fail) throw new Error('disk full');
            saved.push([name, options]);
            return Promise.resolve();
        }
    });
    const World = { user: { sessions: [session('player1', 'Arturas'), session('bot_pop_1', 'Bot'), session('player2', 'Broken', true),
        { accountId: 'player3' }] } };
    const warn = utils.infoWarn;
    const warnings = [];
    utils.infoWarn = (...args) => warnings.push(args);
    try {
        assert.strictEqual(await OnlineStatusSave.saveAll(World), 2, 'the two real players in the world');
    } finally {
        utils.infoWarn = warn;
    }
    assert.deepStrictEqual(saved, [['Arturas', { currentOnly: true }]], 'a player is saved, a bot is not');
    assert.ok(warnings.some((args) => args.includes('Broken')), 'one failed save is logged and the others still run');
    assert.strictEqual(await OnlineStatusSave.saveAll({ user: {} }), 0, 'nobody online');

    const NodeL2 = require('fs').readFileSync(require('path').join(__dirname, '../src/NodeL2.js'), 'utf8');
    const steps = NodeL2.slice(NodeL2.indexOf('const steps = ['));
    assert.ok(steps.indexOf("'online player status'") < steps.indexOf("'cold simulation drain'"),
        'the shutdown drain saves the players first');
    console.log('Online status save checks passed');
})().catch((error) => { console.error(error); process.exit(1); });
