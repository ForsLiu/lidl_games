/**
 * @vitest-environment jsdom
 *
 * fb115 (bug, c001 follow-up) + fb173 (bug, filed during fb148 QA): two
 * distinct filings against the exact same defect family — a class Active's
 * `radius`/`dashWidth` preview or sentence read the plain authored `/data`
 * number instead of the value the sim actually fires at.
 *
 * `tests/class-area-stat.test.ts` (c001) already proved the SIM side of this:
 * every self-centered Active's radius really does land at `authored *
 * w.derived.areaMul`. What was still missing, and what both items named, is
 * that the UI's renderer (`src/render/canvas.ts`'s `drawChargeIndicator`/
 * `drawSkillHoverRing`) and the in-run ability text (`src/ui/class-info.ts`'s
 * per-`kind` sentences, through the new `ClassLiveContext.areaMul`) never
 * read `areaMul` at all — so a player with any Area source (an item, a boon,
 * the Animist's own Wide Grove) saw a footprint/description that quietly
 * undersold the real one, worse the more Area they stacked.
 *
 * Both items are fixed by the SAME mechanism (`ClassLiveContext.areaMul` +
 * `AREA_SCALED_ACTIVE_KINDS`), so this one file carries both — the lane rule
 * allows two small `[bug]` items per iteration, and splitting a single fix
 * into two near-identical files would only invite the two halves to drift.
 */
import { describe, expect, it } from 'vitest';

import { tickClassCharge, useClassActive, useClassActive2 } from '../src/sim/classes';
import { loadContent } from '../src/sim/content';
import { spawnEnemy } from '../src/sim/enemies';
import type { TickInput } from '../src/sim/types';
import { World } from '../src/sim/world';
import { Renderer, type ViewState } from '../src/render/canvas';
import { defaultSettings } from '../src/ui/settings';
import { AREA_SCALED_ACTIVE_KINDS } from '../src/render/vfx-registry';
import { activeSkillMarkup, classAbilitiesMarkup } from '../src/ui/class-info';
import { classLiveContext } from '../src/ui/class-live';
import { trimNum } from '../src/ui/info-format';
import { cfg } from './helpers';

const content = loadContent();

/** +100% Area as its own `Stats` source, the same convention `class-area-stat.test.ts` uses. */
function areaWorld(classKey: string, area: number): World {
  const w = new World(cfg({ classKey }));
  w.warden.attackCooldown = 1e9;
  w.phase = 'act1_wave';
  if (area !== 0) {
    w.stats.addAll('test:area', { area });
    w.recomputeDerived();
  }
  return w;
}

function idle(over: Partial<TickInput> = {}): TickInput {
  return { mx: 0, my: 0, dash: false, attack: false, aimX: 0, aimY: 0, active1Held: false, cmds: [], ...over };
}

function lastFxRadius(w: World, k: string): number {
  for (let i = w.fx.length - 1; i >= 0; i--) {
    if (w.fx[i].k === k) return w.fx[i].a;
  }
  throw new Error(`no "${k}" event was emitted`);
}

// ---------------------------------------------------------------------------
// fb173: the sentence-level fix.
// ---------------------------------------------------------------------------

