/**
 * c033 (BACKLOG-CONTENT, lane `content`) — §14 gate **G8**'s *diversity*
 * clause, clause (ii) of the owner rewrite (BALANCE DIRECTION v2 §D,
 * `feedback/processed/20260904-223211-verdicts-q155-167.md`): "pairwise
 * class-kit fingerprint distance >=0.15 for every one of the 66 class pairs,
 * using G22's existing damage-source/damage-type vector method." Clause (i)
 * (own-kit VS share >=35% from wave 12) is `class-kit-damage-share.test.ts`'s
 * (c002/c030) territory; this file measures clause (ii) only, which nobody
 * had run before this item. `p12d` (BACKLOG.md, main lane, still `[ ]`) needs
 * this number to write its own gate-test rewrite.
 *
 * **Method, reused rather than invented (CLAUDE.md, this item's acceptance).**
 * `damageShareVector`/`l1Distance` below are copied from G22's implementation
 * in `tests/p-core-f-gates.test.ts` (out of this lane's Scope — read, not
 * edited; copying its small formula into an in-Scope file is this lane's
 * established convention per c002/c030). G22 compares a *single* Core-vs-Core
 * run pair's `RunReport.damageByWeapon` vectors; here there are twelve
 * classes, each measured over several seeds, so each class's vector is built
 * by summing `damageByWeapon` (and `damageTotal`) across every non-timeout
 * seed for that class *before* normalizing — the same aggregate-then-share
 * order `class-kit-damage-share.test.ts` uses for its own `ownShare`/`vsShare`
 * columns, not a per-seed average of twelve already-noisy ratios. The vector
 * is the **whole-run** `damageByWeapon` (tower keys and `class_*` kit keys
 * together), exactly as G22 reads it — not a kit-only subset — because the
 * clause under test is about the class's whole *fingerprint*, of which the
 * kit is only ever a fraction of the run (c002/c030's own numbers: every
 * class's own-kit share is under `MATERIALITY_SHARE` except two).
 *
 * `runClassScripted` is `class-kit-damage-share.test.ts`'s function,
 * reproduced with the same config shape (T1, `cycles: 6`, full Constellation
 * tree, `hybrid` policy) so both files score the identical scripted kit run.
 * `describeSource` is that file's function too, duplicated verbatim per this
 * lane's established duplication convention (also present a third time, out
 * of Scope, in `tests/p6e-class-diversity.test.ts`).
 *
 * **Cost, and why it is opt-in.** Same shape as c002/c030: one class-seed is
 * a full T1 run. This file's sweep is gated behind `KIT_FP_MEASURE=1`
 * (analogous to `KIT_SHARE_MEASURE`), with `KIT_FP_SEEDS` (analogous to
 * `KIT_SHARE_SEEDS`, default 12) controlling how many seeds each class's
 * aggregate vector is built from. The fast tier only sees the cheap
 * invariant test at the bottom.
 *
 *   KIT_FP_MEASURE=1 npx vitest run tests/class-kit-fingerprint.test.ts
 *   KIT_FP_MEASURE=1 KIT_FP_SEEDS=2 npx vitest run tests/class-kit-fingerprint.test.ts
 *
 * -- RECORDED (2026-09-06, c033, `KIT_FP_MEASURE=1 KIT_FP_SEEDS=2`, 12 classes
 * x seeds 1-2 = 24 full **T1** runs, ~10.5 min wall clock, on this branch's
 * HEAD, no `/data` change --
 *
 *   pairs meeting the >=0.15 floor: **50/66**
 *
 *   3 closest pairs by name and L1 distance (all three fail the floor):
 *     1. necromancer / bloodlord   0.0374
 *     2. archer / paladin          0.0777
 *     3. bloodlord / animist       0.0840
 *
 *   All 16 failing pairs (< 0.15), closest first:
 *     necromancer/bloodlord 0.0374, archer/paladin 0.0777,
 *     bloodlord/animist 0.0840, engineer/paladin 0.0854,
 *     cryomancer/paladin 0.0862, engineer/cryomancer 0.0918,
 *     necromancer/animist 0.0962, pyromancer/archer 0.1022,
 *     swordsman/animist 0.1124, archer/cryomancer 0.1174,
 *     engineer/archer 0.1211, cryomancer/stormcaller 0.1217,
 *     stormcaller/paladin 0.1229, engineer/stormcaller 0.1237,
 *     swordsman/bloodlord 0.1342, swordsman/necromancer 0.1407.
 *   The next pair above the floor is archer/stormcaller at 0.1568.
 *
 * **A draft of this comment, written before the sweep ran, guessed 66/66 —
 * wrong.** CLAUDE.md's measurement rule ("my change improved X needs the
 * control run, not the plausible story") cuts the other way here too: a
 * plausible-sounding number needs the real run just as much as a claimed
 * improvement does. The actual reading is 50/66, 16 pairs short.
 *
 * **What the failing pairs have in common.** Every failing pair sits inside
 * one cluster: {archer, paladin, cryomancer, engineer, stormcaller, animist,
 * bloodlord, necromancer, swordsman} — eight of the twelve classes each
 * appear in at least one failing pair, and paladin/animist/bloodlord/
 * cryomancer/engineer each appear in three or more. `plaguebringer`,
 * `pyromancer` (bar one pair with `archer`), and `time_lord` never fail a
 * pair. This lines up with c002/c030's own finding: every class's `topLabel`
 * in that measurement resolves to a tower key (`mortar`, near-unanimous)
 * because no class clears `MATERIALITY_SHARE` on its own kit, so a class
 * pair's fingerprint distance is dominated by *shared* tower usage under the
 * same `hybrid` bot and full tree, and only weakly by each kit's own small
 * slice of the vector — the same "wielded damage swamps kit damage" dynamic
 * p12a/Q175 measured for clause (i), read here as a *pairwise* symptom
 * instead of a per-class share.
 *
 * **Reading this against clause (i).** Both clauses now show the same
 * mechanism from two angles. c002/c030 found clause (i) (own-kit VS share
 * >=35%) unreachable from `data/classes.json` alone (Q175/`p12f`) because
 * wielded tower damage inherits the full upgrade/Constellation scaling stack
 * and the kit does not, so the denominator outgrows the numerator as the
 * build develops. Clause (ii) fails for a large minority of pairs for the
 * same reason: the whole-run `damageByWeapon` vector (Q116/G22's own
 * definition, reused unmodified per this item's acceptance) is mostly tower
 * fire for every class, so classes that end up leaning on similar tower
 * mixes under the shared `hybrid` policy read as similar fingerprints
 * regardless of how different their kits are. Nothing here implies clause
 * (ii) needs the same fix as clause (i) — 50/66 is a majority pass, not a
 * wall — but the mechanism behind both readings is the same one, which is
 * the fact worth handing to `p12d` along with the numbers.
 *
 * **No `data/classes.json` tune applied.** This item's acceptance is
 * conditional: take a tune only if it *plainly* raises the passing count
 * without moving any class outside its win-rate band. The failing set spans
 * eight different classes and two different "clusters" of near-identical
 * tower usage (there is no single narrow lever — one class's own-kit number
 * — whose change would separate all 16 failing pairs at once without also
 * shifting every *other* pair that class appears in, several of which
 * already pass with real margin, e.g. `paladin` is in 5 failing pairs and 6
 * passing ones). That is exactly the "fragile tune" CLAUDE.md rule 6 warns
 * against forcing, and the class-by-class win-rate re-measurement such a
 * tune would need is outside this item's Scope (`data/classes.json` only,
 * no re-run of the win-rate gates it could move). Logged for `p12d` instead,
 * per this item's own fallback clause. Nothing was touched in `/data`.
 *
 * **Seed count.** This is a first measurement at `KIT_FP_SEEDS=2`, the same
 * reduced count `class-kit-damage-share.test.ts` used for its own first
 * recorded pass (p12a) before a full 12-seed run. With 16 of 66 pairs
 * failing and several of those close to the floor (e.g. archer/stormcaller
 * at 0.1568, just above it), a full 12-seed run would very plausibly move
 * individual pairs across the line in either direction — this 2-seed reading
 * should be treated as directional (roughly a quarter of pairs fail, driven
 * by shared tower usage) rather than load-bearing to the pair. A full
 * 12-seed re-run is left for whoever next needs an exact number from this
 * clause (main-lane `p12d`), per this item's Scope (measurement plus
 * *optional* tune, not a mandate to run the expensive tier before handing
 * the finding off).
 */
