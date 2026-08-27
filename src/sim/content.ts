/**
 * Content loading + schema validation (SPEC 9.3).
 * All tuning lives in /data; nothing here invents numbers.
 */
import { z } from 'zod';

import { attackProfile } from './upgrades';
import towersRaw from '../../data/towers.json';
import enemiesRaw from '../../data/enemies.json';
import wavesRaw from '../../data/waves.json';
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
import coresRaw from '../../data/cores.json';

const num = z.number();
const str = z.string();

/* ------------------------------------------------------------------ towers */

const BurnSchema = z.object({ dps: num, duration: num });

/**
 * SPEC-V3 §3's composite attacks: "electric tower `normal:electric = 1:1`".
 * Shares of one attack's damage, by damage-type key — not multipliers of it.
 */
const DamageRatioSchema = z.record(num);

const TowerAttackSchema = z
  .object({
    kind: z.enum(['single', 'pierce', 'cone', 'aura', 'chain', 'lob', 'poison']),
    damage: num,
    interval: num,
    range: num,
    minRange: num.optional(),
    /** Enemies the shot carries on through *beyond* the first (Ballista: 3 → 4 hit). */
    pierce: num.optional(),
    /** SPEC-V3 §4: shots fired per attack. Defaults to 1 where unauthored. */
    projectiles: num.int().positive().optional(),
    aoe: num.optional(),
    chains: num.optional(),
    chainRange: num.optional(),
    coneHalfAngle: num.optional(),
    slow: num.optional(),
    slowDuration: num.optional(),
    projectileSpeed: num.optional(),
    burn: BurnSchema.optional(),
    /**
     * SPEC-V3 §3/§4: how this attack's damage is typed. Absent means the whole
     * of it is Normal, which is what every V2-authored tower means.
     */
    damageRatio: DamageRatioSchema.optional(),
    /**
     * SPEC-V3 §3 damage types and statuses every hit of this attack also
     * applies, by key. Checked against the taxonomy at load.
     */
    onHit: z.array(str).optional(),
  })
  .nullable();

/**
 * SPEC-FINAL §5's VS special column, §6.2: inert towers each contribute one
 * named effect during a VS wave, and nothing else — no attack, no residual
 * damage from anywhere but this. A typed key rather than free-form terrain
 * fields so a special with no engine reader is a load error (the m19a
 * `shredArmor` failure mode), not a silently-dead data row. `p2c` is the only
 * producer of this field; `p2a`/`p2b`'s wielding formula reads none of it.
 */
const VsSpecialSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }).strict(),
  /** Electric: "all electric towers are wired to each other; enemies on any
   * wire take normal damage every 0.5s." One entry, shared by every electric
   * tower via `s.links` (`linkSpires`, unchanged from the V2 conversion table). */
  z.object({ kind: z.literal('electricWireGrid'), damage: num.nonnegative(), interval: num.positive() }).strict(),
  /** Poison: "character leaves a poison trail every second dealing 0.1x the
   * tower's attack." `ratio` is applied to the live wielded poison damage. */
  z.object({
    kind: z.literal('poisonTrail'),
    ratio: num.positive(),
    interval: num.positive(),
    radius: num.positive(),
  }).strict(),
  /** Fire Brazier: "Burning enemies explode on death: 5 normal, r1." */
  z.object({ kind: z.literal('burningExplode'), damage: num.nonnegative(), radius: num.positive() }).strict(),
  /** Ice Obelisk: "an ice aura r2 follows the character, applying frost each second." */
  z.object({ kind: z.literal('frostAura'), radius: num.positive(), interval: num.positive() }).strict(),
  /**
   * Beacon Totem / Harvest Sprout: markers only — no payload of their own.
   * Both specials already existed pre-SPEC-FINAL as the `shrine`/`gem_bloom`
   * terrain rows (`wardenRadius`/`wardenAttackSpeed`, `gemInterval`/`gemValue`)
   * and already matched §5's numbers exactly, so this names the fact that a
   * VS special is authored here without a second copy of its numbers to drift
   * out of sync with the terrain row that actually reads them.
   */
  z.object({ kind: z.literal('beaconHaste') }).strict(),
  z.object({ kind: z.literal('sproutGems') }).strict(),
]);

