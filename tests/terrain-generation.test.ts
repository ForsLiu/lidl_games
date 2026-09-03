/**
 * fb064a — SPEC-FINAL §10.5 terrain generation.
 *
 * The owner's generation constraints are property-tested across 1000 seeds:
 * gates never enclosed, >= 60% walkable, >= 45% buildable-normal ground, gates
 * reach >= 80% of the walkable area, legal Core anchors >= 15% of normal
 * tiles, no forced corridor narrower than 2 tiles on a gate main, and the
 * whole map deterministic from the seed (G2's determinism scope, extended to
 * generation).
 *
 * The negative cases matter as much as the sweep: a band test that cannot fail
 * measures nothing, so each measurement is also run against a hand-built map
 * that violates it.
 */

import { describe, expect, it } from 'vitest';

import { GATES, GRID_H, GRID_W } from '../src/sim/grid';
import {
  corridorsOk,
  gateDistance,
  gatesConnected,
  gatesOpen,
  generateTerrain,
  legalCoreAnchors,
  loadTerrain,
  measureTerrain,
  parseTerrain,
  terrainHash,
  terrainLegal,
  TerrainKind,
  thickMask,
  type TerrainConfig,
  type TerrainMap,
} from '../src/sim/terrain';

const cfg = loadTerrain();
const SWEEP = 1000;

function withConfig(patch: (raw: Record<string, unknown>) => void): TerrainConfig {
  const raw = JSON.parse(JSON.stringify(cfg)) as Record<string, unknown>;
  patch(raw);
  return parseTerrain(raw);
}

/** A hand-built map, for the negative cases. */
function synthetic(fill: TerrainKind): TerrainMap {
  const kind = new Uint8Array(GRID_W * GRID_H).fill(fill);
  for (let x = 0; x < GRID_W; x++) {
    kind[x] = TerrainKind.Rock;
    kind[(GRID_H - 1) * GRID_W + x] = TerrainKind.Rock;
  }
  for (let y = 0; y < GRID_H; y++) {
    kind[y * GRID_W] = TerrainKind.Rock;
    kind[y * GRID_W + GRID_W - 1] = TerrainKind.Rock;
  }
  for (const g of GATES) kind[g.ty * GRID_W + g.tx] = TerrainKind.Normal;
  return {
    w: GRID_W,
    h: GRID_H,
    kind,
    requestedSeed: 0,
    seed: 0,
    attempts: 1,
    fallback: false,
    hash: terrainHash(0, kind),
  };
}

/** Independent per-gate flood fill — never reuses the generator's own mask. */
function reachableFromGate(map: TerrainMap, gateIdx: number): Uint8Array {
  const seen = new Uint8Array(map.w * map.h);
  if (!cfg.tiles[map.kind[gateIdx]].walkable) return seen;
  const queue = [gateIdx];
  seen[gateIdx] = 1;
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    const x = i % map.w;
    const y = (i / map.w) | 0;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h) continue;
      const ni = ny * map.w + nx;
      if (seen[ni] || !cfg.tiles[map.kind[ni]].walkable) continue;
      seen[ni] = 1;
      queue.push(ni);
    }
  }
  return seen;
}

