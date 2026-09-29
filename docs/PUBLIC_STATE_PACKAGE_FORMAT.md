# Public state package format

The public state packages follow the private catalog system's GeoJSON and checksum-manifest structure, with a public search index and app import parts. They use the iOverlander POI legend supported by the app and the traveler/amenity requirements in [PROJECT_SCOPE.md](../PROJECT_SCOPE.md#121-entity-taxonomy-and-retention-requirements). No iOverlander source records, descriptions, check-ins, contributor identities or media are public inputs.

Every state, including New York, lives under `packages/map/src/assets/state-packages/US/<code>/`:

| File | Purpose |
| --- | --- |
| `state.sqlite` | Dedicated one-file state installation: indexed catalog plus embedded local PMTiles; pinned by `loader-inventory.json`. See [state loader](STATE_PACKAGE_LOADER.md). |
| `outdoors.geojson` | Full reference GeoJSON: POIs, land polygons, roads, trails and boundaries retain independent feature types and source lineage. |
| `index.json` | Matching stable IDs, bounding boxes and visitor/search properties. |
| `manifest.json` | Classification, state, package mode, counts, `output` descriptor, artifact hashes, source acquisition receipts, licenses, attribution, rejected-geometry counts and import-part inventory. |
| `parts/outdoors-NNN.geojson` | Selected import files validated with the actual app parser. |
| `DATA_NOTICES.md` | Agency credits, source notices, licenses and marked modifications. |

The parent `inventory.json` and [state inventory](PUBLIC_STATE_PACKAGE_INVENTORY_2026-09-27.md) list all 50 packages. National source entries are preserved across builds. Shared parks/forestry source roles acquire each distinct feed once; separate layers within a feed, such as Massachusetts points and lines, keep separate identities. The public builder reads only the public assets, public source configuration, and checksum-verified public acquisition staging. It never reads `PrivateData` or exports private source records.

`properties.category` uses an app-supported iOverlander category for POIs. `properties.sourceCategory` retains the original source designation. Developed camping, primitive camping, parking, water, dump stations, lodging, food, shopping, medical and visitor attractions are mapped from source types, without using place names to infer facilities or camping permission. Toilets and unsupported source types remain Other with their raw type and bounded amenity details. Maintenance defects and survey-only Massachusetts point records are filtered from the visitor POI derivative; geometryless or invalid agency records are rejected and counted. Conditions and restrictions are not inferred from signs, ownership or old status fields.

The full GeoJSON is the authoritative package; it can exceed the user-import limits. Import parts retain source identity and visitor fields, while omitting bulky source details. Parts stay below conservative byte, feature and coordinate budgets and pass all real parser checks, including polygon rings, MultiPoint expansion and normalized size. Oversized multipart geometry may be separated into parts with a parent feature ID; coordinates are preserved. The app still limits stored imports to five datasets and 50 MiB total. Select a useful group of parts within those limits; complete states use the dedicated [state loader](STATE_PACKAGE_LOADER.md).

## Rebuild and verify

Use the repository's pinned Node and pnpm versions. CAL FIRE's geodatabase conversion needs the pinned public Python dependencies installed in an ignored cache. Use the same Python executable for installation and conversion (`PUBLIC_AGENCY_PYTHON` may specify it).

```powershell
python -m pip install --use-feature=truststore --target .tmp-public-geo -r tools/public-agency-geodatabase-requirements.txt
pnpm map:public:agency
pnpm map:public:package
pnpm map:public:verify
```

`map:public:agency` rechecks Supported source decisions and live applicable terms, enumerates ArcGIS object IDs, rejects incomplete pages, checks source-specific selections, converts the eligible CAL FIRE ZIP, and saves public raw acquisitions in `.tmp-public-agency/`. Its source selection is pinned in `config/public-state-agency-sources.json`. Missing configured receipts or checksum mismatches stop packaging. Four exact Minnesota/Virginia conditional feeds have a scoped clearance in `tools/conditional-public-agency.mjs`; broadened selections or commercial distribution fail that clearance. Other conditional, unconfirmed, restricted and permission-required sources retain their gates. See the [condition review](CONDITIONAL_PUBLIC_DATA_2026-09-28.md).

If the national baseline needs refreshing, run `pnpm map:acquire:states` first, then rerun the public acquisition, packaging and verification commands. The current New York baseline remains its audited civil-boundary/federal asset; DEC and OPRHP features are excluded. New York's state package and default app assets are synchronized, and the public empty hike-profile document is bound to the corrected map checksum. Restage a local private mobile build after public map changes with `pnpm map:private:stage`; private source catalogs are preserved.

## Dated agency references

Connecticut, Massachusetts, Nebraska, Nevada, Utah, Colorado, Arkansas, California, Minnesota and Virginia contribute eligible direct agency datasets. Arkansas facilities, Massachusetts's 2015 trail baseline, and CAL FIRE's 2024 forest boundaries are explicitly historical references. Arkansas's current facility verification and CAL FIRE's conflicting forest counts are unresolved; their manifests do not assert complete coverage or current access. Minnesota contributes filtered hiking and campground derivatives with MNDNR credit, reference-only notices and directions disabled. Virginia DCR contributes trails and boundaries under its no-profit redistribution condition for this noncommercial application. Conditions and source credits survive manual imports and catalog search/details; full notices are embedded in SQLite. Other permission-held agency material remains in the private system.

The source rights matrix remains the record of Supported, Conditional and held rights decisions. Scoped derivative receipts retain `upstreamRightsStatus: Conditional`, with their exact distribution conditions; they do not relicense source data under the project code license. Packaging a dated reference does not turn it into a live closure, legal-access or camping determination. The dedicated state loader is implemented and separately verified; physical iPhone acceptance remains pending.
