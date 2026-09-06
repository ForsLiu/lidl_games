/**
 * Enemy lifecycle: spawning, pathing, per-trait behaviour, damage and death.
 * Shared by both acts (SPEC 6); Act II applies a stat overlay at spawn time.
 */

import type { EnemyDef } from './content';
import { CORE_H, CORE_W, CORE_X, CORE_Y, GRID_H, GRID_W } from './grid';
import type { DamageTypeKey } from './damagetypes';
import { clamp, dcos, dist, dist2, dsin, normalize } from './math';
import { classLineBonus } from './progression';
import { damageTakenMul } from './stats';
import { tierCoreDamageMul, tierEnemyHpMul } from './tiers';
import { structureArmor } from './upgrades';
import { tickCooldown, type DotStack, type Enemy, type Structure } from './types';
import { World } from './world';

/**
 * Trait lookups run several times per enemy per tick, and `traits.includes`
 * is a string scan. Each def's traits are folded into a bitmask once and
 * cached on the enemy.
 */
export const TRAIT = {
  flying: 1 << 0,
  healer: 1 << 1,
  buffer: 1 << 2,
  empower: 1 << 3,
  stomp: 1 << 4,
  fireTrail: 1 << 5,
  ranged: 1 << 6,
  charges: 1 << 7,
  phases: 1 << 8,
  burrows: 1 << 9,
  splits: 1 << 10,
  explodes: 1 << 11,
  elite: 1 << 12,
  boss: 1 << 13,
  finalBoss: 1 << 14,
  slowImmune: 1 << 15,
  burnImmune: 1 << 16,
  pack: 1 << 17,
  structureBreaker: 1 << 18,
} as const;

const flagCache = new Map<number, number>();

export function traitFlags(def: EnemyDef): number {
  const hit = flagCache.get(def.id);
  if (hit !== undefined) return hit;
  let f = 0;
  for (const t of def.traits) {
    const bit = (TRAIT as Record<string, number>)[t];
    if (bit) f |= bit;
  }
  flagCache.set(def.id, f);
  return f;
}

export interface SpawnOptions {
  hpMul?: number;
  elite?: boolean;
  gate?: number;
  /** Skip the Act II stat overlay (used when Act I spawns during a wave). */
  overlay?: boolean;
}

export function makeEnemy(w: World, def: EnemyDef, x: number, y: number, opts: SpawnOptions = {}): Enemy {
  const flags = traitFlags(def);
  const overlay = opts.overlay ?? w.huntsWarden;
  const sp = w.content.spawns;
  let hp = def.hp * (opts.hpMul ?? 1) * (1 + w.mods.enemyHp);
  let speed = def.speed * (1 + w.mods.enemySpeed);
  if (overlay) {
    // SPEC 5.1's "HP x 0.6" overlay is relative to the statline Act I ended on,
    // not to the wave-1 roster: Nightfall is the climax, so its fodder must not
    // arrive 7x weaker than the wave the player just cleared. The carry is its
    // own data knob so Act I difficulty can be tuned without moving Act II.
    hp *= sp.hpOverlay * sp.actIICarry;
    speed *= sp.speedOverlay;
  }
  // p12b (§B): the tier ladder's HP rung, `tierEnemyHpPerStep^(tier-1)`,
  // applied to every enemy. Shipped at 4.0/step (x16 at T3), fitted to the
  // measured win-rate response rather than to §B's own ⚖ suggestion, which
  // had no teeth at all — see BALANCE.md "Tier ladder (p12b)". Before p12b only the final boss scaled with tier at all; ordinary
  // enemies differed between tiers solely through the random drafted
  // modifiers, which is why a tier read as a distribution rather than a rung.
  // Applied before the boss multipliers below so a boss takes both, the same
  // way it already takes `mods.enemyHp` and `mods.bossHp`.
  // p12c (§C): the roster-wide base multiplier, then p12b's tier rung. Order
  // is immaterial (both are scalars) but stated this way because they answer
  // different questions: `baseHpMul` sets how hard the game is at all, the
  // rung sets how much harder each tier is than the last.
  hp *= w.content.enemies.baseHpMul;
  hp *= tierEnemyHpMul(w.content, w.cfg.tier);
  const isBoss = (flags & TRAIT.boss) !== 0;
  if (isBoss) hp *= 1 + w.mods.bossHp;
  // SPEC 5.5: "15,000 HP x tier multiplier". Until p12b the only tier
  // multiplier the spec defined was SPEC 8.3's *reward* scale
  // (`tierRewardPerStep`), so the final boss borrowed that for want of a real
  // one — it was the single place `cfg.tier` scaled anything directly. §B
  // authors an actual tier ladder, so the boss now takes that same rung as
  // every other enemy (applied above) instead of a second, ad-hoc one: one
  // tier HP scaling in the sim, not two compounding.
  //
  // This is a **large, deliberate boss buff**, not a like-for-like swap: at
  // the shipped 4.0/step the rung is x16 at T3 where the borrowed reward
  // scale was x1.70, and x256 at T5 against x2.40. What that costs, measured
  // rather than assumed (qa-playtester, p12b): at T3 the scripted bot's
  // seed-1 run dies at wave 3 and **never reaches the boss at all**, which is
  // why G14's seed-1 mechanism case is deliberately pinned to T1 in
  // `tests/boss.test.ts` — the T3 run is contested by design, so it is not a
  // case that can assert one seed reaches a boss. The rung itself is pinned
  // there instead (`e3.maxHp` against `tierEnemyHpMul`). See BALANCE.md
  // "Tier ladder (p12b)"; logged in QUESTIONS.md as a §17-adjacent reading of
  // SPEC 5.5's "tier multiplier".

  const e: Enemy = {
    id: w.newId(),
    defId: def.id,
    def,
    x,
    y,
    hp,
    maxHp: hp,
    speed,
    radius: def.radius,
    gate: opts.gate ?? 0,
    elite: opts.elite ?? (flags & TRAIT.elite) !== 0,
    boss: isBoss,
    flying: (flags & TRAIT.flying) !== 0,
    fx: 0,
    fy: 1,
    armor: def.armor ?? 0,
    armorShred: 0,
    slowRemaining: 0,
    slowAmount: 0,
    frostRemaining: 0,
    frozenRemaining: 0,
    frostHitStacks: 0,
    dots: [],
    buffRemaining: 0,
    buffSpeed: 0,
    buffPower: 0,
    attackCooldown: 0,
    phaseRemaining: 0,
    phaseCooldown: def.phasePeriod ?? 0,
    ghosting: (flags & TRAIT.burrows) !== 0,
    submerged: (flags & TRAIT.burrows) !== 0,
    flags,
    sepX: 0,
    sepY: 0,
    chargeState: 0,
    chargeTimer: 0,
    chargeCooldown: def.chargeCooldown ?? 0,
    chargeVx: 0,
    chargeVy: 0,
    abilityTimer: 0,
    attackingStructure: 0,
    dead: false,
    bossPhase: 0,
    bossTimer: 0,
    bossAction: 0,
    bossUnreachableTime: 0,
    spawnedAt: w.tick,
    tauntRemaining: 0,
    tauntKind: TAUNT_NONE,
    tauntSourceId: 0,
    timeMarkStage: 0,
    timeMarkPendingSlow: false,
    timeMarkPendingSlowAmount: 0,
    timeMarkPendingSlowSeconds: 0,
    posHistory: [],
    posHistoryTimer: 0,
    timeLockZoneId: 0,
    atkSlowAmount: 0,
    atkSlowRemaining: 0,
  };
  return e;
}

/** `Enemy.tauntKind` values (Q120 ORDER 1) — exported so classes.ts can tag a taunted enemy. */
export const TAUNT_NONE = 0 as const;
export const TAUNT_WARDEN = 1 as const;
export const TAUNT_TOTEM = 2 as const;
export type TauntKind = typeof TAUNT_NONE | typeof TAUNT_WARDEN | typeof TAUNT_TOTEM;

export function spawnEnemy(w: World, key: string, x: number, y: number, opts: SpawnOptions = {}): Enemy | null {
  const def = w.content.enemyByKey.get(key);
  if (!def) return null;
  const e = makeEnemy(w, def, x, y, opts);
  w.addEnemy(e);
  if ((traitFlags(def) & TRAIT.pack) !== 0) {
    const n = (def.packSize ?? 1) - 1;
    for (let i = 0; i < n; i++) {
      const a = (i + 1) * 1.5;
      const ex = clamp(x + dcos(a) * 0.6, 1, GRID_W - 2);
      const ey = clamp(y + dsin(a) * 0.6, 1, GRID_H - 2);
      w.addEnemy(makeEnemy(w, def, ex, ey, opts));
    }
  }
  return e;
}

/* ------------------------------------------------------------------ damage */

/** SPEC-V3 §2: ailment damage ignores the Warden's armor too. */
export interface WardenDamageOptions {
  dot?: boolean;
  /**
   * fb152: the amount is a banked DoT interval whose accrual already skipped
   * every frame the Warden was untouchable (`wardenDamageBlocked`, run.ts), so
   * the i-frame check must not run again and swallow the whole bank.
   */
  preGated?: boolean;
}

export interface DamageOptions {
  fromX?: number;
  fromY?: number;
  /**
   * fb152: the amount already carries the three *time-varying* multipliers a
   * DoT tick takes (`kitPowerMul`, Frozen's `+30% damage taken`, the final
   * boss's damage-taken ramp), because a banked interval prices them **per
   * frame** as they were in force rather than once at the flush instant. Only
   * the cadence loops pass it; every direct hit still resolves them here.
   */
  preScaled?: boolean;
  /**
   * Bypass the *trait* mitigations — Bulwark's flat cut and Shellback's front
   * shield. Deliberately orthogonal to `dot`: a flag that bypassed both traits
   * and armor would make `dot` unobservable, since every caller that wants one
   * today also wants the other.
   */
  pure?: boolean;
  /**
   * Ailment damage, which SPEC-V3 §2 says ignores armor: "ailment (dot) damage
   * ignores armor unless stated". Burning's stated exception is its armor
   * *shred*, which lowers the target's armor for every other source rather
   * than piercing armor here.
   */
  dot?: boolean;
  /**
   * The §3 damage type this hit is, when the caller knows it. SPEC-FINAL §2:
   * lifesteal heals from **normal** damage only, so a typed non-normal hit
   * must not leech. Untyped direct damage — V2 weapons, the manual attack,
   * class actives — is armor-reduced basic damage, i.e. normal, and does.
   */
  type?: DamageTypeKey;
  /**
   * SPEC-FINAL §5.5: a Core-sourced attack (Carnivorous Plant's devour and
   * poison bullets, Corpse's execution) "is not scaled by character stats,
   * no lifesteal, but it does feed on-map damage effects." Every other
   * clause already holds for a plain `damageEnemy` call — it never routes
   * through `Stats`, and it already credits `damageByWeapon`/`damageTotal` —
   * so only lifesteal needs an explicit opt-out, since every other
   * normal-type hit during a VS wave earns it.
   */
  noLifesteal?: boolean;
}

