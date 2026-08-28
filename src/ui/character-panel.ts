/**
 * Character panel data model (owner feedback `feature-boon-stats-panel`,
 * BACKLOG.md fb004; SPEC-FINAL §2 core math, §6.3 VS boons, §11 "click-select
 * anything with stats panel").
 *
 * Every number here is read straight off `w.stats`/`w.boonRanks` — nothing is
 * recomputed — so the panel cannot drift from what the sim actually uses.
 * `StatRow.value` is `Stats.total(key)` (a `flat` stat) or `Stats.factor(key)`
 * (a `mul` stat): §2's own "ranks within a source add, sources multiply"
 * aggregate, for every `StatKey` the sim knows about. `StatRow.sources` is
 * `Stats.contributions(key)` itself, human-labelled — the "multiplier
 * breakdown by source" the acceptance criteria ask for, generic over
 * whatever sources actually fed the stat (class, tree, relic, boon, core,
 * terrain, map modifiers), not special-cased per source kind.
 *
 * §7's Equipment table (weapon/armor/shoes/ring/necklace/bracelet) is not yet
 * implemented — it is still BACKLOG.md's p7b, unbuilt as of this item. A
 * relic (`relic:<id>` source) is the closest live analog and already shows
 * up generically in the per-stat breakdown below. There is deliberately no
 * separate "Equipment" section: one would either render empty (nothing to
 * show) or would have to invent numbers no `/data` file defines yet, which
 * CLAUDE.md's architecture rule 4 (content lives in `/data`, never invented
 * in code) forbids. Logged as QUESTIONS.md Q132.
 *
 * Presentation only — this module never writes to the World.
 */

import { STAT_KEYS, STAT_KIND, type StatKey, type StatKind, type StatSource } from '../sim/stats';
import type { World } from '../sim/world';

/** Human-readable stat names. Falls back to the raw key for anything not
 * named here, so a stat added later still renders instead of vanishing. */
const STAT_LABELS: Partial<Record<StatKey, string>> = {
  power: 'Power',
  attackSpeed: 'Attack Speed',
  area: 'Area',
  moveSpeedPct: 'Move Speed',
  maxHp: 'Max HP',
  maxHpPct: 'Max HP %',
  armor: 'Armour',
  cdr: 'Cooldown Reduction',
  pickupPct: 'Pickup Radius',
  luck: 'Luck',
  goldFind: 'Gold Find',
  emberFind: 'Ember Find',
  relicFind: 'Relic Find',
  ailmentPotency: 'Ailment Potency',
  towerCost: 'Tower Cost',
  towerDamage: 'Tower Damage',
  towerRange: 'Tower Range',
  towerAttackSpeed: 'Tower Attack Speed',
  towerPoisonDamage: 'Tower Poison Damage',
  towerHp: 'Tower HP',
  towerDefenseBonus: 'Tower Defense',
  coreHp: 'Core HP',
  buildRange: 'Build Range',
  wallHp: 'Wall HP',
  goldPerKill: 'Gold per Kill',
  sproutGold: 'Harvest Sprout Output',
  residualPotency: 'Terrain Residuals',
  beaconRadius: 'Beacon Aura Radius',
  teslaLinks: 'Spire Links',
  dashCharges: 'Dash Charges',
  hpRegen: 'HP Regen',
  leech: 'Leech',
  secondWind: 'Second Wind',
  modRewardBonus: 'Reward per Modifier',
  lastStandSundering: 'Last Stand Sundering',
  burnDamage: 'Burn Damage',
  burnSpread: 'Burn Spread',
  slowPotency: 'Slow Potency',
  chilledDamageTaken: 'Chilled Damage Taken',
  xpGain: 'XP Gain',
};

export function statLabel(key: StatKey): string {
  return STAT_LABELS[key] ?? key;
}

/** One (source, value) contribution, human-labelled for display. */
export interface StatSourceRow {
  source: StatSource;
  label: string;
  value: number;
}

/**
 * One final stat's §2 multiplier breakdown. `value` and `sources` are read
 * directly off `Stats` (`total`/`factor`/`contributions`) — see the file
 * header — so a test can assert them field-for-field against `w.stats`
 * itself rather than a re-derived number.
 */
