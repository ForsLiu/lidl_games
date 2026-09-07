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
  // The band no shipped seed misses; `minCoreLegalFrac: 0.53` makes roughly a
  // quarter of seeds degenerate, which is what puts the retry path under test.
  // Re-measured at fb156's four-gate layout: `0.5` (fb166's value) now
  // retries 0 of the 60 seeds this file walks — the fourth gate gives the
  // generator another way to clear a low bar — so the threshold moved up to
  // where the walk is exercised again (17 of 60 retry at 0.53).
  const strict = withConfig((raw) => {
    (raw.constraints as Record<string, number>).minCoreLegalFrac = 0.53;
  });
  /**
   * `strict`'s generation parameters with every band switched off.
   *
   * `maxGateDetour` joined the override at the 56x32 re-fit: it has no
   * ceiling in the schema (`config.ts` — "a large value is a legitimate
   * 'band off'"), but this object had never set one, so it silently kept
   * carrying whatever `cfg.constraints.maxGateDetour` ships with. At 36x20 no
   * seed in this file's ranges ever measured a detour past that ceiling, so
   * the gap cost nothing; at 56x32, one seed in `-60..0`'s walk does (a bigger
   * arena admits bigger detours), and "every band switched off" stopped being
   * true. Found here rather than argued: without this line the test below
   * failed on seed -43's walk with `raw.attempts` 2, not the 1 an actually
   * band-free config guarantees.
   */
  const alwaysAccepts = withConfig((raw) => {
    Object.assign(raw.constraints as Record<string, number>, {
      minWalkableFrac: 0,
      minBuildableNormalFrac: 0,
      minGateReachFrac: 0,
      minCoreLegalFrac: 0,
      minCorridorWidth: 1,
      maxGateDetour: 1e6,
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
        // band switched off, so it returns `attempt(k)` itself on the first
        // try. Measuring THAT map against `strict`'s bands is an independent
        // degeneracy test rather than a restatement of the walk.
        for (let n = 0; n < m.attempts - 1; n++) {
          const k = (s + n) >>> 0;
          const raw = generateTerrain(k, alwaysAccepts);
          expect(raw.attempts).toBe(1);
          expect(raw.fallback).toBe(false);
          expect(legalUnder(raw, strict)).toBe(false);
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
    // The band is local rather than `strict` since fb064l: at
    // `minCoreLegalFrac: 0.53` the key 2 ** 31 - 1 is accepted, so there is no
    // walk left to test.
    //
    // **Re-measured again at fb156's four-gate layout**, and the direction
    // flipped from the fb166-era note this replaces: key 2 ** 31 - 1 now
    // measures *higher* on every band than key 2 ** 31 (coreLegalFrac
    // 0.604416 vs 0.556497, walkable 0.741629 vs 0.738281), so no single
    // `minCoreLegalFrac` threshold can reject the first and accept the
    // second — the old two-step shape is not available at this layout.
    // `minWalkableFrac` does the job instead, over three keys rather than
    // two: key 2 ** 31 - 1 measures 0.741629, key 2 ** 31 measures 0.738281
    // (still below it), and key 2 ** 31 + 1 measures 0.748326 — the first key
    // past the starting point's own share. `minWalkableFrac: 0.742` rejects
    // the first two and accepts the third, so this is a three-step walk now,
    // landing past 2 ** 31 rather than exactly on it. That is still the
    // arithmetic the fb064j fix is about: a naive `(requested + n) | 0` would
    // have reported this candidate's seed as a negative int32 partway through
    // the walk. This is a fact about the current scatter, not a rule the
    // schema enforces — a future retune may move the walk's length or
    // direction again, and that is this test's job to catch, not a
    // regression to chase.
    const crossing = withConfig((raw) => {
      (raw.constraints as Record<string, number>).minWalkableFrac = 0.742;
    });
    const m = generateTerrain(2 ** 31 - 1, crossing);
    expect(m.attempts).toBe(3);
    expect(m.seed).toBe(2 ** 31 + 1);
    expect(m.seed).toBeGreaterThan(0); // never the signed spelling
    expect(m.requestedSeed).toBe(2 ** 31 - 1);
    expect(m.fallback).toBe(false);
    const direct = generateTerrain(2 ** 31 + 1, crossing);
    expect(Array.from(m.kind)).toEqual(Array.from(direct.kind));
    expect(m.hash).toBe(direct.hash);
  });

  it('a walk off the top of uint32 wraps around and keeps counting from 0', () => {
    // No shipped-config seed reaches this, so the wrap is forced.
    //
    // **Re-measured at fb156's four-gate layout.** `coreLegalFrac` at key
    // 0xffffffff is 0.552153, and the first key after the wrap to beat it is
    // key 11 (0.598696) — every key from 0 through 10 measures lower
    // (0.593437 down to 0.507828, none above the top key's own share). A
    // `minCoreLegalFrac` anywhere in (0.593437, 0.598696] — 0.595 here —
    // walks 0xffffffff and every key 0..10 as degenerate and lands on key 11,
    // which is the stronger demonstration anyway: the walk does not just
    // touch the wrap and stop, it keeps counting through it. Twelve attempts
    // is past the shipped `maxAttempts: 8`, so this fixture also raises it —
    // a property of this test's own config, not of `/data`.
    const wrap = withConfig((raw) => {
      (raw.constraints as Record<string, number>).minCoreLegalFrac = 0.595;
      (raw as Record<string, number>).maxAttempts = 20;
    });
    for (const s of [-1, MAX_TERRAIN_SEED]) {
      const m = generateTerrain(s, wrap);
      expect(m.fallback).toBe(false);
      expect(m.attempts).toBe(13);
      expect(m.seed).toBe(11);
      expect(m.requestedSeed).toBe(s);
      expect(legalUnder(m, wrap)).toBe(true);
      const direct = generateTerrain(11, wrap);
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
  // TODO(fb166 resize): this pin is not a stale value, it is now provably
  // unsatisfiable and no seed search can fix that. At 36x20 the arena has
  // 720 tiles and `minWalkableFrac: 0.6` lands on the exact integer 432 =
  // 720 * 0.6, so a map at precisely zero headroom against the band is a real
  // floating-point value some seed can hit. At 56x32 the arena has 1792
  // tiles, and 1792 is not a multiple of 5 (1792 * 0.6 = 1075.2) — so no
  // integer `walkableCount` can ever divide out to the IEEE-754 double `0.6`
  // exactly. Checked exhaustively rather than argued: `k / 1792 === 0.6` is
  // false for every integer k in [0, 1792], because 0.6 itself is not exactly
  // representable and no `k/1792` rounds to that same stored double (the two
  // nearest candidates are 1075/1792 = 0.599888... and 1076/1792 =
  // 0.600446..., both measurably off it). This is a fact about the grid's
  // area and the band's decimal, not about the generator or this test.
  //
  // Left `.skip`ped per CLAUDE.md working rule 6 rather than deleted or
  // loosened to "close to the floor," which would quietly drop the "zero
  // headroom" claim the test exists to make. A real fix is one of: retune
  // `minWalkableFrac` to a value `data/terrain.json` can hit exactly at
  // 56x32 (e.g. anything of the form n/1792, or n/56, or n/32), or change
  // this test's claim to "the smallest walkableCount `generateTerrain` can
  // return is `Math.ceil(total * minWalkableFrac)`" (1076 here) and pin a
  // seed that hits *that* integer instead of the literal band value. Filed
  // as a real finding in this item's report rather than fixed here, since
  // both remedies are calls about `/data` or about the assertion's meaning,
  // not about re-measuring a number this file already commits to.
  it.skip('pins the far-domain seed that sits exactly on the walkable floor', () => {
    // fb064a's Log records seed 7957 at walkableFrac exactly 0.6000 against a
    // `>= 0.60` band — zero headroom, passing only because the band is `>=`.
    // That was measured over seeds 1..20000 and read as a fact about that
    // window. It is not: QA's 8.8M-seed re-measure bottoms out at exactly
    // 0.600000 in *every* window of the domain. This pins the far-domain twin
    // so a density retune that pushes the floor down goes red here too, not
    // only in the near window fb064a happened to sample.
    //
    // fb064l moved every map and so moved this pair (4294881754 / -85542
    // before). The floor itself did not move and structurally cannot: a map
    // below the band is regenerated at seed+1, so 0.600000 is the smallest
    // walkable share `generateTerrain` can *return*, and finding a seed that
    // sits exactly on it stayed a search rather than a surprise.
    //
    // (36x20-era seed pair kept below for provenance; at 56x32 no seed pair
    // can pass the `walkableFrac` assertion — see the TODO above.)
    for (const s of [4294805928, -161368]) {
      const m = generateTerrain(s, cfg);
      const q = measureTerrain(m, cfg);
      expect(m.fallback).toBe(false);
      expect(q.walkableCount).toBe(432);
      expect(q.walkableFrac).toBe(cfg.constraints.minWalkableFrac);
      expect(legalUnder(m, cfg)).toBe(true);
      // The two spellings are one key, so they are one map.
      expect(m.hash).toBe('471ef79e');
    }
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
      '-2147483648': '05da9e17',
      '-12345': 'c451d779',
      '-1': '0fa2bebb',
      '0': '2c0c332c',
      '2147483646': 'c9fc20e5',
      '2147483647': '38874522',
      '2147483648': '05da9e17',
      '3000000000': '5e79ce27',
      '4294967294': '87a1ca01',
      '4294967295': '0fa2bebb',
    });
  });

  it("fb064a's goldens are untouched by the domain change", () => {
    // The fb064j fix moves `| 0` to `>>> 0` in the retry walk. Those agree
    // modulo 2 ** 32 and `attempt` reduces to uint32 anyway, so no map's tiles
    // may move — restate fb064a's four here so a "harmless" widening that does
    // move them fails in this file too, not only in a file the change did not
    // appear to touch.
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
    }).toEqual({ 1: 'd4eed3a8', 2: '89b69c81', 42: '20de3e8d', 1000: 'af1667c2' });
  });
});