describe('fb173: every AREA_SCALED_ACTIVE_KINDS sentence prints authored * areaMul, not the bare authored number', () => {
  /**
   * One entry per `AREA_SCALED_ACTIVE_KINDS` member: how to fire it for real
   * (mirroring `class-area-stat.test.ts`'s own CASES, which already proves the
   * SIM lands here) and the fragment of the sentence the resolved radius
   * should appear in — `trimNum` renders it exactly as the UI would, so the
   * assertion cannot pass on a rounding coincidence.
   */
  const CASES: ReadonlyArray<{
    kind: string;
    classKey: string;
    which: 'active1' | 'active2';
    setup?: (w: World) => void;
    fire: (w: World, cls: ReturnType<typeof content.classByKey.get>) => void;
    template: (radius: number) => string;
  }> = [
    {
      kind: 'burst_damage',
      classKey: 'pyromancer',
      which: 'active1',
      fire: (w) => void useClassActive(w),
      template: (r) => `everything within ${trimNum(r)} tiles`,
    },
    {
      kind: 'ground_poison',
      classKey: 'plaguebringer',
      which: 'active1',
      fire: (w) => void useClassActive(w),
      template: (r) => `Drops a ${trimNum(r)}-tile poison cloud`,
    },
    {
      kind: 'frost_nova',
      classKey: 'cryomancer',
      which: 'active1',
      fire: (w) => void useClassActive(w),
      template: (r) => `everything within ${trimNum(r)} tiles`,
    },
    {
      kind: 'clarion_taunt',
      classKey: 'paladin',
      which: 'active1',
      fire: (w) => void useClassActive(w),
      template: (r) => `every enemy within ${trimNum(r)} tiles`,
    },
    {
      kind: 'judgement',
      classKey: 'paladin',
      which: 'active2',
      setup: (w) => {
        w.warden.wrathStored = 100;
      },
      fire: (w) => void useClassActive2(w),
      template: (r) => `holy nova within ${trimNum(r)} tiles`,
    },
    {
      kind: 'time_mark',
      classKey: 'time_lord',
      which: 'active1',
      setup: (w) => {
        // `fireTimeMark`'s emit (and the CASE's own fx observation) requires
        // catching something, but the sentence prints the radius unconditionally.
        const e = spawnEnemy(w, content.enemies.enemies[0].key, w.warden.x + 0.5, w.warden.y)!;
        e.hp = 1e6;
        e.maxHp = 1e6;
        e.speed = 0;
        w.rebuildBuckets();
      },
      fire: (w) => void useClassActive(w),
      template: (r) => `Pulses ${trimNum(r)} tiles`,
    },
    {
      kind: 'time_lock',
      classKey: 'time_lord',
      which: 'active2',
      fire: (w) => void useClassActive2(w, w.warden.x, w.warden.y),
      template: (r) => `every enemy within ${trimNum(r)} tiles`,
    },
    {
      kind: 'recall_totem',
      classKey: 'animist',
      which: 'active2',
      fire: (w) => void useClassActive2(w),
      template: (r) => `summons within ${trimNum(r)} tiles`,
    },
  ];

  for (const c of CASES) {
    // Baseline `areaMul` is not always exactly 1 with no test source (the
    // Animist's own Wide Grove tower passive authors the *global* `area`
    // stat, so an Animist run already carries +10% — the same caveat
    // `class-area-stat.test.ts` names for the identical reason). The claim is
    // always "authored x whatever areaMul the run really has", never a
    // hardcoded 1/2, matching that file's own convention.
    it(`${c.kind} (${c.classKey}): the sim-fired radius appears in the sentence at baseline Area`, () => {
      const w = areaWorld(c.classKey, 0);
      c.setup?.(w);
      const cls = content.classByKey.get(c.classKey)!;
      c.fire(w, cls);
      const fired = lastFxRadiusOrZoneOrAura(w, c.kind);
      const authored = c.which === 'active1' ? cls.active1.radius : cls.active2.radius;
      expect(fired).toBeCloseTo(authored * w.derived.areaMul, 10);
      const live = classLiveContext(w, cls);
      expect(activeSkillMarkup(cls, c.which, live)).toContain(c.template(fired));
    });

    it(`${c.kind} (${c.classKey}): +100% Area widens both the sim fire AND the sentence by the same factor`, () => {
      const w = areaWorld(c.classKey, 1);
      c.setup?.(w);
      const cls = content.classByKey.get(c.classKey)!;
      c.fire(w, cls);
      const fired = lastFxRadiusOrZoneOrAura(w, c.kind);
      const authored = c.which === 'active1' ? cls.active1.radius : cls.active2.radius;
      expect(fired).toBeCloseTo(authored * w.derived.areaMul, 10);
      const live = classLiveContext(w, cls);
      const sentence = activeSkillMarkup(cls, c.which, live);
      expect(sentence).toContain(c.template(fired));
      // The regression this item exists to catch: the bare authored number
      // (half the real one) must be gone, not merely absent from a lucky spot.
      if (trimNum(authored) !== trimNum(fired)) {
        expect(sentence).not.toContain(c.template(authored));
      }
    });
  }

  it('circle_nova (Swordsman, charge_nova): both the zero-charge minRadius and the full-charge radius scale', () => {
    const w = areaWorld('swordsman', 1);
    const cls = content.classByKey.get('swordsman')!;
    const cap = cls.active1.chargeCapSeconds ?? 3;
    tickClassCharge(w, cls, idle({ active1Held: true }), cap * 2);
    tickClassCharge(w, cls, idle({ active1Held: false }), 1 / 60);
    const fullRadius = lastFxRadius(w, 'class_active');
    expect(fullRadius).toBeCloseTo((cls.active1.radius ?? 0) * w.derived.areaMul, 10);

    const live = classLiveContext(w, cls);
    const sentence = activeSkillMarkup(cls, 'active1', live);
    const minRadius = (cls.active1.minRadius ?? 0) * w.derived.areaMul;
    expect(sentence).toContain(`within ${trimNum(minRadius)} tiles`);
    expect(sentence).toContain(`a ${trimNum(fullRadius)}-tile hit`);
  });

  /**
   * Every `dash_*` kind's authored `dashWidth` is a HALF-width
   * (fb108/fb112/fb146); its printed width is `2 * dashWidth * areaMul`.
   * `dashSlashSentence` phrases it as a hyphenated "N-tile-wide line";
   * `dashTrailSentence`/`dashHealSentence` phrase it as "(N tiles wide)" —
   * kept as two distinct templates rather than one, so a copy-paste that
   * silently swapped one sentence's wording for another's would still fail.
   */
  const DASH_WIDTH_CASES: ReadonlyArray<{ classKey: string; kind: string; template: (n: string) => string }> = [
    { classKey: 'swordsman', kind: 'dash_line', template: (n) => `${n}-tile-wide line` },
    { classKey: 'pyromancer', kind: 'dash_trail', template: (n) => `${n} tiles wide` },
    { classKey: 'bloodlord', kind: 'dash_heal', template: (n) => `${n} tiles wide` },
  ];

  for (const c of DASH_WIDTH_CASES) {
    it(`${c.kind} (${c.classKey}): the sentence's width is 2 * dashWidth * areaMul`, () => {
      // `tests/class-area-stat.test.ts`'s own CASES table already proves the
      // SIM half of this (Pyro Flame Road's `GroundArea.radius` lands at
      // `dashWidth * areaMul`, and `fireDashSlash`/`fireCrimsonRush`'s inline
      // line tests do the same for `dash_line`/`dash_heal`) — this checks only
      // that the sentence agrees, via an independently-written expression.
      const w = areaWorld(c.classKey, 1);
      const cls = content.classByKey.get(c.classKey)!;
      expect(cls.active2.kind).toBe(c.kind);
      const half = (cls.active2.dashWidth ?? 0) * w.derived.areaMul;
      const live = classLiveContext(w, cls);
      const sentence = activeSkillMarkup(cls, 'active2', live);
      expect(sentence).toContain(c.template(trimNum(2 * half)));
      // Half of the real value (the pre-areaMul fix) must not appear either.
      const bareHalf = cls.active2.dashWidth ?? 0;
      if (trimNum(bareHalf) !== trimNum(half)) {
        expect(sentence).not.toContain(c.template(trimNum(2 * bareHalf)));
      }
    });
  }

  it('the Hub Class screen (no run, no live context) still shows the plain authored numbers', () => {
    const swordsman = content.classByKey.get('swordsman')!;
    expect(classAbilitiesMarkup(swordsman)).toContain(`within ${trimNum(swordsman.active1.minRadius ?? 0)} tiles`);
    const pyromancer = content.classByKey.get('pyromancer')!;
    expect(classAbilitiesMarkup(pyromancer)).toContain(`everything within ${trimNum(pyromancer.active1.radius)} tiles`);
  });

  it('an UNSCALED kind (chain_lightning search radius, Stormcaller) is unaffected by Area in its sentence', () => {
    const w = areaWorld('stormcaller', 1);
    const cls = content.classByKey.get('stormcaller')!;
    expect(cls.active1.kind).toBe('chain_lightning');
    const live = classLiveContext(w, cls);
    expect(live.areaMul).toBeCloseTo(2, 10);
    expect(activeSkillMarkup(cls, 'active1', live)).toContain(
      `nearest enemy within ${trimNum(cls.active1.radius)} tiles`,
    );
  });

  it('a class with no dash/area-scaled active is unaffected, and no sentence divides by zero or prints NaN', () => {
    for (const cls of content.classes.classes) {
      const w = areaWorld(cls.key, 1);
      const live = classLiveContext(w, cls);
      const a1 = activeSkillMarkup(cls, 'active1', live);
      const a2 = activeSkillMarkup(cls, 'active2', live);
      expect(a1).not.toContain('NaN');
      expect(a1).not.toContain('Infinity');
      expect(a2).not.toContain('NaN');
      expect(a2).not.toContain('Infinity');
    }
  });
});

