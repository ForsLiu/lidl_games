/**
 * Gate-coverage audit (BACKLOG-QUALITY q10): maps SPEC-FINAL §14's G1–G20
 * gates to the test files that actually exercise each one today, so a gate
 * can never quietly arrive — or quietly lose its only test — unnoticed.
 *
 * The gate list itself is parsed straight out of SPEC-FINAL.md's own §14
 * table, not a hand-copied list, the same way q2 parses the `Command`/
 * `Phase` unions out of `src/sim/types.ts` and q9 parses `policyNames()`
 * rather than hand-copying either: a gate SPEC-FINAL adds, renames or
 * removes is picked up automatically on the next run. What is *not*
 * automatic, and cannot be — most of this codebase's test files predate
 * SPEC-FINAL and were never given a G-number in their own text — is which
 * file covers which gate. `GATE_COVERAGE` and `KNOWN_HOLES` below are
 * curated by hand against the live suite (see BACKLOG-QUALITY.md's q10 log
 * for how each entry was checked), and a gate absent from both is
 * `UNTRACKED`: the state this tool exists to make impossible to ship
 * quietly.
 *
 * A curated map has its own failure mode, found the hard way (BACKLOG-QUALITY
 * q17, session 12): a `KNOWN_HOLES` reason can go stale the moment the lane
 * items it names as still-missing actually ship, and nothing re-checks it
 * until a human happens to reread the note. `staleHoleRefs` below is the
 * tripwire — see its own comment.
 *
 *   npx tsx tools/gate-audit.ts
 *   npx tsx tools/gate-audit.ts --json
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
export const SPEC_PATH = resolve(REPO_ROOT, 'SPEC-FINAL.md');

export interface Gate {
  id: string;
  text: string;
}

/** Parse every `| Gn | ... |` row out of SPEC-FINAL.md's §14 table. */
export function parseGates(specText: string): Gate[] {
  const section = specText.split(/^## 14\./m)[1]?.split(/^## 15\./m)[0];
  if (!section) {
    throw new Error('gate-audit: could not find SPEC-FINAL §14 between a "## 14." and a "## 15." heading');
  }
  const gates: Gate[] = [];
  const rowRe = /^\|\s*(G\d+)\s*\|\s*(.+?)\s*\|\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(section))) {
    gates.push({ id: m[1], text: m[2] });
  }
  return gates;
}

export type GateStatus = 'covered' | 'hole' | 'UNTRACKED';

export interface GateAuditRow extends Gate {
  status: GateStatus;
  files: string[];
  note?: string;
}

export interface CoverageEntry {
  files: string[];
  note?: string;
}

/**
 * Which test files (repo-relative) exercise each gate, curated by hand
 * against the live suite at the time this was written (2026-08-26). Gates
 * whose subsystem is not built yet (per PROGRESS.md's P-order audit) live in
 * `KNOWN_HOLES` instead — see its own comment.
 */
