/**
 * c009 (BACKLOG-CONTENT, lane `content`) — **no class *tower passive* is a
 * silent no-op.** The last of §4's slots to get a liveness file: c005 put the
 * 24 Actives on trial, c006 the 12 character Passives, and the 12
 * `towerPassive` rows had nothing at all.
 *
 * The slot is worth its own file because it reaches the sim through *five*
 * unrelated routes, only one of which any other test watches:
 *
 *   1. `towerPassive.mods` folded into `Stats` (`stats.ts:194`) and read as a
 *      `derived` multiplier — seven of the twelve rows
 *      (`towerAttackSpeed`, `towerPoisonDamage`, `towerHp`, `towerRange`,
 *      `towerDamage`, `towerDefenseBonus`, and Animist's `area`),
 *   2. the **target-conditional** trio resolved once per volley into a
 *      `TowerClassBonus` and carried on the hit (`classTowerBonus`,
 *      `towers.ts:278` -> `dealHit`, `combat.ts:72`) — Pyro's
 *      `towerDamageVsBurning`, Cryomancer's `towerDamageVsChilled` and
 *      Stormcaller's `towerExtraElectricPct`,
 *   3. a **structure-conditional** read off the class row directly, never
 *      through `Stats` (`classTowerDamageMul`, `towers.ts:254`, whose
 *      `towerLowHpDamageBonus` read is `:267`) —
 *      Necromancer's `towerLowHpDamageBonus`,
 *   4. `towerPassive.kind` dispatched from a wave clear (`applyChronalSurge`,
 *      `run.ts:810`) — Time Lord, the only `kind`-driven row,
 *   5. **the wrong key entirely** — Animist's *Wide Grove* is "all towers
 *      +10% area" authored on the *global* `area` stat for want of a
 *      `towerArea`, so it also widens every class Active and every enemy
 *      effect that reads `areaMul`.
 *
 * Route 1 is stat plumbing that would fail loudly; routes 2-4 are bespoke code
 * paths that would not. Route 5 is not a defect this file may fix
 * (`statkeys.ts` is out of the lane's Scope) but it is a fact this file
 * refuses to leave unwritten.
 *
 * **What "live" means here, per c009's acceptance.** Every row builds a real
 * tower in a real `World` and measures that tower's *behaviour* — damage,
 * range, attack speed, max HP or armour — against **the same tower under a
 * class that authors none of the key under test**. The control is the whole
 * assertion: "the spire reaches 5.5 tiles" proves nothing on its own, since
 * the Constellation and half a dozen items also move `towerRangeMul`; "it
 * reaches further under the Archer than under the Swordsman, same tower, same
 * tile, same world" is what pins the tower passive as the cause.
 *
 * `swordsman` is the default control: its own tower passive authors
 * `towerAttackSpeed` and nothing else, and its character passive authors
 * `mods: {}` (*Thousand Cuts* rides the character's own attack), so it cannot
 * leak into a damage/HP/range/area/armour row. The one row it cannot control
 * for is *Wind Slash* itself, which uses `engineer` for the same reason in
 * reverse — `towerHp` is read by no cadence.
 *
 * **The conditional rows get their condition tested twice.** c009 asks that
 * "the three conditional rows apply only under their condition", and there are
 * in fact four conditionals, not three — Necromancer's below-full-HP clause is
 * a conditional too, just a structure-side one rather than a target-side one.
 * Each is measured with its condition met *and* with it unmet, and the unmet
 * reading must equal the control exactly. All four additionally carry the
 * Act-I-only default (`!w.huntsWarden`) their two call sites impose. That
 * default is **not** new here for two of the four — `p6d-nine-classes.test.ts`
 * already states it for Stormcaller (`:1138`) and Necromancer (`:599`), and
 * already states Pyro's Burning condition (`:1100`). What this file adds is the
 * other two classes, the `levelup` phase (p6d only drives `act2`), and the
 * `classTowerBonus` nulling for Pyro and Cryomancer.
 *
 * **No row asserts an authored magnitude**, with one declared exception —
 * c005/c006's convention, and `c008` now owns the figures themselves in
 * `tests/class-spec-numbers.test.ts`. A retune of `towerHp` from 0.10 to 0.12
 * must not turn this file red.
 *
 * The exception is *Wind Slash*'s cadence half, and it is forced by the sim
 * rather than chosen: `tickCooldown` discards the sub-tick remainder every
 * shot instead of carrying it, so a tower's rate of fire is quantised to whole
 * 60 Hz ticks and an attack-speed bonus smaller than one tick's worth changes
 * nothing at all. At the Arrow Spire's 0.7143 s interval that threshold is
 * ~+2.4%. A retune below it does not merely shrink Wind Slash, it makes it
 * behaviourally dead — which is precisely what a liveness file must not stay
 * green through. That row therefore asserts the boundary explicitly and fails
 * with a message naming the retune. What is
 * asserted is direction and presence, which is why Bloodlord's row is the
 * interesting one: *Sanguine Pact* is the only tower passive carrying a
 * negative term, so its two clauses are asserted in *opposite* directions and
 * a sign flip on either is red.
 *
 * **The last `describe` is the honesty half**, as in c006. Every row's evidence
 * is reduced to a *signal*: one nonnegative number, positive if and only if
 * that clause fired, computed as the class-minus-control delta in the clause's
 * own direction. The table then rebuilds `Content` from a copy of
 * `data/classes.json` with that one clause's binding removed — the single
 * `mods` key, or the one `chronal_surge` field — and requires every signal to
 * fall to exactly 0. Without it this file would assert fifteen facts about
 * shipped data and prove nothing about whether the *test* can see them go
 * away. The mutation is per **clause**, never `mods = {}` wholesale, so each
 * signal shows which key it really rides — which is how the Paladin's and the
 * Bloodlord's shared `towerHp` key stays distinguishable from each row's own
 * second clause.
 *
 * **What this file is not.** Liveness, not completeness. It does not check that
 * Wind Slash is "effective in VS" while Miasma is not (Q118/Q119 own that
 * reading), that a tower passive survives a tier upgrade, or that any clause
 * reaches the wielded-tower attacks of Act II. Those are `p6d`'s and
 * `vswield.ts`'s to own.
 */
import { describe, expect, it } from 'vitest';

import { loadContent, type Content } from '../src/sim/content';
import { applyBurn, applyFrost, applyFrozen, spawnEnemy } from '../src/sim/enemies';
import { updateProjectiles } from '../src/sim/combat';
import { applyCommand, Run } from '../src/sim/run';
import {
  attackSpeedFor,
  buildTower,
  classTowerBonus,
  effectiveTowerAoe,
  effectiveTowerRange,
  towerDamage,
  updateTowers,
} from '../src/sim/towers';
import { structureArmor } from '../src/sim/upgrades';
import { emptyInput, type Enemy, type Structure } from '../src/sim/types';
import { World } from '../src/sim/world';
import { BUILD_TX, BUILD_TY, WX, WY } from './class-board';
import { cfg } from './helpers';

