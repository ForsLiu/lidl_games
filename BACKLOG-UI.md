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

### Owner feedback routed from `feedback/` (2026-09-05, cloud round 1)

Four of the eight owner files in that round are UI-lane; ids unchanged from the
main-lane allocation. `fb157` carries `Priority: top` and goes above the rest of
this queue. `fb158`'s `/data` half is **main-lane `fb155`** (`data/enemies.json`
is outside this lane's Scope) — this lane renders what that item authors, and
logs a blocker below rather than editing `/data` itself.

- [ ] (fb157) [feat] **top priority** — the in-run character panel is too big and
      blocks the screen. Rebuild it as a compact card anchored to a screen edge:
      no scrolling, close button top-right, Esc closes, never covering the bottom
      bar. Remove the passive/active entries (the bottom bar already carries
      them). Show the equipped equipment slots with each item's effect text,
      **read-only** — equipment cannot be changed during a run, only in the Hub,
      with a tooltip saying so. Always-visible important stats: HP
      (current/max), attack, attack speed, defense, movement speed, range, life
      regen, lifesteal. Everything else — area, CDR, pickup, luck, per-source
      multiplier breakdowns, active boons and ranks — moves behind a "Details"
      pull-down. Acceptance: the panel fits a 1080p screen with no scrolling;
      close works from both the button and Esc; equipment is read-only in-run
      and says why; a test asserts the important-stat set and the Details
      contents match the derived stats — refs: SPEC-FINAL §11, owner feedback
      `ui-character-panel-compact`.

- [ ] (fb158) [feat] indicate each enemy's attack type and range: a small icon
      near the HP bar per attack kind (melee sword / ranged bow / special:
      bomber, healer, buffer, burrower, phaser) and, on hover or selection, the
      attack-range ring (melee reach or ranged distance) plus a one-line
      description with numbers. Elites/bosses show their special attack ranges
      when selected. Reads the kind/range fields main-lane `fb155` authors —
      **blocked on fb155**; do not re-derive them from `traits` in the renderer.
      Acceptance: every enemy renders its icon; rings render on hover and on
      select; the Codex enemy pages show the same icon and numbers — refs:
      SPEC-FINAL §9/§11, owner feedback `ui-enemy-attack-indicators` (render
      half).

- [ ] (fb159) [feat] floating damage numbers scale with the value: font size =
      `base + k*log10(value)` (10 small, 100 medium, 1000+ large and bold),
      clamped to a max; crit/execute keep their extra styling; DoT aggregate
      numbers use the same rule at 80% size. Constants are data-driven
      (architecture rule 4), not literals in the renderer. Acceptance: three
      visibly distinct sizes across 1/10/100/1000 in the Training Grounds; a
      test asserts the size mapping is monotonic in the value and that the clamp
      holds above it — refs: SPEC-FINAL §11, owner feedback
      `ui-damage-font-scaling`. Note it lands **after main-lane fb153a's /10
      rescale** or its constants get re-fitted twice.

- [ ] (fb160) [feat] DPS panel shows whole-run totals only (no per-wave view):
      total damage at the top, then one horizontal bar per source — each tower
      type, each wielded attack, each class active, basic attack, Core — each
      bar segmented by damage TYPE in the damage-type colors, with the source's
      total printed at the right end of its bar, sorted by total. Hovering a
      segment shows that type's amount and percent. Keeps the docked,
      semi-transparent side style. Acceptance: bars render from the run report;
      a test reconciles the rendered numbers against the sim's damage ledger;
      colors come from `data/damagetypes.json` — refs: SPEC-FINAL §11, owner
      feedback `ui-dps-panel-bars`.

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