/**
 * SPEC-V3 §2: the armor an enemy actually defends with — its sheet value less
 * whatever Burning has shredded off it. Uncapped below zero (floored at −100 by
 * `effectiveArmor`, QUESTIONS Q44).
 */
export function enemyArmor(e: Enemy): number {
  return e.armor - e.armorShred;
}

/** SPEC-V3 §3: Burning strips armor points. Shred lasts the target's lifetime. */
export function shredArmor(e: Enemy, points: number): void {
  e.armorShred += points;
}

/**
 * Run-long class-kit growth (BACKLOG p12a): kit damage — the five
 * `class_basic`/`class_active`/`class_active2`/`class_passive`/`class_summon`
 * `damageEnemy` sources — compounds with TD waves cleared (~x3.2 by wave 18)
 * so a kit doesn't stay anchored to its launch-day value against a curve
 * that keeps scaling. Applied after stats, at the one choke point every kit
 * damage source already funnels through (direct hits and DoT ticks alike,
 * since a stack's `source` string survives to tick time). Never applied to
 * tower damage, which has its own economy and its own `towerDamageMul`.
 */
export function kitPowerMul(w: World): number {
  return 1 + 0.12 * w.wavesCleared;
}

const CLASS_SOURCE_PREFIX = 'class_';

/**
 * Every `damageEnemy` source that *belongs to* the character's kit, for any
 * consumer splitting a damage tally into kit vs not — BALANCE.md's
 * own-kit-share target reads `damageByWeaponVs` this way.
 *
 * The `class_` prefix covers the five framework buckets
 * (`class_basic`/`class_active`/`class_active2`/`class_passive`/
 * `class_summon`); `spreading_plague` is the one kit source that does not
 * carry it, because the Plaguebringer's §4.2 death-triggered passive
 * dispatches from `killEnemy` under its own name so `describeSource` can
 * label it. Exported so a consumer classifies by this list rather than by
 * "not a tower key", which would sweep in Core effects
 * (`carnivorous_plant`, `corpse`, `time`) and the boss's own `warden_eater`
 * damage.
 *
 * **This is attribution, not scaling** — see `scalesWithKitPower` below for
 * why the two are deliberately not the same set.
 */
export function isKitSource(source: string): boolean {
  return source.startsWith(CLASS_SOURCE_PREFIX) || source === 'spreading_plague';
}

/**
 * The narrower question `kitPower` asks: is this damage's magnitude an
 * *authored kit number* that p12a's growth curve should compound?
 *
 * Every `class_` source is, so the two sets agree there. `spreading_plague`
 * is the deliberate exception, and it is a correctness fix rather than a
 * simplification (qa-playtester, p12a): the plague transfer's magnitude is
 * `dotOutstanding(e)` — the sum of *every* unfinished DoT on the corpse,
 * whoever applied it, including Venom Spore poison and Ember Brazier Burning.
 * Scaling that by `kitPower` would multiply tower-authored damage on the
 * hottest path the Plaguebringer has (its own `towerPassive` is
 * `towerPoisonDamage +0.1`, so the venom-spore build is the intended
 * synergy), breaking the invariant `kitPowerMul` states for itself. The kit's
 * own contribution to that pool was already scaled when it was applied, so
 * re-scaling the re-transmission would double-count it besides.
 */
function scalesWithKitPower(source: string): boolean {
  return source.startsWith(CLASS_SOURCE_PREFIX);
}

/**
 * The three multipliers on the damage path that **vary over time**, factored
 * out of `damageEnemy` so fb152's cadence loops can price a banked interval
 * per frame instead of once at the flush instant (qa-playtester: a Frozen
 * window that ended mid-interval otherwise vanished, and one that started
 * mid-interval billed the whole interval at +30%).
 *
 * - `kitPowerMul` (p12a) compounds with waves cleared, for `class_*` sources.
 * - SPEC-V3 §3 frozen: +30% damage taken. A status, not armor, so unlike
 *   `damageTakenMul` it applies to ailment damage as well.
 * - p10k (§9/§14 G1xG14): the Warden-Eater cracks under sustained pressure the
 *   same way it hits harder — a time-gated ramp on damage *taken*, not just
 *   dealt, so a fight already running long shortens on its own instead of
 *   needing a flat HP/timer cut that also pins the win rate near 100%. Applies
 *   to ailment damage too: a fight that outlasts the grace period is cracking
 *   everywhere, not just against direct hits. Gated on `TRAIT.finalBoss`, not
 *   the broader `e.boss` (qa-playtester p10k finding): `gatebreaker` also
 *   carries the `boss` trait without being the Warden-Eater, and a
 *   practice-mode spawn of it during Act II would otherwise pick up a ramp
 *   meant only for the one true final boss.
 */
export function dotVaryingMul(w: World, e: Enemy, source: string): number {
  let m = 1;
  if (scalesWithKitPower(source)) m *= kitPowerMul(w);
  if (e.frozenRemaining > 0) m *= statusDamageTakenMul(w, e);
  if ((e.flags & TRAIT.finalBoss) !== 0) m *= bossDamageTakenMul(w);
  return m;
}

/** Apply damage, returning the amount actually dealt. */
export function damageEnemy(
  w: World,
  e: Enemy,
  amount: number,
  source: string,
  opts: DamageOptions = {},
): number {
  if (e.dead || !Number.isFinite(amount) || amount <= 0) return 0;
  const def = e.def as EnemyDef;
  let dmg = amount;
  if (!opts.preScaled) dmg *= dotVaryingMul(w, e, source);

  if (!opts.dot) dmg *= damageTakenMul(enemyArmor(e));

  if (!opts.pure) {
    if (def.flatReduction) dmg *= 1 - def.flatReduction;
    if (def.frontReduction && opts.fromX !== undefined && opts.fromY !== undefined) {
      // Hit is "frontal" if the attacker sits in the hemisphere the enemy faces.
      const dx = opts.fromX - e.x;
      const dy = opts.fromY - e.y;
      if (dx * e.fx + dy * e.fy > 0) dmg *= 1 - def.frontReduction;
    }
  }

  const hpBeforeHit = e.hp;
  e.hp -= dmg;
  w.damageByWeapon[source] = (w.damageByWeapon[source] ?? 0) + dmg;
  // p12a: the VS-only half of the same tally, summed across every VS block
  // (see `World.damageByWeaponVs`). `huntsWarden` is the established
  // "we are in the VS half" predicate — the same one the Corpse line below
  // negates to mean "TD only" — so the two stay in step by construction.
  // One known asymmetry, deliberate: a DoT applied during a VS block that is
  // still ticking after the block flips back to TD is credited to the TD
  // side, because `tickDot` calls in here under whatever phase is current at
  // tick time. It is bounded by one stack's remaining duration per block.
  if (w.huntsWarden) w.damageByWeaponVs[source] = (w.damageByWeaponVs[source] ?? 0) + dmg;
  w.damageTotal += dmg;
  const dmgType = opts.type ?? 'normal';
  w.damageByType[dmgType] = (w.damageByType[dmgType] ?? 0) + dmg;
  // §5.5 Corpse: "1% of all damage dealt to enemies on the map is stored"
  // (TD only) — the one Core effect that has to hook every damage source
  // rather than fire its own attack, so it lives at this single choke point
  // instead of a per-tick poll like the other Cores' effects. This also
  // makes the designer note ("the execution counts as map damage, so 1% of
  // it flows back into the store") true for free: `updateCorpseExecute`
  // (cores.ts) spends the store by calling this same function.
  if (!w.huntsWarden && w.core.corpseStoreRatio > 0) w.corpseStore += dmg * w.core.corpseStoreRatio;
  // Ailment ticks do not spark. `World.emit` holds 512 events for the frame and
  // drops the rest, and a DoT bills every carrier every tick — Burning bills
  // every carrier's neighbours too, so a 350-strong burning horde is thousands
  // of events that would starve the buffer of shots, impacts and deaths. The
  // renderer already marks a burning or bleeding enemy from its `dots` list.
  // fb005: the §3 type rides along in the fx *kind* (`hit:normal`, `hit:electric`,
  // …) rather than a new field on `World.fx`'s shared `{k,x,y,a,b}` tuple, which
  // every other emit call site would otherwise have to grow a field to ignore.
  // `fx` is drained every tick and outside `hashWorld` (run.ts), so this is a
  // presentation-only change with no replay/determinism surface.
  if (!opts.dot) w.emit(`hit:${opts.type ?? 'normal'}`, e.x, e.y, dmg, e.id);

  // SPEC-FINAL §2: lifesteal "heals from normal damage dealt" — DoT ticks and
  // typed non-normal hits do not leech. The Bleeding Ring's §7 exception
  // ("lifesteal now also applies to Bleeding damage") is p7b's, not wired here.
  // Q91 ORDER (owner verdict, before P10): accrues from the target's actual
  // remaining HP, not the raw armor-reduced hit — otherwise a huge hit on a
  // near-dead enemy leeches as if the whole overkill amount had landed.
  // fb015 (§7) Bleeding Ring: "lifesteal now also applies to Bleeding damage"
  // — the one authored exception to the "normal damage only" rule above.
  // Bleeding is a DoT (`opts.dot` is always true for its ticks — `tickDot`
  // below), so the exception has to bypass the `!opts.dot` guard too, not
  // just the type check.
  const lifestealEligible =
    ((opts.type ?? 'normal') === 'normal' && !opts.dot) ||
    (w.derived.bleedLifesteal && opts.type === 'bleeding');
  if (w.derived.leech > 0 && w.huntsWarden && !opts.noLifesteal && lifestealEligible) {
    w.warden.leechAccumulator += Math.min(dmg, hpBeforeHit) * w.derived.leech;
  }

  if (e.hp <= 0) {
    // p7h: the killing blow's own type, not what dealt the most damage over
    // the enemy's life — matches §5.5's literal "poison kills" reading and
    // the fastest thing to compute at the one choke point that knows both.
    if (dmgType === 'poison') w.poisonKills++;
    killEnemy(w, e, source);
  }
  return dmg;
}

