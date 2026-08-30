/**
 * q8 — save round-trip equality property test.
 *
 * QUALITY.md ALPHA's save line, the other half of it: q3 fuzzes *corrupt*
 * saves and asserts the repair path never crashes or silently loses data.
 * That says nothing about the ordinary case — a save this client wrote,
 * reloaded by this client, with nothing to repair. SPEC-FINAL §14 G18 asks
 * for that explicitly: save round-trip.
 *
 * Two properties, for every generated meta `m`:
 *   1. `deserializeMeta(serializeMeta(m))` deep-equals `m` — a valid save does
 *      not change shape just by passing through the wire format.
 *   2. Loading a second time is a fixed point — the *loaded* meta, re-saved
 *      and re-loaded, equals itself. (Not idempotence of `m`, which is not
 *      guaranteed to be `migrate`-stable by construction; idempotence of
 *      whatever actually gets persisted, which is what G18 asks for.)
 *
 * `validMeta` is q3's generator (`tools/fuzz-save.ts`): every field populated,
 * `allocated` a connected walk of the real tree so it is legal by
 * construction. Reused rather than duplicated, since q3 already proved it
 * produces genuinely valid saves (`checkMeta(meta)` empty, round-trips to
 * itself) — this file only adds the deep-equality property and the
 * applyRunResult-grown half q3 does not cover.
 *
 * What this file does *not* reach, by construction of `validMeta`: every
 * generated save already has node 0 in `allocated`, is already connected, and
 * is already current-version-shaped, so `migrate`'s actual repair branches
 * (`src/meta/meta.ts`'s `allocated.unshift(0)`, the `isConnected` reset, the
 * `RETIRED_KEYS` strip) never fire across the 2000 main-sweep iterations —
 * that territory is q3's, correctly, since this lane may not edit `/src` to
 * fix what it would find. The one negative-control case below hand-corrupts a
 * meta specifically to touch the `unshift(0)` branch, so the property this
 * file asserts is proven capable of failing, not just proven to have run.
 */

import { describe, expect, it } from 'vitest';

import { validMeta } from '../tools/fuzz-save';
import { applyRunResult, deserializeMeta, serializeMeta } from '../src/meta/meta';
import { Run } from '../src/sim/run';
import { Rng } from '../src/sim/rng';
import type { RunReport } from '../src/sim/types';
import type { World } from '../src/sim/world';
import { cfg, runWithPolicy } from './helpers';

/**
 * Asserts both round-trip properties for one meta, with a labelled failure.
 *
 * The second-pass check is, for a `once` that already passed the first
 * assertion, logically implied by it: `deserializeMeta`/`serializeMeta` are
 * pure functions of their argument (architecture rule 1 — no `Math.random`,
 * `Date.now` or other hidden state), so replaying them on an input
 * structurally identical to `meta` recomputes the same `once`. It is kept as
 * its own assertion anyway because SPEC-FINAL G18 and q8's acceptance
 * criteria name it directly ("a second pass is a fixed point") as a pin on
 * the wire format, not because it is expected to catch a defect the first
 * line missed on well-formed input.
 */
function expectRoundTrips(label: string, meta: ReturnType<typeof validMeta>): void {
  const once = deserializeMeta(serializeMeta(meta));
  expect(once, label).toEqual(meta);
  const twice = deserializeMeta(serializeMeta(once));
  expect(twice, `${label} (second pass)`).toEqual(once);
}

describe('q8 save round-trip: valid saves are a fixed point', () => {
  it('round-trips 1500 seeded valid metas exactly', () => {
    const rng = new Rng(77);
    for (let i = 0; i < 1500; i++) {
      expectRoundTrips(`meta #${i}`, validMeta(rng));
    }
  });

  it('is reproducible from its seed, so the loop above is not vacuous', () => {
    const gen = (seed: number) => {
      const rng = new Rng(seed);
      return Array.from({ length: 50 }, () => serializeMeta(validMeta(rng))).join('|');
    };
    expect(gen(5)).toBe(gen(5));
    // ...and the seed is actually used, not ignored.
    expect(gen(5)).not.toBe(gen(6));
  });

  it('the round-trip check can actually fail: a hand-corrupted meta is caught', () => {
    // Negative control: nothing above proves `expectRoundTrips` is capable of
    // failing, only that it did not. `validMeta` never omits node 0 from
    // `allocated`, so this reaches the one `migrate` repair branch (the
    // `unshift(0)`, `src/meta/meta.ts`) a generator-only sweep cannot: dropping
    // it repairs *back* to a save that still lacks it, so the repaired result
    // and the corrupted input this asserts against genuinely differ.
    const meta = validMeta(new Rng(999));
    const corrupted = { ...meta, allocated: meta.allocated.filter((id) => id !== 0) };
    expect(() => expectRoundTrips('corrupted', corrupted)).toThrow();
  });
});

