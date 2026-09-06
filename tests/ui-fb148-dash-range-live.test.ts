/**
 * fb148 (qa-playtester finding during fb112 verification): Swordsman's Dash
 * Slash sentence printed `eff.dashRange` raw — the authored 5 — while the
 * sim's `fireDashSlash` (`src/sim/classes.ts`) dashes and slashes considerably
 * further. Two multipliers it never saw:
 *
 *   1. `dashDistance(currentMoveSpeed(w), duration)` with
 *      `duration = classDashDuration(eff.dashRange, classBaseMoveSpeed(cls))`
 *      — which reduces exactly to `dashRange * currentMoveSpeed / classBase`,
 *      so ANY move-speed source lengthens every class dash (fb053), and
 *   2. an explicit `* (hasEquipment(w, 'swordsman_shoes') ? 2 : 1)`, which
 *      `fireDashSlash` alone applies.
 *
 * The item was filed saying the real number is 10 with the Shoes on. Measured
 * here, it is **20**: `swordsman_shoes` carries `moveSpeedPct: 1`, so it
 * doubles the dash through (1) as well as through (2) — 5 -> 10 -> 20. The
 * filed 10 counted only the explicit doubling. Per CLAUDE.md's measurement
 * rules a deferred number is re-measured rather than inherited, so the fix
 * carries the whole multiplier and not just the half the item named; a
 * `dashRangeMul` that only knew about the Shoes would have replaced a 100%
 * error with a 50% one.
 *
 * The sim half is what stops the string assertions being a tautology: every
 * expected number below is binary-searched out of the live engine by asking
 * which enemies a real `class_active2` Command actually struck.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { applyCommand } from '../src/sim/run';
import { spawnEnemy } from '../src/sim/enemies';
import { World } from '../src/sim/world';
import { activeSkillMarkup, classAbilitiesMarkup } from '../src/ui/class-info';
import { classLiveContext } from '../src/ui/class-live';
import { trimNum } from '../src/ui/info-format';
import { cfg } from './helpers';

const FULL_HP = 1e6;

function worldWith(equipment: string[]): World {
  const w = new World(cfg({ classKey: 'swordsman', equipment }));
  w.warden.x = 4;
  w.warden.y = 12;
  return w;
}

/**
 * The furthest tile along a +X Dash Slash at which an enemy is still struck,
 * to 1e-11, by re-running the whole Command on a fresh world per probe — the
 * dash moves the Warden and spends the Active, so a single world cannot be
 * asked twice.
 *
 * The enemy is named (`husk`), immovable, effectively unkillable and
 * zero-radius: `lineHit` widens its corridor and its along-axis acceptance by
 * `e.radius`, so zeroing it makes the measured boundary the hit range itself.
 */
function furthestStruck(equipment: string[]): number {
  let lo = 0;
  // Bounded to the in-grid span (code-reviewer finding): probing past the
  // border would make the search depend on `spawnEnemy`'s clamping rather than
  // on the dash. 20 tiles is the widest real reach measured below.
  let hi = 30;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const w = worldWith(equipment);
    const e = spawnEnemy(w, 'husk', w.warden.x + mid, w.warden.y)!;
    e.hp = FULL_HP;
    e.maxHp = FULL_HP;
    e.speed = 0;
    e.armor = 0;
    e.radius = 0;
    w.rebuildBuckets();
    applyCommand(w, { k: 'class_active2', aimX: w.warden.x + 100, aimY: w.warden.y });
    if (e.hp < FULL_HP) lo = mid;
    else hi = mid;
  }
  return lo;
}

const content = new World(cfg()).content;
const swordsman = content.classByKey.get('swordsman')!;
const authored = swordsman.active2.dashRange ?? 0;

/** The number the in-run character panel / bottom-bar hover actually renders. */
function inRunSentence(equipment: string[]): string {
  const w = worldWith(equipment);
  return activeSkillMarkup(swordsman, 'active2', classLiveContext(w, swordsman));
}

