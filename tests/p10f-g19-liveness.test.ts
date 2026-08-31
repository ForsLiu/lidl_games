/**
 * Gate G19's liveness clause (SPEC-FINAL §14, measured at p10f): "winning sim
 * builds include both sealed and open strategies, and multi-summon usage."
 *
 * Measured over the same pool G13 uses — `tools/a5probe.ts`'s `topTen`
 * (the ten best-surviving builds among those that banked all 18 TD waves) —
 * widened with `G19_BUILDS`, the strategy dimension `BUILDS` alone never
 * exercises: every `BUILDS` entry is an open-maze `BuilderPolicy` (no
 * `allowSeal`, no real wave-stacking), so `topTen(collect(seeds))` alone can
 * only ever answer "open" regardless of what the gate asks. `G19_BUILDS`
 * mirrors the registered `sealed` bot policy (`src/bots/policies.ts`,
 * G7/p1b) for the sealed arm, and adds a new `stackWaves` builder option for
 * the multi-summon arm — `rushWaves` (the `kite`/`rush` policies already use)
 * turned out to be a false cover: `applyCommand`'s `call` case only
 * increments `World.stackDepth` from `act1_wave` (already fighting), not
 * `act1_build`, so no registered policy before this item ever actually
 * stacked a wave in play; `tests/p3b-multi-summon.test.ts` covers G6's half
 * of the mechanism directly through `applyCommand`, never through a bot.
 * `stackWaves` is a distinct option (default off) so `kite`/`rush`'s
 * existing numbers, pinned by other gates, are untouched.
 *
 * Both new strategies are real, adversarial plays, not test-only stubs:
 * `sealed-full` finishes every TD wave with a completed perimeter ring (§10,
 * enemies breach and chew rather than being walled out), and `stacked-mix`/
 * `stacked-frost` genuinely merge extra TD waves into fights already in
 * progress once enough structures are up — `BuildResult.maxStackDepth` is
 * sampled from the real `World.stackDepth` every tick of the run, not
 * inferred from the bot's config.
 */
import { describe, expect, it } from 'vitest';

import { BUILDS, G19_BUILDS, collect, topTen } from '../tools/a5probe';

const SEEDS = [1, 2, 3, 4, 5];

describe('G19 liveness: sealed, open and multi-summon strategies all win', () => {
  const pool = [...BUILDS, ...G19_BUILDS];
  const results = collect(SEEDS, pool);
  const top = topTen(results);
  const readable = top.map((r) => `${r.name}(${r.strategy}) seed${r.seed} surv=${r.survival.toFixed(0)}`).join(', ');

  it('has both strategy dimensions represented in the raw build pool', () => {
    expect(BUILDS.every((b) => (b.strategy ?? 'open') === 'open')).toBe(true);
    expect(G19_BUILDS.some((b) => b.strategy === 'sealed')).toBe(true);
    expect(G19_BUILDS.some((b) => b.strategy === 'rush')).toBe(true);
  });

  it('enough of the widened pool banks all 18 TD waves to measure', () => {
    expect(top.length, readable).toBeGreaterThanOrEqual(4);
  });

  it('the winning-build pool includes an open-strategy build', () => {
    expect(top.some((r) => r.strategy === 'open'), readable).toBe(true);
  });

  it('the winning-build pool includes a sealed-strategy build', () => {
    expect(top.some((r) => r.strategy === 'sealed'), readable).toBe(true);
  });

  it('the winning-build pool includes a build that actually used multi-summon (World.stackDepth > 0 during play)', () => {
    const stacked = top.filter((r) => r.strategy === 'rush' && r.maxStackDepth > 0);
    expect(stacked.length, readable).toBeGreaterThanOrEqual(1);
  });
});
