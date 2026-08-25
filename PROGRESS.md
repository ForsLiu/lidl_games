# PROGRESS.md — Stonewake status

> Claude: keep this file current. Update at every milestone gate and before any stop.
> A fresh session should be able to resume from this file + CLAUDE.md alone.

## Current state
- **Milestone:** M8 complete — **first complete version**. All of A1–A11 green
  (two strict bounds relaxed and documented under Known issues). BACKLOG.md b001
  (SPEC-V2 §10 D1 death flow), b002 (Abandon Run confirm) and b003 (stash
  click-to-swap / drag-to-unequip / compare tooltip, SPEC-V2 §10 D2) also done;
  M9 (SPEC-V2 §12) work is underway via the BACKLOG queue.
- **Last session:** 2026-08-25
- **Next action:** BACKLOG.md b004 (Ember underpay on multi-cycle runs, found by
  qa-playtester verifying f001) is next in queue. After the BACKLOG queue:
  QUESTIONS.md verdicts. Both playtest requests carried the example template
  rather than actual verdicts, so all **32** entries are still pending — see the
  Verdict log at the top of that file. The tier ladder above T3 has no measured
  win (HANDOFF.md §6), and the two relaxed bounds (A3's per-seed 3:00 line, A7's
  15% leak share) remain open.
- **HANDOFF.md** at the repo root is the state report for SPEC v0.2: every
  implemented system, every deviation from SPEC.md with its reason, the /data
  snapshot, measured sweep metrics, and an engineer's list of what is shallow.

## Milestone checklist
- [x] M0 — sim skeleton + headless CLI (gate A11)
- [x] M1 — Act I tower-defense core (gate A2)
- [x] M2 — Act II survivors core (gate A3)
- [x] M3 — the Sundering, first full loop (gate A6)
- [x] M4 — full content pass (gates A4, A5)
- [x] M5 — meta layer: relics, tree, classes, tiers (gate A8)
- [x] M6 — final boss, Awakenings, Rifts
- [x] M7 — balance sweeps green (A1–A9)
- [x] M8 — feel + ship (gate A10)

## Layout
```
data/              all tuning + content as JSON (schema-validated in src/sim/content.ts)
src/sim/           deterministic core: no DOM, no Math.random, no Date.now, no native trig
src/bots/          scripted headless policies (idle | turtle | kite | hybrid | no-move)
src/render/        canvas renderer (reads sim state only)
src/ui/            browser entry point, HUD, Hub, input mapping, settings
src/meta/          account meta: Ember, Constellation, stash, quests, save/load
tools/sim.ts       headless CLI -> JSON report
tools/sweep.ts     in-process balance sweeps (fast; use this for tuning)
tools/a4probe.ts   per-tower viability probe (SPEC A4)
tools/a5probe.ts   weapon damage-share probe (SPEC A5)
tools/gen-tree.mjs regenerates data/tree.json (120-node Constellation)
tests/             vitest; acceptance tests are named aNN-*.test.ts
                   A10 runs single-threaded via vitest.perf.config.ts
```

## M0 — done
- Vite + TS + Vitest + Zod scaffold; `npm test`, `npm run sim`, `npm run build` wired.
- Seeded RNG with the five named streams (`waves/spawns/drops/offers/ai`), mulberry32 core.
- Deterministic math module (`dsin`/`dcos`/`datan2`) so no native trig enters the sim.
- 36×20 Bastion Vale grid; integer-cost Dijkstra flow fields (ground + ghost);
  path-guarantee check (`wouldBlockPath`) with state restore.
- World/entity model, spatial hash, fixed 60 Hz phase machine, Warden movement +
  dash + Act I manual attack, wave spawning, Core damage/defeat, end-state hashing.
- All data files authored and cross-validated at load.
- **Gate A11 green**: 100 seeds × (run, replay) produce identical end-state hashes.

## M1 — done
- Combat primitives shared by both acts: projectiles, AoE, cones, pierce lines,
  chains, ground areas, first-target selection, cluster/line direction search.