describe('fb148: the in-run Dash Slash sentence reads the range the sim really dashes', () => {
  it('data/classes.json still authors swordsman.active2 as a dash_line with dashRange 5 (sanity, not vacuous)', () => {
    expect(swordsman.active2.kind).toBe('dash_line');
    expect(authored).toBe(5);
  });

  it('the engine dashes 5 unequipped, 20 with swordsman_shoes — not the 10 the item was filed with', () => {
    expect(furthestStruck([])).toBeCloseTo(5, 6);
    // 5 -> 10 through the Shoes' own `moveSpeedPct: 1` (every dash scales with
    // move speed, fb053), -> 20 through `fireDashSlash`'s explicit doubling.
    expect(furthestStruck(['swordsman_shoes'])).toBeCloseTo(20, 6);
    // A control that isolates multiplier (1) from (2): `normal_shoes` carries
    // `moveSpeedPct: 0.5` and no Swordsman effect, so it is 1.5x and nothing
    // more. If only the explicit doubling existed, this would read 5.
    expect(furthestStruck(['normal_shoes'])).toBeCloseTo(7.5, 6);
  });

  it.each([[[]], [['swordsman_shoes']], [['normal_shoes']]])(
    'the sentence prints the measured distance for equipment %j',
    (equipment: string[]) => {
      const measured = furthestStruck(equipment);
      expect(inRunSentence(equipment)).toContain(`Dash ${trimNum(measured)} tiles`);
    },
  );

  it('the pre-fix number is gone from the two equipped cases, so the assertion above is not satisfied by luck', () => {
    expect(inRunSentence(['swordsman_shoes'])).not.toContain(`Dash ${trimNum(authored)} tiles`);
    expect(inRunSentence(['normal_shoes'])).not.toContain(`Dash ${trimNum(authored)} tiles`);
    // ...and the half-fix the item asked for is not what shipped either.
    expect(inRunSentence(['swordsman_shoes'])).not.toContain(`Dash ${trimNum(2 * authored)} tiles`);
  });

  it('the Hub/class-select surface, which has no run to read, still shows the authored base', () => {
    // Legitimate per the item: that screen passes no live context at all, the
    // same way every other number on it is the plain /data value.
    expect(classAbilitiesMarkup(swordsman)).toContain(`Dash ${trimNum(authored)} tiles`);
    expect(activeSkillMarkup(swordsman, 'active2')).toContain(`Dash ${trimNum(authored)} tiles`);
  });

  it('classLiveContext reports the same multiplier the engine applies — the drift guard', () => {
    // The UI recomposes `currentMoveSpeed`/`classBaseMoveSpeed` (both private
    // to `src/sim/classes.ts`, which this lane may not edit) from exported
    // parts. This is what makes that recomposition loud if either side moves.
    // The three distinct move-speed configurations the equipment table can
    // produce for this slot: none, the +50% generic, the +100% Swordsman one.
    // (`swordsman_shoes` and `normal_shoes` share a slot and never combine,
    // and no other item carries `moveSpeedPct`.)
    for (const equipment of [[], ['swordsman_shoes'], ['normal_shoes']]) {
      const live = classLiveContext(worldWith(equipment), swordsman);
      // The two factors are carried separately on purpose: `dashRangeMul` is
      // the move-speed ratio every `dash_*` kind shares, while the Shoes'
      // explicit doubling is `fireDashSlash`'s alone. Recombined here exactly
      // as `dashSlashSentence` recombines them.
      const total = (live.dashRangeMul ?? 1) * (live.swordsmanShoes ? 2 : 1);
      expect(total).toBeCloseTo(furthestStruck(equipment) / authored, 9);
      expect(live.swordsmanShoes).toBe(equipment.includes('swordsman_shoes'));
    }
  });
});

