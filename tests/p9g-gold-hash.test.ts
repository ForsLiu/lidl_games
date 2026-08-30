/**
 * BACKLOG p9g: `hashWorld` covered `w.gold` from the very first commit (M0),
 * but not `w.goldSpent` — the running lifetime-spend ledger a refund/cost bug
 * can diverge on even when the two replays' final balances happen to net out
 * identical. Two replays disagreeing only there would hash identically until
 * the difference later changed a build decision, which is exactly the class
 * of gap gate G2 exists to catch.
 */

import { describe, expect, it } from 'vitest';

import { hashWorld } from '../src/sim/run';
import { World } from '../src/sim/world';
import { cfg } from './helpers';

describe('p9g — w.goldSpent is covered by hashWorld (gate G2)', () => {
  it('a goldSpent difference changes the hash even when gold matches', () => {
    const a = new World(cfg());
    const b = new World(cfg());
    a.gold = 500;
    b.gold = 500;
    a.goldSpent = 100;
    b.goldSpent = 140;
    expect(hashWorld(a)).not.toBe(hashWorld(b));
  });

  it('a gold difference still changes the hash (pre-existing coverage)', () => {
    const a = new World(cfg());
    const b = new World(cfg());
    a.gold = 500;
    b.gold = 501;
    expect(hashWorld(a)).not.toBe(hashWorld(b));
  });
});
