/**
 * BACKLOG f004: class framework (SPEC-V2 §2) — Active skill as a sim Command,
 * cooldown, affinity replacing v0.1 class-exclusive signature towers, and the
 * Dusk picker binding for every class now that every tower is buildable by
 * everyone (D3).
 */
import { describe, expect, it } from 'vitest';

import { loadContent } from '../src/sim/content';
import { applyCommand, Run } from '../src/sim/run';
import { affinityMul, buildTower, checkBuild, towerDamage } from '../src/sim/towers';
import { spawnEnemy } from '../src/sim/enemies';
import type { Command, RunConfig, Structure, TickInput } from '../src/sim/types';
import { World } from '../src/sim/world';
import { cfg } from './helpers';

function newWorld(over: Partial<RunConfig> = {}): World {
  return new World(cfg(over));
}

function warp(w: World, tx: number, ty: number): void {
  w.warden.x = tx + 0.5;
  w.warden.y = ty + 0.5;
}

/**
 * RETIRED (SPEC-FINAL §4, gates G8/G9) — V2's class shape.
 *
 * These cases assert every class carries one Active with a "Day use" and a
 * "Night use" plus a Signature passive. §4's framework is archetype bands +
 * **Passive** + **Active1 (Q)** + **Active2 (E)** + **Tower passive**, across
 * eleven classes, with no Day/Night split to have a use in. The loader rule
 * that replaces this ("a class missing a slot fails the loader") is p6a's
 * acceptance. File deleted at **p6f**.
 */
describe.skip('f004: class content (SPEC-V2 §2)', () => {
  const content = loadContent();

  // RETIRED (SPEC-FINAL §4, P6): §4's framework is Passive + Active1 (Q) +
  // Active2 (E) + a Tower passive over archetype bands. "Day use / Night use"
  // is the cycle vocabulary §1.1 retires, and one Active is not the model.
  // Rewritten at BACKLOG p6a; deleted with the kits at p6d.
  it.skip('every class defines an Active with a Day use and a Night use, plus a Signature passive', () => {
    for (const c of content.classes.classes) {
      expect(c.active.name.length).toBeGreaterThan(0);
      expect(c.active.cooldownSeconds).toBeGreaterThan(0);
      expect(c.active.dayUse.length).toBeGreaterThan(0);
      expect(c.active.nightUse.length).toBeGreaterThan(0);
      expect(c.passive.name.length).toBeGreaterThan(0);
    }
  });

  it('affinity.json only references real classes and real towers', () => {
    const classKeys = new Set(content.classes.classes.map((c) => c.key));
    const towerKeys = new Set(content.towers.towers.map((t) => t.key));
    expect(content.affinity.affinities.length).toBeGreaterThan(0);
    for (const a of content.affinity.affinities) {
      expect(classKeys.has(a.classKey)).toBe(true);
      for (const t of a.towers) expect(towerKeys.has(t)).toBe(true);
    }
  });

  it('no tower carries a v0.1 class lock anymore', () => {
    for (const t of content.towers.towers) {
      expect((t as unknown as { classLock?: unknown }).classLock).toBeUndefined();
    }
  });
});

/**
 * RETIRED (SPEC-FINAL §4) — affinity.
 *
 * §4 gives each class a **Tower passive** ("all towers +10% attack speed",
 * "+10% range", ...) that is always on and applies to every tower. There is no
 * per-class per-tower damage affinity in SPEC-FINAL, so `affinity.json` and
 * the bonus it grants have no section left to serve. The surviving half of
 * this describe's claim — every class may build every tower — is unchanged by
 * §4 and is re-asserted by p6a's framework test. File deleted at **p6f**.
 */