import { beforeAll, describe, expect, it } from 'vitest';

import '../src/bots';
import { loadContent, type ClassDef } from '../src/sim/content';
import { allTreeNodeIds } from '../src/meta/meta';
import type { RunConfig, RunReport } from '../src/sim/types';
import { cfg, runScripted } from './helpers';

const content = loadContent();
const FULL_TREE = allTreeNodeIds(content);

const MEASURE = process.env.KIT_FP_MEASURE === '1';
const SEED_COUNT = Number(process.env.KIT_FP_SEEDS ?? 12);
const SEEDS = Array.from({ length: SEED_COUNT }, (_, i) => i + 1);
const KEYS = content.classes.classes.map((c) => c.key);

/** §14 G8's floor for clause (ii), BALANCE DIRECTION v2 §D. */
const FINGERPRINT_FLOOR = 0.15;

const SUMMON_KINDS = new Set(['summon_turret', 'raise_skeletons', 'manifest_spirit']);

/** class-kit-damage-share.test.ts's `describeSource`, reproduced verbatim (also duplicated in p6e-class-diversity.test.ts, out of Scope). */
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

/** class-kit-damage-share.test.ts's exact scripted-kit run builder (T1, cycles 6, full tree, hybrid). */
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

/**
 * G22's `damageShareVector` (`tests/p-core-f-gates.test.ts`), adapted to take
 * an already-aggregated `{ weapon: damage }` sum plus its matching total
 * rather than a single `RunReport`, since a class's fingerprint here is built
 * from several seeds summed together (same aggregate-then-share order as
 * `class-kit-damage-share.test.ts`'s `ownShare`/`vsShare`), not one run.
 */