export function killEnemy(w: World, e: Enemy, source: string): void {
  if (e.dead) return;
  e.dead = true;
  w.deadEnemies = true;
  w.kills++;
  const def = e.def as EnemyDef;
  w.emit('death', e.x, e.y, def.id, 0);

  if (!w.huntsWarden) {
    const gold = Math.round(def.bounty * w.derived.goldFindMul + w.derived.goldPerKill);
    w.gold += gold;
    w.goldEarned += gold;
  } else {
    if (def.gem > 0) dropGem(w, e.x, e.y, def.gem);
  }

  if ((e.flags & TRAIT.splits) !== 0) {
    const child = w.content.enemyById.get(def.splitInto ?? 1);
    if (child) {
      for (let i = 0; i < (def.splitCount ?? 2); i++) {
        const off = i === 0 ? -0.4 : 0.4;
        w.addEnemy(
          makeEnemy(w, child, clamp(e.x + off, 1, GRID_W - 2), clamp(e.y + off, 1, GRID_H - 2), {
            overlay: w.huntsWarden,
            gate: e.gate,
          }),
        );
      }
    }
  }

  if ((e.flags & TRAIT.finalBoss) !== 0) {
    w.bossKilled = true;
    w.bossKillTime = w.act2Time;
  }

  // SPEC-FINAL §5.2 Fire Brazier VS special, §6.2: an inert tower's only
  // standing effect during a VS wave. Scoped to VS (`huntsWarden`) — Act I's
  // Ember Brazier already applies Burning through its live cone attack, and
  // this is a *second*, VS-only consequence of the same status.
  if (w.huntsWarden && e.dots.some((d) => d.type === 'burning')) {
    w.pendingBurningExplosions.push(e);
    drainBurningExplosions(w);
  }

  // §4.1 Plaguebringer passive Spreading Plague, G9's second half: "if any
  // DoT on an enemy is unfinished when it dies, deal the total unfinished
  // damage to the nearest enemy once." Scoped to the passive's own class
  // exactly like Thousand Cuts's on-hit Bleeding (`passiveOnHit`,
  // classes.ts) — TD and VS alike, since nothing in §4.1 restricts it the
  // way Wind Slash's "effective in VS" clause restricts that one. Enqueued
  // through the same push-then-drain worklist p2f built for Fire Brazier's
  // chained deaths rather than called directly: the transferred hit can
  // itself land a killing blow on an enemy that is *also* carrying
  // unfinished DoT, and a dense poisoned horde makes that chain long enough
  // to overflow a recursive call stack the same way Burning's did (Q119).
  if (e.dots.length > 0) {
    const cls = w.content.classByKey.get(w.cfg.classKey);
    if (cls && cls.passive.kind === 'spreading_plague') {
      w.pendingPlagueTransfers.push(e);
      drainPlagueTransfers(w);
    }
  }

  // §4.2 Necromancer/Cryomancer, p6d: two more death-triggered class passives,
  // scoped to their own class exactly the way Spreading Plague above is. One
  // lookup serves both.
  const kls = w.content.classByKey.get(w.cfg.classKey);
  if (kls) {
    if (kls.passive.kind === 'corpse_drop') {
      w.corpses.push({ id: w.newId(), x: e.x, y: e.y, remaining: kls.passive.corpseSeconds ?? 6 });
    } else if (kls.passive.kind === 'frost_touch' && e.frozenRemaining > 0) {
      // Enqueue-then-drain, same reason as the two queues above: a shatter can
      // kill a neighbour that is itself frozen, and a frost-locked cluster
      // chains that arbitrarily deep.
      w.pendingFrostShatters.push(e);
      drainFrostShatters(w, kls.passive.shatterRadius ?? 0, kls.passive.shatterDamage ?? 0);
    }
  }

  void source;
}

/** §4.2 Cryomancer: "frozen enemies shatter on death (r1.5, 20 normal ⚖)". */
function drainFrostShatters(w: World, radius: number, damage: number): void {
  if (w.drainingFrostShatters) return;
  if (radius <= 0 || damage <= 0) {
    w.pendingFrostShatters.length = 0;
    return;
  }
  w.drainingFrostShatters = true;
  try {
    let e: Enemy | undefined;
    while ((e = w.pendingFrostShatters.pop()) !== undefined) {
      for (const other of w.enemiesInRadius(e.x, e.y, radius).slice()) {
        if (other.dead || other === e) continue;
        damageEnemy(w, other, damage, 'class_passive', { pure: true, fromX: e.x, fromY: e.y });
      }
      w.emit('explosion', e.x, e.y, radius, 0);
    }
  } finally {
    w.pendingFrostShatters.length = 0;
    w.drainingFrostShatters = false;
  }
}

/**
 * p2f: a chain of Burning enemies dying inside each other's explosion radius
 * used to recurse directly (`killEnemy` -> `damageEnemy` ->
 * `triggerBurningExplode` -> `damageEnemy` -> ...), overflowing the call
 * stack at ~1500-1600 linked deaths. `killEnemy` now only enqueues; this
 * drains `w.pendingBurningExplosions` with a loop so the chain grows the
 * queue instead of the stack. The `drainingBurningExplosions` guard makes a
 * nested `killEnemy` call (from `damageEnemy` below) a no-op push rather than
 * a re-entrant drain, so there is exactly one active loop per tick.
 */
function drainBurningExplosions(w: World): void {
  if (w.drainingBurningExplosions) return;
  w.drainingBurningExplosions = true;
  try {
    let e: Enemy | undefined;
    while ((e = w.pendingBurningExplosions.pop()) !== undefined) {
      triggerBurningExplode(w, e);
    }
  } finally {
    // If triggerBurningExplode ever throws mid-drain, don't leave a stale
    // remainder for the next, unrelated Burning kill to replay.
    w.pendingBurningExplosions.length = 0;
    w.drainingBurningExplosions = false;
  }
}

/**
 * §4.1 Plaguebringer, p6c: same enqueue-then-drain shape as
 * `drainBurningExplosions` above, and for the same reason — the transfer's
 * own `damageEnemy` call can kill its target, which re-enters `killEnemy`
 * and, if that enemy is also carrying unfinished DoT, pushes another
 * transfer onto this same queue rather than recursing into this function.
 */
function drainPlagueTransfers(w: World): void {
  if (w.drainingPlagueTransfers) return;
  w.drainingPlagueTransfers = true;
  try {
    let e: Enemy | undefined;
    while ((e = w.pendingPlagueTransfers.pop()) !== undefined) {
      const total = dotOutstanding(e);
      if (total <= 0) continue;
      // p7a (§6.3) skill card "Wider Contagion": transfers to 1 extra
      // nearest enemy/rank, each taking the full unfinished total (not
      // split) — §4.1 names only one, so a rank-0 run picks exactly it.
      const targets = 1 + Math.round(classLineBonus(w));
      const struck = new Set<number>();
      for (let i = 0; i < targets; i++) {
        // Unbounded range, the same `Infinity` idiom `cores.ts`'s Carnivorous
        // Plant volley already uses for its own "unbounded range" clause
        // (Q113) — §4.1 names no radius for Spreading Plague's transfer.
        const target = w.nearestEnemy(e.x, e.y, Infinity, (t) => !struck.has(t.id));
        if (!target) break;
        struck.add(target.id);
        // `pure`/`dot`: the exact unfinished total, unmitigated by armor or a
        // trait reduction — the same convention Corpse's execute uses
        // (`p-core-d`) for "deal exactly this much damage."
        damageEnemy(w, target, total, 'spreading_plague', { pure: true, dot: true });
      }
    }
  } finally {
    w.pendingPlagueTransfers.length = 0;
    w.drainingPlagueTransfers = false;
  }
}

// Reused across every explosion in a chain rather than allocated per call —
// p2f means this now runs at chain-of-thousands scale in one VS wave. Safe to
// share: `drainBurningExplosions`'s guard means calls are sequential, never
// nested, so nothing iterates this array while a nested call refills it.
const burningExplodeScratch: Enemy[] = [];

/**
 * Reads whichever tower's `vsSpecial.kind === 'burningExplode'` is actually
 * built and alive, so the trigger stays generic over `/data` rather than
 * naming Ember Brazier — see `killEnemy`. Flat numbers, no character-stat
 * scaling: SPEC-FINAL §6.2 towers are inert, not wielded, so this is not
 * `powerMul`/`areaMul` territory the way `vswield.ts`'s formula is.
 */
function triggerBurningExplode(w: World, e: Enemy): void {
  for (const t of w.content.towers.towers) {
    if (t.vsSpecial.kind !== 'burningExplode') continue;
    if (!w.structures.some((s) => !s.dead && s.towerId === t.id)) continue;
    const { damage, radius } = t.vsSpecial;
    // `residualMul`: the drafted map modifier ("Petrified residuals -50%")
    // that scaled the V2 aura this special replaces still reaches it (Q98).
    const dmg = damage * w.derived.residualMul;
    const list = w.enemiesInRadius(e.x, e.y, radius, burningExplodeScratch);
    for (let i = 0; i < list.length; i++) {
      const other = list[i];
      if (other.dead) continue;
      damageEnemy(w, other, dmg, t.key, { fromX: e.x, fromY: e.y });
    }
    w.emit('explosion', e.x, e.y, radius, 0);
  }
}

export function dropGem(w: World, x: number, y: number, value: number): void {
  w.gems.push({
    id: w.newId(),
    x,
    y,
    value,
    vx: 0,
    vy: 0,
    life: w.content.spawns.gemLifetimeSeconds,
    dead: false,
  });
}

/* ---------------------------------------------------------------- ailments */

export function applySlow(w: World, e: Enemy, amount: number, duration: number): void {
  if ((e.flags & TRAIT.slowImmune) !== 0) return;
  const scaled = clamp(amount * w.derived.slowPotencyMul * w.derived.ailmentMul, 0, 0.9);
  if (scaled >= e.slowAmount || e.slowRemaining <= 0) {
    e.slowAmount = scaled;
    e.slowRemaining = Math.max(e.slowRemaining, duration);
  } else {
    e.slowRemaining = Math.max(e.slowRemaining, duration);
  }
}

/**
 * Generic attack-speed debuff, mirroring `applySlow` (move speed) — fb013
 * Time Lord *Time*'s present->future stage is its first source. Not itself
 * Time-Lord-specific: a future source can call this the same way `applySlow`
 * already serves every slow in the game, not just one class's.
 */
export function applyAtkSlow(w: World, e: Enemy, amount: number, duration: number): void {
  if ((e.flags & TRAIT.slowImmune) !== 0) return;
  const scaled = clamp(amount * w.derived.slowPotencyMul * w.derived.ailmentMul, 0, 0.9);
  if (scaled >= e.atkSlowAmount || e.atkSlowRemaining <= 0) {
    e.atkSlowAmount = scaled;
    e.atkSlowRemaining = Math.max(e.atkSlowRemaining, duration);
  } else {
    e.atkSlowRemaining = Math.max(e.atkSlowRemaining, duration);
  }
}

/**
 * SPEC-V3 §3 frost: −30% attack speed and move speed for 3 s. Both numbers and
 * the duration are read from data/damagetypes.json, never inlined.
 *
 * Frost and frozen are hard crowd control, so they honour `slowImmune` for the
 * same reason `applySlow` does — see QUESTIONS Q65.
 */
export function applyFrost(w: World, e: Enemy): void {
  if ((e.flags & TRAIT.slowImmune) !== 0) return;
  const st = w.content.damageTypes.statuses.frost;
  e.frostRemaining = Math.max(e.frostRemaining, st.duration);
}

