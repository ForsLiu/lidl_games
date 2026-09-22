/**
 * fb056 — SPEC-FINAL §7.1's class equipment sets, as an auditable ledger:
 * c012's shape (`tests/equip-spec-numbers.test.ts`) for the 15 rows the owner
 * appended to §7. Every figure §7.1 states is read out of the spec's own table
 * (`tests/equip-class-sets-spec.ts`) and held to what `data/equipment.json`
 * authors — the numeric columns against `mods`, each "if not <class>" line
 * against `classFallback.mods`, and every mechanic magnitude against the
 * item's own `effectNums` (the field its engine hook reads through
 * `classEquipmentNum`, sim/equipment.ts). §7.1's text is hashed, so a figure
 * can only move by a visible spec edit in the same commit.
 *
 * The devices, each inherited from c012 or c008:
 *   - the table is parsed, not quoted, and a malformed row throws;
 *   - every numeral left in an Effect cell after the declared quotes are
 *     removed is a failure (an unaudited figure), as is any `effectNums` field
 *     that no quote reads and no `DESIGNER_FILL` entry excuses;
 *   - a numeral that restates a class kit's *baseline* ("instead of 3 s") is
 *     checked against `data/classes.json`, not trusted;
 *   - every item's mechanic has a behavioural test in
 *     `tests/equip-class-sets-behaviour.test.ts` naming it.
 *
 * refs: SPEC-FINAL §7.1, owner feedback `feature-class-equipment-sets`, fb056.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { loadContent, type EquipmentItem } from '../src/sim/content';
import { STREAM_NAMES } from '../src/sim/rng';
import { STAT_KEYS } from '../src/sim/statkeys';
import { World } from '../src/sim/world';
import {
  equipmentCodexDetailMarkup,
  equipmentFallbackMarkup,
  equipmentSpecialNoteMarkup,
  withEffectNums,
} from '../src/ui/equipment-info';
import { CLASS_SET_NAME, classSetRowFor, SPEC_71_TABLE, SPEC_71_TEXT } from './equip-class-sets-spec';
import { cfg } from './helpers';

const content = loadContent();

/**
 * sha256 of SPEC-FINAL.md from `### 7.1 Class equipment sets` up to
 * `## 8. Rewards`, newline-normalised. Regenerate deliberately: a change here
 * means §7.1 moved and every row below has to be re-read against it.
 */
const SPEC_71_SHA256 = '3112d286c1e3896b059e0f6321e0507adc7a1e1bb722a07c512b49d11caa53d8';

interface RawItem {
  key: string;
  slot: string;
  mods?: Record<string, number>;
  effectKey?: string;
  effectNums?: Record<string, number>;
  classFallback?: { notClassKey: string; mods: Record<string, number> };
  effectNote?: string;
  desc?: string;
}
const RAW = content.raw.equipment as { slots: string[]; items: RawItem[] };
const KEYS = Object.keys(CLASS_SET_NAME);

function raw(key: string): RawItem {
  const item = RAW.items.find((i) => i.key === key);
  if (!item) throw new Error(`data/equipment.json has no item ${key}`);
  return item;
}

const MUL = (n: number): number => n - 1;
const PCT = (n: number): number => n / 100;
const PCT_FASTER = (n: number): number => 1 + n / 100;

/** A numeral quoted from an Effect cell, and the authored number it must equal. */
interface Quote {
  /** Capture group 1 is the numeral. The *whole match* is removed before the residue check. */
  pattern: RegExp;
  /** §7.1's wording -> the authored encoding. */
  as?: (n: number) => number;
}

interface ClassSetLedger {
  /** The "if not <class>" clause: the one stat its fallback bag authors. */
  fallback: Quote & { stat: string };
  /** Mechanic magnitudes: `effectNums[field]` must equal the quoted numeral (converted). */
  nums: Readonly<Record<string, Quote>>;
  /**
   * Numerals the cell states as the *unmodified* kit's own figure ("instead
   * of 3 s") — checked against the class's own `/data` row, never trusted.
   */
  baselines?: readonly (Quote & { read: () => number; why: string })[];
  /** A figure §7.1 writes as a word, not a numeral. */
  words?: readonly { field: string; word: string; value: number }[];
}

