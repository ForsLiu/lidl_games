/**
 * Content-totals census against SPEC-FINAL §13 (BACKLOG-QUALITY q16).
 *
 * `tests/content-complete.test.ts` (M4-era) only pins V2's totals — 10
 * towers, 20 enemies, 12 modifiers, 8 weapons — none of which is §13's list.
 * This tool counts §13's own ten categories straight out of `loadContent()`
 * and a couple of source constants, and reports each against its §13 target,
 * so a content change (a class added, a wave authored) is visible immediately
 * and distinguishable from "this P-phase just hasn't been reached yet" —
 * PROGRESS.md's audit table already says which P-phase owns each gap; this
 * tool turns that prose into a number that can regress.
 *
 *   npx tsx tools/content-census.ts
 *   npx tsx tools/content-census.ts --json
 *
 * `loadContent` is imported dynamically inside `main()` rather than
 * statically at the top of this file (BACKLOG-QUALITY q38): a static
 * `import { loadContent } from '../src/sim/content'` pulls in every
 * `/data/*.json` file via a static ES-module import, which `tsx`'s esbuild
 * transform parses at module-load time — before any of this file's own
 * code, including `main()`'s try/catch, ever runs. A `/data` file with a
 * JSON *syntax* error (not a schema violation) would then crash with a raw,
 * uncaught `Transform failed with 1 error` stack trace no try/catch here
 * could intercept (q33's finding). The dynamic `await import(...)` below
 * defers that load until it is inside `main()`'s own try, so the same
 * failure surfaces as this file's clean one-line message instead. `census`
 * therefore takes `content` as a required argument rather than defaulting
 * it to a `loadContent()` call at the top level.
 */

import type { Content } from '../src/sim/content';
import { MAX_TIER } from '../src/sim/tiers';

export interface CensusRow {
  key: string;
  label: string;
  actual: string;
  target: string;
  met: boolean;
  note?: string;
}

