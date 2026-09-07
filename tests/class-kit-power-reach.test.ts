/**
 * c032 — `kitPowerMul`'s reach across the kit, measured rather than assumed.
 *
 * BALANCE DIRECTION v2 §A / `p12a` shipped `kitPowerMul`
 * (`src/sim/enemies.ts:284-286`, `1 + 0.12 * w.wavesCleared`) as a compounding
 * multiplier on every "authored kit number" — `scalesWithKitPower`
 * (`enemies.ts:328-330`) applies it to any `damageEnemy` source starting with
 * `class_`, and deliberately withholds it from `spreading_plague`
 * (`enemies.ts:305-326`'s own comment: the plague transfer re-sends a pool
 * whose own contribution was already scaled, so scaling it again would
 * double-count). Nobody in this lane had checked that every one of
 * `classes.ts`'s damage call sites actually carries one of the five
 * recognised buckets, and nobody had measured the growth curve landing on a
 * live kit end to end rather than assuming `dotVaryingMul`'s plumbing does
 * the right thing.
 *
 * Two halves:
 *
 *  1. **A static sweep** (below, `describe('the source-string sweep ...')`)
 *     walks `classes.ts` once, left to right, tracking comment/string state
 *     as it goes, and collects every single-quoted string literal that could
 *     plausibly be a damage source (contains "class" or "plague",
 *     case-insensitively) *outside* a comment — then asserts the set found is
 *     exactly `{class_active, class_active2, class_passive, class_summon,
 *     class_basic}`. A typo'd or unprefixed source string added at any future
 *     call site (`damageEnemy`, `applyDot`, `applyAoE`, `lineHit`,
 *     `applyDamageType` all take one) shows up here without this file needing
 *     to know the call site exists. A single pass, not two sequential regex
 *     strips: code review found the sequential shape (block comments stripped
 *     first, then line comments) unsound — a `//` comment containing a
 *     literal `/*` fools the block-comment regex into swallowing real code
 *     after it, silently. The tokenizer below cannot have that ordering
 *     ambiguity, and a regression test pins the exact case review found.
 *
 *  2. **A live-fire scaling proof** (`describe('the growth curve, fired for
 *     real ...')`) exercises one real call site per bucket — a direct hit
 *     (`class_active`/`class_active2`), a DoT tick applied through
 *     `applyDot` and then actually ticked (`class_active`, Time Lord's Time),
 *     a passive proc (`class_passive`, Pyromancer's Contagious Flame), a
 *     summon attack (`class_summon`, a raised Necromancer skeleton) and the
 *     character's own basic attack (`class_basic`) — at `wavesCleared = 0`
 *     and again at `wavesCleared = 18`, and asserts the real hp lost scales
 *     by exactly `kitPowerMul(18)` (since `kitPowerMul(0) === 1`). Two more
 *     cases pin the deliberate exceptions named against being scaled at all:
 *     Spreading Plague's death-triggered transfer (`spreading_plague`) and
 *     Poison Boost's in-place doubling of an existing stack's `dps`
 *     (`firePoisonBoost`, classes.ts:499-507 — it never calls
 *     `damageEnemy`/`applyDot` itself, so the doubling has no `source` of its
 *     own; what is pinned is that the doubling is a flat `*2` and not
 *     `*2 * kitPowerMul(w)`). Both assert **identical**, not scaled, amounts
 *     at the two wave counts.
 *
 * No engine or `/data` change — this is the barrier `c001`/`c013`/`c024`'s
 * measurement rules ask for, sized to this lane's Scope (`classes.ts`,
 * read-only elsewhere).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  classBasicAttack,
  updateClassPassives,
  updateClassSummons,
  useClassActive,
  useClassActive2,
} from '../src/sim/classes';
import { loadContent, type Content } from '../src/sim/content';
import { applyDot, killEnemy, kitPowerMul, spawnEnemy, updateEnemies } from '../src/sim/enemies';
import type { Enemy } from '../src/sim/types';
import { World } from '../src/sim/world';
import { WX, WY } from './class-board';
import { cfg } from './helpers';

const content: Content = loadContent();

const DT = 1 / 60;

/** The five buckets `scalesWithKitPower`/`isKitSource` recognise, per `enemies.ts`. */
const KNOWN_SOURCES = ['class_active', 'class_active2', 'class_passive', 'class_summon', 'class_basic'];

