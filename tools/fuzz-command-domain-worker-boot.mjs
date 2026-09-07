/**
 * Loader bootstrap for `fuzz-command-domain-worker.ts` (q15/q45).
 *
 * **Why this file exists.** The worker used to be started directly, with
 * `execArgv: ['--import', 'tsx/esm']` doing the TypeScript loading. That
 * registers enough to *transform* the entry file but not enough to resolve
 * that file's own extensionless imports: inside a `worker_threads.Worker`
 * the first bare specifier throws `Cannot find module`, so
 * `tools/fuzz-command-domain-worker.ts`'s `./fuzz-command-domain` died at
 * worker startup — taking out q15's whole suite at collection and q45's
 * `fuzz-command-domain` case with it.
 *
 * Reproduced minimally before fixing (a worker importing a two-deep
 * extensionless chain): it fails identically under `--import tsx/esm` *and*
 * `--import tsx`, so the loader entry point was never the problem. Adding a
 * `.ts` extension fixes exactly one hop and then the *next* extensionless
 * import fails — `src/sim/run` was next — so extension-annotating the graph
 * is not a fix, it is the whole `src/sim` import tree.
 *
 * Registering the hooks *in the worker thread itself* is the fix: after
 * `register()`, resolution behaves as it does on the main thread and the
 * transitive extensionless graph loads. The real worker is then pulled in by
 * dynamic `import()`, which has to happen after `register()` — a static
 * import would be hoisted above it and defeat the point. `workerData` and
 * `parentPort` are thread state, not module state, so the dynamically
 * imported worker still sees both.
 *
 * `.mjs`, not `.ts`, because this is the file that installs the TypeScript
 * loader and so cannot itself need it. (`tools/gen-tree.mjs` is the same
 * shape, and q47's tools census already filters non-`.ts` files, so this one
 * is invisible to it for the same reason.)
 */
import { register } from 'tsx/esm/api';

register();

await import('./fuzz-command-domain-worker.ts');
