/**
 * THROWAWAY fb197 probe (BACKLOG.md fb197) — reproduces tests/p6e-class-
 * diversity.test.ts's own beforeAll exactly, printing the full per-class
 * table plus fingerprint-distance count, so a vitest .skip'd assertion
 * doesn't hide the real numbers behind a pass/fail bit. Deleted after use,
 * same precedent as fb185/fb196's own probes (see BACKLOG.md).
 *
 *   npx tsx tools/fb197-probe.ts
 */
import '../src/bots';
import { loadContent, type ClassDef } from '../src/sim/content';
import { allTreeNodeIds } from '../src/meta/meta';
import type { RunConfig, RunReport } from '../src/sim/types';
import { cfg, classifyMargin, GATE_TIER, runScripted, summarizeMargins } from '../tests/helpers';

const content = loadContent();
const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);
const FULL_TREE = allTreeNodeIds(content);
const CLASS_KEYS = content.classes.classes.map((c) => c.key);
const MATERIALITY_SHARE = 0.2;
const FINGERPRINT_FLOOR = 0.15;

const SUMMON_KINDS = new Set(['summon_turret', 'raise_skeletons', 'manifest_spirit']);

function describeSource(cls: ClassDef, key: string): string {
  switch (key) {
    case 'class_active':
      return cls.active1.name;
    case 'class_active2':
      return cls.active2.name;
    case 'class_passive':
      return cls.passive.name;
    case 'class_basic':
      return `${cls.name} basic attack`;
    case 'class_summon':
      if (SUMMON_KINDS.has(cls.active2.kind)) return cls.active2.name;
      if (SUMMON_KINDS.has(cls.active1.kind)) return cls.active1.name;
      return `${cls.name} summon`;
    default:
      return key;
  }
}

function runClassScripted(classKey: string, seed: number): RunReport {
  const config: RunConfig = cfg({
    seed,
    classKey,
    tier: GATE_TIER,
    modifiers: [],
    allocated: FULL_TREE,
    cycles: 6,
    policy: 'hybrid',
  });
  return runScripted(config, 'hybrid', 60 * 60 * 120).report;
}

function sumValues(rec: Record<string, number>): number {
  let total = 0;
  for (const v of Object.values(rec)) total += v;
  return total;
}
function argmaxKey(rec: Record<string, number>): string {
  let bestKey = '';
  let bestVal = -1;
  for (const [k, v] of Object.entries(rec)) {
    if (v > bestVal) {
      bestVal = v;
      bestKey = k;
    }
  }
  return bestKey;
}
function shareVector(rec: Record<string, number>): Record<string, number> {
  const total = sumValues(rec);
  const out: Record<string, number> = {};
  if (total <= 0) return out;
  for (const [k, v] of Object.entries(rec)) out[k] = v / total;
  return out;
}
function l1Distance(a: Record<string, number>, b: Record<string, number>): number {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let sum = 0;
  for (const k of keys) sum += Math.abs((a[k] ?? 0) - (b[k] ?? 0));
  return sum;
}

interface ClassMeasurement {
  key: string;
  wins: number;
  outcomes: string[];
  ownDamage: Record<string, number>;
  allDamage: Record<string, number>;
  ownShare: number;
  topLabel: string;
  reports: RunReport[];
}

const measurements = new Map<string, ClassMeasurement>();

for (const key of CLASS_KEYS) {
  const cls = content.classByKey.get(key)!;
  let wins = 0;
  const outcomes: string[] = [];
  const reports: RunReport[] = [];
  const ownDamage: Record<string, number> = {};
  const allDamage: Record<string, number> = {};
  for (const seed of SEEDS) {
    const report = runClassScripted(key, seed);
    reports.push(report);
    if (report.outcome === 'victory') wins++;
    const margin = classifyMargin(report);
    outcomes.push(`${seed}:${report.outcome === 'running' ? 'timeout' : report.outcome}/w${report.wavesCleared}/${margin.kind}`);
    if (report.outcome === 'running') continue;
    for (const [k, v] of Object.entries(report.damageByWeapon)) {
      allDamage[k] = (allDamage[k] ?? 0) + v;
      if (!content.towerByKey.has(k)) ownDamage[k] = (ownDamage[k] ?? 0) + v;
    }
  }
  const ownTotal = sumValues(ownDamage);
  const allTotal = sumValues(allDamage);
  const ownShare = allTotal > 0 ? ownTotal / allTotal : 0;
  const topLabel = ownShare >= MATERIALITY_SHARE ? describeSource(cls, argmaxKey(ownDamage)) : argmaxKey(allDamage);
  measurements.set(key, { key, wins, outcomes, ownDamage, allDamage, ownShare, topLabel, reports });
  console.log(`${key}: ${wins}/12 — ${outcomes.join(' ')} — top: ${topLabel} (ownShare ${(ownShare * 100).toFixed(1)}%) — margins: ${summarizeMargins(reports)}`);
}

console.log('\n--- fingerprint distance (pairs < 0.15) ---');
const vectors = CLASS_KEYS.map((k) => ({ key: k, vector: shareVector(measurements.get(k)!.allDamage) }));
let failing = 0;
const failPairs: string[] = [];
for (let i = 0; i < vectors.length; i++) {
  for (let j = i + 1; j < vectors.length; j++) {
    const d = l1Distance(vectors[i].vector, vectors[j].vector);
    if (d < FINGERPRINT_FLOOR) {
      failing++;
      failPairs.push(`${vectors[i].key}/${vectors[j].key} ${d.toFixed(4)}`);
    }
  }
}
console.log(`failing: ${failing}/66`);
console.log(failPairs.join(', '));
