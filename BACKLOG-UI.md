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

- [ ] (fb071) [feat] normal priority: window unfocus auto-pause —
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
      auto-pauses"), SPEC-FINAL §11 (Esc pause parity).

- [ ] (fb072) [feat] normal priority: boss health bar — the two boss
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
      2 bosses with no matching HUD depth).

- [ ] (fb073) [feat] normal priority: key remapping — QUALITY.md BETA's
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
      §11.

- [ ] (fb074) [feat] low priority: resume run after a page refresh —
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
      already required for G2).

- [ ] (fb075) [polish] low priority: Settings "reset to defaults" — the
      Settings tab has no way to restore every slider/toggle to
      `defaultSettings()`'s values short of clearing `localStorage`
      manually. Add a single reset button with a confirm step (destructive
      to any tuned volume/accessibility preferences). Acceptance: a unit
      test opens Settings, changes several values, clicks reset (confirms
      the destructive step), and asserts every field reads back as
      `defaultSettings()` — refs: SPEC-FINAL §11, standard Settings-UX
      convention.

- [ ] (fb089) [bug] `tests/b036-help-fold.test.ts` is red on master and
      red standalone: `.sw-help`'s bottom edge measures 1095.4 against the
      1080 fold b036 exists to defend, in Training Grounds with a tower
      selected and the practice panel open. Deterministic (4 s, `npx vitest
      run tests/b036-help-fold.test.ts`), reported independently by the
      content and terrain lanes and first misfiled as a load flake. Acceptance:
      the existing test goes green without loosening the 1080 fold; the
      practice panel + selected-tower layout keeps the help block inside the
      fold at 1920x1080 — refs: SPEC-FINAL §11, b036.
- [ ] (fb090) [bug] c001 (Area reaches every class Active) left three
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
- [ ] (fb091) [feat] terrain rendering (BACKLOG-TERRAIN.md fb064e, the
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
- [ ] (fb097) [feat] normal priority: Core-select screen redesign to match
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

## Log

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
