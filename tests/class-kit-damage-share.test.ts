/**
 * c002 (BACKLOG-CONTENT, lane `content`) — §14 gate **G8**'s *diversity*
 * clause: "top damage source differs across >=9 of 12 classes."
 *
 * The gate itself lives in `tests/p6e-class-diversity.test.ts` (main lane,
 * ~1 h, excluded from the fast tier). This file is the lane-owned
 * *measurement* the tuning half needs: it reproduces p6e's exact metric —
 * same scripted kit bot (`runScripted`, T1, `cycles: 6`, full Constellation
 * tree), same `MATERIALITY_SHARE` gate on a class's own-kit damage share,
 * same `describeSource` labelling — so a `data/classes.json` edit can be
 * scored against the real clause without touching the main-lane gate file.
 *
 * **Cost, and why it is opt-in.** One class-seed is a full T1 run
 * (18 TD waves + 6 VS waves + boss). Twelve classes x twelve seeds is the
 * ~1 h job b027 measured, far past the fast tier's ~60 s budget, and
 * `vitest.fast.config.ts`'s exclude list is outside this lane's Scope. So
 * the sweep runs only under `KIT_SHARE_MEASURE=1`; the fast tier sees only
 * the cheap invariant tests at the bottom, which cost nothing and still
 * pin the two data properties the tune must not break.
 *
 *   KIT_SHARE_MEASURE=1 npx vitest run tests/class-kit-damage-share.test.ts
 *   KIT_SHARE_MEASURE=1 KIT_SHARE_CLASSES=swordsman KIT_SHARE_SEEDS=2 npx vitest run ...
 *
 * -- RECORDED (2026-09-03, session 2, `KIT_SHARE_MEASURE=1`, 12 classes x
 * seeds 1-12 = 144 full T1 runs, 36 min wall clock, against commit `80538e9`
 * = c001) --
 *
 *   swordsman      win 12/12  ownShare 0.07%  top: ballista  (kit top: Dash Slash)
 *   plaguebringer  win 12/12  ownShare 6.40%  top: ballista  (kit top: spreading_plague)
 *   engineer       win 12/12  ownShare 0.06%  top: ballista  (kit top: Pop Turret)
 *   pyromancer     win 12/12  ownShare 0.08%  top: ballista  (kit top: Immolation Wave)
 *   archer         win 12/12  ownShare 0.07%  top: ballista  (kit top: Deadeye Draw)
 *   necromancer    win 12/12  ownShare 0.19%  top: ballista  (kit top: Raise)
 *   cryomancer     win 12/12  ownShare 0.02%  top: ballista  (kit top: Glaciate)
 *   stormcaller    win 12/12  ownShare 0.78%  top: ballista  (kit top: Chain Surge)
 *   bloodlord      win 12/12  ownShare 0.00%  top: ballista  (kit top: Bloodlord basic attack)
 *   animist        win 11/12  ownShare 0.02%  top: ballista  (kit top: Manifest)
 *   paladin        win 12/12  ownShare 0.00%  top: ballista  (kit top: Paladin basic attack)
 *   time_lord      win 12/12  ownShare 2.45%  top: mortar    (kit top: Time Lock)
 *
 *   distinct top sources: **2/12** -> [ballista, mortar]
 *
 * This is the **control half** of c002's required control-run pair. Three
 * things in it are worth stating rather than leaving for the next reader to
 * rediscover:
 *
 * 1. **The gate reading is unmoved but the second key is not the one
 *    STATUS.md names.** STATUS.md records the pair as
 *    `ballista`/`spreading_plague`; this run gives `ballista`/`mortar`.
 *    Plaguebringer's kit *is* still its own top source (`spreading_plague`,
 *    kit top), but at 6.40% own-kit share it is under `MATERIALITY_SHARE`
 *    (20%, Q121), so the metric falls through to the tower key. The count —
 *    the thing G8 actually asserts — is 2/12 either way.
 *
 * 2. **c002's acceptance clause "no class leaves the 35-70% band it is
 *    already in" is false on its face: no class is in that band.** Win rate
 *    is 12/12 for eleven classes and 11/12 for the Animist — the same
 *    over-ceiling G8 failure STATUS.md describes, not an under-floor one. A
 *    tune written to "keep" a band nothing occupies would be measuring
 *    against a premise that does not hold. Flagged for whoever picks the item
 *    up after the Q161 verdict.
 *
 * 3. **The distance is much larger than "raise kit damage share" suggests.**
 *    The best class puts 6.40% of its damage through its own kit and eight of
 *    the twelve are under 0.2%. Clearing the 20% materiality bar for >=9 of 12
 *    classes is a 3x-100x move per class, from `data/classes.json` alone,
 *    without moving a win rate that is already over G8's ceiling. That is the
 *    shape of the wall Q160/Q161 describe, now measured on the diversity axis
 *    rather than argued.
 *
 * -- RECORDED (2026-09-05, BACKLOG p12a, `KIT_SHARE_MEASURE=1 KIT_SHARE_SEEDS=2`,
 * 12 classes x seeds 1-2, T1, `cycles: 6`, full tree) --
 *
 * p12a's target is the **VS-only** share (see `Row.vsShare` and BALANCE.md's
 * "Kit relevance target"), which is a different, much more favourable
 * denominator than the whole-run `ownShare` recorded above: in VS the towers
 * are inert and the character wields them, so every source in the window is
 * the character's own output. Control = `kitPower` live, no re-anchor.
 * Treatment = the same, plus p12a's x3 base re-anchor of `data/classes.json`.
 *
 *                  vsKitShare        vsKitShare
 *                  (control)         (x3 re-anchor)
 *   swordsman        0.12%             0.33%
 *   plaguebringer    1.63%             1.49%
 *   engineer         0.21%             0.21%
 *   pyromancer       0.03%             0.09%
 *   archer           0.06%             0.20%
 *   necromancer      0.19%             0.57%
 *   cryomancer       0.01%             0.09%
 *   stormcaller      1.02%             2.78%
 *   bloodlord        0.00%             0.00%
 *   animist          0.04%             0.04%
 *   paladin          0.00%             0.00%
 *   time_lord        1.67%             5.16%
 *
 * Win rate was 2/2 for every class in both runs (the same over-ceiling G8
 * reading point 2 above describes), so the re-anchor's effect is measured
 * against an unchanged outcome column, not confounded by one.
 *
 * (`plaguebringer`'s row survived a round trip worth recording. Code review
 * asked for the VS numerator to be classified by an explicit kit list rather
 * than by "not a tower key"; building that list surfaced `spreading_plague`
 * — the Plaguebringer's §4.2 passive and its top kit source — sitting outside
 * `kitPower`, because it dispatches from `killEnemy` under its own name
 * rather than the `class_` prefix. Folding it in took this cell to 5.28%.
 * qa-playtester then showed that was wrong: the plague transfer's magnitude
 * is `dotOutstanding`, the sum of *every* unfinished DoT on the corpse
 * whoever applied it, so scaling it by `kitPower` multiplies Venom Spore and
 * Ember Brazier damage on exactly the build this class's own `towerPassive`
 * exists to support. Attribution and scaling are now two predicates
 * (`isKitSource` / `scalesWithKitPower`), the cell is back to 1.49%, and the
 * bug has a regression test. `swordsman` 0.33% and `time_lord` 5.16%
 * re-measured unchanged to the digit throughout — the control showing the
 * classifier change moved only the class it should have, and that the
 * non-kit VS sources the old rule swept in (`warden_eater`, plus the Core
 * effects a damaging Core would add) are below this table's precision.)
 *
 * **0 of 12 classes reach the 35% target; the best is `time_lord` at 5.16%.**
 * The re-anchor is doing real work where it applies — `time_lord` x3.1,
 * `stormcaller` x2.7, `necromancer` x3.0, `archer` x3.3, `cryomancer` x9 off
 * a 0.01% base — but four classes did not move at all, and for a reason
 * worth naming: `bloodlord` and `paladin` route their kit damage through
 * `titheDamageMul`/`wrathDamageMul`, and `engineer`/`animist` through
 * `summonStatMul`. Those are multipliers on damage that is *not* the kit's
 * own authored number (a tower's, or the character's stats), so p12a's field
 * set deliberately excludes them — re-anchoring a multiplier would either
 * compound the pass or leak it into tower damage.
 *
 * **The target cannot be met by this item's own levers.** p12a's two
 * mechanisms multiply kit damage by at most ~9.5x at wave 18 (x3.16
 * `kitPower` x the x3 anchor), and that is already in the treatment column.
 * Reaching 35% from a 5.16% best case needs another ~10x, and from the eight
 * classes under 0.6% another 100x-and-up. The reason is not the kit's
 * numbers: VS-wielded weapon damage inherits the full tower-upgrade +
 * Constellation scaling stack while the kit inherits none of it (swordsman
 * seed 1: 134.3M of 134.5M VS damage is wielded), so the denominator grows
 * with the player's build and the numerator does not. Closing the target
 * needs the wielded side brought down, or the kit put on the same scaling —
 * a shared-lever change of p12b/p12c's size, not a `data/classes.json` edit.
 * Logged as QUESTIONS Q175 and filed as BACKLOG p12f rather than forced
 * here, per the item's own "log the real per-class numbers, don't force it".
 */