const content = loadContent();

const DT = 1 / 60;

/** The three towers this file needs: a clean single-target hit, a synchronous splash, and a lob for the AoE stat. */
const SPIRE = 'arrow_spire';
const SPORE = 'venom_spore';
const MORTAR = 'mortar';
/** ...plus a `pierce` tower, whose bonus travels on a projectile instead of landing in-line. */
const BALLISTA = 'ballista';
/** ...and a `cone` tower, the one in-line shape that rebuilds `HitEffects` rather than passing `fx` on. */
const BRAZIER = 'ember_brazier';

/**
 * Default control. Swordsman's tower passive is `towerAttackSpeed` alone and
 * its character passive authors `mods: {}`, so it contributes nothing to any
 * tower's damage, HP, range, area or armour.
 */
const CONTROL = 'swordsman';

/**
 * ...which makes it useless as the control for *Wind Slash*. Engineer's tower
 * passive is `towerHp`, which `attackSpeedFor` does not read, and its
 * character passive's two mods (`towerCost`, `buildRange`) are spent before a
 * tower ever fires.
 */
const SPEED_CONTROL = 'engineer';

/** A world with the character's own attack suppressed — every observable below is a tower's. */
function towerWorld(classKey: string, c: Content = content): World {
  const w = new World(cfg({ classKey }), c);
  w.gold = 1e6;
  w.warden.attackCooldown = 1e9;
  w.warden.x = WX;
  w.warden.y = WY;
  return w;
}

function place(w: World, key: string, tx: number, ty: number): Structure {
  const def = w.content.towerByKey.get(key)!;
  const r = buildTower(w, def.id, tx, ty);
  expect(r.ok, `harness could not build ${key} at ${tx},${ty}`).toBe(true);
  return (r as { ok: true; structure: Structure }).structure;
}

/**
 * An immovable, unarmoured punching bag with hp deep enough that no row here
 * can kill it by accident — a kill would end the measurement early and, worse,
 * hand a class-specific death trigger (Grave Harvest, Blood Frenzy) a chance to
 * move an observable this file attributes to the tower passive.
 *
 * 1e7 rather than something larger on purpose: every damage row reads
 * `before - e.hp`, and a float subtraction at 1e9 has a ULP near 2.4e-7, so a
 * pool deep enough to be "obviously safe" is also deep enough to quantise a
 * small bonus to nothing. At 1e7 the ULP is ~2e-9 against volleys of ~100-400,
 * which keeps this file's "a retune must not turn it red" convention honest for
 * any magnitude a tower passive could plausibly be tuned to.
 */
function dummy(w: World, x: number, y: number, hp = 1e7): Enemy {
  // `w.content`, not the module-level `content`: a row built from a
  // `contentWithout` rebuild must spawn from *its* Content (c006's convention).
  const e = spawnEnemy(w, w.content.enemies.enemies[0].key, x, y)!;
  e.hp = hp;
  e.maxHp = Math.max(hp, e.maxHp);
  e.speed = 0;
  e.armor = 0;
  w.rebuildBuckets();
  return e;
}

/**
 * Fires exactly one volley from `s`, whatever its cadence would have been.
 * Attack *speed* is a separate observable (`attackSpeedFor`), measured
 * directly; forcing the shot here keeps every damage row comparing one hit
 * against one hit rather than one hit against two.
 */
function fireOnce(w: World, s: Structure): void {
  s.cooldown = 0;
  updateTowers(w, DT);
}

/** Total hp one forced spire volley takes off a lone dummy, after `prep` sets the target up. */
function volleyDamage(classKey: string, c: Content, prep: (w: World, e: Enemy) => void = () => {}): number {
  const w = towerWorld(classKey, c);
  const s = place(w, SPIRE, BUILD_TX, BUILD_TY);
  const e = dummy(w, WX + 2, WY);
  prep(w, e);
  const before = e.hp;
  fireOnce(w, s);
  return before - e.hp;
}

/**
 * The same measurement through a `cone` volley. Of the five shapes that resolve
 * in-line, `cone` is the only one that builds a *fresh* `HitEffects` literal
 * instead of forwarding `fx` by reference, so it is the only one where an
 * ordinary edit can drop the `TowerClassBonus` without touching `fireTower`'s
 * shared setup — and a file that fires nothing but an Arrow Spire would not
 * notice (QA on c009).
 */
function coneDamage(classKey: string, c: Content, prep: (w: World, e: Enemy) => void = () => {}): number {
  const w = towerWorld(classKey, c);
  const s = place(w, BRAZIER, BUILD_TX, BUILD_TY);
  // Well inside the brazier's 3.5 reach and its half-angle, whichever way the
  // cone ends up pointing — the case asserts a hit landed before comparing.
  const e = dummy(w, WX + 2, WY);
  prep(w, e);
  const before = e.hp;
  fireOnce(w, s);
  return before - e.hp;
}

/**
 * The same measurement through the **asynchronous** carrier. `fireTower` hands
 * its `TowerClassBonus` to `dealHit` in-line only for the shapes that resolve
 * synchronously (`single`/`cone`/`aura`/`chain`/`poison`); a `pierce` or `lob`
 * shot instead stows it on the projectile (`combat.ts:475`) and reads it back
 * when the bolt lands (`combat.ts:542`). Those are two more places the bundle
 * can be dropped, and a file that only ever fires an Arrow Spire watches
 * neither — setting `combat.ts:475` to `null` leaves every `single`-path row
 * green. The Ballista is the cheapest way in: `pierce`, `projectileSpeed` 14
 * over a range of 8, so two seconds of flight is comfortably enough.
 */
function boltDamage(classKey: string, c: Content, prep: (w: World, e: Enemy) => void = () => {}): number {
  const w = towerWorld(classKey, c);
  const s = place(w, BALLISTA, BUILD_TX, BUILD_TY);
  const e = dummy(w, WX + 4, WY);
  prep(w, e);
  const before = e.hp;
  fireOnce(w, s);
  // The volley must actually have left the tower, or "no damage" would read the
  // same as a dropped bonus.
  expect(w.projectiles.length, 'the ballista fired nothing to carry the bonus').toBeGreaterThan(0);
  for (let t = 0; t < 120; t++) updateProjectiles(w, DT);
  return before - e.hp;
}

