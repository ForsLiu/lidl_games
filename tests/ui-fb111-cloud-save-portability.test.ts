/**
 * @vitest-environment jsdom
 *
 * fb111: audits every `localStorage`-persisted blob this lane owns against
 * QUALITY.md 1.0's "cloud-save-safe file format" checklist line — that each
 * stored shape is pure portable JSON with no environment-specific field
 * (absolute paths, machine-local timestamps used as *identity* rather than
 * data, values JSON cannot round-trip) that would corrupt or fail to
 * round-trip if a cloud-save provider synced it onto a different machine.
 *
 * The four owned shapes:
 *  - `SAVE_KEY` (`stonewake.save.v1`) and the fb096 per-slot mirror keys
 *    (`stonewake.save.slotN.v1` + the `stonewake.activeslot.v1` pointer),
 *    written through `saveslots.ts`;
 *  - `stonewake.keybindings.v1` (`keybindings.ts`);
 *  - `stonewake.settings.v1` (`settings.ts`);
 *  - `stonewake.runinprogress.v1` (`runpersist.ts`).
 *
 * "A different machine" is modelled the way it actually bites: the write
 * happens under one `Date.now()` (and one `Intl` locale/timezone), the read
 * happens under a wildly different one, with nothing carried across but the
 * raw stored *text* — exactly what a cloud-save provider hands over. Anything
 * that silently baked the writing machine's clock or locale into the payload
 * shows up as a diff on the read side.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { contentHash, loadContent } from '../src/sim/content';
import { Run } from '../src/sim/run';
import { SAVE_KEY, defaultMeta, deserializeMeta, saveMeta } from '../src/meta/meta';
import { KEYBINDINGS_KEY, defaultKeyBindings, loadKeyBindings, saveKeyBindings } from '../src/ui/keybindings';
import { SETTINGS_KEY, defaultSettings, loadSettings, saveSettings } from '../src/ui/settings';
import { RUN_PERSIST_KEY, loadPersistedRun, savePersistedRun } from '../src/ui/runpersist';
import type { PersistedRun } from '../src/ui/runpersist';
import {
  SAVE_SLOT_COUNT,
  ensureActiveSlotMigrated,
  getActiveSlot,
  switchToSlot,
} from '../src/ui/saveslots';
import { emptyInput } from '../src/sim/types';
import type { Command, MetaState, TickInput } from '../src/sim/types';
import { cfg } from './helpers';

/** Machine A's clock: a plausible "wrote the save last Tuesday" instant. */
const CLOCK_A = Date.UTC(2026, 8, 1, 9, 30, 0);
/** Machine B's clock: months later, and deliberately not a multiple/offset of A. */
const CLOCK_B = Date.UTC(2027, 2, 17, 23, 5, 41);

const realDateNow = Date.now;

function onMachine<T>(clock: number, fn: () => T): T {
  Date.now = () => clock;
  try {
    return fn();
  } finally {
    Date.now = realDateNow;
  }
}

/**
 * Everything this lane's storage keys hold, as raw text — the only thing a
 * cloud-save provider actually moves between machines.
 */
function snapshotStorage(): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key === null) continue;
    out[key] = localStorage.getItem(key) ?? '';
  }
  return out;
}

function restoreStorage(snapshot: Record<string, string>): void {
  localStorage.clear();
  for (const [key, value] of Object.entries(snapshot)) localStorage.setItem(key, value);
}

/**
 * Anything that looks like it came from the writing machine's filesystem
 * rather than from the game's own data. Matched against every string in the
 * parsed tree; the game's own keys are short lowercase identifiers, so none
 * of these can collide with legitimate content.
 */
const ENV_SPECIFIC_STRING =
  /(^[A-Za-z]:[\\/])|(^\/(home|Users|tmp|var|mnt|root|opt|private)\/)|(^file:\/\/)|(\\\\[^\\]+\\)/;

/** Values JSON silently mangles: `undefined`/function (dropped), `NaN`/`Infinity` (become `null`), `Date`/`Map`/`Set` (become `{}`/a string). */
function portabilityViolations(value: unknown, path = '$'): string[] {
  const bad: string[] = [];
  const walk = (v: unknown, p: string): void => {
    if (v === null) return;
    switch (typeof v) {
      case 'number':
        if (!Number.isFinite(v)) bad.push(`${p}: non-finite number ${String(v)}`);
        return;
      case 'string':
        if (ENV_SPECIFIC_STRING.test(v)) bad.push(`${p}: environment-specific string ${JSON.stringify(v)}`);
        return;
      case 'boolean':
        return;
      case 'undefined':
        bad.push(`${p}: undefined (dropped by JSON.stringify)`);
        return;
      case 'object':
        break;
      default:
        bad.push(`${p}: non-serializable ${typeof v}`);
        return;
    }
    if (Array.isArray(v)) {
      v.forEach((item, i) => walk(item, `${p}[${i}]`));
      return;
    }
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) {
      bad.push(`${p}: non-plain object (${(v as object).constructor?.name ?? 'unknown'})`);
      return;
    }
    for (const [k, item] of Object.entries(v as Record<string, unknown>)) walk(item, `${p}.${k}`);
  };
  walk(value, path);
  return bad;
}

