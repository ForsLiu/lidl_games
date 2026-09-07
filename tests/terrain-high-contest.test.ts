/**
 * fb064m — SPEC-FINAL §10.5: a buildable high tile no enemy can reach is a
 * permanently invulnerable tower site.
 *
 * fb064a shipped `sealPockets`, which turns unreachable *walkable* ground into
 * rock, and recorded the hole it deliberately left: "`sealPockets` leaves
 * unreachable `high` tiles as high ground. Building is a click, not a walk, so
 * a stranded high plot is still usable — but it is a permanently un-meleeable
 * tower site." fb064i's rules turned that from theory into a stated rule,
 * because ground melee may not attack a tower on high ground *at all*:
 *
 *   - melee never reaches it (`ground.attacksHigh: false`, and high ground is
 *     not walkable so no ground enemy stands on it either);
 *   - the one authored flier never attacks structures (`enemies.ts:1422` puts
 *     the whole bump/breach branch behind `!e.flying`);
 *   - Burrowers cannot surface on it (`burrower.surfacesHigh: false`);
 *   - so the only enemy that can damage a tower on high ground during an
 *     Act I wave is the **Spitter**, at `attackRange: 4`, measured as a
 *     plain Euclidean distance with no line-of-sight term
 *     (`nearestStructureWithin`, `enemies.ts:1258`).
 *
 * A high tile with no walkable tile inside that radius is therefore a plot the
 * player can build on and no wave can ever answer. `data/terrain.json`'s
 * `highContestRadius` is that number, and the generator demotes any high tile
 * outside it to rock.
 *
 * **Two limits on that premise, stated so this file is not read as a claim it
 * does not make.** (a) fb064i's predicates have no call site in `src/` yet —
 * `canAttackStructureAt` is wired at the lane merge, and until then a walker
 * bumping the cliff tile still reaches `attackStructure` (`enemies.ts:1459`).
 * The generator is built against the rule, not against today's behaviour.
 * (b) The Spitter's structure branch is `else if (!act2)` (`enemies.ts:1219`),
 * so in the Act II VS phase it hunts the Warden and attacks no structure at
 * all: during Act II every high-ground tower is uncontestable at any radius.
 * That residual is a wave/enemy question, not a generation one, and is filed
 * for the main lane in BACKLOG-TERRAIN.md's Log. What this file pins is the
 * part generation owns — the *geometry* never denies the contest.
 *
 * Measured on the shipped data with the repair disabled (`highContestRadius: 0`),
 * seeds 1..500 at 56x32 with fb156's 4-gate layout: **32 seeds (6.40%) carry
 * 155 such plots**, worst seed 75 with 21. `data/towers.json` `buildRange` is
 * 4, but `data/classes.json`'s Engineer passive adds +2 and `data/tree.json`
 * node 22 (`watchtowers`) adds +1, so a real run builds at range 5-7. (At
 * 56x32 with the old 3-gate layout this read 26 seeds, 99 plots, worst seed
 * 422 with 14 — the fourth gate moves both which seeds carry an exposed plot
 * and how many, since it changes where the generator's protected corridors
 * run.)
 *
 * Every measurement in this file is re-derived here, tile by tile, rather than
 * read back from `uncontestedHigh` — the generator's own repair calls that
 * function, so asserting with it would restate the repair instead of testing it
 * (fb064j's `legalUnder` mistake, recorded in BACKLOG-TERRAIN.md's Log).
 */

import { describe, expect, it } from 'vitest';

import enemiesRaw from '../data/enemies.json';
import terrainRaw from '../data/terrain.json';
import { GRID_H, GRID_W } from '../src/sim/grid';
import {
  generateTerrain,
  highGroundFamily,
  isWalkable,
  loadTerrain,
  measureTerrain,
  parseTerrain,
  terrainLegal,
  TerrainKind,
  uncontestedHigh,
  type TerrainConfig,
  type TerrainGrid,
} from '../src/sim/terrain';

const cfg = loadTerrain();

/** The same config with the repair switched off — fb064a's generator here. */
const off: TerrainConfig = parseTerrain({ ...terrainRaw, highContestRadius: 0 });

const SWEEP = 500;

