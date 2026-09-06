/**
 * c008 (BACKLOG-CONTENT, lane `content`) — **SPEC-FINAL §4's stated numbers,
 * as an auditable ledger.**
 *
 * `data/classes.json` has drifted from §4.1/§4.2's explicit figures in seven
 * places. Every one of those seven is a *legitimate, logged tune* — but
 * nothing in the repo distinguishes a logged tune from an accident, so an
 * eighth could land tomorrow and read exactly like the other seven. That is
 * the gap this file closes.
 *
 * **This item changes no number.** Not one byte of `/data` or `/src` moved
 * for it. The deliverable is the barrier: every figure §4 states out loud is
 * a row here, and every row must resolve into exactly one of six statuses.
 *
 *   `match`         — the authored value is the spec's value. Pinned exactly.
 *   `retuned`       — the authored value differs, and the row names the
 *                     backlog item that measured and authorised the change.
 *                     Both the spec figure *and* the shipped value are
 *                     pinned, so a further drift is red until it is
 *                     re-authorised here.
 *   `elsewhere`     — the figure is correct and authored in `/data`, just not
 *                     in `classes.json` (one row: Time Lord's stun-lock reads
 *                     `damagetypes.json`'s own frozen duration).
 *   `in_code`       — the figure is correct but lives as a literal in `/src`,
 *                     which architecture rule 4 says it should not. Pinned by
 *                     its source site so it cannot change silently, and
 *                     counted so the rule-4 debt is a number.
 *   `unimplemented` — §4 states the figure and the sim has no such number at
 *                     all. Each names the item tracking it.
 *   `defect`        — the figure exists and the sim contradicts it. One row.
 *
 * **"A figure with neither fails"** is c008's own wording, and the ledger
 * enforces it two ways: a `match` must equal the spec, and every non-`match`
 * must carry a non-empty authorisation/tracking string. The four statuses
 * past `match`/`retuned` are a deliberate extension of that wording — a
 * figure that lives in code, in another `/data` file, nowhere, or wrongly is
 * *also* "neither", and turning those four into hard failures would mean
 * shipping a red test or changing a number, both of which c008 rules out.
 * They are accounted for instead: declared, pinned, counted, and named.
 *
 * **What stops the ledger from lying to itself.** Four things, each of which
 * caught a real defect in this file while it was being written:
 *
 *   - Rows are declared as a *path* into the class row, never as a
 *     hand-written closure, and mutating one figure's field in a copy of
 *     `data/classes.json` must move exactly one row's reading. A typo'd path
 *     reads `undefined` and asserts nothing; two rows sharing one field means
 *     deleting it reddens only one. (This caught a wrong path: Paladin's
 *     `wrathFraction` is authored on the passive row, not on `active1`.)
 *   - Coverage is checked per **slot**, not per class, against a declared
 *     `NO_FIGURE` table of slots §4 states no number for. (This is the fix
 *     for a real miss: Swordsman's "applies 1 Bleeding" had no row while
 *     three other Swordsman rows kept a per-class check green.)
 *   - Every null-path row names the key it is watching for, so "still not
 *     authored in `/data`" is a search and not a tautology. Without it the
 *     two `unimplemented` rows would have had no assertion at all —
 *     `readLoaded` returns `undefined` for a null path by construction, so
 *     they would have stayed green on the very day the clause landed.
 *   - §4's own text is hashed, so a spec edit forces a re-read rather than
 *     leaving the `spec` column asserting a superseded figure. The hash alone
 *     does *not* stop a drift being laundered by editing `spec` — QA proved
 *     that — so every row's `figure` must additionally appear **verbatim in
 *     its own class's §4 text**. Laundering now means quoting a sentence the
 *     spec does not contain.
 *
 * A bridge assertion holds `loadContent()`'s view and the raw document to the
 * same value at every path, so the ledger audits what the sim actually runs
 * on rather than what the file on disk says.
 *
 * **Deliberately out of the ledger**: everything §4's header marks ⚖ as a
 * band→number mapping (`basicAttack` dps/range/interval/aoe, `moveSpeedBonus`,
 * every `cooldownSeconds` §4 never states). c008's own text draws that line:
 * the header marks the band mapping ⚖, not these explicit figures. Two
 * figures §4 states *are* marked ⚖ individually and are in the ledger anyway
 * (Swordsman's 3 s charge cap, Pyro's 2 dmg/s, Cryomancer's 20 shatter) —
 * they match today, and ⚖ is licence to retune, not licence to drift
 * unrecorded.
 *
 * refs: SPEC-FINAL §4.1/§4.2, CLAUDE.md rule 3, c011 (which relies on this
 * file being the one place that pins magnitudes).
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { isScaledClassPath, loadContent } from '../src/sim/content';
import { scaled } from './helpers';

const content = loadContent();

/**
 * sha256 of SPEC-FINAL.md from `## 4. Characters` up to `## 5. Towers`,
 * newline-normalised. Regenerate deliberately, never reflexively: a change
 * here means §4 moved and every `spec` below has to be re-read against it.
 */
const SPEC_4_SHA256 = 'e12eae96e2b2ba9cebf1f055aaf28f44abfa66e627d815aa45f2de6e738107d6';

/** §3's own Burning row — Pyro's "3 Burning" is stated in units of it. */
const BURNING = content.damageTypeByKey.get('burning');
/**
 * fb153a: the **authored** per-application Burning dps. Rows stated in units of
 * it (Pyromancer's "applying 3 Burning") divide an authored magnitude by an
 * authored unit; dividing by the loaded, scaled one would cancel the scale
 * twice over and read 90 instead of 9.
 */
const BURNING_AUTHORED_DPS = (content.raw.damageTypes as { types: { key: string; dps?: number }[] }).types.find(
  (t) => t.key === 'burning',
)?.dps;
/** §3's own frozen status — Time Lord's "stun-locks 3 s" is stated in units of it. */
const FROZEN = content.damageTypes.statuses.frozen;

/* ------------------------------------------------------------- the ledger */

type Path = readonly string[];

/** The four slots §4 gives every class. A figure belongs to the slot the *spec* states it on. */
type Slot = 'passive' | 'active1' | 'active2' | 'towerPassive';

const SLOTS: readonly Slot[] = ['passive', 'active1', 'active2', 'towerPassive'];

/**
 * Every status that means "not authored in `data/classes.json`" must name the
 * key it would be authored *under* if it ever were. Without it the row's
 * "still not in `/data`" claim is a tautology — `readLoaded` returns
 * `undefined` for a null path by construction, so the check could never fail,
 * including on the day the field lands. `absentKey` is matched against the
 * *key names* of the slot's own object (recursively, so `mods` is covered),
 * never its values, so a `kind` string like `poison_boost` cannot satisfy a
 * search for a `boost` multiplier.
 */
interface Absence {
  /** The slot the field would most likely be authored on. Named in the failure message. */
  in: Slot;
  /** Key names that would mean the figure had arrived. Searched on all four slots, not just `in`. */
  absentKey: RegExp;
  /**
   * The `slot.key` names that already match `absentKey` on shipped data and
   * are *not* this figure — Manifest's own `summonCap`, Blood Frenzy's own
   * `leech`, Time's five `mark*Dot*` fields. Searching four slots with a
   * deliberately broad regex means real neighbours get caught, so the check
   * is "this exact set, still" rather than "nothing". A newly authored key
   * lands outside the set and reddens the row.
   */
  knownKeys?: readonly string[];
  /**
   * The `/src` lines the clause would have to change to be implemented in
   * code instead of in `/data`. Every line containing `needle` in `file`,
   * trimmed, must equal `lines` exactly.
   *
   * Searching `data/classes.json` alone is not enough to say a clause is
   * still unimplemented: eight §4 figures in this very ledger ship as `/src`
   * literals, so code is the precedent. QA implemented Animist's summon cap
   * +1 as `+ (w.warden.classKey === 'animist' ? 1 : 0)` at a cap site and the
   * ledger stayed green, still asserting the clause was unimplemented. Whole
   * lines rather than substrings, because an appended term leaves a substring
   * anchor matching (QA broke `1 + Math.floor(held)` the same way).
   */
  srcLines?: readonly { file: string; needle: string; lines: readonly string[] }[];
}

type Status =
  /** The authored value is §4's value. */
  | { kind: 'match' }
  /** The authored value differs, and `authorised` names what measured it. */
  | { kind: 'retuned'; authorised: string; actual: number; why: string }
  /** Correct, authored in `/data`, but not in `classes.json`. */
  | ({ kind: 'elsewhere'; source: string; live: number; why: string } & Absence)
  /** Correct, but a literal in `/src` — architecture rule 4 debt. */
  | ({ kind: 'in_code'; site: string; file: string; anchors: readonly RegExp[]; why: string } & Absence)
  /** §4 states it; the sim has no such number. */
  | ({ kind: 'unimplemented'; tracked: string; why: string } & Absence)
  /** §4 states it; the sim contradicts it. */
  | ({ kind: 'defect'; tracked: string; site: string; file: string; anchors: readonly RegExp[]; why: string } & Absence);

