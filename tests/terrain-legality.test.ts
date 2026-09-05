/**
 * fb064v — the guard on `tests/terrain-legality.ts`.
 *
 * The terrain suites deliberately re-derive legality instead of calling
 * `terrainLegal` (see that file's header for why), which buys an independent
 * check at the cost of a copy that can drift — and it did drift once, for the
 * whole life of fb064o. One copy is better than three, but a copy is still a
 * copy: what makes it safe is that this file fails when the copy and
 * `terrainLegal` stop answering the same question.
 *
 * Two layers, because a table over today's bands cannot see tomorrow's:
 *   1. **The band table** — one row per band and flag, on both sides of its
 *      threshold, over a hand-built map's real measurements. It pins the
 *      direction of each term, not just agreement, so a mirror that inverted a
 *      comparison and a `terrainLegal` that inverted it too would still be
 *      caught.
 *   2. **The field sweep** — every field of a `TerrainMeasure`, over a value
 *      spread wide enough to cross any monotone threshold, run against a
 *      *matrix* of configs rather than the shipped one alone. It is derived
 *      from the measure object itself, so a band added to `terrainLegal` that
 *      reads a field this mirror ignores goes red here without anyone
 *      remembering to extend a list, and the config axis is what catches a
 *      mirror that froze a threshold at today's `/data` value (QA bug 1) or a
 *      `terrainLegal` that grew a cfg-conditional term.
 *
 * What it still cannot see, stated rather than implied: a band whose refused
 * region is an interior hole containing no swept point (say "reject
 * `walkableFrac` in (0.9, 0.95)"). The spread is dense enough — a 0.05 ramp
 * over [0, 2], plus both sentinels, `NaN` and both infinities — that such a
 * band has to be deliberately narrow to hide.
 */

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { GATES, GRID_H, GRID_W } from '../src/sim/grid';
import {
  loadTerrain,
  measureTerrain,
  parseTerrain,
  terrainHash,
  terrainLegal,
  TerrainKind,
  type TerrainConfig,
  type TerrainMap,
  type TerrainMeasure,
} from '../src/sim/terrain';
import {
  failedBands,
  legalMeasure,
  legalUnder,
  LEGALITY_BANDS,
  LEGALITY_FLAGS,
  slackOf,
  type LegalityBand,
} from './terrain-legality';

const cfg = loadTerrain();

/** A rock-bordered arena of `fill`, gates punched open. The other suites' map. */
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
    seed: 0,
    requestedSeed: 0,
    attempts: 1,
    fallback: false,
    hash: terrainHash(0, kind),
  };
}

/** The hand-built map every row below starts from: legal under the shipped cfg. */
const baseMap = synthetic(TerrainKind.Normal);
const base: TerrainMeasure = measureTerrain(baseMap, cfg);

/**
 * A value a hair under `v`, in units `v` can actually represent.
 *
 * A literal `1e-9` is not one of those units for a large `v`: `1e7 + 1e-9`
 * is `1e7` in double, so a band-off retune of `maxGateDetour` (which has no
 * schema ceiling — config.ts calls a large value "a legitimate band off")
 * would silently turn a boundary row into a false failure.
 */
const under = (v: number): number => v - Math.max(1e-9, Math.abs(v) * 1e-12);
const over = (v: number): number => v + Math.max(1e-9, Math.abs(v) * 1e-12);

/**
 * One row per band: the value, and whether a map measuring it is legal.
 *
 * The thresholds are read from `cfg` rather than written out, so a `/data`
 * retune moves the rows with it instead of turning this file red — which is
 * why the "far below" rows are derived from the threshold too. A literal `0`
 * would be a wrong expectation at `minCoreLegalFrac: 0`, a schema-legal value
 * `analyze.ts` names as one fb064f hands to a live Tuner.
 */
const c = cfg.constraints;
/** Each floor band's constraint field, so a test can move one band alone. */
const FLOOR_FIELD: Record<string, string> = {
  walkableFrac: 'minWalkableFrac',
  buildableNormalFrac: 'minBuildableNormalFrac',
  gateReachFrac: 'minGateReachFrac',
  coreLegalFrac: 'minCoreLegalFrac',
};

/** The floor bands: legal at the threshold and above, refused just under it. */
const FLOOR_BANDS: Array<[LegalityBand, number]> = [
  ['walkableFrac', c.minWalkableFrac],
  ['buildableNormalFrac', c.minBuildableNormalFrac],
  ['gateReachFrac', c.minGateReachFrac],
  ['coreLegalFrac', c.minCoreLegalFrac],
];

