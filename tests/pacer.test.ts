/**
 * Fast-forward must buy the player time, not a different game: the pacer may
 * only ever change how many fixed ticks a frame runs.
 */

import { describe, expect, it } from 'vitest';

import { MAX_CATCHUP_TICKS, Pacer, SPEEDS } from '../src/ui/pacer';
import { FIXED_DT } from '../src/sim/types';
import { Run } from '../src/sim/run';
import { cfg, makeInputLog } from './helpers';

describe('Pacer', () => {
  it('starts at 1x and cycles through every declared speed before wrapping', () => {
    const p = new Pacer();
    expect(p.speed).toBe(1);
    expect(p.label).toBe('1x');
    const seen = [p.speed];
    for (let i = 1; i < SPEEDS.length; i++) seen.push(p.cycle());
    // fb035 added slower speeds below 1x, so 1x (the default) sits mid-array —
    // cycling visits every speed exactly once, in array order starting from
    // 1x and wrapping around, not `[...SPEEDS]` itself.
    const startIdx = SPEEDS.indexOf(1);
    expect(seen).toEqual([...SPEEDS.slice(startIdx), ...SPEEDS.slice(0, startIdx)]);
    // And wraps back round.
    expect(p.cycle()).toBe(1);
  });

  it('runs one tick per fixed step at 1x', () => {
    const p = new Pacer();
    expect(p.plan(FIXED_DT)).toBe(1);
    expect(p.plan(FIXED_DT * 3)).toBe(3);
  });

  it('runs proportionally more ticks per frame at higher speeds', () => {
    for (const speed of SPEEDS) {
      const p = new Pacer();
      while (p.speed !== speed) p.cycle();
      expect(p.plan(FIXED_DT * 4), `${speed}x`).toBe(4 * speed);
    }
  });

  it('banks the remainder rather than dropping it', () => {
    const p = new Pacer();
    expect(p.plan(FIXED_DT * 0.6)).toBe(0);
    expect(p.plan(FIXED_DT * 0.6)).toBe(1);
  });

  it('caps catch-up so a stalled frame cannot spiral', () => {
    const p = new Pacer();
    expect(p.plan(10)).toBe(MAX_CATCHUP_TICKS);
    // The dropped backlog must not reappear on the next frame.
    expect(p.plan(FIXED_DT)).toBe(1);
  });

  it('scales the cap with the speed, so 3x is allowed 3x the work', () => {
    const p = new Pacer();
    p.cycle();
    p.cycle();
    expect(p.speed).toBe(3);
    expect(p.plan(10)).toBe(MAX_CATCHUP_TICKS * 3);
  });

  it('scales the cap with the speed at every shipped speed, including sub-1x, 10x and 50x — fb010/fb035', () => {
    for (const speed of SPEEDS) {
      const p = new Pacer();
      while (p.speed !== speed) p.cycle();
      expect(p.plan(10), `${speed}x`).toBe(MAX_CATCHUP_TICKS * speed);
      // The dropped backlog must not reappear afterward, same as the 1x/3x
      // case above. At >=1x a single plain frame runs its usual whole-tick
      // count immediately; a sub-1x speed (fb035) cannot produce a fractional
      // tick from one frame, so it banks real time across `1 / speed` plain
      // frames and lands exactly one tick on the last of them, none before.
      if (speed >= 1) {
        expect(p.plan(FIXED_DT), `${speed}x carryover`).toBe(speed);
      } else {
        const framesPerTick = 1 / speed;
        for (let i = 1; i < framesPerTick; i++) {
          expect(p.plan(FIXED_DT), `${speed}x carryover frame ${i}`).toBe(0);
        }
        expect(p.plan(FIXED_DT), `${speed}x carryover final frame`).toBe(1);
      }
    }
  });

  it('a dropdown pick jumps straight to a declared speed — fb035', () => {
    const p = new Pacer();
    expect(p.setSpeed(0.25)).toBe(0.25);
    expect(p.speed).toBe(0.25);
    expect(p.setSpeed(50)).toBe(50);
    expect(p.speed).toBe(50);
    // An unknown value is ignored rather than corrupting the current speed.
    expect(p.setSpeed(7)).toBe(50);
    expect(p.speed).toBe(50);
  });

  it('reset returns to the 1x default, not index 0 — fb035 (SPEEDS no longer starts at 1)', () => {
    const p = new Pacer();
    p.setSpeed(50);
    p.plan(FIXED_DT);
    p.reset();
    expect(p.speed).toBe(1);
  });

  it('clearBacklog drops banked time, so resuming from pause does not surge', () => {
    const p = new Pacer();
    p.plan(FIXED_DT * 0.9);
    p.clearBacklog();
    expect(p.plan(FIXED_DT * 0.5)).toBe(0);
  });

  it('a run stepped in pacer-sized batches hashes the same as one stepped evenly', () => {
    const log = makeInputLog(7, 900);
    const even = new Run(cfg({ seed: 7 }));
    for (const input of log) even.step(input);

    // Same inputs, but delivered in the uneven batches a 3x frame produces.
    const fast = new Run(cfg({ seed: 7 }));
    const p = new Pacer();
    p.cycle();
    p.cycle();
    let i = 0;
    while (i < log.length) {
      // A jittery frame time, deterministic so the test is reproducible.
      const frame = FIXED_DT * (1 + ((i * 7) % 5)) * 0.5;
      const ticks = Math.min(p.plan(frame), log.length - i);
      for (let n = 0; n < ticks; n++) fast.step(log[i + n]);
      i += ticks;
      if (ticks === 0 && frame <= 0) break;
    }
    expect(i).toBe(log.length);
    expect(fast.hash()).toBe(even.hash());
  });

  it('the batching invariant holds across several seeds and every shipped speed — BACKLOG-QUALITY q19', () => {
    // gate-audit.ts's G2 note claimed "no test asserts a fast_forward run's end
    // hash against the same run at 1x" — stale the same way q17 found G17's own
    // note stale: the test above already existed (predates this lane, shipped
    // with the fast-forward feature itself) but only pinned one seed at 3x. This
    // widens it to every SPEEDS value and several seeds, per q19's acceptance
    // line, rather than trusting a single sample the way Q78/Q80 warn against.
    for (const seed of [1, 3, 11, 42, 99]) {
      const log = makeInputLog(seed, 900);
      const even = new Run(cfg({ seed }));
      for (const input of log) even.step(input);

      for (const speed of SPEEDS) {
        const fast = new Run(cfg({ seed }));
        const p = new Pacer();
        while (p.speed !== speed) p.cycle();
        let i = 0;
        while (i < log.length) {
          const frame = FIXED_DT * (1 + ((i * 7) % 5)) * 0.5;
          const ticks = Math.min(p.plan(frame), log.length - i);
          for (let n = 0; n < ticks; n++) fast.step(log[i + n]);
          i += ticks;
          if (ticks === 0 && frame <= 0) break;
        }
        expect(i, `seed ${seed} speed ${speed}`).toBe(log.length);
        expect(fast.hash(), `seed ${seed} speed ${speed}`).toBe(even.hash());
      }
    }
  });
});
