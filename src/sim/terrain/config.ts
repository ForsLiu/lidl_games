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
 * How many 2x2 Core anchors the flat map offers at a given `coreGateClearance`
 * — the geometric term `maxCoreLegalFrac` is built on (fb064g).
 *
 * Re-derived here rather than measured through `legalCoreAnchors` because
 * `analyze.ts` imports this module and measuring would be an import cycle. On
 * the flat map the two agree by construction — every interior tile is normal
 * and reachable from every gate, so an anchor is legal exactly when its 2x2
 * fits inside the interior and all four tiles clear the gate clearance — and
 * `tests/terrain-generation.test.ts` pins them equal across a spread of
 * clearances so the replica cannot drift.
 *
 * Precondition, true of the shipped `GATES` and asserted by that test: no two
 * gates are adjacent along a border. A gate tile is normal, so a 2x2 touching
 * one is only excluded because its *other* border tiles are rock; two adjacent
 * gates would open an anchor this count never sees.
 */
export function flatCoreAnchorCount(clearance: number): number {
  let anchors = 0;
  for (let y = 1; y <= GRID_H - 3; y++) {
    for (let x = 1; x <= GRID_W - 3; x++) {
      let ok = true;
      for (let dy = 0; dy < 2 && ok; dy++) {
        for (let dx = 0; dx < 2 && ok; dx++) {
          let near = Number.MAX_SAFE_INTEGER;
          for (const g of GATES) {
            const d = Math.max(Math.abs(x + dx - g.tx), Math.abs(y + dy - g.ty));
            if (d < near) near = d;
          }
          if (near <= clearance) ok = false;
        }
      }
      if (ok) anchors++;
    }
  }
  return anchors;
}

/**
 * The ceiling on `coreLegalFrac` — `legalCoreAnchors().length / normalCount` —
 * over every map the generator can produce at a given `coreGateClearance`.
 *
 * Proof, so that this is a bound and not an observation. Let A be a map's legal
 * anchor set, `a` the flat map's anchor count at this clearance.
 *   1. `|A| <= a`. An anchor needs four *normal* tiles clearing the clearance.
 *      The clearance excludes the same positions on every map, every anchor
 *      must sit wholly inside the interior (each 2x2 touching a gate also
 *      touches a rock border tile, given non-adjacent gates), and the flat map
 *      already offers every such position.
 *   2. `normalCount >= |A| + 1` whenever A is non-empty. Anchor `(x, y) -> `
 *      tile `(x, y)` is injective into normal tiles. Take any occupied anchor
 *      row and its rightmost anchor `(xMax, y)`: tile `(xMax + 1, y)` is normal
 *      (it is that anchor's top-right tile) and is no anchor's image, since an
 *      anchor at `(xMax + 1, y)` would contradict maximality. So the injection
 *      misses at least one normal tile.
 * Hence `coreLegalFrac = |A| / normalCount <= a / (a + 1)`, and 0 when a is 0.
 *
 * This is deliberately the *weakest* honest ceiling, not the tightest guess.
 * fb064g first shipped the flat map's own share (0.8098 at the shipped
 * clearance 3) on the theory that the generator could never beat the layout it
 * falls back to — and that is simply false: `scatter` paints `rough`, which
 * leaves `normalCount` without costing an anchor. Measured counterexamples,
 * both legal, both refused by that ceiling:
 *   - `coreGateClearance: 12`, shipped densities, seed 262 -> 0.105263 against
 *     the flat map's 0.087805, so a band of 0.10 was refused and then met.
 *   - `coreGateClearance: 3`, `density: { rough: 0, rock: 0, high: 0.002 }`,
 *     seed 55 -> 0.811075 against the flat map's 0.809756; 738 of seeds 1..3000
 *     clear it.
 * Refusing data the generator actually satisfies is the failure this file
 * already records as fb064a's lesson (see the note under the buildable check),
 * and `density` and `coreGateClearance` are exactly what fb064f hands to live
 * Tuner editing.
 *
 * What survives is narrow and true: `1` is impossible at every clearance, and
 * at clearance 17+ nothing is legal at all, which is why this subsumes the
 * standalone `coreGateClearance` check fb064a shipped. A merely *strict* band
 * — 0.70, or 0.90 — still loads, and must: the generator reaches ~0.61 on the
 * shipped data, so those are bands no seed happens to clear rather than bands
 * no map can, and the flagged fallback is the designed answer to them.
 */
