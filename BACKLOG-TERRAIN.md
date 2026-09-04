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

- [x] (fb064m) [feat] a buildable high-ground plot no enemy can reach is a
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
      **Re-measured 2026-09-04 inside the item, and fb064l's QA reading
      reproduces exactly:** with the constraint off, seeds 1..500 give 27 seeds
      (5.40%) carrying 85 plots, worst seed 409 with 12. Shipped as a generator
      constraint (`highContestRadius`), not as an accepted band.
      **Acceptance amended during the item, on the fb064g precedent.** It reads
      "within the shortest authored enemy attack range", and the literal
      shortest reach among everything that may touch a high-ground tower is
      `boss.ts`'s `shatterAlong` at ~1 tile — a radius of 1 would demote every
      interior tile of every high blob (blobs are 3-12 tiles), i.e. delete the
      feature. The shipped reading is "the shortest range among enemies that
      can attack a structure on high ground in an ordinary Act I wave", which is
      the Spitter's 4 and is also the *only* `attackRange` authored anywhere in
      `data/enemies.json`. A test pins `highContestRadius <= min(attackRange
      over families with attacksHigh)` so the number cannot drift from the
      roster. Left unamended, the record would say the shipped code fails its
      own acceptance.

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

- [x] (fb064n) [feat] the flat arena is a concept with no name: it exists
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
      **Acceptance amended 2026-09-04 during the item: the export is
      `flatTerrain()`, not `flatTerrain(cfg)`.** The flat arena is a function
      of `GRID_W`/`GRID_H`/`GATES` and `TERRAIN_KEYS`' fixed order alone, and
      the loader makes that structural rather than incidental — the schema
      pins each tile's flags *and* its `key` per index, so no `/data` edit can
      change which index is rock or what a rock tile means. A `cfg` parameter
      would therefore select nothing while telling fb064f's Tuner caller the
      opposite, and every other function in the module that takes a `cfg`
      genuinely reads it. What a caller does still need `cfg` for — legality
      and measurement — is documented on the export and pinned by a test that
      shows the flat map illegal under a payable `minCoreLegalFrac: 0.9`.
      Both reviewers judged the deviation the better artifact; recorded here
      rather than only in a code comment, per fb064g's precedent, so the
      record does not say the shipped code fails its own acceptance.
      The `config.ts` replica is **pinned**, not deleted: `analyze.ts` imports
      `config.ts`, so measuring there is an import cycle.
- [x] (fb064o) [feat] gate-to-Core path length is the terrain property every
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
- [x] (fb064p) [polish] `TerrainMap.hash` is computed once at construction
      over a `Uint8Array` the caller can write into: `types.ts` documents
      "treat a generated map as immutable" and nothing enforces or detects
      it, so a consumer that patches a tile silently invalidates the G2
      determinism handle. Acceptance: `verifyTerrainMap(map)` recomputes
      `terrainHash(map.seed, map.kind)` and reports a mismatch; a regression
      test flips one tile of a generated map and sees it caught; verify
      passes for 100 generated seeds and for the fallback map — refs:
      `types.ts` `kind` doc, architecture rule 2.
- [x] (fb064q) [feat] the owner's rock clause carries an open veto — "the
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
      **Acceptance amended 2026-09-04 during the item, on the fb064g/fb064n
      precedent: the flag ships `rock: true, high: true`, not "false on every
      authored kind".** That parenthetical rests on a premise that is false —
      fb064b had already routed `Grid.wardenPassable` through `terrainBlock`,
      so rock and high ground stop the Warden in the grid's rule, and the lane
      had shipped the *vetoed* reading of the owner's clause with the reasoning
      held in a comment on a predicate about something else. The premise is
      true only of a live run (nothing calls `applyTerrain` yet, so every Grid
      is born flat), which is precisely the invisibility this item exists to
      end. Shipping `false` would have made `data/terrain.json` describe
      behaviour the game does not have, and flipping the movement rule inside a
      documentation item would have smuggled a gameplay change (dash into
      mountains, park on high ground) past the owner. So the flag matches the
      code that runs and `wardenPassable` reads it, which is what the
      acceptance actually asks for: the veto is one data line, in either
      direction. Left unamended, the record would say the shipped data fails
      its own acceptance. See the Log for the call sites and the measurements.
- [ ] (fb064r) [test] band headroom is pinned by one hand-found seed (7957,
      `walkableFrac` exactly 0.6000) over the 1..20000 window, which is not
      the domain fb064j established a run seed draws from. Acceptance: a
      recorded per-band min/mean/max ledger over a sample spanning the full
      `MIN_TERRAIN_SEED..MAX_TERRAIN_SEED` domain including negatives, with
      the worst seed per band named in the test so a retune's cost is a diff
      rather than a hunt; the retry-taking seed set pinned the same way —
      refs: fb064j, fb064a Log ("band headroom is ZERO").
      **Two domain-wide witnesses handed over by fb064m's QA (2026-09-04),
      to start from rather than re-derive:** over a 120701-seed sample the
      worst `walkableFrac` is seed **2005486180** at exactly **0.600000** and
      the worst `buildableNormalFrac` is seed **2454233399** at exactly
      **0.450000** — both sitting *on* their band floors, so headroom on the
      two tightest bands is literally zero and only `terrainLegal`'s `>=`
      keeps those seeds legal. That also means "without moving the bands out
      of their measured headroom", the phrase fb064m's acceptance uses, is
      vacuous for these two: there is none to move out of. Verify both before
      inheriting them — a deferral is a measurement with an expiry date.
- [ ] (fb064s) [polish] `flatTerrain()`'s dump is a repro string that cannot
      be reproduced (fb064n QA, observation 4). The format exists so that "a
      terrain repro is one string" (fb064k), but the flat arena prints
      `requested=0 effective=0 attempts=0 fallback=true hash=bb4e18dd`, and a
      reader who pastes that `0` into `npm run sim -- --seed 0` gets a
      completely different map (`hash=58fa46d9`, `attempts=1`). The only tell
      is `attempts=0`, which fb064n made unforgeable in the parser but left
      unreadable to a human skimming a bug report. Acceptance: `describeTerrain`
      marks the flat arena on the seed line in a way `parseTerrainDump` reads
      back — the round trip stays byte-identical, the seed line is
      unambiguous to a human, and a dump that claims the mark without the flat
      arena's tiles is refused; the existing `attempts=0` cross-check keeps
      working and its tests stay green — refs: fb064k, fb064n Log.
