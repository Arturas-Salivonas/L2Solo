# Backlog

Bugs, leads and bot ideas. Each item says what's actually been checked.
Status: `lead` (seen, not diagnosed), `confirmed` (reproduced or root cause found), `branch` (being fixed), `in solo`, `PR #n`, `upstream` (fixed there).

Before starting anything, check upstream's open PRs so we don't duplicate them:
`gh pr list -R pmbstyle/L2Solo`
- Open 2026-11-27: #259 (posukhoff) Discord bug batch - falling through the map, a second party, standing up, self-heal, buff stacking, shot buying.

## Bugs and leads

### 1. Cold bots stay "overdue" for many minutes - `confirmed` (counting bug, diagnostics only)
- **Root cause (2026-11-27):** the 16 overdue bots are exactly the 16 station traders (`bot_trade_01..16`, `stats.stationTrader`, one per town). `ColdSimulationKernel.lifecycleKind()` makes them `event_driven`: they only step when a buyer wakes them, so `lastResolvedAt = 0` is correct. `BotLifeState.coldDueSummary()` doesn't skip them, so they count as due forever.
- **Effect:** `coldDueSummary` only feeds logs and status (`PopulationService.logSummary`, `PopulationStatus`). Gameplay is fine, but the overdue line names only the oldest bot, so these traders hide any bot that is really stuck.
- **Fix:** skip `state.stats?.stationTrader` in `coldDueSummary`, next to the craft-shop skip, plus a test. A small upstream PR; not fixed upstream as of 27040e379, and not in open PR #259.
- **Seen:** the first run on 2026-11-27, logged in `tmp/logs/latest-server.log`.
- **Symptom:** `coldDue` climbs to 16-17 within about 5 minutes and stays there for the whole session.
- **Detail:** `Manson(2000483) merchant` was due 792 s ago, with reason `unclaimed:5-8/32`. So the worker was **not** full, yet it never picked the bot up. There were 25 such log lines, all for the same bot.
- **Code:** `src/GameServer/Bot/Population/PopulationService.js:3346` logs it. `ColdSimulationCoordinator.overdueReason()` (~2502) builds the reason.
- **Upstream calls this a bug.** The comment above the log line says a bot due for over a minute "is not normal".
- **What I found:**
  - `last step -1s` means the bot was never stepped at all.
  - Merchant bots come from `GeneratedColdSeeder.js:682` (`activity: 'merchant'`).
  - `ColdSimulationKernel.lifecycleKind()` (~451) routes `merchant` to `'command'`: main runs it, not the worker's resolver.
  - `BotLifeState.coldDueSummary()` (~4036) still counts the bot as due. It skips PK hunters, party members, craft shops (`crafting` + `craftShop`) and event-driven trade or event waits, but not seeded `merchant` bots or station traders.
