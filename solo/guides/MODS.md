# L2Solo mods: take only what you want

Every modification of this fork is its own branch, cut from the same L2Solo commit (`27040e379`). You can install one, several, or all of them, in any order, on L2Solo `main` or `develop`.

Each one was checked on both: installed alone, and all ten together. All of them stay in Chronicle 4, and none touches your world or characters.

## How to install

### Let your AI agent do it

**Don't know how to install it?** Copy this into your AI coding agent (Claude Code, Cursor, Codex or similar) and fill in your folder. It checks your server is stopped, backs up your world first and tells you what it did. Put the mod's branch from the list below in the second line.

```text
Please install a mod into my L2Solo server (a Lineage II C4 server, https://github.com/pmbstyle/L2Solo).
My L2Solo folder is: <your L2Solo folder>
The mod's branch: <branch from the list, e.g. feat/living-bots>
Mod list: https://github.com/Arturas-Salivonas/L2Solo/blob/solo/solo/guides/MODS.md

Rules:
- The server must be stopped first. If anything is listening on ports 2106 or 7777, ask me to stop it. Don't stop it yourself.
- Before changing anything, copy the tmp folder (my world and characters) to a backup folder outside the L2Solo folder.
- Don't change config/local.ini or anything inside tmp.
- Never use the launcher's Update or Verify buttons: they put the original files back.

Steps:
1. If the folder is a git repository (it has a .git folder), run there:
   git remote add l2mods https://github.com/Arturas-Salivonas/L2Solo.git   (skip it if l2mods already exists)
   git fetch l2mods
   git cherry-pick 27040e379..l2mods/<branch>
   If git asks who I am, set user.name and user.email for this repository only.
   If a cherry-pick says a commit is already there, run git cherry-pick --skip.
   If it stops on a conflict, run git cherry-pick --abort and tell me which files conflicted. Don't guess a fix.
2. If it's not a git repository (a launcher install): download the mod's patch link from the mod list into the L2Solo folder,
   run git apply --check on it and, if that passes, git apply. This needs Git installed; if it isn't, ask me to install
   Git for Windows first. If the check fails, stop and tell me.
3. Run npm run check in the L2Solo folder and tell me the result.
4. Tell me what you did, and that I can start the server again with npm run start.
```

### Or do it yourself

Stop your server first.

**With git (a cloned L2Solo, the easiest)**, run once in your L2Solo folder:
```
git remote add l2mods https://github.com/Arturas-Salivonas/L2Solo.git
git fetch l2mods
```
Then, for each mod you want, the cherry-pick line its section below shows, for example:
```
git cherry-pick 27040e379..l2mods/feat/living-bots
```
If git asks who you are, run `git config user.name "you"` and `git config user.email "you@example.com"` once, then the cherry-pick again.

**As a patch file:**
1. Open the mod's patch link and save the file in your L2Solo folder, for example as `living-bots.diff`.
2. Run `git apply -3 living-bots.diff`. The `-3` lets several mods' patches stack.
3. On a launcher install without git history, plain `git apply living-bots.diff` works for one mod.

**Remove a mod:** `git revert --no-edit 27040e379..l2mods/<branch>` (with git), or `git apply -R <file>.diff` (patch).

**Settings** go in `config/local.ini`, which you create if it's missing. Every mod works with its defaults.

Restart the server after installing.

---

## The mods

Each mod's guide lives in its own branch, with screenshots, a copy-paste prompt for your AI agent, settings and how to remove it.

