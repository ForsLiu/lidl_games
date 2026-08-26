/**
 * Content loading + schema validation (SPEC 9.3).
 * All tuning lives in /data; nothing here invents numbers.
 */
import { z } from 'zod';

import towersRaw from '../../data/towers.json';
import enemiesRaw from '../../data/enemies.json';
import wavesRaw from '../../data/waves.json';
import weaponsRaw from '../../data/weapons.json';
import spawnsRaw from '../../data/spawns.json';
import boonsRaw from '../../data/boons.json';
import relicsRaw from '../../data/relics.json';
import treeRaw from '../../data/tree.json';
import modifiersRaw from '../../data/modifiers.json';
import classesRaw from '../../data/classes.json';
import affinityRaw from '../../data/affinity.json';
import questsRaw from '../../data/quests.json';
import devRaw from '../../data/dev.json';
import wardenRaw from '../../data/warden.json';
import damageTypesRaw from '../../data/damagetypes.json';

const num = z.number();
const str = z.string();

/* ------------------------------------------------------------------ towers */

const BurnSchema = z.object({ dps: num, duration: num });
const PoisonSchema = z.object({ dps: num, duration: num, maxStacks: num });

const TowerAttackSchema = z
  .object({
    kind: z.enum(['single', 'pierce', 'cone', 'aura', 'chain', 'lob', 'poison']),
    damage: num,
    interval: num,
    range: num,
    minRange: num.optional(),
    pierce: num.optional(),
    aoe: num.optional(),
    chains: num.optional(),
    chainRange: num.optional(),
    coneHalfAngle: num.optional(),
    slow: num.optional(),
    slowDuration: num.optional(),
    projectileSpeed: num.optional(),
    burn: BurnSchema.optional(),
    poison: PoisonSchema.optional(),
    /**
     * SPEC-V3 §3 damage types and statuses every hit of this attack also
     * applies, by key. Checked against the taxonomy at load.
     */
    onHit: z.array(str).optional(),
  })
  .nullable();

const TerrainSchema = z.object({
  kind: str,
  blocks: z.boolean(),
  armorPerWall: num.optional(),
  armorCap: num.optional(),
  auraRadius: num.optional(),
  auraDps: num.optional(),
  auraType: z.enum(['burn', 'poison']).optional(),
  slow: num.optional(),
  linkRange: num.optional(),
  maxLinks: num.optional(),
  beamDps: num.optional(),
  wardenRadius: num.optional(),
  wardenAttackSpeed: num.optional(),
  gemInterval: num.optional(),
  gemValue: num.optional(),
  gemMax: num.optional(),
});

const TowerSchema = z.object({
  id: num,
  key: str,
  name: str,
  cost: num,
  maxTier: num,
  hp: num,
  blocks: z.boolean(),
  attack: TowerAttackSchema,
  buffAura: z.object({ radius: num, attackSpeed: num }).optional(),
  economy: z.object({ goldPerWavePerTier: num }).optional(),
  passive: z.object({ attackSpeedPer: num, cap: num }).optional(),
  soul: str.nullable(),
  terrain: TerrainSchema,
  desc: str,
});

const TowersFileSchema = z.object({
  tierDamageMul: num,
  tierRangeMul: num,
  upgradeCostT2: num,
  upgradeCostT3: num,
  sellRefund: num,
  duskSellRefund: num,
  buildRange: num,
  /** SPEC-V2 §1: Rekindle at Dawn costs this fraction of base build cost. */
  rekindleCostMul: num,
  towers: z.array(TowerSchema),
});

/* ----------------------------------------------------------------- enemies */

