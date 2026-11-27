# Lineage II C4 (Scions of Destiny) - Reference for Bot AI

Target: a Chronicle 4 server (client protocol 656). Purpose: era-correct facts and believable player behaviour for bot AI. Compiled Nov 2026 from C4-era sources (official patch notes mirrored on lineage2wiki.org, C4 client data, L2J C4 datapacks, archived official guides). Sources at the end.

**Legend**
- "(unverified)" = not confirmed against a C4 source; use as a default and keep it configurable.
- "[L2J]" = value from a C4 emulator (L2JLisvus or L2J Mobius C4). Close to retail, not guaranteed.
- "[PN]" = official patch notes C1-Interlude (lineage2wiki.org mirror).
- RB = raid boss, SS = soulshot, SPS = spiritshot, BSPS = blessed spiritshot, AA = Ancient Adena.

---

## 1. Chronicle timeline

| Chronicle | Korea | North America | Max level |
|---|---|---|---|
| Prelude (C0) | 1 Oct 2003 | 28 Apr 2004 | 75 (unverified) |
| C1 Harbingers of War | 28 Jan 2004 | 28 Jun 2004 | 75 |
| C2 Age of Splendor | 11 Aug 2004 | 8 Dec 2004 | 75 |
| C3 Rise of Darkness | 2 Mar 2005 | 10 May 2005 | 75 |
| **C4 Scions of Destiny** | **26 Oct 2005** | **8 Feb 2006** | **78** |
| C5 Oath of Blood | 1 Jun 2006 | 6 Sep 2006 | 80 |
| Interlude | 13 Dec 2006 | 11 Apr 2007 | 80 |

Dates from Wikipedia; feature lists from [PN].

