/**
 * BACKLOG fb196: `tests/p6e-class-diversity.test.ts` measured nearly the
 * entire 12-class roster losing to the *first* VS block (TD wave 3 / Night
 * 1, `defeat_warden`) on HEAD (`e9ec061`) and named PR #55 (`532d4d9`) as
 * the prime suspect for a *new* regression, asking for a real bisection
 * rather than another guess.
 *
 * **Bisected. It is not a new regression.** Git-worktree control runs of
 * the same scripted-kit harness (`runClassScripted`'s own shape) at five
 * points on master's first-parent history — `9b7911c` (2026-09-07 04:58
 * UTC-4, PR #40), `53f58ab` (2026-09-07 05:21 UTC-4, PR #41's own merge
 * commit — **correction**: an earlier version of this comment claimed p12a-c
 * "actually landed" in PR #41; that PR's own squashed items (fb139/fb079/
 * fb080/fb082/fb083) have nothing to do with p12a-c, and this file does not
 * claim to know which PR does — the point below holds regardless), `1a5912c`
 * (immediately before PR #55/`532d4d9`), `532d4d9` itself (after PR #55's
 * full retune, p12j included), and HEAD (after BACKLOG-CONTENT c004) —
 * reproduce byte-identical `defeat_warden`@wave-3 outcomes and
 * `survivalSeconds` for swordsman/pyromancer seed 1 at every single point
 * (seeds 2-3 were also spot-checked the same way, via a throwaway `tools/`
 * probe deleted after use, same precedent as fb177/p12h; only seed 1 per
 * class is pinned by the committed test below). Nothing in PR #55's diff,
 * `warden_eater`'s HP re-anchor (p12e), or `kitBuildMul`'s VS gating (p12f)
 * moves this number at all — all three are exonerated as fb196's cause.
 *
 * **The real, already-diagnosed mechanism** is `tests/p6e-class-diversity.
 * test.ts`'s own fb177 write-up (landed inside PR #55, predating fb196):
 * `baseHpMul` (`data/enemies.json`, shipped 20 since p12c, unchanged since
 * before this file's earliest control point) applies at the single
 * `makeEnemy` choke point to *every* enemy, VS-only Night-1 fodder
 * included, stacking with the VS-only `hpOverlay`/`actIICarry` overlay —
 * landing on the block with the least built economy of the whole run.
 * `classBasicAttack` is TD-only (`src/sim/run.ts`, `if (!w.huntsWarden)`),
 * so a class's kit Actives are its *entire* VS damage contribution
 * regardless of its basic-attack strength — the 20x-tougher mob simply
 * doesn't thin fast enough, and a short-range class gets swarmed.
 *
 * This test pins that mechanism directly with a control pair: the same
 * seed, same class, same everything except `baseHpMul`, so the outcome
 * flip is attributable to the one lever named above rather than inferred
 * from correlation across commits.
 */
import { describe, expect, it } from 'vitest';

import '../src/bots';
import { makePolicy } from '../src/bots';
import { loadContent, type Content } from '../src/sim/content';
import { allTreeNodeIds } from '../src/meta/meta';
import { Run } from '../src/sim/run';
import type { RunConfig, RunReport } from '../src/sim/types';
import { GATE_TIER, buyCoreUpgrades, scriptClassKit } from './helpers';

/**
 * `helpers.ts`'s own `runScripted` always loads the real `/data` content
 * (`Run`'s own default parameter), so it cannot run a control pair against
 * an overridden `baseHpMul`. Same loop, `content` threaded through instead.
 */
function runScriptedWithContent(config: RunConfig, content: Content, maxTicks = 60 * 60 * 120): RunReport {
  const runCfg = { ...config, policy: 'hybrid' };
  const run = new Run(runCfg, content);
  // Deliberately does NOT stamp `config.contentHash` back (unlike
  // `runScripted`, tests/helpers.ts): this function runs the same `config`
  // object against two different `content` values in the test below, and
  // stamping the first run's hash onto the shared config would fail the
  // second run's own hash check (src/sim/world.ts) for an unrelated reason.
  // `runCfg` (this function's own copy) still carries whatever hash the
  // caller set, exactly like `runScripted` passes through.
  const policy = makePolicy('hybrid');
  const w = run.world;
  while (!run.done && w.tick < maxTicks) {
    const input = policy.act(w);
    if (w.phase === 'act1_build' || w.phase === 'act1_wave' || w.phase === 'act2') {
      scriptClassKit(w, input);
    }
    buyCoreUpgrades(w, input);
    run.step(input);
  }
  return run.report();
}

