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
  digest,
  FAMILIES,
  fieldSpec,
  FIELD_SPECS,
  probeInWorker,
  runAliasProbe,
  runCensus,
  runCoreUpgradeProbe,
  runSingleProbe,
  type CensusEntry,
  type Family,
} from '../tools/fuzz-command-domain';
import { runInPhase } from '../tools/fuzz-input';
import { buildTower } from '../src/sim/towers';
import { ALIAS_HOLES, HOLES } from './q15-command-domain-holes';

/**
 * Every numeric `Command` field this file fuzzes. `equip.relic` is
 * deliberately absent — see the header comment in
 * `tools/fuzz-command-domain.ts`. Merge port: `rekindle.structureId` left
 * with the p3d phase rework that deleted the command; the §4 class actives'
 * aim fields joined; the argument-free `upgrade_core` (§5.5) is covered by
 * its own dedicated probe below rather than a per-family row.
 */
const EXPECTED_FIELD_KEYS = [
  'build.tower',
  'build.tx',
  'build.ty',
  'upgrade.tx',
  'upgrade.ty',
  'sell.tx',
  'sell.ty',
  'pick.index',
  'class_active.aimX',
  'class_active.aimY',
  'class_active2.aimX',
  'class_active2.aimY',
  'dev.gold.amount',
  'dev.xp.amount',
  'dev.fast_forward.amount',
] as const;

