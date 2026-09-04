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
- [x] (fb064j) [test] generator seed-domain hardening: `generateTerrain` is
      pinned only over seeds 1..20000, which is not the domain a run seed
      draws from. Acceptance: determinism and full band legality over
      negative seeds, 0, `2**31 - 1` and seeds near the `(requested + n) | 0`
      wrap; the retry path exercised in the negative range; a golden hash
      per region — refs: fb064a Log ("band headroom is ZERO"), G2.
      **Filed as `[test]`; shipped with two code fixes.** Measuring the real
      domain found two defects in `generateTerrain`, both fixed red-first:
      `requestedSeed` was `seed | 0`, so a real run seed (drawn as
      `(Math.random() * 0xffffffff) >>> 0`) of 3000000000 reported
      -1294967296 — provenance unusable on half the seed space; and
      out-of-domain integers (`2 ** 32`, `2 ** 40`, `MAX_SAFE_INTEGER`) passed
      the `Number.isInteger` guard and aliased onto seeds 0, 0 and 0xffffffff.
      See the Log for the full record.
- [x] (fb064k) [polish] `describeTerrain` diagnostic: a deterministic ASCII
      dump plus measured-band summary in `src/sim/terrain/`, so a terrain
      repro is one string rather than a seed and a screenshot. Acceptance:
      the dump round-trips to a byte-identical `kind` buffer, carries the
      gates, the legal-anchor count and every measured band, and a known
      seed's dump matches a golden — refs: HANDOFF §7 (depth).
      **Filed as `[polish]`; shipped with a second integrity check the
      acceptance did not ask for.** The round-trip clause is satisfied by the
      hash alone only on an arena-sized dump that carries provenance — which
      is not every dump, and the two uncovered paths (a provenance-free grid,
      and fb064f's announced non-arena Training Grounds arena) are exactly
      where a one-glyph mangle parsed cleanly into a map contradicting its own
      printed counts. The glyph histogram is now recounted from the decoded
      rows and cross-checked, which is config-free and dimension-free and so
      covers every dump. See the Log.
- [x] (fb064l) [test] "seeds produce varied legal maps" is currently pinned
      by ">= 95% distinct over 200 seeds", which a one-tile difference
      satisfies — the owner's Done-when clause is effectively unmeasured.
      Acceptance: over 500 seeds, mean pairwise tile-difference share and
      per-seed difference from the flat map both clear a floor recorded in
      the test, and the rock/rough/high counts spread across a band rather
      than sitting on the authored density — refs: owner feedback
      "Done when: seeds produce varied legal maps".
      **Filed as `[test]`; shipped with a generator change, because the
      measurement the acceptance asked for came back false.** Over seeds
      1..500 the composition clause did not hold and could not: `scatter()`
      placed exactly `round(density * interior)` tiles and only fell short when
      it ran out of room, so every single seed carried exactly 43 `high` tiles
      (sd 0.0000, ONE distinct value in 500) and 92% carried exactly the
      authored 104 `rough`. Terrain varied in *where* the obstacles were and
      not in *how many* — which the old ">= 95% distinct hashes" pin could not
      see, since a one-tile difference scores 100% distinct there. Fixed
      red-first with `density.jitter` in `data/terrain.json` (a per-seed budget
      per kind, uniform on 1 +- 0.22). See the Log for the measurements, the
      control run and the golden churn.

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
      **Numbers above are stale as of 2026-09-04 — re-measure before
      implementing.** They were read against the pre-fb064l generator, which
      fb064l replaced; a deferral is a measurement with an expiry date and this
      one expired. fb064l's QA took a like-for-like reading (`high` tiles with
      no walkable tile within Euclidean range r, seeds 1..500): at r=4.0 the
      *seed share* barely moved (29/500 -> 27/500) but the plot count rose
      31% (65 -> 85 tiles) and the worst single seed doubled (6 -> 12 plots).
      So the exposure moved in the direction that matters to this item's
      acceptance, and the "55 plots" figure must not be inherited.

### Generated 2026-09-04 (lane generation rule)

Two actionable items were left (fb064l, fb064m), so the rule ran again.
**Leg (a), the sweep, was skipped for the second time with the same
reason, re-verified rather than inherited** (measurement rule: a deferral
is a measurement with an expiry date): `grep -rn "generateTerrain\|applyTerrain"
src/ tools/` outside `src/sim/terrain/` still returns only `grid.ts`
comments and the unrelated `applyTerrainPassives` in `weapons.ts`, so no
run's outcome depends on `data/terrain.json` and a sweep would measure
zero terrain. Leg (b) was run as a clause-by-clause diff of the owner
feedback file against the shipped modules; the only *unbuilt* in-scope
clause it found is the Training Grounds flat arena's terrain half
(fb064n) and the rock/character veto point (fb064q) — everything else
left in the feedback (rendering, Tuner page, Core-placement wiring) needs
files this lane may not touch and is already in the Log. Leg (c) is
fb064o.