const BAND_ROWS: Array<[LegalityBand, number, boolean]> = [
  ...FLOOR_BANDS.flatMap(([band, thr]): Array<[LegalityBand, number, boolean]> => [
    [band, thr, true],
    [band, 1, true],
    // Just under the floor is refused whatever the floor is — at a floor of 0
    // (schema-legal, and a value fb064f hands to a live Tuner) `under(0)` is
    // negative and still below it.
    [band, under(thr), false],
    // ...but a measured 0 is only refused when the floor is above it, which is
    // why this expectation is derived rather than written as `false`.
    [band, 0, thr <= 0],
  ]),
  // The only two-sided band, and the only one with a sentinel.
  ['maxGateDetour', 1, true],
  ['maxGateDetour', c.maxGateDetour, true],
  ['maxGateDetour', over(c.maxGateDetour), false],
  ['maxGateDetour', under(1), false],
  ['maxGateDetour', 0, false],
  ['maxGateDetour', -1, false],
];

describe('fb064v — the shared mirror answers what `terrainLegal` answers', () => {
  it('the hand-built baseline is legal both ways', () => {
    expect(terrainLegal(base, cfg)).toBe(true);
    expect(legalMeasure(base, cfg)).toBe(true);
    expect(legalUnder(baseMap, cfg)).toBe(true);
  });

  it.each(BAND_ROWS)('band %s = %d → legal %s, and both agree', (band, value, expected) => {
    const q: TerrainMeasure = { ...base, [band]: value };
    expect(terrainLegal(q, cfg)).toBe(expected);
    expect(legalMeasure(q, cfg)).toBe(expected);
  });

  it.each(LEGALITY_FLAGS)('flag %s false refuses the map, and both agree', (flag) => {
    const q: TerrainMeasure = { ...base, [flag]: false };
    expect(terrainLegal(q, cfg)).toBe(false);
    expect(legalMeasure(q, cfg)).toBe(false);
  });

  it('the band table covers every band the mirror lists', () => {
    // A band added to `LEGALITY_BANDS` with no row above would otherwise sit
    // in the ledger's statistics untested here.
    expect(new Set(BAND_ROWS.map((r) => r[0]))).toEqual(new Set(LEGALITY_BANDS));
    // ...and every band is exercised on both sides, so no row set is one-sided.
    for (const band of LEGALITY_BANDS) {
      const outcomes = BAND_ROWS.filter((r) => r[0] === band).map((r) => r[2]);
      expect(new Set(outcomes), band).toEqual(new Set([true, false]));
    }
  });
});

/**
 * Values wide enough to cross any monotone threshold a future band could hold:
 * both sentinels, a 0.05 ramp over the whole fraction range and past it, every
 * authored constraint and a hair either side, magnitudes far outside every
 * band's range, and the three values that separate a comparison from its
 * negation (`NaN` and both infinities) — the last of which is what would catch
 * a future "tidy-up" of the mirror into `!(x < min)` form.
 */
const SWEEP_VALUES: number[] = (() => {
  const out = new Set<number>([
    -Infinity,
    -1e9,
    -1,
    -1e-9,
    0,
    1e-9,
    0.5,
    1,
    1.5,
    2,
    100,
    1e9,
    Infinity,
    NaN,
  ]);
  for (let v = 0; v <= 2.0001; v += 0.05) out.add(Number(v.toFixed(4)));
  for (const v of Object.values(c)) {
    for (const d of [-1e-9, 0, 1e-9]) out.add(v + d);
  }
  for (const v of Object.values(base)) {
    if (typeof v === 'number') for (const d of [-0.1, -0.01, 0, 0.01, 0.1]) out.add(v + d);
  }
  return [...out];
})();

/**
 * The config axis. Both agents that reviewed fb064v found the same hole from
 * different directions: with `cfg` held fixed, `BAND_ROWS` derives its values
 * from the same config the mirror reads, so both sides move together and a
 * mirror that *hardcoded* a threshold at today's `/data` value never
 * disagrees. QA reproduced exactly that — freezing `maxGateDetour`,
 * `minGateReachFrac` or `minBuildableNormalFrac` at the shipped number left
 * all 330 terrain tests green.
 *
 * Every variant goes through `parseTerrain`, so only configs the loader would
 * actually accept are exercised — the sibling suites' rule.
 */
