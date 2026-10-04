# Open Outdoor visual direction

The approved [Visual Design Guide](Open%20Outdoor%20Visual%20Design%20Guide.docx) covers the whole app: 34 phone states, a wide layout, and all 24 field states. Its concept views use synthetic examples. The implementation keeps forest green, warm linen, sage, ochre, and the existing route, location, and warning colors.

## Navigation and discovery

- Explore fills the screen above the bottom navigation. Search and Settings float over the map; categories, layers, and marker detail remain nearby. Place selection opens a compact preview. Place evidence, notes, tools, and the legend use separate scrolling system sheets.
- Search uses flat place rows and retained query/category state. Categories filter local and installed-package results before the result limit. Going through Settings or another tab preserves the mounted map, selection, filters, and camera.
- Track centers readiness, durable recorded time, a path preview, distance, ascent, and GPS quality. Recording mode and location explanations stay secondary. Pause, resume, recovery, and discard retain their existing recorder behavior. Finish opens a review; Save hike performs the durable finish operation. Failed saves remain available for retry.
- Saved separates hikes from places. Finished hikes show their actual names and dates, with the first hike's durable path preview. Notes and check-ins open directly and remain available after their map package is removed. Empty states lead directly to recording or exploration.
- Explore, Search, Track, and Saved remain labeled and reachable. Navigation occupies its own bottom safe-area row; content scrolls above it.

## Settings and map inventory

Settings contains Maps, Appearance, Recording, About and sources, and Advanced. Licenses, full attribution, diagnostic actions, and detailed methodology stay here or behind the relevant disclosure.

Maps distinguishes bundled coverage, installed public packages, and private datasets. Each installed entry has an explicit visibility switch and a detail page with coverage, metadata, and removal. Integrity errors disable unsafe actions. Removal and unreadable-storage reset require confirmation; notes and hikes remain intact.

Stock builds bundle only the world/regional basemaps. New York and every other state catalog are added explicitly. Explore opens on a broad basemap overview, and an empty install offers Add a map in Explore and Search. Bundled coverage reflects the basemap instead of a New York starter region. Custom private builds retain their explicit overlay configuration.

Add a map supports Files, laptop packages, and GeoJSON. GeoJSON is validated before review, without being installed. Import persists the reviewed draft; cancellation leaves storage untouched, and failed writes can be retried. Laptop pairing offers discovery and QR scanning with expandable manual entry. Full signing fingerprints and trust consequences remain available before approval, and saved keys can be revoked offline. Transfer cancellation and verification protections remain intact.

## Components and accessibility

Serif headings, quiet surfaces, 14-point control corners, 22-point cards, and 26-point place previews establish the hierarchy. Controls retain 52-point targets, native text scaling, focus outlines, accessible names, and explicit selection. Light, dark, and high-contrast appearances share semantic colors; default native text follows the active palette.

Unknown metrics display an em dash with an accessible “Unknown” label. Place access warnings and navigation restrictions remain at the decision point. Recorded paths are solid and planned paths dashed. Preview downsampling preserves pause gaps and uses durable coordinates. The live GPS position and last recorded position remain distinct. Native attribution is positioned outside the preview card.

System sheets support Back, screen-reader escape, scrolling, and keyboard avoidance. Native device checks remain necessary for VoiceOver, Dynamic Type, locked-screen recording, physical map rendering, outdoor visibility, and performance.

## Validation and provenance

`pnpm test:design:browser` checks all four tabs, Settings, component states, 200% text, bottom navigation, retained queries, and accessibility at 320, 390, and 1024 pixels in all three appearances. It generates screenshots and a report under ignored `dist/design-qa/`. The browser fixture uses synthetic geography and cannot record hikes or install native packages.

Native workflow regressions cover map retention, package visibility and coverage, import review/persistence/failure, and recording review/return/save retry. Separate connected and offline map checks exercise real bundled archives and exact installed place coordinates. Release contracts retain recorder, source, privacy, and diagnostic requirements despite shorter visible labels.

The earlier PNGs in this directory document the previous browser iteration; the approved guide preserves those references alongside the new concepts. Map styling, icons, path previews, and vector illustrations are project-authored. Geographic sources, bundled fonts, and native map libraries retain their existing attribution and license notices. No geographic data, source rights, or private schema changes are introduced by this visual iteration.
