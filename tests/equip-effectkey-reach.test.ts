/**
 * c023 (BACKLOG-CONTENT, lane `content`) — **`equipment.items[].effectKey` is
 * a dead field, measured rather than argued.**
 *
 * Found by QA on `c012`: setting `sleeve_sword`'s `effectKey` to `"none"`
 * changes no behaviour and no UI text, and `equip-spec-numbers`, `fb015`,
 * `fb028`, `fb022`, `codex`, `character-panel` and `b003-stash-ux` all stay
 * green. A zod enum in `src/sim/content.ts:1052` validates a field nothing
 * reads.
 *
 * The sim gates all three of its non-stat equipment mechanics on
 * `hasEquipment(w, '<item key>')` — the *item's own key*, not its `effectKey`
 * — and `src/ui/equipment-info.ts` renders `effectNote`/`effectNoteWith`,
 * never `effectKey`.
 *
 * **This item is the measurement, not the removal.** Deleting the field
 * touches `src/sim/content.ts`, outside this lane's Scope; whether it should be
 * removed or *wired up* is a main-lane decision. What this file does is make
 * the current answer a red/green fact — the shape `c013` uses — so the
 * main-lane change flips a test instead of relying on someone re-deriving all
 * of this. `fb056` is about to copy the field onto fifteen more items, which is
 * why it is worth pinning now rather than after.
 *
 * **Three claims, each measured a different way:**
 *
 *  1. *Nobody reads it.* A source census over `src/**` for `.effectKey`, with
 *     the only two permitted hits named — the zod schema line that validates
 *     it, and `render/canvas.ts`'s unrelated core-VFX parameter of the same
 *     name. A new reader reddens this.
 *  2. *The mechanics are keyed on the item, not the field.* The three
 *     `hasEquipment(w, '<key>')` gates are anchored by regex in
 *     `src/sim/classes.ts`, so re-pointing one at `effectKey` reddens this.
 *  3. *Flipping it changes nothing observable.* `Content` is rebuilt from a
 *     copy of `data/equipment.json` with every `effectKey` blanked, and again
 *     with them deliberately cross-wired onto the wrong items; all three
 *     mechanics and every item's rendered effect text are asserted identical
 *     against the shipped build. This is the row a main-lane wiring-up flips.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { tickClassCharge, useClassActive2 } from '../src/sim/classes';
import { loadContent, type Content } from '../src/sim/content';
import { spawnEnemy } from '../src/sim/enemies';
import { emptyInput, type TickInput } from '../src/sim/types';
import { World } from '../src/sim/world';
import {
  equipmentCodexDetailMarkup,
  equipmentEffectMarkup,
  equipmentFallbackMarkup,
  equipmentSpecialNoteMarkup,
} from '../src/ui/equipment-info';
import { cfg } from './helpers';

const content = loadContent();

const DT = 1 / 60;

/** The three items whose mechanic is not stat-shaped — the only ones with a non-`none` effectKey. */
const SPECIAL = ['sleeve_sword', 'swordsman_armor', 'swordsman_shoes'] as const;

/* ------------------------------------------------- 1. nobody reads the field */

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p));
    else if (entry.endsWith('.ts')) out.push(p);
  }
  return out;
}

/** Strips comments, so prose *about* the field never counts as a read (architecture.test.ts's convention). */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('c023 — the census: no code under src/ reads equipment effectKey', () => {
  /**
   * The two hits that are allowed to exist, named individually rather than
   * filtered by a pattern — a pattern would also hide the third.
   */
  const ALLOWED: Record<string, RegExp> = {
    // The zod enum that *validates* the field. This is the whole point: it is
    // schema, not a reader, and it is what makes the field look load-bearing.
    'src/sim/content.ts': /effectKey: z\.enum\(/,
    // A local parameter of the same name on the Core VFX lookup — nothing to do
    // with equipment. Named so it cannot quietly become an equipment reader.
    'src/render/canvas.ts': /function coreEffectColor\(coreKey: string, effectKey: string/,
  };

  it('the only two `.effectKey` mentions in src/ are the schema and an unrelated core-VFX parameter', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(join(process.cwd(), 'src'))) {
      const rel = file.replace(process.cwd() + '/', '').replace(/\\/g, '/');
      const code = stripComments(readFileSync(file, 'utf8'));
      if (!/\beffectKey\b/.test(code)) continue;
      const allowed = ALLOWED[rel];
      if (allowed && allowed.test(code)) {
        // Permitted — but only for the shape named above.
        const stray = code.replace(allowed, '');
        if (/\.effectKey\b/.test(stray)) offenders.push(`${rel} (beyond its allowed mention)`);
        continue;
      }
      offenders.push(rel);
    }
    expect(
      offenders,
      'something under src/ now reads equipment effectKey — the field is no longer dead, so c023\'s ' +
        'measurement is stale and the main-lane decision (remove it, or keep it wired) has been made',
    ).toEqual([]);
  });

  it('both allowed mentions are still present, so the census is measuring something', () => {
    for (const [rel, re] of Object.entries(ALLOWED)) {
      const code = stripComments(readFileSync(join(process.cwd(), rel), 'utf8'));
      expect(code, `${rel} no longer contains its allowed effectKey mention`).toMatch(re);
    }
  });
});

