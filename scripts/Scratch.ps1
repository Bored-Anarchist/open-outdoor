[CmdletBinding(SupportsShouldProcess)]
param(
    [ValidateSet('New', 'Complete', 'List', 'Clean')][string]$Action = 'List',
    [string]$Name,
    [switch]$Delete
)

$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$scratchRoot = Join-Path $workspace '.scratch'
$runsRoot = Join-Path $scratchRoot 'runs'

function Assert-Directory([string]$Path) {
    $resolved = [IO.Path]::GetFullPath($Path)
    if (-not $resolved.StartsWith($workspace + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Scratch path escapes the workspace.'
    }
    if (Test-Path -LiteralPath $resolved) {
        $item = Get-Item -LiteralPath $resolved -Force
        if (-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw 'Scratch directories must be real directories, not links.'
        }
    }
    return $resolved
}

Assert-Directory $scratchRoot | Out-Null
Assert-Directory $runsRoot | Out-Null
if ($Action -in @('New', 'Complete')) {
    if ($Action -eq 'New' -and -not $Name) { $Name = [guid]::NewGuid().ToString('N') }
    if ($Name -notmatch '^[a-zA-Z0-9][a-zA-Z0-9-]{0,63}$' -or $Name -match '^(CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])$') {
        throw 'Use a safe run name of up to 64 letters, digits or hyphens.'
    }
    $run = Assert-Directory (Join-Path $runsRoot $Name)
    $marker = Join-Path $run 'run.json'
    if ($Action -eq 'New') {
        if (Test-Path -LiteralPath $run) { throw 'Run already exists; choose a new name.' }
        if ($PSCmdlet.ShouldProcess($run, 'Create disposable scratch run')) {
            New-Item -ItemType Directory -Path $run -Force | Out-Null
            @{ schemaVersion = 1; disposable = $true; completed = $false; createdAt = [DateTime]::UtcNow.ToString('o') } |
                ConvertTo-Json | Set-Content -LiteralPath $marker -Encoding utf8
            Write-Output $run
        }
    } else {
        if ((Get-Item -LiteralPath $marker).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Linked run marker.' }
        $record = Get-Content -LiteralPath $marker -Raw | ConvertFrom-Json
        if ($record.schemaVersion -ne 1 -or $record.disposable -ne $true) { throw 'Unmanaged scratch run.' }
        if ($PSCmdlet.ShouldProcess($run, 'Mark disposable run complete')) {
            $record.completed = $true
            $record | ConvertTo-Json | Set-Content -LiteralPath $marker -Encoding utf8
        }
    }
    return
}
if (-not (Test-Path -LiteralPath $runsRoot)) { return }
foreach ($entry in Get-ChildItem -LiteralPath $runsRoot -Directory -Force) {
    $run = Assert-Directory $entry.FullName
    $marker = Join-Path $run 'run.json'
    if (-not (Test-Path -LiteralPath $marker -PathType Leaf)) { continue }
    if ((Get-Item -LiteralPath $marker).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Linked run marker.' }
    $record = Get-Content -LiteralPath $marker -Raw | ConvertFrom-Json
    if ($record.schemaVersion -ne 1 -or $record.disposable -ne $true) { continue }
    if ($Action -eq 'List') {
        [pscustomobject]@{ Name = $entry.Name; Completed = $record.completed; Path = $run }
    } elseif ($record.completed -eq $true) {
        if (-not $Delete) { Write-Output "Cleanup candidate: $run"; continue }
        if (Get-ChildItem -LiteralPath $run -Recurse -Force | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }) {
            throw 'Refusing recursive cleanup of a run containing links.'
        }
        if ($PSCmdlet.ShouldProcess($run, 'Delete completed disposable scratch run')) {
            Remove-Item -LiteralPath $run -Recurse -Force
        }
    }
}
