# BACKLOG-TERRAIN.md — lane: terrain (branch `lane/terrain`)

Split out of BACKLOG.md on 2026-09-03; ids unchanged. Same item format,
working rules, verification tier (targeted tests + `npm run test:fast`) and
loop-mode contract as BACKLOG.md, plus CLAUDE.md's lane rule: up to TWO
items per iteration when both are small ([bug]/[polish] or data-only).
Everything touching shared sim core (balance orders, dash, density,
pathing, damage rules) belongs in BACKLOG.md, not here.

## Scope (hard boundary)

May create/edit ONLY:
- `src/sim/terrain/**` (new directory)
- `data/terrain.json` (new file)
- `tests/terrain*`
- the single integration-point file listed in the Log below (grid/pathing
  hook), kept to a minimal hook and reviewed at the lane merge
- this file

Read anything. Everything else is read-only: an out-of-scope need is
written into the Log below and becomes main-lane (or other-lane) work at
the merge — never edited from this lane.

## Queue

fb064 (the terrain epic) was split into sub-items on 2026-09-03 when it was
picked up, per its own "split into sub-items as needed" instruction. The
parent item is done only when every sub-item below is done. Sub-items that
need files outside this lane's Scope are marked *(out of scope)* and are
recorded in the Log for the main/UI lanes to pick up at the merge.

- [x] (fb064a) [feat] terrain data + deterministic generator core: new
      `data/terrain.json` (data-driven tile types normal/rough/rock/high,
      densities, generation and constraint bands) with a loader that refuses
      unpayable data, and `src/sim/terrain/**` producing a tile map from a run
      seed — organic blob scatter over protected gate-to-centre corridors,
      pocket repair, constraint measurement, legal-Core-position set, and a
      deterministic seed+1 regeneration for a degenerate seed. Acceptance:
      property tests over 1000 seeds hold every owner band (gates never
      enclosed; >=60% walkable; >=45% buildable-normal; gates reach >=80% of
      walkable; legal Core positions >=15% of normal tiles; no sub-2-tile
      forced corridor on gate mains); same seed => identical map + identical
      hash; a forced-degenerate config regenerates at seed+1 rather than
      returning an illegal map — refs: SPEC-FINAL new §10.5, G2.
- [x] (fb064g) [bug] `minCoreLegalFrac` has no ceiling: `1` is provably
      impossible (`blankKinds()` makes the 3 gate tiles Normal, and
      `legalCoreAnchors` excludes any tile within `coreGateClearance` of a
      gate, so `coreLegalFrac < 1` for every possible map), is accepted at
      load, and makes every seed ship the flat fallback silently — the same
      failure fb064a closed for the walkable/buildable bands and for
      `coreGateClearance`. Measured: `minCoreLegalFrac: 0.70` fell back on
      500/500 seeds. Not fixed inside fb064a because
      `tests/terrain-generation.test.ts`'s "unsatisfiable config" fixture
      *uses* `minCoreLegalFrac: 1` to reach the fallback path, so closing the
      hole means rebuilding that fixture. Acceptance: a failing regression
      test first; the loader refuses `minCoreLegalFrac` above a ceiling that
      holds for every map the generator can build; the fallback path keeps a
      test that reaches it by other means — refs: fb064a QA bug 3.
      **Acceptance amended 2026-09-03 during the item.** It read "above what
      `blankKinds()` itself achieves", which is provably wrong: the generator
      beats the flat map's share whenever `scatter` paints `rough` inside the
      gate-clearance ring, so that ceiling false-rejects payable data (measured
      counterexamples in the Log). Shipped as `a / (a + 1)`. Left unamended,
      the record would say the shipped code fails its own acceptance.
