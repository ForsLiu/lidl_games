/**
 * c015 (BACKLOG-CONTENT, lane `content`) — **every number a class description
 * says out loud, matched to the field it names or named as a deviation.**
 *
 * `data/classes.json` carries a `description` on every `passive` and
 * `towerPassive` row, and those strings are what the player reads:
 * `src/ui/class-info.ts` renders both in the class panel and `src/ui/hub.ts`
 * shows the passive's as the class's one-line trait. Every number inside them
 * is a hand-copied duplicate of a sibling field — Grave Harvest says "6 s"
 * beside `corpseSeconds 6`, Frost Touch "hit 5 times" beside `freezeHits 5`,
 * Conduction "cap 8 jumps" beside `chainCap 8`. Nothing checked the copy. A
 * retune moves the field and leaves the sentence behind, and the player is
 * then told a number the sim does not run on.
 *
 * This is `c008`'s shape (`tests/class-spec-numbers.test.ts`) turned inward:
 * c008 audits `/data` against SPEC-FINAL §4, this audits the *prose in* `/data`
 * against the numbers beside it. Same rule, c015's own words: a number matches
 * the field on its row, or it appears in a named-deviation table carrying the
 * item that authorised the split, and **a number with neither fails**.
 *
 * Four statuses, and only the first needs no authorisation:
 *
 *   `field`    — the number equals a field on the row's own slot. 26 claims.
 *   `sibling`  — the number is authored in `/data`, but on a *different* slot
 *                of the same class, so the sentence and the field it quotes
 *                cannot be kept together by the row alone. Both Conduction
 *                figures; `c010` is the filed item to move them.
 *   `in_code`  — the number is a literal in `/src`, which architecture rule 4
 *                says it should not be. Pinned by a capture group *around the
 *                literal itself*, and counted so the rule-4 debt is a number
 *                (c008 counts the same debt from the spec side; these three
 *                are the subset the *player* is also shown).
 *   `prose`    — the numeral is not a magnitude at all but part of the rule's
 *                own wording ("counts as 1 attack"). One claim. It is the one
 *                status that authorises itself, so the census below is what
 *                stops it becoming a dumping ground: a second `prose` claim is
 *                red until someone writes it down.
 *
 * **What stops this ledger from lying to itself.** Every guard below exists
 * because a review or a QA pass got a lie past an earlier draft of this file.
 *
 *   - Claims are matched to the extracted numerals **positionally, zipped**,
 *     not by lookup. Every numeral in every description must line up with a
 *     declared claim in order of appearance, so an unclaimed number fails with
 *     nowhere to hide and a deleted one fails just as loudly.
 *   - **A number matching its field is not enough — the sentence has to still
 *     be about that field.** QA got eleven lying sentences past the first
 *     draft without touching a single numeral: Paladin promising "+10% defense
 *     and +5 max HP" over `towerHp 0.10`/`towerDefenseBonus 5`, Bloodlord's VS
 *     and TD halves swapped, Engineer's discount reworded as "cost 10% more",
 *     Necromancer's "below full HP" flipped to "at full HP", and whole
 *     descriptions permuted between classes (six tower passives all read
 *     "+10%" over a `0.10` field, so their sentences were interchangeable).
 *     Each claim therefore also declares `keywords`, which must appear in that
 *     numeral's **own window** of the sentence — the span between its
 *     neighbouring numerals, intersected with the `;`/`:`/`,` clause it sits
 *     in — so a noun cannot drift to a neighbour and a sentence cannot be
 *     swapped onto another class's field. The clause intersection is load
 *     bearing: a second review restored Engineer's "cost 10% more" lie past
 *     the un-intersected version by moving the word "less" *backwards* across
 *     its own numeral, into the neighbour's half of a shared span.
 *   - `field` is *defined* as "on that row it names": the check requires the
 *     path's first segment to be the claim's own slot, and `sibling` requires
 *     it not to be, *and* requires the key to be genuinely absent from the
 *     claim's own slot — so a half-landed `c010` (fields copied onto the
 *     passive while `active1` keeps them) is red rather than silently green.
 *   - `in_code` pins the literal by a **capture group around it**, compared to
 *     the claim's own value. Whole-line anchors alone are not enough: QA moved
 *     Time Flow's sentence to "6 s", moved the ledger's `value` to 6 to match,
 *     and `/^const TIME_FLOW_BASE_SECONDS = 4;$/` still matched its unchanged
 *     line — green, with the player told a number `run.ts` does not run on.
 *     Each `in_code` claim also declares an `absentKey`, so "still not authored
 *     in `/data`" is a search rather than a tautology.
 *   - `as` is a **named** converter (`'pct' | 'pctLess'`), not a function.
 *     QA laundered the exact drift c015 was filed to catch by writing
 *     `as: (v) => v * 250` beside a `+10%` token and a `0.04` field. A
 *     converter that cannot be authored inline cannot be authored to lie, and
 *     the `%`-unit/converter correspondence is asserted both ways.
 *   - Mutating any authored field in a copy of the document must redden
 *     exactly one claim — its own. A typo'd path reads `undefined` and would
 *     otherwise assert nothing; two claims sharing a field would mean a retune
 *     reddens only one of them.
 *   - Every authorisation string must carry an **item id**, not just prose
 *     (c008's rule, `/\b(p\d+[a-z]|c\d{3}|Q\d+|fb\d+)\b/`).
 *   - The loaded content and the raw document are held to the same string and
 *     the same number at every path, so this audits what the sim runs on.
 *   - Coverage is per **slot**, not per class: all 24 described slots must
 *     carry claims or sit in `NO_NUMBER`, and `active1`/`active2` are asserted
 *     to carry no `description` at all — c015's own text expects 36 strings,
 *     and the schema (`ClassSlotPassiveSchema`, content.ts) only gives one to
 *     the two passive slots. If a description ever gains one, that assertion
 *     fails and its numbers have to be entered here.
 *
 * **Numerals the extractor deliberately does not parse.** A regex over digits
 * cannot see `½`, `＋２０％` or "half the damage", and QA smuggled all three
 * past the first draft — including into the two `NO_NUMBER` rows, whose whole
 * job is to assert their sentence states no quantity. Rather than pretend to
 * parse them, this file *refuses* them: non-ASCII numeral characters and
 * non-ASCII signs are rejected outright, and English number-words are refused
 * unless declared in `WORD_NUMBERS` with a reason. Four are declared today
 * ("once", "one"), all of them counts of an event rather than magnitudes.
 *
 * Three known, accepted limits, stated so the next author does not discover
 * them the hard way. A digit inside a word ("Act 2", "T5") would be extracted
 * and demand a claim it has no field for — the escape hatch is `prose`, and
 * the census must move with it. Two claims on one slot sharing both a token
 * and a keyword set would be interchangeable (no such pair exists today). And
 * a sentence whose clause holds exactly one numeral gives that claim the whole
 * clause as its window, so a reordering *within* one clause is not caught —
 * the separators are what bound this, which is why a claim's keywords should
 * be the words nearest its own number rather than anything true of the row.
 *
 * **This item changes no `/data` number and, as it turned out, no description
 * text either.** c015 was filed believing Bloodlord *Sanguine Pact* still read
 * "all towers +10% damage" beside `towerDamage 0.04`; `p10s` had already
 * corrected that sentence to "+4%" when it made the cut (c008's `retuned` row
 * records the same commit). All 24 sentences agree with every number this
 * ledger can reach today. The deliverable is the barrier, not a fix.
 *
 * refs: SPEC-FINAL §4.1/§4.2, c008, c010, architecture rule 4.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { loadContent } from '../src/sim/content';

const content = loadContent();

/* --------------------------------------------------------------- the shape */

