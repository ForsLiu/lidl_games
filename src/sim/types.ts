/**
 * Sim-wide types. Nothing in /src/sim may touch the DOM, Math.random or Date.now.
 */

export const FIXED_DT = 1 / 60;
export const TICKS_PER_SECOND = 60;

/**
 * b018: a cooldown ticked down tick-by-tick can land on a tiny positive
 * float residual (observed: 2.34e-14) instead of exactly 0, so a strict
 * `> 0` gate silently eats a cast issued exactly `cooldownSeconds` after the
 * last one. Floor anything below this to 0 — far above float noise, far
 * below one tick (1/60s).
 */
export const COOLDOWN_EPS = 1e-6;

export function tickCooldown(current: number, dt: number): number {
  const next = current - dt;
  return next < COOLDOWN_EPS ? 0 : next;
}

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
  /**
   * SPEC-FINAL §6.3, owner feedback `feature-auto-pick-boons`: flips the
   * level-up auto-pick setting mid-run. An ordinary Command (not a Settings
   * field) because it changes which boons a run ends up with, so it has to
   * be in the input log for a replay to reproduce the same picks.
   */
  | { k: 'set_autopick'; on: boolean }
  /**
   * SPEC-FINAL §7, fb023: swap an owned `data/equipment.json` item into (or
   * `item: null` out of) one of the six equipment slots, mid-run. Owned
   * counts (`World.ownedEquipment`) come from `RunConfig.ownedEquipment`, a
   * snapshot of the account's equipment stash taken at run start — the same
   * "fixed input, no live meta reads" rule every other Command already
   * follows — so a slot swap is exactly as replayable from seed + input log
   * as a boon pick. Supersedes the never-wired relic-id-shaped `equip` member
   * this union used to carry, the same class of dead Command surface BACKLOG
   * b015 named: this one has a real handler (`applyCommand`, run.ts) from
   * the start.
   */
  | { k: 'equip_item'; slot: string; item: string | null }
  /**
   * SPEC-FINAL §4 Active1 (Q). `aimX`/`aimY` mirror `class_active2`'s: p6d is
   * the first item with mouse-aimed Active1s (Field Kit's target structure,
   * Chain Surge's first link, Blood Tithe's tithed tower), and an omitted aim
   * still means "self-centered", exactly as every pre-p6d Active1 behaved.
   */
  | { k: 'class_active'; aimX?: number; aimY?: number }
  /**
   * SPEC-FINAL §4: Active2 (E). No-op for a `legacy: true` class, which has
   * only one Active. `aimX`/`aimY` are the mouse-aim point in tile
   * coordinates, meaningful only to a `dash_line`-kind Active2 (p6b, Dash
   * Slash) — omitted or ignored, a `burst_damage`-kind Active2 is
   * self-centered exactly as before.
   */
  | { k: 'class_active2'; aimX?: number; aimY?: number }
  /** `enemyKey` is only read by the `'spawn'` op (fb019, Training Grounds); every other op ignores it. */
  | { k: 'dev'; op: DevOp; amount: number; enemyKey?: string };

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
  | 'fast_forward'
  /** fb019: Training Grounds' spawn-on-demand panel. `amount` is the count, capped and floored in `applyDevCommand`. */
  | 'spawn';

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
  /**
   * SPEC-FINAL §4.2 Necromancer *Death Pact*: this tower is under the pact —
   * it hits harder and faster and bleeds max HP every second until it dies
   * (`updateClassPassives`, classes.ts). A toggle, so it is sim state.
   */
  pactActive: boolean;
  /**
   * Seconds left on a timed attack-speed buff (§4.2 Engineer *Field Kit*'s
   * overclock). Generic rather than Field-Kit-named so a second timed tower
   * buff needs no second field; the magnitude is read from whichever class
   * effect set it (`attackSpeedFor`, towers.ts).
   */
  atkSpdBuffRemaining: number;
  /**
   * §4.2 Bloodlord *Blood Tithe*: this tower paid its HP once and carries the
   * permanent damage bonus. Permanent, unlike `atkSpdBuffRemaining`, and
   * one-way, unlike `pactActive`.
   */
  tithed: boolean;
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
  /**
   * §4.2 Cryomancer: "an enemy hit 5 times while frosted freezes". Counts only
   * hits that arrive while `frostRemaining > 0` and resets both on the freeze
   * it causes and the moment frost lapses (`applyOnHit`'s `frost_track` key,
   * enemies.ts) — otherwise a frost applied minutes later would inherit a
   * count nothing had earned.
   */
  frostHitStacks: number;
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
  /** §9 addendum: seconds the flow field has found no route to the Warden, continuously. */
  bossUnreachableTime: number;
  spawnedAt: number;
  /**
   * §4.2 Paladin *Clarion Taunt* / Animist *Recall Totem* (Q120 ORDER 1):
   * seconds left overriding this enemy's pathing destination onto whichever
   * entity `tauntKind` names, instead of the normal Core/Warden target.
   */
  tauntRemaining: number;
  /** 0 = not taunted, 1 = the Warden (Clarion Taunt), 2 = the Animist totem (Recall Totem). */
  tauntKind: number;
  /**
   * `tauntKind === 2` only: the specific `ClassSummon.id` that applied the
   * tag (qa-playtester finding, Q120 ORDER 1) — a totem re-tags by matching
   * this id, not "any live totem," so an enemy tagged by a totem that gets
   * replaced (a fresh cast before the old one's own lifetime ends) falls back
   * to normal pathing during the tag's decay tail instead of snapping onto
   * the new totem's position, the same as it already does when a totem
   * expires outright with no replacement.
   */
  tauntSourceId: number;
  /**
   * fb013 Time Lord *Time*: 0 unmarked, 1 past, 2 present, 3 future. Advances
   * one stage per hit and persists across hits (no decay) until the future
   * stage is struck again, which executes and resets it to 0.
   */
  timeMarkStage: number;
  /**
   * fb013: the present->future stage's -20% atk/move slow, deferred while
   * this enemy is stunned/frozen (`frozenRemaining > 0`) at the moment it
   * would apply — see `tickTimers`, which applies it the tick the stun ends.
   */
  timeMarkPendingSlow: boolean;
  timeMarkPendingSlowAmount: number;
  timeMarkPendingSlowSeconds: number;
  /**
   * fb013: recent position samples for *Time*'s unmarked->past rewind, oldest
   * first, ~0.25 s apart (`updateTimeLordHistory`, classes.ts) — populated
   * only while the active class's Active1 is `time_mark`, left empty (and
   * free) for every other run.
   */
  posHistory: { x: number; y: number }[];
  /** fb013: seconds until `posHistory`'s next sample; counts down from `POS_HISTORY_SAMPLE_SECONDS`. */
  posHistoryTimer: number;
  /** fb013 Time Lord *Time Lock*: the zone id currently trapping this enemy, 0 = none. */
  timeLockZoneId: number;
  /**
   * Generic enemy attack-speed debuff, mirroring `slowAmount`/`slowRemaining`
   * (which cover move speed only) — fb013 is its first source (*Time*'s
   * present->future -20% atk speed half), but the mechanism is not itself
   * Time-Lord-specific.
   */
  atkSlowAmount: number;
  atkSlowRemaining: number;
}