interface Figure {
  /** `data/classes.json` class key. */
  cls: string;
  /** The §4 clause the figure belongs to, by its authored name. */
  clause: string;
  /**
   * The figure in SPEC-FINAL's own words. Asserted to appear **verbatim** in
   * this class's own §4 text, so the `spec` column cannot be quietly edited
   * to match a drift: the row would have to quote a sentence §4 does not
   * contain. Where the natural label is not a contiguous quote, `quote`
   * carries the literal substring instead.
   */
  figure: string;
  /** The verbatim §4 substring, when `figure` is not itself one. */
  quote?: string;
  /** The number §4 states. */
  spec: number;
  /**
   * Where the number is authored in `data/classes.json`, relative to the
   * class row. `null` means "nowhere in this file" — which is a finding, not
   * an omission, and only the four non-`classes.json` statuses may use it.
   */
  path: Path | null;
  /**
   * The slot §4 states the figure on, when that is *not* where it is
   * authored. Three shipped figures are stated on one slot and authored on
   * another (Conduction's two, Clarion's Wrath fraction), and every null-path
   * row has no authored slot at all — so the spec's own slot has to be
   * declared rather than inferred from the path.
   */
  slot?: Slot;
  /** Converts the authored encoding into §4's units and sign. */
  as?: (v: number) => number;
  status: Status;
  note?: string;
}

/**
 * A class slot for which §4 states **no number at all**. Declared, not
 * inferred: the coverage check below requires every one of the 12x4 slots to
 * hold either a ledger row or an entry here, which is what turns "did we miss
 * a figure?" from a reading exercise into a test. (Swordsman's passive was in
 * fact missed on the first pass; a per-class-only coverage rule did not see
 * it, and this table is the fix.)
 */
const NO_FIGURE: readonly { cls: string; slot: Slot; clause: string; why: string }[] = [
  {
    cls: 'swordsman',
    slot: 'active2',
    clause: 'Dash Slash',
    why:
      '§4.1 states Dash Slash entirely in rules — dash along the mouse direction, usable during a ' +
      'Circle Slash charge, hit range expands by the current charge radius, the damages sum into ' +
      'one attack. Every quantity in it is borrowed from Circle Slash or from §2, and the clause ' +
      'names no figure of its own.',
  },
];

const CLASSES_TS = 'src/sim/classes.ts';
const COMBAT_TS = 'src/sim/combat.ts';
const RUN_TS = 'src/sim/run.ts';

/** p6e — G8's first honest per-class win-rate measurement, PROGRESS.md. */
const P6E =
  'p6e (commit 0d399cd, PROGRESS.md): the two classes — Necromancer and Paladin — that got "a ' +
  'real, measured second look before being accepted as content-gated rather than balance-broken" ' +
  'after going 0/12 on G8. Both packages moved the failure mode from an early defeat_warden to ' +
  'the wave-11-to-17 wall the other eight already hit, and were kept on that evidence though both ' +
  'stayed 0/12. PROGRESS.md\'s scope note for the pair: "no `damage`/`dps` field was pushed ' +
  'further once the failure mode converged" — which is why these seven figures are cooldowns, ' +
  'durations, fractions and stat multipliers rather than raw damage.';
/** p12a — BALANCE DIRECTION v2 §A's kit re-anchor, PROGRESS.md/BALANCE.md. */
const P12A =
  'p12a (BALANCE DIRECTION v2 §A, PROGRESS.md / BALANCE.md "Kit relevance target"): the owner-ordered ' +
  'x3 re-anchor of every authored ABSOLUTE class-kit damage magnitude in data/classes.json for the ' +
  'post-fb025 (enemy HP x10) world — 29 values across all 12 classes, alongside the run-long ' +
  '`kitPower` multiplier. Every figure it moves is one SPEC-FINAL §4 itself marks tunable. Multiplier- ' +
  'shaped fields were deliberately left alone, which is why this authorisation covers damage numbers ' +
  'and nothing else. Measured control pair recorded in tests/class-kit-damage-share.test.ts.';

/** p10s — the G8 retune probe that closed bloodlord into band, PROGRESS.md. */
const P10S =
  'p10s (commit 3ce8cb8, PROGRESS.md): brought bloodlord 10/12 -> 8/12, into ' +
  "G8's [35%,70%] band; the towerPassive description string was corrected to match";