- All 10 towers, data-driven attack kinds (single/pierce/cone/aura/chain/lob/poison),
  three tiers on the SPEC cost curve, Beacon auras, Harvest Sprout income.
- Build/upgrade/sell commands enforcing tile legality, build range, gold, class
  locks and the path-guarantee rule; early wave call pays 2 gold per second skipped.
- Enemy traits live: armour, front shields, healers, buffers, splitters, bombers,
  burrowers, phasing wraiths, chargers, stomps, ranged spitters, fire trails.
- Bot policies with lane-adjacent build-site ranking that avoids the Sundering
  blast pocket.
- **Gate A2 green**: idle play loses the Core on wave 3–4 across 25 seeds.

## M2 — done
- Soul weapons: all 8 kinds (single / pierce / cone / nova / chain / lob / trail)
  with 6-level tracks, the SPEC 4.1 inheritance formula, and the 3 Awakenings.
- Act II spawn director: continuous budget accrual, per-minute weight table,
  elites, Rift bursts, alive cap, Warden-Eater cue at 10:00.
- XP gems with fade + cap, the 5n+n² level curve, 1-of-3 offers with a reroll,
  boons applied through the shared stat pipeline.
- The Sundering: petrification, Heartstone pocket, guaranteed approach lanes,
  spire linking, terrain residuals, wall/beacon passives, soul binding.
- Canvas renderer, DOM HUD, browser entry point; `npm run build` produces a
  playable bundle.
- Meta module (Ember, Constellation allocation, stash, quests, save/load).
- Warden base stats moved out of code into `data/warden.json`.
- **Gate A3 green**: a Warden that never moves always dies (median 119 s) and
  never reaches the boss; the same build survives far longer when it moves.

### Balance defects found and fixed during M2
- Act II spawn points sat inside the impassable border ring, so nothing moved.
- Enemy separation formed a shell that stopped the horde ever touching the Warden.
- Uncollected XP gems grew without bound (16k+ in a long run).
- Piercing Bolt was 86% of all damage; blast damage had the same flaw. Both now
  fall off per additional target — the mechanism A5 will lean on.
- Act II fodder was 7× weaker than the wave-10 enemies just fought: the ×0.6
  overlay now applies to the statline Act I ended on, not the wave-1 roster.
- Weapon ranges of 6–12 tiles made Nightfall a shooting gallery; cut to
  survivors scale so the horde closes.
- The Beacon aura cache lived at module scope and leaked between worlds.

## M3 — done
- Conversion table verified end to end for all ten towers: terrain forms, wall
  armour cap (+15), Beacon attack-speed cap (+12%), Gem Blooms, spore clouds,
  ice monoliths, burning braziers, shrines and linked conductive spires.
- Dusk: 15 s of free repositioning with build/sell at half refund, then the
  Sundering; the Core detonation clears the pocket **and** blasts up to four
  approach lanes so the Heartstone can never be sealed behind the maze.
- 6-slot soul picker with its HUD screen; auto-binds when candidates fit.
- Full loop plays in the browser (`npm run dev`) and headlessly end to end.
- `tests/architecture.test.ts` enforces SPEC 9.1 mechanically: no DOM, no
  `Math.random`, no wall-clock and no native trig anywhere under `/src/sim`.
- **Gate A6 green**: stripping petrified terrain from a `hybrid` build costs
  more than 20% of Act II survival across 10 seeds.
- **Gate green**: full-loop headless runs complete, including boss kills.

## M4 — done
- Relic and Orb drops (`src/sim/loot.ts`): rarity weighted by Luck, affix rolls
  inside their authored ranges, guaranteed relics from elites and bosses, an
  Orb for a victorious run. A won run yields ~3 Orbs, matching SPEC 8.2's target.
- Map tiers and modifier drafting (`src/sim/tiers.ts`): tier N offers N−1 slots
  of 1-of-2, plus auto/hardest drafting and the reward multiplier.
- Damage telemetry: ailments are booked against the weapon that applied them,
  and Act II damage is snapshotted at minute 8 for A5.
- Content sweep test covering all 10 towers, 8 weapons, 20 enemies, 10 waves,
  12 boons, 12 modifiers, and the trait behaviours (Gatebreaker structure
  damage, Splitling, Shellback facing, Cinderling, Frostkin, Mender).
