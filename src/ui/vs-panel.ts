/**
 * VS side panel (owner feedback `feature-vs-wielded-side-panel`, BACKLOG.md
 * fb037; SPEC-FINAL §6.2 lineage-panel extension). One row per wielded tower
 * type: derived damage (average x count bonus, §6.1), attack speed, range,
 * pierce/AoE, damage-type split, the active milestone special, and live DPS
 * this wave.
 *
 * Every number is read straight off `wieldedAttacks`/`w.derived` through the
 * same helpers `fireWielded` (`sim/vswield.ts`) itself fires with —
 * `wieldedRangeFor`/`wieldedPierceFor`/`wieldedAoeFor` — so this panel cannot
 * quote a number the live attack disagrees with. The "live DPS this wave"
 * column reuses `dpsPanelData`'s own wave window (fb007) rather than
 * re-deriving a second damage accumulator.
 *
 * Presentation only — this module never writes to the World.
 */

import type { AttackProfile } from '../sim/upgrades';
import { damageShare } from '../sim/upgrades';
import { typeMasteryMul } from '../sim/progression';
import type { TowerAttack } from '../sim/content';
import {
  wieldedAoeFor,
  wieldedAttacks,
  wieldedChainsFor,
  wieldedPierceFor,
  wieldedPoisonTargetsFor,
  wieldedRangeFor,
} from '../sim/vswield';
import type { World } from '../sim/world';
import { dpsPanelData } from './dps-panel';
import { trimNum } from './info-format';

export interface VsPanelRow {
  key: string;
  name: string;
  count: number;
  /** §6.1's average-before-bonus, for a reader that wants the raw number the +10%/tower rides on. */
  perTowerAverage: number;
  /** The real per-shot damage `fireWielded` deals: `wielded.damage * powerMul * typeMasteryMul`. */
  damage: number;
  interval: number;
  range: number;
  pierce: number;
  aoe: number;
  damageTypeText: string;
  special: string;
  waveDamage: number;
  waveDps: number;
}

/**
 * "62% Normal, 38% Burning" style split — every §3 type with a nonzero
 * share, always summing to exactly 100%. Rounding each share independently
 * can drift off 100 by a point or two on an unevenly-authored ratio (a
 * three-way 1/1/1 split rounds to 33+33+33 = 99, a qa-playtester finding on
 * this item, currently dormant since every `/data` ratio today is a clean
 * 50/50) — the last entry absorbs the remainder instead.
 */
export function damageTypeText(w: World, ratio: Readonly<Record<string, number>> | null): string {
  const entries: { name: string; pct: number }[] = [];
  for (const dt of w.content.damageTypes.types) {
    const share = damageShare(ratio, dt.key);
    if (share > 0) entries.push({ name: dt.name, pct: Math.round(share * 100) });
  }
  if (entries.length === 0) return '100% Normal';
  const sum = entries.reduce((a, e) => a + e.pct, 0);
  entries[entries.length - 1].pct += 100 - sum;
  return entries.map((e) => `${e.pct}% ${e.name}`).join(', ');
}

/**
 * One phrase per attack shape naming the milestone that actually changed
 * it — the VS-accurate counterpart of `tower-info.ts`'s `lineageSpecial`
 * (the Act I/TD lineage line), which hard-codes the *raw, unwielded* pierce/
 * splash/chain/target numbers. Reusing that function verbatim here would
 * print a pierce/splash/target count that visibly disagrees with this same
 * row's own `pierce`/`aoe` fields (both already correctly wield-scaled) —
 * a code-reviewer finding on this item's first draft. Takes the row's own
 * already-computed `pierce`/`aoe` rather than re-deriving them, so the two
 * can never drift apart.
 *
 * Known gap (qa-playtester finding, inherited from `lineageSpecial` and not
 * closed here — out of scope for this item): a `single`-kind wielded shot
 * also cleaves `WIELD_SPLASH_FRACTION` damage into nearby enemies via
 * `wieldSplash` (`sim/vswield.ts`), which neither this text nor `aoe`
 * (0 for `single`) discloses — "single target"/"pierce N" reads as no
 * splash at all. Filed as BACKLOG b079 rather than fixed here, since closing
 * it properly means adding a field, not a one-line swap, and the identical
 * gap already exists unfixed in the sibling TD lineage line.
 */
function vsLineageSpecial(a: TowerAttack, p: AttackProfile, pierce: number, aoe: number): string {
  switch (a.kind) {
    case 'single':
      return pierce > 0 ? `pierce ${pierce}` : p.projectiles > 1 ? `${p.projectiles} shots` : 'single target';
    case 'pierce':
      return `pierce ${pierce}`;
    case 'cone':
      return a.burn ? 'burn' : 'cone';
    case 'aura':
      return 'aura';
    case 'chain': {
      const chains = wieldedChainsFor(a);
      return p.electricChain ? `chain ${chains} + arc` : `chain ${chains}`;
    }
    case 'lob':
      return `splash r${trimNum(aoe, 1)}`;
    case 'poison': {
      const targets = wieldedPoisonTargetsFor(p);
      return targets > 1 ? `${targets} spores` : 'poison';
    }
  }
}

/**
 * Builds the panel's data model. Called fresh every time the panel needs to
 * redraw — cheap: at most a handful of built tower types.
 */
export function vsPanelRows(w: World): VsPanelRow[] {
  const waveBySource = new Map(dpsPanelData(w).wave.bySource.map((r) => [r.key, r]));
  return wieldedAttacks(w)
    .map((wl) => {
      const def = w.content.towerById.get(wl.towerId)!;
      const a = def.attack!;
      const wave = waveBySource.get(wl.towerKey);
      const pierce = wieldedPierceFor(a, wl.profile);
      const aoe = wieldedAoeFor(w, def, a);
      return {
        key: wl.towerKey,
        name: def.name,
        count: wl.count,
        perTowerAverage: wl.perTowerAverage,
        // Mirrors `fireWielded`'s own `dmg` derivation exactly (vswield.ts) —
        // the §6.3 Type Mastery multiplier is folded in here, not on `wl.damage`
        // itself, since it is a fire-time multiplier, not part of the average.
        damage: wl.damage * w.derived.powerMul * typeMasteryMul(w, wl.towerKey),
        interval: wl.interval,
        range: wieldedRangeFor(w, a),
        pierce,
        aoe,
        damageTypeText: damageTypeText(w, wl.profile.ratio),
        special: vsLineageSpecial(a, wl.profile, pierce, aoe),
        waveDamage: wave?.damage ?? 0,
        waveDps: wave?.dps ?? 0,
      };
    })
    .sort((x, y) => x.name.localeCompare(y.name));
}
