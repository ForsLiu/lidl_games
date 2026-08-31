/**
 * q2 — input fuzz. QUALITY.md ALPHA: "10,000 random valid Commands per phase
 * produce no crash and no negative/NaN stat."
 *
 * Two halves, because the two things that can go wrong are different:
 *
 *  - `fuzzPhase` holds the world in one of the five `Phase` values and fires
 *    10,000 seeded commands at `applyCommand` directly. That is the one place a
 *    command handler's own guards are the only thing between a stale client and
 *    the world, and it covers phases a bot never visits. "Holds" is load-bearing:
 *    a command that ends the phase is fired, then the phase is re-entered, so
 *    all 10,000 land in the phase the case names.
 *  - `fuzzRun` plays whole runs with random commands riding along in the tick
 *    input, so anything a command corrupts has a full run of updates to surface
 *    in, and the end report is scanned field by field.
 *
 * The generator is seeded (`src/sim/rng`), so a failure here names a seed and a
 * command index that reproduce it exactly — the reproducibility cases below are
 * what make that claim true rather than hoped-for.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { loadContent } from '../src/sim/content';
import { COMMAND_KINDS, PHASES, describeFailure, fuzzPhase, fuzzRun, runInPhase } from '../tools/fuzz-input';
// The scanner itself lives in `tools/invariants.ts` (lane item q11); imported
// from there directly rather than through fuzz-input's re-export, since the
// case below tests the scanner, not the fuzzer.
import { scanWorld } from '../tools/invariants';
import { STAT_KEYS } from '../src/sim/stats';

/** The QUALITY.md number, per phase. */
const N = 10000;
const SEED = 1;