/* --------------------------------- 2. the mechanics are keyed on the item */

describe('c023 — the three non-stat mechanics gate on the item key, never on effectKey', () => {
  const classes = stripComments(readFileSync(join(process.cwd(), 'src/sim/classes.ts'), 'utf8'));

  for (const key of SPECIAL) {
    it(`${key}: gated by hasEquipment(w, '${key}')`, () => {
      expect(classes, `${key}'s mechanic is no longer gated on its own item key`).toMatch(
        new RegExp(`hasEquipment\\(w, '${key}'\\)`),
      );
    });
  }

  it('`/data` really does author these three, and only these three, a non-none effectKey', () => {
    const nonNone = content.equipment.items.filter((i) => i.effectKey !== 'none').map((i) => i.key);
    expect(nonNone.sort()).toEqual([...SPECIAL].sort());
  });
});

/* ------------------------------- 3. flipping the field changes nothing */

type Flip = 'blanked' | 'crosswired';

/** `Content` rebuilt from a copy of `/data` with every `effectKey` rewritten. */
function contentWith(flip: Flip): Content {
  const doc = JSON.parse(JSON.stringify(content.raw.equipment)) as {
    items: { key: string; effectKey?: string }[];
  };
  // Deliberately wrong, not merely absent: `blanked` proves the field is not
  // *required*, `crosswired` proves it is not *consulted* — an implementation
  // that read it would behave differently under one or the other.
  const order = [...SPECIAL];
  for (const item of doc.items) {
    if (flip === 'blanked') item.effectKey = 'none';
    else {
      const at = order.indexOf(item.key as (typeof SPECIAL)[number]);
      if (at >= 0) item.effectKey = order[(at + 1) % order.length];
      else item.effectKey = 'sleeve_sword';
    }
  }
  return loadContent({ equipment: doc });
}

const BLANKED = contentWith('blanked');
const CROSSWIRED = contentWith('crosswired');

function idle(over: Partial<TickInput> = {}): TickInput {
  return { ...emptyInput(), ...over };
}

function swordsman(c: Content, equipment: string[]): World {
  const w = new World(cfg({ classKey: 'swordsman', equipment }), c);
  w.gold = 1e6;
  w.warden.attackCooldown = 1e9;
  return w;
}

/** Circle Slash's charge after one held tick — `sleeve_sword` makes it start at the cap. */
function chargeAfterOneTick(c: Content, equipment: string[]): number {
  const w = swordsman(c, equipment);
  const cls = c.classByKey.get('swordsman')!;
  tickClassCharge(w, cls, idle({ aimX: w.warden.x + 2, aimY: w.warden.y, active1Held: true }), DT);
  return w.warden.active1Charge;
}

/**
 * How far Dash Slash travels — `swordsman_shoes` doubles it.
 *
 * Read off `warden.dashTravel` (`wardenmove.ts` `startDashTravel`), which is
 * where the target actually lands. The first draft guessed `dashToX/dashToY`,
 * fields that do not exist, so both readings were `0` and the two dash probes
 * passed by comparing nothing to nothing — caught by this file's own
 * "the probes are live" row, which is why that row exists.
 */
function dashDistance(c: Content, equipment: string[]): number {
  const w = swordsman(c, equipment);
  expect(useClassActive2(w, w.warden.x + 5, w.warden.y), 'harness: Dash Slash did not fire').toBe(true);
  const t = w.warden.dashTravel;
  expect(t, 'harness: Dash Slash started no travel to measure').toBeDefined();
  return Math.hypot(t!.x1 - t!.x0, t!.y1 - t!.y0);
}

/**
 * Circle Slash's released damage with both Swordsman Armor and Sleeve Sword —
 * the cross-item boost (`fb052`), the third mechanic and the only one that
 * needs two items equipped at once.
 */
