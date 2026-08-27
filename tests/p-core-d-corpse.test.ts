/**
 * p-core-d — SPEC-FINAL §5.5's Corpse, in full (gate G21). `p-core-b` gave
 * Stone Heart, Vampire Heart and Time's steps 1-2 real numbers; `p-core-c`
 * gave Carnivorous Plant real numbers. This is the first item to give Corpse
 * real gameplay: a TD-only damage store credited by 1% (2% at step 1) of
 * *all* damage dealt to any enemy on the map — not just this Core's own
 * attacks, unlike every other Core effect in this file — spent every 1 s on
 * an instant-kill "execution" of the highest-HP enemy the store can afford.
 * The designer note ("that damage is also stored... the execution counts as
 * map damage, so 1% of it flows back into the store") holds for free because
 * the execution's own kill is dealt through the same `damageEnemy` hook that
 * credits the store in the first place — see the worked example below, which
 * is this item's G21 acceptance case.
 */

import { describe, expect, it } from 'vitest';

import { loadContent } from '../src/sim/content';
import { computeCoreState, updateCorpse, upgradeCore } from '../src/sim/cores';
import { damageEnemy, spawnEnemy } from '../src/sim/enemies';
import { hashWorld } from '../src/sim/run';
import { World } from '../src/sim/world';
import { cfg } from './helpers';

const DT = 1 / 60;
const content = loadContent();

function corpseWorld(): World {
  return new World(cfg({ core: 'corpse' }), content);
}

/** Ticks `updateCorpse` for `seconds` of sim time, `w.rebuildBuckets()` refreshed every tick like `Run.step` does. */
function tickCorpse(w: World, seconds: number): void {
  const ticks = Math.round(seconds / DT);
  for (let i = 0; i < ticks; i++) {
    w.rebuildBuckets();
    updateCorpse(w, DT);
  }
}

describe('p-core-d — Corpse base effects and upgrade steps', () => {
  it('base effects load exactly as authored', () => {
    const w = corpseWorld();
    expect(w.core.corpseStoreRatio).toBeCloseTo(0.01, 9);
    expect(w.core.corpseExecuteInterval).toBe(1);
    expect(w.core.corpseExecuteExplode).toBe(false);
    expect(w.core.corpseAutoFireInterval).toBe(0);
    // §5.5's "AoE r2" is data-authored (`data/cores.json`'s `corpseExplodeRadius`),
    // not a code literal — code-reviewer/QA precedent from p-core-a onward is
    // that every Core radius lives in `/data`, matching Plant's `devourRadius`
    // and Time's `tdSlowRadius` in the same file.
    expect(w.core.corpseExplodeRadius).toBe(2);
  });

  it('steps fold fresh each time (no double-counting): ratio overrides, explode/autofire are one-shot flips', () => {
    expect(computeCoreState(content, 'corpse', 0).corpseStoreRatio).toBeCloseTo(0.01, 9);
    expect(computeCoreState(content, 'corpse', 1).corpseStoreRatio).toBeCloseTo(0.02, 9);
    expect(computeCoreState(content, 'corpse', 1).corpseExecuteExplode).toBe(false);
    expect(computeCoreState(content, 'corpse', 2).corpseExecuteExplode).toBe(true);
    expect(computeCoreState(content, 'corpse', 2).corpseAutoFireInterval).toBe(0);
    expect(computeCoreState(content, 'corpse', 3).corpseAutoFireInterval).toBe(5);
    // Re-querying step 1 after having computed step 3 above must not leak state.
    expect(computeCoreState(content, 'corpse', 1).corpseAutoFireInterval).toBe(0);
  });

  it('a bought step is live immediately through the shared upgradeCore rule', () => {
    const w = corpseWorld();
    w.gold = 1e6;
    expect(upgradeCore(w)).toBe(true);
    expect(w.core.corpseStoreRatio).toBeCloseTo(0.02, 9);
  });
});

