/**
 * Lane merge 2026-09-03 (BACKLOG-TERRAIN fb064a/fb064b's merge blocker):
 * `data/terrain.json` is part of `contentHash()`, so a run recorded against
 * one terrain tuning fails loudly when replayed against another
 * (SPEC-FINAL §12 architecture rule 2). Before this fold the terrain module
 * validated its own file and nothing hashed it.
 */
import { describe, expect, it } from 'vitest';
import terrainRaw from '../data/terrain.json';
import { contentHash, loadContent } from '../src/sim/content';
import { loadTerrain } from '../src/sim/terrain/config';

describe('contentHash covers data/terrain.json', () => {
  const base = loadContent();

  it('carries the authored terrain document, byte-for-byte, in Content.raw', () => {
    expect(base.raw.mapTerrain).toEqual(terrainRaw);
    // And it is the same document the generator validated — not a second copy.
    expect(loadTerrain().density).toEqual((terrainRaw as { density: unknown }).density);
  });

  it('moves when a terrain density is edited, and only then', () => {
    const same = { ...base, raw: { ...base.raw, mapTerrain: JSON.parse(JSON.stringify(terrainRaw)) } };
    expect(contentHash(same)).toBe(contentHash(base));

    const edited = JSON.parse(JSON.stringify(terrainRaw)) as { density: { rough: number } };
    edited.density.rough += 0.01;
    expect(contentHash({ ...base, raw: { ...base.raw, mapTerrain: edited } })).not.toBe(contentHash(base));
  });
});
