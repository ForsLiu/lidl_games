/**
 * Sim-wide types. Nothing in /src/sim may touch the DOM, Math.random or Date.now.
 */

export const FIXED_DT = 1 / 60;
export const TICKS_PER_SECOND = 60;

export type Phase = 'act1_build' | 'act1_wave' | 'act2' | 'levelup' | 'results';

export type RunOutcome = 'running' | 'victory' | 'defeat_core' | 'defeat_warden';

/* ------------------------------------------------------------------ input */

export type Command =
  | { k: 'build'; tower: number; tx: number; ty: number }
  | { k: 'upgrade'; tx: number; ty: number }
  | { k: 'sell'; tx: number; ty: number }
  /** SPEC-FINAL §5.5: buys the Core's next upgrade step (`upgradeCore`, cores.ts). No tx/ty — the Core has one fixed tile. */
  | { k: 'upgrade_core' }
  | { k: 'call' }
  | { k: 'pick'; index: number }
  | { k: 'reroll' }
  | { k: 'equip'; relic: number }
  | { k: 'class_active' }
  /**
   * SPEC-FINAL §4: Active2 (E). No-op for a `legacy: true` class, which has
   * only one Active. `aimX`/`aimY` are the mouse-aim point in tile
   * coordinates, meaningful only to a `dash_line`-kind Active2 (p6b, Dash
   * Slash) — omitted or ignored, a `burst_damage`-kind Active2 is
   * self-centered exactly as before.
   */
  | { k: 'class_active2'; aimX?: number; aimY?: number }
  | { k: 'dev'; op: DevOp; amount: number };

/**
 * Practice-tool actions (SPEC has none; see QUESTIONS.md). They are Commands
 * rather than direct World edits so a practice run still replays exactly from
 * seed + input log, and so a run that used one can be flagged.
 */
export type DevOp =
  | 'kill_all'
  | 'gold'
  | 'xp'
  | 'heal'
  | 'invuln'
  | 'god'
  | 'skip_wave'
  | 'summon_boss'
  | 'fast_forward';

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
  /**
   * SPEC-FINAL §4.1 (p6b): true while a charge-kind Active1 (e.g. Circle
   * Slash) is held. Continuous like `dash`/`attack`, not a Command, because
   * the fire event is time-shifted to release — a discrete keydown Command
   * cannot carry a hold duration (`tickClassCharge`, classes.ts).
   */
  active1Held: boolean;
  cmds: Command[];
}