/**
 * fb013 Time Lord *Time Lock*: a single no-exit zone (one at a time — a
 * recast detonates and replaces it, `fireTimeLock`, classes.ts). Enemies
 * inside are clamped to its radius and immune to *Time*'s rewind-pull
 * (`Enemy.timeLockZoneId` tags membership) until it expires.
 */
export interface TimeLockZone {
  id: number;
  x: number;
  y: number;
  radius: number;
  remaining: number;
  /** Seconds the entry DoT installed on a newly-trapped enemy is spread over. */
  dotSeconds: number;
  /** That DoT's dps. */
  dps: number;
}

/**
 * SPEC-FINAL §4.2's three target-conditional tower passives (p6d): Stormcaller
 * ("all towers deal +10% of their damage as extra Electric"), Pyro ("+10%
 * damage vs Burning enemies") and Cryomancer ("+10% damage vs frosted/frozen").
 * Bundled into one struct because all three are read at the same place — the
 * one `dealHit` every tower attack shape funnels through — and a projectile
 * has to carry them from the tower that fired it to wherever it lands.
 */
export interface TowerClassBonus {
  extraElectricPct: number;
  vsBurningPct: number;
  vsChilledPct: number;
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
  /**
   * The §4.2 tower-passive riders the firing tower carried (p6d), or null.
   * Not hashed, for the same reason `source`/`onHit`/`ratio` are not: it is a
   * copy of a value derived from `RunConfig.classKey`, which the hash already
   * covers, and it never changes after the shot is spawned.
   */
  towerBonus: TowerClassBonus | null;
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
  /** SPEC-FINAL §4.2 Stormcaller *Overload*: seconds left of the +2-jump/double-wire-rate window. */
  overloadRemaining: number;
  /**
   * §4.2 Paladin *Guardian Stance*: seconds the Warden has held still, and the
   * position that "still" is measured against. Compared each tick rather than
   * derived from `input.mx/my` so a Warden walled in against terrain (input
   * held, no movement) still counts as standing still, which is what the
   * clause describes.
   */
  standStillTimer: number;
  lastStillX: number;
  lastStillY: number;
  /** §4.2 Paladin: banked Wrath, released by *Judgement*. */
  wrathStored: number;
  /** §4.2 Paladin *Clarion Taunt*: seconds left of the window that stores taken damage too. */
  clarionRemaining: number;
  /**
   * fb013: an ammo-style multi-charge gate for a `maxCharges`-authored
   * Active — distinct from `active1Charge`/`active1Charging` (`charge_nova`'s
   * hold-to-charge-power). `tickAmmoRecharge` (classes.ts) drives both pairs;
   * every class but Time Lord leaves `maxCharges` unset (`?? 1`), for which
   * these fields are never read, so existing single-cooldown behaviour is
   * unchanged.
   */
  active1Ammo: number;
  active1AmmoCooldown: number;
  active2Ammo: number;
  active2AmmoCooldown: number;
  /**
   * fb013 Time Lord *Time Flow*: damage the passive converted into a DoT
   * instead of applying at once, ticked by `tickWardenDots` (run.ts) via a
   * recursive `damageWarden(..., { dot: true })` call per stack. Independent
   * stacks, like `Enemy.dots` — a second hit within 4 s adds a second entry
   * rather than refreshing the first.
   */
  dots: { dps: number; remaining: number }[];
}

