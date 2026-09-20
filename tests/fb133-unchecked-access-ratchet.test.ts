/**
 * fb133 (`tsconfig.json` is `strict` without `noUncheckedIndexedAccess`,
 * BACKLOG.md, refs BACKLOG-TERRAIN.md fb064t): flipping the flag directly
 * surfaced 1806 `error TS` diagnostics across 236 files — too large for one
 * loop-contract item or a single scheduled routine's budget. Fixing "with
 * real guards (not `!`)" at that scale needs deliberate per-file follow-up,
 * so this is the ratchet that makes that follow-up safe and visible instead
 * of a single all-or-nothing flag flip: `tsconfig.unchecked.json` (same
 * compiler options as `tsconfig.json` plus the flag) is the ground truth,
 * and this test's `KNOWN_UNCHECKED_ACCESS_FILES` is the current honest list
 * of files that still fail under it.
 *
 * Two-sided by design, matching `tests/fb118-backlog-id-uniqueness.test.ts`'s
 * own `KNOWN_PREEXISTING_COLLISIONS` precedent:
 *   - a file with a fresh error that is NOT on the list fails the test — no
 *     new unguarded indexed access can land silently.
 *   - a file on the list that no longer errors ALSO fails the test — a fix
 *     must remove its own entry here, so the list can only shrink on
 *     purpose, never drift stale.
 *
 * 18 files (23 sites) were fixed with real guards in the commit that added
 * this test, then 8 more (`src/sim/damagetypes.ts`, `src/sim/terrain/
 * generate.ts`, `src/sim/terrain/overlay.ts`, `src/sim/tiers.ts`,
 * `src/ui/audit-hook.ts`, `src/ui/codex.ts`, `src/ui/dps-panel.ts`,
 * `src/ui/tuner-fields.ts`) in a follow-up session (`??` defaults,
 * pre-checked guards before a lookup, `.charAt(0)` instead of `s[0]`), then a
 * third session fixed 7 (`src/sim/rng.ts`, `src/ui/character-panel.ts`,
 * `src/render/canvas.ts`, `src/sim/classes.ts`, `src/render/theme.ts`,
 * `src/sim/sundering.ts`, `src/sim/terrain/config.ts`) and, independently,
 * a fourth session fixed `src/render/colorblind-sim.ts` — see PROGRESS.md/
 * BACKLOG.md fb133 for the lists. The remaining 202 are exactly
 * the flag's current honest floor; shrink this list as they're fixed, do
 * not add to it without a reason logged in BACKLOG.md.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const KNOWN_UNCHECKED_ACCESS_FILES: readonly string[] = [
  'src/sim/enemies.ts',
  'src/sim/grid.ts',
  'src/sim/run.ts',
  'src/sim/terrain/analyze.ts',
  'src/sim/world.ts',
  'tests/a1-run-length.test.ts',
  'tests/b030-autopick-pause-toggle.test.ts',
  'tests/b076-midrun-equip-effect.test.ts',
  'tests/c4-stacking.test.ts',
  'tests/character-panel.test.ts',
  'tests/class-active1-potency.test.ts',
  'tests/class-active2-cdr.test.ts',
  'tests/class-area-stat.test.ts',
  'tests/class-board.test.ts',
  'tests/class-deeper-draw.test.ts',
  'tests/class-descriptions.test.ts',
  'tests/class-kit-fingerprint.test.ts',
  'tests/class-line-bonus.test.ts',
  'tests/class-p6d-agreement.ts',
  'tests/class-passive-liveness.test.ts',
  'tests/class-passive-magnitudes.test.ts',
  'tests/class-poison-barrel-mechanic.test.ts',
  'tests/class-roster-size.test.ts',
  'tests/class-spec-numbers.test.ts',
  'tests/class-tower-passive-liveness.test.ts',
  'tests/codex.test.ts',
  'tests/content-complete.test.ts',
  'tests/dps-panel.test.ts',
  'tests/equip-effect-behaviour.test.ts',
  'tests/equip-hasequipment-roster.test.ts',
  'tests/equip-spec-ledger.test.ts',
  'tests/equip-spec-ledger.ts',
  'tests/equip-spec-numbers.test.ts',
  'tests/f003-leak-coupling.test.ts',
  'tests/fb005-damage-colors.test.ts',
  'tests/fb006-dot-hp-indicator.test.ts',
  'tests/fb013-timelord.test.ts',
  'tests/fb015-equipment.test.ts',
  'tests/fb016-vfx-registry.test.ts',
  'tests/fb022-info-surfacing.test.ts',
  'tests/fb027-selection-panels.test.ts',
  'tests/fb031-gem-accelerate.test.ts',
  'tests/fb037-vs-panel.test.ts',
  'tests/fb038-status.test.ts',
  'tests/fb044-tuner-per-field.test.ts',
  'tests/fb047-sweep-tier-modifiers.test.ts',
  'tests/fb081-linehit-broadphase.test.ts',
  'tests/fb085-enablers.test.ts',
  'tests/fb118-backlog-id-uniqueness.test.ts',
  'tests/fb130-core-placement-wiring.test.ts',
  'tests/fb152-dot-tick-cadence.test.ts',
  'tests/fb154-vs-gate-spawns.test.ts',
  'tests/fb155-enemy-attack-registry.test.ts',
  'tests/fb158-enemy-attack-indicators.test.ts',
  'tests/fb159-damage-font-scaling.test.ts',
  'tests/fb164-prescale-prose.test.ts',
  'tests/g2-determinism.test.ts',
  'tests/grid.test.ts',
  'tests/m19c-damage-types.test.ts',
  'tests/m20b-owner-towers.test.ts',
  'tests/m20c-roster-tracks.test.ts',
  'tests/meta.test.ts',
  'tests/p-core-b-effects.test.ts',
  'tests/p-core-c-plant.test.ts',
  'tests/p-core-e-time-decay.test.ts',
  'tests/p12a-kit-power.test.ts',
  'tests/p12b-tier-ladder.test.ts',
  'tests/p1a-sealing.test.ts',
  'tests/p2a-vs-wielding.test.ts',
  'tests/p2b-wielded-fire.test.ts',
  'tests/p2c-vs-specials.test.ts',
  'tests/p2d-weapon-lineage.test.ts',
  'tests/p3b-multi-summon.test.ts',
  'tests/p5c-milestone-specials.test.ts',
  'tests/p6a-class-framework.test.ts',
  'tests/p6b-swordsman.test.ts',
  'tests/p6c-plaguebringer.test.ts',
  'tests/p6d-nine-classes.test.ts',
  'tests/p6e-class-diversity.test.ts',
  'tests/p9b-codex-hub.test.ts',
  'tests/p9c-tuner-hub-flag.test.ts',
  'tests/p9c-tuner-save.test.ts',
  'tests/p9e-levelup-idle.test.ts',
  'tests/p9h-armour-floor-display.test.ts',
  'tests/practice.test.ts',
  'tests/progress.test.ts',
  'tests/q120-order1-taunt.test.ts',
  'tests/q13-perf-ratio.test.ts',
  'tests/q13-perf-sensitivity.test.ts',
  'tests/q15-command-domain-fuzz.test.ts',
  'tests/q2-input-fuzz.test.ts',
  'tests/q21-weapon-boundary-fuzz.test.ts',
  'tests/q28-cli-error-handling.test.ts',
  'tests/q3-save-fuzz.test.ts',
  'tests/q7-data-fuzz.test.ts',
  'tests/q8-save-roundtrip.test.ts',
  'tests/q9-phase-coverage.test.ts',
  'tests/render-fb055-basic-attack-vfx.test.ts',
  'tests/render-fb060-dot-tick-numbers.test.ts',
  'tests/render-fb067-dot-number-budget.test.ts',
  'tests/render-fb068-dot-density-hysteresis.test.ts',
  'tests/render-fb069-dot-accum-stale-cleanup.test.ts',
  'tests/render-fb070-dot-toggle-off-stale-cleanup.test.ts',
  'tests/render-fb096-combo-indicator.test.ts',
  'tests/render-fb098-colorblind-audit.test.ts',
  'tests/render-fb116-terrain-rendering.test.ts',
  'tests/t1-range-indicators.test.ts',
  'tests/t2-selection.test.ts',
  'tests/terrain-anchor-quality.test.ts',
  'tests/terrain-approach.test.ts',
  'tests/terrain-character.test.ts',
  'tests/terrain-config-tiles.test.ts',
  'tests/terrain-core-placement.test.ts',
  'tests/terrain-cost-ledger.ts',
  'tests/terrain-cost-retry-ratio.test.ts',
  'tests/terrain-cost.test.ts',
  'tests/terrain-describe.test.ts',
  'tests/terrain-four-gates.test.ts',
  'tests/terrain-gate-legality.test.ts',
  'tests/terrain-gate-open.test.ts',
  'tests/terrain-gates-dump.test.ts',
  'tests/terrain-generation.test.ts',
  'tests/terrain-grid-gates.test.ts',
  'tests/terrain-grid.test.ts',
  'tests/terrain-headroom.test.ts',
  'tests/terrain-high-contest.test.ts',
  'tests/terrain-high-ground.test.ts',
  'tests/terrain-legality.test.ts',
  'tests/terrain-modifier-gate-jitter.test.ts',
  'tests/terrain-variety.test.ts',
  'tests/terrain-verify.test.ts',
  'tests/tower-info.test.ts',
  'tests/ui-audit-checks.test.ts',
  'tests/ui-fb058-class-select.test.ts',
  'tests/ui-fb065-resize-listener.test.ts',
  'tests/ui-fb082-overlay-geometry.test.ts',
  'tests/ui-fb091-crash-log.test.ts',
  'tests/ui-fb093-ultrawide-narrow-audit.test.ts',
  'tests/ui-fb094-screenshot-export.test.ts',
  'tests/ui-fb096-save-slots.test.ts',
  'tests/ui-fb097-frame-capture.test.ts',
  'tests/ui-fb097-zip-archive.test.ts',
  'tests/ui-fb098-tower-vfx.test.ts',
  'tests/ui-fb105-codex-search.test.ts',
  'tests/ui-fb108-active-sentences-all-classes.test.ts',
  'tests/ui-fb115-fb173-area-scaled-effects.test.ts',
  'tests/ui-fb117-core-select.test.ts',
  'tests/ui-fb142-dpr-change.test.ts',
  'tests/ui-fb146-dash-width-units-guard.test.ts',
  'tests/ui-fb148-dash-range-live.test.ts',
  'tests/ui-fb149-falloff-wording.test.ts',
  'tests/ui-fb174-measured-falloff-guard.test.ts',
  'tests/ui-fb175-single-falloff-clause.test.ts',
  'tests/ui-input.test.ts',
  'tests/x001-dot-stack-caps.test.ts',
  'tools/a5probe.ts',
  'tools/cli-crash-coverage.ts',
  'tools/fuzz-command-domain.ts',
  'tools/fuzz-data.ts',
  'tools/fuzz-save.ts',
  'tools/fuzz-weapon-boundary.ts',
  'tools/gate-audit.ts',
  'tools/handoff-metrics.ts',
  'tools/invariants.ts',
  'tools/m20d-swarm.ts',
  'tools/perf-ratio.ts',
  'tools/sim.ts',
  'tools/soak.ts',
  'tools/status.ts',
  'tools/sweep.ts',
  'tools/ui-audit.ts',
];

// qa-playtester (fb133): under heavy host contention a slow `tsc` subprocess
// can hit `timeout` and get SIGTERM-killed mid-run; execFileSync's catch
// still yields whatever partial stdout had already been flushed, which is
// NOT a real diagnostic result and must not be read as one (it previously
// reported already-fixed files as fresh regressions). A killed/timed-out
// attempt retries — bounded, not a real result — rather than being
// silently treated as ground truth.
const TSC_ATTEMPT_TIMEOUT_MS = 90_000;
const TSC_MAX_ATTEMPTS = 3;

function runUncheckedTsc(attempt = 1): string {
  try {
    return execFileSync('npx', ['tsc', '--noEmit', '-p', 'tsconfig.unchecked.json'], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: TSC_ATTEMPT_TIMEOUT_MS,
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; killed?: boolean; signal?: string | null };
    if (e.killed || e.signal) {
      if (attempt < TSC_MAX_ATTEMPTS) return runUncheckedTsc(attempt + 1);
      throw new Error(
        `tsc -p tsconfig.unchecked.json was killed (signal ${e.signal ?? 'unknown'}) on every attempt ` +
          `(${TSC_MAX_ATTEMPTS}), likely host contention starving it past ${TSC_ATTEMPT_TIMEOUT_MS}ms each ` +
          `time — its partial output is not a real diagnostic result. Rerun this test in isolation.`,
      );
    }
    return `${e.stdout ?? ''}${e.stderr ?? ''}`;
  }
}

describe('fb133: noUncheckedIndexedAccess ratchet', () => {
  it(
    'the known-offender list exactly matches what tsconfig.unchecked.json still fails on',
    () => {
      const out = runUncheckedTsc();
      const actual = new Set<string>();
      for (const line of out.split('\n')) {
        const m = /^([A-Za-z0-9_./-]+\.ts)\(\d+,\d+\)/.exec(line);
        const file = m?.[1];
        if (file) actual.add(file);
      }
      const known = new Set(KNOWN_UNCHECKED_ACCESS_FILES);

      const newOffenders = [...actual].filter((f) => !known.has(f)).sort();
      const stale = [...known].filter((f) => !actual.has(f)).sort();

      expect(
        newOffenders,
        `new file(s) with unguarded indexed access under noUncheckedIndexedAccess — add real guards ` +
          `(?? defaults, explicit undefined checks; not '!') rather than adding these to the allowlist:\n` +
          newOffenders.join('\n'),
      ).toEqual([]);
      expect(
        stale,
        `file(s) fixed but still listed in KNOWN_UNCHECKED_ACCESS_FILES — remove their entries so the ` +
          `ratchet only shrinks on purpose:\n` +
          stale.join('\n'),
      ).toEqual([]);
    },
    // Up to TSC_MAX_ATTEMPTS retries at TSC_ATTEMPT_TIMEOUT_MS each (fb133 qa-playtester finding), plus buffer.
    320_000,
  );
});
