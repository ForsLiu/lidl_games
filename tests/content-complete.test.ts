/** M4 content pass: every piece of authored content is reachable and behaves. */

import { describe, expect, it } from 'vitest';

import { World } from '../src/sim/world';
import { loadContent } from '../src/sim/content';
import { applyBurn, applySlow, damageEnemy, dotRemaining, spawnEnemy, updateEnemies } from '../src/sim/enemies';
import { buildTower } from '../src/sim/towers';
import type { StatKey } from '../src/sim/stats';
import { handleKillDrops, rollRelic } from '../src/sim/loot';
import { Rng } from '../src/sim/rng';
import { autoDraft, hardestDraft, modifierDraft, rewardMultiplier } from '../src/sim/tiers';
import { cfg } from './helpers';

const content = loadContent();

describe('content completeness', () => {
  it('has all 10 towers with an upgrade track and a terrain form', () => {
    expect(content.towers.towers).toHaveLength(10);
    for (const t of content.towers.towers) {
      expect(t.terrain.kind, t.key).toBeTruthy();
      // SPEC-V3 §4 replaced the shared three-tier ladder with a per-tower
      // track; m20a-upgrade-tracks.test.ts is where its shape is pinned.
      expect(t.upgrades.count, t.key).toBeGreaterThanOrEqual(t.key === 'palisade' ? 0 : 1);
    }
  });

  it('has 20 enemies and every wave references real ones', () => {
    expect(content.enemies.enemies).toHaveLength(20);
    expect(content.waves.waves).toHaveLength(18);
    for (const wave of content.waves.waves) {
      for (const g of wave.groups) expect(content.enemyByKey.has(g.enemy), g.enemy).toBe(true);
    }
  });

  // SPEC-FINAL §1.1: a run is 18 TD + 6 VS waves and the Gatebreaker ends
  // **TD wave 18**. Re-asserted by p8a (previously wave 10 under the old
  // 10-wave table); also checks no earlier wave carries one, since
  // `buildSpawnQueue` repeating the last authored row was exactly what put a
  // Gatebreaker on every wave 10-18 before p8a authored real 11-18 content.
  it('introduces the Gatebreaker on wave 18, and only wave 18', () => {
    const last = content.waves.waves[17];
    expect(last.wave).toBe(18);
    expect(last.groups.some((g) => g.enemy === 'gatebreaker')).toBe(true);
    for (const wave of content.waves.waves.slice(0, 17)) {
      expect(wave.groups.some((g) => g.enemy === 'gatebreaker'), `wave ${wave.wave}`).toBe(false);
    }
  });

  // p7a (SPEC-FINAL §6.3): the level-up pool's 3 card families — stat boons
  // at rank x5, Type Mastery at rank x3, and 3 skill cards per class at
  // rank x2 (active1_potency, active2_cdr, class_line, exactly one each).
  it('has 7 stat boons, each mapping to a real stat, rank x5', () => {
    expect(content.boons.statBoons).toHaveLength(7);
    const w = new World(cfg());
    for (const b of content.boons.statBoons) {
      expect(b.maxRank, b.key).toBe(5);
      const stat = b.stat as StatKey;
      const before = w.stats.total(stat);
      w.stats.addAll(`boon:${b.key}`, { [b.stat]: b.perRank });
      expect(w.stats.total(stat), b.key).not.toBe(before);
    }
  });

  it('Type Mastery is rank x3', () => {
    expect(content.boons.typeMastery.maxRank).toBe(3);
    expect(content.boons.typeMastery.perRank).toBeGreaterThan(0);
  });

  it('every class has exactly 3 skill cards, rank x2, one of each effect', () => {
    for (const c of content.classes.classes) {
      const cards = content.boons.skillCards[c.key];
      expect(cards, c.key).toBeDefined();
      expect(cards, c.key).toHaveLength(3);
      for (const card of cards) expect(card.maxRank, card.key).toBe(2);
      const effects = cards.map((card) => card.effect).sort();
      expect(effects, c.key).toEqual(['active1_potency', 'active2_cdr', 'class_line']);
      // Every skill card key is globally unique (content.ts's loader rule).
      for (const card of cards) expect(content.skillCardByKey.get(card.key)?.key, card.key).toBe(card.key);
    }
  });

  it('has 12 map modifiers, each with a real effect', () => {
    expect(content.modifiers.modifiers).toHaveLength(12);
    for (const m of content.modifiers.modifiers) {
      expect(Object.keys(m.effect).length, m.key).toBeGreaterThan(0);
      expect(m.rewardBonus, m.key).toBeGreaterThan(0);
    }
  });
});

