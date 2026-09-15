[CmdletBinding()]
param(
    [string]$CatalogPath = 'PrivateData/catalogs/US/New York/current'
)

if ($IsWindows) {
    throw 'The unsigned iOS archive must be built on macOS. See docs/IOS_SIDELOAD_FEASIBILITY.md.'
}

$resolvedCatalog = Resolve-Path -LiteralPath $CatalogPath
$stagedData = Join-Path (Resolve-Path 'apps/mobile').Path '.private-map-data'
try {
    node tools/stage-private-mobile-map.mjs --input $resolvedCatalog.Path
    if ($LASTEXITCODE -ne 0) { throw 'Private map staging failed.' }

    $manifest = Get-Content -Raw -LiteralPath (Join-Path $resolvedCatalog.Path 'manifest.json') | ConvertFrom-Json
    $env:OPEN_OUTDOOR_PRIVATE_MAP_DATA = '1'
    & (Join-Path $PSScriptRoot 'Build-IosUnsigned.ps1')
    if ($LASTEXITCODE -ne 0) { throw 'Private unsigned iOS build failed.' }

    $appBundles = @(
        Get-ChildItem -Path 'dist/ios-derived/Build/Products/Release-iphoneos' -Directory -Filter '*.app'
    )
    if ($appBundles.Count -ne 1) {
        throw "Expected one built private app bundle, found $($appBundles.Count)."
    }
    $name = 'new-york-outdoors.composed.geojson'
    $artifact = @($manifest.artifacts | Where-Object { $_.file -eq $name })
    if ($artifact.Count -ne 1) { throw "Private catalog manifest does not pin '$name'." }
    $candidates = @(
        Get-ChildItem -Path $appBundles[0].FullName -File -Recurse |
            Where-Object { $_.Length -eq $artifact[0].bytes }
    )
    $matches = @(
        $candidates |
            Where-Object {
                (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() -eq
                    $artifact[0].sha256
            }
    )
    if ($matches.Count -ne 1) {
        throw "Expected private map artifact '$name' in the app bundle, found $($matches.Count)."
    }
    Write-Host "Verified private map artifact '$name' in '$($matches[0].FullName)'."
}
finally {
    Remove-Item Env:OPEN_OUTDOOR_PRIVATE_MAP_DATA -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $stagedData) {
        Remove-Item -LiteralPath $stagedData -Recurse -Force
    }
}