const cls = (key: string) => {
  const c = content.classByKey.get(key);
  if (!c) throw new Error(`no class ${key}`);
  return c;
};

const LEDGER: Readonly<Record<string, ClassSetLedger>> = {
  plague_flask: {
    fallback: { stat: 'attackSpeed', pattern: /atk speed ×([\d.]+)/, as: MUL },
    nums: {
      poisonRatio: { pattern: /Poison \((\d+)% over/, as: PCT },
      poisonSeconds: { pattern: /over (\d+) s\)/ },
    },
  },
  miasma_robe: {
    fallback: { stat: 'maxHpPct', pattern: /HP ×([\d.]+)/, as: MUL },
    nums: { cloudDriftSpeed: { pattern: /\((\d+) tile\/s\)/ } },
  },
  carriers_boots: {
    fallback: { stat: 'moveSpeedPct', pattern: /move ×([\d.]+)/, as: MUL },
    nums: {
      trailDamageMul: { pattern: /\(([\d.]+)× basic dmg\/s/ },
      trailSeconds: { pattern: /for (\d+) s\)/ },
    },
  },
  ring_of_contagion: {
    fallback: { stat: 'hpRegen', pattern: /\+(\d+) life regen/ },
    // "jumps to the 3 nearest enemies instead of 1": the hook adds
    // `extraTargets` to Spreading Plague's own single target.
    nums: { extraTargets: { pattern: /the (\d+) nearest enemies/, as: (n) => n - 1 } },
    baselines: [
      {
        pattern: /instead of (\d+);/,
        read: () => 1,
        why: "§4.1's own Spreading Plague: 'deal the total unfinished damage to the nearest enemy once' — one target",
      },
    ],
  },
  pestilent_locket: {
    fallback: { stat: 'xpGain', pattern: /EXP \+(\d+)%/, as: PCT },
    nums: { extraCooldownSeconds: { pattern: /cooldown \+(\d+) s/ } },
    words: [{ field: 'dotBoostMul', word: 'doubles', value: 2 }],
  },
  blightweaver_band: {
    fallback: { stat: 'area', pattern: /area \+(\d+)%/, as: PCT },
    nums: { contactShare: { pattern: /tick (\d+)% of their poison/, as: PCT } },
  },
  hourglass_scepter: {
    fallback: { stat: 'atkFlat', pattern: /atk \+(\d+)/ },
    nums: { dotSpeedMul: { pattern: /ticks (\d+)% faster/, as: PCT_FASTER } },
  },
  chronomail: {
    fallback: { stat: 'armor', pattern: /def \+(\d+)/ },
    nums: {
      windowMul: { pattern: /over (\d+) s instead of/, as: (n) => n / (cls('time_lord').passive.charDotSeconds ?? NaN) },
      lowHpFraction: { pattern: /at <=(\d+)% HP/, as: PCT },
      lowHpWindowMul: { pattern: /HP, over (\d+) s/, as: (n) => n / (cls('time_lord').passive.charDotSeconds ?? NaN) },
    },
    baselines: [
      {
        pattern: /instead of (\d+) s;/,
        read: () => cls('time_lord').passive.charDotSeconds ?? NaN,
        why: "Time Flow's own window, `time_lord.passive.charDotSeconds`",
      },
    ],
  },
  sandals_of_the_second_hand: {
    fallback: { stat: 'moveSpeedPct', pattern: /move ×([\d.]+)/, as: MUL },
    nums: { rewindSeconds: { pattern: /position of (\d+) s ago/ } },
    baselines: [
      {
        pattern: /instead of (\d+) s;/,
        read: () => cls('time_lord').active1.markRewindSeconds ?? NaN,
        why: "Time's own rewind, `time_lord.active1.markRewindSeconds`",
      },
    ],
  },
  loop_ring: {
    fallback: { stat: 'hpRegen', pattern: /\+(\d+) life regen/ },
    nums: {
      extraCharges: { pattern: /Time has (\d+) charges/, as: (n) => n - (cls('time_lord').active1.maxCharges ?? NaN) },
      rechargeSpeedMul: { pattern: /recharges (\d+)% faster/, as: PCT_FASTER },
    },
  },
  pendulum_pendant: {
    fallback: { stat: 'xpGain', pattern: /EXP \+(\d+)%/, as: PCT },
    nums: {
      executeRefundCharges: { pattern: /refunds (\d+) Time charge/ },
      eliteExecuteFraction: { pattern: /lose (\d+)% instead of/, as: PCT },
    },
    baselines: [
      {
        pattern: /instead of (\d+)%;/,
        read: () => (cls('time_lord').active1.markEliteExecuteFraction ?? NaN) * 100,
        why: "Time's own elite branch, `time_lord.active1.markEliteExecuteFraction`",
      },
    ],
  },
  bracer_of_overlap: {
    fallback: { stat: 'area', pattern: /area \+(\d+)%/, as: PCT },
    // "can hold 2 zones at once": the cap is 1 + `extraZones` (`timeLockZoneCap`, world.ts).
    nums: { extraZones: { pattern: /hold (\d+) zones at once/, as: (n) => n - 1 } },
  },
  ring_of_a_thousand_cuts: {
    fallback: { stat: 'hpRegen', pattern: /\+(\d+) life regen/ },
    nums: { bleedStacks: { pattern: /applies (\d+) Bleeding per attack/ } },
  },
  duelists_pendant: {
    fallback: { stat: 'xpGain', pattern: /EXP \+(\d+)%/, as: PCT },
    nums: { chargeRefund: { pattern: /refunds (\d+)% of the charge/, as: PCT } },
  },
  bracer_of_the_whirlwind: {
    fallback: { stat: 'area', pattern: /area \+(\d+)%/, as: PCT },
    nums: {
      radiusMul: { pattern: /radius \+(\d+)%/, as: PCT_FASTER },
      knockbackMul: { pattern: /knockback \+(\d+)%/, as: PCT_FASTER },
    },
  },
};

