# CLAUDE.md — Stonewake standing orders (v3, SPEC-FINAL)

## Sources of truth, in order
1. **SPEC-FINAL.md** — the complete design, v1.0. Self-contained; **it supersedes
   SPEC-V3.md, SPEC-V2.md and SPEC.md**, which are kept only as history. Do not
   cite them as authority and do not implement from them. Its §14 gates
   **G1–G20** replace every prior A/B/C gate list, and its §15 **P0–P10** build
   order is the backlog's order. Where a prior spec and SPEC-FINAL disagree,
   SPEC-FINAL wins and the disagreement is logged in QUESTIONS.md.
2. **MIGRATION.md** — the audit of this codebase against SPEC-FINAL: what is
   kept, what is superseded, what *contradicts* the spec, and which tests are
   retired and why (§8 is the SPEC-FINAL reconcile). Read it before touching
   anything in P0–P10.
3. **QUALITY.md** — definition of done per stage (read-only for you; propose
   changes via QUESTIONS.md).
4. **HANDOFF.md** — engineering state report; regenerate its measured sections
   with the tools it lists after every completed phase. **Currently stale since
   m20a** — treat its tower section as history until `p10f` regenerates it.
5. **SPEC-V3.md**, **SPEC-V2.md**, **SPEC.md** — superseded. Consult them only to
   understand why existing code looks the way it does, never as authority.

Do not redesign what these define. SPEC-FINAL marks its own open ends: **⚖** =
tune against §14's gates, **[designer-fill]** = a section the owner may veto via
an inbox verdict. Fill any genuine remaining gap with the most spec-consistent
default and log it in QUESTIONS.md.

## Stack & commands
TypeScript + Vite + canvas, Vitest, zod, all tuning in `/data/*.json`, Node 22+.
- `npm run dev` · `npm test` · `npm run build`
- `npm run test:fast` — fast tier (<5 min): the full suite minus every file in
  `vitest.fast.config.ts`'s exclude list (the >60 s sim/soak/fuzz suites)
- `npm run sim -- --seed 1 --policy hybrid` — headless run report
- `npx tsx tools/sweep.ts --seeds 12 --policies maxbuild,hybrid` — balance sweep
- `npx tsx tools/handoff-metrics.ts` — regenerate HANDOFF measured sections
- `npm run status` — regenerate STATUS.md (gate table, balance snapshot,
  content census, feedback ledger, pending QUESTIONS); run it at every phase
  completion and every ~20 backlog items, per BACKLOG fb038

The FULL `npm test` takes 40+ minutes on this host; `npm run test:fast` is the
per-item tier. A suite that grows past ~60 s moves to the fast config's exclude
list (with a comment naming why) rather than silently fattening the fast tier.

## Architecture rules (hard) — SPEC-FINAL §12
1. `/src/sim`: no DOM, no `Math.random`, no `Date.now`, no native trig. Fixed 60 Hz.
2. Named RNG streams; runs reproducible from seed + input log; end-state hash
   tested. A run is `RunConfig` + input log, and `RunConfig` carries a content
   hash so a replay against edited `/data` fails loudly (P0).
3. Renderer reads sim state only. All player actions (including class actives)
   are sim Commands so bots and replays can use them.
4. New mechanics are expressed as data shapes in `/data` wherever possible;
   engine work stays generic. SPEC-FINAL states it as a rule: all content and
   numbers live in `/data/*.json`, never in code. A loader rule that refuses
   unpayable data is worth more than a comment saying the data must be valid.

## Working rules
1. Phases **P0 → P10** (SPEC-FINAL §15) in order; a phase is done only when the
   §14 gates it names are green. Within a phase, work from BACKLOG.md, whose ids
   are `p<band><letter>`.
2. Verify every meaningful change with the item's targeted tests plus
   `npm run test:fast`; commit at every green stable point and every phase
   (`P<n> <id>: <summary>` or `<type>: <summary>`). The FULL `npm test` runs
   only at phase (P) completion, at lane merges, and before DONE.md — never
   start a full-suite background run inside an ordinary item.
3. Confirmed bugs get a failing regression test **before** the fix. Code that
   contradicts SPEC-FINAL is a bug, not a gap, and outranks the queue.
4. Update PROGRESS.md at every phase gate and before any stop. Update BACKLOG.md
   as items complete. Append design decisions to QUESTIONS.md.
5. Never stop to ask a design question; choose, log, continue.
6. Stuck ~5 distinct attempts on one failure: `.skip` + TODO + Known-issues
   entry, move on. Never delete a test to go green.
7. Touch nothing outside this repository.