/** The two class slots SPEC-FINAL §4 gives a player-facing sentence. */
type Slot = 'passive' | 'towerPassive';

const DESCRIBED_SLOTS: readonly Slot[] = ['passive', 'towerPassive'];
/** The two that carry none — asserted, so gaining one forces a ledger entry. */
const UNDESCRIBED_SLOTS = ['active1', 'active2'] as const;

type Path = readonly string[];

/**
 * The closed set of unit conversions a claim may declare. Deliberately not a
 * function: an arbitrary `(v: number) => number` beside a token is a licence
 * to certify any drift as a match, which is how QA laundered the pre-p10s
 * Bloodlord sentence past the first draft.
 */
type Convert = 'pct' | 'pctLess';

const CONVERT: Record<Convert, (v: number) => number> = {
  /** A fraction authored in `/data`, stated as a percentage in the sentence. */
  pct: (v) => v * 100,
  /** As `pct`, but the sentence carries the sign as a word ("cost 10% less"). */
  pctLess: (v) => -v * 100,
};

const CLASSES_TS = 'src/sim/classes.ts';
const RUN_TS = 'src/sim/run.ts';

/** c010 — the filed, Scope-blocked item that moves Conduction onto its own row. */
const C010 =
  'c010 (BACKLOG-CONTENT, blocked out of Scope): "Stormcaller Conduction is authored on the wrong ' +
  'row" — the passive states a rule about electric damage generally, but both its numbers live on ' +
  '`active1` as `chainGrowth`/`chainCap`. The item moves them onto the passive row and has ' +
  '`fireChainSurge` read them from there; until it lands, the sentence and the fields it quotes ' +
  'are one slot apart and this ledger is what keeps them equal.';
/** Architecture rule 4 debt, shared with c008's `in_code` rows. */
const RULE4 =
  'CLAUDE.md architecture rule 4 / c008 (`tests/class-spec-numbers.test.ts`, status `in_code`): the ' +
  'figure is correct but ships as a `/src` literal instead of a `/data` field, so no path can be ' +
  'declared for it. c008 counts the same debt from the spec side; these are the rows the player is ' +
  'also shown, pinned here by a capture group around the literal so it cannot move without going red.';
/** The one self-authorising status; the census is what bounds it. */
const C015 =
  "c015 (this item): the numeral is part of the rule's wording rather than a magnitude — it states " +
  'how the rule counts, not how much it does, and there is no quantity for a field to hold. The ' +
  'census below pins this status at exactly one claim so it cannot absorb a real drift.';

/** c008's rule: an authorisation must name an item, not merely argue. */
const ITEM_ID = /\b(p\d+[a-z]|c\d{3}|Q\d+|fb\d+)\b/;

type Status =
  /** Equals a field on the claim's own slot. Needs no authorisation — this is the rule. */
  | { kind: 'field'; path: Path; as?: Convert }
  /** Authored in `/data`, on another slot of the same class. */
  | { kind: 'sibling'; path: Path; as?: Convert; authorised: string; why: string }
  /**
   * A `/src` literal. `valueAnchor` must match a whole trimmed source line and
   * capture the literal itself, so the claim's number and the sim's number are
   * the same reading rather than two hand-copies. `anchors` pins any further
   * lines the clause depends on. `absentKey`/`knownKeys` prove it is still not
   * authored in `/data`.
   */
  | {
      kind: 'in_code';
      value: number;
      file: string;
      valueAnchor: RegExp;
      anchors?: readonly RegExp[];
      absentKey: RegExp;
      knownKeys: readonly string[];
      authorised: string;
      why: string;
    }
  /** Not a magnitude at all. */
  | { kind: 'prose'; authorised: string; why: string };

interface Claim {
  cls: string;
  slot: Slot;
  /**
   * The literal **exactly as the sentence writes it**, sign and unit
   * included. Zipped against the extracted numerals in order, so this is a
   * quote from `/data`, not a label.
   */
  token: string;
  /** What the sentence claims the number means. Appears in failure messages. */
  means: string;
  /**
   * Words that must appear in this numeral's **own window** of the sentence —
   * from the end of the previous numeral to the start of the next. This is
   * what binds the number to the noun it modifies; without it a sentence can
   * keep every numeral and still describe a different stat, a different
   * condition, or another class entirely.
   */
  keywords: readonly string[];
  status: Status;
}