export const EnemySchema = z.object({
  id: num,
  key: str,
  name: str,
  grade: z.enum(['F', 'S', 'E', 'B']),
  hp: num,
  speed: num,
  coreDamage: num,
  bounty: num,
  gem: num,
  radius: num,
  traits: z.array(str),
  packSize: num.optional(),
  /** SPEC-V3 §2 armor points; percent reduction of normal damage. */
  armor: num.optional(),
  flatReduction: num.optional(),
  attackRange: num.optional(),
  attackDamage: num.optional(),
  attackInterval: num.optional(),
  healRate: num.optional(),
  healRadius: num.optional(),
  splitInto: num.optional(),
  splitCount: num.optional(),
  frontReduction: num.optional(),
  explodeRadius: num.optional(),
  explodeDamage: num.optional(),
  buffRadius: num.optional(),
  buffSpeed: num.optional(),
  buffPower: num.optional(),
  chargeSpeed: num.optional(),
  chargeWindup: num.optional(),
  chargeDuration: num.optional(),
  chargeCooldown: num.optional(),
  trailDps: num.optional(),
  trailRadius: num.optional(),
  phaseDuration: num.optional(),
  phasePeriod: num.optional(),
  stompRadius: num.optional(),
  stompDamage: num.optional(),
  stompInterval: num.optional(),
  structureDamageMul: num.optional(),
});

const EnemiesFileSchema = z.object({ enemies: z.array(EnemySchema) });

/* ------------------------------------------------------------------- waves */

const WaveGroupSchema = z.object({
  enemy: str,
  perGate: num.optional(),
  total: num.optional(),
});

const WavesFileSchema = z.object({
  hpScalePerWave: num,
  buildPhaseSeconds: num,
  earlyCallGoldPerSecond: num,
  waveClearBase: num,
  waveClearPerWave: num,
  startGold: num,
  coreHp: num,
  spawnIntervalSeconds: num,
  enemyStructureDpsFactor: num,
  waves: z.array(z.object({ wave: num, groups: z.array(WaveGroupSchema) })),
  /** SPEC-V2 §1: last wave (1-based, global index) of each Day cycle. */
  waveEndByCycle: z.array(num),
  /** Fixed Night length for every cycle but the last, which ends by boss kill. */
  nightSecondsByCycle: z.array(num),
  /** Elite spawn-count multiplier keyed by cycle number (as a string), e.g. cycle 2's "Elite pressure x2". */
  eliteMulByCycle: z.record(num).optional(),
  /** SPEC-V2 §1: added to a Night's minute-of-warmup per prior cycle, so later Nights start hotter. */
  nightMinuteOffsetPerCycle: num.optional(),
});

/* ----------------------------------------------------------------- weapons */

const WeaponLevelSchema = z
  .object({
    damage: num.optional(),
    dps: num.optional(),
    interval: num.optional(),
    range: num.optional(),
    targets: num.optional(),
    bolts: num.optional(),
    width: num.optional(),
    halfAngle: num.optional(),
    burnDps: num.optional(),
    burnDuration: num.optional(),
    radius: num.optional(),
    slow: num.optional(),
    slowDuration: num.optional(),
    chains: num.optional(),
    chainRange: num.optional(),
    count: num.optional(),
    duration: num.optional(),
  })
  .passthrough();

const WeaponSchema = z.object({
  key: str,
  name: str,
  source: str,
  kind: z.enum(['single', 'pierce', 'cone', 'nova', 'chain', 'lob', 'trail']),
  slotless: z.boolean().optional(),
  desc: str,
  levels: z.array(WeaponLevelSchema).length(6),
});

const AwakeningSchema = z.object({
  key: str,
  name: str,
  weapon: str,
  boon: str,
  boonRank: num,
  desc: str,
  effect: z.record(num),
});

const WeaponsFileSchema = z.object({
  maxLevel: num,
  slots: num,
  inheritDamagePerExtraTower: num,
  inheritDamageCap: num,
  /** Each successive enemy a pierce shot passes takes this much less. */
  pierceFalloff: num,
  pierceFalloffFloor: num,
  /** Blast damage stays full for this many targets, then decays. */
  aoeFullTargets: num,
  aoeFalloff: num,
  aoeFalloffFloor: num,
  weapons: z.array(WeaponSchema),
  awakenings: z.array(AwakeningSchema),
});