describe('p-core-d — TD store accrual', () => {
  it('stores corpseStoreRatio of any damage dealt to any enemy, not just this Core\'s own attacks', () => {
    const w = corpseWorld();
    const decoy = spawnEnemy(w, 'colossus', 5, 5)!;
    decoy.hp = 2000; // headroom so the hit below does not kill it
    damageEnemy(w, decoy, 1000, 'test_tower');
    expect(w.corpseStore).toBeCloseTo(10, 9); // 1% of 1000
  });

  it('a killing blow still credits the store (the hook fires before the death check)', () => {
    const w = corpseWorld();
    const e = spawnEnemy(w, 'husk', 5, 5)!; // 20 hp
    damageEnemy(w, e, 1000, 'test_tower'); // massive overkill
    expect(e.dead).toBe(true);
    expect(w.corpseStore).toBeCloseTo(10, 9); // 1% of the full 1000 dealt, not the 20 that landed
  });

  it('step 1 raises the ratio to 2%, not an additive +1%', () => {
    const w = corpseWorld();
    w.gold = 1e6;
    upgradeCore(w);
    const decoy = spawnEnemy(w, 'colossus', 5, 5)!;
    decoy.hp = 2000;
    damageEnemy(w, decoy, 1000, 'test_tower');
    expect(w.corpseStore).toBeCloseTo(20, 9);
  });

  it('does not accrue during a VS wave', () => {
    const w = corpseWorld();
    w.phase = 'act2';
    const decoy = spawnEnemy(w, 'colossus', 5, 5)!;
    decoy.hp = 2000;
    damageEnemy(w, decoy, 1000, 'test_tower');
    expect(w.corpseStore).toBe(0);
  });
});

describe('p-core-d — G21 worked example: execute spends the store, the kill restores 1% of itself', () => {
  it('a 1000-damage hit banks 10 store; a 10-hp victim is executed for exactly 10, crediting 0.1 back', () => {
    const w = corpseWorld();
    const decoy = spawnEnemy(w, 'colossus', 5, 5)!;
    decoy.hp = 2000;
    damageEnemy(w, decoy, 1000, 'test_tower'); // banks 10 store
    expect(w.corpseStore).toBeCloseTo(10, 9);

    const victim = spawnEnemy(w, 'husk', 10, 10)!;
    victim.hp = 10; // exactly what the store affords
    tickCorpse(w, 1); // one execute check

    expect(victim.dead).toBe(true);
    // Spent 10, but the execution itself is real map damage, so
    // corpseStoreRatio (1%) of that 10 flowed straight back in: 10 - 10 + 0.1.
    expect(w.corpseStore).toBeCloseTo(0.1, 9);
    expect(w.damageByWeapon['corpse']).toBeCloseTo(10, 9);
    expect(w.damageByWeapon['test_tower']).toBeCloseTo(1000, 9);
    expect(w.damageTotal).toBeCloseTo(1010, 9);
  });

  it('instant kill ignores armor: a heavily armored affordable victim still dies to the exact one hit', () => {
    const w = corpseWorld();
    w.corpseStore = 10;
    const victim = spawnEnemy(w, 'husk', 10, 10)!;
    victim.hp = 10;
    victim.armor = 90; // would reduce an ordinary hit to a fraction of itself
    tickCorpse(w, 1);
    expect(victim.dead).toBe(true);
    expect(w.damageByWeapon['corpse']).toBeCloseTo(10, 9); // full pre-armor HP, not shredded by mitigation
  });

  it('does not scale with character stats and grants no lifesteal regardless of derived.leech (the noLifesteal flag holds even though Corpse\'s execute, being TD-only, never runs while huntsWarden is actually true)', () => {
    const w = corpseWorld();
    w.corpseStore = 10;
    w.stats.add('test', 'power', 5); // would matter if execution damage scaled
    w.stats.add('test', 'leech', 0.5); // would matter if the hit leeched and huntsWarden were true
    w.recomputeDerived();
    const victim = spawnEnemy(w, 'husk', 10, 10)!;
    victim.hp = 10;
    tickCorpse(w, 1);
    expect(victim.dead).toBe(true);
    expect(w.warden.leechAccumulator).toBe(0);
  });
});

describe('p-core-d — highest-affordable targeting and no-target behavior', () => {
  it('executes the highest-HP enemy the store can afford, not merely the first one found', () => {
    const w = corpseWorld();
    w.corpseStore = 30;
    const cheap = spawnEnemy(w, 'husk', 5, 5)!;
    cheap.hp = 10;
    const pricier = spawnEnemy(w, 'husk', 6, 6)!;
    pricier.hp = 25; // still affordable, and more expensive than `cheap`
    const unaffordable = spawnEnemy(w, 'husk', 7, 7)!;
    unaffordable.hp = 40;
    tickCorpse(w, 1);
    expect(pricier.dead).toBe(true);
    expect(cheap.dead).toBe(false);
    expect(unaffordable.dead).toBe(false);
  });

  it('does nothing when the store cannot afford any live enemy, and re-arms cleanly', () => {
    const w = corpseWorld();
    w.corpseStore = 5;
    const e = spawnEnemy(w, 'husk', 5, 5)!;
    e.hp = 20;
    tickCorpse(w, 3);
    expect(e.dead).toBe(false);
    expect(w.corpseStore).toBe(5); // untouched — nothing was ever affordable
  });

  it('is TD-only: no execution fires once VS begins, even with an affordable target', () => {
    const w = corpseWorld();
    w.phase = 'act2';
    w.corpseStore = 100;
    const e = spawnEnemy(w, 'husk', 5, 5)!;
    e.hp = 10;
    tickCorpse(w, 3);
    expect(e.dead).toBe(false);
    expect(w.corpseStore).toBe(100);
  });
});