/** SPEC-V3 §3 frozen: cannot move for 3 s and takes +30% damage. */
export function applyFrozen(w: World, e: Enemy): void {
  if ((e.flags & TRAIT.slowImmune) !== 0) return;
  const st = w.content.damageTypes.statuses.frozen;
  e.frozenRemaining = Math.max(e.frozenRemaining, st.duration);
}

/**
 * SPEC-V3 §3 replaced V2's chill stacks with frost/frozen, so "chilled" — the
 * condition the Frost Warden's trait keys off — now means any of the three.
 */
export function isChilled(e: Enemy): boolean {
  return e.slowRemaining > 0 || e.frostRemaining > 0 || e.frozenRemaining > 0;
}

/**
 * SPEC-FINAL §5.5 Time: "TD: enemies within r3 have attack and movement speed
 * -20%" — read off `w.core.tdSlowRadius`/`tdSlowPct` (0 for every Core but
 * Time, so this is a no-op check for everyone else) rather than a hardcoded
 * `coreKey === 'time'`, the same data-driven shape a tower's own aura uses.
 * TD only: enemies hunt the Warden, not the Core, once `huntsWarden` is true.
 */
function nearCoreSlowAura(w: World, e: Enemy): boolean {
  if (w.huntsWarden || w.core.tdSlowRadius <= 0) return false;
  if ((e.flags & TRAIT.slowImmune) !== 0) return false;
  const cx = clamp(e.x, CORE_X, CORE_X + CORE_W);
  const cy = clamp(e.y, CORE_Y, CORE_Y + CORE_H);
  return dist2(e.x, e.y, cx, cy) <= w.core.tdSlowRadius * w.core.tdSlowRadius;
}

/** Frost's attack-speed penalty, as a multiplier on every cooldown an enemy runs. */
export function enemyAttackSpeedMul(w: World, e: Enemy): number {
  let mul = e.frostRemaining > 0 ? 1 + (w.content.damageTypes.statuses.frost.attackSpeed ?? 0) : 1;
  if (e.atkSlowRemaining > 0) mul *= 1 - e.atkSlowAmount;
  if (nearCoreSlowAura(w, e)) mul *= 1 - w.core.tdSlowPct;
  return mul;
}

/** Frozen's +30% damage taken, as a multiplier. Applies to ailments too. */
export function statusDamageTakenMul(w: World, e: Enemy): number {
  if (e.frozenRemaining <= 0) return 1;
  return 1 + (w.content.damageTypes.statuses.frozen.damageTaken ?? 0);
}

/**
 * Whether a row simply cannot be applied to this enemy. Kept as one predicate
 * because Burning reaches an enemy by two routes — a direct application and a
 * neighbour caught in another victim's spread — and an immunity honoured on
 * only one of them is worse than none: the Cinderling is authored `burnImmune`
 * and fights inside the Ember Brazier's cone alongside husks that are not.
 *
 * p10b: the row states its own immunity trait (`damagetypes.json`'s
 * `immuneTrait`) instead of this function naming `'burning'`/`burnImmune`
 * itself, so a second DoT row can be made immunable from `/data` alone. The
 * trait name is resolved through the same `TRAIT` table `traitFlags` folds
 * `EnemyDef.traits` against; an unauthored or unknown trait name is simply
 * never carried by any enemy, same as any other typo'd trait string.
 */
function immuneToDot(w: World, e: Enemy, type: string): boolean {
  const trait = w.content.damageTypeByKey.get(type)?.immuneTrait;
  if (!trait) return false;
  const bit = (TRAIT as Record<string, number>)[trait];
  return bit !== undefined && (e.flags & bit) !== 0;
}

export interface DotOptions {
  /**
   * A V2-authored caller (the Venom Spore) states its own stack cap. Absent,
   * the taxonomy row's own `maxStacks` applies. Either way the row's own
   * `maxStacks` is the ceiling — an override may only tighten it, never exceed
   * it (SPEC-FINAL §3 states the cap per row; x001) — and the per-enemy perf
   * cap in damagetypes.json bounds the total across types.
   */
  maxStacks?: number;
}

/**
 * Burning is the one row with its own damage stat. Poison additionally reads
 * `towerPoisonDamageMul` (§4.1 Plaguebringer tower passive, p6c, Q119), but
 * only for a tower's own Act I attack — `!w.huntsWarden` plus `source`
 * resolving to a real tower key (`w.content.towerByKey`), the same "stays
 * Act I's" default `towerDamageMul`/`towerRangeMul` already carry (Wind
 * Slash's "effective in VS" is the one stated exception in this file, and
 * Miasma's row states no such clause). This leaves three things unboosted:
 * Poison Barrel (`source: 'class_active'`, not a tower at all), Carnivorous
 * Plant's poison bullets (`source: 'carnivorous_plant'`, a Core attack, not
 * a tower), and the Poison tower's own VS poison-trail special — which
 * *is* a tower effect but only ever fires while `huntsWarden` is true, so
 * the same Act-I-only default reads it out too (Q119 logs this as the one
 * genuine reach question the spec's plain "all towers +10% poison damage"
 * leaves open). The rest scale on ailment potency alone, exactly as their
 * V2 forms did.
 */
function dotPotency(w: World, type: string, source: string): number {
  if (type === 'burning') return w.derived.burnDamageMul * w.derived.ailmentMul;
  if (type === 'poison' && !w.huntsWarden && w.content.towerByKey.has(source)) {
    return w.derived.towerPoisonDamageMul * w.derived.ailmentMul;
  }
  return w.derived.ailmentMul;
}

/**
 * Which stack to give up when the shared per-enemy budget is full and a type
 * still under its own cap wants in. The most numerous type is the one hogging
 * the budget, and within it the stack with the least time left has the least
 * damage still owed, so it is the cheapest slot in the list.
 *
 * Two types never qualify. Not `arriving` itself: it is under its own cap by
 * construction, so the trade would be a no-op. And not a type that is no more
 * numerous than `arriving` already is — otherwise the hog evicts its victim
 * again on its very next application, and an enemy carrying 50 Bleeding would
 * strip a lone Burning back off inside one arrow interval. When nothing
 * qualifies, the arriving application is the one that pays: it belongs to the
 * type that is already holding the budget open.
 *
 * Every tie breaks on the lower index, which is application order —
 * deterministic, and hashed by A11.
 */