export const GATE_COVERAGE: Record<string, CoverageEntry> = {
  G3: {
    files: ['tests/p2a-vs-wielding.test.ts'],
    note: "p2a's live describe is '§6.1 VS wielding formula (G3)' — the inheritance formula landed at P2 (lane/quality merge re-derivation; this was a KNOWN_HOLES hole while P2 was unbuilt).",
  },
  G6: {
    files: ['tests/p3a-run-shape.test.ts', 'tests/p3b-multi-summon.test.ts'],
    note: "p3a covers G6's TD×3→VS pattern half, p3b the multi-summon ≤3 stacking half (P3 landed; re-derived at the lane/quality merge).",
  },
  G7: {
    files: ['tests/p1a-sealing.test.ts', 'tests/p1b-seal-winrate.test.ts'],
    note: "p1a covers the sealed-Core structure-chewing clauses; p1b's live describe is 'G7 clause 3: sealed-build win rate stays inside the open-build band at T2' (re-derived at the lane/quality merge).",
  },
  G9: {
    files: ['tests/p6b-swordsman.test.ts', 'tests/p6c-plaguebringer.test.ts'],
    note: "p6b's 'G9 — Dash during a Circle Slash charge merges into one attack' and p6c's 'G9 second half — Spreading Plague transfers unfinished DoT' are both live (P6 landed; re-derived at the lane/quality merge).",
  },
  G10: {
    files: ['tests/p6d-nine-classes.test.ts'],
    note: "p6d's 'G10 — Archer, measured off the authored numbers' is live (re-derived at the lane/quality merge).",
  },
  G11: {
    files: ['tests/p6d-nine-classes.test.ts'],
    note: "p6d's 'G11 — Stormcaller chain multiplier stays under x3.6' is live (re-derived at the lane/quality merge).",
  },
  G12: {
    files: [
      'tests/fb015-equipment.test.ts',
      'tests/c7-no-orbs.test.ts',
      'tests/p7c-reward-pipeline.test.ts',
      'tests/fb023-remove-stash-relics.test.ts',
      'tests/p7d-retire-economy.test.ts',
    ],
    note: "fb015 covers the equipment clause (1 item per fully cleared TD wave) and c7-no-orbs covers 'orbs " +
      "nowhere'; p7c adds the gate's last clause, 'M VS waves -> M skill points' (§8.2) — a VS wave credits only " +
      'when it ends by its own means (block timer or the final boss kill), never by a defeat, and the report/meta ' +
      "total is exercised end to end. p7d extends 'orbs nowhere' to relics (retired outright — fb023's file, " +
      "widened past its original UI-only scope, is the source+DOM scan) and to Ember (p7d-retire-economy's own " +
      'scan) — the whole superseded meta economy this gate names is gone, not merely hidden.',
  },
  G21: {
    files: [
      'tests/p-core-a-selection.test.ts',
      'tests/p-core-b-effects.test.ts',
      'tests/p-core-c-plant.test.ts',
      'tests/p-core-d-corpse.test.ts',
      'tests/p-core-e-time-decay.test.ts',
    ],
    note: 'p-core-a covers Core-in-RunConfig + hashing; b–e cover each Core\'s §5.5 numbers, including the Time decay ring table (p-core-e) and the Corpse execute-and-restore worked example (p-core-d).',
  },
  G22: { files: ['tests/p-core-f-gates.test.ts'] },
  G23: { files: ['tests/p-core-f-gates.test.ts'] },
  G2: {
    files: ['tests/g2-determinism.test.ts', 'tests/p6a-class-framework.test.ts', 'tests/pacer.test.ts'],
    note:
      "p9f: renamed from tests/a11-determinism.test.ts (SPEC-V2's A11) to match SPEC-FINAL's gate numbering, " +
      "folding in the gate's three named additions. g2-determinism.test.ts covers the 100-seed replay hash " +
      "match, class actives + a mid-run equip_item swap, and auto-pick level-ups; " +
      "p6a-class-framework.test.ts's 'replay-hash determinism with Active1/Active2 and the auto basic attack " +
      "in the log' describe (f004-class-framework.test.ts's equivalent coverage before p6f deleted that file, " +
      "Q38) covers actives from a second angle. tests/pacer.test.ts covers fast-forward: a run stepped in " +
      "pacer-sized batches at every shipped SPEEDS value hashes the same as one stepped evenly, across several " +
      "seeds (BACKLOG-QUALITY q19, session 15) — confirmed structural, not incidental, since Pacer.plan() only " +
      "picks how many times the loop calls the same Run.step(), never a longer tick. g2-determinism.test.ts " +
      "adds the third: a Tuner-edited-content case end to end (loadContent() fed the same substitute-document " +
      "shape saveTunerFile's dry-run uses, per src/devserver/tunerSave.ts), asserting a record/replay pair " +
      "against the edited content matches and a replay against un-edited content throws per architecture rule " +
      '2 (p9a built the underlying RunConfig.contentHash mechanism; BACKLOG-QUALITY q18\'s repro is separately ' +
      'green in tests/q18-content-hash-replay.test.ts). All three of G2\'s named additions now have a live case.',
  },
  G4: {
    files: ['tests/c3-armor.test.ts', 'tests/m19c-damage-types.test.ts', 'tests/p10g-armor-shred-liveness.test.ts'],
    note:
      'p10g: the first two files pinned the shred arithmetic and its wiring by calling shredArmor/applyDot ' +
      'directly, never through a bot playing a real build — no registered sweep policy either carries ' +
      'ember_brazier (hybrid) or reliably places it (maxbuild/sealed). p10g-armor-shred-liveness.test.ts closes ' +
      'that gap: it runs tools/a5probe.ts\'s ember-heavy/ember-mix BuildSpecs (already in the G13 pool) through ' +
      'runBuild and asserts the new maxArmorShred/maxArmorShredAct2 samples are non-zero, proving the cone\'s ' +
      'burn actually shreds a live enemy\'s armour in both Act I (tower) and Act II (wielded).',
  },
  G5: { files: ['tests/c4-stacking.test.ts'] },
  G1: {
    files: ['tests/p10d-run-length.test.ts'],
    note:
      'p10d replaces the retired tests/a1-run-length.test.ts (a median-based measurement under the old V2 ' +
      'Day/Night cycle, the opposite metric from G1\'s "means/pass-rates, never medians") with a live test ' +
      "against the real §1.1 shape: 24 seeds, the hybrid bot, cycles: 6. p10d/p10k closed the boss-fight-side " +
      "budget as far as it would go without pinning the scripted bot's win rate at 100% (G14 conflict), " +
      "landing 36.63 min / 92% wins and leaving the mean-band assertion honestly it.skip'd. p10l closed the " +
      "rest with a TD-side lever neither prior session had isolated: data/waves.json's buildPhaseSeconds " +
      "20->15. The per-wave build timer only gates when enemies spawn, not how much gold the bot has to " +
      "spend for the default core both gated tests use (gold comes solely from kill bounty and the fixed " +
      "wave-clear bonus; the Time core's goldPerSecond step is a real exception, BACKLOG b042, but neither " +
      "gated test selects it), so it was never actually coupled to tests/a4-single-type.test.ts's solo-tower " +
      "TD economy the way p10d's combined " +
      "vsWaveSeconds+buildPhaseSeconds attempt suggested — verified empirically (all seven towers still 5/5 " +
      "T1 / 0/5 T3 at 15s). vsWaveSeconds itself stays untouched (§17 owner-review list; also the field p10c " +
      "found genuinely coupled via the VS-kills -> XP -> Power-boon -> powerMul pipeline). Measured: mean " +
      "35.29 min, 22/24 wins (92%, same split as the p10k baseline) — inside the 30-36 min band with margin " +
      "on both sides. All three assertions are live and green. Gate G1 is green in full.",
  },
  G13: {
    files: ['tests/a4-single-type.test.ts', 'tests/p10c-weapon-share.test.ts'],
    note:
      'p10c (SPEC-FINAL §16 re-price) retuned data/waves.json + data/towers.json and un-skipped ' +
      "a4-single-type.test.ts's solo-viability clause: all seven towers now measure live at 5/5 T1 / 0/5 T3. " +
      "The '35% damage share' half's own test, the retired a5-weapon-share.test.ts (SPEC-FINAL §6.1 reconcile), " +
      'is replaced by p10c-weapon-share.test.ts against the rebuilt tools/a5probe.ts (real §1.1 run shape, not ' +
      'the old single-cycle minute-8 snapshot) — its pool-size and spread assertions are live and green, but ' +
      "its 35%-cap assertion is it.skip'd: two rounds of data-only retuning measured frost_obelisk down to " +
      '46.0% (from 51.1%) without breaking a4, short of the cap for reasons the test file\'s own header records ' +
      'as structural (an engine-side gap between omnidirectional and directional VS-wielded attacks), filed as ' +
      'BACKLOG p10j. Listed `covered` on the same partial-but-live-measured basis as G17 above, not `hole` — ' +
      'a8-sundering-head-start.test.ts is still entirely retired and contributes nothing.',
  },
  G14: { files: ['tests/boss.test.ts'] },
  G16: { files: ['tests/c8-dev-profile.test.ts', 'tests/t4-god-mode.test.ts'] },
  G18: {
    files: [
      'tests/b10-death-flow.test.ts',
      'tests/b003-stash-ux.test.ts',
      'tests/q3-save-fuzz.test.ts',
      'tests/q8-save-roundtrip.test.ts',
      'tests/t6c-save-migration.test.ts',
    ],
  },
  G20: {
    files: [
      'tests/m20a-upgrade-tracks.test.ts',
      'tests/m20b-owner-towers.test.ts',
      'tests/m20c-roster-tracks.test.ts',
      'tests/light-build.test.ts',
    ],
  },
  G19: {
    files: ['tests/p10f-g19-liveness.test.ts'],
    note:
      "The prior citation (tests/a8-sundering-head-start.test.ts) was entirely describe.skip'd and, even live, " +
      "never measured strategy mix or multi-summon usage — see the old KNOWN_HOLES entry this replaces. " +
      "p10f measures G19 over the same winning-build pool G13 uses (tools/a5probe.ts's topTen), widened with a " +
      "new G19_BUILDS array covering the sealed and multi-summon arms BUILDS alone never exercises: BUILDS is " +
      "entirely open-maze (every entry defaults to strategy 'open'), so topTen(collect(seeds)) alone can only " +
      "ever answer 'open'. Found while wiring the rush arm: no registered bot policy actually stacked a wave " +
      "before this item — rushWaves only fires from act1_build (skip-the-idle-build-timer), while " +
      "applyCommand's 'call' case only increments World.stackDepth from act1_wave (already fighting) — so " +
      "kite/rush's rushWaves flag was cover, not coverage. New BuilderOptions.stackWaves (src/bots/policies.ts, " +
      "default off, so kite/rush's own pinned numbers are untouched) actually calls into an in-progress fight. " +
      "All three assertions are live and green: the top-10-by-survival pool includes an open build, a sealed " +
      "build (mirrors the G7/p1b 'sealed' policy), and a rush build whose BuildResult.maxStackDepth — sampled " +
      "from the real World.stackDepth every tick, not inferred from config — is nonzero.",
  },
  G17: {
    files: [
      'tests/a10-performance.test.ts',
      'tests/q12-soak.test.ts',
      'tests/q13-perf-ratio.test.ts',
      'tests/p10e-perf-budget.test.ts',
    ],
    note:
      "All three clauses are now live. G17's second clause, '350 enemies + all weapons ≥60fps benchmark', is a " +
      "concrete non-⚖ number, and tests/a10-performance.test.ts backs it — it runs the identical worstCaseWorld " +
      "(all 8 weapons, filled to the spawn director's alive cap) and asserts perTick against a concrete " +
      "SIM_BUDGET_MS derived from 16.7ms/60fps, the fps floor itself, on this host. tests/q12-soak.test.ts covers " +
      "the third clause verbatim (50 seeded full runs, mixed policies, zero exceptions/NaN). The first clause — " +
      "'sim budget per simulated minute (host-independent) ⚖' — was the P10-deferred remainder " +
      "(SPEC-FINAL §16: 're-baseline perf as G17's per-sim-minute budget') and is closed at p10e: " +
      "tests/p10e-perf-budget.test.ts extends tests/q13-perf-ratio.test.ts's proven ratio mechanism (host-" +
      "independent, stable across measurement granularity) from a single static worst-case tick to a real " +
      "`hybrid`-bot run played end to end on the actual §1.1 shape, and pins a ⚖ ceiling (~4x the measured " +
      "median, same headroom factor q13's own ceiling uses) as the chosen per-simulated-minute budget. It also " +
      "retires tests/a10-performance.test.ts's wall-clock 'full run under 5 seconds' test (`.skip`-ed in place, " +
      "not deleted), which drove SPEC A10's original `--cycles 1` single-pass shape rather than the real one and " +
      'was measured failing on an unrelated stale pin (`wavesCleared`) before this item touched it.',
  },
};

