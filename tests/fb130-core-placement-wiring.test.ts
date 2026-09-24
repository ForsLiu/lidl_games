/**
 * fb130 (SPEC-FINAL §10.5, fb064c's main-lane half): `Grid.placeCore` (built
 * by the terrain lane at fb064h/fb064o) wired into a real run for the first
 * time — the `place_core` sim Command (architecture rule 3), the
 * `CORE_X`/`CORE_Y`/`coreCenter()` reader migration that makes calling it
 * safe, the run-lifecycle lock (item 4), `verifyTerrainMap` at the run
 * boundary (item 5) and the approach-band re-check for a player-placed Core
 * (item 6).
 *
 * Acceptance (BACKLOG.md fb130): "G2 replay hash covers the placement; a seed
 * sweep with placed Cores keeps every gate reachable."
 */

import { describe, expect, it } from 'vitest';

import { cfg, replay } from './helpers';
import { applyCommand, Run } from '../src/sim/run';
import { World } from '../src/sim/world';
import { buildTower, sellTower } from '../src/sim/towers';
import { inCoreBuildRange, placeCoreCommand } from '../src/sim/cores';
import { CORE_H, CORE_W } from '../src/sim/grid';
import {
  legalCoreAnchors,
  maxGateDetour,
  suggestCoreAnchor,
  verifyTerrainMap,
} from '../src/sim/terrain';
import { emptyInput, type Command, type RunConfig, type RunReport, type TickInput } from '../src/sim/types';
import { parseArgs } from '../tools/sim';
import { makePolicy } from '../src/bots';
import '../src/bots';

/**
 * `runWithPolicy` (helpers.ts), but the very first tick's `TickInput` also
 * carries `place_core` — so a bot's own build-site scoring (`rankSites`,
 * `src/bots/policies.ts`, migrated at fb130 to read the *live* Core) reacts
 * to the new position from the very first tower it places, not just to
 * whatever incidental drift a moved Core causes downstream.
 */
function runWithPlacedCore(
  config: RunConfig,
  policyName: string,
  tx: number,
  ty: number,
  maxTicks = 60 * 60 * 5,
): RunReport {
  const run = new Run(config);
  const policy = makePolicy(policyName);
  let first = true;
  while (!run.done && run.world.tick < maxTicks) {
    const input = policy.act(run.world);
    if (first) {
      // Prepended, not appended: `applyCommand` processes a tick's `cmds` in
      // array order, and the stock `hybrid` policy can queue its own first
      // `build` on tick 0 (its Warden spawn tile is already in range of its
      // top-ranked site) — appending `place_core` after that build would let
      // `World.buildPhaseOpened` (item 4) correctly, but here unintentionally,
      // lock the Command out before it ever ran. A real player places the
      // Core before building anything, which prepending models.
      input.cmds = [{ k: 'place_core', tx, ty }, ...input.cmds];
      first = false;
    }
    run.step(input);
  }
  return run.report();
}

/** Teleport the Warden so build-range checks pass in unit tests (act1.test.ts's own helper). */
function warp(w: World, tx: number, ty: number): void {
  w.warden.x = tx + 0.5;
  w.warden.y = ty + 0.5;
}

/** A practice world: flat arena, so any tile away from the border/gates/default Core is a legal anchor. */
function practiceWorld(over: Record<string, unknown> = {}): World {
  return new World(cfg({ practice: true, ...over }));
}