/**
 * A described slot whose sentence states **no number at all**. Declared rather
 * than inferred, so "did we skip a row?" is a test and not a reading exercise.
 */
const NO_NUMBER: readonly { cls: string; slot: Slot; why: string }[] = [
  {
    cls: 'plaguebringer',
    slot: 'passive',
    why:
      'Spreading Plague is stated entirely as a rule — "the total unfinished damage", "the nearest ' +
      'enemy", "once". Every quantity in it is read off the dying enemy\'s own DoTs at the moment ' +
      'it dies, and the clause names no figure of its own. Its one word-number is declared below.',
  },
  {
    cls: 'animist',
    slot: 'passive',
    why:
      'Kinship\'s sentence is "Aura effects also affect summons" — a routing rule with no magnitude. ' +
      '(§4.2 additionally states a "summon cap +1" for it, which is unimplemented and tracked as a ' +
      "row of c008's ledger; it is not in the shipped sentence, so it is not a claim here.)",
  },
];

/**
 * English number-words the shipped sentences are allowed to use. The extractor
 * cannot parse them, so every occurrence must be declared: an undeclared
 * "half" or "two" is red, which is what stops a magnitude being smuggled past
 * the digit scan — including into a `NO_NUMBER` row.
 */
const WORD_NUMBERS: readonly { cls: string; slot: Slot; word: string; why: string }[] = [
  {
    cls: 'plaguebringer',
    slot: 'passive',
    word: 'once',
    why: 'Spreading Plague transfers "once" per death — a rule against re-entrancy, not a magnitude.',
  },
  {
    cls: 'time_lord',
    slot: 'passive',
    word: 'one',
    why: '"after one armor mitigation" counts mitigations, matching `damageWarden`\'s single pre-conversion `damageTakenMul`.',
  },
  {
    cls: 'time_lord',
    slot: 'passive',
    word: 'once',
    why: '"instead of landing at once" is the idiom, not a count — it names the behaviour Time Flow replaces.',
  },
  {
    cls: 'time_lord',
    slot: 'towerPassive',
    word: 'one',
    why: '"gain one free uncapped bonus level" counts levels per interval; the interval itself is the `2` claim.',
  },
];

/* -------------------------------------------------------------- the ledger */