/** Reads back the radius `class-area-stat.test.ts`'s own CASES table reads for each kind, kept in one place so both this file and any future one can share it without drifting. */
function lastFxRadiusOrZoneOrAura(w: World, kind: string): number {
  switch (kind) {
    case 'ground_poison':
      return w.areas.find((a) => a.type === 'poison' && !a.dead)!.radius;
    case 'time_lock':
      return w.timeLockZone!.radius;
    case 'recall_totem':
      return w.classSummons.find((s) => s.isAura)!.auraRadius!;
    default:
      return lastFxRadius(w, kind === 'judgement' || kind === 'time_lock' || kind === 'recall_totem' ? 'class_active2' : 'class_active');
  }
}

// ---------------------------------------------------------------------------
// fb115: the render-level fix (canvas.ts).
// ---------------------------------------------------------------------------

function recordingCanvas(): { canvas: HTMLCanvasElement; arcs: { x: number; y: number; r: number }[] } {
  const arcs: { x: number; y: number; r: number }[] = [];
  const ctx = new Proxy(
    {
      arc(x: number, y: number, r: number) {
        arcs.push({ x, y, r });
      },
      moveTo() {},
      lineTo() {},
      fillRect() {},
      fillText() {},
      createLinearGradient: () => ({ addColorStop() {} }),
      createRadialGradient: () => ({ addColorStop() {} }),
      measureText: () => ({ width: 10 }),
    } as Record<string, unknown>,
    {
      get(target, prop) {
        if (prop in target) return target[prop as string];
        return () => undefined;
      },
      set() {
        return true;
      },
    },
  );
  const canvas = document.createElement('canvas');
  canvas.getContext = (() => ctx) as never;
  return { canvas, arcs };
}

