/**
 * World state. Pure data plus small structural helpers; every rule lives in a
 * system module that takes a World. No DOM, no Math.random, no Date.now.
 */

import { loadContent, type Content, type ModifierDef } from './content';
import { GRID_H, GRID_W, Grid, GATES, coreCenter, type Field, type GateDef } from './grid';
import { RngSet } from './rng';
import { baseRunStats, derive, emptyStats, type Derived, type Stats } from './stats';
import { dist2 } from './math';
import type {
  Enemy,
  GroundArea,
  Gem,
  Offer,
  Phase,
  Projectile,
  Relic,
  RunConfig,
  RunOutcome,
  Structure,
  Warden,
  WeaponState,
} from './types';

/** Aggregated effect of the drafted map modifiers (SPEC 8.3). */
export interface ModifierEffects {
  enemyHp: number;
  enemySpeed: number;
  extraGates: number;
  extraWaves: number;
  pickupMul: number;
  residualMul: number;
  eliteMul: number;
  riftMul: number;
  ghostWeightMul: number;
  bossHp: number;
  buildPhase: number;
  coreHp: number;
}

function emptyModifierEffects(): ModifierEffects {
  return {
    enemyHp: 0,
    enemySpeed: 0,
    extraGates: 0,
    extraWaves: 0,
    pickupMul: 0,
    residualMul: 0,
    eliteMul: 1,
    riftMul: 1,
    ghostWeightMul: 1,
    bossHp: 0,
    buildPhase: 0,
    coreHp: 0,
  };
}

// Spatial-hash cell size in tiles. Most queries are body-sized (radius < 1),
// so a 1-tile cell keeps the candidate set tight; the whole sim is dominated
// by these lookups.
const CELL = 1;
const CELLS_X = GRID_W;
const CELLS_Y = GRID_H;

/** Ticks between Warden nav-field rebuilds. */
const NAV_PERIOD = 12;

function clampCell(v: number, max: number): number {
  return v < 0 ? 0 : v >= max ? max - 1 : v;
}

export class World {
  readonly content: Content;
  readonly cfg: RunConfig;
  readonly rng: RngSet;
  readonly grid: Grid;
  readonly gates: GateDef[];
  readonly mods: ModifierEffects;
  readonly modKeys: string[];

  tick = 0;
  phase: Phase = 'act1_build';
  outcome: RunOutcome = 'running';
  /**
   * Set the instant a defeat condition is met; `outcome` stays 'running' and
   * play keeps ticking for `dyingTimer` more seconds (SPEC-V2 D1's slow-mo
   * beat) before it flips to the terminal outcome and the Results screen.
   */
  dying: 'defeat_core' | 'defeat_warden' | null = null;
  dyingTimer = 0;

  /* ---- Act I ---- */
  wave = 0;
  waveCount: number;
  buildTimer: number;
  spawnTimer = 0;
  /** Queued spawns for the active wave: [enemyDefId, gateIndex] pairs. */
  spawnQueue: number[][] = [];
  gold: number;
  goldEarned = 0;
  goldSpent = 0;
  coreHp: number;
  coreMaxHp: number;
  act1Ticks = 0;

  /* ---- Sundering ---- */
  duskTimer = 0;
  soulCandidates: string[] = [];
  sundered = false;
  lastStandUsed = false;
  heartstoneX = 0;
  heartstoneY = 0;
  soulPickTimer = 0;
  /** Beacon-shrine attack-speed bonus while the Warden stands in range. */
  shrineHaste = 0;
  /** Cached petrified-terrain effect lists, built once at the Sundering. */
  terrainEffects: import('./weapons').TerrainEffects | null = null;

  /* ---- Act II ---- */
  act2Time = 0;
  act2Ticks = 0;
  directorTimer = 0;
  /** Unspent spawn budget carried between ticks. */
  spawnBudget = 0;
  eliteTimer = 0;
  riftIndex = 0;
  bossSpawned = false;
  /** Set the first time a practice command lands (SPEC has no such mode). */
  practiceUsed = false;
  /** Practice tool: the Warden takes no damage while this is on. */
  invulnerable = false;
  bossKilled = false;
  bossKillTime = -1;
  bossSpawnTime = -1;
  /** SPEC 5.5 phase 3: the closing ring of arena fire. */
  arenaFireActive = false;
  arenaFireRadius = 0;