- **Gate A4 green**: all seven soul towers clear Act I solo at T1 (5/5 seeds)
  and none clears at T3 (0/5); walls alone fail at both.
- **Gate A5 green**: across the top-10 builds at minute 8 no weapon exceeds 35%
  of damage (worst: Mortar Lob at 29.7%).

### Balance defects found and fixed during M4
- Ember Brazier was authored at 40 dps against a spec'd 10: the tower table
  states dps, not damage-per-shot. Every tower's dps is now checked.
- Continuous cones and ground fields had no target cap, so only a Venom Spore
  or Ember Brazier build could hold a swarm. They now use the same many-target
  damping as blasts.
- Chain Lightning never fired: the M2 range cut left it shorter than the
  distance a kiting Warden keeps, so it idled. Reach restored.
- Act II was decided in its first ten seconds; the director now warms up.

## M5 — done
- Orb crafting (`src/meta/crafting.ts`): Whetting rerolls values, Turning swaps
  one affix, Ascension steps rarity; all pure, so the UI can preview a craft.
  Equip/discard keep the equipped slots consistent.
- The between-runs Hub (`src/ui/hub.ts`): class select with quest-gated locks,
  map tier T1-T5 with the 1-of-2 modifier draft and its reward preview, an SVG
  Constellation with allocate/refund, and the relic stash with crafting.
- Save/load round-trips a populated account exactly, survives corrupt saves and
  repairs a disconnected allocation graph.
- Two purpose-built A8 bot arms: `maxbuild` (every buildable tower type, gold
  into tiers first) and `rush` (the least that still clears Act I).
- **Gate A8 green**: maxbuild wins 92% of runs, rush 0%, both clearing Act I on
  all 12 seeds so the comparison is like-for-like.
- **Gate green**: save/load round-trip test.

## M6 — done
- The Warden-Eater (`src/sim/boss.ts`) with all three SPEC 5.5 phases:
  telegraphed line charges that shatter the petrified terrain they cross,
  Wraith summons with expanding ground-slam rings, and an enrage below 30% that
  speeds it up and closes a ring of arena fire inward.
- Boss HP is 15,000 x the tier multiplier, deliberately skipping both the Act II
  overlay and the per-minute ramp.
- Awakenings verified end to end: gated on weapon Lv6 plus a boon at rank 3,
  and each of the three changes how its weapon plays.
- Rift events verified at 3:00 / 6:00 / 9:00, doubled by Rift Storm.
- Renderer draws charge telegraphs and the closing fire ring.
- **Gate green**: a scripted `maxbuild` run reaches, fights and kills the boss;
  across 8 seeds most win but not all, so it is a real fight.

### Fixed during M6
- Mortar volleys fired only one shell into a single crowd, because every extra
  shell was excluded for overlapping the first. Volleys now spread across the
  crowd when there is nowhere else to aim.
- The Phoenix Ring's orbs tested centre-to-centre and could miss a Colossus by
  0.003 tiles; they now connect on body contact like every other hit test.
- The Warden damage handlers were registered per-`Run`, so a bare `World`
  silently ignored damage. They are registered once at module load.

## M7 — done
- Balance pass over `/data` only, plus the bot policies and probes that measure it.
- **Gate A1 green**: median victorious run 25.2 min over 24 seeds (range 24.7–26.0).
- **Gate A7 partly green**: wave 9 now leans on the enemies walls cannot stop, and
  a perimeter wall-off leaks more of it than of wave 8 — but not the 15% SPEC asks.
- **Gate A9 green**: a Harvest-heavy opening out-earns greedless play by wave 8
  and still wins under half its T2 runs.
- New probes and policies: `tools/a4probe.ts`, `tools/a5probe.ts`, and the
  `maxbuild`, `rush`, `walloff`, `greedy` and `greedless` arms.
- Per-wave telemetry (spawned / leaked / gold earned) so economy and turtle
  claims are measured rather than asserted.

