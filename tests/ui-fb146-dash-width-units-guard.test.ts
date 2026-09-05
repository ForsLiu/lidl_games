/**
 * fb146: a standing guard for the half-width display bug class.
 *
 * `dashWidth` is a HALF-width everywhere the sim reads it — `lineHit`'s
 * parameter is literally named `halfWidth` (`dash_line`, and `fireCrimsonRush`
 * runs the same test inline for `dash_heal`), and `dash_trail` spends it as a
 * `GroundArea.radius`. The corridor or patch a player sees is therefore
 * `2 * dashWidth` across, and a sentence that prints the raw number tells them
 * half the truth.
 *
 * That exact defect has now shipped twice and been caught twice by human
 * review, never by a test: fb108 fixed `dashTrailSentence`/`dashHealSentence`
 * and fb112 fixed `dashSlashSentence`. Every instance is correct today and
 * nothing stopped a fourth sentence reintroducing it, so this file adds the
 * missing rule in two layers:
 *
 *   1. A SOURCE-LEVEL rule over `src/ui/class-info.ts`: every `eff.dashWidth`
 *      read in code must sit inside the established `2 * (eff.dashWidth ?? N)`
 *      doubling. It carries its own proof cases, so the rule cannot rot into
 *      something that passes on any input.
 *   2. A SIM-LEVEL assertion per `dash_*` kind establishing the half-width
 *      from engine behaviour rather than from a parameter's name — the same
 *      reason fb112's own file drives real Commands instead of asserting its
 *      string against itself. Three different mechanisms carry the value
 *      (`lineHit`, a `GroundArea`, and `fireCrimsonRush`'s inline line test),
 *      so a shared claim needs all three measured, not one generalised.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { updateAreas } from '../src/sim/combat';
import { applyCommand } from '../src/sim/run';
import { spawnEnemy } from '../src/sim/enemies';
import { World } from '../src/sim/world';
import { fieldLabel } from '../src/ui/info-format';
import { cfg } from './helpers';

const CLASS_INFO_PATH = join(process.cwd(), 'src', 'ui', 'class-info.ts');
const READ = 'dashWidth';

/**
 * Whether the text immediately preceding a `dashWidth` read doubles it.
 *
 * Deliberately "some `2 *` still open on this expression", not one blessed
 * spelling (code-reviewer finding): `2 * (eff.dashWidth ?? 0)` is what the
 * three fixed sentences write today, but `2 * eff.dashWidth` and — the one
 * that matters — `2 * areaScaled(eff.dashWidth ?? 0, live)` are equally
 * correct, and c001 makes that last shape the likely NEXT correction here
 * (the sim's real half-width is `classArea(w, dashWidth)`, i.e. Area-scaled).
 * A rule that went red on the fix would be deleted rather than obeyed.
 *
 * The closing set is what stops a line carrying one correct read and one bare
 * read from laundering the second through the first: `}` ends an
 * interpolation, `` ` `` a template, `;` a statement, `,` an argument.
 */