/**
 * Asserts a shape is cloud-safe, in the only order that actually proves it.
 *
 * `source` is scanned BEFORE serialization (code-reviewer finding): every rule
 * but the absolute-path one is unreachable against a `JSON.parse` result,
 * because `JSON.stringify` has already dropped `undefined`/functions and
 * laundered `NaN`/`Infinity`/`Date` into `null`/`{}`/a string. Scanning the
 * live object is what makes a `Date` or a non-finite number newly added to any
 * of these shapes fail here rather than slip through as a silent `null`.
 *
 * The raw text is then required to be exactly what `JSON.stringify` of its own
 * parse produces — not a tautology, since `raw` is the *writer's* output: it
 * fails if a writer ever emits pretty-printed, comment-bearing or otherwise
 * non-canonical text that a stricter reader on another machine could reject.
 */
function expectPortableJson(
  raw: string | null,
  label: string,
  source: unknown,
  expectedKeys: string[],
): unknown {
  expect(portabilityViolations(source, `${label} (pre-serialize)`)).toEqual([]);
  expect(raw, `${label}: nothing stored`).toBeTypeOf('string');
  const parsed = JSON.parse(raw as string) as unknown;
  expect(portabilityViolations(parsed, label)).toEqual([]);
  expect(JSON.stringify(parsed)).toBe(raw);
  // The stored key set, pinned (qa-playtester finding). Without this the audit
  // is blind to the FIRST violation class the item names: a writer that injects
  // its own `savedAt: Date.now()` / `tz: ...resolvedOptions().timeZone` beside
  // the real payload. Such a field never reaches the pre-serialize scan (it is
  // added inside the writer, after the caller's object), and it is a finite
  // number or a plain string so the post-parse scan passes it too — and then
  // `sanitize`/`sanitizeKeyBindings`/`migrateWithNotice` all rebuild their
  // result field by field, dropping the intruder before the round-trip
  // comparison ever sees it. Only `runpersist.ts`, whose loader returns the
  // parsed object as-is, was protected. This assertion closes that for all four.
  expect(Object.keys(parsed as Record<string, unknown>).sort()).toEqual([...expectedKeys].sort());
  return parsed;
}

/** A deliberately non-default account: every `MetaState` field carrying real, varied data. */
function richMeta(): MetaState {
  return {
    ...defaultMeta(),
    allocated: [0, 3, 7, 12],
    equipmentStash: { swordsman_armor: 2, sleeve_sword: 1 },
    equippedEquipment: { ...defaultMeta().equippedEquipment, weapon: 'sleeve_sword' },
    highestTier: 3,
    questProgress: { wins: 4, wins_max4towertypes: 1 },
    completedQuests: ['first_blood'],
    autoPickLevelUps: true,
    skillPoints: 17,
  };
}

/** A log carrying every value kind a real one does: axes, flags, aim floats, and a Command with a `null` payload field. */
function inputLog(ticks: number): TickInput[] {
  const log: TickInput[] = [];
  for (let t = 0; t < ticks; t++) {
    const cmds: Command[] =
      t === 3
        ? [{ k: 'build', tower: 2, tx: 14, ty: 9 }]
        : t === 11
          ? [{ k: 'equip_item', slot: 'weapon', item: null }, { k: 'pick', index: 1 }]
          : [];
    log.push({
      ...emptyInput(),
      mx: t % 3 === 0 ? 1 : 0,
      my: t % 5 === 0 ? -1 : 0,
      dash: t % 7 === 0,
      attack: t % 2 === 0,
      aimX: 10.5 + (t % 4),
      aimY: 12.25,
      active1Held: t % 4 === 0,
      cmds,
    });
  }
  return log;
}

