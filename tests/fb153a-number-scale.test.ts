/**
 * fb153a — the owner's global number rescale (`feedback/processed/
 * 20260905-190000-balance-damage-rescale-and-bigger-map.md`, item 1), and the
 * audit that makes it safe to re-tune.
 *
 * The order: "divide all damage sources AND all enemy/structure HP by the same
 * factor (start at /10, tune) so relative balance is preserved". It is shipped
 * as **one authored number** (`data/modifiers.json`'s `numberScale`) applied to
 * the parsed content at load, the same shape `baseHpMul` already uses for the
 * enemy roster — "one tunable number rather than 20 edited rows, so the
 * authored per-enemy identity ratios stay readable and untouched" — and the
 * only shape that leaves SPEC-FINAL §4/§5/§7/§9's stated figures true of
 * `/data`.
 *
 * **The risk this file exists to close is a missed field.** A rescale is
 * proportional only if it reaches *every* HP- and damage-denominated number; one
 * field left behind is a silent balance change, of exactly the kind CLAUDE.md's
 * measurement rules warn about ("check a `/data` row's blast radius before
 * calling it narrow"). Greps do not close it — `devourCoreHeal`,
 * `healPerEnemy` and `heartstoneHeal` are all on the HP axis and none of them
 * contains "hp" or "damage" in a form a name filter catches (all three were in
 * fact missed by one, and found by this census).
 *
 * So the census walks **every numeric leaf in every `/data` file**, compares
 * the loaded value against the authored one, and requires the ratio to be
 * exactly 1, exactly the scale, or exactly its inverse — and requires any field
 * whose *name* suggests an HP/damage/heal/attack quantity to be listed here
 * with a reason, whichever way it is classified. A new `/data` field of either
 * kind lands in this file, named, on the next run.
 */

import { describe, expect, it } from 'vitest';

import { loadContent } from '../src/sim/content';
import { STAT_KEYS, STAT_SCALED, type StatKey } from '../src/sim/statkeys';
import { World } from '../src/sim/world';
import { applyHealingToWarden } from '../src/sim/cores';
import { cfg } from './helpers';

const content = loadContent();
const SCALE = content.modifiers.numberScale;

/**
 * Numeric leaves whose name reads like an HP, damage, heal or attack quantity.
 * Every one must be classified below, whichever way — the point is that the
 * *risky* names cannot be added without a decision, the same
 * compile-error-not-silent-default rule `STAT_KIND` follows.
 */
const RISKY_TOKENS = ['hp', 'dps', 'dmg', 'damage', 'heal', 'atk', 'attack'];

/**
 * Splits a camelCase field name into lowercase tokens, so `coreDamage`,
 * `stompDamage`, `trailDps`, `baseHp` and `devourCoreHeal` are all seen. An
 * earlier version of this guard matched the token only at the start of the
 * name or after a non-letter, which caught 2 of the 19 names it was written
 * for (code review, Major 1) — and the sibling assertion cannot cover the gap,
 * because an unlisted field defaults to "unscaled" and then trivially agrees
 * with its authored value.
 */
function isRiskyName(leaf: string): boolean {
  const tokens = leaf.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/);
  return tokens.some((t) => RISKY_TOKENS.includes(t));
}

