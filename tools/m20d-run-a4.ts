/** One tower, both A4 clauses, in a fresh process (content loads once). */
import { SOUL_TOWERS, T3_MODS, runSingleType } from './a4probe';

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