/**
 * The ceiling rounded so the printed number is itself loadable. `toFixed`
 * rounds to nearest, which at clearance 3 turns 0.997995991983968 into
 * "0.997996" — a value this very check then refuses, so a designer pasting the
 * number back got the same error again.
 */
function floorTo6(value: number): number {
  return Math.floor(value * 1e6) / 1e6;
}

export function maxCoreLegalFrac(clearance: number): number {
  const a = flatCoreAnchorCount(clearance);
  return a === 0 ? 0 : a / (a + 1);
}

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

/**
 * One high-ground family (fb064i). `traits` is matched against
 * `EnemyDef.traits`; the first family in file order carrying any of an enemy's
 * traits wins, and the last family — which must name no traits — is the
 * catch-all every unlisted enemy lands in.
 */
const highGroundFamilySchema = z
  .object({
    key: z.string().min(1),
    // Capped for the same reason the radii are (fb064a's unbounded-loop
    // finding): classification is a linear scan over families x traits, and
    // the merge runs it from `moveEnemy`'s collision branch. There is no design
    // that needs hundreds of either — 20 enemies carry 21 distinct traits
    // between them — so an oversized table is a mistake, not a tuning choice.
    traits: z.array(z.string().min(1)).max(64),
    /** May target/damage a structure standing on a high tile. */
    attacksHigh: z.boolean(),
    /** May emerge from underground onto a high tile. */
    surfacesHigh: z.boolean(),
  })
  .strict();

const schema = z
  .object({
    tiles: z.array(tileSchema).length(TERRAIN_KEYS.length),
    // fb064l: `jitter` is the half-width of the per-seed band each density is
    // drawn from, as a share of the density itself — 0.22 means a seed's rough
    // budget is uniform on [0.78, 1.22] x 0.17. At 0 the generator is fb064a's:
    // every seed gets exactly `round(density * interior)` tiles of each kind,
    // which measured as *one* distinct `high` count over 500 seeds.
    //
    // Bounded only by `frac` (0..1), and deliberately with no cleverer ceiling.
    // The tempting one — refuse a jitter whose maximum obstruction cannot leave
    // `minBuildableNormalFrac` of normal ground — is the same unsound shape
    // fb064g rejected for the buildable band below: `scatter()` is best-effort,
    // so the maximum *budget* is not the maximum *placement*, and the ceiling
    // would refuse configs the generator satisfies. A jitter that does make
    // seeds degenerate is not silent either: it shows up as retries and, at the
    // limit, as `fallback`.
    //
    // That last sentence was a claim about a guard that did not exist until QA
    // checked it, so here is the guard and here is the cost it records:
    // `tests/terrain-generation.test.ts`'s "the loader accepts jitter up to 1,
    // and this is what that costs" measures `jitter: 1` at 26.7% retries
    // (0.09% shipped) and 3 fallback seeds in 50000 — degradation, never an
    // illegal map and never a hang. A future decision to cap this field
    // belongs there, with those numbers in view.
    density: z.object({ rough: frac, rock: frac, high: frac, jitter: frac }).strict(),
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
    // fb064i: who the high-ground protection rules exempt, as data. The owner's
    // designer note names families, not enemies ("ranged enemies (Spitter),
    // fliers, and the bosses' special attacks still can; Burrowers cannot
    // surface"), so the table is keyed by trait name and a new enemy inherits
    // its family from the traits it is authored with — no code edit, no list of
    // enemy keys to keep in sync (architecture rule 4).
    highGround: z
      .object({ families: z.array(highGroundFamilySchema).min(1).max(64) })
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
    // fb064g: `minCoreLegalFrac` had no ceiling at all, so it kept the exact
    // failure the two above were added to close — `1` loaded, every seed then
    // exhausted `maxAttempts`, and the run played out on the flat fallback.
    //
    // Its ceiling is a weaker shape than theirs, on purpose: `coreLegalFrac`
    // is anchor *positions* over normal *tiles*, and a map can shrink that
    // denominator faster than its numerator, so the only sound bound is
    // `a / (a + 1)` (see `maxCoreLegalFrac` for the proof and for the measured
    // counterexamples that killed the tighter version). It refuses `1` at every
    // clearance and refuses everything positive from clearance 17 up, where no
    // tile can be an anchor — which is what lets it subsume the standalone
    // `coreGateClearance` check this replaced.
    const coreCeiling = maxCoreLegalFrac(cfg.coreGateClearance);
    if (c.minCoreLegalFrac > coreCeiling) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        // When the ceiling is 0 the band is fine and the clearance is what is
        // wrong, so blame that field: fb064f's Tuner highlights by path, and
        // pointing a designer at a band they never touched is a worse
        // diagnostic than the silence this check replaced.
        path: coreCeiling === 0 ? ['coreGateClearance'] : ['constraints', 'minCoreLegalFrac'],
        message:
          coreCeiling === 0
            ? `coreGateClearance ${cfg.coreGateClearance} leaves no tile able to be a legal Core ` +
              `anchor on any map, but constraints.minCoreLegalFrac is ${c.minCoreLegalFrac}`
            : `minCoreLegalFrac ${c.minCoreLegalFrac} must be at most ${floorTo6(coreCeiling)}, the most ` +
              `legal Core anchors any map can reach as a share of its normal tiles at ` +
              `coreGateClearance ${cfg.coreGateClearance}`,
      });
    }
    checkHighGround(cfg.highGround.families, ctx);
  });