describe('fb064a — data/terrain.json loads and refuses unpayable data', () => {
  it('loads with the four ordered tile kinds', () => {
    expect(cfg.tiles.map((t) => t.key)).toEqual(['normal', 'rough', 'rock', 'high']);
    expect(cfg.tiles[TerrainKind.Normal]).toMatchObject({ walkable: true, buildable: true });
    expect(cfg.tiles[TerrainKind.Rough]).toMatchObject({ walkable: true, buildable: false });
    expect(cfg.tiles[TerrainKind.Rock]).toMatchObject({ walkable: false, buildable: false });
    expect(cfg.tiles[TerrainKind.High]).toMatchObject({ buildable: true, highGround: true });
  });

  it('refuses a reordered tile list — the order is what TerrainKind indexes', () => {
    expect(() =>
      withConfig((raw) => {
        const tiles = raw.tiles as unknown[];
        [tiles[1], tiles[2]] = [tiles[2], tiles[1]];
      }),
    ).toThrow(/order is load-bearing/);
  });

  it('refuses bands the rock border makes unreachable', () => {
    // The border is 105 permanently-rock tiles of 720, so no map can exceed
    // ~0.854 walkable however the densities are set, and normal ground is a
    // subset of walkable ground so the same ceiling binds it. Comparing an
    // interior-relative density against a whole-grid band (fb064a's first
    // shape) accepted these, and then *every* seed fell through `maxAttempts`
    // to the flat fallback — a flat arena for the whole run, with no signal,
    // since nothing consumes `fallback` yet.
    expect(() =>
      withConfig((raw) => {
        (raw.constraints as Record<string, number>).minWalkableFrac = 0.9;
      }),
    ).toThrow(/most any map can reach/);
    expect(() =>
      withConfig((raw) => {
        (raw.constraints as Record<string, number>).minBuildableNormalFrac = 0.9;
      }),
    ).toThrow(/most any map can reach/);
    expect(() => loadTerrain()).not.toThrow();
  });

  it('does NOT refuse bands the generator actually satisfies', () => {
    // The other half of the ceiling, and the half fb064a got wrong twice. A
    // density is a *cap* on what `scatter()` places, never a floor — protected
    // corridors and the retry budget leave it short — so a band derived from
    // `1 - density` under-estimates the real map and refuses configs that
    // work. A false rejection is worse than the silent fallback it was meant
    // to prevent, so these must load, and must then generate a real map.
    for (const [field, value, seed] of [
      ['minBuildableNormalFrac', 0.5553, 19],
      ['minWalkableFrac', 0.7005, 12],
    ] as const) {
      const loose = withConfig((raw) => {
        (raw.constraints as Record<string, number>)[field] = value;
      });
      const m = generateTerrain(seed, loose);
      expect(m.fallback).toBe(false);
      expect(terrainLegalUnder(m, loose)).toBe(true);
    }
  });

  it('refuses a Core clearance that makes every tile illegal', () => {
    // `coreGateClearance` excludes every tile within Chebyshev range of a
    // gate. The grid's largest nearest-gate distance is 17, so from there up
    // `legalCoreAnchors` is empty for *every possible map* and a positive
    // `minCoreLegalFrac` can never be met. Accepted, this is the same silent
    // "every seed ships the flat fallback" failure as an impossible band:
    // measured 100/100 fallbacks at clearance 17.
    expect(() =>
      withConfig((raw) => {
        (raw as Record<string, unknown>).coreGateClearance = 17;
      }),
    ).toThrow(/legal Core/);
    // 16 is still payable, and must not be swept up with it.
    const tight = withConfig((raw) => {
      (raw as Record<string, unknown>).coreGateClearance = 16;
      (raw.constraints as Record<string, number>).minCoreLegalFrac = 0.001;
    });
    expect(tight.coreGateClearance).toBe(16);
  });

  it('bounds the painted radii and the attempt count so /data cannot hang the sim', () => {
    // `paint()` runs inside `/src/sim` and its radii come straight from
    // `/data`, which fb064f puts under live Tuner editing. Unbounded, a single
    // authored number is a quadratic cost multiplier on a hot loop.
    for (const field of ['corridorRadius', 'gateClearRadius', 'plazaRadius', 'coreGateClearance']) {
      expect(() =>
        withConfig((raw) => {
          (raw as Record<string, unknown>)[field] = 5000;
        }),
      ).toThrow();
    }
    expect(() =>
      withConfig((raw) => {
        (raw as Record<string, unknown>).maxAttempts = 100000;
      }),
    ).toThrow();
  });

  it('refuses a corridor width it does not implement', () => {
    // `corridorsOk` measures the 2x2 block lattice, so only 1 (off) and 2 mean
    // anything. 3 was accepted and silently did nothing.
    expect(() =>
      withConfig((raw) => {
        (raw.constraints as Record<string, number>).minCorridorWidth = 3;
      }),
    ).toThrow();
    expect(() =>
      withConfig((raw) => {
        (raw.constraints as Record<string, number>).minCorridorWidth = 1;
      }),
    ).not.toThrow();
  });

  it('refuses tile flags the generator hard-codes, not just a reordered list', () => {
    // `rock.walkable: true` would turn pocket sealing into a no-op and make
    // the map border walkable; `normal.walkable: false` would make every seed
    // degenerate. Both are schema-legal booleans, so the loader has to say no.
    // (The patterns skip the quotes around the key: a ZodError's `message` is
    // the JSON dump of its issues, so the key reads as \"rock\" in it.)
    expect(() =>
      withConfig((raw) => {
        (raw.tiles as Record<string, unknown>[])[TerrainKind.Rock].walkable = true;
      }),
    ).toThrow(/rock.*must have walkable: false/);
    expect(() =>
      withConfig((raw) => {
        (raw.tiles as Record<string, unknown>[])[TerrainKind.Normal].walkable = false;
      }),
    ).toThrow(/normal.*must have walkable: true/);
    expect(() =>
      withConfig((raw) => {
        (raw.tiles as Record<string, unknown>[])[TerrainKind.High].highGround = false;
      }),
    ).toThrow(/high.*must have highGround: true/);
    expect(() =>
      withConfig((raw) => {
        (raw.tiles as Record<string, unknown>[])[TerrainKind.Rough].buildable = true;
      }),
    ).toThrow(/rough.*must have buildable: false/);
  });

  it('refuses blob.maxSize below blob.minSize and unknown keys', () => {
    expect(() =>
      withConfig((raw) => {
        (raw.blob as Record<string, number>).maxSize = 1;
        (raw.blob as Record<string, number>).minSize = 5;
      }),
    ).toThrow(/maxSize must be >= /);
    expect(() =>
      withConfig((raw) => {
        raw.mystery = 1;
      }),
    ).toThrow();
    // A blob cannot exceed the ground it grows on. `maxSize: 1e15` was
    // accepted; `scatter()`'s own bound stopped it doing damage, but the
    // schema should not be the loose one.
    expect(() =>
      withConfig((raw) => {
        (raw.blob as Record<string, number>).maxSize = Number.MAX_SAFE_INTEGER;
      }),
    ).toThrow();
  });
});

