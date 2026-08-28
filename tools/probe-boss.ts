export {}; // Makes this a module so top-level `await` below is legal (no other import/export remains).

try {
  // Dynamic, not static: a static `import ... from '../tests/helpers'` pulls
  // in that file's own static chain (`../src/sim/run` -> `./world` ->
  // `./content`, which statically imports every `/data/*.json`) at
  // module-transform time, before this `try` itself starts running — a
  // JSON *syntax* error in `/data` fails there, invisible to any try/catch
  // in this file (q46's finding). A dynamic `import()` made from inside
  // this already-running `try` defers that same transform to here, turning
  // the failure into an ordinary rejected promise this `catch` can see —
  // the same workaround q38 applied to `content-census.ts` (BACKLOG-QUALITY q48).
  const { cfg, runWithPolicy } = await import('../tests/helpers');
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
