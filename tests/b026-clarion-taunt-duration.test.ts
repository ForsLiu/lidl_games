/**
 * b026 — SPEC-FINAL §4.2's Paladin row, verbatim:
 *
 *   *Clarion Taunt*: enemies in r6 target the Paladin **4 s**; 60% of damage
 *   taken stores into Wrath.
 *
 * `data/classes.json` shipped `tauntDurationSeconds: 6` — a p6e balance-pass
 * bump (14s cooldown -> 8s, 4 -> 6s duration) made in pursuit of Paladin's
 * G8/G10 win-rate band (tests/p6e-class-diversity.test.ts). SPEC-FINAL §4.2's
 * duration is not marked tunable (⚖), so the bump is a spec contradiction,
 * not a tuning knob — QUESTIONS.md Q128 (owner verdict): spec conformance,
 * not deferred by Q40's "no balance tuning before P10". `fireClarionTaunt`
 * (`src/sim/classes.ts`) reads the data value directly, so correcting
 * `data/classes.json` is the whole fix — no engine change.
 */

import { describe, expect, it } from 'vitest';

import { loadContent, type ClassDef } from '../src/sim/content';
import { applyCommand, Run } from '../src/sim/run';
import { spawnEnemy } from '../src/sim/enemies';
import { emptyInput } from '../src/sim/types';
import { World } from '../src/sim/world';
import { cfg } from './helpers';

describe('b026: Clarion Taunt duration matches SPEC-FINAL §4.2 (4 s, not 6 s)', () => {
  it("loads the Paladin's active1.tauntDurationSeconds as 4", () => {
    const content = loadContent();
    const paladin = content.classByKey.get('paladin')! as ClassDef;
    expect(paladin.active1.tauntDurationSeconds).toBe(4);
  });

  it('a taunted enemy loses its tag after 4 s, not 6 s', () => {
    const run = new Run(cfg({ classKey: 'paladin' }));
    const w: World = run.world;
    w.phase = 'act1_wave';
    w.spawnQueue = [];
    w.warden.x = 10;
    w.warden.y = 10;
    w.warden.attackCooldown = 1e9;

    const key = w.content.enemies.enemies[0].key;
    const e = spawnEnemy(w, key, 11, 10)!;
    w.rebuildBuckets();

    applyCommand(w, { k: 'class_active' });
    expect(e.tauntRemaining).toBeCloseTo(4, 6);

    for (let i = 0; i < 60 * 5; i++) run.step(emptyInput());
    // 5 real seconds elapsed: a 4 s window has fully decayed.
    expect(e.tauntRemaining).toBe(0);
    expect(e.tauntKind).toBe(0);
  });
});
