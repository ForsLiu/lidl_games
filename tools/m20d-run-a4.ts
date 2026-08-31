/** One tower, both A4 clauses, in a fresh process (content loads once). */
export {}; // Makes this a module so top-level `await` below is legal (no other import/export remains).

try {
  // Dynamic, not static: a static `import ... from './a4probe'` pulls in
  // that file's own static chain (`../src/sim/run` -> `./world` ->
  // `./content`, which statically imports every `/data/*.json`) at
  // module-transform time, before this `try` itself starts running — a JSON
  // *syntax* error in `/data` fails there, invisible to any try/catch in
  // this file (q46's finding). A dynamic `import()` made from inside this
  // already-running `try` defers that same transform to here, turning the
  // failure into an ordinary rejected promise this `catch` can see — the
  // same workaround q38/q48 applied to `content-census.ts`/`probe-boss.ts`
  // (BACKLOG-QUALITY q48's table; applied here at b045).
  const { SOUL_TOWERS, T3_MODS, runSingleType } = await import('./a4probe');
  const key = process.argv[2] ?? 'venom_spore';
  if (!SOUL_TOWERS.includes(key)) throw new Error(`not a soul tower: ${key}`);
  const seeds = [1, 2, 3, 4, 5];
  const t1 = seeds.map((s) => runSingleType(key, 1, s, []).waves);
  const t3 = seeds.map((s) => runSingleType(key, 3, s, T3_MODS).waves);
  // Stale threshold pending p8a ("wave data on the §1.1 shape"): `runSingleType`
  // now runs SPEC-FINAL §1.1's real 18-TD-wave shape (`cycles: 6`), not the old
  // 10-wave Act I — see tests/a4-single-type.test.ts's doc comment and Q109.
  const clears = (a: number[]) => a.filter((w) => w >= 18).length;
  console.log(`T1 ${clears(t1)}/5 [${t1}]  T3 ${clears(t3)}/5 [${t3}]`);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`m20d-run-a4: ${message.replace(/\s+/g, ' ').trim()}`);
  process.exitCode = 1;
}