- [ ] (fb064t) [bug] `parseTerrain` crashes with a raw `TypeError` on a
      truncated `tiles` array instead of a zod issue: the key-order refinement
      reads `cfg.tiles[i].key` unguarded for `i` in `0..3`, so
      `parseTerrain({ ...doc, tiles: [] })` throws `Cannot read properties of
      undefined (reading 'key')` — a message naming neither the field nor the
      file, from a loader whose whole job is refusing bad data legibly.
      Pre-existing (confirmed at `HEAD` before fb064q), and fb064q added a
      second unguarded index read in the same refinement
      (`cfg.tiles[TerrainKind.Normal].blocksCharacter`), harmless only because
      the `key` read crashes first. Acceptance: a failing regression test
      first; `tiles` is length-pinned at the schema level (or the refinement
      guards), so a short, long or empty array reports a zod issue naming
      `tiles`; every existing refusal message is unchanged — refs: fb064q QA
      observation 1.
- [ ] (fb064u) [polish] `Grid.wardenPassable` accepts fractional coordinates
      and answers about a tile that does not exist: `wardenPassable(3.5, 1)`
      returns `true` with rock at `(3, 1)`, because `tile[39.5]` is `undefined`
      and so is neither `Border` nor `Open`. `Grid.buildable` and
      `Grid.isHighGround` both reject non-integers explicitly for exactly this
      reason (b007: `GRID_W` is even, so a `.5` cancels its own fraction and
      lands on a real, different tile). Latent today — both live callers floor
      first — and unchanged by fb064q, which measured it rather than
      introducing it. Acceptance: a failing regression test first; a
      non-integer coordinate is rejected the way the two sibling predicates
      reject it, with `tests/act1.test.ts` and the dash paths unchanged and
      green — refs: fb064q QA observation 3, b007.

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

