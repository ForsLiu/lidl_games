/** Palette and small drawing constants. Render-side only. */

export const PALETTE = {
  bgDay: '#1b2028',
  bgNight: '#0b0d14',
  tileDay: '#2a3240',
  tileNight: '#161b26',
  tileAlt: '#232b37',
  border: '#0a0c11',
  gate: '#7a4a2a',
  gateGlow: '#d98a4a',
  core: '#4fc3f7',
  coreDim: '#1d5b78',
  heartstone: '#7ae2c3',
  warden: '#ffe9a8',
  wardenOutline: '#3a3323',
  lane: '#323b4b',
  grid: '#00000022',
  hpBack: '#000000aa',
  hpFront: '#e05555',
  /** fb006: unfinished-DoT segment overlaid on the HP front, hatched on top. */
  hpDot: '#e8edf5aa',
  hpDotHatch: '#000000cc',
  text: '#e8edf5',
  textDim: '#8b97a8',
  gold: '#f2c14e',
  xp: '#7fd4ff',
  ghost: '#ffffff55',
  ghostBad: '#ff5f5f88',
  ghostGood: '#5fff8f88',
};

export const TOWER_COLORS: Record<string, string> = {
  palisade: '#6d6f78',
  arrow_spire: '#9fd3c7',
  ballista: '#c9a227',
  ember_brazier: '#ef6c33',
  frost_obelisk: '#66c7ff',
  tesla_coil: '#b98cff',
  mortar: '#a4785a',
  venom_spore: '#7ac74f',
  beacon_totem: '#ffd166',
  harvest_sprout: '#8bc34a',
};

export const TERRAIN_COLORS: Record<string, string> = {
  stone_wall: '#4a4d55',
  pillar: '#5c6068',
  burning_brazier: '#8a3a18',
  ice_monolith: '#3f7fa8',
  conductive_spire: '#6b4fa8',
  rubble: '#5a4638',
  spore_cloud: '#4a7a34',
  shrine: '#a88a44',
  gem_bloom: '#5a8a34',
};

export const ENEMY_COLORS: Record<string, string> = {
  husk: '#a8998a',
  sprinter: '#d9c27a',
  swarm_rat: '#8a7a6a',
  bulwark: '#7f8fa0',
  spitter: '#9fbf6a',
  gale_imp: '#c9a8ff',
  mender: '#7fe0a8',
  splitling: '#d08fc0',
  shellback: '#8a9a7a',
  bomber: '#ff8a5c',
  warlock: '#b07fd0',
  burrower: '#a07a5a',
  charger: '#e07a5a',
  frostkin: '#8fd8ff',
  cinderling: '#ff9a4a',
  wraith: '#b0b8d8',
  colossus: '#d05a5a',
  herald: '#d0a05a',
  gatebreaker: '#e04a4a',
  warden_eater: '#ff3355',
};

/**
 * Per-source projectile and tracer looks (playtest report, 2026-08-25: "should
 * have different bullet projection animation/sprite for different towers").
 *
 * Keyed by the `source` the sim stamps on every projectile and shot event —
 * a tower key in Act I, the weapon key in Act II — so a Ballista bolt reads as
 * a Ballista bolt whichever act fired it.
 */
export type ProjectileShape = 'dart' | 'bolt' | 'shell' | 'orb' | 'spark' | 'glob';

export interface ProjectileStyle {
  color: string;
  shape: ProjectileShape;
  /** Half-length of the drawn body, in pixels. */
  size: number;
  /** Trail length as a multiple of `size`; 0 draws no trail. */
  trail: number;
}

const DEFAULT_STYLE: ProjectileStyle = { color: '#ffe9a8', shape: 'dart', size: 3, trail: 1.6 };

/** One entry per damage source that can put something on screen. */
const STYLES: Record<string, ProjectileStyle> = {
  // Act I: keyed by tower.
  arrow_spire: { color: '#cfeee4', shape: 'dart', size: 3, trail: 2.2 },
  ballista: { color: '#ffd85a', shape: 'bolt', size: 7, trail: 2.6 },
  ember_brazier: { color: '#ff8a3d', shape: 'spark', size: 4, trail: 0.8 },
  frost_obelisk: { color: '#9fe0ff', shape: 'orb', size: 4, trail: 0 },
  tesla_coil: { color: '#c9a6ff', shape: 'spark', size: 3, trail: 0 },
  mortar: { color: '#c8a184', shape: 'shell', size: 5, trail: 0 },
  venom_spore: { color: '#9fe06a', shape: 'glob', size: 4, trail: 1.2 },
  warden_eater: { color: '#ff4f70', shape: 'orb', size: 6, trail: 1.4 },
  spitter: { color: '#9fbf6a', shape: 'glob', size: 3, trail: 1 },
  cinderling: { color: '#ff9a4a', shape: 'spark', size: 3, trail: 0.8 },
};

/**
 * Terrain residuals keep their tower's colour, so a spore cloud left behind
 * still reads as Venom Spore damage.
 */
export function projectileStyle(source: string): ProjectileStyle {
  const key = source.startsWith('terrain_') ? source.slice('terrain_'.length) : source;
  return STYLES[key] ?? DEFAULT_STYLE;
}
