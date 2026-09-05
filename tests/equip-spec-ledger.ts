/**
 * c028 — the **spec-ledger device**, owned once.
 *
 * **On the name.** The module is ledger-generic — `c027` uses it on the §4
 * ledger, which is about classes, not equipment — and it is called
 * `equip-spec-ledger` only because the content lane's Scope allows new test
 * files under `tests/class-*` and `tests/equip-*` and nothing else. An
 * acceptance clause this lane wrote for itself cannot widen its own Scope
 * (code review, c028), and of the two legal prefixes `equip-` is the safe one:
 * `tests/class-board.test.ts` registry-checks every `tests/class-*.test.ts`.
 * The rename to `tests/spec-ledger.ts` is logged as a one-line main-lane
 * follow-up.
 *
 * `c008` and `c012` built ledgers that hold SPEC-FINAL's stated numbers to
 * `/data` (§4's on `data/classes.json`, §7's on `data/equipment.json`). `c022`
 * added the half a number-ledger cannot state on its own: a row can carry the
 * right figure on a stat the spec never mentions, and audit that instead — QA
 * moved §7's "tower upgrade cost −20%" onto `goldFind`, in `/data` *and* in the
 * ledger row, and the whole file stayed green. The answer was a **behavioural
 * pointer**: an anchored `describe`/`it` whose body reads the row's own stat.
 *
 * That device is ~100 lines and every one of them was earned by a mutation
 * that got past an earlier draft. It is extracted here before `c027` copies it
 * onto the §4 ledger, because a hand-copy loses whichever of these the copier
 * does not notice — the exact shape `c014` spent an item undoing for six copies
 * of one board:
 *
 *   - **The block ends by indentation, not by matching `<indent>});`.** An
 *     exact-string scan walks straight past a per-test timeout closer
 *     (`}, 20000);`, which 20 files here use) or a closer with a trailing
 *     comment, and stops at the *next sibling's* — so the body silently
 *     swallows a neighbouring block, and a row re-pointed at a stat that
 *     neighbour reads goes green.
 *   - **The title line is not the body.** Most anchors name their stat in the
 *     title, so including it makes `reads` self-satisfying: a claim about the
 *     row's own declared string rather than about code.
 *   - **Comments are stripped.** A bare `// luck` inside a block was enough to
 *     "cover" a row moved onto `luck`.
 *   - **`reads` is closed on the left by an identifier boundary.** As a bare
 *     substring, `atkFlat` is satisfied by `towerAtkFlat` and `armor` by the
 *     item key `swordsman_armor` — the two pairs a §7 ledger most needs to keep
 *     apart. It stays open on the right so a derived factor named after its
 *     stat (`areaMul`, `towerRangeMul`, `leechAccumulator`) still counts.
 *   - **The pointer binds the item as well as the stat**, or a row for one item
 *     covers itself with a block that equips another.
 *   - **A `describe.skip` above the block disarms it**, and `.skip` is a
 *     sanctioned move here (CLAUDE.md working rule 6), so ancestors are
 *     reported and refused.
 *   - **The decoy roster is derived**, never listed: a hardcoded roster carries
 *     the precondition "no row authors this key", which the acceptance mutation
 *     itself breaks.
 *
 * Everything here is pure in its input except `sourceOf`, so
 * `tests/equip-spec-ledger.test.ts` exercises the reader on synthetic source rather
 * than only on whatever the suite happens to contain today.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** A row's behavioural pointer: which block proves this row's stat does anything. */
export interface Behaviour {
  /** The test file holding the covering block, repo-relative. */
  coveredBy: string;
  /** The `describe`/`it` title that covers this row. Must match exactly one title in `coveredBy`. */
  anchor: RegExp;
  /**
   * What the anchored block's **body** must contain. Defaults to the row's own
   * stat key and item key (`defaultReads`). An override must come with a
   * `why` — it is the one way this check can be loosened, so it is a visible
   * edit, and each ledger declares its own roster of rows allowed to use it.
   */
  reads?: readonly RegExp[];
  why: string;
}

export interface Block {
  /** The matched `it`/`describe` line, trimmed. Empty when `matches !== 1`. */
  title: string;
  /** The block's body: comments stripped, title line excluded. */
  body: string;
  /** The enclosing `describe`/`it` lines, innermost first — where a `.skip` would hide. */
  ancestors: string[];
  /** How many titles the anchor matched. Anything but 1 leaves the other fields empty. */
  matches: number;
}

const SOURCES = new Map<string, string>();

/** A repo-relative file's text, read once per process. */
export function sourceOf(file: string): string {
  const cached = SOURCES.get(file);
  if (cached !== undefined) return cached;
  const text = readFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), 'utf8');
  SOURCES.set(file, text);
  return text;
}

/** Strips comments so prose about a stat never counts as reading it. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * The body of the `describe`/`it` an anchor names. Pure in its input; see the
 * header for why each of these rules exists.
 */
