# All addresses, adapter names and executable paths below are synthetic fixtures.
# Network and firewall commands are stubbed; no real device configuration is recorded.
$ErrorActionPreference = 'Stop'
foreach ($taskFile in @('laptop-hotspot-common.ps1', 'laptop-hotspot.ps1', 'laptop-hotspot-firewall.ps1', 'laptop-hotspot-firewall-launch.ps1')) {
    $taskTokens = $null
    $taskErrors = $null
    [void][System.Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot $taskFile), [ref]$taskTokens, [ref]$taskErrors)
    if ($taskErrors) { throw "Invalid PowerShell syntax in $taskFile" }
}
. (Join-Path $PSScriptRoot 'laptop-hotspot-common.ps1')
# Exercise approval cancellation without opening UAC or changing the firewall.
& {
    function Start-Process {
        param($FilePath, $WindowStyle, $ArgumentList, [switch]$PassThru)
        if ($WindowStyle -ne 'Hidden') { throw 'The approval broker must be hidden.' }
        $script:taskBrokerStarted = $true
        $taskProcess = [pscustomobject]@{ HasExited = $script:taskMode -ne 'cancel'; ExitCode = $script:taskExitCode }
        $taskProcess | Add-Member ScriptMethod WaitForExit { $script:taskBrokerWaited = $true }
        $taskProcess | Add-Member ScriptMethod Kill { $script:taskBrokerKilled = $true }
        $taskProcess | Add-Member ScriptMethod Dispose { $script:taskBrokerDisposed = $true }
        return $taskProcess
    }
    function Start-Sleep { param($Seconds) $script:taskInput.IsCompleted = $true }
    foreach ($script:taskMode in @('success', 'denied', 'cancel', 'eof')) {
        $script:taskBrokerStarted = $false
        $script:taskBrokerWaited = $false
        $script:taskBrokerKilled = $false
        $script:taskBrokerDisposed = $false
        $script:taskExitCode = if ($script:taskMode -eq 'denied') { 1 } else { 0 }
        $script:taskInput = [pscustomobject]@{ IsCompleted = $script:taskMode -eq 'eof' }
        $taskRejected = $false
        try { Invoke-HotspotFirewallSetup 'C:\Synthetic\firewall.ps1' 'C:\Synthetic\node.exe' 8765 $script:taskInput } catch { $taskRejected = $true }
        if ($taskRejected -ne ($script:taskMode -ne 'success')) { throw "Wrong approval result for $script:taskMode" }
        if ($script:taskMode -eq 'eof') {
            if ($script:taskBrokerStarted) { throw 'EOF must not launch an approval broker.' }
        } elseif (-not $script:taskBrokerDisposed) { throw 'Approval broker handles must always be released.' }
        if ($script:taskMode -eq 'cancel' -and -not $script:taskBrokerKilled) { throw 'Pending approval must be terminated on cancellation.' }
        if ($script:taskMode -eq 'success' -and (-not $script:taskBrokerWaited -or $script:taskBrokerKilled)) { throw 'Successful approval must read the exit code without killing the broker.' }
    }
}
$script:taskAdapters = @(
    [pscustomobject]@{ Name = 'Wi-Fi'; Status = 'Up'; InterfaceDescription = 'Physical wireless adapter'; InterfaceIndex = 1 },
    [pscustomobject]@{ Name = 'Test hotspot'; Status = 'Up'; InterfaceDescription = 'Microsoft Wi-Fi Direct Virtual Adapter #99'; InterfaceIndex = 2 }
)
$script:taskAddresses = @{
    1 = [pscustomobject]@{ IPAddress = '100.96.1.20'; PrefixLength = 26; AddressState = 'Preferred' }
    2 = [pscustomobject]@{ IPAddress = '10.20.30.17'; PrefixLength = 28; AddressState = 'Preferred' }
}
function Get-NetAdapter { param([switch]$IncludeHidden) return $script:taskAdapters }
function Get-NetIPAddress { param($InterfaceIndex, $AddressFamily, $ErrorAction) return $script:taskAddresses[[int]$InterfaceIndex] }
$taskEndpoint = Get-HotspotEndpoint
if ($taskEndpoint.host -ne '10.20.30.17' -or $taskEndpoint.subnet -ne '10.20.30.16/28' -or $taskEndpoint.interfaceAlias -ne 'Test hotspot') { throw 'Hotspot endpoint did not select the virtual adapter or calculate its subnet.' }
$script:taskAddresses[2] = [pscustomobject]@{ IPAddress = '192.168.50.1'; PrefixLength = 8; AddressState = 'Preferred' }
if (Get-HotspotEndpoint) { throw 'A private address must not allow a subnet that includes public addresses.' }
$script:taskAddresses[2] = [pscustomobject]@{ IPAddress = '10.20.30.17'; PrefixLength = 28; AddressState = 'Preferred' }
$script:taskAdapters += [pscustomobject]@{ Name = 'Other direct session'; Status = 'Up'; InterfaceDescription = 'Microsoft Wi-Fi Direct Virtual Adapter'; InterfaceIndex = 3 }
$script:taskAddresses[3] = [pscustomobject]@{ IPAddress = '192.168.50.1'; PrefixLength = 24; AddressState = 'Preferred' }
$taskRejected = $false
try { Get-HotspotEndpoint | Out-Null } catch { $taskRejected = $true }
if (-not $taskRejected) { throw 'Ambiguous virtual adapters must not be guessed.' }
$script:taskAdapters = @($script:taskAdapters[0])
if (Get-HotspotEndpoint) { throw 'Physical Wi-Fi must never be a fallback.' }
$script:taskRemote = '10.20.30.16/28'
function Get-NetFirewallRule { param($Name, $ErrorAction) return [pscustomobject]@{ Enabled = 'True'; Direction = 'Inbound'; Action = 'Allow'; Profile = 'Any' } }
function Get-NetFirewallAddressFilter { return [pscustomobject]@{ LocalAddress = '10.20.30.17'; RemoteAddress = $script:taskRemote } }
function Get-NetFirewallApplicationFilter { return [pscustomobject]@{ Program = 'C:\Synthetic\node.exe' } }
function Get-NetFirewallPortFilter { return [pscustomobject]@{ Protocol = 'TCP'; LocalPort = '8765' } }
function Get-NetFirewallInterfaceFilter { return [pscustomobject]@{ InterfaceAlias = 'Test hotspot' } }
if (-not (Test-HotspotFirewall $taskEndpoint 'C:\Synthetic\node.exe' 8765)) { throw 'Correct scoped firewall rule was rejected.' }
$script:taskRemote = '10.20.30.16/255.255.255.240'
if (-not (Test-HotspotFirewall $taskEndpoint 'C:\Synthetic\node.exe' 8765)) { throw 'Windows normalized dotted-mask scope was rejected.' }
$script:taskRemote = 'Any'
if (Test-HotspotFirewall $taskEndpoint 'C:\Synthetic\node.exe' 8765) { throw 'An unrestricted remote firewall rule was accepted.' }
$script:taskRemote = '10.20.30.16/28'
if (Test-HotspotFirewall $taskEndpoint 'C:\Other\node.exe' 8765) { throw 'A different executable was accepted.' }
if (Test-HotspotFirewall $taskEndpoint 'C:\Synthetic\node.exe' 9000) { throw 'A different port was accepted.' }
'Hotspot native regressions passed.'
