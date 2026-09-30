# Third-Party Notices

The repository includes pinned application dependencies and the public New York geographic snapshot described below. Release inventories supplement these notices.

Before any third-party item is committed or distributed, the implementing pull request must record:

- name, owner, canonical URL, and exact version or content checksum;
- license or permission basis and review date;
- copyright and required attribution text;
- modifications made by the project;
- allowed source, binary, offline, public, and private distribution;
- retention or deletion obligations; and
- where the notice must appear in source, the application, and release artifacts.

Each release must generate a software bill of materials and a separate data/asset bill of materials. Those generated inventories supplement this file and control the exact third-party contents of that release.

## Known planned integrations

The project scope names candidate technologies and data sources, but naming a candidate is not a license determination and does not mean it is included. No candidate enters source control, CI artifacts, catalogs, or releases until its manifest passes the rights process in [the data, privacy, and rights plan](docs/DATA_PRIVACY_RIGHTS_PLAN.md).

## Laptop discovery and QR pairing (reviewed 2026-09-30)

These unmodified pinned dependencies run on the laptop or in synthetic tests and are not bundled into the mobile application. Source, binary and offline redistribution is permitted with the complete licenses linked below; public/private distribution does not change those obligations. No retention/deletion obligations are introduced. Notices accompany source and any distribution of the laptop tooling; release SBOMs cover exact transitive packages. Native scanning uses the existing Apple SDK's AVFoundation framework.

Signed laptop updates add original, AI-assisted project code and synthetic tests under Apache-2.0. Node's built-in crypto/filesystem APIs and Apple's CryptoKit/Security frameworks provide signing, verification and device-only trust persistence. No additional dependency, third-party data or production signing key is incorporated; runtime-generated synthetic private test keys are never emitted in fixture vectors or artifacts.

