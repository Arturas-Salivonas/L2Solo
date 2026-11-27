'use strict';

// C4 ShowBoard (server packet 0x6e): opens the Community Board window (Alt+B).
//
// Layout as in L2J's C4-era ShowBoard: a show flag, the eight top-button
// bypasses (home, favorite, region, clan, memo, mail, friends, add favorite),
// then "<id>\b<html>" as one UTF-16 string. A page goes out as three parts with
// ids 101, 102 and 103, which the client joins before parsing. Each part stays
// under 4090 characters (L2J CommunityBoard.separateAndSend), so one page holds
// fewer than 12270.

const SendPacket = invoke('Packet/Send');

const PART_LENGTH = 4090;
const MAX_LENGTH = PART_LENGTH * 3;
const PART_IDS = Object.freeze(['101', '102', '103']);
const TOP_BUTTONS = 8;

function packet(id, html, topBypasses) {
    const out = new SendPacket(0x6e).writeC(0x01);
    for (let i = 0; i < TOP_BUTTONS; i++) out.writeS(String(topBypasses[i] || ''));
    out.writeS(`${id}\u0008${html || ''}`);
    return out.fetchBuffer();
}

function split(html) {
    const source = String(html || '');
    if (source.length >= MAX_LENGTH) {
        throw new Error(`community board page is ${source.length} chars, the C4 limit is under ${MAX_LENGTH}`);
    }
    return PART_IDS.map((id, index) => [id, source.slice(index * PART_LENGTH, (index + 1) * PART_LENGTH)]);
}

function packets(html, topBypasses = []) {
    return split(html).map(([id, part]) => packet(id, part, topBypasses));
}

module.exports = { PART_LENGTH, MAX_LENGTH, PART_IDS, split, packet, packets };
