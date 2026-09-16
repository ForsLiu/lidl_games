/**
 * fb153a — the owner's global number rescale (`feedback/processed/
 * 20260905-190000-balance-damage-rescale-and-bigger-map.md`, item 1), and the
 * audit that makes it safe to re-tune.
 *
 * **Reworked by fb163/fb194** (QUESTIONS Q180/Q191 OVERRIDE, reversing fb163's
 * original "(a) no change" 2026-09-06 closure): `numberScale` no longer
 * applies uniformly. It splits into two economies:
 *   - **economy A** — enemy HP and damage *dealt to* enemies (tower/kit/
 *     wielded/Core attacks) — stays divided by `numberScale`.
 *   - **economy B** — enemy damage *output*, Core/structure/character HP and
 *     regen, equipment flats on that axis — left at its authored magnitude,
 *     not scaled at all (not compensated some other way).
 * Five "crossing constants" convert *between* the two economies (lifesteal,
 * Blood Tithe, Wrath, the Corpse store ratio, Vampire Heart overheal); each is
 * corrected only where the actual formula it feeds needs it — verified
 * against the code, not assumed from the shorthand "crossing constants take
 * the inverse factor" (Blood Tithe and the Corpse store both turn out to need
 * *no* correction; Wrath needs the *forward* factor, not the inverse; Vampire
 * Heart's overheal ratio needs to stop being scaled altogether). See
 * `applyNumberScale`'s own header comment (`src/sim/content.ts`) for the
 * per-constant algebra.
 *
 * **The risk this file exists to close is a missed or misclassified field.**
 * A split is correct only if it reaches *every* HP- and damage-denominated
 * number and puts each one on the right side — one field left in the wrong
 * economy is a silent balance change, of exactly the kind CLAUDE.md's
 * measurement rules warn about ("check a `/data` row's blast radius before
 * calling it narrow"). Greps do not close it — `devourCoreHeal`,
 * `healPerEnemy` and `heartstoneHeal` are all on the HP axis and none of them
 * contains "hp" or "damage" in a form a name filter catches (all three were in
 * fact missed by one, and found by this census, back at fb153a).
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
import { STAT_INVERSE_SCALED, STAT_KEYS, STAT_SCALED, type StatKey } from '../src/sim/statkeys';
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

/**
 * Economy-A fields: authored magnitudes the scale still multiplies by `k`
 * (damage dealt to enemies, and enemy HP). Path is dotted, with `[]` for
 * arrays. `active2.wrathDamageMul` is not a damage magnitude itself — it is
 * the Wrath crossing constant, forward-corrected by exactly `k` for the
 * reason `applyNumberScale`'s header documents (the *input* side of that
 * conversion, damage taken, stopped scaling, so the *output* multiplier has
 * to start absorbing the factor it used to get for free) — the ratio it
 * carries is identical in shape to every other row here, so it is listed
 * alongside them rather than in a fourth table.
 */
const SCALED_PATHS: readonly string[] = [
  'enemies.enemies[].hp',
  // The Mender's heal is flat HP added to a neighbour *enemy's* pool — the
  // same axis as enemy HP, not the enemy's own damage output.
  'enemies.enemies[].healRate',
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
  // The Wrath crossing constant (see header comment above) — forward by `k`,
  // same as every row above, for a different underlying reason.
  'classes.classes[].active2.wrathDamageMul',
  'cores.cores[].effects.devourEliteDamage',
  'cores.cores[].effects.poisonBulletDamage',
  'damagetypes.types[].dps',
];

/**
 * The Lifesteal crossing constant (fb163/fb194, QUESTIONS Q180/Q191): damage
 * dealt to an enemy (economy A, still scaled by `k`) converted into HP healed
 * on the Warden or a tower (economy B, no longer scaled at all) needs the
 * *inverse* factor so the real heal is unchanged — see
 * `applyTowerLifesteal`/`enemies.ts`'s lifesteal hook and `applyNumberScale`'s
 * header comment. `towers.breach.perEhp` — fb153a's one inverted field — is
 * **not** here any more: it priced a structure's effective HP (then economy
 * A) into a pathing cost, and now that structure HP is economy B (unscaled),
 * both sides of that product are unscaled on their own, so nothing needs
 * correcting there at all (see `UNSCALED_REASONS`).
 */
