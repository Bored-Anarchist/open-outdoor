# Bundled native map

The iOS app opens Explore with MapLibre Native, a tiered offline vector basemap, and a bundled federal New York geographic overlay. Search a federal park or campground, select a result to fit its bounds, or tap the map for source details. Drag/pinch to pan/zoom. Recordings remain available; DEC trail-derived hike profiles are held in the private archive pending redistribution permission.

The current public overlay has 325 features: 88 official NPS park/campground/alert/boundary features and 237 official USFS Finger Lakes ownership/recreation/MVUM features. The BLM New York query returned zero managed-land features. The former 14,780-feature overlay, including 14,455 New York state-agency features, and its 5,289 trail-derived elevation profiles are preserved under ignored `PrivateData/catalogs/US/New York/rights-held-2026-09-27/`. Current public geometry is simplified for display and is not a legal boundary.

The guaranteed fallback basemap consists of two checksum-pinned PMTiles extracts derived from OpenStreetMap and Natural Earth by Protomaps. A 44,885,093-byte (42.81 MiB) archive covers the world from zoom 0 through zoom 6. Above it, a 373,299,485-byte (356.01 MiB) archive adds zoom 7 through zoom 9 for Canada, the 50 United States, Puerto Rico, the US Virgin Islands, Guam, the Northern Mariana Islands, American Samoa, and every US Minor Outlying Island. Their combined installed storage is 418,184,578 bytes (398.81 MiB), including the two PMTiles files but excluding the shared font and application code.

The world archive remains a separate MapLibre source and is overzoomed beyond zoom 6. The regional source is drawn above it beginning at zoom 7 and is overzoomed beyond zoom 9. This separation guarantees that the rest of the world continues to display its zoom-6 overview when the camera zoom exceeds 6; a single sparse archive advertising zoom 9 globally would instead cause missing regional tile requests. State-agency trail, road, land, and recreation-point detail is available only in the private archive. Protomaps light cartography and the bundled Noto Sans variable font provide roads, settlements, water, land cover, parks, POIs, and labels without a tile, glyph, or sprite server.

The app is offline-only. It never streams or imports a basemap, style, glyph, or sprite. Users can explicitly import local GeoJSON overlays from Files; no dataset acquisition or map update happens automatically. The fixed two-tier basemap is overzoomed above zoom 9 while the separate outdoor overlays retain their close-zoom geometry and place detail.

The standard public build bundles NPS and USFS coverage; the verified BLM query contributes zero features. A private build stages the composed catalog from the ignored `PrivateData` root and substitutes it at Metro resolution time, adding DEC reference data and iOverlander places to the federal base. Contributor identifiers are discarded, and private narratives remain outside the public catalog. The selected card appears below the map with source details and access notes. Visitor information is an offline snapshot; verify current conditions with the source.

Selecting any mapped feature also opens a private place journal. Check in now to append a local timestamp and save the current note, or save a note without checking in. These entries are stored in the protected writable user store, remain independent of the read-only catalog across catalog refreshes, and are included in encrypted private backups. A local check-in does not authenticate with or post data to iOverlander.

The same selection card has a Get directions action. On iOS it presents Apple Maps plus installed Google Maps and Waze apps, with a system share-sheet fallback for another app or the raw coordinates. The handoff contains only the selected destination: an exact coordinate for points or the center of the mapped bounds for areas and trails. Open Outdoor does not send the user's current position; the chosen map app obtains its own start location and owns route calculation, permissions, connectivity, downloaded maps, and turn-by-turn guidance. In-app turn instructions and rerouting remain out of scope.

The public map adapter is constructed synchronously and renders independently of the private
recorder store and tracking module. A recorder initialization or native-tracking failure disables
recording and reports its own diagnostic, but must not leave Explore at “Loading local map…”.
The native GeoJSON file URL, selected local basemap source, and overlay layers are supplied as one
initial MapLibre style. “Ready” is emitted only after MapLibre reports a fully rendered frame.

