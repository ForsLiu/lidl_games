/**
 * Meta progression state (SPEC 8): account level, Constellation allocation,
 * relic stash, quests, tier unlocks — plus save/load.
 *
 * This lives outside /src/sim: the sim receives a plain RunConfig and never
 * reads persisted state directly.
 */

import { loadContent } from '../sim/content';
import { rollRelic } from '../sim/loot';
import { Rng } from '../sim/rng';
import type { MetaState, Relic, RunReport } from '../sim/types';
import type { World } from '../sim/world';

export const SAVE_KEY = 'stonewake.save.v1';
export const SAVE_VERSION = 1;

export function defaultMeta(): MetaState {
  const ember = loadContent().tree.startingEmber;
  return {
    accountLevel: accountLevelFor(ember),
    ember,
    allocated: [0],
    stash: [],
    equipped: { sigil: null, plate: null, charm: null },
    unlockedClasses: ['engineer'],
    highestTier: 1,
    questProgress: {},
    completedQuests: [],
    nextRelicId: 1,
  };
}

/* ------------------------------------------------------------------ ember */

/** SPEC 8.1: Ember = base 100 x completion% x tier multiplier. */
export function emberFor(report: RunReport, w: World): number {
  const c = loadContent();
  const completion = completionFraction(report);
  const tierMul = 1 + c.modifiers.tierRewardPerStep * (report.tier - 1);
  const modBonus = report.modifiers.reduce((acc, key) => {
    const m = c.modifierByKey.get(key);
    return acc + (m ? m.rewardBonus * (1 + w.stats.modRewardBonus) : 0);
  }, 0);
  const lastStandPenalty = w.lastStandUsed ? 0.7 : 1;
  const leftoverGold = report.goldLeft / 10; // SPEC 3.2: 10 gold : 1 Ember
  const base = c.tree.emberBase * completion * tierMul * (1 + modBonus);
  return Math.round((base + leftoverGold) * (1 + w.derived.emberFind) * lastStandPenalty);
}

/**
 * How much of the run was completed. Act I is worth 40%, Act II survival 50%,
 * the boss kill the last 10%; a defeat in Act I keeps SPEC 1's 40% floor share.
 */
export function completionFraction(report: RunReport): number {
  const wavePart = Math.min(1, report.wavesCleared / 10) * 0.4;
  const survivalPart = Math.min(1, report.survivalSeconds / 600) * 0.5;
  const bossPart = report.bossKilled ? 0.1 : 0;
  const raw = wavePart + survivalPart + bossPart;
  return report.outcome === 'victory' ? Math.max(raw, 1) : raw * 0.4 + raw * 0.6 * 0.4 + raw * 0.36;
}

/* ------------------------------------------------------------------ quests */

export function metricsFor(report: RunReport, w: World): Record<string, number> {
  const palisades = w.structures.filter(
    (s) => !s.dead && w.content.towerById.get(s.towerId)?.key === 'palisade',
  ).length;
  const slotted = report.weapons.filter(
    (x) => !w.content.weaponByKey.get(x.key)?.slotless,
  ).length;
  const won = report.outcome === 'victory' ? 1 : 0;
  return {
    wins: won,
    wins_t5: won && report.tier >= 5 ? 1 : 0,
    wins_max4slots: won && slotted <= 4 ? 1 : 0,
    built_frost_obelisk: report.towersByKey['frost_obelisk'] ?? 0,
    lifetime_gold: report.goldEarned,
    max_palisades_end: palisades,
    fastest_boss_kill: report.bossKilled ? report.bossKillSeconds : Number.POSITIVE_INFINITY,
    max_rare_relics: 0,
  };
}

const CUMULATIVE = new Set(['wins', 'wins_t5', 'wins_max4slots', 'built_frost_obelisk', 'lifetime_gold']);