const TerrainSchema = z.object({
  kind: str,
  blocks: z.boolean(),
  armorPerWall: num.optional(),
  armorCap: num.optional(),
  linkRange: num.optional(),
  maxLinks: num.optional(),
  wardenRadius: num.optional(),
  wardenAttackSpeed: num.optional(),
  gemInterval: num.optional(),
  gemValue: num.optional(),
  gemMax: num.optional(),
});

/**
 * SPEC-V3 §4: a tower's own upgrade track. `count` steps, each costing a **flat**
 * `stepCost` (V2's growing 0.75x/1.25x ladder is gone), each granting
 * +`upgradeStepMul` HP/Attack/Defense unless the step carries a milestone
 * special — see `upgradeStatMul` in towers.ts for the "unless".
 *
 * `specials` are SPEC-V3 §4's milestone specials — m20a validated the steps a
 * track names (in range, one per step); m20b gives each key an effect. The key
 * is an enum rather than a free string so a typo is a load error instead of a
 * step that silently buys nothing, which is the failure m19a's orphaned
 * `shredArmor` shipped as. What each key needs alongside it is cross-checked by
 * `validateSpecial`, since the requirement depends on the key.
 *
 * `coneWidth`/`burnStacks`/`slowDuration`/`burnPatch` are p5c's four (Ballista
 * needs none — it reuses `pierce`/`projectiles` verbatim): Fire Brazier's cone
 * widens and its burn hits harder, Frost Obelisk's own slow lasts longer, and
 * Mortar's shell leaves a ground patch — see `attackProfile` (`upgrades.ts`)
 * for what each actually changes, and `validateSpecialChangesProfile` below
 * for gate **G20**'s loader rule.
 */
const SPECIAL_KEYS = [
  'pierce',
  'projectiles',
  'onHit',
  'damageRatio',
  'electricChain',
  'coneWidth',
  'burnStacks',
  'slowDuration',
  'burnPatch',
] as const;

const UpgradeSpecialSchema = z.object({
  at: num.int().positive(),
  key: z.enum(SPECIAL_KEYS),
  /** `pierce`/`projectiles`/`burnStacks`: how many this step adds. */
  value: num.int().positive().optional(),
  /** `onHit`: the §3 damage type or status the attack starts applying. */
  type: str.optional(),
  /** `damageRatio`: the split this step replaces the attack's own with. */
  ratio: DamageRatioSchema.optional(),
  /** `coneWidth`: the cone half-angle's new multiplier (§5.2 "+50%" → 1.5). */
  mul: num.positive().optional(),
  /** `slowDuration`/`burnPatch`: seconds — the new slow duration, or how long the ground patch burns. */
  seconds: num.positive().optional(),
  note: str.optional(),
  // Closed on purpose: `values: 1` for `value: 1` would otherwise be dropped in
  // silence and the step would buy nothing.
}).strict();

export type UpgradeSpecial = z.infer<typeof UpgradeSpecialSchema>;

const UpgradeTrackSchema = z.object({
  count: num.int().min(0).max(20),
  /** 0 only for a track with no steps to price — see `validateUpgradeTrack`. */
  stepCost: num.min(0),
  specials: z.array(UpgradeSpecialSchema).default([]),
  /**
   * Why this track's `count` departs from, or sits outside, m20c's count line
   * — `5 - (cost - 50) / 35`, the line through §4's own three (Q80). Present
   * on exactly the towers that do, and `tests/m20c-roster-tracks.test.ts`
   * enforces both directions: a track that quietly disagrees with the line and
   * one that disagrees for a measured reason are the same diff otherwise. The
   * step *price* has its own escape now too — see `costMul`/`validateStepPrice`.
   */
  note: str.optional(),
  /**
   * §5's own line: "total track cost = 2x build cost ⚖, per-track `costMul`
   * allowed" — an override of `TowersFile.upgradeTotalCostMul` for this one
   * track, not a multiplier of it. `validateStepPrice` reads it in place of
   * the file-wide constant when present; omitted, a track prices exactly like
   * every other one (p5b, Q80).
   */
  costMul: num.positive().optional(),
}).strict();

