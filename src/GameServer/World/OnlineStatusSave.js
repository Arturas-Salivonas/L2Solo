'use strict';
// A server stop saves every online player's status first: HP, MP, CP, buffs and skill cooldowns
// (Session.persistCharacterStatus, CharacterStatus.persistenceRecord).
// That save ran only on logout, restart and a dropped connection. A stop flushes the buffered
// character writes and closes the database while the players are still in the world, so their
// buffs were never written and the next login started with none.
// NodeL2's shutdown drain runs saveAll as its first step, before the final flush and close.
// Bots are left out: their state goes through the cold population's own drain.

const isBot = (session) => String(session?.accountId || '').startsWith('bot_');

// Saves the status of every real player in the world; resolves with how many were saved.
function saveAll(World = invoke('GameServer/World/World')) {
    const sessions = (World.user?.sessions || []).filter((session) => session?.actor?.fetchId && !isBot(session));
    return Promise.all(sessions.map((session) => Promise.resolve()
        .then(() => session.persistCharacterStatus?.({ currentOnly: true }))
        .catch((error) => utils.infoWarn('Shutdown', 'status save failed for %s: %s',
            session.characterName || session.actor?.fetchName?.() || '?', error.message))))
        .then(() => sessions.length);
}

module.exports = { saveAll };