### Solo Helper: 1-hour buffs, Adena and class change on Alt+B
- **What:** Alt+B opens a buffer with 89 C4 buffs (the 4 summoner servitor buffs included) and presets; every buff lasts 60 minutes. Full HP/MP/CP in one click, an Adena tab, a Class tab (change class at 20, 40 and 76 from the C4 class tree), up to 28 buff slots for you (bots keep 20).
- **Guide:** [SOLO_HELPER.md](https://github.com/Arturas-Salivonas/L2Solo/blob/mine/solo-buffer/solo/guides/SOLO_HELPER.md)
- **Install:** `git cherry-pick 27040e379..l2mods/mine/solo-buffer`
- **Patch:** <https://github.com/Arturas-Salivonas/L2Solo/compare/27040e379...mine/solo-buffer.diff>
- **Heads-up:** your server may warn at start that the bot tables are stale (the buff-slots change touches `EffectStore.js`). It still plays fine.

### Living Bots: all the bot AI in one mod
- **What:** bots that feel like people. Mood titles and chat moments; allies who jump into fights, friends who defend you, calls for help; gossip about you, fear and bravado; revenge, PK bots and manhunts; rivalries between bots; town attention (gz, PK call-outs, fight watchers); free loot; word of mouth; hunting at their level (5 below, parties up to 5 above) and spot warnings; world legacy and feelings across a wipe.
- **Guide:** [LIVING_BOTS.md](https://github.com/Arturas-Salivonas/L2Solo/blob/feat/living-bots/solo/guides/LIVING_BOTS.md)
- **Install:** `git cherry-pick 27040e379..l2mods/feat/living-bots`
- **Patch:** <https://github.com/Arturas-Salivonas/L2Solo/compare/27040e379...feat/living-bots.diff>

### Same-kind buffs replace each other
- **What:** a bug fix. Focus and Chant of Predator, Death Whisper and Chant of Rage, Vampiric Rage and Chant of Vampire and 18 more kinds no longer stack: the new one replaces the old unless the old is stronger, as in C4.
- **Guide:** [BUFF_STACKING.md](https://github.com/Arturas-Salivonas/L2Solo/blob/fix/buff-stack-groups/solo/guides/BUFF_STACKING.md)
- **Install:** `git cherry-pick 27040e379..l2mods/fix/buff-stack-groups`
- **Patch:** <https://github.com/Arturas-Salivonas/L2Solo/compare/27040e379...fix/buff-stack-groups.diff>

### Buffs survive a server restart
- **What:** a bug fix. A server stop saves every online player's HP, MP, CP and buffs first, and a saved buff keeps the time it had left while you're offline, as in C4.
- **Guide:** [RESTART_BUFFS.md](https://github.com/Arturas-Salivonas/L2Solo/blob/fix/shutdown-saves-player-status/solo/guides/RESTART_BUFFS.md)
- **Install:** `git cherry-pick 27040e379..l2mods/fix/shutdown-saves-player-status`
- **Patch:** <https://github.com/Arturas-Salivonas/L2Solo/compare/27040e379...fix/shutdown-saves-player-status.diff>

### Starter village shops sell the C4 robe set
- **What:** the armor dealers in Talking Island, the Elven Village and the Dark Elven Village sell the ten No-Grade robe pieces at C4 prices, as the Orc and Dwarven villages already did.
- **Guide:** [STARTER_ROBES.md](https://github.com/Arturas-Salivonas/L2Solo/blob/fix/starter-village-robes/solo/guides/STARTER_ROBES.md)
- **Install:** `git cherry-pick 27040e379..l2mods/fix/starter-village-robes`
- **Patch:** <https://github.com/Arturas-Salivonas/L2Solo/compare/27040e379...fix/starter-village-robes.diff>

### Closing the server window saves the world
- **What:** a bug fix. Closing the console window used to kill the server before it saved; now it saves first, like Stop and Ctrl+C.
- **Guide:** [CONSOLE_CLOSE.md](https://github.com/Arturas-Salivonas/L2Solo/blob/fix/console-close-drain/solo/guides/CONSOLE_CLOSE.md)
- **Install:** `git cherry-pick 27040e379..l2mods/fix/console-close-drain`
- **Patch:** <https://github.com/Arturas-Salivonas/L2Solo/compare/27040e379...fix/console-close-drain.diff>

---

**Updates:** run `git fetch l2mods`, then cherry-pick the new commits of a branch, or download its patch again.

**Bugs or ideas:** open an issue on <https://github.com/Arturas-Salivonas/L2Solo>.

All credit for L2Solo goes to its authors (<https://github.com/pmbstyle/L2Solo>), under the same Apache 2.0 license.
