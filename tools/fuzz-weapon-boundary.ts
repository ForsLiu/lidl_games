/**
 * Soul-weapon boundary fuzz (BACKLOG-QUALITY q21).
 *
 * PROGRESS.md's P5 audit line: "P2's VS inheritance formula is not built —
 * `data/weapons.json`'s 8-weapon roster with its own level ladders and 6
 * slots stands where SPEC-FINAL §6.1's average-across-the-type formula
 * belongs." That old-but-shipped system is what this file fuzzes — the V2/V3
 * soul binding in `src/sim/progression.ts` (`deriveSouls`/`bindSouls`/
 * `soulLevelFor`) and `src/sim/weapons.ts` (`grantWeapon`/`levelStats`), still
 * live and reachable through every real run today. `soulLevelFor`'s own
 * comment already names its retirement date (p2e, when §6.1 replaces it
 * wholesale) — this file's findings are about what's shipped now, not a
 * critique of a formula the spec has already decided to throw away.
 *
 * Four named boundary categories (the first three are BACKLOG-QUALITY q21's
 * acceptance line; the fourth is q27's follow-up, added once q21's own QA
 * pass found a sibling gap):
 *
 *   1. LEVEL   — a weapon's level clamped at the 1/6 track ends, and what a
 *      caller outside that domain (0, negative, ±Infinity, NaN, fractional)
 *      does to `grantWeapon`/`levelStats`/the live fire loop.
 *   2. INHERITANCE — `soulLevelFor`'s tier->level mapping at tier boundaries
 *      (0, negative, absurdly high, NaN — the last reachable if a structure's
 *      `tier` field is ever corrupted upstream), plus the "fewer distinct
 *      souls than weapon slots" auto-bind path in `beginSoulPick`/`bindSouls`
 *      and the `weaponSlots` floor/fractional edges that feed it.
 *   3. AWAKENING — the Lv6 + boon-rank-3 gate. `buildOfferPool` (private,
 *      progression.ts:143-153) enforces it when *generating* an offer;
 *      `applyOffer`'s `'awakening'` case (progression.ts:198-207) does not
 *      re-check either condition when *applying* one — verified below via
 *      `applyOffer` itself, the real exported entrypoint, not a re-derived
 *      copy of the private predicate.
 *   4. WEAPON OFFER — `applyOffer`'s `'weapon'` case (progression.ts:182-186)
 *      has the same "trusts the offer's origin" shape as AWAKENING, but only
 *      half-guards it: `ws.level = Math.min(maxLevel, offer.toLevel)` clamps
 *      the upper bound and never re-validates the result the way
 *      `grantWeapon`'s own create-branch clamp does, so a forged `toLevel`
 *      can still land an illegal value in `ws.level`.
 *
 * Every probe is a direct `World` construction (`new World(cfg(), content)`)
 * plus, where needed, `forcePlace` — the same "write a Structure directly,
 * bypass build legality" technique the retired `tests/sundering.test.ts` used
 * to test post-Sundering geometry. No `src/ui`/`src/render` import anywhere,
 * so every probe here is headless by construction, same guarantee q15's
 * fuzzer gets from the same discipline.
 *
 *   npx tsx tools/fuzz-weapon-boundary.ts
 */

import { type Content, loadContent } from '../src/sim/content';
import { applyOffer, bindSouls, deriveSouls } from '../src/sim/progression';
import { beginSoulPick } from '../src/sim/sundering';
import type { RunConfig, Structure } from '../src/sim/types';
import { grantWeapon, updateWeapons } from '../src/sim/weapons';
import { World } from '../src/sim/world';

export type Verdict = 'ok' | 'crashes' | 'ungated';

export interface BoundaryCase {
  category: 'level' | 'inheritance' | 'awakening' | 'weaponOffer';
  id: string;
  verdict: Verdict;
  detail: string;
}

