/**
 * c006 (BACKLOG-CONTENT, lane `content`) — **no class *Passive* is a silent
 * no-op.** c005's twin for the other §4 slot.
 *
 * c005 put the 24 Actives on trial and found all 24 live. The passive slot
 * had nothing at all, and it is the *weaker* of the two slots by
 * construction: an Active is dispatched through one `switch` whose `default`
 * branch c005 now watches, whereas a passive reaches the sim through four
 * unrelated routes, only one of which is a switch —
 *
 *   1. `passive.kind` read at a hook (`passiveOnHit`, `classAttackPowerMul`,
 *      `classArmorBonus`, `killEnemy`'s three death-triggered rows,
 *      `damageWarden`'s Time Flow branch),
 *   2. `passive.kind` dispatched by `updateClassPassives`' per-tick switch
 *      (Contagious Flame, Guardian Stance),
 *   3. `passive.mods` folded into `Stats` (`stats.ts:193`) — Engineer, and
 *      Blood Frenzy's lifesteal clause,
 *   4. **nothing at all** — three rows author `mods: {}` with *no* `kind`
 *      (Archer *Long Draw*, Stormcaller *Conduction*, Animist *Kinship*), so
 *      no code path is bound to the passive row itself.
 *
 * Route 4 is why this file cannot be c005's loop with a different verb. For
 * those three rows the deliverable c006 asks for is different in kind: **pin
 * the exact `active1`/`active2` field the clause really lives on, with a
 * named reason**, so a later refactor that moves or drops the field cannot do
 * it silently. Each of the three still gets a real behavioural assertion on
 * top of the pin — the clause is observable even where the row is not.
 *
 * **What "live" means here.** Each row builds a real `World`, does the one
 * thing the passive claims to react to, and compares the result against a
 * *control class* run through the identical scenario. The control is the
 * whole assertion: "the enemy is bleeding" proves nothing on its own, since
 * a `bleeding` stack could arrive from anywhere; "the enemy is bleeding
 * under the Swordsman and not under the Engineer, same attack, same world"
 * is what pins the passive as the cause. `engineer` is the default control —
 * its own passive is pure `mods` (route 3) and so cannot leak into any
 * behavioural row here — and the Engineer's own row uses `swordsman` as its
 * control for the same reason in reverse.
 *
 * A passive with two clauses gets **one control comparison per clause**, not
 * one for the passive: Frost Touch's three (apply / freeze / shatter) and
 * Guardian Stance's two (armour / Wrath) are separate assertions against
 * separate control readings, so deleting any single clause turns this file
 * red rather than being absorbed by a sibling.
 *
 * **No row asserts an authored magnitude** (the c005 convention): a retune of
 * `flameDps` or `stanceArmor` must not turn this file red. What is asserted
 * is direction and presence — "hp fell", "a corpse exists", "the second jump
 * hit harder than the first" — plus, for the three route-4 rows, the identity
 * of the field itself.
 *
 * **The last `describe` is the honesty half.** Every row's evidence is
 * reduced to a *signal*: one nonnegative number that is positive if and only
 * if the passive fired. The table then rebuilds `Content` from a copy of
 * `data/classes.json` with that passive's binding removed — the `kind`
 * deleted, the one `mods` key deleted, or the route-4 field zeroed — and
 * requires every signal to fall to exactly 0. Without it this file would
 * assert twelve facts about the shipped data and prove nothing about whether
 * the *test* can see them go away. The mutation is per *clause*, never
 * `mods = {}` wholesale, so each signal shows which key it really rides.
 *
 * **What this file is not.** Liveness, not completeness — c005's convention.
 * A passive's *magnitudes and lifetimes* are out of scope and are `c011`:
 * `corpseSeconds`, `chainCap`, `chargeCapSeconds`, the aura's `remaining`
 * and its multi-totem stacking, Frost Touch's two counter-reset semantics,
 * Spreading Plague's transferred amount, and Time Flow's stack-cap merge can
 * each be broken with this file green. So can the p7a skill-card branches
 * (`classLineBonus`) inside Thousand Cuts, Frost Touch and Spreading Plague.
 * Per-clause depth belongs to `p6b`/`p6d`, which own those assertions today.
 *
 * **Kinship's two halves, per c006's acceptance.** The aura half is asserted
 * where it actually reaches a summon: `updateClassSummons`
 * (`classes.ts:1515`) divides a `ClassSummon`'s `interval` by
 * `auraSpeedMul`, which is a *different* call site from the Warden's own at
 * `classes.ts:1817` — that one is the character clause of *Recall Totem*,
 * not Kinship's "aura effects **also** affect summons". The control here
 * cannot be another class, because the Recall Totem is the only aura in the
 * game; it is the same summon outside the aura's radius. The **summon-cap
 * half** ("summon cap +1", §4.2) is *not* implemented — that is `c004`,
 * blocked out of this lane's Scope on `statkeys.ts`, and this file
 * cross-references it with a tripwire rather than re-filing it.
 */
import { describe, expect, it } from 'vitest';

import {
  auraSpeedMul,
  classArmorBonus,
  classBasicAttack,
  tickClassCharge,
  updateClassPassives,
  updateClassSummons,
  useClassActive,
  useClassActive2,
} from '../src/sim/classes';
import { loadContent, type ClassDef, type Content } from '../src/sim/content';
import { applyDot, damageEnemy, dotStacks, spawnEnemy } from '../src/sim/enemies';
import { damageWarden, tickWardenDots, updateWarden } from '../src/sim/run';
import { buildTower, checkBuild } from '../src/sim/towers';
import { upgradeCost } from '../src/sim/upgrades';
import type { ClassSummon, Enemy, TickInput } from '../src/sim/types';
import { World } from '../src/sim/world';
import { cfg } from './helpers';

