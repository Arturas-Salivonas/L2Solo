# Bot AI map

How the bots are wired, as of upstream `develop` @ 27040e379 (server 0.2.1, 2026-11-27).
Paths are relative to `src/GameServer/Bot/` unless they start with `src/`, `data/` or `scripts/`.

**Short version:** there are three layers.
1. A hot bot runs a fixed **priority chain** in `BotAI.tick`.
2. That chain ends in a 9-state **state machine**.
3. Strategic and economic choices come from a deterministic **wish network** planner. It runs on the cold worker thread for every bot, hot ones included.

The LLM only handles chat with the player (plus optional clan goal picks). There is no plugin or mod loader.

## Hot, cold, static

- **Hot:** a bot near the player (activation radius 7,600, cooldown radius 9,000). It has a real body with full movement and combat, and is ticked on the main thread.
- **Cold:** every other bot, simulated in a worker thread with cheaper fight resolution.
- **Static:** town traders and crafting stations. They have no brain.

## 1. Entry points

- **Boot:** `src/NodeL2.js` calls `BotManager.init()`, which calls `Population/PopulationService.init()`. Static merchants spawn after 5 s, then `PopulationService.start()` runs.
- **`PopulationService.start()`** (~line 948) starts the cold coordinator, raids, clan wars, the scheduler and the phase-policy timer.
  - Seeding: `scheduleGeneratedColdSeed()` calls `Population/GeneratedColdSeeder.seedPopulation()`, which fills up to `maxPlayingPopulation`.
  - `tickPhasePolicy()` runs `activateNearPlayers()` and `cooldownEligibleHot()`.
- **Cold to hot:** `Population/HotActivation.activate()` calls `BotManager.loadAndSpawnBot()`, which calls `BotAI.init(session)`.
- **Hot to cold:** `Population/Cooldown.cooldown()`. Parties and PvP use `HotPartyLifecycle` and `PvpEncounterLifecycle`.
- **Hot tick:** `BotAI.scheduleTick()` goes through `AI/HotAiDispatcher.js` (urgent and normal queues), which calls `BotAI.tick(session)` (~line 421).
  - The tick delay comes from `AI/HotActorLodPolicy.js`: about 1 s near the player, 3 s full, 7 s visible, 30 s preload.
  - Damage wakes a bot through `wakeup()`, called from `src/GameServer/Actor/Generics/ReceivedHit.js`.
- **Cold loop:** `Population/ColdSimulationCoordinator.js` (`start`, `startWorker`, watchdog and restart) runs `Population/ColdSimulationWorker.js`.
  - The worker calls `ColdSimulationKernel.tick()` (~1838), then `resolveStep()` (~2447) or `resolvePartyStep()`.
  - Fights are resolved by `Population/BackgroundResolver.resolveSolo()` (~2587), or `BackgroundPartyResolver` for parties.
- **Clans:** they have their own worker, `src/GameServer/Clan/ClanPlanningCoordinator.js`.

## 2. How a hot bot decides

**A. The `BotAI.tick` preemption chain.** About 20 early returns, and the order is the priority. Roughly:
1. PvP self-defense (`AI/BotPvpDefense.js`)
2. Meeting hold (`BotTownTravel`)
3. Clan alliance and ambition AIs
4. Open trade
5. Buff-service duty
6. LOD gate
7. `ChatArrivalState`
8. Death and respawn
9. Equipment upgrade
10. Ground loot
11. Clan-hall visit
12. `HotResourceCompetition`
13. `HotBackgroundParty.tick` (bot parties)
14. Finally `States[session.plan].tick(...)`

A state that throws is held off through `stateFaulted`.

**B. The states** (`AI/States/`): `HuntingState`, `RestingState`, `ShoppingState`, `FollowingState` (the bot is in your party), `FleeingState`, `GettingBuffedState`, `PkHuntingState`, `PkFleeingState` and `MerchantState`. A transition is a direct `session.plan = '...'` write, and these writes are scattered across the code.

`HuntingState.tick` (~788) checks, in order:
1. Pending town trip
2. Survival floor, which sends the bot to rest
3. Bag clear or cleanup trip
4. Newbie Guide rebuff
5. The held economy decision: craft, improve or shop trip
6. PK sighting: `BotPvpRisk.evaluate` decides fight or flee
7. Incoming threat: `DangerMoment`, `EscapePolicy`, `BotEmergencyFinisher`
8. Rest check
9. Spot relocation
10. Target search