export const TowerSchema = z.object({
  id: num,
  key: str,
  name: str,
  cost: num,
  /**
   * SPEC-V3 §4 armour points for the structure itself, read through m19a's
   * curve by `structureArmor` — flat percent off normal damage taken. m20c
   * turned §4's profile words into the three `defenseBands`, so this is a
   * band value and not a free number (Q80); the Palisade and the Sprout sit
   * at `none`, which is exactly x1, for reasons Q80 records.
   */
  defense: num,
  upgrades: UpgradeTrackSchema,
  hp: num,
  blocks: z.boolean(),
  attack: TowerAttackSchema,
  buffAura: z.object({ radius: num, attackSpeed: num }).optional(),
  economy: z.object({ goldPerWavePerTier: num }).optional(),
  passive: z.object({ attackSpeedPer: num, cap: num }).optional(),
  terrain: TerrainSchema,
  /** SPEC-FINAL §5's VS special column (p2c). Required — "none" is explicit. */
  vsSpecial: VsSpecialSchema,
  desc: str,
}).strict();

export const TowersFileSchema = z.object({
  /** SPEC-V3 §4: one upgrade step = +10% HP, Attack and Defense. */
  upgradeStepMul: num,
  /**
   * §4 reads "+10% HP, Attack, Defense **unless** a milestone special is
   * listed". True honours the "unless" — a step carrying a special grants the
   * special instead of the stat bump. One field, so the owner can flip the
   * reading without an engine change (Q73).
   */
  milestoneStepsSkipStats: z.boolean(),
  /** §4: sell refunds this share of everything actually spent on the tower. */
  sellRefund: num,
  /**
   * What walking a whole track costs, as a multiple of the build price: §4
   * fixes no prices at all, so this is m20c's answer, and it is Q73's — a
   * track costs what V2's three tiers cost, however many steps it has. See
   * `validateStepPrice` and Q80.
   */
  upgradeTotalCostMul: num.positive(),
  buildRange: num,
  /**
   * Many-target damage damping shared by every AoE/cone/ground-field hit
   * (SPEC A5): the first `aoeFullTargets` bodies a blast touches take full
   * damage, then each further body scales by `aoeFalloff`, floored at
   * `aoeFalloffFloor`, so no single attack out-scales every other source by
   * simply hitting a bigger crowd. Formerly authored in `data/weapons.json`
   * alongside the deleted weapon roster; moved here at p2e since the rule is
   * generic to every attack shape, towers and wielded attacks alike.
   */
  aoeFullTargets: num,
  aoeFalloff: num,
  aoeFalloffFloor: num,
  /** Same damping, applied per successive body a piercing line passes through. */
  pierceFalloff: num,
  pierceFalloffFloor: num,
  /**
   * SPEC-V3 §4 gives tower defense as a profile word ("medium HP/def", "low
   * def") and no numbers, so m20c authored the band table the words name.
   * Every tower's `defense` must be one of these values — `validateDefense`
   * — so the roster keeps three legible tiers instead of ten magic numbers
   * that drift apart one tune at a time (Q80).
   */
  defenseBands: z.record(str, num),
  /**
   * SPEC-FINAL §10: structures are high-cost passable tiles, cost ∝ HP ×
   * toughness (⚖). `base` is the flat path-cost surcharge for entering any
   * structure tile, in flow-field units (an open tile costs 10 orthogonal /
   * 14 diagonal) — sized above the longest walkable route on the 36×20 map so
   * an open path always beats a breach. `perEhp` prices each point of
   * effective HP (max HP ÷ the damage-taken multiplier its defense earns), so
   * a sealed board's cheapest breach route runs through its weakest
   * structures. Both are P10 tuning levers; see QUESTIONS Q92.
   */
  breach: z.object({ base: num.nonnegative(), perEhp: num.nonnegative() }).strict(),
  towers: z.array(TowerSchema),
}).strict();

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
  /** Elite spawn-count multiplier keyed by cycle number (as a string), e.g. cycle 2's "Elite pressure x2". */
  eliteMulByCycle: z.record(num).optional(),
  /** SPEC-V2 §1: added to a Night's minute-of-warmup per prior cycle, so later Nights start hotter. */
  nightMinuteOffsetPerCycle: num.optional(),
  /**
   * SPEC-FINAL §1.1: TD waves per interleave block before a VS wave fires
   * ("3 TD waves, then 1 VS wave, repeating").
   */
  tdWavesPerVsWave: num,
  /** SPEC-FINAL §1.1: VS wave length, 75s ⚖ (the final VS wave ignores this and runs until the boss dies). */
  vsWaveSeconds: num,
  /**
   * SPEC-FINAL §1.1 multi-summon (P3, p3b): the most TD waves that may ever
   * be fighting at once — the wave already in progress plus up to
   * `maxStackedWaves - 1` more, each pulled forward early by its own `call`
   * command. 3 ⚖.
   */
  maxStackedWaves: num,
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

