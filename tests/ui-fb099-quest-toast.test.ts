/**
 * fb099: a quest can complete at run end (`applyRunResult`, `src/meta/
 * meta.ts`) with zero player-facing feedback — nothing distinguishes that
 * moment from any other run end short of opening the Quests panel (fb095)
 * afterward. `questCompletionToasts` (`src/ui/quests.ts`) is the pure
 * before/after `completedQuests` diff `main.ts` wires into `hud.say()`
 * toasts right as the Results screen opens.
 *
 * Drives the real `applyRunResult` against real `data/quests.json` content
 * (not a hand-rolled quest fixture) so this proves the toast text against
 * the actual reward names a player would see, and that replaying an
 * already-completed quest's metric never re-queues its toast.
 */
import { describe, expect, it } from 'vitest';

import { loadContent } from '../src/sim/content';
import { applyRunResult, defaultMeta } from '../src/meta/meta';
import type { MetaState, RunReport } from '../src/sim/types';
import { World } from '../src/sim/world';
import { questCompletionToasts } from '../src/ui/quests';
import { cfg } from './helpers';

const content = loadContent();

function reportWith(over: Partial<RunReport> = {}): RunReport {
  return {
    seed: 1,
    policy: 'none',
    classKey: 'engineer',
    core: 'stone_heart',
    tier: 1,
    modifiers: [],
    outcome: 'victory',
    // fb077: every non-practice run reports whether it fell back to the flat arena.
    terrainFallback: false,
    ticks: 0,
    // Above speedrunner's <=1920s target and with the Core at full HP (above
    // scrape_by's <=25% target) — a plain, boring victory that shouldn't
    // coincidentally complete either of §5.5's Core-unlock quests, so a test
    // isolating a specific §8.4 class quest doesn't also trip one.
    totalSeconds: 2000,
    act1Seconds: 0,
    act2Seconds: 0,
    wavesCleared: 0,
    vsWavesCleared: 0,
    coreHp: 500,
    coreMaxHp: 500,
    goldEarned: 0,
    goldSpent: 0,
    goldLeft: 0,
    towersBuilt: 0,
    // Empty by default (fine for most cases), but a victory report with an
    // empty towersByKey also satisfies "Ascetic"'s wins_max4towertypes
    // metric (<=4 distinct types) on the very same win — tests that need a
    // *single* newly-completed quest override this with 5+ distinct
    // attacking tower types to keep that coincidence from firing.
    towersByKey: {},
    survivalSeconds: 0,
    level: 1,
    kills: 0,
    leaks: 0,
    damageByWeapon: {},
    damageByType: {},
    damageTotal: 0,
    damageThroughMinute8: null,
    spawnedByWave: [],
    leaksByWave: [],
    goldEarnedByWave: [],
    topWeaponShareMinute8: 0,
    topWeaponMinute8: '',
    boons: {},
    typeMastery: {},
    skillCards: {},
    equipmentFound: 0,
    bossKilled: false,
    bossKillSeconds: 0,
    endHash: '',
    practiceUsed: false,
    sealed: false,
    ...over,
  };
}

/** 5 distinct attacking tower types, so `wins_max4towertypes` (<=4) never coincidentally fires alongside whatever quest a test is isolating. */
const FIVE_TOWER_TYPES = {
  arrow_spire: 1,
  ballista: 1,
  ember_brazier: 1,
  frost_obelisk: 1,
  tesla_coil: 1,
};