describe('fb064a — determinism (G2 scope: generation)', () => {
  it('same seed produces identical tiles and an identical hash', () => {
    for (const seed of [0, 1, 7, 4242, 0x7fffffff]) {
      const a = generateTerrain(seed, cfg);
      const b = generateTerrain(seed, cfg);
      expect(Array.from(b.kind)).toEqual(Array.from(a.kind));
      expect(b.hash).toBe(a.hash);
      expect(b.seed).toBe(a.seed);
    }
  });

  it('the hash tracks the tiles, not just the seed', () => {
    const m = generateTerrain(3, cfg);
    const mutated = Uint8Array.from(m.kind);
    const flip = mutated.findIndex((k) => k === TerrainKind.Normal);
    mutated[flip] = TerrainKind.Rough;
    expect(terrainHash(m.seed, mutated)).not.toBe(m.hash);
  });

  it('different seeds produce varied maps (>= 95% distinct over 200 seeds)', () => {
    const hashes = new Set<string>();
    for (let s = 1; s <= 200; s++) hashes.add(generateTerrain(s, cfg).hash);
    expect(hashes.size).toBeGreaterThanOrEqual(190);
  });

  it('matches its recorded golden hashes', () => {
    // "Same seed twice" only pins determinism *within* a build. A change to
    // `Rng`, to the scatter order, or to the corridor walk would keep every
    // other test here green while silently forking every stored replay, which
    // is exactly what G2 exists to catch. These are the shipped-config maps as
    // of fb064a; changing them is a deliberate act that must be paired with
    // invalidating replays, not a diff nobody notices.
    expect({
      1: generateTerrain(1, cfg).hash,
      2: generateTerrain(2, cfg).hash,
      42: generateTerrain(42, cfg).hash,
      1000: generateTerrain(1000, cfg).hash,
    }).toEqual({
      1: '03031f09',
      2: '30ddb8d4',
      42: 'b2e86488',
      1000: '473db113',
    });
  });

  it('refuses a non-integer seed instead of aliasing it onto seed 0', () => {
    // `seed | 0` maps NaN, Infinity and 0.4 all onto 0 — a legitimate seed —
    // and then records that 0 as `requestedSeed`, destroying the provenance a
    // replay needs (architecture rule 2).
    for (const bad of [NaN, Infinity, -Infinity, 0.4, 1.5]) {
      expect(() => generateTerrain(bad, cfg)).toThrow(/must be an integer/);
    }
    expect(generateTerrain(0, cfg).requestedSeed).toBe(0);
  });
});

