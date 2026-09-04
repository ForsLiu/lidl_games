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
