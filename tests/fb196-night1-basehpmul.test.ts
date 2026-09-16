/**
 * BACKLOG fb196: `tests/p6e-class-diversity.test.ts` measured nearly the
 * entire 12-class roster losing to the *first* VS block (TD wave 3 / Night
 * 1, `defeat_warden`) on HEAD (`e9ec061`) and named PR #55 (`532d4d9`) as
 * the prime suspect for a *new* regression, asking for a real bisection
 * rather than another guess.
 *
 * **Bisected. It is not a new regression.** Git-worktree control runs of
 * the same scripted-kit harness (`runClassScripted`'s own shape) at five
 * points on master's first-parent history — `9b7911c` (2026-09-07 04:58
 * UTC-4, PR #40), `53f58ab` (2026-09-07 05:21 UTC-4, PR #41's own merge
 * commit — **correction**: an earlier version of this comment claimed p12a-c
 * "actually landed" in PR #41; that PR's own squashed items (fb139/fb079/
 * fb080/fb082/fb083) have nothing to do with p12a-c, and this file does not
 * claim to know which PR does — the point below holds regardless), `1a5912c`
 * (immediately before PR #55/`532d4d9`), `532d4d9` itself (after PR #55's
 * full retune, p12j included), and HEAD (after BACKLOG-CONTENT c004) —
 * reproduce byte-identical `defeat_warden`@wave-3 outcomes and
 * `survivalSeconds` for swordsman/pyromancer seed 1 at every single point
 * (seeds 2-3 were also spot-checked the same way, via a throwaway `tools/`
 * probe deleted after use, same precedent as fb177/p12h; only seed 1 per
 * class is pinned by the committed test below). Nothing in PR #55's diff,
 * `warden_eater`'s HP re-anchor (p12e), or `kitBuildMul`'s VS gating (p12f)
 * moves this number at all — all three are exonerated as fb196's cause.
 *
 * **The real, already-diagnosed mechanism** is `tests/p6e-class-diversity.
 * test.ts`'s own fb177 write-up (landed inside PR #55, predating fb196):
 * `baseHpMul` (`data/enemies.json`, shipped 20 since p12c, unchanged since
 * before this file's earliest control point) applies at the single
 * `makeEnemy` choke point to *every* enemy, VS-only Night-1 fodder
 * included, stacking with the VS-only `hpOverlay`/`actIICarry` overlay —
 * landing on the block with the least built economy of the whole run.
 * `classBasicAttack` is TD-only (`src/sim/run.ts`, `if (!w.huntsWarden)`),
 * so a class's kit Actives are its *entire* VS damage contribution
 * regardless of its basic-attack strength — the 20x-tougher mob simply
 * doesn't thin fast enough, and a short-range class gets swarmed.
 *
 * This file used to pin that mechanism directly with a control pair (same
 * seed, same class, same everything except `baseHpMul`) for swordsman and
 * pyromancer seed 1. **fb197 (2026-09-16) retired that pair**: fb153b's
 * gate-position fix alone flips both classes to a full `victory` at seed 1
 * regardless of `baseHpMul`, so the pair no longer demonstrates anything —
 * see the comment above `describe`'s remaining test for the fresh numbers
 * and the retirement rationale.
 */
import { describe, expect, it } from 'vitest';

import { loadContent } from '../src/sim/content';

describe('fb196: baseHpMul, not PR #55, drives the Night-1 defeat_warden collapse', () => {
  const shipped = loadContent();

  it('is authored at the value this control pair depends on', () => {
    expect(shipped.enemies.baseHpMul).toBe(20);
  });

  // fb197 (2026-09-16): fb153b's `GATES.east` fix (`src/sim/grid.ts` —
  // corrected a stale 36x20-era `{tx:35,ty:17}`, an interior tile at the
  // shipped 56x32 grid, back to a real gate) changes real spawn-to-Core
  // travel distance at Night-1 for every seed, including seed 1 here — and
  // it turned out to fully retire this control pair's premise, not just
  // shift its numbers. Fresh measurement (this item, real run, not the
  // earlier "measured post-fix" guess logged when fb197 was filed, which
  // claimed pyromancer -> `defeat_core`): **both classes now clear the
  // entire run (`victory`, 18/18 waves) at `baseHpMul` 20, and also at
  // `baseHpMul` 1** — `{outcome:"victory",wavesCleared:18,survivalSeconds:
  // 592.32}` (swordsman) / `{outcome:"victory",wavesCleared:18,
  // survivalSeconds:595.77}` (pyromancer) at baseHpMul 20;
  // `{outcome:"victory",wavesCleared:18,survivalSeconds:562.25}` /
  // `{outcome:"victory",wavesCleared:18,survivalSeconds:571.67}` at
  // baseHpMul 1. The corrected gate position alone was enough to clear
  // seed 1's first VS block for both classes regardless of `baseHpMul`, so
  // there is no longer a `baseHpMul`-attributable outcome difference left
  // to pin at this seed/class pair — per fb197's own acceptance text
  // ("deleted in favor of a mechanism that still demonstrates baseHpMul's
  // effect, if the corrected gate position changes the control pair's own
  // premise"), the two assertions are retired rather than re-pinned to a
  // pair of `victory`/`victory` checks that would no longer demonstrate
  // anything. `baseHpMul`'s Night-1 mechanism itself is untouched by this
  // finding (`shipped.enemies.baseHpMul` is still pinned at 20 above) —
  // only this specific seed-1 two-class control pair stopped being able to
  // show it. A fresh full roster sweep against the corrected gate position
  // (BACKLOG fb197) is the source of truth for which classes, if any, still
  // fail Night-1 post-fix.
});