/* ------------------------------------------------------------------ spawns */

const SpawnsFileSchema = z.object({
  budgetBase: num,
  budgetGrowthPerMinute: num,
  warmupSeconds: num,
  warmupStart: num,
  directorIntervalSeconds: num,
  aliveCap: num,
  hpOverlay: num,
  speedOverlay: num,
  hpScalePerMinute: num,
  /** Act II HP relative to the end of Act I; see enemies.ts. */
  actIICarry: num,
  eliteIntervalSeconds: num,
  riftTimes: z.array(num),
  riftBudgetMultiplier: num,
  /** SPEC-V2 §1 leak coupling: a Day leak adds this many x its director cost to that Night's budget. */
  leakBudgetMultiplier: num,
  bossTimeSeconds: num,
  spawnDistance: num,
  /** How close a Burrower gets before it surfaces. */
  burrowSurfaceDistance: num,
  contactInterval: num,
  contactPadding: num,
  gemLifetimeSeconds: num,
  gemCap: num,
  costs: z.record(num),
  weightsByMinute: z.array(z.object({ minute: num, weights: z.record(num) })),
  eliteWeights: z.record(num),
});

/* ------------------------------------------------------------------- boons */

const BoonSchema = z.object({
  key: str,
  name: str,
  maxRank: num,
  stat: str,
  perRank: num,
  desc: str,
});

const BoonsFileSchema = z.object({ rerollsPerLevel: num, boons: z.array(BoonSchema) });

/* ------------------------------------------------------------------ relics */

const AffixSchema = z.object({
  key: str,
  name: str,
  stat: str,
  min: num,
  max: num,
  pct: z.boolean(),
});

const RelicsFileSchema = z.object({
  stashSlots: num,
  slots: z.array(str),
  implicits: z.record(z.object({ stat: str, value: num })),
  rarities: z.array(
    z.object({ key: str, name: str, minAffixes: num, maxAffixes: num, weight: num }),
  ),
  luckRarityShift: num,
  affixes: z.array(AffixSchema),
  dropRates: z.record(num),
});

/* -------------------------------------------------------------------- tree */

const TreeNodeSchema = z.object({
  id: num,
  branch: str,
  kind: z.enum(['start', 'small', 'notable', 'keystone']),
  key: str.optional(),
  name: str,
  desc: str,
  stats: z.record(num),
  x: num,
  y: num,
  links: z.array(num),
});

const TreeFileSchema = z.object({
  maxAccountLevel: num,
  emberBase: num,
  /** Ember a brand-new account opens with, so the Hub has something to do. */
  startingEmber: num,
  respecCostPerNode: num,
  pointsPerLevel: num,
  nodes: z.array(TreeNodeSchema),
});

/* --------------------------------------------------------------- modifiers */

const ModifiersFileSchema = z.object({
  tierRewardPerStep: num,
  modifiers: z.array(
    z.object({ key: str, name: str, desc: str, effect: z.record(num), rewardBonus: num }),
  ),
});

/* ----------------------------------------------------------------- classes */

/**
 * SPEC-V2 §2: every class has one Active skill, usable both phases and
 * shown on the HUD with its cooldown. `kind` dispatches to the effect
 * implementation in `src/sim/classes.ts`; new kinds extend that switch as
 * more classes land (f005+) without touching this schema.
 */
const ClassActiveSchema = z.object({
  name: str,
  kind: z.enum(['burst_damage']),
  cooldownSeconds: num,
  radius: num,
  damage: num,
  slow: num.optional(),
  slowDuration: num.optional(),
  burnDps: num.optional(),
  burnDuration: num.optional(),
  /** Immersion rule (SPEC-V2 §2): every Active states a Day use and a Night use. */
  dayUse: str,
  nightUse: str,
});