- [ ] (fb064n) [feat] the flat arena is a concept with no name: it exists
      only as `blankKinds()` inside `generate.ts`'s fallback and as
      `flatCoreAnchorCount`'s independent replica of it in `config.ts`, and
      fb064f's announced Training Grounds override needs it as a map. Give
      it one export — `flatTerrain(cfg)` returning a real `TerrainMap`
      (honest provenance: it is no seed's output) — and route the
      `maxAttempts` fallback through the same builder so there is one flat
      map, not three. Acceptance: `flatTerrain` is legal under
      `terrainLegal` at the shipped config; its tiles are byte-identical to
      today's fallback map (golden pin, so the refactor is provably
      behaviour-preserving); its `kind` buffer is not shared between calls;
      `describeTerrain` round-trips it and `terrainOverlay` + `applyTerrain`
      leave every interior tile buildable with all gates reachable; the
      `config.ts` replica is either deleted or pinned equal to it — refs:
      owner feedback "Training Grounds keeps a flat arena", fb064f.
- [ ] (fb064o) [feat] gate-to-Core path length is the terrain property every
      wave is balanced against, and it is unmeasured: `walkableFrac` and
      friends bound *area*, nothing bounds *travel time*, so a seed whose
      rock blobs happen to lie off the mains can hand a run a materially
      shorter or longer approach than the tuned flat map without failing a
      single band. Acceptance: measure each gate's shortest path length to
      the suggested Core anchor over 500 seeds, record min/mean/max against
      the flat map's baseline, and either add a generation constraint
      holding the worst seed inside a band or record the measured decision
      to accept the spread with the numbers that justify it; no band moves
      out of its measured headroom either way. Balance *orders* stay
      main-lane — this constrains generation, it does not retune waves —
      refs: HANDOFF §7 (depth), G2, fb064a Log ("gate mains are structural").
- [ ] (fb064p) [polish] `TerrainMap.hash` is computed once at construction
      over a `Uint8Array` the caller can write into: `types.ts` documents
      "treat a generated map as immutable" and nothing enforces or detects
      it, so a consumer that patches a tile silently invalidates the G2
      determinism handle. Acceptance: `verifyTerrainMap(map)` recomputes
      `terrainHash(map.seed, map.kind)` and reports a mismatch; a regression
      test flips one tile of a generated map and sees it caught; verify
      passes for 100 generated seeds and for the fallback map — refs:
      `types.ts` `kind` doc, architecture rule 2.
- [ ] (fb064q) [feat] the owner's rock clause carries an open veto — "the
      character still passes per fb002's pass-through rule [designer note:
      character flies over; veto if rocks should block the character]" — and
      the lane has shipped no artifact for it: no predicate states it and no
      test pins it, so at the merge each mover re-derives the rule and a veto
      is a code hunt. Acceptance: a per-tile `blocksCharacter` flag in
      `data/terrain.json` (false on every authored kind, matching today's
      pass-through) with loader validation, a pure predicate beside the
      high-ground table, table-driven tests per kind, and the exact
      out-of-scope call sites listed in the Log — so the veto becomes a
      one-line data edit — refs: owner feedback "rock/wall", fb002.
- [ ] (fb064r) [test] band headroom is pinned by one hand-found seed (7957,
      `walkableFrac` exactly 0.6000) over the 1..20000 window, which is not
      the domain fb064j established a run seed draws from. Acceptance: a
      recorded per-band min/mean/max ledger over a sample spanning the full
      `MIN_TERRAIN_SEED..MAX_TERRAIN_SEED` domain including negatives, with
      the worst seed per band named in the test so a retune's cost is a diff
      rather than a hunt; the retry-taking seed set pinned the same way —
      refs: fb064j, fb064a Log ("band headroom is ZERO").

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

