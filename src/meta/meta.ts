/**
 * Meta progression state (SPEC 8): the Constellation allocation, equipment
 * stash, quests, tier unlocks — plus save/load.
 *
 * This lives outside /src/sim: the sim receives a plain RunConfig and never
 * reads persisted state directly.
 */

import { defaultCoreKey, loadContent, type Content } from '../sim/content';
import type { MetaState, RunReport } from '../sim/types';
import type { World } from '../sim/world';

/**
 * Deliberately frozen at `v1` even though SAVE_VERSION is now 4: renaming the
 * storage key would orphan every existing save and the migration below would
 * never get the chance to run. The key names the slot, not the format.
 */
export const SAVE_KEY = 'stonewake.save.v1';
/**
 * 1 = v0.1/v0.2. 2 = SPEC-V3 §8: the Orb currency is deleted, so `orbs` is
 * stripped from the save rather than carried forward as a zombie key that
 * `serializeMeta` would write back forever. 3 = fb023 (SPEC-FINAL §7): the
 * relic stash/equip UI is retired, so a save older than this version has its
 * `stash`/`equipped` dropped on load rather than carried forward into a
 * screen that no longer exists to show them (`migrateWithNotice` below).
 * 4 = p7d (SPEC-FINAL §8, Q46/Q49): the Ember -> account-level economy and
 * the relic affix/rarity system are retired outright — skill points are the
 * tree's only currency now. A save older than this version has any leftover
 * `ember` converted once into skill points at 100:1, then `ember`,
 * `accountLevel`, `stash`, `equipped` and `nextRelicId` are dropped — there
 * is no `Relic` type or account level left to carry them.
 *
 * Every destructive migration bumps this and gets a round-trip test, or a
 * save written by an older client will not survive an upgrade.
 */
export const SAVE_VERSION = 4;
/** fb023: the SAVE_VERSION that first drops relics — see `migrateWithNotice`. */
const RELICS_DROPPED_AT = 3;
/** p7d: the SAVE_VERSION that converts Ember and drops the economy it priced. */
const ECONOMY_RETIRED_AT = 4;
/** p7d (Q46): "one-time 100:1 Ember conversion". */
const EMBER_TO_SKILL_POINTS = 100;

/**
 * Keys a migration drops, with the SAVE_VERSION that retired each one. The
 * version gate matters: without it the strip would run forever, including on
 * saves written by a *newer* client that legitimately reuses the name for
 * something else — which would silently eat that field on every load.
 */
const RETIRED_KEYS: readonly { key: string; retiredIn: number }[] = [
  { key: 'orbs', retiredIn: 2 },
  { key: 'ember', retiredIn: ECONOMY_RETIRED_AT },
  { key: 'accountLevel', retiredIn: ECONOMY_RETIRED_AT },
  { key: 'stash', retiredIn: ECONOMY_RETIRED_AT },
  { key: 'equipped', retiredIn: ECONOMY_RETIRED_AT },
  { key: 'nextRelicId', retiredIn: ECONOMY_RETIRED_AT },
];

export function defaultMeta(): MetaState {
  const content = loadContent();
  return {
    allocated: [0],
    equipmentStash: {},
    equippedEquipment: Object.fromEntries(content.equipment.slots.map((slot) => [slot, null])),
    // Read off the roster rather than hardcoded: SPEC-FINAL §4.2's Unlocks line
    // names three free classes (Swordsman, Archer, Engineer), and a literal
    // here silently locked the other two out of a fresh account even though
    // `unlockedByDefault` said otherwise (p6d).
    unlockedClasses: content.classes.classes.filter((c) => c.unlockedByDefault).map((c) => c.key),
    unlockedCores: [defaultCoreKey(content)],
    highestTier: 1,
    questProgress: {},
    completedQuests: [],
    autoPickLevelUps: false,
    skillPoints: 0,
  };
}

/* ------------------------------------------------------------------ quests */

