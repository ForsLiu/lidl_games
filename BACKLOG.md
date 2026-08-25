# BACKLOG.md — ordered work queue (SPEC-V3)

Format: `- [ ] (id) [type] title — acceptance: <objective check> — refs: <spec §>`
Loop mode executes the top actionable item. Completed items move to the Done section
with the commit hash.

**Rewritten at M17** to SPEC-V3 §13's M17–M27 order. The V2 queue (M9–M16) is closed
out in the Done section; items it never reached were superseded by V3 rather than
skipped — see MIGRATION.md.

**Standing constraint for every item below (QUESTIONS Q40):** do no balance tuning
before M19 lands multiplicative stacking. Bounds that fail in the meantime get a
recorded reason, not a nudged constant.

## Queue

### M18 — quick wins (gates C7, C8, C5-prep)

- [ ] (s001) [bug] `migrate()` preserves unknown save keys forever: it spreads
      `...meta` wholesale, so any key a save carries survives every round trip as a
      fixed point — the same defect t6c fixed for one name. A non-object `meta`
      is worse: `{"meta":"orbs"}` string-spreads into indexed keys `{"0":"o",...}`
      and re-serialises stably — acceptance: build the migrated object from the
      known key set instead of a spread; a save carrying junk keys and one with a
      non-object `meta` both migrate to exactly the MetaState key set — refs: QA on
      t6c, bug 1
- [ ] (s002) [bug] A save whose `stash` alone is corrupt loses the whole account:
      `deserializeMeta('{"version":1,"meta":{"stash":"nope"}}')` throws in
      `migrate()`, `loadMeta` catches it and returns a brand-new account, so Ember,
      account level, unlocks and quests are discarded with it. Pre-existing, not
      introduced by t6c — acceptance: a malformed `stash` (non-array, or an array
      containing null) coerces to `[]` and every other field survives; extend
      `tests/meta.test.ts`'s "survives a corrupt or empty save" case, which today only
      covers `'{}'` — refs: QA on t6c, bug 4
- [ ] (s003) [bug] `levelup` has no auto-resolve, so an unattended run parks in it
      forever — `soulpick` (30 s) and `dawn` (`DAWN_AUTO_SECONDS`) both have one.
      Pre-existing for any AFK run; god mode only makes it permanent, since you can
      no longer die out of it. QA repro: a practice run with god mode injected at
      tick 1, stepped 72 000 ticks, ends `outcome running, phase levelup,`
      `wavesCleared 10, alive 351` — acceptance: an unattended run either advances or
      terminates; a headless run stepped past its tick budget never sits in `levelup`
      — refs: QA on t4, bug 4
- [ ] (s004) [bug] Alive count exceeds `aliveCap`: QA measured **353** against a cap
      of 350, because elite and summon spawns bypass the cap check that
      `act2.ts`'s `spendBudget` applies. Pre-existing and small, but A10's
      entity-budget assertion sits right next to it — acceptance: no spawn path can
      push `w.enemies` past `aliveCap`; a test drives elites and boss summons at the
      cap — refs: QA on t4, bug 4 side note
- [ ] (t3) [feat] Dev profile: `data/dev.json` with `devMode`, schema-validated;
      when on — all classes/maps/tiers unlocked, 999 skill points, stash pre-filled
      with every §7 item available, all quests complete; Settings toggle switches to
      a clean profile —
      acceptance: gate **C8** — a test asserts dev build has everything unlocked, and
      that the `npm run build` bundle has `devMode` **off** (asserted against the
      built output in `dist/`, not against the source default) — refs: V3 T3
- [ ] (t1) [feat] Range indicators: placement ghost shows the **effective** attack
      range (tier and `towerRangeMul` applied, not the base `def.attack.range` it
      shows today) plus an AoE preview for splash towers; a selected tower shows its
      own ring; **fix `view.showRanges`, which is set by the R key, the HUD button
      and a Settings checkbox and is never read by the renderer** —
      acceptance: unit test on the range-computation helper proves ghost range ==
      the range the sim will fire at for tiers 1..max; a canvas-level test asserts
      `showRanges` changes what is drawn (spy on the 2d context) — refs: V3 T1
