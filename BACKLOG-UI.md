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
      the five still-open actionable items (`fb085`, `fb093`, `fb097`,
      `fb151`, `fb174`) under a new `### Actionable in this lane` heading,
      this item first; a new `### Recently completed` list of the last 10
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

- [ ] (fb085) [feat] low priority: generated 2026-09-04 — localization-
      readiness groundwork for QUALITY.md BETA's "zero user-facing string
      literals outside `data/strings.json` (lint rule)" bar, currently
      entirely unmet (no `data/strings.json` exists; every UI string is a
      literal in `src/ui/*.ts`). Scoped to standing up the mechanism rather
      than a single-pass full-repo extraction, which is far larger than one
      backlog item: acceptance is a new `data/strings.json` (seeded, not
      necessarily exhaustive), a small typed loader (`src/ui/strings.ts`),
      and a lint/test rule that fails when a hardcoded user-facing string
      literal appears in a designated "already converted" file list;
      convert one representative, self-contained surface (e.g. the pause/
      results modal text in `hud.ts`) as the first migrated file and the
      rule's own proof case; a test confirms the rule actually catches a
      reintroduced literal in that converted file — refs: QUALITY.md BETA,
      SPEC-FINAL §11.

- [ ] (fb093) [polish] low priority: generated 2026-09-04 (fewer than 3
      actionable items remained; QUALITY.md 1.0 Steam/itch checklist gap
      diff, extends fb065/fb082) — ultrawide/narrow HUD safe-area audit
      coverage. QUALITY.md 1.0's checklist names "16:9/16:10/ultrawide safe"
      as its own line, distinct from what fb065/fb082 already built
      (floating rails anchored to the letterboxed canvas rect at arbitrary
      aspect ratios) — neither item's own test coverage includes a real
      `tools/ui-audit.ts` scene at an ultrawide (e.g. 2560x1080, ~21:9) or
      narrow/portrait (e.g. 1024x1280) viewport, only unit-level geometry
      math. Acceptance: `tools/ui-audit.ts` gains at least one ultrawide and
      one narrow/portrait scene alongside its existing set; `npm run
      ui-audit` shows zero `hud-overlap` failures and no critical control
      (bottom bar, rail handles) rendered fully offscreen at either — refs:
      fb065, fb082, QUALITY.md 1.0 (Steam/itch checklist).

- [ ] (fb097) [feat] low priority: generated 2026-09-04 (same generation
      batch as fb095; QUALITY.md 1.0 Steam/itch checklist gap diff, extends
      fb094) — gif capture mode. fb094 scoped out "gif capture mode" from
      QUALITY.md 1.0's "store-page asset export (screenshots at fixed seeds,
      gif capture mode)" line as "materially larger scope, left for a future
      item" — this is that item. Add a dev-profile-only control (alongside
      fb094's screenshot export, same gating pattern) that records N seconds
      of canvas frames on a fixed interval and exports them as an animated
      GIF (or, if a GIF encoder is judged too heavy a dependency for this
      item, a downloadable frame-sequence archive with a logged QUESTIONS.md
      note on the substitution). Acceptance: a unit test triggers capture,
      confirms it collects the expected number of frames over a mocked
      clock/rAF, and produces a downloadable file; the control is absent/
      inert outside dev profile, matching fb094's own gating pattern — refs:
      QUALITY.md 1.0 (Steam/itch checklist), fb094.

- [ ] (fb151) [bug] filed 2026-09-05 by qa-playtester during fb112
      verification — the Dash Slash slash VFX is drawn to the physical dash
      TARGET, not the hit line, so mid-charge and against walls the graphic is
      shorter than the hitbox. `fireDashSlash` (`src/sim/classes.ts`) runs
      `lineHit` with `hitRange = dashRange + mergedRadius` from the PRE-dash
      position, then emits `class_active2` with `resolveDashTarget`'s clamped
      travel endpoint, and `canvas.ts` draws that emitted segment. Repro: with
      the Warden at the map edge (x=1) aiming -X, `dashTravel` is a zero-length
      segment (the dash clamps against the wall) yet enemies at -0.6 and -0.9
      tiles both take damage — the player sees NO slash at all while enemies
      die; mid-charge in open ground the hit line spans 9 tiles while the drawn
      segment spans 5, hiding 4 tiles of real hit. Acceptance: the drawn slash
      covers the corridor that actually deals damage (the emitted event carries
      the hit extent, not the travel extent — note the emit itself is
      `src/sim/**` and out of this lane's Scope, so this may need a main-lane
      companion; if so, do the render half here and log the sim half);
      regression test asserts the emitted `class_active2` segment against the
      measured furthest struck enemy — refs: fb112, `canvas.ts`'s
      `class_active2` draw.

