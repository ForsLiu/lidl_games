/**
 * Reads a tower's real numbers out of the sim and turns them into something a
 * player can act on (playtest report, 2026-08-25: "should show all the tower
 * stat info & attack details & upgrade info").
 *
 * Every figure here is derived from the same helpers the sim fires with, so
 * the panel cannot drift from what the tower actually does: tier multipliers,
 * Power, aura attack-speed and Constellation modifiers are all included.
 *
 * Presentation only — this module never writes to the World.
 */

import type { TowerDef, TowerAttack } from '../sim/content';
import type { Structure } from '../sim/types';
import type { World } from '../sim/world';
import { wieldedAttacks, wieldedSplashFor, type WieldedAttack } from '../sim/vswield';
import { formatWieldSplash } from './info-format';
import {
  attackProfile,
  type AttackProfile,
  attackSpeedFor,
  canBuildNow,
  damageShare,
  effectiveTowerAoe,
  effectiveTowerRange,
  inBuildRange,
  maxLevel,
  sellValue,
  towerCost,
  upgradeCost,
  upgradeStatMul,
} from '../sim/towers';

export interface StatLine {
  label: string;
  value: string;
  /** What the same stat becomes one tier up, when there is a tier left. */
  next?: string;
}

export interface TowerInfo {
  key: string;
  name: string;
  desc: string;
  /** 1 for an unbuilt tower on the bar; the structure's level when placed. */
  tier: number;
  /** SPEC-V3 §4: `upgrades.count + 1`. */
  maxTier: number;
  /** One sentence on how this tower picks and hits targets. */
  attackText: string;
  stats: StatLine[];
  /** Gold to place one now, or null for an already-placed structure. */
  buildCost: number | null;
  /** Gold to reach the next tier, or null at max tier / unbuilt. */
  upgrade: { toTier: number; cost: number } | null;
  /** Gold back if sold now, or null for an unbuilt tower. */
  sellValue: number | null;
  terrainText: string | null;
  /** fb027: the structure's own tile, so the panel's Upgrade/Sell buttons can target it. Null for an unbuilt preview. */
  tx: number | null;
  ty: number | null;
  /** fb027: current/max HP, for a placed structure only. */
  hp: { current: number; max: number } | null;
  /** fb027 (§4): flat armour points at this tier — omitted from display when 0 (the `none` band). */
  defense: number;
  /** fb027: milestone specials already bought (`at <= tier`), oldest first. */
  milestonesOwned: { at: number; text: string }[];
  /** fb027: §4.2 Necromancer Death Pact — this tower is under the pact right now. */
  pactActive: boolean;
  /** fb027: §4.2 Bloodlord Blood Tithe — this tower paid its HP and carries the permanent bonus. */
  tithed: boolean;
  /**
   * fb027: whether `upgradeTower`/`sellTower` (towers.ts) would actually do
   * anything right now — same phase/build-range/petrified gate they enforce
   * themselves. `upgrade`/`sellValue` above are priced off the tower's own
   * state and say nothing about whether the Warden is close enough or the
   * phase allows it at all; a button/hotkey that only checked affordability
   * would show live and green from clear across the map and silently no-op
   * (code-reviewer finding, fb027).
   */
  canAct: boolean;
}

/**
 * What each shape does, at the level being shown. Every one of these reads the
 * *profile* rather than the authored attack, because SPEC-V3 §4's milestones
 * change the sentence: an Arrow at 4 pierces, an Arrow at 6 fires twice, an
 * Electric at 4 arcs. A panel that described the authored attack would be
 * telling the player about a tower they stopped owning three upgrades ago.
 */
