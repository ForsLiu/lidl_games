/**
 * Content loading + schema validation (SPEC 9.3).
 * All tuning lives in /data; nothing here invents numbers.
 */
import { z } from 'zod';

import { attackProfile } from './upgrades';
import { Hasher } from './hash';
import { STAT_KEYS } from './statkeys';
import towersRaw from '../../data/towers.json';
import enemiesRaw from '../../data/enemies.json';
import wavesRaw from '../../data/waves.json';
import spawnsRaw from '../../data/spawns.json';
import vsupgradesRaw from '../../data/vsupgrades.json';
import treeRaw from '../../data/tree.json';
import modifiersRaw from '../../data/modifiers.json';
import classesRaw from '../../data/classes.json';
import questsRaw from '../../data/quests.json';
import devRaw from '../../data/dev.json';
import wardenRaw from '../../data/warden.json';
import damageTypesRaw from '../../data/damagetypes.json';
import coresRaw from '../../data/cores.json';
import equipmentRaw from '../../data/equipment.json';

/**
 * b013/E3: every `/data` number goes through this one alias, so "refuses a
 * non-finite number anywhere in /data" is one `.finite()` here rather than a
 * hundred call sites remembering it individually. `1e999` (a real hand-edit)
 * and any other route to `Infinity`/`-Infinity` are the only things this adds
 * over plain `z.number()` — `NaN` has no JSON spelling, so it was already
 * unreachable from a file on disk.
 */
const num = z.number().finite();
const str = z.string();
/** fb005: color fields reject `""` so an empty string can't silently bypass the documented white fallback. */
const hexColor = z.string().min(1);

/**
 * b013/E6: a `Record<string, number>` authoring path that is read back by
 * *name* against a fixed, known set of keys — an invented or misspelled key
 * would otherwise load clean and silently buy nothing. Generic over the
 * allow-list so the same shape covers both a `Stats.addAll` record
 * (`statRecord` below) and a record read by a fixed dispatch table that is
 * not `Stats` at all (`MODIFIER_EFFECT_KEYS`).
 */
function recordWithKeys(allowed: readonly string[], value: z.ZodTypeAny = num) {
  const allowedSet = new Set<string>(allowed);
  return z.record(str, value).refine(
    (rec) => Object.keys(rec).every((k) => allowedSet.has(k)),
    (rec) => ({
      message: `unknown key(s): ${Object.keys(rec)
        .filter((k) => !allowedSet.has(k))
        .join(', ')}`,
    }),
  );
}

/**
 * b022: a `Stats.add` contribution's value, bounded well clear of the real
 * content range (the largest authored stat mod today is 150, tree.json's
 * Core HP node) but tight enough that no plausible number of summed/
 * multiplied sources can overflow `Stats.total`/`factor` to ±Infinity —
 * unlike plain `num`, which only rejects non-finite values and would still
 * accept something like `1.5e308`.
 */
const statNum = num.min(-1e6).max(1e6);

/**
 * A record fed straight into `Stats.addAll` by key. `extraKeys` widens the
 * allow-list for the handful of records that share the shape but also carry
 * a few bespoke, non-`Stats` fields read directly by name elsewhere (see the
 * `ClassSlotPassiveSchema.mods` call site below).
 */
function statRecord(extraKeys: readonly string[] = []) {
  return recordWithKeys([...STAT_KEYS, ...extraKeys], statNum);
}

/**
 * b013/E4: an array whose rows must be unique by one or more fields — a
 * pushed-duplicate row would otherwise parse clean and then silently
 * collapse into the later one the instant `loadContent()` builds a `Map`
 * keyed by that field.
 */
function uniqueArray<T extends z.ZodTypeAny>(
  row: T,
  keys: (keyof z.infer<T>)[],
  minLength = 1,
) {
  return z
    .array(row)
    .min(minLength)
    .refine(
      (rows) => {
        for (const k of keys) {
          const seen = new Set<unknown>();
          for (const r of rows as Record<string, unknown>[]) {
            const v = r[k as string];
            if (seen.has(v)) return false;
            seen.add(v);
          }
        }
        return true;
      },
      (rows) => {
        for (const k of keys) {
          const seen = new Set<unknown>();
          for (const r of rows as Record<string, unknown>[]) {
            const v = r[k as string];
            if (seen.has(v)) return { message: `duplicate ${String(k)} "${String(v)}"` };
            seen.add(v);
          }
        }
        return { message: 'duplicate row' };
      },
    );
}

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
    damage: num.nonnegative(),
    /** b013/E2: an interval <= 0 is the unbounded-fire-loop shape a data typo would ship. */
    interval: num.positive(),
    /** b013/E2: a range <= 0 can never acquire a target. */
    range: num.positive(),
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
  /** b013/E2: a negative cost would pay the player to build. */
  cost: num.nonnegative(),
  /**
   * SPEC-V3 §4 armour points for the structure itself, read through m19a's
   * curve by `structureArmor` — flat percent off normal damage taken. m20c
   * turned §4's profile words into the three `defenseBands`, so this is a
   * band value and not a free number (Q80); the Palisade and the Sprout sit
   * at `none`, which is exactly x1, for reasons Q80 records.
   */
  defense: num,
  upgrades: UpgradeTrackSchema,
  /** b013/E2: hp <= 0 is a structure that is already dead on load. */
  hp: num.positive(),
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
  /** b013/E4: a duplicate `key` or `id` would collapse into the later row the instant `towerByKey`/`towerById` builds its `Map`. */
  towers: uniqueArray(TowerSchema, ['key', 'id']),
}).strict();

/* ----------------------------------------------------------------- enemies */