- bonjour-service 1.4.4, ON LX Limited (2021), with portions by Thomas Watson Steen (2015–2016), MIT. [Canonical source](https://github.com/onlxltd/bonjour-service), [complete license](docs/licenses/bonjour-service.txt). Laptop-only mDNS publication; scoped address configuration without dependency modifications.
- qrcode 1.5.4, Ryan Day (2012), MIT. [Canonical source](https://github.com/soldair/node-qrcode), [complete license](docs/licenses/qrcode.txt). Laptop-only SVG QR generation.
- jsQR 1.4.0, Cosmo Wolfe and contributors, Apache-2.0. [Canonical source](https://github.com/cozmo/jsQR), [complete license](docs/licenses/jsqr.txt). Test-only independent QR decoding; no third-party image is incorporated.

## WP-501 assets

The [product design system](docs/PRODUCT_DESIGN_SYSTEM.md) inventories the original, AI-assisted Open Outdoor tokens, icon geometry and map styles under Apache-2.0. Playwright 1.62.1 (Apache-2.0) is a pinned development-only browser acceptance dependency; it is not shipped in the mobile application.

WP-502/WP-503 add axe-core 4.13.0 (MPL-2.0) and React/React Test Renderer 19.2.3 (MIT) as pinned development-only audit/test dependencies. No third-party visuals or native runtime dependencies were added. New implementation and test fixtures are project-authored with AI assistance under Apache-2.0; physical evidence remains deferred under ADR-049.


## Bundled native geographic map (reviewed 2026-09-11)

- MapLibre React Native 11.3.10, MapLibre contributors (copyright 2022) and Mapbox (2015-2020), MIT. Unmodified runtime dependency; source and binary redistribution permitted with the [complete license](docs/licenses/maplibre-react-native.txt). Canonical source: https://github.com/maplibre/maplibre-react-native.
- MapLibre Native iOS 6.26.0, MapLibre contributors (2021), MapTiler.com (2018-2021), Mapbox (2014-2020), BSD-2-Clause. Unmodified native renderer; source and binary redistribution permitted subject to the [complete license](docs/licenses/maplibre-native.txt). Canonical source: https://github.com/maplibre/maplibre-native.
- MapLibre GL JS 6.9.0, BSD-3-Clause, unmodified development preview dependency. The [complete upstream notice](docs/licenses/maplibre-gl.txt) includes the Mapbox-derived code notices. Canonical source: https://github.com/maplibre/maplibre-gl-js.
- Protomaps Basemaps 5.7.2, Protomaps authors, BSD-3-Clause. Its unmodified light style generator is a runtime dependency. The bundled world and US/Canada PMTiles archives were produced from the Protomaps 2026-09-10 daily build with go-pmtiles 1.31.2 by regional and zoom extraction only. Software and data notices are included in [the software license](docs/licenses/protomaps-basemaps.md) and [data license inventory](docs/licenses/protomaps-data.md). Canonical source: https://github.com/protomaps/basemaps.
- OpenStreetMap contributors, Open Database License 1.0. The bundled offline archives are regional extracts and remain available under the same license. They are modified only by regional and zoom extraction. Attribution appears beneath the map. License: https://opendatacommons.org/licenses/odbl/1-0/. Copyright: https://www.openstreetmap.org/copyright.
- Noto Sans variable font, Noto Project authors, SIL Open Font License 1.1. The unmodified pinned font supplies local map labels and is bundled in the app. The [complete license](docs/licenses/noto-sans-ofl.txt) accompanies source distribution. Canonical source: https://github.com/notofonts/latin-greek-cyrillic.
- New York GIS snapshot: NYS ITS Geospatial Services boundary and New York State Department of Environmental Conservation lands, roads and hiking trails. Exact source endpoints, dated page receipts, checksum, rights basis and attribution are recorded in `packages/map/src/assets/new-york-outdoors.manifest.json`. Public offline/source/binary redistribution follows the existing authorized NYS source registry and public GIS terms: https://gis.ny.gov/disclaimer and https://gisservices.dec.ny.gov/gis/dil/content.html?cat=CGS. Modified by field selection, geometry simplification and normalization; provided without warranty and not a legal survey or access authorization. No personal data or special retention obligation is introduced. Attribution appears beneath the map; these notices accompany source and distribution documentation.

The app includes the native renderer license text alongside map attribution. Preview-only GL JS notices remain in development/source distribution. Transitive licenses remain subject to the release SBOM and independent rights review; this addition does not mark that review complete.

## Public state catalogs and build tooling (reviewed 2026-09-27)

The current public New York snapshot supersedes the earlier snapshot described above: DEC records and hike profiles are held in the private system. Its 326 public features contain the civil boundary and eligible federal records. All 50 public states retain their exact source receipts, rights classifications, attribution and full `DATA_NOTICES.md` under `packages/map/src/assets/state-packages/US/<state>/`; the SQLite loader embeds those notices and exposes them in the app. Converting the public GeoJSON to indexed SQLite and simplified display tiles does not change the original data license or access limitations. No iOverlander source records or permission-held agency datasets are included in these public catalogs.

The following unmodified Python packages are build-only tools, pinned in `tools/state-loader-requirements.txt` and installed locally in a Git-ignored directory. Their code and native libraries are not embedded in the catalogs or mobile app. Canonical licenses accompany the installed distributions; redistribution of the tools themselves must retain the applicable full license and copyright notices. No additional retention or deletion obligation is introduced by these direct tools.

| Tool and owner | Exact version | License and canonical source | Modifications / distribution |
| --- | --- | --- | --- |
| mapbox-vector-tile, Tilezen contributors | 2.2.0 | [MIT](https://github.com/tilezen/mapbox-vector-tile/blob/master/LICENSE) | Unmodified development dependency; license permits source/binary redistribution with notices. |
| pmtiles, Protomaps LLC | 3.7.0 | [BSD-3-Clause](https://github.com/protomaps/PMTiles/blob/main/LICENSE) | Unmodified development dependency; license permits source/binary redistribution with notices. |
| Shapely, Sean Gillies and contributors | 2.1.2 | [BSD-3-Clause](https://github.com/shapely/shapely/blob/2.1.2/LICENSE.txt) | Unmodified development dependency; its GEOS/native wheel notices remain with the local install. |
| pyproj, Jeffrey Whitaker and contributors | 3.7.2 | [MIT](https://github.com/pyproj4/pyproj/blob/3.7.2/LICENSE) | Unmodified development dependency; its PROJ/native wheel notices remain with the local install. |

The application continues to use its existing platform SQLite and MapLibre runtime dependencies. Build-environment transitive dependencies and native wheel contents must be included when generating the build SBOM; this record does not claim a completed independent release audit.

## Minnesota and Virginia conditional public agency derivatives

Minnesota Department of Natural Resources (MNDNR): selected State Park Trails and Roads hiking records and State Forest Campgrounds visitor records. [MNDNR GIS terms](https://www.dnr.state.mn.us/sitetools/data_software_license_plain.html) remain applicable: credited modified subsets, reference only, no navigation or legal-boundary/access use, no endorsement. Entire source datasets and Forest Stand Inventory are excluded. Complete terms and exact evidence are carried in the Minnesota package notices and acquisition receipts.

Virginia Department of Conservation and Recreation (DCR): State Park Trails and State Park Boundaries. Redistribution for profit is prohibited; these processed data are distributed for this noncommercial application with DCR credit and separate source terms. They are outside the project code license. See [the conditional public-data review](docs/CONDITIONAL_PUBLIC_DATA_2026-09-28.md) and the Virginia package DATA_NOTICES.md.
