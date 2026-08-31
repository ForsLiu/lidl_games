/**
 * Gate G4 (SPEC-FINAL §14, closed at p10g): the armour-shred path
 * (`shredArmor`, wired through Burning's `armorShredPerSecond` in
 * `data/damagetypes.json`) had only unit-level coverage — `tests/
 * c3-armor.test.ts` and `tests/m19c-damage-types.test.ts` call `shredArmor`
 * or `applyDot`/`tickDot` directly, never through a real bot playing a real
 * build. Every registered sweep policy that reaches the balance gates either
 * omits `ember_brazier` from its `towerKeys` (`hybrid`, the default arm of
 * both `npm run sim` and the two-policy sweep CLAUDE.md documents) or never
 * actually places it (`maxbuild`/`sealed` list it low-priority behind six
 * other towers, and the wall-time budget in this codebase's build order does
 * not guarantee it lands). Nothing in the gate set ever proved the wiring
 * from a placed Ember Brazier — its cone attack, in either Act I (the tower
 * itself) or Act II (the same attack, wielded, per §6.1's inheritance
 * formula) — through to a live enemy actually losing armour, so the whole
 * chain could regress silently.
 *
 * `tools/a5probe.ts` already carries `ember-heavy`/`ember-mix`, two
 * `BuildSpec`s that put `ember_brazier` first (or near-first) in a real
 * `BuilderPolicy`'s `towerKeys` (used for G13's damage-share pool). p10g
 * reuses those two builds rather than adding a new one — the mix already
 * exists and is already exercised elsewhere, so this only adds the missing
 * measurement — and extends `runBuild`'s per-tick sample (the same pattern
 * p10f's `maxStackDepth` used for G19) to track the peak `Enemy.armorShred`
 * seen on any live enemy, both overall and restricted to `w.phase === 'act2'`
 * so the wielded-cone half of the claim ("no bot policy ever draws the flame
 * cone") is checked independently of the Act I tower-attack half.
 */
import { describe, expect, it } from 'vitest';

import { BUILDS, runBuild } from '../tools/a5probe';

const SEEDS = [1, 2];

describe('G4 liveness: a real Ember Brazier build actually shreds armour', () => {
  const builds = BUILDS.filter((b) => b.towerKeys.includes('ember_brazier'));
  const results = builds.flatMap((b) => SEEDS.map((seed) => runBuild(b, seed)));
  const readable = results
    .map((r) => `${r.name} seed${r.seed} maxShred=${r.maxArmorShred} maxShredAct2=${r.maxArmorShredAct2}`)
    .join(', ');

  it('the pool actually contains a build that lists ember_brazier', () => {
    expect(builds.length, 'no BUILDS entry lists ember_brazier').toBeGreaterThan(0);
  });

  it('every ember_brazier build shreds armour at least once over the run', () => {
    for (const r of results) {
      expect(r.maxArmorShred, `${r.name} seed${r.seed}: ${readable}`).toBeGreaterThan(0);
    }
  });

  it('at least one run shreds armour specifically during Act II (the wielded cone fires)', () => {
    expect(results.some((r) => r.maxArmorShredAct2 > 0), readable).toBe(true);
  });
});
