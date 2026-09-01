# BALANCE.md — enemy pacing intent (fb025, supersedes fb020)

## Origin

Owner-filed feedback `feedback/processed/20260901-114409-balance-enemies-10x-hp-slower-attacks.md`:
fights still end too fast; the owner wants long, readable combat and
explicitly supersedes fb020's ×1.4 HP order. Scoped exception to CLAUDE.md's
"no tuning before P10" freeze, same standing as fb020 and the QUESTIONS.md
Q79/Q40 precedents — applied directly to `/data`, not `/src`. Per the owner's
own precedent from fb020, P10's eventual re-fit tunes **from** these values,
not back toward the pre-fb020 (or pre-fb025) numbers.

## Multipliers applied (fb025)

1. **Enemy HP ×10, globally, on the pre-fb020 base** — every entry in
   `data/enemies.json`, **including both bosses** (`gatebreaker`,
   `warden_eater`), got `hp` = (the value from before fb020's ×1.4 pass) ×10.
   fb020 exempted bosses; fb025's order text says "globally" with no boss
   carve-out this time, so bosses are included here (logged as a scope
   decision — QUESTIONS.md). Per-enemy identity ratios are preserved: the
   fodder/elite/boss hierarchy from before fb020 is what got scaled, not the
   already-1.4×'d numbers, so there's no compounding.
2. **Attack cadence ×(1/0.7) — attacks fire slower**, applied to every field
   that gates how often an attacker deals damage, and *only* fields that live
   in `/data` (per the item's own acceptance criterion, "multipliers land in
   `/data` only"):
   - Towers: every `towers[].attack.interval` and `towers[].vsSpecial.interval`
     in `data/towers.json` (10 towers; supports with no `attack`/`vsSpecial`
     cadence, e.g. Palisade/Beacon Totem/Harvest Sprout, are unaffected).
   - Character: every class's `basicAttack.interval` in `data/classes.json`
     (12 classes). The VS-wielded weapon rate is not authored separately — it
     reads `towers.json`'s `attack.interval` for the built tower type
     (`src/sim/vswield.ts`), so it scales automatically with the tower change
     above.
   - Class skills' **hit cadence** (repeating damage while a skill persists,
     not the cast-to-cast `cooldownSeconds` between activations — the owner's
     memo explicitly named "hit cadence"): Necromancer's Bone Pylon
     (`active2.pylonInterval`) and Animist's Recall Totem taunt re-tag
     (`active2.totemTauntTickSeconds`). Every class summon that fires on a
     copied `interval` (skeletons, Pop Turret, Manifest) inherits the scaled
     `basicAttack.interval`/`attack.interval` automatically — no separate
     edit needed.
   - Enemies: `data/spawns.json`'s `contactInterval` (the shared melee/leak
     contact-damage cadence for every ground enemy touching the Warden), plus
     the three per-enemy attack-cadence fields that exist in `/data`:
     Spitter's `attackInterval` (ranged), Colossus's `stompInterval` (AoE
     attack), Charger's `chargeCooldown` (time between charge attacks).
     Enemy **movement** `speed` is untouched — fb020's ×0.8 movement
     multiplier stands; "attack speed" and movement speed are different
     stats and the owner's fb025 memo only supersedes the earlier *HP* order.

### Explicitly out of scope (logged, not silently skipped)

- **Hardcoded (non-`/data`) enemy tick rates**: Cinderling's fire-trail tick,
  Mender's heal tick, Warlock/Herald's buff tick are literal constants in
  `src/sim/enemies.ts`, not `/data` fields. The item's acceptance criterion
  ("multipliers land in `/data` only") rules out touching engine code for
  this item; moving them to data first is a separate, unfiled cleanup.
- **Enemy ability windup/duration** (Charger's `chargeWindup`/`chargeDuration`,
  Wraith's `phaseDuration`/`phasePeriod`): these govern how a triggered
  ability plays out, not how often an attacker attacks — left unscaled to
  keep the change strictly to cadence-between-attacks.
- **`data/cores.json`** (the Warden's Core building upgrades — Carnivorous
  Plant's `devourCooldown`/`poisonVolleyInterval`, Corpse's
  `corpseExecuteInterval`/`autoFireInterval`): not one of the owner's four
  named categories (towers, character, class skills, enemies) — the Core is
  a fifth, separate system. Left unscaled.
- **Percentage attack-speed modifiers** (gear `attackSpeed` stats, the tree's
  haste node, frost's `-0.3` debuff, aura `buffAura.attackSpeed`): these are
  multiplicative buffs/debuffs on top of the base interval, not the base
  cadence itself — unaffected by this pass by construction.

## TTK (time-to-kill) intent

These are the pacing bands the multipliers are aiming at, replacing fb020's
bands (fodder 2-4 hits, elite 12-20s, bosses unchanged) with the owner's new
explicit targets. Not hard guarantees measured per-enemy yet:

- **Fodder** (grade F: husk, sprinter, swarm_rat) — roughly **6-12 hits**
  from a representative early-game tower/weapon to kill.
- **Elite** (grade E: colossus, herald) — roughly **40-60 s** of focused
  damage from a representative mid-game build to kill.
- **Bosses** (grade B: gatebreaker, warden_eater) — roughly **3-6 min** of
  focused damage from a representative late-game build to kill. Unlike
  fb020, bosses are now in scope for both the HP multiplier and this band.
- Grade S (the "standard" mid-tier enemies) sit between fodder and elite by
  construction (HP roughly 1.5-2x fodder up to elite scale) — no separate
  band is called out by the owner feedback, so none is asserted here.

## Sweep deltas (before -> after, 12 seeds, maxbuild/hybrid policies)

See PROGRESS.md's fb025 entry for the full before/after sweep table
(`npx tsx tools/sweep.ts --seeds 12 --policies maxbuild,hybrid`) — recorded
there per CLAUDE.md's measurement rules (means and pass-rates, not medians).

## Status

This is a **starting point**, not a final fit. The multiplier (currently ×10
HP / ×0.7 attack speed) and the TTK bands above are tunable going forward —
the memo calls both "tunable." The real balance re-fit happens at P10
(SPEC-FINAL §15) using the full sweep/gate machinery, tuning **from** these
values per the owner's standing order.
