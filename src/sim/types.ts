/**
 * Sim-wide types. Nothing in /src/sim may touch the DOM, Math.random or Date.now.
 */

export const FIXED_DT = 1 / 60;
export const TICKS_PER_SECOND = 60;

export type Phase =
  | 'act1_build'
  | 'act1_wave'
  | 'dusk'
  | 'soulpick'
  | 'act2'
  | 'levelup'
  | 'results';

export type RunOutcome = 'running' | 'victory' | 'defeat_core' | 'defeat_warden';

/* ------------------------------------------------------------------ input */

export type Command =
  | { k: 'build'; tower: number; tx: number; ty: number }
  | { k: 'upgrade'; tx: number; ty: number }
  | { k: 'sell'; tx: number; ty: number }
  | { k: 'call' }
  | { k: 'souls'; keys: string[] }
  | { k: 'pick'; index: number }
  | { k: 'reroll' }
  | { k: 'equip'; relic: number };

export interface TickInput {
  /** Movement axis, quantized to -1 | 0 | 1 so replays are exact. */
  mx: number;
  my: number;
  dash: boolean;
  /** Act I manual attack. */
  attack: boolean;
  /** Aim point in tile coords (used by the manual attack only). */
  aimX: number;
  aimY: number;
  cmds: Command[];
}

export function emptyInput(): TickInput {
  return { mx: 0, my: 0, dash: false, attack: false, aimX: 0, aimY: 0, cmds: [] };
}

/** A run is fully described by seed + config + this sparse log (SPEC 9.2). */
export interface InputLogEntry {
  tick: number;
  input: TickInput;
}

/* --------------------------------------------------------------- entities */

export interface Structure {
  id: number;
  towerId: number;
  tier: number;
  tx: number;
  ty: number;
  hp: number;
  maxHp: number;
  cooldown: number;
  dead: boolean;
  /** Post-Sundering state. */
  petrified: boolean;
  /** Gem Bloom bookkeeping (Harvest Sprout terrain). */
  gemTimer: number;
  gemsWaiting: number;
  /** Conductive spire links (structure ids). */
  links: number[];
  /** Accumulated damage attribution, Act I. */
  damageDealt: number;
}

export interface PoisonStack {
  remaining: number;
  dps: number;
  /** Weapon/tower that applied it, so A5 can attribute ailment damage. */
  source: string;
}

export interface Enemy {
  id: number;
  defId: number;
  /**
   * The enemy's definition. Cached by reference because the per-tick loops
   * would otherwise do tens of millions of Map lookups over a full run.
   * Typed loosely here so types.ts stays free of a content import.
   */
  def: { readonly id: number; readonly key: string };
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  /** Base movement speed before slow/buff multipliers. */
  speed: number;
  radius: number;
  gate: number;
  elite: boolean;
  boss: boolean;
  flying: boolean;
  /** Facing, used by Shellback front-shield and charger dashes. */
  fx: number;
  fy: number;
  slowRemaining: number;
  slowAmount: number;
  burnRemaining: number;
  burnDps: number;
  burnSource: string;
  poison: PoisonStack[];
  buffRemaining: number;
  buffSpeed: number;
  buffPower: number;
  attackCooldown: number;
  /** Wraith phasing / Burrower tunnelling. */
  phaseRemaining: number;
  phaseCooldown: number;
  ghosting: boolean;
  /** Burrowed: underground, so nothing can target or hit it (SPEC 6 #12). */
  submerged: boolean;
  /** Cached trait bitmask (see enemies.ts TRAIT), so hot loops skip string work. */
  flags: number;
  /** Last computed crowd-repulsion vector; refreshed on a stagger. */
  sepX: number;
  sepY: number;
  /** Charger state machine: 0 idle, 1 windup, 2 dashing. */
  chargeState: number;
  chargeTimer: number;
  chargeCooldown: number;
  chargeVx: number;
  chargeVy: number;
  /** Ability timers (stomp, heal pulse, trail). */
  abilityTimer: number;
  /** Structure currently being chewed on, 0 = none. */
  attackingStructure: number;
  dead: boolean;
  /** Boss phase index, 0-based. */
  bossPhase: number;
  bossTimer: number;
  bossAction: number;
  spawnedAt: number;
}

export type ProjectileKind = 'bolt' | 'shell' | 'shot';

