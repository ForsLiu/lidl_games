# run-all.ps1 - ONE-WINDOW ORCHESTRATOR.
# Runs the main loop, starts/relaunches lanes that have work (each in its own
# window), merges lanes whose queues are empty, routes inbox files by prefix
# (ui-*, content-*, terrain-* go to that lane; everything else to main).
# Usage:  .\run-all.ps1              (48h cap, sonnet everywhere)
#         .\run-all.ps1 -MaxHours 72 -LaneModel opus

param(
  [double]$MaxHours = 48,
  [string]$MainModel = "sonnet",
  [string]$LaneModel = "sonnet",
  [double]$LaneHours = 6
)

$env:CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS = "0"
$root  = "D:\lidl_games"
$inbox = "D:\lidl_inbox"
$lanes = @{
  content = @{ dir="D:\lidl_games-content"; branch="lane/content"; backlog="BACKLOG-CONTENT.md"; inbox="D:\lidl_inbox-content" }
  terrain = @{ dir="D:\lidl_games-terrain"; branch="lane/terrain"; backlog="BACKLOG-TERRAIN.md"; inbox="D:\lidl_inbox-terrain" }
  ui      = @{ dir="D:\lidl_games-ui";      branch="lane/ui";      backlog="BACKLOG-UI.md";      inbox="D:\lidl_inbox-ui" }
}
$procs = @{}
Set-Location $root
New-Item -ItemType Directory -Force -Path $inbox, "feedback" | Out-Null
foreach ($l in $lanes.Values) { New-Item -ItemType Directory -Force -Path $l.inbox | Out-Null }

function OpenCount($file) {
  if (-not (Test-Path $file)) { return 0 }
  return (Select-String -Path $file -Pattern "- \[ \]" | Measure-Object).Count
}
function LaneRunning($name) { return ($procs.ContainsKey($name) -and -not $procs[$name].HasExited) }
function StartLane($name) {
  $l = $lanes[$name]
  if (-not (Test-Path $l.dir)) { Write-Host "lane $name: worktree missing, skipping"; return }
  $args = "-NoExit -ExecutionPolicy Bypass -File `"$($l.dir)\run-for.ps1`" -Hours $LaneHours -Model $LaneModel -Backlog $($l.backlog) -Inbox $($l.inbox)"
  $procs[$name] = Start-Process powershell -ArgumentList $args -WorkingDirectory $l.dir -PassThru
  Write-Host ">>> lane $name started (pid $($procs[$name].Id))" -ForegroundColor Green
}
function Unmerged($branch) {
  $out = git -C $root log --oneline ("master.." + $branch) 2>$null
  return ($out | Measure-Object -Line).Lines -gt 0
}
function MergeLane($name) {
  $l = $lanes[$name]
  Write-Host ">>> merging $($l.branch) into master" -ForegroundColor Yellow
  git -C $root merge $l.branch --no-edit 2>&1 | Out-Null
  $p = "Finish merging $($l.branch) into master: resolve any conflicts (main wins on shared sim core; lane additions kept), remove leftover <<<<<<< markers, read $($l.backlog)'s Log and file out-of-scope needs as BACKLOG.md items, run npm run test:fast, then commit the merge. Then check $($l.backlog): if it has unchecked items that now belong in main, note them in BACKLOG.md."
  claude -p $p --model $MainModel --dangerously-skip-permissions
}
function RouteInbox() {
  Get-ChildItem $inbox -Filter *.md -File -ErrorAction SilentlyContinue | ForEach-Object {
    $n = $_.Name.ToLower()
    $target = $null
    foreach ($k in $lanes.Keys) { if ($n.StartsWith("$k-")) { $target = $lanes[$k].inbox } }
    if ($target) { Move-Item $_.FullName (Join-Path $target $_.Name); Write-Host ">>> routed $($_.Name) -> $target" -ForegroundColor Cyan }
  }
}

$mainPrompt = @"
Read CLAUDE.md, PROGRESS.md, and BACKLOG.md.
FIRST, completion check: if every BACKLOG item is done, SPEC-FINAL has no
unimplemented requirement, and the FULL npm test suite is green including
every G gate, write DONE.md, commit, and stop.
SECOND, process owner feedback in feedback/ (verdict blocks applied
exactly; bugs to top of queue with failing regression tests first;
requirements referencing SPEC-FINAL sections; move to feedback/processed/;
commit). Items that belong to a lane by scope go into that lane's backlog
file instead of BACKLOG.md.
THEN execute exactly ONE BACKLOG.md item end to end per CLAUDE.md's test
policy (targeted + npm run test:fast; never the full suite inside an
ordinary item), qa-playtester pass, commit, update PROGRESS.md and
BACKLOG.md. If fewer than 3 actionable items remain, generate first, only
for SPEC-FINAL gaps or red gates. One item, then stop.
"@

$cap = (Get-Date).AddHours($MaxHours)
$i = 0
while (-not (Test-Path "$root\DONE.md") -and (Get-Date) -lt $cap) {
  $i++
  RouteInbox
  Get-ChildItem $inbox -Filter *.md -File -ErrorAction SilentlyContinue | ForEach-Object {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    Move-Item $_.FullName ("$root\feedback\{0}-{1}" -f $stamp, $_.Name)
    Write-Host ">>> main ingested $($_.Name)" -ForegroundColor Cyan
  }
  foreach ($name in $lanes.Keys) {
    $l = $lanes[$name]
    $open = OpenCount (Join-Path $l.dir $l.backlog)
    if (-not (LaneRunning $name)) {
      if ($open -gt 0) { StartLane $name }
      elseif (Unmerged $l.branch) { MergeLane $name }
    }
  }
  Write-Host ("=== main iteration {0}  {1:HH:mm}  (cap {2}) ===" -f $i, (Get-Date), $cap)
  claude -p $mainPrompt --model $MainModel --dangerously-skip-permissions
  if ($LASTEXITCODE -ne 0) { Write-Host "main exited $LASTEXITCODE - cooling 10 min"; Start-Sleep -Seconds 600 }
}
if (Test-Path "$root\DONE.md") { Write-Host "GAME COMPLETE per SPEC-FINAL. Read DONE.md." -ForegroundColor Green }
else { Write-Host "Cap reached after $i main iterations. Relaunch to continue." }