/**
 * Five distinct (report, world) pairs, each built from a real `Run` rather
 * than hand-authored — this is what makes "grown through applyRunResult"
 * mean what it says. Built once and reused across many starting metas.
 *
 * `applyRunResult` reads `report` and `world.equipmentFound`. Reusing the
 * same 5 `World`s across many calls is safe here only because nothing
 * downstream ever reads those fields back after the fact — each call's
 * growth is computed fresh from `report`/`world` and written into a new
 * `MetaState`, not accumulated on the `World` itself.
 */
function buildGrowthCases(): { label: string; report: RunReport; world: World }[] {
  const cases: { label: string; report: RunReport; world: World }[] = [];

  // A practice run: applyRunResult must be an identity here (banks nothing),
  // which is the edge case where "grown" and "ungrown" coincide.
  {
    const run = new Run({ ...cfg(), practice: true, policy: 'none' });
    run.step({ mx: 0, my: 0, dash: false, attack: false, aimX: 0, aimY: 0, active1Held: false, cmds: [{ k: 'dev', op: 'gold', amount: 999 }] });
    cases.push({ label: 'practice', report: run.report(), world: run.world });
  }

  // A single-tick run with no equipment found: the minimal non-practice growth.
  {
    const run = new Run({ ...cfg(), policy: 'none' });
    run.step();
    cases.push({ label: 'ordinary-short', report: run.report(), world: run.world });
  }

  // A run with equipment found and waves cleared, at a higher tier, so the
  // reward/quest arithmetic in applyRunResult actually moves.
  {
    const run = new Run({ ...cfg({ tier: 3 }), policy: 'none' });
    run.step();
    const w = run.world;
    w.equipmentFound.push('greatsword', 'normal_armor');
    w.wavesCleared = 4;
    cases.push({ label: 'equipment-tier3', report: run.report(), world: w });
  }

  // A full real sim run, played to a quick defeat by a real bot policy.
  {
    const { report, run } = runWithPolicy(cfg({ seed: 1 }), 'no-move');
    cases.push({ label: 'no-move-full', report, world: run.world });
  }

  // A full real sim run, played longer by a building policy at tier 2 —
  // real weapons, boons and relics rather than hand-pushed stand-ins.
  {
    const { report, run } = runWithPolicy(cfg({ seed: 2, tier: 2 }), 'hybrid');
    cases.push({ label: 'hybrid-tier2-full', report, world: run.world });
  }

  return cases;
}

describe('q8 save round-trip: metas grown through a real applyRunResult', () => {
  const cases = buildGrowthCases();

  it('reaches every growth case', () => {
    // Anti-vacuity: if a case failed to build (e.g. threw during setup) the
    // loop below would just never touch it and the suite would stay green.
    expect(cases.map((c) => c.label)).toEqual([
      'practice',
      'ordinary-short',
      'equipment-tier3',
      'no-move-full',
      'hybrid-tier2-full',
    ]);
    // `report.vsWavesCleared` is what `applyRunResult` banks into
    // `skillPoints`, §8.2/§8.3 — check that it is always well-formed.
    for (const c of cases) {
      expect(Number.isFinite(c.report.vsWavesCleared), c.label).toBe(true);
    }
  });

  // The starting `meta` forks `applyRunResult`'s own behaviour on only a
  // handful of binary/near-binary conditions (the stash-capacity break, the
  // highestTier bump, whether a quest is already completed) — a handful of
  // representative metas would cover those branches. What 500 buys on top of
  // that is stress on `serializeMeta`/`deserializeMeta` across the same value
  // diversity the 1500-case sweep above already covers, now composed with a
  // real reward/quest write — cheap insurance, not branch coverage.
  it('round-trips 500 metas grown through applyRunResult, and a second pass is a fixed point', () => {
    const rng = new Rng(101);
    for (let i = 0; i < 500; i++) {
      const startCase = cases[i % cases.length];
      const base = validMeta(rng);
      const grown = applyRunResult(base, startCase.report, startCase.world);
      expectRoundTrips(`${startCase.label} #${i}`, grown);
    }
  });
});