function view(over: Partial<ViewState> = {}): ViewState {
  return {
    selectedTower: 0,
    cursorX: 0,
    cursorY: 0,
    shake: 0,
    showRanges: false,
    selection: null,
    settings: defaultSettings(),
    ...over,
  };
}

const TILE = 32; // matches src/render/canvas.ts's TILE constant

describe('fb115: AREA_SCALED_ACTIVE_KINDS names exactly the kinds classes.ts Area-scales', () => {
  it('is exactly the 9-member set this file\'s own classes.ts audit found', () => {
    expect(new Set(AREA_SCALED_ACTIVE_KINDS)).toEqual(
      new Set([
        'burst_damage',
        'charge_nova',
        'ground_poison',
        'frost_nova',
        'recall_totem',
        'clarion_taunt',
        'judgement',
        'time_mark',
        'time_lock',
      ]),
    );
  });

  it('deliberately excludes every kind whose radius field is a search/placement/unused reuse', () => {
    for (const unscaled of [
      'charge_pierce',
      'dash_line',
      'dash_volley',
      'repair_heal',
      'summon_turret',
      'ice_wall',
      'chain_lightning',
      'overload',
      'dash_trail',
      'raise_skeletons',
      'death_pact',
      'manifest_spirit',
      'blood_tithe',
      'dash_heal',
      'poison_boost',
    ]) {
      expect(AREA_SCALED_ACTIVE_KINDS.has(unscaled as never)).toBe(false);
    }
  });
});

