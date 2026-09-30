# 数智星图测试运行器 - 批次执行项目自带回归测试
$ErrorActionPreference = 'Continue'
$projectDir = (Get-Location).Path
# This runner may invoke scripts that delete test rows. Never embed DB credentials here.
if ($env:TEST_ISOLATED_DATABASE -ne '1' -or -not $env:DATABASE_URL) {
  throw 'Set TEST_ISOLATED_DATABASE=1 and DATABASE_URL to a dedicated qa_* PostgreSQL database.'
}
$databaseName = ([uri]$env:DATABASE_URL).AbsolutePath.TrimStart('/')
if ($databaseName -notmatch '^qa_[a-zA-Z0-9_]+$') {
  throw 'Refusing to run tests outside a qa_* PostgreSQL database.'
}
$testBase = if ($env:TEST_BASE_URL) { $env:TEST_BASE_URL } else { 'http://localhost:5000' }
foreach ($name in @('ENTERPRISE_UI','IDENTITY','AI','BAIZE','AI_OPERATIONS','AI_SCENARIO','AI_KNOWLEDGE','AI_WORKFLOW','AI_EXTENSION','AI_COLLABORATION','AI_EVOLUTION','AI_TWIN','AI_PLATFORM','AI_LIVE_EVENTS','AI_REPAIR_TRIAD','AI_GRAPH_EXPLORE','AI_VECTOR')) {
  Set-Item -Path ("Env:" + $name + '_TEST_BASE_URL') -Value $testBase
}
node scripts/assert-isolated-test-environment.mjs
if ($LASTEXITCODE -ne 0) { throw 'Isolated database precondition failed.' }


$tests = @($args)
if ($tests.Count -eq 0) { Write-Output 'USAGE: run-tests.ps1 <script1> <script2> ...'; exit 1 }

$failures = 0
foreach ($t in $tests) {
  Write-Output ''
  Write-Output ('=' * 70)
  Write-Output ("RUN: " + $t)
  Write-Output ('=' * 70)
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  Push-Location $projectDir
  try {
    if ($t -like '*.mjs') {
      node $t
    } else {
      pnpm run $t
    }
    $code = $LASTEXITCODE
  } finally {
    Pop-Location
  }
  $sw.Stop()
  if ($code -eq 0) {
    Write-Output ("RESULT: PASS ($($sw.Elapsed.TotalSeconds.ToString('F1'))s)")
  } else {
    $failures += 1
    Write-Output ("RESULT: FAIL exit=$code ($($sw.Elapsed.TotalSeconds.ToString('F1'))s)")
  }
}

if ($failures -gt 0) { Write-Error "$failures regression script(s) failed."; exit 1 }