- (2026-09-04, fb064j) Seed-domain hardening. `src/sim/terrain/generate.ts` gains
  `MIN_TERRAIN_SEED`/`MAX_TERRAIN_SEED` and a domain guard;
  `tests/terrain-seed-domain.test.ts` is 21 tests, ~8.9 s (stays in the fast
  tier). Design decisions, for QUESTIONS.md at the merge:
  - **The domain is `[-2**31, 2**32-1]`, not int32.** The item was filed as a
    coverage gap, but the gap had a defect behind it: a run seed is drawn as
    `(Math.random() * 0xffffffff) >>> 0`, so roughly half of every real seed is
    at or above `2**31`, and `requestedSeed = seed | 0` reported 3000000000 as
    -1294967296. That is the same provenance destruction fb064a's
    `Number.isInteger` guard exists to prevent, happening in the *normal* case
    rather than the corrupt one. The upper end is the uint32 a run draws; the
    lower end keeps the int32 negatives, which tools and tests use freely and
    which the RNG has always accepted. Refusing negatives would buy nothing and
    would delete the negative-range retry coverage the item asks for.
  - **`requestedSeed` is provenance, not identity, and is stored verbatim.**
    `-1` and `4294967295` are distinguishable here but produce byte-identical
    tiles and an identical `hash`, because `attempt()` keys the RNG on
    `seed >>> 0`. Canonicalising to uint32 was considered and rejected: it
    reintroduces the same defect one bit-pattern class over, since a tool
    seeding with `-1` could no longer recognise its own run. `types.ts` now says
    so, and says that a guard checking a seed must check `requestedSeed` and not
    `seed` — `seed` is the tempting name and the wrong one.
  - **Out-of-domain integers are refused rather than folded in.** `2**32`,
    `2**40` and `MAX_SAFE_INTEGER` are integers, so `isInteger` waved them
    through and `| 0` dropped them onto seeds 0, 0 and 0xffffffff. QA found a
    sharper one: `-(2**31) - 1`, one *below* the floor, became the domain's
    *ceiling* (2147483647). All are now refused.
  - **`| 0` -> `>>> 0` in the retry walk moves no tile and no hash.** Proved
    algebraically (both are views of one residue mod `2**32`; `attempt` consumes
    `seed >>> 0` and `Hasher.int` folds `seed | 0`, so both are invariant) and
    measured: QA diffed 800000 seeds spanning both wraps against HEAD's
    generator — 0 tile diffs, 0 hash diffs, the only deltas being the
    `seed`/`requestedSeed` fix itself. fb064a's goldens 1/2/42/1000 are unchanged
    and are restated in the new file so a future widening that does move them
    fails here too.
  - **`seed` on a fallback map is the *unadvanced* key**, and the doc now says
    so. The first draft's wording ("advanced by one per degenerate attempt") was
    unfalsifiable at HEAD and false once tightened: the flat map is not any key's
    output, so naming an advanced key would name a key that did not produce those
    tiles. Caught by QA against the doc, not the code.
  - **`-0` is normalised to `0`.** It passes both guards (`isInteger(-0)` is
    true, `-0 < MIN` is false) and would be stored verbatim. It compares equal to
    `0` under `===` but not under `Object.is` — which is what vitest's `toBe`, a
    deep-equal on the map, and the JSON round-trip of a saved run all use.
    Reachable from any `Number(argv)` seed path, since `Number('-0')` is `-0`.
    The one value where "compare `requestedSeed` to `RunConfig.seed`" breaks
    would have been the one that looks most like a legitimate seed.
  - **The band cliff is a property of the whole domain, not of seeds 1..20000.**
    fb064a's Log records seed 7957 at `walkableFrac` exactly 0.6000 against a
    `>= 0.60` band and read it as a fact about that window. QA re-measured
    **8,822,700 seeds across ten windows: every single one bottoms out at exactly
    0.600000**, and 7 of the 200000 seeds below `0xFFFFFFFF` sit on the floor.
    The far-domain twin (`4294881754` = `-85542`, 432/720 walkable, hash
    `c653ad51`) is now pinned alongside, so a density retune goes red in the far
    window too. Second-tightest band is `buildableNormalFrac` at 4 tiles of
    headroom. **0 illegal and 0 fallback across all 8.82M**, max attempts 2,
    first-attempt-degenerate rate 1.77e-4 — but that is 0.205% of the domain and
    is support, not proof; nobody enumerated 4.295e9 seeds (~21 CPU-days).

