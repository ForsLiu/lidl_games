[feature] CI: GitHub Actions - fast tier on every push, full suite nightly

What: add .github/workflows/ci.yml:
- on push and pull_request (all branches incl. lane/*): checkout, Node
  22, npm ci, `npm run test:fast`, `npm run build`; upload the /audit
  PNGs if the ui-audit runs.
- nightly (cron 03:00) on master: full `npm test` + `npm run status`,
  commit STATUS.md back if changed.
- concurrency group per branch (cancel superseded runs); 30 min timeout
  for fast, 3 h for nightly; worker cap env from the cpu-cap item.
Also add a short docs/CI.md and a README badge.
Spec ref: QUALITY.md standing rules.
Done when: workflow file committed and validated by `act` or by a dry
parse; documented; a red fast-tier run blocks nothing locally but is
visible on GitHub.
Priority: normal
