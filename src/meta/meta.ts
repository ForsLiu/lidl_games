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
    wins_max4towertypes: won && distinctTowerTypes <= 4 ? 1 : 0,
    // p7e: "win with a sealed Core" (§8.4, Paladin) — `report.sealed` latches
    // true the moment Act I is ever sampled fully sealed, win or lose, so
    // this metric additionally requires the win.
    wins_sealed: won && report.sealed ? 1 : 0,
    built_frost_obelisk: report.towersByKey['frost_obelisk'] ?? 0,
    lifetime_gold: report.goldEarned,
    max_palisades_end: palisades,
    fastest_boss_kill: report.bossKilled ? report.bossKillSeconds : Number.POSITIVE_INFINITY,
    // p7d: real value filled in by `applyRunResult`, the same "computed from
    // the post-update account state, not the report alone" treatment
    // `max_rare_relics` used to get for the now-retired relic stash.
    max_equipment_dupes: 0,
    // p7h (§5.5, §8.4): the four Core-unlock metrics, same "computed from the
    // report/world, banked lifetime or per-run" families the class quests
    // above already use.
    poison_kills: w.poisonKills,
    // "finish a run with the Core at or below 25% HP" (§5.5) — win or lose,
    // since §5.5 says "finish", not "win" (Time's quest below says "win"
    // explicitly, so the distinction is deliberate, not an oversight).
    core_finish_low_hp: report.coreMaxHp > 0 && report.coreHp <= report.coreMaxHp * 0.25 ? 1 : 0,
    lifetime_damage: report.damageTotal,
    fastest_win_seconds: won ? report.totalSeconds : Number.POSITIVE_INFINITY,
  };
}

const CUMULATIVE = new Set([
  'wins',
  'wins_sealed',
  'wins_max4towertypes',
  'built_frost_obelisk',
  'lifetime_gold',
  'poison_kills',
  'lifetime_damage',
]);
/**
 * p7h: generalizes what used to be a single `fastest_boss_kill`-only special
 * case below the generic loop — a metric here tracks its running *minimum*
 * across runs (a `Number.POSITIVE_INFINITY` sentinel for "not achieved this
 * run" is skipped, never banked) instead of the generic loop's running
 * maximum/sum. Kept out of the generic loop entirely (not just given a
 * separate follow-up pass, the old shape): the loop's own `Math.max` would
 * otherwise write a *worse* value first — a boss kill slower than the
 * standing best used to clobber `questProgress.fastest_boss_kill` with the
 * slower time before the old special case's `Math.min` ran second and agreed
 * with whatever the loop had just (wrongly) written, permanently forgetting
 * the real best.
 */