describe('enemy behaviours', () => {
  it('the Gatebreaker chews structures twice as fast as a Husk', () => {
    const damageTo = (key: string): number => {
      const w = new World(cfg());
      w.gold = 10000;
      w.warden.x = 10.5;
      w.warden.y = 10.5;
      expect(buildTower(w, 1, 10, 10).ok).toBe(true);
      const s = w.structureAt(10, 10)!;
      s.hp = 1e9;
      s.maxHp = 1e9;
      // Park the enemy so its next step walks into the wall.
      const e = spawnEnemy(w, key, 8.5, 10.5, { overlay: false })!;
      e.speed = 6;
      const before = s.hp;
      for (let i = 0; i < 120; i++) {
        w.rebuildBuckets();
        updateEnemies(w, 1 / 60);
      }
      return before - s.hp;
    };
    const husk = damageTo('husk');
    const boss = damageTo('gatebreaker');
    expect(husk).toBeGreaterThan(0);
    // 100 core damage x 2 structure multiplier vs 5 core damage.
    expect(boss / husk).toBeGreaterThan(10);
  });

  it('a Splitling leaves two Husks behind', () => {
    const w = new World(cfg());
    const e = spawnEnemy(w, 'splitling', 10, 10, { overlay: false })!;
    const before = w.enemies.length;
    damageEnemy(w, e, 1e6, 'test');
    expect(w.enemies.filter((x) => !x.dead).length).toBe(before - 1 + 2);
  });

  it('a Shellback takes far less damage from the front', () => {
    const w = new World(cfg());
    const front = spawnEnemy(w, 'shellback', 10, 10, { overlay: false })!;
    front.fx = 1;
    front.fy = 0;
    const back = spawnEnemy(w, 'shellback', 14, 10, { overlay: false })!;
    back.fx = 1;
    back.fy = 0;
    const a = damageEnemy(w, front, 100, 'test', { fromX: 12, fromY: 10 });
    const b = damageEnemy(w, back, 100, 'test', { fromX: 12, fromY: 10 });
    expect(a).toBeCloseTo(30, 5);
    expect(b).toBeCloseTo(100, 5);
  });

  it('a Cinderling ignores burn, a Frostkin ignores slow', () => {
    const w = new World(cfg());
    w.phase = 'act2';
    const cinder = spawnEnemy(w, 'cinderling', 10, 10, { overlay: true })!;
    const frost = spawnEnemy(w, 'frostkin', 11, 10, { overlay: true })!;
    applyBurn(w, cinder, 10, 3, 'test');
    applySlow(w, frost, 0.5, 3);
    expect(dotRemaining(cinder, 'burning')).toBe(0);
    expect(frost.slowAmount).toBe(0);
  });

  it('a Mender heals its neighbours', () => {
    const w = new World(cfg());
    spawnEnemy(w, 'mender', 10, 10, { overlay: false });
    const hurt = spawnEnemy(w, 'bulwark', 10.5, 10.5, { overlay: false })!;
    hurt.hp = 10;
    for (let i = 0; i < 120; i++) {
      w.rebuildBuckets();
      updateEnemies(w, 1 / 60);
    }
    expect(hurt.hp).toBeGreaterThan(10);
  });
});

