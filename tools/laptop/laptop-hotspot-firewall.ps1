[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$NodePath,
    [ValidateRange(1024,65535)][int]$Port = 8765
)
. (Join-Path $PSScriptRoot 'laptop-hotspot-common.ps1')
try {
    $taskEndpoint = Get-HotspotEndpoint
    if (-not $taskEndpoint) { throw 'No hotspot endpoint.' }
    $taskNode = (Get-Item -LiteralPath $NodePath -ErrorAction Stop).FullName
    if ([IO.Path]::GetFileName($taskNode) -ne 'node.exe') { throw 'A Node executable is required.' }
    if (-not (Test-HotspotFirewall $taskEndpoint $taskNode $Port)) {
        # Replace only our own per-port rule. Keep all other firewall rules intact.
        $taskName = "OpenOutdoor-Laptop-Hotspot-TCP$Port"
        $taskOld = Get-NetFirewallRule -Name $taskName -ErrorAction SilentlyContinue
        if ($taskOld) { $taskOld | Remove-NetFirewallRule }
        New-NetFirewallRule -Name $taskName -DisplayName "Open Outdoor laptop hotspot TCP $Port" -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -Program $taskNode -InterfaceAlias $taskEndpoint.interfaceAlias -LocalAddress $taskEndpoint.host -RemoteAddress $taskEndpoint.subnet -Profile Any | Out-Null
    }
    exit 0
} catch { exit 1 }
