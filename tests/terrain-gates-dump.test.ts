/**
 * fb065f — a dump describes the gates the map was measured against.
 *
 * `describeTerrain` hardcoded `GATES` in two places: the `gates` header line
 * (`describe.ts:243`) and its `measureTerrain(map, cfg)` call, which defaults
 * the gate list. A run plays on `World.gates`, and fb077's Fourth Gate
 * modifier makes that four — so a repro taken from such a run printed three
 * gates and measured `gateReach`, `gateDetour`, `corridors` and
 * `gatesConnected` against the wrong set.
 *
 * Harmless until fb065c, which made a dump reachable from a live `Grid` rather
 * than only from `generateTerrain`'s output. Measured by fb065c's QA over 30
 * four-gate seeds: 8 of 30 printed bands that differ from the truth, worst
 * `gateDetour` delta 0.1446 at seed 1 (printed 1.000000, real 1.144578).
 *
 * The parser side is the harder half. `parseTerrainDump` refuses what the
 * writer never emits (fb064w), and its `gates` line had a *fixed* key set
 * taken from `GATES`, so a four-gate dump was rejected outright as an unknown
 * key. It now reads a variable set: the three base gates must be present, in
 * `GATES` order, at this build's positions — that check is unchanged, and so is
 * its message — and any further gate follows them, read as written.
 */

import { describe, expect, it } from 'vitest';

import { GATES, GRID_H, GRID_W, type GateDef } from '../src/sim/grid';
import {
  describeTerrain,
  generateTerrain,
  gridTerrain,
  loadTerrain,
  measureTerrain,
  parseTerrainDump,
} from '../src/sim/terrain';
import { World } from '../src/sim/world';
import { cfg as runCfg } from './helpers';

const cfg = loadTerrain();

/** `world.ts`'s Fourth Gate list, in the order `World` builds it. */
const FOUR: readonly GateDef[] = [...GATES, { key: 'south', tx: 12, ty: 19 }];

