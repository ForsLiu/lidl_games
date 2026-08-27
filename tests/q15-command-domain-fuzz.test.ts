/**
 * q15 — Command-argument domain fuzz (BACKLOG-QUALITY.md: q2's `randomCommand`
 * deliberately stays inside each field's legal domain; this is the fuzzer for
 * what happens outside it — NaN, ±Infinity, a negative index, a fractional
 * tile — confined to a practice-mode world so nothing banks, per session 1's
 * flagged gap).
 *
 * `tools/fuzz-command-domain.ts` carries the actual harness and its own long
 * design comment (why two oracles, why every probe runs in a killable
 * `Worker`, why the alias probe is separate from the generic sweep). This
 * file is the assertions: the full census against a pinned recorded map
 * (`tests/q15-command-domain-holes.ts`, q7's ACCEPTED-map idiom), named
 * reproductions of the two most severe findings, and anti-vacuity coverage
 * of the harness's own classification logic.
 */
import { beforeAll, describe, expect, it } from 'vitest';

import {
  classify,
  FAMILIES,
  fieldSpec,
  FIELD_SPECS,
  probeInWorker,
  runAliasProbe,
  runCensus,
  runSingleProbe,
  type CensusEntry,
} from '../tools/fuzz-command-domain';
import { ALIAS_HOLES, HOLES } from './q15-command-domain-holes';

/** Every numeric `Command` field this file fuzzes. `equip.relic` and `souls.keys` are deliberately absent — see the header comment in `tools/fuzz-command-domain.ts`. */
const EXPECTED_FIELD_KEYS = [
  'build.tower',
  'build.tx',
  'build.ty',
  'upgrade.tx',
  'upgrade.ty',
  'sell.tx',
  'sell.ty',
  'pick.index',
  'rekindle.structureId',
  'dev.gold.amount',
  'dev.xp.amount',
  'dev.fast_forward.amount',
] as const;

