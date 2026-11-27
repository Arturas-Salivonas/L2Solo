# L2Solo mods: take only what you want

Every modification of this fork is its own branch, cut from the same L2Solo commit (`27040e379`). You can install one, several, or all of them, in any order, on L2Solo `main` or `develop`.

Each one was checked on both: installed alone, and all ten together. All of them stay in Chronicle 4, and none touches your world or characters.

## How to install

Stop your server first.

**With git (a cloned L2Solo, the easiest)**, run once in your L2Solo folder:
```
git remote add l2mods https://github.com/Arturas-Salivonas/L2Solo.git
git fetch l2mods
```
Then, for each mod you want, the cherry-pick line its section below shows, for example:
```
git cherry-pick 27040e379..l2mods/feat/free-loot
```
If git asks who you are, run `git config user.name "you"` and `git config user.email "you@example.com"` once, then the cherry-pick again.

**As a patch file:**
1. Open the mod's patch link and save the file in your L2Solo folder, for example as `free-loot.diff`.
2. Run `git apply -3 free-loot.diff`. The `-3` lets several mods' patches stack.
3. On a launcher install without git history, plain `git apply free-loot.diff` works for one mod.

**Remove a mod:** `git revert --no-edit 27040e379..l2mods/<branch>` (with git), or `git apply -R <file>.diff` (patch).

**Settings** go in `config/local.ini`, which you create if it's missing. Every mod works with its defaults.

Restart the server after installing.

---

## The mods

