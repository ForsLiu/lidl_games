/**
 * End-state hashing for the determinism gate (SPEC A11).
 * Positions are quantized before hashing so that legitimate last-bit float
 * differences can never fork a replay, while any real divergence still shows.
 */


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
    if (!Number.isFinite(v)) return this.int(v);
    // p12c (qa-playtester): `int()` keeps 32 bits, so a quantized magnitude
    // past 2^31 wrapped and aliased onto a different, legitimate value —
    // `q(7_300_000) === q(3_105_696)`. Latent until p12c's roster-wide
    // `baseHpMul` put the final boss at 7.3M HP, at which point the boss at
    // full HP and at 42.5% HP hashed identically. Determinism was never at
    // risk (the wrap is deterministic); the hash's ability to *see* a
    // divergence was, which is exactly gate G2's job.
    const r = Math.round(v * 1024);
    const hi = Math.trunc(r / 0x1_0000_0000) | 0;
    this.int(r | 0);
    // Folded only when it carries information, so every value inside int32
    // range hashes bit-identically to before this fix — which is what keeps
    // terrain's pinned map hashes and every recorded end-state hash valid.
    return hi === 0 ? this : this.int(hi);
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
