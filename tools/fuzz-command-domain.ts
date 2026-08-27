/**
 * Command-argument *domain* fuzzer (BACKLOG-QUALITY.md lane item q15).
 *
 * q2's `randomCommand` (`tools/fuzz-input.ts`) deliberately keeps every
 * generated argument inside its field's legal domain — `dev`'s `amount` is
 * `rng.intRange(0, 5000)`, tile coordinates are always in-grid, indices are
 * always in range. That is correct for q2's own acceptance line (valid
 * Commands only), but it means nothing in the shipped suite has ever fired an
 * illegal *value* — NaN, Infinity, a negative index — into a legal Command
 * *shape*. Session 1's log named the gap explicitly and found one real bug by
 * hand (`dev`'s `gold`/`xp`/`fast_forward` ops turn a NaN `amount` into
 * permanent NaN run state). This file automates that search across every
 * numeric field in the `Command` union, confined to a practice-mode world
 * (architecture rule 3: dev ops are Commands so they replay like any other,
 * and `applyDevCommand`'s own guard already refuses to run outside
 * `cfg.practice`) so nothing here ever banks.
 *
 * Two categories of numeric field need two different oracles:
 *
 *  - **Category A — an identifier or coordinate that must resolve to a real,
 *    reachable thing, or the whole command is defined to be a no-op**
 *    (`build.tower`/`tx`/`ty`, `upgrade.tx`/`ty`, `sell.tx`/`ty`, `pick.index`,
 *    `rekindle.structureId`). For these, *any* observable state change after
 *    firing an illegal value is itself the finding — the value was supposed
 *    to resolve to nothing. `digest()` is a cheap snapshot of everything a
 *    legal use of these commands can touch (gold, xp, offers, structures...);
 *    `digestChanged` is the oracle.
 *  - **Category B — a magnitude for an operation that is *expected* to change
 *    state** (`dev`'s `gold`/`xp`/`fast_forward` amounts). A `gold` command
 *    changing `w.gold` is correct; the bug is only when it changes to
 *    something non-finite or out of the range `scanWorld` (q2/q11) already
 *    defines. So Category B's oracle is `scanWorld`, not "did anything move."
 *
 * `runSingleProbe` is a pure, synchronous function so it can run either
 * in-process (cheap, for the ~90% of combinations that resolve in a handful
 * of milliseconds) or inside a `worker_threads.Worker` the caller can
 * `terminate()` on a timeout. The latter is not defensive theatre: this file
 * exists *because* one combination — `dev`'s `xp` op given `amount: Infinity`
 * in `act2` — genuinely hangs. `addXp` (`src/sim/progression.ts`) does
 * `w.xp += amount * xpMul; while (w.xp >= xpToReach(w.level + 1)) { ...
 * w.level++ }`; with `w.xp = Infinity` the comparison is true forever and
 * `w.level` counts up without bound. A synchronous while-loop inside the
 * vitest worker that is running this very file cannot be interrupted by a
 * same-thread timer, so the census runs every probe inside its own
 * `worker_threads.Worker` (loaded via `tsx/esm`, confirmed by hand to load a
 * `.ts` worker and to be killable mid-infinite-loop by `Worker#terminate()`)
 * and treats "did not answer within the deadline" as its own verdict,
 * `'hangs'`, distinct from `'accepted'` (ran to completion but corrupted
 * something) and `'threw'`.
 *
 *   npx tsx tools/fuzz-command-domain.ts             # prints the full census
 */

import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

import { applyCommand } from '../src/sim/run';
import { buildTower } from '../src/sim/towers';
import { maxLevel } from '../src/sim/upgrades';
import { GRID_H, GRID_W } from '../src/sim/grid';
import type { Command, Phase } from '../src/sim/types';
import type { World } from '../src/sim/world';
import { runInPhase } from './fuzz-input';
import { scanWorld } from './invariants';

/* ------------------------------------------------------------ generation */