- (2026-09-04, fb064j) Review and QA. code-reviewer returned REQUEST-CHANGES on
  two Majors; qa-playtester returned PASS on every acceptance criterion and filed
  seven items. Both Majors were in the new *test* file, not the `/src/sim`
  change, and both are the mistake this file keeps recording.
  - **Major (review), confirmed and fixed: the "whole uint32 domain" comb covered
    0.0996% of it.** `step: 10726` should have been ~10737418 — a dropped-digit
    slip. Its largest seed was 4279674, entirely below `2**31` and inside
    territory fb064a's sweep already covers, so the one region whose stated job
    is "not a contiguous window" was a fifth contiguous window: a sample dressed
    as a property. Now `2 * floor(2**32 / REGION_N / 2) + 1`, odd so the low bits
    vary too (an even stride from 0 only visits even seeds, and
    `fnv1a`/`mulberry32` are bit-mixing functions). Honest note: this is a
    coverage widening, so no mutant demonstrates it — the corrected comb is still
    0 illegal / 0 fallback.
  - **Major (review), confirmed and fixed: `legalUnder` was the generator's own
    accept predicate.** `generateTerrain` returns a non-fallback map only when
    `terrainLegal(measureTerrain(map, cfg), cfg)` passes under the same cfg, so
    `illegal: []` was implied by `fellBack: []` and the item's "full band
    legality" clause was unmeasured. fb064a hit this exact problem and wrote
    `terrainLegalUnder` to re-derive legality term by term, with a comment
    recording that dropping one term made the assertion strictly weaker than the
    generator's accept test — and the first draft of this file reintroduced the
    weak form anyway. Now re-derived term by term, plus a `disagreed` check that
    the re-derivation and the flag agree. Mutation-tested: deleting the
    `walkableFrac` term from `terrainLegal` now goes red and previously did not.
  - **Minor (review + QA), confirmed and fixed: `badProvenance` asserted
    `attempts === 1`.** `a.seed === s >>> 0` only holds without a retry, and it
    passed only because zero of the 2000 region seeds retry under shipped data.
    Any density retune — which fb064f hands to *live Tuner edits* — would have
    turned a correct retried map red under the label "badProvenance", pointing
    the next engineer at the fix this item shipped. Now `(key + attempts - 1)
    >>> 0`, and a new test exercises it on a band measured at 76 retries / 0
    fallbacks over 300 seeds so the corrected form is load-bearing
    (mutation-tested). **`minWalkableFrac: 0.62` was tried first — QA's own repro
    band — and measured 0 retries on those three windows.** Recorded because it
    looked like the obvious choice and would have shipped a test asserting
    nothing.
  - **QA bug 4, confirmed and fixed: "every skipped seed was degenerate" could
    not fail for the reason it claimed.** Asserting `generateTerrain(s + n).seed
    !== s + n` only restates the walk the generator just performed. `attempt()`
    is not exported, so the fix reaches it through an `alwaysAccepts` config
    carrying `strict`'s generation parameters with every band switched off —
    which returns `attempt(k)` on the first try — and measures *that* map against
    `strict`'s bands. Inherited verbatim from
    `tests/terrain-generation.test.ts:678-687`, so **the same weakness is still
    in fb064a's file**: noted below.
  - **QA bug 5, fixed: a `Symbol` seed threw from the guard's own message.**
    `${seed}` raises "Cannot convert a Symbol value to a string" while *building*
    the rejection, so the caller saw a TypeError from inside the validator
    instead of its verdict. Out of contract for a `number` parameter, but a guard
    should not fail while explaining itself; now `String(seed)`.
  - **QA bug 7, fixed:** a duplicated `not.toThrow()` pair; replaced with the
    `-(2**31) - 1`-became-the-ceiling assertion rather than deleted.
  - **Verified by QA and unchanged:** all 10 region goldens reproduce in fresh
    processes, order-independent, under `--jitless`, and match HEAD's committed
    generator exactly — they were not recorded from a mutated tree. 41 hostile
    guard inputs (BigInt, boxed `Number`, `Object(-0)`, `Symbol`, strings,
    `1e21`, `0.1+0.2`, `4294967295.0000000001`) all correctly accepted or refused
    with no silent aliasing. Purity holds under a 3-config interleave, 20000
    repeat calls, and 50 stomps of the returned `kind` buffer.
  - **QA disclosed a process incident:** one parallel-launch command dropped two
    `ERR_MODULE_NOT_FOUND` dumps into the repo root; it removed exactly those two
    untracked paths and `git status` returned to the session-start state.
    Verified here. Better than the fb064g precedent, and worth keeping the
    warning in the QA brief.

- (2026-09-04, fb064j) Out-of-scope needs, for the merge:
  - **Nothing domain-checks `RunConfig.seed`.** It is a bare `number`
    (`src/sim/types.ts:608`) and `tools/sim.ts:78` builds it with `Number(v)`, so
    `npm run sim -- --seed 1e18` and `--seed abc` are both accepted today —
    `RngSet` swallows them via `seed >>> 0`. The moment **fb064c** wires
    `generateTerrain(cfg.seed)` into run start, they become a throw from inside
    `/src/sim` mid-run instead of a CLI rejection. The guard is right but sits
    one layer below where the bad value enters. **fb064c must domain-check the
    seed at ingestion**, or `--seed 1e18` throws mid-run; both files are outside
    this lane's Scope.
  - **`tests/terrain-generation.test.ts:678-687` carries the weakness QA filed as
    bug 4** — the skipped-seed loop re-reads the generator's own report rather
    than measuring degeneracy. Fixed in the new file only; fb064a's file is in
    this lane's Scope but was left alone deliberately, since rewriting a green
    suite's assertions is not this item's job. Small follow-up item.
  - **`bench/.tmp/` holds ~33 gitignored full copies of the working tree**,
    several already containing this item's uncommitted test file. Noticed by
    code-reviewer; that copy-the-tree mechanism (q45/q49/q52) is plausibly what
    is behind this lane's "QA raced the working tree" entry and the recurring
    EPERM flakes. Main-lane work, and relevant to whoever fixes those suites.