/**
 * Two TD waves called and cleared, the way `fb013`'s own Chronal Surge case
 * drives them: `applyChronalSurge` is private to `run.ts` and fires off
 * `completeWave`, so the only honest way to reach it is to clear real waves.
 * The spawn queue and the enemy list are emptied rather than fought, so the
 * measurement is about the wave *count* and not about who won.
 */
function clearWaves(classKey: string, c: Content, waves: number): World {
  const run = new Run(cfg({ classKey }), c);
  const w = run.world;
  w.gold = 1e6;
  w.invulnerable = true;
  w.godMode = true;
  w.phase = 'act1_build';
  for (let i = 0; i < waves; i++) {
    applyCommand(w, { k: 'call' });
    run.step(emptyInput());
    w.spawnQueue = [];
    w.enemies = [];
    run.step(emptyInput());
  }
  expect(w.wavesCleared, `harness failed to clear ${waves} TD waves`).toBe(waves);
  return w;
}

/** The interval Chronal Surge is authored to fire on — read, never assumed. */
const SURGE_INTERVAL = Math.max(1, Math.round(content.classByKey.get('time_lord')!.towerPassive.waveInterval ?? 2));

/* ---------------------------------------------------------------- signals */

/**
 * One nonnegative number per tower-passive clause, positive if and only if that
 * clause fired, measured as the class-minus-control delta in the clause's own
 * direction. Every `it` below reads its evidence through one of these, and so
 * does the negative-control table at the bottom — which is the point: the same
 * measurement has to survive being pointed at broken data.
 */
const signal = {
  /** Swordsman *Wind Slash*: a built spire's cadence multiplier. */
  windSlash(c: Content, classKey: string): number {
    const speed = (k: string): number => {
      const w = towerWorld(k, c);
      return attackSpeedFor(w, place(w, SPIRE, BUILD_TX, BUILD_TY));
    };
    return Math.max(0, speed(classKey) - speed(SPEED_CONTROL));
  },

  /** Plaguebringer *Miasma*: the dps stamped on the Poison stack a spore's own volley leaves. */
  miasma(c: Content, classKey: string): number {
    const dps = (k: string): number => {
      const w = towerWorld(k, c);
      const s = place(w, SPORE, BUILD_TX, BUILD_TY);
      const e = dummy(w, WX + 2, WY);
      fireOnce(w, s);
      let best = 0;
      for (const d of e.dots) if (d.type === 'poison' && d.dps > best) best = d.dps;
      return best;
    };
    return Math.max(0, dps(classKey) - dps(CONTROL));
  },

  /** Engineer *Reinforced Frames* / Paladin *Consecrated Stone*: a built spire's max HP, upward. */
  towerHpUp(c: Content, classKey: string): number {
    const hp = (k: string): number => {
      const w = towerWorld(k, c);
      return place(w, SPIRE, BUILD_TX, BUILD_TY).maxHp;
    };
    return Math.max(0, hp(classKey) - hp(CONTROL));
  },

  /** Bloodlord *Sanguine Pact*, the negative half: the same number, downward. */
  towerHpDown(c: Content, classKey: string): number {
    const hp = (k: string): number => {
      const w = towerWorld(k, c);
      return place(w, SPIRE, BUILD_TX, BUILD_TY).maxHp;
    };
    return Math.max(0, hp(CONTROL) - hp(classKey));
  },

  /** Paladin *Consecrated Stone*, second clause: a built spire's armour. */
  consecratedArmor(c: Content, classKey: string): number {
    const armor = (k: string): number => {
      const w = towerWorld(k, c);
      return structureArmor(w, place(w, SPIRE, BUILD_TX, BUILD_TY));
    };
    return Math.max(0, armor(classKey) - armor(CONTROL));
  },

  /** Pyro *Kindling*: extra hp taken off a **Burning** dummy by one volley. */
  kindling(c: Content, classKey: string): number {
    const burn = (w: World, e: Enemy): void => applyBurn(w, e, 1, 10, 'harness');
    return Math.max(0, volleyDamage(classKey, c, burn) - volleyDamage(CONTROL, c, burn));
  },

  /** Cryomancer *Deep Winter*: extra hp taken off a **frosted** dummy by one volley. */
  deepWinter(c: Content, classKey: string): number {
    const frost = (w: World, e: Enemy): void => applyFrost(w, e);
    return Math.max(0, volleyDamage(classKey, c, frost) - volleyDamage(CONTROL, c, frost));
  },

  /**
   * ...and the **frozen** half of the same clause. `dealHit` reads
   * `e.frostRemaining > 0 || e.frozenRemaining > 0` (`combat.ts:80`), and the
   * two are set independently (`applyFrozen`, `enemies.ts:582`) — an enemy that
   * is frozen with its frost already lapsed is ordinary play, not a
   * contrivance. Without this signal, deleting the `frozenRemaining` half of
   * that `||` left the whole file green (QA on c009).
   */
  deepWinterFrozen(c: Content, classKey: string): number {
    const freeze = (w: World, e: Enemy): void => {
      applyFrozen(w, e);
      // Frost deliberately *not* applied: the point is to exercise the half of
      // the `||` the frosted signal above cannot reach.
      e.frostRemaining = 0;
    };
    return Math.max(0, volleyDamage(classKey, c, freeze) - volleyDamage(CONTROL, c, freeze));
  },

  /** Stormcaller *Live Wire*: extra hp taken off a plain dummy — the second, typed bolt. */
  liveWire(c: Content, classKey: string): number {
    return Math.max(0, volleyDamage(classKey, c) - volleyDamage(CONTROL, c));
  },

  /** Archer *Ranger's Eye*: how much further a spire reaches. */
  rangersEye(c: Content, classKey: string): number {
    const reach = (k: string): number => {
      const w = towerWorld(k, c);
      return effectiveTowerRange(w, w.content.towerByKey.get(SPIRE)!);
    };
    return Math.max(0, reach(classKey) - reach(CONTROL));
  },

  /** Necromancer *Wounded Fury*: extra damage a **damaged** spire's shot is worth. */
  woundedFury(c: Content, classKey: string): number {
    const dmg = (k: string): number => {
      const w = towerWorld(k, c);
      const s = place(w, SPIRE, BUILD_TX, BUILD_TY);
      s.hp = s.maxHp * 0.5;
      return towerDamage(w, s, 100);
    };
    return Math.max(0, dmg(classKey) - dmg(CONTROL));
  },

  /** Bloodlord *Sanguine Pact*, the positive half: a spire's shot at full HP. */
  sanguineDamage(c: Content, classKey: string): number {
    const dmg = (k: string): number => {
      const w = towerWorld(k, c);
      return towerDamage(w, place(w, SPIRE, BUILD_TX, BUILD_TY), 100);
    };
    return Math.max(0, dmg(classKey) - dmg(CONTROL));
  },

  /** Animist *Wide Grove*: how much wider a spore's splash gets. */
  wideGrove(c: Content, classKey: string): number {
    const aoe = (k: string): number => {
      const w = towerWorld(k, c);
      return effectiveTowerAoe(w, w.content.towerByKey.get(SPORE)!);
    };
    return Math.max(0, aoe(classKey) - aoe(CONTROL));
  },

  /** Time Lord *Chronal Surge*, range half: a spire's reach after two TD wave clears. */
  chronalRange(c: Content, classKey: string): number {
    const reach = (k: string): number => {
      const w = clearWaves(k, c, SURGE_INTERVAL);
      return effectiveTowerRange(w, w.content.towerByKey.get(SPIRE)!);
    };
    return Math.max(0, reach(classKey) - reach(CONTROL));
  },

  /** Time Lord *Chronal Surge*, AoE half: a mortar's burst after two TD wave clears. */
  chronalAoe(c: Content, classKey: string): number {
    const aoe = (k: string): number => {
      const w = clearWaves(k, c, SURGE_INTERVAL);
      return effectiveTowerAoe(w, w.content.towerByKey.get(MORTAR)!);
    };
    return Math.max(0, aoe(classKey) - aoe(CONTROL));
  },
};

