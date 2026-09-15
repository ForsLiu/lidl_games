/**
 * fb064j — generator seed-domain hardening.
 *
 * `tests/terrain-generation.test.ts` pins the generator over seeds 1..1000
 * (and its Log records a 20000-seed sweep), which is not the domain a run seed
 * draws from. `src/ui/main.ts` starts a run with
 * `(Math.random() * 0xffffffff) >>> 0` — an unsigned 32-bit integer — so
 * roughly half of every real seed is at or above `2 ** 31`, a range nothing
 * had ever generated a map at.
 *
 * Two defects were found there and are fixed, each with its regression test
 * below:
 *
 *  1. **`requestedSeed` was `seed | 0`.** A run seed of `3000000000` reported
 *     `requestedSeed: -1294967296`, so the field could not be compared against
 *     `RunConfig.seed` at all on half the seed space. That is the same
 *     provenance destruction the `Number.isInteger` guard exists to prevent
 *     (see its comment in `generate.ts`), happening in the *normal* case
 *     rather than the corrupt one.
 *  2. **Out-of-domain integers aliased silently.** `2 ** 32` and `2 ** 40` are
 *     integers, so they passed the integer guard and then landed on seed 0's
 *     map with `requestedSeed: 0`; `Number.MAX_SAFE_INTEGER` landed on seed
 *     -1's. A caller could not tell that from a real seed-0 run.
 *
 * The rest of the file is the measurement the item asks for: determinism and
 * full band legality at every edge of the domain, the retry walk exercised in
 * the negative range and across both wraps, and a golden hash per region so a
 * scatter-order change cannot fork the far end of the seed space while the
 * 1..1000 sweep stays green.
 */

import { describe, expect, it } from 'vitest';

import {
  generateTerrain,
  loadTerrain,
  MAX_TERRAIN_SEED,
  MIN_TERRAIN_SEED,
  measureTerrain,
  parseTerrain,
  terrainLegal,
  type TerrainConfig,
  type TerrainMap,
} from '../src/sim/terrain';
import { legalUnder } from './terrain-legality';

/*
 * The re-derivation this file asserts through lives in `tests/terrain-legality.ts`
 * (fb064v), which also explains why these suites must not call `terrainLegal`
 * directly: the generator returns a non-fallback map only when `terrainLegal`
 * passed under the same config, so `terrainLegal(measure(map))` is implied by
 * `fallback === false` and could never fail independently here. This file used
 * to carry its own copy; it had drifted from `terrainLegal` by fb064o's two
 * `maxGateDetour` terms, in precisely the way that comment warned about.
 */

const cfg = loadTerrain();

function withConfig(patch: (raw: Record<string, unknown>) => void): TerrainConfig {
  const raw = JSON.parse(JSON.stringify(cfg)) as Record<string, unknown>;
  patch(raw);
  return parseTerrain(raw);
}

/** Sanity: the re-derivation agrees with `terrainLegal` on a real map. */
function legalUnderMatchesFlag(m: TerrainMap, c: TerrainConfig): boolean {
  return legalUnder(m, c) === terrainLegal(measureTerrain(m, c), c);
}

/** How a run actually picks a seed: `src/ui/main.ts`'s new-run draw. */
const runSeed = (r: number): number => (r * 0xffffffff) >>> 0;