const KIND_TEXT: Record<string, (a: TowerAttack, p: AttackProfile) => string> = {
  single: (_a, p) => {
    const shots = p.projectiles > 1 ? `Fires ${p.projectiles} shots down` : 'Fires down';
    const through =
      p.pierce > 0
        ? `, carrying on through up to ${p.pierce} more ${p.pierce === 1 ? 'enemy' : 'enemies'} behind it`
        : '';
    return `${shots} the line to whichever enemy is furthest along the path to the Core${through}.`;
  },
  pierce: (_a, p) =>
    `Fires a bolt down the busiest line, hitting up to ${1 + p.pierce} enemies for full damage each.`,
  cone: () =>
    'Sprays a cone at the densest cluster. The nearest few take full damage; each target past that takes less.',
  aura: () => 'Pulses every enemy inside its radius at once — no aiming, no travel time.',
  // `chainHit` counts the first target inside `chains`, and SPEC-V3 §4 makes
  // the Electric tower's chaining a milestone special (m20b) rather than
  // something every upgrade step buys — the panel said "+1 arc per tier".
  chain: (a, p) => {
    const chains = a.chains ?? 3;
    const base =
      chains > 1
        ? `Strikes the leading enemy and arcs on until ${chains} enemies are hit, each within ${fmt(
            a.chainRange ?? 3,
          )} tiles of the last.`
        : 'Strikes whichever enemy is furthest along the path to the Core.';
    return p.electricChain
      ? `${base} Its electric half then arcs to the nearest other enemy within ${fmt(
          a.chainRange ?? 3,
        )} tiles — or lands on the same target twice if it is alone.`
      : base;
  },
  lob: (a) =>
    `Lobs a shell at a predicted position and detonates for ${fmt(a.aoe ?? 1.5)}-tile splash. Cannot hit anything closer than ${fmt(a.minRange ?? 0)} tiles.`,
  poison: (a, p) => {
    const targets =
      p.projectiles > 1
        ? `Fires ${p.projectiles} spores at whichever enemy is furthest along the path`
        : 'Fires a spore at whichever enemy is furthest along the path';
    const splash = (a.aoe ?? 0) > 0 ? `, each bursting for ${fmt(a.aoe!)}-tile splash` : '';
    return `${targets}${splash}. Its poison keeps ticking after the shot lands.`;
  },
};

/** "normal 50% · poison 50%" — how a composite attack's damage is typed. */
function ratioText(w: World, ratio: Readonly<Record<string, number>>): string {
  return Object.keys(ratio)
    .sort()
    .filter((k) => ratio[k] > 0)
    .map((k) => `${w.content.damageTypeByKey.get(k)?.name ?? k} ${Math.round(damageShare(ratio, k) * 100)}%`)
    .join(' · ');
}

function fmt(n: number, dp = 1): string {
  const r = Math.round(n * 10 ** dp) / 10 ** dp;
  return String(r);
}

/** Damage-per-shot after upgrades, Power and Constellation tower damage — every factor `towerDamage` applies. */
function shotDamage(w: World, def: TowerDef, a: TowerAttack, tier: number): number {
  return a.damage * upgradeStatMul(w, def, tier) * w.derived.powerMul * w.derived.towerDamageMul;
}

function shotInterval(a: TowerAttack, speedMul: number): number {
  return a.interval / Math.max(0.05, speedMul);
}

/**
 * What one *attack* is worth, split into what lands the moment it hits and what
 * it leaves ticking — because SPEC-V3 §4 gave the owner towers three ways to
 * make those two numbers disagree with `attack.damage`.
 *
 * A panel that quoted the authored damage understated an Arrow at 6 by exactly
 * 2x (two projectiles), a Tesla at 4 by a third (the electric half lands twice),
 * and said nothing at all about a Venom Spore's poison, which is now most of it.
 * Found by QA against the fire loop, which is what these numbers are checked
 * against — see `tests/tower-info.test.ts`.
 */
