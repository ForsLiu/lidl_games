/**
 * SPEC-FINAL §10.5 (fb064i): the high-ground protection rules.
 *
 * The owner's designer note, in full:
 *   "high ground: buildable; towers on it CANNOT be attacked directly by
 *    ground melee enemies [ground enemies cannot step onto high tiles and
 *    cannot melee what is on them; ranged enemies (Spitter), fliers, and the
 *    bosses' special attacks still can; Burrowers cannot surface on high
 *    ground]"
 *
 * Three of those four clauses are already true without a line of code here:
 * `high` is `walkable: false` in `data/terrain.json`, so `Grid.blocked` stops
 * every ground walker at the cliff and no ground enemy can step onto or stand
 * on high ground (fb064b). What is left is what the mask cannot express — a
 * walker *adjacent* to the cliff bumping into the tower on top of it, and a
 * Burrower that tunnels under the mask and surfaces wherever it likes. Those
 * are the two predicates below.
 *
 * They are pure and total: no `World`, no `Grid` import, no state. Each
 * `enemies.ts` call site at the merge is one call (BACKLOG-TERRAIN.md's Log
 * names all six), which is the point — a rule spread across three call sites is
 * a rule that will be honoured on two of them.
 *
 * Two things the table deliberately does not say, both recorded in that Log:
 *   - **There is no boss family.** The owner exempts "the bosses' *special
 *     attacks*", not bosses, and a family flag cannot tell a boss's special
 *     from its melee. So bosses classify as ground — their melee is blocked
 *     like any other walker's — and the specials are exempt by living in
 *     `boss.ts`, where the merge simply does not call these predicates. A
 *     blanket `boss` row would have handed the Gatebreaker, whose
 *     `structureBreaker` trait forces the breach branch unconditionally, the
 *     right to chew a high-ground tower from the low tile beside it.
 *     `boss.ts` holds one true special (`shatterAlong`) and one anti-stall
 *     failsafe (`updateUnreachable`); neither is guarded, and the failsafe
 *     must not be — it damages the nearest structure *or else* the Core, so a
 *     guard there would let a boss stalled beside a high tower deal nothing at
 *     all and the failsafe would stop failing safe.
 *   - **The flier row is inert today** and is here for the rule, not for a live
 *     path: `enemies.ts`'s bump/breach branch is behind `!e.flying`, and the one
 *     authored flier carries no `ranged` trait, so no flier reaches a
 *     structure-damage site at all.
 */
import type { HighGroundFamily, TerrainConfig } from './config';

export type { HighGroundFamily };

/**
 * The one thing a rule needs to ask the map. `Grid` satisfies it structurally,
 * so this module never imports the integration file — and a test can pin a
 * rule against a hand-built board without building a `Grid` at all.
 */
export interface HighGroundQuery {
  isHighGround(tx: number, ty: number): boolean;
}

/**
 * Which family an enemy belongs to, from the traits it is authored with.
 *
 * First match in file order wins and the last family is the catch-all, both
 * pinned by the loader (`checkHighGround`), so this is total for any config
 * that came through `parseTerrain`.
 *
 * Resolve it **once per `EnemyDef`**, not per tick: `traits.includes` is a
 * string scan, which is exactly why `enemies.ts` folds traits into a bitmask
 * and caches it by def id. This function is the uncached one; call sites that
 * cannot hold the result should go through `familyForDef` below.
 */
export function highGroundFamily(cfg: TerrainConfig, traits: readonly string[]): HighGroundFamily {
  for (const f of cfg.highGround.families) {
    if (f.traits.length === 0) return f;
    for (const t of f.traits) {
      if (traits.includes(t)) return f;
    }
  }
  // Unreachable through `parseTerrain`, which refuses a table with no trailing
  // catch-all. Loud rather than `undefined`: a silent miss here would read
  // downstream as "no exemptions", i.e. the strictest rule, on every enemy.
  throw new Error(
    `highGroundFamily: no family matches traits [${traits.join(', ')}] and the table has no catch-all`,
  );
}

/**
 * `highGroundFamily`, memoised per enemy def id — the shape `traitFlags` uses.
 *
 * The rules are asked inside `moveEnemy`'s collision branch, which runs for
 * every walker on every tick it touches something, so the merge must not pay an
 * `Array.includes` string scan there. Preferred merge shape is still a field
 * resolved once at spawn beside `e.flags`; this exists so a call site holding
 * only a def is one cheap call rather than a scan.
 *
 * Keyed by config first, so a re-parsed `/data` (the Tuner's terrain page,
 * fb064f) gets a fresh table rather than the previous one's answers.
 *
 * The entry also holds the `traits` array it was resolved from and re-resolves
 * unless the caller brings the identical one back. `traitFlags` keys on the def
 * id alone, and that is stale the moment `loadContent({ enemies })` hands the
 * same id a different trait list — which is not hypothetical, it is the very
 * API this module cites as the reason the roster cannot be validated at load
 * (`src/devserver/tunerSave.ts` calls it). A parsed document gives each def a
 * fresh array, so the identity check costs one comparison and closes it. The
 * one case it cannot see is a `traits` array mutated in place.
 */
const familyCache = new WeakMap<
  TerrainConfig,
  Map<number, { traits: readonly string[]; family: HighGroundFamily }>
>();

export function familyForDef(
  cfg: TerrainConfig,
  defId: number,
  traits: readonly string[],
): HighGroundFamily {
  let byId = familyCache.get(cfg);
  if (!byId) {
    byId = new Map();
    familyCache.set(cfg, byId);
  }
  const hit = byId.get(defId);
  if (hit !== undefined && hit.traits === traits) return hit.family;
  const family = highGroundFamily(cfg, traits);
  byId.set(defId, { traits, family });
  return family;
}

/** May this family target or damage a structure standing on high ground? */
export function canAttackHighGround(family: HighGroundFamily): boolean {
  return family.attacksHigh;
}

/** May this family emerge from underground onto high ground? */
export function canSurfaceOnHighGround(family: HighGroundFamily): boolean {
  return family.surfacesHigh;
}

/**
 * May this family attack the structure standing on tile `(tx, ty)`?
 *
 * The whole rule, for both the melee-breach path and the Spitter's ranged one:
 * false only when the tile is high ground and the family is not exempt.
 *
 * Coordinates are floored, so an entity position works as well as a structure's
 * tile. A coordinate off the board, or `NaN`, reads as *not* high ground and
 * the answer is `true` — the same convention `Grid.isHighGround` already uses.
 * That direction is the safe one: these rules can then only ever take away an
 * attack that terrain really blocks, never invent a block out of a junk float.
 */
export function canAttackStructureAt(
  map: HighGroundQuery,
  family: HighGroundFamily,
  tx: number,
  ty: number,
): boolean {
  return family.attacksHigh || !map.isHighGround(Math.floor(tx), Math.floor(ty));
}

/**
 * May this family surface at `(x, y)`?
 *
 * Asked where a submerged or phasing enemy would come back up. A Burrower
 * denied here stays underground and keeps tunnelling, which is the mechanic:
 * `Grid` cannot stop it, because the ghost field is terrain-blind on purpose
 * (fb064b — Burrowers and Wraiths travel *under* stone).
 */
export function canSurfaceAt(
  map: HighGroundQuery,
  family: HighGroundFamily,
  x: number,
  y: number,
): boolean {
  return family.surfacesHigh || !map.isHighGround(Math.floor(x), Math.floor(y));
}
