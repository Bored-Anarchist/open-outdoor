[CmdletBinding()]
param([Parameter(Mandatory)][ValidatePattern('^[0-9a-f]{40}$')][string]$Commit)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$outputRoot = Join-Path $repositoryRoot ('dist/release-audit/clean-room-' + [guid]::NewGuid().ToString('N'))
$checkout = Join-Path $outputRoot 'checkout'
New-Item -ItemType Directory -Path $outputRoot | Out-Null
$checks = [System.Collections.Generic.List[object]]::new()
$passed = $false
function Invoke-Checked {
    param([string]$Name, [scriptblock]$Command)
    $log = Join-Path $outputRoot ($Name + '.log')
    & $Command *> $log
    $succeeded = $LASTEXITCODE -eq 0
    $checks.Add(@{ id = $Name; passed = $succeeded; outputSha256 = (Get-FileHash -LiteralPath $log -Algorithm SHA256).Hash.ToLowerInvariant() })
    if (-not $succeeded) { throw "Clean-room step failed: $Name" }
}
try {
    if ((& node --version).Trim() -ne 'v24.19.0' -or (& pnpm --version).Trim() -ne '11.20.0') { throw 'Pinned Node/pnpm required.' }
    # Fetch public hosting only: no local clone or working files are copied. Run on a separately provisioned public-only host.
    Invoke-Checked 'clone' { & git -c http.sslBackend=schannel clone --no-checkout https://github.com/Bored-Anarchist/open-outdoor.git $checkout }
    Push-Location $checkout
    try {
        Invoke-Checked 'checkout' { & git checkout --detach $Commit }
        if ((& git rev-parse HEAD).Trim() -ne $Commit -or (& git status --porcelain)) { throw 'Candidate checkout is not exact and clean.' }
        Invoke-Checked 'install' { & pnpm install --frozen-lockfile --store-dir (Join-Path $outputRoot 'store') }
        Invoke-Checked 'quality' { & pnpm quality }
        Invoke-Checked 'privacy' { & pnpm test:privacy }
        Invoke-Checked 'web' { & pnpm build:web }
        Invoke-Checked 'ios-javascript' { & pnpm build:ios:bundle }
        if (& git status --porcelain) { throw 'Build mutated tracked/public checkout inputs.' }
        $passed = $true
    } finally { Pop-Location }
} finally {
    $report = @{ schemaVersion = 1; sourceCommit = $Commit; classification = 'SYNTHETIC_OR_REDACTED'; profile = 'windows-public-shared-build'; implementationPassed = $passed; productionAcceptance = 'blocked'; blockers = @('INDEPENDENT_NATIVE_REPRODUCTION_REQUIRED', 'PHYSICAL_AND_REVIEW_EVIDENCE_REQUIRED'); checks = @($checks.ToArray()) }
    $report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $outputRoot 'report.json')
    Write-Output "Clean-room report: $outputRoot/report.json"
}