describe(`fb064a — generation constraints hold across ${SWEEP} seeds`, () => {
  const maps: TerrainMap[] = [];
  for (let s = 1; s <= SWEEP; s++) maps.push(generateTerrain(s, cfg));
  const measures = maps.map((m) => measureTerrain(m, cfg));

  it('every seed produces a real generated map, never the flat fallback', () => {
    expect(maps.filter((m) => m.fallback).length).toBe(0);
  });

  it('every tile is one of the four authored kinds, and the border stays sealed', () => {
    // One assertion over collected offenders rather than 720k expect() calls
    // per band — the loop below is the hot one in this file.
    const gateSet = new Set(GATES.map((g) => g.ty * GRID_W + g.tx));
    const seenKinds = new Set<number>();
    const leakyBorder: string[] = [];
    for (const m of maps) {
      for (let i = 0; i < m.kind.length; i++) {
        seenKinds.add(m.kind[i]);
        const x = i % GRID_W;
        const y = (i / GRID_W) | 0;
        const border = x === 0 || y === 0 || x === GRID_W - 1 || y === GRID_H - 1;
        if (border && !gateSet.has(i) && m.kind[i] !== TerrainKind.Rock) {
          leakyBorder.push(`seed ${m.seed} tile ${x},${y}`);
        }
      }
    }
    // All four authored kinds actually get placed — a scatter that silently
    // stopped emitting `high`, say, would still pass every band.
    expect([...seenKinds].sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
    expect(leakyBorder.slice(0, 5)).toEqual([]);
  });

  it("honours data/terrain.json's authored densities, not just the bands", () => {
    // Architecture rule 4 puts the tuning in `/data`, but that is only
    // load-bearing if something checks the data is obeyed. Every other band
    // here is a *lower* bound on walkable/normal ground, so halving all three
    // densities — or ignoring them outright — moves each one the safe way and
    // leaves the suite green. fb064f hands these fields to live Tuner edits,
    // so tie the achieved share to the authored one.
    //
    // Measured over the interior the scatter actually runs on, and only rough
    // and high: `rock` also absorbs every tile `sealPockets` reclaims, so its
    // achieved share is legitimately above its authored density.
    const interior = (GRID_W - 2) * (GRID_H - 2);
    const share = (kindWanted: TerrainKind): number => {
      let n = 0;
      for (const m of maps) {
        for (let y = 1; y < GRID_H - 1; y++) {
          for (let x = 1; x < GRID_W - 1; x++) {
            if (m.kind[y * GRID_W + x] === kindWanted) n++;
          }
        }
      }
      return n / (maps.length * interior);
    };
    for (const [kindWanted, authored] of [
      [TerrainKind.Rough, cfg.density.rough],
      [TerrainKind.High, cfg.density.high],
    ] as const) {
      const got = share(kindWanted);
      expect(got).toBeGreaterThan(authored * 0.75);
      expect(got).toBeLessThan(authored * 1.25);
    }
    // Rock is bounded below by its density and above by density + the border.
    const rock = share(TerrainKind.Rock);
    expect(rock).toBeGreaterThan(cfg.density.rock * 0.75);
  });

  it('no gate is ever enclosed, and all gates share one walkable component', () => {
    expect(measures.filter((m) => !m.gatesOpen).length).toBe(0);
    expect(measures.filter((m) => !m.gatesConnected).length).toBe(0);
  });

  it('>= 60% of the map is walkable', () => {
    const worst = Math.min(...measures.map((m) => m.walkableFrac));
    expect(worst).toBeGreaterThanOrEqual(cfg.constraints.minWalkableFrac);
  });

  it('>= 45% of the map is buildable normal ground', () => {
    const worst = Math.min(...measures.map((m) => m.buildableNormalFrac));
    expect(worst).toBeGreaterThanOrEqual(cfg.constraints.minBuildableNormalFrac);
  });

  it('gates reach >= 80% of the walkable area', () => {
    const worst = Math.min(...measures.map((m) => m.gateReachFrac));
    expect(worst).toBeGreaterThanOrEqual(cfg.constraints.minGateReachFrac);
  });

  it('legal Core anchors are >= 15% of normal tiles', () => {
    const worst = Math.min(...measures.map((m) => m.coreLegalFrac));
    expect(worst).toBeGreaterThanOrEqual(cfg.constraints.minCoreLegalFrac);
  });

  it('holds every band on the seeds that sit closest to the cliff', () => {
    // The 1..1000 sweep above is not the interesting range, and treating it as
    // one produced a wrong entry in this lane's Log ("worst 0.6139, about 10
    // tiles of headroom; no seed is degenerate at all"). Over seeds 1..20000
    // the truth is that `walkableFrac` headroom is *zero* — seed 7957 measures
    // exactly 0.6000, 432/720 tiles, passing only because the band is `>=` —
    // and the shipped data does take the seed+1 retry path, at seeds 1227,
    // 3219, 4596, 7010 and 8102. Pin both, so a density or `blob` retune
    // (fb064f edits these live) goes red here rather than in a playtest.
    const onTheLine = generateTerrain(7957, cfg);
    expect(onTheLine.fallback).toBe(false);
    expect(measureTerrain(onTheLine, cfg).walkableFrac).toBeCloseTo(0.6, 10);
    expect(terrainLegalUnder(onTheLine, cfg)).toBe(true);

    for (const s of [1227, 3219, 4596, 7010, 8102]) {
      const m = generateTerrain(s, cfg);
      // Each is degenerate at its own seed and legal one seed forward.
      expect(m.fallback).toBe(false);
      expect(m.attempts).toBeGreaterThan(1);
      expect(m.seed).toBe(s + m.attempts - 1);
      expect(terrainLegalUnder(m, cfg)).toBe(true);
    }
  });

  it('stays bounded under the most expensive schema-legal config', () => {
    // The guard on Major fix #1: `paint()` clamps its loop bounds instead of
    // walking the full (2r+1)^2 square. Reverting that clamp is an ~8.7x cost
    // regression on this path that no other test here notices, because every
    // other assertion is about tiles rather than work. Worst measured on this
    // host: 194 ms for the config below (all radii at their cap, maximum
    // jitter, 64 attempts, an unreachable Core band forcing every attempt to
    // run) and 213 ms for all 1000 shipped-config seeds together.
    const hostile = withConfig((raw) => {
      const r = raw as Record<string, unknown>;
      r.corridorRadius = 36;
      r.gateClearRadius = 36;
      r.plazaRadius = 36;
      r.corridorJitter = 1;
      r.maxAttempts = 64;
      (raw.blob as Record<string, number>).minSize = 612;
      (raw.blob as Record<string, number>).maxSize = 612;
      (raw.constraints as Record<string, number>).minCoreLegalFrac = 1;
    });
    const started = Date.now();
    const m = generateTerrain(7, hostile);
    const elapsed = Date.now() - started;
    expect(m.attempts).toBe(64); // every attempt really ran
    // Deliberately loose: 194 ms standalone but ~1.1 s under vitest's
    // instrumentation, and this host runs suites under heavy contention. The
    // regression it guards multiplies the work ~8.7x (5329 iterations per
    // paint at r=36 instead of the interior's 612), so it lands near 9 s and
    // is caught with room to spare, while ordinary load never trips it.
    expect(elapsed).toBeLessThan(5000);
  });

  it('no gate main is forced through a corridor narrower than 2 tiles', () => {
    expect(measures.filter((m) => !m.corridorsOk).length).toBe(0);
  });

  it('every legal Core anchor is 2x2 normal, clear of the gates, and reachable from every gate', () => {
    // The full per-gate flood fill is quadratic-ish, so it runs on a spread
    // sample rather than all 1000 — the cheap invariants run on all of them.
    for (let k = 0; k < maps.length; k += 97) {
      const m = maps[k];
      const anchors = legalCoreAnchors(m, cfg);
      expect(anchors.length).toBeGreaterThan(0);
      const reach = GATES.map((g) => reachableFromGate(m, g.ty * GRID_W + g.tx));
      for (const a of anchors) {
        const ax = a % GRID_W;
        const ay = (a / GRID_W) | 0;
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const i = (ay + dy) * GRID_W + (ax + dx);
            expect(m.kind[i]).toBe(TerrainKind.Normal);
            expect(gateDistance(ax + dx, ay + dy)).toBeGreaterThan(cfg.coreGateClearance);
            for (const r of reach) expect(r[i]).toBe(1);
          }
        }
      }
    }
  });
});

