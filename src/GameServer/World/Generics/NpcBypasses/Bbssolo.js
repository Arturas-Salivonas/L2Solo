// Bypass "_bbssolo <tab> <action> [arg]": the Solo Helper Community Board (src/GameServer/Solo/SoloHelper.js).
// NpcTalkResponse turns "_bbssolo" into this file name.
function bbssolo(session, parts) {
    return invoke('GameServer/Solo/SoloHelper').handleBoard(session, parts.slice(1));
}

module.exports = bbssolo;
