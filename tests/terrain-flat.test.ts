/**
 * fb064n — the flat arena has a name.
 *
 * Before this item the flat arena was three unnamed constructions: the base
 * `attempt()` scatters over, the map `generateTerrain` ships after
 * `maxAttempts` degenerate seeds, and `flatCoreAnchorCount`'s geometric
 * re-derivation of it in `config.ts` (a fourth, `synthetic(Normal)`, lives in
 * `terrain-generation.test.ts`). fb064f's Training Grounds override needs it as
 * a `TerrainMap`, and a fourth construction site is where they would stop
 * agreeing.
 *
 * What this file pins, in the order fb064n's acceptance asks for it:
 *   1. the refactor is behaviour-preserving — a golden on the tiles and on the
 *      hash, so "one builder" cannot quietly become "one *different* builder";
 *   2. the map is legal at the shipped config, and legality is still a question
 *      about a config rather than a property of the map;
 *   3. the buffer is per-call, because a `TerrainMap`'s hash is computed once
 *      and a shared `kind` would let one caller's write invalidate another's;
 *   4. `describeTerrain` round-trips it — this is the map that broke the dump
 *      parser's `attempts >= 1` floor;
 *   5. `terrainOverlay` + `applyTerrain` leave every interior tile buildable
 *      and every gate reachable, which is the property the Training Grounds
 *      override is actually buying;
 *   6. `config.ts`'s replica is pinned equal to it (it cannot be deleted:
 *      `analyze.ts` imports `config.ts`, so measuring there is an import
 *      cycle).
 */

import { describe, expect, it } from 'vitest';

import { GATES, GRID_H, GRID_W, Grid } from '../src/sim/grid';
import {
  describeTerrain,
  flatCoreAnchorCount,
  flatTerrain,
  generateTerrain,
  isDegradedMap,
  legalCoreAnchors,
  loadTerrain,
  measureTerrain,
  parseTerrain,
  parseTerrainDump,
  terrainHash,
  terrainLegal,
  terrainOverlay,
  TerrainKind,
  type TerrainConfig,
  type TerrainMap,
} from '../src/sim/terrain';

const cfg = loadTerrain();

function withConfig(patch: (raw: Record<string, unknown>) => void): TerrainConfig {
  const raw = JSON.parse(JSON.stringify(cfg)) as Record<string, unknown>;
  patch(raw);
  return parseTerrain(raw);
}

/**
 * The flat arena rebuilt from its written definition, independently of
 * `generate.ts`. The golden below compares against *this*, not against a
 * snapshot taken from the code under test, so it pins the definition ("rock
 * border, walkable gate tiles, normal interior") rather than whatever the
 * refactor happened to produce.
 */
function expectedFlatKinds(): Uint8Array {
  const kind = new Uint8Array(GRID_W * GRID_H).fill(TerrainKind.Normal);
  for (let x = 0; x < GRID_W; x++) {
    kind[x] = TerrainKind.Rock;
    kind[(GRID_H - 1) * GRID_W + x] = TerrainKind.Rock;
  }
  for (let y = 0; y < GRID_H; y++) {
    kind[y * GRID_W] = TerrainKind.Rock;
    kind[y * GRID_W + GRID_W - 1] = TerrainKind.Rock;
  }
  for (const g of GATES) kind[g.ty * GRID_W + g.tx] = TerrainKind.Normal;
  return kind;
}

/** A config no seed can clear, so `generateTerrain` reaches its flat fallback. */
const impossible = withConfig((raw) => {
  (raw.constraints as Record<string, number>).minCoreLegalFrac = 0.9;
});

