/**
 * fb154 — VS waves spawn from the TD gates (owner feedback
 * `vs-spawn-from-gates`, amending SPEC-FINAL §6).
 *
 * Before this item a VS wave's enemies appeared on a ring just outside the
 * play area's edge, which made the run's gate placement — and, since fb077,
 * its generated terrain — matter in the TD half of the cycle and nowhere else.
 * The order: "all gates active, round-robin or budget-split", rifts and bursts
 * included, with **fliers** keeping their edge spawn on the owner's own
 * designer note so they keep their bypass role.
 *
 * What is pinned here: every ground spawn lands on a gate tile, every gate is
 * used, fliers do not, the choice is deterministic from the seed, and the edge
 * ring is still reachable as a fallback when the gates cannot serve.
 */

import { describe, expect, it } from 'vitest';

import { edgeSpawnPoint, pickSpawnPoint, spawnFinalBoss, updateDirector } from '../src/sim/act2';
import { World } from '../src/sim/world';
import { hashWorld } from '../src/sim/run';
import { GRID_H, GRID_W } from '../src/sim/grid';
import { cfg } from './helpers';

function vsWorld(seed = 1): World {
  const w = new World(cfg({ seed }));
  w.phase = 'act2';
  return w;
}

/** A tile the run actually authors as a gate. */
function isGateTile(w: World, x: number, y: number): boolean {
  return w.gates.some((g) => Math.floor(x) === g.tx && Math.floor(y) === g.ty);
}

/** Distance from a point to the nearest gate centre. */
function nearestGate(w: World, x: number, y: number): number {
  return Math.min(...w.gates.map((g) => Math.hypot(x - (g.tx + 0.5), y - (g.ty + 0.5))));
}

const GROUND = 'husk';
const FLIER = 'gale_imp';

