/**
 * fb064i — the high-ground protection rules, terrain side (SPEC-FINAL §10.5).
 *
 * The owner wrote four clauses. Three of them (ground enemies cannot step onto
 * high ground, cannot stand on it, cannot walk over it) are already carried by
 * `high.walkable: false` and pinned by `tests/terrain-grid.test.ts`; this file
 * pins the two a walkability mask cannot express — a walker adjacent to the
 * cliff meleeing the tower on top of it, and a Burrower surfacing under one —
 * plus the exemptions (Spitters and fliers; a boss's *specials* are exempt by
 * call site, not by family — see the boss test for why).
 *
 * What each block is here to catch, rather than to restate:
 *   - the classification table is *data*, so the pins are on real authored
 *     enemies and on the shipped file's answers, not on a hand-built fixture
 *     that would agree with any table;
 *   - "no change to non-high-ground targeting" is measured over whole generated
 *     maps rather than argued: every family, every non-high tile, every seed;
 *   - the loader refusals are all silent-failure cases. A typo'd trait, a
 *     shadowed one, or a catch-all in the wrong place all load and classify
 *     without complaint while applying a rule nobody wrote.
 */

import { describe, expect, it } from 'vitest';

import enemiesRaw from '../data/enemies.json';
import { GRID_H, GRID_W, Grid } from '../src/sim/grid';
import {
  canAttackHighGround,
  canAttackStructureAt,
  canSurfaceAt,
  canSurfaceOnHighGround,
  familyForDef,
  generateTerrain,
  highGroundFamily,
  loadTerrain,
  parseTerrain,
  terrainOverlay,
  TerrainKind,
  type HighGroundFamily,
  type TerrainConfig,
} from '../src/sim/terrain';

const cfg = loadTerrain();
const enemies = enemiesRaw.enemies as ReadonlyArray<{
  key: string;
  name: string;
  traits: readonly string[];
}>;

function withConfig(patch: (raw: Record<string, unknown>) => void): TerrainConfig {
  const raw = JSON.parse(JSON.stringify(cfg)) as Record<string, unknown>;
  patch(raw);
  return parseTerrain(raw);
}

/**
 * The loader's complaint about a patched family table, as one string.
 *
 * Read through `ZodError.issues` rather than the thrown `message`, which is the
 * issue list rendered as JSON — so every quote in a message arrives escaped and
 * an assertion written the obvious way passes on a message that never mentions
 * the field it names.
 */
function refusal(patch: (families: Array<Record<string, unknown>>) => void): string {
  try {
    withConfig((raw) => {
      patch((raw.highGround as { families: Array<Record<string, unknown>> }).families);
    });
  } catch (e) {
    const issues = (e as { issues?: Array<{ message: string }> }).issues;
    if (!issues) throw e;
    return issues.map((i) => i.message).join(' | ');
  }
  throw new Error('expected the loader to refuse this config, and it loaded');
}

function familyOf(enemyKey: string, c: TerrainConfig = cfg): HighGroundFamily {
  const def = enemies.find((e) => e.key === enemyKey);
  if (!def) throw new Error(`no such enemy "${enemyKey}"`);
  return highGroundFamily(c, def.traits);
}

/** A `Grid` with a generated map on it, the board the rules are asked about. */
function seededGrid(seed: number): { grid: Grid; highTiles: Array<[number, number]> } {
  const map = generateTerrain(seed, cfg);
  const grid = new Grid();
  grid.applyTerrain(terrainOverlay(map, cfg));
  grid.refresh();
  const highTiles: Array<[number, number]> = [];
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (grid.isHighGround(x, y)) highTiles.push([x, y]);
    }
  }
  return { grid, highTiles };
}