describe('fb064j — the accepted seed domain', () => {
  it('is the uint32 a run draws from, plus the int32 negatives tools use', () => {
    expect(MIN_TERRAIN_SEED).toBe(-(2 ** 31));
    expect(MAX_TERRAIN_SEED).toBe(2 ** 32 - 1);
    for (const s of [MIN_TERRAIN_SEED, -1, 0, 2 ** 31 - 1, 2 ** 31, MAX_TERRAIN_SEED]) {
      const m = generateTerrain(s, cfg);
      expect(m.requestedSeed).toBe(s);
      expect(legalUnder(m, cfg)).toBe(true);
    }
  });

  it('round-trips requestedSeed for a uint32 run seed (was `seed | 0`)', () => {
    // The regression. Before the fix these reported -1294967296, -1 and
    // -2147483648 respectively — an unsigned run seed cannot be recovered from
    // a signed report, so `map.requestedSeed === RunConfig.seed` was false for
    // every seed at or above 2 ** 31, which is about half of all real runs.
    for (const s of [3000000000, MAX_TERRAIN_SEED, 2 ** 31, runSeed(0.7), runSeed(0.999)]) {
      expect(s).toBeGreaterThanOrEqual(2 ** 31);
      expect(generateTerrain(s, cfg).requestedSeed).toBe(s);
    }
    // ...and the negatives still round-trip verbatim rather than being folded
    // to their unsigned twin: provenance is what the caller passed.
    for (const s of [-1, -12345, MIN_TERRAIN_SEED]) {
      expect(generateTerrain(s, cfg).requestedSeed).toBe(s);
    }
  });

  it('refuses an out-of-domain integer instead of aliasing it onto a real seed', () => {
    // The second regression. Each of these is an integer, so `isInteger` waved
    // it through, and `| 0` then dropped it onto a legitimate seed's map: the
    // first two onto seed 0, MAX_SAFE_INTEGER onto seed -1 (0xffffffff).
    for (const s of [2 ** 32, 2 ** 40, Number.MAX_SAFE_INTEGER, -(2 ** 31) - 1, -(2 ** 32) - 5]) {
      expect(() => generateTerrain(s, cfg)).toThrow(/seed must be in/);
    }
    // One below the floor is the sharpest of these: under `| 0` it did not
    // land on a neighbouring seed, it became the domain's *ceiling*
    // (`-(2 ** 31) - 1 | 0 === 2147483647`).
    expect(generateTerrain(MIN_TERRAIN_SEED, cfg).requestedSeed).toBe(MIN_TERRAIN_SEED);
    expect(generateTerrain(2 ** 31 - 1, cfg).requestedSeed).toBe(2 ** 31 - 1);
  });

  it('normalises -0 rather than storing a seed that fails Object.is', () => {
    // `Number.isInteger(-0)` is true and `-0 < MIN_TERRAIN_SEED` is false, so
    // `-0` passes both guards. Stored verbatim it compares equal to 0 under
    // `===` but not under `Object.is` — which is what vitest's `toBe`, a
    // deep-equal on the map and a JSON round-trip of a saved run all use. It
    // is reachable from any `Number(argv)` seed path: `Number('-0')` is `-0`.
    const m = generateTerrain(-0, cfg);
    expect(Object.is(m.requestedSeed, 0)).toBe(true);
    expect(m.hash).toBe(generateTerrain(0, cfg).hash);
  });

  it('still refuses a non-integer (fb064a guard kept alive)', () => {
    for (const bad of [NaN, Infinity, -Infinity, 0.4, -0.5, 2 ** 31 + 0.5]) {
      expect(() => generateTerrain(bad, cfg)).toThrow(/must be an integer/);
    }
  });

  it('reports a Symbol from the guard, not from the guard’s own message', () => {
    // `${seed}` throws `Cannot convert a Symbol value to a string` while
    // *building* the rejection, so the caller saw a TypeError from inside the
    // validator instead of the validator's verdict. Out of contract for a
    // `number` parameter, but a guard should not fail while explaining itself.
    expect(() => generateTerrain(Symbol('x') as unknown as number, cfg)).toThrow(
      /must be an integer/,
    );
  });

  it('quotes a domain in the rejection message that itself loads', () => {
    // fb064g's lesson: a rejection that prints a number the loader then also
    // refuses sends a designer round in a circle.
    let msg = '';
    try {
      generateTerrain(2 ** 32, cfg);
    } catch (e) {
      msg = (e as Error).message;
    }
    const nums = (msg.match(/-?\d+/g) ?? []).map(Number);
    expect(nums).toContain(MIN_TERRAIN_SEED);
    expect(nums).toContain(MAX_TERRAIN_SEED);
    for (const n of [MIN_TERRAIN_SEED, MAX_TERRAIN_SEED]) {
      expect(() => generateTerrain(n, cfg)).not.toThrow();
    }
  });
});