- (2026-09-04, fb064k) The terrain repro format. `src/sim/terrain/describe.ts`
  (`describeTerrain` + `parseTerrainDump`, `TerrainDump`) and
  `tests/terrain-describe.test.ts`, 16 tests, ~170 ms (stays in the fast tier).
  Design decisions, for QUESTIONS.md at the merge:
  - **The tile rows carry tiles and nothing else; the gates are a header line.**
    Overlaying gate glyphs on the map reads better and destroys the round trip
    for any grid whose gate tile is not `normal` — which is a generator
    invariant (`blankKinds`), not a dump invariant. A hand-built grid with rock
    gates is pinned as the negative case.
  - **Two integrity checks, deliberately, because neither covers the other.**
    The hash is the strong one (it catches a *swap* that preserves the tile
    counts) but it only runs on an arena-sized dump with provenance, because
    `terrainHash` folds `GRID_W`/`GRID_H` rather than the map's own dimensions.
    The glyph histogram is the weak one (blind to a swap) but is config-free
    and dimension-free, so it covers every dump. Shipping only the hash — the
    first draft — left a mangled provenance-free dump parsing cleanly. Both are
    mutation-tested against the case only they catch.
  - **The parse never re-measures the bands.** A dump records what *was*
    measured, under a config it does not carry. Re-deriving the numbers under
    whatever `/data` is on disk now would silently replace the reported values,
    turning the one artefact meant to settle "what did the generator produce"
    into a second opinion. `TerrainDump.measure` is therefore the printed
    values, rounded to 6 dp, and says so.
  - **Provenance is all-or-nothing.** `describeTerrain` emits either five real
    fields or five dashes, so the parse refuses a mix. Reading `hash=-` beside
    four real fields as "no provenance" is how a six-character append to the
    seed line used to disable the hash check entirely.
  - **`GLYPHS` and `FRAC_DIGITS` live in code, not `/data`** — a deliberate
    architecture-rule-4 exemption, recorded here as `core-placement.ts`'s
    `ROOM_RADIUS` was. A Tuner-editable glyph would fork every golden and break
    the round trip for every dump written before the edit; the format is a
    diagnostic contract, not tuning.
  - **CRLF and a BOM are absorbed, not diagnosed.** Refusing CRLF produced the
    worst possible message — `expected a "terrain WxH" header, got
    "terrain 36x20"`, quoting two strings identical on screen. Neither CR nor a
    BOM can be a glyph or part of a field, so normalising costs nothing. A
    *doubled* newline is still a blank row and still refused.
  - **The name `describeTerrain` collides with `src/ui/tower-info.ts:467`**, an
    unrelated function describing a *tower's* terrain effect. Accepted rather
    than renamed: the backlog item names this function, the modules are
    disjoint (nothing imports across; no compile conflict), and the acceptance
    text is the contract. This is the third instance of the clash the lane has
    logged (`TerrainDef`/`TerrainSchema`; `applyTerrain`/`applyTerrainPassives`)
    — a merge note, not a defect, and relevant to fb064e as it starts rendering
    terrain.

