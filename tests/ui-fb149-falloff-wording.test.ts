/**
 * fb149 (qa-playtester finding during fb112 verification): a line or blast
 * sentence promised its damage number to "every enemy", but the engine cuts
 * every target past the first (a line) or past `aoeFullTargets` (a blast).
 *
 * The item names five sentences. Two of them — `burstDamageSentence` and
 * `frostNovaSentence` — turn out NOT to be affected, and CLAUDE.md's
 * measurement rules say to re-measure rather than inherit, so this file
 * measures each mechanism itself and the wording follows the measurement:
 *
 *   - `lineHit` scales after EVERY strike (`dash_line`, `charge_pierce`),
 *   - `applyAoE` grants `aoeFullTargets` at full damage and scales after
 *     (`charge_nova`, `judgement`),
 *   - `fireEffect` and `fireFrostNova` loop `enemiesInRadius` and call
 *     `damageEnemy` with no scale term at all (`burst_damage`, `frost_nova`),
 *     so hedging those two would have introduced an error rather than removed
 *     one. That is the control leg below, and it is what stops the wording
 *     rule from being applied by pattern-matching on the word "everything".
 *
 * The clauses are number-free on purpose: `pierceFalloff`/`aoeFullTargets`
 * live in `data/towers.json` and reach the sim through `w.content.towers`,
 * which a sentence function never sees — and the Hub renders the same
 * sentences with no run at all.
 */
import { describe, expect, it } from 'vitest';

import { tickClassCharge } from '../src/sim/classes';
import { updateAreas } from '../src/sim/combat';
import { applyCommand } from '../src/sim/run';
import { spawnEnemy } from '../src/sim/enemies';
import { World } from '../src/sim/world';
import { activeSkillMarkup } from '../src/ui/class-info';
import { AOE_FALLOFF_CLAUSE, LINE_FALLOFF_CLAUSE, PATCH_FALLOFF_CLAUSE } from '../src/ui/info-format';
import type { TickInput } from '../src/sim/types';
import { cfg } from './helpers';

function idle(over: Partial<TickInput> = {}): TickInput {
  return { mx: 0, my: 0, dash: false, attack: false, aimX: 0, aimY: 0, active1Held: false, cmds: [], ...over };
}

const FULL_HP = 1e7;

function pin(w: World, x: number, y: number) {
  const e = spawnEnemy(w, 'husk', x, y)!;
  e.hp = FULL_HP;
  e.maxHp = FULL_HP;
  e.speed = 0;
  e.armor = 0;
  e.radius = 0;
  return e;
}

/**
 * The damage each of `count` enemies takes, in the order the engine strikes
 * them: along a +X line for the line kinds, in rings of increasing distance
 * for the blast kinds (`applyAoE` sorts by distance once the list is longer
 * than `aoeFullTargets`).
 */
function damagePerTarget(
  classKey: string,
  which: 'class_active' | 'class_active2',
  place: (w: World) => ReturnType<typeof pin>[],
): number[] {
  const w = new World(cfg({ classKey }));
  w.warden.x = 6;
  w.warden.y = 10;
  const enemies = place(w);
  w.rebuildBuckets();
  applyCommand(w, { k: which, aimX: w.warden.x + 100, aimY: w.warden.y });
  return enemies.map((e) => FULL_HP - e.hp);
}

/** Enemies strung out along the +X line the dash/shot travels. */
const alongLine =
  (count: number, spacing = 0.9) =>
  (w: World) =>
    Array.from({ length: count }, (_, i) => pin(w, w.warden.x + 0.6 + i * spacing, w.warden.y));

/**
 * Enemies at increasing distance from the Warden, all inside the SMALLEST
 * radius any probe here uses — Circle Slash's immediate-release `minRadius` of
 * 1.5 — so a zero reading can only mean "not struck", never "out of range".
 */
const inRings =
  (count: number, step = 0.1) =>
  (w: World) =>
    Array.from({ length: count }, (_, i) => pin(w, w.warden.x + 0.3 + i * step, w.warden.y));

