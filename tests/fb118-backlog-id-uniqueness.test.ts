/**
 * fb118 — BACKLOG ids are no longer global in practice: the 2026-09-04 lane
 * merge documented one 18-id collision batch and a "next free number, never
 * a lane-local one" rule, but this test's own first run found the rule kept
 * breaking after that date — each lane file has, at various points, taken
 * its next free number purely against its own text instead of grepping the
 * other three files first. A fresh scan across the four live backlog files
 * (the historical `docs/BACKLOG-DONE.md` archive is intentionally excluded:
 * ids get reused across eras there by design, per fb178's archiving note,
 * and that is not what this test is guarding against) found sixteen ids
 * each defined more than once — see `KNOWN_PREEXISTING_COLLISIONS` below for
 * the full list and how it was arrived at (including a first, incorrect
 * attempt to handle nine of them with a blanket section-exclusion instead of
 * naming each one, caught by a second code-reviewer pass).
 *
 * Every one of these ids is already cited by name in shipped source
 * comments, test `describe`/`it` titles, `PROGRESS.md`, `QUESTIONS.md` and/or
 * `STATUS.md` — sometimes for *both* colliding meanings, interleaved, per id.
 * Renaming any of them now is a real, cross-file, source-and-test-touching
 * edit in its own right, not a BACKLOG-prose-only fix, and is left for a
 * dedicated follow-up rather than attempted as a side effect of adding this
 * guard — recorded honestly as `KNOWN_PREEXISTING_COLLISIONS` instead of
 * either silently ignored or silently fixed.
 *
 * What this test actually guards: no *new* collision joins that list. Per
 * fb118's acceptance ("either way a tools/ check (or a test) fails when an
 * id appears in two backlog files with different titles"), every id outside
 * the known list must be unique, both across the four live files and within
 * each one. `ITEM_BULLET` accepts the three bullet shapes the live files
 * actually use (checkbox, no-checkbox, and indented sub-item — a
 * code-reviewer finding against this file's first draft, which only matched
 * the first).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');
const LIVE_BACKLOG_FILES = ['BACKLOG.md', 'BACKLOG-CONTENT.md', 'BACKLOG-TERRAIN.md', 'BACKLOG-UI.md'];

/**
 * Matches an item bullet's own defining line, not a Log's mention-in-prose.
 * Three real shapes all appear in the live files, all accepted here:
 * `- [ ] (id) [type] title`, a no-checkbox `- (id) [type] title` (BACKLOG.md's
 * fb079-fb083 and others), and an indented sub-item under a parent bullet
 * (`  - [x] (fb153a) [balance] ...`) — a code-reviewer finding on this test's
 * first draft, which anchored `^- \[` and silently scanned neither.
 */
const ITEM_BULLET = /^\s*- (?:\[[ xX]\] )?\((\S+?)\) \[(\w+)\] (.*)/;

interface ItemOccurrence {
  file: string;
  line: number;
  title: string;
}

function scanBacklogItems(): Map<string, ItemOccurrence[]> {
  const byId = new Map<string, ItemOccurrence[]>();
  for (const file of LIVE_BACKLOG_FILES) {
    const lines = readFileSync(resolve(ROOT, file), 'utf8').split('\n');
    lines.forEach((line, i) => {
      const m = ITEM_BULLET.exec(line);
      if (!m) return;
      const id = m[1];
      const title = m[3];
      // Both capture groups are required by ITEM_BULLET's own pattern (no `?`
      // on either group), so a match with either missing can't happen — the
      // guard is here only to satisfy noUncheckedIndexedAccess.
      if (id === undefined || title === undefined) return;
      const occ: ItemOccurrence = { file, line: i + 1, title };
      const list = byId.get(id);
      if (list) list.push(occ);
      else byId.set(id, [occ]);
    });
  }
  return byId;
}

/**
 * Pre-existing collisions this test's first run found, kept as a fixed
 * allowlist (not "any id that happens to collide today") so a fresh
 * collision that reuses one of these exact ids by coincidence still fails —
 * this set names each id's already-known duplicate count, not a blanket
 * exemption.
 *
 * Widening `ITEM_BULLET` to also scan no-checkbox and indented-sub-item
 * bullets (a code-reviewer finding against this file's first draft) surfaced
 * nine more real collisions inside the three files' own `### Recently
 * completed` archive-pointer sections. A first attempt excluded that whole
 * section instead of investigating each one — a second code-reviewer pass
 * caught that this was wrong: four of the nine (fb171/fb172/fb173/fb174) are
 * genuine cross-file collisions (BACKLOG.md's own real sim/test-infra items
 * vs. BACKLOG-UI.md's "Recently completed" stubs for unrelated UI/save-system
 * topics under the same ids), not self-echoes, and the blanket exclusion
 * would have also stripped collision protection from ~15 unrelated ids
 * (BACKLOG-CONTENT.md's c004/fb062/c033-c041, BACKLOG-UI.md's fb093/fb097/
 * fb169/fb170/fb175/fb176, BACKLOG.md's fb079-fb083) that have no duplicate
 * anywhere and need none. Fixed by removing the exclusion and simply listing
 * every real collision it would have hidden: five genuine intra-BACKLOG.md
 * echoes (fb139, p12d, p12e, p12h, fb163 — the same "Recently completed"
 * stub reusing an id a different full item defines later in the same file)
 * plus the four real BACKLOG.md-vs-BACKLOG-UI.md ones above.
 */
const KNOWN_PREEXISTING_COLLISIONS: Record<string, number> = {
  fb085: 2,
  fb139: 2,
  fb163: 2,
  fb171: 2,
  fb172: 2,
  fb173: 2,
  fb174: 2,
  fb177: 2,
  fb178: 2,
  fb179: 2,
  fb180: 2,
  fb181: 2,
  p12d: 2,
  p12e: 2,
  p12h: 2,
  p12i: 2, // both occurrences are in BACKLOG.md — an intra-file duplicate, not a cross-file one.
};

describe('fb118: BACKLOG ids stay unique across the four live backlog files', () => {
  const byId = scanBacklogItems();

  it('reports no id collision beyond the known, already-logged set', () => {
    const unexpected: string[] = [];
    for (const [id, occurrences] of byId) {
      if (occurrences.length <= 1) continue;
      const known = KNOWN_PREEXISTING_COLLISIONS[id];
      if (known === occurrences.length) continue;
      const where = occurrences.map((o) => `${o.file}:${o.line} "${o.title.slice(0, 60)}"`).join(' vs ');
      unexpected.push(`(${id}) x${occurrences.length}: ${where}`);
    }
    expect(unexpected, unexpected.join('\n')).toEqual([]);
  });

  it("the known-collision allowlist doesn't drift from what's actually in the files", () => {
    // Catches both directions: a listed id that got fixed (count now 1, or gone)
    // should be removed from the allowlist, not left to silently mask a future
    // real reuse of the same id.
    for (const [id, expectedCount] of Object.entries(KNOWN_PREEXISTING_COLLISIONS)) {
      const actual = byId.get(id)?.length ?? 0;
      expect(actual, `expected ${id} to still occur ${expectedCount}x (it's a documented pre-existing collision)`).toBe(
        expectedCount,
      );
    }
  });
});