describe('fb064i — high-ground families are classified from authored traits', () => {
  /**
   * A golden per authored enemy. Chosen over "spot-check a flier" because the
   * table is first-match-wins over trait *names*: a reordering, a renamed
   * trait, or a new family inserted in the middle moves enemies silently, and
   * only an exhaustive list notices which ones.
   */
  const EXPECTED: Record<string, string> = {
    husk: 'ground',
    sprinter: 'ground',
    swarm_rat: 'ground',
    bulwark: 'ground',
    spitter: 'ranged',
    gale_imp: 'flier',
    mender: 'ground',
    splitling: 'ground',
    shellback: 'ground',
    bomber: 'ground',
    warlock: 'ground',
    burrower: 'burrower',
    charger: 'ground',
    frostkin: 'ground',
    cinderling: 'ground',
    wraith: 'ground',
    colossus: 'ground',
    herald: 'ground',
    gatebreaker: 'ground',
    warden_eater: 'ground',
  };

  it('covers every authored enemy exactly once', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual(enemies.map((e) => e.key).sort());
  });

  it.each(enemies.map((e) => [e.key, EXPECTED[e.key]] as const))(
    '%s is family "%s"',
    (key, want) => {
      expect(familyOf(key).key).toBe(want);
    },
  );

  it('classifies from traits alone — an unauthored trait set still lands in the catch-all', () => {
    expect(highGroundFamily(cfg, []).key).toBe('ground');
    expect(highGroundFamily(cfg, ['elite', 'stomp', 'pack']).key).toBe('ground');
  });

  it('is first-match-wins, and the order is what decides a multi-family enemy', () => {
    // A flying burrower is not authored today, but nothing stops one being
    // authored tomorrow, and the two families disagree about surfacing.
    expect(highGroundFamily(cfg, ['burrows', 'flying']).key).toBe('flier');
    const reordered = withConfig((raw) => {
      const hg = raw.highGround as { families: unknown[] };
      const fams = hg.families as Array<{ key: string }>;
      const flier = fams.findIndex((f) => f.key === 'flier');
      const burrower = fams.findIndex((f) => f.key === 'burrower');
      [fams[flier], fams[burrower]] = [fams[burrower], fams[flier]];
    });
    expect(highGroundFamily(reordered, ['burrows', 'flying']).key).toBe('burrower');
    // The trait order on the enemy must not matter — only the table's order.
    expect(highGroundFamily(cfg, ['flying', 'burrows']).key).toBe('flier');
  });

  it('throws rather than answering "no exemptions" when a table has no catch-all', () => {
    // Only reachable by bypassing `parseTerrain`, which is exactly why it is
    // pinned: a silent `undefined` here would read downstream as the strictest
    // possible rule applied to every enemy.
    const noCatchAll = {
      ...cfg,
      highGround: { families: cfg.highGround.families.filter((f) => f.traits.length > 0) },
    } as TerrainConfig;
    expect(() => highGroundFamily(noCatchAll, ['pack'])).toThrow(/no catch-all/);
  });
});

