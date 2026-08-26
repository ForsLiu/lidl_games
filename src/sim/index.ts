/** Public sim surface. Renderers and tools import from here, never from internals. */

export { Run, buildReport, hashWorld, applyCommand } from './run';
export { World } from './world';
export { loadContent } from './content';
export type { Content, TowerDef, EnemyDef, BoonDef, TreeNode } from './content';
export * from './types';
export { Grid, GATES, GRID_W, GRID_H, TILE, CORE_X, CORE_Y, CORE_W, CORE_H, coreCenter } from './grid';
export {
  BASE,
  derive,
  baseRunStats,
  emptyStats,
  armorReduction,
  effectiveArmor,
  damageTakenMul,
} from './stats';
export type { Derived, Stats } from './stats';
export { Rng, RngSet } from './rng';