The offline basemap is contextual, not a surveyed property map or camping authorization. Its displayed bounds cover New York; adjacent edge tiles are included only where required by the tile grid. WP-304's full catalog facets and camping evidence are not substituted by this name-search interface.

## Visitor information in public datasets

The NPS acquisition retains bounded park/campground/alert descriptions, activities, selected campground amenities, standard operating hours, entrance/campground fee descriptions, and arrival instructions. NPS park boundaries receive their parent park's visitor details. The refreshed public NPS snapshot is acquired with `NPS_API_KEY` held only in the acquisition process; no key enters the source code, snapshot, manifest, or app.

USFS recreation points retain reported activities/services, water, restrooms, capacity, fees and status notes from the pinned federal snapshot. DEC acquisition now requests its available description/note, visitor URL, activity/designation and segment-length attributes. The existing bundled DEC geometry snapshot remains unchanged; those additional DEC fields will be populated by an explicit full DEC refresh. OPEN-NY recreation points and many geographic records have no narrative text.

Descriptions and arrival text are capped at 4,000 characters. Amenities, hours and fees are capped at 20 entries of 500 characters each. HTML is rendered as plain text, unrelated source fields are discarded, and long visitor/community details are excluded from the marker payload. Original reference information remains in the offline feature index for selection.

## Offline hike details

Selecting a mapped trail shows its source path, mapped start/end markers, length, approximate elevation gain/loss, and an estimated walking time. **Show expected path** fits the selected geometry. Trails may be segments of a longer hike, rather than curated complete itineraries; separate MultiLineString parts are never connected or counted as distance/climbing across gaps. A mapped endpoint is not a verified trailhead. External directions for a hike target its first mapped endpoint instead of the center of its bounds.

The elevation chart supports dragging and accessible increment/decrement actions. Selecting a chart point marks that coordinate on the map. Hike statistics and the chart can switch between miles/feet and kilometres/metres. Walking time assumes 4 km/h plus one hour per 600 m of sampled ascent, excluding stops, terrain and conditions; when ascent is unavailable the time estimate is based only on length. No difficulty, community rating or complete-route classification is invented.

The public app currently bundles an empty `new-york-hikes.json` because the DEC trail geometry and its 5,289 derived elevation profiles are in the ignored private archive pending rights review. The historical profiles used Mapzen/Tilezen Terrarium terrain tiles at zoom 11 and are preserved with their source manifest in `PrivateData/catalogs/US/New York/rights-held-2026-09-27/`.

Run `pnpm map:acquire:hikes` after refreshing the public geometry snapshot. The command accepts only the fixed, checksum-verified public asset; it never uses imported/private routes. Terrain tiles remain in an ignored local cache and are not bundled. Profiles are pinned to their source GeoJSON checksum; stale profiles are hidden and the asset test requires regeneration.

Imported GeoJSON retains its optional third coordinate as elevation in metres. Line features compute their own bounded profiles entirely on the phone, and elevations survive restart. Two-dimensional or incompletely elevated imports show **Elevation unavailable** rather than a fabricated flat graph; their mapped path, length and endpoints remain usable. Private route coordinates are never sent to a terrain provider. Imported polygons and points retain their existing detail view.

## Capture a hike on the map

In Explore, select a trail and use **Capture this hike**, or use **Start hike capture** without a selected trail. Grant location permission using the explicit permission button. The map stays open while the existing native recorder captures location and elevation offline. **Pause hike capture**, **Resume hike capture**, and **Finish and save hike** share the same actions as Track; pending actions disable both sets of controls. Pausing stops recording sensors and resuming creates a new segment.

