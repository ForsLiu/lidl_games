/**
 * SPEC-FINAL §10.5 (fb064a): the terrain generator's data contract.
 *
 * Every number and every tile property lives in `data/terrain.json`
 * (architecture rule 4); this module only validates it. The four tile kinds
 * are *positional* — `TerrainKind` indexes `tiles[]` — so the loader refuses a
 * file whose keys are not exactly `normal, rough, rock, high` in that order
 * rather than letting a reordered file silently repaint the map.
 */
import { z } from 'zod';

import raw from '../../../data/terrain.json';
import { GATES, GRID_H, GRID_W } from '../grid';

/**
 * The arena's own limits, which several bands are unsatisfiable past.
 *
 * `SPAN` is the widest a radius can usefully be. `MAX_WALKABLE_FRAC` is the
 * ceiling *any* map can reach: the border is permanently rock, so only the
 * interior plus the gate tiles themselves can ever be walked. On the shipped
 * 36x20 grid that is (34*18 + 3) / 720 = 0.854 — a `minWalkableFrac` above it
 * is not a strict tuning choice, it is a band no seed can clear.
 */
const SPAN = Math.max(GRID_W, GRID_H);
const MAX_WALKABLE_FRAC = ((GRID_W - 2) * (GRID_H - 2) + GATES.length) / (GRID_W * GRID_H);

/** Tiles the scatter can reach at all — the bound on any blob. */
const INTERIOR_TILES = (GRID_W - 2) * (GRID_H - 2);

/**
 * The largest nearest-gate Chebyshev distance anywhere on the grid (17 on the
 * shipped 36x20). At or above it, `coreGateClearance` excludes every tile, so
 * no map can offer a single legal Core anchor.
 */
const MAX_GATE_DISTANCE = (() => {
  let worst = 0;
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      let near = Number.MAX_SAFE_INTEGER;
      for (const g of GATES) {
        const d = Math.max(Math.abs(x - g.tx), Math.abs(y - g.ty));
        if (d < near) near = d;
      }
      if (near > worst) worst = near;
    }
  }
  return worst;
})();

/** Fixed tile order; `TerrainKind` is an index into `TerrainConfig.tiles`. */
export const TERRAIN_KEYS = ['normal', 'rough', 'rock', 'high'] as const;
export type TerrainKey = (typeof TERRAIN_KEYS)[number];

export const enum TerrainKind {
  Normal = 0,
  Rough = 1,
  Rock = 2,
  High = 3,
}

const num = z.number().finite();
const frac = num.min(0).max(1);
const posInt = z.number().int().positive();
const nonNegInt = z.number().int().min(0);

/** The flags each tile kind must carry, indexed like `TERRAIN_KEYS`. */
const REQUIRED_FLAGS: ReadonlyArray<{
  walkable: boolean;
  buildable: boolean;
  highGround: boolean;
}> = [
  { walkable: true, buildable: true, highGround: false }, // normal
  { walkable: true, buildable: false, highGround: false }, // rough
  { walkable: false, buildable: false, highGround: false }, // rock
  // High ground: buildable, but ground walkers cannot step onto it (the
  // owner's designer note). Which enemies are exempt is fb064d's problem.
  { walkable: false, buildable: true, highGround: true },
];

const tileSchema = z
  .object({
    key: z.string().min(1),
    walkable: z.boolean(),
    buildable: z.boolean(),
    highGround: z.boolean(),
    color: z.string().min(1),
  })
  .strict();

