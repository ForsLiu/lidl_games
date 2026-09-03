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
- [ ] (fb064g) [bug] `minCoreLegalFrac` has no ceiling: `1` is provably
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
      test first; the loader refuses `minCoreLegalFrac` above what
      `blankKinds()` itself achieves; the fallback path keeps a test that
      reaches it by other means — refs: fb064a QA bug 3.
- [ ] (fb064b) [feat] grid integration: the generated map plugs into
      `src/sim/grid.ts` (the lane's single integration-point file) so rough is
      walkable-not-buildable, rock blocks ground pathing, high ground is
      buildable and blocks ground walkers, and flow-field costs / the sealing
      rule / `allGatesReachable` / `gatePath` all still hold. Acceptance:
      grid tests green on a generated map for 100 seeds; existing
      `tests/grid.test.ts` and path-indicator tests unchanged and green; and
      `data/terrain.json` is folded into `contentHash()` so an edit to terrain
      tuning makes a stale replay fail loudly (architecture rule 2) — without
      that line this merges as a silent replay hole.
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
