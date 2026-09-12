# Bundled native map

The iOS app opens Explore with MapLibre Native and a bundled geographic snapshot. Search a real trail or forest (for example, Slide), select a result to fit its bounds, or tap the map for source details. Drag/pinch to pan/zoom. Recording runs independently in Track; return to Explore to see the pink recorded route and use Show last recorded position. Pauses and recovery boundaries remain separate line segments.

The snapshot contains 9,895 features: one New York boundary, 3,297 DEC land features, 1,308 DEC road features and 5,289 DEC hiking-trail features. Its approximately 10 MB GeoJSON is bundled in the JavaScript application, so first launch does not download maps. No API key, tile server, external fonts or location permission is needed to browse. Geometry is simplified to approximately three metres and is display-only.

The public map adapter is constructed synchronously and renders independently of the private
recorder store and tracking module. A recorder initialization or native-tracking failure disables
recording and reports its own diagnostic, but must not leave Explore at “Loading local map…”.

This is partial basemap coverage. It does not include a full street network, terrain, comprehensive trail coverage, surveyed property lines, verified access or camping authorization. The statewide MBTiles compiler integration from WP-301 remains separate work. WP-304's full catalog facets and camping evidence are not substituted by this name-search interface.

## Reproduce and verify

- `pnpm map:acquire` explicitly refreshes the public GIS snapshot. It requires network access and system CA support; never runs during normal installation or application startup. Review changes before committing.
- `packages/map/src/assets/new-york-outdoors.manifest.json` records source query URLs, counts, hashes, dates, redistribution basis and attribution. The source registry already authorizes these NYS datasets. Only selected public fields and geometry are retained; no personal observations are included.
- `pnpm test:map:browser` renders the real data using MapLibre GL JS and rejects external requests or page errors. The screenshot/report are written under `dist/outdoor-map`. This is supplemental rendering evidence, not native-device acceptance.
- `pnpm quality` verifies geometry, snapshot integrity, search, camera state and recording segment boundaries alongside the existing suites.
- `pnpm build:ios:bundle` verifies bundling; the manual macOS workflow verifies native compilation. A new IPA must be installed because adding MapLibre changes native code.

## Device checks after installation

1. Open Explore in airplane mode. Confirm actual green land boundaries and blue trail lines appear. The old geometric fixture is removed from the iOS app.
2. Search Slide, select a trail and confirm its real geometry is highlighted. Clear selection, pan, pinch and use both zoom buttons.
3. Switch to Track and back. Confirm camera/selection persist. Text search and source details provide a non-gesture alternative.
4. Record outdoors, pause, move, resume and return to Explore. Confirm the recorded route appears without connecting the pause gap. Show last recorded position must use the recorded point without starting a new sensor session.
5. Perform the remaining guided accessibility, performance and endurance observations on this candidate. Automated tests do not count as these observations.

Physical evidence and independent review remain pending under ADR-050. Prior WP-301/WP-304 acceptance statements describe contract/index tests, not a delivered native map or a complete offline field beta.