const MIN_TRACKED = new Set(['fastest_boss_kill', 'fastest_win_seconds']);

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
    // p7h: was missing here — without it, `next.unlockedCores.push` below
    // would mutate `meta.unlockedCores` (the same array, via the `...meta`
    // spread above) in place, breaking every caller that assumes `meta`
    // itself is left untouched.
    unlockedCores: meta.unlockedCores.slice(),
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
    if (MIN_TRACKED.has(key)) continue; // handled below by its own running-minimum pass
    if (!Number.isFinite(value)) continue;
    const prev = next.questProgress[key] ?? 0;
    next.questProgress[key] = CUMULATIVE.has(key) ? prev + value : Math.max(prev, value);
  }
  for (const key of MIN_TRACKED) {
    const value = metrics[key];
    if (value === undefined || value === Number.POSITIVE_INFINITY) continue;
    const prev = next.questProgress[key] ?? Number.POSITIVE_INFINITY;
    next.questProgress[key] = Math.min(prev, value);
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
    } else if (q.reward.kind === 'core' && !next.unlockedCores.includes(q.reward.value)) {
      next.unlockedCores.push(q.reward.value);
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
  const parsed = JSON.parse(json) as Partial<SaveFile> | null;
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('save is not an object');
  }
  // D5: a damaged *wrapper* (missing/renamed/scalar `meta`) throws here rather
  // than quietly returning `defaultMeta()` — that silent-return route was the
  // same total loss `loadMeta`'s `catch` produces, but reached by no `catch`,
  // so nothing could ever tell "this save was damaged" apart from "there was
  // no save at all". `loadMeta` still lands on a fresh account either way; the
  // distinction is that this function's contract now makes that reachable to
  // a caller that wants to know (the fuzzer's `rejected` bucket; a future
  // telemetry/notice hook).
  if (parsed.meta === null || typeof parsed.meta !== 'object' || Array.isArray(parsed.meta)) {
    throw new Error('save has no meta object');
  }
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
 * type at all past this migration (p7f: nor does `out` below copy them in by
 * name or by any other route — see that field's own comment).
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
  // p7f: built field-by-field from the known `MetaState` key set, never a
  // `{...base, ...meta}` spread — a spread copies every key `meta` happens to
  // carry, so a junk field (an old client's dead currency, a hand-edit, a
  // future field this client has never heard of) became a permanent fixed
  // point of every re-serialize. Building explicitly makes "unknown key" and
  // "known key, repaired" the only two outcomes.
  // Field order below matches `defaultMeta()`'s so a save this client wrote
  // reloads and re-serializes byte-identically (tests/q3-save-fuzz.test.ts's
  // "reloads byte-identically" — `JSON.stringify` key order is insertion
  // order, and there is no `{...base}` here any more to fix it implicitly).
  const out: MetaState = {
    // p7g (re-measured, code-reviewer finding): `[...x]` throws
    // `TypeError: x is not iterable` for any non-nullish, non-iterable `x`
    // (a number, boolean, or plain object) — unlike an object spread, which
    // degrades harmlessly. That throw propagated out of `migrate()` and hit
    // `loadMeta`'s outer catch, discarding the *entire* account rather than
    // just this field — the exact failure class p7g was filed against, on
    // `allocated`/`unlockedClasses`/`completedQuests` rather than the
    // now-fixed `stash`/`equipmentStash`. Same `Array.isArray` guard as
    // `unlockedCores` below.
    // D4: deduped (order preserved) — `pointsAvailable` counts every non-zero
    // entry, so a save holding the same node id three times would otherwise
    // spend three points on one node.
    allocated: Array.isArray(meta.allocated) ? [...new Set(meta.allocated)] : [...base.allocated],
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
    // p7g: same not-iterable throw as `allocated` above.
    unlockedClasses: Array.isArray(meta.unlockedClasses) ? [...meta.unlockedClasses] : [...base.unlockedClasses],
    // `Array.isArray`, not just `?? base`: a corrupt non-array value (e.g. a
    // string) would otherwise spread character-by-character into a
    // same-shaped-but-wrong array, the same class of gap p7g fixes for
    // `stash` — cheap to guard against here since the field is new.
    unlockedCores: Array.isArray(meta.unlockedCores) ? [...meta.unlockedCores] : base.unlockedCores,
    // No type guard, deliberately: this is the one field the fuzz-pinned
    // `KNOWN_LAUNDERED`/`KNOWN_HUB_NAN` lists (tests/q3-save-fuzz.test.ts)
    // still document as unrepaired. Kept byte-for-byte equivalent to the old
    // `{...base, ...meta}` spread's behaviour for this field specifically —
    // present in `meta` (any type) wins, absent falls back to the default.
    highestTier: meta.highestTier !== undefined ? meta.highestTier : base.highestTier,
    // p7g: guarded like `equipmentStash` — a corrupt non-object `questProgress`
    // (a string, an array) would otherwise object-spread character-by-
    // character/index-by-index into junk numeric keys.
    questProgress:
      meta.questProgress && typeof meta.questProgress === 'object' && !Array.isArray(meta.questProgress)
        ? { ...meta.questProgress }
        : {},
    // p7g: same not-iterable throw as `allocated` above.
    completedQuests: Array.isArray(meta.completedQuests) ? [...meta.completedQuests] : [],
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
  // p7f: no key-stripping pass needed here any more — `out` above is built
  // field-by-field from the known `MetaState` shape, so a retired or unknown
  // key in `meta` was simply never copied in the first place.
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
    const parsed = JSON.parse(raw) as Partial<SaveFile> | null;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('save is not an object');
    }
    // Same wrapper check as `deserializeMeta` (D5) — kept in step so "no save"
    // (silent, expected) and "a save whose wrapper is damaged" (thrown, caught
    // below into the same fresh-account result) stay the only two routes here.
    if (parsed.meta === null || typeof parsed.meta !== 'object' || Array.isArray(parsed.meta)) {
      throw new Error('save has no meta object');
    }
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