**C. The planner** is deterministic and runs on the worker, for hot bots too.
- Core files: `Economy/WishNetwork.js`, `Economy/EconomyContext.js`, `Economy/Agenda.js`, `Population/ColdEconomyDecision.js`, `Goals/NeedsEvaluator.js` (survival, then errand, then wish) and `Goals/GoalExecutor.js`.
- `AI/DecisionEvents.js` raises named situations such as `arrived_town`, `spot_empty` and `bag_full`. `held()` and `receive()` wait for the worker's answer.
- `Situations.js` is the situation-to-decision catalogue ("a new rule is a row here"). **This is the cleanest place to add new behaviour.**
- Spots: `AI/SpotService.js`, `AI/SpotValueTable.js`, `AI/LevelingRoutes.js`, `Population/BotRoute.js`.
- Targets: `AI/BotTargetMatchup.js`, `AI/BotTargetScorer.js`.
- Parties: `Population/PartyGoalPolicy.js`, `PartyAdmission.js`, `PartyHuntingAssembly.js`.
- Trade: `BotTradeService.js`, `Economy/BotNegotiationService.js`.
- PvP: `AI/BotPvp*.js`, `src/GameServer/Social/PvpAggression.js`.

## 3. Class combat

The tactics are hardcoded JS that reads skill meaning from the data.

- **Dispatcher:** `BotAI.executeCombat` (~723). Its order:
  1. Protections
  2. Potion
  3. Spoil
  4. Archer reposition
  5. Mage melee finisher
  6. `SummonerTactics.combatAction`
  7. `PartyClassTactics.selfAction`
  8. `BotCombatUtility.selectAttackAndChargePlan`
  9. Wait while a pet tanks
  10. Cast
  11. Basic attack
- **Scoring:** `AI/BotCombatUtility.js` weighs MP price, charges and rejected alternatives.
- **Mana reserves** by role and mode: `AI/BotClassPolicy.js`, documented in `AI/CLASS_POLICY.md`.
- **Roles:** `AI/BotRoles.js` (`ROLE_CLASSES`, summoner and spoiler id sets).
- **Archers:** kiting in `AI/BotRangedCombatPositioning.js` (trigger 450, retreat 500), plus `PartyArcherCombatPolicy.js`.
- **Summoners:** `AI/SummonerTactics.js`, `PetTankRule.js`, `PetHealRule.js`.
- **Healers and buffers:** `AI/BotSupportPlanner.js`, `PartyHealPolicy.js`, `PartyBuffLoadout.js`, `SoloSelfHeal.js`.
- **Shared:** `AI/BotSkillIntent.js`, `BotSkillCapabilities.js`, and `BotPvpTactics.js` for PvP.
- **Rejected casts** feed back through `AI/BotActionFeedback.js`, called from `src/GameServer/Actor/Attack.js`.
- **Cold bots reuse the same selection:** `Population/ColdClassPolicy.js` wraps `BotCombatUtility` and `BotClassPolicy`. `ColdCombatProfile.js` builds the cold fighter.
- **Shared hit math:** `src/GameServer/Combat/HitRules.js` and `CombatantView.js`, used by both hot `Attack.js` and the cold `BackgroundResolver`.
- **Data:**
  - `data/Skills/Tree/tree.json`, with meaning from `src/GameServer/Skills/C4SkillRules.js`
  - `data/Bots/spot-table.json` and `town-ways.json`
  - `data/Bots/hunt/*.json` is built offline by `scripts/hunt-tables/build.js`, which says the server does not read it yet.

## 4. Config

- `src/Global.js` (~152-187) merges, in order: `default.ini`, then `L2NODE_SHARED_CONFIG_FILE`, then `config/local.ini` (skipped when `L2NODE_CONFIG_FILE` is set), then `L2NODE_CONFIG_FILE`.
- `[BotPopulation]` is read by `Population/PopulationConfig.js`.
  - It coerces each value to the type of its default. **An unknown key is silently ignored, so a typo does nothing.**
  - `BOT_*` environment variables override the file.
  - `maxPlayingPopulation` is capped at 2000.
- `[OpenRouter]` or `[AI]` (`[AI]` wins): `AI/OpenRouterGateway.js`.
- Clans: `Clan/ClanSimulationConfig.js` and `ClanWarConfig.js`.

## 5. Extension points that exist

The "server-side mod support" is the server half of the optional client UI mod.
- The client sends `native-<family> open <version>`. The server answers with `L2SOLO_<FAMILY>_V1` payloads, or plain HTML for a clean client.
- The files are `src/GameServer/World/Generics/Native*Protocol.js` and `NpcBypasses/Native*.js`.