- (2026-09-04, fb064k) Review and QA. code-reviewer returned REQUEST-CHANGES on
  one Major; qa-playtester returned PASS on all five acceptance clauses (a)-(e)
  and filed ten bugs. Both independently found the same Major, and QA found one
  neither the reviewer nor the author did.
  - **Major, found by both, confirmed and fixed: the hash was the only integrity
    check, and it has two holes.** Review measured four dumps that parse cleanly
    while self-contradictory; QA measured the same on three paths, including
    changing one character (`hash=03031f09` to `hash=-`) to disable checking
    altogether. Fixed with the histogram cross-check described above.
    Mutation-tested: dropping it now reddens, and dropping the *hash* still
    reddens via a tile swap that leaves the histogram intact, so the two checks
    are pinned to the case only each one catches.
  - **QA bug 3, confirmed and fixed — the one nobody else saw, and a time bomb
    set for the lane merge.** The golden was a multi-line template literal. This
    repo has `core.autocrlf=true` and no `.gitattributes` (verified here:
    `git cat-file --filters HEAD:tests/terrain-generation.test.ts` returns
    CRLF), so the golden's newlines become CRLF on the next `git clone`,
    `git worktree add` or `git checkout` — and `expect(dump).toBe(GOLDEN)` goes
    red with a diff of invisible characters. It passed only because the file was
    written with LF and had never been checked out. Now built from an array
    joined with an explicit newline, plus an assertion that the golden contains
    no CR so a future regression names its own cause. **A `.gitattributes` with
    `* text=auto eol=lf` is the repo-wide fix and is out of Scope** — filed
    below. This is the first byte-exact multi-line text golden in the suite, so
    fb064k introduced the exposure.
  - **Review Minor, confirmed and fixed: the golden's band cross-checks were
    tautological.** They compared the golden against `measureTerrain(map)` where
    `map` is the same object the golden was built from, and an earlier line
    already asserts the two are equal — so they could not fail independently.
    Now measured from the golden's *own decoded tiles*, and extended from one
    fraction to all ten `TerrainMeasure` fields. The histogram and hash
    cross-checks were already independent.
  - **Six further surviving mutants (review), all closed.** `w <= 0`, the
    missing-line guard, the provenance-free seed line, `eq <= 0` (an empty
    field key), plus CRLF and negative zero. Each now has a case. Final tally:
    **18 mutants, 18 killed.**
  - **Also fixed, from QA's list:** duplicate keys were last-wins (bug 2);
    provenance seeds were shape-checked but not domain-checked, so
    `effective=4294967297` passed the hash check because `terrainHash` folds
    `seed | 0` (bug 6); a nine-line dump declaring `terrain 4294967295x1`
    allocated 4.3 GB before discovering its single row was one glyph long, now
    length-checked before allocating (bug 5); `describeTerrain`'s kind guard was
    upper-bound-only and its dimensions unchecked, so `{ w: 2.5, h: 2 }` emitted
    rows of the literal text `undefined` (bug 9, review Minor 2); gate
    coordinates were read but never checked against `GATES` (review Minor 8).
  - **Five doc claims corrected (QA bug 7, review Minors 4-5).** The glyph
    rationale said no glyph is a comma while `rough` *is* a comma; the
    `Record<TerrainKey, string>` comment claimed it catches a `TERRAIN_KEYS`
    reorder, which QA falsified by building a reordered replica that type-checks
    clean (a test now pins two glyphs by `TerrainKind` instead); `toString` was
    called locale-dependent, which is `toLocaleString`; "free of `/data`
    opinions" was false (`coreGateClearance` and `minCorridorWidth` both move
    the dump); and "a malformed dump throws" was the Major above. This lane
    keeps catching doc claims the code does not support, and this item was no
    exception.
  - **A mutation harness that reported false negatives, disclosed.** The first
    scratch runner was written as CommonJS in a `.js` file under a
    `"type": "module"` package, so `require` threw, the script exited 1 without
    mutating, and the loop scored three unmutated runs as "mutant survived".
    Caught by checking that the file had actually changed. Two of those three
    were in fact killed. A mutation result is only evidence if the mutation is
    verified to have applied — worth the same standing as this file's other
    measurement rules.
  - **Verified and unchanged:** QA ran 290,575 generate/describe/parse cycles
    across the whole `[-2**31, 2**32-1]` domain (three odd-stride combs plus
    fb064a's five retry seeds, the band-cliff seed 7957 and its far twin
    4294881754) with **0 tile, provenance or dimension mismatches and 0 refit
    drifts**; determinism holds across fresh processes, `--jitless`, a foreign
    locale and timezone, and 2000 interleaved calls; neither function mutates
    its input and the parsed buffer never aliases. `npm run sim -- --seed 1
    --policy hybrid` still gives `endHash 2729a000`. QA also confirmed the
    golden reproduces from the committed generator in a fresh process, so it
    was not recorded from a mutated tree.
  - **QA disclosed an environment incident:** the whole of `bench/.tmp/`
    vanished mid-session between two of its calls, taking its own scratch dir
    with it. Gitignored, so `git status` was unaffected, verified. Consistent
    with fb064j's note that this directory is implicated in the repo's EPERM
    flakes.

- (2026-09-04, fb064k) Verification. Targeted suites green: the six
  `tests/terrain*` files are **185 tests, 4.9 s**. `npx tsc --noEmit` clean (the
  repo has no linter configured). `npm run test:fast`: **2245 passed, 10
  failed**, none of them this item's:
  - 3 are the `bench/.tmp` EPERM cleanup flake in q45/q49/q52, present in this
    session's *pre-change* baseline run and already logged by fb064j.
  - `b032`, `b034`, `b035` pass in isolation — load-sensitive, the same set
    fb064b/fb064h/fb064i recorded.
  - `b036` and `q15` were run as a **control**: the identical two-suite
    invocation with the change, and with the tree restored to HEAD (new files
    moved aside, `index.ts` restored from `git show`), gives identical results —
    `b036` fails both ways, `q15` passes both ways. So `b036` is pre-existing
    and `q15` is load-dependent, and neither is attributable to fb064k. This is
    the control run CLAUDE.md's measurement rules ask for, rather than the
    import-graph argument fb064j had to settle for.

