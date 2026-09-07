/**
 * c012 (BACKLOG-CONTENT, lane `content`) — **SPEC-FINAL §7's stated numbers,
 * as an auditable ledger.** `c008`'s shape, for the other content file this
 * lane owns.
 *
 * The hole this closes is named in c012 and is exact.
 * `tests/fb015-equipment.test.ts:84` asserts "each item, equipped alone,
 * contributes every mods key at its owner-table value" — but that owner table
 * is `EXPECTED_ITEM_MODS`, **hardcoded in the test**. Nothing ties it to §7.
 * `data/equipment.json` and that constant can therefore drift away from the
 * spec *together*, in one commit, and stay green: exactly the failure mode
 * c008 found on `data/classes.json`. `fb056` is about to append 15 more rows
 * to the same file, which is why the barrier goes up now.
 *
 * **This item changes no number.** Not one byte of `/data` or `/src` moved for
 * it, and none needed to: every numeric figure §7 states is authored
 * correctly today. The deliverable is the barrier, not a fix.
 *
 * **Why this ledger reads the spec instead of quoting it.** §7 is a markdown
 * table, so c008's anti-laundering device — "the figure must appear verbatim
 * in the spec" — is nearly worthless for the five numeric columns: the
 * verbatim text of greatsword's HP cell is `0`, which occurs everywhere. So
 * the table is **parsed**, and every numeric row's `spec` must equal the cell
 * the parser read out of SPEC-FINAL.md. A drift cannot be laundered by
 * editing this file's `spec` column — the parse would disagree — and cannot
 * be laundered by editing SPEC-FINAL.md either, because §7's text is hashed.
 * To move a number you must move it in `/data`, in §7, in the hash, and in a
 * status row that names who authorised it.
 *
 * The Effect column is prose, so those rows keep c008's device *and* add one:
 * the row quotes its item's own Effect cell verbatim, and where the quote
 * carries a numeral (`+20%`, `×1.5`, `+1 flat attack`) the ledger **extracts
 * the number from the quote** and requires it to equal `spec`. A row that
 * cannot be quantified that way (a boolean flag; the word "double") must say
 * so in `unquantified` rather than be silently exempt.
 *
 * What that does **not** buy, stated plainly because an earlier draft of this
 * header overclaimed it: a coordinated edit to `/data`, to §7 and to the hash
 * moves a figure with the row still reading `match` and the census unchanged.
 * No test can tell an owner retune from a laundered drift — the guarantee is
 * that the retune is *visible*, as a spec diff and a hash line in the same
 * commit, instead of a one-token change to a hardcoded table.
 *
 * **Absence is an assertion here, not a gap.** §7 states `0` and `×1` cells,
 * and `data/equipment.json` authors those by *omitting* the key — 0 is the
 * identity for a flat stat and for `stats.ts`'s `1 + v` multipliers alike. So
 * a missing key reads 0, and a third of the rows assert an omission. The
 * mutation check below is what makes those rows real: it *creates* the key it
 * bumps, so authoring a spurious `maxHp` on the greatsword reddens the
 * greatsword's HP row rather than passing unnoticed.
 *
 * **What stops the ledger from lying to itself.** Every device below caught
 * something real while this file was written, or is inherited from a c008 row
 * that did:
 *
 *   - Coverage is per **cell** of §7's table — 12 items x 6 columns — against
 *     a declared `NO_FIGURE` list of cells the spec states no number for, so
 *     "did we miss a figure?" is a test rather than a reading exercise.
 *   - The non-numeric *clauses* inside a covered Effect cell (Sleeve Sword's
 *     no-charge rule, Swordsman Armor's two) are declared in `RULES`, each
 *     quoting §7 verbatim and naming the test file that covers it
 *     behaviourally — so a covered cell cannot hide an uncovered mechanic.
 *   - Mutating one authored figure must move **exactly one** row's reading, so
 *     a typo'd stat key (which reads 0 and would otherwise assert nothing) and
 *     two rows sharing a field are both red. Its converse is checked too: no
 *     authored `mods` column may go unread by any row.
 *   - A bridge assertion holds `loadContent()`'s view and the raw document to
 *     the same value at every row, so the ledger audits what the sim runs on.
 *   - §7's Slot column is checked against the authored slot, and §7's slot
 *     *list* against `content.equipment.slots` — the one place the table and
 *     its own header use different words (`shoe` / `shoes`) is a declared
 *     alias, not a silent mismatch.
 *
 * **Deliberately out of the ledger.** The *reach* of a correctly-authored
 * number, which is `c013`'s open item: Normal Bracelet's `+10%` is the right
 * figure on the wrong key (`area` is global, so it widens more than §7's
 * "character and tower"). This file pins the 0.1 and points at c013; it does
 * not restate c013's finding as a second, competing measurement. Likewise the
 * loot channel, stacking order and mid-run swap behaviour — those are
 * `fb015`/`fb023`/`b076`'s, and are behaviour, not §7 figures.
 *
 * refs: SPEC-FINAL §7, c008 (the shape), c013 (the bracelet's area reach),
 * fb056 (the 15 rows this barrier goes up ahead of).
 */

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { loadContent } from '../src/sim/content';
import {
  blockBody,
  decoyKeys,
  pointerProblems,
  defaultReads,
  positiveLines,
  readsStat,
  sourceOf as source,
  type Behaviour,
} from './equip-spec-ledger';
import { STAT_KEYS, STAT_SCALED, type StatKey } from '../src/sim/statkeys';
import { World } from '../src/sim/world';
import { cfg } from './helpers';

const content = loadContent();

/**
 * sha256 of SPEC-FINAL.md from `## 7. Equipment` up to `## 8. Rewards`,
 * newline-normalised. Regenerate deliberately, never reflexively: a change
 * here means §7 moved and every row below has to be re-read against it.
 */
const SPEC_7_SHA256 = 'f24298f831eea38b8bf7ed1f91dc80d7709606a960e39ded8204aab30cf9cdc8';

const CLASSES_TS = 'src/sim/classes.ts';

/* ----------------------------------------------------------- §7 the table */

/** §7's own column order, minus Item and Slot, which are identity not figure. */
type Col = 'hp' | 'atk' | 'def' | 'atkspd' | 'move' | 'effect';

const COLS: readonly Col[] = ['hp', 'atk', 'def', 'atkspd', 'move', 'effect'];

/** The five columns whose value the parser reads as a number out of §7's table. */
const NUMERIC_COLS: readonly Exclude<Col, 'effect'>[] = ['hp', 'atk', 'def', 'atkspd', 'move'];

interface SpecRow {
  /** §7's own item label, e.g. `sleeve sword`. */
  name: string;
  /** §7's Slot cell, e.g. `shoe`. */
  slot: string;
  /** The five numeric cells, already converted out of `×n` form. */
  cells: Readonly<Record<Exclude<Col, 'effect'>, number>>;
  /** The Effect cell, verbatim. */
  effect: string;
}

/** SPEC-FINAL §7's text, from its own heading to §8's. */
const SPEC_7_TEXT = (() => {
  const spec = readFileSync(fileURLToPath(new URL('../SPEC-FINAL.md', import.meta.url)), 'utf8');
  const start = spec.indexOf('## 7. Equipment');
  const end = spec.indexOf('## 8. Rewards');
  // Explicitly, rather than letting `indexOf`'s -1 slice to an empty string: a
  // renamed heading would otherwise surface as 73 rows all throwing "§7 has no
  // row named ...", which reads like a data catastrophe instead of a moved
  // heading, and would bury the hash test that actually explains it.
  if (start < 0 || end < 0) throw new Error('SPEC-FINAL.md: cannot locate §7 between its own heading and §8’s');
  return spec.slice(start, end).replace(/\r\n/g, '\n');
})();

/**
 * §7's preamble slot list — `Slots: **weapon, armor, shoes, ...**` — parsed
 * rather than retyped. Retyping it here would reproduce, one file over,
 * exactly the hardcoded-expectation shape c012 exists to remove.
 */
const SPEC_SLOTS: readonly string[] = (() => {
  const m = /Slots: \*\*(.+?)\*\*/.exec(SPEC_7_TEXT);
  if (!m) throw new Error('SPEC-FINAL §7: no `Slots: **...**` preamble line');
  return m[1].split(',').map((s) => s.trim());
})();

/**
 * §7's owner table, parsed. A `×n` cell becomes `n`; a bare cell becomes its
 * number. This is the ledger's authority for every numeric figure — the `spec`
 * column below is checked *against* it rather than trusted.
 */
const SPEC_TABLE: readonly SpecRow[] = (() => {
  const out: SpecRow[] = [];
  for (const line of SPEC_7_TEXT.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    // A row that does not parse is a **failure**, never a skip. This used to
    // `continue`, so a hand-edited table row one pipe short vanished from the
    // ledger without a word: QA appended a well-formed 13th row and got two
    // red, appended the same row with 7 cells and got 114/114 green. `fb056`
    // adds 15 rows to this table by hand, which is exactly when a formatting
    // slip is most likely and least affordable.
    if (cells.length !== 8) {
      throw new Error(
        `§7: table row has ${cells.length} cells, expected 8 - "${line.trim()}"`,
      );
    }
    if (cells[0] === 'Item' || cells[0].startsWith('---')) continue;
    const num = (raw: string): number => {
      // `×1.2` -> 1.2 (U+00D7), a bare `10` -> 10. Anything else is a parse
      // failure, not a zero: a silently-zeroed cell would make its row assert
      // the opposite of what the spec says.
      const m = /^(?:×)?(-?[\d.]+)$/.exec(raw);
      if (!m) throw new Error(`§7: cannot read numeric cell "${raw}" in row "${cells[0]}"`);
      return Number(m[1]);
    };
    out.push({
      name: cells[0],
      slot: cells[1],
      cells: { hp: num(cells[2]), atk: num(cells[3]), def: num(cells[4]), atkspd: num(cells[5]), move: num(cells[6]) },
      effect: cells[7],
    });
  }
  return out;
})();

/**
 * §7's item label -> `data/equipment.json` key. Declared rather than derived by
 * de-spacing, so a renamed spec row is a failure here instead of a row that
 * quietly stops being audited.
 */
const SPEC_NAME: Readonly<Record<string, string>> = {
  greatsword: 'greatsword',
  sleeve_sword: 'sleeve sword',
  normal_armor: 'normal armor',
  swordsman_armor: 'swordsman armor',
  normal_shoes: 'normal shoes',
  swordsman_shoes: 'swordsman shoes',
  normal_ring: 'normal ring',
  bleeding_ring: 'bleeding ring',
  normal_necklace: 'normal necklace',
  builders_necklace: "builder's necklace",
  normal_bracelet: 'normal bracelet',
  sniper_bracelet: 'sniper bracelet',
};

/**
 * The one place §7's table and §7's own header disagree: the header lists the
 * slot as `shoes`, the table's Slot column says `shoe`. Declared as an alias so
 * the slot check can stay exact everywhere else.
 */
const SLOT_ALIAS: Readonly<Record<string, string>> = { shoe: 'shoes' };

/* ------------------------------------------------------------- the ledger */

/**
 * Which stat bag a row reads. `mods` is the item's own; `fallback` is
 * `classFallback.mods` — §7's "if not <class>: ..." lines, which c012 names
 * explicitly as rows of their own.
 */
type Bag = 'mods' | 'fallback';

interface StatusMatch {
  kind: 'match';
}
interface StatusRetuned {
  /**
   * The authored value differs from §7 and the row names what authorised it.
   * **Empty today** — every figure matches — and kept anyway as the declared
   * home for the first `fb056`-era tune, so it lands as a status rather than
   * as a silent edit to a hardcoded expectation table.
   */
  kind: 'retuned';
  authorised: string;
  actual: number;
  why: string;
}
interface StatusInCode {
  /** Correct, but a literal in `/src` rather than in `/data` — rule-4 debt. */
  kind: 'in_code';
  site: string;
  file: string;
  anchors: readonly RegExp[];
  /**
   * Reads the figure itself back out of `file`. Required, not optional: an
   * `in_code` row whose `spec` is asserted against nothing is a row that
   * documents a number rather than pinning one.
   */
  capture: RegExp;
  why: string;
  /** Key names on the item's raw row that would mean the figure had been authored after all. */
  absentKey: RegExp;
  /** Those that already match `absentKey` on shipped data and are not this figure. */
  knownKeys?: readonly string[];
}

type Status = StatusMatch | StatusRetuned | StatusInCode;

/**
 * c022: an Effect row's **behavioural pointer** — the `describe`/`it` that
 * proves *this row's own stat* moves something in a real `World`.
 *
 * Why a numeric row does not need one and an Effect row does: `NUMERIC_STAT`
 * pins the five numeric columns to one stat key each, so a numeric row cannot
 * quietly change which stat it audits. The 13 Effect rows choose their key
 * freely, and QA measured what that costs — moving `normal_necklace`'s
 * `"towerCost": -0.2` to `"goldFind": -0.2` **and this row's `stat` with it**
 * left the whole ledger green, with §7's "tower upgrade cost −20%" authored on
 * gold find. The figure was still right, the reach was still checked, and the
 * *meaning* had moved.
 *
 * The type and the machinery behind it are `tests/equip-spec-ledger.ts`'s since
 * `c028` — that header carries the eight mutations that shaped them.
 */
interface Figure {
  /** `data/equipment.json` item key. */
  item: string;
  /** The §7 column this figure is stated in. */
  col: Col;
  /** A label for the row; unique together with `item` and `col`. */
  figure: string;
  /**
   * The number §7 states. For a numeric column this is checked against the
   * parsed table cell, so it cannot be edited to launder a drift. For an
   * Effect row it is checked against `quote`/`fromQuote` instead.
   */
  spec: number;
  /**
   * The stat key the figure is authored under, or `null` when it is not
   * authored in `/data` at all (an `in_code` row).
   */
  stat: StatKey | null;
  bag?: Bag;
  /** Converts the authored encoding into §7's units — a `×n` column is `1 + v`. */
  as?: (v: number) => number;
  /** Effect rows only: the verbatim §7 substring this figure is stated in. */
  quote?: string;
  /**
   * Effect rows only: the substring the item's **desc** states the figure in,
   * when the desc words it differently from §7. Normalisation (case, `**`,
   * `×`→`x`, U+2212→`-`) covers every row but one, so this is declared rather
   * than guessed: §7 writes "double Dash Slash distance" and the desc writes
   * "Doubles Dash Slash distance", and a fuzzy match loose enough to bridge
   * that would be loose enough to accept a wrong number elsewhere.
   */
  descQuote?: string;
  /** Effect rows only: pulls the numeral back out of `quote`, so `spec` cannot drift from it. */
  fromQuote?: { pattern: RegExp; as?: (n: number) => number };
  /** Effect rows only: why `fromQuote` is impossible (a flag, or a number written as a word). */
  unquantified?: string;
  status: Status;
  /** Effect rows only: c022's behavioural pointer. Required for every Effect row. */
  behaviour?: Behaviour;
  note?: string;
}