/**
 * Gates with no live test today, and why. Every reason names the PROGRESS.md
 * P-phase that has to land before a test could even be written, so this is a
 * floor to re-check as phases complete (per CLAUDE.md's "a deferral is a
 * measurement with an expiry date"), not a permanent exemption.
 */
export const KNOWN_HOLES: Record<string, string> = {
  G8: 'All 12 §4 classes now exist (p6b–p6d), but the scripted-kit-bot win-rate / top-damage-diversity ' +
    "measurement G8 actually asks for is p6e's, which has not landed. p6a-class-framework.test.ts's live " +
    'replay-hash block tests the Active-skill Command plumbing, not a win-rate.',
  G15: 'The Tuner is not built (P9); there is nothing to round-trip yet.',
};

export function auditGates(
  gates: Gate[],
  coverage: Record<string, CoverageEntry> = GATE_COVERAGE,
  holes: Record<string, string> = KNOWN_HOLES,
): GateAuditRow[] {
  return gates.map((g) => {
    const c = coverage[g.id];
    if (c) return { ...g, status: 'covered', files: c.files, note: c.note };
    const h = holes[g.id];
    if (h !== undefined) return { ...g, status: 'hole', files: [], note: h };
    return { ...g, status: 'UNTRACKED', files: [] };
  });
}

