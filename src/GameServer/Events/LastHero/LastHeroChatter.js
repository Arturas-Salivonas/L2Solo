'use strict';

// After a Last Hero winner: a couple of dozen lines from the people who were there and the
// rest of the server, the way a crowd reacts. The fallen fighters talk in normal chat on the
// Coliseum floor; other bots of the world shout (!) and use trade chat (+). Some are glad,
// some salty, some after the money. [LastHero] winnerChat = false turns it off.
//
// Lines go straight to the real players (C4 Say2: 0 normal, 1 shout, 8 trade) with the bot's
// name, the way the server's own chat packets carry a speaker.

const CHANNEL = Object.freeze({ normal: 0, shout: 1, trade: 8 });

const LINES = Object.freeze({
    glad: ['gz {w}', 'GZ {w}!!', 'grats {w}', 'gg', 'gg wp', 'gz gz', 'congrats {w}', 'nice one {w}', 'wp {w}',
        'gz hero', '{w} o/', 'well played {w}', 'gz {w} u earned it', 'what a fight', 'gg all, that was fun'],
    salty: ['{w} cheated', 'rigged', 'hax', 'so lucky', 'report {w}', 'lag killed me', '3 ppl on me at once lol',
        'where were the healers', 'next time its mine', 'i was so close...', 'that was a bloodbath', 'who even is {w}',
        'gear check {w}', 'i want a rematch', 'got stunned and died, classic'],
    money: ['{w} share the {p}?', 'drinks on {w}', '{w} buy me a weapon pls', 'WTB {w} luck', '{p} for {w}, gz',
        '{w} is rich now', 'WTS tips how to win Last Hero, 1a', '{w} pls donate'],
    player: ['wtf {w}', '{w} too strong', 'lvl {l} vs us? cmon', '{w} hacker!!', 'see you next round {w}',
        '{w} carried by buffs', 'how is {w} that tanky'],
    winner: ['ty ty', 'gg all', 'ez', 'thx guys', 'gg wp everyone', 'who wants a rematch?']
});

const Response = () => invoke('GameServer/Network/Response');
const World = () => invoke('GameServer/World/World');

const isRealPlayer = (session) => !!session?.actor && !!session.socket && !String(session.accountId || '').startsWith('bot_');

function pickFrom(list, random) {
    return list[Math.floor(random() * list.length)];
}

// The world's bots (not the winner), as speakers: { id, name }.
function worldSpeakers(exclude, random, limit = 30) {
    const out = [];
    try {
        const states = invoke('GameServer/Bot/Population/BotLifeState').everyState() || [];
        for (let tries = 0; tries < limit * 3 && out.length < limit && states.length; tries++) {
            const state = states[Math.floor(random() * states.length)];
            const name = String(state?.name || state?.characterName || '');
            if (name && !exclude.has(name.toLowerCase())) { exclude.add(name.toLowerCase()); out.push({ id: Number(state.characterId) || 0, name }); }
        }
    } catch (error) {
        invoke('FailureLog')?.note?.('last_hero.chatter_names', error);
    }
    return out;
}

// The lines, in order: [{ speaker, channel, text }]. Pure: tests read it as it is.
function script({ winner, fallen = [], live = true, prize = '10kk', count = 24, random = Math.random, world = null }) {
    const used = new Set([String(winner.name).toLowerCase()]);
    const near = fallen.filter((entry) => entry.name && !used.has(entry.name.toLowerCase()))
        .sort(() => random() - 0.5).slice(0, Math.ceil(count * 0.45));
    near.forEach((entry) => used.add(entry.name.toLowerCase()));
    const far = world || worldSpeakers(used, random, count);
    const fill = (template) => template.replaceAll('{w}', winner.name).replaceAll('{p}', prize).replaceAll('{l}', String(winner.level));
    const pools = winner.kind === 'player'
        ? [[LINES.glad, 4], [LINES.salty, 3], [LINES.player, 3], [LINES.money, 2]]
        : [[LINES.glad, 5], [LINES.salty, 3], [LINES.money, 2]];
    const weighted = pools.flatMap(([list, weight]) => Array.from({ length: weight }, () => list));
    const lines = [];
    const said = new Set();
    const spoke = new Map();
    const speakers = [...(live ? near.map((entry) => ({ ...entry, channel: CHANNEL.normal })) : []),
        ...far.map((entry) => ({ ...entry, channel: random() < 0.55 ? CHANNEL.trade : CHANNEL.shout }))];
    if (!speakers.length) return lines;
    for (let tries = 0; lines.length < count && tries < count * 6; tries++) {
        const speaker = speakers[Math.floor(random() * speakers.length)];
        if ((spoke.get(speaker.name) || 0) >= 2 || lines.at(-1)?.speaker === speaker) continue;
        const text = fill(pickFrom(pickFrom(weighted, random), random));
        if (said.has(text)) continue;
        said.add(text);
        spoke.set(speaker.name, (spoke.get(speaker.name) || 0) + 1);
        lines.push({ speaker, channel: speaker.channel, text });
    }
    // A bot winner answers, once or twice, between the others.
    if (winner.kind === 'bot' && live) {
        const thanks = [...LINES.winner].sort(() => random() - 0.5).slice(0, 2);
        thanks.forEach((text, index) => lines.splice(Math.min(lines.length, 4 + index * 7), 0,
            { speaker: { id: winner.sourceId || 0, name: winner.name }, channel: CHANNEL.normal, text }));
    }
    return lines;
}

function send(line) {
    const speaker = { fetchId: () => Number(line.speaker.id) || 0, fetchName: () => line.speaker.name };
    const packet = Response().speak(speaker, { kind: line.channel, text: line.text });
    for (const session of World().user?.sessions || []) if (isRealPlayer(session)) session.dataSendToMe(packet);
}

// Plays the script: the first line a second after the winner, then one every 0.8 to 2.4 s.
function afterWin(options) {
    const random = options.random || Math.random;
    const lines = script({ ...options, random });
    let at = 1200;
    for (const line of lines) {
        const timer = setTimeout(() => {
            try { send(line); } catch (error) { invoke('FailureLog')?.note?.('last_hero.chatter', error); }
        }, at);
        timer.unref?.();
        at += 800 + Math.floor(random() * 1600);
    }
    return lines;
}

module.exports = { CHANNEL, LINES, script, afterWin };
