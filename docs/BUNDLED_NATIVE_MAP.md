# Bundled native map

The iOS app opens Explore with MapLibre Native, a bundled New York vector overview, and a bundled geographic overlay. Search a real trail or forest (for example, Slide), select a result to fit its bounds, or tap the map for source details. Drag/pinch to pan/zoom. Recording runs independently in Track; return to Explore to see the pink recorded route and use Show last recorded position. Pauses and recovery boundaries remain separate line segments.

The overlay snapshot contains 14,455 features: one New York boundary, 3,297 DEC land features, 1,308 DEC road features, 5,289 DEC hiking-trail features, and 4,560 DEC recreation points. The points include 1,456 primitive campsites, 792 campsites, 317 lean-tos, parking, launches, and other outdoor facilities. Its approximately 12 MB GeoJSON is a native app asset, while a 4.3 MB index supports search and details in JavaScript. This avoids serializing the full geometry over the React Native bridge. Geometry is simplified to approximately three metres and is display-only.

The guaranteed fallback basemap is a checksum-pinned 13,530,927-byte (12.90 MiB) PMTiles extract derived from OpenStreetMap and Natural Earth by Protomaps. It covers New York from zoom 0 through zoom 9 and is overzoomed beyond that level, while the separate DEC data retains trail, road, land, and recreation-point detail. The Protomaps light cartography and bundled Noto Sans variable font provide roads, settlements, water, land cover, parks, POIs, and labels without a tile, glyph, or sprite server. Required attribution is embedded in the source and repeated in the interface.

The app is offline-only. It never streams a basemap, style, glyph, sprite, overlay, or map update. A user who needs more contextual detail can obtain the separately distributed, checksum-approved 128.4 MiB zoom-12 New York PMTiles pack on another device or computer and import the local file through the iOS Files picker. The detailed pack is not part of the IPA or the Git repository. If an installed pack is absent, damaged, or incompatible, Explore uses the bundled overview instead of making a network request or showing a blank map.

The public map adapter is constructed synchronously and renders independently of the private
recorder store and tracking module. A recorder initialization or native-tracking failure disables
recording and reports its own diagnostic, but must not leave Explore at “Loading local map…”.
The native GeoJSON file URL, selected local basemap source, and overlay layers are supplied as one
initial MapLibre style. “Ready” is emitted only after MapLibre reports a fully rendered frame.

The offline basemap is contextual, not a surveyed property map or camping authorization. Its displayed bounds cover New York; adjacent edge tiles are included only where required by the tile grid. WP-304's full catalog facets and camping evidence are not substituted by this name-search interface.

## Reproduce and verify

- `pnpm map:acquire` explicitly refreshes the public GIS snapshot. It requires network access and system CA support; never runs during normal installation or application startup. Review changes before committing.
- `packages/map/src/assets/new-york-outdoors.manifest.json` records source query URLs, counts, hashes, dates, redistribution basis and attribution. The source registry already authorizes these NYS datasets. Only selected public fields and geometry are retained; no personal observations are included.
- The bundled overview manifest pins the Protomaps source date, source timestamp, bounds, zooms, compiler version, archive checksum, local font checksum, rights, and attribution. The 12.90 MiB overview is an ordinary Git binary asset, so every test and build checkout receives the same bytes without Git LFS.
- The optional detailed-pack allow-list records the approved file name, exact byte length, SHA-256, PMTiles/style compatibility, bounds, zooms, and attribution. Import verifies the local file before activation. Detailed pack binaries are distributed separately and are not committed to this repository.
- `pnpm test:map:browser` renders the real data using MapLibre GL JS and rejects external requests or page errors. The screenshot/report are written under `dist/outdoor-map`. This is supplemental rendering evidence, not native-device acceptance.
- `pnpm quality` verifies the overview/font checksums, local-only source resolution, network-free style, geometry, search, camera state and recording segment boundaries alongside the existing suites.
- `pnpm build:ios:bundle` verifies Metro bundling. The macOS workflow also compares byte length and SHA-256 inside the built `.app`, failing if the overview is missing or truncated and failing if the 134,642,224-byte detailed archive is present.

## Device checks after installation

1. Enable airplane mode before opening the app. Open Explore without an imported detailed pack and confirm overview roads, town names, water, land cover, green DEC lands and blue DEC trail lines all appear.
2. Force-quit and reopen while airplane mode remains enabled. Pan and zoom within New York and confirm the overview and DEC overlay remain visible without a network request.
3. Search Slide, select a trail and confirm its real geometry is highlighted. Clear selection, pan, pinch and use both zoom buttons.
4. Switch to Track and back. Confirm camera/selection persist. Text search and source details provide a non-gesture alternative.
5. Record outdoors, pause, move, resume and return to Explore. Confirm the recorded route appears without connecting the pause gap. Show last recorded position must use the recorded point without starting a new sensor session.
6. Import an approved detailed PMTiles file from local Files storage, remain in airplane mode, and confirm that Explore uses it. Remove or corrupt a test copy and confirm that the bundled overview returns without a blank map.
7. Perform the remaining guided accessibility, performance and endurance observations on this candidate. Automated tests do not count as these observations.

Physical evidence and independent review remain pending under ADR-050. Prior WP-301/WP-304 acceptance statements describe contract/index tests, not a delivered native map or a complete offline field beta.