/*
 * fb155 retired this file's `RANGED_DEFAULT_RANGE`. `enemies.ts` used to read
 * `def.attackRange ?? 4`, so a `ranged` enemy authored with no range attacked
 * structures at 4 while reading as "no reach" here — the hole this constant
 * mirrored. Every enemy now authors an `attackRange` and the schema requires
 * it, so the default has nothing left to stand in for and the map below reads
 * the field directly.
 */

/**
 * Every reach that can put a structure on high ground under attack.
 *
 * Gated on the `ranged` **trait**, not on family membership alone, because that
 * is what `enemies.ts:1211` gates its structure-damage branch on. The other
 * `attacksHigh` family is `flier`, and its one member (`gale_imp`) authors no
 * `melee` **attack kind** (fb155) *and* cannot reach a structure at all — `enemies.ts:1422` puts
 * the whole bump/breach block behind `!e.flying`. Including it would invent a
 * reach for an enemy that has none.
 *
 * Reads `attackRange` only, so a future high-capable AoE authored the Colossus
 * way (`stompRadius`, `enemies.ts:1178`) would be invisible here — the safe
 * direction, since a missed longer reach only leaves the radius stricter than
 * it needs to be, but worth widening the moment such an enemy is authored into
 * a family with `attacksHigh: true`.
 */
const ROSTER_REACHES: number[] = enemiesRaw.enemies
  .filter((def) => (def.traits ?? []).includes('ranged'))
  .filter((def) => highGroundFamily(cfg, def.traits ?? []).attacksHigh)
  .map((def) => (def as { attackRange: number }).attackRange);

/**
 * The shortest of them, and the number the acceptance clause is written against
 * ("within the shortest authored enemy attack range") — not
 * `cfg.highContestRadius`, so the sweep below measures at it directly.
 *
 * The two are equal on the shipped data and the first test pins
 * `highContestRadius <= ROSTER_MIN_REACH`, but stating the acceptance verbatim
 * keeps the sweep honest if a data edit ever lowers the radius: a stricter
 * radius must still satisfy the looser clause. Derived at module scope rather
 * than inside a test, so no assertion here depends on another having run first.
 */
const ROSTER_MIN_REACH = Math.min(...ROSTER_REACHES);

/**
 * Flat indices of every `high` tile with no walkable tile within `radius`,
 * re-derived from the tiles alone.
 *
 * Distance is centre-to-centre Euclidean, which is the *conservative* reading:
 * an enemy is a continuous position inside a walkable tile, so a tile whose
 * centre is within range certainly holds a standable point within range, while
 * one whose centre is outside might still hold one near its edge. Erring that
 * way can only ever call a contested plot uncontested — it can never miss one.
 */
function exposedHigh(map: TerrainGrid, radius: number): number[] {
  const walkable: Array<[number, number]> = [];
  for (let i = 0; i < map.kind.length; i++) {
    if (isWalkable(cfg, map.kind[i])) walkable.push([i % map.w, (i / map.w) | 0]);
  }
  const out: number[] = [];
  const r2 = radius * radius;
  for (let i = 0; i < map.kind.length; i++) {
    if (map.kind[i] !== TerrainKind.High) continue;
    const x = i % map.w;
    const y = (i / map.w) | 0;
    let contested = false;
    for (const [wx, wy] of walkable) {
      if ((wx - x) * (wx - x) + (wy - y) * (wy - y) <= r2) {
        contested = true;
        break;
      }
    }
    if (!contested) out.push(i);
  }
  return out;
}

