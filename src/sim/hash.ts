/**
 * End-state hashing for the determinism gate (SPEC A11).
 * Positions are quantized before hashing so that legitimate last-bit float
 * differences can never fork a replay, while any real divergence still shows.
 */

import { q } from './math';

export class Hasher {
  private h = 0x811c9dc5;

  int(v: number): this {
    // `v | 0` collapses NaN/+Infinity/-Infinity to 0, aliasing non-finite
    // corruption onto a legitimate zero. Fold a distinct tag byte for each
    // non-finite case so a replay of a corrupted run cannot hash clean.
    let tag = 0;
    if (!Number.isFinite(v)) tag = Number.isNaN(v) ? 1 : v > 0 ? 2 : 3;
    this.h ^= tag & 0xff;
    this.h = Math.imul(this.h, 0x01000193) >>> 0;
    let x = tag === 0 ? v | 0 : 0;
    for (let i = 0; i < 4; i++) {
      this.h ^= x & 0xff;
      this.h = Math.imul(this.h, 0x01000193) >>> 0;
      x >>>= 8;
    }
    return this;
  }

  num(v: number): this {
    // `q()` itself does `... | 0`, which would collapse a non-finite `v` to
    // 0 before `int()` ever sees it — bypass quantization for non-finite
    // values so `int()`'s tag can still catch them.
    return this.int(Number.isFinite(v) ? q(v) : v);
  }

  bool(v: boolean): this {
    return this.int(v ? 1 : 0);
  }

  str(v: string): this {
    for (let i = 0; i < v.length; i++) this.int(v.charCodeAt(i));
    return this.int(v.length);
  }

  get value(): number {
    return this.h >>> 0;
  }

  hex(): string {
    return (this.h >>> 0).toString(16).padStart(8, '0');
  }
}
