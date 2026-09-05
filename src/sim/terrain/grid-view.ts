/**
 * fb065c (SPEC-FINAL §10.5): the adapter from a live `Grid` to the
 * `TerrainGrid` every terrain diagnostic reads.
 *
 * **The hole this closes.** fb064k built `describeTerrain` so that "a terrain
 * repro is one string rather than a seed and a screenshot". But it takes a
 * `TerrainGrid`, and a run holds a `Grid` — so the one artefact built to
 * describe a map could only ever be taken from the generator's *output*, never
 * from the map a bug was actually seen on. Those are not the same tiles, and
 * the gap is real: between `generateTerrain` and the grid a run plays,
 * `world.ts` runs the overlay through `clearOverlayBlock` (a 3x3 block of
 * forced normal ground around the Warden's spawn), `Grid.applyTerrain` forces
 * every Gate and Core tile back to normal, and `Grid.placeCore` moves that Core
 * footprint around.
 *
 * How big the gap is, measured rather than assumed — because the honest number
 * is smaller than the list of overrides suggests, and its shape is the point:
 * over `applyRunTerrain` on seeds 1..100 the live grid is **identical to its
 * generated map on 84 of them**, differs by a mean of **0.66** tiles, and by
 * **13** on the worst (seed 40). Most overridden tiles were already normal, so
 * most runs are unaffected — which is exactly what makes the adapter worth
 * having rather than optional. The 16% of seeds where a repro taken from the
 * generator is wrong are invisible from the other 84%, and nothing in a bug
 * report would say which kind you were holding. The ledger is pinned in
 * `tests/terrain-grid-view.test.ts`.
 *
 * fb065c's own premise said "tests already work around it with a three-line
 * `gridView` helper each", plural; the sweep found exactly **one**
 * (`tests/terrain-grid.test.ts`), and no other construction of a `TerrainGrid`
 * from a `Grid` anywhere in `src/`, `tests/` or `tools/`. That copy is now this
 * function. The premise was one copy short, not three — recorded so the record
 * does not overstate what this consolidated.
 *
 * **It copies rather than aliases, and that is the whole design.** `Grid`
 * rebuilds `terrainKind` in place on every `applyTerrain` and every
 * `placeCore` (`syncTerrain`), so a view that aliased the buffer would be a
 * "snapshot" whose tiles changed under the reader — a dump taken before a Core
 * move and printed after it would describe neither state. 720 bytes per call
 * buys a value that means what it says.
 *
 * **The result carries no provenance, deliberately.** It is a bare
 * `TerrainGrid`, so `describeTerrain` writes `source=-` for it (fb064s), which
 * is the honest answer: these tiles are no seed's output. Re-generating from
 * the run's seed does *not* reproduce them, and a dump that claimed otherwise
 * would send a reader chasing a map that never existed.
 */
import type { Grid } from '../grid';
import type { TerrainGrid } from './types';

/**
 * The Grid's *effective* terrain as a `TerrainGrid`, copied.
 *
 * "Effective" is the word doing work: `terrainKind` is the raw overlay with the
 * current gate and Core footprints punched back to normal, which is what the
 * sim's walkability and build rules actually run on, and therefore what a repro
 * needs. `Grid` keeps the pre-override copy privately for `placeCore`'s undo;
 * that one is not what a bug was seen on.
 */
export function gridTerrain(grid: Grid): TerrainGrid {
  const n = grid.w * grid.h;
  // The same refusal `terrainOverlay` and `describeTerrain` make at their own
  // boundaries, for the same reason: every consumer downstream reads
  // `kind[i]` for `i < w * h` and a short buffer reads `undefined`, which is
  // neither a kind nor an error — it becomes a dump of literal `undefined`
  // glyphs or a silently sealed arena. A `Grid` cannot reach that state today
  // (its arrays are sized from `GRID_W`/`GRID_H` at construction), which is
  // exactly why the check is cheap and worth keeping: it is a statement about
  // the contract, not a workaround for a known bug.
  if (grid.terrainKind.length !== n) {
    throw new Error(
      `gridTerrain: terrainKind length ${grid.terrainKind.length}, expected ${grid.w}x${grid.h}`,
    );
  }
  return { w: grid.w, h: grid.h, kind: new Uint8Array(grid.terrainKind) };
}
