// Bypass "solo-buffer <action> [arg]": the solo helper buffer (src/GameServer/Solo/SoloBuffer.js).
function soloBuffer(session, parts) {
    return invoke('GameServer/Solo/SoloBuffer').handle(session, parts.slice(1));
}

module.exports = soloBuffer;