describe('fb064i — the shipped table says what the owner wrote', () => {
  it('fliers and ranged enemies may attack a tower on high ground; ground melee may not', () => {
    expect(canAttackHighGround(familyOf('gale_imp'))).toBe(true);
    expect(canAttackHighGround(familyOf('spitter'))).toBe(true);
    for (const key of ['husk', 'sprinter', 'bulwark', 'charger', 'colossus', 'herald', 'burrower']) {
      expect(canAttackHighGround(familyOf(key))).toBe(false);
    }
  });

  it('is exactly this table — every authored flag pinned', () => {
    // QA mutation-tested the *data*, not just the code, and found three of the
    // eight authored booleans survived the whole suite: `flier.surfacesHigh`,
    // `ranged.surfacesHigh` and `ground.surfacesHigh` could each be flipped
    // with 50 tests green. `surfacesHigh` was asserted for the Burrower only,
    // and fb064f puts these rows under live Tuner editing.
    expect(cfg.highGround.families.map((f) => [f.key, f.attacksHigh, f.surfacesHigh])).toEqual([
      ['flier', true, true],
      ['ranged', true, false],
      ['burrower', false, false],
      ['ground', false, false],
    ]);
  });

  it('Burrowers may not surface on high ground', () => {
    expect(canSurfaceOnHighGround(familyOf('burrower'))).toBe(false);
  });

  it('the Wraith is the only live subject of `ground.surfacesHigh`', () => {
    // `phases` (enemies.ts:1100-1103) is the second surfacing site and the only
    // one a non-Burrower reaches: fliers and ranged enemies never submerge. So
    // the catch-all's `surfacesHigh: false` is a rule about the Wraith, and
    // the merge list has to say whether that site is guarded. Pinned here so
    // the value has a named subject rather than reading as filler.
    expect(familyOf('wraith').key).toBe('ground');
    expect(canSurfaceOnHighGround(familyOf('wraith'))).toBe(false);
    const submergers = enemies.filter((e) => e.traits.includes('burrows') || e.traits.includes('phases'));
    expect(submergers.map((e) => e.key)).toEqual(['burrower', 'wraith']);
  });

  it('a boss is ground melee — the owner exempts the specials, not the boss', () => {
    // The note reads "ranged enemies (Spitter), fliers, and the bosses' special
    // attacks still can". A family flag cannot tell a boss's special from its
    // melee, so the specials are exempt by call site (`boss.ts` is simply not
    // guarded at the merge) and the family is not. Without this, the
    // Gatebreaker — whose `structureBreaker` trait forces the breach branch
    // unconditionally at `enemies.ts:1459` — would chew a high-ground tower
    // from the low tile beside it, i.e. high ground would protect nothing on
    // the one wave built to break structures.
    expect(familyOf('gatebreaker').key).toBe('ground');
    expect(familyOf('warden_eater').key).toBe('ground');
    expect(canAttackHighGround(familyOf('gatebreaker'))).toBe(false);
    expect(cfg.highGround.families.some((f) => f.traits.includes('boss'))).toBe(false);
  });

  it('an elite is still ground melee — no exemption comes from the grade', () => {
    expect(familyOf('colossus').key).toBe('ground');
    expect(familyOf('herald').key).toBe('ground');
  });

  it('every trait the shipped table names is carried by some authored enemy', () => {
    // The typo guard, as a test rather than a loader rule. `"flyng"` would
    // otherwise drop fliers into the catch-all with the file still reading
    // exactly as designed. It is not in the loader because a family naming a
    // not-currently-carried trait is inert rather than unpayable — refusing it
    // would stop `data/terrain.json` loading over an edit to `enemies.json`,
    // and `loadContent({ enemies })` can swap that roster anyway.
    const carried = new Set(enemies.flatMap((e) => e.traits));
    for (const f of cfg.highGround.families) {
      for (const t of f.traits) {
        expect({ family: f.key, trait: t, carried: carried.has(t) }).toEqual({
          family: f.key,
          trait: t,
          carried: true,
        });
      }
    }
  });

  it('every family in the shipped table is reachable by some authored enemy', () => {
    // The other half: a family no enemy lands in is a rule with no subject.
    const reached = new Set(enemies.map((e) => familyOf(e.key).key));
    expect([...cfg.highGround.families].map((f) => f.key).filter((k) => !reached.has(k))).toEqual(
      [],
    );
  });
});