export const EnemySchema = z.object({
  id: num,
  key: str,
  name: str,
  grade: z.enum(['F', 'S', 'E', 'B']),
  /** b013/E2: hp <= 0 is an enemy that is already dead on load. */
  hp: num.positive(),
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

const EnemiesFileSchema = z.object({ enemies: uniqueArray(EnemySchema, ['key', 'id']) });

/* ------------------------------------------------------------------- waves */

const WaveGroupSchema = z.object({
  enemy: str,
  perGate: num.optional(),
  total: num.optional(),
});

const WavesFileSchema = z.object({
  hpScalePerWave: num,
  buildPhaseSeconds: num,
  waveClearBase: num,
  waveClearPerWave: num,
  startGold: num,
  coreHp: num,
  spawnIntervalSeconds: num,
  enemyStructureDpsFactor: num,
  /** b013/E7: an empty roster is a Day with nothing to defend against. */
  waves: z.array(z.object({ wave: num, groups: z.array(WaveGroupSchema) })).min(1),
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
  /** SPEC-FINAL §9: VS budget's per-wave-index growth (p8a); optional, defaults to 1 (no cross-wave escalation) for back-compat. */
  budgetGrowthPerVsWave: num.optional(),
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
  /** fb008: gold per point of gem EXP that overflows past the current level-up need. */
  expToGoldRatio: num,
  costs: z.record(num),
  weightsByMinute: z.array(z.object({ minute: num, weights: z.record(num) })),
  eliteWeights: z.record(num),
});

/* ------------------------------------------------------------- vsupgrades */

/**
 * SPEC-FINAL §6.3: the VS level-up pool has three card families — stat
 * boons (this shape), Type Mastery (one entry, applied per built tower
 * type) and per-class skill cards (`SkillCardSchema` below). Superseded by
 * this rewrite: fb011's "uncapped" boons (`feature-remove-boon-rank-caps`)
 * — §6.3 states a fixed `rank x5` for stat boons with no uncapped clause,
 * so that verdict does not carry forward to the new pool (logged Q144).
 */
const BoonSchema = z.object({
  key: str,
  name: str,
  maxRank: num,
  /** b013/E6: a boon's `stat` is read straight into `Stats.add` by key — an invented one would grant nothing. */
  stat: z.enum(STAT_KEYS),
  perRank: num,
  desc: str,
});

const TypeMasterySchema = z.object({ maxRank: num, perRank: num });

/**
 * `effect` dispatches how `applyOffer`/`classes.ts` read the card:
 * `active1_potency`/`active2_cdr` are generic (every class gets exactly
 * one of each, read by key-less helpers in `progression.ts`); `class_line`
 * is the bespoke third card, whose specific field it bumps is class-specific
 * engine code, not data (the data only carries its rank/magnitude).
 */
const SkillCardSchema = z.object({
  key: str,
  name: str,
  effect: z.enum(['active1_potency', 'active2_cdr', 'class_line']),
  maxRank: num,
  perRank: num,
  desc: str,
});

const VsUpgradesFileSchema = z.object({
  rerollsPerLevel: num,
  statBoons: uniqueArray(BoonSchema, ['key']),
  typeMastery: TypeMasterySchema,
  skillCards: z.record(z.array(SkillCardSchema)),
});

/* -------------------------------------------------------------------- tree */

const TreeNodeSchema = z.object({
  id: num,
  branch: str,
  kind: z.enum(['start', 'small', 'notable', 'keystone']),
  key: str.optional(),
  name: str,
  desc: str,
  /** b013/E6: fed straight to `Stats.addAll` by key — an invented stat name would grant nothing. */
  stats: statRecord(),
  x: num,
  y: num,
  /** b013/E5: authored on every node but the root — named explicitly rather than left to fall through. */
  angle: num.optional(),
  ring: num.optional(),
  links: z.array(num),
  // b013/E5 (code-reviewer, pre-commit): `.strict()` so a future unschemad
  // field on a tree node is a load error, the same fate `angle`/`ring` used
  // to escape, rather than silently dropped again for whatever comes next.
}).strict();

const TreeFileSchema = z.object({
  /** p7d (§8.3, Q46): skill points are the tree's only currency — 1 point per node. */
  respecCostPerNode: num,
  /** b013/E4/E7: a duplicate `id` would collapse a node's links onto the wrong target; an empty tree has nothing to spend a point on. */
  nodes: uniqueArray(TreeNodeSchema, ['id']),
});

/* --------------------------------------------------------------- modifiers */

/**
 * b013/E6: `world.ts`'s `ModifierEffects` reads exactly these keys off a
 * modifier's `effect` bag by name (`this.mods.enemyHp += e.enemyHp`, and so
 * on) — an invented key would load clean and silently do nothing, the same
 * shape `statRecord` closes for a `Stats`-routed record.
 */
const MODIFIER_EFFECT_KEYS = [
  'enemyHp',
  'enemySpeed',
  'extraGates',
  'extraWaves',
  'pickupMul',
  'residualMul',
  'eliteMul',
  'riftMul',
  'ghostWeightMul',
  'bossHp',
  'buildPhase',
  'coreHp',
] as const;

const ModifiersFileSchema = z.object({
  tierRewardPerStep: num,
  modifiers: uniqueArray(
    z.object({ key: str, name: str, desc: str, effect: recordWithKeys(MODIFIER_EFFECT_KEYS), rewardBonus: num }),
    ['key'],
  ),
});

/* ----------------------------------------------------------------- classes */

/**
 * SPEC-FINAL §4 class framework, p6a: bands + Passive + Active1 (Q) +
 * Active2 (E) + Tower passive. No Day-use/Night-use and no Signature — those
 * were SPEC-V2 §2's single-Active shape, retired at p6f (Q38).
 *
 * `kind` is an open-for-extension dispatch tag, still just `burst_damage`
 * until p6b/p6c/p6d add the kit-specific kinds (charge, dash-line, ground
 * effect, ...) their own owner-specced abilities need.
 */
const ClassEffectSchema = z.object({
  name: str,
  /**
   * `charge_nova` (p6b, Circle Slash) and `dash_line` (p6b, Dash Slash) are
   * the first two kinds past the framework's `burst_damage`. `radius`/
   * `damage` above double as each kind's full-charge (or flat) value; the
   * `min*` fields below are the zero-charge floor a `charge_nova` scales up
   * from (Q118). `ground_poison` (p6c, Poison Barrel) and `poison_boost`
   * (p6c, Poison Boost) are the third and fourth kinds (Q119): a
   * self-centered `GroundArea('poison')` that outlives its own cooldown, and
   * a global instant effect with no target/radius of its own (`damage`/
   * `radius` are unused placeholders on that row, the same precedent Dash
   * Slash's own unused `radius: 0` already set — Q118's Nit).
   */
  kind: z.enum([
    'burst_damage',
    'charge_nova',
    'dash_line',
    'ground_poison',
    'poison_boost',
    // p6d, §4.2's nine remaining kits. One tag per named ability rather than a
    // shared "generic" kind: every one of them reads a different set of the
    // optional fields below, and a mismatched pair is a load error
    // (`validateClassEffect`) instead of an Active that fires nothing.
    'charge_pierce',
    'dash_volley',
    'repair_heal',
    'summon_turret',
    'frost_nova',
    'ice_wall',
    'chain_lightning',
    'overload',
    'dash_trail',
    'raise_skeletons',
    'death_pact',
    'manifest_spirit',
    'recall_totem',
    'clarion_taunt',
    'judgement',
    // Bloodlord's two, which the p6d design note's kind list omitted (Q120).
    'blood_tithe',
    'dash_heal',
    // fb013, §4.2 addition: Time Lord's Active1 "Time" (a 4-stage per-enemy
    // mark, advanced one stage per hit) and Active2 "Time Lock" (a no-exit
    // zone). Both are the first kinds to author `maxCharges`/`rechargeSeconds`
    // — an ammo-style multi-charge gate distinct from `charge_nova`'s
    // hold-to-charge-power (`isChargeKind`), see `tickAmmoRecharge` (classes.ts).
    'time_mark',
    'time_lock',
  ]),
  /** b013/E2: a <= 0 cooldown is the unbounded-recast shape a data typo would ship. */
  cooldownSeconds: num.positive(),
  /** Not `.positive()`: `dash_line`'s own precedent authors `radius: 0` as an unused placeholder — see the doc comment above. */
  radius: num.nonnegative(),
  damage: num.nonnegative(),
  slow: num.optional(),
  slowDuration: num.optional(),
  burnDps: num.optional(),
  burnDuration: num.optional(),
  /** `charge_nova` only: nova radius/damage at zero charge (`radius`/`damage` above are the full-charge values). */
  minRadius: num.optional(),
  minDamage: num.optional(),
  /** `charge_nova` only: max instant-reposition distance dealt to a struck enemy at full charge (Q118 reads SPEC-FINAL's "knockback" as an instant reposition — the sim has no velocity-impulse mechanism). */
  knockback: num.optional(),
  /** `charge_nova` only: charge time (seconds) at which the scale above reaches 1; holding longer holds at the cap rather than growing further or force-firing (§4.1's "charge time is unlimited"). */
  chargeCapSeconds: num.optional(),
  /** `dash_line` only: dash travel distance and the line's perpendicular half-width. */
  dashRange: num.optional(),
  dashWidth: num.optional(),
  /** `ground_poison` only (p6c, Q119): seconds the ground zone persists after being cast — §4.1's "for 5 s", distinct from `cooldownSeconds` (the Active's own recast timer). */
  groundDurationSeconds: num.optional(),

  /* -------------------------------------------------- p6d, §4.2 kit fields */

  /** `charge_pierce` (Deadeye Draw): damage growth per held second, compounding — 0.4 is §4.2's "+40%/s". */
  compoundPerSecond: num.optional(),
  /** `charge_pierce`: move-speed multiplier while drawing — 0.6 is §4.2's "move −40%". */
  moveMulWhileCharging: num.optional(),
  /** `charge_pierce`: most enemies one released shot may pass through (a perf rail on "+1 pierce per full second"). */
  pierceCap: num.optional(),
  /** `summon_turret`/`raise_skeletons`/`manifest_spirit`: how long one summon lives. */
  summonDurationSeconds: num.optional(),
  /** ... how many of that kind may stand at once; a cast past the cap evicts the oldest. */
  summonCap: num.optional(),
  /** ... the fraction of its reference's stats the summon carries (§4.2's "30% stats" / "40% of char attack"). */
  summonStatMul: num.optional(),
  /** ... how far the cast reaches for what it consumes or clones (corpses, a built tower). */
  summonRadius: num.optional(),
  /** `ice_wall`: seconds the temporary wall stands before it is removed outright. */
  wallSeconds: num.optional(),
  /** `chain_lightning`: jumps the bolt makes before Overload's bonus. */
  chainCount: num.optional(),
  /** `chain_lightning`: §4.2 Conduction's per-jump compounding growth — 0.2 is "+20% per jump". */
  chainGrowth: num.optional(),
  /** `chain_lightning`: the jump index the compounding stops at ("cap 8 jumps"), which is what gate G11 bounds. */
  chainCap: num.optional(),
  /** `overload`: seconds the window lasts. */
  overloadSeconds: num.optional(),
  /** `overload`: extra `chain_lightning` jumps granted while it runs. */
  overloadExtraChains: num.optional(),
  /** `dash_trail`: ground-fire patches dropped along the dash line. */
  trailSegments: num.optional(),
  /** `death_pact`: the pacted tower's damage and attack-speed bonuses, and the max-HP fraction it burns per second. */
  pactDamageMul: num.optional(),
  pactAtkSpdMul: num.optional(),
  pactDrainPerSecond: num.optional(),
  /** `death_pact`: the Bone Pylon a pact tower leaves behind when the drain kills it. */
  pylonDps: num.optional(),
  pylonRange: num.optional(),
  pylonInterval: num.optional(),
  /** `recall_totem`: the attack-speed bonus the totem projects, and how long it stands. */
  auraAtkSpdMul: num.optional(),
  totemDurationSeconds: num.optional(),
  /**
   * `recall_totem`: how long its per-tick taunt re-tag (Q120 ORDER 1) lasts
   * before decaying — refreshed every tick an enemy stays in its radius, so
   * this is only ever the tail after it leaves, not the totem's own
   * lifetime. Optional with a `?? 0.5` fallback (classes.ts) since it is not
   * itself a §4.2-stated number.
   */
  totemTauntTickSeconds: num.optional(),
  /** `clarion_taunt`: seconds the taunt window runs. */
  tauntDurationSeconds: num.optional(),
  /** `judgement`: multiplier on stored Wrath when it is released ("stored x1.5"). */
  wrathDamageMul: num.optional(),
  /** `repair_heal`: fraction of max HP restored, and the overclock it leaves behind. */
  repairFraction: num.optional(),
  overclockAtkSpdMul: num.optional(),
  overclockSeconds: num.optional(),
  /** `dash_volley`: how many arrows the dash fires (§4.2's "3 arrows"). */
  volleyShots: num.optional(),
  /** `blood_tithe`: the share of current HP the tower pays once, and the permanent damage bonus it buys. */
  titheHpFraction: num.optional(),
  titheDamageMul: num.optional(),
  /** `dash_heal` (Crimson Rush): HP restored per enemy the dash passes through. */
  healPerEnemy: num.optional(),
  /**
   * `summon_turret`/`ice_wall`: which `data/towers.json` row the ability copies
   * (Pop Turret's "mini arrow turret") or places (Ice Wall's palisades).
   * Checked against the real roster at load, so a renamed tower is a load
   * error rather than an Active that silently does nothing.
   */
  towerKey: str.optional(),

  /**
   * `time_mark`/`time_lock` (fb013): an ammo-style multi-charge Active — N
   * charges, each spent on cast and refilled independently on its own
   * `rechargeSeconds` timer (`tickAmmoRecharge`, classes.ts). Absent or `1`
   * keeps every other kind's existing single `cooldownSeconds` gate untouched.
   */
  maxCharges: num.optional(),
  rechargeSeconds: num.optional(),
  /** `time_mark`: seconds back the unmarked->past stage rewinds a struck enemy's position (default 3, §4.2's "3 s-ago"). */
  markRewindSeconds: num.optional(),
  /** `time_mark`: the unmarked->past stage's "high DoT" (a flat dps/duration pair, applied as Bleeding — Q139 reads "high DoT" as a stated magnitude rather than a new 7th damage type, which §13's content totals fix at six). */
  markPastDotDps: num.optional(),
  markPastDotSeconds: num.optional(),
  /** `time_mark`: the past->present stage's own "high DoT", on top of the stun-lock (which reuses `frozen`'s own authored 3 s — Q139). */
  markPresentDotDps: num.optional(),
  markPresentDotSeconds: num.optional(),
  /** `time_mark`: the present->future stage's "-20% atk/move speed" (deferred while stunned/frozen) and its duration. */
  markFutureSlowAmount: num.optional(),
  markFutureSlowSeconds: num.optional(),
  /** `time_mark`: the present->future stage's "DoT equal to remaining HP" — the seconds that total is spread over. */
  markFutureDotSeconds: num.optional(),
  /** `time_mark`: the future stage's execute — the elite/boss branch deals this fraction of current HP instead of an instant kill. */
  markEliteExecuteFraction: num.optional(),
  /** `time_lock`: seconds the "high DoT" a trapped enemy takes on entry is spread over (`groundDurationSeconds` is the zone's own no-exit lifetime, reused rather than a second duration field). */
  zoneDotSeconds: num.optional(),
});

/**
 * Passive and Tower passive are both, at minimum, an always-on named source
 * of generic stat contributions — the same `effects: Record<string,number>`
 * shape `data/cores.json` already uses for a Core's always-on numbers
 * (`p-core-b`). `mods` folds into `Stats` by key name (`baseRunStats`,
 * `stats.ts`) via the same `addAll` an unknown-key already ignores, so a
 * class whose passive is pure flavor (no stat line) just omits it. A passive
 * whose effect cannot be expressed as a stat bag (Thousand Cuts' on-hit
 * Bleeding, Spreading Plague's on-death transfer) gets bespoke engine code
 * from the item that authors it (p6b/p6c/p6d), the same way Carnivorous
 * Plant's/Corpse's non-stat Core effects got bespoke `updateX` functions
 * beyond `cores.json`'s own `effects` dict.
 */
/**
 * b013/E6: `classes.ts`/`towers.ts` read these four class-passive `mods` keys
 * directly by name (bespoke, non-`Stats` fields — see `info-format.ts`'s own
 * comment on `towerDamageVsBurning`), so a passive's `mods` record is
 * `STAT_KEYS` plus this short, exhaustive extra set rather than `STAT_KEYS`
 * alone.
 */
const CLASS_PASSIVE_BESPOKE_MOD_KEYS = [
  'towerDamageVsBurning',
  'towerLowHpDamageBonus',
  'towerDamageVsChilled',
  'towerExtraElectricPct',
] as const;

const ClassSlotPassiveSchema = z.object({
  name: str,
  description: str,
  mods: statRecord(CLASS_PASSIVE_BESPOKE_MOD_KEYS).default({}),
  /**
   * Non-stat-shaped passives (Thousand Cuts' on-hit Bleeding, p6b;
   * Spreading Plague's on-death transfer, p6c) get their own bespoke
   * dispatch tag here, the same `kind`-dispatches-to-engine-code pattern
   * `active1`/`active2` already use, rather than living in `mods` where an
   * unrecognized key would silently do nothing (Q118).
   */
  kind: z
    .enum([
      'thousand_cuts',
      'spreading_plague',
      // p6d, §4.2: Pyro's burning-touch aura, Necromancer's corpse drop,
      // Cryomancer's frost-on-hit/freeze/shatter chain, Paladin's stand-still
      // armour + Wrath ledger, Bloodlord's phase-dependent attack bonus.
      'contagious_flame',
      'corpse_drop',
      'frost_touch',
      'guardian_stance',
      'blood_frenzy',
      // fb013: Time Lord's character-passive (damage taken becomes a DoT) and
      // tower-passive (a free range/AoE level every N TD waves) kinds.
      'time_flow',
      'chronal_surge',
    ])
    .optional(),
  /** `contagious_flame`: damage per second a Burning enemy deals to everything within `flameRadius`. */
  flameDps: num.optional(),
  flameRadius: num.optional(),
  /** `corpse_drop`: seconds a corpse lies before it fades. */
  corpseSeconds: num.optional(),
  /** `frost_touch`: hits-while-frosted needed to freeze, and the shatter a frozen death leaves. */
  freezeHits: num.optional(),
  shatterRadius: num.optional(),
  shatterDamage: num.optional(),
  /** `guardian_stance`: armour granted, the stand-still seconds that earn it, and the share of damage that becomes Wrath. */
  stanceArmor: num.optional(),
  stanceSeconds: num.optional(),
  wrathFraction: num.optional(),
  /** `blood_frenzy`: §4.2's "+10% attack in VS waves, −5% in TD waves", as multipliers. */
  frenzyVsMul: num.optional(),
  frenzyTdMul: num.optional(),
  /**
   * `time_flow` (fb013): a dormant, shipped-disabled multiplier on how fast
   * the Warden's converted DoT resolves — `1` (the authored default) is
   * normal speed; the fiction's "100% faster" is `2`, reserved for a future
   * equipment item to grant, on the same one-field-flip precedent Burning's
   * `maxStacks` sets (MIGRATION.md §8's note on that row) rather than new
   * engine code. Read with a `?? 1` fallback, so its absence is inert too.
   */
  charDotSpeedMul: num.optional(),
  /** `chronal_surge` (fb013): every `waveInterval` TD waves cleared, towers gain one free uncapped range/AoE bump (`completeWave`, run.ts) — no milestone triggers, just `bonusRangeMul`/`bonusAoeMul` folded into the ordinary `towerRange`/`area` Stats sources. */
  waveInterval: num.optional(),
  bonusRangeMul: num.optional(),
  bonusAoeMul: num.optional(),
});

/**
 * §4's basic attack: "every class auto-attacks the nearest enemy with its
 * band profile." The range/dmg/spd/aoe band columns SPEC-FINAL's tables give
 * as low/medium/high are resolved to real numbers here, per the architecture
 * rule that content and numbers live in `/data`, never in code (`aoe: 0`
 * means single-target; `> 0` is a splash radius around the primary target).
 */
const ClassBasicAttackSchema = z.object({
  dps: num.positive(),
  range: num.positive(),
  /** b013/E2: same unbounded-fire-loop shape as a tower's own attack interval. */
  interval: num.positive(),
  aoe: num.nonnegative(),
});

const ClassSchema = z.object({
  key: str,
  name: str,
  unlockedByDefault: z.boolean(),
  unlockQuest: str.nullable(),
  /** §4's "move" band, resolved to a fractional bonus into the `moveSpeedPct` stat. */
  moveSpeedBonus: num,
  basicAttack: ClassBasicAttackSchema,
  passive: ClassSlotPassiveSchema,
  active1: ClassEffectSchema,
  active2: ClassEffectSchema,
  towerPassive: ClassSlotPassiveSchema,
});

const ClassesFileSchema = z.object({
  classes: uniqueArray(ClassSchema, ['key']),
});

/**
 * SPEC-FINAL §5.5: the Core is chosen at run start, keeps its existing TD
 * rules (target, HP 0 in TD = defeat), and its upgrade steps are bought at
 * flat cost — no `costMul`, no default +10%, never sellable — so its schema
 * carries only `count`/`stepCost` (no `costMul`/`note`, unlike a tower's
 * `UpgradeTrackSchema`). `p-core-a` was the plumbing half only: selection,
 * hashing and loader validation, with no numeric gameplay effect anywhere.
 *
 * `p-core-b` gives a Core's numbers somewhere to live: `effects` is the
 * always-on base row (no step required — Vampire Heart's VS lifesteal, Time's
 * TD slow aura and VS speed are all live the instant the Core is chosen), and
 * `upgrade.steps` is a per-step numeric delta, folded cumulatively as steps
 * are bought (`computeCoreState`, `src/sim/cores.ts`). Both are untyped
 * dictionaries rather than a `SPECIAL_KEYS`-style enum on purpose: the five
 * Cores' step shapes are too heterogeneous (a flat HP add, a ratio override, a
 * decay-radius jump) to share one struct the way a tower's milestone specials
 * do, and every numeric key this project actually reads is named in
 * `src/sim/cores.ts`'s `computeCoreState`/`coreHpBonus`. A core or a step with
 * no gameplay wired yet (Carnivorous Plant, Corpse, Time's steps 3-5) simply
 * omits `effects`/`steps` entries — `p-core-c` through `p-core-e`'s job, not
 * a loader gap, since an *absent* key already resolves to a zero-effect
 * default in `computeCoreState`.
 */
/**
 * b013/E6: `cores.ts`'s `computeCoreState` reads a Core's per-step delta by
 * name off a fixed, hand-enumerated set of fields (plus `coreHpBonus`, read
 * by `coreHpBonus()` the same way) — an invented key here would price a step
 * that buys nothing, the same silent-no-op class `validateSpecial` already
 * guards on a tower's own milestone track.
 */
const CORE_STEP_KEYS = [
  'towerOverhealConverts',
  'overhealGoldRatio',
  'towerLifestealBonus',
  'goldPerSecond',
  'hpRegenPerSecond',
  'healingReceivedPct',
  'devourRangeBonus',
  'devourCooldownReduction',
  'storeRatio',
  'executeExplode',
  'autoFireInterval',
  'decayRadius',
  'decayMult',
  'coreHpBonus',
] as const;

/** `computeCoreState`'s always-on `effects` row, plus the two keys `world.ts` routes through `Stats` directly (`vsLifestealPct`, `vsXpGainPct`). */
const CORE_EFFECT_KEYS = [
  'towerLifestealPct',
  'missingHpBuffPerPct',
  'missingHpBuffCap',
  'vsLifestealPct',
  'overhealGoldRatio',
  'tdSlowRadius',
  'tdSlowPct',
  'vsSpeedPct',
  'devourRadius',
  'devourCooldown',
  'devourEliteDamage',
  'devourCoreHeal',
  'poisonVolleyInterval',
  'poisonStacksPerBullet',
  'poisonVolleyCap',
  'poisonBulletDamage',
  'corpseStoreRatio',
  'corpseExecuteInterval',
  'corpseExplodeRadius',
  'vsXpGainPct',
] as const;

const CoreUpgradeSchema = z
  .object({
    count: z.number().int().min(0),
    stepCost: num,
    desc: str,
    /** Per-step numeric deltas, index 0 = step 1. May be shorter than `count`. */
    steps: z.array(recordWithKeys(CORE_STEP_KEYS)).optional(),
  })
  .strict();

const CoreSchema = z
  .object({
    key: str,
    name: str,
    baseHp: num.positive(),
    unlockedByDefault: z.boolean(),
    unlockCondition: str.nullable(),
    /** p7h (§5.5, §8.4): the machine-checkable twin of `unlockCondition`'s display text — mirrors `ClassSchema.unlockQuest`. */
    unlockQuest: str.nullable(),
    upgrade: CoreUpgradeSchema,
    /** Always-on base numbers, live the instant the Core is chosen — no step required. */
    effects: recordWithKeys(CORE_EFFECT_KEYS).optional(),
  })
  .strict();

const CoresFileSchema = z.object({ cores: uniqueArray(CoreSchema, ['key']) });

/* --------------------------------------------------------------- equipment */

/**
 * SPEC-FINAL §7's owner equipment table, fb015. `mods` is a plain `Stats`
 * contribution bag — every numeric column (HP/Atk/Def/AtkSpd/Move) and every
 * effect line that reduces to a stat (Bleeding Ring's lifesteal, Builder's
 * Necklace's flat tower attack, the bracelets' area/range bonuses) folds in
 * here rather than earning bespoke engine code, the same `addAll`-onto-`Stats`
 * precedent a Constellation node's stats and a class's passive already set.
 *
 * `effectKey` is the escape hatch for the three lines that cannot be a stat —
 * Sleeve Sword's no-charge Circle Slash, Swordsman Armor's charge-speed/
 * cross-item damage rule, Swordsman Shoes' doubled Dash Slash distance — all
 * three read straight off `cls.active1`/`active2`'s *kind*, not off a name, so
 * they are inert (not merely unauthored) on every class without that kind.
 *
 * `classFallback` is the owner table's own "if not <class>: ..." lines, kept
 * data-driven (CLAUDE.md architecture rule 4) rather than a hardcoded class
 * check per item: an extra `Stats` source granted only when the run's class
 * does not match `notClassKey`.
 *
 * `effectNote`/`effectNoteWith` (fb028) are the UI's one authored copy of what
 * an `effectKey !== 'none'` item's non-Stats-shaped mechanic does — the same
 * sentence `desc` already states in prose, pulled out as its own field so
 * `equipment-info.ts` can show it with a live number substituted for `{mul}`
 * without hand-writing a second, driftable copy of the sentence in code.
 * `effectNoteWith` is the alternate note (and its own `{mul}` slot) for the
 * one item whose mechanic changes when a second specific item is also
 * equipped (Swordsman Armor + Sleeve Sword) — absent for every other item.
 */
const EquipmentItemSchema = z
  .object({
    key: str,
    slot: str,
    name: str,
    mods: statRecord().default({}),
    effectKey: z.enum(['none', 'sleeve_sword', 'swordsman_armor', 'swordsman_shoes']).default('none'),
    classFallback: z.object({ notClassKey: str, mods: statRecord() }).optional(),
    effectNote: str.optional(),
    effectNoteWith: z.object({ key: str, text: str }).optional(),
    desc: str,
  })
  .strict();

const EquipmentFileSchema = z
  .object({
    slots: z.array(str),
    items: uniqueArray(EquipmentItemSchema, ['key']),
  })
  .strict();

export type EquipmentItem = z.infer<typeof EquipmentItemSchema>;
export type EquipmentFile = z.infer<typeof EquipmentFileSchema>;

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
    /**
     * p10b: an enemy trait (resolved through `enemies.ts`'s `TRAIT` table)
     * that makes this row a no-op against a carrier — Burning authors
     * `burnImmune` here so a new immunity is a data row, not an engine edit.
     */
    immuneTrait: str.optional(),
    desc: str,
    /**
     * fb005: the floating-damage-number and DoT-marker color for this type.
     * Optional so an older/hand-edited file without it still loads; readers
     * fall back to a neutral white, same convention as every other
     * optional-with-a-default field this schema already carries.
     */
    color: hexColor.optional(),
    /** Colorblind-safe variant, shown when Settings.accessiblePalette is on. Falls back to `color`. */
    colorblindColor: hexColor.optional(),
  })
  .strict();