- [ ] (fb174) [polish] filed 2026-09-05 by code-reviewer during fb149 review —
      the measured form of fb149's kind-classification guard. fb149 ships a
      DECLARED table (`DECAYS`/`PATCH`/`FLAT` in
      `tests/ui-fb149-falloff-wording.test.ts`) plus an exhaustiveness check,
      so a NEW `ClassEffect` kind fails until someone classifies it — but a
      MISCLASSIFIED existing one reads clean, which is exactly how fb149's own
      first pass missed `ground_poison` and `dash_trail`. The reviewer's ask is
      the measured form: probe each damaging kind with `aoeFullTargets + 3`
      pinned enemies and require the clause IFF the measured per-target
      damages are not all equal. It was scoped out of fb149 because it needs a
      per-kind firing harness — charges (`tickClassCharge`), stored Wrath,
      ground-field ticking through `updateAreas`, summon lifetimes — well
      beyond one wording item. Acceptance: a table-free guard that fires every
      Active of every class through its own required setup, measures the
      per-target profile, and asserts the presence or absence of a falloff
      clause from that measurement alone; the declared tables are deleted, and
      a deliberately misclassified kind (not just a new one) reddens it —
      refs: fb149, fb146, fb148.

### Blocked out of Scope

- [ ] (fb167) [feat] the camera half of the owner's bigger-map order (BACKLOG.md
      `fb153b`, `balance-damage-rescale-and-bigger-map` item 2): with the grid
      going **36x20 -> 56x32**, the whole arena no longer fits a screen at a
      readable tile size, so the camera **follows the character** with zoom
      limits and clamps at the map edges. Everything this needs is in this
      lane's Scope: `src/render/**`'s viewport/letterboxing (it currently sizes
      to a fixed 36:20 aspect), `src/ui/input.ts`'s click-to-tile math (which
      must un-project through the camera, not the fixed board), and the overlay
      geometry suites. Measured on the main lane before filing: flipping the two
      grid constants reddens **~85 assertions across 20 files**, of which this
      lane's are `tests/ui-input` 7, `tests/class-board` 6,
      `tests/ui-fb082-overlay-geometry` 3, `tests/ui-fb106-extreme-aspect-
      geometry` 2 and `tests/ui-fb102-bossbar-rail-overlap` 1. **Blocked on
      BACKLOG-TERRAIN.md fb166**, which owns the constant flip; this item is
      what makes the result playable. Acceptance: the camera follows the
      character, clamps at both zoom limits and at all four map edges, and
      click-to-tile is correct at every zoom; the geometry suites are re-fitted
      and green at 56x32; the reduced-motion setting is respected — refs:
      SPEC-FINAL §11, BACKLOG.md fb153b.

- [ ] (fb160) [feat] **blocked on new main-lane sim state, see this file's Log
      (2026-09-06)** — DPS panel shows whole-run totals only (no per-wave view):
      total damage at the top, then one horizontal bar per source — each tower
      type, each wielded attack, each class active, basic attack, Core — each
      bar segmented by damage TYPE in the damage-type colors, with the source's
      total printed at the right end of its bar, sorted by total. Hovering a
      segment shows that type's amount and percent. Keeps the docked,
      semi-transparent side style. Acceptance: bars render from the run report;
      a test reconciles the rendered numbers against the sim's damage ledger;
      colors come from `data/damagetypes.json` — refs: SPEC-FINAL §11, owner
      feedback `ui-dps-panel-bars`.

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

### Recently completed

- (fb176) [polish] **DONE 2026-09-07** — the falloff floor makes "each one behind it takes less" stop being literally true past a reachable target count.
- (fb175) [polish] **DONE 2026-09-07** — `tower-info.ts`'s `KIND_TEXT.single` blurb describes the same `lineHit` drop-off the class sentences now name, and did not name it.
- (fb173) [bug] **DONE 2026-09-07** — every radius and width in the in-run ability sentences ignored the live Area multiplier, exactly the way `dashRange` ignored move speed before fb148.
- (fb172) [bug] **DONE 2026-09-07** — a switch-away still flushed `SAVE_KEY` over an intact slot copy, so a per-file cloud restore was lost at the next switch.
- (fb171) [bug] **DONE 2026-09-07** — a run that STARTS hidden was never auto-paused.
- (fb170) [bug] **DONE 2026-09-07** — hiding the tab paused but did not flush the persisted run.
- (fb169) [polish] **DONE 2026-09-07** — "Reset settings to defaults" re-buried the OS reduced-motion preference.
- (fb177) [feat] **DONE 2026-09-07** — per-tower attack projectile/beam visuals: every tower type gets a distinct registered VFX entry.
- (fb117) [feat] **DONE 2026-09-07** — Core-select screen redesign to match class-select layout.
- (fb096) [feat] **DONE 2026-09-07** — Swordsman combo swept-area indicator for a Dash Slash cast during a Circle Slash charge.

Full text for these and all earlier completions: `docs/BACKLOG-DONE.md`.
