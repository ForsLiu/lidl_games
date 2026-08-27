/**
 * q44 diagnostic — instruments `probeInWorker` (tools/fuzz-command-domain.ts)
 * to answer the question the queue item asks rather than pattern-matching to
 * six prior sessions' "just contention" note: when the census's worker-spawn
 * timeout fires under full-suite load, is the underlying worker actually
 * stuck (a leak — it would never answer), or just slow (contention — it
 * answers late, and a bigger budget would have caught it)?
 *
 * Method: run every FIELD_SPECS x FAMILIES combo (the same 60 `probeInWorker`
 * calls `runCensus` makes, same concurrency) but with a *generous* ceiling
 * (default 25000ms, vs the shipped 4000ms) and log wall-clock elapsed time
 * for every call, not just whether it beat the ceiling. If calls exceed
 * 4000ms but still resolve well under the generous ceiling, that is direct
 * evidence of contention (the worker was doing real work, just slowly), not
 * a leak. If any call still fails to resolve even at the generous ceiling,
 * that is evidence worth escalating to a real bug report.
 *
 * Usage:
 *   npx tsx bench/q44-worker-timing-probe.ts [label] [ceilingMs] [concurrency] [rounds]
 *
 * Run once standalone (baseline) and once with a real `npx vitest run`
 * going in the background for genuine contention (this lane's established
 * method — see BACKLOG-QUALITY.md session 8's perf-ratio note: a real
 * concurrent vitest run is realistic load and cleans itself up; synthetic
 * busy-loops do not).
 */
import { FAMILIES, FIELD_SPECS, probeInWorker } from '../tools/fuzz-command-domain';

const label = process.argv[2] ?? 'run';
const ceilingMs = Number(process.argv[3] ?? 25000);
const concurrency = Number(process.argv[4] ?? 6);
const rounds = Number(process.argv[5] ?? 1);

interface Sample {
  fieldKey: string;
  family: string;
  round: number;
  elapsedMs: number;
  overOldBudget: boolean; // would have flaked under the shipped 4000ms timeout
  hungAtCeiling: boolean; // did not resolve even at the generous ceiling
}

async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function drain(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, drain));
  return results;
}

async function main() {
  const combos: { fieldKey: string; family: (typeof FAMILIES)[number] }[] = [];
  for (const spec of FIELD_SPECS) for (const family of FAMILIES) combos.push({ fieldKey: spec.key, family });

  const samples: Sample[] = [];
  for (let round = 1; round <= rounds; round++) {
    const start = Date.now();
    await mapLimit(combos, concurrency, async ({ fieldKey, family }) => {
      const t0 = Date.now();
      const outcome = await probeInWorker(fieldKey, family, ceilingMs);
      const elapsedMs = Date.now() - t0;
      const hungAtCeiling = 'hangs' in outcome;
      samples.push({
        fieldKey,
        family,
        round,
        elapsedMs,
        overOldBudget: elapsedMs > 4000,
        hungAtCeiling,
      });
    });
    console.log(`[${label}] round ${round}/${rounds} done in ${Date.now() - start}ms`);
  }

  const overBudget = samples.filter((s) => s.overOldBudget);
  const hung = samples.filter((s) => s.hungAtCeiling);
  const elapsedSorted = samples.map((s) => s.elapsedMs).sort((a, b) => a - b);
  const max = elapsedSorted[elapsedSorted.length - 1] ?? 0;
  const p50 = elapsedSorted[Math.floor(elapsedSorted.length * 0.5)] ?? 0;
  const p95 = elapsedSorted[Math.floor(elapsedSorted.length * 0.95)] ?? 0;

  console.log(`\n=== [${label}] summary (ceiling=${ceilingMs}ms, concurrency=${concurrency}, samples=${samples.length}) ===`);
  console.log(`elapsed ms: p50=${p50} p95=${p95} max=${max}`);
  console.log(`calls exceeding the shipped 4000ms budget: ${overBudget.length}/${samples.length}`);
  if (overBudget.length > 0) {
    console.log(
      '  -> of those, did they still resolve under the generous ceiling (contention) or not (possible leak)?',
    );
    console.log(`  -> resolved late (contention evidence): ${overBudget.length - hung.length}`);
    console.log(`  -> never resolved even at ${ceilingMs}ms (leak candidate): ${hung.length}`);
    for (const s of overBudget) {
      console.log(`     ${s.fieldKey}:${s.family} round=${s.round} elapsedMs=${s.elapsedMs} hungAtCeiling=${s.hungAtCeiling}`);
    }
  }
  console.log(`calls that never resolved even at the ${ceilingMs}ms ceiling: ${hung.length}/${samples.length}`);
  for (const s of hung) {
    console.log(`  HUNG ${s.fieldKey}:${s.family} round=${s.round}`);
  }

  process.exitCode = hung.length > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error(`[${label}] q44-worker-timing-probe crashed:`, err);
  process.exitCode = 2;
});
