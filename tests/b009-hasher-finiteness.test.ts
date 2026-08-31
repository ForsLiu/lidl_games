/**
 * BACKLOG b009: `Hasher.int`'s `v | 0` collapsed NaN/+Infinity/-Infinity to
 * the same hash as 0, so the determinism hash (SPEC A11/G2) could not see
 * non-finite corruption — a replay of a NaN-poisoned run read as clean.
 * `Hasher.num` had a second, independent copy of the same bug: `q()` (the
 * quantizer `num` routes through) does its own `... | 0`, so a non-finite
 * value was already collapsed to 0 before `int()` ever saw it.
 */

import { describe, expect, it } from 'vitest';

import { Hasher } from '../src/sim/hash';
import { hashWorld } from '../src/sim/run';
import { World } from '../src/sim/world';
import { cfg } from './helpers';

describe('b009 — Hasher sees non-finite values (gate G2)', () => {
  it('int(NaN), int(Infinity) and int(0) all produce distinct hashes', () => {
    const nan = new Hasher().int(NaN).hex();
    const posInf = new Hasher().int(Infinity).hex();
    const negInf = new Hasher().int(-Infinity).hex();
    const zero = new Hasher().int(0).hex();
    const hashes = [nan, posInf, negInf, zero];
    expect(new Set(hashes).size).toBe(hashes.length);
  });

  it('num(NaN), num(Infinity) and num(0) all produce distinct hashes', () => {
    const nan = new Hasher().num(NaN).hex();
    const posInf = new Hasher().num(Infinity).hex();
    const negInf = new Hasher().num(-Infinity).hex();
    const zero = new Hasher().num(0).hex();
    const hashes = [nan, posInf, negInf, zero];
    expect(new Set(hashes).size).toBe(hashes.length);
  });

  it('a NaN-poisoned world hashes differently from a clean one via hashWorld', () => {
    const a = new World(cfg());
    const b = new World(cfg());
    a.coreHp = 0;
    b.coreHp = NaN;
    expect(hashWorld(a)).not.toBe(hashWorld(b));
  });

  it('an Infinity-poisoned world hashes differently from a clean one via hashWorld', () => {
    const a = new World(cfg());
    const b = new World(cfg());
    a.warden.hp = 0;
    b.warden.hp = Infinity;
    expect(hashWorld(a)).not.toBe(hashWorld(b));
  });

  it('finite values still hash by value, not just by tag (no collisions introduced)', () => {
    const one = new Hasher().int(1).hex();
    const two = new Hasher().int(2).hex();
    expect(one).not.toBe(two);
  });
});
