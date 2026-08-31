import { defineConfig, mergeConfig } from 'vitest/config';
import base from './vitest.config';

/**
 * Fast tier (fb017): the full suite minus every file measured over ~60 s on
 * the reference Windows host, so `npm run test:fast` completes in under 5
 * minutes and can run on every loop item. The excluded files still run under
 * the FULL `npm test`, which is reserved for phase (P) completion, lane
 * merges, and the final DONE.md check (CLAUDE.md working rule 2).
 *
 * A suite that grows past ~60 s moves here with a comment naming why, rather
 * than silently fattening the fast tier.
 */
export default mergeConfig(
  base,
  defineConfig({
    test: {
      exclude: [
        // Inherited from the base config (vitest merges exclude lists, but
        // restate the intent): a10 runs under vitest.perf.config.ts only.
        'tests/a10-performance.test.ts',
        // ~1 h: 11 classes × multi-seed full-run diversity measurement (G8).
        'tests/p6e-class-diversity.test.ts',
        // Multi-seed full-run gate measurements over the Core roster.
        'tests/p-core-f-gates.test.ts',
        // Long-horizon soak sims.
        'tests/q12-soak.test.ts',
        // Spawns nested full vitest reruns (q9/q12/q15 as controls); also the
        // documented Windows runaway-subprocess hang (b028).
        'tests/q14-mutation-smoke.test.ts',
        // 20-seed × cycles:6 full boss runs.
        'tests/boss.test.ts',
        // Long mandatory-mechanism live sims (multi-seed full runs).
        'tests/a3-movement-mandatory.test.ts',
        'tests/a9-economy.test.ts',
        // Measured standalone 2026-08-29: a4 116 s, p1b 121 s, q2 122 s,
        // q9 184 s. (a1/a2/a7/a11/q13/q15/q18/q26 were measured under 60 s
        // the same session and stay IN the fast tier.)
        'tests/a4-single-type.test.ts',
        'tests/p1b-seal-winrate.test.ts',
        'tests/q2-input-fuzz.test.ts',
        'tests/q9-phase-coverage.test.ts',
        // p10c: 12 builds x 5 seeds x cycles:6 full VS-combat runs (not
        // invulnerable, unlike a4-single-type above) — slower than a4.
        'tests/p10c-weapon-share.test.ts',
        // p10d: 24 seeds x one full cycles:6 hybrid run each (TD + VS + boss
        // fight, not invulnerable) — G1's run-length gate.
        'tests/p10d-run-length.test.ts',
        // p10f: p10c's pool (12 builds) plus G19_BUILDS (4 more) x 5 seeds x
        // cycles:6 full VS-combat runs — G19's liveness gate.
        'tests/p10f-g19-liveness.test.ts',
      ],
    },
  }),
);
