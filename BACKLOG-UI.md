# BACKLOG-UI.md — lane: ui (branch `lane/ui`)

Split out of BACKLOG.md on 2026-09-03; ids unchanged. Same item format,
working rules, verification tier (targeted tests + `npm run test:fast`) and
loop-mode contract as BACKLOG.md, plus CLAUDE.md's lane rule: up to TWO
items per iteration when both are small ([bug]/[polish] or data-only).
Everything touching shared sim core (balance orders, dash, density,
pathing, damage rules) belongs in BACKLOG.md, not here.

## Scope (hard boundary)

May create/edit ONLY:
- `src/ui/**`
- `src/render/**`
- `tests/ui*`
- `tests/render*`
- this file

Read anything. Everything else is read-only: an out-of-scope need is
written into this file (a new dated Queue subsection) and becomes
main-lane (or other-lane) work at the merge — never edited from this lane.

Architecture rule 3 still binds: the renderer reads sim state only. An
item needing new sim-side state, a new Command, or a sim-exposed event
stream (e.g. fb060's per-enemy per-type DoT aggregation, if the sim does
not already expose it) logs that need below instead of reaching into
`src/sim/**`.

## Queue

> **Completed work has moved.** Done items and fully-closed historical
> sections now live in `docs/BACKLOG-DONE.md` (append-only, one section per
> backlog file, in original order). Read it when an item references old
> history; day-to-day work only needs the open items below plus the last 10
> completions. `tools/status.ts`'s feedback ledger reads the archive too, so
> nothing drops off STATUS.md's ledger.

### Actionable in this lane

