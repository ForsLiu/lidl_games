/** Palette and small drawing constants. Render-side only. */

import { CLASS_VFX } from './vfx-registry';

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
  /** fb036: a sealed gate's breach route through structures. */
  pathBreach: '#ff5f5f',
};

/**
 * fb036: one distinct dashed-line color per spawn gate, indexed against
 * `World.gates` order (world.ts: `GATES.slice(0, 3)` — west, north, east —
 * plus a 4th `south` entry when the Fourth Gate modifier is active), so each
 * gate's path indicator reads apart from the others on screen. A run with
 * more gates than colors wraps via `% GATE_PATH_COLORS.length` rather than
 * going undefined.
 */
export const GATE_PATH_COLORS: readonly string[] = ['#7ecbff', '#ffd166', '#a78bfa', '#7ee08a'];

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
 * fb158 (owner feedback `ui-enemy-attack-indicators`, render half): one
 * distinct color per `EnemyDef.attackKind` (src/sim/content.ts), for the
 * small per-enemy attack-kind icon and its range ring. Keyed by the same
 * seven literal strings the schema authors rather than importing `EnemyDef`
 * itself, matching `ENEMY_COLORS`'s own loose `Record<string, string>`
 * keying just above — the icon's *shape* (drawn in canvas.ts) is what
 * actually distinguishes a kind for a colorblind player; color is a second,
 * non-load-bearing cue.
 */
export const ATTACK_KIND_COLORS: Record<string, string> = {
  melee: '#e0857a',
  ranged: '#8fc7e0',
  bomber: '#ff8a5c',
  healer: '#7fe0a8',
  buffer: '#ffd166',
  burrower: '#a07a5a',
  phaser: '#c9a8ff',
};

export interface AttackKindIconShape {
  /** A solid disc (`fill()`) vs. a hollow ring (`stroke()`). */
  filled: boolean;
  /** The larger of the two icon radii this file's canvas icon draws in. */
  big: boolean;
  /** Half-opacity, vs. full. */
  faded: boolean;
}

/**
 * fb158: the one place that turns an `attackKind` into a shape — both
 * `canvas.ts`'s `drawAttackKindIcon` (the in-game marker) and `enemy-info.ts`'s
 * DOM icon (HUD enemy panel, Codex) key off this, so the two surfaces the
 * item's acceptance line asks to agree ("the Codex enemy pages show the same
 * icon") cannot drift apart into showing different shapes for one kind.
 * Every kind gets a unique (filled, big, faded) triple.
 */
export function attackKindIconShape(kind: string): AttackKindIconShape {
  return {
    filled: kind === 'melee' || kind === 'bomber' || kind === 'buffer' || kind === 'phaser',
    big: kind === 'bomber' || kind === 'healer' || kind === 'phaser',
    faded: kind === 'buffer' || kind === 'burrower' || kind === 'phaser',
  };
}

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
  // fb021: the nine projectile-basic-attack classes (`vfx-registry.ts`'s
  // `CLASS_VFX[key].basic.shape === 'projectile'`), keyed by class so a
  // class's basic attack reads as its own weapon, not a generic dart. Color
  // reads from `CLASS_VFX[key].basic.color` (not repeated here) so the
  // registry stays the one place a class's basic-attack color is authored —
  // code-reviewer flagged the earlier hardcoded duplicates as a
  // could-silently-drift dead field.
  plaguebringer: { color: CLASS_VFX.plaguebringer.basic.color, shape: 'glob', size: 4, trail: 1 },
  engineer: { color: CLASS_VFX.engineer.basic.color, shape: 'bolt', size: 5, trail: 1.8 },
  pyromancer: { color: CLASS_VFX.pyromancer.basic.color, shape: 'orb', size: 4, trail: 1.6 },
  archer: { color: CLASS_VFX.archer.basic.color, shape: 'dart', size: 3, trail: 2.4 },
  necromancer: { color: CLASS_VFX.necromancer.basic.color, shape: 'orb', size: 4, trail: 1 },
  cryomancer: { color: CLASS_VFX.cryomancer.basic.color, shape: 'orb', size: 4, trail: 0 },
  stormcaller: { color: CLASS_VFX.stormcaller.basic.color, shape: 'spark', size: 3, trail: 0.6 },
  animist: { color: CLASS_VFX.animist.basic.color, shape: 'dart', size: 3, trail: 1.4 },
  time_lord: { color: CLASS_VFX.time_lord.basic.color, shape: 'orb', size: 4, trail: 1.2 },
};

