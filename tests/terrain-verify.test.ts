/**
 * fb064p — a patched tile is a findable bug.
 *
 * `TerrainMap.hash` is computed once at construction over a `Uint8Array` the
 * caller keeps a live reference to. `readonly kind` freezes the binding and not
 * the buffer, so `map.kind[i] = k` type-checks and runs, leaving the map
 * carrying the hash of tiles it no longer has. That hash is the G2 determinism
 * handle (architecture rule 2), so the corruption is silent and lands at a
 * distance — in a replay guard, on a different machine, weeks later.
 *
 * `verifyTerrainMap` is the detector. What this file pins:
 *   1. it is *clean on everything the generator makes* — 100 seeds spanning the
 *      whole `MIN_TERRAIN_SEED..MAX_TERRAIN_SEED` domain, both flat maps, and a
 *      map that took retries — because a verifier that cries wolf is one nobody
 *      asserts with;
 *   2. it catches a single flipped tile, at any index and to any kind,
 *      including the swaps a count-based check cannot see;
 *   3. the two structural faults the hash alone cannot report, since
 *      `terrainHash` folds `GRID_W`/`GRID_H` rather than the map's own `w`/`h`;
 *   4. the report is a paste-in diff (`expected` is what the map claims,
 *      `actual` is what its bytes say) and the fault order is cause-first;
 *   5. verifying does not itself mutate the map.
 */

import { describe, expect, it } from 'vitest';

import { GRID_H, GRID_W } from '../src/sim/grid';
import {
  flatTerrain,
  generateTerrain,
  isDegradedMap,
  loadTerrain,
  MAX_TERRAIN_SEED,
  MIN_TERRAIN_SEED,
  parseTerrain,
  terrainHash,
  TerrainKind,
  verifyTerrainMap,
  type TerrainConfig,
  type TerrainMap,
} from '../src/sim/terrain';

const cfg = loadTerrain();

function withConfig(patch: (raw: Record<string, unknown>) => void): TerrainConfig {
  const raw = JSON.parse(JSON.stringify(cfg)) as Record<string, unknown>;
  patch(raw);
  return parseTerrain(raw);
}

/** A config no seed can clear, so `generateTerrain` reaches its flat fallback. */
const impossible = withConfig((raw) => {
  (raw.constraints as Record<string, number>).minCoreLegalFrac = 0.9;
});

/**
 * Patches one tile of a map **in place**, which is the corruption under test:
 * `map.kind[i] = k` on a map handed out by the generator, exactly as a real
 * consumer could. Deliberately not a copy — rebuilding a map around a mutated
 * buffer would recompute the hash and test a different (and safe) thing.
 */
function flipInPlace(map: TerrainMap, i: number, to: TerrainKind): void {
  map.kind[i] = to;
}

/** Same fields, overridden — for the faults that need a malformed *shape*. */
function reshape(map: TerrainMap, over: Partial<TerrainMap>): TerrainMap {
  return { ...map, ...over };
}

/**
 * 100 seeds spanning the accepted domain (fb064j) rather than 1..100: half of
 * all real run seeds are at or above `2 ** 31`, and negatives are in the domain
 * too. Fixed, not random — a verifier's clean sweep must be reproducible.
 */
const DOMAIN_SEEDS: number[] = (() => {
  const out = [MIN_TERRAIN_SEED, -1, 0, 1, MAX_TERRAIN_SEED, MAX_TERRAIN_SEED - 1];
  const span = MAX_TERRAIN_SEED - MIN_TERRAIN_SEED;
  for (let i = 0; out.length < 100; i++) {
    // A fixed irrational-ish stride walks the whole domain without clustering.
    const s = MIN_TERRAIN_SEED + Math.floor(((i * 2654435761) % 4294967296) / 4294967296 * span);
    if (!out.includes(s)) out.push(s);
    // A degenerate stride would otherwise hang the suite instead of failing it.
    if (i > 10_000) throw new Error(`DOMAIN_SEEDS: only ${out.length} distinct seeds in 10k tries`);
  }
  return out;
})();

