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
export { generateTerrain, terrainHash } from './generate';
export { terrainOverlay } from './overlay';
export type { TerrainGrid, TerrainMap, TerrainMeasure } from './types';