describe('loot (SPEC 7)', () => {
  // RETIRED (SPEC-FINAL §7, §8) — relic rarities and affix rolls are replaced
  // by §7's fixed 12-item equipment table across 6 slots, granted 1 per TD wave
  // cleared. Nothing rolls. Re-asserted by fb015/**p7b** (tests/fb015-equipment.test.ts)
  // and **p7c** (the rewards pipeline); deleted at **p7d**.
  it.skip('rolls relics with the right affix counts per rarity', () => {
    const rng = new Rng(7);
    for (let i = 0; i < 300; i++) {
      const r = rollRelic(content, rng, 0, i);
      const rarity = content.relics.rarities.find((x) => x.key === r.rarity)!;
      expect(r.affixes.length).toBeGreaterThanOrEqual(rarity.minAffixes);
      expect(r.affixes.length).toBeLessThanOrEqual(rarity.maxAffixes);
      expect(new Set(r.affixes.map((a) => a.key)).size).toBe(r.affixes.length);
      expect(content.relics.slots).toContain(r.slot);
    }
  });

  it('keeps affix values inside their authored ranges', () => {
    const rng = new Rng(11);
    for (let i = 0; i < 300; i++) {
      for (const a of rollRelic(content, rng, 0, i).affixes) {
        const def = content.relics.affixes.find((d) => d.key === a.key)!;
        expect(a.value).toBeGreaterThanOrEqual(def.pct ? def.min - 0.001 : Math.floor(def.min));
        expect(a.value).toBeLessThanOrEqual(def.pct ? def.max + 0.001 : Math.ceil(def.max));
      }
    }
  });

  it('shifts rarity upward with Luck', () => {
    const rare = (luck: number): number => {
      const rng = new Rng(3);
      let n = 0;
      for (let i = 0; i < 2000; i++) if (rollRelic(content, rng, luck, i).rarity === 'rare') n++;
      return n;
    };
    expect(rare(100)).toBeGreaterThan(rare(0));
  });

  it('always drops a relic from an elite and from the final boss', () => {
    const w = new World(cfg());
    w.phase = 'act2';
    const elite = spawnEnemy(w, 'colossus', 10, 10, { overlay: true })!;
    handleKillDrops(w, elite, content.enemyByKey.get('colossus')!);
    expect(w.relicsFound.length).toBe(1);
    const boss = spawnEnemy(w, 'warden_eater', 12, 10, { overlay: false })!;
    handleKillDrops(w, boss, content.enemyByKey.get('warden_eater')!);
    expect(w.relicsFound.length).toBe(2);
    expect(w.relicsFound[1].rarity).toBe('rare');
  });
});

describe('map tiers (SPEC 8.3)', () => {
  it('offers tier-1 modifiers as N-1 slots of 1-of-2', () => {
    for (let tier = 1; tier <= 5; tier++) {
      const draft = modifierDraft(content, 42, tier);
      expect(draft.length).toBe(tier - 1);
      for (const slot of draft) {
        expect(slot.options.length).toBe(2);
        expect(slot.options[0].key).not.toBe(slot.options[1].key);
      }
    }
  });

  it('never offers the same modifier twice in one draft', () => {
    const picked = modifierDraft(content, 5, 5).flatMap((o) => o.options.map((m) => m.key));
    expect(new Set(picked).size).toBe(picked.length);
  });

  it('auto-drafts and hard-drafts one modifier per slot', () => {
    expect(autoDraft(content, 9, 4)).toHaveLength(3);
    expect(hardestDraft(content, 9, 4)).toHaveLength(3);
  });

  it('scales rewards with tier and with modifier count', () => {
    const t1 = rewardMultiplier(content, 1, []);
    const t3 = rewardMultiplier(content, 3, ['tough', 'fleet']);
    expect(t1).toBeCloseTo(1, 6);
    expect(t3).toBeGreaterThan(1 + 0.35 * 2);
  });
});
