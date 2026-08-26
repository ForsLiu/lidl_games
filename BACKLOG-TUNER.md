# BACKLOG-TUNER.md — lane: tuner  (branch `lane/tuner`, worktree D:\lidl_games-tuner)

## Scope (hard boundary — the loop prompt enforces this)
May create/edit ONLY: `src/ui/codex*`, `src/ui/tuner*`, `src/devserver/**`,
`tests/codex*`, `tests/tuner*`, `vite.config.ts` (plugin registration lines
only), and this file. Read anything. Never edit `/src/sim/**`, `/data/**`
(the save endpoint's tests use temp copies), `BACKLOG.md`, `PROGRESS.md`,
or `QUESTIONS.md` — lane questions and decisions go in the Log below and are
reviewed at merge.

## Queue (SPEC-V3 §10 T5, gate C6 — UI halves; sim-side wiring stays main-lane)

- [ ] (t26a) [feat] Codex read-only: Hub page listing every class, tower,
      equipment, damage type, enemy, and wave with live stats read from
      /data + zod schemas — acceptance: every /data collection renders; a
      field added to a schema appears without code changes to the page
- [ ] (t26b) [feat] Dev-server save endpoint: POST /__tuner/save, dev mode
      only, validates the full document against its zod schema, writes the
      real /data/*.json atomically, rejects invalid with field-level errors
      — acceptance: endpoint tests against temp data copies; prod build
      contains no endpoint
- [ ] (t26c) [feat] Tuner edit UI: in dev mode every numeric/enum field in
      the Codex is editable, including wave composition and counts; Save
      calls t26b; inline validation errors — acceptance: edit→save→reload
      round-trip test (C6 UI half)
- [ ] (t26d) [feat] Live-edit flagging, UI side: a run started after unsaved
      live edits is visibly flagged like practice. Build against a stubbed
      `contentHash()` in `src/devserver/contenthash.ts`; RunConfig wiring
      (Q45) is main-lane work — acceptance: flag renders from the stub
- [ ] (t26e) [feat] Prod builds: read-only Codex + Export/Import JSON
      — acceptance: export→import round-trip equality test

## Log
(empty)
