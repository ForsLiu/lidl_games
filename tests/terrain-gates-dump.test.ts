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
 * than only from `generateTerrain`'s output.
 *
 * **How wrong the bands were, re-measured rather than inherited.** The first
 * version of this header carried fb065c's QA figure — "8 of 30 seeds print
 * bands that differ" — which is the `gateDetour`-only count reported as if it
 * were the whole line. Measured over the same 30 four-gate seeds: `gateDetour`
 * differs on **8 of 30** (worst 0.1446 at seed 1, printed 1.000000 against a
 * real 1.144578), but `coreLegal` differs on **30 of 30** and so the whole
 * `bands` line — and the `counts` line with it — was wrong on **every** such
 * seed. Inheriting that number understated the defect fourfold, which is the
 * failure CLAUDE.md's measurement rules name outright: a deferral is a
 * measurement with an expiry date.
 *
 * The parser side is the harder half. `parseTerrainDump` refuses what the
 * writer never emits (fb064w), and its `gates` line had a *fixed* key set
 * taken from `GATES`, so a four-gate dump was rejected outright as an unknown
 * key. It now reads a variable set: the three base gates must be present, in
 * `GATES` order, at this build's positions — that check is unchanged, and so is
 * its message — and any further gate follows them, read as written.
 */

import { describe, expect, it } from 'vitest';

import { GATES, GRID_H, GRID_W, MODIFIER_GATES, type GateDef } from '../src/sim/grid';
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

/**
 * A stand-in for `world.ts`'s Fourth Gate list, in the order `World` builds
 * it — the base three plus one more gate.
 *
 * fb166 logged `MODIFIER_GATES`' old `south` entry, `{ tx: 12, ty: 19 }`, as a
 * literal sized for the 36x20 grid (`ty: 19` was `GRID_H - 1`) that had become
 * an ordinary interior tile at 56x32, so this file built its own corrected
 * stand-in rather than import a known-broken constant. fb156 fixed that
 * constant in place — `MODIFIER_GATES` is now `{ key: 'south2', tx: 3, ty:
 * GRID_H - 1 }`, a real border tile — and renamed its key (a *base* gate now
 * legitimately answers to `'south'`; see `grid.ts`'s own doc comment). This
 * file tests the describe/parse format's four-gate handling generically, not
 * the Fourth Gate's specific position, so `MODIFIER_GATES` itself is now a
 * fine stand-in again everywhere except the one test that exercises the real
 * `World` integration directly (which plays `world.ts`'s own still-unfixed
 * `{ key: 'south', tx: 12, ty: 19 }` literal) — see its own skip note.
 */
const FOUR: readonly GateDef[] = [...GATES, ...MODIFIER_GATES];

