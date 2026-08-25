# run-for.ps1 — run Claude Code unattended for a fixed wall-clock budget.
# Usage:  .\run-for.ps1 -Hours 6            (default model: sonnet)
#         .\run-for.ps1 -Hours 8 -Model opus
# Each iteration is a fresh headless session that does exactly ONE backlog item,
# so context stays small and every iteration starts from the files (the memory).

param(
  [double]$Hours = 6,
  [string]$Model = "sonnet"
)

$deadline = (Get-Date).AddHours($Hours)
$prompt = @"
Read CLAUDE.md, PROGRESS.md, and BACKLOG.md. Follow the loop-mode contract in
CLAUDE.md: execute exactly ONE backlog item end to end (implement, npm test until
green, qa-playtester verification, commit, update PROGRESS.md and BACKLOG.md).
If fewer than 3 actionable items remain, first run the backlog generation rule,
append 5 new items, then execute the top one. One item only, then stop.
"@

$i = 0
while ((Get-Date) -lt $deadline) {
  $i++
  Write-Host ("=== iteration {0}  {1:HH:mm}  (deadline {2:HH:mm}) ===" -f $i, (Get-Date), $deadline)
  claude -p $prompt --model $Model --dangerously-skip-permissions
  if ($LASTEXITCODE -ne 0) {
    Write-Host "iteration $i exited with code $LASTEXITCODE - cooling down 2 min"
    Start-Sleep -Seconds 120
  }
}
Write-Host "Time budget of $Hours h reached after $i iterations."
