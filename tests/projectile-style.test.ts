/**
 * Playtest: "should have different bullet projection animation/sprite for
 * different towers" — every projectile was the same yellow dot.
 *
 * The renderer is a canvas, so these tests pin the thing that decides how a
 * projectile looks rather than the pixels: each damage source must resolve to
 * a style, and sources that a player needs to tell apart must not share one.
 */

import { describe, expect, it } from 'vitest';

import { loadContent } from '../src/sim/content';
import { projectileStyle } from '../src/render/theme';

const content = loadContent();

/** Attack kinds that actually put a projectile or tracer on screen. */
const VISIBLE_TOWER_KINDS = new Set(['single', 'pierce', 'chain', 'lob', 'poison', 'cone']);

function signature(source: string): string {
  const s = projectileStyle(source);
  return `${s.color}:${s.shape}`;
}

describe('projectile styles', () => {
  it('every attacking tower has its own look', () => {
    const seen = new Map<string, string>();
    for (const def of content.towers.towers) {
      if (!def.attack || !VISIBLE_TOWER_KINDS.has(def.attack.kind)) continue;
      const sig = signature(def.key);
      expect(seen.has(sig), `${def.key} looks identical to ${seen.get(sig)}`).toBe(false);
      seen.set(sig, def.key);
    }
    expect(seen.size).toBeGreaterThanOrEqual(6);
  });

  it('every weapon has its own look', () => {
    const seen = new Map<string, string>();
    for (const def of content.weapons.weapons) {
      const sig = signature(def.key);
      expect(seen.has(sig), `${def.key} looks identical to ${seen.get(sig)}`).toBe(false);
      seen.set(sig, def.key);
    }
    expect(seen.size).toBe(content.weapons.weapons.length);
  });

  it('a soul keeps its tower colour across the Sundering', () => {
    for (const def of content.weapons.weapons) {
      if (def.source === 'innate') continue;
      expect(projectileStyle(def.key).color, def.key).toBe(projectileStyle(def.source).color);
      expect(projectileStyle(def.key).shape, def.key).toBe(projectileStyle(def.source).shape);
    }
  });

  it('terrain residuals keep the colour of the tower that left them', () => {
    expect(projectileStyle('terrain_venom_spore')).toEqual(projectileStyle('venom_spore'));
  });

  it('an unknown source still draws something rather than nothing', () => {
    const fallback = projectileStyle('no_such_source');
    expect(fallback.size).toBeGreaterThan(0);
    expect(fallback.color).toMatch(/^#/);
  });

  it('long-range sources trail and instant orbs do not', () => {
    expect(projectileStyle('ballista').trail).toBeGreaterThan(0);
    expect(projectileStyle('mortar').shape).toBe('shell');
    expect(projectileStyle('frost_obelisk').trail).toBe(0);
  });
});