const content = new World(cfg()).content;
const markup = (classKey: string, which: 'active1' | 'active2') =>
  activeSkillMarkup(content.classByKey.get(classKey)!, which);

describe('fb149: the mechanism, measured before any wording is chosen', () => {
  it('a line decays from its SECOND target on — dash_line', () => {
    const dealt = damagePerTarget('swordsman', 'class_active2', alongLine(5));
    expect(dealt).toHaveLength(5);
    for (const d of dealt) expect(d).toBeGreaterThan(0);
    // Strictly decreasing from the first, which is what "every enemy for N"
    // could not say honestly.
    for (let i = 1; i < dealt.length; i++) expect(dealt[i]).toBeLessThan(dealt[i - 1]);
    // Derived from the tuning rather than hardcoded: a `pierceFalloff` retune
    // must not redden a wording test for a reason that has nothing to do with
    // the wording.
    const { pierceFalloff, pierceFalloffFloor } = content.towers;
    expect(dealt[4] / dealt[0]).toBeCloseTo(Math.max(pierceFalloffFloor, pierceFalloff ** 4), 6);
  });

  it('a line decays the same way for charge_pierce, once it pierces far enough', () => {
    // Archer's Draw pierces `1 + floor(secondsHeld)` targets, so an uncharged
    // release strikes one and could not show a falloff at all. Held to the cap
    // through the same `tickClassCharge` idiom `tests/class-area-stat.test.ts`
    // uses, then released.
    const cls = content.classByKey.get('archer')!;
    const w = new World(cfg({ classKey: 'archer' }));
    w.warden.x = 6;
    w.warden.y = 10;
    const enemies = alongLine(4)(w);
    w.rebuildBuckets();
    const aim = { aimX: w.warden.x + 20, aimY: w.warden.y };
    const cap = cls.active1.chargeCapSeconds ?? 3;
    tickClassCharge(w, cls, idle({ ...aim, active1Held: true }), cap * 2);
    tickClassCharge(w, cls, idle({ ...aim, active1Held: false }), 1 / 60);

    const struck = enemies.map((e) => FULL_HP - e.hp).filter((d) => d > 0);
    expect(struck.length).toBeGreaterThan(1);
    for (let i = 1; i < struck.length; i++) expect(struck[i]).toBeLessThan(struck[i - 1]);
  });

  it('a blast pays aoeFullTargets in full first, then decays — charge_nova', () => {
    const full = content.towers.aoeFullTargets;
    expect(full).toBeGreaterThan(1);
    // Circle Slash is a charge kind: a bare `class_active` Command arms the
    // charge rather than firing it, so this uses the same hold/release idiom
    // `tests/class-area-stat.test.ts` does. Released immediately, which fires
    // the `minRadius` nova every probe below sits inside.
    const cls = content.classByKey.get('swordsman')!;
    const w = new World(cfg({ classKey: 'swordsman' }));
    w.warden.x = 6;
    w.warden.y = 10;
    const enemies = inRings(full + 3)(w);
    w.rebuildBuckets();
    tickClassCharge(w, cls, idle({ active1Held: true }), 1 / 60);
    tickClassCharge(w, cls, idle({ active1Held: false }), 1 / 60);

    const dealt = enemies.map((e) => FULL_HP - e.hp);
    for (const d of dealt) expect(d).toBeGreaterThan(0);
    // The first `full` all take the same amount...
    for (let i = 1; i < full; i++) expect(dealt[i]).toBeCloseTo(dealt[0], 6);
    // ...and everything past them takes less than that.
    for (let i = full; i < dealt.length; i++) expect(dealt[i]).toBeLessThan(dealt[0]);
  });

  it('a blast decays the same way for judgement, once there is Wrath to release', () => {
    const full = content.towers.aoeFullTargets;
    const w = new World(cfg({ classKey: 'paladin' }));
    w.warden.x = 6;
    w.warden.y = 10;
    // `fireJudgement` returns early on zero stored Wrath, so there would be no
    // nova at all to measure.
    w.warden.wrathStored = 5000;
    const enemies = inRings(full + 3)(w);
    w.rebuildBuckets();
    applyCommand(w, { k: 'class_active2', aimX: w.warden.x + 100, aimY: w.warden.y });
    const dealt = enemies.map((e) => FULL_HP - e.hp);
    for (const d of dealt) expect(d).toBeGreaterThan(0);
    for (let i = 1; i < full; i++) expect(dealt[i]).toBeCloseTo(dealt[0], 6);
    for (let i = full; i < dealt.length; i++) expect(dealt[i]).toBeLessThan(dealt[0]);
  });

  it.each([
    // The aim matters. Poison Barrel drops ONE cloud at the aim point, so it
    // is aimed at the Warden's own feet. Flame Road lays five patches ALONG
    // its dash and is aimed perpendicular to the row of probes, which puts
    // every probe at the SAME distance rank in each patch that reaches it —
    // measured (qa-playtester correcting this comment's first draft), patches
    // 1 and 2 both cover every probe here, so a 1/60 s tick at 18 dps reads
    // 0.6 rather than 0.3. Both patches damp in the same distance order, which
    // is what makes the ordering assertion below about the falloff rather than
    // about the placement.
    ['plaguebringer', 'active1' as const, 0, 0],
    ['pyromancer', 'active2' as const, 0, 100],
  ])('a ground field decays on the blast curve too — %s %s', (classKey, which, aimDx, aimDy) => {
    // code-reviewer finding: `updateAreas` (`src/sim/combat.ts`) applies the
    // SAME `aoeFullTargets`/`aoeFalloff` damping `applyAoE` does, sorted by
    // distance from the patch centre — a third mechanism the item never
    // named and the first pass missed, on two more sentences in this file.
    const full = content.towers.aoeFullTargets;
    const cls = content.classByKey.get(classKey)!;
    const w = new World(cfg({ classKey }));
    w.warden.x = 6;
    w.warden.y = 10;
    const eff = which === 'active1' ? cls.active1 : cls.active2;
    // Clustered tight around the Warden so every probe is inside the FIRST
    // patch, which both kinds drop at the caster's own position.
    const enemies = Array.from({ length: full + 3 }, (_, i) => pin(w, w.warden.x + 0.2 + i * 0.08, w.warden.y));
    w.rebuildBuckets();
    applyCommand(w, {
      k: which === 'active1' ? 'class_active' : 'class_active2',
      aimX: w.warden.x + aimDx,
      aimY: w.warden.y + aimDy,
    });
    expect(w.areas.length).toBeGreaterThan(0);
    expect(eff.groundDurationSeconds ?? 3).toBeGreaterThan(1 / 60);
    // Exactly ONE tick, so each enemy is touched by the field once and the
    // reading is the scale itself rather than an accumulation. A `'burn'`
    // field damages directly while a `'poison'` field applies a DoT instead
    // (`updateAreas` -> `applyPoison`), so both are summed — each is linear in
    // the same `scale`, which is the only thing under test.
    updateAreas(w, 1 / 60);

    const dealt = enemies.map((e) => FULL_HP - e.hp + e.dots.reduce((n, d) => n + d.dps, 0));
    for (const d of dealt) expect(d).toBeGreaterThan(0);
    for (let i = 1; i < full; i++) expect(dealt[i]).toBeCloseTo(dealt[0], 4);
    for (let i = full; i < dealt.length; i++) expect(dealt[i]).toBeLessThan(dealt[0]);
  });

  it('burst_damage and frost_nova really do pay every target in full — the control', () => {
    // The leg that stops the wording rule being applied by pattern-matching:
    // `fireEffect` and `fireFrostNova` carry no scale term, so these two
    // sentences were already accurate and must not be hedged.
    for (const classKey of ['pyromancer', 'cryomancer']) {
      const dealt = damagePerTarget(classKey, 'class_active', inRings(content.towers.aoeFullTargets + 4));
      for (const d of dealt) expect(d).toBeGreaterThan(0);
      for (const d of dealt) expect(d).toBeCloseTo(dealt[0], 6);
    }
  });
});

