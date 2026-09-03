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
written into the Log below and becomes main-lane (or other-lane) work at
the merge — never edited from this lane.

Architecture rule 3 still binds: the renderer reads sim state only. An
item needing new sim-side state, a new Command, or a sim-exposed event
stream (e.g. fb060's per-enemy per-type DoT aggregation, if the sim does
not already expose it) logs that need below instead of reaching into
`src/sim/**`.

## Queue

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

- [ ] (fb058) [feat] normal priority: class select redesign — a horizontal
      row of tall class sprites; selecting one fills a bottom panel with
      band/number stats, and hovering the passive/tower-passive/Active1/
      Active2 entries shows written descriptions with live numbers. Only
      Swordsman, Plaguebringer and Time Lord show in a normal profile; the
      other classes (9 today, more once fb057/fb059 land) stay in `/data`
      and dev-profile-selectable behind a new "show hidden classes" dev
      toggle; sim gates keep measuring every class regardless of UI
      visibility. Acceptance: new screen matches the described layout;
      exactly 3 classes are selectable in a normal profile; the dev toggle
      reveals the rest; no gate test changes — refs: SPEC-FINAL §4, §11
      (UI + roster-visibility rule), owner feedback
      `feature-class-select-redesign`.

- [ ] (fb060) [feat] normal priority: OWNER OVERRIDE of QUESTIONS Q133(3)
      — DoT damage (Bleeding, Poison, Toxic, Burning) must show as
      floating numbers after all: aggregate per enemy per damage type once
      per second (one number = that second's total for that type), typed
      color, smaller font than direct hits; under high density (>150
      enemies with DoTs ⚖) show only for enemies near the cursor/character
      plus elites/bosses; Settings toggle "DoT numbers" default ON;
      existing marker dots stay. Acceptance: a bleeding enemy shows
      ticking numbers in a unit/UI test; a 300-enemy burning-horde perf
      bench holds 60fps with the density cutoff active; the toggle works
      — refs: SPEC-FINAL §3 (status), §11 (UI), overrides QUESTIONS Q133
      call (3), owner feedback `feature-dot-tick-numbers`.

- [ ] (fb063) [feat] normal priority: bottom-bar passive/Active1/Active2
      icons become hover-only (no click, no sticky panel); tooltip shows a
      written sentence-form effect description with embedded live numbers
      (e.g. "Slash all enemies within 2.5 tiles for 34 damage, knocking
      them back"), not bare numbers; add the class's tower passive as a
      fourth bar icon with the same hover behavior; range/area indicators
      still draw while hovering. Acceptance: icons have no click handler;
      hovering each of the four icons (passive, Active1, Active2, tower
      passive) on every visible class shows sentence-form text; a test
      asserts the numbers embedded in the text equal live sim values —
      refs: SPEC-FINAL §11 (amends the bottom-bar HUD item, `fb026`/
      `fb028`), owner feedback `feature-skill-icons-hover-only`.

- [ ] (fb065) [feat] normal priority: every UI overlay (bottom bar, side
      panels, DPS panel, counters, wave info) floats over the playfield as
      semi-transparent edge overlays instead of reserving opaque gutter/
      sidebar space; the canvas fills the window; panels auto-collapse to
      edge tabs. Acceptance: canvas is window-sized; no layout element
      reserves horizontal space outside the canvas; the existing UI-audit
      scenes (fb-era self-audit tooling) are re-captured and still pass
      overlap checks — refs: SPEC-FINAL §11 (layout rule), owner feedback
      `feature-ui-inside-playfield`.

## Log