describe('fb154 — VS ground spawns come out of the gates', () => {
  it('the harness picks a real flier and a real ground enemy, or it proves nothing', () => {
    const w = vsWorld();
    expect(w.content.enemyByKey.get(FLIER)?.traits).toContain('flying');
    expect(w.content.enemyByKey.get(GROUND)?.traits ?? []).not.toContain('flying');
    expect(w.gates.length).toBeGreaterThan(1);
  });

  it('100% of ground spawns land on a gate tile', () => {
    const w = vsWorld();
    for (let i = 0; i < 200; i++) {
      const p = pickSpawnPoint(w, GROUND);
      expect(isGateTile(w, p.x, p.y), `spawn ${i} at ${p.x.toFixed(2)},${p.y.toFixed(2)} is not on a gate`).toBe(true);
    }
  });

  it('every gate is used, round-robin, not one gate by luck', () => {
    const w = vsWorld();
    // Far from *every* gate, so the "never spawn on top of the player" rule
    // below does not legitimately exclude one of them from the rotation. On a
    // 36x20 map with a 12-tile rule that is a real constraint: the map centre
    // is only 9.5 tiles from the north gate, so the centre would not do.
    w.warden.x = 18;
    w.warden.y = 18;
    const minDist = Math.min(w.content.spawns.spawnDistance, 12);
    for (const g of w.gates) {
      expect(Math.hypot(g.tx + 0.5 - w.warden.x, g.ty + 0.5 - w.warden.y), `${g.key} is too close to the probe`).toBeGreaterThanOrEqual(minDist);
    }
    const used = new Map<string, number>();
    for (let i = 0; i < 60; i++) {
      const p = pickSpawnPoint(w, GROUND);
      const gate = w.gates.find((g) => Math.floor(p.x) === g.tx && Math.floor(p.y) === g.ty)!;
      used.set(gate.key, (used.get(gate.key) ?? 0) + 1);
    }
    expect(used.size, 'a gate never spawned anything').toBe(w.gates.length);
    // Round-robin, so the counts are even to within one lap.
    const counts = [...used.values()];
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it('a flier still enters from the edge ring, keeping its bypass role', () => {
    const w = vsWorld();
    let offGate = 0;
    for (let i = 0; i < 50; i++) {
      const p = pickSpawnPoint(w, FLIER);
      if (!isGateTile(w, p.x, p.y)) offGate++;
      // The edge ring is the rim of the walkable area, plus however far
      // `nudgeToOpen` had to slide the point off blocked terrain (3 tiles).
      const rim = p.x <= 5 || p.y <= 5 || p.x >= GRID_W - 5 || p.y >= GRID_H - 5;
      expect(rim, `flier spawned inland at ${p.x.toFixed(2)},${p.y.toFixed(2)}`).toBe(true);
    }
    expect(offGate, 'every flier landed on a gate — the flier branch is not live').toBeGreaterThan(40);
  });

  it('a real director tick puts every ground enemy on a gate', () => {
    const w = vsWorld(7);
    // The director's own spend path, not a hand-rolled one — this is the code
    // a live VS wave runs.
    for (let i = 0; i < 20; i++) updateDirector(w, 1);
    const spawned = w.enemies.filter((e) => !e.dead);
    expect(spawned.length, 'the budget bought nothing — the assertion below is vacuous').toBeGreaterThan(3);
    for (const e of spawned) {
      if (e.flying) continue;
      // Distance, not tile equality: a `pack` enemy (Swarm Rat) scatters its
      // pack around the point the director chose, and `nudgeToOpen` can slide a
      // spawn off blocked terrain. The claim is that the wave arrives *through
      // the gates*, not that every body starts on the gate's own tile — the
      // exact-tile version is the `pickSpawnPoint` case above.
      const near = Math.min(...w.gates.map((g) => Math.hypot(e.x - (g.tx + 0.5), e.y - (g.ty + 0.5))));
      expect(near, `${e.def.key} spawned ${near.toFixed(1)} tiles from any gate`).toBeLessThanOrEqual(2.5);
    }
  });

  it('the gate choice is deterministic from the seed, and hashed', () => {
    const a = vsWorld(3);
    const b = vsWorld(3);
    const pick = (w: World): string => {
      const out: string[] = [];
      for (let i = 0; i < 12; i++) {
        const p = pickSpawnPoint(w, GROUND);
        out.push(`${p.x.toFixed(4)},${p.y.toFixed(4)}`);
      }
      return out.join('|');
    };
    expect(pick(a)).toBe(pick(b));
    // The cursor is live state: two worlds that have spawned a different number
    // of ground enemies must not hash the same.
    const c = vsWorld(3);
    const d = vsWorld(3);
    pickSpawnPoint(c, GROUND);
    expect(hashWorld(c)).not.toBe(hashWorld(d));
  });

  it('the edge ring is still there as the fallback, and is off the gates', () => {
    // A map with no gates at all cannot serve a gate spawn; the director must
    // still place the enemy rather than stall.
    const w = vsWorld();
    const p = edgeSpawnPoint(w);
    expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    w.gates.length = 0;
    const fallback = pickSpawnPoint(w, GROUND);
    expect(Number.isFinite(fallback.x) && Number.isFinite(fallback.y)).toBe(true);
  });

  it('never materialises on top of the Warden, even standing on a gate', () => {
    // The edge ring has always honoured `spawns.spawnDistance`; the gates have
    // to as well, or a player kiting into a gate corner takes the wave in the
    // face (code review: measured one spawn in three within 0.2 tiles, the
    // final boss included, before this rule).
    const w = vsWorld();
    const gate = w.gates[0];
    w.warden.x = gate.tx + 0.5;
    w.warden.y = gate.ty + 0.5;
    const minDist = Math.min(w.content.spawns.spawnDistance, 12);
    for (let i = 0; i < 60; i++) {
      const p = pickSpawnPoint(w, GROUND);
      const d = Math.hypot(p.x - w.warden.x, p.y - w.warden.y);
      expect(d, `spawn ${i} landed ${d.toFixed(2)} tiles from the Warden`).toBeGreaterThanOrEqual(minDist);
      expect(isGateTile(w, p.x, p.y), 'the distance rule fell back off the gates entirely').toBe(true);
    }
  });

  it('still spawns when every gate is close to the Warden, rather than stalling', () => {
    // The distance rule is a preference, not a veto: a map (or a Warden) that
    // leaves no distant gate must still produce a spawn.
    const w = vsWorld();
    w.gates.length = 1;
    w.warden.x = w.gates[0].tx + 0.5;
    w.warden.y = w.gates[0].ty + 0.5;
    const p = pickSpawnPoint(w, GROUND);
    expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    expect(isGateTile(w, p.x, p.y)).toBe(true);
  });

  it('every gate keeps a real share of the wave from where the player actually stands', () => {
    // qa-playtester: the distance rule makes "all gates active" conditional on
    // the Warden's position — on a 36x20 map with a 12-tile rule, all three
    // gates are live from only 19.4% of open tiles. The round-robin case above
    // deliberately parks the Warden clear of every gate, so it cannot see this.
    // This one measures the shape a real run produces, from the Warden's own
    // spawn, and pins a floor rather than an even split: a gate that fell out
    // of the rotation entirely would be the regression.
    // The Warden **moves** — that is the whole point. From any single standing
    // position the rule can shut a gate out completely (parked at the default
    // spawn, the north gate is 10.6 tiles away and never serves), so a static
    // probe would either measure zero or measure nothing. Walking a circuit and
    // taking a few picks at each stop is the shape a real wave sees, and
    // qa-playtester measured the live result at 21.6%-40.4% per gate.
    const w = vsWorld();
    const share = new Map<string, number>();
    let picks = 0;
    const circuit: [number, number][] = [
      [6, 6],
      [18, 6],
      [30, 6],
      [30, 14],
      [18, 14],
      [6, 14],
      [12, 10],
      [24, 10],
    ];
    for (const [x, y] of circuit) {
      w.warden.x = x;
      w.warden.y = y;
      for (let i = 0; i < 25; i++) {
        const p = pickSpawnPoint(w, GROUND);
        const gate = w.gates.find((g) => Math.floor(p.x) === g.tx && Math.floor(p.y) === g.ty)!;
        share.set(gate.key, (share.get(gate.key) ?? 0) + 1);
        picks++;
      }
    }
    for (const g of w.gates) {
      const n = share.get(g.key) ?? 0;
      expect(n / picks, `gate ${g.key} served ${n}/${picks} spawns over the circuit`).toBeGreaterThanOrEqual(0.15);
    }
  });

  it('the elite, rift and boss paths all come out of the gates too', () => {
    // qa-playtester: the acceptance names these three explicitly and the suite
    // pinned none of them — dropping the key argument at `spawnFinalBoss` left
    // the whole suite green.
    const elite = vsWorld(5);
    elite.act2Time = 0;
    elite.eliteTimer = 0;
    for (let i = 0; i < 5; i++) updateDirector(elite, 1);
    const elites = elite.enemies.filter((e) => e.elite && !e.flying);
    expect(elites.length, 'no elite spawned — the assertion below is vacuous').toBeGreaterThan(0);
    for (const e of elites) expect(nearestGate(elite, e.x, e.y)).toBeLessThanOrEqual(2.5);

    // A rift burst: the director's own burst path, at a rift time.
    const rift = vsWorld(5);
    rift.act2Time = rift.content.spawns.riftTimes[0] ?? 181;
    for (let i = 0; i < 5; i++) updateDirector(rift, 1);
    const ground = rift.enemies.filter((e) => !e.flying && !e.dead);
    expect(ground.length, 'the rift spawned no ground enemies').toBeGreaterThan(0);
    for (const e of ground) expect(nearestGate(rift, e.x, e.y)).toBeLessThanOrEqual(2.5);

    const bossWorld = vsWorld(5);
    spawnFinalBoss(bossWorld);
    const boss = bossWorld.enemies.find((e) => e.boss)!;
    expect(boss, 'no boss spawned').toBeDefined();
    expect(nearestGate(bossWorld, boss.x, boss.y), 'the Warden-Eater did not come out of a gate').toBeLessThanOrEqual(2.5);
  });
});
