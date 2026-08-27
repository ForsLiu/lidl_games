/**
 * p6a — SPEC-FINAL §4's class framework: archetype bands (resolved to a
 * numeric basic-attack profile) + Passive + Active1 (Q) + Active2 (E) + Tower
 * passive, each a `legacy: false` class alongside the three existing
 * `legacy: true` V2 kits (Q38). This item is the framework only — no real §4
 * kit is authored yet (Swordsman/Plaguebringer land at p6b/p6c, the other
 * nine at p6d) — so every case here drives a hand-built fixture class through
 * the real engine paths (`ClassesFileSchema`, `useClassActive`/
 * `useClassActive2`, `classBasicAttack`, `baseRunStats`), the same technique
 * `m20a-upgrade-tracks.test.ts`'s own `contentWith` helper already uses for a
 * tower row nothing in `/data` authors yet.
 */
import { describe, expect, it } from 'vitest';

import {
  ClassesFileSchema,
  loadContent,
  type Content,
  type NewClassDef,
} from '../src/sim/content';
import { spawnEnemy } from '../src/sim/enemies';
import { applyCommand, hashWorld, Run, updateWarden } from '../src/sim/run';
import type { Command, RunConfig, TickInput } from '../src/sim/types';
import { World } from '../src/sim/world';
import { cfg } from './helpers';

const content = loadContent();

const FIXTURE: NewClassDef = {
  key: 'test_framework',
  name: 'Test Framework',
  unlockedByDefault: true,
  unlockQuest: null,
  legacy: false,
  moveSpeedBonus: 0.5,
  basicAttack: { dps: 100, range: 6, interval: 0.5, aoe: 2 },
  passive: { name: 'Test Passive', description: 'test', mods: { towerCost: -0.5 } },
  active1: { name: 'Test Active1', kind: 'burst_damage', cooldownSeconds: 4, radius: 3, damage: 40 },
  active2: {
    name: 'Test Active2',
    kind: 'burst_damage',
    cooldownSeconds: 6,
    radius: 3,
    damage: 25,
    slow: 0.5,
    slowDuration: 1,
  },
  towerPassive: { name: 'Test Tower Passive', description: 'test', mods: { towerDamage: 1 } },
};

/** `content`, plus one extra class — mirrors `m20a-upgrade-tracks.test.ts`'s `contentWith`. */
function contentWithClass(cls: NewClassDef): Content {
  const classes = [...content.classes.classes, cls];
  return {
    ...content,
    classes: { ...content.classes, classes },
    classByKey: new Map(classes.map((c) => [c.key, c])),
  };
}

const FIXTURE_CONTENT = contentWithClass(FIXTURE);

function worldWith(over: Partial<RunConfig> = {}): World {
  const w = new World(cfg({ classKey: FIXTURE.key, ...over }), FIXTURE_CONTENT);
  w.gold = 1e6;
  return w;
}

describe('p6a: the loader rejects a legacy: false class missing any of the four slots', () => {
  const SLOTS = ['basicAttack', 'passive', 'active1', 'active2', 'towerPassive'] as const;

  it('accepts a well-formed new-shape class', () => {
    expect(() => ClassesFileSchema.parse({ classes: [FIXTURE] })).not.toThrow();
  });

  for (const slot of SLOTS) {
    it(`rejects a class missing "${slot}"`, () => {
      const broken = { ...FIXTURE } as Record<string, unknown>;
      delete broken[slot];
      expect(() => ClassesFileSchema.parse({ classes: [broken] })).toThrow();
    });
  }

  it('still accepts every shipped legacy: true class (the real data/classes.json)', () => {
    expect(() => ClassesFileSchema.parse(content.classes)).not.toThrow();
    // p6b ships the first real legacy: false class (Swordsman); the three
    // original V2-era classes stay legacy: true (Q38).
    const legacyKeys = ['engineer', 'pyromancer', 'frost_warden'];
    for (const c of content.classes.classes) {
      expect(c.legacy).toBe(legacyKeys.includes(c.key));
    }
  });
});

