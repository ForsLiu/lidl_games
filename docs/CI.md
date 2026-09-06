# CI — what runs, and what to do when it is red

[![CI](https://github.com/ForsLiu/lidl_games/actions/workflows/ci.yml/badge.svg)](https://github.com/ForsLiu/lidl_games/actions/workflows/ci.yml)

> The badge lives here rather than in a README because the repository has none.
> If one is ever added, that line is what belongs at the top of it.

fb140, from owner feedback `feature-ci-workflow`. The workflow is
[`.github/workflows/ci.yml`](../.github/workflows/ci.yml).

## What runs

| Job | Trigger | Budget | What it runs |
|---|---|---|---|
| `fast` | every push and pull request, all branches (`lane/*` included) | 30 min | `npm run build` (which is `tsc --noEmit` + `vite build`) then `npm run test:fast`, capped at two worker threads |
| `nightly` | 03:00 UTC on `master`, or `workflow_dispatch` on the dispatched ref | 3 h | the full `npm test`, then `npm run status`, committing `STATUS.md` only when the suite **passed** and the file moved |

A same-repo pull request therefore runs `fast` twice — once for the branch push
and once for the PR — because the item asks for both triggers and the
concurrency group includes the event name so they cannot cancel each other.
Narrowing `push` to `[master, 'lane/**']` would get the same coverage once, at
the cost of not measuring an ordinary feature branch until it opens a PR.

`npm test` is `vitest run && vitest run --config vitest.perf.config.ts`, so a
red unit run short-circuits and the perf tier is not measured that night — read
"full suite red" as "unit tier red, perf tier unknown" until the first line is
green.

The split is CLAUDE.md's own tiering, not a template: `test:fast` is the tier a
contributor runs per backlog item — the whole suite minus the >60 s sim, soak
and fuzz files listed in `vitest.fast.config.ts`'s exclude list — and the full
suite takes 40+ minutes, which is a nightly's job, not a push's.

Concurrency is per workflow/event/ref with `cancel-in-progress`, so pushing
twice to a branch leaves one run measuring the current head. The nightly is
exempt: cancelling a 3-hour measurement halfway is worse than letting two
overlap.

The fast tier runs at `--poolOptions.threads.maxThreads=2`. This repo has a
documented load-sensitive flake family (backlog `fb087`: the four Playwright UI
suites plus `q45`/`q49`/`q52`, `q15`, `q13` — all green in isolation, red under
contention), and `STONEWAKE_REQUIRE_BROWSER` below turns those four from
self-skipping into must-run. A CI whose first run is expected red is not a
signal, so the cap is set rather than deferred; `fb087` owns making the family
robust, not the cap itself. See QUESTIONS Q185.

`STONEWAKE_REQUIRE_BROWSER=1` is set workflow-wide. The four Playwright UI
suites *skip themselves* when no Chromium is installed (QUESTIONS Q178) — right
for a developer checkout, wrong for CI, where a silent skip is coverage loss.
The workflow installs Chromium only (`npx playwright install --with-deps
chromium`), matching what `tests/helpers/browser.ts` launches.

## What the nightly's push needs

The STATUS.md commit uses the default `GITHUB_TOKEN` with `contents: write` on
that job alone (the workflow is `contents: read` otherwise). It needs two things
that live outside this file, and the first failure will otherwise be an opaque
403:

- **Settings → Actions → General → Workflow permissions** must allow read *and*
  write for `GITHUB_TOKEN`.
- **`master` must not have a branch protection rule** that blocks the token, or
  the token needs an explicit bypass.

The push rebases onto `master` and retries up to three times, because the
checkout is up to three hours old by the time it runs and a commit landing in
between would otherwise fail the nightly for a reason unrelated to the suite.

## When `fast` is red

1. **Read which file failed before rerunning.** Most of what used to be a
   "documented flake family" turned out to be real, and was fixed by fb140's
   own first CI run (2026-09-06): `b028` was a genuine POSIX bug in
   `killProcessTree` (it signalled the process *group*, which cannot reach a
   descendant that detached into its own), `q41` was a fixture that did not copy
   a module the tool under test imports, `p10e` was a timing-stability
   assertion running under contention and now runs single-threaded under
   `vitest.perf.config.ts`, and the four Playwright suites were racing for
   Vite's default port and being reloaded mid-assertion by its file watcher.
   What is left is `q15` and `q45`, both of which pass on the GitHub runner and
   fail only in some sandboxes on tsx worker-thread module resolution. So: a
   failure is yours until you have shown otherwise on another commit.
2. **Reproduce locally with the same command**, not with the whole suite:
   `npm run test:fast`, or the single file. The tier is deliberately the same
   command locally and in CI so a green local run means something.
3. **A red `fast` blocks nothing mechanically** — there is no required-check
   configuration here — but the loop contract already says an item is not done
   until its targeted tests and `test:fast` are green, so a red push is an
   unfinished item, not a CI problem.

## When `nightly` is red

The full suite owns the tests `test:fast` cannot afford: the multi-minute sim
soaks, the fuzzers, and the balance gates. A failure there is usually one of:

- **A balance gate moved.** Read `STATUS.md`'s balance snapshot in the same run
  and the gate's own header comment, which records what it last measured and
  when. Gates are re-banded by the item that owns them (the p12 arc), never
  nudged to go green — see CLAUDE.md's measurement rules.
- **A censored run.** A seed sitting at the 45-minute tick cap is scored a loss
  by some suites and excluded by others; the cap itself is backlog item `p12e`.
- **A real regression the fast tier cannot see**, which is the whole reason this
  job exists — `tests/boss.test.ts` alone has caught two.

## Not wired here, on purpose

- **No `/audit` PNG upload.** The item asks for one "if the ui-audit runs" —
  nothing in CI runs `npm run ui-audit`, and `audit/` is gitignored, so an
  upload step would be a permanent silent no-op. Add the step together with the
  run, not before it.
- **No SHA-pinned actions.** `@v4` floats deliberately: this repo has no
  Dependabot to unpin it again, and the actions used are first-party.
- **No Playwright browser cache.** Chromium is re-downloaded per run (~1 min).
  Worth adding with `PLAYWRIGHT_BROWSERS_PATH` + `actions/cache` if the fast
  tier's wall clock starts to matter.
- **No coverage gate, no lint job.** There is no linter in `package.json`;
  adding one is a separate item with its own diff, not a CI-file decision.
- **No matrix.** One runner, one Node version: the *deterministic* numbers
  (sim outcomes, balance gates, end-state hashes) are then comparable night to
  night. The wall-clock ones are not — `ubuntu-latest` is a fresh shared VM
  each night, which is exactly why `tools/perf-ratio.ts` reports a ratio
  against calibration work rather than milliseconds.
- **No `act` validation step.** `act` is not available in this environment;
  `tests/fb140-ci-workflow.test.ts` checks the workflow's structure instead and
  says plainly what it does not check (GitHub's schema — only GitHub can).
