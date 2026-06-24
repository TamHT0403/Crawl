$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$NodePath = "C:\Users\Admin\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$NextBin = Join-Path $ProjectRoot "node_modules\next\dist\bin\next"
$LogPath = Join-Path $ProjectRoot "dev-server.log"
$ErrPath = Join-Path $ProjectRoot "dev-server.err.log"
$StartupLogPath = Join-Path $ProjectRoot "startup-localhost.log"
$Url = "http://127.0.0.1:3000/"

function Write-StartupLog {
  param([string]$Message)
  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Add-Content -LiteralPath $StartupLogPath -Value "[$timestamp] $Message"
}

function Test-LocalhostReady {
  try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

if (Test-LocalhostReady) {
  Write-StartupLog "Localhost already ready: $Url"
  Write-Output "Localhost already ready: $Url"
  exit 0
}

if (!(Test-Path $NodePath)) {
  Write-StartupLog "Node runtime not found: $NodePath"
  throw "Node runtime not found: $NodePath"
}

if (!(Test-Path $NextBin)) {
  Write-StartupLog "Next.js binary not found: $NextBin"
  throw "Next.js binary not found. Run dependency install first: $NextBin"
}

$existing = Get-CimInstance Win32_Process |
  Where-Object {
    $_.CommandLine -like "*node_modules\next\dist\bin\next*dev*--port*3000*" -or
    $_.CommandLine -like "*start-server.js*"
  }

if (!$existing) {
  Write-StartupLog "Starting Next.js dev server on port 3000."
  $args = @($NextBin, "dev", "--hostname", "0.0.0.0", "--port", "3000")
  Start-Process -FilePath $NodePath `
    -ArgumentList $args `
    -WorkingDirectory $ProjectRoot `
    -RedirectStandardOutput $LogPath `
    -RedirectStandardError $ErrPath `
    -WindowStyle Hidden | Out-Null
} else {
  Write-StartupLog "Found existing Next.js process for port 3000."
}

for ($i = 0; $i -lt 60; $i++) {
  if (Test-LocalhostReady) {
    Write-StartupLog "Localhost ready: $Url"
    Write-Output "Localhost ready: $Url"
    exit 0
  }
  Start-Sleep -Seconds 2
}

Write-StartupLog "Localhost did not become ready within timeout. See $LogPath and $ErrPath"
Write-Output "Localhost did not become ready within timeout. Check logs:"
Write-Output $LogPath
Write-Output $ErrPath
exit 1
