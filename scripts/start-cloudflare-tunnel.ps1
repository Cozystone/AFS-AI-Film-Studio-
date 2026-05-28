$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$port = if ($env:AFS_ORCHESTRATOR_PORT) { [int]$env:AFS_ORCHESTRATOR_PORT } else { 8765 }
$logDir = Join-Path $root "storage\cache"
$urlFile = Join-Path $root "storage\orchestrator-url.txt"
$logFile = Join-Path $logDir "cloudflared.log"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null
if (Test-Path $logFile) {
    Remove-Item -LiteralPath $logFile -Force
}

$process = Start-Process -WindowStyle Hidden -PassThru -FilePath "cloudflared" -ArgumentList @(
    "tunnel",
    "--url",
    "http://127.0.0.1:$port",
    "--loglevel",
    "info"
) -RedirectStandardError $logFile -RedirectStandardOutput (Join-Path $logDir "cloudflared.out.log")

$deadline = (Get-Date).AddSeconds(45)
$url = $null
while ((Get-Date) -lt $deadline) {
    if (Test-Path $logFile) {
        $content = Get-Content $logFile -Raw
        $match = [regex]::Match($content, "https://[a-zA-Z0-9-]+\.trycloudflare\.com")
        if ($match.Success) {
            $url = $match.Value
            break
        }
    }
    Start-Sleep -Seconds 1
}

if (-not $url) {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    throw "Cloudflare tunnel URL was not detected. Check $logFile"
}

Set-Content -Path $urlFile -Value $url -Encoding UTF8
Write-Output "Tunnel URL: $url"
Write-Output "Saved to: $urlFile"
Write-Output "Process ID: $($process.Id)"
