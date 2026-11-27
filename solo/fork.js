#!/usr/bin/env node
'use strict';

// L2Solo fork helper. Keeps every edit of ours on git branches, so upstream
// updates can never silently overwrite it. Read solo/README.md first.
//
//   node solo/fork.js status              what is where (branches, worktrees, PRs, backups)
//   node solo/fork.js sync                back up the world, pull upstream, merge into solo
//   node solo/fork.js new <type/name>     start a change in its own worktree (.work/<type-name>)
//   node solo/fork.js land <type/name>    merge a finished change into solo (the play branch)
//   node solo/fork.js pr <type/name>      push a change and open the upstream PR page
//   node solo/fork.js drop <type/name>    remove a change's worktree (the branch stays)
//   node solo/fork.js backup [label]      copy the world + history databases out of the repo
//   node solo/fork.js restore <folder> --yes

const { spawnSync } = require('child_process');
const fs = require('fs');
const net = require('net');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PLAY = 'solo';
const BASE = 'upstream/develop';
const UPSTREAM_REPO = 'pmbstyle/L2Solo';
const UPSTREAM_BASE_BRANCH = 'develop';
const WORK_DIR = path.join(ROOT, '.work');
const TOPIC_RE = /^(fix|feat|perf|docs|mine)\/[a-z0-9][a-z0-9._-]*$/;
// Files that exist only in our fork; they must never reach an upstream PR.
const FORK_ONLY = [/^solo\//, /^\.github\/README\.md$/, /^\.claude\//];
const BACKUP_DIR = path.resolve(process.env.L2SOLO_BACKUP_DIR || path.join(ROOT, '..', 'L2Solo-backups'));
const KEEP_AUTO_BACKUPS = 10;

class Stop extends Error {
    constructor(message, code = 1) {
        super(message);
        this.code = code;
    }
}

const fail = (message, code = 1) => { throw new Stop(message, code); };
const log = (...lines) => console.log(lines.join('\n'));

// ---------- git ----------

function git(args, { cwd = ROOT, allowFail = false, inherit = false } = {}) {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8', stdio: inherit ? 'inherit' : 'pipe', maxBuffer: 64 * 1024 * 1024 });
    if (r.error) throw r.error;
    const out = (r.stdout || '').trim();
    const err = (r.stderr || '').trim();
    if (r.status !== 0 && !allowFail) fail(`git ${args.join(' ')} failed:\n${err || out}`);
    return { status: r.status, out, err };
}

const gitOut = (args, opts) => git(args, opts).out;
const refExists = ref => git(['rev-parse', '--verify', '--quiet', ref], { allowFail: true }).status === 0;
const isAncestor = (a, b) => git(['merge-base', '--is-ancestor', a, b], { allowFail: true }).status === 0;
const countRange = range => Number(gitOut(['rev-list', '--count', range]) || 0);
const currentBranch = (cwd = ROOT) => gitOut(['branch', '--show-current'], { cwd });

function assertRemotes() {
    const remotes = gitOut(['remote']).split(/\r?\n/);
    if (!remotes.includes('upstream') || !remotes.includes('origin')) {
        fail('Expected remotes "origin" (your fork) and "upstream" (pmbstyle/L2Solo). See solo/README.md.');
    }
}

function dirtyFiles(cwd = ROOT, { untracked = false } = {}) {
    const args = ['status', '--porcelain', untracked ? '--untracked-files=normal' : '--untracked-files=no'];
    return gitOut(args, { cwd }).split(/\r?\n/).filter(Boolean);
}

function assertClean(cwd = ROOT) {
    const dirty = dirtyFiles(cwd);
    if (dirty.length) {
        fail(`Uncommitted changes in ${cwd}:\n  ${dirty.join('\n  ')}\nCommit them (or git stash) first.`);
    }
}

function assertOnPlayBranch() {
    const branch = currentBranch();
    if (branch !== PLAY) fail(`The play folder is on "${branch || 'detached HEAD'}", expected "${PLAY}". Run: git switch ${PLAY}`);
}

function assertTopic(name) {
    if (!name) fail('Name the branch, e.g. fix/merchant-stall');
    if (!TOPIC_RE.test(name)) {
        fail(`"${name}" is not a topic branch name. Use fix/..., feat/..., perf/..., docs/... or mine/... (lowercase, dashes).\nmine/ = personal tweaks that never go upstream.`);
    }
}

function conflictStop(kind, cwd = ROOT) {
    const files = gitOut(['diff', '--name-only', '--diff-filter=U'], { cwd }).split(/\r?\n/).filter(Boolean);
    const next = kind === 'rebase'
        ? 'fix them, git add <file>, then git rebase --continue   (undo everything: git rebase --abort)'
        : 'fix them, git add <file>, then git commit              (undo everything: git merge --abort)';
    fail(`${kind} stopped on conflicts in ${cwd}:\n  ${files.join('\n  ') || '(see git status)'}\nNothing is lost. ${next}`, 2);
}

function forkOwner() {
    const url = gitOut(['remote', 'get-url', 'origin']);
    const m = url.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/);
    if (!m) fail(`Cannot read the fork owner from origin URL ${url}`);
    return { owner: m[1], repo: m[2] };
}