const CONFIGS: Array<[string, TerrainConfig]> = (() => {
  const variant = (patch: Record<string, number>): TerrainConfig => {
    const raw = JSON.parse(JSON.stringify(cfg)) as Record<string, unknown>;
    Object.assign(raw.constraints as Record<string, number>, patch);
    return parseTerrain(raw);
  };
  return [
    ['shipped', cfg],
    // Every floor off and the cap wide: the config under which a hardcoded
    // threshold in the mirror refuses maps `terrainLegal` accepts.
    [
      'all bands off',
      variant({
        minWalkableFrac: 0,
        minBuildableNormalFrac: 0,
        minGateReachFrac: 0,
        minCoreLegalFrac: 0,
        minCorridorWidth: 1,
        maxGateDetour: 99,
      }),
    ],
    // Tight, but every value schema-legal and away from the shipped numbers.
    [
      'tight',
      variant({
        minWalkableFrac: 0.85,
        minBuildableNormalFrac: 0.7,
        minGateReachFrac: 0.99,
        minCoreLegalFrac: 0.5,
        maxGateDetour: 1.05,
      }),
    ],
    // `minCorridorWidth: 1` switches `corridorsOk` off in the *measurement*;
    // it is the config a cfg-conditional term in `terrainLegal` would key on.
    ['corridor band off', variant({ minCorridorWidth: 1 })],
  ];
})();

describe('fb064v — a band the mirror does not know about cannot land green', () => {
  it.each(CONFIGS)(
    'agrees with `terrainLegal` on every field, over the spread (%s)',
    (_name, c2) => {
      const q0 = measureTerrain(baseMap, c2);
      const disagreed: string[] = [];
      for (const key of Object.keys(q0) as Array<keyof TerrainMeasure>) {
        const values: Array<number | boolean> =
          typeof q0[key] === 'boolean' ? [true, false] : SWEEP_VALUES;
        for (const value of values) {
          const q = { ...q0, [key]: value } as TerrainMeasure;
          if (legalMeasure(q, c2) !== terrainLegal(q, c2)) {
            disagreed.push(`${String(key)}=${String(value)}`);
          }
        }
      }
      expect(disagreed).toEqual([]);
    },
  );

  it('reads every threshold from the config it is handed, band by band', () => {
    // QA bug 1: the earlier version of this test perturbed `minWalkableFrac`
    // only, so three of the five bands could be frozen at their shipped value
    // undetected. Each band is now moved on its own, and the probe value sits
    // between the old threshold and the new one — the one place a frozen
    // constant and a live read give different answers.
    for (const [band, thr] of FLOOR_BANDS) {
      if (thr <= 0) continue;
      const raw = JSON.parse(JSON.stringify(cfg)) as Record<string, unknown>;
      (raw.constraints as Record<string, number>)[FLOOR_FIELD[band]] = 0;
      const moved = parseTerrain(raw);
      const probe = { ...base, [band]: under(thr) };
      expect(legalMeasure(probe, cfg), `${band} shipped`).toBe(terrainLegal(probe, cfg));
      expect(legalMeasure(probe, moved), `${band} moved`).toBe(terrainLegal(probe, moved));
      // ...and the two configs really do disagree, so the check above is not
      // comparing a value both of them refuse.
      expect(terrainLegal(probe, cfg), `${band} shipped verdict`).toBe(false);
      expect(terrainLegal(probe, moved), `${band} moved verdict`).toBe(true);
    }
    // The cap band, whose direction is the other way round.
    const raw = JSON.parse(JSON.stringify(cfg)) as Record<string, unknown>;
    (raw.constraints as Record<string, number>).maxGateDetour = 99;
    const wide = parseTerrain(raw);
    const far = { ...base, maxGateDetour: over(c.maxGateDetour) };
    expect(terrainLegal(far, cfg)).toBe(false);
    expect(legalMeasure(far, cfg)).toBe(false);
    expect(terrainLegal(far, wide)).toBe(true);
    expect(legalMeasure(far, wide)).toBe(true);
  });

  it('the sweep really is over every field, including the ones nothing reads', () => {
    // `walkableCount`/`normalCount`/`legalCoreCount` are diagnostics no band
    // reads today. They are swept anyway: the point of deriving the sweep from
    // the object is that a band added over one of them is covered on the day
    // it lands, not the day someone remembers this list.
    expect(Object.keys(base).sort()).toEqual(
      [
        ...LEGALITY_BANDS,
        ...LEGALITY_FLAGS,
        'walkableCount',
        'normalCount',
        'legalCoreCount',
      ].sort(),
    );
  });

  it('every field the mirror reads is one `LEGALITY_BANDS` or `LEGALITY_FLAGS` names', () => {
    // QA bug 2: `LEGALITY_BANDS` was tied to the table but not to the
    // predicate, so a band added to both `terrainLegal` and the mirror — and
    // not to this list — would drop silently out of the ledger's per-band
    // statistics, which is the drift the list exists to prevent.
    const src = readFileSync(new URL('./terrain-legality.ts', import.meta.url), 'utf8');
    const body = src.slice(
      src.indexOf('export function legalMeasure'),
      src.indexOf('export function legalUnder'),
    );
    const read = new Set([...body.matchAll(/\bq\.([A-Za-z]+)/g)].map((m) => m[1]));
    expect([...read].sort()).toEqual([...LEGALITY_BANDS, ...LEGALITY_FLAGS].sort());
  });

  it('the spread is not silently one-sided: every band is crossed by it', () => {
    // A sweep whose every value happened to be refused would agree trivially.
    for (const band of LEGALITY_BANDS) {
      const verdicts = new Set(SWEEP_VALUES.map((v) => terrainLegal({ ...base, [band]: v }, cfg)));
      expect(verdicts, band).toEqual(new Set([true, false]));
    }
  });

  it('`failedBands` itemises exactly what `legalMeasure` refuses', () => {
    // The ledger reports *why* the generator retried, which needs the terms
    // separately; that made it a fourth enumeration of the same nine terms.
    // Pinning it against the mirror over the same sweep is what stops the two
    // from drifting the way the three original copies did.
    const disagreed: string[] = [];
    for (const [name, c2] of CONFIGS) {
      const q0 = measureTerrain(baseMap, c2);
      for (const key of Object.keys(q0) as Array<keyof TerrainMeasure>) {
        const values: Array<number | boolean> =
          typeof q0[key] === 'boolean' ? [true, false] : SWEEP_VALUES;
        for (const value of values) {
          const q = { ...q0, [key]: value } as TerrainMeasure;
          if ((failedBands(q, c2).length === 0) !== legalMeasure(q, c2)) {
            disagreed.push(`${name} ${String(key)}=${String(value)}`);
          }
        }
      }
    }
    expect(disagreed).toEqual([]);
  });

  it('`slackOf` agrees with `failedBands` on which side of each band a map is', () => {
    // fb065a's slack measure is the *fifth* statement of these thresholds. Its
    // exhaustive `switch` on `LegalityBand` makes an added band a compile
    // error, which is half the guard; this is the other half — a flipped
    // direction or a renamed constraint key — pinned over the same config
    // matrix, so a frozen threshold cannot hide behind the shipped `/data`
    // either (the failure mode QA found in the first version of this file).
    const disagreed: string[] = [];
    for (const [name, c2] of CONFIGS) {
      const q0 = measureTerrain(baseMap, c2);
      for (const band of LEGALITY_BANDS) {
        for (const value of SWEEP_VALUES) {
          const q = { ...q0, [band]: value } as TerrainMeasure;
          // `maxGateDetour` is the one band `failedBands` splits in two, and
          // `slackOf` reports the sentinel side as a flat `-1` — "failed", the
          // same verdict under a different name — so both names count as a
          // failure of this band here.
          //
          // `>= 0`, not `> 0`: zero slack means exactly on the threshold, which
          // `legalMeasure`'s `>=`/`<=` accept. That equality is the whole
          // subject of fb065a, so getting its sign right here is not a detail.
          const failed = failedBands(q, c2).some((b) => b === band || b === `${band}<1`);
          if (failed !== !(slackOf(q, band, c2) >= 0)) {
            disagreed.push(`${name} ${band}=${String(value)} slack=${slackOf(q, band, c2)}`);
          }
        }
      }
    }
    expect(disagreed).toEqual([]);
  });
});