/**
 * The stat key each of §7's five numeric columns is authored under. Declared
 * once and asserted per row, because the mutation check below cannot see this
 * mistake: a `0`/`×1` cell reads 0 through *any* stat key, so a row that
 * mapped Sniper Bracelet's `Def 0` to `wallHp` would be unique under the bump,
 * invisible to the unread-column check (nothing is authored there), and green
 * — while auditing a stat §7 never mentions. The column's non-zero rows on
 * other items pin the mapping only incidentally; this pins it directly.
 */
const NUMERIC_STAT: Readonly<Record<Exclude<Col, 'effect'>, StatKey>> = {
  hp: 'maxHp',
  atk: 'atkFlat',
  def: 'armor',
  atkspd: 'attackSpeed',
  move: 'moveSpeedPct',
};

/** The two columns §7 writes as `×n`, and which therefore convert by `1 + v`. */
const MUL_COLS: readonly Exclude<Col, 'effect'>[] = ['atkspd', 'move'];

/** A `×n` column: the authored delta is `n - 1`. */
const MUL = (v: number): number => 1 + v;
/** A percent written in §7 as `20%`, authored as `0.2`. */
const PCT = (n: number): number => n / 100;
const NEG_PCT = (n: number): number => -n / 100;

const LEDGER: readonly Figure[] = [
  /* ------------------------------------------------------------ greatsword */
  { item: 'greatsword', col: 'hp', figure: 'HP', spec: 0, stat: 'maxHp', status: { kind: 'match' } },
  { item: 'greatsword', col: 'atk', figure: 'Atk', spec: 10, stat: 'atkFlat', status: { kind: 'match' } },
  { item: 'greatsword', col: 'def', figure: 'Def', spec: 5, stat: 'armor', status: { kind: 'match' } },
  {
    item: 'greatsword',
    col: 'atkspd',
    figure: 'AtkSpd',
    spec: 0.9,
    stat: 'attackSpeed',
    as: MUL,
    status: { kind: 'match' },
  },
  {
    item: 'greatsword',
    col: 'move',
    figure: 'Move',
    spec: 1,
    stat: 'moveSpeedPct',
    as: MUL,
    status: { kind: 'match' },
  },

  /* ---------------------------------------------------------- sleeve sword */
  { item: 'sleeve_sword', col: 'hp', figure: 'HP', spec: 0, stat: 'maxHp', status: { kind: 'match' } },
  { item: 'sleeve_sword', col: 'atk', figure: 'Atk', spec: 5, stat: 'atkFlat', status: { kind: 'match' } },
  { item: 'sleeve_sword', col: 'def', figure: 'Def', spec: 0, stat: 'armor', status: { kind: 'match' } },
  {
    item: 'sleeve_sword',
    col: 'atkspd',
    figure: 'AtkSpd',
    spec: 1.2,
    stat: 'attackSpeed',
    as: MUL,
    status: { kind: 'match' },
  },
  {
    item: 'sleeve_sword',
    col: 'move',
    figure: 'Move',
    spec: 1,
    stat: 'moveSpeedPct',
    as: MUL,
    status: { kind: 'match' },
  },
  {
    item: 'sleeve_sword',
    col: 'effect',
    figure: 'classFallback: if not Swordsman, atk speed x1.2',
    behaviour: {
      coveredBy: 'tests/fb015-equipment.test.ts',
      anchor: /"if not Swordsman" fallback: a non-Swordsman gets an extra \+20% attack speed source instead/,
      why:
        'The fallback bag reaches `attackSpeed` as its own `equipment:sleeve_sword:fallback` source, ' +
        'with the Swordsman\'s own exclusion asserted by the sibling `it` beneath it.',
    },
    quote: 'if not Swordsman: atk speed ×1.2 (so 1.2×1.2)',
    fromQuote: { pattern: /atk speed ×([\d.]+)/ },
    spec: 1.2,
    stat: 'attackSpeed',
    bag: 'fallback',
    as: MUL,
    status: { kind: 'match' },
    note:
      "§7's own composition — '(so 1.2x1.2)' — is the product of this row and the AtkSpd column, " +
      'and is asserted as a rider below rather than as a row, so that no two rows read one ' +
      'authored field. The quote carries it anyway: the residue check treats an unquoted numeral ' +
      'in a §7 cell as an unaudited figure, and it was right to — the product is a figure, just ' +
      'one a *row* cannot hold. `fromQuote` still reads the first factor, which is this row’s own.',
  },

  /* ---------------------------------------------------------- normal armor */
  { item: 'normal_armor', col: 'hp', figure: 'HP', spec: 10, stat: 'maxHp', status: { kind: 'match' } },
  { item: 'normal_armor', col: 'atk', figure: 'Atk', spec: 0, stat: 'atkFlat', status: { kind: 'match' } },
  { item: 'normal_armor', col: 'def', figure: 'Def', spec: 10, stat: 'armor', status: { kind: 'match' } },
  {
    item: 'normal_armor',
    col: 'atkspd',
    figure: 'AtkSpd',
    spec: 1,
    stat: 'attackSpeed',
    as: MUL,
    status: { kind: 'match' },
  },
  {
    item: 'normal_armor',
    col: 'move',
    figure: 'Move',
    spec: 1,
    stat: 'moveSpeedPct',
    as: MUL,
    status: { kind: 'match' },
  },

  /* ------------------------------------------------------- swordsman armor */
  { item: 'swordsman_armor', col: 'hp', figure: 'HP', spec: 5, stat: 'maxHp', status: { kind: 'match' } },
  { item: 'swordsman_armor', col: 'atk', figure: 'Atk', spec: 5, stat: 'atkFlat', status: { kind: 'match' } },
  { item: 'swordsman_armor', col: 'def', figure: 'Def', spec: 5, stat: 'armor', status: { kind: 'match' } },
  {
    item: 'swordsman_armor',
    col: 'atkspd',
    figure: 'AtkSpd',
    spec: 1.1,
    stat: 'attackSpeed',
    as: MUL,
    status: { kind: 'match' },
  },
  {
    item: 'swordsman_armor',
    col: 'move',
    figure: 'Move',
    spec: 1,
    stat: 'moveSpeedPct',
    as: MUL,
    status: { kind: 'match' },
  },
  {
    item: 'swordsman_armor',
    col: 'effect',
    figure: 'classFallback: if not Swordsman, atk speed x1.5',
    behaviour: {
      coveredBy: 'tests/equip-effect-behaviour.test.ts',
      anchor: /the fallback contributes to the attackSpeed stat for a non-Swordsman/,
      why:
        'The one classFallback line with no dedicated block anywhere before c022 — fb015 covered it ' +
        'only through the generic three-item loop, which names no stat and would read identically if ' +
        'this item\'s fallback moved to another key.',
    },
    quote: 'if not Swordsman: atk speed ×1.5 (so 1.1×1.5)',
    fromQuote: { pattern: /atk speed ×([\d.]+)/ },
    spec: 1.5,
    stat: 'attackSpeed',
    bag: 'fallback',
    as: MUL,
    status: { kind: 'match' },
    note: "§7's '(so 1.1x1.5)' product is a rider below, for the same reason Sleeve Sword's is.",
  },

  /* ---------------------------------------------------------- normal shoes */
  { item: 'normal_shoes', col: 'hp', figure: 'HP', spec: 5, stat: 'maxHp', status: { kind: 'match' } },
  { item: 'normal_shoes', col: 'atk', figure: 'Atk', spec: 0, stat: 'atkFlat', status: { kind: 'match' } },
  { item: 'normal_shoes', col: 'def', figure: 'Def', spec: 5, stat: 'armor', status: { kind: 'match' } },
  {
    item: 'normal_shoes',
    col: 'atkspd',
    figure: 'AtkSpd',
    spec: 1,
    stat: 'attackSpeed',
    as: MUL,
    status: { kind: 'match' },
  },
  {
    item: 'normal_shoes',
    col: 'move',
    figure: 'Move',
    spec: 1.5,
    stat: 'moveSpeedPct',
    as: MUL,
    status: { kind: 'match' },
  },

  /* ------------------------------------------------------- swordsman shoes */
  { item: 'swordsman_shoes', col: 'hp', figure: 'HP', spec: 3, stat: 'maxHp', status: { kind: 'match' } },
  { item: 'swordsman_shoes', col: 'atk', figure: 'Atk', spec: 3, stat: 'atkFlat', status: { kind: 'match' } },
  { item: 'swordsman_shoes', col: 'def', figure: 'Def', spec: 3, stat: 'armor', status: { kind: 'match' } },
  {
    item: 'swordsman_shoes',
    col: 'atkspd',
    figure: 'AtkSpd',
    spec: 1.1,
    stat: 'attackSpeed',
    as: MUL,
    status: { kind: 'match' },
  },
  {
    item: 'swordsman_shoes',
    col: 'move',
    figure: 'Move',
    spec: 2,
    stat: 'moveSpeedPct',
    as: MUL,
    status: { kind: 'match' },
  },
  {
    item: 'swordsman_shoes',
    col: 'effect',
    figure: 'double Dash Slash distance — the x2 itself',
    behaviour: {
      coveredBy: 'tests/fb015-equipment.test.ts',
      anchor: /reaches an enemy beyond the un-doubled dash range/,
      reads: [/swordsman_shoes/],
      why:
        'The one Effect row with `stat: null`, so there is no stat key for the default `reads` to ' +
        'look for: the figure is a `/src` literal, already pinned by this row\'s `anchors` and ' +
        '`capture`. The pointer\'s job here is the other half — that the doubling is observed in a ' +
        'real World — so it reads the item key the block equips instead.',
    },
    quote: 'double Dash Slash distance',
    descQuote: 'doubles dash slash distance',
    unquantified:
      "§7 writes the multiplier as the word 'double', so there is no numeral in the quote to " +
      'extract; the 2 is read back out of its `/src` literal by `capture` instead, so `spec` is ' +
      'held to the shipped code the way a numeric row is held to the parsed table.',
    spec: 2,
    stat: null,
    status: {
      kind: 'in_code',
      // Re-pointed at the 2026-09-04 lane merge: main's fb053 derives the
      // range from dash speed x duration (`dashDistance(currentMoveSpeed(w),
      // duration)`) rather than reading `eff.dashRange`; the x2 is unchanged.
      site: "fireDashSlash — `dashDistance(currentMoveSpeed(w), duration) * (hasEquipment(w, 'swordsman_shoes') ? 2 : 1)`",
      file: CLASSES_TS,
      anchors: [
        /const dashRange = dashDistance\(currentMoveSpeed\(w\), duration\) \* \(hasEquipment\(w, 'swordsman_shoes'\) \? 2 : 1\);/,
      ],
      // The anchor proves the line still reads the way the row describes; this
      // proves `spec` is that line's number. Without it, editing `spec` to 3
      // would be green — the 2 would be pinned twice in the row and asserted
      // nowhere against itself.
      capture: /hasEquipment\(w, 'swordsman_shoes'\) \? (\d+) : 1/,
      why:
        'The one §7 figure that is a literal in `/src` rather than a `/data` row — architecture ' +
        'rule 4 debt, the same kind c008 counted eight of on §4. It scales another class’s ' +
        'authored field (`swordsman.active2.dashRange`), and `mods` has no stat key meaning ' +
        '"scale one Active’s range", so there is nowhere in `equipment.json` to put it today. ' +
        'Pinned by its source line so the 2 cannot change silently, and counted so the debt is a ' +
        'number rather than a comment.',
      absentKey: /dash|distance|dist/i,
    },
  },
  {
    item: 'swordsman_shoes',
    col: 'effect',
    figure: 'classFallback: if not Swordsman, x1.1 movement',
    behaviour: {
      coveredBy: 'tests/fb015-equipment.test.ts',
      anchor: /"if not Swordsman" fallback: a non-Swordsman gets \+10% movement instead/,
      why: 'Same shape as Sleeve Sword\'s fallback row: the source lands on `moveSpeedPct` by name.',
    },
    quote: 'if not Swordsman: ×1.1 movement',
    fromQuote: { pattern: /×([\d.]+) movement/ },
    spec: 1.1,
    stat: 'moveSpeedPct',
    bag: 'fallback',
    as: MUL,
    status: { kind: 'match' },
  },

  /* ----------------------------------------------------------- normal ring */
  { item: 'normal_ring', col: 'hp', figure: 'HP', spec: 1, stat: 'maxHp', status: { kind: 'match' } },
  { item: 'normal_ring', col: 'atk', figure: 'Atk', spec: 1, stat: 'atkFlat', status: { kind: 'match' } },
  { item: 'normal_ring', col: 'def', figure: 'Def', spec: 1, stat: 'armor', status: { kind: 'match' } },
  {
    item: 'normal_ring',
    col: 'atkspd',
    figure: 'AtkSpd',
    spec: 1,
    stat: 'attackSpeed',
    as: MUL,
    status: { kind: 'match' },
  },
  {
    item: 'normal_ring',
    col: 'move',
    figure: 'Move',
    spec: 1,
    stat: 'moveSpeedPct',
    as: MUL,
    status: { kind: 'match' },
  },
  {
    item: 'normal_ring',
    col: 'effect',
    figure: 'life regen +1',
    behaviour: {
      coveredBy: 'tests/equip-effect-behaviour.test.ts',
      anchor: /raises the hpRegen stat by exactly 1 over the same world without the ring/,
      why:
        '`hpRegen` had no equipment-side block at all before c022 — `p-core-b-effects` proves the ' +
        'Core\'s step grants it, which says nothing about this item\'s point.',
    },
    quote: 'life regen +1',
    fromQuote: { pattern: /life regen \+([\d.]+)/ },
    spec: 1,
    stat: 'hpRegen',
    status: { kind: 'match' },
  },

  /* --------------------------------------------------------- bleeding ring */
  { item: 'bleeding_ring', col: 'hp', figure: 'HP', spec: 0, stat: 'maxHp', status: { kind: 'match' } },
  { item: 'bleeding_ring', col: 'atk', figure: 'Atk', spec: 2, stat: 'atkFlat', status: { kind: 'match' } },
  { item: 'bleeding_ring', col: 'def', figure: 'Def', spec: 1, stat: 'armor', status: { kind: 'match' } },
  {
    item: 'bleeding_ring',
    col: 'atkspd',
    figure: 'AtkSpd',
    spec: 1,
    stat: 'attackSpeed',
    as: MUL,
    status: { kind: 'match' },
  },
  {
    item: 'bleeding_ring',
    col: 'move',
    figure: 'Move',
    spec: 1,
    stat: 'moveSpeedPct',
    as: MUL,
    status: { kind: 'match' },
  },
  {
    item: 'bleeding_ring',
    col: 'effect',
    figure: '+0.01% lifesteal',
    behaviour: {
      coveredBy: 'tests/equip-effect-behaviour.test.ts',
      anchor: /the healed amount is the damage dealt times the leech stat/,
      why:
        'fb015\'s two Bleeding blocks prove the *flag* routes bleed damage into leech; neither reads ' +
        'the magnitude, so the 0.0001 could have been any positive number.',
    },
    quote: '+0.01% lifesteal',
    fromQuote: { pattern: /\+([\d.]+)% lifesteal/, as: PCT },
    spec: 0.0001,
    stat: 'leech',
    status: { kind: 'match' },
    note:
      '`leech` is a raw fraction of the damage dealt (`enemies.ts`: `min(dmg, hpBeforeHit) * ' +
      'derived.leech`), so §7’s 0.01% is authored as 0.0001 rather than as 0.01 — the ' +
      'conversion `fromQuote` performs, which is why a mis-scaled authoring is red here.',
  },
  {
    item: 'bleeding_ring',
    col: 'effect',
    figure: 'lifesteal now also applies to Bleeding damage (the flag)',
    behaviour: {
      coveredBy: 'tests/equip-effect-behaviour.test.ts',
      anchor: /the ring sets bleedLifesteal and nothing else does/,
      why:
        'fb015:422 proves the ring heals off a Bleeding tick, but it equips the *item* and never ' +
        'names the stat — the row\'s own note pointed at it in prose, which is what c022 turns into an ' +
        'anchor. The sibling `it` drives `bleedLifesteal` directly, holding leech constant.',
    },
    quote: 'lifesteal now also applies to Bleeding damage',
    unquantified:
      '§7 states this clause as a rule with no numeral. It is a boolean in stat form ' +
      '(`bleedLifesteal`, the `secondWind` precedent), so the figure the ledger can pin is that ' +
      'the flag is authored set — 1, not 0 and not absent.',
    spec: 1,
    stat: 'bleedLifesteal',
    status: { kind: 'match' },
    note:
      'The flag reading 1 is not the mechanic, and filing it as a figure routes it around the ' +
      '`RULES` device that would have forced a named behavioural cover. Named here instead: ' +
      '`tests/fb015-equipment.test.ts:419` ("a Bleeding tick heals the Warden when the ring is ' +
      'equipped", with its no-ring control) is what proves the flag does anything.',
  },

  /* ------------------------------------------------------- normal necklace */
  { item: 'normal_necklace', col: 'hp', figure: 'HP', spec: 1, stat: 'maxHp', status: { kind: 'match' } },
  { item: 'normal_necklace', col: 'atk', figure: 'Atk', spec: 1, stat: 'atkFlat', status: { kind: 'match' } },
  { item: 'normal_necklace', col: 'def', figure: 'Def', spec: 1, stat: 'armor', status: { kind: 'match' } },
  {
    item: 'normal_necklace',
    col: 'atkspd',
    figure: 'AtkSpd',
    spec: 1,
    stat: 'attackSpeed',
    as: MUL,
    status: { kind: 'match' },
  },
  {
    item: 'normal_necklace',
    col: 'move',
    figure: 'Move',
    spec: 1,
    stat: 'moveSpeedPct',
    as: MUL,
    status: { kind: 'match' },
  },
  {
    item: 'normal_necklace',
    col: 'effect',
    figure: 'EXP +20%',
    behaviour: {
      coveredBy: 'tests/equip-effect-behaviour.test.ts',
      anchor: /raises the xpGain stat into xpMul/,
      why:
        '`xpGain` had no equipment-side block: the only other reader is the VS Core\'s own ' +
        '`vsXpGainPct`.',
    },
    quote: 'EXP +20%',
    fromQuote: { pattern: /EXP \+([\d.]+)%/, as: PCT },
    spec: 0.2,
    stat: 'xpGain',
    status: { kind: 'match' },
  },
  {
    item: 'normal_necklace',
    col: 'effect',
    figure: 'tower upgrade cost -20%',
    behaviour: {
      coveredBy: 'tests/equip-effect-behaviour.test.ts',
      anchor: /discounts the towerCost stat, which prices both the build and the upgrade step/,
      why:
        '**The row c022 was filed on.** QA moved this figure to `goldFind` in `/data` and in this row ' +
        'and the ledger stayed green; the covering block reads `towerCost` and prices an upgrade with ' +
        'it, so the same mutation now has nowhere to point.',
    },
    // U+2212, §7's own minus sign — not a hyphen.
    quote: 'tower upgrade cost −20%',
    fromQuote: { pattern: /tower upgrade cost −([\d.]+)%/, as: NEG_PCT },
    spec: -0.2,
    stat: 'towerCost',
    status: { kind: 'match' },
    note:
      'The second of the two rows whose **figure** is right and whose **reach** is wider than §7’s ' +
      'sentence — and unlike Normal Bracelet’s, this one is settled. §7 says "tower **upgrade** ' +
      'cost", while `towerCost` discounts a tower’s build price (`towers.ts`) as well as its ' +
      'upgrade step (`upgrades.ts`). Authorised: **Q136(1)**, owner verdict "approved, all four ' +
      'calls" — there is no upgrade-only cost stat in the engine and no other `towerCost` source ' +
      'draws that distinction either. Recorded here so the ledger names both reach divergences ' +
      'rather than only the open one.',
  },

  /* ---------------------------------------------------- builder's necklace */
  { item: 'builders_necklace', col: 'hp', figure: 'HP', spec: 1, stat: 'maxHp', status: { kind: 'match' } },
  { item: 'builders_necklace', col: 'atk', figure: 'Atk', spec: 0, stat: 'atkFlat', status: { kind: 'match' } },
  { item: 'builders_necklace', col: 'def', figure: 'Def', spec: 2, stat: 'armor', status: { kind: 'match' } },
  {
    item: 'builders_necklace',
    col: 'atkspd',
    figure: 'AtkSpd',
    spec: 1,
    stat: 'attackSpeed',
    as: MUL,
    status: { kind: 'match' },
  },
  {
    item: 'builders_necklace',
    col: 'move',
    figure: 'Move',
    spec: 1,
    stat: 'moveSpeedPct',
    as: MUL,
    status: { kind: 'match' },
  },
  {
    item: 'builders_necklace',
    col: 'effect',
    figure: 'all towers +1 flat attack',
    behaviour: {
      coveredBy: 'tests/equip-effect-behaviour.test.ts',
      anchor: /the \+1 is authored on the towerAtkFlat stat/,
      why:
        'fb015\'s Builder\'s Necklace blocks observe `towerDamage()` moving, which is the right ' +
        'observable and names no stat — they would read identically if the +1 were authored on any ' +
        'other key that happened to raise tower damage. The block here pins the key; fb015\'s two keep ' +
        'the ordering and VS-count clauses, which `RULES` already anchors.',
    },
    quote: 'all towers +1 flat attack',
    fromQuote: { pattern: /all towers \+([\d.]+) flat attack/ },
    spec: 1,
    stat: 'towerAtkFlat',
    status: { kind: 'match' },
  },

  /* ------------------------------------------------------- normal bracelet */
  { item: 'normal_bracelet', col: 'hp', figure: 'HP', spec: 1, stat: 'maxHp', status: { kind: 'match' } },
  { item: 'normal_bracelet', col: 'atk', figure: 'Atk', spec: 1, stat: 'atkFlat', status: { kind: 'match' } },
  { item: 'normal_bracelet', col: 'def', figure: 'Def', spec: 1, stat: 'armor', status: { kind: 'match' } },
  {
    item: 'normal_bracelet',
    col: 'atkspd',
    figure: 'AtkSpd',
    spec: 1,
    stat: 'attackSpeed',
    as: MUL,
    status: { kind: 'match' },
  },
  {
    item: 'normal_bracelet',
    col: 'move',
    figure: 'Move',
    spec: 1,
    stat: 'moveSpeedPct',
    as: MUL,
    status: { kind: 'match' },
  },
  {
    item: 'normal_bracelet',
    col: 'effect',
    figure: 'character and tower area +10%',
    behaviour: {
      coveredBy: 'tests/fb015-equipment.test.ts',
      anchor: /Normal Bracelet raises areaMul, which already covers both character and tower area/,
      why:
        '`areaMul` is `area`\'s own derived factor, read by name. The *reach* of that factor is c013\'s ' +
        'measurement, not this pointer\'s.',
    },
    quote: 'character and tower **area** +10%',
    fromQuote: { pattern: /\*\*area\*\* \+([\d.]+)%/, as: PCT },
    spec: 0.1,
    stat: 'area',
    status: { kind: 'match' },
    note:
      'The **figure** is right; its **reach** is `c013`’s open item. There is no ' +
      '`charArea`/`towerArea` split in `statkeys.ts`, so this is authored on the global `area`, ' +
      'which since `c001` also widens every class Active. This ledger pins the 0.1 and nothing ' +
      'more — the reach is c013’s measurement, not a second competing one here.',
  },

  /* ------------------------------------------------------- sniper bracelet */
  { item: 'sniper_bracelet', col: 'hp', figure: 'HP', spec: 2, stat: 'maxHp', status: { kind: 'match' } },
  { item: 'sniper_bracelet', col: 'atk', figure: 'Atk', spec: 1, stat: 'atkFlat', status: { kind: 'match' } },
  { item: 'sniper_bracelet', col: 'def', figure: 'Def', spec: 0, stat: 'armor', status: { kind: 'match' } },
  {
    item: 'sniper_bracelet',
    col: 'atkspd',
    figure: 'AtkSpd',
    spec: 1,
    stat: 'attackSpeed',
    as: MUL,
    status: { kind: 'match' },
  },
  {
    item: 'sniper_bracelet',
    col: 'move',
    figure: 'Move',
    spec: 1,
    stat: 'moveSpeedPct',
    as: MUL,
    status: { kind: 'match' },
  },
  {
    item: 'sniper_bracelet',
    col: 'effect',
    figure: 'range +10% — the tower half',
    behaviour: {
      coveredBy: 'tests/fb015-equipment.test.ts',
      anchor: /Sniper Bracelet raises both towerRangeMul and the character-only charRangeMul/,
      why:
        'The one block that reads both halves of §7\'s single sentence by name, which is why the two ' +
        'rows share it: it is the split that makes them two rows.',
    },
    quote: 'character and tower **range** +10%',
    fromQuote: { pattern: /\*\*range\*\* \+([\d.]+)%/, as: PCT },
    spec: 0.1,
    stat: 'towerRange',
    status: { kind: 'match' },
    note:
      '§7 states one figure over two consumers, and unlike Normal Bracelet’s `area` this one ' +
      '*is* split in `statkeys.ts` — so it is two rows reading two authored fields, and the ' +
      'mutation check can tell them apart. The contrast is the exact shape c013 wants for `area`.',
  },
  {
    item: 'sniper_bracelet',
    col: 'effect',
    figure: 'range +10% — the character half',
    behaviour: {
      coveredBy: 'tests/fb015-equipment.test.ts',
      anchor: /Sniper Bracelet raises both towerRangeMul and the character-only charRangeMul/,
      why:
        'The character half of the same block; `charRangeMul` and `towerRangeMul` are asserted on ' +
        'adjacent lines, so a row that lost its half would still be red here.',
    },
    quote: 'character and tower **range** +10%',
    fromQuote: { pattern: /\*\*range\*\* \+([\d.]+)%/, as: PCT },
    spec: 0.1,
    stat: 'charRange',
    status: { kind: 'match' },
    note:
      '`charRange`’s own scope is a **Q136(3)** judgement call, owner-approved: it reaches the ' +
      'class basic attack and the VS wielded attack (§6.1 calls a wielded attack "treated as a ' +
      'character attack") and deliberately *not* summon ranges or an Active’s own reach. Named ' +
      'here for the same reason the `towerCost` row names Q136(1) — a reach the ledger checked ' +
      'and found authorised reads identically to one nobody has looked at, unless it says so.',
  },
];