import { beforeAll, describe, expect, it } from 'vitest';

import '../src/bots';
import { loadContent, type ClassDef } from '../src/sim/content';
import { isKitSource } from '../src/sim/enemies';
import { allTreeNodeIds } from '../src/meta/meta';
import type { RunConfig, RunReport } from '../src/sim/types';
import { cfg, runScripted } from './helpers';

const content = loadContent();
const FULL_TREE = allTreeNodeIds(content);

/** p6e's own bar, reproduced: a class's kit must clear this share of its total damage before its kit gets to name the "top source" label at all (Q121). */
const MATERIALITY_SHARE = 0.2;

const MEASURE = process.env.KIT_SHARE_MEASURE === '1';
const SEED_COUNT = Number(process.env.KIT_SHARE_SEEDS ?? 12);
const SEEDS = Array.from({ length: SEED_COUNT }, (_, i) => i + 1);
const CLASS_KEYS = (process.env.KIT_SHARE_CLASSES ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter((s) => s.length > 0);
const KEYS = CLASS_KEYS.length > 0 ? CLASS_KEYS : content.classes.classes.map((c) => c.key);

const SUMMON_KINDS = new Set(['summon_turret', 'raise_skeletons', 'manifest_spirit']);

/** p6e's `describeSource`, reproduced verbatim so both files score the same run identically. */
function describeSource(cls: ClassDef, key: string): string {
  switch (key) {
    case 'class_active':
      return cls.active1.name;
    case 'class_active2':
      return cls.active2.name;
    case 'class_passive':
      return cls.passive.name;
    case 'class_basic':
      return `${cls.name} basic attack`;
    case 'class_summon':
      if (SUMMON_KINDS.has(cls.active2.kind)) return cls.active2.name;
      if (SUMMON_KINDS.has(cls.active1.kind)) return cls.active1.name;
      return `${cls.name} summon`;
    default:
      return key;
  }
}

function sumValues(rec: Record<string, number>): number {
  let total = 0;
  for (const v of Object.values(rec)) total += v;
  return total;
}

function argmaxKey(rec: Record<string, number>): string {
  let bestKey = '';
  let bestVal = -1;
  for (const [k, v] of Object.entries(rec)) {
    if (v > bestVal) {
      bestVal = v;
      bestKey = k;
    }
  }
  return bestKey;
}

interface Row {
  key: string;
  wins: number;
  ownShare: number;
  /**
   * p12a: the same ratio restricted to the VS half of the run
   * (`RunReport.damageByWeaponVs`) — BALANCE.md's own-kit-share target.
   * `ownShare` above is the whole-run number G8's diversity clause reads,
   * which is dominated by TD tower fire; this one is a statement about the
   * kit, because in VS every source is the character's own output (the kit,
   * plus the towers it wields — `src/sim/vswield.ts`).
   */
  vsShare: number;
  topLabel: string;
  ownTop: string;
  outcomes: string[];
}

/** BALANCE.md's p12a target: own-kit share of the character's VS damage. */
const KIT_SHARE_TARGET = 0.35;

/**
 * Runs below this `wavesCleared` are excluded from the VS-share record.
 *
 * Note what this is and is not: it selects **which runs count**, not which
 * part of a run counts. `vsShare` sums `damageByWeaponVs` over the whole run,
 * VS block 1 included, where `kitPower` is still near 1.0 — so the figure is
 * "VS kit share across a run that got at least this far", and it is diluted
 * relative to a hypothetical from-wave-12-onward window. Isolating that
 * window would need a snapshot accumulator in the sim keyed on a wave number,
 * i.e. a tuning constant in code (architecture rule 4); it is not worth that
 * for a metric currently reading 0.00-5.16% against a 35% target, but the
 * label is stated precisely here so the next reader is not misled
 * (code-reviewer, p12a).
 */
const QUALIFYING_WAVE = 12;

const rows: Row[] = [];

function runClassScripted(classKey: string, seed: number): RunReport {
  const config: RunConfig = cfg({
    seed,
    classKey,
    tier: 1,
    modifiers: [],
    allocated: FULL_TREE,
    cycles: 6,
    policy: 'hybrid',
  });
  return runScripted(config, 'hybrid', 60 * 60 * 120).report;
}

beforeAll(() => {
  if (!MEASURE) return;
  for (const key of KEYS) {
    const cls = content.classByKey.get(key);
    if (!cls) throw new Error(`${key}: expected a §4 class`);
    let wins = 0;
    const outcomes: string[] = [];
    const ownDamage: Record<string, number> = {};
    const allDamage: Record<string, number> = {};
    const ownVs: Record<string, number> = {};
    const allVs: Record<string, number> = {};
    for (const seed of SEEDS) {
      const report = runClassScripted(key, seed);
      if (report.outcome === 'victory') wins++;
      outcomes.push(
        `${seed}:${report.outcome === 'running' ? 'timeout' : report.outcome}/w${report.wavesCleared}`,
      );
      // p6e's rule: a tick-cap timeout covers an incomparable window, so it
      // contributes to neither damage record.
      if (report.outcome === 'running') continue;
      for (const [k, v] of Object.entries(report.damageByWeapon)) {
        allDamage[k] = (allDamage[k] ?? 0) + v;
        if (!content.towerByKey.has(k)) ownDamage[k] = (ownDamage[k] ?? 0) + v;
      }
      // p12a: the VS-only half. A run that never reached the qualifying wave
      // can't speak to a target stated about a developed run, so it
      // contributes to neither record — the same non-participation the
      // timeout rule above already applies.
      if (report.wavesCleared < QUALIFYING_WAVE) continue;
      for (const [k, v] of Object.entries(report.damageByWeaponVs)) {
        allVs[k] = (allVs[k] ?? 0) + v;
        // Classified by the sim's own kit-source list, not by "not a tower
        // key": the VS window also carries Core effects (`carnivorous_plant`,
        // `corpse`, `time`) and the boss's own `warden_eater` damage, none of
        // which is the character's kit, and all of which a not-a-tower rule
        // would silently bank into the numerator (code-reviewer, p12a).
        if (isKitSource(k)) ownVs[k] = (ownVs[k] ?? 0) + v;
      }
    }
    const ownShare = sumValues(allDamage) > 0 ? sumValues(ownDamage) / sumValues(allDamage) : 0;
    const vsShare = sumValues(allVs) > 0 ? sumValues(ownVs) / sumValues(allVs) : 0;
    rows.push({
      key,
      wins,
      ownShare,
      vsShare,
      ownTop: describeSource(cls, argmaxKey(ownDamage)),
      topLabel: ownShare >= MATERIALITY_SHARE ? describeSource(cls, argmaxKey(ownDamage)) : argmaxKey(allDamage),
      outcomes,
    });
  }
  const distinct = new Set(rows.map((r) => r.topLabel));
  const lines = rows.map(
    (r) =>
      `  ${r.key.padEnd(14)} win ${String(r.wins).padStart(2)}/${SEEDS.length}` +
      `  ownShare ${(r.ownShare * 100).toFixed(2).padStart(6)}%` +
      `  vsKitShare ${(r.vsShare * 100).toFixed(2).padStart(6)}%  top: ${r.topLabel}` +
      `  (kit top: ${r.ownTop})`,
  );
  const meeting = rows.filter((r) => r.vsShare >= KIT_SHARE_TARGET).length;
  console.log(
    `\n[c002/p12a] kit damage share, ${KEYS.length} classes x ${SEEDS.length} seeds\n` +
      `${lines.join('\n')}\n  distinct top sources: ${distinct.size}/${rows.length}` +
      ` -> [${[...distinct].join(', ')}]\n` +
      `  classes at/over the ${(KIT_SHARE_TARGET * 100).toFixed(0)}% VS kit-share target:` +
      ` ${meeting}/${rows.length}\n`,
  );
}, 6_000_000);

describe.skipIf(!MEASURE)('c002: kit damage share measurement (opt-in)', () => {
  it('records every class row', () => {
    expect(rows).toHaveLength(KEYS.length);
    for (const r of rows) expect(r.ownShare).toBeGreaterThanOrEqual(0);
    for (const r of rows) expect(r.vsShare).toBeGreaterThanOrEqual(0);
  });
});

describe('c002: invariants the tune must not break (fast tier)', () => {
  it('every class Active still authors a payable damage number', () => {
    for (const cls of content.classes.classes) {
      for (const eff of [cls.active1, cls.active2]) {
        expect(Number.isFinite(eff.damage)).toBe(true);
        expect(eff.damage).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('no class has both Actives authored at zero damage and no damaging passive', () => {
    for (const cls of content.classes.classes) {
      const dealsDamage =
        cls.active1.damage > 0 ||
        cls.active2.damage > 0 ||
        cls.basicAttack.dps > 0 ||
        cls.passive.kind !== undefined;
      expect(dealsDamage, `${cls.key} has no damage source at all`).toBe(true);
    }
  });
});
