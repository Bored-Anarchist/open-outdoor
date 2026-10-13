[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$NodePath,
    [ValidateRange(1024,65535)][int]$Port = 8765
)
. (Join-Path $PSScriptRoot 'laptop-hotspot-common.ps1')
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$taskManager = $null
$taskStartedHere = $false
$taskRestoreTimeout = $false
$taskFailure = 'Windows Mobile hotspot could not start. Connect the laptop to Wi-Fi or Ethernet and check Windows Settings > Network & internet > Mobile hotspot, then retry.'
$taskReader = [System.IO.StreamReader]::new([Console]::OpenStandardInput())
function Send-HotspotEvent($Value) { [Console]::Out.WriteLine(($Value | ConvertTo-Json -Compress)); [Console]::Out.Flush() }
try {
    $taskManager = Get-HotspotManager
    $taskResultType = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringOperationResult, Windows.Networking.NetworkOperators, ContentType=WindowsRuntime]
    if ([string]$taskManager.TetheringOperationalState -eq 'Off') {
        $taskStartedHere = $true
        Wait-HotspotOperation ($taskManager.StartTetheringAsync()) $taskResultType
    } elseif ([string]$taskManager.TetheringOperationalState -ne 'On') { throw 'Windows hotspot is changing state; retry shortly.' }
    # Prevent Windows' five-minute idle timeout while a server awaits its phone.
    $taskType = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager, Windows.Networking.NetworkOperators, ContentType=WindowsRuntime]
    if ($taskType::IsNoConnectionsTimeoutEnabled()) {
        $taskRestoreTimeout = $true
        Wait-HotspotOperation ($taskType::DisableNoConnectionsTimeoutAsync())
    }
    $taskFailure = 'The hotspot has no unique private Wi-Fi Direct address. Close other Wi-Fi Direct sessions and restart pnpm map:laptop.'
    $taskEndpoint = $null
    for ($taskAttempt = 0; $taskAttempt -lt 15; $taskAttempt++) {
        $taskEndpoint = Get-HotspotEndpoint
        if ($taskEndpoint) { break }
        Start-Sleep -Seconds 1
    }
    if (-not $taskEndpoint) { throw 'Hotspot address unavailable.' }
    $taskNode = (Get-Item -LiteralPath $NodePath).FullName
    $taskInput = $taskReader.ReadLineAsync()
    $taskFailure = 'Administrator approval is required for the hotspot-only firewall rule. Approve the Windows prompt, then retry pnpm map:laptop.'
    if (-not (Test-HotspotFirewall $taskEndpoint $taskNode $Port)) {
        Send-HotspotEvent @{ event = 'approval' }
        $taskFirewallScript = Join-Path $PSScriptRoot 'laptop-hotspot-firewall-launch.ps1'
        Invoke-HotspotFirewallSetup $taskFirewallScript $taskNode $Port $taskInput
        if (-not (Test-HotspotFirewall $taskEndpoint $taskNode $Port)) { throw 'Firewall setup did not complete.' }
    }
    if ($taskInput.IsCompleted) { throw 'Server stopped before hotspot readiness.' }
    $taskConfig = $taskManager.GetCurrentAccessPointConfiguration()
    Send-HotspotEvent @{ event = 'ready'; host = $taskEndpoint.host; prefixLength = $taskEndpoint.prefixLength; interfaceAlias = $taskEndpoint.interfaceAlias; networkName = $taskConfig.Ssid; passphrase = $taskConfig.Passphrase }
    $taskFailure = 'The laptop hotspot stopped or changed its address. Restart pnpm map:laptop and rejoin its hotspot on the phone.'
    while (-not $taskInput.IsCompleted) {
        Start-Sleep -Seconds 5
        $taskCurrent = Get-HotspotEndpoint
        if ([string]$taskManager.TetheringOperationalState -ne 'On' -or -not $taskCurrent -or $taskCurrent.host -ne $taskEndpoint.host -or $taskCurrent.subnet -ne $taskEndpoint.subnet -or $taskCurrent.interfaceAlias -ne $taskEndpoint.interfaceAlias -or $taskCurrent.interfaceIndex -ne $taskEndpoint.interfaceIndex) { throw 'Hotspot connection changed.' }
    }
} catch { Send-HotspotEvent @{ event = 'error'; message = $taskFailure } }
finally {
    if ($taskManager) {
        try { if ($taskStartedHere) { Wait-HotspotOperation ($taskManager.StopTetheringAsync()) $taskResultType } } catch { Send-HotspotEvent @{ event = 'cleanup-error' } }
        try { if ($taskRestoreTimeout) { Wait-HotspotOperation ($taskType::EnableNoConnectionsTimeoutAsync()) } } catch { Send-HotspotEvent @{ event = 'cleanup-error' } }
    }
}