/**
 * A §7 cell that states **no number at all**. Declared, not inferred: the
 * coverage check requires every one of the 12x6 cells to hold either a ledger
 * row or an entry here.
 */
const NO_FIGURE: readonly { item: string; col: Col; why: string }[] = [
  {
    item: 'greatsword',
    col: 'effect',
    why: "§7's Effect cell is the literal word `none`. The item is its five columns and nothing else.",
  },
  { item: 'normal_armor', col: 'effect', why: "§7's Effect cell is the literal word `none`." },
  { item: 'normal_shoes', col: 'effect', why: "§7's Effect cell is the literal word `none`." },
];

/**
 * Words that carry no rule on their own, so a residue made only of these is
 * not an unclaimed clause. Deliberately tiny and closed: anything outside it
 * that survives the strike-out is prose §7 states and this ledger does not
 * read. Widening this list is how the clause check would be defeated, which is
 * why it is declared here beside RULES rather than inlined at the call site.
 */
const CONNECTIVES: ReadonlySet<string> = new Set(['and', 'if', 'so', 'now', 'also', 'instead', 'the', 'a', 'to', 'is', 'not']);
/** An alphabetic run; `+10%`-style residue is (a)'s business, not (b)'s. */
const WORD = /[A-Za-z]+/g;

/**
 * The content words left in a residue - the clause check's whole decision,
 * split out so it can be exercised on synthetic text instead of only through
 * whatever §7 happens to say today.
 */
function unclaimedWords(residueText: string): string[] {
  return (residueText.match(WORD) ?? []).filter((w) => !CONNECTIVES.has(w.toLowerCase()));
}

/**
 * §7 preamble sentences that state **no rule** and so are claimed by nobody.
 * Declared, with a reason, because the alternative is what QA broke: the
 * preamble was checked for stray *numerals* only, so a new normative sentence
 * without a number in it ("Equipment is lost on the Warden's death and must be
 * re-bought.") went in green. Every other preamble sentence must be a RULES
 * clause; these two are the exemptions, and adding a third is a visible edit.
 */
const PROSE_EXEMPT: readonly { sentence: string; why: string }[] = [
  {
    sentence: 'Expansion hook:',
    why: "§7's own note that the table is append-only - a statement about the document, not about the game.",
  },
  {
    sentence: 'Parked idea (owner):',
    why: 'Explicitly parked by the owner (multi-item slots), so there is nothing shipped for a row to audit.',
  },
];


/**
 * A clause inside a **covered** Effect cell that states a rule rather than a
 * number. Without this table, "every cell holds a figure" would be satisfied by
 * one figure in a cell that also carries three unaudited mechanics. Each entry
 * quotes §7 verbatim and names the test file that covers it behaviourally —
 * this file audits numbers, and says so by pointing at who audits the rest.
 */
interface Rule {
  /** The item whose Effect cell states the clause, or `null` for a §7 preamble rule. */
  item: string | null;
  /** The clause, verbatim from §7. */
  clause: string;
  /** The test file that covers it behaviourally. */
  coveredBy: string;
  /**
   * The `describe`/`it` title in `coveredBy` that does the covering. A filename
   * alone is not a pointer: the covering block could be deleted and every entry
   * here would stay green, which is weaker than the `anchors` device the
   * `in_code` row already applies to `/src`.
   */
  anchor: RegExp;
  why: string;
}

