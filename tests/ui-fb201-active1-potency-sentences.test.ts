/**
 * fb201 (BACKLOG-UI.md, extends fb062): every Active1 damage sentence in
 * `src/ui/class-info.ts` whose sim `fire*` handler (`src/sim/classes.ts`)
 * reads the §6.3 "Active1 potency" skill card (`active1PotencyMul`,
 * `src/sim/progression.ts`) now multiplies its printed figure by
 * `live.active1PotencyMul`, the same way `firePoisonBarrel`'s sentence
 * already did. `tests/class-active1-potency.test.ts`'s c021 is the sim-side
 * ground truth for exactly which `/data` field each class's card reaches —
 * this file is the UI-side counterpart: for each of those kinds, it casts
 * the real Active1 through the sim at potency rank 2, measures the actual
 * fired effect (a dummy's hp loss, a structure's hp gained, a summon's own
 * `dps`, an enemy's `tauntRemaining`/DoT stack), and checks
 * `activeSkillMarkup`'s rendered sentence names that same number — not a
 * recomputed formula, so a wiring slip (wrong field, missing factor, stale
 * `liveDamageValue` call) reddens this file even if the arithmetic elsewhere
 * agrees with itself.
 *
 * Two kinds are excluded, both already covered elsewhere:
 *  - `ground_poison` (Poison Barrel): fb062 wired it first;
 *    `tests/ui-fb063-bottombar-hover-sentences.test.ts` already pins it at
 *    potency rank 2.
 *  - `mind_manipulation` (Madness King): its elite/boss tick damage does read
 *    the card, but the sentence never prints a pre-cast number for it (see
 *    `mindManipulationSentence`'s own doc comment) — nothing here to regress.
 */
import { describe, expect, it } from 'vitest';

import { characterDamage, tickClassCharge, updateClassPassives, useClassActive } from '../src/sim/classes';
import { loadContent, type SkillCardDef } from '../src/sim/content';
import { spawnEnemy } from '../src/sim/enemies';
import { active1PotencyMul } from '../src/sim/progression';
import { buildTower, towerDamage } from '../src/sim/towers';
import { emptyInput, type Enemy, type TickInput } from '../src/sim/types';
import { World } from '../src/sim/world';
import { activeSkillMarkup, type ClassLiveContext } from '../src/ui/class-info';
import { classLiveContext } from '../src/ui/class-live';
import { formatPct, trimNum } from '../src/ui/info-format';
import { BUILD_TX, BUILD_TY, WX, WY } from './class-board';
import { cfg } from './helpers';

const content = loadContent();
const DT = 1 / 60;

function potencyCard(classKey: string): SkillCardDef {
  const card = (content.boons.skillCards[classKey] ?? []).find((c) => c.effect === 'active1_potency');
  if (!card) throw new Error(`${classKey}: no active1_potency card authored`);
  return card;
}

/** A world at the given potency rank for the class under test — rank 2 is the item's own acceptance criteria. */
function potencyWorld(classKey: string, rank: number): World {
  const w = new World(cfg({ classKey }), content);
  w.gold = 1e6;
  w.warden.attackCooldown = 1e9;
  w.warden.x = WX;
  w.warden.y = WY;
  w.skillCardRanks = rank > 0 ? { [potencyCard(classKey).key]: rank } : {};
  return w;
}

function firstEnemyKey(): string {
  const def = content.enemies.enemies[0];
  if (!def) throw new Error('expected at least one enemy definition');
  return def.key;
}

/** An immovable punching bag deep enough that no cast here can kill it. */
function dummy(w: World, x: number, y: number, hp = 1e7): Enemy {
  const e = spawnEnemy(w, firstEnemyKey(), x, y)!;
  e.hp = hp;
  e.maxHp = Math.max(hp, e.maxHp);
  e.speed = 0;
  e.armor = 0;
  w.rebuildBuckets();
  return e;
}

/** Holds a charge Active to full and releases it, at the real 60 Hz. */
function chargeAndRelease(w: World, aimX: number, aimY: number): void {
  const cls = w.content.classByKey.get(w.cfg.classKey)!;
  const cap = cls.active1.chargeCapSeconds ?? 3;
  const aim = { aimX, aimY };
  for (let t = 0; t < Math.ceil(cap * 60) + 1; t++) {
    tickClassCharge(w, cls, { ...emptyInput(), ...aim, active1Held: true } as TickInput, DT);
  }
  tickClassCharge(w, cls, { ...emptyInput(), ...aim, active1Held: false } as TickInput, DT);
}

/**
 * Fires a charge kind at exactly 0s held — `chargePierceSentence`'s own
 * scope (its doc comment: the live number is shown only for the release-now
 * case, since the compounding growth applies before `atkFlat`/`damageMul`).
 * A real held tick always adds at least `dt * chargeRate` (`tickClassCharge`),
 * so this sets the charging state directly rather than holding for one tick.
 */
