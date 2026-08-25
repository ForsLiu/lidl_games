# BACKLOG.md — ordered work queue

Format: `- [ ] (id) [type] title — acceptance: <objective check> — refs: <spec §>`
Loop mode executes the top actionable item. Completed items move to the Done section
with the commit hash.

## Queue

- [ ] (b003) [bug] Stash click-to-swap + drag-to-unequip + compare tooltip; no
      dead-end equip states — acceptance: B10 stash test green — refs: SPEC-V2 §10 D2, §3
- [ ] (f001) [feat] Cycle state machine: Day→Dusk→Night→Dawn ×3, Dusk picker every
      cycle, Dawn Rekindle/Leave flow — acceptance: scripted 3-cycle sim completes;
      B9 state test green — refs: SPEC-V2 §1
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

- [x] (b002) [bug] Pause menu Abandon Run (with confirm) available in both phases —
      refs: SPEC-V2 §10 D1 — qa-playtester pass 2026-08-25 (confirm flow probed
      across act1_build, act1_wave, dusk, soulpick, levelup and act2; state
      bit-identical across the pause cycle; no bugs filed)
- [x] (b001) [bug] Death flow: Night-phase Warden death and Day-phase Core death both
      reach a defeat Results screen with Retry / New Run / Hub — refs: SPEC-V2 §10 D1
      — commit 645d4b0, qa-playtester pass 2026-08-25 (race against victory, pause
      during the beat, lastCfg, Act I reform path all adversarially checked, no bugs)