describe('fb064i — the rules on a generated map', () => {
  const SEEDS = [1, 2, 7, 42, 97, 313, 1000, 7957];

  it('every seed has high ground to protect', () => {
    for (const seed of SEEDS) {
      expect(seededGrid(seed).highTiles.length).toBeGreaterThan(0);
    }
  });

  it('ground melee cannot attack a structure on any high tile, on any seed', () => {
    const ground = familyOf('husk');
    for (const seed of SEEDS) {
      const { grid, highTiles } = seededGrid(seed);
      for (const [x, y] of highTiles) {
        expect(canAttackStructureAt(grid, ground, x, y)).toBe(false);
      }
    }
  });

  it('Spitters and fliers can attack a structure on every high tile', () => {
    const exempt = ['spitter', 'gale_imp'].map((k) => familyOf(k));
    for (const seed of SEEDS) {
      const { grid, highTiles } = seededGrid(seed);
      for (const [x, y] of highTiles) {
        for (const f of exempt) expect(canAttackStructureAt(grid, f, x, y)).toBe(true);
      }
    }
  });

  it('no change to non-high-ground targeting: every family may attack on every non-high tile', () => {
    // The other half of the rule, and the one a too-broad predicate breaks. A
    // whole-board sweep, because "melee still works on flat ground" is the
    // regression a targeting change would cause and a spot check would miss.
    for (const seed of SEEDS) {
      const { grid } = seededGrid(seed);
      let checked = 0;
      for (let y = 0; y < GRID_H; y++) {
        for (let x = 0; x < GRID_W; x++) {
          if (grid.isHighGround(x, y)) continue;
          for (const f of cfg.highGround.families) {
            expect(canAttackStructureAt(grid, f, x, y)).toBe(true);
          }
          checked++;
        }
      }
      expect(checked).toBeGreaterThan(GRID_W * GRID_H * 0.5);
    }
  });

  it('a Burrower cannot surface on high ground but can anywhere else', () => {
    const burrower = familyOf('burrower');
    for (const seed of SEEDS) {
      const { grid, highTiles } = seededGrid(seed);
      for (const [x, y] of highTiles) expect(canSurfaceAt(grid, burrower, x, y)).toBe(false);
      for (let y = 0; y < GRID_H; y++) {
        for (let x = 0; x < GRID_W; x++) {
          if (grid.isHighGround(x, y)) continue;
          expect(canSurfaceAt(grid, burrower, x, y)).toBe(true);
        }
      }
    }
  });

  it('the rule still holds once a tower stands on the high tile', () => {
    // The whole point of the rule is a *built* tower, and `Grid.isHighGround`
    // reads `tile[i] === Open`. If occupancy moved a tile out of `Open`, every
    // assertion above would hold on empty cliffs and the rule would evaporate
    // the moment the player built there.
    const { grid, highTiles } = seededGrid(42);
    const [x, y] = highTiles[0];
    expect(grid.buildable(x, y)).toBe(true);
    grid.setOcc(x, y, 77);
    grid.refresh();
    expect(grid.isHighGround(x, y)).toBe(true);
    expect(canAttackStructureAt(grid, familyOf('husk'), x, y)).toBe(false);
    expect(canAttackStructureAt(grid, familyOf('spitter'), x, y)).toBe(true);
    expect(canSurfaceAt(grid, familyOf('burrower'), x, y)).toBe(false);
  });

  it('is inert on a Grid with no terrain applied', () => {
    // A flat arena (Training Grounds, and every run until the World wiring
    // lands) must behave exactly as it did before fb064i.
    const grid = new Grid();
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        for (const f of cfg.highGround.families) {
          expect(canAttackStructureAt(grid, f, x, y)).toBe(true);
          expect(canSurfaceAt(grid, f, x, y)).toBe(true);
        }
      }
    }
  });
});