/** Authored fields the scale multiplies. Path is dotted, with `[]` for arrays. */
const SCALED_PATHS: readonly string[] = [
  'enemies.enemies[].hp',
  'enemies.enemies[].coreDamage',
  'enemies.enemies[].attackDamage',
  'enemies.enemies[].explodeDamage',
  'enemies.enemies[].stompDamage',
  'enemies.enemies[].trailDps',
  'enemies.enemies[].healRate',
  'towers.towers[].hp',
  'towers.towers[].attack.damage',
  'towers.towers[].attack.burn.dps',
  'towers.towers[].vsSpecial.damage',
  'classes.classes[].basicAttack.dps',
  'classes.classes[].passive.flameDps',
  'classes.classes[].passive.shatterDamage',
  'classes.classes[].active1.damage',
  'classes.classes[].active1.minDamage',
  'classes.classes[].active1.burnDps',
  'classes.classes[].active1.markPastDotDps',
  'classes.classes[].active1.markPresentDotDps',
  'classes.classes[].active2.damage',
  'classes.classes[].active2.pylonDps',
  'classes.classes[].active2.healPerEnemy',
  'cores.cores[].baseHp',
  'cores.cores[].effects.devourEliteDamage',
  'cores.cores[].effects.poisonBulletDamage',
  'cores.cores[].effects.devourCoreHeal',
  'cores.cores[].upgrade.steps[].coreHpBonus',
  'cores.cores[].upgrade.steps[].hpRegenPerSecond',
  // A *divisor* on an HP quantity (`gold += excess / ratio`), so it shrinks
  // with the pool — unlike `breach.perEhp`, which is a factor and inverts.
  // Shipped inverted for one round; qa-playtester's control pair caught it.
  'cores.cores[].effects.overhealGoldRatio',
  'cores.cores[].upgrade.steps[].overhealGoldRatio',
  'damagetypes.types[].dps',
  'modifiers.modifiers[].effect.coreHp',
  'waves.coreHp',
  'warden.maxHp',
  'warden.hpRegen',
  'warden.heartstoneHeal',
];

/**
 * The one field that moves the *other* way: `perEhp` prices a wall's effective
 * HP into a pathing cost compared against `breach.base`, which is on no HP axis
 * at all, so it must grow as the HP pool shrinks or every wall becomes ~`k`
 * times cheaper to path through.
 */
const INVERSE_PATHS: readonly string[] = ['towers.breach.perEhp'];

/**
 * Risky-looking names that are deliberately **not** scaled, each with the
 * reason. A reader who disagrees with one of these has a specific sentence to
 * argue with, which is the point.
 */
const UNSCALED_REASONS: Record<string, string> = {
  'enemies.baseHpMul': 'a multiplier on the roster, not an HP magnitude',
  'enemies.enemies[].structureDamageMul': 'a multiplier',
  'spawns.hpOverlay': 'a multiplier on the VS overlay',
  'spawns.hpScalePerMinute': 'a per-minute growth multiplier',
  'waves.hpScalePerWave': 'a per-wave growth multiplier',
  'waves.enemyStructureDpsFactor': 'a multiplier on an already-scaled dps',
  'modifiers.modifiers[].effect.enemyHp': 'a fraction (+45% enemy HP)',
  'modifiers.modifiers[].effect.bossHp': 'a fraction (+50% boss HP)',
  'modifiers.tierEnemyHpPerStep': 'a per-tier multiplier',
  'damagetypes.statuses.frozen.damageTaken': 'a fraction (+30% damage taken)',
  'damagetypes.types[].armorShredPerSecond': 'armor points, a percent curve on another axis',
  'classes.classes[].active1.titheHpFraction': 'a fraction of a pool that is itself scaled',
  'classes.classes[].active1.titheDamageMul': 'a multiplier',
  'classes.classes[].active1.markEliteExecuteFraction': 'a fraction of current HP',
  'classes.classes[].active2.pactDamageMul': 'a multiplier',
  'classes.classes[].active2.wrathDamageMul': 'a multiplier',
  'classes.classes[].active2.pactDrainPerSecond': 'a fraction of the structure max HP per second',
  'classes.classes[].passive.stanceArmor': 'armor points',
  'classes.classes[].towerPassive.mods.towerDamage': 'a percent stat (STAT_SCALED)',
  'classes.classes[].towerPassive.mods.towerDamageVsBurning': 'a percent stat',
  'classes.classes[].towerPassive.mods.towerDamageVsChilled': 'a percent stat',
  'classes.classes[].towerPassive.mods.towerLowHpDamageBonus': 'a percent stat',
  'classes.classes[].towerPassive.mods.towerPoisonDamage': 'a percent stat',
  'classes.classes[].towerPassive.mods.towerHp': 'a percent stat',
  'cores.cores[].effects.missingHpBuffCap': 'a fraction cap',
  'cores.cores[].effects.missingHpBuffPerPct': 'a fraction per missing percent',
  'cores.cores[].upgrade.steps[].healingReceivedPct': 'a fraction',
  'cores.cores[].upgrade.steps[].executeExplode': 'a flag in number form',
  'tree.nodes[].stats.maxHpPct': 'a percent stat (STAT_SCALED)',
  'tree.nodes[].stats.towerDamage': 'a percent stat (STAT_SCALED)',
  'tree.nodes[].stats.wallHp': 'a percent stat (STAT_SCALED)',
  'towers.towers[].attack.damageRatio.normal': 'a ratio between damage types',
  'towers.towers[].attack.damageRatio.poison': 'a ratio between damage types',
  'towers.towers[].attack.damageRatio.electric': 'a ratio between damage types',
  'towers.towers[].terrain.wardenAttackSpeed': 'an attack-speed multiplier',
  'towers.towers[].upgrades.specials[].ratio.normal': 'a ratio between damage types',
  'towers.towers[].upgrades.specials[].ratio.poison': 'a ratio between damage types',
  'equipment.items[].mods.attackSpeed': 'a percent stat',
  'equipment.items[].classFallback.mods.attackSpeed': 'a percent stat',
  'damagetypes.dotTickInterval': 'seconds',
  'warden.armorCap': 'armor points',
  'warden.armorFloor': 'armor points',
  'classes.classes[].active1.overclockAtkSpdMul': 'an attack-speed multiplier',
  'classes.classes[].active2.pactAtkSpdMul': 'an attack-speed multiplier',
  'classes.classes[].active2.auraAtkSpdMul': 'an attack-speed multiplier',
  'modifiers.tierCoreDamagePerStep': 'a per-tier multiplier',
  'enemies.enemies[].attackRange': 'tiles',
  'enemies.enemies[].attackInterval': 'seconds',
  'enemies.enemies[].healRadius': 'tiles',
  'towers.towers[].buffAura.attackSpeed': 'a percent aura',
  'towers.towers[].passive.attackSpeedPer': 'a percent per stack',
  'damagetypes.statuses.frost.attackSpeed': 'a percent (-30% attack speed)',
};

