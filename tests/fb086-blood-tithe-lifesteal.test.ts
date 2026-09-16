/**
 * BACKLOG fb086 — SPEC-FINAL §4.2 Bloodlord *Blood Tithe*: "tower pays 30%
 * current HP once -> permanently +25% dmg; **its share of VS attacks
 * lifesteals +1%**". Only the first half existed: `s.tithed` fed
 * `classTowerDamageMul` (`towers.ts`) and nothing else read it — `leech` is a
 * single run-wide Warden stat, with no per-structure VS-share lifesteal
 * concept authored anywhere (`tests/class-spec-numbers.test.ts`'s own
 * `unimplemented` row for this clause).
 *
 * Shipped as a new crossing-constant field, `active1.titheLifestealPct`
 * (`data/classes.json`, authored 0.01 = "+1%", same Lifesteal crossing-
 * constant shape as `leech`/`towerLifestealPct` — inverse-scaled by
 * `isInverseScaledClassPath`/`applyNumberScale`, content.ts), read at
 * `applyTowerLifesteal`'s existing choke point (`cores.ts`) — the same three
 * call sites (`towers.ts`'s synchronous kinds, `combat.ts`'s `pierce`/`lob`
 * async landing) that already credit Vampire Heart's structure-heal lifesteal
 * off the same `dealt` amount, so a tithed tower heals the Warden exactly
 * once per hit regardless of attack kind, independent of whether Vampire
 * Heart is even the selected Core.
 */

import { describe, expect, it } from 'vitest';

import { updateProjectiles } from '../src/sim/combat';
import { loadContent } from '../src/sim/content';
import { spawnEnemy } from '../src/sim/enemies';
import { buildTower, updateTowers } from '../src/sim/towers';
import { World } from '../src/sim/world';
import { cfg } from './helpers';

const DT = 1 / 60;
const content = loadContent();
const ARROW = content.towerByKey.get('arrow_spire')!;
const BALLISTA = content.towerByKey.get('ballista')!;
const BLOODLORD = content.classByKey.get('bloodlord')!;
const TITHE_PCT = BLOODLORD.active1.titheLifestealPct!;

function nearTile(w: World): { tx: number; ty: number } {
  for (let ty = 4; ty < 20; ty++) {
    for (let tx = 4; tx < 20; tx++) {
      if (w.grid.buildable(tx, ty) && !w.grid.wouldBlockPath([[tx, ty]])) return { tx, ty };
    }
  }
  throw new Error('no buildable tile');
}

function buildAt(w: World, tx: number, ty: number, towerId: number) {
  w.warden.x = tx + 0.5;
  w.warden.y = ty + 0.5;
  w.gold = 1e6;
  expect(buildTower(w, towerId, tx, ty).ok).toBe(true);
  return w.structureAt(tx, ty)!;
}

describe('fb086: Blood Tithe VS-share lifesteal — data lands at the authored figure', () => {
  it('is authored at the value the control below depends on', () => {
    expect(TITHE_PCT).toBeCloseTo(0.01 * (1 / content.modifiers.numberScale), 9);
  });
});