describe('fb065f — describeTerrain carries its gate list', () => {
  it('prints the gates it was given, not the base three', () => {
    const map = generateTerrain(40, cfg, FOUR);
    const line = describeTerrain(map, cfg, FOUR).split('\n')[2];
    expect(line).toBe('gates west=0,10 north=18,0 east=35,17 south=12,19');
    // Unchanged when no list is given: the default is still `GATES`, so every
    // existing dump in every existing golden is byte-identical.
    expect(describeTerrain(map, cfg).split('\n')[2]).toBe(
      'gates west=0,10 north=18,0 east=35,17',
    );
  });

  it('measures its bands against that list, which is the defect', () => {
    // The half that actually misleads a reader. The gate line being short is
    // visible; the bands being measured against a different arena is not.
    const map = generateTerrain(1, cfg, FOUR);
    const truth = measureTerrain(map, cfg, FOUR);
    const bands = (dump: string): string => dump.split('\n')[3];

    const withGates = bands(describeTerrain(map, cfg, FOUR));
    expect(withGates).toContain(`gateDetour=${truth.maxGateDetour.toFixed(6)}`);
    expect(withGates).toContain(`gateReach=${truth.gateReachFrac.toFixed(6)}`);

    // And the old behaviour really did differ on this map, so the test is not
    // pinning a distinction without one.
    const threeGate = measureTerrain(map, cfg);
    expect(threeGate.maxGateDetour).not.toBe(truth.maxGateDetour);
    expect(bands(describeTerrain(map, cfg))).toContain(
      `gateDetour=${threeGate.maxGateDetour.toFixed(6)}`,
    );
  });

  it('round-trips a four-gate dump byte-identically', () => {
    for (const seed of [1, 7, 40, 4426]) {
      const map = generateTerrain(seed, cfg, FOUR);
      const dump = describeTerrain(map, cfg, FOUR);
      const parsed = parseTerrainDump(dump);
      expect(Array.from(parsed.kind)).toEqual(Array.from(map.kind));
      expect(parsed.gates).toEqual([...FOUR]);
      // From the `gates` line down: a `TerrainDump` carries no `hash`, so
      // re-describing it writes `source=-` (fb064s) and the seed line
      // legitimately differs. Everything the gate list touches — the gate line
      // itself, every band, the counts and the tiles — must be identical.
      const body = (d: string): string => d.split('\n').slice(2).join('\n');
      expect(body(describeTerrain(parsed, cfg, FOUR))).toBe(body(dump));
    }
  });

  it('keeps every refusal the three-gate line already made', () => {
    const map = generateTerrain(7, cfg);
    const dump = describeTerrain(map, cfg);
    const swap = (from: string, to: string): string => dump.replace(from, to);

    // A base gate at the wrong place: the message is unchanged, verbatim.
    expect(() => parseTerrainDump(swap('west=0,10', 'west=0,11'))).toThrow(
      /gate "west" is at 0,11, this build has it at 0,10/,
    );
    // A base gate missing entirely.
    expect(() => parseTerrainDump(swap(' north=18,0', ''))).toThrow(/north/);
    // Malformed coordinates.
    expect(() => parseTerrainDump(swap('east=35,17', 'east=x'))).toThrow(
      /gate "east" is not "tx,ty"/,
    );
    // Duplicates, still refused rather than last-write-wins.
    expect(() => parseTerrainDump(swap('east=35,17', 'east=35,17 east=35,17'))).toThrow(
      /duplicate "east" on the "gates" line/,
    );
  });

  it('describes a live Fourth Gate run correctly — the case that motivated it', () => {
    // The defect end to end, on the artefact fb065c built. A run under the
    // `gate` modifier plays four gates; before fb065f its repro printed three
    // and measured every gate-derived band against three, so a reader was told
    // about an arena the run was not played in.
    const w = new World(runCfg({ seed: 40, modifiers: ['gate'] }));
    expect(w.gates.map((g) => g.key)).toEqual(['west', 'north', 'east', 'south']);

    const view = gridTerrain(w.grid);
    const truth = measureTerrain(view, cfg, w.gates);
    const dump = describeTerrain(view, cfg, w.gates);

    expect(dump.split('\n')[2]).toContain('south=12,19');
    expect(dump.split('\n')[3]).toContain(`gateDetour=${truth.maxGateDetour.toFixed(6)}`);
    expect(dump.split('\n')[4]).toContain(`coreAnchors=${truth.legalCoreCount}`);
    // Still a repro: it reads back, and it still says `source=-` because a
    // Grid's tiles are no seed's output (fb065c).
    const parsed = parseTerrainDump(dump);
    expect(Array.from(parsed.kind)).toEqual(Array.from(view.kind));
    expect(parsed.gates.map((g) => g.key)).toEqual(['west', 'north', 'east', 'south']);
    expect(parsed.provenance).toBeNull();

    // And the three-gate reading really was different on this run, so the
    // assertions above are not pinning a distinction without one.
    const wrong = measureTerrain(view, cfg);
    expect(wrong.legalCoreCount).not.toBe(truth.legalCoreCount);
  });

  it('refuses an extra gate that is not a gate', () => {
    const map = generateTerrain(7, cfg, FOUR);
    const dump = describeTerrain(map, cfg, FOUR);
    const swap = (to: string): string => dump.replace('south=12,19', to);

    expect(() => parseTerrainDump(swap('south=12'))).toThrow(/gate "south" is not "tx,ty"/);
    expect(() => parseTerrainDump(swap('south=1.5,19'))).toThrow(/gate "south" is not "tx,ty"/);
    expect(() => parseTerrainDump(swap(`south=${GRID_W},19`))).toThrow(/off the grid/);
    expect(() => parseTerrainDump(swap(`south=12,${GRID_H}`))).toThrow(/off the grid/);
    expect(() => parseTerrainDump(swap('south=12,19 south=12,19'))).toThrow(/duplicate "south"/);
    // A modifier gate ahead of the base three is not something the writer
    // emits, so it is refused by the same order rule fb064w put on every line.
    expect(() =>
      parseTerrainDump(dump.replace('gates west=0,10', 'gates south=12,19 west=0,10')),
    ).toThrow(/fields are in a fixed order/);
    // And a name the format does not declare is still an unknown key, with
    // fb064w's own message rather than a confusing complaint about coordinates.
    expect(() => parseTerrainDump(swap('south=12,19 bogus=1,1'))).toThrow(
      /unknown "bogus" on the "gates" line/,
    );
  });
});
