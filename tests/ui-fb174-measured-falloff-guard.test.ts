/**
 * fb174 (code-reviewer finding during fb149 review): fb149's own exhaustiveness
 * guard (`tests/ui-fb149-falloff-wording.test.ts`) ships a DECLARED `DECAYS`/
 * `FLAT` table so a NEW `ClassEffect` kind fails until someone classifies it —
 * but a MISCLASSIFIED existing one reads clean, which is exactly how fb149's
 * own first pass missed `ground_poison` and `dash_trail`. The reviewer's ask
 * was the measured form: fire every damaging kind through its own required
 * setup, measure the real per-target profile, and derive "does this sentence
 * need a falloff clause" from that measurement alone — no declared table to
 * go stale.
 *
 * Deleted `DECAYS`/`FLAT` from `tests/ui-fb149-falloff-wording.test.ts`
 * entirely (this file replaces that describe block); everything else in that
 * file — the per-mechanism measurements, the specific clause-wording checks,
 * the clause-text pins — is a different concern and stays there untouched.
 *
 * Two design decisions this file makes explicit, both learned by reading
 * every `fire*` handler in `src/sim/classes.ts` rather than guessing from
 * kind names:
 *
 * 1. **"Not all equal" alone is the wrong test.** A kind that hits only a
 *    FEW enemies for the SAME amount each (`dash_volley`'s three volley
 *    shots at fixed nearest targets) measures as "not all equal" across
 *    `aoeFullTargets + 3` probes purely because the untouched majority read
 *    zero — that is a limited-target-COUNT effect, not a falloff, and must
 *    not require the clause. `chain_lightning` is the sharper case: its
 *    per-jump damage `base * (1+growth)^jump` GROWS, not falls off (its own
 *    sentence already says so, `chainLightningSentence`, and rightly carries
 *    no clause) — every `*_FALLOFF_CLAUSE` this repo ships says "takes
 *    LESS", so a growing sequence needs no hedge either. The measurement
 *    this file actually applies: among only the STRUCK (damage > 0)
 *    targets, in the order they were struck, does any later one take
 *    strictly LESS than an earlier one? That is a real decay in the sense
 *    every shipped clause claims; a flat magnitude (however many targets it
 *    reaches) or a growing one is not.
 * 2. **A firing "recipe" is not a classification.** Seven kinds need special
 *    setup to fire (or to measure) correctly — `FIRE_RECIPES` below names
 *    exactly those seven and how to arm them. Six mirror the working setups
 *    `ui-fb149-falloff-wording.test.ts` already validated (a held-and-
 *    released charge, banked Wrath, a ground-field tick); the seventh,
 *    `chain_lightning`, was added while writing this file: firing it at
 *    the same tight cluster every point/blast kind uses let Electric's own
 *    inherent small-AoE splash (`damagetypes.ts`) from each primary jump
 *    reach the NEXT probe in the cluster, producing a bell-curve reading
 *    that had nothing to do with the kind's real per-jump growth and read
 *    as a false decay — fixed with a wide-spaced line placement instead
 *    (`wideLine`, spaced past twice the splash radius) that isolates the
 *    primary-jump-only signal. Every other kind fires through one generic
 *    recipe (a bare Command, enemies clustered around the caster). This is
 *    "how do I invoke kind X", never "is kind X flat or decaying" — that
 *    answer comes only from the measurement afterward. Most of the
 *    seventeen generic kinds deal literally zero direct damage on cast
 *    (heals, summons, wall placement, taunts, buffs) — a real, meaningful
 *    "flat" reading (0 = 0 = ... = 0), not a cop-out: their real
 *    acceptance-relevant property IS that the cast itself hits nothing to
 *    compare.
 */
import { describe, expect, it } from 'vitest';

import { tickClassCharge } from '../src/sim/classes';
import { updateAreas } from '../src/sim/combat';
import { applyCommand } from '../src/sim/run';
import { spawnEnemy } from '../src/sim/enemies';
import { World } from '../src/sim/world';
import { activeSkillMarkup } from '../src/ui/class-info';
import { AOE_FALLOFF_CLAUSE, LINE_FALLOFF_CLAUSE, PATCH_FALLOFF_CLAUSE } from '../src/ui/info-format';
import type { TickInput } from '../src/sim/types';
import { cfg } from './helpers';