- (2026-09-04, fb064m) Uncontestable high-ground plots, closed by construction.
  `data/terrain.json` gains `highContestRadius: 4`; `src/sim/terrain/analyze.ts`
  gains `uncontestedHigh`; `src/sim/terrain/generate.ts` gains
  `demoteUncontestedHigh`, which runs after `sealPockets` in every attempt and
  turns any `high` tile with no walkable tile inside that radius into `rock`.
  `tests/terrain-high-contest.test.ts` is 6 tests, ~1.0 s (fast tier).
  13 mutants, 13 killed.

  **The measurement, re-taken rather than inherited** (the item's own expiry
  note). With the constraint off, seeds 1..500: **27 seeds (5.40%), 85 plots,
  worst seed 409 with 12** — fb064l's QA reading reproduced exactly. Of the 85,
  55 sit at a nearest-walkable distance in (4, 5], 17 in (5, 6], 9 in (6, 7] and
  4 beyond 7 — so at `towers.json`'s base `buildRange: 4` none of them is even
  buildable, and at the 5-7 a real run reaches (Engineer +2, `tree.json` node 22
  +1) 81 of the 85 are. That is why this is a normal case rather than an edge
  one. Over a 7500-seed comb spanning the whole `MIN_TERRAIN_SEED..
  MAX_TERRAIN_SEED` domain (negatives, uint32, near-2³¹, near-2³²) the control
  rate is 5.17% / 938 plots, and after the repair **0 exposed, 0 illegal,
  0 fallback**.

  Design decisions, for QUESTIONS.md at the merge:
  - **A repair, not a rejection band.** `sealPockets` is the same shape one
    tile-kind over, and it is the right one: rejecting the seed would cost a
    retry on 5% of seeds and still guarantee nothing, while a *band* on the
    count would be a construction invariant that can never fail (the
    `gateReachFrac` trap this lane already documented). So `TerrainMeasure` is
    unchanged and `describeTerrain`'s format is unchanged with it; the invariant
    is pinned by a test that re-derives it from the tiles.
  - **It costs no band, exactly, and that is a proof rather than a sample.**
    `measureTerrain` reads tiles only through `isWalkable(cfg, kind)` and
    `kind === TerrainKind.Normal`, and the loader's `REQUIRED_FLAGS` *pins*
    `rock` and `high` to `walkable: false` and refuses a file that flips either.
    So high -> rock moves no numerator and no denominator of any band, for every
    config the loader accepts and not merely for the shipped one. Measured over
    seeds 1..500 and again over the 7500-seed comb: every `TerrainMeasure` field
    identical to the control, and identical `seed`/`attempts`/`fallback` — no
    seed takes an extra retry. This is what made the constraint affordable at
    all: the two tightest bands (`walkableFrac` exactly 0.600000 at seed 16236,
    `buildableNormalFrac` 0.452778 at seed 621) do not move a tile.
  - **Rock, not rough or normal.** `rough` and `normal` are walkable, so
    demoting to either would punch a walkable hole into a mountain and move
    every band; `normal` would then be sealed back to rock by the next
    generation anyway. Rock is also the honest kind for a plateau buried inside
    a massif.
  - **After sealing, and no second pass.** Sealing converts walkable ground to
    rock, which can leave a high tile newly uncontested, so the order matters —
    the mutant that swaps the two lines dies. The reverse cannot happen:
    demoting high to rock changes no tile's walkability, so it can never create
    a new uncontested plot. Verified as a fixed point over both sweeps.
  - **Centre-to-centre Euclidean, deliberately conservative.** An enemy is a
    continuous position inside a walkable tile, so a tile whose centre is in
    range certainly holds a standable point in range while one whose centre is
    outside might still hold one near its edge. Erring that way can only call a
    contested plot uncontested, never the reverse — the same "a measurement can
    never be optimistic" rule `analyze.ts` records for 4-connectivity. The
    Spitter's own check is a plain Euclidean `dist2` with no line-of-sight term
    (`enemies.ts:1258`), so no visibility term is being ignored.
  - **The radius lives in `/data` and is cross-checked in a test, not in the
    loader.** It is only correct relative to `data/enemies.json`, but a loader
    rule reading another content file is this lane's recorded false-rejection
    shape and cannot be sound anyway, since `loadContent({ enemies })` swaps the
    roster in play (`tunerSave.ts:55`) — the identical argument `checkHighGround`
    records for `AUTHORED_TRAITS`. The test asserts `highContestRadius <=
    min(attackRange over families with attacksHigh)`, so a content-lane range
    cut costs a red CI line rather than a silent hole.
  - **`0` is the designer's veto, and it is a true no-op.** The item's
    acceptance allowed "an explicit measured decision to accept it"; shipping
    the constraint *with* an off switch gives the owner that option as a
    one-line `/data` edit rather than a code revert, and it is what every
    control run in the suite is measured against.
  - **The fb064a witness now needs both switches off.** `jitter: 0` alone no
    longer reproduces fb064a — seed 1 hashes `ac3b2bc7`, fb064a's map with
    fb064m's four tiles demoted. The two control tests
    (`terrain-generation.test.ts`, `terrain-seed-domain.test.ts`) now set
    `jitter: 0` *and* `highContestRadius: 0` and recover `03031f09 / 30ddb8d4 /
    b2e86488 / 473db113` byte for byte, and both say in a comment that every
    later generator change shipping as an off-able field belongs in that list.
    Left half-updated, the strongest control in the suite would have quietly
    become a restatement of the current build.

  **Golden churn, small and paid in full.** Only seeds carrying an exposed plot
  move, which is 5% of them: the shipped-config hash golden moved for **seed 1
  only** (`c4dde717` -> `54fad3db`; 2/42/1000 are byte-identical and were left
  standing, which is itself evidence of the change's shape), and
  `describeTerrain`'s seed-1 dump moved with it — four glyphs and the `tiles`
  counts, while its `bands` and `counts` lines are unchanged, which is the
  clearest single statement of what this costs. `terrain-variety.test.ts`'s
  recorded distinct-count windows were **re-read, not inherited** (rough 51-56,
  rock 55-60, high 20-22, against floors of 24/15/10), because
  `interiorShare(high)` is now the drawn budget minus the demoted tiles. The
  `suggestCoreAnchor` table, the stranded-Core fixture and every band seed did
  not move at all, because anchors and bands depend only on the walkable and
  normal sets. Free exactly now, as fb064l's entry says: no run calls
  `generateTerrain`, so no stored replay depends on a terrain map.

  **What the repair costs the player.** 0.30% of high ground: over seeds
  1..2000, 85431 high tiles against the control's 85690, mean 42.85 -> 42.72
  per map, worst-case single seed 12 plots. **No seed loses all its high
  ground** — the minimum on a repaired map is 29 tiles — so fb064i's rules
  always have a subject. Generation cost is unchanged within measurement noise
  (~0.27 ms/seed either way); the scan is a clamped box per high tile with an
  early exit, and it was brute-forced equal to a whole-grid scan for every
  radius 0..36 across 40 unrepaired maps (1480 pairs, 0 differences).

- (2026-09-04, fb064m) Out-of-scope needs, for the merge:
  - **The Act II residual: during the VS phase every high-ground tower is
    uncontestable, at any radius.** `enemies.ts:1219` guards the Spitter's
    structure branch with `else if (!act2)` (`act2 = w.huntsWarden`), so in Act
    II Spitters harass the Warden and attack no structure at all. Since melee is
    denied the cliff edge by fb064i and the flier never attacks structures, that
    leaves nothing. This item bounds what *generation* can do — the geometry
    never denies the contest — but the residual is a wave/enemy question and is
    main-lane work: either the VS phase gets a structure-capable high-ground
    attacker, or the decision to leave Act II high ground safe is recorded as
    intended. Found by code-reviewer; the premise is now stated as Act-I-only in
    `config.ts`, `analyze.ts` and the test header rather than unconditionally.
  - **fb064i's predicates still have no call site**, so the melee denial this
    constraint is built against is not yet a behaviour a run shows. Carried
    forward from fb064i's merge list unchanged; fb064m's comments now say
    "once wired" rather than asserting it in the present tense.
  - **`data/terrain.json` now carries a third combat-relevant number.**
    `highContestRadius` joins `highGround.families` in deciding what an enemy
    can damage, so the standing `contentHash()` merge blocker (fb064b, carried
    by g/h/i) applies to it too — after the World wiring, editing this field
    changes which map a seed produces while a stale replay still validates.
  - **The cross-check test reads `attackRange` only.** A future high-capable AoE
    authored the Colossus way (`stompRadius`, `enemies.ts:1178`) would be
    invisible to it. Harmless in the safe direction — a missed longer reach only
    leaves the radius stricter than it needs to be — but the content lane should
    widen it the day such an enemy lands in a family with `attacksHigh: true`.
  - Carried forward unchanged: **nothing consumes `TerrainMap.fallback`**
    (fb064g/b/h/i), **`Grid.placeCore` still has no safe caller** until fb064c
    migrates the `CORE_X/CORE_Y` readers (fb064h), **the generator does not know
    the run's gate list** (fb064b), and **`.gitattributes` does not exist**
    (fb064k).

- (2026-09-04, fb064m) Review and QA. code-reviewer returned **APPROVE with no
  Critical or Major**; qa-playtester returned **PASS on both acceptance
  clauses** and filed four bugs. Everything is fixed or recorded. Both agents
  independently reproduced the recorded band exactly (27 / 85 / worst 409 with
  12), which is the strongest evidence in this entry that it is a measurement
  and not a story.
  - **Major (QA bug 1), confirmed and fixed: `uncontestedHigh` went into the
    public barrel with zero direct coverage.** The sweeps re-derive on purpose —
    that is what makes them test the *repair* — but it left the *function*
    unpinned, and QA demonstrated three contract-breaking mutants surviving all
    eight terrain suites *and* `tsc`: returning `rock` indices as well, ignoring
    the explicit `radius` argument, and deleting the export outright. Fixed with
    a `describe('uncontestedHigh — the exported analyzer')` block on hand-built
    non-arena grids (11x9, so a scan reaching for `GRID_W`/`GRID_H` is caught
    too). All three now die.
  - **A fourth mutant the fix did not kill, found here and then closed.**
    Re-running the sweep against the new block left one survivor:
    `Math.min(map.w - 1, x + radius)` -> `Math.min(35, ...)`. On the 36-wide
    arena the two are identical, so every generator-driven assertion in the file
    is structurally blind to it, and the first hand-built grid happened to have
    no walkable tile in the wrapped position. It is the exact hazard
    `gateIndices` already documents for fb064f's non-arena Training Grounds map.
    Now pinned by a high tile in the rightmost column whose only walkable tile
    sits at the start of the *next row*: at `nx === w` the unclamped index is
    precisely that tile, so an overrunning bound calls the plot contested from
    10.05 tiles away. **Final tally: 18 mutants, 18 killed.**
  - **A mutation harness that scored 17 false negatives, disclosed**, because it
    is fb064k's lesson repeating one session later. An escaped newline inside a
    nested heredoc became a real newline, the generated Python failed to parse,
    and the shell loop kept going — so every one of 17 mutants "passed" against a
    completely unmutated tree (205/205 each time, which is what gave it away).
    The harness had an "assert the file changed" guard; it never ran, because
    the script died before reaching it. The rebuilt loop verifies with
    `git diff --quiet` *outside* the mutation script and aborts on the first
    anomaly. **A mutation result is only evidence if the mutation is verified to
    have applied, and the verification must live outside the thing being
    verified.**
  - **Minor (QA bug 4), confirmed and fixed — and QA's suggested fix would have
    gone red on the shipped roster.** It proposed asserting that every
    `attacksHigh` family member carries an explicit `attackRange`; `gale_imp` is
    `attacksHigh` (family `flier`) and authors none, so that assertion fails
    today. The real defect is the one behind it: the cross-check *dropped* defs
    without an `attackRange` while `enemies.ts:1211` *defaults* them to 4, so a
    future `ranged` enemy authored with no range would attack structures at 4
    and be invisible to the check. Now gated on the `ranged` trait — which is
    what `enemies.ts` gates its own structure branch on — with the sim's `?? 4`
    default mirrored, plus a pin that the `flier` row contributes no reach
    *because* `enemies.ts:1422` denies fliers structures entirely, so its
    absence reads as a decision.
  - **Minor (QA bug 2), confirmed and fixed: the recorded band was a 1..500
    statistic offered as the basis of a designer decision.** The rate barely
    moves domain-wide (5.13% against 5.40%) but the tail does: seed
    **-1399976589** carries **17** plots against this window's worst of 12,
    reproduced here. Added a second recorded window (seeds -500..-1: 27 seeds,
    50 plots, worst -323 with 6) and that named seed, rather than widening the
    500-seed sweep, which would cost minutes for a number that is a statistic
    either way. This lane's third recorded instance of a property measured on
    the wrong seed window.
  - **Minor (QA bug 3), recorded not fixed, and handed to fb064r:** headroom on
    the two tightest bands is *exactly zero* domain-wide — seed 2005486180 sits
    on `walkableFrac` 0.600000 and seed 2454233399 on `buildableNormalFrac`
    0.450000 — so fb064m's own acceptance phrase "without moving the bands out
    of their measured headroom" cannot discriminate for those two. fb064m moves
    neither by a tile (proved, not sampled), so clause 2 still passes; the
    ledger that should carry these witnesses is fb064r's whole job, and both
    seeds are now written into that item.
  - **Six review Minors/Nits, all fixed:** the melee-denial premise was asserted
    in the present tense in two of three places while fb064i's predicates still
    have no call site (now uniformly "once wired at the merge"); the "only the
    Spitter" premise is Act-I-only, since `enemies.ts:1219` gates the structure
    branch on `!act2`, so during the VS phase every high tower is uncontestable
    at any radius (now stated in `config.ts`, `analyze.ts` and the test header,
    and filed above for the main lane); the sweep measured at
    `cfg.highContestRadius` rather than at the roster minimum the acceptance
    names (now the latter, derived at module scope so no assertion depends on
    another having run first); the `attackRange`-only blind spot is commented;
    and `terrain-variety.test.ts`'s distinct-count windows were re-read rather
    than inherited.
  - **QA's independent verification, none of which found a defect:** clause 1
    re-derived by brute force over **120701 seeds** spanning the whole domain
    (0 offenders) and then deepened to **726514 kept plots** across 17003 maps —
    0 without a walkable tile within 4, 0 whose in-range walkable tiles were
    reachable from only some gates, and a worst-case *continuous* approach of
    exactly 3.500000 against `nearestStructureWithin`'s strict
    `d < range * range` (so the strict inequality never bites, which a
    centre-to-centre 4.0 would have made load-bearing). Clause 2 exact over the
    same 120701 seeds and again across 9 extreme configs x radii {0,1,4,36},
    including configs at 100% fallback and `maxAttempts: 64`: identical attempts
    and fallback counts at every radius. 28 hostile `/data` values (including a
    *missing* key) all correctly accepted or refused, worst accepted setting
    47 ms per 200 seeds. Determinism across fresh processes, no buffer aliasing,
    no cross-config bleed. Every number in the shipped comments re-derived and
    correct.
  - **Two things QA checked and deliberately did not file.** A player can wall
    the contesting tiles with their own towers and re-create an uncontestable
    plot — out of scope, since `towers.ts:104` already records that SPEC-FINAL
    §10 allows sealing the Core outright. And the `SPAN` cap is loose in the
    harmless direction (max interior-to-gate distance is 18.028, so radii 19-36
    demote nothing) while the *dangerous* direction is small and unbounded:
    `highContestRadius: 1` demotes ~20% of all high ground. Defensible as
    designer intent — the field's whole point is the shortest attack range — so
    recorded here rather than capped.
  - **Tree discipline held this time.** QA confined scratch to `.qa-fb064m/`
    (matched by the `.qa-*/` ignore rule), restored each mutated source inside
    the same command that mutated it, and verified byte-identical afterwards.
    The one anomaly it reported was this session writing `BACKLOG-TERRAIN.md`
    mid-pass, which is expected. The explicit brief that bought this is worth
    reusing verbatim, as is fb064i's.

- (2026-09-04, fb064m) Verification. `tests/terrain-high-contest.test.ts` is
  13 tests, ~2.3 s; the nine `tests/terrain*` files are 206 tests (fast tier).
  `npx tsc --noEmit` clean. `npm run sim -- --seed 1 --policy hybrid` gives
  `endHash 2729a000`, matching the baseline recorded by fb064b/h/i/k, and QA
  additionally ran seeds 2/7/42 x maxbuild/hybrid to victory and 102
  save/replay/content-hash/death-flow tests green. `generateTerrain` and
  `applyTerrain` still have no caller outside `src/sim/terrain/`, and
  `data/terrain.json` is still absent from `TUNER_FILES` and from
  `contentHash()`, so nothing in this change can reach or move a stored run.
  `npm run test:fast` on the final tree: **2266 passed, 10 failed across 7
  files**, the documented pre-existing set only — `b032`/`b034`/`b035`/`b036`
  are the load-sensitive UI-fold suites (`b036` is the deterministic
  1095.4-vs-1080 UI-lane failure), `q15` is the 4000 ms-settle command fuzz, and
  `q49`/`q52` are the Windows EPERM cleanups under `bench/.tmp`. All nine
  `tests/terrain*` suites are green in that run. The set is not identical
  run-to-run — `b035` failed here and not in this session's earlier run, `q45`
  the other way about — which is the load sensitivity already recorded, not a
  new signal; the invariant across all three runs of this session is that
  nothing in terrain, grid, enemies or pathing fails.

- (2026-09-04, fb064n) The flat arena got a name. `flatTerrain()` in
  `src/sim/terrain/generate.ts`, built by one private `flatKinds()` (the
  renamed `blankKinds`) through one `flatMap(requestedSeed, seed, attempts)`;
  `generateTerrain`'s `maxAttempts` fallback routes through the same builder,
  so the base every attempt scatters over, the downgrade map and the Training
  Grounds map are one construction instead of three.
  `tests/terrain-flat.test.ts` is 14 tests, ~130 ms.
  - **Provenance.** `attempts: 0, fallback: true, requestedSeed: 0, seed: 0`.
    `fallback` was already `types.ts`'s marker for "no key produced these
    tiles"; `attempts: 0` is the honest count and is what tells the two flat
    maps apart, since `maxAttempts` is a positive int and the downgrade path
    therefore always reports >= 1. Because that overloads one boolean, the
    module now exports `isDegradedMap(map) = fallback && attempts > 0` so
    fb064f does not re-derive the two-field rule — code-reviewer's Major, and
    the reason `types.ts`'s `attempts`/`fallback`/`requestedSeed` docs were
    rewritten in this item. `requestedSeed: 0` is a placeholder, not a claim:
    the doc now says to check `attempts` before comparing it to
    `RunConfig.seed`, which would otherwise match on exactly the runs seeded 0.
  - **Two QA bugs, both created by this item's own parser change and both
    fixed inside it with regression tests.** Widening `parseTerrainDump`'s
    `attempts` floor from 1 to 0 (needed, or `flatTerrain()`'s own dump would
    not reload) removed the only constraint on the field, so
    `attempts=0 fallback=false` and a forged `effective` both parsed clean — a
    shape no writer can emit, and specifically the one field fb064n had just
    made load-bearing. Fixed with a cross-field check. Separately `attempts=-0`
    became acceptable; `num()` had been *normalising* `-0` since fb064j, three
    lines below its own "a dump has exactly one spelling per value" rule, which
    cost text-stability — a dump reloaded and re-dumped as a different string.
    Now refused. fb064j's test was converted rather than dropped: it asserts
    the same invariant (no parse hands back a `-0`) against the stronger
    behaviour, with the reversal and its reason written into it.
  - **Acceptance deviation** (`flatTerrain()` vs `flatTerrain(cfg)`) is
    amended into the item text above rather than left in a code comment.
  - **QA observation filed as fb064s**, not fixed here: the flat map's dump
    prints `requested=0` and a reader who pastes it into `--seed 0` gets a
    different map.

- (2026-09-04, fb064n) Verification. `npx tsc --noEmit` clean. All nine
  `tests/terrain*` suites green (220 tests, ~6 s). `npm run sim -- --seed 1
  --policy hybrid` gives `endHash 2729a000`, still matching the baseline from
  fb064b/h/i/k/m. `generateTerrain`, `flatTerrain` and `applyTerrain` have no
  caller outside `src/sim/terrain/` and the terrain tests — `grep` for
  `sim/terrain` in `src/`/`tools/` finds only two doc comments in `grid.ts` —
  so nothing in this change can reach a stored run, and `data/terrain.json` is
  still absent from `contentHash()` (merge blocker unchanged).
  `npm run test:fast`: **2282 passed, 8 failed across 6 files**, all the
  documented pre-existing set — `b032`/`b034`/`b036` load-sensitive UI-fold,
  `q15` the 4000 ms-settle command fuzz, `q49`/`q52` the Windows EPERM cleanups
  under `bench/.tmp`. A **control run at the pre-change commit `05b4f8e`
  failed 7 across 5 files** from the same families, and every extra observed
  across the three runs of this session (`b034`, `b035`, `q45`) passes in
  isolation and has no import path to terrain. That the set is not identical
  run-to-run is the load sensitivity fb064m already recorded, not a new signal.

- (2026-09-04, fb064o) **The premise was right, and the 500-seed window hid
  it.** `walkableFrac` and friends bound area; nothing bounded travel. Over
  seeds 1..500 the spread looks benign (worst gate detour 1.59) — but that is
  not the domain fb064j established a run draws from. Sampled across the whole
  int32/uint32 range including negatives, terrain could hand one gate a
  **4.36x** walk: seed `3220035238`, 410 path units against the flat arena's
  118 for that same gate, i.e. an east-gate wave arriving in its own time zone
  (second witness `-616759904` at 3.45). So the item took its "add a
  generation constraint" branch rather than its "accept the spread" branch.
  Same lesson as fb064a's QA pass and fb064r's item text, found the same way —
  this time applied *before* the ledger was written rather than after.
  - **The banded quantity is a ratio, not a cost.** `maxGateDetour` is the
    worst gate's real path cost over the *obstacle-free* octile cost of the
    same walk. A raw gate-to-Core cost is decided jointly by terrain and by
    where the Core ends up, and the Core is the player's to place (fb064c), so
    banding it would refuse seeds for a choice the generator does not make.
    Dividing the Core's contribution out leaves a pure terrain property — and
    it gives the flat arena, the map every wave was actually tuned on, a
    baseline of exactly `1.000000` on every gate.
  - **The metric is `Grid`'s, not `analyze.ts`'s.** `analyze.ts` is
    4-connected because that can never be optimistic about *reachability*; the
    same conservatism is wrong for a *length*, since it pays two orthogonal
    steps per real diagonal — and by a different factor on the almost-all-
    diagonal flat baseline than on a rocky seed, which would corrupt the ratio
    itself. `src/sim/terrain/path.ts` mirrors `Grid.dijkstra` instead
    (8-connected, 10/14, no corner cutting), and "mirrors" is checked
    tile-for-tile against a real `Grid` over generated maps rather than
    asserted in a comment.
  - **Shipped `maxGateDetour: 1.5`, and its price is recorded.** Over 20000
    domain-spread seeds it rejects 0.225% of attempts; in 1..500 exactly one
    seed (463) is newly sent to a retry; no seed anywhere ships the flat
    fallback. Golden hashes for 1/2/42/1000 unchanged; `npm run sim -- --seed 1
    --policy hybrid` still `endHash 2729a000`. QA proved the no-fallback claim
    structurally rather than by sampling: over 140,001 *contiguous* keys the
    band's longest run of consecutive rejections is 2, and a fallback needs 8.
  - **Headroom is provably untouched, not just measured untouched.** Band-on
    legality implies band-off legality, so the shipped-map set only shrinks and
    every other band's minimum can only rise. Measured identical old-vs-new
    over 3000 seeds, and fb064r's two witnesses are byte-identical to HEAD
    (seed 2005486180 hash `7c0d939c`, walkable 0.600000; seed 2454233399 hash
    `b88a82e4`, buildableNormal 0.450000) — both still legal, attempts 1, not
    fallback.
  - **Layering.** `suggestCoreAnchor` (+ `ROOM_RADIUS`, `isNormalFootprint`,
    `buildRoom`) moved from `core-placement.ts` into `analyze.ts` byte for
    byte, and is re-exported so every caller and `index.ts` are unchanged. The
    band is measured to the suggested anchor, so `measureTerrain` has to call
    it, and `core-placement.ts` imports `analyze.ts` — the other direction is a
    cycle. `path.ts` re-derives its own gate indices for the same reason.

- (2026-09-04, fb064o) Review and QA. code-reviewer returned REQUEST-CHANGES
  on one Major; qa-playtester returned PASS with two Majors and three Minors.
  Every finding was reproduced before being acted on, and all are fixed here.
  - **Major (review): `ROOM_RADIUS` silently became load-bearing.** Its
    architecture-rule-4 exemption rested entirely on the clause "it cannot make
    a map legal or illegal — every value picks some member of a set
    `legalCoreAnchors` already validated". This item falsified that clause:
    `terrainLegal` now reads a detour measured *to the anchor that tie-break
    picks*. Witness, reproduced: **seed 1326**, whose two front-runners 421 and
    277 are equidistant from `CORE_X/CORE_Y` (both `dist^2 = 4`), so the room
    key alone separates them — 421 measures 1.1304 and ships, 277 measures
    1.6508 and is refused. At radius 1 that seed plays a different map. Over
    seeds 1..3000, radius 1 moves the anchor on 95 seeds and flips legality on
    that one. The doc now states what the constant is, the witness is pinned in
    `tests/terrain-approach.test.ts` (red at radius 1 — the golden table in
    `terrain-core-placement.test.ts` does not cover it, per its own comment
    that radius 1 moves *zero* rows there), and the `/data` exemption is
    **re-opened for the merge**: the constant is now exactly the tuning band
    the exemption said it was not. This is CLAUDE.md's "when a field's range
    changes, grep its readers, not just its writers", and the item had missed
    it.
  - **Major (QA): the ledger recorded only the treated numbers.** The test
    file's own header promised a pre-band control that was not in it, so a
    reader saw "the worst approach 500 seeds hand you is 1.339" when the
    untreated answer is 1.590, with a `gateMean` ceiling 18 units (10%) low.
    `LEDGER_500_PRE` now records the same 500 seeds against `NO_BAND` and the
    diff is asserted. CLAUDE.md's control-run rule, broken by this item and now
    kept.
  - **Major (QA) / Minor (review): "exactly 1 is payable" rested on one
    cherry-picked seed** — seed 7, the ledger's own minimum. Measured: at
    `maxGateDetour: 1`, 19/200 seeds ship the flat fallback (QA over 1500
    seeds: 9.80%); at 1.1, 1/200; at the shipped 1.5, zero. `1` is still
    accepted — fb064g's precedent is that a false rejection is worse than a
    flagged fallback, and 1 is genuinely reachable — but the cost is asserted
    rather than implied away, and it shows the shipped 1.5 sitting clear of a
    cliff at ~1.1.
  - **Minor (both): the band bounds the suggested anchor only.** That is what
    the acceptance asked for, but fb064c makes the Core player-placed. Over
    seeds 1..120 of shipped, band-passing maps, **104 of 120 admit a legal Core
    position above 1.5**; the worst-over-all-anchors detour averages 2.196
    against 1.099 at the suggested anchor, worst 4.969 (seed 115, anchor tile
    24,1). Inert today — nothing places a Core — but recorded in
    `maxGateDetour`'s doc and pinned by a test, so fb064c/fb064h inherit the
    number rather than the surprise.
  - **Minor (QA): the `-1` sentinel is not the no-op the comment claimed.** At
    `minCoreLegalFrac: 0` — schema-legal, and a field fb064f hands to a live
    Tuner — an anchor-less map used to ship (67/300 seeds at
    `coreGateClearance: 14`). It is now refused: at clearance 14 the generator
    retries and always finds an anchor (0/300 fallbacks); at clearance 16 it
    cannot, and 36/300 ship the flagged flat arena. Better behaviour — a map no
    Core can be placed on is a map the run cannot play — but the price is in
    the comment now instead of a claim that it changes nothing.
  - **Minor (review): the partial-reachability case defeated its own
    sentinel.** With two of three gates walled off, `min`/`max` were real
    numbers over the surviving subset and `spread` was `0`, which reads as
    "perfectly even gates". All four summaries are now `-1` unless every gate
    reached; the per-gate row keeps the detail.
  - Also fixed: `freeApproachCost` could return `Infinity` (empty footprint),
    which `maxGateDetour`'s `free > 0` guard waved through into a ratio of 0 —
    below the `>= 1` invariant `types.ts` states; the guard is now
    `!Number.isFinite(free) || free <= 0`. `approachField` throws rather than
    returning a silently truncated field if its cost bound is ever exceeded
    (`grid.ts` abandoned this exact counting loop when breach pricing broke the
    same bound). The corner-cutting test asserts exact costs — 14 open, 60
    pinched — instead of "more than 14", which a 4-connected implementation
    also passes. The `-1` sentinel is round-tripped through
    `describeTerrain`/`parseTerrainDump`. QA's free witness is pinned: seed
    `4254486667` measures exactly 1.500000 and ships, so the band's inclusive
    `<=` is tested on real generator output and not only on a hand-mutated
    `TerrainMeasure`.
  - **Not fixed, by decision:** `measureTerrain` is ~2x slower (0.30 -> 0.56 ms
    per map; `generateTerrain` +37%), because it now runs a flood and an anchor
    pick per attempt. Generation runs once per run and terrain has no
    production caller yet, so the only real cost is ~2 s of test wall-clock.
    Recorded rather than optimised.

- (2026-09-04, fb064o) Out-of-scope needs, for the merge:
  - **`ROOM_RADIUS`'s `/data` exemption is re-opened** (see above). Resolving
    it means either moving the constant into `data/terrain.json` *after*
    `contentHash()` covers that file, or writing down why a legality-affecting
    constant stays in code. Main-lane, gated on fb064b's blocker.
  - **The approach band does not survive the Core becoming player-placed.**
    fb064c should either validate a placement's detour or accept the 4.969
    worst case knowingly; the number is above.
  - **SPEC-FINAL §10.5** must describe the approach band when it is written at
    the merge, alongside the bands fb064a listed.

- (2026-09-04, fb064o) Verification. `npx tsc --noEmit` clean. All ten
  `tests/terrain*` suites green (**233 tests**, ~20 s; `terrain-approach` is 13
  tests / ~9 s and stays in the fast tier). `npm run sim -- --seed 1 --policy
  hybrid` gives `endHash 2729a000`, unchanged since fb064b. Nothing outside
  `src/sim/terrain/` imports the module, so no run can reach this change.
  `npm run test:fast`: 8 failed across 6 files, and a **control run with this
  item's work stashed failed the same families** (7 across 5 files) — the
  documented pre-existing set: `b032`/`b034`/`b035` load-sensitive UI-fold,
  `q13` load-sensitive, `q15`'s 4000 ms settle deadline, `q49`/`q52` Windows
  `EPERM` under `bench/.tmp`. `b036-help-fold` is the one that is deterministic
  in isolation (`.sw-help` bottom 1095.4 against the 1080 fold); QA
  independently reproduced it at HEAD `67ffc6f` in a detached worktree, so it
  predates this lane entirely — **UI-lane work, still unfiled against
  BACKLOG-UI.md**.

- (2026-09-04, fb064p) `verifyTerrainMap` — the immutability ask has a
  detector. `types.ts` had asked callers to treat a generated map as immutable
  and nothing enforced *or detected* it, so `map.kind[i] = k` (which
  type-checks, because `readonly` freezes the binding and not the buffer) left
  the map advertising the hash of tiles it no longer had — and that hash is the
  G2 handle. Cannot be enforced (a typed array cannot be frozen and stay
  useful, and copying per read costs 720 bytes in the sim's hot path), so the
  corruption is made *findable* instead: 7.7 us per call, 0.3% of one
  `generateTerrain`, cheap enough to assert at a run boundary.
  - **Four checks, cause-first**, because `terrainHash` folds values the map
    also stores separately, so a field can be corrupted into a lie that still
    hashes clean: `dimensions` (the hash folds `GRID_W`/`GRID_H`, not the map's
    `w`/`h`), `kind-length`, `seed-range` (the hash folds `seed | 0`), then
    `hash`. Deliberately *not* checked, and now named in the doc block:
    `requestedSeed`, the `attempts`/`fallback` provenance pair, tile kinds
    against `/data` (`terrainOverlay` is the config-aware gate), and legality.
  - **Two bugs found by review and QA independently, both fixed here**, each
    with its failing regression test written first:
    - *seed corruption invisible to `| 0`.* `terrainHash` folds `h.int(seed |
      0)`, so `seed + 2 ** 32`, `7.9`, `NaN`, `Infinity` and `2 ** 53` all
      verified clean while naming a key `generateTerrain` refuses outright
      (fb064j). The `| 0` also pre-empts `Hasher.int`'s non-finite tagging,
      which `src/sim/hash.ts` added so a corrupted run cannot hash clean. QA's
      60,000-iteration ground-truth fuzz put the scale at **4,126 misses of
      48,392 corruptions, 100% of them this one class** — and 0 false alarms on
      11,608 intact maps. Fixed verifier-side as a `seed-range` fault; dropping
      the `| 0` from `terrainHash` would have moved every recorded hash golden.
    - *test gap on the dimensions check.* QA's mutant weakening
      `w !== GRID_W || h !== GRID_H` to `w * h !== GRID_W * GRID_H` **survived
      the whole file** — both dimension cases (703 and 9 tiles) differ from 720,
      so neither distinguished shape from area. Now pinned by a transposed
      (`20x36`) and a stretched (`72x10`) map: exactly 720 tiles, correct hash,
      still not this arena.
  - **Mutation coverage re-measured after the fixes:** M7 (product-not-shape),
    M10 (drop the seed guard), M11 (seed guard integer-only) and M1 (always-ok)
    are all killed; QA's earlier M2-M6 were already killed. `generate.ts`
    restored byte-identical after every mutation.
  - **Also folded in from review:** the `expected`/`actual` field docs were
    written for the `hash` fault and read backwards for the structural ones
    (the map's claim lands in `actual` there, not `expected`); the 100-seed
    sweep now proves itself non-degenerate (0 fallbacks, 99 distinct hashes —
    99 not 100 because `-1` and `MAX_TERRAIN_SEED` are one uint32 key by
    design), since a generation regression to the flat arena would otherwise
    keep it green on 100 identical maps; `DOMAIN_SEEDS` got an iteration cap so
    a degenerate stride fails red instead of hanging; `flip` became
    `flipInPlace` returning `void`, since it read functional while mutating.
  - **Known limits, accepted rather than missed** (QA bugs 3 and 4): a
    relabelled `attempts`/`fallback` verifies clean and then `isDegradedMap`
    lies — documented in the not-checked list and pinned by a stated-limit test
    rather than fixed, because verification is a question about the *tiles*;
    and `kind: null`/`undefined` throws a `TypeError` rather than returning a
    fault, which is unreachable through the `TerrainMap` type (the shape a JSON
    save/replay actually produces — `kind` as a plain object — is handled, and
    reports `kind-length`). Won't-fix unless a caller arrives that needs it.
  - **Out-of-scope need for the merge:** `verifyTerrainMap` has no production
    caller yet — nothing outside `src/sim/terrain/**` imports the module at all
    (QA confirmed by grep). Its intended call sites are **fb064c's Core-placement
    replay guard** and the `RunConfig` content-hash check in `src/sim/content.ts`
    (architecture rule 2), both outside this lane. Whoever wires terrain into
    `World` should assert it at the run boundary; until then it is an exported
    detector with test callers only. `describe.ts` re-derives the same hash rule
    for dump parsing — different input, not worth unifying, but the two must
    stay in step.
  - **Verification.** Targeted: `tests/terrain-verify.test.ts` **18 tests**;
    all 11 `tests/terrain*` files **251 tests green**. `npx tsc --noEmit` clean
    (the repo has no linter configured). `git diff --stat` on the three source
    files is **+134 / -0**, purely additive, so no generation behaviour or hash
    golden can have moved — QA independently confirmed `npm run sim -- --seed 1
    --policy hybrid` still gives `endHash 2729a000` and the money paths
    (`meta`, `b10-death-flow`, `b003-stash-ux`, `hub-testing`,
    `p3d-cycle-machine`, `q8-save-roundtrip`, `t6c-save-migration`) are 77/77.
    `npm run test:fast`: **2313 passed, 8 failed**, the documented pre-existing
    set only — `b032`/`b034` and `q15` load-sensitive, `b036` the deterministic
    1095.4-vs-1080 UI-lane failure, `q45`/`q49`/`q52` the Windows EPERM
    scratch-dir cleanups. Nothing in terrain, and no file in that set imports
    anything this item touched.

- (2026-09-04, fb064q) The character/terrain passage rule, and the veto that
  was already decided in code.
  - **What shipped.** `tiles[].blocksCharacter` in `data/terrain.json`
    (`normal` false, `rough` false, `rock` true, `high` true), required under
    `.strict()` so a dropped field fails loudly rather than silently picking a
    side; `blocksCharacter(cfg, kind)` beside `isWalkable`/`isBuildable`/
    `isHighGround`; `src/sim/terrain/character.ts` with `canCharacterEnterKind`
    / `canCharacterEnter`, pure and total, beside the high-ground table; a
    `charBlock` mask through `terrainOverlay` into `Grid`; and `wardenPassable`
    reading it and nothing else.
  - **The finding this item was actually about.** It was filed as "no artifact
    exists for the rock clause". The stronger truth is that **the answer
    already existed and was invisible**: fb064b routed `wardenPassable` through
    `terrainBlock` (`!walkable`), so rock and high ground stop the Warden, with
    the reasoning — a Warden dashing through a mountain is a hole, one parked
    on high ground is unreachable by every ground melee enemy at once — in a
    code comment. That is the *vetoed* reading of a clause whose authored
    default is pass-through. The flag is now the record, and it is live rather
    than decorative.
  - **`high: true` is an extension the owner's clause never spoke to.** The
    rock clause is about rock. fb064b also blocks the Warden on high ground and
    the flag preserves that; flagged here so the owner can veto it separately,
    and it is a second one-line edit if so.
  - **Out-of-scope call sites for the merge** (acceptance clause 5). Every
    *tile test* already routes through `Grid.wardenPassable`, so the flag
    reaches them for free: `src/sim/run.ts:563` (`walkable`, used by
    `moveWarden`) and `src/sim/wardenmove.ts:28,32` (`resolveDashTarget`'s
    endpoint and its backwards walk). What does **not** route through it, and
    is what the merge must look at:
    - **`src/sim/run.ts:666`** — the Act I reform writes `wd.x = c.x - 2;
      wd.y = c.y` with no legality check. Two tiles west of the Core centre is
      ordinary scatter ground, so a reformed Warden can land inside rock.
      Should consult `wardenPassable` (or a nearest-legal walk) once terrain is
      wired.
    - **`src/sim/sundering.ts:21`** — `w.warden.x = c.x; w.warden.y = c.y`.
      Safe by construction today (Core tiles are structural, and both
      `syncTerrain` and `wardenPassable`'s live structural term keep them
      passable), but it is an unchecked placement and fb064c moves the Core.
    - **`src/sim/wardenmove.ts:56-61`** — `tickDashTravel` lerps the Warden
      along the dash line and only the *endpoint* was ever checked, so a dash
      passes through a mountain even when it cannot end in one. Pre-existing
      and unchanged by this item; a main-lane decision (sample the line, or
      accept it as the dash's character) once terrain is live.
    - **`src/render/canvas.ts`** and the fb064f Tuner page — a cursor or
      preview that wants "may the character go here" should use
      `canCharacterEnter`, whose two documented divergences from
      `wardenPassable` (structural tiles, off-board) are pinned by test.
    - **QUESTIONS.md** — this amendment and the `high: true` extension fold in
      at the merge, with the rest of the lane's decisions.
  - **Three defects found in review/QA and fixed red-first**, all in the
    integration file:
    - *(Major) the refactor was not behaviour-preserving.* Swapping
      `staticBlocked(i) === 0` for `terrainCharBlock[i] === 0` looks equivalent
      and is not: `staticBlocked` re-decided the structural term off the
      **live** `tile` array on every call, while `terrainCharBlock` is a
      snapshot `syncTerrain` takes once — and `syncTerrain` `continue`s on
      `Border`, so a border tile keeps its raw value.
      `src/sim/world.ts:441-447`'s Fourth Gate modifier writes
      `tile[idx(12, 19)] = Gate` *after* the Grid exists and calls only
      `markDirty()`/`refresh()`, which rebuild `blocked` and never the terrain
      arrays. The generator paints the whole border rock and protects only the
      three `GATES` tiles, so the Warden was walled out of a gate every enemy
      walked through (`blocked=0, passable=true, wardenPassable=false`;
      reproduced on seeds 1, 2, 3, 7, 11, 4242). Fixed by keeping the
      structural decision live (`if (t !== TileType.Open) return true`) and
      pinned in the test slot that already existed for this exact scenario —
      verified red without the fix, green with it.
    - *(Major) `canCharacterEnter` silently disagreed with `wardenPassable`.*
      QA measured **17 interior tiles over 60 seeds** where the map-side
      predicate says "blocked" and the Grid says "passable" — every one the
      Core's 2x2 standing on rock or high ground (seed 2 at (26,9)/(26,10),
      seed 9 at (25,9)/(26,9)/(25,10)/(26,10)). The doc advertised the
      predicate for "the renderer's cursor, a Tuner preview" with no warning,
      so a mover adopting it would have drawn a wall across the Core. Both
      divergences (structural tiles; off-board, where the two are opposite by
      design) are now named in the module doc and a test asserts every
      divergence is one of the two — re-measured after the fix: still 17, all
      structural, all classified.
    - *(Minor, QA bug 2)* an overlay built before the fifth mask reached
      `applyTerrain` with `charBlock: undefined` and died on `TypeError:
      Cannot read properties of undefined (reading 'length')`, naming neither
      the mask nor `applyTerrain` — the one mask exempt from a method whose
      whole design is loud refusal at the boundary. The guard now names each
      mask (`overlay has no charBlock mask`, `walkable mask length 3`).
  - **"Behaviour is unchanged" was proved, not asserted.** QA reconstructed the
    pre-change rule exactly and diffed it against the new `wardenPassable` over
    every tile plus the out-of-bounds ring, on **60 generated seeds in five
    grid states** — plain applied, after the Fourth Gate opens post-hoc, after
    `placeCore` relocates the Core, after `setOcc` places 12 structures
    (including on high ground), and on a never-terrained Grid. **Zero
    divergences.** Occupancy never mattered: `staticBlocked` ignored `occ` and
    the new expression still does.
  - **The flag leaks into nothing measured.** Under a hostile config with
    `rough`+`rock`+`high` all blocking, `generateTerrain(...).hash`,
    `terrainHash`, the full `kind` buffer, `measureTerrain` and
    `describeTerrain` are byte-identical to the shipped config on seeds
    `1, 55, 262, 1326, 7957, -12345, 2005486180`. `data/terrain.json` is not in
    `ContentRaw`, so `contentHash` cannot move either.
  - **Deliberately not guarded, so the merge does not read "the loader
    validated it" as "balance approved it"** (QA observation 4):
    `rough: true, rock: false, high: false` loads happily and hands the Warden
    a permanent perch on high ground no ground melee enemy can reach — the
    exact Act I safe spot the `wardenPassable` comment warns about. That is the
    owner's call, and the loader refuses only what is provably unpayable
    (`normal` blocking the character leaves it nowhere to stand). Relatedly
    (QA observation 2): under the shipped config the character-legal region is
    a **single connected component on all 500 seeds tested** and always holds
    the default Core tile, but with `rough`+`rock`+`high` all blocking it
    splits into up to **18 components** (worst: seed 225, 91 tiles outside the
    largest). If the veto is ever exercised in the blocking direction, a
    `characterRegionConnected` band belongs next to `corridorsOk`.
    `resolveDashTarget`'s backwards walk terminates in every case (bounded
    9-step loop, then returns the Warden's own position) — QA found no hang.
  - **Verification.** Targeted: `tests/terrain-character.test.ts` **12 tests**
    (red first — the loader, predicate and grid clauses all failed before the
    implementation); all 15 `tests/terrain*` files plus `grid`, `act1` and
    `architecture` **313 tests green**. `npx tsc --noEmit` clean.
    `npm run build` ok. `npm run sim -- --seed 1 --policy hybrid` still
    `endHash 2729a000` with 0 leaks; `tools/sweep.ts --seeds 6` unchanged
    (win 1 / win 1); QA's money paths 89/89. `npm run test:fast`: the
    documented pre-existing set only — `b032`/`b034`/`q15`/`q45`/`q49`/`q52`
    load-sensitive or Windows `EPERM` scratch-dir, and `b036` the deterministic
    1095.40625-vs-1080 UI-lane failure, **which I confirmed fails identically
    at baseline HEAD** rather than inheriting the claim.