- (2026-09-04, fb064k) Out-of-scope needs, for the merge:
  - **`.gitattributes` does not exist and `core.autocrlf` is `true`.** Every
    checked-out file in this repo is CRLF. fb064k's golden was made immune
    in-lane, but the exposure is repo-wide: any future byte-exact text golden
    inherits it, and `git diff` noise between LF-writing agents and CRLF
    checkouts is the same root cause. Adding `* text=auto eol=lf` is a one-line
    main-lane change and is the real fix.
  - **`src/ui/tower-info.ts:467` exports an unrelated `describeTerrain`.** Third
    logged instance of this clash; see the decisions entry above for why it was
    accepted rather than renamed. Relevant to fb064e (UI lane) and to anyone
    grepping the symbol at the merge.
  - **`describeTerrain`'s gates line is `GATES`, a compile-time constant, not
    the run's gate list.** It inherits fb064b's standing merge blocker ("the
    generator does not know the run's gate list"): `src/sim/world.ts:441-448`'s
    Fourth Gate modifier adds a south gate at (12,19) at run construction, and a
    dump taken from such a run will report three gates and omit the one the bug
    is about. Not fixable in this lane — `analyze.ts`, `generate.ts` and
    `config.ts` all hardcode `GATES` the same way. When the main lane threads
    the run's gate list into generation, that item should extend fb064k's
    "carries the gates" test to a 4-gate map.

- (2026-09-04, fb064l) Variety measured, and the generator changed to pass
  the measurement. Everything here is a reading, not a story.

  **The defect.** Over seeds 1..500 with the pre-fb064l generator, per-seed
  interior shares were:

  | kind  | authored | mean   | sd     | min    | max    | distinct |
  |-------|----------|--------|--------|--------|--------|----------|
  | rough | 0.17     | 0.1679 | 0.0053 | 0.1340 | 0.1699 | 19       |
  | rock  | 0.11     | 0.1200 | 0.0130 | 0.1095 | 0.1879 | 39       |
  | high  | 0.07     | 0.0703 | 0.0000 | 0.0703 | 0.0703 | **1**    |

  `high` was the *same 43 tiles* on all 500 seeds and `rough` sat on its
  authored target on 92% of them, because `scatter()` places exactly
  `round(density * interior)` and only falls short when it runs out of free
  ground. Layout varied; composition did not. After `density.jitter: 0.22`:
  rough sd 0.0222 / 53 distinct, rock sd 0.0215 / 57, high sd 0.0089 / 20.

  **The control run.** `jitter: 0` skips the budget draws rather than
  multiplying them by zero, so it is fb064a's generator on fb064a's RNG
  stream — verified by seeds 1/2/42/1000 still hashing to fb064a's recorded
  `03031f09 / 30ddb8d4 / b2e86488 / 473db113`. Every "before" number below
  was read at `jitter: 0` in this session rather than remembered.

  **What the change cost, measured over seeds 1..20000.** Retries (seed+1
  regeneration) went 5 -> 18, i.e. 0.09% of seeds; fallbacks stayed 0; every
  band still holds on every seed. The worst `walkableFrac` is still *exactly*
  0.600000 (seed 16236, was 7957) and that is structural, not luck: a map
  under the band is regenerated rather than shipped, so the band itself is the
  minimum any returned map can measure. Worst `buildableNormalFrac` 0.4528
  against a 0.45 band — about 2 tiles of headroom, the tightest band on the
  shipped data.

  **A wrong reading, kept as a warning.** A first pass measured the
  stranded-legacy-Core rate on the raw generated map and read 434/5000,
  a 100x jump. That is a different question: `Grid` keeps the Core's own 2x2
  unblocked whatever the terrain says, so the map-level count is dominated by
  seeds that merely scatter rock onto the footprint. Measured the way the game
  sees it (through `Grid`), the rate went 4/5000 -> **2/5000** — the change
  *reduced* it. The obvious story ("wider rock budgets seal the Core off more
  often") was the opposite of the measurement.

  **Golden churn, deliberate and paid in full.** Every generated map moved, so
  these were re-derived rather than re-recorded: the fb064a hash goldens and
  the fb064j per-region goldens; `describeTerrain`'s seed-1 dump; the
  `suggestCoreAnchor` table (seeds 24/40 kept both role and anchor; 13 replaces
  127, and 97/112/189 replace 58/173, because those seeds no longer produce a
  distance tie and an entry with no tie tests neither tie-break key); the
  fb064g `wide`/`sparse` fixtures (seeds 262 -> 190, 55 -> 18, both still
  demonstrating a legal non-fallback map that beats the flat map's anchor
  share); the cliff and retry seeds; the fb064j int32-walk fixture (no
  `minCoreLegalFrac` can make that walk two steps any more — key 2**31 now
  measures 0.487047, *below* key 2**31-1's 0.504043 — so it is pinned as a
  three-step walk that crosses the boundary, which tests the same arithmetic
  harder); and the stranded-Core fixture seed 97 -> 4426. This was free
  exactly now: no run calls `generateTerrain` yet, so no stored replay
  depends on a terrain map.

  **Design decision for QUESTIONS.md at the merge.** `density.jitter` is
  bounded only by `frac` (0..1) with no cleverer ceiling, on the same reasoning
  fb064g's own comment records for the buildable band: `scatter()` is
  best-effort, so a maximum *budget* is not a maximum *placement* and a ceiling
  derived from one would refuse configs the generator satisfies. A jitter that
  does make seeds degenerate is not silent — it shows up as retries and, at the
  limit, as `fallback`, both of which the sweep tests assert against.

- (2026-09-04, fb064l review + QA) Both subagents ran against the finished
  change; the item shipped with six fixes on top of it. Recorded because four
  of the six are the *same* failure mode this lane keeps producing — an
  assertion that looks like a property and is really a function of the
  authored numbers.

  - **The `distinct >= 20` variety floor was the attainable ceiling, not a
    floor.** `distinct` counts reachable integer tile counts, which scale with
    `density x jitter x interior`; for `high` that band spans exactly 20
    values, so floor == ceiling. It went red on seeds 501..1000 (19), on
    `jitter: 0.215` (19), and on a plain `density.high: 0.05` retune (14) —
    every one of them with the relative sd unchanged at ~2x its own floor.
    Replaced with a span-relative floor (`attainableSpan / 2`), which passes
    all four cases and still scores fb064a's generator at 1 against 10.
    Review and QA found this independently.
  - **The re-derived `suggestCoreAnchor` table silently lost a mutant.**
    Measured kills over the new table: `ROOM_RADIUS = 1` **zero**, where the
    old table killed it on seeds 127 and 173. `ROOM_RADIUS` is the constant
    exempted from architecture rule 4 *because* the golden table pins it, so
    the re-derivation had quietly voided its own justification. Seeds 177 and
    381 restore it; verified by mutating the real constant to 1 and to 3 and
    watching both go red.
  - **`sameKey <= 5` was an undeclared ceiling on `density.jitter`.**
    Duplicate-effective-seed pairs come from the retry walk: 0 pairs at
    jitter 0, 1 at 0.22, 8 at 0.4, 20 at 0.5, 166 at 1. A legal Tuner setting
    of 0.4 would have failed it with a message about pair accounting. Replaced
    with the invariant that holds at every jitter: a duplicate is always
    explained by one of the two seeds having been regenerated.
  - **`config.ts` claimed a guard that did not exist.** Its argument for
    having no `jitter` ceiling ends "which the sweep tests assert against" —
    but no test measured any jitter but the shipped one. Now one does:
    at `jitter: 1` (the loader's ceiling) 26.7% of seeds retry, `maxAttempts`
    is reached, and 3 seeds in 1..50000 ship the flat fallback (41300, 41301,
    41391, pinned). No illegal map, no hang, ~0.43 ms/seed against 0.32. The
    non-ceiling stands, but the cost is now recorded where a future decision
    to cap the field would be taken.
  - **`buildableNormalFrac` is now the tightest band and had no named seed.**
    Worst is 0.452778 at seed 621 against a 0.45 band — two tiles — down from
    0.470833 at the jitter-0 control, and a random-uint32 sweep finds a seed
    sitting exactly on 0.450000. Pinned by name beside the `walkableFrac`
    cliff seed.
  - **fb064m's recorded band expired** and is annotated at the item above.

  Two smaller ones: `stats()` used `Math.min(...values)`, which throws on the
  day someone raises `SWEEP` past ~100k, and the `jitter: 0` skip makes
  `cfg -> map` discontinuous at 0 (a Tuner slider nudged off 0 regenerates the
  world). The first is fixed; the second is kept and now stated in
  `generate.ts`, since the historical witness it buys — fb064a's goldens still
  verifiable from this build — is worth more than smoothness on a field whose
  point is 0-or-not.

  QA also re-verified the money paths: `generateTerrain`/`applyTerrain` still
  have no caller outside `src/sim/terrain/`, `data/terrain.json` is still
  outside `contentHash()`, save/replay/content-hash suites 88/88 green, and
  `npm run sim` and `tools/sweep.ts` unchanged (win 1.0/1.0). Nothing in this
  change can move a stored run — which is exactly why the golden churn was
  affordable now and will not be later.