## Measurement rules (earned the hard way — Q74, Q78, Q80, and MIGRATION §8.4.1)
- **A deferral is a measurement with an expiry date.** Re-measure a deferred
  assertion before inheriting it; two of m20a's five were already green.
- **"My change improved X" needs the control run**, not the plausible story.
- **A median over 12 seeds and a pass/fail over 8 are samples**, not evidence
  about a mechanism, until the mechanism is what varies. §14 says means and
  pass-rates, never medians.
- **Check a `/data` row's blast radius before calling it narrow.** A cap change
  argued to touch one tower has turned a gate red through a bot that never
  builds it.
- **When a field's range changes, grep its readers, not just its writers.**

## Subagent protocol
Use the project subagents in `.claude/agents/`. Verification is tiered by what
an item touches (owner feedback `feature-tiered-qa`, 2026-09-04):
- **Light tier** — items typed `[polish]`, `[ui]`, `[docs]`, or a data-only
  change that isn't a balance value: targeted tests + `npm run test:fast` +
  **code-reviewer** only.
- **Full tier** — everything else, including anything touching `/src/sim`,
  `/data` balance values, pathing, or damage rules: **code-reviewer** (address
  Critical/Major findings before commit) **and qa-playtester** (must confirm
  the item's acceptance criteria and file repro reports for what it breaks —
  a QA-filed bug becomes a new backlog item with a regression test).
- Bugs always get a failing regression test before the fix, regardless of tier
  (working rule 3).
- For tuning-only items: delegate to **balance-analyst**; it edits `/data` only
  and must report gate deltas.

## BACKLOG protocol (self-directed refinement)
BACKLOG.md is an ordered list. Item format:
`- [ ] (id) [feat|bug|balance|polish] title — acceptance: <objective check> — refs: <spec §>`

**Loop-mode contract:** when invoked with the one-item instruction, execute
exactly one item end-to-end (implement → targeted tests + `npm run test:fast`
green → QA subagent pass → commit → update PROGRESS/BACKLOG), then stop. Prefer
the top item; skip only with a logged reason. Per-item verification is targeted
tests + `test:fast` — the FULL `npm test` is reserved for phase (P) completion,
lane merges, and before DONE.md, and is never started as a background run
inside an ordinary item.

**Lanes (parallel work split, 2026-09-03):** BACKLOG.md is the main lane and
keeps everything touching shared sim core (balance orders, dash, density,
pathing, damage rules). Three lane files carry items that fit entirely inside
a hard Scope, ids unchanged:
- **BACKLOG-CONTENT.md** — branch `lane/content`: new classes (Madness King,
  Voltbolt, any class kits/tuning), class equipment sets, Codex/data entries
  for them.
- **BACKLOG-TERRAIN.md** — branch `lane/terrain`: the terrain-generation epic
  and Core placement.
- **BACKLOG-UI.md** — branch `lane/ui`: class-select redesign, HUD/bottom-bar
  changes, panels, sprites/VFX, overlay layout, DoT numbers display.

Each lane file's Scope section is a hard boundary: create/edit only its
allowed paths, read-only everywhere else; an out-of-scope need goes into that
lane file's Log and becomes main-lane (or other-lane) work at the merge. Lane
loops may execute up to TWO items per iteration when both are small ([bug]/
[polish] or data-only); otherwise the one-item loop contract applies
unchanged. New items generated inside a lane must fit its Scope or be filed
in its Log for BACKLOG.md.

**Generation rule:** if fewer than 3 actionable items remain, generate before
executing: (a) run the sweep + handoff-metrics and diff against every §14 gate
G1–G20 and the current QUALITY.md stage; (b) diff SPEC-FINAL coverage against
the code (any § not fully implemented → items); (c) add one engineer's-judgment
improvement in the spirit of HANDOFF §7 (depth, not scope creep). Append exactly
5 items with concrete acceptance criteria, ordered by value, then execute the
top one. Never invent new game systems that are in no spec — propose those in
QUESTIONS.md instead.

## Definition of "1.0 complete" (SPEC-FINAL §15 P10)
P0–P10 done, **all twenty §14 gates G1–G20 green**, §13's content totals met
(12 classes · 10 towers · 12+ equipment · 6 damage types + 2 statuses · 20 enemies
· 18+6 waves · 120-node tree · 8–12 quests · T1–T5 · 2 bosses · the §6.3 upgrade
pool · Codex & Tuner), QUALITY.md's bar fully green, HANDOFF.md regenerated at the
final commit.

Owner review is still open on §17's list — the nine filled classes, the seven
filled towers, the VS upgrade pool, Burning stack timing, the −100 armor floor,
the 75 s VS wave, and the quest list. Any of those may be vetoed by an inbox
verdict; build them as specced until one arrives.