/**
 * SPEC-FINAL §5.5: the Core is chosen at run start, keeps its existing TD
 * rules (target, HP 0 in TD = defeat), and its upgrade steps are bought at
 * flat cost — no `costMul`, no default +10%, never sellable — so its schema
 * carries only `count`/`stepCost` (no `specials`/`costMul`/`note`, unlike a
 * tower's `UpgradeTrackSchema`). This item (`p-core-a`) is the plumbing half
 * only: selection, hashing and loader validation. Each Core's real TD/VS
 * effects (the gameplay a `desc` line only describes here) are `p-core-b`
 * through `p-core-f`'s job.
 */
const CoreUpgradeSchema = z
  .object({
    count: z.number().int().min(0),
    stepCost: num,
    desc: str,
  })
  .strict();

const CoreSchema = z
  .object({
    key: str,
    name: str,
    baseHp: num.positive(),
    unlockedByDefault: z.boolean(),
    unlockCondition: str.nullable(),
    upgrade: CoreUpgradeSchema,
  })
  .strict();

const CoresFileSchema = z.object({ cores: z.array(CoreSchema) });

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
 * Whether a SPEC-V3 §4 upgrade track is well-formed, throwing if it is not.
 *
 * zod checks each field alone; these are the cross-field claims. A special
 * pinned to a step the track does not have would simply never fire — the
 * silent-no-op failure m19a and m19b each shipped once — and two specials on
 * one step would make the step's payout depend on authoring order.
 *
 * Exported so a test can drive the loader's own predicate: only three shipped
 * towers author a special, so most of these branches never execute against
 * `/data`.
 */
export function validateUpgradeTrack(
  track: { count: number; stepCost: number; specials: { at: number; key: string }[] },
  where: string,
): void {
  if (track.count > 0 && track.stepCost <= 0) {
    throw new Error(`${where} has ${track.count} upgrade steps and no price for them`);
  }
  const seen = new Set<number>();
  for (const sp of track.specials) {
    if (sp.at > track.count) {
      throw new Error(`${where} special "${sp.key}" is at step ${sp.at} of ${track.count}`);
    }
    if (seen.has(sp.at)) throw new Error(`${where} has two specials at step ${sp.at}`);
    seen.add(sp.at);
  }
}

/**
 * m20c's authoring rule for a step's price, throwing if a track breaks it.
 *
 * SPEC-V3 §4 fixes three upgrade *counts* and no prices at all, so the price
 * is the agent's to propose (Q73, Q80): **walking a whole track costs
 * `upgradeTotalCostMul x` the build price, however many steps it has**, so a
 * step is that total divided by the count, *rounded* — which is why the claim
 * holds per step and not to the gold on a track whose count does not divide
 * the total (Venom Spore's four steps of 38 come to 152, not 150).
 *
 * SPEC-FINAL §5 names the one escape the rule always lacked: a track's own
 * `costMul`, used in place of the file-wide `totalCostMul` when the track
 * carries one (p5b, Q80) — unlike `note` on the count line, this changes the
 * number rather than explaining a departure from it, so a track with a
 * `costMul` is still fully priced by *a* rule, just not the shared one.
 */