Other ways in today:
- **New bypass:** `bypass -h foo-bar` routes to `NpcBypasses/FooBar.js` by naming convention (`NpcTalkResponse.js`).
- **New HTML page:** `bypass html X` serves `data/Html/X.html`.
- **New planner rule:** a row in `Situations.js`.
- **Config layers** (see section 4).

## 6. LLM vs deterministic

- `BotAI.tick`'s own comment: autonomous state changes stay deterministic, and the LLM is only for explicit player communication.
- **`AI/BotBrain.maybeThink()`** runs only on `player_chat` with a real player in view.
  - The model returns schema-checked actions from `AI/BotAgentTools.js`, and normal game code checks and runs them.
  - Combat tweaks go to `AI/HotBotPolicyOverlay.js` with a TTL of 5 s to 30 min.
- **`AI/PartyLLMRouter.js`** decides who answers ambiguous party chat, after the rule-based `PartyDialogueRouter` has run.
- **Other LLM uses:**
  - `AI/BotRemoteChat.js`: chat with cold bots
  - `AI/BotConversationSummarizer.js`: memory compaction
  - `Clan/ClanBrain.js`: picks among deterministic clan goal candidates
  - `Clan/ClanTitleBrain.js`: off by default

## 7. Tests

- **Layout:** about 1,335 plain-`assert` files `tests/test_*.js`, plus `tests/e2e/`, `tests/fixtures/` and `tests/helpers/`.
- **Runner:** `scripts/run-tests.js` holds an explicit list that must cover every file. Each file runs in its own process with an isolated DB.
  - Flags: `--only=`, `--shard=K/N`, `--geodata`, `--keep-going`.
- **Bot AI coverage includes:**
  - `test_bot_class_policy`, `test_bot_combat_skill_selection`, `test_bot_support_planner`
  - `test_bot_class_cold_parity`, `test_cold_combat_parity`, `test_hot_cold_progression_parity`
  - `test_hot_ai_dispatcher`, `test_hot_actor_lod_policy`, `test_near_decision_order`, `test_cold_worker_one_decision`
  - `test_hunt_cycle`, `test_pk_hunting_state`, `test_bot_resting_danger_moment`
  - `test_party_llm_router`, `test_openrouter_gateway`, `test_llm_*`
- **Scripts:**
  - `scripts/decision-parity.js` compares worker and main decisions on a saved world with at least 300 cold bots.
  - `scripts/hunt-cycle-check.js` checks the `AI/HuntCycle.js` model against `resolveSolo`.
  - `scripts/run-simulations.js` runs three full servers under `tmp/simulations/`.
  - `scripts/trace.js` reads the decision trace. Turn it on with `[BotPopulation] decisionTrace = true` in `local.ini`.

## 8. Smells worth knowing

- **No TODO or FIXME in the Bot code.** Softer markers: "legacy" appears 72 times and "temporar" 32 times.
- **Unseeded randomness:** 54 `Math.random()` calls in the Bot code (`BotManager` 10, `HuntingState` 5), while cold bots use `deterministicRandom`. Hot behaviour is hard to reproduce.
- **Timer chains:** 44 `setTimeout`s in the Bot code, including `BotManager`'s speech rules.
- **Lazy requires:** about 3,500 `invoke('GameServer/...')` calls, many inside ticks, to avoid circular requires.
- **Hardcoded values:** ids such as `PET_BUFF_IDS`, `SPOIL_SKILL_ID 254` and `DESTROYER_CLASS_ID`. The PK alarm lines are inline in `HuntingState`, although `AI/BotSpeechTemplates.js` exists.
- **Implicit priority:** the chain order in `BotAI.tick` is the priority, and transitions are scattered.

**Biggest files** (lines; high merge-conflict risk, so touch them lightly):

| File | Lines |
| --- | --- |
| `src/Database.js` | 12,677 |
| `src/WorldObserver/public/app.js` | 4,378 |
| `Population/BotLifeState.js` | 4,363 |
| `AI/GearAcquisitionPlanner.js` | 3,390 |
| `Population/PopulationService.js` | 3,372 |
| `src/WorldObserver/WorldObserverServer.js` | 3,323 |
| `Population/BackgroundResolver.js` | 3,287 |
| `Population/ColdSimulationKernel.js` | 3,211 |
| `src/GameServer/Items/C4EquipmentItemSkills.js` | 3,014 |
| `Population/ColdSimulationWorker.js` | 2,561 |
| `Population/ColdSimulationCoordinator.js` | 2,558 |
| `AI/States/FollowingState.js` | 2,090 |