describe('fb064n — flatTerrain is the one flat arena', () => {
  it('golden: tiles byte-identical to the map the fallback used to build', () => {
    const flat = flatTerrain();
    expect(Array.from(flat.kind)).toEqual(Array.from(expectedFlatKinds()));
    // Counts, so a diff reads as a shape rather than as many numbers. The
    // border is the arena's perimeter minus whichever gate tiles land on it,
    // punched back to normal: 2*(GRID_W + GRID_H) - 4 = 172 tiles of border on
    // the 56x32 grid. That used to be "less 3 gates" because all three sat on
    // the perimeter at 36x20; fb166's resize left `GATES`' literal coordinates
    // behind it (BACKLOG-TERRAIN.md's 2026-09-06 fb166-filing log) — `west`
    // (0,10) and `north` (18,0) still land on an edge tile, but `east`
    // (35,17) is now 20 tiles short of the new x=55 border, deep in the
    // interior, so punching it "back to normal" is a no-op on a tile that was
    // never rock. Counting border gates, rather than assuming `GATES.length`,
    // keeps this golden honest about which geometry it is actually measuring.
    const border = 2 * (GRID_W + GRID_H) - 4;
    const gatesOnBorder = GATES.filter(
      (g) => g.tx === 0 || g.tx === GRID_W - 1 || g.ty === 0 || g.ty === GRID_H - 1,
    ).length;
    let rock = 0;
    for (const k of flat.kind) if (k === TerrainKind.Rock) rock++;
    expect(gatesOnBorder).toBe(2);
    expect(rock).toBe(border - gatesOnBorder);
    expect(rock).toBe(170);
    expect(flat.kind.length - rock).toBe(GRID_W * GRID_H - 170);
    // The hash is the G2 determinism handle, so it is pinned as a literal too:
    // an equal-tiles assertion would still pass if `terrainHash` changed what
    // it folds, and every replay guard downstream reads this string.
    expect(flat.hash).toBe(terrainHash(0, expectedFlatKinds()));
    expect(flat.hash).toBe('049bf17f');
  });

  it('the maxAttempts fallback ships exactly this map', () => {
    // The refactor's whole claim. `generateTerrain`'s fallback now routes
    // through the same builder; if it ever forks, these tiles diverge.
    const fell = generateTerrain(11, impossible);
    expect(fell.fallback).toBe(true);
    expect(Array.from(fell.kind)).toEqual(Array.from(flatTerrain().kind));
  });

  it('provenance is honest: no seed produced these tiles', () => {
    const flat = flatTerrain();
    // `fallback: true` is `types.ts`'s existing marker for "not any key's
    // output", and it must be set here even though nothing failed — the field
    // describes the map, not the reason for it.
    expect(flat.fallback).toBe(true);
    // `attempts: 0` is what distinguishes the arena asked for directly from
    // the arena reached by exhausting the retry budget. Both are flat; only
    // one of them means the bands rejected every seed.
    expect(flat.attempts).toBe(0);
    expect(generateTerrain(11, impossible).attempts).toBe(impossible.maxAttempts);
    expect(flat.requestedSeed).toBe(0);
    expect(flat.seed).toBe(0);
    // Seed 0 is a legitimate seed and its real map is nothing like this one,
    // so `seed: 0` here cannot be mistaken for "the map seed 0 generates".
    const real = generateTerrain(0, cfg);
    expect(real.fallback).toBe(false);
    expect(real.attempts).toBe(1);
    expect(real.hash).not.toBe(flat.hash);
    expect(Array.from(real.kind)).not.toEqual(Array.from(flat.kind));
  });

  it('hands out a private buffer every call', () => {
    const a = flatTerrain();
    const b = flatTerrain();
    expect(a.kind).not.toBe(b.kind);
    expect(a.hash).toBe(b.hash);
    // A `TerrainMap`'s hash is computed once at construction, so a shared
    // buffer would let one caller's write silently invalidate the other's
    // determinism handle (architecture rule 2).
    a.kind[GRID_W + 1] = TerrainKind.Rock;
    expect(b.kind[GRID_W + 1]).toBe(TerrainKind.Normal);
    expect(Array.from(flatTerrain().kind)).toEqual(Array.from(expectedFlatKinds()));
    // Same for the fallback path, which shares the builder.
    expect(generateTerrain(11, impossible).kind).not.toBe(generateTerrain(11, impossible).kind);
  });

  it('takes no config because no config selects a tile of it', () => {
    // The signature deviates from fb064n's `flatTerrain(cfg)` wording, and this
    // is the evidence for the deviation: the flat arena is a function of
    // `GRID_W`/`GRID_H`/`GATES` and `TERRAIN_KEYS`' fixed order, so a `cfg`
    // parameter would have been a lie to a Tuner caller.
    const wild = withConfig((raw) => {
      (raw.density as Record<string, number>).rock = 0.3;
      (raw.density as Record<string, number>).rough = 0;
      (raw.density as Record<string, number>).high = 0;
      (raw as Record<string, unknown>).plazaRadius = 1;
      (raw as Record<string, unknown>).corridorRadius = 1;
      (raw as Record<string, unknown>).coreGateClearance = 8;
      (raw.constraints as Record<string, number>).minCoreLegalFrac = 0;
    });
    // Nothing above can reach the flat map, so the *measurements* differ while
    // the tiles do not.
    expect(Array.from(flatTerrain().kind)).toEqual(Array.from(expectedFlatKinds()));
    expect(measureTerrain(flatTerrain(), wild).legalCoreCount).not.toBe(
      measureTerrain(flatTerrain(), cfg).legalCoreCount,
    );
  });
});

