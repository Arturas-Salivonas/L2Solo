const World         = invoke('GameServer/World/World');
const ReceivePacket = invoke('Packet/Receive');

function askForTeamUp(session, buffer) {
    const packet = new ReceivePacket(buffer);

    packet
        .readS()  // Name
        .readD(); // Distribution

    consume(session, {
                name: packet.data[0],
        distribution: packet.data[1],
    });
}

function consume(session, data) {
    // Last Hero is everyone for themselves: no party while you are in it or queued for it.
    if (invoke('GameServer/Events/LastHero/LastHero').partyBlocked(session)) {
        const ServerResponse = invoke('GameServer/Network/Response');
        session.dataSendToMe(ServerResponse.systemMessage.text('No parties during Last Hero.'));
        session.dataSendToMe(ServerResponse.actionFailed());
        return;
    }
    if (!invoke('GameServer/Bot/AI/PartyCompanionService').syncClientDistribution(session, data.distribution)) return;
    World.askForTeamUp(session, session.actor, data);
}

module.exports = askForTeamUp;