const DamageStatusSchema = z
  .object({
    duration: num,
    attackSpeed: num.optional(),
    moveSpeed: num.optional(),
    damageTaken: num.optional(),
    desc: str,
    /** fb005: same color convention as `DamageTypeSchema`. */
    color: hexColor.optional(),
    colorblindColor: hexColor.optional(),
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
export function validateCoreUpgrade(c: {
  key: string;
  upgrade: { count: number; stepCost: number; steps?: Record<string, number>[] };
}): void {
  const where = `cores.json: ${c.key}`;
  if (c.upgrade.count > 0 && c.upgrade.stepCost <= 0) {
    throw new Error(`${where} has ${c.upgrade.count} upgrade steps and no price for them`);
  }
  if (c.upgrade.count === 0 && c.upgrade.stepCost !== 0) {
    throw new Error(`${where} prices a step at ${c.upgrade.stepCost} and has no steps`);
  }
  // `computeCoreState`/`coreHpBonus` (src/sim/cores.ts) only ever read indices
  // 0..count-1 — an authored step past the real count is dead data nobody can
  // ever buy, almost certainly a copy-paste miscount rather than intent.
  if (c.upgrade.steps && c.upgrade.steps.length > c.upgrade.count) {
    throw new Error(`${where} authors ${c.upgrade.steps.length} step effects for only ${c.upgrade.count} steps`);
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
 * `charge_nova`/`dash_line`'s kind-specific fields (`minRadius`/`minDamage`/
 * `chargeCapSeconds`, `dashRange`/`dashWidth`) are all `.optional()` on
 * `ClassEffectSchema` — necessarily, since only one kind's fields are
 * meaningful on any given row — but `classes.ts` reads a missing one as a
 * silent `?? 0` (a zero-radius nova, a zero-distance dash), not a load
 * error. CLAUDE.md's loader rule ("a rule that refuses unpayable data is
 * worth more than a comment saying the data must be valid") applies here
 * exactly the way it already does to `validateOnHit`/`validateDamageRatio`
 * (code review on p6b: this was a real gap in the framework's first draft,
 * caught before a second `charge_nova`/`dash_line` class could ship
 * through it silently inert).
 */
export function validateClassEffect(eff: ClassEffect, where: string): void {
  if (eff.kind === 'charge_nova') {
    if (eff.minRadius === undefined) throw new Error(`${where}: charge_nova needs minRadius`);
    if (eff.minDamage === undefined) throw new Error(`${where}: charge_nova needs minDamage`);
    if (eff.chargeCapSeconds === undefined) throw new Error(`${where}: charge_nova needs chargeCapSeconds`);
    if (eff.knockback === undefined) throw new Error(`${where}: charge_nova needs knockback`);
  }
  if (eff.kind === 'dash_line') {
    if (eff.dashRange === undefined) throw new Error(`${where}: dash_line needs dashRange`);
    if (eff.dashWidth === undefined) throw new Error(`${where}: dash_line needs dashWidth`);
  }
  if (eff.kind === 'ground_poison') {
    if (eff.groundDurationSeconds === undefined) throw new Error(`${where}: ground_poison needs groundDurationSeconds`);
  }
  for (const [kind, fields] of Object.entries(REQUIRED_EFFECT_FIELDS)) {
    if (eff.kind !== kind) continue;
    for (const f of fields) {
      if ((eff as unknown as Record<string, unknown>)[f] === undefined) {
        throw new Error(`${where}: ${kind} needs ${f}`);
      }
    }
  }
}

/**
 * p6d's half of the rule above, as a table rather than fifteen more `if`
 * blocks: each §4.2 kind against the fields `classes.ts` reads with no sane
 * `?? 0` default. A missing one is an Active that fires and does nothing —
 * the silent-no-op failure this loader exists to refuse.
 */
const REQUIRED_EFFECT_FIELDS: Record<string, readonly string[]> = {
  charge_pierce: ['compoundPerSecond', 'moveMulWhileCharging', 'pierceCap', 'chargeCapSeconds'],
  dash_volley: ['dashRange', 'volleyShots'],
  repair_heal: ['repairFraction', 'overclockAtkSpdMul', 'overclockSeconds'],
  summon_turret: ['summonDurationSeconds', 'summonCap', 'summonStatMul', 'towerKey'],
  raise_skeletons: ['summonDurationSeconds', 'summonCap', 'summonStatMul', 'summonRadius'],
  manifest_spirit: ['summonDurationSeconds', 'summonCap', 'summonStatMul', 'summonRadius'],
  ice_wall: ['wallSeconds', 'towerKey'],
  chain_lightning: ['chainCount', 'chainGrowth', 'chainCap'],
  overload: ['overloadSeconds', 'overloadExtraChains'],
  dash_trail: ['dashRange', 'dashWidth', 'groundDurationSeconds', 'trailSegments'],
  dash_heal: ['dashRange', 'dashWidth', 'healPerEnemy'],
  blood_tithe: ['titheHpFraction', 'titheDamageMul'],
  death_pact: ['pactDamageMul', 'pactAtkSpdMul', 'pactDrainPerSecond', 'pylonDps', 'pylonRange', 'pylonInterval'],
  recall_totem: ['auraAtkSpdMul', 'totemDurationSeconds'],
  clarion_taunt: ['tauntDurationSeconds'],
  judgement: ['wrathDamageMul'],
  time_mark: [
    'maxCharges',
    'rechargeSeconds',
    'markPastDotDps',
    'markPastDotSeconds',
    'markPresentDotDps',
    'markPresentDotSeconds',
    'markFutureSlowAmount',
    'markFutureSlowSeconds',
    'markFutureDotSeconds',
    'markEliteExecuteFraction',
  ],
  time_lock: ['maxCharges', 'rechargeSeconds', 'groundDurationSeconds', 'zoneDotSeconds'],
};

/**
 * Passive-slot half of the same rule (code review on p6d): every field a
 * p6d passive kind reads with a `?? 0` fallback where 0 means "does
 * nothing" — not the kinds whose fallback is already a sane nonzero
 * default (`freezeHits ?? 5`, `corpseSeconds ?? 6`, `stanceSeconds ?? 1`),
 * which a missing field cannot silently neuter.
 */
const REQUIRED_PASSIVE_FIELDS: Record<string, readonly string[]> = {
  contagious_flame: ['flameDps', 'flameRadius'],
  frost_touch: ['shatterRadius', 'shatterDamage'],
  guardian_stance: ['stanceArmor', 'wrathFraction'],
  blood_frenzy: ['frenzyVsMul', 'frenzyTdMul'],
  chronal_surge: ['waveInterval', 'bonusRangeMul', 'bonusAoeMul'],
};

/** Passive-slot counterpart to `validateClassEffect` — see `REQUIRED_PASSIVE_FIELDS`. */
export function validateClassPassive(passive: { kind?: string }, where: string): void {
  for (const [kind, fields] of Object.entries(REQUIRED_PASSIVE_FIELDS)) {
    if (passive.kind !== kind) continue;
    for (const f of fields) {
      if ((passive as unknown as Record<string, unknown>)[f] === undefined) {
        throw new Error(`${where}: ${kind} needs ${f}`);
      }
    }
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
  types: uniqueArray(DamageTypeSchema, ['key']),
  statuses: z.object({ frost: DamageStatusSchema, frozen: DamageStatusSchema }),
  /**
   * fb005: Corpse Core's execution kill (§5.5) is the only "instant, larger,
   * distinct" hit in the game — there is no generic crit mechanic to style
   * (QUESTIONS.md fb005 entry). Optional with a neutral-white/no-scale
   * fallback, same back-compat convention as every field above.
   */
  executeColor: hexColor.optional(),
  colorblindExecuteColor: hexColor.optional(),
  executeFontScale: num.optional(),
});

/* ------------------------------------------------------------------ quests */

const QuestsFileSchema = z.object({
  /** b013/E4/E7: a duplicate `key` would collapse a class's own unlock quest onto the wrong reward; an empty log would leave every non-free class permanently unobtainable. */
  quests: uniqueArray(
    z.object({
      key: str,
      name: str,
      desc: str,
      metric: str,
      target: num,
      compare: z.enum(['gte', 'lte']),
      reward: z.object({ kind: str, value: str }),
    }),
    ['key'],
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
export type SkillCardDef = z.infer<typeof SkillCardSchema>;
export type TreeNode = z.infer<typeof TreeNodeSchema>;
export type ModifierDef = z.infer<typeof ModifiersFileSchema>['modifiers'][number];
export type ClassDef = z.infer<typeof ClassesFileSchema>['classes'][number];
export type ClassEffect = z.infer<typeof ClassEffectSchema>;
/** Exported so a test can drive "a class missing a slot fails the loader" directly (p6a, G2). */
export { ClassesFileSchema };
export type QuestDef = z.infer<typeof QuestsFileSchema>['quests'][number];
export type DamageTypeDef = z.infer<typeof DamageTypeSchema>;
export type DamageStatusDef = z.infer<typeof DamageStatusSchema>;
export type DamageTypesFile = z.infer<typeof DamageTypesFileSchema>;

/**
 * fb005: every §3 damage type, the two statuses, and Corpse Core's execution
 * kill must render as a *visibly distinct* color, in both the normal and
 * colorblind-safe palettes — a loader rule, not a hope. Unset/empty colors
 * default to white (the readers' own fallback, `damagetypes.ts`'s
 * `damageStyleColor`/`executeStyle`), so two rows that both forget to author
 * a color collide here too, the same way an all-white regression would.
 */
export function validateDamageStyleColors(damageTypes: DamageTypesFile): void {
  const rows: { key: string; color: string; colorblindColor: string }[] = [
    ...damageTypes.types.map((d) => ({
      key: d.key,
      color: d.color || '#ffffff',
      colorblindColor: d.colorblindColor || d.color || '#ffffff',
    })),
    ...(['frost', 'frozen'] as const).map((k) => {
      const st = damageTypes.statuses[k];
      return { key: k, color: st.color || '#ffffff', colorblindColor: st.colorblindColor || st.color || '#ffffff' };
    }),
    {
      key: 'execute',
      color: damageTypes.executeColor || '#ffffff',
      colorblindColor: damageTypes.colorblindExecuteColor || damageTypes.executeColor || '#ffffff',
    },
  ];
  const seenNormal = new Map<string, string>();
  const seenColorblind = new Map<string, string>();
  for (const r of rows) {
    const normalKey = r.color.toLowerCase();
    const colorblindKey = r.colorblindColor.toLowerCase();
    const dupeNormal = seenNormal.get(normalKey);
    if (dupeNormal) throw new Error(`damagetypes.json: "${r.key}" and "${dupeNormal}" share color ${r.color}`);
    seenNormal.set(normalKey, r.key);
    const dupeColorblind = seenColorblind.get(colorblindKey);
    if (dupeColorblind) {
      throw new Error(
        `damagetypes.json: "${r.key}" and "${dupeColorblind}" share colorblindColor ${r.colorblindColor}`,
      );
    }
    seenColorblind.set(colorblindKey, r.key);
  }
}

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
    unlockAllCores: z.boolean(),
    unlockAllTiers: z.boolean(),
    completeAllQuests: z.boolean(),
    fillStash: z.boolean(),
  })
  // Strict so a typo for a neighbouring feature (`godMode`, say) fails loudly
  // instead of being silently dropped and doing nothing.
  .strict();

export type DevConfig = z.infer<typeof DevFileSchema>;

/**
 * b044: the authored /data documents `loadContent()` actually parsed,
 * captured before any schema `.parse()` call. `contentHash()` hashes this
 * bundle instead of the parsed `Content` fields, so a loader/schema change
 * that starts keeping (or stops stripping) a field on byte-identical /data
 * cannot move the hash on its own — only an actual edit to /data (or a
 * Tuner/test override) can.
 */
export interface ContentRaw {
  warden: unknown;
  towers: unknown;
  enemies: unknown;
  waves: unknown;
  spawns: unknown;
  boons: unknown;
  tree: unknown;
  modifiers: unknown;
  classes: unknown;
  quests: unknown;
  damageTypes: unknown;
  dev: unknown;
  cores: unknown;
  equipment: unknown;
}

export interface Content {
  raw: ContentRaw;
  warden: WardenBase;
  towers: z.infer<typeof TowersFileSchema>;
  enemies: z.infer<typeof EnemiesFileSchema>;
  waves: z.infer<typeof WavesFileSchema>;
  spawns: z.infer<typeof SpawnsFileSchema>;
  boons: z.infer<typeof VsUpgradesFileSchema>;
  tree: z.infer<typeof TreeFileSchema>;
  modifiers: z.infer<typeof ModifiersFileSchema>;
  classes: z.infer<typeof ClassesFileSchema>;
  quests: z.infer<typeof QuestsFileSchema>;
  damageTypes: DamageTypesFile;
  dev: DevConfig;
  cores: z.infer<typeof CoresFileSchema>;
  equipment: EquipmentFile;

  towerByKey: Map<string, TowerDef>;
  towerById: Map<number, TowerDef>;
  enemyByKey: Map<string, EnemyDef>;
  enemyById: Map<number, EnemyDef>;
  boonByKey: Map<string, BoonDef>;
  skillCardByKey: Map<string, SkillCardDef>;
  treeById: Map<number, TreeNode>;
  classByKey: Map<string, ClassDef>;
  modifierByKey: Map<string, ModifierDef>;
  damageTypeByKey: Map<string, DamageTypeDef>;
  coreByKey: Map<string, CoreDef>;
  equipmentByKey: Map<string, EquipmentItem>;
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

/**
 * `p9a` (CLAUDE.md architecture rule 2, Q45): a run is `RunConfig` + input
 * log, and `RunConfig` carries a content hash so a replay against edited
 * `/data` fails loudly. Computed from `content.raw` — the authored documents
 * as `loadContent()` read them, before any schema `.parse()` — not the
 * parsed `Content` fields and not cached at load time, so an in-place edit to
 * the loaded content (a re-authored JSON file picked up by a fresh
 * `loadContent()`, or a dev-mode Tuner write) changes the hash exactly when
 * it changes what a run would actually play out as. b044: hashing the parsed
 * fields instead let a loader/schema change that starts keeping (or stops
 * silently stripping) a field move the hash with zero /data edit — the same
 * "recorded run now fails to replay" failure a real edit produces, with
 * nothing to tell the two causes apart. Hashing the pre-parse documents makes
 * `contentHash` a function of /data's own authored bytes only.
 */
export function contentHash(content: Content): string {
  const h = new Hasher();
  h.str(JSON.stringify(content.raw));
  return h.hex();
}

/**
 * p9c (§11, gate G15): the Tuner's save endpoint validates a whole document
 * against the same schema `loadContent()` parses it with — one registry
 * shared by both, so a schema change can never let the endpoint accept what
 * the loader would reject. Deliberately covers only the files the Codex
 * shows a nav tab for (`codex-collections.ts`); `spawns.json` and
 * `dev.json` have no Codex collection and are out of scope here.
 */
/**
 * Raw (pre-schema) document overrides `loadContent()` accepts for exactly
 * one purpose: a Tuner save can dry-run a candidate edit through the same
 * cross-file referential checks the loader itself enforces, without ever
 * touching the process's cached `Content` or the real `/data` files. Every
 * field is optional and unioned with the real import at each call site, so
 * `loadContent()` with no argument is unchanged.
 */
export interface ContentOverrides {
  towers?: unknown;
  enemies?: unknown;
  waves?: unknown;
  spawns?: unknown;
  boons?: unknown;
  tree?: unknown;
  modifiers?: unknown;
  classes?: unknown;
  quests?: unknown;
  damageTypes?: unknown;
  cores?: unknown;
  equipment?: unknown;
}

export interface TunerFileEntry {
  key: string;
  fileName: string;
  schema: z.ZodTypeAny;
  /**
   * The `loadContent(overrides)` key this file's parsed document substitutes
   * for — code-reviewer's Major #2: a document can be schema-valid on its
   * own and still name an enemy/class/tower/quest that doesn't exist, which
   * is exactly what `loadContent()`'s own cross-file checks below already
   * catch. Undefined for a file (only `warden.json` today) with no
   * cross-file checks to run.
   */
  contentField?: keyof ContentOverrides;
}

export const TUNER_FILES: TunerFileEntry[] = [
  { key: 'towers', fileName: 'towers.json', schema: TowersFileSchema, contentField: 'towers' },
  { key: 'enemies', fileName: 'enemies.json', schema: EnemiesFileSchema, contentField: 'enemies' },
  { key: 'waves', fileName: 'waves.json', schema: WavesFileSchema, contentField: 'waves' },
  { key: 'vsupgrades', fileName: 'vsupgrades.json', schema: VsUpgradesFileSchema, contentField: 'boons' },
  { key: 'tree', fileName: 'tree.json', schema: TreeFileSchema, contentField: 'tree' },
  { key: 'modifiers', fileName: 'modifiers.json', schema: ModifiersFileSchema, contentField: 'modifiers' },
  { key: 'classes', fileName: 'classes.json', schema: ClassesFileSchema, contentField: 'classes' },
  { key: 'quests', fileName: 'quests.json', schema: QuestsFileSchema, contentField: 'quests' },
  { key: 'damagetypes', fileName: 'damagetypes.json', schema: DamageTypesFileSchema, contentField: 'damageTypes' },
  { key: 'cores', fileName: 'cores.json', schema: CoresFileSchema, contentField: 'cores' },
  { key: 'equipment', fileName: 'equipment.json', schema: EquipmentFileSchema, contentField: 'equipment' },
  { key: 'warden', fileName: 'warden.json', schema: WardenFileSchema },
];

/**
 * See the E1 loop inside `loadContent` below. `palisade` (src/bots/policies.ts,
 * a non-null-asserted `towerByKey.get`) is pinned directly rather than left to
 * ride on classes.json's Cryomancer `active2.towerKey` cross-check, which
 * references the same key today but isn't this census's guarantee to depend on.
 */
const REQUIRED_TOWER_KEYS = ['harvest_sprout', 'palisade'] as const;
const REQUIRED_DAMAGE_TYPE_KEYS = ['burning', 'poison'] as const;

let cached: Content | null = null;

export function loadContent(overrides?: ContentOverrides): Content {
  if (!overrides && cached) return cached;

  // b044: kept separate from each `.parse()` call and carried through onto
  // `Content.raw` below so `contentHash()` can hash the *authored* documents
  // rather than their schema-parsed shape — a schema change that starts
  // declaring (or stops stripping) a field on unchanged /data bytes must not
  // move the hash, per §12 rule 2's "fails loudly [only] against edited
  // /data" contract.
  const towersDoc = overrides?.towers ?? towersRaw;
  const enemiesDoc = overrides?.enemies ?? enemiesRaw;
  const wavesDoc = overrides?.waves ?? wavesRaw;
  const spawnsDoc = overrides?.spawns ?? spawnsRaw;
  const boonsDoc = overrides?.boons ?? vsupgradesRaw;
  const treeDoc = overrides?.tree ?? treeRaw;
  const modifiersDoc = overrides?.modifiers ?? modifiersRaw;
  const classesDoc = overrides?.classes ?? classesRaw;
  const questsDoc = overrides?.quests ?? questsRaw;
  const damageTypesDoc = overrides?.damageTypes ?? damageTypesRaw;
  const coresDoc = overrides?.cores ?? coresRaw;
  const equipmentDoc = overrides?.equipment ?? equipmentRaw;

  const towers = TowersFileSchema.parse(towersDoc);
  const enemies = EnemiesFileSchema.parse(enemiesDoc);
  const waves = WavesFileSchema.parse(wavesDoc);
  const spawns = SpawnsFileSchema.parse(spawnsDoc);
  const boons = VsUpgradesFileSchema.parse(boonsDoc);
  const tree = TreeFileSchema.parse(treeDoc);
  const modifiers = ModifiersFileSchema.parse(modifiersDoc);
  const classes = ClassesFileSchema.parse(classesDoc);
  const dev = DevFileSchema.parse(devRaw);
  const quests = QuestsFileSchema.parse(questsDoc);
  const damageTypes = DamageTypesFileSchema.parse(damageTypesDoc);
  const cores = CoresFileSchema.parse(coresDoc);
  const equipment = EquipmentFileSchema.parse(equipmentDoc);

  // Cross-file referential integrity: a typo in /data must fail loudly at load.
  const towerKeys = new Set(towers.towers.map((t) => t.key));
  const enemyKeys = new Set(enemies.enemies.map((e) => e.key));

  // b013/E1: content keys `/src` reads by string literal, with no other
  // cross-file check to catch a rename — a short, hand-maintained census of
  // the actual `.get('literal')`/`['literal']` call sites, not a generic
  // static-analysis pass. `harvest_sprout` (src/bots/policies.ts) is E1's own
  // probe; `burning`/`poison` (src/sim/combat.ts, src/sim/cores.ts) are the
  // same shape on `damagetypes.json`.
  for (const key of REQUIRED_TOWER_KEYS) {
    if (!towerKeys.has(key)) {
      throw new Error(`towers.json: "${key}" is renamed or missing, but /src references it by literal`);
    }
  }
  const damageTypeKeys = new Set(damageTypes.types.map((d) => d.key));
  for (const key of REQUIRED_DAMAGE_TYPE_KEYS) {
    if (!damageTypeKeys.has(key)) {
      throw new Error(`damagetypes.json: "${key}" is renamed or missing, but /src references it by literal`);
    }
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
  for (const c of classes.classes) {
    validateClassEffect(c.active1, `classes.json: ${c.key}.active1`);
    validateClassEffect(c.active2, `classes.json: ${c.key}.active2`);
    validateClassPassive(c.passive, `classes.json: ${c.key}.passive`);
    validateClassPassive(c.towerPassive, `classes.json: ${c.key}.towerPassive`);
    // p6d: an Active that copies or places a tower has to name one that exists.
    for (const eff of [c.active1, c.active2]) {
      if (eff.towerKey !== undefined && !towerKeys.has(eff.towerKey)) {
        throw new Error(`classes.json: ${c.key}.${eff.name} references unknown tower "${eff.towerKey}"`);
      }
    }
  }

  // p7e (§8.4): a class's `unlockQuest` naming a quest whose `reward` does not
  // actually unlock that class is a silent dead end — exactly the bug that
  // left 5 of 9 non-free classes permanently unobtainable outside the dev
  // profile until this rule caught it. A free class has no unlock quest; a
  // non-free class's quest must exist and reward it by exact key.
  const questByKey = new Map(quests.quests.map((q) => [q.key, q]));
  for (const c of classes.classes) {
    if (c.unlockedByDefault) {
      if (c.unlockQuest !== null) {
        throw new Error(`classes.json: ${c.key} is unlockedByDefault but names unlockQuest "${c.unlockQuest}"`);
      }
      continue;
    }
    if (c.unlockQuest === null) throw new Error(`classes.json: ${c.key} is not free and has no unlockQuest`);
    const quest = questByKey.get(c.unlockQuest);
    if (!quest) throw new Error(`classes.json: ${c.key}.unlockQuest "${c.unlockQuest}" has no matching quest`);
    if (quest.reward.kind !== 'class' || quest.reward.value !== c.key) {
      throw new Error(
        `quests.json: "${quest.key}" is ${c.key}'s unlockQuest but its reward is ${quest.reward.kind}:${quest.reward.value}, not class:${c.key}`,
      );
    }
  }

  // p7h (§5.5, §8.4): the same rule as classes' unlockQuest above, applied to
  // Cores — a non-default Core with no quest, or a quest that doesn't reward
  // it, is a silent dead end exactly like the one 5 of 9 classes shipped with
  // (p7e). Reuses `questByKey` from the class loop above.
  for (const c of cores.cores) {
    if (c.unlockedByDefault) {
      if (c.unlockQuest !== null) {
        throw new Error(`cores.json: ${c.key} is unlockedByDefault but names unlockQuest "${c.unlockQuest}"`);
      }
      continue;
    }
    if (c.unlockQuest === null) throw new Error(`cores.json: ${c.key} is not free and has no unlockQuest`);
    const quest = questByKey.get(c.unlockQuest);
    if (!quest) throw new Error(`cores.json: ${c.key}.unlockQuest "${c.unlockQuest}" has no matching quest`);
    if (quest.reward.kind !== 'core' || quest.reward.value !== c.key) {
      throw new Error(
        `quests.json: "${quest.key}" is ${c.key}'s unlockQuest but its reward is ${quest.reward.kind}:${quest.reward.value}, not core:${c.key}`,
      );
    }
  }

  // p7a (§6.3): every class needs exactly its 3 skill cards — one each of
  // active1_potency/active2_cdr/class_line — so `progression.ts`'s generic
  // per-effect lookup (`skillCard`) can assume exactly one match per class
  // rather than silently reading `undefined` and granting nothing.
  const skillCardKeys = new Set<string>();
  for (const c of classes.classes) {
    const cards = boons.skillCards[c.key];
    if (!cards) throw new Error(`vsupgrades.json: class "${c.key}" has no skillCards entry`);
    const effects = cards.map((card) => card.effect).sort();
    if (cards.length !== 3 || effects.join(',') !== 'active1_potency,active2_cdr,class_line') {
      throw new Error(
        `vsupgrades.json: ${c.key}.skillCards must have exactly one active1_potency, active2_cdr and class_line card`,
      );
    }
    for (const card of cards) {
      if (skillCardKeys.has(card.key)) throw new Error(`vsupgrades.json: duplicate skill card key "${card.key}"`);
      skillCardKeys.add(card.key);
    }
  }
  for (const classKey of Object.keys(boons.skillCards)) {
    if (!classKeys.has(classKey)) throw new Error(`vsupgrades.json: skillCards references unknown class "${classKey}"`);
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
    } else if (
      hasDps ||
      hasRatio ||
      d.duration !== undefined ||
      d.armorShredPerSecond !== undefined ||
      d.immuneTrait !== undefined
    ) {
      throw new Error(`damagetypes.json: "${d.key}" is a hit but carries dot fields`);
    }
  }

  // fb005: "each damage type plus each status visibly differs" is a loader
  // rule, not a hope — two rows quietly sharing a color (in either palette)
  // would silently fail the acceptance criterion the next time someone edits
  // this file, the same m19a-shaped failure every other rule in this block
  // guards against.
  validateDamageStyleColors(damageTypes);

  const treeIds = new Set(tree.nodes.map((n) => n.id));
  for (const n of tree.nodes) {
    for (const l of n.links) {
      if (!treeIds.has(l)) throw new Error(`tree.json: node ${n.id} links to missing ${l}`);
    }
  }

  validateDefaultCore(cores.cores);
  for (const c of cores.cores) validateCoreUpgrade(c);

  // fb015 (§7): a typo'd slot or `notClassKey` would otherwise silently equip
  // into nowhere or grant a fallback nobody can ever fail to qualify for.
  const equipmentSlots = new Set(equipment.slots);
  const equipmentKeys = new Set(equipment.items.map((i) => i.key));
  for (const item of equipment.items) {
    if (!equipmentSlots.has(item.slot)) {
      throw new Error(`equipment.json: ${item.key} has unknown slot "${item.slot}"`);
    }
    if (item.classFallback && !classKeys.has(item.classFallback.notClassKey)) {
      throw new Error(
        `equipment.json: ${item.key}.classFallback references unknown class "${item.classFallback.notClassKey}"`,
      );
    }
    // fb028: `effectNoteWith.key` names the companion item whose presence
    // switches this item's UI note (equipment-info.ts) — a typo'd key would
    // silently make that cross-item note unreachable forever.
    if (item.effectNoteWith && !equipmentKeys.has(item.effectNoteWith.key)) {
      throw new Error(
        `equipment.json: ${item.key}.effectNoteWith references unknown item "${item.effectNoteWith.key}"`,
      );
    }
  }

  const result: Content = {
    raw: {
      warden: wardenRaw,
      towers: towersDoc,
      enemies: enemiesDoc,
      waves: wavesDoc,
      spawns: spawnsDoc,
      boons: boonsDoc,
      tree: treeDoc,
      modifiers: modifiersDoc,
      classes: classesDoc,
      quests: questsDoc,
      damageTypes: damageTypesDoc,
      dev: devRaw,
      cores: coresDoc,
      equipment: equipmentDoc,
    },
    warden: wardenBase,
    towers,
    enemies,
    waves,
    spawns,
    boons,
    tree,
    modifiers,
    classes,
    dev,
    quests,
    damageTypes,
    cores,
    equipment,
    towerByKey: new Map(towers.towers.map((t) => [t.key, t])),
    towerById: new Map(towers.towers.map((t) => [t.id, t])),
    enemyByKey: new Map(enemies.enemies.map((e) => [e.key, e])),
    enemyById: new Map(enemies.enemies.map((e) => [e.id, e])),
    boonByKey: new Map(boons.statBoons.map((b) => [b.key, b])),
    skillCardByKey: new Map(Object.values(boons.skillCards).flat().map((c) => [c.key, c])),
    treeById: new Map(tree.nodes.map((n) => [n.id, n])),
    classByKey: new Map(classes.classes.map((c) => [c.key, c])),
    modifierByKey: new Map(modifiers.modifiers.map((m) => [m.key, m])),
    damageTypeByKey: new Map(damageTypes.types.map((d) => [d.key, d])),
    coreByKey: new Map(cores.cores.map((c) => [c.key, c])),
    equipmentByKey: new Map(equipment.items.map((e) => [e.key, e])),
  };
  // A dry-run validation (an `overrides` call, used by the Tuner's save path
  // below) must never poison the real cache with a candidate that hasn't
  // actually been written to disk.
  if (!overrides) cached = result;
  return result;
}