describe('fb086: a tithed tower heals the Warden for its own VS-phase damage', () => {
  it('VS phase, tithed tower: the Warden heals by titheLifestealPct of the damage dealt', () => {
    const w = new World(cfg({ classKey: 'bloodlord' }), content);
    const { tx, ty } = nearTile(w);
    const s = buildAt(w, tx, ty, ARROW.id);
    s.tithed = true;
    const e = spawnEnemy(w, 'husk', tx + 1.5, ty + 0.5)!;
    e.hp = 1e9;
    e.maxHp = 1e9;
    e.speed = 0;
    w.rebuildBuckets();
    s.cooldown = 0;
    w.phase = 'act2'; // VS: huntsWarden
    w.warden.hp = 1;

    updateTowers(w, DT);

    const dealt = w.damageByWeapon['arrow_spire'];
    expect(dealt).toBeGreaterThan(0);
    expect(w.warden.hp).toBeCloseTo(1 + dealt * TITHE_PCT, 9);
  });

  it('VS phase, untithed tower: no Warden heal', () => {
    const w = new World(cfg({ classKey: 'bloodlord' }), content);
    const { tx, ty } = nearTile(w);
    const s = buildAt(w, tx, ty, ARROW.id);
    expect(s.tithed).toBe(false);
    const e = spawnEnemy(w, 'husk', tx + 1.5, ty + 0.5)!;
    e.hp = 1e9;
    e.maxHp = 1e9;
    e.speed = 0;
    w.rebuildBuckets();
    s.cooldown = 0;
    w.phase = 'act2';
    w.warden.hp = 1;

    updateTowers(w, DT);

    expect(w.damageByWeapon['arrow_spire']).toBeGreaterThan(0);
    expect(w.warden.hp).toBe(1);
  });

  it('TD phase, tithed tower: no Warden heal (the clause is VS-only)', () => {
    const w = new World(cfg({ classKey: 'bloodlord' }), content);
    const { tx, ty } = nearTile(w);
    const s = buildAt(w, tx, ty, ARROW.id);
    s.tithed = true;
    const e = spawnEnemy(w, 'husk', tx + 1.5, ty + 0.5)!;
    e.hp = 1e9;
    e.maxHp = 1e9;
    e.speed = 0;
    w.rebuildBuckets();
    s.cooldown = 0;
    // w.phase stays 'act1_build' (huntsWarden === false)
    w.warden.hp = 1;

    updateTowers(w, DT);

    expect(w.damageByWeapon['arrow_spire']).toBeGreaterThan(0);
    expect(w.warden.hp).toBe(1);
  });

  it('VS phase, tithed tower, a different class selected: no Warden heal', () => {
    // `s.tithed` can in practice only ever be set true while playing
    // Bloodlord (only `fireBloodTithe` ever writes it) — this forces the
    // otherwise-unreachable case directly, pinning the defensive
    // `cls.active1.kind === 'blood_tithe'` check `classTowerDamageMul`
    // (towers.ts) already uses for the same flag.
    const w = new World(cfg({ classKey: 'swordsman' }), content);
    const { tx, ty } = nearTile(w);
    const s = buildAt(w, tx, ty, ARROW.id);
    s.tithed = true;
    const e = spawnEnemy(w, 'husk', tx + 1.5, ty + 0.5)!;
    e.hp = 1e9;
    e.maxHp = 1e9;
    e.speed = 0;
    w.rebuildBuckets();
    s.cooldown = 0;
    w.phase = 'act2';
    w.warden.hp = 1;

    updateTowers(w, DT);

    expect(w.damageByWeapon['arrow_spire']).toBeGreaterThan(0);
    expect(w.warden.hp).toBe(1);
  });

  // Regression: `pierce`/`lob`-kind towers credit `Structure.damageDealt`
  // asynchronously once their shot actually lands (`combat.ts`'s
  // `updateProjectiles`), not synchronously inside `fireTower` — the same
  // p5d split Vampire Heart's own lifesteal already has to handle
  // (`tests/p-core-b-effects.test.ts`'s "still lifesteals once its bolt
  // actually lands"). `applyTowerLifesteal` is called from both sites, so
  // this pins that the Warden-heal branch inherits it too.
  it('VS phase, tithed pierce-kind tower (Ballista): still heals the Warden once the bolt lands', () => {
    const w = new World(cfg({ classKey: 'bloodlord' }), content);
    const { tx, ty } = nearTile(w);
    const s = buildAt(w, tx, ty, BALLISTA.id);
    s.tithed = true;
    const e = spawnEnemy(w, 'husk', tx + 1.5, ty + 0.5)!;
    e.hp = 1e9;
    e.maxHp = 1e9;
    e.armor = 0;
    e.speed = 0;
    w.phase = 'act2';
    w.warden.hp = 1;

    for (let i = 0; i < 400 && s.damageDealt === 0; i++) {
      w.rebuildBuckets();
      updateTowers(w, DT);
      updateProjectiles(w, DT);
    }

    expect(s.damageDealt).toBeGreaterThan(0);
    expect(w.warden.hp).toBeCloseTo(1 + s.damageDealt * TITHE_PCT, 6);
  });
});
