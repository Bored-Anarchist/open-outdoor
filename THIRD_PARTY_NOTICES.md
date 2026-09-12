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

## WP-501 assets

The [product design system](docs/PRODUCT_DESIGN_SYSTEM.md) inventories the original, AI-assisted Open Outdoor tokens, icon geometry and map styles under Apache-2.0. No third-party visual assets or fonts were added. Playwright 1.62.1 (Apache-2.0) is a pinned development-only browser acceptance dependency; it is not shipped in the mobile application.

WP-502/WP-503 add axe-core 4.13.0 (MPL-2.0) and React/React Test Renderer 19.2.3 (MIT) as pinned development-only audit/test dependencies. No third-party visuals or native runtime dependencies were added. New implementation and test fixtures are project-authored with AI assistance under Apache-2.0; physical evidence remains deferred under ADR-049.


## Bundled native geographic map (reviewed 2026-09-11)

- MapLibre React Native 11.3.10, MapLibre contributors (copyright 2022) and Mapbox (2015-2020), MIT. Unmodified runtime dependency; source and binary redistribution permitted with the [complete license](docs/licenses/maplibre-react-native.txt). Canonical source: https://github.com/maplibre/maplibre-react-native.
- MapLibre Native iOS 6.26.0, MapLibre contributors (2021), MapTiler.com (2018-2021), Mapbox (2014-2020), BSD-2-Clause. Unmodified native renderer; source and binary redistribution permitted subject to the [complete license](docs/licenses/maplibre-native.txt). Canonical source: https://github.com/maplibre/maplibre-native.
- MapLibre GL JS 6.9.0, BSD-3-Clause, unmodified development preview dependency. The [complete upstream notice](docs/licenses/maplibre-gl.txt) includes the Mapbox-derived code notices. Canonical source: https://github.com/maplibre/maplibre-gl-js.
- New York GIS snapshot: NYS ITS Geospatial Services boundary and New York State Department of Environmental Conservation lands, roads and hiking trails. Exact source endpoints, dated page receipts, checksum, rights basis and attribution are recorded in `packages/map/src/assets/new-york-outdoors.manifest.json`. Public offline/source/binary redistribution follows the existing authorized NYS source registry and public GIS terms: https://gis.ny.gov/disclaimer and https://gisservices.dec.ny.gov/gis/dil/content.html?cat=CGS. Modified by field selection, geometry simplification and normalization; provided without warranty and not a legal survey or access authorization. No personal data or special retention obligation is introduced. Attribution appears beneath the map; these notices accompany source and distribution documentation.

The app includes the native renderer license text alongside map attribution. Preview-only GL JS notices remain in development/source distribution. Transitive licenses remain subject to the release SBOM and independent rights review; this addition does not mark that review complete.