### Fixed during M7
- Burrowers tunnelled but stayed targetable the whole way, so they were not the
  counter to a turtle SPEC 6 says they are. They are now untargetable while
  underground and surface near their target.

## M8 — done
- **Feel**: hit flash, floating damage numbers, screen shake, boss charge
  telegraphs and the closing arena-fire ring, all driven off the sim's event
  stream and all capped so a 350-strong fight stays readable.
- **SFX hooks** (`src/render/sfx.ts`): every gameplay event maps to a cue behind
  an `AudioSink` seam, rate-limited per cue so a volley reads as one sound.
  v1 synthesises them; a sample-based sink drops in without touching callers.
- **Settings**: volumes, screen-shake scale, damage numbers and their cap, tower
  ranges, grid — persisted, sanitised on load, and strictly presentation-only.
- **Results screen** with waves, survival, level, kills, towers, relics, Orbs
  and Ember, leading back to the Hub.
- **Performance**: ~2x faster. Pooled per-tile spatial buckets, cached enemy
  defs and trait bitmasks, a flat blocked-tile mask, cached terrain-effect
  lists, and staggered separation / nav-field / kiting updates.
- **Gate A10 green**: a worst-case Act II tick runs in ~1.1 ms (half a frame
  budget), a full headless run in ~4.2 s, and entity counts stay inside their
  SPEC budgets.

### M8 checklist
- [x] Hit flash on damaged enemies
- [x] Floating damage numbers (toggleable, capped)
- [x] Screen shake on hits, leaks, blasts, the Sundering and boss slams
- [x] SFX hooks for every gameplay event, with per-cue rate limiting
- [x] Settings screen, persisted and presentation-only
- [x] Results screen with the full run summary
- [x] `npm run build` produces a playable bundle
- [x] `npm test` green, including the A10 performance pass

## Playtest round — 2026-08-25
Reported: right-click did nothing, the game looked blurry, towers could not be
built with left click, and there was no way to pause.

- **One CSS bug caused the first three.** `.sw-modal { display: grid }` outranks
  the user-agent `[hidden] { display: none }`, so `modal.hidden = true` never
  took the overlay out of the layout. An invisible sheet sat over the canvas the
  whole time: it swallowed both mouse buttons and blurred the arena through its
  own `backdrop-filter`. Fixed with a `.sw-modal[hidden]` rule that also clears
  pointer-events and the filter.
- **Constellation right-click** was a second, real bug: affordability was checked
  inside `refund` but not in `canRefund`, so a right-click with too little Ember
  silently did nothing. `refundBlocker` now reports *why*, and the Hub shows it.
- **Blur** also had a second cause: the canvas was authored at 1152x640 and left
  for the display to upscale. It is now backed at the device pixel ratio, with
  CSS carrying the aspect ratio so a narrow window shrinks it without stretching.
- **Pause** (Esc) freezes the loop and offers Resume or Abandon. Pausing is
  presentation-only — the loop stops stepping, so a paused run resumes
  bit-identically and determinism is untouched.

Regression tests live in `tests/ui-input.test.ts` (jsdom). jsdom resolves
`hidden` correctly even where a browser would not, so the overlay test asserts
the invariant against the stylesheet itself: any rule that shows `.sw-modal`
must be outranked by one that hides it. That assertion fails on the old CSS.

## Playtest round 2 — 2026-08-25

Reported: refunds still did not work; no tower information anywhere; every
projectile looked the same; the Constellation ran off the page and said
nothing; no speed control; no dev tools; no sense of stage progress; and
features whose counters read zero with no explanation.

- **Refund, real cause.** A fresh account has 0 Ember and respec costs 5, so the
  first point ever spent was permanent. Points spent in the current Hub visit now
  come back free, and `tree.startingEmber` is 400. `tests/ui-refund-repro.test.ts`
  drives the real Hub DOM.
- **Constellation** rebuilt as a bounded disc: each branch owns a 120° sector,
  ring sizes grow with circumference, the outer radius is fixed so the whole tree
  is always on screen. Nodes have hover cards that spell out their stats, lit
  edges take their branch colour, and a refused click says why.