describe('fb065f — describeTerrain carries its gate list', () => {
  it('prints the gates it was given, not the base three', () => {
    const map = generateTerrain(40, cfg, FOUR);
    const line = describeTerrain(map, cfg, FOUR).split('\n')[2];
    expect(line).toBe('gates west=0,10 north=18,0 east=35,17 south2=3,31');
    // Unchanged when no list is given: the default is still `GATES`, so every
    // existing dump in every existing golden is byte-identical.
    expect(describeTerrain(map, cfg).split('\n')[2]).toBe(
      'gates west=0,10 north=18,0 east=35,17',
    );
  });

  it('measures its bands against that list, which is the defect', () => {
    // The half that actually misleads a reader. The gate line being short is
    // visible; the bands being measured against a different arena is not.
    // fb156: seed 5, not seed 2 — `MODIFIER_GATES`' fb156 reposition (12,19 ->
    // 3,31, alongside its rename to `south2`) moves the map `FOUR` generates
    // for every seed, and seed 2's four-gate and three-gate detour coincide
    // at the new position (both 1.142857...). Seed 5 is a fresh witness where
    // they genuinely differ (1.197279 against 1.016667), re-checked by search
    // rather than guessed.
    const map = generateTerrain(5, cfg, FOUR);
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

  // fb166 Known-issue (out of this lane's scope): `world.ts:591` hardcodes the
  // Fourth Gate's south position as `{ tx: 12, ty: 19 }`, independently of
  // `MODIFIER_GATES` — a literal sized for the 36x20 grid (`ty: 19` was
  // `GRID_H - 1`) that is now an ordinary interior tile at 56x32. `World`
  // writes it straight into `grid.tile[]` (bypassing `Grid.openGate`'s border
  // guard, `world.ts:593`), so building a `World` with the `gate` modifier
  // does not throw — but the resulting arena's dump correctly fails
  // `parseTerrainDump`'s border check on read-back (`gate "south" is at
  // 12,19, which is not on the arena border`), because that position really
  // is invalid at this grid size. This is the validator doing exactly its
  // documented job — "where a gate can be, not merely that it is a tile" —
  // catching a real defect in `world.ts`, which lives outside `src/sim/
  // terrain/**` and this lane's Scope. Logged in BACKLOG-TERRAIN.md's Log for
  // the main lane; re-enable once `world.ts:591` reads a real border
  // position for the resized grid.
  it.skip('describes a live Fourth Gate run correctly — the case that motivated it', () => {
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

  it('leaves a three-gate dump alone: declared is not required', () => {
    // QA's M4: making the optional key *required* passed this whole file,
    // because every three-gate case in it expected a throw for some other
    // reason and none ever parsed one successfully. The claim the item rests on
    // — that a declared key need not be emitted — was therefore pinned nowhere
    // in the file that makes it.
    const map = generateTerrain(7, cfg);
    const dump = describeTerrain(map, cfg);
    expect(dump.split('\n')[2]).toBe('gates west=0,10 north=18,0 east=35,17');
    const parsed = parseTerrainDump(dump);
    expect(parsed.gates).toHaveLength(3);
    expect(Array.from(parsed.kind)).toEqual(Array.from(map.kind));
  });

  it('refuses to write a gate list it could not read back', () => {
    // The writer was one-sided: it accepted any list and happily emitted a
    // `gates` line `parseTerrainDump` rejects. `describeTerrain` is deliberately
    // one-sided about *provenance* — a malformed map is exactly when a dump is
    // most needed — but a gate list is the caller's own argument, not a
    // property of the map, and this is also what makes the format's coupling to
    // `HEADER_KEYS` enforced rather than merely documented.
    const map = generateTerrain(7, cfg, FOUR);
    const bad = (gates: readonly GateDef[]): (() => string) => (): string =>
      describeTerrain(map, cfg, gates);
    expect(bad([...GATES, { key: 'southwest', tx: 1, ty: 19 }])).toThrow(
      /gate "southwest" is not a gate this format declares/,
    );
    expect(bad([...MODIFIER_GATES, ...GATES])).toThrow(/gates are out of order at "west"/);
    expect(bad([...GATES, ...GATES])).toThrow(/gate "west" is listed twice/);
    expect(bad([])).toThrow(/gates list is empty/);
    // ...and the lists that *are* readable still write.
    expect(bad(GATES)).not.toThrow();
    expect(bad(FOUR)).not.toThrow();
  });

  it('refuses an extra gate that is not a gate', () => {
    const map = generateTerrain(7, cfg, FOUR);
    const dump = describeTerrain(map, cfg, FOUR);
    const swap = (to: string): string => dump.replace('south2=3,31', to);

    expect(() => parseTerrainDump(swap('south2=3'))).toThrow(/gate "south2" is not "tx,ty"/);
    expect(() => parseTerrainDump(swap('south2=1.5,31'))).toThrow(/gate "south2" is not "tx,ty"/);
    expect(() => parseTerrainDump(swap(`south2=${GRID_W},31`))).toThrow(/off the .* arena/);
    expect(() => parseTerrainDump(swap(`south2=3,${GRID_H}`))).toThrow(/off the .* arena/);
    expect(() => parseTerrainDump(swap('south2=3,31 south2=3,31'))).toThrow(/duplicate "south2"/);
    // One spelling per value. The base three survive a padded or `-0` spelling
    // only because their parsed value is discarded — a modifier gate's is what
    // the dump carries, so `003,031` would round-trip to different text and
    // `-0,31` would land a negative zero in a `GateDef`. Both measured before
    // this guard existed.
    expect(() => parseTerrainDump(swap('south2=003,031'))).toThrow(/gate "south2" is not "tx,ty"/);
    expect(() => parseTerrainDump(swap('south2=-0,31'))).toThrow(/gate "south2" is not "tx,ty"/);
    // **Where a gate can be, not merely that it is a tile.** The first version
    // of this parser said "nothing in this build knows where a modifier gate
    // belongs", which was false: `Grid.openGate` (fb065e, one commit earlier)
    // already refuses every tile that cannot carry a gate, and those rules are
    // properties of the arena rather than of any modifier. Without them
    // `south2=18,10` — the middle of the board — read back as a legal arena
    // whose bands were measured somewhere the reader cannot see.
    expect(() => parseTerrainDump(swap('south2=18,10'))).toThrow(/not on the arena border/);
    expect(() => parseTerrainDump(swap('south2=25,9'))).toThrow(/not on the arena border/);
    for (const corner of ['0,0', `${GRID_W - 1},0`, `0,${GRID_H - 1}`, `${GRID_W - 1},${GRID_H - 1}`]) {
      expect(() => parseTerrainDump(swap(`south2=${corner}`)), corner).toThrow(/is a corner/);
    }
    // ...and not on top of a gate that is already there.
    expect(() => parseTerrainDump(swap('south2=0,10'))).toThrow(
      /where gate "west" already is/,
    );
    // A modifier gate ahead of the base three is not something the writer
    // emits, so it is refused by the same order rule fb064w put on every line.
    expect(() =>
      parseTerrainDump(dump.replace('gates west=0,10', 'gates south2=3,31 west=0,10')),
    ).toThrow(/fields are in a fixed order/);
    // And a name the format does not declare is still an unknown key, with
    // fb064w's own message rather than a confusing complaint about coordinates.
    expect(() => parseTerrainDump(swap('south2=3,31 bogus=1,1'))).toThrow(
      /unknown "bogus" on the "gates" line/,
    );
  });
});