export interface StatRow {
  key: StatKey;
  label: string;
  kind: StatKind;
  value: number;
  sources: StatSourceRow[];
}

/** A boon actually taken this run, with its rank and its live contribution. */
export interface BoonRow {
  key: string;
  name: string;
  rank: number;
  maxRank: number;
  stat: StatKey;
  statLabel: string;
  /** `STAT_KIND[stat]` — the panel needs this to format `contribution`
   * correctly: a `mul` boon's `perRank` is a fraction (0.08 = +8%), a `flat`
   * one's is a point value, and only the boon's own stat says which. */
  kind: StatKind;
  perRank: number;
  /**
   * This boon's own `boon:<key>` source value, read back out of
   * `Stats.contributions` rather than recomputed as `rank * perRank` — so a
   * future change to how ranks land in `Stats` (progression.ts's
   * `applyOffer`) cannot silently desync the panel from what `Stats` holds.
   */
  contribution: number;
}

export interface CharacterPanelData {
  stats: StatRow[];
  boons: BoonRow[];
}

/** Turns a raw `(prefix:id[:sub])` source id into a human label. Generic by
 * design: a new source prefix falls through to the raw string rather than
 * needing a code change here to become visible. */
function sourceLabel(w: World, source: StatSource): string {
  const parts = source.split(':');
  const prefix = parts[0];
  switch (prefix) {
    case 'class': {
      const cls = w.content.classByKey.get(parts[1]);
      const name = cls?.name ?? parts[1];
      if (parts[2] === 'passive') return `${name} (Passive)`;
      if (parts[2] === 'towerPassive') return `${name} (Tower Passive)`;
      if (parts[2] === 'bands') return `${name} (Move Band)`;
      return `${name} (Class)`;
    }
    case 'tree': {
      const id = Number(parts[1]);
      const node = w.content.treeById.get(id);
      return node ? `Constellation: ${node.name}` : `Constellation node ${parts[1]}`;
    }
    case 'relic': {
      const id = Number(parts[1]);
      const relic = w.cfg.relics.find((r) => r.id === id);
      return relic ? `Relic: ${relic.name}` : `Relic #${parts[1]}`;
    }
    case 'boon': {
      const def = w.content.boonByKey.get(parts[1]);
      const rank = w.boonRanks[parts[1]] ?? 0;
      return `Boon: ${def?.name ?? parts[1]} (rank ${rank})`;
    }
    case 'core': {
      const def = w.content.coreByKey.get(parts[1]);
      const name = def?.name ?? parts[1];
      return parts[2] ? `Core: ${name} (${parts[2]})` : `Core: ${name}`;
    }
    case 'modifiers':
      return 'Map modifiers';
    case 'terrain':
      return 'Petrified terrain';
    default:
      return source;
  }
}

/**
 * Builds the panel's data model. Called fresh each time the panel needs to
 * redraw (Hud gates the redraw itself) — cheap: `STAT_KEYS` is under 40
 * entries and `Stats.contributions` is already a sorted array read, not a
 * recompute.
 */
export function characterPanelData(w: World): CharacterPanelData {
  const stats: StatRow[] = STAT_KEYS.map((key) => {
    const kind = STAT_KIND[key];
    const value = kind === 'flat' ? w.stats.total(key) : w.stats.factor(key);
    const sources = w.stats.contributions(key).map(([source, v]) => ({
      source,
      label: sourceLabel(w, source),
      value: v,
    }));
    return { key, label: statLabel(key), kind, value, sources };
  });

  const boons: BoonRow[] = Object.keys(w.boonRanks)
    .filter((key) => (w.boonRanks[key] ?? 0) > 0)
    .sort()
    .map((key) => {
      const def = w.content.boonByKey.get(key);
      const rank = w.boonRanks[key];
      const stat = (def?.stat ?? '') as StatKey;
      const src = w.stats.contributions(stat).find(([s]) => s === `boon:${key}`);
      return {
        key,
        name: def?.name ?? key,
        rank,
        maxRank: def?.maxRank ?? rank,
        stat,
        statLabel: statLabel(stat),
        kind: STAT_KIND[stat] ?? 'flat',
        perRank: def?.perRank ?? 0,
        contribution: src ? src[1] : 0,
      };
    });

  return { stats, boons };
}
