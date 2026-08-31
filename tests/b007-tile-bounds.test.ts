/**
 * BACKLOG-QUALITY q15 session 11 (BUG #2/#3), BACKLOG b007.
 *
 * `Grid.idx(tx,ty) = ty*GRID_W+tx` is never bounds-checked, so an out-of-grid
 * `tx` used to alias onto a real tile one row up (`World.structureAt` indexed
 * `grid.occ` with it directly), letting `upgrade`/`sell` silently act on
 * whatever real structure sits there instead of failing. Separately,
 * `GRID_W` (36) is even, so a fractional `ty = <legal> + 0.5` still
 * multiplies out to an integer flat index (`ty * GRID_W` cancels the `.5`),
 * so `build` used to land on a real, different tile and store the raw
 * fraction into the `Structure`.
 */

import { describe, expect, it } from 'vitest';

import { applyCommand } from '../src/sim/run';
import { buildTower, sellTower, upgradeTower } from '../src/sim/towers';
import { World } from '../src/sim/world';
import { GRID_W } from '../src/sim/grid';
import { cfg } from './helpers';

// Within the fresh World's default Warden position/buildRange (checked once
// below): a real, legally-buildable tile to anchor every aliasing case on.
const TX = 20;
const TY = 10;

function worldWithTower(): { w: World; towerId: number } {
  const w = new World(cfg());
  const towerId = w.content.towerByKey.get('arrow_spire')!.id;
  const res = buildTower(w, towerId, TX, TY);
  expect(res.ok).toBe(true);
  // The illegal alias coordinate used below sits a full GRID_W off-grid,
  // which `inBuildRange`'s ordinary distance check would also reject on its
  // own — widen it so these tests isolate the `structureAt` aliasing defect
  // itself rather than passing for the wrong (coincidental) reason.
  w.derived.buildRange = 9999;
  return { w, towerId };
}

describe('b007: tile-coordinate bounds/integer checks', () => {
  it('structureAt rejects an out-of-grid tx rather than aliasing onto a real tile one row up', () => {
    const { w } = worldWithTower();
    // idx(TX+GRID_W, TY-1) === idx(TX, TY): same flat index, reached via an
    // out-of-grid tx one row up instead of the real (TX, TY).
    const illegalTx = TX + GRID_W;
    expect((TY - 1) * GRID_W + illegalTx).toBe(TY * GRID_W + TX);
    expect(w.structureAt(illegalTx, TY - 1)).toBeNull();
  });

  it('upgrade cannot alias an out-of-grid tx onto the real structure one row up', () => {
    const { w } = worldWithTower();
    const before = w.structureAt(TX, TY)!;
    const goldBefore = w.gold;
    const tierBefore = before.tier;

    const illegalTx = TX + GRID_W;
    expect(upgradeTower(w, illegalTx, TY - 1)).toBe(false);

    const after = w.structureAt(TX, TY)!;
    expect(after.tier).toBe(tierBefore);
    expect(w.gold).toBe(goldBefore);
  });

  it('sell cannot alias an out-of-grid tx onto the real structure one row up', () => {
    const { w } = worldWithTower();
    const goldBefore = w.gold;
    const towersBefore = w.towersBuilt;

    const illegalTx = TX + GRID_W;
    expect(sellTower(w, illegalTx, TY - 1)).toBe(false);

    expect(w.structureAt(TX, TY)).not.toBeNull();
    expect(w.gold).toBe(goldBefore);
    expect(w.towersBuilt).toBe(towersBefore);
  });

  it('both aliasing directions are rejected via the real Command path too', () => {
    const w = new World(cfg());
    const towerId = w.content.towerByKey.get('arrow_spire')!.id;
    applyCommand(w, { k: 'build', tower: towerId, tx: TX, ty: TY });
    expect(w.structureAt(TX, TY)).not.toBeNull();
    w.derived.buildRange = 9999;

    const illegalTx = TX + GRID_W;
    const goldBefore = w.gold;
    applyCommand(w, { k: 'upgrade', tx: illegalTx, ty: TY - 1 });
    applyCommand(w, { k: 'sell', tx: illegalTx, ty: TY - 1 });
    expect(w.gold).toBe(goldBefore);
    expect(w.structureAt(TX, TY)!.tier).toBe(1);
  });

  it('a fractional ty cannot build despite GRID_W (even) cancelling the fraction out of the flat index', () => {
    const w = new World(cfg());
    const towerId = w.content.towerByKey.get('arrow_spire')!.id;
    const goldBefore = w.gold;
    const builtBefore = w.towersBuilt;

    // GRID_W is even, so ty=TY+0.5 * GRID_W is still an integer: the exact
    // hole BUG #3 described.
    expect(((TY + 0.5) * GRID_W) % 1).toBe(0);
    const res = buildTower(w, towerId, TX, TY + 0.5);

    expect(res.ok).toBe(false);
    expect(w.towersBuilt).toBe(builtBefore);
    expect(w.gold).toBe(goldBefore);
    expect(w.structureAt(TX, TY)).toBeNull();
  });

  it('a fractional tx is rejected the same way, even though it does not alias', () => {
    const w = new World(cfg());
    const towerId = w.content.towerByKey.get('arrow_spire')!.id;
    const builtBefore = w.towersBuilt;

    const res = buildTower(w, towerId, TX + 0.5, TY);

    expect(res.ok).toBe(false);
    expect(w.towersBuilt).toBe(builtBefore);
  });
});