/* ------------------------------------------------ the twelve tower passives */

describe('c009: every class tower passive measurably changes a built tower', () => {
  it('Swordsman *Wind Slash* — a spire fires faster than under a class that authors no cadence bonus', () => {
    const w = towerWorld('swordsman');
    const ctl = towerWorld(SPEED_CONTROL);
    expect(attackSpeedFor(w, place(w, SPIRE, BUILD_TX, BUILD_TY))).toBeGreaterThan(
      attackSpeedFor(ctl, place(ctl, SPIRE, BUILD_TX, BUILD_TY)),
    );
    expect(signal.windSlash(content, 'swordsman')).toBeGreaterThan(0);

    // The behavioural half: `attackSpeedFor` has exactly one consumer
    // (`towers.ts`' `s.cooldown = tickCooldown(s.cooldown, dt * attackSpeedFor(...))`),
    // so a number that is bigger but never reaches the cooldown is not a faster
    // tower.
    //
    // Measured as **ticks to the Nth shot**, not damage over a fixed window.
    //
    // The interesting part is why the obvious forms of this assertion are both
    // wrong. `tickCooldown` (`types.ts:17`) clamps to 0 rather than carrying the
    // sub-tick remainder, and `updateTowers` then sets `s.cooldown += interval`
    // from that exact 0 — so the remainder is **discarded every shot** instead
    // of accumulating. A tower's cadence is therefore quantised to whole 60 Hz
    // ticks *per shot*: the Arrow Spire's 0.7143 s interval is 42.86 ticks, so
    // it fires every 43 ticks at +0% and every 43 ticks at +2% alike, and no
    // number of shots ever separates them. (+3% is the first step that moves it,
    // to 42.) That is a property of the sim, not of this harness — logged for
    // the main lane in BACKLOG-CONTENT, since `towers.ts`/`types.ts` are out of
    // this lane's Scope.
    //
    // That makes this row the **one deliberate exception** to the file's
    // no-authored-magnitude convention, and the header says so. Everywhere else
    // a retune is none of this file's business; here a retune below one tick's
    // worth genuinely makes the passive do nothing to any tower's cadence, and
    // a liveness file that stayed green through that would be lying. So the
    // boundary is computed from `/data` and asserted out loud, with a message
    // that names the retune rather than leaving a bare `43 < 43`.
    const spireDef = content.towerByKey.get(SPIRE)!;
    const interval = spireDef.attack!.interval;
    const pct = content.classByKey.get('swordsman')!.towerPassive.mods.towerAttackSpeed;
    const ticksPerShot = (speedMul: number): number => Math.ceil((interval / (DT * speedMul)) * (1 - 1e-9));
    const observable = ticksPerShot(1 + pct) < ticksPerShot(1);
    const shots = 3;
    const ticksToNthShot = (k: string): number => {
      const wo = towerWorld(k);
      const s = place(wo, SPIRE, BUILD_TX, BUILD_TY);
      dummy(wo, WX + 2, WY, 1e9); // shot *count* is the observable here, not a damage delta
      // A freshly built tower starts at `cooldown: 0` and fires on tick 1 for
      // free, which costs both classes exactly one tick and hides the gap.
      // Start it a full interval out so what is timed is real firing cycles.
      s.cooldown = interval;
      let fired = 0;
      let t = 0;
      while (fired < shots && t < 1e6) {
        const before = s.damageDealt;
        updateTowers(wo, DT);
        t++;
        if (s.damageDealt > before) fired++;
      }
      expect(fired, 'the spire never reached the shot count the window was sized for').toBe(shots);
      return t;
    };
    expect(
      observable,
      `towerAttackSpeed ${pct} is under one 60 Hz tick at the ${SPIRE}'s ${interval}s interval ` +
        `(${ticksPerShot(1 + pct)} vs ${ticksPerShot(1)} ticks/shot), so Wind Slash changes no tower's cadence at all`,
    ).toBe(true);
    const fast = ticksToNthShot('swordsman');
    const slow = ticksToNthShot(SPEED_CONTROL);
    expect(fast, 'Wind Slash made the spire *slower*').toBeLessThanOrEqual(slow);
    expect(fast, 'Wind Slash crosses a tick boundary but the spire did not actually fire sooner').toBeLessThan(slow);
  });

  it('Plaguebringer *Miasma* — a spore volley stamps a higher dps on its own Poison stack', () => {
    // The stack has to exist at all before its dps means anything: `dotPotency`
    // only boosts a poison whose `source` resolves to a real tower key, so a
    // spore that landed no stack would make this row vacuously "equal".
    const w = towerWorld('plaguebringer');
    const s = place(w, SPORE, BUILD_TX, BUILD_TY);
    const e = dummy(w, WX + 2, WY);
    fireOnce(w, s);
    expect(e.dots.filter((d) => d.type === 'poison').length).toBeGreaterThan(0);
    expect(signal.miasma(content, 'plaguebringer')).toBeGreaterThan(0);
  });

  it('Engineer *Reinforced Frames* — a spire is built with more max HP', () => {
    expect(signal.towerHpUp(content, 'engineer')).toBeGreaterThan(0);
  });

  it('Pyro *Kindling* — a volley into a Burning enemy hurts more', () => {
    expect(signal.kindling(content, 'pyromancer')).toBeGreaterThan(0);
  });

  it('...and the conditional bundle reaches a `cone` volley, the one in-line shape that rebuilds `fx`', () => {
    const burn = (w: World, e: Enemy): void => applyBurn(w, e, 1, 10, 'harness');
    const hot = coneDamage('pyromancer', content, burn);
    const cold = coneDamage(CONTROL, content, burn);
    expect(cold, 'the brazier hit nothing, so nothing was measured').toBeGreaterThan(0);
    expect(hot).toBeGreaterThan(cold);
  });

  it('...and the conditional bundle survives the trip on a projectile, not just the in-line hit', () => {
    // `combat.ts:475`/`:542` are the other two places a `TowerClassBonus` can be
    // dropped, and every row above fires an Arrow Spire, whose `single` shape
    // resolves in-line and touches neither. One `pierce` volley closes that.
    const burn = (w: World, e: Enemy): void => applyBurn(w, e, 1, 10, 'harness');
    const hot = boltDamage('pyromancer', content, burn);
    const cold = boltDamage(CONTROL, content, burn);
    expect(cold, 'the ballista bolt never landed, so nothing was measured').toBeGreaterThan(0);
    expect(hot).toBeGreaterThan(cold);
  });

  it("Archer *Ranger's Eye* — a spire reaches further, and hits a target the control cannot", () => {
    expect(signal.rangersEye(content, 'archer')).toBeGreaterThan(0);

    // The reach is only worth something if it converts into a hit. Probe the
    // gap rather than hardcoding it, so a retune of either the tower's range
    // or the passive's percentage relocates the target instead of reddening.
    const probe = towerWorld(CONTROL);
    const spireDef = probe.content.towerByKey.get(SPIRE)!;
    const inner = effectiveTowerRange(probe, spireDef);
    const outer = effectiveTowerRange(towerWorld('archer'), spireDef);
    const gap = (inner + outer) / 2;
    expect(gap, 'no gap between the two reaches to place a target in').toBeGreaterThan(inner);

    const hitAt = (k: string): number => {
      const w = towerWorld(k);
      const s = place(w, SPIRE, BUILD_TX, BUILD_TY);
      const e = dummy(w, WX + 1.5 + gap, WY + 0.5);
      const before = e.hp;
      fireOnce(w, s);
      return before - e.hp;
    };
    expect(hitAt(CONTROL)).toBe(0);
    expect(hitAt('archer')).toBeGreaterThan(0);
  });

  it("Necromancer *Wounded Fury* — a damaged spire's shot is worth more", () => {
    expect(signal.woundedFury(content, 'necromancer')).toBeGreaterThan(0);
  });

  it('Cryomancer *Deep Winter* — a volley into a frosted enemy hurts more', () => {
    expect(signal.deepWinter(content, 'cryomancer')).toBeGreaterThan(0);
  });

  it('...and into a *frozen* one too — the other half of the same `||`', () => {
    // `frostRemaining` and `frozenRemaining` are set independently, so a clause
    // proven only on the frosted half can lose the frozen half in silence.
    expect(signal.deepWinterFrozen(content, 'cryomancer')).toBeGreaterThan(0);
  });

  it('Stormcaller *Live Wire* — a plain volley lands extra Electric on top', () => {
    expect(signal.liveWire(content, 'stormcaller')).toBeGreaterThan(0);
  });

  it('Bloodlord *Sanguine Pact* — the one passive with a negative term: damage up, HP down', () => {
    expect(signal.sanguineDamage(content, 'bloodlord')).toBeGreaterThan(0);
    expect(signal.towerHpDown(content, 'bloodlord')).toBeGreaterThan(0);
    // Stated as absolutes too, so a sign flip on either clause cannot be
    // absorbed by the other: `Math.max(0, ...)` alone would read a flipped pair
    // as "both dead" rather than "both inverted".
    const w = towerWorld('bloodlord');
    const ctl = towerWorld(CONTROL);
    const s = place(w, SPIRE, BUILD_TX, BUILD_TY);
    const cs = place(ctl, SPIRE, BUILD_TX, BUILD_TY);
    expect(towerDamage(w, s, 100)).toBeGreaterThan(towerDamage(ctl, cs, 100));
    expect(s.maxHp).toBeLessThan(cs.maxHp);
  });

  it("Animist *Wide Grove* — a spore's splash covers more ground", () => {
    expect(signal.wideGrove(content, 'animist')).toBeGreaterThan(0);

    // ...and reaches a second enemy the control's splash does not. Measured as
    // "how many enemies took damage", not "did the bystander", because
    // `targetFirst` decides which of the pair is primary and the two are
    // deliberately placed one gap apart either way round.
    const probe = towerWorld(CONTROL);
    const sporeDef = probe.content.towerByKey.get(SPORE)!;
    const inner = effectiveTowerAoe(probe, sporeDef);
    const outer = effectiveTowerAoe(towerWorld('animist'), sporeDef);
    const gap = (inner + outer) / 2;

    const struck = (k: string): number => {
      const w = towerWorld(k);
      const s = place(w, SPORE, BUILD_TX, BUILD_TY);
      const a = dummy(w, WX + 2, WY);
      const b = dummy(w, WX + 2 + gap, WY);
      const before = [a.hp, b.hp];
      fireOnce(w, s);
      return [a, b].filter((e, i) => e.hp < before[i]).length;
    };
    expect(struck(CONTROL)).toBe(1);
    expect(struck('animist')).toBe(2);
  });

  it('Paladin *Consecrated Stone* — both clauses: a spire has more max HP **and** more armour', () => {
    expect(signal.towerHpUp(content, 'paladin')).toBeGreaterThan(0);
    expect(signal.consecratedArmor(content, 'paladin')).toBeGreaterThan(0);
  });

  it("Time Lord *Chronal Surge* — two TD wave clears widen a built tower's reach and burst", () => {
    expect(signal.chronalRange(content, 'time_lord')).toBeGreaterThan(0);
    expect(signal.chronalAoe(content, 'time_lord')).toBeGreaterThan(0);

    // The behavioural half: the bonus has to reach a tower that is standing
    // *after* the waves were cleared, not just a freshly-read stat.
    const w = clearWaves('time_lord', content, SURGE_INTERVAL);
    w.warden.x = WX;
    w.warden.y = WY;
    w.warden.attackCooldown = 1e9;
    const spireDef = w.content.towerByKey.get(SPIRE)!;
    const ctl = towerWorld(CONTROL);
    const inner = effectiveTowerRange(ctl, ctl.content.towerByKey.get(SPIRE)!);
    const gap = (inner + effectiveTowerRange(w, spireDef)) / 2;
    const s = place(w, SPIRE, BUILD_TX, BUILD_TY);
    const e = dummy(w, WX + 1.5 + gap, WY + 0.5);
    const before = e.hp;
    fireOnce(w, s);
    expect(before - e.hp, "a standing spire did not inherit the surge's extra reach").toBeGreaterThan(0);
  });

  it("...on the wave *interval* it authors — nothing early, and it keeps accruing", () => {
    // `signal.chronalRange` alone cannot tell "fired once at wave 2" from
    // "fired at wave 1" or "fires every wave": all three read positive after
    // two clears. Inverting `applyChronalSurge`'s modulo, or deleting it, left
    // the whole file green (QA on c009). One clear short of the interval is
    // what separates them.
    const reachAfter = (classKey: string, waves: number): number => {
      const w = clearWaves(classKey, content, waves);
      return effectiveTowerRange(w, w.content.towerByKey.get(SPIRE)!);
    };
    const control = reachAfter(CONTROL, SURGE_INTERVAL - 1);
    expect(reachAfter('time_lord', SURGE_INTERVAL - 1), 'the surge fired before its interval was up').toBe(control);
    expect(reachAfter('time_lord', SURGE_INTERVAL)).toBeGreaterThan(control);
    // ...and a second interval is worth more than the first, so a surge that
    // fires once and then stops is red too.
    expect(reachAfter('time_lord', SURGE_INTERVAL * 2)).toBeGreaterThan(reachAfter('time_lord', SURGE_INTERVAL));
  });
});