describe('fb149: one wording rule, applied where and only where the engine decays', () => {
  const LINE_KINDS: ReadonlyArray<[string, 'active1' | 'active2', string]> = [
    ['swordsman', 'active2', 'dash_line'],
    ['archer', 'active1', 'charge_pierce'],
  ];
  const AOE_KINDS: ReadonlyArray<[string, 'active1' | 'active2', string]> = [
    ['swordsman', 'active1', 'charge_nova'],
    ['paladin', 'active2', 'judgement'],
    ['plaguebringer', 'active1', 'ground_poison'],
  ];
  const PATCH_KINDS: ReadonlyArray<[string, 'active1' | 'active2', string]> = [
    ['pyromancer', 'active2', 'dash_trail'],
  ];
  const FLAT_KINDS: ReadonlyArray<[string, 'active1' | 'active2', string]> = [
    ['pyromancer', 'active1', 'burst_damage'],
    ['cryomancer', 'active1', 'frost_nova'],
  ];

  it.each(LINE_KINDS)('%s %s (%s) names the line drop-off', (classKey, which) => {
    expect(markup(classKey, which)).toContain(LINE_FALLOFF_CLAUSE.trim());
  });

  it.each(AOE_KINDS)('%s %s (%s) names the blast drop-off', (classKey, which) => {
    expect(markup(classKey, which)).toContain(AOE_FALLOFF_CLAUSE.trim());
  });

  it.each(PATCH_KINDS)('%s %s (%s) scopes the drop-off to one patch, and says they stack', (classKey, which) => {
    expect(markup(classKey, which)).toContain(PATCH_FALLOFF_CLAUSE.trim());
    // The blast clause would be false here — see the aim-along-the-row leg.
    expect(markup(classKey, which)).not.toContain(AOE_FALLOFF_CLAUSE.trim());
  });

  it.each(FLAT_KINDS)('%s %s (%s) says nothing about a drop-off, because it has none', (classKey, which) => {
    const text = markup(classKey, which);
    expect(text).not.toContain('takes less');
    expect(text).toContain('to everything within');
  });

  it('every affected sentence still leads with its own damage number', () => {
    // The rule is "name the drop-off", not "stop giving a number" — a sentence
    // that dropped the figure would be less useful, not more honest.
    expect(markup('swordsman', 'active2')).toMatch(/for \d/);
    expect(markup('swordsman', 'active1')).toMatch(/dealing \d/);
    expect(markup('paladin', 'active2')).toMatch(/dealing \d/);
  });
});