/**
 * SPEC-FINAL §4.2's summoned combatants — Engineer's Pop Turret, Necromancer's
 * skeletons and Bone Pylons, Animist's manifested spirit and Recall Totem.
 * One struct rather than five: every one of them is a fixed point that either
 * attacks on its own cadence or projects an aura, and `kind` is only ever read
 * for the per-kind concurrency cap each ability authors.
 */
export interface ClassSummon {
  id: number;
  x: number;
  y: number;
  /** Damage per second; one attack deals `dps * interval`. */
  dps: number;
  range: number;
  interval: number;
  /** Splash radius around the target, 0 for single-target. */
  aoe: number;
  attackCooldown: number;
  remaining: number;
  /** A totem: projects `auraAtkSpdMul` within `auraRadius` and never attacks. */
  isAura?: boolean;
  auraAtkSpdMul?: number;
  auraRadius?: number;
  /** Recall Totem only (Q120 ORDER 1): its per-tick taunt re-tag's decay window. */
  auraTauntTickSeconds?: number;
  kind: string;
}

/** §4.2 Necromancer: "kills leave corpses 6 s" — what *Raise* consumes. */
export interface Corpse {
  id: number;
  x: number;
  y: number;
  remaining: number;
}

/* ------------------------------------------------------------- level-ups */

/** SPEC-FINAL §6.3's three card families: a stat boon, a Type Mastery card
 * (one per built tower type) and a per-class skill card. */
export type OfferKind = 'boon' | 'type_mastery' | 'skill_card';

export interface Offer {
  kind: OfferKind;
  key: string;
  name: string;
  desc: string;
  /** Resulting level/rank if taken. */
  toLevel: number;
  /** `type_mastery` only: which built tower type this card boosts. */
  towerKey?: string;
}

/* ------------------------------------------------------------- run config */