/* ----------------------------------------- the conditional rows' conditions */

describe('c009: the four conditional rows apply only under their condition', () => {
  it('Pyro *Kindling* does nothing to an enemy that is not Burning', () => {
    expect(volleyDamage('pyromancer', content)).toBe(volleyDamage(CONTROL, content));
  });

  it('Cryomancer *Deep Winter* does nothing to an enemy that is neither frosted nor frozen', () => {
    expect(volleyDamage('cryomancer', content)).toBe(volleyDamage(CONTROL, content));
  });

  it('Necromancer *Wounded Fury* does nothing to a spire at full HP', () => {
    const dmg = (k: string): number => {
      const w = towerWorld(k);
      return towerDamage(w, place(w, SPIRE, BUILD_TX, BUILD_TY), 100);
    };
    expect(dmg('necromancer')).toBe(dmg(CONTROL));
  });

  it('Stormcaller *Live Wire* rides the damage that landed — a volley that kills its target adds nothing', () => {
    // `dealHit`'s real guard is `dealt > 0 && !e.dead` (`combat.ts:90`), and the
    // only way to observe the bolt *itself* rather than its arithmetic is
    // Electric's inherent r0.8 blast (§3): a bystander out of the spire's own
    // reach but inside 0.8 of the primary can only have been hit by the bolt.
    //
    // So the condition is put under real strain: the same shot, once with a
    // target that survives and once with one that dies to it. Deleting
    // `!e.dead` makes the second reading positive and this case red — which the
    // earlier draft of this test (an enemy-count assertion on a world with no
    // enemies in it) could not do, because it was true by construction.
    const CENTRE_X = WX + 1.5;
    const CENTRE_Y = WY + 0.5;
    const bystanderSplash = (classKey: string, primaryHp: number): number => {
      const w = towerWorld(classKey);
      const s = place(w, SPIRE, BUILD_TX, BUILD_TY);
      const reach = effectiveTowerRange(w, w.content.towerByKey.get(SPIRE)!);
      const blast = w.content.damageTypeByKey.get('electric')!.radius!;
      const primary = dummy(w, CENTRE_X + reach - 0.2, CENTRE_Y, primaryHp);
      // Out of the tower's reach — so `targetFirst` cannot pick it — but inside
      // the blast, so the bolt can.
      const bystander = dummy(w, CENTRE_X + reach + blast / 2, CENTRE_Y);
      w.rebuildBuckets();
      const before = bystander.hp;
      fireOnce(w, s);
      expect(primary.dead, `primary should ${primaryHp > 1 ? 'survive' : 'die'} to one volley`).toBe(primaryHp <= 1);
      return before - bystander.hp;
    };

    // Condition met: the target lived, so the bolt fired and splashed.
    expect(bystanderSplash('stormcaller', 1e7)).toBeGreaterThan(0);
    // Condition unmet: the same volley killed the target, so no bolt at all.
    expect(bystanderSplash('stormcaller', 1)).toBe(0);
    // ...and the control never splashes either way, so the splash is Live Wire's.
    expect(bystanderSplash(CONTROL, 1e7)).toBe(0);
  });

  it("all four stay Act I's: the conditional bonuses are gone once the Warden hunt is on", () => {
    // `huntsWarden` is a *getter* over `phase` — `phase === 'act2' ||
    // phase === 'levelup'` (`world.ts:573`) — so the phase is what gets set
    // here, not the flag. Both phases that flip it are covered, since a guard
    // rewritten as `phase !== 'act2'` would pass on one and fail on the other.
    for (const phase of ['act2', 'levelup'] as const) {
      for (const k of ['pyromancer', 'cryomancer', 'stormcaller']) {
        const w = towerWorld(k);
        expect(classTowerBonus(w), `${k} authors no conditional bundle in Act I`).not.toBeNull();
        w.phase = phase;
        expect(w.huntsWarden).toBe(true);
        expect(classTowerBonus(w), `${k}'s bundle survived into ${phase}`).toBeNull();
      }
      const w = towerWorld('necromancer');
      const s = place(w, SPIRE, BUILD_TX, BUILD_TY);
      s.hp = s.maxHp * 0.5;
      const act1 = towerDamage(w, s, 100);
      w.phase = phase;
      expect(towerDamage(w, s, 100), `Wounded Fury survived into ${phase}`).toBeLessThan(act1);
    }
  });
});