const LEDGER: readonly Figure[] = [
  /* ------------------------------------------------------- §4.1 Swordsman */
  {
    cls: 'swordsman',
    clause: 'Thousand Cuts (passive)',
    figure: 'each attack applies 1 Bleeding',
    quote: 'applies 1 Bleeding',
    spec: 1,
    path: null,
    slot: 'passive',
    status: {
      kind: 'in_code',
      site: "passiveOnHit — the base count is the `1` in `Array(1 + extra)`, and BLEEDING_ON_HIT is its one-element default",
      file: CLASSES_TS,
      anchors: [
        /const BLEEDING_ON_HIT: readonly string\[\] = \['bleeding'\];/,
        /Array\(1 \+ extra\)\.fill\('bleeding'\) : BLEEDING_ON_HIT;/,
      ],
      why:
        'The stack count is a literal. Only the §6.3 skill card\'s *extra* stacks are data-driven ' +
        '(`classLineBonus`); the base 1 the passive itself states is not authored anywhere. Exact ' +
        'twin of Pyro\'s "applying 3 Burning", which *is* authored.',
      in: 'passive',
      absentKey: /bleed|stacks|onHit/i,
    },
  },
  {
    cls: 'swordsman',
    clause: 'Circle Slash',
    figure: 'charge time cap = 3 s-equivalent',
    quote: 'cap = 3 s-equivalent',
    spec: 3,
    path: ['active1', 'chargeCapSeconds'],
    status: { kind: 'match' },
    note: '§4.1 marks this one figure ⚖; it matches today and is pinned so a retune is a decision.',
  },
  {
    cls: 'swordsman',
    clause: 'Wind Slash (tower passive)',
    figure: 'all towers +10% attack speed',
    spec: 0.1,
    path: ['towerPassive', 'mods', 'towerAttackSpeed'],
    status: { kind: 'match' },
  },

  /* -------------------------------------------------- §4.1 Plaguebringer */
  {
    cls: 'plaguebringer',
    clause: 'Spreading Plague (passive)',
    figure: 'deal the unfinished damage to the nearest enemy once',
    quote: 'deal the total unfinished damage to the nearest enemy once',
    spec: 1,
    path: null,
    slot: 'passive',
    status: {
      kind: 'in_code',
      site: 'drainPlagueTransfers — `const targets = 1 + Math.round(classLineBonus(w))`',
      file: 'src/sim/enemies.ts',
      anchors: [/const targets = 1 \+ Math\.round\(classLineBonus\(w\)\);/],
      why:
        'One target, once. As with Thousand Cuts, only the §6.3 line bonus is data-driven and the ' +
        'base 1 the clause states is a literal. Already named as a blocker for fb056\'s Ring of ' +
        'Contagion (BACKLOG-CONTENT Log, session 1) — this row pins the number that item would move.',
      in: 'passive',
      absentKey: /target|transfer|fanOut|spread|nearest|count/i,
    },
  },
  {
    cls: 'plaguebringer',
    clause: 'Poison Barrel',
    figure: 'a circle of poison on the ground for 5 s',
    spec: 5,
    path: ['active1', 'groundDurationSeconds'],
    status: { kind: 'match' },
  },
  {
    cls: 'plaguebringer',
    clause: 'Poison Barrel',
    figure: 'applying poison damage every second',
    quote: 'applying\npoison damage every second',
    spec: 1,
    path: null,
    slot: 'active1',
    status: {
      kind: 'defect',
      tracked: 'BACKLOG-CONTENT Log, 2026-09-03 session 1 (fb062 scoping) — main lane',
      site: "updateAreas' poison branch re-applies every tick (60 Hz), not every second",
      file: COMBAT_TS,
      anchors: [/if \(a\.type === 'poison'\) \{\s+applyPoison\(w, e, a\.dps \* scale, 1\.0, \d+, a\.source\);\s+\} else \{/],
      why:
        'The cadence is not authored anywhere: `ground_poison` has no interval field, and ' +
        'the barrel re-applies 60x per second. The stack cap of 3 bounds the damage, so this ' +
        'is a refresh-cadence bug rather than a damage bug — but §4.1 states "every second" ' +
        'and the sim does not. Fixing it is a `combat.ts` edit, outside this lane. The anchor ' +
        'spans the whole poison branch, so wrapping the call in an interval gate reddens this ' +
        'row rather than leaving it claiming a defect that had been fixed.',
      in: 'active1',
      absentKey: /interval|cadence|tick|period|every|applySeconds|perSecond/i,
      knownKeys: ['basicAttack.interval'],
    },
  },
  {
    cls: 'plaguebringer',
    clause: 'Poison Boost',
    figure: 'double the remaining poison damage',
    spec: 2,
    path: null,
    slot: 'active2',
    status: {
      kind: 'in_code',
      site: 'firePoisonBoost',
      file: CLASSES_TS,
      anchors: [/if \(d\.type === 'poison'\) d\.dps \*= 2;/],
      why:
        'The multiplier is a literal. `poison_boost` authors no field for it, so a rebalance ' +
        'of "double" would be a code edit — architecture rule 4 says it should be `/data`.',
      in: 'active2',
      absentKey: /mul|multiplier|factor|scale|boost|double/i,
    },
  },
  {
    cls: 'plaguebringer',
    clause: 'Miasma (tower passive)',
    figure: 'all towers +10% poison damage',
    spec: 0.1,
    path: ['towerPassive', 'mods', 'towerPoisonDamage'],
    status: { kind: 'match' },
  },

  /* ------------------------------------------------------- §4.2 Archer */
  {
    cls: 'archer',
    clause: 'Long Draw (passive)',
    figure: '+1 pierce per full second charged',
    spec: 1,
    path: null,
    slot: 'passive',
    status: {
      kind: 'in_code',
      site: 'fireDeadeyeDraw — `Math.min(pierceCap, 1 + Math.floor(held)) + classLineBonus(w)`',
      file: CLASSES_TS,
      anchors: [/const hits = Math\.min\(eff\.pierceCap \?\? 1, 1 \+ Math\.floor\(held\)\) \+ classLineBonus\(w\);/],
      why:
        'The *rate* (1 per second) and the base (1) are both literals; only the ceiling ' +
        "(`pierceCap`) is authored. This is one of c006's three prose-only passive rows — " +
        'c006 pins that the clause lives on `active1`; this row pins its number. ' +
        "c017 moved the §6.3 card's bonus out of the `min` and onto the resolved count " +
        '(it was inert inside it, `pierceCap 6` sitting at exactly `1 + chargeCapSeconds`); ' +
        "the passive's own rate and base are untouched by that, and this pointer follows the fix.",
      in: 'active1',
      absentKey: /pierce(?!Cap)/i,
    },
  },
  {
    cls: 'archer',
    clause: 'Deadeye Draw',
    figure: '+40%/s compounding',
    spec: 0.4,
    path: ['active1', 'compoundPerSecond'],
    status: { kind: 'match' },
    note: '§4.2 marks this figure ⚖; it matches today.',
  },
  {
    cls: 'archer',
    clause: 'Deadeye Draw',
    figure: 'move −40% while drawing',
    spec: -0.4,
    path: ['active1', 'moveMulWhileCharging'],
    as: (v) => v - 1,
    status: { kind: 'match' },
    note: 'Authored as the surviving multiplier (0.60), read here as the stated penalty.',
  },
  {
    cls: 'archer',
    clause: 'Quickstep',
    figure: 'firing 3 arrows',
    spec: 3,
    path: ['active2', 'volleyShots'],
    status: { kind: 'match' },
  },
  {
    cls: 'archer',
    clause: "Ranger's Eye (tower passive)",
    figure: 'all towers +10% range',
    spec: 0.1,
    path: ['towerPassive', 'mods', 'towerRange'],
    status: { kind: 'match' },
  },

  /* ----------------------------------------------------- §4.2 Engineer */
  {
    cls: 'engineer',
    clause: 'Efficient Engineering (passive)',
    figure: 'builds & upgrades cost −10%',
    spec: -0.1,
    path: ['passive', 'mods', 'towerCost'],
    status: { kind: 'match' },
  },
  {
    cls: 'engineer',
    clause: 'Efficient Engineering (passive)',
    figure: 'build range +2',
    spec: 2,
    path: ['passive', 'mods', 'buildRange'],
    status: { kind: 'match' },
  },
  {
    cls: 'engineer',
    clause: 'Field Kit',
    figure: 'repair target structure 40% max HP',
    spec: 0.4,
    path: ['active1', 'repairFraction'],
    status: { kind: 'match' },
  },
  {
    cls: 'engineer',
    clause: 'Field Kit',
    figure: 'overclock +50% atk spd',
    spec: 0.5,
    path: ['active1', 'overclockAtkSpdMul'],
    status: { kind: 'match' },
  },
  {
    cls: 'engineer',
    clause: 'Field Kit',
    figure: 'overclock 6 s',
    quote: 'overclock +50% atk spd 6 s',
    spec: 6,
    path: ['active1', 'overclockSeconds'],
    status: { kind: 'match' },
  },
  {
    cls: 'engineer',
    clause: 'Pop Turret',
    figure: 'a mini arrow turret (30% stats)',
    spec: 0.3,
    path: ['active2', 'summonStatMul'],
    status: { kind: 'match' },
  },
  {
    cls: 'engineer',
    clause: 'Pop Turret',
    figure: '10 s',
    spec: 10,
    path: ['active2', 'summonDurationSeconds'],
    status: { kind: 'match' },
  },
  {
    cls: 'engineer',
    clause: 'Pop Turret',
    figure: 'cap 2',
    spec: 2,
    path: ['active2', 'summonCap'],
    status: { kind: 'match' },
  },
  {
    cls: 'engineer',
    clause: 'Reinforced Frames (tower passive)',
    figure: 'all towers +10% HP',
    spec: 0.1,
    path: ['towerPassive', 'mods', 'towerHp'],
    status: { kind: 'match' },
  },

  /* --------------------------------------------------------- §4.2 Pyro */
  {
    cls: 'pyromancer',
    clause: 'Contagious Flame (passive)',
    figure: 'Burning enemies deal 2 dmg/s to enemies touching them',
    quote: 'Burning enemies deal 2 dmg/s ⚖ to enemies touching them',
    spec: 2,
    path: ['passive', 'flameDps'],
    status: {
      kind: 'retuned',
      authorised: P12A,
      actual: 6,
      why: "§4.2 marks this figure ⚖. p12a's x3 kit re-anchor moved it 2 -> 6 with every other absolute kit-damage magnitude.",
    },
  },
  {
    cls: 'pyromancer',
    clause: 'Immolation Wave',
    figure: 'r4 burst',
    spec: 4,
    path: ['active1', 'radius'],
    status: { kind: 'match' },
  },
  {
    cls: 'pyromancer',
    clause: 'Immolation Wave',
    figure: 'applying 3 Burning',
    spec: 3,
    path: ['active1', 'burnDps'],
    as: (v) => v / (BURNING_AUTHORED_DPS ?? Number.NaN),
    status: {
      kind: 'retuned',
      authorised: P12A,
      actual: 9,
      why:
        "§4.2 marks Immolation Wave's burn ⚖ and p12a's x3 kit re-anchor moved `burnDps` 3 -> 9 with " +
        'every other absolute kit-damage magnitude. Because this row is read in units of §3 ' +
        "Burning's own dps, that also moves the stacks-equivalent reading 3 -> 9: the field is doing " +
        'double duty as a damage number and as an implied stack count, and the re-anchor could only ' +
        'move both together. Damage was the axis the directive named, so it wins; whoever closes ' +
        "§17's open Burning-stack-timing verdict should re-separate the two.",
    },
    note:
      "Authored as ONE application at 3x §3 Burning's own 1 dps. That is equivalent to three " +
      'stacked applications **on damage only**: §3 charges its −1 armor/s *per application*, so ' +
      'the sim shreds 1 armor/s where three real stacks would shred 3, and any reader that counts ' +
      'stacks sees one. §3 ships "refresh-strongest until then" and §17 keeps Burning stack timing ' +
      'open for owner veto, so a literal 3-stack encoding is not available yet — the shred gap is a ' +
      "consequence of that open verdict, not a separate drift. Read in units of §3's Burning dps " +
      'so the row stays true if either number moves.',
  },
  {
    cls: 'pyromancer',
    clause: 'Flame Road',
    figure: 'a burning trail 3 s',
    spec: 3,
    path: ['active2', 'groundDurationSeconds'],
    status: { kind: 'match' },
  },
  {
    cls: 'pyromancer',
    clause: 'Kindling (tower passive)',
    figure: 'all towers +10% damage vs Burning enemies',
    spec: 0.1,
    path: ['towerPassive', 'mods', 'towerDamageVsBurning'],
    status: { kind: 'match' },
  },

  /* -------------------------------------------------- §4.2 Necromancer */
  {
    cls: 'necromancer',
    clause: 'Grave Harvest (passive)',
    figure: 'kills leave corpses 6 s',
    spec: 6,
    path: ['passive', 'corpseSeconds'],
    status: { kind: 'match' },
  },
  {
    cls: 'necromancer',
    clause: 'Raise',
    figure: 'cap 8',
    spec: 8,
    path: ['active1', 'summonCap'],
    status: { kind: 'match' },
  },
  {
    cls: 'necromancer',
    clause: 'Raise',
    figure: '15 s',
    spec: 15,
    path: ['active1', 'summonDurationSeconds'],
    status: {
      kind: 'retuned',
      authorised: P6E,
      actual: 24,
      why: 'Part of the Raise package (cooldown 12->6, statMul 0.40->0.65, duration 15->24, radius 6->8).',
    },
  },
  {
    cls: 'necromancer',
    clause: 'Raise',
    figure: '40% of char attack',
    spec: 0.4,
    path: ['active1', 'summonStatMul'],
    status: {
      kind: 'retuned',
      authorised: P6E,
      actual: 0.65,
      why: 'Same Raise package. Still 0/12 on G8 afterwards; kept because the failure mode moved.',
    },
  },
  {
    cls: 'necromancer',
    clause: 'Death Pact',
    figure: '+45% dmg',
    spec: 0.45,
    path: ['active2', 'pactDamageMul'],
    status: { kind: 'match' },
  },
  {
    cls: 'necromancer',
    clause: 'Death Pact',
    figure: '+30% atk spd',
    spec: 0.3,
    path: ['active2', 'pactAtkSpdMul'],
    status: { kind: 'match' },
  },
  {
    cls: 'necromancer',
    clause: 'Death Pact',
    figure: 'tower −2% max HP/s',
    spec: -0.02,
    path: ['active2', 'pactDrainPerSecond'],
    as: (v) => -v,
    status: { kind: 'match' },
    note: "Authored as a positive drain rate; read with §4's stated sign, as every penalty here is.",
  },
  {
    cls: 'necromancer',
    clause: 'Wounded Fury (tower passive)',
    figure: 'all towers +15% damage while below full HP',
    spec: 0.15,
    path: ['towerPassive', 'mods', 'towerLowHpDamageBonus'],
    status: { kind: 'match' },
  },

  /* --------------------------------------------------- §4.2 Cryomancer */
  {
    cls: 'cryomancer',
    clause: 'Frost Touch (passive)',
    figure: 'an enemy hit 5 times while frosted freezes',
    spec: 5,
    path: ['passive', 'freezeHits'],
    status: { kind: 'match' },
  },
  {
    cls: 'cryomancer',
    clause: 'Frost Touch (passive)',
    figure: 'frozen enemies shatter on death (r1.5)',
    quote: 'frozen enemies shatter on death (r1.5, 20 normal',
    spec: 1.5,
    path: ['passive', 'shatterRadius'],
    status: { kind: 'match' },
  },
  {
    cls: 'cryomancer',
    clause: 'Frost Touch (passive)',
    figure: 'shatter for 20 normal',
    quote: 'shatter on death (r1.5, 20 normal ⚖)',
    spec: 20,
    path: ['passive', 'shatterDamage'],
    status: {
      kind: 'retuned',
      authorised: P12A,
      actual: 60,
      why: "§4.2 marks this figure ⚖. p12a's x3 kit re-anchor moved it 20 -> 60 with every other absolute kit-damage magnitude.",
    },
  },
  {
    cls: 'cryomancer',
    clause: 'Glaciate',
    figure: 'r4 nova',
    spec: 4,
    path: ['active1', 'radius'],
    status: { kind: 'match' },
  },
  {
    cls: 'cryomancer',
    clause: 'Ice Wall',
    figure: 'temporary 1x3 wall',
    quote: 'temporary 1×3 wall at mouse',
    spec: 3,
    path: null,
    slot: 'active2',
    status: {
      kind: 'in_code',
      site: 'fireIceWall — the placement loop runs i = -1..1 across the aim direction',
      file: CLASSES_TS,
      anchors: [/for \(let i = -1; i <= 1; i\+\+\) \{\s+const tx = Math\.floor\(cx\) \+ \(vertical \? 0 : i\);/],
      why:
        'The wall\'s length is the loop bounds, not a field. `ice_wall` authors `wallSeconds` ' +
        'and `towerKey` but nothing for its footprint, so a 1x5 wall would be a code edit. The ' +
        'anchor spans into the tile formula so it cannot be satisfied by an unrelated -1..1 loop.',
      in: 'active2',
      absentKey: /length|tile|width|span|footprint|size|cells/i,
    },
  },
  {
    cls: 'cryomancer',
    clause: 'Ice Wall',
    figure: '5 s',
    spec: 5,
    path: ['active2', 'wallSeconds'],
    status: { kind: 'match' },
  },
  {
    cls: 'cryomancer',
    clause: 'Deep Winter (tower passive)',
    figure: 'all towers +10% damage vs frosted/frozen',
    spec: 0.1,
    path: ['towerPassive', 'mods', 'towerDamageVsChilled'],
    status: { kind: 'match' },
  },

  /* -------------------------------------------------- §4.2 Stormcaller */
  {
    cls: 'stormcaller',
    clause: 'Conduction (passive)',
    figure: 'electric damage +20% per jump, compounding',
    spec: 0.2,
    path: ['active1', 'chainGrowth'],
    slot: 'passive',
    status: { kind: 'match' },
    note:
      'The *value* matches. The *row* does not: §4.2 states this on the passive and the number ' +
      'is authored on `active1`, which is c010 — a location question, not a drift question.',
  },
  {
    cls: 'stormcaller',
    clause: 'Conduction (passive)',
    figure: 'cap 8 jumps',
    spec: 8,
    path: ['active1', 'chainCap'],
    slot: 'passive',
    status: { kind: 'match' },
    note: 'Same location question as the growth figure above — c010.',
  },
  {
    cls: 'stormcaller',
    clause: 'Chain Surge',
    figure: 'chain bolt, 6 jumps',
    spec: 6,
    path: ['active1', 'chainCount'],
    status: { kind: 'match' },
  },
  {
    cls: 'stormcaller',
    clause: 'Overload',
    figure: '5 s',
    spec: 5,
    path: ['active2', 'overloadSeconds'],
    status: { kind: 'match' },
  },
  {
    cls: 'stormcaller',
    clause: 'Overload',
    figure: 'electric effects jump +2',
    spec: 2,
    path: ['active2', 'overloadExtraChains'],
    status: { kind: 'match' },
  },
  {
    cls: 'stormcaller',
    clause: 'Overload',
    figure: 'electric-tower wires pulse at double rate',
    spec: 2,
    path: null,
    slot: 'active2',
    status: {
      kind: 'in_code',
      site: 'the VS electric-wire interval — `return interval / 2` under the overload branch',
      file: 'src/sim/vsspecials.ts',
      anchors: [/cls\.active2\.kind === 'overload' && w\.warden\.overloadRemaining > 0\) \{\s+return interval \/ 2;/],
      why:
        "A self-declared rule-4 literal: the site's own comment calls it \"the one clause that is " +
        'not the authored number\" and cites §4.2. Overload authors `overloadSeconds` and ' +
        '`overloadExtraChains` but nothing for the wire rate. Twin of Poison Boost\'s "double".',
      in: 'active2',
      absentKey: /wire|pulse|rate|interval|double/i,
      knownKeys: ['basicAttack.interval'],
    },
  },
  {
    cls: 'stormcaller',
    clause: 'Live Wire (tower passive)',
    figure: 'all towers deal +10% of their damage as extra Electric',
    spec: 0.1,
    path: ['towerPassive', 'mods', 'towerExtraElectricPct'],
    status: { kind: 'match' },
  },

  /* ---------------------------------------------------- §4.2 Bloodlord */
  {
    cls: 'bloodlord',
    clause: 'Blood Frenzy (passive)',
    figure: '3% lifesteal on normal damage',
    spec: 0.03,
    path: ['passive', 'mods', 'leech'],
    status: { kind: 'match' },
    note: "Pinned independently by `tests/fb022-info-surfacing.test.ts`'s b053 string test.",
  },
  {
    cls: 'bloodlord',
    clause: 'Blood Frenzy (passive)',
    figure: '+10% attack in VS waves',
    spec: 0.1,
    path: ['passive', 'frenzyVsMul'],
    status: { kind: 'match' },
  },
  {
    cls: 'bloodlord',
    clause: 'Blood Frenzy (passive)',
    figure: '−5% in TD waves',
    spec: -0.05,
    path: ['passive', 'frenzyTdMul'],
    status: { kind: 'match' },
  },
  {
    cls: 'bloodlord',
    clause: 'Blood Tithe',
    figure: 'tower pays 30% current HP once',
    spec: 0.3,
    path: ['active1', 'titheHpFraction'],
    status: { kind: 'match' },
  },
  {
    cls: 'bloodlord',
    clause: 'Blood Tithe',
    figure: 'permanently +25% dmg',
    spec: 0.25,
    path: ['active1', 'titheDamageMul'],
    status: { kind: 'match' },
  },
  {
    cls: 'bloodlord',
    clause: 'Blood Tithe',
    figure: 'its share of VS attacks lifesteals +1%',
    spec: 0.01,
    path: null,
    slot: 'active1',
    status: {
      kind: 'unimplemented',
      tracked: 'BACKLOG-CONTENT Log, 2026-09-03 session 2 — main lane (needs `vswield.ts` + `statkeys.ts`)',
      why:
        'Only the damage half of the clause exists: `s.tithed` feeds `classTowerDamageMul` ' +
        '(`towers.ts`) and nothing else reads it. `leech` is a single run-wide Warden stat; ' +
        'there is no per-structure VS-share lifesteal concept to author 1% into.',
      in: 'active1',
      absentKey: /leech|lifesteal|siphon|vamp|drain|share/i,
      knownKeys: ['passive.mods.leech'],
      // `s.tithed` is the only handle the clause could hang on, and these are
      // its four readers: the Active that sets it, the damage bonus that is
      // the half which *is* implemented, and the run hash. A fifth line
      // reading `tithed` means the VS-share lifesteal half arrived.
      srcLines: [
        {
          file: 'src/sim',
          needle: '.tithed',
          lines: [
            'const s = nearestStructure(w, aimX ?? wd.x, aimY ?? wd.y, eff.radius, (st) => !st.tithed);',
            's.tithed = true;',
            'h.bool(s.pactActive).num(s.atkSpdBuffRemaining).bool(s.tithed);',
            'if (s.tithed && cls.active1.kind === \'blood_tithe\') {',
          ],
        },
      ],
    },
  },
  {
    cls: 'bloodlord',
    clause: 'Crimson Rush',
    figure: '+2 HP per enemy passed',
    spec: 2,
    path: ['active2', 'healPerEnemy'],
    status: { kind: 'match' },
  },
  {
    cls: 'bloodlord',
    clause: 'Sanguine Pact (tower passive)',
    figure: 'all towers +10% damage',
    spec: 0.1,
    path: ['towerPassive', 'mods', 'towerDamage'],
    status: {
      kind: 'retuned',
      authorised: P10S,
      actual: 0.04,
      why: "Paired with basicAttack.dps 28->17; leech was deliberately left at 0.03. The only §4 figure ever cut to close a G8 band.",
    },
  },
  {
    cls: 'bloodlord',
    clause: 'Sanguine Pact (tower passive)',
    figure: '−10% max HP',
    spec: -0.1,
    path: ['towerPassive', 'mods', 'towerHp'],
    status: { kind: 'match' },
    note: 'The cost half of the pact was left alone while the benefit half was cut — see the row above.',
  },

  /* ------------------------------------------------------ §4.2 Animist */
  {
    cls: 'animist',
    clause: 'Kinship (passive)',
    figure: 'summon cap +1',
    spec: 1,
    path: null,
    slot: 'passive',
    status: {
      kind: 'unimplemented',
      tracked: 'c004 (BACKLOG-CONTENT, blocked out of Scope)',
      why:
        "`data/classes.json`'s Kinship row authors only the aura half (`mods: {}`, no `kind`), " +
        'and the three summon-cap sites in `classes.ts` add only `classLineBonus`.',
      in: 'passive',
      absentKey: /cap|summon|minion|spirit|limit|retinue|kinship/i,
      knownKeys: ['active1.summonCap', 'active1.summonDurationSeconds', 'active1.summonStatMul', 'active1.summonRadius'],
      // The clause could just as easily land in code as in `/data` — QA
      // implemented it as `+ (w.warden.classKey === 'animist' ? 1 : 0)` at
      // the Manifest cap site and this row stayed green. These are the only
      // three places a summon cap is computed; any added term reddens the row.
      srcLines: [
        {
          file: CLASSES_TS,
          needle: 'summonCap',
          lines: [
            '(eff.summonCap ?? 0) + classLineBonus(w),',
            'const cap = Math.max(0, Math.round((eff.summonCap ?? 0) + classLineBonus(w)));',
            '(eff.summonCap ?? 0) + classLineBonus(w),',
          ],
        },
        // Pinning the three cap lines catches a `+1` folded *into* them, but
        // not a new line beside them (`const capK = cap + (isAnimist ? 1 : 0)`).
        // So every mention of the class in the sim is pinned too: today all
        // five are summon-kind strings and not one is a class-key branch, so
        // any Animist special case anywhere in `src/sim` reddens this row.
        {
          file: 'src/sim',
          needle: 'animist',
          lines: [
            "'animist_spirit',",
            "w.classSummons = w.classSummons.filter((s) => s.kind !== 'animist_totem');",
            "kind: 'animist_totem',",
            "if (s.kind === 'animist_totem' && !w.huntsWarden) {",
            "const totem = w.classSummons.find((s) => s.id === e.tauntSourceId && s.kind === 'animist_totem');",
          ],
        },
      ],
    },
  },
  {
    cls: 'animist',
    clause: 'Manifest',
    figure: '30% of its stats at highest upgrade',
    spec: 0.3,
    path: ['active1', 'summonStatMul'],
    status: { kind: 'match' },
  },
  {
    cls: 'animist',
    clause: 'Manifest',
    figure: '20 s',
    spec: 20,
    path: ['active1', 'summonDurationSeconds'],
    status: { kind: 'match' },
  },
  {
    cls: 'animist',
    clause: 'Manifest',
    figure: 'cap 3',
    spec: 3,
    path: ['active1', 'summonCap'],
    status: { kind: 'match' },
  },
  {
    cls: 'animist',
    clause: 'Recall Totem',
    figure: 'character & summons near it +15% atk spd',
    spec: 0.15,
    path: ['active2', 'auraAtkSpdMul'],
    status: { kind: 'match' },
  },
  {
    cls: 'animist',
    clause: 'Wide Grove (tower passive)',
    figure: 'all towers +10% area',
    spec: 0.1,
    path: ['towerPassive', 'mods', 'area'],
    status: { kind: 'match' },
    note:
      'The value matches. The *key* is the global `area` stat for want of a `towerArea` one — a ' +
      'location question, not a drift question, and an owner-approved deviation (QUESTIONS Q120 ' +
      'item 5, flagged for the P10 pass) rather than an open bug. Restated by c009 and sized by ' +
      'c013, whose `tests/class-wide-grove-reach.test.ts` measures all twenty footprints the ' +
      'global key reaches.',
  },

  /* ------------------------------------------------------ §4.2 Paladin */
  {
    cls: 'paladin',
    clause: 'Guardian Stance (passive)',
    figure: '+30 defense',
    spec: 30,
    path: ['passive', 'stanceArmor'],
    status: {
      kind: 'retuned',
      authorised: P6E,
      actual: 50,
      why: 'Part of the Paladin package (stanceArmor 30->50, stanceSeconds 1->0.5, wrathFraction 0.60->0.80, wrathDamageMul 1.50->2.20).',
    },
  },
  {
    cls: 'paladin',
    clause: 'Guardian Stance (passive)',
    figure: 'after standing still 1 s',
    spec: 1,
    path: ['passive', 'stanceSeconds'],
    status: {
      kind: 'retuned',
      authorised: P6E,
      actual: 0.5,
      why: 'Same Paladin package. Halved so the stance is reachable between repositions.',
    },
  },
  {
    cls: 'paladin',
    clause: 'Clarion Taunt',
    figure: 'enemies in r6 target the Paladin',
    spec: 6,
    path: ['active1', 'radius'],
    status: { kind: 'match' },
  },
  {
    cls: 'paladin',
    clause: 'Clarion Taunt',
    figure: '4 s',
    spec: 4,
    path: ['active1', 'tauntDurationSeconds'],
    status: { kind: 'match' },
    note:
      'Matches only because it was put back: p6e raised it to 6 s and `b026` corrected it to ' +
      "spec (commit 432518d). That is the precedent for what this ledger is — the same package's " +
      'other four figures were kept and are the `retuned` rows around this one.',
  },
  {
    cls: 'paladin',
    clause: 'Clarion Taunt',
    figure: '60% of damage taken stores into Wrath',
    spec: 0.6,
    // Authored on the *passive* row even though §4.2 states it on Clarion
    // Taunt — the same shape as Stormcaller's Conduction (c010) with the two
    // rows swapped. The scope was settled in p6e's own review: the fraction
    // applies to Clarion's window only, never to the base passive's "blocked
    // damage charges Wrath", which banks in full.
    path: ['passive', 'wrathFraction'],
    slot: 'active1',
    status: {
      kind: 'retuned',
      authorised: P6E,
      actual: 0.8,
      why: "Same Paladin package. Lives on the passive row; applies only during Clarion's window.",
    },
  },
  {
    cls: 'paladin',
    clause: 'Judgement',
    figure: 'release Wrath as a holy nova (stored x1.5)',
    quote: 'release Wrath as a holy nova (stored ×1.5 as normal damage)',
    spec: 1.5,
    path: ['active2', 'wrathDamageMul'],
    status: {
      kind: 'retuned',
      authorised: P6E,
      actual: 2.2,
      why: 'Same Paladin package. The largest single multiplier change of the seven.',
    },
  },
  {
    cls: 'paladin',
    clause: 'Consecrated Stone (tower passive)',
    figure: 'all towers +10% HP',
    spec: 0.1,
    path: ['towerPassive', 'mods', 'towerHp'],
    status: { kind: 'match' },
  },
  {
    cls: 'paladin',
    clause: 'Consecrated Stone (tower passive)',
    figure: '+5 defense',
    spec: 5,
    path: ['towerPassive', 'mods', 'towerDefenseBonus'],
    status: { kind: 'match' },
  },

  /* ---------------------------------------------------- §4.2 Time Lord */
  {
    cls: 'time_lord',
    clause: 'Time Flow (passive)',
    figure: 'damage taken becomes a 4 s DoT',
    spec: 4,
    path: null,
    slot: 'passive',
    status: {
      kind: 'in_code',
      site: 'TIME_FLOW_BASE_SECONDS',
      file: RUN_TS,
      anchors: [
        /const TIME_FLOW_BASE_SECONDS = 4;/,
        // fb152 reformatted this push across lines when it gained the cadence
        // accumulators; the two figures the ledger points at are unmoved.
        /dps: \(dmg \* speedMul\) \/ TIME_FLOW_BASE_SECONDS,\s*\n\s*remaining: TIME_FLOW_BASE_SECONDS \/ speedMul,/,
      ],
      why:
        'The passive authors `charDotSpeedMul` (the dormant equipment flag) but not the base ' +
        'duration the multiplier applies to, so this §4 figure is a `/src` constant.',
      in: 'passive',
      absentKey: /dot|flow|convert|baseSeconds/i,
      knownKeys: [
        'passive.charDotSpeedMul',
        'active1.markPastDotDps',
        'active1.markPastDotSeconds',
        'active1.markPresentDotDps',
        'active1.markPresentDotSeconds',
        'active1.markFutureDotSeconds',
        'active2.zoneDotSeconds',
      ],
    },
  },
  {
    cls: 'time_lord',
    clause: 'Time Flow (passive)',
    figure: 'the "character DoT 100% faster" flag ships disabled',
    quote: 'a dormant "character DoT 100% faster" flag ships disabled',
    spec: 1,
    path: ['passive', 'charDotSpeedMul'],
    status: { kind: 'match' },
    note:
      '§4.2 states the reserved flag and its shipped state in the same breath. 1 is disabled; ' +
      '2 would be the "100% faster" it is reserved for. Pinned so the dormant half cannot wake ' +
      'up silently ahead of the equipment that is meant to turn it on.',
  },
  {
    cls: 'time_lord',
    clause: 'Time',
    figure: 'r7 four-stage mark',
    spec: 7,
    path: ['active1', 'radius'],
    status: { kind: 'match' },
  },
  {
    cls: 'time_lord',
    clause: 'Time',
    figure: 'four-stage mark per enemy, advanced one stage per cast',
    spec: 4,
    path: null,
    slot: 'active1',
    status: {
      kind: 'in_code',
      site: 'fireTimeMark — the stage machine, `e.timeMarkStage = 0|1|2|3`',
      file: CLASSES_TS,
      anchors: [/const stage = e\.timeMarkStage;/],
      why:
        'The number of stages is the shape of the code, not a field: `time_mark` authors a ' +
        'per-stage effect (rewind seconds, three DoTs, the slow, the elite fraction) but nothing ' +
        'says how many stages there are. Adding a fifth would be a code edit.',
      in: 'active1',
      absentKey: /stage|phase/i,
      // The four assignments *are* the four stages, and the wrap to 0 is the
      // "advanced one stage per cast" cycle closing. Pinned as whole lines so
      // adding or removing a stage reddens the row.
      srcLines: [
        {
          file: CLASSES_TS,
          needle: 'e.timeMarkStage =',
          lines: ['e.timeMarkStage = 1;', 'e.timeMarkStage = 2;', 'e.timeMarkStage = 3;', 'e.timeMarkStage = 0;'],
        },
      ],
    },
  },
  {
    cls: 'time_lord',
    clause: 'Time',
    figure: 'past rewinds to a 3 s-ago position',
    spec: 3,
    path: ['active1', 'markRewindSeconds'],
    status: { kind: 'match' },
  },
  {
    cls: 'time_lord',
    clause: 'Time',
    figure: 'present stun-locks 3 s',
    spec: 3,
    path: null,
    slot: 'active1',
    status: {
      kind: 'elsewhere',
      source: 'data/damagetypes.json — statuses.frozen.duration',
      live: FROZEN.duration,
      why:
        'The sim has no generic stun, so the stage reuses §3 frozen, whose "cannot move" is ' +
        'exactly what a stun-lock reads as (Q139). The figure is authored and correct, just in ' +
        'another `/data` file — the one non-`classes.json` row that is not a finding.',
      in: 'active1',
      absentKey: /stun|freeze|frozen|lockSeconds/i,
    },
  },
  {
    cls: 'time_lord',
    clause: 'Time',
    figure: 'future −20% atk/move speed',
    spec: -0.2,
    path: ['active1', 'markFutureSlowAmount'],
    as: (v) => -v,
    status: { kind: 'match' },
    note: "Authored as a positive magnitude; read with §4's stated sign, as every penalty here is.",
  },
  {
    cls: 'time_lord',
    clause: 'Time',
    figure: 'elites/bosses: −50% current HP instead of execute',
    quote: 'elites/bosses: −50% current HP instead',
    spec: 0.5,
    path: ['active1', 'markEliteExecuteFraction'],
    status: { kind: 'match' },
  },
  {
    cls: 'time_lord',
    clause: 'Time',
    figure: '3 charges',
    spec: 3,
    path: ['active1', 'maxCharges'],
    status: { kind: 'match' },
  },
  {
    cls: 'time_lord',
    clause: 'Time',
    figure: '6 s recharge',
    spec: 6,
    path: ['active1', 'rechargeSeconds'],
    status: { kind: 'match' },
  },
  {
    cls: 'time_lord',
    clause: 'Time Lock',
    figure: '5 s no-exit zone',
    spec: 5,
    path: ['active2', 'groundDurationSeconds'],
    status: { kind: 'match' },
  },
  {
    cls: 'time_lord',
    clause: 'Time Lock',
    figure: 'DoT over 10 s',
    spec: 10,
    path: ['active2', 'zoneDotSeconds'],
    status: { kind: 'match' },
  },
  {
    cls: 'time_lord',
    clause: 'Time Lock',
    figure: '2 charges',
    spec: 2,
    path: ['active2', 'maxCharges'],
    status: { kind: 'match' },
  },
  {
    cls: 'time_lord',
    clause: 'Time Lock',
    figure: '10 s recharge',
    spec: 10,
    path: ['active2', 'rechargeSeconds'],
    status: { kind: 'match' },
  },
  {
    cls: 'time_lord',
    clause: 'Chronal Surge (tower passive)',
    figure: 'every 2 TD waves',
    spec: 2,
    path: ['towerPassive', 'waveInterval'],
    status: { kind: 'match' },
  },
  {
    cls: 'time_lord',
    clause: 'Chronal Surge (tower passive)',
    figure: '+10% range',
    spec: 0.1,
    path: ['towerPassive', 'bonusRangeMul'],
    status: { kind: 'match' },
  },
  {
    cls: 'time_lord',
    clause: 'Chronal Surge (tower passive)',
    figure: '+10% AoE area',
    spec: 0.1,
    path: ['towerPassive', 'bonusAoeMul'],
    status: { kind: 'match' },
  },
];

/* ------------------------------------------------------------- machinery */

/** One row's stable identity, used in messages and in the uniqueness check. */
function id(f: Figure): string {
  return `${f.cls} · ${f.clause} · ${f.figure}`;
}

function walk(root: unknown, path: Path): unknown {
  let cur: unknown = root;
  for (const key of path) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/** The figure's value as §4 states it, read out of an arbitrary classes document. */
function readFrom(doc: RawClassesDoc, f: Figure): number | undefined {
  if (!f.path) return undefined;
  const row = doc.classes.find((c) => c.key === f.cls);
  const raw = walk(row, f.path);
  if (typeof raw !== 'number') return undefined;
  return f.as ? f.as(raw) : raw;
}

/** The figure's value as the *loaded* content carries it — what the sim runs on. */
function readLoaded(f: Figure): number | undefined {
  if (!f.path) return undefined;
  const walked = walk(content.classByKey.get(f.cls), f.path);
  if (typeof walked !== 'number') return undefined;
  // fb153a: `numberScale` divides every authored kit *magnitude* at load. §4
  // states the authored figure and `data/classes.json` still holds it, so the
  // ledger reads the loaded value back through the scale rather than restating
  // §4 in display units — and the bridge test at the foot of this file then
  // proves the scaler applied exactly that factor to exactly these paths.
  const raw = isScaledClassPath(f.path) ? walked / content.modifiers.numberScale : walked;
  return f.as ? f.as(raw) : raw;
}

interface RawClassesDoc {
  classes: { key: string; [k: string]: unknown }[];
}

const RAW = content.raw.classes as RawClassesDoc;

const SOURCES = new Map<string, string>();
function source(file: string): string {
  const cached = SOURCES.get(file);
  if (cached !== undefined) return cached;
  const text = readFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), 'utf8');
  SOURCES.set(file, text);
  return text;
}

const DATA_HOMED = LEDGER.filter((f) => f.path !== null);

/**
 * The slot §4 states the figure on. Defaults to the slot the figure is
 * authored under, which is right for most rows; a row whose spec slot differs
 * from its authored slot — or which has no authored slot at all — must
 * declare it, and the shape check below enforces that for every null path.
 * Archer's Long Draw is why the two cannot be collapsed: §4.2 states it on the
 * *passive* while the field it would be authored in lives on `active1`.
 */
function slotOf(f: Figure): Slot {
  const slot = f.slot ?? (f.path === null ? undefined : (f.path[0] as Slot));
  if (slot === undefined) throw new Error(`${id(f)}: a null-path row must declare the slot §4 states it on`);
  return slot;
}

/**
 * Every key path in an object, dotted and recursive — `mods`' own keys
 * included, values never. Paths rather than bare names so a `knownKeys` entry
 * says *where* the key it excuses lives.
 */
function keyNames(obj: unknown, prefix = '', out: string[] = []): string[] {
  if (obj === null || typeof obj !== 'object') return out;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix === '' ? k : `${prefix}.${k}`;
    out.push(path);
    keyNames(v, path, out);
  }
  return out;
}