describe('fb064n — legality is a question about a config', () => {
  it('is legal at the shipped config', () => {
    const flat = flatTerrain();
    const m = measureTerrain(flat, cfg);
    expect(terrainLegal(m, cfg)).toBe(true);
    expect(m.gatesOpen).toBe(true);
    expect(m.gatesConnected).toBe(true);
    expect(m.corridorsOk).toBe(true);
    expect(m.gateReachFrac).toBe(1);
    // The most permissive layout the arena admits: no walkable tile is
    // unreachable and every non-border tile is normal.
    expect(m.walkableCount).toBe(GRID_W * GRID_H - 170);
    expect(m.normalCount).toBe(m.walkableCount);
  });

  it('is not legal unconditionally, so callers must still ask', () => {
    // This is why `flatTerrain` does not assert its own legality, and why
    // `fallback: true` with `attempts >= 1` means "the bands rejected every
    // seed" rather than "this map is fine": `minCoreLegalFrac: 0.9` loads
    // (the ceiling is `a / (a + 1)` = 0.999, not the flat map's own 0.8785,
    // at the shipped `coreGateClearance: 3` on the 56x32 grid) and the flat
    // map does not meet it.
    expect(terrainLegal(measureTerrain(flatTerrain(), impossible), impossible)).toBe(false);
    expect(measureTerrain(flatTerrain(), impossible).coreLegalFrac).toBeLessThan(0.9);
    // A band above the arena's own ceiling never gets this far: the loader
    // refuses it, which is the layer that keeps "flat map illegal" a statement
    // about a payable config rather than about a typo. Worth pinning here
    // because the walkable ceiling is derived from *this* map's border.
    expect(() =>
      withConfig((raw) => {
        (raw.constraints as Record<string, number>).minWalkableFrac = 0.906;
      }),
    ).toThrow(/0\.906/);
    // And the ceiling really is the flat map's share, to six places.
    expect(measureTerrain(flatTerrain(), cfg).walkableFrac).toBeCloseTo(0.905134, 6);
  });
});