/**
 * fb119 filed this whole suite `.skip`-ed after root-causing a real
 * `ERR_MODULE_NOT_FOUND` in the worker (a `worker_threads.Worker`'s
 * `--import tsx/esm` transforms its entry file but does not give that
 * file's own extensionless imports resolution, so `fuzz-command-domain-
 * worker.ts`'s `./fuzz-command-domain` import — and everything beneath it in
 * `/src/sim` — died at worker startup). fb172 landed the scoped fix this
 * file's old write-up asked for: `tools/fuzz-command-domain-worker-boot.mjs`
 * registers the loader *on the worker thread itself* before dynamically
 * importing the real worker, which is exactly what makes the transitive
 * extensionless graph resolve. That fix is live and this suite now runs and
 * passes in full (fb174 re-verified: 30/30 green) — the `.skip` above this
 * comment had gone stale and was still silently dropping the whole file
 * until fb174 removed it.
 */
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

  describe('closed finding (BACKLOG b006): dev gold/xp/fast_forward used to turn a non-finite amount into permanent non-finite run state', () => {
    // BACKLOG-QUALITY.md session 1 log found the NaN half of this by hand for
    // all three ops; this file's +Infinity half was worse for `xp`, which used
    // to hang rather than merely corrupt (see the closed finding below). Fixed
    // by a `Number.isFinite(amount)` guard per op in `applyDevCommand`
    // (`src/sim/run.ts`) — a non-finite amount is now a clean no-op, matching
    // every other illegal-argument family in this census.
    it('dev gold amount=NaN/Infinity is a clean no-op', () => {
      for (const family of ['nan', 'posInf'] as const) {
        const r = runSingleProbe('dev.gold.amount', family);
        expect(r.threw).toBe(false);
        expect(r.problems).toEqual([]);
      }
    });

    it('dev xp amount=NaN is a clean no-op', () => {
      const r = runSingleProbe('dev.xp.amount', 'nan');
      expect(r.threw).toBe(false);
      expect(r.problems).toEqual([]);
    });

    it('dev fast_forward amount=NaN/Infinity is a clean no-op', () => {
      for (const family of ['nan', 'posInf'] as const) {
        const r = runSingleProbe('dev.fast_forward.amount', family);
        expect(r.threw).toBe(false);
        expect(r.problems).toEqual([]);
      }
    });
  });

  describe('closed finding (BACKLOG b006): dev xp amount=Infinity used to hang the process', () => {
    // `addXp` (src/sim/progression.ts) does `w.xp += amount * xpMul; while
    // (w.xp >= xpToReach(w.level + 1)) { ...; w.level++ }`. With `w.xp =
    // Infinity` the comparison never turned false, so the loop counted
    // `level` up forever. `applyDevCommand`'s `Number.isFinite` guard now
    // keeps `Infinity` from ever reaching `addXp`. Run only through the
    // killable worker path — never in-process — for exactly the reason
    // `tools/fuzz-command-domain.ts`'s header explains: if this regresses, it
    // must time out the probe, not the test runner.
    it('settles within the probe deadline instead of hanging', async () => {
      const r = await probeInWorker('dev.xp.amount', 'posInf', 4000);
      expect('hangs' in r && r.hangs).toBe(false);
    }, 15000);

    // fb172 (code review): the case above asserts only the *negative* limb, so
    // nothing proved the deadline path still fires — and that path is the
    // whole reason these probes pay for a worker at all. It became newly
    // load-bearing when a `.mjs` bootstrap was put between parent and worker
    // to register the TS loader on the worker thread, since a bootstrap that
    // swallowed the timeout would leave a genuine hang hanging the runner
    // instead. A 1 ms deadline beats worker startup (~500 ms) every time, so
    // this forces the limb deterministically without needing a probe that
    // really loops forever.
    it('reports `hangs` and terminates the worker when the deadline is impossible', async () => {
      const r = await probeInWorker('pick.index', 'negative', 1);
      expect('hangs' in r && r.hangs).toBe(true);
    }, 15000);

    // fb173 (qa-playtester on fb172): `setTimeout` clamps any delay above
    // 2**31-1 — and `Infinity`/`NaN` — down to **1 ms**, so asking for a
    // *longer* deadline used to produce the shortest possible one and every
    // probe came back a false `hangs`. That is not hypothetical: it is
    // reachable through `bench/q44-worker-timing-probe.ts`, the tool built to
    // tell a real hang from a slow one, which reported "75/75 never resolved"
    // at a 3e9 ms ceiling — precisely the wrong conclusion, from the
    // instrument meant to prevent it. A rejected deadline is the only safe
    // answer: silently substituting 4000 would hide the caller's mistake.
    it.each([Infinity, NaN, 2 ** 31, -1, 0])('refuses the unusable deadline %p rather than clamping it to 1 ms', async (ms) => {
      await expect(probeInWorker('pick.index', 'negative', ms)).rejects.toThrow(/deadline/i);
    });
  });

  describe('runCensus() retries a load-induced hangs once before recording it (fb174)', () => {
    // A concurrent test run can stretch worker startup past the deadline
    // (measured 3/3 reproductions, a different combo hanging each time — the
    // signature of contention, not a real hang). Without a retry, that false
    // verdict is what the "matches the recorded holes exactly" test above
    // would see, and — worse, per fb174's filed report — is exactly what
    // used to reach `classify()` never at all while this suite was `.skip`-ed
    // (see this file's top comment), so nothing was ever red to say a
    // combination had gone untested. `runCensus`'s injectable `prober` param
    // (default `probeInWorker`) lets this prove the retry path without
    // paying for a real worker or a real timeout.
    it('a hangs verdict on the first attempt does not get recorded — the retried real outcome does', async () => {
      // Keyed on the target combo's own fieldKey/family, not on call order —
      // `runCensus`'s iteration order is an implementation detail this test
      // should not depend on.
      const targetKey = FIELD_SPECS[0].key;
      const targetFamily = FAMILIES[0];
      let targetCalls = 0;
      const fakeProber = async (fieldKey: string, family: Family) => {
        if (fieldKey === targetKey && family === targetFamily) {
          targetCalls++;
          if (targetCalls === 1) return { hangs: true as const };
        }
        // A non-empty `problems` classifies as 'accepted' for either
        // category (see `classify()`), so the expected verdict here does
        // not depend on which field this is.
        return { fieldKey, family, threw: false, problems: ['forced by fb174 test'], digestChanged: false };
      };
      const census = await runCensus(4000, 1, fakeProber);
      const total = FIELD_SPECS.length * FAMILIES.length;
      expect(census.length).toBe(total); // nothing dropped from the output
      expect(targetCalls).toBe(2); // exactly one retry, for the combo that hung
      const entry = census.find((e) => e.fieldKey === targetKey && e.family === targetFamily)!;
      expect(entry.verdict).toBe('accepted'); // surfaced the real outcome, not 'hangs'
      expect(entry.detail).toContain('forced by fb174 test');
    });

    it('a hangs verdict on one combo does not affect its concurrently-running neighbors', async () => {
      // The motivating scenario: one combo times out (load contention) while
      // several others, sharing the same `mapLimit` concurrency pool, resolve
      // normally at the same time.
      const targetKey = FIELD_SPECS[0].key;
      const targetFamily = FAMILIES[0];
      let targetCalls = 0;
      const fakeProber = async (fieldKey: string, family: Family) => {
        if (fieldKey === targetKey && family === targetFamily) {
          targetCalls++;
          if (targetCalls === 1) return { hangs: true as const };
        }
        return { fieldKey, family, threw: false, problems: [], digestChanged: false };
      };
      const census = await runCensus(4000, 6, fakeProber);
      const total = FIELD_SPECS.length * FAMILIES.length;
      expect(census.length).toBe(total);
      expect(targetCalls).toBe(2);
      const entry = census.find((e) => e.fieldKey === targetKey && e.family === targetFamily)!;
      expect(entry.verdict).toBe('rejected'); // surfaced, not left as 'hangs'
      // Every other combo resolved cleanly on its first (only) call, unaffected.
      for (const e of census) {
        if (e.fieldKey === targetKey && e.family === targetFamily) continue;
        expect(e.verdict).toBe('rejected');
      }
    });

    it('a combination that hangs twice is still recorded as hangs, not dropped or retried again', async () => {
      const fakeProber = async () => ({ hangs: true as const });
      const total = FIELD_SPECS.length * FAMILIES.length;
      const census = await runCensus(4000, total, fakeProber);
      expect(census.length).toBe(total);
      expect(census.every((e) => e.verdict === 'hangs')).toBe(true);
      expect(census.every((e) => e.detail.includes('retried once'))).toBe(true);
    });
  });

  describe('closed finding (BACKLOG b007): an out-of-grid tx used to alias onto a real tile one row up, for both upgrade and sell', () => {
    // `Grid.idx(tx, ty) = ty * GRID_W + tx` was never bounds-checked before
    // `World.structureAt` used it, unlike `Grid.buildable` (which checks
    // `inBounds` first). `illegalTx = realTx + GRID_W`, `illegalTy = realTy -
    // 1` computes to the same flat index as the real tile, so a command aimed
    // at a coordinate that is unambiguously off the 36x20 grid used to
    // resolve to — and mutate — a real structure. Fixed by making
    // `World.structureAt` itself reject a non-integer or out-of-bounds
    // `tx`/`ty` before ever indexing `grid.occ`.
    it.each(['upgrade', 'sell'] as const)('%s: idx still aliases arithmetically, but the real structure is no longer mutated', (which) => {
      const r = runAliasProbe(which);
      expect(r.idxMatches, 'the aliasing arithmetic itself did not line up as expected').toBe(true);
      expect(r.illegalTx).toBeGreaterThanOrEqual(36); // off-grid by construction (GRID_W)
      expect(r.threw).toBe(false);
      expect(r.problems).toEqual([]);
      expect(r.structureMutated).toBe(false);
    });

    it('neither alias target is recorded as an accepted hole any more', () => {
      expect([...ALIAS_HOLES].sort()).toEqual([]);
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

  describe('digest() (q24) — direct unit test, not just indirectly via runSingleProbe', () => {
    // Every category A hole recorded in HOLES today also happens to be
    // caught by scanWorld, so digest()'s own behaviour has never been
    // exercised directly — a future category A hole that scanWorld can't see
    // would depend on digest() alone with nothing testing it. Pin the
    // fields it's actually documented to track (gold, coreHp, structures)
    // plus act2Time (q24's own addition, tracking dev.fast_forward), and pin
    // that it's a fixed point when nothing tracked changes.
    it('changes when gold changes', () => {
      const w = runInPhase('act1_build').world;
      const before = digest(w);
      w.gold += 1;
      expect(digest(w)).not.toBe(before);
    });

    it('changes when coreHp changes', () => {
      const w = runInPhase('act1_build').world;
      const before = digest(w);
      w.coreHp -= 1;
      expect(digest(w)).not.toBe(before);
    });

    it('changes when a structure is added', () => {
      const w = runInPhase('act1_build').world;
      w.gold = 1e9;
      w.derived.buildRange = 1e6;
      const before = digest(w);
      const built = buildTower(w, w.content.towers.towers[0].id, 1, 1);
      expect(built.ok).toBe(true);
      expect(digest(w)).not.toBe(before);
    });

    it('changes when act2Time changes (q24 — dev.fast_forward would otherwise be invisible to it)', () => {
      const w = runInPhase('act2').world;
      const before = digest(w);
      w.act2Time += 100.5;
      expect(digest(w)).not.toBe(before);
    });

    it('is a fixed point when nothing tracked changes', () => {
      const w = runInPhase('act1_build').world;
      expect(digest(w)).toBe(digest(w));
    });
  });

  it('runSingleProbe is deterministic (no hidden randomness in a fixed setup)', () => {
    const a = runSingleProbe('build.ty', 'fractional');
    const b = runSingleProbe('build.ty', 'fractional');
    expect(b).toEqual(a);
  });

  it('the worker path and the in-process path agree for a safe combination', async () => {
    const direct = runSingleProbe('pick.index', 'negative');
    const viaWorker = await probeInWorker('pick.index', 'negative', 4000);
    expect('hangs' in viaWorker).toBe(false);
    expect(viaWorker).toEqual(direct);
  }, 15000);

  describe('upgrade_core (§5.5, merge port) — the argument-free command, probed at its own boundary', () => {
    // No numeric field to sweep, so the domain question becomes: fired past
    // the authored upgrade track's end, does it stop at the cap, refuse the
    // surplus as clean no-ops, and corrupt nothing?
    it('buys the whole track, refuses the surplus, and violates no invariant', () => {
      const r = runCoreUpgradeProbe();
      expect(r.threw, r.errorMessage ?? '').toBe(false);
      expect(r.stepCount).toBeGreaterThan(0);
      expect(r.boughtSteps).toBe(r.stepCount);
      expect(r.overbought).toBe(false);
      expect(r.surplusChangedState).toBe(false);
      expect(r.problems).toEqual([]);
    });
  });

});