/**
 * The four `dash_*` kinds and the class that authors each. The fix touches all
 * four sentences, so all four are measured — code-reviewer finding, and the
 * standard `tests/ui-fb146-dash-width-units-guard.test.ts` set for exactly
 * this defect family: reverting any ONE of the other three call sites to a raw
 * `eff.dashRange` left a Swordsman-only file green.
 */
const DASH_KINDS: ReadonlyArray<[string, string]> = [
  ['swordsman', 'dash_line'],
  ['pyromancer', 'dash_trail'],
  ['archer', 'dash_volley'],
  ['bloodlord', 'dash_heal'],
];

/**
 * How far the engine really moves the Warden for `classKey`'s Active2 — read
 * off `startDashTravel`'s own endpoint rather than off who got hit, so the one
 * measurement covers all four kinds (only `dash_line` has a hit line to
 * binary-search, and `dash_trail`/`dash_heal` express their reach as patches
 * and a heal count instead).
 */
function dashTravelDistance(classKey: string, equipment: string[]): number {
  const w = new World(cfg({ classKey, equipment }));
  w.warden.x = 4;
  w.warden.y = 12;
  applyCommand(w, { k: 'class_active2', aimX: w.warden.x + 100, aimY: w.warden.y });
  const tr = w.warden.dashTravel;
  if (!tr) return 0;
  return Math.hypot(tr.x1 - tr.x0, tr.y1 - tr.y0);
}

describe('fb148: every dash_* sentence, not just the one the item named', () => {
  it.each(DASH_KINDS)('%s authors %s (sanity, so the table below cannot go vacuous)', (classKey, kind) => {
    const eff = content.classByKey.get(classKey)!.active2;
    expect(eff.kind).toBe(kind);
    expect(eff.dashRange ?? 0).toBeGreaterThan(0);
  });

  it.each(DASH_KINDS)('%s (%s): the sentence prints the distance the engine really travels', (classKey) => {
    const cls = content.classByKey.get(classKey)!;
    for (const equipment of [[], ['normal_shoes'], ['swordsman_shoes']]) {
      const w = new World(cfg({ classKey, equipment }));
      const measured = dashTravelDistance(classKey, equipment);
      expect(activeSkillMarkup(cls, 'active2', classLiveContext(w, cls))).toContain(
        `Dash ${trimNum(measured)} tiles`,
      );
    }
  });

  it("the Shoes doubling is fireDashSlash's alone — every other kind gets the move-speed ratio only", () => {
    // The asymmetry the whole `dashRangeMul` + `swordsmanShoes` split rests on.
    // Stated per class against that class's own move-speed ratio rather than
    // across classes: `swordsman_shoes` does NOT move every class's speed by
    // the same factor — a non-owner class stacks the item's `mods` and its
    // `classFallback.mods` (Swordsman x2.0, Pyromancer x2.2), which is a real
    // `src/sim/stats.ts` bug logged for the main lane, not something this
    // sentence may paper over.
    const ratio = (classKey: string): number =>
      dashTravelDistance(classKey, ['swordsman_shoes']) / dashTravelDistance(classKey, []);
    const mul = (classKey: string): number => {
      const cls = content.classByKey.get(classKey)!;
      return classLiveContext(new World(cfg({ classKey, equipment: ['swordsman_shoes'] })), cls).dashRangeMul ?? 1;
    };

    // Swordsman: the move-speed ratio AND the explicit doubling.
    expect(ratio('swordsman')).toBeCloseTo(2 * mul('swordsman'), 9);
    for (const classKey of ['pyromancer', 'archer', 'bloodlord']) {
      // Everyone else: the move-speed ratio and nothing more, even though the
      // context truthfully reports the item as equipped.
      expect(ratio(classKey)).toBeCloseTo(mul(classKey), 9);
      const cls = content.classByKey.get(classKey)!;
      const live = classLiveContext(new World(cfg({ classKey, equipment: ['swordsman_shoes'] })), cls);
      expect(live.swordsmanShoes).toBe(true);
      expect(activeSkillMarkup(cls, 'active2', live)).toContain(
        `Dash ${trimNum(dashTravelDistance(classKey, ['swordsman_shoes']))} tiles`,
      );
    }
  });

  it('a class with no dash active is unaffected, and no sentence divides by zero', () => {
    for (const cls of content.classes.classes) {
      const w = new World(cfg({ classKey: cls.key }));
      const markup = activeSkillMarkup(cls, 'active2', classLiveContext(w, cls));
      expect(markup).not.toContain('NaN');
      expect(markup).not.toContain('Infinity');
    }
  });
});