/**
 * The real content of a null-path row's "still not authored in `/data`"
 * claim: the slot the figure *would* land on is searched for a key that would
 * mean it had arrived. `expect(readLoaded(f)).toBeUndefined()` cannot do this
 * — it is true by construction for every null path — so each such row
 * declares the key names it is watching for instead.
 */
function absentFrom(f: Figure, st: Absence): string[] {
  // Read the **raw** document, not `loadContent()`'s view. zod's object
  // schemas strip unknown keys, so a newly authored field is invisible in the
  // loaded content until someone also extends the schema — which is exactly
  // the window this check exists to cover. (Measured: authoring
  // `passive.summonCapBonus` and `active1.titheLeech` both left this test
  // green while it read the loaded content, and both redden it now.)
  //
  // All four slots, not only `st.in`: three shipped figures in this ledger are
  // already authored on a different slot than §4 states them on, so guessing
  // one slot is guessing twice. QA authored `animist.active1.summonCapBonus`
  // and `bloodlord.passive.titheLeechPct` and a single-slot search missed both.
  // The whole row, not only the four slots: a class row also carries
  // `basicAttack` and `moveSpeedBonus`, and a figure authored there would
  // otherwise be invisible.
  const row = RAW.classes.find((c) => c.key === f.cls);
  return keyNames(row)
    .filter((k) => st.absentKey.test(k))
    .sort();
}