describe('fb099: quest-completion toast text', () => {
  it('queues exactly one toast, naming the quest and its reward, the moment win_a_run completes', () => {
    const w = new World(cfg());
    let meta = defaultMeta();
    expect(meta.completedQuests).not.toContain('win_a_run');

    const prevCompleted = meta.completedQuests;
    meta = applyRunResult(meta, reportWith({ outcome: 'victory', towersByKey: FIVE_TOWER_TYPES }), w);
    expect(meta.completedQuests).toContain('win_a_run');

    const toasts = questCompletionToasts(content, prevCompleted, meta.completedQuests);
    expect(toasts).toHaveLength(1);
    // win_a_run -> "First Dawn", reward: class pyromancer ("Pyro" in data/classes.json).
    expect(toasts[0]).toContain('First Dawn');
    expect(toasts[0]).toContain('Pyro');
  });

  it('does not re-queue a toast for a quest already completed before this run', () => {
    const w = new World(cfg());
    let meta = defaultMeta();
    meta = applyRunResult(meta, reportWith({ outcome: 'victory', towersByKey: FIVE_TOWER_TYPES }), w);
    expect(meta.completedQuests).toContain('win_a_run');

    // chrono_veteran needs 6 lifetime wins; win_a_run is already done from
    // the first win above and must never toast again on any later win.
    const prevCompleted = meta.completedQuests;
    for (let i = 0; i < 4; i++) {
      meta = applyRunResult(meta, reportWith({ outcome: 'victory', towersByKey: FIVE_TOWER_TYPES }), w);
    }
    // 5 lifetime wins so far — plaguebringer_veteran (>=3) is done,
    // chrono_veteran (>=6) is not yet.
    expect(meta.completedQuests).toContain('plaguebringer_veteran');
    expect(meta.completedQuests).not.toContain('chrono_veteran');

    const toasts = questCompletionToasts(content, prevCompleted, meta.completedQuests);
    expect(toasts.some((t) => t.includes('First Dawn'))).toBe(false);
  });

  it('a metric that stays below every quest target queues no toast', () => {
    const w = new World(cfg());
    const meta = defaultMeta();
    const prevCompleted = meta.completedQuests;
    const after = applyRunResult(meta, reportWith({ outcome: 'defeat_core' }), w);
    expect(after.completedQuests).toHaveLength(0);

    const toasts = questCompletionToasts(content, prevCompleted, after.completedQuests);
    expect(toasts).toHaveLength(0);
  });

  it('toasts multiple quests completing on the same run end in authored order, not push order', () => {
    // One win short of both win_a_run (>=1) and plaguebringer_veteran (>=3):
    // a hand-built MetaState starting at 2 lifetime wins, neither completed
    // yet, so the 3rd win completes both in the same applyRunResult call.
    const w = new World(cfg());
    const meta: MetaState = { ...defaultMeta(), questProgress: { wins: 2 }, completedQuests: [] };
    const prevCompleted = meta.completedQuests;
    const after = applyRunResult(meta, reportWith({ outcome: 'victory', towersByKey: FIVE_TOWER_TYPES }), w);
    expect(after.completedQuests).toEqual(expect.arrayContaining(['win_a_run', 'plaguebringer_veteran']));

    const toasts = questCompletionToasts(content, prevCompleted, after.completedQuests);
    expect(toasts).toHaveLength(2);
    // data/quests.json's authored order: win_a_run precedes plaguebringer_veteran.
    expect(toasts[0]).toContain('First Dawn');
    expect(toasts[1]).toContain('Patient Zero');
  });

  it("sorts strictly by content.quests.quests' authored order even when nextCompleted lists them in the opposite order (code-reviewer finding: the test above alone doesn't distinguish this from just echoing applyRunResult's own push order, since applyRunResult happens to push in authored order too)", () => {
    // win_a_run is authored before plaguebringer_veteran in data/quests.json
    // (confirmed by the real-applyRunResult test above); feeding
    // questCompletionToasts a nextCompleted array in the *reverse* of that
    // order, bypassing applyRunResult entirely, proves the function sorts by
    // its own authored-order pass rather than trusting the array it's handed.
    const toasts = questCompletionToasts(content, [], ['plaguebringer_veteran', 'win_a_run']);
    expect(toasts).toHaveLength(2);
    expect(toasts[0]).toContain('First Dawn');
    expect(toasts[1]).toContain('Patient Zero');
  });
});