/**
 * `effectNums` fields §7.1 states no number for — the engine needs them to
 * realise a clause (a trail's footprint, what "touching" means) — each with
 * the reason it is a designer-fill ⚖ default rather than an owner figure.
 */
const DESIGNER_FILL: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  carriers_boots: {
    trailSegments: 'how many poison patches the trail lays along the dash — Flame Road’s own `trailSegments` shape',
    trailRadius: 'each trail patch’s radius in tiles — §7.1 says "trail", not how wide',
    trailTickSeconds: 'the trail’s poison-application cadence — Poison Barrel’s own authored 1 s (fb082), not a §7.1 figure',
  },
  blightweaver_band: {
    contactRadius: 'what "touching" means in tiles — Contagious Flame authors its own `flameRadius` for the same word',
  },
};

function capture(q: Quote, text: string, where: string): { value: number; match: string; start: number; end: number } {
  const m = q.pattern.exec(text);
  const g = m?.[1];
  if (!m || g === undefined) throw new Error(`${where}: ${q.pattern} does not match §7.1's "${text}"`);
  const n = Number(g);
  return { value: q.as ? q.as(n) : n, match: m[0], start: m.index, end: m.index + m[0].length };
}

/**
 * `text` with every claimed span blanked. Spans are taken against the
 * original cell and may overlap (Chronomail's "over 8 s instead of 4 s" is
 * read by two quotes), so they are blanked by position, never by a
 * sequential string replace that would destroy a later quote's context.
 */
function residueOf(text: string, spans: readonly { start: number; end: number }[]): string {
  const chars = [...text];
  for (const sp of spans) for (let i = sp.start; i < sp.end; i++) chars[i] = ' ';
  return chars.join('');
}