function evictionIndex(e: Enemy, arriving: string, arrivingLive: number): number {
  let best = -1;
  let bestCount = 0;
  for (let i = 0; i < e.dots.length; i++) {
    const d = e.dots[i];
    if (d.type === arriving) continue;
    let count = 0;
    for (const o of e.dots) if (o.type === d.type) count++;
    if (count <= arrivingLive) continue;
    if (count < bestCount) continue;
    if (count > bestCount || best < 0 || d.remaining < e.dots[best].remaining) {
      best = i;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Install one application of a SPEC-V3 §3 DoT row. The row owns the stacking
 * rule (`maxStacks` + `refresh`); the caller owns the magnitude, because a
 * tower authors its own dps and the row's `dps`/`ratio` is only the default
 * that `applyDamageType` passes in.
 */
export function applyDot(
  w: World,
  e: Enemy,
  type: string,
  dps: number,
  duration: number,
  source = type,
  opts: DotOptions = {},
): void {
  if (e.dead) return;
  const def = w.content.damageTypeByKey.get(type);
  if (!def || def.effect !== 'dot') return;
  if (immuneToDot(w, e, type)) return;
  if (duration <= 0) return;
  const scaled = dps * dotPotency(w, type, source);
  if (scaled <= 0) return;

  const cap = w.content.damageTypes.maxStacksPerEnemy;
  // SPEC-FINAL §3 states a cap per row ("Poison … cap 3 stacks"; "Toxic …
  // cap 3 stacks"), so a caller's override may only ever tighten it. Before
  // x001 an override was clamped to the shared 50-stack *budget* instead, which
  // let a call site hold 50 Poison stacks while `/data` said 3 — the cap lost
  // without anything in `/data` changing. Every shipped caller passes exactly
  // the row's own number, so this is a no-op on today's content by
  // construction; it is here to keep the hole shut while it is still empty.
  const rowCap = Math.min(def.maxStacks ?? 1, cap);
  const perType = Math.min(opts.maxStacks ?? rowCap, rowCap);
  let live = 0;
  let shortest = -1;
  for (let i = 0; i < e.dots.length; i++) {
    const d = e.dots[i];
    if (d.type !== type) continue;
    live++;
    if (shortest < 0 || d.remaining < e.dots[shortest].remaining) shortest = i;
  }

  // The per-enemy cap is shared across types: it exists so a 350-strong horde
  // cannot grow unbounded per-enemy arrays in the hot loop, and that budget is
  // one budget. Bleeding and Burning, whose own caps equal it (p10a), can each
  // reach it alone.
  if (live < perType) {
    if (e.dots.length < cap) {
      e.dots.push({ type, remaining: duration, dps: scaled, source, accTime: 0, accDamage: 0, accScaled: 0, accSource: source });
      return;
    }
    // A shared budget must not let one type *own* it. Bleeding or Burning can
    // each fill 50 slots by itself, and dropping the application here would
    // make a bleeding- or burning-saturated enemy permanently immune to
    // whatever type still needs a slot — for Burning arriving against a
    // Bleeding-saturated enemy that is the armour shred §3 designs as the way
    // armour gets broken — with nothing to see. So a type still under its own
    // cap takes a slot from the most numerous other type instead of being lost.
    const victim = evictionIndex(e, type, live);
    if (victim < 0) return;
    // The evicted stack's own bank dies with it: it belonged to a type that no
    // longer occupies this slot, and paying it here would credit the new type's
    // source with the old type's damage.
    e.dots[victim] = { type, remaining: duration, dps: scaled, source, accTime: 0, accDamage: 0, accScaled: 0, accSource: source };
    return;
  }
  if (shortest < 0) return;

  const d = e.dots[shortest];
  if (def.refresh === 'strongest') {
    // V2's original burn rule: the stronger application wins, and the longer
    // timer wins. No shipped row uses it after p10a flipped Burning to
    // per-application stacking (`refresh: 'shortest'`) — kept generic in the
    // engine per CLAUDE.md's "content is data" rule, for a future row that
    // wants refresh-over-stack.
    if (scaled >= d.dps) {
      d.dps = scaled;
      d.source = source;
    }
    d.remaining = Math.max(d.remaining, duration);
  } else {
    // V2's poison rule: overwrite the stack with the least time left.
    d.dps = scaled;
    d.source = source;
    d.remaining = duration;
  }
}

/** Live applications of one damage type on an enemy. */
export function dotStacks(e: Enemy, type: string): number {
  let n = 0;
  for (const d of e.dots) if (d.type === type) n++;
  return n;
}

/** Longest time left on any application of one damage type, or 0. */
export function dotRemaining(e: Enemy, type: string): number {
  let best = 0;
  for (const d of e.dots) if (d.type === type && d.remaining > best) best = d.remaining;
  return best;
}

/** Damage still owed by every live DoT on this enemy (SPEC-V3 §6's C10 reads it). */
export function dotOutstanding(e: Enemy): number {
  let total = 0;
  // fb152: `accDamage` is damage the stack has already accrued but not yet paid
  // out (it is waiting on the cadence), so it is owed exactly as much as the
  // time still on the clock is. Leaving it out would let a carrier die inside
  // its own tick interval with up to `dotTickInterval` of damage owed to
  // nobody — the one place the cadence could have quietly changed a total.
  for (const d of e.dots) if (d.remaining > 0 || d.accDamage > 0) total += d.accDamage + Math.max(d.dps * d.remaining, 0);
  return total;
}

/**
 * SPEC-V3 §3 riders that /data can hang off an attack: a status name, or a
 * damage type whose magnitude is its own flat `dps` rather than a share of the
 * hit that triggered it. A `ratio` row (Poison, Toxic) is *not* addressable
 * here — it has no meaning without a triggering damage, so `loadContent`
 * rejects one in an `onHit` list rather than letting it apply as a silent zero.
 */
export function applyOnHit(w: World, e: Enemy, key: string, source: string): void {
  // §4.2 Cryomancer, p6d: not a §3 type or status of its own — a bookkeeping
  // rider that only counts. It rides `onHit` because that is the one hook
  // every attack shape already fans out per struck enemy, which is exactly
  // what "an enemy hit 5 times while frosted" counts.
  if (key === 'frost_track') {
    if (e.frostRemaining > 0) {
      e.frostHitStacks++;
      const cls = w.content.classByKey.get(w.cfg.classKey);
      // p7a (§6.3) skill card "Brittle Frost": freeze needs 1 fewer hit/rank.
      const need = cls ? Math.max(1, (cls.passive.freezeHits ?? 5) - classLineBonus(w)) : 5;
      if (e.frostHitStacks >= need) {
        applyFrozen(w, e);
        e.frostHitStacks = 0;
      }
    } else {
      e.frostHitStacks = 0;
    }
    return;
  }
  if (key === 'frost') return applyFrost(w, e);
  if (key === 'frozen') return applyFrozen(w, e);
  const def = w.content.damageTypeByKey.get(key);
  if (!def || def.effect !== 'dot' || def.dps === undefined) return;
  applyDot(w, e, key, def.dps, def.duration!, source);
}

/** V2-shaped entry point kept for its callers: an authored burn *is* Burning. */
export function applyBurn(
  w: World,
  e: Enemy,
  dps: number,
  duration: number,
  source = 'burn',
): void {
  applyDot(w, e, 'burning', dps, duration, source);
}

export function applyPoison(
  w: World,
  e: Enemy,
  dps: number,
  duration: number,
  maxStacks: number,
  source = 'poison',
): void {
  applyDot(w, e, 'poison', dps, duration, source, { maxStacks });
}

const dotScratch: Enemy[] = [];

/**
 * One DoT stack's *direct* damage and armor shred for one tick, against the
 * enemy actually carrying it. Splash (Burning's radius) is handled separately
 * by `tickDots`/`tickDotSplash`, aggregated once per type rather than once
 * per stack — see that function's comment for why.
 */
/**
 * fb152: `banked` is the damage accrued since this stack's last tick and
 * `bankedTime` the seconds it accrued over — not one frame's worth. The two are
 * carried separately because a refresh can rewrite `dps` mid-window, and the
 * per-second effects (armor shred) must price the *time*, not the damage.
 */
function tickDot(w: World, e: Enemy, d: DotStack, banked: number, bankedTime: number, source: string): void {
  const def = w.content.damageTypeByKey.get(d.type);
  const shred = def?.armorShredPerSecond ?? 0;
  if (shred > 0) shredArmor(e, shred * bankedTime);
  // `d.type` is a validated damagetypes key by the time a stack exists.
  const dotType = d.type as DamageTypeKey;
  damageEnemy(w, e, banked, source, { pure: true, dot: true, type: dotType, preScaled: true });
}

interface SplashAccum {
  source: string;
  /** fb152: banked *damage* for this flush, not a per-second rate. */
  damage: number;
  shred: number;
  radius: number;
}

/**
 * Rows with a `radius` — Burning — land their damage *and* armor shred on
 * everything around the victim (SPEC-V3 §3), once per type per enemy per
 * tick with every live same-type stack's magnitude summed in. p10a's flip to
 * per-application stacking let a single enemy carry dozens of concurrent
 * Burning stacks (a Brazier corridor, `interval: 0.25` vs `duration: 3`, can
 * reach a dozen from one tower alone); querying+splashing once *per stack*
 * would have turned that into a 12-50x per-tick neighbour-query and
 * neighbour-damage multiplier that nothing in p10a measured (code review).
 * The spread carries the effects, not the application: a stack that
 * re-applied itself to its neighbours would cascade across the horde.
 */
function tickDotSplash(w: World, e: Enemy, type: DamageTypeKey, acc: SplashAccum): void {
  // `burnSpread` is a point bonus on the radius; `area` scales every effect (§2).
  const r = (acc.radius + w.derived.burnSpread) * w.derived.areaMul;
  const list = w.enemiesInRadius(e.x, e.y, r, dotScratch);
  for (let i = 0; i < list.length; i++) {
    const n = list[i];
    if (n === e || n.dead) continue;
    // The spread carries the row's effects, so it carries the row's immunity.
    if (immuneToDot(w, n, type)) continue;
    if (acc.shred > 0) shredArmor(n, acc.shred);
    damageEnemy(w, n, acc.damage, acc.source, { pure: true, dot: true, type });
  }
}

// Reused across every enemy/tick, same reasoning as `dotScratch`: a
// 350-strong horde with Burning live on most of it would otherwise allocate
// a fresh Map per enemy per frame in the hot loop.
const splashScratch = new Map<string, SplashAccum>();

/**
 * fb152: 15 frames of `1/60` sum to 0.24999999999999994, not 0.25. Without a
 * tolerance every stack would wait a 16th frame, drifting the cadence and
 * costing a 4 s DoT its 16th tick. Exported because `tickWardenDots` (run.ts)
 * runs the same cadence and the two must not drift apart.
 */
export const DOT_TICK_EPS = 1e-9;

function tickDots(w: World, e: Enemy, dt: number): void {
  // b049: same "the defeat slow-mo beat is a frozen moment" rule already
  // enforced for wielded attacks/summons/passives/VS specials
  // (b020/b046/b047/b048) — DoT ticking is itself a damage-dealing
  // sub-routine (both the direct hit on the carrier and Burning's
  // neighbour splash), just data-driven off the damage type rather than
  // gated to one source, so it must freeze the same way regardless of who
  // applied the stack.
  if (w.dying) return;
  if (e.dots.length === 0) return;
  let expired = false;
  // Indexed over a snapshot length, not `for..of`: a tick can kill a neighbour,
  // and SPEC-V3 §6's C10 hands a dying enemy's unfinished DoT to the nearest
  // enemy — which can be this one, mid-loop. A stack that arrives during the
  // loop must wait for the next frame rather than be ticked on the frame it
  // landed, and the eviction path can overwrite the entry the loop is on.
  const n = e.dots.length;
  const interval = w.content.damageTypes.dotTickInterval;
  splashScratch.clear();
  for (let i = 0; i < n; i++) {
    // A tick can kill the carrier through a neighbour splash; nothing after
    // that point on this frame ticks, accrues, or splashes (this check used to
    // sit at the foot of the loop, where the fb152 `continue` paths would have
    // skipped it).
    if (e.dead) break;
    const d = e.dots[i];
    // The tick is clipped to the time actually left, not skipped when the stack
    // runs out mid-frame. §3 states each row as a *total* — 120% over 3 s — and
    // paying only whole frames delivered that total minus one frame, which at a
    // 9 s Toxic is a visible 0.2% short and at a 0.1 s stack would be all of it.
    const step = Math.min(dt, d.remaining);
    d.remaining -= dt;
    const dead = d.remaining <= 0;
    if (dead) expired = true;
    if (step > 0) {
      const frame = d.dps * step;
      d.accTime += step;
      d.accDamage += frame;
      // Priced per frame, not at the flush: a Frozen window that opens or
      // closes inside an interval bills exactly the seconds it covered.
      d.accScaled += frame * dotVaryingMul(w, e, d.source);
    }
    // fb152: pay at most once per `dotTickInterval` per stack instead of once
    // per frame. The bank is flushed early only when the stack ends, which is
    // what keeps the total exact — the final partial interval is clipped and
    // paid, never dropped. EPS absorbs the float drift of summing 1/60 fifteen
    // times, which lands a hair under 0.25 and would otherwise cost every
    // stack one whole interval of latency.
    if (d.accTime < interval - DOT_TICK_EPS && !dead) continue;
    if (d.accTime <= 0) continue;
    const banked = d.accDamage;
    const bankedScaled = d.accScaled;
    const bankedTime = d.accTime;
    // Ailment damage is booked against the weapon that applied it, so A5 sees
    // the true share of each weapon rather than a generic "burn" bucket — and
    // fb152 (code review, Minor 3) books the *bank* against whoever was
    // applying while it accrued, not against whoever refreshed the stack in
    // the meantime. `applyDot`'s refresh path rewrites `d.source` mid-window,
    // which without this would hand up to one interval of one weapon's damage
    // to another weapon's share.
    const attribution = d.accSource;
    d.accDamage = 0;
    d.accScaled = 0;
    d.accTime = 0;
    d.accSource = d.source;
    tickDot(w, e, d, bankedScaled, bankedTime, attribution);
    const def = w.content.damageTypeByKey.get(d.type);
    const radius = def?.radius ?? 0;
    if (radius > 0) {
      const shred = def?.armorShredPerSecond ?? 0;
      const acc = splashScratch.get(d.type);
      if (acc) {
        acc.damage += banked;
        acc.shred += shred * bankedTime;
      } else {
        // First same-type stack this tick names the splash's attribution;
        // every stack shares one row's shred/radius by construction.
        splashScratch.set(d.type, { source: attribution, damage: banked, shred: shred * bankedTime, radius });
      }
    }
  }
  // fb152 (code review, Major 1): flushed **unconditionally**, including when
  // the carrier died on this very tick. The bank was accrued while it was
  // alive, and under the old per-frame payment the `!e.dead` guard threw away
  // one frame; at a 0.25 s cadence it threw away up to a whole interval, and a
  // Burning carrier dying on a burning tick is the common case, not a corner
  // (measured before the fix: a 20 dps / 3 s burn splashing 60 onto a
  // neighbour paid 55 when the carrier died on the last tick and 20 of 25 when
  // it died at 1.25 s). `tickDotSplash` skips dead neighbours itself, and it
  // reads the carrier only for its position, which a corpse still has.
  for (const [type, acc] of splashScratch) tickDotSplash(w, e, type as DamageTypeKey, acc);
  if (expired) e.dots = e.dots.filter((d) => d.remaining > 0);
}

function tickTimers(w: World, e: Enemy, dt: number): void {
  // Frost is −30% attack speed on the contact and ranged attacks that run off
  // `attackCooldown`, applied here rather than at each site that assigns one.
  // The trait abilities on `abilityTimer` — stomp, heal, buff, fire trail — are
  // deliberately not slowed; §3 says "attack speed" and nothing authors frost
  // yet, so widening it is m20b's call with a number to measure (QUESTIONS Q71).
  if (e.attackCooldown > 0) e.attackCooldown = tickCooldown(e.attackCooldown, dt * enemyAttackSpeedMul(w, e));
  if (e.slowRemaining > 0) {
    e.slowRemaining -= dt;
    if (e.slowRemaining <= 0) e.slowAmount = 0;
  }
  if (e.frostRemaining > 0) e.frostRemaining -= dt;
  if (e.frozenRemaining > 0) e.frozenRemaining -= dt;
  if (e.atkSlowRemaining > 0) {
    e.atkSlowRemaining -= dt;
    if (e.atkSlowRemaining <= 0) e.atkSlowAmount = 0;
  }
  // fb013 Time Lord *Time*: the present->future stage's -20% atk/move slow,
  // deferred while this enemy was stunned/frozen at the moment it would have
  // applied — "stunned" is read as `frozenRemaining > 0` (the sim's one hard
  // CC), the same reuse `advanceTimeMark` (classes.ts) makes for "stun-locks".
  if (e.timeMarkPendingSlow && e.frozenRemaining <= 0) {
    e.timeMarkPendingSlow = false;
    applySlow(w, e, e.timeMarkPendingSlowAmount, e.timeMarkPendingSlowSeconds);
    applyAtkSlow(w, e, e.timeMarkPendingSlowAmount, e.timeMarkPendingSlowSeconds);
  }
  if (e.tauntRemaining > 0) {
    e.tauntRemaining -= dt;
    if (e.tauntRemaining <= 0) {
      e.tauntRemaining = 0;
      e.tauntKind = TAUNT_NONE;
    }
  }
  tickDots(w, e, dt);
  if (e.dead) return;
  if (e.buffRemaining > 0) {
    e.buffRemaining -= dt;
    if (e.buffRemaining <= 0) {
      e.buffSpeed = 0;
      e.buffPower = 0;
    }
  }
}

export function effectiveSpeed(w: World, e: Enemy): number {
  if (e.frozenRemaining > 0) return 0;
  const st = w.content.damageTypes.statuses.frost;
  const frost = e.frostRemaining > 0 ? 1 + (st.moveSpeed ?? 0) : 1;
  const coreSlow = nearCoreSlowAura(w, e) ? 1 - w.core.tdSlowPct : 1;
  return e.speed * (1 - e.slowAmount) * (1 + e.buffSpeed) * frost * coreSlow;
}

/* ----------------------------------------------------------------- update */

const scratch: Enemy[] = [];

export function updateEnemies(w: World, dt: number): void {
  const sp = w.content.spawns;
  const target = w.targetPoint();
  const huntWarden = w.huntsWarden;

  for (const e of w.enemies) {
    if (e.dead) continue;
    const def = e.def as EnemyDef;

    tickTimers(w, e, dt);
    if (e.dead) continue;

    updatePhasing(w, e, def, dt);
    updateAbilities(w, e, def, dt, huntWarden);
    if (e.dead) continue;

    // The final boss has its own script (M6); it falls through to normal
    // chase movement whenever the script has nothing to say this tick.
    if ((e.flags & TRAIT.finalBoss) !== 0 && bossUpdate(w, e, dt)) continue;
    if (huntWarden) updateGroundUnreachable(w, e, dt, target);

    const taunted = tauntTarget(w, e);
    moveEnemy(w, e, def, dt, taunted ?? target, taunted !== null);

    // Reaching the objective.
    if (huntWarden) {
      const reach = e.radius + sp.contactPadding;
      if (dist2(e.x, e.y, w.warden.x, w.warden.y) <= reach * reach) {
        contactWarden(w, e, def);
      }
    } else if (w.grid.tile[w.grid.idx(Math.floor(e.x), Math.floor(e.y))] === 3) {
      leakIntoCore(w, e, def);
    }
  }
}

function updatePhasing(w: World, e: Enemy, def: EnemyDef, dt: number): void {
  if ((e.flags & TRAIT.burrows) !== 0) {
    // SPEC 6 #12: a Burrower tunnels *under* the field and surfaces near its
    // target. Underground it cannot be shot, which is what makes it the
    // counter to a turtle (SPEC A7).
    const target = w.targetPoint();
    const surfaceAt = w.content.spawns.burrowSurfaceDistance;
    if (e.submerged && dist2(e.x, e.y, target.x, target.y) <= surfaceAt * surfaceAt) {
      e.submerged = false;
      e.ghosting = false;
      unstick(w, e);
      w.emit('surface', e.x, e.y, 0, 0);
    }
    e.ghosting = e.submerged;
    return;
  }
  if ((e.flags & TRAIT.phases) === 0) return;
  if (e.phaseRemaining > 0) {
    e.phaseRemaining -= dt;
    e.ghosting = true;
    if (e.phaseRemaining <= 0) {
      e.ghosting = false;
      e.phaseCooldown = def.phasePeriod ?? 6;
      // Never surface inside terrain: nudge to the nearest open tile.
      unstick(w, e);
    }
  } else {
    e.phaseCooldown -= dt;
    if (e.phaseCooldown <= 0) {
      e.phaseRemaining = def.phaseDuration ?? 2;
      e.ghosting = true;
    }
  }
}

/**
 * fb077 (SPEC-FINAL §10.5, code review finding): real generated terrain can
 * hard-seal a ground walker away from the Warden's current Act II position —
 * `navFieldFor(false)` uses `Grid`'s 'blocked' mode (terrain-respecting), not
 * the breach-cost mode Act I's Core-facing field uses, so unlike a
 * structure-sealed pocket (which `flowAim`'s no-route fallback already
 * handles by beelining into and chewing whatever structure it hits) a
 * terrain-sealed pocket has nothing chewable in the way at all: the enemy
 * beelines into raw rock forever and the run never resolves. `boss.ts`'s
 * `updateUnreachable` already solves the identical problem for the final
 * boss (attack the nearest structure/Core after `UNREACHABLE_THRESHOLD`
 * seconds unreachable) — this reuses the same escape hatch
 * `TRAIT.burrows`/`TRAIT.phases` enemies already use for exactly this
 * purpose (`updatePhasing`, above): `e.ghosting = true` — the walker
 * physically phases through terrain (like a Burrower/Wraith, SPEC-FINAL §10)
 * until it reaches the Warden. No new damage numbers, no balance change:
 * this only ever fires on a seed genuinely capable of stalling the run.
 *
 * Excluded: the final boss (its own script already covers this, with a
 * damage-escalation contract that would be wrong to duplicate here) and
 * `TRAIT.burrows`/`TRAIT.phases` enemies (already ghost on their own cycle,
 * `updatePhasing` owns their `e.ghosting`).
 *
 * qa-playtester finding (post-close verification): the reachability check
 * above cannot tell a structure-sealed pocket from a terrain-sealed one —
 * both report no route, since Act II's field stays purely physical (no
 * breach-cost mode, see `Grid.computeField`'s own doc comment) — so a live
 * wall the enemy hadn't yet reached (or was already chewing) tripped the
 * same 6s timer and ghosted straight through an undamaged structure. Fixed
 * by checking `beelineHitsStructure`, below: when no route exists, `flowAim`
 * falls back to beelining straight at the raw target (this same function's
 * own logic), so whatever the walker's beeline hits first tells us whether
 * there is anything to chew. A distance-based "is a structure nearby"
 * heuristic was tried first and rejected: it still ghosted before contact
 * whenever the wall was farther away than `speed * THRESHOLD` (true even of
 * this bug's own original repro, a 12-tile approach at Husk speed), so the
 * check has to reach all the way to the target, not just some fixed radius.
 */
const GROUND_UNREACHABLE_THRESHOLD = 6; // mirrors boss.ts's UNREACHABLE_THRESHOLD

/**
 * Walks the straight line from `e` to `target` in half-tile steps and
 * reports whether the first impassable tile it meets is a live structure
 * (chewable, per `moveEnemy`'s own bump-and-breach rule) rather than terrain
 * or the border (nothing to chew). No route existing means this is exactly
 * the line `flowAim`'s no-route fallback will actually walk.
 */
function beelineHitsStructure(w: World, e: Enemy, target: { x: number; y: number }): boolean {
  const dx = target.x - e.x;
  const dy = target.y - e.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 1e-6) return false;
  const steps = Math.ceil(d * 2);
  const stepX = dx / steps;
  const stepY = dy / steps;
  let x = e.x;
  let y = e.y;
  for (let i = 0; i < steps; i++) {
    x += stepX;
    y += stepY;
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (!w.grid.inBounds(tx, ty)) return false;
    if (w.grid.passable(tx, ty)) continue;
    return w.structureAt(tx, ty) !== null;
  }
  return false;
}

function updateGroundUnreachable(w: World, e: Enemy, dt: number, target: { x: number; y: number }): void {
  if ((e.flags & (TRAIT.finalBoss | TRAIT.burrows | TRAIT.phases)) !== 0) return;
  if (e.flying || e.ghosting) return;
  const tx = Math.floor(e.x);
  const ty = Math.floor(e.y);
  const reachable =
    !w.grid.inBounds(tx, ty) ||
    (tx === Math.floor(w.warden.x) && ty === Math.floor(w.warden.y)) ||
    w.navFieldFor(false).next[ty * GRID_W + tx] >= 0;
  if (reachable || beelineHitsStructure(w, e, target)) {
    e.bossUnreachableTime = 0;
    return;
  }
  e.bossUnreachableTime += dt;
  if (e.bossUnreachableTime >= GROUND_UNREACHABLE_THRESHOLD) e.ghosting = true;
}

function unstick(w: World, e: Enemy): void {
  const tx = Math.floor(e.x);
  const ty = Math.floor(e.y);
  if (w.grid.passable(tx, ty)) return;
  let best: [number, number] | null = null;
  let bestD = Infinity;
  for (let r = 1; r <= 3 && !best; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const nx = tx + dx;
        const ny = ty + dy;
        if (!w.grid.passable(nx, ny)) continue;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = [nx, ny];
        }
      }
    }
  }
  if (best) {
    e.x = best[0] + 0.5;
    e.y = best[1] + 0.5;
  }
}