describe('q15 command-argument domain fuzz', () => {
  let census: CensusEntry[];

  beforeAll(async () => {
    census = await runCensus();
  }, 120000);

  it('covers exactly the numeric Command fields this file documents', () => {
    // Not a full anti-drift guard against `src/sim/types.ts` (a 13th numeric
    // field silently added there would not turn this red) — a plain pin, same
    // honesty bar as the deliberate `equip`/`souls` exclusions above.
    expect([...FIELD_SPECS.map((f) => f.key)].sort()).toEqual([...EXPECTED_FIELD_KEYS].sort());
    expect(FAMILIES.length).toBe(5);
  });

  it('census runs every field x family combination exactly once', () => {
    expect(census.length).toBe(FIELD_SPECS.length * FAMILIES.length);
    const seen = new Set(census.map((e) => `${e.fieldKey}:${e.family}`));
    expect(seen.size).toBe(census.length);
  });

  it('matches the recorded holes exactly — a new one or a closed one both go red', () => {
    const actual: Record<string, string> = {};
    for (const e of census) {
      if (e.verdict !== 'rejected') actual[`${e.fieldKey}:${e.family}`] = e.verdict;
    }
    expect(actual).toEqual(HOLES);
  });

  it('everything not in the recorded holes is cleanly rejected', () => {
    for (const e of census) {
      if (`${e.fieldKey}:${e.family}` in HOLES) continue;
      expect(e.verdict, `${e.fieldKey}:${e.family} — ${e.detail}`).toBe('rejected');
    }
  });

  /* ---------------------------------------------------- named findings */

  describe('finding: dev gold/xp/fast_forward turn a non-finite amount into permanent non-finite run state', () => {
    // BACKLOG-QUALITY.md session 1 log found the NaN half of this by hand for
    // all three ops. This file adds the +Infinity half — worse for `xp`,
    // which hangs rather than merely corrupting (below).
    it('dev gold amount=NaN -> gold and goldEarned are permanently NaN', () => {
      const r = runSingleProbe('dev.gold.amount', 'nan');
      expect(r.threw).toBe(false);
      expect(r.problems.join(' | ')).toContain('gold=NaN');
    });

    it('dev gold amount=Infinity -> gold and goldEarned are permanently Infinity', () => {
      const r = runSingleProbe('dev.gold.amount', 'posInf');
      expect(r.threw).toBe(false);
      expect(r.problems.join(' | ')).toContain('gold=Infinity');
    });

    it('dev xp amount=NaN -> xp is permanently NaN', () => {
      const r = runSingleProbe('dev.xp.amount', 'nan');
      expect(r.threw).toBe(false);
      expect(r.problems.join(' | ')).toContain('xp=NaN');
    });

    it('dev fast_forward amount=NaN -> act2Time is permanently NaN', () => {
      const r = runSingleProbe('dev.fast_forward.amount', 'nan');
      expect(r.threw).toBe(false);
      expect(r.problems.join(' | ')).toContain('act2Time=NaN');
    });

    it('dev fast_forward amount=Infinity -> act2Time is permanently Infinity', () => {
      const r = runSingleProbe('dev.fast_forward.amount', 'posInf');
      expect(r.threw).toBe(false);
      expect(r.problems.join(' | ')).toContain('act2Time=Infinity');
    });
  });

  describe('finding: dev xp amount=Infinity hangs the process', () => {
    // `addXp` (src/sim/progression.ts) does `w.xp += amount * xpMul; while
    // (w.xp >= xpToReach(w.level + 1)) { ...; w.level++ }`. With `w.xp =
    // Infinity` the comparison never turns false, so the loop counts `level`
    // up forever. Run only through the killable worker path — never in-process
    // — for exactly the reason `tools/fuzz-command-domain.ts`'s header explains.
    it('does not settle within the probe deadline', async () => {
      const r = await probeInWorker('dev.xp.amount', 'posInf', 4000);
      expect('hangs' in r && r.hangs).toBe(true);
    }, 15000);
  });

  describe('finding: an out-of-grid tx aliases onto a real tile one row up, for both upgrade and sell', () => {
    // `Grid.idx(tx, ty) = ty * GRID_W + tx` is never bounds-checked before
    // `World.structureAt` uses it, unlike `Grid.buildable` (which checks
    // `inBounds` first). `illegalTx = realTx + GRID_W`, `illegalTy = realTy -
    // 1` computes to the same flat index as the real tile, so a command aimed
    // at a coordinate that is unambiguously off the 36x20 grid still resolves
    // to — and mutates — a real structure.
    it.each(['upgrade', 'sell'] as const)('%s: idx aliases and the real structure is mutated', (which) => {
      const r = runAliasProbe(which);
      expect(r.idxMatches, 'the aliasing arithmetic itself did not line up as expected').toBe(true);
      expect(r.illegalTx).toBeGreaterThanOrEqual(36); // off-grid by construction (GRID_W)
      expect(r.threw).toBe(false);
      expect(r.problems).toEqual([]);
      expect(r.structureMutated).toBe(true);
    });

    it('both alias targets are recorded as accepted holes', () => {
      expect([...ALIAS_HOLES].sort()).toEqual(['sell', 'upgrade']);
    });
  });

  /* --------------------------------------------------- harness self-checks */

  describe('classify() anti-vacuity — the oracle can actually say both things', () => {
    const specA = fieldSpec('build.tx'); // category A
    const specB = fieldSpec('dev.gold.amount'); // category B

    it('a thrown probe is always "threw", regardless of category', () => {
      expect(classify(specA, { threw: true, problems: [], digestChanged: false })).toBe('threw');
      expect(classify(specB, { threw: true, problems: [], digestChanged: true })).toBe('threw');
    });

    it('category A: any digest change is "accepted" even with no scanWorld problem', () => {
      expect(classify(specA, { threw: false, problems: [], digestChanged: true })).toBe('accepted');
    });

    it('category A: no change and no problem is "rejected"', () => {
      expect(classify(specA, { threw: false, problems: [], digestChanged: false })).toBe('rejected');
    });

    it('category B: a digest change alone is "rejected" (a legal magnitude is expected to move state)', () => {
      expect(classify(specB, { threw: false, problems: [], digestChanged: true })).toBe('rejected');
    });

    it('category B: a scanWorld problem is "accepted" regardless of the digest', () => {
      expect(classify(specB, { threw: false, problems: ['gold=NaN is not finite'], digestChanged: true })).toBe('accepted');
    });
  });

  it('runSingleProbe is deterministic (no hidden randomness in a fixed setup)', () => {
    const a = runSingleProbe('build.ty', 'fractional');
    const b = runSingleProbe('build.ty', 'fractional');
    expect(b).toEqual(a);
  });

  it('the worker path and the in-process path agree for a safe combination', async () => {
    const direct = runSingleProbe('rekindle.structureId', 'negative');
    const viaWorker = await probeInWorker('rekindle.structureId', 'negative', 4000);
    expect('hangs' in viaWorker).toBe(false);
    expect(viaWorker).toEqual(direct);
  }, 15000);

});