describe('fb064a — degenerate seeds regenerate at seed+1 instead of shipping an illegal map', () => {
  // A band no ordinary seed clears often: the observed worst-case legal-anchor
  // share over the real sweep is ~0.44, so 0.50 rejects a healthy share of
  // seeds and forces the retry path without being unsatisfiable.
  const strict = withConfig((raw) => {
    (raw.constraints as Record<string, number>).minCoreLegalFrac = 0.5;
  });

  it('at least one seed in 1..60 actually takes the retry path', () => {
    let retried = 0;
    let fellBack = 0;
    for (let s = 1; s <= 60; s++) {
      const m = generateTerrain(s, strict);
      // A fallback map also carries attempts > 1, so counting attempts alone
      // would let "60 fallbacks, 0 retries" pass as if the path had run.
      if (m.fallback) fellBack++;
      else if (m.attempts > 1) retried++;
    }
    expect(retried).toBeGreaterThan(0);
    expect(fellBack).toBe(0);
  });

  it('a retried map is legal, is the seed+n map, and every skipped seed was illegal', () => {
    for (let s = 1; s <= 60; s++) {
      const m = generateTerrain(s, strict);
      expect(m.requestedSeed).toBe(s);
      // The flat fallback keeps the requested seed; a real map is the n-th
      // seed forward, one per degenerate attempt.
      if (m.fallback) continue;
      expect(m.seed).toBe(s + m.attempts - 1);
      expect(terrainLegalUnder(m, strict)).toBe(true);
      // Every seed it stepped over must genuinely have been degenerate.
      for (let n = 0; n < m.attempts - 1; n++) {
        const skipped = generateTerrain(s + n, strict);
        // Re-generating the skipped seed on its own either fails again (and
        // walks forward itself) or, if it is legal, the walk was wrong.
        expect(skipped.seed).not.toBe(s + n);
      }
    }
  });

  it('retries are deterministic — the same seed always lands on the same map', () => {
    for (let s = 1; s <= 20; s++) {
      const a = generateTerrain(s, strict);
      const b = generateTerrain(s, strict);
      expect(b.hash).toBe(a.hash);
      expect(b.attempts).toBe(a.attempts);
    }
  });

  it('an unsatisfiable config falls back to the flat legal map rather than an illegal one', () => {
    const impossible = withConfig((raw) => {
      (raw.constraints as Record<string, number>).minCoreLegalFrac = 1;
    });
    const m = generateTerrain(11, impossible);
    expect(m.fallback).toBe(true);
    expect(m.attempts).toBe(impossible.maxAttempts);
    const measure = measureTerrain(m, impossible);
    expect(measure.gatesOpen).toBe(true);
    expect(measure.corridorsOk).toBe(true);
    expect(measure.gateReachFrac).toBe(1);
    expect(generateTerrain(11, impossible).hash).toBe(m.hash);
  });
});

