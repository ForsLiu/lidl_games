/**
 * fb064l — SPEC-FINAL §10.5: "Done when: seeds produce varied legal maps".
 *
 * fb064a pinned that clause with `>= 95% distinct hashes over 200 seeds`, which
 * a **one-tile** difference between two maps satisfies: the hash is exact, so
 * the assertion measures "not literally the same map" and calls it variety. It
 * cannot tell 500 genuinely different arenas from 500 copies of one arena with
 * a pebble moved, and it is the only thing standing behind the owner's clause.
 *
 * This file measures variety as a *quantity*, on the two axes that matter to a
 * player, with every floor recorded as a number rather than implied:
 *
 *   1. **Layout** — how much of the board differs between two seeds
 *      (mean and worst-case pairwise tile-difference share), and how far each
 *      seed sits from the flat arena the fallback ships. This is what makes a
 *      second run feel like a second place.
 *   2. **Composition** — how much the rough/rock/high *budgets* differ between
 *      seeds. This is what makes a second run play differently: a seed with
 *      53 high tiles and one with 33 are different tactical problems even at
 *      identical layout entropy, and the bands in `data/terrain.json` bound
 *      only the aggregate, never the per-seed spread.
 *
 * Axis 2 is why this item was filed as a `[test]` and shipped with a generator
 * change. Measured against fb064a's generator, over seeds 1..500:
 *
 *   kind   authored  mean    sd       min     max     distinct values
 *   rough  0.17      0.1679  0.0053   0.1340  0.1699  19
 *   rock   0.11      0.1200  0.0130   0.1095  0.1879  39
 *   high   0.07      0.0703  0.0000   0.0703  0.0703  1
 *
 * `high` was **identical on all 500 seeds** — exactly 43 interior tiles every
 * time — and `rough` sat at its authored target on 92% of them, because
 * `scatter()` placed exactly `round(density * interior)` tiles and only ever
 * fell short when it ran out of free ground. Terrain generation varied where
 * the obstacles were and not how many there were. `density.jitter` (fb064l)
 * gives each seed its own per-kind budget; the floors below are what that
 * change has to keep clearing.
 *
 * The floors are deliberately well under the measured values (the numbers are
 * in each comment): this is a guard against a retune quietly flattening the
 * generator, not a pin on the current RNG draw.
 */

import { describe, expect, it } from 'vitest';

import { GRID_H, GRID_W } from '../src/sim/grid';
import {
  generateTerrain,
  loadTerrain,
  measureTerrain,
  parseTerrain,
  terrainLegal,
  TerrainKind,
  type TerrainMap,
} from '../src/sim/terrain';

const cfg = loadTerrain();

/**
 * 500 seeds, as the acceptance names. Enough that the pairwise mean is a
 * measurement rather than an anecdote (124 750 pairs) and still ~2 s.
 */
const SWEEP = 500;

const TILES = GRID_W * GRID_H;
const INTERIOR = (GRID_W - 2) * (GRID_H - 2);

const maps: TerrainMap[] = [];
for (let s = 1; s <= SWEEP; s++) maps.push(generateTerrain(s, cfg));

/** The flat arena `generateTerrain` falls back to: rock border, normal inside. */
function flatKinds(): Uint8Array {
  const kind = new Uint8Array(TILES).fill(TerrainKind.Normal);
  for (let x = 0; x < GRID_W; x++) {
    kind[x] = TerrainKind.Rock;
    kind[(GRID_H - 1) * GRID_W + x] = TerrainKind.Rock;
  }
  for (let y = 0; y < GRID_H; y++) {
    kind[y * GRID_W] = TerrainKind.Rock;
    kind[y * GRID_W + GRID_W - 1] = TerrainKind.Rock;
  }
  return kind;
}

/** Share of tiles on which two maps disagree. */
function diffShare(a: Uint8Array, b: Uint8Array): number {
  let d = 0;
  for (let i = 0; i < TILES; i++) if (a[i] !== b[i]) d++;
  return d / TILES;
}

/** Per-seed share of the *interior* covered by one kind. */
function interiorShare(map: TerrainMap, want: TerrainKind): number {
  let n = 0;
  for (let y = 1; y < GRID_H - 1; y++) {
    for (let x = 1; x < GRID_W - 1; x++) {
      if (map.kind[y * GRID_W + x] === want) n++;
    }
  }
  return n / INTERIOR;
}

function stats(values: readonly number[]): {
  mean: number;
  sd: number;
  min: number;
  max: number;
  distinct: number;
} {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) * (b - mean), 0) / values.length);
  // Looped rather than `Math.min(...values)`: the spread form throws
  // `RangeError: too many arguments` somewhere around 100k entries, so the
  // helper would break on the day someone raises `SWEEP` — which is the one
  // edit this file invites. (QA.)
  let min = values[0];
  let max = values[0];
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { mean, sd, min, max, distinct: new Set(values).size };
}

