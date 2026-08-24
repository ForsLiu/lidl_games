/**
 * End-state hashing for the determinism gate (SPEC A11).
 * Positions are quantized before hashing so that legitimate last-bit float
 * differences can never fork a replay, while any real divergence still shows.
 */

import { q } from './math';

export class Hasher {
  private h = 0x811c9dc5;

  int(v: number): this {
    let x = v | 0;
    for (let i = 0; i < 4; i++) {
      this.h ^= x & 0xff;
      this.h = Math.imul(this.h, 0x01000193) >>> 0;
      x >>>= 8;
    }
    return this;
  }

  num(v: number): this {
    return this.int(q(v));
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