describe('q2 input fuzz', () => {
  for (const phase of PHASES) {
    it(`survives ${N} random valid Commands in ${phase}`, () => {
      const r = fuzzPhase(phase, SEED, N);
      expect(r.failure, describeFailure(r)).toBeNull();
      // `commands` counts only what was applied while the world stood in
      // `phase`. Asserting the full N is the acceptance criterion itself:
      // before the re-entry path existed, soulpick absorbed 2 of 10,000.
      expect(r.commands, `${phase}: ${r.reentries} re-entries`).toBe(N);
    });
  }

  it('routes every member of the Phase union', () => {
    // Read the union out of the sim rather than restating it here. A phase
    // added to `Phase` without a route in `ROUTE` would otherwise be a phase
    // this suite silently never fuzzes, and `npm test` never runs `tsc`, so
    // the exhaustive `Record<Phase, …>` alone would not catch it.
    const src = readFileSync(join(process.cwd(), 'src', 'sim', 'types.ts'), 'utf8');
    const union = /export type Phase =([^;]*);/.exec(src);
    expect(union, 'could not find the Phase union in src/sim/types.ts').not.toBeNull();
    const declared = [...(union as RegExpExecArray)[1].matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);
    expect(declared.length).toBeGreaterThan(0);
    expect([...PHASES].sort()).toEqual([...declared].sort());
  });

  it('generates every member of the Command union', () => {
    // The same guard as the phase one above, for the same reason: a 12th
    // Command member absent from `COMMAND_KINDS` would be a member this suite
    // silently never fires, at full green.
    const src = readFileSync(join(process.cwd(), 'src', 'sim', 'types.ts'), 'utf8');
    // Terminates on the first `;` that ends a line: the `;` separating fields
    // inside a member (`{ k: 'build'; tower: number }`) is always followed by a
    // space, never a newline. `\r?` because the checkout has CRLF endings.
    const union = /export type Command =([\s\S]*?);\r?\n/.exec(src);
    expect(union, 'could not find the Command union in src/sim/types.ts').not.toBeNull();
    const declared = [...(union as RegExpExecArray)[1].matchAll(/\bk:\s*'([a-z0-9_]+)'/g)].map((m) => m[1]);
    expect(declared.length).toBeGreaterThan(0);
    expect([...COMMAND_KINDS].sort()).toEqual([...declared].sort());
  });

  it('has an invariant scan that actually fires', () => {
    // The anti-vacuity case, and it is not hypothetical: the first cut of
    // `scanWorld` enumerated `w.stats` with `Object.entries`, which finds one
    // private Map and zero numbers, so that third of the scan could not report
    // anything while appearing to cover every stat. Each probe below poisons
    // one field and asserts the scan names it.
    const w = runInPhase('act2').world;
    expect(scanWorld(w), 'the baseline world should be clean').toEqual([]);

    const probes: { name: string; poison: () => void; undo: () => void }[] = [
      (() => {
        const before = w.gold;
        return { name: 'gold', poison: () => { w.gold = NaN; }, undo: () => { w.gold = before; } };
      })(),
      (() => {
        const before = w.wave;
        return { name: 'wave', poison: () => { w.wave = -3; }, undo: () => { w.wave = before; } };
      })(),
      (() => {
        const before = w.warden.activeCooldown;
        return {
          name: 'warden.activeCooldown',
          poison: () => { w.warden.activeCooldown = NaN; },
          undo: () => { w.warden.activeCooldown = before; },
        };
      })(),
      (() => {
        const before = w.derived.maxHp;
        return {
          name: 'derived.maxHp',
          poison: () => { w.derived.maxHp = -50; },
          undo: () => { w.derived.maxHp = before; },
        };
      })(),
      (() => {
        const before = w.derived.cdr;
        return {
          name: 'derived.cdr',
          poison: () => { w.derived.cdr = 1.4; },
          undo: () => { w.derived.cdr = before; },
        };
      })(),
      {
        name: 'boonRanks',
        poison: () => { w.boonRanks.__probe = -5; },
        undo: () => { delete w.boonRanks.__probe; },
      },
      // Port note (quality-lane merge): the `soulLevels` probe is gone with
      // the souls system itself (p3d) — there is no per-soul ledger to poison
      // any more. The successor per-source ledger a `pick` writes is
      // `boonRanks`, probed above.
      (() => {
        const before = w.pendingLevelUps;
        return {
          name: 'pendingLevelUps',
          poison: () => { w.pendingLevelUps = -3; },
          undo: () => { w.pendingLevelUps = before; },
        };
      })(),
      (() => {
        const before = w.buildTimer;
        return {
          name: 'buildTimer',
          poison: () => { w.buildTimer = NaN; },
          undo: () => { w.buildTimer = before; },
        };
      })(),
    ];

    for (const p of probes) {
      p.poison();
      const found = scanWorld(w);
      p.undo();
      expect(found.length, `scanWorld missed a poisoned ${p.name}`).toBeGreaterThan(0);
      expect(found.join(' | ')).toContain(p.name.split('.').pop() as string);
      expect(scanWorld(w), `probe ${p.name} did not clean up after itself`).toEqual([]);
    }

    // `stats` keeps its numbers behind accessors, which is what the original
    // bug was: enumerating `w.stats` directly finds one private Map and zero
    // numbers. This used to be proven by overflowing a stat past `total()`/
    // `factor()` with two `Number.MAX_VALUE` contributions and asserting the
    // scan named it. b022 closed that overflow at its source — `total()`/
    // `factor()` now guarantee a finite result by construction, dropping
    // whichever source's contribution would have pushed the running
    // sum/product non-finite — so that route can no longer produce a
    // non-finite stat for the scan to catch, on any input, including one
    // that reaches past `add()`'s own guards. Prove the accessor path
    // directly instead: spy on `total`/`factor` and confirm `scanWorld`
    // actually calls both for every stat key, rather than enumerating the
    // object.
    const totalSpy = vi.spyOn(w.stats, 'total');
    const factorSpy = vi.spyOn(w.stats, 'factor');
    scanWorld(w);
    const totalKeys = totalSpy.mock.calls.map((c) => c[0]).sort();
    const factorKeys = factorSpy.mock.calls.map((c) => c[0]).sort();
    totalSpy.mockRestore();
    factorSpy.mockRestore();
    expect(totalKeys, 'scanWorld does not read stats.total() for every stat key').toEqual([...STAT_KEYS].sort());
    expect(factorKeys, 'scanWorld does not read stats.factor() for every stat key').toEqual([...STAT_KEYS].sort());
  });

  it('survives whole runs with random commands in the tick input', () => {
    for (const seed of [1, 2, 3]) {
      const r = fuzzRun(seed, false);
      expect(r.problems, `seed ${seed}:\n  ${r.problems.join('\n  ')}`).toEqual([]);
      expect(r.commands).toBeGreaterThan(1000);
      expect(r.outcome).not.toBe('running');
      expect(r.endHash).not.toBe('');
      // The run was played, not skipped through: with practice off the dev
      // ops are no-ops, and the floor proves the run got through Act I's
      // first block into a real VS fight rather than folding instantly.
      // Re-measured at the quality-lane merge: command noise riding on the
      // bot's input gets the Warden killed in the first VS wave, so these
      // runs resolve `defeat_warden` around 8-11k ticks.
      expect(r.ticks, `seed ${seed} ended in ${r.ticks} ticks`).toBeGreaterThan(5000);
    }
  });

  it('survives whole runs with the practice tool live', () => {
    // The other half of the `dev` surface: with `practice: false` above,
    // `applyDevCommand` returns at its first line, so one command kind in
    // eleven is a guaranteed no-op. These runs are the ones that reach it.
    //
    // Port note (quality-lane merge): no termination assertion here any more.
    // Under SPEC-FINAL §1.1 the final VS wave is boss-kill-gated with no
    // timer, and a fuzzed `god`/`invuln` toggle makes both the Warden and the
    // Core unkillable — so a practice run legitimately rides the tick cap
    // still 'running'. What this case owns is that the dev surface is reached
    // and everything stays finite; the substance check is that the run got
    // deep enough to fuzz Act II at all — `r.visited` containing `'act2'`
    // already proves that directly, so `r.commands` is a secondary depth
    // floor, not the real check.
    //
    // fb002 (the Warden ignores collision with the Core and friendly
    // structures): `input.mx`/`input.my` here are pure per-tick noise, not a
    // bot's own kiting decision, so pre-fb002 that noise regularly walked the
    // Warden into the maze of towers its own Act I build had just made and
    // left it physically wedged there — an accidental side effect of the old
    // collision rule that also shielded it from part of the horde. fb002
    // removes that: seed 1 now legitimately wanders out into the open and
    // dies at tick 1008 (950 commands, `outcome: 'defeat_warden'`, zero
    // `problems`) instead of riding the tick cap. That is real, deterministic,
    // intended fallout of the feature, not a bug — the floor is lowered to
    // match the honestly measured number rather than nudged just enough to
    // pass. Re-measured this session: seed 1 = 950, seeds 2-3 still ride the
    // cap at ~161k commands each.
    for (const seed of [1, 2, 3]) {
      const r = fuzzRun(seed, true);
      expect(r.problems, `seed ${seed}:\n  ${r.problems.join('\n  ')}`).toEqual([]);
      expect(r.visited, `seed ${seed} visited ${r.visited.join(',')}`).toContain('act2');
      expect(r.commands).toBeGreaterThan(500);
    }
  });

  it('survives whole runs as every class in /data', () => {
    // `class_active` dispatches on the class's `active.kind`, so fuzzing one
    // class exercises one active. SPEC-FINAL §13 wants eleven classes; this
    // loops whatever `/data` currently has, so the coverage grows with them
    // instead of staying pinned to the engineer.
    const classes = loadContent().classes.classes.map((c) => c.key);
    expect(classes.length).toBeGreaterThan(0);
    for (const classKey of classes) {
      const r = fuzzRun(7, false, classKey);
      expect(r.problems, `${classKey}:\n  ${r.problems.join('\n  ')}`).toEqual([]);
      expect(r.outcome).not.toBe('running');
    }
  });

  it('is seed-reproducible', () => {
    // Same seed, same end state: the fuzz is a replayable input log, not noise.
    const a = fuzzRun(4, false);
    const b = fuzzRun(4, false);
    expect(b.endHash).toBe(a.endHash);
    expect(b.ticks).toBe(a.ticks);
    expect(b.commands).toBe(a.commands);
    expect(b.outcome).toBe(a.outcome);

    // ...and a different seed is actually a different run, so the equality
    // above is reproducibility rather than the generator ignoring its seed.
    const c = fuzzRun(5, false);
    expect(c.endHash).not.toBe(a.endHash);
  });

  it('is seed-reproducible per phase too', () => {
    // `describeFailure` promises a seed and a command index that reproduce a
    // failure; that promise is about `fuzzPhase`, so it gets its own case.
    // `ms` is wall-clock, so the comparison is field by field, not deep-equal.
    const a = fuzzPhase('act2', 9, 400);
    const b = fuzzPhase('act2', 9, 400);
    expect(b.commands).toBe(a.commands);
    expect(b.reentries).toBe(a.reentries);
    expect(b.visited).toEqual(a.visited);
    expect(b.failure).toEqual(a.failure);
  });
});
