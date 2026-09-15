/**
 * fb196 (BACKLOG.md, SPEC-FINAL §14 G8): control-run pins for the root cause
 * behind `tests/p6e-class-diversity.test.ts` reading near-total-roster-red
 * ("most classes report `defeat_warden`@w3, the first VS/Night block").
 *
 * **What this is not.** The BACKLOG item's own working theory named PR #55
 * (`532d4d9`, merged 2026-09-14) as the prime suspect. A real bisection
 * disproves that: a `git worktree` control run of `archer` seed 1 at
 * `1a5912c` (master's tip immediately *before* PR #55's squash-merge) and at
 * current HEAD is **identical on every measured field** — same outcome
 * (`defeat_warden`), same wave (3), same `coreHp` (29.16/110 on both sides),
 * `survivalSeconds` within sub-tick noise (30.27 vs 30.25), same kill
 * count. Archer's own `data/classes.json` row is untouched by PR #55 (the
 * merge's diff for it is purely the two inert `maxHpMul: 1.0`/
 * `defenseBonus: 0` fields p13a added later, plus JSON reformatting) — there
 * is no lever PR #55 could have pulled to move this seed's outcome, and the
 * control run confirms it didn't.
 *
 * **The actual mechanism.** `data/enemies.json`'s `baseHpMul: 20` (p12c,
 * 2026-09-07, already on master before PR #55 ever branched) applies to
 * every non-final-boss enemy regardless of tier or wave — including the
 * very first VS/Night block (`cycleWaveEnd` splits 18 TD waves across 6 VS
 * blocks, 3 TD waves each, so "wave 3" is Night 1, not an Act I death;
 * `tests/p6e-class-diversity.test.ts`'s header narrates the same mechanism
 * for `swordsman`). Night 1 has the least-built economy of the run and
 * `classBasicAttack` is TD-only (`run.ts`) — during VS a class's kit Actives
 * are the *entire* damage contribution — so a 20x roster-wide enemy HP
 * multiplier lands hardest exactly where the kit has the least time to have
 * scaled up (`kitPowerMul` is `wavesCleared`-driven, near 1x at wave 3).
 *
 * **Why this file exists rather than just re-pinning the parent file's own
 * numbers.** `tests/p6e-class-diversity.test.ts`'s own trailing comments
 * record archer/pyromancer/stormcaller/plaguebringer as "in band" (5-6/12)
 * after the p12j retune. None of the four reproduce: a fresh 12-seed sweep
 * at current HEAD (this session, control run, not carried from an old
 * measurement per CLAUDE.md's measurement rules) measures archer 0/12,
 * pyromancer 0/12, stormcaller 0/12, plaguebringer 0/12 — and the *same*
 * 0/12 reproduces at `1a5912c` for archer (the only one with byte-identical
 * `/data` on both sides of PR #55, since the other three's kit magnitudes
 * did change in the merge). PR #55 was squash-merged from a long-lived
 * branch (its own commit message: "reconciling independent Q192-Q196
 * numbering with master's own") — squash-merging destroys the intermediate
 * commits `p12j`'s own numbers were presumably measured against, so there is
 * no reachable commit left to bisect the *other* three classes' claimed
 * numbers against. The documented 5-6/12 figures for archer/pyromancer/
 * stormcaller/plaguebringer cannot be reproduced from any commit in current
 * history and should be read as unreliable until a fresh balance-analyst
 * pass re-earns them (BACKLOG fb196 follow-up), not as a regression this
 * item introduced.
 *
 * This file pins the one fully-isolated control pair (archer seed 1, data
 * untouched by PR #55) so a future change to `baseHpMul`, the tier ladder, or
 * the Night-1 mechanism shows up here first, cheaply (one seed, no `beforeAll`
 * sweep) — `tests/p6e-class-diversity.test.ts`'s full re-measurement is
 * `[balance]`-tier work (CLAUDE.md rule 8) reserved for its own item.
 */
import { describe, expect, it } from 'vitest';

import '../src/bots';
import { loadContent } from '../src/sim/content';
import { allTreeNodeIds } from '../src/meta/meta';
import type { RunConfig } from '../src/sim/types';
import { cfg, GATE_TIER, runScripted } from './helpers';

const content = loadContent();
const FULL_TREE = allTreeNodeIds(content);

function runClassScripted(classKey: string, seed: number) {
  const config: RunConfig = cfg({
    seed,
    classKey,
    tier: GATE_TIER,
    modifiers: [],
    allocated: FULL_TREE,
    cycles: 6,
    policy: 'hybrid',
  });
  return runScripted(config, 'hybrid', 60 * 60 * 120).report;
}

describe('fb196: Night-1 (first VS block) baseline is enemy-HP-mul driven, not PR #55', () => {
  it('archer seed 1 dies to the Warden in the first VS block (wave 3), same as at the pre-PR-#55 control commit', () => {
    const report = runClassScripted('archer', 1);
    expect(report.outcome).toBe('defeat_warden');
    expect(report.wavesCleared).toBe(3);
    expect(report.vsWavesCleared).toBe(0);
    // Pinned from the git-worktree control run at 1a5912c (pre-PR-#55):
    // coreHp 29.16/110 there vs the value asserted here at HEAD — proving
    // this seed's outcome did not move across the merge.
    expect(report.coreHp).toBeCloseTo(29.16, 1);
    expect(report.coreMaxHp).toBe(110);
  });
});
