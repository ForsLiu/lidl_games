/**
 * BACKLOG-QUALITY q18: CLAUDE.md architecture rule 2 promises "a run is
 * `RunConfig` + input log, and `RunConfig` carries a content hash so a
 * replay against edited `/data` fails loudly." Grepping the whole repo for
 * `contentHash`/`dataHash`/`configHash` finds no hits outside docs
 * (`tools/gate-audit.ts`'s own G2 note already flags this), and
 * `RunConfig` (src/sim/types.ts) has no such field at all.
 *
 * `loadContent()` (src/sim/content.ts) caches its parsed result in a
 * module-level singleton and every `World` defaults to that same singleton,
 * so "a replay against edited /data" is reproduced here by mutating the
 * live cached `Content` object in place — the in-memory equivalent of
 * editing a `/data/*.json` file between recording a run and replaying it —
 * rather than by touching any file on disk, which this lane's Scope forbids
 * regardless.
 */

import { describe, expect, it } from 'vitest';

import { cfg, makeInputLog, replay } from './helpers';
import { loadContent } from '../src/sim/content';

/* ------------------------------------------------------------ bug reports */

/**
 * Regression test for the `/src` defect this probe found, written to the
 * *fixed* behaviour and skipped: this lane may not edit `/src`, so skipping
 * is the only way to leave the suite green. Confirmed to fail today by
 * unskipping it (see BACKLOG-QUALITY.md Log for the live repro's readout).
 * Unskip with the fix. Full write-up: BACKLOG-QUALITY.md Log.
 */
describe('q18 — filed defect (unskip with the fix)', () => {
  it.skip('a replay against edited /data content fails loudly (architecture rule 2)', () => {
    const config = cfg({ seed: 1 });
    const log = makeInputLog(1, 1200);

    // Record.
    replay(config, log);

    // Edit /data in memory, standing in for an on-disk edit between record
    // and replay: loadContent()'s cache means every World in this process
    // shares this one object, so mutating it is exactly what a re-authored
    // enemies.json would look like to a replay running against the same
    // cached content a fresh process would load fresh.
    const content = loadContent();
    const husk = content.enemyByKey.get('husk');
    if (!husk) throw new Error('fixture assumption: enemies.json still has a "husk" entry');
    const originalHp = husk.hp;
    husk.hp = originalHp * 50;

    let threw = false;
    try {
      // Replay: same RunConfig, same input log, edited content.
      replay(config, log);
    } catch {
      threw = true;
    } finally {
      husk.hp = originalHp;
    }

    // Desired (architecture rule 2): a replay whose content no longer
    // matches what it was recorded against must fail loudly. Measured today:
    // it does not throw at all, and the two runs' end-state hashes silently
    // diverge instead (before='c8585c4c'/kills=2, after='4cf0f10d'/kills=0 at
    // this fixture) — the "fails loudly" guarantee has no implementation.
    expect(threw).toBe(true);
  });
});