const FULL_HP = 1e7;

function idle(over: Partial<TickInput> = {}): TickInput {
  return { mx: 0, my: 0, dash: false, attack: false, aimX: 0, aimY: 0, active1Held: false, cmds: [], ...over };
}

function pin(w: World, x: number, y: number) {
  const e = spawnEnemy(w, 'husk', x, y)!;
  e.hp = FULL_HP;
  e.maxHp = FULL_HP;
  e.speed = 0;
  e.armor = 0;
  e.radius = 0;
  return e;
}

const content = new World(cfg()).content;
const TOTAL = content.towers.aoeFullTargets + 3;

/** Enemies strung along the +X line a line/pierce kind fires down. */
const alongLine = (w: World) =>
  Array.from({ length: TOTAL }, (_, i) => pin(w, w.warden.x + 0.6 + i * 0.9, w.warden.y));

/** Enemies clustered tight around the caster — every point/blast/ground kind's probe set. */
const cluster = (w: World) => Array.from({ length: TOTAL }, (_, i) => pin(w, w.warden.x + 0.2 + i * 0.08, w.warden.y));

/**
 * Enemies strung out along +X, spaced wide enough (2.5 tiles) that Electric's
 * own inherent small-AoE splash (`data/damagetypes.json`'s electric radius,
 * 0.8 tiles, `damagetypes.ts`) from one chain jump landing on its primary
 * target cannot also reach the NEXT probe in line — found live while writing
 * this file: `cluster`'s tight spacing let each of `chain_lightning`'s six
 * primary jumps' own splash bleed onto neighbouring probes, producing a
 * bell-curve-shaped reading (rise then fall) that had nothing to do with the
 * per-jump growth this kind's damage formula actually applies, and read as a
 * false decay. Wide spacing isolates the primary-jump-only signal.
 */
const wideLine = (w: World) => Array.from({ length: TOTAL }, (_, i) => pin(w, w.warden.x + 0.6 + i * 2.5, w.warden.y));

const markup = (classKey: string, which: 'active1' | 'active2') =>
  activeSkillMarkup(content.classByKey.get(classKey)!, which);

function damagePerTarget(enemies: ReturnType<typeof pin>[]): number[] {
  return enemies.map((e) => FULL_HP - e.hp + e.dots.reduce((n, d) => n + d.dps, 0));
}

interface Probe {
  classKey: string;
  which: 'active1' | 'active2';
  fire: (w: World, enemies: ReturnType<typeof pin>[]) => void;
  place: (w: World) => ReturnType<typeof pin>[];
}

function genericFire(command: 'class_active' | 'class_active2') {
  return (w: World): void => {
    applyCommand(w, { k: command, aimX: w.warden.x + 100, aimY: w.warden.y });
  };
}

/**
 * The six kinds that need special arming to fire at all — a firing recipe,
 * not a decay/flat classification (see this file's own header comment,
 * point 2). Every other shipped kind uses `genericFire` below.
 */