export function applyRunResult(meta: MetaState, report: RunReport, w: World): MetaState {
  const c = loadContent();
  // A practice run is a sandbox: it banks no Ember, no relics, and it
  // advances no quest or tier unlock. Otherwise "add money" would be a way to
  // farm the meta rather than a way to test.
  if (report.practiceUsed) {
    w.emberEarned = 0;
    return meta;
  }
  const next: MetaState = {
    ...meta,
    stash: meta.stash.slice(),
    questProgress: { ...meta.questProgress },
    completedQuests: meta.completedQuests.slice(),
    unlockedClasses: meta.unlockedClasses.slice(),
    allocated: meta.allocated.slice(),
    equipped: { ...meta.equipped },
  };

  const ember = emberFor(report, w);
  w.emberEarned = ember;
  next.ember += ember;
  next.accountLevel = accountLevelFor(next.ember);

  for (const r of w.relicsFound) {
    if (next.stash.length >= stashCapacity(next)) break;
    next.stash.push({ ...r, id: next.nextRelicId++ });
  }

  if (report.outcome === 'victory' && report.tier >= next.highestTier) {
    next.highestTier = Math.min(5, report.tier + 1);
  }

  const rareCount = next.stash.filter((r) => r.rarity === 'rare').length;
  const metrics = metricsFor(report, w);
  metrics.max_rare_relics = rareCount;

  for (const [key, value] of Object.entries(metrics)) {
    if (!Number.isFinite(value)) continue;
    const prev = next.questProgress[key] ?? 0;
    next.questProgress[key] = CUMULATIVE.has(key) ? prev + value : Math.max(prev, value);
  }
  if (metrics.fastest_boss_kill !== Number.POSITIVE_INFINITY) {
    const prev = next.questProgress.fastest_boss_kill ?? Number.POSITIVE_INFINITY;
    next.questProgress.fastest_boss_kill = Math.min(prev, metrics.fastest_boss_kill);
  }

  for (const q of c.quests.quests) {
    if (next.completedQuests.includes(q.key)) continue;
    const v = next.questProgress[q.metric];
    if (v === undefined) continue;
    const done = q.compare === 'lte' ? v <= q.target : v >= q.target;
    if (!done) continue;
    next.completedQuests.push(q.key);
    if (q.reward.kind === 'class' && !next.unlockedClasses.includes(q.reward.value)) {
      next.unlockedClasses.push(q.reward.value);
    }
  }

  return next;
}

/**
 * Fills a fresh account with enough to exercise the stash and
 * the Constellation without playing for an hour (playtest report, 2026-08-25:
 * "add some basic stash/relic for testing", "if there is a feature, let there
 * be a use, like Points 0").
 *
 * Deterministic from the account's own next relic id, so pressing it twice
 * gives two different batches and a reload gives the same ones.
 */
export function seedTestAccount(meta: MetaState, count = 8): MetaState {
  const content = loadContent();
  const rng = new Rng((meta.nextRelicId * 2654435761 + meta.stash.length) >>> 0);
  const cap = stashCapacity(meta);
  const next: MetaState = {
    ...meta,
    stash: meta.stash.slice(),
    allocated: meta.allocated.slice(),
    equipped: { ...meta.equipped },
    questProgress: { ...meta.questProgress },
    completedQuests: meta.completedQuests.slice(),
    unlockedClasses: meta.unlockedClasses.slice(),
  };
  // One guaranteed rare, so the craft buttons have something worth working on.
  const rarities = ['rare', ...Array(Math.max(0, count - 1)).fill(undefined)];
  for (const forced of rarities) {
    if (next.stash.length >= cap) break;
    next.stash.push(rollRelic(content, rng, 0, next.nextRelicId++, forced));
  }
  next.ember += 600;
  next.accountLevel = accountLevelFor(next.ember);
  return next;
}

export function stashCapacity(meta: MetaState): number {
  const base = loadContent().relics.stashSlots;
  return base + (meta.completedQuests.includes('archivist') ? 8 : 0);
}

/** Account level from total Ember: each level costs 100 x level Ember. */
export function accountLevelFor(ember: number): number {
  const max = loadContent().tree.maxAccountLevel;
  let level = 1;
  let spent = 0;
  while (level < max) {
    const cost = 100 * level;
    if (ember < spent + cost) break;
    spent += cost;
    level++;
  }
  return level;
}

export function pointsAvailable(meta: MetaState): number {
  const perLevel = loadContent().tree.pointsPerLevel;
  const allocated = meta.allocated.filter((id) => id !== 0).length;
  return Math.max(0, meta.accountLevel * perLevel - allocated);
}

/* ------------------------------------------------------------------- tree */

/** A node may be taken only if it touches something already allocated. */
export function canAllocate(meta: MetaState, nodeId: number): boolean {
  const c = loadContent();
  const node = c.treeById.get(nodeId);
  if (!node || node.kind === 'start') return false;
  if (meta.allocated.includes(nodeId)) return false;
  if (pointsAvailable(meta) <= 0) return false;
  return node.links.some((l) => meta.allocated.includes(l));
}

