/**
 * fb201 (BACKLOG-UI.md, filed from fb062's code review): every Active1
 * sentence whose sim fire path reads `active1PotencyMul` (`src/sim/
 * progression.ts`, the §6.3 "Active1 potency" skill card) now multiplies its
 * displayed figure by `live.active1PotencyMul` (`src/ui/class-info.ts`), not
 * just Poison Barrel's (fb062). Ten sentences are affected — see the CASES
 * table below, cross-checked against `tests/class-active1-potency.test.ts`'s
 * own per-class "what potency actually multiplies" table (c021), which is the
 * authority on which `/data` field each class's card reaches.
 *
 * Each case drives `classLiveContext` through a World with the class's own
 * `active1_potency` card at rank 2, fires the real Active1 through the same
 * `useClassActive`/charge-and-release path c021 uses, reads the observable
 * the card actually moves, and asserts the sentence's own printed figure
 * (`trimNum`/`formatPct`-formatted, matching `class-info.ts`'s own formatting)
 * equals that fired reading — not a re-derivation of the same formula, which
 * would pass even if the sim and the sentence agreed on the wrong number.
 */
import { describe, expect, it } from 'vitest';

import { tickClassCharge, useClassActive } from '../src/sim/classes';
import { loadContent, type SkillCardDef } from '../src/sim/content';
import { spawnEnemy } from '../src/sim/enemies';
import { buildTower } from '../src/sim/towers';
import { emptyInput, type Enemy, type Structure, type TickInput } from '../src/sim/types';
import { maxLevel, upgradeStatMul } from '../src/sim/upgrades';
import { World } from '../src/sim/world';
import { activeSkillMarkup } from '../src/ui/class-info';
import { classLiveContext } from '../src/ui/class-live';
import { formatPct, trimNum } from '../src/ui/info-format';
import { BUILD_TX, BUILD_TY, WX, WY } from './class-board';
import { cfg } from './helpers';

const content = loadContent();
const DT = 1 / 60;
const RANK = 2;

function potencyCard(classKey: string): SkillCardDef {
  const card = (content.boons.skillCards[classKey] ?? []).find((c) => c.effect === 'active1_potency');
  if (!card) throw new Error(`${classKey} has no active1_potency card`);
  return card;
}

function rankedWorld(classKey: string): World {
  const w = new World(cfg({ classKey }), content);
  w.gold = 1e6;
  w.warden.attackCooldown = 1e9;
  w.warden.x = WX;
  w.warden.y = WY;
  w.skillCardRanks = { [potencyCard(classKey).key]: RANK };
  return w;
}

function idle(over: Partial<TickInput> = {}): TickInput {
  return { ...emptyInput(), ...over };
}

function dummy(w: World, x: number, y: number, hp = 1e7): Enemy {
  const first = content.enemies.enemies[0];
  if (!first) throw new Error('expected at least one enemy definition');
  const e = spawnEnemy(w, first.key, x, y)!;
  e.hp = hp;
  e.maxHp = Math.max(hp, e.maxHp);
  e.speed = 0;
  e.armor = 0;
  w.rebuildBuckets();
  return e;
}

function tower(w: World): Structure {
  const res = buildTower(w, content.towerByKey.get('arrow_spire')!.id, BUILD_TX, BUILD_TY);
  expect(res.ok, 'harness could not place a tower on the shared build tile').toBe(true);
  return w.structureAt(BUILD_TX, BUILD_TY)!;
}

/** Holds a charge Active to full and releases it — Circle Slash / Deadeye Draw's firing path. */
function chargeAndRelease(w: World, aimX: number, aimY: number): void {
  const cls = w.content.classByKey.get(w.cfg.classKey)!;
  const cap = cls.active1.chargeCapSeconds ?? 3;
  const aim = { aimX, aimY };
  for (let t = 0; t < Math.ceil(cap * 60) + 1; t++) {
    tickClassCharge(w, cls, idle({ ...aim, active1Held: true }), DT);
  }
  tickClassCharge(w, cls, idle({ ...aim, active1Held: false }), DT);
}

