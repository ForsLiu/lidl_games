# run-until-done.ps1 — loop until SPEC-FINAL is fully built, with a safety cap.
# Usage:  .\run-until-done.ps1                (Opus, 48h safety cap)
#         .\run-until-done.ps1 -MaxHours 72

param(
  [string]$Model = "opus",
  [double]$MaxHours = 48,
  [string]$Backlog = "BACKLOG.md",
  [string]$Inbox = "D:\lidl_inbox"
)

$env:CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS = "0"
New-Item -ItemType Directory -Force -Path $Inbox | Out-Null
New-Item -ItemType Directory -Force -Path "feedback" | Out-Null

$cap = (Get-Date).AddHours($MaxHours)
$prompt = @"
Read CLAUDE.md, PROGRESS.md, and $Backlog.

FIRST, completion check: if every item in $Backlog is done, SPEC-FINAL has
no unimplemented requirement (walk §1-§14 against the code), and every gate
G1-G20 passes in npm test, then write DONE.md summarizing the final state,
commit it, and stop. Do not generate new items in that case.

SECOND, process owner feedback: for each file in feedback/ not yet in
feedback/processed/: apply verdict blocks to QUESTIONS.md exactly as
written, convert bugs to top-of-queue items (failing regression test
first), convert requirements to items referencing SPEC-FINAL sections, move
the message to feedback/processed/, commit.

THEN execute exactly ONE backlog item end to end: implement, npm test
green, qa-playtester pass, commit, update PROGRESS.md and $Backlog. If
fewer than 3 actionable items remain, generate first - but only items that
close a SPEC-FINAL gap or a red G-gate, never inventions beyond the spec.
One item only, then stop.
"@

$i = 0
while (-not (Test-Path "DONE.md") -and (Get-Date) -lt $cap) {
  $i++
  $msgs = Get-ChildItem $Inbox -Filter *.md -File -ErrorAction SilentlyContinue
  foreach ($m in $msgs) {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    Move-Item $m.FullName ("feedback\{0}-{1}" -f $stamp, $m.Name)
    Write-Host (">>> ingested feedback: {0}" -f $m.Name) -ForegroundColor Cyan
  }
  Write-Host ("=== iteration {0}  {1:HH:mm}  (cap {2}) ===" -f $i, (Get-Date), $cap)
  claude -p $prompt --model $Model --dangerously-skip-permissions
  if ($LASTEXITCODE -ne 0) {
    Write-Host "iteration $i exited $LASTEXITCODE - cooling down 10 min (usage limits resume automatically)"
    Start-Sleep -Seconds 600
  }
}
if (Test-Path "DONE.md") { Write-Host "GAME COMPLETE per SPEC-FINAL after $i iterations. Read DONE.md." -ForegroundColor Green }
else { Write-Host "Safety cap of $MaxHours h reached after $i iterations. Relaunch to continue." }