export function blockBodyIn(text: string, anchor: RegExp): Block {
  const ls = text.split('\n');
  const hits = ls.map((l, i) => [l, i] as const).filter(([l]) => /^\s*(it|describe)\(/.test(l) && anchor.test(l));
  if (hits.length !== 1) return { title: '', body: '', ancestors: [], matches: hits.length };
  const [line, i] = hits[0];
  const indent = /^\s*/.exec(line)![0];
  // The end is the first line back at the block's own indentation, whatever it
  // says — and anything at that column that is not a closer is an error rather
  // than a swallow.
  let end = -1;
  for (let j = i + 1; j < ls.length; j++) {
    if (ls[j].trim() === '') continue;
    if (/^\s*/.exec(ls[j])![0].length > indent.length) continue;
    if (!/^\s*\}/.test(ls[j])) {
      throw new Error(
        `spec-ledger: the block at line ${i + 1} does not close - line ${j + 1} is back at its indentation ` +
          `but is not a closer: "${ls[j].trim()}"`,
      );
    }
    end = j;
    break;
  }
  if (end < 0) throw new Error(`spec-ledger: cannot find the end of the block at line ${i + 1} - "${line.trim()}"`);

  const ancestors: string[] = [];
  let want = indent.length;
  for (let j = i - 1; j >= 0 && want > 0; j--) {
    if (ls[j].trim() === '') continue;
    const w = /^\s*/.exec(ls[j])![0].length;
    if (w < want && /^\s*(describe|it)[.(]/.test(ls[j])) {
      ancestors.push(ls[j].trim());
      want = w;
    }
  }
  return { title: line.trim(), body: stripComments(ls.slice(i + 1, end + 1).join('\n')), ancestors, matches: 1 };
}

/** The same, against a repo-relative file. */
export function blockBody(file: string, anchor: RegExp): Block {
  return blockBodyIn(sourceOf(file), anchor);
}

/** Escapes a literal for use inside a `RegExp`. */
export function escapeForRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * What a pointer must find in its block when its row declares no `reads`: the
 * row's own stat key, bounded on the left, and its own item/class key.
 */
export function defaultReads(stat: string, owner: string): readonly RegExp[] {
  return [readsStat(stat), new RegExp(escapeForRegex(owner))];
}

/**
 * One name, matched the way `reads` matches a stat: closed on the left by an
 * identifier boundary, open on the right. The boundary is written **once**, in
 * the module whose whole point is one home — an earlier draft had it in two
 * places, which is exactly how the two would come to disagree.
 */
export function readsStat(stat: string): RegExp {
  return new RegExp(`(?<![A-Za-z0-9_])${escapeForRegex(stat)}`);
}

/**
 * The decoy roster: every stat key the ledger's own `/data` file authors
 * nowhere, minus the names a covering block reads for some other reason (a
 * function `/src` exports under the same word). Derived rather than listed —
 * see the header.
 */
export function decoyKeys<K extends string>(
  all: readonly K[],
  authored: ReadonlySet<string>,
  exempt: Readonly<Record<string, string>>,
): readonly K[] {
  return all.filter((k) => !authored.has(k) && exempt[k] === undefined);
}

/**
 * Lines of a block a `reads` match could plausibly come from: negative
 * controls are excluded, because proving a decoy *unaffected* is exactly the
 * kind of assertion a ledger asks for elsewhere and must not be punished for.
 *
 * `control` is a parameter and not a constant because the second shape is a
 * **naming convention, not a language rule**: §7's covers name their control
 * world `wNone`, so `toBeCloseTo(wNone.derived…)` reads as a control there.
 * Code review surveyed the §4 suites and found their control operands are
 * `full.`, `poison.`, `plain.`, `both.`, `BASE.`, `f.`, `c.` — not one starts
 * with `w`. Baking §7's convention into the shared module would hand `c027`
 * the false red this filter exists to prevent. Widening the default instead
 * (`toBeCloseTo\(\s*[A-Za-z_]`) would swallow §7's own *positive* rows, so the
 * caller says which shape means "control" in its own files.
 */
export function positiveLines(body: string, control: RegExp = /toBeCloseTo\(w[A-Za-z]*\./): string {
  return body
    .split('\n')
    .filter((l) => !l.includes('.not.') && !control.test(l))
    .join('\n');
}

/**
 * The five rules a behavioural pointer must satisfy, as a list of problems —
 * empty when the pointer holds. Each is a mutation that got past an earlier
 * draft, which is why they travel together: a ledger that re-implements the
 * loop keeps whichever ones its author noticed.
 *
 * The caller supplies the block (so it chooses the file and anchor) and the
 * `reads` it expects, and keeps its own row identity in the failure message.
 */
export function pointerProblems(block: Block, reads: readonly RegExp[]): string[] {
  const out: string[] = [];
  // Zero means the covering block was deleted or renamed — the property the
  // anchor exists for. Two means the pointer is ambiguous, and the `reads`
  // check below would then be reading a coin flip.
  if (block.matches !== 1) {
    out.push(`${block.matches} blocks match this anchor, expected 1`);
    return out;
  }
  if (block.body.split('\n').length <= 2) out.push('the anchored block is empty');
  // A cover inside a skipped ancestor is not a cover. `it.skip(` is caught by
  // the scan itself; a `describe.skip(` above it is not, and would disarm
  // every row pointing into the file while the ledger stayed green.
  for (const a of block.ancestors.filter((x) => /\.(skip|todo)\(/.test(x))) {
    out.push(`its covering block sits inside a skipped describe: ${a}`);
  }
  for (const r of reads) {
    if (!r.test(block.body)) out.push(`the block "${block.title}" never reads ${r.source}`);
  }
  return out;
}
