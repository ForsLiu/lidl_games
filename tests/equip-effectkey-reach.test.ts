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
 *  3. *Flipping it changes nothing observable — or is refused outright.*
 *     `Content` is rebuilt from a copy of `data/equipment.json` with every
 *     `effectKey` blanked; all three mechanics and every item's rendered
 *     effect text are asserted identical against the shipped build. A
 *     *cross-wired* copy (every non-`'none'` `effectKey` rotated onto a
 *     different item's key) no longer loads at all as of fb085 — asserted
 *     directly, its own row below. This is the row a main-lane wiring-up flips.
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

/**
 * fb085 update: the main-lane decision landed. `effectKey` opened from the
 * closed 4-member zod enum this describe block used to pin as "the one
 * allowed mention" into a validated open registry
 * (`KNOWN_EQUIPMENT_EFFECT_KEYS`) plus a real load-time reader
 * (`validateEquipmentEffectKey`) — exactly the "a new reader reddens this"
 * outcome this file's header always said a main-lane wiring-up would cause.
 * `content.ts` now legitimately mentions `.effectKey` three times (the
 * schema field declaration, and the validator's own two `item.effectKey`
 * reads) instead of one, so its `ALLOWED` entry is now a list, not a single
 * pattern — the census keeps its real job: *outside* `content.ts` (its own
 * registry/validator) and the one unrelated `canvas.ts` parameter, still
 * nothing reads `effectKey` for behaviour. Claims 2 and 3 below are
 * unaffected: the three non-stat mechanics still gate on the item's own key
 * (`hasEquipment`), never on `effectKey`, and flipping `effectKey` among
 * already-registered values still changes no sim/rendered observable —
 * `validateEquipmentEffectKey` is a load-time *typo guard*, not a runtime
 * dispatch.
 */
describe('c023 — the census: no code under src/ reads equipment effectKey for behaviour', () => {
  /**
   * The mentions allowed to exist, named individually rather than filtered by
   * a pattern — a pattern would also hide an unexpected one.
   */
  const ALLOWED: Record<string, RegExp[]> = {
    // fb085: the schema field declaration (no longer a closed enum literal),
    // and the whole registry validator function — matched end-to-end rather
    // than line-by-line, so a reformat inside it does not itself go stray —
    // the load-time typo guard this file's header names as the expected
    // "new reader" (now with two checks: registry membership, and the
    // key-match qa-playtester finding added the same item).
    'src/sim/content.ts': [
      /effectKey: str\.default\('none'\),/,
      /export function validateEquipmentEffectKey\([\s\S]*?\n\}/,
    ],
    // A local parameter of the same name on the Core VFX lookup — nothing to do
    // with equipment. Named so it cannot quietly become an equipment reader.
    'src/render/canvas.ts': [/function coreEffectColor\(coreKey: string, effectKey: string/],
  };

  it('every `.effectKey` mention in src/ is one of the registry/validator (content.ts) or the unrelated core-VFX parameter (canvas.ts)', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(join(process.cwd(), 'src'))) {
      const rel = file.replace(process.cwd() + '/', '').replace(/\\/g, '/');
      const code = stripComments(readFileSync(file, 'utf8'));
      if (!/\beffectKey\b/.test(code)) continue;
      const allowed = ALLOWED[rel];
      if (allowed && allowed.every((re) => re.test(code))) {
        // Permitted — but only for the shapes named above; strip each in turn
        // and see if anything reads `.effectKey` beyond them.
        let stray = code;
        for (const re of allowed) stray = stray.replace(re, '');
        if (/\.effectKey\b/.test(stray)) offenders.push(`${rel} (beyond its allowed mentions)`);
        continue;
      }
      offenders.push(rel);
    }
    expect(
      offenders,
      "something under src/ now reads equipment effectKey for behaviour beyond content.ts's own load-time " +
        'registry check — c023\'s "keyed on the item, not the field" claim (2) may no longer hold',
    ).toEqual([]);
  });

  it('every allowed mention is still present, so the census is measuring something', () => {
    for (const [rel, res] of Object.entries(ALLOWED)) {
      const code = stripComments(readFileSync(join(process.cwd(), rel), 'utf8'));
      for (const re of res) expect(code, `${rel} no longer contains an allowed effectKey mention (${re})`).toMatch(re);
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

/**
 * fb085 update: `crosswired` (rotating `effectKey` onto a *different* item's
 * key) used to be this section's other half of claim 3 alongside `blanked` —
 * both built a `Content` that loaded clean, so "identical sim/render output
 * under either" was the proof nothing consulted the field. fb085 added
 * `validateEquipmentEffectKey`'s key-match check (a qa-playtester finding:
 * without it, an item authored with a registered-but-mismatched `effectKey`
 * would silently never reach its hook), which makes a genuine cross-wire
 * **refused at load**, not merely inert — `loadContent` throws before a
 * `CROSSWIRED` Content can even exist. That is a *stronger* form of claim 3,
 * not a broken one: the field's own consulted-ness is now exactly "content.ts's
 * own load-time check, and nothing else" — proven by the refusal test below —
 * so `crosswired` retired as a flip and survives as that one assertion.
 * `blanked` (proving the field is not *required*) is unaffected and still
 * backs every probe/render check that follows.
 */
type Flip = 'blanked';

/** `Content` rebuilt from a copy of `/data` with every `effectKey` blanked to `'none'`. */
function contentWith(_flip: Flip): Content {
  const doc = JSON.parse(JSON.stringify(content.raw.equipment)) as {
    items: { key: string; effectKey?: string }[];
  };
  for (const item of doc.items) item.effectKey = 'none';
  return loadContent({ equipment: doc });
}

/** A genuine cross-wire: `effectKey` rotated onto a *different* item's key (or, for a non-SPECIAL item, `'sleeve_sword'`) — the shape `validateEquipmentEffectKey`'s key-match check now refuses. */
function crosswiredDoc(): { items: { key: string; effectKey?: string }[] } {
  const doc = JSON.parse(JSON.stringify(content.raw.equipment)) as {
    items: { key: string; effectKey?: string }[];
  };
  const order = [...SPECIAL];
  for (const item of doc.items) {
    const at = order.indexOf(item.key as (typeof SPECIAL)[number]);
    item.effectKey = at >= 0 ? order[(at + 1) % order.length] : 'sleeve_sword';
  }
  return doc;
}

const BLANKED = contentWith('blanked');

describe('c023 — fb085: a genuine effectKey cross-wire is refused at load, not silently consulted', () => {
  it('loadContent throws on a cross-wired equipment.json (the mismatch validateEquipmentEffectKey now catches)', () => {
    expect(() => loadContent({ equipment: crosswiredDoc() })).toThrow(/does not match its own key/);
  });
});

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
  const firstEnemy = c.enemies.enemies[0];
  if (!firstEnemy) throw new Error('no enemies in content');
  const e = spawnEnemy(w, firstEnemy.key, w.warden.x + 1, w.warden.y)!;
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

describe('c023 — blanking every effectKey changes no sim observable', () => {
  it('the flipped Content really did change the field (or this measures nothing)', () => {
    expect(BLANKED.equipment.items.every((i) => i.effectKey === 'none')).toBe(true);
  });

  for (const probe of PROBES) {
    it(`${probe.name}: identical under a blanked effectKey`, () => {
      const shipped = probe.run(content);
      expect(probe.run(BLANKED), `${probe.name}: blanking effectKey moved it`).toBeCloseTo(shipped, 10);
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

describe('c023 — blanking every effectKey changes no rendered effect text', () => {
  const CTX = { classKey: 'swordsman' } as Parameters<typeof equipmentEffectMarkup>[2];

  for (const item of content.equipment.items) {
    it(`${item.key}: the same four markup strings under a blanked effectKey`, () => {
      const render = (c: Content) => {
        const it2 = c.equipmentByKey.get(item.key)!;
        return [
          equipmentEffectMarkup(c, it2, CTX),
          equipmentFallbackMarkup(c, CTX, it2),
          equipmentSpecialNoteMarkup(it2, CTX),
          equipmentCodexDetailMarkup(c, it2),
        ].join(' ');
      };
      const shipped = render(content);
      expect(render(BLANKED), `${item.key}: blanking effectKey changed its text`).toBe(shipped);
    });
  }

  it('the markup is non-empty for the three special items, so the comparison has substance', () => {
    for (const key of SPECIAL) {
      const item = content.equipmentByKey.get(key)!;
      expect(equipmentEffectMarkup(content, item, CTX).length, `${key} rendered nothing`).toBeGreaterThan(0);
    }
  });
});