describe('fb064v — the mirror is still independent of the flag it checks', () => {
  it('a map can be measured legal by the mirror without asking `map.fallback`', () => {
    // The whole reason these suites re-derive: `legalUnder` reads measurements
    // only, so it stays able to fail on a map the generator called good.
    const illegal = synthetic(TerrainKind.Rock);
    expect(legalUnder(illegal, cfg)).toBe(false);
    expect(legalUnder({ ...illegal, fallback: false }, cfg)).toBe(false);
    expect(legalUnder(baseMap, cfg)).toBe(true);
    expect(legalUnder({ ...baseMap, fallback: true }, cfg)).toBe(true);
  });

  it('reads its thresholds from the config it is handed, not the shipped one', () => {
    // Through `parseTerrain`, not a spread: `minWalkableFrac: 1` exceeds the
    // schema's ceiling and is data the loader would refuse, so asserting on it
    // would be asserting about a config no run can hold. `minCoreLegalFrac` is
    // the band with real headroom above the flat arena — the walkable and
    // buildable floors cannot be raised past what this map already measures,
    // since an all-normal grid inside a rock border *is* the ceiling.
    const raw = JSON.parse(JSON.stringify(cfg)) as Record<string, unknown>;
    (raw.constraints as Record<string, number>).minCoreLegalFrac = 0.95;
    const strict = parseTerrain(raw);
    expect(legalUnder(baseMap, cfg)).toBe(true);
    expect(legalUnder(baseMap, strict)).toBe(false);
    expect(terrainLegal(measureTerrain(baseMap, strict), strict)).toBe(false);
  });
});