/* ---------------------------------------------------- route 5: the wrong key */

describe('c009: Animist *Wide Grove* is authored on the global `area` stat, not a tower-only one', () => {
  it('widens `areaMul` itself — so it also reaches every non-tower effect', () => {
    // Not a defect this lane may fix (`statkeys.ts` has no `towerArea` and is
    // out of Scope), and not one this file will leave unwritten either: the row
    // says "all towers +10% area" and the sim gives the whole run +10% area.
    // Pinned here so a later `towerArea` lands deliberately, not by accident.
    const w = towerWorld('animist');
    const ctl = towerWorld(CONTROL);
    expect(w.derived.areaMul).toBeGreaterThan(ctl.derived.areaMul);
    const mods = w.content.classByKey.get('animist')!.towerPassive.mods;
    expect(mods.area).toBeGreaterThan(0);
    expect(mods.towerArea).toBeUndefined();
  });
});

/* ---------------------------------------------------- the negative control */

/** The shape of one `data/classes.json` row, as far as the mutations below care. */
type RawClassRow = {
  key: string;
  towerPassive: { kind?: string; mods: Record<string, number>; [k: string]: unknown };
};

/**
 * `Content` rebuilt from a copy of `data/classes.json` with `mutate` applied to
 * one class's row — the same rebuild-from-copy path c005/c006's controls use.
 * Deleting one `mods` key is accepted by the loader without complaint (an empty
 * `mods` is already shipped on several rows), which is exactly what makes it
 * the right shape here: it is the state a clause is left in when its binding to
 * code quietly goes away.
 */