export function validateStepPrice(
  totalCostMul: number,
  t: { cost: number; upgrades: { count: number; stepCost: number; costMul?: number } },
  where: string,
): void {
  if (t.upgrades.count === 0) {
    // `validateUpgradeTrack` catches steps with no price; this is the other
    // direction, a price with no steps, which would otherwise load clean.
    if (t.upgrades.stepCost !== 0) {
      throw new Error(`${where} prices a step at ${t.upgrades.stepCost} and has no steps`);
    }
    return;
  }
  const mul = t.upgrades.costMul ?? totalCostMul;
  const want = Math.round((t.cost * mul) / t.upgrades.count);
  if (t.upgrades.stepCost !== want) {
    throw new Error(`${where} prices a step at ${t.upgrades.stepCost}, not ${want}`);
  }
}

/**
 * A Core row's own "cannot pay" rule (`p-core-a`'s acceptance line). Unlike a
 * tower, a Core has no build cost to derive a total from — §5.5 prices every
 * step flat — so this is `validateUpgradeTrack`'s two step/price mismatch
 * branches with nothing else to check against.
 */
export function validateCoreUpgrade(c: { key: string; upgrade: { count: number; stepCost: number } }): void {
  const where = `cores.json: ${c.key}`;
  if (c.upgrade.count > 0 && c.upgrade.stepCost <= 0) {
    throw new Error(`${where} has ${c.upgrade.count} upgrade steps and no price for them`);
  }
  if (c.upgrade.count === 0 && c.upgrade.stepCost !== 0) {
    throw new Error(`${where} prices a step at ${c.upgrade.stepCost} and has no steps`);
  }
}

/**
 * §5.5: "default: Stone Heart" is a load-time guarantee, not a Hub-side
 * fallback — two default rows (or none) would leave `defaultCoreKey` picking
 * arbitrarily among ties, or throwing on `.find()!` returning `undefined`.
 */
export function validateDefaultCore(cores: { key: string; unlockedByDefault: boolean }[]): void {
  const defaults = cores.filter((c) => c.unlockedByDefault);
  if (defaults.length !== 1) {
    throw new Error(`cores.json: exactly one core must be unlockedByDefault, found ${defaults.length}`);
  }
}

/**
 * Whether a tower's `defense` is one of the authored bands, throwing if it is
 * not. See `defenseBands` — the point is that ten towers keep three legible
 * tiers of toughness rather than ten numbers nobody can compare (Q80).
 */
export function validateDefense(bands: Record<string, number>, defense: number, where: string): void {
  const values = Object.values(bands);
  if (values.length === 0) throw new Error(`towers.json authors no defense bands`);
  if (!values.includes(defense)) {
    const names = Object.entries(bands)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
    throw new Error(`${where} has defense ${defense}, which is no band (${names})`);
  }
}

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

/**
 * Whether a SPEC-V3 §3 composite split is something an attack can actually
 * deal, throwing if it is not.
 *
 * A share is a share: an unknown key, a negative weight or a total of zero all
 * make the attack deal *less* than it says it does, silently, because
 * `applyDamageSplit` divides by the total and skips non-positive rows.
 */
export function validateDamageRatio(
  types: DamageTypesFile,
  ratio: Readonly<Record<string, number>>,
  where: string,
): void {
  let total = 0;
  for (const [key, weight] of Object.entries(ratio)) {
    if (!types.types.some((row) => row.key === key)) {
      throw new Error(`${where} splits damage into unknown type "${key}"`);
    }
    if (!(weight >= 0)) throw new Error(`${where} gives "${key}" a negative share`);
    total += weight;
  }
  if (total <= 0) throw new Error(`${where} has a damage ratio that totals nothing`);
}

/**
 * Which attack shapes actually read each special, for the keys that are not
 * universal. `onHit`, `damageRatio` and `electricChain` ride on every shape
 * (`HitEffects`), so they are absent here.
 */
const SPECIAL_KINDS: Record<string, readonly string[] | undefined> = {
  pierce: ['single', 'pierce'],
  projectiles: ['single', 'pierce', 'poison'],
  coneWidth: ['cone'],
  burnStacks: ['cone'],
  slowDuration: ['aura'],
  burnPatch: ['lob'],
};