const LEDGER: readonly Claim[] = [
  /* ------------------------------------------------------- §4.1 Swordsman */
  {
    cls: 'swordsman',
    slot: 'passive',
    token: '1',
    means: 'each damage instance from an Active counts as one attack',
    keywords: ['counts as', 'damage instance'],
    status: {
      kind: 'prose',
      authorised: C015,
      why:
        'The numeral defines the unit Thousand Cuts counts in — one damage instance is one attack — ' +
        'so there is nothing to author. The magnitude that unit feeds is the next claim.',
    },
  },
  {
    cls: 'swordsman',
    slot: 'passive',
    token: '1',
    means: 'stacks of Bleeding applied per attack',
    keywords: ['Bleeding'],
    status: {
      kind: 'in_code',
      value: 1,
      file: CLASSES_TS,
      valueAnchor: /^return extra > 0 \? Array\((\d+) \+ extra\)\.fill\('bleeding'\) : BLEEDING_ON_HIT;$/,
      anchors: [/^const BLEEDING_ON_HIT: readonly string\[\] = \['bleeding'\];$/],
      absentKey: /bleed|stack/i,
      knownKeys: [],
      authorised: RULE4,
      why:
        'The base count is the captured `1` in `Array(1 + extra)`, and the second anchor pins the ' +
        "one-element default it falls back to. `extra` is p7a's *Thousand Cuts* skill card, which " +
        'adds stacks per rank on top of it.',
    },
  },
  {
    cls: 'swordsman',
    slot: 'towerPassive',
    token: '+10%',
    means: 'tower attack speed',
    keywords: ['attack speed'],
    status: { kind: 'field', path: ['towerPassive', 'mods', 'towerAttackSpeed'], as: 'pct' },
  },

  /* --------------------------------------------------- §4.2 Plaguebringer */
  {
    cls: 'plaguebringer',
    slot: 'towerPassive',
    token: '+10%',
    means: 'tower poison damage',
    keywords: ['poison damage'],
    status: { kind: 'field', path: ['towerPassive', 'mods', 'towerPoisonDamage'], as: 'pct' },
  },

  /* --------------------------------------------------------- §4.1 Engineer */
  {
    cls: 'engineer',
    slot: 'passive',
    token: '10%',
    means: 'build and upgrade cost, less',
    // `pctLess` bakes the sign in, so the word "less" is the only thing
    // carrying it — QA flipped it to "more" and the first draft stayed green.
    keywords: ['cost', 'less'],
    status: { kind: 'field', path: ['passive', 'mods', 'towerCost'], as: 'pctLess' },
  },
  {
    cls: 'engineer',
    slot: 'passive',
    token: '+2',
    means: 'build range, in tiles',
    keywords: ['tiles'],
    status: { kind: 'field', path: ['passive', 'mods', 'buildRange'] },
  },
  {
    cls: 'engineer',
    slot: 'towerPassive',
    token: '+10%',
    means: 'tower max HP',
    keywords: ['HP'],
    status: { kind: 'field', path: ['towerPassive', 'mods', 'towerHp'], as: 'pct' },
  },

  /* ------------------------------------------------------------- §4.1 Pyro */
  {
    cls: 'pyromancer',
    slot: 'passive',
    // p12a (BALANCE DIRECTION v2 §A): 2 -> 6 with the x3 kit re-anchor. The
    // sentence is authored in `data/classes.json` beside the field it quotes,
    // so the re-anchor had to move both — this row is what makes that a
    // decision rather than a silent desync.
    token: '6',
    means: "the burning aura's damage per second",
    // "/s" is outside the extractor's unit set, so the keyword is what holds
    // the rate: QA reworded it to "damage/minute" against a per-second field.
    keywords: ['damage/s', 'touching'],
    status: { kind: 'field', path: ['passive', 'flameDps'] },
  },
  {
    cls: 'pyromancer',
    slot: 'towerPassive',
    token: '+10%',
    means: 'tower damage against Burning enemies',
    keywords: ['against Burning'],
    status: { kind: 'field', path: ['towerPassive', 'mods', 'towerDamageVsBurning'], as: 'pct' },
  },

  /* ----------------------------------------------------------- §4.2 Archer */
  {
    cls: 'archer',
    slot: 'passive',
    token: '+1',
    means: 'extra pierce per full second charged',
    keywords: ['pierce per full second'],
    status: {
      kind: 'in_code',
      value: 1,
      file: CLASSES_TS,
      valueAnchor:
        /^const hits = Math\.min\(eff\.pierceCap \?\? 1, (\d+) \+ Math\.floor\(held\)\) \+ classLineBonus\(w\);$/,
      absentKey: /pierce/i,
      knownKeys: ['active1.pierceCap'],
      authorised: RULE4,
      why:
        '`1 + Math.floor(held)` is the whole clause: one hit at zero charge and one more per full ' +
        'second held. The capture takes the base term; the per-second step is the implicit ' +
        "coefficient on `Math.floor(held)`, which the whole-line match is what pins. `active1`'s " +
        '`pierceCap` is the ceiling this counts up to, not this number, and is the one key the ' +
        'absence search is allowed to find. c017 moved the §6.3 card term out of the `min` and ' +
        "onto the resolved count (it was inert inside it); the passive's own base and per-second " +
        'step are untouched by that, and this anchor follows the fix.',
    },
  },
  {
    cls: 'archer',
    slot: 'towerPassive',
    token: '+10%',
    means: 'tower range',
    keywords: ['range'],
    status: { kind: 'field', path: ['towerPassive', 'mods', 'towerRange'], as: 'pct' },
  },

  /* ------------------------------------------------------ §4.2 Necromancer */
  {
    cls: 'necromancer',
    slot: 'passive',
    token: '6 s',
    means: 'how long a corpse lingers',
    keywords: ['corpses'],
    status: { kind: 'field', path: ['passive', 'corpseSeconds'] },
  },
  {
    cls: 'necromancer',
    slot: 'towerPassive',
    token: '+15%',
    means: 'tower damage while below full HP',
    // `towers.ts` gates on `hp < maxHp`; QA flipped the sentence to "at full
    // HP" without touching the number.
    keywords: ['below full HP'],
    status: { kind: 'field', path: ['towerPassive', 'mods', 'towerLowHpDamageBonus'], as: 'pct' },
  },

  /* ------------------------------------------------------- §4.2 Cryomancer */
  {
    cls: 'cryomancer',
    slot: 'passive',
    token: '5',
    means: 'frosted hits needed to freeze',
    keywords: ['times while frosted'],
    status: { kind: 'field', path: ['passive', 'freezeHits'] },
  },
  {
    cls: 'cryomancer',
    slot: 'towerPassive',
    token: '+10%',
    means: 'tower damage against frosted or frozen enemies',
    keywords: ['frosted or frozen'],
    status: { kind: 'field', path: ['towerPassive', 'mods', 'towerDamageVsChilled'], as: 'pct' },
  },

  /* ------------------------------------------------------ §4.2 Stormcaller */
  {
    cls: 'stormcaller',
    slot: 'passive',
    token: '+20%',
    means: 'compounding electric damage per jump',
    // Just the binding: "compounding" sits past the comma, in the next clause.
    keywords: ['per jump'],
    status: {
      kind: 'sibling',
      path: ['active1', 'chainGrowth'],
      as: 'pct',
      authorised: C010,
      why: "Conduction's sentence is on the passive; the number it quotes is Chain Surge's `chainGrowth`.",
    },
  },
  {
    cls: 'stormcaller',
    slot: 'passive',
    token: '8',
    means: 'the jump at which compounding stops',
    keywords: ['jumps'],
    status: {
      kind: 'sibling',
      path: ['active1', 'chainCap'],
      authorised: C010,
      why: 'Same split as the growth above: the cap the passive states is authored on `active1`.',
    },
  },
  {
    cls: 'stormcaller',
    slot: 'towerPassive',
    token: '+10%',
    means: 'tower damage repeated as extra Electric',
    keywords: ['extra Electric'],
    status: { kind: 'field', path: ['towerPassive', 'mods', 'towerExtraElectricPct'], as: 'pct' },
  },

  /* -------------------------------------------------------- §4.2 Bloodlord */
  {
    cls: 'bloodlord',
    slot: 'passive',
    token: '3%',
    means: 'lifesteal on normal damage',
    keywords: ['lifesteal'],
    status: { kind: 'field', path: ['passive', 'mods', 'leech'], as: 'pct' },
  },
  {
    cls: 'bloodlord',
    slot: 'passive',
    token: '+10%',
    means: 'attack in VS waves',
    // `classes.ts` applies `frenzyVsMul` when `huntsWarden`; QA swapped the two
    // phase words and the first draft stayed green.
    keywords: ['VS waves'],
    status: { kind: 'field', path: ['passive', 'frenzyVsMul'], as: 'pct' },
  },
  {
    cls: 'bloodlord',
    slot: 'passive',
    token: '-5%',
    means: 'attack in TD waves',
    keywords: ['TD waves'],
    status: { kind: 'field', path: ['passive', 'frenzyTdMul'], as: 'pct' },
  },
  {
    cls: 'bloodlord',
    slot: 'towerPassive',
    token: '+4%',
    means: 'tower damage',
    keywords: ['damage'],
    // The sentence §4.2 states is "+10%". p10s cut the field to 0.04 to close
    // bloodlord into G8's band and corrected the sentence in the same commit;
    // c008's `retuned` row is where that deviation from the *spec* is
    // recorded. Here the two agree, which is all c015 asks.
    status: { kind: 'field', path: ['towerPassive', 'mods', 'towerDamage'], as: 'pct' },
  },
  {
    cls: 'bloodlord',
    slot: 'towerPassive',
    token: '-10%',
    means: 'tower max HP',
    keywords: ['max HP'],
    status: { kind: 'field', path: ['towerPassive', 'mods', 'towerHp'], as: 'pct' },
  },

  /* ---------------------------------------------------------- §4.2 Animist */
  {
    cls: 'animist',
    slot: 'towerPassive',
    token: '+10%',
    means: 'tower area',
    keywords: ['area'],
    // Authored on the *global* `area` key for want of a `towerArea`, so the
    // sentence's "All towers" is narrower than what the field reaches. That is
    // c013's measurement, not this file's: the number matches, the noun does
    // not.
    status: { kind: 'field', path: ['towerPassive', 'mods', 'area'], as: 'pct' },
  },

  /* ---------------------------------------------------------- §4.2 Paladin */
  {
    cls: 'paladin',
    slot: 'passive',
    token: '+50',
    means: 'defense granted by the stance',
    keywords: ['defense'],
    status: { kind: 'field', path: ['passive', 'stanceArmor'] },
  },
  {
    cls: 'paladin',
    slot: 'passive',
    token: '0.5 s',
    means: 'stand-still time that earns the stance',
    keywords: ['standing still'],
    status: { kind: 'field', path: ['passive', 'stanceSeconds'] },
  },
  {
    cls: 'paladin',
    slot: 'towerPassive',
    token: '+10%',
    means: 'tower max HP',
    // QA swapped the two nouns — "+10% defense and +5 max HP" — over unchanged
    // fields. The window check is what makes that red.
    keywords: ['HP'],
    status: { kind: 'field', path: ['towerPassive', 'mods', 'towerHp'], as: 'pct' },
  },
  {
    cls: 'paladin',
    slot: 'towerPassive',
    token: '+5',
    means: 'tower defense, flat',
    keywords: ['defense'],
    status: { kind: 'field', path: ['towerPassive', 'mods', 'towerDefenseBonus'] },
  },

  /* -------------------------------------------------------- §4.2 Time Lord */
  {
    cls: 'time_lord',
    slot: 'passive',
    token: '4 s',
    means: 'the window the converted damage resolves over',
    keywords: ['DoT'],
    status: {
      kind: 'in_code',
      value: 4,
      file: RUN_TS,
      valueAnchor: /^const TIME_FLOW_BASE_SECONDS = (\d+(?:\.\d+)?);$/,
      absentKey: /charDot|timeFlow/i,
      knownKeys: ['passive.charDotSpeedMul'],
      authorised: RULE4,
      why:
        'The row authors `charDotSpeedMul` (a dormant, shipped-at-1 speed multiplier) but not the ' +
        'base window it scales; that is a `run.ts` constant. A `charDotSeconds` field would need ' +
        "content.ts's schema and run.ts's reader, both outside this lane's Scope — logged, not fixed.",
    },
  },
  {
    cls: 'time_lord',
    slot: 'towerPassive',
    token: '2',
    means: 'TD waves cleared per free bonus level',
    keywords: ['TD waves'],
    status: { kind: 'field', path: ['towerPassive', 'waveInterval'] },
  },
  {
    cls: 'time_lord',
    slot: 'towerPassive',
    token: '+10%',
    means: 'tower range per bonus level',
    keywords: ['range'],
    status: { kind: 'field', path: ['towerPassive', 'bonusRangeMul'], as: 'pct' },
  },
  {
    cls: 'time_lord',
    slot: 'towerPassive',
    token: '+10%',
    means: 'tower AoE area per bonus level',
    // Latent only because `bonusRangeMul === bonusAoeMul` today; QA swapped the
    // two nouns and the first draft could not tell.
    keywords: ['AoE area'],
    status: { kind: 'field', path: ['towerPassive', 'bonusAoeMul'], as: 'pct' },
  },
];