/**
 * The unpayable-data rule for the high-ground family table (fb064i).
 *
 * Every rule here refuses a table that is *silently* wrong — one that loads,
 * classifies every enemy without complaint, and applies a rule nobody wrote.
 * None of them is a taste check: a duplicate key or a shadowed trait changes no
 * behaviour a designer can see until an enemy lands in the wrong family.
 *
 * Deliberately NOT checked here: that each trait is carried by some enemy in
 * `data/enemies.json`. It was, and it was wrong twice over. It is a false
 * rejection in this lane's recorded sense — a family naming a trait nothing
 * currently carries is inert, not unpayable, so a content pass that renames one
 * trait would stop `data/terrain.json` loading at all and blame the wrong file
 * (three of the shipped table's traits have exactly one carrier). And it cannot
 * be sound anyway: `loadContent({ enemies })` swaps the roster the classifier
 * actually runs against (`src/devserver/tunerSave.ts` does exactly that), so
 * the file this would validate need not be the roster in play. The typo it was
 * aimed at is caught where it costs nothing — `tests/terrain-high-ground.test`
 * asserts the shipped table against the shipped roster.
 */
function checkHighGround(
  families: ReadonlyArray<{ key: string; traits: readonly string[] }>,
  ctx: z.RefinementCtx,
): void {
  const seenKeys = new Set<string>();
  const seenTraits = new Map<string, number>();
  for (let i = 0; i < families.length; i++) {
    const f = families[i];
    if (seenKeys.has(f.key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['highGround', 'families', i, 'key'],
        message: `duplicate family key "${f.key}" — keys name the rule in a log and a Tuner row`,
      });
    }
    seenKeys.add(f.key);

    // Classification is first-match-wins, so a trait named twice means the
    // later family is dead for every enemy carrying it — and dead exactly for
    // the enemies its author was thinking of. Ordering already expresses every
    // precedence a duplicate could, so refusing it costs no expressiveness.
    for (const t of f.traits) {
      const first = seenTraits.get(t);
      if (first === undefined) {
        seenTraits.set(t, i);
      } else {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['highGround', 'families', i, 'traits'],
          message:
            first === i
              ? `family "${f.key}" lists trait "${t}" twice`
              : `trait "${t}" is already claimed by family "${families[first].key}" — first match ` +
                `wins, so this entry could never apply to any enemy`,
        });
      }
    }

    // The catch-all must be last and must be the only one. Anywhere else it
    // swallows every family below it; absent, an enemy carrying none of the
    // listed traits has no family at all and the rules cannot be total.
    const isCatchAll = f.traits.length === 0;
    const isLast = i === families.length - 1;
    if (isCatchAll !== isLast) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['highGround', 'families', i, 'traits'],
        message: isCatchAll
          ? `family "${f.key}" names no traits, so it matches every enemy and hides the ` +
            `${families.length - 1 - i} families after it — only the last family may be the catch-all`
          : `the last family ("${f.key}") must name no traits: it is the catch-all every enemy ` +
            `carrying none of the listed traits falls into`,
      });
    }
  }
}

export type TerrainConfig = z.infer<typeof schema>;
export type TerrainTileDef = TerrainConfig['tiles'][number];
export type HighGroundFamily = TerrainConfig['highGround']['families'][number];

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