// ---------- worktrees ----------

function worktrees() {
    const list = [];
    let cur = null;
    for (const line of gitOut(['worktree', 'list', '--porcelain']).split(/\r?\n/)) {
        if (line.startsWith('worktree ')) {
            cur = { path: path.resolve(line.slice('worktree '.length)) };
            list.push(cur);
        } else if (cur && line.startsWith('branch ')) {
            cur.branch = line.slice('branch '.length).replace(/^refs\/heads\//, '');
        }
    }
    return list;
}

const worktreeOf = name => worktrees().find(w => w.branch === name) || null;
const worktreePathFor = name => path.join(WORK_DIR, name.replace(/\//g, '-'));

// Worktrees live inside the play folder, so Node finds the play folder's node_modules by
// walking up. Geodata (800 MB, git-ignored) is linked in, read-only use.
function linkGeodata(wt) {
    const target = path.join(ROOT, 'data', 'Geodata');
    const link = path.join(wt, 'data', 'Geodata');
    if (!fs.existsSync(target) || fs.existsSync(link)) return false;
    fs.mkdirSync(path.dirname(link), { recursive: true });
    fs.symlinkSync(target, link, 'junction');
    return true;
}

function unlinkGeodata(wt) {
    const link = path.join(wt, 'data', 'Geodata');
    let st;
    try { st = fs.lstatSync(link); } catch { return; }
    if (!st.isSymbolicLink()) fail(`${link} is a real folder, not a link to the play folder's geodata. Remove it by hand first.`);
    fs.unlinkSync(link);
}

function ensureExcluded() {
    const file = path.join(gitOut(['rev-parse', '--git-common-dir']), 'info', 'exclude');
    const abs = path.resolve(ROOT, file);
    const text = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : '';
    if (!/^\/\.work\/$/m.test(text)) {
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.appendFileSync(abs, `${text.endsWith('\n') || !text ? '' : '\n'}# L2Solo fork: change worktrees\n/.work/\n`);
    }
}

// ---------- config / world files ----------

function readIni(file) {
    const out = {};
    if (!fs.existsSync(file)) return out;
    let section = '';
    for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith(';') || line.startsWith('#')) continue;
        const head = line.match(/^\[(.+)\]$/);
        if (head) {
            section = head[1].trim();
            out[section] = out[section] || {};
            continue;
        }
        const eq = line.indexOf('=');
        if (eq < 0 || !section) continue;
        out[section][line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
    }
    return out;
}

function config() {
    const merged = readIni(path.join(ROOT, 'config', 'default.ini'));
    for (const [section, values] of Object.entries(readIni(path.join(ROOT, 'config', 'local.ini')))) {
        merged[section] = { ...(merged[section] || {}), ...values };
    }
    return merged;
}

// Mirrors src/HistoryStore.js pathFor(): the server runs with the repo root as cwd.
function worldFiles() {
    const db = config().Database || {};
    const world = path.resolve(ROOT, db.path || 'tmp/nodel2.sqlite');
    const history = db.historyPath
        ? path.resolve(ROOT, db.historyPath)
        : world.endsWith('.sqlite') ? `${world.slice(0, -'.sqlite'.length)}.history.sqlite` : `${world}.history.sqlite`;
    return { world, history };
}

function portOpen(port, host = '127.0.0.1', timeoutMs = 700) {
    return new Promise(resolve => {
        const sock = net.connect({ port, host });
        const done = value => { sock.destroy(); resolve(value); };
        sock.setTimeout(timeoutMs, () => done(false));
        sock.once('connect', () => done(true));
        sock.once('error', () => done(false));
    });
}

async function serverPort() {
    const c = config();
    for (const port of [Number(c.AuthServer?.port || 2106), Number(c.GameServer?.port || 7777)]) {
        if (await portOpen(port)) return port;
    }
    return 0;
}

async function assertStopped(what) {
    const port = await serverPort();
    if (port) fail(`The game server is running (port ${port} answers). Stop it in the launcher before you ${what}.`);
}

// ---------- backups ----------

function backupFolders() {
    if (!fs.existsSync(BACKUP_DIR)) return [];
    return fs.readdirSync(BACKUP_DIR, { withFileTypes: true })
        .filter(e => e.isDirectory() && fs.existsSync(path.join(BACKUP_DIR, e.name, 'backup.json')))
        .map(e => e.name)
        .sort()
        .reverse();
}

function backup(label = 'manual', { auto = false } = {}) {
    const { world, history } = worldFiles();
    if (!fs.existsSync(world)) {
        log(`No world database at ${world} yet, nothing to back up.`);
        return null;
    }
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
    const safe = String(label).replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'manual';
    const name = `${stamp}_${auto ? 'auto-' : ''}${safe}`;
    const dir = path.join(BACKUP_DIR, name);
    fs.mkdirSync(dir, { recursive: true });
    const files = [];
    for (const base of [world, history]) {
        for (const suffix of ['', '-wal', '-shm']) {
            const file = base + suffix;
            if (!fs.existsSync(file)) continue;
            fs.copyFileSync(file, path.join(dir, path.basename(file)));
            files.push(path.basename(file));
        }
    }
    const meta = {
        createdAt: new Date().toISOString(), label: safe, auto,
        branch: currentBranch(), commit: gitOut(['rev-parse', 'HEAD']), world, history, files
    };
    fs.writeFileSync(path.join(dir, 'backup.json'), `${JSON.stringify(meta, null, 2)}\n`);
    if (auto) {
        const autos = backupFolders().filter(n => n.includes('_auto-'));
        for (const old of autos.slice(KEEP_AUTO_BACKUPS)) fs.rmSync(path.join(BACKUP_DIR, old), { recursive: true, force: true });
    }
    return dir;
}

// ---------- commands ----------

async function cmdStatus() {
    assertRemotes();
    git(['fetch', 'upstream', '--quiet'], { allowFail: true });
    const branch = currentBranch();
    const port = await serverPort();
    const behind = refExists(BASE) && refExists(PLAY) ? countRange(`${PLAY}..${BASE}`) : 0;
    const ours = refExists(PLAY) ? countRange(`${BASE}..${PLAY}`) : 0;
    log(
        `Play folder : ${ROOT}`,
        `Branch      : ${branch || 'detached'}${branch === PLAY ? '' : `   <- expected ${PLAY}`}`,
        `Server      : ${port ? `running (port ${port})` : 'stopped'}`,
        `Uncommitted : ${dirtyFiles().length || 'none'}`,
        `solo        : ${ours} commit(s) of ours on top of upstream, ${behind} new upstream commit(s) to sync`
    );

    const prs = (() => {
        const r = spawnSync('gh', ['pr', 'list', '--repo', UPSTREAM_REPO, '--author', '@me', '--state', 'all', '--limit', '100',
            '--json', 'headRefName,state,number,url'], { cwd: ROOT, encoding: 'utf8' });
        if (r.status !== 0) return null;
        try { return JSON.parse(r.stdout); } catch { return null; }
    })();

    const topics = gitOut(['for-each-ref', '--format=%(refname:short)', 'refs/heads/']).split(/\r?\n/).filter(b => TOPIC_RE.test(b));
    log('', topics.length ? 'Changes:' : 'Changes: none yet (start one with: node solo/fork.js new fix/<name>)');
    for (const name of topics) {
        const wt = worktreeOf(name);
        const pushed = refExists(`refs/remotes/origin/${name}`)
            ? (gitOut(['rev-parse', name]) === gitOut(['rev-parse', `refs/remotes/origin/${name}`]) ? 'pushed' : 'push pending')
            : 'not pushed';
        const pr = prs?.find(p => p.headRefName === name);
        const bits = [
            `${countRange(`${BASE}..${name}`)} commit(s)`,
            isAncestor(name, PLAY) ? 'in solo' : 'NOT in solo',
            pushed,
            pr ? `PR #${pr.number} ${pr.state.toLowerCase()}` : (name.startsWith('mine/') ? 'personal' : 'no PR'),
            wt ? `worktree ${path.relative(ROOT, wt.path)}${dirtyFiles(wt.path).length ? ' (uncommitted edits)' : ''}` : ''
        ].filter(Boolean);
        log(`  ${name.padEnd(36)} ${bits.join(' | ')}`);
    }

    const backups = backupFolders();
    log('', `Backups     : ${backups.length} in ${BACKUP_DIR}${backups[0] ? ` (latest ${backups[0]})` : ''}`);
}

async function cmdSync(flags) {
    assertRemotes();
    assertOnPlayBranch();
    assertClean();
    await assertStopped('sync (the next start may migrate the world database)');

    const saved = backup('pre-sync', { auto: true });
    if (saved) log(`World backed up: ${saved}`);

    log('Fetching upstream and your fork...');
    git(['fetch', 'upstream', '--prune', '--quiet']);
    git(['fetch', 'origin', '--prune', '--quiet'], { allowFail: true });

    for (const b of ['main', 'develop']) {
        if (!refExists(`refs/heads/${b}`)) continue;
        if (isAncestor(b, `upstream/${b}`)) git(['branch', '-f', b, `upstream/${b}`]);
        else log(`  warning: local ${b} has commits that are not in upstream/${b}; left it alone (never commit to ${b}).`);
    }
    const mirror = git(['push', 'origin', 'upstream/main:refs/heads/main', 'upstream/develop:refs/heads/develop'], { allowFail: true });
    if (mirror.status !== 0) log(`  warning: could not refresh main/develop on your fork:\n  ${mirror.err.split(/\r?\n/).join('\n  ')}`);

    const before = gitOut(['rev-parse', 'HEAD']);
    const incoming = gitOut(['log', '--oneline', '--first-parent', `${PLAY}..${BASE}`]).split(/\r?\n/).filter(Boolean);
    if (!incoming.length) {
        log('solo already has everything from upstream/develop.');
    } else {
        log(`Merging ${incoming.length} upstream commit(s) into ${PLAY}:`, ...incoming.slice(0, 15).map(l => `  ${l}`),
            incoming.length > 15 ? `  ... and ${incoming.length - 15} more` : '');
        const merge = git(['merge', '--no-edit', BASE], { allowFail: true });
        if (merge.status !== 0) conflictStop('merge');
    }

    const changed = before === gitOut(['rev-parse', 'HEAD'])
        ? [] : gitOut(['diff', '--name-only', before, 'HEAD']).split(/\r?\n/).filter(Boolean);
    if (changed.some(f => f === 'package.json' || f === 'package-lock.json')) {
        log('Dependencies changed: npm ci');
        const r = spawnSync('npm ci', { cwd: ROOT, stdio: 'inherit', shell: true });
        if (r.status !== 0) fail('npm ci failed. Fix it before starting the server.');
    }

    if (changed.length && !flags['no-check']) {
        log('Running npm run check (syntax + tables)...');
        const r = spawnSync('npm run check', { cwd: ROOT, stdio: 'inherit', shell: true });
        if (r.status !== 0) fail('npm run check failed after the merge. solo was NOT pushed. Fix or undo with: git reset --hard ORIG_HEAD');
    }

    const push = git(['push', 'origin', PLAY], { allowFail: true });
    log(push.status === 0 ? `Pushed ${PLAY} to your fork.` : `warning: push failed:\n${push.err}`);
    git(['worktree', 'prune'], { allowFail: true });
    log('', 'Sync done. Start the server as usual. If the new code breaks your world: node solo/fork.js restore <backup folder> --yes');
}

async function cmdNew(name) {
    assertRemotes();
    assertTopic(name);
    ensureExcluded();
    const existing = worktreeOf(name);
    if (existing) {
        log(`${name} already has a worktree: ${existing.path}`);
        return;
    }
    const wt = worktreePathFor(name);
    if (fs.existsSync(wt)) fail(`${wt} exists but is not a worktree of ${name}. Move it away first.`);
    git(['fetch', 'upstream', '--quiet']);
    if (refExists(`refs/heads/${name}`)) {
        git(['worktree', 'add', wt, name]);
    } else if (refExists(`refs/remotes/origin/${name}`)) {
        git(['worktree', 'add', '--track', '-b', name, wt, `origin/${name}`]);
    } else {
        git(['worktree', 'add', '--no-track', '-b', name, wt, BASE]);
    }
    const linked = linkGeodata(wt);
    log(`Ready: ${name}`, `  folder : ${wt}`, `  based on ${BASE}${linked ? ', geodata linked from the play folder' : ''}`,
        '  Commit there, then: node solo/fork.js land ' + name);
}

async function cmdLand(name) {
    assertRemotes();
    assertTopic(name);
    if (!refExists(`refs/heads/${name}`)) fail(`No local branch ${name}.`);
    const wt = worktreeOf(name);
    if (wt && dirtyFiles(wt.path).length) fail(`${name} has uncommitted edits in ${wt.path}. Commit them first.`);
    assertOnPlayBranch();
    assertClean();
    await assertStopped('land a change (it rewrites files the server reads)');
    if (isAncestor(name, PLAY)) {
        log(`${name} is already in ${PLAY}.`);
    } else {
        const merge = git(['merge', '--no-ff', '--no-edit', '-m', `Land ${name} into ${PLAY}`, name], { allowFail: true });
        if (merge.status !== 0) conflictStop('merge');
        log(`Landed ${name} into ${PLAY}.`);
    }
    for (const ref of [PLAY, name]) {
        const r = git(['push', '-u', 'origin', ref], { allowFail: true });
        if (r.status !== 0) log(`warning: could not push ${ref}:\n${r.err}`);
    }
    log('Pushed to your fork. Restart the server to play with it.');
}

async function cmdPr(name, flags) {
    assertRemotes();
    assertTopic(name);
    if (name.startsWith('mine/')) fail('mine/ branches are personal and never go upstream. Rename it (git branch -m) if it should.');
    if (!refExists(`refs/heads/${name}`)) fail(`No local branch ${name}.`);
    git(['fetch', 'upstream', '--quiet']);

    let rebased = false;
    if (flags.rebase) {
        const wt = worktreeOf(name) || fail(`Rebase needs the change's worktree. Run: node solo/fork.js new ${name}`);
        assertClean(wt.path);
        const r = git(['rebase', BASE], { cwd: wt.path, allowFail: true });
        if (r.status !== 0) conflictStop('rebase', wt.path);
        rebased = true;
    } else if (git(['merge-tree', '--write-tree', BASE, name], { allowFail: true }).status !== 0) {
        fail(`${name} conflicts with the latest upstream develop. Run: node solo/fork.js pr ${name} --rebase`);
    }

    const files = gitOut(['diff', '--name-only', `${BASE}...${name}`]).split(/\r?\n/).filter(Boolean);
    if (!files.length) fail(`${name} has no changes compared to ${BASE}.`);
    const forkOnly = files.filter(f => FORK_ONLY.some(re => re.test(f)));
    if (forkOnly.length) fail(`${name} touches fork-only files that must not go upstream:\n  ${forkOnly.join('\n  ')}`);

    const push = git(['push', ...(rebased ? ['--force-with-lease'] : []), '-u', 'origin', name], { allowFail: true });
    if (push.status !== 0) fail(`Push failed:\n${push.err}`);

    const commits = gitOut(['log', '--oneline', `${BASE}..${name}`]).split(/\r?\n/).filter(Boolean);
    const { owner, repo } = forkOwner();
    const url = `https://github.com/${UPSTREAM_REPO}/compare/${UPSTREAM_BASE_BRANCH}...${owner}:${repo}:${name}?expand=1`;
    log(`${name}: ${commits.length} commit(s), ${files.length} file(s), pushed to your fork.`,
        ...commits.map(c => `  ${c}`),
        '', 'Open this page, check the diff, write the description, then press "Create pull request":', `  ${url}`);
    if (!flags['no-open']) {
        const opener = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
            : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
        spawnSync(opener[0], opener[1], { stdio: 'ignore' });
    }
}

async function cmdDrop(name) {
    assertTopic(name);
    const wt = worktreeOf(name) || fail(`${name} has no worktree.`);
    const dirty = dirtyFiles(wt.path, { untracked: true });
    if (dirty.length) fail(`${wt.path} still has edits or new files:\n  ${dirty.join('\n  ')}\nCommit or delete them first.`);
    if (!refExists(`refs/remotes/origin/${name}`) || gitOut(['rev-parse', name]) !== gitOut(['rev-parse', `refs/remotes/origin/${name}`])) {
        log(`note: ${name} is not pushed to your fork yet. The branch stays in this repo either way.`);
    }
    unlinkGeodata(wt.path);
    // Only ignored files (test databases, logs) are left at this point.
    git(['worktree', 'remove', '--force', wt.path]);
    log(`Removed the worktree of ${name}. The branch is kept.`);
}

async function cmdBackup(label) {
    await assertStopped('back up (a running server keeps writing; the copy would not be consistent)');
    const dir = backup(label || 'manual');
    if (dir) log(`Backed up to ${dir}`);
}

async function cmdRestore(folder, flags) {
    if (!folder) fail('Name the backup folder. List them with: node solo/fork.js status');
    const dir = path.isAbsolute(folder) ? folder : path.join(BACKUP_DIR, folder);
    const metaFile = path.join(dir, 'backup.json');
    if (!fs.existsSync(metaFile)) fail(`${dir} is not a backup made by this tool.`);
    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    if (!flags.yes) {
        fail(`This replaces the current world with ${path.basename(dir)} (made ${meta.createdAt} on ${meta.branch} @ ${String(meta.commit).slice(0, 9)}).\nThe current world is backed up first. Add --yes to go ahead.`);
    }
    await assertStopped('restore a world');
    const current = backup('pre-restore', { auto: true });
    if (current) log(`Current world backed up: ${current}`);
    const { world, history } = worldFiles();
    for (const base of [world, history]) {
        for (const suffix of ['-wal', '-shm', '']) fs.rmSync(base + suffix, { force: true });
        for (const suffix of ['', '-wal', '-shm']) {
            const src = path.join(dir, path.basename(base) + suffix);
            if (fs.existsSync(src)) fs.copyFileSync(src, base + suffix);
        }
    }
    log(`Restored ${path.basename(dir)}.`,
        `It was made on commit ${String(meta.commit).slice(0, 9)}. Code newer than the backup migrates it forward on start; older code may refuse it.`);
}

function help() {
    log(fs.readFileSync(__filename, 'utf8').split(/\r?\n/).slice(3, 15).map(l => l.replace(/^\/\/ ?/, '')).join('\n'));
}

function parseArgs(argv) {
    const flags = {};
    const rest = [];
    for (const a of argv) {
        if (a.startsWith('--')) flags[a.slice(2)] = true;
        else rest.push(a);
    }
    return { cmd: rest[0] || 'help', arg: rest[1], flags };
}

async function main() {
    const { cmd, arg, flags } = parseArgs(process.argv.slice(2));
    const commands = {
        status: () => cmdStatus(),
        sync: () => cmdSync(flags),
        new: () => cmdNew(arg),
        land: () => cmdLand(arg),
        pr: () => cmdPr(arg, flags),
        drop: () => cmdDrop(arg),
        backup: () => cmdBackup(arg),
        restore: () => cmdRestore(arg, flags),
        help: () => help()
    };
    if (!commands[cmd]) fail(`Unknown command "${cmd}". Run: node solo/fork.js help`);
    await commands[cmd]();
}

main().catch(error => {
    if (error instanceof Stop) {
        console.error(error.message);
        process.exit(error.code);
    }
    console.error(error);
    process.exit(1);
});
