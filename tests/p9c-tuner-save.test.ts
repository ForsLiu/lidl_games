/**
 * P9 p9c, gate G15: the Tuner's write path. `saveTunerFile` is pure Node —
 * every test here runs against a temp copy of `/data`, never the real
 * files, per BACKLOG-TUNER.md's own t26b acceptance ("endpoint tests
 * against temp data copies").
 */
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { saveTunerFile } from '../src/devserver/tunerSave';
import { TUNER_FILES } from '../src/sim/content';

function makeTempDataDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'stonewake-tuner-'));
  for (const entry of TUNER_FILES) {
    const real = join(process.cwd(), 'data', entry.fileName);
    writeFileSync(join(dir, entry.fileName), readFileSync(real, 'utf8'));
  }
  return dir;
}

describe('saveTunerFile (p9c, G15)', () => {
  it('round-trips a valid edit to disk', () => {
    const dir = makeTempDataDir();
    const before = JSON.parse(readFileSync(join(dir, 'towers.json'), 'utf8'));
    const edited = {
      ...before,
      towers: before.towers.map((t: Record<string, unknown>, i: number) =>
        i === 0 ? { ...t, cost: (t.cost as number) + 5 } : t,
      ),
    };
    const result = saveTunerFile('towers', edited, dir);
    expect(result.ok).toBe(true);
    const after = JSON.parse(readFileSync(join(dir, 'towers.json'), 'utf8'));
    expect(after.towers[0].cost).toBe(before.towers[0].cost + 5);
  });

  it('rejects invalid data with field-level errors and writes nothing', () => {
    const dir = makeTempDataDir();
    const before = readFileSync(join(dir, 'towers.json'), 'utf8');
    const result = saveTunerFile('towers', { towers: 'not-an-array' }, dir);
    expect(result.ok).toBe(false);
    expect(result.errors!.length).toBeGreaterThan(0);
    expect(typeof result.errors![0].path).toBe('string');
    expect(typeof result.errors![0].message).toBe('string');
    expect(readFileSync(join(dir, 'towers.json'), 'utf8')).toBe(before);
  });

  it('rejects an unknown file key', () => {
    const dir = makeTempDataDir();
    const result = saveTunerFile('not-a-real-file', {}, dir);
    expect(result.ok).toBe(false);
    expect(result.errors![0].message).toMatch(/unknown tuner file/);
  });

  it('leaves no temp file behind after a successful save (the tmp path is unique per call, not fixed)', () => {
    const dir = makeTempDataDir();
    const doc = JSON.parse(readFileSync(join(dir, 'modifiers.json'), 'utf8'));
    saveTunerFile('modifiers', doc, dir);
    const leftovers = readdirSync(dir).filter((f) => f.includes('.tmp'));
    expect(leftovers).toEqual([]);
  });

  it('every TUNER_FILES entry accepts the real, unedited /data file under its own schema', () => {
    const dir = makeTempDataDir();
    for (const entry of TUNER_FILES) {
      const doc = JSON.parse(readFileSync(join(process.cwd(), 'data', entry.fileName), 'utf8'));
      const result = saveTunerFile(entry.key, doc, dir);
      expect(result.ok, `${entry.key}: ${JSON.stringify(result.errors)}`).toBe(true);
    }
  });

  // code-reviewer's Major #2: a document can be perfectly schema-valid on
  // its own and still name a sibling entity nothing else in /data defines —
  // exactly the shape of bug that used to crash every `loadContent()` call
  // (including the very next reload) rather than being rejected up front.
  describe('rejects a schema-valid document that breaks cross-file referential integrity', () => {
    it('a wave group naming an unknown enemy', () => {
      const dir = makeTempDataDir();
      const before = readFileSync(join(dir, 'waves.json'), 'utf8');
      const waves = JSON.parse(before);
      waves.waves[0].groups[0].enemy = 'no-such-enemy-key';
      const result = saveTunerFile('waves', waves, dir);
      expect(result.ok).toBe(false);
      expect(result.errors![0].message).toMatch(/unknown enemy/);
      expect(readFileSync(join(dir, 'waves.json'), 'utf8')).toBe(before);
    });

    it('an equipment item naming an unknown class in classFallback', () => {
      const dir = makeTempDataDir();
      const before = readFileSync(join(dir, 'equipment.json'), 'utf8');
      const equipment = JSON.parse(before);
      const withFallback = equipment.items.find((i: Record<string, unknown>) => i.classFallback);
      expect(withFallback, 'fixture assumption: at least one item authors classFallback').toBeDefined();
      withFallback.classFallback.notClassKey = 'no-such-class-key';
      const result = saveTunerFile('equipment', equipment, dir);
      expect(result.ok).toBe(false);
      expect(result.errors![0].message).toMatch(/unknown class/);
      expect(readFileSync(join(dir, 'equipment.json'), 'utf8')).toBe(before);
    });

    it('still accepts a same-shape edit that does not touch any reference', () => {
      const dir = makeTempDataDir();
      const waves = JSON.parse(readFileSync(join(dir, 'waves.json'), 'utf8'));
      waves.waves[0].groups[0].enemy = waves.waves[0].groups[0].enemy; // no-op edit, still valid
      const result = saveTunerFile('waves', waves, dir);
      expect(result.ok, JSON.stringify(result.errors)).toBe(true);
    });
  });
});