/**
 * The `/src` lines a null-path row pins, trimmed. `file` may name a directory
 * under `src/`, in which case every `.ts` in it is searched in a stable order.
 */
function pinnedSrcLines(spec: { file: string; needle: string }): string[] {
  const files = spec.file.endsWith('.ts')
    ? [spec.file]
    : readdirSync(fileURLToPath(new URL(`../${spec.file}`, import.meta.url)), { recursive: true })
        .map((n) => String(n).replace(/\\/g, '/'))
        .filter((n) => n.endsWith('.ts'))
        .sort()
        .map((n) => `${spec.file}/${n}`);
  const out: string[] = [];
  for (const file of files) {
    for (const line of source(file).split('\n')) {
      if (line.includes(spec.needle)) out.push(line.trim());
    }
  }
  return out;
}

/** SPEC-FINAL §4 text, and the slice of it that belongs to one class. */
const SPEC_4_TEXT = (() => {
  const spec = readFileSync(fileURLToPath(new URL('../SPEC-FINAL.md', import.meta.url)), 'utf8');
  // From §4's own heading, not from §4.1: QA showed an edit to the framework
  // preamble (bands, the basic-attack rule) fell outside the old slice and so
  // would not have forced the re-read this pin exists to force.
  const start = spec.indexOf('## 4. Characters');
  const end = spec.indexOf('## 5. Towers');
  return spec.slice(start, end).replace(/\r\n/g, '\n');
})();

