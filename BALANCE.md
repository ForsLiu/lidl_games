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

## fb042 gate re-check (2026-09-02): Constellation `startingGold` vs G1/G6/G14

Balance-analyst check requested by fb042's own acceptance text (BACKLOG.md,
Q146 ORDER): 15 previously-dead/multiplicative Constellation nodes
(`data/tree.json`) now grant a flat, additive-only `startingGold` — 13 smalls
("Keen Eye"/"Scavenger") at +5 each, Tinkerer and Gilded Path at +25 each
(Gilded Path's old `goldFind: 0.2` mul stat retired outright, not stacked).
Fully allocated (every real Hub run and every gate test now feeds
`allTreeNodeIds(content)`/`TREE_AUTO_MAX` into `RunConfig.allocated`, per
fb039/fb049) that's **+115 gold on top of `content.waves.startGold` (250,
`data/waves.json`)** — a one-time, non-compounding addition at `World`
construction (`src/sim/world.ts`: `this.gold = content.waves.startGold +
this.stats.total('startingGold')`).

**Gate definitions** (SPEC-FINAL §14): **G1** — mean victorious run 30–36 min
over 24+ seeds, means/pass-rates never medians. **G6** — interleave
mechanics: TD×3→VS pattern, multi-summon ≤3, no early-call gold bonus
(fb009), fixed `20 + 10×wave` clear reward, VS unstackable. **G14** — boss,
20 seeds, scripted-build win rate ≥60% and <100%.

**Method**: isolated the single lever with `git stash push -- data/tree.json`
(control = the 15 nodes' dead/mul stats exactly as committed at HEAD, the
`startingGold` engine mechanism itself — already implemented, not part of
this check — held constant in both states) against the real gate test files
(`tests/p10d-run-length.test.ts` for G1, `tests/boss.test.ts` for G14,
`tests/p3a-run-shape.test.ts`/`tests/p3b-multi-summon.test.ts`/
`tests/f003-leak-coupling.test.ts` for G6) plus `npx tsx tools/sweep.ts
--seeds 12 --policies maxbuild,hybrid` as a cross-check, all at T1.

**Important finding, not caused by fb042 but discovered while isolating it**:
PROGRESS.md's last recorded G1/G14 baseline (fb049, same day: mean 36.36 min
/ 23-24 wins for G1, 19/20 for G14) is now stale — enough further
balance-relevant work landed later in the same 2026-09-02 session (the
fb029-040 batch: dash-as-fast-move, VS XP gem acceleration, etc.) that **by
the time fb042 was written, G1's live win-rate clause and G14 were already
both failing outright at HEAD with fb042's tree.json reverted** (100% win
rate on both — over each gate's own `<1`/`<100%` ceiling), independent of
this change. This was confirmed by running the actual vitest files, not a
probe script.

| Lever | Before (HEAD content, fb042's `tree.json` reverted to its committed dead/mul stats) | After (fb042 applied, current working tree) | Gate delta |
|---|---|---|---|
| **G1** win-rate clause (`tests/p10d-run-length.test.ts`, 24 seeds, hybrid, engineer, T1, full tree) | **24/24 wins = 100%** — test **FAILS** (`rate < 1`) | **19/24 wins = 79.2%** — test **PASSES** | **RED → GREEN** |
| G1 mean-run-length clause (same file, `.skip`-ed, band 30–36 min, owned by BACKLOG p10r) | mean 36.45 min / 24 wins — already over the 36 min ceiling (pre-existing, unrelated to fb042) | mean 36.70 min / 19 wins — over ceiling by +0.25 min more | still red-but-skipped either way; drifted ~0.25 min further from band |
| **G14** (`tests/boss.test.ts`, 20 seeds, hybrid, T1, cycles 6, full tree) | **20/20 wins = 100%** — test **FAILS** (`wins < 20`) | **16/20 wins = 80%** — test **PASSES** | **RED → GREEN** |
| **G6** (`p3a-run-shape`, `p3b-multi-summon`, `f003-leak-coupling` — interleave pattern, fixed clear reward, multi-summon cap, VS-unstackable) | all pass (none of these mechanics read gold or `allocated`) | all pass, unchanged | unaffected, **GREEN** both states |
| Cross-check: `tools/sweep.ts --seeds 12 --policies maxbuild,hybrid`, T1 | maxbuild **100%** win / hybrid **100%** win | maxbuild **25%** win / hybrid **75%** win | large drop, same direction as G1/G14 |

**Why the direction is counter-intuitive**: more starting gold is not a pure
buff to bot win rate here. `maxbuild`/`hybrid` are greedy, threshold-ordered
spenders, not optimal planners — an extra ~115 gold available at wave 1
changes *what* they buy first (a different early build order), not just *how
much*. On the current `/data` this shifts several seeds from clearing the
boss cleanly to still-`running`-at-the-tick-cap instead of an outright loss
(no seed newly dies from more gold — see the per-seed breakdown captured
during this check), which is a real, reproducible, seed-deterministic effect
of the specific spend-order sensitivity of these bot policies, not sim noise.

**Net result: G1's live clause and G14 both move from failing to passing.**
This is a fortunate side effect, not fb042's intended mechanism — the actual
cause of the "before" over-ceiling failure is unrelated balance drift from
later fb029-040 items, and fb042's added gold happens to counteract it on
these two gates. G6 is structurally untouched either way (pure wave/reward
mechanics, no gold dependency).

**`/data` changes made by this check: none.** Both live gates already pass
with fb042's shipped values (13×+5 small nodes, 2×+25 notables). No retune
was required or performed; `data/tree.json` is unchanged from what fb042
committed. `npm run test:fast` re-run against the final state: 2029 passed /
4 failed / 23 skipped — the 4 failures are all in
`tests/q15-command-domain-fuzz.test.ts`, the pre-existing Windows
worker-hang flake class PROGRESS.md's fb049 entry and BACKLOG fb047 already
document as unrelated to `/data` content; no new failures.

**Flagged for whoever picks up BACKLOG p10r (not fixed here, out of this
check's scope)**:
1. p10r's retune target (G8/G23's over-ceiling classes/Cores) should
   re-measure against the *current* HEAD — including fb042's gold — before
   spending its budget; the goalposts have moved twice since fb049 (once
   from the fb029-040 batch, again from fb042), and G8/G23's tests read the
   same `allTreeNodeIds`/full-tree allocation this fb042 gold feeds into, so
   they're plausibly under the same coupling documented above.
2. G1's `.skip`-ed mean-run-length clause drifted **further** over its 36-min
   ceiling under fb042 (36.45→36.70 min) even while its paired win-rate
   clause improved — a small instance of the A4/A7 gate-coupling lesson: the
   same lever moved the two clauses of the same gate in opposite directions.
   Neither is CI-blocking today (the mean clause is `.skip`-ed), but a future
   pacing retune (p10r or later) should use 36.70 min, not the stale 36.36
   min, as its starting point.
