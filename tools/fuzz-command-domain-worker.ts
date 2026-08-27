/**
 * `Worker` entry point for `tools/fuzz-command-domain.ts` (lane item q15).
 *
 * Kept deliberately tiny: all the actual probe logic lives in
 * `fuzz-command-domain.ts` so it can be unit-tested directly (in-process,
 * where that's safe) as well as run inside this isolated worker (where a
 * combination that genuinely hangs — `dev`'s `xp` op given `Infinity` — needs
 * to be forcibly killable from the parent without taking the parent down
 * with it).
 */
import { parentPort, workerData } from 'node:worker_threads';

import { runAliasProbe, runSingleProbe, type Family } from './fuzz-command-domain';

if (!parentPort) throw new Error('fuzz-command-domain-worker: must run as a worker_threads Worker');

const data = workerData as { mode: 'field'; fieldKey: string; family: Family } | { mode: 'alias'; which: 'upgrade' | 'sell' };

if (data.mode === 'field') {
  parentPort.postMessage(runSingleProbe(data.fieldKey, data.family));
} else {
  parentPort.postMessage(runAliasProbe(data.which));
}
