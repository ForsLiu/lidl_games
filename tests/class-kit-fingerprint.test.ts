/**
 * c033 (BACKLOG-CONTENT, lane `content`) — G8's diversity clause, half (ii):
 * BALANCE DIRECTION v2 §D (owner verdict,
 * `feedback/processed/20260904-223211-verdicts-q155-167.md`) replaces the
 * retired "top damage source distinct across >=9/12" count with two checks —
 * (i) every class's own-kit VS share >=35% from wave 12 (p12a/p12f's target,
 * measured in `tests/class-kit-damage-share.test.ts`) and (ii) pairwise
 * class-kit fingerprint distance >=0.15. This file is (ii): nobody has run it
 * at all, and `p10r`'s `tests/p12d` needs this number to write its gate test.
 *
 * The metric reuses G22's own device rather than inventing a new one
 * (`tests/p-core-f-gates.test.ts`'s `damageShareVector`/`l1Distance`,
 * reproduced here verbatim so both files score a run identically): each
 * class's T1 scripted-kit run produces a `damageByWeapon` share vector
 * (towers and the five `class_*` kit buckets alike), and the distance
 * between two classes' vectors is the L1 distance between those shares —
 * exactly what G22 already asks "does this shift the run's damage-source
 * mix" to answer, applied between class pairs instead of Core-vs-baseline.
 *
 * Cost, and why it is opt-in (c002's own precedent): a class-seed is a full
 * T1 run. Twelve classes at `FINGERPRINT_SEEDS` seeds each is
 * `12 * FINGERPRINT_SEEDS` full runs, so the pairwise sweep runs only under
 * `CLASS_FINGERPRINT_MEASURE=1`; the fast tier sees only the synthetic
 * self-tests on `l1Distance`/`damageShareVector` at the bottom.
 *
 *   CLASS_FINGERPRINT_MEASURE=1 npx vitest run tests/class-kit-fingerprint.test.ts
 *   CLASS_FINGERPRINT_MEASURE=1 FINGERPRINT_SEEDS=1 npx vitest run ...
 *
 * -- RECORDED (2026-09-07, `CLASS_FINGERPRINT_MEASURE=1 FINGERPRINT_SEEDS=2`,
 * 12 classes x seeds 1-2, T1, `cycles: 6`, full tree, `hybrid` policy) --
 * See the Log for the printed table and closest-pair readout. This is a
 * lighter sample than c002's 12-seed convention (cost: c002's 144-run sweep
 * measured ~140 minutes; 24 runs here is proportionally ~23) and is recorded
 * as such — a control-run measurement, not a claim about the mechanism, per
 * CLAUDE.md's measurement rules.
 */
import { beforeAll, describe, expect, it } from 'vitest';

import '../src/bots';
import { loadContent } from '../src/sim/content';
import { allTreeNodeIds } from '../src/meta/meta';
import type { RunConfig, RunReport } from '../src/sim/types';
import { cfg, runScripted } from './helpers';

const content = loadContent();
const FULL_TREE = allTreeNodeIds(content);

const MEASURE = process.env.CLASS_FINGERPRINT_MEASURE === '1';
const SEED_COUNT = Number(process.env.FINGERPRINT_SEEDS ?? 2);
const SEEDS = Array.from({ length: SEED_COUNT }, (_, i) => i + 1);
const KEYS = content.classes.classes.map((c) => c.key);

/** G22's own vector, reproduced verbatim (`tests/p-core-f-gates.test.ts`). */
function damageShareVector(report: RunReport): Record<string, number> {
  const total = report.damageTotal;
  const out: Record<string, number> = {};
  if (total <= 0) return out;
  for (const [k, v] of Object.entries(report.damageByWeapon)) out[k] = v / total;
  return out;
}

/** G22's own distance, reproduced verbatim (`tests/p-core-f-gates.test.ts`). */
function l1Distance(a: Record<string, number>, b: Record<string, number>): number {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let sum = 0;
  for (const k of keys) sum += Math.abs((a[k] ?? 0) - (b[k] ?? 0));
  return sum;
}

/** BALANCE DIRECTION v2 §D's floor for a passing pair. */
const DISTANCE_FLOOR = 0.15;