/**
 * The regions. `kind` is keyed on the uint32 reduction of the seed, so the
 * negatives are *not* an independent sample — [-400, 0) is bit-for-bit
 * [0xfffffe70, 0xffffffff]. The regions below are therefore chosen as distinct
 * uint32 windows, with the alias identity pinned separately rather than
 * measured twice under two names.
 */
const REGION_N = 400;
/**
 * Largest odd stride not exceeding `2 ** 32 / REGION_N`.
 *
 * Corrected at fb064r (review): this said "largest odd stride whose
 * `REGION_N`-th step still lands inside the domain", which is a different and
 * larger number — at `REGION_N: 400` that would be 10764329, not 10737419.
 * Both span the domain, which is all this needs; the claim was just wrong.
 */
const COMB_STEP = 2 * Math.floor(2 ** 32 / REGION_N / 2) + 1;
const REGIONS: ReadonlyArray<{ name: string; start: number; step?: number }> = [
  { name: 'int32 min (0x80000000)', start: MIN_TERRAIN_SEED },
  { name: 'negatives near zero (= uint32 top)', start: -REGION_N },
  { name: 'int32 max, walking up to the signed wrap', start: 2 ** 31 - REGION_N },
  { name: 'the unsigned half a run draws from', start: 3000000000 },
  // A coarse comb across the whole domain: the windows above are contiguous,
  // and a defect that only bites on some bit pattern in between would slip
  // through four contiguous windows of 400.
  //
  // The stride must actually span the domain. The first draft used `10726`,
  // whose largest seed is 4_279_674 — 0.0996% of `2 ** 32`, entirely below
  // `2 ** 31`, and inside territory fb064a's 1..20000 sweep already covers.
  // That made the one region whose stated job is "not a contiguous window"
  // a fifth contiguous window: a sample dressed as a property, which is the
  // failure this lane's Log keeps recording. Found in code review.
  //
  // Odd, so the low bits vary too — an even stride from 0 only ever visits
  // even seeds, and `fnv1a`/`mulberry32` are bit-mixing functions.
  { name: 'comb across the whole uint32 domain', start: 0, step: COMB_STEP },
];

describe('fb064j — determinism and band legality across the whole domain', () => {
  for (const region of REGIONS) {
    it(`${region.name}: every seed is legal, non-fallback, and reproducible`, () => {
      const step = region.step ?? 1;
      const illegal: number[] = [];
      const fellBack: number[] = [];
      const notReproduced: number[] = [];
      const badProvenance: number[] = [];
      const disagreed: number[] = [];
      for (let i = 0; i < REGION_N; i++) {
        const s = region.start + i * step;
        const key = s >>> 0;
        const a = generateTerrain(s, cfg);
        if (!legalUnder(a, cfg)) illegal.push(s);
        if (!legalUnderMatchesFlag(a, cfg)) disagreed.push(s);
        if (a.fallback) fellBack.push(s);
        // `seed === s >>> 0` only holds when `attempts === 1`. The shipped
        // config DOES retry (fb064a pins seeds 1227/3219/4596/7010/8102), and
        // fb064f hands the densities to live Tuner edits, so the first draft's
        // form would have turned a correct retried map red under the label
        // "badProvenance" — the wrong diagnosis, pointing the next engineer at
        // the fix this item shipped. Found independently by review and QA.
        if (a.requestedSeed !== s || a.seed !== (key + a.attempts - 1) >>> 0) {
          badProvenance.push(s);
        }
        // Determinism is asserted on every seed in the region, not a sample:
        // it is the cheap half of the loop and it is the G2 property.
        const b = generateTerrain(s, cfg);
        if (b.hash !== a.hash || !b.kind.every((k, j) => k === a.kind[j])) notReproduced.push(s);
      }
      expect({ illegal, fellBack, notReproduced, badProvenance, disagreed }).toEqual({
        illegal: [],
        fellBack: [],
        notReproduced: [],
        badProvenance: [],
        disagreed: [],
      });
    });
  }
});

