# Public and private package maintenance

## Storage policy

Git holds source definitions, rights decisions, adapters, schemas, tests, manifests, checksums, notices and inventories. Complete state GeoJSON, search indexes, import parts and SQLite files are ignored generated outputs, including for Git LFS. `pnpm map:storage:verify` enforces this in quality and privacy CI. This migration preserves local files and does not rewrite Git/LFS history: historical copies remain, but new versions no longer accumulate there.

`PrivateData/` stays local, ignored and excluded from public acquisition, public artifact storage and CI. The small default New York reference and fixed overview basemaps remain bundled application assets. The complete 50-state catalog distribution is removed from Git. Fresh clones contain state metadata; ordinary code checks use the bundled starter and synthetic fixtures without downloading 50 states.

## API acquisition and caching

Prefer reviewed APIs, state-specific queries and selected fields. National baseline and public agency acquisition query IDs and metadata before feature pages. Local checksum-verified inputs are reused only with a positive publisher edit revision and matching query/configuration and metadata signature. Public agency license checks run before reuse. Missing revisions, changed queries or corrupt caches require acquisition; use `--refresh` to bypass public cache reuse when auditing or suspecting stale publisher metadata.

Public agency raw inputs stay in `.tmp-public-agency/`; normalized national caches stay in `.tmp-state-source-cache/`. These are disposable ignored caches. Private inputs stay in `PrivateData/agency-feeds/`. ZIP/KML/geodatabase-only sources still require local downloads. iOverlander updates use reviewed local archives; no iOverlander API is assumed.

This is revision-based reuse, not record-level delta synchronization. Changed sources fetch selected records in pages. Phones still install a complete replacement state SQLite file and require a build with its updated checksum pin.

## Public update commands

Use the pinned Node/pnpm/Python environments and geospatial dependencies from the [format guide](PUBLIC_STATE_PACKAGE_FORMAT.md) and [loader guide](STATE_PACKAGE_LOADER.md). For example:

```powershell
pnpm map:acquire:states -- --states CO
pnpm map:public:agency -- co-cpw-trails
pnpm exec tsc -b packages/shared
pnpm exec vite build --config tools/public-state-parser.config.ts
node tools/build-public-state-packages.mjs CO
python tools/build-state-loader.py --states CO --workers 2
```

Add `--refresh` to either acquisition command to bypass its cache. Public packaging requires all configured agency inputs for the selected state; acquire missing sources first. National acquisition replaces the baseline, so rerun public packaging afterward. New York retains its reviewed public acquisition/composition path and bundled starter.

For complete release verification, restore or acquire all required states, then run `pnpm map:public:verify`, `pnpm map:states:verify` and `pnpm test:state-loader`. Missing inputs remain errors. Rerun private deduplication after public changes. Commit verified manifests, pins, notices and counts; leave generated files ignored.

## Restore exact snapshots from external storage

Use an owner-managed external directory or HTTPS object store for exact pinned snapshots. Organize verified local files as `<STATE>/outdoors.geojson`, `<STATE>/index.json`, `<STATE>/state.sqlite` and optional `<STATE>/parts/outdoors-NNN.geojson`. Use immutable release/checksum paths and a retention policy for required releases. Never put private data in the public store.

```powershell
pnpm map:public:restore -- NY CO --from D:\OutdoorArtifacts\release-2026-09-28
$env:OPEN_OUTDOOR_PUBLIC_ARTIFACT_BASE_URL = 'https://your-artifact-host.example/public/release-2026-09-28/'
pnpm map:public:restore -- CO --parts
```

No host is provisioned or configured by this change. Populate a mirror from verified generated local outputs using your storage provider's tooling. Restore streams one file at a time, skips intact local files, verifies committed size/SHA-256, and replaces only verified files. Redirects and credential-bearing base URLs are rejected. Restoration does not activate phone catalogs or grant distribution rights. API rebuilds may differ from historical snapshots: restore historical pins from a mirror or review and commit new rebuild pins.

## Private refresh and recovery

Existing staging commands retain first-acquisition behavior. Add `--refresh` to recheck existing sources:

```powershell
node tools/stage-provisional-agency-feeds.mjs --state CO --max-features 200000 --refresh
node tools/stage-provisional-agency-children.mjs --state CO --max-features 200000 --refresh
node tools/stage-private-agency-resolutions.mjs --state CO --max-features 200000 --refresh
node tools/state-agency-feeds.mjs refresh <feed-id> [child-layer-id]
node tools/build-private-state-agency-ioverlander.mjs CO
pnpm map:private:verify
```

Refresh checks approval before queries or reuse. Unchanged ArcGIS edit revisions and intact local bytes skip feature download. Changed sources acquire selected pages and check the revision again before activating the receipt. Content-named raw files are written before an atomic receipt switch; the previous receipt and input remain recoverable. File-only sources are downloaded and require their local converters again before rebuilding. New York retains its separate private pipeline.

Do not clear `PrivateData/` as a cache. Keep active and previous inputs, community enrichments, and audit/rollback dependencies; older unreferenced inputs can be reviewed and removed locally. Disposable public caches can be cleared at the cost of fetching again. Source cache correctness depends on publishers updating edit revisions correctly.

## Validation

Maintenance tests cover revision/query invalidation, corrupted caches, private approval and failed refresh recovery, streaming artifact integrity and prohibited Git paths. Existing source/package tests remain in quality checks. Full dataset verification runs locally after inputs are present; code CI does not store full catalogs.
