[CmdletBinding()]
param([switch]$SkipInstall)

$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$release = Get-Content -LiteralPath (Join-Path $workspace 'config/release.json') -Raw | ConvertFrom-Json

function Assert-ExactVersion([string]$Command, [string]$Expected) {
    $actual = (& $Command --version).Trim().TrimStart('v')
    if ($LASTEXITCODE -ne 0 -or $actual -ne $Expected) {
        throw "$Command $Expected is required; found '$actual'."
    }
}

Assert-ExactVersion 'node' $release.tools.node
Assert-ExactVersion 'pnpm' $release.tools.pnpm
Assert-ExactVersion 'python' $release.tools.python
Assert-ExactVersion 'uv' $release.tools.uv

if (-not $SkipInstall) {
    Push-Location $workspace
    try {
        pnpm install --frozen-lockfile
        if ($LASTEXITCODE -ne 0) { throw 'pnpm install failed.' }
        uv sync --frozen
        if ($LASTEXITCODE -ne 0) { throw 'uv sync failed.' }
    }
    finally { Pop-Location }
}

Write-Host 'Pinned Windows bootstrap passed.'