const content = loadContent();

/** Warden's parking spot for every case — well inside the board, room in every direction. */
const WX = 10;
const WY = 10;

const DT = 1 / 60;

const SPIRE = 'arrow_spire';

/**
 * A world with the basic attack suppressed by default: it would change enemy
 * hp on its own, which is the observable most rows below read. The three
 * signals whose passive *rides* the basic attack (Thousand Cuts, Frost Touch,
 * Blood Frenzy) re-arm it explicitly with `attack(w)`. Same convention as
 * `class-kit-liveness` (c005) and p6b/p6c before it.
 */
function passiveWorld(classKey: string, c: Content = content): World {
  const w = new World(cfg({ classKey }), c);
  w.gold = 1e6;
  w.warden.attackCooldown = 1e9;
  w.warden.x = WX;
  w.warden.y = WY;
  return w;
}

function cls(w: World): ClassDef {
  return w.content.classByKey.get(w.cfg.classKey)!;
}

/** An immovable, unarmoured punching bag with hp deep enough that no row here can kill it by accident. */
function dummy(w: World, x: number, y: number, hp = 1e6): Enemy {
  // `w.content`, not the module-level `content`: a row built from a
  // `contentWithout` rebuild must spawn from *its* Content, or a future
  // enemy-side kill row would be silently vacuous (code review + QA).
  const e = spawnEnemy(w, w.content.enemies.enemies[0].key, x, y)!;
  e.hp = hp;
  e.maxHp = Math.max(hp, e.maxHp);
  e.speed = 0;
  e.armor = 0;
  w.rebuildBuckets();
  return e;
}

/** Fires exactly one character basic attack, whatever the cadence would have been. */
function attack(w: World): void {
  w.warden.attackCooldown = 0;
  classBasicAttack(w, cls(w));
}

function idle(over: Partial<TickInput> = {}): TickInput {
  return { mx: 0, my: 0, dash: false, attack: false, aimX: 0, aimY: 0, active1Held: false, cmds: [], ...over };
}

/** Ticks the per-tick passive switch (`updateClassPassives`) for `seconds` at the real 60 Hz. */
function tickPassives(w: World, seconds: number): void {
  for (let t = 0; t < Math.round(seconds * 60); t++) updateClassPassives(w, DT);
}

/**
 * Holds a charge Active for `seconds` and releases it. Unlike c005's
 * `chargeAndRelease`, the hold length is the *variable under test* here —
 * Long Draw's whole clause is "+1 pierce per full second charged" — so this
 * one takes it as a parameter and never clamps to the cap on the caller's
 * behalf. Held at 60 Hz, not in one giant `dt`, for c005's reason: a harness
 * that takes a path no real run takes stops being evidence about real runs.
 */
function chargeFor(w: World, seconds: number, aimX: number, aimY: number): void {
  const c = cls(w);
  const aim = { aimX, aimY };
  for (let t = 0; t < Math.round(seconds * 60); t++) {
    tickClassCharge(w, c, idle({ ...aim, active1Held: true }), DT);
  }
  tickClassCharge(w, c, idle({ ...aim, active1Held: false }), DT);
}

/**
 * A world with a Recall Totem standing on the Warden and one Manifest spirit
 * summoned off the tower next door — the only two `ClassSummon`s this class
 * can produce, and the exact pair Kinship's aura clause is about.
 */
function animistWorld(c: Content): { w: World; spirit: ClassSummon; totem: ClassSummon } {
  const w = passiveWorld('animist', c);
  // Manifest reads a nearby *attacking* tower and clones its profile.
  expect(buildTower(w, c.towerByKey.get(SPIRE)!.id, WX + 1, WY).ok).toBe(true);
  expect(useClassActive(w)).toBe(true); // Manifest
  expect(useClassActive2(w)).toBe(true); // Recall Totem, centred on the Warden
  const spirit = w.classSummons.find((s) => s.kind === 'animist_spirit');
  const totem = w.classSummons.find((s) => s.kind === 'animist_totem');
  expect(spirit, 'harness produced no spirit to test the aura against').toBeDefined();
  expect(totem, 'harness produced no totem to test the aura with').toBeDefined();
  return { w, spirit: spirit!, totem: totem! };
}

/**
 * The first buildable tile due east of the Warden that the *base* build range
 * cannot reach. Chosen by probing rather than hardcoded, so a grid change
 * relocates it instead of turning the Engineer's reach clause red.
 */
function tilePastBaseRange(c: Content): { tx: number; ty: number } | null {
  const id = c.towerByKey.get(SPIRE)!.id;
  // `checkBuild` rather than `buildTower`: the same legality check with no
  // side effects, so one probe world serves every candidate tile.
  const probe = passiveWorld('swordsman', c);
  for (let dx = 4; dx < 14; dx++) {
    if (checkBuild(probe, id, WX + dx, WY) === 'out_of_range') return { tx: WX + dx, ty: WY };
  }
  return null;
}

/* ---------------------------------------------------------------- signals */

/**
 * One nonnegative number per passive clause, positive if and only if that
 * clause fired. Every `it` below reads its evidence through one of these, and
 * so does the negative-control table at the bottom — which is the point: the
 * same measurement has to survive being pointed at broken data.
 */