describe('fb064i — the predicates are total and pure', () => {
  it('floors float coordinates, so an entity position works as a tile', () => {
    const { grid, highTiles } = seededGrid(42);
    const [x, y] = highTiles[0];
    const ground = familyOf('husk');
    expect(canAttackStructureAt(grid, ground, x + 0.5, y + 0.9)).toBe(false);
    expect(canSurfaceAt(grid, familyOf('burrower'), x + 0.01, y + 0.99)).toBe(false);
    // b007's class: `GRID_W` is even, so a raw `y + 0.5` fed to `idx()` lands
    // on a different, real tile. Flooring is what stops that.
    expect(canAttackStructureAt(grid, ground, x, y + 0.5)).toBe(false);
  });

  it('reads an off-board or junk coordinate as not-high, never as a block', () => {
    const { grid } = seededGrid(42);
    const ground = familyOf('husk');
    for (const [x, y] of [
      [-1, -1],
      [GRID_W, GRID_H],
      [1e9, 1e9],
      [NaN, 3],
      [3, NaN],
      [Infinity, 3],
    ] as Array<[number, number]>) {
      expect(canAttackStructureAt(grid, ground, x, y)).toBe(true);
      expect(canSurfaceAt(grid, ground, x, y)).toBe(true);
    }
  });

  it('familyForDef answers exactly like the uncached resolver, and caches per config', () => {
    // The merge calls this inside `moveEnemy`'s collision branch, so a wrong
    // cache key is a rule applied to the wrong enemy for a whole run.
    for (const [i, e] of enemies.entries()) {
      expect(familyForDef(cfg, i + 1, e.traits)).toBe(highGroundFamily(cfg, e.traits));
      expect(familyForDef(cfg, i + 1, e.traits)).toBe(highGroundFamily(cfg, e.traits));
    }
    // A re-parsed config gets its own table rather than the previous answers:
    // the Tuner's terrain page edits these rows live (fb064f).
    const permissive = withConfig((raw) => {
      const fams = (raw.highGround as { families: Array<Record<string, unknown>> }).families;
      for (const f of fams) f.attacksHigh = true;
    });
    const husk = enemies.find((e) => e.key === 'husk')!;
    expect(familyForDef(cfg, 1, husk.traits).attacksHigh).toBe(false);
    expect(familyForDef(permissive, 1, husk.traits).attacksHigh).toBe(true);
  });

  it('familyForDef re-resolves when the same def id brings a different trait list', () => {
    // QA bug 1: keyed on the def id alone, the first trait list ever seen for
    // an id wins forever — and `loadContent({ enemies })` can hand the same id
    // a different one (`src/devserver/tunerSave.ts` does). A parsed document
    // gives each def a fresh array, so identity is what distinguishes them.
    const asRanged: readonly string[] = ['ranged'];
    const asGround: readonly string[] = [];
    expect(familyForDef(cfg, 5, asRanged).key).toBe('ranged');
    expect(familyForDef(cfg, 5, asGround).key).toBe('ground');
    expect(familyForDef(cfg, 5, asRanged).key).toBe('ranged');
    // ...and the same array still hits the cache rather than re-scanning.
    expect(familyForDef(cfg, 5, asRanged)).toBe(highGroundFamily(cfg, asRanged));
  });

  it('does not mutate the grid, the config or the family', () => {
    const { grid, highTiles } = seededGrid(7);
    const before = Array.from(grid.terrainKind);
    const fam = familyOf('husk');
    const snapshot = JSON.stringify(fam);
    for (const [x, y] of highTiles) {
      canAttackStructureAt(grid, fam, x, y);
      canSurfaceAt(grid, fam, x, y);
    }
    expect(Array.from(grid.terrainKind)).toEqual(before);
    expect(JSON.stringify(fam)).toBe(snapshot);
    expect(canAttackStructureAt(grid, fam, highTiles[0][0], highTiles[0][1])).toBe(false);
  });
});

