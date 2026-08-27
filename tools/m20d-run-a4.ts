/** One tower, both A4 clauses, in a fresh process (content loads once). */
import { SOUL_TOWERS, T3_MODS, runSingleType } from './a4probe';

try {
  const key = process.argv[2] ?? 'venom_spore';
  if (!SOUL_TOWERS.includes(key)) throw new Error(`not a soul tower: ${key}`);
  const seeds = [1, 2, 3, 4, 5];
  const t1 = seeds.map((s) => runSingleType(key, 1, s, []).waves);
  const t3 = seeds.map((s) => runSingleType(key, 3, s, T3_MODS).waves);
  const clears = (a: number[]) => a.filter((w) => w >= 10).length;
  console.log(`T1 ${clears(t1)}/5 [${t1}]  T3 ${clears(t3)}/5 [${t3}]`);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`m20d-run-a4: ${message.replace(/\s+/g, ' ').trim()}`);
  process.exitCode = 1;
}