const ClassPassiveSchema = z.object({ name: str, description: str });

const ClassesFileSchema = z.object({
  classes: z.array(
    z.object({
      key: str,
      name: str,
      unlockedByDefault: z.boolean(),
      unlockQuest: str.nullable(),
      trait: str,
      mods: z.record(num),
      active: ClassActiveSchema,
      passive: ClassPassiveSchema,
      manualAttack: z.object({ name: str, dps: num, range: num, interval: num }),
    }),
  ),
});

/**
 * SPEC-V2 §2 affinity model: replaces v0.1's class-exclusive signature tower.
 * Every class may build every tower; a tower listed here gets +`bonus`
 * effectiveness (damage) when built by `classKey`, plus a flavor perk.
 */
const AffinityFileSchema = z.object({
  affinities: z.array(
    z.object({
      classKey: str,
      towers: z.array(str),
      bonus: num,
      perk: str,
    }),
  ),
});

/* ------------------------------------------------------------ damage types */

/**
 * SPEC-V3 §3's taxonomy. Every number the six rows quote lives here so the
 * Tuner (T5) can edit them and the engine stays generic.
 *
 * `effect` splits the table in two: a `hit` row lands its damage immediately,
 * a `dot` row installs a stack that ticks. A dot row states its magnitude
 * either as a flat `dps` (Bleeding, Burning) or as a `ratio` of the damage
 * that triggered it (Poison 1.2, Toxic 1.8) — never both.
 *
 * `refresh` is what an application does once `maxStacks` are already on the
 * target: `shortest` overwrites the stack with the least time left (V2's
 * poison rule), `strongest` keeps the higher dps and the longer remaining
 * (V2's burn rule). §3 states a stacking rule only for Bleeding, so the other
 * three keep the behaviour their V2 callers shipped with — see QUESTIONS Q65.
 */
const DamageTypeSchema = z
  .object({
    key: str,
    name: str,
    effect: z.enum(['hit', 'dot']),
    /** SPEC-V3 §2: "ailment (dot) damage ignores armor unless stated". */
    ignoresArmor: z.boolean(),
    dps: num.optional(),
    ratio: num.optional(),
    duration: num.optional(),
    maxStacks: num.int().min(1).optional(),
    refresh: z.enum(['shortest', 'strongest']).optional(),
    /** Burning: armor points stripped per second (SPEC-V3 §3, Q58's shred). */
    armorShredPerSecond: num.optional(),
    /** Burning's spread and Electric's inherent blast, in tiles. */
    radius: num.optional(),
    desc: str,
  })
  .strict();

const DamageStatusSchema = z
  .object({
    duration: num,
    attackSpeed: num.optional(),
    moveSpeed: num.optional(),
    damageTaken: num.optional(),
    desc: str,
  })
  .strict();

/**
 * Whether `key` is something an attack may apply on hit, throwing if it is not.
 *
 * Exported so a test can drive the loader's own predicate: no shipped tower
 * authors an `onHit` list yet (m20b is what authors them, Q68), so the loop
 * that calls this never executes against `/data` and the rule would otherwise
 * ship with no coverage at all — the exact failure m19a's orphaned
 * `shredArmor` was.
 */
export function validateOnHit(types: DamageTypesFile, key: string, where: string): void {
  const d = types.types.find((row) => row.key === key);
  if (!d && !(key in types.statuses)) {
    throw new Error(`${where} applies unknown damage type/status "${key}"`);
  }
  if (d && (d.effect !== 'dot' || d.dps === undefined)) {
    // A ratio row has no magnitude without a triggering damage, and a hit row
    // lands its damage rather than riding along on someone else's.
    throw new Error(`${where} cannot apply "${key}" on hit — it has no flat dps`);
  }
}

