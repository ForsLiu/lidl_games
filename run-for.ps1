# run-for.ps1 v2 — fixed-budget unattended loop with a live feedback inbox.
# Usage:  .\run-for.ps1 -Hours 8 -Model opus
#
# FEEDBACK WHILE IT RUNS: save .md files into D:\lidl_inbox at any time
# (bug reports, QUESTIONS.md verdict blocks, new requirements). They are
# ingested at the next iteration boundary and processed before new work.

param(
  [double]$Hours = 6,
  [string]$Model = "sonnet"
)

$env:CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS = "0"

$inbox = "D:\lidl_inbox"
New-Item -ItemType Directory -Force -Path $inbox | Out-Null
New-Item -ItemType Directory -Force -Path "feedback" | Out-Null

$deadline = (Get-Date).AddHours($Hours)
$prompt = @"
Read CLAUDE.md, PROGRESS.md, and BACKLOG.md.

FIRST, process owner feedback: look in feedback/ for message files not yet
moved to feedback/processed/. For each, in order: apply any QUESTIONS.md
verdict block exactly as written; convert bug reports into backlog items at
the TOP of the queue (each fix starts with a failing regression test);
convert new requirements into backlog items referencing the relevant spec
section, or log to QUESTIONS.md if they conflict with the specs. Then move
the message to feedback/processed/ and commit the ingestion.

THEN follow the loop-mode contract: execute exactly ONE backlog item end to
end (implement, npm test green, qa-playtester pass, commit, update
PROGRESS.md and BACKLOG.md). If fewer than 3 actionable items remain, run
the backlog generation rule first. One item only, then stop.
"@

$i = 0
while ((Get-Date) -lt $deadline) {
  $i++
  $msgs = Get-ChildItem $inbox -Filter *.md -File -ErrorAction SilentlyContinue
  foreach ($m in $msgs) {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    Move-Item $m.FullName ("feedback\{0}-{1}" -f $stamp, $m.Name)
    Write-Host (">>> ingested feedback: {0}" -f $m.Name) -ForegroundColor Cyan
  }
  Write-Host ("=== iteration {0}  {1:HH:mm}  (deadline {2:HH:mm}) ===" -f $i, (Get-Date), $deadline)
  claude -p $prompt --model $Model --dangerously-skip-permissions
  if ($LASTEXITCODE -ne 0) {
    Write-Host "iteration $i exited $LASTEXITCODE - cooling down 2 min"
    Start-Sleep -Seconds 120
  }
}
Write-Host "Time budget of $Hours h reached after $i iterations."