function contentWithout(classKey: string, mutate: (row: RawClassRow) => void): Content {
  const doc = JSON.parse(JSON.stringify(content.raw.classes)) as { classes: RawClassRow[] };
  const row = doc.classes.find((c) => c.key === classKey);
  expect(row, `${classKey} missing from data/classes.json`).toBeDefined();
  mutate(row!);
  return loadContent({ classes: doc });
}

interface Kill {
  /** The clause, named the way the `it` above names it. */
  name: string;
  classKey: string;
  /** Positive on shipped data, exactly 0 once `mutate` lands. */
  measure: (c: Content, classKey: string) => number;
  /** Removes this clause's binding — the one `mods` key, or the one `chronal_surge` field. */
  mutate: (row: RawClassRow) => void;
}

const KILLS: readonly Kill[] = [
  {
    name: 'Wind Slash',
    classKey: 'swordsman',
    measure: signal.windSlash,
    mutate: (r) => void delete r.towerPassive.mods.towerAttackSpeed,
  },
  {
    name: 'Miasma',
    classKey: 'plaguebringer',
    measure: signal.miasma,
    mutate: (r) => void delete r.towerPassive.mods.towerPoisonDamage,
  },
  {
    name: 'Reinforced Frames',
    classKey: 'engineer',
    measure: signal.towerHpUp,
    mutate: (r) => void delete r.towerPassive.mods.towerHp,
  },
  {
    name: 'Kindling',
    classKey: 'pyromancer',
    measure: signal.kindling,
    mutate: (r) => void delete r.towerPassive.mods.towerDamageVsBurning,
  },
  {
    name: "Ranger's Eye",
    classKey: 'archer',
    measure: signal.rangersEye,
    mutate: (r) => void delete r.towerPassive.mods.towerRange,
  },
  {
    name: 'Wounded Fury',
    classKey: 'necromancer',
    measure: signal.woundedFury,
    mutate: (r) => void delete r.towerPassive.mods.towerLowHpDamageBonus,
  },
  {
    name: 'Deep Winter',
    classKey: 'cryomancer',
    measure: signal.deepWinter,
    mutate: (r) => void delete r.towerPassive.mods.towerDamageVsChilled,
  },
  {
    name: 'Deep Winter (frozen)',
    classKey: 'cryomancer',
    measure: signal.deepWinterFrozen,
    mutate: (r) => void delete r.towerPassive.mods.towerDamageVsChilled,
  },
  {
    name: 'Live Wire',
    classKey: 'stormcaller',
    measure: signal.liveWire,
    mutate: (r) => void delete r.towerPassive.mods.towerExtraElectricPct,
  },
  // Per-clause, not per-row: Sanguine Pact's two mods must each be shown to
  // carry their own half, or one signal could be riding the other's key.
  {
    name: 'Sanguine Pact (damage)',
    classKey: 'bloodlord',
    measure: signal.sanguineDamage,
    mutate: (r) => void delete r.towerPassive.mods.towerDamage,
  },
  {
    name: 'Sanguine Pact (HP penalty)',
    classKey: 'bloodlord',
    measure: signal.towerHpDown,
    mutate: (r) => void delete r.towerPassive.mods.towerHp,
  },
  {
    name: 'Wide Grove',
    classKey: 'animist',
    measure: signal.wideGrove,
    mutate: (r) => void delete r.towerPassive.mods.area,
  },
  {
    name: 'Consecrated Stone (HP)',
    classKey: 'paladin',
    measure: signal.towerHpUp,
    mutate: (r) => void delete r.towerPassive.mods.towerHp,
  },
  {
    name: 'Consecrated Stone (defense)',
    classKey: 'paladin',
    measure: signal.consecratedArmor,
    mutate: (r) => void delete r.towerPassive.mods.towerDefenseBonus,
  },
  // `kind`-driven, so the mutation is the field rather than a `mods` key — and
  // per clause, since one `kind` carries both bonuses.
  {
    name: 'Chronal Surge (range)',
    classKey: 'time_lord',
    measure: signal.chronalRange,
    mutate: (r) => void (r.towerPassive.bonusRangeMul = 0),
  },
  {
    name: 'Chronal Surge (AoE)',
    classKey: 'time_lord',
    measure: signal.chronalAoe,
    mutate: (r) => void (r.towerPassive.bonusAoeMul = 0),
  },
];