function castActive1(w: World): void {
  const cls = w.content.classByKey.get(w.cfg.classKey)!;
  if (cls.active1.chargeCapSeconds !== undefined) chargeAndRelease(w, WX + 1, WY);
  else expect(useClassActive(w, WX + 1, WY), `${w.cfg.classKey}: the Active1 cast did not land`).toBe(true);
}

interface Case {
  classKey: string;
  /** The formatted substring the sentence must contain once fired, read off the sim itself. */
  expectedText: (w: World) => string;
}

const CASES: readonly Case[] = [
  {
    // charge_nova, full charge: `fireCircleSlash` multiplies its final damage
    // by `active1PotencyMul(w)` regardless of charge fraction (see
    // `circleSlashSentence`'s own comment) — so releasing at full charge and
    // reading the dummy's hp loss pins the *`damage`* (not `minDamage`) figure,
    // the sentence's "hold up to Ns ... dealing N damage" clause.
    classKey: 'swordsman',
    expectedText: (w) => {
      const e = dummy(w, WX + 1, WY);
      const before = e.hp;
      castActive1(w);
      return `dealing ${trimNum(before - e.hp)} damage and knocking`;
    },
  },
  {
    // charge_pierce: the sentence's one live figure is the *released-immediately*
    // (0s-held) case, not a full charge (`fireDeadeyeDraw`'s compounding grows
    // the raw base before potency and atkFlat are added — a full-charge reading
    // would not be the number this sentence shows at all).
    classKey: 'archer',
    expectedText: (w) => {
      const e = dummy(w, WX + 1, WY);
      const before = e.hp;
      const cls = w.content.classByKey.get('archer')!;
      // Enters the charging state at dt=0 (so zero charge accrues), then
      // releases — the exact 0s-held case `chargePierceSentence`'s comment
      // names as "the one number the sentence displays" (`liveDamageValue`
      // never re-derives the compounding at all).
      tickClassCharge(w, cls, idle({ aimX: WX + 1, aimY: WY, active1Held: true }), 0);
      tickClassCharge(w, cls, idle({ aimX: WX + 1, aimY: WY, active1Held: false }), DT);
      return `dealing ${trimNum(before - e.hp)} damage if released immediately`;
    },
  },
  {
    classKey: 'engineer',
    expectedText: (w) => {
      const s = tower(w);
      s.hp = 1;
      castActive1(w);
      const healedFraction = (s.hp - 1) / s.maxHp;
      return `for ${formatPct(healedFraction)} of its max HP`;
    },
  },
  {
    classKey: 'cryomancer',
    expectedText: (w) => {
      const e = dummy(w, WX + 1, WY);
      const before = e.hp;
      castActive1(w);
      return `Deals ${trimNum(before - e.hp)} damage`;
    },
  },
  {
    // fb201 (code review): `burst_damage`'s `fireEffect` (classes.ts) deals
    // `eff.damage * w.derived.powerMul * active1PotencyMul(w)` — a bare
    // multiply, no `atkFlat`/`damageMul` (fb108's still-valid finding), so
    // the fired hp loss is the sentence's raw-`powerMul`-scaled figure, not
    // a `characterDamage`-style one.
    classKey: 'pyromancer',
    expectedText: (w) => {
      const e = dummy(w, WX + 1, WY);
      const before = e.hp;
      castActive1(w);
      return `Deals ${trimNum(before - e.hp)} damage to everything within`;
    },
  },
  {
    classKey: 'stormcaller',
    expectedText: (w) => {
      const e = dummy(w, WX + 1, WY);
      const before = e.hp;
      castActive1(w);
      return `Bolts the nearest enemy within ${trimNum(w.content.classByKey.get('stormcaller')!.active1.radius)} tiles for ${trimNum(before - e.hp)} damage`;
    },
  },
  {
    // `fireRaiseSkeletons` (classes.ts) spawns each skeleton at `a.dps * share`
    // where `a = cls.basicAttack` — so the sentence's percentage is the
    // spawned skeleton's own `dps` divided back by that same basic-attack dps.
    classKey: 'necromancer',
    expectedText: (w) => {
      const e = dummy(w, WX + 1, WY, 1);
      w.corpses.push({ id: w.newId(), x: e.x, y: e.y, remaining: 10 });
      castActive1(w);
      const s = w.classSummons.find((k) => k.kind === 'necro_skeleton');
      expect(s, 'harness: Raise summoned no skeleton to read').toBeDefined();
      const share = s!.dps / w.content.classByKey.get('necromancer')!.basicAttack.dps;
      return `(${formatPct(share)} of your basic attack)`;
    },
  },
  {
    // `fireManifestSpirit` spawns the spirit at `p.dps * share` where `p` is
    // the cloned tower's own max-upgrade profile (`towerSummonProfile`,
    // module-private) — recomposed here from the two exported pieces it is
    // built from (`upgradeStatMul`/`maxLevel`), the same precedent
    // `class-live.ts`'s own `dashRangeMul` doc comment sets for recomposing a
    // module-private sim formula from its exported parts.
    classKey: 'animist',
    expectedText: (w) => {
      const s = tower(w);
      const def = w.content.towerById.get(s.towerId)!;
      castActive1(w);
      const spirit = w.classSummons.find((k) => k.kind === 'animist_spirit');
      expect(spirit, 'harness: Manifest summoned no spirit to read').toBeDefined();
      const pDps = (def.attack!.damage * upgradeStatMul(w, def, maxLevel(def))) / def.attack!.interval;
      const share = spirit!.dps / pDps;
      return `at ${formatPct(share)} of its damage`;
    },
  },
  {
    classKey: 'paladin',
    expectedText: (w) => {
      const e = dummy(w, WX + 1, WY);
      castActive1(w);
      expect(e.tauntRemaining, 'harness: Clarion Taunt taunted nobody').toBeGreaterThan(0);
      return `to target you for ${trimNum(e.tauntRemaining)}s`;
    },
  },
  {
    classKey: 'time_lord',
    expectedText: (w) => {
      const e = dummy(w, WX + 1, WY);
      castActive1(w);
      expect(e.timeMarkStage, 'harness: Time did not advance the mark to past').toBe(1);
      const dot = e.dots.find((d) => d.dps > 0);
      expect(dot, 'harness: the past-stage mark applied no DoT').toBeDefined();
      return `takes ${trimNum(dot!.dps)} damage/s`;
    },
  },
];

