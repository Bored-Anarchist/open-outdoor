# Bundled native map

The iOS app opens Explore with MapLibre Native, a tiered offline vector basemap, and a bundled New York geographic overlay. Search a real trail or forest (for example, Slide), select a result to fit its bounds, or tap the map for source details. Drag/pinch to pan/zoom. Recording runs independently in Track; return to Explore to see the pink recorded route and use Show last recorded position. Pauses and recovery boundaries remain separate line segments.

The overlay snapshot contains 14,455 features: one New York boundary, 3,297 DEC land features, 1,308 DEC road features, 5,289 DEC hiking-trail features, and 4,560 DEC recreation points. The points include 1,456 primitive campsites, 792 campsites, 317 lean-tos, parking, launches, and other outdoor facilities. Its approximately 12 MB GeoJSON is a native app asset, while a 4.3 MB index supports search and details in JavaScript. This avoids serializing the full geometry over the React Native bridge. Geometry is simplified to approximately three metres and is display-only.

The guaranteed fallback basemap consists of two checksum-pinned PMTiles extracts derived from OpenStreetMap and Natural Earth by Protomaps. A 44,885,093-byte (42.81 MiB) archive covers the world from zoom 0 through zoom 6. Above it, a 373,299,485-byte (356.01 MiB) archive adds zoom 7 through zoom 9 for Canada, the 50 United States, Puerto Rico, the US Virgin Islands, Guam, the Northern Mariana Islands, American Samoa, and every US Minor Outlying Island. Their combined installed storage is 418,184,578 bytes (398.81 MiB), including the two PMTiles files but excluding the shared font and application code.

The world archive remains a separate MapLibre source and is overzoomed beyond zoom 6. The regional source is drawn above it beginning at zoom 7 and is overzoomed beyond zoom 9. This separation guarantees that the rest of the world continues to display its zoom-6 overview when the camera zoom exceeds 6; a single sparse archive advertising zoom 9 globally would instead cause missing regional tile requests. The separate DEC data retains New York trail, road, land, and recreation-point detail. Protomaps light cartography and the bundled Noto Sans variable font provide roads, settlements, water, land cover, parks, POIs, and labels without a tile, glyph, or sprite server.

The app is offline-only. It never streams or imports a basemap, style, glyph, sprite, overlay, or map update. The fixed two-tier basemap is overzoomed above zoom 9 while the separate DEC and iOverlander overlays retain their close-zoom geometry and place detail.

The public map adapter is constructed synchronously and renders independently of the private
recorder store and tracking module. A recorder initialization or native-tracking failure disables
recording and reports its own diagnostic, but must not leave Explore at “Loading local map…”.
The native GeoJSON file URL, selected local basemap source, and overlay layers are supplied as one
initial MapLibre style. “Ready” is emitted only after MapLibre reports a fully rendered frame.

The offline basemap is contextual, not a surveyed property map or camping authorization. Its displayed bounds cover New York; adjacent edge tiles are included only where required by the tile grid. WP-304's full catalog facets and camping evidence are not substituted by this name-search interface.

## Reproduce and verify

- `pnpm map:acquire` explicitly refreshes the public GIS snapshot. It requires network access and system CA support; never runs during normal installation or application startup. Review changes before committing.
- `packages/map/src/assets/new-york-outdoors.manifest.json` records source query URLs, counts, hashes, dates, redistribution basis and attribution. The source registry already authorizes these NYS datasets. Only selected public fields and geometry are retained; no personal observations are included.
- The two bundled manifests pin the Protomaps source date, source timestamp, zooms, compiler version, archive checksums, local font checksum, rights, and attribution. The regional manifest also pins the Natural Earth revision, input checksum, deterministic extraction-boundary checksum, selected map units, and explicit minor-island inventory.
- The 42.81 MiB world overview is an ordinary Git binary. The 356.01 MiB regional archive exceeds GitHub's ordinary 100 MB object limit and is stored in Git LFS. Lightweight CI validates its LFS object ID and declared byte length; the macOS device-build workflow downloads the real object and verifies that both exact archives are embedded.
- `pnpm test:map:browser` renders the real data using MapLibre GL JS and rejects external requests or page errors. The screenshot/report are written under `dist/outdoor-map`. This is supplemental rendering evidence, not native-device acceptance.
- `pnpm quality` verifies the overview/font checksums, local-only source resolution, network-free style, geometry, search, camera state and recording segment boundaries alongside the existing suites.
- `pnpm build:ios:bundle` verifies Metro bundling. The macOS workflow also compares byte length and SHA-256 inside the built `.app`, failing if either fixed offline archive is missing or truncated.

## Device checks after installation

1. Enable airplane mode before opening the app. Open Explore and confirm overview roads, town names, water, land cover, green DEC lands and blue DEC trail lines all appear.
2. Force-quit and reopen while airplane mode remains enabled. Pan within New York and Canada through zoom 9, then pan to Europe or Asia above zoom 6 and confirm the overzoomed world overview remains visible without a network request.
3. Search Slide, select a trail and confirm its real geometry is highlighted. Clear selection, pan, pinch and use both zoom buttons.
4. Switch to Track and back. Confirm camera/selection persist. Text search and source details provide a non-gesture alternative.
5. Record outdoors, pause, move, resume and return to Explore. Confirm the recorded route appears without connecting the pause gap. Show last recorded position must use the recorded point without starting a new sensor session.
6. Perform the remaining guided accessibility, performance and endurance observations on this candidate. Automated tests do not count as these observations.

Physical evidence and independent review remain pending under ADR-050. Prior WP-301/WP-304 acceptance statements describe contract/index tests, not a delivered native map or a complete offline field beta.