export interface MetaState {
  /** Allocated Constellation node ids, always including `0` (the start node). */
  allocated: number[];
  /**
   * SPEC-FINAL §7, fb015: owned counts of each `data/equipment.json` item key.
   * Equipment items are fixed rows, not procedurally rolled instances, so
   * "duplicates allowed" (§8.1) is just a higher count rather than a second
   * stash entry with its own id.
   */
  equipmentStash: Record<string, number>;
  /** §7's six fixed slots (weapon/armor/shoes/ring/necklace/bracelet) -> the equipped item key, or null. */
  equippedEquipment: Record<string, string | null>;
  unlockedClasses: string[];
  /** SPEC-FINAL §5.5: mirrors `unlockedClasses`. Defaults to Stone Heart only. */
  unlockedCores: string[];
  highestTier: number;
  questProgress: Record<string, number>;
  completedQuests: string[];
  /**
   * fb012: the level-up auto-pick default a new run starts with. Lives on the
   * save profile (not `Settings`, which is presentation-only) because it feeds
   * `RunConfig.autoPickLevelUps` — real sim behavior, not a display choice.
   */
  autoPickLevelUps: boolean;
  /**
   * §8.2/§8.3 (p7c, p7d): the tree's only currency — 1 per VS wave fully
   * cleared, granted at run end, plus a one-time 100:1 conversion of any
   * Ember a save carried from before p7d retired that pipeline. Spent by
   * `allocate` (implicitly, via `pointsAvailable`'s subtraction) and by
   * `refund`'s per-node respec cost.
   */
  skillPoints: number;
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
  /** SPEC-FINAL §7, fb015: equipment item keys equipped for this run (one per slot, at most 6). */
  equipment?: string[];
  /**
   * fb023: a snapshot of `MetaState.equipmentStash` taken when the run starts
   * — every item key the account owns, with its count. `equip_item` (mid-run
   * slot swap) validates against this rather than the live account, so a run
   * replays identically from seed + input log regardless of what the Hub
   * shows before or after it (the meta account cannot change while a run is
   * in progress, so this snapshot never actually goes stale, but a Command
   * reading it directly rather than reaching into `Hub`/`MetaState` keeps the
   * sim/meta boundary CLAUDE.md's architecture rules draw).
   */
  ownedEquipment?: Record<string, number>;
  /**
   * Bot policy name, headless only — never set by the real UI (`src/ui/
   * hub.ts`'s `beginRun`, `src/ui/main.ts`'s `startRun`). Also a genuine sim
   * behavior switch since fb045 (QUESTIONS Q151 OVERRIDE): `progression.ts`'s
   * `tickLevelupIdle` only auto-resolves an idle `levelup` offer when this is
   * defined, so an undefined `policy` means "wait indefinitely" there.
   */
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
   * a run that used one banks nothing to the meta account.
   */
  practice?: boolean;
  /**
   * SPEC-FINAL §6.3, owner feedback `feature-auto-pick-boons`: when true, a
   * level-up resolves itself the instant it is rolled instead of pausing the
   * run for input, preferring the highest-rank owned boon offered, else the
   * first offered card. Sim-affecting (unlike `Settings`), so it lives here
   * and can also be flipped mid-run via the `set_autopick` Command, keeping
   * every pick, manual or automatic, replay-safe.
   */
  autoPickLevelUps?: boolean;
  /**
   * `p9a` (CLAUDE.md architecture rule 2, Q45): the `/data` content hash this
   * run was created against, per `contentHash()` (`src/sim/content.ts`).
   * Absent on a fresh config — `World`'s constructor stamps it onto this
   * object in place the first time it is used to create a run, so the same
   * `RunConfig` a caller then persists alongside its input log (a
   * `RecordedRun`) already carries what it was recorded against. A later
   * replay passing a config that already carries a hash disagreeing with the
   * live `/data` throws immediately instead of silently diverging.
   */
  contentHash?: string;
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
  /** p7c (§8.2): VS waves that ended by their own means (timer or the final boss kill), never by a defeat. */
  vsWavesCleared: number;
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
  /** fb007: cumulative damage by §3 damage-type key (`data/damagetypes.json`). */
  damageByType: Record<string, number>;
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
  /** p7a (§6.3): the other two pool families, alongside `boons` (stat boons). */
  typeMastery: Record<string, number>;
  skillCards: Record<string, number>;
  /** fb015 (§8.1): equipment items rolled this run, one per fully cleared TD wave. */
  equipmentFound: number;
  bossKilled: boolean;
  bossKillSeconds: number;
  endHash: string;
  /** True if any practice-tool command was used; such a run banks nothing. */
  practiceUsed: boolean;
  /** p7e (§10): true if Act I was ever sampled fully sealed this run. */
  sealed: boolean;
  /** Wall time for the run loop, filled in by the headless CLI. */
  simMs?: number;
}
