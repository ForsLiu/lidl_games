/**
 * fb155 — every enemy publishes what its attack **is** and how far it reaches
 * (owner feedback `ui-enemy-attack-indicators`, the `/data` half; the UI lane's
 * fb158 draws the icon and the ring from these two fields).
 *
 * The point of the pair is that the renderer stops re-deriving an attack kind
 * from the `traits` array and stops guessing a reach from a formula it would
 * have to keep in step with `enemies.ts` by hand. That only works if the
 * authored numbers are the numbers combat swings — so this file checks the
 * agreement in both directions:
 *
 *  - **registry**: all 20 §9 enemies carry `attackKind` and `attackRange`, and
 *    the loader refuses a row missing either;
 *  - **agreement**: the authored range equals the radius the sim actually uses
 *    for that kind — read out of the same `/data` the sim reads, never re-typed;
 *  - **liveness**: the range is what a live hit actually happens at, measured
 *    by walking an enemy in until it connects, so a row that agrees with the
 *    loader but not with the world still fails.
 */

import { describe, expect, it } from 'vitest';

import { loadContent } from '../src/sim/content';
import { spawnEnemy, updateEnemies } from '../src/sim/enemies';
import { bossUpdate, slam, updateBossSlam } from '../src/sim/boss';
import { World } from '../src/sim/world';
import { cfg } from './helpers';

const content = loadContent();
const KINDS = ['melee', 'ranged', 'bomber', 'healer', 'buffer', 'burrower', 'phaser'];