export function census(content: Content): CensusRow[] {
  const rows: CensusRow[] = [];

  // §4's 11 classes, plus fb013's owner-directed 12th (Time Lord, filed
  // after §13 was written).
  const classCount = content.classes.classes.length;
  rows.push({
    key: 'classes',
    label: 'Classes',
    actual: String(classCount),
    target: '12',
    met: classCount === 12,
    note: classCount === 12 ? undefined : 'P6 incomplete — see PROGRESS.md P6 audit line',
  });

  const towerCount = content.towers.towers.length;
  rows.push({ key: 'towers', label: 'Towers', actual: String(towerCount), target: '10', met: towerCount === 10 });

  // fb015: §7's fixed 12-item equipment table now lives in
  // data/equipment.json, loaded the same way every other category on this
  // page is counted (qa-playtester finding: this row was still hardcoded to
  // 0/unbuilt after fb015 shipped, which would have kept telling a future
  // session equipment is missing and risked spawning a duplicate item).
  const equipmentCount = content.equipment.items.length;
  rows.push({
    key: 'equipment',
    label: 'Equipment',
    actual: String(equipmentCount),
    target: '12+',
    met: equipmentCount >= 12,
  });

  const damageTypeCount = content.damageTypes.types.length;
  const statusCount = Object.keys(content.damageTypes.statuses).length;
  rows.push({
    key: 'damageTypesAndStatuses',
    label: 'Damage types + statuses',
    actual: `${damageTypeCount}+${statusCount}`,
    target: '6+2',
    met: damageTypeCount === 6 && statusCount === 2,
  });

  const enemyCount = content.enemies.enemies.length;
  rows.push({ key: 'enemies', label: 'Enemies', actual: String(enemyCount), target: '20', met: enemyCount === 20 });

  // p8a: P3's interleave is built (18 TD waves in blocks of `tdWavesPerVsWave`,
  // 6 VS waves — SPEC-FINAL §1.1) and `data/waves.json` now authors all 18 TD
  // rows for real. The "6" VS-wave count is a run-shape constant (world.ts's
  // own `cfg.cycles ?? 6` default), not data `loadContent()` carries anywhere
  // — every VS wave is director-driven (`act2.ts`), not a discrete table row.
  const tdWaveCount = content.waves.waves.length;
  const DEFAULT_VS_WAVES = 6;
  rows.push({
    key: 'waves',
    label: 'Waves',
    actual: `${tdWaveCount}+${DEFAULT_VS_WAVES} (${tdWaveCount + DEFAULT_VS_WAVES})`,
    target: '18+6 (24)',
    met: tdWaveCount === 18,
  });

  // gen-tree.mjs's own header and tests/grid.test.ts:92 both already exclude
  // the single `kind: 'start'` node before comparing to 120 — §13's
  // "120-node tree" counts the allocatable nodes, not `nodes.length` itself
  // (121, one start node + 120 allocatable).
  const nonStartNodes = content.tree.nodes.filter((n) => n.kind !== 'start').length;
  rows.push({
    key: 'treeNodes',
    label: 'Tree nodes (excl. start)',
    actual: String(nonStartNodes),
    target: '120',
    met: nonStartNodes === 120,
  });

  // p7h/Q148: §8.4's "8-12" is scoped to class-unlock quests (its own three
  // worked examples are all class rewards) — the 4 §5.5 Core-unlock quests
  // are a separate, exactly-enumerated bucket (one per non-default Core),
  // not double-counted against this range. See tests/p7e-quests.test.ts.
  const questCount = content.quests.quests.filter((q) => q.reward.kind !== 'core').length;
  rows.push({
    key: 'quests',
    label: 'Quests',
    actual: String(questCount),
    target: '8-12',
    met: questCount >= 8 && questCount <= 12,
  });

  // Map tiers are a formula (`src/sim/tiers.ts`), not authored content rows —
  // `MAX_TIER` is the count that actually gates `modifierDraft`/`autoDraft`/
  // `hardestDraft`, so it is the real "how many tiers exist" answer.
  rows.push({
    key: 'tiers',
    label: 'Map tiers',
    actual: `T1-T${MAX_TIER}`,
    target: 'T1-T5',
    met: MAX_TIER === 5,
  });

  // A "boss" is an enemy whose traits include 'boss' — the same predicate
  // `src/sim/loot.ts` uses to decide a guaranteed relic drop, not a
  // hand-picked key list that could drift from the data it describes.
  const bossCount = content.enemies.enemies.filter((e) => e.traits.includes('boss')).length;
  rows.push({ key: 'bosses', label: 'Bosses', actual: String(bossCount), target: '2', met: bossCount === 2 });

  return rows;
}

/* ------------------------------------------------------------------- CLI */

async function main(argv: string[]): Promise<void> {
  const json = argv.includes('--json');

  let rows: CensusRow[];
  try {
    const { loadContent } = await import('../src/sim/content');
    rows = census(loadContent());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (json) {
      console.log(JSON.stringify({ error: message }));
    } else {
      // ZodError.message is itself multi-line JSON; collapse to one line so
      // a /data load failure reads as a clean CLI message, not a second
      // stack-trace-shaped wall of text.
      console.error(`content-census: ${message.replace(/\s+/g, ' ').trim()}`);
    }
    process.exitCode = 1;
    return;
  }

  if (json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  const metCount = rows.filter((r) => r.met).length;
  console.log(`content census — SPEC-FINAL §13 — ${metCount}/${rows.length} categories at target`);
  const labelW = Math.max(...rows.map((r) => r.label.length), 'category'.length) + 2;
  const actualW = Math.max(...rows.map((r) => r.actual.length), 'actual'.length) + 2;
  const targetW = Math.max(...rows.map((r) => r.target.length), 'target'.length) + 2;
  console.log('category'.padEnd(labelW) + 'actual'.padEnd(actualW) + 'target'.padEnd(targetW) + 'met');
  for (const r of rows) {
    console.log(r.label.padEnd(labelW) + r.actual.padEnd(actualW) + r.target.padEnd(targetW) + (r.met ? 'yes' : 'no'));
  }

  const short = rows.filter((r) => !r.met && r.note);
  if (short.length > 0) {
    console.log('\nnotes:');
    for (const r of short) console.log(`  ${r.label}: ${r.note}`);
  }
}

const invokedDirectly = process.argv[1]?.replace(/\\/g, '/').endsWith('tools/content-census.ts');
if (invokedDirectly) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
