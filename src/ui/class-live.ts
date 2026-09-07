/**
 * fb148: the live numbers `class-info.ts`'s sentences resolve through, for one
 * class in one run.
 *
 * Its own module rather than a `hud.ts` export (code-reviewer finding): it is
 * a pure six-field builder, and living in the 2200-line DOM module made every
 * consumer — a unit test included — drag the whole HUD in.
 *
 * The single builder behind BOTH in-run surfaces (the bottom bar's Active
 * hover tips and the character panel's ability list), which used to construct
 * the object separately and had already drifted apart in their comments.
 */
import { active2CdrFactor, classAttackPowerMul, classMoveSpeedMul } from '../sim/classes';
import type { ClassDef } from '../sim/content';
import { coreMoveSpeedMul } from '../sim/cores';
import { hasEquipment } from '../sim/equipment';
import { BASE } from '../sim/stats';
import type { World } from '../sim/world';
import type { ClassLiveContext } from './class-info';

/**
 * fb148: `dashRangeMul` recomposes what `src/sim/classes.ts` computes as
 * `dashDistance(currentMoveSpeed(w), classDashDuration(dashRange,
 * classBaseMoveSpeed(cls)))`. Both of those helpers are module-private to
 * `classes.ts` (out of this lane's Scope), but the expression reduces exactly:
 * `dashDistance`'s and `classDashDuration`'s `BASE.dashSpeedMul` cancels, so
 * the whole thing is `dashRange * currentMoveSpeed / classBaseMoveSpeed`, and
 * both speeds are reachable from exported parts. The recomposition is pinned
 * against the engine by `tests/ui-fb148-dash-range-live.test.ts`, which
 * binary-searches the distance a real `class_active2` Command actually
 * reaches — so if either sim formula moves, the drift is loud rather than a
 * quietly wrong number in a tooltip.
 */
export function classLiveContext(w: World, cls: ClassDef): ClassLiveContext {
  // `currentMoveSpeed` (classes.ts).
  const moveSpeed = w.derived.moveSpeed * coreMoveSpeedMul(w) * classMoveSpeedMul(w);
  // `classBaseMoveSpeed` (classes.ts): the class's own baseline, its permanent
  // `moveSpeedBonus` applied and nothing else.
  const baseMoveSpeed = BASE.moveSpeed * (1 + cls.moveSpeedBonus);
  return {
    cdr: w.derived.cdr,
    atkFlat: w.derived.atkFlat,
    // `classAttackPowerMul` only differs from plain `powerMul` for Blood
    // Frenzy's phase-dependent swing.
    damageMul: classAttackPowerMul(w, cls),
    active2CdrFactor: active2CdrFactor(w),
    dashRangeMul: baseMoveSpeed > 0 ? moveSpeed / baseMoveSpeed : 1,
    swordsmanShoes: hasEquipment(w, 'swordsman_shoes'),
    // fb115/fb173: `w.derived.areaMul` is public sim state (`src/sim/stats.ts`),
    // the exact factor `classArea(w, radius)` (classes.ts, module-private)
    // applies to every AoE-radius/width Active field — no recomposition needed.
    areaMul: w.derived.areaMul,
  };
}