function updateAbilities(w: World, e: Enemy, def: EnemyDef, dt: number, act2: boolean): void {
  if (w.dying) return;
  if ((e.flags & TRAIT.healer) !== 0) {
    e.abilityTimer -= dt;
    if (e.abilityTimer <= 0) {
      e.abilityTimer = 0.5;
      const r = def.healRadius ?? 3;
      // fb153a: the fallback is in *authored* units like the field it stands in
      // for, so it takes the same `numberScale` the authored value already took
      // at load — otherwise an enemy that omits `healRate` would heal at the
      // pre-rescale magnitude.
      const heal = (def.healRate ?? 8 * w.content.modifiers.numberScale) * 0.5;
      w.enemiesInRadius(e.x, e.y, r, scratch);
      for (const o of scratch) {
        if (o.id === e.id || o.dead) continue;
        o.hp = Math.min(o.maxHp, o.hp + heal);
      }
      w.emit('heal', e.x, e.y, r, 0);
    }
  }

  if ((e.flags & (TRAIT.buffer | TRAIT.empower)) !== 0) {
    e.abilityTimer -= dt;
    if (e.abilityTimer <= 0) {
      e.abilityTimer = 0.5;
      const r = def.buffRadius ?? 3;
      w.enemiesInRadius(e.x, e.y, r, scratch);
      for (const o of scratch) {
        if (o.id === e.id || o.dead) continue;
        o.buffRemaining = 1.0;
        o.buffSpeed = def.buffSpeed ?? 0;
        o.buffPower = def.buffPower ?? 0;
      }
    }
  }

  if ((e.flags & TRAIT.stomp) !== 0) {
    e.abilityTimer -= dt;
    if (e.abilityTimer <= 0) {
      e.abilityTimer = def.stompInterval ?? 4;
      const r = def.stompRadius ?? 2;
      w.emit('stomp', e.x, e.y, r, 0);
      if (dist2(e.x, e.y, w.warden.x, w.warden.y) <= r * r) {
        damageWarden(w, def.stompDamage ?? 25 * w.content.modifiers.numberScale);
      }
      for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
        for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
          const s = w.structureAt(Math.floor(e.x) + dx, Math.floor(e.y) + dy);
          if (s && dist(e.x, e.y, s.tx + 0.5, s.ty + 0.5) <= r) {
            damageStructure(w, s, (def.stompDamage ?? 25 * w.content.modifiers.numberScale) * 2);
          }
        }
      }
    }
  }

  if ((e.flags & TRAIT.fireTrail) !== 0 && act2) {
    e.abilityTimer -= dt;
    if (e.abilityTimer <= 0) {
      e.abilityTimer = 0.4;
      w.areas.push({
        id: w.newId(),
        x: e.x,
        y: e.y,
        radius: def.trailRadius ?? 0.6,
        dps: def.trailDps ?? 6 * w.content.modifiers.numberScale,
        remaining: 3,
        type: 'enemyFire',
        source: 'cinderling',
        acc: 0,
        dead: false,
      });
    }
  }

  if ((e.flags & TRAIT.ranged) !== 0) {
    const range = def.attackRange ?? 4;
    if (e.attackCooldown <= 0) {
      // Spitters harass the Warden when in range, otherwise chew on structures.
      if (dist2(e.x, e.y, w.warden.x, w.warden.y) <= range * range) {
        e.attackCooldown = def.attackInterval ?? 2;
        damageWarden(w, def.attackDamage ?? 6 * w.content.modifiers.numberScale);
        w.emit('spit', e.x, e.y, w.warden.x, w.warden.y);
      } else if (!act2) {
        const s = nearestStructureWithin(w, e.x, e.y, range);
        if (s) {
          e.attackCooldown = def.attackInterval ?? 2;
          damageStructure(w, s, def.attackDamage ?? 6 * w.content.modifiers.numberScale);
          w.emit('spit', e.x, e.y, s.tx + 0.5, s.ty + 0.5);
        }
      }
    }
  }

  if ((e.flags & TRAIT.charges) !== 0) {
    if (e.chargeState === 0) {
      e.chargeCooldown -= dt;
      const tgt = w.huntsWarden ? w.warden : null;
      if (e.chargeCooldown <= 0 && tgt && dist2(e.x, e.y, tgt.x, tgt.y) <= 64) {
        e.chargeState = 1;
        e.chargeTimer = def.chargeWindup ?? 1;
        const n = normalize(tgt.x - e.x, tgt.y - e.y);
        e.chargeVx = n.x;
        e.chargeVy = n.y;
      }
    } else if (e.chargeState === 1) {
      e.chargeTimer -= dt;
      if (e.chargeTimer <= 0) {
        e.chargeState = 2;
        e.chargeTimer = def.chargeDuration ?? 1.2;
        w.emit('charge', e.x, e.y, e.chargeVx, e.chargeVy);
      }
    } else {
      e.chargeTimer -= dt;
      if (e.chargeTimer <= 0) {
        e.chargeState = 0;
        e.chargeCooldown = def.chargeCooldown ?? 5;
      }
    }
  }
}