describe('fb064n — flatTerrain through the rest of the module', () => {
  it('describeTerrain round-trips it', () => {
    // This map is why `parseTerrainDump`'s `attempts` floor moved from 1 to 0:
    // it is the first map that honestly reports zero attempts, and under the
    // old floor its own dump would not reload.
    const flat = flatTerrain();
    const text = describeTerrain(flat, cfg);
    const back = parseTerrainDump(text);
    expect(Array.from(back.kind)).toEqual(Array.from(flat.kind));
    expect(back.provenance).toEqual({
      requestedSeed: 0,
      seed: 0,
      attempts: 0,
      fallback: true,
      hash: flat.hash,
    });
    // Re-dumping the reloaded map reproduces the string byte for byte.
    expect(describeTerrain({ ...back.provenance!, w: GRID_W, h: GRID_H, kind: back.kind }, cfg)).toBe(
      text,
    );
  });

  it('still refuses a negative attempt count', () => {
    // The floor moved to 0, not away. `attempts` counts attempts.
    const text = describeTerrain(flatTerrain(), cfg).replace('attempts=0', 'attempts=-1');
    expect(() => parseTerrainDump(text)).toThrow(/attempts/);
  });

  it('refuses an attempts=0 dump that is not the flat arena', () => {
    // QA finding on this item: widening the floor to 0 removed the only
    // constraint on `attempts`, so a fourth provenance shape became parseable —
    // one no writer can emit. `attempts: 0` has exactly one producer, and it is
    // always `requested=0 effective=0 fallback=true`.
    const good = describeTerrain(flatTerrain(), cfg);
    expect(() => parseTerrainDump(good.replace('fallback=true', 'fallback=false'))).toThrow(
      /attempts=0 is only the flat arena/,
    );
    // A forged effective seed passes the hash check on its own, because the
    // hash is re-derived from the seed the dump claims. Only the cross-field
    // rule catches it.
    const forged = good
      .replace('effective=0', 'effective=12345')
      .replace(/hash=[0-9a-f]+/, `hash=${terrainHash(12345, flatTerrain().kind)}`);
    expect(() => parseTerrainDump(forged)).toThrow(/attempts=0 is only the flat arena/);
    // The generator can never reach the shape from the other side either:
    // `maxAttempts` is a positive int, so its fallback always reports >= 1.
    expect(generateTerrain(11, impossible).attempts).toBeGreaterThanOrEqual(1);
  });

  it('refuses -0 as a second spelling of 0', () => {
    // Also QA's: `num` used to normalise `-0` to `0`, which made the dump not
    // text-stable — `attempts=-0` reloaded and re-dumped as `attempts=0`, so a
    // "round trip" changed the string. The leading-zero rule says one spelling
    // per value; this is the same rule.
    const good = describeTerrain(flatTerrain(), cfg);
    for (const mangled of ['attempts=-0', 'effective=-0', 'requested=-0']) {
      const [key] = mangled.split('=');
      const text = good.replace(new RegExp(`${key}=0(?= )`), mangled);
      expect(text, mangled).not.toBe(good);
      expect(() => parseTerrainDump(text), mangled).toThrow(/-0 and 0 are one value/);
    }
  });

  it('isDegradedMap separates the two flat maps', () => {
    // The reason the predicate is exported rather than left to each consumer:
    // both maps carry `fallback: true`, and only one of them means something
    // went wrong.
    expect(isDegradedMap(flatTerrain())).toBe(false);
    expect(isDegradedMap(generateTerrain(11, impossible))).toBe(true);
    expect(isDegradedMap(generateTerrain(0, cfg))).toBe(false);
    // Every non-flat map reports at least one attempt, which is what makes the
    // pair a partition rather than two overlapping flags.
    for (const s of [0, 1, 11, -1, 2 ** 31]) {
      expect(generateTerrain(s, cfg).attempts, `seed ${s}`).toBeGreaterThanOrEqual(1);
    }
  });

  it('applies to a Grid as an all-buildable arena with every gate reachable', () => {
    const g = new Grid();
    g.applyTerrain(terrainOverlay(flatTerrain(), cfg));
    expect(g.allGatesReachable()).toBe(true);
    const origin = g.coreOrigin();
    for (let y = 1; y < GRID_H - 1; y++) {
      for (let x = 1; x < GRID_W - 1; x++) {
        const onGate = GATES.some((gate) => gate.tx === x && gate.ty === y);
        const onCore =
          x >= origin.tx && x < origin.tx + 2 && y >= origin.ty && y < origin.ty + 2;
        expect(g.passable(x, y), `passable ${x},${y}`).toBe(true);
        expect(g.isHighGround(x, y), `high ${x},${y}`).toBe(false);
        // Gate and Core tiles are structurally unbuildable on every map; every
        // other interior tile is open ground, which is what "flat arena" means.
        if (!onGate && !onCore) expect(g.buildable(x, y), `buildable ${x},${y}`).toBe(true);
      }
    }
    for (const gate of GATES) {
      const path = g.gatePath(gate);
      expect(path.length, gate.key).toBeGreaterThan(0);
      expect(
        path.some((p) => p.breach),
        gate.key,
      ).toBe(false);
    }
  });
});