export function metricsFor(report: RunReport, w: World): Record<string, number> {
  const palisades = w.structures.filter(
    (s) => !s.dead && w.content.towerById.get(s.towerId)?.key === 'palisade',
  ).length;
  // Q101: §6.1 deleted weapon slots along with the named weapon roster, so
  // the "Ascetic" quest's old "win with at most 4 weapon slots" has nothing
  // left to count. Its spirit — win on a deliberately narrow build —
  // survives as "at most 4 distinct tower types built", read straight off
  // the report's own tally. The old metric only ever counted towers that
  // granted a weapon (a wall never did — `def.soul` was null), so a wall-only
  // maze cost nothing toward the cap; the equivalent filter today is the same
  // one `tools/a4probe.ts`'s SOUL_TOWERS uses in soul's place, `attack !==
  // null`, so Palisade (and any other non-attacking tower) still doesn't
  // count as one of the 4.
  const distinctTowerTypes = Object.keys(report.towersByKey).filter(
    (k) => (report.towersByKey[k] ?? 0) > 0 && w.content.towerByKey.get(k)?.attack != null,
  ).length;
  const won = report.outcome === 'victory' ? 1 : 0;
  return {
    wins: won,
    wins_t5: won && report.tier >= 5 ? 1 : 0,
    wins_max4towertypes: won && distinctTowerTypes <= 4 ? 1 : 0,
    built_frost_obelisk: report.towersByKey['frost_obelisk'] ?? 0,
    lifetime_gold: report.goldEarned,
    max_palisades_end: palisades,
    fastest_boss_kill: report.bossKilled ? report.bossKillSeconds : Number.POSITIVE_INFINITY,
    // p7d: real value filled in by `applyRunResult`, the same "computed from
    // the post-update account state, not the report alone" treatment
    // `max_rare_relics` used to get for the now-retired relic stash.
    max_equipment_dupes: 0,
  };
}

const CUMULATIVE = new Set(['wins', 'wins_t5', 'wins_max4towertypes', 'built_frost_obelisk', 'lifetime_gold']);

