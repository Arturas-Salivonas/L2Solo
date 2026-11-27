## What

Bots now pick up items lying on the ground that are nobody's any more: a player's discard, a PK's drop, or a monster drop its owners walked away from.

Today a bot only ever picks up its own party's drops. `PartyCompanionService` reads `GroundItems.ownedBy`, and unowned items are kept out of that index. So anything a player drops in town lies there for good, and no bot ever takes a drop its owners left.

## How it works (`Bot/AI/BotFreeLoot.js`)

- **Free:**
  - an unowned item, 3 s after it fell
  - another party's drop, once 15 s have passed (L2J keeps a drop its killer's for 15 s)
  - never the bot's own party's drop: its party loot takes those
- **Who:** a hot bot of its own: no player's companion, store or service. It must be alive, not fighting (no PvP, swing, cast, target or monster on it), and in a `hunting`, `resting` or `shopping` plan.
- **Whether:** one seeded roll per (bot, item) by persona (`TendencyRoll`). Ambition draws it, empathy holds it back, and Adena tempts more: about 0.3 for an average bot, 0.5 for Adena.
- **One bot per item:** a 12 s claim on the item, within 700 units, on a straight run.
- **The pickup:** through the native pickup (`Generics.pickupExec`, so `PickupItem`'s atomic claim and bag checks apply). A fight ends the run and the bot leaves that item.
- **Lookups:** `GroundItems` now also keeps every item by a 1024-unit map cell with the time it fell. A bot reads the cells near it instead of every spawn, and `put`/`take` keep the index.
- **Setting:** `[BotPopulation] freeLootEnabled = true` (documented in `config/default.ini`).

## Tests

- **New:** `tests/test_bot_free_loot.js` covers:
  - the cell index
  - what is free and when
  - persona interest
  - one bot per item
  - busy bots
  - the switch
  - interruption
- **Existing, all pass:** `test_ground_item_pickup_race`, `test_ground_item_visibility`, `test_hot_ground_loot`, `test_party_bot_loot`, `test_party_combat_loot`, `test_party_loot_capacity`, `test_party_loot_toggle`, `test_pickup_c4_timing`, `test_pickup_session_lifecycle`, `test_pk_drop_pickup_enchant`, `test_spawn_drop_height`, `test_npc_reward_non_stackable_amount`, `test_hot_background_party`, `test_clan_command_parties`.
- **`npm run check`** passes. None of the changed files are bot table inputs.
- **Played** on a local server: bots in town pick up dropped items and Adena.