const RULES: readonly Rule[] = [
  {
    item: 'sleeve_sword',
    clause: 'Circle Slash needs no charge and fires at max-charge effect',
    coveredBy: 'tests/fb015-equipment.test.ts',
    anchor: /releasing at an arbitrary early tick still fires at max-charge damage\/radius/,
    why:
      'A charge-state rule, not a magnitude: `useClassActive1` starts the hold at `cap` when the ' +
      'item is equipped (fb052 kept the hold/release flow real so Dash Slash can still merge).',
  },
  {
    item: 'swordsman_armor',
    clause: 'Circle Slash charging speed = original × attack speed',
    coveredBy: 'tests/fb015-equipment.test.ts',
    anchor: /charges faster than baseline over a fixed hold, with the item equipped/,
    why:
      'A rate rule stated in terms of another stat, so there is no constant to pin: ' +
      '`circleSlashChargeRate` returns `derived.attackSpeedMul` instead of 1.',
  },
  {
    item: 'swordsman_armor',
    clause: 'if sleeve sword equipped, Circle Slash damage is boosted by attack speed instead',
    coveredBy: 'tests/fb015-equipment.test.ts',
    anchor: /cross-item: with Sleeve Sword also equipped, charge rate is moot/,
    why:
      'The cross-item swap, again stated in terms of a stat rather than a constant: ' +
      "`fireCircleSlash`'s boost, and `fireDashSlash`'s merged-damage copy of it (fb052).",
  },
  {
    item: 'builders_necklace',
    clause: 'boostable by upgrades / VS count multiplier',
    coveredBy: 'tests/fb015-equipment.test.ts',
    anchor: /raises towerDamage\(\) by more once upgraded \(the flat point is boosted, not just added\)/,
    why:
      'An ordering rule on where the +1 lands, not a second figure: `towerAtkFlat` is added to a ' +
      "tower's base damage *before* `upgradeStatMul` and the VS wielding-count bonus.",
  },

  /* --------------------------------------------------- §7's preamble rules */
  // Coverage is per table *cell*, so §7's three preamble sentences would
  // otherwise sit outside the surface entirely — the file would be auditing
  // §7's table and claiming §7. Each is a rule, not a figure, so each gets the
  // same treatment as a rule inside a cell.
  {
    item: null,
    clause: '(one each)',
    coveredBy: 'tests/fb015-equipment.test.ts',
    anchor: /defaultMeta starts with an empty equipment stash and all 6 slots null/,
    why:
      'One item per slot, enforced structurally rather than numerically: `meta.equipped` is a ' +
      'slot-keyed record, and `equipItem` refuses an item whose slot does not match the target.',
  },
  {
    item: null,
    clause: 'Multipliers multiply per §2; flats add',
    coveredBy: 'tests/fb015-equipment.test.ts',
    anchor: /two equipped items multiply their attackSpeed factors rather than adding/,
    why:
      "§2's stacking rule restated for equipment. It is the reason every `×n` row here converts " +
      'by `1 + v` and every point row adds — and the reason the two composition riders below can ' +
      'be a product at all.',
  },
  {
    item: null,
    // §7 wraps this sentence mid-clause, so the quote carries the newline —
    // the same shape c008's Plaguebringer rows use.
    clause: 'Class-conditional lines are inert\nelsewhere unless a fallback is written',
    coveredBy: 'tests/fb015-equipment.test.ts',
    anchor: /each of the 3 classFallback items withholds its fallback mods for the excluded class itself/,
    why:
      'The rule the three `classFallback` rows implement. Its *other* half — that the excluded ' +
      'class gets nothing extra — is asserted by the third rider below, because the fallback rows ' +
      'themselves can only read a magnitude.',
  },
];

/* -------------------------------------------------------------- machinery */

interface RawItem {
  key: string;
  slot: string;
  mods?: Record<string, number>;
  classFallback?: { notClassKey: string; mods: Record<string, number> };
  [k: string]: unknown;
}
interface RawEquipmentDoc {
  slots: string[];
  items: RawItem[];
}

const RAW = content.raw.equipment as RawEquipmentDoc;

/** One row's stable identity, used in messages and in the uniqueness check. */
function id(f: Figure): string {
  return `${f.item} · ${f.col} · ${f.figure}`;
}

/**
 * The figure's value as §7 states it, read out of an arbitrary equipment
 * document. **An absent key reads 0**, which is the authored form of every
 * `0`/`×1` cell in the table — see the header.
 */
function readFrom(doc: RawEquipmentDoc, f: Figure): number | undefined {
  if (f.stat === null) return undefined;
  const item = doc.items.find((i) => i.key === f.item);
  if (!item) return undefined;
  const bag = f.bag === 'fallback' ? item.classFallback?.mods : item.mods;
  // A missing `mods` is an empty bag (the schema defaults it); a missing
  // `classFallback` is a *different* claim — the "if not <class>" line is gone
  // — so it reads `undefined` and reddens its row rather than reading 0.
  if (f.bag === 'fallback' && bag === undefined) return undefined;
  const raw = bag?.[f.stat] ?? 0;
  return f.as ? f.as(raw) : raw;
}

/** The same figure as the *loaded* content carries it — what the sim runs on. */
function readLoaded(f: Figure): number | undefined {
  if (f.stat === null) return undefined;
  const item = content.equipmentByKey.get(f.item);
  if (!item) return undefined;
  const bag = (f.bag === 'fallback' ? item.classFallback?.mods : item.mods) as
    | Record<string, number>
    | undefined;
  if (f.bag === 'fallback' && bag === undefined) return undefined;
  let raw = bag?.[f.stat] ?? 0;
  // fb153a: `numberScale` divides every HP/damage-denominated stat at load, so
  // the loaded view is the authored figure times that factor. §7 states the
  // *authored* number and `data/equipment.json` still holds it, so the ledger
  // reads the loaded value back through the scale rather than restating §7 in
  // display units. The bridge test ("the loaded content and data/equipment.json
  // agree at every ledger row") then proves the scaler applied exactly that
  // factor to exactly these stats and nothing else.
  if (STAT_SCALED[f.stat as StatKey]) raw /= content.modifiers.numberScale;
  return f.as ? f.as(raw) : raw;
}

/* -------------------------- c022's device, owned by `equip-spec-ledger.ts` */

/*
 * The reader, the `reads` default and the decoy derivation moved to
 * `tests/equip-spec-ledger.ts` at **c028**, unchanged in behaviour and with their
 * reasoning intact in that module's header. They left this file because `c027`
 * needs the same device on the §4 ledger, and a hand-copy loses whichever of
 * the eight mutations behind them the copier does not notice. What stays here
 * is what is about *§7*: which rows must carry a pointer, which one may
 * override `reads`, and which names a covering block reads for a reason other
 * than the stat.
 */

/** Every Effect row — the rows c022 requires a behavioural pointer on. */
const EFFECT_ROWS = LEDGER.filter((f) => f.col === 'effect');

/**
 * The Effect rows allowed to override `reads`. One, and it is the row with no
 * stat at all. Declared as a roster rather than as a per-row flag so a second
 * override is a visible edit to this list, not a quiet field on a row.
 */
const READS_OVERRIDES: readonly string[] = ['swordsman_shoes · effect · double Dash Slash distance — the x2 itself'];

/** Every stat key `data/equipment.json` authors today, in either bag. */
const AUTHORED_STATS: ReadonlySet<string> = new Set(
  RAW.items.flatMap((i) => [...Object.keys(i.mods ?? {}), ...Object.keys(i.classFallback?.mods ?? {})]),
);

/**
 * Names that appear in a covering block for a reason **other** than the stat
 * of that name being read — a function `/src` exports under the same word.
 * Declared with the reason, because the alternative is to drop the whole
 * decoy check over one collision.
 */
const DECOY_EXEMPT: Readonly<Record<string, string>> = {
  towerDamage:
    "`towers.ts` exports a `towerDamage()` function, which the Builder's Necklace covers call to " +
    'observe the flat point landing. The *stat* `towerDamage` is a multiplier no equipment authors; ' +
    'the call is not a read of it.',
};

/**
 * Every stat key `/data` authors on no equipment item — the shape of the
 * mutation c022 was filed on (`towerCost` -> `goldFind`). No covering block
 * may read one, so re-pointing any Effect row's `stat` at any of them fails
 * the `reads` check rather than passing in agreement with itself.
 */
const MUTATION_DECOYS: readonly StatKey[] = decoyKeys(STAT_KEYS, AUTHORED_STATS, DECOY_EXEMPT);

/** This ledger's own `reads` default, in terms of a `Figure`. */
function readsFor(f: Figure): readonly RegExp[] {
  return f.behaviour?.reads ?? defaultReads(f.stat!, f.item);
}

const DATA_HOMED = LEDGER.filter((f) => f.stat !== null);

/** Every key path in an object, dotted and recursive; values never. */
function keyNames(obj: unknown, prefix = '', out: string[] = []): string[] {
  if (obj === null || typeof obj !== 'object') return out;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix === '' ? k : `${prefix}.${k}`;
    out.push(path);
    keyNames(v, path, out);
  }
  return out;
}

/**
 * The content of an `in_code` row's "still not authored in `/data`" claim. The
 * **raw** document, not `loadContent()`'s view: zod strips unknown keys, so a
 * newly authored field would be invisible in the loaded content until someone
 * also extended the schema — precisely the window this check covers.
 */
function absentFrom(f: Figure, st: StatusInCode): string[] {
  const item = RAW.items.find((i) => i.key === f.item);
  return keyNames(item)
    .filter((k) => st.absentKey.test(k))
    .sort();
}

/**
 * c012's own wording for a deviation: "a named deviation carrying the item/
 * Q-number that authorised it". Split out of the assertion so the rule can be
 * exercised on synthetic input — otherwise it is a loop over an empty set,
 * green and untested until the first `fb056` retune needs it.
 *
 * **The shape is deliberately wide, and an earlier draft's narrowness was a
 * real bug.** It listed the four families this lane happens to use —
 * `p<n><a>`, `c<nnn>`, `Q<n>`, `fb<n>` — which is 132 of the 263 ids the four
 * backlog files actually define. QA measured the other 131: every `b###`
 * (including `b032`/`b076`, which this repo's own docs cite as authorities),
 * every lowercase `q##`, the `m##`/`t#`/`f00#`/`x00#` families. A retune
 * authorised by `b076` would have failed the guard, and the only ways green
 * would have been to relabel a real authorisation or to widen the guard — a
 * check whose first real use trains you to edit it is worse than no check. So
 * the shape now accepts any letters-then-digits token and lets `definedAt`,
 * not the regex, decide whether it is real.
 */
const ID_SHAPE = /\b([A-Za-z]+\d+[a-z0-9]*)\b/g;

/** Every id-shaped token in an authorisation string. */
function idsIn(text: string): string[] {
  return text.match(ID_SHAPE) ?? [];
}

function authorisationIsNamed(st: { authorised: string }): boolean {
  return idsIn(st.authorised).length > 0;
}

/**
 * The files an authorisation id can be *defined* in: every backlog lane plus
 * QUESTIONS.md. **Derived, not listed.** The hardcoded roster this replaces
 * named four of the repo's six `BACKLOG*.md` files — `BACKLOG-QUALITY.md`
 * (which defines `q1`-`q57`) and `BACKLOG-TUNER.md` (`t26a`-`t26e`) were
 * missing, harmless only because the old narrow `ID_SHAPE` never reached
 * them. With the shape widened above they matter, and a hardcoded list of
 * files is the same species of hand-maintained table `c012` exists to remove.
 */
const DEFINITION_FILES: readonly string[] = [
  ...readdirSync(fileURLToPath(new URL('..', import.meta.url)))
    .filter((f) => /^BACKLOG.*\.md$/.test(f))
    .sort(),
  'QUESTIONS.md',
];

/**
 * Does `text` **define** `token` — as opposed to merely mentioning it?
 *
 *   - `- [ ] (c012)` / `- [x] (p10s)` — a backlog item line, column 0.
 *   - `- **Q136. ...**` — a QUESTIONS.md entry, column 0.
 *
 * Pure, so the mention-vs-definition rule is tested on literal strings rather
 * than on whatever the backlog files happen to say this week.
 *
 * **Why a definition site at all, and why anchored.** The first draft searched
 * the corpus for the bare token *anywhere*, so *writing about* an id minted
 * it: c012's own Log entry quotes the fabricated `Q9999 / c999` in its account
 * of the QA finding, and that sentence alone made both ids resolve — the
 * ledger would have accepted `Q9999` as a real authorisation on the strength
 * of prose whose only purpose is to say `Q9999` is fake. The first fix moved
 * to a definition site but left both patterns unanchored, which QA showed was
 * the same bug one indent in: an *indented* quotation of an item line inside a
 * Log entry, or an inline `**Q9999:**` in a QUESTIONS sentence, still minted
 * the id. All 263 real item lines and all 160 real Q entries sit at column 0,
 * so anchoring costs nothing and closes the residue.
 */
function definesIn(text: string, token: string): boolean {
  return (
    new RegExp(`^- \\[[ x]\\] \\(${token}\\)`, 'm').test(text) ||
    new RegExp(`^- \\*\\*${token}[.:]`, 'm').test(text)
  );
}

/** Which of the definition files actually define `token`. */
function definedAt(token: string): string[] {
  return DEFINITION_FILES.filter((f) =>
    existsSync(fileURLToPath(new URL(`../${f}`, import.meta.url))),
  ).filter((f) => definesIn(source(f), token));
}

/**
 * ...and the id must actually **exist**. The assertion this backs is titled
 * "names a backlog item or Q-number *that can be looked up*", and the first
 * draft looked nothing up: QA authorised a real greatsword drift with
 * `Q9999 / c999` and the ledger took it. A shape regex says the string looks
 * like an id; this says it is one.
 */
function authorisationResolves(st: { authorised: string }): boolean {
  const ids = idsIn(st.authorised);
  if (ids.length === 0) return false;
  // Every id it names, not just one: "Q136 / Q9999" must not pass on Q136.
  return ids.every((token) => definedAt(token).length > 0);
}

/**
 * §7 and the player-facing descs write the same figure in different scripts —
 * §7 uses `×` (U+00D7), `−` (U+2212) and markdown emphasis, the descs use `x`,
 * `-` and plain text, and the descs capitalise sentence-initially. Normalising
 * both sides is what lets a desc be compared to §7's own words instead of to a
 * hand-retyped copy of them. Digits and signs are *not* normalised away, so a
 * wrong number never survives this.
 */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/\*\*/g, '')
    .replace(/×/g, 'x')
    .replace(/−/g, '-')
    .replace(/\s+/g, ' ');
}

/** §7's parsed row for a `data/equipment.json` key. */
function specRowFor(item: string): SpecRow {
  const name = SPEC_NAME[item];
  if (name === undefined) throw new Error(`${item}: no §7 item label declared`);
  const row = SPEC_TABLE.find((r) => r.name === name);
  if (!row) throw new Error(`${item}: §7 has no row named "${name}"`);
  return row;
}

/* ------------------------------------------------- the ledger, row by row */