- **Next:** run with `developerDiagnostics = true` (the overdue trace then prints the worker's copy of the bot). That settles whether this is a stalled command or a counting mismatch.

### 1b. Dagger bots never get behind their target - `confirmed` (gameplay)
- **Backstab never fires.** `BotCombatUtility.js:223` rejects Backstab with `rear_position_required` unless the bot is behind the target, and no code ever moves a bot there.
  - The "flank" in `FollowingState.assistActionForRole` (`flank_target`) and `BotRoles` (`flank_assist`) is only a label.
- **Blows suffer too.** `HitRules.blowLandChance` lands crit blows (Deadly Blow, Mortal Blow) 70% from behind, 60% from the side and 50% from the front. Bots get the front rate.
- **Missed bonuses.** Focus Power and Dagger Mastery style bonuses are `situationalStats` keyed to `behind`, so those are lost as well.
- **Fix idea:** when the target is hating someone else (a tank, the player, a party member), move to a point in its rear arc. `Attack.isBehindTarget` uses the target's heading (more than 120 degrees off its facing). Then open with Backstab. Solo daggers can't get behind a mob that faces them, which is C4-correct.
- **Touches:** the party paths (`FollowingState`, `HotBackgroundParty`) and the cold party resolver's position assumption.

### 2. `postcommit training failed ... cold_training_source_retired` - `lead`
- **Seen:** once, for bot 2000552, on the first run.
- **Next:** find where training is retired and whether skipping it loses skills or SP.

### 2b. `test_party_presets` crashes on Windows after passing - `confirmed`, upstream, test-only
- **What happens:** all of its checks pass, then `fs.rmSync` of its temp dir throws `ENOTEMPTY`. SQLite WAL files are probably still open; Windows won't delete open files, Linux CI doesn't mind.
- **Scope:** it fails the same way on untouched upstream code (checked 2026-11-27).
- **Fix idea:** close the databases before the cleanup, or retry the removal (`fs.rmSync(dir, { maxRetries: 5 })`). A tiny upstream PR.

### 2c. `test_geodata_bootstrap` fails on Windows - `confirmed`, upstream, test-only
- **What fails:** `fixture must exercise a child surviving its wrapper` (line ~413). The test SIGKILLs the wrapper and expects its child to live on, which is POSIX behaviour.
- **Scope:** it fails the same way on untouched code (checked 2026-11-27).
- **Fix idea:** skip that case on win32, or detach the fixture child.

### 3. Socket exceptions on client connect and disconnect - `lead`, probably noise
- **Seen:** `AuthServer :: exception: unknown socket error` and `GameServer :: exception: Error: read ECONNRESET`.
- **Next:** check whether these are only the client closing its socket. If so, log them quietly.

### 4. Closing the server's console window skips the database drain (Windows) - `in solo` (fix/console-close-drain), PR candidate
- **Reproduced 2026-11-27** with a real console window and WM_CLOSE. Before the fix, all three processes ended at once and the log stopped mid-boot. After it: "flushing ... before SIGHUP", done in 31 ms, exit 0. Ctrl+C still drains (30 ms).
- **Commit:** ca24d3e50. Its message holds the full evidence for the upstream PR: `node solo/fork.js pr fix/console-close-drain`.

**Original notes:**
- **Cause:** closing a console window sends `CTRL_CLOSE_EVENT`, which Node reports as `SIGHUP`, to every process attached to it. `src/NodeL2.js` (~175), `scripts/run-server.js` and `scripts/start.js` handle only SIGINT and SIGTERM. With no listener, Node's default ends the game server at once.
- **Effect:** the server skips "flushing buffered character state" and loses recent progress. Ctrl+C (SIGINT) and the launcher's Stop both drain correctly.
- **Fix:** `process.on('SIGHUP', () => shutdown('SIGHUP'))` in NodeL2.js, and the same forwarding in run-server.js and start.js. Windows allows about 5-10 s after a close and the drain takes about 50 ms, so it fits. A small upstream PR.

## Small upstream-friendly PR candidates

- **`feat/bot-vendettas`** - `in solo` 2026-11-27, PR after the owner has tried it in game: `node solo/fork.js pr feat/bot-vendettas`. Four commits, each one PR-shaped:
  - the revenge watch (a bug fix, the 6000 vs 900 gap)
  - PK bots from the population
  - the walk-up
  - personal manhunts

  New files are `BotPvpWatch`, `BotPk`, `BotManhunt` and `Social/ManhuntPolicy`; the hooks are single lines in `BotRevenge`, `BotPvpDefense`, `BotRoute` and `Die`. Tests: `test_bot_pvp_watch`, `test_bot_manhunt`. Not yet: far bots PK each other, and a manhunt that follows a clanmate's sighting.

- **Warn on unknown config keys.** `PopulationConfig` silently ignores typos in `[BotPopulation]` (and likely in other sections). One warning line at boot would save people hours.
- **Move the inline PK alarm lines** from `HuntingState` into `AI/BotSpeechTemplates.js`, where the other speech lines already are.

## More bots, sooner

**How it works** (`Population/PopulationSeedPlanner.js`, `GeneratedColdSeeder.js`):
- **Wave size:** `5 x starterBotsPerRace`, so 150 bots at the default 30, split by `classMix` race shares. Every bot starts at level 1 in a starter region.
- **Next wave:** once the newest wave averages level 5 (level 10 at x50 and up). The check runs every `generatedColdSeedDelayMs` (45 s).
- **Cap:** `maxPlayingPopulation` (1700), clamped to 2000 in code (`PopulationConfig.js:315`). Static traders and craft services don't count.

**Load measured** on the owner's PC (i9-13900K, 24 cores, 128 GB): the cold simulation is one worker thread, at `workerElu` 0.05-0.09 with about 450 playing bots. The cold worker heap cap is 512 MB (`coldWorkerHeapMb`).

**Options:**
- **A. Config only** (`config/local.ini`, no merge risk): `starterBotsPerRace = 100` (500 per wave), `maxPlayingPopulation = 2000`, `coldWorkerHeapMb = 2048`.
- **B. Configurable hard cap above 2000:** measure first with `[Perf] live = true`. The single cold worker is the real ceiling. A good upstream PR candidate.
- **C. Veteran start** (`mine/`): seed part of the population at mid and high levels with grade-correct gear and class changes, so 40+ zones are alive from day one. The seeder already takes a start level (`seedProfile.level`, `awardProfileSkills`, `expForLevel`). This goes against upstream's "everything is earned" idea, so it stays personal unless they want it.

## Gaps vs C4 (checked in code 2026-11-27)

- **Subclass:** zero code. It's missing for players too. A big feature for later.
- **Noblesse, Olympiad and Hero:** barely there. The C4 reference says all three are new in C4, so they're in era.
- **Day/night:** `isNight` is only used in combat stats. Bots never change plans at night.
- **Newbie helpers:** nothing. High-level bots never visit starter villages to buff or point the way.
- **Already covered by upstream:** buff sellers, dwarf shops, the shot economy, spoil and sweep, soul crystals, clan raids, PK bots, archer kiting, rebuffs, LFP and WTS chat, res requests.

## Bot ideas

Ground these in [docs/C4_REFERENCE.md](docs/C4_REFERENCE.md) (section 12 has a longer list). The hooks are listed in [docs/BOT_AI_MAP.md](docs/BOT_AI_MAP.md); new planner rules go in as rows in `Situations.js`.

### Checked 2026-11-27: why bots feel less human (paths under `src/GameServer/`)
- **Nobody picks up free items.** Only mob drops carry an owner key (`World/Generics/NpcRewards.js:35`). Unowned items, such as your drops and PK drops, are kept out of `GroundItems.byLeader` (`World/GroundItems.js:21`). A bot's loot scan reads only its party's own key (`Bot/AI/PartyCompanionService.js:394`). The scan runs only while hunting or resting, and most town bots return earlier in `BotAI.tick`.
- **No C4 drop protection.** `World/Generics/PickupItem.js` checks no owner and no timer, and ground items never expire.
- **Learning is narrow.** Bots learn spots, prices and people (see docs/BOT_BEHAVIOUR.md) and stalled gear routes (`AI/GearStall.js`). There is no bandit or imitation, no learning from other bots (`BotHuntEfficiency.js:218`, "No cohort median"), and persona traits never change. LLM summaries feed chat only.
- **Dead code:**
  - `townGossip` is only ever set to false (`AI/States/RestingState.js:202, 240`).
  - `restlessness` isn't a trait, so `BotAmbientDirector.js:101` never fires.
- **Thin reactions.** Bots never react to what you do, apart from being named or selected within 1,500. Emotes are arena-only.

### Ideas, smallest first
1. **Free loot with C4 protection** - small, low risk.
   - **How:** give ground items a drop time and keep unowned items in their own set. "Claimable" = own, unowned, or older than about 15 s. Bots within about 500 roll once per item, by persona (ambition up, empathy down).
   - **Also:** widen the loot gate to shopping, and enforce the same protection for the player in `PickupItem.js`.
2. **Town attention** - medium.
   - **What:** short-lived points of interest: a drop, your shout, a level-up, a fight, a PK. Idle hot bots roll once each to walk over, watch, emote, say "gz" or loot.
   - **Where:** new `Bot/AI/TownAttention.js` next to `BotChatReactions.offerLocal`, with a 1 ms budget like `TownTraffic`. Fix the two dead bits above while there.
3. **Your WTS/WTB shouts as market demand** - medium.
   - **What:** parse them in `Network/Request/Speak.js` into `Economy/MarketDemand`, so crafters stock what you ask for.
4. **Word of mouth** - medium-large.
   - **What:** friends and clanmates share spot results, discounted by trust, when they meet in town or party.
5. **Exploration habits** - medium, needs parity checks.
   - **What:** a seeded exploration bonus for under-tried spots, sale towns and buyers, kept in saved stats.
