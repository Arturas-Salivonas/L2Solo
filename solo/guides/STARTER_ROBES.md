# Starter villages sell the C4 robe set (L2Solo fix)

A fix for [L2Solo](https://github.com/pmbstyle/L2Solo). The armor dealers in Talking Island (Jackson), the Elven Village (Payne) and the Dark Elven Village (Ariel) sold only fighter armor. Now they also sell the ten No-Grade robe pieces (tunics and stockings) at C4 prices, as the Orc and Dwarven villages already did.

- **Source:** two C4 server datapacks, L2J Lisvus and L2J Mobius C4.
- **Bot tables:** the branch carries rebuilt bot tables that match L2Solo `develop` of late November 2026. Without them your server may warn at start that the spot table is stale; it still plays fine.

## Install

### Let your AI agent do it

**Don't know how to install it?** Copy this into your AI coding agent (Claude Code, Cursor, Codex or similar) and fill in your folder. It checks your server is stopped, backs up your world first and tells you what it did.

```text
Please install the "Starter village robes" mod into my L2Solo server (a Lineage II C4 server, https://github.com/pmbstyle/L2Solo).
My L2Solo folder is: <your L2Solo folder>
Guide: https://github.com/Arturas-Salivonas/L2Solo/blob/fix/starter-village-robes/solo/guides/STARTER_ROBES.md

Rules:
- The server must be stopped first. If anything is listening on ports 2106 or 7777, ask me to stop it. Don't stop it yourself.
- Before changing anything, copy the tmp folder (my world and characters) to a backup folder outside the L2Solo folder.
- Don't change config/local.ini or anything inside tmp.
- Never use the launcher's Update or Verify buttons: they put the original files back.

Steps:
1. If the folder is a git repository (it has a .git folder), run there:
   git remote add l2mods https://github.com/Arturas-Salivonas/L2Solo.git   (skip it if l2mods already exists)
   git fetch l2mods
   git cherry-pick 27040e379..l2mods/fix/starter-village-robes
   If git asks who I am, set user.name and user.email for this repository only.
   If a cherry-pick says a commit is already there, run git cherry-pick --skip.
   If it stops on a conflict, run git cherry-pick --abort and tell me which files conflicted. Don't guess a fix.
2. If it's not a git repository (a launcher install):
   Download https://github.com/Arturas-Salivonas/L2Solo/compare/27040e379...fix/starter-village-robes.diff into the L2Solo folder as starter-robes.diff,
   then run git apply --check starter-robes.diff and, if that passes, git apply starter-robes.diff.
   This needs Git installed; if it isn't, ask me to install Git for Windows first. If the check fails, stop and tell me.
3. Run npm run check in the L2Solo folder and tell me the result.
4. Tell me what you did, and that I can start the server again with npm run start.
```

### Or do it yourself

Stop your server first. With a cloned L2Solo, run once in your L2Solo folder:

```
git remote add l2mods https://github.com/Arturas-Salivonas/L2Solo.git
git fetch l2mods
git cherry-pick 27040e379..l2mods/fix/starter-village-robes
```

No git clone? Save the patch <https://github.com/Arturas-Salivonas/L2Solo/compare/27040e379...fix/starter-village-robes.diff> in your L2Solo folder as `starter-robes.diff` and run `git apply starter-robes.diff`.

Restart the server after installing.

## Remove it

`git revert --no-edit 27040e379..l2mods/fix/starter-village-robes` (git), or `git apply -R starter-robes.diff` (patch). Your world and characters are never touched.

**Bugs or ideas:** open an issue on <https://github.com/Arturas-Salivonas/L2Solo>. All mods: [MODS.md](https://github.com/Arturas-Salivonas/L2Solo/blob/solo/solo/guides/MODS.md).

All credit for L2Solo goes to its authors (<https://github.com/pmbstyle/L2Solo>), under the same Apache 2.0 license.