function attackOutput(w: World, def: TowerDef, tier: number): { impact: number; ailment: number } {
  const a = def.attack!;
  const prof = attackProfile(def, tier);
  const dmg = shotDamage(w, def, a, tier);
  // Ailment potency is the Warden's, and it scales every dot the same way
  // `applyDot` does. Burning has a stat of its own on top; poison additionally
  // reads `towerPoisonDamageMul` (§4.1 Plaguebringer tower passive, p6c,
  // Q119) — mirroring `dotPotency`'s own `!w.huntsWarden` gate (enemies.ts)
  // since Miasma "stays Act I's" the same way `towerDamageMul`/`towerRangeMul`
  // already do; a built tower's panel must not overstate its VS poison output
  // once Act II starts. The `towerByKey.has(source)` half of that gate is
  // dropped here since every call into this function is already about one
  // specific tower's own attack, never a class Active's poison.
  const potency = (key: string) =>
    w.derived.ailmentMul *
    (key === 'burning' ? w.derived.burnDamageMul : key === 'poison' && !w.huntsWarden ? w.derived.towerPoisonDamageMul : 1);
  let impact = 0;
  let ailment = 0;

  const typed = (key: string, share: number): void => {
    const row = w.content.damageTypeByKey.get(key);
    if (!row || row.effect !== 'dot') {
      impact += share;
      return;
    }
    // §3 states a dot row either as a share of what triggered it (Poison 120%)
    // or as a flat dps for its own duration (Bleeding 1/s for 5 s).
    const total = row.ratio !== undefined ? row.ratio * share : (row.dps ?? 0) * (row.duration ?? 0);
    ailment += total * potency(key);
  };

  if (prof.ratio) {
    for (const k of Object.keys(prof.ratio).sort()) {
      const share = damageShare(prof.ratio, k) * dmg;
      if (share > 0) typed(k, share);
    }
  } else {
    impact += dmg;
  }
  // §4 Electric @3: the electric share lands a second time, on the chain target
  // or on the first enemy again.
  if (prof.electricChain) impact += damageShare(prof.ratio, 'electric') * dmg;
  // §3 riders ride once per shot; a status (frost, frozen) owes no damage.
  for (const k of prof.onHit) if (w.content.damageTypeByKey.has(k)) typed(k, 0);
  // V2's authored burn, which the Ember Brazier still uses. §5.2 @2:
  // "+1 Burning per hit" reads as `prof.burnStacks`, a dps multiplier — see
  // `AttackProfile.burnStacks`'s doc comment.
  if (a.burn) {
    ailment += a.burn.dps * prof.burnStacks * upgradeStatMul(w, def, tier) * a.burn.duration * potency('burning');
  }

  // These are single-target numbers: a lone enemy takes every projectile a
  // shot fires. §5.1 gives both Arrow and Poison their second projectile
  // "(same path, not spread)" — every shot a tower fires lands on the one
  // primary target (p5a, QUESTIONS Q110), so a lone target takes them all.
  return { impact: impact * prof.projectiles, ailment: ailment * prof.projectiles };
}

/**
 * Delegates to the sim's own helper so the panel, the range rings and the
 * turret all quote one number (SPEC-V3 T1).
 */
function rangeOf(w: World, def: TowerDef, tier: number): number {
  return effectiveTowerRange(w, def, tier);
}

/**
 * `existing` supplies the structure's tier and its live attack-speed (Beacon
 * auras only apply to a tower that is actually standing somewhere).
 */