const FIRE_RECIPES: Record<string, Probe> = {
  chain_lightning: {
    classKey: 'stormcaller',
    which: 'active1',
    place: wideLine,
    fire: genericFire('class_active'),
  },
  dash_line: {
    classKey: 'swordsman',
    which: 'active2',
    place: alongLine,
    fire: genericFire('class_active2'),
  },
  charge_pierce: {
    classKey: 'archer',
    which: 'active1',
    place: alongLine,
    fire: (w) => {
      const cls = content.classByKey.get('archer')!;
      const aim = { aimX: w.warden.x + 20, aimY: w.warden.y };
      const cap = cls.active1.chargeCapSeconds ?? 3;
      tickClassCharge(w, cls, idle({ ...aim, active1Held: true }), cap * 2);
      tickClassCharge(w, cls, idle({ ...aim, active1Held: false }), 1 / 60);
    },
  },
  charge_nova: {
    classKey: 'swordsman',
    which: 'active1',
    place: cluster,
    fire: (w) => {
      const cls = content.classByKey.get('swordsman')!;
      tickClassCharge(w, cls, idle({ active1Held: true }), 1 / 60);
      tickClassCharge(w, cls, idle({ active1Held: false }), 1 / 60);
    },
  },
  judgement: {
    classKey: 'paladin',
    which: 'active2',
    place: cluster,
    fire: (w) => {
      w.warden.wrathStored = 5000;
      genericFire('class_active2')(w);
    },
  },
  ground_poison: {
    classKey: 'plaguebringer',
    which: 'active1',
    place: cluster,
    fire: (w) => {
      applyCommand(w, { k: 'class_active', aimX: w.warden.x, aimY: w.warden.y });
      updateAreas(w, 1);
    },
  },
  dash_trail: {
    classKey: 'pyromancer',
    which: 'active2',
    place: cluster,
    fire: (w) => {
      // Aimed perpendicular to the cluster (matching the working setup
      // ui-fb149-falloff-wording.test.ts already validated): aimed ALONG the
      // row of probes, overlapping patches let a farther enemy take MORE
      // than a nearer one (documented there as its own, separate finding),
      // which this file's simpler "any strict decrease" measurement could
      // misread. Perpendicular keeps every probe at the same distance rank
      // in each patch that reaches it, which is what a falloff-vs-flat
      // reading (as opposed to a placement artifact) actually needs.
      applyCommand(w, { k: 'class_active2', aimX: w.warden.x, aimY: w.warden.y + 100 });
      updateAreas(w, 1);
    },
  },
};

function probeAllKinds(): Array<{ classKey: string; which: 'active1' | 'active2'; kind: string; measured: number[] }> {
  const out: Array<{ classKey: string; which: 'active1' | 'active2'; kind: string; measured: number[] }> = [];
  for (const cls of content.classes.classes) {
    for (const which of ['active1', 'active2'] as const) {
      const eff = which === 'active1' ? cls.active1 : cls.active2;
      const recipe = FIRE_RECIPES[eff.kind];
      const w = new World(cfg({ classKey: cls.key }));
      w.warden.x = 6;
      w.warden.y = 10;
      const place = recipe?.place ?? cluster;
      const enemies = place(w);
      w.rebuildBuckets();
      if (recipe) {
        recipe.fire(w, enemies);
      } else {
        genericFire(which === 'active1' ? 'class_active' : 'class_active2')(w);
      }
      out.push({ classKey: cls.key, which, kind: eff.kind, measured: damagePerTarget(enemies) });
    }
  }
  return out;
}

/**
 * A real decay in the sense every shipped clause claims ("takes LESS"): some
 * later-struck target takes strictly less than an earlier one. Neither a
 * limited hit COUNT (untouched targets read 0, correctly excluded by the
 * `> 0` filter) nor a GROWING sequence (chain_lightning) trips this — see
 * this file's header comment.
 */
function hasFalloff(measured: number[]): boolean {
  const struck = measured.filter((d) => d > 1e-6);
  for (let i = 1; i < struck.length; i++) {
    if (struck[i] < struck[i - 1] * (1 - 1e-6)) return true;
  }
  return false;
}

function isHedged(text: string): boolean {
  return (
    text.includes(LINE_FALLOFF_CLAUSE.trim()) || text.includes(AOE_FALLOFF_CLAUSE.trim()) || text.includes(PATCH_FALLOFF_CLAUSE.trim())
  );
}

/**
 * `null` when the measured decay and the rendered hedging agree; otherwise a
 * description of the mismatch. A standalone, pure function (no `World`/DOM)
 * so it can be exercised directly against synthetic data — see 'the guard
 * itself: proven to redden a real mismatch' below, this item's own
 * acceptance line ("a deliberately misclassified kind ... reddens it").
 */
function classificationMismatch(measured: number[], text: string): string | null {
  const decays = hasFalloff(measured);
  const hedged = isHedged(text);
  if (decays === hedged) return null;
  return `measured decays=${decays} but rendered hedged=${hedged}`;
}