describe('c012 — SPEC-FINAL §7: every stated figure, matched or named', () => {
  for (const f of LEDGER) {
    it(`${id(f)} — ${f.status.kind}`, () => {
      const st = f.status;

      // Every row, whatever its status: `spec` is held to SPEC-FINAL's own
      // text, so it cannot be edited to absorb a drift. Numeric columns are
      // held to the parsed cell; Effect rows to their verbatim quote and, where
      // the quote carries a numeral, to that numeral.
      if (f.col !== 'effect') {
        const cell = specRowFor(f.item).cells[f.col];
        expect(f.spec, `${id(f)}: §7's ${f.col.toUpperCase()} cell reads ${cell}`).toBeCloseTo(cell, 10);
        // ...and that the row reads the key that column is *authored* under.
        // A `0`/`×1` cell reads 0 through any key, so without this a numeric
        // row could audit a stat §7 never mentions and stay green.
        expect(f.stat, `${id(f)}: §7's ${f.col.toUpperCase()} column is authored as ${NUMERIC_STAT[f.col]}`).toBe(
          NUMERIC_STAT[f.col],
        );
        expect(
          f.as === MUL,
          `${id(f)}: §7 writes ${f.col.toUpperCase()} ${MUL_COLS.includes(f.col) ? 'as ×n, so it converts by 1 + v' : 'as a point total, so it must not convert'}`,
        ).toBe(MUL_COLS.includes(f.col));
      } else {
        const quote = f.quote!;
        expect(specRowFor(f.item).effect, `${id(f)}: §7's Effect cell does not contain "${quote}"`).toContain(quote);
        if (f.fromQuote) {
          const m = f.fromQuote.pattern.exec(quote);
          expect(m, `${id(f)}: fromQuote pattern does not match its own quote "${quote}"`).not.toBeNull();
          const n = Number(m![1]);
          const converted = f.fromQuote.as ? f.fromQuote.as(n) : n;
          expect(converted, `${id(f)}: §7's own quote states ${converted}`).toBeCloseTo(f.spec, 10);
        }
        // A fallback row quotes the *whole* condition — "if not Swordsman:
        // ×1.1 movement" — but `fromQuote` only reads the magnitude, so
        // without this the row asserts half its own quote. Measured: changing
        // `swordsman_shoes.classFallback.notClassKey` to any class but
        // `engineer` left the entire suite green, this file included, while
        // contradicting the sentence the row quotes.
        if (f.bag === 'fallback') {
          const who = /if not (\w+)/.exec(quote);
          expect(who, `${id(f)}: a fallback quote must name the class §7 excludes`).not.toBeNull();
          const item = RAW.items.find((i) => i.key === f.item);
          expect(
            item?.classFallback?.notClassKey,
            `${id(f)}: §7 excludes the ${who![1]}, so notClassKey must be its class key`,
          ).toBe(who![1].toLowerCase());
        }
      }

      switch (st.kind) {
        case 'match': {
          const live = readLoaded(f);
          expect(live, `${id(f)}: nothing readable at ${f.item}.${f.bag ?? 'mods'}.${f.stat}`).toBeTypeOf('number');
          expect(live, `${id(f)}: §7 states ${f.spec}`).toBeCloseTo(f.spec, 10);
          break;
        }
        case 'retuned': {
          const live = readLoaded(f);
          expect(live, `${id(f)}: nothing readable at ${f.item}.${f.bag ?? 'mods'}.${f.stat}`).toBeTypeOf('number');
          // Both halves are pinned: the drift is still real, and it is still
          // *this* drift. Any further move is red until re-authorised here.
          expect(
            live,
            `${id(f)}: recorded as a deviation but now equals §7's ${f.spec} — make it a match`,
          ).not.toBeCloseTo(f.spec, 10);
          expect(live, `${id(f)}: authorised at ${st.actual} by ${st.authorised}`).toBeCloseTo(st.actual, 10);
          break;
        }
        case 'in_code': {
          for (const anchor of st.anchors) {
            expect(
              source(st.file),
              `${id(f)}: the ledger's pointer into ${st.file} (${st.site}) is stale — re-locate the figure and update this row`,
            ).toMatch(anchor);
          }
          // The figure itself, read back out of the shipped code — the
          // `in_code` equivalent of a numeric row's parsed table cell.
          const captured = st.capture.exec(source(st.file));
          expect(captured, `${id(f)}: ${st.file} no longer states this figure at ${st.site}`).not.toBeNull();
          expect(Number(captured![1]), `${id(f)}: ${st.file} states ${captured![1]}`).toBeCloseTo(f.spec, 10);
          expect(
            absentFrom(f, st),
            `${id(f)}: a new equipment.json key matches this figure — re-file the row as a match and drop the rule-4 debt`,
          ).toEqual([...(st.knownKeys ?? [])].sort());
          break;
        }
      }
    });
  }
});

/* ------------------------------------------------------ the ledger itself */

