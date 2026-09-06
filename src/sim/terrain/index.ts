/** SPEC-FINAL §10.5 (fb064a): terrain generation, public surface. */
export {
  blocksCharacter,
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
  uncontestedHigh,
  walkableFlood,
} from './analyze';
export { describeTerrain, parseTerrainDump, type TerrainDump } from './describe';
export {
  suggestCoreAnchor,
  validateCorePlacement,
  type CorePlacementResult,
  type CoreRejectReason,
} from './core-placement';
export {
  flatTerrain,
  generateTerrain,
  isDegradedMap,
  terrainHash,
  verifyTerrainMap,
  MAX_TERRAIN_SEED,
  MIN_TERRAIN_SEED,
  type TerrainVerifyFault,
  type TerrainVerifyResult,
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
export {
  canCharacterEnter,
  canCharacterEnterKind,
} from './character';
export { gridTerrain } from './grid-view';
export { terrainOverlay } from './overlay';
export {
  approachField,
  freeApproachCost,
  maxGateDetour,
  measureApproach,
  PATH_DIAG_COST,
  PATH_ORTHO_COST,
  type ApproachMeasure,
} from './path';
export type { TerrainGrid, TerrainMap, TerrainMeasure } from './types';