/** Every `files` entry in `GATE_COVERAGE` that does not exist on disk, as `"Gn: path"`. */
export function missingCoverageFiles(coverage: Record<string, CoverageEntry> = GATE_COVERAGE): string[] {
  const missing: string[] = [];
  for (const [id, entry] of Object.entries(coverage)) {
    for (const f of entry.files) {
      if (!existsSync(resolve(REPO_ROOT, f))) missing.push(`${id}: ${f}`);
    }
  }
  return missing;
}

/**
 * A test file has at least one top-level `describe(...)` that is not
 * `describe.skip(...)`. Column-anchored deliberately: every file in this
 * suite writes its top-level `describe`s unindented, so this does not need
 * to parse the AST to tell "this file still has live assertions in it" from
 * "this file is entirely retired" — the exact distinction G1 and G19 got
 * wrong (a `covered` gate backed only by a fully `describe.skip`'d file is
 * the same UNTRACKED failure this tool exists to catch, wearing a different
 * label — found by qa-playtester, not by this tool, which is why this
 * function now exists).
 */
export function hasLiveTopLevelDescribe(absPath: string): boolean {
  const text = readFileSync(absPath, 'utf8');
  return /^describe\(/m.test(text);
}

/** Every `covered` gate whose every cited file is entirely `describe.skip`'d, as `"Gn: reason"`. */
export function entirelyRetiredCoverage(coverage: Record<string, CoverageEntry> = GATE_COVERAGE): string[] {
  const flagged: string[] = [];
  for (const [id, entry] of Object.entries(coverage)) {
    const live = entry.files.some((f) => hasLiveTopLevelDescribe(resolve(REPO_ROOT, f)));
    if (!live) flagged.push(`${id}: none of [${entry.files.join(', ')}] has a live top-level describe block`);
  }
  return flagged;
}

export const BACKLOG_PATH = resolve(REPO_ROOT, 'BACKLOG-QUALITY.md');

/** `{ q12: true, q16: false, ... }` from BACKLOG-QUALITY.md's own `- [x] (q12) ...` / `- [ ] (q16) ...` lines. */
export function backlogCheckboxes(text: string): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  const re = /^- \[([ xX])\] \((q\d+)\)/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) map[m[2]] = m[1].toLowerCase() === 'x';
  return map;
}

