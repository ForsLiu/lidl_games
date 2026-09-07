/**
 * Gate G2 coverage bug, found by qa-playtester during p12c's verification.
 *
 * `Hasher.num` quantizes to 1/1024 (`q`, `src/sim/math.ts`) and folds the
 * result through `int()`, which keeps **32 bits**. Any quantized magnitude
 * past ~2^31 therefore wrapped, so two genuinely different values could hash
 * identically — `q(7_300_000) === q(3_105_696)`, both `-1114734592`.
 *
 * Latent until p12c: the largest hashed number in the sim was the final
 * boss's HP at 365,000 (quantized 3.7e8, comfortably inside range). p12c's
 * roster-wide `baseHpMul: 20` puts it at 7,300,000 — quantized 7.5e9, past
 * 2^32 — so **at T1, for the first time, the boss at full HP and the boss at
 * 42.5% HP hash the same**. Determinism was never at risk (the wrap is
 * deterministic); what was at risk is exactly what G2 exists to catch, a
 * replay divergence the hash cannot see.
 *
 * The fix folds the high half only when it carries information, so every
 * value inside int32 range hashes bit-identically to before — which is what
 * keeps terrain's pinned map hashes and every recorded end-state hash valid.
 *
 * p12e note: the final boss no longer takes `baseHpMul` (it was double-
 * counting an already-fitted HP, QUESTIONS Q177/Q184), so 7,300,000 is no
 * longer a number the sim actually produces for it. The literal stays as a
 * representative past-int32 magnitude fixture — this file tests `Hasher.num`
 * in isolation, not the boss's current HP — rather than being re-derived from
 * content that could again drift under it.
 */
import { describe, expect, it } from 'vitest';

import { Hasher } from '../src/sim/hash';
import { q } from '../src/sim/math';

function hashOf(v: number): string {
  return new Hasher().num(v).hex();
}

describe('p12c — Hasher.num distinguishes magnitudes past int32', () => {
  it('the two values that collided before the fix now hash differently', () => {
    // The exact pair qa-playtester found: they differ by 2^32 after
    // quantization, which `| 0` discarded outright.
    expect(q(7_300_000)).toBe(q(3_105_696)); // the quantizer itself still wraps
    expect(hashOf(7_300_000)).not.toBe(hashOf(3_105_696)); // ...the hash no longer does
  });

  it('a representative past-int32 HP range is injective under the hash', () => {
    // p12c's pre-p12e shipped boss HP (365,000 x baseHpMul 20, no longer what
    // the boss actually spawns at — see file header) and the fractions of it
    // a real fight passes through. Kept as the magnitude fixture regardless.
    const full = 7_300_000;
    const seen = new Map<string, number>();
    for (const frac of [1, 0.9, 0.75, 0.5, 0.425, 0.25, 0.1, 0.01]) {
      const hp = full * frac;
      const h = hashOf(hp);
      expect(seen.has(h), `${hp} collides with ${seen.get(h)}`).toBe(false);
      seen.set(h, hp);
    }
  });

  it('values inside int32 range are unchanged, so existing hashes stay valid', () => {
    // The load-bearing half of the fix: the high word is folded only when
    // non-zero, so nothing that hashed before this change hashes differently.
    for (const v of [0, 1, -1, 0.5, -0.5, 1234.5678, -99999, 2_000_000, -2_000_000]) {
      expect(new Hasher().num(v).hex(), `${v}`).toBe(new Hasher().int(q(v)).hex());
    }
  });

  it('still tags non-finite values distinctly rather than collapsing them', () => {
    const distinct = new Set([hashOf(Number.NaN), hashOf(Infinity), hashOf(-Infinity), hashOf(0)]);
    expect(distinct.size).toBe(4);
  });
});