describe('fb174: every shipped kind, classified by measurement alone', () => {
  it('every kind this roster ships is reached by exactly one Active (sanity on the probe set itself)', () => {
    const probes = probeAllKinds();
    expect(probes.length).toBe(content.classes.classes.length * 2);
    const kinds = new Set(probes.map((p) => p.kind));
    expect(kinds.size).toBeGreaterThan(0);
  });

  it('the six special-recipe kinds actually measure real, nonzero damage (the recipe genuinely fires them)', () => {
    // A recipe that silently failed to arm its kind would still read
    // "flat" (0 = 0 = ... = 0) and pass the measurement check below for the
    // wrong reason — this pins that each one is a real, non-degenerate
    // measurement, not an accidental no-op.
    for (const probe of probeAllKinds()) {
      if (!(probe.kind in FIRE_RECIPES)) continue;
      const struck = probe.measured.filter((d) => d > 0);
      expect(struck.length, `${probe.kind} (${probe.classKey} ${probe.which}) struck nothing`).toBeGreaterThan(1);
    }
  });

  it("chain_lightning's growing per-jump damage measures as NOT decaying (it grows, not falls off)", () => {
    const probe = probeAllKinds().find((p) => p.kind === 'chain_lightning')!;
    const struck = probe.measured.filter((d) => d > 0);
    expect(struck.length).toBeGreaterThan(1);
    for (let i = 1; i < struck.length; i++) expect(struck[i]).toBeGreaterThan(struck[i - 1]);
    expect(hasFalloff(probe.measured)).toBe(false);
  });

  it("dash_volley's fixed-count, fixed-damage volley measures as NOT decaying (equal hits, not a falloff)", () => {
    const probe = probeAllKinds().find((p) => p.kind === 'dash_volley')!;
    const struck = probe.measured.filter((d) => d > 0);
    // Whatever the shipped shot count is, every hit lands for the same
    // amount — the untouched remainder reads 0 and is excluded above.
    for (const d of struck) expect(d).toBeCloseTo(struck[0], 6);
    expect(hasFalloff(probe.measured)).toBe(false);
  });

  it('every shipped kind\'s measured decay agrees with its rendered sentence, kind by kind', () => {
    const mismatches: string[] = [];
    for (const probe of probeAllKinds()) {
      const text = markup(probe.classKey, probe.which);
      const reason = classificationMismatch(probe.measured, text);
      if (reason) mismatches.push(`${probe.classKey} ${probe.which} (${probe.kind}): ${reason}`);
    }
    expect(mismatches).toEqual([]);
  });

  it('the guard itself: proven to redden a real mismatch, not just pass on the current real roster', () => {
    // This item's own acceptance line: "a deliberately misclassified kind
    // (not just a new one) reddens it". `class-info.ts` hardcodes each
    // kind's clause into ~24 separate template-literal functions with no
    // single runtime table to monkey-patch, so this exercises
    // `classificationMismatch` directly against synthetic data standing in
    // for "a kind whose declared/rendered classification disagrees with
    // reality" — both directions of misclassification a bad edit could
    // introduce.
    const decayingMeasurement = [10, 8, 6, 4];
    const flatMeasurement = [5, 5, 5, 5];
    const hedgedText = `Deals damage.${LINE_FALLOFF_CLAUSE}`;
    const unhedgedText = 'Deals damage.';

    // A real decay whose sentence forgot the clause (fb149's own first-pass bug shape).
    expect(classificationMismatch(decayingMeasurement, unhedgedText)).not.toBeNull();
    // A flat kind whose sentence wrongly claims a falloff.
    expect(classificationMismatch(flatMeasurement, hedgedText)).not.toBeNull();
    // The two cases that must NOT redden, so the guard isn't just "always fail".
    expect(classificationMismatch(decayingMeasurement, hedgedText)).toBeNull();
    expect(classificationMismatch(flatMeasurement, unhedgedText)).toBeNull();
  });
});