/** Stat-record paths, whose classification comes from `STAT_SCALED` per key. */
const STAT_RECORD_PATHS = [
  /^tree\.nodes\[\]\.stats\.(\w+)$/,
  /^equipment\.items\[\]\.mods\.(\w+)$/,
  /^equipment\.items\[\]\.classFallback\.mods\.(\w+)$/,
  /^classes\.classes\[\]\.towerPassive\.mods\.(\w+)$/,
  /^classes\.classes\[\]\.passive\.mods\.(\w+)$/,
];

type Leaf = { path: string; authored: number; loaded: number };

/** Walks the authored doc and the loaded view together, numeric leaf by leaf. */
function leaves(authored: unknown, loaded: unknown, path: string, out: Leaf[]): void {
  if (typeof authored === 'number' && typeof loaded === 'number') {
    out.push({ path, authored, loaded });
    return;
  }
  if (Array.isArray(authored) && Array.isArray(loaded)) {
    for (let i = 0; i < Math.min(authored.length, loaded.length); i++) {
      leaves(authored[i], loaded[i], `${path}[]`, out);
    }
    return;
  }
  if (authored && loaded && typeof authored === 'object' && typeof loaded === 'object') {
    const a = authored as Record<string, unknown>;
    const l = loaded as Record<string, unknown>;
    for (const k of Object.keys(a)) {
      if (!(k in l)) continue; // zod strips what the schema does not declare
      leaves(a[k], l[k], path ? `${path}.${k}` : k, out);
    }
  }
}

const FILES: [string, unknown, unknown][] = [
  ['enemies', content.raw.enemies, content.enemies],
  ['towers', content.raw.towers, content.towers],
  ['classes', content.raw.classes, content.classes],
  ['cores', content.raw.cores, content.cores],
  ['damagetypes', content.raw.damageTypes, content.damageTypes],
  ['equipment', content.raw.equipment, content.equipment],
  ['tree', content.raw.tree, content.tree],
  ['vsupgrades', content.raw.boons, content.boons],
  ['modifiers', content.raw.modifiers, content.modifiers],
  ['waves', content.raw.waves, content.waves],
  ['spawns', content.raw.spawns, content.spawns],
  ['quests', content.raw.quests, content.quests],
  ['warden', content.raw.warden, content.warden],
];

const ALL: Leaf[] = [];
for (const [name, authored, loaded] of FILES) leaves(authored, loaded, name, ALL);