describe('fb201 — every Active1 sentence reads live.active1PotencyMul where the sim fire path does', () => {
  it('covers exactly the ten damage/magnitude sentences potency reaches beyond Poison Barrel', () => {
    expect(CASES.length).toBe(10);
  });

  for (const c of CASES) {
    const card = potencyCard(c.classKey);

    it(`${c.classKey} ${card.key} at rank ${RANK}: the sentence's own figure matches what firing Active1 actually produced`, () => {
      const w = rankedWorld(c.classKey);
      const cls = w.content.classByKey.get(c.classKey)!;
      const expectedFragment = c.expectedText(w);
      const live = classLiveContext(w, cls);
      expect(live.active1PotencyMul, `harness: rank ${RANK} did not raise active1PotencyMul above 1`).toBeGreaterThan(1);
      const markup = activeSkillMarkup(cls, 'active1', live);
      expect(markup, `${c.classKey}: sentence did not contain "${expectedFragment}"`).toContain(expectedFragment);
    });

    it(`${c.classKey} ${card.key} at rank 0: the sentence's figure is lower than at rank ${RANK} (the card actually moves it)`, () => {
      const zero = new World(cfg({ classKey: c.classKey }), content);
      zero.gold = 1e6;
      zero.warden.attackCooldown = 1e9;
      zero.warden.x = WX;
      zero.warden.y = WY;
      const cls = zero.content.classByKey.get(c.classKey)!;
      const zeroLive = classLiveContext(zero, cls);
      expect(zeroLive.active1PotencyMul ?? 1).toBe(1);
      const zeroMarkup = activeSkillMarkup(cls, 'active1', zeroLive);

      const ranked = rankedWorld(c.classKey);
      const rankedLive = classLiveContext(ranked, cls);
      const rankedMarkup = activeSkillMarkup(cls, 'active1', rankedLive);
      expect(rankedMarkup, `${c.classKey}: rank ${RANK}'s sentence did not differ from rank 0's`).not.toBe(zeroMarkup);
    });
  }
});