/* ------------------------------------------------------- the source-string sweep */

describe('c032: the source-string sweep — every damage source classes.ts authors is a known bucket', () => {
  /**
   * A single left-to-right pass, not sequential regex strips. Code review
   * found the sequential shape unsound: stripping block comments first and
   * line comments second means a *line* comment containing a literal
   * slash-star fools the block-comment regex into swallowing everything up
   * to the next real block-comment close elsewhere in the file — silently
   * hiding a stray literal in that span (reproduced by review: an injected
   * `'class_sneaky_should_be_caught'` literal went uncaught when preceded by
   * such a comment). A tokenizer that tracks comment/string state as it walks
   * the file cannot have that ordering ambiguity, because there is no second
   * pass to fool.
   *
   * Returns every string literal's content that appears *outside* a `//` or
   * `/* *\/` comment, whichever of `'`/`"`/`` ` `` delimits it — QA on this
   * item found that returning single-quoted content only left the header's
   * "any future call site" claim false: a source string authored with a
   * template literal or double quotes would carry a candidate value through
   * this scan undetected. All three are collected here so the guarantee
   * holds regardless of quote style, even though this codebase's convention
   * (confirmed: no call site anywhere in `classes.ts` uses `"` or `` ` `` for
   * a damage source today) means only `'` ever fires live.
   */
  function stringLiteralsOutsideComments(src: string): string[] {
    const out: string[] = [];
    let i = 0;
    const n = src.length;
    while (i < n) {
      const c = src[i];
      const c2 = src[i + 1];
      if (c === '/' && c2 === '/') {
        i += 2;
        while (i < n && src[i] !== '\n') i++;
      } else if (c === '/' && c2 === '*') {
        i += 2;
        while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
        i += 2;
      } else if (c === "'" || c === '"' || c === '`') {
        const quote = c;
        let j = i + 1;
        let buf = '';
        while (j < n && src[j] !== quote) {
          if (src[j] === '\\') {
            buf += src[j] + (src[j + 1] ?? '');
            j += 2;
            continue;
          }
          buf += src[j];
          j++;
        }
        out.push(buf);
        i = j + 1;
      } else {
        i++;
      }
    }
    return out;
  }

  /**
   * Every string literal containing "class" or "plague" case-insensitively —
   * a superset of the five real sources, wide enough to catch a typo
   * (`'Class_Active'`, `'class-active'`, `'classActive'`) that a pattern
   * anchored on the correct shape would miss entirely.
   */
  function candidateSourceLiterals(src: string): string[] {
    return stringLiteralsOutsideComments(src).filter((s) => /class/i.test(s) || /plague/i.test(s));
  }

  const classesSrc = readFileSync(join(__dirname, '../src/sim/classes.ts'), 'utf8');

  it('the sweep finds real content — proof the tokenizer itself is not silently matching nothing', () => {
    const found = candidateSourceLiterals(classesSrc);
    expect(found.length, 'the candidate-literal scan found nothing at all — the scan itself is broken').toBeGreaterThan(0);
  });

  it('every class/plague-shaped string literal in classes.ts is exactly one of the five known buckets', () => {
    const found = new Set(candidateSourceLiterals(classesSrc));
    // `spreading_plague` itself is authored in enemies.ts, not classes.ts
    // (c032 keeps it that way — see the passive-liveness note below) — so it
    // is not expected here, only the five that are.
    expect([...found].sort()).toEqual([...KNOWN_SOURCES].sort());
  });

  it('a stray literal inside a real comment is correctly ignored, whatever the comment style', () => {
    const synthetic = [
      "const x = 1; // a real comment, not a block, mentioning 'class_should_be_ignored'",
      "/* a block comment naming 'class_also_ignored' */",
      "damageEnemy(w, e, 1, 'class_active', {});",
    ].join('\n');
    expect(candidateSourceLiterals(synthetic)).toEqual(['class_active']);
  });

  it("the exact gap code review found is fixed: a line comment containing a literal '/*' no longer swallows the code after it", () => {
    // The sequential strip this replaced read the `/*` inside the *line*
    // comment below as the start of a block comment, and swallowed
    // everything up to the next real `*/` — including the real call two
    // lines down — while never reporting the injected literal either. A
    // single-pass tokenizer cannot make that mistake: the `//` is consumed
    // as a line comment in one step, so the `/*` inside it is just text.
    const synthetic = [
      "// looks like a slash-star /* but isn't a block comment",
      "damageEnemy(w, e, 1, 'class_sneaky_should_be_caught', {});",
      "/* a real block comment */",
      "damageEnemy(w, e, 1, 'class_active', {});",
    ].join('\n');
    expect(candidateSourceLiterals(synthetic).sort()).toEqual(['class_active', 'class_sneaky_should_be_caught']);
  });

  it('a template-literal or double-quoted source string is caught too, not only single-quoted ones', () => {
    // QA on this item: the first draft returned single-quoted content only,
    // which left the header's "any future call site" claim false — a source
    // string authored with backticks or double quotes carried a candidate
    // value through the scan completely undetected (reproduced: appending a
    // `` `class_typo_should_have_been_caught` `` call left this file green).
    // This codebase's convention is single-quote-only for a damage source
    // (confirmed live above), but the scan no longer depends on that holding.
    const synthetic = [
      'damageEnemy(w, e, 1, `class_typo_should_have_been_caught`, {});',
      'damageEnemy(w, e, 1, "class_also_a_typo", {});',
    ].join('\n');
    expect(candidateSourceLiterals(synthetic).sort()).toEqual(['class_also_a_typo', 'class_typo_should_have_been_caught']);
  });

  it('classes.ts never authors the spreading_plague source itself — that stays enemies.ts-only', () => {
    // Spreading Plague's *passive* is declared in data/classes.json (in this
    // lane's Scope) but its death-triggered transfer fires from
    // `enemies.ts:killEnemy`/`drainPlagueTransfers` (out of Scope, read-only
    // here) — asserted so a future refactor that moved the transfer into
    // classes.ts would be a Scope event this item would notice.
    expect(stringLiteralsOutsideComments(classesSrc)).not.toContain('spreading_plague');
  });
});