const INVERSE_PATHS: readonly string[] = [
  'cores.cores[].effects.towerLifestealPct',
  'cores.cores[].effects.vsLifestealPct',
  'cores.cores[].upgrade.steps[].towerLifestealBonus',
  // fb086 (§4.2 Blood Tithe): the same Lifesteal crossing constant, on the
  // Active row rather than a Core effect — a tithed tower's own VS-share
  // damage (economy A) heals the Warden (economy B).
  'classes.classes[].active1.titheLifestealPct',
];

/**
 * Risky-looking names that are deliberately **not** scaled, each with the
 * reason. A reader who disagrees with one of these has a specific sentence to
 * argue with, which is the point.
 */
const UNSCALED_REASONS: Record<string, string> = {
  'enemies.baseHpMul': 'a multiplier on the roster, not an HP magnitude',
  'enemies.enemies[].structureDamageMul': 'a multiplier',
  // fb163/fb194: the enemy's damage *output* against the Core/structures/
  // character is economy B, left unscaled — fb153a's uniform scheme scaled
  // all five of these.
  'enemies.enemies[].coreDamage': 'enemy damage output (economy B) — not scaled, unlike enemy HP',
  'enemies.enemies[].attackDamage': 'enemy damage output (economy B) — not scaled, unlike enemy HP',
  'enemies.enemies[].explodeDamage': 'enemy damage output (economy B) — not scaled, unlike enemy HP',
  'enemies.enemies[].stompDamage': 'enemy damage output (economy B) — not scaled, unlike enemy HP',
  'enemies.enemies[].trailDps': 'enemy damage output (economy B) — not scaled, unlike enemy HP',
  'spawns.hpOverlay': 'a multiplier on the VS overlay',
  'spawns.hpScalePerMinute': 'a per-minute growth multiplier',
  'waves.hpScalePerWave': 'a per-wave growth multiplier',
  'waves.enemyStructureDpsFactor': 'a multiplier on an already-unscaled (economy B) dps',
  // fb163/fb194: a structure's own HP pool is economy B, left unscaled —
  // fb153a's uniform scheme scaled it, which is why `breach.perEhp` used to
  // need inverting (see below).
  'towers.towers[].hp': "a structure's own HP pool (economy B) — not scaled",
  'towers.breach.perEhp': 'prices a structure\'s effective HP into a pathing cost; both `perEhp` and the HP it prices are unscaled (economy B) now, so the product needs no compensating factor — fb153a\'s version inverted this only because structure HP was economy-A-shaped under its uniform scheme',
  'modifiers.modifiers[].effect.enemyHp': 'a fraction (+45% enemy HP)',
  'modifiers.modifiers[].effect.bossHp': 'a fraction (+50% boss HP)',
  // fb163/fb194: Core HP is economy B, left unscaled — fb153a's uniform
  // scheme scaled it.
  'modifiers.modifiers[].effect.coreHp': 'Core HP (economy B) — not scaled',
  'modifiers.tierEnemyHpPerStep': 'a per-tier multiplier',
  'damagetypes.statuses.frozen.damageTaken': 'a fraction (+30% damage taken)',
  'damagetypes.types[].armorShredPerSecond': 'armor points, a percent curve on another axis',
  'classes.classes[].active1.titheHpFraction':
    "a fraction of a tower's own current HP, spent from and applied to the same pool (`fireBloodTithe`, classes.ts) — self-referential either way, so it is scale-invariant on its own and needs no correction regardless of which economy that pool sits in (economy B today)",
  'classes.classes[].active1.titheDamageMul': 'a multiplier',
  'classes.classes[].active1.markEliteExecuteFraction': 'a fraction of current HP',
  'classes.classes[].active2.pactDamageMul': 'a multiplier',
  'classes.classes[].active2.pactDrainPerSecond': 'a fraction of the structure max HP per second',
  // fb163/fb194: Crimson Rush heals the Warden (`applyHealingToWarden`,
  // classes.ts) — economy B, left unscaled. fb153a's uniform scheme scaled
  // it (it is HP-denominated, just not a fraction).
  'classes.classes[].active2.healPerEnemy': 'heals the Warden (economy B) — not scaled',
  'classes.classes[].passive.stanceArmor': 'armor points',
  // p13a (QUESTIONS Q196): the per-class survivability bands. Same shape as
  // `enemies.baseHpMul` two rows up — a roster-wide (here per-class)
  // multiplier, not an HP magnitude, so scaling it by `numberScale` would
  // shrink the *ratio* itself rather than leaving it alone the way every
  // other `*Mul` field in this table already is.
  'classes.classes[].maxHpMul': 'a multiplier, not an HP magnitude (same shape as enemies.baseHpMul)',
  'classes.classes[].defenseBonus': 'armor points',
  'classes.classes[].towerPassive.mods.towerDamage': 'a percent stat (STAT_SCALED)',
  'classes.classes[].towerPassive.mods.towerDamageVsBurning': 'a percent stat',
  'classes.classes[].towerPassive.mods.towerDamageVsChilled': 'a percent stat',
  'classes.classes[].towerPassive.mods.towerLowHpDamageBonus': 'a percent stat',
  'classes.classes[].towerPassive.mods.towerPoisonDamage': 'a percent stat',
  'classes.classes[].towerPassive.mods.towerHp': 'a percent stat',
  // fb163/fb194: the Core's own HP pool is economy B, left unscaled —
  // fb153a's uniform scheme scaled it.
  'cores.cores[].baseHp': "the Core's own HP pool (economy B) — not scaled",
  // fb163/fb194: heals the Core (economy B) — fb153a's uniform scheme scaled
  // it as a flat HP magnitude, correctly for that scheme.
  'cores.cores[].effects.devourCoreHeal': 'heals the Core (economy B) — not scaled',
  'cores.cores[].effects.missingHpBuffCap': 'a fraction cap',
  'cores.cores[].effects.missingHpBuffPerPct': 'a fraction per missing percent',
  // fb163/fb194: converts a Warden's or tower's overheal (`applyHealing`,
  // cores.ts) — both economy B, unscaled — into gold, which was never on any
  // HP axis. Neither side of the conversion scales with `k` any more, so the
  // ratio no longer crosses a scaled boundary and needs no scaling at all —
  // fb153a's uniform scheme scaled it *forward* (a divisor holding
  // `excess / ratio` constant against a shrinking `excess`), which was the
  // correct fix for that scheme and the qa-playtester regression it closed,
  // but the premise (`excess` shrinking with `k`) no longer holds.
  'cores.cores[].effects.overhealGoldRatio': 'converts a now-unscaled (economy B) overheal into gold — no scaled boundary left to cross',
  'cores.cores[].upgrade.steps[].overhealGoldRatio': 'same conversion as the base row above, same reason',
  'cores.cores[].upgrade.steps[].healingReceivedPct': 'a fraction',
  'cores.cores[].upgrade.steps[].executeExplode': 'a flag in number form',
  // fb163/fb194: Core HP bonus / tower HP regen — both economy B, left
  // unscaled. fb153a's uniform scheme scaled both.
  'cores.cores[].upgrade.steps[].coreHpBonus': 'Core HP (economy B) — not scaled',
  'cores.cores[].upgrade.steps[].hpRegenPerSecond': 'tower HP regen (economy B) — not scaled',
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
  // fb163/fb194: the character's own HP pool and regen — economy B, left
  // unscaled. fb153a's uniform scheme scaled all three.
  'warden.maxHp': "the character's own HP pool (economy B) — not scaled",
  'warden.hpRegen': 'character regen (economy B) — not scaled',
  'warden.heartstoneHeal': 'HP per second on the character (economy B), like `hpRegen` — not scaled',
  // fb163/fb194: the run's base Core HP pool — economy B, left unscaled.
  'waves.coreHp': "the run's base Core HP pool (economy B) — not scaled",
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

/** Stat-record paths, whose classification comes from `STAT_SCALED`/`STAT_INVERSE_SCALED` per key. */
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

/** A stat-record leaf's classification comes from `STAT_SCALED`/`STAT_INVERSE_SCALED`, not the tables. */
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
 * it and the dedicated case below checks every row against `STAT_SCALED`/
 * `STAT_INVERSE_SCALED`.
 */
const PER_ROW_PATHS: readonly string[] = [
  'vsupgrades.statBoons[].perRank',
  // A quest target is denominated by its own `metric`: `lifetime_damage` is a
  // damage total and scales, every counting metric (kills, waves, runs) does
  // not. Checked row by row below.
  'quests.quests[].target',
];

/** The ratio (`loaded / authored`) a field's classification predicts. */
function expectedRatio(path: string): number {
  const stat = statKeyOf(path);
  if (stat) {
    if (STAT_SCALED[stat]) return SCALE;
    if (STAT_INVERSE_SCALED[stat]) return 1 / SCALE;
    return 1;
  }
  if (SCALED_PATHS.includes(path)) return SCALE;
  if (INVERSE_PATHS.includes(path)) return 1 / SCALE;
  return 1;
}

describe('fb153a/fb163/fb194 — the number split reaches every field it should, and no others', () => {
  it('the census sees the whole of /data', () => {
    // A walk that silently stopped early would make every assertion below
    // vacuous. The count is a floor, not a pin: adding /data content must not
    // redden this file, only removing the census's reach.
    expect(ALL.length).toBeGreaterThan(400);
    expect(new Set(ALL.map((l) => l.path)).size).toBeGreaterThan(100);
  });

  it('every numeric field is scaled exactly as its classification (economy A / inverse / unscaled) says', () => {
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
      if (statKeyOf(path)) continue; // STAT_SCALED/STAT_INVERSE_SCALED decide these, exhaustively
      if (SCALED_PATHS.includes(path) || INVERSE_PATHS.includes(path)) continue;
      if (UNSCALED_REASONS[path]) continue;
      unclassified.push(path);
    }
    expect(
      unclassified,
      'a new /data field reads like an HP/damage quantity — add it to SCALED_PATHS/INVERSE_PATHS or give it a reason in UNSCALED_REASONS',
    ).toEqual([]);
  });

  it('the classification tables name no field that /data does not have', () => {
    const known = new Set(ALL.map((l) => l.path));
    const stale = [...SCALED_PATHS, ...INVERSE_PATHS, ...Object.keys(UNSCALED_REASONS)].filter((p) => !known.has(p));
    expect(stale, 'a classification row points at a field that no longer exists').toEqual([]);
  });

  it('a stat boon scales exactly per its own stat\'s economy (forward, inverse or unscaled)', () => {
    const authored = (content.raw.boons as { statBoons: { key: string; stat: string; perRank: number }[] }).statBoons;
    for (const row of authored) {
      const live = content.boons.statBoons.find((b) => b.key === row.key)!;
      const stat = row.stat as StatKey;
      const ratio = STAT_SCALED[stat] ? SCALE : STAT_INVERSE_SCALED[stat] ? 1 / SCALE : 1;
      expect(live.perRank, `${row.key} (${row.stat})`).toBeCloseTo(row.perRank * ratio, 12);
    }
    // fb163/fb194: no VS-upgrade stat boon is authored on an economy-A stat
    // today (`vitality`'s `maxHp` was the one exercising that branch under
    // fb153a's uniform scheme; `maxHp` moved to economy B) — so only the
    // "left alone" branch is live to assert on. If a future boon is authored
    // on `atkFlat`/`towerAtkFlat` (the only economy-A `StatKey`s left) or
    // `leech` (the one inverse-scaled key), the loop above already covers it;
    // this just proves the loop itself is not vacuous.
    expect(authored.some((r) => !STAT_SCALED[r.stat as StatKey] && !STAT_INVERSE_SCALED[r.stat as StatKey])).toBe(true);
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
    // `warden.maxHp` is economy B: it is unscaled at *every* `numberScale`,
    // not just at the identity, so this also holds trivially at 0.1 — the
    // dedicated invariance test below is the one that actually exercises that.
    expect(identity.warden.maxHp).toBe((content.raw.warden as { maxHp: number }).maxHp);
  });

  it('economy A is linear across its whole legal range, floors included', () => {
    // qa-playtester: `coreMaxHp`'s `Math.max(1, ...)` floor was not scaled, so
    // at the low end of the schema's own bounds the Core kept a whole
    // pre-rescale hit point at the low end of `numberScale`'s own legal range,
    // which made the ⚖ knob non-linear inside its schema bounds — back when
    // `coreMaxHp` was economy A under fb153a's uniform scheme. It measures
    // enemy HP (still economy A) here instead, the same property on the field
    // that is still scaled.
    const raw = content.raw.modifiers as Record<string, unknown>;
    const huskHpAt = (k: number): number => {
      const c = loadContent({ modifiers: { ...raw, numberScale: k } });
      return c.enemyByKey.get('husk')!.hp / k;
    };
    const base = huskHpAt(1);
    for (const k of [1e-4, 1e-3, 0.1, 1, 1e3]) {
      expect(huskHpAt(k), `husk hp is not linear at numberScale ${k}`).toBeCloseTo(base, 6);
    }
  });

  it('economy B (Core HP, the Warden\'s HP) is invariant to numberScale, floors included', () => {
    // fb163/fb194: unlike economy A, these no longer scale *at all* — the
    // control is "constant across k", not "linear in k" (there is nothing to
    // divide back out). The `Math.max(1, ...)` floors on both (`world.ts`'s
    // `coreMaxHp`, `stats.ts`'s `derive`) are themselves unscaled now, so this
    // also exercises that neither floor secretly reintroduced a `k`
    // dependency.
    const raw = content.raw.modifiers as Record<string, unknown>;
    const at = (k: number): { core: number; maxHp: number } => {
      const c = loadContent({ modifiers: { ...raw, numberScale: k } });
      const w = new World(cfg(), c);
      return { core: w.coreMaxHp, maxHp: w.derived.maxHp };
    };
    const base = at(1);
    for (const k of [1e-4, 1e-3, 0.1, 1, 1e3]) {
      const got = at(k);
      expect(got.core, `coreMaxHp moved with numberScale ${k} — it should be invariant`).toBeCloseTo(base.core, 6);
      expect(got.maxHp, `derived.maxHp moved with numberScale ${k} — it should be invariant`).toBeCloseTo(
        base.maxHp,
        6,
      );
    }
  });

  it('an HP-to-gold conversion pays the same gold at every scale (overhealGoldRatio, economy B->gold)', () => {
    // qa-playtester's original blocking find (fb153a) was about a *scaled*
    // `excess`; fb163/fb194 moved the Warden/tower HP `excess` is computed
    // from into economy B, so this conversion no longer crosses a scaled
    // boundary at all (`overhealGoldRatio` is left unscaled — see
    // `UNSCALED_REASONS`). Kept as a control pair rather than retired: it is
    // still the shape that would catch a regression if a future change put
    // either side of `applyHealing`'s `excess / ratio` back on economy A.
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

  it('lifesteal heals the same real HP at every scale (economy A damage -> economy B heal)', () => {
    // `applyTowerLifesteal` (cores.ts): `dealt` is damage a tower deals to an
    // enemy (economy A, still scaled by k) times `towerLifestealPct`
    // (inverse-scaled by fb163/fb194), healing the structure (economy B, not
    // scaled). The real heal per unit of *authored* damage dealt must be
    // identical at every `numberScale`.
    const raw = content.raw.modifiers as Record<string, unknown>;
    const healPerAuthoredDamageAt = (k: number): number => {
      const c = loadContent({ modifiers: { ...raw, numberScale: k } });
      // `dealt` in loaded (economy-A, k-scaled) units for one authored point
      // of damage.
      const dealtLoaded = 1 * k;
      return dealtLoaded * c.coreByKey.get('vampire_heart')!.effects!.towerLifestealPct!;
    };
    const at1 = healPerAuthoredDamageAt(1);
    expect(at1, 'the probe healed nothing — the control proves nothing').toBeGreaterThan(0);
    expect(healPerAuthoredDamageAt(0.1), 'lifesteal heals a different real amount at a different scale').toBeCloseTo(
      at1,
      12,
    );
  });

  it('Blood Tithe spends the same real fraction of a tower\'s own HP at every scale', () => {
    // `fireBloodTithe` (classes.ts): `titheHpFraction` is a self-referential
    // fraction of the same tower's own current HP (economy B either way) —
    // verified here to need *no* correction, unlike the shorthand "crossing
    // constants take the inverse" would suggest.
    const raw = content.raw.modifiers as Record<string, unknown>;
    const remainingFractionAt = (k: number): number => {
      const c = loadContent({ modifiers: { ...raw, numberScale: k } });
      const fraction = c.classByKey.get('bloodlord')!.active1.titheHpFraction!;
      const hp = 1000; // an arbitrary tower HP, on-axis (economy B) either way
      return (hp - hp * fraction) / hp;
    };
    const at1 = remainingFractionAt(1);
    expect(at1).toBeGreaterThan(0);
    expect(at1).toBeLessThan(1);
    expect(remainingFractionAt(0.1)).toBeCloseTo(at1, 12);
  });

  it('Wrath deals the same real nova damage at every scale (economy B damage taken -> economy A damage dealt)', () => {
    // `storeWrath`/`fireJudgement` (run.ts/classes.ts): Wrath is banked from
    // damage the character *takes* (economy B, no longer scaled at all) and
    // released as a nova against enemies (economy A, still scaled by k).
    // `wrathDamageMul` is forward-corrected by exactly `k` (see
    // `applyNumberScale`'s header) so the nova's real bite against an
    // authored-unit enemy HP pool is unchanged.
    const raw = content.raw.modifiers as Record<string, unknown>;
    const novaShareOfEnemyHpAt = (k: number): number => {
      const c = loadContent({ modifiers: { ...raw, numberScale: k } });
      const authoredDamageTaken = 100; // an arbitrary authored hit
      const wrathStored = authoredDamageTaken; // economy B, unscaled at every k
      const rawWrath = wrathStored * c.classByKey.get('paladin')!.active2.wrathDamageMul!;
      const authoredEnemyHp = 1000; // an arbitrary authored enemy HP pool
      const enemyHpLoaded = authoredEnemyHp * k; // economy A
      return rawWrath / enemyHpLoaded;
    };
    const at1 = novaShareOfEnemyHpAt(1);
    expect(at1).toBeGreaterThan(0);
    expect(novaShareOfEnemyHpAt(0.1), 'the nova deals a different real share of enemy HP at a different scale').toBeCloseTo(
      at1,
      9,
    );
  });

  it('the Corpse store banks and spends the same real share of enemy HP at every scale (both sides economy A)', () => {
    // `enemies.ts`'s damage-taken hook credits `dmgBooked * corpseStoreRatio`
    // into the store; `updateCorpseExecute`/`updateCorpseAutoFire` (cores.ts)
    // spend the store as damage against another enemy. Both `dmgBooked` and
    // the spend are economy A (still scaled by k together), so the ratio
    // needs no correction — verified here rather than assumed.
    const raw = content.raw.modifiers as Record<string, unknown>;
    const bankedShareAt = (k: number): number => {
      const c = loadContent({ modifiers: { ...raw, numberScale: k } });
      const authoredDamageDealt = 100;
      const dmgBookedLoaded = authoredDamageDealt * k; // economy A
      const banked = dmgBookedLoaded * c.coreByKey.get('corpse')!.effects!.corpseStoreRatio!;
      // Expressed as a share of the same-economy damage dealt, so both sides
      // of the "real value" comparison are already on economy A's own scale.
      return banked / dmgBookedLoaded;
    };
    const at1 = bankedShareAt(1);
    expect(at1).toBeGreaterThan(0);
    expect(bankedShareAt(0.1)).toBeCloseTo(at1, 12);
  });
});