/* ------------------------------------------------------------- extraction */

/**
 * A signed decimal, plus a trailing `%`, `s` or `x` unit when one follows.
 * The unit group only consumes the space before it when a unit is actually
 * there, so "6 s" is one token while the `2` of "2 damage/s" is not dragged
 * into a unit it does not have. The sign class accepts the Unicode minus and
 * dashes SPEC-FINAL itself writes, so a spec-pasted "−5%" is read *with* its
 * sign rather than silently as "5%" — and `NON_ASCII_NUMERIC` below then
 * refuses it outright, with a message naming the character.
 */
const NUMERAL = /[+\-−–—]?\d+(?:\.\d+)?(?:\s*(?:%|s\b|x\b))?/g;

/**
 * Numeral characters the extractor cannot parse and must therefore refuse:
 * vulgar fractions, other fraction forms, full-width and Arabic-Indic digits,
 * super/subscripts, the multiplication sign, and non-ASCII signs. QA smuggled
 * "½ incoming damage" and "＋２０％ damage" past the first draft, including
 * into a `NO_NUMBER` row.
 */
const NON_ASCII_NUMERIC = /[^\P{N}0-9]|[−–—×]/u;

/** English number-words. Every occurrence must be declared in `WORD_NUMBERS`. */
const WORD_NUMBER =
  /\b(zero|none|single|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|hundred|thousand|half|halves|third|quarter|twice|double|triple|quadruple|dozen|once)\b/gi;
// Deliberately not `second`: Archer's "per full second charged" is a unit of
// time, not a count, and would false-positive on every run.

interface Numeral {
  /** Exactly as written in the sentence — what a claim's `token` must equal. */
  text: string;
  start: number;
  end: number;
}

function numerals(text: string): Numeral[] {
  const out: Numeral[] = [];
  for (const m of text.matchAll(NUMERAL)) {
    out.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  }
  return out;
}

/** ASCII-normalised, so a Unicode-signed token still parses to a signed number. */
function toNumber(token: string): number {
  return Number.parseFloat(token.replace(/[−–—]/g, '-'));
}

/** Clause separators. A qualifier may precede its own number, but not cross one of these. */
const CLAUSE = ';:,';

