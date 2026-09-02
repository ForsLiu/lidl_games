/**
 * fb031 (owner feedback `feature-exp-accelerating-pickup`): once a gem is
 * attracted (inside pickup radius), its pull speed ramps continuously and
 * uncapped, so it always catches a moving character — the fixed `7 + radius`
 * pull speed of pre-fb031 code could not, once fb041 removed the VS "swift"
 * boon's rank cap and a build's real move speed lost its ceiling.
 */
import { describe, expect, it } from 'vitest';

import { World } from '../src/sim/world';
import { updateGems } from '../src/sim/progression';
import { cfg } from './helpers';

function act2World(): World {
  const w = new World(cfg());
  w.phase = 'act2';
  w.sundered = true;
  w.warden.x = 10;
  w.warden.y = 10;
  return w;
}

describe('fb031: gem attraction speed ramps uncapped once attracted', () => {
  it('a gem attracted behind a character retreating far faster than any pre-fb031 pull speed is still caught within 2s', () => {
    const w = act2World();
    const radius = w.derived.pickupRadius;
    // Placed just inside pickup radius, directly behind the character's line
    // of retreat.
    w.gems.push({
      id: 1,
      x: w.warden.x - (radius - 0.05),
      y: w.warden.y,
      value: 1,
      vx: 0,
      vy: 0,
      life: 999,
      dead: false,
    });

    const dt = 1 / 60;
    // Establish the chase (warden stationary) before the character bolts —
    // "a gem attracted behind a character moving at max speed", not a
    // same-tick race between the gem entering radius and the flee starting.
    updateGems(w, dt);
    expect(w.gems[0].attractedT).toBeGreaterThan(0);

    // tiles/s — far above the old fixed `7 + radius` pull, standing in for
    // an uncapped stacked-move-speed build (fb041 removed the VS "swift"
    // boon's rank cap, so real move speed lost its ceiling). Immediately
    // outruns the fixed pull and pushes the gem back outside pickup radius
    // within one tick, exercising the sticky-chase rule: attraction, once
    // started, does not freeze just because the gap reopens.
    const retreatSpeed = 20;
    let caughtAtTick = -1;
    for (let tick = 0; tick < 180; tick++) {
      w.warden.x += retreatSpeed * dt; // character flees in a straight line
      updateGems(w, dt);
      if (w.gems.find((g) => g.id === 1)?.dead) {
        caughtAtTick = tick;
        break;
      }
    }

    expect(caughtAtTick).toBeGreaterThanOrEqual(0);
    expect(caughtAtTick * dt).toBeLessThanOrEqual(2);
  });

  it('the pull speed strictly increases the longer a gem stays attracted', () => {
    const dt = 1 / 60;
    const distanceFromWarden = 1.0; // inside pickupRadius (1.5), safely above the 0.5 collection threshold

    // Isolates the ramp formula from catch-up dynamics: same start distance
    // each time, only `attractedT` differs going into a single tick.
    function deltaAt(attractedT: number): number {
      const w = act2World();
      w.gems.push({
        id: 1,
        x: w.warden.x - distanceFromWarden,
        y: w.warden.y,
        value: 1,
        vx: 0,
        vy: 0,
        life: 999,
        dead: false,
        attractedT,
      });
      const before = { x: w.gems[0].x, y: w.gems[0].y };
      updateGems(w, dt);
      const after = w.gems.find((g) => g.id === 1)!;
      return Math.hypot(after.x - before.x, after.y - before.y);
    }

    const early = deltaAt(0);
    const later = deltaAt(5); // 5s already attracted
    expect(later).toBeGreaterThan(early);
  });

  it('a heavily ramped-up gem never overshoots past the Warden and flies off (qa-playtester fb031 finding: an unclamped step diverged to ~1e5 tiles instead of being caught)', () => {
    const w = act2World();
    const radius = w.derived.pickupRadius;
    // A gem that has already been chased for a long while (well past the
    // point where `pull * dt` alone would dwarf the remaining gap), sitting
    // right next to a stationary character.
    w.gems.push({
      id: 1,
      x: w.warden.x - (radius - 0.05),
      y: w.warden.y,
      value: 1,
      vx: 0,
      vy: 0,
      life: 999,
      dead: false,
      attractedT: 8,
    });

    updateGems(w, 1 / 60);

    // Caught cleanly on the very next tick, landing inside the collect
    // radius rather than overshooting out the far side.
    const g = w.gems.find((gm) => gm.id === 1);
    expect(g?.dead ?? true).toBe(true);
    expect(w.xp).toBe(1);
  });

  it('a gem chased across a character reversing direction repeatedly (kiting) is still caught within 2s of genuinely becoming attracted, and never expires uncollected', () => {
    const w = act2World();
    const radius = w.derived.pickupRadius;
    w.gems.push({
      id: 1,
      x: w.warden.x - (radius - 0.05),
      y: w.warden.y,
      value: 1,
      vx: 0,
      vy: 0,
      life: w.content.spawns.gemLifetimeSeconds, // the real fade timer, not an inflated test value
      dead: false,
    });

    const dt = 1 / 60;
    // Warm-up tick with the Warden stationary establishes genuine attraction
    // (sidesteps the same-tick boundary race a fresh flee would hit — see
    // the first test's comment).
    updateGems(w, dt);
    expect(w.gems[0].attractedT).toBeGreaterThan(0);

    const speed = 40; // far above any pre-fb041-uncapped move speed
    const halfCycleTicks = 180; // reverse direction every 3s — aggressive kiting
    let caughtAtTick = -1;
    for (let tick = 0; tick < 600; tick++) {
      const dir = Math.floor(tick / halfCycleTicks) % 2 === 0 ? 1 : -1;
      w.warden.x += dir * speed * dt;
      updateGems(w, dt);
      const g = w.gems.find((gm) => gm.id === 1);
      if (!g || g.dead) {
        caughtAtTick = tick;
        break;
      }
    }

    expect(caughtAtTick).toBeGreaterThanOrEqual(0);
    expect(caughtAtTick * dt).toBeLessThanOrEqual(2);
    // Caught via real collection (XP granted), not via its life timer running out.
    expect(w.xp).toBe(1);
  });

  it('a gem outside pickup radius does not move and does not accrue any ramp', () => {
    const w = act2World();
    const radius = w.derived.pickupRadius;
    w.gems.push({
      id: 1,
      x: w.warden.x - (radius + 5),
      y: w.warden.y,
      value: 1,
      vx: 0,
      vy: 0,
      life: 999,
      dead: false,
    });
    const dt = 1 / 60;
    for (let i = 0; i < 120; i++) updateGems(w, dt);

    const g = w.gems.find((gm) => gm.id === 1)!;
    expect(g.dead).toBe(false);
    expect(g.x).toBe(w.warden.x - (radius + 5));
    expect(g.attractedT ?? 0).toBe(0);
  });
});