### What each chronicle added
- **Prelude:** base game. 5 races, base class plus 1st (20) and 2nd (40) professions; Talking Island, 4 racial villages, Gludin/Gludio/Dion/Giran/Oren mainland.
- **C1 Harbingers of War:** Aden territory (Aden Castle and Town, Cave of Giants, Anghel Waterfall, Forest of Mirrors, Cemetery, Seal of Shilen), Blazing Swamp, Tower of Insolence, Lair of Antharas, Hardin's Academy, Giran Harbor, Bandit Stronghold. Sieges at 5 castles (Gludio, Dion, Giran, Oren, Aden), 2 h, leader engraves the artifact, mercenaries, siege HQ. Antharas (Portal Stone, level 50+). Boss monsters. Clan hall auctions. Alliances (5 clans). Freight. Weight rework.
- **C2 Age of Splendor:** Innadril Castle (Heine). Coliseum, Monster Derby, lottery. Manor. Devastated Castle clan hall battles. Baium and Zaken plus many RBs. Weapon Special Abilities (C-grade+) via soul crystals. Armor set bonuses. Full-body armor safe to +4. Symbols/dyes. Swimming, falling damage. Treasure chests and mimics. Alliances up to 12 clans.
- **C3 Rise of Darkness:** Seven Signs (Dawn/Dusk, seal stones, Festival of Darkness, 8 Necropolises, 6 Catacombs, Anakim/Lilith). CP. Subclasses (Mimir's Elixir). A-grade sets (Dark Crystal, Tallum, Nightmare, Majestic), sealed A items. Clan halls in Aden/Gludio/Gludin/Dion. Wyverns for lords. Auto siege alliance of attackers. Bigger party bonus. Chaotic with 5 or fewer PKs stop dropping items. Notes say Hero "will be implemented later".
- **C4 Scions of Destiny (this server):**
  - Level cap 75 -> 78. 3rd class at 76 ("Saga of ..." quests). Skill enchanting after 3rd class (first try needs Secret Book of Giants).
  - Noblesse, Grand Olympiad, Hero - all new in C4.
  - Rune territory (Valley of Saints, Beast Farm, Forest of the Dead, Swamp of Screams, Devil's Pass) and Goddard (Wall of Argos, Hot Springs, Garden of Beasts, Ketra/Varka outposts, Imperial Tomb, Four Sepulchers, Forge of the Gods, Hall of Flames). Goddard Castle (two altars); Rune town but no castle yet.
  - Valakas. S-grade (Imperial Crusader, Draconic, Major Arcana; Forgotten Blade, Heaven's Divider, Angel Slayer, Draconic Bow...). Level 13 soul crystals. Epic jewelry (Queen Ant, Core, Orfen, Zaken, Baium, Antharas, Valakas).
  - Blessed Enchant Scrolls (fail = back to +0, item kept). Dimensional Rift. Fishing.
  - Baby pets (Buffalo, Cougar, Kookaburra); hatchlings split into Wind (fighter), Star (mystic), Twilight (movement).
  - Clan wars reworked (level 3+ clan, 15+ members, max 30 declarations). Command channels (level 5 clan leader, 50 parties). Private crafting stores. 12-man party matching rooms. Adventurer's Guildsman.
  - Mob AI: item users, healers, resurrectors, trap setters, disease spreaders. Free Rune-Gludin ferry. Up to 4 sieges at once. Clan halls in Giran (5) and Goddard (4).

### NOT in C4 (do not build these)
- **C5 Oath of Blood:** Rune and Schuttgart castles; Schuttgart zones (Frozen Labyrinth, Den of Evil, Ice Queen's Castle, Crypts of Disgrace, Pavel Ruins); Pagan Temple, Stakato Nest, Monastery of Silence; clan reputation, clan skills, Academy, Royal Guards, Knights, clan levels 6-8, social ranks; Clan Apella/Oath armor; Frintezza (Last Imperial Tomb); Zariche; **mob-dropped herbs**; levels 79-80; 3rd class on subclasses; hero skills; Wild Beast Reserve / Fortress of the Dead / Rainbow Springs hall wars; Courage Charms, Life Crystals, +6 set bonus, night fishing, Tiny Baby pets.
- **C5 skills:** Rapid Fire, Dead Eye, Stealth, Sand Bomb, Arrest, Angelic Icon, Tribunal, Judgment, Shackle, Zealot, War Frenzy, Fell Swoop, Polearm Accuracy, Hawk Spirit Totem, Spirit/Blessing/Pain of Sagittarius, Psycho Symphony, Demonic Blade Dance, Betray, Mass Fear, Greater Might/Shield, War Chant, Earth Chant, Major Heal, Mana Burn, Erase, Trance, Clarity.
- **Interlude:** Augmentation; Primeval Isle and Sailren; Akamanah; shadow weapons; dueling; CC-size loot rules; Shock Stomp, Sonic Move, Mirage, Escape Shackle, Break Duress, Banish Seraph, Celestial Shield, Attract Cubic, Swoop Cannon, Battle/Spell Force, all 79-80 skills; reduced XP loss above 76.
- **Kamael and later:** Kamael race, fortresses, transformations, Hellbound, elemental attributes, Dynasty/Vesper gear, Territory Wars, vitality, Beleth, Freya.
- **Custom, not retail:** NPC buffers, offline shops, marriage system (C4 only has Wedding Formal Wear), global trade chat by default, GM shops selling graded shots.

---

## 2. Races, classes, roles

- 1st class at 20, 2nd at 40, 3rd at 76 (new). **Max level 78.** Expertise: D 20, C 40, B 52, A 61, S 76.
- 2nd classes learn 40-74; 3rd classes learn 76-78 (all get Wisdom 76, Skill Mastery 77; most get Health 76).
- **Race traits** (general knowledge): Human balanced, only race with Bishop and Prophet. Elf fastest run/cast, high DEX/WIT, low HP. Dark Elf highest STR/INT (damage), low CON. Orc highest CON/MEN, huge HP, slow casting, strongest party/clan buffs. Dwarf fighter-only, spoil or craft, more inventory/weight, 4 store slots.

### Class tree with roles
```
HUMAN FIGHTER
  Warrior        Gladiator -> Duelist             melee DD, duals
                 Warlord -> Dreadnought           melee DD, polearm AoE, mass pull
  Human Knight   Paladin -> Phoenix Knight        tank, holy, self-heal
                 Dark Avenger -> Hell Knight      tank, panther, reflect
  Rogue          Treasure Hunter -> Adventurer    dagger
                 Hawkeye -> Sagittarius           archer
HUMAN MYSTIC
  Human Wizard   Sorcerer -> Archmage             nuker, fire
                 Necromancer -> Soultaker         nuker/debuffer, curses
                 Warlock -> Arcana Lord           summoner, cats
  Cleric         Bishop -> Cardinal               main healer, mass res
                 Prophet -> Hierophant            buffer
ELF FIGHTER
  Elven Knight   Temple Knight -> Eva's Templar   tank, cubics
                 Swordsinger -> Sword Muse        songs, off-tank
  Elven Scout    Plains Walker -> Wind Rider      dagger, fastest
                 Silver Ranger -> Moonlight Sentinel  archer, kiter
ELF MYSTIC
  Elven Wizard   Spellsinger -> Mystic Muse       nuker, water, slows
                 Elemental Summoner -> Elemental Master  summoner, unicorns
  Elven Oracle   Elven Elder -> Eva's Saint       healer, recharge, buffs
DARK FIGHTER
  Palus Knight   Shillien Knight -> Shillien Templar  tank, cubics, debuffs
                 Bladedancer -> Spectral Dancer   dances, off-tank
  Assassin       Abyss Walker -> Ghost Hunter     dagger, top burst
                 Phantom Ranger -> Ghost Sentinel archer, debuffs
DARK MYSTIC
  Dark Wizard    Spellhowler -> Storm Screamer    nuker, wind/dark
                 Phantom Summoner -> Spectral Master  summoner, shadows
  Shillien Oracle  Shillien Elder -> Shillien Saint  healer, recharge, Empower
ORC FIGHTER
  Orc Raider     Destroyer -> Titan               melee DD, 2h, low-HP burst
  Orc Monk       Tyrant -> Grand Khavatari        melee DD, fists, totems
ORC MYSTIC
  Orc Shaman     Overlord -> Dominator            clan buffer, AoE seals
                 Warcryer -> Doomcryer            party buffer (chants)
DWARF FIGHTER
  Scavenger      Bounty Hunter -> Fortune Seeker  spoiler, melee
  Artisan        Warsmith -> Maestro              crafter, golems
```
9 base, 18 first, 31 second, 31 third classes. No Dwarf mystic.

### 3rd class signature skills (C4)
| Group | Skills |
|---|---|
| Tanks (PK, HK, ET, ST) | Fortitude toggle 76; Vengeance (AoE aggro, self-root) and Shield Slam (PK/HK) / Shield Bash (ET/ST) 77; Touch of Life (PK/ET) / Touch of Death (HK/ST) and Physical Mirror (PK/HK) / Magical Mirror (ET/ST) 78 |
| Daggers | Lethal Blow 76, Bluff 77 (stun + turns mob around), Focus Skill Mastery + Focus Chance/Power/Death 78 |
| Archers | Lethal Shot 76, Hamstring Shot 77, Focus Skill Mastery 78, Evade Shot 78 (MS, GS) |
| Nukers | Vortex nukes (Fire AM; Light, Ice MM; Dark, Wind SS); Arcane Power toggle (drains HP) + Arcane Chaos 78. Soultaker: Dark Vortex, Curse of Doom, Mass Warrior/Mage Bane, Curse of Abyss |
| Summoners | Warrior/Mage Bane; new servitor (Warrior AL, Wizard EM, Assassin SM); Arcane Agility + Final Servitor 78 |
| Healers | Balance Life (Card) or Arcane/Elemental Protection 76; Divine Protection, Block Shield / Block Wind Walk 77 (mass on Cardinal); Arcane Wisdom 78 |
| Buffers | Prophecy of Fire (Hiero), Water (ES), Wind (SS). Doomcryer: Chant of Spirit 77, Chant of Victory 78 (40 Spirit Ore). Dominator: Seal of Disease, Eye/Soul of Paagrio, Seal of Despair |
| Dance/song | Sword Muse: Song of Renewal, Meditation, Champion. Spectral Dancer: Dance of Shadow, Medusa (petrify), Siren |
| Melee | Duelist: Riposte Stance, Sonic Rage. Dreadnought: Shock Blast, Earthquake, Parry Stance. Titan: Armor Crush, Earthquake, Parry Stance. Grand Khavatari: Riposte Stance, Force Rage |
| Dwarves | Fortune Seeker: Spoil Crush 76. Both: Riposte Stance, Armor Crush, Parry Stance, Earthquake |

---

## 3. How players actually played each archetype (bot playbooks)

Skill data from lineage2wiki C4 class/skill pages, cross-checked against L2J Mobius C4. Rotations are era-typical play built on those skills; no official rotations were ever published.

### Verified timings
| Thing | Value |
|---|---|
| Prophet/Cleric-line buffs | 20 min, cast 4 s, reuse 6 s |
| Warcryer chants | 20 min, whole party within 1000, cast 2.5 s |
| Overlord "of Paagrio" buffs | 20 min, **clan members** within 400 (not party) |
| Songs / dances | 2 min, cast 2.5 s, reuse 10 s, 60 MP base + extra per song/dance already active; dances need dual swords |
| Stuns (all 9 s) | Stun Attack / Hammer Crush (blunt, 50%, reuse 13 s); Shield Stun (80%, 12 s); Stun Shot (bow, 50%, 10 s, range 900) |
| CC | Sleep 30 s (range 600); Dryad Root 30 s; Anchor 120 s (reuse 180 s); Ice Bolt Speed -30 for 120 s |
| Self | Ultimate Defense 30 s (Lv2 +3600 P.Def / +2700 M.Def, long reuse); Ultimate Evasion 30 s (reuse 30 min); Rage 90 s (P.Atk +45/55%, P.Def -20%); Frenzy/Guts at HP 30% or less, 90 s; Battle Roar 10 min; Snipe 2 min (self-root, crit +20) |
| Aggro | Aggression reuse 3 s, range 400/600/800; Hate Aura reuse 3 s, single target to Lv12, area (r200, 10 mobs) from Lv13 |
| Recharge | cast 6 s, reuse 12 s, range 400, **cannot target self** |
| C4 rules | Sleep/Hold/Paralysis give brief immunity after landing (no chain-sleep); area skills capped at 20 targets outside PvP; Cancel reuse 120 s |

### Generic combat loop (all classes)
1. **Pre-fight:** toggles on; rebuff anything under 60 s; shots in stock; HP/MP above thresholds.
2. **Target:** party = the main assist's target (usually the tank). Solo = nearest non-aggro mob within +/-5 levels (mobs more than 5 below give an XP penalty).
3. **Open:** ranged at max range; melee after the tank has 2-3 s of hate.
4. **Sustain:** core skill on cooldown, auto-attack between, shots on.
5. **After:** sweep (BH), loot, sit if MP < 30-40% or HP < 50% (sitting regens much faster).
6. **Emergency (HP < 30%):** defensive skill (UD, UE, Fake Death, Frenzy/Guts), retreat to the healer, potion. Healing Potions and CP potions (C3+) exist.

### Tanks: Paladin, Dark Avenger, Temple Knight, Shillien Knight
- **Gear:** 1h sword or blunt, shield, heavy armor.
- **Pull:** Aggression from range, step back so the mob walks to the party's camp spot.
- **Hold:** Hate Aura (Lv13+ is area) on 2+ mobs; Aggression on anything hitting the healer; re-taunt the mob taking the most DD damage every 3-6 s.
- **Mitigation:** Majesty, Iron Will, Deflect Arrow; toggles Holy Armor (Pala), Guard Stance (TK/SK), Aegis Stance (Pala), Shield Fortress (all at 64); Ultimate Defense as panic button.
- **Paladin:** Holy Blessing self-heal, Sacrifice (heals ally with own HP), Holy Strike / Sanctuary vs undead, Shield Stun to peel mobs off mages.
- **Dark Avenger:** Dark Panther (C crystals, takes 15% XP), Reflect Damage, Horror (fear) to scatter adds, Hamstring (slow) on runners, Life Scavenge (heal from corpse), Drain Health. Solos well: panther tanks, DA drains.
- **Temple Knight:** Life Cubic (heals the knight) + Storm Cubic, Holy Aura (area hold on undead), Entangle (slow), Charm (lower a mob's hate), Spirit Barrier, Aegis. Most self-sufficient tank.
- **Shillien Knight:** Phantom (debuff), Vampiric (drain) and Viper (poison) cubics; Lightning Strike (120 s paralyse, 20% base), Hex (P.Def -23%), Power Break, Freezing Strike, Confusion. The debuff tank.
- **Bot rules:** never drag mobs off the camp spot; turn the mob's back to the party so daggers can reach it; announce pulls ("inc 3"); stop pulling when the healer has < 30% MP or buffs are about to drop.

### Melee DD
- **Gladiator (duals):** Focus Sonic builds charges (up to 7). Spenders: Double Sonic Slash (2), Triple Sonic Slash (3+), Sonic Blaster (ranged, good pull), Sonic Storm (ranged AoE), Sonic Buster (cone); Triple Slash as filler. Self: War Cry, Duelist Spirit (Atk.Spd, Lv2 at 72), Vicious Stance (crit damage, MP drain), Accuracy. Loop: top charges between mobs, pull with Sonic Blaster, DSS/TSS on cooldown.
- **Warlord (polearm):** auto-attacks hit several mobs; Whirlwind (reuse 17 s), Thunder Storm (area + stun chance); Provoke pulls a whole area; Howl (area P.Atk down); Wrath (CP drain, PvP). Self: Thrill Fight, Battle Roar, Lionheart, Revival (big heal at 10% HP or less), Focus Attack. The mass-pull AoE farmer with BD/SWS and a healer.
- **Destroyer (2h):** Battle Roar, Rage, Vicious Stance; at HP 30% or less Frenzy (huge P.Atk) + Guts (P.Def). Destroyers deliberately fought at low HP with a healer watching - an iconic risky style worth copying. Crush of Doom (stun chance), Fatal Strike, Hammer Crush, Whirlwind.
- **Tyrant (fists):** Focus Force (up to 3 charges) -> Force Blaster (ranged), Force Buster (cone), Force Storm (ranged AoE), Hurricane Assault (2 charges). Burning Fist, Soul Breaker (stun), Punch of Doom (big hit, brief self-stun), Cripple (slow), Fist Fury toggle (Atk.Spd, drains HP). One totem at a time (2 min): Wolf speed; Bear P.Atk, slower; Puma Atk.Spd + evasion, P.Def down; Ogre P.Atk/P.Def/HP/accuracy, slower; Rabbit speed + evasion, P.Atk greatly down (for running away); Bison P.Atk + crit, HP greatly down. Bot: Bear or Ogre to level, Puma for burst, Rabbit only to flee.

### Daggers: Treasure Hunter, Plains Walker, Abyss Walker
- **Damage:** Backstab (power to 5479, reuse 11 s, from behind), Deadly Blow (same power, any angle), Mortal Blow (low levels), Bleed (DoT), Blinding Blow (PW/AW 66).
- **Aggro tools:** Switch (mob changes target), Trick (mob loses the will to attack), Veil (TH/AW, discourages aggression), Lure (quiet single pull), Charm (PW).
- **Toggles:** Silent Move (mobs do not pre-emptively aggro - walk through aggro zones), Fake Death (TH/PW), Vicious Stance, Rest of Chameleon (PW). Escapes: Dash (TH) / Sprint (PW), Ultimate Evasion.
- **AW extras:** Hex, Power Break, Poison, Freezing Strike, Sting. Highest damage, lowest HP.
- **Party loop:** wait 2-3 s for tank hate; move to the point opposite the tank, ~30-40 units behind the mob; Backstab -> Deadly Blow -> Bleed, auto-attack between; if the mob turns, Trick/Switch and re-position.
- **Solo loop:** Silent Move on, Lure one mob, Deadly Blow, Bleed, hit and run; Dash out at HP < 40%; Fake Death last (drains MP).
- **Chests:** Unlock (needs Key of a Thief) opens C4 treasure chests and doors. Mimics exist.
- **3rd class:** Lethal Blow (instant-kill chance), Bluff (stun + turn the mob, enables solo Backstab).

### Archers: Hawkeye, Silver Ranger, Phantom Ranger
- **Shared:** Double Shot (main), Stun Shot (9 s, reuse 10 s), Rapid Shot (Atk.Spd buff - not C5 Rapid Fire), Soul of Sagittarius (max MP), Vicious Stance; Quiver of Arrow A (66) / S (72) makes arrows. Range about 900 (general bow range unverified).
- **Hawkeye:** Hawk Eye (target P.Def down, own accuracy up), Burst Shot (AoE), Snipe at 60 (self-root, crit, range) for static/raid DPS.
- **Silver Ranger:** Entangle (slow), Charm, Sprint, Spirit Barrier, Elemental Heal, Burst Shot. Best kiter.
- **Phantom Ranger:** Hex, Power Break, Poison, Freezing Strike (slow), Fatal Counter (stronger at low own HP), Sting. No Burst Shot or Snipe.
- **Solo kite loop:** shoot at max range; at ~250 range Stun Shot (or Entangle / Freezing Strike), run back 400-500, turn, shoot. Pull singles only; never run into unexplored aggro.
- **Party:** archers often pull (shoot one, run to the tank), then Double Shot on cooldown at the assist target; Hawkeye uses Snipe on bosses.
- **Money:** D/C bows burn 6-10 SS per shot, so archers are the poorest class at low grades. Bots turn SS off on trivial mobs.

### Nukers: Sorcerer, Spellsinger, Spellhowler, Necromancer
- **Sorcerer (fire):** Prominence (main), Aura Bolt (cheap, fast finisher), Aura Flare (close), Blazing Circle (PBAoE), Rain of Fire (AoE, 58), Decay (DoT); Surrender to Fire/Wind; Sleep, Sleeping Cloud, Slow, Cancel; Blazing Skin (reflect). Force chain 66-72: Seed of Fire, Aura Symphony, Inferno, Elemental Assault.
- **Spellsinger (water):** Hydro Blast (main), Frost Bolt (damage + speed down = the kiting tool), Ice Dagger (bleed), Freezing Shackle (drain DoT), Frost Wall, Aqua Splash (AoE, 58), Solar Flare (holy); Mana Regeneration (costs Spirit Ore), Freezing Skin; Seed of Water x2 -> Blizzard (slows). Kite loop: Frost Bolt, back off, Hydro Blast, back off - a slowed melee mob never reaches her.
- **Spellhowler (wind/dark):** Hurricane (main), Shadow Flare, Vampiric Claw (drain), Death Spike (needs Cursed Bone), Tempest (AoE), Curse Death Link (stronger at low own HP); Silence, Sleep, Slow; Surrender to Wind/Poison, Curse Chaos.
- **Necromancer:** Curse Fear, Curse Discord (mob hits its ally), Anchor (2 min paralyse), Silence, Curse Gloom, Curse Disease, Curse Weakness, Mass Slow; Vampiric Claw, Death Spike, Corpse Burst, Curse Death Link; Reanimated Man (44), Corrupted/Cursed Man (need corpses); Corpse Life Drain, Transfer Pain. Plays as controller: Anchor/Fear the add, nuke the main.
- **Mana:** MP potions are not a shop item in C4 (unverified). Human/DE mages have Body to Mind (HP to MP); Spellsinger uses Mana Regeneration instead (Body to Mind not shown on her page, unverified). Sit between pulls, ask EE/SE "mp pls", finish with Aura Bolt, keep ~20% MP in reserve for a Sleep. Bot rule: MP per kill must stay below MP regen over the hunt.
- **Party AoE:** tank or Warlord gathers, 2-4 nukers fire AoE together (20-target cap).
- **BSPS** in parties (much stronger magic), plain SPS solo to save adena (general knowledge).

### Summoners: Warlock, Elemental Summoner, Phantom Summoner
- **Servitors:** Warlock: Kat / Mew (fighter cats), Kai, Queen of Cat (56). ES: Unicorn Boxer (gives MP), Mirage (caster), Merrow, Seraphim (56). PS: Shadow, Silhouette (caster), Soulless, Nightshade (56). They consume crystals over time and take a share of XP.
- **Cubics:** Warlock Storm + Binding (hold); ES Aqua (DoT) + Life; PS Phantom (debuff) + Spark (stun); each has a Mass Summon cubic.
- **Servitor support:** Servitor Heal, Recharge, Physical/Magic Shield, Haste, Empowerment (UD); plus Wind Walk (Warlock), Bright Servitor (ES, M.Atk), Mighty Servitor (PS, P.Atk).
- **Loop:** summon -> buff servitor -> cubics -> pet attack command -> Transfer Pain on (servitor takes part of master's damage) -> Servitor Heal under 50% -> recast cubics when they expire (lifetime unverified).
- **Solo:** servitor tanks, summoner heals it from behind. Slow but safe, good "AFK-looking" bot. **Party:** servitor adds DPS on the assist target; summoner stays out of aggro.

### Healers: Bishop, Elven Elder, Shillien Elder
- **Bishop:** Greater Heal, Greater Battle Heal (fast), Greater Group Heal, Restore Life, Vitalize (heal + cure), Benediction (full party heal, needs own HP 25% or less), Body of Avatar (party max HP), Resurrection (to Lv9, 70% XP back), Mass Resurrection, Purify; undead tools (Might of Heaven, Requiem, Repose, Hold Undead).
- **Elven Elder:** **Recharge** (main job), Greater Heal, Vitalize, Regeneration, Resurrection to Lv7 (60% XP); buffs Might, Shield, Agility, Bless Shield, Advanced Block, Decrease Weight, Mental Shield, Concentration, Wild Magic, Kiss of Eva; Serenade of Eva (area calm), Sleep, Wind Shackle, Party Recall.
- **Shillien Elder:** **Recharge**, Greater Heal, Greater Group Heal; buffs **Empower / Greater Empower** (M.Atk - why mage parties want an SE), Might, Shield, Focus, Death Whisper, Guidance, Vampiric Rage, Wild Magic; Purify, Dryad Root, Wind Shackle. Resurrection rank in C4 (unverified).
- **Bot priority:** (1) tank < 50%: Greater Battle Heal / Greater Heal; (2) self < 50%; (3) 3+ members < 70%: Group Heal; (4) anyone < 40%; (5) EE/SE: Recharge Bishop > nukers > BD/SWS (never self); (6) cure poison/bleed on tank; (7) refresh 20 min buffs between pulls; (8) resurrect after the fight, not mid-pull.

### Buffers: Prophet, Warcryer, Overlord
- **Prophet (PP), single-target 20 min:** Might, Haste, Acumen (cast speed), Focus (crit rate), Death Whisper (crit damage), Guidance (accuracy), Berserker Spirit, Shield, Bless the Body (HP), Bless the Soul (MP), Magic Barrier, Mental Shield, Bless Shield, resists, Wind Walk, Regeneration, Concentration, Invigor, Kiss of Eva; Dryad Root, Word of Fear.
  - Fighter order: Haste, Might, Shield, Wind Walk, Focus, Death Whisper, Guidance, Bless the Body, Magic Barrier, Berserker.
  - Mage order: Acumen, (SE Empower), Wind Walk, Shield, Bless the Soul, Magic Barrier, Concentration, Mental Shield.
  - A full 9-man rebuff (~10 buffs x 4 s each) is about 6 min of casting, so PPs start 2-3 min before expiry and often need Recharge.
- **Warcryer (WC), party-wide 20 min chants:** Battle (P.Atk), Shielding (P.Def), Fire (M.Def), Evasion, Life (HoT), Flame (cast speed), Rage (crit), Vampire (drain), Fury (Atk.Spd), Predator (crit rate), Eagle (accuracy), Revenge (reflect). Fastest buffer: one cast hits the whole party. Also Aura Sink (MP drain), Dreaming Spirit (sleep), Fear, Madness.
- **Overlord (OL), clan-only 20 min:** Power, Glory, Wisdom, Shield, Tact, Blessing, Sight, Rage, Speed "of Paagrio"; Heart of Paagrio (regen), Ritual of Life (CP), Honor of Paagrio (alliance CP); area seals (Binding hold, Slow, Winter, Chaos, Poison, Scourge, Gloom, Mirage, Silence, Suspension, Flame) for sieges/PvP. A clan asset: buffs clanmates in town before hunts and sieges.
- **Stacking:** same-family buffs replace each other (e.g. Haste vs Chant of Fury; general knowledge). C4 buff-slot limit (unverified) - configurable, ~20 is a sane default.

### Dancers and singers: Bladedancer, Swordsinger
- **BD dances (duals, 2 min):** Fire (crit damage), Light (holy), Inspiration (accuracy), Warrior (P.Atk), **Fury (+15% Atk.Spd)**, Mystic (M.Atk), Concentration (cast speed, fewer interruptions), Earth Guard, Protection, Aqua Guard, Vampire. Also Hex, Power Break, Poison Blade Dance (AoE poison), Confusion.
- **SWS songs (2 min):** Warding (M.Def), Earth (P.Def), Water (evasion), Wind (speed), Hunter (crit rate), Life (HP regen), Vitality (max HP), Flame Guard, Storm Guard, Invocation (dark resist), Vengeance (reflect). Also Sword Symphony (AoE, used while fleeing), Entangle, Charm.
- **Sets:** fighter party Fury, Warrior, Fire + Earth, Hunter, Wind, Water, Vitality. Mage party Mystic, Concentration + Warding, Earth, Wind, Life.
- **MP:** each extra song/dance costs more, so BD/SWS need Recharge. Refresh at 10-15 s left, between pulls. Never let Fury drop on a boss. Both wear heavy armor and can off-tank; SWS often tanks small groups at 40-50.

### Dwarves: Bounty Hunter, Warsmith
- **BH:** Spoil before the mob dies, Sweeper on the corpse right after (range 20); Spoil Festival is the area version. Also Hammer Crush (stun), Whirlwind, Fake Death; Weight Limit x4 at 46. Spoil is the main source of crafting mats (Animal Bone, Varnish, Iron Ore, Coal, Charcoal, Thread, Stem, Suede, Silver Nugget, Mithril Ore, Oriharukon Ore, Asofe, Thons, Enria, Mold Glue/Lubricant/Hardener, Metallic Fiber, Cord, adamantite).
- **WS:** Create Item (gear, shots, intermediates), Crystallize, golems (Mechanic Golem, Wild Hog Cannon, Big Boom self-destruct, Siege Golem with blueprint). Usually sits in town with a manufacture store.
- **Party:** BH spoils the tank's target; loot is Finders Keepers or "By Turn including Spoil" so spoil stays with the BH.

### Low levels (1-39)
- Fighters: Power Strike (sword/blunt), Mortal Blow (dagger), Power Shot (bow), Relax. Elf/DE: Attack/Defense Aura. Orc: Iron Body.
- Mystics: Wind Strike to 14, then Ice Bolt, Vampiric Touch, Heal at 7-14. Human Wizards summon Kat/Mew at 20.
- Dwarves: no attack skill until 20; Spoil Lv1 + Sweeper at 10.
- Newbie Guide buffs (C3+) for levels 10-24 in starting towns, until level 25 or 2nd class.

---

## 4. Party play

- **Size:** up to 9. **XP bonus** [L2J, matches C3 notes]: 2 = 1.30, 3 = 1.39, 4 = 1.50, 5 = 1.54, 6 = 1.58, 7 = 1.63, 8 = 1.67, 9 = 1.71. Split by level squared; dead or distant members get nothing (range 1600 XP / 1400 items [L2J]). Big level gaps cut low members out [L2J "auto"; retail unverified] - keep parties within ~5-10 levels.
- **Loot modes:** Finders Keepers, Random, Random including Spoil, By Turn, By Turn including Spoil.
- **Command channel (C4):** party leader who leads a level 5 clan links up to 50 parties (/channelinvite, /channelkick, /channelleave, /channeldelete, /channelinfo). Party matching rooms hold 12.

### Compositions
| Type | Members | Notes |
|---|---|---|
| Duo (20-50) | tank + healer, or dagger/archer + EE/SE | EE/SE duos very common: buffs, heals, recharge |
| Small (20-40) | tank, cleric-line healer, 2-3 DD, spoiler | |
| Classic 9-man (40-76) | tank, Bishop, EE or SE, PP or WC, BD, SWS, BH, 2 DD | the "full party" everyone shouted for |
| Fighter party | tank, Bishop, PP, WC, BD, SWS, 2-3 melee/daggers/archers | Fury + Haste + Death Whisper + Focus |
| Mage party | tank or Warlord puller, Bishop, SE, EE, PP (Acumen), BD (Mystic/Concentration), SWS (Warding), 2-3 nukers | puller gathers, nukers AoE together |
| RB party | 1-2 parties: 2 tanks, 2 healers, 1-2 rechargers, buffers, BD+SWS, DD | all members at RB level +8 or lower |
| Epic raid | many parties in a command channel, each with healer + recharger + buffer | Valakas lair max 200 players |

### Pulling and assist
- **Tank** pulls with Aggression or a short run-in, back to a corner camp away from respawns. **Archer/dagger** pull singles (shot or Lure) and run to the tank, who re-taunts. **Warlord** Provoke mass-pulls for AoE parties; SWS or tank grabs strays. The **leader** paces pulls on healer MP ("wait mp", "hold, rebuff").
- **Assist train:** one main assist (MA, usually tank or leader); every DD hits the MA's target via /assist or target-of-target (/assist in the C4 client unverified; the MA pattern is universal). Daggers wait for hate, nukers wait 1-2 tank hits plus a taunt. Kill order: enemy healers/casters, then whatever is on the healer, then the rest; Sleep or Root adds instead of splitting damage.
- **Implementation:** `assistTarget = MA.target`; DD bots only attack `assistTarget`; a per-mob hate model makes the tank re-taunt anything targeting a non-tank.

### Buffs, recharge, res
- **Order:** clan OL buffs (if clanmate) -> PP buffs or WC chants (20 min) -> EE/SE buffs (Empower, Death Whisper, Agility, Bless Shield) -> songs/dances last (2 min). BD/SWS refresh every ~1:45 between pulls; single-target buffers start rebuffing at ~17-18 min; leader calls "rebuff in 2 min, dont pull". Buffs are lost on death (Blessing of Noblesse prevents that); a res'd member is rebuffed before the next pull.
- **Recharge chain:** EE and SE recharge others only, so two elders recharge each other. Priority Bishop > nukers > BD/SWS.
- **Res XP:** Resurrection Lv1-9 = 0/20/30/40/50/55/60/65/70%; Mass Resurrection Lv1-6 = 0/20/30/40/50/55%; Scroll of Resurrection 0%; Blessed Scroll of Resurrection 100%. C4: no need to be in a party to res someone; res'd players come back at 70% HP [L2J]. Dead members wait ("res pls, dont go town").

### Typical exp party by level band
| Band | Spots |
|---|---|
| 20-30 | Ruins of Agony/Despair, Abandoned Camp, Orc Barracks, Forgotten Temple, Maille Lizardmen |
| 30-40 | Cruma Marshlands, Execution Grounds, Wasteland/Ant Nest, Partisan Hideaway, Death Pass, Field of Silence/Whispers, Necropolis of Sacrifice/Pilgrims, Heretics Catacomb |
| 40-52 | **Cruma Tower**, Dragon Valley, Alligator Island, Sea of Spores, Enchanted Valley, Forest of Mirrors, Timak Outpost, Garden of Eva |
| 52-61 | Cemetery, Giant's Cave (55+), Forsaken Plains, Forbidden Gateway, Anghel Waterfall, Devil's Isle, Patriots Necropolis, Apostate Catacomb |
| 61-70 | **Tower of Insolence**, Blazing Swamp, Fields of Massacre, Antharas' Lair (outer), Valley of Saints, Beast Farm, Forest of the Dead |
| 70-76 | Swamp of Screams, Devil's Pass, Wall of Argos, Hot Springs, Garden of Beasts, ToI upper floors, Saints/Disciples Necropolis |
| 76-78 | **Imperial Tomb**, Ketra/Varka, Forge of the Gods, Four Sepulchers, Hall of Flames, Dimensional Rift |

---

## 5. Leveling path and hunting zones

Mob levels from C4 client and emulator data. Aggro = aggressive mob types / all types (L2JLisvus). S = solo friendly, P = party. Uses C4 names (C5 renamed e.g. Partisan Hideaway to Fortress of Resistance).

### 1-20 starter areas
| Race | Zones (mob levels) | Notes |
|---|---|---|
| Human | Talking Island W (4-7), Obelisk of Victory (7-13), Singing Waterfall (10-17), TI East (12-16), Elven Ruins dungeon (median 16) | |
| Elf | Mother Tree (1-14), Elven Forest (7-18), Iris Lake, Elven Fortress dungeon (median 14, 9/25 aggro) | RBs Farakelsus 20, Malex 21 |
| Dark Elf | Shilen's Garden (1-7), Dark Forest (8-12), Swampland, Black Rock Hill (13-17), Spider Nest (16-20), School of Dark Arts (median 15) | aggressive succubi in School |
| Orc | Hero's Valley (4-16), Immortal Plateau (7-20), Frozen Waterfalls, Valley of the Lords (15-21), Cave of Trials (median 18) | Cave of Trials = most aggressive starter dungeon (14/33) |
| Dwarf | Strip Mine (1-3), Western Mining Zone (8-17), Abandoned Coal Mines (10-19), Spine Mountains, Eastern Mining Zone (18-25), Mithril Mines (19-34) | |
| Shared | Neutral Zone (15-30, between Elf and DE villages) | |

At 15-20 everyone moves to Gludin/Gludio.

### 15-40
| Zone | Mobs | Town | Play | Notes |
|---|---|---|---|---|
| Ruins of Agony / Despair | 15-29 | Gludio | S | RBs Soul Scavenger 25, Zombie Lord Crowl 25 |
| Windawood Manor, Maille Lizardmen | 15-30 | Gludio | S | quests |
| Langk Lizardmen, Abandoned Camp | 15-34 | Gludin | S | Ol Mahums at the camp |
| Orc Barracks | 24-34 | Gludin | S | Turek orcs, good adena; Oracle of Dawn nearby |
| Forgotten Temple | 16-35 | Gludin | P | aggressive dungeon |
| Plains of Dion | 23-30 | Dion | S | |
| Cruma Marshlands | 25-47 (median 31) | Dion | S | stakato, spiders |
| Execution Grounds | 25-47 (median 32) | Dion | S/P | undead; Heretics Catacomb nearby |
| Partisan Hideaway, Bee Hive | 23-40 | Dion | S | many 26-35 RBs |
| Wasteland / Ant Nest | 22-39 | Gludio | S/P (nest P) | Queen Ant 40 in the nest |
| Death Pass | 27-40 | Giran | S | low zone in C4 |
| Breka's Stronghold, Gorgon Flower Garden | 30-57 | Giran | S/P | Gorgon: silver nugget, metallic fiber spoil |
| Field of Silence / Whispers | 35-43 | Heine | S | C4 Silence = clone mobs, fast kills |
| Plains of the Lizardmen | 35-45 | Oren | S | |

### 40-61
| Zone | Mobs | Town | Play | Notes |
|---|---|---|---|---|
| **Cruma Tower** | 40-50 | Dion | P | classic 40s dungeon, 11/19 aggro; Core 50 on 3F |
| Dragon Valley | 33-52 | Giran | S/P | skin, varnish, iron ore spoil |
| Alligator Island | 40-45 | Heine | S/P | good adena |
| Garden of Eva (underwater) | 40-50 | Heine | P | aggressive |
| Sea of Spores | 40-60 | Oren | S | Orfen 50 |
| Timak Outpost | 35-54 | Oren | S/P | first soul crystal zone |
| Enchanted Valley | 40-55 | Hunters Village | S/P | good adena |
| Forest of Mirrors | 40-55 | Hunters Village | S/P | Witch Catacomb nearby |
| Outlaw Forest / Bandit Stronghold | 50-60 | Oren | S | |
| Devil's Isle | 40-60 mixed | Giran | P | very aggressive (21/51); Zaken 60 |
| Cemetery | 45-60 | Aden | S/P | undead |
| Forsaken Plains | 54-60 | Aden | S | mithril ore, steel spoil |
| Forbidden Gateway | 50-65 | Aden | P | |
| **Giant's Cave** | 55-79 (median 60) | Aden | P | 13/24 aggro, Thons spoil, good adena |
| Silent Valley | 46-79 | Aden | P | very aggressive |

### 61-78
| Zone | Mobs | Town | New in C4 | Notes |
|---|---|---|---|---|
| **Tower of Insolence** | 60-75 | Aden | no | 32/41 aggro, floor-by-floor; Baium on top |
| Blazing Swamp | 55-75 | Aden | no | |
| Fields of Massacre | 55-76 | Aden | no | Doom mobs (crystal stage 9-10) |
| Antharas' Lair (outer) | 49-75 | Giran | no | 22/25 aggro, adamantite |
| Valley of Saints | 60-76 | Rune | yes | caster mobs; Barakiel 70 |
| Beast Farm | 63-69 | Rune | yes | feed/tame beasts; S/P |
| Forest of the Dead | 63-71 | Rune | yes | day/night spawns; Eilhalder 71 at night |
| Swamp of Screams | 66-74 | Rune | yes | stakatos; zone buffs favour mobs |
| Devil's Pass | 65-73 | Rune | yes | undead swarm at night |
| Wall of Argos | 67-76 | Goddard | yes | Imperial Tomb entrance |
| Garden of Beasts | 69-85 | Goddard | yes | look-alike beasts, different skills |
| Hot Springs | 73-76 | Goddard | yes | diseases that worsen; cured at springs |
| **Imperial Tomb** | 74-85 | Goddard | yes | chamber-by-chamber; ~5.5k adena/kill [L2J] |
| Ketra Orc / Varka Silenos | 68-87 | Goddard | yes | faction quests 74-75 |
| Four Sepulchers | 70-85 | Goddard | yes | quest Four Goblets (74) |
| **Forge of the Gods** | 73-85 | Goddard | yes | S recipes quest, Valakas entry quest |
| Hall of Flames | 78-85 | Goddard | yes | path to Valakas |

All 61-78 zones are party content; only Beast Farm is sometimes soloed.

- **Aggressive zones:** Cave of Trials, School of Dark Arts, Elven Fortress, Forgotten Temple, Ant Nest, Cruma Tower, Devil's Isle, Garden of Eva, Giant's Cave, Silent Valley, ToI, Antharas' Lair, Forest of the Dead, Garden of Beasts, Imperial Tomb, Ketra/Varka, Forge of the Gods, Hall of Flames. Daggers cross them with Silent Move.
- **Teleport hubs:** each town's gatekeeper serves its surrounding zones (Gludin: Orc Barracks, Abandoned Camp, Forgotten Temple, Wasteland; Dion: Cruma, Partisan, Execution area; Giran: Dragon Valley, Antharas, Devil's Isle, Hardin's; Heine: Fields of Silence/Whispers, Alligator Island; Oren: Sea of Spores, Ivory Tower, Hunters Village; Aden: ToI, Giant's Cave area, Blazing Swamp, Fields of Massacre, Forsaken Plains, Rune, Goddard). C4 gatekeepers also sold some Seven Signs dungeon teleports [L2J]. Noblesse get extra teleports. Floran has no gatekeeper (unverified).

---

## 6. Items, grades, shots, gear

| Grade | Expertise | Crystal base price | Gemstone base price |
|---|---|---|---|
| No-grade | 1 | - | - |
| D | 20 | 650 | 1,000 |
| C | 40 | 3,000 | 3,000 |
| B | 52 | 9,000 | 10,000 |
| A | 61 | 15,000 | 30,000 |
| S | 76 | 25,000 | 100,000 |

- **Grade penalty:** wearing anything above your Expertise applies skill 4267. Mobius C4 multiplies Atk.Spd, Cast.Spd, evasion, speed, regen and XP by 0.22 and gives accuracy -20; retail numbers (unverified). Crippling in every version: bots never wear above-grade gear.
- **Shots must match weapon grade.** Crystallize is a Dwarf skill (D at 20 up to S at 70). Items above +3 give more crystals.

### Shots
| Grade | Per attack, melee/mage (SS/SPS) | Bows (SS/SPS) | Base price SS / SPS / BSPS |
|---|---|---|---|
| No-grade | 1-3 / 1-3 | up to 9 / 1-3 | 7 / 15 / 35 |
| D | 2-3 / 2-3 | 6-10 / 2-3 | 10 / 18 / 45 |
| C | 2-3 / 2-3 | 8-10 / 2-3 | 15 / 35 / 90 |
| B | 1 / 1 | 3 / 1 | 50 / 100 / 245 |
| A | 1 / 1 | 2 / 1 | 80 / 120 / 290 |
| S | 1 / 1 | 1 / 1 | 100 / 150 / 350 |

- **Crafting (100% recipes):** SS D = 1 Crystal D + 3 Soul Ore -> 156; SS C = 1 Crystal C + 15 Soul Ore -> 476; SS B = 1 Crystal B + 54 Soul Ore -> 450; SPS/BSPS use Spirit Ore. Soul Ore base 250, Spirit Ore 400. Shot base price = material cost / yield (good price floor).
- **NPC shops** in Mobius C4 sell only **No-grade** shots plus ore; D-S shots are crafted. Retail parity (unverified) but era-typical: **dwarven shot crafters were a core economy role.** Pet SS/SPS (new in C4) sold by Pet Managers.

### Armor sets
| Grade | Heavy | Light | Robe |
|---|---|---|---|
| D | Brigandine, Mithril Heavy | Reinforced Leather, Manticore | Knowledge, Elven Mithril |
| C | Full Plate, Composite, Chain Mail | Drake, Theca, Plated Leather, Mithril Light | Karmian, Demon's, Divine |
| B | Blue Wolf, Doom, Zubei's, Avadon | same four (light) | same four (robe) |
| A (sealed) | Majestic, Nightmare, Tallum, Dark Crystal | same four | same four |
| S (sealed) | Imperial Crusader | Draconic Leather | Major Arcana |

Community picks (unverified, era memory): mages Karmian -> Avadon/Blue Wolf robe -> Dark Crystal/Majestic; fighters Full Plate -> Blue Wolf/Doom -> Majestic/Nightmare; daggers Plated/Drake -> Blue Wolf/Doom light -> Nightmare/Dark Crystal light.

### Signature weapons (typical SA)
| Grade | Fighter | Dagger | Bow | Mage | Other |
|---|---|---|---|---|---|
| D | Elven Long Sword, Claymore, Bonebreaker | Mithril Dagger | Light Crossbow (10 SS) | Staff of Life, Ghost Staff, Atuba | Glaive, Scallop Jamadhr |
| C | Samurai Longsword (Focus/Crit Dmg/Haste), Stormbringer, Katana, Berserker Blade | Cursed Dagger, Dark Screamer, **Crystal Dagger** (Crit Bleed/Poison) | Akat Long Bow, Eminence Bow | Homunkulus's Sword (Acumen), Sword of Delusion, Inferno/Deadman's/Ghoul's Staff | Orcish Poleaxe, Great Pata, Yaksa Mace |
| B | Sword of Damascus, Keshanberk, Great Sword | **Kris** (Evasion/Focus/Back Blow) | Dark Elven Long Bow, **Bow of Peril** (Cheap Shot) | **Sword of Valhalla** (Acumen), Hell Knife, Staff of Evil Spirit | Lance, Bellion Cestus, Art of Battle Axe |
| A | Tallum Blade, **Dark Legion's Edge**, Dragon Slayer | Bloody Orchid, Soul Separator | Carnage Bow, **Soul Bow** (2 SS) | Elemental Sword, Sword of Miracles, Dasparion's, Branch of the Mother Tree | Halberd, Tallum Glaive, Blood Tornado, Meteor Shower |
| S | Forgotten Blade, Heaven's Divider | Angel Slayer | Draconic Bow | Arcana Mace (Acumen), Imperial Staff | Saint Spear, Demon Splinter, Basalt Battlehammer, Dragon Hunter Axe |

- **Duals:** no crystal SA; bonus at +4 or higher (C/B Atk.Spd +4%, Damascus*Damascus accuracy +6, Tallum*DLE HP +15% / MP +20% / CP +30%). C duals from town blacksmiths; A/S duals from the Blacksmith of Mammon (Dualsword Craft Stamp + AA) [L2J].
- **Hero weapons:** "Infinity" series (Blade, Cleaver, Axe, Rod, Crusher, Scepter, Stinger, Fang, Bow, Wing, Spear), picked once, returned after the hero month.

### Sealed A/S armor and jewelry
- A/S **armor and jewelry** drop/craft sealed (weapons are not). Sealed = no set bonus; sealed S armor is also weaker.
- Only the **Blacksmith of Mammon** unseals, for **AA** (~7.5% of base for armor): Tallum Plate 507,750; Majestic Plate 772,500; Imperial Crusader Breastplate 1,072,500; Majestic Necklace 853,669; Tateossian Necklace 975,255.
- Mammon spawns only for the right Seven Signs seal, so **A/S progress depends on Seven Signs**.

### Jewelry
| Grade | Best set | M.Def neck / ear / ring |
|---|---|---|
| D | Necklace of Darkness, Omen Beast's Eye, Mithril Ring | 48 / 36 / 24 |
| C | Binding / Blessed | 64 / 45 / 32 |
| B | Black Ore (tier mates Paradia, Sage's, Holy Spirit, Elemental) | 72 / 54 / 36 |
| A | Phoenix / Majestic (sealed) | 80/60/40 and 85/63/42 |
| S | Tateossian (sealed) | 95 / 71 / 48 |

### Epic jewelry (all new in C4)
| Item | Grade | From | Drop | Main effects (exact numbers partly unverified) |
|---|---|---|---|---|
| Ring of Queen Ant | B | Queen Ant 40 | 30% | MP, poison/hold resist, accuracy, crit damage |
| Ring of Core | A | Core 50 | 30% | MP, poison resist, accuracy |
| Earring of Orfen | A | Orfen 50 | 30% | MP, bleed resist, heal amount up |
| Zaken's Earring | S | Zaken 60 | 100% | MP, bleed/stun/silence resist, heal up, Vampiric Rage effect |
| Ring of Baium | S | Baium 75 | 100% | MP, poison/hold resist, accuracy, crit damage, Atk.Spd and Cast.Spd |
| Earring of Antharas | S | Antharas 79 | 100% | Zaken-type effects, MP cost down, earth resist |
| Necklace of Valakas | S | Valakas 85 | 100% | HP +445, MP, sleep resist, reuse down, P.Atk/M.Atk, fire resist |

Drop chances from wiki/L2J data. Two identical epic rings/earrings apply one effect. Frintezza's Necklace is C5.

---

## 7. Economy and crafting

### Adena sources
- Mob drops. L2J x1 averages per kill: Orc Barracks ~300, Cruma Tower ~800, Enchanted Valley ~1k, Giant's Cave ~1.3k, ToI ~2.8k, Imperial Tomb ~5.5k, Forge of the Gods ~6k.
- NPC sales (half base price), quests (3rd class quest 5M [L2J]), spoil mats sold to crafters, crafting fees, manor crops, castle taxes, **AA** (seal stones -> AA, 1:1 to adena at priests). Necropolis/Catacomb mobs drop seal stones, little adena [PN C3].

### Dwarven and common crafting
| Create Item level | Learned at | Typical output |
|---|---|---|
| 1 | 5 | Steel, Leather, Coarse Bone Powder, Cokes, Braided Hemp |
| 2-4 | 20 / 28 / 36 (Artisan) | D shots, D gear, Cord, Synthetic Cokes, Mithril Alloy, Oriharukon |
| 5-8 | 43 / 49 / 55 / 62 (Warsmith) | C/B gear, Craftsman Mold, A gear, S shots |
| 9 | 70 | S-grade items (new in C4) |

- **Common Craft** (all races, 1-8, 9 at 70): potions, dyes, hair accessories; common recipes come from fishing/clan halls and are consumed on use [PN C4]. Recipe book 50 slots, up to 98 via Expand Craft (fishing skill).
- **60% vs 100% recipes:** most B+ items have both; the 60% (jewelry 70%) needs about half the crystals and a cheaper key part. Example Sword of Damascus 100%: 341 Crystal B, 172 Synthetic Cokes, 172 Mithril Alloy, 86 Enria, 98 Gem B, 2 Craftsman Mold, 13 Blades. D/C are usually 100% only.
- **Key intermediates:** Steel = 5 Varnish + 5 Iron Ore; Coarse Bone Powder = 10 Animal Bone; Synthetic Cokes = Oriharukon Ore + 3 Cokes; Varnish of Purity = 3 Varnish + Stone of Purity + 3 CBP; Mithril Alloy = Mithril Ore + 2 Steel + Varnish of Purity; Oriharukon = 12 Silver Nugget + 4 Oriharukon Ore + Synthetic Cokes; Crafted Leather = 4 Coal + 4 Leather + 4 Cord; Craftsman Mold = 2 Artisan's Frame + 20 Mold Hardener + 5 Enria.
- **High-value raws:** Asofe, Thons, Enria, Mold Glue/Lubricant/Hardener (base 6-12k), from 52+ spoil and the manor. Graded gear also needs "key"/part items (Blades, gemstones, part drops) that are traded.

### Spoil
- Spoil levels at 10, 20, 28, 36, 43, 49, 55, 60, 64, 68, 72; Spoil Festival from 28. Spoil before death, sweep soon after (corpses vanish). Spoil tables differ from drops, so BHs pick zones by spoil: Gorgon Flower Garden (silver nugget, metallic fiber), Dragon Valley (skin, varnish, iron ore), Forsaken Plains (mithril ore, steel), Giant's Cave (Thons), Swamp of Screams (mold glue/hardener).

### Mammon NPCs (Seven Signs)
- **Merchant of Mammon** (Avarice side): enchant scrolls for AA + Blank Scrolls (Weapon B = 500,000 AA + 1,000 Blank Scrolls [L2J]), Gemstone/Crystal A/S, Blessed SoE (150k AA), Blessed Res Scroll (400k AA), dyes.
- **Blacksmith of Mammon** (Gnosis side): unseals A/S, applies A/S SAs, makes A/S duals. **Black Marketeer** (always): removes SAs for AA.
- Mapping per C3 notes and Mobius; one guide says Avarice controls both (unverified for retail).

### Special Abilities (soul crystals)
- Red / Green / Blue crystals, stages 0-13; the colour picks the SA (per weapon). Start with quest **Enhance Your Weapon** (40+): Grand Magisters give a free stage-0 crystal.
- **Leveling:** carry exactly one crystal; use it on a mob at 50% HP or less and land the kill; ~8-10% per kill [L2J]; too-weak mobs "refuse to absorb"; stage 10+ absorbs without targeting.
- **Lowest mob level per stage:** 1-2: 40, 3: 44, 4: 47, 5: 50, 6: 53, 7: 57, 8: 59, 9: 61 (Doom Guard), 10: 63+ (Doom Trooper, Platinum Tribe, Seal Angels). Zones: Timak, Forest of Mirrors, Giant's Cave, Fields of Massacre, Devil's Isle, Garden of Eva, upper ToI, Antharas' Lair.
- **11-12:** RBs - Zaken, Anakim, Lilith (100%, whole party), Baium [L2J], small chances from 70+ RBs (Roaring Skylancer, Eilhalder, Meanas Anor, Antharas Priest Cloe). **13:** Antharas, Valakas (whole party), Ember and Rift boss Anakazel (small chance). Rates vary by source.
- **Cost:** low C = stage 5 + 97 Gem C; top C = stage 8 + 555 Gem C; B = stage 9-10 + Gem B; A = 11-12 + Gem A; S = 13 + 82 Gem S. C/B at town blacksmiths, A/S only at Mammon.

### Enchanting
- Safe +3 (weapons, armor pieces, jewelry), +4 one-piece full body. Normal fail = item destroyed into crystals. **Blessed fail = item kept at +0** (new in C4; from RB drops and Olympiad shop). Crystal scrolls exist in data but no retail C4 source (unverified).
- Rates retail (unverified); Mobius default 100% to safe, 66% to +15, cap +16 - keep configurable. Per-level bonus doubles above +3.
- Scroll base prices weapon/armor: D 50k/6k, C 110k/15k, B 500k/80k, A 1.8M/240k, S 5M/500k.

### Stores, Giran, prices
- Store types: sell, buy, dwarven manufacture, general manufacture. Slots 3 (dwarves 4), up to 6/7 with Expand Trade (fishing skill, 40/55/65). Inventory 80 (dwarves 100), expandable.
- **Giran** = community trade hub (central, harbor, Dragon Valley and Antharas nearby): rows of private stores around the town centre and warehouse. Convention, not a rule. Aden = high-level market; Rune/Goddard quieter in C4.
- NPC buy price = base x (1 + town tax + castle tax); sell to NPC = base / 2.
- No reliable archived C4 player price lists found (unverified). Anchor on base prices x server multiplier. Top weapon / top chest base: D 1.8M / 0.3M, C 6.13M / 2.1M, B 13.1M / 4.7M, A 27M / 10.3M, S 48.8M / 17.4M. Rule of thumb (unverified): common gear near base, D/C junk below base, scarce items above (SA'd top C/B weapons, epic jewelry, unsealed A/S, enchant scrolls); crafted shots near material cost + small fee.

---

## 8. PvP, karma, clans, sieges

### Flagging and karma
- **Flag (purple)** on: attacking a white player with Ctrl or any purple player; healing/buffing purple or red players; buffing monsters; area skills hitting a purple. Duration [L2J config] 40 s after hitting white, 20 s after purple (retail unverified).

| Victim | Killer gets |
|---|---|
| Purple player | PvP +1, no karma |
| Red player | no karma |
| White player | karma, PK +1 |
| Mutual war enemy | PvP +1, no karma (C4) |
| One-sided war target | normal PK |
| Arena / siege zone | nothing counts |

- **Karma gain [L2J]:** 240 x max(1, PK/2) x max(1, killerLvl / victimLvl), clamped 240-10,000. **Loss:** hunting mobs ([L2J] XP / 260); quest "Repent Your Sins" lowers PK count.
- **Red rules:** town guards attack on sight; no damaging skills in town; gatekeepers blocked [L2J default].
- **Drops on death:** red with PK above 5 drops items ([L2J] 70% chance, max 10 items, weapons least likely; official guide says up to 5). Red with PK 5 or less: no PvP drops (C3). White killed by mobs: small chance ([L2J] 5%, max 3; retail unverified). No drops in sieges, wars (unless red), arenas, Festival. Adena and quest items never drop.
- **Death XP loss [L2J]:** ~(6.5 - 0.07 x level)% of the level: ~5.1% at 20, 3.7% at 40, 2.3% at 60, 1.25% at 75, ~1% at 78; none at 4 or below; 1/4 for war and Festival deaths in C4. Retail table (unverified).
- **Arenas:** Gludin Arena, Giran Arena, Coliseum, Monster Derby Track - free PvP, no penalties.

### Clans (levels 0-5 only)
| Level | Cost (leader) [L2J] | Members [L2J] | Unlocks |
|---|---|---|---|
| 0 | found at character level 10+ | 10 | - |
| 1 | 30k SP + 650k adena | 15 | clan warehouse |
| 2 | 150k SP + 2.5M adena | 20 | clan hall auctions |
| 3 | 500k SP + Proof of Blood | 30 | crest, titles, clan wars |
| 4 | 1.4M SP + Alliance Manifesto | 40 | siege registration |
| 5 | 3.5M SP + Seal of Aspiration | 40 | alliance, command channel |

- Proof of Blood: Blood Queen (60, Dragon Valley) (unverified). Alliance Manifesto: "Proof of Clan Alliance" (Giran). Seal of Aspiration: **"Pursuit of Clan Ambition!"** (Sir Gustaf Athebaldt, Oren; level 4 clan leader) - Dragon Valley wyrm eggs, Giant's Cave powerstones, Imperial Gravekeeper scepter; a clan-group quest. Member caps vary by source.
- **Not in C4:** reputation, clan skills, Academy, sub-units, levels 6-8.
- **Alliance:** level 5 clan leader, max 12 clans; 1-day rejoin penalties, 10 days after dissolving; no dissolving mid-siege. Clan penalties [L2J]: 5 days to join another clan, 10 days to found one.
- **Clan war (C4):** level 3+ clan, 15+ members, max 30 declarations, not vs allies; mutual war allows attack without Ctrl.

### Castles, sieges, halls
- **7 castles:** Gludio, Dion, Giran, Oren, Aden, Innadril, Goddard (no Rune/Schuttgart).
- Every 2 weeks, 2 h; registration closes 24 h before; up to 4 at once. [L2J defaults] Gludio/Dion/Aden Saturday 20:00, others Sunday 16:00.
- Attacking clan leader engraves the artifact (Goddard: both Altar of Water and Altar of Fire). Attackers auto-allied. On capture the siege continues with roles swapped.
- **Seal of Strife:** mercenaries, gates, tax cap (15% normal, 25% Dawn-owned, 5% Dusk-owned).
- **Lord:** chamberlain (taxes, manor, gates, Certificates of Approval for Dawn), wyvern (strider 55+, 10 B crystals).
- **Clan halls:** auction halls (clan level 2+): Gludio 4, Gludin 5, Dion 3, Aden 6, Giran 5, Goddard 4. Contestable: Partisan Hideaway (Dion), Devastated Castle (Aden), Bandit Stronghold (Oren) - held 2 weeks in C4, with XP recovery, buffs, item production.

---

## 9. Raid bosses and epic bosses

### Raid rules
- **Raid Curse:** player level above RB level + 8 -> attacking it gives **Petrification**, casting on it gives **Raid Curse** (skills blocked). C4 applies it to normal RBs; C5 extended it to epics (C4 epics unverified).
- **Reward penalty:** top damage dealer 3+ levels above the RB lowers drops; 9+ = no drop.
- **Respawn:** fixed spawn point; 12-36 h after death [L2J Lisvus] (Mobius 36 h +/- 24 h; retail unverified); HP persists between fights.
- **Disconnect (C4):** relog within 30 min to rejoin Antharas, Zaken, Baium, Anakim or Lilith.

### Representative raid bosses (level, location)
- **20s:** Madness Beast 20 (Spider Nest), Farakelsus 20 (Elven Fortress), Kaysha 21 (School of Dark Arts), Sukar Wererat Chief 21, Greyclaw Kutus 23 (Abandoned Camp), Soul Scavenger 25 (Ruins of Agony), Zombie Lord Crowl 25 (Ruins of Despair), Mammon Collector Talos 25, Tiger Hornet 26 (Bee Hive), Partisan Leader Talakin 28.
- **30s:** Turek Mercenary Captain 30 (Orc Barracks), Giant Wasteland Basilisk 30, Corsair Captain Kylon 33, Breka Warlock Pastu 34, Guillotine 35 / Evil Spirit Tempest 36 (Execution Grounds), Red Eye Captain Trakia 35, Lizardmen Leader Hellion 38 (Cruma Marsh).
- **40s:** Road Scavenger Leader 40 (Death Pass), Water Spirit Lian 40 (Field of Silence), Shaman King Selu 40 / Timak Orc Gosmos 45, Archon Suscepter 45 (Cruma 2F), Tiger King Karuta 45 (Dragon Valley), Istary 45 (Alligator Island), Orfen's Handmaiden 48, Mirror of Oblivion 49.
- **50s:** Zaken's Chief Mate Tillion 50 (Devil's Isle), Ghost of Peasant Leader 50 (Cemetery), Captain of Red Flag Shaka 52, Zaken's Butcher Krantz 55, Ghost Knight Kabed 55, Sorcerer Isirr 55, Fairy Queen Timiniel 56 (Enchanted Valley).
- **60s:** Lord Ishka 60 (Dragon Valley), Taik High Prefect Arak 60, Giant Marpanak 60 / Gorgolos 64 / Hekaton Prime 65 / Last Titan Utenus 66 (Giant's Cave), Roaring Lord Kastor 62, Enmity Ghost Ramdal 65 (ToI), Demon's Agent Falston 66 (Devil's Pass), Bloody Priest Rudelto 69.
- **70s:** Barakiel 70 (Valley of Saints, Noblesse), Korim 70 (ToI), Shilen's Messenger Cabrio 70, Beast Lord Behemoth 70, Eilhalder von Hellmann 71 (night), Death Lord Hallate 73 (ToI), Icicle Emperor Bumbalump 74 (Hot Springs), Antharas Priest Cloe 74, Storm Winged Naga 75, Kernon 75 (ToI), Daimon the White-Eyed 78 (Wall of Argos), Hestia 78 (Hot Springs), Shuriel 78 / Longhorn Golkonda 79 / Cherub Galaxia 79 (ToI). Cabrio, Hallate, Kernon, Golkonda = Fate's Whisper (subclass) targets.
- **80+:** Lilith / Anakim 80 (Disciples Necropolis), Varka's Hero Shadith / Ketra's Hero Hekaton 80, Commanders Mos / Tayr 82, Chiefs Horus / Brakki 87, Ember 85 (Hall of Flames), Shadow of Halisha 81 (Four Sepulchers).

### Grand / epic bosses in C4
| Boss | Lv | Where | Entry | Minions | Respawn [L2J] | Jewel |
|---|---|---|---|---|---|---|
| Queen Ant | 40 | Ant Nest (Gludio) | none | larvae, 2 nurses (heal her), guards | ~36 h +/- 17 h | Ring of Queen Ant 30% |
| Core | 50 | Cruma Tower 3F | via 2F teleport | Death Knights, Death Wraiths, Suscepters | ~60 h +/- 23 h | Ring of Core 30% |
| Orfen | 50 | Sea of Spores | none | Raikel Leos, Riba Iren (healer) | ~48 h +/- 20 h | Earring of Orfen 30% |
| Zaken | 60 | Devil's Isle | door opens at game-night | Doll Bladers, Vale Masters, pirate zombies | ~60 h +/- 20 h | Zaken's Earring |
| Baium | 75 | ToI 14F | Blooded Fabric ("An Arrogant Search"), wake the statue | 5 Archangels (74) | ~168 h +/- 48 h | Ring of Baium |
| Antharas | 79 | Lair of Antharas | Portal Stone ("Audience with the Land Dragon"), 30-min gather | (unverified) | ~264 h +/- 72 h | Earring of Antharas |
| Valakas (new) | 85 | Hall of Flames -> Lair (Goddard) | Floating Stone ("Into the Flame"), max 200 | (unverified) | ~264 h +/- 72 h | Necklace of Valakas |

- C4 changes: Orfen fewer/weaker minions but stronger herself; Core's minions cannot go downstairs; Queen Ant's guards teleport back if pulled.
- Not in C4: Frintezza (C5), Sailren (Interlude), Freya, Beleth. "Eye of Beleth" and "Beleth's Seer Sephia" are ordinary RBs.

### Clan raid setup
- **Normal RB:** main tank + off-tank for minions, 2 healers (Bishop + EE/SE), 1+ recharger, buffer, BD + SWS, rest DD; everyone at RB level +8 or lower (low clan alts get invited because highs get cursed). Puller drags the RB to a cleared spot; minions slept/rooted/off-tanked. Calls: "RB up at X", "gather gk", "rebuff", "tank on, DDs in 5", "minions first".
- **Epics:** command channel. Baium: tank Archangels separately. Queen Ant: kill/CC nurses or she heals. Antharas/Valakas: many full parties, staggered rebuffs, mass res ready.
- **Loot:** clan rules (leader decides, roll, points); in-game Random or Finders Keepers with the leader looting.

---

## 10. Other C4 systems

### Seven Signs
- **Cycle:** competition Monday 18:00 -> Monday 18:00, then seal validation week (2 weeks total).
- **Joining:** needs 1st class. **Dawn:** castle-owning clan/alliance free, others need a Certificate of Approval or 50,000 adena. **Dusk:** anyone outside castle clans. Side locked for the cycle (L2J ships Dawn checks off by default).
- **Seal stones:** Blue 3, Green 5, Red 10 [L2J] (C3 notes conflict on Blue). Score = stone share x 500 + festival points. Seal capture needs 35% of members' votes, keeping it 10%.
- **Seals:** **Avarice** = Necropolis access, Merchant of Mammon, Lilith (Dawn) / Anakim (Dusk). **Gnosis** = Catacomb access, Blacksmith of Mammon, town buff (Orator) or debuff (Preacher) NPCs. **Strife** = siege/tax effects.
- **Access:** competition week anyone registered; validation week winners only (L2J also checks the matching seal).
- **Necropolises:** Sacrifice 20-30, Pilgrims 30-40, Worshipers 40-50, Patriots 50-60, Ascetics 60-70, Martyrs 60-70, Saints 70-80, Disciples 70-80 (Lilith/Anakim). **Catacombs:** Heretics 30-40, Branded 40-50, Apostate 50-60, Witch 60-70, Dark Omens 70-80, Forbidden Path 70-80.
- **Festival of Darkness:** Oracle of Dawn (near Orc Barracks) / Oracle of Dusk (near Windy Hill); parties of 5-9 from one side; 18 min; brackets up to 32/43/54/65/unlimited (L2J 31/42/53/64); costs seal stones; 1/4 XP loss.
- **Dimensional Rift (C4):** quest "In Search of Dimensional Fragments" (Rift Doorman at Seven Signs entrances; fragments drop in those dungeons). Cost per member: 30 = 18, 40 = 21, 50 = 24, 60 = 27, 70 = 30, unrestricted = 33. Room jump every 8-10 min, 4 jumps, boss Anakazel; party change or wipe ends it. Free 1-hour entry from Festival results.

### Noblesse, Olympiad, Hero (all new in C4)
- **Noblesse:** "Possessor of a Precious Soul" 1-4 on a **subclass** that must reach 75 (start levels unverified). Runs through Aden, Rune, Goddard NPCs, Swamp of Screams and Valley of Saints mobs, and **Barakiel** (70). Benefits: status on all classes, Noblesse teleports, own titles, PvP attack boost, Tiara. Skills: Blessing of Noblesse (5 Spirit Ore, keeps buffs on death), Strider Siege Assault, Build Advanced HQ, Wyvern Aegis, Summon CP Potion, Fortune/Harmony/Symphony of Noblesse.
- **Olympiad:** Noblesse, main class, >0 points (3rd class requirement per an archived official page, unverified). 20:00-24:00, max 3 min (no kill = most damage wins). Only shots, Echo Crystals, energy stones, firecrackers allowed; no recall, no party. 18 points monthly + 3 weekly; loser's points go to winner; points above 50 convert at 1,000 Noblesse Gate Passes each. Shop: blessed enchant scrolls, Secret Book of Giants.
- **Hero:** monthly top scorer per class with more than 5 matches and 1+ win. Aura, % chat (10 s cooldown), Infinity weapon, Wings of Destiny Circlet. **No hero skills in C4** (C5).

### Subclass
- **Quests:** (1) **"Fate's Whisper"** (Maestro Reorin, 75): kill Cabrio, Hallate, Kernon, Golkonda, get Baium's blood, hand in 984 B crystals + a top B weapon -> Star of Destiny + a low A weapon. (2) **"Mimir's Elixir"** (Magister Ladd, Ivory Tower, 75) -> subclass rights. L2J only checks Mimir's Elixir.
- **Rules:** up to 3 subclasses, each needing current classes at 75+. Starts at 40, max 78. Must be a 2nd-class profession. Never Overlord or Warsmith; no elf/dark elf cross-picks; no class "similar" to one you have: {TH, PW, AW}, {HE, SR, PR}, {Pala, DA, TK, SK}, {Warlock, ES, PS}, {EE, SE}, {SWS, BD}, {Sorc, SPS, SH}.
- Free unlimited switching, not while dead, casting, flagged, in combat, sieges or Olympiad [L2J]. Shared: inventory, adena, karma/PK, Noblesse. Separate: level, skills, SP. 3rd class on subs = C5 (inferred, unverified). Hero = main class only.
- Common picks (unverified, era memory): a buffer sub (PP/WC/SE/EE) for self-buffs, or a summoner.

### Class change quests
- **1st (20):** "Path to [class]" quests, each giving a token (e.g. Medallion of Warrior, Mark of Faith, Iron Heart, Mask of Medium, Ring of Raven, Final Pass Certificate) handed to a village master of your race.
- **2nd (40):** three marks - a "Trial of the ..." (Challenger, Duty, Seeker, Scholar, Pilgrim, Guildsman), a race "Testimony of ..." (Trust Human, Life Elf, Fate DE, Glory Orc, Prosperity Dwarf), and a class "Test of the ..." (Duelist, Champion, Sagittarius, Searcher, Healer, Reformer, Magus, Witchcraft, Summoner, Maestro, Lord, War Spirit). Examples: Gladiator = Challenger + Trust + Duelist; Bishop = Pilgrim + Trust + Healer; Bounty Hunter = Guildsman + Prosperity + Searcher. C4 rewards XP, SP, Dimension Diamonds.
- **3rd (76):** "Saga of the [class]" (31 quests, IDs 70-100), started in Aden, Rune, Hunter's Village, Oren, Ivory Tower or Hardin's Academy. Reward [L2J]: class, 2.3M XP, 5M adena, Secret Book of Giants.

### Pets
| Quest | Level | Reward |
|---|---|---|
| Get a Pet | 15 | Wolf Collar |
| Little Wings | 35 | hatchling Dragonflute |
| Little Wing's Big Adventure | hatchling 55+ | Strider |
| Help the Son! / Uncle! / Sister! | 24 / 25 / 26 | Baby Kookaburra / Buffalo / Cougar (new in C4) |

Pets need food (baby pets eat Baby Spice); dead pets leave a corpse for 20 min.

### Manor, fishing, chests, factions
- **Manor:** lord sets daily seed sales and crop buys (changes 20:00-06:00, opens 20:00). Buy seed -> **Sow** on a live mob (~90% base, less outside +/-5 levels) -> kill -> **Harvest** (100%, -5% per level beyond a 5-level gap). Crops sold to the castle or exchanged for mats (Golden Cobol -> Varnish/Mold Glue, Desert Coba -> Asofe/Mithril Alloy, Sea Coba -> Thons/Enria). 5% fee for other territories; C4 added Coba seeds for 67-85 mobs; no sowing in sieges.
- **Fishing (new in C4):** rods and lures from fishermen, skills from the Fisherman's Guild; unlocks Expand Inventory/Warehouse/Trade/Craft skills and common recipes. A fishing bot on a pier is era-correct idle behaviour.
- **Treasure chests:** chests and mimics in fields/dungeons, keys grade 1-8; Unlock or Key of a Thief.
- **Ketra Orc / Varka Silenos (74-75):** pick a side, hunt the other - repeatable endgame faction content in Goddard.

---

## 11. Player culture (making the world feel alive)

### Chat channels (prefixes confirmed in L2JLisvus Say2.java)
| Prefix | Channel |
|---|---|
| none | normal (nearby) |
| `!` | shout (region-wide on retail-like settings) |
| `+` | trade (region-wide by default; L2J config can make it global) |
| `#` | party |
| `@` | clan |
| `$` | alliance |
| `"name text` | whisper |
| `%` | hero voice (heroes, 10 s cooldown) |

C4 also has command channel chat. Emulators flood-limit shout/trade.

### Shorthand (era usage, general knowledge)
- **Classes:** Glad, WL (Warlord or Warlock - context), Destro, Tyr, DA, Pala, TK, SK, TH, PW, AW, HE/Hawk, SR, PR, Sorc, Necro, Lock, SPS/Singer, SH/Howler, ES, PS, BP (Bishop), PP (Prophet), EE, SE, BD, SWS, OL, WC, BH, WS/Smith, DE, dwarf/dorf.
- **Items:** SS, SPS (spiritshot or Spellsinger - context), BSS/BSPS, SoE/BSoE, res/bres scroll, EWA/EAA (Enchant Weapon/Armor A), "bless EWS", SA, "+3/+4 safe", FP (Full Plate), BW (Blue Wolf), DC (Dark Crystal), Maj, NM, IC, DLE, "QA ring", AA, mats, rec ("60% rec"), k = thousand, kk = million ("150kk").
- **Places:** CT, DV, ToI, GC, EV, FoM, AI (Alligator Island), FoS/FoW, FoD, VoS, SoS (Swamp of Screams or Sea of Spores), BS, HS, IT, FoG, cata/necro, rift.
- **Actions:** WTS/WTB/WTT, "pm me", "lowest?", LFP/LFG, LFM, "need heal/tank/BD", inc, OOM, "mp pls", "res pls", rebuff, "wait mp", afk, brb, KS, train, PK/PKer, red, flag/purple, gz/grats, ty, np, gl, gg, nub, carebear.

### Behaviour and etiquette
- **Spot claiming:** famous spots (CT floors, ToI floors, Giant's Cave, IT chambers) belong to whoever got there first; newcomers ask "free?" / "how long?" or move on; parties hold spots for hours; disputes escalate to flagging and PvP - the C4 way to settle a spot.
- **Kill stealing:** XP and drops go by damage, so KS is possible and rude. Normal reaction "sorry, didnt see you" and leaving; repeat offenders get warned, then flagged.
- **Training:** pulling a pack of aggro mobs onto others, then SoE-ing out. Griefing, but common.
- **Camping:** clans camp RB spawns and trade RB timers.
- **Loot:** leveling parties use Finders Keepers (spoil to BH) or Random; "By Turn including Spoil" with several dwarves; raid loot by clan rules. Leaders state it on invite ("rnd loot, spoil to bh").
- **Buffs:** town buffers buff friends and clanmates; some sell buffs. No buff store in C4, so it was shout + party invite + "ty" and a tip (unverified detail, common memory).
- **Trade:** rows of private stores in Giran (and Aden) with store titles as adverts ("Cheap D SS", "Craft SS C - mats or price"); haggling by whisper; dwarf stores open 24/7 while the owner sleeps.
- **Social glue:** clan recruit shouts, clan politics and wars, siege trash talk, Dawn vs Dusk rivalry, Monster Race and lottery, fishing piers, newbies asking "where to go at 20", "how to change class", "where to buy SS", AFK chatting in town.

### Example lines a bot can say
- **Trade:** `+WTS Brigandine set, 300k, pm` / `+WTB Soul Ore 200 ea, buying 2k` / `+WTT Crystal Dagger for Samurai Longsword + adena` / `+Crafting SS D/C, your mats or my price, Giran wh` / `+WTB Proof of Blood for clan lvl 3`
- **Party:** `!LFP SPS 44, have BSS, CT or DV` / `!LFM CT 2F, need EE + BD, 46-50` / `#inc 3` / `#wait mp` / `#rebuff in 2 min` / `#res pls` / `#ty for res` / `#oom, sitting` / `#tank, grab the one on the healer`
- **Spot:** `free?` / `how long you staying?` / `ok np, will go other side` / `sorry, ks, didnt see you` / `pls dont train here`
- **Clan:** `@RB Lord Ishka up, who can come?` / `@gather Giran gk 21:00 for siege` / `@need 2 more for Pursuit of Clan Ambition`
- **Social:** `gz` (on level-up) / `where to buy SS D?` -> `dwarves in Giran` / `how to get 2nd class?` -> `3 marks, check your quests`
- **Seven Signs:** `!Dawn cata party, need healer, 60+` / `!buying seal stones`

Keep bot chat sparse and varied: real players typed little while fighting, more while resting or in town.

---

## 12. Ideas for believable bots

1. **Giran buff sellers:** PP/EE/SE/WC bots near the warehouse/gatekeeper shout "PP buffs, donation", accept invites, cast the right order for fighter vs mage, leave, say "ty".
2. **Dwarven shop rows:** WS bots run manufacture stores (shots, intermediates); BH bots sell spoiled mats. Price = base x server multiplier, lowered when unsold, raised when sold out.
3. **Real shot economy:** bots consume shots; poor archers turn SS off on trash and farm adena; demand spikes at grade breakpoints and crafters restock.
4. **Spot claiming and rotation:** parties check occupancy, ask "free?", fall back to the next spot in the band table, hold 1-3 h, then rotate. Make contention visible to real players.
5. **Mana-conscious nukers:** track MP per kill; Aura Bolt finishers; Body to Mind at full HP; sit under 35% MP; "mp pls" when an elder is present; always keep a Sleep's worth.
6. **Real hate model:** tank re-taunts anything hitting non-tanks, Hate Aura at 3+ mobs, UD only in emergencies, mobs turned away from the party.
7. **Dagger positioning:** wait for hate, walk behind, Backstab -> Deadly Blow -> Bleed, reposition; Silent Move through aggro zones; open chests with Unlock.
8. **Kiting archers and Spellsingers:** hold 600-900 range, slow/stun at 250, back off 400, re-engage; never kite into unexplored aggro.
9. **Healer triage + recharge chain:** tank first, group heal at 3+ injured, EE/SE recharge the Bishop, res after the fight, "oom" calls.
10. **Buff rhythm:** BD/SWS refresh at ~1:45, leader calls "rebuff" at ~17 min, no pulls during rebuffs - this cadence is what makes a party feel human.
11. **Spoil discipline:** BH spoils the MA's target early and sweeps within a second; party loot mode keeps spoil with the BH; BH sells mats in town at night.
12. **Grade breakpoint saving:** save adena before 20/40/52/61/76, buy the next set from player stores, sell or crystallize the old grade, never wear above-grade gear.
13. **Soul crystal hunters:** camp Doom mobs or Timak with one crystal ("lvl 8 crystal, 2 more to go"); stage 10 owners join clan RB runs for 11-12.
14. **Seven Signs life:** castle-clan bots join Dawn, others Dusk; farm seal stones in cata/necro in competition week; trade AA; visit Mammon only when their side holds the seal.
15. **RB behaviour:** clan bots shout spawns in @, gather at a gatekeeper, check everyone is at RB level +8 or lower, assign an off-tank to minions (QA nurses first).
16. **Day/night:** Forest of the Dead and Devil's Pass night spawns, Eilhalder at night, Zaken's door at game-night change where bots go.
17. **Death etiquette:** dead bots wait 1-3 min for res ("res pls dont go town"), know their XP loss (~1-5% by level), ask for rebuffs after res.
18. **Karma consequences:** spot fights flag bots purple; a rare PK bot turns red, avoids towns and guards, burns karma on mobs, fears PK > 5 drops; players can hunt it for loot.
19. **Clan life:** clans grow 0-5 with real requirements (Proof of Blood, Pursuit of Clan Ambition), declare wars at level 3 + 15 members, register sieges at 4, recruit in shout. No clan skills or reputation.
20. **Endgame grind:** level 75 bots doing Fate's Whisper appear at Cabrio/Hallate/Kernon/Golkonda; Noblesse candidates farm Barakiel in Valley of Saints; Ketra/Varka faction bots fight each other's side.
21. **Newbie helpers:** high-level bots sometimes visit starter villages, buff newbies, answer "where to go", point to the Newbie Guide and class-change NPCs.
22. **Idle realism:** fishing at piers, sitting AFK by the Giran warehouse, Monster Race bets, Saturday lottery, social actions.
23. **Party formation:** LFM/LFP shouts by role and level; leader fills the 9-man template and picks a spot by average level; parties break up at "bedtime" hours.
24. **Aggro respect:** low bots avoid aggressive dungeons; mid parties enter them grouped; solo bots pick passive fields.
25. **Era guardrails:** never mention or use herbs, augments, clan skills/reputation, Rune/Schuttgart castles, Kamael, duels, Frintezza, Sailren or levels above 78; keep a blocklist so generated chat stays in era.

---

## Sources

Patch notes (official text mirrored):
- https://lineage2wiki.org/c1/patch-notes
- https://lineage2wiki.org/c2/patch-notes
- https://lineage2wiki.org/c3/patch-notes
- https://lineage2wiki.org/c4/patch-notes
- https://lineage2wiki.org/c5/patch-notes
- https://lineage2wiki.org/interlude/patch-notes

C4 game data (client-derived):
- https://lineage2wiki.org/c4/class/ and per-class pages, e.g. https://lineage2wiki.org/c4/class/tyrant/ , https://lineage2wiki.org/c4/class/spellsinger/ , https://lineage2wiki.org/c4/class/treasure_hunter/ , https://lineage2wiki.org/c4/class/orc_monk/
- https://lineage2wiki.org/c4/skill/ (skill pages by id, e.g. 30, 101, 1007, 1013, 1068, 264, 275)
- https://lineage2wiki.org/c4/location/
- https://lineage2wiki.org/c4/monster/
- https://lineage2wiki.org/c4/item/ and https://lineage2wiki.org/c4/item/set/
- https://lineage2wiki.org/c4/recipe/
- https://lineage2wiki.org/c4/soul-crystal/
- https://lineage2wiki.org/c4/manor/
- https://lineage2wiki.org/c4/shots-calculator/
- https://lineage2wiki.org/c4/quest/ (incl. 337 Audience with the Land Dragon, Noblesse 241/242/246/247, clan quests)
- https://l2hub.info/c4/ (items; skills 239, 4215, 4494, 4515; quests 348, 350)

C4 emulator datapacks and code:
- https://github.com/realratchet/L2JLisvus (fork of https://gitlab.com/TheDnR/l2j-lisvus): configs, Say2.java chat types, npc/drop/spawn SQL, clan/siege/Seven Signs code
- https://gitlab.com/MobiusDevelopment/L2J_Mobius (L2J_Mobius_C4_ScionsOfDestiny: skill trees, multisell, buylists, Dimensional Rift)
- https://github.com/AnderAlmeida123/L2J-Mobius-C4-Custom
- https://github.com/codeitamarjr/L2-Kage (Mobius C4 data copy)
- https://github.com/craqpter/L2c4

History and official guides:
- https://en.wikipedia.org/wiki/Lineage_II (release dates)
- https://techgage.com/?p=5601 (C4 NA launch press release)
- Archived lineage2.com guides (web.archive.org): /guide/battle.html, /guide/grouping.html, /guide/guides_castle.html, /guide/guides_pvp1.html, /archive/2006/02/seven_signs_tim.html, /archive/2006/03/the_grand_olymp_2.html
- https://www.ludo.guide/guide/lineage-ii/side-quests-activities/seven-signs-questline
- https://teletype.in/@papanius/perevod-prima-guide-klany-i-zachem-oni-nuzhny (translated Prima clan guide)

Not found: GameFAQs or 2005-2006 forum guides with usable content. Section 11 (culture, shorthand) and the rotation advice in section 3 rest on era knowledge plus the skill data above, not on one archived source.