/**
 * How many distinct interior tile counts a kind's budget band can produce.
 *
 * `scatter()` aims at `round(density * budget * interior)` with `budget`
 * uniform on `1 +- jitter`, so the reachable targets are the integers between
 * the two ends — and a per-seed *count* can never be more varied than that,
 * however varied the maps are. Shortfalls (no room left) can only push the
 * achieved count below the low end, never above the high one.
 */
function attainableSpan(authored: number): number {
  const j = cfg.density.jitter;
  return (
    Math.round(authored * (1 + j) * INTERIOR) - Math.round(authored * (1 - j) * INTERIOR) + 1
  );
}

describe(`fb064l — seeds produce varied maps, measured over ${SWEEP} seeds`, () => {
  it('every map in the sweep is a real generated map and legal', () => {
    // The variety floors below mean nothing about the game if the maps they
    // measure are not the maps a run would get: the flat fallback is perfectly
    // "varied" from nothing and perfectly identical to itself.
    expect(maps.filter((m) => m.fallback).length).toBe(0);
    expect(maps.filter((m) => !terrainLegal(measureTerrain(m, cfg), cfg)).length).toBe(0);
  });

  it('two seeds differ on a large share of the board, worst pair included', () => {
    // Measured (shipped config, seeds 1..500): mean 0.3970, worst pair 0.2903,
    // best pair 0.4944. The mean floor is 0.30 and the worst-pair floor 0.18 —
    // both roughly three quarters of the measured value, so a real regression
    // trips them and RNG drift does not.
    //
    // This is the assertion `>= 95% distinct hashes` was standing in for: two
    // maps one tile apart score 0.0014 here and 100% distinct there.
    //
    // Pairs sharing an effective `seed` are skipped, and that exclusion is the
    // degenerate-seed rule showing through rather than a convenience: a seed
    // whose first attempt is illegal is regenerated at seed+1 (the owner's
    // fallback), so `generateTerrain(s)` and `generateTerrain(s + 1)` are then
    // the *same map by construction* and score 0. One such pair exists in this
    // window. Counting it would make this floor a measurement of the retry
    // rate; the retry rate is `terrain-generation.test.ts`'s subject, and the
    // pair count below keeps the exclusion honest by pinning how many were
    // dropped.
    let sum = 0;
    let pairs = 0;
    let sameKey = 0;
    let worst = 1;
    for (let i = 0; i < SWEEP; i++) {
      for (let j = i + 1; j < SWEEP; j++) {
        if (maps[i].seed === maps[j].seed) {
          sameKey++;
          expect(maps[i].hash).toBe(maps[j].hash); // same key => same map
          continue;
        }
        const f = diffShare(maps[i].kind, maps[j].kind);
        sum += f;
        pairs++;
        if (f < worst) worst = f;
      }
    }
    expect(pairs + sameKey).toBe((SWEEP * (SWEEP - 1)) / 2);
    // Measured 1 such pair over seeds 1..500. Pinned as an *invariant* rather
    // than a count, because a count here is secretly a ceiling on
    // `density.jitter`: same-key pairs come from the retry walk, so they scale
    // with the retry rate, which scales with jitter (measured pairs over these
    // 500 seeds — jitter 0: 0, 0.22: 1, 0.4: 8, 0.5: 20, 1: 166). A `<= 5`
    // cap would fail at `jitter: 0.4` — a legal setting fb064f hands to a live
    // Tuner — with a message about pair accounting and no hint that the retry
    // rate is what moved. What must hold at every jitter is that a duplicate
    // is *explained*: one of the two seeds was regenerated. (QA bug 2.)
    for (let i = 0; i < SWEEP; i++) {
      for (let j = i + 1; j < SWEEP; j++) {
        if (maps[i].seed !== maps[j].seed) continue;
        expect(maps[i].attempts > 1 || maps[j].attempts > 1, `seeds ${i + 1}/${j + 1}`).toBe(true);
      }
    }
    expect(sum / pairs).toBeGreaterThanOrEqual(0.3);
    expect(worst).toBeGreaterThanOrEqual(0.18);
  });

  it('no seed is a near-copy of the flat arena', () => {
    // Measured: every seed differs from the flat map on 25.1%-37.9% of tiles
    // (mean 0.3088). A generator that scattered almost nothing would still
    // pass every band in `data/terrain.json` — they are all lower bounds on
    // walkable/buildable ground, and the flat map is the most permissive map
    // there is — so this is the one direction the constraint set cannot see.
    const flat = flatKinds();
    const d = maps.map((m) => diffShare(m.kind, flat));
    expect(Math.min(...d)).toBeGreaterThanOrEqual(0.22);
  });

  it('per-seed rough/rock/high budgets spread across a band, not onto the authored density', () => {
    // The acceptance clause this item was filed for. Three checks per kind,
    // each aimed at a different way of failing:
    //   - `distinct`: fb064a's `high` had exactly ONE value over 500 seeds.
    //   - `sd`: a spread of +-1 tile is distinct-but-flat.
    //   - `onAuthored`: the specific fb064a shape — a target hit exactly
    //     whenever there was room, so the mode *is* the authored density.
    for (const [name, want, authored] of [
      ['rough', TerrainKind.Rough, cfg.density.rough],
      ['rock', TerrainKind.Rock, cfg.density.rock],
      ['high', TerrainKind.High, cfg.density.high],
    ] as const) {
      const s = stats(maps.map((m) => interiorShare(m, want)));
      const label = `${name} (authored ${authored}): ${JSON.stringify(s)}`;

      // At least half the per-seed counts the budget band can even reach.
      //
      // This floor was a flat `>= 20` and that was wrong in the specific way
      // this lane keeps relearning: 20 is not a variety threshold, it is the
      // *attainable ceiling* for `high` at the shipped numbers, so the floor
      // equalled the ceiling and the assertion measured `density.high x jitter`
      // rather than variety. Measured failures of the flat form, all with the
      // relative sd unchanged at ~2x its own floor: seeds 501..1000 give 19
      // (so it depended on the seed window); `jitter: 0.215` gives 19; a plain
      // `density.high: 0.05` retune gives 14. Refusing payable `/data` is the
      // failure fb064a's density ceilings and fb064g's flat-map ceiling were
      // both filed for, and `density` is exactly what fb064f hands to a live
      // Tuner. (Review + QA bug 1, independently.)
      //
      // `attainableSpan` is how many distinct tile counts the band spans, so
      // the floor scales with the authored numbers instead of being pinned to
      // one of them. Measured over four disjoint 500-seed windows: rough
      // 51-56 against a floor of 24, rock 56-59 against 15, high 19-20
      // against 10. fb064a scores 1 for `high` against the same floor.
      const span = attainableSpan(authored);
      expect(s.distinct, `${label} span=${span}`).toBeGreaterThanOrEqual(Math.ceil(span / 2));

      // Relative sd >= 6% of the authored density. fb064a: rough 3.2%,
      // rock 10.8%, high 0%. `density.jitter` at 0.22 predicts ~12.7%
      // (a uniform band's sd is range/(2*sqrt(3))), so 6% is half of what
      // the shipped jitter buys and would need the jitter roughly halved
      // to trip.
      expect(s.sd / authored, label).toBeGreaterThanOrEqual(0.06);

      // No more than 40% of seeds land within 1% of the authored density.
      // fb064a: high 100%, rough ~92%.
      const onAuthored =
        maps.filter((m) => Math.abs(interiorShare(m, want) - authored) <= authored * 0.01).length /
        SWEEP;
      expect(onAuthored, label).toBeLessThanOrEqual(0.4);
    }
  });

  it('the composition floors can fail: at jitter 0 the generator flunks its own test', () => {
    // A band test that cannot fail measures nothing (fb064a's rule for this
    // lane). `density.jitter: 0` is fb064a's generator exactly — the draws are
    // skipped, not multiplied by zero, so the maps are byte-identical to the
    // pre-fb064l ones (pinned by the golden-hash control in
    // `terrain-generation.test.ts`). It is therefore both the negative case
    // *and* the control run for the change: same code, same seeds, one field.
    const flatComposition = parseTerrain({
      ...(JSON.parse(JSON.stringify(cfg)) as Record<string, unknown>),
      density: { ...cfg.density, jitter: 0 },
    });
    const control: TerrainMap[] = [];
    for (let s = 1; s <= 120; s++) control.push(generateTerrain(s, flatComposition));

    // The defect, verbatim: one distinct `high` budget across every seed.
    const high = new Set(control.map((m) => interiorShare(m, TerrainKind.High)));
    expect(high.size).toBe(1);
    // ...and the shipped config beats it on the same 120 seeds, so the
    // comparison is like for like rather than 120 seeds against 500.
    expect(new Set(maps.slice(0, 120).map((m) => interiorShare(m, TerrainKind.High))).size).
      toBeGreaterThan(1);
  });

  it('the spread is a band, not noise — each kind stays near its authored density on average', () => {
    // The other half of the previous test: variety must not be bought by
    // letting the authored numbers drift. `data/terrain.json` is the tuning
    // surface (architecture rule 4) and fb064f hands it to a live Tuner, so
    // the per-seed spread has to sit *around* the authored value.
    //
    // Rock is excluded from the upper bound on purpose and only on purpose:
    // `sealPockets` reclaims dead ground as rock, so its achieved share is
    // legitimately above its density (measured mean 0.1200 against 0.11).
    for (const [name, want, authored] of [
      ['rough', TerrainKind.Rough, cfg.density.rough],
      ['rock', TerrainKind.Rock, cfg.density.rock],
      ['high', TerrainKind.High, cfg.density.high],
    ] as const) {
      const s = stats(maps.map((m) => interiorShare(m, want)));
      const label = `${name} (authored ${authored}): ${JSON.stringify(s)}`;
      expect(s.mean, label).toBeGreaterThan(authored * 0.8);
      if (want !== TerrainKind.Rock) expect(s.mean, label).toBeLessThan(authored * 1.2);
    }
  });
});
