# BACKLOG-QUALITY.md — lane: quality  (branch `lane/quality`, worktree D:\lidl_games-quality)

## Scope (hard boundary)
May create/edit ONLY: `tests/**`, `tools/**`, `bench/**`, and this file.
Read anything. Never edit `/src/**`, `/data/**`, `BACKLOG.md`, `PROGRESS.md`,
`QUESTIONS.md`. If a finding needs a src/data fix, write it as a bug report
into the Log below (it becomes main-lane work at merge).

## Queue (QUALITY.md Alpha/Beta bars + gate G17)

- [ ] (q1) [feat] Soak harness: 50 seeded full runs headless, assert zero
      uncaught exceptions and zero NaN in any report field — acceptance:
      `npm run soak` exists and passes; wired into npm test as a tagged
      slow suite
- [ ] (q2) [feat] Input fuzzer: 10,000 random valid Commands per phase,
      no crash, no negative/NaN stat — acceptance: fuzz test green,
      seed-reproducible
- [ ] (q3) [feat] Save fuzzer: truncated/bit-flipped/version-bumped saves
      load into the repair path, never crash — acceptance: test matrix green
- [ ] (q4) [feat] Perf benchmark for G17: per-simulated-minute sim budget,
      host-normalized (report ratio vs a calibration loop), plus the
      350-enemy worst-case tick — acceptance: `npm run bench` prints the
      G17 numbers and the suite asserts the ratio
- [ ] (q5) [feat] Telemetry: every run (human or bot) appends its end
      report JSON to /telemetry — acceptance: dev-run writes a file; sweep
      tool can ingest the folder
- [ ] (q6) [feat] Mutation smoke: script that re-runs the 20 mutations QA
      has used so far and asserts each is caught — acceptance:
      `npm run mutations` green

## Log
(empty)