const signal = {
  /** Swordsman *Thousand Cuts*: Bleeding stacks a single character attack left behind. */
  thousandCuts(c: Content, classKey = 'swordsman'): number {
    const w = passiveWorld(classKey, c);
    const e = dummy(w, WX + 1, WY); // inside every class's basic range (min 2.5)
    attack(w);
    return dotStacks(e, 'bleeding');
  },

  /** Plaguebringer *Spreading Plague*: hp the nearest survivor lost to a DoT-carrying death. */
  spreadingPlague(c: Content, classKey = 'plaguebringer'): number {
    const w = passiveWorld(classKey, c);
    const carrier = dummy(w, WX + 1, WY, 100);
    const bystander = dummy(w, WX + 2, WY);
    // Unfinished on purpose: the clause is about the *undealt* remainder.
    applyDot(w, carrier, 'poison', 20, 5, 'test');
    const before = bystander.hp;
    damageEnemy(w, carrier, 1e6, 'test');
    expect(carrier.dead).toBe(true);
    return before - bystander.hp;
  },

  /**
   * Engineer *Efficient Engineering*, cost clause: gold saved building **every
   * tower in `/data`**, each on its own fresh world.
   *
   * Summed rather than billed on one cheap spire because `towers.ts` rounds
   * (`Math.max(1, Math.round(cost * towerCostMul))`): at `arrow_spire`'s 50
   * gold a legal retune of `towerCost` to `-0.01` rounds the saving to
   * exactly 0 and turned this row red with the passive perfectly alive —
   * a magnitude dependency the file's own convention forbids (found by QA).
   */
  buildSavings(c: Content): number {
    const bill = (classKey: string): number => {
      let spent = 0;
      for (const def of c.towers.towers) {
        const w = passiveWorld(classKey, c);
        const before = w.gold;
        if (!buildTower(w, def.id, WX + 1, WY).ok) continue;
        spent += before - w.gold;
      }
      expect(spent, 'harness built no tower at all').toBeGreaterThan(0);
      return spent;
    };
    return bill('swordsman') - bill('engineer');
  },

  /**
   * Engineer *Efficient Engineering*, upgrade clause: gold saved on upgrade
   * steps. `data/classes.json` says "builds **and upgrades** cost 10% less",
   * and `upgradeCost` is a second, separate reader of `towerCostMul` — so
   * without this row it could drop the multiplier and stay green (QA).
   */
  upgradeSavings(c: Content): number {
    const bill = (classKey: string): number => {
      const w = passiveWorld(classKey, c);
      return c.towers.towers.reduce((sum, def) => sum + upgradeCost(w, def), 0);
    };
    return bill('swordsman') - bill('engineer');
  },

  /** Engineer *Efficient Engineering*, reach clause: 1 if a tile past the base range is legal, else 0. */
  buildReach(c: Content): number {
    const far = tilePastBaseRange(c);
    expect(far, 'harness found no buildable tile past the base build range').not.toBeNull();
    const id = c.towerByKey.get(SPIRE)!.id;
    return buildTower(passiveWorld('engineer', c), id, far!.tx, far!.ty).ok ? 1 : 0;
  },

  /**
   * Pyro *Contagious Flame*: hp an untouched neighbour lost to a Burning carrier over one second.
   *
   * `burning` is the *trigger* under test, not a convenience. With it false
   * the carrier is an ordinary enemy and the answer must be 0 — otherwise
   * deleting `classes.ts`' `if (!burning) continue;` would turn every enemy
   * on the board into a damage aura and this file would stay green (found by
   * code review; it is the one conditional passive no test in the repo pins).
   */
  contagiousFlame(c: Content, classKey = 'pyromancer', burning = true): number {
    const w = passiveWorld(classKey, c);
    const carrier = dummy(w, WX + 3, WY);
    const neighbour = dummy(w, WX + 3.5, WY); // inside `flameRadius` of the carrier
    if (burning) applyDot(w, carrier, 'burning', 5, 10, 'test');
    const before = neighbour.hp;
    // `updateClassPassives` only — the carrier's own burn is ticked by
    // `updateEnemies`, which is deliberately not run here, so every point the
    // neighbour loses came from the passive and nothing else.
    tickPassives(w, 1);
    return before - neighbour.hp;
  },

  /** Archer *Long Draw*: extra bodies a 3 s draw pierces over a 1 s one. */
  longDrawPierce(c: Content): number {
    const pierced = (held: number): number => {
      const w = passiveWorld('archer', c);
      const line: Enemy[] = [];
      for (let i = 1; i <= 6; i++) line.push(dummy(w, WX + i, WY));
      const before = line.map((e) => e.hp);
      chargeFor(w, held, WX + 6, WY);
      return line.filter((e, i) => e.hp < before[i]).length;
    };
    return pierced(3) - pierced(1);
  },

  /** Necromancer *Grave Harvest*: corpses a kill left behind. */
  graveHarvest(c: Content, classKey = 'necromancer'): number {
    const w = passiveWorld(classKey, c);
    damageEnemy(w, dummy(w, WX + 1, WY, 100), 1e6, 'test');
    return w.corpses.length;
  },

  /** Cryomancer *Frost Touch*, clause 1: frost a single character attack applied. */
  frostOnHit(c: Content, classKey = 'cryomancer'): number {
    const w = passiveWorld(classKey, c);
    const e = dummy(w, WX + 1, WY);
    attack(w);
    return e.frostRemaining;
  },

  /** Cryomancer *Frost Touch*, clause 2: 1 if `freezeHits` attacks froze the target, else 0. */
  frostFreeze(c: Content, classKey = 'cryomancer'): number {
    const w = passiveWorld(classKey, c);
    const e = dummy(w, WX + 1, WY);
    // The shipped `freezeHits` where the clause is live; a fixed generous
    // budget where it is not, so the control cannot pass by never swinging.
    const need = cls(w).passive.freezeHits ?? 5;
    for (let i = 0; i < need; i++) attack(w);
    return e.frozenRemaining > 0 ? 1 : 0;
  },

  /** Cryomancer *Frost Touch*, clause 3: hp a neighbour lost to a frozen enemy's death. */
  frostShatter(c: Content, classKey = 'cryomancer'): number {
    const w = passiveWorld(classKey, c);
    const victim = dummy(w, WX + 3, WY, 100);
    const neighbour = dummy(w, WX + 3.5, WY);
    victim.frozenRemaining = 5;
    const before = neighbour.hp;
    damageEnemy(w, victim, 1e6, 'test');
    return before - neighbour.hp;
  },

  /** Stormcaller *Conduction*: how much harder Chain Surge's second jump lands than its first. */
  conduction(c: Content): number {
    // Enemies are spaced 2 apart so none is inside electric's own inherent
    // splash (`radius` 0.8, data/damagetypes.json) around another — otherwise
    // the later jumps' bleed-over would fake the growth being measured.
    const w = passiveWorld('stormcaller', c);
    const chain = [dummy(w, WX + 2, WY), dummy(w, WX + 4, WY), dummy(w, WX + 6, WY)];
    const before = chain.map((e) => e.hp);
    expect(useClassActive(w, WX + 2, WY)).toBe(true);
    const dealt = chain.map((e, i) => before[i] - e.hp);
    expect(dealt[0], 'chain never reached its first target').toBeGreaterThan(0);
    return dealt[1] - dealt[0];
  },

  /**
   * Bloodlord *Blood Frenzy*, lifesteal clause: **hp actually healed** by one
   * point of VS damage.
   *
   * Not `leechAccumulator`, which is the intermediate: `run.ts` banks it on
   * one tick and spends it at the top of the next, so deleting the
   * `applyHealingToWarden` call leaves the accumulator rising and the Warden
   * healing nothing — a passive that is a no-op in every sense the player can
   * see (found by QA, and the same cost-vs-product confusion c005 hit twice).
   *
   * The damage goes through `damageEnemy` rather than `attack(w)` because the
   * character basic attack is TD-only (`run.ts` fires it under
   * `if (!w.huntsWarden)`), so swinging it in VS is a path no real run takes;
   * VS damage really arrives from wielded attacks, which route here.
   */
  bloodLeech(c: Content, classKey = 'bloodlord'): number {
    const healed = (dealDamage: boolean): number => {
      const w = passiveWorld(classKey, c);
      w.phase = 'act2'; // `huntsWarden` is `act2 || levelup`; VS is the live one
      const e = dummy(w, WX + 1, WY);
      w.warden.hp = Math.max(1, w.derived.maxHp - 100); // room to heal into
      if (dealDamage) damageEnemy(w, e, 100, 'test');
      const before = w.warden.hp;
      updateWarden(w, idle(), DT); // spends the accumulator (run.ts)
      return w.warden.hp - before;
    };
    // Minus the identical tick with no damage dealt: `updateWarden` also
    // applies out-of-combat regen, which is live in VS (`regenOk` is
    // `huntsWarden || ...`) and would otherwise read as lifesteal for every
    // class, control included.
    return healed(true) - healed(false);
  },

  /** Damage one character basic attack deals in `phase` — the primitive both Blood Frenzy halves read. */
  phaseHit(c: Content, classKey: string, phase: 'act1_wave' | 'act2'): number {
    const w = passiveWorld(classKey, c);
    w.phase = phase;
    const e = dummy(w, WX + 1, WY);
    const before = e.hp;
    attack(w);
    return before - e.hp;
  },

  /** Bloodlord *Blood Frenzy*, phase clause: how much harder one attack lands in VS than in TD. */
  bloodFrenzy(c: Content, classKey = 'bloodlord'): number {
    return signal.phaseHit(c, classKey, 'act2') - signal.phaseHit(c, classKey, 'act1_wave');
  },

  /** Animist *Kinship*: how much of a spirit's own attack interval the totem's aura shaved off. */
  kinshipAura(c: Content): number {
    const { w, spirit } = animistWorld(c);
    dummy(w, spirit.x + 1, spirit.y);
    spirit.attackCooldown = 0;
    updateClassSummons(w, DT);
    expect(spirit.attackCooldown, 'the spirit never attacked, so no cadence was set').toBeGreaterThan(0);
    return spirit.interval - spirit.attackCooldown;
  },

  /** Paladin *Guardian Stance*, armour clause: damage a completed stand blocked. */
  guardianArmor(c: Content, classKey = 'paladin'): number {
    return paladinStand(c, classKey, 0).lost - paladinStand(c, classKey, standSeconds(c)).lost;
  },

  /** Paladin *Guardian Stance*, Wrath clause: Wrath banked by what that armour blocked. */
  guardianWrath(c: Content, classKey = 'paladin'): number {
    return paladinStand(c, classKey, standSeconds(c)).wrath;
  },

  /** Time Lord *Time Flow*: DoT stacks the incoming hit was converted into. */
  timeFlow(c: Content, classKey = 'time_lord'): number {
    const w = passiveWorld(classKey, c);
    damageWarden(w, w.derived.maxHp * 0.2);
    return w.warden.dots.length;
  },
};