/**
 * The slice of the sentence a numeral owns: the span between its neighbours,
 * **intersected with the clause it sits in**. Wide enough to hold a qualifier
 * that *precedes* its number ("after standing still 0.5 s"), narrow enough
 * that a noun cannot be borrowed from a neighbour.
 *
 * The intersection is not decoration. Without it the inter-numeral span
 * belongs to *both* neighbours, and a second review restored the very lie this
 * mechanism was built for by moving a noun backwards across its own numeral:
 * "cost 10% more; build less range +2 tiles" satisfied a `['cost', 'less']`
 * claim out of the *next* clause's text. The comma is a separator for the same
 * reason — "+10% attack in VS waves and TD waves, -5% elsewhere" otherwise
 * lets the TD claim borrow "TD waves" from the VS clause.
 */
function window(text: string, found: readonly Numeral[], i: number): string {
  const from = i === 0 ? 0 : found[i - 1].end;
  const to = i + 1 < found.length ? found[i + 1].start : text.length;
  let clauseFrom = 0;
  let clauseTo = text.length;
  for (let p = 0; p < text.length; p++) {
    if (!CLAUSE.includes(text[p])) continue;
    if (p < found[i].start) clauseFrom = p + 1;
    else {
      clauseTo = p;
      break;
    }
  }
  return text.slice(Math.max(from, clauseFrom), Math.min(to, clauseTo));
}

/* --------------------------------------------------------------- plumbing */

interface RawClassesDoc {
  classes: { key: string; [k: string]: unknown }[];
}

const RAW = content.raw.classes as RawClassesDoc;

function walk(root: unknown, path: Path): unknown {
  let cur: unknown = root;
  for (const key of path) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function claimPath(c: Claim): Path | null {
  return c.status.kind === 'field' || c.status.kind === 'sibling' ? c.status.path : null;
}

function claimConvert(c: Claim): Convert | undefined {
  return c.status.kind === 'field' || c.status.kind === 'sibling' ? c.status.as : undefined;
}

/** The claim's authored value in the sentence's own units, out of an arbitrary document. */
function readFrom(doc: RawClassesDoc, c: Claim): number | undefined {
  const path = claimPath(c);
  if (!path) return undefined;
  const raw = walk(
    doc.classes.find((row) => row.key === c.cls),
    path,
  );
  if (typeof raw !== 'number') return undefined;
  const as = claimConvert(c);
  return as ? CONVERT[as](raw) : raw;
}

/** The same value as `loadContent()` carries it — what the sim actually runs on. */
function readLoaded(c: Claim): number | undefined {
  const path = claimPath(c);
  if (!path) return undefined;
  const raw = walk(content.classByKey.get(c.cls), path);
  if (typeof raw !== 'number') return undefined;
  const as = claimConvert(c);
  return as ? CONVERT[as](raw) : raw;
}

function description(cls: string, slot: Slot): string {
  const text = walk(content.classByKey.get(cls), [slot, 'description']);
  return typeof text === 'string' ? text : '';
}

/** Every key name in a class row, as dotted paths — the search space for `absentKey`. */
function keyPaths(node: unknown, prefix = ''): string[] {
  if (node === null || typeof node !== 'object') return [];
  // Arrays recurse too: a future `passive.effects: [{ bleedStacks: 1 }]` would
  // otherwise be invisible to both absence searches, silently re-vacuating them.
  if (Array.isArray(node)) return node.flatMap((v, i) => keyPaths(v, `${prefix}[${i}]`));
  const out: string[] = [];
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    const here = prefix ? `${prefix}.${k}` : k;
    out.push(here);
    out.push(...keyPaths(v, here));
  }
  return out;
}

const SOURCES = new Map<string, readonly string[]>();
function sourceLines(file: string): readonly string[] {
  const cached = SOURCES.get(file);
  if (cached) return cached;
  const text = readFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), 'utf8');
  const lines = text.split('\n').map((l) => l.trim());
  SOURCES.set(file, lines);
  return lines;
}

const ALL_CLASSES = RAW.classes.map((c) => c.key);
const DATA_HOMED = LEDGER.filter((c) => claimPath(c) !== null);

function id(c: Claim): string {
  return `${c.cls}.${c.slot} "${c.token}" (${c.means})`;
}

/* ------------------------------------------------------------------ tests */

describe('c015 — every numeral in a class description names its own field', () => {
  for (const cls of ALL_CLASSES) {
    for (const slot of DESCRIBED_SLOTS) {
      it(`${cls}.${slot} — the sentence's numerals are exactly its claims, in order`, () => {
        const text = description(cls, slot);
        expect(text, `${cls}.${slot}: no description authored`).not.toBe('');

        // Refused before extraction: a numeral form the regex cannot see would
        // otherwise be a magnitude with no claim and no failure.
        const foreign = text.match(NON_ASCII_NUMERIC);
        expect(
          foreign,
          `${cls}.${slot}: "${text}" contains the non-ASCII numeric character ${JSON.stringify(
            foreign?.[0],
          )} (U+${(foreign?.[0]?.codePointAt(0) ?? 0).toString(16).toUpperCase()}). Descriptions must use ASCII digits, an ASCII "-" sign and an ASCII "-" dash — SPEC-FINAL's own "−" is U+2212 and does not belong in /data.`,
        ).toBeNull();

        const declared = WORD_NUMBERS.filter((w) => w.cls === cls && w.slot === slot).map((w) => w.word.toLowerCase());
        const words = [...text.matchAll(WORD_NUMBER)].map((m) => m[0].toLowerCase());
        expect(
          words.slice().sort(),
          `${cls}.${slot}: "${text}" uses an undeclared number-word. The extractor cannot parse word-numbers, so each must be declared in WORD_NUMBERS with a reason.`,
        ).toEqual(declared.slice().sort());

        const found = numerals(text);
        const claims = LEDGER.filter((c) => c.cls === cls && c.slot === slot);
        const skipped = NO_NUMBER.find((n) => n.cls === cls && n.slot === slot);

        if (skipped) {
          expect(
            found.map((n) => n.text),
            `${cls}.${slot} is declared as stating no number, but its sentence does: "${text}"`,
          ).toEqual([]);
          expect(claims, `${cls}.${slot} is in NO_NUMBER and must carry no claims`).toEqual([]);
          expect(skipped.why.length, `${cls}.${slot}: NO_NUMBER rows must say why`).toBeGreaterThan(40);
          return;
        }

        // The zip: every numeral the player is shown lines up with a declared
        // claim, in order of appearance. An unclaimed number has nowhere to
        // hide and a deleted one fails just as loudly.
        expect(
          found.map((n) => n.text),
          `${cls}.${slot}: "${text}" — numerals and ledger claims disagree`,
        ).toEqual(claims.map((c) => c.token));
        expect(found.length, `${cls}.${slot} states numbers but is in neither table`).toBeGreaterThan(0);

        // ...and each numeral is still attached to the noun its claim is about.
        found.forEach((_, i) => {
          const own = window(text, found, i);
          for (const kw of claims[i].keywords) {
            expect(
              own.includes(kw),
              `${id(claims[i])}: "${kw}" is no longer beside this number — its window is "${own}". The number still matches its field, but the sentence is now about something else.`,
            ).toBe(true);
          }
        });
      });
    }
  }
});