export const FAMILIES = ['nan', 'posInf', 'negInf', 'negative', 'fractional'] as const;
export type Family = (typeof FAMILIES)[number];

/** One representative illegal value per family, relative to a legal value the field actually holds right now. */
export function illegalValue(family: Family, legalBase: number): number {
  switch (family) {
    case 'nan':
      return NaN;
    case 'posInf':
      return Infinity;
    case 'negInf':
      return -Infinity;
    case 'negative':
      return -1;
    case 'fractional':
      return legalBase + 0.5;
  }
}

/** The first open, unoccupied interior tile — deterministic across an identically-seeded fresh world. */
function findBuildableTile(w: World): [number, number] {
  for (let y = 1; y < GRID_H - 1; y++) {
    for (let x = 1; x < GRID_W - 1; x++) {
      if (w.grid.buildable(x, y)) return [x, y];
    }
  }
  throw new Error('fuzz-command-domain: no buildable tile in a fresh world');
}

/**
 * Removes preconditions this file has no interest in fuzzing (affordability,
 * build range) so a probe's verdict is about the field under test, not about
 * whether the harness happened to stand close enough or rich enough. Same
 * idiom as q2's `seedSoulSpread` setting `w.gold = 1e6`.
 */
function bypassPreconditions(w: World): void {
  w.gold = 1e9;
  w.derived.buildRange = 1e6;
}

/**
 * `towers.towers[0]` (`palisade`, a wall) has `upgrades.count: 0` — a tier-1
 * palisade already satisfies `s.tier >= maxLevel(def)`, so `upgradeTower`
 * rejects any coordinate fired at it before ever reaching the coordinate
 * checks the alias probe below exists to exercise. Picking a tower that can
 * actually take a second tier keeps the alias probe honest about *why* an
 * upgrade was rejected.
 */
function firstUpgradableTowerId(w: World): number {
  const def = w.content.towers.towers.find((t) => maxLevel(t) > 1);
  if (!def) throw new Error('fuzz-command-domain: no tower in /data/towers.json has more than one tier');
  return def.id;
}

export type Category = 'A' | 'B';

export interface FieldSpec {
  readonly key: string;
  readonly phase: Phase;
  readonly category: Category;
  readonly setup?: (w: World) => void;
  readonly command: (w: World, family: Family) => Command;
}

/**
 * Every numeric `Command` field. `souls.keys` (string keys) and `equip.relic`
 * are deliberately absent: `equip` is already a filed bug (BACKLOG-QUALITY.md
 * session 1 log, finding 3 — the `applyCommand` switch has no `'equip'` case
 * at all, so any argument is a no-op) and re-fuzzing dead code would only
 * restate that finding under a new name.
 */
