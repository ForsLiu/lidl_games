/**
 * Reads a tower's real numbers out of the sim and turns them into something a
 * player can act on (playtest report, 2026-08-25: "should show all the tower
 * stat info & attack details & upgrade info").
 *
 * Every figure here is derived from the same helpers the sim fires with, so
 * the panel cannot drift from what the tower actually does: tier multipliers,
 * Power, aura attack-speed and Constellation modifiers are all included.
 *
 * Presentation only — this module never writes to the World.
 */

import type { TowerDef, TowerAttack, WeaponDef, WeaponLevel } from '../sim/content';
import type { Structure, WeaponState } from '../sim/types';
import type { World } from '../sim/world';
import { weaponDamageMul, weaponDef } from '../sim/weapons';
import {
  attackSpeedFor,
  effectiveTowerAoe,
  effectiveTowerRange,
  tierDamageMul,
  towerCost,
  upgradeCost,
} from '../sim/towers';

export interface StatLine {
  label: string;
  value: string;
  /** What the same stat becomes one tier up, when there is a tier left. */
  next?: string;
}

export interface TowerInfo {
  key: string;
  name: string;
  desc: string;
  /** 1 for an unbuilt tower on the bar; the structure's tier when placed. */
  tier: number;
  maxTier: number;
  /** One sentence on how this tower picks and hits targets. */
  attackText: string;
  stats: StatLine[];
  /** Gold to place one now, or null for an already-placed structure. */
  buildCost: number | null;
  /** Gold to reach the next tier, or null at max tier / unbuilt. */
  upgrade: { toTier: number; cost: number } | null;
  /** Gold back if sold now, or null for an unbuilt tower. */
  sellValue: number | null;
  soul: { name: string; desc: string } | null;
  terrainText: string | null;
}

const KIND_TEXT: Record<string, (a: TowerAttack) => string> = {
  single: () => 'Fires at whichever enemy is furthest along the path to the Core.',
  pierce: (a) =>
    `Fires a bolt down the busiest line, hitting up to ${1 + (a.pierce ?? 1)} enemies for full damage each.`,
  cone: () =>
    'Sprays a cone at the densest cluster. The nearest few take full damage; each target past that takes less.',
  aura: () => 'Pulses every enemy inside its radius at once — no aiming, no travel time.',
  chain: (a) =>
    `Strikes the leading enemy, then arcs to ${a.chains ?? 3} more within ${a.chainRange ?? 3} tiles (+1 arc per tier).`,
  lob: (a) =>
    `Lobs a shell at a predicted position and detonates for ${fmt(a.aoe ?? 1.5)}-tile splash. Cannot hit anything closer than ${fmt(a.minRange ?? 0)} tiles.`,
  poison: () => 'Hits one target and stacks poison, which keeps ticking after the shot lands.',
};

function fmt(n: number, dp = 1): string {
  const r = Math.round(n * 10 ** dp) / 10 ** dp;
  return String(r);
}

/** Damage-per-shot after tiers, Power and Constellation tower damage. */
function shotDamage(w: World, a: TowerAttack, tier: number): number {
  return a.damage * tierDamageMul(w, tier) * w.derived.powerMul * w.derived.towerDamageMul;
}

function shotInterval(a: TowerAttack, speedMul: number): number {
  return a.interval / Math.max(0.05, speedMul);
}

/**
 * Delegates to the sim's own helper so the panel, the range rings and the
 * turret all quote one number (SPEC-V3 T1).
 */
function rangeOf(w: World, def: TowerDef, tier: number): number {
  return effectiveTowerRange(w, def, tier);
}

/**
 * `existing` supplies the structure's tier and its live attack-speed (Beacon
 * auras only apply to a tower that is actually standing somewhere).
 */
