[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$NodePath,
    [ValidateRange(1024,65535)][int]$Port = 8765
)
$ErrorActionPreference = 'Stop'
try {
    # This unelevated broker may block on UAC; the owning helper can terminate it.
    $taskScript = Join-Path $PSScriptRoot 'laptop-hotspot-firewall.ps1'
    $taskHelper = Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -Verb RunAs -WindowStyle Hidden -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $taskScript + '"'), '-NodePath', ('"' + $NodePath + '"'), '-Port', [string]$Port) -PassThru
    $taskHelper.WaitForExit()
    exit $taskHelper.ExitCode
} catch { exit 1 }