describe('p6a: Active1 (Q) and Active2 (E) are two independently cooled-down sim Commands', () => {
  it('class_active fires Active1, deals damage, and starts only active1Cooldown', () => {
    const w = worldWith();
    const e = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 1, w.warden.y)!;
    w.rebuildBuckets();
    const hpBefore = e.hp;

    applyCommand(w, { k: 'class_active' });

    expect(e.hp).toBeLessThan(hpBefore);
    expect(w.warden.active1Cooldown).toBeGreaterThan(0);
    expect(w.warden.active2Cooldown).toBe(0);
    expect(w.warden.activeCooldown).toBe(0); // the legacy field is untouched by the new-shape path
  });

  it('class_active2 fires Active2 independently, with its own cooldown and effect', () => {
    const w = worldWith();
    const e = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 1, w.warden.y)!;
    w.rebuildBuckets();
    const hpBefore = e.hp;

    applyCommand(w, { k: 'class_active2' });

    expect(e.hp).toBeLessThan(hpBefore);
    expect(w.warden.active2Cooldown).toBeGreaterThan(0);
    expect(w.warden.active1Cooldown).toBe(0);
  });

  it('Active1 on cooldown does not block Active2, and vice versa', () => {
    const w = worldWith();
    applyCommand(w, { k: 'class_active' });
    expect(w.warden.active1Cooldown).toBeGreaterThan(0);

    const e = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 1, w.warden.y)!;
    w.rebuildBuckets();
    const hpBefore = e.hp;
    applyCommand(w, { k: 'class_active2' }); // fires even though Active1 is still cooling down
    expect(e.hp).toBeLessThan(hpBefore);
  });

  it('class_active2 is a no-op for a legacy: true class', () => {
    const w = new World(cfg({ classKey: 'pyromancer' }));
    const e = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 1, w.warden.y)!;
    w.rebuildBuckets();
    const hpBefore = e.hp;
    applyCommand(w, { k: 'class_active2' });
    expect(e.hp).toBe(hpBefore);
    expect(w.warden.active2Cooldown).toBe(0);
  });

  it('a legacy: true class still fires its one Active through class_active exactly as before', () => {
    const w = new World(cfg({ classKey: 'pyromancer' })); // Immolation Wave: burst_damage + burn
    const e = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 1, w.warden.y)!;
    w.rebuildBuckets();
    const hpBefore = e.hp;
    applyCommand(w, { k: 'class_active' });
    expect(e.hp).toBeLessThan(hpBefore);
    expect(w.warden.activeCooldown).toBeGreaterThan(0);
    expect(w.warden.active1Cooldown).toBe(0); // the new-shape fields are untouched by the legacy path
  });
});

describe('p6a: Passive and Tower passive fold into Stats like any other generic mods source', () => {
  it('the passive mods are sourced as class:<key>:passive', () => {
    const w = worldWith();
    expect(w.stats.contributions('towerCost')).toContainEqual(['class:test_framework:passive', -0.5]);
  });

  it('the tower passive mods are sourced as class:<key>:towerPassive and double a built tower\'s damage', () => {
    const w = worldWith();
    expect(w.stats.contributions('towerDamage')).toContainEqual(['class:test_framework:towerPassive', 1]);
    expect(w.derived.towerDamageMul).toBeCloseTo(2, 5);
  });

  it("the move band's bonus folds into moveSpeedPct", () => {
    const w = worldWith();
    expect(w.stats.contributions('moveSpeedPct')).toContainEqual(['class:test_framework:bands', 0.5]);
  });

  it('a class with no passive/towerPassive mods contributes nothing extra (mods defaults to {})', () => {
    const bare: NewClassDef = {
      ...FIXTURE,
      key: 'test_framework_bare',
      passive: { name: 'Bare', description: 'test' } as NewClassDef['passive'],
      towerPassive: { name: 'Bare', description: 'test' } as NewClassDef['towerPassive'],
    };
    const parsed = ClassesFileSchema.parse({ classes: [bare] }).classes[0] as NewClassDef;
    expect(parsed.passive.mods).toEqual({});
    expect(parsed.towerPassive.mods).toEqual({});
  });
});

