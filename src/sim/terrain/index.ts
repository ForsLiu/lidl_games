/** SPEC-FINAL §10.5 (fb064a): terrain generation, public surface. */
export {
  isBuildable,
  isHighGround,
  isWalkable,
  flatCoreAnchorCount,
  loadTerrain,
  maxCoreLegalFrac,
  parseTerrain,
  TERRAIN_KEYS,
  TerrainKind,
  type HighGroundFamily,
  type TerrainConfig,
  type TerrainKey,
  type TerrainTileDef,
} from './config';
export {
  blockMask,
  corridorsOk,
  gateComponent,
  gateDistance,
  gateIndices,
  gatesConnected,
  gatesOpen,
  legalCoreAnchors,
  perGateReach,
  measureTerrain,
  terrainLegal,
  thickMask,
  walkableFlood,
} from './analyze';
export {
  suggestCoreAnchor,
  validateCorePlacement,
  type CorePlacementResult,
  type CoreRejectReason,
} from './core-placement';
export {
  generateTerrain,
  terrainHash,
  MAX_TERRAIN_SEED,
  MIN_TERRAIN_SEED,
} from './generate';
export {
  canAttackHighGround,
  canAttackStructureAt,
  canSurfaceAt,
  canSurfaceOnHighGround,
  familyForDef,
  highGroundFamily,
  type HighGroundQuery,
} from './high-ground';
export { terrainOverlay } from './overlay';
export type { TerrainGrid, TerrainMap, TerrainMeasure } from './types';