export function cfg(): RunConfig {
  return { seed: 1, classKey: 'engineer', tier: 1, modifiers: [], allocated: [], relics: [], policy: 'none', cycles: 1 };
}

export function newWorld(content: Content = loadContent()): World {
  return new World(cfg(), content);
}

/**
 * Writes a Structure directly, bypassing `buildTower`'s placement legality —
 * the retired `tests/sundering.test.ts`'s own technique for testing
 * post-Sundering state without a build phase in the way. Lets a probe pin a
 * tower's `tier` to a value `upgradeTower` would never produce.
 */
export function forcePlace(w: World, towerKey: string, tx: number, ty: number, tier: number): void {
  const def = w.content.towerByKey.get(towerKey)!;
  const s: Structure = {
    id: w.newId(),
    towerId: def.id,
    tier,
    tx,
    ty,
    // Real placement scales hp/maxHp via `structureMaxHp(w, def, tier)`; the
    // flat `def.hp` here is a deliberate simplification, harmless for every
    // probe in this file (none of the three boundary categories read hp),
    // but worth re-deriving through `structureMaxHp` before reusing
    // `forcePlace` for anything that does.
    hp: def.hp,
    maxHp: def.hp,
    spent: def.cost,
    cooldown: 0,
    dead: false,
    petrified: false,
    soulSuppressed: false,
    gemTimer: 0,
    gemsWaiting: 0,
    links: [],
    damageDealt: 0,
  };
  w.addStructure(s);
}

function tryRun(fn: () => void): { threw: boolean; message?: string } {
  try {
    fn();
    return { threw: false };
  } catch (e) {
    return { threw: true, message: e instanceof Error ? e.message : String(e) };
  }
}

/* ============================================================ 1. LEVEL ============================================================ */

const LEVEL_INPUTS: readonly number[] = [0, 1, 6, 7, -1, Infinity, -Infinity, NaN, 2.5];

function levelCaseId(level: number): string {
  if (Number.isNaN(level)) return 'nan';
  if (level === Infinity) return 'posInf';
  if (level === -Infinity) return 'negInf';
  if (!Number.isInteger(level)) return 'fractional';
  if (level < 0) return 'negative';
  return String(level);
}

export function levelBoundaryCases(content: Content = loadContent()): BoundaryCase[] {
  return LEVEL_INPUTS.map((level) => {
    const w = newWorld(content);
    const ws = grantWeapon(w, 'flame_cone', level, 0);
    const grantedLevel = ws.level;
    const r = tryRun(() => updateWeapons(w, 1 / 60));
    const verdict: Verdict = r.threw ? 'crashes' : 'ok';
    const detail = r.threw
      ? `grantWeapon(level=${level}) -> ws.level=${grantedLevel}, updateWeapons() threw: ${r.message}`
      : `grantWeapon(level=${level}) -> ws.level=${grantedLevel}, fires cleanly`;
    return { category: 'level', id: levelCaseId(level), verdict, detail };
  });
}

/* ======================================================= 2. INHERITANCE ======================================================= */

const TIER_INPUTS: readonly { id: string; tier: number }[] = [
  { id: 'tier:1', tier: 1 },
  { id: 'tier:zero', tier: 0 },
  { id: 'tier:negative', tier: -5 },
  { id: 'tier:huge', tier: 1e9 },
  { id: 'tier:nan', tier: NaN },
];

function tierBoundaryCase(content: Content, id: string, tier: number): BoundaryCase {
  const w = newWorld(content);
  forcePlace(w, 'ember_brazier', 5, 5, tier);
  const souls = deriveSouls(w);
  const derivedLevel = souls[0]?.level;
  bindSouls(w, souls.map((s) => s.key));
  const r = tryRun(() => updateWeapons(w, 1 / 60));
  const verdict: Verdict = r.threw ? 'crashes' : 'ok';
  const detail = r.threw
    ? `Structure.tier=${tier} -> deriveSouls level=${derivedLevel} -> updateWeapons() threw: ${r.message}`
    : `Structure.tier=${tier} -> deriveSouls level=${derivedLevel}, binds and fires cleanly`;
  return { category: 'inheritance', id, verdict, detail };
}