describe('fb064j — provenance survives the retry path', () => {
  it('holds on a config where region seeds actually retry', () => {
    // The five regions above take 0 retries under shipped `/data`, so the
    // corrected provenance form (`key + attempts - 1`) is never exercised with
    // `attempts > 1` there — it would pass under the *wrong* form too. QA
    // asked for this case explicitly.
    //
    // The band is `minCoreLegalFrac: 0.5`, measured at 76 retries and 0
    // fallbacks over these 300 seeds. `minWalkableFrac: 0.62` was tried first
    // (QA's own repro band) and measured 0 retries on these three windows —
    // recorded because it looked like the obvious choice and would have
    // shipped a test that asserts nothing about the retry path.
    const retryHeavy = withConfig((raw) => {
      (raw.constraints as Record<string, number>).minCoreLegalFrac = 0.5;
    });
    let retried = 0;
    const badProvenance: number[] = [];
    for (const start of [3000000000, -200, 2 ** 31 - 100]) {
      for (let i = 0; i < 100; i++) {
        const s = start + i;
        const m = generateTerrain(s, retryHeavy);
        if (m.fallback) continue;
        if (m.attempts > 1) retried++;
        if (m.requestedSeed !== s || m.seed !== ((s >>> 0) + m.attempts - 1) >>> 0) {
          badProvenance.push(s);
        }
        expect(legalUnder(m, retryHeavy)).toBe(true);
      }
    }
    expect(badProvenance).toEqual([]);
    expect(retried).toBeGreaterThan(0);
  });
});

describe('fb064j — signed and unsigned views of one key are one map', () => {
  it('a negative seed and its uint32 twin generate identical tiles', () => {
    // Not a coincidence to be tidied away later: `attempt()` keys the RNG on
    // `seed >>> 0`, so this is the definition of the domain. What differs is
    // provenance, which is the point of keeping `requestedSeed` verbatim.
    for (const s of [-1, -500, -12345, MIN_TERRAIN_SEED]) {
      const neg = generateTerrain(s, cfg);
      const pos = generateTerrain(s >>> 0, cfg);
      expect(Array.from(pos.kind)).toEqual(Array.from(neg.kind));
      expect(pos.hash).toBe(neg.hash);
      expect(pos.seed).toBe(neg.seed);
      expect(pos.requestedSeed).toBe(s >>> 0);
      expect(neg.requestedSeed).toBe(s);
    }
  });
});