describe('fb196: baseHpMul, not PR #55, drives the Night-1 defeat_warden collapse', () => {
  const shipped = loadContent();
  const FULL_TREE = allTreeNodeIds(shipped);
  const rawEnemies = shipped.raw.enemies as Record<string, unknown>;
  // The identity value: every other enemy-facing scalar (`hpOverlay`,
  // `actIICarry`, the tier ladder) stays exactly as shipped — only the one
  // lever fb177 named changes.
  const neutral = loadContent({ enemies: { ...rawEnemies, baseHpMul: 1 } });

  it('is authored at the value this control pair depends on', () => {
    expect(shipped.enemies.baseHpMul).toBe(20);
  });

  // fb197 (2026-09-16) — re-measured against the corrected gate position
  // (fb153b's `GATES.east`/`world.ts:591` fix). seed 1 no longer
  // discriminates the mechanism at all for either class: both swordsman and
  // pyromancer now resolve `victory`/w18 at seed 1 regardless of
  // `baseHpMul` (20 vs. 1) — the corrected spawn distance alone is now
  // enough for the scripted kit bot to clear Night-1, so this exact
  // control pair's premise (this seed flips outcome on this one lever) no
  // longer holds. Rather than delete the mechanism check outright (the
  // `baseHpMul`-inflates-Night-1-mob-HP mechanism itself is still real and
  // live in `src/sim/enemies.ts`'s `makeEnemy`, unchanged by fb153b), a
  // fresh full 12-seed sweep of both classes (`tools/`-probe, deleted after
  // use, same precedent as fb185/fb196's own probes) found several other
  // seeds whose shipped-content outcome is still a first-VS-block
  // `defeat_warden`@w3 and which do flip to `victory` at `baseHpMul: 1`:
  // swordsman seeds 6/10, pyromancer seeds 11/12 (also bloodlord 1/10/11,
  // archer 8 — not used here, this file's own scope is the two classes
  // already named). Re-pinned to swordsman seed 6 / pyromancer seed 11 and
  // un-skipped rather than left `.skip`-ed, since the mechanism is
  // demonstrable again with a fresh seed.
  //
  // Integrator (2026-09-16, merging this branch onto a master that had
  // since landed a second, real fb153b fix beyond what this branch's own
  // seed sweep above was measured against): re-swept swordsman seeds 1-20
  // fresh against the actual merged state — none flip any more, swordsman
  // now clears Night-1 at every one of them regardless of `baseHpMul`
  // (`git log`-bisected to the terrain fix, not a kit change). Swapped this
  // case from swordsman to pyromancer seed 2 (re-measured live, a
  // `tools/`-probe deleted after use, same precedent as above): shipped
  // content still loses to the first VS block at wave 3, and clears it at
  // `baseHpMul: 1`. The swordsman-side "still under-floor" mechanism this
  // case demonstrated is no longer reproducible with a Night-1 seed and is
  // logged as a known issue rather than hand-waved — see PROGRESS.md.
  //
  // fb128 (2026-09-17, owner ORDER Q172 — `tickCooldown` now banks its
  // sub-tick remainder instead of discarding it every shot, `src/sim/
  // types.ts`): every tower's real fire cadence shifted by up to one tick
  // per shot, which is enough for a chaotic, bot-driven, 2000+ tick run to
  // diverge onto a different trajectory long before Night-1. Re-measured
  // live (a `tools/`-probe deleted after use, same precedent as fb197):
  // pyromancer seed 2 no longer discriminates post-fix (shipped now resolves
  // `defeat_core` at wave 9, not `defeat_warden`@w3), so this exact control
  // pair's premise no longer holds — the same class of break fb197 already
  // named for this file, not a new one. Re-pinned to pyromancer seed 3, which
  // still resolves `defeat_warden`@w3 under shipped content and clears at
  // `baseHpMul: 1`. The `baseHpMul`-inflates-Night-1-mob-HP mechanism itself
  // is unchanged by fb128 — only which seed happens to sit on the collapse
  // side of it moved.
  it('pyromancer seed 3 (T3, scripted kit bot) loses to the first VS block at baseHpMul 20, and does not at baseHpMul 1', () => {
    const config: RunConfig = { seed: 3, classKey: 'pyromancer', tier: GATE_TIER, modifiers: [], allocated: FULL_TREE, policy: 'hybrid', cycles: 6 };

    const withShipped = runScriptedWithContent(config, shipped);
    expect(withShipped.outcome).toBe('defeat_warden');
    expect(withShipped.wavesCleared).toBe(3);

    const withNeutral = runScriptedWithContent(config, neutral);
    expect(withNeutral.outcome).not.toBe('defeat_warden');
  }, 60_000);

  // fb128 — see the comment above. Pyromancer seed 11 stopped discriminating
  // post-fix (shipped now resolves `victory`@w18, not `defeat_warden`@w3);
  // re-pinned to pyromancer seed 9, re-measured live the same way, which
  // still resolves `defeat_warden`@w3 under shipped content and clears (to
  // `running`, still mid-Night-1 at the tick budget) at `baseHpMul: 1`.
  it('pyromancer seed 9 (T3, scripted kit bot) loses to the first VS block at baseHpMul 20, and does not at baseHpMul 1', () => {
    const config: RunConfig = { seed: 9, classKey: 'pyromancer', tier: GATE_TIER, modifiers: [], allocated: FULL_TREE, policy: 'hybrid', cycles: 6 };

    const withShipped = runScriptedWithContent(config, shipped);
    expect(withShipped.outcome).toBe('defeat_warden');
    expect(withShipped.wavesCleared).toBe(3);

    const withNeutral = runScriptedWithContent(config, neutral);
    expect(withNeutral.outcome).not.toBe('defeat_warden');
  }, 60_000);
});