- [x] (fb181) [polish] **DONE 2026-09-07.** token economy (fb178, main lane):
      this file was well past the 400-line budget fb178 set for live backlog
      files. 74 of 75 `[x]` items from the Queue (`fb157`-`fb176` plus earlier
      ids back to `fb058`/`fb060`, all Done or one WON'T-FIX) plus the entire
      `## Log` section moved verbatim, in original order, to
      `docs/BACKLOG-DONE.md` under a new `## BACKLOG-UI.md` heading — the same
      treatment fb178 itself gave `BACKLOG.md` and fb180 gave
      `BACKLOG-CONTENT.md`. Kept live, full text unchanged: the `## Scope`
      section (one stale cross-reference to "the Log" updated to match the
      other lane files' post-trim wording); the two still-blocked items
      (`fb167`, blocked on `BACKLOG-TERRAIN.md` `fb166`; `fb160`, blocked on
      new main-lane sim state) under a new `### Blocked out of Scope` heading;
      the four still-open actionable items (`fb093`, `fb097`, `fb151`,
      `fb174`) under a new `### Actionable in this lane` heading, this item
      first (`fb085` also starts there, then moves to `### Blocked out of
      Scope` in the very next item below, once its own acceptance line
      turns out to need a `data/strings.json` this lane can't create); a
      new `### Recently completed` list of the last 10
      other done ids (`fb096`, `fb117`, `fb177`, `fb169`-`fb173`, `fb175`,
      `fb176`) as one-liners. **One exception, found by running
      `npx vitest run tests/fb038-status.test.ts` after the first pass (it
      reddened one case):** `fb055` stays live under a new
      `### Kept live (cross-lane test dependency)` heading with an
      explanatory note, rather than archiving — that test (main-lane Scope,
      not editable here) hard-codes `fb055`'s feedback citation resolving to
      `BACKLOG-UI.md`, and `tools/status.ts`'s own `feedbackLedger` gives an
      archived item no lane tag by design, so archiving `fb055` reddened it.
      `tools/status.ts`'s `backlogPaths()` already reads
      `docs/BACKLOG-DONE.md` (fb178), so every *other* feedback-ledger
      citation for an id now living in the archive still resolves the same
      way it did live. File drops from 5449 to well under 400 lines. No
      `/src` or `/data` change — refs: feedback/feature-token-economy.md,
      BACKLOG.md fb178.

- [x] (fb167) [feat] **DONE 2026-09-15.** the camera half of the owner's
      bigger-map order (BACKLOG.md `fb153b` item 2) — unblocked this session
      once BACKLOG-TERRAIN.md `fb166` (the 36x20->56x32 grid flip) merged.
      `Renderer` (`src/render/canvas.ts`) now carries a camera that follows
      the Warden inside a zoomed-in window of the board instead of always
      showing the whole 56x32 grid, clamped so it never shows past a map edge
      and zoom-limited to a 16-40 tile readability band (`computeCameraViewTiles`;
      never more tiles than the board itself). Design choice logged in that
      function's own doc comment rather than QUESTIONS.md (out of this lane's
      Scope): the spec text gives no zoom-control input, so "zoom limits"
      reads as readability bounds the camera settles on for the current
      window size, not a player-adjustable lever. Fully backward-compatible
      by construction: `Renderer.update()` gained an optional third `World`
      param and the camera only activates the first time it's called with
      one, defaulting to the old whole-board view otherwise — verified by
      hand and by qa-playtester that none of the ~25 other tests that
      construct a `Renderer` directly (most outside this lane's Scope) ever
      call `update()` with a `World`, so their rendered geometry is untouched.
      `src/ui/input.ts`'s `pointerToTile` now takes an optional camera-rect
      param (`CanvasBinding.camera`, wired from `main.ts`'s
      `renderer.cameraViewRect()`) so click-to-tile un-projects through the
      camera instead of assuming the whole board is on screen;
      `src/ui/audit-hook.ts`'s dev-only `worldToScreen` got the same fix
      on the same reasoning, since it shared the "no camera scroll" assumption
      its own doc comment named. `src/ui/style.css`'s `aspect-ratio` (36/20,
      stale since fb166) and several other stale `36:20`/`1152x640` comments
      across `canvas.ts`/`style.css`/`hud.ts`/`render-fb065-stage-fill.test.ts`
      fixed alongside. code-reviewer's one Major finding (the p10h TD<->VS
      transition sweep still traveled across the whole board's pixel extent
      rather than the camera's visible window, which would have read as a
      near-instant flash or a wipe that barely crosses the screen depending
      on where the Warden stood) fixed before commit — `drawPhaseSweep` now
      travels across `camera.viewTilesW`, not `this.width`. qa-playtester
      verdict PASS: all five acceptance clauses hold with evidence (spun up
      `tests/render-fb167-camera.test.ts`, 11 cases: follow, both edge
      clamps, both zoom limits, both reducedMotion branches); one new bug
      found and filed below (fb168) rather than fixed here, since it's
      cosmetic-only and out of this item's own acceptance. **Two of the five
      geometry suites the item was originally filed against —
      `tests/class-board.test.ts` and `tests/class-board-windows.test.ts` —
      do NOT match this lane's Scope glob (`tests/ui*`/`tests/render*`) and
      were left red, exactly as already logged by BACKLOG-TERRAIN.md's own
      `fb166` entry (its "UI lane" list, which is a looser description than
      this lane's actual hard Scope boundary); the four that ARE in Scope
      (`tests/ui-input`, `tests/ui-fb082-overlay-geometry`,
      `tests/ui-fb106-extreme-aspect-geometry`,
      `tests/ui-fb102-bossbar-rail-overlap`) are green.** `npx tsc --noEmit`
      clean; `npm run test:fast`: 27 failures, all pre-existing (matching
      BACKLOG-TERRAIN.md fb166's own logged 40-failure/13-file list from the
      grid resize — `grid.test.ts`, `p1a-sealing`, `p8d-boss-termination`,
      `fb077-terrain-wiring`, `t2-selection`, `class-board`/
      `class-board-windows`, none newly broken by this item) — refs:
      SPEC-FINAL §11, BACKLOG.md fb153b, BACKLOG-TERRAIN.md fb166.

- [x] (fb168) [bug] **DONE 2026-09-15.** qa-playtester (fb167 verification):
      the camera eased toward the Warden instead of snapping when
      `finishSundering()` (`src/sim/sundering.ts`) teleports the Warden to
      the Core on the TD->VS transition. Fixed by a new `cameraSnapPending`
      flag (`src/render/canvas.ts`): `ingest()`'s existing `'sunder'` case
      (already handled for screen shake) now also sets it; `update()`'s
      camera block treats it as a third snap trigger alongside first
      activation and `reducedMotion`, clearing it once consumed. Checked
      `src/sim/sundering.ts` for any other Warden-teleporting transition that
      should set the same flag — only `finishSundering` ever moves the
      Warden (`advanceToNextBlock`, the VS->TD reverse boundary, doesn't), so
      no second site was missed. Two new cases in
      `tests/render-fb167-camera.test.ts` (`fb168: the camera snaps on a
      Sundering teleport...`): one proving the fix (camera lands exactly on
      the post-teleport, edge-clamp-aware target after one ordinary
      `update()`), one a counter-proof that the same assertion fails without
      `ingest()` ever seeing the `'sunder'` event, so the first test isn't
      vacuous. code-reviewer APPROVE, no Critical/Major findings (traced the
      fast-forward tick-batch-vs-once-per-frame `ingest()`/`update()` timing
      for a stuck-flag/double-consumption hazard — none found, since JS is
      single-threaded and `update()` always runs after that frame's
      `ingest()` calls). `npx tsc --noEmit` clean; targeted file 13/13,
      plus `tests/p10h-transition-sweep.test.ts`, `tests/dps-panel.test.ts`,
      `tests/g2-determinism.test.ts` (other Sundering-adjacent suites) green
      — refs: fb167, `src/render/canvas.ts`'s camera-activation block,
      `src/sim/sundering.ts`.

### Actionable (filed 2026-09-22)

- [x] (fb201) [polish] **DONE 2026-09-23 (scheduled routine).** every Active1
      damage sentence in `src/ui/class-info.ts` omits the §6.3 "Active1
      potency" skill card the sim multiplies in (`active1PotencyMul`, applied
      at every Active1 damage site in `src/sim/classes.ts`), so after taking
      the card the in-run tooltip under-states the real number by up to x1.5.
      fb062 (2026-09-22, code review) added `ClassLiveContext.active1PotencyMul`
      and wired it into Poison Barrel's sentence only. **Shipped:** two new
      helpers in `class-info.ts` — `liveActive1DamageValue` (the
      `characterDamage(...) * active1PotencyMul(w)` shape: Circle Slash,
      Poison Barrel, Deadeye Draw's release-now case, Frost Nova, Chain Surge,
      Time's past/present DoTs) and `liveActive1Value` (the plain
      `value * active1PotencyMul(w)` shape outside `characterDamage`: Flame
      Burst's own formula, Field Kit's heal fraction, Raise's and Manifest's
      summon share, Blood Tithe's damage-mul term — not its flat HP cost —
      Clarion Taunt's duration) — applied to every sentence function whose
      `fire*` handler (or, for Blood Tithe, `towers.ts`'s
      `classTowerDamageMul`) actually reads the card, per the sim-side ground
      truth `tests/class-active1-potency.test.ts` (c021) already pins per
      class. Mind Manipulation (Madness King) is the one Active1 kind whose
      fire path reads the card but whose sentence prints no pre-cast number
      for it, so nothing to change there. New
      `tests/ui-fb201-active1-potency-sentences.test.ts` (12 tests): for each
      of the ten now-wired kinds (Poison Barrel already had coverage in
      `tests/ui-fb063-bottombar-hover-sentences.test.ts`), casts the real
      Active1 through the sim at potency rank 2 and checks the rendered
      sentence names the actually-fired observable (a dummy's hp loss, a
      structure's hp gained, a summon's own `dps`, an enemy's
      `tauntRemaining`/DoT stack) rather than a recomputed formula; manually
      confirmed (via a scoped `git stash` of only `class-info.ts`) that all 12
      fail against the pre-fix code. code-reviewer APPROVE (one Minor: two doc
      comments mis-listed Flame Burst under the wrong helper — fixed before
      commit). `npx tsc --noEmit` clean; `npm run test:fast` green (319 files,
      4837 passed, 34 pre-existing skips, 0 failing). Light tier (`[polish]`)
      — refs: SPEC-FINAL §6.3, §11, fb062.

### Blocked out of Scope

- [x] (fb085) [feat] low priority: **DONE 2026-09-18 from the main lane**
      (BACKLOG.md fb135, whose acceptance explicitly authorized executing
      this "with the Scope widened") — the `/data` blocker below no longer
      applies. generated 2026-09-04 — localization-readiness groundwork for
      QUALITY.md BETA's "zero user-facing string literals outside
      `data/strings.json` (lint rule)" bar, currently entirely unmet (no
      `data/strings.json` exists; every UI string is a literal in
      `src/ui/*.ts`). Scoped to standing up the mechanism rather than a
      single-pass full-repo extraction, which is far larger than one
      backlog item: acceptance is a new `data/strings.json` (seeded, not
      necessarily exhaustive), a small typed loader (`src/ui/strings.ts`),
      and a lint/test rule that fails when a hardcoded user-facing string
      literal appears in a designated "already converted" file list;
      convert one representative, self-contained surface (e.g. the
      pause/results modal text in `hud.ts`) as the first migrated file and
      the rule's own proof case; a test confirms the rule actually catches
      a reintroduced literal in that converted file — refs: QUALITY.md
      BETA, SPEC-FINAL §11. **Shipped:** `data/strings.json` seeded with
      the pause card's ~13 strings; `src/ui/strings.ts`'s `t(key)` loader
      plus a `findReintroducedLiterals(source, values)` reintroduction
      guard (a value-based substring check, not an AST/text-node scan, so
      it catches a reversion inside a `${...}` interpolation the same as a
      bare text node — the exact gap this item's own note above named);
      `hud.ts`'s `showPause()` converted as the first migrated surface;
      `tests/fb085-strings-lint.test.ts` is the rule's own proof case,
      scoped to `showPause`'s method body via a brace-balancing
      `extractMethodBody` helper so a short common word ("Cancel",
      "Options") already used elsewhere in `hud.ts`'s *unconverted* text
      doesn't false-positive. Full-tier code-reviewer APPROVE and
      qa-playtester PASS (see BACKLOG.md's fb135 entry for the full
      write-up, including two logged-not-filed lint-evasion limitations out
      of scope: a value hoisted to a module-level `const`, and a
      unicode-escape/HTML-entity encoding of a migrated value).
      `hud.ts`'s separate `showResults` modal is not converted — the
      acceptance text's "e.g." named one representative surface, not both.
      **BLOCKED-out-of-Scope history (2026-09-07, resolved above):** this
      item's own acceptance line required a new `data/strings.json`, and
      `/data` was not in this lane's Scope (`src/ui/**`, `src/render/**`,
      `tests/ui*`, `tests/render*`, this file only); the loader/lint-rule
      halves were in-scope but depended on the data file existing first, so
      nothing here was independently completable from this lane alone.

- [x] (fb151) [bug] **DONE 2026-09-22 (scheduled routine, main lane) —
      exactly the main-lane companion this item's own blocking note called
      for.** `fireDashSlash` (`src/sim/classes.ts`) now emits `class_active2`
      with the real `lineHit` hit extent (`before.x/y + dir * hitRange`)
      instead of `resolveDashTarget`'s clamped travel endpoint — `before`,
      `dir` and `hitRange` are the exact same values `lineHit` used two lines
      earlier, so the two can no longer diverge. This lane's own render draw
      (`canvas.ts`'s `class_active2` case) needed no change, confirmed by
      this session's code-reviewer: it already draws whatever segment the
      event carries. `tests/p6b-swordsman.test.ts` (main-lane Scope) gained
      two regression cases: the plain unmerged line still matches the travel
      target (hitRange === dashRange there), and a G9-merged charge (dashRange
      5 + full circle radius 4 = hitRange 9) emits the wider 9-tile segment
      reaching a struck enemy at 8.5 tiles — reverting only the fix
      reproduces the original bug exactly (`expected 5 to be close to 9`).
      qa-playtester independently re-verified with the item's own original
      repro (Warden at the map edge aiming into a wall: `dashTravel` clamps
      to zero length, yet the emitted segment now correctly reaches the
      enemies actually damaged past the wall) plus 11 aim angles and a
      partial-charge merge, and confirmed no other `class_active2` emit site
      (`fireQuickstep`/`fireFlameRoad`/`fireCrimsonRush`) shares this bug
      class (`mergedRadius` is exclusive to `fireDashSlash`). code-reviewer
      APPROVE (no Critical/Major; one Minor about stray scratch test files
      the review itself had created while investigating, deleted before
      commit — not part of this fix). `npm run test:fast` green (314/9
      skipped, unchanged). Full tier. — refs: fb112, `canvas.ts`'s
      `class_active2` draw, BACKLOG.md (main lane).

- [x] (fb160) [feat] **DONE 2026-09-24 (scheduled routine, main lane) —
      exactly the main-lane companion this item's own blocking note called
      for.** DPS panel shows whole-run totals only (no per-wave view):
      total damage at the top, then one horizontal bar per source — each tower
      type, each wielded attack, each class active, basic attack, Core — each
      bar segmented by damage TYPE in the damage-type colors, with the source's
      total printed at the right end of its bar, sorted by total. Hovering a
      segment shows that type's amount and percent. Keeps the docked,
      semi-transparent side style. Acceptance: bars render from the run report;
      a test reconciles the rendered numbers against the sim's damage ledger;
      colors come from `data/damagetypes.json` — refs: SPEC-FINAL §11, owner
      feedback `ui-dps-panel-bars`.
      **Shipped:** the missing main-lane state (`World.damageByWeaponType`, a
      source x type damage matrix credited at `damageEnemy`'s existing choke
      point) landed alongside the panel redesign in one session — see
      BACKLOG.md's own fb160 entry for the full write-up (sim-side
      accumulator/snapshots/hash/RunReport plumbing, the segmented-bar UI,
      the `wave`-window-kept-but-unrendered decision logged as QUESTIONS
      Q219, and the full review/QA pass). Full tier: code-reviewer
      REQUEST-CHANGES (one Major, a test-file typecheck break, fixed) then
      clean; qa-playtester PASS on every acceptance clause.

### Kept live (cross-lane test dependency)

`tests/fb038-status.test.ts` (main-lane Scope, cannot be edited from here)
hard-codes `feature-class-attack-sprites` -> `fb055` -> `BACKLOG-UI.md` as its
one live example proving the feedback-ledger's lane-citation scan finds a
lane file's own item rather than reporting "no BACKLOG citation found".
Archiving `fb055` (its full text is otherwise unchanged, DONE 2026-09-03)
moved its only citation to `docs/BACKLOG-DONE.md`, which `feedbackLedger`
deliberately gives no lane tag (see `tools/status.ts`'s own comment:
"the archive is not a lane ... a done item needs no routing information") —
so the test's assertion `toContain('BACKLOG-UI.md')` reads `'fb055 —
done'` instead and reddens. Logged here rather than fixed: `tools/status.ts`
and `tests/fb038-status.test.ts` are outside this lane's Scope. Kept `fb055`
live (not archived) as the least-invasive fix available from this lane; the
main lane should either point that test at a still-open, feedback-cited
UI item instead, or accept that an archived item loses its lane tag by
design and update the assertion — either resolution then lets this item
archive normally.

- [x] (fb055) [feat] top priority: the three visible classes' basic
      attacks currently look like recolors of each other rather than
      distinct weapons. Give Swordsman a sword-swing-arc melee sweep,
      Plaguebringer a lobbed spore/vial with a small splash, and Time Lord
      a thrown clock-shard/temporal bolt with a trailing distortion, each
      with its own distinct impact effect (slash flash / splash / ripple);
      hidden classes keep their current look. Acceptance: all three
      basic-attack sprites/motions are visually distinct in shape and
      motion (silhouette test or equivalent registry assertion); each is
      registered in the VFX registry (extends fb021) with its own kind
      string; reduced-flash setting respected — refs: SPEC-FINAL §11 (VFX
      registry), owner feedback `feature-class-attack-sprites`. DONE
      2026-09-03: `vfx-registry.ts` adds `BasicImpactShape`
      ('slash'/'splash'/'ripple') per class; `canvas.ts` adds a `arc`
      CastFx shape (Swordsman's sweep, layered over the existing straight
      swing line), a `BasicImpactFx`/`drawBasicImpacts` layer for the
      three impact marks, and a second jagged tracer for Time Lord's
      distortion trail; also fixed `drawTracers`, which had no
      `reducedFlash` handling at all before this. Targeted test
      `tests/render-fb055-basic-attack-vfx.test.ts` (8/8), code-reviewer
      APPROVE (no Critical/Major), qa-playtester PASS (no bugs filed).
      `npm run test:fast`: 10 failures, all in the pre-existing
      `q15-command-domain-fuzz` worker-hang / `q49`/`q52` Windows
      scratch-dir EPERM flake class documented across dozens of prior
      PROGRESS.md sessions, none touching `src/render/**`.

### Cross-lane notes (for the main lane; QUESTIONS.md is out of this lane's Scope)

- 2026-09-07, fb097: took the frame-sequence-archive branch of this item's
  own acceptance ("if a GIF encoder is judged too heavy a dependency for
  this item, a downloadable frame-sequence archive with a logged
  QUESTIONS.md note on the substitution"), not a real animated GIF. A GIF
  encoder was judged too heavy a dependency: it would add a new npm
  package (binary-size and licensing surface) for a dev-only tool, where a
  dependency-free STORE-only ZIP writer (`src/ui/zip-archive.ts`, new)
  gets the same "one downloadable file bundling N frames" result with zero
  new dependencies. Please add the QUESTIONS.md entry recording this
  substitution (this lane cannot write QUESTIONS.md directly) — refs:
  fb097, fb094.

### Recently completed

- (fb174) [polish] **DONE 2026-09-07** — the measured form of fb149's kind-classification guard: fires every Active, measures the real per-target damage, derives the falloff clause from that alone.
- (fb097) [feat] **DONE 2026-09-07** — dev-profile-only frame-sequence capture: 6 canvas frames on a fixed 500ms interval, bundled into one downloadable ZIP.
- (fb093) [polish] **DONE 2026-09-07** — ultrawide/narrow HUD safe-area audit coverage: a real-Chromium test at 2560x1080 and 1024x1280 checking zero hud-overlap and no offscreen critical control.
- (fb176) [polish] **DONE 2026-09-07** — the falloff floor makes "each one behind it takes less" stop being literally true past a reachable target count.
- (fb175) [polish] **DONE 2026-09-07** — `tower-info.ts`'s `KIND_TEXT.single` blurb describes the same `lineHit` drop-off the class sentences now name, and did not name it.
- (fb173) [bug] **DONE 2026-09-07** — every radius and width in the in-run ability sentences ignored the live Area multiplier, exactly the way `dashRange` ignored move speed before fb148.
- (fb172) [bug] **DONE 2026-09-07** — a switch-away still flushed `SAVE_KEY` over an intact slot copy, so a per-file cloud restore was lost at the next switch.
- (fb171) [bug] **DONE 2026-09-07** — a run that STARTS hidden was never auto-paused.
- (fb170) [bug] **DONE 2026-09-07** — hiding the tab paused but did not flush the persisted run.
- (fb169) [polish] **DONE 2026-09-07** — "Reset settings to defaults" re-buried the OS reduced-motion preference.

Full text for these and all earlier completions: `docs/BACKLOG-DONE.md`.
