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
import questsRaw from '../../data/quests.json';
import wardenRaw from '../../data/warden.json';

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
  classLock: str.nullable(),
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

const EnemySchema = z.object({
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
  orbs: z.array(z.object({ key: str, name: str, desc: str })),
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

const ClassesFileSchema = z.object({
  classes: z.array(
    z.object({
      key: str,
      name: str,
      unlockedByDefault: z.boolean(),
      unlockQuest: str.nullable(),
      trait: str,
      mods: z.record(num),
      signatureTower: str,
      manualAttack: z.object({ name: str, dps: num, range: num, interval: num }),
    }),
  ),
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
  armorK: num,
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
export type QuestDef = z.infer<typeof QuestsFileSchema>['quests'][number];
export type WaveDef = z.infer<typeof WavesFileSchema>['waves'][number];

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
  quests: z.infer<typeof QuestsFileSchema>;

  towerByKey: Map<string, TowerDef>;
  towerById: Map<number, TowerDef>;
  enemyByKey: Map<string, EnemyDef>;
  enemyById: Map<number, EnemyDef>;
  weaponByKey: Map<string, WeaponDef>;
  boonByKey: Map<string, BoonDef>;
  treeById: Map<number, TreeNode>;
  classByKey: Map<string, ClassDef>;
  modifierByKey: Map<string, ModifierDef>;
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
  const quests = QuestsFileSchema.parse(questsRaw);

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
  for (const c of classes.classes) {
    if (!towerKeys.has(c.signatureTower)) {
      throw new Error(`classes.json: ${c.key} bad signature tower`);
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
    quests,
    towerByKey: new Map(towers.towers.map((t) => [t.key, t])),
    towerById: new Map(towers.towers.map((t) => [t.id, t])),
    enemyByKey: new Map(enemies.enemies.map((e) => [e.key, e])),
    enemyById: new Map(enemies.enemies.map((e) => [e.id, e])),
    weaponByKey: new Map(weapons.weapons.map((w) => [w.key, w])),
    boonByKey: new Map(boons.boons.map((b) => [b.key, b])),
    treeById: new Map(tree.nodes.map((n) => [n.id, n])),
    classByKey: new Map(classes.classes.map((c) => [c.key, c])),
    modifierByKey: new Map(modifiers.modifiers.map((m) => [m.key, m])),
  };
  return cached;
}
