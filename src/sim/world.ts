/**
 * World state. Pure data plus small structural helpers; every rule lives in a
 * system module that takes a World. No DOM, no Math.random, no Date.now.
 */

import { defaultCoreKey, loadContent, type Content, type ModifierDef } from './content';
import { computeCoreState, coreHpBonus, type CoreState } from './cores';
import { GRID_H, GRID_W, Grid, GATES, coreCenter, type Field, type GateDef } from './grid';
import { RngSet } from './rng';
import { baseRunStats, damageTakenMul, derive, emptyStats, type Derived, type Stats } from './stats';
import { dist2 } from './math';
import { structureArmor, structureMaxHp } from './upgrades';
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
  /**
   * SPEC-FINAL §5.5: the resolved Core key, defaulted from content (the one
   * `unlockedByDefault` row, Stone Heart) when `cfg.core` is omitted, so every
   * reader (`hashWorld`, `buildReport`) sees a real key rather than deciding
   * its own fallback.
   */
  readonly coreKey: string;
  /** SPEC-FINAL §5.5: steps bought on the current Core's upgrade track (0..`upgrade.count`). Never decreases — a Core cannot be sold. */
  coreStep = 0;
  /** The current Core's live numbers, folded from `effects` + steps bought (`p-core-b`, `src/sim/cores.ts`); recomputed by `recomputeCore()` on every purchase. */
  core: CoreState;
  /** Sub-1-gold trickle from Time's step-1 income and Vampire Heart's overheal conversion (`src/sim/cores.ts`), flushed into `gold` once it crosses a whole unit. */
  coreGoldAccumulator = 0;
  /** Carnivorous Plant (`p-core-c`, `src/sim/cores.ts`): TD devours and VS bullets both fire on their own countdown, same shape as the VS-special timers below. */
  plantDevourTimer = 0;
  plantVolleyTimer = 0;
  /** Carnivorous Plant §5.5: "+1 Digestion stack for the run" — never resets across a TD block or a VS wave, only ever increases. */
  digestionStacks = 0;

  tick = 0;
  phase: Phase = 'act1_build';
  outcome: RunOutcome = 'running';
  /**
   * 1-based index of the TD-block/VS-wave pair in progress (SPEC-FINAL §1.1's
   * "3 TD waves, then 1 VS wave, repeating" pattern). Every block transition
   * is immediate — no Dusk/Dawn wait, no Rekindle ledger (both deleted at
   * p3d) — see `finishSundering`/`advanceToNextBlock` in `sundering.ts`.
   */
  cycle = 1;
  /** VS waves this run plays before the Warden-Eater ends it (cfg.cycles, default 6 per §1.1). */
  readonly totalCycles: number;
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
  /**
   * Queued spawns for the active fight: `[enemyDefId, gateIndex, originWave]`
   * triples. Normally all drawn from one wave's composition; multi-summon
   * (p3b) appends a second/third wave's own queue on top when the player
   * stacks a call, which is why each entry carries its true origin wave
   * rather than inheriting `w.wave`.
   */
  spawnQueue: number[][] = [];
  /**
   * SPEC-FINAL §1.1 multi-summon (p3b): TD waves merged into the fight
   * currently in progress, beyond the base one already fighting — 0..
   * `maxStackedWaves - 1`, so at most `maxStackedWaves` waves are ever
   * simultaneously active. Reset to 0 the instant that merged fight
   * completes (`completeWave`). Hashed: it gates when the next block's
   * build phase (or dusk) begins, the same class of timing state
   * `wieldedCooldown` is hashed for.
   */
  stackDepth = 0;
  gold: number;
  goldEarned = 0;
  goldSpent = 0;
  coreHp: number;
  coreMaxHp: number;
  act1Ticks = 0;

  /* ---- Sundering ---- */
  sundered = false;
  lastStandUsed = false;
  heartstoneX = 0;
  heartstoneY = 0;
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
  /**
   * Practice tool (SPEC-V3 T4): neither the Warden nor the Core takes damage.
   * Wider than `invulnerable`, which covers the Warden alone — leaks still
   * count and still feed the next VS wave's budget, so leak coupling can be
   * exercised in god mode; only the Core HP loss is suppressed.
   */
  godMode = false;
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
  boonRanks: Record<string, number> = {};
  level = 1;
  xp = 0;
  pendingLevelUps = 0;
  offers: Offer[] = [];
  rerollsLeft = 0;
  relicsFound: Relic[] = [];
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
  /**
   * SPEC-V2 §1 leak coupling: accumulates `leakBudgetMultiplier x director
   * cost` for every enemy that reaches the Core this Day, spent into
   * `spawnBudget` the instant that Day's Night begins (`finishSundering`).
   * `looseInTheDark` mirrors it as a headcount for the Day HUD and resets the
   * same moment.
   */
  nightBudgetBonus = 0;
  looseInTheDark = 0;
  /** Cumulative damage at the Sundering, so Act II shares can be isolated. */
  damageAtSunder: Record<string, number> = {};
  /** Act II damage-by-source through minute 8, for SPEC A5. Null until reached. */
  damageThroughMinute8: Record<string, number> | null = null;
  /** Per-tick event log the renderer drains (never read by the sim). */
  fx: { k: string; x: number; y: number; a: number; b: number }[] = [];

  /** Cached Beacon aura bonus per structure id; recomputed when structures change. */
  readonly auraBonus = new Map<number, number>();
  auraDirty = true;

  /** SPEC-FINAL §6.1: per-tower-type cooldown for wielded VS attacks (p2b). */
  readonly wieldedCooldown = new Map<number, number>();
  /**
   * Cached `wieldedAttacks()` result — invalidated by `markAuraDirty` (towers.ts),
   * the same build/sell/upgrade call sites the Beacon-aura cache already uses,
   * since both caches go stale exactly when the tower roster changes.
   */
  wieldedCache: import('./vswield').WieldedAttack[] | null = null;
  wieldedDirty = true;
  /**
   * SPEC-FINAL §4.1's "counts as 1 attack" rule: every character-attack volley
   * (a whole wielded-tower-type firing, however many enemies it hits) calls
   * `recordAttack` exactly once. Keyed by source so a per-type reader is
   * possible later; `onAttack` is the hook a class's on-attack passive
   * subscribes to once P6 gives one — nothing does yet.
   */
  attacksFired: Record<string, number> = {};
  onAttack: ((source: string) => void) | null = null;

  /**
   * SPEC-FINAL §5's VS specials that tick on a timer rather than fire off a
   * hit (p2c, `src/sim/vsspecials.ts`): Venom Spore's poison trail, Frost
   * Obelisk's following ice aura, and Tesla Coil's 0.5 s wire-grid pulse.
   * Sim state that gates a damage/CC system, hashed for the same reason
   * `wieldedCooldown` is (x002/p2b review).
   */
  vsPoisonTrailTimer = 0;
  vsFrostAuraTimer = 0;
  vsWireGridTimer = 0;

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
    this.coreKey = cfg.core ?? defaultCoreKey(content);
    this.totalCycles = Math.max(1, Math.round(cfg.cycles ?? 6));
    this.rng = new RngSet(cfg.seed);
    this.grid = new Grid();
    this.grid.breachBase = content.towers.breach.base;

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
    this.stats.add('modifiers', 'pickupPct', this.mods.pickupMul);
    // SPEC-FINAL §5.5 Vampire Heart: "VS: character +1% lifesteal" is a base
    // effect (no step required) and `leech` is already a generic Warden stat
    // (`damageEnemy`, enemies.ts) gated to VS by its own `huntsWarden` check —
    // so this is the one Core number that rides the existing Stats pipeline
    // rather than `CoreState` (see cores.ts's file header). Added once, here,
    // never again: `coreStep` never changes `vsLifestealPct`.
    const coreDef = content.coreByKey.get(this.coreKey);
    const vsLifesteal = coreDef?.effects?.vsLifestealPct;
    if (vsLifesteal) this.stats.add(`core:${this.coreKey}`, 'leech', vsLifesteal);
    this.derived = derive(content, this.stats, 1 + this.mods.residualMul);
    this.core = computeCoreState(content, this.coreKey, this.coreStep);

    // `totalCycles <= 1` stays the single-pass escape hatch a lot of the
    // suite still opts into on purpose (tests/helpers.ts's default `cfg()`,
    // light-build.test.ts): a full walk of the authored wave table into one
    // Sundering, one boss-only VS wave. p3d deleted the Dusk/Dawn *phase
    // machine* this shape used to ride (no more waiting phases, no Rekindle),
    // but the wave-COUNT formula itself is untouched — that is p3e's
    // re-baseline, not this item's (Q108). SPEC-FINAL §1.1's real shape (any
    // `totalCycles > 1`) instead targets 18 TD waves total — `tdWavesPerVsWave`
    // x `totalCycles`, e.g. 3 x 6 — even though `data/waves.json` only authors
    // 10 rows today; `buildSpawnQueue` (run.ts) already repeats the last
    // authored row with continued HP scaling past the table's end, so this is
    // purely a wave *count*, not a content-authoring change (that's p8a's).
    this.waveCount =
      this.totalCycles <= 1
        ? content.waves.waves.length + this.mods.extraWaves
        : content.waves.tdWavesPerVsWave * this.totalCycles + this.mods.extraWaves;
    this.buildTimer = this.mods.buildPhase || content.waves.buildPhaseSeconds;
    this.gold = content.waves.startGold;
    // `p-core-a` left this reading `content.waves.coreHp` unconditionally,
    // which happens to equal Stone Heart's own `baseHp` (500) but silently
    // gave every other Core the wrong base HP the instant one was chosen —
    // `p-core-b` is the first item to give a non-default Core a real numeric
    // effect, so it is also the first to notice. `coreHpBonus` is always 0 at
    // construction (`coreStep` starts at 0); it only matters once Stone
    // Heart's own steps are bought (`upgradeCore`, cores.ts).
    const coreBaseHp = coreDef?.baseHp ?? content.waves.coreHp;
    this.coreMaxHp = Math.max(
      1,
      coreBaseHp + coreHpBonus(content, this.coreKey, this.coreStep) + this.stats.total('coreHp') + this.mods.coreHp,
    );
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
      activeCooldown: 0,
      fx: -1,
      fy: 0,
      outOfCombat: 0,
      secondWindUsed: false,
      armorShred: 0,
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

  /** Refolds `core` from `coreStep` — called by `upgradeCore` (cores.ts) after every purchase. */
  recomputeCore(): void {
    this.core = computeCoreState(this.content, this.coreKey, this.coreStep);
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
    this.refreshBreach(s);
  }

  /**
   * SPEC-FINAL §10: price this structure's tile for the ground flow field —
   * `perEhp ×` its effective HP (max HP over the damage-taken multiplier its
   * defense earns), on top of the flat `breach.base` the grid adds for any
   * occupied tile. Priced on build and upgrade; death clears it via
   * `setOcc(0)`. Deliberately max HP, not current HP: a half-eaten wall
   * re-pricing every hit would rebuild the field every tick of a siege, and
   * the horde chewing it is already standing at the cheapest tile (Q92).
   */
  refreshBreach(s: Structure): void {
    const def = this.content.towerById.get(s.towerId);
    if (!def || !def.blocks) return;
    const ehp = structureMaxHp(this, def, s.tier) / damageTakenMul(structureArmor(this, s));
    const b = this.content.towers.breach;
    this.grid.setBreach(s.tx, s.ty, Math.max(1, Math.round(b.perEhp * ehp)));
  }

  removeStructure(s: Structure): void {
    s.dead = true;
    this.deadStructures = true;
    if (this.grid.occ[this.grid.idx(s.tx, s.ty)] === s.id) this.grid.setOcc(s.tx, s.ty, 0);
    this.structureById.delete(s.id);
    // Every death path funnels through here — sell, breach/siege kill,
    // sundering pocket-clear — so this is the one choke point that must
    // invalidate both the Beacon-aura and wielded-attack caches (p2b code
    // review, Critical): `sellTower`'s own `markAuraDirty(w)` call is
    // otherwise the only thing that ever did, which missed every
    // enemy-caused death.
    this.auraDirty = true;
    this.wieldedDirty = true;
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

  /**
   * p2f: Fire Brazier's VS burning-explosion chain (`triggerBurningExplode`)
   * used to recurse directly through `killEnemy` -> `damageEnemy` ->
   * `triggerBurningExplode`, overflowing the call stack at ~1500-1600 chained
   * deaths in one cluster. `killEnemy` now enqueues here instead of calling
   * it inline; `drainBurningExplosions` walks the queue with a plain loop so
   * a long chain grows the queue, not the stack.
   */
  pendingBurningExplosions: Enemy[] = [];
  drainingBurningExplosions = false;

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

  /** One character-attack volley, regardless of how many enemies it struck. */
  recordAttack(source: string): void {
    this.attacksFired[source] = (this.attacksFired[source] ?? 0) + 1;
    this.onAttack?.(source);
  }
}