/** The 7 towers with a `soul`, in `data/towers.json` order. */
const SOUL_TOWER_KEYS: readonly string[] = [
  'arrow_spire',
  'ballista',
  'ember_brazier',
  'frost_obelisk',
  'tesla_coil',
  'mortar',
  'venom_spore',
];

function soulCountCase(content: Content, id: string, count: number): BoundaryCase {
  const w = newWorld(content);
  for (let i = 0; i < count; i++) forcePlace(w, SOUL_TOWER_KEYS[i], 5 + i, 5, 3);
  const slots = w.derived.weaponSlots;
  const r = tryRun(() => beginSoulPick(w));
  const verdict: Verdict = r.threw ? 'crashes' : 'ok';
  const detail = r.threw
    ? `${count} distinct souls, ${slots} slots -> beginSoulPick() threw: ${r.message}`
    : `${count} distinct souls, ${slots} slots -> phase=${w.phase}, weapons=[${w.weapons.map((x) => x.key).join(', ')}]`;
  return { category: 'inheritance', id, verdict, detail };
}

function slotsFlooredCase(content: Content): BoundaryCase {
  const w = newWorld(content);
  w.stats.add('probe', 'weaponSlots', -1000);
  w.recomputeDerived();
  const r = tryRun(() => beginSoulPick(w));
  const verdict: Verdict = r.threw ? 'crashes' : 'ok';
  const detail = r.threw
    ? `weaponSlots stat -1000 -> derived=${w.derived.weaponSlots}, beginSoulPick() threw: ${r.message}`
    : `weaponSlots stat -1000 -> derived=${w.derived.weaponSlots} (floored), phase=${w.phase}`;
  return { category: 'inheritance', id: 'slots:flooredAtOne', verdict, detail };
}

function slotsFractionalCase(content: Content): BoundaryCase {
  const w = newWorld(content);
  w.stats.add('probe', 'weaponSlots', -2.5);
  w.recomputeDerived();
  for (let i = 0; i < 4; i++) forcePlace(w, SOUL_TOWER_KEYS[i], 5 + i, 5, 3);
  const souls = deriveSouls(w);
  const r = tryRun(() => bindSouls(w, souls.map((s) => s.key)));
  const verdict: Verdict = r.threw ? 'crashes' : 'ok';
  const detail = r.threw
    ? `weaponSlots stat -2.5 -> derived=${w.derived.weaponSlots}, bindSouls() threw: ${r.message}`
    : `weaponSlots stat -2.5 -> derived=${w.derived.weaponSlots}, ${souls.length} candidate souls -> bound [${w.weapons.map((x) => x.key).join(', ')}]`;
  return { category: 'inheritance', id: 'slots:fractionalTruncates', verdict, detail };
}

export function inheritanceCases(content: Content = loadContent()): BoundaryCase[] {
  return [
    ...TIER_INPUTS.map(({ id, tier }) => tierBoundaryCase(content, id, tier)),
    soulCountCase(content, 'souls:zero', 0),
    soulCountCase(content, 'souls:one', 1),
    soulCountCase(content, 'souls:fewerThanSlots', 2),
    soulCountCase(content, 'souls:equalsSlots', 6),
    soulCountCase(content, 'souls:oneMoreThanSlots', 7),
    slotsFlooredCase(content),
    slotsFractionalCase(content),
  ];
}

/* ========================================================= 3. AWAKENING ========================================================= */

export const AWAKENING_KEY = 'storm_avatar'; // weapon: chain_lightning, boon: haste, boonRank: 3
export const AWAKENING_WEAPON = 'chain_lightning';
export const AWAKENING_BOON = 'haste';