describe('fb115: drawChargeIndicator scales the live charge_nova preview by areaMul', () => {
  it('the previewed arc radius equals the radius circle_nova actually fires at, full charge', () => {
    const w = areaWorld('swordsman', 1);
    const cls = content.classByKey.get('swordsman')!;
    const cap = cls.active1.chargeCapSeconds ?? 3;
    w.warden.active1Charging = true;
    w.warden.active1Charge = cap; // full charge, matches circleSlashValues' own clamp
    const { canvas, arcs } = recordingCanvas();
    new Renderer(canvas).draw(w, view());

    // The same real fire the sim would do at this exact charge — the CASE
    // `tests/class-area-stat.test.ts` already proves lands at authored * areaMul.
    const fired = (cls.active1.radius ?? 0) * w.derived.areaMul;
    const previewed = arcs.find((a) => Math.abs(a.x - w.warden.x * TILE) < 0.01 && Math.abs(a.y - w.warden.y * TILE) < 0.01 && a.r > TILE);
    expect(previewed, 'a charge-indicator arc must be drawn while charging').toBeDefined();
    expect(previewed!.r).toBeCloseTo(fired * TILE, TILE * 0.05);
  });

  it('at areaMul=1 the preview equals the bare authored radius (no false positive from the fix)', () => {
    const w = areaWorld('swordsman', 0);
    const cls = content.classByKey.get('swordsman')!;
    const cap = cls.active1.chargeCapSeconds ?? 3;
    w.warden.active1Charging = true;
    w.warden.active1Charge = cap;
    const { canvas, arcs } = recordingCanvas();
    new Renderer(canvas).draw(w, view());
    const previewed = arcs.find((a) => Math.abs(a.x - w.warden.x * TILE) < 0.01 && a.r > TILE);
    expect(previewed!.r).toBeCloseTo((cls.active1.radius ?? 0) * TILE, 1);
  });
});

describe('fb115: drawSkillHoverRing scales a scaled kind and leaves an unscaled kind alone', () => {
  it('Paladin Clarion Taunt (active1, scaled): the ring widens with Area', () => {
    const cls = content.classByKey.get('paladin')!;
    expect(AREA_SCALED_ACTIVE_KINDS.has(cls.active1.kind)).toBe(true);

    const plain = areaWorld('paladin', 0);
    const { canvas: c1, arcs: a1 } = recordingCanvas();
    new Renderer(c1).draw(plain, view({ hoveredSkill: 'active1' }));
    const ring1 = a1.find((a) => a.r > TILE)!;
    expect(ring1.r).toBeCloseTo((cls.active1.radius ?? 0) * TILE, 1);

    const boosted = areaWorld('paladin', 1);
    const { canvas: c2, arcs: a2 } = recordingCanvas();
    new Renderer(c2).draw(boosted, view({ hoveredSkill: 'active1' }));
    const ring2 = a2.find((a) => a.r > TILE)!;
    expect(ring2.r).toBeCloseTo((cls.active1.radius ?? 0) * boosted.derived.areaMul * TILE, 1);
    expect(ring2.r).toBeGreaterThan(ring1.r * 1.9);
  });

  it("Archer Deadeye Draw (active1, charge_pierce, UNSCALED): the ring does not widen with Area", () => {
    const cls = content.classByKey.get('archer')!;
    expect(AREA_SCALED_ACTIVE_KINDS.has(cls.active1.kind)).toBe(false);

    const plain = areaWorld('archer', 0);
    const { canvas: c1, arcs: a1 } = recordingCanvas();
    new Renderer(c1).draw(plain, view({ hoveredSkill: 'active1' }));
    const ring1 = a1.find((a) => a.r > TILE)!;

    const boosted = areaWorld('archer', 1);
    const { canvas: c2, arcs: a2 } = recordingCanvas();
    new Renderer(c2).draw(boosted, view({ hoveredSkill: 'active1' }));
    const ring2 = a2.find((a) => a.r > TILE)!;

    expect(ring1.r).toBeCloseTo((cls.active1.radius ?? 0) * TILE, 1);
    expect(ring2.r).toBeCloseTo(ring1.r, 1);
  });
});
