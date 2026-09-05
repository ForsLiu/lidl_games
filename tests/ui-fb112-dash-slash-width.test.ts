/**
 * fb112 (code-reviewer finding during fb108, filed as its own item because it
 * was a pre-existing bug outside that diff): `dashSlashSentence`
 * (`src/ui/class-info.ts`, fb063's original `dash_line` sentence) displayed
 * `eff.dashWidth` verbatim as "X tiles wide". `fireDashSlash`
 * (`src/sim/classes.ts`) passes that same value into `lineHit`
 * (`src/sim/combat.ts`) as the parameter literally named `halfWidth`, and
 * `lineHit` rejects an enemy only on `perp > halfWidth + e.radius` — so the
 * real hit corridor spans `dashWidth` to *either* side of the dash line and
 * is `2 * dashWidth` wide in total.
 *
 * Swordsman's Circle Slash is the only normal-profile class authoring
 * `dash_line`, so every player of it was shown half the true corridor width.
 * fb108 already fixed exactly this in `dashTrailSentence`/`dashHealSentence`;
 * this is the same fix for the third sentence.
 *
 * The sim half of this file is what stops the assertion from being a
 * tautology ("the string says 2x because we wrote 2x"): it drives the real
 * `class_active2` Command and measures which enemies the engine actually
 * struck, establishing independently that `dashWidth` is a half-width.
 */
import { describe, expect, it } from 'vitest';

import { applyCommand } from '../src/sim/run';
import { spawnEnemy } from '../src/sim/enemies';
import { World } from '../src/sim/world';
import { activeSkillMarkup } from '../src/ui/class-info';
import { trimNum } from '../src/ui/info-format';
import { cfg } from './helpers';

const FULL_HP = 1e6;

/**
 * Places an enemy at `along` tiles down the +X dash line from the warden and
 * `perp` tiles to the side of it, immovable and effectively unkillable, so
 * "was it struck" reads cleanly off its HP.
 */
function place(w: World, along: number, perp: number) {
  // Named, not `enemies[0]` (code-reviewer finding): a row reorder could put a
  // trait-carrying enemy here, and `Bulwark`/`Shellback` mitigation survives
  // `e.armor = 0` while a `pack` trait would spawn uncontrolled extra enemies.
  const e = spawnEnemy(w, 'husk', w.warden.x + along, w.warden.y + perp)!;
  e.hp = FULL_HP;
  e.maxHp = FULL_HP;
  e.speed = 0;
  e.armor = 0;
  // `lineHit` widens its corridor test by `e.radius`; zeroing it makes the
  // measured boundary exactly `halfWidth`, with no per-enemy slack.
  e.radius = 0;
  return e;
}

describe('fb112: Circle Slash\'s dash-line sentence shows the true corridor width', () => {
  const content = new World(cfg()).content;
  const swordsman = content.classByKey.get('swordsman')!;
  const eff = swordsman.active2;
  const dashWidth = eff.dashWidth ?? 0;

  it('data/classes.json still authors swordsman.active2 as a dash_line with a nonzero dashWidth (sanity, not vacuous)', () => {
    expect(eff.kind).toBe('dash_line');
    expect(dashWidth).toBeGreaterThan(0);
  });

  it("the engine's corridor really is `dashWidth` to EITHER side — i.e. `2 * dashWidth` wide in total", () => {
    const w = new World(cfg({ classKey: 'swordsman' }));
    w.warden.x = 4;
    w.warden.y = 12;

    const along = 2;
    // ±1% around the boundary, with `e.radius = 0` removing per-enemy slack:
    // this pins the half-width to `dashWidth` itself rather than merely
    // bounding it to a range (code-reviewer finding).
    const leftInside = place(w, along, -dashWidth * 0.99);
    const rightInside = place(w, along, dashWidth * 0.99);
    const outside = place(w, along, dashWidth * 1.01);
    w.rebuildBuckets();

    applyCommand(w, { k: 'class_active2', aimX: w.warden.x + 10, aimY: w.warden.y });

    // Both sides land: the struck band is ~1.98 * dashWidth of centers across,
    // which a `dashWidth`-wide corridor could not contain.
    expect(leftInside.hp).toBeLessThan(FULL_HP);
    expect(rightInside.hp).toBeLessThan(FULL_HP);
    // ...and it stops at `dashWidth`, so the full width is exactly 2x, not more.
    expect(outside.hp).toBe(FULL_HP);
  });

  it('the sentence displays that doubled width, not the raw half-width', () => {
    const markup = activeSkillMarkup(swordsman, 'active2');
    expect(markup).toContain(`${trimNum(2 * dashWidth)}-tile-wide line`);
    expect(markup).not.toContain(`${trimNum(dashWidth)}-tile-wide line`);
  });

  it('matches the fix fb108 already applied to the other two dash sentences', () => {
    const pyromancer = content.classByKey.get('pyromancer')!;
    const pyroWidth = pyromancer.active2.dashWidth ?? 0;
    expect(activeSkillMarkup(pyromancer, 'active2')).toContain(`${trimNum(2 * pyroWidth)} tiles wide`);

    const bloodlord = content.classByKey.get('bloodlord')!;
    const bloodWidth = bloodlord.active2.dashWidth ?? 0;
    expect(activeSkillMarkup(bloodlord, 'active2')).toContain(`${trimNum(2 * bloodWidth)} tiles wide`);
  });
});