const DamageTypesFileSchema = z.object({
  /**
   * SPEC-V3 §3's "perf cap 50 stacks/enemy". Enforced across all dot types
   * together, not per type: the cap exists so a horde cannot grow an unbounded
   * per-enemy array in the hot loop, and that budget is shared.
   */
  maxStacksPerEnemy: num.int().min(1),
  types: z.array(DamageTypeSchema),
  statuses: z.object({ frost: DamageStatusSchema, frozen: DamageStatusSchema }),
});

/* ------------------------------------------------------------------ quests */

const QuestsFileSchema = z.object({
  quests: z.array(
    z.object({
      key: str,
      name: str,
      desc: str,
      metric: str,
      target: num,
      compare: z.enum(['gte', 'lte']),
      reward: z.object({ kind: str, value: str }),
    }),
  ),
});

/* ------------------------------------------------------------------ warden */

const WardenFileSchema = z.object({
  maxHp: num,
  hpRegen: num,
  armor: num,
  moveSpeed: num,
  pickupRadius: num,
  dashDistance: num,
  dashCooldown: num,
  dashIFrames: num,
  /** Percent, so 0..100. Above 100 every hit would heal (V3 T5 edits this file). */
  armorCap: num.min(0).max(100),
  /** Negative points, so at most 0. */
  armorFloor: num.max(0),
  cdrCap: num,
  heartstoneHeal: num,
  heartstoneRadius: num,
  leechCapPerSecond: num,
  outOfCombatSeconds: num,
  manualAttackDisabledInActII: z.boolean(),
});

/**
 * Parsed eagerly: the Warden's base sheet is referenced as a module constant
 * (`stats.BASE`) rather than through the lazily-built Content object.
 */
export const wardenBase = WardenFileSchema.parse(wardenRaw);
export type WardenBase = typeof wardenBase;

/* ------------------------------------------------------------------ export */

export type TowerDef = z.infer<typeof TowerSchema>;
export type TowerAttack = NonNullable<z.infer<typeof TowerAttackSchema>>;
export type TerrainDef = z.infer<typeof TerrainSchema>;
export type EnemyDef = z.infer<typeof EnemySchema>;
export type WeaponDef = z.infer<typeof WeaponSchema>;
export type WeaponLevel = z.infer<typeof WeaponLevelSchema>;
export type AwakeningDef = z.infer<typeof AwakeningSchema>;
export type BoonDef = z.infer<typeof BoonSchema>;
export type AffixDef = z.infer<typeof AffixSchema>;
export type TreeNode = z.infer<typeof TreeNodeSchema>;
export type ModifierDef = z.infer<typeof ModifiersFileSchema>['modifiers'][number];
export type ClassDef = z.infer<typeof ClassesFileSchema>['classes'][number];
export type ClassActive = z.infer<typeof ClassActiveSchema>;
export type AffinityDef = z.infer<typeof AffinityFileSchema>['affinities'][number];
export type QuestDef = z.infer<typeof QuestsFileSchema>['quests'][number];
export type DamageTypeDef = z.infer<typeof DamageTypeSchema>;
export type DamageStatusDef = z.infer<typeof DamageStatusSchema>;
export type DamageTypesFile = z.infer<typeof DamageTypesFileSchema>;
export type WaveDef = z.infer<typeof WavesFileSchema>['waves'][number];

/**
 * SPEC-V3 T3. `devMode` here is the *authored* value; whether it is honoured
 * depends on the build (see `src/meta/devprofile.ts`) — a production bundle
 * always runs with the dev profile off, per gate C8.
 */
const DevFileSchema = z
  .object({
    devMode: z.boolean(),
    skillPoints: z.number().int().min(0),
    unlockAllClasses: z.boolean(),
    unlockAllTiers: z.boolean(),
    completeAllQuests: z.boolean(),
    fillStash: z.boolean(),
  })
  // Strict so a typo for a neighbouring feature (`godMode`, say) fails loudly
  // instead of being silently dropped and doing nothing.
  .strict();