/**
 * G17's own hole entry named q12/q13 as "the in-Scope equivalents" of the
 * work that would close it, and sat unrevisited for three sessions after both
 * actually shipped — a live instance of CLAUDE.md's "a deferral is a
 * measurement with an expiry date" (BACKLOG-QUALITY q17, session 12). This is
 * the tripwire so the next such note does not need a human QA pass to notice:
 * any `KNOWN_HOLES` reason that names a lane backlog item (`qNN`) which
 * BACKLOG-QUALITY.md's own checkboxes now mark done is stale and worth a
 * re-look, whether or not the gate turns out to still be a real hole once
 * checked.
 *
 * The citation regex deliberately excludes a `qNN` immediately followed by a
 * hyphen (`q(\d+)\b(?!-)`), because this lane's own test files are named
 * `qNN-*.test.ts` (`q3-save-fuzz.test.ts`, `q12-soak.test.ts`, ...) and a
 * hole note citing one of those *filenames* — a legitimate, common pattern in
 * this file's own notes (see G12's `c7-no-orbs.test.ts`) — is not the same
 * claim as citing the backlog item id as "the fix that hasn't landed." Code
 * review (q17, session 12) flagged the bare form as a foreseeable false
 * positive wired directly to the CLI's exit code; a bare "q99" or "q99
 * landing" citation still matches, only the filename shape is excluded.
 */
