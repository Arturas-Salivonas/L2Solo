# Same-kind buffs replace each other (L2Solo fix)

A bug fix for [L2Solo](https://github.com/pmbstyle/L2Solo). In C4 two buffs of the same kind can't be on you at once: the new one replaces the old, unless the old one is stronger. L2Solo left 21 kinds without that rule, so they piled up.

## What it fixes

- **Critical rate:** Focus, Chant of Predator, Scroll of Focus.
- **Critical damage:** Death Whisper, Chant of Rage, Eye of Paagrio, Scroll of Death Whisper.
- **Vampiric:** Vampiric Rage, Chant of Vampire.
- **Accuracy:** Guidance, Chant of Eagle, Sight of Paagrio, Scroll of Guidance, Endeavor Potion.
- **Evasion:** Agility, Chant of Evasion, Tact of Paagrio, Scroll of Agility.
- **Also:** Berserker Spirit and Rage of Paagrio, Bless Shield and Shield of Paagrio, Chant of Spirit and Arcane Protection, War Cry and Rage, Guts and Frenzy, Ultimate Defense and Vengeance, Dash and Evade Shot, the dagger Focus skills, the Detect Weakness skills, the mirrors, Mana Regeneration and its scroll, and more.
- **The stronger one stays,** by C4's own levels: a Scroll of Focus beats Focus 3, and Focus 3 beats Chant of Predator 1. Equal ones replace each other.
- **Already right before:** P.Atk, P.Def, Haste, Acumen, Wind Walk, M.Atk and M.Def buffs.
- **Source:** the L2J Mobius C4 datapack (each skill's abnormalType and abnormalLevel).

## Install

### Let your AI agent do it

**Don't know how to install it?** Copy this into your AI coding agent (Claude Code, Cursor, Codex or similar) and fill in your folder. It checks your server is stopped, backs up your world first and tells you what it did.

```text
Please install the "Same-kind buffs" mod into my L2Solo server (a Lineage II C4 server, https://github.com/pmbstyle/L2Solo).
My L2Solo folder is: <your L2Solo folder>
Guide: https://github.com/Arturas-Salivonas/L2Solo/blob/fix/buff-stack-groups/solo/guides/BUFF_STACKING.md

Rules:
- The server must be stopped first. If anything is listening on ports 2106 or 7777, ask me to stop it. Don't stop it yourself.
- Before changing anything, copy the tmp folder (my world and characters) to a backup folder outside the L2Solo folder.
- Don't change config/local.ini or anything inside tmp.
- Never use the launcher's Update or Verify buttons: they put the original files back.

Steps:
1. If the folder is a git repository (it has a .git folder), run there:
   git remote add l2mods https://github.com/Arturas-Salivonas/L2Solo.git   (skip it if l2mods already exists)
   git fetch l2mods
   git cherry-pick 27040e379..l2mods/fix/buff-stack-groups
   If git asks who I am, set user.name and user.email for this repository only.
   If a cherry-pick says a commit is already there, run git cherry-pick --skip.
   If it stops on a conflict, run git cherry-pick --abort and tell me which files conflicted. Don't guess a fix.
2. If it's not a git repository (a launcher install):
   Download https://github.com/Arturas-Salivonas/L2Solo/compare/27040e379...fix/buff-stack-groups.diff into the L2Solo folder as buff-stacking.diff,
   then run git apply --check buff-stacking.diff and, if that passes, git apply buff-stacking.diff.
   This needs Git installed; if it isn't, ask me to install Git for Windows first. If the check fails, stop and tell me.
3. Run npm run check in the L2Solo folder and tell me the result.
4. Tell me what you did, and that I can start the server again with npm run start.
```

### Or do it yourself

Stop your server first. With a cloned L2Solo, run once in your L2Solo folder:

```
git remote add l2mods https://github.com/Arturas-Salivonas/L2Solo.git
git fetch l2mods
git cherry-pick 27040e379..l2mods/fix/buff-stack-groups
```

No git clone? Save the patch <https://github.com/Arturas-Salivonas/L2Solo/compare/27040e379...fix/buff-stack-groups.diff> in your L2Solo folder as `buff-stacking.diff` and run `git apply buff-stacking.diff`.

Restart the server after installing.

## Remove it

`git revert --no-edit 27040e379..l2mods/fix/buff-stack-groups` (git), or `git apply -R buff-stacking.diff` (patch). Your world and characters are never touched.

**Bugs or ideas:** open an issue on <https://github.com/Arturas-Salivonas/L2Solo>. All mods: [MODS.md](https://github.com/Arturas-Salivonas/L2Solo/blob/solo/solo/guides/MODS.md).

All credit for L2Solo goes to its authors (<https://github.com/pmbstyle/L2Solo>), under the same Apache 2.0 license.
