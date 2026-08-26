/**
 * SPEC-FINAL §6.2: towers stand inert but present during a VS wave — solid
 * obstacles that keep their HP and can be damaged, dealing no attack damage
 * of their own. Their only standing effect is the §5 "VS special" column,
 * authored per tower as `data/towers.json`'s `vsSpecial` field so this module
 * stays generic over which tower carries which special (m19a's `shredArmor`
 * lesson: a hardcoded tower key here is a special no new tower can reuse).
 *
 * Three of the six specials are periodic and character- or board-relative
 * rather than a reaction to a hit, so they live here rather than in
 * `vswield.ts` (character-scaled attacks) or `enemies.ts` (the death-reactive
 * Fire Brazier special, kept there to avoid a cycle — see its own doc
 * comment). Beacon Totem's haste and Harvest Sprout's gems already existed as
 * the `shrine`/`gem_bloom` terrain rows and already matched §5's numbers
 * exactly, so `weapons.ts`'s `updateTerrainEffects` still owns them — this
 * module does not re-author what was never wrong.
 *
 * None of the three specials here scale with character stats
 * (Power/Area/attack speed): SPEC-FINAL §6.1 reserves that scaling for
 * *wielded* attacks, and §6.2 is explicit that a tower's VS special is a
 * property of the tower standing there, not of the character. Flat authored
 * numbers throughout (Q98).
 */

import type { VsSpecial } from './content';
import { applyFrost } from './enemies';
import { lineHit } from './combat';
import { normalize } from './math';
import { wieldedAttacks } from './vswield';
import type { World } from './world';

const WIRE_HALF_WIDTH = 0.3;

export function updateVsSpecials(w: World, dt: number): void {
  updatePoisonTrail(w, dt);
  updateFrostAura(w, dt);
  updateElectricWireGrid(w, dt);
}

/** The one alive structure carrying `kind`, or null if none is built. */
function firstAlive(w: World, kind: VsSpecial['kind']): { towerId: number; towerKey: string } | null {
  for (const t of w.content.towers.towers) {
    if (t.vsSpecial.kind !== kind) continue;
    if (w.structures.some((s) => !s.dead && s.towerId === t.id)) return { towerId: t.id, towerKey: t.key };
  }
  return null;
}

/**
 * Venom Spore: "character leaves a poison trail every second dealing 0.1x
 * the tower's attack." Reuses the same `GroundArea('poison')` mechanism
 * other poison sources already spawn (`vswield.ts`, `towers.ts`), so the DoT
 * it lays down is ordinary poison — stacking, capped, shredded by the same
 * rules as everything else in §3.
 */
function updatePoisonTrail(w: World, dt: number): void {
  const found = firstAlive(w, 'poisonTrail');
  if (!found) return;
  const def = w.content.towerById.get(found.towerId)!;
  const special = def.vsSpecial;
  if (special.kind !== 'poisonTrail') return;
  w.vsPoisonTrailTimer -= dt;
  if (w.vsPoisonTrailTimer > 0) return;
  w.vsPoisonTrailTimer += special.interval;
  if (w.vsPoisonTrailTimer < 0) w.vsPoisonTrailTimer = 0;

  const wielded = wieldedAttacks(w).find((a) => a.towerId === found.towerId);
  if (!wielded) return;
  const wd = w.warden;
  w.areas.push({
    id: w.newId(),
    x: wd.x,
    y: wd.y,
    radius: special.radius,
    // `residualMul`: the drafted map modifier ("Petrified residuals -50%")
    // that scaled the V2 aura this special replaces still reaches it, same as
    // the shrine/bloom specials `weapons.ts` still owns (Q98).
    dps: wielded.damage * special.ratio * w.derived.residualMul,
    remaining: special.interval,
    type: 'poison',
    source: found.towerKey,
    acc: 0,
    dead: false,
  });
}

/**
 * Frost Obelisk: "an ice aura r2 follows the character, applying frost each
 * second." Recomputed live off the Warden's current position every tick the
 * timer fires — a `GroundArea` would freeze it at whatever tile it was
 * spawned on, which is not "follows".
 */
function updateFrostAura(w: World, dt: number): void {
  const found = firstAlive(w, 'frostAura');
  if (!found) return;
  const def = w.content.towerById.get(found.towerId)!;
  const special = def.vsSpecial;
  if (special.kind !== 'frostAura') return;
  w.vsFrostAuraTimer -= dt;
  if (w.vsFrostAuraTimer > 0) return;
  w.vsFrostAuraTimer += special.interval;
  if (w.vsFrostAuraTimer < 0) w.vsFrostAuraTimer = 0;

  const wd = w.warden;
  for (const e of w.enemiesInRadius(wd.x, wd.y, special.radius)) {
    if (e.dead) continue;
    applyFrost(w, e);
  }
}

/**
 * Tesla Coil: "all electric towers are wired to each other; enemies on any
 * wire take normal damage every 0.5s." Reuses `linkSpires`'s existing pairing
 * (`Structure.links`, computed once at the Sundering) rather than re-deriving
 * it — the pairing itself is unchanged from the V2 conversion table; only the
 * damage-dealing cadence is new (Q98: the pulse amount is chosen to match the
 * V2 residual's average throughput exactly, since §5 names the cadence but not
 * a magnitude, and CLAUDE.md's standing order is no balance tuning before P10).
 */
function updateElectricWireGrid(w: World, dt: number): void {
  let any = false;
  for (const s of w.structures) {
    if (s.dead || s.links.length === 0) continue;
    const def = w.content.towerById.get(s.towerId)!;
    if (def.vsSpecial.kind === 'electricWireGrid') {
      any = true;
      break;
    }
  }
  if (!any) return;

  w.vsWireGridTimer -= dt;
  if (w.vsWireGridTimer > 0) return;

  for (const s of w.structures) {
    if (s.dead || s.links.length === 0) continue;
    const def = w.content.towerById.get(s.towerId)!;
    if (def.vsSpecial.kind !== 'electricWireGrid') continue;
    const cx = s.tx + 0.5;
    const cy = s.ty + 0.5;
    for (const otherId of s.links) {
      if (otherId < s.id) continue; // each pair handled once
      const o = w.structureById.get(otherId);
      if (!o || o.dead) continue;
      const ox = o.tx + 0.5;
      const oy = o.ty + 0.5;
      const n = normalize(ox - cx, oy - cy);
      const len = Math.sqrt((ox - cx) ** 2 + (oy - cy) ** 2);
      // `residualMul`, same reason as the poison trail above.
      lineHit(w, cx, cy, n.x, n.y, len, WIRE_HALF_WIDTH, def.vsSpecial.damage * w.derived.residualMul, def.key, 999);
      w.emit('beam', cx, cy, ox, oy);
    }
  }

  w.vsWireGridTimer += electricInterval(w);
  if (w.vsWireGridTimer < 0) w.vsWireGridTimer = 0;
}

function electricInterval(w: World): number {
  for (const t of w.content.towers.towers) {
    if (t.vsSpecial.kind === 'electricWireGrid') return t.vsSpecial.interval;
  }
  return 0.5;
}
