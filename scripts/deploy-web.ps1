$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$webDir = Join-Path $root "apps\web"
$alias = "afs-ai-film-studio.vercel.app"

Push-Location $webDir
try {
    $output = vercel deploy --prod --yes --public
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