export function towerInfo(w: World, def: TowerDef, existing?: Structure): TowerInfo {
  const tier = existing?.tier ?? 1;
  // The pre-build preview has no `Structure` yet, so it can't read
  // `attackSpeedFor`'s aura/Vampire-Heart-missing-HP terms (both keyed by
  // structure id) — but `towerAttackSpeedMul` (Wind Slash, p6b) is a
  // Warden-level derived stat, not structure-specific, so it's available
  // and must be included here too, or the build-menu tooltip understates
  // every tower's fire rate by exactly Wind Slash's bonus (QA-found bug).
  const speedMul = existing ? attackSpeedFor(w, existing) : w.derived.attackSpeedMul * w.derived.towerAttackSpeedMul;
  const hasNext = tier < maxLevel(def);
  const a = def.attack;
  const stats: StatLine[] = [];

  // fb027: HP/def for every placed tower, not only the ones that block a path
  // — m20c gave eight of the ten towers a non-zero defense band, and §5.5's
  // Core panel shows its own HP the same way, so a tower panel with none read
  // as a hole. `towerDefenseBonus` (Paladin's flat passive) is included so
  // this cannot under-quote what `structureArmor`/`damageEnemy`'s own combat
  // math actually reduces incoming damage by — the pre-p27 "Blocks path" line
  // omitted it (harmless only because no test built one with the passive up).
  const defenseValue = def.defense * upgradeStatMul(w, def, tier) + w.derived.towerDefenseBonus;
  if (existing) {
    stats.push({ label: 'HP', value: `${Math.ceil(existing.hp)} / ${Math.round(existing.maxHp)}` });
  }
  if (defenseValue !== 0) {
    stats.push({ label: 'Defense', value: fmt(defenseValue) });
  }

  if (a) {
    const interval = shotInterval(a, speedMul);
    const range = rangeOf(w, def, tier);
    const prof = attackProfile(def, tier);

    const out = attackOutput(w, def, tier);
    const nextOut = hasNext ? attackOutput(w, def, tier + 1) : out;
    if (a.kind === 'cone') {
      // A cone is continuous: its "interval" is the tick it applies dps over.
      stats.push({
        label: 'Damage',
        value: `${fmt(out.impact / a.interval)} dps`,
        next: hasNext ? `${fmt(nextOut.impact / a.interval)} dps` : undefined,
      });
    } else {
      stats.push({
        label: 'Damage',
        value: `${fmt(out.impact)} on impact`,
        next: hasNext ? `${fmt(nextOut.impact)}` : undefined,
      });
      stats.push({ label: 'Rate', value: `${fmt(1 / interval, 2)} / s` });
    }
    // What the attack leaves behind gets its own line rather than hiding inside
    // "damage": a Venom Spore's poison is more than half of what it deals.
    if (out.ailment > 0) {
      stats.push({
        label: a.kind === 'cone' ? 'Ailment' : 'Ailment per shot',
        value: `${fmt(out.ailment)} over time`,
        next: hasNext && nextOut.ailment !== out.ailment ? `${fmt(nextOut.ailment)}` : undefined,
      });
    }
    if (a.kind !== 'cone') {
      stats.push({
        label: 'Single-target DPS',
        value: fmt((out.impact + out.ailment) / interval),
        next: hasNext ? fmt((nextOut.impact + nextOut.ailment) / interval) : undefined,
      });
    }

    // No `next`: SPEC-V3 §4 does not spend an upgrade step on range, so the
    // column would advertise a change the upgrade cannot make.
    stats.push({ label: a.kind === 'aura' ? 'Radius' : 'Range', value: `${fmt(range)} tiles` });
    if (a.minRange) stats.push({ label: 'Minimum range', value: `${fmt(a.minRange)} tiles` });
    // Through the shared helper, not inline: the Range line was moved onto it
    // and Splash was not, so the de-duplication was half done.
    const splash = effectiveTowerAoe(w, def);
    if (splash > 0) stats.push({ label: 'Splash', value: `${fmt(splash)} tiles` });
    // SPEC-V3 §3: what this attack's damage actually *is*. Half a Tesla shot
    // ignores nothing and half of it lands as an area, and the panel has no
    // other place to say so; a milestone that moves the split (Poison @4)
    // moves this line with it.
    if (prof.ratio) {
      const nextRatio = hasNext ? attackProfile(def, tier + 1).ratio : null;
      const now = ratioText(w, prof.ratio);
      const next = nextRatio ? ratioText(w, nextRatio) : '';
      stats.push({ label: 'Damage type', value: now, next: next && next !== now ? next : undefined });
    }
    if (prof.onHit.length > 0) {
      stats.push({
        label: 'On hit',
        value: prof.onHit
          .map((k) => w.content.damageTypeByKey.get(k)?.name ?? k)
          .join(' · '),
      });
    }
    if (a.slow) {
      // §5.2 Frost Obelisk @3: "frost from this tower lasts 5s" — `prof`
      // already resolves this against the authored `slowDuration`.
      stats.push({
        label: 'Slow',
        value: `${Math.round(a.slow * 100)}% for ${fmt(prof.slowDuration)}s`,
      });
    }
    if (a.burn) {
      stats.push({
        label: 'Burn',
        value: `${fmt(a.burn.dps * prof.burnStacks * upgradeStatMul(w, def, tier))} dps for ${fmt(a.burn.duration)}s`,
      });
    }
  }

  // SPEC-V3 §4: an upgrade step buys +10% or a milestone, never both, so the
  // player needs to be told which this one is before paying for it. The words
  // are `/data`'s own note, so a track authored later cannot go undescribed.
  if (hasNext) {
    const milestone = def.upgrades.specials.find((sp) => sp.at === tier);
    if (milestone) stats.push({ label: `Upgrade ${tier}`, value: milestone.note ?? milestone.key });
  }

  if (def.buffAura) {
    stats.push({
      label: 'Aura',
      value: `+${Math.round(def.buffAura.attackSpeed * (1 + 0.25 * (tier - 1)) * 100)}% attack speed within ${fmt(
        def.buffAura.radius + w.derived.beaconRadiusBonus,
      )} tiles`,
    });
  }
  if (def.economy) {
    stats.push({
      label: 'Income',
      value: `${Math.round(def.economy.goldPerWavePerTier * tier * w.derived.sproutMul)} gold per wave`,
      next: hasNext
        ? `${Math.round(def.economy.goldPerWavePerTier * (tier + 1) * w.derived.sproutMul)}`
        : undefined,
    });
  }
  if (def.passive) {
    stats.push({
      label: 'Passive',
      value: `+${Math.round(def.passive.attackSpeedPer * 100)}% attack speed per adjacent tower, up to +${Math.round(
        def.passive.cap * 100,
      )}%`,
    });
  }
  // fb027 moved the HP/Defense numbers themselves onto their own generic
  // lines above (shown for every tower, not just a wall). Once a wall is
  // actually standing, its own HP line already says so; the fact is only
  // worth a line of its own on the *unbuilt* preview, where fb027's new HP
  // line has nothing to attach to yet (b036: `.sw-side` has no scroll of its
  // own, so a line this reads-obvious once placed is a line worth dropping).
  if (def.blocks && !existing) {
    stats.push({ label: 'Blocks path', value: 'yes' });
  }

  // fb027: milestones already bought, oldest first — the panel already shows
  // the *next* one (the "Upgrade N" line below), but said nothing about which
  // of a lower-tier tower's specials are already live.
  //
  // `sp.at < tier`, not `<=`: `attackProfile` (upgrades.ts) only activates a
  // milestone once the tower has upgraded *past* the step it sits at (`steps
  // = tier - 1; if (sp.at > steps) continue`, i.e. live once `tier > sp.at`),
  // the same convention the "Upgrade N" preview line above already encodes
  // (`specials.find(sp => sp.at === tier)` — still-to-buy at the tower's
  // current tier). A `<=` here listed a milestone as owned in the same
  // breath the stats above still called it purchasable (code-reviewer
  // finding, fb027) — verified against a tesla_coil at tier 3 (its `at: 3`
  // Electric Chain milestone): `attackProfile(def, 3).electricChain` is
  // `false`, only flipping to `true` at tier 4.
  const milestonesOwned = def.upgrades.specials
    .filter((sp) => sp.at < tier)
    .sort((x, y) => x.at - y.at)
    .map((sp) => ({ at: sp.at, text: sp.note ?? sp.key }));

  // fb027: the same phase/range/petrified gate `upgradeTower`/`sellTower`
  // enforce themselves — a button/hotkey that only checked affordability
  // would read live and green from clear across the map (code-reviewer
  // finding, fb027).
  const canAct = existing !== undefined && !existing.petrified && canBuildNow(w) && inBuildRange(w, existing.tx, existing.ty);

  return {
    key: def.key,
    name: def.name,
    desc: def.desc,
    tier,
    maxTier: maxLevel(def),
    attackText: a
      ? (KIND_TEXT[a.kind]?.(a, attackProfile(def, tier)) ?? 'Attacks nearby enemies.')
      : 'Does not attack. Its value is where you put it.',
    stats,
    // A petrified tower refuses both (`towers.ts` upgradeTower/sellTower), so
    // offering them would advertise an action that silently does nothing.
    buildCost: existing ? null : towerCost(w, def),
    upgrade: existing && hasNext && !existing.petrified ? { toTier: tier + 1, cost: upgradeCost(w, def) } : null,
    sellValue: existing && !existing.petrified ? sellValue(w, existing) : null,
    terrainText: describeTerrain(def),
    tx: existing?.tx ?? null,
    ty: existing?.ty ?? null,
    hp: existing ? { current: existing.hp, max: existing.maxHp } : null,
    defense: defenseValue,
    milestonesOwned,
    pactActive: existing?.pactActive ?? false,
    tithed: existing?.tithed ?? false,
    canAct,
  };
}

