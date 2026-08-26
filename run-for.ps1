# run-for.ps1 v3 — fixed-budget loop, feedback inbox, and parallel-lane support.
# Main lane:   .\run-for.ps1 -Hours 8 -Model opus
# Extra lane:  .\run-for.ps1 -Hours 8 -Model sonnet -Backlog BACKLOG-TUNER.md -Inbox D:\lidl_inbox-tuner
# (run each lane from its own worktree directory; never two loops in one folder)

param(
  [double]$Hours = 6,
  [string]$Model = "sonnet",
  [string]$Backlog = "BACKLOG.md",
  [string]$Inbox = "D:\lidl_inbox"
)

$env:CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS = "0"
New-Item -ItemType Directory -Force -Path $Inbox | Out-Null
New-Item -ItemType Directory -Force -Path "feedback" | Out-Null

$deadline = (Get-Date).AddHours($Hours)
$prompt = @"
Read CLAUDE.md, PROGRESS.md, and $Backlog. Your work queue for this session
is $Backlog and ONLY $Backlog.

If $Backlog has a Scope section, treat it as a hard file boundary: you may
read anything, but only create or edit paths it allows. If an item needs an
edit outside Scope, do not make it — record the need in the lane file's Log
and skip to the next item. Record progress in $Backlog's Log section if it
has one, otherwise in PROGRESS.md.

FIRST, process owner feedback: for each file in feedback/ not yet moved to
feedback/processed/, apply QUESTIONS.md verdict blocks exactly as written
(main lane only — lane sessions copy verdict files into their Log and leave
QUESTIONS.md alone), convert bug reports and new requirements into items in
$Backlog (bugs at the top; each fix starts with a failing regression test),
then move the message to feedback/processed/ and commit.

THEN execute exactly ONE item from $Backlog end to end: implement, npm test
green, qa-playtester pass, commit, update $Backlog. If fewer than 3
actionable items remain in $Backlog, run the backlog generation rule scoped
to this lane first. One item only, then stop.
"@

$i = 0
while ((Get-Date) -lt $deadline) {
  $i++
  $msgs = Get-ChildItem $Inbox -Filter *.md -File -ErrorAction SilentlyContinue
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
