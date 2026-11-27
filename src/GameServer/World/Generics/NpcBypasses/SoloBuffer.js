// Bypass "solo-buffer <action> [arg]": the Solo Buffer in the small chat window
// ([SoloHelper] window = chat; src/GameServer/Solo/SoloBuffer.js).
function soloBuffer(session, parts) {
    return invoke('GameServer/Solo/SoloBuffer').chatHandle(session, parts.slice(1));
}

module.exports = soloBuffer;