export function applyRunResult(meta: MetaState, report: RunReport, w: World): MetaState {
  const c = loadContent();
  // A practice run is a sandbox: it banks nothing, and it advances no quest
  // or tier unlock. Otherwise "add money" would be a way to farm the meta
  // rather than a way to test.
  if (report.practiceUsed) {
    return meta;
  }
  const next: MetaState = {
    ...meta,
    questProgress: { ...meta.questProgress },
    completedQuests: meta.completedQuests.slice(),
    unlockedClasses: meta.unlockedClasses.slice(),
    allocated: meta.allocated.slice(),
    equipmentStash: { ...meta.equipmentStash },
    equippedEquipment: { ...meta.equippedEquipment },
  };

  // fb015 (§8.1): "each TD wave cleared -> 1 random equipment ... granted at
  // run end, win or lose ... duplicates allowed" — no stash cap, unlike the
  // old relic stash: the owner table names none, and "duplicates allowed"
  // reads as deliberately uncapped.
  for (const key of w.equipmentFound) {
    next.equipmentStash[key] = (next.equipmentStash[key] ?? 0) + 1;
  }

  // §8.2 (p7c): "each VS wave cleared -> 1 skill point," the same "granted
  // at run end, win or lose" rule the equipment loop above follows. §8.3
  // (p7d, Q46): skill points are the tree's only currency, so this is the
  // account's entire growth — no account level, no Ember.
  next.skillPoints += report.vsWavesCleared;

  if (report.outcome === 'victory' && report.tier >= next.highestTier) {
    next.highestTier = Math.min(5, report.tier + 1);
  }

  const maxDupes = Object.values(next.equipmentStash).reduce((m, n) => Math.max(m, n), 0);
  const metrics = metricsFor(report, w);
  metrics.max_equipment_dupes = maxDupes;

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
 * Grants skill points so the Constellation can be tried without playing for
 * them (playtest report, 2026-08-25: "if there is a feature, let there be a
 * use, like Points 0"). `seedTestEquipment` is the matching equipment half.
 */
export function seedTestAccount(meta: MetaState, points = 20): MetaState {
  return { ...meta, skillPoints: meta.skillPoints + points };
}

/**
 * fb023: the Settings "Seed a test account" button's equipment half, now that
 * the Hub's Equipment screen (not the retired Stash tab) is what a developer
 * presses this to try — a few of every `data/equipment.json` item, so every
 * slot has more than one candidate to compare and swap between. Additive like
 * `seedTestAccount`, pressing it twice tops counts up further rather than
 * resetting them.
 */
export function seedTestEquipment(meta: MetaState, countEach = 3): MetaState {
  const content = loadContent();
  const equipmentStash = { ...meta.equipmentStash };
  for (const item of content.equipment.items) {
    equipmentStash[item.key] = (equipmentStash[item.key] ?? 0) + countEach;
  }
  return { ...meta, equipmentStash };
}

export function pointsAvailable(meta: MetaState): number {
  const allocated = meta.allocated.filter((id) => id !== 0).length;
  return Math.max(0, meta.skillPoints - allocated);
}

/* ------------------------------------------------------------------- tree */

/**
 * fb014 (Q134, SPEC-FINAL §8.3 temporary supersede): the Constellation counts
 * as fully allocated for actual play, in dev and normal builds alike, until an
 * owner verdict says otherwise. `MetaState.allocated`/`pointsAvailable` keep
 * tracking real progression underneath unchanged, so points still accrue and
 * display and a future flip back to `false` restores real spending with no
 * data migration.
 */
export const TREE_AUTO_MAX = true;

/** Every allocatable node id, in authored order — the "fully allocated" run input. */
export function allTreeNodeIds(content: Content): number[] {
  return [...content.treeById.keys()];
}

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
   * fresh account (0 skill points banked yet) could never take back its very
   * first point.
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

export type RefundBlocker = 'not_allocated' | 'would_orphan' | 'points';

/** Why a refund is not available, or null when it is. */
export function refundBlocker(
  meta: MetaState,
  nodeId: number,
  opts: RefundOptions = {},
): RefundBlocker | null {
  if (nodeId === 0 || !meta.allocated.includes(nodeId)) return 'not_allocated';
  if (!isConnected(meta.allocated.filter((id) => id !== nodeId))) return 'would_orphan';
  if (!opts.free && meta.skillPoints < loadContent().tree.respecCostPerNode) return 'points';
  return null;
}

/** §8.3 (Q46): "respec 1 point per node" — the same currency `allocate` spends. */
export function refund(meta: MetaState, nodeId: number, opts: RefundOptions = {}): MetaState {
  if (!canRefund(meta, nodeId, opts)) return meta;
  const cost = opts.free ? 0 : loadContent().tree.respecCostPerNode;
  return {
    ...meta,
    skillPoints: meta.skillPoints - cost,
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
  return migrateWithNotice(meta, version).meta;
}

/**
 * fb023/p7d: `migrate` plus the information a caller needs to show one-time
 * notices — whether this load just dropped a real, nonempty relic stash/
 * loadout, and how many skill points a leftover Ember balance converted into.
 *
 * `relicsDropped`: a save older than `RELICS_DROPPED_AT` had a live Stash UI
 * that could genuinely hold relics; one at or past it never could, so
 * `relicsDropped` is always `false` there even if `stash`/`equipped`
 * round-tripped a leftover value some other way. Both fields are read off the
 * *raw* parsed object rather than the typed `MetaState` parameter, since
 * `Relic`/`stash`/`equipped`/`ember`/`accountLevel` no longer exist on the
 * type at all past this migration — the same reason `RETIRED_KEYS` strips
 * them by name below rather than by field access.
 */
function migrateWithNotice(
  meta: MetaState,
  version: number,
): { meta: MetaState; relicsDropped: boolean; skillPointsFromEmber: number } {
  const base = defaultMeta();
  const raw = meta as unknown as Record<string, unknown>;
  const dropRelics =
    version < RELICS_DROPPED_AT &&
    ((Array.isArray(raw.stash) && raw.stash.length > 0) ||
      (raw.equipped != null &&
        typeof raw.equipped === 'object' &&
        Object.values(raw.equipped as Record<string, unknown>).some((v) => v != null)));
  const skillPointsFromEmber =
    version < ECONOMY_RETIRED_AT && typeof raw.ember === 'number' && Number.isFinite(raw.ember) && raw.ember > 0
      ? Math.floor(raw.ember / EMBER_TO_SKILL_POINTS)
      : 0;
  const out: MetaState = {
    ...base,
    ...meta,
    // fb015 (§7): an old save has neither field the same way `equipped` used
    // to before fb015 — an object-typed field guards against the same
    // corrupt-non-object class `unlockedCores`'s `Array.isArray` check
    // guards against below.
    equipmentStash:
      meta.equipmentStash && typeof meta.equipmentStash === 'object' && !Array.isArray(meta.equipmentStash)
        ? { ...meta.equipmentStash }
        : {},
    // qa-playtester (fb023): unguarded like `equipped`'s pre-fb015 shape used
    // to be — a corrupt non-object `equippedEquipment` (a string, an array)
    // spread character-by-character/index-by-index into junk keys that then
    // persisted through every re-serialize. Same guard `equipmentStash` gets
    // two lines up.
    equippedEquipment:
      meta.equippedEquipment && typeof meta.equippedEquipment === 'object' && !Array.isArray(meta.equippedEquipment)
        ? { ...base.equippedEquipment, ...meta.equippedEquipment }
        : { ...base.equippedEquipment },
    questProgress: { ...(meta.questProgress ?? {}) },
    completedQuests: [...(meta.completedQuests ?? [])],
    unlockedClasses: [...(meta.unlockedClasses ?? base.unlockedClasses)],
    // `Array.isArray`, not just `?? base`: a corrupt non-array value (e.g. a
    // string) would otherwise spread character-by-character into a
    // same-shaped-but-wrong array, the same class of gap p7g fixes for
    // `stash` — cheap to guard against here since the field is new.
    unlockedCores: Array.isArray(meta.unlockedCores) ? [...meta.unlockedCores] : base.unlockedCores,
    allocated: [...(meta.allocated ?? base.allocated)],
    // fb012: guarded rather than left to the bare `...meta` spread above (the
    // laundering hole q3-save-fuzz pins for `accountLevel`/`ember`/etc.) —
    // cheap to close here since, like `unlockedCores`, the field is new.
    autoPickLevelUps: typeof meta.autoPickLevelUps === 'boolean' ? meta.autoPickLevelUps : base.autoPickLevelUps,
    // p7d: same "guard a new field cheaply" reasoning as `autoPickLevelUps`
    // just above — a corrupt or absent value falls back rather than laundering
    // a NaN/string into a currency total that only ever grows. The converted
    // Ember (Q46's one-time 100:1 rate) is added on top, so a pre-p7d save's
    // real currency survives the retirement instead of evaporating.
    skillPoints: (Number.isFinite(meta.skillPoints) ? meta.skillPoints : base.skillPoints) + skillPointsFromEmber,
  };
  if (!out.allocated.includes(0)) out.allocated.unshift(0);
  if (!isConnected(out.allocated)) out.allocated = [0];
  // §5.5: Stone Heart is the guaranteed default, never itself locked out — an
  // `unlockedCores` that migrated to `[]` (QA found this reachable: an
  // explicitly-empty array survives the `Array.isArray` guard above, since
  // that guard only catches non-arrays) must not leave the Hub rendering the
  // default core as simultaneously selected and locked.
  const defaultCore = defaultCoreKey(loadContent());
  if (!out.unlockedCores.includes(defaultCore)) out.unlockedCores.unshift(defaultCore);
  // The `...meta` spread above copies whatever the old save held, including
  // keys whose systems are gone. Strip them so they do not round-trip.
  //
  // Two guards, both from QA on this item: only strip from saves older than
  // the version that retired the key, and never strip a name the current
  // MetaState actually uses — otherwise a future field reusing a retired name
  // would be eaten silently.
  const bag = out as unknown as Record<string, unknown>;
  for (const { key, retiredIn } of RETIRED_KEYS) {
    if (version < retiredIn && !(key in base)) delete bag[key];
  }
  return { meta: out, relicsDropped: dropRelics, skillPointsFromEmber };
}

export function loadMeta(): MetaState {
  return loadMetaWithNotice().meta;
}

/**
 * fb023/p7d: `loadMeta` plus a one-time notice string when this load just
 * retired a real relic stash/loadout and/or converted a leftover Ember
 * balance, for the Hub to show once on the first screen after the upgrade.
 * `main.ts` is the one caller that needs the notice; every existing
 * `loadMeta()` call site (tests included) keeps working unchanged.
 */
export function loadMetaWithNotice(): { meta: MetaState; notice: string | null } {
  try {
    const raw = globalThis.localStorage?.getItem(SAVE_KEY);
    if (!raw) return { meta: defaultMeta(), notice: null };
    const parsed = JSON.parse(raw) as Partial<SaveFile>;
    if (!parsed || typeof parsed !== 'object' || !parsed.meta) return { meta: defaultMeta(), notice: null };
    const { meta, relicsDropped, skillPointsFromEmber } = migrateWithNotice(
      parsed.meta as MetaState,
      parsed.version ?? 0,
    );
    const notices: string[] = [];
    if (relicsDropped) {
      notices.push('Relics have been retired — your stashed relics were removed. Equipment (Hub → Equipment) is unaffected.');
    }
    if (skillPointsFromEmber > 0) {
      notices.push(
        `Ember has been retired — your leftover Ember converted to ${skillPointsFromEmber} skill point${
          skillPointsFromEmber === 1 ? '' : 's'
        }.`,
      );
    }
    return { meta, notice: notices.length > 0 ? notices.join(' ') : null };
  } catch {
    return { meta: defaultMeta(), notice: null };
  }
}

export function saveMeta(meta: MetaState): void {
  try {
    globalThis.localStorage?.setItem(SAVE_KEY, serializeMeta(meta));
  } catch {
    // Storage unavailable (private mode, headless): meta simply does not persist.
  }
}
