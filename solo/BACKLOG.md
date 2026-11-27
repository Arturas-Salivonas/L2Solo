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

### 3. Socket exceptions on client connect and disconnect - `lead`, probably noise
- **Seen:** `AuthServer :: exception: unknown socket error` and `GameServer :: exception: Error: read ECONNRESET`.
- **Next:** check whether these are only the client closing its socket. If so, log them quietly.

## Small upstream-friendly PR candidates

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

- (to fill once the C4 reference is in, then pick with the owner)