export type DevConfig = z.infer<typeof DevFileSchema>;

export interface Content {
  warden: WardenBase;
  towers: z.infer<typeof TowersFileSchema>;
  enemies: z.infer<typeof EnemiesFileSchema>;
  waves: z.infer<typeof WavesFileSchema>;
  weapons: z.infer<typeof WeaponsFileSchema>;
  spawns: z.infer<typeof SpawnsFileSchema>;
  boons: z.infer<typeof BoonsFileSchema>;
  relics: z.infer<typeof RelicsFileSchema>;
  tree: z.infer<typeof TreeFileSchema>;
  modifiers: z.infer<typeof ModifiersFileSchema>;
  classes: z.infer<typeof ClassesFileSchema>;
  affinity: z.infer<typeof AffinityFileSchema>;
  quests: z.infer<typeof QuestsFileSchema>;
  damageTypes: DamageTypesFile;
  dev: DevConfig;

  towerByKey: Map<string, TowerDef>;
  towerById: Map<number, TowerDef>;
  enemyByKey: Map<string, EnemyDef>;
  enemyById: Map<number, EnemyDef>;
  weaponByKey: Map<string, WeaponDef>;
  boonByKey: Map<string, BoonDef>;
  treeById: Map<number, TreeNode>;
  classByKey: Map<string, ClassDef>;
  modifierByKey: Map<string, ModifierDef>;
  affinityByClass: Map<string, AffinityDef>;
  damageTypeByKey: Map<string, DamageTypeDef>;
}

let cached: Content | null = null;

