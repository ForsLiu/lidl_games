/**
 * Playtest: "add more indicator to the progress of stage".
 *
 * The progress model is the thing the HUD draws, so these tests check it
 * against the sim's own schedule rather than against copied numbers: the
 * markers must land where the director actually fires.
 */

import { describe, expect, it } from 'vitest';

import { World } from '../src/sim/world';
import { runProgress, waveRemaining } from '../src/ui/progress';
import { xpToReach } from '../src/sim/progression';
import { cfg } from './helpers';

function world(): World {
  return new World(cfg());
}

describe('run progress', () => {
  it('Act I counts waves, and every wave gets a marker', () => {
    const w = world();
    const p = runProgress(w);
    expect(p.markers.length).toBe(w.waveCount);
    expect(p.markers.every((m) => !m.done)).toBe(true);
    expect(p.fraction).toBe(0);
    expect(p.title).toContain(`of ${w.waveCount}`);
  });

  it('the Act I bar tracks waves cleared', () => {
    const w = world();
    w.wavesCleared = 5;
    const p = runProgress(w);
    expect(p.fraction).toBeCloseTo(5 / w.waveCount, 5);
    expect(p.markers.filter((m) => m.done).length).toBe(5);
  });

  it('the build phase says what calling early is worth', () => {
    const w = world();
    w.phase = 'act1_build';
    w.buildTimer = 20;
    const p = runProgress(w);
    const bonus = Math.round(20 * w.content.waves.earlyCallGoldPerSecond);
    expect(p.detail).toContain(String(bonus));
    expect(p.sub).toBeNull();
  });

  it('waveRemaining counts what is standing plus what is still queued', () => {
    const w = world();
    expect(waveRemaining(w)).toBe(0);
    w.spawnQueue = [[1, 0], [1, 1], [2, 2]];
    expect(waveRemaining(w)).toBe(3);
  });

  it('Act II markers land exactly on the directors schedule', () => {
    const w = world();
    w.sundered = true;
    w.phase = 'act2';
    const sp = w.content.spawns;
    const p = runProgress(w);

    const boss = p.markers.filter((m) => m.kind === 'boss');
    expect(boss.length).toBe(1);
    expect(boss[0].at).toBe(1);

    const rifts = p.markers.filter((m) => m.kind === 'rift').map((m) => m.at * sp.bossTimeSeconds);
    expect(rifts).toEqual(sp.riftTimes.filter((t) => t < sp.bossTimeSeconds));

    const elites = p.markers.filter((m) => m.kind === 'elite').map((m) => m.at * sp.bossTimeSeconds);
    expect(elites[0]).toBeCloseTo(sp.eliteIntervalSeconds, 5);
    for (const t of elites) expect(t % sp.eliteIntervalSeconds).toBeCloseTo(0, 5);
  });

  it('Act II markers tick off as the clock passes them', () => {
    const w = world();
    w.sundered = true;
    w.phase = 'act2';
    w.act2Time = w.content.spawns.riftTimes[0] + 1;
    const p = runProgress(w);
    const firstRift = p.markers.find((m) => m.kind === 'rift')!;
    expect(firstRift.done).toBe(true);
    expect(p.markers.find((m) => m.kind === 'boss')!.done).toBe(false);
  });

  it('Act II shows the XP bar for the next level', () => {
    const w = world();
    w.sundered = true;
    w.phase = 'act2';
    w.level = 4;
    w.xp = 10;
    const p = runProgress(w);
    expect(p.sub?.label).toBe('Level 4');
    expect(p.sub?.fraction).toBeCloseTo(10 / xpToReach(5), 5);
    expect(p.sub?.text).toContain(String(xpToReach(5)));
  });

  it('the bar never leaves 0..1, however long a run drags on', () => {
    const w = world();
    w.sundered = true;
    w.phase = 'act2';
    w.act2Time = w.content.spawns.bossTimeSeconds * 3;
    const p = runProgress(w);
    expect(p.fraction).toBe(1);
    expect(p.sub!.fraction).toBeGreaterThanOrEqual(0);
    expect(p.sub!.fraction).toBeLessThanOrEqual(1);
  });
});