export const FIELD_SPECS: readonly FieldSpec[] = [
  {
    key: 'build.tower',
    phase: 'act1_build',
    category: 'A',
    setup: bypassPreconditions,
    command: (w, family) => {
      const [tx, ty] = findBuildableTile(w);
      const legalTower = w.content.towers.towers[0].id;
      return { k: 'build', tower: illegalValue(family, legalTower), tx, ty };
    },
  },
  {
    key: 'build.tx',
    phase: 'act1_build',
    category: 'A',
    setup: bypassPreconditions,
    command: (w, family) => {
      const [tx, ty] = findBuildableTile(w);
      return { k: 'build', tower: w.content.towers.towers[0].id, tx: illegalValue(family, tx), ty };
    },
  },
  {
    key: 'build.ty',
    phase: 'act1_build',
    category: 'A',
    setup: bypassPreconditions,
    command: (w, family) => {
      const [tx, ty] = findBuildableTile(w);
      return { k: 'build', tower: w.content.towers.towers[0].id, tx, ty: illegalValue(family, ty) };
    },
  },
  {
    key: 'upgrade.tx',
    phase: 'act1_build',
    category: 'A',
    setup: (w) => {
      bypassPreconditions(w);
      const [bx, by] = findBuildableTile(w);
      buildTower(w, w.content.towers.towers[0].id, bx, by);
    },
    command: (w, family) => {
      const s = w.structures[0];
      return { k: 'upgrade', tx: illegalValue(family, s.tx), ty: s.ty };
    },
  },
  {
    key: 'upgrade.ty',
    phase: 'act1_build',
    category: 'A',
    setup: (w) => {
      bypassPreconditions(w);
      const [bx, by] = findBuildableTile(w);
      buildTower(w, w.content.towers.towers[0].id, bx, by);
    },
    command: (w, family) => {
      const s = w.structures[0];
      return { k: 'upgrade', tx: s.tx, ty: illegalValue(family, s.ty) };
    },
  },
  {
    key: 'sell.tx',
    phase: 'act1_build',
    category: 'A',
    setup: (w) => {
      bypassPreconditions(w);
      const [bx, by] = findBuildableTile(w);
      buildTower(w, w.content.towers.towers[0].id, bx, by);
    },
    command: (w, family) => {
      const s = w.structures[0];
      return { k: 'sell', tx: illegalValue(family, s.tx), ty: s.ty };
    },
  },
  {
    key: 'sell.ty',
    phase: 'act1_build',
    category: 'A',
    setup: (w) => {
      bypassPreconditions(w);
      const [bx, by] = findBuildableTile(w);
      buildTower(w, w.content.towers.towers[0].id, bx, by);
    },
    command: (w, family) => {
      const s = w.structures[0];
      return { k: 'sell', tx: s.tx, ty: illegalValue(family, s.ty) };
    },
  },
  {
    key: 'pick.index',
    phase: 'levelup',
    category: 'A',
    command: (_w, family) => ({ k: 'pick', index: illegalValue(family, 0) }),
  },
  {
    key: 'rekindle.structureId',
    phase: 'dawn',
    category: 'A',
    command: (_w, family) => ({ k: 'rekindle', structureId: illegalValue(family, 1) }),
  },
  {
    key: 'dev.gold.amount',
    phase: 'act1_build',
    category: 'B',
    command: (_w, family) => ({ k: 'dev', op: 'gold', amount: illegalValue(family, 100) }),
  },
  {
    key: 'dev.xp.amount',
    phase: 'act2',
    category: 'B',
    command: (_w, family) => ({ k: 'dev', op: 'xp', amount: illegalValue(family, 100) }),
  },
  {
    key: 'dev.fast_forward.amount',
    phase: 'act2',
    category: 'B',
    command: (_w, family) => ({ k: 'dev', op: 'fast_forward', amount: illegalValue(family, 100) }),
  },
] as const;

export function fieldSpec(key: string): FieldSpec {
  const spec = FIELD_SPECS.find((f) => f.key === key);
  if (!spec) throw new Error(`fuzz-command-domain: unknown field "${key}"`);
  return spec;
}

/** Everything a legal use of a Category A command can touch, snapshotted cheaply for an equality check. */
function digest(w: World): string {
  return JSON.stringify({
    gold: w.gold,
    goldEarned: w.goldEarned,
    goldSpent: w.goldSpent,
    xp: w.xp,
    level: w.level,
    pendingLevelUps: w.pendingLevelUps,
    rerollsLeft: w.rerollsLeft,
    offers: w.offers.length,
    coreHp: w.coreHp,
    wardenHp: w.warden.hp,
    structures: w.structures
      .map((s) => [s.id, s.tx, s.ty, s.tier, s.hp, s.spent])
      .sort((a, b) => (a[0] as number) - (b[0] as number)),
  });
}

export interface ProbeOutcome {
  readonly fieldKey: string;
  readonly family: Family;
  readonly threw: boolean;
  readonly errorMessage?: string;
  readonly problems: readonly string[];
  readonly digestChanged: boolean;
}