describe('fb111: cloud-save portability of every lane-owned localStorage blob', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    Date.now = realDateNow;
    localStorage.clear();
  });

  it('round-trips the account save (SAVE_KEY) written on one machine and read on another', () => {
    const meta = richMeta();
    onMachine(CLOCK_A, () => saveMeta(meta));

    const raw = localStorage.getItem(SAVE_KEY);
    // The stored wrapper is `{ version, meta }` (serializeMeta), so that is
    // the shape the pre-serialize scan has to see, not `meta` alone.
    expectPortableJson(raw, 'SAVE_KEY', JSON.parse(raw as string), ['version', 'meta']);
    expect(portabilityViolations(meta, 'meta (pre-serialize)')).toEqual([]);

    const carried = snapshotStorage();
    const loaded = onMachine(CLOCK_B, () => {
      restoreStorage(carried);
      return deserializeMeta(localStorage.getItem(SAVE_KEY) as string);
    });

    expect(loaded).toStrictEqual(meta);
    expect(JSON.stringify(loaded)).toBe(JSON.stringify(meta));
  });

  it('round-trips the fb096 slot mirror keys and the active-slot pointer', () => {
    const slotMetas = [richMeta(), { ...richMeta(), skillPoints: 3 }, { ...richMeta(), highestTier: 5 }];
    onMachine(CLOCK_A, () => {
      saveMeta(slotMetas[0] as MetaState);
      ensureActiveSlotMigrated();
      for (let slot = 1; slot < SAVE_SLOT_COUNT; slot++) {
        switchToSlot(slot);
        saveMeta(slotMetas[slot] as MetaState);
      }
      switchToSlot(0);
    });

    const carried = snapshotStorage();
    // Every JSON-shaped key this lane owns.
    for (const [key, value] of Object.entries(carried)) {
      if (key === SAVE_KEY || key.startsWith('stonewake.save.slot')) {
        expectPortableJson(value, key, JSON.parse(value), ['version', 'meta']);
      }
    }
    // The active-slot pointer is the ONE owned value that is deliberately not
    // JSON: `setActiveSlotRaw` (src/ui/saveslots.ts) writes `String(slot)` and
    // `getActiveSlot` reads it back through `Number(raw)` + `inRange`. Audited
    // explicitly rather than filtered out of the loop above (code-reviewer
    // finding) — a bare decimal string is locale-independent and portable, but
    // that is a finding to state, not to skip.
    const pointer = carried['stonewake.activeslot.v1'];
    expect(pointer, 'active-slot pointer is a bare decimal string').toBe('0');
    expect(Number(pointer)).toBe(0);
    expect(portabilityViolations(pointer, 'active-slot pointer')).toEqual([]);

    const readBack = onMachine(CLOCK_B, () => {
      restoreStorage(carried);
      const out: MetaState[] = [];
      for (let slot = 0; slot < SAVE_SLOT_COUNT; slot++) {
        if (slot !== getActiveSlot()) switchToSlot(slot);
        out.push(deserializeMeta(localStorage.getItem(SAVE_KEY) as string));
      }
      return out;
    });

    for (let slot = 0; slot < SAVE_SLOT_COUNT; slot++) {
      expect(readBack[slot], `slot ${slot}`).toStrictEqual(slotMetas[slot]);
    }
  });

  it('round-trips settings written on one machine and read on another', () => {
    const settings = {
      ...defaultSettings(),
      masterVolume: 0.35,
      sfxVolume: 0.8,
      shake: 0.25,
      showGrid: true,
      accessiblePalette: true,
      reducedFlash: true,
      reducedMotion: true,
      maxDamageNumbers: 120,
      dotNumbers: false,
      onboardingSeenBuild: true,
    };
    onMachine(CLOCK_A, () => saveSettings(settings));
    expectPortableJson(
      localStorage.getItem(SETTINGS_KEY),
      SETTINGS_KEY,
      settings,
      Object.keys(defaultSettings()),
    );

    const carried = snapshotStorage();
    const loaded = onMachine(CLOCK_B, () => {
      restoreStorage(carried);
      return loadSettings();
    });
    expect(loaded).toStrictEqual(settings);
    expect(JSON.stringify(loaded)).toBe(JSON.stringify(settings));
  });

  it('round-trips keybindings written on one machine and read on another', () => {
    const bindings = { ...defaultKeyBindings(), toggleDpsPanel: 'p', toggleVsPanel: 'o' };
    onMachine(CLOCK_A, () => saveKeyBindings(bindings));
    expectPortableJson(
      localStorage.getItem(KEYBINDINGS_KEY),
      KEYBINDINGS_KEY,
      bindings,
      Object.keys(defaultKeyBindings()),
    );

    const carried = snapshotStorage();
    const loaded = onMachine(CLOCK_B, () => {
      restoreStorage(carried);
      return loadKeyBindings();
    });
    expect(loaded).toStrictEqual(bindings);
    expect(JSON.stringify(loaded)).toBe(JSON.stringify(bindings));
  });

  it('round-trips the in-progress run checkpoint, whose sessionId is data and never cross-machine identity', () => {
    // fb074 mints `sessionId` from the *writing* machine's `Date.now()`. It is
    // the one field in any owned blob that touches a clock, so it gets the
    // audit's sharpest look: it must survive as opaque data and must not gate
    // whether another machine can resume the run.
    const sessionId = onMachine(CLOCK_A, () => `${Date.now().toString(36)}-abc123`);
    // Built through the production path (code-reviewer finding): `Game`
    // persists `this.lastCfg` *after* `new Run(cfg)`, and `World`'s
    // constructor stamps `cfg.contentHash` (src/sim/world.ts) — auditing a
    // bare `cfg()` helper object would miss the one field with real
    // cross-machine consequences, plus the Hub-shaped `core`/`equipment`/
    // `ownedEquipment` a real launch carries.
    const run = new Run(
      cfg({
        seed: 42,
        classKey: 'swordsman',
        core: 'stone_heart',
        equipment: [],
        ownedEquipment: { swordsman_armor: 2 },
        autoPickLevelUps: true,
      }),
    );
    const recorded = { config: run.world.cfg, inputLog: inputLog(40), sessionId };
    expect(recorded.config.contentHash, 'the audited config carries a real content hash').toBe(
      contentHash(loadContent()),
    );

    const ok = onMachine(CLOCK_A, () => savePersistedRun(recorded));
    expect(ok).toBe(true);
    expectPortableJson(localStorage.getItem(RUN_PERSIST_KEY), RUN_PERSIST_KEY, recorded, [
      'config',
      'inputLog',
      'sessionId',
    ]);

    const carried = snapshotStorage();
    const loaded = onMachine(CLOCK_B, () => {
      restoreStorage(carried);
      return loadPersistedRun();
    });

    expect(loaded).not.toBeNull();
    expect(loaded).toStrictEqual(recorded);
    expect(JSON.stringify(loaded)).toBe(JSON.stringify(recorded));
    // The decisive cross-machine property, asserted behaviourally rather than
    // by inspecting the string (code-reviewer finding): machine B accepts a
    // checkpoint stamped by a session id it never minted, and can then take
    // ownership by re-persisting under its own id — `beginRun`
    // (`src/ui/main.ts`) re-mints `runSessionId` and nulls
    // `lastWrittenSessionId` on a resumed run precisely so the cross-tab
    // backoff in `persistRun` cannot fire against a foreign id.
    expect(loaded?.sessionId).toBe(sessionId);
    const machineBId = onMachine(CLOCK_B, () => `${Date.now().toString(36)}-def456`);
    expect(savePersistedRun({ ...(loaded as PersistedRun), sessionId: machineBId })).toBe(true);
    expect(loadPersistedRun()?.sessionId).toBe(machineBId);
    expect(loadPersistedRun()?.inputLog).toStrictEqual(recorded.inputLog);
  });

  it("reads a payload identically whatever the reading machine's locale reports", () => {
    const settings = { ...defaultSettings(), masterVolume: 0.125, maxDamageNumbers: 7 };
    saveSettings(settings);
    const raw = localStorage.getItem(SETTINGS_KEY) as string;

    // A locale whose number formatting uses `,` as the decimal separator is the
    // classic way a locale-formatted number sneaks into a payload: it would
    // serialize as "0,125" here and fail to parse as a number over there.
    // Guarded (code-reviewer finding): on a small-ICU Node build `de-DE`
    // silently falls back to en-US, which would fail this for a reason having
    // nothing to do with the code under test. The two `raw` assertions below
    // are the real check either way.
    const deDecimal = new Intl.NumberFormat('de-DE').format(0.125);
    if (deDecimal.includes(',')) expect(deDecimal).toBe('0,125');
    expect(raw).toContain('0.125');
    expect(raw).not.toContain('0,125');

    localStorage.clear();
    localStorage.setItem(SETTINGS_KEY, raw);
    expect(loadSettings()).toStrictEqual(settings);
  });

  it('flags a genuinely non-portable payload, so the audit above is a live check and not a tautology', () => {
    // The scanner's own proof case: if any of the shapes above ever gained an
    // absolute path, a machine clock stored as a `Date`, or a non-finite
    // number, the assertions above would fail rather than quietly pass.
    const violations = portabilityViolations({
      savePath: '/home/someone/.local/share/stonewake/save.json',
      writtenAt: new Date(CLOCK_A),
      score: Number.POSITIVE_INFINITY,
      nested: { winPath: 'C:\\Users\\someone\\save.json' },
    });
    expect(violations.length).toBeGreaterThanOrEqual(4);
    expect(violations.join('\n')).toContain('environment-specific string');
    expect(violations.join('\n')).toContain('non-plain object');
    expect(violations.join('\n')).toContain('non-finite number');
  });
});
