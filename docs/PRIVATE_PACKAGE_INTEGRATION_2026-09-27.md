# Private package integration — September 27, 2026

The remaining acquired Florida ZIP, Oklahoma KML, and preserved New York DEC elevation profiles are now integrated into the active private packages. Source files, derived geometry, profiles, and mobile staging remain Git-ignored. GitHub receives tooling, tests, and this counts-only report.

| Addition | Selection and validation | Active package result |
| --- | --- | --- |
| Florida state forests | Raw ZIP checksum and private receipt verified. Selected 76 polygons with nonempty `DESCRIPT` from `state_forests_mar25`; transformed EPSG:3087 to WGS84 and checked state bounds. Source describes March 2025 boundaries; visitor access remains unverified. | 16,534 agency features + 2,446 iOverlander places = **18,980 features**. |
| Oklahoma state parks | Raw KML checksum and private receipt verified. Selected 44 named State Park points, checked finite coordinates and Oklahoma bounds, and discarded HTML, images, and styles. Excluded seven federal entries and one canoe-trail entry with unclear management. Historical names and locations do not establish current management or access. | 423 agency features + 563 iOverlander places = **986 features**. |
| New York DEC hike profiles | Preserved asset and manifest checksums verified. All 5,289 IDs exactly match packaged DEC trails; every sample coordinate, distance, segment, elevation statistic, and endpoint matches the current route calculation. Existing terrain elevations were reused without new terrain requests. | **5,289 profiles** accompany the 15,640-feature DEC+iOverlander private catalog. Profiles are not additional map features. |

All **50 states** still have one active private package, with **446,522 agency/DEC features**, **63,333 iOverlander places**, and **509,855 total features**. The six iOverlander-only states remain CA, CT, MA, MI, MN, and NE. Publisher permission classifications are unchanged.

## Repeatable integration

Use Python 3.12 with the pinned shapefile dependencies installed under `PrivateData/vendor`, and the repository's Node 24 runtime.

```text
python tools/convert-private-agency-shapefiles.py FL
python tools/convert-private-agency-kml.py
node tools/build-private-state-agency-ioverlander.mjs FL
node tools/build-private-state-agency-ioverlander.mjs OK
node tools/package-private-new-york-hikes.mjs
node tools/stage-private-mobile-map.mjs --input "PrivateData/catalogs/US/New York/current"
node tools/report-private-state-packages.mjs
```

The New York catalog CLI also attaches profiles after each rebuild; `--profiles` overrides the preserved profile directory. Changed DEC route geometry requires matching profiles before staging succeeds. The mobile map alias now selects its matching hike asset: empty public profiles for public builds, verified private profiles for private builds.

Private mobile staging combines 326 public New York features with the 15,640 private DEC+iOverlander features, yielding **15,966 displayed features** and **5,289 profiles**. Public boundaries and federal data stay in the public system and are combined only at mobile staging. Historical archives retain their original files.

## Verification and remaining work

All 50 active package checksums and counts were verified, including the private New York profile manifest and geometry. Synthetic KML tests cover source selection, media removal, invalid coordinates, and XML entities. Profile tests cover missing IDs, changed geometry/statistics, and stale map bindings. Mobile staging passed with the actual private catalog; this is not a device-build or field-access verification.

The six unresolved agency source roles and two uncollected Michigan roles remain acquisition/permission work. The failed Florida park service child remains unavailable. Those gaps are documented in the [pipeline](PRIVATE_STATE_AGENCY_IOVERLANDER_PIPELINE_2026-09-27.md); they do not prevent the current 50 private packages from existing. General state-package app activation remains a separate release gate.
