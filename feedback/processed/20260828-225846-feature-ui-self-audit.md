[feature] UI self-audit tool: fixed-scene screenshots + measurable checks

What: a dev-mode audit that renders a fixed set of deterministic scenes to
PNG files and runs objective UI checks over them.
- Scenes (seeded, same every run): Hub, mid-TD wave with selection panel
  open, 350-enemy VS chaos with all damage types active, level-up offer
  screen, character panel, Codex/Tuner page, defeat Results.
- Output: PNGs written to /audit (one per scene, named), plus report.json
  and a console pass/fail summary.
- Checks: text contrast ratio >= 4.5:1 against its actual background;
  font sizes >= 12 px at 1080p; HUD element overlap detection; anything
  interactive rendered partially off-screen; color distance between all
  damage-type pairs in BOTH palettes (normal and accessible) above a
  stated threshold; character-vs-background contrast in the VS chaos
  scene.
- Runs via `npm run ui-audit` (dev only, excluded from prod build);
  headless where possible, otherwise driven through the dev server with a
  fixed viewport (1920x1080).
Spec ref: SPEC-FINAL §11 tooling; QUALITY.md Beta bar (accessibility).
Done when: `npm run ui-audit` writes all scene PNGs + report.json;
failures list the offending element by name; the check suite itself has
tests (a deliberately low-contrast fixture fails); README line in /audit
explains each scene.
Priority: normal