/**
 * Whether a SPEC-V3 §4 milestone special is something the engine can pay out,
 * throwing if it is not.
 *
 * Each key needs a different thing alongside it, and every one of these
 * failures would otherwise be a step the player buys that grants nothing —
 * `attackProfile` folds what it is given and cannot tell "absent" from
 * "meant zero".
 */
export function validateSpecial(
  types: DamageTypesFile,
  sp: { key: string; value?: number; type?: string; ratio?: Record<string, number>; mul?: number; seconds?: number },
  attack: {
    kind: string;
    damageRatio?: Record<string, number>;
    burn?: { dps: number; duration: number };
  } | null,
  where: string,
): void {
  const what = `${where} special "${sp.key}"`;
  if (!attack) throw new Error(`${what} is on a tower that has no attack`);
  // Two of the keys are only read by some of the seven shapes — `fireTower`'s
  // cone, aura and chain cases have no line and no shot count — so a track that
  // pinned one to a Mortar would load clean and grant nothing. m20c authors
  // tracks for exactly those towers next.
  const kinds = SPECIAL_KINDS[sp.key];
  if (kinds && !kinds.includes(attack.kind)) {
    throw new Error(`${what} does nothing on a "${attack.kind}" attack`);
  }
  switch (sp.key) {
    case 'pierce':
    case 'projectiles':
      if (sp.value === undefined) throw new Error(`${what} needs a value`);
      break;
    case 'onHit':
      if (sp.type === undefined) throw new Error(`${what} needs a type`);
      validateOnHit(types, sp.type, what);
      break;
    case 'damageRatio':
      if (!sp.ratio) throw new Error(`${what} needs a ratio`);
      validateDamageRatio(types, sp.ratio, what);
      break;
    case 'electricChain':
      // The special chains *the electric portion*, so a tower whose attack has
      // no electric portion would buy a step that arcs nothing.
      if (!((attack.damageRatio?.electric ?? 0) > 0)) {
        throw new Error(`${what} needs an attack with an electric share`);
      }
      break;
    case 'coneWidth':
      if (sp.mul === undefined) throw new Error(`${what} needs a mul`);
      break;
    case 'burnStacks':
      if (sp.value === undefined) throw new Error(`${what} needs a value`);
      // The special boosts a burn this attack already deals per hit — see
      // `attackProfile`'s doc comment for why that is a dps multiplier and not
      // literal extra Burning stacks (Q112, p10a).
      if (!attack.burn) throw new Error(`${what} needs an attack that already burns`);
      break;
    case 'slowDuration':
      if (sp.seconds === undefined) throw new Error(`${what} needs seconds`);
      break;
    case 'burnPatch':
      if (sp.seconds === undefined) throw new Error(`${what} needs seconds`);
      break;
    default:
      throw new Error(`${what} is not a special the engine pays out`);
  }
}

/**
 * Gate **G20**: "every §5 milestone special measurably changes the attack it
 * names, and the loader validates it." `validateSpecial` above checks that a
 * special is structurally well-formed (the right companion field, a kind that
 * reads it); this checks the thing G20 actually asks for — that buying the
 * step changes what `attackProfile` (`upgrades.ts`) computes, so a special
 * that parses clean but folds into a no-op (the wrong kind restriction typo'd
 * away, a `slowDuration` milestone that repeats the base `slowDuration` *or
 * an earlier milestone's own `seconds` on the same track*, and so on) is
 * still a load error rather than a step the player pays for and receives
 * nothing from.
 *
 * Compares the profile one step below `sp.at` (the special not yet active)
 * against `sp.at` itself (active) on the tower's own **real** `upgrades`
 * track, not a synthetic single-special one (QA, this item's own review): a
 * synthetic track can only ever compare `sp` against the attack's absolute
 * unmilestoned default, so a second special repeating a *different, earlier*
 * milestone's value on the same real track reads as "changes the profile"
 * (it does differ from the bare default) when it does not actually change
 * anything past what the earlier milestone already set. Passing the real
 * track keeps every other, already-active special live in both snapshots, so
 * only the one flip `sp.at` itself causes is what gets measured.
 */