The pink captured path and orange selected expected path can be displayed together. **Captured hike graphic** shows recorded distance, active sample time, ascent/descent and the filtered sensor elevation profile. **Expected hike graphic** restores the associated source path and terrain/dataset profile. Selecting a captured chart point marks that location in pink on the map; **Show captured path** fits the recording. Recorded time measures intervals between consecutive unpaused samples, excludes sequence/segment gaps, and is not wall-clock elapsed time.

The capture graphic uses the recorder's filtered GPS/barometer results, never raw altitude spikes or expected terrain elevations. It labels GPS confidence and uncalibrated barometer elevation as relative change. Missing elevations remain unavailable. Pauses, poor GPS positions (accuracy worse than 50 metres), missing sequences, and segment boundaries split the path; missing elevation also splits the chart. Display projections retain at most 2,048 map points and 128 chart samples, without reconnecting omitted gaps. Durable original samples remain unchanged.

The expected feature ID is saved with the first recorder checkpoint in the existing private association table. Interrupted captures restore their path and association before recovery. After saving, use **View hike on map** in Saved to reopen the captured path, saved filtered elevation revision and expected-path link. Saved distance and ascent/descent match the finished recorder result. If the associated dataset is hidden or removed, the recording remains usable; show or reimport that exact dataset to restore comparison. Starting another hike clears the previous captured path.

Recordings, saved revisions and expected-path associations stay in the protected private activity database and its encrypted backups. Capture does not upload tracks, acquire terrain, or change the public catalog. Imported reference datasets still require their original files for reimport. No recorder schema migration is required.

## Import a dataset on iPhone

In Explore, use **Import dataset** under **Your imported datasets**, then choose a UTF-8 `.geojson` or `.json` file from Files. Standard WGS84 GeoJSON FeatureCollections and individual Features are supported: Point, MultiPoint, LineString, MultiLineString, Polygon and MultiPolygon. Coordinates use `[longitude, latitude]`; custom CRS declarations, null geometries and GeometryCollections are rejected. Polygon rings must be closed. Import validation is all-or-nothing, with a limit of 20 MiB, 20,000 expanded features and 200,000 coordinate positions per dataset, five datasets and 50 MiB combined saved storage.

The selected dataset is copied into protected application-support storage separately from the recorder database, excluded from system backup, and restored at startup. Imported data is treated as private on-device reference data regardless of the source's claimed origin. Unknown properties and contributor identifiers are discarded. Supported display fields include `name` (or `title`), `category`, `unit`, `publicUse`, `sourceUpdated`, `description` (or `communityDescription`), and dated `communityCheckIns` containing only `occurredAt` and `comment`. Optional feature IDs must be unique; stored IDs are namespaced by the file's SHA-256 so they cannot collide with bundled public features. Exact duplicate file imports are rejected.

Imported points use the existing category markers, filters and clustering. Lines and areas appear in purple. Search and selection include visible datasets; selection provides descriptions, directions, and the existing private place journal. **Hide/Show** saves visibility, **Show coverage** fits a dataset's extent, and **Remove** deletes that reference dataset after confirmation while keeping place notes and recordings. A failed restore leaves the public map usable, prevents silently overwriting the saved data, and offers an explicit clear-and-reimport action. Imported reference datasets are not included in encrypted activity backups; retain the original files for reimport.

For the current private New York catalog, transfer the ignored `PrivateData/catalogs/US/New York/current/private-ioverlander.geojson` to Files and import it to add private iOverlander places. DEC records are no longer in the public base; they remain in the rights-held private archive and require a separately authorized private catalog build. Private files remain outside Git and the public IPA.

Imported GeoJSON may also supply `description`, `directionsInfo`, `amenities`, `openingHours`, `fees`, and `sourceUrl`. Lists may be arrays of strings or one string. These fields use the same visitor limits, survive restart, and appear in the selection card. Source links accept HTTP/HTTPS URLs without embedded credentials. Previously imported files need to be removed and reimported to pick up metadata newly supported by this app version.

## Reproduce and verify

