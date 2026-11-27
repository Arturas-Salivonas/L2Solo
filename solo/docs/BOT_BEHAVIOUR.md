# How the bots learn, react to you, PK and progress

Read from upstream `develop` @ 27040e379 on 2026-11-27. Nothing was run in game.
The three most surprising points (PK bots off, the revenge distance gap, clan auto-accept) were re-checked by hand.
Paths are relative to `src/GameServer/` unless they start with `src/` or `config/`.

## 1. Do bots adapt? Yes, quietly

**Learning from experience** (`Bot/AI/KnowledgeLearning.js`, `[BotPopulation] knowledgeErrorsEnabled`)
- Each bot starts with an error in its estimates, set by its persona trait `understanding`. The error halves with each "half-life" of experience.
- The half-life for **mobs and people** is 25% of the kills needed to clear the grade band. For **prices and crafting** it's 3 of the bot's own deals.

| Estimate | File | Base error | Floor |
| --- | --- | --- | --- |
| Spot income | `SpotEconomics.js` | 0.03 + 0.25 x (1 - understanding) | 0.03 |
| Item price | `PriceLearning` / `PriceBelief` | 0.03 + 0.17 x (1 - understanding) | 0.03 |
| An opponent's visible strength | `Social/PeopleKnowledge.js` | 0.5 x (1 - understanding) | 0.02 |

**Hunting spots**
- **Own income per spot:** `BotHuntEfficiency.js` keeps up to 8 spots, with rows expiring after 6 h. After 50 kills it judges whether the spot was worth it (`spot_disappoints`).
- **Leaves deadly spots** (`Population/SpotRiskPolicy.js`). The triggers:
  - 2 or more deaths that are at least 20% of its fights
  - a win rate of 25% or less over 12 or more fights
  - 3 failed hunts

  The spot is then backed off for 60 steps, doubling on each repeat up to 360, with at most 8 backoffs. For 12 clean wins the bot also levels as if it were 2-6 levels lower.
- **Frustration:** deaths raise `frustration`, which raises its caution. Frustration decays over hours.
- **Crowding:**
  - **Far bots:** a spot counts as "held" after 5 over-capacity arrivals. That record lives in RAM only and resets on restart.
  - **Near bots:** they won't take a mob another bot has claimed, and they negotiate among themselves (coexist, yield 15 s, avoid the spot 2 min, or offer a party).

**Market: real supply and demand** (`Bot/Economy/MarketCounters.js`)
- Prices are a running average of the last 32 board deals per item kind and grade, the last 21 prices per item, buyers per hour, and demand per town.
- Filled listings push a bot's price belief up; unanswered ones push it down. NPC shops don't count.