describe('fb064i — the loader refuses a silently-wrong family table', () => {
  it('accepts the shipped file', () => {
    expect(() => loadTerrain()).not.toThrow();
    expect(cfg.highGround.families.map((f) => f.key)).toEqual([
      'flier',
      'ranged',
      'burrower',
      'ground',
    ]);
  });

  it('refuses a trait listed twice inside one family', () => {
    expect(refusal((fams) => (fams[0].traits = ['flying', 'flying']))).toContain(
      'family "flier" lists trait "flying" twice',
    );
  });

  it('refuses a trait claimed twice — the later family could never apply', () => {
    expect(refusal((fams) => (fams[1].traits = ['ranged', 'flying']))).toContain(
      'trait "flying" is already claimed by family "flier"',
    );
  });

  it('refuses a duplicate family key', () => {
    expect(refusal((fams) => (fams[1].key = 'flier'))).toContain('duplicate family key "flier"');
  });

  it('refuses a catch-all that is not last — it hides every family below it', () => {
    expect(
      refusal((fams) =>
        fams.unshift({ key: 'everything', traits: [], attacksHigh: true, surfacesHigh: true }),
      ),
    ).toContain('matches every enemy and hides the 4 families after it');
  });

  it('refuses a table with no catch-all — classification would not be total', () => {
    expect(
      refusal((fams) => {
        fams.length = fams.length - 1;
      }),
    ).toContain('must name no traits: it is the catch-all');
  });

  it('refuses an empty family list, a missing section and an unknown field', () => {
    expect(() =>
      withConfig((raw) => {
        (raw.highGround as { families: unknown[] }).families = [];
      }),
    ).toThrow();
    expect(() =>
      withConfig((raw) => {
        delete raw.highGround;
      }),
    ).toThrow();
    expect(() =>
      withConfig((raw) => {
        const fams = (raw.highGround as { families: Array<Record<string, unknown>> }).families;
        fams[0].attacksLow = true;
      }),
    ).toThrow();
  });

  it('refuses an unbounded table — classification is a scan, run from a per-tick branch', () => {
    // fb064a's unbounded-loop lesson, applied to the one array this item adds.
    expect(() =>
      refusal((fams) => {
        const catchAll = fams[fams.length - 1];
        fams.length = 0;
        for (let i = 0; i < 70; i++) fams.push({ key: `f${i}`, traits: [`t${i}`], attacksHigh: false, surfacesHigh: false });
        fams.push(catchAll);
      }),
    ).not.toThrow();
    expect(refusal((fams) => (fams[0].traits = Array.from({ length: 65 }, (_, i) => `t${i}`)))).toBeTruthy();
  });

  it('accepts a re-tuned table — the rules are data, not code', () => {
    // The two-sided half of every refusal above: a designer must still be able
    // to hand ground melee the cliff, or add a family, without a code change.
    const permissive = withConfig((raw) => {
      const fams = (raw.highGround as { families: Array<Record<string, unknown>> }).families;
      for (const f of fams) f.attacksHigh = true;
    });
    const { grid, highTiles } = seededGrid(42);
    const [x, y] = highTiles[0];
    expect(canAttackStructureAt(grid, familyOf('husk', permissive), x, y)).toBe(true);
    // ...and it is still the shipped config that says otherwise.
    expect(canAttackStructureAt(grid, familyOf('husk'), x, y)).toBe(false);

    const extended = withConfig((raw) => {
      const fams = (raw.highGround as { families: Array<Record<string, unknown>> }).families;
      fams.splice(fams.length - 1, 0, {
        key: 'charger',
        traits: ['charges'],
        attacksHigh: true,
        surfacesHigh: false,
      });
    });
    expect(familyOf('charger', extended).key).toBe('charger');
    expect(canAttackStructureAt(grid, familyOf('charger', extended), x, y)).toBe(true);
    expect(familyOf('husk', extended).key).toBe('ground');
  });
});

describe('fb064i — the terrain kind and the rule agree', () => {
  it('a rule fires exactly on tiles whose kind is `high`', () => {
    // The rules key off `Grid.isHighGround`, which reads the *mask*. If the
    // mask and the kind buffer could disagree, every band fb064a measures
    // would describe a different board from the one these rules protect.
    const ground = familyOf('husk');
    for (const seed of [1, 42, 313]) {
      const { grid } = seededGrid(seed);
      for (let y = 1; y < GRID_H - 1; y++) {
        for (let x = 1; x < GRID_W - 1; x++) {
          const isHigh = grid.terrainKind[grid.idx(x, y)] === TerrainKind.High;
          expect(canAttackStructureAt(grid, ground, x, y)).toBe(!isHigh);
        }
      }
    }
  });
});
