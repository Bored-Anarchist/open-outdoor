# Dependency baseline

Reviewed 2026-10-24 for PR #23. Exact application, development and optional Python dependencies are pinned in the manifests; resolved transitive packages and integrity hashes are in pnpm-lock.yaml and uv.lock. Versions were checked against the npm and PyPI registries and official tool releases. Only stable releases are selected.

## JavaScript packages

| Package | Selected version | Upstream license |
| --- | --- | --- |
| @maplibre/maplibre-react-native | 11.5.0 | MIT |
| @protomaps/basemaps | 5.7.2 | BSD-3-Clause |
| @types/node | 26.6.5 | MIT |
| @types/react | 19.3.0 | MIT |
| ajv | 8.20.0 | MIT |
| axe-core | 4.14.0 | MPL-2.0 |
| bonjour-service | 1.4.4 | MIT |
| expo | 58.0.17 | MIT |
| expo-asset | 58.0.18 | MIT |
| expo-status-bar | 58.0.4 | MIT |
| jsqr | 1.4.0 | Apache-2.0 |
| maplibre-gl | 6.15.0 | BSD-3-Clause |
| playwright | 1.64.1 | Apache-2.0 |
| polygon-clipping | 0.15.7 | MIT |
| prettier | 3.9.10 | MIT |
| qrcode | 1.5.4 | MIT |
| react | 19.3.0 | MIT |
| react-native | 0.88.0 | MIT |
| react-native-safe-area-context | 5.10.1 | MIT |
| react-test-renderer | 19.3.0 | MIT |
| typescript | 7.0.2 (workspace/browser); 6.0.3 (Expo mobile) | Apache-2.0 |
| vite | 8.3.5 | MIT |
| vitest | 5.0.5 | MIT |
| yaml | 2.9.1 | ISC |

React and React Test Renderer remain at Expo 58's supported 19.3.0 pair. The mobile package retains Expo's supported TypeScript 6.0.3; workspace and browser checks use TypeScript 7.0.2. React 19.3.1 and mobile TypeScript 7 are deliberately deferred until Expo supports them.

Expo 58.0.17 is the newest release allowed by the repository's 1,440-minute minimum release age at review time. Expo 58.0.18/58.0.19 and the associated CLI/module releases were still quarantined. The age policy remains unchanged. Offline Expo compatibility validation uses the installed SDK's bundledNativeModules.json; an online check may recommend those quarantined patches.

## Python packages

| Package | Selected version |
| --- | --- |
| numpy | 2.5.4 |
| pyproj | 3.8.0 |
| shapely | 2.2.0 |
| pyogrio | 0.13.0 |
| pyshp | 3.1.6 |
| mapbox-vector-tile | 2.2.0 |
| pmtiles | 3.8.1 |
| hatchling | 1.32.4 |

All optional groups were installed and tested under Python 3.15.1. Pyogrio uses its CPython stable-ABI wheel; pyclipper 1.4.0 builds from source on Windows for Python 3.15 and therefore needs a working C++ compiler. Transitive versions stay within their parent packages' supported constraints.

## External tooling and CI

| Tool | Selected version | Source / scope |
| --- | --- | --- |
| Node.js | 26.12.1 | [Official download](https://nodejs.org/en/download); current stable runtime |
| pnpm | 12.15.0 | [Upstream](https://github.com/pnpm/pnpm); exact packageManager and engine pins |
| Python | 3.15.1 | [Official releases](https://www.python.org/downloads/); standard GIL build |
| uv | 0.13.5 | [Upstream](https://github.com/astral-sh/uv); exact required-version |
| GDAL | 3.13.3 | [Official release](https://gdal.org/en/stable/download.html); optional GIS baseline |
| PostGIS | 3.6.4 | [Official releases](https://postgis.net/docs/release_notes.html); latest stable, 3.7 remains a release candidate |
| SQLite | 3.54.1 | [Official release](https://sqlite.org/download.html); optional tooling baseline, platform SQLite remains supplied by iOS/Python |
| go-pmtiles | 1.31.2 | [Official release](https://github.com/protomaps/go-pmtiles/releases/tag/v1.31.2); already current, extraction executable hash retained |
| Xcode | 27.1 | [Apple requirements](https://developer.apple.com/xcode/system-requirements); exact stable version on the [xcode-27 runner](https://github.com/actions/runner-images/blob/main/images/macos/xcode-27-arm64-Readme.md) |
| CocoaPods | 1.17.0 | [Official registry](https://rubygems.org/gems/cocoapods); supplied by the runner and verified before every native build |
| MapLibre Native iOS | 6.31.0 | [Upstream](https://github.com/maplibre/maplibre-gl-native-distribution/releases/tag/6.31.0); selected by MapLibre React Native 11.5.0 |
| actions/checkout | 7.0.1 | Already current; immutable commit retained |
| actions/setup-node | 7.1.0 | Updated immutable commit in public and downstream workflows |
| actions/setup-python | 7.1.0 | Updated immutable commit |
| actions/upload-artifact | 7.0.2 | Updated immutable commit |
| astral-sh/setup-uv | 10.3.2 | Updated immutable commit |

GDAL, PostGIS and standalone SQLite are configuration targets, not newly installed services or replacements for operating-system libraries. The tested Python runtime supplies SQLite 3.53.1; the pyogrio wheel supplies GDAL 3.12.4, pyproj supplies PROJ 9.8.1, and Shapely supplies GEOS 3.14.1. Those native libraries follow their upstream wheel/runtime distributions rather than the standalone tooling targets. Git, GitHub CLI, Windows, Apple frameworks and sideloading software are host prerequisites, not dependencies managed by these lockfiles. Historical acquisition tools, dataset snapshots and completed evidence retain their original provenance versions.

## Security and compatibility

The old Metro 0.84.4 and xcode 3 UUID overrides are obsolete with Expo 58's Metro 0.87.1 and xcode 4.0.0 and have been removed. Existing image and project-identifier compatibility tests now exercise these real Expo dependencies. The fast-uri override advances to 3.1.9, resolving four newly reported advisories without crossing the parent's supported major. Other scoped security overrides remain.

The Node 26 test run also exposed an ingestion deadline race: a parser result could win the promise race after its deadline when the event loop delayed the timeout callback. Ingestion now starts the timer before invoking the parser and checks monotonic elapsed time before accepting its result. A blocking-parser regression verifies that overdue output is quarantined.

The final npm audit reports two high-severity findings, zero critical, moderate or low findings:

- [node-forge signature verification, GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv): latest 1.4.0 is affected and no patched release is published.
- [Zod collection memory exhaustion, GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5): Expo CLI requires Zod 3.25.76; the patch is in Zod 4.6.6+. A forced major override is not a supported fix.

Both paths originate in Expo's CLI/build tooling. This does not establish that they are harmless or complete a release security audit. A future compatible upstream fix must be adopted; do not suppress these advisories.

## Validation

Local validation covers frozen installation, full pnpm quality checks, Python tests with all optional groups, the production browser build, Expo's bundled dependency compatibility map, Hermes iOS export, browser accessibility, map interaction and offline rendering. Native iOS compilation runs separately on the pinned macOS workflow; physical-device acceptance remains required. See PR #23 for the exact final command results and native build status.
