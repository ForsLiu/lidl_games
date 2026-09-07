import { generateTerrain, loadTerrain, measureTerrain } from '../src/sim/terrain';
import { GRID_W, GRID_H } from '../src/sim/grid';

const cfg = loadTerrain();
const N = Number(process.argv[2] ?? 5000);
const BANDS = ['walkableFrac', 'buildableNormalFrac', 'gateReachFrac', 'coreLegalFrac', 'maxGateDetour'] as const;
type Band = typeof BANDS[number];
const stats: Record<Band, { min: number; max: number; sum: number }> = Object.fromEntries(
  BANDS.map((b) => [b, { min: Infinity, max: -Infinity, sum: 0 }]),
) as any;
let fallbacks = 0;
let attemptsTotal = 0;
let corridorFails = 0;
const t0 = performance.now();
for (let s = 0; s < N; s++) {
  const m = generateTerrain(s, cfg);
  attemptsTotal += m.attempts;
  if (m.fallback) fallbacks++;
  const q = measureTerrain(m, cfg);
  for (const b of BANDS) {
    const v = (q as any)[b];
    stats[b].min = Math.min(stats[b].min, v);
    stats[b].max = Math.max(stats[b].max, v);
    stats[b].sum += v;
  }
}
const t1 = performance.now();
console.log(`grid ${GRID_W}x${GRID_H}, N=${N}, ms=${(t1 - t0).toFixed(0)}, fallbacks=${fallbacks}, avgAttempts=${(attemptsTotal / N).toFixed(4)}`);
for (const b of BANDS) {
  console.log(`${b}: min=${stats[b].min.toFixed(6)} mean=${(stats[b].sum / N).toFixed(6)} max=${stats[b].max.toFixed(6)}`);
}
console.log('constraints', cfg.constraints);