  /* ---- entities ---- */
  warden: Warden;
  structures: Structure[] = [];
  structureById = new Map<number, Structure>();
  enemies: Enemy[] = [];
  enemyById = new Map<number, Enemy>();
  projectiles: Projectile[] = [];
  gems: Gem[] = [];
  areas: GroundArea[] = [];

  /* ---- progression ---- */
  stats: Stats;
  derived: Derived;
  weapons: WeaponState[] = [];
  boonRanks: Record<string, number> = {};
  awakenings: string[] = [];
  level = 1;
  xp = 0;
  pendingLevelUps = 0;
  offers: Offer[] = [];
  rerollsLeft = 0;
  relicsFound: Relic[] = [];
  orbsFound: string[] = [];
  /** Filled in at results time by the meta layer. */
  emberEarned = 0;

  /* ---- stats/telemetry ---- */
  kills = 0;
  leaks = 0;
  wavesCleared = 0;
  towersBuilt = 0;
  towersByKey: Record<string, number> = {};
  damageByWeapon: Record<string, number> = {};
  damageTotal = 0;
  /** Per-wave Act I telemetry, indexed by wave number (1-based). */
  spawnedByWave: number[] = [];
  leaksByWave: number[] = [];
  goldEarnedByWave: number[] = [];
  /** Cumulative damage at the Sundering, so Act II shares can be isolated. */
  damageAtSunder: Record<string, number> = {};
  /** Act II damage-by-source through minute 8, for SPEC A5. Null until reached. */
  damageThroughMinute8: Record<string, number> | null = null;
  /** Per-tick event log the renderer drains (never read by the sim). */
  fx: { k: string; x: number; y: number; a: number; b: number }[] = [];

  /** Cached Beacon aura bonus per structure id; recomputed when structures change. */
  readonly auraBonus = new Map<number, number>();
  auraDirty = true;

  /**
   * Act II navigation fields, sourced at the Warden's tile and refreshed on a
   * fixed tick cadence (never on wall-clock) so replays stay bit-exact.
   */
  readonly navGround = Grid.makeField();
  private navTile = -1;
  private navTick = -1000;

  private nextEntityId = 1;

  /**
   * Spatial index over live enemies: one pooled bucket per tile, plus the list
   * of buckets actually used last tick so a rebuild only clears those. This is
   * the hottest structure in the sim - almost every system asks it something.
   */
  private readonly cells: Enemy[][] = Array.from({ length: GRID_W * GRID_H }, () => []);
  private usedCells: number[] = [];

  constructor(cfg: RunConfig, content: Content = loadContent()) {
    this.content = content;
    this.cfg = cfg;
    this.rng = new RngSet(cfg.seed);
    this.grid = new Grid();

    this.modKeys = cfg.modifiers.slice();
    this.mods = emptyModifierEffects();
    for (const key of cfg.modifiers) {
      const def: ModifierDef | undefined = content.modifierByKey.get(key);
      if (!def) continue;
      const e = def.effect;
      if (e.enemyHp) this.mods.enemyHp += e.enemyHp;
      if (e.enemySpeed) this.mods.enemySpeed += e.enemySpeed;
      if (e.extraGates) this.mods.extraGates += e.extraGates;
      if (e.extraWaves) this.mods.extraWaves += e.extraWaves;
      if (e.pickupMul) this.mods.pickupMul += e.pickupMul;
      if (e.residualMul) this.mods.residualMul += e.residualMul;
      if (e.eliteMul) this.mods.eliteMul *= e.eliteMul;
      if (e.riftMul) this.mods.riftMul *= e.riftMul;
      if (e.ghostWeightMul) this.mods.ghostWeightMul *= e.ghostWeightMul;
      if (e.bossHp) this.mods.bossHp += e.bossHp;
      if (e.buildPhase) this.mods.buildPhase = e.buildPhase;
      if (e.coreHp) this.mods.coreHp += e.coreHp;
    }

    this.gates = GATES.slice(0, 3);
    if (this.mods.extraGates > 0) {
      // Fourth Gate opens the south wall.
      this.gates.push({ key: 'south', tx: 12, ty: 19 });
      for (const g of this.gates) {
        this.grid.tile[this.grid.idx(g.tx, g.ty)] = 2;
      }
      this.grid.markDirty();
      this.grid.refresh();
    }

    this.stats = baseRunStats(content, cfg);
    this.stats.pickupPct += this.mods.pickupMul;
    this.derived = derive(content, this.stats, 1 + this.mods.residualMul);

    this.waveCount = content.waves.waves.length + this.mods.extraWaves;
    this.buildTimer = this.mods.buildPhase || content.waves.buildPhaseSeconds;
    this.gold = content.waves.startGold;
    this.coreMaxHp = Math.max(1, content.waves.coreHp + this.stats.coreHp + this.mods.coreHp);
    this.coreHp = this.coreMaxHp;

    const cc = coreCenter();
    this.warden = {
      x: cc.x - 3,
      y: cc.y,
      hp: this.derived.maxHp,
      dashCooldown: 0,
      dashCharges: this.derived.dashCharges,
      dashIFrames: 0,
      attackCooldown: 0,
      fx: -1,
      fy: 0,
      outOfCombat: 0,
      secondWindUsed: false,
      leechAccumulator: 0,
    };
  }