const AWAKENING_GATE_INPUTS: readonly { id: string; level: number; rank: number; gateMet: boolean }[] = [
  { id: 'gate:levelMet_rankMet', level: 6, rank: 3, gateMet: true },
  { id: 'gate:levelMet_rankUnmet', level: 6, rank: 0, gateMet: false },
  { id: 'gate:levelUnmet_rankMet', level: 1, rank: 3, gateMet: false },
  { id: 'gate:levelUnmet_rankUnmet', level: 1, rank: 0, gateMet: false },
];

export function awakeningGateCases(content: Content = loadContent()): BoundaryCase[] {
  return AWAKENING_GATE_INPUTS.map(({ id, level, rank, gateMet }) => {
    const w = newWorld(content);
    const ws = grantWeapon(w, AWAKENING_WEAPON, level, 0);
    w.boonRanks[AWAKENING_BOON] = rank;
    applyOffer(w, { kind: 'awakening', key: AWAKENING_KEY, name: 'x', desc: 'x', toLevel: 1 });
    const applied = ws.awakened;
    // Applying when the gate is met is correct; applying when it is not is
    // the finding — `applyOffer` trusts the offer's origin instead of
    // re-checking the condition `buildOfferPool` used to generate it.
    const verdict: Verdict = applied && !gateMet ? 'ungated' : 'ok';
    const detail = `weapon level=${level} (needs 6), boon rank=${rank} (needs 3) -> applyOffer() ${applied ? 'applied' : 'no-op'}`;
    return { category: 'awakening', id, verdict, detail };
  });
}

/* ======================================================== 4. WEAPON OFFER ======================================================== */

const WEAPON_OFFER_INPUTS: readonly { id: string; toLevel: number }[] = [
  { id: 'weapon:toLevelNan', toLevel: NaN },
  { id: 'weapon:toLevelNegative', toLevel: -5 },
];

/** Same weapon `levelBoundaryCases` above already uses, kept starting at a legal mid-track level. */
export const WEAPON_OFFER_TARGET = 'flame_cone';

export function weaponOfferBoundaryCases(content: Content = loadContent()): BoundaryCase[] {
  return WEAPON_OFFER_INPUTS.map(({ id, toLevel }) => {
    const w = newWorld(content);
    const ws = grantWeapon(w, WEAPON_OFFER_TARGET, 3, 0);
    applyOffer(w, { kind: 'weapon', key: WEAPON_OFFER_TARGET, name: 'x', desc: 'x', toLevel });
    const appliedLevel = ws.level;
    const r = tryRun(() => updateWeapons(w, 1 / 60));
    const verdict: Verdict = r.threw ? 'crashes' : 'ok';
    const detail = r.threw
      ? `applyOffer(toLevel=${toLevel}) -> ws.level=${appliedLevel}, updateWeapons() threw: ${r.message}`
      : `applyOffer(toLevel=${toLevel}) -> ws.level=${appliedLevel}, fires cleanly`;
    return { category: 'weaponOffer', id, verdict, detail };
  });
}

/* =============================================================== census =============================================================== */

export function runCensus(content: Content = loadContent()): BoundaryCase[] {
  return [
    ...levelBoundaryCases(content),
    ...inheritanceCases(content),
    ...awakeningGateCases(content),
    ...weaponOfferBoundaryCases(content),
  ];
}

/* eslint-disable no-console */
function main(): void {
  const rows = runCensus();
  for (const r of rows) {
    console.log(`[${r.verdict.padEnd(7)}] ${r.category}:${r.id} — ${r.detail}`);
  }
  const holes = rows.filter((r) => r.verdict !== 'ok');
  console.log(`\n${holes.length}/${rows.length} boundary cases are not cleanly 'ok'.`);
}

const invokedDirectly = process.argv[1]?.replace(/\\/g, '/').endsWith('tools/fuzz-weapon-boundary.ts');
if (invokedDirectly) main();
