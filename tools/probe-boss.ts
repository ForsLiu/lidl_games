import { cfg, runWithPolicy } from '../tests/helpers';

try {
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
  let wins = 0;
  for (const seed of seeds) {
    const { report } = runWithPolicy(cfg({ seed }), 'maxbuild');
    if (report.bossKilled) wins++;
    console.log(
      `seed=${seed} bossKilled=${report.bossKilled} outcome=${report.outcome} bossKillSeconds=${report.bossKillSeconds ?? '-'}`,
    );
  }
  console.log(`wins=${wins}/${seeds.length}`);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`probe-boss: ${message.replace(/\s+/g, ' ').trim()}`);
  process.exitCode = 1;
}