describe('fb064p — verifyTerrainMap is clean on everything the generator makes', () => {
  it('passes for 100 generated seeds across the whole accepted domain', () => {
    expect(DOMAIN_SEEDS).toHaveLength(100);
    const maps: TerrainMap[] = [];
    for (const seed of DOMAIN_SEEDS) {
      const map = generateTerrain(seed, cfg);
      maps.push(map);
      const res = verifyTerrainMap(map);
      // The seed is named in the failure so a red run is a repro, not a hunt.
      expect(res.ok ? 'ok' : `seed ${seed}: ${res.fault} ${res.expected} vs ${res.actual}`).toBe(
        'ok',
      );
    }
    // The sweep has to be *non-degenerate* to mean anything: if a generation
    // regression made every seed fall back to the flat arena, "clean on
    // everything the generator makes" would stay green on 100 identical maps.
    expect(maps.filter((m) => m.fallback)).toHaveLength(0);
    // 99, not 100: `-1` and `MAX_TERRAIN_SEED` are the same uint32 key and
    // produce one map by design (`types.ts` — provenance, not identity).
    expect(new Set(maps.map((m) => m.hash)).size).toBe(99);
  });

  it('passes for both flat maps — the direct one and the degraded fallback', () => {
    // `flatTerrain()` and the `maxAttempts` fallback are the same tiles under
    // different provenance (fb064n), and the fallback's `seed` is the
    // *unadvanced* key rather than the last one tried. Verification reads
    // `map.seed`, so if that ever drifted from the key the hash was built with,
    // this is where it shows.
    expect(verifyTerrainMap(flatTerrain())).toEqual({ ok: true });
    const fell = generateTerrain(11, impossible);
    expect(isDegradedMap(fell)).toBe(true);
    expect(verifyTerrainMap(fell)).toEqual({ ok: true });
  });

  it('passes for a map that took retries, whose seed is not the requested one', () => {
    // A degenerate-retry map hashes under `requestedSeed + n`, not under
    // `requestedSeed`. A verifier that reached for the tempting field would be
    // green on every first-attempt map and red only here, so the witness is
    // named rather than searched for: at the shipped config on the 56x32 grid,
    // **seed 387 is the first retry-taker** (the next are 694, 800, 1011,
    // 1145, 1902 — rescanned for fb166's resize; the 36x20 grid's witness,
    // seed 379, now clears on its first attempt because the larger arena is
    // more forgiving). If a retune moves that set this assertion goes red,
    // which is the intended cost — rescan for `attempts > 1` and rename the
    // seed.
    const map = generateTerrain(387, cfg);
    expect(map.fallback).toBe(false);
    expect(map.attempts).toBe(2);
    expect(map.seed).toBe(388);
    expect(map.seed).not.toBe(map.requestedSeed >>> 0);
    expect(verifyTerrainMap(map)).toEqual({ ok: true });
    // The handle is the *effective* seed's, not the requested one's — verifying
    // against `requestedSeed` here would report a clean map as corrupt.
    expect(map.hash).toBe(terrainHash(388, map.kind));
    expect(terrainHash(387, map.kind)).not.toBe(map.hash);
  });

  it('does not mutate the map it verifies', () => {
    const map = generateTerrain(7, cfg);
    const before = Array.from(map.kind);
    const hash = map.hash;
    verifyTerrainMap(map);
    verifyTerrainMap(map);
    expect(Array.from(map.kind)).toEqual(before);
    expect(map.hash).toBe(hash);
    expect(verifyTerrainMap(map)).toEqual({ ok: true });
  });
});

