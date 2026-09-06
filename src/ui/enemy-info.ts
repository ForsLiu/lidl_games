/**
 * fb158 (owner feedback `ui-enemy-attack-indicators`, SPEC-FINAL §9/§11):
 * the DOM half of the enemy attack-kind indicator — a small icon plus a
 * one-line description with real numbers, shared by the in-run enemy info
 * panel (`hud.ts`'s `enemyInfoMarkup`) and the Codex's enemy detail view
 * (`codex-collections.ts`). Reads `EnemyDef.attackKind`/`attackRange`/
 * `specialRange` directly (fb155 authors them) rather than re-deriving
 * anything from `traits`.
 *
 * The icon's shape comes from `attackKindIconShape` (render/theme.ts) — the
 * same function `canvas.ts`'s in-game marker keys off — so this DOM icon and
 * the in-game one can never show a different shape for one kind.
 */
import type { EnemyDef } from '../sim/content';
import { ATTACK_KIND_COLORS, attackKindIconShape } from '../render/theme';
import { trimNum } from './info-format';

export const ATTACK_KIND_LABELS: Record<EnemyDef['attackKind'], string> = {
  melee: 'Melee',
  ranged: 'Ranged',
  bomber: 'Bomber',
  healer: 'Healer',
  buffer: 'Buffer',
  burrower: 'Burrower',
  phaser: 'Phaser',
};

/** One-line attack kind + range description, with real numbers (fb158). */
export function enemyAttackDescription(def: EnemyDef): string {
  const label = ATTACK_KIND_LABELS[def.attackKind] ?? def.attackKind;
  const base = `${label}, ${trimNum(def.attackRange, 1)} tiles`;
  return def.specialRange !== undefined ? `${base} (special ${trimNum(def.specialRange, 1)} tiles)` : base;
}

/** A small DOM badge mirroring the in-game marker's shape/color for one `attackKind`. */
export function enemyAttackIconMarkup(def: EnemyDef): string {
  const color = ATTACK_KIND_COLORS[def.attackKind] ?? '#cccccc';
  const { filled, big, faded } = attackKindIconShape(def.attackKind);
  const classes = [
    'sw-atk-icon',
    filled ? 'sw-atk-icon-filled' : 'sw-atk-icon-ring',
    big ? 'sw-atk-icon-big' : '',
    faded ? 'sw-atk-icon-faded' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const label = ATTACK_KIND_LABELS[def.attackKind] ?? def.attackKind;
  return `<span class="${classes}" style="--atk-color:${color}" title="${label}" aria-label="${label}"></span>`;
}

/** Icon + one-line description together, the shape both surfaces above show. */
export function enemyAttackMarkup(def: EnemyDef): string {
  return `${enemyAttackIconMarkup(def)} <span class="sw-atk-text">${enemyAttackDescription(def)}</span>`;
}