/** Long enough that `updateGuardianStance`'s ledger has cleared `stanceSeconds`. */
function standSeconds(c: Content): number {
  return (c.classByKey.get('paladin')!.passive.stanceSeconds ?? 1) + 0.5;
}

function paladinStand(c: Content, classKey: string, seconds: number) {
  const w = passiveWorld(classKey, c);
  // `updateGuardianStance` only starts counting once it has seen the Warden
  // hold a position for two consecutive ticks, so the first tick is the
  // baseline and the rest are the stand.
  tickPassives(w, seconds);
  const before = w.warden.hp;
  // A *survivable* hit. A full-hp Warden dies to anything >= `maxHp`, and the
  // Act I reform (`damageWarden`, run.ts) then resets hp to half of max —
  // which makes "hp lost" read as exactly `maxHp / 2` however much armour
  // blocked, so an over-large hit would make this row pass with the passive
  // deleted. (It did, on the first draft.)
  damageWarden(w, w.derived.maxHp * 0.2);
  return { armor: classArmorBonus(w), lost: before - w.warden.hp, wrath: w.warden.wrathStored };
}

/* ------------------------------------------------------------ route 1 & 2 */

describe('c006 — passives dispatched by `passive.kind`', () => {
  it('swordsman Thousand Cuts: a character attack applies Bleeding, the Engineer attack does not', () => {
    expect(signal.thousandCuts(content)).toBeGreaterThan(0);
    expect(signal.thousandCuts(content, 'engineer')).toBe(0);

    // The clause `data/classes.json` spells out — "including Active attacks;
    // each damage instance from an Active counts as 1 attack". `passiveOnHit`
    // has eight call sites and the basic attack is only one of them, so
    // without this the seven Active ones could all be gutted green (QA).
    // Active1 is Circle Slash, a charge kind, so it releases through
    // `tickClassCharge` rather than `useClassActive` (which rightly refuses).
    const bleedFrom = (fire: (w: World) => void): number => {
      const w = passiveWorld('swordsman');
      const e = dummy(w, WX + 1, WY);
      fire(w);
      return dotStacks(e, 'bleeding');
    };
    expect(bleedFrom((w) => chargeFor(w, 0.5, WX + 1, WY)), 'Circle Slash applied no Bleeding').toBeGreaterThan(0);
    expect(
      bleedFrom((w) => {
        w.warden.active2Cooldown = 0;
        expect(useClassActive2(w, WX + 1, WY)).toBe(true);
      }),
      'Dash Slash applied no Bleeding',
    ).toBeGreaterThan(0);
  });

  it('plaguebringer Spreading Plague: a DoT-carrying death damages the nearest survivor', () => {
    expect(signal.spreadingPlague(content)).toBeGreaterThan(0);
    expect(signal.spreadingPlague(content, 'engineer')).toBe(0);
  });

  it('pyromancer Contagious Flame: a Burning enemy damages an untouched neighbour, an unburned one does not', () => {
    expect(signal.contagiousFlame(content)).toBeGreaterThan(0);
    expect(signal.contagiousFlame(content, 'engineer')).toBe(0);
    // The trigger, not just the effect: same class, same pair, no Burning.
    expect(signal.contagiousFlame(content, 'pyromancer', false)).toBe(0);
  });

  it('necromancer Grave Harvest: a kill leaves a corpse', () => {
    expect(signal.graveHarvest(content)).toBeGreaterThan(0);
    expect(signal.graveHarvest(content, 'engineer')).toBe(0);
  });

  describe('cryomancer Frost Touch — one control comparison per clause', () => {
    it('attacks apply frost; the Engineer attack does not', () => {
      expect(signal.frostOnHit(content)).toBeGreaterThan(0);
      expect(signal.frostOnHit(content, 'engineer')).toBe(0);
    });

    it('an enemy hit `freezeHits` times while frosted freezes, and not before', () => {
      expect(signal.frostFreeze(content)).toBe(1);
      expect(signal.frostFreeze(content, 'engineer')).toBe(0);
      // The "and not before" half, which the 1/0 signal cannot carry: the
      // freeze must need the whole authored count, not land on hit one.
      const hitsToFreeze = (c: Content): number => {
        const w = passiveWorld('cryomancer', c);
        const e = dummy(w, WX + 1, WY);
        for (let i = 1; i <= 12; i++) {
          attack(w);
          if (e.frozenRemaining > 0) return i;
        }
        return 0;
      };
      const shipped = content.classByKey.get('cryomancer')!.passive.freezeHits!;
      expect(hitsToFreeze(content)).toBe(shipped);

      // And `freezeHits` is really *read* rather than defaulted to the same
      // number on both sides. `freezeHits` is exempt from
      // `REQUIRED_PASSIVE_FIELDS` (it has a sane nonzero default), so the
      // harness reading `?? 5` against a sim reading `?? 5` would agree even
      // if nothing bound the field at all — a `/data` number no code reads,
      // which is the route-4 failure one level down (found by code review).
      const easy = contentWithout('cryomancer', (r) => void (r.passive.freezeHits = 2));
      expect(hitsToFreeze(easy)).toBe(2);
    });

    it('a frozen death shatters, damaging a neighbour', () => {
      expect(signal.frostShatter(content)).toBeGreaterThan(0);
      expect(signal.frostShatter(content, 'engineer')).toBe(0);
    });
  });

  it('bloodlord Blood Frenzy: lifesteal banks in VS, and the attack multiplier flips with the phase', () => {
    expect(signal.bloodLeech(content)).toBeGreaterThan(0);
    expect(signal.bloodLeech(content, 'engineer')).toBe(0);
    // "+10% attack in VS waves, −5% in TD waves" is phase-dependent by
    // construction, so the control is the *same class in the other phase* as
    // much as it is the other class in both.
    expect(signal.bloodFrenzy(content)).toBeGreaterThan(0);
    expect(signal.bloodFrenzy(content, 'engineer')).toBe(0);

    // Each half separately. The difference above is satisfied by the VS bonus
    // alone, so on its own it leaves the TD *penalty* with no defence —
    // dropping `frenzyTdMul` keeps the difference positive (found by QA).
    //
    // The control is the *same class with that one number neutralised*, not
    // another class: the twelve kits author different `basicAttack.dps`, so a
    // cross-class damage comparison would measure the profile, not the
    // passive (the Bloodlord out-hits the Engineer even while penalised).
    const noVs = contentWithout('bloodlord', (r) => void (r.passive.frenzyVsMul = 0));
    const noTd = contentWithout('bloodlord', (r) => void (r.passive.frenzyTdMul = 0));
    expect(signal.phaseHit(content, 'bloodlord', 'act2')).toBeGreaterThan(
      signal.phaseHit(noVs, 'bloodlord', 'act2'),
    );
    expect(signal.phaseHit(content, 'bloodlord', 'act1_wave')).toBeLessThan(
      signal.phaseHit(noTd, 'bloodlord', 'act1_wave'),
    );
  });

  it('paladin Guardian Stance: standing still grants armour, and blocked damage banks Wrath', () => {
    const standing = paladinStand(content, 'paladin', standSeconds(content));
    const moving = paladinStand(content, 'paladin', 0);
    expect(standing.armor).toBeGreaterThan(0);
    expect(moving.armor).toBe(0);

    // `moving` above is really "the passive never ticked" — `standStillTimer`
    // is 0 by construction there, not by the reset. Without this, armour that
    // never drops once earned (deleting the `standStillTimer = 0` on a move)
    // would keep the file green (found by QA).
    const w = passiveWorld('paladin');
    tickPassives(w, standSeconds(content));
    expect(classArmorBonus(w)).toBeGreaterThan(0);
    w.warden.x += 1;
    updateClassPassives(w, DT);
    expect(classArmorBonus(w), 'armour survived the Warden moving').toBe(0);
    expect(signal.guardianArmor(content)).toBeGreaterThan(0);
    expect(signal.guardianArmor(content, 'engineer')).toBe(0);

    // "blocked damage charges Wrath" — armour has to have blocked something
    // for there to be anything to bank, which is why this reads the standing
    // case rather than getting a scenario of its own.
    expect(signal.guardianWrath(content)).toBeGreaterThan(0);
    expect(signal.guardianWrath(content, 'engineer')).toBe(0);

    // Banked Wrath is only a passive product if something can *spend* it:
    // `wrathStored` on its own is an intermediate, and Judgement reading a
    // constant instead of it would leave the row above green (found by QA).
    // Same class both sides — only the stand differs — so this measures the
    // banking, not Judgement.
    const judgement = (standFor: number): number => {
      const w = passiveWorld('paladin');
      tickPassives(w, standFor);
      damageWarden(w, w.derived.maxHp * 0.2);
      const e = dummy(w, WX + 1, WY);
      const before = e.hp;
      w.warden.active2Cooldown = 0;
      useClassActive2(w);
      return before - e.hp;
    };
    expect(judgement(standSeconds(content))).toBeGreaterThan(judgement(0));

    // The second banking clause: `wrathFraction` banks a share of damage that
    // *landed* while Clarion Taunt is up, which the blocked-damage path above
    // never reaches. Deleting it leaves everything else here green.
    const clarion = (remaining: number): number => {
      const w = passiveWorld('paladin');
      w.warden.clarionRemaining = remaining;
      damageWarden(w, w.derived.maxHp * 0.2); // no stand: nothing is blocked
      return w.warden.wrathStored;
    };
    expect(clarion(5)).toBeGreaterThan(clarion(0));
  });

  it('time_lord Time Flow: damage taken lands as a DoT instead of all at once', () => {
    const hit = (classKey: string) => {
      const w = passiveWorld(classKey);
      const before = w.warden.hp;
      damageWarden(w, w.derived.maxHp * 0.2); // survivable, same reason as the Paladin row
      const atImpact = before - w.warden.hp;
      // Read the stack count *before* ticking: `tickWardenDots` filters
      // expired stacks out of the array, so a post-tick length is 0 whether
      // the passive converted anything or not.
      const dots = w.warden.dots.length;
      tickWardenDots(w, 10); // long enough to drain whatever was converted
      return { atImpact, dots, overTime: before - w.warden.hp };
    };

    const tl = hit('time_lord');
    expect(tl.atImpact).toBe(0); // nothing landed on the frame of the hit
    expect(tl.dots).toBeGreaterThan(0);
    expect(tl.overTime).toBeGreaterThan(0); // but all of it arrives afterwards

    const control = hit('engineer');
    expect(control.atImpact).toBeGreaterThan(0);
    expect(control.dots).toBe(0);
  });
});

