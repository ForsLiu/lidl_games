/**
 * fb016 (SPEC-FINAL §11 extended to skills/Cores). One place for every
 * class/Core's indicator+VFX style, so a new skill or Core with no entry here
 * is caught by `tests/fb016-vfx-registry.test.ts` rather than silently
 * rendering nothing (the state every one of the 22 class-Active kinds and 5
 * Cores was in before this item: `w.emit('class_active', ...)` already fired
 * for all of them, but `canvas.ts`'s `ingest()` had no case for it, so every
 * skill cast was invisible).
 *
 * Primitive shapes only (circles/lines/flashes) — no sim changes, no new art
 * assets. `ACTIVE_KIND_SHAPE` is the one generic (per-`ClassEffect.kind`, not
 * per-class) map deciding *how* an emitted event's `(x,y,a,b)` payload reads:
 * `nova` self-centered AoE (`a` = radius), `line` a directed slash/dash
 * (`a,b` = the far end), `point` a target-only pulse with no shape of its
 * own, `skip` a kind that already has its own dedicated render path
 * (`chain_lightning`'s per-jump 'arc' tracer, already wired pre-fb016) so it
 * is not double-drawn.
 */
import type { ClassEffect } from '../sim/content';

/** The 22 `ClassEffect['kind']` values authored across `data/classes.json` (content.ts's `ClassEffectSchema`). */
export type VfxShape = 'nova' | 'line' | 'point' | 'skip';

export const ACTIVE_KIND_SHAPE: Record<ClassEffect['kind'], VfxShape> = {
  burst_damage: 'nova',
  charge_nova: 'nova',
  dash_line: 'line',
  ground_poison: 'nova',
  poison_boost: 'point',
  charge_pierce: 'line',
  dash_volley: 'line',
  repair_heal: 'point',
  summon_turret: 'point',
  frost_nova: 'nova',
  ice_wall: 'point',
  chain_lightning: 'skip',
  overload: 'point',
  dash_trail: 'line',
  raise_skeletons: 'nova',
  death_pact: 'point',
  manifest_spirit: 'point',
  recall_totem: 'nova',
  clarion_taunt: 'nova',
  judgement: 'nova',
  blood_tithe: 'point',
  dash_heal: 'line',
  // fb013 Time Lord: `time_mark` is a Warden-centered AoE pulse (every enemy
  // in r7 advances a stage, like Clarion Taunt/Judgement's own self-centered
  // radius); `time_lock` is a self-cast zone (a nova at the cast point, like
  // Recall Totem's placement).
  time_mark: 'nova',
  time_lock: 'nova',
};

export interface SkillVfxEntry {
  /** Short human-readable description of the aim/charge indicator shown while casting. */
  indicator: string;
  /** Short human-readable description of the effect shown on fire. */
  fire: string;
  color: string;
}

/** fb021: a basic attack is either a melee `swing` (rendered as a `CastFx` slash, like a class Active's `line` shape) or a `projectile` (a travelling `Tracer`, the same mechanism `shot`/`spit` already use for tower/enemy attacks — `theme.ts`'s `STYLES` needs a matching row keyed by the class for the latter). */
export type BasicAttackShape = 'swing' | 'projectile';

export interface BasicVfxEntry {
  shape: BasicAttackShape;
  /** Short human-readable description of the firing visual. Impact flash itself is the existing `hit:` fx (fb005 damage-type colors), not repeated here. */
  fire: string;
  color: string;
}

export interface ClassVfxEntry {
  q: SkillVfxEntry;
  e: SkillVfxEntry;
  passive: { cue: string; color: string };
  basic: BasicVfxEntry;
}

