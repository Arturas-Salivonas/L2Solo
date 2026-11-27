## What

Jackson (Talking Island, 7002), Payne (Elven Village, 7136) and Ariel (Dark Elven Village, 7148) sold fighter armor only, so a new mystic had to walk to the Orc or Dwarven village or Gludin for a tunic.

The header of `NpcShopBuyLists.js` already says Jackson's armor was "a partial location-page seed".

## C4 reference

- **Lisvus fdc7e33a:** every starter armor dealer has two buy lists, fighter armor and the ten No-Grade robe pieces:
  - 11/12 for 7002
  - 33/34 for 7136
  - 39/40 for 7148
  - 77/78 for 7517
  - 83/84 for 7559
- **L2J Mobius C4:** the same ten ids (files 3000201, 3013601, 3014801, 3051701, 3055901).
- **Not sold:** no C4 NPC sells the Apprentice's set, Cotton Robe, Robe of Devotion or Robe of Magic (GM shops 1001/1002 only), so those are left out.

## Change

- **The list:** those ten pieces were already this file's `orcRobes` list for Kunai (7559), at the same C4 prices (1.15 × each item's price).
- **Renamed:** the list is now `starterRobes`.
- **Who sells it:** 7002, 7136 and 7148 get it beside `starterArmor`, and Kunai keeps it. No new item or price.
- **Tables:** the bot tables read the shop lists (`sources.json` keeps each item's offers per NPC and town), so they are rebuilt in this PR (`tables/all`).

## Tests

- **New:** `tests/test_starter_village_robes.js` checks that all five starter armor dealers sell the ten robe pieces at the C4 prices and still sell fighter armor.
- **Existing, all pass:** `test_npc_shop_unpriced_rows`, `test_npc_shop_stock`, `test_npc_shop_fallback_list`, `test_static_merchant_pricing`, `test_bot_market_price_alignment`, `test_item_acquisition_catalog`.
- **Played** on a local server: the robes are on sale at all three dealers.
