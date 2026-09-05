/**
 * c025 — the one thing `tests/class-kit-whiff.test.ts` shares with a file
 * outside this lane's Scope, parsed instead of retyped.
 *
 * `class-kit-whiff`'s Ice Wall row exists to state the same whiff policy as
 * `tests/p6d-nine-classes.test.ts`'s "still pays its cooldown when no tile
 * could be placed" — two files, one rule, so a change has to break both. It
 * used to pin the agreement as `expect([AX, AY]).toEqual([12, 10])`, which
 * worked while both files parked the Warden at `10,10`. `c026`'s terrain merge
 * moved the shared board to `10,6`, so that literal is p6d's tile and not
 * whiff's any more. What the two actually agree on is the **offset** — aim two
 * tiles east of wherever the Warden stands — and p6d's own park and aim are
 * read out of p6d's source here so the agreement still breaks loudly if p6d
 * re-aims. p6d is read-only from this lane; the agreement can only be stated
 * from this side.
 *
 * **Everything below is shaped by what QA broke in the first draft**, which
 * matched the first `aimX`/`aimY` anywhere inside p6d's whole Ice Wall
 * `describe`:
 *
 *   - It read the **wrong cast**. The first aim in that describe belongs to a
 *     `castWall()` helper used by the gold/duration rows, not to the occupancy
 *     row whiff mirrors. Re-aiming the occupancy row alone left whiff green —
 *     the agreement was watching a test it does not co-state. The block is
 *     therefore the occupancy `it`, found by its own title, and nothing wider.
 *   - Reordering p6d's rows, or letting prettier wrap one `applyCommand` call,
 *     produced a **false red blaming p6d for re-aiming**. A parse that cannot
 *     find its numbers now says so as a parse failure, and the patterns
 *     tolerate line breaks and either quote style.
 *   - A `w.warden.x = 10; w.warden.y = 10;` on one line made the park regex
 *     **fall through to a different `it`** and pass by luck. Park and aim are
 *     required to be unique inside the block, so a second of either is a named
 *     failure rather than a coin flip.
 *   - The parse ran at **module scope** and threw, which vitest reports as
 *     `Tests no tests` — 58 rows silently not running, the exact failure
 *     `tests/class-board.ts`'s own header calls worse than the one c014 set
 *     out to fix. `p6dIceWall()` is lazy and memoised, so a broken parse fails
 *     the one row that asks for it.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export interface P6dIceWall {
  /** Where p6d parks its Warden for the occupancy cast. */
  parkX: number;
  parkY: number;
  /** Where it aims the Ice Wall from there. */
  aimX: number;
  aimY: number;
}

export const P6D_FILE = 'p6d-nine-classes.test.ts';

/** The `it` whiff co-states with — matched on its own title, not on the describe. */
const OCCUPANCY_TITLE = /^\s*it\((['"`]).*every target tile already occupied.*\1/;

/**
 * The occupancy block's own text, ended by indentation the way c022's ledger
 * reader ends a block: the first line back at the `it`'s own column. An exact
 * `});` match is what let a `}, 20000);` closer swallow the next block there,
 * and p6d is a file this lane cannot edit if it ever grows one.
 */
function occupancyBlock(text: string): string {
  const ls = text.split('\n');
  const hits = ls.map((l, i) => [l, i] as const).filter(([l]) => OCCUPANCY_TITLE.test(l));
  if (hits.length !== 1) {
    throw new Error(
      `class-p6d-agreement: ${P6D_FILE} has ${hits.length} "every target tile already occupied" tests, expected 1 ` +
        '— the Ice Wall occupancy row was renamed or duplicated, so the agreement cannot be read (this is a parse ' +
        'failure, not a re-aim)',
    );
  }
  const [line, i] = hits[0];
  const indent = /^\s*/.exec(line)![0].length;
  for (let j = i + 1; j < ls.length; j++) {
    if (ls[j].trim() === '') continue;
    if (/^\s*/.exec(ls[j])![0].length > indent) continue;
    return ls.slice(i + 1, j).join('\n');
  }
  throw new Error(`class-p6d-agreement: ${P6D_FILE}'s occupancy test never closes — parse failure, not a re-aim`);
}

/** Both patterns span newlines and accept either quote style, so a reformat is not a re-aim. */
const PARK = /w\.warden\.x\s*=\s*(-?[\d.]+);\s*w\.warden\.y\s*=\s*(-?[\d.]+);/g;
const AIM = /k:\s*['"`]class_active2['"`],\s*aimX:\s*(-?[\d.]+),\s*aimY:\s*(-?[\d.]+)/g;

function only(block: string, re: RegExp, what: string): RegExpMatchArray {
  const all = [...block.matchAll(re)];
  if (all.length !== 1) {
    throw new Error(
      `class-p6d-agreement: ${P6D_FILE}'s occupancy test states ${all.length} ${what}s, expected 1 ` +
        '— park and aim must pair unambiguously (this is a parse failure, not a re-aim)',
    );
  }
  return all[0];
}

/** Pure, so the shapes QA broke can be exercised on synthetic sources. */
export function parseP6dIceWall(text: string): P6dIceWall {
  const block = occupancyBlock(text);
  const park = only(block, PARK, 'Warden park');
  const aim = only(block, AIM, 'class_active2 aim');
  return { parkX: Number(park[1]), parkY: Number(park[2]), aimX: Number(aim[1]), aimY: Number(aim[2]) };
}

let cached: P6dIceWall | undefined;

/** The shipped p6d, parsed once, on first use — never at import. */
export function p6dIceWall(): P6dIceWall {
  if (cached === undefined) {
    cached = parseP6dIceWall(readFileSync(fileURLToPath(new URL(`./${P6D_FILE}`, import.meta.url)), 'utf8'));
  }
  return cached;
}