/**
 * SPEC-FINAL §6.2/§5 (p2c): a standing tower deals no attack damage of its
 * own in a VS wave — its only effect is the authored `vsSpecial`. Read that
 * field rather than `terrain`'s now-dead `auraDps`/`auraType`/`slow`/`beamDps`,
 * so this text cannot drift from what the sim actually does (the trap the
 * pre-p2c version of this function fell into — see QUESTIONS Q100/code review).
 */
function describeVsSpecial(v: TowerDef['vsSpecial']): string | null {
  switch (v.kind) {
    case 'electricWireGrid':
      return `wires linked towers together, dealing ${v.damage} dmg to enemies on the wire every ${v.interval}s`;
    case 'poisonTrail':
      return `leaves a poison trail behind you dealing ${Math.round(v.ratio * 100)}% of its wielded damage every ${v.interval}s, r${v.radius}`;
    case 'burningExplode':
      return `a Burning enemy that dies explodes for ${v.damage} dmg, r${v.radius}`;
    case 'frostAura':
      return `an ice aura (r${v.radius}) follows you, applying Frost every ${v.interval}s`;
    case 'none':
    case 'beaconHaste':
    case 'sproutGems':
      return null;
  }
}

/** What this tower leaves behind after the Sundering (SPEC 4), and its §5 VS special (p2c). */
export function describeTerrain(def: TowerDef): string | null {
  const t = def.terrain;
  if (!t || t.kind === 'rubble') return null;
  const bits: string[] = [];
  if (t.blocks) bits.push('blocks movement');
  if (t.armorPerWall) {
    bits.push(`+${t.armorPerWall} Warden armour per nearby wall, up to +${t.armorCap ?? 0}`);
  }
  const vs = describeVsSpecial(def.vsSpecial);
  if (vs) bits.push(vs);
  if (t.wardenAttackSpeed) {
    bits.push(`+${Math.round(t.wardenAttackSpeed * 100)}% Warden attack speed within ${t.wardenRadius ?? 0} tiles`);
  }
  if (t.gemInterval) bits.push(`drops a ${t.gemValue ?? 0} XP gem every ${t.gemInterval}s`);
  if (bits.length === 0) return null;
  return `Petrifies into ${t.kind.replace(/_/g, ' ')}: ${bits.join(', ')}.`;
}