describe.skip('f004: affinity replaces class locks (SPEC-V2 D3)', () => {
  it('every class may build every tower', () => {
    for (const classKey of ['engineer', 'pyromancer', 'frost_warden']) {
      const w = newWorld({ classKey });
      warp(w, 5, 5);
      for (const t of w.content.towers.towers) {
        expect(checkBuild(w, t.id, 5, 5)).not.toBe('class_locked');
      }
    }
  });

  it('an affinity tower deals +bonus damage for its class, and nothing extra for another class', () => {
    const w = newWorld({ classKey: 'engineer' });
    warp(w, 5, 5);
    const teslaDef = w.content.towerByKey.get('tesla_coil')!;
    const arrowDef = w.content.towerByKey.get('arrow_spire')!;
    expect(affinityMul(w, teslaDef.key)).toBeCloseTo(1.2, 5);
    expect(affinityMul(w, arrowDef.key)).toBeCloseTo(1, 5);

    const built = buildTower(w, teslaDef.id, 5, 5);
    expect(built.ok).toBe(true);
    const s = (built as { ok: true; structure: Structure }).structure;
    const buffed = towerDamage(w, s, 10);

    const w2 = newWorld({ classKey: 'pyromancer' });
    warp(w2, 5, 5);
    const built2 = buildTower(w2, teslaDef.id, 5, 5);
    const s2 = (built2 as { ok: true; structure: Structure }).structure;
    const unbuffed = towerDamage(w2, s2, 10);

    expect(buffed).toBeCloseTo(unbuffed * 1.2, 5);
  });
});

describe('f004: class Active skill as a sim Command', () => {
  it('deals damage in a radius, applies its effect, and starts its cooldown', () => {
    const w = newWorld({ classKey: 'pyromancer' }); // Immolation Wave: burst_damage + burn
    const e = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 1, w.warden.y)!;
    w.rebuildBuckets(); // enemiesInRadius reads the spatial hash Run.step() would otherwise refresh
    const hpBefore = e.hp;
    expect(w.warden.activeCooldown).toBe(0);

    applyCommand(w, { k: 'class_active' });

    expect(e.hp).toBeLessThan(hpBefore);
    expect(w.warden.activeCooldown).toBeGreaterThan(0);
  });

  it('does nothing while on cooldown', () => {
    const w = newWorld({ classKey: 'pyromancer' });
    spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 1, w.warden.y);
    w.rebuildBuckets();
    applyCommand(w, { k: 'class_active' });
    const cd = w.warden.activeCooldown;

    const e2 = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 1, w.warden.y)!;
    w.rebuildBuckets();
    const hpBefore = e2.hp;
    applyCommand(w, { k: 'class_active' });

    expect(e2.hp).toBe(hpBefore); // the second use never fired
    expect(w.warden.activeCooldown).toBe(cd); // cooldown untouched by the no-op
  });

  it('fires again once the cooldown has ticked down', () => {
    const w = newWorld({ classKey: 'pyromancer' });
    applyCommand(w, { k: 'class_active' });
    const cd = w.warden.activeCooldown;
    for (let i = 0; i < Math.ceil(cd * 60) + 1; i++) {
      w.warden.activeCooldown -= 1 / 60; // mirrors updateWarden's own tick
    }
    expect(w.warden.activeCooldown).toBeLessThanOrEqual(0);

    const e = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 1, w.warden.y)!;
    w.rebuildBuckets();
    const hpBefore = e.hp;
    applyCommand(w, { k: 'class_active' });
    expect(e.hp).toBeLessThan(hpBefore);
  });

  it('is a no-op outside the phases it is usable in', () => {
    const w = newWorld({ classKey: 'pyromancer' });
    w.phase = 'levelup';
    const e = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 1, w.warden.y)!;
    w.rebuildBuckets();
    const hpBefore = e.hp;
    applyCommand(w, { k: 'class_active' });
    expect(e.hp).toBe(hpBefore);
    expect(w.warden.activeCooldown).toBe(0);
  });

  it('replays to an identical end-state hash with class_active in the input log (SPEC 9.1)', () => {
    const log: TickInput[] = [];
    for (let t = 0; t < 400; t++) {
      const cmds: Command[] = t === 120 ? [{ k: 'class_active' }] : [];
      log.push({ mx: 0, my: 0, dash: false, attack: true, aimX: 0, aimY: 0, cmds });
    }
    const a = new Run(cfg({ classKey: 'pyromancer' }));
    for (const input of log) a.step(input);
    const b = new Run(cfg({ classKey: 'pyromancer' }));
    for (const input of log) b.step(input);
    expect(a.hash()).toBe(b.hash());
  });
});