**Social memory** (`Social/InteractionMemoryPolicy.js`, `RelationshipLayers.js`)
- **Five feelings per person:** affinity, trust, hostility, fear and familiarity.
- **Capacity:** 32 ordinary rows plus 16 strong ones, plus 8 clan and 8 alliance impressions. Rows about the player are always kept.
- **How fast it fades** (in the bot's own played hours):
  - long-term trust and hostility: about 252 h at average traits
  - grudges and gratitude: 24-48 h
  - irritation: 0.25-1 h, RAM only
- **Stored** in SQLite (`interaction_relations`, `interaction_journal`, `clan_social_memory`).
- **Party choice** prefers partners by affinity + 2 x trust - 2 x hostility - fear.

**Survives a restart:** social memory, spot risk, hunt efficiency, frustration, market counters and friendships.
**Lost on a restart:** irritation, crowding records and memory events still queued in RAM.

## 2. What you can do to bots

Feeling changes are listed as affinity / trust / hostility.

| You... | Effect |
| --- | --- |
| Party with them | +2 / +2 on forming. +2 / +1 per shared hunt, at most once per 30 min. |
| Help them in a fight (hit their target) | +3 / +4 / -1, at most once per 30 min. |
| Heal them below 40% HP (+5% or more) | +2 / +2 |
| Resurrect them | +4 / +5 / -2 |
| Trade, or give requested loot | +1 / +1, or +3 / +3. A bot equips anything better at once. |
| Ignore their loot request | -1 / -1 / +1 |
| Kick / dismiss / party wipe | -3 / -3 / +3, -1 / -1, -2 / -2 |
| Insult them (LLM off) | -3 / -3 / +3. **Blocks friendship forever**, because event counts never decay. |
| Take a mob they hit in the last 15 s (within 900) | -2 / -1 / +3, a warning line, and about 25% chance an average bot attacks you (cap 80%, cooldown 120 s). |
| Attack / kill them | -4 / -4 / +6 (+2 fear) per minute; a kill is -8 / -8 / +12 (+6 fear). Their party defends them; 30% shout in global chat. |

**Trust pays off:**
- Negotiation prices: -8% if trusted, -4% if friendly, +6% if wary.
- Buff service: x0.9 at trust 8 or more, x1.1 at trust -5 or less.
- Crafting fees follow empathy and trust.

**Bots refuse your party** at trust -6 or less, hostility 10 or more, a level gap over 12, during a mutual clan war, or while you're attacking them.

**Friends** need trust 6 or more, never insulted, and not abandoned in the last 5 min.

**These do nothing today:**
- Ordinary buffs.
- Praise: there is no event for it.
- With the LLM on, every chat line is just "chat" (+1 familiarity).
- Raids: they're excluded from social memory.
- Clan invites: bots accept them automatically, even from someone who just killed them (`Network/Request/RequestJoinPledge.js`).

## 3. When bots attack you

- **Scripted PK bots are gone.** `Bot/PkProfiles.js` (7 PKs) still exists, but nothing loads it. The spawning code was removed as dead code in a2aed31b2 (2026-11-03), and `PkHuntingState` never runs.
  - The persona traits `pvp` (brawler 0.85) and `justice` (justice keeper 0.85) are stored, but nothing reads them.
- **A non-red player is attacked only for:** revenge, mob stealing, clan war, self-defense, or helping a party member.
- **Revenge** (`Social/RevengePolicy.js`, `Bot/AI/BotRevenge.js`):
  - **Thresholds:** personal hostility 12 or more with trust -5 or less, plus "effective" hostility 24 or more (its own plus half its clan's).
  - **Kills needed:** one kill (about 18 hostility) is enough for a clan bot; a clanless bot needs about two.
  - **Chance:** capped at 35%, then reduced by caution, empathy, fear (each kill adds +6 fear) and the karma cost of hitting a non-red player. The research's rough math is about 2% for an average bot and 11% for a brawler after two kills.
  - **Bug:** the bot judges you once per hunting spot, when you first come into view. That's up to 6,000 units away (`World/WorldConstants.js`), but the decision needs you within 900 (`RevengePolicy NOTICE_RADIUS`). So the one roll is almost always used up as `too_far`. Checked by reading the code.
- **If you're red (karma):** every hunting bot within 1,500 units weighs fight or flee (`AI/BotPvpRisk.js`). The score counts:
  - visible gear (+/-3.75)
  - its allies (+1.4 each)
  - you targeting it (+0.75)
  - its own HP (-3.5 below 25%, -1.75 below 45%)
  - support classes (-0.35)
  - `pvpAggression`

  25% of fighters call "Everyone, attack the PK!".
- **Self-defense:**
  - Parties always fight back.
  - A solo bot fights only if it thinks it can win, judging you by **visible gear only, never level** (`VisibleStrength.js`).
  - At 15% HP it makes one flee roll.
- **`[BotPopulation] pvpAggression`** (0..1, default 0.5) scales every attack chance and the retreat point. At 0, bots only defend.
- **Far (cold) bots never meet you.** Cold PvP only happens between far bots.
- **Being hunted on purpose only happens through clan war.**
  - A war party of 3-9 bots with a healer travels to where a clan member saw you (kept 15 min). At most 4 operations run at once.
  - A bot clan declares war on its own only on clans of level 3 with 15 or more members, after hostility 25 and 3 harm episodes in 3 days.
  - A personal "settle scores" wish exists (`Bot/Economy/WishProviders.js`), but nothing carries it out.
- **Never:** in peace zones or arenas. Bots never go looking for flagged (purple) players.

## 4. Progress and your influence on it

**How bots grow:**
- XP comes from simulated fights when far and real kills when near.
- Class changes are automatic at 20 / 40 / 76.
- Gear comes through the wish network, the trade board, crafting and safe enchanting.
- Clans: founders need level 20 and a quorum of 5; at most 40 bot clans.

**Speeds one up:** partying with it (real party XP), trading or selling it gear (equipped at once), filling its buy stores, resurrecting it before the death penalty, and the trust discounts.
**Slows one down:** killing it (C4 death XP loss plus frustration), and taking its mobs (lost kills, a failed 50-kill stay).

## 5. Gaps worth fixing (by hook point)

1. **No PKers.** Hook: `Bot/AI/BotPersonaTypes.js` inclinations into `RevengePolicy`, a PK chance in `EnemyMet` / `BotRevenge`, or bringing back `PkProfiles`.
2. **Revenge on sight mostly misses** (the 6000 vs 900 gap). Hook: `BotRevenge.playerSeen` / `meet`. Keep a watch list until you're within 900, and re-check in `BotPvpDefense.tick`.
3. **Revenge chances are tiny and fear cancels them.** Hook: the weights in `RevengePolicy.evaluate`.
4. **No personal manhunt.** "Settle scores" has no executor. Hook: `WishProviders.js` plus a cold step reusing `Clan/ClanWarDirector.js` sighting and travel.
5. **Bots killed by you don't avoid that spot.** PvP deaths are left out of spot risk. Hook: `Bot/Population/BotLifeState.js` `recordNearFight`.
6. **Etiquette is one-sided.** Your target is never "claimed", so bots can take your mobs without a word. Hook: `HuntingState.claimedTargetIds`, `BotMobCompetition`.
7. **You don't occupy a spot.** You're absent from `SpotOccupancyIndex` / `SpotRecords`.
8. **Speech barely matters.** There's no praise, everything is "chat" with the LLM on, and insults are permanent. Hook: `BotDialogueArbiter.route`, `BotFriendship.request`.
9. **Defined but never sent:** `gift`, `buff_service`, `crafted_for`, `loot_taken`. Hook: `BuffService`, `CraftWorkshopService`, item pickup.
10. **Clan invites are always accepted.** Hook: `RequestJoinPledge.js` with `BotAvailability.socialRefusal`.
11. **No gossip.** Bystanders, clanmates and PK witnesses don't react or remember. Hook: `BotPvpThreats.record`, `BotGlobalChat.announceAttack`, `HuntingState` PK block.
12. **Small player clans can't be targeted by bot clans** (minimum 15 members). Hook: `Clan/ClanWarRules.js` `MIN_MEMBERS`.
