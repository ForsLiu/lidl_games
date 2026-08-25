# QUALITY.md — Stonewake definition of done, staged

Authored by design, not by the build agent. The build agent implements toward these
bars and may propose edits via QUESTIONS.md, but may not edit this file.

Three ratcheting stages. A stage is claimed only when every line in it is green
(automated) or checked by the owner (manual). Current target stage: **ALPHA**.

---

## ALPHA — "systems-complete and honest" (target of M9–M16)

Automated:
- [ ] All SPEC v0.1 A-gates and SPEC-V2 B-gates green in CI.
- [ ] Headless full-run sim ≤ 6 s; suite runtime ≤ 5 min.
- [ ] Determinism: 100/100 replay hash match, including class actives and uniques.
- [ ] Soak: 50 seeded full runs, zero uncaught exceptions, zero NaN in any report field.
- [ ] Save/load: round-trip equality test; corrupted-save (truncated/bit-flipped)
      loads into repair path, never a crash; version migration test from v0.1 saves.
- [ ] Input fuzz: 10,000 random valid Commands per phase produce no crash and no
      negative/NaN stat.

Manual (owner checklist):
- [ ] Every class's kit is usable and legible without reading any docs.
- [ ] Death, quit, retry, abandon all work from every screen.
- [ ] One full run played by the owner with zero confusion-stops ("what just happened?").

## BETA — "feels like a product" (next stage; do not start before Alpha)

Automated:
- [ ] Performance benchmark scene (350 enemies, 8 weapons, full terrain, particles):
      p95 frame ≤ 16.6 ms, p99 ≤ 25 ms on the dev machine; recorded per commit.
- [ ] No GC pause > 50 ms during the benchmark (pre-allocate / pool as needed).
- [ ] Load to Hub < 3 s cold; Hub → run < 1.5 s.
- [ ] Balance spread: every boon pick rate within ×0.5–×2.0 of mean; every class
      within the B3 band at T1–T3; every weapon role represented in ≥30% of winning
      sim builds.
- [ ] Localization-readiness: zero user-facing string literals outside
      `data/strings.json` (lint rule).

Manual:
- [ ] First-run onboarding: contextual tutorial prompts for build → Dusk → Night →
      Dawn; a new player reaches Night 1 without external help.
- [ ] Settings: master/SFX volume, screenshake toggle, reduced-flash mode, damage
      number toggle, key remapping, resolution/DPR handling, colorblind-safe palette.
- [ ] Pause works everywhere; window unfocus auto-pauses; no progress loss on refresh.
- [ ] Art pass 1: replace primitive shapes with a licensed/CC0 asset set (tracked in
      ASSETS.md with license per file); replace synthesized SFX with an audio pack;
      one music loop per phase.
- [ ] Three external playtesters complete a run; their top-5 confusions each are
      fixed or consciously declined in QUESTIONS.md.

## 1.0 — "shippable" (do not start before Beta)

- [ ] Steam/itch checklist: fullscreen + windowed, 16:9/16:10/ultrawide safe, save
      slots (3), cloud-save-safe file format, error capture to a local log with a
      "copy report" button, credits + license screen, store-page asset export
      (screenshots at fixed seeds, gif capture mode).
- [ ] Content floor: 11 classes, 10+ towers, 25+ enemies, 12+ uniques, 220-node tree,
      T1–T5 + 12 modifiers, 12 quests, 3 bosses (add one mid-boss).
- [ ] Difficulty curve validated by ≥10 external playtesters' win-rate telemetry.
- [ ] Zero known crash bugs; regression suite green for 2 consecutive weeks of
      commits.
- [ ] Accessibility re-check: remap conflicts, colorblind palettes on real content,
      reduced-motion mode.

## Standing rules at every stage

- A bug confirmed by a human gets a failing regression test before its fix.
- No gate may depend on a specific map modifier (HANDOFF lesson).
- Prefer means/pass-rates over medians for bimodal metrics (HANDOFF lesson).
- Anything subjective the agent is unsure about → QUESTIONS.md, never silently decided.
