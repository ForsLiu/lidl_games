/**
 * fb084 — unblock BACKLOG-CONTENT c004 (Animist's §4.2 "aura effects also
 * affect summons; summon cap +1"). Before this item, no `StatKey` existed
 * for a generic summon-cap bonus, so a passive could only widen a class's
 * summon cap via a class-key check in code. This item adds `summonCap` to
 * `STAT_KEYS`/`STAT_KIND`/`STAT_DISPLAY`/`STAT_SCALED` (statkeys.ts),
 * `Derived.summonCapBonus` (stats.ts), and reads it at the three
 * `classes.ts` summon sites alongside the pre-existing `classLineBonus(w)`
 * skill-card bonus. c004 itself — authoring `summonCap: 1` on the Animist's
 * Kinship passive in `data/classes.json` — is left to the content lane, per
 * this item's own acceptance text.
 */
import { describe, expect, it } from 'vitest';

import { applyCommand } from '../src/sim/run';
import { buildTower } from '../src/sim/towers';
import { killEnemy, spawnEnemy } from '../src/sim/enemies';
import { STAT_DISPLAY, STAT_KIND, STAT_SCALED } from '../src/sim/statkeys';
import { derive, emptyStats } from '../src/sim/stats';
import { loadContent } from '../src/sim/content';
import { World } from '../src/sim/world';
import { cfg } from './helpers';

const content = loadContent();

describe('fb084: summonCap stat key', () => {
  it('is classified in STAT_KIND/STAT_DISPLAY/STAT_SCALED as a flat point total, not scaled by fb153a', () => {
    expect(STAT_KIND.summonCap).toBe('flat');
    expect(STAT_DISPLAY.summonCap).toBe('point');
    expect(STAT_SCALED.summonCap).toBe(false);
  });

  it('derive() folds a summonCap source into Derived.summonCapBonus', () => {
    const s = emptyStats();
    expect(derive(content, s).summonCapBonus).toBe(0);
    s.add('test', 'summonCap', 1);
    expect(derive(content, s).summonCapBonus).toBe(1);
  });

  it('a synthetic passive-shaped summonCap bonus raises the live cap at all three summon sites', () => {
    // Engineer: Pop Turret (active2).
    const eng = new World(cfg({ classKey: 'engineer' }));
    eng.gold = 1e6;
    const engBaseCap = content.classByKey.get('engineer')!.active2.summonCap!;
    for (let i = 0; i < engBaseCap + 2; i++) {
      eng.warden.active2Cooldown = 0;
      applyCommand(eng, { k: 'class_active2' });
    }
    expect(eng.classSummons.filter((s) => s.kind === 'engineer_turret')).toHaveLength(engBaseCap);
    eng.stats.add('test:fb084', 'summonCap', 1);
    eng.recomputeDerived();
    for (let i = 0; i < engBaseCap + 3; i++) {
      eng.warden.active2Cooldown = 0;
      applyCommand(eng, { k: 'class_active2' });
    }
    expect(eng.classSummons.filter((s) => s.kind === 'engineer_turret')).toHaveLength(engBaseCap + 1);

    // Necromancer: Raise (active1), capped by corpses on hand rather than
    // cooldown — spawn plenty of corpses so the cap itself is the binding
    // constraint, same setup as `tests/p6d-nine-classes.test.ts`'s own case.
    const necro = new World(cfg({ classKey: 'necromancer' }));
    necro.gold = 1e6;
    necro.warden.x = 10;
    necro.warden.y = 10;
    const necroBaseCap = content.classByKey.get('necromancer')!.active1.summonCap!;
    for (let i = 0; i < necroBaseCap + 6; i++) {
      const e = spawnEnemy(necro, necro.content.enemies.enemies[0].key, 9 + (i % 4) * 0.4, 9 + Math.floor(i / 4) * 0.4)!;
      necro.rebuildBuckets();
      killEnemy(necro, e, 'test');
    }
    necro.stats.add('test:fb084', 'summonCap', 1);
    necro.recomputeDerived();
    applyCommand(necro, { k: 'class_active' });
    expect(necro.classSummons.filter((s) => s.kind === 'necro_skeleton')).toHaveLength(necroBaseCap + 1);
  });

  /**
   * qa-playtester found this via hostile testing (not a shipped-content
   * bug — Kinship's own `mods` are still `{}`, so no `/data` row reaches
   * it today): `spawnClassSummon` (classes.ts) reads a `cap <= 0` argument
   * as its own "uncapped" sentinel (Bone Pylons' deliberate literal `0`
   * call, `updatePactedTowers`), not "no room." Before fb084 the two
   * player-cast sites below could never pass a non-positive total (their
   * only inputs were a positive `/data` constant and a non-negative
   * skill-card bonus); fb084's new `summonCapBonus` is the first
   * arbitrarily-signed lever into that total, so a large-enough negative
   * source could have driven Pop Turret/Manifest to spawn *unboundedly*,
   * never evicting, instead of "cannot summon." Both sites now guard
   * `cap <= 0` and return before spawning (the same shape
   * `fireRaiseSkeletons`' pre-existing `room <= 0` guard already has).
   */
  it('a summonCap bonus that drives the total to zero or negative spawns nothing, rather than uncapping the ability', () => {
    // Engineer: Pop Turret (active2, cooldown-gated).
    const eng = new World(cfg({ classKey: 'engineer' }));
    eng.gold = 1e6;
    const engBaseCap = content.classByKey.get('engineer')!.active2.summonCap!;
    eng.stats.add('test:fb084-negative', 'summonCap', -engBaseCap);
    eng.recomputeDerived();
    for (let i = 0; i < 20; i++) {
      eng.warden.active2Cooldown = 0;
      applyCommand(eng, { k: 'class_active2' });
    }
    expect(eng.classSummons.filter((s) => s.kind === 'engineer_turret')).toHaveLength(0);

    // Animist: Manifest Spirit (active1, gated on a nearby attacking tower).
    const ani = new World(cfg({ classKey: 'animist' }));
    ani.gold = 1e6;
    ani.warden.x = 10;
    ani.warden.y = 10;
    buildTower(ani, ani.content.towerByKey.get('arrow_spire')!.id, 11, 10);
    const aniBaseCap = content.classByKey.get('animist')!.active1.summonCap!;
    ani.stats.add('test:fb084-negative', 'summonCap', -aniBaseCap * 100);
    ani.recomputeDerived();
    for (let i = 0; i < 15; i++) {
      ani.warden.active1Cooldown = 0;
      applyCommand(ani, { k: 'class_active' });
    }
    expect(ani.classSummons.filter((s) => s.kind === 'animist_spirit')).toHaveLength(0);
  });
});
