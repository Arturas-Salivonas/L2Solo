#!/usr/bin/env node
'use strict';

// World legacy by hand (src/GameServer/Bot/Legacy/WorldLegacy.js). A wipe from the launcher or
// `npm run wipe:bots` saves it by itself; this is for anything else (deleting the world file by
// hand, a backup before an experiment):
//   node scripts/world-legacy.js save    save the current world's legacy now (read-only; the server may run)
//   node scripts/world-legacy.js show    what the next world will get
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const { readDatabaseConfig } = require('./world-wipe');
const Legacy = require('../src/GameServer/Bot/Legacy/WorldLegacy');

const { databasePath } = readDatabaseConfig();
const folder = Legacy.dir(databasePath);
const command = process.argv[2] || 'show';

function show() {
    const legacy = Legacy.read(folder);
    if (!legacy) {
        console.log(`No world legacy in ${folder} yet. It is saved before every bot wipe, or with: node scripts/world-legacy.js save`);
        return;
    }
    const players = new Set(legacy.bots.flatMap(bot => (bot.feelings || []).map(feeling => feeling.player)));
    console.log(`World legacy of ${new Date(legacy.exportedAt).toISOString()} (${legacy.worlds || 1} world(s)) in ${folder}`);
    console.log(`  ${legacy.bots.length} bots will come back with their names, personas and know-how`);
    console.log(`  ${legacy.spots.length} spot lessons (what bots really earned per spot, class and level band)`);
    console.log(`  feelings toward ${players.size} player(s): ${[...players].slice(0, 8).join(', ') || 'none'}`);
    const veterans = [...legacy.bots].sort((a, b) => (b.worlds || 0) - (a.worlds || 0) || (b.level || 0) - (a.level || 0)).slice(0, 10);
    for (const bot of veterans) {
        console.log(`  ${bot.name.padEnd(16)} level ${String(bot.level).padStart(2)}  worlds ${bot.worlds}  ${bot.persona.archetype}`
            + `  kills ${bot.knowhow?.lifelongKills || 0}`);
    }
}

if (command === 'save') {
    if (!fs.existsSync(databasePath)) {
        console.error(`No world database at ${databasePath}.`);
        process.exitCode = 1;
    } else {
        const db = new DatabaseSync(databasePath, { readOnly: true });
        try {
            const saved = Legacy.saveBeforeWipe(db, 'all', { folder });
            console.log(saved ? `Saved ${saved.bots} bots and ${saved.spots} spot lessons to ${saved.file}` : 'This world has no generated bots to remember yet.');
        } finally { db.close(); }
        show();
    }
} else if (command === 'show') {
    show();
} else {
    console.error('Usage: node scripts/world-legacy.js save|show');
    process.exitCode = 1;
}
