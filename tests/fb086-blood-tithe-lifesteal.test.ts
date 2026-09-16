/**
 * fb086 regression: SPEC-FINAL §4.2 Bloodlord *Blood Tithe* reads "tower pays
 * 30% current HP once -> permanently +25% dmg; **its share of VS attacks
 * lifesteals +1%**". Only the first half was ever wired — `s.tithed` fed
 * `classTowerDamageMul` (towers.ts) and nothing read it for the lifesteal
 * clause. `leech` (a run-wide Warden stat, Blood Frenzy) is a different
 * mechanism entirely and cannot stand in for a per-structure VS-share heal.
 *
 * This pins the missing half directly against the real attack path
 * (`updateTowers` -> `fireTower` -> `applyTitheLifesteal`, cores.ts): a
 * tithed tower's VS damage heals the Warden by `titheLifestealPct` of what it
 * deals, an untithed tower heals nothing, and the same tithed tower heals
 * nothing outside VS (TD, where `classTowerDamageMul`'s own bonus still
 * applies but the Warden is not even the thing being defended).
 */
import { describe, expect, it } from 'vitest';

import { loadContent, type Content } from '../src/sim/content';
import { spawnEnemy } from '../src/sim/enemies';
import { buildTower, updateTowers } from '../src/sim/towers';
import type { Enemy, Structure } from '../src/sim/types';
import { World } from '../src/sim/world';
import { BUILD_TX, BUILD_TY, WX, WY } from './class-board';
import { cfg } from './helpers';

const content: Content = loadContent();
const DT = 1 / 60;
const SPIRE = 'arrow_spire';

/** Built in the default (buildable) phase, so `buildTower`'s own phase rules never enter this test. */
function bloodlordWorld(): World {
  const w = new World(cfg({ classKey: 'bloodlord' }), content);
  w.gold = 1e6;
  w.warden.attackCooldown = 1e9;
  w.warden.x = WX;
  w.warden.y = WY;
  return w;
}

function place(w: World): Structure {
  const def = w.content.towerByKey.get(SPIRE)!;
  const r = buildTower(w, def.id, BUILD_TX, BUILD_TY);
  expect(r.ok, 'harness could not build the tower under test').toBe(true);
  return (r as { ok: true; structure: Structure }).structure;
}

/** A stationary, unarmoured punching bag deep enough that no volley here can kill it. */
function dummy(w: World): Enemy {
  const e = spawnEnemy(w, w.content.enemies.enemies[0].key, WX + 2, WY)!;
  e.hp = 1e7;
  e.maxHp = e.hp;
  e.speed = 0;
  e.armor = 0;
  w.rebuildBuckets();
  return e;
}

/** Fires exactly one forced volley from `s` and returns the raw damage it dealt. */
function fireOnce(w: World, s: Structure): number {
  const e = dummy(w);
  const before = e.hp;
  s.cooldown = 0;
  updateTowers(w, DT);
  return before - e.hp;
}

describe('fb086: Blood Tithe VS-share lifesteal', () => {
  it("heals the Warden by titheLifestealPct of a tithed tower's VS damage", () => {
    const w = bloodlordWorld();
    const s = place(w);
    w.phase = 'act2'; // huntsWarden
    s.tithed = true;
    w.warden.hp = 1; // headroom — otherwise the heal overheal-converts to gold instead of landing on hp
    const before = w.warden.hp;
    const dealt = fireOnce(w, s);
    expect(dealt).toBeGreaterThan(0);

    const cls = w.content.classByKey.get('bloodlord')!;
    const pct = cls.active1.titheLifestealPct ?? 0;
    expect(pct).toBeGreaterThan(0);
    expect(w.warden.hp - before).toBeCloseTo(dealt * pct, 6);
  });

  it('an untithed tower heals nothing, same VS attack', () => {
    const w = bloodlordWorld();
    const s = place(w);
    w.phase = 'act2';
    w.warden.hp = 1;
    expect(s.tithed).toBe(false);
    const before = w.warden.hp;
    const dealt = fireOnce(w, s);
    expect(dealt).toBeGreaterThan(0);
    expect(w.warden.hp).toBe(before);
  });

  it('a tithed tower outside VS (TD) heals nothing', () => {
    const w = bloodlordWorld();
    const s = place(w);
    s.tithed = true;
    expect(w.huntsWarden).toBe(false);
    w.warden.hp = 1;
    const before = w.warden.hp;
    const dealt = fireOnce(w, s);
    expect(dealt).toBeGreaterThan(0);
    expect(w.warden.hp).toBe(before);
  });
});