  newId(): number {
    return this.nextEntityId++;
  }

  get time(): number {
    return this.tick / 60;
  }

  recomputeDerived(): void {
    this.derived = derive(this.content, this.stats, 1 + this.mods.residualMul);
  }

  /** True once enemies chase the Warden rather than the Core. */
  get huntsWarden(): boolean {
    return this.phase === 'act2' || this.phase === 'levelup';
  }

  /** Where enemies are ultimately heading this tick. */
  targetPoint(): { x: number; y: number } {
    if (this.huntsWarden) return { x: this.warden.x, y: this.warden.y };
    const c = coreCenter();
    return c;
  }

  navFieldFor(ghost: boolean): Field {
    if (this.huntsWarden) return this.navGround;
    return ghost ? this.grid.ghost : this.grid.ground;
  }

  /** Recompute the Warden-sourced fields when they go stale. */
  updateNav(force = false): void {
    const tx = Math.floor(this.warden.x);
    const ty = Math.floor(this.warden.y);
    if (!this.grid.inBounds(tx, ty)) return;
    const key = this.grid.idx(tx, ty);
    if (!force && key === this.navTile) return;
    // A moving Warden changes tile several times a second and each rebuild is
    // two Dijkstra passes, so they are rate-limited. Enemies chase a field at
    // most NAV_PERIOD ticks stale, which is well inside a body width.
    if (!force && this.tick - this.navTick < NAV_PERIOD) return;
    this.navTick = this.tick;
    this.navTile = key;
    // Seed from the Warden tile plus its open neighbours, so a Warden standing
    // inside terrain (possible right after a dash) still yields a usable field.
    const sources: number[] = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = tx + dx;
        const ny = ty + dy;
        if (this.grid.passable(nx, ny)) sources.push(this.grid.idx(nx, ny));
      }
    }
    if (sources.length === 0) sources.push(key);
    this.grid.computeField(this.navGround, sources, false);
    // The ghost field is not built: burrowers and phasing wraiths ignore
    // terrain, so they beeline rather than follow a field.
  }

  /* -------------------------------------------------------- entity helpers */

  addStructure(s: Structure): void {
    this.structures.push(s);
    this.structureById.set(s.id, s);
    this.grid.setOcc(s.tx, s.ty, s.id);
  }

  removeStructure(s: Structure): void {
    s.dead = true;
    this.deadStructures = true;
    if (this.grid.occ[this.grid.idx(s.tx, s.ty)] === s.id) this.grid.setOcc(s.tx, s.ty, 0);
    this.structureById.delete(s.id);
  }

  structureAt(tx: number, ty: number): Structure | null {
    const id = this.grid.occ[this.grid.idx(tx, ty)];
    if (id <= 0) return null;
    return this.structureById.get(id) ?? null;
  }

  addEnemy(e: Enemy): void {
    this.enemies.push(e);
    this.enemyById.set(e.id, e);
  }

  /** Drop dead entities. Called once per tick, after all systems. */
  compact(): void {
    if (this.deadEnemies) {
      const next: Enemy[] = [];
      for (const e of this.enemies) {
        if (e.dead) this.enemyById.delete(e.id);
        else next.push(e);
      }
      this.enemies = next;
      this.deadEnemies = false;
    }
    if (this.deadStructures) {
      this.structures = this.structures.filter((s) => !s.dead);
      this.deadStructures = false;
    }
    // Projectiles, gems and areas are short-lived and small; a filter per tick
    // is cheaper than tracking flags across every write site.
    if (this.projectiles.length > 0) this.projectiles = this.projectiles.filter((p) => !p.dead);
    if (this.gems.length > 0) this.gems = this.gems.filter((g) => !g.dead);
    if (this.areas.length > 0) this.areas = this.areas.filter((a) => !a.dead);
  }

  /** Set whenever something is marked dead, so compact can skip a rescan. */
  deadEnemies = false;
  deadStructures = false;

  /* ------------------------------------------------------- spatial queries */

  rebuildBuckets(): void {
    const cells = this.cells;
    const used = this.usedCells;
    for (let i = 0; i < used.length; i++) cells[used[i]].length = 0;
    used.length = 0;
    // cellKey is inlined here: this loop runs for every live enemy every
    // tick, and the call plus its two clamps was measurable at the alive cap.
    const enemies = this.enemies;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      // Submerged Burrowers are out of the index entirely, so nothing can
      // target them until they surface.
      if (e.dead || e.submerged) continue;
      let cx = Math.floor(e.x);
      let cy = Math.floor(e.y);
      if (cx < 0) cx = 0;
      else if (cx >= CELLS_X) cx = CELLS_X - 1;
      if (cy < 0) cy = 0;
      else if (cy >= CELLS_Y) cy = CELLS_Y - 1;
      const c = cy * CELLS_X + cx;
      const bucket = cells[c];
      if (bucket.length === 0) used.push(c);
      bucket.push(e);
    }
  }

  /**
   * All live enemies within `radius` of (x,y).
   *
   * Order is deterministic without sorting: cells are visited in a fixed nested
   * order and each bucket preserves `enemies` insertion order. This is called
   * hundreds of times per tick, so the sort it used to do was the single
   * hottest line in the sim.
   */
  enemiesInRadius(x: number, y: number, radius: number, out: Enemy[] = []): Enemy[] {
    out.length = 0;
    const r2 = radius * radius;
    const minCx = clampCell(Math.floor((x - radius) / CELL), CELLS_X);
    const maxCx = clampCell(Math.floor((x + radius) / CELL), CELLS_X);
    const minCy = clampCell(Math.floor((y - radius) / CELL), CELLS_Y);
    const maxCy = clampCell(Math.floor((y + radius) / CELL), CELLS_Y);
    const cells = this.cells;
    for (let cy = minCy; cy <= maxCy; cy++) {
      const row = cy * CELLS_X;
      for (let cx = minCx; cx <= maxCx; cx++) {
        const bucket = cells[row + cx];
        for (let i = 0; i < bucket.length; i++) {
          const e = bucket[i];
          if (e.dead) continue;
          if (dist2(x, y, e.x, e.y) <= r2) out.push(e);
        }
      }
    }
    return out;
  }

  /** Nearest live enemy within radius, or null. Ties broken by entity id. */
  nearestEnemy(x: number, y: number, radius: number, filter?: (e: Enemy) => boolean): Enemy | null {
    let best: Enemy | null = null;
    let bestD = radius * radius;
    const minCx = clampCell(Math.floor((x - radius) / CELL), CELLS_X);
    const maxCx = clampCell(Math.floor((x + radius) / CELL), CELLS_X);
    const minCy = clampCell(Math.floor((y - radius) / CELL), CELLS_Y);
    const maxCy = clampCell(Math.floor((y + radius) / CELL), CELLS_Y);
    const cells = this.cells;
    for (let cy = minCy; cy <= maxCy; cy++) {
      const row = cy * CELLS_X;
      for (let cx = minCx; cx <= maxCx; cx++) {
        const bucket = cells[row + cx];
        for (let i = 0; i < bucket.length; i++) {
          const e = bucket[i];
          if (e.dead) continue;
          if (filter && !filter(e)) continue;
          const d = dist2(x, y, e.x, e.y);
          if (d < bestD || (d === bestD && best !== null && e.id < best.id)) {
            bestD = d;
            best = e;
          }
        }
      }
    }
    return best;
  }

  emit(k: string, x: number, y: number, a = 0, b = 0): void {
    if (this.fx.length < 512) this.fx.push({ k, x, y, a, b });
  }
}

export { coreCenter };
export function makeStats(): Stats {
  return emptyStats();
}