function isDoubled(prefix: string): boolean {
  const at = prefix.lastIndexOf('2 *');
  return at !== -1 && !/[}`;,]/.test(prefix.slice(at));
}

/**
 * Every `dashWidth` read in `source` that is NOT doubled, reported as
 * `line: text`.
 *
 * Matched on the bare field name, not on `eff.dashWidth` (code-reviewer
 * finding): `effect.dashWidth`, `eff?.dashWidth`, `eff['dashWidth']` and a
 * `const { dashWidth = 0 } = eff` destructure all render the same half-width
 * and all slipped past a rule keyed to one receiver name. Nothing in the file
 * enforces that a sentence's parameter is called `eff`.
 *
 * Comment text is stripped first, on purpose: the doc comments above the three
 * fixed sentences explain the doubling BY NAMING the field, and a rule that
 * flagged those would be deleted the first time it fired. Only code is
 * scanned. `tests/architecture.test.ts` has a `stripComments` helper for the
 * same "source rule over one file" pattern; it is not importable from a
 * `.test.ts` without running that suite, hence the local copy.
 *
 * Accepted residual: `line.split('//')` also truncates at a `//` inside a
 * string literal (a URL). No such line exists in the scanned file, and the
 * alternative is a real parser for a five-line rule.
 */
function bareDashWidthReads(source: string): string[] {
  const out: string[] = [];
  source.split('\n').forEach((line, i) => {
    const trimmed = line.trimStart();
    if (trimmed.startsWith('*') || trimmed.startsWith('/*') || trimmed.startsWith('//')) return;
    const code = line.replace(/\/\*.*?\*\//g, '').split('//')[0];
    for (let at = code.indexOf(READ); at !== -1; at = code.indexOf(READ, at + READ.length)) {
      if (!isDoubled(code.slice(0, at))) out.push(`${i + 1}: ${line.trim()}`);
    }
  });
  return out;
}

describe('fb146: the source-level units rule for eff.dashWidth', () => {
  it.each([
    ['the exact shape fb112 fixed', 'return `a ${trimNum(eff.dashWidth ?? 0)}-tile-wide line`;'],
    ['a receiver named anything but `eff`', 'return `${trimNum(effect.dashWidth ?? 0)} tiles wide`;'],
    ['an optional chain', 'return `${trimNum(eff?.dashWidth ?? 0)} tiles wide`;'],
    ['a bracket access', "return `${trimNum(eff['dashWidth'] ?? 0)} tiles wide`;"],
    ['a destructure', 'const { dashWidth = 0 } = eff;'],
    ['a local alias', 'const half = eff.dashWidth ?? 0;'],
    [
      'a second, bare read laundered through a correct one on the same line',
      'return `${trimNum(2 * (eff.dashWidth ?? 0))} wide, ${trimNum(eff.dashWidth ?? 0)} deep`;',
    ],
  ])('flags %s — the rule\'s own proof cases', (_label, source) => {
    expect(bareDashWidthReads(source)).toHaveLength(1);
  });

  it.each([
    ['the parenthesised idiom the three fixed sentences use', 'return `${trimNum(2 * (eff.dashWidth ?? 0))} wide`;'],
    ['the same doubling without parentheses', 'return `${trimNum(2 * eff.dashWidth)} wide`;'],
    // c001: the sim half-width is `classArea(w, dashWidth)`, so an
    // Area-scaled double is the likely next correction to these sentences.
    ['an Area-scaled double', 'return `${trimNum(2 * areaScaled(eff.dashWidth ?? 0, live))} wide`;'],
  ])('accepts %s', (_label, source) => {
    expect(bareDashWidthReads(source)).toEqual([]);
  });

  it('does not flag the doc comments that explain the doubling by naming the field', () => {
    const comment = [
      '/**',
      ' * `fireDashSlash` passes eff.dashWidth into lineHit as `halfWidth`, so',
      ' * the corridor is 2 * dashWidth wide.',
      ' */',
      '// eff.dashWidth is a half-width; see above.',
      'const cd = liveCooldownValue(eff.cooldownSeconds); /* not eff.dashWidth */',
    ].join('\n');
    expect(bareDashWidthReads(comment)).toEqual([]);
  });

  it('src/ui/class-info.ts has no bare read', () => {
    const source = readFileSync(CLASS_INFO_PATH, 'utf8');
    // Not vacuous: the file really does read the field, so an empty result
    // means "every read is doubled", not "the rule found nothing to look at".
    expect(source.includes(READ)).toBe(true);
    expect(bareDashWidthReads(source)).toEqual([]);
  });

  it('the info-format fallback label says half-width, not width', () => {
    // Latent today — `effectBlock`'s generic field list is unreachable for
    // every real `kind` since fb108's sentence table — but it is the label a
    // fourth `dash_*` kind would land on before anyone wrote its sentence.
    expect(fieldLabel('dashWidth')).toBe('Dash half-width');
    expect(fieldLabel('dashWidth')).not.toBe('Dash width');
  });
});

const FULL_HP = 1e6;

/** An immovable, effectively unkillable, zero-radius enemy at an absolute tile position. */
function place(w: World, x: number, y: number) {
  // `husk` by name, not `enemies[0]`: a `Bulwark`/`Shellback` trait survives
  // `armor = 0` and a `pack` trait would spawn uncontrolled extras.
  const e = spawnEnemy(w, 'husk', x, y)!;
  e.hp = FULL_HP;
  e.maxHp = FULL_HP;
  e.speed = 0;
  e.armor = 0;
  // Every corridor test in the sim widens by `e.radius`; zeroing it makes the
  // measured boundary exactly the half-width, with no per-enemy slack.
  e.radius = 0;
  return e;
}

const content = new World(cfg()).content;

describe('fb146: dashWidth measured as a half-width from engine behaviour, per dash_* kind', () => {
  // `tests/ui-fb112-dash-slash-width.test.ts` carries a near-identical
  // `dash_line` probe. Kept in both: fb112's is that item's own proof and this
  // one is the third leg of a per-kind claim that would be incomplete without
  // it. If one is ever changed, change the other.
  it('dash_line (Swordsman, lineHit) strikes dashWidth to EITHER side of the dash line', () => {
    const eff = content.classByKey.get('swordsman')!.active2;
    expect(eff.kind).toBe('dash_line');
    const half = eff.dashWidth ?? 0;
    expect(half).toBeGreaterThan(0);

    const w = new World(cfg({ classKey: 'swordsman' }));
    w.warden.x = 4;
    w.warden.y = 12;
    // Nothing else on the field, so an `outside` assertion can only be about
    // the corridor (code-reviewer finding): a stray enemy would otherwise show
    // up as a mystery hit somewhere else in this file.
    expect(w.enemies.length).toBe(0);
    const scaled = half * w.derived.areaMul;
    const left = place(w, w.warden.x + 2, w.warden.y - scaled * 0.99);
    const right = place(w, w.warden.x + 2, w.warden.y + scaled * 0.99);
    const outside = place(w, w.warden.x + 2, w.warden.y + scaled * 1.01);
    w.rebuildBuckets();

    applyCommand(w, { k: 'class_active2', aimX: w.warden.x + 10, aimY: w.warden.y });

    expect(left.hp).toBeLessThan(FULL_HP);
    expect(right.hp).toBeLessThan(FULL_HP);
    expect(outside.hp).toBe(FULL_HP);
  });

  it('dash_trail (Pyromancer, GroundArea.radius) burns dashWidth out from the patch centre', () => {
    const eff = content.classByKey.get('pyromancer')!.active2;
    expect(eff.kind).toBe('dash_trail');
    const half = eff.dashWidth ?? 0;
    expect(half).toBeGreaterThan(0);

    const w = new World(cfg({ classKey: 'pyromancer' }));
    w.warden.x = 4;
    w.warden.y = 12;
    expect(w.enemies.length).toBe(0);
    const scaled = half * w.derived.areaMul;
    // Perpendicular to a +X dash, so both sit at exactly their offset from the
    // FIRST trail patch (dropped at the pre-dash position) and strictly
    // further from every later one.
    const inside = place(w, w.warden.x, w.warden.y + scaled * 0.99);
    const outside = place(w, w.warden.x, w.warden.y + scaled * 1.01);
    w.rebuildBuckets();

    applyCommand(w, { k: 'class_active2', aimX: w.warden.x + 10, aimY: w.warden.y });
    // Ground areas deal damage per second of sim time, not on contact.
    // `updateAreas` directly rather than a full run loop: it is the single
    // function that owns `w.areas`, and driving it alone keeps the measurement
    // about the patch radius instead of about wave spawning or enemy movement
    // (both enemies are pinned at `speed = 0` regardless).
    for (let i = 0; i < 90; i++) updateAreas(w, 1 / 60);

    expect(inside.hp).toBeLessThan(FULL_HP);
    expect(outside.hp).toBe(FULL_HP);
  });

  it('dash_heal (Bloodlord, fireCrimsonRush\'s inline line test) counts dashWidth to either side', () => {
    const eff = content.classByKey.get('bloodlord')!.active2;
    expect(eff.kind).toBe('dash_heal');
    const half = eff.dashWidth ?? 0;
    const perEnemy = eff.healPerEnemy ?? 0;
    expect(half).toBeGreaterThan(0);
    expect(perEnemy).toBeGreaterThan(0);

    // Crimson Rush heals per enemy passed and deals no damage, so the count is
    // read off the Warden's HP — which has to have room to move.
    const measure = (offsetOfScaledHalf: number): number => {
      const w = new World(cfg({ classKey: 'bloodlord' }));
      w.warden.x = 4;
      w.warden.y = 12;
      w.warden.hp = 1;
      expect(w.enemies.length).toBe(0);
      place(w, w.warden.x + 2, w.warden.y + offsetOfScaledHalf * half * w.derived.areaMul);
      w.rebuildBuckets();
      const before = w.warden.hp;
      applyCommand(w, { k: 'class_active2', aimX: w.warden.x + 10, aimY: w.warden.y });
      return w.warden.hp - before;
    };

    expect(measure(-0.99)).toBeGreaterThan(0);
    expect(measure(0.99)).toBeGreaterThan(0);
    expect(measure(1.01)).toBe(0);
  });
});
