#!/usr/bin/env node
'use strict';

// One click to play (fork-only). Opens upstream's browser launcher (scripts/start.js)
// in this window and presses its Start, with the rate you last picked there (x1/x10/x50,
// saved in tmp/launcher-settings.json).
//
// Geodata needs no separate step: every server start runs scripts/run-server.js, which
// checks data/Geodata first (the same code as `npm run geodata`) and downloads it only
// when it is missing or damaged.
//
// Stop the server with the launcher's Stop button or Ctrl+C here: both drain the world
// database before it exits. Do not just close this window while the server runs: the
// game server (src/NodeL2.js) has no handler for the console-close event, so Windows
// kills it before it saves recent progress.

const http = require('http');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HOST = process.env.L2NODE_LAUNCHER_HOST || '127.0.0.1';
const PORT = Number(process.env.L2NODE_LAUNCHER_PORT || 8090);
const URL = `http://${HOST}:${PORT}/`;

function api(method, route) {
    return new Promise((resolve, reject) => {
        const request = http.request({ host: HOST, port: PORT, path: route, method, timeout: 3000,
            headers: method === 'POST' ? { 'Content-Type': 'application/json', 'Content-Length': 2 } : {} }, (response) => {
            let body = '';
            response.setEncoding('utf8');
            response.on('data', (chunk) => { body += chunk; });
            response.on('end', () => {
                try { resolve({ status: response.statusCode, json: body ? JSON.parse(body) : {} }); }
                catch (error) { reject(new Error(`launcher answered ${route} with ${response.statusCode}: ${body.slice(0, 120)}`)); }
            });
        });
        request.on('timeout', () => request.destroy(new Error(`launcher did not answer ${route}`)));
        request.on('error', reject);
        // An empty JSON body: the launcher then uses its saved rate.
        request.end(method === 'POST' ? '{}' : undefined);
    });
}

async function waitForLauncher(limitMs = 20000) {
    const until = Date.now() + limitMs;
    while (Date.now() < until) {
        try {
            const status = await api('GET', '/api/status');
            if (status.status === 200) return status.json;
        } catch { /* not listening yet */ }
        await new Promise((resolve) => setTimeout(resolve, 300));
    }
    throw new Error(`the launcher did not come up on ${URL} within ${limitMs / 1000} s`);
}

async function pressStart() {
    const result = await api('POST', '/api/start');
    if (result.status !== 200) throw new Error(result.json?.error || `start failed with ${result.status}`);
    return result.json;
}

function openBrowser() {
    if (process.env.L2NODE_NO_BROWSER === '1') return;
    const { spawn } = require('child_process');
    const [command, args] = process.platform === 'win32' ? ['cmd.exe', ['/c', 'start', '', URL]]
        : process.platform === 'darwin' ? ['open', [URL]] : ['xdg-open', [URL]];
    spawn(command, args, { detached: true, stdio: 'ignore' }).unref();
}

async function main() {
    // A launcher already open (an earlier Play, or npm start): use it.
    const running = await api('GET', '/api/status').catch(() => null);
    if (running?.status === 200) {
        const state = await pressStart();
        console.log(`L2Solo :: the launcher was already open; server ${state.phase || 'starting'} at ${state.progressionRate || 'the saved rate'}.`);
        openBrowser();
        return;
    }

    process.chdir(ROOT);
    require(path.join(ROOT, 'scripts', 'start.js'));
    await waitForLauncher();
    const state = await pressStart();
    console.log(`L2Solo :: server ${state.phase || 'starting'} at ${state.progressionRate || 'the saved rate'}. Launcher: ${URL}`);
    console.log('L2Solo :: to stop, use the launcher\'s Stop button or press Ctrl+C here. Don\'t just close this window.');
}

main().catch((error) => {
    console.error(`L2Solo :: ${error.message}`);
    process.exitCode = 1;
});
