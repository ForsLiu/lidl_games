# CLAUDE.md — Stonewake standing orders (v3, SPEC-FINAL)

## Sources of truth, in order
1. **SPEC-FINAL.md** — the design, v1.0. Self-contained and **supersedes SPEC.md,
   SPEC-V2.md and SPEC-V3.md**, which are kept only as history. Its §14 gates
   **G1–G20** replace every prior A/B/C gate list, and its §15 P0–P10 build order is
   the backlog's order.
2. **MIGRATION.md** — what this codebase has that SPEC-FINAL keeps, replaces or
   drops, plus the test-retirement ledger (§8 is the SPEC-FINAL reconcile).
3. **QUALITY.md** — definition of done per stage (read-only for you; propose changes
   via QUESTIONS.md)
4. **HANDOFF.md** — engineering state report; regenerate its measured sections with
   the tools it lists after every completed milestone
5. **SPEC-V3.md**, **SPEC-V2.md**, **SPEC.md** — superseded. Consult them only to
   understand why existing code looks the way it does, never as authority. Where one
   conflicts with SPEC-FINAL, SPEC-FINAL wins and the conflict goes in QUESTIONS.md.

Do not redesign what these define. Fill genuine gaps with the most spec-consistent
default and log it in QUESTIONS.md.

## Stack & commands
TypeScript + Vite + canvas, Vitest, zod, all tuning in `/data/*.json`, Node 22+.
- `npm run dev` · `npm test` · `npm run build`
- `npm run sim -- --seed 1 --policy hybrid` — headless run report
- `npx tsx tools/sweep.ts --seeds 12 --policies maxbuild,hybrid` — balance sweep
- `npx tsx tools/handoff-metrics.ts` — regenerate HANDOFF measured sections

## Architecture rules (hard)
1. `/src/sim`: no DOM, no `Math.random`, no `Date.now`, no native trig. Fixed 60 Hz.
2. Named RNG streams; runs reproducible from seed + input log; end-state hash tested.
3. Renderer reads sim state only. All player actions (including class actives) are
   sim Commands so bots and replays can use them.
4. New mechanics are expressed as data shapes in `/data` wherever possible
   (HANDOFF's structural note); engine work stays generic. SPEC-FINAL states it as a
   rule: all content and numbers live in `/data/*.json`, never in code.

## Working rules
1. Work SPEC-FINAL §15's **P0→P10** build order in order; a band is done only when
   the gates §15 names for it are green. Within a band, work from BACKLOG.md, whose
   ids are `p<band><letter>`.
2. `npm test` after every meaningful change; commit at every green stable point and
   every milestone (`M<n>: <summary>` or `<type>: <summary>`).
3. Confirmed bugs get a failing regression test **before** the fix.
4. Update PROGRESS.md at every milestone gate and before any stop. Update BACKLOG.md
   as items complete. Append design decisions to QUESTIONS.md.
5. Never stop to ask a design question; choose, log, continue.
6. Stuck ~5 distinct attempts on one failure: `.skip` + TODO + Known-issues entry,
   move on. Never delete a test to go green.
7. Touch nothing outside this repository.

## Subagent protocol
Use the project subagents in `.claude/agents/`:
- After implementing any feature: delegate a review to **code-reviewer**; address
  Critical/Major findings before commit.
- Before marking any backlog item done: delegate verification to **qa-playtester**;
  it must confirm the item's acceptance criteria and file repro reports for what it
  breaks. A QA-filed bug becomes a new backlog item with a regression test.
- For tuning-only items: delegate to **balance-analyst**; it edits `/data` only and
  must report gate deltas.

## BACKLOG protocol (self-directed refinement)
BACKLOG.md is an ordered list. Item format:
`- [ ] (id) [feat|bug|balance|polish] title — acceptance: <objective check> — refs: <spec §>`

**Loop-mode contract:** when invoked with the one-item instruction, execute exactly
one item end-to-end (implement → tests green → QA subagent pass → commit → update
PROGRESS/BACKLOG), then stop. Prefer the top item; skip only with a logged reason.

**Generation rule:** if fewer than 3 actionable items remain, generate before
executing: (a) run the sweep + handoff-metrics and diff against every §14 gate
(G1–G20) and the current QUALITY.md stage; (b) diff SPEC-FINAL coverage against the
code (any § not fully implemented → items); (c) add one engineer's-judgment improvement in the
spirit of HANDOFF §7 (depth, not scope creep). Append exactly 5 items with concrete
acceptance criteria, ordered by value, then execute the top one. Never invent new
game systems that are in no spec — propose those in QUESTIONS.md instead.

## Definition of "1.0 complete"
P0–P10 done, **all twenty §14 gates G1–G20 green**, §13's content totals met
(11 classes · 10 towers · 12+ equipment · 6 damage types + 2 statuses · 20 enemies ·
18+6 waves · 120-node tree · 8–12 quests · T1–T5 · 2 bosses · the §6.3 upgrade pool ·
Codex & Tuner), QUALITY.md Alpha bar fully green, HANDOFF.md regenerated at the final
commit.

Owner review is still open on §17's list — the nine filled classes, the seven filled
towers, the VS upgrade pool, Burning stack timing, the −100 armor floor, the 75 s VS
wave, and the quest list. Any of those may be vetoed by an inbox verdict; build them
as specced until one arrives.
