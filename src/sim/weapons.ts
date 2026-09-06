/**
 * Petrified-terrain residuals (SPEC-FINAL §6.2): Palisade armor, Beacon
 * attack speed, and Harvest Sprout's gem drops — everything a petrified tower
 * still contributes from its own tile during Act II.
 */

import { dist2 } from './math';
import { BASE } from './stats';
import type { Structure } from './types';
import { World } from './world';

/* ---------------------------------------------------- petrified residuals */

/**
 * The passive half of the conversion table (SPEC 4.2): Palisade armour,
 * Beacon attack speed and everything the terrain itself does.
 */
export function applyTerrainPassives(w: World): void {
  let walls = 0;
  let beacons = 0;
  let wallArmorCap = 15;
  let beaconPer = 0.04;
  let beaconCap = 0.12;
  for (const s of w.structures) {
    if (s.dead) continue;
    const def = w.content.towerById.get(s.towerId)!;
    if (def.key === 'palisade') {
      walls++;
      wallArmorCap = def.terrain.armorCap ?? 15;
    } else if (def.passive) {
      beacons++;
      beaconPer = def.passive.attackSpeedPer;
      beaconCap = def.passive.cap;
    }
  }
  const armor = Math.min(wallArmorCap, walls) * w.derived.residualMul;
  const haste = Math.min(beaconCap, beacons * beaconPer) * w.derived.residualMul;
  // One source for all of the petrified terrain: a second Sundering adds more
  // ranks to it rather than opening a new multiplicative origin, which is both
  // V3 §2's "same source" reading and the behaviour this had before m19b.
  w.stats.add('terrain', 'armor', armor);
  w.stats.add('terrain', 'attackSpeed', haste);
  w.recomputeDerived();
}

/**
 * Terrain residuals are fixed once the Sundering has run, so the structures
 * that actually do something are cached rather than rescanned every tick.
 *
 * SPEC-FINAL §6.2 retired the rest of the V2 conversion table: a tower deals
 * no damage and applies no crowd control from its own tile in a VS wave — its
 * only standing effect is the §5 VS special, which is character-relative
 * (`src/sim/vsspecials.ts`, p2c) rather than tower-tile-relative. Beacon's
 * haste and Harvest Sprout's gems are the two specials that were already
 * tower-tile-relative and already matched §5's numbers, so they stay here
 * unchanged; the aura/slow/beam entries that dealt tower-sourced damage or CC
 * (Ember Brazier, Venom Spore, Frost Obelisk, Tesla Coil) are gone from this
 * file and re-authored as p2c's VS specials instead of double-paying
 * alongside them (Q97).
 */
export interface TerrainEffects {
  shrines: Structure[];
  blooms: Structure[];
}

export function buildTerrainEffects(w: World): TerrainEffects {
  const out: TerrainEffects = { shrines: [], blooms: [] };
  for (const s of w.structures) {
    if (s.dead || !s.petrified) continue;
    const t = w.content.towerById.get(s.towerId)!.terrain;
    if (t.wardenRadius && t.wardenAttackSpeed) out.shrines.push(s);
    if (t.gemInterval && t.gemValue) out.blooms.push(s);
  }
  return out;
}

/** Heartstone healing + shrine/spore-bloom residuals, ticked in Act II. */
export function updateTerrainEffects(w: World, dt: number): void {
  const wd = w.warden;
  const mul = w.derived.residualMul;
  w.shrineHaste = 0;

  const hsR = BASE.heartstoneRadius;
  if (w.sundered && dist2(wd.x, wd.y, w.heartstoneX, w.heartstoneY) <= hsR * hsR) {
    // fb153a (code review, Critical 1): `w.content.warden`, not the module-level
    // `BASE`. `numberScale` divides the authored heal, and `BASE` is the shared
    // pre-scale parse — reading it here left a 1 HP/s heal on a 10 HP pool.
    wd.hp = Math.min(w.derived.maxHp, wd.hp + w.content.warden.heartstoneHeal * dt);
  }

  const fx = w.terrainEffects ?? (w.terrainEffects = buildTerrainEffects(w));

  for (const s of fx.shrines) {
    if (s.dead) continue;
    const t = w.content.towerById.get(s.towerId)!.terrain;
    const r = t.wardenRadius!;
    if (dist2(wd.x, wd.y, s.tx + 0.5, s.ty + 0.5) <= r * r) w.shrineHaste += t.wardenAttackSpeed! * mul;
  }

  for (const s of fx.blooms) {
    if (s.dead) continue;
    const t = w.content.towerById.get(s.towerId)!.terrain;
    s.gemTimer -= dt;
    if (s.gemTimer <= 0 && s.gemsWaiting < (t.gemMax ?? 4)) {
      s.gemTimer = t.gemInterval!;
      s.gemsWaiting++;
      w.gems.push({
        id: w.newId(),
        x: s.tx + 0.5,
        y: s.ty + 0.5,
        value: Math.round(t.gemValue! * mul),
        vx: 0,
        vy: 0,
        life: w.content.spawns.gemLifetimeSeconds,
        dead: false,
      });
    }
  }
}
