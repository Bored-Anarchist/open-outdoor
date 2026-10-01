[CmdletBinding()]
param(
    [switch]$SkipInstall,
    [ValidateSet('gis', 'loader')][string[]]$PythonGroups = @()
)

$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$release = Get-Content -LiteralPath (Join-Path $workspace 'config/release.json') -Raw | ConvertFrom-Json

function Assert-ExactVersion([string]$Command, [string]$Expected) {
    $versionText = (& $Command --version).Trim()
    $actual = switch ($Command) {
        'python' { $versionText -replace '^Python ', '' }
        'uv' { $versionText -replace '^uv ([0-9]+\.[0-9]+\.[0-9]+)(?: \([^)]+\))?$', '$1' }
        default { $versionText.TrimStart('v') }
    }
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
        $syncArguments = @('sync', '--frozen')
        foreach ($group in $PythonGroups) { $syncArguments += @('--group', $group) }
        uv @syncArguments
        if ($LASTEXITCODE -ne 0) { throw 'uv sync failed.' }
    }
    finally { Pop-Location }
}

Write-Host 'Pinned Windows bootstrap passed.'