/** SPEC-FINAL §13's twelve real classes, fb013. */
export const CLASS_VFX: Record<string, ClassVfxEntry> = {
  swordsman: {
    q: { indicator: 'charge ring at the Warden, radius grows with hold', fire: 'expanding slash nova + knockback', color: '#e0c46c' },
    e: { indicator: 'facing line to the dash target', fire: 'slash-line trail along the dash', color: '#e0c46c' },
    passive: { cue: 'bleed tick mark on every struck enemy (Thousand Cuts)', color: '#c23b3b' },
    basic: { shape: 'swing', fire: 'short sword-slash line to the target', color: '#e0c46c' },
  },
  plaguebringer: {
    q: { indicator: 'ground ring at the Warden', fire: 'poison nova pulse (ground patch renders via the existing area layer)', color: '#7ac74f' },
    e: { indicator: 'none — global, no target', fire: 'pulse at the Warden as every live poison stack doubles', color: '#4fae2f' },
    passive: { cue: 'jump line to the next poisoned corpse-adjacent enemy (Spreading Plague)', color: '#7ac74f' },
    basic: { shape: 'projectile', fire: 'poison glob lobbed at the target', color: '#7ac74f' },
  },
  engineer: {
    q: { indicator: 'nearest-structure highlight', fire: 'repair pulse + overclock glow on the structure', color: '#8fd3ff' },
    e: { indicator: 'none — deploys at the Warden', fire: 'turret-summon pulse', color: '#8fd3ff' },
    passive: { cue: 'passive stat only — no discrete trigger moment', color: '#8fd3ff' },
    basic: { shape: 'projectile', fire: 'tool-bolt fired at the target', color: '#8fd3ff' },
  },
  pyromancer: {
    q: { indicator: 'self nova ring', fire: 'flame nova flash', color: '#ff7a3a' },
    e: { indicator: 'facing line to the dash target', fire: 'burning-trail dash (ground patches render via the existing area layer)', color: '#ff7a3a' },
    passive: { cue: 'touch-damage flash between adjacent Burning carriers (Contagious Flame)', color: '#ff7a3a' },
    basic: { shape: 'projectile', fire: 'fireball streaking to the target', color: '#ff7a3a' },
  },
  archer: {
    q: { indicator: 'aim line at the cursor, brightens with hold', fire: 'piercing shot line', color: '#c9d15a' },
    e: { indicator: 'facing line to the dash target', fire: 'triple-volley pulses at struck enemies', color: '#c9d15a' },
    passive: { cue: 'reflected by the charge indicator itself (Long Draw’s per-second pierce)', color: '#c9d15a' },
    basic: { shape: 'projectile', fire: 'arrow shot at the target', color: '#c9d15a' },
  },
  necromancer: {
    q: { indicator: 'summon-radius ring around the Warden', fire: 'raise pulse over reclaimed corpses', color: '#a37fd6' },
    e: { indicator: 'nearest-structure highlight', fire: 'pact-toggle pulse on the structure', color: '#a37fd6' },
    passive: { cue: 'corpse marker where a killed enemy drops (Grave Harvest)', color: '#a37fd6' },
    basic: { shape: 'projectile', fire: 'shadow bolt fired at the target', color: '#a37fd6' },
  },
  cryomancer: {
    q: { indicator: 'self nova ring', fire: 'frost nova flash (shatter burst if the target was already frosted)', color: '#7fd4ff' },
    e: { indicator: 'wall footprint at the cursor, oriented to facing', fire: 'ice-wall placement pulse', color: '#7fd4ff' },
    passive: { cue: 'frost ring on every struck enemy (Frost Touch, shares the frost/frozen status ring)', color: '#7fd4ff' },
    basic: { shape: 'projectile', fire: 'frost shard fired at the target', color: '#7fd4ff' },
  },
  stormcaller: {
    q: { indicator: 'nearest-target highlight', fire: 'chain-jump arcs (existing tracer, one per jump)', color: '#8fc7ff' },
    e: { indicator: 'none — self-buff', fire: 'overload pulse at the Warden', color: '#8fc7ff' },
    passive: { cue: 'reflected by the chain arcs’ jump count (Conduction)', color: '#8fc7ff' },
    basic: { shape: 'projectile', fire: 'spark bolt fired at the target', color: '#8fc7ff' },
  },
  bloodlord: {
    q: { indicator: 'nearest-structure highlight', fire: 'tithe pulse on the structure', color: '#c23b3b' },
    e: { indicator: 'facing line to the dash target', fire: 'rush-line dash, heal number per enemy passed', color: '#c23b3b' },
    passive: { cue: 'passive attack-power shift only — no discrete trigger moment', color: '#c23b3b' },
    basic: { shape: 'swing', fire: 'blade swing line to the target', color: '#c23b3b' },
  },
  animist: {
    q: { indicator: 'summon-radius ring at the nearest tower', fire: 'manifest pulse at the spirit’s spawn point', color: '#6fd67a' },
    e: { indicator: 'placement ring at the Warden', fire: 'totem-aura nova at cast', color: '#6fd67a' },
    passive: { cue: 'passive summon buff only — no discrete trigger moment', color: '#6fd67a' },
    basic: { shape: 'projectile', fire: 'thorn bolt fired at the target', color: '#6fd67a' },
  },
  paladin: {
    q: { indicator: 'self nova ring', fire: 'taunt pulse over every retargeted enemy', color: '#ffd166' },
    e: { indicator: 'none — fires instantly, no charge phase to telegraph', fire: 'holy nova flash', color: '#ffd166' },
    passive: { cue: 'armor glow while standing still (Guardian Stance)', color: '#ffd166' },
    basic: { shape: 'swing', fire: 'mace swing line to the target', color: '#ffd166' },
  },
  time_lord: {
    q: { indicator: 'r7 ring around the Warden', fire: 'mark-stage pulse across every enemy caught in it (a distinct past/present/future ring per enemy, drawn every frame by drawEnemies)', color: '#9a7fe6' },
    e: { indicator: 'placement ring at the cursor', fire: 'zone nova at cast, teleport + detonation burst on any enemies a recast displaces', color: '#6fd6c9' },
    passive: { cue: 'a warden-side DoT tick in place of an ordinary hit flash (Time Flow)', color: '#9a7fe6' },
    basic: { shape: 'projectile', fire: 'temporal bolt fired at the target', color: '#9a7fe6' },
  },
};

