$ErrorActionPreference = "Stop"

$StartupFolder = [Environment]::GetFolderPath("Startup")
$LauncherPath = Join-Path $StartupFolder "KoliaCompetitorTrackerLocalhost.cmd"
$StartScript = Join-Path $PSScriptRoot "start-localhost.ps1"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$StartupLogPath = Join-Path $ProjectRoot "startup-localhost.log"
$TaskName = "KoliaCompetitorTrackerLocalhost"

if (!(Test-Path $StartScript)) {
  throw "Start script not found: $StartScript"
}

$LauncherContent = @"
@echo off
timeout /t 20 /nobreak >nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$StartScript" >> "$StartupLogPath" 2>&1
"@

Set-Content -Path $LauncherPath -Value $LauncherContent -Encoding ASCII

Write-Output "Installed startup launcher:"
Write-Output $LauncherPath

$taskAction = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$StartScript`""
$taskArgs = @(
  "/Create",
  "/TN", $TaskName,
  "/SC", "ONLOGON",
  "/DELAY", "0001:00",
  "/TR", $taskAction,
  "/F"
)

try {
  $taskOutput = & schtasks.exe @taskArgs 2>&1
  if ($LASTEXITCODE -eq 0) {
    Write-Output "Installed Windows logon task:"
    Write-Output $TaskName
  } else {
    Write-Output "Could not install Windows logon task. Startup folder launcher is still installed."
    Write-Output $taskOutput
  }
} catch {
  Write-Output "Could not install Windows logon task. Startup folder launcher is still installed."
  Write-Output $_.Exception.Message
}

Write-Output "Running server start script now..."
& $StartScript