export function emptyInput(): TickInput {
  return { mx: 0, my: 0, dash: false, attack: false, aimX: 0, aimY: 0, active1Held: false, cmds: [] };
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
  /**
   * SPEC-V3 §4: gold actually paid for this structure — build cost plus every
   * upgrade step — because sell refunds 50% of *total spent*, and recomputing
   * that from the def would price the refund at whatever `towerCostMul` says
   * today rather than what the player was charged. Sim state, so it is hashed.
   */
  spent: number;
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

/**
 * One application of a SPEC-V3 §3 damage-over-time type. Bleeding, Poison,
 * Toxic and Burning all live in one per-enemy list: the taxonomy row decides
 * how many stacks a type may hold and what a further application does to them.
 */
export interface DotStack {
  /** Damage-type key from data/damagetypes.json. */
  type: string;
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
  /** SPEC-V3 §2 armor points; percent reduction of normal damage taken. */
  armor: number;
  /** Accumulated Burning shred, subtracted from `armor` (SPEC-V3 §3). */
  armorShred: number;
  slowRemaining: number;
  slowAmount: number;
  /** SPEC-V3 §3 frost: −30% attack speed and move speed while this runs. */
  frostRemaining: number;
  /** SPEC-V3 §3 frozen: cannot move, and takes +30% damage, while this runs. */
  frozenRemaining: number;
  /** Every live SPEC-V3 §3 DoT application on this enemy (Bleeding..Burning). */
  dots: DotStack[];
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
  /** SPEC-V3 §3 types/statuses this shot applies on impact (tower `onHit`). */
  onHit: readonly string[];
  /** SPEC-V3 §3 split this shot's damage lands as, or null for all Normal. */
  ratio: Readonly<Record<string, number>> | null;
  /** §5.2 Mortar @3: this shell leaves a ground-fire patch where it detonates. */
  groundBurn: boolean;
  /** Seconds the patch above burns for — meaningful only when `groundBurn` is true. */
  groundBurnSeconds: number;
  /**
   * The structure that fired this shot, so a hit lands `damageDealt` on the
   * instance that owns it — `source` is only the tower's content key, shared
   * by every tower of that type. Not hashed: purely an attribution readback,
   * the same reasoning that excludes `damageDealt` itself.
   */
  structureId: number;
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
  /** SPEC-V2 §2 class Active skill (`legacy: true` classes only); ticks down in `updateWarden`. */
  activeCooldown: number;
  /** SPEC-FINAL §4 Active1 (Q) / Active2 (E), `legacy: false` classes only; tick down in `updateWarden`. */
  active1Cooldown: number;
  active2Cooldown: number;
  /**
   * SPEC-FINAL §4.1 (p6b): a `charge_nova`-kind Active1 (Circle Slash) held
   * seconds, and whether one is currently being held — see
   * `tickClassCharge` (classes.ts). Both stay at their zero/false default
   * for every other kind and every `legacy: true` class.
   */
  active1Charge: number;
  active1Charging: boolean;
  /** Last non-zero movement direction; Flame Cone fires along it. */
  fx: number;
  fy: number;
  outOfCombat: number;
  secondWindUsed: boolean;
  /** SPEC-V3 §3: Burning shreds armor. Subtracted from derived armor. */
  armorShred: number;
  leechAccumulator: number;
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

export type OfferKind = 'boon';

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
  unlockedClasses: string[];
  /** SPEC-FINAL §5.5: mirrors `unlockedClasses`. Defaults to Stone Heart only. */
  unlockedCores: string[];
  highestTier: number;
  questProgress: Record<string, number>;
  completedQuests: string[];
  nextRelicId: number;
}

export interface RunConfig {
  seed: number;
  classKey: string;
  /**
   * SPEC-FINAL §5.5: the Core chosen at run start. Defaults to `'stone_heart'`
   * when absent (an omitted `core` is the pre-Cores config shape, not a
   * distinct choice) — every reader (`hashWorld`, `buildReport`, the World
   * constructor) applies that same default rather than leaving it undefined,
   * so two configs that differ only by an explicit vs. omitted default core
   * hash identically, as they should.
   */
  core?: string;
  tier: number;
  modifiers: string[];
  /** Allocated Constellation node ids. */
  allocated: number[];
  /** Relics equipped for this run. */
  relics: Relic[];
  /** Bot policy name, headless only. */
  policy?: string;
  /**
   * SPEC-FINAL §1.1: number of TD-block/VS-wave pairs the run plays before
   * the Warden-Eater ends it. Defaults to 6 (18 TD + 6 VS, the shipped run
   * shape — 3 TD waves per block, `data/waves.json`'s `tdWavesPerVsWave`).
   * `World.cycle` counts these 1-based as the run progresses; a test may pass
   * a smaller number for a quicker single- or few-block run (e.g. `1` is 3 TD
   * waves then one boss-gated VS wave). p3d deleted the V2 Day/Dusk/Night/Dawn
   * phase machine and its Rekindle mechanic that this field used to drive —
   * every block transition is now immediate (see `finishSundering`/
   * `advanceToNextBlock` in `sundering.ts`) — but the block-count concept
   * itself survives: `cycleEliteMul`'s per-cycle heat (§16, deferred to p3e)
   * still reads `World.cycle`/`totalCycles` (Q108).
   */
  cycles?: number;
  /**
   * Harness switch for SPEC A6: delete every petrified structure at the
   * Sundering so a build can be measured with and without its terrain.
   * Never set by normal play.
   */
  stripTerrain?: boolean;
  /**
   * Enables the in-run practice tool. Dev commands are ignored without it, and
   * a run that used one banks no Ember and no relics.
   */
  practice?: boolean;
}

/* --------------------------------------------------------------- reporting */

export interface RunReport {
  seed: number;
  policy: string;
  classKey: string;
  core: string;
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
  boons: Record<string, number>;
  relicsFound: number;
  ember: number;
  bossKilled: boolean;
  bossKillSeconds: number;
  endHash: string;
  /** True if any practice-tool command was used; such a run banks nothing. */
  practiceUsed: boolean;
  /** Wall time for the run loop, filled in by the headless CLI. */
  simMs?: number;
}