describe('c015 — each claim resolves to its field, or to a named deviation', () => {
  for (const c of LEDGER) {
    it(`${id(c)} — ${c.status.kind}`, () => {
      const st = c.status;
      const stated = toNumber(c.token);
      expect(Number.isFinite(stated), `${id(c)}: token is not a number`).toBe(true);
      expect(description(c.cls, c.slot), `${id(c)}: token is not in the sentence`).toContain(c.token);
      expect(c.keywords.length, `${id(c)}: every claim must bind its number to a noun`).toBeGreaterThan(0);
      for (const kw of c.keywords) {
        // A one-character or punctuation-only keyword satisfies every window
        // and binds nothing; a keyword taken from the token binds nothing new.
        expect(
          kw.trim().length,
          `${id(c)}: keyword ${JSON.stringify(kw)} is too short to bind anything`,
        ).toBeGreaterThanOrEqual(2);
        expect(/[A-Za-z]/.test(kw), `${id(c)}: keyword ${JSON.stringify(kw)} must contain a letter`).toBe(true);
        expect(
          c.token.includes(kw),
          `${id(c)}: keyword ${JSON.stringify(kw)} is part of the token, so it binds nothing`,
        ).toBe(false);
      }

      if (st.kind !== 'field') {
        expect(st.authorised, `${id(c)}: a deviation must name the item that authorised it`).toMatch(ITEM_ID);
        expect(st.why.length, `${id(c)}: a deviation must say why`).toBeGreaterThan(40);
      }

      switch (st.kind) {
        case 'field': {
          // "the field on that row it names" — mechanically, the path's first
          // segment is the claim's own slot.
          expect(st.path[0], `${id(c)}: a 'field' claim must read its own slot, not ${st.path[0]}`).toBe(c.slot);
          const live = readLoaded(c);
          expect(live, `${id(c)}: nothing authored at ${st.path.join('.')}`).toBeTypeOf('number');
          expect(live, `${id(c)}: the sentence says ${c.token}, the field says ${live}`).toBeCloseTo(stated, 9);
          break;
        }
        case 'sibling': {
          expect(st.path[0], `${id(c)}: a 'sibling' claim must read another slot`).not.toBe(c.slot);
          const live = readLoaded(c);
          expect(live, `${id(c)}: nothing authored at ${st.path.join('.')}`).toBeTypeOf('number');
          expect(live, `${id(c)}: the sentence says ${c.token}, ${st.path.join('.')} says ${live}`).toBeCloseTo(
            stated,
            9,
          );
          // The split is the whole reason this is a deviation: if the key ever
          // lands on the claim's own slot, the deviation is over and the claim
          // must become a `field` — a half-landed c010 is red, not green.
          const leaf = st.path[st.path.length - 1];
          // The *raw* row, never `loadContent()`: zod strips keys it does not
          // know, so a field authored onto the passive today would be invisible
          // in the loaded view and this check would pass while the split it
          // records had in fact half-closed.
          const own = walk(
            RAW.classes.find((r) => r.key === c.cls),
            [c.slot],
          );
          expect(
            keyPaths(own).filter((k) => k === leaf || k.endsWith(`.${leaf}`)),
            `${id(c)}: '${leaf}' is now authored on ${c.slot} too — the split this deviation records has closed, so it should be a 'field' claim`,
          ).toEqual([]);
          break;
        }
        case 'in_code': {
          // The capture group is what makes the source the authority instead
          // of a second hand-copy: the ledger's value must be the literal the
          // sim reads, not a number that merely agrees with the sentence.
          const lines = sourceLines(st.file);
          const hit = lines.map((l) => st.valueAnchor.exec(l)).find((m): m is RegExpExecArray => m !== null);
          expect(
            hit,
            `${id(c)}: ${st.file} no longer contains a line matching ${st.valueAnchor} — the literal moved`,
          ).toBeDefined();
          expect(
            hit![1],
            `${id(c)}: ${st.valueAnchor} has no capture group around the literal — the anchor must read the number, not merely sit beside it`,
          ).toBeDefined();
          expect(
            Number(hit![1]),
            `${id(c)}: ${st.file} runs on ${hit![1]}, the sentence says ${c.token}`,
          ).toBeCloseTo(stated, 9);
          expect(st.value, `${id(c)}: the ledger's own value disagrees with its token`).toBeCloseTo(stated, 9);
          for (const anchor of st.anchors ?? []) {
            expect(
              lines.some((l) => anchor.test(l)),
              `${id(c)}: ${st.file} no longer contains a line matching ${anchor}`,
            ).toBe(true);
          }
          // ...and "still not authored in /data" is a search, not a tautology:
          // the day the field lands, this claim must stop calling itself debt.
          // Raw again, for the same reason: an unschema'd `charDotSeconds`
          // landing in `/data` is exactly the event this search exists to
          // catch, and the loader would drop it before we looked.
          const row = RAW.classes.find((r) => r.key === c.cls);
          expect(
            keyPaths(row).filter((k) => st.absentKey.test(k.split('.').pop()!)),
            `${id(c)}: the keys matching ${st.absentKey} have changed — if the figure is now authored in /data, this is no longer a rule-4 deviation`,
          ).toEqual([...st.knownKeys]);
          break;
        }
        case 'prose': {
          expect(claimPath(c), `${id(c)}: a 'prose' claim declares no path`).toBeNull();
          break;
        }
      }
    });
  }
});