describe('fb130 — place_core Command wiring', () => {
  it('applyCommand dispatches place_core and actually moves the Grid Core', () => {
    const w = practiceWorld();
    expect(w.grid.coreOrigin()).not.toEqual({ tx: 10, ty: 10 });
    applyCommand(w, { k: 'place_core', tx: 10, ty: 10 });
    expect(w.grid.coreOrigin()).toEqual({ tx: 10, ty: 10 });
    expect(w.grid.coreCenterOf()).toEqual({ x: 10 + CORE_W / 2, y: 10 + CORE_H / 2 });
  });

  it('every live reader now follows the placed Core, not the stale default', () => {
    const w = practiceWorld();
    applyCommand(w, { k: 'place_core', tx: 10, ty: 10 });
    // targetPoint() (what Act I enemies path toward) reads the moved Core.
    expect(w.targetPoint()).toEqual(w.grid.coreCenterOf());
    // inCoreBuildRange (cores.ts) clamps to the moved Core's own footprint,
    // not the stale CORE_X/CORE_Y default 22+ tiles away.
    warp(w, 100, 100); // nowhere near either the old or the new Core
    expect(inCoreBuildRange(w)).toBe(false);
    warp(w, 10, 10); // right on the moved Core's own tile
    expect(inCoreBuildRange(w)).toBe(true);
  });

  it('rejects an illegal tile (the border, painted rock by the generator) and leaves the Core where it was', () => {
    const w = practiceWorld();
    const before = w.grid.coreOrigin();
    // The border ring is always Rock, even on the flat arena ("rock border,
    // walkable gate tiles, normal interior" — src/sim/terrain/generate.ts) —
    // so a footprint touching it is refused on terrain, not bounds.
    const result = placeCoreCommand(w, 0, 0);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('not-normal');
    expect(w.grid.coreOrigin()).toEqual(before);
  });

  it('rejects a footprint that leaves the grid entirely (off-grid)', () => {
    const w = practiceWorld();
    const before = w.grid.coreOrigin();
    const result = placeCoreCommand(w, -1, 10);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('off-grid');
    expect(w.grid.coreOrigin()).toEqual(before);
  });

  it('rejects a tile within coreGateClearance of a spawn gate', () => {
    const w = practiceWorld();
    const before = w.grid.coreOrigin();
    // fb156: the run's own (seed-jittered) gate, not the static default.
    const gate = w.gates[0];
    if (!gate) throw new Error('expected at least one gate in w.gates');
    const result = placeCoreCommand(w, gate.tx + 1, gate.ty);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(['near-gate', 'off-grid', 'not-normal']).toContain(result.reason);
    expect(w.grid.coreOrigin()).toEqual(before);
  });

  it('a legal click succeeds through the Command exactly like calling placeCoreCommand directly', () => {
    const w = practiceWorld();
    const direct = practiceWorld();
    const r1 = placeCoreCommand(direct, 14, 14);
    expect(r1.ok).toBe(true);
    applyCommand(w, { k: 'place_core', tx: 14, ty: 14 });
    expect(w.grid.coreOrigin()).toEqual(direct.grid.coreOrigin());
  });

  it('item 4: locks after a build-then-sell, even though occupancy returns to zero', () => {
    const w = practiceWorld();
    warp(w, 20, 20);
    expect(w.buildPhaseOpened).toBe(false);
    const built = buildTower(w, 2, 20, 20);
    expect(built.ok).toBe(true);
    expect(w.buildPhaseOpened).toBe(true);
    expect(sellTower(w, 20, 20)).toBe(true);
    // Occupancy is back to zero (a live-occupancy check alone would re-open
    // here), but the sticky flag does not un-set.
    expect(w.grid.occ.every((v) => v === 0)).toBe(true);
    expect(w.buildPhaseOpened).toBe(true);
    const before = w.grid.coreOrigin();
    const result = placeCoreCommand(w, 25, 25);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('build-started');
    expect(w.grid.coreOrigin()).toEqual(before);
  });

  it('item 4: Grid.placeCore itself still refuses live occupancy as its own structural guard', () => {
    const w = practiceWorld();
    warp(w, 20, 20);
    buildTower(w, 2, 20, 20);
    expect(() => w.grid.placeCore(25, 25)).toThrow(/structures are already placed/);
  });

  it('refuses a click once wave 1 has started (past-wave-1)', () => {
    const w = practiceWorld();
    w.wave = 1;
    w.phase = 'act1_wave';
    const before = w.grid.coreOrigin();
    const result = placeCoreCommand(w, 20, 20);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('past-wave-1');
    expect(w.grid.coreOrigin()).toEqual(before);
  });

  it('refuses a click during Act II (past-wave-1, huntsWarden phase)', () => {
    const w = practiceWorld();
    w.phase = 'act2';
    const before = w.grid.coreOrigin();
    const result = placeCoreCommand(w, 20, 20);
    expect(result.ok).toBe(false);
    expect(w.grid.coreOrigin()).toEqual(before);
  });
});