function nearestStructureWithin(w: World, x: number, y: number, range: number): Structure | null {
  let best: Structure | null = null;
  let bestD = range * range;
  for (const s of w.structures) {
    if (s.dead) continue;
    const d = dist2(x, y, s.tx + 0.5, s.ty + 0.5);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

/* --------------------------------------------------------------- movement */

/**
 * Movement runs for every enemy every tick, so it is written without
 * allocating: directions come back through these module-level scalars rather
 * than through freshly built vectors.
 */
let outX = 0;
let outY = 0;

/**
 * What the last `flowAim` said about this enemy's route, read by the bump
 * handler below. `aimHadStep` is false when the field had no answer (the
 * beeline fallback — an enclosed Act II pocket); `aimBreach` is true when the
 * field's next tile is a structure, i.e. the route *is* a breach (§10).
 */
let aimHadStep = false;
let aimBreach = false;

function setNormalized(x: number, y: number): void {
  const l = Math.sqrt(x * x + y * y);
  if (l === 0) {
    outX = 0;
    outY = 0;
    return;
  }
  outX = x / l;
  outY = y / l;
}

/**
 * Resolves a taunted enemy's overridden pathing destination (Q120 ORDER 1):
 * the Warden's live position for Clarion Taunt, or the Animist totem's live
 * position for Recall Totem — both may move, so this is read fresh every
 * tick rather than snapshotted at taunt time. Returns null once the taunt
 * has lapsed or (for a totem taunt) the totem it named is already gone, so
 * the caller falls back to the normal Core/Warden target.
 *
 * qa-playtester finding (Q120 ORDER 1, post-review): a Clarion Taunt tag
 * during VS resolves to the *same point* `w.targetPoint()` already gives
 * every enemy (`huntsWarden` true), but the beeline branch this return value
 * drives walks a straight line instead of `flowAim`'s routed flow field —
 * genuinely the same destination, a genuinely different (and worse, since it
 * can snag on a persisted Act I wall) path to it. In TD, `huntsWarden` is
 * false and the Warden is a real diversion away from the Core, so the
 * override still applies there.
 */
export function tauntTarget(w: World, e: Enemy): { x: number; y: number } | null {
  if (e.tauntRemaining <= 0) return null;
  if (e.tauntKind === TAUNT_WARDEN) return w.huntsWarden ? null : { x: w.warden.x, y: w.warden.y };
  if (e.tauntKind === TAUNT_TOTEM) {
    // Matched by the specific summon that tagged this enemy, not "any live
    // totem" (qa-playtester finding): a totem replaced mid-tag (a fresh cast
    // before the old one's own lifetime ends) must not snap a leftover tag
    // onto the new totem's position.
    const totem = w.classSummons.find((s) => s.id === e.tauntSourceId && s.kind === 'animist_totem');
    return totem ? { x: totem.x, y: totem.y } : null;
  }
  return null;
}

function moveEnemy(
  w: World,
  e: Enemy,
  def: EnemyDef,
  dt: number,
  target: { x: number; y: number },
  beeline: boolean,
): void {
  let speed = effectiveSpeed(w, e);
  let dx: number;
  let dy: number;

  // SPEC-V3 §3 frozen: "cannot move". Checked here and not only through
  // `effectiveSpeed`, because a charging enemy flies on `chargeSpeed` instead.
  if (e.frozenRemaining > 0) return;
  if (e.chargeState === 1) return; // winding up: rooted
  // Chargers and other non-field movers keep the old any-bump chew rule.
  aimHadStep = false;
  aimBreach = false;
  if (e.chargeState === 2) {
    speed = def.chargeSpeed ?? 5;
    dx = e.chargeVx;
    dy = e.chargeVy;
  } else if (e.flying || e.ghosting) {
    setNormalized(target.x - e.x, target.y - e.y);
    dx = outX;
    dy = outY;
  } else if (beeline) {
    // A taunted ground enemy beelines at the (already-resolved-live) taunting
    // entity instead of following the Core/Warden flow field (Q120 ORDER 1)
    // — the field has no route to an arbitrary totem, and this reuses the
    // flying/ghosting beeline math above rather than building a second flow
    // field toward an arbitrary point. Unlike that fallback, this walker
    // *does* have a real answer (a straight line), not "no route exists" —
    // `aimHadStep` is left true so it does NOT inherit the no-route branch's
    // breach-everything rule below: G7's "an incidental shove against a wall
    // on an open path deals nothing" still holds for a taunted enemy that
    // merely beelines into an unrelated wall, exactly as it would for a
    // normally-pathing one.
    setNormalized(target.x - e.x, target.y - e.y);
    dx = outX;
    dy = outY;
    aimHadStep = true;
  } else {
    flowAim(w, e, target);
    setNormalized(outX - e.x, outY - e.y);
    dx = outX;
    dy = outY;
  }

  if (dx !== 0 || dy !== 0) {
    e.fx = dx;
    e.fy = dy;
  }

  // Separation keeps the horde from stacking into a single point, but it must
  // fade near the objective: at full strength the innermost ranks get pushed
  // outward by the ranks behind them and the crowd orbits instead of closing.
  // The scale saturates outside [SEP_FADE_NEAR, SEP_FADE_NEAR + SEP_FADE_SPAN],
  // and almost every enemy is outside it, so compare squared distances first
  // and take the square root only inside the band. Same value, far fewer sqrts.
  const toTarget2 = dist2(e.x, e.y, target.x, target.y);
  const sepScale =
    toTarget2 >= SEP_FADE_FAR_SQ
      ? 1
      : toTarget2 <= SEP_FADE_NEAR_SQ
        ? 0
        : clamp((Math.sqrt(toTarget2) - SEP_FADE_NEAR) / SEP_FADE_SPAN, 0, 1);
  if (sepScale > 0) {
    // Crowd repulsion is a smoothing force, not a collision response, so it is
    // recomputed on a stagger and reused in between. This is the single most
    // expensive query in the sim; the stagger is by entity id, so it stays
    // deterministic.
    if ((e.id + w.tick) % SEP_PERIOD === 0) {
      separation(w, e);
      e.sepX = outX;
      e.sepY = outY;
    }
    dx += e.sepX * sepScale;
    dy += e.sepY * sepScale;
  }
  setNormalized(dx, dy);
  dx = outX;
  dy = outY;

  const step = speed * dt;
  let nx = e.x + dx * step;
  let ny = e.y + dy * step;

  if (!e.flying && !e.ghosting) {
    // Straight reads of the blocked mask: this runs for every walker every tick.
    const blocked = w.grid.blocked;
    const cy = Math.floor(e.y);
    const cx = Math.floor(e.x);
    let hitX = -1;
    let hitY = -1;
    const bx = Math.floor(nx);
    if (bx < 0 || bx >= GRID_W || blocked[cy * GRID_W + bx] !== 0) {
      hitX = bx;
      hitY = cy;
      nx = e.x;
    }
    const by = Math.floor(ny);
    if (by < 0 || by >= GRID_H || blocked[by * GRID_W + cx] !== 0) {
      if (hitX < 0) {
        hitX = cx;
        hitY = by;
      }
      ny = e.y;
    }
    if (hitX >= 0) {
      const s = w.structureAt(hitX, hitY);
      // SPEC-FINAL §10 / G7: a pathing enemy chews a structure only when its
      // route runs through one (a breach), the field has no route at all
      // (the beeline fallback), or it is standing *inside* an occupied tile —
      // a wall built on top of it must be chewable or the enemy is pinned
      // forever, which the old any-bump rule prevented by accident. An
      // incidental shove against a wall on an open path deals nothing — G7's
      // second clause. The Gatebreaker's `structureBreaker` trait is its own
      // authored rule, G7's exception: it smashes whatever stands in front of
      // it, routed or not.
      const breaching =
        aimBreach ||
        !aimHadStep ||
        w.grid.occ[cy * GRID_W + cx] !== 0 ||
        (e.flags & TRAIT.structureBreaker) !== 0;
      if (s && breaching) attackStructure(w, e, def, s, dt);
      else e.attackingStructure = 0;
    } else {
      e.attackingStructure = 0;
    }
  }

  e.x = clamp(nx, 0.3, GRID_W - 0.3);
  e.y = clamp(ny, 0.3, GRID_H - 0.3);
}

/**
 * Where the flow field wants this enemy to walk next; result in outX/outY,
 * route facts in aimHadStep/aimBreach.
 */
function flowAim(w: World, e: Enemy, target: { x: number; y: number }): void {
  const tx = Math.floor(e.x);
  const ty = Math.floor(e.y);
  // Standing on the target tile already: walk straight at the objective.
  if (tx === Math.floor(target.x) && ty === Math.floor(target.y)) {
    aimHadStep = true;
    outX = target.x;
    outY = target.y;
    return;
  }
  const field = w.navFieldFor(false);
  const next = field.next[ty * GRID_W + tx];
  if (next < 0) {
    outX = target.x;
    outY = target.y;
    return;
  }
  aimHadStep = true;
  aimBreach = w.grid.occ[next] !== 0;
  outX = (next % GRID_W) + 0.5;
  outY = ((next / GRID_W) | 0) + 0.5;
}

const SEP_RADIUS = 0.55;
const SEP_STRENGTH = 0.6;
/** Separation is off within this distance of the objective, ramping back over SEP_FADE_SPAN. */
const SEP_FADE_NEAR = 1.0;
const SEP_FADE_SPAN = 1.4;
const SEP_FADE_NEAR_SQ = SEP_FADE_NEAR * SEP_FADE_NEAR;
const SEP_FADE_FAR_SQ = (SEP_FADE_NEAR + SEP_FADE_SPAN) * (SEP_FADE_NEAR + SEP_FADE_SPAN);
/** Ticks between separation recomputes for a given enemy. */
const SEP_PERIOD = 6;

/** Crowd repulsion; result in outX/outY. */
function separation(w: World, e: Enemy): void {
  const reach = SEP_RADIUS + e.radius;
  w.enemiesInRadius(e.x, e.y, reach, scratch);
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let i = 0; i < scratch.length; i++) {
    const o = scratch[i];
    if (o.id === e.id || o.dead || o.boss) continue;
    const dx = e.x - o.x;
    const dy = e.y - o.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d <= 0.0001) {
      // Perfect overlap: deterministic tie-break by id so replays match.
      sx += e.id > o.id ? 1 : -1;
      n++;
      continue;
    }
    const k = (reach - d) / reach;
    if (k <= 0) continue;
    sx += (dx / d) * k;
    sy += (dy / d) * k;
    n++;
  }
  if (n === 0) {
    outX = 0;
    outY = 0;
    return;
  }
  outX = (sx / n) * SEP_STRENGTH;
  outY = (sy / n) * SEP_STRENGTH;
}