export interface Projectile {
  id: number;
  kind: ProjectileKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  tx: number;
  ty: number;
  damage: number;
  aoe: number;
  pierceLeft: number;
  hitIds: number[];
  life: number;
  source: string;
  burnDps: number;
  burnDuration: number;
  slow: number;
  slowDuration: number;
  dead: boolean;
}

export interface Gem {
  id: number;
  x: number;
  y: number;
  value: number;
  vx: number;
  vy: number;
  /** Seconds before an uncollected gem fades. */
  life: number;
  dead: boolean;
}

export interface GroundArea {
  id: number;
  x: number;
  y: number;
  radius: number;
  dps: number;
  remaining: number;
  /** 'poison' | 'burn' */
  type: string;
  source: string;
  /** Damage-over-time tick accumulator. */
  acc: number;
  dead: boolean;
}

export interface Warden {
  x: number;
  y: number;
  hp: number;
  dashCooldown: number;
  dashCharges: number;
  dashIFrames: number;
  attackCooldown: number;
  /** Last non-zero movement direction; Flame Cone fires along it. */
  fx: number;
  fy: number;
  outOfCombat: number;
  secondWindUsed: boolean;
  leechAccumulator: number;
}

/* ---------------------------------------------------------------- weapons */

export interface WeaponState {
  key: string;
  level: number;
  /** Act I inheritance bonus, e.g. 0.24 for +24% (SPEC 4.1). */
  damageBonus: number;
  cooldown: number;
  awakened: boolean;
  /** Phoenix Ring orbit phase. */
  ringPhase: number;
  ringCooldown: number;
}

/* ----------------------------------------------------------------- relics */

export interface RelicAffix {
  key: string;
  stat: string;
  value: number;
}

export interface Relic {
  id: number;
  slot: string;
  rarity: string;
  name: string;
  affixes: RelicAffix[];
}

/* ------------------------------------------------------------- level-ups */

export type OfferKind = 'weapon' | 'boon' | 'awakening';

export interface Offer {
  kind: OfferKind;
  key: string;
  name: string;
  desc: string;
  /** Resulting level/rank if taken. */
  toLevel: number;
}

/* ------------------------------------------------------------- run config */

export interface MetaState {
  accountLevel: number;
  ember: number;
  allocated: number[];
  stash: Relic[];
  equipped: { sigil: number | null; plate: number | null; charm: number | null };
  orbs: { whetting: number; turning: number; ascension: number };
  unlockedClasses: string[];
  highestTier: number;
  questProgress: Record<string, number>;
  completedQuests: string[];
  nextRelicId: number;
}

export interface RunConfig {
  seed: number;
  classKey: string;
  tier: number;
  modifiers: string[];
  /** Allocated Constellation node ids. */
  allocated: number[];
  /** Relics equipped for this run. */
  relics: Relic[];
  /** Bot policy name, headless only. */
  policy?: string;
  /**
   * Harness switch for SPEC A6: delete every petrified structure at the
   * Sundering so a build can be measured with and without its terrain.
   * Never set by normal play.
   */
  stripTerrain?: boolean;
}

/* --------------------------------------------------------------- reporting */

export interface RunReport {
  seed: number;
  policy: string;
  classKey: string;
  tier: number;
  modifiers: string[];
  outcome: RunOutcome;
  ticks: number;
  totalSeconds: number;
  act1Seconds: number;
  act2Seconds: number;
  wavesCleared: number;
  coreHp: number;
  coreMaxHp: number;
  goldEarned: number;
  goldSpent: number;
  goldLeft: number;
  towersBuilt: number;
  towersByKey: Record<string, number>;
  survivalSeconds: number;
  level: number;
  kills: number;
  leaks: number;
  damageByWeapon: Record<string, number>;
  damageTotal: number;
  /** Per-wave Act I telemetry, indexed by wave number (1-based). */
  spawnedByWave: number[];
  leaksByWave: number[];
  goldEarnedByWave: number[];
  /** Act II damage by source through minute 8, for SPEC A5 (null if not reached). */
  damageThroughMinute8: Record<string, number> | null;
  /** Largest single-weapon share of that window, 0-1. */
  topWeaponShareMinute8: number;
  topWeaponMinute8: string;
  weapons: { key: string; level: number; damageBonus: number; awakened: boolean }[];
  boons: Record<string, number>;
  relicsFound: number;
  orbsFound: number;
  ember: number;
  bossKilled: boolean;
  bossKillSeconds: number;
  endHash: string;
  /** Wall time for the run loop, filled in by the headless CLI. */
  simMs?: number;
}