describe('fb064m — no uncontestable high-ground plot', () => {
  it('the shipped radius is the Spitter range, and never longer than the roster allows', () => {
    // The number belongs to `data/terrain.json` (architecture rule 4), but it is
    // only correct relative to `data/enemies.json`. A loader rule reading the
    // other file would be this lane's recorded false-rejection shape — and
    // unsound besides, since `loadContent({ enemies })` swaps the roster the
    // classifier runs against (fb064i). So the cross-check lives here, where a
    // content-lane range cut costs a red CI line instead of a dead game.
    expect(ROSTER_REACHES).toEqual([4]);
    expect(cfg.highContestRadius).toBeLessThanOrEqual(ROSTER_MIN_REACH);
    expect(cfg.highContestRadius).toBeGreaterThan(0);

    // The `flier` family is the other `attacksHigh` row, and it contributes no
    // reach — pinned so its absence from `ROSTER_REACHES` reads as a decision
    // rather than as the filter having quietly dropped an enemy.
    const fliers = enemiesRaw.enemies.filter(
      (def) => highGroundFamily(cfg, def.traits ?? []).key === 'flier',
    );
    expect(fliers.map((d) => d.key)).toEqual(['gale_imp']);
    for (const def of fliers) {
      // fb155: every enemy authors an `attackRange` now, so "has no range" is
      // no longer the way to say "cannot shoot high ground from below". The
      // claim is the kind: a melee flier reaches only its own contact radius.
      expect((def as { attackKind?: string }).attackKind).toBe('melee');
      expect(def.traits ?? []).not.toContain('ranged');
    }
  });

  it(`no generated map carries an uncontestable high plot, over seeds 1..${SWEEP}`, () => {
    const offenders: Array<{ seed: number; plots: number }> = [];
    for (let s = 1; s <= SWEEP; s++) {
      const map = generateTerrain(s, cfg);
      const bad = exposedHigh(map, ROSTER_MIN_REACH);
      if (bad.length > 0) offenders.push({ seed: s, plots: bad.length });
    }
    expect(offenders).toEqual([]);
  });

  it('the repair is load-bearing: with it off, the same sweep is not clean', () => {
    // Two-sided. Without this the assertion above would also pass on a
    // generator that simply never places high ground, and on a re-derivation
    // that cannot fail.
    let seeds = 0;
    let plots = 0;
    let worst = { seed: 0, plots: 0 };
    for (let s = 1; s <= SWEEP; s++) {
      const bad = exposedHigh(generateTerrain(s, off), cfg.highContestRadius);
      if (bad.length === 0) continue;
      seeds++;
      plots += bad.length;
      if (bad.length > worst.plots) worst = { seed: s, plots: bad.length };
    }
    // The measured band, recorded as numbers so a retune's cost is a diff.
    // Re-measured at fb156's 4-gate layout (was 26 seeds, 99 plots, worst 422/14
    // at the 3-gate 56x32 layout).
    expect(seeds).toBe(32);
    expect(plots).toBe(155);
    expect(worst).toEqual({ seed: 75, plots: 21 });
  });

  it('the recorded band is a 1..500 statistic, and the domain tail is worse', () => {
    // QA bug 2. The band above is what a designer reading "what does the veto
    // cost" would take away, and `1..500` is not the domain a run seed draws
    // from (`[-2**31, 2**32-1]`, fb064j) — the exact mistake this lane has now
    // recorded three times. The rate moves a little (7.4% domain-wide against
    // 6.40% here) and the tail is much worse: the worst seed found over a
    // 30,000-seed domain sweep carries 29 plots against this window's 21.
    // (Re-measured at fb156's 4-gate layout; the previous witness, seed 27238,
    // carries zero exposed plots at this gate layout — the 4th gate's own
    // protected corridor happens to run near its former high shelf.)
    //
    // Pinned as a second window plus that named seed rather than by widening
    // the sweep above, which would cost minutes for a number that is a
    // statistic either way.
    let seeds = 0;
    let plots = 0;
    let worst = { seed: 0, plots: 0 };
    for (let s = -500; s <= -1; s++) {
      const bad = exposedHigh(generateTerrain(s, off), ROSTER_MIN_REACH);
      if (bad.length === 0) continue;
      seeds++;
      plots += bad.length;
      if (bad.length > worst.plots) worst = { seed: s, plots: bad.length };
    }
    expect({ seeds, plots, worst }).toEqual({
      seeds: 37,
      plots: 102,
      worst: { seed: -32, plots: 14 },
    });

    // The named worst of a 30,000-seed domain sweep (stride 143173 from 11),
    // and the repair answers it too.
    expect(exposedHigh(generateTerrain(2631376578, off), ROSTER_MIN_REACH).length).toBe(29);
    expect(exposedHigh(generateTerrain(2631376578, cfg), ROSTER_MIN_REACH)).toEqual([]);
  });

  it('demotes exactly the uncontestable plots and nothing else', () => {
    // The named worst seeds from the 1..500 sweep above, re-picked at fb156's
    // 4-gate layout: 75 is the worst, 285 the second-worst, and 123 a third
    // distinct reading, so the three cover the range rather than clustering at
    // the top. (At the 3-gate 56x32 layout this used 422/323/98; none of the
    // three carries an uncontestable plot with the 4th gate open.)
    for (const [seed, expected] of [
      [75, 21],
      [285, 17],
      [123, 14],
    ] as const) {
      const bare = generateTerrain(seed, off);
      const fixed = generateTerrain(seed, cfg);
      const bad = new Set(exposedHigh(bare, cfg.highContestRadius));
      expect(bad.size).toBe(expected);
      expect(exposedHigh(fixed, cfg.highContestRadius)).toEqual([]);
      for (let i = 0; i < bare.kind.length; i++) {
        if (bad.has(i)) {
          expect([seed, i, bare.kind[i], fixed.kind[i]]).toEqual([
            seed,
            i,
            TerrainKind.High,
            TerrainKind.Rock,
          ]);
        } else {
          expect([seed, i, fixed.kind[i]]).toEqual([seed, i, bare.kind[i]]);
        }
      }
    }
  });

  it('costs no band: every measure is identical with the repair on and off', () => {
    // Exact, not sampled, and it is the reason this constraint was affordable:
    // `high` and `rock` are both non-walkable and both non-normal, so demoting
    // one to the other moves no numerator and no denominator of any band.
    // `walkableFrac`, `buildableNormalFrac`, `gateReachFrac`, `coreLegalFrac`,
    // `corridorsOk` and the two gate booleans are all functions of the walkable
    // set and the normal set alone.
    let differed = 0;
    for (let s = 1; s <= SWEEP; s++) {
      const bare = generateTerrain(s, off);
      const fixed = generateTerrain(s, cfg);
      // Same attempt count and the same effective key: the repair cannot make a
      // legal map degenerate, so no seed takes an extra retry because of it.
      expect([s, fixed.seed, fixed.attempts, fixed.fallback]).toEqual([
        s,
        bare.seed,
        bare.attempts,
        false,
      ]);
      expect(measureTerrain(fixed, cfg)).toEqual(measureTerrain(bare, off));
      expect(terrainLegal(measureTerrain(fixed, cfg), cfg)).toBe(true);
      if (fixed.hash !== bare.hash) differed++;
    }
    // ... while the maps themselves really did change on the affected seeds.
    expect(differed).toBe(32);
  });

  it('the radius is capped at the arena span, and 0 is the accept-the-exposure veto', () => {
    const span = Math.max(GRID_W, GRID_H);
    expect(() => parseTerrain({ ...terrainRaw, highContestRadius: span })).not.toThrow();
    expect(() => parseTerrain({ ...terrainRaw, highContestRadius: span + 1 })).toThrow();
    expect(() => parseTerrain({ ...terrainRaw, highContestRadius: -1 })).toThrow();
    expect(() => parseTerrain({ ...terrainRaw, highContestRadius: 2.5 })).toThrow();
    // 0 loads: it is the designer's documented way to accept the exposure
    // without a code edit, and it is what the control runs above are measured
    // against.
    expect(off.highContestRadius).toBe(0);
    // A radius wider than the arena demotes nothing, because every high tile
    // has a walkable tile somewhere within the span.
    const wide = parseTerrain({ ...terrainRaw, highContestRadius: span });
    const map = generateTerrain(409, wide);
    let high = 0;
    for (let i = 0; i < map.kind.length; i++) if (map.kind[i] === TerrainKind.High) high++;
    expect(high).toBeGreaterThan(0);
    expect(exposedHigh(map, span)).toEqual([]);
  });
});