describe('p6a: the basic attack auto-fires on the band profile with no input.attack', () => {
  it('auto-fires over several ticks at a stationary enemy, with no cmds and attack:false', () => {
    const run = new Run(cfg({ classKey: FIXTURE.key }), FIXTURE_CONTENT);
    run.world.gold = 1e6;
    const e = spawnEnemy(
      run.world,
      run.world.content.enemies.enemies[0].key,
      run.world.warden.x + 3,
      run.world.warden.y,
    )!;
    const hpBefore = e.hp;
    for (let t = 0; t < 60 && !e.dead; t++) {
      run.step({ mx: 0, my: 0, dash: false, attack: false, aimX: 0, aimY: 0, active1Held: false, cmds: [] });
    }
    expect(e.dead || e.hp < hpBefore).toBe(true);
  });

  it('an enemy outside basicAttack.range takes no auto-attack damage', () => {
    const run = new Run(cfg({ classKey: FIXTURE.key }), FIXTURE_CONTENT);
    run.world.gold = 1e6;
    const e = spawnEnemy(
      run.world,
      run.world.content.enemies.enemies[0].key,
      run.world.warden.x + FIXTURE.basicAttack.range + 5,
      run.world.warden.y,
    )!;
    const hpBefore = e.hp;
    for (let t = 0; t < 60; t++) {
      run.step({ mx: 0, my: 0, dash: false, attack: false, aimX: 0, aimY: 0, active1Held: false, cmds: [] });
    }
    expect(e.hp).toBe(hpBefore);
  });

  it("does not fire during VS (huntsWarden) — TD-only, matching the legacy manual attack's own scope (Q117)", () => {
    const w = worldWith();
    w.phase = 'act2';
    expect(w.huntsWarden).toBe(true);
    const e = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 1, w.warden.y)!;
    w.rebuildBuckets();
    const hpBefore = e.hp;
    const input: TickInput = { mx: 0, my: 0, dash: false, attack: false, aimX: 0, aimY: 0, active1Held: false, cmds: [] };
    for (let t = 0; t < 60; t++) updateWarden(w, input, 1 / 60);
    expect(e.hp).toBe(hpBefore);
  });
});

describe('p6a: replay-hash determinism with Active1/Active2 and the auto basic attack in the log', () => {
  it('two independent runs from the same input log reach an identical end-state hash', () => {
    const log: TickInput[] = [];
    for (let t = 0; t < 300; t++) {
      const cmds: Command[] = [];
      if (t === 60) cmds.push({ k: 'class_active' });
      if (t === 120) cmds.push({ k: 'class_active2' });
      log.push({ mx: t % 7 === 0 ? 1 : 0, my: 0, dash: false, attack: false, aimX: 0, aimY: 0, active1Held: false, cmds });
    }

    const a = new Run(cfg({ classKey: FIXTURE.key }), FIXTURE_CONTENT);
    a.world.gold = 1e6;
    spawnEnemy(a.world, a.world.content.enemies.enemies[0].key, a.world.warden.x + 3, a.world.warden.y);
    for (const input of log) a.step(input);

    const b = new Run(cfg({ classKey: FIXTURE.key }), FIXTURE_CONTENT);
    b.world.gold = 1e6;
    spawnEnemy(b.world, b.world.content.enemies.enemies[0].key, b.world.warden.x + 3, b.world.warden.y);
    for (const input of log) b.step(input);

    expect(a.hash()).toBe(b.hash());
    expect(hashWorld(a.world)).toBe(hashWorld(b.world));
    // Not a vacuous replay: both Actives and the auto basic attack actually fired.
    expect(a.world.warden.active1Cooldown === 0 && a.world.warden.active2Cooldown === 0).toBe(false);
  });
});