export function allocate(meta: MetaState, nodeId: number): MetaState {
  if (!canAllocate(meta, nodeId)) return meta;
  return { ...meta, allocated: [...meta.allocated, nodeId] };
}

export interface RefundOptions {
  /**
   * True for a point spent in this Hub visit and not yet taken into a run.
   * Undoing a misclick is not a respec, so it costs nothing — without this a
   * fresh account (0 Ember, and Ember only arrives at the end of a run) could
   * never take back its very first point.
   */
  free?: boolean;
}

/**
 * Refunding a node must not orphan anything downstream of it, and must be
 * paid for. Affordability lives here rather than only inside `refund` so the
 * UI can gate the action and explain itself instead of silently doing nothing.
 */
export function canRefund(meta: MetaState, nodeId: number, opts: RefundOptions = {}): boolean {
  return refundBlocker(meta, nodeId, opts) === null;
}

export type RefundBlocker = 'not_allocated' | 'would_orphan' | 'ember';

/** Why a refund is not available, or null when it is. */
export function refundBlocker(
  meta: MetaState,
  nodeId: number,
  opts: RefundOptions = {},
): RefundBlocker | null {
  if (nodeId === 0 || !meta.allocated.includes(nodeId)) return 'not_allocated';
  if (!isConnected(meta.allocated.filter((id) => id !== nodeId))) return 'would_orphan';
  if (!opts.free && meta.ember < loadContent().tree.respecCostPerNode) return 'ember';
  return null;
}

export function refund(meta: MetaState, nodeId: number, opts: RefundOptions = {}): MetaState {
  if (!canRefund(meta, nodeId, opts)) return meta;
  const cost = opts.free ? 0 : loadContent().tree.respecCostPerNode;
  return {
    ...meta,
    ember: meta.ember - cost,
    allocated: meta.allocated.filter((id) => id !== nodeId),
  };
}

export function isConnected(allocated: number[]): boolean {
  const c = loadContent();
  const set = new Set(allocated);
  if (!set.has(0)) return set.size === 0;
  const seen = new Set<number>([0]);
  const queue = [0];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const node = c.treeById.get(id);
    if (!node) continue;
    for (const l of node.links) {
      if (set.has(l) && !seen.has(l)) {
        seen.add(l);
        queue.push(l);
      }
    }
  }
  return seen.size === set.size;
}

/* --------------------------------------------------------------- save/load */

export interface SaveFile {
  version: number;
  meta: MetaState;
}

export function serializeMeta(meta: MetaState): string {
  return JSON.stringify({ version: SAVE_VERSION, meta } satisfies SaveFile);
}

export function deserializeMeta(json: string): MetaState {
  const parsed = JSON.parse(json) as Partial<SaveFile>;
  if (!parsed || typeof parsed !== 'object' || !parsed.meta) return defaultMeta();
  return migrate(parsed.meta as MetaState, parsed.version ?? 0);
}

function migrate(meta: MetaState, version: number): MetaState {
  const base = defaultMeta();
  const out: MetaState = {
    ...base,
    ...meta,
    equipped: { ...base.equipped, ...(meta.equipped ?? {}) },
    questProgress: { ...(meta.questProgress ?? {}) },
    completedQuests: [...(meta.completedQuests ?? [])],
    unlockedClasses: [...(meta.unlockedClasses ?? base.unlockedClasses)],
    allocated: [...(meta.allocated ?? base.allocated)],
    stash: (meta.stash ?? []).map((r: Relic) => ({ ...r, affixes: [...(r.affixes ?? [])] })),
  };
  if (!out.allocated.includes(0)) out.allocated.unshift(0);
  if (!isConnected(out.allocated)) out.allocated = [0];
  void version;
  return out;
}

export function loadMeta(): MetaState {
  try {
    const raw = globalThis.localStorage?.getItem(SAVE_KEY);
    if (!raw) return defaultMeta();
    return deserializeMeta(raw);
  } catch {
    return defaultMeta();
  }
}

export function saveMeta(meta: MetaState): void {
  try {
    globalThis.localStorage?.setItem(SAVE_KEY, serializeMeta(meta));
  } catch {
    // Storage unavailable (private mode, headless): meta simply does not persist.
  }
}