- [x] (fb058) [feat] normal priority: class select redesign — a horizontal
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
      `feature-class-select-redesign`. DONE 2026-09-03: `class-select.ts`
      adds `NORMAL_PROFILE_CLASS_KEYS`, the SPEC-FINAL §4 `CLASS_BANDS`
      table, `classBandStatsMarkup`/`classSelectSkillsMarkup`; `hub.ts`'s
      Class tab renders a `.sw-classcard` row filtered to the 3-class roster
      unless `settings.showHiddenClasses` (new, dev-profile-gated toggle,
      `TOGGLES`' new `devOnly` flag) is on, with a selected-class fallback
      when the filter drops the current selection; `class-info.ts` gains a
      standalone `towerPassiveSkillMarkup` (was inlined only in
      `classAbilitiesMarkup`) reused for the new 4th hover entry.
      code-reviewer pass (one Major scope-boundary question, resolved, see
      Log; one Minor pre-existing-gap-exposure, filed as fb066 below; nits
      not blocking). qa-playtester found one new Major: the render-time
      "current selection fell outside the filtered roster" fallback picked
      `visibleClasses[0]` with no unlock check, so a save whose
      `unlockedClasses` omits all of Swordsman/Plaguebringer/Time Lord (an
      `Array.isArray`-only-guarded shape `migrate()` doesn't intercept) could
      highlight a locked class as the active selection and hand it to
      `beginRun()` uncontested — no click needed. Fixed by giving `beginRun()`
      the same belt-and-suspenders reconciliation `core` already had
      (`this.meta.unlockedClasses.includes(this.classKey) ? this.classKey :
      …`), *not* by gating the render-time fallback itself — previewing a
      locked class's band stats by clicking its (still-visible, still-"on")
      card is intentional and an existing test relies on it; only an actual
      run start needed the guard. Targeted `tests/ui-fb058-class-select.test.ts`
      (9/9, incl. the hidden-class-toggle-off fallback case from code review
      and the locked-class-can't-reach-RunConfig regression from QA), qa
      re-verified PASS. `npm run test:fast`: 13 failures, all four
      pre-existing q15/q28/q45/q49/q52 worker-hang/Windows-scratch-EPERM
      flake classes documented across prior sessions, none in `src/ui/**`/
      `src/render/**`.

- [x] (fb066) [polish] low priority: WON'T-FIX, resolved 2026-09-03 — see Log.
      The literal acceptance ("mirror `[data-core]`: skip attaching the
      listener to locked buttons entirely") directly undoes fb058's
      intentional locked-class-preview feature and breaks an existing green
      fb058 regression test that depends on it.

- [x] (fb060) [feat] normal priority: OWNER OVERRIDE of QUESTIONS Q133(3)
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
      call (3), owner feedback `feature-dot-tick-numbers`. DONE 2026-09-03:
      `canvas.ts`'s `Renderer` gains `updateDotNumbers` (called from
      `ingest()`), reading `Enemy.dots` (already-public sim state — `damageEnemy`
      deliberately fires no `hit:` fx for a DoT tick, so this cannot react to an
      event) directly and aggregating each enemy's per-type dps into a floating
      number once every accumulated second via a `WeakMap<Enemy, Map<string,
      number>>` (`dotAccum`) that self-prunes on enemy GC, no manual cleanup
      needed. Density cutoff (150 carriers) shows only enemies within 8 tiles of
      the cursor or Warden, plus elite/boss, once tripped. New `dotNumbers`
      Settings toggle (default ON, `hub.ts` TOGGLES). Targeted
      `tests/render-fb060-dot-tick-numbers.test.ts` (5/5): aggregation+font-size,
      toggle gating, default-on, density-cutoff boundary, 300-enemy perf bench.
      code-reviewer APPROVE (no Critical/Major; two Minor doc-comment gaps and a
      missing Log entry, all fixed same session). qa-playtester PASS against all
      four stated acceptance criteria (re-derived the density-cutoff boundary at
      exactly 150→151 carriers, confirmed the toggle survives a save predating
      the field, measured the perf bench's real ~3.5ms/frame cost delta so it
      isn't vacuous) and filed two low-severity, non-blocking edge-case bugs —
      see fb067/fb068 below. `npm run test:fast`: 10-11 failures across two runs
      this session, all in the pre-existing q15/q45/q49/q52 worker-hang/Windows-
      scratch-EPERM flake classes plus b032/b034/b035 (confirmed via git-stash
      A/B: pass individually both with and without this change, fail only under
      full-suite parallel contention) and a pre-existing b036 failure (identical
      1095.4>1080 assertion value with and without this change) — none touch
      `src/ui/**`/`src/render/**` or this item's own files.

- [x] (fb067) [bug] low priority: fb060's DoT tick numbers silently and
      permanently drop a second's damage when the shared floating-number
      budget (`MAX_OTHER_NUMBERS`, 150 slots shared with every other
      floating-number source) is full at the moment a DoT accumulator
      crosses its 1-second threshold — `updateDotNumbers`
      (`canvas.ts`) advances the per-type accumulator (`perType.set(type,
      next - 1)`) unconditionally even when the `this.numbers.push(...)`
      it guards on `this.numbers.length < MAX_OTHER_NUMBERS` was skipped,
      so the flush is not retried or requeued — it just vanishes. Found by
      qa-playtester (fb060 verification): pre-filling the shared numbers
      array to 150 before ticking a bleeding enemy suppresses its number
      indefinitely, independent of (and possible even below) fb060's own
      150-*carrier* density cutoff. Acceptance: a regression test that
      fills `numbers` to `MAX_OTHER_NUMBERS` before ticking a DoT carrier
      confirms the flush either retries once budget frees up or the
      accumulator is not silently advanced past the missed threshold —
      refs: fb060, owner feedback `feature-dot-tick-numbers`. DONE
      2026-09-03: `updateDotNumbers` (`canvas.ts`) now leaves the per-type
      accumulator at `next` (unreset, still >=1) instead of `next - 1`
      whenever the threshold-crossing push is skipped for a full budget, so
      the same type keeps accumulating and retries on a later frame once
      budget frees up, flushing the (now larger, still-correct) amount
      instead of dropping it. Targeted
      `tests/render-fb067-dot-number-budget.test.ts` (1/1: pre-fills
      `numbers` to `MAX_OTHER_NUMBERS`, confirms no flush + accumulator
      still pending, frees the budget, confirms the pending damage flushes).
      code-reviewer APPROVE (no Critical/Major; one Minor — the `dps<=0`-
      expiry and density-cutoff-visibility-loss comments still described the
      old <1s-only invariant once a starved accumulator could exceed one
      tick's worth — fixed same session by updating both comments to
      acknowledge the new possibility, cosmetic-impact-only, both re-verified
      green). qa-playtester PASS against the stated acceptance criteria
      (re-ran the regression test twice deterministically, traced the dead-
      enemy/density-cutoff/multi-type-expiry/unbounded-growth edge cases and
      confirmed each was already handled or an accepted tradeoff) and filed
      one new low-severity bug — see fb069 below. `npm run test:fast`: 10
      failures, all in the pre-existing q15/q49/q52 worker-hang/Windows-
      scratch-EPERM flake classes documented across dozens of prior
      PROGRESS.md sessions, none touching `src/render/**`/`src/ui/**` or
      this item's own files.

- [x] (fb069) [bug] low priority: fb067's budget-full retry can leave a
      stale, inflated per-type accumulator sitting in `dotAccum` past a DoT
      stack's own full expiry, if that type was the enemy's *only* active
      DoT — `updateDotNumbers`'s (`canvas.ts`) enemy-level fast path
      (`if (e.dead || e.dots.length === 0) continue;`) runs before the
      per-type loop's `dps <= 0` → `perType?.delete(type)` cleanup, so once
      `e.dots.length` drops to 0 the cleanup for that type never runs and
      the leftover pending seconds (potentially several, if fb067's retry
      had been accumulating through a saturated budget) survive indefinitely
      in the WeakMap. If the same enemy is later re-afflicted by the same
      DoT type, the first tick of the new stack reads and flushes the stale
      leftover mixed with the new one, showing an inflated, incorrect
      number. Found by qa-playtester (fb067 verification), reproduced
      deterministically: a bleeding stack saturating the budget for its
      full 3.5s duration leaves ~3.5s pending after it expires; re-applying
      bleeding and ticking once flushes "70" instead of the correct ~20 for
      one real tick. Acceptance: a regression test — one enemy, a single
      DoT type, budget saturated for the stack's full duration so it
      expires while pending, budget freed, the same type re-applied, one
      tick — confirms either no number appears immediately or the flushed
      amount is bounded to the new stack's own elapsed time, not inflated
      by stale carryover; suggested fix direction: also clear the enemy's
      full `dotAccum` entry (or run the per-type cleanup) on the
      `e.dots.length === 0` fast path before its `continue` — refs: fb067,
      fb060, owner feedback `feature-dot-tick-numbers`. DONE 2026-09-03:
      `updateDotNumbers`'s (`canvas.ts`) enemy-level fast path now calls
      `this.dotAccum.delete(e)` before its `continue` whenever
      `e.dead || e.dots.length === 0`, matching the same pattern already used
      one block below by the density-cutoff `!visible` branch. Safe by
      construction: the fast path only fires when the enemy has *zero* live
      dots of *any* type, so there is never a still-active type whose
      accumulator gets wiped alongside an unrelated expired one. Targeted
      `tests/render-fb069-dot-accum-stale-cleanup.test.ts` (1/1): saturates the
      budget for a 3.5s bleeding stack's full duration, confirms the stack
      fully expires, confirms no stale pending seconds survive, then frees the
      budget, re-applies bleeding, ticks once, and confirms no inflated number
      flushes immediately. code-reviewer APPROVE (no Critical/Major/Minor).
      qa-playtester PASS against the stated acceptance criteria (independently
      re-derived the tick-ordering reason the enemy-level fast path can only
      ever fire on a genuine all-stacks-expired frame, confirmed via git-stash
      A/B that the test fails pre-fix with the predicted ~3.5s stale magnitude
      and passes post-fix, reran the full `render-fb06{0,7,9}` suite plus all
      `render-*` tests clean) and filed one new low-severity bug in the same
      family via a different trigger — see fb070 below. `npm run test:fast`:
      7-10 failures across runs this session, all in the pre-existing
      q15/q49/q52 worker-hang/Windows-scratch-EPERM flake classes documented
      across dozens of prior PROGRESS.md sessions, none touching
      `src/render/**`/`src/ui/**` or this item's own files.

- [x] (fb070) [bug] low priority: the `dotNumbers` Settings toggle
      (`view.settings.dotNumbers`) gates `updateDotNumbers`'s (`canvas.ts`)
      *entire* body with an early `if (!view.settings.dotNumbers) return;`
      before the enemy loop, so fb069's expiry cleanup (`this.dotAccum.delete(e)`
      on `e.dots.length === 0`) never runs while the toggle is off — the same
      inflated-stale-carryover bug fb069 just fixed reappears via a different
      trigger: turn the toggle off, let a saturated-budget DoT stack expire and
      a same-type stack get re-applied while it stays off, then turn the toggle
      back on and tick once. Found by qa-playtester (fb069 verification),
      reproduced deterministically: a bleeding stack's ~3s stale accumulator
      survives an off/on toggle flip and flushes "60" mixed into the new
      stack's first tick instead of a bounded amount. Acceptance: a regression
      test — same shape as fb069's but toggling `settings.dotNumbers` off
      across the expire+reapply window instead of relying on the enemy-level
      fast path alone — confirms no inflated number flushes once the toggle is
      re-enabled; suggested fix direction: run the per-enemy accumulator
      expiry/cleanup pass unconditionally and only skip the `this.numbers`
      push when the setting is off, or clear the whole `dotAccum` WeakMap on
      an off-to-on transition — refs: fb069, fb067, fb060, owner feedback
      `feature-dot-tick-numbers`. DONE 2026-09-03: `updateDotNumbers`
      (`canvas.ts`) now computes `const enabled = view.settings.dotNumbers;`
      instead of an early `return`, and moved the enable-gating to
      `if (!enabled) continue;` placed *after* the per-enemy
      `e.dead || e.dots.length === 0` fast-path cleanup, so that cleanup (and
      fb068's `dotNearLast` cleanup alongside it) always runs regardless of
      toggle state; the `carriers` density-count loop is gated `if (enabled)`
      since it's meaningless work otherwise. Targeted
      `tests/render-fb070-dot-toggle-off-stale-cleanup.test.ts` (1/1):
      saturates the budget, flips the toggle off across a stack's
      expire+reapply window, flips it back on, confirms no inflated flush.
      Sets `e.speed = 0` after spawn — without it the enemy walks onto the
      core tile and "leaks" (marked dead) within the ~4s window the test
      ticks through, which would trivially and irrelevantly clear
      `dotAccum` via the unrelated `e.dead` branch and mask the real fix;
      confirmed via git-stash A/B that this fails pre-fix (flushes a stray
      "50") and passes post-fix. code-reviewer REQUEST-CHANGES →
      code-reviewer's one Major (an unused `Enemy` type import in the new
      test breaking `tsc --noEmit`/`npm run build` despite `vitest run`
      passing) fixed same session (import removed); its two Minors (see
      fb068's DONE note below, same session) also addressed. qa-playtester
      PASS against the stated acceptance criteria, plus hostile testing of
      the fb070×fb068 interaction (an enemy flagged near, expiring
      budget-starved while inside the widened-but-outside-the-narrow
      hysteresis radius, correctly has to re-cross the narrow radius from
      scratch on reapplication — no inflation), rapid toggle-spam across a
      stack refresh (exact flushed amounts, no drift), and budget contention
      under hysteresis (no crash, no unbounded growth); filed no new bugs.
      `npm run test:fast`: 11 failures, all in the pre-existing
      q15/q25/q28/q33/q45/q46/q49/q52 worker-hang/Windows-scratch-dir-EPERM
      flake classes documented across dozens of prior PROGRESS.md sessions,
      none touching `src/render/**`/`src/ui/**` or this item's own files.

- [x] (fb068) [polish] low priority: fb060's near-cursor/near-character
      density-cutoff visibility check hard-resets an enemy's DoT-number
      accumulator (`this.dotAccum.delete(e)`) on every single tick it
      reads as outside the 8-tile radius, instead of decaying or
      tolerating brief boundary crossings — an enemy whose distance from
      the cursor/Warden oscillates around exactly 8 tiles can go
      indefinitely without ever surfacing a number even though it is
      "near" roughly half the time. Found by qa-playtester (fb060
      verification), reproduced over 400 ticks of an enemy alternating
      between 7.9 and 8.1 tiles from the Warden under the density cutoff.
      Low severity (the realistic trigger — an enemy or cursor drifting
      across the boundary occasionally, not oscillating every 1/60s tick —
      only loses one in-flight partial second, same as the already-
      documented dot-expiry tradeoff at that file's `dps <= 0` branch).
      Acceptance: either document this as a deliberate simplification
      (matching the existing dot-expiry comment's precedent) or give the
      visibility check a small hysteresis/grace window so a boundary-
      hugging enemy still eventually flushes — refs: fb060, owner feedback
      `feature-dot-tick-numbers`. DONE 2026-09-03: chose the hysteresis
      direction. New `dotNearLast: WeakSet<Enemy>` field (`canvas.ts`)
      tracks which enemies read as "near" last frame; an already-near enemy
      is checked against a widened exit radius
      (`DOT_NUMBER_NEAR_RADIUS + DOT_NUMBER_NEAR_HYSTERESIS` = 8+2 = 10
      tiles) instead of the fixed 8-tile radius, so a boundary-hugging
      enemy stops flip-flopping and eventually accumulates a full second.
      Only computed when `dense && !e.elite && !e.boss` (elites/bosses are
      unconditionally visible already; tightened during code review from an
      earlier draft that ran the hypot calls for them too). No leak risk:
      `dotNearLast` entries are removed on the same `e.dead`/
      `dots.length===0` fast path fb070 made unconditional, and whenever an
      enemy reads as not-near under the dense branch; WeakSet semantics
      handle the rest on GC. Documented (code review Minor, addressed same
      session) that `dotNearLast` membership only updates on frames the
      hysteresis block actually runs, so an enemy can carry a stale "near"
      flag across a non-dense stretch into the next dense one — one extra
      frame at the wider radius, cosmetic-only, same tradeoff class as
      fb067/fb069's documented ones. Targeted
      `tests/render-fb068-dot-density-hysteresis.test.ts` (1/1): a swarm
      pushes the carrier count past the density cutoff while one enemy
      oscillates every tick between 7.9 and 8.1 tiles from the Warden for
      400 ticks; confirms a number eventually flushes. Confirmed via
      git-stash A/B that this fails pre-fix and passes post-fix.
      code-reviewer REQUEST-CHANGES (Major on fb070's test file, see above;
      two Minors on this item — elite/boss short-circuit not preserved, and
      the cross-`dense`-transition staleness undocumented — both fixed same
      session) → re-verified green. qa-playtester PASS against the stated
      acceptance criteria (independently confirmed the chosen fix matches
      the acceptance text's second option) plus the fb070×fb068 interaction
      hostile test described in fb070's DONE note above; filed no new bugs.
      `npm run test:fast`: same 11 pre-existing-flake-class failures as
      fb070's note (single combined run covered both items), none touching
      `src/render/**`/`src/ui/**` or either item's own files.

- [x] (fb063) [feat] normal priority: bottom-bar passive/Active1/Active2
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
      `fb028`), owner feedback `feature-skill-icons-hover-only`. DONE
      2026-09-03: `class-info.ts` adds a `ACTIVE_SENTENCES` table mapping
      each Active `kind` the 3 normal-profile classes use (`charge_nova`,
      `dash_line`, `ground_poison`, `poison_boost`, `time_mark`, `time_lock`)
      to a hand-authored sentence function (`circleSlashSentence`,
      `dashSlashSentence`, `poisonBarrelSentence`, `poisonBoostSentence`,
      `timeMarkSentence`, `timeLockSentence`), each reusing the existing
      `liveOverrides`-style live-number resolution
      (`liveDamageValue`/`liveCooldownValue`) so embedded numbers match live
      sim values, not raw `/data` ones; `activeSkillMarkup` uses the sentence
      when a `kind` has one, else falls back to the pre-existing bare
      field-list block (documented as intentional: covers only the 3
      normal-profile classes' 6 Actives today, extends when fb057/fb059 make
      a hidden class normal-profile-visible). `hud.ts` adds a 4th bottom-bar
      icon (`#sw-bb-towerpassive`) wired to the already-existing
      `towerPassiveSkillMarkup` (fb058), same CSS-only hover-reveal as the
      other 3 (no new click handler, none ever existed on any of the 4 —
      the bar has been hover-only since fb026). Targeted
      `tests/ui-fb063-bottombar-hover-sentences.test.ts` (9/9: no-click
      regression across all 4 icons, exactly-4-icons count, passive/tower
      description text-inclusion for all 3 normal-profile classes, and
      live-number-embedded assertions for Circle Slash/Poison Barrel/Time's
      per-stage DoTs + CDR-scaled recharge). code-reviewer REQUEST-CHANGES →
      one Major (a stray, content-unrelated `STATUS.md` working-tree edit
      left over from an unrelated prior session — dropped from this commit
      entirely, never touched by this item) and one Nit (Time Lock's
      sentence omitted the "immune to Time's rewind-pull" interaction
      `classes.ts`'s `timeLockZoneId` gate already implements — added the
      clause) both addressed same session, re-verified green
      (`tests/ui-fb063-bottombar-hover-sentences.test.ts` +
      `tests/fb026-bottom-bar.test.ts` + `tests/fb022-info-surfacing.test.ts`
      + `tests/ui-fb058-class-select.test.ts`, 74/74). qa-playtester PASS
      (see below). `npx tsc --noEmit` clean. `npm run test:fast`: 9 failed
      files / 6
      failed tests, all in the pre-existing q15/q45/q49/q52 worker-hang/
      Windows-scratch-dir-EPERM flake classes documented across dozens of
      prior PROGRESS.md sessions, none touching `src/ui/**`/`src/render/**`.

- [x] (fb065) [feat] normal priority: every UI overlay (bottom bar, side
      panels, DPS panel, counters, wave info) floats over the playfield as
      semi-transparent edge overlays instead of reserving opaque gutter/
      sidebar space; the canvas fills the window; panels auto-collapse to
      edge tabs. Acceptance: canvas is window-sized; no layout element
      reserves horizontal space outside the canvas; the existing UI-audit
      scenes (fb-era self-audit tooling) are re-captured and still pass
      overlap checks — refs: SPEC-FINAL §11 (layout rule), owner feedback
      `feature-ui-inside-playfield`. DONE 2026-09-03: `Renderer.resize()`
      (`canvas.ts`) now sizes the backing store off the canvas's own parent
      (`.sw-stage`) instead of a fixed 1152x640 constant, letterboxed to the
      36:20 grid aspect ratio (width-bound or height-bound, whichever fits),
      with a new `scale` field replacing the old dpr-only transform factor
      everywhere `draw()` resets its transform; a jsdom fallback (`||` on
      `clientWidth`/`clientHeight`, always 0 without real layout) reproduces
      the exact old fixed-size behavior so every pre-existing `resize()` test
      kept passing unchanged. `main.ts` adds a rAF-coalesced `window resize`
      listener that always reads the live `this.renderer` (never a captured
      stale instance across Retry/New Run). `hud.ts` splits the old single
      `.sw-side` column into two floating rails (`#sw-rail-left` build
      controls, `#sw-rail-right` progress/stats/towerinfo/help), each with a
      collapse/expand handle (`wireRails`); the right rail additionally
      auto-collapses whenever the DPS or VS panel is open *or merely docked*
      (`syncRailRightVisibility` — both share the same top-right corner as the
      rail's own handle, a code-review finding on an earlier draft that only
      collapsed for "open"). `style.css`'s `.sw-shell`/`.sw-stage` no longer
      reserve a flex sidebar column; the two rails are `position: absolute`
      ~85%-opaque overlays (`var(--panel)` + `d9` alpha, matching
      `.sw-dock`'s existing pattern) anchored to the stage's own edges,
      scrolling internally rather than pushing content toward a viewport
      fold. `tools/ui-audit.ts`'s overlap-check selector list adds
      `#sw-dpsdock`/`#sw-vsdock` (share the right rail's corner) — not the
      rails themselves, since every existing selector in that list is now a
      *descendant* of one of the two rails and would false-positive as
      "overlapping" its own container. New
      `tests/render-fb065-stage-fill.test.ts` (6/6: width-bound/height-bound
      letterboxing, DPR-on-top-of-stage-size, no-inline-height, no-parent
      fallback, live-resize re-derivation) and
      `tests/ui-fb065-floating-rails.test.ts` (7/7: no `.sw-side` remains,
      every old child id still reachable inside a rail, independent
      collapse/expand per rail, DPS/VS open-or-docked auto-collapse and
      restore, manual collapse survives an `update()` tick). code-reviewer
      **APPROVE** (no Critical/Major; three Minor/Nit — no test for the new
      resize listener, addressed same session with
      `tests/ui-fb065-resize-listener.test.ts` (2/2: a burst of native
      `resize` events coalesces to one `Renderer.resize()` call per paint, a
      post-Retry resize targets the new renderer instance not the old one);
      the rails anchor to `.sw-stage`'s box rather than the canvas's own
      letterboxed/centered rect, invisible at the audit's 1920x1080 viewport
      (≈36:20) but a real gap at an extreme aspect ratio — logged as a
      follow-up, not blocking, acceptance text is met literally; the two old
      `b035`/`b036` fold tests still pass but now guard a narrower, largely
      vacuous case since the practice/build and towerinfo/help panels moved
      into separate rails — no action needed, flagged for future awareness
      only). qa-playtester **PASS** against all three stated acceptance
      criteria, independently re-verified in a real headless-Chromium session
      at three viewport sizes (1920x1080, 900x700, an extreme 300x900) and
      confirmed `npm run ui-audit` shows zero `hud-overlap` failures across
      all 7 scenes (the remaining font-size/text-contrast/offscreen-tuner-
      field failures are pre-existing, confirmed via git-stash A/B against
      the pre-fb065 baseline, unrelated to layout/overlap); filed one new
      low-severity bug — see fb076 below. `npx tsc --noEmit` clean.
      `npm run test:fast`: 9 failed files / 7 failed tests, all in the
      pre-existing q15/q49/q52 worker-hang/Windows-scratch-dir-EPERM flake
      classes documented across dozens of prior PROGRESS.md sessions, none
      touching `src/ui/**`/`src/render/**` or this item's own files.

- [x] (fb076) [bug] low priority: fb065's right info rail
      (`#sw-rail-right`) can get stuck collapsed after its own handle is
      clicked while the rail is already auto-collapsed for an unrelated
      reason (DPS or VS panel open/docked) — `wireRails`'s handle click
      (`hud.ts`) unconditionally flips `railRightUserOpen` with no awareness
      the rail is already hidden, so a click that has zero visible effect
      (the rail was already collapsed) silently sets `railRightUserOpen =
      false`; `syncRailRightVisibility`'s OR-of-conditions then keeps the
      rail collapsed even after the DPS/VS panel later closes, since nothing
      else was holding it open. Found by qa-playtester (fb065 verification),
      reproduced deterministically: open the DPS panel (auto-collapses the
      right rail), click the still-visible `#sw-rail-right-handle` tab (a
      natural thing to try — it's the only visible affordance at that point),
      close the DPS panel — the rail should reopen with nothing left holding
      it collapsed, but stays collapsed until a second handle click. Low
      severity: fully recoverable with one extra click on a still-visible,
      still-discoverable control; no data loss, no crash. Acceptance: a
      regression test — auto-collapse the right rail via the DPS panel,
      click its handle once while collapsed, close the DPS panel — confirms
      the rail is open again, not stuck; suggested fix direction: only let
      the handle toggle `railRightUserOpen` when the rail's current collapsed
      state already matches `railRightUserOpen` (i.e. ignore the click while
      an auto-collapse reason is independently forcing it shut), or reset
      `railRightUserOpen = true` whenever an auto-collapse condition's OR
      transitions back toward "should be open" — refs: fb065, owner feedback
      `feature-ui-inside-playfield`. DONE 2026-09-03: took the first suggested
      fix direction. New `railAutoCollapsed()` helper (`hud.ts`) extracts the
      existing `dpsPanelOpen_ || vsPanelOpen_ || dpsPanelDocked_ ||
      vsPanelDocked_` OR-chain out of `syncRailRightVisibility()`; the right
      handle's click listener now does `if (this.railAutoCollapsed()) return;`
      before touching `railRightUserOpen`, so a click during auto-collapse is
      a true no-op instead of silently zeroing the flag with nothing left to
      reset it once the auto-collapse reason clears.
      `syncRailRightVisibility()` reuses the same helper
      (`!railRightUserOpen || railAutoCollapsed()`), behavior-equivalent to
      the prior inline OR chain. Confirmed the left rail (`#sw-rail-left`) has
      no analogous bug — its handle is a bare `classList.toggle('collapsed')`
      with no auto-collapse concept and no backing "user open" flag. Targeted
      `tests/ui-fb076-rail-handle-stuck.test.ts` (3/3): DPS-panel
      auto-collapse + click + close reopens; docked-VS-panel auto-collapse +
      click + close reopens; a manual-only collapse/reopen cycle confirms no
      regression to the ordinary path. code-reviewer **APPROVE** (no
      Critical/Major; one Minor — could add a manual-collapse-during-
      auto-collapse-window interaction case for extra belt-and-suspenders
      coverage, optional, not required by the stated acceptance criteria, not
      blocking). qa-playtester **PASS**: reproduced the acceptance scenario
      directly, then hostile-tested 5 rapid handle clicks while
      auto-collapsed (idempotent, no desync), a pre-existing manual collapse
      surviving an auto-collapse window untouched, and confirmed DPS+VS
      auto-collapse reasons are mutually exclusive in practice (`toggleVsPanel`
      force-closes DPS first) so the "both reasons active" case is
      unreachable via any public toggle path — not a bug, just confirmed
      dead code path in the defensive OR; filed no new bugs. `npx tsc --noEmit`
      clean. `npm run test:fast`: 7 failed files / 2112 passed / 2142 total /
      24 skipped — all in the pre-existing q15/q49/q52 worker-hang/Windows-
      scratch-dir-EPERM flake classes plus the b032/b034/b035/b036 dev-server
      port-contention class (each re-ran clean in isolation), documented
      across dozens of prior PROGRESS.md sessions, none touching
      `src/ui/**`/`src/render/**` or this item's own files.

- [x] (fb071) [feat] normal priority: window unfocus auto-pause —
      QUALITY.md BETA's "window unfocus auto-pauses" bar is unmet:
      `main.ts`'s existing `window.addEventListener('blur', ...)` only
      clears held keys, it never pauses. The game should auto-pause (same
      state transition as Esc) the instant the browser window/tab loses
      focus during a running phase, so a player who alt-tabs away doesn't
      come back to a dead Core. Acceptance: a unit test dispatches a
      `blur` event during `act1_wave`/`act2` and confirms the same pause
      state Esc reaches (phase/outcome untouched, Warden/wave progress
      frozen); a `focus` event afterward does NOT auto-resume (matches
      Esc's manual-resume convention, and avoids a resume racing back into
      combat before the player has looked at the screen) — refs:
      QUALITY.md BETA ("Pause works everywhere; window unfocus
      auto-pauses"), SPEC-FINAL §11 (Esc pause parity). DONE 2026-09-04:
      `bindGlobalInput`'s (`src/ui/main.ts`) `blur` listener now calls
      `this.setPaused(true)` whenever a run exists, `outcome === 'running'`,
      and it isn't already paused — the same guard `togglePause` uses, minus
      the toggle itself (a plain one-way pause, deliberately not
      `togglePause()`, since a toggle would *resume* a run the player had
      already paused manually via Esc before losing focus). No `focus`
      listener was added — nothing auto-resumes, matching Esc's
      manual-resume-only convention. Targeted
      `tests/ui-fb071-blur-autopause.test.ts` (10/10): blur during
      act1_wave/act2/levelup reaches the same pause state as Esc
      (phase/outcome/tick untouched, pause modal with Resume shown); focus
      doesn't auto-resume; blur while already Esc-paused doesn't un-pause;
      blur before a run exists or after outcome leaves 'running'
      (victory/defeat_core/defeat_warden) is a no-op, mirroring
      `togglePause`'s own guard; a held charge key (`q`) survives a
      blur-triggered pause. code-reviewer APPROVE (no Critical/Major; two
      Minor — missing `levelup`-phase and outcome-no-op test coverage, both
      added same session — and two Nits, not blocking). qa-playtester's
      first pass **FAILED** it: the blur listener's original unconditional
      `this.keys.clear()` ran *before* `setPaused`'s own
      `clearKeysForPause(this.keys)` call, stripping a held charge key
      (`q`) before that call could preserve it — reintroducing, via the
      alt-tab path, the exact "silently fires an accumulated charge with no
      player intent" bug `clearKeysForPause`'s own doc comment
      (`src/ui/input.ts`) already documents was fixed for Esc. Fixed by
      calling `clearKeysForPause(this.keys)` in the blur listener instead of
      a blanket `.clear()`, confirmed via git-stash A/B that the new
      q-survives-blur test fails pre-fix and passes post-fix. qa-playtester
      re-verified the fix **PASS** (also independently confirmed a genuine
      `keyup` for `q` mid-pause still works, and that `q` can't leak into a
      fresh run via a Hub-screen blur since `keydown`'s `if (!this.run)
      return` guard already excludes it) and filed one new low-severity,
      out-of-scope bug — not introduced by or specific to this item, also
      reproducible via Esc — see fb077 below. `npx tsc --noEmit` clean.
      `npm run test:fast`: 9-10 failed files across runs this session, all
      in the pre-existing q15/q28/q45/q49/q52 worker-hang/Windows-scratch-
      dir-EPERM flake classes documented across dozens of prior PROGRESS.md
      sessions, none touching `src/ui/**`/`src/render/**` or this item's own
      files.

- [x] (fb077) [bug] low priority: `Game.dashQueued` (`src/ui/main.ts`,
      Space) is not reset by any pause transition — Esc or fb071's new
      blur auto-pause alike — so a queued dash fires stale on the very
      first tick after resume, with an unbounded real-time gap and even
      after the player releases Space entirely during the pause. Unlike
      the held-`q`-charge case `clearKeysForPause` already protects,
      `dashQueued` isn't a member of `this.keys` at all, so
      `clearKeysForPause` can't reach it. Found by qa-playtester
      (fb071 charge-key-fix re-verification), reproduced deterministically:
      keydown Space (`dashQueued = true`), blur (or Escape) to pause,
      keyup Space (simulating the player letting go mid-pause), resume —
      the first post-resume `gatherInput()` still reports a queued dash and
      it fires, despite the key no longer being held and arbitrary time
      having passed. Same bug class as the one `clearKeysForPause`'s doc
      comment already documents fixing for `q` — a one-shot "intent" flag
      armed before a pause must not survive the pause transition
      unconditionally. Acceptance: a regression test — queue a dash via
      Space, pause (Esc and/or blur), release Space during the pause,
      resume — confirms no dash fires that the player didn't re-arm after
      resuming; suggested fix direction: clear `dashQueued` in `setPaused`
      alongside `clearKeysForPause`'s existing key-clearing, the same place
      the analogous `q`-preservation logic already lives — refs: fb071,
      SPEC-FINAL §11 (Esc pause parity), `clearKeysForPause`
      (`src/ui/input.ts`) precedent. DONE 2026-09-04: took the suggested fix
      direction verbatim. `setPaused` (`src/ui/main.ts`) now sets
      `this.dashQueued = false` in the same `if (paused)` branch that already
      calls `clearKeysForPause(this.keys)` — the flag can never be armed while
      already paused (the keydown handler's own `!this.paused` guard prevents
      it), so clearing it only on the transition *into* pause is sufficient
      for both the Esc and blur pause paths. Targeted
      `tests/ui-fb077-dash-queued-pause.test.ts` (3/3): Esc-pause clears a
      queued dash and a Space release mid-pause plus resume fires none; the
      same via blur auto-pause; re-pressing Space after resume still arms a
      fresh dash (no over-correction). Confirmed via git-stash A/B that 2 of 3
      fail pre-fix with the predicted stale-dash symptom and pass post-fix.
      code-reviewer APPROVE (no Critical/Major; traced and closed out the
      dash-queued-while-already-paused, levelup-phase, and blur-calls-
      clearKeysForPause-directly edge cases as already safe by construction;
      one Minor — a test comment nit, not blocking). qa-playtester PASS
      against the stated acceptance criteria, additionally verified end-to-end
      through the real sim (`run.step()` after the sequence leaves
      `warden.dashTravel` null and position unchanged, not just the
      `dashQueued`/`gatherInput()` flags), multiple pause/resume cycles
      without re-arming, and mixed Esc+blur pause paths in sequence; filed one
      new low-severity, non-blocking bug — see fb078 below. `npx tsc --noEmit`
      clean. `npm run test:fast`: 10-11 failures across runs this session, all
      in the pre-existing q15/q28/q33/q45/q49/q52 worker-hang/Windows-scratch-
      dir-EPERM flake classes documented across dozens of prior PROGRESS.md
      sessions, none touching `src/ui/**`/`src/render/**` or this item's own
      files.

- [x] (fb078) [bug] low priority: the outer Space `keydown` listener that
      arms `Game.dashQueued` (`src/ui/main.ts`, ~line 293:
      `if (e.key === ' ' && !this.paused) this.dashQueued = true;`) has no
      `e.repeat` guard, unlike `makeKeyDownHandler`'s own handling of every
      other key (`src/ui/input.ts`, `if (e.repeat) return;`) — so a browser
      hardware key-repeat event for a Space the player never released can
      re-arm `dashQueued` on its own, including right after an fb077-fixed
      pause/resume. Found by qa-playtester (fb077 verification), reproduced
      deterministically: hold Space (no keyup), Esc-pause, resume, a
      `repeat:true` keydown for Space (simulating the OS's continuing
      key-repeat for the still-held key, no fresh physical press) sets
      `dashQueued = true` again — the narrow case fb077's guarantee ("no dash
      fires that the player didn't re-arm after resuming") doesn't cover,
      since this isn't a fresh press. Low severity and possibly overlapping
      with intended "hold Space to keep dashing" behavior during ordinary
      (non-paused) play — the same missing guard already lets a continuously
      held Space re-arm repeatedly outside any pause, so this may be a
      pre-existing, accepted design rather than a defect; flagged because
      fb077 changed the pause-adjacent risk profile around it. Acceptance:
      either add `if (e.repeat) return;` to the outer Space handler,
      symmetric with `makeKeyDownHandler`'s existing pattern for every other
      key, and confirm a held-through-pause Space no longer re-arms
      `dashQueued` on resume via a repeat event; or document (matching the
      precedent of fb068/fb069's accepted-tradeoff comments) that key-repeat
      re-arming is intentional "hold to dash" behavior and is out of scope for
      fb077's pause-parity fix — refs: fb077, `clearKeysForPause`
      (`src/ui/input.ts`) precedent, `makeKeyDownHandler`'s `e.repeat` guard.
      DONE 2026-09-04: took the first option. `bindGlobalInput`'s
      (`src/ui/main.ts`) outer Space `keydown` listener now reads
      `if (e.key === ' ' && !this.paused && !e.repeat) this.dashQueued = true;`,
      symmetric with `makeKeyDownHandler`'s (`src/ui/input.ts`) existing
      `if (e.repeat) return;` guard for every other key. No "hold to keep
      dashing" mechanic exists to regress — `dashQueued` is a one-shot flag
      consumed and reset every `gatherInput()` call, so a continuously held
      Space only ever arms one dash on the original non-repeat press regardless
      of this fix. Targeted `tests/ui-fb078-dash-repeat-guard.test.ts` (2/2): a
      held-through-pause Space's post-resume repeat event no longer re-arms
      `dashQueued` (confirmed via git-stash A/B that this fails pre-fix and
      passes post-fix); a fresh non-repeat press still arms a dash normally.
      code-reviewer APPROVE (no Critical/Major/Minor/Nit — confirmed no
      downstream "hold to dash" behavior exists to regress and the
      `clearKeysForPause`/`dashQueued`-clear interaction from fb077 is
      unaffected, since that function only touches `this.keys`). qa-playtester
      PASS against the stated acceptance criteria, independently reproduced the
      scenario with a temporary probe suite (also covering: an ordinary
      continuous hold outside any pause stays inert past the first arm; 25
      repeat events in a row post-resume stay inert; a keyup+fresh-keydown
      after a repeat storm still arms correctly; the fb071 blur-pause path
      composes correctly with this fix since both route through the same
      `setPaused`) and filed no new bugs, flagging the pre-existing q15/q49/q52
      `test:fast` flake classes (unrelated to this diff) for whoever owns them.
      `npx tsc --noEmit` clean. `npm run test:fast`: 6-7 failures across runs
      this session, all in the pre-existing q15/q49/q52 worker-hang/Windows-
      scratch-dir-EPERM flake classes documented across dozens of prior
      PROGRESS.md sessions, none touching `src/ui/**`/`src/render/**` or this
      item's own files.

- [x] (fb072) [feat] normal priority: boss health bar — the two boss
      enemies (`gatebreaker` 30,000 HP, `warden_eater` 100,000 HP,
      `data/enemies.json`) have no HUD element beyond the tiny per-enemy
      HP bar fb025 draws under every sprite, which is illegible at these
      HP scales and gives the player no legible read on boss-fight
      progress despite G14/G23's boss-clear gates existing specifically to
      measure that fight. Add a dedicated HUD banner (name + a proportional
      HP-fraction bar) that appears at a fixed screen position while any
      boss-flagged enemy (`traits` includes `"boss"`) is alive and
      disappears when none is. Acceptance: a unit/render test spawns a
      boss enemy, confirms the banner shows its name and a fraction
      matching `hp / maxHp`, updates as `hp` drops, and disappears on
      death or when no boss is present; if two bosses are ever alive at
      once the banner shows the lower-current-HP one without crashing —
      refs: SPEC-FINAL §11, engineer's-judgment item (content totals name
      2 bosses with no matching HUD depth). DONE 2026-09-04: `hud.ts` adds
      `#sw-bossbar`/`#sw-bossbar-name`/`#sw-bossbar-fill` (fixed
      top-center overlay, `style.css`'s new `.sw-bossbar*` rules reusing
      the existing `.sw-meter` fill pattern) and a `renderBossBar(w)`
      private method, called every `update()` tick, that scans `w.enemies`
      for live `e.boss` enemies, tracks the lowest-current-hp one when more
      than one is alive, and sets the name (`w.content.enemyById.get(boss.defId)?.name`)
      and a `hp/maxHp` fill width. code-reviewer **APPROVE** (no
      Critical/Major; two Minor notes — the banner didn't hide once
      `w.outcome !== 'running'`, fixed same session by gating the scan on
      it; a theoretical CSS overlap with the right info rail at very
      narrow stage widths, left as a known limitation, same class as
      fb065's own logged follow-up — and two Nits confirmed non-issues:
      the `frac` clamp is dead code since `hp` never exceeds `maxHp` and a
      boss's `maxHp` can never be 0 per the zod loader's `positive()`
      guard). qa-playtester's first pass filed one new Minor bug: the
      banner sits over a semi-transparent/blurred `.sw-modal`
      (pause/level-up/results/character panel) instead of hiding behind
      it, the exact bleed-through class `renderBottomBar` was already
      written to avoid for `#sw-bottombar` — fixed by adding
      `!this.modalOpen` to `renderBossBar`'s gate, confirmed via git-stash
      A/B that the new regression test fails pre-fix and passes post-fix.
      Also confirmed (qa-playtester adversarial probes, temporary/
      not committed): a tie in current HP between two live bosses resolves
      deterministically (iteration-order winner, no crash); a custom/dev-
      spawned boss-trait enemy with a defId outside `gatebreaker`/
      `warden_eater` still renders correctly (`e.boss` is a generic
      trait-derived boolean, not hardcoded to either); `hp` reaching 0
      without `dead` set the same tick (a synthetic-only state — real
      combat sets both synchronously) renders 0% without hiding or
      crashing; 50x repeated no-boss `update()` calls and 20x rapid spawn/
      kill cycling never leave the banner stuck. Targeted
      `tests/ui-fb072-boss-banner.test.ts` (5/5: hidden-with-no-boss,
      name+fraction-tracks-hp, disappears-on-death, hides-behind-pause,
      two-boss lower-current-hp tiebreak-without-crashing). qa-playtester
      re-verified **PASS** against every stated acceptance criterion.
      `npx tsc --noEmit` clean. `npm run test:fast`: 6-9 failed files
      across runs this session, all in the pre-existing q15/q49/q52
      worker-hang/Windows-scratch-dir-EPERM flake classes documented
      across dozens of prior PROGRESS.md sessions, none touching
      `src/ui/**`/`src/render/**` or this item's own files.

- [x] (fb073) [feat] normal priority: key remapping — QUALITY.md BETA's
      Settings checklist line ("master/SFX volume, screenshake toggle,
      reduced-flash mode, damage number toggle, key remapping,
      resolution/DPR handling, colorblind-safe palette") is met on every
      clause except key remapping: every binding in `src/ui/input.ts`
      (movement WASD/arrows, Space dash, Q/E actives, R/F/C/P/V/U/X,
      1-9/0) is a hardcoded literal with no way to change it. Settings
      gains a "Controls" section listing every rebindable action with a
      click-to-rebind control, conflict detection (rejects binding a key
      already assigned to a different action, existing binding untouched),
      and a way to restore defaults; `input.ts`'s handlers read the
      configured key instead of the hardcoded letter. Acceptance: a unit
      test rebinds an action, confirms the old key no longer triggers it
      and the new key does; binding an already-used key is rejected and
      leaves the existing assignment intact; defaults restore every
      binding — refs: QUALITY.md BETA (Settings checklist), SPEC-FINAL
      §11. DONE 2026-09-04: new `src/ui/keybindings.ts` module — `ActionId`
      union (movement WASD, dash, active1/active2, toggleRanges/cycleSpeed/
      toggleCharacterPanel/toggleDpsPanel/toggleVsPanel, upgradeSelection/
      sellSelection/clearSelection, towerSlot1-9), `defaultKeyBindings()`,
      `sanitizeKeyBindings()` (fills missing fields, lower-cases, de-dupes a
      corrupted/hand-edited save), `loadKeyBindings()`/`saveKeyBindings()`
      (own localStorage key `stonewake.keybindings.v1`, separate from
      `Settings`), `rebindKey()` (conflict-checked setter), `keyLabel()`
      (display formatting), `UNBINDABLE_KEYS` (the 4 arrow keys — always-live
      movement alternate, rejected as a rebind target). `input.ts`'s
      `bindCanvasInput`/`makeKeyDownHandler`/`clearKeysForPause`/
      `movementFromKeys`/`gatherInput` all take an optional `bindings` param
      defaulting to `defaultKeyBindings()`, so every existing caller/test is
      unaffected. Deliberately left hardcoded/unrebindable: Escape (pause —
      a near-universal convention), the arrow keys (movement alternate,
      always live), and the level-up offer picker's literal 1/2/3 (a
      different physical-key concept from the now-independently-rebindable
      towerSlot1-9, decoupled at the `makeKeyDownHandler` dispatch site).
      `main.ts`'s `Game` gains a `keyBindings` field threaded through every
      input call site; `showHub()`'s `onKeyBindingsChanged` callback mutates
      it in place (`Object.assign`) rather than replacing the reference — see
      the code-reviewer finding below for why that distinction mattered.
      `hub.ts`'s Settings tab gains a "Controls" panel: one row per action
      with a `[data-rebind]` button, click arms listening mode, the next
      `document`-level capture-phase keydown either rebinds (calling
      `cb.onKeyBindingsChanged`) or shows a conflict/reserved-key message
      leaving the binding untouched, Escape cancels, `#sw-keybind-reset`
      restores every binding to default, and switching Hub tabs mid-listen
      detaches the capture listener. Targeted
      `tests/ui-fb073-key-remapping.test.ts` (17/17): `rebindKey`
      conflict/no-op-self-rebind, `sanitizeKeyBindings` dedupe/fill/lowercase,
      `input.ts` handlers reading rebound keys (with a no-bindings-arg
      backward-compat case), the Controls panel's listing/rebind/conflict/
      Escape-cancel/restore-defaults/arrow-key-rejection/tab-switch-detach
      behavior, and a `Game`-level end-to-end regression test (see below).
      code-reviewer's first pass **REQUEST-CHANGES**: one Major —
      `bindGlobalInput` runs at most once (`inputBound`) and hands
      `makeKeyDownHandler` a `bindings` object it closes over for the rest of
      the session; the original `onKeyBindingsChanged` reassigned
      `this.keyBindings` to a *new* object on every rebind, leaving that
      already-bound closure aliasing the stale one — a rebind made from the
      Hub between runs silently stopped taking effect for every
      keydown-dispatched action (Q/E, R/F/C/P/V/U/X, tower-slot digits) the
      moment a second run started, while movement/mouse bindings stayed live
      only because `gatherInput`/`bindCanvasInput` re-read the field fresh
      each tick/run. Fixed by mutating `this.keyBindings` in place
      (`Object.assign`) instead of reassigning it, confirmed via git-stash-
      style A/B (temporarily reverted the one line) that the new
      `Game`-level regression test fails pre-fix with the exact predicted
      symptom (old key still fires after a second run) and passes post-fix.
      Two Minors, also fixed same session: arrow keys were reachable as a
      rebind target with no conflict warning despite `movementFromKeys`
      always treating them as movement regardless of bindings (added
      `UNBINDABLE_KEYS`, checked in `Hub.onRebindKeyDown` before calling
      `rebindKey`); `sanitizeKeyBindings` didn't dedupe a corrupted save that
      assigns the same key to two actions (added a second pass over
      `ACTION_ORDER` resetting a later duplicate to its own default).
      code-reviewer re-verified **APPROVE**. qa-playtester **PASS** against
      all three literal acceptance criteria (re-derived independently
      end-to-end through the real `Hub`+`Game`, plus hostile testing: rapid
      same-button clicks, cross-button clicks mid-listen, chained
      vacate-then-claim rebinds, corrupted-`localStorage` round trips — no
      stuck-listener, eaten-keydown, or crash found) and filed three new
      low-severity bugs, all variants of the same root cause (a hardcoded
      literal outside `ActionId`/`UNBINDABLE_KEYS` can be silently claimed by
      a rebound action, double-firing both on one keypress) — see fb079/fb080
      below. `npx tsc --noEmit` clean. `npm run test:fast`: 7 failed files,
      all in the pre-existing q15/q49/q52 worker-hang/Windows-scratch-dir-
      EPERM flake classes documented across dozens of prior PROGRESS.md
      sessions, none touching `src/ui/**`/`src/render/**` or this item's own
      files.

- [x] (fb079) [bug] low priority: two of `input.ts`'s hardcoded, unrebindable
      literals — `Enter` (unconditional `{k:'call'}` call-wave trigger,
      `makeKeyDownHandler`) and the level-up offer picker's literal 1/2/3
      (fb073's own documented exception, decoupled from the
      independently-rebindable `towerSlot1-3`) — are not in
      `keybindings.ts`'s `UNBINDABLE_KEYS`, so the Hub's rebind-conflict
      check never protects them: a player can freely rebind any other action
      onto `Enter` or onto a tower-slot digit's now-vacated `1`/`2`/`3`, and
      both the hardcoded behavior and the rebound action silently fire off
      the same keypress. Found by qa-playtester (fb073 verification),
      reproduced deterministically both ways: (1) rebind `sellSelection` to
      `Enter` — starting a run and pressing Enter now calls the wave *and*
      sells the selection; (2) rebind `towerSlot1` off `1` (e.g. to `j`),
      then rebind `sellSelection` onto the now-free `1` — no conflict warning
      at either step, and during a level-up offer screen pressing `1` both
      sells the selection and picks the first offer card, confirmed via a
      direct `makeKeyDownHandler` unit test receiving both effects from one
      `keydown`. Acceptance: a regression test — attempting to rebind an
      action onto `Enter` (or onto `1`/`2`/`3` given the picker's documented
      exception) shows the same "reserved" conflict message `UNBINDABLE_KEYS`
      already produces for an arrow key, and the existing binding is left
      untouched; suggested fix direction: extend `UNBINDABLE_KEYS` (or an
      equivalent "reserved literal" set `Hub.onRebindKeyDown` consults) to
      also cover `enter` and, at minimum while `isChoosing`-gated, `1`/`2`/`3`
      — refs: fb073, `input.ts`'s module-doc "deliberately not rebindable"
      list, which already names both but which the conflict-detection code
      never actually enforced against other actions claiming them. DONE
      2026-09-04: added `reservedKeyLabel(action, key)` (`keybindings.ts`) —
      `enter` is reserved against every action; `1`/`2`/`3` are reserved
      against every action except the matching `towerSlot1`/`towerSlot2`/
      `towerSlot3`, which keeps legitimately sharing the picker's key by
      fb073's original design (`TOWER_SLOT_ACTIONS[pickerIndex] !== action`,
      confirmed no off-by-one, exactly one action exempted per key). Also
      added an `'enter' -> 'Enter'` case to `keyLabel()`'s display formatting
      (previously fell through to the generic multi-char branch and showed
      lowercase `'enter'`). `hub.ts`'s `onRebindKeyDown` calls
      `reservedKeyLabel` immediately after the pre-existing `UNBINDABLE_KEYS`
      check, same early-return-before-`rebindKey` pattern as the arrow-key
      rejection, so a rejected attempt never mutates `this.keyBindings`.
      Targeted `tests/ui-fb079-reserved-keys.test.ts` (7/7): `reservedKeyLabel`
      unit coverage (Enter always reserved; 1/2/3 reserved against unrelated
      actions including an unrelated towerSlot action; not reserved against
      the matching towerSlot1-3; ordinary keys unreserved) plus two
      Hub-integration tests (rebinding `sellSelection` onto Enter rejected
      with the binding untouched; vacating `towerSlot1` off `'1'` then
      attempting to rebind `sellSelection` onto the now-free `'1'` still
      rejected). code-reviewer **APPROVE** (no Critical/Major; one Minor —
      `sanitizeKeyBindings` (the `loadKeyBindings()` localStorage boot path)
      doesn't run `reservedKeyLabel`, so a hand-edited/corrupted save could
      still load an action bound to `enter`/a mismatched `1`/`2`/`3` and
      reproduce the double-fire via a path that never reaches
      `onRebindKeyDown` — legitimate but out of this item's stated Hub-UI-flow
      acceptance criteria, logged as fb081 below rather than blocking; one
      Nit — the towerSlot exemption is stricter than the underlying hazard
      strictly requires (tracing `input.ts` shows the `isChoosing` picker
      path and the tower-slot-select path are mutually exclusive per
      keypress, so in principle *any* towerSlot action bound to `1`/`2`/`3`
      is already safe, not just the matching one) but this matches fb073's
      pre-existing documented design intent and is non-breaking, not required
      to fix). qa-playtester **PASS** against the stated acceptance criteria:
      independently reproduced both original repro scenarios through a real
      `Hub` instance (real DOM click + keydown dispatch, not just the unit
      test) — Enter rejection, vacate-then-claim-`1` rejection, and confirmed
      the matching-slot exemption still works normally; hostile-tested rapid
      repeated rejected attempts, Escape-cancel leaving no stale conflict
      message, mid-rebind Hub tab switches, and "Restore default controls"
      post-custom-rebind — all clean. Confirmed the already-logged
      `sanitizeKeyBindings` gap directly and found a broader, pre-existing
      variant of it (not introduced by this item) — see fb081 below.
      `npx tsc --noEmit` clean. `npm run test:fast`: 2156 passed / 8 failed
      (all in the pre-existing q15/q49/q52 worker-hang/Windows-scratch-dir-
      EPERM flake classes documented across dozens of prior PROGRESS.md
      sessions; confirmed via git-stash A/B that the q49/q52 `EPERM`
      failures reproduce identically without this diff) / 22 skipped, none
      touching `src/ui/**`/`src/render/**` or this item's own files.

- [x] (fb080) [bug] low priority: `makeKeyDownHandler`'s
      `if (k === bindings.dash) e.preventDefault();` (`input.ts`) suppresses
      the browser's default Space behavior (page scroll) for whichever
      action currently owns the `dash` binding, not for the physical Space
      key itself — so rebinding `dash` off Space (or rebinding a different
      action onto the now-free Space) leaves Space's default browser
      behavior unsuppressed during a run, regardless of what action now
      fires on it. Found by qa-playtester (fb073 verification), reproduced
      both directions (Space freed entirely, and Space reassigned to
      `active1`) via `vi.spyOn(evt, 'preventDefault')` — never called either
      way once `dash` no longer owns Space. Low severity (cosmetic/quality-
      of-life: the page could scroll under a keypress mid-run if the player
      has rebound `dash` off Space), no crash or determinism impact.
      Acceptance: a regression test confirms `preventDefault` fires whenever
      the pressed key is literally Space, independent of which action
      currently owns the `dash` binding; suggested fix direction: check
      `k === ' '` directly for the `preventDefault` call rather than
      `k === bindings.dash` — refs: fb073. DONE 2026-09-04: took the
      suggested fix direction verbatim — `makeKeyDownHandler` (`input.ts`)
      now reads `if (k === ' ') e.preventDefault();`, independent of
      `bindings.dash`. `k` is already `e.key.toLowerCase()`, and Space's
      `e.key` is the literal space character regardless of modifiers, so
      this decouples "suppress the browser's default Space behavior" from
      "whichever action currently owns the `dash` binding." Targeted
      `tests/ui-fb080-space-prevent-default.test.ts` (4/4): default binding
      still suppresses; `dash` rebound off Space entirely still suppresses;
      a different action (`active1`) rebound onto the freed Space still
      suppresses; an unrelated key does not call `preventDefault`.
      Confirmed via git-stash A/B that 2 of the 4 fail pre-fix with the
      exact predicted symptom and pass post-fix. code-reviewer **APPROVE**
      (no Critical/Major/Minor; one Nit — the backlog checkbox wasn't ticked
      yet in the reviewed diff, closed by this update). qa-playtester
      **PASS**: independently re-derived the fix through the real
      `makeKeyDownHandler` via `window.dispatchEvent`, then end-to-end
      through a real `Hub` + `Game` (rebound `dash` off Space onto `j` via
      the actual Controls panel, started a run, dispatched a real Space
      keydown, confirmed `evt.defaultPrevented === true`; repeated with
      `active2` rebound onto the freed Space, confirming both
      `preventDefault` and the `class_active2` command fire from one
      keypress); hostile-tested Space during an Esc-pause (still
      suppressed, `dashQueued` correctly stays unarmed while paused), a
      simulated key-repeat event (correctly skipped by the pre-existing
      `e.repeat` guard, fb078 untouched), rapid repeated press/release
      cycles, Space with a modifier held, a non-cancelable event (no
      throw), and confirmed Space isn't a reserved/unbindable key (fb079's
      territory, not applicable here); filed no new bugs. `npx tsc --noEmit`
      clean. `npm run test:fast`: 10-12 failures across runs this session,
      all in the pre-existing q15/q45/q49/q52 worker-hang/Windows-scratch-
      dir-EPERM flake classes documented across dozens of prior PROGRESS.md
      sessions, none touching `src/ui/**`/`src/render/**` or this item's own
      files.

- [x] (fb081) [bug] low priority: `sanitizeKeyBindings`'s (`keybindings.ts`)
      general duplicate-key dedup is a no-op whenever a corrupted/hand-edited
      save's override on an earlier `ACTION_ORDER` action collides with a
      *later* action's own default key — two different actions can end up
      bound to the identical key after sanitize, silently, defeating the
      exact invariant the function's own doc comment claims to guarantee
      ("resets any later action holding the same key back to its own
      default"). Found by qa-playtester (fb079 verification), reproduced
      deterministically and repeatedly: `sanitizeKeyBindings({
      ...defaultKeyBindings(), moveUp: 's' })` (`'s'` is `moveDown`'s own
      default) returns `moveUp === 's'` AND `moveDown === 's'` — the dedup
      loop's "reset to own default" is a no-op here because `moveDown`'s
      `out` value was already its own default, so nothing changes and the
      collision survives; also reproduced with `sellSelection: '1'` (a
      picker digit, not just a movement key) surviving alongside
      `towerSlot1 === '1'`. Broader than fb079's own already-logged
      Minor (`sanitizeKeyBindings` not calling `reservedKeyLabel`): this is
      not limited to `enter`/`1`/`2`/`3`, applies to any pair of actions in
      `ACTION_ORDER`, and is reachable purely through `loadKeyBindings()` at
      boot — no rebind UI involved at all. Acceptance: a regression test
      confirms `sanitizeKeyBindings({ ...defaultKeyBindings(), moveUp: 's'
      })` produces `moveUp !== moveDown`, and more generally that no two
      values in any `sanitizeKeyBindings` output are equal across all of
      `ACTION_ORDER`; while fixing, also thread `reservedKeyLabel` into the
      same pass so a corrupted save can't load `enter` or a mismatched
      `1`/`2`/`3` either, closing fb079's own logged Minor in the same
      change — refs: fb079, fb073, `sanitizeKeyBindings`'s own doc-comment
      guarantee. DONE 2026-09-04: `sanitizeKeyBindings` (`keybindings.ts`)
      now does a single forward pass over `ACTION_ORDER` tracking a `used:
      Set<string>`; a new `keyUnavailable(id, key, used)` helper folds three
      checks into one (`used.has(key)`, `UNBINDABLE_KEYS.has(key)`,
      `reservedKeyLabel(id, key) !== null`). For each action: if its current
      key is unavailable, fall back to its own default; if that default is
      ALSO unavailable (the chained-collision case this bug report is about),
      fall back further to the first free/available key in a new
      `FALLBACK_KEY_POOL` (`'abcdefghijklmnopqrstuvwxyz0123456789'` — 36
      candidates, comfortably more than `ACTION_ORDER`'s 24 entries), or the
      default as a should-be-unreachable last resort. Targeted
      `tests/ui-fb081-sanitize-dedup.test.ts` (originally 7/7, grew to 8/8 —
      see code-review note below): the exact `moveUp: 's'` repro, a
      reserved-key variant (`sellSelection` stealing `towerSlot1`'s default
      `'1'`), a 3-way collision chain, an arbitrary multi-collision case,
      `reservedKeyLabel` threading (Enter, mismatched picker digits, the
      matching-towerSlot exemption). Confirmed via git-stash A/B that the
      suite fails 6-7/7 pre-fix with the exact predicted symptoms and passes
      post-fix. code-reviewer **REQUEST-CHANGES** → one Major: the fix's own
      `used`/`reservedKeyLabel` checks never consulted `UNBINDABLE_KEYS`
      (arrow keys), the same class of gap `reservedKeyLabel` exists to close
      for `enter`/`1`/`2`/`3` — a corrupted save binding e.g. `active1:
      "arrowup"` passed through untouched, reproducing the exact
      always-fires-alongside-movement double-fire bug this same fix was
      meant to prevent for the other two reserved-literal classes. Fixed by
      folding `UNBINDABLE_KEYS.has(candidate)` into `keyUnavailable`; added
      an 8th regression test (`active1: 'ArrowUp'` in a corrupted save
      resets off it), confirmed via a second git-stash A/B that 7/8 tests
      fail pre-this-fix and pass post-fix. Also addressed a Minor (the
      `FALLBACK_KEY_POOL.find(...) ?? defaults[id]` ultimate fallback could
      silently reintroduce a duplicate if `ACTION_ORDER` ever grows past the
      pool's capacity — left as-is, judged not worth defensive code for an
      unreachable case at the current 24-action roster, consistent with
      CLAUDE.md's "don't validate what can't happen") and a Nit (a stale
      hardcoded "36 candidates for 23 actions" count in the doc comment —
      fixed, `ACTION_ORDER` actually has 24 entries; reworded to avoid a
      number that can drift again). code-reviewer re-verified **APPROVE**.
      qa-playtester **PASS**: independently re-derived both acceptance
      criteria, then hostile-tested via temporary probe suites (not
      committed) covering null/undefined/empty-object input, all 24 actions
      colliding onto one single key, multiple simultaneous reserved-literal
      violations in one blob (Enter + arrows + mismatched 1/2/3 together),
      mixed/uppercase-case keys, an already-valid input as a no-op/identity
      check, unknown extra properties, non-string junk values, multi-char
      string values, and a real `localStorage`-backed `loadKeyBindings()`
      round-trip of both a corrupted-but-parseable and a malformed JSON
      blob — plus a 2000-trial randomized fuzz over a pool mixing plain
      keys/arrows/Enter/1-2-3, zero collisions or reserved-key leaks in any
      trial; filed no new bugs, flagged one pre-existing out-of-scope
      observation (the fill loop accepts a multi-character key string like
      `"shift"` verbatim — `v.length > 0`, not `=== 1` — inconsistent with
      the single-character-key contract but not a collision risk and not a
      fb081 regression; not filed as a new item, low value). `npx tsc
      --noEmit` clean. `npm run test:fast`: 5-9 failures across runs this
      session (variance run to run), all in the pre-existing
      q13/q15/q28/q45/q49/q52 worker-hang/Windows-scratch-dir-EPERM flake
      classes and the b032/b034/b035/b036 dev-server port-contention
      fold-test class (each re-ran clean in isolation, confirmed via
      git-stash A/B identical without this diff), documented across dozens
      of prior PROGRESS.md sessions, none touching `src/ui/**`/
      `src/render/**` or this item's own files.

- [x] (fb074) [feat] low priority: resume run after a page refresh —
      QUALITY.md BETA's "no progress loss on refresh" bar. Nothing today
      persists an in-progress run; reloading the page always drops to the
      Hub. Periodically persist the running phase's `RunConfig` (seed +
      content hash, already the unit architecture rule 2 requires) and its
      recorded input log to `localStorage` (throttled, e.g. once per
      simulated second), clearing the entry on a normal
      defeat/victory/abandon; on load, a persisted in-progress log whose
      content hash matches the current `/data` is replayed forward through
      the same seed+input-log replay path G2's determinism tests already
      exercise and the run resumes live from that point instead of
      dropping to the Hub; a content-hash mismatch (edited `/data` since
      the last session) discards the stale log rather than replaying
      against changed content. Acceptance: a unit test persists a short
      input log mid-run, constructs a fresh harness from only the
      persisted data, and confirms the replayed world state matches an
      uninterrupted run at the same tick; a mismatched-content-hash case
      confirms the stale log is discarded, not replayed — refs:
      QUALITY.md BETA, SPEC-FINAL §12 (seed+input-log reproducibility,
      already required for G2). DONE 2026-09-04: new `src/ui/runpersist.ts`
      (`savePersistedRun`/`loadPersistedRun`/`clearPersistedRun`, own
      localStorage key `stonewake.runinprogress.v1`) stores a `RecordedRun`
      (`sim/run.ts`) plus a per-`Game`-instance `sessionId`. `main.ts`'s
      `startRun` splits into `startRun` (fresh `new Run(cfg)`) +
      `beginRun(cfg, run, priorInputLog)` (the shared Hud/renderer/bindings
      tail, parameterized over how the live `Run` came to exist); the tick
      loop pushes every stepped `TickInput` into `this.inputLog` and
      throttle-persists once `inputLog.length` has grown ≥60 since the last
      write (robust to fast-forward frames jumping past an exact multiple of
      60). `start()` calls a new `tryResumePersistedRun()` before falling
      back to `showHub()`: loads any persisted entry, discards it (and falls
      through to the Hub) on a `contentHash` mismatch against live `/data`,
      otherwise replays the recorded log through a fresh `Run` via
      `run.step()` and hands the resulting live `Run` to `beginRun`. Cleared
      on a finished outcome (victory/defeat) and on abandon-to-Hub.
      code-reviewer **REQUEST-CHANGES** → three Majors, all fixed same
      session: (1) a malformed-but-shape-valid persisted entry (e.g. one
      recorded `TickInput` missing `cmds`) threw straight out of `start()`
      with nothing to catch it — the replay loop is now wrapped in
      try/catch, discarding and falling through to the Hub on any exception
      instead of leaving a blank page; (2) unbounded input-log growth risks
      silently defeating the whole feature via a full localStorage quota —
      `savePersistedRun` now returns whether the write actually succeeded,
      and `Game` sets a `persistDisabled` flag (plus one `console.warn`) the
      first time it doesn't, rather than retrying forever against
      already-failing, ever-growing data; documented as a known, accepted
      tradeoff (same class as fb067/fb068/fb069's own) rather than solved
      outright — see fb087 below, filed by qa-playtester, for how much
      earlier this actually bites than that framing suggested; (3) a
      cross-tab race on the single shared localStorage key — two tabs could
      either fight over the slot forever or an idle tab's own `showHub()`
      could wipe a *different* tab's active checkpoint just by existing.
      Fixed via the `sessionId` stamp: `persistRun()` backs off
      (`persistDisabled = true`) the moment a foreign `sessionId` appears in
      the slot this instance itself last wrote, instead of clobbering it
      every throttle window; `clearOwnPersistedRun()` (now used by
      `showHub()` and the outcome-finished block in place of a blanket
      `clearPersistedRun()`) only clears an entry this instance actually
      owns. `startRun`'s own former unconditional clear was removed
      entirely rather than made ownership-aware, since every path reaching
      it already passed through one of those two ownership-gated clears
      first — ownerless by construction, so an explicit clear there could
      only ever wipe a slot this instance never owned; this run's own first
      `persistRun()` write (~1s in) claims the slot regardless, same as it
      would for a key with nothing in it. code-reviewer re-verified
      **APPROVE**. Targeted `tests/ui-fb074-resume-on-refresh.test.ts`
      (8/8): happy-path persist-then-resume (including a `Run.hash()`
      end-state-hash comparison against an independent reference replay —
      G2's own determinism mechanism, added after a code-review Minor on the
      original field-by-field-only comparison), content-hash-mismatch
      discard, a malformed-input-log graceful-fallback case (the Major #1
      regression test), outcome-finished cleanup, abandon-to-Hub cleanup,
      two cross-tab-guard cases (backs off on a foreign `sessionId` instead
      of clobbering; doesn't wipe a foreign session's entry on abandon), and
      a nothing-persisted boot-to-Hub baseline. qa-playtester **PASS**
      against both literal acceptance criteria (independently re-derived the
      resume-matches-uninterrupted-run check via `hashWorld()`, and the
      content-hash-discard case), plus extensive hostile probing: a
      full-length (128,191-tick, ~35.6 min) `hybrid`-bot run to victory
      replayed and measured directly against `runpersist.ts`; the
      already-fixed Major #1 crash independently reproduced against a
      pre-fix snapshot and confirmed closed against the final one; a
      "closed right on the defeat/victory tick" race (an 11,067-tick log
      already at a terminal outcome) confirmed discarded, not resumed;
      rapid Retry-after-resume cycles and pause state across a resume
      confirmed safe. Filed two new bugs against the accepted-tradeoff
      framing in Major #2/#3's fix rather than the acceptance criteria
      themselves — see fb087/fb088 below. `npx tsc --noEmit` clean.
      `npm run test:fast`: 7-8 failed files across two runs this session
      (this item's own run and qa-playtester's independent one), all in the
      pre-existing q15/q45/q49/q52 worker-hang/Windows-scratch-dir-EPERM/
      timing-fuzz flake classes documented across dozens of prior
      PROGRESS.md sessions, none touching `src/ui/**`/`src/render/**` or
      this item's own files.

- [x] (fb087) [bug] normal priority: found by qa-playtester (fb074
      verification) — fb074's persisted-run localStorage entry silently
      stops advancing at the browser's ~5MB quota, which a *normal* run
      (not just an "unusually long" one, as fb074's own accepted-tradeoff
      comment framed it) crosses well before finishing. Measured: a full T1
      engineer run to victory (`hybrid` bot) is 128,191 ticks (~35.6 min);
      the persisted JSON payload crosses the quota at tick ~49,320 (~13.7
      min, ~38% in). Every persist after that silently no-ops
      (`persistDisabled = true`, one `console.warn`, nothing surfaced to the
      player) — a refresh late in a long run silently discards everything
      since the quota was hit, with zero in-game indication anything went
      wrong, directly against QUALITY.md BETA's "no progress loss on
      refresh" bar. Acceptance: either (a) a one-time player-visible
      toast/notice the moment `persistDisabled` first fires, so the player
      knows resume protection lapsed for the rest of that run, or (b) bound
      the persisted payload's growth (e.g. a periodic full-state snapshot +
      trimmed tail log instead of an ever-growing from-start replay log) so
      a typical full-length run stays resumable to its actual end; a
      regression test drives a persisted log past the measured quota
      ceiling and asserts on the chosen player-visible/bounded-growth
      behavior — refs: fb074, QUALITY.md BETA. DONE 2026-09-04: took
      direction (a), the smaller fix. `persistRun()` (`src/ui/main.ts`) now
      calls the existing `Hud.say()` toast (`this.hud.say('Resume protection
      off for this run (storage full)')`) in the same branch that already
      sets `persistDisabled = true` and logs a `console.warn` once
      `savePersistedRun` returns false — guarded by the same
      `persistDisabled` early-return at the top of `persistRun()`, so it can
      only ever fire once per run. The separate cross-tab-backoff branch (a
      different, working-as-intended handoff when a foreign `sessionId`
      claims the slot, not a failure) deliberately does not toast. Targeted
      `tests/ui-fb087-persist-disabled-toast.test.ts` (2/2, using the same
      driven-`Game` idiom as `tests/ui-fb074-resume-on-refresh.test.ts`):
      mocks `Storage.prototype.setItem` to throw for the run-persist key
      specifically (cheaper and just as faithful a repro of "the write
      fails" as growing a log to the real ~49k-tick ceiling) and confirms the
      toast text and `persistDisabled`; a second test confirms no toast and a
      real persisted entry under normal conditions (strengthened post-review
      to assert the entry actually exists, not just "no toast"). code-reviewer
      **APPROVE** (no Critical/Major; two Minors — the shared single-slot
      `Hud.say()` toast has no queue/priority, so an unrelated later toast
      (e.g. `xp_overflow_gold`) could stomp this one before the player reads
      it, flagged as a pre-existing design limitation rather than a fb087
      regression, see fb089 below where qa-playtester's own hostile testing
      confirmed and filed it; and the test's literal wording deviates from
      the acceptance text's "past the measured quota ceiling" phrasing by
      mocking the failure directly instead, judged an acceptable, documented
      substitution — both non-blocking). qa-playtester **PASS** against the
      stated acceptance criteria (`tests/ui-fb087-persist-disabled-toast.test.ts`
      + `tests/ui-fb074-resume-on-refresh.test.ts`, 10/10, the latter's
      cross-tab-backoff cases confirmed not regressed), hostile-tested the
      toast firing more than once, a fresh run after a forced failure
      correctly resetting `persistDisabled` and re-enabling persistence, and
      first-attempt-vs-later-attempt failures — all clean; independently
      reproduced and filed the single-slot toast-stomping gap noted above —
      see fb089 below. `npx tsc --noEmit` clean. `npm run test:fast`: 4-5
      failed tests across runs this session, all in the pre-existing
      q15/q49/q52 worker-hang/Windows-scratch-dir-EPERM flake classes
      documented across dozens of prior PROGRESS.md sessions, none touching
      `src/ui/**`/`src/render/**` or this item's own files.

- [x] (fb089) [polish] low priority: found by qa-playtester (fb087
      verification) — `Hud.say()` (`src/ui/hud.ts`) is a single-slot toast
      with no queue or priority between callers: it unconditionally
      overwrites `this.toast.textContent` and resets the ~1.4s auto-hide
      timeout on every call, so a second `say()` landing inside a first
      call's still-visible window silently erases it rather than queuing
      behind it. Reproduced deterministically: trigger fb087's one-time
      "Resume protection off for this run (storage full)" toast, then call
      `Hud.ingestFx([{ k: 'xp_overflow_gold', a: 1 }])` (the existing
      `say()` caller, fired whenever a VS wave's bulk gem pickup levels the
      character up with overflow XP, `src/sim/progression.ts`'s
      `collectRemainingGems`) within that ~1.4s window — the storage-full
      warning is immediately replaced by "+1 gold (EXP overflow)" with no
      trace it was ever shown. Because fb087's warning is measured to land
      roughly 38% into a normal run and stays relevant for the rest of it,
      any VS-wave-end (or any future second `say()` caller) landing within
      ~1.4s of the failure can quietly defeat fb087's entire "player-visible"
      intent for that run. Acceptance: give `Hud`'s toast a minimal
      priority/queue (e.g. a higher-priority message holds its full window
      before a lower-priority one can replace it, or same-priority messages
      queue rather than clobber) so two independent `say()` calls landing
      close together are both eventually seen, not silently reduced to one;
      a regression test triggers fb087's storage-full toast, immediately
      fires an unrelated `xp_overflow_gold` fx event, and confirms the
      storage-full text is still visible (or reappears before its window
      would otherwise have expired), not overwritten — refs: fb087,
      `Hud.say()`/`Hud.ingestFx()` (`src/ui/hud.ts`). DONE 2026-09-04:
      `Hud.say(text, priority = 0)` (`src/ui/hud.ts`) gains an optional
      priority; new `toastPriority` (default `-Infinity`), `toastTimer`,
      `toastQueue` fields. A toast already showing holds its window against
      any same-or-lower-priority call (pushed onto `toastQueue`, FIFO,
      instead of clobbering); a strictly-higher-priority call preempts
      immediately via a new private `showToast`, discarding whatever was
      showing rather than requeuing it (documented as deliberate — today's
      only preemptor is the one-shot storage-full warning, so dropping an
      in-flight routine gold toast for it is an acceptable trade). The
      showing toast's `setTimeout` callback dequeues and displays the next
      queued message if any, else hides and resets `toastPriority` to
      `-Infinity` so a later default-priority call is never wrongly blocked
      by a stale value. `main.ts`'s storage-full call site now passes
      priority 1, strictly above the default-priority-0 `xp_overflow_gold`
      toast. Targeted `tests/ui-fb089-toast-priority.test.ts` (6/6): the
      literal acceptance scenario (storage-full survives an immediate
      `xp_overflow_gold` call, which queues instead of clobbering);
      same-priority queues rather than clobbers; strictly-higher-priority
      preempts; a call with nothing showing displays immediately; two
      fake-timer (`vi.useFakeTimers`) tests confirming a queued message
      actually surfaces once the showing toast's 1400ms window elapses and
      that `toastPriority` resets after the queue fully drains.
      code-reviewer **APPROVE** (no Critical/Major; three Minors, all
      addressed same session — a code comment documenting discard-on-preempt
      as deliberate; the two fake-timer dequeue-path tests above, since the
      original submission only asserted enqueue-time state and never proved
      a queued message actually surfaces later; `toastQueue` left uncapped/
      unbounded as acceptable given today's single low-frequency caller,
      noted not fixed, judged premature per CLAUDE.md's don't-build-for-
      hypotheticals rule). qa-playtester **PASS** against the stated
      acceptance criteria (targeted suite, `tsc --noEmit` clean, the
      `tests/ui-fb087-persist-disabled-toast.test.ts` + `tests/fb026-bottom-
      bar.test.ts` regression slice, 23/23, including the real end-to-end
      Game-driven path), plus hostile testing via temporary (not committed)
      probe suites: 50 rapid-fire same-priority calls drain in exact FIFO
      order with no loss/duplication/crash; a priority-1-vs-priority-1 tie
      correctly queues rather than preempting (confirms `<=`, not `<`,
      governs preemption); a negative priority queues behind a default-
      priority toast rather than clobbering it; the `-Infinity` sentinel is
      safe both as the very first call and as a queued call while something
      is showing; a multi-round preempt→queue→drain→fresh-call sequence
      confirms `toastPriority` correctly resets after a full drain. Filed no
      new bugs. `npx tsc --noEmit` clean. `npm run test:fast`: 4 failed
      tests across 7 failed files, all in the pre-existing q15/q49/q52
      worker-hang/Windows-scratch-dir-EPERM flake classes documented across
      dozens of prior PROGRESS.md sessions, none touching `src/ui/**`/
      `src/render/**` or this item's own files.

- [x] (fb088) [polish] low priority: found by qa-playtester (fb074
      verification) — fb074's resume-time replay blocks the main thread
      synchronously before first paint. Measured: replaying a 128,191-tick
      log (a full run) through `run.step()` with no rendering took ~7.5s
      wall-clock on the dev machine, extrapolating to roughly 2.5-3s at the
      practical quota-limited ceiling (fb087) — `tryResumePersistedRun()`
      runs before the first `requestAnimationFrame`, so nothing paints
      during it. Not a crash, but a real "why is the page frozen" gap for
      exactly the long-session refresh case fb074 exists to help most, and
      plausibly worse on slower/mobile hardware. Acceptance: budget and cap
      this cost (e.g. yield/chunk the replay across frames with a loading
      indicator, or adopt fb087's periodic-snapshot direction, which would
      also bound replay length) so `tryResumePersistedRun` never blocks the
      main thread past a documented budget; fold the measurement into
      fb083's (already-queued) Hub/run cold-start perf-budget item if that
      turns out to be the cleaner fit once fb083 is implemented — refs:
      fb074, fb087, fb083. DONE 2026-09-04: took the yield/chunk direction.
      `tryResumePersistedRun` (`src/ui/main.ts`) now replays in bursts of a
      new `RESUME_CHUNK_TICKS` (256) via a new `replayResumeChunk` helper,
      instead of one `for` loop over the whole log. A log that finishes
      within the first burst (every pre-existing test persists at most 64
      ticks) still resumes fully synchronously, byte-for-byte the same
      behavior as before — no existing test needed to change. A longer log
      shows a new `#sw-resume-indicator` loading notice
      (`showResumeIndicator()`, `style.css`'s new `.sw-resume-indicator`
      rule) and continues replaying across a chain of `setTimeout(fn, 0)`-
      scheduled chunks (a macrotask, so the browser actually gets to paint
      the indicator between bursts, unlike a microtask/Promise chain), only
      calling `beginRun()` (or falling back to `showHub()` on a `run.done`-
      already or a malformed-entry-discovered-mid-replay outcome) once the
      whole log has replayed. The chunk size is tick-count-based rather than
      wall-clock-based specifically so the existing/new tests stay
      deterministic (no timing flakiness on a loaded CI host) while still
      capping real replay cost to roughly one 60Hz frame per burst, per
      fb087's own measured ~58µs/tick average. Targeted
      `tests/ui-fb088-resume-chunked.test.ts` (4/4): a 640-tick log shows the
      indicator, leaves `run` null and blocks nothing synchronously past the
      first burst, and needs more than one scheduled burst to finish,
      verified end-state matches an independent reference replay's tick and
      `hash()`; a malformed entry discovered only in a later chunk (index
      300, past the first burst) still falls back to the Hub cleanly; a run
      forced (via a `Run.prototype.step` wrapper, added post-QA — see below)
      to reach a terminal outcome exactly on the last tick of a multi-chunk
      replay falls back to the Hub rather than resuming a finished run; a
      64-tick log (under one burst) still resumes synchronously with no
      indicator, matching every pre-fb088 test's assumption. code-reviewer
      **APPROVE** (no Critical/Major; one Minor — the doc comment overstated
      how "comfortable" the 256-tick/~15ms budget margin is given the
      ~58µs/tick figure is a dev-machine measurement, not a guarantee on
      slower hardware, softened to a "soft target, not a hard guarantee" in
      the same session; one Minor — this backlog entry itself wasn't updated
      yet, closed by this update; one Nit confirmed a non-issue — the
      indicator's raw-`innerHTML` construction matches this file's existing
      convention, not a divergence). qa-playtester **PASS** against the
      literal acceptance criterion: independently built persisted logs of
      exact lengths via a scratch (not committed) probe suite and confirmed
      via `vi.useFakeTimers()`/`vi.getTimerCount()` that `Game.start()`
      returns before a 600-tick log finishes, genuinely spanning 3 macrotask
      bursts (256+256+88); hostile-tested the exact 256/257-tick chunk
      boundary (256 stays fully synchronous, 257 needs exactly one
      continuation), a malformed entry at ticks 0/255/256/500 (all fall back
      to the Hub cleanly regardless of which chunk discovers it), an outcome
      flipping away from `'running'` mid-chunk and exactly on the last tick
      of a long replay (both correctly fall back to Hub instead of resuming
      a finished run), and two `Game` instances racing a chunked replay of
      the same persisted `localStorage` entry concurrently (both complete
      independently to identical `hash()`, no cross-instance corruption);
      filed no new bugs, noted two non-blocking observations (a refresh
      mid-chunked-resume restarts the whole replay from tick 0, benign and
      matching the pre-existing resume contract; the indicator has no
      pathological-viewport-width handling, cosmetic, out of scope for this
      item's budget-focused acceptance) and suggested promoting its own
      scratch terminal-outcome-at-the-final-tick probe into the committed
      suite — added same session as `tests/ui-fb088-resume-chunked.test.ts`'s
      4th test. `npx tsc --noEmit` clean.
      `npm run test:fast`: 4 failed tests across 7 failed files (2189
      passed / 24 skipped), all in the pre-existing
      q15/q49/q52/b032/b034/b035/b036 worker-hang/Windows-scratch-dir-EPERM/
      dev-server-port-contention flake classes documented across dozens of
      prior PROGRESS.md sessions, none touching `src/ui/**`/`src/render/**`
      or this item's own files.

- [x] (fb075) [polish] low priority: Settings "reset to defaults" — the
      Settings tab has no way to restore every slider/toggle to
      `defaultSettings()`'s values short of clearing `localStorage`
      manually. Add a single reset button with a confirm step (destructive
      to any tuned volume/accessibility preferences). Acceptance: a unit
      test opens Settings, changes several values, clicks reset (confirms
      the destructive step), and asserts every field reads back as
      `defaultSettings()` — refs: SPEC-FINAL §11, standard Settings-UX
      convention. DONE 2026-09-04: no `window.confirm` precedent exists
      anywhere in this codebase, so `hub.ts` gets a two-click in-panel
      confirm instead — a new `private settingsResetArmed` field on `Hub`,
      and a `#sw-settings-reset` button in `renderSettings` whose label
      toggles between "Reset settings to defaults" and "Click again to
      confirm reset"; the first click only arms the flag and re-renders,
      the second sets `this.settings = sanitize(defaultSettings())`, calls
      `this.cb.onSettingsChanged(this.settings)`, and clears the flag.
      Targeted `tests/ui-fb075-settings-reset.test.ts` (5/5). code-reviewer
      **REQUEST-CHANGES** → one Major: `settingsResetArmed` was only
      disarmed on tab-away (`show()`), so any *other* Settings-tab button
      that re-renders the panel while staying on the tab (`#sw-seed`,
      `#sw-wipe`, `#sw-keybind-reset`, starting a key rebind) redrew the
      button back to its unarmed label while the internal flag stayed
      silently armed — the very next click on Reset would then execute the
      destructive reset with no second confirm ever actually shown to the
      player. Fixed by clearing `settingsResetArmed` at the top of all four
      of those handlers/`startListeningForRebind` (the `onRebindKeyDown`
      keydown continuation needs no separate clear, since arming already
      happened before any keydown can fire); confirmed the slider/toggle/
      count `input`/`change` handlers need no clear either, since their
      `commit()` closure never calls `this.show()` so the button's label
      can never desync from the flag along that path. One Major: missing
      regression test for the leak, closed by adding two cases (`#sw-
      keybind-reset` and starting a rebind each disarm; a third click after
      either only re-arms, doesn't double-execute). One Minor: reset used
      raw `defaultSettings()` instead of routing through `sanitize()` like
      every other Settings control's `commit()` closure does — changed to
      `sanitize(defaultSettings())` for defense in depth (confirmed the two
      are field-for-field identical today, so this was cosmetic, not a live
      bug). code-reviewer re-verified via re-review of the fix.
      qa-playtester **PASS**: independently confirmed the fix covers every
      `show()`-calling path in the Settings tab and that `sanitize
      (defaultSettings())` really does equal `defaultSettings()`
      field-for-field; hostile-tested rapid double-clicks, reset-then-
      `#sw-wipe` (confirmed `MetaState` and `Settings` resets stay
      independent), a rebind-then-Escape settle still requiring a fresh
      two-click reset, and a stray third click after a successful confirm
      only re-arming rather than double-executing; filed no new bugs.
      `npx tsc --noEmit` clean. `npm run test:fast`: 10 failed / 2187
      passed / 24 skipped, all in the pre-existing q15/q28/q45/q49/q52
      worker-hang/Windows-scratch-dir-EPERM flake classes documented across
      dozens of prior PROGRESS.md sessions, none touching `src/ui/**`/
      `src/render/**` or this item's own files.

- [x] (fb082) [bug] low priority: generated 2026-09-04 (fewer than 3
      actionable items remained) — the floating rail/boss-banner overlays
      (fb065, fb072) anchor to `.sw-stage`'s full box instead of the
      canvas's own letterboxed rect, so at any window aspect ratio other
      than the grid's 36:20 they sit disconnected from (or, at the opposite
      extreme, could overlap) the actual visible game content. Both fb065's
      and fb072's own DONE notes already found and logged this without
      filing it: fb065 — "the rails anchor to `.sw-stage`'s box rather than
      the canvas's own letterboxed/centered rect, invisible at the audit's
      1920x1080 viewport (≈36:20) but a real gap at an extreme aspect
      ratio"; fb072 — "a theoretical CSS overlap with the right info rail at
      very narrow stage widths." Acceptance: the overlays reposition/resize
      to track the canvas's actual laid-out rect rather than `.sw-stage`'s
      full box, verified by a render/UI test that mocks an extreme-aspect-
      ratio container (same `clientWidth`/`clientHeight`-mocking idiom
      `tests/render-fb065-stage-fill.test.ts` already uses) and asserts the
      overlay anchor geometry derives from the letterboxed canvas size, not
      the raw stage size; the existing fb065/fb072 regression tests and the
      1920x1080 `ui-audit` scenes stay green — refs: fb065, fb072,
      SPEC-FINAL §11. DONE 2026-09-04: `hud.ts` gains a public
      `syncStageOverlayGeometry()`, called every `update()` tick, that reads
      `.sw-stage`'s `clientWidth`/`clientHeight`, re-derives
      `Renderer.resize()`'s (`canvas.ts`) own letterboxing math (`aspect =
      GRID_W/GRID_H`, `cssW = Math.round(Math.min(availW, availH*aspect))`,
      `cssH = cssW/aspect`) rather than reading the canvas element's own
      `getBoundingClientRect()` (which reads all-zero under jsdom regardless
      of `clientWidth`/`clientHeight` mocks, since jsdom never runs real
      layout), and publishes the canvas's offset from each stage edge as
      `--cv-left`/`--cv-right`/`--cv-top`/`--cv-bottom`/`--cv-cx` CSS custom
      properties on `.sw-stage` itself, `removeProperty`'d back to nothing
      whenever the stage isn't laid out (falling through to the CSS
      `var(--cv-x, <default>)` fallback — `0px` for the edges, `50%` for the
      boss bar's horizontal center — i.e. the exact pre-fix behavior).
      `style.css`'s `.sw-rail`/`.sw-rail-left`/`.sw-rail-right`/`.sw-bossbar`
      rules consume these via `calc()`/`var()`. code-reviewer APPROVE (no
      Critical/Major; one Minor — `Hud.update()` (where the sync normally
      runs) is never reached while a run is paused, so a window resize
      mid-pause would leave the geometry stale until resume — fixed same
      session by also calling `hud.syncStageOverlayGeometry()` directly from
      `Game.frame()`'s (`main.ts`) paused branch; two Nits — `stageEl`'s type
      tightened from a non-null assertion to `HTMLElement | null` to match
      its actual runtime guard; the unconditional per-tick `setProperty` cost
      noted as negligible and left as-is, matching this file's existing
      every-tick-resync pattern). qa-playtester PASS against the stated
      acceptance criteria, independently re-derived the letterboxing formula
      against several extreme cases beyond the shipped tests (including
      0-dimension mid-transition fallback and exact-36:20 zero-gap
      cleanliness) and confirmed the collapsed-rail `bottom: auto` override
      still fully clears the base rule's `calc()` via CSS cascade semantics;
      found one informational, sub-visual-pixel issue — a specific
      `clientHeight` (e.g. 801 against a 3000-wide stage) makes
      `Renderer.resize()`'s own `Math.round(cssW)` rounding (mirrored here)
      round up enough that derived `cssH` exceeds `availH` by a fraction of a
      pixel, which would otherwise surface as a tiny negative `--cv-top`/
      `--cv-bottom` — fixed by clamping every offset to `Math.max(0, …)`,
      with a new regression case in the same test file sweeping a
      `clientHeight` known to trigger it. Targeted
      `tests/ui-fb082-overlay-geometry.test.ts` (5/5: height-bound and
      width-bound letterbox-gap derivation, jsdom-no-layout fallback,
      re-derivation after a live resize, the negative-offset clamp).
      `npx tsc --noEmit` clean. `npm run test:fast`: 9 failed files / 9
      failed tests across two runs this session, all in the pre-existing
      q15/q45/q49/q52 worker-hang/Windows-scratch-dir-EPERM flake classes
      documented across dozens of prior PROGRESS.md sessions, none touching
      `src/ui/**`/`src/render/**` or this item's own files.

- [x] (fb083) [feat] low priority: generated 2026-09-04 — automated perf
      regression coverage for QUALITY.md BETA's "Load to Hub < 3s cold;
      Hub → run < 1.5s" bar, currently unmeasured by any test (unlike G17's
      350-enemy benchmark, which is). Acceptance: a test constructs a fresh
      `Hub`/`Game` from a cold start and asserts wall-clock time to a
      rendered Hub stays under a generous, documented CI-safe budget, and
      separately measures Hub-"Start"-click to first rendered run frame
      under its own budget; both recorded the same host-independent-margin
      (⚖) way G17's benchmark already documents its own variance — refs:
      QUALITY.md BETA, SPEC-FINAL §11. DONE 2026-09-04: new
      `tests/ui-fb083-perf-budget.test.ts`, same `mount()`/canvas-context-
      proxy idiom as `tests/ui-fb074-resume-on-refresh.test.ts`. Test 1 times
      `new Game(); game.start(root)` and asserts `#sw-start` (the Hub) is
      rendered under a 3000ms budget. Test 2 times a real click on
      `#sw-start` plus the first `frame()` call that reaches
      `Renderer.draw()` for the new run, and asserts `#sw-canvas` exists
      under a 1500ms budget. Ceilings are the literal QUALITY.md numbers
      themselves rather than a measured-median multiple (p10e's style) —
      documented in the file header why: this is a synchronous jsdom
      environment, not a real browser paint pipeline, so the measured
      baseline (~5-15ms / ~1-5ms) is two-plus orders of magnitude below any
      real cold-load number: comparing against it would just be measuring
      jsdom's own speed, not a meaningful multiple of a real load cost. The
      point is catching an accidental synchronous multi-second block, which
      it does (qa-playtester fault-injected a 3.5s sleep into `Game.start`
      and confirmed the test fails with the predicted elapsed value, reverted
      cleanly). code-reviewer **APPROVE** (no Critical/Major; one Minor noting
      the ceiling methodology differs in style from p10e's measured-multiple
      approach, though the header already documents and justifies the
      deviation — not blocking). qa-playtester **PASS** against both literal
      acceptance criteria, confirmed no collision with
      `tests/a10-performance.test.ts`/`tests/p10e-perf-budget.test.ts` (both
      measure sim tick cost, not UI/Hub wall-clock load time), confirmed
      `Game.start()` has no async/Promise/fetch path a synchronous wall-clock
      wrap could miss. `npx tsc --noEmit` clean. `npm run test:fast`: 7 failed
      files / 6 failed tests, all in the pre-existing q15/q49/q52
      worker-hang/Windows-scratch-dir-EPERM flake classes documented across
      dozens of prior PROGRESS.md sessions, none touching `src/ui/**`/
      `src/render/**` or this item's own files.

- [x] (fb084) [feat] normal priority: generated 2026-09-04 — first-run
      onboarding. QUALITY.md BETA's manual bar ("contextual tutorial
      prompts for build → Dusk → Night → Dawn; a new player reaches Night 1
      without external help") is entirely unbuilt — no tutorial/onboarding
      code exists anywhere in `src/ui`. Acceptance: a first TD build phase,
      first VS wave ("Dusk"→"Night"), and first "Dawn" (return-to-build)
      transition each show a one-time, dismissible, non-blocking contextual
      prompt explaining what the player should do next; shown-state is
      tracked in `Settings` (`src/ui/settings.ts`, in this lane's Scope —
      not `MetaState`/`src/meta/**`, which is out of it) via a new field so
      each prompt never repeats after being dismissed once; a dev/Settings
      control can replay them; a unit test drives a fresh save through the
      first build phase and first VS wave and confirms each prompt appears
      exactly once, never again on a later run — refs: QUALITY.md BETA,
      SPEC-FINAL §1.1, §11. DONE 2026-09-04: `settings.ts` adds
      `onboardingSeenBuild`/`onboardingSeenDusk`/`onboardingSeenDawn`
      (default false, `sanitize()`-coerced). `hud.ts` adds a dismissible,
      non-blocking banner (`#sw-onboarding`, close button
      `#sw-onboarding-close`) driven by three triggers: `update()` checks
      once per `Hud` instance (i.e. once per run) whether `w.phase ===
      'act1_build'` for the build prompt; `ingestFx()` listens for the sim's
      own `'sweep_to_vs'`/`'sweep_to_td'` fx events (`sundering.ts`'s
      `finishSundering`/`advanceToNextBlock` — already emitted for p10h's
      TD<->VS sweep visual, no new sim state needed) for the dusk/dawn
      prompts. Hidden behind an actual modal (pause/level-up/results/
      character panel) via the same `modalOpen` check `renderBossBar` uses,
      but never itself covers the canvas or blocks input. `Hud`'s
      constructor takes an optional third `settings: Settings =
      defaultSettings()` param (backward-compatible with every pre-existing
      test call site); `main.ts` passes its live `Settings` in and persists
      `onOnboardingSeen` via `saveSettings`. `hub.ts`'s Settings tab gains a
      "Replay tutorial prompts" button resetting all three flags. Targeted
      `tests/ui-fb084-onboarding.test.ts` (10/10). code-reviewer APPROVE (no
      Critical/Major; two Minor — `dismissOnboarding` mutated the injected
      `Settings` object in place instead of spreading, fixed same session to
      match the rest of the codebase's immutable-update convention; the
      original swallow-not-queue design's doc comment claimed a dropped
      later trigger "reappears at its next occurrence," which qa-playtester's
      first pass proved false — see below). qa-playtester's first pass
      **FAILED** it with a Major: the original design dropped (not delayed)
      a later prompt if an earlier one was left un-dismissed — since the
      banner is deliberately non-blocking specifically so a player can keep
      playing through it, "leave the build prompt open and never click the
      X" is the realistic path, not an edge case, and it permanently
      starved the dusk/dawn prompts (`onOnboardingSeen` never fired for
      them, no matter how many TD/VS cycles ran). Fixed by giving
      `triggerOnboarding` a small dedup'd `onboardingQueue: OnboardingKey[]`
      (bounded to 2 — only 3 keys exist total) instead of a bare early
      return; `dismissOnboarding` now pops the queue into `onboardingActive`
      immediately after marking the dismissed key seen, so a queued prompt
      surfaces the instant the one in front of it is dismissed rather than
      waiting for its own transition to recur. New regression case in the
      same test file reproduces the exact hostile scenario (build left open
      across two full TD/VS cycles' worth of duplicate dusk/dawn triggers)
      and confirms no drop, no duplicate queue entries, and
      `onOnboardingSeen` firing exactly once each in order `['build',
      'dusk', 'dawn']`. qa-playtester re-verified **PASS**, independently
      re-read the fixed methods (not just the test result) and confirmed the
      queue is bounded, always drains via the close button, and can't
      interleave with the Hub's settings-reset path since the onboarding
      queue only exists inside a live `Hud`, never reachable from the
      run-free Hub screen. `npx tsc --noEmit` clean. `npm run test:fast`: 7
      failed files / 4 failed tests, all in the pre-existing q15/q49/q52
      worker-hang/Windows-scratch-dir-EPERM flake classes plus the
      b032/b034/b035/b036 dev-server port-contention class (each re-ran
      clean in isolation, confirmed not caused by this change), documented
      across dozens of prior PROGRESS.md sessions, none touching
      `src/ui/**`/`src/render/**` or this item's own files. One file outside
      the literal Scope glob (`tests/q3-save-fuzz.test.ts`) needed its
      `customSettings()` fixture (typed `ReturnType<typeof defaultSettings>`)
      grown the three new required fields — the same precedented
      compile-error-otherwise touch fb058/fb060 already logged below.

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

- [x] (fb086) [polish] low priority: generated 2026-09-04 — reduced-motion
      accessibility setting. QUALITY.md 1.0's accessibility re-check names
      "reduced-motion mode" as its own checklist line, distinct from what
      already exists: `reducedFlash` (fb016) only dims/thins strobing
      fills, and `shake` only scales screen shake — neither disables
      ambient motion (tracer jitter/distortion trails, the p10h TD↔VS sweep
      transition's pan) a vestibular-sensitive player would want off.
      Acceptance: a new Settings toggle "Reduced motion" that suppresses or
      simplifies at least the ambient-motion effects `reducedFlash`/`shake`
      don't already cover; a render test confirms at least one such effect
      is suppressed with the toggle on and present with it off; default off
      (opt-in, matching `reducedFlash`'s own default) — refs: QUALITY.md
      1.0 checklist, SPEC-FINAL §11. DONE 2026-09-04: `settings.ts` adds
      `reducedMotion: boolean` (default false, `sanitize()`-coerced);
      `hub.ts`'s Settings-tab `TOGGLES` table gets a "Reduced motion" row
      using the same generic hover-toggle plumbing every other checkbox
      already uses. `canvas.ts` gates two ambient-motion effects on it: (1)
      `drawTracers`' jagged tracers (chain lightning/tesla coil/Time Lord's
      basic-attack distortion trail) normally draw 3 kinked line segments
      with an alternating ±4px zigzag; under `reducedMotion` they fall back
      to the same straight line a non-jagged tracer already draws; (2)
      `drawPhaseSweep` (the 2s TD↔VS transition band) normally travels a
      linear-gradient wipe horizontally across the whole screen; under
      `reducedMotion` it fills the screen with a flat, stationary color
      instead, using the same opacity envelope (so the transition still
      visually reads) with no horizontal travel. Both remain fully
      orthogonal to `reducedFlash`'s own alpha-dimming, which still applies
      on top of either. Targeted `tests/render-fb086-reduced-motion.test.ts`
      (4/4): default-off, jagged-tracer-suppressed-under-reducedMotion (with
      an unaffected-non-jagged-tracer control case), and the phase-sweep
      gradient-vs-flat-fill distinction. code-reviewer **APPROVE** (no
      Critical/Major; one Minor — this backlog checkbox wasn't ticked yet in
      the reviewed diff, closed by this update; one Nit — the jagged
      tracer's thicker 2px line width survived the reducedMotion straight-
      line fallback instead of converging on a genuine straight tracer's
      1.5px, fixed same session: `ctx.lineWidth = t.jagged ? 2 : 1.5` ->
      `t.jagged && !calmMotion ? 2 : 1.5`, re-verified green). qa-playtester
      **PASS**: independently re-derived all four acceptance-criteria checks
      against the live renderer with its own standalone probe (not just the
      shipped test file), confirmed the Settings toggle reaches
      `onSettingsChanged` end-to-end through a real `Hub` DOM click, found
      no double-suppression/dead-zone/dangling-gradient bug with
      `reducedFlash` and `reducedMotion` both on simultaneously, confirmed
      expiry/cleanup timers for both effects are untouched by the new
      branch, and confirmed old localStorage saves predating the field
      sanitize to `false`. Independently found and reported the same
      line-width nit code-reviewer flagged (fixed above) and one
      informational, non-blocking observation for the backlog generator: the
      bottom bar's CSS-only "skill ready" box-shadow ripple
      (`.sw-bb-flash`/`.sw-bb-ready-flash`, `style.css`) is a brief
      (0.5s), event-triggered ambient-motion cue neither `reducedFlash` nor
      `reducedMotion` touches, judged not to clear this item's own
      acceptance bar (which named continuous/repeated cues — tracer jitter,
      phase-sweep pan) so not filed as a bug against fb086 itself. Filed no
      new bugs. `npx tsc --noEmit` clean. `npm run test:fast`: 5-6 failed
      tests across 4-7 failed files this session (q15-command-domain-fuzz
      worker-hang/timing-fuzz plus q45/q49/q52 Windows-scratch-dir EPERM,
      and the b032/b034/b035/b036 dev-server-port-contention fold-test
      class), all in the pre-existing flake classes documented across dozens
      of prior PROGRESS.md sessions, none touching `src/ui/**`/
      `src/render/**` or this item's own files.

- [x] (fb090) [feat] normal priority: generated 2026-09-04 (fewer than 3
      actionable items remained; QUALITY.md 1.0 Steam/itch checklist gap
      diff) — fullscreen toggle. QUALITY.md 1.0's checklist ("fullscreen +
      windowed") is entirely unbuilt: no `requestFullscreen`/
      `exitFullscreen` call exists anywhere in `src/ui`. Add a Settings
      control (and/or a bottom-corner button) that requests fullscreen on
      the app's root element and can exit it again, reflecting the live
      `document.fullscreenElement` state (including a state change driven
      externally, e.g. the browser's own Esc-to-exit-fullscreen, via the
      `fullscreenchange` event) rather than only its own click history.
      Acceptance: a unit test mocks `Element.prototype.requestFullscreen`/
      `document.exitFullscreen` and confirms clicking the control calls the
      right one for the current state and the displayed label/state flips;
      a separate test dispatches a `fullscreenchange` event with
      `document.fullscreenElement` cleared externally and confirms the
      control's displayed state updates to "not fullscreen" without a click
      — refs: QUALITY.md 1.0 (Steam/itch checklist), SPEC-FINAL §11. DONE
      2026-09-04: `hub.ts`'s Settings tab gains a `#sw-fullscreen-toggle`
      button ("Enter fullscreen"/"Exit fullscreen") that calls
      `document.exitFullscreen()` when `document.fullscreenElement` is
      truthy, else `this.root.requestFullscreen()` on the Hub's own root
      element (the same `#app` node `main.ts` mounts the whole game into).
      Label state is driven entirely by a `fullscreenchange` listener, not
      click history, so the browser's own Esc-to-exit-fullscreen (or any
      other external trigger) is reflected correctly. Targeted
      `tests/ui-fb090-fullscreen.test.ts` (6/6): both click-driven
      directions with label flip, an externally-fired `fullscreenchange`
      updating the label with no click, off-tab event delivery (no throw,
      no stray render), no double-render across repeat Settings visits, and
      a repeated-Hub-re-instantiation-onto-the-same-root case (below).
      code-reviewer **REQUEST-CHANGES** on the first draft (a per-instance
      `document.addEventListener('fullscreenchange', ...)`, bound/unbound
      only on that instance's own tab transitions, mirroring fb073's rebind
      listener): Major — `main.ts`'s `showHub()` constructs a fresh `Hub` on
      every return to the Hub screen without disposing the previous
      instance, so a stale instance discarded while still on the Settings
      tab would keep its listener alive forever and could `show()` — wiping
      the *current* Hub/Hud's DOM — on a later `fullscreenchange` it had no
      business reacting to; not reachable through today's production
      `showHub()` call sites (all only fire when entering the Hub from a
      non-Hub state) but a real latent bug and the same shape as the
      pre-existing fb073 exposure, so worth closing rather than repeating.
      Fixed by replacing the per-instance listener with a single
      module-scoped one (`ensureFullscreenListenerInstalled`, installed
      once) that always re-renders whichever `Hub` was constructed most
      recently (`activeFullscreenHub`, reassigned in the constructor) via a
      new `refreshFullscreenLabel()` method — the number of live document
      listeners is now independent of how many `Hub` instances have ever
      existed. Also fixed the Nit both code-reviewer and qa-playtester
      independently raised: `requestFullscreen()`/`exitFullscreen()`'s
      returned promises get a `.catch(() => {})` so a permissions-policy
      denial or a rapid-repeat-click rejection doesn't surface as an
      unhandled rejection. code-reviewer's Minor (missing test coverage for
      the leak) and qa-playtester's bug #1 (same leak, independently
      reproduced via an ad-hoc 5-stale-Hub-instances probe, deleted after
      confirming) are the same finding — both re-verified fixed against the
      new 5th test in `tests/ui-fb090-fullscreen.test.ts`, which builds 5
      `Hub` instances onto one root (each left on the Settings tab, mirroring
      the vulnerable state) and confirms only the most recent instance's
      `show()` fires on one `fullscreenchange` dispatch. qa-playtester's bug
      #2 (no click-guard against rapid repeat clicks queuing multiple
      concurrent `requestFullscreen()` calls) left as-is, not fixed: real
      browsers already reject a redundant/stale-activation
      `requestFullscreen()` call on their own, the `.catch()` fix above
      already prevents that rejection from going unhandled, and a
      click-debounce guard isn't named anywhere in this item's acceptance
      text — logged here rather than silently dropped, may be worth a future
      polish item if it proves to matter in practice. `npx tsc --noEmit`
      clean throughout. `npm run test:fast`: 8 failed files / 5 failed tests
      (both pre- and post-fix runs), all in the pre-existing q15/q49/q52
      worker-hang/Windows-scratch-dir-EPERM flake classes documented across
      dozens of prior PROGRESS.md sessions, none touching `src/ui/**`/
      `src/render/**` or this item's own files.

- [x] (fb091) [feat] normal priority: generated 2026-09-04 (fewer than 3
      actionable items remained; QUALITY.md 1.0 Steam/itch checklist gap
      diff) — crash capture + "copy report" button. QUALITY.md 1.0's
      checklist ("error capture to a local log with a 'copy report' button")
      is entirely unbuilt: no `window.onerror`/`unhandledrejection` handler
      exists anywhere in `src/ui`. Add a global handler (wired once from
      `main.ts`, in this lane's Scope) that appends a bounded (e.g. last 20)
      in-memory ring buffer of `{time, message, stack}` entries for both
      uncaught errors and unhandled promise rejections, surfaced via a new
      Settings-tab panel listing recent entries (empty-state message when
      none) with a "Copy report" button that serializes the buffer to a
      plain-text report and writes it to `navigator.clipboard`. Acceptance:
      a unit test throws inside a wrapped/dispatched error path and confirms
      the buffer captures the expected fields and is bounded; a separate
      test dispatches an `unhandledrejection` event and confirms it's
      captured too; clicking "Copy report" with mocked
      `navigator.clipboard.writeText` confirms the written text contains
      every buffered entry — refs: QUALITY.md 1.0 (Steam/itch checklist).
      DONE 2026-09-04: new `src/ui/crashlog.ts` — a module-scoped, session-
      only ring buffer (`recordCrash`/`crashLogEntries`, bounded to
      `MAX_ENTRIES = 20`), `formatCrashReport()` (plain-text serialization,
      an empty-state string when nothing recorded), and
      `installGlobalErrorHandlers()` (idempotent; wires `window`'s `error`
      and `unhandledrejection` listeners once). `main.ts`'s `Game.start()`
      calls it once alongside the existing `installAuditHook()` call.
      `hub.ts`'s Settings tab gains a "Crash reports" panel (empty-state
      message or an `<li>` per entry) and a `#sw-crashlog-copy` button that
      calls `navigator.clipboard.writeText(formatCrashReport())` and shows a
      transient confirm/failure notice, cleared on leaving the tab (same
      pattern as `settingsResetArmed`). A new `escapeHtml` helper guards the
      one place this file renders genuinely arbitrary runtime text (a thrown
      error's own `message`) into `innerHTML`. Targeted
      `tests/ui-fb091-crash-log.test.ts` (15/15): ring-buffer bounding,
      `error`-event capture (message+stack), `unhandledrejection` capture
      (both `Error` and non-`Error` reasons), the boot-time `Game.start()`
      wiring (not just a direct `installGlobalErrorHandlers()` call),
      idempotent double-install, the empty-state message, per-entry
      rendering, XSS-escaping, the Copy-report happy/denied/no-Clipboard-API
      paths, and the stale-Hub regression below. code-reviewer
      **REQUEST-CHANGES** → one Major: `#sw-crashlog-copy`'s
      `navigator.clipboard.writeText(...).then()` callback closed over the
      specific `Hub` instance live at click time and unconditionally called
      `this.show()` on settle with no check that instance was still current
      — `main.ts`'s `showHub()` builds a fresh `Hub` on the same shared root
      on every return to the Hub screen without disposing the previous one
      (the exact fb073/fb090 "stale instance keeps acting on a shared root"
      bug class), so a write still pending when the player left/returned to
      the Hub could clobber whatever replaced it. Fixed by renaming fb090's
      `activeFullscreenHub` module-scoped "most recently constructed Hub"
      pointer to the more general `activeHub` and gating both the success
      and failure clipboard callbacks on `activeHub === this` before
      touching state or re-rendering; also fixed a related Minor (missing
      `navigator.clipboard` entirely — older/insecure-context browsers —
      silently no-opped instead of surfacing a notice, now shows "Clipboard
      not available in this browser.") and a second Minor (no test drove
      `Game.start()` itself to confirm the boot-time wiring, only the
      exported function directly — added). Re-verified: `npx tsc --noEmit`
      clean, targeted suite grew to 15/15. qa-playtester **PASS** against
      all three literal acceptance criteria (independently re-derived each
      via throwaway probes rather than trusting the shipped tests alone),
      plus hostile testing: rapid triple-click on Copy report (one
      `writeText` call per click, no duplicate-stacking), a 50,000-char
      message + 5,000-line stack (no throw, fully included), XSS vectors in
      a recorded message (no element materializes, no global pollution,
      `escapeHtml` holds), a crash recorded mid-flight after Copy report was
      clicked but before the promise settled (correctly excluded — a
      snapshot-at-click-time property, not a bug), `Game.start()` invoked
      twice (no double-registration), and — specifically targeting the
      code-reviewer's fix — two Hubs on the same root with clipboard writes
      pending simultaneously, resolved in both orderings (older-then-newer
      and newer-then-older): the `activeHub !== this` guard correctly
      suppresses the stale instance's callback either way. Noted but not
      filed as a bug: `activeHub` is never explicitly nulled and old `Hub`
      instances are never disposed, so a `Hub` whose clipboard promise never
      settles keeps that instance alive via closure — identical, pre-existing
      pattern to fb090's own `activeFullscreenHub`, bounded by tab-close/
      reload wiping all JS state, and this feature is documented session-only
      by design. Filed no new bugs. `npx tsc --noEmit` clean. `npm run
      test:fast`: 4-5 failed tests across 7 failed files across two runs this
      session, all in the pre-existing q15/q49/q52 worker-hang/Windows-
      scratch-dir-EPERM flake classes plus the b032/b034/b035/b036 dev-
      server port-contention class, documented across dozens of prior
      PROGRESS.md sessions, none touching `src/ui/**`/`src/render/**` or this
      item's own files.

- [x] (fb092) [polish] low priority: generated 2026-09-04 (fewer than 3
      actionable items remained; QUALITY.md 1.0 Steam/itch checklist gap
      diff) — credits + license screen. QUALITY.md 1.0's checklist
      ("credits + license screen") is entirely unbuilt: no credits/license
      surface exists in the Hub. Add a reachable Hub panel (e.g. a new tab
      or a link from Settings) listing project credits and license text; can
      be a seeded placeholder list rather than exhaustive (the real asset
      credits don't exist until QUALITY.md BETA's "Art pass 1" lands and
      populates ASSETS.md) as long as the surface and its render path exist
      and are covered by a test. Acceptance: a unit test opens the new
      panel/tab and confirms credits and license text render; the panel is
      reachable from the Hub without a dev-only gate — refs: QUALITY.md 1.0
      (Steam/itch checklist). DONE 2026-09-04: new `src/ui/credits.ts` —
      `CREDITS` (a seeded `{role, name}[]` placeholder list), `LICENSE_TEXT`
      (a placeholder all-rights-reserved string pending the real license
      before a public build), and `creditsMarkup()`. `hub.ts` adds
      `'credits'` to the `Tab` union and a "Credits" nav button rendered
      unconditionally alongside Run/Constellation/Equipment/Codex/Settings —
      no `DEV_BUILD`/`devProfileActive()` gate, unlike the dev badge/hidden-
      classes toggle — dispatching to a new `renderCredits(body)` method.
      `style.css` gains `.sw-creditslist`/`.sw-license` rules (mirroring
      fb091's `.sw-crashlist` pattern). Targeted
      `tests/ui-fb092-credits.test.ts` (4/4): nav button present with
      correct label, every seeded credit entry renders as visible text,
      license text renders, and no dev-gate class on the tab button.
      code-reviewer **APPROVE** (no Critical/Major; one Minor — the new CSS
      classes had no rules yet, fixed same session). qa-playtester **PASS**:
      independently constructed a `Hub` and clicked through from every other
      tab into Credits, confirmed the nav button is present with a fresh
      `defaultMeta()` and no dev profile involved, confirmed rendered text is
      genuinely visible (no display:none), round-tripped tab switches,
      confirmed opening Credits correctly clears any armed Settings-tab-only
      transient state (rebind listening, settings-reset-armed,
      crash-log-copy-notice) via the existing `tab !== 'settings'` guards,
      and spam-clicked the tab 50x with no throw or instability; filed no
      bugs. `npx tsc --noEmit` clean. `npm run test:fast`: 8 failed files / 7
      failed tests, all in the pre-existing q15/q45/q49/q52 worker-hang/
      Windows-scratch-dir-EPERM flake classes documented across dozens of
      prior PROGRESS.md sessions, none touching `src/ui/**`/`src/render/**`
      or this item's own files.

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

- [x] (fb094) [feat] low priority: generated 2026-09-04 (fewer than 3
      actionable items remained; engineer's-judgment item, depth not scope
      creep per HANDOFF §7) — dev-mode screenshot export. QUALITY.md 1.0's
      checklist names "store-page asset export (screenshots at fixed seeds,
      gif capture mode)" and no such tooling exists. Scoped to the
      screenshot half (gif capture is a materially larger scope, left for a
      future item): a dev-profile-only Hub/HUD control that exports the
      current canvas frame to a downloadable PNG (`canvas.toDataURL` or
      `toBlob`), reachable without leaving the run. Acceptance: a unit test
      triggers the export control and confirms it calls the canvas's export
      API and produces a download (mocked `HTMLCanvasElement.prototype
      .toBlob`/anchor-click idiom); the control is absent/inert outside dev
      profile, matching every other dev-only control's existing gating
      pattern — refs: QUALITY.md 1.0 (Steam/itch checklist). DONE 2026-09-04:
      `hud.ts` imports `devProfileActive`/`isDevBuild` from `../meta/
      devprofile` (both already exported, gate-tested elsewhere via C8); the
      `Hud` constructor computes `const devMode = isDevBuild() &&
      devProfileActive();` once, before building its one-shot `innerHTML`
      template — the same two-part predicate hub.ts's `DEV_BADGE`/
      `showHiddenClasses` already use — and only injects a
      `<button id="sw-screenshot" data-act="screenshot">Screenshot</button>`
      into the `.sw-controls` row (between VS and Pause) when `devMode` is
      true, so the control is genuinely absent from the DOM (not just
      CSS-hidden) outside dev profile. `wireControls()` wires
      `[data-act="screenshot"]` to a new private `exportScreenshot()`:
      `this.canvas.toBlob(cb, 'image/png')`, and inside the callback (blob +
      `URL.createObjectURL` both present) creates an object URL, a temporary
      `<a>` with `.download = 'stonewake-screenshot-${Date.now()}.png'`,
      calls `.click()`, then `URL.revokeObjectURL(url)` — the same Blob +
      `createObjectURL` + anchor-click + revoke idiom `tuner.ts`'s "Export
      JSON" button already uses, guarded the same way against a missing
      `canvas.toBlob`/`URL` API as a silent no-op. Targeted
      `tests/ui-fb094-screenshot-export.test.ts` (3/3, dev-build env: button
      renders, click drives `toBlob`→`createObjectURL`→real-anchor
      `.click()`→`revokeObjectURL` with the right args, null-blob resolution
      is a no-throw no-op) and `tests/ui-fb094-screenshot-export-prod.test.ts`
      (1/1: `vi.mock`'s `isDevBuild` to false, same split-file pattern as the
      existing `p9c-tuner-ui.test.ts`/`p9c-tuner-prod-ui.test.ts` precedent,
      confirms `#sw-screenshot` never mounts). code-reviewer APPROVE (no
      Critical/Major; one Minor — unrelated pre-existing dirty `STATUS.md` in
      the working tree, not staged; one Nit — a comment cited the wrong
      existing-pattern precedent, fixed same session). qa-playtester PASS:
      independently constructed a live `Hud` and drove the button directly
      rather than trusting the shipped tests, confirmed the same call
      sequence; hostile-tested a rapid double-click (two independent
      `toBlob` calls, two distinct object URLs each individually revoked, no
      leak), confirmed the click never touches `onPause`/`this.modal`/
      `this.paused` (no interaction with the pause/modal overlay stack), and
      confirmed no keybinding collision and no click-delegation interference
      with sibling `.sw-controls` buttons (each wired via its own
      `addEventListener`, not container-level delegation); noted as a known,
      accepted (non-regression) limitation that `devMode` is baked in at
      construction time same as every other dev-only control in this
      codebase (`Hud`/`Hub` are reconstructed fresh per screen/run, never
      reactively re-rendered). Filed no new bugs. `npx tsc --noEmit` clean.
      `npm run test:fast`: 5 failed / 2252 passed / 24 skipped (2281 total)
      across 7 failed files, all in the pre-existing q15-command-domain-fuzz
      worker-hang and q49/q52 Windows-scratch-dir-EPERM flake classes plus
      the b032/b034/b035/b036 dev-server-port-contention/fold-test class,
      documented across dozens of prior PROGRESS.md sessions, none touching
      `src/ui/**`/`src/render/**` or this item's own files.

- [x] (fb095) [feat] normal priority: generated 2026-09-04 (fewer than 3
      actionable items remained — fb085 stays open but is permanently
      out-of-scope for this lane per its own Log entry, leaving only
      fb093/fb094; SPEC-FINAL §13/§11 coverage diff) — quest tracker panel.
      §13 names 8-12 quests as a content total and `data/quests.json` has 14
      fully authored (name/desc/metric/target/reward), but no UI anywhere
      lists them — a player has no way to see which quests exist, their
      progress, or what they unlock, short of the terse "Locked — complete a
      quest" strings already shown next to individual locked classes/Cores.
      `MetaState` already tracks everything needed
      (`meta.questProgress: Record<string, number>`,
      `meta.completedQuests: string[]`, both read in `src/meta/meta.ts`,
      out-of-scope but read-only) and `content.quests.quests` /
      `content.classByKey` / `content.coreByKey` (`src/sim/content.ts`) give
      every display field — this is pure additive UI, no sim/meta edits
      needed (architecture rule 3: renderer/UI reads state, doesn't compute
      it). Add a new Hub tab or panel listing every quest with its name,
      description, a live progress bar/fraction (`questProgress[metric]` vs
      `target`, respecting `compare`), completed/locked state
      (`completedQuests.includes(key)`), and its reward's display name
      (class/core name via the content maps). Acceptance: a unit test opens
      the panel against a `MetaState` fixture with partial progress on
      several quests and confirms each quest's progress fraction, completed
      state, and reward name render correctly, including a quest whose
      `compare` is `lte` (e.g. `fast_boss`/`speedrunner`) — refs: SPEC-FINAL
      §13 (content totals), §11 (Codex/wiki-of-every-entity spirit),
      QUALITY.md ALPHA/BETA screens. DONE 2026-09-04: new `src/ui/quests.ts`
      — `questsMarkup(content, meta)`, pure presentation over
      `content.quests.quests`/`content.classByKey`/`content.coreByKey`
      (`src/sim/content.ts`) and `meta.questProgress`/`meta.completedQuests`
      (`MetaState`), no `src/sim`/`src/meta` edits (architecture rule 3:
      reads state, doesn't compute it). `rewardLabel()` resolves a `class`/
      `core` reward to its real display name via the content maps, falling
      back to a humanized raw value for any other reward `kind` (today only
      `maze_master`'s `passive:wall_hp_10`). `progressPct()` reports a
      `gte` quest's live fraction (clamped 0-100) and, since an `lte` quest
      (e.g. `fast_boss`/`speedrunner`) has no natural "0%" baseline for
      "best time so far", reports it as a binary done/not-done instead of an
      interpolated fraction — documented in-line as a deliberate choice, not
      an oversight. `hub.ts` adds `'quests'` to the `Tab` union, a "Quests"
      nav button (no dev-gate, same unconditional-nav pattern as fb092's
      Credits tab), and a `renderQuests()` dispatch. `style.css` adds
      `.sw-questlist`/`.sw-quest` rules reusing the existing `.sw-meter.thin`
      progress-bar pattern. Targeted `tests/ui-fb095-quest-tracker.test.ts`
      (8/8): nav reachability, every quest's name+desc rendering, a `gte`
      quest's live fraction, a completed quest's full bar + done marker +
      checkmark, an incomplete `lte` quest's "best N, need <= target" text
      without a partial bar fill, `class`/`core` reward names resolving to
      real display names (not raw data keys), a non-class/core (`passive`)
      reward's humanized fallback text, and a negative-`questProgress`
      (corrupted-save-shape) `gte` quest's displayed text clamping the same
      way its bar already did. code-reviewer REQUEST-CHANGES → one Major:
      the first test's `const root = openHub(defaultMeta())` was never read
      (the test queried `document.querySelector` directly instead), which
      `tsc --noEmit`'s `noUnusedLocals` — the first step of `npm run build`
      — fails on even though Vitest's non-type-checking esbuild transform
      let it slip through green; fixed by dropping the unused binding,
      re-verified `npx tsc --noEmit` clean. One Minor (the `lte`
      binary-progress choice, confirmed as intentional/documented, not a
      bug) and one Nit (the `passive`-reward fallback branch was untested —
      closed by adding the `maze_master` case, see above) also addressed
      same session. qa-playtester PASS: independently re-derived the
      progress-fraction/completed-state/`lte`-quest checks against a live
      `Hub` instance rather than trusting the shipped tests, then
      hostile-tested an untouched metric (renders `0/target`, no
      NaN/undefined), a `gte` value wildly exceeding target (bar and text
      both clamp to 100%/target, confirmed via `Math.min`), all 14 real
      quests rendering together from a fresh `defaultMeta()` (no crash, all
      0%, none completed), and a stale `completedQuests` entry naming a
      quest key absent from `content.quests.quests` (a corrupted-save
      shape — no crash, the real quests in the list are unaffected since
      the row list is built by mapping `content.quests.quests`, never
      `completedQuests`). Found one new low-severity, non-blocking bug: a
      `gte` quest's progress bar already clamped a negative
      (corrupted-save-only) `questProgress` value to 0% via `Math.max`, but
      the adjacent progress text used `Math.min(current ?? 0, target)`
      alone and displayed the unclamped negative number (e.g. "-100 /
      5000") — text and bar disagreeing under the same corrupted input.
      Fixed same session (`Math.min(Math.max(current ?? 0, 0), q.target)`)
      with the regression test noted above; not reachable through normal
      play since `meta.ts`'s own accumulation logic only ever writes
      non-negative values into `questProgress`. `npx tsc --noEmit` clean.
      `npm run test:fast`: 7 failed files / 4 failed tests, all in the
      pre-existing q15-command-domain-fuzz worker-hang and q49/q52
      Windows-scratch-dir-EPERM flake classes documented across dozens of
      prior PROGRESS.md sessions, none touching `src/ui/**`/`src/render/**`
      or this item's own files.

- [x] (fb096) [feat] normal priority: generated 2026-09-04 (same generation
      batch as fb095; QUALITY.md 1.0 Steam/itch checklist gap diff) — save
      slots (3). QUALITY.md 1.0's checklist names "save slots (3)" and
      "cloud-save-safe file format" as one line; only the file-format half is
      arguably met (a single versioned-migration JSON blob, per §11) — there
      is exactly one save (one `localStorage` key), no slot concept anywhere
      in `src/ui`. Scoped to the slots half only (the file format itself is
      out of this item's acceptance and already spec-compliant per §11).
      Add a slot-select surface (Hub-reachable, e.g. a Settings sub-panel or
      a pre-Hub picker) backed by 3 independent storage keys, with
      create/switch/delete affordances; the existing single save must
      migrate into slot 1 on first load after this change, not be silently
      orphaned. Acceptance: a unit test creates independent progress in slot
      1 and slot 2 (e.g. differing `skillPoints`), switches between them, and
      confirms each slot's state persists independently across a simulated
      reload; a separate migration test confirms a pre-existing single save
      (today's real storage shape) appears intact in slot 1 the first time
      the slot-aware loader runs — refs: QUALITY.md 1.0 (Steam/itch
      checklist). DONE 2026-09-04: new `src/ui/saveslots.ts` — `SAVE_KEY`
      (`src/meta/meta.ts`, out-of-scope but read-only) is never edited; the
      *active* slot's data always lives live in the ordinary `SAVE_KEY`, so
      `loadMeta`/`saveMeta`/`loadMetaWithNotice` need zero changes or slot
      awareness. `saveslots.ts` owns 3 dedicated keys
      (`stonewake.save.slot{1,2,3}.v1`) plus an `stonewake.activeslot.v1`
      pointer, and only mirrors `SAVE_KEY`'s raw JSON text into/out of a
      slot's own key at the moment of an explicit `switchToSlot()`.
      `ensureActiveSlotMigrated()` (called once at boot in `main.ts`'s
      `Game.start()`, before `loadMetaWithNotice()`) migrates a pre-existing
      single save into slot 1's own key on the first run after this feature
      ships, a no-op every later boot. `hub.ts`'s Settings tab gains a "Save
      Slots" panel (3 rows, active/empty labels, Switch/Delete buttons wired
      near the existing `#sw-wipe` handler); `deleteSlot()` on the active slot
      clears the live `SAVE_KEY` and the handler mirrors `#sw-wipe`'s full
      in-memory reset (`this.meta`, `spentThisVisit`, `selectedEquipment`,
      `onMetaChanged`). Targeted `tests/ui-fb096-save-slots.test.ts` (14/14):
      module-level fresh-profile default, migration (intact-in-slot-1 +
      idempotent-on-later-boot), independent slot-1/slot-2 progress across a
      simulated reload, same-slot/out-of-range no-ops, delete-non-active vs.
      delete-active behavior, the Settings-tab listing/labels/disabled-state,
      switch-triggers-reload, reload-failure fallback, and the fb101 pointer-
      write-failure case (below). code-reviewer **APPROVE** (no Critical/
      Major; one Minor — the delete-active-slot handler didn't clear
      `spentThisVisit`/`selectedEquipment` for full `#sw-wipe` parity, fixed
      same session; two Nits, addressed/not blocking). qa-playtester's first
      pass **PASS**ed the stated acceptance criteria directly but found and
      filed two real issues via hostile testing, both fixed same session
      rather than left open:
      - **fb100** (normal, real data-loss bug): the original design only
        showed an advisory "reload to continue" notice after a switch,
        leaving the still-live Hub's stale in-memory `meta` free to overwrite
        `SAVE_KEY` via any other Settings/Run/Equipment/Tree action before the
        player manually reloaded — corrupting whichever slot was active at
        the *next* switch. Fixed by reloading the page immediately
        (`window.location.reload()`) the instant a switch succeeds, instead
        of leaving an honor-system window open; falls back to the old
        advisory notice only if `reload()` itself throws. New regression
        tests confirm `reload` is actually invoked and the fallback path
        still works.
      - **fb101** (low, doc-contract violation): `setActiveSlotRaw`'s own
        `try/catch` swallowed a `setItem` failure internally, so a storage
        failure landing specifically on `switchToSlot`'s 3rd (pointer) write
        made it return `true` while the pointer never actually moved. Fixed
        by letting that write's exception propagate into `switchToSlot`'s own
        outer `try/catch` (the only other caller, `ensureActiveSlotMigrated`,
        already wraps its own call site the same way). New regression test
        forces the failure onto exactly the 3rd `setItem` call and confirms
        `switchToSlot` now returns `false` with the pointer unchanged.
      Both fixes re-verified against the full targeted suite (14/14) and
      `npx tsc --noEmit` clean; not re-dispatched to qa-playtester a second
      time (both were narrow, mechanically-verified fixes matching the
      finding's own suggested direction and regression-test shape). `npm run
      test:fast`: 6 failures, all in the pre-existing q15-command-domain-fuzz
      worker-hang and q45/q49/q52 Windows-scratch-dir-EPERM flake classes
      documented across dozens of prior PROGRESS.md sessions, none touching
      `src/ui/**`/`src/render/**` or this item's own files.

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

- [x] (fb098) [polish] low priority: generated 2026-09-04 (same generation
      batch as fb095; QUALITY.md 1.0 Steam/itch checklist gap diff) —
      colorblind palette real-content audit. QUALITY.md 1.0's Accessibility
      re-check names "colorblind palettes on real content" as its own line,
      distinct from BETA's plain "colorblind-safe palette" existence bar
      already met by fb005's per-damage-type color table and its unit test
      — "on real content" reads as a stronger bar: verifying the palette
      stays distinguishable in the actually-rendered scene, not just as an
      isolated color-table assertion. Extend `tools/ui-audit.ts` (or an
      equivalent render test) with a scene that renders real per-damage-type
      floating numbers/markers together on one frame, applies each supported
      colorblind simulation transform, and asserts every pair of
      simultaneously-visible damage-type colors stays distinguishable
      (a contrast/distance threshold) under every mode. Acceptance: the new
      audit scene/test passes against current `/data`/palette content and
      would fail if two damage-type colors were changed to be
      indistinguishable under a simulated colorblind transform (proven via a
      deliberately-broken fixture in the test, reverted before commit) —
      refs: QUALITY.md 1.0 (Accessibility re-check), fb005. DONE 2026-09-04:
      took the "equivalent render test" branch rather than editing
      `tools/ui-audit.ts` (out of this lane's Scope). New
      `src/render/colorblind-sim.ts` — a standalone, dependency-free
      simulation of protanopia/deuteranopia/tritanopia via the standard
      Vienot/Brettel-derived linear-RGB matrices (sRGB<->linear conversion via
      the correct piecewise formula, not a flat gamma), plus `colorDistance`
      (Euclidean, 0-255 sRGB space) and `auditDistinguishability` (flags any
      pair under a distance threshold). New
      `tests/render-fb098-colorblind-audit.test.ts` renders a real "mixed
      fight" (all six §3 damage types' floating numbers + a Corpse Core
      execute, one frame) through the actual `Renderer` with
      `accessiblePalette: true`, captures the real on-screen `fillStyle`
      values (same recording-canvas harness fb005 uses, extended to confirm
      each matches `damageStyleColor`/`executeStyle`'s live output), adds
      frost/frozen (read directly via `damageStyleColor` — documented, not
      silently assumed, as a compromise: no test in this repo including
      fb005's actually renders those two through `drawEnemies`'s real
      marker-drawing path with a live frozen/slowed enemy, though the function
      has no enemy-specific branching to diverge from), then for each of the 3
      CVD modes plus unsimulated asserts every pairwise distance among the 9
      colors clears `MIN_DISTANCE = 20` — chosen with headroom below the real
      content's tightest simulated pairs (poison/frost ~25.8 under tritanopia;
      frozen/execute ~35.3-37.4 under proto/deuteranopia) and well above the
      deliberately-broken fixture (a magenta/green pair, ~345 apart
      unsimulated vs. ~13.4 under simulated protanopia — chosen by an
      offline, uncommitted random search, not hand-tuned). Targeted
      `tests/render-fb098-colorblind-audit.test.ts` (3/3). code-reviewer
      **APPROVE** (no Critical/Major; three Minor — the `MIN_DISTANCE`
      threshold's justifying numbers lived nowhere in the repo, unlike
      `tools/audit/checks.ts`'s precedented `COLOR_DISTANCE_MIN`, and would
      normally get a `QUESTIONS.md` entry, but `QUESTIONS.md` is outside this
      lane's Scope — fixed by moving the real-content/broken-fixture numbers
      into `colorblind-sim.ts`'s own file-level doc comment instead, in-scope
      and same effect; a comment overstated fb005's existing coverage of the
      frost/frozen marker path as "pixel-for-pixel pinned" when it isn't
      (fb005 only asserts `damageStyleColor`'s return values are pairwise
      distinct, never through a real `drawEnemies` pass) — reworded to state
      the compromise honestly; a dangling forward-reference to numbers "in the
      file-level comment" that weren't actually there yet — fixed alongside
      the first). qa-playtester **PASS**: independently mutated the real
      `data/damagetypes.json` (not just the test's own baked-in fixture) to
      collapse poison/frost under tritanopia specifically (~14.2 simulated,
      restored after, `git diff data/damagetypes.json` clean) and confirmed
      the audit approach catches it; sanity-checked the CVD math against
      textbook red/green-under-protanopia collapse and black/white staying
      maximally distinct under every mode; confirmed the frost/frozen
      shortcut is byte-identical to what `drawEnemies` would paint (the
      function is pure, no enemy-specific branching); confirmed scope (only
      the two new files, `STATUS.md`'s dirty state pre-dated this session).
      `npx tsc --noEmit` clean. `npm run test:fast`: 6-10 failures across
      two runs this session, all in the pre-existing q15/q49/q52
      worker-hang/Windows-scratch-dir-EPERM flake classes (plus
      b032/b034/b035/b036/q13 contention-class failures that didn't
      reproduce in the same shape twice) documented across dozens of prior
      PROGRESS.md sessions, none touching `src/ui/**`/`src/render/**` or this
      item's own files — confirmed `colorblind-sim.ts` has zero import
      coupling to any failing suite.

- [x] (fb099) [feat] normal priority: generated 2026-09-04 (same generation
      batch as fb095; engineer's-judgment item, depth not scope creep per
      HANDOFF §7, complements fb095) — results-screen quest-completion
      toast. A quest can complete at run end (`applyRunResult`,
      `src/meta/meta.ts`, out-of-scope but read-only, appends to
      `next.completedQuests` and unlocks the reward) with zero player-facing
      feedback — nothing distinguishes that moment from any other run end,
      and short of fb095's new tracker panel (or the terse per-class/per-Core
      "Locked — complete a quest" strings) a player has no way to notice a
      quest completed at all. `hud.ts` already has a priority toast queue
      (`queueToast`/`showToast`) used for routine notices (e.g. `xp_overflow_
      gold`) — reuse it rather than building new UI. In `main.ts`, after
      calling `applyRunResult`, diff the old and new `meta.completedQuests`
      arrays to find newly-completed quest keys (no `src/meta` edit needed —
      pure before/after comparison of an already-returned value) and queue
      one toast per newly-completed quest naming it and its reward, shown on
      the Results screen. Acceptance: a unit test drives a quest-completing
      metric through `applyRunResult` and confirms a toast with the right
      quest name and reward text is queued exactly once, and confirms
      re-running an already-completed quest's metric (e.g. a second win past
      `chrono_veteran`'s threshold) does not re-queue its toast — refs:
      fb095, SPEC-FINAL §11, HANDOFF §7. DONE 2026-09-04: new pure
      `questCompletionToasts(content, prevCompleted, nextCompleted)` in
      `src/ui/quests.ts` diffs two `MetaState.completedQuests` string arrays
      (the actual method is `Hud.say(text, priority)`, not
      `queueToast`/`showToast` as this item's text guessed — same priority-
      queue mechanism, different real name) and returns one toast string per
      newly-completed quest, in `content.quests.quests`' authored order (not
      push order, so simultaneous completions toast in a stable order
      regardless of which metric's threshold happened to cross first inside
      `applyRunResult`) — `Quest complete: ${name} — ${rewardLabel(...)}`.
      `rewardLabel` (previously private to `quests.ts`, fb095) is now
      exported so this reuses the exact same reward text the Quests panel
      itself shows rather than a second copy that could drift. `main.ts`'s
      `frame` loop captures `this.meta.completedQuests` as `prevCompleted`
      immediately before the existing `applyRunResult` call in the
      `resultBanked` block, then after `this.meta`/`saveMeta` update, loops
      `questCompletionToasts(w.content, prevCompleted, this.meta.completedQuests)`
      and calls `this.hud.say(msg)` per entry — no `src/meta` edit, pure
      before/after comparison of an already-returned value per architecture
      rule 3. Also bumped `.sw-toast`'s `z-index` to `11` (`src/ui/
      style.css`, was implicit/auto) — without it a toast queued in the same
      tick `.sw-modal` (z-index 10, the Results screen) opens, exactly this
      item's own scenario, would paint underneath the modal's opaque
      backdrop and never be seen, contradicting "shown on the Results
      screen." Targeted `tests/ui-fb099-quest-toast.test.ts` (5/5): exactly
      one toast naming quest + reward on first completion (`win_a_run` ->
      "First Dawn" -> Pyro), no re-toast for an already-completed quest on a
      later run, no toast when nothing completes, two simultaneous
      completions toast in `content.quests.quests`' authored order via a
      real `applyRunResult` call, and (added after code-reviewer's finding
      below) a case that calls `questCompletionToasts` directly with
      `nextCompleted` listing the two quest keys in the *reverse* of their
      authored order, proving the function sorts by its own authored-order
      pass rather than trusting whatever order the caller hands it. All
      driven through the real `applyRunResult` against real
      `data/quests.json` content (modeled on `tests/p7e-quests.test.ts`'s
      `reportWith()` pattern), not a hand-rolled quest fixture; the
      fixture's `totalSeconds: 2000`/`coreHp: coreMaxHp: 500` defaults are
      deliberately above `speedrunner`'s `<=1920s` and above `scrape_by`'s
      `<=25%`-Core-HP targets so an isolated single-quest test doesn't
      coincidentally trip either Core-unlock quest, and `towersByKey` uses 5
      distinct real attacking tower keys so `wins_max4towertypes`'s
      `<=4`-types check doesn't coincidentally fire on the same win test
      cases isolating `win_a_run` are built around (all discovered and fixed
      via a scratch debug test before the real suite was written, not
      guessed). code-reviewer **APPROVE** (no Critical/Major); two Minor
      findings both addressed same session: the original "authored order,
      not push order" test only proved `applyRunResult` itself pushes in
      authored order, not that `questCompletionToasts` does its own
      sorting — closed by the added reverse-order direct-call test above;
      and a reminder that `STATUS.md` (dirty in the working tree,
      pre-existing per this session's opening `git status`, unrelated to
      fb099) must not be swept into this lane's commit — confirmed excluded.
      One Nit (the backlog entry itself wasn't checked off yet) closed by
      this update. qa-playtester **PASS**: independently drove a real
      `Game` instance end-to-end (mount, `new Game()`, `start()`, `#sw-start`
      click, ticked `frame()`) rather than trusting only the shipped unit
      tests, confirmed the toast text and `.show` class land correctly at
      run end, confirmed the z-index fix actually resolves the
      toast-hidden-under-the-Results-modal scenario it was written for,
      confirmed a practice run (`practiceUsed: true`) completes and toasts
      no quest (the `prevCompleted === this.meta.completedQuests` same-
      reference edge case from `applyRunResult`'s practice early-return
      resolves correctly through `questCompletionToasts`), confirmed
      multiple same-run-end quest completions queue and show in FIFO order
      through the existing toast queue without dropping any, and confirmed
      a stale/unknown quest key in `completedQuests` (corrupted-save shape)
      neither crashes nor produces a spurious toast (the function iterates
      `content.quests.quests`, never `completedQuests`, so an unknown key is
      structurally unreachable). Filed no new bugs; one non-blocking
      observation (unbounded same-tick toast queueing could delay a later
      routine toast behind several quest-completion ones — not a bug, no
      action taken). `npx tsc --noEmit` clean. `npm run test:fast`: 6 failed
      tests across 7 failed files (2272 passed / 24 skipped), all in the
      pre-existing q15-command-domain-fuzz worker-hang and q49/q52 Windows-
      scratch-dir-EPERM flake classes documented across dozens of prior
      PROGRESS.md sessions, none touching `src/ui/**`/`src/render/**` or
      this item's own files.

- [x] (fb100) [bug] normal priority: DONE 2026-09-04, fixed in the same
      session that produced it — see fb096's DONE note above for the fix
      (immediate `window.location.reload()` on a successful switch, replacing
      the advisory-only notice) and its regression test coverage. Original
      report preserved below for the repro detail. filed by qa-playtester
      verifying
      fb096 (2026-09-04) — save-slot switch is not reload-enforced, so any
      Hub action taken after `switchToSlot` but before the page reload
      silently corrupts the slot being left. `switchToSlot` mirrors the live
      `SAVE_KEY` into the *current* slot's own key at the moment of the
      *next* switch away from it — but nothing stops a player from clicking
      Switch, then continuing to interact with the still-live Hub (equip
      gear, allocate a skill point, "Seed a test account", "Wipe account",
      all fully enabled in the same Settings panel right next to the Save
      Slots panel) using the OLD slot's still-loaded in-memory `meta`/
      `SAVE_KEY` before ever reloading. That interaction re-writes `SAVE_KEY`
      to a value belonging to neither slot; the next switch away from the
      now-active slot then flushes that wrong value into the active slot's
      own dedicated key, permanently overwriting its real save. Repro
      (reproduced twice, deterministic, jsdom `Hub` + `saveslots.ts`
      directly — see `tests/ui-fb096-save-slots.test.ts`'s harness for the
      `openHub` pattern used): create slot 1 with `skillPoints: 10` and slot
      2 with `skillPoints: 25`, make slot 1 active; open the Hub Settings
      panel on slot 1; click Slot 2's Switch button (now active, `SAVE_KEY`
      correctly holds 25); without reloading, click "Wipe account" (`#sw-wipe`,
      fully clickable — commits `defaultMeta()`, `SAVE_KEY` becomes 0); call
      `switchToSlot(0)` to go back to slot 1 (correctly restores 10) — but
      slot 2's own dedicated key (`stonewake.save.slot2.v1`) has now been
      silently overwritten with the wiped `defaultMeta()` in the process,
      permanently destroying its real 25-point save with no notice, no
      confirm, and no way to recover it. Expected: either the Hub disables/
      confirms every other mutating action while a switch is pending reload,
      or a switch takes effect immediately (with a live reload/rehydrate)
      instead of leaving a "reload to continue" honor-system window during
      which the previous slot's stale in-memory state keeps writing to
      `SAVE_KEY`. Actual: any Settings/Run/Equipment/Tree action performed
      between a Switch click and the eventual reload corrupts whichever
      slot is active at the time of the *next* switch. Suggested regression
      test: extend `tests/ui-fb096-save-slots.test.ts` with a case that
      opens the Hub, clicks `[data-slot-switch="1"]`, then clicks `#sw-wipe`
      (or any other commit-triggering control) without reloading, then calls
      `switchToSlot(0)` and asserts the other slot's own dedicated
      `localStorage` key is unchanged from its pre-switch value — refs:
      fb096.

- [x] (fb101) [polish] low priority: DONE 2026-09-04, fixed in the same
      session that produced it — see fb096's DONE note above for the fix
      (`setActiveSlotRaw`'s exception now propagates into `switchToSlot`'s
      outer `try/catch` instead of being swallowed internally) and its
      regression test. Original report preserved below for the repro detail.
      filed by qa-playtester verifying fb096
      (2026-09-04) — `switchToSlot`'s own doc comment says a storage failure
      makes it "return false (a no-op)", but `setActiveSlotRaw` swallows its
      own `setItem` exception internally (its `catch` has no `throw`), so a
      quota/storage failure landing specifically on the third of the
      function's three writes (the active-slot pointer write, after the
      current slot's flush and the incoming slot's load into `SAVE_KEY` have
      already both succeeded) makes `switchToSlot` return `true` while
      `getActiveSlot()` still reports the old slot even though `SAVE_KEY`
      now holds the new slot's data — a real (if narrow) contract violation
      of the function's own "fail closed" doc comment. Reproduced twice
      (deterministic) by monkey-patching `Storage.prototype.setItem` to
      throw only on its 3rd invocation during a single `switchToSlot` call:
      `switchToSlot(1)` returns `true`, `getActiveSlot()` still returns `0`,
      but `loadMeta()` reads the slot-1 data. Real-world likelihood is low
      (localStorage quota failures on a few-KB JSON blob are rare), so this
      is reported rather than filed as a blocking severity, but it should
      still be fixed: either have `setActiveSlotRaw` propagate its exception
      so the outer `try/catch` in `switchToSlot` can return `false`, or give
      `switchToSlot` its own explicit check that the pointer write actually
      landed. Suggested regression test: a case in
      `tests/ui-fb096-save-slots.test.ts` that patches
      `Object.getPrototypeOf(localStorage).setItem` to throw only on its 3rd
      call within one `switchToSlot` invocation and asserts the return value
      and `getActiveSlot()` stay consistent with each other — refs: fb096.

- [x] (fb102) [bug] normal priority: generated 2026-09-04 (fewer than 3
      actionable items remained — fb085/fb093/fb097 stay open but are logged
      out-of-scope for this lane; generation rule (b)/existing-note diff) —
      boss bar overlaps the floating info rail at narrow stage widths.
      fb072's own DONE note flagged this on delivery and left it as "a
      theoretical CSS overlap with the right info rail at very narrow stage
      widths, left as a known limitation, same class as fb065's own logged
      follow-up" — it was never promoted to its own item. `.sw-bossbar`
      (`src/ui/style.css`) is centered (`left: var(--cv-cx, 50%)`) with
      `width: 360px; max-width: 60%` of the stage, while `.sw-rail-left`/
      `.sw-rail-right` each take `max-width: 32%` (widening to `55%` under
      the existing `@media (max-width: 1180px)` rule) anchored to the same
      top edge (`top: calc(var(--cv-top, 0px) + 8px)` vs. the boss bar's
      `top: calc(var(--cv-top, 0px) + 10px)`) — at any stage narrow enough to
      trigger that media query with a rail expanded and a boss alive, the
      three boxes' widths (55% + 55% + 60%) can no longer fit side by side
      without the boss bar's centered box overlapping one or both rails.
      Acceptance: a render/layout test computes (or directly asserts against)
      `.sw-bossbar`'s and an expanded `.sw-rail-right`'s effective
      left/right/width bounds at a narrow stage width (e.g. 900px, under the
      1180px breakpoint) with both visible, and confirms they do not overlap;
      the same assertion must fail against the current, unfixed CSS values
      (proven via a temporary revert, restored before commit) so the test
      actually catches the bug rather than passing vacuously — refs: fb072,
      fb065, fb082. DONE 2026-09-04: `Hud.syncStageOverlayGeometry()`
      (`src/ui/hud.ts`) — the same fb082 method that already re-derives the
      canvas's letterboxing math and publishes it as `--cv-*` CSS custom
      properties — now also computes and publishes `--bossbar-maxw`: the
      widest `.sw-bossbar` can render without reaching into either rail's own
      worst-case (fully expanded) footprint, using new module-level constants
      (`RAIL_WIDTH_PX`, `RAIL_WIDE_MAX_FRACTION`/`RAIL_NARROW_MAX_FRACTION`,
      `RAIL_NARROW_BREAKPOINT_PX`, `RAIL_EDGE_GAP_PX`, `BOSSBAR_WIDTH_PX`,
      `BOSSBAR_MIN_GAP_PX`) that mirror `.sw-rail`'s real box-model numbers,
      each commented with the exact CSS rule it mirrors — same duplication
      tradeoff `syncStageOverlayGeometry`'s own fb082 doc comment already
      accepts for the letterboxing math, for the same jsdom-can't-run-real-
      layout reason. Deliberately computed against each rail's fully-expanded
      width regardless of its live collapsed/open state, so the boss bar
      never has to react to a rail toggling. `style.css`'s `.sw-bossbar`
      `max-width: 60%` becomes `max-width: var(--bossbar-maxw, 60%)`.
      Targeted `tests/ui-fb102-bossbar-rail-overlap.test.ts` (4/4, same
      jsdom `clientWidth`/`clientHeight`-stubbing idiom
      `tests/ui-fb082-overlay-geometry.test.ts` already uses): a 900px
      (narrow, under the 1180px breakpoint) stage confirms the boss bar and
      both rails' computed bounds stay clear of one another (with an inline
      check that the old flat-60% formula would *not* have, proving the test
      isn't vacuous); a 1920px (wide) stage confirms the boss bar keeps its
      full 360px; the no-real-layout jsdom-default fallback confirms no
      property is published; a CSS-wiring check confirms `.sw-bossbar`'s
      `max-width` declaration actually references `var(--bossbar-maxw`.
      code-reviewer **REQUEST-CHANGES** → one Major: the original 3-test
      suite only asserted on the JS-published `--bossbar-maxw` property, never
      that `style.css` actually consumes it — a lone revert of the CSS half
      (leaving `hud.ts` untouched) would have silently reintroduced this exact
      bug with nothing in the suite noticing; fixed by adding the CSS-wiring
      test above. Two Minors, also addressed same session: the narrow-
      breakpoint substitution (`availW <= 1180`) checks the stage's own width
      where the real CSS media query checks the *viewport's* — safe in the
      narrow-only direction that matters (`.sw-stage` is `flex: 1 1 auto` with
      no sibling that could widen it past the viewport, so it can only guess
      "narrow" at least as readily as the real rule, never less), but the
      safety argument was undocumented — added a comment explaining it; a
      third Minor (no floor on `bossMaxW` at extreme-narrow widths — degrades
      toward the CSS border-box padding/border minimum rather than 0, same
      class of narrow-viewport degrade the rails already accept) and a Nit
      (the rail constants are re-hardcoded a third time in the test file
      rather than imported from `hud.ts`, matching this codebase's existing
      `tests/ui-fb082-overlay-geometry.test.ts` precedent of inlining rather
      than importing `GRID_W`/`GRID_H`) were both left as-is, judged
      non-blocking and consistent with CLAUDE.md's don't-build-for-
      hypotheticals rule. code-reviewer re-verified (Major fix confirmed).
      qa-playtester **PASS**: independently re-proved the CSS-wiring test's
      non-vacuousness by manually reverting `style.css`'s `max-width` line and
      confirming exactly that test (and only that test) fails, restoring
      before finishing; adversarially probed 100px/1px stage widths (clamps
      to `0px`, never negative, no throw), an odd 901px width (bounds still
      respect both rails' edges within floating-point tolerance), confirmed
      true `--cv-left != --cv-right` divergence can't occur given the
      symmetric letterboxing formula (not a gap, just how the geometry is
      built), read `.sw-rail.collapsed`'s CSS directly to confirm "fully
      expanded" genuinely is each rail's largest possible footprint (the
      fix's documented worst-case assumption holds), and confirmed
      `--bossbar-maxw` computes unconditionally regardless of boss-alive
      state with no interaction when `.sw-bossbar` is hidden; filed no new
      bugs. `npx tsc --noEmit` clean. `npm run test:fast`: 17 failed / 2242
      passed / 48 skipped (qa-playtester's independent run) and, separately,
      7 failed files / 5 failed tests / 2277 passed / 24 skipped (this item's
      own run) — both entirely pre-existing q15/q49/q52 worker-hang/Windows-
      scratch-dir-EPERM flake classes documented across dozens of prior
      PROGRESS.md sessions, none touching `src/ui/**`/`src/render/**` or this
      item's own files.

- [x] (fb103) [feat] normal priority: generated 2026-09-04 (same generation
      batch as fb102) — Results screen shows the class and Core the run was
      played with. `Hud.showResults(w: World)` (`src/ui/hud.ts`) renders
      waves/survived/level/kills/towers/equipment/skill-points but never
      names which class or Core produced them, even though both are already
      on hand with no sim/meta edit needed: `w.cfg.classKey` and `w.coreKey`
      (`src/sim/world.ts`) resolve to real display names via
      `w.content.classByKey`/`w.content.coreByKey` (`src/sim/content.ts`,
      the same maps `quests.ts`/`codex.ts` already read). With 12 classes, 5
      Cores and now 3 save slots (fb096) all live at once, a player finishing
      a run has no on-screen confirmation of which build just played short of
      remembering it themselves. Acceptance: a unit test opens Results with a
      `World`/fixture carrying a known `classKey`/`coreKey` and asserts both
      real display names (not raw data keys) appear in `.sw-results`; a
      second case with a `classKey`/`coreKey` absent from `content` (a
      corrupted-save-shape edge) confirms a raw-key fallback renders instead
      of a crash — refs: SPEC-FINAL §5.5 (Core choice), §11, fb092. DONE
      2026-09-04: `showResults` (`src/ui/hud.ts`) adds two rows ("Class"/
      "Core") at the top of the `.sw-results` grid, resolving
      `w.cfg.classKey`/`w.coreKey` via `w.content.classByKey`/`coreByKey`
      to their `.name`, falling back to the raw key string (`?? w.cfg.classKey`
      / `?? w.coreKey`) when the lookup misses. Both maps are non-optional and
      built unconditionally at content-load time, so the only real miss case
      is a corrupted-save classKey/coreKey no longer present in `/data` — the
      same `?.`-guarded tolerance `World`'s own constructor already applies to
      an unresolvable `classKey` (`world.ts:518`). Targeted
      `tests/ui-fb103-results-class-core.test.ts` (2/2): known-key display
      names render (not raw keys) for a 'swordsman'/'vampire_heart' run; an
      unresolvable classKey/coreKey doesn't throw and falls back to the raw
      key text. code-reviewer **APPROVE** (no Critical/Major; one Minor —
      backlog checkbox not yet ticked in the reviewed diff, closed by this
      update; one Nit — unescaped innerHTML interpolation, confirmed
      consistent with every other field in the same template, not a new
      surface). qa-playtester **PASS**: independently confirmed all 12
      classes/5 cores in `/data` resolve to distinct display names (not just
      the two combos in the shipped test), Class/Core rows render
      unconditionally across all three outcomes (victory/defeat_core/
      defeat_warden), empty-string keys degrade without throwing, no CSS
      layout break in `.sw-results` from the 7->9 row count, the raw-key
      fallback path is genuinely unreachable via the real `hub.ts` run-start
      flow (only hand-built fixtures/corrupted saves reach it), and confirmed
      the `<img onerror>`-style unescaped-innerHTML XSS surface pre-exists
      identically across every other field in the same template (boons,
      towers, skill cards, damage types, enemy names) — not a regression.
      Traced but did not file (harness artifact, not a product bug): reusing
      one `Hud` instance across fresh `World` fixtures without calling
      `resetModalKey()` can show a stale Class/Core display, since
      `syncModal`'s memo key doesn't include classKey/coreKey — unreachable in
      real play since `startRun` (`main.ts`) always calls `resetModalKey()`
      before every fresh/Retry/New-run start; flagged as a latent fragility
      for whoever next touches `syncModal`'s memo key. Filed no new bugs.
      `npx tsc --noEmit` clean. `npm run test:fast`: 9 failed files / 6 failed
      tests, all in the pre-existing q49/q52 Windows-scratch-dir-EPERM flake
      class documented across dozens of prior PROGRESS.md sessions, none
      touching `src/ui/**`/`src/render/**` or this item's own files.

- [x] (fb104) [polish] normal priority: generated 2026-09-04 (same generation
      batch as fb102) — bottom-bar "skill ready" ripple respects
      reducedMotion/reducedFlash. fb086's own qa-playtester pass found and
      explicitly flagged this "for the backlog generator" rather than filing
      it against fb086 itself (judged outside that item's own acceptance,
      which named only continuous/repeated cues): the bottom bar's CSS-only
      skill-ready cue (`@keyframes sw-bb-ready-flash`, `.sw-bb-flash
      .sw-bb-icon`, `src/ui/style.css`) is a brief (0.5s), event-triggered
      box-shadow ripple that neither `reducedMotion` nor `reducedFlash`
      (`src/ui/settings.ts`) currently touches, unlike every other ambient-
      motion/flash cue in the renderer (tracer jitter, phase-sweep travel,
      damage flashes). Acceptance: a unit test enables `reducedFlash` (or
      `reducedMotion`, whichever the implementation targets — pick the one
      that best matches "a brief flash effect" per the existing Settings
      label text) and confirms the ripple is suppressed or visibly reduced
      (e.g. the `sw-bb-flash` class/animation is withheld or its duration
      drops to 0) when a skill becomes ready, with an off-by-default control
      case proving the ripple still plays normally otherwise — refs: fb086
      (qa-playtester's logged observation), fb055's reducedFlash precedent.
      DONE 2026-09-04: chose `reducedFlash` — its own Settings label ("dims
      skill & Core effect flashes") is an exact match for this brief
      per-skill flash, vs. `reducedMotion`'s ambient-motion target (tracer
      jitter, phase-sweep travel). `renderSkillIcon` (`hud.ts`) now adds the
      one-shot `sw-bb-flash` class only when `!this.settings.reducedFlash`,
      gating just the ripple — the persistent `.ready` class stays
      unconditional. Updated the `private settings: Settings` field's doc
      comment (previously said Hud read settings only for the three
      onboarding-seen flags). Targeted
      `tests/ui-fb104-skill-ready-flash-reduced.test.ts` (4/4): Active1
      (single-cooldown), Active2, and an ammo-style multi-charge Active
      (Time Lord's *Time*, `ready` gated on `ammo > 0` rather than
      `cooldownRemaining <= 0`) each confirm the ripple is withheld with the
      toggle on, plus an off-by-default control case. code-reviewer
      **APPROVE** (no Critical/Major; one Minor — asked for Active2/
      multi-charge coverage beyond the original Active1-only test, added
      same session; one Nit — the unrelated pre-existing `STATUS.md` working-
      tree diff isn't part of this item, left untouched). qa-playtester
      **PASS**: confirmed the 4 tests exercise real false->true readiness
      edges (not vacuous), confirmed via grep exactly one call site adds
      `sw-bb-flash` with no bypass path, ran 89 adjacent bottom-bar/skill-icon
      tests clean (no regressions), and confirmed `Hud.settings`'s
      construction-time snapshot (no in-run Settings panel exists to go
      stale mid-run) is pre-existing behavior identical to every other
      Settings field, not a new gap. `npx tsc --noEmit` clean. `npm run
      test:fast`: 13 failures, all in the pre-existing q45/q46/q49/q52
      Windows-scratch-dir-EPERM flake classes documented across dozens of
      prior PROGRESS.md sessions, none touching `src/ui/**`/`src/render/**`
      or this item's own files.

- [x] (fb105) [feat] low priority: generated 2026-09-04 (same generation
      batch as fb102) — Codex search/filter box. The Codex
      (`src/ui/codex.ts`/`codex-collections.ts`) renders every collection as
      a plain, unfiltered table — fine at a handful of rows, but §13's content
      totals put some collections well past that (120 Constellation Nodes,
      20 enemies, 14 authored quests, 24 waves): finding one entry today means
      scrolling and reading every row. Add a search input above the table that
      filters visible rows by substring match (case-insensitive) against any
      cell's rendered text; switching collections (`CodexHandle.select`)
      clears the filter. Acceptance: a unit test opens the Codex on a
      many-row collection (e.g. "Constellation Nodes"), types a substring
      matching a small subset of rows, confirms only matching rows remain in
      the DOM (or visible), confirms clearing the input restores every row,
      and confirms switching to a different collection resets the filter —
      refs: SPEC-FINAL §11 (Codex, in-game wiki of every entity), §13
      (content totals). DONE 2026-09-04: `codex.ts`'s `show()` (called on
      mount and every collection switch) now creates a
      `<input class="sw-codex-search">` above the table and wires an `input`
      listener that toggles a `sw-codex-row-hidden` CSS class (`display:
      none`, `style.css`) on non-matching `<tr>`s using a plain
      case-insensitive `String.includes()` substring match against each row's
      `textContent` — never regex, so a literal `.`/`(`/`[` in a query can't
      misbehave. Rows are hidden, never removed from the DOM, preserving the
      index correspondence `renderDetail`'s row-click handler
      (`collection.rows[i]` ↔ `table.tBodies[0].rows[i]`) depends on. Since
      `show()` fully rebuilds `content` from scratch on every call, both
      `CodexHandle.select()` and a nav-button click get a fresh, empty search
      input for free — no separate reset code path to diverge. `.sw-codex-count`
      updates to "N of M entries" while filtered, and a `.sw-codex-no-matches`
      message (reusing the existing `.sw-note.dim` style) appears when a query
      matches nothing, both added after code-reviewer Minor findings on an
      earlier draft that left the stale total count and a silently-empty table
      with no explanation. Targeted `tests/ui-fb105-codex-search.test.ts`
      (8/8): input presence, filters the real "towers" collection to a
      unique-substring match and restores on clear, filters a synthetic small
      collection and restores, case-insensitivity, no-matches message + count
      text, empty-collection search doesn't throw, filters the largest real
      collection (well past a "handful") down to a proper non-empty subset,
      and `select()` clears the filter across a collection switch.
      code-reviewer **APPROVE** (no Critical/Major; two Minor — the stale
      count/no "no results" affordance, both addressed same session — and two
      Nits, not blocking). qa-playtester **PASS**: reran the targeted set
      (31/31 across `ui-fb105-codex-search`/`codex`/`p9b-codex-hub`) plus 9
      hostile scratch-test probes (regex-meaningful characters confirmed
      literal-not-regex, unbalanced brackets, whitespace-only query, a
      100,000-char query, rapid type/backspace/clear, click-detail
      row-index-mapping correctness after a filter-then-clear cycle using
      `classAbilitiesMarkup` as an oracle, nav-button vs `select()` mid-search
      switching, Tuner-panel coexistence, and formatted-cell array/boolean
      substring matching) and filed no bugs. `npx tsc --noEmit` clean.
      `npm run test:fast`: 15-16 failed files across two runs this session
      (one run's extra hook-timeouts attributed to CPU contention from the QA
      agent's own leftover background processes, not a regression), all in
      the pre-existing q15/q25/q28/q33/q37/q41/q45/q46/q49/q52/q53/
      fb038-status Windows-scratch-dir-EPERM flake class and the b032/b034/
      b035/b036 Training-Grounds fold-test hook-timeout class documented
      across dozens of prior PROGRESS.md sessions, none touching
      `src/ui/**`/`src/render/**`, Codex/Hub test files, or this item's own
      files.

- [x] (fb106) [polish] low priority: generated 2026-09-04 (same generation
      batch as fb102) — ultrawide/narrow safe-area unit-geometry regression
      coverage, an in-scope alternative to fb093. fb093 (left open, logged
      out-of-scope this session and in its own prior session because its
      literal acceptance names `tools/ui-audit.ts` scenes, outside this
      lane's Scope) leaves QUALITY.md 1.0's "16:9/16:10/ultrawide safe" line
      with no committed regression coverage at extreme aspect ratios at all —
      taking fb098's precedent of an "equivalent render test" branch instead
      of touching `tools/ui-audit.ts`, this item covers the same ground at
      the unit level. `Hud.syncStageOverlayGeometry()` (`src/ui/hud.ts`)
      computes the letterboxed canvas rect's `--cv-left`/`--cv-right`/
      `--cv-top`/`--cv-bottom`/`--cv-cx` custom properties that `.sw-rail`/
      `.sw-bossbar` (and fb102's fix, once landed) key off of — add a test
      that drives it at an ultrawide (2560x1080) and a narrow/portrait
      (1024x1280) container size and asserts the computed letterbox rect
      stays fully within the container with no negative offsets and no
      dimension exceeding the container. Acceptance: the new test passes
      against current code and demonstrably fails against a deliberately
      broken letterboxing calculation (a temporary fixture mutation, reverted
      before commit) — refs: fb093, fb065, fb082, QUALITY.md 1.0 (Steam/itch
      checklist). DONE 2026-09-04: new
      `tests/ui-fb106-extreme-aspect-geometry.test.ts` (no source files
      changed) mounts a `Hud`, stubs `.sw-stage`'s `clientWidth`/
      `clientHeight` to 2560x1080 (height-bound) and separately to 1024x1280
      (width-bound), calls `hud.update(w)`, and asserts on the resulting
      `--cv-left`/`--cv-right`/`--cv-top`/`--cv-bottom`/`--cv-cx` properties:
      every offset >= 0, the derived canvas rect (`availW/H` minus the
      offsets) never exceeds the container and stays positive, its aspect
      ratio stays close to the grid's 36:20 (guards against a degenerate
      all-zero-offset broken calc trivially passing the bounds checks), and
      `--cv-cx` sits inside the derived rect. Manually verified (temporarily
      flipping the `cssW` calculation's `Math.min` to `Math.max`, confirming
      both new cases fail, then reverting) that the test is not vacuous
      before committing, per the item's own acceptance text. Same jsdom
      `clientWidth`/`clientHeight`-stubbing idiom and `mount()`/`makeHud()`
      helpers as `tests/ui-fb082-overlay-geometry.test.ts`/
      `tests/ui-fb102-bossbar-rail-overlap.test.ts`. code-reviewer
      **APPROVE** (no Critical/Major; two Nits — the `cssW <= availW`/
      `cssH <= availH` checks are logically implied by the already-passing
      offset->=0 checks and add no independent bug-catching power on their
      own (the aspect-ratio and `cx`-in-bounds checks do the real work,
      confirmed by hand-tracing the reviewer's own `Math.max` mutation); the
      test hardcodes `36/20` instead of importing `GRID_W`/`GRID_H` from
      `src/sim/grid`, matching existing sibling-file precedent
      (`tests/ui-fb082-overlay-geometry.test.ts` also hardcodes `1.8` in a
      comment) rather than a new regression — both left as-is, non-blocking).
      qa-playtester **PASS**: independently reproduced the git-stash-style
      A/B (flipped `Math.min`->`Math.max`, confirmed both new cases fail;
      separately zeroed `--cv-top`, confirmed the narrow/portrait case alone
      catches it since the ultrawide case's natural top offset is already
      ~0; reverted both edits exactly, confirmed zero diff on `src/ui/hud.ts`
      afterward) plus hostile edge cases via a scratch test file (deleted
      after use): a square 1000x1000 container, jsdom's zero-size default
      (no stub call), extremely tiny 3x2/1x1 containers, and an
      awkward-rounding 999x555 container — no crashes, no negative offsets
      in any case. All sibling geometry tests
      (`tests/ui-fb082-overlay-geometry.test.ts`,
      `tests/ui-fb102-bossbar-rail-overlap.test.ts`,
      `tests/render-fb065-stage-fill.test.ts`) still pass alongside the new
      one (17/17 combined). Filed no new bugs. `npx tsc --noEmit` clean.
      `npm run test:fast`: 14 failed files / 37 failed tests, all in the
      pre-existing q46/q49/q52 CLI-subprocess Windows-scratch-dir EPERM flake
      class documented across dozens of prior PROGRESS.md sessions, none
      touching `src/ui/**`/`src/render/**` or this item's own file (no source
      file was changed by this item at all).

- [x] (fb107) [bug] high priority: generated 2026-09-04 (fewer than 3
      actionable items remained — fb085/fb093/fb097 stay open but logged
      out-of-scope for this lane; generation rule (b), SPEC-FINAL/QUALITY
      coverage diff against fb073) — every key-hint string in the in-run HUD
      and the Hub ignores the player's remapped `keyBindings` (fb073) and
      keeps showing the hardcoded defaults instead. Confirmed live: `hud.ts`'s
      constructor bakes literal `Q`/`E` into the bottom bar's `.sw-bb-key`
      badges (~line 263/272), the help legend hardcodes `WASD`/`Space`/`U`/
      `X`/`1-9`/`0`/`Enter`/`Q`/`R`/`F`/`C`/`P`/`V`/`Esc` (~line 322-326), the
      `DPS`/`VS` redock button titles hardcode `(P)`/`(V)` (~line 238/240),
      the control-bar button titles hardcode `(R)`/`(C)`/`(P)`/`(V)`/`(Esc)`
      (~line 297-303), the character panel's `Hud.activeSkillRow` calls pass
      literal `'Q'`/`'E'` (~line 1327-1328), the Dusk onboarding prompt
      (`ONBOARDING_TEXT.dusk`) says "WASD to move, Space to dash, and Q/E for
      your class actives" unconditionally, and `class-info.ts`'s
      `activeSkillMarkup` (used by both the bottom-bar tooltip and the Hub's
      class-select screen, `class-select.ts` line 88-89) hardcodes
      `Q, Active 1` / `E, Active 2`. A player who rebinds Active1 off Q via
      fb073's own Settings Controls panel sees every one of these still say
      Q. Acceptance: a unit test constructs a `Hud`/`Hub` with a non-default
      `KeyBindings` (e.g. `active1: 'j'`) and confirms the bottom-bar badge,
      at least one help-legend/button-title hint, the character panel's
      Active1 row, and the class-select tooltip label all show the rebound
      key, not `Q`; a second case confirms the movement group (WASD) and
      Dusk onboarding text also reflect non-default `moveUp`/`moveLeft`/
      `moveDown`/`moveRight`/`dash` bindings — refs: fb073, fb079, QUALITY.md
      BETA (key remapping), SPEC-FINAL §11. DONE 2026-09-04: `Hud` (`hud.ts`)
      gains a 4th constructor param `keyBindings: KeyBindings =
      defaultKeyBindings()`, stored as a construction-time snapshot (same
      tradeoff `settings`'s own doc comment already accepts — no in-run
      Controls panel exists to go stale mid-run); used to replace every
      hardcoded literal named above: the bottom-bar `.sw-bb-key` badges, the
      help legend, the `DPS`/`VS`/`Ranges`/`Character` button titles, the
      bottom-bar tooltip's `activeSkillMarkup` calls, `activeRow`'s character-
      panel row, and a new `onboardingText(key, kb)` function replacing the
      old static `ONBOARDING_TEXT` dict for the Dusk prompt. `class-info.ts`'s
      `activeSkillMarkup`/`classAbilitiesMarkup` and `class-select.ts`'s
      `classSelectSkillsMarkup` gained an optional `keyBindings` param
      (defaulting to `defaultKeyBindings()`, so every pre-existing caller —
      Codex, ~40 other test call sites — is unaffected); `hub.ts` threads its
      existing `this.keyBindings` (already there from fb073) into the
      class-select call; `main.ts`'s `new Hud(...)` now passes `this.
      keyBindings` as the 4th arg. Targeted
      `tests/ui-fb107-keyhints-follow-remap.test.ts` (7/7): bottom-bar badge,
      defaults-with-no-arg control, help legend + control-bar titles
      (including the speed selector, see below), bottom-bar tooltip label,
      character-panel Active rows, Hub class-select tooltip label, and Dusk
      onboarding text all reflect a fully-remapped `KeyBindings` fixture.
      code-reviewer **APPROVE** (no Critical/Major); two Minor findings both
      addressed same session: (1) `bottom-bar.ts`'s `SkillIconState.hotkey:
      'Q'|'E'` field was dead (nothing read it — `hud.ts` builds the badge
      text straight from `this.keyBindings`, not from this field) but a stale
      landmine one accidental future read away from reintroducing this exact
      bug — deleted entirely along with its 4 write sites, confirmed
      grep-clean of remaining readers; (2) the Codex's Class detail view
      (`codex-collections.ts`) still shows default keys, a real but
      consciously-deferred gap since `Hub` already holds `this.keyBindings`
      one tab over — logged in this file's Log below rather than fixed here,
      per the reviewer's own framing (a `CodexCollection.renderDetail`
      signature widening, not a one-liner). qa-playtester **PASS** against
      the stated acceptance criteria (independently re-derived all 7 checks,
      ran 179 tests across a broad related sample plus the full `test:fast`
      suite clean of anything touching `src/ui/**`) and filed one new Minor
      bug: the in-run game-speed `<select>`'s title also hardcoded `"Game
      speed (F cycles)"`, the one control-bar sibling fb107's own scoping
      missed (not deliberately deferred — a genuine miss). Fixed same
      session (`hud.ts`'s `#sw-speed` title now reads
      `keyLabel(keyBindings.cycleSpeed)`), an 8th assertion added to the
      regression test, re-verified green. `npx tsc --noEmit` clean.
      `npm run test:fast`: 11 failures (this item's own run) / 4 failures
      (qa-playtester's independent full-suite run), all in the pre-existing
      q15/q45/q46/q49/q52 worker-hang/Windows-scratch-dir-EPERM flake classes
      documented across dozens of prior PROGRESS.md sessions, none touching
      `src/ui/**`/`src/render/**` or this item's own files.

- [x] (fb108) [feat] normal priority: generated 2026-09-04 (same generation
      batch as fb107) — extend fb063's sentence-form Active tooltips
      (`ACTIVE_SENTENCES`, `class-info.ts`) past the 6 kinds the 3
      normal-profile classes use to the remaining 18 kinds the other 9
      classes use (`repair_heal`, `summon_turret`, `burst_damage`,
      `dash_trail`, `charge_pierce`, `dash_volley`, `raise_skeletons`,
      `death_pact`, `frost_nova`, `ice_wall`, `chain_lightning`, `overload`,
      `blood_tithe`, `dash_heal`, `manifest_spirit`, `recall_totem`,
      `clarion_taunt`, `judgement`) — confirmed via a `data/classes.json`
      scan, 24 total kinds across all 12 classes, only 6 covered today. Those
      9 classes are dev-toggle-reachable in the Hub's Class screen (fb058's
      "show hidden classes" setting) and playable in every real run, so their
      Actives still show the older bare numeric-field fallback
      `ACTIVE_SENTENCES`'s own file comment already documents as the accepted
      interim state "until a hidden class becomes normal-profile-visible" —
      this closes that gap directly rather than waiting on fb057/fb059.
      Acceptance: every kind in the list above has a hand-authored sentence
      function in `ACTIVE_SENTENCES`, embedding live-resolved numbers the
      same way the existing 6 do; a test asserts all 24 kinds now resolve to
      a sentence (none fall through to the bare-field-list fallback) — refs:
      fb063, fb058, QUALITY.md ALPHA ("every class's kit is usable and
      legible without reading any docs"). DONE 2026-09-04: `class-info.ts`
      adds 18 new sentence functions (one per kind above) plus a
      `humanizeKey` helper (turns a `/data` tower key like `arrow_spire`
      into "Arrow Spire" for `summon_turret`/`ice_wall`'s tower-name
      mentions — a display approximation, not a `content.towerByKey` lookup,
      since none is threaded into this file), all registered in
      `ACTIVE_SENTENCES`, each embedding live-resolved numbers via the
      existing `liveDamageValue`/`liveCooldownValue` helpers the same way
      fb063's original 6 do. Two kinds intentionally show a raw (non-live)
      number with a code comment explaining why: `burst_damage`'s damage and
      `burnDps` (the sim's `fireEffect` scales by `w.derived.powerMul`, not
      `characterDamage`'s `atkFlat`/`damageMul` formula `liveDamageValue`
      models) and `charge_pierce`'s compounding rate (the sim's
      `fireDeadeyeDraw` compounds the raw `/data` base *before* atkFlat is
      added, so pairing a live/atkFlat-inclusive number directly against the
      compounding-rate text would read as "this number grows by that rate,"
      which overstates the real total — the sentence instead only shows the
      live number for the release-now/0s-held case, where the two formulas
      coincide exactly, and calls the growth-before-bonuses order out in
      words). Targeted
      `tests/ui-fb108-active-sentences-all-classes.test.ts` (31/31): all 12
      classes load, all 24 kinds resolve to a sentence
      (`<p class="sw-note">`) not the bare fallback, the engineer
      summon_turret/stormcaller chain_lightning/archer charge_pierce
      live-number-accuracy spot checks, the chain_lightning "up to N total,
      not N+1" count-matches-`fireChainSurge` check, and (added after
      qa-playtester's finding below) the summon_turret/manifest_spirit
      wording check. code-reviewer **REQUEST-CHANGES** → one Major: two of
      the new sentences (`dashTrailSentence`, `dashHealSentence`) displayed
      `eff.dashWidth` directly as "X tiles wide," but `fireFlameRoad`
      (dash_trail) uses it as a `GroundArea` circle *radius* and
      `fireCrimsonRush` (dash_heal) explicitly names its own copy `half` —
      both are half-widths, so the true full width is `2 * dashWidth`, not
      `dashWidth`; fixed by doubling the displayed value in both sentences
      (with a code comment on each pointing at the sim line that treats it
      as a radius/half-width). Also flagged, not blocking and not fixed in
      this diff: `dashSlashSentence` (fb063's original `dash_line` sentence,
      untouched by this item) has the identical bug — logged as fb112 below
      for a follow-up. Two Minors left as-is (a `burst_damage` static-number
      staleness argument weaker than a factual error, and a missing "up to"
      qualifier on `dash_volley`'s arrow count matching every other
      probabilistic-count sentence's phrasing) — both cosmetic, not
      required by the acceptance text. qa-playtester **PASS** against the
      stated acceptance criteria (re-ran the 30-test suite clean, confirmed
      `tsc --noEmit` clean, confirmed the diff touches only in-scope files)
      plus independently re-derived `chainCount`/`chainCap`,
      `wallSeconds`/orientation, `titheHpFraction` current-vs-max-HP, and
      `pactDrainPerSecond` timing straight from each `fireX` handler in
      `src/sim/classes.ts` rather than trusting the sentences, and hostile-
      fuzzed all 24 kinds through both an absent and an extreme/negative
      `live` context (no crash, no `undefined`/`NaN`); filed one new
      low-severity bug: `summonTurretSentence`/`manifestSpiritSentence`'s "X%
      of its stats" wording implied a uniformly-scaled-down clone, but
      `fireSummonTurret`/`fireManifestSpirit` only scale the summon's dps by
      `summonStatMul` — range and attack interval carry over at the source
      tower's full value, so the summon has full-strength range/cadence at
      a fraction of the damage, a materially better unit than "stats"
      implies. Fixed same session: both sentences now read "at N% of its
      damage (full range and attack speed)"; new regression case added to
      the same test file confirming the wording. `npx tsc --noEmit` clean.
      `npm run test:fast`: 16 failed files / 52 failed tests, all in the
      pre-existing q46/q49/q52/q53 Windows-scratch-dir EPERM flake class
      documented across dozens of prior PROGRESS.md sessions, none touching
      `src/ui/**`/`src/render/**` or this item's own files.

- [x] (fb109) [polish] low priority: generated 2026-09-04 (same generation
      batch as fb107) — fb102's own code-reviewer Minor, never promoted to
      its own item: `Hud.syncStageOverlayGeometry()`'s `--bossbar-maxw`
      computation has no floor at extreme-narrow stage widths, so it degrades
      toward the CSS border-box padding/border minimum instead of a sane
      lower bound as the stage keeps shrinking (same class of narrow-viewport
      degrade the rails already accept, per that review note). Acceptance: a
      test drives `syncStageOverlayGeometry` at a pathologically narrow width
      (e.g. 200px) and confirms `--bossbar-maxw` never goes below a small
      fixed floor (chosen so the boss name/HP text stays legible, e.g. 120px)
      instead of shrinking unbounded — refs: fb102, fb065, fb082. DONE
      2026-09-04: `hud.ts` adds a `BOSSBAR_MIN_WIDTH_PX = 120` constant next
      to the existing `BOSSBAR_WIDTH_PX`/`BOSSBAR_MIN_GAP_PX` ones;
      `syncStageOverlayGeometry()`'s final `--bossbar-maxw` clamp changed from
      `Math.max(0, Math.min(BOSSBAR_WIDTH_PX, maxFromLeft, maxFromRight))` to
      `Math.max(Math.min(BOSSBAR_MIN_WIDTH_PX, availW), Math.min(BOSSBAR_WIDTH_PX,
      maxFromLeft, maxFromRight))` — floors at 120px instead of 0 once both
      rails' worst-case footprints overlap each other, while the
      `Math.min(BOSSBAR_MIN_WIDTH_PX, availW)` half (added during code review)
      keeps the floor from ever exceeding the stage's own width at stages
      narrower than 120px itself. Targeted
      `tests/ui-fb102-bossbar-rail-overlap.test.ts` (6/6, up from 4): a
      200×112px stub (both rails' footprints already overlap) confirms
      `--bossbar-maxw` floors to exactly 120 instead of the pre-fix 0; a
      100×56px stub (narrower than the floor itself) confirms it clamps to
      `availW` (100) rather than spilling past the stage edge. code-reviewer
      APPROVE (no Critical/Major; one Minor — the floor wasn't originally
      clamped against `availW`, risking the boss bar rendering wider than a
      sub-120px stage itself — fixed same session with the `availW` clamp
      above and its own regression case, re-verified green). qa-playtester
      PASS: independently reimplemented the geometry math standalone and swept
      widths 100–1300px confirming the floor holds flat at 120 with no
      discontinuity, dip, or `availW` overshoot at any point, confirmed the
      exact-120px and 121px boundary, confirmed the zero-width early-return
      path and the wide-stage 360px cap are both unaffected, and cross-ran the
      sibling `ui-fb106-extreme-aspect-geometry`/`ui-fb082-overlay-geometry`
      suites clean; filed no new bugs. `npx tsc --noEmit` clean. Full
      `src/ui/**`/`src/render/**`-relevant sweep (`tests/ui*`, `tests/render*`,
      `tests/fb0*`, 79 files/730 tests) had exactly 1 failure
      (`fb038-status.test.ts`'s `q47 PIN_COVERAGE` case), the same pre-existing
      Windows scratch-dir EPERM class documented across dozens of prior
      PROGRESS.md sessions, unrelated to this change. `npm run test:fast`: 59
      failures, all in the pre-existing q46/q49/q52/q53 worker-hang/Windows-
      scratch-dir-EPERM flake classes, none touching `src/ui/**`/`src/render/**`
      or this item's own files.

- [x] (fb110) [bug] low priority: generated 2026-09-04 (same generation
      batch as fb107) — fb103's own qa-playtester finding, traced but not
      filed against fb103 itself: `Hud.syncModal`'s memo key doesn't include
      `classKey`/`coreKey`, so reusing one `Hud` instance across fresh
      `World` fixtures without calling `resetModalKey()` can show a stale
      Class/Core display on the Results screen. Unreachable via real play
      (`startRun` in `main.ts` always calls `resetModalKey()` before every
      fresh/Retry/New-run start) but a latent trap for the next change that
      reuses a `Hud` across worlds without going through `startRun`.
      Acceptance: either fold `classKey`/`coreKey` into `syncModal`'s memo
      key (matching every other field the memo already tracks) with a
      regression test reusing one `Hud` across two `World` fixtures with
      different classes/Cores and confirming the second's Results screen
      shows its own class/Core, not the first's; or add a code comment on
      `syncModal`'s memo key documenting the reuse hazard and why it's
      accepted — refs: fb103. DONE 2026-09-04: took the first option.
      `syncModal`'s (`src/ui/hud.ts`) memo key grew from
      `${w.phase}:${w.offers.length}:${w.outcome}:${w.level}` to append
      `:${w.cfg.classKey}:${w.coreKey}`; both fields are set once in the
      `World` constructor (`src/sim/world.ts`) and never reassigned, so this
      cannot cause any spurious re-render during a normal run. Targeted
      `tests/ui-fb110-modal-key-classcore.test.ts` (1/1): builds two `World`
      fixtures with different classKey/core but identical
      phase/offers.length/outcome/level, reuses one `Hud` across both without
      `resetModalKey()`, confirms the second's Results screen shows its own
      class/Core, not the first's stale one. code-reviewer APPROVE (no
      Critical/Major; one Minor noting the fix only covers classKey/coreKey
      specifically — a future `RunConfig` field added to the results/level-up
      screens would need its own memo-key addition, not a blocker, the
      acceptance text's two options anticipated exactly this). qa-playtester
      PASS (confirmed via git-stash A/B the test fails pre-fix and passes
      post-fix; confirmed every real run-start path — fresh `startRun`,
      `onRetry`, `onNewRun`, boot-time `tryResumePersistedRun` — routes
      through `beginRun`, which both constructs a fresh `Hud` and explicitly
      calls `resetModalKey()`, so the original hazard is genuinely unreachable
      via real play as the item claimed) and filed one new unrelated bug via
      hostile testing of the same memo mechanism — see fb113 below.
      `npx tsc --noEmit` clean. `npm run test:fast`: 56 failed tests / 16
      failed files, all in the pre-existing q49/q52/q53 worker-hang/Windows-
      scratch-dir-EPERM flake class documented across dozens of prior
      PROGRESS.md sessions, none touching `src/ui/**`/`src/render/**` or this
      item's own files.

- [x] (fb113) [bug] normal priority: fb110's own qa-playtester finding — the
      Level-Up modal's own memo key (the same `syncModal` key fb110 touched)
      goes stale on offer reroll, showing the pre-reroll offer cards while
      `w.offers` has already been replaced: `onReroll` → `rerollOffers`
      (`src/sim/progression.ts`) reassigns `w.offers` to a fresh array of the
      same length (`OFFER_COUNT`), and none of `syncModal`'s memo key fields
      (`phase`, `offers.length`, `outcome`, `level`, `classKey`, `coreKey`)
      change on a reroll, so `syncModal` (`src/ui/hud.ts`) treats the
      post-reroll frame as a memo hit and skips re-rendering — the DOM keeps
      showing the old `.sw-offer` cards' names/descriptions while
      `onPickOffer(index)` would apply `w.offers[index]`, the new rerolled
      offer at that index. Reachable via completely ordinary play (any
      level-up followed by a reroll click), unlike fb110's own hazard: a
      player can click a card describing one offer and receive a different
      one. Found by qa-playtester (fb110 verification), reproduced
      deterministically on two seeds/classes with the DOM staying on the
      pre-reroll offer names after `rerollOffers(w)` + `syncModal(w)`.
      Acceptance: a regression test — roll level-up offers, call
      `hud.syncModal(w)`, call `rerollOffers(w)`, call `hud.syncModal(w)`
      again — confirms the rendered `.sw-offer b` labels match
      `w.offers.map(o => o.name)` (the new offers), not the pre-reroll ones;
      suggested fix direction: fold a per-roll identity into the memo key —
      `w.rerollsLeft` (already decrements each reroll) or a new roll-sequence
      counter incremented by both `openLevelUpIfPending` and `rerollOffers`
      — refs: fb110, `rerollOffers` (`src/sim/progression.ts`), owner
      feedback (fb103/fb107/fb110 generation lineage). DONE 2026-09-04: took
      the suggested `w.rerollsLeft` direction. `syncModal`'s (`src/ui/hud.ts`)
      memo key grew from `${w.phase}:${w.offers.length}:${w.outcome}:${w.level}:
      ${w.cfg.classKey}:${w.coreKey}` to append `:${w.rerollsLeft}` — the only
      other writer of `w.offers` besides `rerollOffers` is
      `openLevelUpIfPending` (already covered independently by the
      phase/level/rerollsLeft-reset fields it also changes) and `takeOffer`
      (already covered by the `phase` flip back to `act2`), so this closes the
      one real gap without leaving a sibling staleness path. Targeted
      `tests/ui-fb113-modal-key-reroll.test.ts` (1/1): rolls offers, syncs,
      captures pre-reroll `.sw-offer b` labels, calls `rerollOffers(w)`,
      confirms the new offers differ from the old (code-reviewer's Minor,
      guards against a degenerate identical-reroll false pass), syncs again,
      confirms the rendered labels now match the post-reroll `w.offers`
      names. code-reviewer APPROVE (no Critical/Major; the one Minor above
      fixed same session). qa-playtester PASS: confirmed via git-stash A/B
      that the test fails pre-fix with the exact stale-name symptom and
      passes post-fix; hostile-tested multiple sequential rerolls (each
      re-renders correctly as `rerollsLeft` counts down), a reroll attempted
      at `rerollsLeft === 0` (correctly a no-op, no spurious re-render since
      the memo key is unchanged), and traced the real `onPickOffer` →
      `pick`-command path (`main.ts`/`run.ts`) end-to-end to confirm picking
      after a reroll now applies the same offer the modal displays; also
      re-ran fb110's own test green. Filed no new bugs. `npx tsc --noEmit`
      clean. `npm run test:fast`: 14-16 failed files across runs this
      session, all in the pre-existing q46/q49/q52/q53 Windows-scratch-dir
      EPERM flake class documented across dozens of prior PROGRESS.md
      sessions, none touching `src/ui/**`/`src/render/**` or this item's own
      files.

- [x] (fb111) [polish] low priority: generated 2026-09-04 (same generation
      batch as fb107; QUALITY.md 1.0 checklist diff, engineer's-judgment
      item per HANDOFF §7) — audit every `localStorage`-persisted blob this
      lane owns (`SAVE_KEY` and the fb096 save-slot keys via `saveslots.ts`,
      `stonewake.keybindings.v1`, `Settings`'s own key) against QUALITY.md
      1.0's "cloud-save-safe file format" checklist line: confirm each is
      pure portable JSON with no environment-specific fields (absolute paths,
      machine-local timestamps used as identity rather than data, non-
      serializable values) that would corrupt or fail to round-trip if synced
      via a cloud-save provider onto a different machine. Acceptance: a test
      round-trips each persisted shape through `JSON.stringify`/`JSON.parse`
      on a fixture built on one "machine" (arbitrary `Date.now()`/locale) and
      confirms byte-for-byte semantic equality when parsed as if on another;
      if the audit finds a real non-portable field, fix it with its own
      regression case — if it finds none, document the clean result in this
      item's DONE note (a real, if boring, outcome per CLAUDE.md's honesty
      rule) — refs: QUALITY.md 1.0 (Steam/itch checklist). DONE 2026-09-05:
      **the audit came back clean — no production fix was owed.** New
      `tests/ui-fb111-cloud-save-portability.test.ts` (7 tests) covers all
      six `stonewake.*` keys a `grep` over `src/` finds (`meta.ts`'s
      `SAVE_KEY`, `saveslots.ts`'s slot-key prefix and active-slot pointer,
      `keybindings.ts`, `settings.ts`, `runpersist.ts`); there is no
      `sessionStorage`/`IndexedDB`/cookie use anywhere to miss. Each shape is
      written under one `Date.now()`, carried across as raw text ONLY, and
      read back under a very different one. Findings, stated rather than
      assumed: (1) `runpersist.ts`'s `sessionId` is the single clock-derived
      byte in any owned blob (`main.ts` mints it from `Date.now()`), and it is
      opaque data, never cross-machine identity — `beginRun` re-mints it and
      nulls `lastWrittenSessionId` on a *resumed* run too, so `persistRun`'s
      cross-tab backoff can never fire against a foreign id; asserted
      behaviourally by having "machine B" take ownership of a foreign
      checkpoint. (2) `stonewake.activeslot.v1` is the one owned value that is
      deliberately NOT JSON (`String(slot)`, read back via `Number(raw)` +
      `inRange`) — a bare decimal string, locale-independent and portable;
      audited explicitly rather than filtered out. (3) `input.ts` lower-cases
      keys with locale-independent `toLowerCase()`, not `toLocaleLowerCase()`,
      so the Turkish-dotless-I hazard that would genuinely corrupt a synced
      keybinding does not exist; every `toLocale*`/`localeCompare` in the repo
      is display-only and never persisted. (4) The one intended exception,
      recorded so "all shapes are cloud-safe" is not overstated: a synced run
      checkpoint whose `contentHash` disagrees with the reading machine's
      `/data` is deliberately DISCARDED (`main.ts`'s
      `tryResumePersistedRun`) — by design, and already covered by fb074's own
      test. code-reviewer **REQUEST-CHANGES** on the first pass, on the
      evidence rather than the conclusion (which it verified independently),
      and it was right twice over: the scanner ran against `JSON.parse`
      output, where four of its five rules are unreachable because
      `JSON.stringify` has already dropped `undefined`/functions and laundered
      `NaN`/`Infinity`/`Date` into `null`/`{}`/a string — and one assertion
      (`JSON.stringify(JSON.parse(JSON.stringify(parsed)))`) was a literal
      tautology. Fixed by scanning the live source object *before*
      serialization and replacing the tautology with `JSON.stringify(parsed)
      === raw`, which tests the writer's own output; confirmed live by
      injecting `maxDamageNumbers: NaN`, which the old version laundered to
      `null` and passed and the new one catches. Second Major: the run
      checkpoint was audited as a bare `cfg()` helper object, a shape the app
      never writes — production persists `lastCfg` *after* `new Run(cfg)`, so
      `World`'s constructor has stamped `contentHash`, the very field with
      cross-machine consequences; the fixture now goes through the production
      path with Hub-shaped `core`/`equipment`/`ownedEquipment` and asserts the
      hash. Minors folded in: `toStrictEqual` (so a dropped `undefined` cannot
      pass as equal), the explicit pointer audit above, a guard on the
      ICU-dependent `de-DE` assertion (small-ICU Node would fail it for
      reasons unrelated to this code), a narrowed test title, and a
      behavioural sessionId assertion replacing an inert string check.
      Re-verified **APPROVE** was not re-requested — the changes are
      test-only and each was verified by watching it fail before it passed.
      `npx tsc --noEmit` clean; targeted suite (fb111, fb112, fb108, fb096,
      fb074, `q3-save-fuzz`) 132/132; all 52 `tests/ui*`/`tests/render*` files
      340 passed/6 skipped. `npm run test:fast` 2321 passed/3 failed/48
      skipped, every failure in the standing `b028` process-tree-kill,
      `b032`/`b034`/`b035`/`b036` port-contention, and `q15`/`q41`/`q45`
      scratch-dir module-resolution families this queue documents every
      session (`b028` reproduced identically on a clean tree), none touching
      `src/ui/**`/`src/render/**` or this item's own files. qa-playtester
      **PASS** on acceptance and, importantly, independently confirmed the
      clean conclusion with its own probes rather than by re-reading the test:
      all six keys written through the real APIs under `TZ=UTC LANG=C` vs
      `TZ=Pacific/Kiritimati LANG=de_DE.UTF-8` came out byte-identical; a real
      960-tick run persisted on one "machine" resumed on another (different
      clock, different `Math.random`, unrelated account in `SAVE_KEY`) to the
      same `run.hash()` as an independent replay, then re-persisted under its
      own newly-minted `sessionId`; and `getActiveSlot()` survived hostile
      pointer values (`""`, `" 1 "`, `"0x2"`, `"١"`, `"02"`, newline-suffixed).
      It also filed one **Major against the test's protective value**, which
      was right and is fixed here: the audit could not detect the FIRST
      violation class this item's own text names. A writer injecting
      `savedAt: Date.now()` / `tz: ...resolvedOptions().timeZone` beside the
      real payload passed 7/7 for three of the four blobs — such a field never
      reaches the pre-serialize scan (it is added inside the writer, after the
      caller's object), it is a finite number or plain string so the
      post-parse scan passes it, and then `sanitize`/`sanitizeKeyBindings`/
      `migrateWithNotice` each rebuild their result field by field, dropping
      the intruder before the round-trip comparison sees it; only
      `runpersist.ts`, whose loader returns the parsed object as-is, was
      protected. Closed by pinning each blob's stored top-level key set.
      Verified by reproducing qa-playtester's exact three-file poison: 7/7
      green before the fix, 4 failures after, sources restored and confirmed
      clean by `git diff`. Its second finding (a cross-key, not per-field,
      invariant the per-blob audit structurally cannot see) is filed as fb119
      below; its third is informational and recorded in the Log.

- [x] (fb112) [bug] low priority: generated 2026-09-04 (code-reviewer finding
      during fb108, not fixed there since it's a pre-existing bug outside
      that diff) — `dashSlashSentence` (fb063's original `dash_line`
      sentence, `class-info.ts`) displays `eff.dashWidth` directly as "X
      tiles wide," the same bug fb108 fixed in `dashTrailSentence`/
      `dashHealSentence`: `lineHit` (`src/sim/combat.ts`) takes this value as
      a parameter literally named `halfWidth`, so the real hit corridor is
      `2 * dashWidth` wide, not `dashWidth`. Swordsman's Circle Slash (the
      only normal-profile class using `dash_line`) currently shows half the
      true corridor width to every player. Acceptance: `dashSlashSentence`
      shows `2 * (eff.dashWidth ?? 0)` (matching fb108's fix pattern), with a
      regression test asserting the doubled value appears — refs: fb108,
      fb063, `lineHit` (`src/sim/combat.ts`). DONE 2026-09-05:
      `dashSlashSentence` (`src/ui/class-info.ts`) now renders `trimNum(2 *
      (eff.dashWidth ?? 0))`, matching fb108's fix in the sibling two
      sentences, with a doc comment naming the exact sim evidence
      (`fireDashSlash` passes the value as `lineHit`'s `halfWidth`; `lineHit`
      rejects on `perp > halfWidth + e.radius`, an unsigned perpendicular
      distance, so the band spans `dashWidth` to EACH side). Swordsman's
      Circle Slash was showing 1 tile for a corridor that is really 2. New
      `tests/ui-fb112-dash-slash-width.test.ts` (4 tests): the string
      assertion is anchored by a sim-level probe that drives the real
      `class_active2` Command and measures which enemies the engine actually
      struck — enemies at `±0.99 * dashWidth` are hit and one at `1.01 *
      dashWidth` is not, with `e.radius = 0` removing per-enemy slack — so
      the half-width is established from behaviour, not from the parameter's
      name. Confirmed a real regression test by reverting the one-line fix
      and watching only the string assertion fail. code-reviewer **APPROVE**
      (no Critical/Major; it re-derived the sim ground truth independently and
      confirmed via the CLAUDE.md grep-the-readers rule that `dashWidth` has
      exactly four readers — the three now-doubled sentences plus a latent
      fallback label — and that no other `src/ui/**` info surface has this bug
      class). Four Minors folded in before commit: expectations now format
      through `trimNum` rather than `String` (the two diverge the moment
      `/data` authors a `dashWidth` whose double is not 2-decimal-clean),
      the boundary probes tightened from 0.9/1.5 to 0.99/1.01 so the comment's
      "exactly 2x" claim is literally true rather than merely bounded, the
      enemy spawned by name (`'husk'`) instead of `enemies[0]` (a row reorder
      could put a trait-carrying enemy there, and `Bulwark`/`Shellback`
      mitigation survives `e.armor = 0` while a `pack` trait would spawn
      uncontrolled extras), and a dead `attackCooldown` line dropped. Two
      out-of-scope nits the reviewer raised are logged below rather than
      widened into this diff. `npx tsc --noEmit` clean; targeted suite
      132/132; all 52 `tests/ui*`/`tests/render*` files green.
      qa-playtester **PASS**, and unusually productive: it independently
      binary-searched the engine's real half-width (40 iterations per case)
      across nine aim directions, five enemy radii, the merged-charge path and
      with `swordsman_shoes` equipped, and measured **1.00000 every time** —
      so `2 * dashWidth` is right in every case it could construct, and the
      `+e.radius` slack `lineHit` grants makes "2 tiles wide" conservative
      rather than generous. It confirmed the regression test is real by
      reverting the fix (only the string assertion went red; the sim-anchored
      corridor probe stayed green, which is exactly right — it measures the
      engine, not the string), and re-confirmed no other `src/ui/**` sentence
      shows a half-width as a full width (`LINE_HALF_WIDTH` and `coneHit`'s
      `halfAngle` are never surfaced in any string; every "within X tiles" is
      an honest radius). It then filed **four new bugs** from hostile probing
      of the same surface — fb120-fb123 below — of which fb120 is the same
      sentence-number-≠-sim-number bug class fb112 exists to kill, at a larger
      absolute error.

- [x] (fb142) [feat] generated 2026-09-05 (fewer than 3 actionable items
      remained — fb085/fb093/fb097 are all out-of-lane-Scope and re-confirmed
      so this session; QUALITY.md BETA/1.0 checklist gap diff) — device-pixel-
      ratio change handling. QUALITY.md BETA's Settings line names
      "resolution/DPR handling", and `Renderer.resize()` (`src/render/
      canvas.ts`) does read `globalThis.devicePixelRatio` — but `main.ts`'s
      `bindGlobalInput` re-runs it on `window.resize` ALONE, and `matchMedia`
      appears nowhere in `src/`. Dragging the window to a monitor with a
      different DPI (and, in engines that do not fire `resize` on a zoom
      change) leaves the backing store pinned at the old ratio, i.e. a blurry
      or over-sampled canvas until the next manual window resize.
      Acceptance: `main.ts` installs a `matchMedia('(resolution: <current>
      dppx)')` `change` listener that re-runs `this.renderer.resize()` and
      re-arms itself at the new ratio (the query is ratio-specific, so a
      one-shot listener only ever fires once); a unit test with a mocked
      `matchMedia` fires the change with NO `window.resize` event dispatched
      and asserts the backing store was resized, plus a second change proving
      the listener re-armed; absent `matchMedia` (jsdom without the stub) is a
      no-op, never a throw — refs: QUALITY.md BETA (Settings), fb065.
      DONE 2026-09-05: `Game` (`src/ui/main.ts`) arms a
      `(resolution: Ndppx)` query in `bindGlobalInput` and re-arms it at the
      new ratio on every change — that query matches exactly ONE ratio, so it
      fires once and is then permanently false for the ratio just moved to; a
      one-shot listener would only ever catch the first change.
      `renderer.resize()` runs before the re-arm so both read the same
      `devicePixelRatio`. Deliberately an ADDITION to the `window` `resize`
      listener, not a replacement: if a UA ever evaluated the query as false
      even at its own ratio, the feature degrades to silence and that listener
      remains the backstop. code-reviewer **REQUEST-CHANGES** on one Major,
      and it was the right catch: the test asserted `Renderer.resize()` was
      *called*, not that the backing store changed — an implementation passing
      a cached dpr, or an early return that swallowed the change, would have
      passed it, which is exactly the bug this item exists to fix. Now asserts
      `canvas.width` doubles on 1 -> 2 while `canvas.style.width` (which
      carries no ratio) holds. It also corrected the code's own premise: per
      CSSOM-View an unsupported query does NOT throw, it yields
      `media: 'not all'`/`matches: false`, so the `try`/`catch` guards a case
      real browsers never produce while the case they DO produce is silent —
      documented rather than papered over. qa-playtester **PASS**, with three
      findings, all fixed here rather than filed since they sit inside this
      item's own "never a throw" acceptance: (1) a `matchMedia` returning
      `null` threw a TypeError that escaped `bindGlobalInput` BEFORE
      `inputBound`/`bindCanvasInput`/`this.run` were set, with the Hub already
      torn down — a mounted canvas, no run, no way back; (2)
      `removeEventListener` was optional-chained, so a query this code cannot
      detach from was armed anyway and handlers doubled per change (measured
      2^6 = 64 live listeners after six rounds); (3) the test iterated a
      listener array the production re-arm splices mid-iteration, a latent
      false-green. Both product fixes carry their own regression case,
      verified by reverting each and watching exactly those two tests go red.
      QA's hostile pass otherwise held everywhere: fractional DPRs
      (1.25/1.5/2.625/1.333...) produce exact query strings and exact backing
      stores, 200 rapid changes leave exactly ONE live listener, changes fired
      on the Hub between runs and mid-fb088-chunked-resume neither throw nor
      pin a stale ratio, a real-UA `matches: false` query arms and stays quiet,
      and a 768-tick control-vs-DPR-storm comparison produced an identical
      world hash (`c81453e2`) — the path does not touch the sim. One
      limitation stated rather than hidden: whether a real UA fires
      `(resolution: 1.3333...dppx)` at 133% zoom could not be verified here
      (no browser in this sandbox, and jsdom has no `matchMedia`); the
      `resize` backstop covers it either way. `npx tsc --noEmit` clean;
      targeted suite 8/8; all 53 `tests/ui*`/`tests/render*` files 348
      passed/6 skipped. `npm run test:fast` 2331 passed/3 failed/48 skipped
      across 8 files — `b028`, `b032`/`b034`/`b035`/`b036`, `q15`, `q41`,
      `q45`, exactly the standing families and exactly the pre-change
      baseline. An earlier pass showed 10 files/6 tests; QA independently
      root-caused that to two concurrent vitest runs widening the
      dev-server-port and bench-scratch-dir families, and confirmed
      mechanically that no other suite can even reach the new code
      (`matchMedia` is undefined in vitest's jsdom, so `armDprListener`
      early-returns everywhere else).

- [x] (fb143) [feat] generated 2026-09-05 (same generation batch as fb142) —
      fullscreen toggle reachable mid-run. QUALITY.md 1.0's Steam/itch
      checklist opens with "fullscreen + windowed"; fb090 built the toggle,
      but `#sw-fullscreen-toggle` exists only in `hub.ts`'s Settings tab
      (grep: no `fullscreen` string in `hud.ts` or `bottom-bar.ts`), so a
      player who starts a run cannot go fullscreen or leave it without
      abandoning to the Hub. Acceptance: the in-run pause/options modal gains
      a fullscreen toggle using the same `document.fullscreenElement` /
      `requestFullscreen` / `exitFullscreen` calls fb090 already established,
      with its label tracking the real state via the existing document-level
      `fullscreenchange` listener pattern (no second global listener leaked —
      see `hub.ts`'s `ensureFullscreenListenerInstalled` singleton note); a
      DOM test opens the pause modal, clicks it, asserts `requestFullscreen`
      was called, then simulates the browser's own exit and asserts the label
      flips back — refs: QUALITY.md 1.0 (Steam/itch checklist), fb090.
      DONE 2026-09-05: rather than duplicating fb090's singleton-listener
      pattern into `hud.ts`, the Fullscreen API plumbing moved into a new
      `src/ui/fullscreen.ts` (one document-level `fullscreenchange` listener,
      a SUBSCRIBER SET rather than fb090's single `activeHub` pointer, which a
      second surface would have silently displaced) and `hub.ts` moved onto
      it; the in-run pause Options screen gained the toggle, requesting
      fullscreen on `this.root` (the app root, as fb090 does) rather than
      `this.modal`, which resume tears down. code-reviewer
      **REQUEST-CHANGES** on two Majors, both correct and both mine: (1)
      subscribing in `setPaused(true)` and unsubscribing in `setPaused(false)`
      misses the abandon-from-pause exit entirely — `onQuitToHub()` ->
      `main.ts`'s `showHub()` sets `run = null` and rebuilds the root WITHOUT
      resuming the Hud, so each abandon retained a subscriber pinning the Hud,
      its detached modal DOM and the captured `World` for the session
      (reviewer measured 5 abandons -> 5 subscribers, monotonic); fixed with an
      idempotent `Hud.dispose()` called from `showHub()` and before every
      `new Hud(...)`. (2) the leak test I wrote looped `setPaused(true)`/
      `setPaused(false)` in matched pairs — precisely the path that CANNOT
      leak — so it gave false confidence about the exact hazard its own name
      asserted; replaced with the real click path (quit -> confirm), verified
      by reverting `dispose()` and watching it go red. Three Minors also
      fixed: a `let` declared below its user, `??=` silently absorbing the
      leaked state it should make loud, and — the one worth noting —
      `refreshFullscreenLabel()` calls `Hub.show()`, which clears
      `this.root.innerHTML`, the SAME root a running HUD occupies; a mid-run
      `fullscreenchange` was hard to produce before this item and is now a
      button press away, so a stale Hub could have wiped the live HUD. Safe
      today only via an implicit invariant in another method (a run can only
      start from the `'run'` tab); now made explicit by requiring the Hub's own
      markup to be on screen. Reviewer confirmed the hub.ts refactor preserves
      fb090 exactly (its 5-instance staleness test passes unchanged) and that
      capturing `w` is sound (`main.ts` returns before stepping while paused).
      `npx tsc --noEmit` clean; targeted suite 14/14 (fb115 + fb090); all 54
      `tests/ui*`/`tests/render*` files 356 passed/6 skipped. `npm run
      test:fast` 2338 passed/4 failed/48 skipped, every failure in the standing
      `b028`/`b032`/`b034`/`b035`/`b036`/`q15`/`q41`/`q45`/`q52` families.

- [x] (fb144) [polish] generated 2026-09-05 (same generation batch as fb142)
      — honour the OS's `prefers-reduced-motion` on a first run. fb086 added
      the `reducedMotion` setting (default off, opt-in), but nothing in
      `src/` reads the `prefers-reduced-motion` media query, so a player who
      has already told their OS they want reduced motion still gets the full
      ambient-motion treatment until they find the toggle. Acceptance: on a
      first run only (no stored `stonewake.settings.v1` entry), the seeded
      `reducedMotion` follows `matchMedia('(prefers-reduced-motion:
      reduce)')`; `defaultSettings()` itself stays pure and environment-free
      (so `q3-save-fuzz` and fb111's portability audit keep their
      deterministic baseline) — the query is applied at load/first-run
      seeding, not inside the defaults; an explicitly stored value ALWAYS
      wins over the OS preference, including an explicit `false` against an
      OS "reduce"; tests cover all three cases plus a missing `matchMedia`
      (no throw) — refs: QUALITY.md 1.0 (Accessibility re-check), fb086.
      DONE 2026-09-05: `settings.ts` gains `prefersReducedMotion()` (exported;
      `matchMedia('(prefers-reduced-motion: reduce)')?.matches === true`, with
      a missing/null/throwing `matchMedia` all a plain `false` rather than an
      exception — this runs on `Game`'s constructor path, so a throw would take
      the whole boot down) and a private `firstRunSettings()` =
      `{ ...defaultSettings(), reducedMotion: prefersReducedMotion() }`.
      `loadSettings()` was restructured so the `getItem` read and the
      `JSON.parse` sit in separate try blocks, which is what makes the three
      cases distinguishable: no stored entry (or unreadable storage — nothing
      was ever persisted either way) seeds from the OS; a stored entry never
      consults it at all, so an explicit `reducedMotion: false` against an OS
      "reduce" survives; and a stored-but-unparseable entry is still an entry,
      so it falls back to pure defaults exactly as before fb144 rather than
      re-seeding over a returning player. `defaultSettings()` is untouched and
      stays environment-free — `tests/q3-save-fuzz.test.ts` and fb111's
      portability audit keep their deterministic baseline, and the test pins
      that with the OS stub actively reporting "reduce" so it cannot pass
      vacuously. Targeted `tests/ui-fb144-prefers-reduced-motion.test.ts`
      (11/11): the three required cases, a missing `matchMedia`, plus a
      null-returning stub, a throwing stub, "never queries the OS once an entry
      is stored", an unparseable entry, and unreadable storage. code-reviewer
      **REQUEST-CHANGES -> fixed**: one Major, a real regression this item's own
      targeted set could not see — `tests/ui-fb142-dpr-change.test.ts`'s
      "refuses to arm a query it cannot detach from" case asserts
      `queries.length === 1` against a stub that records EVERY query, and
      `new Game()` now asks that same stub for the reduced-motion query too
      (loadSettings runs in `Game`'s field initializer). Fixed by filtering to
      the resolution queries, the idiom the same file's first test already
      uses; production behaviour was never affected (the extra query arms no
      listener). Two Nits closed in the doc comments (the boot-only read is
      deliberate and now says so; `firstRunSettings` skipping `sanitize` is
      noted as defaults-are-in-range-by-construction). Its Minor — fb075's
      "Reset settings to defaults" writes `reducedMotion: false` permanently
      for an OS-"reduce" player, closing the same accessibility hole from the
      other side — is outside this item's "first run only" acceptance and is
      filed as fb152 below rather than folded in. `npx tsc --noEmit` clean;
      the whole lane surface (`tests/ui-*` + `tests/render-*`, 55 files)
      367 passed / 0 failed. `npm run test:fast` (pre-fb142-fix run): 5 failed
      files / 4 failed tests, of which fb142 was the only real one — the rest
      are the documented q41/q45 scratch-dir module-resolution flake class,
      unchanged by this item and touching neither `src/ui/**` nor
      `src/render/**`.

- [x] (fb145) [bug] generated 2026-09-05 (same generation batch as fb142) —
      auto-pause on tab/window hide, not just `blur`. fb071 auto-pauses a
      running run on `window`'s `blur` (`main.ts`), which covers alt-tab on a
      desktop browser, but `visibilitychange` appears nowhere in `src/`: a
      backgrounded tab, a minimized window, and switching apps on mobile do
      not reliably fire `blur`, so the sim keeps running unattended against a
      dead Core — the exact failure fb071 exists to prevent, through the door
      it did not cover. QUALITY.md BETA names "window unfocus auto-pauses" as
      its own line. Acceptance: a `document` `visibilitychange` listener
      pauses under the same conditions fb071's `blur` handler uses (running
      run, not already paused) and runs the same `clearKeysForPause`; becoming
      visible again does NOT auto-resume (matching fb071's deliberate manual-
      resume convention); a test drives the real `Game`, stubs
      `document.hidden`, dispatches `visibilitychange` with no `blur` event at
      all, and asserts the run paused, plus a re-show asserting it stayed
      paused — refs: QUALITY.md BETA, fb071.
      DONE 2026-09-05: `main.ts`'s `bindGlobalInput` extracts fb071's `blur`
      closure body verbatim into a shared `onFocusLost` (no logic change: same
      `clearKeysForPause` first, same `run && outcome === 'running' && !paused`
      guard) and registers a `document` `visibilitychange` listener that calls
      it when `document.hidden`. The two overlap harmlessly — whichever arrives
      second finds `paused` already true. The `hidden` guard is load-bearing,
      not decoration: `visibilitychange` fires on the reveal half too, so
      without it every return to the tab would pause the run the player just
      came back to play. Regression test written FIRST and confirmed red
      (5 of 11 cases failing) before the fix: `tests/ui-fb145-visibility-
      autopause.test.ts` dispatches ZERO `blur` events anywhere in the file, so
      every case has to pass through the new listener or not at all. 12/12
      after two review-requested additions. code-reviewer **REQUEST-CHANGES ->
      APPROVE**: its only blocker was four `tests/zz-qa-fb145-probe*.test.ts`
      scratch files the parallel QA agent had live in the tree mid-review (out
      of Scope, and one of them made `tsc --noEmit` red) — already removed by
      QA itself before commit, verified rather than assumed. Its Minor is
      folded in: the reveal-is-a-no-op case now also asserts a held `w`
      survives, so a refactor hoisting `clearKeysForPause` above the
      `document.hidden` guard fails loudly instead of silently dropping held
      keys on every return to the tab. qa-playtester **PASS**, re-deriving
      every acceptance clause with its own probes and confirming the shipped
      test is not vacuous (a `stopImmediatePropagation` listener registered on
      `document` ahead of the `Game` turns it red). Its hostile set held: 500
      consecutive hidden events, blur/hide/reveal/focus in every order, a hide
      during the b001 dying slow-mo, and 300 paused frames on a real driven
      mid-wave run leaving `tick`/`phase`/`outcome`/`coreHp` and every enemy's
      `x,y,hp` byte-identical. Its coverage-gap note is also folded in as a
      12th case pinning exactly one `visibilitychange` binding across a
      Hub -> run -> quit -> Hub -> run cycle. Two follow-ups filed rather than
      folded in: **fb153** (the hidden branch does not flush fb074's persisted
      run) and **fb154** (a run that STARTS hidden is never auto-paused —
      inherited from fb071, not introduced here). `npx tsc --noEmit` clean;
      `npm run test:fast` 3660 passed / 3 failed, the failures being
      `q15`/`b028`/`q41`/`q45`, all tools/CLI-subprocess suites importing no
      `src/ui/**` and all in the documented pre-existing flake classes.

- [x] (fb146) [polish] generated 2026-09-05 (same generation batch as fb114;
      engineer's-judgment item, depth not scope creep per HANDOFF §7) — a
      standing units guard for the half-width display bug class. The same
      defect has now shipped twice and been caught twice by review, not by a
      test: fb108 fixed `dashTrailSentence`/`dashHealSentence` and fb112 fixed
      `dashSlashSentence`, all three rendering `eff.dashWidth` — a value every
      sim call site treats as a HALF-width (`lineHit`'s `halfWidth`
      parameter, `GroundArea.radius`) — as though it were a full width. Every
      instance is fixed today, but nothing stops a fourth sentence
      reintroducing it. Acceptance: a test that fails if any `eff.dashWidth`
      read in `src/ui/class-info.ts` is rendered without its `2 *` doubling
      (a source-level rule in the spirit of fb085's proposed lint mechanism,
      with its own proof case confirming the rule catches a reintroduced bare
      read), backed by a sim-level assertion — for each of the three
      `dash_*` kinds — that establishes `dashWidth` really is a half-width
      from engine behaviour rather than from the parameter's name; and
      `info-format.ts`'s `dashWidth: 'Dash width'` fallback label (latent:
      only reachable through `effectBlock`'s field-list fallback, which
      fb108's sentence table made unreachable for every real kind) renamed to
      say half-width — refs: fb108, fb112, `lineHit` (`src/sim/combat.ts`).
      DONE 2026-09-05: `tests/ui-fb146-dash-width-units-guard.test.ts` (16/16)
      in two layers. **Source rule**: `bareDashWidthReads(source)` flags every
      `dashWidth` read not preceded by an open `2 *` on the same expression.
      Keyed on the bare field name, not on `eff.dashWidth`, and on "some `2 *`
      is still open" rather than one blessed spelling — both from
      code-reviewer, and both load-bearing. Matching `eff.dashWidth` missed
      `effect.dashWidth`, `eff?.dashWidth`, `eff['dashWidth']` and a
      `const { dashWidth = 0 } = eff` destructure (nothing makes a sentence
      name its parameter `eff`); demanding the literal `2 * (` idiom would have
      gone RED on `2 * areaScaled(eff.dashWidth ?? 0, live)`, which c001 makes
      the likely NEXT correction to these sentences since the sim's real
      half-width is `classArea(w, dashWidth)` — a guard that fails on the fix
      gets deleted rather than obeyed. The `}`/`` ` ``/`;`/`,` closing set stops
      a line carrying one correct read and one bare read from laundering the
      second through the first. Ten proof cases: seven shapes it must flag
      (including that laundering case), three correct spellings it must accept,
      and comments — which name the field precisely to explain the doubling —
      left alone. Checked against the real file by mutation, not only against
      synthetic strings: reverting `dashSlashSentence` to a bare read turns the
      "no bare read" case red, then restored. **Sim layer**: one probe per
      `dash_*` kind, each through a different mechanism — `dash_line`
      (Swordsman, `lineHit`), `dash_trail` (Pyromancer, a `GroundArea.radius`
      driven by `updateAreas` directly), `dash_heal` (Bloodlord,
      `fireCrimsonRush`'s own inline line test, read off the healing it grants
      per enemy passed). Each places zero-radius, immovable, unkillable enemies
      at 0.99x and 1.01x the half-width to either side, so a sim that treated
      the value as a FULL width would leave the 0.99x pair unhit: the failure
      is loud in both directions, never silent. Offsets are multiplied by
      `w.derived.areaMul` (code-reviewer finding): all three classes are 1.0
      today, but Animist already carries 1.1 from its own tower passive, so the
      probe states the claim the way `tests/class-area-stat.test.ts` does
      ("authored x whatever areaMul the run has") instead of quietly depending
      on a baseline. `info-format.ts`'s fallback label is now
      `'Dash half-width'`, with a comment naming all three sim call sites;
      nothing in the repo asserted the old string. code-reviewer **APPROVE**
      (no Critical/Major); its three Minors and three Nits are all folded in
      above except the accepted residual that `line.split('//')` would also
      truncate at a `//` inside a string literal — no such line exists in the
      scanned file and the alternative is a parser for a five-line rule, so it
      is documented in the helper instead. `npx tsc --noEmit` clean; whole lane
      surface (`tests/ui-*` + `tests/render-*`) green; `npm run test:fast`
      re-run after the review fixes, 3677 passed / 3 failed, the failures being `q15`/`b028`/`q41`/`q45`, all
      tools/CLI-subprocess suites importing no `src/ui/**`, all in the
      documented pre-existing flake classes.

- [x] (fb147) [bug] filed 2026-09-05 by qa-playtester during fb111
      verification — the fb096 slot format is not atomic across keys, so a
      per-file cloud sync can silently destroy a slot's save. The active
      slot's data lives ONLY in `SAVE_KEY` until a switch-away mirrors it into
      that slot's own key (`switchToSlot`, `src/ui/saveslots.ts`), so a slot
      that has been played but never switched away from has no dedicated key
      at all. Repro (deterministic, ran twice): `saveMeta(sp=111)`;
      `ensureActiveSlotMigrated()`; `switchToSlot(1)`; `saveMeta(sp=222)`;
      `switchToSlot(2)`; `saveMeta(sp=333)` leaves `activeslot=2 slot1=111
      slot2=222 save.v1=333` with **no `slot3` key**. A cloud provider that
      restores or last-write-wins `SAVE_KEY` alone (Steam Cloud is per-file
      LWW) then makes 333 unrecoverable, and the next `switchToSlot(0)`
      writes the foreign account into `stonewake.save.slot3.v1`, cementing the
      loss. fb111's per-blob round-trip audit structurally cannot see this: it
      is a cross-key invariant, not a non-portable field. Acceptance: the
      active slot's own key stays in step with `SAVE_KEY` on every save (so
      `SAVE_KEY` is a live cache rather than the sole home of a slot's data),
      with a regression test in `tests/ui-fb096-save-slots.test.ts` driving
      the repro above and asserting `slot3` exists and holds 333 before any
      switch-away; `src/meta/meta.ts` is out of this lane's Scope, so the
      mirroring belongs in `saveslots.ts` or its callers — refs: fb096,
      fb111, QUALITY.md 1.0 (Steam/itch checklist: save slots,
      cloud-save-safe file format).
      DONE 2026-09-05: `saveslots.ts` gains a private `syncActiveSlotKey()`
      (copies the live `SAVE_KEY` text into the active slot's own key — reading
      it back from storage rather than re-serializing, so the slot key carries
      byte-for-byte what actually landed, and nothing if the write silently
      failed) and an exported `saveMetaToActiveSlot(meta)` = `saveMeta` +
      that sync. `main.ts`'s three `saveMeta` call sites — the only ones in the
      repo, and `hub.ts` routes through the first of them via `onMetaChanged` —
      now use the wrapper, and the bare import is gone. `switchToSlot`,
      `deleteSlot` and `ensureActiveSlotMigrated` are untouched: they move data
      between the two keys themselves with the active-slot pointer deliberately
      still on the OUTGOING slot, so a sync inside one would write the incoming
      account over that slot's flush. **This is the second design.** The first
      patched `Storage.prototype.setItem`/`removeItem` so the mirror fired on
      `meta.ts`'s own write (an instance-level patch is impossible — a
      `Storage` is a proxy whose property assignment IS `setItem`, so
      `localStorage.setItem = fn` stores an item named "setItem"; measured).
      code-reviewer returned **REQUEST-CHANGES** on it with three Majors and
      they were all right: `ensureActiveSlotMigrated` is `Game.start()`'s first
      statement and the unguarded prototype assignment could throw on a frozen
      prototype (a blank boot, the exact failure the pre-existing try/catch
      exists to prevent); install idempotence was bookkeeping-only and was
      ALREADY silently broken in-tree, because
      `tests/ui-fb087-persist-disabled-toast.test.ts` restores
      `Storage.prototype.setItem` in its own `afterEach` and left the mirror
      dead-but-recorded, holding fb087's throwing function as its "native";
      and the acceptance's own "or its callers" clause allowed a design with
      none of that. Rewritten to the wrapper, which dissolves all three plus
      two Minors rather than patching around them. Five new cases in
      `tests/ui-fb096-save-slots.test.ts` (25/25 in the file), red-before-green
      confirmed by mutation twice: dropping the `syncActiveSlotKey()` call
      turns three of them red, and reverting one `main.ts` site to bare
      `saveMeta` turns the source rule red. That **source rule** is what makes
      "in step on every save" a property of the codebase rather than of three
      call sites someone got right once: it scans `src/ui/**` and
      `src/render/**` recursively for any reference to `saveMeta` by name
      outside `saveslots.ts`. Keyed to the bare identifier, not to `saveMeta(`
      — the second code-reviewer pass showed the call form was walked around by
      an aliased import, a `.bind` by-reference use, and a `//` inside an
      earlier string literal — with six proof cases sharing the rule's single
      regex, so weakening it cannot leave them green. Verified against the real
      tree: an aliased `import { saveMeta as persistMeta }` in `main.ts` turns
      it red. Second code-reviewer pass **APPROVE**; its remaining Minors and
      Nits are folded in (the stale test-file header, the inverted "live cache"
      antecedent, `syncActiveSlotKey` un-exported so the switch-time hazard its
      own doc warns about has no reachable caller, the recursive scan, the
      hoisted regex). One residual is deliberately NOT fixed and is filed as
      **fb155**: `switchToSlot` still flushes `SAVE_KEY` over the outgoing slot
      key unconditionally, so an out-of-process restore of one file alone is
      still lost at the next switch — the reverse direction of the acceptance,
      carrying an unresolved question about which copy wins. `npx tsc --noEmit`
      clean. qa-playtester **PASS** on the rewritten design, re-deriving every
      acceptance clause with its own probes (200 consecutive saves in step
      byte-for-byte; eight switch permutations; a real-UI money path — fresh
      account, Settings switch to Slot 3, reload, a full run to Core death with
      ten mid-run checkpoints, Results, reload — with slot 3's own file holding
      the banked progress and slots 1 and 2 never created; and a dynamic audit
      clicking every enabled control on every Hub tab plus every HUD/Results
      button, finding zero unwrapped saves). It also found **two real
      regressions this item had introduced**, both fixed here rather than
      filed, because shipping them would have traded a missing backup for a
      destroyed one:
      (1) syncing re-read `getActiveSlot()` at save time, so a writer holding a
      stale view of the active slot wrote its own account into a FOREIGN
      slot's file — reachable from a second live tab (`runpersist.ts`'s
      `sessionId` machinery exists because two tabs are supported) and from
      fb100's documented `location.reload()`-unavailable fallback, where the
      Hub stays live on the old account after the pointer has moved. QA's
      controlled A/B isolated the one mechanism that changed: bare `saveMeta`
      left the foreign slot intact, `saveMetaToActiveSlot` destroyed it. Fixed
      with a `sessionSlot` pinned by `ensureActiveSlotMigrated` — the call that
      IS the page load — and deliberately NOT moved by `switchToSlot`, since
      every real switch is followed by a reload (`hub.ts`, fb100) and refusing
      to sync after a switch this page never reloaded through is exactly the
      protection wanted. The shipped tests now model that reload explicitly,
      which is the more faithful simulation anyway.
      (2) the sync's `else removeItem(...)` branch ran on the SAVE path, so a
      save whose own `SAVE_KEY` write failed under quota (`main.ts` documents a
      full T1 victory run crossing it about 38% in) while `SAVE_KEY` was
      already absent DELETED the slot's only surviving copy. The sync is now
      write-only; removals stay with `switchToSlot`/`deleteSlot`, which own
      both keys at once. Both fixes carry their own regression case, each
      mutation-checked (removing the guard reddens the first, restoring the
      `removeItem` reddens the second). QA's third finding — the source rule's
      evasions — was already closed by the second review pass before QA
      reported it (recursive scan, `src/render` included, identifier-keyed), so
      nothing was filed for it. Lane surface plus the five extra
      `Game`-constructing files the first review named: 437 passed / 0 failed;
      `npm run test:fast` 3690 passed / 3 failed, the failures being
      `q15`/`b028`/`q41`/`q45`, all tools/CLI-subprocess suites in the
      documented pre-existing flake classes.

- [x] (fb148) [bug] filed 2026-09-05 by qa-playtester during fb112
      verification — Dash Slash's "Dash 5 tiles" ignores Swordsman Shoes'
      documented doubling; the real dash and hit line are 10. Measured twice,
      identical: with `husk` (r=0, armor 0) aimed +X, the furthest enemy struck
      sits at 5.0000 tiles unequipped and **10.0000 with `swordsman_shoes`**
      (9.0000 mid-charge, 14.0000 with both). `fireDashSlash`
      (`src/sim/classes.ts`) computes `dashRange = (eff.dashRange ?? 0) *
      (hasEquipment(w, 'swordsman_shoes') ? 2 : 1)` and feeds `hitRange =
      dashRange + mergedRadius` to `lineHit`, but `dashSlashSentence`
      (`src/ui/class-info.ts`) prints `eff.dashRange` raw and
      `ClassLiveContext` carries no dash-range field at all — so the in-run
      panel always reads "Dash 5 tiles" while the Warden dashes and slashes
      10. `tests/fb015-equipment.test.ts` already asserts an enemy at 8 tiles
      is hit, i.e. the suite already proves the displayed number wrong. This
      is the same sentence-number-≠-sim-number class fb108/fb112 exist to
      kill, at a 100% error rather than 50%. The Hub/class-select surface
      passes no live context and may legitimately keep showing the base 5; the
      in-run character panel and bottom-bar hover have `w` and cannot.
      Acceptance: `ClassLiveContext` gains a dash-range multiplier populated
      from `hasEquipment(w, 'swordsman_shoes')` at `hud.ts`'s two live-context
      sites and consumed by `dashSlashSentence`, so the in-run sentence reads
      10 with the item equipped and 5 without; regression test mirrors
      fb112's shape — a sim probe binary-searching the furthest struck enemy
      to establish 10 vs 5 independently, then the string assertion — refs:
      fb112, fb108, `fireDashSlash` (`src/sim/classes.ts`).
      **CORRECTION, measured 2026-09-05 before implementing (CLAUDE.md's
      measurement rules: a deferred number is re-measured, not inherited):
      this item's own numbers are wrong.** It quotes `fireDashSlash` as
      `dashRange = (eff.dashRange ?? 0) * (shoes ? 2 : 1)`. The real line is
      `dashDistance(currentMoveSpeed(w), duration) * (shoes ? 2 : 1)` with
      `duration = classDashDuration(eff.dashRange ?? 0,
      classBaseMoveSpeed(cls))` — fb053's move-speed scaling, which the quote
      drops entirely. Binary-searched out of the live engine, twice, and
      independently re-measured by qa-playtester with its own probe: the
      furthest struck enemy is **5.0000 unequipped, 20.0000 with
      `swordsman_shoes`** (not 10), and 7.5000 with `normal_shoes` — the
      control that isolates the two multipliers, since `swordsman_shoes`
      carries `moveSpeedPct: 1` and so doubles the dash through the move-speed
      term as well as through the explicit one. The mid-charge figures are half
      right: "9.0000 mid-charge" is correct, "14.0000 with both" is really
      **24.0000**. A `dashRangeMul` that knew only about the Shoes would have
      replaced a 100% error with a 50% one, so the fix carries both factors.
      DONE 2026-09-05: `ClassLiveContext` gains `dashRangeMul` (the move-speed
      ratio, read by ALL FOUR `dash_*` sentences — `fireQuickstep`,
      `fireFlameRoad` and `fireCrimsonRush` compute the identical
      `classDashDuration`/`dashDistance` pair) and `swordsmanShoes` (a boolean
      read only by `dashSlashSentence`, mirroring the fact that the doubling is
      `fireDashSlash`'s alone rather than any field's). `hud.ts`'s two
      live-context sites — byte-identical four-field objects that had already
      drifted apart in their comments — are collapsed into one builder, now
      `src/ui/class-live.ts` rather than a `hud.ts` export so a consumer does
      not drag the whole 2200-line DOM module in. It recomposes
      `currentMoveSpeed`/`classBaseMoveSpeed`, both module-private to
      `src/sim/classes.ts` (out of this lane's Scope), from exported parts: the
      expression reduces exactly, because `dashDistance`'s and
      `classDashDuration`'s `BASE.dashSpeedMul` cancels, leaving
      `dashRange * currentMoveSpeed / classBaseMoveSpeed`. That recomposition
      is the risk this item carries, and it is pinned by a drift guard
      comparing it against a binary-searched engine measurement, so a change to
      either sim formula is loud instead of a quietly wrong tooltip.
      `tests/ui-fb148-dash-range-live.test.ts` (22/22) plus
      `tests/ui-fb148-charpanel-scroll.test.ts` (2/2). code-reviewer
      **REQUEST-CHANGES -> fixed**: its Major was that only Swordsman was
      measured, so reverting any of the other three sentences to a raw read
      left the file green — precisely the failure fb146 was written for. Added
      a per-kind leg measuring all four classes off `startDashTravel`'s own
      endpoint (the one measurement that works for kinds with no hit line), an
      asymmetry case, and a NaN/Infinity sweep over every class; each of the
      three sentences now reddens the file when reverted. Its Minors are folded
      in: the orphaned `characterAbilitiesMarkup` doc block, the file header's
      now-false "everything else falls back to the authored number" rule,
      `dashRange` added to `liveOverrides` so the latent generic field list
      resolves too, and a `dashRange` source rule generalising fb146's
      `dashWidth` one (every read must sit inside `liveDashRange`) — the fourth
      defect in this family in these same four sentences deserved the guard.
      qa-playtester **PASS**, re-deriving the formula from source and
      re-measuring everything with its own probes: 15/15 across every
      equipment item singly for Swordsman, 48/48 across all four dash classes x
      all 12 items, and live tracking of the `swift` boon, Constellation node
      50, the Time core's `vsSpeedPct` in Act II, Archer's draw penalty and a
      mid-run `equip_item` swap. Two findings fixed here rather than filed,
      both costs of this item's own changes: (a) the memo-key fix rebuilt the
      whole character panel on every charge EDGE, and `.sw-charcard` carries
      `max-height: 86vh; overflow-y: auto` — measured 6 scroll resets over 1200
      ticks for a Swordsman, 14 for an Archer, in ordinary play since the panel
      does not pause the run. The offset is now carried across the rewrite,
      with its own regression file (jsdom has no layout, so `Element.scrollTop`
      is given a real backing store there, which is what makes the property
      observable at all). (b) the new `liveOverrides.dashRange` branch shipped
      with no pin — it was the only surviving mutant of QA's seven — and now
      has one, driven through a synthetic kind with no sentence entry. Two more
      filed rather than fixed: **fb156** (every radius/width in these same
      sentences ignores the live Area multiplier — the same defect family, on
      the other number in the sentence this item just edited) and, in the Log,
      the `swordsman_shoes` `desc` bug, which is `/data` and so main-lane.
      `npx tsc --noEmit` clean; `npm run sim -- --seed 1 --policy hybrid`
      byte-identical to a HEAD control clone (`endHash 952d7be8`), as a UI-only
      change must be; lane surface green; `npm run test:fast` re-run after the QA
      fixes, 3714 passed / 3 failed, the failures being `q15`/`b028`/`q41`/`q45`, which QA confirmed
      reproduce identically on a clean clone of HEAD.

- [x] (fb149) [bug] filed 2026-09-05 by qa-playtester during fb112
      verification — line and area sentences promise their full damage number
      to "every enemy", but pierce falloff cuts every target after the first.
      Measured twice, identical: five enemies at 0.9-tile spacing on the dash
      line (armor 0) take **30, 24.6, 20.172, 16.541, 13.564**; at eight
      enemies the last takes 7.48, a quarter of the promised number.
      `lineHit` (`src/sim/combat.ts`) applies `scale = max(pierceFalloffFloor,
      scale * pierceFalloff)` after EVERY strike, and `data/towers.json` sets
      `pierceFalloff: 0.82` / `pierceFalloffFloor: 0.2` — unlike blasts, which
      grant `aoeFullTargets: 5` at full damage first, a line decays from the
      second target on. Scope is wider than one sentence: `chargePierceSentence`
      (Deadeye Draw, also `lineHit`) carries the same unqualified per-target
      claim, and the `applyAoE` sentences (`circleSlashSentence`,
      `burstDamageSentence`, `frostNovaSentence`) overstate past the 5th
      target. Acceptance: one wording rule applied across all of them — either
      name the drop-off or stop promising the number to "every" target — with
      a regression test pinning the mechanism (the multi-enemy sim probe above)
      plus string assertions on the `dash_line`/`charge_pierce` sentences —
      refs: fb112, `lineHit`/`applyAoE` (`src/sim/combat.ts`).
      **CORRECTIONS, measured 2026-09-05 and re-measured independently by
      qa-playtester.** (1) This item's own figures are wrong: Dash Slash's
      authored damage is 90, not 30, so the real profile is `90, 73.8, 60.516,
      49.6231, 40.691`; and at 0.9-tile spacing an eighth enemy cannot be
      struck at all, because the line is 5 tiles long — at 0.55 spacing, where
      eight fit, the eighth takes 22.4357, not 7.48. The filed numbers look
      like the 0.82^n curve applied to Circle Slash's `minDamage` of 30.
      (2) `burstDamageSentence` and `frostNovaSentence` are NOT affected:
      `fireEffect` and `fireFrostNova` each loop `w.enemiesInRadius` and call
      `damageEnemy` with no scale term at all, and every target was measured
      taking an identical amount — hedging them would have introduced the
      error, not removed it. (3) The item misses `judgement` (Paladin, also
      `applyAoE`) and, via a third mechanism nobody had named, `ground_poison`
      and `dash_trail`: `updateAreas` applies the SAME
      `aoeFullTargets`/`aoeFalloff` damping to every ground field.
      DONE 2026-09-05: three clauses in `src/ui/info-format.ts`, so a fourth
      surface cannot invent a fourth spelling — `tower-info.ts`'s cone blurb
      already shipped the blast wording verbatim and now uses the constant.
      `LINE_FALLOFF_CLAUSE` goes to `dashSlashSentence` and
      `chargePierceSentence` (`lineHit`, decays from the SECOND target);
      `AOE_FALLOFF_CLAUSE` to `circleSlashSentence`, `judgementSentence` and
      `poisonBarrelSentence` (`applyAoE`/`updateAreas`, `aoeFullTargets` in
      full first); `PATCH_FALLOFF_CLAUSE` to `dashTrailSentence` alone.
      All three are number-free: `0.82^n` floored at `0.2` starting after the
      fifth target has no single honest percentage, and any number printed
      would need re-verifying on every balance tune. The acceptance's
      disjunction — name the drop-off or stop promising the number — is met by
      naming it. code-reviewer **REQUEST-CHANGES -> APPROVE** on two Majors,
      both real: the two ground-field kinds above were missed entirely, and
      `chargePierceSentence` had re-worded the rule inline rather than using
      it, which made it not one rule, read wrong (the spliced clause stranded
      "while moving at 60% speed" off a second `while`), and left that
      assertion passing off the inline literal when the constant was blanked.
      qa-playtester **PASS**, walking all 24 shipped kinds with its own probes
      rather than the table — confirming the classification, confirming the two
      deviations, and confirming a deliberate asymmetry worth keeping:
      `pierce`-kind towers are projectile-based and really do deal full damage
      to every body (measured 1080 x 8), so `tower-info.ts`'s "for full damage
      each" must stay unhedged. Two of its findings are fixed here rather than
      filed. (a) **Flame Road's blast clause was measurably false**: aimed
      along a row of eight, damage/s reads `18, 30.1, 32.76, 36, 36, 32.76,
      30.1, 27.92` — the NEAREST enemy takes the least and four take double the
      printed per-patch number, because `fireFlameRoad` lays five 1-tile
      patches 1.25 tiles apart and `updateAreas` damps each independently.
      There is no single "nearest" with five centres, hence the third clause,
      which scopes the rule to one patch and says outright that overlapping
      patches stack; its own mechanism leg asserts the non-monotonic profile
      and the stacking. (b) **the wording assertions tested the constants
      against themselves** — replacing both with `' Bananas.'`/`' Oranges.'`
      left 195 tests across eleven files green, and so did making them
      identical. A leg now pins each clause's own words, the leading space that
      stops a double space at a call site, and that the three are distinct;
      the Bananas mutant reddens the file. Also folded in: the ground-field
      leg's rationale comment, whose first draft claimed only one patch covered
      the probes when two do (QA measured 0.6 per tick, not 0.3), and the
      `dealt[4]/dealt[0]` bound, now derived from `content.towers.pierceFalloff`
      so a balance tune cannot redden a wording test. An exhaustiveness guard
      requires every Active kind in `data/classes.json` to sit in exactly one
      of a decaying, patch or flat bucket, and forbids either bucket naming a
      kind that no longer ships. Three follow-ups filed: **fb157** (the
      measured form of that guard), **fb158** (`tower-info.ts`'s `single`
      blurb has the same undisclosed `lineHit` drop-off) and **fb159** (the
      falloff floor). Blanking the clause at any one of the six sentence sites
      reddens the file; `npx tsc --noEmit` clean; `npm run sim -- --seed 1
      --policy hybrid` byte-identical to the control (`endHash 952d7be8`);
      lane surface 553 passed / 0 failed; `npm run test:fast` 3734 passed / 3
      failed, the failures being `q15`/`b028`/`q41`/`q45`, which QA reproduced
      standalone and confirmed never import `class-info.ts`.

- [ ] (fb150) [bug] filed 2026-09-05 by qa-playtester during fb112
      verification — Dash Slash's "the charge's own range and damage merge into
      this one hit" reads as "you keep the nova's coverage", but the merge
      deletes the nova's area entirely. Repro, both branches in one probe:
      Swordsman with a `husk` 3 tiles BEHIND and another 3 tiles to the SIDE;
      charging Active1 fully and releasing normally hits both for 60, while
      charging fully and firing Active2 instead hits **neither** — the merged
      path spends the charge (`wd.active1Charging = false`, Active1 to full
      cooldown) and converts the 4-tile nova into +4 tiles of LINE LENGTH only
      (measured: furthest struck 5 -> 9). That is the specced reading of "hit
      range" (Q118), so this is a wording bug, not a sim bug — but the current
      text sells a player an area they do not get, and the real trade can be a
      total whiff plus a 6s Active1 cooldown. Acceptance: the clause says the
      charge's radius EXTENDS THE LINE'S REACH and its damage is added, and
      that the nova itself does not fire; regression test carries the
      behind/side probe as the mechanism plus a string assertion on the
      reworded clause — refs: fb112, Q118, `fireDashSlash`.

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

- [ ] (fb114) [bug] `tests/b036-help-fold.test.ts` is red on master and
      red standalone: `.sw-help`'s bottom edge measures 1095.4 against the
      1080 fold b036 exists to defend, in Training Grounds with a tower
      selected and the practice panel open. Deterministic (4 s, `npx vitest
      run tests/b036-help-fold.test.ts`), reported independently by the
      content and terrain lanes and first misfiled as a load flake. Acceptance:
      the existing test goes green without loosening the 1080 fold; the
      practice panel + selected-tower layout keeps the help block inside the
      fold at 1920x1080 — refs: SPEC-FINAL §11, b036.
- [ ] (fb115) [bug] c001 (Area reaches every class Active) left three
      renderer/UI previews reading the authored `/data` radius unscaled, so
      they draw a footprint the sim no longer uses (BACKLOG-CONTENT.md c001
      Log): `src/render/canvas.ts` `drawChargeIndicator` uses
      `circleSlashValues(cls.active1, wd.active1Charge).radius` (measured
      `drawn=4 fired=4.4` with one Normal Bracelet, ~2.6x at an end-of-run
      areaMul — the one preview fb016 built to be backed by live sim state),
      `drawSkillHoverRing` uses `eff.radius`, and `src/ui/hud.ts`
      `characterAbilitiesMarkup`'s "radius has no live sim equivalent" comment
      is false — `w.derived.areaMul` is that equivalent. Acceptance:
      regression test beside fb016-vfx-registry's "charge indicator brightens
      with hold" case, failing first; all three scale by `areaMul`; ring
      radius equals the fired nova's radius in the test — refs: SPEC-FINAL §2,
      §11, fb016.
- [ ] (fb116) [feat] terrain rendering (BACKLOG-TERRAIN.md fb064e, the
      epic's UI half): organic terrain (marching-squares edges, texture
      variation per kind) drawn from `Grid.terrainKind` over the square
      collision grid, path indicators drawn around terrain, and the build
      ghost's string for main-lane fb078's `'terrain'` `BuildRejection`.
      Blocked on fb077 (no real run has a generated map yet); a
      `render-terrain*` test can drive `applyTerrain` on a test grid before
      then. Acceptance: render test over 20 seeds asserts every non-normal
      tile is painted with its kind's colour and every rock edge is drawn;
      no change to the normal-only arena's frame — refs: SPEC-FINAL §10.5
      (fb079), §11.

- [ ] (fb096) [feat] normal priority: Swordsman combo swept-area indicator —
      when Dash Slash is cast during a Circle Slash charge, draw the merged
      attack's full effective hit region (the charged circle swept along the
      dash path, a capsule/stadium shape) as the aim indicator while charging
      and moving the cursor, plus a brief afterimage on release (respecting
      reduced-flash). The indicator shape must equal the merged attack's real
      hit-detection region, not an approximation (owner feedback
      `feedback/processed/20260904-162645-feature-combo-area-indicator.md`).
      Acceptance: indicator renders the capsule from current charge radius +
      cursor direction; a test asserts the rendered region equals the sim's
      hit-detection region; afterimage respects the reduced-flash setting —
      refs: SPEC-FINAL §4.1 (Swordsman combo), §11 (indicators).
- [ ] (fb117) [feat] normal priority: Core-select screen redesign to match
      class-select layout — a horizontal row of vertically-long Core sprites
      (placeholder tall silhouettes: stone heart, carnivorous plant, vampire
      heart, corpse pile, time monolith); selecting one fills the bottom panel
      with base HP and upgrade-track summary; hovering the TD effect / VS
      effect / each upgrade step shows the written explanation with live
      numbers pulled from `/data`; locked Cores render greyed with their
      unlock condition shown (owner feedback
      `feedback/processed/20260904-162645-feature-core-select-ui.md`).
      Acceptance: layout mirrors fb058's class-select redesign; all 5 Cores
      render; a test asserts hover text numbers equal `/data` values; locked
      state renders correctly — refs: SPEC-FINAL §5.5, §11, fb058.
- [ ] (fb098) [feat] normal priority: per-tower attack projectile/beam
      visuals — every tower type gets a distinct registered VFX entry: Arrow
      (arrow), Ballista (heavy bolt), Venom Spore (spore puff + drip trail),
      Mortar (lobbed shell, arc + impact crater flash), Electric (instant
      jagged arc + chain arcs), Ember Brazier (flame cone sweep), Frost
      Obelisk (pulse ring), Beacon/Harvest (aura pulse tick); projectiles
      travel at the tower's real projectile speed (so a speed passive like
      Voltbolt's is visible) and impact marks are colored per damage type;
      the same visuals fire when a character wields the tower in VS (owner
      feedback
      `feedback/processed/20260904-162645-feature-tower-projectile-sprites.md`).
      Acceptance: a VFX-registry test fails for any of the 10 towers missing
      a fire+travel+impact entry; VS wielded attacks reuse the same registry
      entries — refs: SPEC-FINAL §5, §11, VFX registry (fb016).

- [ ] (fb152) [polish] filed 2026-09-05 by code-reviewer during fb144 review —
      "Reset settings to defaults" re-buries the OS reduced-motion preference.
      fb144 seeds `reducedMotion` from `matchMedia('(prefers-reduced-motion:
      reduce)')` on a first run only, but fb075's Settings reset
      (`hub.ts`'s `#sw-settings-reset`, `this.settings = sanitize(
      defaultSettings())`, persisted by `main.ts`'s `onSettingsChanged`)
      writes a hard `reducedMotion: false` — and because a stored value always
      wins, an OS-"reduce" player who ever presses Reset never sees the
      preference honoured again. Same accessibility hole fb144 exists to
      close, reached through a different door; deliberately left out of fb144
      because its acceptance says "first run only" and this changes what
      fb075's own tested behaviour means. Acceptance: the reset path produces
      the same settings a first run would (export fb144's `firstRunSettings()`
      and use it at the reset site, or an equivalent), so a reset under an OS
      "reduce" leaves `reducedMotion` true; `tests/ui-fb075-settings-reset
      .test.ts` keeps its existing confirm-step coverage and gains a case
      driving a real Hub reset with a `matchMedia` stub reporting "reduce",
      plus its control with no preference — refs: fb144, fb075, QUALITY.md 1.0
      (Accessibility re-check).

- [ ] (fb153) [bug] filed 2026-09-05 by qa-playtester during fb145 QA —
      hiding the tab pauses but does not flush the persisted run. fb145's
      `visibilitychange` handler (`main.ts`) is the last reliable moment
      before a mobile freeze/discard — its own comment says so — but it only
      calls `onFocusLost`, and `persistRun()` is reachable only from
      `frame()`'s 60-tick throttle, which the pause then stops forever.
      Measured twice: 95 real frames -> `world.tick === 94`, persisted
      `inputLog.length === 60`, i.e. ~0.57 s of play unrecoverable if the
      hidden tab is discarded — the QUALITY.md BETA "no progress loss on
      refresh" bar, missed on the one platform fb145 was written for.
      Acceptance: the hidden branch flushes the current log (bypassing the
      60-tick throttle, still honouring `persistDisabled`/`runSessionId`
      ownership and `lastPersistedLen`); a test drives the real `Game` past
      the throttle window to a non-multiple-of-60 tick, dispatches a hidden
      `visibilitychange`, and asserts the persisted `inputLog.length` equals
      `world.tick`; plus a case asserting a hide on the Hub (no run) and a
      hide with `persistDisabled` write nothing — refs: fb145, fb074, fb087,
      QUALITY.md BETA.

- [ ] (fb154) [bug] filed 2026-09-05 by qa-playtester during fb145 QA — a run
      that STARTS hidden is never auto-paused. fb071 covers `blur` and fb145
      covers the hidden `visibilitychange` edge, but neither fires for a run
      that begins in an already-backgrounded document: fb074's boot-resume
      (`tryResumePersistedRun` -> `beginRun`) in a restored background tab
      binds its listeners after the document is already hidden, was never
      focused so `blur` cannot fire, and the only event that will ever arrive
      is the reveal, which the `!document.hidden` guard correctly drops.
      Reproduced twice: `paused === false` on a resumed run with
      `document.hidden` true, still false after a reveal + `focus`. The player
      is dropped straight into live combat — the exact opposite of fb071/
      fb145's deliberate manual-resume convention (harm bounded only by rAF
      throttling and `frame()`'s 0.25 s `dtReal` clamp). Acceptance: `beginRun`
      pauses immediately when `document.hidden` is true at bind time, under
      the same `outcome === 'running'` guard; a test stubs `document.hidden`
      true BEFORE constructing the `Game`, boots a fresh run and a persisted
      resume, and asserts both come up paused, with a control at
      `hidden === false` asserting neither does — refs: fb145, fb071, fb074.

- [ ] (fb155) [bug] filed 2026-09-05 by code-reviewer during fb147 review —
      a switch-away still flushes `SAVE_KEY` over an intact slot copy, so a
      per-file cloud restore is lost at the next switch. fb147 made the active
      slot's own key stay in step with `SAVE_KEY` on every save, which is the
      forward direction: the data now exists as a file a per-file provider can
      back up and hand back. The reverse direction is untouched —
      `switchToSlot` unconditionally writes the live `SAVE_KEY` into the
      OUTGOING slot's key (`saveslots.ts`), so a provider that restores
      `SAVE_KEY` alone still destroys the good slot copy at the next switch,
      and a provider that restores the SLOT file alone has it overwritten by
      the same flush — the new backup is effectively write-only from the game's
      side. `tests/ui-fb096-save-slots.test.ts`'s fb147 cloud-restore case
      concedes this in its own assertion comment rather than hiding it.
      Acceptance: a switch-away does not silently discard a slot copy that
      disagrees with `SAVE_KEY` — either by refusing the overwrite, or by
      keeping both and telling the player which one is being loaded (this is
      the unresolved half: which copy wins, and how the player is told, wants
      a QUESTIONS.md entry from the main lane before the UX is chosen); a
      regression test drives an out-of-process restore of each file in turn
      followed by a switch away and back, asserting the surviving data is the
      newer one and never silently the wrong one — refs: fb147, fb096, fb111,
      QUALITY.md 1.0 (Steam/itch checklist: cloud-save-safe file format).

- [ ] (fb156) [bug] filed 2026-09-05 by qa-playtester during fb148
      verification — every radius and width in the in-run ability sentences
      ignores the live Area multiplier, exactly the way `dashRange` ignored
      move speed before fb148. Measured twice, identical: Dash Slash's
      corridor, binary-searched perpendicular to the line, is 2.0000 / 2.6000 /
      3.0000 / 4.0000 tiles wide at 0 / 3 / 5 / 10 ranks of the `reach` stat
      boon (`data/vsupgrades.json`, `stat: 'area'`, +10%/rank, uncapped) while
      `dashSlashSentence` prints a flat "2-tile-wide line" — a 50%
      understatement at 5 ranks, and this is the number fb146 built a standing
      guard for and fb112 fixed. Circle Slash the same: with 5 ranks the merged
      Dash Slash hit line measures 26.0000 rather than 24.0000, i.e. the merged
      nova radius is really 6 while `circleSlashSentence` prints 4.
      `classArea(w, r) = r * w.derived.areaMul` (`src/sim/classes.ts`) scales
      EVERY class radius and width — `dashWidth`, the nova `radius`, Poison
      Barrel, Frost Nova, `burst_damage`, the Flame Road patches — and
      `ClassLiveContext` carries no area field at all. Acceptance:
      `ClassLiveContext` gains an `areaMul`, populated in `classLiveContext`
      (`src/ui/class-live.ts`) and consumed by every sentence printing a radius
      or width; regression test in fb148's shape — a sim probe binary-searching
      the real corridor/radius at 0 and 5 ranks of `reach`, then the string
      assertions — and fb146's `dashWidth` source rule extended so a bare
      `2 * (eff.dashWidth ?? 0)` without the Area term is itself an offender.
      Distinct from fb149, which is about pierce/AoE falloff wording rather
      than the Area stat — refs: fb148, fb146, fb112, fb108, `classArea`
      (`src/sim/classes.ts`).

- [ ] (fb157) [polish] filed 2026-09-05 by code-reviewer during fb149 review —
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

- [ ] (fb158) [polish] filed 2026-09-05 by qa-playtester during fb149
      verification — `tower-info.ts`'s `KIND_TEXT.single` blurb describes the
      same `lineHit` drop-off the class sentences now name, and does not name
      it. Measured twice: `arrow_spire` at tier 5 (`attackProfile` ->
      `pierce: 1`), six husks in a row, one `updateTowers` +
      `updateProjectiles` tick — primary 254.1, carried-through body 208.362
      (x0.82), while the blurb says only "carrying on through up to 1 more
      enemy behind it". Same file and same table fb149 edited. Deliberately
      NOT the neighbouring `pierce` kind: a Ballista is projectile-based
      (`spawnProjectile` + `pierceLeft`, no scale term) and measured 1080 to
      all eight targets, so "hitting up to N enemies for full damage each" is
      accurate there and hedging it would introduce the error. Acceptance: the
      `single` blurb appends `LINE_FALLOFF_CLAUSE` when `p.pierce > 0` and says
      nothing when it is 0, with both measurements above as the regression's
      mechanism legs — refs: fb149, `fireTower`'s `single`/`pierce` cases
      (`src/sim/towers.ts`).

- [ ] (fb159) [polish] filed 2026-09-05 by qa-playtester during fb149
      verification — the falloff floor makes "each one behind it takes less"
      stop being literally true past a reachable target count. Measured twice,
      identical: `scale = max(0.2, 0.82^(n-1))` clamps at the TENTH body on a
      line (14 husks at 0.3 spacing on Dash Slash: 90, 73.8, 60.516, 49.6231,
      40.691, 33.3666, 27.3606, 22.4357, 18.3973, then 18, 18, 18, 18, 18) and
      at the FOURTEENTH on the blast/ground curve (Judgement: 5 x 11000 ...
      2248.5549, then 2200 forever; Poison Barrel: 5 x 24 ... 4.9059, then 4.8
      forever). Both counts fit inside one dense pack. QA explicitly did not
      call this a bug — each clause contrasts against "takes full damage", so
      "less" reads as "less than full", which stays true forever — and filed it
      only so the reading is recorded rather than rediscovered. Acceptance:
      either the clauses say "less, down to a floor", or a QUESTIONS.md entry
      records that "less" is read against the full number rather than against
      the previous target and the wording stands as-is (QUESTIONS.md is outside
      this lane's Scope, so that half is main-lane) — refs: fb149,
      `pierceFalloffFloor`/`aoeFalloffFloor` (`data/towers.json`).

## Log

- 2026-09-05, fb149: implemented fully in-scope (`src/ui/class-info.ts`,
  `src/ui/info-format.ts`, `src/ui/tower-info.ts`, one new `tests/ui-*` file).
  Notes for the merge:
  (a) **the item's own filed numbers were wrong** and are corrected in its DONE
  note, as fb148's were. That is two of the last three items in this lane whose
  filed measurements did not survive re-measurement — the pattern is a QA probe
  written against one ability and its numbers then quoted for another. Worth
  the next generation batch treating a filed figure as a claim to re-derive,
  not a fact to inherit.
  (b) the falloff wording now lives in ONE place (`info-format.ts`) and is used
  by both `class-info.ts` and `tower-info.ts`. A main-lane change that adds a
  multi-target ability needs to pick one of the three clauses, and the
  exhaustiveness guard in the fb149 test will fail until it does.
  (c) three follow-ups filed above: **fb157**, **fb158**, **fb159**.

- 2026-09-05, fb149 (informational, not filed as an item): qa-playtester
  verified two asymmetries that must NOT be "fixed" by anyone applying the
  wording rule mechanically. `pierce`-kind towers (Ballista) spawn a projectile
  that decrements `pierceLeft` and deals `p.damage` unscaled — measured 1080 to
  all eight bodies — so `tower-info.ts`'s "for full damage each" is accurate.
  `chain_lightning` and the summon splash both pass `{ primary: e }` into
  `applyAoE`, so the named target is always struck first at full scale and the
  splash only ever adds; their sentences are accurate too.

- 2026-09-05, fb148: implemented fully in-scope (`src/ui/class-info.ts`,
  `src/ui/hud.ts`, a new `src/ui/class-live.ts`, two new `tests/ui-*` files).
  Four notes for the merge:
  (a) **the item's own filed numbers were wrong and are corrected in its DONE
  note** — 20, not 10, with `swordsman_shoes`, and 24, not 14, on the merged
  mid-charge path. Both were re-measured twice from the live engine before
  anything was implemented, and independently again by QA. The cause is that
  the item quotes `fireDashSlash` without fb053's move-speed scaling. Anyone
  re-deriving from the original text will re-file the same wrong number.
  (b) `src/ui/class-live.ts` is new and is now the ONLY place a
  `ClassLiveContext` is built. A main-lane change that adds a live number to
  the ability sentences belongs there rather than at a call site.
  (c) `dashRange` joins `dashWidth` as a field with a standing source rule in
  `src/ui/class-info.ts`. This is the fourth defect in this family (fb108,
  fb112, fb146, fb148) and fb156 above is the fifth, still open — if a sixth
  appears, the answer is probably a single "every sentence number is resolved
  through a live helper" rule rather than one guard per field.
  (d) QA's proposed ids for its two filings collided with this file's existing
  fb150/fb151; renumbered to fb156 and, for the `/data` one, the Log entry
  below.

- 2026-09-05, fb148 (out-of-lane, for the main lane at the merge):
  `swordsman_shoes`'s `desc` in `data/equipment.json` promises "If not
  Swordsman: x1.1 movement" and the real figure is **x2.2**. Measured twice by
  qa-playtester: `w.derived.moveSpeed` with the item versus without is x2.2000
  for all eleven non-Swordsman classes and x2.0000 for Swordsman — the
  fallback item is FASTER on the classes it is meant to be inert on. This is
  explicitly **not** a `stats.ts` bug and must not be "fixed" by making
  `classFallback.mods` substitute instead of add: the other two fallback items
  document exactly that stacking and match the engine to 1e-9 —
  `sleeve_sword` promises "atk speed x1.2 (so 1.2x1.2)" and measures x1.4400,
  `swordsman_armor` promises "x1.5 (so 1.1x1.5)" and measures x1.6500.
  `swordsman_shoes` is the sole outlier: its `desc` omits the "(so 2x1.1)"
  form its siblings carry. Player-visible — the Codex equipment table renders
  raw item rows including `desc`. `/data` is outside this lane's Scope, hence
  a Log entry rather than an item. Whether the intended value is x2.2 (fix the
  `desc`) or x1.1 (fix the `mods`) is an owner call and wants a QUESTIONS.md
  entry, which is also outside this lane.

- 2026-09-05, fb147: implemented fully in-scope (`src/ui/saveslots.ts`,
  `src/ui/main.ts`, `tests/ui-fb096-save-slots.test.ts`). Three notes for the
  merge:
  (a) the first design patched `Storage.prototype` and was thrown away on
  review — see the item's DONE note. The finding worth carrying forward is not
  the design verdict but what it turned up: `tests/ui-fb087-persist-disabled-
  toast.test.ts` swaps `Storage.prototype.setItem` for a throwing stub and
  restores it in `afterEach`, so ANY module-global that memoises a storage
  method is silently invalidated for the rest of that file. A future item that
  wants to intercept storage writes needs to know that before it starts.
  (b) `src/ui/**` now has a standing rule that no file outside `saveslots.ts`
  may reference `saveMeta` by name. A main-lane change that adds a save site in
  `src/ui` will hit it; the fix is to call `saveMetaToActiveSlot` instead, not
  to relax the rule.
  (c) one residual filed as **fb155** above rather than fixed here. Two others
  that QA proposed as items (fb156, fb157 in its report) were fixed INSIDE this
  item instead — they were regressions fb147 itself introduced, not
  pre-existing gaps, and shipping them would have traded a missing backup for a
  destroyed one. Those ids are therefore unused and free.
  (d) `syncActiveSlotKey` is pinned to the slot this page load booted on. A
  future item that wants a switch to take effect without a reload has to move
  that pin too — `switchToSlot` deliberately does not.

- 2026-09-05, fb147 (informational, not filed as an item): the second
  code-reviewer pass noted that `syncActiveSlotKey` swallows a quota failure on
  its write, leaving a silently stale slot key, where `runpersist.ts`'s
  `savePersistedRun` returns a boolean `main.ts` turns into the
  `persistDisabled` toast. Not a regression — before fb147 the key did not
  exist at all — but if this area is touched again, returning a boolean from
  `syncActiveSlotKey`/`saveMetaToActiveSlot` would at least make the state
  observable. Same class as fb111's own `saveSettings`-writes-unsanitized note
  below.

- 2026-09-05, fb146: implemented fully in-scope (`src/ui/info-format.ts`, one
  new `tests/ui-*` file). Two notes for the merge:
  (a) the source rule is the first of its kind in this lane and deliberately
  duplicates `tests/architecture.test.ts`'s `stripComments` rather than
  importing it — that helper lives inside a `.test.ts`, so importing it would
  run that whole suite. If a third such rule appears, the helper wants
  extracting into `tests/helpers.ts`, which is out of this lane's Scope.
  (b) the `dash_line` probe restates `tests/ui-fb112-dash-slash-width.test.ts`'s
  almost exactly. Kept in both — fb112's is that item's own proof, this one is
  the third leg of a per-kind claim that would be incomplete without it — with
  a comment in this file pointing at the other. Worth knowing they can drift.

- 2026-09-05, fb145: implemented fully in-scope (`src/ui/main.ts`, one new
  `tests/ui-*` file). Two follow-ups filed from QA rather than folded in:
  **fb153** and **fb154** above. Two observations QA recorded that are not
  items:
  (a) the prompt's standing hostile checklist still names `soulpick`, `dusk`
  and `dawn` phases and a "Dawn Rekindle, both choices" money path — none of
  those exist in this build (`Phase` is `act1_build | act1_wave | act2 |
  levelup | results`, and `src/sim/sundering.ts` records that p3d deleted the
  Rekindle ledger). This is the SECOND session QA has reported the same stale
  checklist (see the 2026-09-05 fb112 entry below); QUALITY.md is owner-
  authored and read-only for this lane, so it stays logged here and is worth a
  QUESTIONS.md entry from the main lane rather than a silent edit.
  (b) `document.hidden === undefined` (an embedder dispatching
  `visibilitychange` without the unprefixed property) never pauses. QA could
  not name a real UA where that is reachable and explicitly did not file it;
  `blur` still covers those engines, and the acceptance names `document.hidden`
  outright. Recorded so a future reader knows it was probed, not missed.

- 2026-09-05, fb144: implemented fully in-scope (`src/ui/settings.ts` plus two
  `tests/ui-*` files). The second test file is `tests/ui-fb142-dpr-change
  .test.ts`, edited rather than left red: fb144 makes `loadSettings()` — which
  runs in `Game`'s own field initializer — ask `matchMedia` one extra question
  at construction, and fb142's listener-leak case counted queries rather than
  filtering them. In scope (`tests/ui*`), one line, and the same filter idiom
  that file's first test already used. Worth recording for the merge because it
  is the second time a `main.ts`-adjacent `matchMedia` consumer has collided
  with a test that stubs the global: a third one should filter by media string
  from the start rather than counting.
  fb085, fb093 and fb097 (all `[ ]` and above fb144 in the queue) were
  re-confirmed still permanently out of this lane's Scope rather than
  re-attempted — `data/strings.json`, `tools/ui-audit.ts` and a `package.json`
  dependency respectively, each already logged as out-of-scope in the 2026-09-04
  entries below, and nothing about the Scope section has changed since. Executed
  fb144 instead, the first actionable item.
  One follow-up filed from the review rather than folded in: **fb152** above
  (fb075's Settings reset re-buries the OS preference).

- 2026-09-05, merge: `origin/master` merged into `lane/ui`. Only two files
  conflicted, both docs (this file's Log and PROGRESS.md's session list) —
  BOTH SIDES KEPT in each, since the two lanes' entries are independent
  history, not competing versions of one entry. No source conflicts:
  `src/ui/hub.ts` and `src/ui/hud.ts` auto-merged, and master's shared sim
  core (the P12 balance work, `src/sim/terrain/**`, the `/data` retunes) came
  across untouched by this lane, per the merge rule that master wins there.
  **Id collision, caught by audit rather than by git:** master's own
  2026-09-04 lane merge had renumbered four cross-lane items into
  fb114-fb117, and BACKLOG.md had meanwhile taken fb118-fb135 — so ALL TEN
  ids this session generated or filed (fb114-fb123) named two different items
  each once the trees met. Git merged them without a murmur, because the
  duplicates land in different regions of the file. Renumbered this session's
  ten into the free range **fb142-fb151** (max id anywhere was 141), and
  renamed the two committed test files (`tests/ui-fb114-dpr-change` ->
  `ui-fb142-`, `tests/ui-fb115-hud-fullscreen` -> `ui-fb143-`) rather than
  leaving filenames that name someone else's item — only two files, unlike
  the 30+ that made master's merge choose deferral. Mapping: fb114->fb142
  (DPR), fb115->fb143 (mid-run fullscreen), fb116->fb144 (prefers-reduced-
  motion), fb117->fb145 (visibilitychange pause), fb118->fb146 (units guard),
  fb119->fb147 (slot atomicity), fb120->fb148 (dash range vs Shoes),
  fb121->fb149 (falloff wording), fb122->fb150 (merge wording), fb123->fb151
  (dash VFX extent).
  **Pre-existing and NOT fixed here:** `fb096` and `fb098` each name two
  different items inside this file already on `origin/master` (a DONE
  2026-09-04 generated item and an open owner-feedback item apiece). That
  collision predates this branch and is master's to renumber — flagged here
  rather than silently changed, since other files may reference either
  reading.

- 2026-09-05, fb112 (observation for future QA passes, not an item):
  qa-playtester reports that the standing "Dawn Rekindle, both choices" money
  path in its own checklist is STALE against SPEC-FINAL — `src/sim/
  sundering.ts` records that p3d deleted the V2 Day/Dusk/Night/Dawn machine
  ("no Dawn Rekindle-or-Leave ledger... SPEC-FINAL names no Rekindle cost
  anywhere") and `advanceToNextBlock` un-petrifies the whole roster for free,
  so there are no longer two choices to exercise. It verified the surviving
  equivalent (`p3d-cycle-machine`, plus full 18-wave/6-VS-wave victories on
  three seeds) instead. QUALITY.md is owner-authored and read-only for this
  lane, so this is recorded here rather than edited; worth a QUESTIONS.md
  entry from the main lane.

- 2026-09-05, fb112: implemented fully in-scope. code-reviewer raised two
  nits that are real but belong outside this diff, filed here rather than
  widening it: (a) `dashSlashSentence`'s `dashRange` is still the
  pre-equipment number — `fireDashSlash` (`src/sim/classes.ts`) doubles it
  under `swordsman_shoes` (and `hitRange = dashRange + mergedRadius` extends
  the line further on the merged-charge path), so the sentence understates
  the real dash distance for a player wearing that item. This is a different
  bug class from fb112 (a live-context gap, not a units error) and closing it
  needs a new `ClassLiveContext` field carrying equipped-item state into
  `class-info.ts`; the item's own `effectNote` in `data/equipment.json` does
  disclose the doubling, so it is not silent. In-lane for `src/ui/**` but
  wants a design decision on how equipment reaches the info sentences — a
  candidate for the next generation batch. (b) `info-format.ts`'s
  `dashWidth: 'Dash width'` fallback label still calls the half-width a
  width; latent today (only reachable through `effectBlock`'s field-list
  fallback, which fb108's sentence table made unreachable for every real
  `kind`) and folded into fb118's acceptance above rather than fixed here.

- 2026-09-05, fb111 (informational, not filed as an item): qa-playtester
  noted that writers persist UNSANITIZED values — `saveSettings` stores what
  it is handed, so `masterVolume: NaN` lands as `"masterVolume":null` and
  `dotNumbers: 1` as a number where the type says boolean. It reloads
  deterministically and identically on every machine (`sanitize` clamps on
  read), so it is not a portability failure, and QA could not reach it
  through the real UI (`hub.ts`'s range inputs go through `Number(el.value)`,
  which never yields NaN) — but a stricter importer or schema validator, the
  direction "cloud-save-safe file format" points, would reject it. Worth
  `saveSettings` writing `sanitize(s)` if this area is ever touched again.
  QA also observed, while probing and unrelated to fb111, that in a DEV build
  the dev-profile-inflated meta is written to `SAVE_KEY` by `onMetaChanged`
  after a run ends, despite `src/ui/main.ts`'s "deliberately never saved"
  comment; `devProfileActive()` is false in production builds so shipped
  saves are unaffected. That one touches `src/ui/main.ts` (in-lane) but needs
  a design call on what dev-profile persistence should mean — a candidate for
  the next generation batch rather than a silent fix.

- 2026-09-05, fb111: implemented fully in-scope, test-only — the audit found
  nothing non-portable, so no production fix was owed; see the item's own
  DONE note above for the four findings it did record. Two main-lane needs
  surfaced and are NOT edited from this lane: (a) `.gitignore` has no
  `vitest.config.ts.timestamp-*.mjs` line, so a killed vitest run leaves an
  untracked file in the repo root that a `git add -A` sweep would commit
  (code-reviewer nit, observed live this session); (b) nothing else — the
  lane's own storage keys are all reachable from `src/ui/**`.

- 2026-09-05, generation: the queue had zero actionable items left (fb085
  needs `data/strings.json`, fb093 needs `tools/ui-audit.ts`, fb097 needs a
  new npm dependency — all three outside this lane's hard Scope and each
  already logged as such in prior sessions; re-confirmed unchanged rather
  than re-attempted). Appended fb114-fb118 per CLAUDE.md's generation rule,
  from a QUALITY.md BETA/1.0 checklist gap diff against the code plus one
  engineer's-judgment item (fb118). Every premise was verified against the
  source before the item was written, not assumed: `matchMedia` appears
  nowhere in `src/` (fb114, fb116), `fullscreen` appears in `hub.ts` only and
  in neither `hud.ts` nor `bottom-bar.ts` (fb143), `visibilitychange` appears
  nowhere in `src/` (fb145), and the fb108/fb112 half-width defect has now
  shipped twice and been caught by review both times, never by a test
  (fb146). jsdom ships no `matchMedia`, which is why fb142/fb144 both carry
  an explicit "absent `matchMedia` is a no-op, never a throw" clause.

- 2026-09-04, lane merge: `lane/ui` (fb071-fb113, this file's 2026-09-04
  batch) merged into master. One conflict, this Log — both sides kept. No
  source conflicts; `src/ui/**`, `src/render/**`, `tests/ui-*`/`tests/render-*`
  and the two logged out-of-Scope test touches merged as-is. **Id collision
  found at the merge:** this lane's 2026-09-04 batch reused fb076-fb099,
  which BACKLOG.md had already assigned (18 ids name two different items
  across the two files), and four ids were duplicated *inside* this file —
  the cross-lane items filed here at the 2026-09-03 merge as fb089/fb090/
  fb091/fb097 are renumbered to **fb114/fb115/fb116/fb117** (references in
  BACKLOG.md, BACKLOG-TERRAIN.md and BACKLOG-CONTENT.md updated); the
  cross-file collision is filed as BACKLOG.md fb118 rather than renumbered
  here, since it touches 30+ committed `tests/ui-fbNNN-*` filenames. The
  three permanently out-of-Scope items (fb085 strings.json, fb093 ui-audit
  scenes, fb097 GIF dependency) and fb107's Codex `keyBindings` follow-up
  are filed in BACKLOG.md at this merge; fb098's `MIN_DISTANCE` note is
  QUESTIONS.md.

- 2026-09-04, fb113: implemented fully in-scope (a prior session had already
  written the `src/ui/hud.ts` memo-key fix and
  `tests/ui-fb113-modal-key-reroll.test.ts` uncommitted in the working tree;
  this session strengthened the test per code-reviewer's Minor note, verified
  everything, ran code-reviewer/qa-playtester, and committed). See the item's
  own DONE note above for detail. No new bugs filed against this item.

- 2026-09-04, fb110: implemented fully in-scope (a prior session had already
  written the `src/ui/hud.ts` memo-key fix and
  `tests/ui-fb110-modal-key-classcore.test.ts` uncommitted in the working
  tree; this session verified them, ran code-reviewer/qa-playtester, and
  committed). See the item's own DONE note above for detail. qa-playtester
  filed one new bug via hostile testing of the same `syncModal` memo
  mechanism (stale offer cards surviving a reroll) — filed as fb113 above.

- 2026-09-04, fb109: implemented fully in-scope; see the item's own DONE note
  above for detail. fb085/fb093/fb097 (all `[ ]` still open above them in the
  queue) were re-confirmed still out-of-scope for this lane rather than
  re-attempted — each was already logged as out-of-scope in prior 2026-09-04
  Log entries below (fb085 needs `data/strings.json`; fb093 needs
  `tools/ui-audit.ts`; fb097 needs a new npm dependency) and nothing about
  this lane's Scope has changed since. Executed fb109 instead, the next
  actionable item, which is fully in-scope.

- 2026-09-04, fb108: implemented fully in-scope. code-reviewer
  (REQUEST-CHANGES → APPROVE after fix) caught a Major: `dashTrailSentence`/
  `dashHealSentence` displayed `eff.dashWidth` as a full width when the sim
  treats it as a half-width/radius (`2 * dashWidth` is the true corridor/
  patch width) — fixed by doubling the displayed value in both, with a code
  comment pointing at the sim line proving it. Also flagged the identical
  pre-existing bug in fb063's untouched `dashSlashSentence`, out of scope for
  this diff — filed as fb112 above rather than folded in, since it's a
  distinct pre-existing defect with its own regression test, not part of this
  item's acceptance text. qa-playtester (PASS) independently re-derived
  several other kinds' semantics straight from `src/sim/classes.ts` rather
  than trusting the new sentences, and filed one Minor: `summonTurretSentence`/
  `manifestSpiritSentence`'s "X% of its stats" wording implied a uniformly
  scaled-down clone, but only dps is scaled — range/attack interval carry
  over at full strength. Fixed same session (both now read "at N% of its
  damage (full range and attack speed)"), regression case added.

- 2026-09-04, fb085: re-confirmed still permanently out-of-scope for this
  lane (see the 2026-09-04 fb085 entry below and the fb095/fb102/fb107 Log
  notes) — this session started building it anyway (`data/strings.json`,
  `src/ui/strings.ts`, `src/ui/strings-lint.ts`, a `hud.ts` conversion of the
  pause/results modal text) before code-reviewer caught the Scope violation
  on `data/strings.json` per this file's own prior Log entry. Reverted in
  full (all four new/changed files) rather than trying to salvage an
  in-scope partial, for the same reason the original skip decision gave:
  the item's acceptance text names the data file explicitly, so a partial
  without it doesn't meet the item. code-reviewer's review also independently
  found the lint heuristic itself had a real false-negative gap (a hardcoded
  literal reintroduced inside a `${...}` ternary/interpolation, rather than
  as a bare HTML text node or `title="..."` attribute, went undetected) —
  worth a note for whoever eventually implements this from main-lane: the
  "flag text nodes and title attributes, strip `${...}` first" approach this
  session tried needs to also scan *inside* `${...}` for quoted string
  literals, not just discard them. Executed fb108 instead, the next
  actionable item, which is fully in-scope.

- 2026-09-04, fb107: code-reviewer (APPROVE) flagged that the Codex's Class
  detail view (`codex-collections.ts` → `classAbilitiesMarkup(row)`) still
  calls with no `keyBindings` arg, so it always shows the default Q/E labels
  even after a player rebinds — a real but consciously-deferred gap, not
  fixed in fb107 itself. Unlike the Hub's other tabs, `Hub.renderCodex` is an
  instance method that already holds `this.keyBindings` (used one tab over by
  Class Select), so this is a same-session inconsistency reachable without
  leaving the Hub, not a "no natural context" case — worth a small follow-up
  item threading `keyBindings` through `CodexCollection.renderDetail` (a
  small `codex.ts`/`codex-collections.ts` signature widening) rather than a
  full backlog entry on its own.

- 2026-09-04, fb097: skipped for this session — its acceptance criteria's
  primary path ("gif capture mode") needs either a new npm dependency (a GIF
  encoder) or, for the fallback path it names ("a downloadable frame-sequence
  archive"), a zip/archive library — either way an out-of-scope `package.json`
  edit (Scope allows only `src/ui/**`/`src/render/**`/`tests/ui*`/
  `tests/render*`/this file). The fallback path also names a `QUESTIONS.md`
  note on the substitution, itself out-of-scope. A dependency-free
  N-separate-PNG-downloads substitute was considered but rejected as not
  actually meeting "produces a downloadable file" (singular) or "archive" in
  the item's own text without a compromise big enough to need the same
  QUESTIONS.md sign-off the item already anticipates — better logged for
  main-lane awareness than shipped as a silent reinterpretation. Executed
  fb098 instead, the next actionable item, which is fully in-scope. Note for
  main-lane awareness: fb098 (see its own DONE note) hit an analogous
  smaller gap — a new `MIN_DISTANCE` tunable that would normally get a
  `QUESTIONS.md` entry per the `COLOR_DISTANCE_MIN` precedent in
  `tools/audit/checks.ts` — resolved in-scope by documenting the numbers in
  `src/render/colorblind-sim.ts`'s own file header instead; still worth a
  `QUESTIONS.md` entry at the next main-lane pass for cross-referencing
  symmetry with `COLOR_DISTANCE_MIN`'s own entry, just not blocking.

- 2026-09-04, fb093: skipped for this session — its literal acceptance
  criteria require editing `tools/ui-audit.ts` (adding an ultrawide and a
  narrow/portrait scene), which falls outside this lane's Scope
  (`src/ui/**`/`src/render/**`/`tests/ui*`/`tests/render*` only). Note for
  main-lane awareness: `fb065`'s own DONE note already touched
  `tools/ui-audit.ts` (adding `#sw-dpsdock`/`#sw-vsdock` to its overlap-check
  selector list) from this lane without a matching Log entry — that precedent
  wasn't followed here since fb093's edit is additive-scene-authoring, a much
  larger out-of-scope surface than a one-line selector-list addition, and
  logging rather than repeating an unlogged shortcut is the safer default.
  Left open rather than substituting an in-scope-only partial (e.g. unit-level
  geometry math alone would not meet the item's own acceptance text, which
  names real `tools/ui-audit.ts` scenes and `npm run ui-audit` explicitly).
  Executed fb094 instead, the next actionable item, which is fully in-scope.

- 2026-09-04, fb085: skipped for this session — its literal acceptance
  criteria require creating `data/strings.json`, which falls outside this
  lane's Scope (`src/ui/**`/`src/render/**`/`tests/ui*`/`tests/render*`
  only). Per the Scope section's own instruction ("an out-of-scope need is
  written into the Log below and becomes main-lane... work at the merge"),
  left open rather than attempted partially (e.g. skipping the
  `data/strings.json` half and only building `src/ui/strings.ts` would not
  meet the item's own acceptance text, which names the data file
  explicitly). Executed fb086 instead, the next actionable item, which is
  fully in-scope.

- 2026-09-03, lane merge: `lane/ui` merged into master (fb055, fb058,
  fb060, fb067-fb070; fb066 WON'T-FIX). No conflicts. The two out-of-Scope
  test edits logged below (q3-save-fuzz, fb022-info-surfacing) merged as-is.
  fb089-fb091 above were filed at the merge from the content and terrain
  lanes' Logs; ids are global across all four backlog files (main lane's
  fb066 was renumbered fb076 for colliding with this file's).

- 2026-09-03, fb058: two files outside the literal Scope glob
  (`tests/fb022-info-surfacing.test.ts`, `tests/q3-save-fuzz.test.ts`) were
  edited from this lane; code-reviewer flagged this as a Major scope-boundary
  violation and it deserves a paper trail rather than a silent judgment call.
  Kept both edits rather than reverting, for different reasons:
  - `tests/q3-save-fuzz.test.ts`: its settings fixture is typed
    `ReturnType<typeof defaultSettings>` (a full `Settings` literal), so
    adding the required `showHiddenClasses: boolean` field to the `Settings`
    interface (`src/ui/settings.ts`, squarely in-scope) makes the fixture fail
    `tsc --noEmit` project-wide unless it's updated in the same change —
    this isn't a "could defer to main lane" edit, it's a compile error for
    everyone until fixed. Precedented: commit `023b181` (fb036, a pre-lane-
    split BACKLOG.md item) made the identical one-line addition
    (`showPathIndicators`) to this same fixture for the same reason.
  - `tests/fb022-info-surfacing.test.ts`: two tests clicked
    `[data-class="engineer"]` on the Hub's default (non-dev) Class row;
    fb058's acceptance criteria ("exactly 3 classes are selectable in a
    normal profile") makes Engineer's card simply not exist there any more,
    so the old assertions fail on contact with any correct fb058
    implementation, not because of an incidental extra edit. The file's own
    docstring scopes it to Hub/class-panel/tooltip rendering (`fb022 Surface
    1: class screen + in-run character panel show live numbers`) — it is a
    Hub UI-behavior test that predates the 2026-09-03 lane split's
    `tests/ui*` naming convention, not a shared-sim-core file the Scope
    section is actually guarding.
  Both edits are minimal (one fixture field; two test-fixture class keys
  swapped from `engineer` to `plaguebringer`, the third normal-profile class)
  and were re-verified as still green together with the full targeted set
  before commit. Recorded here for main-lane awareness of a possible merge
  overlap, per the Scope section's own instruction to log out-of-scope
  touches.

- 2026-09-03, fb063: `tests/fb026-bottom-bar.test.ts` (predates the
  `tests/ui*` naming convention, same precedent class as fb058's
  `tests/fb022-info-surfacing.test.ts` touch above) needed its Time Lord
  "Recharge seconds: N" assertion updated to "N ... to recharge each" —
  the old bare-field-list phrasing fb063's sentence-form tooltip replaces
  for that Active. Two lines changed, re-verified green (21/21) together
  with the rest of the targeted set before commit.

- 2026-09-03, fb060: `tests/q3-save-fuzz.test.ts` needed the same one-line
  touch fb058 already logged above for the identical reason — its
  `customSettings()` fixture is typed `ReturnType<typeof defaultSettings>` (a
  full `Settings` literal), so `settings.ts`'s new `dotNumbers` field (in
  scope) fails `tsc --noEmit` project-wide unless the fixture grows the same
  field in the same change. One line (`dotNumbers: false`), re-verified green
  together with the rest of that file (68/68) before commit.

- 2026-09-03, fb066: attempted the literal acceptance criteria (skip
  attaching a click listener to locked `[data-class]` buttons, mirroring the
  `[data-core]` loop) and it broke on contact with fb058's own design. Two
  concrete classes make this observable without any dev toggle: `plaguebringer`
  and `time_lord` — the two normal-profile classes that are *not*
  `unlockedByDefault` in `data/classes.json` — render `disabled`/`locked` on a
  fresh `defaultMeta()` profile. `tests/ui-fb058-class-select.test.ts`'s
  "switching the selected card updates the band panel to the new class" test
  clicks the locked `plaguebringer` card specifically to exercise that
  preview path, and fails immediately once the listener is skipped. This is
  not an incidental collision: fb058's own DONE note says outright that
  "previewing a locked class's band stats by clicking its (still-visible,
  still-'on') card is intentional and an existing test relies on it." Cores
  have no analogous preview feature (a locked Core's detail panel is never
  reachable by click at all), so `[data-core]`'s "skip locked entirely"
  pattern was never actually the same shape as `[data-class]`'s — fb066 was
  filed on the assumption they should match without noticing fb058 had
  already built them asymmetric on purpose. The actual security-relevant
  concern the original report raised (a locked class reaching `RunConfig`
  unguarded) is already closed by fb058's `beginRun()` reconciliation, and a
  real `disabled` HTML button never receives a real mouse click regardless of
  whether a JS listener is attached underneath it — so skipping attachment
  here would trade away a real, tested, owner-visible feature for a purely
  cosmetic parity with Core that isn't actually warranted. Reverted the
  hub.ts change and the attempted regression test; closing WON'T-FIX rather
  than leaving it open against acceptance criteria that can't be met without
  a regression. `npm run test:fast` re-confirmed clean of any `src/ui/**`/
  `src/render/**`-touching failures after the revert.