/**
 * Terrain residuals keep their tower's colour, so a spore cloud left behind
 * still reads as Venom Spore damage.
 */
export function projectileStyle(source: string): ProjectileStyle {
  const key = source.startsWith('terrain_') ? source.slice('terrain_'.length) : source;
  return STYLES[key] ?? DEFAULT_STYLE;
}

/**
 * fb159 (owner feedback `ui-damage-font-scaling`): floating damage numbers
 * scale with their own value instead of a fixed 12px, so a 10-damage tick and
 * a several-thousand-damage boss nova don't render identically. Size is
 * `base + k*log10(value)`, clamped to `[base, max]`; `boldThreshold` is the
 * value at and above which a number renders bold rather than normal weight
 * ("10 small, 100 medium, 1000+ large and bold" — the owner feedback's own
 * three anchors). Crit/execute keeps its own multiplier on top of this
 * (`executeFontScale`, already data-driven in `data/damagetypes.json`) rather
 * than losing it; a DoT aggregate tick (fb060) renders at `dotFontScale` of
 * the same computed size instead of the flat, value-blind 0.7 it used before.
 *
 * BACKLOG-UI.md Log: this table belongs in `/data` per this item's own
 * acceptance line ("Constants are data-driven... not literals in the
 * renderer") — genuinely out of this lane's Scope (`/data` isn't
 * `src/ui/**`/`src/render/**`), so it stays a literal here and the migration
 * is logged for the main-lane merge rather than silently left non-compliant.
 */
export const FLOATING_NUMBER_FONT = {
  base: 9,
  k: 4,
  max: 26,
  boldThreshold: 1000,
  dotFontScale: 0.8,
};

/** The `base + k*log10(value)` size in px, clamped, times any crit/execute multiplier. */
export function floatingNumberFontSize(value: number, fontScale = 1): number {
  const f = FLOATING_NUMBER_FONT;
  const raw = f.base + f.k * Math.log10(Math.max(1, value));
  return Math.min(f.max, Math.max(f.base, raw)) * fontScale;
}

/** Bold once `value` reaches the large-number anchor, or unconditionally for a crit/execute's own extra styling. */
export function floatingNumberFontWeight(value: number, fontScale: number): 'bold' | 'normal' {
  return fontScale > 1 || value >= FLOATING_NUMBER_FONT.boldThreshold ? 'bold' : 'normal';
}

/**
 * fb116: a deterministic per-tile lightness jitter so a scattered field of the
 * same terrain kind (`data/terrain.json`'s per-kind `color`) reads as organic
 * texture rather than a flat, uniform stamp — without touching `/src/sim`
 * (architecture rule 1: no `Math.random` there) or breaking replay/render
 * determinism (a real hash of the tile's own coordinates, not a draw-order- or
 * frame-dependent value, so the same seed always paints the same tile the same
 * shade). `TERRAIN_JITTER` is a presentation constant, not a balance number —
 * unlike `FLOATING_NUMBER_FONT` there is no `/data` precedent for a
 * render-only cosmetic range, and fb159's own Log entry already established
 * that a literal here is consistent with this file's existing tables.
 */
export const TERRAIN_JITTER = 0.12;

/** `#rrggbb` -> `[r, g, b]`, each 0-255. Malformed input (missing `data/terrain.json` color) falls back to mid-grey rather than throwing mid-frame. */
function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return [128, 128, 128];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** Cheap, deterministic, non-cryptographic integer hash of one tile's coordinates, folded to [0, 1). */
function tileJitterFraction(tx: number, ty: number): number {
  let h = (tx * 374761393 + ty * 668265263) ^ (tx * 2654435761);
  h = (h ^ (h >>> 13)) >>> 0;
  return (h % 1000) / 1000;
}

/**
 * `baseHex` lightened or darkened by up to `TERRAIN_JITTER` (a fraction of
 * 255), keyed off the tile's own coordinates so it is stable across every
 * redraw and every viewer of the same seed.
 */
export function terrainTileFill(baseHex: string, tx: number, ty: number): string {
  const [r, g, b] = hexToRgb(baseHex);
  const offset = Math.round((tileJitterFraction(tx, ty) - 0.5) * 2 * TERRAIN_JITTER * 255);
  const clamp8 = (v: number): number => Math.min(255, Math.max(0, v));
  const hex2 = (v: number): string => clamp8(v).toString(16).padStart(2, '0');
  return `#${hex2(r + offset)}${hex2(g + offset)}${hex2(b + offset)}`;
}