/** How each class is headed in §4 — a §4.1 bold block or a §4.2 table row. */
const SPEC_4_HEADING: Readonly<Record<string, string>> = {
  swordsman: '**Swordsman**',
  plaguebringer: '**Plaguebringer (Poison)**',
  archer: '| **Archer** |',
  engineer: '| **Engineer** |',
  pyromancer: '| **Pyro** |',
  necromancer: '| **Necromancer** |',
  cryomancer: '| **Cryomancer** |',
  stormcaller: '| **Stormcaller** |',
  bloodlord: '| **Bloodlord** |',
  animist: '| **Animist** |',
  paladin: '| **Paladin** |',
  time_lord: '| **Time Lord** |',
};

/**
 * The §4 text that belongs to one class. A §4.2 row is one table line; a §4.1
 * class is the prose block up to the next bold class heading or §4.2 itself.
 */
function specTextFor(cls: string): string {
  const heading = SPEC_4_HEADING[cls];
  if (heading === undefined) throw new Error(`${cls}: no §4 heading declared`);
  const start = SPEC_4_TEXT.indexOf(heading);
  if (start < 0) throw new Error(`${cls}: §4 heading ${heading} not found`);
  if (heading.startsWith('|')) {
    const nl = SPEC_4_TEXT.indexOf('\n', start);
    return SPEC_4_TEXT.slice(start, nl < 0 ? undefined : nl);
  }
  const rest = SPEC_4_TEXT.slice(start + heading.length);
  const next = ['\n\n**', '\n### 4.2'].map((m) => rest.indexOf(m)).filter((i) => i >= 0);
  return heading + rest.slice(0, next.length > 0 ? Math.min(...next) : undefined);
}