const schema = z
  .object({
    tiles: z.array(tileSchema).length(TERRAIN_KEYS.length),
    density: z.object({ rough: frac, rock: frac, high: frac }).strict(),
    // A blob cannot be larger than the ground it grows on, so the interior is
    // its natural cap — the same "the arena's own limits" treatment the radii
    // get. `scatter()`'s `placed < target` bound already stops an oversized
    // value doing real work; this keeps the schema honest rather than leaving
    // `maxSize: 1e15` quietly acceptable.
    blob: z
      .object({ minSize: posInt.max(INTERIOR_TILES), maxSize: posInt.max(INTERIOR_TILES), spread: frac })
      .strict(),
    // The radii are capped at the arena's own span: a radius wider than the
    // grid paints the whole interior and cannot mean anything further, while an
    // uncapped value is a data-driven cost multiplier on a loop inside
    // `/src/sim` (fb064f puts these fields under live Tuner editing).
    corridorRadius: posInt.max(SPAN),
    corridorJitter: frac,
    gateClearRadius: nonNegInt.max(SPAN),
    plazaRadius: nonNegInt.max(SPAN),
    // Clearance is a rejection radius, not a painted one, so it is bounded by
    // the grid rather than by cost: past the span nothing is ever legal.
    coreGateClearance: nonNegInt.max(SPAN),
    // Every attempt regenerates and re-measures the whole map. A bounded cap
    // keeps the worst-case degenerate config a slow frame, not a hang.
    maxAttempts: posInt.max(64),
    constraints: z
      .object({
        minWalkableFrac: frac,
        minBuildableNormalFrac: frac,
        minGateReachFrac: frac,
        minCoreLegalFrac: frac,
        // Only 1 (band off) and 2 are implemented: `corridorsOk` measures the
        // 2x2 block lattice, so a wider value would be accepted and then do
        // nothing. Refuse it rather than answer a designer's retune with
        // silence.
        minCorridorWidth: z.union([z.literal(1), z.literal(2)]),
      })
      .strict(),
  })
  .strict()
  .superRefine((cfg, ctx) => {
    for (let i = 0; i < TERRAIN_KEYS.length; i++) {
      if (cfg.tiles[i].key !== TERRAIN_KEYS[i]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['tiles', i, 'key'],
          message: `tile ${i} must be "${TERRAIN_KEYS[i]}" (order is load-bearing), got "${cfg.tiles[i].key}"`,
        });
      }
      // The three flags are structural, not tuning: the generator hard-codes
      // `normal` as the ground it scatters over and `rock` as the kind it seals
      // with, so a flipped flag does not retune the map, it breaks the
      // algorithm silently. `rock.walkable: true` alone turns pocket sealing
      // into a no-op *and* makes the border walkable; `normal.walkable: false`
      // makes every seed degenerate and ships the fallback forever. Colours,
      // densities and bands stay freely editable.
      const want = REQUIRED_FLAGS[i];
      for (const flag of ['walkable', 'buildable', 'highGround'] as const) {
        if (cfg.tiles[i][flag] !== want[flag]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['tiles', i, flag],
            message: `tile "${TERRAIN_KEYS[i]}" must have ${flag}: ${want[flag]} — the generator depends on it`,
          });
        }
      }
    }
    if (cfg.blob.maxSize < cfg.blob.minSize) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['blob', 'maxSize'],
        message: 'blob.maxSize must be >= blob.minSize',
      });
    }
    // Unpayable-data rule. The densities are shares of the *interior* the
    // generator scatters over, while every band is a share of the *whole*
    // grid — and the border between them is 105 permanently-rock tiles of 720.
    // Comparing the two directly (which is what fb064a shipped first) misses
    // the entire class of bands no map can reach: `minWalkableFrac: 0.9` was
    // accepted, and then every seed fell through `maxAttempts` to the flat
    // fallback with no signal at all. Nothing consumes `fallback: true` yet, so
    // that reads in-game as a flat arena for the whole run.
    //
    // So each band is checked against the ceiling the arena actually admits.
    // Every rule below is an *impossibility* proof that holds for every
    // possible map, never an estimate of a typical one — see the note under
    // the buildable check for why that distinction is load-bearing.
    const c = cfg.constraints;
    if (c.minWalkableFrac > MAX_WALKABLE_FRAC) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['constraints', 'minWalkableFrac'],
        message:
          `minWalkableFrac ${c.minWalkableFrac} exceeds ${MAX_WALKABLE_FRAC.toFixed(3)}, the most ` +
          `any map can reach on a ${GRID_W}x${GRID_H} grid with a permanently rock border`,
      });
    }
    // Normal tiles are a strict subset of walkable ones, so the same border
    // ceiling bounds the buildable band. Also exact.
    if (c.minBuildableNormalFrac > MAX_WALKABLE_FRAC) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['constraints', 'minBuildableNormalFrac'],
        message:
          `minBuildableNormalFrac ${c.minBuildableNormalFrac} exceeds ${MAX_WALKABLE_FRAC.toFixed(3)}, ` +
          `the most any map can reach — normal ground is a subset of walkable ground`,
      });
    }
    // Deliberately NOT checked: bands against the densities. It is tempting to
    // reject `minBuildableNormalFrac` above `(1 - scatter)` of the interior,
    // and fb064a briefly did — but a density is a *cap* on what `scatter()`
    // places, never a floor. Protected corridors and the retry budget routinely
    // leave it short, so the real map can hold more normal ground than the
    // arithmetic predicts, and the check refused configs the generator actually
    // satisfies (measured: `minBuildableNormalFrac: 0.5553` was rejected while
    // seed 19 reaches 0.5569). A false rejection is worse than the silent
    // fallback it was meant to prevent — the only sound ceilings are the two
    // above, which hold for every possible map rather than for a typical one.
    //
    // `coreGateClearance` rejects every tile within Chebyshev `clear` of a
    // gate, so past the grid's own maximum nearest-gate distance *no* tile can
    // ever be a legal Core anchor and `coreLegalFrac` is pinned at 0. Paired
    // with a positive `minCoreLegalFrac` that is unpayable by construction —
    // the same "accepted, then every seed silently ships the flat fallback"
    // failure as an impossible band, in a field the band checks do not cover.
    if (c.minCoreLegalFrac > 0 && cfg.coreGateClearance >= MAX_GATE_DISTANCE) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['coreGateClearance'],
        message:
          `coreGateClearance ${cfg.coreGateClearance} is at or above the grid's maximum ` +
          `nearest-gate distance ${MAX_GATE_DISTANCE}, so no tile can ever be a legal Core ` +
          `anchor, but constraints.minCoreLegalFrac is ${c.minCoreLegalFrac}`,
      });
    }
  });

export type TerrainConfig = z.infer<typeof schema>;
export type TerrainTileDef = TerrainConfig['tiles'][number];

let cached: TerrainConfig | null = null;

/**
 * Validated `data/terrain.json`. Throws (loudly) on an unpayable file.
 * The result is shared and frozen — one caller's stray `cfg.density.rock = x`
 * would otherwise reseed every later `generateTerrain` in the process.
 */
export function loadTerrain(): TerrainConfig {
  if (!cached) cached = deepFreeze(parseTerrain(raw));
  return cached;
}

/** Validate an arbitrary object as a terrain config (tests, Tuner previews). */
export function parseTerrain(value: unknown): TerrainConfig {
  return schema.parse(value);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

export function isWalkable(cfg: TerrainConfig, kind: number): boolean {
  return cfg.tiles[kind]?.walkable === true;
}

export function isBuildable(cfg: TerrainConfig, kind: number): boolean {
  return cfg.tiles[kind]?.buildable === true;
}

export function isHighGround(cfg: TerrainConfig, kind: number): boolean {
  return cfg.tiles[kind]?.highGround === true;
}