/**
 * An enemy's effective `coreDamage`, with p12b's tier rung applied
 * (`tierCoreDamagePerStep^(tier-1)`, the lever QUESTIONS Q160 measured as
 * the elastic one; shipped at 1.7/step, x2.89 at T3).
 *
 * Exists so all four consumers scale together: the Core leak itself, the leak
 * telemetry event, the Warden-contact hit, and the structure-attack DPS that
 * derives from the same number. Reading `def.coreDamage` raw anywhere else is
 * the drift this function exists to prevent.
 */
export function enemyCoreDamage(w: World, def: EnemyDef): number {
  return def.coreDamage * tierCoreDamageMul(w.content, w.cfg.tier);
}

/* ------------------------------------------------------- objective contact */

export function attackStructure(w: World, e: Enemy, def: EnemyDef, s: Structure, dt: number): void {
  e.attackingStructure = s.id;
  const factor = w.content.waves.enemyStructureDpsFactor;
  const mul = def.structureDamageMul ?? 1;
  // fb153a: the "an enemy with no `coreDamage` still chews walls" floor is a
  // damage magnitude, so it takes `numberScale` like every other one. Left at a
  // bare 1 it swallowed the whole rescale here — every enemy floored to the
  // pre-rescale minimum, which flattened the tier ladder's structure-damage
  // rung to exactly 1.0 (caught by `tests/p12b-tier-ladder.test.ts`).
  const dps = Math.max(w.content.modifiers.numberScale, enemyCoreDamage(w, def)) * factor * mul;
  damageStructure(w, s, dps * dt);
}

/**
 * SPEC-V3 §4 gave towers a `defense` stat, and this is the one place structure
 * HP is spent, so this is where it is read — through m19a's shared armour curve
 * (`structureArmor`), not a second rule of its own. m20c authored the bands
 * (`towers.defenseBands`: none 0, low 5, medium 10), so nine of the ten towers
 * now take less than they are dealt here; the Palisade and the Sprout are
 * `none`, i.e. exactly x1.
 */
export function damageStructure(w: World, s: Structure, amount: number): void {
  if (s.dead || !Number.isFinite(amount)) return;
  amount *= damageTakenMul(structureArmor(w, s));
  s.hp -= amount;
  w.emit('structhit', s.tx + 0.5, s.ty + 0.5, amount, s.id);
  if (s.hp <= 0) {
    w.emit('structdeath', s.tx + 0.5, s.ty + 0.5, s.towerId, 0);
    w.removeStructure(s);
  }
}

export function leakIntoCore(w: World, e: Enemy, def: EnemyDef): void {
  // Floored so a swarm that keeps leaking during the defeat slow-mo beat
  // (SPEC-V2 D1) cannot drive the HUD's Core HP negative.
  //
  // God mode (SPEC-V3 T4) suppresses the HP loss only. The leak is still
  // counted and still banked against the next VS wave: the Day HUD's "Loose in
  // the dark" counter shows exactly what is being stored up, so an immortal
  // Core is not a consequence-free one. Measured equal to a mortal run - same
  // budget, same leaks, same Night - so the choice costs nothing under
  // ordinary play, and the surplus from an extreme case is dropped at the
  // alive cap by act2.ts's spendBudget.
  if (!w.godMode) w.coreHp = Math.max(0, w.coreHp - enemyCoreDamage(w, def));
  w.leaks++;
  w.leaksByWave[w.wave] = (w.leaksByWave[w.wave] ?? 0) + 1;
  // SPEC-V2 §1 leak coupling: it escaped into the dark and comes back with
  // friends — banked against this Day's Night, spent at `finishSundering`.
  // The director's cost table prices one *spawn call*, not one physical body
  // (`act2.ts`'s `spendBudget` charges it once per call even for a pack), so
  // a pack enemy's share is divided by its pack size: a fully-leaked pack
  // costs the Night the same as the one spawn call that created it did the
  // Director, rather than `packSize`x that.
  const directorCost = (w.content.spawns.costs[def.key] ?? 5) / (def.packSize ?? 1);
  w.nightBudgetBonus += directorCost * w.content.spawns.leakBudgetMultiplier;
  w.looseInTheDark++;
  w.emit('leak', e.x, e.y, enemyCoreDamage(w, def), 0);
  e.dead = true;
  w.deadEnemies = true;
  w.enemyById.delete(e.id);
}

export function contactWarden(w: World, e: Enemy, def: EnemyDef): void {
  if (w.dying) return;
  if ((e.flags & TRAIT.explodes) !== 0) {
    const r = def.explodeRadius ?? 1.5;
    w.emit('explode', e.x, e.y, r, 0);
    if (dist2(e.x, e.y, w.warden.x, w.warden.y) <= r * r) {
      damageWarden(w, def.explodeDamage ?? 25 * w.content.modifiers.numberScale);
    }
    killEnemy(w, e, 'contact');
    return;
  }
  if (e.attackCooldown > 0) return;
  e.attackCooldown = w.content.spawns.contactInterval;
  let dmg = enemyCoreDamage(w, def) * (1 + e.buffPower);
  // Frost Warden trait: chilled enemies hit softer.
  if (isChilled(e)) dmg *= w.derived.chilledDamageTakenMul;
  damageWarden(w, dmg);
}

/** Set by boss.ts (M6). Returns true when it fully handled the boss this tick. */
export let bossUpdate: (w: World, e: Enemy, dt: number) => boolean = () => false;
export function setBossHandler(fn: (w: World, e: Enemy, dt: number) => boolean): void {
  bossUpdate = fn;
}

/**
 * Set by boss.ts (p10k, §9/§14 G1×G14): a time-gated damage-taken ramp on the
 * boss only, keyed off the same "no stalemate" clock as its outgoing
 * escalation (`escalationStacks`). Read here rather than imported directly to
 * avoid a cycle back into boss.ts, same reason `bossUpdate` above is a
 * registered callback rather than a direct import.
 */
export let bossDamageTakenMul: (w: World) => number = () => 1;
export function setBossVulnerabilityFn(fn: (w: World) => number): void {
  bossDamageTakenMul = fn;
}

/**
 * Set by run.ts; keeps the Warden's damage rules (armor, i-frames) in one place.
 * `opts` is forwarded so an enemy-applied ailment can say it is one — without it
 * every §3 DoT reaching the Warden from this file would arrive armored, since
 * this indirection is the only route enemies, the boss and ground areas have.
 */
export let damageWarden: (w: World, amount: number, opts?: WardenDamageOptions) => void = () => {};
export function setWardenDamageHandler(
  fn: (w: World, amount: number, opts?: WardenDamageOptions) => void,
): void {
  damageWarden = fn;
}