- [ ] (t2) [feat] Selection feedback: clicking a tower, enemy or the character
      selects it — highlight + range ring + stats panel; clicking empty ground
      deselects; hover shows a light outline —
      acceptance: jsdom test drives real clicks through `bindCanvasInput` and
      asserts the selection model changes for each target type and clears on empty
      ground; selection is presentation-only (no `World` writes, enforced by the
      existing architecture test) — refs: V3 T2 (**log to QUESTIONS if this misreads
      the owner's "click has no reaction" report — V3 T2 asks for that explicitly**)

### M19 — combat math and damage types (gates C3, C4)

- [ ] (m19a) [feat] Armor v3: flat points = percent reduction, cap +99, uncapped
      negative — acceptance: gate **C3** — +99 → 99% reduction, +150 clamps to 99,
      −90 → ×1.9 damage taken, DoTs ignore armor except Burning's shred — refs: V3 §2
- [ ] (m19b) [feat] Multiplicative stat stacking: sources multiply, ranks add within
      a source — acceptance: gate **C4** — two 10%/20% same-stat sources from
      different origins produce exactly ×1.32 — refs: V3 §2
- [ ] (m19c) [feat] Damage-type taxonomy in `data/damagetypes.json`: Normal,
      Bleeding, Poison, Toxic, Burning, Electric; frost/frozen statuses replace the
      V2 chill-stack model — acceptance: one unit test per row of V3 §3's table
      asserting the stated totals and durations; Bleeding stacks independently to
      the 50/enemy perf cap — refs: V3 §3, Q44

### M20 — tower model v3 (gate: data tests)

- [ ] (m20a) [feat] Per-tower upgrade tracks: upgrade count, +10% HP/Attack/Defense
      per step, flat step cost, sell 50% of total spent; towers gain a real
      `defense` stat — acceptance: data test asserts every tower's track is
      well-formed and that sell refunds exactly 50% of build+upgrades at every step
      — refs: V3 §4
- [ ] (m20b) [feat] The three owner towers (Arrow, Electric, Poison) with their
      milestone specials — acceptance: one test per listed special (+1 pierce @3,
      Bleeding @4, +1 projectile @5; electric chain @3; +1 projectile @2, ratio
      1:1.5 @4) — refs: V3 §4
- [ ] (m20c) [balance] Migrate the remaining seven towers to the v3 model and log
      proposed tracks to QUESTIONS for owner sign-off — acceptance: all ten towers
      pass the m20a data test; QUESTIONS entry lists each proposed track — refs:
      V3 §4, Q39

### M21 — VS formula (gate C2)

- [ ] (m21a) [feat] VS wielding formula: character wields every built tower type;
      damage = average across that type's towers × (1 + 10% × count); highest
      upgrade level's effects apply — acceptance: gate **C2**, including V3 §5's
      worked arrow example transcribed verbatim as a unit test — refs: V3 §5
- [ ] (m21b) [feat] Towers inert but present in VS waves: no attacks, keep HP,
      remain solid obstacles, contribute per-type VS specials (Electric wire grid,
      Poison trail) — acceptance: test asserts zero tower damage during a VS wave,
      that enemies can damage towers, and one test per specced VS special — refs:
      V3 §4–§5
- [ ] (m21c) [feat] Wielded attacks count as character attacks: scale with
      Power/atk-speed/area, trigger lifesteal, fire on-attack passives —
      acceptance: test proves lifesteal heals from a wielded tower attack and that
      an on-attack passive counts it — refs: V3 §5
- [ ] (m21d) [polish] Delete the Sundering/soul-binding code and its retired tests
      (A5, A6, A8, `sundering.ts`, weapon levels, Awakenings, terrain residuals) —
      acceptance: files removed, `npm test` green, MIGRATION.md §2.3 checked off —
      refs: V3 §5

### M22 — interleaved run structure (gate C1)

- [ ] (m22a) [feat] Interleaved waves: TD×3→VS repeating, 18 TD + 6 VS, VS after
      waves 3/6/9/12/15/18, Gatebreaker at TD 18, boss at the final VS —
      acceptance: gate **C1**'s pattern half — refs: V3 §1
- [ ] (m22b) [feat] Multi-summon: stack up to 3 TD waves, each paying its own
      early-call bonus per Q43; VS waves cannot be stacked or skipped —
      acceptance: gate **C1**'s stacking half — refs: V3 §1, Q43
- [ ] (m22c) [polish] Delete the Day/Dusk/Night/Dawn cycle machine and its retired
      tests — acceptance: MIGRATION.md §2.2's table is empty, `npm test` green —
      refs: V3 §1
- [ ] (m22d) [balance] Re-baseline A1, A4, `light-build` and **A10** against the new
      run shape; A10 per Q41's option (a) — acceptance: each gate green or carrying
      a written reason; A10 gets a run-length-independent budget — refs: Q41

### M23 — classes (gates C9, C10, C11)

- [ ] (m23a) [feat] Class framework v3: archetype stat bands, Passive + Active1 (Q)
      + Active2 (E) + Tower passive, mouse-aimed actives, combo rules — acceptance:
      framework tests; all actives remain sim Commands and replay identically —
      refs: V3 §6
- [ ] (m23b) [feat] Swordsman kit — acceptance: gate **C9** (Dash during a charged
      Circle Slash merges into one attack with widened range; each struck enemy takes
      exactly one Bleeding) — refs: V3 §6
- [ ] (m23c) [feat] Plaguebringer kit — acceptance: gate **C10** (an enemy dying with
      unfinished DoT deals exactly the unfinished total to the nearest enemy, once) —
      refs: V3 §6
- [ ] (m23d) [polish] Legacy flags and badge for the three existing classes per Q38 —
      acceptance: gate **C11** (legacy classes still complete a run; badge visible) —
      refs: V3 §6, Q38

### M24 — equipment and rewards (gate C7 full)

- [ ] (m24a) [feat] Equipment v3: 6 slots, the 12-item table, flat adds plus
      multipliers, conditional effects with class checks and fallbacks — acceptance:
      data test covers all 12 items; one test per conditional effect including its
      "if not Swordsman" fallback — refs: V3 §7
- [ ] (m24b) [feat] Rewards pipeline: 1 equipment per TD wave cleared, 1 skill point
      per VS wave cleared, granted at run end, paid on defeat for waves fully
      cleared — acceptance: gate **C7** in full — refs: V3 §8, Q42
- [ ] (m24d) [balance] Re-price the "Tinkerer" notable, whose `relicFind` effect QA
      measured as ~95% inert (elite and boss relic drops are guaranteed, so find only
      moves `waveRelic` 0.12 → 0.15) — acceptance: either relic find scales the
      guaranteed drops too, or the node gets an effect a notable deserves; a test
      asserts the node's stat measurably changes loot over 200 elite kills — refs:
      V3 §8, Q50
- [ ] (m24c) [feat] Retire Ember: skill points replace the Ember→level→points
      pipeline, one-time 100:1 conversion, respec priced in skill points —
      acceptance: no Ember in sim, meta or UI; conversion test; save migration test
      per Q49 — refs: V3 §8, Q46, Q49

### M25 — pathing v3 (gates C5, C5b)

- [ ] (m25a) [feat] Remove the path guarantee; structures become high-cost passable
      tiles (cost ∝ HP × toughness); enemies breach and attack structures en route —
      acceptance: gate **C5** — refs: V3 §9
- [ ] (m25b) [balance] Turtle economics stay honest — acceptance: gate **C5b** (a
      full-seal build's T2 win rate may not exceed the best open-maze build's by more
      than 10 points) — refs: V3 §9

### M26 — Codex and Tuner (gate C6)

- [ ] (m26a) [feat] Content hash in `RunConfig` and in the end-state hash inputs, so
      a replay against edited `/data` fails loudly — acceptance: editing any `/data`
      value changes the config hash; a replay with a mismatched hash is rejected —
      refs: Q45 (**do this before m26b**)
- [ ] (m26b) [feat] Codex: Hub page listing every class, tower, equipment, damage
      type, enemy and wave with live stats read from `/data` + schemas — acceptance:
      every content collection appears; counts match the data files — refs: V3 T5
- [ ] (m26c) [feat] Tuner: in dev mode every numeric/enum field editable including
      wave composition; Save persists via a Vite dev-server endpoint; schema
      validation rejects invalid edits inline; prod is read-only Codex plus
      Export/Import JSON — acceptance: gate **C6** round-trip — refs: V3 T5

### M27 — sweep

- [ ] (m27a) [balance] All surviving A/B gates and all C gates green, re-baselined in
      one pass per Q40 — acceptance: `npm test` green with no unexplained skips —
      refs: V3 §13
- [ ] (m27b) [balance] Restate A8's surviving claim against v0.3: a maxed TD board
      must convert into a materially better VS outcome than a minimal one —
      acceptance: a new gate with a measured band, replacing retired A8 — refs:
      MIGRATION.md §5
- [ ] (m27c) [polish] Regenerate HANDOFF measured sections; QUALITY Alpha re-check —
      acceptance: tools run clean, file updated, committed — refs: CLAUDE.md

## Done

- [x] (t4) [feat] God mode as a practice-run Command — refs: V3 T4 — qa-playtester
      **PASS** on all three acceptance criteria, verified far past the two patched
      functions: QA confirmed `damageWarden` is the *only* writer of Warden HP and
      `leakIntoCore` the only subtraction of Core HP in the whole sim, then drove all
      eight hostile damage paths (contact, bomber, spitter, stomp, ground areas, boss
      charge/slam/fire) plus a 60 s toe-to-toe boss fight and 1000 forced colossus
      leaks — no damage in any of them, and mortality restored correctly on toggle
      off. Replay identity verified at four scales including 1001 toggles in one tick.
      Three findings fixed in the same commit: the god button had **no on/off state**
      (the lit class was special-cased to one op name), `ALL_OPS` in practice.test.ts
      had drifted so the new op skipped the non-practice guard, and the
      "god cannot rescue a defeat already begun" behaviour was unpinned. QA also
      corrected the *reason* given for keeping leak accounting live — the B7 claim was
      wrong, since B7 never enters practice mode; the real defence is that the Day
      HUD's "Loose in the dark" counter makes the consequence visible. Measured: a god
      Day and a mortal Day produce identical Nights. Findings left as their own items:
      s003 (`levelup` never auto-resolves) and s004 (alive count exceeds `aliveCap`).

- [x] (t6c) [bug] Save migration drops `orbs` and bumps SAVE_VERSION 1 → 2 — refs:
      V3 §8, C7 — qa-playtester **PASS** on all four acceptance criteria, verified
      through the real `localStorage` path as well as the pure functions, with a full
      money-path sweep (fresh account → run → defeat → Results → Hub → seed → equip →
      reload) confirming nothing re-introduces the key. Two of its findings were taken
      in this same commit because they shared a two-line fix and the file was open:
      the strip is now **version-gated** (a newer client legitimately reusing the name
      would have had that field eaten on every load) and **guarded against deleting a
      live MetaState key**; both repros are regression tests. QA also measured that a
      poisoned `RETIRED_KEYS` turns 5 tests red, so required fields were already
      protected — it was optional ones that were exposed. Findings left as their own
      items: s001 (migrate preserves unknown keys forever) and s002 (a corrupt stash
      discards the whole account, pre-existing).

- [x] (t6ab) [feat] Delete Orbs entirely from sim, meta, data and UI, and repurpose
      the Constellation node that granted one — **t6a and t6b merged**: removing
      `MetaState.orbs` breaks the Hub in the same commit, so the type system does not
      allow splitting the sim change from its UI. `equip`/`discard` moved out of the
      deleted `crafting.ts` into `src/meta/stash.ts` (V3 §8 keeps the stash).
      Gate **C7** Orbs half green via `tests/c7-no-orbs.test.ts` — refs: V3 §8, T6 —
      qa-playtester pass 2026-08-25: FAIL on first submission with three Majors, all
      fixed and each verified by reproducing the exploit that found it — (1) the C7
      scan exempted `loot.ts` and `stash.ts`, the two files most likely to regress,
      so reintroducing `orbPerElite` passed the gate; (2) the C7 DOM scan never
      clicked anything, so the Hub notice that used to read "3 of each Orb" was never
      scanned; (3) **this diff neutered the suite's only proof that `applyRunResult`
      banks anything** — the orb assertion was rewritten to compare 0 to 0 and
      asserted the opposite of its own title. QA also confirmed relic drop counts are
      per-seed bit-identical to HEAD across 12 seeds (only the drops-stream cursor in
      the end hash moves), that the three "orb" false positives are undamaged, and
      that A10's redness reproduces at HEAD. Bug 7 (Tinkerer inert) logged as Q50 and
      backlog m24d.

- [x] (m17) [feat] M17 reconcile: audit code vs V3, MIGRATION.md, retire dead tests
      with logged reasons, rewrite BACKLOG to V3 §13 — refs: V3 §13.1 — commit
      pending in this change; retirements: A5, A6, A7, A8 (whole files, `describe.skip`
      with reasons) and 4 assertions in `f001-cycle-machine.test.ts` including gate
      B9; B11 retired with no test to mark (never implemented). Q38–Q49 logged.
- [x] (f004) [feat] Class framework (v2 shape) — **superseded by M23** per QUESTIONS
      Q48. Committed unverified as `6019a8b` (`wip`); its qa-playtester pass was
      deliberately not run because V3 §6 replaces the kits. Surviving plumbing — the
      `class_active` Command, cooldown field, Q binding, HUD row, `data/affinity.json`
      — is the base m23a builds on.
- [x] (f003) [feat] Leak coupling: Day leaks add 2× director cost to that Night's
      budget; "Loose in the dark" HUD counter — acceptance: B7 (mechanism only;
      the full statistical gate — survival drop ≥10% via sweep — is M15's per
      SPEC-V2 §12) — refs: SPEC-V2 §1 — commit f24bf7c, code-reviewer pass
      2026-08-25, qa-playtester pass 2026-08-25 (filed and fixed one bug in the
      same commit: `leakIntoCore` charged a pack enemy's full director cost to
      every physical leaked body instead of dividing by `packSize`)
- [x] (f002) [feat] Soul persistence — no new commit: already delivered by f001
      (`4e44a33`). **Its gate B9 is retired at M17** (V3 §12).
- [x] (b004) [bug] `report.survivalSeconds` used Night-local `w.act2Time` instead of
      cumulative `w.act2Ticks / 60` — commit 19eecf3, code-reviewer pass (found the
      identical bug in the Results screen, fixed in the same commit), qa-playtester
      pass
- [x] (f001) [feat] Cycle state machine: Day→Dusk→Night→Dawn ×3 — commit 4e44a33,
      code-reviewer pass (found `hashWorld` omitting `soulLevels`), qa-playtester
      pass (filed b004). **Superseded by V3 §1; code removed at M22.**
- [x] (b003) [bug] Stash click-to-swap + drag-to-unequip + compare tooltip — commit
      84bc3f8, qa-playtester pass
- [x] (b002) [bug] Pause menu Abandon Run requires confirm — commit d2079e7,
      qa-playtester pass
- [x] (b001) [bug] Death flow reaches Results with Retry / New Run / Hub — commit
      645d4b0, qa-playtester pass
