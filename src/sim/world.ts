/**
 * World state. Pure data plus small structural helpers; every rule lives in a
 * system module that takes a World. No DOM, no Math.random, no Date.now.
 */

import { contentHash, defaultCoreKey, loadContent, type Content, type ModifierDef } from './content';
import { computeCoreState, coreHpBonus, type CoreState } from './cores';
import { GRID_H, GRID_W, Grid, GATES, coreCenter, type Field, type GateDef, type TerrainOverlay } from './grid';
import { RngSet } from './rng';
import { generateTerrain, loadTerrain, terrainOverlay, type TerrainConfig, type TerrainMap } from './terrain';
import { baseRunStats, damageTakenMul, derive, emptyStats, type Derived, type Stats } from './stats';
import { dist2 } from './math';
import { structureArmor, structureMaxHp } from './upgrades';
import type {
  ClassSummon,
  Corpse,
  Enemy,
  GroundArea,
  Gem,
  Offer,
  Phase,
  Projectile,
  RunConfig,
  RunOutcome,
  Structure,
  TimeLockZone,
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

/**
 * The Warden's Act I spawn tile (`World`'s constructor: `coreCenter().x - 3,
 * coreCenter().y`) — fixed, like `CORE_X/CORE_Y`, but not itself a `GateDef`
 * or a `TileType.Core` tile, so `Grid.applyTerrain` has no reason to force it
 * open the way it already does for Gate/Core tiles. Exported so `World`'s own
 * spawn-position math and `applyRunTerrain`'s clearing stay one source of
 * truth rather than two hand-synced constants.
 */
export function wardenSpawnTile(): { tx: number; ty: number } {
  const cc = coreCenter();
  return { tx: Math.floor(cc.x) - 3, ty: Math.floor(cc.y) };
}

/**
 * Force a 3x3 block centered on `(tx, ty)` to normal, walkable, buildable
 * ground in `overlay`, in place — the same "structural tile outranks the
 * scatter" treatment `Grid.applyTerrain` already gives every Gate/Core tile,
 * applied here (pre-apply, on the overlay) for the one structural position
 * that isn't a `GateDef` or `TileType.Core`: the Warden's own spawn tile.
 * Measured (2000-seed sweep, base 3 gates): 1.0% of seeds land Rock or High
 * Ground directly on that tile with no clearing at all — over 10x
 * `applyRunTerrain`'s own cited Core-stranding rate — which would either
 * spawn the character embedded in impassable rock or park it on an Act I
 * "safe spot" no gate band measures.
 */
function clearOverlayBlock(overlay: TerrainOverlay, tx: number, ty: number): void {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = tx + dx;
      const y = ty + dy;
      if (x < 0 || y < 0 || x >= overlay.w || y >= overlay.h) continue;
      const i = y * overlay.w + x;
      overlay.kind[i] = 0; // TerrainKind.Normal
      overlay.walkable[i] = 1;
      overlay.buildable[i] = 1;
      overlay.high[i] = 0;
      overlay.charBlock[i] = 0;
    }
  }
}

/**
 * fb077 (SPEC-FINAL §10.5): generate terrain for `gates`/`seed` and apply it
 * to `grid`, retrying at `seed + 1, seed + 2, ...` when the hardcoded
 * `CORE_X/CORE_Y` Core comes out unreachable (`generateTerrain` itself only
 * retries for *band* legality — it never sees where the Core sits, since
 * fb064c's movable-Core placement Command is separate, out-of-scope work).
 * Exhausting `MAX_CORE_RETRIES` independent attempts is not observed across
 * 5000-seed sweeps and astronomically unlikely; if it ever happens anyway,
 * `grid` is reset to the flat arena (an all-normal overlay reproduces
 * `Grid`'s own untouched state, which is trivially legal) rather than ship a
 * stranded Core, and the fallback is reported exactly like a degenerate
 * `TerrainMap` is. `grid` must not have any structure on it yet
 * (`Grid.applyTerrain` refuses live occupancy).
 *
 * A free function, not a `World` method, so a test can drive it against a
 * synthetic `TerrainConfig`/gate list without constructing a real `World`.
 * Returns whether the run fell back to the flat arena.
 */