/* -------------------------------------------------- the growth curve, fired for real */

function freshWorld(classKey: string, wavesCleared: number): World {
  const w = new World(cfg({ classKey }), content);
  w.gold = 1e6;
  w.warden.x = WX;
  w.warden.y = WY;
  // Suppressed by default (the p6b/c001/c005 convention) so the character's
  // own auto-basic-attack cannot land on a probe and contaminate the
  // hp-delta this file measures; the one case that measures the basic attack
  // itself re-enables it explicitly.
  w.warden.attackCooldown = 1e9;
  w.wavesCleared = wavesCleared;
  return w;
}

function dummy(w: World, x: number, y: number, hp = 1e6): Enemy {
  const e = spawnEnemy(w, content.enemies.enemies[0].key, x, y)!;
  e.hp = hp;
  e.maxHp = hp;
  e.speed = 0;
  e.armor = 0;
  w.rebuildBuckets();
  return e;
}

/** `kitPowerMul(18) / kitPowerMul(0)` — `kitPowerMul(0) === 1` exactly, so this is just `kitPowerMul(18)`. */
function expectedRatio(): number {
  const zero = new World(cfg({ classKey: 'swordsman' }), content);
  const eighteen = new World(cfg({ classKey: 'swordsman' }), content);
  zero.wavesCleared = 0;
  eighteen.wavesCleared = 18;
  return kitPowerMul(eighteen) / kitPowerMul(zero);
}

