# Offline state package loader

The app has a dedicated path for installing complete public state catalogs. Select one `state.sqlite` file in **Settings → Maps → Add a map → From Files**. Each state is one package regardless of its GeoJSON import-part count. State catalog installation does not pass through the manual GeoJSON importer or consume its five slots or 50 MiB allowance. Installed public packages and private imports appear separately in **Maps**, with explicit visibility switches and coverage actions.

Stock builds include only the world/regional basemaps and an empty place catalog. New York is installed explicitly, just like other states. Removing or hiding its package does not reveal a bundled New York starter catalog underneath. The large world/regional basemap archives remain part of the base app; removing the starter catalog saves approximately 1.6 MB of geometry plus its embedded index.

Files imports use a compiled checksum allowlist. Open Outdoor Local additionally supports [signed updates from an explicitly trusted laptop](LAPTOP_STATE_UPDATES.md), without rebuilding the app for compatible state snapshots. Production signed-provenance and release-keyring integration remain separate gates under ADR-031.

See the [50-state installable catalog inventory](../archive/reports/STATE_LOADER_PACKAGE_INVENTORY_2026-09-27.md) for exact transfer and installed sizes. The original GeoJSON/index packages and parser-validated import parts remain available for export and smaller manual imports.

The native Files installer recognizes exact checksums pinned in the app's `loader-inventory.json`. Restore files from owner-managed external artifact storage using the corresponding revision's checksums; see [package maintenance](PACKAGE_MAINTENANCE.md). The optional [Connect to laptop](CONNECT_TO_LAPTOP.md) flow also accepts compatible public state snapshots signed by a laptop whose independent fingerprint you explicitly approved. Such updates retain hashes, storage checks, replay protection and atomic rollback; a new schema/app-major reader still requires a matching build. No automatic update or upstream source acquisition runs on the phone.

## Map, search and details

- Each SQLite file contains an embedded PMTiles v3 archive, original source geometry, visitor summaries, a full-text search index and a spatial index.
- Installation streams the SQLite copy and extracts the tile blob in 1 MiB chunks. The map reads the local PMTiles file directly, loading tiles for the visible region; the whole state is never passed as JavaScript GeoJSON.
- Source geometry, including elevation coordinates, remains unchanged in the catalog. Display tiles repair invalid polygons, handle antimeridian seams, simplify and quantize geometry. Their zoom range is 5–10, with native overzoom above 10; display precision does not increase when overzooming.
- Roads and trails are included from zoom 8. State POIs use the project's category colors, category filter and marker-detail zoom settings. State vector POIs are not clustered; bundled/manual-import markers retain their existing clustering.
- Search returns at most 30 state results using token-prefix matching. Detail queries retrieve one selected record. Geometry larger than 2 MiB is withheld from the JavaScript bridge, with an explicit message; the map, indexed record and authoritative on-disk geometry remain available.
- Numeric upstream names/units are converted to visitor text, with their original values retained as `sourceName`/`sourceUnit`. Source IDs are retained across state overlap and updates. Composed search deduplicates matching IDs and keeps public and private identities distinct. Existing notes remain associated with their original IDs.

## Storage and lifecycle

Public states live under protected, backup-excluded `Application Support/PublicStatePackages`, separate from the private user database, recording store and manual-import store. Existing private mobile overlays and private manual imports remain separate and display alongside installed public states. This builder does not read or distribute private packages.

The installer checks schema, public classification, whole-file checksum, embedded tile checksum and SQLite integrity before atomically publishing `active.json`. The preceding catalog remains available for explicit rollback. A protected previous registry snapshot supports recovery from a damaged active pointer. Startup rechecks installed catalogs; a failed current version falls back to a verified previous version, or is quarantined and hidden pending reinstall/removal. An interrupted copy never replaces the active pointer. Removing a state package does not remove journals, recordings or private user data.

The 3 GiB reference-catalog ceiling remains in place. This implementation reserves 1 GiB conservatively for existing bundled basemaps and legacy public/private references; installed states use their exact SQLite-plus-extracted-PMTiles sizes. Preflight includes current catalogs, retained previous versions, the proposed combined active catalogs, workspace of at least 1 GiB (or 25% of incoming combined catalogs), and a 2 GiB reserve. It never evicts user data. The 1 GiB baseline reservation is provisional and must be replaced by measured aggregate reference usage when additional private catalog loading is introduced.

Manual GeoJSON imports retain the existing 20 MiB, 20,000-feature and 200,000-coordinate limits per file, plus five datasets and 50 MiB combined storage. These are separate from the state loader.

## Build and verify

Use the optional loader dependency group in the repository's locked Python environment:

```powershell
uv sync --frozen --group loader
pnpm map:states:build
pnpm map:states:verify
pnpm test:state-loader
```

`tools/packages/build-state-loader.py --states NY CA --workers 2` rebuilds selected states. Default concurrency is two, capped at four processes. Use `--resume` to reuse matching completed catalogs after an interrupted build, then run the independent verifier. The builder reads only the public asset tree, verifies source/index hashes, rejects private/community fields, writes atomically, and updates the pinned loader inventory. Generated `state.sqlite` files remain local and ignored; Git tracks loader checksum pins only. The independent verifier checks all 50 source bindings, every original feature geometry, indexes, tile-blob hashes, PMTiles headers, read-only access and source notices.

## Acceptance status

The complete [unsigned iOS build](https://github.com/Bored-Anarchist/open-outdoor/actions/runs/36501088339) passed for code commit `277ba6d193f92f53cdc697b4b6cac9e1dcc72ce5`, including Swift compilation, Metro/Hermes bundling, app packaging and artifact upload. Automated build, Python, TypeScript and map-style/lifecycle checks do not establish native phone acceptance. Physical iPhone 14 measurements remain required before production acceptance. Required cases include a large state, several active states, cold restart, interrupted installation/update, low-space rejection, corruption fallback/quarantine, rollback, search and map selection, private/public coexistence, notes after removal and map/launch/memory performance. The import limits are not raised by this implementation.
