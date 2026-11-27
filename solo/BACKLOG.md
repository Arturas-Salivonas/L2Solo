# Backlog

Bugs, leads and bot ideas. Each item says what's actually been checked.
Status: `lead` (seen, not diagnosed), `confirmed` (reproduced or root cause found), `branch` (being fixed), `in solo`, `PR #n`, `upstream` (fixed there).

Before starting anything, check upstream's open PRs so we don't duplicate them:
`gh pr list -R pmbstyle/L2Solo`
- Open 2026-11-27: #259 (posukhoff) Discord bug batch - falling through the map, a second party, standing up, self-heal, buff stacking, shot buying.

## Bugs and leads

### 1. Cold bots stay "overdue" for many minutes - `lead`
- **Seen:** the first run on 2026-11-27, logged in `tmp/logs/latest-server.log`.
- **Symptom:** `coldDue` climbs to 16-17 within about 5 minutes and stays there for the whole session.
- **Detail:** `Manson(2000483) merchant` was due 792 s ago, with reason `unclaimed:5-8/32`. So the worker was **not** full, yet it never picked the bot up. There were 25 such log lines, all for the same bot.
- **Code:** `src/GameServer/Bot/Population/PopulationService.js:3346` logs it. `ColdSimulationCoordinator.overdueReason()` (~2502) builds the reason.
- **Next:** decide whether merchant-type bots should be left out of the due set (a reporting bug) or are really never stepped (a stall). Check the kernel's claim filter.

### 2. `postcommit training failed ... cold_training_source_retired` - `lead`
- **Seen:** once, for bot 2000552, on the first run.
- **Next:** find where training is retired and whether skipping it loses skills or SP.

### 3. Socket exceptions on client connect and disconnect - `lead`, probably noise
- **Seen:** `AuthServer :: exception: unknown socket error` and `GameServer :: exception: Error: read ECONNRESET`.
- **Next:** check whether these are only the client closing its socket. If so, log them quietly.

## Small upstream-friendly PR candidates

- **Warn on unknown config keys.** `PopulationConfig` silently ignores typos in `[BotPopulation]` (and likely in other sections). One warning line at boot would save people hours.
- **Move the inline PK alarm lines** from `HuntingState` into `AI/BotSpeechTemplates.js`, where the other speech lines already are.

## Bot ideas

Ground these in [docs/C4_REFERENCE.md](docs/C4_REFERENCE.md) (section 12 has a longer list). The hooks are listed in [docs/BOT_AI_MAP.md](docs/BOT_AI_MAP.md); new planner rules go in as rows in `Situations.js`.

- (to fill once the C4 reference is in, then pick with the owner)