export function validateSpecialChangesProfile(
  sp: UpgradeSpecial,
  attack: TowerAttack | null,
  upgrades: { count: number; stepCost: number; specials: UpgradeSpecial[] },
  where: string,
): void {
  if (!attack) return; // validateSpecial already rejects this case.
  const before = attackProfile({ attack, upgrades }, sp.at);
  const after = attackProfile({ attack, upgrades }, sp.at + 1);
  if (JSON.stringify(before) === JSON.stringify(after)) {
    throw new Error(`${where} special "${sp.key}" does not change the attack it names`);
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
export type VsSpecial = z.infer<typeof VsSpecialSchema>;
export type EnemyDef = z.infer<typeof EnemySchema>;
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
export type CoreDef = z.infer<typeof CoresFileSchema>['cores'][number];

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
  cores: z.infer<typeof CoresFileSchema>;

  towerByKey: Map<string, TowerDef>;
  towerById: Map<number, TowerDef>;
  enemyByKey: Map<string, EnemyDef>;
  enemyById: Map<number, EnemyDef>;
  boonByKey: Map<string, BoonDef>;
  treeById: Map<number, TreeNode>;
  classByKey: Map<string, ClassDef>;
  modifierByKey: Map<string, ModifierDef>;
  affinityByClass: Map<string, AffinityDef>;
  damageTypeByKey: Map<string, DamageTypeDef>;
  coreByKey: Map<string, CoreDef>;
}

/**
 * SPEC-FINAL §5.5: "default: Stone Heart" as a content lookup rather than a
 * hardcoded key repeated at every call site (`World`, `hashWorld`,
 * `buildReport`, the Hub) — `loadContent` already guarantees exactly one row
 * carries `unlockedByDefault`.
 */
export function defaultCoreKey(content: Content): string {
  return content.cores.cores.find((c) => c.unlockedByDefault)!.key;
}

let cached: Content | null = null;

export function loadContent(): Content {
  if (cached) return cached;

  const towers = TowersFileSchema.parse(towersRaw);
  const enemies = EnemiesFileSchema.parse(enemiesRaw);
  const waves = WavesFileSchema.parse(wavesRaw);
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
  const cores = CoresFileSchema.parse(coresRaw);

  // Cross-file referential integrity: a typo in /data must fail loudly at load.
  const towerKeys = new Set(towers.towers.map((t) => t.key));
  const enemyKeys = new Set(enemies.enemies.map((e) => e.key));

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
    const where = `towers.json: ${t.key}`;
    for (const k of t.attack?.onHit ?? []) validateOnHit(damageTypes, k, where);
    if (t.attack?.damageRatio) validateDamageRatio(damageTypes, t.attack.damageRatio, where);
    validateUpgradeTrack(t.upgrades, where);
    validateStepPrice(towers.upgradeTotalCostMul, t, where);
    validateDefense(towers.defenseBands, t.defense, where);
    for (const sp of t.upgrades.specials) {
      validateSpecial(damageTypes, sp, t.attack, where);
      validateSpecialChangesProfile(sp, t.attack, t.upgrades, where);
    }
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

  validateDefaultCore(cores.cores);
  for (const c of cores.cores) validateCoreUpgrade(c);

  cached = {
    warden: wardenBase,
    towers,
    enemies,
    waves,
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
    cores,
    towerByKey: new Map(towers.towers.map((t) => [t.key, t])),
    towerById: new Map(towers.towers.map((t) => [t.id, t])),
    enemyByKey: new Map(enemies.enemies.map((e) => [e.key, e])),
    enemyById: new Map(enemies.enemies.map((e) => [e.id, e])),
    boonByKey: new Map(boons.boons.map((b) => [b.key, b])),
    treeById: new Map(tree.nodes.map((n) => [n.id, n])),
    classByKey: new Map(classes.classes.map((c) => [c.key, c])),
    modifierByKey: new Map(modifiers.modifiers.map((m) => [m.key, m])),
    affinityByClass: new Map(affinity.affinities.map((a) => [a.classKey, a])),
    damageTypeByKey: new Map(damageTypes.types.map((d) => [d.key, d])),
    coreByKey: new Map(cores.cores.map((c) => [c.key, c])),
  };
  return cached;
}