/* ------------------------------------------------- the ledger, row by row */

describe('c008 — SPEC-FINAL §4.1/§4.2: every stated figure, matched or named', () => {
  for (const f of LEDGER) {
    it(`${id(f)} — ${f.status.kind}`, () => {
      const st = f.status;
      switch (st.kind) {
        case 'match': {
          const live = readLoaded(f);
          expect(live, `${id(f)}: no value at classes.json ${f.path?.join('.')}`).toBeTypeOf('number');
          expect(live, `${id(f)}: §4 states ${f.spec}`).toBeCloseTo(f.spec, 10);
          break;
        }
        case 'retuned': {
          const live = readLoaded(f);
          expect(live, `${id(f)}: no value at classes.json ${f.path?.join('.')}`).toBeTypeOf('number');
          // Both halves are pinned. The first says the drift is still real —
          // if a later pass restores the spec figure this row must become a
          // `match`, exactly as `b026` made Clarion's duration one. The second
          // says the drift is still *this* drift: any further move is red
          // until it is re-authorised here by name.
          expect(live, `${id(f)}: recorded as a deviation but now equals §4's ${f.spec} — make it a match`).not.toBeCloseTo(
            f.spec,
            10,
          );
          expect(live, `${id(f)}: authorised at ${st.actual} by ${st.authorised}`).toBeCloseTo(st.actual, 10);
          break;
        }
        case 'elsewhere': {
          expect(st.live, `${id(f)}: ${st.source} no longer reads ${f.spec}`).toBeCloseTo(f.spec, 10);
          expect(
            absentFrom(f, st),
            `${id(f)}: a new classes.json key matches this figure (expected under ${f.cls}.${st.in}) — re-file this row`,
          ).toEqual([...(st.knownKeys ?? [])].sort());
          break;
        }
        case 'in_code':
        case 'defect': {
          for (const anchor of st.anchors) {
            expect(
              source(st.file),
              `${id(f)}: the ledger's pointer into ${st.file} (${st.site}) is stale — re-locate the figure and update this row`,
            ).toMatch(anchor);
          }
          expect(
            absentFrom(f, st),
            `${id(f)}: a new classes.json key matches this figure (expected under ${f.cls}.${st.in}) — re-file the row as a match and drop the rule-4 debt`,
          ).toEqual([...(st.knownKeys ?? [])].sort());
          for (const pin of st.srcLines ?? []) {
            expect(
              pinnedSrcLines(pin),
              `${id(f)}: the '${pin.needle}' lines in ${pin.file} moved — the figure may have changed`,
            ).toEqual(pin.lines);
          }
          break;
        }
        case 'unimplemented': {
          // This is the whole row. `readLoaded` is `undefined` by
          // construction for a null path, so the only thing that can make
          // this row fail — the day the clause is finally authored — is the
          // key search.
          expect(
            absentFrom(f, st),
            `${id(f)}: a new classes.json key matches this figure (expected under ${f.cls}.${st.in}) — re-file this row as a match`,
          ).toEqual([...(st.knownKeys ?? [])].sort());
          // ...and the `/src` half. A clause can be implemented in code just
          // as easily as in data — eight figures in this ledger already are —
          // so without this the row would keep asserting "unimplemented" after
          // the clause had shipped.
          expect(
            st.srcLines?.length ?? 0,
            `${id(f)}: an unimplemented row must pin the /src lines it is watching`,
          ).toBeGreaterThan(0);
          for (const pin of st.srcLines!) {
            expect(
              pinnedSrcLines(pin),
              `${id(f)}: the '${pin.needle}' lines in ${pin.file} changed — the clause may have been implemented in code`,
            ).toEqual(pin.lines);
          }
          break;
        }
      }
    });
  }
});

/* ------------------------------------------------------ the ledger itself */