export function staleHoleRefs(
  holes: Record<string, string> = KNOWN_HOLES,
  backlogText: string = readFileSync(BACKLOG_PATH, 'utf8'),
): string[] {
  const done = backlogCheckboxes(backlogText);
  const flagged: string[] = [];
  for (const [id, note] of Object.entries(holes)) {
    const cited = new Set([...note.matchAll(/\bq(\d+)\b(?!-)/g)].map((m) => `q${m[1]}`));
    for (const qid of cited) {
      if (done[qid]) flagged.push(`${id}: cites ${qid}, which BACKLOG-QUALITY.md now marks done ([x])`);
    }
  }
  return flagged;
}

/* ------------------------------------------------------------------- CLI */

function main(argv: string[]): void {
  const json = argv.includes('--json');

  let rows: GateAuditRow[];
  let stale: string[];
  try {
    const specText = readFileSync(SPEC_PATH, 'utf8');
    const gates = parseGates(specText);
    rows = auditGates(gates);
    stale = staleHoleRefs();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (json) {
      console.log(JSON.stringify({ error: message }));
    } else {
      console.error(`gate-audit: ${message.replace(/\s+/g, ' ').trim()}`);
    }
    process.exitCode = 1;
    return;
  }

  if (json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  console.log(`gate audit — ${rows.length} gates parsed from SPEC-FINAL.md §14`);
  const idW = Math.max(...rows.map((r) => r.id.length), 'id'.length) + 2;
  const statusW = Math.max(...rows.map((r) => r.status.length), 'status'.length) + 2;
  console.log('id'.padEnd(idW) + 'status'.padEnd(statusW) + 'files / reason');
  for (const r of rows) {
    const detail = r.status === 'covered' ? r.files.join(', ') : (r.note ?? '');
    console.log(r.id.padEnd(idW) + r.status.padEnd(statusW) + detail);
  }

  const untracked = rows.filter((r) => r.status === 'UNTRACKED');
  if (untracked.length > 0) {
    console.log(`\nUNTRACKED gates (no test, no recorded hole): ${untracked.map((r) => r.id).join(', ')}`);
    process.exitCode = 1;
  }

  if (stale.length > 0) {
    console.log(`\nSTALE hole notes (cite a lane item BACKLOG-QUALITY.md now marks done):`);
    for (const s of stale) console.log(`  ${s}`);
    process.exitCode = 1;
  }
}

const invokedDirectly = process.argv[1]?.replace(/\\/g, '/').endsWith('tools/gate-audit.ts');
if (invokedDirectly) main(process.argv.slice(2));