/** Re-derives legality from the measurements, so the test never trusts a flag. */
function terrainLegalUnder(map: TerrainMap, c: TerrainConfig): boolean {
  const m = measureTerrain(map, c);
  return (
    m.gatesOpen &&
    // Must mirror `terrainLegal` term for term: dropping this one made the
    // assertion strictly weaker than the generator's own accept test, so a
    // regression that let gate connectivity fall out would have slipped past.
    m.gatesConnected &&
    m.corridorsOk &&
    m.walkableFrac >= c.constraints.minWalkableFrac &&
    m.buildableNormalFrac >= c.constraints.minBuildableNormalFrac &&
    m.gateReachFrac >= c.constraints.minGateReachFrac &&
    m.coreLegalFrac >= c.constraints.minCoreLegalFrac
  );
}

describe('fb064a — the measurements can fail (negative cases)', () => {
  it('gatesOpen is false when a gate is walled in', () => {
    const m = synthetic(TerrainKind.Normal);
    expect(gatesOpen(m, cfg)).toBe(true);
    const g = GATES[0];
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = g.tx + dx;
      const ny = g.ty + dy;
      if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue;
      m.kind[ny * GRID_W + nx] = TerrainKind.Rock;
    }
    expect(gatesOpen(m, cfg)).toBe(false);
  });

  it('corridorsOk is false when a gate main is one tile wide', () => {
    const m = synthetic(TerrainKind.Normal);
    expect(corridorsOk(m, cfg)).toBe(true);
    // Pinch the west gate to a single-tile mouth: rock out the whole column
    // next to it except the gate row.
    const g = GATES[0];
    for (let y = 1; y < GRID_H - 1; y++) {
      if (y === g.ty) continue;
      m.kind[y * GRID_W + 1] = TerrainKind.Rock;
    }
    expect(corridorsOk(m, cfg)).toBe(false);
  });

  it('a gate walled into its own pocket is caught, even with corridor width disabled', () => {
    // The map every optimistic reduction gets wrong: the north gate is open
    // (it has a walkable neighbour) and no walkable tile is unreachable from
    // *some* gate, so sealing finds nothing and a union-flood "reachable from
    // a gate" mask would call the whole board Core-legal. `minCorridorWidth: 1`
    // is a schema-legal value that switches the corridor band off, so the
    // gate-connectivity check has to stand on its own.
    const loose = withConfig((raw) => {
      (raw.constraints as Record<string, number>).minCorridorWidth = 1;
    });
    const m = synthetic(TerrainKind.Normal);
    const north = GATES[1];
    for (const [x, y] of [
      [north.tx - 1, 1],
      [north.tx + 1, 1],
      [north.tx - 1, 2],
      [north.tx, 2],
      [north.tx + 1, 2],
    ]) {
      m.kind[y * GRID_W + x] = TerrainKind.Rock;
    }

    expect(gatesOpen(m, loose)).toBe(true); // open, but going nowhere
    expect(corridorsOk(m, loose)).toBe(true); // band switched off from /data
    expect(gatesConnected(m, loose)).toBe(false);

    const measure = measureTerrain(m, loose);
    expect(measure.gatesConnected).toBe(false);
    // The band is the *worst* gate's share, so the walled-in gate shows up.
    expect(measure.gateReachFrac).toBeLessThan(0.05);
    // And no tile is reachable from every gate, so nothing is Core-legal.
    expect(legalCoreAnchors(m, loose)).toEqual([]);
    expect(terrainLegal(measure, loose)).toBe(false);
  });

  it('corridorsOk rejects a diagonal staircase pinch that a thick-tile test would pass', () => {
    // West gate -> 2x2 block A -> a single-tile diagonal joint -> block B ->
    // the open area. Every tile on the route is "thick" (each belongs to some
    // 2x2), and A's and B's thick tiles are 4-adjacent, so a thick-tile
    // connectivity test calls this a 2-wide main. It is not: the joint is one
    // tile wide. Anchor-space connectivity catches it.
    const m = synthetic(TerrainKind.Rock);
    const put = (x: number, y: number) => {
      m.kind[y * GRID_W + x] = TerrainKind.Normal;
    };
    for (let y = 1; y <= 18; y++) for (let x = 6; x <= 34; x++) put(x, y); // open area
    for (const [x, y] of [
      [1, 9],
      [2, 9],
      [1, 10],
      [2, 10], // block A, at the west gate
      [3, 10],
      [4, 10],
      [3, 11],
      [4, 11], // block B, joined to A only at (2,10)-(3,10)
      [5, 10],
      [5, 11], // B into the open area
    ]) {
      put(x, y);
    }
    expect(gatesOpen(m, cfg)).toBe(true);
    const thick = thickMask(m, cfg);
    expect(thick[10 * GRID_W + 2]).toBe(1);
    expect(thick[10 * GRID_W + 3]).toBe(1); // 4-adjacent thick tiles, different blocks
    expect(corridorsOk(m, cfg)).toBe(false);

    // Widening the joint — nothing else — makes it legal: (3,9)+(4,9) turn the
    // one-tile staircase into a 2-wide elbow.
    put(3, 9);
    put(4, 9);
    expect(corridorsOk(m, cfg)).toBe(true);
  });

  it('gateReachFrac drops when walkable ground is sealed off from the gates', () => {
    const m = synthetic(TerrainKind.Normal);
    expect(measureTerrain(m, cfg).gateReachFrac).toBe(1);
    // A 4x4 pocket ringed in rock: walkable, but nothing can walk into it.
    for (let y = 4; y <= 9; y++) {
      for (let x = 4; x <= 9; x++) {
        const edge = y === 4 || y === 9 || x === 4 || x === 9;
        if (edge) m.kind[y * GRID_W + x] = TerrainKind.Rock;
      }
    }
    const measure = measureTerrain(m, cfg);
    expect(measure.gateReachFrac).toBeLessThan(1);
    expect(measure.gateReachFrac).toBeGreaterThan(0.8);
  });

  it('high ground counts as buildable but not walkable, rough the other way round', () => {
    const high = measureTerrain(synthetic(TerrainKind.High), cfg);
    expect(high.walkableFrac).toBe(3 / (GRID_W * GRID_H)); // the three gate tiles
    expect(high.buildableNormalFrac).toBe(3 / (GRID_W * GRID_H));
    const rough = measureTerrain(synthetic(TerrainKind.Rough), cfg);
    expect(rough.walkableFrac).toBeGreaterThan(0.8);
    expect(rough.buildableNormalFrac).toBe(3 / (GRID_W * GRID_H));
    expect(rough.legalCoreCount).toBe(0);
  });
});