export { coreCenter };
export function makeStats(): Stats {
  return emptyStats();
}

/**
 * SPEC-FINAL §1.1: last TD wave (global index) of the given block —
 * `tdWavesPerVsWave x cycle` — except the final block, which always ends at
 * `w.waveCount` exactly (so it lands on TD wave 18 even though only 10 are
 * authored; `w.waveCount` already accounts for that, see the World
 * constructor).
 */
export function cycleWaveEnd(w: World, cycle: number): number {
  if (cycle >= w.totalCycles) return w.waveCount;
  return Math.min(w.content.waves.tdWavesPerVsWave * cycle, w.waveCount);
}

/**
 * SPEC-FINAL §1.1: VS wave length is a fixed 75s ⚖ for every block but the
 * last, which runs until the Warden-Eater dies (Infinity here; `updateAct2`
 * is what actually gates the final block on `w.bossKilled` rather than time).
 */
export function nightLengthSeconds(w: World, cycle: number): number {
  if (cycle >= w.totalCycles) return Infinity;
  return w.content.waves.vsWaveSeconds;
}

/** Elite spawn-count multiplier for a cycle's Night capstone (e.g. cycle 2's "Elite pressure x2"). */
export function cycleEliteMul(w: World, cycle: number): number {
  const m = w.content.waves.eliteMulByCycle;
  return (m && m[String(cycle)]) ?? 1;
}