/**
 * code-reviewer finding (f): this is the fifth sentence-accuracy defect in
 * `class-info.ts` (fb108, fb112, fb146, fb148, fb149), and the first pass at
 * this one missed two kinds because the affected set was reasoned about rather
 * than enumerated. The table below has to name EVERY `ClassEffect` kind that
 * ships, so a new kind fails here until someone classifies it — which is what
 * would have caught `ground_poison` and `dash_trail` on the first run.
 *
 * The stronger form the reviewer asked for — probe every kind and require the
 * clause IFF the measured per-target damages differ — needs a per-kind firing
 * harness (charges, stored Wrath, ground-field ticking, summon lifetimes) well
 * beyond this item; filed as fb157.
 */
describe('fb149: every shipped kind is classified, so a new one cannot slip through', () => {
  const DECAYS = new Set(['charge_nova', 'judgement', 'dash_line', 'charge_pierce', 'ground_poison', 'dash_trail']);
  const FLAT = new Set([
    'burst_damage',
    'frost_nova',
    'chain_lightning',
    'dash_volley',
    'time_lock',
    'dash_heal',
    'time_mark',
    'overload',
    'blood_tithe',
    'death_pact',
    'repair_heal',
    'ice_wall',
    'clarion_taunt',
    'recall_totem',
    'poison_boost',
    'raise_skeletons',
    'summon_turret',
    'manifest_spirit',
  ]);

  it('every Active1/Active2 kind in data/classes.json is in exactly one bucket', () => {
    const kinds = new Set<string>();
    for (const cls of content.classes.classes) {
      kinds.add(cls.active1.kind);
      kinds.add(cls.active2.kind);
    }
    expect(kinds.size).toBeGreaterThan(0);
    const unclassified = [...kinds].filter((k) => !DECAYS.has(k) && !FLAT.has(k));
    expect(unclassified).toEqual([]);
    // ...and neither bucket names a kind that no longer ships, which would
    // quietly excuse a real one from the check.
    expect([...DECAYS, ...FLAT].filter((k) => !kinds.has(k))).toEqual([]);
  });

  it('every kind in the decaying bucket has a falloff clause, and no flat kind does', () => {
    for (const cls of content.classes.classes) {
      for (const which of ['active1', 'active2'] as const) {
        const eff = which === 'active1' ? cls.active1 : cls.active2;
        const text = markup(cls.key, which);
        const hedged =
          text.includes(LINE_FALLOFF_CLAUSE.trim()) ||
          text.includes(AOE_FALLOFF_CLAUSE.trim()) ||
          text.includes(PATCH_FALLOFF_CLAUSE.trim());
        expect([cls.key, which, eff.kind, hedged]).toEqual([cls.key, which, eff.kind, DECAYS.has(eff.kind)]);
      }
    }
  });
});