describe('c008 — the ledger holds itself to c008’s own rule', () => {
  it('every figure resolves to a match or carries a named authorisation', () => {
    const unaccounted: string[] = [];
    for (const f of LEDGER) {
      const st = f.status;
      const named =
        st.kind === 'match'
          ? true
          : st.kind === 'retuned'
            ? st.authorised.trim().length > 0
            : st.kind === 'unimplemented' || st.kind === 'defect'
              ? st.tracked.trim().length > 0
              : st.kind === 'elsewhere'
                ? st.source.trim().length > 0
                : st.site.trim().length > 0 && st.file.trim().length > 0;
      if (!named) unaccounted.push(id(f));
    }
    expect(unaccounted, 'a figure with neither a match nor a named authorisation').toEqual([]);
  });

  it('every row has a unique identity', () => {
    // The mutation check below catches duplicate *paths* incidentally, but two
    // identical null-path rows would slip past it, and `id()` is what every
    // failure message names.
    const ids = LEDGER.map(id);
    expect(ids.length - new Set(ids).size, 'two ledger rows share an identity').toBe(0);
  });

  it('every row states a real figure and a real place to look', () => {
    for (const f of LEDGER) {
      expect(Number.isFinite(f.spec), `${id(f)}: spec figure must be a number`).toBe(true);
      expect(f.cls.length, `${id(f)}: no class key`).toBeGreaterThan(0);
      expect(f.clause.length, `${id(f)}: no clause`).toBeGreaterThan(0);
      expect(f.figure.length, `${id(f)}: no figure`).toBeGreaterThan(0);
      // A `null` path is a finding in its own right, and only the four
      // statuses that mean "not in classes.json" may claim one.
      if (f.path === null) {
        expect(['elsewhere', 'in_code', 'unimplemented', 'defect'], id(f)).toContain(f.status.kind);
        expect(f.slot, `${id(f)}: a null-path row must declare the slot §4 states it on`).toBeDefined();
      } else {
        expect(['match', 'retuned'], id(f)).toContain(f.status.kind);
        expect(f.path.length, `${id(f)}: empty path`).toBeGreaterThan(0);
      }
    }
  });

  it('covers all twelve classes, and only classes that exist', () => {
    const shipped = new Set(RAW.classes.map((c) => c.key));
    expect(shipped.size).toBe(12);
    const covered = new Set(LEDGER.map((f) => f.cls));
    expect([...shipped].filter((k) => !covered.has(k)), 'class with no §4 figure in the ledger').toEqual([]);
    expect([...covered].filter((k) => !shipped.has(k)), 'ledger row for a class that does not exist').toEqual([]);
  });

  it('every one of the 12x4 class slots holds a figure or a declared reason it has none', () => {
    // "At least one row per class" is too weak to catch a missed figure: the
    // Swordsman's Thousand Cuts row was in fact missing while three other
    // Swordsman rows kept that check green. Coverage is per *slot*, and a slot
    // with no figure has to say so out loud in NO_FIGURE.
    const held = new Set(LEDGER.map((f) => `${f.cls}.${slotOf(f)}`));
    const excused = new Set(NO_FIGURE.map((n) => `${n.cls}.${n.slot}`));
    const unaccounted: string[] = [];
    for (const c of RAW.classes) {
      for (const slot of SLOTS) {
        const key = `${c.key}.${slot}`;
        if (!held.has(key) && !excused.has(key)) unaccounted.push(key);
      }
    }
    expect(unaccounted, 'class slot with neither a §4 figure nor a NO_FIGURE entry').toEqual([]);
    // And an excuse may not sit on a slot that does have a figure, which would
    // let a real figure be quietly written off.
    expect(
      [...excused].filter((k) => held.has(k)),
      'NO_FIGURE entry for a slot that does carry a figure',
    ).toEqual([]);
    for (const n of NO_FIGURE) {
      expect(n.why.trim().length, `${n.cls}.${n.slot}: no reason given`).toBeGreaterThan(20);
    }
  });

  it('every figure quotes §4 verbatim, in the section belonging to its own class', () => {
    // QA broke the header's anti-laundering claim: a real drift plus a
    // one-token edit to `spec` was fully green, because nothing tied the
    // `spec` column to the text the hash pins. This is the tie. To launder a
    // drift you would now also have to quote a sentence §4 does not contain,
    // in the row of the class it does not describe.
    const missing: string[] = [];
    for (const f of LEDGER) {
      const quote = f.quote ?? f.figure;
      if (!specTextFor(f.cls).includes(quote)) missing.push(`${id(f)} — not in §4: "${quote}"`);
    }
    expect(missing, 'figure text that SPEC-FINAL §4 does not contain for that class').toEqual([]);
  });

  it("SPEC-FINAL §4's own text is the version this ledger was read from", () => {
    // Every `in_code` row anchors into `/src` so a stale pointer goes red, but
    // the `spec` column had nothing holding it to its source — and §17 keeps
    // the nine filled classes open to owner veto. Pinning §4's text means a
    // spec edit forces a ledger re-read instead of leaving 89 rows silently
    // asserting a superseded figure. It also closes the obvious way to launder
    // a drift: editing `spec` instead of adding a status.
    expect(SPEC_4_TEXT.startsWith('## 4. Characters'), 'the §4 slice does not start at §4').toBe(true);
    expect(SPEC_4_TEXT, 'the §4 slice does not reach §4.2').toContain('### 4.2 Remaining classes');
    expect(
      createHash('sha256').update(SPEC_4_TEXT, 'utf8').digest('hex'),
      'SPEC-FINAL §4 changed — re-read it against this ledger, then update this hash',
    ).toBe(SPEC_4_SHA256);
  });

  it('the loaded content and data/classes.json agree at every ledger path', () => {
    // Rows are read out of `loadContent()` — what the sim runs on — while the
    // liveness check below mutates the raw document. This is the bridge that
    // makes the second a statement about the first.
    for (const f of DATA_HOMED) {
      expect(readLoaded(f), `${id(f)}: loader and raw document disagree`).toBeCloseTo(readFrom(RAW, f)!, 10);
    }
  });

  it('each data-homed figure reads its own field, and no other row reads it too', () => {
    // Without this the ledger could assert nothing at all: a typo'd path reads
    // `undefined`, and two rows sharing one field would mean deleting that
    // field reddens only one of them. Mutating one field must move exactly one
    // reading.
    for (const target of DATA_HOMED) {
      const doc = JSON.parse(JSON.stringify(RAW)) as RawClassesDoc;
      const row = doc.classes.find((c) => c.key === target.cls);
      expect(row, `${id(target)}: no such class row`).toBeDefined();
      const parent = walk(row, target.path!.slice(0, -1)) as Record<string, unknown> | undefined;
      const leaf = target.path![target.path!.length - 1];
      expect(parent, `${id(target)}: path ${target.path!.join('.')} has no parent object`).toBeTypeOf('object');
      expect(typeof parent![leaf], `${id(target)}: nothing authored at ${target.path!.join('.')}`).toBe('number');

      const before = parent![leaf] as number;
      parent![leaf] = before + 1;

      const moved = DATA_HOMED.filter((f) => {
        const now = readFrom(doc, f);
        const was = readFrom(RAW, f);
        return now === undefined || was === undefined ? now !== was : Math.abs(now - was) > 1e-12;
      });
      expect(moved.map(id), `mutating ${target.cls}.${target.path!.join('.')} moved the wrong set of rows`).toEqual([
        id(target),
      ]);
    }
  });

  it('census: 67 match · 10 retuned · 1 elsewhere · 8 in code · 2 unimplemented · 1 defect', () => {
    // The census is the barrier c008 exists to put up: a new drift cannot be
    // absorbed into an existing status, and closing one (c004, the fb062
    // cadence, any of the eight rule-4 literals moving into `/data`) has to be
    // recorded here rather than passing unnoticed.
    const census: Record<Status['kind'], number> = {
      match: 0,
      retuned: 0,
      elsewhere: 0,
      in_code: 0,
      unimplemented: 0,
      defect: 0,
    };
    for (const f of LEDGER) census[f.status.kind] += 1;
    expect(census).toEqual({
      // p12a moved three ⚖-marked figures match -> retuned (pyromancer
      // flameDps/burnDps, cryomancer shatterDamage).
      match: 67,
      retuned: 10,
      elsewhere: 1,
      in_code: 8,
      unimplemented: 2,
      defect: 1,
    });
    expect(LEDGER).toHaveLength(89);
  });

  it('every authorised deviation names a backlog item or Q-number that can be looked up', () => {
    // c008's wording is "the item/Q-number that authorised it". A prose
    // rationale with no id is exactly the state this file replaces.
    for (const f of LEDGER) {
      if (f.status.kind !== 'retuned') continue;
      expect(f.status.authorised, `${id(f)}: authorisation names no item/Q id`).toMatch(/\b(p\d+[a-z]|c\d{3}|Q\d+|fb\d+)\b/);
      expect(f.status.why.trim().length, `${id(f)}: authorisation carries no reason`).toBeGreaterThan(0);
    }
  });
});

/* ------------------------------------------------------------ two riders */

describe('c008 — the two figures §4 states in another section’s units', () => {
  it("Immolation Wave's burn duration is §3 Burning's own 3 s", () => {
    // The stack-count half is a ledger row; this is the other half of the same
    // authored pair, kept out of the ledger so no two rows share a field.
    const eff = content.classByKey.get('pyromancer')!.active1;
    expect(BURNING, 'no §3 Burning damage type').toBeDefined();
    expect(eff.burnDuration).toBeCloseTo(BURNING!.duration!, 10);
    expect(BURNING!.duration).toBe(3);
  });

  it("§3 Burning's per-application dps is the unit the 3-Burning row is read in", () => {
    // If this moves, the ledger's Immolation row silently changes meaning —
    // so the unit itself is pinned rather than assumed.
    expect(BURNING!.dps).toBeCloseTo(scaled(1), 12);
    expect(BURNING_AUTHORED_DPS).toBe(1);
  });
});
