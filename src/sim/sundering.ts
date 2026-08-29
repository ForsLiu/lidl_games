/**
 * The Sundering (SPEC-FINAL §1.1/§6.2): the instant transition from a TD
 * block into its VS wave (petrification, spire linking) and back again
 * (`advanceToNextBlock`). p3d deleted the V2 Day/Dusk/Night/Dawn machine this
 * used to ride — no Dusk wait, no Heartstone-pocket/approach-lane detonation
 * (§6.2 keeps built towers "inert but present," not cleared — Q108), and no
 * Dawn Rekindle-or-Leave ledger: a tower simply un-petrifies for free the
 * moment its block's VS wave ends.
 */

import { coreCenter } from './grid';
import { markAuraDirty } from './towers';
import { applyTerrainPassives } from './weapons';
import { World } from './world';

export function finishSundering(w: World): void {
  petrify(w);
  const c = coreCenter();
  w.heartstoneX = c.x;
  w.heartstoneY = c.y;
  w.warden.x = c.x;
  w.warden.y = c.y;
  w.warden.hp = w.derived.maxHp;
  w.sundered = true;
  w.damageAtSunder = { ...w.damageByWeapon };
  w.damageTypeAtSunder = { ...w.damageByType };
  w.phase = 'act2';
  w.act2Time = 0;
  w.directorTimer = 0;
  // SPEC-V2 §1 leak coupling: this Day's Core leaks land in the Night's
  // budget right here, then clear for the next Day.
  w.spawnBudget = w.nightBudgetBonus;
  w.nightBudgetBonus = 0;
  w.looseInTheDark = 0;
  w.eliteTimer = w.content.spawns.eliteIntervalSeconds;
  w.riftIndex = 0;
  w.updateNav(true);
  w.emit('sunder', c.x, c.y, 0, 0);
}

/**
 * The other end of a block: the VS wave's timer (or, on the final block, the
 * Warden-Eater) ends, the horde recedes, and the next TD block begins right
 * away. SPEC-FINAL names no Rekindle cost anywhere, so every tower simply
 * un-petrifies for free — the whole roster is exactly as it stood when the
 * block's VS wave began, live again.
 */
export function advanceToNextBlock(w: World): void {
  for (const e of w.enemies) e.dead = true;
  w.deadEnemies = true;
  for (const s of w.structures) {
    if (s.dead) continue;
    s.petrified = false;
  }
  markAuraDirty(w);
  w.cycle++;
  w.phase = 'act1_build';
  w.buildTimer = w.mods.buildPhase || w.content.waves.buildPhaseSeconds;
}

/**
 * SPEC-FINAL §6.2: every tower petrifies in place for the VS wave — inert but
 * present, a standing obstacle rather than cleared terrain (Q108; V2's
 * Heartstone-pocket/approach-lane detonation is deleted along with the rest
 * of the Dusk/Dawn machine at p3d — §10's breach-cost pathing already
 * guarantees a route exists without physically bulldozing the maze).
 */
export function petrify(w: World): void {
  const c = coreCenter();
  for (const s of w.structures) {
    if (s.dead) continue;
    s.petrified = true;
    s.cooldown = 0;
    s.gemTimer = 0;
  }
  if (w.cfg.stripTerrain) {
    // A6 harness: the same Act I build, but the maze does not survive the night.
    for (const s of w.structures.slice()) w.removeStructure(s);
    w.grid.markDirty();
    w.grid.refresh();
    void c;
    return;
  }
  w.compact();
  linkSpires(w);
  applyTerrainPassives(w);
  // The structure list just changed shape (new petrified towers): the cached
  // residual scan from a prior block's VS wave is stale and must be rebuilt
  // against the current field.
  w.terrainEffects = null;
  void c;
}

/**
 * SPEC 4.2: conductive spires arc to other spires within 6 tiles, at most two
 * links each (three with Deep Roots). Links are symmetric.
 */
export function linkSpires(w: World): void {
  const spires: typeof w.structures = [];
  for (const s of w.structures) {
    if (s.dead) continue;
    const def = w.content.towerById.get(s.towerId)!;
    if (def.terrain.linkRange && def.terrain.maxLinks) spires.push(s);
    s.links = [];
  }
  if (spires.length < 2) return;
  const def = w.content.towerById.get(spires[0].towerId)!;
  const range = def.terrain.linkRange!;
  const maxLinks = def.terrain.maxLinks! + w.derived.teslaLinkBonus;

  const pairs: { a: number; b: number; d: number }[] = [];
  for (let i = 0; i < spires.length; i++) {
    for (let j = i + 1; j < spires.length; j++) {
      const dx = spires[i].tx - spires[j].tx;
      const dy = spires[i].ty - spires[j].ty;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= range) pairs.push({ a: i, b: j, d });
    }
  }
  pairs.sort((p, q) => p.d - q.d || p.a - q.a || p.b - q.b);
  for (const p of pairs) {
    const A = spires[p.a];
    const B = spires[p.b];
    if (A.links.length >= maxLinks || B.links.length >= maxLinks) continue;
    A.links.push(B.id);
    B.links.push(A.id);
  }
}

