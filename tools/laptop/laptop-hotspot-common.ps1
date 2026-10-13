$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime

function Wait-HotspotOperation($Operation, [Type]$ResultType) {
    $taskBridge = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
        $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
        (($ResultType -and $_.IsGenericMethod -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1') -or
         (-not $ResultType -and -not $_.IsGenericMethod -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction'))
    } | Select-Object -First 1
    if ($ResultType) { $taskBridge = $taskBridge.MakeGenericMethod($ResultType) }
    $taskAwaitable = $taskBridge.Invoke($null, @($Operation))
    if (-not $taskAwaitable.Wait(20000)) { throw 'Windows hotspot operation timed out.' }
    $taskResult = $taskAwaitable.GetAwaiter().GetResult()
    if ($ResultType -and [string]$taskResult.Status -ne 'Success') { throw 'Windows could not change hotspot state.' }
}

function Get-HotspotManager {
    $taskProfile = [Windows.Networking.Connectivity.NetworkInformation, Windows.Networking.Connectivity, ContentType=WindowsRuntime]::GetInternetConnectionProfile()
    if (-not $taskProfile) { throw 'Windows needs an active upstream connection to start Mobile hotspot.' }
    $taskType = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager, Windows.Networking.NetworkOperators, ContentType=WindowsRuntime]
    if ([string]$taskType::GetTetheringCapabilityFromConnectionProfile($taskProfile) -ne 'Enabled') { throw 'Windows Mobile hotspot is unavailable.' }
    return $taskType::CreateFromConnectionProfile($taskProfile)
}

function Get-HotspotEndpoint {
    # Modern Mobile hotspot does not reliably appear in the legacy HNetShare COM API.
    # Require one active Wi-Fi Direct adapter with an assigned private IPv4 address.
    $taskEndpoints = @(foreach ($taskAdapter in (Get-NetAdapter -IncludeHidden)) {
        if ($taskAdapter.Status -ne 'Up' -or $taskAdapter.InterfaceDescription -notmatch '^Microsoft Wi-Fi Direct Virtual Adapter') { continue }
        foreach ($taskAddress in (Get-NetIPAddress -InterfaceIndex $taskAdapter.InterfaceIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue)) {
            if ($taskAddress.AddressState -ne 'Preferred' -or $taskAddress.PrefixLength -lt 8 -or $taskAddress.PrefixLength -gt 30 -or
                $taskAddress.IPAddress -notmatch '^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)') { continue }
            $taskMinimumPrefix = if ($taskAddress.IPAddress.StartsWith('10.')) { 8 } elseif ($taskAddress.IPAddress.StartsWith('172.')) { 12 } else { 16 }
            if ($taskAddress.PrefixLength -lt $taskMinimumPrefix) { continue }
            $taskOctets = @($taskAddress.IPAddress.Split('.') | ForEach-Object { [int]$_ })
            $taskNetwork = for ($taskIndex = 0; $taskIndex -lt 4; $taskIndex++) {
                $taskBits = [Math]::Min(8, [Math]::Max(0, $taskAddress.PrefixLength - 8 * $taskIndex))
                $taskOctets[$taskIndex] -band [int](256 - [Math]::Pow(2, 8 - $taskBits))
            }
            [pscustomobject]@{
                host = $taskAddress.IPAddress
                prefixLength = [int]$taskAddress.PrefixLength
                subnet = ($taskNetwork -join '.') + '/' + $taskAddress.PrefixLength
                interfaceAlias = $taskAdapter.Name
                interfaceIndex = $taskAdapter.InterfaceIndex
            }
        }
    })
    if ($taskEndpoints.Count -gt 1) { throw 'More than one Wi-Fi Direct endpoint is active.' }
    if ($taskEndpoints.Count -eq 1) { return $taskEndpoints[0] }
}

function Test-HotspotFirewall($Endpoint, [string]$NodePath, [int]$Port) {
    $taskRule = Get-NetFirewallRule -Name "OpenOutdoor-Laptop-Hotspot-TCP$Port" -ErrorAction SilentlyContinue
    if (-not $taskRule) { return $false }
    $taskAddress = $taskRule | Get-NetFirewallAddressFilter
    $taskApplication = $taskRule | Get-NetFirewallApplicationFilter
    $taskPort = $taskRule | Get-NetFirewallPortFilter
    $taskInterface = $taskRule | Get-NetFirewallInterfaceFilter
    # Windows can return a CIDR rule using a dotted subnet mask instead of /24.
    $taskMask = for ($taskIndex = 0; $taskIndex -lt 4; $taskIndex++) {
        $taskBits = [Math]::Min(8, [Math]::Max(0, $Endpoint.prefixLength - 8 * $taskIndex))
        [int](256 - [Math]::Pow(2, 8 - $taskBits))
    }
    $taskRemoteForms = @($Endpoint.subnet, ($Endpoint.subnet.Split('/')[0] + '/' + ($taskMask -join '.')))
    return ($taskRule.Enabled -eq 'True' -and $taskRule.Direction -eq 'Inbound' -and $taskRule.Action -eq 'Allow' -and
        $taskRule.Profile -eq 'Any' -and $taskApplication.Program -eq $NodePath -and $taskPort.Protocol -in @('TCP', '6') -and
        (@($taskPort.LocalPort) -join ',') -eq [string]$Port -and
        (@($taskAddress.LocalAddress) -join ',') -eq $Endpoint.host -and
        (@($taskAddress.RemoteAddress) -join ',') -in $taskRemoteForms -and
        (@($taskInterface.InterfaceAlias) -join ',') -eq $Endpoint.interfaceAlias)
}
