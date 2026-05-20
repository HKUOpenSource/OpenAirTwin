$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

if (Get-Command py -ErrorAction SilentlyContinue) {
    & py -3.11 "$ScriptDir\install.py" @args
    exit $LASTEXITCODE
}

if (Get-Command python -ErrorAction SilentlyContinue) {
    & python "$ScriptDir\install.py" @args
    exit $LASTEXITCODE
}

Write-Error "Python 3.11+ is required. Install Python first, then rerun install.ps1."
exit 127