/* ---------------------------------------------------------------- route 3 */

describe('c006 — the passive that is pure `mods`', () => {
  it('engineer Efficient Engineering: builds and upgrades cost less, and builds reach further', () => {
    // Cheaper: the *same* towers, the same tile, a smaller bill than a class
    // that authors no `towerCost`.
    expect(signal.buildSavings(content)).toBeGreaterThan(0);
    // ...and the "and upgrades" half, which is a separate reader.
    expect(signal.upgradeSavings(content)).toBeGreaterThan(0);
    // Further: a tile that is legal for the Engineer and out of range for the
    // control, everything else about the two worlds identical.
    expect(signal.buildReach(content)).toBe(1);
    const far = tilePastBaseRange(content)!;
    const id = content.towerByKey.get(SPIRE)!.id;
    expect(checkBuild(passiveWorld('swordsman'), id, far.tx, far.ty)).toBe('out_of_range');
  });
});

/* ---------------------------------------------------------------- route 4 */

/**
 * The three rows that author `mods: {}` and no `kind`. Nothing binds the
 * *row* to code, so each case does two things: pin the field its clause
 * really lives on (so the binding is written down somewhere a grep will find
 * it), and assert the clause's behaviour anyway.
 */
describe('c006 — the three prose-only passive rows', () => {
  it('all three really are prose-only, which is why they are here', () => {
    for (const key of ['archer', 'stormcaller', 'animist']) {
      const p = content.classByKey.get(key)!.passive;
      expect(p.kind, `${key}.passive gained a kind — move it out of this describe`).toBeUndefined();
      expect(Object.keys(p.mods), `${key}.passive gained mods`).toEqual([]);
    }
  });

  it('archer Long Draw lives on `active1.pierceCap` + the absence of a damage clamp', () => {
    const a1 = content.classByKey.get('archer')!.active1;
    // The pin. "+1 pierce per full second charged" is `fireDeadeyeDraw`'s
    // `Math.min(pierceCap + classLineBonus, 1 + Math.floor(held))`; "Deadeye
    // damage has no cap" is that function never clamping `damage`, with
    // `compoundPerSecond` the growth it declines to bound. `chargeCapSeconds`
    // bounds the *hold*, not the damage, which is what keeps G10's
    // dps-optimal charge finite in the first place.
    expect(a1.kind).toBe('charge_pierce');
    expect(a1.pierceCap).toBeGreaterThan(1);
    expect(a1.compoundPerSecond).toBeGreaterThan(0);

    // Clause 1, observed: a longer draw pierces more bodies, and still obeys
    // the cap that is a perf rail rather than a damage ceiling.
    expect(signal.longDrawPierce(content)).toBeGreaterThan(0);

    // Clause 2, observed: damage is still compounding at the top of the
    // charge range, i.e. there is no ceiling short of `chargeCapSeconds`.
    // This clause has no field of its own to remove — it is the *absence* of
    // a clamp — so it is the one row in this file the negative-control table
    // below cannot cover, and this comparison is all of its evidence.
    const shotDamage = (held: number): number => {
      const w = passiveWorld('archer');
      const e = dummy(w, WX + 2, WY);
      const before = e.hp;
      chargeFor(w, held, WX + 6, WY);
      return before - e.hp;
    };
    const cap = a1.chargeCapSeconds!;
    expect(shotDamage(cap)).toBeGreaterThan(shotDamage(cap - 2));
  });

  it('stormcaller Conduction lives on `active1.chainGrowth`/`chainCap` (see c010)', () => {
    const a1 = content.classByKey.get('stormcaller')!.active1;
    // The pin, and the reason c010 exists: the passive *row* claims a rule
    // about electric damage generally, but the two numbers that implement it
    // sit on Active1, so Chain Surge is the only electric thing that
    // compounds. c010 (this lane) owns moving them onto the passive row; this
    // assertion is what c010 has to update when it does.
    expect(a1.kind).toBe('chain_lightning');
    expect(a1.chainGrowth).toBeGreaterThan(0);
    expect(a1.chainCap).toBeGreaterThan(1);

    // Observed: each jump lands harder than the one before it.
    expect(signal.conduction(content)).toBeGreaterThan(0);
  });

  describe('animist Kinship', () => {
    it('aura half: a totem attack-speed aura reaches a summon, not only the Warden', () => {
      const { w, spirit, totem } = animistWorld(content);
      expect(totem.isAura).toBe(true);
      // The pin: the aura's magnitude lives on Active2, not on the passive row.
      expect(content.classByKey.get('animist')!.active2.auraAtkSpdMul).toBeGreaterThan(0);

      // Inside the aura: `updateClassSummons` (classes.ts:1515) divides the
      // spirit's own `interval` by `auraSpeedMul` at *the spirit's* position,
      // which is the call site Kinship's "also affect summons" is about — the
      // Warden's own is a different one (classes.ts:1817).
      expect(auraSpeedMul(w, spirit.x, spirit.y)).toBeGreaterThan(1);
      expect(signal.kinshipAura(content)).toBeGreaterThan(0);

      // The control cannot be another class — the Recall Totem is the only
      // aura in the game — so it is the same spirit standing outside the
      // totem's radius, with its own target beside it.
      const far = totem.x + (totem.auraRadius ?? 0) + 5;
      spirit.x = far;
      spirit.y = totem.y;
      dummy(w, far + 1, totem.y);
      w.rebuildBuckets();
      expect(auraSpeedMul(w, spirit.x, spirit.y)).toBe(1);
      spirit.attackCooldown = 0;
      updateClassSummons(w, DT);
      expect(spirit.attackCooldown).toBeCloseTo(spirit.interval, 10);
    });

    it('summon-cap half: still unimplemented — this is c004 tripwire, not a new bug', () => {
      // SPEC-FINAL §4.2's Animist row is "aura effects also affect summons;
      // **summon cap +1**". Only the first clause exists. c004 (this lane's
      // queue, BLOCKED out of Scope on `src/sim/statkeys.ts` — a `Stats`
      // record can only carry a member of `STAT_KEYS`, and there is no
      // summon-cap key) owns the second, and its acceptance is that the +1
      // becomes expressible in `/data`. When it lands, this case is the one
      // that flips, and the aura row above becomes the whole test.
      expect(
        Object.keys(content.classByKey.get('animist')!.passive.mods),
        'Kinship gained mods — if this is c004 landing, this case is what it updates',
      ).toEqual([]);
      // And the live cap really is the authored one, +0.
      const w = passiveWorld('animist');
      expect(buildTower(w, content.towerByKey.get(SPIRE)!.id, WX + 1, WY).ok).toBe(true);
      const cap = cls(w).active1.summonCap!;
      for (let i = 0; i < cap + 3; i++) {
        w.warden.active1Cooldown = 0;
        expect(useClassActive(w)).toBe(true);
      }
      expect(w.classSummons.filter((s) => s.kind === 'animist_spirit').length).toBe(cap);
    });
  });
});

