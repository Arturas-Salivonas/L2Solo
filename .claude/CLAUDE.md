# L2Solo fork - working rules

This folder is a fork of pmbstyle/L2Solo (Lineage II C4 server emulator, Node 22, SQLite) that the owner plays solo.
Read `solo/README.md` before any change. Bot AI map: `solo/docs/BOT_AI_MAP.md`. Game rules: `solo/docs/C4_REFERENCE.md`. Work list: `solo/BACKLOG.md`.

## Hard rules

- The play folder (repo root) stays on branch `solo`. Never `git switch` it to another branch, and never edit code in it directly.
- Every change happens in its own worktree. Create it with `node solo/fork.js new fix/<name>`, which makes `.work/fix-<name>` from `upstream/develop`. Edit and commit there.
- Land a change with `node solo/fork.js land <branch>` and sync upstream with `node solo/fork.js sync`. Both need the game server stopped. If it's running, ask the owner, never kill it.
- Never commit to `main` or `develop`; they mirror upstream. Never push to `upstream` (its push URL is disabled on purpose). Upstream PRs go through `node solo/fork.js pr <branch>`, and the owner presses Create.
- Never use the desktop launcher's server Update or Verify on this folder. It overwrites edited files.
- Never touch `tmp/` world databases, `config/local.ini` (API keys) or `data/Geodata`. Never run `git clean -x`.
- Stay in Chronicle 4. No features from C5, Interlude or later (check `solo/docs/C4_REFERENCE.md`, "NOT in C4").

## Writing changes

- Keep each branch PR-sized and upstream-shaped. Personal-taste tweaks go on `mine/...` branches.
- Put new behaviour in new files and hook it in with as few lines as possible. Don't reformat upstream code.
- Generated data tables come from `scripts/generate-*.js`. Edit the generator, not the output.
- Before landing: run `npm run check`, then the relevant `npm test -- --only=<name>` files (`tests/test_<name>.js`), from the change's worktree.
- Use plain hyphens, never em-dashes, in code comments, docs and commit messages.
