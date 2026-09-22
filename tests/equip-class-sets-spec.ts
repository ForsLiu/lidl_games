/**
 * fb056 — SPEC-FINAL §7.1's class equipment sets, parsed. Shared by the §7.1
 * ledger (`tests/equip-class-sets-spec.test.ts`) and c012's §7 ledger
 * (`tests/equip-spec-numbers.test.ts`), which needs the §7.1 roster to prove
 * that every `data/equipment.json` item is audited by exactly one of the two.
 *
 * Why §7.1 is a table of its own rather than 15 more rows of §7's: c012's
 * ledger is built around §7's 12-row owner table (its per-cell coverage, its
 * clause-residue check and its desc audit are all written against those rows'
 * Effect prose, which is `none` or a single stat line), while every §7.1 row's
 * Effect cell is a class mechanic with its own magnitudes in `effectNums` —
 * a different authored home that c012's `Figure` type has no status for. The
 * owner's order says "append rows" to §7; §7.1 is inside §7 (c012's §7 hash
 * covers it), with its own parse and its own ledger.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export interface ClassSetRow {
  /** §7.1's own item label, e.g. `plague flask`. */
  name: string;
  slot: string;
  hp: number;
  atk: number;
  def: number;
  atkspd: number;
  move: number;
  effect: string;
}

const SPEC = readFileSync(fileURLToPath(new URL('../SPEC-FINAL.md', import.meta.url)), 'utf8').replace(/\r\n/g, '\n');

/** SPEC-FINAL §7.1's text, from its own heading to §8's. */
export const SPEC_71_TEXT: string = (() => {
  const start = SPEC.indexOf('### 7.1 Class equipment sets');
  const end = SPEC.indexOf('## 8. Rewards');
  if (start < 0 || end < 0 || end < start) throw new Error('SPEC-FINAL.md: cannot locate §7.1 between its heading and §8');
  return SPEC.slice(start, end);
})();

/** §7.1's table, parsed. A malformed row is a failure, never a skip (c012's lesson). */
export const SPEC_71_TABLE: readonly ClassSetRow[] = (() => {
  const out: ClassSetRow[] = [];
  for (const line of SPEC_71_TEXT.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length !== 8) throw new Error(`§7.1: table row has ${cells.length} cells, expected 8 - "${line.trim()}"`);
    const at = (i: number): string => {
      const v = cells[i];
      if (v === undefined) throw new Error(`§7.1: row missing cell ${i}`);
      return v;
    };
    const name = at(0);
    if (name === 'Item' || name.startsWith('---')) continue;
    const num = (raw: string): number => {
      const m = /^(?:×)?(-?[\d.]+)$/.exec(raw);
      const g = m?.[1];
      if (g === undefined) throw new Error(`§7.1: cannot read numeric cell "${raw}" in row "${name}"`);
      return Number(g);
    };
    out.push({
      name,
      slot: at(1),
      hp: num(at(2)),
      atk: num(at(3)),
      def: num(at(4)),
      atkspd: num(at(5)),
      move: num(at(6)),
      effect: at(7),
    });
  }
  return out;
})();

/**
 * `data/equipment.json` key -> §7.1 label. Declared, not derived, so a renamed
 * spec row is a failure rather than a row that quietly stops being audited.
 */
export const CLASS_SET_NAME: Readonly<Record<string, string>> = {
  plague_flask: 'plague flask',
  miasma_robe: 'miasma robe',
  carriers_boots: "carrier's boots",
  ring_of_contagion: 'ring of contagion',
  pestilent_locket: 'pestilent locket',
  blightweaver_band: 'blightweaver band',
  hourglass_scepter: 'hourglass scepter',
  chronomail: 'chronomail',
  sandals_of_the_second_hand: 'sandals of the second hand',
  loop_ring: 'loop ring',
  pendulum_pendant: 'pendulum pendant',
  bracer_of_overlap: 'bracer of overlap',
  ring_of_a_thousand_cuts: 'ring of a thousand cuts',
  duelists_pendant: "duelist's pendant",
  bracer_of_the_whirlwind: 'bracer of the whirlwind',
};

export function classSetRowFor(key: string): ClassSetRow {
  const name = CLASS_SET_NAME[key];
  const row = SPEC_71_TABLE.find((r) => r.name === name);
  if (!row) throw new Error(`§7.1 has no row for ${key} (${String(name)})`);
  return row;
}