/* ---------------------------------------------------- the negative control */

/** The shape of one `data/classes.json` row, as far as the mutations below care. */
type RawClassRow = {
  key: string;
  // `[k: string]` because two rows below mutate a passive's *own* tuning
  // field (`freezeHits`, `frenzyTdMul`) rather than its `kind`/`mods`
  // binding — a field the sim defaults to the same literal the harness
  // would, so it has to be varied to be proven read at all.
  passive: { kind?: string; mods: Record<string, number>; [k: string]: unknown };
  active1: Record<string, unknown>;
  active2: Record<string, unknown>;
};

/**
 * `Content` rebuilt from a copy of `data/classes.json` with `mutate` applied
 * to one class's row — the same rebuild-from-copy path c005's control uses.
 * Deleting a `passive.kind` is accepted by the loader without complaint
 * (`validateClassPassive` only checks required fields for a kind that is
 * *present*, and three shipped rows already have none), which is exactly what
 * makes it the right shape for this control: it is the state a passive is
 * left in when its binding to code quietly goes away.
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
  /** The measurement that must be positive on shipped data and 0 once `mutate` lands. */
  measure: (c: Content) => number;
  /** Removes the passive's binding — the `kind`, the `mods`, or the route-4 field it really lives on. */
  mutate: (row: RawClassRow) => void;
}

