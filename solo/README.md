# L2Solo - our fork

Personal fork of [pmbstyle/L2Solo](https://github.com/pmbstyle/L2Solo) (Lineage II C4 solo server with bots).
Goal: play solo, fix bugs, make bots smarter, and send the good parts back upstream as PRs.

Everything fork-specific lives in this `solo/` folder (plus `.claude/` and `.github/README.md`).
Upstream never has these paths, so their updates cannot conflict with them.

## Why our work can't get lost

| Risk | What protects us |
| --- | --- |
| Upstream update overwrites our edits | Updates come in as a **git merge** into `solo`. Our commits stay; a clash stops as a visible conflict, never a silent overwrite. |
| Desktop launcher "Update / Verify server" | It replaces changed release files, git or not. **Never use it on this folder.** Start the server with `npm start` (browser launcher, port 8090) or the desktop launcher's Start only. If it ever happens: `git status` shows the damage, `git restore .` puts our committed work back. |
| PC dies / folder deleted | Every branch is pushed to `github.com/Arturas-Salivonas/L2Solo`. |
| An update's DB migration breaks the world | `sync` backs up the world first, outside the repo (`..\L2Solo-backups`). `restore` puts it back. |
| Editing code under a running server | Changes are built in separate worktrees (`.work/`). The play folder only changes on `land` and `sync`, and both refuse while the server runs. |

## Layout

```
Downloads\L2Solo\              play folder, always on branch "solo"
  solo\                        fork-only: tool, docs, backlog
  .work\fix-something\         one worktree per change (git-ignored, local only)
  tmp\nodel2.sqlite            your world (git-ignored, git never touches it)
  config\local.ini             your settings + API keys (git-ignored, never committed)
Downloads\L2Solo-backups\      world backups made by the tool
```

## Branches

| Branch | What it is | Rule |
| --- | --- | --- |
| `main`, `develop` | Exact mirrors of upstream | Never commit here. `sync` refreshes them. |
| `solo` | What we play: upstream `develop` + all our landed changes | Only `sync` and `land` change it. |
| `fix/...`, `feat/...`, `perf/...`, `docs/...` | One change each, cut from upstream `develop` | Small and focused, so it can become a PR as is. |
| `mine/...` | Personal tweaks upstream wouldn't want | Landed into `solo`, never PR'd (the tool refuses). |

Upstream takes PRs into `develop` (PRs aimed at `main` get closed). Their `develop` is merged into `main` for each release, roughly weekly.

## Starting the game

**Double-click `solo\Play L2Solo.cmd`** (or run `node solo/play.js`). It opens the browser launcher and presses Start with the rate you last picked there. To start it from the desktop: right-click the file, Send to, Desktop (create shortcut).

**Stop** with the launcher's **Stop** button, **Ctrl+C** in that window, or by closing the window. All three save the world first (closing the window needed `fix/console-close-drain`, which is in `solo`; upstream still loses progress there).

| Command | What it does |
| --- | --- |
| `solo\Play L2Solo.cmd` | Launcher plus an automatic Start: one click |
| `npm start` | The same browser launcher (port 8090), where you press Start yourself |
| `npm run NodeL2` | The server only, no launcher. **It ignores the launcher's rate** and uses `[General] progressionPreset` in `config/local.ini`, which is x1 unless set |
| `npm run geodata` | Only checks or downloads geodata. You never need it: every start does this first |

**How geodata works:** every server start runs `scripts/run-server.js`, which checks `data/Geodata` (141 regions, about 800 MB) before the game server starts.
- If the files match the pinned manifest's fingerprint, it passes in milliseconds (`Startup :: ready: 141 region files` in the log).
- If they're missing or damaged, it downloads `geodata-c4-client-20261027.zip` from l2solo.com, checks every file's SHA-256 and unpacks it.
- `npm run geodata` runs the same check by hand, for example to download ahead of time.

## Daily commands

Run from the play folder (`C:\Users\Arturas\Downloads\L2Solo`):

```
node solo/fork.js status                 where everything stands
node solo/fork.js sync                   get upstream's latest into solo (server stopped)
node solo/fork.js new fix/short-name     start a change in .work\fix-short-name
node solo/fork.js land fix/short-name    put a finished change into solo (server stopped)
node solo/fork.js pr fix/short-name      push it and open the upstream PR page (you press Create)
node solo/fork.js drop fix/short-name    delete the change's worktree, keep the branch
node solo/fork.js backup before-raid     manual world backup (server stopped)
node solo/fork.js restore <folder> --yes put a backup back (current world is backed up first)
```

`pr` never creates the PR itself. It pushes the branch to the fork and opens GitHub's compare page so you read the diff and press the button. It refuses `mine/` branches and anything that touches `solo/`, `.claude/` or `.github/README.md`.
If upstream moved on and the branch clashes, `pr <name> --rebase` replays it on their latest `develop`.

## Keeping merges painless

- **Put new behaviour in new files** and hook it in with a few lines. Upstream edits the big files (`BotAI.js`, `HuntingState.js`, `Database.js`) all the time, and every line we change there can clash.
- **Don't reformat or reorder upstream code.** Touch only the lines the change needs.
- **Tunables go in `config/local.ini`**, not `default.ini`, when they're just our taste (rates, bot counts, PvP aggression).
- **Generated tables** (`data/Bots/*.json`, spot and hunt tables) come from `scripts/generate-*.js`. Change the generator, then regenerate, or upstream's next regen wipes the edit.
- **Send good fixes upstream early.** Once merged there, they're upstream's code to maintain and stop being a merge risk for us.

## Checks before landing

```
npm run check                            syntax + data tables (fast)
npm test -- --only=bot_class_policy      one test file (tests/test_<name>.js)
npm test                                 everything (1,300+ files, slow; their CI shards it 12 ways)
```

A GitHub Actions trick from upstream: pushing a branch named `tests/<name>/<a,b,c>` to the fork runs those test files in CI (free for public repos).

## Fork features (in `solo`)

### Solo Helper (Alt+B) - branch `mine/solo-buffer`
- **Open it** with **Alt+B** or by typing `.buffer` in chat. It opens the full-width Community Board with tabs: **Buffer** and **Market Board** (the board Alt+B used to open).
- **Buffer tab:**
  - **Status:** your buff count (x/20), and an Active strip with the icons of your current buffs.
  - **Presets** as skill-icon tiles: Tank, Fighter, Mage, Support, My class (picked for your class) and My set.
  - **Any buff:** 85 C4 buffs at their max level, in 7 tabs (Prophet, Resists, Chants, Overlord, Dances, Songs, 3rd class). Click the icon or the name; active ones show green with the minutes left.
  - **Buttons:** Save as My set, Buff my servitor (shown when one is out) and Clear my buffs (debuffs stay).
- **Duration:** every buff lasts 60 minutes and survives relogin. C4's 20-slot limit applies; when you're full, your oldest buff makes room.
- **Adding a tool:** add a `TABS` row and a renderer in `src/GameServer/Solo/SoloHelper.js`.

Settings go in `config/local.ini`, and all of them are optional:
```
[SoloHelper]
enabled = true        ; false turns the helper off (Alt+B = Market Board)
altB = true           ; false = Alt+B opens the Market Board again (.buffer still works)
buffMinutes = 60      ; 1-1440
window = board        ; chat = the old small chat window instead of the Community Board
```

## Docs

- [docs/C4_REFERENCE.md](docs/C4_REFERENCE.md) - Lineage II up to Chronicle 4: classes, play styles, zones, grades, economy, PvP, raids
- [docs/BOT_AI_MAP.md](docs/BOT_AI_MAP.md) - how the bot AI is wired: hot and cold, states, planner, class tactics, tests
- [BACKLOG.md](BACKLOG.md) - bugs and bot ideas, with what's been checked