/** Pure and synchronous on purpose — this is the function a `Worker` calls so the parent can kill it on a timeout. */
export function runSingleProbe(fieldKey: string, family: Family): ProbeOutcome {
  const spec = fieldSpec(fieldKey);
  const w = runInPhase(spec.phase).world;
  spec.setup?.(w);
  const before = digest(w);
  const cmd = spec.command(w, family);
  let threw = false;
  let errorMessage: string | undefined;
  try {
    applyCommand(w, cmd);
  } catch (err) {
    threw = true;
    errorMessage = (err as Error)?.message ?? String(err);
  }
  const problems = scanWorld(w);
  const after = digest(w);
  return { fieldKey, family, threw, errorMessage, problems, digestChanged: before !== after };
}

export type Verdict = 'rejected' | 'accepted' | 'threw' | 'hangs';

export function classify(spec: FieldSpec, outcome: Pick<ProbeOutcome, 'threw' | 'problems' | 'digestChanged'>): Verdict {
  if (outcome.threw) return 'threw';
  if (spec.category === 'B') return outcome.problems.length > 0 ? 'accepted' : 'rejected';
  return outcome.digestChanged || outcome.problems.length > 0 ? 'accepted' : 'rejected';
}

/* ------------------------------------------------------------ isolation */

const WORKER_PATH = fileURLToPath(new URL('./fuzz-command-domain-worker.ts', import.meta.url));

interface HangResult {
  readonly hangs: true;
}

/** Runs one probe in its own worker thread and resolves `{hangs: true}` instead of the real result if it does not answer within `timeoutMs`. */
export function probeInWorker(fieldKey: string, family: Family, timeoutMs = 4000): Promise<ProbeOutcome | HangResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_PATH, {
      execArgv: ['--import', 'tsx/esm'],
      workerData: { mode: 'field', fieldKey, family },
    });
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      void worker.terminate().then(() => resolve({ hangs: true }));
    }, timeoutMs);
    worker.on('message', (msg: ProbeOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(msg);
      void worker.terminate();
    });
    worker.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      reject(err);
    });
  });
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

export interface CensusEntry {
  readonly fieldKey: string;
  readonly family: Family;
  readonly verdict: Verdict;
  readonly detail: string;
}

/**
 * Category A's whole point is that a legal value should be the only thing
 * that ever moves state, so a `digestChanged` there is exactly the finding.
 * Category B's `dev` ops are *supposed* to move state on any legal-magnitude
 * argument (a fractional `amount` still adds gold) — for those, `digestChanged`
 * with no `scanWorld` problem is correct behaviour, not a hole, and saying so
 * plainly beats reusing Category A's wording for a different meaning.
 */
function describeOutcome(spec: FieldSpec, outcome: ProbeOutcome): string {
  if (outcome.threw) return outcome.errorMessage ?? 'threw';
  if (outcome.problems.length > 0) return outcome.problems.slice(0, 3).join(' | ');
  if (outcome.digestChanged) {
    return spec.category === 'A'
      ? 'world state changed despite the illegal argument'
      : 'accepted as a legal magnitude, no invariant violated';
  }
  return 'no observable effect';
}

/** Every `FIELD_SPECS` x `FAMILIES` combination, each isolated in its own worker. */
export async function runCensus(timeoutMs = 4000, concurrency = 6): Promise<CensusEntry[]> {
  const combos: { spec: FieldSpec; family: Family }[] = [];
  for (const spec of FIELD_SPECS) for (const family of FAMILIES) combos.push({ spec, family });
  return mapLimit(combos, concurrency, async ({ spec, family }) => {
    const outcome = await probeInWorker(spec.key, family, timeoutMs);
    if ('hangs' in outcome) {
      return { fieldKey: spec.key, family, verdict: 'hangs' as Verdict, detail: `did not settle within ${timeoutMs}ms` };
    }
    const verdict = classify(spec, outcome);
    return { fieldKey: spec.key, family, verdict, detail: describeOutcome(spec, outcome) };
  });
}

