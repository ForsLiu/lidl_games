# CLAUDE.md — Stonewake standing orders (v2)

## Sources of truth, in order
1. **SPEC-V2.md** — current design (overrides SPEC.md where they conflict)
2. **SPEC.md** — base design v0.1
3. **QUALITY.md** — definition of done per stage (read-only for you; propose changes
   via QUESTIONS.md)
4. **HANDOFF.md** — engineering state report; regenerate its measured sections with
   the tools it lists after every completed milestone
Do not redesign what these define. Fill genuine gaps with the most spec-consistent
default and log it in QUESTIONS.md.

## Stack & commands (unchanged from v1)
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
   (HANDOFF's structural note); engine work stays generic.

## Working rules
1. Milestones **M9→M16** (SPEC-V2 §12) in order; a milestone is done only when its
   gates are green. Within a milestone, work from BACKLOG.md.
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
executing: (a) run the sweep + handoff-metrics and diff against every A/B gate and
the current QUALITY.md stage; (b) diff SPEC-V2 coverage against the code (any §
not fully implemented → items); (c) add one engineer's-judgment improvement in the
spirit of HANDOFF §7 (depth, not scope creep). Append exactly 5 items with concrete
acceptance criteria, ordered by value, then execute the top one. Never invent new
game systems that are in no spec — propose those in QUESTIONS.md instead.

## Definition of "v0.2 complete"
M9–M16 done, all A- and B-gates green, QUALITY.md Alpha bar fully green, HANDOFF.md
regenerated at the final commit.