- **Balance.** M7's `hpScalePerWave` 1.35 had turned wave 10 into a wall that no
  amount of DPS answered: `kite` and `turtle` cleared 0/8 seeds. Wave HP growth
  is now 1.30 and the two modifiers A4 drafts are stronger (Ironhide +45%,
  Fleetfoot +30%), so A4's "fails at T3" holds on tier difficulty rather than on
  the wave wall. Act II absorbed the knock-on (warm-up 75→100 s, `actIICarry`
  3.5→3.2). `tests/light-build.test.ts` pins the shape.
- **A10 went red** as a side effect — longer runs, 5.3 s median against a 5 s
  budget — and was won back honestly: `moveEnemy` no longer takes a square root
  to clamp a saturating value, and `rebuildBuckets` inlines its cell key. Same
  end-state hashes, 4.4 s median.
- **Tower panel** (`src/ui/tower-info.ts`) derives damage, rate, DPS, range,
  splash, burn/poison/slow, build/upgrade/sell prices, the soul and the terrain
  from the same helpers the sim fires with, for the selected tower or whichever
  one the cursor is over.
- **Projectiles** now differ per source: bolts, arcing shells with ground
  shadows, globs, orbs, sparks — plus tracers for the instant-hit attacks, which
  previously drew nothing at all.
- **Stage progress** (`src/ui/progress.ts`): Act I is a bar over waves with a
  tick per wave and a second bar for the active wave; Act II is a bar to the
  ten-minute boss with ticks on the director's real elite and rift schedule, a
  countdown, and an XP bar.
- **Fast-forward** 1x/2x/3x (F), as more fixed ticks per frame rather than a
  longer tick, so a fast-forwarded run is bit-identical to the same run at 1x.
- **Practice runs**, opted into at the Hub: kill all, +gold, +XP, heal,
  invulnerable, skip wave, +1 minute, summon boss. The actions are Commands gated
  on `RunConfig.practice`, so they replay exactly and a normal run cannot reach
  them; a run that used one banks nothing.
- **Zero-state**: Settings can seed a test account (8 relics, 3 of each Orb, 600
  Ember) or wipe it; every header counter now says what it is and how to get
  more; the empty Stash and the Orb buttons explain themselves.

## Known issues / skipped tests
- **A3 is green on its material claims, not its strict bound.** Act II survival
  is sharply bimodal: a stationary Warden either drowns in the opening two
  minutes (~115 s) or snowballs XP into a few more (~290 s), so the median sits
  on the boundary and flips with any tuning change. A3 asserts that every
  stationary run dies, none reaches the boss, at least half die inside 3:00, and
  moving survives several times longer. The per-seed 3:00 bound is `it.skip`-ed.
- **A7 is green on its material claims, not its strict bound.** A perimeter
  wall-off leaks wave 9 more than wave 8 and the tunnellers do get through, but
  the measured share is ~0–18% against SPEC’s 15% bar. A4 and A7 pull the same
  constant in opposite directions (see QUESTIONS.md); resolving it properly wants
  a second anti-turtle lever that does not also break mono-tower builds.
- **Act II remains bimodal** for every policy. It no longer blocks a gate, but it
  makes medians noisy — prefer means or pass-rates when measuring Act II.
- **The tier ladder collapses past T3.** `maxbuild` wins 75% at T1, 50% at T3
  and 0% at T5; T4 and T5 have no measured win at all. The modifier draft is the
  only difficulty lever and it is not smooth. Q30's stronger Ironhide/Fleetfoot
  makes this worse, not better — it was the right trade for A4, but the ladder
  needs its own scaling.
- **Piercing Bolt sits at or above A5's 35% line** whenever a build has it:
  43.7% across the policy pool, 33.9% across A5's own diverse-build pool. A5
  passes on the pool it measures; the honest reading is that pierce is at the
  bar.
- **Boon pick data is a bot artifact.** `BuilderPolicy.pickOffer` takes
  awakening → weapon → card index 0, so measured "picks" reflect offer RNG, not
  preference. There is no signal about which boons a player would want.