describe('fb064n — the config.ts replica stays pinned to it', () => {
  it('flatCoreAnchorCount equals legalCoreAnchors on flatTerrain', () => {
    // `config.ts` re-derives the flat map's legal anchors geometrically because
    // `analyze.ts` imports it and measuring would be an import cycle — so the
    // replica cannot be deleted, only pinned. fb064g pinned it against the test
    // file's own `synthetic(Normal)`; this pins it against the shipped builder,
    // which is what `maxCoreLegalFrac`'s proof actually talks about.
    const flat = flatTerrain();
    for (const clearance of [0, 1, 3, 8, 12, 16, 17, 36]) {
      const at = withConfig((raw) => {
        (raw as Record<string, unknown>).coreGateClearance = clearance;
        (raw.constraints as Record<string, number>).minCoreLegalFrac = 0;
      });
      expect(legalCoreAnchors(flat, at).length, `clearance ${clearance}`).toBe(
        flatCoreAnchorCount(clearance),
      );
    }
  });
});

describe('fb064s — the flat arena says so on its own seed line', () => {
  /**
   * The dump exists so that "a terrain repro is one string" (fb064k). For every
   * map the generator makes, that string works: paste its `requested` into
   * `npm run sim -- --seed <n>` and the same tiles come back. For the flat
   * arena it did not. `flatTerrain()` has no seed — `requestedSeed`/`seed` are
   * `0` only because `TerrainMap` has nowhere to write "none" — so its dump
   * read `requested=0 effective=0 attempts=0 fallback=true`, and seed `0` is a
   * perfectly good seed that produces a completely different map. The one tell
   * was `attempts=0`, which fb064n made unforgeable in the parser and left
   * unreadable to a human skimming a bug report.
   *
   * `source` is that tell, spelled out. It is derived from `attempts` rather
   * than added to `TerrainMap`, so it cannot disagree with the field it names.
   */
  const flat = flatTerrain();
  const flatText = describeTerrain(flat, cfg);
  const genText = describeTerrain(generateTerrain(1, cfg), cfg);

  /** Replace the whole `seed` line of a dump. */
  function withSeedLine(text: string, line: string): string {
    return text.replace(/^seed .*$/m, line);
  }

  function seedFields(text: string): string[] {
    const line = text.split('\n').find((l) => l.startsWith('seed '));
    expect(line, 'dump has no seed line').toBeDefined();
    return (line as string).split(' ').slice(1);
  }

  it('the confusion the mark exists to end is real', () => {
    // Not a hypothetical: the number printed on the flat arena's seed line is a
    // valid seed, and it names a different map. This is the observation
    // (fb064n QA 4) restated as an assertion, so the mark cannot be dropped as
    // decoration later.
    const zero = generateTerrain(0, cfg);
    expect(zero.hash).not.toBe(flat.hash);
    expect(Array.from(zero.kind)).not.toEqual(Array.from(flat.kind));
    expect(zero.attempts).toBeGreaterThan(0);
  });

  it('marks the flat arena, and the mark is the first thing on the line', () => {
    // First field, not last: the point is that a reader's eye reaches it before
    // it reaches `requested=0`.
    expect(seedFields(flatText)[0]).toBe('source=flat-arena');
    expect(seedFields(genText)[0]).toBe('source=generator');
    // The rest of the line is untouched, so every existing reader still works.
    expect(flatText).toContain('requested=0 effective=0 attempts=0 fallback=true');
  });

  it('a provenance-free grid dashes the mark like every other seed field', () => {
    const bare = describeTerrain({ w: GRID_W, h: GRID_H, kind: expectedFlatKinds() }, cfg);
    expect(seedFields(bare)[0]).toBe('source=-');
    // All-or-nothing covers the new field too: a dump with a real `source` and
    // dashes elsewhere is the shape that used to drop the hash check silently.
    expect(() => parseTerrainDump(bare.replace('source=-', 'source=flat-arena'))).toThrow(
      /all-or-nothing/,
    );
    // And it parses. These are the flat arena's exact tiles with no provenance,
    // which is what pins the tile check to the *mark* rather than to the tiles:
    // an unmarked grid is never compared against `flatTerrain()`, marked or not.
    const back = parseTerrainDump(bare);
    expect(back.provenance).toBe(null);
    expect(Array.from(back.kind)).toEqual(Array.from(expectedFlatKinds()));
  });

  it('tells a pre-fb064s dump how to be fixed, differently for each shape it can be', () => {
    // QA bug 1. The field is new, so every dump written before it is refused —
    // a defensible build-lockstep call, and the same one the legend and gate
    // checks make. What is not defensible is a remedy that does not apply: a
    // message offering `source=generator`/`source=flat-arena` to the reader of a
    // provenance-free dump walked them straight into a second, unrelated
    // refusal (`provenance is all-or-nothing`) for doing exactly as it said.
    const shapes: ReadonlyArray<readonly [string, string, RegExp, string]> = [
      ['generated', genText, /add source=generator/, 'source=generator '],
      ['flat', flatText, /add source=generator/, 'source=flat-arena '],
      [
        'provenance-free',
        describeTerrain({ w: GRID_W, h: GRID_H, kind: expectedFlatKinds() }, cfg),
        /carries no provenance, so add source=-/,
        'source=- ',
      ],
    ];
    for (const [name, text, want, remedy] of shapes) {
      const legacy = text.replace(/^seed source=[^ ]+ /m, 'seed ');
      expect(legacy, name).not.toBe(text);
      expect(() => parseTerrainDump(legacy), name).toThrow(/predates the field/);
      expect(() => parseTerrainDump(legacy), name).toThrow(want);
      // The remedy the message names is a remedy: applying it parses, and gets
      // back the same tiles. This is the half QA found missing.
      const fixed = legacy.replace('seed ', `seed ${remedy}`);
      expect(fixed, name).toBe(text);
      expect(Array.from(parseTerrainDump(fixed).kind), name).toEqual(
        Array.from(parseTerrainDump(text).kind),
      );
    }
  });

  it('blames the dimensions when it is the dimensions', () => {
    // QA bug 3. A non-arena dump claiming the mark — fb064f's announced Training
    // Grounds shape is the realistic one — used to be refused with "these are
    // not the flat arena's tiles", though no tile had been compared. The reader
    // would go looking for a wrong glyph among 1792 that are all correct.
    const k = new Uint8Array(3 * 3);
    const small: TerrainMap = {
      w: 3,
      h: 3,
      kind: k,
      requestedSeed: 0,
      seed: 0,
      attempts: 0,
      fallback: true,
      hash: terrainHash(0, k),
    };
    expect(() => parseTerrainDump(describeTerrain(small, cfg))).toThrow(
      /always 56x32; this dump is 3x3/,
    );
  });

  it('leaves the degraded map alone: flat tiles, but a seed that reproduces them', () => {
    // The case the mark must NOT claim. `generateTerrain` ships the flat arena
    // when `maxAttempts` seeds all fail the bands, so this map's tiles are byte
    // for byte the flat arena's — and yet its `requested` is a working repro,
    // which is the question `source` answers. Marking it `flat-arena` would be
    // wrong twice: it would contradict `attempts=8`, and it would tell a reader
    // the seed on the line is a placeholder when it is the whole repro.
    //
    // Without this test, tightening check 3 from "the mark claims flat" to
    // "these tiles are flat" would pass everything else in the suite.
    const degraded = generateTerrain(11, impossible);
    expect(isDegradedMap(degraded)).toBe(true);
    expect(Array.from(degraded.kind)).toEqual(Array.from(expectedFlatKinds()));
    const text = describeTerrain(degraded, impossible);
    expect(seedFields(text)[0]).toBe('source=generator');
    expect(text).toContain(`attempts=${degraded.attempts} fallback=true`);
    const back = parseTerrainDump(text);
    expect(Array.from(back.kind)).toEqual(Array.from(degraded.kind));
    expect(back.provenance?.hash).toBe(degraded.hash);
    // And the seed really is the repro, which is the claim the mark makes.
    expect(generateTerrain(back.provenance!.requestedSeed, impossible).hash).toBe(degraded.hash);
  });

  it('round-trips, byte for byte, with the mark on it', () => {
    const back = parseTerrainDump(flatText);
    expect(Array.from(back.kind)).toEqual(Array.from(flat.kind));
    // `source` is derived from `attempts`, so it is not a sixth provenance
    // field to be carried around and kept in sync — re-describing the reloaded
    // map re-derives it and lands on the same byte.
    expect(back.provenance).toEqual({
      requestedSeed: 0,
      seed: 0,
      attempts: 0,
      fallback: true,
      hash: flat.hash,
    });
    expect(
      describeTerrain({ ...back.provenance!, w: GRID_W, h: GRID_H, kind: back.kind }, cfg),
    ).toBe(flatText);
  });

  it('refuses a dump that claims the mark without the flat arena tiles', () => {
    // The hole the mark opens if it is only printed. Seed 1's tiles, wearing
    // the flat arena's entire provenance including a correctly re-derived hash
    // — `terrainHash` folds the seed the dump claims, so it agrees with the
    // forgery. Before this item the same forgery *minus the mark* parsed
    // clean, which is why the tile check is a check and not a comment.
    const forged = withSeedLine(
      genText,
      'seed source=flat-arena requested=0 effective=0 attempts=0 fallback=true ' +
        `hash=${terrainHash(0, generateTerrain(1, cfg).kind)}`,
    );
    expect(() => parseTerrainDump(forged)).toThrow(/flat arena/);
    // One tile is enough: the mark means these exact bytes, not "roughly flat".
    const oneOff = Uint8Array.from(flat.kind);
    const at = 2 * GRID_W + 2;
    expect(oneOff[at]).toBe(TerrainKind.Normal);
    oneOff[at] = TerrainKind.Rock;
    const nearlyMap: TerrainMap = {
      w: GRID_W,
      h: GRID_H,
      kind: oneOff,
      requestedSeed: 0,
      seed: 0,
      attempts: 0,
      fallback: true,
      hash: terrainHash(0, oneOff),
    };
    const nearly = describeTerrain(nearlyMap, cfg);
    expect(() => parseTerrainDump(nearly)).toThrow(/flat arena/);
  });

  it('refuses a mark that disagrees with the attempt count, in both directions', () => {
    // The mark and `attempts` are two spellings of one fact, so a dump where
    // they disagree describes nothing. `attempts=0` with `source=generator` is
    // caught by fb064n's existing cross-check (its message and its tests are
    // unchanged); the other direction is new.
    expect(() => parseTerrainDump(genText.replace('attempts=1', 'attempts=0'))).toThrow(
      /attempts=0 is only the flat arena/,
    );
    const flatAsGen = flatText.replace('source=flat-arena', 'source=generator');
    expect(() => parseTerrainDump(flatAsGen)).toThrow(/source=generator/);
    const genAsFlat = genText.replace('source=generator', 'source=flat-arena');
    expect(() => parseTerrainDump(genAsFlat)).toThrow(/source=flat-arena/);
  });

  it('refuses a source it does not know', () => {
    // Same rule as the legend check: a dump written by a future version with a
    // third source is refused, not decoded as one of today's two.
    for (const bad of ['source=training-grounds', 'source=', 'source=Flat-Arena']) {
      expect(() => parseTerrainDump(flatText.replace('source=flat-arena', bad)), bad).toThrow(
        /source/,
      );
    }
  });
});