describe('c015 — the ledger holds itself to c015’s own rule', () => {
  it('every claim is a field match or carries a named authorisation', () => {
    const unaccounted = LEDGER.filter((c) => c.status.kind !== 'field' && !ITEM_ID.test(c.status.authorised)).map(id);
    expect(unaccounted, 'a numeral matching no field and naming no authorising item').toEqual([]);
  });

  it('a percent token and a percent converter imply each other', () => {
    // `as` is a closed enum, but nothing else stops it being attached to a
    // flat field or omitted from a fractional one. The correspondence holds
    // across all 28 data-homed claims today, so it is free to assert.
    for (const c of DATA_HOMED) {
      expect(
        claimConvert(c) !== undefined,
        `${id(c)}: token "${c.token}" and converter ${claimConvert(c) ?? 'none'} disagree about being a percentage`,
      ).toBe(c.token.endsWith('%'));
    }
  });

  it('the loader and the raw document agree on every sentence and every claimed field', () => {
    for (const cls of ALL_CLASSES) {
      const row = RAW.classes.find((r) => r.key === cls)!;
      for (const slot of DESCRIBED_SLOTS) {
        const raw = walk(row, [slot, 'description']);
        expect(description(cls, slot), `${cls}.${slot}: loader and raw document disagree on the sentence`).toBe(raw);
      }
    }
    for (const c of DATA_HOMED) {
      expect(readLoaded(c), `${id(c)}: loader and raw document disagree`).toBeCloseTo(readFrom(RAW, c)!, 9);
    }
  });

  it('each data-homed claim reads its own field, and no other claim reads it too', () => {
    // A retune moving a field must redden exactly the sentence that quotes it.
    // Without this a typo'd path would read `undefined` and assert nothing,
    // and two claims sharing one field would mean a retune reddens only one.
    for (const target of DATA_HOMED) {
      const path = claimPath(target)!;
      const doc = JSON.parse(JSON.stringify(RAW)) as RawClassesDoc;
      const row = doc.classes.find((r) => r.key === target.cls);
      const parent = walk(row, path.slice(0, -1)) as Record<string, unknown> | undefined;
      const leaf = path[path.length - 1];
      expect(parent, `${id(target)}: ${path.join('.')} has no parent object`).toBeTypeOf('object');
      expect(typeof parent![leaf], `${id(target)}: nothing authored at ${path.join('.')}`).toBe('number');

      parent![leaf] = (parent![leaf] as number) + 1;

      const moved = DATA_HOMED.filter((c) => {
        const now = readFrom(doc, c);
        const was = readFrom(RAW, c);
        return now === undefined || was === undefined ? now !== was : Math.abs(now - was) > 1e-12;
      });
      expect(moved.map(id), `mutating ${target.cls}.${path.join('.')} moved the wrong set of claims`).toEqual([
        id(target),
      ]);
    }
  });

  it('every described slot is covered, and the Actives still describe nothing', () => {
    const described: string[] = [];
    for (const row of RAW.classes) {
      for (const slot of DESCRIBED_SLOTS) {
        const text = walk(row, [slot, 'description']);
        expect(typeof text, `${row.key}.${slot}: no description authored`).toBe('string');
        described.push(`${row.key}.${slot}`);
        const covered =
          LEDGER.some((c) => c.cls === row.key && c.slot === slot) ||
          NO_NUMBER.some((n) => n.cls === row.key && n.slot === slot);
        expect(covered, `${row.key}.${slot} is in neither the ledger nor NO_NUMBER`).toBe(true);
      }
      // c015 was filed expecting 36 strings — three slots per class. The
      // schema gives one only to the two passive slots. If an Active ever
      // gains a sentence, this fails and its numerals must be entered above.
      for (const slot of UNDESCRIBED_SLOTS) {
        expect(
          walk(row, [slot, 'description']),
          `${row.key}.${slot} gained a description — its numerals need ledger claims`,
        ).toBeUndefined();
      }
    }
    expect(described.length, 'SPEC-FINAL §13 ships 12 classes x 2 described slots').toBe(24);
    // Every declared word-number belongs to a slot that exists.
    for (const w of WORD_NUMBERS) {
      expect(described, `WORD_NUMBERS names ${w.cls}.${w.slot}, which is not a described slot`).toContain(
        `${w.cls}.${w.slot}`,
      );
      expect(w.why.length, `WORD_NUMBERS ${w.cls}.${w.slot} "${w.word}" must say why`).toBeGreaterThan(40);
    }
  });

  it('census: 26 field · 2 sibling · 3 in code · 1 prose, over 22 sentences, 2 wordless, 4 word-numbers', () => {
    // The census is the barrier: a new deviation cannot be absorbed into an
    // existing status, and closing one — c010 moving Conduction onto its own
    // row, any of the three literals reaching `/data` — has to be recorded
    // here rather than passing unnoticed.
    const count = (k: Status['kind']): number => LEDGER.filter((c) => c.status.kind === k).length;
    expect({
      field: count('field'),
      sibling: count('sibling'),
      in_code: count('in_code'),
      prose: count('prose'),
      sentences: new Set(LEDGER.map((c) => `${c.cls}.${c.slot}`)).size,
      wordless: NO_NUMBER.length,
      wordNumbers: WORD_NUMBERS.length,
    }).toEqual({ field: 26, sibling: 2, in_code: 3, prose: 1, sentences: 22, wordless: 2, wordNumbers: 4 });
  });
});