function releaseNow(w: World, aimX: number, aimY: number): void {
  const cls = w.content.classByKey.get(w.cfg.classKey)!;
  w.warden.active1Charging = true;
  w.warden.active1Charge = 0;
  tickClassCharge(w, cls, { ...emptyInput(), aimX, aimY, active1Held: false } as TickInput, DT);
}

/** Fires Active1 once, aimed one tile east, through whichever path /data authors. */
function castActive1(w: World): void {
  const cls = w.content.classByKey.get(w.cfg.classKey)!;
  if (cls.active1.chargeCapSeconds !== undefined) chargeAndRelease(w, WX + 1, WY);
  else expect(useClassActive(w, WX + 1, WY), `${w.cfg.classKey}: the Active1 cast did not land`).toBe(true);
}

function damageDealt(w: World): number {
  const e = dummy(w, WX + 1, WY);
  const before = e.hp;
  castActive1(w);
  return before - e.hp;
}

/** The rendered Active1 sentence for this class/world, live-resolved. */
function sentence(w: World): string {
  const cls = w.content.classByKey.get(w.cfg.classKey)!;
  const live: ClassLiveContext = classLiveContext(w, cls);
  return activeSkillMarkup(cls, 'active1', live);
}

describe('fb201: an Active1 damage sentence multiplies by live.active1PotencyMul', () => {
  it('swordsman: Circle Slash — the full-charge release damage matches the actually-fired hit', () => {
    const w = potencyWorld('swordsman', 2);
    expect(active1PotencyMul(w)).toBeGreaterThan(1);
    const html = sentence(w);
    const dealt = damageDealt(w);
    expect(dealt).toBeGreaterThan(0);
    expect(html).toContain(`dealing ${trimNum(dealt)} damage`);
  });

  it('engineer: Field Kit — the printed heal % matches the structure\'s own hp gain / maxHp', () => {
    const w = potencyWorld('engineer', 2);
    expect(active1PotencyMul(w)).toBeGreaterThan(1);
    const res = buildTower(w, content.towerByKey.get('arrow_spire')!.id, BUILD_TX, BUILD_TY);
    expect(res.ok).toBe(true);
    const s = w.structureAt(BUILD_TX, BUILD_TY)!;
    s.hp = 1;
    const html = sentence(w);
    castActive1(w);
    expect(s.hp).toBeLessThan(s.maxHp);
    const fraction = (s.hp - 1) / s.maxHp;
    expect(html).toContain(`for ${formatPct(fraction)} of its max HP`);
  });

  it('pyromancer: Flame Burst — the AoE damage matches the actually-fired hit', () => {
    const w = potencyWorld('pyromancer', 2);
    expect(active1PotencyMul(w)).toBeGreaterThan(1);
    const html = sentence(w);
    const dealt = damageDealt(w);
    expect(dealt).toBeGreaterThan(0);
    expect(html).toContain(`Deals ${trimNum(dealt)} damage`);
  });

  it('archer: Deadeye Draw — the release-now (0s held) damage matches the actually-fired hit', () => {
    const w = potencyWorld('archer', 2);
    expect(active1PotencyMul(w)).toBeGreaterThan(1);
    const html = sentence(w);
    const e = dummy(w, WX + 1, WY);
    const before = e.hp;
    releaseNow(w, WX + 1, WY);
    const dealt = before - e.hp;
    expect(dealt).toBeGreaterThan(0);
    expect(html).toContain(`dealing ${trimNum(dealt)} damage if released immediately`);
  });

  it("necromancer: Raise's printed skeleton share matches the summoned skeleton's own dps / basicAttack.dps", () => {
    const w = potencyWorld('necromancer', 2);
    expect(active1PotencyMul(w)).toBeGreaterThan(1);
    const e = dummy(w, WX + 1, WY, 1);
    w.corpses.push({ id: w.newId(), x: e.x, y: e.y, remaining: 10 });
    const html = sentence(w);
    castActive1(w);
    const s = w.classSummons.find((k) => k.kind === 'necro_skeleton');
    expect(s).toBeDefined();
    const cls = w.content.classByKey.get('necromancer')!;
    // `fireRaiseSkeletons` (classes.ts): `dps: a.dps * share` off the RAW
    // `cls.basicAttack.dps` — not `characterDamage`-scaled.
    const fraction = s!.dps / cls.basicAttack.dps;
    expect(html).toContain(`(${formatPct(fraction)} of your basic attack)`);
  });

  it('cryomancer: Frost Nova — the AoE damage matches the actually-fired hit', () => {
    const w = potencyWorld('cryomancer', 2);
    expect(active1PotencyMul(w)).toBeGreaterThan(1);
    const html = sentence(w);
    const dealt = damageDealt(w);
    expect(dealt).toBeGreaterThan(0);
    expect(html).toContain(`Deals ${trimNum(dealt)} damage`);
  });

  it('stormcaller: Chain Surge — the first bolt damage matches the actually-fired hit', () => {
    const w = potencyWorld('stormcaller', 2);
    expect(active1PotencyMul(w)).toBeGreaterThan(1);
    const html = sentence(w);
    const dealt = damageDealt(w);
    expect(dealt).toBeGreaterThan(0);
    expect(html).toContain(`for ${trimNum(dealt)} damage, chaining`);
  });

  it("bloodlord: Blood Tithe — the printed damage-bonus % matches the tithed tower's own damage uplift over an untithed one", () => {
    const w = potencyWorld('bloodlord', 2);
    expect(active1PotencyMul(w)).toBeGreaterThan(1);
    const res = buildTower(w, content.towerByKey.get('arrow_spire')!.id, BUILD_TX, BUILD_TY);
    expect(res.ok).toBe(true);
    const s = w.structureAt(BUILD_TX, BUILD_TY)!;
    const html = sentence(w);
    // The untithed control, read off the same world before the cast tithes `s`.
    const untithedDmg = towerDamage(w, s, 100);
    castActive1(w);
    expect(s.tithed).toBe(true);
    const tithedDmg = towerDamage(w, s, 100);
    const impliedMul = tithedDmg / untithedDmg - 1;
    expect(impliedMul).toBeGreaterThan(0);
    expect(html).toContain(`for a permanent ${formatPct(impliedMul)} damage bonus`);
  });

  it("animist: Manifest's printed spirit share matches the ratio between a rank-2 and a rank-0 spirit's own dps", () => {
    const w2 = potencyWorld('animist', 2);
    expect(active1PotencyMul(w2)).toBeGreaterThan(1);
    const res2 = buildTower(w2, content.towerByKey.get('arrow_spire')!.id, BUILD_TX, BUILD_TY);
    expect(res2.ok).toBe(true);
    const html = sentence(w2);
    castActive1(w2);
    const s2 = w2.classSummons.find((k) => k.kind === 'animist_spirit');
    expect(s2).toBeDefined();

    const w0 = potencyWorld('animist', 0);
    const res0 = buildTower(w0, content.towerByKey.get('arrow_spire')!.id, BUILD_TX, BUILD_TY);
    expect(res0.ok).toBe(true);
    castActive1(w0);
    const s0 = w0.classSummons.find((k) => k.kind === 'animist_spirit');
    expect(s0).toBeDefined();

    const cls = w2.content.classByKey.get('animist')!;
    // `fireManifestSpirit` (classes.ts): `dps: p.dps * share` — `p.dps` cancels
    // between the two worlds (same tower, same maxLevel), so the ratio alone
    // is `active1PotencyMul(w2)`, and the printed share is `summonStatMul` at
    // that ratio.
    const share = (cls.active1.summonStatMul ?? 0) * (s2!.dps / s0!.dps);
    expect(html).toContain(`at ${formatPct(share)} of its damage at max upgrade`);
  });

  it("paladin: Clarion Taunt's printed taunt duration matches the enemy's own tauntRemaining after the cast", () => {
    const w = potencyWorld('paladin', 2);
    expect(active1PotencyMul(w)).toBeGreaterThan(1);
    const e = dummy(w, WX + 1, WY);
    const html = sentence(w);
    castActive1(w);
    expect(e.tauntRemaining).toBeGreaterThan(0);
    expect(html).toContain(`to target you for ${trimNum(e.tauntRemaining)}s`);
  });

  it("time_lord: Time's past- and present-stage DoT dps match the mark's actually-applied stacks", () => {
    const w = potencyWorld('time_lord', 2);
    expect(active1PotencyMul(w)).toBeGreaterThan(1);
    const e = dummy(w, WX + 1, WY);
    const html = sentence(w);
    castActive1(w);
    expect(e.timeMarkStage).toBe(1);
    const pastDot = e.dots.find((d) => d.dps > 0);
    expect(pastDot).toBeDefined();
    expect(html).toContain(`takes ${trimNum(pastDot!.dps)} damage/s`);

    // Advance to present — Time is ammo/recharge-gated, so wait for real recharge.
    let landed = false;
    for (let t = 0; t < 60 * 60 && !landed; t++) {
      landed = useClassActive(w, WX + 1, WY);
      if (!landed) updateClassPassives(w, DT);
    }
    expect(landed).toBe(true);
    expect(e.timeMarkStage).toBe(2);
    const addedPresentDps = e.dots.map((d) => d.dps).at(-1)!;
    expect(html).toContain(`takes ${trimNum(addedPresentDps)} damage/s`);
  });

  it('sanity: characterDamage/active1PotencyMul agree with liveActive1DamageValue\'s own formula, for a class already covered above', () => {
    const w = potencyWorld('cryomancer', 2);
    const cls = w.content.classByKey.get('cryomancer')!;
    const live = classLiveContext(w, cls);
    const formula = characterDamage(w, cls, cls.active1.damage) * (live.active1PotencyMul ?? 1);
    expect(sentence(w)).toContain(`Deals ${trimNum(formula)} damage`);
  });
});