export function applyRunTerrain(
  grid: Grid,
  gates: readonly GateDef[],
  seed: number,
  terrainCfg: TerrainConfig = loadTerrain(),
): boolean {
  const MAX_CORE_RETRIES = 16;
  const { tx: wtx, ty: wty } = wardenSpawnTile();
  const applyAt = (s: number): TerrainMap => {
    const attemptMap = generateTerrain(s, terrainCfg, gates);
    const overlay = terrainOverlay(attemptMap, terrainCfg);
    clearOverlayBlock(overlay, wtx, wty);
    grid.applyTerrain(overlay);
    grid.refresh();
    return attemptMap;
  };
  let map = applyAt(seed);
  let tries = 0;
  while (!map.fallback && !grid.allGatesReachable() && tries < MAX_CORE_RETRIES) {
    tries++;
    // `>>> 0` wraps like `generateTerrain`'s own retry walk: a seed within 16 of
    // the uint32 ceiling must retry, not throw out of the World constructor.
    map = applyAt((seed + tries) >>> 0);
  }
  if (map.fallback) {
    // Not a DOM/timing/RNG side effect (architecture rule 1 forbids none of
    // those) — a one-line dev-visible signal so a hostile `/data` edit never
    // reads as a silent flat arena for a whole run (item 4's own wording).
    console.warn(
      `applyRunTerrain: generation exhausted every band attempt for seed ${seed}; playing on the flat fallback arena.`,
    );
    return true;
  }
  if (grid.allGatesReachable()) return false;
  console.warn(
    `applyRunTerrain: every terrain candidate for seed ${seed} left the Core unreachable (${MAX_CORE_RETRIES + 1} attempts); playing on the flat fallback arena.`,
  );
  const n = GRID_W * GRID_H;
  const flat: TerrainOverlay = {
    w: GRID_W,
    h: GRID_H,
    kind: new Uint8Array(n),
    walkable: new Uint8Array(n).fill(1),
    buildable: new Uint8Array(n).fill(1),
    high: new Uint8Array(n),
    charBlock: new Uint8Array(n),
  };
  grid.applyTerrain(flat);
  grid.refresh();
  return true;
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
   * fb077 (SPEC-FINAL §10.5): true when this run could not place real
   * generated terrain — either `generateTerrain` itself exhausted every band
   * attempt (`TerrainMap.fallback`), or every attempt tried left the
   * hardcoded Core unreachable from the gates — and played on the flat
   * default arena instead. Practice runs are always `false`: Training
   * Grounds deliberately never generates terrain (BACKLOG-TERRAIN.md fb064f).
   * Surfaced in `RunReport.terrainFallback` as replay provenance so a strict
   * `/data` band never reads as a silent flat arena for a whole run.
   */
  readonly terrainFallback: boolean;
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
  /** Corpse (`p-core-d`, `src/sim/cores.ts`): TD-only damage store, credited by the generic `damageEnemy` hook (enemies.ts) from every source on the map, spent by executions. */
  corpseStore = 0;
  corpseExecuteTimer = 0;
  corpseAutoFireTimer = 0;

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
  /**
   * fb154: which spawn gate the next VS **ground** enemy comes out of. Plain
   * round-robin over `gates` rather than a random draw, so a wave's arrivals
   * are spread evenly across every gate instead of clustering by luck — and it
   * is sim state, hashed with the rest, so a replay picks the same gates in the
   * same order.
   *
   * Deliberately **not** reset between VS blocks, unlike `eliteTimer` and
   * `riftIndex` (`sundering.ts`): those two are timers whose meaning is
   * "since this block began", while this is a position in a rotation and
   * restarting it every block would bias the first gate of every wave.
   */
  vsGateCursor = 0;
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
  /** fb033 Practice tool: TD waves never hand off to the VS wave — `completeWave` keeps looping act1_build/act1_wave, wave index climbing with continued HP scaling, until toggled off. */
  infiniteTdWaves = false;
  /** fb033 Practice tool: the VS wave never hands off back to TD (or ends by boss kill) — `updateAct2` keeps resetting the block in place, `cycle` climbing so elite/time scaling keeps ramping, until toggled off. */
  infiniteVsWaves = false;
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
  /** SPEC-FINAL §4.2 (p6d): live class summons — turrets, skeletons, pylons, spirits, totems. */
  classSummons: ClassSummon[] = [];
  /** §4.2 Necromancer: corpses dropped by kills, consumed by *Raise*. */
  corpses: Corpse[] = [];
  /**
   * §4.2 Cryomancer *Ice Wall*: structures that stand for `remaining` seconds
   * and are then removed outright. Tracked here rather than as a `Structure`
   * field so nothing else in the tower pipeline has to learn about a wall that
   * expires (`updateTempWalls`, classes.ts).
   */
  tempWalls: { structureIds: number[]; remaining: number }[] = [];
  /** fb013 Time Lord *Time Lock*: the single live no-exit zone, or null. */
  timeLockZone: TimeLockZone | null = null;

  /* ---- progression ---- */
  stats: Stats;
  derived: Derived;
  boonRanks: Record<string, number> = {};
  /** p7a (§6.3): Type Mastery ranks, keyed by tower type key. */
  typeMasteryRanks: Record<string, number> = {};
  /** p7a (§6.3): per-class skill card ranks, keyed by the card's own globally-unique key. */
  skillCardRanks: Record<string, number> = {};
  level = 1;
  xp = 0;
  pendingLevelUps = 0;
  offers: Offer[] = [];
  rerollsLeft = 0;
  /**
   * p9e (G18): ticks spent parked in `phase === 'levelup'` since the current
   * offer was rolled, reset whenever `openLevelUpIfPending` opens a fresh
   * offer and whenever `rerollOffers` re-rolls the standing one (both are
   * "a fresh offer was just shown" in the sense this idle clock cares about).
   * Inert once the phase leaves `levelup`. Gates `tickLevelupIdle`'s
   * (`progression.ts`) auto-resolve, the same class of future-behavior-gating
   * timer `wieldedCooldown` et al. are hashed for.
   */
  levelupIdleTicks = 0;
  /**
   * fb015 (§7/§8.1): one random `data/equipment.json` item key per fully
   * cleared TD wave, rolled in `completeWave` (run.ts) on the `drops` RNG
   * stream — a readback list, not sim state, so it is not part of `hashWorld`.
   */
  equipmentFound: string[] = [];
  /**
   * fb023: the six equipment slots -> the item key equipped in each, or null.
   * Seeded from `cfg.equipment` (a flat key list, one per slot) at
   * construction and mutated in place only by the `equip_item` Command
   * (`applyCommand`, run.ts) — never assigned outside `World` after that, the
   * same "cfg is the input, this is the live copy" split `cfg`/`modKeys` vs
   * `mods` already draws.
   */
  equippedEquipment: Record<string, string | null>;
  /**
   * fb023: owned counts snapshotted from `cfg.ownedEquipment` at run start.
   * Equipping never decrements this — like the Hub's `equipItem` (meta/
   * stash.ts), an item is a fixed row owned as a count, not a unique instance
   * consumed by equipping it — so this map is read-only for the run's whole
   * life, just the domain `equip_item` validates against.
   */
  readonly ownedEquipment: Record<string, number>;

  /* ---- stats/telemetry ---- */
  kills = 0;
  leaks = 0;
  wavesCleared = 0;
  /**
   * p7e (§8.4, §10): latches true the first time Act I is sampled fully
   * sealed (`!grid.allGatesReachable()`), feeding the "win with a sealed
   * Core" quest (Paladin). A readback flag like `equipmentFound`, not sim
   * state that gates future behaviour, so it is not part of `hashWorld`.
   */
  everSealed = false;
  /**
   * p7h (§5.5, §8.4): lifetime-across-runs count feeding the "300 lifetime
   * poison kills" Carnivorous Plant unlock quest. A readback counter like
   * `everSealed` above, not part of `hashWorld` — it never gates future tick
   * behaviour, only end-of-run reporting.
   */
  poisonKills = 0;
  /**
   * §8.2 (p7c): "each VS wave cleared -> 1 skill point," counted only for a
   * VS wave that actually ends by its own means — the block timer
   * (`advanceToNextBlock`) or, for the final block, the Warden-Eater kill —
   * never by a defeat cutting it short. Mirrors `wavesCleared`'s "fully
   * cleared" rule for TD waves (§8.1) on the VS side.
   */
  vsWavesCleared = 0;
  towersBuilt = 0;
  towersByKey: Record<string, number> = {};
  damageByWeapon: Record<string, number> = {};
  damageTotal = 0;
  /** fb007 DPS panel: cumulative damage by §3 damage-type key, the same choke point as `damageByWeapon`. */
  damageByType: Record<string, number> = {};
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
  /** fb007: `damageByType` snapshot at the same moment as `damageAtSunder`. */
  damageTypeAtSunder: Record<string, number> = {};
  /** fb007 DPS panel: `damageByWeapon`/`damageByType` snapshot at the current Act I wave's start (`startWave`), so its "this wave" window can be isolated the same way `damageAtSunder` isolates Act II. */
  damageAtWaveStart: Record<string, number> = {};
  damageTypeAtWaveStart: Record<string, number> = {};
  /** Tick `damageAtWaveStart` was taken at, so the panel can compute the window's elapsed seconds. */
  waveStartTick = 0;
  /** Act II damage-by-source through minute 8, for SPEC A5. Null until reached. */
  damageThroughMinute8: Record<string, number> | null = null;
  /**
   * BACKLOG p12a (BALANCE DIRECTION v2 §A): `damageByWeapon`, restricted to
   * damage dealt during the VS half of the run (`huntsWarden` — the same
   * `act2`/`levelup` predicate the Corpse store below negates to mean "TD
   * only", so the two stay in step), summed across every VS block rather
   * than isolated to one.
   * `damageAtSunder` cannot serve this: it is a single snapshot taken at the
   * one Sundering, so on §1.1's interleaved 6-block shape "everything since"
   * still folds in every TD wave that followed it. p12a's own-kit-share
   * target is a VS-only measurement, so it needs a VS-only accumulator.
   */
  damageByWeaponVs: Record<string, number> = {};
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
  /**
   * Set instead of eagerly recomputing when a structure death happens
   * mid-batch (a boss charge's `shatterAlong` can call `removeStructure`
   * dozens of times in one synchronous pass, `code-reviewer` on Q120 ORDER
   * 2) — `updateNav` treats a set flag as an implicit `force` the next time
   * it runs, so a batch of same-tick removals costs one Dijkstra pass, not
   * one per removal. `updateAct2`'s existing unconditional per-tick
   * `w.updateNav()` call consumes it within a tick either way; a caller that
   * needs the field correct before that (e.g. `updateTempWalls`, so its own
   * regression test sees the un-staled field without simulating another
   * tick) calls `updateNav()` once itself after its own removal batch.
   */
  private navDirty = false;

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
    // p9a (architecture rule 2, Q45): the one deliberate exception to "never
    // touch the caller's shared RunConfig object" below — recording *is*
    // stamping the content hash onto the config the caller holds, the first
    // time it is used to create a run, so that same object is already a
    // valid `RecordedRun.config` for a caller to persist. A config already
    // carrying a hash (a real replay attempt) is checked instead of stamped;
    // a mismatch means `/data` changed since this run was recorded, which
    // must fail loudly rather than silently diverge.
    const liveContentHash = contentHash(content);
    if (cfg.contentHash !== undefined && cfg.contentHash !== liveContentHash) {
      throw new Error(
        `RunConfig content hash mismatch: recorded against '${cfg.contentHash}', current /data hashes to '${liveContentHash}'`,
      );
    }
    if (cfg.contentHash === undefined) cfg.contentHash = liveContentHash;
    // A shallow copy: `set_autopick` (and any future cfg-mutating Command)
    // must only ever touch this World's own config, never the caller's
    // shared RunConfig object (e.g. `main.ts`'s `lastCfg`, reused verbatim
    // across Retry).
    this.cfg = { ...cfg };
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
    this.terrainFallback = this.cfg.practice ? false : applyRunTerrain(this.grid, this.gates, cfg.seed);

    this.stats = baseRunStats(content, cfg);
    this.stats.add('modifiers', 'pickupPct', this.mods.pickupMul);
    // fb023: derive the per-slot equipped map from the same flat `cfg.equipment`
    // key list `baseRunStats` just folded into `Stats` above, so the two never
    // disagree about what is equipped.
    this.equippedEquipment = Object.fromEntries(content.equipment.slots.map((slot) => [slot, null]));
    for (const key of cfg.equipment ?? []) {
      const item = content.equipmentByKey.get(key);
      if (item) this.equippedEquipment[item.slot] = key;
    }
    this.ownedEquipment = { ...(cfg.ownedEquipment ?? {}) };
    // SPEC-FINAL §5.5 Vampire Heart: "VS: character +1% lifesteal" is a base
    // effect (no step required) and `leech` is already a generic Warden stat
    // (`damageEnemy`, enemies.ts) gated to VS by its own `huntsWarden` check —
    // so this is the one Core number that rides the existing Stats pipeline
    // rather than `CoreState` (see cores.ts's file header). Added once, here,
    // never again: `coreStep` never changes `vsLifestealPct`.
    const coreDef = content.coreByKey.get(this.coreKey);
    const vsLifesteal = coreDef?.effects?.vsLifestealPct;
    if (vsLifesteal) this.stats.add(`core:${this.coreKey}`, 'leech', vsLifesteal);
    // §5.5 Corpse: "VS: enemies drop +10% EXP" is the same shape — a base
    // effect riding the existing generic `xpGain` stat (`addXp`, progression.ts,
    // already only called from `act2`) rather than a new `CoreState` field.
    const vsXpGain = coreDef?.effects?.vsXpGainPct;
    if (vsXpGain) this.stats.add(`core:${this.coreKey}`, 'xpGain', vsXpGain);
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
    // fb042 (Q146): the retired Ember/relic Constellation nodes' replacement
    // effect — a one-time, non-compounding addition, unlike every `mul` gold
    // stat already live on the tree (`goldFind`).
    this.gold = content.waves.startGold + this.stats.total('startingGold');
    // `p-core-a` left this reading `content.waves.coreHp` unconditionally,
    // which happens to equal Stone Heart's own `baseHp` (500) but silently
    // gave every other Core the wrong base HP the instant one was chosen —
    // `p-core-b` is the first item to give a non-default Core a real numeric
    // effect, so it is also the first to notice. `coreHpBonus` is always 0 at
    // construction (`coreStep` starts at 0); it only matters once Stone
    // Heart's own steps are bought (`upgradeCore`, cores.ts).
    const coreBaseHp = coreDef?.baseHp ?? content.waves.coreHp;
    this.coreMaxHp = Math.max(
      // fb153a (qa-playtester): an HP floor, so it scales with the pool it
      // floors — the same fix `attackStructure`, Blood Tithe and `derive`
      // already carry. Left at a bare 1 the Core kept a whole pre-rescale hit
      // point at the low end of `numberScale`'s own legal range, which made the
      // ⚖ knob non-linear inside its schema bounds.
      content.modifiers.numberScale,
      coreBaseHp + coreHpBonus(content, this.coreKey, this.coreStep) + this.stats.total('coreHp') + this.mods.coreHp,
    );
    this.coreHp = this.coreMaxHp;

    const cc = coreCenter();
    // fb013: an ammo-style Active starts at full charges, read off the class's
    // own `maxCharges` (undefined/1 for every class but Time Lord, for which
    // this is just `1` and the ammo fields go unread — see `tickAmmoRecharge`).
    const startCls = content.classByKey.get(this.cfg.classKey);
    const active1MaxCharges = startCls ? startCls.active1.maxCharges ?? 1 : 1;
    const active2MaxCharges = startCls ? startCls.active2.maxCharges ?? 1 : 1;
    this.warden = {
      x: cc.x - 3,
      y: cc.y,
      hp: this.derived.maxHp,
      dashCooldown: 0,
      dashCharges: this.derived.dashCharges,
      dashIFrames: 0,
      dashTravel: null,
      attackCooldown: 0,
      activeCooldown: 0,
      active1Cooldown: 0,
      active2Cooldown: 0,
      active1Charge: 0,
      active1Charging: false,
      fx: -1,
      fy: 0,
      outOfCombat: 0,
      secondWindUsed: false,
      armorShred: 0,
      leechAccumulator: 0,
      overloadRemaining: 0,
      standStillTimer: 0,
      lastStillX: cc.x - 3,
      lastStillY: cc.y,
      wrathStored: 0,
      clarionRemaining: 0,
      active1Ammo: active1MaxCharges,
      active1AmmoCooldown: 0,
      active2Ammo: active2MaxCharges,
      active2AmmoCooldown: 0,
      dots: [],
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
    if (this.navDirty) {
      force = true;
      this.navDirty = false;
    }
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
    // The same staleness `fireIceWall` (classes.ts) forces a recompute for on
    // placement applies in reverse on removal: `updateNav`'s early-return
    // only refires when the Warden's own tile changes, so a VS-phase wall
    // destroyed by combat or timed out by `updateTempWalls` would otherwise
    // leave `navGround` routing enemies around a tile that is no longer
    // blocked for as long as the Warden stands still (QA on Q120 ORDER 2).
    // Marked dirty rather than recomputed eagerly here — a single event can
    // funnel many removals through this choke point synchronously (a boss
    // charge's `shatterAlong` kills every petrified structure along its
    // path in one pass), and each is its own full Dijkstra rebuild otherwise
    // (code-reviewer, Major, on this same item).
    if (this.huntsWarden) this.navDirty = true;
  }

  structureAt(tx: number, ty: number): Structure | null {
    // b007: Grid.idx is never bounds-checked, so an out-of-grid tx used to
    // alias onto a real tile one row up (idx = ty*GRID_W+tx), letting
    // upgrade/sell silently act on the wrong structure.
    if (!Number.isInteger(tx) || !Number.isInteger(ty) || !this.grid.inBounds(tx, ty)) {
      return null;
    }
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

  /**
   * §4.1 Plaguebringer, p6c: same shape, same reason — Spreading Plague's
   * on-death DoT transfer (`drainPlagueTransfers`, enemies.ts) can itself
   * kill an enemy carrying its own unfinished DoT, and a dense poisoned
   * horde can chain that deep enough to overflow a recursive call stack.
   */
  pendingPlagueTransfers: Enemy[] = [];
  drainingPlagueTransfers = false;

  /**
   * §4.2 Cryomancer, p6d: same shape again — a frozen enemy's death shatter
   * can freeze-kill neighbours that are themselves frozen, and a frost-locked
   * cluster chains that deep enough to overflow a recursive call stack.
   */
  pendingFrostShatters: Enemy[] = [];
  drainingFrostShatters = false;

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