describe('fb130 — G2: the replay hash covers the placement', () => {
  it('replaying an input log with a place_core Command reproduces the end-state hash', () => {
    for (const seed of [1, 2, 3, 7, 42]) {
      const w = new World(cfg({ seed }));
      const anchor = suggestCoreAnchor(w.terrainMap, w.terrainCfg, undefined, w.gates);
      expect(anchor, `seed ${seed}`).not.toBeNull();
      const tx = (anchor as number) % w.terrainMap.w;
      const ty = Math.floor((anchor as number) / w.terrainMap.w);
      const cmds: Command[] = [{ k: 'place_core', tx, ty }];
      const log: TickInput[] = [{ ...emptyInput(), cmds }];
      // Two independent `cfg({ seed })` objects (helpers.ts's own convention,
      // `g2-determinism.test.ts`), not one shared object re-used across both
      // replays — `World`'s constructor stamps a content hash onto whatever
      // config it is handed, so sharing one object would still be correct,
      // but a fresh object per replay is what the rest of the suite already
      // relies on and keeps this test's isolation obvious.
      const a = replay(cfg({ seed }), log, 600);
      const b = replay(cfg({ seed }), log, 600);
      expect(b.endHash, `seed ${seed}`).toBe(a.endHash);
    }
  });

  it('a run that places the Core far from its default hashes differently from one that does not', () => {
    // An idle (no-input) run over a few hundred ticks does not exercise this:
    // `hashWorld` never hashes the Core's position directly (by design — see
    // `World.terrainMap`'s doc comment; grid state is a deterministic
    // function of Commands already in the log), so with nothing built and no
    // enemy ever reaching the Core, nothing downstream of the move is ever
    // read. A real bot policy is what actually depends on where the Core
    // is — `rankSites` (src/bots/policies.ts) scores build sites by distance
    // to the *live* Core, so a moved Core changes which tiles it builds on
    // from the very first tower.
    //
    // Deliberately the *farthest* legal anchor, not `suggestCoreAnchor` (the
    // pre-highlighted default): on seed 1 the suggested anchor is (25, 8),
    // one tile off the Grid default (25, 9) — legal, correct, and far too
    // small a move for a short bot run to visibly diverge on. This test
    // wants a witness that the wiring matters, not a coin flip on how close
    // the nearest-tie-broken suggestion happens to land.
    const seed = 1;
    const w = new World(cfg({ seed }));
    const def = w.grid.coreOrigin();
    const anchors = legalCoreAnchors(w.terrainMap, w.terrainCfg, undefined, w.gates);
    const byDistDesc = anchors
      .map((a) => ({ tx: a % w.terrainMap.w, ty: Math.floor(a / w.terrainMap.w) }))
      .map((p) => ({ ...p, dist: Math.abs(p.tx - def.tx) + Math.abs(p.ty - def.ty) }))
      .sort((a, b) => b.dist - a.dist);
    // The farthest candidates by Manhattan distance are tried first; the
    // approach-band re-check (item 6) can refuse some of them, so this walks
    // down until one is actually accepted rather than assuming the single
    // farthest tile clears the band.
    let placed: { tx: number; ty: number } | null = null;
    for (const cand of byDistDesc.slice(0, 20)) {
      if (placeCoreCommand(new World(cfg({ seed })), cand.tx, cand.ty).ok) {
        placed = cand;
        break;
      }
    }
    expect(placed, `seed ${seed}: no far legal+in-band anchor found among the 20 farthest candidates`).not.toBeNull();
    if (!placed) return;
    expect(placed.tx !== def.tx || placed.ty !== def.ty).toBe(true);
    const withPlacement = runWithPlacedCore(cfg({ seed }), 'hybrid', placed.tx, placed.ty, 3600);
    const atDefault = runWithPlacedCore(cfg({ seed }), 'hybrid', def.tx, def.ty, 3600);
    expect(withPlacement.endHash).not.toBe(atDefault.endHash);
  });
});

describe('fb130 — a seed sweep with placed Cores keeps every gate reachable', () => {
  it('placing the suggested anchor keeps allGatesReachable() true, over 30 seeds', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const w = new World(cfg({ seed }));
      const anchor = suggestCoreAnchor(w.terrainMap, w.terrainCfg, undefined, w.gates);
      expect(anchor, `seed ${seed}`).not.toBeNull();
      const tx = (anchor as number) % w.terrainMap.w;
      const ty = Math.floor((anchor as number) / w.terrainMap.w);
      const result = placeCoreCommand(w, tx, ty);
      expect(result.ok, `seed ${seed}: ${JSON.stringify(result)}`).toBe(true);
      expect(w.grid.allGatesReachable(), `seed ${seed}`).toBe(true);
    }
  });

  it('placing any legalCoreAnchors()-listed tile via the Command keeps every gate reachable', () => {
    // Broader than the suggested anchor alone: every tile the terrain layer
    // itself calls legal, clicked through the real Command, must leave a
    // reachable board (validateCorePlacement and legalCoreAnchors are pinned
    // elsewhere to agree tile-for-tile; this exercises that agreement through
    // the live placement path instead of re-deriving it).
    for (const seed of [1, 2, 3, 4, 5]) {
      const w = new World(cfg({ seed }));
      const anchors = legalCoreAnchors(w.terrainMap, w.terrainCfg, undefined, w.gates);
      expect(anchors.length, `seed ${seed}`).toBeGreaterThan(0);
      // A handful of anchors, not every one — this is a wiring smoke test,
      // not a re-run of fb064h's own 100-seed legality sweep.
      const sample = anchors.slice(0, Math.min(5, anchors.length));
      for (const anchor of sample) {
        const fresh = new World(cfg({ seed }));
        const tx = anchor % fresh.terrainMap.w;
        const ty = Math.floor(anchor / fresh.terrainMap.w);
        const result = placeCoreCommand(fresh, tx, ty);
        if (!result.ok) {
          // The only way a legalCoreAnchors()-listed tile is refused here is
          // item 6's approach-band re-check — everything else agrees with
          // validateCorePlacement by construction (pinned elsewhere).
          expect(result.reason, `seed ${seed} anchor ${anchor}`).toBe('too-far');
          continue;
        }
        expect(fresh.grid.allGatesReachable(), `seed ${seed} anchor ${anchor}`).toBe(true);
      }
    }
  });
});

