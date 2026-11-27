// Bypass "last-hero <action>": the Last Hero chat window (src/GameServer/Events/LastHero/LastHeroWindow.js).
// NpcTalkResponse turns "last-hero" into this file name.
function lastHero(session, parts) {
    return invoke('GameServer/Events/LastHero/LastHeroWindow').chat(session, parts.slice(1));
}

module.exports = lastHero;