const KILLS: readonly Kill[] = [
  { name: 'Thousand Cuts', classKey: 'swordsman', measure: signal.thousandCuts, mutate: (r) => delete r.passive.kind },
  {
    name: 'Spreading Plague',
    classKey: 'plaguebringer',
    measure: signal.spreadingPlague,
    mutate: (r) => delete r.passive.kind,
  },
  // Per-mod rather than `emptyMods`: killing the whole record would not show
  // which mod each signal actually depends on (code review).
  {
    name: 'Efficient Engineering (cost)',
    classKey: 'engineer',
    measure: signal.buildSavings,
    mutate: (r) => void delete r.passive.mods.towerCost,
  },
  {
    name: 'Efficient Engineering (upgrades)',
    classKey: 'engineer',
    measure: signal.upgradeSavings,
    mutate: (r) => void delete r.passive.mods.towerCost,
  },
  {
    name: 'Efficient Engineering (reach)',
    classKey: 'engineer',
    measure: signal.buildReach,
    mutate: (r) => void delete r.passive.mods.buildRange,
  },
  {
    name: 'Contagious Flame',
    classKey: 'pyromancer',
    measure: signal.contagiousFlame,
    mutate: (r) => delete r.passive.kind,
  },
  // Long Draw's other clause ("no damage cap") is the absence of a clamp and
  // so has no field to remove; the `it` above carries all of its evidence.
  {
    name: 'Long Draw (pierce)',
    classKey: 'archer',
    measure: signal.longDrawPierce,
    mutate: (r) => void (r.active1.pierceCap = 1),
  },
  { name: 'Grave Harvest', classKey: 'necromancer', measure: signal.graveHarvest, mutate: (r) => delete r.passive.kind },
  { name: 'Frost Touch (apply)', classKey: 'cryomancer', measure: signal.frostOnHit, mutate: (r) => delete r.passive.kind },
  { name: 'Frost Touch (freeze)', classKey: 'cryomancer', measure: signal.frostFreeze, mutate: (r) => delete r.passive.kind },
  {
    name: 'Frost Touch (shatter)',
    classKey: 'cryomancer',
    measure: signal.frostShatter,
    mutate: (r) => delete r.passive.kind,
  },
  {
    name: 'Conduction',
    classKey: 'stormcaller',
    measure: signal.conduction,
    mutate: (r) => void (r.active1.chainGrowth = 0),
  },
  {
    name: 'Blood Frenzy (lifesteal)',
    classKey: 'bloodlord',
    measure: signal.bloodLeech,
    mutate: (r) => void delete r.passive.mods.leech,
  },
  {
    name: 'Blood Frenzy (phase)',
    classKey: 'bloodlord',
    measure: signal.bloodFrenzy,
    mutate: (r) => delete r.passive.kind,
  },
  {
    name: 'Kinship (aura)',
    classKey: 'animist',
    measure: signal.kinshipAura,
    mutate: (r) => void (r.active2.auraAtkSpdMul = 0),
  },
  {
    name: 'Guardian Stance (armour)',
    classKey: 'paladin',
    measure: signal.guardianArmor,
    mutate: (r) => delete r.passive.kind,
  },
  {
    name: 'Guardian Stance (Wrath)',
    classKey: 'paladin',
    measure: signal.guardianWrath,
    mutate: (r) => delete r.passive.kind,
  },
  { name: 'Time Flow', classKey: 'time_lord', measure: signal.timeFlow, mutate: (r) => delete r.passive.kind },
];

