/**
 * fb164 — player-facing prose quotes what the sim runs on, not the pre
 * -`numberScale` authored figure.
 *
 * fb153a divided every HP/damage magnitude in `/data/*.json` by
 * `content.modifiers.numberScale` (0.1) at load time, but the authored
 * *sentences* quoting those magnitudes were left alone — so e.g.
 * `data/vsupgrades.json`'s `vitality` boon still said "+15 Max HP" while its
 * `perRank` loaded as 1.5. `tests/class-descriptions.test.ts` (c015) already
 * carries this exact invariant for `data/classes.json`'s passive/towerPassive
 * descriptions; this is the same census extended to every other `/data` file
 * with a magnitude-quoting `desc`/`unlockCondition` string that `numberScale`
 * actually touches — audited by hand against `applyNumberScale`'s scaled
 * -field lists (`src/sim/content.ts`), the same way c015's `LEDGER` is a
 * curated ledger rather than a generic string scanner.
 *
 * Each fixed sentence stays a plain literal (not a live-derived placeholder):
 * with only one or two affected strings per file, hand-anchoring the sentence
 * to the field is the same shape this codebase already uses for `classes.json`
 * (a designer moves both together, per the Pyromancer `flameDps` precedent),
 * and this file is the safety net that turns a future un-paired retune red
 * instead of silently stale again.
 */

import { describe, expect, it } from 'vitest';

import { loadContent } from '../src/sim/content';

const content = loadContent();

/** Every decimal number in `text`, in order of appearance, sign included. */
function numbersIn(text: string): number[] {
  return [...text.matchAll(/-?\d[\d,]*(?:\.\d+)?/g)].map((m) => Number.parseFloat(m[0].replace(/,/g, '')));
}

describe('fb164 — non-class /data desc strings quote the loaded, not the authored, magnitude', () => {
  it('vsupgrades.json: vitality boon quotes the scaled maxHp perRank', () => {
    const b = content.boons.statBoons.find((x) => x.key === 'vitality')!;
    expect(b.perRank).toBeCloseTo(1.5, 9);
    expect(numbersIn(b.desc)).toEqual([1.5]);
  });

  it('damagetypes.json: Bleeding quotes the scaled dps, not the flat duration', () => {
    const t = content.damageTypes.types.find((x) => x.key === 'bleeding')!;
    expect(t.dps).toBeCloseTo(0.1, 9);
    // "Each application deals {dps} damage per second for {duration} seconds."
    // — the duration (5) is not a numberScale-scaled field and stays as-is.
    expect(numbersIn(t.desc!)).toEqual([0.1, 5]);
  });

  it('damagetypes.json: Burning quotes the scaled dps and the unscaled armor-shred rate side by side', () => {
    const t = content.damageTypes.types.find((x) => x.key === 'burning')!;
    expect(t.dps).toBeCloseTo(0.1, 9);
    expect(t.armorShredPerSecond).toBe(1); // not a numberScale field — armor is untouched
    expect(numbersIn(t.desc!)).toEqual([0.1, 1, 3]);
  });

  it('tree.json: the Core-HP node quotes the scaled coreHp', () => {
    const n = content.tree.nodes.find((x) => x.desc === 'Core +15 HP')!;
    expect(n).toBeDefined();
    expect((n.stats as Record<string, number>).coreHp).toBeCloseTo(15, 9);
    expect(numbersIn(n.desc!)).toEqual([15]);
  });

  it('tree.json: the maxHp+hpRegen node quotes both scaled stats', () => {
    const n = content.tree.nodes.find((x) => x.desc?.startsWith('+4 Max HP'))!;
    expect(n).toBeDefined();
    const stats = n.stats as Record<string, number>;
    expect(stats.maxHp).toBeCloseTo(4, 9);
    expect(stats.hpRegen).toBeCloseTo(0.2, 9);
    expect(numbersIn(n.desc!)).toEqual([4, 0.2]);
  });

  it('cores.json: Stone Heart\'s upgrade desc quotes the scaled coreHpBonus', () => {
    const c = content.cores.cores.find((x) => x.key === 'stone_heart')!;
    const step = c.upgrade.steps[0] as Record<string, number>;
    expect(step.coreHpBonus).toBeCloseTo(10, 9);
    expect(numbersIn(c.upgrade.desc!)).toEqual([10]);
  });

  it('cores.json: Vampire Heart\'s upgrade desc quotes both scaled overheal ratios', () => {
    const c = content.cores.cores.find((x) => x.key === 'vampire_heart')!;
    expect(c.effects!.overhealGoldRatio).toBeCloseTo(2, 9); // base ratio, step 1's own field
    const step2 = c.upgrade.steps[1] as Record<string, number>;
    expect(step2.overhealGoldRatio).toBeCloseTo(1, 9);
    // "step 1: tower overheal also converts {base}:1; step 2: both conversions
    //  become {step2}:1; step 3: tower lifesteal {pct}%" — the leading digit
    // of each clause is its own "step N" label, and the trailing 0.3% is an
    // unscaled percent (base + step 3's own flat add).
    expect(numbersIn(c.upgrade.desc!)).toEqual([1, 2, 1, 2, 1, 1, 3, 0.3]);
  });

  it('cores.json: Time\'s upgrade desc quotes the scaled hpRegenPerSecond and the scaled decay coefficient', () => {
    const c = content.cores.cores.find((x) => x.key === 'time')!;
    const step2 = c.upgrade.steps[1] as Record<string, number>;
    expect(step2.hpRegenPerSecond).toBeCloseTo(0.1, 9);
    // The decay aura's leading coefficient is an in-code constant
    // (`updateTimeDecay`, `src/sim/cores.ts`) multiplied by `numberScale`
    // directly rather than a /data field, but the sentence quotes it too.
    expect(content.modifiers.numberScale).toBeCloseTo(0.1, 9);
    // "step 1: +3 gold/s; step 2: +{regen} HP regen/s and +20% healing received;
    //  step 3: decay aura r5 ({coeff}x1.2^(5-ring)/s); step 4: ...; step 5: 1.2 -> 1.5"
    // — each clause's leading digit is its own "step N" label.
    expect(numbersIn(c.upgrade.desc!)).toEqual([1, 3, 2, 0.1, 20, 3, 5, 0.1, 1.2, 5, 4, 10, 5, 1.2, 1.5]);
  });

  it('quests.json: the lifetime-damage quest desc quotes the scaled target', () => {
    const q = content.quests.quests.find((x) => x.key === 'hundred_grand')!;
    expect(q.target).toBeCloseTo(10000, 9);
    expect(numbersIn(q.desc)).toEqual([10000]);
  });

  it("cores.json: the Corpse Core's unlockCondition quotes the same scaled lifetime-damage target as its quest", () => {
    const c = content.cores.cores.find((x) => x.key === 'corpse')!;
    expect(numbersIn(c.unlockCondition!)).toEqual([10000]);
  });

  it('modifiers.json: the Cracked Core drafted modifier quotes the scaled coreHp penalty', () => {
    const m = content.modifiers.modifiers.find((x) => x.key === 'cracked')!;
    expect(m.effect!.coreHp).toBeCloseTo(-15, 9);
    expect(numbersIn(m.desc)).toEqual([-15]);
  });
});
