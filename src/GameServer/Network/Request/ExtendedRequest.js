const ReceivePacket = invoke('Packet/Receive');
const AutoSoulShot  = invoke('GameServer/Network/Request/AutoSoulShot');

// C4 multiplexes several requests behind opcode 0xD0. Route only the
// subcommands we implement; their payloads are not interchangeable.
function extendedRequest(session, buffer) {
    if (buffer.length < 3) {
        return;
    }

    const packet = new ReceivePacket(buffer);
    packet.readH();

    if (packet.data[0] === 5) {
        AutoSoulShot(session, buffer);
        return;
    }
    // Any other subcommand is logged with its bytes, the way an unknown opcode is (Opcodes), so a
    // client action the server ignores can be seen: e.g. whether the C4 client sends anything for
    // an Alt+click on its buff bar.
    utils.infoWarn('GameServer', 'unknown extended Opcode 0xd0:0x%s (%s)', utils.toHex(packet.data[0]),
        Buffer.from(buffer.subarray(0, 24)).toString('hex'));
}

module.exports = extendedRequest;