describe('fb056 — SPEC-FINAL §7.1: the table itself', () => {
  it("§7.1's text is the version this ledger was read from", () => {
    expect(
      createHash('sha256').update(SPEC_71_TEXT, 'utf8').digest('hex'),
      'SPEC-FINAL §7.1 changed — re-read it against this ledger, then update this hash',
    ).toBe(SPEC_71_SHA256);
  });

  it('parses to exactly the fifteen owner rows, one per CLASS_SET_NAME entry', () => {
    expect(SPEC_71_TABLE).toHaveLength(15);
    expect(SPEC_71_TABLE.map((r) => r.name).sort()).toEqual(Object.values(CLASS_SET_NAME).sort());
    expect(Object.keys(LEDGER).sort()).toEqual([...KEYS].sort());
  });

  it('every §7.1 item exists in data/equipment.json, is loaded, and names its own effectKey', () => {
    for (const key of KEYS) {
      const item = content.equipmentByKey.get(key);
      expect(item, `${key}: not loaded`).toBeDefined();
      expect(item!.effectKey, `${key}: effectKey must equal the item key (fb085's dispatch rule)`).toBe(key);
    }
  });
});

describe('fb056 — SPEC-FINAL §7.1: its prose outside the table states no unaudited figure', () => {
  it('every numeral in §7.1\'s prose is a section/date/backlog reference, not a figure', () => {
    // c012's preamble rule, for §7.1: a figure stated in prose is still a
    // figure. The only numerals §7.1's prose may carry are its own heading's
    // references — the section number, the inbox date, the backlog id and
    // the §7/§8.1 cross-references.
    const prose = SPEC_71_TEXT.split('\n')
      .filter((l) => !l.startsWith('|'))
      .join('\n')
      .replace(/### 7\.1/, '')
      .replace(/2026-09-03/, '')
      .replace(/fb056/, '')
      .replace(/§8\.1/g, '')
      .replace(/§7/g, '');
    expect(prose.match(/\d/g) ?? [], `§7.1 prose: an unaudited numeral in "${prose}"`).toEqual([]);
  });
});

describe('fb056 — SPEC-FINAL §7.1: every stated figure matches /data', () => {
  for (const key of KEYS) {
    const row = classSetRowFor(key);
    const item = raw(key);
    const led = LEDGER[key]!;

    it(`${key}: slot and the five numeric columns (HP/Atk/Def/AtkSpd/Move)`, () => {
      expect(item.slot).toBe(row.slot);
      const mods = item.mods ?? {};
      expect(mods.maxHp ?? 0, 'HP').toBeCloseTo(row.hp, 10);
      expect(mods.atkFlat ?? 0, 'Atk').toBeCloseTo(row.atk, 10);
      expect(mods.armor ?? 0, 'Def').toBeCloseTo(row.def, 10);
      expect(1 + (mods.attackSpeed ?? 0), 'AtkSpd').toBeCloseTo(row.atkspd, 10);
      expect(1 + (mods.moveSpeedPct ?? 0), 'Move').toBeCloseTo(row.move, 10);
      // Converse: no authored mods key outside those five columns.
      const allowed = new Set(['maxHp', 'atkFlat', 'armor', 'attackSpeed', 'moveSpeedPct']);
      expect(Object.keys(mods).filter((k) => !allowed.has(k)), 'a mods key §7.1 has no column for').toEqual([]);
    });

    it(`${key}: the "if not <class>" line is its classFallback, for the class §7.1 names`, () => {
      const m = /if not ([A-Z][A-Za-z ]+):/.exec(row.effect);
      expect(m, `${key}: §7.1 states no "if not <class>:" clause`).not.toBeNull();
      const named = content.classes.classes.find((c) => c.name === m![1]);
      expect(named, `${key}: §7.1 names unknown class "${m![1]}"`).toBeDefined();
      expect(item.classFallback?.notClassKey).toBe(named!.key);
      const fb = capture(led.fallback, row.effect, key);
      expect(Object.keys(item.classFallback?.mods ?? {}), `${key}: fallback bag`).toEqual([led.fallback.stat]);
      expect(item.classFallback!.mods[led.fallback.stat]).toBeCloseTo(fb.value, 10);
    });

    it(`${key}: every mechanic magnitude is its effectNums field, and no numeral in the cell goes unaudited`, () => {
      const nums = item.effectNums ?? {};
      const spans: { start: number; end: number }[] = [capture(led.fallback, row.effect, key)];
      for (const [field, q] of Object.entries(led.nums)) {
        const c = capture(q, row.effect, `${key}.${field}`);
        expect(nums[field], `${key}.effectNums.${field}`).toBeCloseTo(c.value, 10);
        spans.push(c);
      }
      for (const b of led.baselines ?? []) {
        const c = capture(b, row.effect, `${key} baseline`);
        expect(c.value, `${key}: §7.1's baseline figure vs ${b.why}`).toBeCloseTo(b.read(), 10);
        spans.push(c);
      }
      const residue = residueOf(row.effect, spans);
      for (const wd of led.words ?? []) {
        expect(row.effect, `${key}: §7.1 no longer says "${wd.word}"`).toContain(wd.word);
        expect(nums[wd.field], `${key}.effectNums.${wd.field} ("${wd.word}")`).toBe(wd.value);
      }
      expect(residue.match(/\d/g) ?? [], `${key}: a numeral in §7.1's Effect cell no ledger quote claims: "${residue}"`).toEqual([]);

      // Converse: every authored effectNums field is audited or excused.
      const claimed = new Set([...Object.keys(led.nums), ...(led.words ?? []).map((w) => w.field)]);
      const excused = DESIGNER_FILL[key] ?? {};
      for (const f of Object.keys(nums)) {
        expect(claimed.has(f) || f in excused, `${key}.effectNums.${f}: neither a §7.1 figure nor a DESIGNER_FILL entry`).toBe(true);
      }
      for (const [f, why] of Object.entries(excused)) {
        expect(nums[f], `${key}: DESIGNER_FILL names ${f}, which is not authored`).toBeDefined();
        expect(why.length).toBeGreaterThan(20);
      }
    });
  }

  // Code review (fb056, Major 3): c012's desc audit covers only §7's owner
  // table, and seven §7.1 descs shipped with HP at a tenth. The same audit,
  // for §7.1: the "HP a / Atk b / Def c" line states the *loaded* numbers
  // (fb164: `numberScale` scales Atk, never HP/Def), every non-x1 multiplier
  // column is stated, and the fallback line names its class.
  for (const key of KEYS) {
    it(`${key}: desc states the loaded HP/Atk/Def, its multipliers, and its "If not <class>" line`, () => {
      const loaded = content.equipmentByKey.get(key)!;
      const row = classSetRowFor(key);
      const desc = String(raw(key).desc);
      const m = /HP (-?\d+(?:\.\d+)?) \/ Atk (-?\d+(?:\.\d+)?) \/ Def (-?\d+(?:\.\d+)?)/.exec(desc);
      expect(m, `${key}: no "HP a / Atk b / Def c" line`).not.toBeNull();
      expect(Number(m![1]), `${key}: desc HP`).toBeCloseTo(loaded.mods.maxHp ?? 0, 9);
      expect(Number(m![2]), `${key}: desc Atk`).toBeCloseTo(loaded.mods.atkFlat ?? 0, 9);
      expect(Number(m![3]), `${key}: desc Def`).toBeCloseTo(loaded.mods.armor ?? 0, 9);
      if (row.atkspd !== 1) expect(desc, `${key}: atk speed multiplier`).toContain(`atk speed x${row.atkspd}`);
      if (row.move !== 1) expect(desc, `${key}: move multiplier`).toContain(`move x${row.move}`);
      const className = content.classByKey.get(loaded.classFallback!.notClassKey)!.name;
      expect(desc, `${key}: fallback line`).toContain(`If not ${className}:`);
    });
  }

  it('Plague Flask restates §3\'s own Poison row (120% over 3 s), and the two agree', () => {
    const poison = content.damageTypeByKey.get('poison')!;
    const nums = raw('plague_flask').effectNums!;
    expect(nums.poisonRatio).toBe(poison.ratio);
    expect(nums.poisonSeconds).toBe(poison.duration);
  });
});

/** Every Stats source name a World's sheet carries, across every stat key. */
function sourcesOf(w: World): Set<string> {
  const out = new Set<string>();
  for (const k of STAT_KEYS) for (const [src] of w.stats.contributions(k)) out.add(src);
  return out;
}

describe('fb056 — each §7.1 item loads, drops, equips, and has a behavioural test', () => {
  it('drops: every §7.1 item is on the §8.1 loot table, drawn uniformly from the whole equipment list', () => {
    // `completeWave` (run.ts) picks `items[w.rng.drops.int(items.length)]` —
    // so being in `content.equipment.items` *is* being on the loot table.
    const keys = content.equipment.items.map((i) => i.key);
    for (const key of KEYS) expect(keys, `${key}: not on the loot table`).toContain(key);
    // And the drops stream really reaches every index of the grown list.
    const w = new World(cfg({ seed: 7 }), content);
    const seen = new Set<number>();
    for (let i = 0; i < 4000 && seen.size < keys.length; i++) seen.add(w.rng.drops.int(keys.length));
    expect(seen.size).toBe(keys.length);
    expect(STREAM_NAMES).toContain('drops');
  });

  it('equips: each §7.1 item fills its own slot and contributes its mods as its own Stats source', () => {
    for (const key of KEYS) {
      const item = content.equipmentByKey.get(key)!;
      const w = new World(cfg({ classKey: item.classFallback!.notClassKey, equipment: [key] }), content);
      expect(w.equippedEquipment[item.slot], key).toBe(key);
      expect(sourcesOf(w).has(`equipment:${key}`), `${key}: no equipment Stats source`).toBe(true);
      // The owning class never receives the fallback; any other class does.
      expect(sourcesOf(w).has(`equipment:${key}:fallback`), `${key}: fallback leaked to its own class`).toBe(false);
      const other = new World(cfg({ classKey: item.classFallback!.notClassKey === 'swordsman' ? 'engineer' : 'swordsman', equipment: [key] }), content);
      expect(sourcesOf(other).has(`equipment:${key}:fallback`), `${key}: fallback missing off-class`).toBe(true);
    }
  });

  it('every §7.1 item has a behavioural block in tests/equip-class-sets-behaviour.test.ts naming it', () => {
    const src = readFileSync(fileURLToPath(new URL('./equip-class-sets-behaviour.test.ts', import.meta.url)), 'utf8');
    const titles = [...src.matchAll(/\b(?:describe|it)\(\s*(['"`])(.*?)\1/g)].map((m) => m[2] ?? '');
    for (const key of KEYS) {
      const name = content.equipmentByKey.get(key)!.name;
      expect(
        titles.some((t) => t.includes(key) || t.includes(name)),
        `${key}: no describe/it title in the behaviour file names "${key}" or "${name}"`,
      ).toBe(true);
    }
  });
});

describe('fb056 — tooltips and the Codex state each effect in sentence form with live numbers', () => {
  function item(key: string): EquipmentItem {
    return content.equipmentByKey.get(key)!;
  }

  it('every effectNote placeholder names an authored effectNums field, and resolves to its number', () => {
    for (const key of KEYS) {
      const it = item(key);
      expect(it.effectNote, `${key}: no effectNote`).toBeTruthy();
      const text = withEffectNums(it.effectNote!, it);
      expect(text, `${key}: an unresolved {n:}/{pct:} placeholder`).not.toMatch(/\{(?:n|pct):/);
      for (const m of it.effectNote!.matchAll(/\{(n|pct):(\w+)\}/g)) {
        const v = it.effectNums[m[2]!]!;
        const shown = m[1] === 'pct' ? `${+(v * 100).toFixed(4)}%` : `${+v.toFixed(4)}`;
        expect(text, `${key}: ${m[0]} should read ${shown}`).toContain(shown);
      }
      // Sentence form: starts upper-case, ends with a period.
      expect(text).toMatch(/^[A-Z].*\.$/);
    }
  });

  it('the live number is the /data number: editing effectNums moves the tooltip', () => {
    const doc = JSON.parse(JSON.stringify(content.raw.equipment)) as { items: RawItem[] };
    const ring = doc.items.find((i) => i.key === 'ring_of_a_thousand_cuts')!;
    ring.effectNums = { bleedStacks: 7 };
    const c2 = loadContent({ equipment: doc });
    expect(withEffectNums(c2.equipmentByKey.get('ring_of_a_thousand_cuts')!.effectNote!, c2.equipmentByKey.get('ring_of_a_thousand_cuts')!)).toContain('applies 7 Bleeding');
  });

  it('in-run tooltips mark the mechanic (active) for its own class and (inert) for any other', () => {
    for (const key of KEYS) {
      const it = item(key);
      const own = it.classFallback!.notClassKey;
      const mine = equipmentSpecialNoteMarkup(it, { classKey: own, equippedKeys: [key] });
      expect(mine, key).toContain('(active)');
      expect(mine).not.toMatch(/\{(?:n|pct):/);
      const theirs = equipmentSpecialNoteMarkup(it, { classKey: own === 'swordsman' ? 'engineer' : 'swordsman', equippedKeys: [key] });
      expect(theirs, key).toContain('(inert)');
    }
  });

  it('no fallback line doubles its percent sign (qa: Miasma Robe read "+10% Max HP %")', () => {
    for (const key of KEYS) {
      const it = item(key);
      const other = it.classFallback!.notClassKey === 'swordsman' ? 'engineer' : 'swordsman';
      const html = equipmentFallbackMarkup(content, { classKey: other }, it);
      expect(html, key).not.toMatch(/%[^<]*%/);
    }
  });

  it('the Codex detail names the owning class, the resolved mechanic, and the fallback line', () => {
    for (const key of KEYS) {
      const it = item(key);
      const className = content.classByKey.get(it.classFallback!.notClassKey)!.name;
      const html = equipmentCodexDetailMarkup(content, it);
      expect(html, key).toContain(`If ${className}: `);
      expect(html, key).toContain(`If not ${className}: `);
      expect(html, key).not.toMatch(/\{(?:n|pct):/);
    }
  });
});

describe('fb056 — the loader refuses unpayable §7.1 effectNums (rule 4)', () => {
  function withNums(key: string, nums: Record<string, number>): () => unknown {
    const doc = JSON.parse(JSON.stringify(content.raw.equipment)) as { items: RawItem[] };
    doc.items.find((i) => i.key === key)!.effectNums = nums;
    return () => loadContent({ equipment: doc });
  }

  it('the shipped rows load (control)', () => {
    for (const key of KEYS) expect(withNums(key, { ...raw(key).effectNums })).not.toThrow();
  });

  it('refuses a field the hook does not read (a typo would silently read the fallback)', () => {
    expect(withNums('loop_ring', { extraCharges: 1, rechargeSpeedMul: 1.25, rechargeSpeedMull: 2 })).toThrow(/not a field its hook reads/);
  });

  it('refuses a missing required field', () => {
    expect(withNums('duelists_pendant', {})).toThrow(/chargeRefund is required/);
  });

  it('refuses out-of-range and non-integer magnitudes', () => {
    expect(withNums('blightweaver_band', { contactShare: 1.5, contactRadius: 1 })).toThrow(/contactShare/);
    expect(withNums('ring_of_a_thousand_cuts', { bleedStacks: 2.5 })).toThrow(/integer/);
    expect(withNums('hourglass_scepter', { dotSpeedMul: 0 })).toThrow(/dotSpeedMul/);
    expect(withNums('pendulum_pendant', { executeRefundCharges: 1, eliteExecuteFraction: -0.6 })).toThrow(/eliteExecuteFraction/);
  });

  it("refuses half of Chronomail's low-HP pair", () => {
    expect(withNums('chronomail', { windowMul: 2, lowHpFraction: 0.3 })).toThrow(/low-HP pair/);
  });
});