export function towerInfo(w: World, def: TowerDef, existing?: Structure): TowerInfo {
  const tier = existing?.tier ?? 1;
  const speedMul = existing ? attackSpeedFor(w, existing) : w.derived.attackSpeedMul;
  const hasNext = tier < def.maxTier;
  const a = def.attack;
  const stats: StatLine[] = [];

  if (a) {
    const dmg = shotDamage(w, a, tier);
    const interval = shotInterval(a, speedMul);
    const range = rangeOf(w, def, tier);
    const nextDmg = hasNext ? shotDamage(w, a, tier + 1) : 0;
    const nextRange = hasNext ? rangeOf(w, def, tier + 1) : 0;

    if (a.kind === 'cone') {
      // A cone is continuous: its "interval" is the tick it applies dps over.
      stats.push({
        label: 'Damage',
        value: `${fmt(dmg / a.interval)} dps`,
        next: hasNext ? `${fmt(nextDmg / a.interval)} dps` : undefined,
      });
    } else {
      stats.push({
        label: 'Damage',
        value: `${fmt(dmg)} per shot`,
        next: hasNext ? `${fmt(nextDmg)}` : undefined,
      });
      stats.push({ label: 'Rate', value: `${fmt(1 / interval, 2)} / s` });
      stats.push({
        label: 'Single-target DPS',
        value: fmt(dmg / interval),
        next: hasNext ? fmt(nextDmg / shotInterval(a, speedMul)) : undefined,
      });
    }

    stats.push({
      label: a.kind === 'aura' ? 'Radius' : 'Range',
      value: `${fmt(range)} tiles`,
      next: hasNext ? `${fmt(nextRange)}` : undefined,
    });
    if (a.minRange) stats.push({ label: 'Minimum range', value: `${fmt(a.minRange)} tiles` });
    // Through the shared helper, not inline: the Range line was moved onto it
    // and Splash was not, so the de-duplication was half done.
    const splash = effectiveTowerAoe(w, def);
    if (splash > 0) stats.push({ label: 'Splash', value: `${fmt(splash)} tiles` });
    if (a.slow) {
      stats.push({
        label: 'Slow',
        value: `${Math.round(a.slow * 100)}% for ${fmt(a.slowDuration ?? 1)}s`,
      });
    }
    if (a.burn) {
      stats.push({
        label: 'Burn',
        value: `${fmt(a.burn.dps * tierDamageMul(w, tier))} dps for ${fmt(a.burn.duration)}s`,
      });
    }
    if (a.poison) {
      stats.push({
        label: 'Poison',
        value: `${fmt(a.poison.dps * tierDamageMul(w, tier))} dps for ${fmt(a.poison.duration)}s, stacks ${a.poison.maxStacks}`,
      });
    }
  }

  if (def.buffAura) {
    stats.push({
      label: 'Aura',
      value: `+${Math.round(def.buffAura.attackSpeed * (1 + 0.25 * (tier - 1)) * 100)}% attack speed within ${fmt(
        def.buffAura.radius + w.derived.beaconRadiusBonus,
      )} tiles`,
    });
  }
  if (def.economy) {
    stats.push({
      label: 'Income',
      value: `${Math.round(def.economy.goldPerWavePerTier * tier * w.derived.sproutMul)} gold per wave`,
      next: hasNext
        ? `${Math.round(def.economy.goldPerWavePerTier * (tier + 1) * w.derived.sproutMul)}`
        : undefined,
    });
  }
  if (def.passive) {
    stats.push({
      label: 'Passive',
      value: `+${Math.round(def.passive.attackSpeedPer * 100)}% attack speed per adjacent tower, up to +${Math.round(
        def.passive.cap * 100,
      )}%`,
    });
  }
  if (def.blocks) stats.push({ label: 'Blocks path', value: `yes — ${Math.round(def.hp)} HP` });

  const soulDef = def.soul ? w.content.weaponByKey.get(def.soul) : undefined;

  return {
    key: def.key,
    name: def.name,
    desc: def.desc,
    tier,
    maxTier: def.maxTier,
    attackText: a
      ? (KIND_TEXT[a.kind]?.(a) ?? 'Attacks nearby enemies.')
      : 'Does not attack. Its value is where you put it.',
    stats,
    buildCost: existing ? null : towerCost(w, def),
    upgrade: existing && hasNext ? { toTier: tier + 1, cost: upgradeCost(w, def, tier + 1) } : null,
    sellValue: existing ? sellValueOf(w, def, tier) : null,
    soul: soulDef ? { name: soulDef.name, desc: soulDef.desc } : null,
    terrainText: describeTerrain(def),
  };
}

/** Mirrors `sellTower`: refunds a share of everything spent, tiers included. */
export function sellValueOf(w: World, def: TowerDef, tier: number): number {
  let spent = towerCost(w, def);
  for (let t = 2; t <= tier; t++) spent += upgradeCost(w, def, t);
  const towers = w.content.towers;
  const rate = w.phase === 'dusk' ? towers.duskSellRefund : towers.sellRefund;
  return Math.round(spent * rate);
}

/** What this tower leaves behind after the Sundering (SPEC 4). */
export function describeTerrain(def: TowerDef): string | null {
  const t = def.terrain;
  if (!t || t.kind === 'rubble') return null;
  const bits: string[] = [];
  if (t.blocks) bits.push('blocks movement');
  if (t.armorPerWall) {
    bits.push(`+${t.armorPerWall} Warden armour per nearby wall, up to +${t.armorCap ?? 0}`);
  }
  if (t.auraDps) {
    bits.push(`${t.auraType === 'poison' ? 'poisons' : 'burns'} for ${t.auraDps} dps within ${t.auraRadius ?? 0} tiles`);
  }
  if (t.slow) bits.push(`slows enemies within ${t.auraRadius ?? 0} tiles by ${Math.round(t.slow * 100)}%`);
  if (t.beamDps) {
    bits.push(`beams ${t.beamDps} dps between spires up to ${t.linkRange ?? 0} tiles apart`);
  }
  if (t.wardenAttackSpeed) {
    bits.push(`+${Math.round(t.wardenAttackSpeed * 100)}% Warden attack speed within ${t.wardenRadius ?? 0} tiles`);
  }
  if (t.gemInterval) bits.push(`drops a ${t.gemValue ?? 0} XP gem every ${t.gemInterval}s`);
  if (bits.length === 0) return null;
  return `Petrifies into ${t.kind.replace(/_/g, ' ')}: ${bits.join(', ')}.`;
}

