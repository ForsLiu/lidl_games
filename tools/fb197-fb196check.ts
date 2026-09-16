import '../src/bots';
import { makePolicy } from '../src/bots';
import { loadContent, type Content } from '../src/sim/content';
import { allTreeNodeIds } from '../src/meta/meta';
import { Run } from '../src/sim/run';
import type { RunConfig, RunReport } from '../src/sim/types';
import { GATE_TIER, buyCoreUpgrades, scriptClassKit } from '../tests/helpers';

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

const shipped = loadContent();
const FULL_TREE = allTreeNodeIds(shipped);
const rawEnemies = shipped.raw.enemies as Record<string, unknown>;
const neutral = loadContent({ enemies: { ...rawEnemies, baseHpMul: 1 } });

for (const classKey of ['swordsman', 'pyromancer']) {
  const config: RunConfig = { seed: 1, classKey, tier: GATE_TIER, modifiers: [], allocated: FULL_TREE, policy: 'hybrid', cycles: 6 };
  const withShipped = runScriptedWithContent(config, shipped);
  const withNeutral = runScriptedWithContent(config, neutral);
  console.log(classKey, 'shipped:', withShipped.outcome, 'w'+withShipped.wavesCleared, '| neutral:', withNeutral.outcome, 'w'+withNeutral.wavesCleared);
}