describe('c012 — the ledger holds itself to c012’s own rule', () => {
  it('every figure resolves to a match or carries a named authorisation', () => {
    const unaccounted: string[] = [];
    for (const f of LEDGER) {
      const st = f.status;
      const named =
        st.kind === 'match'
          ? true
          : st.kind === 'retuned'
            ? st.authorised.trim().length > 0
            : st.site.trim().length > 0 && st.file.trim().length > 0;
      if (!named) unaccounted.push(id(f));
    }
    expect(unaccounted, 'a figure with neither a match nor a named authorisation').toEqual([]);
  });

  it('every row has a unique identity', () => {
    const ids = LEDGER.map(id);
    expect(ids.length - new Set(ids).size, 'two ledger rows share an identity').toBe(0);
  });

  it('every row states a real figure and a real place to look', () => {
    for (const f of LEDGER) {
      expect(Number.isFinite(f.spec), `${id(f)}: spec figure must be a number`).toBe(true);
      expect(f.item.length, `${id(f)}: no item key`).toBeGreaterThan(0);
      expect(f.figure.length, `${id(f)}: no figure`).toBeGreaterThan(0);
      expect(COLS, `${id(f)}: not a §7 column`).toContain(f.col);
      if (f.stat === null) {
        // Only `in_code` may claim a figure is not in `/data` at all.
        expect(['in_code'], id(f)).toContain(f.status.kind);
      } else {
        expect(['match', 'retuned'], id(f)).toContain(f.status.kind);
      }
      // The five numeric columns are read out of §7's table, so a quote there
      // would be redundant *and* misleading — the verbatim text of an HP cell
      // is a bare digit. The Effect column is prose and must be quoted.
      if (f.col === 'effect') {
        expect(f.quote, `${id(f)}: an Effect row must quote §7`).toBeTypeOf('string');
        expect(
          Boolean(f.fromQuote) !== Boolean(f.unquantified),
          `${id(f)}: an Effect row needs exactly one of fromQuote / unquantified`,
        ).toBe(true);
        if (f.unquantified) expect(f.unquantified.trim().length, `${id(f)}: empty unquantified`).toBeGreaterThan(20);
      } else {
        expect(f.quote, `${id(f)}: a numeric column is read from §7's table, not quoted`).toBeUndefined();
        expect(f.fromQuote, `${id(f)}: a numeric column is read from §7's table`).toBeUndefined();
      }
      // A fallback row reads §7's "if not <class>" line, which §7 states in the
      // Effect cell — a fallback row filed against a numeric column would be
      // auditing the wrong half of the table.
      if (f.bag === 'fallback') {
        expect(f.col, `${id(f)}: §7 states the fallback lines in the Effect cell`).toBe('effect');
        expect(f.quote, `${id(f)}: a fallback row must quote §7's "if not ..." line`).toContain('if not');
      }
    }
  });

  it('covers all twelve items, and only items that exist', () => {
    const shipped = new Set(RAW.items.map((i) => i.key));
    expect(shipped.size).toBe(12);
    const covered = new Set(LEDGER.map((f) => f.item));
    expect([...shipped].filter((k) => !covered.has(k)), 'item with no §7 figure in the ledger').toEqual([]);
    expect([...covered].filter((k) => !shipped.has(k)), 'ledger row for an item that does not exist').toEqual([]);
    expect(Object.keys(SPEC_NAME).sort(), 'SPEC_NAME and data/equipment.json disagree on the roster').toEqual(
      [...shipped].sort(),
    );
  });

  it('every one of the 12x6 §7 cells holds a figure or a declared reason it has none', () => {
    // Per *cell*, not per item: "at least one row per item" is too weak to
    // catch a missed column, which is exactly how c008's Swordsman passive was
    // missed on its first pass.
    const held = new Set(LEDGER.map((f) => `${f.item}.${f.col}`));
    const excused = new Set(NO_FIGURE.map((n) => `${n.item}.${n.col}`));
    const unaccounted: string[] = [];
    for (const i of RAW.items) {
      for (const col of COLS) {
        const key = `${i.key}.${col}`;
        if (!held.has(key) && !excused.has(key)) unaccounted.push(key);
      }
    }
    expect(unaccounted, '§7 cell with neither a figure nor a NO_FIGURE entry').toEqual([]);
    expect([...excused].filter((k) => held.has(k)), 'NO_FIGURE entry for a cell that does carry a figure').toEqual([]);
    for (const n of NO_FIGURE) {
      expect(n.why.trim().length, `${n.item}.${n.col}: no reason given`).toBeGreaterThan(20);
      // Only the **Effect** column may be excused at all. §7's five numeric
      // columns state a number in every one of their 60 cells by construction,
      // so "this cell has no figure" is never true of them — and the `'none'`
      // guard below reads the item's Effect cell whatever `n.col` says, so
      // without this an excuse filed against `greatsword.hp` would be checked
      // against `greatsword.effect` and pass. (QA deleted the greatsword HP row
      // exactly that way and the file stayed green.)
      expect(n.col, `${n.item}.${n.col}: only §7's Effect column can be figure-less`).toBe('effect');
      // An excused cell must genuinely be empty in the spec, and `none` is the
      // only word §7 uses for that — otherwise a real mechanic could be written
      // off with a plausible sentence.
      expect(specRowFor(n.item).effect, `${n.item}: NO_FIGURE for an Effect cell that is not "none"`).toBe('none');
    }
  });

  it('every figure and every clause §7 states is claimed by a ledger row or a RULES entry', () => {
    // Coverage per *cell* says a cell has at least one row. It does not say the
    // cell has no **unclaimed** content — so §7 gaining a figure inside an
    // already-covered cell was invisible, and `RULES` was pure opt-in (QA
    // emptied it to `[]` with the file green at the same test count). Both are
    // this check.
    //
    // QA's repro: append "; move speed +50%; all towers +3 flat attack" to
    // §7's normal ring row, then do exactly what the hash failure tells you to
    // do and regenerate the hash. The file went green with two §7 figures that
    // no row audits. The hash forces a *re-read*; this is what makes the
    // re-read produce something.
    const unclaimed: string[] = [];

    /** Everything this ledger says it has read, for one item (or the preamble). */
    const claimsFor = (item: string | null): string[] => [
      ...LEDGER.filter((f) => f.item === item && f.col === 'effect').map((f) => f.quote!),
      ...RULES.filter((r) => r.item === item).map((r) => r.clause),
    ];

    /** The text left over once every claim is struck out. */
    const residue = (text: string, claims: readonly string[]): string => {
      let out = text;
      for (const c of claims) out = out.split(c).join(' ');
      return out;
    };

    for (const row of SPEC_TABLE) {
      const key = Object.keys(SPEC_NAME).find((k) => SPEC_NAME[k] === row.name)!;
      if (row.effect === 'none') continue;
      const claims = claimsFor(key);

      // (a) No **figure** may go unclaimed. Striking out every quoted claim
      // must leave prose with no numerals in it — which catches a new figure
      // anywhere in the cell, including inside a parenthetical, where a
      // clause-level split would not look.
      const left = residue(row.effect, claims);
      if (/\d/.test(left)) unclaimed.push(`${key}: unclaimed figure in §7's Effect cell — "${left.trim()}"`);

      // (b) No **clause** may go unclaimed either, or a new non-numeric rule
      // rides in unnoticed. The first draft split the cell on `;` and stopped,
      // which QA showed is only one of the shapes §7 actually uses: a
      // parenthetical ("life regen +1 (does not stack with the Animist regen
      // aura)") or a comma-joined trailing clause was claimed by nobody and
      // stayed green, and §7 *already* states a real mechanic in a
      // parenthetical on the builder's necklace row. Splitting on `,` instead
      // is not the fix - §7 writes "if sleeve sword equipped, Circle Slash
      // damage is boosted..." as one clause, and splitting it would break the
      // RULES entry that claims it.
      //
      // So the clause check is a **residue over words**, the same device (a)
      // uses over numerals: strike every claim out of the cell and whatever
      // survives must carry no prose. That is shape-independent - it does not
      // care whether the unclaimed text arrived behind a semicolon, a comma,
      // a parenthesis or nothing at all.
      if (unclaimedWords(left).length > 0) {
        unclaimed.push(`${key}: unclaimed §7 clause - "${left.replace(/\s+/g, ' ').trim()}"`);
      }

      // Kept as well: a `;`-delimited fragment must be claimed *whole*. The
      // residue above would accept a claim that covered a clause word by word
      // across two rows; this says the clause is somebody's, entire.
      for (const frag of row.effect.split(';').map((t) => t.trim())) {
        if (frag === '') continue;
        const claimed = claims.some((c) => frag.includes(c) || c.includes(frag));
        if (!claimed) unclaimed.push(`${key}: unclaimed §7 clause - "${frag}"`);
      }
    }

    // And §7's prose outside the table: its preamble rules and its expansion
    // hook. Same rule - a figure stated there is still a §7 figure.
    const prose = SPEC_7_TEXT.split('\n')
      .filter((l) => !l.startsWith('|') && !l.startsWith('## '))
      .join('\n');
    const proseLeft = residue(prose, [...claimsFor(null), SPEC_SLOTS.join(', ')]);
    if (/\d/.test(proseLeft)) unclaimed.push(`§7 preamble: unclaimed figure - "${proseLeft.replace(/\s+/g, ' ').trim()}"`);

    // ...and the preamble's *clauses* too, which is where the old numerals-only
    // rule was weakest: QA appended "Equipment is lost on the Warden's death
    // and must be re-bought." to §7's preamble, did exactly what the hash
    // failure told them to do, and shipped a normative §7 rule that no row and
    // no RULES entry claims - green. A preamble sentence is now claimed by a
    // RULES entry or declared non-normative in PROSE_EXEMPT; silence is not an
    // option for either.
    for (const sentence of prose.replace(/\s+/g, ' ').split(/(?<=\.)\s+/)) {
      const t = sentence.trim();
      if (t === '') continue;
      const claimed = claimsFor(null).some((c) => t.includes(c.replace(/\s+/g, ' ')));
      const exempt = PROSE_EXEMPT.some((e) => t.startsWith(e.sentence));
      if (!claimed && !exempt) unclaimed.push(`§7 preamble: unclaimed clause - "${t}"`);
    }

    expect(unclaimed, 'SPEC-FINAL §7 states something this ledger does not audit').toEqual([]);
  });

  it('every non-numeric §7 clause is declared, quoted, and pointed at a live cover', () => {
    for (const r of RULES) {
      const where = r.item === null ? '§7 preamble' : r.item;
      // A cell rule must be in its own item's Effect cell; a preamble rule must
      // be in §7's text but *outside* the table, so a clause cannot be filed as
      // preamble to escape the per-cell coverage check.
      if (r.item === null) {
        expect(SPEC_7_TEXT, `${where}: §7 does not contain "${r.clause}"`).toContain(r.clause);
        expect(
          SPEC_TABLE.some((row) => row.effect.includes(r.clause)),
          `${where}: "${r.clause}" is a table cell clause, not a preamble rule`,
        ).toBe(false);
      } else {
        expect(specRowFor(r.item).effect, `${where}: §7's Effect cell does not contain "${r.clause}"`).toContain(
          r.clause,
        );
      }
      expect(
        existsSync(fileURLToPath(new URL(`../${r.coveredBy}`, import.meta.url))),
        `${where}: ${r.coveredBy} does not exist`,
      ).toBe(true);
      // The filename is not the pointer — the block inside it is. Without this,
      // the covering `describe` could be deleted and every entry stay green.
      expect(source(r.coveredBy), `${where}: ${r.coveredBy} no longer contains the block that covers this clause`).toMatch(
        r.anchor,
      );
      expect(r.why.trim().length, `${where}: no reason given`).toBeGreaterThan(20);
    }
    // And a rule may not be declared for a cell the ledger excused as empty —
    // that would be a mechanic hidden behind a `none`.
    const excused = new Set(NO_FIGURE.filter((n) => n.col === 'effect').map((n) => n.item));
    expect(
      [...new Set(RULES.map((r) => r.item))].filter((i) => i !== null && excused.has(i)),
      'RULES entry for a "none" cell',
    ).toEqual([]);
  });

  /* ------------------------------------------- c022: behavioural pointers */

  it('every §7 Effect row carries a behavioural pointer, and only Effect rows carry one', () => {
    for (const f of EFFECT_ROWS) {
      expect(f.behaviour, `${id(f)}: no behavioural pointer - which block proves this stat does anything?`).toBeDefined();
      expect(f.behaviour!.why.trim().length, `${id(f)}: no reason given for the pointer`).toBeGreaterThan(20);
    }
    // A numeric row is pinned by `NUMERIC_STAT` instead, which is stronger:
    // one declared key per column for all twelve items. A pointer there would
    // read as a second, weaker authority for the same claim.
    expect(
      LEDGER.filter((f) => f.col !== 'effect' && f.behaviour !== undefined).map(id),
      'a numeric row with a behavioural pointer - NUMERIC_STAT already pins its key',
    ).toEqual([]);
    // The roster is 13 rows across 9 items; a 14th Effect row (fb056) has to
    // land here deliberately rather than inherit somebody else's cover.
    expect(EFFECT_ROWS).toHaveLength(13);
  });

  it("each Effect row's pointer names exactly one live block, and that block reads the row's own stat", () => {
    for (const f of EFFECT_ROWS) {
      const b = f.behaviour!;
      expect(
        existsSync(fileURLToPath(new URL(`../${b.coveredBy}`, import.meta.url))),
        `${id(f)}: ${b.coveredBy} does not exist`,
      ).toBe(true);
      // The five rules a pointer must satisfy live in `equip-spec-ledger.ts`
      // with the reader (c028, code review): each is a mutation that got past
      // an earlier draft, and a ledger that re-implements the loop keeps only
      // the ones its author noticed. §7 keeps the row identity in the message.
      expect(
        pointerProblems(blockBody(b.coveredBy, b.anchor), readsFor(f)),
        `${id(f)}: the pointer at "${b.anchor.source}"`,
      ).toEqual([]);
    }
  });

  it('a pointer may only skip the stat-key check on the declared row, and only that row has no stat', () => {
    expect(
      EFFECT_ROWS.filter((f) => f.behaviour!.reads !== undefined).map(id).sort(),
      'an undeclared `reads` override - the one way this check can be loosened',
    ).toEqual([...READS_OVERRIDES].sort());
    // And the reason the exemption exists is itself asserted, so it cannot
    // outlive its cause: the row is exempt *because* it has no stat key.
    for (const f of EFFECT_ROWS.filter((x) => READS_OVERRIDES.includes(id(x)))) {
      expect(f.stat, `${id(f)}: exempt from the stat-key check but it has a stat key`).toBeNull();
      expect(f.status.kind, `${id(f)}: a stat-less row that is not in_code`).toBe('in_code');
    }
    // The converse: every other row does have one, so `defaultReads` never
    // dereferences a null.
    for (const f of EFFECT_ROWS.filter((x) => !READS_OVERRIDES.includes(id(x)))) {
      expect(f.stat, `${id(f)}: no stat and no declared override`).not.toBeNull();
    }
  });

  it('re-pointing an Effect row at a stat no equipment authors is red, not green - the c022 mutation', () => {
    // The mutation QA measured on c012: move `normal_necklace`'s -0.2 from
    // `towerCost` to `goldFind` in `/data` **and** edit this row's `stat` to
    // match. Every other device in this file stays green - the figure is
    // still -0.2, the quote still says -20%, the cell is still claimed. What
    // is now red is the pointer: no covering block reads `goldFind`.
    //
    // The `reads` check above already catches that row. This one generalises
    // it to the whole unauthored half of `STAT_KEYS`, so the barrier does not
    // depend on which key a mutation happens to pick.
    expect(MUTATION_DECOYS.length, 'every StatKey is authored on some item - there is no decoy left').toBeGreaterThan(5);
    for (const f of EFFECT_ROWS) {
      const { body } = blockBody(f.behaviour!.coveredBy, f.behaviour!.anchor);
      // Negative controls are exempt, and QA is why: adding
      // `expect(wWith.derived.goldFindMul).toBeCloseTo(wNone.derived.goldFindMul)`
      // to the towerCost block — an assertion that the discount does *not*
      // leak into gold find, which is exactly the kind of control this ledger
      // asks for elsewhere — reddened this row. A rule that punishes proving a
      // decoy unaffected is a rule that gets deleted the first time someone
      // strengthens a block.
      // §7's covers name their control world `wNone`; the shape is this
      // suite's convention, not a language rule, so it is named here rather
      // than baked into the shared module (c027's §4 covers name theirs
      // `full`, `plain`, `both`, ...).
      const positive = positiveLines(body, /toBeCloseTo\(w[A-Za-z]*\./);
      for (const decoy of MUTATION_DECOYS) {
        expect(
          positive,
          `${id(f)}: its covering block reads ${decoy}, so re-pointing the row there would stay green`,
        ).not.toMatch(readsStat(decoy));
      }
    }
    // An exemption may only excuse a name `/src` really exports as something
    // other than the stat, and it must say which.
    for (const [key, why] of Object.entries(DECOY_EXEMPT)) {
      expect(STAT_KEYS, `DECOY_EXEMPT excuses "${key}", which is not a StatKey`).toContain(key);
      expect(AUTHORED_STATS, `DECOY_EXEMPT excuses "${key}", which equipment authors - it is audited, not a decoy`).not.toContain(key);
      expect(why.trim().length, `DECOY_EXEMPT["${key}"]: no reason given`).toBeGreaterThan(20);
    }
  });

  it("the device's own self-tests live with the device, in tests/equip-spec-ledger.test.ts", () => {
    // c028 moved the reader, the `reads` default and the decoy derivation into
    // `tests/equip-spec-ledger.ts`, and their synthetic-source self-tests with them.
    // This row is the pointer, so the move cannot quietly become a deletion:
    // the same shape `RULES.anchor` uses on `/src`.
    // Through the device itself, not as a prose substring: code review put
    // `describe.skip(` on that file and this row stayed green with all five
    // self-tests disarmed — the exact hole c022 closed for its own rows.
    const self = blockBody('tests/equip-spec-ledger.test.ts', /the block reader stops at its own block, on synthetic source/);
    expect(self.matches, "the device's self-tests are gone — the reader is unguarded").toBe(1);
    expect(
      self.ancestors.filter((a) => /\.(skip|todo)\(/.test(a)),
      "the device's self-tests sit inside a skipped describe",
    ).toEqual([]);
  });

  it("SPEC-FINAL §7's own text is the version this ledger was read from", () => {
    // The table parse holds `spec` to the spec; this holds the spec to the
    // version it was read at. Together they mean a figure can only move by a
    // deliberate, visible edit — §17 keeps the owner table open to veto.
    expect(SPEC_7_TEXT.startsWith('## 7. Equipment'), 'the §7 slice does not start at §7').toBe(true);
    expect(SPEC_7_TEXT, 'the §7 slice does not reach the expansion hook').toContain('Expansion hook');
    expect(
      createHash('sha256').update(SPEC_7_TEXT, 'utf8').digest('hex'),
      'SPEC-FINAL §7 changed — re-read it against this ledger, then update this hash',
    ).toBe(SPEC_7_SHA256);
  });

  it('§7’s table parses to exactly the twelve owner rows, with a numeric value in all five columns', () => {
    // If the parser ever silently returned nothing, every numeric row's `spec`
    // check would throw rather than pass — but the roster size is worth its own
    // assertion, because a *dropped* row would otherwise surface as one item's
    // five rows failing, which reads like a data bug rather than a parse bug.
    expect(SPEC_TABLE).toHaveLength(12);
    expect(SPEC_TABLE.map((r) => r.name).sort()).toEqual(Object.values(SPEC_NAME).sort());
    for (const r of SPEC_TABLE) {
      for (const col of NUMERIC_COLS) {
        expect(Number.isFinite(r.cells[col]), `§7 ${r.name}: ${col} is not a number`).toBe(true);
      }
      expect(r.effect.length, `§7 ${r.name}: empty Effect cell`).toBeGreaterThan(0);
    }
  });

  it("§7's Slot column and its slot list both agree with data/equipment.json", () => {
    // §7's header names the six slots; its table repeats them per row, in the
    // singular for one of them. Both halves are checked, and the one divergence
    // is a declared alias rather than a shrug.
    //
    // The header list is *parsed*, not retyped: a hardcoded expectation here
    // would reproduce the very shape c012 exists to remove, and a
    // `toContain(slot)` check against §7's whole text proves nothing — every
    // slot name also appears in the table body.
    expect(RAW.slots, "§7's slot list, in order").toEqual(SPEC_SLOTS);
    for (const item of RAW.items) {
      const specSlot = specRowFor(item.key).slot;
      expect(SLOT_ALIAS[specSlot] ?? specSlot, `${item.key}: §7 puts it in the "${specSlot}" slot`).toBe(item.slot);
    }
    // The alias table may not paper over a slot §7 could have spelled right.
    for (const [from, to] of Object.entries(SLOT_ALIAS)) {
      expect(RAW.slots, `SLOT_ALIAS maps "${from}" to a slot that does not exist`).toContain(to);
      expect(RAW.slots, `SLOT_ALIAS excuses "${from}", which is a real slot name`).not.toContain(from);
    }
  });

  it('the loaded content and data/equipment.json agree at every ledger row', () => {
    // Rows are read out of `loadContent()` — what the sim runs on — while the
    // liveness check below mutates the raw document. This is the bridge that
    // makes the second a statement about the first.
    for (const f of DATA_HOMED) {
      expect(readLoaded(f), `${id(f)}: loader and raw document disagree`).toBeCloseTo(readFrom(RAW, f)!, 10);
    }
  });

  it('each data-homed figure reads its own field, and no other row reads it too', () => {
    // Without this the ledger could assert nothing at all: a typo'd stat key
    // reads 0 — the same value a third of the rows legitimately expect — and
    // two rows sharing a field would mean deleting it reddens only one.
    //
    // The bump *creates* the key when it is absent, which is what makes the
    // zero-rows real assertions: authoring `maxHp: 1` on the greatsword moves
    // the greatsword's HP row off §7's 0.
    for (const target of DATA_HOMED) {
      const doc = JSON.parse(JSON.stringify(RAW)) as RawEquipmentDoc;
      const item = doc.items.find((i) => i.key === target.item);
      expect(item, `${id(target)}: no such item row`).toBeDefined();
      const bag =
        target.bag === 'fallback'
          ? (item!.classFallback?.mods as Record<string, number> | undefined)
          : (item!.mods ??= {});
      expect(bag, `${id(target)}: ${target.item} has no ${target.bag ?? 'mods'} bag`).toBeTypeOf('object');
      bag![target.stat!] = (bag![target.stat!] ?? 0) + 1;

      const moved = DATA_HOMED.filter((f) => {
        const now = readFrom(doc, f);
        const was = readFrom(RAW, f);
        return now === undefined || was === undefined ? now !== was : Math.abs(now - was) > 1e-12;
      });
      expect(
        moved.map(id),
        `bumping ${target.item}.${target.bag ?? 'mods'}.${target.stat} moved the wrong set of rows`,
      ).toEqual([id(target)]);
    }
  });

  it('no item authors a mods column the ledger has no row for', () => {
    // The mutation check proves each row reads its own field; this proves the
    // converse — that no authored field goes unread. Without it, `fb056` could
    // add a stat to a shipped item and the ledger would stay green while
    // auditing a subset. It is the one guarantee `EXPECTED_ITEM_MODS`' key-set
    // assertion does give, kept, but held against §7 instead of against itself.
    const read = new Set(DATA_HOMED.map((f) => `${f.item}.${f.bag ?? 'mods'}.${f.stat}`));
    const unread: string[] = [];
    for (const item of RAW.items) {
      for (const k of Object.keys(item.mods ?? {})) {
        if (!read.has(`${item.key}.mods.${k}`)) unread.push(`${item.key}.mods.${k}`);
      }
      for (const k of Object.keys(item.classFallback?.mods ?? {})) {
        if (!read.has(`${item.key}.fallback.${k}`)) unread.push(`${item.key}.fallback.${k}`);
      }
    }
    expect(unread, 'an authored equipment stat that no §7 ledger row audits').toEqual([]);
  });

  it('census: 72 match · 0 retuned · 1 in code', () => {
    // The census is the barrier c012 exists to put up: a new drift cannot be
    // absorbed into an existing status, and closing the one rule-4 literal has
    // to be recorded here rather than passing unnoticed. The 15 items `fb056`
    // adds will move these counts, deliberately.
    const census: Record<Status['kind'], number> = { match: 0, retuned: 0, in_code: 0 };
    for (const f of LEDGER) census[f.status.kind] += 1;
    expect(census).toEqual({ match: 72, retuned: 0, in_code: 1 });
    expect(LEDGER).toHaveLength(73);
    // 12 items x 5 numeric columns, every one of them a row.
    expect(LEDGER.filter((f) => f.col !== 'effect')).toHaveLength(60);
    // c012's own wording: "the three `classFallback` compensation lines are
    // rows of their own" — and the roster of items carrying one is pinned too,
    // so a fourth fallback line cannot arrive unaudited.
    expect(LEDGER.filter((f) => f.bag === 'fallback').map((f) => f.item)).toEqual([
      'sleeve_sword',
      'swordsman_armor',
      'swordsman_shoes',
    ]);
    expect(RAW.items.filter((i) => i.classFallback).map((i) => i.key)).toEqual([
      'sleeve_sword',
      'swordsman_armor',
      'swordsman_shoes',
    ]);
  });

  it('every authorised deviation names a backlog item or Q-number that can be looked up', () => {
    // The loop body does not run today — no row is `retuned`, by construction:
    // every §7 figure matches. That makes the guard a placeholder for the first
    // `fb056`-era tune, so it is exercised against synthetic rows below rather
    // than left as a green loop over an empty set.
    for (const f of LEDGER) {
      if (f.status.kind !== 'retuned') continue;
      expect(authorisationIsNamed(f.status), `${id(f)}: authorisation names no item/Q id`).toBe(true);
      expect(authorisationResolves(f.status), `${id(f)}: authorisation names an id that does not exist`).toBe(true);
      expect(f.status.why.trim().length, `${id(f)}: authorisation carries no reason`).toBeGreaterThan(0);
    }
  });

  it('the retuned guard is not vacuous: it accepts a real id and rejects prose or a fabricated one', () => {
    // Without this, the check above is a loop over zero rows - green, and
    // untested on the day it first matters. A prose rationale with no id is
    // exactly the state c008/c012 replace, so the guard is shown rejecting one.
    expect(authorisationIsNamed({ authorised: 'c012: measured against the table' })).toBe(true);
    expect(authorisationIsNamed({ authorised: 'Q136(1), owner verdict approved' })).toBe(true);
    expect(authorisationIsNamed({ authorised: 'fb056, the equipment epic' })).toBe(true);
    expect(authorisationIsNamed({ authorised: 'p10s (PROGRESS.md)' })).toBe(true);
    expect(authorisationIsNamed({ authorised: 'the owner asked for it in a playtest' })).toBe(false);
    expect(authorisationIsNamed({ authorised: '' })).toBe(false);
    // ...and it accepts the id families the old shape rejected. Each of these
    // has exactly one column-0 item line in a BACKLOG file today; QA measured
    // that the previous shape turned away 131 of the repo's 263 real ids, so a
    // retune authorised by `b076` could not have been stated at all.
    for (const real of ['b076', 'q45', 'm20a', 't4', 'f001', 'x001', 'c008']) {
      expect(authorisationIsNamed({ authorised: real }), `${real}: shape rejects a real id`).toBe(true);
      expect(authorisationResolves({ authorised: real }), `${real}: does not resolve`).toBe(true);
    }

    // ...and the shape guard alone is not enough: QA authorised a real
    // greatsword drift with `Q9999 / c999` and the ledger took it.
    expect(authorisationResolves({ authorised: 'Q136(1), owner verdict approved' })).toBe(true);
    expect(authorisationResolves({ authorised: 'c012' })).toBe(true);
    expect(authorisationResolves({ authorised: 'Q9999 / c999' })).toBe(false);
    // A real id does not launder a fabricated one sitting beside it.
    expect(authorisationResolves({ authorised: 'Q136 and Q9999' })).toBe(false);
    expect(authorisationResolves({ authorised: 'the owner asked for it in a playtest' })).toBe(false);
  });

  it('the clause check cannot be widened into silence without saying so', () => {
    // The clause rule's one soft spot, found by mutating this file rather than
    // the spec: it decides "is there prose left?" by subtracting CONNECTIVES,
    // so *adding* the words of a clause to that set makes the clause vanish.
    // Adding 'boostable','upgrades','count','multiplier' turns the builder's
    // necklace parenthetical back into silence with everything else green -
    // the `;` split cannot help, because the parenthetical rides inside the
    // same fragment as the claim that covers it.
    //
    // No assertion can stop that edit, exactly as no assertion can tell an
    // owner retune from a laundered drift. What it can do is make it *visible*
    // rather than a one-token change nobody reads: the set is pinned, so
    // growing it is a diff on this line with this comment attached to it.
    expect([...CONNECTIVES].sort()).toEqual(
      ['a', 'also', 'and', 'if', 'instead', 'is', 'not', 'now', 'so', 'the', 'to'],
    );
    // ...and every member is a closed-class function word, never a term §7
    // could state a mechanic with.
    for (const w of CONNECTIVES) expect(w.length, `${w}: too long to be a function word`).toBeLessThanOrEqual(7);

    // The rule itself, on synthetic text, so it is not tested only through the
    // §7 the repo ships today.
    expect(unclaimedWords('  and if so  ')).toEqual([]);
    expect(unclaimedWords(' (does not stack with the Animist regen aura)')).toContain('stack');
    expect(unclaimedWords(', and the ring cannot be unequipped once a wave has started')).toContain('unequipped');
    expect(unclaimedWords(' +10% ')).toEqual([]);
  });


  it('a mention is not a definition, and an indented or inline one is still a mention', () => {
    // The defect this file found in itself. The resolver first searched the
    // corpus for the bare token, so c012's own Log paragraph - which quotes
    // `Q9999 / c999` only in order to call them fabricated - *defined* both
    // ids. The first fix moved to a definition site but left the patterns
    // unanchored, which QA showed was the same bug one indent in.
    //
    // Asserted against **literal strings**, not against the repo's prose. An
    // earlier draft asked the live corpus whether `Q9999` was mentioned-but-
    // undefined, which made three assertions load-bearing on one sentence of
    // an uncommitted Log entry: rewording it - a pure documentation edit -
    // reddened the ledger, with no message saying why.
    expect(definesIn('- [ ] (c999) [bug] a filed item', 'c999')).toBe(true);
    expect(definesIn('- [x] (p10s) [feat] a done item', 'p10s')).toBe(true);
    expect(definesIn('- **Q9999. an entry** ...', 'Q9999')).toBe(true);
    expect(definesIn('- **Q9999:** an entry', 'Q9999')).toBe(true);
    // Prose about an id, in every shape this repo's Logs actually write it.
    expect(definesIn('QA authorised a real drift with `Q9999 / c999` and it took it', 'c999')).toBe(false);
    expect(definesIn('- refs: SPEC-FINAL 7, c999, QA on c012.', 'c999')).toBe(false);
    // ...including a quotation of the definition shape itself, indented under
    // a Log bullet or inlined mid-sentence.
    expect(definesIn('- **verbatim, as filed**:\n  - [ ] (c999) [bug] fake', 'c999')).toBe(false);
    expect(definesIn('see - [ ] (c999) above', 'c999')).toBe(false);
    expect(definesIn('- **Note:** ids **Q9999:** were fake.', 'Q9999')).toBe(false);

    // And against the live corpus: the two ids the ledger's own paper trail
    // quotes are mentioned there and defined nowhere, which is the whole
    // point - `authorisationResolves` must keep rejecting them however often
    // this file writes them down.
    expect(definedAt('Q9999')).toEqual([]);
    expect(definedAt('c999')).toEqual([]);
    // A real id resolves at its definition site, not at its many mentions.
    // Pinned as non-empty rather than to a filename: `c012` sits in a lane
    // file that CLAUDE.md's lane rule folds back into BACKLOG.md at the merge,
    // so pinning the file would schedule a failure that means nothing.
    expect(definedAt('c012').length, 'c012 has no item line').toBeGreaterThan(0);
    expect(definedAt('Q136'), 'Q136 is a QUESTIONS entry').toEqual(['QUESTIONS.md']);
    // The roster is derived, so a new lane file is searched without an edit.
    expect(DEFINITION_FILES).toContain('BACKLOG-QUALITY.md');
    expect(DEFINITION_FILES).toContain('BACKLOG-TUNER.md');
  });
});

/* ----------------------------------------------------------- three riders */

/**
 * §7 states two of its numbers as a **product** — "(so 1.2×1.2)", "(so
 * 1.1×1.5)" — which no single ledger row can hold without two rows reading one
 * authored field. They are asserted here instead, against the composed
 * `derived.attackSpeedMul` a non-Swordsman actually runs on, with the factors
 * read back out of §7's own text rather than retyped.
 */
/**
 * An item's (or several items') contribution to `attackSpeedMul`, **against a
 * no-equipment control of the same class**. Neither `engineer` nor
 * `swordsman` authors `attackSpeed` today, so the absolute figure happens to
 * equal the ratio — but class kits are ⚖-tunable, and a class retune must not
 * redden an *equipment* ledger. CLAUDE.md's control-run rule, applied to an
 * assertion rather than to a sweep. Module-scope (not `c012`'s original
 * describe-local placement) so `c035`'s joint describe block below can share
 * it rather than duplicating it.
 */
function equipmentAttackSpeedFactor(classKey: string, items: string | readonly string[]): number {
  const equipment = Array.isArray(items) ? items : [items];
  const control = new World(cfg({ classKey, equipment: [] }));
  const withItems = new World(cfg({ classKey, equipment }));
  return withItems.derived.attackSpeedMul / control.derived.attackSpeedMul;
}

describe('c012 — the two §7 figures stated as a composition', () => {

  it('Sleeve Sword on a non-Swordsman composes to §7’s 1.2x1.2', () => {
    const quoted = /\(so ([\d.]+)×([\d.]+)\)/.exec(specRowFor('sleeve_sword').effect);
    expect(quoted, '§7 no longer states Sleeve Sword’s product').not.toBeNull();
    const product = Number(quoted![1]) * Number(quoted![2]);
    expect(product).toBeCloseTo(1.44, 10);
    expect(
      equipmentAttackSpeedFactor('engineer', 'sleeve_sword'),
      '§7: the column x1.2 and the fallback x1.2 multiply',
    ).toBeCloseTo(product, 10);
  });

  it('Swordsman Armor on a non-Swordsman composes to §7’s 1.1x1.5', () => {
    const quoted = /\(so ([\d.]+)×([\d.]+)\)/.exec(specRowFor('swordsman_armor').effect);
    expect(quoted, '§7 no longer states Swordsman Armor’s product').not.toBeNull();
    const product = Number(quoted![1]) * Number(quoted![2]);
    expect(product).toBeCloseTo(1.65, 10);
    expect(
      equipmentAttackSpeedFactor('engineer', 'swordsman_armor'),
      '§7: the column x1.1 and the fallback x1.5 multiply',
    ).toBeCloseTo(product, 10);
  });

  it('and both withhold the fallback from the Swordsman itself', () => {
    // The other half of §7's "class-conditional lines are inert elsewhere
    // unless a fallback is written" — without this, the products above could be
    // met by a fallback that applied to everyone. The expected factor is the
    // item's own AtkSpd column, read from §7's table rather than retyped.
    for (const key of ['sleeve_sword', 'swordsman_armor'] as const) {
      const column = specRowFor(key).cells.atkspd;
      expect(
        equipmentAttackSpeedFactor('swordsman', key),
        `${key}: the Swordsman gets §7's column (x${column}) and no fallback`,
      ).toBeCloseTo(column, 10);
    }
  });

  /**
   * c035 — the three Swordsman-locked fallbacks proven **jointly**, not only
   * individually. Every combined-equip case anywhere in the suite
   * (`tests/fb015-equipment.test.ts`) equips one item at a time; the only
   * multi-equip case is `classKey: 'swordsman'`, the in-class synergy — never
   * the off-class fallback. §2's stacking rule says each equipped item is its
   * own source and sources multiply, so a non-Swordsman wearing Sleeve Sword
   * *and* Swordsman Armor should read `1.2×1.2 × 1.1×1.5 = 1.44 × 1.65 =
   * 2.376`; a real bug shape this cannot see today (an accidental
   * last-write-wins on `attackSpeed` instead of a running product) would pass
   * every existing single-item test.
   */
  function equipmentAttackSpeedFactorMulti(classKey: string, items: readonly string[]): number {
    const control = new World(cfg({ classKey, equipment: [] }));
    const withItems = new World(cfg({ classKey, equipment: [...items] }));
    return withItems.derived.attackSpeedMul / control.derived.attackSpeedMul;
  }

  /** Same shape, for the move-speed fallback (`swordsman_shoes`, §7's x1.1). */
  function equipmentMoveSpeedFactorMulti(classKey: string, items: readonly string[]): number {
    const control = new World(cfg({ classKey, equipment: [] }));
    const withItems = new World(cfg({ classKey, equipment: [...items] }));
    return withItems.derived.moveSpeed / control.derived.moveSpeed;
  }

  it('c035: Sleeve Sword + Swordsman Armor together, on a non-Swordsman, compose to the product of both §7 figures', () => {
    for (const classKey of ['engineer', 'cryomancer']) {
      const sleeveOnly = equipmentAttackSpeedFactor(classKey, 'sleeve_sword');
      const armorOnly = equipmentAttackSpeedFactor(classKey, 'swordsman_armor');
      expect(
        equipmentAttackSpeedFactorMulti(classKey, ['sleeve_sword', 'swordsman_armor']),
        `${classKey}: two independent §7 sources multiply (1.44 x 1.65 = 2.376), not add or overwrite`,
      ).toBeCloseTo(sleeveOnly * armorOnly, 10);
    }
  });

  it('c035: all three Swordsman-locked items together, on a non-Swordsman, carry both the attack-speed product and the shoes’ movement fallback at once', () => {
    const classKey = 'engineer';
    const items = ['sleeve_sword', 'swordsman_armor', 'swordsman_shoes'] as const;
    const sleeveOnly = equipmentAttackSpeedFactor(classKey, 'sleeve_sword');
    const armorOnly = equipmentAttackSpeedFactor(classKey, 'swordsman_armor');
    const shoesAtkSpdOnly = equipmentAttackSpeedFactor(classKey, 'swordsman_shoes');
    expect(
      equipmentAttackSpeedFactorMulti(classKey, items),
      'three independent §7 sources multiply — Sleeve Sword, Swordsman Armor and Swordsman Shoes’ own atk-speed column',
    ).toBeCloseTo(sleeveOnly * armorOnly * shoesAtkSpdOnly, 10);

    const shoesMoveOnly = equipmentMoveSpeedFactorMulti(classKey, ['swordsman_shoes']);
    expect(
      equipmentMoveSpeedFactorMulti(classKey, items),
      'the shoes’ movement contribution still applies wearing all three, and nothing else in the trio touches movement',
    ).toBeCloseTo(shoesMoveOnly, 10);
    // §7's own Move column (×2, unconditional) and the fallback figure
    // (×1.1, non-Swordsman only) are two independent sources that multiply —
    // read off the ledger row above rather than retyped, so a retune of
    // either moves this test too. Swordsman's own column-only reading (no
    // fallback) is the baseline that isolates the fallback's own factor,
    // the same device the attack-speed block above uses.
    const shoesFallbackQuoted = /×([\d.]+) movement/.exec(specRowFor('swordsman_shoes').effect);
    expect(shoesFallbackQuoted, '§7 no longer states Swordsman Shoes’ movement fallback').not.toBeNull();
    const columnOnly = equipmentMoveSpeedFactorMulti('swordsman', ['swordsman_shoes']);
    expect(columnOnly, "§7's Move column for Swordsman Shoes is x2").toBeCloseTo(specRowFor('swordsman_shoes').cells.move, 10);
    expect(
      shoesMoveOnly,
      'non-Swordsman move factor = the unconditional column x the classFallback figure',
    ).toBeCloseTo(columnOnly * Number(shoesFallbackQuoted![1]), 10);
  });

  it('c035: proven live, not vacuous — a mutated single-item factor changes the joint product by the same factor', () => {
    // A same-shape control the way c022/c028's devices insist on: this isn't
    // asserting "some number changed", it is asserting the multi-item helper
    // actually composes the single-item ones rather than reading a cached or
    // unrelated figure. Perturbing one single-item reading and re-deriving
    // the expected joint value must track it.
    const classKey = 'engineer';
    const sleeveOnly = equipmentAttackSpeedFactor(classKey, 'sleeve_sword');
    const armorOnly = equipmentAttackSpeedFactor(classKey, 'swordsman_armor');
    const perturbed = sleeveOnly * 1.05;
    const joint = equipmentAttackSpeedFactorMulti(classKey, ['sleeve_sword', 'swordsman_armor']);
    expect(joint).not.toBeCloseTo(perturbed * armorOnly, 6);
    expect(joint).toBeCloseTo(sleeveOnly * armorOnly, 10);
  });
});

/**
 * c035 — the three Swordsman-locked items' off-class fallbacks, proven
 * *jointly* rather than one at a time. `equipmentAttackSpeedFactor` above
 * proves `sleeve_sword` alone composes to 1.2×1.2 and `swordsman_armor` alone
 * to 1.1×1.5, and `tests/fb015-equipment.test.ts` (out of this lane's Scope)
 * loops every `classFallback` item with exactly one equipped — but nothing
 * anywhere equips two or three of `sleeve_sword`/`swordsman_armor`/
 * `swordsman_shoes` together on a *non*-Swordsman (the one existing combined
 * case, `fb015.test.ts`'s `['sleeve_sword', 'swordsman_shoes']`, is on the
 * default `swordsman` class — the in-class synergy, not the off-class
 * fallback these three items also carry). `Stats.factor` (`stats.ts`)
 * multiplies every source in sorted-key order regardless of which item it
 * came from, so the mechanism itself does not care how many items are
 * equipped — but a per-item stacking bug (e.g. a last-write-wins bag keyed
 * by stat rather than by source) would still pass every single-item test
 * here and only show up once two sources land on the same stat at once.
 */
describe('c035 — the three Swordsman-locked items compose jointly, not just one at a time', () => {
  /** `equipmentAttackSpeedFactor`'s `moveSpeedPct` twin, for Swordsman Shoes' movement fallback. */
  function equipmentMoveSpeedFactor(classKey: string, items: string | readonly string[]): number {
    const equipment = Array.isArray(items) ? items : [items];
    const control = new World(cfg({ classKey, equipment: [] }));
    const withItems = new World(cfg({ classKey, equipment }));
    return withItems.derived.moveSpeed / control.derived.moveSpeed;
  }

  it('Sleeve Sword + Swordsman Armor on a non-Swordsman compose to (1.2x1.2) x (1.1x1.5) = 2.376', () => {
    // Each item's own §7 column composes with the other's — not with its own
    // fallback overwriting the first item's, and not the two fallbacks
    // averaging or replacing one another. Read as two independently-verified
    // per-item factors multiplied together, so a retune to either item's
    // authored numbers moves this row with it rather than silently drifting.
    const sleeveAlone = equipmentAttackSpeedFactor('engineer', 'sleeve_sword');
    const armorAlone = equipmentAttackSpeedFactor('engineer', 'swordsman_armor');
    const both = equipmentAttackSpeedFactor('engineer', ['sleeve_sword', 'swordsman_armor']);
    expect(both, 'the two items\' factors did not multiply — a stacking bug would read additive or last-write-wins here').toBeCloseTo(
      sleeveAlone * armorAlone,
      10,
    );
    expect(both).toBeCloseTo(2.376, 10);
  });

  it('all three items on a non-Swordsman compose the attack-speed product and carry the shoes\' movement fallback at once', () => {
    const items = ['sleeve_sword', 'swordsman_armor', 'swordsman_shoes'] as const;
    const atkSpeed = equipmentAttackSpeedFactor('cryomancer', items);
    // Swordsman Shoes has no classFallback on `attackSpeed` (only its own
    // column contributes there), so the three-item product is the
    // two-item product above times the shoes' own AtkSpd column alone.
    const shoesOwnAtkSpeed = specRowFor('swordsman_shoes').cells.atkspd;
    expect(atkSpeed).toBeCloseTo(2.376 * shoesOwnAtkSpeed, 10);

    // And simultaneously — same World, same equip list — the shoes' own
    // Move column and its classFallback both land on `moveSpeedPct`, which
    // composes exactly as `attackSpeed` does (the same `Stats.factor`).
    // Unlike the two atk-speed items, §7 states the shoes' movement fallback
    // as a single factor (`ledger row: "if not Swordsman: x1.1 movement"`,
    // no "(so X×Y)" composite quote for this one), so both halves are read
    // off `/data` directly rather than parsed out of a product that isn't
    // stated in prose.
    const moveSpeed = equipmentMoveSpeedFactor('cryomancer', items);
    const shoes = content.equipment.items.find((i) => i.key === 'swordsman_shoes')!;
    const shoesOwnMove = 1 + shoes.mods.moveSpeedPct!;
    const shoesFallbackMove = 1 + shoes.classFallback!.mods.moveSpeedPct!;
    expect(specRowFor('swordsman_shoes').cells.move, 'the ledger\'s Move column drifted from /data').toBeCloseTo(
      shoesOwnMove,
      10,
    );
    expect(moveSpeed).toBeCloseTo(shoesOwnMove * shoesFallbackMove, 10);
    expect(moveSpeed).toBeCloseTo(2 * 1.1, 10);
  });

  it('the joint case still withholds every fallback from the Swordsman itself, with all three equipped at once', () => {
    const items = ['sleeve_sword', 'swordsman_armor', 'swordsman_shoes'] as const;
    const atkSpeed = equipmentAttackSpeedFactor('swordsman', items);
    const expectedAtkSpeed =
      specRowFor('sleeve_sword').cells.atkspd * specRowFor('swordsman_armor').cells.atkspd * specRowFor('swordsman_shoes').cells.atkspd;
    expect(atkSpeed, 'a Swordsman wearing all three got a fallback that should only apply off-class').toBeCloseTo(
      expectedAtkSpeed,
      10,
    );
    const moveSpeed = equipmentMoveSpeedFactor('swordsman', items);
    expect(moveSpeed, 'a Swordsman got the shoes’ off-class movement fallback').toBeCloseTo(
      specRowFor('swordsman_shoes').cells.move,
      10,
    );
  });
});

/**
 * Each item's `desc` is a **second copy** of the same §7 figures, written for
 * the player ("HP 0 / Atk 10 / Def 5, atk speed x0.9"), and nothing bound it to
 * the first: `q7-loader-holes.ts` marks `equipment.items[].desc` `open`, and no
 * test read those numerals. c015 set this precedent in this lane for class
 * descriptions — the same drift, one file over — and `fb056` is about to author
 * 15 more descs by hand.
 *
 * The presence rule is part of the audit, not just the values: §7's `×1`
 * columns are the ones the descs omit, so "states the figure iff §7 states
 * anything but the identity" is checkable in both directions. A desc that
 * quietly dropped its `atk speed x1.2` would otherwise pass a values-only
 * check.
 */
describe('c012 — each item’s desc states §7’s own figures', () => {
  for (const item of RAW.items) {
    it(`${item.key} — desc HP/Atk/Def and the x-multipliers match §7`, () => {
      const desc = String(item.desc);
      const row = specRowFor(item.key);

      // `-?\d+(?:\.\d+)?`, never `[\d.]+`: the descs end these figures with a
      // sentence period ("Def 10."), and a greedy character class swallows it
      // into the capture, so `Number()` yields NaN and the row asserts nothing
      // it can pass. (Caught by this file's own first run.)
      const points = /HP (-?\d+(?:\.\d+)?) \/ Atk (-?\d+(?:\.\d+)?) \/ Def (-?\d+(?:\.\d+)?)/.exec(desc);
      expect(points, `${item.key}: desc states no "HP a / Atk b / Def c" line`).not.toBeNull();
      // fb164: `numberScale` divides every HP/damage-denominated stat at
      // load, and the desc now quotes the *loaded* magnitude (what the sim
      // actually runs on) rather than restating §7's authored figure — the
      // same narrowing `tests/class-descriptions.test.ts`'s c015 ledger
      // documents for `flameDps`. HP (`maxHp`) and Atk (`atkFlat`) are both
      // scaled; Def (`armor`) is not.
      const hpFactor = STAT_SCALED.maxHp ? content.modifiers.numberScale : 1;
      const atkFactor = STAT_SCALED.atkFlat ? content.modifiers.numberScale : 1;
      expect(Number(points![1]), `${item.key}: §7's HP is ${row.cells.hp}`).toBeCloseTo(row.cells.hp * hpFactor, 10);
      expect(Number(points![2]), `${item.key}: §7's Atk is ${row.cells.atk}`).toBeCloseTo(
        row.cells.atk * atkFactor,
        10,
      );
      expect(Number(points![3]), `${item.key}: §7's Def is ${row.cells.def}`).toBeCloseTo(row.cells.def, 10);

      // The two `×n` columns are read out of the desc's **stats clause** only
      // — from the HP/Atk/Def line to the sentence that ends it — never out of
      // the whole desc. Sleeve Sword states `atk speed x1.2` twice, once as its
      // column and once in its "If not Swordsman" sentence, so a whole-desc
      // search is satisfied by the wrong one: deleting the column outright left
      // this suite green until the clause was narrowed. (Measured, not
      // theorised — it was mutation N3.)
      const from = desc.indexOf(points![0]);
      const rest = desc.slice(from);
      // A period that ends a sentence, not the one inside `x0.9`: the decimal
      // point is followed by a digit, this one by whitespace or end-of-string.
      const ends = /\.(\s|$)/.exec(rest);
      const statsClause = rest.slice(0, ends ? ends.index : rest.length);

      // The two `×n` columns, stated in the descs as `atk speed x1.2` / `move
      // x2` and omitted entirely when §7's cell is the identity.
      for (const [col, label, pattern] of [
        ['atkspd', 'atk speed', /atk speed x(\d+(?:\.\d+)?)/],
        ['move', 'move', /\bmove x(\d+(?:\.\d+)?)/],
      ] as const) {
        const cell = row.cells[col];
        const m = pattern.exec(statsClause);
        if (cell === 1) {
          expect(m, `${item.key}: §7's ${label} is x1, so the stats clause should not state one`).toBeNull();
        } else {
          expect(m, `${item.key}: §7's ${label} is x${cell}, and the desc's stats clause states none`).not.toBeNull();
          expect(Number(m![1]), `${item.key}: §7's ${label} is x${cell}`).toBeCloseTo(cell, 10);
        }
      }
    });
  }

  for (const item of RAW.items) {
    const rows = LEDGER.filter((f) => f.item === item.key && f.col === 'effect');
    if (rows.length === 0) continue;
    it(`${item.key} — desc states each of its §7 Effect figures`, () => {
      // The stats-clause audit above binds five figures per item and stops
      // there, which left every Effect numeral in the desc unbound: QA moved
      // "+0.01% lifesteal" to "+5% lifesteal", inverted "lifesteal now also
      // applies to Bleeding damage" to "does not apply", and turned "Character
      // and tower range +10%" into "Character range -40%" across six items —
      // all with `mods` untouched — and the whole suite stayed green. Six of
      // those edits contradicted both §7 and the item's own authored stats, in
      // the file this ledger exists to audit.
      const desc = norm(String(item.desc));
      for (const f of rows) {
        let want = f.descQuote ?? norm(f.quote!);
        // fb164: a scaled stat's desc now quotes the loaded (post-
        // `numberScale`) magnitude, not §7's authored one — the same
        // narrowing the HP/Atk check above applies, extended to Effect
        // quotes. Rebuilds the expected substring with the quote's own
        // numeral scaled, rather than loosening the containment check.
        if (f.stat && STAT_SCALED[f.stat as StatKey] && f.fromQuote) {
          const m = f.fromQuote.pattern.exec(want);
          expect(m, `${id(f)}: fromQuote pattern does not match "${want}"`).not.toBeNull();
          const scaled = Number(m![1]) * content.modifiers.numberScale;
          const numStart = m![0].indexOf(m![1]);
          const scaledMatch = m![0].slice(0, numStart) + String(scaled) + m![0].slice(numStart + m![1].length);
          want = want.slice(0, m!.index) + scaledMatch + want.slice(m!.index + m![0].length);
        }
        expect(desc, `${id(f)}: the desc does not state §7's "${f.quote}"`).toContain(want);
        // `descQuote` is the one hand-typed expectation left in this file, and
        // QA showed it was unconstrained: change the desc to "Halves Dash Slash
        // distance", watch the row redden, then do the cheapest thing the
        // failure suggests - widen `descQuote` from "doubles dash slash
        // distance" to "dash slash distance" - and the file is green with the
        // player-facing text asserting the *opposite* of §7's "double Dash
        // Slash distance". That is the `EXPECTED_ITEM_MODS` shape c012 exists
        // to delete, reappearing inside the file that deletes it. So an
        // override may reword §7 but may not drop its content.
        if (f.descQuote !== undefined) {
          const q = norm(f.quote!);
          for (const numeral of q.match(/-?[\d.]+/g) ?? []) {
            expect(f.descQuote, `${id(f)}: descQuote drops §7's "${numeral}"`).toContain(numeral);
          }
          // A quote with no numeral is overridden only where the row already
          // declares why it cannot be quantified.
          expect(
            f.unquantified ?? '',
            `${id(f)}: descQuote overrides a quote with no numeral, so it must say what it substitutes`,
          ).not.toBe('');
          // It must still name the thing §7 names, so it cannot be shortened
          // to a fragment that would match any wording...
          const noun = q.split(' ').filter((w) => w.length > 3).slice(-2).join(' ');
          expect(f.descQuote, `${id(f)}: descQuote no longer names §7's "${noun}"`).toContain(noun);
          // ...and the word §7 states the figure as must be *inflected*, not
          // dropped: "double" -> "doubles" is the whole licence this hatch has.
          const head = q.split(' ')[0];
          expect(
            f.descQuote.startsWith(head),
            `${id(f)}: descQuote drops §7's "${head}" rather than inflecting it`,
          ).toBe(true);
        }
      }
    });
  }

  it('the desc audit reads every item, and reads the desc — not the mods it already audits', () => {
    // Guards the loop above against the failure it is most exposed to: a desc
    // rewrite that drops the "HP a / Atk b / Def c" shape entirely would make
    // `points` null and fail loudly, but a *renamed* field would make `desc`
    // undefined and `String(undefined)` fail just as loudly — whereas an item
    // with no desc at all would silently not be looped over if the roster ever
    // came from somewhere other than the raw document.
    expect(RAW.items).toHaveLength(12);
    for (const item of RAW.items) {
      expect(typeof item.desc, `${item.key}: no desc authored`).toBe('string');
      expect(String(item.desc).length, `${item.key}: empty desc`).toBeGreaterThan(10);
    }
  });
});
