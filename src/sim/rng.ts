/**
 * Deterministic seeded RNG with named streams (SPEC §9.2).
 * mulberry32 core: 32-bit integer ops only, identical on every platform.
 */

/** The live streams an `RngSet` carries; they advance during a run and are snapshotted by `getState()`. */
export const STREAM_NAMES = ['waves', 'spawns', 'drops', 'offers', 'ai'] as const;
export type StreamName = (typeof STREAM_NAMES)[number];

/**
 * Named streams (or stream-name prefixes) derived once from the run seed and
 * consumed outside `RngSet` (SPEC-FINAL §12 rule 2: every stream is named).
 * None has live state to snapshot, so none belongs in `RngSet` — adding one
 * there would change every save's RNG snapshot shape for a stream that never
 * ticks. `'terrain'` seeds map generation (`src/sim/terrain/generate.ts`)
 * before a World exists; `'draft'`/`'draftpick'` are the per-tier modifier
 * draft prefixes (`src/sim/tiers.ts`, `draft:${tier}`). Every `fnv1a(name,
 * seed)` call site in `/src/sim` must use a name from this list or
 * `STREAM_NAMES`.
 */
export const ONE_SHOT_STREAM_NAMES = ['terrain', 'draft', 'draftpick'] as const;
export type OneShotStreamName = (typeof ONE_SHOT_STREAM_NAMES)[number];
export const TERRAIN_STREAM: OneShotStreamName = 'terrain';
export const DRAFT_STREAM: OneShotStreamName = 'draft';
export const DRAFT_PICK_STREAM: OneShotStreamName = 'draftpick';

/** FNV-1a 32-bit over a string; used to derive per-stream seeds. */
export function fnv1a(str: string, seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  /** Raw uint32. */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) | 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  /** [0,1) */
  float(): number {
    return this.next() / 4294967296;
  }

  /** [0,n) integer */
  int(n: number): number {
    if (n <= 1) return 0;
    return this.next() % n;
  }

  /** [min,max) float */
  range(min: number, max: number): number {
    return min + (max - min) * this.float();
  }

  /** [min,max] integer, inclusive */
  intRange(min: number, max: number): number {
    return min + this.int(max - min + 1);
  }

  chance(p: number): boolean {
    return this.float() < p;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[this.int(arr.length)];
  }

  /**
   * Weighted pick. Returns index. Weights must be >= 0 and sum > 0.
   *
   * A non-finite or non-positive weight (NaN, +/-Infinity, <= 0) is treated
   * as excluded from the draw rather than folded into `total`: summing a NaN
   * poisons every later `r < 0` comparison to `false` (NaN comparisons are
   * always false), which used to make the function fall through to
   * `weights.length - 1` on *every* call regardless of the RNG stream — a
   * silent, deterministic "always pick the last option" instead of the
   * intended random draw (b010).
   */
  weightedIndex(weights: readonly number[]): number {
    let total = 0;
    for (let i = 0; i < weights.length; i++) {
      const w = weights[i];
      if (Number.isFinite(w) && w > 0) total += w;
    }
    if (total <= 0) return 0;
    let r = this.float() * total;
    for (let i = 0; i < weights.length; i++) {
      const w = weights[i];
      if (!Number.isFinite(w) || w <= 0) continue;
      r -= w;
      if (r < 0) return i;
    }
    return weights.length - 1;
  }

  /** Fisher-Yates, in place. */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }

  /** Pick k distinct entries preserving relative order of the source. */
  sample<T>(arr: readonly T[], k: number): T[] {
    const idx = this.shuffle(arr.map((_, i) => i)).slice(0, Math.min(k, arr.length));
    idx.sort((a, b) => a - b);
    return idx.map((i) => arr[i]);
  }

  getState(): number {
    return this.s >>> 0;
  }

  setState(s: number): void {
    this.s = s >>> 0;
  }
}

/** The five named streams required by SPEC §9.2. */
export class RngSet {
  readonly seed: number;
  readonly waves: Rng;
  readonly spawns: Rng;
  readonly drops: Rng;
  readonly offers: Rng;
  readonly ai: Rng;

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.waves = new Rng(fnv1a('waves', this.seed));
    this.spawns = new Rng(fnv1a('spawns', this.seed));
    this.drops = new Rng(fnv1a('drops', this.seed));
    this.offers = new Rng(fnv1a('offers', this.seed));
    this.ai = new Rng(fnv1a('ai', this.seed));
  }

  getState(): Record<StreamName, number> {
    return {
      waves: this.waves.getState(),
      spawns: this.spawns.getState(),
      drops: this.drops.getState(),
      offers: this.offers.getState(),
      ai: this.ai.getState(),
    };
  }

  setState(s: Record<StreamName, number>): void {
    this.waves.setState(s.waves);
    this.spawns.setState(s.spawns);
    this.drops.setState(s.drops);
    this.offers.setState(s.offers);
    this.ai.setState(s.ai);
  }
}
