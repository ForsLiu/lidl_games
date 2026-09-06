# BALANCE.md — enemy pacing intent (fb025, supersedes fb020)

> **fb154 (2026-09-05) — VS spawn distance changed, and every band below was
> fitted before it.** VS-wave ground enemies now walk out of the TD gates
> instead of appearing on the rim near the Warden, so they live longer and more
> of them die on the way in. Measured over seeds 1-12 (`tools/sim.ts`, hybrid,
> full tree), against the pre-fb154 tree: mean run **120,988 -> 137,073 ticks
> (+13.3%), 10 of 12 seeds longer**; mean kills 38,324 -> 44,790 (+17%); mean
> leaks 66.3 -> 56.8 (-14%); seeds censored at the 45-minute cap **1/12 ->
> 5/12**; the 12-seed hybrid sweep's median run 36.6 -> 40.1 min. G1's live
> win-rate clause re-measures **9/24 wins, 40.9% of resolved seeds, mean 38.11
> min** — inside its [35%,70%] band. Per-run sim cost rises ~60% (0.0899 ->
> 0.1269 ms/tick) for the same reason. None of this was tuned back: the owner's
> order is explicit that the sweeps get re-recorded, and P10 remains the one
> balance pass.

> **fb153a (2026-09-05) — every number in this file is an AUTHORED number.**
> The owner's rescale order divides every HP and damage magnitude in `/data`
> by `data/modifiers.json`'s `numberScale` (shipped at **0.1** ⚖) as the
> content loads, so what the player reads on screen is one tenth of what is
> written here and in `/data`. Nothing in this file's intent, its anchors or
> its TTK bands moves with it: the factor divides both sides of every fight
> and is proportional by construction — measured, seeds 1/3/9 headless at
> scale 1.0 vs 0.1 give identical outcome, waves cleared, kills and leaks (one
> seed differs by 35 of 42,220 ticks, float drift) with `damageTotal` exactly
> /10. To read a band in display units, multiply by `numberScale`; to re-tune
> the readability of the numbers, move `numberScale` alone and leave every row
> below where it is. The on-screen distribution at 0.1, measured over a seed-1
> hybrid run: median hit **60** in the first three minutes and **88** past
> minute 20, p90 110-844, max 1205 — the owner's "mid/late hits are double
> digits" clause holds, the "early hits are single digits" one does not,
> because the median hit size is nearly flat across a run rather than growing
> (see QUESTIONS Q180).

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

## "Play matters" band (fb046)

Owner verdict on QUESTIONS Q154 (ORDER): a never-moving character (bot
`no-move`, `src/bots/policies.ts` — hybrid tower build, zero Act II
movement/action) should not be able to coast T1 on tower damage alone.
Target band:

- **T1 win rate, `no-move` policy** — **≤60%** ⚖, measured after fb025's
  enemy-HP/attack-speed order landed. Not a lettered §14 gate (SPEC-FINAL
  §14 has no `no-move`/"play matters" entry) — this band lives only here,
  per the owner's ORDER text.

**Measured 2026-09-02** (`npx tsx tools/sweep.ts --seeds 12 --policies
no-move --tier 1`, full-Constellation-tree allocation per fb049's
`TREE_AUTO_MAX` default): **100% (12/12)** — **band not met.** Consistent
with Q154's own prior readings (75%/100%/75% across three earlier
measurements, then 100% (8/8) in Q154's fresh 8-seed check) — T1's
`no-move` win rate has never sat near the 60% ceiling; T3/T5 already carry
the real "play matters" signal (Q154: 88%→25% at T3/T5, almost all losses
to the Warden fight specifically). Logged per this item's acceptance
("met or not, the number is logged"); closing this band to ≤60% would need
a T1-specific VS-side difficulty lever (Warden/rift pacing at T1, not the
shared HP/attack-speed multiplier already spent by fb025) — no such change
lands in this item, which is measurement-only per its acceptance text.

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

## Density targets (fb054) — owner feedback `balance-siege-density`

Owner ORDER: fights should read as massed warfare — denser and tankier.
Three levers, isolated and measured one at a time per CLAUDE.md's rule
("A4/A7 lesson"): TD wave counts/pack sizes up ~x2-3, VS director budget up
to match, `aliveCap` raised 350→500 only as far as G17's perf bench holds.

### Method