export function loadContent(): Content {
  if (cached) return cached;

  const towers = TowersFileSchema.parse(towersRaw);
  const enemies = EnemiesFileSchema.parse(enemiesRaw);
  const waves = WavesFileSchema.parse(wavesRaw);
  const weapons = WeaponsFileSchema.parse(weaponsRaw);
  const spawns = SpawnsFileSchema.parse(spawnsRaw);
  const boons = BoonsFileSchema.parse(boonsRaw);
  const relics = RelicsFileSchema.parse(relicsRaw);
  const tree = TreeFileSchema.parse(treeRaw);
  const modifiers = ModifiersFileSchema.parse(modifiersRaw);
  const classes = ClassesFileSchema.parse(classesRaw);
  const affinity = AffinityFileSchema.parse(affinityRaw);
  const dev = DevFileSchema.parse(devRaw);
  const quests = QuestsFileSchema.parse(questsRaw);
  const damageTypes = DamageTypesFileSchema.parse(damageTypesRaw);

  // Cross-file referential integrity: a typo in /data must fail loudly at load.
  const towerKeys = new Set(towers.towers.map((t) => t.key));
  const weaponKeys = new Set(weapons.weapons.map((w) => w.key));
  const enemyKeys = new Set(enemies.enemies.map((e) => e.key));
  const boonKeys = new Set(boons.boons.map((b) => b.key));

  for (const t of towers.towers) {
    if (t.soul !== null && !weaponKeys.has(t.soul)) {
      throw new Error(`towers.json: ${t.key} references unknown soul weapon "${t.soul}"`);
    }
  }
  for (const w of weapons.weapons) {
    if (w.source !== 'innate' && !towerKeys.has(w.source)) {
      throw new Error(`weapons.json: ${w.key} references unknown source tower "${w.source}"`);
    }
  }
  for (const a of weapons.awakenings) {
    if (!weaponKeys.has(a.weapon)) throw new Error(`weapons.json: awakening ${a.key} bad weapon`);
    if (!boonKeys.has(a.boon)) throw new Error(`weapons.json: awakening ${a.key} bad boon`);
  }
  for (const w of waves.waves) {
    for (const g of w.groups) {
      if (!enemyKeys.has(g.enemy)) throw new Error(`waves.json: wave ${w.wave} unknown enemy ${g.enemy}`);
      if (g.perGate === undefined && g.total === undefined) {
        throw new Error(`waves.json: wave ${w.wave} group ${g.enemy} needs perGate or total`);
      }
    }
  }
  for (const key of Object.keys(spawns.costs)) {
    if (!enemyKeys.has(key)) throw new Error(`spawns.json: unknown enemy cost "${key}"`);
  }
  for (const row of spawns.weightsByMinute) {
    for (const key of Object.keys(row.weights)) {
      if (!enemyKeys.has(key)) throw new Error(`spawns.json: minute ${row.minute} unknown enemy "${key}"`);
      if (spawns.costs[key] === undefined) throw new Error(`spawns.json: "${key}" has no cost`);
    }
  }
  const classKeys = new Set(classes.classes.map((c) => c.key));
  for (const a of affinity.affinities) {
    if (!classKeys.has(a.classKey)) {
      throw new Error(`affinity.json: unknown class "${a.classKey}"`);
    }
    for (const t of a.towers) {
      if (!towerKeys.has(t)) {
        throw new Error(`affinity.json: ${a.classKey} references unknown tower "${t}"`);
      }
    }
  }
  for (const t of towers.towers) {
    for (const k of t.attack?.onHit ?? []) validateOnHit(damageTypes, k, `towers.json: ${t.key}`);
  }

  // A damage type that says nothing about its magnitude would apply as a
  // silent no-op, which is the failure mode m19a/m19b both shipped once. A row
  // has to be well-formed at load, not merely parse.
  for (const d of damageTypes.types) {
    const hasDps = d.dps !== undefined;
    const hasRatio = d.ratio !== undefined;
    if (d.effect === 'dot') {
      if (hasDps === hasRatio) {
        throw new Error(`damagetypes.json: "${d.key}" needs exactly one of dps/ratio`);
      }
      if (!d.duration || d.duration <= 0) throw new Error(`damagetypes.json: "${d.key}" needs a duration`);
      if (!d.maxStacks || !d.refresh) throw new Error(`damagetypes.json: "${d.key}" needs maxStacks + refresh`);
      if (d.maxStacks > damageTypes.maxStacksPerEnemy) {
        throw new Error(`damagetypes.json: "${d.key}" maxStacks exceeds maxStacksPerEnemy`);
      }
    } else if (hasDps || hasRatio || d.duration !== undefined || d.armorShredPerSecond !== undefined) {
      throw new Error(`damagetypes.json: "${d.key}" is a hit but carries dot fields`);
    }
  }

  const treeIds = new Set(tree.nodes.map((n) => n.id));
  for (const n of tree.nodes) {
    for (const l of n.links) {
      if (!treeIds.has(l)) throw new Error(`tree.json: node ${n.id} links to missing ${l}`);
    }
  }

  cached = {
    warden: wardenBase,
    towers,
    enemies,
    waves,
    weapons,
    spawns,
    boons,
    relics,
    tree,
    modifiers,
    classes,
    affinity,
    dev,
    quests,
    damageTypes,
    towerByKey: new Map(towers.towers.map((t) => [t.key, t])),
    towerById: new Map(towers.towers.map((t) => [t.id, t])),
    enemyByKey: new Map(enemies.enemies.map((e) => [e.key, e])),
    enemyById: new Map(enemies.enemies.map((e) => [e.id, e])),
    weaponByKey: new Map(weapons.weapons.map((w) => [w.key, w])),
    boonByKey: new Map(boons.boons.map((b) => [b.key, b])),
    treeById: new Map(tree.nodes.map((n) => [n.id, n])),
    classByKey: new Map(classes.classes.map((c) => [c.key, c])),
    modifierByKey: new Map(modifiers.modifiers.map((m) => [m.key, m])),
    affinityByClass: new Map(affinity.affinities.map((a) => [a.classKey, a])),
    damageTypeByKey: new Map(damageTypes.types.map((d) => [d.key, d])),
  };
  return cached;
}