/* ----------------------------------------------------------- wielded lineage */

/** One phrase per attack shape naming the milestone that actually changed it —
 * the compact counterpart of `KIND_TEXT` above, sized for a lineage line
 * rather than a sentence. b079: appends the `single`-kind wielded splash
 * cleave (`wieldedSplashFor`) so this line doesn't read as "no splash at
 * all" the way it used to. */
function lineageSpecial(w: World, a: TowerAttack, p: AttackProfile): string {
  switch (a.kind) {
    case 'single': {
      const base = p.pierce > 0 ? `pierce ${p.pierce}` : p.projectiles > 1 ? `${p.projectiles} shots` : 'single target';
      const splash = wieldedSplashFor(w, a);
      return splash ? `${base} ${formatWieldSplash(splash)}` : base;
    }
    case 'pierce':
      return `pierce ${1 + p.pierce}`;
    case 'cone':
      return a.burn ? 'burn' : 'cone';
    case 'aura':
      return 'aura';
    case 'chain':
      return p.electricChain ? `chain ${a.chains ?? 3} + arc` : `chain ${a.chains ?? 3}`;
    case 'lob':
      return `splash r${fmt(a.aoe ?? 1.5)}`;
    case 'poison':
      return p.projectiles > 1 ? `${p.projectiles} spores` : 'poison';
  }
}

function lineageLine(w: World, wl: WieldedAttack): string {
  const def = w.content.towerById.get(wl.towerId)!;
  // Both numbers come straight off `wl` rather than re-deriving §6.1's "+10%
  // per tower" fraction here: if that bonus is ever retuned in `vswield.ts`,
  // this line moves with it instead of quietly going stale.
  const avg = wl.perTowerAverage;
  // Guards a future zero-damage utility tower (perTowerAverage === 0) from
  // printing "+NaN%" — code review on this item flagged the bare division.
  const bonus = avg === 0 ? 0 : Math.round((wl.damage / avg - 1) * 100);
  return `${def.name} ×${wl.count} (avg ${fmt(avg)}, +${bonus}%) — ${lineageSpecial(w, def.attack!, wl.profile)}`;
}

/**
 * SPEC-FINAL §6.2: "Weapon panel shows lineage: 'Arrow ×3 (avg 14.2, +30%) —
 * pierce 2'." Reads `wieldedAttacks` directly — the same derivation p2a's
 * worked-example test checks against `/data` — so this line cannot drift from
 * what `updateWieldedAttacks` (p2b) actually fires.
 */
export function wieldedLineageText(w: World): string[] {
  return wieldedAttacks(w)
    .map((wl) => lineageLine(w, wl))
    .sort();
}
