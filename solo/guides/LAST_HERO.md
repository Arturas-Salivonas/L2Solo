# Last Hero for L2Solo: a 100-fighter free-for-all at the Coliseum

An automatic PvP event for [L2Solo](https://github.com/pmbstyle/L2Solo). Every two hours, up to 100 fighters (you and the server's bots) are put on random spots of the Coliseum floor. Everyone fights for themselves. The last one standing wins **10,000,000 Adena** (you set the prize) and the **Hero aura**, and the whole server hears about it. It stays in Chronicle 4: the real C4 Coliseum arena, the C4 hero glow, the C4 announcement chat.

## How it works

1. **Registration opens** 5 minutes before each event, with a server announcement. Join from **Alt+B > Last Hero** (with the [Solo Helper](https://github.com/Arturas-Salivonas/L2Solo/blob/mine/solo-buffer/solo/guides/SOLO_HELPER.md)) or type **`.lasthero`** in chat.
2. **Don't want to wait?** Press **Start now**: it starts straight away with you in it.
3. **Everyone is teleported** to a random spot on the Coliseum floor. Your party is broken up, and nobody can make one: it's everyone for themselves.
4. **All buffs are cancelled,** yours and your servitor's: everyone starts clean. Then **everyone gets Wind Walk, Haste and Acumen** at their highest C4 level.
5. **The buff draft:** a dialog shows you **10 random buffs** from the buffer classes: Prophet, chants, Overlord, dances, songs and the 3rd class prophecies. **Pick 3.** The third pick buffs you and closes the dialog; click a picked one again to put it back. None of the 10 would replace Wind Walk, Haste or Acumen, and no two of them replace each other. Every bot gets 3 random buffs of its own, so no two fights feel the same. Closed the dialog? Alt+B > Last Hero > Pick buffs opens it again. Not done when the fight starts? The rest are picked for you.
6. **30 seconds before the fight.** Nobody can attack yet. Bots also cast their own class buffs, and you can cast yours. The Solo Helper buffer and its Full HP/MP/CP are locked while you're in the event (`lockBuffer`). Walk off the floor and you're put back.
7. **FIGHT!** Every fighter is flagged (purple), so you attack with a plain click. Bots pick the nearest fighter, or whoever just hit them, and fight with the server's own bot PvP brain: their skills, their gear, their shots.
8. **When you fall, you're out.** You get your place and kills, stand up at the west gate a few seconds later, and can watch from there. Leaving the floor for 3 seconds also counts as out.
9. **The last one standing wins.** If time runs out (10 minutes), the fighter with the most kills (then the most HP) wins.
10. **The results are announced:** the winner with their kills, then the five fighters with the most kills, one per line. The Last Hero tab keeps that list until the next event.
11. **The crowd reacts:** a couple of dozen lines in normal, shout and trade chat. Gz, gg, "rigged", "share the 10kk?" and the like, from the fallen fighters and the rest of the server.
12. **Ten seconds later everyone goes back** where they came from, with full HP, MP and CP and the buffs they had before the event.

**Nothing is lost.** No EXP loss, no item drops, no karma, no PvP count. Outsiders can't touch fighters, and fighters can't touch outsiders.

**The Hero aura** is the C4 hero glow. The winner keeps it until the next event has a new winner, across restarts. It's only the glow: no hero skills or hero chat.

**The bots** are copies of real bots from your world: same name, class, level, gear and skills, and nothing extra (no buff set, no bonus stats). They're picked near your level (within 10 levels when there are enough), and the classes take turns so every class and race near your level gets places: mages, healers, buffers, summoners, dwarves as well as fighters. Nothing that happens to a copy touches the real bot. A bot winner gets its 10kk the next time it's active near you, and the real bot glows.

**When you don't join,** the event still runs, in the background. The server announces the start, the countdown of fighters and the winner. The winner is drawn by level (stronger bots win more often) and gets the aura and the prize all the same. So when you meet a glowing bot, it really won.

**The server console** shows every announcement too, prefixed `LastHero ::`.

## Install

### Let your AI agent do it

**Don't know how to install it?** Copy this into your AI coding agent (Claude Code, Cursor, Codex or similar) and fill in your folder. It checks your server is stopped, backs up your world first and tells you what it did.

```text
Please install the "Last Hero" event mod into my L2Solo server (a Lineage II C4 server, https://github.com/pmbstyle/L2Solo).
My L2Solo folder is: <your L2Solo folder>
Guide: https://github.com/Arturas-Salivonas/L2Solo/blob/feat/last-hero/solo/guides/LAST_HERO.md

Rules:
- The server must be stopped first. If anything is listening on ports 2106 or 7777, ask me to stop it. Don't stop it yourself.
- Before changing anything, copy the tmp folder (my world and characters) to a backup folder outside the L2Solo folder.
- Don't change config/local.ini or anything inside tmp.
- Never use the launcher's Update or Verify buttons: they put the original files back.

Steps:
1. If the folder is a git repository (it has a .git folder), run there:
   git remote add l2mods https://github.com/Arturas-Salivonas/L2Solo.git   (skip it if l2mods already exists)
   git fetch l2mods
   git cherry-pick 27040e379..l2mods/feat/last-hero
   Optional, for the Alt+B tab: git cherry-pick 27040e379..l2mods/mine/solo-buffer   (the Solo Helper)
   If git asks who I am, set user.name and user.email for this repository only.
   If a cherry-pick says a commit is already there, run git cherry-pick --skip.
   If a cherry-pick stops on a conflict, run git cherry-pick --abort and tell me which files conflicted. Don't guess a fix.
2. If it's not a git repository (a launcher install), follow option C "By hand" in the guide above, and tell me exactly which files you copied and which lines you changed.
3. Run npm run check in the L2Solo folder.
4. Tell me what you did, and that I can start the server again with npm run start.
```

### Or do it yourself

Stop your server first.

### A. You cloned L2Solo with git (easiest)

From your L2Solo folder:

```
git remote add l2mods https://github.com/Arturas-Salivonas/L2Solo.git
git fetch l2mods
git cherry-pick 27040e379..l2mods/feat/last-hero
```

For the **Alt+B > Last Hero** tab, add the [Solo Helper](https://github.com/Arturas-Salivonas/L2Solo/blob/mine/solo-buffer/solo/guides/SOLO_HELPER.md) too. Without it, `.lasthero` opens the same window in chat.

```
git cherry-pick 27040e379..l2mods/mine/solo-buffer
```

If git asks who you are, run `git config user.name "you"` and `git config user.email "you@example.com"` once, then the cherry-pick again.

### B. As a patch file

1. Download the patch: <https://github.com/Arturas-Salivonas/L2Solo/compare/27040e379...feat/last-hero.diff>
2. Save it in your L2Solo folder as `last-hero.diff`.
3. Run:

```
git apply --check last-hero.diff
git apply last-hero.diff
```

If `--check` complains, your L2Solo is newer or older than the patch: use option A, or copy the files by hand (C).

### C. By hand (launcher installs, no git)

1. Download the branch as a zip: <https://github.com/Arturas-Salivonas/L2Solo/archive/refs/heads/feat/last-hero.zip>
2. Copy these new files into the same places in your server folder:
   - the whole folder `src/GameServer/Events/LastHero/`
   - `src/GameServer/World/Generics/NpcBypasses/LastHero.js`
3. Change these lines in your own files (each is one small hook):
   - `src/GameServer/World/World.js`: after `invoke('GameServer/Npc/NpcAggro').startAggroTicker(this);` add
     ```
     invoke('GameServer/Events/LastHero/LastHero').start();
     ```
   - `src/GameServer/World/ArenaCombatRules.js`:
     - after the `service()` function add
       ```
       function lastHero() {
           return invoke('GameServer/Events/LastHero/LastHero');
       }
       ```
     - in `canInteract`, after `if (!attacker || !victim || attacker === victim) return false;` add
       ```
       if (lastHero().involves(attacker, victim)) return lastHero().canInteract(attacker, victim);
       ```
     - in `suppressConsequences`, after `if (!attacker || !victim) return false;` add
       ```
       if (lastHero().involves(attacker, victim)) return true;
       ```
   - `src/GameServer/Actor/Generics/Die.js`:
     - replace `if (!ArenaDuelService.duelForActor?.(actor)) killEffect('death.pk_drop', ...` with
       ```
       const LastHero = invoke('GameServer/Events/LastHero/LastHero');
       if (!ArenaDuelService.duelForActor?.(actor) && !LastHero.involves(actor)) killEffect('death.pk_drop', () => require('./PkDeathDrop').drop(victimSession, actor));
       ```
     - after `if (arenaDeath) return;` add
       ```
       let heroDeath = false;
       killEffect('death.last_hero', () => { heroDeath = LastHero.onDeath(victimSession, actor, killer); });
       if (heroDeath) return;
       ```
   - `src/GameServer/Network/Request/RestartPoint.js`: put `invoke('GameServer/Events/LastHero/LastHero').restartPoint(session) || (` in front of the `arenaDeath ? ... : ...` destination, and `)` after it.
   - `src/GameServer/Network/Response/UserInfo.js` and `src/GameServer/Network/Response/CharInfo.js`: replace `.writeC(0x00)  // Hero` with
     ```
     .writeC(invoke('GameServer/Events/LastHero/LastHero').heroAura(actor) ? 1 : 0)  // Hero
     ```
   - `src/GameServer/Network/Request/Speak.js`: in `dispatchLocalCommand`, after the `.items` block add
     ```
     if (invoke('GameServer/Events/LastHero/LastHeroWindow').command(session, data.text)) return true;
     ```
   - `src/GameServer/Network/Request/AskForTeamUp.js`: at the top of `consume` add
     ```
     if (invoke('GameServer/Events/LastHero/LastHero').partyBlocked(session)) {
         session.dataSendToMe(invoke('GameServer/Network/Response').actionFailed());
         return;
     }
     ```
4. Don't copy the `tests/` files: the test runner only accepts tests it has listed.

**Heads-up:** the launcher's **Update / Verify server** puts back its own copy of the files you edited, and the event stops. Redo step 3 after an update.

## Settings (optional)

Every setting is listed with its default under `[LastHero]` in `config/default.ini`. Put the ones you change in `config/local.ini` under `[LastHero]` (it survives updates). Restart the server after a change.

**The prize** is the first thing most servers change:

```
[LastHero]
prizeAdena = 50000000            ; Adena for the winner, 0 = none
prizeItems = 3470:1, 1539:20     ; extra items: itemId:count, comma separated
```

The example gives 50kk, a Gold Bar and 20 Greater Healing Potions. The announcement names the whole prize. Item ids are the C4 datapack's (`data/Items`). An id the server doesn't know is skipped with a warning in the console.

All the settings:

```
[LastHero]
prizeAdena = 10000000   ; Adena for the winner (the old name prize still works)
prizeItems =            ; extra items for the winner, itemId:count, comma separated
enabled = true          ; false turns the event off
everyMinutes = 120      ; an event starts this long after the last one ended (0 = only with Start now)
registerMinutes = 5     ; registration is open this long before an event
prepareSeconds = 30     ; time to buff before the fight
fightMinutes = 10       ; then most kills (then most HP) wins
fighters = 100          ; fighters in one event, you included (2-136)
botBuffs = self         ; self = bots cast their own buffs, full = a full buff set each, none
levelGap = 10           ; bots are picked near your level, at most this far when there are enough
winnerChat = true       ; false = no gz chatter after the winner
baseBuffs = 1204, 1086, 1085   ; everyone's buffs on the floor (skill ids): Wind Walk, Haste, Acumen
draftChoices = 10       ; random buffs offered in the draft
draftPicks = 3          ; how many you pick (bots get this many at random), 0 = no draft
lockBuffer = true       ; no Solo Helper buffer or Full HP/MP/CP during the event
```

The state lives in `tmp/solo/last-hero.json`: the current hero, when the next event is, the last 10 results and any prize a bot is still owed (paid the next time that bot is active near you).

## Good to know

- **Logging out during an event** takes you out of it, and you log back in at the Coliseum (next to the Aden gatekeeper). The same goes for a server stop in the middle of a fight.
- **Fighters with karma, an open private store or an arena duel** can't join.
- The bot copies show their real names. The real bots keep living their lives elsewhere while the copies fight.
- The fight is real: 100 fighters with skills. A slower PC may feel it in the first minute, while everyone is still standing.

## Remove it

- **Git (A):** `git revert --no-edit 27040e379..l2mods/feat/last-hero` undoes exactly those commits.
- **Patch (B):** `git apply -R last-hero.diff`.
- **By hand (C):** put the lines you changed back and delete the files you copied.

Your world and characters are never touched either way. Delete `tmp/solo/last-hero.json` to forget the hero and the results.
