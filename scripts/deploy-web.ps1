$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$webDir = Join-Path $root "apps\web"
$alias = "afs-ai-film-studio.vercel.app"
$orchestratorUrlFile = Join-Path $root "storage\orchestrator-url.txt"
$deployArgs = @("deploy", "--prod", "--yes", "--public")

if (Test-Path $orchestratorUrlFile) {
    $orchestratorUrl = (Get-Content $orchestratorUrlFile -Raw).Trim()
    if ($orchestratorUrl) {
        $deployArgs += @("--env", "ORCHESTRATOR_URL=$orchestratorUrl")
        $deployArgs += @("--env", "NEXT_PUBLIC_ORCHESTRATOR_URL=$orchestratorUrl")
        Write-Output "Using orchestrator: $orchestratorUrl"
    }
}

Push-Location $webDir
try {
    $output = & vercel @deployArgs
    $output | Write-Output

    $deploymentUrl = $null
    foreach ($line in $output) {
        if ($line -match 'Production:\s+(https://[^\s]+)') {
            $deploymentUrl = $Matches[1].Replace("https://", "")
        }
        if (-not $deploymentUrl -and $line -match '"url":\s+"https://([^"]+)"') {
            $deploymentUrl = $Matches[1]
        }
    }

    if (-not $deploymentUrl) {
        Write-Output "Deployment completed, but the deployment URL could not be parsed. Vercel may have already assigned the production alias."
        Write-Output "Clean URL: https://$alias"
        exit 0
    }

    vercel alias set $deploymentUrl $alias
    Write-Output "Clean URL: https://$alias"
}
finally {
    Pop-Location
}