### Solo Helper: 1-hour buffs and Adena on Alt+B
- **What:** Alt+B opens a buffer with 85 C4 buffs, the 4 summoner servitor buffs and presets; every buff lasts 60 minutes.
- **Also:** Full HP/MP/CP in one click, an Adena tab, and up to 28 buff slots for you (bots keep 20).
- **Branch:** [`mine/solo-buffer`](https://github.com/Arturas-Salivonas/L2Solo/tree/mine/solo-buffer). Full guide with screenshots: [SOLO_HELPER.md](SOLO_HELPER.md).
- **Install:** `git cherry-pick 27040e379..l2mods/mine/solo-buffer`
- **Patch:** <https://github.com/Arturas-Salivonas/L2Solo/compare/27040e379...mine/solo-buffer.diff>
- **Settings** (`[SoloHelper]`): `enabled`, `altB`, `buffMinutes`, `window`, `adena`, `buffSlots`.
- **Heads-up:** your server may warn at start that the bot tables are stale, because the buff-slots change touches `EffectStore.js`. It still plays fine.

### Starter village shops sell the C4 robe set
- **What:** the armor dealers in Talking Island, the Elven Village and the Dark Elven Village sell the ten No-Grade robe pieces (tunics and stockings) at C4 prices. Before, only the Orc and Dwarven villages had them.
- **Source:** Lisvus C4 and L2J Mobius C4.
- **Branch:** [`fix/starter-village-robes`](https://github.com/Arturas-Salivonas/L2Solo/tree/fix/starter-village-robes)
- **Install the shop fix only:** `git cherry-pick ed0f165d5`
  - Your server may then warn at start that the bot spot table is stale. It still plays fine.
- **Install with the rebuilt bot tables too** (matches L2Solo `develop` of late November 2026): `git cherry-pick 27040e379..l2mods/fix/starter-village-robes`
- **Patch:** <https://github.com/Arturas-Salivonas/L2Solo/compare/27040e379...ed0f165d5.diff>

### Mood titles above bots, and moments in chat
- **What:** every bot's title shows its level, a face for what it thinks of you and a word for what it needs or does, live: `Lv20 :) Hunting`, `Lv31 >:( Attacks`, `Lv14 o_O LFP`, `Lv18 Res pls`, `Lv22 To spot`.
- **Moments:** bots near you say thanks for a heal, buff or res, "ding" on a level-up and "nice drop!" in local chat.
- **Branch:** [`feat/bot-mood-titles`](https://github.com/Arturas-Salivonas/L2Solo/tree/feat/bot-mood-titles)
- **Install:** `git cherry-pick 27040e379..l2mods/feat/bot-mood-titles`
- **Patch:** <https://github.com/Arturas-Salivonas/L2Solo/compare/27040e379...feat/bot-mood-titles.diff>
- **Settings** (`[BotPopulation]`): `botMoodTitles`, `moodTitleFaces` (false = one word, like `Lv20 Fights you`), `botMoments`.
- **Works better with** the vendettas mod: a manhunt shows as `>:( Revenge`.

### Bot vendettas: revenge, PK bots, manhunts
- **Revenge that happens:** a bug fix; bots act on grudges once you come close.
- **PK bots:** PvP-minded bots, level 20 and up, sometimes pick on a lone, busy or hurt player.
- **Manhunts:** a bot you kill may come back for you.
- **Branch:** [`feat/bot-vendettas`](https://github.com/Arturas-Salivonas/L2Solo/tree/feat/bot-vendettas)
- **Install:** `git cherry-pick 27040e379..l2mods/feat/bot-vendettas`
- **Patch:** <https://github.com/Arturas-Salivonas/L2Solo/compare/27040e379...feat/bot-vendettas.diff>
- **Settings** (`[BotPopulation]`): `pkBotsEnabled`, `pkRate`, `pkMinLevel`, `manhuntEnabled`, `manhuntRate`, `manhuntMinutes`.

### Free loot
- **What:** bots pick up items nobody owns: your drops, PK drops, and monster drops left for 15 seconds. Greedy bots take more.
- **Branch:** [`feat/free-loot`](https://github.com/Arturas-Salivonas/L2Solo/tree/feat/free-loot)
- **Install:** `git cherry-pick 27040e379..l2mods/feat/free-loot`
- **Patch:** <https://github.com/Arturas-Salivonas/L2Solo/compare/27040e379...feat/free-loot.diff>
- **Setting:** `freeLootEnabled`.

### Town attention
- **What:** bots say "gz" when you level up, bystanders call out PKs, and fights draw watchers.
- **Branch:** [`feat/town-attention`](https://github.com/Arturas-Salivonas/L2Solo/tree/feat/town-attention)
- **Install:** `git cherry-pick 27040e379..l2mods/feat/town-attention`
- **Patch:** <https://github.com/Arturas-Salivonas/L2Solo/compare/27040e379...feat/town-attention.diff>
- **Setting:** `townAttentionEnabled`.

### Your WTB lines are market demand
- **What:** "WTB Cotton Tunic x10" in chat counts as demand in the nearest town, so crafters stock and bid for it.
- **Branch:** [`feat/player-trade-shouts`](https://github.com/Arturas-Salivonas/L2Solo/tree/feat/player-trade-shouts)
- **Install:** `git cherry-pick 27040e379..l2mods/feat/player-trade-shouts`
- **Patch:** <https://github.com/Arturas-Salivonas/L2Solo/compare/27040e379...feat/player-trade-shouts.diff>
- **Setting:** `playerTradeShoutsEnabled`.

### Word of mouth
- **What:** bots that trust each other share their best hunting spot out loud, and the one doing worse goes to try it.
- **Branch:** [`feat/word-of-mouth`](https://github.com/Arturas-Salivonas/L2Solo/tree/feat/word-of-mouth)
- **Install:** `git cherry-pick 27040e379..l2mods/feat/word-of-mouth`
- **Patch:** <https://github.com/Arturas-Salivonas/L2Solo/compare/27040e379...feat/word-of-mouth.diff>
- **Setting:** `wordOfMouthEnabled`.

### World legacy: bots remember across a wipe
- **What:** a bot wipe first saves what the world learned. The next world's bots come back as the same people (names, personalities, know-how) at level 1, and spot lessons correct the bots' spot guesses.
- **By hand:** `node scripts/world-legacy.js save` or `show`.
- **Branch:** [`feat/world-legacy`](https://github.com/Arturas-Salivonas/L2Solo/tree/feat/world-legacy)
- **Install:** `git cherry-pick 27040e379..l2mods/feat/world-legacy`
- **Patch:** <https://github.com/Arturas-Salivonas/L2Solo/compare/27040e379...feat/world-legacy.diff>
- **Setting:** `worldLegacyEnabled`.

### Closing the server window saves the world
- **What:** a bug fix. Closing the console window used to kill the server before it saved; now it saves first, like Stop and Ctrl+C.
- **Branch:** [`fix/console-close-drain`](https://github.com/Arturas-Salivonas/L2Solo/tree/fix/console-close-drain)
- **Install:** `git cherry-pick 27040e379..l2mods/fix/console-close-drain`
- **Patch:** <https://github.com/Arturas-Salivonas/L2Solo/compare/27040e379...fix/console-close-drain.diff>

### Buffs survive a server restart
- **What:** a bug fix. A server stop now saves every online player's HP, MP, CP and buffs first, and a saved buff keeps the time it had left while you're offline, as in C4.
- **Branch:** [`fix/shutdown-saves-player-status`](https://github.com/Arturas-Salivonas/L2Solo/tree/fix/shutdown-saves-player-status)
- **Install:** `git cherry-pick 27040e379..l2mods/fix/shutdown-saves-player-status`
- **Patch:** <https://github.com/Arturas-Salivonas/L2Solo/compare/27040e379...fix/shutdown-saves-player-status.diff>

---

**Updates:** run `git fetch l2mods`, then cherry-pick the new commits of a branch, or download its patch again.

**Bugs or ideas:** open an issue on <https://github.com/Arturas-Salivonas/L2Solo>.

All credit for L2Solo goes to its authors (<https://github.com/pmbstyle/L2Solo>), under the same Apache 2.0 license.