/* ---------------------------------------------------------- alias probe */

/**
 * `Grid.idx(tx, ty) = ty * GRID_W + tx` is never bounds-checked before
 * `World.structureAt` indexes `grid.occ` with it (`src/sim/world.ts`), unlike
 * `Grid.buildable`, which checks `inBounds` first. So an out-of-grid `tx` one
 * row's width too large aliases onto a real tile one row up:
 * `idx(realTx + GRID_W, realTy - 1) === idx(realTx, realTy)`. This is a
 * distinct shape from the generic per-family sweep above (it requires two
 * fields to move together, not one), so it gets its own probe rather than a
 * sixth `Family`.
 */
export interface AliasProbeResult {
  readonly which: 'upgrade' | 'sell';
  readonly realTx: number;
  readonly realTy: number;
  readonly illegalTx: number;
  readonly illegalTy: number;
  readonly idxMatches: boolean;
  readonly threw: boolean;
  readonly errorMessage?: string;
  readonly structureMutated: boolean;
  readonly problems: readonly string[];
}

export function runAliasProbe(which: 'upgrade' | 'sell'): AliasProbeResult {
  const w = runInPhase('act1_build').world;
  bypassPreconditions(w);
  const [rx, ry] = findBuildableTile(w);
  const built = buildTower(w, firstUpgradableTowerId(w), rx, ry);
  if (!built.ok) throw new Error(`fuzz-command-domain: alias probe setup build failed: ${built.reason}`);
  const realId = w.structures[0].id;
  const illegalTx = rx + GRID_W;
  const illegalTy = ry - 1;
  const idxMatches = w.grid.idx(illegalTx, illegalTy) === w.grid.idx(rx, ry);
  const before = digest(w);
  let threw = false;
  let errorMessage: string | undefined;
  try {
    applyCommand(w, { k: which, tx: illegalTx, ty: illegalTy });
  } catch (err) {
    threw = true;
    errorMessage = (err as Error)?.message ?? String(err);
  }
  const problems = scanWorld(w);
  const after = digest(w);
  const stillIntact = w.structures.some((s) => s.id === realId) && after === before;
  return {
    which,
    realTx: rx,
    realTy: ry,
    illegalTx,
    illegalTy,
    idxMatches,
    threw,
    errorMessage,
    structureMutated: !stillIntact,
    problems,
  };
}

export function aliasProbeInWorker(which: 'upgrade' | 'sell', timeoutMs = 4000): Promise<AliasProbeResult | HangResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_PATH, { execArgv: ['--import', 'tsx/esm'], workerData: { mode: 'alias', which } });
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      void worker.terminate().then(() => resolve({ hangs: true }));
    }, timeoutMs);
    worker.on('message', (msg: AliasProbeResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(msg);
      void worker.terminate();
    });
    worker.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      reject(err);
    });
  });
}

/* --------------------------------------------------------------------- CLI */

function main(): void {
  void (async () => {
    const census = await runCensus();
    for (const e of census) {
      console.log(`${e.verdict.padEnd(9)} ${e.fieldKey.padEnd(26)} ${e.family.padEnd(10)} ${e.detail}`);
    }
    for (const which of ['upgrade', 'sell'] as const) {
      const r = await aliasProbeInWorker(which);
      if ('hangs' in r) {
        console.log(`hangs     alias:${which}`);
      } else {
        console.log(
          `${r.structureMutated ? 'ACCEPTED ' : 'rejected '} alias:${which} idxMatches=${r.idxMatches} ` +
            `threw=${r.threw} mutated=${r.structureMutated} problems=${r.problems.length}`,
        );
      }
    }
    const holes = census.filter((e) => e.verdict !== 'rejected');
    console.log(`\n${holes.length}/${census.length} combinations are not cleanly rejected.`);
  })();
}

const entry = (process.argv[1] ?? '').replace(/\\/g, '/');
if (entry.endsWith('tools/fuzz-command-domain.ts')) main();
