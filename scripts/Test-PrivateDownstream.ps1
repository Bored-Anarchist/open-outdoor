[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("open-outdoor-downstream-" + [guid]::NewGuid().ToString('N'))
$publicClone = Join-Path $testRoot 'public-clone'
$privateCheckout = Join-Path $testRoot 'private-checkout'

try {
    New-Item -ItemType Directory -Force -Path $testRoot | Out-Null
    git clone --quiet --no-local $workspace $publicClone
    if ($LASTEXITCODE -ne 0) { throw 'Could not make isolated public clone.' }

    git clone --quiet $publicClone $privateCheckout
    if ($LASTEXITCODE -ne 0) { throw 'Could not make isolated private downstream.' }
    git -C $privateCheckout config user.name 'Open Outdoor compatibility test'
    git -C $privateCheckout config user.email 'compatibility.invalid@example.invalid'
    Set-Content -LiteralPath (Join-Path $privateCheckout 'synthetic-private-marker.txt') -Value 'synthetic-only' -Encoding utf8
    git -C $privateCheckout add synthetic-private-marker.txt
    git -C $privateCheckout commit --quiet -m 'Synthetic private baseline'

    git -C $publicClone config user.name 'Open Outdoor compatibility test'
    git -C $publicClone config user.email 'compatibility.invalid@example.invalid'
    Set-Content -LiteralPath (Join-Path $publicClone 'synthetic-public-update.txt') -Value 'public-update' -Encoding utf8
    git -C $publicClone add synthetic-public-update.txt
    git -C $publicClone commit --quiet -m 'Synthetic public update'

    git -C $privateCheckout fetch --quiet origin main
    if ($LASTEXITCODE -ne 0) { throw 'Private checkout could not fetch the public update.' }
    git -C $privateCheckout merge --quiet --no-edit origin/main
    if ($LASTEXITCODE -ne 0) { throw 'Private checkout could not incorporate the public update.' }

    $publicTree = git -C $publicClone ls-tree -r --name-only HEAD
    if ($publicTree -contains 'synthetic-private-marker.txt') { throw 'Private marker crossed into public Git.' }
    if (-not (Test-Path -LiteralPath (Join-Path $privateCheckout 'synthetic-private-marker.txt'))) { throw 'Private checkout lost its private material.' }
    if (-not (Test-Path -LiteralPath (Join-Path $privateCheckout 'synthetic-public-update.txt'))) { throw 'Private checkout did not incorporate the public update.' }

    Write-Host 'Private downstream compatibility boundary passed.'
}
finally {
    if (Test-Path -LiteralPath $testRoot) {
        $resolvedTestRoot = (Resolve-Path -LiteralPath $testRoot).Path
        $resolvedTemp = (Resolve-Path -LiteralPath ([System.IO.Path]::GetTempPath())).Path
        if (-not $resolvedTestRoot.StartsWith($resolvedTemp, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing to remove unexpected path: $resolvedTestRoot"
        }
        Remove-Item -LiteralPath $resolvedTestRoot -Recurse -Force
    }
}