describe('fb064j — the retry walk stays inside the domain', () => {
  // The band no shipped seed misses; `minCoreLegalFrac: 0.5` makes roughly a
  // quarter of seeds degenerate, which is what puts the retry path under test.
  const strict = withConfig((raw) => {
    (raw.constraints as Record<string, number>).minCoreLegalFrac = 0.5;
  });
  /** `strict`'s generation parameters with every band switched off. */
  const alwaysAccepts = withConfig((raw) => {
    Object.assign(raw.constraints as Record<string, number>, {
      minWalkableFrac: 0,
      minBuildableNormalFrac: 0,
      minGateReachFrac: 0,
      minCoreLegalFrac: 0,
      minCorridorWidth: 1,
    });
  });

  it('the retry path runs in the negative range and lands on a legal map', () => {
    let retried = 0;
    for (let s = -60; s < 0; s++) {
      const m = generateTerrain(s, strict);
      expect(m.fallback).toBe(false);
      expect(m.requestedSeed).toBe(s);
      expect(m.seed).toBe((s + m.attempts - 1) >>> 0);
      expect(legalUnder(m, strict)).toBe(true);
      if (m.attempts > 1) {
        retried++;
        // Every seed the walk stepped over must genuinely have been degenerate,
        // measured against the bands rather than re-read from the generator's
        // own report. fb064a's version asserted `generateTerrain(s + n).seed
        // !== s + n`, which only restates the walk the generator just performed
        // and can fail for nothing but non-determinism — already covered on
        // 2000 seeds by the region tests. QA caught the inherited weakness.
        //
        // `attempt(k)` is not exported, so `alwaysAccepts` reaches it: it
        // carries `strict`'s *generation* parameters unchanged (radii, jitter,
        // blob, densities — the only cfg fields `attempt` reads) with every
        // *fractional* band switched off, so it usually returns `attempt(k)`
        // itself on the first try. Measuring THAT map against `strict`'s bands
        // is an independent degeneracy test rather than a restatement of the
        // walk.
        //
        // `alwaysAccepts` deliberately leaves `maxGateDetour` at its shipped
        // 1.5 ceiling (it never turns off the approach band, matching
        // `tests/terrain-band-ledger.test.ts`'s `RETRY_SEEDS` tally, where
        // `maxGateDetour` is the band that actually drives most retries). So a
        // key whose own first candidate *also* fails the detour ceiling needs
        // a second sub-attempt here too — fb166 found one over seeds -60..-1
        // at 56x32 (seed -43's skipped key), where the old 36x20 window found
        // none.
        //
        // When that happens, `raw` is attempt(k+1)'s map, not attempt(k)'s —
        // and when `k` is the *last* skipped key (`n === m.attempts - 2`),
        // `k + 1` is the very key `strict`'s own walk landed on, so `raw` is
        // byte-identical to `m` and is legal by construction (`m` is what
        // `generateTerrain` just returned). The degeneracy claim is only about
        // the *skipped* key, so it is asserted on `raw.attempts === 1` only;
        // the coincidental compounding case is recorded here rather than
        // asserted the opposite way, which would be true today but is a
        // narrower coincidence than the general rule this loop states.
        for (let n = 0; n < m.attempts - 1; n++) {
          const k = (s + n) >>> 0;
          const raw = generateTerrain(k, alwaysAccepts);
          expect(raw.attempts).toBeLessThanOrEqual(2);
          expect(raw.fallback).toBe(false);
          if (raw.attempts === 1) {
            expect(legalUnder(raw, strict)).toBe(false);
          }
        }
      }
    }
    expect(retried).toBeGreaterThan(0);
  });

  it('a walk off the top of int32 continues into the unsigned half', () => {
    // `(requested + n) | 0` used to report this map's seed as -2147483648.
    // The tiles were always right — `attempt` reduces to uint32 either way —
    // but the reported seed left the domain it claims to be in.
    //
    // fb166 re-measured this at 56x32: `minCoreLegalFrac` around the key
    // 2 ** 31 - 1 no longer offers a *three*-step walk. The three candidates'
    // `coreLegalFrac` are 0.494624 (2**31 - 1), 0.538835 (2**31) and 0.521569
    // (2**31 + 1) — the middle key measures *higher* than the one after it,
    // so any band that rejects 2**31 - 1 and accepts 2**31 also rejects
    // 2**31 + 1 (0.521569 < 0.538835), and the walk runs a fourth step to
    // 2**31 + 2 (0.577301). That is a stronger demonstration of the same
    // arithmetic, not a weaker one: the walk still crosses the int32 boundary
    // and keeps counting past it rather than stopping on it, over one more
    // step than before.
    const crossing = withConfig((raw) => {
      (raw.constraints as Record<string, number>).minCoreLegalFrac = 0.539;
    });
    const m = generateTerrain(2 ** 31 - 1, crossing);
    expect(m.attempts).toBe(4);
    expect(m.seed).toBe(2 ** 31 + 2);
    expect(m.seed).toBeGreaterThan(0); // never the signed spelling
    expect(m.requestedSeed).toBe(2 ** 31 - 1);
    expect(m.fallback).toBe(false);
    const direct = generateTerrain(2 ** 31 + 2, crossing);
    expect(Array.from(m.kind)).toEqual(Array.from(direct.kind));
    expect(m.hash).toBe(direct.hash);
  });

  it('a walk off the top of uint32 wraps to seed 0 and, forced further, to seed 1', () => {
    // fb166: re-measured at 56x32. Unlike the old grid, seed -1's map
    // dominates seed 0's on every numeric band here (walkableFrac 0.732701
    // against 0.718192, buildableNormalFrac 0.601562 against 0.534040,
    // coreLegalFrac 0.557514 against 0.486938, maxGateDetour 1.0 against
    // 1.072) — so no single floor can reject 0xffffffff while accepting the
    // seed it wraps to; tightening `minWalkableFrac` enough to reject -1 also
    // rejects 0 (0.718192 is lower still), and the walk runs a third step to
    // seed 1 (0.736607, from the fb064k golden). That still exercises the
    // exact arithmetic this item is about — the retry walk crossing
    // `0xffffffff -> 0` rather than stopping or aliasing — it simply does not
    // stop at 0.
    const wrap = withConfig((raw) => {
      (raw.constraints as Record<string, number>).minWalkableFrac = 0.733;
    });
    for (const s of [-1, MAX_TERRAIN_SEED]) {
      const m = generateTerrain(s, wrap);
      expect(m.fallback).toBe(false);
      expect(m.attempts).toBe(3);
      expect(m.seed).toBe(1);
      expect(m.requestedSeed).toBe(s);
      expect(legalUnder(m, wrap)).toBe(true);
      const direct = generateTerrain(1, wrap);
      expect(Array.from(m.kind)).toEqual(Array.from(direct.kind));
      expect(m.hash).toBe(direct.hash);
    }
  });
});