describe('fb148: the source-level rule keeping dashRange live-resolved', () => {
  // The generalisation of fb146's `dashWidth` guard to the neighbouring field,
  // after a fourth "sentence number != sim number" defect in these same four
  // sentences (fb108, fb112, fb146, fb148). Same two-layer shape: a source
  // rule with its own proof cases, backed by the engine measurements above.
  const RAW_READ = /(?<![A-Za-z0-9_$.])eff\??\.?\[?['"]?dashRange/;

  function bareDashRangeReads(source: string): string[] {
    const out: string[] = [];
    source.split('\n').forEach((line, i) => {
      const trimmed = line.trimStart();
      if (trimmed.startsWith('*') || trimmed.startsWith('/*') || trimmed.startsWith('//')) return;
      const code = line.replace(/\/\*.*?\*\//g, '').split('//')[0];
      if (!RAW_READ.test(code)) return;
      // The one place the field may be read raw is inside `liveDashRange`,
      // which is what applies the multiplier.
      if (/function liveDashRange|\(eff\.dashRange \?\? 0\) \* \(live\?\.dashRangeMul/.test(code)) return;
      out.push(`${i + 1}: ${trimmed}`);
    });
    return out;
  }

  it('flags a sentence reading the field raw again — the proof case', () => {
    expect(bareDashRangeReads('return `Dash ${trimNum(eff.dashRange ?? 0)} tiles`;')).toHaveLength(1);
  });

  it('accepts the helper every sentence now goes through', () => {
    expect(bareDashRangeReads('return `Dash ${trimNum(liveDashRange(eff, live))} tiles`;')).toEqual([]);
  });

  it('src/ui/class-info.ts reads dashRange only inside liveDashRange', () => {
    const source = readFileSync(join(process.cwd(), 'src', 'ui', 'class-info.ts'), 'utf8');
    expect(source.includes('dashRange')).toBe(true);
    expect(bareDashRangeReads(source)).toEqual([]);
  });
});

describe('fb148: the generic field-list fallback resolves dashRange too', () => {
  it('a kind with no sentence gets the live number, not the authored one', () => {
    // qa-playtester finding: the `liveOverrides` branch shipped with no pin —
    // neutering it left every other case green, because `effectBlock`'s field
    // list is unreachable for every shipped kind since fb108's sentence table.
    // It is still where a fifth `dash_*` kind would land before anyone wrote
    // its sentence, which is exactly how fb108/fb112/fb146/fb148 each began.
    const swordsman = content.classByKey.get('swordsman')!;
    const w = new World(cfg({ classKey: 'swordsman', equipment: ['normal_shoes'] }));
    const live = classLiveContext(w, swordsman);
    const mul = live.dashRangeMul ?? 1;
    expect(mul).toBeGreaterThan(1);

    // A synthetic class whose Active2 kind has no `ACTIVE_SENTENCES` entry.
    const unsentenced = {
      ...swordsman,
      active2: { ...swordsman.active2, kind: 'no_such_kind_yet' },
    } as unknown as typeof swordsman;

    const markup = classAbilitiesMarkup(unsentenced, { live });
    expect(markup).toContain(trimNum((swordsman.active2.dashRange ?? 0) * mul));
    expect(markup).not.toContain(`>${trimNum(swordsman.active2.dashRange ?? 0)}<`);
  });
});