describe('c006 — the harness fails when a passive loses its binding', () => {
  for (const k of KILLS) {
    it(`${k.classKey} ${k.name}: the signal is positive live and 0 once the binding is gone`, () => {
      expect(k.measure(content), 'signal was not positive against shipped data').toBeGreaterThan(0);
      expect(k.measure(contentWithout(k.classKey, k.mutate)), 'signal survived the binding being removed').toBe(0);
    });
  }

  it('mutating one class does not disturb another, so the control is not just "any edit fails"', () => {
    // Same rebuild-from-copy path, pointed at a different class: the
    // Swordsman's Bleeding has to survive the Pyro's passive being gutted.
    const noFlame = contentWithout('pyromancer', (r) => delete r.passive.kind);
    expect(signal.contagiousFlame(noFlame)).toBe(0);
    expect(signal.thousandCuts(noFlame)).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------- the census */

describe('c006 — every class is on trial', () => {
  it('all twelve passives have a case above, and a kill row under it', () => {
    // The failure this guards is a new class shipping with an untested
    // passive, which is exactly how the slot got to 12 rows and 0 tests. Keep
    // these in sync by adding a case, never by adding a key.
    const covered = [
      'swordsman',
      'plaguebringer',
      'engineer',
      'pyromancer',
      'archer',
      'necromancer',
      'cryomancer',
      'stormcaller',
      'bloodlord',
      'animist',
      'paladin',
      'time_lord',
    ];
    const authored = content.classes.classes.map((c) => c.key);
    expect([...authored].sort()).toEqual([...covered].sort());
    expect([...new Set(KILLS.map((k) => k.classKey))].sort()).toEqual([...covered].sort());
  });
});