describe('fb130 item 6 — the approach band re-checked for a player-placed Core', () => {
  it('the suggested (pre-highlighted) anchor is always within the approach band', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const w = new World(cfg({ seed }));
      const anchor = suggestCoreAnchor(w.terrainMap, w.terrainCfg, undefined, w.gates);
      expect(anchor, `seed ${seed}`).not.toBeNull();
      const result = placeCoreCommand(w, (anchor as number) % w.terrainMap.w, Math.floor((anchor as number) / w.terrainMap.w));
      expect(result.ok, `seed ${seed}: suggested anchor was rejected — ${JSON.stringify(result)}`).toBe(true);
    }
  });

  it('an out-of-band legal anchor is refused with too-far, if the sample turns one up', () => {
    // fb064o measured (BACKLOG-TERRAIN.md fb064o Log): over seeds 1..120,
    // 104/120 admit a validateCorePlacement-legal Core position whose detour
    // exceeds the band the suggested anchor is held to. This test does not
    // hardcode fb064o's specific seed/anchor (gate geometry has moved since,
    // fb156) — it searches a modest seed sample itself and requires at least
    // one witness, so it would go red if the band re-check regressed silently
    // (e.g. a refactor that stopped calling maxGateDetour on the clicked
    // anchor) rather than passing vacuously.
    let witness: { seed: number; tx: number; ty: number } | null = null;
    for (let seed = 1; seed <= 40 && !witness; seed++) {
      const w = new World(cfg({ seed }));
      const anchors = legalCoreAnchors(w.terrainMap, w.terrainCfg, undefined, w.gates);
      for (const anchor of anchors) {
        const detour = maxGateDetour(w.terrainMap, w.terrainCfg, anchor, CORE_W, CORE_H, w.gates);
        if (detour > w.terrainCfg.constraints.maxGateDetour) {
          witness = { seed, tx: anchor % w.terrainMap.w, ty: Math.floor(anchor / w.terrainMap.w) };
          break;
        }
      }
    }
    expect(witness, 'no out-of-band legal anchor found in a 40-seed sample').not.toBeNull();
    if (!witness) return;
    const w = new World(cfg({ seed: witness.seed }));
    const result = placeCoreCommand(w, witness.tx, witness.ty);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('too-far');
  });
});

describe('fb130 item 5 — verifyTerrainMap asserted at the run boundary', () => {
  it("a real World's terrainMap passes verifyTerrainMap", () => {
    for (const seed of [1, 2, 3]) {
      const w = new World(cfg({ seed }));
      expect(verifyTerrainMap(w.terrainMap)).toEqual({ ok: true });
    }
  });

  it("a practice World's terrainMap (the untouched flat arena) also passes verifyTerrainMap", () => {
    const w = practiceWorld();
    expect(verifyTerrainMap(w.terrainMap)).toEqual({ ok: true });
  });
});

describe('fb130 item 3 — RunConfig.seed is domain-checked at CLI ingestion', () => {
  it('rejects an out-of-domain --seed loudly, at parse time', () => {
    expect(() => parseArgs(['--seed', '1e18'])).toThrow(/seed must be an integer/);
  });

  it('rejects a non-numeric --seed loudly, at parse time', () => {
    expect(() => parseArgs(['--seed', 'not-a-seed'])).toThrow(/seed must be an integer/);
  });

  it('accepts an in-domain --seed', () => {
    expect(parseArgs(['--seed', '12345']).seeds).toEqual([12345]);
    expect(parseArgs(['--seed', '-1']).seeds).toEqual([-1]);
  });

  it('rejects an out-of-domain value inside a --seeds range', () => {
    expect(() => parseArgs(['--seeds', '1..99999999999'])).toThrow(/seed must be an integer/);
  });

  it('rejects an out-of-domain value inside a --seeds comma list', () => {
    expect(() => parseArgs(['--seeds', '1,2,1e18'])).toThrow(/seed must be an integer/);
  });

  it('accepts an in-domain --seeds comma list and range', () => {
    expect(parseArgs(['--seeds', '1,2,3']).seeds).toEqual([1, 2, 3]);
    expect(parseArgs(['--seeds', '5..8']).seeds).toEqual([5, 6, 7, 8]);
  });
});