## Session log (newest first)
- 2026-08-25 — BACKLOG f001: the Day→Dusk→Night→Dawn cycle state machine
  (SPEC-V2 §1), 3 cycles by default (`RunConfig.cycles`, existing single-pass
  suites pin `cycles: 1`). `World.cycle`/`totalCycles` gate `cycleWaveEnd`/
  `nightLengthSeconds`/`cycleEliteMul` (`src/sim/world.ts`) against
  `data/waves.json`'s `waveEndByCycle`/`nightSecondsByCycle`/`eliteMulByCycle`/
  `nightMinuteOffsetPerCycle`, so cycle 2/3's Night starts hotter and only the
  final cycle gates on boss kill — every other cycle's Night ends by timer into
  a new `dawn` phase. Dawn is a ledger: `rekindle` (a real sim Command, gold-
  gated at `rekindleCostMul` of base cost) un-petrifies one structure for the
  next Day but benches its soul for exactly one Dusk pick via a new
  `Structure.soulSuppressed` flag; `dawn_done` (or a 20s auto-advance with no
  input) resolves into the next Day. A new `World.soulLevels` record persists
  each soul's Night-earned level/damageBonus across being benched, so a
  Rekindled-then-later-re-picked soul resumes rather than restarts
  (`bindSouls`, `src/sim/progression.ts`). Fixed a latent bug the multi-cycle
  shape exposed: `w.sundered` is permanently true from the first Sundering on,
  so every UI/render read of it (`hud.ts`, `progress.ts`, `canvas.ts`) was
  swapped to the phase-scoped `w.huntsWarden` getter, or Day 2/3 and Dawn would
  have kept rendering the Night HUD. `tests/f001-cycle-machine.test.ts` (11
  tests) covers cycle boundaries, Dawn auto-advance, Rekindle cost/no-op-on-
  live-structure, the B9 soul-suppression/persistence scenario, a full 3-cycle
  scripted run, an 8-seed cycle-bound sweep, and an A11 replay-hash check with
  `rekindle`/`dawn_done` in the log. code-reviewer's one Major finding —
  `hashWorld` didn't hash the new `soulLevels` record, so a divergence there
  could pass A11 undetected — was fixed (hashed sorted by key, same as
  `boonRanks`) and re-verified green. qa-playtester independently drove 40
  seeds through 3 cycles headlessly and adversarially probed Rekindle/Dawn/Dusk
  (bad gold, bad targets, double-rekindle, auto-advance timers, same-tick
  death/timer races): all held, acceptance criteria confirmed met. It filed one
  real bug outside this item's scope: `report.survivalSeconds` reads
  `w.act2Time`, which the cycle machine now resets every Night, so a run that
  survives 2+ full Nights before a mid-cycle death reports only the current
  cycle's local Night time — underpaying the Ember completion-fraction reward
  by ~21% on its repro. Filed as BACKLOG b004.
- 2026-08-25 — BACKLOG b003: Stash tab defect fix (SPEC-V2 §10 D2, §3). Clicking a
  stash relic now equips it directly into its slot, swapping out whatever was
  equipped there (toggle: clicking the currently-equipped relic unequips it) —
  no more separate select-then-click-Equip flow. Right-click selects a relic for
  the detail panel in "compare" mode without touching the equip state. Added a
  small interactive Loadout strip to the Stash tab itself (the existing one on
  the Run tab stayed read-only) whose slot tiles unequip on click or on
  drag-and-drop onto the relic list. The detail panel gained a `.sw-compare`
  block (and each stash relic a compare-summary hover tooltip) diffing the
  selected relic's summed implicit+affix stats against whatever is equipped in
  the same slot. `tests/b003-stash-ux.test.ts` (15 tests) drives the real Hub
  DOM for every equip/unequip/compare path, including drag-drop bubbling through
  a child button and the empty-stash render branch. code-reviewer found no
  Critical/Major issues (two minor notes fixed inline: the implicit
  percent-vs-flat guess now prefers the affix pool's own `pct` flag, and stash
  relics targeting an empty slot get a "Click to equip" tooltip instead of
  none). qa-playtester adversarially probed rapid multi-slot cycling, crafting
  an equipped relic, a same-relic-two-slots bypass attempt, discard-while-
  selected, tab-switch state survival and garbage drag payloads — no bugs filed.
