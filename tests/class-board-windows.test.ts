/**
 * c029 — c014's "the importers move with the board" property is not true of
 * every importer, and this file is the measurement that says which ones.
 *
 * `class-board.test.ts`'s own static scan (`EAST_REACH and SOUTH_REACH still
 * cover the deepest offset any importer actually uses`) reads the literal
 * source text for `WX + <number>` / `WY + <number>`. That catches a file that
 * writes `dummy(w, WX + 8, WY)`, but it is blind to a file whose reach is
 * *computed at runtime* — from an authored tower range/aoe, or from a skill
 * card's rank-scaled budget — because there is no literal number in the
 * source for the scan to find. Two such windows exist today, both swept up
 * converting `class-kit-whiff` (`c025`) by shifting `PROBE_ORIGIN` to `25,12`:
 * the shared board still probes a legal, footprint-clear spot there (`c014`'s
 * own shifted-origin suite says so), and two importers still fail on it.
 *
 * **Why a legal footprint is not enough.** `EAST_REACH`/`SOUTH_REACH` bound
 * `footprintClear`'s *terrain* check (is the ground passable/buildable), not
 * the probed spot's *distance to the map edge or the Core*. A spot can be
 * perfectly clear ground and still sit six tiles from the east wall — which
 * happens exactly when the origin lands near the Core's own column
 * (`CORE_X = 25`), since the scan is drawn there by the ring search finding
 * open ground nearby. A dynamic window that reaches less far than
 * `EAST_REACH` on paper can still run off the board there, because
 * `EAST_REACH` was never a promise about the edge.
 *
 * **The three windows, measured, not argued** (`scratch_probe_check.ts`,
 * this session — deleted, its results are these three `reachX` closures and
 * the table below):
 *
 *  1. `class-wide-grove-reach.test.ts`'s Mortar-shell-splash consumer
 *     (`CONSUMERS`, "a Mortar's shell splash, as the shell really detonates
 *     it") places its bystander at
 *     `BUILD_TX + 0.5 + mortar.attack.range * 0.95 + mortar.attack.aoe * RING`
 *     — the single deepest reach in that file (the comment at its own
 *     `placeProbed` already names it "worst case lands near x = 23.7" on the
 *     shipped board). Fails at origins `25,12` and `30,15`.
 *  2. `class-line-bonus.test.ts`'s `archer_pierce_cap` row places its pierce
 *     line at `WX + budgetFor(pierceCap, card) * 0.7` (`lineOfDummies`,
 *     spacing 0.7). Fails only at `30,15` — its reach is shorter than the
 *     stormcaller row's, so it survives one shift that already breaks the
 *     other two.
 *  3. `class-line-bonus.test.ts`'s `stormcaller_jump_cap` row places its
 *     Chain Surge line at `WX + budgetFor(chainCount, card) * 1.2`
 *     (`lineOfDummies`, spacing 1.2). Fails at `25,12` and `30,15`.
 *
 * A fourth candidate was checked and cleared: `class-wide-grove-reach.test.ts`
 * carries five more dynamic (`p.y + x * y`) placements (cone angles, ring
 * probes), all short reaches (an authored half-angle, a fixed `along = 2`)
 * that stayed clear at every origin below — swept for in the Log, not
 * asserted here as their own rows, since none of them ever reddened.
 *
 * **These are not bugs to fix.** Per CLAUDE.md's measurement rules, this item
 * is the barrier that used to be silent: before it, a shift that broke these
 * two files read as "harness could not build ..." (the `dummy`/`lineOfDummies`
 * guards inside them do name the failure, but nothing tied it back to *why* —
 * that the window's own reach, not the shared footprint, was the cause) and
 * nothing said whether that was expected. Now each window's survival is a
 * named, asserted fact per origin, and `class-board.ts`'s header no longer
 * promises the strong form of "every importer moves with it."
 */

import { describe, expect, it } from 'vitest';

import { loadContent, type Content, type SkillCardDef } from '../src/sim/content';
import { GRID_W } from '../src/sim/grid';
import { probeBoard, type Board } from './class-board';

const content: Content = loadContent();

/** `budgetFor` from `class-line-bonus.test.ts`, restated here off the same public `/data` reads. */
function cardBudget(cardKey: string, base: number, slack = 2): number {
  const card: SkillCardDef = content.skillCardByKey.get(cardKey)!;
  return Math.ceil(base + card.maxRank * card.perRank) + slack;
}

interface Window {
  /** The importer file this window lives in — not this file, which owns none of them. */
  file: string;
  site: string;
  formula: string;
  /** The window's deepest x this board would place a probe at. */
  reachX: (b: Board) => number;
}

