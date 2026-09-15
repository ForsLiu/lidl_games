/**
 * BACKLOG fb196: `tests/p6e-class-diversity.test.ts` measured nearly the
 * entire 12-class roster losing to the *first* VS block (TD wave 3 / Night
 * 1, `defeat_warden`) on HEAD (`e9ec061`) and named PR #55 (`532d4d9`) as
 * the prime suspect for a *new* regression, asking for a real bisection
 * rather than another guess.
 *
 * **Bisected. It is not a new regression.** Git-worktree control runs of
 * the same scripted-kit harness (`runClassScripted`'s own shape) at five
 * points — `9b7911c` (2026-09-07, before the entire p12a-p12j BALANCE
 * DIRECTION v2 arc even starts), `53f58ab` (immediately before that arc's
 * PR #41), `1a5912c` (immediately before PR #55/`532d4d9`), `532d4d9`
 * itself (after PR #55's full retune, p12j included), and HEAD (after
 * BACKLOG-CONTENT c004) — reproduce byte-identical `defeat_warden`@wave-3
 * outcomes and `survivalSeconds` for swordsman/pyromancer seeds 1-3 at
 * every single point. Nothing in PR #55's diff, `warden_eater`'s HP
 * re-anchor (p12e), or `kitBuildMul`'s VS gating (p12f) moves this number
 * at all — all three are exonerated as fb196's cause.
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
 * This test pins that mechanism directly with a control pair: the same
 * seed, same class, same everything except `baseHpMul`, so the outcome
 * flip is attributable to the one lever named above rather than inferred
 * from correlation across commits.
 */
import { describe, expect, it } from 'vitest';

import '../src/bots';
import { makePolicy } from '../src/bots';
import { loadContent, type Content } from '../src/sim/content';
import { allTreeNodeIds } from '../src/meta/meta';
import { Run } from '../src/sim/run';
import type { RunConfig, RunReport } from '../src/sim/types';
import { GATE_TIER, buyCoreUpgrades, scriptClassKit } from './helpers';

/**
 * `helpers.ts`'s own `runScripted` always loads the real `/data` content
 * (`Run`'s own default parameter), so it cannot run a control pair against
 * an overridden `baseHpMul`. Same loop, `content` threaded through instead.
 */
function runScriptedWithContent(config: RunConfig, content: Content, maxTicks = 60 * 60 * 120): RunReport {
  const runCfg = { ...config, policy: 'hybrid' };
  const run = new Run(runCfg, content);
  const policy = makePolicy('hybrid');
  const w = run.world;
  while (!run.done && w.tick < maxTicks) {
    const input = policy.act(w);
    if (w.phase === 'act1_build' || w.phase === 'act1_wave' || w.phase === 'act2') {
      scriptClassKit(w, input);
    }
    buyCoreUpgrades(w, input);
    run.step(input);
  }
  return run.report();
}

describe('fb196: baseHpMul, not PR #55, drives the Night-1 defeat_warden collapse', () => {
  const shipped = loadContent();
  const FULL_TREE = allTreeNodeIds(shipped);
  const rawEnemies = shipped.raw.enemies as Record<string, unknown>;
  // The identity value: every other enemy-facing scalar (`hpOverlay`,
  // `actIICarry`, the tier ladder) stays exactly as shipped — only the one
  // lever fb177 named changes.
  const neutral = loadContent({ enemies: { ...rawEnemies, baseHpMul: 1 } });

  it('is authored at the value this control pair depends on', () => {
    expect(shipped.enemies.baseHpMul).toBe(20);
  });

  it('swordsman seed 1 (T3, scripted kit bot) loses to the first VS block at baseHpMul 20, and does not at baseHpMul 1', () => {
    const config: RunConfig = { seed: 1, classKey: 'swordsman', tier: GATE_TIER, modifiers: [], allocated: FULL_TREE, policy: 'hybrid', cycles: 6 };

    const withShipped = runScriptedWithContent(config, shipped);
    expect(withShipped.outcome).toBe('defeat_warden');
    expect(withShipped.wavesCleared).toBe(3);

    const withNeutral = runScriptedWithContent(config, neutral);
    expect(withNeutral.outcome).not.toBe('defeat_warden');
  }, 60_000);

  it('pyromancer seed 1 (T3, scripted kit bot) loses to the first VS block at baseHpMul 20, and does not at baseHpMul 1', () => {
    const config: RunConfig = { seed: 1, classKey: 'pyromancer', tier: GATE_TIER, modifiers: [], allocated: FULL_TREE, policy: 'hybrid', cycles: 6 };

    const withShipped = runScriptedWithContent(config, shipped);
    expect(withShipped.outcome).toBe('defeat_warden');
    expect(withShipped.wavesCleared).toBe(3);

    const withNeutral = runScriptedWithContent(config, neutral);
    expect(withNeutral.outcome).not.toBe('defeat_warden');
  }, 60_000);
});