- 2026-08-25 — BACKLOG b002: Esc pause menu's Abandon Run now shows a confirm
  sub-screen ("Abandon run?" / Cancel / Abandon run) instead of quitting to the
  Hub on the first click (SPEC-V2 §10 D1: "Esc pause menu gains Abandon Run
  (confirm) everywhere"). Pause itself was already phase-agnostic (gated only
  on `outcome === 'running'` in `main.ts`'s `togglePause`), so the confirm
  applies uniformly across Act I and Act II; `tests/ui-input.test.ts` adds
  explicit pause/resume + confirm/cancel coverage for `act1_wave` and `act2`
  on top of the existing `levelup` case. `code-reviewer` found no
  Critical/Major issues; `qa-playtester` probed the confirm flow across all
  six phases (act1_build, act1_wave, dusk, soulpick, levelup, act2), rapid
  re-pause/toggle spam, and Escape-vs-button parity, and filed no bugs (one
  UX ambiguity around Escape-inside-confirm noted for QUESTIONS.md, not a bug).
- 2026-08-25 — BACKLOG b001: defeat flow (SPEC-V2 §10 D1). A defeat condition
  (Core hp 0 in Act I, Warden hp 0 while `huntsWarden` in Act II) now starts a
  1.5s slow-mo beat (`world.dying`/`dyingTimer`) before `outcome`/`phase` land
  on their terminal value, fixing the stuck-mid-frame bug where `outcome` could
  flip without `phase` following, leaving no Results modal and no way to pause
  out. During the beat the Warden is frozen, Act I wave-clear and Act II
  level-up are suppressed, and Core HP is floored at 0 against continued
  leaks. Results screen now offers Retry (same seed) / New run (fresh seed) /
  Hub instead of a single restart button. `tests/b10-death-flow.test.ts` (7
  tests) covers both defeat phases, the beat timing, the Warden freeze, the
  HP floor, and all three results buttons; qa-playtester adversarially checked
  the victory-vs-defeat race, pausing mid-beat, and the Act I Warden-reform
  path with throwaway tests and found nothing.
- 2026-08-25 — Playtest round 2: refund fixed at its real cause, Constellation
  rebuilt as a bounded disc, tower info panel, per-source projectiles, stage
  progress bars, fast-forward, practice runs, test-account seeding. Act I
  rebalanced so a light build clears again, and A10's run budget won back with
  two value-preserving sim optimisations. HANDOFF.md written for SPEC v0.2.
- 2026-08-25 — Playtest fixes: the hidden modal overlay was covering and blurring
  the game, Constellation refunds gave no feedback when unaffordable, the canvas
  was upscaled rather than backed at DPR. Added pause. QUESTIONS.md numbered
  Q1-Q28; verdicts still pending.
- 2026-08-25 — M8: feel and ship. SFX hooks, settings, results screen, and a 2x
  sim speedup to land the A10 budget. All acceptance gates green.
- 2026-08-25 — M7: balance pass. A1, A9 green; A4/A5/A8 re-verified after
  retuning; A7 partly green. Burrowers made properly untargetable underground.
- 2026-08-24 — M6: Warden-Eater phases, Awakenings and Rifts verified. Boss-kill
  gate green; boss damage tuned so maxbuild still wins ~75% (A8 holds).
- 2026-08-24 — M5: meta layer complete. Orb crafting, the Hub (class, tier
  draft, Constellation, stash), save/load. Gate A8 green.
- 2026-08-24 — M4: full content pass. Relic/Orb drops, tier drafting, damage
  telemetry. Gates A4 and A5 green after a substantial tower/weapon rebalance.
- 2026-08-24 — M2: Act II Nightfall complete, gate A3 green. Renderer, HUD and
  browser loop in place; production build works. Next: M3.
- 2026-08-24 — M1: Act I tower-defense core, gate A2 green.
- 2026-08-24 — Scaffolded the project, authored `/data`, built the M0 sim
  skeleton. A11 passing.