export interface CoreEffectVfxEntry {
  key: string;
  vfx: string;
  color: string;
}

export interface CoreVfxEntry {
  indicator: string;
  effects: CoreEffectVfxEntry[];
}

/** SPEC-FINAL §5.5's five Cores (`data/cores.json`). */
export const CORE_VFX: Record<string, CoreVfxEntry> = {
  stone_heart: {
    indicator: 'none — flat Core HP bonus only, no active effect to telegraph',
    effects: [],
  },
  carnivorous_plant: {
    indicator: 'dashed range ring at the devour radius (TD) + a live Digestion counter',
    effects: [
      { key: 'devour', vfx: 'bite pulse on the devoured target', color: '#7ac74f' },
      { key: 'poison_volley', vfx: 'bite pulse on each VS bullet target', color: '#7ac74f' },
    ],
  },
  vampire_heart: {
    indicator: 'faint ring around the Core scaled by lifesteal share',
    effects: [{ key: 'lifesteal', vfx: 'motes flowing from the healed structure to the Core', color: '#ff5577' }],
  },
  corpse: {
    indicator: 'a live store-size readout above the Core',
    effects: [
      { key: 'execute', vfx: 'execution beam from the Core to the target (plus the existing larger execute number)', color: '#ffd166' },
      { key: 'explode', vfx: 'explosion nova at the execution site (step 2)', color: '#ff8844' },
    ],
  },
  time: {
    indicator: 'a slow-aura ring (TD) and, once purchased, a decay ring shaded by radius',
    effects: [],
  },
};

/**
 * Returns which of `classKeys`/`coreKeys` have no registry row — empty on the
 * real content. Exists so the checklist test (and, if a future session wants
 * it, a loader-time dev warning) can assert coverage against whatever
 * `/data` actually authors, not a hand-copied list that can drift from it.
 */
export function missingVfxCoverage(
  classKeys: readonly string[],
  coreKeys: readonly string[],
): { classes: string[]; cores: string[] } {
  return {
    classes: classKeys.filter((k) => !CLASS_VFX[k]),
    cores: coreKeys.filter((k) => !CORE_VFX[k]),
  };
}
