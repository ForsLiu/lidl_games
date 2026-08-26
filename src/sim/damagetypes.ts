/**
 * SPEC-V3 §3's damage-type taxonomy — the one door every attack goes through
 * when it wants to deal damage *as a type* rather than as a bare number.
 *
 * The table itself is `data/damagetypes.json`; nothing here invents a number.
 * A row is one of two shapes:
 *
 *   `hit` — the damage lands now. Normal lands it on the target; Electric
 *           lands it in the row's own small radius, "inherently" (§3).
 *   `dot` — the damage is installed as a stack that ticks. The magnitude is
 *           either the row's flat `dps` (Bleeding 1/s, Burning 1/s) or its
 *           `ratio` of the damage that triggered it (Poison 120%, Toxic 180%),
 *           spread over the row's `duration`.
 *
 * So `applyDamageType(w, e, 'toxic', 50, src)` is "hit this enemy with 50
 * damage worth of Toxic": 180% of 50 over 9 s, which is 10 dps for 9 s.
 *
 * Composite attacks (§3: electric tower `normal:electric = 1:1`) are expressed
 * by calling this once per part with that part's share of the damage, which is
 * what `applyDamageSplit` does.
 */

import { applyAoE } from './combat';
import type { DamageTypeDef } from './content';
import { applyDot, damageEnemy, type DamageOptions } from './enemies';
import type { Enemy } from './types';
import { World } from './world';

/** SPEC-V3 §3's six rows, in the order the table lists them. */
export const DAMAGE_TYPES = ['normal', 'bleeding', 'poison', 'toxic', 'burning', 'electric'] as const;

export type DamageTypeKey = (typeof DAMAGE_TYPES)[number];

export function damageTypeDef(w: World, key: string): DamageTypeDef | undefined {
  return w.content.damageTypeByKey.get(key);
}

/**
 * Dot rows state their magnitude one of two ways, and the difference is the
 * whole reason Poison and Toxic read as "120%/180% of the triggering damage"
 * while Bleeding and Burning read as flat per-second numbers.
 */
export function dotDpsFor(def: DamageTypeDef, triggeringDamage: number, duration = def.duration!): number {
  // Against the *effective* duration, not the row's: §3 states a ratio row as a
  // total ("120% of the triggering damage"), so a caller that stretches the
  // duration must still pay 120%, not 120% x the stretch.
  if (def.ratio !== undefined) return (def.ratio * triggeringDamage) / duration;
  return def.dps ?? 0;
}

export interface DamageTypeOptions extends DamageOptions {
  /** Overrides the row's own duration; used by a V2-authored tower burn. */
  duration?: number;
  /** Overrides the row's own stack cap; used by a V2-authored tower poison. */
  maxStacks?: number;
}

/**
 * Deal `amount` of damage as `type`. Returns the damage that landed *now*,
 * which is zero for every dot row — a DoT's damage is dealt by the tick.
 */
export function applyDamageType(
  w: World,
  e: Enemy,
  type: string,
  amount: number,
  source: string,
  opts: DamageTypeOptions = {},
): number {
  const def = damageTypeDef(w, type);
  // An unknown key must not silently become a free hit: /data is schema-checked
  // at load, so the only way to get here is a caller that made a key up.
  if (!def) throw new Error(`unknown damage type "${type}"`);
  if (amount <= 0) return 0;

  if (def.effect === 'dot') {
    const duration = opts.duration ?? def.duration!;
    applyDot(w, e, type, dotDpsFor(def, amount, duration), duration, source, { maxStacks: opts.maxStacks });
    return 0;
  }

  // §2: armor reduces normal damage; a row that says it ignores armor is an
  // ailment and passes `dot`, which is exactly the flag `damageEnemy` reads.
  const hit: DamageOptions = { ...opts, dot: opts.dot ?? def.ignoresArmor };
  const radius = def.radius ?? 0;
  if (radius <= 0) return damageEnemy(w, e, amount, source, hit);

  // Electric: "deals its damage in a small AoE inherently". Centred on the
  // target, and the target is the `primary`: a row that lands its damage must
  // land it on the enemy it was handed, whatever else is standing there and
  // whether or not the spatial buckets have seen it. `area` scales every
  // effect (§2).
  const r = radius * w.derived.areaMul;
  w.emit('pulse', e.x, e.y, r, 0);
  return applyAoE(w, e.x, e.y, r, amount, source, {}, { primary: e, damage: hit });
}

/**
 * SPEC-V3 §3's composite attacks: "electric tower `normal:electric = 1:1`,
 * poison tower `1:1` → `1:1.5` upgraded". The ratio names the *shares* of one
 * attack's damage, so `{normal: 1, electric: 1}` on a 20-damage attack is 10
 * and 10 — not 20 and 20.
 */
export function applyDamageSplit(
  w: World,
  e: Enemy,
  ratio: Readonly<Record<string, number>>,
  amount: number,
  source: string,
  opts: DamageTypeOptions = {},
): number {
  // Sorted once and used for both loops: float addition is not associative, so
  // summing the weights in authoring order would make {a:0.1,b:0.2,c:0.3} and
  // the same object written backwards disagree in the last bit — and that
  // reaches every share, and through `hashWorld` reaches A11 (QUESTIONS Q63).
  const keys = Object.keys(ratio).sort();
  let weight = 0;
  for (const k of keys) weight += ratio[k];
  if (weight <= 0) return 0;
  let dealt = 0;
  for (const k of keys) {
    if (ratio[k] <= 0) continue;
    dealt += applyDamageType(w, e, k, (amount * ratio[k]) / weight, source, opts);
  }
  return dealt;
}
