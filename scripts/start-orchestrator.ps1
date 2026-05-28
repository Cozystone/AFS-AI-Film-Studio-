$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$port = if ($env:AFS_ORCHESTRATOR_PORT) { [int]$env:AFS_ORCHESTRATOR_PORT } else { 8765 }

Push-Location $root
try {
    if (!(Test-Path ".venv")) {
        python -m venv .venv
    }
    .\.venv\Scripts\python.exe -m pip install -r services/orchestrator/requirements.txt
    $env:PYTHONPATH = "services/orchestrator"
    .\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir services/orchestrator --host 127.0.0.1 --port $port
}
finally {
    Pop-Location
}
