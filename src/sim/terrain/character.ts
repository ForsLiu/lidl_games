/**
 * SPEC-FINAL §10.5 (fb064q): may the character walk onto this terrain?
 *
 * The owner's rock clause, in full:
 *   "rock/wall: NOT walkable, NOT buildable (blocks enemies and pathing; the
 *    character still passes per fb002's pass-through rule [designer note:
 *    character flies over; veto if rocks should block the character])"
 *
 * That is the only terrain clause the owner left an explicit veto on, and until
 * this module the lane had shipped no artifact for it — which mattered more
 * than it sounds, because **the answer was already decided in code and nowhere
 * written down.** fb064b routed `Grid.wardenPassable` through `terrainBlock`
 * (`!walkable`), so rock and high ground stop the Warden today, with the
 * reasoning in a grid comment: a Warden that dashes through a mountain is a
 * hole, and one parked on high ground is unreachable by every ground melee
 * enemy at once — an Act I safe spot no band measures. Sound reasoning, but it
 * is the *vetoed* reading of a clause whose default is pass-through, held in a
 * comment on a predicate about something else.
 *
 * So the flag is data (`tiles[].blocksCharacter` in `data/terrain.json`) and it
 * is live: `Grid.wardenPassable` reads it, and it alone. Settling the veto
 * either way is now one line of JSON, and the shipped answer is legible to
 * anyone who opens the file rather than derivable only by whoever greps
 * `wardenPassable`. Nothing else reads it — the flag feeds no generator
 * decision, no measured band and no enemy rule, so flipping it moves the
 * character and only the character. `tests/terrain-character.test.ts` pins that
 * over generated maps.
 *
 * These predicates are pure and total: no `World`, no `Grid` import, no state —
 * the same shape as `high-ground.ts` beside them, and for the same reason. A
 * rule re-derived at each of its call sites is a rule that will be honoured at
 * some of them.
 */
import { blocksCharacter, type TerrainConfig } from './config';
import type { TerrainGrid } from './types';

/**
 * May the character enter a tile of this kind?
 *
 * The whole rule, kind-only — for a caller that already has the kind in hand
 * (the renderer's cursor, a Tuner preview, `terrainOverlay`'s loop).
 */
export function canCharacterEnterKind(cfg: TerrainConfig, kind: number): boolean {
  return !blocksCharacter(cfg, kind);
}

/**
 * May the character enter the tile at `(x, y)` of `map`?
 *
 * **This reads the generated map, and `Grid.wardenPassable` reads the Grid.**
 * They agree on every tile terrain decides, which is what a mover should rely
 * on, and they differ in exactly two places — both because the Grid knows
 * things a `TerrainMap` does not:
 *   - *structural tiles.* `syncTerrain` forces gate and Core tiles back to
 *     passable whatever the scatter painted there, and `wardenPassable` re-reads
 *     `tile` live so a gate the run opens later (`world.ts`'s Fourth Gate) is
 *     covered too. This function has no `tile` array, so on a gate the map
 *     buried in rock — fb064b measured 138 of 500 seeds for (12, 19) — it says
 *     "blocked" where the Grid says "passable". Ask the Grid when one exists.
 *   - *off the board.* `wardenPassable` answers `false` (out of bounds is not a
 *     place); this answers `true`, per the convention below.
 * `tests/terrain-character.test.ts` pins the agreement on every other tile, so
 * the two cannot drift apart on the rule itself.
 *
 * Coordinates are floored, so an entity's float position works directly: the
 * character moves in continuous space and every call site holds an `x`/`y`, not
 * a `tx`/`ty`. Flooring rather than rejecting non-integers is the difference
 * from `Grid.buildable` — b007's bug is that a *fraction* can multiply out to a
 * legal index for a different tile, which only bites a caller that indexes with
 * the raw value; here the floor happens before the multiply, so `(5.5, 4.5)`
 * can only ever be tile `(5, 4)`.
 *
 * Off the board — and `NaN` — reads as enterable, matching `blocksCharacter`'s
 * unknown-kind convention. Bounds are not this predicate's job: every caller
 * already clamps the character into the arena (`moveWarden` and
 * `resolveDashTarget` both clamp to `0.4 .. GRID_W - 0.4`), and answering
 * "blocked" here would silently double as a wall the terrain never authored.
 */
export function canCharacterEnter(
  cfg: TerrainConfig,
  map: TerrainGrid,
  x: number,
  y: number,
): boolean {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (!(tx >= 0 && ty >= 0 && tx < map.w && ty < map.h)) return true;
  return canCharacterEnterKind(cfg, map.kind[ty * map.w + tx]);
}
