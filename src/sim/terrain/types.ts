/** SPEC-FINAL §10.5 (fb064a): the generated map and its measured bands. */

/**
 * The minimum a measurement needs: dimensions plus tiles. Split out of
 * `TerrainMap` so the generator can measure a half-built map mid-attempt,
 * before it has a seed provenance or a hash to report.
 */
export interface TerrainGrid {
  readonly w: number;
  readonly h: number;
  /**
   * `TerrainKind` per tile, row-major, `w * h` long.
   *
   * `readonly` freezes the binding, not the buffer. A `TerrainMap`'s `hash` is
   * computed once at construction, so anything that writes into `kind`
   * afterwards leaves that hash stale and wrong — and the hash is the G2
   * determinism handle. Treat a generated map as immutable; if fb064b/fb064c
   * need an edited map, rebuild it through `terrainHash` rather than patching
   * tiles in place.
   */
  readonly kind: Uint8Array;
}

export interface TerrainMap extends TerrainGrid {
  /** The seed the caller asked for. */
  readonly requestedSeed: number;
  /** The seed that actually produced this map (`requestedSeed + n` retries). */
  readonly seed: number;
  /** How many generation attempts ran, including the one that succeeded. */
  readonly attempts: number;
  /** True when every attempt was degenerate and the flat legal map was used. */
  readonly fallback: boolean;
  /** FNV-1a over seed + tiles; the G2 determinism handle for a map. */
  readonly hash: string;
}

export interface TerrainMeasure {
  /** Share of the whole grid a ground walker can stand on. */
  walkableFrac: number;
  /** Share of the whole grid that is normal (walkable *and* buildable). */
  buildableNormalFrac: number;
  /** Worst single gate's share of the walkable area it can reach. */
  gateReachFrac: number;
  /** Legal 2x2 Core anchors as a share of normal tiles. */
  coreLegalFrac: number;
  /** Every gate reaches the open area through a >= 2-tile-wide corridor. */
  corridorsOk: boolean;
  /** Every gate has at least one walkable neighbour (never enclosed). */
  gatesOpen: boolean;
  /** All gates sit in one walkable component — each can reach the others. */
  gatesConnected: boolean;
  walkableCount: number;
  normalCount: number;
  legalCoreCount: number;
}