describe('c009: the negative control — each signal dies with its own binding', () => {
  it('covers all twelve tower passives, every clause of each', () => {
    expect(content.classes.classes.length).toBe(12);
    expect(new Set(KILLS.map((k) => k.classKey)).size).toBe(content.classes.classes.length);
    // Every shipped `mods` key and every `chronal_surge` field is somebody's
    // mutation target, so a *fourteenth* clause authored on an existing row
    // (thirteen already exist) cannot slip in behind a sibling's signal.
    const authored = new Set<string>();
    for (const c of content.classes.classes) {
      for (const key of Object.keys(c.towerPassive.mods)) authored.add(`${c.key}.${key}`);
    }
    expect(
      authored.size,
      `data/classes.json authors ${authored.size} towerPassive mods keys; add the new one to KILLS below and bump this count`,
    ).toBe(13);
    // One row per authored `mods` key, plus Chronal Surge's two fields, plus
    // the extra clause-halves that share a key with a sibling row (today only
    // Deep Winter's `frozen` half, which rides `towerDamageVsChilled`).
    const SHARED_KEY_ROWS = ['Deep Winter (frozen)'];
    expect(KILLS.map((k) => k.name)).toEqual(expect.arrayContaining(SHARED_KEY_ROWS));
    expect(KILLS.length, 'one KILLS row per authored mods key, plus Chronal Surge’s two fields').toBe(
      authored.size + 2 + SHARED_KEY_ROWS.length,
    );
    // The `mods` count above cannot see a `kind`-driven field, so pin Chronal
    // Surge's shape too: a third bonus added to the only such row would
    // otherwise be invisible to both assertions.
    // Read from the **raw** document, not `content`: zod strips unknown keys,
    // so a `bonusDamageMul` added to `data/classes.json` is invisible in the
    // parsed row and this guard would have passed while missing exactly the
    // thing it exists to catch (QA on c009).
    const rawTl = (content.raw.classes as { classes: RawClassRow[] }).classes.find((c) => c.key === 'time_lord')!
      .towerPassive;
    expect(rawTl.kind).toBe('chronal_surge');
    expect(Object.keys(rawTl).filter((k) => k.startsWith('bonus')).sort()).toEqual(['bonusAoeMul', 'bonusRangeMul']);
  });

  for (const k of KILLS) {
    it(`${k.name} (${k.classKey}) is positive on shipped data and 0 once its binding is gone`, () => {
      expect(k.measure(content, k.classKey), `${k.name} reads dead on shipped data`).toBeGreaterThan(0);
      // Each signal must really *read* the class its row names. An earlier
      // draft hardcoded the class inside every signal and ignored the argument,
      // which would have let a mis-paired row (`towerHpDown` under `paladin`,
      // say) measure a different class and still pass both assertions. Handing
      // a signal its own control has to read exactly 0 — and cannot, if the
      // argument is being thrown away.
      const selfControl = k.classKey === CONTROL ? SPEED_CONTROL : CONTROL;
      expect(k.measure(content, selfControl), `${k.name} ignores the class it is handed`).toBe(0);
      const broken = contentWithout(k.classKey, k.mutate);
      expect(k.measure(broken, k.classKey), `${k.name} survived losing its binding`).toBe(0);
    });
  }
});

/**
 * c036 (BACKLOG-CONTENT, lane `content`) — equipment-sourced and
 * class-tower-passive-sourced bonuses on the same stat key, jointly measured
 * for the first time. §2's stacking rule: different sources multiply. Two
 * pairs write the same key today — `sniper_bracelet` (+10% `towerRange`) and
 * Archer *Ranger's Eye* (+10% `towerRange`); `normal_bracelet` (+10% `area`)
 * and Animist *Wide Grove* (+10% `area`, the same global key `c013` found
 * also reaches all 24 class Actives). Every existing test
 * (`tests/equip-spec-numbers.test.ts`, the file above) grants one such source
 * at a time. If same-key sources were ever collapsed into one additive pool
 * instead of two multiplicative ones, both individually-granted cases would
 * still read +10% and only the combined case would silently read +20%
 * instead of the correct x1.21 (+21%) — so the combined case is the only one
 * that can catch that regression.
 */
function towerWorldWithEquipment(classKey: string, equipment: readonly string[], c: Content = content): World {
  const w = new World(cfg({ classKey, equipment: [...equipment] }), c);
  w.gold = 1e6;
  w.warden.attackCooldown = 1e9;
  w.warden.x = WX;
  w.warden.y = WY;
  return w;
}

describe('c036: equipment and class-tower-passive bonuses on the same stat key multiply, not add', () => {
  it("Archer *Ranger's Eye* (+10% towerRange) stacks with Sniper Bracelet (+10% towerRange) to x1.21, not x1.20", () => {
    const spireDef = content.towerByKey.get(SPIRE)!;
    const base = effectiveTowerRange(towerWorld(CONTROL), spireDef);
    const passiveOnly = effectiveTowerRange(towerWorld('archer'), spireDef);
    const equipOnly = effectiveTowerRange(towerWorldWithEquipment(CONTROL, ['sniper_bracelet']), spireDef);
    const both = effectiveTowerRange(towerWorldWithEquipment('archer', ['sniper_bracelet']), spireDef);

    // Each source alone reads close to the expected single factor — read via
    // the real `effectiveTowerRange` path the rest of this file uses, not a
    // hand-rolled formula, so a change to how range composes moves this test
    // along with every other row here.
    expect(passiveOnly / base, "Ranger's Eye alone").toBeCloseTo(1.1, 6);
    expect(equipOnly / base, 'Sniper Bracelet alone').toBeCloseTo(1.1, 6);
    // The joint case is the one no existing test can see: two independent
    // §2 sources on the same key multiply.
    expect(both / base, 'both sources together').toBeCloseTo(1.21, 6);
    expect(both / base, 'not silently additive (would read 1.20)').not.toBeCloseTo(1.2, 6);
  });

  it('Animist *Wide Grove* (+10% area) stacks with Normal Bracelet (+10% area) to x1.21, not x1.20', () => {
    const sporeDef = content.towerByKey.get(SPORE)!;
    const base = effectiveTowerAoe(towerWorld(CONTROL), sporeDef);
    const passiveOnly = effectiveTowerAoe(towerWorld('animist'), sporeDef);
    const equipOnly = effectiveTowerAoe(towerWorldWithEquipment(CONTROL, ['normal_bracelet']), sporeDef);
    const both = effectiveTowerAoe(towerWorldWithEquipment('animist', ['normal_bracelet']), sporeDef);

    expect(passiveOnly / base, 'Wide Grove alone').toBeCloseTo(1.1, 6);
    expect(equipOnly / base, 'Normal Bracelet alone').toBeCloseTo(1.1, 6);
    expect(both / base, 'both sources together').toBeCloseTo(1.21, 6);
    expect(both / base, 'not silently additive (would read 1.20)').not.toBeCloseTo(1.2, 6);
  });

  it('formula sanity check — an additive pool would read x1.20 where the rows above read x1.21', () => {
    // Not a real-`Content`/`World` mutation test (the two `it`s above already
    // are, via `effectiveTowerRange`/`effectiveTowerAoe` on real built
    // structures) — this is a self-contained arithmetic check naming the
    // regression shape directly: one pool where the two sources'
    // *percentages* sum before the `1 + ...` factor is taken, instead of each
    // source contributing its own `(1 + pct)` multiplicative term.
    // `0.1 + 0.1 = 0.2` -> factor `1.2`, not the real `1.1 * 1.1 = 1.21`.
    const additivePool = (...pcts: number[]): number => 1 + pcts.reduce((s, p) => s + p, 0);
    const multiplicativePool = (...pcts: number[]): number => pcts.reduce((f, p) => f * (1 + p), 1);
    expect(additivePool(0.1, 0.1)).toBeCloseTo(1.2, 10);
    expect(multiplicativePool(0.1, 0.1)).toBeCloseTo(1.21, 10);
    expect(additivePool(0.1, 0.1)).not.toBeCloseTo(multiplicativePool(0.1, 0.1), 6);
  });
});