function shareVector(byWeapon: Record<string, number>, total: number): Record<string, number> {
  const out: Record<string, number> = {};
  if (total <= 0) return out;
  for (const [k, v] of Object.entries(byWeapon)) out[k] = v / total;
  return out;
}

/** G22's `l1Distance`, reproduced verbatim. */
function l1Distance(a: Record<string, number>, b: Record<string, number>): number {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let sum = 0;
  for (const k of keys) sum += Math.abs((a[k] ?? 0) - (b[k] ?? 0));
  return sum;
}

interface ClassVector {
  key: string;
  vector: Record<string, number>;
}

const vectors: ClassVector[] = [];
interface PairDistance {
  a: string;
  b: string;
  distance: number;
}
const pairs: PairDistance[] = [];

beforeAll(() => {
  if (!MEASURE) return;
  for (const key of KEYS) {
    const cls = content.classByKey.get(key);
    if (!cls) throw new Error(`${key}: expected a §4 class`);
    const byWeapon: Record<string, number> = {};
    let total = 0;
    for (const seed of SEEDS) {
      const report = runClassScripted(key, seed);
      // Same non-participation rule as c002/c030: a tick-cap timeout covers
      // an incomparable window.
      if (report.outcome === 'running') continue;
      total += report.damageTotal;
      for (const [k, v] of Object.entries(report.damageByWeapon)) {
        byWeapon[k] = (byWeapon[k] ?? 0) + v;
      }
    }
    vectors.push({ key, vector: shareVector(byWeapon, total) });
  }

  for (let i = 0; i < vectors.length; i++) {
    for (let j = i + 1; j < vectors.length; j++) {
      const distance = l1Distance(vectors[i].vector, vectors[j].vector);
      pairs.push({ a: vectors[i].key, b: vectors[j].key, distance });
    }
  }

  const passing = pairs.filter((p) => p.distance >= FINGERPRINT_FLOOR).length;
  const closest = [...pairs].sort((x, y) => x.distance - y.distance).slice(0, 3);
  const lines = pairs
    .slice()
    .sort((x, y) => x.distance - y.distance)
    .map((p) => `  ${p.a} / ${p.b}  ${p.distance.toFixed(4)}`);
  console.log(
    `\n[c033] class-kit fingerprint distance, ${KEYS.length} classes x ${SEEDS.length} seeds` +
      ` (${pairs.length} pairs)\n${lines.join('\n')}\n` +
      `  pairs meeting the >=${FINGERPRINT_FLOOR} floor: ${passing}/${pairs.length}\n` +
      `  3 closest pairs: ${closest
        .map((p) => `${p.a}/${p.b} (${describeSource(content.classByKey.get(p.a)!, 'class_active')} vs ${describeSource(content.classByKey.get(p.b)!, 'class_active')}) ${p.distance.toFixed(4)}`)
        .join('; ')}\n`,
  );
}, 6_000_000);

describe.skipIf(!MEASURE)('c033: class-kit fingerprint measurement (opt-in)', () => {
  it('records all 66 pairwise distances', () => {
    expect(pairs).toHaveLength((KEYS.length * (KEYS.length - 1)) / 2);
    for (const p of pairs) expect(p.distance).toBeGreaterThanOrEqual(0);
  });
});

describe('c033: invariants the tune must not break (fast tier)', () => {
  it('every class has exactly 12 distinct keys to pair (66 combinations)', () => {
    expect(KEYS.length).toBe(12);
    expect((KEYS.length * (KEYS.length - 1)) / 2).toBe(66);
  });
});