function armorBoostedRelease(c: Content, equipment: string[]): number {
  const w = swordsman(c, equipment);
  w.stats.addAll('test:atkspd', { attackSpeed: 1 });
  w.recomputeDerived();
  const cls = c.classByKey.get('swordsman')!;
  const aim = { aimX: w.warden.x + 2, aimY: w.warden.y };
  const e = spawnEnemy(w, c.enemies.enemies[0].key, w.warden.x + 1, w.warden.y)!;
  e.hp = 1e7;
  e.maxHp = 1e7;
  e.speed = 0;
  e.armor = 0;
  w.rebuildBuckets();
  // Circle Slash is a charge kind: it fires from `tickClassCharge`'s release,
  // never from `useClassActive` (which the first draft called and which
  // correctly returned false). One held tick then one released tick is the
  // whole flow — and with Sleeve Sword the held tick is already at the cap.
  tickClassCharge(w, cls, idle({ ...aim, active1Held: true }), DT);
  const before = e.hp;
  tickClassCharge(w, cls, idle({ ...aim, active1Held: false }), DT);
  return before - e.hp;
}

const PROBES: Array<{ name: string; run: (c: Content) => number; equipment: string[] }> = [
  { name: 'sleeve_sword: charge starts at the cap', run: (c) => chargeAfterOneTick(c, ['sleeve_sword']), equipment: ['sleeve_sword'] },
  { name: 'no sleeve_sword: charge starts from zero', run: (c) => chargeAfterOneTick(c, []), equipment: [] },
  { name: 'swordsman_shoes: Dash Slash distance doubles', run: (c) => dashDistance(c, ['swordsman_shoes']), equipment: ['swordsman_shoes'] },
  { name: 'no shoes: Dash Slash distance is the authored one', run: (c) => dashDistance(c, []), equipment: [] },
  {
    name: 'swordsman_armor + sleeve_sword: the cross-item release',
    run: (c) => armorBoostedRelease(c, ['swordsman_armor', 'sleeve_sword']),
    equipment: ['swordsman_armor', 'sleeve_sword'],
  },
];

describe('c023 — flipping every effectKey changes no sim observable', () => {
  it('the two flipped Contents really did change the field (or this measures nothing)', () => {
    expect(BLANKED.equipment.items.every((i) => i.effectKey === 'none')).toBe(true);
    for (const key of SPECIAL) {
      expect(CROSSWIRED.equipmentByKey.get(key)!.effectKey).not.toBe(
        content.equipmentByKey.get(key)!.effectKey,
      );
    }
  });

  for (const probe of PROBES) {
    it(`${probe.name}: identical under blanked and cross-wired effectKeys`, () => {
      const shipped = probe.run(content);
      expect(probe.run(BLANKED), `${probe.name}: blanking effectKey moved it`).toBeCloseTo(shipped, 10);
      expect(probe.run(CROSSWIRED), `${probe.name}: cross-wiring effectKey moved it`).toBeCloseTo(shipped, 10);
    });
  }

  it('the probes are live: the two gated mechanics really do differ with and without their item', () => {
    // Without this the block above would pass just as well on five readings
    // that were all zero — the failure mode c005 exists to prevent.
    expect(chargeAfterOneTick(content, ['sleeve_sword'])).toBeGreaterThan(chargeAfterOneTick(content, []));
    expect(dashDistance(content, ['swordsman_shoes'])).toBeGreaterThan(dashDistance(content, []));
    // And the cross-item one, which has no single-item control: the boost only
    // exists with both equipped, so its control is Sleeve Sword alone.
    expect(armorBoostedRelease(content, ['swordsman_armor', 'sleeve_sword'])).toBeGreaterThan(
      armorBoostedRelease(content, ['sleeve_sword']),
    );
  });
});

describe('c023 — flipping every effectKey changes no rendered effect text', () => {
  const CTX = { classKey: 'swordsman' } as Parameters<typeof equipmentEffectMarkup>[2];

  for (const item of content.equipment.items) {
    it(`${item.key}: the same four markup strings under blanked and cross-wired effectKeys`, () => {
      const render = (c: Content) => {
        const it2 = c.equipmentByKey.get(item.key)!;
        return [
          equipmentEffectMarkup(c, it2, CTX),
          equipmentFallbackMarkup(c, CTX, it2),
          equipmentSpecialNoteMarkup(it2, CTX),
          equipmentCodexDetailMarkup(c, it2),
        ].join(' ');
      };
      const shipped = render(content);
      expect(render(BLANKED), `${item.key}: blanking effectKey changed its text`).toBe(shipped);
      expect(render(CROSSWIRED), `${item.key}: cross-wiring effectKey changed its text`).toBe(shipped);
    });
  }

  it('the markup is non-empty for the three special items, so the comparison has substance', () => {
    for (const key of SPECIAL) {
      const item = content.equipmentByKey.get(key)!;
      expect(equipmentEffectMarkup(content, item, CTX).length, `${key} rendered nothing`).toBeGreaterThan(0);
    }
  });
});