describe('fb149: the clauses themselves, and the case that made one of them false', () => {
  it('Flame Road aimed ALONG a row is not a single blast, which is why it has its own clause', () => {
    // qa-playtester finding: with the dash running down the row of probes, the
    // enemy NEAREST the caster takes the LEAST and several take double the
    // printed per-patch number, because five 1-tile-radius patches 1.25 tiles
    // apart overlap. The blast clause ("the nearest few take full damage")
    // would be plainly false here; the patch clause is what the sentence says.
    const w = new World(cfg({ classKey: 'pyromancer' }));
    w.warden.x = 6;
    w.warden.y = 10;
    const enemies = Array.from({ length: 8 }, (_, i) => pin(w, w.warden.x + 0.2 + i * 0.08, w.warden.y));
    w.rebuildBuckets();
    applyCommand(w, { k: 'class_active2', aimX: w.warden.x + 100, aimY: w.warden.y });
    updateAreas(w, 1 / 60);
    const dealt = enemies.map((e) => FULL_HP - e.hp);

    // The nearest is NOT the best off, and the profile is not monotonic — the
    // two properties a single-blast clause would assert.
    expect(dealt[0]).toBeLessThan(Math.max(...dealt));
    expect(dealt.some((d, i) => i > 0 && d > dealt[i - 1])).toBe(true);
    // And overlap really does stack: someone takes more than one patch's worth.
    expect(Math.max(...dealt)).toBeGreaterThan(dealt[0] * 1.5);
  });

  it('each clause says what it claims to say, pinned to its own words', () => {
    // qa-playtester finding: every other assertion in this file compares the
    // rendered sentence against the same constant it was built from, so
    // replacing both constants with ' Bananas.' and ' Oranges.' left 195 tests
    // across eleven files green. This is the leg that reddens for that.
    for (const clause of [LINE_FALLOFF_CLAUSE, AOE_FALLOFF_CLAUSE, PATCH_FALLOFF_CLAUSE]) {
      // A leading space, so no call site can produce a double space by
      // appending it after its own terminal period.
      expect(clause.startsWith(' ')).toBe(true);
      expect(clause.trimEnd().endsWith('.')).toBe(true);
      expect(clause).toContain('full damage');
      expect(clause).toContain('takes less');
    }
    expect(LINE_FALLOFF_CLAUSE).toContain('first enemy struck');
    expect(LINE_FALLOFF_CLAUSE).toContain('each one behind it');
    expect(AOE_FALLOFF_CLAUSE).toContain('nearest few');
    expect(AOE_FALLOFF_CLAUSE).toContain('past that');
    expect(PATCH_FALLOFF_CLAUSE).toContain('Within each patch');
    expect(PATCH_FALLOFF_CLAUSE).toContain('overlapping patches stack');
    // ...and they are three distinct clauses, not one repeated.
    expect(new Set([LINE_FALLOFF_CLAUSE, AOE_FALLOFF_CLAUSE, PATCH_FALLOFF_CLAUSE]).size).toBe(3);
  });
});
