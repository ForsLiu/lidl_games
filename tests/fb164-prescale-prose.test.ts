/**
 * fb164 — player-facing prose still quoted pre-rescale numbers.
 *
 * fb153a's `numberScale` (0.1, `data/modifiers.json`) divides every authored
 * HP/damage magnitude at load, but the hand-typed *sentences* beside those
 * fields were never re-anchored — so the game told the player numbers it did
 * not run on: `data/vsupgrades.json`'s `vitality` boon read "+15 Max HP" and
 * granted 1.5 on a 10 HP pool, `data/damagetypes.json`'s Bleeding read "1
 * damage per second" and dealt 0.1, and the same drift ran through
 * `data/equipment.json`, `data/tree.json`, `data/cores.json`,
 * `data/modifiers.json`, `data/quests.json` and one `data/classes.json`
 * sentence (Contagious Flame's `flameDps`, covered by
 * `tests/class-descriptions.test.ts`'s own ledger instead of here).
 *
 * `tests/class-descriptions.test.ts`'s c015 ledger already builds a full
 * positional-claim audit for the two class description slots; replicating
 * that machinery for six more files' worth of hand-authored strings is out of
 * this item's scope. Instead, each fix below is pinned directly: the number
 * is extracted from the shipped sentence and compared against the *loaded*
 * (post-`numberScale`) field it names, so a future retune that moves the
 * field without moving the sentence reddens here rather than shipping quietly
 * — the same failure mode fb164 was filed to close.
 */

import { describe, expect, it } from 'vitest';

import { loadContent } from '../src/sim/content';

const content = loadContent();

/** First bare (optionally signed, decimal) number in `text`, or fails loudly if there is none. */
function firstNumber(text: string): number {
  const m = text.match(/-?\d+(?:\.\d+)?/);
  expect(m, `no number found in "${text}"`).not.toBeNull();
  return Number.parseFloat(m![0]);
}

/** Every bare (optionally signed, decimal) number in `text`, in order. */
function allNumbers(text: string): number[] {
  return [...text.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number.parseFloat(m[0]));
}

describe('fb164 — damagetypes.json sentences match the post-numberScale dps', () => {
  it('Bleeding: "N damage per second" is the loaded dps', () => {
    const bleeding = content.damageTypeByKey.get('bleeding')!;
    const n = firstNumber(bleeding.desc);
    expect(n).toBeCloseTo(bleeding.dps!, 9);
  });

  it('Burning: "N damage and strips" is the loaded dps (armor shred is a separate, unscaled axis)', () => {
    const burning = content.damageTypeByKey.get('burning')!;
    const [dmgNum, armorNum] = allNumbers(burning.desc);
    expect(dmgNum).toBeCloseTo(burning.dps!, 9);
    expect(armorNum).toBeCloseTo(burning.armorShredPerSecond!, 9);
  });
});

describe('fb164 — vsupgrades.json vitality boon matches its loaded perRank', () => {
  it('"+N Max HP" is the loaded perRank, not the pre-rescale authored one', () => {
    const vitality = content.boons.statBoons.find((b) => b.stat === 'maxHp')!;
    expect(firstNumber(vitality.desc)).toBeCloseTo(vitality.perRank, 9);
  });
});

describe('fb164 — equipment.json item descriptions match their loaded mods', () => {
  const cases: readonly { key: string; hp: number; atk: number }[] = [
    { key: 'greatsword', hp: 0, atk: 1 },
    { key: 'sleeve_sword', hp: 0, atk: 0.5 },
    { key: 'normal_armor', hp: 1, atk: 0 },
    { key: 'swordsman_armor', hp: 0.5, atk: 0.5 },
    { key: 'normal_shoes', hp: 0.5, atk: 0 },
    { key: 'swordsman_shoes', hp: 0.3, atk: 0.3 },
    { key: 'normal_ring', hp: 0.1, atk: 0.1 },
    { key: 'bleeding_ring', hp: 0, atk: 0.2 },
    { key: 'normal_necklace', hp: 0.1, atk: 0.1 },
    { key: 'builders_necklace', hp: 0.1, atk: 0 },
    { key: 'normal_bracelet', hp: 0.1, atk: 0.1 },
    { key: 'sniper_bracelet', hp: 0.2, atk: 0.1 },
  ];

  for (const { key } of cases) {
    it(`${key}: "HP X / Atk Y" matches its loaded maxHp/atkFlat`, () => {
      const item = content.equipmentByKey.get(key)!;
      const m = item.desc.match(/HP (-?[\d.]+) \/ Atk (-?[\d.]+)/);
      expect(m, `${key}: description does not match the "HP X / Atk Y" shape`).not.toBeNull();
      expect(Number.parseFloat(m![1])).toBeCloseTo(item.mods.maxHp ?? 0, 9);
      expect(Number.parseFloat(m![2])).toBeCloseTo(item.mods.atkFlat ?? 0, 9);
    });
  }

  it('normal_ring: "Life regen +N" matches the loaded hpRegen', () => {
    const item = content.equipmentByKey.get('normal_ring')!;
    const m = item.desc.match(/Life regen \+(-?[\d.]+)/);
    expect(m).not.toBeNull();
    expect(Number.parseFloat(m![1])).toBeCloseTo(item.mods.hpRegen ?? 0, 9);
  });

  it("builders_necklace: \"All towers +N flat attack\" matches the loaded towerAtkFlat", () => {
    const item = content.equipmentByKey.get('builders_necklace')!;
    const m = item.desc.match(/All towers \+(-?[\d.]+) flat attack/);
    expect(m).not.toBeNull();
    expect(Number.parseFloat(m![1])).toBeCloseTo(item.mods.towerAtkFlat ?? 0, 9);
  });
});