/* ------------------------------------------------------------------ weapons */

export interface WeaponInfo {
  key: string;
  name: string;
  desc: string;
  level: number;
  maxLevel: number;
  awakened: boolean;
  /** Named awakening this weapon can still reach, with what it needs. */
  awakening: { name: string; desc: string; needs: string } | null;
  /** Where the soul came from, and what the extra towers were worth. */
  sourceText: string;
  attackText: string;
  stats: StatLine[];
}

const WEAPON_KIND_TEXT: Record<string, string> = {
  single: 'Fires at the nearest enemy on its own cooldown.',
  pierce: 'Fires along a line and keeps going through everything it hits.',
  cone: 'Burns everything in a cone in front of the Warden, continuously.',
  nova: 'Detonates around the Warden, hitting everything in radius.',
  chain: 'Strikes one enemy, then arcs to more nearby.',
  lob: 'Lobs a shell that detonates for splash damage.',
  trail: 'Leaves a lingering field on the ground behind the Warden.',
};

/** Fields worth showing, in the order a player reads them. */
const LEVEL_FIELDS: { key: keyof WeaponLevel; label: string; suffix?: string }[] = [
  { key: 'damage', label: 'Damage' },
  { key: 'dps', label: 'Damage', suffix: ' dps' },
  { key: 'interval', label: 'Every', suffix: 's' },
  { key: 'range', label: 'Range', suffix: ' tiles' },
  { key: 'radius', label: 'Radius', suffix: ' tiles' },
  { key: 'targets', label: 'Targets' },
  { key: 'bolts', label: 'Bolts' },
  { key: 'chains', label: 'Arcs' },
  { key: 'chainRange', label: 'Arc range', suffix: ' tiles' },
  { key: 'count', label: 'Count' },
  { key: 'duration', label: 'Lasts', suffix: 's' },
  { key: 'burnDps', label: 'Burn', suffix: ' dps' },
  { key: 'slow', label: 'Slow' },
];

/**
 * The Act II counterpart of `towerInfo`: after the Sundering the tower bar is
 * gone and the player had no way to see what a bound soul actually does, nor
 * what its next level buys.
 */
export function weaponInfo(w: World, ws: WeaponState): WeaponInfo {
  const def: WeaponDef = weaponDef(w, ws.key);
  const maxLevel = def.levels.length;
  const cur = def.levels[Math.max(0, Math.min(maxLevel, ws.level) - 1)];
  const nextLv = ws.level < maxLevel ? def.levels[ws.level] : null;
  const mul = weaponDamageMul(w, ws);

  const stats: StatLine[] = [];
  for (const f of LEVEL_FIELDS) {
    const raw = cur[f.key];
    if (typeof raw !== 'number') continue;
    const scale = f.key === 'damage' || f.key === 'dps' ? mul : 1;
    const nextRaw = nextLv ? nextLv[f.key] : undefined;
    const suffix = f.suffix ?? '';
    stats.push({
      label: f.label,
      value: f.key === 'slow' ? `${Math.round(raw * 100)}%` : `${fmt(raw * scale, 2)}${suffix}`,
      next:
        typeof nextRaw === 'number' && nextRaw !== raw
          ? f.key === 'slow'
            ? `${Math.round(nextRaw * 100)}%`
            : fmt(nextRaw * scale, 2)
          : undefined,
    });
  }
  if (ws.damageBonus > 0) {
    stats.push({ label: 'Inherited', value: `+${Math.round(ws.damageBonus * 100)}% damage` });
  }

  const awakening = w.content.weapons.awakenings.find((a) => a.weapon === ws.key) ?? null;
  const boon = awakening ? w.content.boonByKey.get(awakening.boon) : undefined;
  const source = def.source === 'innate' ? null : w.content.towerByKey.get(def.source);

  return {
    key: ws.key,
    name: def.name,
    desc: def.desc,
    level: ws.level,
    maxLevel,
    awakened: ws.awakened,
    awakening:
      awakening && !ws.awakened
        ? {
            name: awakening.name,
            desc: awakening.desc,
            needs: `Level ${maxLevel} and ${boon?.name ?? awakening.boon} at rank ${awakening.boonRank}`,
          }
        : null,
    sourceText: source
      ? `Bound from ${source.name}${ws.damageBonus > 0 ? ' — the extra copies you built are the inherited damage below.' : '.'}`
      : 'Innate — the Warden always carries it, and it costs no slot.',
    attackText: WEAPON_KIND_TEXT[def.kind] ?? 'Fires on its own.',
    stats,
  };
}