describe('fb064j — provenance on the fallback map', () => {
  // The file had no fallback case at all, so `types.ts`'s newly tightened
  // wording for `seed` ("advanced by one per degenerate attempt") was
  // unfalsifiable — and false. The flat map is not any key's output, so the
  // fallback branch reports the *unadvanced* key. QA caught the doc, not the
  // code: reporting an advanced seed would name a key that did not produce
  // these tiles.
  const impossible = withConfig((raw) => {
    (raw.constraints as Record<string, number>).minCoreLegalFrac = 0.9;
    (raw as Record<string, number>).maxAttempts = 64;
  });

  it('keeps the requested seed verbatim and the key unadvanced', () => {
    for (const s of [-1, MAX_TERRAIN_SEED, MIN_TERRAIN_SEED, 3000000000]) {
      const m = generateTerrain(s, impossible);
      expect(m.fallback).toBe(true);
      expect(m.attempts).toBe(impossible.maxAttempts);
      expect(m.requestedSeed).toBe(s);
      expect(m.seed).toBe(s >>> 0);
    }
  });
});

describe('fb064j — the band cliff is a property of the whole domain', () => {
  it('pins the closest-found seeds to the walkable floor across the domain', () => {
    // fb064a's Log recorded a seed at walkableFrac exactly 0.600000 on the old
    // 36x20 grid (720 tiles), where `0.6 * 720 = 432` is an integer — so a map
    // could land exactly on the `>= 0.60` band with zero headroom.
    //
    // fb166: at 56x32 (1792 tiles), `0.6 * 1792 = 1075.2` is **not** an
    // integer, so no map can ever measure `walkableFrac` at exactly 0.6 —
    // `walkableCount` is always an integer, and no integer divided by 1792
    // equals 0.6 exactly. The smallest a map *could* clear the band by is one
    // tile at 1076/1792 = 0.600893; the smallest actually found by a
    // ~320,000-seed search (seeds 1..20000 plus a 300,000-seed comb across the
    // full domain) is one tile short of that again, at 1077/1792 = 0.601004 —
    // found independently at seed 13620 (the near window) and seed
    // 1721604933 (the domain comb), which is the same kind of "two
    // independent witnesses on one value" fb064r's ledger records for the
    // old grid's exact floor. This is a *search result*, not a proof: a wider
    // search may yet find 1076/1792, and this pins what was actually found
    // rather than claiming otherwise.
    for (const s of [13620, 1721604933]) {
      const m = generateTerrain(s, cfg);
      const q = measureTerrain(m, cfg);
      expect(m.fallback).toBe(false);
      expect(q.walkableCount).toBe(1077);
      expect(q.walkableFrac).toBeCloseTo(1077 / 1792, 10);
      expect(q.walkableFrac).toBeGreaterThan(cfg.constraints.minWalkableFrac);
      expect(legalUnder(m, cfg)).toBe(true);
    }
    expect(generateTerrain(13620, cfg).hash).toBe('5c18ed6d');
    expect(generateTerrain(1721604933, cfg).hash).toBe('f3723519');
  });
});