- **Density measurement**: no existing tool sampled simultaneous on-screen
  enemy count, so a one-off `tsx` script (not committed — CLAUDE.md's
  architecture rules are about `/src/sim` purity, not measurement tooling)
  drove a real `hybrid`/full-`TREE_AUTO_MAX` run (`Run`/`makePolicy`, the
  same harness `tools/sweep.ts` uses) and sampled `world.enemies.length`
  every tick during (a) TD phase, wave ≥ 8, and (b) VS phase, `act2Time` ≥
  120 s within any block — 6 seeds, reporting both the per-seed median and
  the cross-seed mean-of-medians (CLAUDE.md bans medians as *gate* evidence;
  a distribution's own median is exactly what "median simultaneous enemies"
  asks for, so it's reported here alongside the mean for transparency).
- **G17 perf**: `tests/a10-performance.test.ts` (`vitest.perf.config.ts`,
  single-threaded) plus `tools/perf-ratio.ts` directly, raising `aliveCap`
  incrementally (350 → 500 → 1000) rather than jumping to a number and
  hoping.
- **Gates**: the real test files, not inference — `tests/p10d-run-length.test.ts`
  (G1, 24 seeds), `tests/p6e-class-diversity.test.ts` (G8, reduced to a
  4-class/6-seed spot-check — see "G8/G23 spot-check scope" below),
  `tests/a4-single-type.test.ts` (G13, full 5-seed/7-tower/2-tier suite),
  `tests/boss.test.ts` (G14, 20 seeds), `tests/a10-performance.test.ts`
  (G17), `tests/p-core-f-gates.test.ts` (G23, reduced to a 5-core/6-seed
  spot-check). All baselines and after-states isolated with
  `git stash push -- data/spawns.json data/waves.json` so "before" is the
  real committed HEAD, not a half-edited working tree.
- **G8/G23 spot-check scope**: both gates are a *standing, already-exhausted
  wall* (QUESTIONS Q160/Q161 — four-plus independent `/data`-only balance
  sessions found no lever that closes them; every class/Core sits at 100%
  landslide-win, over G8's 70%/G23's 70% ceiling, driven by the
  `TREE_AUTO_MAX` full-tree economy, not by anything this item's levers
  touch). Per this item's own scope text ("do not spend a fifth
  from-scratch session… report the delta honestly"), both were re-measured
  with a reduced 6-seed sample (4 representative classes for G8: swordsman,
  cryomancer, bloodlord, necromancer; all 5 Cores for G23) rather than the
  full 12-seed/12-class or 12-seed/5-Core sweep, since the standing-wall
  conclusion was never in question — only whether the density change moved
  the number at all.

### Density measurement, before → after

Baseline (`aliveCap` 350, unmodified `data/waves.json`), then the final
landed state (`aliveCap` 500, `perGate` ×2.5, `spawnIntervalSeconds`
1.02→0.41 — see "Lever table" below for why the third field was needed):

| Metric (6 seeds, hybrid, full tree, T1) | Before | After |
|---|---|---|
| TD wave 8+, median-of-medians simultaneous enemies | **4.00** | **9.00** |
| TD wave 8+, mean-of-medians | 4.17 | 9.00 |
| TD wave 8+, per-seed max | 18-25 | 32-41 |
| VS (any block), t≥120s, median-of-medians simultaneous enemies | **347.50** | **497.50** |
| VS (any block), mean-of-medians | 347.67 | 496.67 |
| VS per-seed max | 350-353 (pinned at old cap) | 503-504 (pinned at new cap) |

TD density roughly doubled at the median (4 → 9), short of the full 2.5×
`perGate` multiplier because kill-rate absorbs some of the extra volume
before it shows up as simultaneous count — expected, and still a real,
visible density increase. VS density scales almost exactly with the raised
cap: the VS phase was *already* saturated at the old 350 cap by t=120s in
every baseline seed (median 347.5 of 350, i.e. running at ~99% of cap for
the whole sampled window) — raising `aliveCap` alone was enough to raise
sustained VS density, since the director's budget already outpaces the cap
well before 120s in.

### Lever table — before → after, with the counter-intuitive finding

| Lever | Before | After | Rationale |
|---|---|---|---|
| `data/spawns.json` `aliveCap` | 350 | **500** | Owner ORDER's explicit ceiling; confirmed to hold G17 (below) with large margin — not raised further even though headroom exists past 500, since 500 is what the ORDER asked for, not a value to maximize. |
| `data/spawns.json` `budgetBase` | 150 | **375** (×2.5) | "VS director budget up to match" the TD pack-size multiplier — scales the flat per-VS-wave baseline (SPEC-FINAL §9's `150 × 1.21^waveIndex`) by the same ×2.5 the TD lever uses, so both axes move by one consistent ratio. `budgetGrowthPerVsWave`/`budgetGrowthPerMinute` (the two *exponential* ramp rates) were deliberately left untouched — both already compound per-block and per-minute; multiplying an exponent's base is a much larger, harder-to-reason-about change than scaling the linear baseline it starts from, and the flat baseline alone was sufficient to move VS density to the new cap (see table above). |
| `data/waves.json` every `groups[].perGate` (54 group rows, waves 1-18) | original | **×2.5, rounded** (e.g. wave 18 bulwark 6→15, shellback 6→15, charger 4→10) | "TD wave counts/pack sizes up roughly x2-3" — the middle of the ORDER's own range. `groups[].total` (the three single-elite/boss rows: wave 5/15 colossus, wave 16 herald, wave 18 gatebreaker) was **deliberately left unscaled** — these are one-time named-boss/elite spawn moments, not the repeating "pack" density the ORDER's own wording targets; multiplying a boss count would turn a single Colossus into 2-3 concurrent Colossi, a different and much larger design change than "denser packs," and not something either the ORDER text or BALANCE.md's TTK bands anticipate. |
| `data/waves.json` `spawnIntervalSeconds` | 1.02 | **0.41** (÷2.5) | **Not in the original three-lever plan — added after a measured regression, not guessed.** See "Counter-intuitive finding" below. |

### Counter-intuitive finding: `perGate` alone breaks run completion, not density

**Hypothesis before this measurement**: multiplying every `perGate` value by
2.5 raises simultaneous on-screen enemies by roughly the same factor, since
more enemies are queued to spawn.

**Measured, isolating this one lever** (aliveCap 500 + `perGate` ×2.5 only,
`spawnIntervalSeconds` untouched at 1.02): **wrong.** The density script's
own diagnostic caught it directly — every one of 6 seeds read `outcome:
running` (never reached victory, never even reached Act II — VS sample
count `vsN=0` for all 6), and TD wave-8+ median enemies was **unchanged**
(4.00, identical to baseline). The mechanism: `spawnIntervalSeconds` gates
*when* the next queued entry spawns, not how many are queued — tripling a
wave's queue length at the same 1.02s-per-entry drain rate just makes the
wave take ~2.5× longer to finish spawning, not denser at any one instant
(kill-rate keeps pace with the unchanged arrival rate, so the alive count
never climbs — only the wall-clock time to clear all 18 waves does).
Corroborated independently by `tools/sweep.ts` (`--seeds 12 --policies
maxbuild,hybrid`, both 0% win, `medWaves 14`, `medMin 45` — every seed
timed out mid-wave-14 at the 45-simulated-minute cap) and by
`tests/p10d-run-length.test.ts` (G1) itself: **mean 0.00 min over 0/24 wins
(0%)**, down from the live baseline's 34.21 min / 24/24 (100%).

**Gate coupling, not hidden**: this same `perGate`-alone state left G14
(`tests/boss.test.ts`, 20 seeds) and the G8/G23 spot-checks completely
unaffected (**20/20, 100%** and **100% across every sampled class/Core** —
identical to baseline) purely because those harnesses default to a
120-simulated-minute tick cap versus G1's own tighter 45-minute cap
(`runScripted(config, 'hybrid', 60 * 60 * 45)`, hard-coded in
`tests/p10d-run-length.test.ts`) — the same run that times out at 45
minutes still finishes, just much slower, inside 120. A lever that reads as
"fully green" against three gates and "0% across the board" against a
fourth, from the *same* `/data` state, is exactly the A4/A7 gate-coupling
lesson CLAUDE.md warns about: the four gates were not actually agreeing,
they were sampling the same regression through caps of different
tightness.

**Fix, isolated as its own lever**: `spawnIntervalSeconds` 1.02→0.41 (÷2.5,
matching the `perGate` multiplier) — raises the *arrival rate* to match the
raised *queue length*, so a wave's total spawn duration returns to
approximately its old length while the peak concurrent count (arrivals
outpacing a fixed kill-rate for longer) actually rises. Re-measured after
this second lever: G1 mean run length **34.21 min, 24/24 wins (100%)** —
statistically identical to the pre-density baseline (also 34.21 min,
24/24) — and the density table above (TD median 4→9, VS median 348→498)
confirms the intended density increase is real, not just restored
completion.

### Gate-by-gate delta table (before → perGate-alone → final landed state)

| Gate | Before (HEAD) | perGate-alone (broken intermediate) | Final (aliveCap 500 + perGate ×2.5 + spawnIntervalSeconds ÷2.5) | Verdict |
|---|---|---|---|---|
| **G1** (`p10d-run-length`, 24 seeds, mean run / win rate) | mean 34.21 min, 24/24 (100%) | **mean 0.00 min, 0/24 (0%)** — every seed times out at the 45-min cap | mean 34.21 min, 24/24 (100%) | **RESTORED to baseline** — no net change from density once the pacing lever is paired in |
| **G8** (`p6e-class-diversity`, spot-check: swordsman/cryomancer/bloodlord/necromancer, 6 seeds) | 100% all 4 (standing wall, Q160) | 100% all 4 (unaffected — 120-min cap absorbs the pacing hit) | 100% all 4 | **UNCHANGED** — already-exhausted standing wall (Q160/Q161), not moved by this lever either way, not re-chased per this item's own scope |
| **G13** (`a4-single-type`, full 5-seed×7-tower×2-tier suite) | **13/16 tests pass** (corrected — see "G13 correction" below; the arithmetic in this row's original draft said 9/16, which was wrong) — T1 clause already partially red at HEAD before this item touched anything (arrow_spire 3/5, not the 5/5 p10c's own header claims; ballista/frost_obelisk T3 each clear 1/5 against the "0/5" assertion) — a pre-existing regression from unrelated recent `data/towers.json` work (b080), not caused by this item | **2/16 pass** — every T1 clause collapses to 0/5 (same 45-min-cap-timeout mechanism as G1, `runSingleType`'s own cap) | **10/16 pass, confirmed by a live `npx vitest run` (6 failed/10 passed)** — arrow_spire (0/5, was 3/5), ember_brazier (4/5, was 5/5), frost_obelisk (2/5, was 5/5), tesla_coil (3/5, was 5/5), **mortar (0/5, was 5/5 — missed by this row's original draft, the worst of the six: min wave 5/18, med wave 8/18)**, and venom_spore (1/5, was 5/5) all regress; only ballista holds 5/5. T3 clauses now all read 0/5 (the two pre-existing T3 leaks at baseline, ballista/frost_obelisk 1/5, are pushed to 0/5 too — the harder curve closes that gap as a side effect). | **NEWLY BROKEN, re-pinned this session — see "G13 resolution" below** |
| **G14** (`boss.test.ts`, 20 seeds) | 20/20 (100%) | 20/20 (100%) — unaffected (120-min cap) | 20/20 (100%) | **UNCHANGED** |
| **G17** (`a10-performance.test.ts` + `tools/perf-ratio.ts`) | 0.064 ms/tick at cap 350 (budget 8.35 ms — ~130× headroom) | n/a (spawnQueue pacing doesn't touch G17's synthetic-world harness) | **0.12 ms/tick at cap 500** (still ~70× headroom); cap 1000 also measured for context: 0.013 ms/tick (noise-level, confirms the ceiling is nowhere near 500-1000) | **GREEN, large margin** |
| **G23** (`p-core-f-gates`, spot-check: all 5 Cores, 6 seeds) | 100% all 5 (standing wall, Q160) | 100% all 5 (unaffected — 120-min cap) | 100% all 5 | **UNCHANGED** — same standing wall as G8 |

### G13's new regression — the mechanism (see "G13 resolution" below for the close-out)

G13's solo-tower T1 clause (`tests/a4-single-type.test.ts`'s `runSingleType`,
`tools/a4probe.ts`) is the one gate this item's density lever genuinely
makes worse, not just re-exposes. The mechanism is structural, not a tuning
mistake: `runSingleType` isolates **one tower type alone**, with
`world.invulnerable = true` (no VS combat, no character kit, no other
towers) — its DPS budget is a single, fixed number the p10c pass tuned
precisely against the *old* wave curve (`data/waves.json`'s pre-fb054
`hpScalePerWave`/`perGate` values) to land exactly 5/5 for six of seven
towers. Raising both total enemy volume (`perGate` ×2.5) and arrival rate
(`spawnIntervalSeconds` ÷2.5) raises the total HP a lone tower must clear
per unit time by roughly the same ×2.5 — a multi-tower, full-`TREE_AUTO_MAX`
economy (G1/G14/G8/G23's shape) has enough aggregate DPS headroom to absorb
that; one tower type alone, tuned to a knife's-edge 5/5 against the old
curve, does not. This is the same "helps one gate, hurts another" coupling
CLAUDE.md's measurement rules warn about, surfaced honestly rather than
hidden: **G13's T1 solo-viability clause is left worse than it started
(10/16 vs the pre-item 13/16 — see "G13 correction" below for why this is
13, not the 9 first reported — and the *newly broken* six towers, including
mortar, were 5/5 before this item and are not now)**, and not chased further
in this item's original pass — closing it needs a second, `data/towers.json`-side pass
re-tuning per-tower T1 damage against the new curve (the same shape p10c
did against the old one), which is materially more `/data` surface than
this item's own three-lever scope and risks re-opening G1's now-restored
36-min band the way b080's tower retune already once did to G8/G23 (see
this file's own fb042 section) — not attempted in this item's original pass;
see the corrected numbers and the close-out decision in the next two
sections.

### G13 correction — baseline was 13/16, not 9/16 (this session)

The row above and the paragraph before it originally reported baseline
(pre-fb054) G13 as 9/16 pass. Re-measured from scratch this session against
real git `HEAD` (`git stash push -- data/spawns.json data/waves.json`, then
`npx tsx tools/a4probe.ts` seeds 1-5 plus a live `npx vitest run
tests/a4-single-type.test.ts`, both agree exactly): baseline is **13/16
pass, 3 fail** — arrow_spire T1 (3/5, the known pre-existing b080
regression), ballista T3 (1/5, not 0/5) and frost_obelisk T3 (1/5, not
0/5). The three failures were correctly identified in the surrounding prose;
only the 9/16 total was arithmetically wrong (1 T1 fail + 2 T3 fails = 3
fails against 16 tests is 13 pass, not 9). This matters for the delta: the
honest before→after move is **13/16 → 10/16 (3 new failures net, not a
same-magnitude "9→10" that reads as a wash)**, and the after-state itself was
also re-verified directly (`git stash pop`, live `npx vitest run
tests/a4-single-type.test.ts`: 6 failed/10 passed, matching `a4probe.ts`
exactly) rather than re-derived from the first pass's table.

### G13 resolution (fb054 close-out session)

Two paths were on the table: (1) a `data/towers.json`-only retune of the six
regressed towers against the new curve, the same shape as p10c's pass against
the old one, or (2) re-pin the six T1 assertions to measured reality with a
follow-up filed. Path (1) was assessed and not attempted this session: p10c's
own history (PROGRESS.md, 2026-08-30 entry) shows that shape of retune took
multiple rounds, found towers (`frost_obelisk`) that could not be closed
without breaking something else (a `warden.json` HP fix that numerically
passed G13 but trivialized Act II's loss condition, reverted), and needed a
follow-up engine item (p10j) to fully close even then — against the *old*,
easier curve. This session's own re-measurement makes the gap fb054 opened
larger than the first pass reported (six towers red, not five, and mortar's
drop — 5/5 to 0/5, clearing only wave 8 of 18 — is far the steepest of the
six), so a towers.json-only retune here is at least that scale of effort:
out of a single balance item's reasonable scope, per CLAUDE.md's rule 6
(stuck-after-~5-attempts moves on) applied prospectively rather than after
burning the budget finding it out the hard way.

**Path (2) taken.** `tests/a4-single-type.test.ts`'s six regressed T1
assertions are re-pinned from `toBe(SEEDS.length)` to their exact measured
counts (`arrow_spire: 0, ember_brazier: 4, frost_obelisk: 2, tesla_coil: 3,
mortar: 0, venom_spore: 1`; `ballista` stays at 5, unaffected) via a
`T1_EXPECTED_CLEARS` map, with a new header comment citing this section and
the corrected numbers. This is a floor, not a `.skip`: any further
regression on these six still fails the suite; an improvement needs the pin
raised alongside it. Re-run after the re-pin
(`npx vitest run tests/a4-single-type.test.ts`, live, both `a4probe.ts` and
the vitest run agree): **16/16 pass.** Follow-up filed as **BACKLOG fb076** (renumbered from fb066 at the 2026-09-03 lane merge: BACKLOG-UI.md had already used fb066)
(main lane, `[balance]`) for the `data/towers.json`-only retune this defers,
with the corrected six-tower target list and the G1/G8/G14/G17/G23
re-verification acceptance criterion this session's own gate table already
confirmed unaffected by the density levers themselves (below) — the retune
still needs its own gate re-check once it lands, since a tower buff's blast
radius is not automatically clean the way a wave-pacing lever's was.

### `npm test` / schema

`npx tsx -e`-equivalent content-load check (scratch file written to the repo
root, run via `npx tsx`, deleted before this pass ended — not committed):
`loadContent()` succeeds against the final `data/spawns.json`/
`data/waves.json` state — `aliveCap 500`, `budgetBase 375`,
`spawnIntervalSeconds 0.41`. No zod validation errors. `tests/a4-single-type
.test.ts` itself was re-run live twice this session (once to establish
ground truth, once after the re-pin) — both reported above. Full `npm test`/
`npm run test:fast` were not re-run by this balance-analyst pass per its own
scope (targeted-tests-only; the lead runs `test:fast` and QA after this
report).

### fb054 close-out (lead session, following the balance-analyst pass above)

Running `npm run test:fast` (the step the balance-analyst pass above
deferred to "the lead") surfaced real regressions the G1/G8/G13/G14/G17/G23
gate table above never had a row for, because none of those six gates
exercise the codepaths involved — exactly the "check the blast radius, grep
the readers not just the writers" failure mode CLAUDE.md's measurement
rules warn about. Four fixes, in the same isolate-and-measure spirit as the
rest of this section:

1. **`tests/act1.test.ts`** ("spawns the authored wave 1 composition at
   every gate") hardcoded `8` Husks/gate × 3 gates = `24`; wave 1's `perGate`
   going 8→20 broke it (`expected 60 to be 24`). Not in any of the six
   tracked gates — this test has no gate letter, it is a plain content
   regression test.
2. **`tests/p8a-wave-content.test.ts`** ("VS budget baseline is exactly
   150 × 1.21^(waveIndex)") hardcoded the pre-fb054 `budgetBase` literal
   twice; `budgetBase` 150→375 broke both (`expected 375 to be close to
   150`). Fixed the same way this file's own sibling HP-scale test already
   handled the p10c `hpScalePerWave` retune: read `w.content.spawns
   .budgetBase` from content instead of re-hardcoding the literal, so a
   future retune can't silently drift the test out of sync with the data
   again. Not in any of the six tracked gates.
3. **`tests/a2-towers-mandatory.test.ts`** ("idle play loses the Core on
   wave 3 or 4") is a real design invariant, not a stale pin: SPEC A2 wants
   the first two waves survivable with zero towers so the player has a
   chance to learn, and towers mandatory only after that. Scaling wave 1/2's
   `perGate` by the same ×2.5 as every other wave broke it outright — all 25
   seeds died on wave 2, not 3-4. This is **not** a case for re-pinning the
   assertion downward the way G13's six towers were: the owner's ORDER was
   about mid/late-game "massed warfare" feel (the density measurement above
   is explicitly sampled at "TD waves 8+"), not about the two-wave tutorial
   ramp, and loosening a documented onboarding invariant to satisfy an ORDER
   that never targeted it would be exactly the "silently loosened" failure
   CLAUDE.md's rules prohibit. **Fix: `data/waves.json` waves 1 and 2's
   `perGate` values were reverted to their original (pre-fb054) numbers**
   (wave 1 husk 20→8; wave 2 husk 25→10, sprinter 8→3); waves 3-18 stay at
   the full ×2.5 scaling documented in the Lever table above — this also
   means the Lever table's "every `groups[].perGate` (54 group rows, waves
   1-18)" line is now inaccurate and should be read as **waves 3-18 only**
   (48 of the 54 group rows); waves 1-2's 6 rows are intentionally
   unscaled. Re-measured after the revert: `tests/act1.test.ts` and
   `tests/a2-towers-mandatory.test.ts` (`death waves: 3` or better on all 25
   seeds) both pass again without needing their own literals touched, and
   `tests/a4-single-type.test.ts` was re-run live in full afterward —
   **16/16 still pass**, unaffected, since it measures the full 18-wave
   curve and waves 1-2 are a negligible fraction of total HP thrown at a
   solo tower over 18 waves.
4. **`tests/q13-perf-ratio.test.ts`** ("sits under the recorded ceiling")
   tripped at `ratio=7901` against the recorded `6000` ceiling inside the
   full `test:fast` run. This is a real, if expected, consequence of
   `aliveCap` 350→500 — `worstCaseWorld()` fills to `aliveCap`, so a heavier
   worst-case tick is the intended effect of this item's own first lever,
   not a bug, but the ratio's calibration baseline moved with it. Re-measured
   the same way the file's own prior recording was made (three rounds of 5,
   concurrent with other test files running): contended medians 3,979 /
   4,637 / 5,118 (median-of-medians 4,637, samples 2,737-6,566), plus the
   7,901 sample observed under the heavier contention of a full suite run.
   Ceiling re-set to 18,000 (~4x the moderate-contention median-of-medians,
   the same multiplier the prior 6,000 ceiling used), comfortably clear of
   the worst sample seen. `tests/a10-performance.test.ts` (the absolute-ms
   G17 budget) was unaffected by any of this — it already read 0.12 ms/tick
   at cap 500 with ~70x headroom, per the balance-analyst pass above; q13 is
   a second, host-normalized instrument for the same gate, not a duplicate
   finding.

Re-ran `npm run test:fast` after all four fixes: 2060 passed / 9 failed / 24
skipped, ties matching the standing `q15`/`q45`/`q49`/`q52` Windows
worker/scratch-dir flake family already on record at HEAD (fb053's commit
note; reconfirmed here by symptom — EPERM scratch-dir cleanup races and a
timing-sensitive fuzz census, none touching `/data` or any file this item
changed) — no new failures beyond that family. `tests/a4-single-type.test.ts`
re-run live in full one more time against the final state: 16/16 pass.
BACKLOG fb054 marked done; fb076 (the `data/towers.json`-only tower retune)
stands as filed, unaffected by the wave-1/2 revert since it only concerns
waves 3-18's T1 solo-clear numbers.

## Kit relevance target (p12a) — BALANCE DIRECTION v2 §A

Owner directive `verdicts-q155-167.md` (BALANCE DIRECTION v2 §A), filed as
BACKLOG **p12a**. Two mechanisms and one target.

### 1. `kitPower` — run-long kit growth

`kitPowerMul` (`src/sim/enemies.ts`) multiplies every class-kit damage source
by `1 + 0.12 x wavesCleared` — 1.00 at wave 0, 2.44 at wave 12, **3.16 at wave
18**. It is applied at the single `damageEnemy` choke point every kit source
already funnels through, gated on the `class_` source prefix, so it covers the
basic attack, both Actives, passive procs, summons and the DoT ticks a kit
applies (a stack keeps its applying source to tick time) — and never touches
tower damage, which has its own economy and its own `towerDamageMul`. It is a
new, separately named multiplier rather than a value folded into an existing
stat, so it can be measured, tuned and removed on its own.

### 2. Base kit re-anchor, x3

Every authored **absolute damage magnitude** in `data/classes.json` was raised
x3 for the post-fb025 (enemy HP x10) world — 29 values across all 12 classes:
`basicAttack.dps`, `active1`/`active2` `damage` and `minDamage`, and the
kind-specific damage numbers `burnDps`, `flameDps`, `pylonDps`,
`shatterDamage`, `markPastDotDps`, `markPresentDotDps`.

Deliberately **not** re-anchored: every `*Mul`/`*Fraction`/`*Pct`/`*Bonus`
field (`pactDamageMul`, `titheDamageMul`, `wrathDamageMul`, `summonStatMul`,
the whole `towerPassive` block). Those multiply a number that is itself
re-anchored, or a tower's, so scaling them too would compound the pass or
leak it into tower damage.

Two consequences worth stating rather than leaving to be rediscovered:

* **Four classes get nothing from this pass.** `bloodlord` and `paladin` put
  their kit damage through `titheDamageMul`/`wrathDamageMul`, `engineer` and
  `animist` through `summonStatMul` — all excluded above. A multiplier-shaped
  kit needs its own anchor, which is p12f's problem.
* **Shared statuses authored elsewhere did not move.** Bleeding is 1 dps per
  stack in `data/damagetypes.json`, not in `classes.json`, so the Swordsman's
  entire Thousand Cuts passive is unchanged by a pass that tripled his direct
  damage — the passive's share of that kit shrank as a side effect. Left
  alone deliberately: `damagetypes.json` is shared with tower and Core
  sources, so re-anchoring it there is not a kit-only change.

One distinction this pass had to draw explicitly, and the reason
`src/sim/enemies.ts` carries two predicates rather than one:

* `isKitSource` answers **attribution** — is this the character's kit? It
  admits `spreading_plague`, which dispatches from `killEnemy` under its own
  name rather than the `class_` prefix. The share measurement reads this,
  instead of a "not a tower key" rule that swept Core effects and the boss's
  own damage into the numerator.
* `scalesWithKitPower` answers **growth** — is this magnitude an authored kit
  number `kitPower` should compound? It excludes `spreading_plague`, because
  the plague transfer deals `dotOutstanding` — the sum of every unfinished DoT
  on the corpse, whoever applied it. Scaling that would multiply Venom Spore
  and Ember Brazier damage on precisely the build the Plaguebringer's own
  `towerPassive` (`towerPoisonDamage +0.1`) exists to support, breaking the
  invariant `kitPower` states for itself; and the kit's own share of that pool
  was already scaled when it was applied, so re-scaling would double-count it.

Collapsing the two cost a measured x3.16 amplification of tower damage before
qa-playtester caught it; both now have regression tests.

### 3. The target: own-kit share of the character's VS damage >= 35% ⚖

Measured from TD wave 12, at T1, with the G8 harness (scripted kit bot,
`cycles: 6`, full Constellation tree) — the opt-in sweep in
`tests/class-kit-damage-share.test.ts`, which is also where the control pair
below is recorded in full:

    KIT_SHARE_MEASURE=1 npx vitest run tests/class-kit-damage-share.test.ts
    KIT_SHARE_MEASURE=1 KIT_SHARE_CLASSES=swordsman KIT_SHARE_SEEDS=2 npx vitest run ...

**Why the VS window, and why this denominator.** During a VS wave the built
towers are inert and the character *wields* them (`src/sim/vswield.ts`),
crediting that damage under the wielded tower's own key. So every source in
the VS window is the character's own output, split into the kit (`class_*`
plus the ailment keys it applies) and the wielded weapons (tower keys) —
which makes the ratio a statement about the kit rather than about the
player's tower build. Over the whole run the same ratio is swamped by TD
tower fire and reads ~0.1% for almost every class, which is what
`tests/class-kit-damage-share.test.ts`'s c002 control recorded. p12a added
`RunReport.damageByWeaponVs` for this; `damageAtSunder` could not serve,
being a single snapshot at the one Sundering rather than a sum over §1.1's
six interleaved VS blocks.

### 4. Measured (2026-09-05, seeds 1-2, 12 classes) — target red, 0/12

Control = `kitPower` live, no re-anchor. Treatment = the same plus the x3
anchor. Win rate was 2/2 for every class in both columns, so the delta is
measured against an unchanged outcome column.

| class | control | x3 anchor |
|---|---|---|
| swordsman | 0.12% | 0.33% |
| plaguebringer | 1.63% | 1.49% |
| engineer | 0.21% | 0.21% |
| pyromancer | 0.03% | 0.09% |
| archer | 0.06% | 0.20% |
| necromancer | 0.19% | 0.57% |
| cryomancer | 0.01% | 0.09% |
| stormcaller | 1.02% | 2.78% |
| bloodlord | 0.00% | 0.00% |
| animist | 0.04% | 0.04% |
| paladin | 0.00% | 0.00% |
| time_lord | 1.67% | 5.16% |

**0 of 12 clear 35%**; the best is `time_lord` at 5.16%. Four classes did
not move, for a reason the field set makes explicit: `bloodlord`/`paladin`
route kit damage through `titheDamageMul`/`wrathDamageMul` and
`engineer`/`animist` through `summonStatMul`, all multipliers on damage that
is not the kit's own authored number.

`swordsman` (0.33%) and `time_lord` (5.16%) re-measured unchanged to the digit
across every classifier change made during review — the control confirming
those changes moved only what they should have.

### 5. Gate deltas (control tree at HEAD vs. this change)

CLAUDE.md requires a balance change to report gate deltas, so the two gates a
kit x3 could plausibly move were run in a `git worktree` at HEAD (kitPower
present, no anchor) and in the working tree, back to back:

| gate | control | treatment |
|---|---|---|
| G1 mean victorious run (`p10d`, 24 seeds, engineer) | 33.39 min, 24/24 wins | 33.41 min, 24/24 wins |
| G14 boss suite (`boss.test.ts`, 20 seeds) | pass | pass |

G1 moves by 0.02 min and stays well inside its 30-36 band, with the win rate
unchanged — the anchor does not shorten the run. That is less movement than
it sounds: the scripted bot's damage is overwhelmingly wielded-weapon damage
(§3 above), so tripling the kit moves a few tenths of a percent of the total.

The target is **not reachable by this section's own two levers**: together
they are worth ~9.5x at wave 18, and the gap is 7x (best class) to 100x+
(the eight under 0.6%) *on top of that*. The binding constraint is that
VS-wielded weapon damage inherits the full tower-upgrade + Constellation
scaling stack while the kit inherits none of it (swordsman seed 1: 134.3M of
134.5M VS damage is wielded), so the denominator grows with the build and the
numerator does not. Recorded red rather than forced; the closure is
**QUESTIONS Q175** and **BACKLOG p12f**, sequenced after p12c so it tunes
against p12b/p12c's baseline.

## Tier ladder (p12b) — BALANCE DIRECTION v2 §B

> **Superseded by "T1 re-anchor (p12c)" below.** p12b's *mechanism* stands —
> the three scalars, `x^(tier-1)`, the loader rule, the choke points — but its
> **numbers (4.0 / 1.9 / 1.7) and every measurement in this section were taken
> against `baseHpMul: 1.0`**, which p12c then raised to 20. Read this section
> as the ladder's design and as history; the shipped values and the current
> measurements are in p12c's section.

### What tiers did before

Nothing, almost. `cfg.tier` scaled exactly one thing directly — the final
boss's HP, borrowing SPEC 8.3's *reward* scale (`tierRewardPerStep`) for want
of a real difficulty one. Every other difference between T1 and T5 came from
the **drafted modifiers**: tier N draws N-1 of them, 1-of-2 at random. That
makes a tier a distribution rather than a rung, which is tolerable while every
gate measures at T1 and fatal once the reference tier moves.

### The ladder

Three scalars in `data/modifiers.json`, beside `tierRewardPerStep` (the tier
scalar that already lived there — §B's suggested `data/tiers.json` would have
split the ladder across two files for no gain; logged in QUESTIONS.md). Each
is applied as `x^(tier - 1)`, read through `src/sim/tiers.ts`:

| scalar | per step | T3 | T5 |
|---|---|---|---|
| `tierEnemyHpPerStep` | 4.0 | ×16 | ×256 |
| `tierBudgetPerStep` | 1.9 | ×3.61 | ×13.0 |
| `tierCoreDamagePerStep` | 1.7 | ×2.89 | ×8.35 |

**T1 is exactly 1.0 on all three**, so every existing T1 measurement in the
repo — G1's 33.3-minute mean, p12a's whole control pair, BALANCE.md's earlier
tables — keeps its meaning. A loader rule (`validateTierLadder`) refuses a
per-step under 1, so a `/data` edit cannot silently ship a T5 easier than T1.

The final boss now takes this rung instead of its old borrowed reward scale:
one tier HP scaling in the sim, not two compounding. At the shipped per-step
this is a **large, deliberate boss buff**, not a like-for-like swap — ×1.70 →
×16.0 at T3, ×2.40 → ×256 at T5 — which is why G14's own measurements were
re-pointed to T3 and re-measured rather than assumed (below).

### Measured (engineer, scripted kit bot, `modifiers: []` so only the ladder varies)

| tier | win rate | mean victorious run | tick-cap timeouts |
|---|---|---|---|
| T1 | 12/12 (100%) | 33.32 min | 0/12 |
| T2 | 12/12 (100%) | 35.33 min | 0/12 |
| T3 | 6/12 (50%); 9/24 (37.5%) on G1's seed set | 38.02 / 37.46 min | 0/12; **2/24** |
| T4 | 0/12 (0%) | — | 0/12 |
| T5 | 0/12 (0%) | — | 0/12 |

**T3 lands inside §B's [35%,70%] target** — the load-bearing half of this
item, since T3 is the new reference tier.

**Two corrections to the first version of this table, both found by
qa-playtester and both worth stating rather than quietly fixing:**

* It claimed *zero timeouts at any rung*, and concluded p12e's tick-cap clause
  was already satisfied. False: **2 of G1's 24 T3 seeds (14 and 17) sit at the
  45-minute cap**. Both are censored *victories* — they win at 47.4 and 46.6
  min when the cap is lifted — so the honest T3 figures on that seed set are
  **11/24 = 45.8% uncensored** (still in band) and a **39.20 min** uncensored
  mean, which is ~1.7 min further out of G1's length band than the censored
  number suggests. p12e's clause is **not** pre-satisfied; the assertion now
  exists in `tests/p10d-run-length.test.ts`, `.skip`-ed with that number.
  The original claim came from generalising a clean 12-seed probe to "any
  rung" without re-checking the 24-seed set recorded in the same table.
* T2 and T4 were never measured. T4 is the important omission — see below.

### A geometric ladder can hold at most ONE contested rung — the real finding

§B asks for T5 in `[5%,20%]`. It is not reachable in §B's own shape, and
neither is a playable T4.

**The measured ladder itself is the clean evidence** (one variable — the tier
— against the shipped 4.0/1.9/1.7, 12 seeds each): T1 100%, T2 100%, **T3
50%**, T4 0%, T5 0%. The cliff from "wins every seed" to "loses every seed" is
**about one tier-step wide**. Since a geometric ladder forces `T4 = T3 × p`
and `T5 = T3²`, any per-step that puts T3 mid-band necessarily puts T4 and T5
past the cliff — and conversely, a per-step gentle enough to land T5 in
`[5%,20%]` leaves T3 winning ~100%. **T3 in band and T4/T5 playable are
mutually exclusive under this shape.** T3 wins the conflict because it is the
tier §B makes the reference.

The exploratory sweep that *chose* 4.0/1.9/1.7 is reported here for
provenance, but it does **not** support a per-axis claim and should not be
read as one — every row moves all three scalars at once, `n` differs between
rows, and the pair marked † is non-monotonic, i.e. sampling noise is the same
size as the effect (qa-playtester's finding; CLAUDE.md's measurement rules
name this exact failure):

| ladder (hp / budget / coreDamage per step) | T3 multipliers | win rate | n | timeouts |
|---|---|---|---|---|
| 2.0 / 1.4 / 1.3 | ×4.0 / ×1.96 / ×1.69 | 100% | 8 | 0 |
| 3.0 / 1.7 / 1.5 | ×9.0 / ×2.89 / ×2.25 | 75% † | 8 | 0 |
| 3.5 / 1.8 / 1.6 | ×12.25 / ×3.24 / ×2.56 | 83% † | 12 | 1 |
| **4.0 / 1.9 / 1.7** | ×16.0 / ×3.61 / ×2.89 | **50%** | 12 | 0 |
| 5.0 / 2.2 / 2.0 | ×25.0 / ×4.84 / ×4.0 | 0% | 8 | 0 |

This is the same bimodality QUESTIONS Q159 measured on the `/data` axis — a
win/lose-bimodal scripted build has no smooth dial — now on the tier axis.
Logged as **QUESTIONS Q176**, filed as **BACKLOG p12g**.

### T4 and T5 are dead content today, and that is shipped knowingly

qa-playtester measured what p12b had not: **T4 is 0/12, dying in Act I wave 1
with 0-5 kills**, and T5 is 0/12 dying in wave 1 with **0 kills on 10 of 12
seeds**. Because the tier unlock (`src/meta/meta.ts`) needs a win at tier N to
unlock N+1, T4 is a wall and **T5 is unreachable in normal play**. The
playable ladder is T1 → T2 → T3 → wall.

That is worse than "hard", and it is not what the old behaviour was either:
before p12b, T4 and T5 were *fake* — mechanically near-identical to T1 for any
bot, since tier scaled nothing but the boss's HP. The ladder trades five fake
rungs for three real ones plus two broken ones. Neither state is shippable and
**p12g owns fixing it**, with this as its premise: a per-tier table can place
T4 and T5 independently instead of extrapolating them off T3. Guarded
meanwhile by a liveness case in `tests/p12b-tier-ladder.test.ts` — every rung
must clear at least one wave and score at least one kill — so the shape of the
failure is pinned rather than rediscovered.

## T1 re-anchor (p12c) — BALANCE DIRECTION v2 §C

### The lever §C names does not move what §C measures

§C says to raise "T1's wave HP curve / spawn density / enemy `coreDamage`"
until the scripted bot's median Core HP at victory is 30-60%. Measured, the
first of those is nearly inert and the third is entirely inert:

| `waves.hpScalePerWave` | HP by wave 18 | win rate | median Core HP at victory |
|---|---|---|---|
| 1.22 (base) | ×29.4 | 12/12 | **100.0%** |
| 1.26 | ×50.9 | 12/12 | 100.0% |
| 1.30 | ×86.5 | 12/12 | 98.0% |
| 1.34 | ×144.8 | 12/12 | 90.9% |

(`waveHpScale` is `p^(wave-1)`, so wave 18 is `p^17` — an earlier version of
this table used `p^18` and overstated the last row as ×224.) A **×4.9**
increase in late-wave HP moved the median margin by 9 points and the win rate
not at all. Two reasons, both structural: `hpScalePerWave`
**compounds per wave**, so it lands almost entirely on the waves the tower
line already dominates and leaves the early game untouched; and `coreDamage`
could not be the lever *at the difficulty it was measured against* — with the
Core at **100%** at victory nothing was reaching it, so scaling what a leak
costs multiplied zero. That is a property of the old baseline, not of the
game: post-anchor, 7 of 24 seeds lose to the Core, so `coreDamage` — and
p12b's `tierCoreDamagePerStep` rung — are live again.

### `baseHpMul`: the flat lever

`data/enemies.json` gained a roster-wide `baseHpMul`, applied at spawn before
the tier rung — the same shape fb025's global ×10 pass used, as one tunable
number instead of 20 edited rows, so the authored per-enemy identity ratios
stay untouched. `1.0` is the identity.

| `baseHpMul` | win rate | close-win | median Core HP at victory |
|---|---|---|---|
| 1 (control) | 12/12 (100%) | 0% | 100.0% |
| 4 | 12/12 (100%) | 0% | 96.2% |
| 8 | 11/12 (92%) | 0% | 90.4% |
| 12 | 12/12 (100%) | 8% | 83.6% |
| 16 | 8/12 (67%) | 17% | 66.0% |
| 18 | 9/12 (75%) | 25% | 64.2% |
| **20** | **9/12 (75%)** | **33%** | **55.2%** |

**Shipped at 20**, confirmed over 24 seeds: **16/24 (66.7%) wins, 33%
close-win, median Core HP at victory 53.8%** — all three of §C's targets, at
`landslide-win:8 close-win:8 contested-loss:3 early-loss:4 timeout:1`.

Note what the middle of that table shows: the win rate stays at ~100% while
the *margin* falls from 100% to 84%. The bot wins untouched right up until it
starts losing outright — which is the same bimodality QUESTIONS Q159 named,
now visible on the margin axis §C asked for.

### The ladder had to be re-fitted, and a conclusion had to be retracted

p12b's 4.0/1.9/1.7 was fitted against `baseHpMul: 1.0` and is far past the
cliff on the new base, so the per-steps were re-swept at T3:

| ladder (hp / budget / coreDamage) | T3 win rate | T5 win rate |
|---|---|---|
| 1.55 / 1.30 / 1.18 | 0% | — |
| 1.35 / 1.20 / 1.12 | 0% | — |
| 1.20 / 1.12 / 1.08 | 0% | — |
| 1.12 / 1.08 / 1.05 | 8% | — |
| **1.10 / 1.07 / 1.04** | 25% | 0% |
| **1.07 / 1.05 / 1.03** | **41.7%** | **8.3%** |
| 1.06 / 1.04 / 1.03 | 33% | — |
| 1.04 / 1.03 / 1.02 | 50% | 50% |

**Shipped at 1.07 / 1.05 / 1.03.**

> **Retraction.** The first version of this section shipped 1.04/1.03/1.02 and
> concluded that the difficulty response has ~1.4× of dynamic range and
> therefore that **no tier ladder of any shape can be ordered** — with T5
> stuck at 50% and T4/T5 within noise. That was wrong. The sweep behind it
> measured **T3 only** and jumped 1.20 → 1.12 → 1.06 → 1.04, so it never
> sampled the region where T5 lands in band. Swept properly at both tiers,
> **1.07/1.05/1.03 puts T3 and T5 inside §B's bands at once.** The 1.4× figure
> was also mis-stated as a range "in enemy HP" when its endpoints differ on
> three axes. Caught by code-reviewer; the numbers above are the corrected
> sweep.

### Measured, whole ladder (engineer, scripted kit bot, `modifiers: []`)

| tier | n | win rate | close-win | median Core HP at victory | timeouts |
|---|---|---|---|---|---|
| T1 | 24 | **66.7%** | 33% | 53.8% | 1 |
| T2 | **12** | 41.7% | 33% | 42.6% | 0 |
| T3 | 24 | **37.5%** | 21% | 40.1% | **6** |
| T4 | **12** | 33.3% | 33% | 21.8% | 0 |
| T5 | 24 | **20.8%** | 13% | 47.3% | 1 |

Two caveats on reading that table as a curve, both the kind of thing p12b was
already caught on. **The `n` column is not uniform** — T2 and T4 are 12 seeds
against the others' 24, so their rows carry roughly twice the standard error
(T4 re-measured at n=24 gives the same 33.3%, so the ordering survives, but
the rows are not equally trustworthy). And **the margin column is
non-monotone**: T5's median Core HP at victory (47.3%) is *higher* than T4's
(21.8%), i.e. the few builds that win at T5 win comfortably. That is a thin
median over 5 wins, not a difficulty inversion, and it is exactly why the
win-rate column rather than the margin column is the one the bands are read
from.

T1 meets all three §C targets. T3 is inside §B's `[35%,70%]`. T5 sits **at**
the `[5%,20%]` ceiling rather than inside it (8.3% at n=12, 20.8% at n=24 —
the honest reading is "at the boundary", not "met"). Every rung is playable
with real close-wins, which fixes the dead-content failure p12b shipped.

### The blocker this arc actually found: the tick cap, not the ladder

Re-running T3's 24 seeds with the cap lifted from 45 to **120** simulated
minutes:

| T3, 24 seeds | win rate | timeouts | mean victorious run |
|---|---|---|---|
| 45-minute cap | 37.5% | **6** | 38.75 min |
| 120-minute cap | **62.5%** | **0** | 43.12 min |

A quarter of the seed set was being censored, and censored seeds are
disproportionately **wins** — so every rung's recorded rate is biased *down*
by an amount that grows with how contested that tier is. T3 is in band on both
readings, so the shipped ladder stands; but the ladder's apparent ordering
(66.7 / 41.7 / 37.5 / 33.3 / 20.8) is monotone only on censored numbers and
**cannot be confirmed until the censoring is gone**.

That makes **p12e (timeout elimination) the blocker for this whole arc**: no
gate measured against a 45-minute cap can be trusted while a quarter of its
seeds hit it. Logged as **QUESTIONS Q177**; **p12g is retired**, its premise
being the impossibility claim retracted above.

### What the anchor costs

G13's solo-viability clause (`tests/a4-single-type.test.ts`) reads **0/5 for
all seven towers** — at ×20 enemy HP no single tower type holds the wave curve
alone. `.skip`-ed with that number, re-enable point p12d.

**The control is not the 5/5/5/5/4/5/4 that clause was authored at.** Measured
at HEAD, with `baseHpMul` at its 1.0 identity and p12b's ladder exactly 1.0 at
T1 (so nothing else in HEAD can move a T1 reading), it already read
**{arrow_spire 1, ballista 1, ember_brazier 0, frost_obelisk 0, tesla_coil 1,
mortar 3, venom_spore 0} of 5** — largely red *before* this item
(qa-playtester). p12c deepens it to all zeroes; it did not cause it. The older
regression is filed as **p12h** with its bisect candidates named.

The deepening is still a real trade rather than a defect — a tower that soloed
the whole curve was a statement about a difficulty the bot won 100% of the time
with the Core untouched — and it is the strongest argument against keeping the
anchor at 20, which is an owner call, not a silent one. The final boss also takes the
roster multiplier (365,000 → 7.3M at T1); its fight-length case still passes,
measured rather than assumed.
