import { generateTerrain, loadTerrain } from '../src/sim/terrain';
const cfg = loadTerrain();
const N = 3000;
const t0 = performance.now();
let attempts = 0, fallbacks = 0;
for (let s = 0; s < N; s++) {
  const m = generateTerrain(s, cfg);
  attempts += m.attempts;
  if (m.fallback) fallbacks++;
}
const t1 = performance.now();
console.log(`n=${N} ms=${(t1-t0).toFixed(1)} per=${((t1-t0)/N).toFixed(3)}ms attempts=${attempts} fallbacks=${fallbacks}`);
