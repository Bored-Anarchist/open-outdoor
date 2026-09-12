[CmdletBinding()]
param(
    [string]$PmtilesExecutable = 'pmtiles',
    [string]$WorkDirectory = '.tmp-offline-basemap/rebuild',
    [string]$OutputDirectory = 'packages/map/src/assets'
)

$ErrorActionPreference = 'Stop'
$sourceArchive = 'https://build.protomaps.com/20260910.pmtiles'
$naturalEarth = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/ca96624a56bd078437bca8184e78163e5039ad19/geojson/ne_50m_admin_0_map_units.geojson'
$naturalEarthSha256 = 'b8d421aca6e9e08e8cdf09cc26af111cc3e0deba4fe915611d58ade71e8a4db0'
$pmtilesSha256 = 'a658baa4d7e55020aef6ca17bd9ff9faa1582671266b36f58c52db0ac8e785a1'
$worldSha256 = '474e74e67b2c2907a39122cd72c06ede2d9c8a38576b13def3c529ecb1355fb5'
$regionalSha256 = 'cca78b6b59fe93a55c8759529e07be0880a8aa2b59b275aa8476d36988fcec98'

$pmtilesCommand = Get-Command $PmtilesExecutable -ErrorAction Stop
if ((Get-FileHash -LiteralPath $pmtilesCommand.Source -Algorithm SHA256).Hash.ToLowerInvariant() -ne $pmtilesSha256) {
    throw 'PMTiles executable does not match the pinned 1.31.2 SHA-256.'
}

$work = New-Item -ItemType Directory -Path $WorkDirectory -ErrorAction Stop
$naturalEarthPath = Join-Path $work.FullName 'ne_50m_admin_0_map_units.geojson'
$regionPath = Join-Path $work.FullName 'us-canada-territories.geojson'
$worldPath = Join-Path $work.FullName 'world-overview-z6.pmtiles'
$regionalPath = Join-Path $work.FullName 'us-canada-territories-z7-z9.pmtiles'

Invoke-WebRequest -Uri $naturalEarth -OutFile $naturalEarthPath -MaximumRedirection 0
if ((Get-FileHash -LiteralPath $naturalEarthPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $naturalEarthSha256) {
    throw 'Natural Earth input does not match the pinned SHA-256.'
}
node tools/create-us-canada-basemap-region.mjs $naturalEarthPath $regionPath
if ($LASTEXITCODE -ne 0) { throw 'US/Canada region generation failed.' }

& $pmtilesCommand.Source extract $sourceArchive $worldPath --maxzoom=6 --overfetch=0
if ($LASTEXITCODE -ne 0) { throw 'Worldwide zoom-6 PMTiles extraction failed.' }
& $pmtilesCommand.Source extract $sourceArchive $regionalPath --region=$regionPath --minzoom=7 --maxzoom=9 --overfetch=0
if ($LASTEXITCODE -ne 0) { throw 'US/Canada zoom-7-through-9 PMTiles extraction failed.' }

& $pmtilesCommand.Source verify $worldPath
if ($LASTEXITCODE -ne 0) { throw 'Worldwide PMTiles verification failed.' }
& $pmtilesCommand.Source verify $regionalPath
if ($LASTEXITCODE -ne 0) { throw 'US/Canada PMTiles verification failed.' }
if ((Get-FileHash -LiteralPath $worldPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $worldSha256) {
    throw 'Worldwide PMTiles output does not match the release manifest.'
}
if ((Get-FileHash -LiteralPath $regionalPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $regionalSha256) {
    throw 'US/Canada PMTiles output does not match the release manifest.'
}

$output = Resolve-Path $OutputDirectory
Copy-Item -LiteralPath $worldPath -Destination (Join-Path $output 'world-overview-z6.pmtiles')
Copy-Item -LiteralPath $regionalPath -Destination (Join-Path $output 'us-canada-territories-z7-z9.pmtiles')
Write-Host 'Built verified offline basemaps: world z0-z6 and US/Canada/territories z7-z9.'