function runClassScripted(classKey: string, seed: number): RunReport {
  const config: RunConfig = cfg({
    seed,
    classKey,
    tier: 1,
    modifiers: [],
    allocated: FULL_TREE,
    cycles: 6,
    policy: 'hybrid',
  });
  return runScripted(config, 'hybrid', 60 * 60 * 120).report;
}

interface Pair {
  a: string;
  b: string;
  distance: number;
}

const vectors = new Map<string, Record<string, number>>();
const pairs: Pair[] = [];

beforeAll(() => {
  if (!MEASURE) return;
  for (const key of KEYS) {
    // Aggregate raw damage over seeds first, then normalize once — c002's own
    // convention (sum then ratio, not average-of-ratios), so a seed that
    // resolves early does not get equal weight to one that runs the full
    // eighteen TD waves.
    const totals: Record<string, number> = {};
    let grand = 0;
    for (const seed of SEEDS) {
      const report = runClassScripted(key, seed);
      // p6e/c002's rule: a tick-cap timeout covers an incomparable window.
      if (report.outcome === 'running') continue;
      for (const [k, v] of Object.entries(report.damageByWeapon)) {
        totals[k] = (totals[k] ?? 0) + v;
        grand += v;
      }
    }
    const vec: Record<string, number> = {};
    if (grand > 0) for (const [k, v] of Object.entries(totals)) vec[k] = v / grand;
    vectors.set(key, vec);
  }
  for (let i = 0; i < KEYS.length; i++) {
    for (let j = i + 1; j < KEYS.length; j++) {
      const a = KEYS[i];
      const b = KEYS[j];
      pairs.push({ a, b, distance: l1Distance(vectors.get(a) ?? {}, vectors.get(b) ?? {}) });
    }
  }
  const meeting = pairs.filter((p) => p.distance >= DISTANCE_FLOOR).length;
  const closest = [...pairs].sort((x, y) => x.distance - y.distance).slice(0, 3);
  console.log(
    `\n[c033] class-kit fingerprint distance, ${KEYS.length} classes x ${SEEDS.length} seeds` +
      ` (${pairs.length} pairs)\n` +
      `  meeting the ${DISTANCE_FLOOR} floor: ${meeting}/${pairs.length}\n` +
      `  closest 3 pairs:\n` +
      closest.map((p) => `    ${p.a} / ${p.b}: ${p.distance.toFixed(4)}`).join('\n') +
      '\n',
  );
}, 6_000_000);

describe.skipIf(!MEASURE)('c033: class-kit fingerprint distance measurement (opt-in)', () => {
  it('records all 66 pairwise distances', () => {
    expect(pairs).toHaveLength((KEYS.length * (KEYS.length - 1)) / 2);
    for (const p of pairs) expect(p.distance).toBeGreaterThanOrEqual(0);
  });
});

describe('c033: fingerprint device invariants (fast tier, synthetic)', () => {
  it('l1Distance is zero for identical vectors', () => {
    expect(l1Distance({ a: 0.4, b: 0.6 }, { a: 0.4, b: 0.6 })).toBe(0);
  });

  it('l1Distance is symmetric', () => {
    const x = { a: 0.3, b: 0.7 };
    const y = { a: 0.1, c: 0.9 };
    expect(l1Distance(x, y)).toBeCloseTo(l1Distance(y, x), 10);
  });

  it('l1Distance is 2 for two disjoint fully-normalized vectors', () => {
    expect(l1Distance({ a: 1 }, { b: 1 })).toBeCloseTo(2, 10);
  });

  it('damageShareVector is empty for a zero-total report', () => {
    const report = { damageTotal: 0, damageByWeapon: { mortar: 5 } } as unknown as RunReport;
    expect(damageShareVector(report)).toEqual({});
  });

  it('damageShareVector sums to 1 across its own keys for a positive-total report', () => {
    const report = {
      damageTotal: 100,
      damageByWeapon: { mortar: 60, ballista: 40 },
    } as unknown as RunReport;
    const vec = damageShareVector(report);
    const sum = Object.values(vec).reduce((s, v) => s + v, 0);
    expect(sum).toBeCloseTo(1, 10);
  });
});
