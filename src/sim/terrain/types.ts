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
  /**
   * The seed the caller asked for, verbatim — not coerced (fb064j), except
   * that `-0` is normalised to `0`. It is the value to compare against
   * `RunConfig.seed`, and it may be negative even though `seed` never is.
   *
   * It is *provenance, not identity*: a negative seed and its uint32 twin
   * (`-1` and `4294967295`) are distinguishable here but produce byte-identical
   * tiles and an identical `hash`. A replay guard that only checks `hash` will
   * therefore not notice a `requestedSeed` mismatch, and one that checks a
   * seed must check *this* field — `seed` below is the tempting name and the
   * wrong one.
   */
  readonly requestedSeed: number;
  /**
   * The uint32 RNG key that actually produced this map: `requestedSeed >>> 0`
   * advanced by one per degenerate attempt, wrapping modulo `2 ** 32`.
   *
   * On a `fallback: true` map it is instead the *unadvanced* key, because no
   * key produced those tiles — the flat map is not any seed's output.
   */
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