describe('p-core-d — step 2: execution explosion', () => {
  it('an execution deals the victim\'s max HP as ordinary AoE r2 splash to nearby enemies, on top of the store spend', () => {
    const w = corpseWorld();
    w.gold = 1e6;
    upgradeCore(w); // step 1: ratio 2%
    upgradeCore(w); // step 2: executions explode
    w.corpseStore = 10;

    const victim = spawnEnemy(w, 'husk', 10, 10)!; // maxHp 20
    victim.hp = 10; // wounded, but maxHp stays 20 — the explosion uses maxHp, not current hp
    const bystander = spawnEnemy(w, 'colossus', 10.5, 10)!; // within r2, 400 hp so it survives to measure
    bystander.hp = 400;

    tickCorpse(w, 1);

    expect(victim.dead).toBe(true);
    expect(bystander.hp).toBeCloseTo(400 - 20, 9); // victim's maxHp (20), not its spent hp (10)
    // Not paid from the store, but it IS damage dealt to an enemy on the map,
    // so it banks its own 2% too: 10 (start) - 10 (execute spend) + 10*0.02
    // (execute's own restore) + 20*0.02 (the explosion's own restore).
    expect(w.corpseStore).toBeCloseTo(10 - 10 + 10 * 0.02 + 20 * 0.02, 9);
  });

  it('does not explode without step 2 bought', () => {
    const w = corpseWorld();
    w.corpseStore = 10;
    const victim = spawnEnemy(w, 'husk', 10, 10)!;
    victim.hp = 10;
    const bystander = spawnEnemy(w, 'colossus', 10.5, 10)!;
    bystander.hp = 400;
    tickCorpse(w, 1);
    expect(victim.dead).toBe(true);
    expect(bystander.hp).toBe(400);
  });

  it('a bystander out past r2 is untouched by the explosion', () => {
    const w = corpseWorld();
    w.gold = 1e6;
    upgradeCore(w);
    upgradeCore(w);
    w.corpseStore = 10;
    const victim = spawnEnemy(w, 'husk', 10, 10)!;
    victim.hp = 10;
    const far = spawnEnemy(w, 'colossus', 15, 10)!;
    far.hp = 400;
    tickCorpse(w, 1);
    expect(victim.dead).toBe(true);
    expect(far.hp).toBe(400);
  });
});

