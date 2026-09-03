# UI self-audit (fb018)

`npm run ui-audit` boots the real dev server and a headless Chromium at a
fixed 1920x1080 viewport, drives the real running game through the seven
scenes below via the dev-only bridge in `src/ui/audit-hook.ts`
(`window.__stonewakeAudit`, gated on `isDevBuild()` the same way
`src/meta/devprofile.ts` gates the dev profile), and writes each scene to a
PNG here plus a combined `report.json`. The PNGs and `report.json` are
generated output (gitignored); this file is checked in.

Every check runs against the actual composited screenshot pixels (via
`pngjs`) and real DOM geometry (via Playwright's `page.evaluate`), never just
declared CSS colors — some panels (the pause/level-up/results modal, the
character panel) sit over the canvas behind a semi-transparent, blurred
background, so the color a player actually sees is a composite, not any
single declared value. (The DPS and VS wielded-attacks panels dock to the
stage's edge instead, fb051 — no blur, nothing composited underneath.) See
`tools/audit/checks.ts` for the check math and `tools/ui-audit.ts` for the
orchestration.

## The seven scenes

- **`hub.png`** — the between-runs Hub (class/Core/tier select, the account
  header). The game's front door and the highest-traffic screen outside a run.
- **`codex.png`** — the Codex's read-only table view (`src/ui/codex.ts`),
  mounted directly as a full-viewport overlay rather than through the Hub's
  nav, because `p9b` (BACKLOG.md) — the Hub nav entry point for it — is not
  yet wired; the Codex renderer itself is real, tested code
  (`tests/codex.test.ts`). There is no Tuner to capture yet either (`p9c` is
  unbuilt) — see `QUESTIONS.md` for both judgment calls.
- **`mid-td-wave-selection.png`** — Act I, a wave in progress, with a built
  tower selected so its stats panel is showing. Exercises the tower bar, the
  stats/progress HUD, and the selection info panel all on screen together.
- **`vs-chaos.png`** — Act II (VS), ~350 live enemies at once with all six
  persistent damage-type effects (Bleeding, Poison, Toxic, Burning, Frost,
  Frozen) forced onto distinct enemies, plus a direct Warden-vs-background
  contrast sample. Normal and Electric are instantaneous hit-effect damage
  types (no lingering per-enemy state, `data/damagetypes.json`'s `effect:
  "hit"` rows) so they have nothing to force persistently for a screenshot;
  their palette entries are still covered by the color-distance check below.
  This is the worst-case density scene for HUD legibility and overlap.
- **`levelup-offer.png`** — the level-up offer screen, reached with auto-pick
  off (fb012) so the screen actually shows instead of resolving itself.
- **`character-panel.png`** — the Character stats panel (fb004), open over a
  live run: every final stat's class x tree x relic x boon breakdown.
- **`defeat-results.png`** — the Results screen after a Core defeat, reached
  by zeroing Core HP and letting the ordinary defeat slow-mo beat
  (`beginDefeat`/`resolveDefeat`, `src/sim/run.ts`) run its own course.

## Checks

- Text contrast (WCAG 2.1 AA, >= 4.5:1) for every visible text-bearing
  element, foreground from `getComputedStyle`, background sampled from the
  decoded screenshot.
- Font size >= 12px for the same elements.
- HUD chrome overlap (tower bar, stats bar, progress bar, toast, and
  whichever optional panel is open) — full-screen modal overlays
  (`.sw-modal`) are excluded, since covering the stage is their job.
- Off-screen interactive elements (buttons, inputs, selects, links) against
  the 1920x1080 viewport.
- Color distance between every damage-type/status pair, in both the normal
  and colorblind-safe palettes (`data/damagetypes.json`), run once against
  the data directly rather than per scene.
- Warden-vs-background pixel contrast, in the VS chaos scene only.