describe('fb064j — golden hash per region', () => {
  it('matches the recorded goldens at every edge of the domain', () => {
    // fb064a recorded goldens for seeds 1/2/42/1000 only, so a change to
    // `Rng`, to `fnv1a`'s seeding or to the scatter order could fork the far
    // end of the seed space with that sweep entirely green. One per region,
    // plus both wrap edges. Changing these is a deliberate act paired with
    // invalidating stored replays, not a diff nobody notices.
    //
    // Ten labels, eight distinct maps: `MIN_TERRAIN_SEED`/`2 ** 31` and
    // `-1`/`MAX_TERRAIN_SEED` are the signed and unsigned spellings of one key
    // each, by the alias identity pinned above. Deliberate — the duplicate
    // pair is what pins that the alias survives a scatter-order change.
    const golden = (s: number): string => generateTerrain(s, cfg).hash;
    expect({
      '-2147483648': golden(MIN_TERRAIN_SEED),
      '-12345': golden(-12345),
      '-1': golden(-1),
      '0': golden(0),
      '2147483646': golden(2 ** 31 - 2),
      '2147483647': golden(2 ** 31 - 1),
      '2147483648': golden(2 ** 31),
      '3000000000': golden(3000000000),
      '4294967294': golden(2 ** 32 - 2),
      '4294967295': golden(MAX_TERRAIN_SEED),
    }).toEqual({
      '-2147483648': '6a928728',
      '-12345': 'f880b586',
      '-1': '558a07a4',
      '0': 'a9dddeee',
      '2147483646': '2d571b53',
      '2147483647': '2bda43a5',
      '2147483648': '6a928728',
      '3000000000': '5fc66ec9',
      '4294967294': 'fd2a82d0',
      '4294967295': '558a07a4',
    });
  });

  it("fb064a's goldens are untouched by the domain change", () => {
    // The fb064j fix moves `| 0` to `>>> 0` in the retry walk. Those agree
    // modulo 2 ** 32 and `attempt` reduces to uint32 anyway, so no map's tiles
    // may move — restate fb064a's four here so a "harmless" widening that does
    // move them fails in this file too, not only in a file the change did not
    // appear to touch.
    //
    // fb166 re-recorded all four literals: the grid flip to 56x32 moves every
    // map (a real, expected change, unlike the domain-fix regression this test
    // guards against), so the hashes below are the new baseline this test
    // pins against future *non-grid* changes.
    //
    // **Read with every since-fb064a switch at its off value** — `jitter: 0`
    // (fb064l) and `highContestRadius: 0` (fb064m) — and that is the point
    // rather than a workaround: both fields are true no-ops when off, so this
    // *is* fb064a's generator and these four are still fb064a's recorded values
    // byte for byte. The shipped-config goldens moved at fb064l and again (seed
    // 1 only) at fb064m, both recorded in `terrain-generation.test.ts`; this
    // assertion is deliberately the one that did not, so the domain fix keeps a
    // witness that predates all of them. Every later generator change that
    // ships as an off-able field belongs in this list.
    const asFb064a = withConfig((raw) => {
      (raw.density as Record<string, number>).jitter = 0;
      (raw as Record<string, unknown>).highContestRadius = 0;
    });
    expect({
      1: generateTerrain(1, asFb064a).hash,
      2: generateTerrain(2, asFb064a).hash,
      42: generateTerrain(42, asFb064a).hash,
      1000: generateTerrain(1000, asFb064a).hash,
    }).toEqual({ 1: '4681c4e6', 2: '55140499', 42: 'd2553915', 1000: 'b3467625' });
  });
});
