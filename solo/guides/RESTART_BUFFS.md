# Buffs survive a server restart (L2Solo fix)

A bug fix for [L2Solo](https://github.com/pmbstyle/L2Solo). Stop the server, start it again, log in: your buffs are still there.

## What it fixes

- **Before:** a server stop never saved the players still online. Buffs, HP, MP and CP were saved only when you logged out, so after a restart you came back unbuffed, with your HP and MP from your last logout.
- **Now:** a stop saves every online player first.
- **Time left is kept, as in C4:** a saved buff keeps the time it had left, and the clock doesn't run while you're offline or the server is down. A 40-minute buff is still 40 minutes after a two-hour break.
- Bots are not affected: they keep their own saving rules.

## Install

### Let your AI agent do it

**Don't know how to install it?** Copy this into your AI coding agent (Claude Code, Cursor, Codex or similar) and fill in your folder. It checks your server is stopped, backs up your world first and tells you what it did.

```text
Please install the "Buffs survive a restart" mod into my L2Solo server (a Lineage II C4 server, https://github.com/pmbstyle/L2Solo).
My L2Solo folder is: <your L2Solo folder>
Guide: https://github.com/Arturas-Salivonas/L2Solo/blob/fix/shutdown-saves-player-status/solo/guides/RESTART_BUFFS.md

Rules:
- The server must be stopped first. If anything is listening on ports 2106 or 7777, ask me to stop it. Don't stop it yourself.
- Before changing anything, copy the tmp folder (my world and characters) to a backup folder outside the L2Solo folder.
- Don't change config/local.ini or anything inside tmp.
- Never use the launcher's Update or Verify buttons: they put the original files back.

Steps:
1. If the folder is a git repository (it has a .git folder), run there:
   git remote add l2mods https://github.com/Arturas-Salivonas/L2Solo.git   (skip it if l2mods already exists)
   git fetch l2mods
   git cherry-pick 27040e379..l2mods/fix/shutdown-saves-player-status
   If git asks who I am, set user.name and user.email for this repository only.
   If a cherry-pick says a commit is already there, run git cherry-pick --skip.
   If it stops on a conflict, run git cherry-pick --abort and tell me which files conflicted. Don't guess a fix.
2. If it's not a git repository (a launcher install):
   Download https://github.com/Arturas-Salivonas/L2Solo/compare/27040e379...fix/shutdown-saves-player-status.diff into the L2Solo folder as restart-buffs.diff,
   then run git apply --check restart-buffs.diff and, if that passes, git apply restart-buffs.diff.
   This needs Git installed; if it isn't, ask me to install Git for Windows first. If the check fails, stop and tell me.
3. Run npm run check in the L2Solo folder and tell me the result.
4. Tell me what you did, and that I can start the server again with npm run start.
```

### Or do it yourself

Stop your server first. With a cloned L2Solo, run once in your L2Solo folder:

```
git remote add l2mods https://github.com/Arturas-Salivonas/L2Solo.git
git fetch l2mods
git cherry-pick 27040e379..l2mods/fix/shutdown-saves-player-status
```

No git clone? Save the patch <https://github.com/Arturas-Salivonas/L2Solo/compare/27040e379...fix/shutdown-saves-player-status.diff> in your L2Solo folder as `restart-buffs.diff` and run `git apply restart-buffs.diff`.

Restart the server after installing.

## Remove it

`git revert --no-edit 27040e379..l2mods/fix/shutdown-saves-player-status` (git), or `git apply -R restart-buffs.diff` (patch). Your world and characters are never touched.

**Bugs or ideas:** open an issue on <https://github.com/Arturas-Salivonas/L2Solo>. All mods: [MODS.md](https://github.com/Arturas-Salivonas/L2Solo/blob/solo/solo/guides/MODS.md).

All credit for L2Solo goes to its authors (<https://github.com/pmbstyle/L2Solo>), under the same Apache 2.0 license.