describe('fb164 — tree.json node descriptions match their loaded stats', () => {
  it('node 30: "Core +N HP" is the loaded coreHp', () => {
    const node = content.treeById.get(30)!;
    expect(firstNumber(node.desc!)).toBeCloseTo(node.stats!.coreHp!, 9);
  });

  it('node 70: "+N Max HP, +M HP regen" are the loaded maxHp/hpRegen', () => {
    const node = content.treeById.get(70)!;
    const [hp, regen] = allNumbers(node.desc!);
    expect(hp).toBeCloseTo(node.stats!.maxHp!, 9);
    expect(regen).toBeCloseTo(node.stats!.hpRegen!, 9);
  });
});

describe('fb164 — cores.json upgrade/unlock text matches loaded core fields', () => {
  it('Stone Heart: "+N Core HP per step" is the loaded coreHpBonus', () => {
    const core = content.coreByKey.get('stone_heart')!;
    expect(firstNumber(core.upgrade!.desc)).toBeCloseTo(core.upgrade!.steps![0].coreHpBonus!, 9);
  });

  it('Vampire Heart: the two "N:1" ratios are the loaded overhealGoldRatio at each step', () => {
    const core = content.coreByKey.get('vampire_heart')!;
    const base = core.upgrade!.desc.match(/converts ([\d.]+):1/);
    const stepped = core.upgrade!.desc.match(/become ([\d.]+):1/);
    expect(base, 'no "converts N:1" in Vampire Heart\'s upgrade desc').not.toBeNull();
    expect(stepped, 'no "become N:1" in Vampire Heart\'s upgrade desc').not.toBeNull();
    expect(Number.parseFloat(base![1])).toBeCloseTo(core.effects!.overhealGoldRatio!, 9);
    expect(Number.parseFloat(stepped![1])).toBeCloseTo(core.upgrade!.steps![1].overhealGoldRatio!, 9);
  });

  it('Corpse: the unlock condition\'s lifetime-damage figure (commas stripped) matches its own quest target', () => {
    const core = content.coreByKey.get('corpse')!;
    const quest = content.quests.quests.find((q) => q.key === core.unlockQuest)!;
    expect(quest.metric).toBe('lifetime_damage');
    const digits = core.unlockCondition!.replace(/[^\d]/g, '');
    expect(Number.parseInt(digits, 10)).toBeCloseTo(quest.target, 9);
  });

  it("Time: \"+N HP regen/s\" and the decay formula's leading coefficient are both scaled", () => {
    const core = content.coreByKey.get('time')!;
    const regen = core.upgrade!.desc.match(/\+([\d.]+) HP regen\/s/);
    const coefficient = core.upgrade!.desc.match(/\(([\d.]+)x1\.2\^/);
    expect(regen, 'no "+N HP regen/s" in Time\'s upgrade desc').not.toBeNull();
    expect(coefficient, 'no "(Nx1.2^..." in Time\'s upgrade desc').not.toBeNull();
    expect(Number.parseFloat(regen![1])).toBeCloseTo(core.upgrade!.steps![1].hpRegenPerSecond!, 9);
    // `updateTimeDecay` (src/sim/cores.ts) multiplies the exponent by
    // `content.modifiers.numberScale` directly — there is no /data field for
    // this literal (rule-4 debt, documented there), so the sentence is
    // pinned against the same scale rather than an authored row.
    expect(Number.parseFloat(coefficient![1])).toBeCloseTo(content.modifiers.numberScale, 9);
  });
});

describe('fb164 — modifiers.json "cracked" matches its loaded coreHp effect', () => {
  it('"Core -N HP" is the loaded (negative) coreHp effect', () => {
    const cracked = content.modifierByKey.get('cracked')!;
    // `firstNumber` reads the sign along with the digits, so this compares
    // directly against the (already-negative) loaded effect.
    expect(firstNumber(cracked.desc)).toBeCloseTo(cracked.effect!.coreHp!, 9);
  });
});

describe('fb164 — quests.json hundred_grand matches its loaded lifetime-damage target', () => {
  it('"Deal N,NNN lifetime damage" (commas stripped) is the loaded target', () => {
    const quest = content.quests.quests.find((q) => q.key === 'hundred_grand')!;
    const digits = quest.desc.replace(/[^\d]/g, '');
    expect(Number.parseInt(digits, 10)).toBeCloseTo(quest.target, 9);
  });
});

describe('fb164 — numberScale documents the factor these fixes assume', () => {
  it('is 0.1 today; if this ever retunes, every fixed sentence above must move with it', () => {
    // Not a tautology: every case above reads its number back out of loaded
    // /data, so a numberScale retune alone cannot silently pass this file —
    // this assertion only pins the *specific* factor the sentences above were
    // hand-edited against, so a retune is a visible diff here too.
    expect(content.modifiers.numberScale).toBe(0.1);
  });
});