/** A stat-record leaf's classification comes from `STAT_SCALED`, not the tables. */
function statKeyOf(path: string): StatKey | undefined {
  for (const re of STAT_RECORD_PATHS) {
    const m = re.exec(path);
    if (m && (STAT_KEYS as readonly string[]).includes(m[1])) return m[1] as StatKey;
  }
  return undefined;
}

/**
 * `statBoons[].perRank` is the one leaf whose classification lives in a
 * *sibling* field (`stat`) rather than in its path, so the generic walk skips
 * it and the dedicated case below checks every row against `STAT_SCALED`.
 */
const PER_ROW_PATHS: readonly string[] = [
  'vsupgrades.statBoons[].perRank',
  // A quest target is denominated by its own `metric`: `lifetime_damage` is a
  // damage total and scales, every counting metric (kills, waves, runs) does
  // not. Checked row by row below.
  'quests.quests[].target',
];

function expectedRatio(path: string): number {
  const stat = statKeyOf(path);
  if (stat) return STAT_SCALED[stat] ? SCALE : 1;
  if (SCALED_PATHS.includes(path)) return SCALE;
  if (INVERSE_PATHS.includes(path)) return 1 / SCALE;
  return 1;
}

describe('fb153a — the number rescale reaches every field it should, and no others', () => {
  it('the census sees the whole of /data', () => {
    // A walk that silently stopped early would make every assertion below
    // vacuous. The count is a floor, not a pin: adding /data content must not
    // redden this file, only removing the census's reach.
    expect(ALL.length).toBeGreaterThan(400);
    expect(new Set(ALL.map((l) => l.path)).size).toBeGreaterThan(100);
  });

  it('every numeric field is scaled exactly as its classification says', () => {
    const wrong: string[] = [];
    for (const l of ALL) {
      if (l.authored === 0) continue; // 0 scales to 0 either way and says nothing
      if (PER_ROW_PATHS.includes(l.path)) continue; // checked row by row below
      const want = l.authored * expectedRatio(l.path);
      if (Math.abs(l.loaded - want) > Math.abs(want) * 1e-9 + 1e-12) {
        wrong.push(`${l.path}: authored ${l.authored}, loaded ${l.loaded}, expected ${want}`);
      }
    }
    expect(wrong, 'a field is scaled differently than this file classifies it').toEqual([]);
  });

  it('every HP/damage-shaped field name is classified, whichever way', () => {
    const unclassified: string[] = [];
    for (const path of new Set(ALL.map((l) => l.path))) {
      const leaf = path.split('.').pop()!.replace(/\[\]/g, '');
      if (!isRiskyName(leaf)) continue;
      if (statKeyOf(path)) continue; // STAT_SCALED decides these, exhaustively
      if (SCALED_PATHS.includes(path) || INVERSE_PATHS.includes(path)) continue;
      if (UNSCALED_REASONS[path]) continue;
      unclassified.push(path);
    }
    expect(
      unclassified,
      'a new /data field reads like an HP/damage quantity — add it to SCALED_PATHS or give it a reason in UNSCALED_REASONS',
    ).toEqual([]);
  });

  it('the classification tables name no field that /data does not have', () => {
    const known = new Set(ALL.map((l) => l.path));
    const stale = [...SCALED_PATHS, ...INVERSE_PATHS, ...Object.keys(UNSCALED_REASONS)].filter((p) => !known.has(p));
    expect(stale, 'a classification row points at a field that no longer exists').toEqual([]);
  });

  it('a stat boon scales exactly when its own stat is HP/damage-denominated', () => {
    const authored = (content.raw.boons as { statBoons: { key: string; stat: string; perRank: number }[] }).statBoons;
    for (const row of authored) {
      const live = content.boons.statBoons.find((b) => b.key === row.key)!;
      const want = row.perRank * (STAT_SCALED[row.stat as StatKey] ? SCALE : 1);
      expect(live.perRank, `${row.key} (${row.stat})`).toBeCloseTo(want, 12);
    }
    // The set must contain at least one of each, or the assertion above proves
    // nothing about the branch it does not exercise.
    expect(authored.some((r) => STAT_SCALED[r.stat as StatKey])).toBe(true);
    expect(authored.some((r) => !STAT_SCALED[r.stat as StatKey])).toBe(true);
  });

  it('a quest target scales exactly when its metric counts damage', () => {
    const authored = (content.raw.quests as { quests: { key: string; metric: string; target: number }[] }).quests;
    for (const row of authored) {
      const live = content.quests.quests.find((q) => q.key === row.key)!;
      const want = row.target * (row.metric === 'lifetime_damage' ? SCALE : 1);
      expect(live.target, `${row.key} (${row.metric})`).toBeCloseTo(want, 6);
    }
    expect(authored.some((r) => r.metric === 'lifetime_damage'), 'no damage-metric quest to exercise the branch').toBe(
      true,
    );
  });

  it('an override document is read in authored units, so it cannot be double-scaled', () => {
    // The contract every `ContentOverrides` caller depends on — the Tuner's
    // save dry-run, and every test that substitutes a document. Feeding a
    // *loaded* (already-scaled) view back in would scale it twice; feeding the
    // authored document back in must reproduce the shipped content exactly.
    const again = loadContent({ enemies: content.raw.enemies });
    expect(again.enemyByKey.get('husk')!.hp).toBeCloseTo(content.enemyByKey.get('husk')!.hp, 12);
  });

  it('scale 1.0 is the identity, so the factor is a real ⚖ tunable', () => {
    const raw = content.raw.modifiers as Record<string, unknown>;
    const identity = loadContent({ modifiers: { ...raw, numberScale: 1 } });
    const authoredHusk = (content.raw.enemies as { enemies: { key: string; hp: number }[] }).enemies.find(
      (e) => e.key === 'husk',
    )!;
    expect(identity.enemyByKey.get('husk')!.hp).toBe(authoredHusk.hp);
    expect(identity.warden.maxHp).toBe((content.raw.warden as { maxHp: number }).maxHp);
  });

  it('the scale is linear across its whole legal range, floors included', () => {
    // qa-playtester: `coreMaxHp`'s `Math.max(1, ...)` floor was not scaled, so
    // at the low end of the schema's own bounds the Core kept 2x-20x too much
    // HP — the ⚖ knob was non-linear inside its legal range. Every magnitude
    // floor in the sim has to move with the pool it floors, and the only way to
    // see that is to measure more than the shipped value.
    const raw = content.raw.modifiers as Record<string, unknown>;
    const at = (k: number): { core: number; maxHp: number } => {
      const c = loadContent({ modifiers: { ...raw, numberScale: k } });
      const w = new World(cfg(), c);
      return { core: w.coreMaxHp / k, maxHp: w.derived.maxHp / k };
    };
    const base = at(1);
    for (const k of [1e-4, 1e-3, 0.1, 1, 1e3]) {
      const got = at(k);
      expect(got.core, `coreMaxHp is not linear at numberScale ${k}`).toBeCloseTo(base.core, 6);
      expect(got.maxHp, `derived.maxHp is not linear at numberScale ${k}`).toBeCloseTo(base.maxHp, 6);
    }
  });

  it('an HP-to-gold conversion pays the same gold at every scale', () => {
    // qa-playtester's blocking find, as a control pair rather than a
    // restatement: Vampire Heart's `overhealGoldRatio` divides an HP quantity
    // into gold, so it must shrink with the HP pool. Shipped inverted for one
    // round, which paid 100x less gold and flipped run outcomes on 5 of 5
    // seeds. Asserting "the same relative overheal pays the same gold" is the
    // only shape that catches a wrong *direction*; comparing against the loaded
    // ratio is `implementation === implementation`.
    const raw = content.raw.modifiers as Record<string, unknown>;
    const goldFor = (k: number): number => {
      const c = loadContent({ modifiers: { ...raw, numberScale: k } });
      const w = new World(cfg({ core: 'vampire_heart' }), c);
      w.phase = 'act2';
      w.recomputeCore();
      const before = w.gold + w.coreGoldAccumulator;
      applyHealingToWarden(w, w.derived.maxHp * 0.5);
      return w.gold + w.coreGoldAccumulator - before;
    };
    const at1 = goldFor(1);
    expect(at1, 'the probe healed nothing — the control proves nothing').toBeGreaterThan(0);
    expect(goldFor(0.1), 'the same relative overheal pays different gold at a different scale').toBeCloseTo(at1, 6);
  });
});
