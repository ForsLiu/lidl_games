/**
 * fb108 (extends fb063): every Active `kind` across all 12 classes'
 * active1/active2 — not just the 3 normal-profile classes' 6 — now has a
 * hand-authored `ACTIVE_SENTENCES` entry in `class-info.ts`, so none of them
 * fall through to `effectBlock`'s bare numeric-field fallback.
 */
import { describe, expect, it } from 'vitest';

import { applyCommand } from '../src/sim/run';
import { spawnEnemy } from '../src/sim/enemies';
import { World } from '../src/sim/world';
import { activeSkillMarkup } from '../src/ui/class-info';
import { cfg } from './helpers';

describe('fb108: every class Active resolves to a sentence, not the bare fallback', () => {
  const w = new World(cfg());
  const classes = [...w.content.classByKey.values()];

  it('data/classes.json actually has all 12 classes loaded (sanity, not vacuous)', () => {
    expect(classes.length).toBe(12);
  });

  const seenKinds = new Set<string>();
  for (const cls of classes) {
    for (const which of ['active1', 'active2'] as const) {
      const eff = which === 'active1' ? cls.active1 : cls.active2;
      seenKinds.add(eff.kind);
      it(`${cls.key}.${which} (${eff.kind}): sentence-form, not the bare field-list fallback`, () => {
        const markup = activeSkillMarkup(cls, which);
        // The sentence branch wraps its text in `<p class="sw-note">`; the
        // bare-fallback branch (`effectBlock`) never emits that class.
        expect(markup).toContain('<p class="sw-note">');
        expect(markup).toContain(eff.name);
      });
    }
  }

  it('covered every kind actually authored in data/classes.json (24 total, per fb108\'s own scan)', () => {
    expect(seenKinds.size).toBe(24);
  });

  it("engineer active2 (summon_turret): embeds a live-resolved cooldown, not the raw /data one", () => {
    const world = new World(cfg({ classKey: 'engineer' }));
    world.derived.cdr = 0.5;
    const cls = world.content.classByKey.get('engineer')!;
    const markup = activeSkillMarkup(cls, 'active2', {
      cdr: world.derived.cdr,
      atkFlat: 0,
      damageMul: 1,
    });
    const liveCd = cls.active2.cooldownSeconds * (1 - world.derived.cdr);
    expect(markup).toContain(`Cooldown ${String(liveCd)}s`);
    expect(markup).not.toContain(`Cooldown ${String(cls.active2.cooldownSeconds)}s`);
  });

  it('stormcaller active1 (chain_lightning): embeds a live-resolved (atkFlat/damageMul-scaled) base damage', () => {
    const world = new World(cfg({ classKey: 'stormcaller' }));
    world.derived.atkFlat = 8;
    world.derived.powerMul = 1.5;
    const cls = world.content.classByKey.get('stormcaller')!;
    const markup = activeSkillMarkup(cls, 'active1', {
      cdr: 0,
      atkFlat: world.derived.atkFlat,
      damageMul: 1.5,
    });
    const liveDamage = (cls.active1.damage + world.derived.atkFlat) * 1.5;
    expect(markup).toContain(`${String(liveDamage)} damage`);
    expect(markup).not.toContain(`${String(cls.active1.damage)} damage,`);
  });

  it("archer active1 (charge_pierce): the release-now damage is live-resolved, and the sentence never implies atkFlat compounds with held time (qa-playtester finding, fb108)", () => {
    const world = new World(cfg({ classKey: 'archer' }));
    world.derived.atkFlat = 20;
    const cls = world.content.classByKey.get('archer')!;
    const live = { cdr: 0, atkFlat: world.derived.atkFlat, damageMul: 1 };
    const markup = activeSkillMarkup(cls, 'active1', live);

    // At 0s held, `characterDamage`'s formula and `liveDamageValue`'s
    // coincide exactly — this is the one number the sentence displays.
    const releaseNowDamage = (cls.active1.damage + world.derived.atkFlat) * 1;
    expect(markup).toContain(`dealing ${String(releaseNowDamage)} damage if released immediately`);
    // The compounding rate must not sit directly beside a live (atkFlat-
    // inclusive) number in a way that reads as "this number grows by that
    // rate" — the real engine (`fireDeadeyeDraw`) compounds the raw /data
    // base before atkFlat is added, so that reading overstates the total.
    expect(markup).toContain('before your own bonuses are added');
  });

  it("stormcaller active1 (chain_lightning): 'chaining to up to N enemies total' matches fireChainSurge's actual struck count, not N+1 (code-reviewer finding, fb108)", () => {
    const w = new World(cfg({ classKey: 'stormcaller' }));
    w.gold = 1e6;
    w.warden.x = 4;
    w.warden.y = 10;
    w.warden.attackCooldown = 1e9;
    const cls = w.content.classByKey.get('stormcaller')!;
    const chainCount = cls.active1.chainCount!;
    // More candidates than chainCount so the loop is limited by chainCount, not by enemy supply.
    const enemies = [];
    for (let i = 0; i < chainCount + 4; i++) {
      const e = spawnEnemy(w, w.content.enemies.enemies[0].key, 5 + i * 2, 10)!;
      e.hp = 1e6;
      e.maxHp = 1e6;
      e.speed = 0;
      e.armor = 0;
      enemies.push(e);
    }
    w.rebuildBuckets();
    applyCommand(w, { k: 'class_active' });
    const struck = enemies.filter((e) => e.hp < 1e6).length;
    expect(struck).toBe(chainCount);

    const markup = activeSkillMarkup(cls, 'active1');
    expect(markup).toContain(`chaining to up to ${String(chainCount)} enemies total`);
    expect(markup).not.toContain(`chaining up to ${String(chainCount)} more times`);
  });

  it("engineer active2 (summon_turret) and animist active1 (manifest_spirit): describe the stat-mul as scoped to damage, not a blanket 'stats' clone (qa-playtester finding, fb108) — fireSummonTurret/fireManifestSpirit only scale the summon's dps, never range/interval/aoe", () => {
    const engineer = w.content.classByKey.get('engineer')!;
    const engineerMarkup = activeSkillMarkup(engineer, 'active2');
    expect(engineerMarkup).toContain('of its damage');
    expect(engineerMarkup).not.toContain('of its stats');
    expect(engineerMarkup).toContain('full range and attack speed');

    const animist = w.content.classByKey.get('animist')!;
    const animistMarkup = activeSkillMarkup(animist, 'active1');
    expect(animistMarkup).toContain('of its damage');
    expect(animistMarkup).not.toContain('of its stats');
    expect(animistMarkup).toContain('full range and attack speed');
  });
});