- [x] (fb064b) [feat] grid integration: the generated map plugs into
      `src/sim/grid.ts` (the lane's single integration-point file) so rough is
      walkable-not-buildable, rock blocks ground pathing, high ground is
      buildable and blocks ground walkers, and flow-field costs / the sealing
      rule / `allGatesReachable` / `gatePath` all still hold. Acceptance:
      grid tests green on a generated map for 100 seeds; existing
      `tests/grid.test.ts` and path-indicator tests unchanged and green; and
      `data/terrain.json` is folded into `contentHash()` so an edit to terrain
      tuning makes a stale replay fail loudly (architecture rule 2) — without
      that line this merges as a silent replay hole.
      **Shipped without the `contentHash()` clause, deliberately.** It requires
      `src/sim/content.ts`, which is outside this lane's Scope, so it is filed
      as a merge blocker in the Log rather than smuggled in. It opens no hole
      today: nothing outside `tests/` calls `generateTerrain` or
      `applyTerrain`, so no run's outcome depends on `data/terrain.json` yet,
      and the World wiring that would create the exposure is itself out of
      scope. It must land in the *same* main-lane change that does that wiring.
- [ ] (fb064c) [feat] Core placement: legal-tile set from fb064a exposed as a
      pre-wave-1 placement step with a pre-highlighted default suggestion, the
      2x2 Core moved off the hardcoded `CORE_X/CORE_Y`, and the placement
      issued as a sim Command (architecture rule 3). Acceptance: placement
      command validated against the legal set, illegal placements rejected,
      replay of a placed run reproduces the same map + Core.
- [ ] (fb064d) [feat] high-ground protection rules: ground melee cannot target
      or reach a tower on high ground, Burrowers cannot surface on it, while
      Spitters, fliers and boss specials still can. Acceptance: targeted tests
      per enemy family; no change to non-high-ground targeting.
- [ ] (fb064e) [feat] *(out of scope — UI lane)* organic terrain rendering
      (marching-squares edges, texture variation) over the square collision
      grid, plus path indicators drawn around terrain.
- [ ] (fb064f) [feat] *(out of scope — main lane)* Tuner terrain page
      (density/ratios editable) and the Training Grounds flat-arena override.

### Generated 2026-09-03 (lane generation rule)

Every item left above (fb064c–fb064f) needs files this lane may not touch:
fb064c moves the Core off `CORE_X/CORE_Y`, which `src/sim/cores.ts`,
`src/sim/enemies.ts`, `src/render/canvas.ts` and `src/ui/selection.ts` all
read; fb064d's rules live in `enemies.ts`; e and f were already marked. So
the lane had zero actionable items and the generation rule ran. The sweep
leg of that rule was skipped with a reason: no run yet calls
`generateTerrain` (fb064b shipped without World wiring), so terrain cannot
move a single §14 balance gate and a sweep would measure nothing about it.
Coverage was diffed against the owner feedback file instead
(`feedback/processed/20260903-121255-feature-terrain-generation.md`), which
is what §10.5 will be written from.

- [x] (fb064h) [feat] Core placement, the terrain-side half of fb064c:
      `src/sim/terrain/core-placement.ts` with `validateCorePlacement`
      (a typed reject reason per owner rule — off-grid / not-normal /
      near-gate / unreachable) and a deterministic `suggestCoreAnchor` for
      the pre-highlighted default, plus `Grid.placeCore(tx, ty)` in the
      lane's integration file so the 2x2 Core stops being pinned to
      `CORE_X/CORE_Y` inside the grid's own pathing. Acceptance: over 100
      seeds `validateCorePlacement` accepts a tile iff `legalCoreAnchors`
      lists it; placing any legal anchor leaves `allGatesReachable()` true
      and every gate's `gatePath` ending on a Core tile; `placeCore` refuses
      off-grid, border and gate targets and refuses to run once a structure
      stands; tiles the Core vacates revert to their real terrain, so a Core
      that was bridging rock leaves no phantom corridor; `suggestCoreAnchor`
      returns a legal anchor and the same one for the same seed — refs:
      owner feedback "Core placement", fb064c.
      **`Grid.placeCore` must not be called from a run until fb064c migrates
      the `CORE_X/CORE_Y` readers** — merge blocker in the Log below; the grid
      alone cannot make it safe, and a test asserts it has no caller yet.
- [x] (fb064i) [feat] high-ground rules, the terrain-side half of fb064d:
      pure predicates in `src/sim/terrain/` for the owner's four rules
      (ground melee cannot target or reach a tower on high ground;
      Burrowers cannot surface on it; Spitters, fliers and boss specials
      still can), keyed off `Grid.isHighGround` with the enemy-family table
      as data, so each `enemies.ts` call site at the merge is one predicate.
      Acceptance: table-driven tests per enemy family on a generated map;
      the exact out-of-scope call sites listed in the Log for the main lane
      — refs: owner feedback "high ground", fb064d.
      **Shipped with no `boss` family, deliberately.** The owner exempts "the
      bosses' *special attacks*", not bosses, and a family flag cannot tell a
      boss's special from its melee; the specials are exempt by call site
      instead (`boss.ts` is not guarded at the merge). See the Log.
- [ ] (fb064j) [test] generator seed-domain hardening: `generateTerrain` is
      pinned only over seeds 1..20000, which is not the domain a run seed
      draws from. Acceptance: determinism and full band legality over
      negative seeds, 0, `2**31 - 1` and seeds near the `(requested + n) | 0`
      wrap; the retry path exercised in the negative range; a golden hash
      per region — refs: fb064a Log ("band headroom is ZERO"), G2.
- [ ] (fb064k) [polish] `describeTerrain` diagnostic: a deterministic ASCII
      dump plus measured-band summary in `src/sim/terrain/`, so a terrain
      repro is one string rather than a seed and a screenshot. Acceptance:
      the dump round-trips to a byte-identical `kind` buffer, carries the
      gates, the legal-anchor count and every measured band, and a known
      seed's dump matches a golden — refs: HANDOFF §7 (depth).
- [ ] (fb064l) [test] "seeds produce varied legal maps" is currently pinned
      by ">= 95% distinct over 200 seeds", which a one-tile difference
      satisfies — the owner's Done-when clause is effectively unmeasured.
      Acceptance: over 500 seeds, mean pairwise tile-difference share and
      per-seed difference from the flat map both clear a floor recorded in
      the test, and the rock/rough/high counts spread across a band rather
      than sitting on the authored density — refs: owner feedback
      "Done when: seeds produce varied legal maps".

- [ ] (fb064m) [feat] a buildable high-ground plot no enemy can reach is a
      permanently invulnerable tower site — fb064a deferred this ("worth a
      decision line when fb064d writes the high-ground rules") and fb064i's
      rules make it live rather than theoretical. Measured by fb064i's QA over
      seeds 1..500: at the base `towers.json` `buildRange: 4` the exposure is
      **0/500 seeds**, but at buildRange 5 it is **27/500 seeds (55 plots)** and
      at 6-7 about 29/500 — and buildRange 5+ is the normal case, not an edge
      one, because `data/classes.json`'s Engineer passive adds +2 and
      `data/tree.json` node 22 `watchtowers` adds +1. On such a plot melee is
      denied by the new rule, the Spitter's `attackRange: 4` cannot reach
      (nearest enemy-standable tile is 4.12-5.00 away), the flier never attacks
      structures at all (`enemies.ts:1422`), and both boss paths need 2.5 / 1
      tiles. Acceptance: a generator constraint (or an explicit measured
      decision to accept it) such that every *buildable* high tile has an
      enemy-standable tile within the shortest authored enemy attack range, held
      over 500 seeds without moving fb064a's bands out of their measured
      headroom — or, if accepted, a recorded band showing what share of seeds
      carry such a plot and why that is intended — refs: fb064a Log
      ("`sealPockets` leaves unreachable `high` tiles as high ground"), fb064i
      QA bug 4, G2.

## Log

- (2026-09-03, lane split) Integration-point file for the merge:
  `src/sim/grid.ts` — the grid/pathing hook where generated tile types
  plug into the existing square collision grid and flow-field costs. Keep
  the edit there minimal and additive; if investigation shows the real
  hook belongs in a different single file, replace this entry with the
  actual file and the reason before editing it. Core-placement Commands,
  Tuner terrain page, and Training Grounds' flat-arena override are
  expected out-of-scope needs — log them as they surface.

- (2026-09-03, fb064a) Out-of-scope needs surfaced by fb064a, for the
  merge / other lanes:
  - **SPEC-FINAL.md §10.5** — the spec section this epic implements does
    not exist yet and `SPEC-FINAL.md` is outside this lane's Scope. The
    generator is built to the owner feedback file verbatim
    (`feedback/processed/20260903-121255-feature-terrain-generation.md`);
    §10.5 must be appended in the main lane at the merge, together with
    §14's G2 wording extended to cover generation determinism.
  - **QUESTIONS.md** — lane sessions leave it alone, so fb064a's design
    decisions are logged here instead (see the next entry) and should be
    folded into QUESTIONS.md at the merge.
  - **`src/sim/content.ts` / `RunConfig.contentHash`** — `data/terrain.json`
    is loaded and validated by `src/sim/terrain/config.ts`, so it is *not*
    yet part of the content hash that guards replays (architecture rule 2).
    Folding it in is a one-line `content.ts` change and belongs to fb064b
    at the earliest; until then, editing `data/terrain.json` will not make
    a stale replay fail loudly.
  - **`tools/fuzz-data.ts`, `tools/mutation-probe.ts`, the Tuner plugin's
    file list** — none of them know about `data/terrain.json` yet; adding it
    is main-lane work (fb064f covers the Tuner page).
  - **`tests/architecture.test.ts:65`** — the renderer-import guard is
    `from\s+'\.\.\/(render|ui|meta|bots)\//`, which only matches a
    single `../`. `src/sim/terrain/` is the first nested directory under
    `/src/sim`, and a file there would write `'../../render/...'`, which the
    guard misses. Not violated by fb064a, but the guard silently stopped
    covering the new directory; widen it to `(\.\.\/)+` in the main lane.
  - **`src/sim/rng.ts` `STREAM_NAMES`** — the generator derives its seed as
    `fnv1a('terrain', seed)`, a stream name not in the authored list.
    Harmless today (the derivation is bijective in `seed`), but architecture
    rule 2 says "named RNG streams"; add `'terrain'` in the main lane.

- (2026-09-03, fb064a) Design decisions taken inside the lane, for
  QUESTIONS.md at the merge:
  - **Fractions are measured over the whole 36x20 grid, not the interior.**
    The border is 15% of the grid and never walkable, so this is the
    stricter reading of the owner's bands; the shipped densities clear
    >= 60% walkable / >= 45% buildable-normal with margin under it.
  - **High ground is not walkable.** The owner's designer note says ground
    enemies cannot step onto high tiles, so `high` is `walkable: false,
    buildable: true` and counts against the walkable band. Fliers,
    Burrowers and ranged exceptions are fb064d's problem, not the tile
    flag's.
  - **Gate mains are structural, not lucky.** Every attempt first carves a
    protected 3-wide main from each gate to a centre plaza; scatter never
    touches a protected tile. That is what makes "gates never enclosed",
    "gates all connect" and "no sub-2-tile corridor" hold by construction
    rather than by rejection sampling — across seeds 1..1000 with the
    shipped `data/terrain.json`, no seed is degenerate at all.
  - **Unreachable walkable ground is sealed to rock** before measuring, so
    a map can never pass the walkable band on area no walker can enter.
  - **Connectivity is measured 4-connected.** Real walkers may step
    diagonally but only with both orthogonals open, so a 4-connected path
    is always a real path and the measurement can never be optimistic.
  - **The flat-interior fallback ships with `fallback: true`** after
    `maxAttempts` degenerate seeds instead of throwing, so a hostile
    `/data` edit downgrades the map mid-run rather than killing the run.
    It is the most permissive layout the arena admits, not an
    unconditionally legal one: the border is 105 permanently non-walkable
    tiles of 720, so a band above ~0.854 walkable is unsatisfiable by any
    map and the fallback ships flagged rather than legal.
  - **"All gates connect" is measured on its own, not inferred.** Sealing
    unreachable pockets cannot detect a gate walled into its own pocket
    (that pocket is reachable — from that gate), and `minCorridorWidth: 1`
    is a schema-legal value that switches the corridor band off, so
    `gatesConnected` is checked unconditionally in `terrainLegal` and
    `legalCoreAnchors` runs on the *intersection* of the per-gate floods
    rather than their union. `gateReachFrac` is likewise the worst single
    gate's share, not the union's — the union share is identically 1 after
    sealing and would have been a band that could never fail.
  - **Corridor width is measured on the 2x2 block lattice**, not on
    "thick" tiles: two 2x2 rooms joined corner-to-corner have 4-adjacent
    thick tiles while no 2x2 can slide between them, so a thick-tile test
    would pass a one-tile staircase joint.
  - **Band headroom on `walkableFrac` is ZERO, not "about 10 tiles".**
    (Corrected 2026-09-03 by fb064a's QA pass; the original entry read
    "worst observed over seeds 1..1000 is 0.6139 ... about 10 tiles" and
    "no seed is degenerate at all". Both were artefacts of measuring only
    seeds 1..1000, which is not the range real runs draw from — the exact
    mistake CLAUDE.md's measurement rules warn about.) Re-measured over
    seeds 1..20000: worst `walkableFrac` is **exactly 0.6000** at **seed
    7957** (432/720 tiles), passing only because the band is `>=`; worst
    `buildableNormalFrac` is 0.4708 at seed 19319 (2.1 pp). The shipped
    data *does* take the seed+1 retry path, at **seeds 1227, 3219, 4596,
    7010, 8102**. Any density or `blob` retune (fb064f's Tuner page edits
    these live) pushes seeds into that path immediately. The guard is now
    the "closest to the cliff" test, which pins seed 7957 and all five
    retry seeds directly — the 1000-seed sweep never reached them.
  - **`sealPockets` leaves unreachable `high` tiles as high ground.**
    Building is a click, not a walk, so a stranded high plot is still
    usable — but it is a permanently un-meleeable tower site. Worth a
    decision line when fb064d writes the high-ground rules.

- (2026-09-03, fb064a completion) Verification, review and QA. Item
  implemented in an earlier session but left uncommitted and unverified;
  this session verified it, fixed what review and QA found, and committed.
  `tests/terrain-generation.test.ts` is 36 tests, ~1.6 s (stays in the fast
  tier). code-reviewer returned REQUEST-CHANGES on two Major findings and
  qa-playtester then found the *fix* for the second one over-corrected —
  both are fixed:
  - **Major (review): unbounded data-driven loop in `/src/sim`.** `paint()`
    iterated the full `(2r+1)^2` square and discarded out-of-bounds tiles
    afterwards, with no schema cap on the radii; `plazaRadius: 5000` was
    accepted and cost ~230 ms per call, quadratically. `paint()` now clamps
    its bounds before looping, and the schema caps the four radii at the
    arena span (36) and `maxAttempts` at 64. The shipped suite got ~3x
    faster as a side effect.
  - **Major (review): loader accepted provably unsatisfiable bands.** The
    guards compared interior-relative densities against whole-grid bands and
    ignored the 105-tile rock border, so `minWalkableFrac: 0.9` loaded and
    then *every* seed silently shipped the flat fallback.
  - **Major (QA): the first fix over-corrected and refused payable data.**
    Density-derived ceilings treat a density as a floor when `scatter()`
    only ever treats it as a cap — protected corridors and the retry budget
    leave it short — so `minBuildableNormalFrac: 0.5553` was refused while
    seed 19 actually reaches 0.5569. The density-derived ceilings are gone;
    what remains are the two ceilings that are exact for *every possible
    map* (`minWalkableFrac` and, since normal ground is a subset of walkable
    ground, `minBuildableNormalFrac`, both against `MAX_WALKABLE_FRAC`
    ~= 0.854). A test now asserts the boundary two-sided — the previously
    refused configs must load *and* generate a real map.
  - **Major (QA): `coreGateClearance` >= 17 was accepted** and pinned
    `coreLegalFrac` at 0 for every possible map (the grid's largest
    nearest-gate Chebyshev distance is 17), so 100/100 seeds shipped the
    flat fallback. Now refused when `minCoreLegalFrac > 0`; clearance 16
    still loads.
  - Also fixed: `minCorridorWidth` restricted to the 1-or-2 that
    `corridorsOk` implements (3 was accepted and silently did nothing);
    `blob.minSize/maxSize` capped at the interior; `gateIndices()` takes the
    grid instead of hardcoding `GRID_W` (fb064f's flat Training Grounds
    arena would have flooded from the wrong tiles); `generateTerrain` throws
    on a non-integer seed instead of aliasing `NaN`/`Infinity`/`0.4` onto
    seed 0 and overwriting `requestedSeed`; the retry test's legality
    predicate regained its missing `gatesConnected` term; golden hashes
    recorded for seeds 1/2/42/1000 (nothing pinned generation against a code
    change, so an `Rng` or scatter-order edit would have forked every replay
    with all tests green); a density-honoured assertion added (mutation-
    tested: replacing `cfg.density.rough` with a constant goes red);
    a cost-bound test added for the `paint()` clamp (it was untested —
    reverting the fix kept all tests green).
  - `gateReachFrac` is documented as what it is: after `sealPockets`, if
    `gatesConnected` holds it is identically 1, so on generator output the
    band restates `gatesConnected` rather than filtering independently. It
    earns its keep on unsealed maps, which is what the negative case pins.

- (2026-09-03, fb064a completion) Out-of-scope needs, for the merge:
  - **`tests/b036-help-fold.test.ts` fails deterministically in isolation**
    — `.sw-help` bottom edge is 1095.4 against the 1080 fold, with a
    selected tower and the practice panel showing. Confirmed unrelated to
    this lane (nothing imports `src/sim/terrain` outside its own test and
    nothing globs `/data`). **UI-lane work — file against BACKLOG-UI.md.**
  - **Flaky-on-this-host fast-tier suites**, none attributable to fb064a:
    `q45`/`q49`/`q52` fail on Windows `EPERM` removing `bench/.tmp` scratch
    dirs and pass in isolation; `q15-command-domain-fuzz` reports 41
    commands as hanging under load against a 4000 ms settle deadline and
    passes in isolation; `q13-perf-ratio` is load-sensitive. The failing set
    varied 13 -> 10 -> 6 tests across three runs of the same tree. Main-lane
    work: either make the scratch cleanup retry-tolerant or move these to
    the excluded tier with a comment.
  - **`src/sim/terrain/config.ts` now imports `GATES`/`GRID_W`/`GRID_H`
    from `src/sim/grid.ts`** to derive `MAX_WALKABLE_FRAC` and
    `MAX_GATE_DISTANCE`. `grid.ts` has no imports of its own, so there is no
    cycle, but note it at the merge: terrain config validation is now
    coupled to the arena's dimensions, which is what makes the impossibility
    proofs exact.
  - **Naming collision worth avoiding in fb064b:** `content.ts` already
    exports `TerrainDef`/`TerrainSchema`, which are a *tower's* terrain
    effect (walls, gems), unrelated to map terrain. Whatever fb064b folds
    into `contentHash()` should not reuse those names.

- (2026-09-03, fb064a) **Committed late.** fb064a was marked `[x]` by an
  earlier session but its files were never committed — `data/terrain.json`,
  `src/sim/terrain/` and `tests/terrain-generation.test.ts` were still
  untracked at the start of this session. Re-verified (37 tests green, tsc
  clean) and landed as `7e63634` before fb064g started. Worth a habit: this
  lane's loop contract ends at "commit", and a `[x]` with no commit is
  indistinguishable from lost work.

- (2026-09-03, fb064g) `minCoreLegalFrac` ceiling. `src/sim/terrain/config.ts`
  gains `flatCoreAnchorCount(clearance)` and `maxCoreLegalFrac(clearance)`; the
  loader refuses a band above the latter. It replaces fb064a's standalone
  `coreGateClearance >= 17` check, which it subsumes (no anchors at all from 17
  up, so any positive band is refused, and the issue is still reported against
  `coreGateClearance` so fb064f's path-based Tuner highlighting stays useful).
  Design decisions, for QUESTIONS.md at the merge:
  - **The item's acceptance criterion is wrong, and was implemented and then
    withdrawn.** It asks the loader to refuse "above what `blankKinds()` itself
    achieves" — 0.8098 at the shipped clearance 3 — on the theory that the
    generator cannot beat the layout it falls back to. It can. `scatter` paints
    `rough`, which leaves `normalCount` without costing an anchor, so the share
    goes *up*; `sealPockets` does the same with unreachable ground. Measured
    counterexamples, both fully legal, non-fallback maps that the flat-map
    ceiling refused:
    - `coreGateClearance: 12`, **shipped densities**, seed 262 -> 0.105263
      against the flat map's 0.087805, so a band of 0.10 was refused and then
      met. Every clearance >= 10 has one, with no `/data` edit at all.
    - `coreGateClearance: 3`, `density: { rough: 0, rock: 0, high: 0.002 }`,
      seed 55 -> 0.811075 against the flat map's 0.809756; 738 of seeds 1..3000
      clear it.
    Found by this item's code-reviewer pass, then re-measured here before being
    accepted (the second counterexample does *not* reproduce with `rough: 0`
    alone, which is how it was first written down — all three densities matter).
  - **The shipped ceiling is `a / (a + 1)`**, where `a` is the flat map's anchor
    count at that clearance — 0.997996 at clearance 3, 0 from 17 up. It is a
    proof rather than an observation: anchor `(x, y) -> ` tile `(x, y)` injects
    the legal anchors into normal tiles, and the rightmost anchor of any
    occupied row has a normal tile to its right that is no anchor's image, so
    `normalCount >= anchors + 1`. Weak on purpose. It refuses `1` at every
    clearance and refuses everything positive where no anchor can exist, and
    nothing else — which is all that can be said without refusing data the
    generator satisfies.
  - **`0.70` and `0.90` still load, deliberately.** The item was filed off
    "0.70 fell back on 500/500 seeds", but the generator's own reach is
    ~0.61 on the shipped data (max 0.6098 at seed 708, min 0.4343 at seed 4595,
    over seeds 1..5000), so those are bands no *seed* happens to clear rather
    than bands no *map* can. The flagged fallback is the designed answer to a
    strict band. Refusing them would be a sample of this generator's luck
    dressed as an impossibility proof — the same false rejection fb064a's QA
    pass caught on the density-derived ceilings, where `minBuildableNormalFrac:
    0.5553` was refused while seed 19 reaches 0.5569.
  - **`flatCoreAnchorCount` re-derives the anchor count geometrically** rather
    than calling `legalCoreAnchors`, because `analyze.ts` imports `config.ts`
    and measuring would be an import cycle. The test pins the two equal across
    clearances 0/1/3/8/12/16/17/36, and pins the precondition the replica rests
    on: no two gates adjacent along a border, since a gate tile is normal and a
    2x2 touching one is excluded only because its *other* border tiles are rock.
  - **Both fixtures that used `minCoreLegalFrac: 1` were rebuilt** — the reason
    fb064a could not close this hole — but only barely, because the sound
    ceiling leaves 0.9 loadable and 0.9 is unreachable by any map the generator
    builds at clearance 3. So both keep their original semantics: the cost-bound
    fixture still forces every attempt to run, and the fallback test still pins
    that the flat map ships *even when it does not satisfy the bands*. That
    second assertion had been inverted at one point during this item, which
    would have quietly dropped the coverage the original had.
  - **The `paint()` cost bound was left at fb064a's 5000 ms, after three
    failed attempts to sharpen it.** Recorded because each one looked right
    before it was measured:
    - *3000 ms.* Looked like 2.6x headroom against a 1.1 s standalone reading;
      failed at 3167 ms inside a loaded `test:fast`.
    - *Sample 3x and take the minimum.* Fixes spikes but not sustained load —
      the same fixture measured 200 ms idle and 410 ms with `test:fast`
      alongside.
    - *A wide-radius / narrow-radius ratio*, to cancel ambient load by measuring
      both halves back to back. Three runs each: healthy 23.8/26.0/25.6 against
      reverted 23.5/55.7/94.9 — **overlapping**, so it can miss the regression
      outright. Rejected, and the near-miss is the reason this is written down.
    This host's timing variance (~2x, sometimes far worse) is close to the
    signal the guard looks for, so the guard is coarse by nature: 5000 ms passes
    reliably (worst healthy reading 3167 ms) and catches the reverted clamp
    (5.9-7.0 s). Mutation-tested again after the restore.
  - **A note on measuring the fixture itself:** removing `blob.minSize/maxSize`
    from the hostile config as "vestigial" (they are, in the sense that
    `scatter()` places nothing when the interior is fully protected) halved the
    measured cost and let the *reverted* clamp pass at 871 ms under a 1000 ms
    budget. Whatever the mechanism, a guard's fixture cannot be tidied on
    inspection — only with the mutation re-run.

- (2026-09-03, fb064g) Review and QA. code-reviewer returned REQUEST-CHANGES on
  two Majors, qa-playtester then verified the result and filed eight items; both
  passes are folded in above and here.
  - **Major (review), confirmed: the flat-map ceiling false-rejected payable
    data.** The finding, its counterexamples and the replacement bound are in
    the design entry above. Both reviewers found it independently; both of their
    seed-55 write-ups omitted that `rock` and `high` must also be retuned, and
    it does not reproduce with `rough: 0` alone — re-measured here before it was
    accepted.
  - **Major (review + QA), confirmed: the timing budget.** Handled above.
  - **QA blockers 1 and 2 were against shapes already withdrawn** — the
    wide/narrow ratio and the min-of-3/1000 ms budget. QA's independent numbers
    are the strongest evidence against both, and agree with the decision to
    restore fb064a's 5000 ms: the ratio form failed 3 of 5 runs on *healthy*
    code (30.7-92.7 against a bound of 30), the 1000 ms form went green 4/4
    with the clamp reverted, and every one of QA's 18 contention runs of the
    3000 ms form would have passed at 5000 ms while the reverted clamp cost
    13.4 s.
  - **QA's extra counterexample does not reproduce.** Filed as clearance 5,
    `density.rough 0.03`, `gateClearRadius 2`, seed 133 -> 0.680067 against a
    flat share of 0.660163. Re-run here it ships the *fallback*, whose
    `coreLegalFrac` is identically the flat share (0.6601626), excess exactly
    0. Not added to the suite; the two verified counterexamples stand.
  - **Minor (QA), fixed: the rejection message quoted a number it then
    refused.** `toFixed(6)` rounds to nearest, so clearance 3 printed
    "0.997996" against a true ceiling of 0.997995991983968 — a designer pasting
    it back got the identical error. Now floored, and the test parses the number
    out of the thrown message and asserts it loads.
  - **Informational (QA), accepted as-is: `a / (a + 1)` is loose.** It is 0.998
    at clearance 3 while no map appears to exceed ~0.912, so bands in roughly
    (0.92, 0.998) still load and still ship the fallback for a whole run. That
    is the original symptom moved up the number line, and it is the deliberate
    trade — soundness over tightness, per this file's own fb064a lesson. QA did
    not file it as a defect and neither do I. A tighter provable bound exists
    (`|A| / |cover(A)|`, which at clearance 16 gives 0.25 against our 0.5) and
    is worth revisiting at the merge, but every attempt to tighten this ceiling
    so far has cost a false rejection, so it should not be done without the
    generated-map sweep that caught the last one.
  - **QA raced the working tree** (its Bug 7): it copied `HEAD`'s `config.ts`
    over the working file for ~40 s inside the editing window to check the
    "failing test first" clause. Verified intact afterwards — `flatCoreAnchorCount`,
    the corrected counterexample citations and the 5000 ms bound are all
    present, `tsc` clean, 39 tests green. Worth remembering when handing a QA
    agent a live tree.
  - Verified unchanged by this item: golden hashes `1:03031f09 2:30ddb8d4
    42:b2e86488 1000:473db113`, and QA's own diff of seeds 0..1500 plus the
    32-bit extremes found 0 differences in `hash`/`seed`/`attempts`/`fallback`
    against HEAD. fb064g is validation-only, as intended.

- (2026-09-03, fb064g) Out-of-scope needs, for the merge:
  - **Nothing consumes `TerrainMap.fallback`.** This is what makes a strict
    band read in-game as a flat arena for a whole run with no signal — the
    symptom fb064g was filed against, and the part a loader ceiling
    structurally cannot fix (a band like 0.70 is legitimately loadable). The
    consumer belongs wherever fb064b/fb064c wire the map into the run: at
    minimum a dev-visible warning, and `fallback` folded into whatever
    provenance the replay guard carries. File it as a main-lane item at the
    merge if fb064b does not pick it up.
  - **The `paint()` cost guard wants a deterministic counter, not a clock.**
    `tests/terrain-generation.test.ts`'s "stays bounded" test is the only thing
    standing between `/data` and an unclamped loop in `/src/sim`, and on this
    host it can only be a coarse wall-clock guard (see the entry above for the
    three sharper designs that measured worse). Counting `paint()` iterations
    behind a test-only hook would make it exact and load-independent, but the
    counter lives inside `/src/sim` and the shape of that hook is an
    architecture question for the main lane, not a terrain one.

- (2026-09-03, fb064b) Grid integration. `src/sim/grid.ts` gains
  `TerrainOverlay`, `applyTerrain`, `staticBlocked`, `isHighGround` and a
  terrain term in `buildable`/`wardenPassable`/the `breach` Dijkstra mode;
  `src/sim/terrain/overlay.ts` (new) is the only place a `TerrainKind` becomes
  walkable/buildable/high. `tests/terrain-grid.test.ts` is 24 tests, ~5.5 s
  (stays in the fast tier). Design decisions, for QUESTIONS.md at the merge:
  - **The Grid takes a mask bundle, not a `TerrainMap`.** `grid.ts` still
    imports nothing, so the `terrain -> grid` dependency that makes
    `config.ts`'s impossibility proofs exact stays one-way. It also leaves the
    terrain module the single place that knows what a kind *means*, which is
    what `data/terrain.json` is for (architecture rule 4).
  - **Gate and Core tiles outrank the scatter, and that is decided on every
    rebuild off the live `tile` array** — not patched once into `terrainBlock`
    at apply time off the `GATES`/`CORE_X` constants. The constants are not the
    run's truth: `world.ts`'s Fourth Gate modifier writes a south gate at
    (12,19) into `grid.tile` at run construction, and fb064c moves the Core.
    A constants-keyed override misses both, silently, on a map that still
    measures perfectly legal. Found by code-reviewer.
  - **The breach guard asks `staticBlocked`, not `terrainBlock`.** Written the
    direct way first, and it disagreed with `passable()` within one test: a
    gate opened after `applyTerrain` was walkable and simultaneously unroutable.
    Going through the one predicate makes them agree by construction, and keeps
    a tower on high ground unreachable (its `occ` would otherwise buy it a
    breach route into terrain no walker can enter).
  - **The Warden stops at terrain.** fb002 legalised walking through the *Core
    and friendly structures* — a rule about what the player built, not about
    the map. Left terrain-blind, the Warden dashes through mountains, and one
    parked on high ground is unreachable by every ground melee enemy at once:
    an Act I safe spot no gate band measures. code-reviewer found this
    undecided and untested; it is now both.
  - **The ghost field stays terrain-blind, on purpose.** Burrowers and
    mid-phase Wraiths tunnel *under* stone — that is the mechanic. Where they
    may surface is fb064d's rule, not this mask's. Pinned by a test so the
    asymmetry with `wardenPassable` reads as a decision rather than an
    oversight.
  - **`applyTerrain` refuses to run over live occupancy.** Terrain under a
    standing tower makes it unbreachable scenery: the breach guard refuses the
    tile before it ever reaches the `occ` check, so nothing can path to it and
    nothing can destroy it. Terrain goes down before build.
  - **The hardcoded Core can be stranded, and the grid says so.** No generated
    map knows where the Core is; `allGatesReachable()` reports it honestly
    rather than the map being patched. Measured over seeds 1..5000: **97, 2055,
    2845, 3098** (~1 run in 1250); QA measured 11 of 21000 (0.05%). On those
    seeds every gate has `distAt == -1` — terrain is not chewable, so there is
    no breach route either, and a run would never clear a wave. **A reachable
    Core is a hard precondition of fb064c's wiring**, not a nice-to-have.
  - **The stranded count is asserted as a bound, not a golden.** The first
    draft said `toBe(1)` off a 1000-seed window; seeds 1..5000 make it 4. That
    is the lane's own recorded mistake for the third time (`walkableFrac`
    headroom, the `paint()` timing bound) — a count over an arbitrary seed
    window moves on any density or `blob` retune, which fb064f puts under live
    Tuner editing, with no bug behind it. The seed-97 pin is the part that
    earns its keep.

- (2026-09-03, fb064b) Review and QA. code-reviewer returned REQUEST-CHANGES on
  three Majors, qa-playtester returned PASS on all four acceptance criteria and
  filed seven items. Every one is fixed or recorded; the two agreed
  independently on the same two coverage holes.
  - **Major (review), confirmed and fixed: the structural override was keyed on
    constants the run mutates.** Verified here before acting: `world.ts:441-448`
    does open a south gate at (12,19). Re-measured the consequence over 500
    seeds — with the override in place but the *generator* still blind to the
    fourth gate, **138 of 500 seeds bury the tile immediately inside the south
    gate, and in all 138 that gate cannot reach the Core at all.** Filed below
    as a merge blocker; the grid-side half is fixed here.
  - **Major (review), confirmed and fixed: `wardenPassable` was terrain-blind
    with no decision, test or log entry.** Decided above.
  - **Major (review) + Bugs 1-2 (QA), confirmed and fixed: the two
    `blocked`-rebuild sites that can punch a hole were the two with no test.**
    Both reverted cleanly with all 18 tests green. They are not benign: selling
    a high-ground tower (`world.ts` `setOcc(.., 0)`) opened a walkable hole into
    the mountain, and `src/bots/policies.ts`'s
    `buildable(..) && !wouldBlockPath([[..]])` probe means a *query* did the
    same. Both now pinned.
  - **Bug 3 (QA), fixed: `isHighGround` accepted fractional coordinates** and
    answered about a tile 18 columns away — b007's exact class, in the file
    whose `buildable()` documents that fix 40 lines above. fb064d calls this
    from targeting code, where coordinates are floats.
  - **Bug 4 (QA), fixed: the "copies the masks" test asserted nothing.** Its
    second `refresh()` was a no-op (`dirty` was already false), so it held for
    any implementation — QA killed it with an aliasing mutant that wrote the
    structural override back into the *caller's* overlay. Now mutates `o.kind`
    too and forces the rebuild.
  - **Bugs 5-6 (QA), fixed: shape was validated, content was not.** A
    self-contradictory overlay (walkable high ground) and an out-of-range
    `kind` were both accepted; the latter silently produced a fully sealed
    arena of exactly the right shape, because `cfg.tiles[250]?.walkable` is
    `undefined` and `undefined` reads as "not walkable". Refused now, at the
    seam, which is the loader-refuses-unpayable-data rule one layer in.
  - **Bug 7 (QA), fixed:** the stranded-count golden, above.
  - Re-mutation-tested after the fixes: **11 mutants, 11 killed** (breach
    guard, `staticBlocked`'s terrain term, its gate/Core term, `buildable`'s
    terrain term, `setOcc`, the `wouldBlockPath` restore, `wardenPassable`, the
    aliased-kind buffer, `isHighGround`'s integer guard, the occupancy guard,
    the walkable-cliff guard). The first pass had only four; five of the seven
    new ones exist because a reviewer found the gap.
  - Verified behaviour-neutral for a Grid that never calls `applyTerrain`: QA
    ran HEAD's `Grid` and this one side by side over 300 seeds x 60 randomised
    ops, diffing `tile`/`occ`/`blocked`/`breach` and both fields after every op
    — bit-identical, 0 divergences. `npm run sim -- --seed 1 --policy hybrid`
    gives `endHash 2729a000` before and after. `tests/grid.test.ts` and
    `tests/fb036-path-indicators.test.ts` are untouched and green.
  - `npm run test:fast`: the documented pre-existing set only (b032/b034/b035
    and q15 load-sensitive — all pass in isolation; b036 fails deterministically
    at the same 1095.4 already recorded as UI-lane work; q45/q49/q52 are the
    Windows EPERM scratch-dir cleanups).

- (2026-09-03, fb064b) Out-of-scope needs, for the merge:
  - **`data/terrain.json` is still outside `contentHash()`** (`src/sim/content.ts`,
    out of Scope). **Merge blocker: it must land in the same change that wires
    terrain into `World`.** Until something reads a generated map in a real run
    there is no hole — verified by grep that `generateTerrain`/`applyTerrain`
    have no callers in `src/` or `tools/` — but the moment the World calls it,
    an edit to terrain tuning stops making a stale replay fail loudly.
    fb064a's naming warning still applies: `content.ts` already exports
    `TerrainDef`/`TerrainSchema` for a *tower's* terrain effect.
  - **The generator does not know the run's gate list.** `GATES` is hardcoded in
    `analyze.ts`, `generate.ts` and `config.ts`, so the Fourth Gate modifier's
    south gate gets no protected main, no clearance and no place in any band.
    Measured above: 138/500 seeds bury the tile inside it and leave it unable to
    reach the Core. The grid no longer buries the gate *tile*, which is all this
    lane can do from `grid.ts`; threading the run's gate list into generation
    touches `world.ts` and is main-lane work. **Terrain + Fourth Gate must not
    ship together until this is done.**
  - **`src/sim/towers.ts:104` reports `'occupied'` for terrain.** `checkBuild`
    maps every `!grid.buildable()` to `'occupied'`, which the renderer shows on
    the build ghost — so the player is told a rough or rock tile is occupied
    when it is empty ground. Needs a `'terrain'` `BuildRejection`; main lane
    (or UI lane for the string).
  - **Nothing binds an overlay to the config that generated its map.**
    `terrainOverlay(map, cfg)` takes the config as a free parameter, so a
    mismatched `cfg` repaints the flags while `TerrainMap.hash` still describes
    the old one. Not closed here: the honest guard is the `contentHash` fold
    above, not a second hash inside the terrain module.
  - **`Grid.terrainKind` is public for fb064e** (the renderer needs kinds, not
    masks). Note the near-collision at the merge: `Grid.applyTerrain` vs
    `applyTerrainPassives` in `src/sim/weapons.ts`, the same class of name clash
    fb064a flagged for `TerrainDef`.
  - Carried forward, unchanged: **nothing consumes `TerrainMap.fallback`**
    (fb064g). fb064b does not wire the map into a run, so it still cannot be
    closed here — it belongs with fb064c's placement step or the World wiring.

- (2026-09-03, fb064h) Core placement, terrain side. New
  `src/sim/terrain/core-placement.ts` (`validateCorePlacement`,
  `suggestCoreAnchor`); `src/sim/grid.ts` gains the pre-override `terrainRaw*`
  buffers, `syncTerrain()`, `coreOrigin()`, `coreCenterOf()` and `placeCore()`;
  `legalCoreAnchors` in `analyze.ts` now sizes its footprint off `CORE_W/CORE_H`
  instead of a literal 2. `tests/terrain-core-placement.test.ts` is 30 tests,
  ~1.7 s (fast tier). Design decisions, for QUESTIONS.md at the merge:
  - **The validator agrees with the enumeration by construction, not by
    coincidence.** `legalCoreAnchors` is what `coreLegalFrac` is measured
    against, so a validator derived from its own reading of the rules would
    eventually refuse a click on a tile the band already counted. The 100-seed
    tile-for-tile sweep is the pin; QA widened it to 1212 seeds x 720 tiles
    (~872k checks, 0 mismatches) plus hostile hand-built maps and odd grid
    dimensions.
  - **The suggestion is "closest to the tuned spot", deliberately dull.** Core
    distance from each gate is what every wave's travel time is tuned against,
    so choosing anything cleverer (maximise gate distance, centre of mass) is a
    balance order, and balance orders are not this lane's. Reproducing
    `CORE_X/CORE_Y` as nearly as the terrain allows is the choice that changes
    nothing.
  - **The build-room tie-break is load-bearing and now has goldens.** Over
    seeds 1..500 the nearest-anchor set is tied on 25 seeds and the room key
    moves the pick on 17 — i.e. on ~3% of runs it chooses the Core's tile.
    Seven separate mutations of it survived the first suite. Pinned by a golden
    table chosen to be two-sided: on seeds 24/40/127 the room key overrides the
    lowest-index tie, on 58/173 the strict comparisons are what keep the lowest
    index. This is fb064a's lesson applied — an output nothing pins forks
    silently on any code change.
  - **`ROOM_RADIUS` stays in code, against architecture rule 4**, and the
    exemption is deliberate: it is a tie-break weight, not a tuning band — it
    cannot make a map legal or illegal, since every value picks some member of
    a set `legalCoreAnchors` already validated — while putting it in
    `data/terrain.json` hands fb064f's live Tuner a knob that silently
    relocates the Core, and terrain data is still outside `contentHash()`, so
    a replay would not notice. Revisit at the merge, after that fold lands.
  - **`placeCore` validates only what a Grid can know**; terrain legality is
    `validateCorePlacement`'s answer, against the `TerrainMap`, where it does
    not depend on the Core's own footprint having been punched through the map
    already. The Command calls the terrain one first and the grid one second.
  - **Both sides of the phantom-corridor rule are enforced.** Vacated tiles get
    their real terrain back (re-derived through `syncTerrain`, so the override
    and its undo are one loop read forwards), and `placeCore` now also refuses
    to *arrive* on rock, rough or high ground — otherwise the override punched
    2x2 of walkable ground into a mountain. The arrive-side guard reads the raw
    masks, which for `terrainOverlay` output are exactly "kind is Normal", so it
    cannot refuse a legal anchor; before `applyTerrain` they are zero and it is
    a no-op, which is what keeps a terrain-free Grid unchanged.
  - **`applyTerrain` after `placeCore` keeps the placement**, and the footprint
    it lands on reads Normal — fb064b's "the Core is never buried" override,
    unchanged and now applied wherever the Core actually is. The intended order
    is still terrain first: only then does the arrive-side guard bind.
  - **Refusal messages distinguish border from gate.** They were one string,
    which made the gate rule untestable: every real gate is on the border, so a
    2x2 over one also covers a Border tile and a build accepting gate tiles
    outright still threw the same message. `world.ts`'s Fourth Gate makes the
    interior-gate case real, not hypothetical.
  - **Neither function trusts its optional argument.** A wrong-length `reach`
    mask throws (short masks read `undefined` at every index — falsy — so an
    unguarded validator answers `unreachable` for the whole board while looking
    healthy), and a caller-supplied `anchors` list is re-checked against the
    cheap half of the validator (`[0]`, `[-5]`, `[999999]`, `[NaN]` used to come
    straight back out into a placement Command).
  - **`reach` is computed lazily, after the cheap rules.** As a default
    parameter it ran three gate floods to answer `off-grid` for a click outside
    the board, which is the call fb064c's pre-highlight makes most often.
    Measured by QA: a board-wide sweep is 0.52 ms with a hoisted mask and
    53.7 ms without.

- (2026-09-03, fb064h) Review and QA. code-reviewer returned REQUEST-CHANGES on
  three Majors; qa-playtester returned **PASS on all five acceptance clauses**
  and filed nine items. All are fixed or recorded, and both agents independently
  found the same two holes (the tie-break, and the un-migrated `CORE_X/CORE_Y`
  readers).
  - **Major (review) + Bug 2 (QA), confirmed and fixed: the tie-break was 100%
    unpinned.** Re-measured here before acting (25 ties / 17 moved over 500
    seeds) rather than taken on the reports' word. Seven mutants now die.
  - **Major (review) + Bug 1 (QA), confirmed and fixed as far as the lane
    allows: the migration record did not exist.** The safety argument for
    shipping a half-migrated Core cited "fb064c2", an item that does not exist,
    and named four files when there are nine. Now a merge blocker below, a
    corrected comment, an additive `Grid.coreCenterOf()` so fb064c's migration
    is a mechanical call-site swap, and two tests: one pinning the divergence
    itself, one walking `src/` and `tools/` to assert `placeCore` still has no
    caller. That last one is the guard — it goes red the day a call site appears
    without the migration.
  - **Major (review), confirmed and fixed: no test moved the Core twice**, and
    none covered `applyTerrain` after `placeCore`. Both mutants (vacating the
    constant footprint; resetting the origin on adopt) were green against the
    first suite. The first leaves the earlier target as a permanent 2x2 Core
    island — the exact failure this item exists to prevent, one call late.
  - **Minor (review) m4-m6, m9-m10 and Bugs 3-6, 8 (QA): all fixed** —
    precedence order pinned, default `reach` pinned to the intersection mask,
    `legalCoreAnchors` sized off the constants, mask-length guard, anchor-list
    guard, lazy `reach`, distinguishable messages, and accept-side bounds pins
    on both axes for both functions (the far corner is inside the east gate's
    clearance ring, so each axis is pinned on a row and a column clear of every
    gate — the obvious fixture answers `near-gate` and pins nothing).
  - **Bug 9 (QA), fixed in `tests/terrain-grid.test.ts`: `syncTerrain`'s Gate
    branch is dead on generator output** (`blankKinds()` makes gate tiles
    Normal), so narrowing it to Core-only passed everything. It is not dead on a
    *run* — the Fourth Gate is written after generation onto a tile the
    generator never protected, and fb064b measured 138/500 seeds burying it.
    Pre-existing since fb064b; the pin is new.
  - **Bug 7 (QA), recorded not fixed: "before build" is "no structure currently
    standing".** Selling every tower re-opens `placeCore`. `applyTerrain` has
    the identical hole, so it is consistent rather than new, and a sticky
    `built` flag is a run-lifecycle decision that belongs with fb064c's wiring,
    not with a Grid that has no notion of phase. Filed below.
  - **Re-mutation-tested after the fixes: 19 mutants, 19 killed.** The first
    pass of the fixes left one survivor — `placeCore`'s bounds `>` -> `>=`,
    which every existing assertion tolerated because both mistakes throw — so
    the far-edge case now asserts on the *message* (`map border`, not `leaves
    the grid`). Mutants killed: the seven tie-break ones, the two placement
    ordering ones, both bounds pairs, the gate and mountain guards, the
    `syncTerrain` override, the precedence swap, the default-`reach` and
    mask-length guards, and the anchor-list guard.
  - Verified behaviour-neutral: `npm run sim -- --seed 1 --policy hybrid` gives
    `endHash 2729a000`, matching fb064b's recorded baseline; the generator's
    golden hashes (`1:03031f09 2:30ddb8d4 42:b2e86488 1000:473db113`) are
    unchanged by the `analyze.ts` edit; `tests/grid.test.ts`,
    `tests/fb036-path-indicators.test.ts` and `tests/architecture.test.ts` are
    untouched and green. QA additionally diffed HEAD's `Grid` against this one
    over 30 trials x 120 randomised ops on full state — identical.
  - `npm run test:fast`: 2152 passed / 7 failed, the documented pre-existing set
    only (`b032`/`b034`/`b035` and `q15`/`q28` load-sensitive — `q28` and `b034`
    re-run green in isolation here; `b036` is the deterministic 1095.4-vs-1080
    UI-lane failure; `q45`/`q49`/`q52` are the Windows EPERM scratch-dir
    cleanups). Nothing touching `grid.ts`, `src/sim/terrain/**` or pathing
    failed.

- (2026-09-03, fb064h) Out-of-scope needs, for the merge:
  - **MERGE BLOCKER: `Grid.placeCore` is not safe to call from a run until the
    `CORE_X/CORE_Y` readers migrate.** The flow field would target the new Core
    while every damage, aura and attack-range site clamped to the old 2x2:
    walkers path to the Core and hit empty ground. The full list, none of it
    this lane's to touch — `coreCenter()` itself (`src/sim/grid.ts`, kept as the
    *default* centre with `coreCenterOf()` beside it) and its callers
    `src/sim/world.ts:514,580`, `src/sim/run.ts:665`,
    `src/sim/sundering.ts:18,110`, `src/sim/cores.ts:412,599,626,658`,
    `src/bots/policies.ts:225,317,484,508`; the Core-hitbox clamps in
    `src/sim/cores.ts:198,405` and `src/sim/enemies.ts:606`; and
    `src/ui/selection.ts:69` plus the renderer's eight `CORE_X/CORE_Y` reads in
    `src/render/canvas.ts`. This is fb064c's first task, before the Command.
  - **`placeCore` re-opens after a build-then-sell** (QA Bug 7, above). The
    honest fix is a run-lifecycle flag set when the build phase opens, which
    `applyTerrain` should share; both belong with fb064c's wiring.
  - **Nothing consumes `TerrainMap.fallback`** — carried forward unchanged from
    fb064g and fb064b. fb064h still does not wire a map into a run.
  - **`data/terrain.json` is still outside `contentHash()`** — carried forward
    from fb064b, still a merge blocker for whatever wires terrain into `World`.
  - **`ROOM_RADIUS` and architecture rule 4** — the exemption above should be
    re-decided once terrain data is inside `contentHash()`.

- (2026-09-03, fb064i) High-ground rules, terrain side. New
  `src/sim/terrain/high-ground.ts` (`highGroundFamily`, `familyForDef`,
  `canAttackHighGround`, `canSurfaceOnHighGround`, `canAttackStructureAt`,
  `canSurfaceAt`); `data/terrain.json` gains `highGround.families`;
  `src/sim/terrain/config.ts` gains the schema and `checkHighGround`.
  `tests/terrain-high-ground.test.ts` is 50 tests, ~0.6 s (fast tier).
  20 mutants, 20 killed.

  **THE MERGE LIST — every site that must call a predicate, and every site that
  deliberately must not.** This is fb064i's second acceptance clause; the rules
  are inert until the main lane wires them, and a rule wired at four of five
  sites is worse than one wired nowhere, because the fifth then reads as a bug
  in the mask rather than as a missing call.
  - **`src/sim/enemies.ts:1459`** (melee breach) —
    `if (s && breaching && canAttackStructureAt(w.grid, fam, s.tx, s.ty))`. The
    existing `else e.attackingStructure = 0;` already handles the denied case,
    so no stale attack id. This is *the* rule; everything below is a leak path.
  - **`src/sim/enemies.ts:1185`** (Colossus `stomp` AoE) — a **ground** family
    (`stomp`+`elite`, no `boss`) calling `damageStructure` in a radius from the
    low tile beside the cliff. Missing from this item's original four-site
    brief and found by code-reviewer: wire only the breach and the surfacing,
    and the whole rule leaks through the Colossus.
  - **`src/sim/enemies.ts:1086`** (Burrower surfacing, `updatePhasing`) —
    `&& canSurfaceAt(w.grid, fam, e.x, e.y)`. Verified it cannot stall: the
    test re-runs every tick while the burrower keeps ghosting toward the
    objective, and both terminal paths (`leakIntoCore` at `enemies.ts:1073`,
    `contactWarden`) ignore `submerged`. It *does* extend the window in which
    the burrower is untargetable (`world.ts:760` skips submerged enemies) — a
    balance side effect of the owner's rule, worth a sweep at the merge.
  - **`src/sim/enemies.ts:1223`** (Spitter ranged) — the `ranged` family is
    exempt, so the call is a no-op today. Wire it anyway, or a designer
    flipping `ranged.attacksHigh` in the Tuner gets silence. Note the shape is
    *post-selection*: if a non-exempt family ever uses `nearestStructureWithin`
    (`enemies.ts:1258`) it would pick the high tower and then idle rather than
    fall through to the next-nearest, so filter inside the selection if that
    changes.
  - **`src/sim/enemies.ts:1103`** (the Wraith's phase end, the *second*
    surfacing site in `updatePhasing`) — guard it exactly like 1086. It is the
    only live subject `ground.surfacesHigh: false` has, since fliers and ranged
    enemies never submerge. Not a leak today — `unstick` already routes through
    `passable`, so a Wraith is normally nudged off the cliff — but a rule whose
    one call site is unclassified is a rule nobody will wire. Found by QA.
  - **`src/sim/boss.ts:293`** (`shatterAlong`, a true boss special) —
    **deliberately not guarded.** That is how "the bosses' special attacks
    still can" is implemented; see the boss decision below.
  - **`src/sim/boss.ts:174`** (`updateUnreachable`) — **must not be guarded**,
    and not for the reason it was first written down. It is the anti-stall
    failsafe, not a special: it damages the nearest structure *or else* the
    Core (`else if (!w.godMode)`), so a guard there would let a boss stalled
    beside a high-ground tower deal nothing at all and the failsafe would stop
    failing safe. Corrected after QA read the function.
  - Where the family comes from: resolve once per def beside `traitFlags(def)`
    at spawn and hold it on the `Enemy` (`src/sim/types.ts`, out of scope), or
    call `familyForDef(cfg, def.id, def.traits)`, which memoises in the shape
    `flagCache` already uses. Not `highGroundFamily` inline — 1459 sits inside
    `moveEnemy`'s collision branch, which runs for every walker on every tick
    it touches something.

  Design decisions, for QUESTIONS.md at the merge:
  - **There is no `boss` family, and that absence is the whole boss rule.**
    Shipped first with `boss: attacksHigh: true`, which is a misreading of the
    owner's note: it exempts "the bosses' *special attacks*", not bosses. A
    family flag cannot distinguish a boss's special from its melee, so the
    blanket row let the Gatebreaker — whose `structureBreaker` trait forces
    `breaching === true` unconditionally at `enemies.ts:1459` — chew a
    high-ground tower from the low tile beside it. High ground would have
    protected nothing on the one wave built to break structures. Bosses now
    classify as `ground`; the specials are exempt because `boss.ts` is not a
    call site. Found by code-reviewer.
  - **The typo guard is a test, not a loader rule** — and it was a loader rule
    first. `AUTHORED_TRAITS` refused a family naming a trait no enemy in
    `data/enemies.json` carries, on the theory that such a family is a dead
    rule. It is this lane's own false-rejection shape, for two independent
    reasons. (1) Such a family is *inert*, not unpayable: nothing crashes,
    nothing reads `undefined`. Three of the shipped table's traits have exactly
    one carrier (`flying`/`gale_imp`, `ranged`/`spitter`, `burrows`/`burrower`),
    so a content-lane rename would stop `data/terrain.json` loading and blame
    the wrong file — today reddening four terrain suites, after fb064c's wiring
    failing run start. (2) It cannot be sound anyway: `loadContent({ enemies })`
    swaps the roster the classifier actually runs against
    (`src/devserver/tunerSave.ts:55` does exactly that), so the file it
    validated need not be the roster in play. The check now lives in the test,
    where it costs a red CI line instead of a dead game. Found by
    code-reviewer; both halves verified here before acting.
  - **The table is keyed by trait name, not by enemy key**, matching
    `damagetypes.json`'s `immuneTrait` precedent, so a new enemy inherits its
    family from the traits it is authored with and the content lane never
    touches terrain data to add one. First match in file order wins; the last
    family must name no traits and is the catch-all. Both are loader-enforced,
    which is what makes `highGroundFamily` total.
  - **What the loader refuses is exactly the silently-wrong table**: a
    duplicate key, a trait claimed by two families (first-match-wins makes the
    second dead precisely for the enemies its author had in mind), a trait
    listed twice inside one family, and a catch-all anywhere but last
    (mid-table it swallows every family below it; absent, classification is not
    total). All two-sided — a re-tuned table and an added family must still
    load, and a test builds both.
  - **The `flier` row is inert today.** `enemies.ts:1422` puts the whole
    bump/breach branch behind `!e.flying`, and the one authored flier carries
    no `ranged` trait, so no flier reaches a structure-damage site at all. The
    row states the owner's rule for the day one does; it is not exercising a
    live path, and a later reader should not assume it is.
  - **Junk coordinates read as not-high**, the convention `Grid.isHighGround`
    already set (b007's class). That direction is the safe one: these rules can
    then only ever remove an attack terrain really blocks, never invent a block
    out of a stray float. Coordinates are floored, so an entity position works
    as a tile.
  - **Three of the owner's four clauses needed no code.** "Ground enemies
    cannot step onto high tiles" is `high.walkable: false` from fb064a/fb064b,
    pinned in `tests/terrain-grid.test.ts`. Only the two a walkability mask
    cannot express are here: meleeing *across* the cliff edge, and surfacing
    under a tower from below.

- (2026-09-03, fb064i) Out-of-scope needs, for the merge:
  - **The six call sites above are this item's deliverable to the main lane.**
    `src/sim/enemies.ts`, `src/sim/boss.ts` and `src/sim/types.ts` are all
    read-only here.
  - **`data/terrain.json` now decides combat outcomes, not just map shape**, so
    the standing `contentHash()` merge blocker (fb064b, carried by fb064g and
    fb064h) is now correctness-critical rather than cosmetic: after the World
    wiring, editing `highGround.families[].attacksHigh` changes who can damage
    what while a stale replay still validates. Same one-line
    `src/sim/content.ts` fold, higher stakes. Found by code-reviewer.
  - **`nearestStructureWithin` (`enemies.ts:1258`) selects before the rule
    applies.** Harmless while only the exempt `ranged` family uses it; a
    non-exempt caller would target a protected tower and idle. Filed so the
    next caller notices.
  - **The Burrower's untargetable window widens** (see the surfacing site
    above). A balance question, so a main-lane sweep question, not a terrain
    one.
  - Carried forward unchanged: **nothing consumes `TerrainMap.fallback`**
    (fb064g/b/h), and **`Grid.placeCore` still has no safe caller** until
    fb064c migrates the `CORE_X/CORE_Y` readers (fb064h).

- (2026-09-03, fb064i) Review and QA. code-reviewer returned REQUEST-CHANGES on
  three Majors; qa-playtester returned **PASS on both acceptance clauses** and
  filed six items. All are fixed or recorded. The two agents independently
  reached opposite conclusions about nothing, and code-reviewer's first Major
  (the boss family) was a rule error no test would ever have caught, because
  the tests agreed with it.
  - **Major (review), confirmed and fixed: the `boss` family was a misreading**
    of the owner's note. Verified before acting rather than taken on the
    report's word: `enemies.ts:1453-1459` does force `breaching` unconditionally
    for `structureBreaker`, high ground *is* in `blocked` so a walker beside a
    cliff sets `hitX/hitY` to the high tile, and `structureAt` does return the
    tower on it — so the row really did hand the Gatebreaker a high-ground
    tower. QA re-verified the same chain independently. Row deleted; the four
    test goldens that had pinned the wrong reading flipped with it.
  - **Major (review), confirmed and fixed: `AUTHORED_TRAITS` was a false
    rejection.** Both halves of the argument re-verified here before acting —
    `src/devserver/tunerSave.ts:55` really does call `loadContent({ enemies })`,
    and the three single-carrier traits really are single-carrier. Moved to the
    test.
  - **Major (review), fixed: the merge list did not exist**, and the item's
    four-site brief was missing `enemies.ts:1185` (the Colossus stomp). QA
    independently re-derived the list and found no seventh damage site, which
    is the evidence the list is complete rather than merely long.
  - **Major (QA bug 3), fixed: three of the eight authored booleans survived
    the whole 50-test suite.** `flier.surfacesHigh`, `ranged.surfacesHigh` and
    `ground.surfacesHigh` could each be flipped green: `surfacesHigh` was
    asserted for the Burrower alone. This lane mutation-tests its *code* by
    habit and had not thought to mutate its *data*, which is the deliverable.
    Now a golden over every row, and all three mutants die.
  - **Major (QA bug 1), fixed: `familyForDef` went stale on a def id reused
    with different traits** — the same shape `traitFlags` has, but reachable
    through the exact `loadContent({ enemies })` override this item cites
    elsewhere as a reason not to trust the roster. The entry now carries the
    `traits` array it was resolved from and re-resolves unless the caller
    brings the identical one back; a parsed document gives each def a fresh
    array, so the check costs one comparison. Mutant added and killed.
  - **Minor (QA bug 2), fixed in the list above: `enemies.ts:1103` is a second
    surfacing site** — the Wraith's phase end. It matters because the shipped
    `ground.surfacesHigh: false` has the Wraith as its *only* possible live
    subject (fliers and ranged enemies never submerge), so the table shipped a
    rule whose sole call site was unclassified. Now listed, and a test pins the
    Wraith as its subject. QA measured the consequence as non-severe: `unstick`
    already goes through `passable`, and over seeds 1..500 the 88 high tiles
    with no passable tile in its Chebyshev-3 box are covered by the `1459`
    guard anyway.
  - **Minor (QA bug 5), fixed: `boss.ts:174` was mislabelled a "special".** It
    is `updateUnreachable`, the anti-stall failsafe. Leaving it unguarded is
    still right, but for a stronger reason than "it is a special": it damages
    the nearest structure *or else* the Core, so a guard there would let a boss
    stalled beside a high tower deal nothing at all — the failsafe would stop
    failing safe. Corrected in the merge list and in `high-ground.ts`.
  - **Informational (QA bug 6), fixed: the family table had no size cap** while
    fb064a's unbounded-loop finding put caps on every other array in this file.
    QA measured it linear rather than quadratic (50 000 families = 164 ms parse,
    2.7 ms per uncached classification), so it was never fb064a's severity — but
    a merge that calls `highGroundFamily` inline at `enemies.ts:1459` would make
    it fatal, and that is exactly the call the doc warns against. Capped at 64
    families and 64 traits, with a two-sided test.
  - **QA's hostile probes that found nothing**, recorded because each is a hole
    this lane has actually shipped before: every junk coordinate shape (`NaN`,
    `±Infinity`, `1e21`, `2**31`, `-0`, `null`, `undefined`, both axes) reads as
    not-high in the safe direction; gates and the Core footprint marked `high`
    by hand are double-guarded (`syncTerrain` clears the mask *and*
    `isHighGround` requires `TileType.Open`) — and **seed 13 paints high ground
    under Core tile (26,9) naturally**, so that guard is load-bearing, not
    theoretical; a tower built then sold on high ground keeps the rule;
    `applyTerrain` after a build is still refused; an all-high map denies
    608/720 tiles and reports `allGatesReachable()` honestly false; no seed in
    1..3000 lacks high ground (minimum 43 tiles, seed 1), so the rule always
    has a subject.
  - Verified behaviour-neutral: `npm run sim -- --seed 1 --policy hybrid` gives
    `endHash 2729a000`, matching the baseline recorded in fb064b and fb064h; QA
    additionally ran seeds 2/7 hybrid and seed 1 maxbuild to victory, and
    grepped `src/` and `tools/` for any caller of the new module — zero, so the
    change cannot reach a run at all. The generator's golden hashes are
    untouched (no generation code changed).
  - **24 mutants, 24 killed** across both passes: 8 on the predicates
    (`Math.floor` on each, always-true on each, last-match-wins, catch-all never
    matches, both family accessors inverted), 5 on the loader (each refusal
    removed, the catch-all rule weakened in both directions), 7 on the data
    (each authored boolean, plus the blanket boss row restored and the boss
    family removed), and 4 on `familyForDef` (config key, def key, the
    traits-identity check, cross-config bleed).
  - `npm run test:fast` on the final tree: 2203 passed / 6 failed, the
    documented pre-existing set only — `b032`/`b034`/`b035` and `q15` are the
    load-sensitive UI-fold and 4000 ms-settle suites, `b036` is the
    deterministic 1095.4-vs-1080 UI-lane failure, `q45`/`q49`/`q52` are the
    Windows EPERM scratch-dir cleanups. Nothing in terrain, grid, enemies or
    pathing failed. **Honest caveat:** re-running the four load-sensitive
    suites as a group of four did *not* clear them this time, so "green in
    isolation" is not a claim this item verified. The basis for calling them
    unrelated is the import graph (nothing outside `src/sim/terrain/**` and
    `tests/terrain*` imports any of this; the only edge is one-way,
    `terrain -> grid`) plus their being the same set fb064b and fb064h recorded
    as failing on trees that did not contain this item — not a control run
    against HEAD, which would have meant disturbing a tree QA was reading.
  - QA respected the working tree this time (the fb064h incident): scratch under
    `bench/.tmp/qa1..11.ts`, no tracked file touched, `git status` identical
    before and after. The instruction that bought it is worth reusing verbatim.