- `pnpm map:acquire` refreshes DEC source data only under ignored `PrivateData/`. `pnpm nps:acquire:ny` and `pnpm federal:acquire:ny` refresh official federal snapshots under the ignored private working root; the federal acquisition uses the preserved private New York boundary by default. These commands require network access; NPS acquisition also requires `NPS_API_KEY`.
- `pnpm map:public:compose` validates official snapshot hashes and counts, rejects any state-agency records in its public base, and rebuilds the federal-only public map, index, and manifest. None of these steps runs at installation or startup.
- `packages/map/src/assets/new-york-outdoors.manifest.json` records public NPS, USFS, and BLM source checksums and attribution. The private archive retains historical DEC provenance and receipts.
- The two bundled manifests pin the Protomaps source date, source timestamp, zooms, compiler version, archive checksums, local font checksum, rights, and attribution. The regional manifest also pins the Natural Earth revision, input checksum, deterministic extraction-boundary checksum, selected map units, and explicit minor-island inventory.
- The 42.81 MiB world overview is an ordinary Git binary. The 356.01 MiB regional archive exceeds GitHub's ordinary 100 MB object limit and is stored in Git LFS. Lightweight CI validates its LFS object ID and declared byte length; the macOS device-build workflow downloads the real object and verifies that both exact archives are embedded.
- `pnpm test:map:browser` renders the real data using MapLibre GL JS and rejects external requests or page errors. The screenshot/report are written under `dist/outdoor-map`. This is supplemental rendering evidence, not native-device acceptance.
- `pnpm quality` verifies the overview/font checksums, local-only source resolution, network-free style, geometry, search, camera state and recording segment boundaries alongside the existing suites.
- `pnpm build:ios:bundle` verifies the public Metro bundle.
- `pnpm map:private:stage` validates the composed catalog classification, privacy flags, artifact hashes, index count, and required NPS/federal coverage before copying it to the ignored mobile staging directory.
- `pnpm build:ios:unsigned:private` stages that catalog, enables the private Metro substitution, builds the unsigned app on macOS, verifies the exact composed GeoJSON inside the `.app`, and removes the staging copy afterward. The index hash and count are verified before Metro compiles that JSON into the JavaScript bundle. The regular unsigned build remains public-only.
- The macOS workflow also compares byte length and SHA-256 inside the built `.app`, failing if either fixed offline archive is missing or truncated.

## Device checks after installation

1. Enable airplane mode before opening the app. Open Explore and confirm overview roads, town names, water, land cover, and federal parks/forest features appear. Confirm no DEC features appear in the public build.
2. Force-quit and reopen while airplane mode remains enabled. Pan within New York and Canada through zoom 9, then pan to Europe or Asia above zoom 6 and confirm the overzoomed world overview remains visible without a network request.
3. Search Watch Hill, select a campground, and confirm its details and directions. Test an imported elevated GeoJSON hike across restart and a two-dimensional hike with elevation unavailable. Clear selection, pan, pinch and use both zoom buttons. DEC trail elevation checks apply only to a separately authorized private build.
4. Switch to Track and back. Confirm camera/selection persist. Text search and source details provide a non-gesture alternative.
5. In Explore select a hike, capture it outdoors, pause, move and resume. Confirm the pink captured path and selected orange expected path, switch both graphics, select captured profile points, and verify pause/poor-GPS gaps remain disconnected. Finish and compare graphic totals with Track; reopen from Saved after relaunch. Interrupt an active capture, recover it, and confirm its path and expected association remain. Start another hike and confirm the previous path clears. Repeat with no elevation and with the expected dataset hidden/removed. Show last recorded position must use the recorded point without starting a new sensor session.
6. Perform the remaining guided accessibility, performance and endurance observations on this candidate. Automated tests do not count as these observations.

Physical evidence and independent review remain pending under ADR-050. Prior WP-301/WP-304 acceptance statements describe contract/index tests, not a delivered native map or a complete offline field beta.