const WINDOWS: readonly Window[] = [
  {
    file: 'class-wide-grove-reach.test.ts',
    site: "a Mortar's shell splash, as the shell really detonates it",
    formula: 'BUILD_TX + 0.5 + mortar.attack.range * 0.95 + mortar.attack.aoe * RING (RING = 1 + animist towerPassive.mods.area / 2)',
    reachX: (b) => {
      const mortar = content.towerByKey.get('mortar')!.attack!;
      const wideGrove = content.classByKey.get('animist')!.towerPassive.mods.area!;
      const ring = 1 + wideGrove / 2;
      return b.BUILD_TX + 0.5 + mortar.range * 0.95 + mortar.aoe! * ring;
    },
  },
  {
    file: 'class-line-bonus.test.ts',
    site: "archer archer_pierce_cap: enemies one full-charge Deadeye Draw pierces",
    formula: "WX + budgetFor(archer.active1.pierceCap, archer_pierce_cap card) * 0.7 (lineOfDummies spacing)",
    reachX: (b) => {
      const pierceCap = content.classByKey.get('archer')!.active1.pierceCap ?? 1;
      return b.WX + cardBudget('archer_pierce_cap', pierceCap) * 0.7;
    },
  },
  {
    file: 'class-line-bonus.test.ts',
    site: "stormcaller stormcaller_jump_cap: enemies one Chain Surge reaches",
    formula: "WX + budgetFor(stormcaller.active1.chainCount, stormcaller_jump_cap card) * 1.2 (lineOfDummies spacing)",
    reachX: (b) => {
      const chainCount = content.classByKey.get('stormcaller')!.active1.chainCount ?? 1;
      return b.WX + cardBudget('stormcaller_jump_cap', chainCount) * 1.2;
    },
  },
];

/**
 * The same four origins `class-board.test.ts`'s "a shifted probe origin moves
 * the whole board" suite already probes, plus the shipped default — every one
 * of them is already an asserted-legal footprint-clear board there, which is
 * exactly why a window failing on one of these can't be blamed on the shared
 * module handing back bad ground.
 */
const ORIGINS: ReadonlyArray<{ name: string; origin?: { tx: number; ty: number } }> = [
  { name: 'shipped default' },
  { name: '25,12', origin: { tx: 25, ty: 12 } },
  { name: '15,6', origin: { tx: 15, ty: 6 } },
  { name: '30,15' , origin: { tx: 30, ty: 15 } },
  { name: '22,3', origin: { tx: 22, ty: 3 } },
];

/**
 * Measured truth table: `true` where the window's `reachX` stays on the board
 * (the same `< GRID_W - 1` bound `dummy`/`lineOfDummies` assert in their own
 * files) for that origin. Every cell here was read off a real `probeBoard`
 * call, not assumed — the "survives / reddens" wording in the header above is
 * this table in prose.
 */
const EXPECTED: Record<string, Record<string, boolean>> = {
  "a Mortar's shell splash, as the shell really detonates it": {
    'shipped default': true,
    '25,12': false,
    '15,6': true,
    '30,15': false,
    '22,3': true,
  },
  'archer archer_pierce_cap: enemies one full-charge Deadeye Draw pierces': {
    'shipped default': true,
    '25,12': true,
    '15,6': true,
    '30,15': false,
    '22,3': true,
  },
  'stormcaller stormcaller_jump_cap: enemies one Chain Surge reaches': {
    'shipped default': true,
    '25,12': false,
    '15,6': true,
    '30,15': false,
    '22,3': true,
  },
};

describe('c029: board-relative windows the static EAST_REACH scan cannot see', () => {
  it('the shipped board — the one every real test run uses — clears all three windows', () => {
    const b = probeBoard();
    for (const w of WINDOWS) {
      const x = w.reachX(b);
      expect(x, `${w.file} — ${w.site}: reaches x=${x} on the shipped board`).toBeLessThan(GRID_W - 1);
    }
  });

  for (const w of WINDOWS) {
    describe(`${w.file} — ${w.site}`, () => {
      for (const { name, origin } of ORIGINS) {
        const expected = EXPECTED[w.site][name];
        it(`origin ${name}: ${expected ? 'survives' : 'reddens — a declared dependency, not silence'}`, () => {
          const b = probeBoard(origin);
          const x = w.reachX(b);
          const survives = x < GRID_W - 1;
          expect(
            survives,
            `${w.file} — ${w.site}: formula "${w.formula}" reached x=${x} at origin ${name} ` +
              `(board WX=${b.WX}), expected ${expected ? 'to survive' : 'to run off the board'}`,
          ).toBe(expected);
        });
      }
    });
  }

  it('every window/origin combination is a declared cell — nothing here is assumed silently green', () => {
    for (const w of WINDOWS) {
      for (const { name } of ORIGINS) {
        expect(
          EXPECTED[w.site]?.[name],
          `${w.file} — ${w.site} has no recorded expectation for origin ${name}`,
        ).not.toBeUndefined();
      }
    }
  });

  /**
   * The negative half of the header's claim 4: five more dynamic (`p.y + n *
   * m`) placements in `class-wide-grove-reach.test.ts` (cone angles, cone
   * anchors, a fixed `along = 2`) were swept for with the same regex this
   * item used to find the three windows above, and none of them ever failed
   * across the five origins this file checks — a full run of that file at
   * every one of `ORIGINS` (done by hand this session, not repeated here to
   * keep this file inside the fast tier) came back green outside the one
   * Mortar row. They are not given their own `reachX` row because there is
   * nothing to assert: a row that can never redden is not a measurement.
   */
  it('the swept-and-cleared rows stay a documented negative, not a silent one', () => {
    expect(
      WINDOWS.map((w) => w.site),
      'this table still lists exactly the three windows the header measured — a fourth needs its own row',
    ).toEqual([
      "a Mortar's shell splash, as the shell really detonates it",
      'archer archer_pierce_cap: enemies one full-charge Deadeye Draw pierces',
      'stormcaller stormcaller_jump_cap: enemies one Chain Surge reaches',
    ]);
  });
});
