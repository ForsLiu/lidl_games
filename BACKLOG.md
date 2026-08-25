# BACKLOG.md — ordered work queue

Format: `- [ ] (id) [type] title — acceptance: <objective check> — refs: <spec §>`
Loop mode executes the top actionable item. Completed items move to the Done section
with the commit hash.

## Queue

- [ ] (b004) [bug] `report.survivalSeconds` (drives Ember's completion-fraction
      reward, `src/meta/meta.ts` `emberFor`) reads `w.act2Time`, which resets to 0
      every Dusk→Night transition (`finishSundering`) — a run that survives 2+ full
      Nights then dies mid-cycle reports only the current cycle's local Night time,
      not cumulative Night survival, underpaying Ember (~21% short on a real
      2-Night-survival repro). `report.act2Seconds` (`w.act2Ticks / 60`) already
      tracks the cumulative figure correctly — acceptance: a failing regression
      test added first (a run that reaches Dawn twice asserts
      `survivalSeconds === act2Seconds`), then `buildReport` uses the cumulative
      source; full suite green — refs: SPEC-V2 §1, found by qa-playtester
      2026-08-25 verifying f001
- [ ] (f002) [feat] Soul persistence: per-soul Night level tracks survive across
      Nights for petrified-left towers; Rekindled souls leave the picker —
      acceptance: B9 — refs: SPEC-V2 §1
- [ ] (f003) [feat] Leak coupling: Day leaks add 2× director cost to that Night's
      budget; "Loose in the dark" HUD counter — acceptance: B7 — refs: SPEC-V2 §1
- [ ] (f004) [feat] Class framework: actives/passives/affinity as data + Commands;
      Q-key + cooldown HUD; affinity replaces exclusivity — acceptance: framework
      tests; picker binds for a 8-soul build — refs: SPEC-V2 §2
- [ ] (f005) [feat] Classes: Swordsman, Archer, Cryomancer, Stormcaller —
      acceptance: B4, B8 green; each kit demonstrable in practice mode — refs: SPEC-V2 §2
- [ ] (m001) [polish] Regenerate HANDOFF measured sections after M9 — acceptance:
      tools run clean, file updated, committed — refs: CLAUDE.md

## Done

- [x] (f001) [feat] Cycle state machine: Day→Dusk→Night→Dawn ×3, Dusk picker every
      cycle, Dawn Rekindle/Leave flow — refs: SPEC-V2 §1 — commit <pending>,
      code-reviewer pass 2026-08-25 (one Major finding — `hashWorld` omitted the
      new `w.soulLevels` persisted-soul-progress record, so two replays could
      diverge there without the A11 hash catching it — fixed by hashing
      `soulLevels` sorted by key, same pattern as `boonRanks`; re-verified green),
      qa-playtester pass 2026-08-25 (3-cycle termination across 40 seeds, Rekindle
      economics — no gold, non-petrified/dead/double-rekindle targets, Dawn/Dusk
      auto-advance timers, same-tick death/timer races, A11 replay determinism —
      all held; filed one real bug as b004, out of this item's scope per its own
      verdict)
- [x] (b003) [bug] Stash click-to-swap + drag-to-unequip + compare tooltip; no
      dead-end equip states — refs: SPEC-V2 §10 D2, §3 — commit 84bc3f8,
      qa-playtester pass 2026-08-25 (rapid multi-slot equip/unequip cycles, crafting
      an equipped relic, cross-slot equip-bypass attempt, discard-while-selected,
      tab-switch state survival, garbage drag payloads all probed; no bugs filed —
      one non-blocking polish note that orb buttons aren't disabled for
      already-ineligible relics, out of scope for this item)
- [x] (b002) [bug] Pause menu Abandon Run (with confirm) available in both phases —
      refs: SPEC-V2 §10 D1 — commit d2079e7, qa-playtester pass 2026-08-25 (confirm
      flow probed across act1_build, act1_wave, dusk, soulpick, levelup and act2;
      state bit-identical across the pause cycle; no bugs filed)
- [x] (b001) [bug] Death flow: Night-phase Warden death and Day-phase Core death both
      reach a defeat Results screen with Retry / New Run / Hub — refs: SPEC-V2 §10 D1
      — commit 645d4b0, qa-playtester pass 2026-08-25 (race against victory, pause
      during the beat, lastCfg, Act I reform path all adversarially checked, no bugs)