describe('fb064p — a patched tile is caught', () => {
  it('regression: one flipped tile on a generated map is a hash fault', () => {
    // The exact scenario `types.ts` asks callers not to create and, before this
    // item, nothing detected: a consumer patches one tile in place.
    const map = generateTerrain(3, cfg);
    expect(verifyTerrainMap(map)).toEqual({ ok: true });
    const stale = map.hash;
    const i = map.kind.findIndex((k) => k === TerrainKind.Normal);
    expect(i).toBeGreaterThanOrEqual(0);
    flipInPlace(map, i, TerrainKind.Rough);
    const res = verifyTerrainMap(map);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.fault).toBe('hash');
    // `expected` is the stale handle the map still advertises; `actual` is what
    // its bytes now hash to. Both are needed for the report to be actionable.
    expect(res.expected).toBe(stale);
    expect(res.actual).toBe(terrainHash(map.seed, map.kind));
    expect(res.actual).not.toBe(res.expected);
  });

  it('catches a flip at the first, last and an interior index', () => {
    for (const i of [0, GRID_W * GRID_H - 1, (GRID_W * GRID_H) >> 1]) {
      const map = generateTerrain(21, cfg);
      const was = map.kind[i];
      const to = was === TerrainKind.Rock ? TerrainKind.Normal : TerrainKind.Rock;
      flipInPlace(map, i, to);
      const res = verifyTerrainMap(map);
      expect(res.ok ? 'missed' : res.fault).toBe('hash');
    }
  });

  it('catches every single-tile kind change, at every index of a small sample', () => {
    // Exhaustive over the kinds rather than one flip: a hash that folded, say,
    // only a walkability bit would pass half of these.
    const kinds = [TerrainKind.Normal, TerrainKind.Rough, TerrainKind.Rock, TerrainKind.High];
    for (const i of [1, 40, 199, 360, 700]) {
      for (const to of kinds) {
        const map = generateTerrain(5, cfg);
        if (map.kind[i] === to) {
          expect(verifyTerrainMap(map)).toEqual({ ok: true });
          continue;
        }
        flipInPlace(map, i, to);
        const res = verifyTerrainMap(map);
        expect(res.ok ? `missed ${i}->${to}` : res.fault).toBe('hash');
      }
    }
  });

  it('catches a swap that keeps every tile count intact', () => {
    // The failure a histogram check cannot see (`describe.ts` documents the
    // same gap from the parser's side): two tiles exchange kinds, so the
    // composition, every band and every count are unchanged — and the map is
    // still a different map.
    const map = generateTerrain(9, cfg);
    const a = map.kind.findIndex((k) => k === TerrainKind.Normal);
    const b = map.kind.findIndex((k) => k === TerrainKind.Rock);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(b).toBeGreaterThanOrEqual(0);
    const ka = map.kind[a];
    map.kind[a] = map.kind[b];
    map.kind[b] = ka;
    const res = verifyTerrainMap(map);
    expect(res.ok ? 'missed' : res.fault).toBe('hash');
  });

  it('catches a rewritten seed as readily as a rewritten tile', () => {
    // `seed` is inside the hash, so re-labelling a map's provenance breaks the
    // handle too. (`requestedSeed` is deliberately outside it — the next test.)
    const map = generateTerrain(4, cfg);
    const res = verifyTerrainMap(reshape(map, { seed: map.seed + 1 }));
    expect(res.ok ? 'missed' : res.fault).toBe('hash');
  });

  it('regression (fb064p QA bug 1): a seed corruption invisible to `| 0` is caught', () => {
    // `terrainHash` folds `h.int(seed | 0)`, so every value congruent mod 2**32
    // — and every non-finite or fractional value that truncates to the stored
    // int32 — hashes identically to the honest seed. Before the `seed-range`
    // fault, all of these verified clean while naming a key `generateTerrain`
    // would have refused outright (fb064j's integer + domain guard).
    //
    // `| 0` also pre-empts `Hasher.int`'s own non-finite tagging, which
    // `src/sim/hash.ts` added precisely so a corrupted run cannot hash clean.
    const m = generateTerrain(7, cfg);
    expect(m.seed).toBe(7);
    for (const seed of [7 + 2 ** 32, 7 - 2 ** 32, 7.9, -4294967289]) {
      const res = verifyTerrainMap(reshape(m, { seed }));
      expect(res.ok ? `missed seed ${seed}` : res.fault).toBe('seed-range');
    }
    const z = generateTerrain(0, cfg);
    expect(z.seed).toBe(0);
    for (const seed of [NaN, Infinity, -Infinity, 2 ** 53, 0.75, -0.5]) {
      const res = verifyTerrainMap(reshape(z, { seed }));
      expect(res.ok ? `missed seed ${seed}` : res.fault).toBe('seed-range');
    }
    // The report names the domain and the offending value, so a bug report
    // carries the corruption rather than just "something is wrong".
    const res = verifyTerrainMap(reshape(m, { seed: 2 ** 32 + 7 }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.expected).toBe('a uint32');
    expect(res.actual).toBe(String(2 ** 32 + 7));
  });

  it('every seed the generator can actually produce is accepted', () => {
    // The other half of the guard: a range check that refused a legitimate key
    // would break every map whose seed sits at a domain edge. `map.seed` is
    // always `>>> 0` (`toMap` and `flatMap` both reduce), so the uint32 ends
    // and the retry wrap are the cases that must stay clean.
    for (const seed of [0, 1, 0x7fffffff, 0x80000000, 0xfffffffe, 0xffffffff]) {
      const map = generateTerrain(seed, cfg);
      expect(map.seed).toBe(seed >>> 0);
      expect(verifyTerrainMap(map)).toEqual({ ok: true });
    }
  });

  it('does NOT report a changed requestedSeed — it is outside the hash by design', () => {
    // Stated as a test so the limit is a decision rather than an oversight:
    // `-1` and `4294967295` produce byte-identical tiles and one hash
    // (`types.ts`). A guard that must compare a seed compares that field
    // itself; verification cannot do it for them.
    const neg = generateTerrain(-1, cfg);
    const pos = generateTerrain(0xffffffff, cfg);
    expect(neg.hash).toBe(pos.hash);
    expect(neg.requestedSeed).not.toBe(pos.requestedSeed);
    expect(verifyTerrainMap(reshape(neg, { requestedSeed: 12345 }))).toEqual({ ok: true });
  });

  it('does NOT report relabelled attempts/fallback — also outside the hash', () => {
    // Stated so the omission stays a decision rather than an oversight
    // (fb064p QA bug 3). The `(fallback, attempts)` pair is what fb064n made
    // load-bearing for `isDegradedMap`, and it is forgeable without moving the
    // handle — a relabelled map verifies clean and then `isDegradedMap` lies.
    // Verification is about the *tiles*; provenance coherence is a separate
    // question, and the doc block names this limit rather than implying that
    // everything unlisted is covered.
    const m = generateTerrain(3, cfg);
    expect(isDegradedMap(m)).toBe(false);
    const posing = reshape(m, { attempts: 0, fallback: true });
    expect(verifyTerrainMap(posing)).toEqual({ ok: true });
    expect(isDegradedMap(posing)).toBe(false);
    expect(verifyTerrainMap(reshape(m, { attempts: 999, fallback: true }))).toEqual({ ok: true });
  });
});