/** Runs `measure` on a fresh world at both wave counts and returns the hp-loss ratio. */
function ratioAcrossWaves(classKey: string, measure: (w: World) => number): number {
  const lowLoss = measure(freshWorld(classKey, 0));
  const highLoss = measure(freshWorld(classKey, 18));
  expect(lowLoss, 'harness: the wavesCleared=0 case dealt no damage at all').toBeGreaterThan(0);
  return highLoss / lowLoss;
}

describe('c032: the growth curve, fired for real — one live case per bucket', () => {
  it('kitPowerMul(18) is the ratio every case below is measured against, and it is not 1', () => {
    // Anti-vacuity: if this were ever 1 (the curve disabled or re-authored to
    // 0 growth), every ratio assertion below would trivially read "unchanged"
    // and stop proving anything.
    expect(expectedRatio()).toBeCloseTo(1 + 0.12 * 18, 9);
  });

  it('class_active — Pyromancer Immolation Wave (direct hit, burst_damage)', () => {
    const ratio = ratioAcrossWaves('pyromancer', (w) => {
      const e = dummy(w, WX + 1, WY);
      const before = e.hp;
      expect(useClassActive(w), 'harness: Immolation Wave did not fire').toBe(true);
      return before - e.hp;
    });
    expect(ratio).toBeCloseTo(expectedRatio(), 6);
  });

  it('class_active2 — Archer Quickstep (direct hit, dash_volley)', () => {
    const ratio = ratioAcrossWaves('archer', (w) => {
      const e = dummy(w, WX + 1, WY);
      const before = e.hp;
      expect(useClassActive2(w, WX + 3, WY), 'harness: Quickstep did not fire').toBe(true);
      return before - e.hp;
    });
    expect(ratio).toBeCloseTo(expectedRatio(), 6);
  });

  it('class_active via a DoT tick — Time Lord Time (applyDot does not pre-scale; the tick does)', () => {
    const ratio = ratioAcrossWaves('time_lord', (w) => {
      const e = dummy(w, WX + 1, WY);
      const before = e.hp;
      // Stage 0 (unmarked -> past): applies a 'bleeding' DoT via `applyDot`
      // with source 'class_active' (classes.ts advanceTimeMark). `applyDot`
      // itself stores the authored dps unscaled — the scaling this row
      // measures happens later, at tick time, inside `damageEnemy`.
      expect(useClassActive(w), 'harness: Time did not fire').toBe(true);
      expect(e.dots.some((d) => d.type === 'bleeding'), 'harness: Time applied no bleeding DoT').toBe(true);
      for (let t = 0; t < 60; t++) updateEnemies(w, DT);
      return before - e.hp;
    });
    expect(ratio).toBeCloseTo(expectedRatio(), 6);
  });

  it('class_passive — Pyromancer Contagious Flame (touch damage between two burning-adjacent enemies)', () => {
    const ratio = ratioAcrossWaves('pyromancer', (w) => {
      const carrier = dummy(w, WX + 1, WY);
      const victim = dummy(w, WX + 1.5, WY);
      applyDot(w, carrier, 'burning', 10, 5, 'test');
      const before = victim.hp;
      updateClassPassives(w, DT);
      return before - victim.hp;
    });
    expect(ratio).toBeCloseTo(expectedRatio(), 6);
  });

  it('class_summon — a raised Necromancer skeleton attacking a live target', () => {
    const ratio = ratioAcrossWaves('necromancer', (w) => {
      // c005's setup: a kill leaves a corpse (Grave Harvest), Raise consumes
      // it. The corpse (and so the skeleton) lands where the dummy died.
      killEnemy(w, dummy(w, WX + 1, WY), 'test');
      expect(w.corpses.length, 'harness left no corpse for Raise to consume').toBeGreaterThan(0);
      expect(useClassActive(w), 'harness: Raise did not fire').toBe(true);
      expect(w.classSummons.length, 'harness: Raise summoned no skeleton').toBeGreaterThan(0);
      for (const s of w.classSummons) s.attackCooldown = 0;
      const target = dummy(w, WX + 1, WY);
      const before = target.hp;
      updateClassSummons(w, DT);
      return before - target.hp;
    });
    expect(ratio).toBeCloseTo(expectedRatio(), 6);
  });

  it('class_basic — the character\'s own auto-attack', () => {
    const ratio = ratioAcrossWaves('swordsman', (w) => {
      w.warden.attackCooldown = 0; // re-enabled: this is the one case measuring it
      const cls = content.classByKey.get('swordsman')!;
      const e = dummy(w, WX + 1, WY);
      const before = e.hp;
      classBasicAttack(w, cls);
      expect(before - e.hp, 'harness: the basic attack did not fire').toBeGreaterThan(0);
      return before - e.hp;
    });
    expect(ratio).toBeCloseTo(expectedRatio(), 6);
  });

  it('spreading_plague is the deliberate exception — the transferred amount does NOT scale with waves cleared', () => {
    function transferAmount(w: World): number {
      const carrier = dummy(w, WX + 1, WY);
      const victim = dummy(w, WX + 2, WY);
      // An outstanding DoT of a known, fixed total: dps 10 over 5 s = 50,
      // unaffected by wavesCleared since it is never ticked before the kill.
      applyDot(w, carrier, 'poison', 10, 5, 'test');
      const before = victim.hp;
      killEnemy(w, carrier, 'test');
      return before - victim.hp;
    }
    const low = transferAmount(freshWorld('plaguebringer', 0));
    const high = transferAmount(freshWorld('plaguebringer', 18));
    expect(low, 'harness: the plague transfer dealt no damage at all').toBeGreaterThan(0);
    // Exact equality, not `toBeCloseTo` — `scalesWithKitPower` excludes this
    // source structurally (it does not start with 'class_'), so there is no
    // floating-point scaling step to introduce drift either way.
    expect(high, 'the plague transfer scaled with wavesCleared — it must not').toBe(low);
  });

  it("Poison Boost is the second deliberate exception — doubling an existing stack's dps does NOT itself scale with waves cleared", () => {
    // `firePoisonBoost` (classes.ts:499-507) never calls `damageEnemy`/
    // `applyDot` — it mutates `d.dps *= 2` on whatever poison stacks already
    // exist, in place. So it has no `source` argument of its own for
    // `scalesWithKitPower` to gate: the *tick* of the (now-doubled) stack
    // scales later, through whichever source originally applied it, exactly
    // as the Time Lord DoT-tick case above already proves for `class_active`.
    // What this row pins is the doubling step itself: `2x`, not
    // `2x * kitPowerMul(w)` — the failure mode a future refactor that routed
    // the doubling through a `damageEnemy` call could introduce.
    function doubledDps(wavesCleared: number): number {
      const w = freshWorld('plaguebringer', wavesCleared);
      const e = dummy(w, WX + 1, WY);
      applyDot(w, e, 'poison', 10, 5, 'test');
      expect(useClassActive2(w), 'harness: Poison Boost did not fire').toBe(true);
      const stack = e.dots.find((d) => d.type === 'poison');
      expect(stack, 'harness: the poison stack disappeared').toBeDefined();
      return stack!.dps;
    }
    const low = doubledDps(0);
    const high = doubledDps(18);
    expect(low, 'harness: Poison Boost did not double the stack at all').toBe(20);
    // Exact equality: doubling is a flat `*2` with no `kitPowerMul` term.
    expect(high, "Poison Boost's doubling scaled with wavesCleared — it must not").toBe(low);
  });
});