describe('fb155 — the enemy attack registry', () => {
  it('all 20 enemies carry an attack kind and a reach', () => {
    expect(content.enemies.enemies.length).toBe(20);
    for (const e of content.enemies.enemies) {
      expect(KINDS, `${e.key} authors an unknown attack kind`).toContain(e.attackKind);
      expect(e.attackRange, `${e.key} has no reach`).toBeGreaterThan(0);
    }
  });

  it('the loader refuses a row missing either field', () => {
    for (const field of ['attackKind', 'attackRange']) {
      const doc = JSON.parse(JSON.stringify(content.raw.enemies)) as { enemies: Record<string, unknown>[] };
      delete doc.enemies[0][field];
      expect(() => loadContent({ enemies: doc }), `a row without ${field} loaded`).toThrow();
    }
  });

  it('the authored reach is the radius the sim uses for that kind', () => {
    // Read from `/data`, then checked against the rule the sim follows — not a
    // second copy of the number (the m19c rule).
    const pad = content.spawns.contactPadding;
    for (const e of content.enemies.enemies) {
      // An enemy that deals contact damage attacks at its contact reach — its
      // blast or aura is the *special*, published separately. One with no
      // `coreDamage` has no contact attack, so the aura is the attack.
      // A scripted boss's reach is `boss.ts`'s, not the contact loop's; the
      // measured case below is what pins it.
      if ((e.traits ?? []).includes('finalBoss')) continue;
      const contacts = e.coreDamage > 0;
      if (e.attackKind === 'ranged') continue; // the sim reads this field itself; the liveness case measures it
      const expected = contacts
        ? e.radius + pad
        : e.attackKind === 'bomber'
          ? e.explodeRadius
          : e.attackKind === 'healer'
            ? e.healRadius
            : e.attackKind === 'buffer'
              ? e.buffRadius
              : e.radius + pad;
      expect(e.attackRange, `${e.key} (${e.attackKind})`).toBeCloseTo(expected!, 6);
    }
  });

  it('a kind that disagrees with its own traits is refused', () => {
    const doc = JSON.parse(JSON.stringify(content.raw.enemies)) as { enemies: Record<string, unknown>[] };
    const spitter = doc.enemies.find((e) => e.key === 'spitter')!;
    spitter.attackKind = 'melee';
    // Its reach is corrected to the melee rule too, so the *trait* rule is what
    // fires rather than the range rule catching it first — the two guards are
    // independent and this case is about the second one.
    spitter.attackRange = (spitter.radius as number) + content.spawns.contactPadding;
    expect(() => loadContent({ enemies: doc })).toThrow(/its traits describe "ranged"/);
  });

  it('a reach that disagrees with the sim is refused', () => {
    const doc = JSON.parse(JSON.stringify(content.raw.enemies)) as { enemies: Record<string, unknown>[] };
    const husk = doc.enemies.find((e) => e.key === 'husk')!;
    husk.attackRange = 6;
    expect(() => loadContent({ enemies: doc })).toThrow(/reaches .* but authors attackRange/);
  });

  it('elites and bosses publish the special reach the ring has to draw', () => {
    // The three whose special is a different radius from their swing. The
    // Gatebreaker's "special" is structure-breaking at melee reach, so it has
    // none to publish — an absent `specialRange` is the claim "the special
    // reaches as far as the attack does".
    const withSpecial = { colossus: 'stompRadius', herald: 'buffRadius', warden_eater: undefined } as Record<
      string,
      string | undefined
    >;
    for (const [key, field] of Object.entries(withSpecial)) {
      const def = content.enemyByKey.get(key)!;
      expect(def.specialRange, `${key} publishes no special reach`).toBeGreaterThan(0);
      if (field) expect(def.specialRange).toBeCloseTo((def as unknown as Record<string, number>)[field], 6);
    }
    // ...and the Warden-Eater's is measured, not re-typed: grow a real ring and
    // read how far it gets. qa-playtester caught the first version publishing
    // 5.5 for a ring that reached 6.4 — the authored number was being spent as
    // the ring's *lifetime* rather than as its reach.
    const w = new World(cfg());
    w.phase = 'act2';
    const eater = spawnEnemy(w, 'warden_eater', w.warden.x + 12, w.warden.y)!;
    slam(w, eater);
    const ring = w.areas.find((a) => a.type === 'bossSlam')!;
    let grown = ring.radius;
    for (let i = 0; i < 60 * 3 && !ring.dead; i++) {
      updateBossSlam(w, 1 / 60);
      ring.remaining -= 1 / 60;
      if (ring.remaining <= 0) break;
      grown = Math.max(grown, ring.radius);
    }
    // Within one frame of expansion (`SLAM_EXPAND` is 6 tiles/s, so 0.1 a
    // frame): the ring must reach what the row publishes and must not overrun
    // it, which is the property a drawn ring needs.
    const published = content.enemyByKey.get('warden_eater')!.specialRange!;
    expect(grown, 'the slam ring falls short of what the row publishes').toBeGreaterThan(published - 0.15);
    expect(grown, 'the slam ring overruns what the row publishes').toBeLessThanOrEqual(published + 0.01);
  });

  it('a melee enemy really does connect at its authored reach, and not before', () => {
    // The liveness half: agreement with the loader is not agreement with the
    // world. Walk a husk in from just outside its reach and just inside it.
    //
    // The sim still *computes* melee reach as `radius + contactPadding` rather
    // than reading the authored field — the two agree to 1e-6 by loader rule,
    // and reading the field would move the reach by a float ULP on the rows
    // whose sum is not exactly representable, which measurably re-rolled a run
    // (see `enemies.ts`). This case is what makes the published number
    // trustworthy anyway: it measures the real contact distance.
    const probe = (offset: number): boolean => {
      const w = new World(cfg());
      w.phase = 'act2';
      const def = w.content.enemyByKey.get('husk')!;
      const e = spawnEnemy(w, 'husk', w.warden.x + def.attackRange + offset, w.warden.y)!;
      e.speed = 0;
      w.rebuildBuckets();
      const before = w.warden.hp;
      updateEnemies(w, 1 / 60);
      return before - w.warden.hp > 0;
    };
    expect(probe(0.05), 'connected from outside its authored reach').toBe(false);
    expect(probe(-0.05), 'did not connect from inside its authored reach').toBe(true);
  });

  it('a ranged enemy shoots at its authored reach, and not past it', () => {
    const probe = (offset: number): boolean => {
      const w = new World(cfg());
      w.phase = 'act2';
      const def = w.content.enemyByKey.get('spitter')!;
      const e = spawnEnemy(w, 'spitter', w.warden.x + def.attackRange + offset, w.warden.y)!;
      e.speed = 0;
      e.attackCooldown = 0;
      w.rebuildBuckets();
      const before = w.warden.hp;
      updateEnemies(w, 1 / 60);
      return before - w.warden.hp > 0;
    };
    expect(probe(0.1), 'the Spitter shot from past its authored range').toBe(false);
    expect(probe(-0.1), 'the Spitter did not shoot from inside its authored range').toBe(true);
  });

  it('the boss slam draws the radius its row publishes, not the code constant', () => {
    // Without this, reverting `boss.ts`'s `slamRadius()` back to the literal
    // would leave the whole suite green: the fallback equals the authored value
    // (code review). Author a different one and the geometry must follow.
    const doc = JSON.parse(JSON.stringify(content.raw.enemies)) as { enemies: Record<string, unknown>[] };
    const eater = doc.enemies.find((e) => e.key === 'warden_eater')!;
    eater.specialRange = 3;
    const c = loadContent({ enemies: doc });
    expect(c.enemyByKey.get('warden_eater')!.specialRange).toBe(3);
    const w = new World(cfg(), c);
    w.phase = 'act2';
    const e = spawnEnemy(w, 'warden_eater', w.warden.x + 8, w.warden.y)!;
    slam(w, e);
    const ring = w.areas.find((a) => a.type === 'bossSlam')!;
    expect(ring, 'no slam ring was created').toBeDefined();
    // `remaining` is the ring's own lifetime: radius / expansion rate.
    const shipped = content.enemyByKey.get('warden_eater')!.specialRange!;
    expect(ring.remaining, 'the slam ignored the authored reach').toBeLessThan((shipped / 6) * 0.9);
  });

  it('a row that has no special may not invent one', () => {
    const doc = JSON.parse(JSON.stringify(content.raw.enemies)) as { enemies: Record<string, unknown>[] };
    doc.enemies.find((e) => e.key === 'husk')!.specialRange = 9;
    expect(() => loadContent({ enemies: doc })).toThrow(/has no special attack/);
  });

  it('a melee row whose sum is not exactly representable still connects where it says', () => {
    // Shellback and Charger author 0.85 while `0.4 + 0.45` is
    // 0.8500000000000001 — the two rows the 1e-6 tolerance actually covers, and
    // so the ones worth measuring against the world (code review).
    const probe = (key: string, offset: number): boolean => {
      const w = new World(cfg());
      w.phase = 'act2';
      const def = w.content.enemyByKey.get(key)!;
      const e = spawnEnemy(w, key, w.warden.x + def.attackRange + offset, w.warden.y)!;
      e.speed = 0;
      w.rebuildBuckets();
      const before = w.warden.hp;
      updateEnemies(w, 1 / 60);
      return before - w.warden.hp > 0;
    };
    for (const key of ['shellback', 'charger']) {
      expect(probe(key, 0.05), `${key} connected from outside its published reach`).toBe(false);
      expect(probe(key, -0.05), `${key} did not connect from inside its published reach`).toBe(true);
    }
  });

  it('a scripted boss really does hurt the Warden at its published reach', () => {
    // The Warden-Eater has `coreDamage: 0` and never uses the contact loop —
    // its close-range damage is the charge, `CHARGE_WIDTH + radius`
    // (qa-playtester measured 2.517 and the row published 1.65). Measured here
    // so the published number stays the scripted one.
    const def = content.enemyByKey.get('warden_eater')!;
    const probe = (offset: number): boolean => {
      const w = new World(cfg());
      w.phase = 'act2';
      const e = spawnEnemy(w, 'warden_eater', w.warden.x + def.attackRange + offset, w.warden.y)!;
      e.speed = 0;
      e.bossAction = 2; // CHARGING
      e.chargeVx = 0;
      e.chargeVy = 0;
      e.bossTimer = 1e9;
      w.rebuildBuckets();
      const before = w.warden.hp;
      bossUpdate(w, e, 1 / 60);
      return before - w.warden.hp > 0;
    };
    expect(probe(-0.2), 'the boss did not hurt the Warden inside its published reach').toBe(true);
    expect(probe(0.5), 'the boss hurt the Warden well outside its published reach').toBe(false);
  });

  it('a melee row that deals no contact damage is refused', () => {
    const doc = JSON.parse(JSON.stringify(content.raw.enemies)) as { enemies: Record<string, unknown>[] };
    doc.enemies.find((e) => e.key === 'husk')!.coreDamage = 0;
    expect(() => loadContent({ enemies: doc })).toThrow(/deals no contact damage/);
  });

  it('a non-final boss may not invent a special either', () => {
    const doc = JSON.parse(JSON.stringify(content.raw.enemies)) as { enemies: Record<string, unknown>[] };
    doc.enemies.find((e) => e.key === 'gatebreaker')!.specialRange = 42;
    expect(() => loadContent({ enemies: doc })).toThrow(/has no special attack/);
  });

  it('dropping the radius a kind is measured against does not switch the rule off', () => {
    // qa-playtester: the healer branch used to skip its own check when
    // `healRadius` was absent, so a Mender could publish 99 while healing at
    // the code's `?? 3`. The rule now falls back to the same default the sim
    // does, so the hole is closed for every kind that has one.
    const doc = JSON.parse(JSON.stringify(content.raw.enemies)) as { enemies: Record<string, unknown>[] };
    const mender = doc.enemies.find((e) => e.key === 'mender')!;
    delete mender.healRadius;
    mender.attackRange = 99;
    expect(() => loadContent({ enemies: doc })).toThrow(/reaches 3 in the sim but authors attackRange 99/);
  });
});