describe('uncontestedHigh — the exported analyzer', () => {
  /**
   * A hand-built grid, deliberately not the generator's output.
   *
   * QA bug 1: `uncontestedHigh` went into `src/sim/terrain/index.ts` with a
   * stated contract ("flat indices of every `high` tile ...") and a `radius`
   * parameter, and nothing called it — the sweeps above re-derive on purpose,
   * which tests the *repair* and leaves the *function* unpinned. Three mutants
   * survived the whole terrain suite and `tsc`: returning rock indices as well,
   * ignoring the explicit `radius` argument, and dropping the export.
   *
   * `W` wide by `H` tall, all rock, with one walkable normal tile in the
   * bottom row and `high` tiles at chosen distances above it. Non-square and
   * not the arena's own dimensions (56x32, post-fb166; 36x20 before it), so a
   * scan that reached for `GRID_W`/`GRID_H` instead of `map.w`/`map.h` is
   * caught too.
   */
  const W = 11;
  const H = 9;
  const at = (x: number, y: number): number => y * W + x;
  function grid(
    highTiles: ReadonlyArray<readonly [number, number]>,
    walkTiles: ReadonlyArray<readonly [number, number]> = [[5, 8]],
  ): TerrainGrid {
    const kind = new Uint8Array(W * H).fill(TerrainKind.Rock);
    for (const [x, y] of walkTiles) kind[at(x, y)] = TerrainKind.Normal;
    for (const [x, y] of highTiles) kind[at(x, y)] = TerrainKind.High;
    return { w: W, h: H, kind };
  }

  it('returns a high tile exactly when no walkable tile is inside the radius', () => {
    // (5,3) is 5 tiles above the walkable tile; (5,4) is 4.
    const map = grid([
      [5, 3],
      [5, 4],
    ]);
    expect(uncontestedHigh(map, cfg, 4)).toEqual([at(5, 3)]);
    expect(uncontestedHigh(map, cfg, 5)).toEqual([]);
    expect(uncontestedHigh(map, cfg, 3)).toEqual([at(5, 3), at(5, 4)]);
  });

  it('never returns a tile that is not high, however far from walkable it is', () => {
    // (0,0) is rock at distance sqrt(89) ~ 9.43 — further from the walkable
    // tile than any high tile here, and still not this function's business.
    const map = grid([[5, 3]]);
    expect(map.kind[at(0, 0)]).toBe(TerrainKind.Rock);
    expect(uncontestedHigh(map, cfg, 4)).not.toContain(at(0, 0));
    expect(uncontestedHigh(map, cfg, 10)).toEqual([]);
  });

  it('the explicit radius overrides the config, in both directions', () => {
    const map = grid([[5, 3]]);
    // Default = cfg (4), which reports it; a wider explicit radius does not.
    expect(uncontestedHigh(map, cfg)).toEqual([at(5, 3)]);
    expect(uncontestedHigh(map, cfg, 6)).toEqual([]);
    // Default = off (0), which reports nothing; an explicit radius still does.
    expect(uncontestedHigh(map, off)).toEqual([]);
    expect(uncontestedHigh(map, off, 4)).toEqual([at(5, 3)]);
  });

  it('radius 0 is off, not "demote everything"', () => {
    // The direction matters: at radius 0 the distance test `0 <= 0` is only
    // satisfied by the high tile itself, which is never walkable — so a guard
    // that fell through would return *every* high tile and the veto setting
    // would delete all high ground instead of keeping it.
    const map = grid([
      [5, 3],
      [5, 4],
      [2, 2],
    ]);
    expect(uncontestedHigh(map, cfg, 0)).toEqual([]);
    expect(uncontestedHigh(map, cfg, -1)).toEqual([]);
  });

  it('clamps to the grid it was handed, so the scan cannot wrap into the next row', () => {
    // The mutation that found this hole: `Math.min(map.w - 1, ...)` ->
    // `Math.min(35, ...)`. On the 36-wide arena the two are identical, so every
    // generator-driven assertion in this file is blind to it — and `analyze.ts`
    // already records why that matters (`gateIndices`: "the moment a
    // `TerrainGrid` of another width exists — fb064f's flat Training Grounds
    // arena is the announced case — a hardcoded stride would flood from the
    // wrong tiles silently instead of failing").
    //
    // A high tile in the rightmost column with the only walkable tile at the
    // *start of the next row*: `ny * w + nx` at `nx === w` is exactly that
    // tile, so an unclamped x-bound reads it and calls the plot contested at
    // radius 1, from 10.05 tiles away.
    const map = grid([[W - 1, 2]], [[0, 3]]);
    expect(map.kind[2 * W + W]).toBe(TerrainKind.Normal);
    expect(uncontestedHigh(map, cfg, 1)).toEqual([at(W - 1, 2)]);
    // ...and it is still found contested when a walkable tile really is near.
    expect(uncontestedHigh(grid([[W - 1, 2]], [[W - 2, 2]]), cfg, 1)).toEqual([]);
  });

  it('does not mutate the grid it measures', () => {
    const map = grid([[5, 3]]);
    const before = Uint8Array.from(map.kind);
    uncontestedHigh(map, cfg, 4);
    expect(Array.from(map.kind)).toEqual(Array.from(before));
  });
});