describe('fb064p — the structural faults the hash alone cannot report', () => {
  it('reports wrong dimensions, which a hash check would wave through', () => {
    // `terrainHash` folds `GRID_W`/`GRID_H`, not `map.w`/`map.h`. So a map that
    // claims a different shape still hashes to its stored handle — the hash
    // check passes on a map whose own fields contradict it. This is why the
    // dimension check runs first rather than being left implicit.
    const map = generateTerrain(2, cfg);
    const lying = reshape(map, { w: map.w + 1, h: map.h - 1 });
    expect(terrainHash(lying.seed, lying.kind)).toBe(lying.hash);
    const res = verifyTerrainMap(lying);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.fault).toBe('dimensions');
    expect(res.expected).toBe(`${GRID_W}x${GRID_H}`);
    expect(res.actual).toBe(`${map.w + 1}x${map.h - 1}`);
  });

  it('regression (fb064p QA bug 2): a transposed map has the right tile count and is still wrong', () => {
    // The case above (1767 tiles) and the 3x3 case below (9) both differ from
    // 1792, so neither distinguishes the real check from `w * h !== GRID_W *
    // GRID_H` — a weakening QA showed the whole file stayed green under. These
    // two have *exactly* 1792 tiles and the correct hash, and are still not this
    // arena, so they pin the dimensions check to the shape and not the area.
    const map = generateTerrain(2, cfg);
    const transposed = reshape(map, { w: GRID_H, h: GRID_W });
    expect(transposed.w * transposed.h).toBe(GRID_W * GRID_H);
    expect(terrainHash(transposed.seed, transposed.kind)).toBe(transposed.hash);
    expect(verifyTerrainMap(transposed)).toMatchObject({
      fault: 'dimensions',
      expected: `${GRID_W}x${GRID_H}`,
      actual: `${GRID_H}x${GRID_W}`,
    });
    const stretched = reshape(map, { w: GRID_W * 2, h: GRID_H / 2 });
    expect(stretched.w * stretched.h).toBe(GRID_W * GRID_H);
    expect(verifyTerrainMap(stretched)).toMatchObject({ fault: 'dimensions' });
  });

  it('reports a tile buffer that is not w*h long', () => {
    const map = generateTerrain(6, cfg);
    const short = map.kind.slice(0, map.kind.length - 1);
    const res = verifyTerrainMap(reshape(map, { kind: short, hash: terrainHash(map.seed, short) }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    // Reported as the length fault even though its *hash is correct* for those
    // bytes: a buffer that was never the arena's size is the cause, and "these
    // tiles no longer hash to their handle" would be the wrong bug report.
    expect(res.fault).toBe('kind-length');
    expect(res.expected).toBe(String(GRID_W * GRID_H));
    expect(res.actual).toBe(String(GRID_W * GRID_H - 1));
  });

  it('reports the cause, not the symptom, when several faults are present', () => {
    // A truncated buffer also fails the hash. Fault order is cause-first, so
    // the reader is pointed at the shape rather than at the consequence.
    const map = generateTerrain(8, cfg);
    const broken = reshape(map, { w: 3, h: 3, kind: map.kind.slice(0, 4) });
    const res = verifyTerrainMap(broken);
    expect(res.ok ? 'missed' : res.fault).toBe('dimensions');
    // With the dimensions honest, the same buffer is reported as a length
    // fault; with the length honest too, the hash has the last word.
    const lenOnly = reshape(map, { kind: map.kind.slice(0, 4) });
    expect(verifyTerrainMap(lenOnly)).toMatchObject({ fault: 'kind-length' });
  });

  it('an overlong buffer is caught too, not just a truncated one', () => {
    const map = generateTerrain(10, cfg);
    const long = new Uint8Array(map.kind.length + 1);
    long.set(map.kind);
    expect(verifyTerrainMap(reshape(map, { kind: long }))).toMatchObject({
      fault: 'kind-length',
      expected: String(GRID_W * GRID_H),
      actual: String(GRID_W * GRID_H + 1),
    });
  });
});
