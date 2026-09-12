# Bundled native map

The iOS app opens Explore with MapLibre Native, a complete connected vector basemap, and a bundled geographic overlay. Search a real trail or forest (for example, Slide), select a result to fit its bounds, or tap the map for source details. Drag/pinch to pan/zoom. Recording runs independently in Track; return to Explore to see the pink recorded route and use Show last recorded position. Pauses and recovery boundaries remain separate line segments.

The overlay snapshot contains 14,455 features: one New York boundary, 3,297 DEC land features, 1,308 DEC road features, 5,289 DEC hiking-trail features, and 4,560 DEC recreation points. The points include 1,456 primitive campsites, 792 campsites, 317 lean-tos, parking, launches, and other outdoor facilities. Its approximately 12 MB GeoJSON is a native app asset, while a 4.3 MB index supports search and details in JavaScript. This avoids serializing the full geometry over the React Native bridge. Geometry is simplified to approximately three metres and is display-only.

The full contextual basemap uses a pinned OpenFreeMap Liberty style and connected OpenMapTiles vector tiles derived from OpenStreetMap. It supplies roads, settlements, water, land cover, parks, buildings, POIs, and labels without an API key. Required attribution is embedded in the style and repeated in the interface. The stored DEC overlay remains renderable when tile requests fail, but this is not yet a downloadable full offline basemap; the self-generated MBTiles release artifact remains required for that claim.

The public map adapter is constructed synchronously and renders independently of the private
recorder store and tracking module. A recorder initialization or native-tracking failure disables
recording and reports its own diagnostic, but must not leave Explore at “Loading local map…”.
The native GeoJSON file URL, complete basemap sources, and overlay layers are supplied as one
initial MapLibre style. “Ready” is emitted only after MapLibre reports a fully rendered frame.

The connected basemap is contextual, not a surveyed property map or camping authorization. The statewide offline MBTiles compiler integration from WP-301 remains separate work. WP-304's full catalog facets and camping evidence are not substituted by this name-search interface.

## Reproduce and verify

- `pnpm map:acquire` explicitly refreshes the public GIS snapshot. It requires network access and system CA support; never runs during normal installation or application startup. Review changes before committing.
- `packages/map/src/assets/new-york-outdoors.manifest.json` records source query URLs, counts, hashes, dates, redistribution basis and attribution. The source registry already authorizes these NYS datasets. Only selected public fields and geometry are retained; no personal observations are included.
- `pnpm test:map:browser` renders the real data using MapLibre GL JS and rejects external requests or page errors. The screenshot/report are written under `dist/outdoor-map`. This is supplemental rendering evidence, not native-device acceptance.
- `pnpm quality` verifies geometry, snapshot integrity, search, camera state and recording segment boundaries alongside the existing suites.
- `pnpm build:ios:bundle` verifies bundling; the manual macOS workflow verifies native compilation. A new IPA must be installed because adding MapLibre changes native code.

## Device checks after installation

1. Open Explore while connected. Confirm roads, town names, water, land cover, green DEC lands and blue DEC trail lines all appear.
2. Enable airplane mode and reopen Explore. Confirm the stored DEC land and trail overlay still renders even though the connected contextual basemap is unavailable.
3. Search Slide, select a trail and confirm its real geometry is highlighted. Clear selection, pan, pinch and use both zoom buttons.
4. Switch to Track and back. Confirm camera/selection persist. Text search and source details provide a non-gesture alternative.
5. Record outdoors, pause, move, resume and return to Explore. Confirm the recorded route appears without connecting the pause gap. Show last recorded position must use the recorded point without starting a new sensor session.
6. Perform the remaining guided accessibility, performance and endurance observations on this candidate. Automated tests do not count as these observations.

Physical evidence and independent review remain pending under ADR-050. Prior WP-301/WP-304 acceptance statements describe contract/index tests, not a delivered native map or a complete offline field beta.