describe('p-core-d — step 3: auto-fire', () => {
  it('every autoFireInterval seconds, dumps the entire store on the highest-HP live enemy regardless of affordability, even when non-lethal', () => {
    const w = corpseWorld();
    w.gold = 1e6;
    upgradeCore(w); // step 1
    upgradeCore(w); // step 2
    upgradeCore(w); // step 3: autoFireInterval 5
    w.corpseStore = 50;
    // Far more HP than the store affords, so the 1s execute check never picks it.
    const e = spawnEnemy(w, 'colossus', 5, 5)!;
    e.hp = 300;
    tickCorpse(w, 1); // one tick: both the 1s execute check and the (also-due) 5s auto-fire check fire
    expect(e.dead).toBe(false);
    expect(e.hp).toBeCloseTo(300 - 50, 9);
    // The dump itself is real map damage, so its own 2% flows straight back —
    // "spending [the store]" empties it synchronously, this is the same
    // restore the execute branch's own worked example above shows.
    expect(w.corpseStore).toBeCloseTo(50 * 0.02, 9);
  });

  it("Q114: a lethal auto-fire hit does not trigger step 2's explosion — only the 1s execute branch can", () => {
    const w = corpseWorld();
    w.gold = 1e6;
    upgradeCore(w); // step 1
    upgradeCore(w); // step 2: explode
    upgradeCore(w); // step 3: autofire
    // Desync the two timers directly so this tick is an auto-fire-only check
    // (the 1s execute path structurally always gets first dibs on a lethal
    // target when both are due the same tick, since autoFireInterval is a
    // multiple of corpseExecuteInterval under the shipped numbers — this
    // reaches the auto-fire-alone branch the way real play never can, to pin
    // the code path itself).
    w.corpseExecuteTimer = 10;
    w.corpseAutoFireTimer = 0;
    w.corpseStore = 20;
    // Auto-fire targets the single highest-HP live enemy with no affordability
    // filter, so `victim` must outrank `bystander` in current HP or auto-fire
    // would hit the bystander instead and this test would prove nothing.
    const victim = spawnEnemy(w, 'husk', 10, 10)!;
    victim.hp = 20; // exactly lethal for the auto-fire dump, and the map's highest HP
    const bystander = spawnEnemy(w, 'colossus', 10.5, 10)!;
    bystander.hp = 19; // within r2 of victim (for explosion detection), below victim's HP (so auto-fire ignores it)

    tickCorpse(w, DT); // exactly one tick

    expect(victim.dead).toBe(true);
    expect(bystander.hp).toBe(19); // no explosion — this kill came from auto-fire, not execute
    expect(w.corpseStore).toBeCloseTo(20 * 0.02, 9); // the dump's own restore, same rule as every other Corpse hit
  });

  it('a same-tick execute-then-auto-fire double kill, reachable under real play with no timer desync, still never explodes the auto-fire victim', () => {
    // Corrects Q114's first draft, which claimed the auto-fire-lethal case was
    // unreachable under shipped numbers because the 1s execute check always
    // claims the tick's kill first. That is only true when there is a single
    // enemy in play: with two, execute claims the priciest *affordable* one
    // (crediting store back) and the same-tick auto-fire check can then land
    // a genuinely lethal hit on a second, cheaper enemy outside the first
    // kill's r2 splash — no artificial timer desync required.
    const w = corpseWorld();
    w.gold = 1e6;
    upgradeCore(w); // step 1: ratio 2%
    upgradeCore(w); // step 2: explode
    upgradeCore(w); // step 3: autofire 5s
    // Both timers are 0 (fresh Core), so this first tick is simultaneously
    // the 1s execute check and the 5s auto-fire check firing together.
    w.corpseStore = 100;

    const expensive = spawnEnemy(w, 'husk', 10, 10)!;
    expensive.hp = 90; // affordable, and the priciest live target, so execute claims it first
    const cheap = spawnEnemy(w, 'husk', 30, 30)!; // far outside expensive's r2 splash
    cheap.hp = 5; // below expensive.hp so execute would not have picked it, but auto-fire has no affordability filter

    tickCorpse(w, DT); // exactly one tick

    expect(expensive.dead).toBe(true); // killed by execute (spent 90 of the store)
    expect(cheap.dead).toBe(true); // killed by the same-tick auto-fire dump of the remaining store
    // Execute leaves 100 - 90 + 90*0.02 = 11.8 in the store; auto-fire then
    // dumps that whole remainder on `cheap` (well above its 5 hp), crediting
    // back its own 2% of the dump.
    const afterExecute = 100 - 90 + 90 * 0.02;
    expect(w.corpseStore).toBeCloseTo(afterExecute * 0.02, 9);
  });
});

describe('p-core-d — VS: +10% EXP', () => {
  it('raises xpGain by exactly 10% the instant the Core is chosen, no step required', () => {
    const withCorpse = corpseWorld();
    const withoutCorpse = new World(cfg({}), content);
    expect(withCorpse.derived.xpMul).toBeCloseTo(withoutCorpse.derived.xpMul * 1.1, 9);
  });
});

describe('p-core-d — replay-hash determinism', () => {
  it('two identical scripted runs (store accrual + execution) hash identically', () => {
    function run(): World {
      const w = corpseWorld();
      const decoy = spawnEnemy(w, 'colossus', 5, 5)!;
      decoy.hp = 2000;
      damageEnemy(w, decoy, 1000, 'test_tower');
      const victim = spawnEnemy(w, 'husk', 10, 10)!;
      victim.hp = 10;
      tickCorpse(w, 1);
      return w;
    }
    expect(hashWorld(run())).toBe(hashWorld(run()));
  });

  it('a run differing only in corpseStore hashes differently', () => {
    const a = corpseWorld();
    const b = corpseWorld();
    b.corpseStore = 10;
    expect(hashWorld(a)).not.toBe(hashWorld(b));
  });
});
