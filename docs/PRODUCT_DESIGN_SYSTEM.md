# WP-501 Product design system

Status: implemented and automatically validated; physical production acceptance remains gated.

## Decomposition and flows

WP-501 is XL. Before styling, it is decomposed into: A shared original tokens and icon geometry; B reusable native and browser components with exhaustive states; C local light/dark/high-contrast map styles and semantic legend; D app integration, interactive catalog, tests and evidence. No external brand assets, fonts, imagery or styles are imported.

Low-fidelity flow baseline (reading order, before visual treatment):

- Explore: primary navigation → field status → map and legend → selected place → source, origin, coverage, freshness, restrictions and uncertainty → Track action.
- Search: navigation → labeled query and filters → result count/empty state → result detail retaining map context.
- Track: navigation → recording/checkpoint status → glanceable metrics → start or resume → pause → deliberate finish/save. Recovery retains a separate discard confirmation.
- Saved: navigation → private origin notice → saved list or empty state → activity detail.
- Settings remain secondary; appearance overrides do not compete with recording actions.

Each surface must wrap at narrow widths and increased text size. Native recorder actions retain their existing storage/sensor behavior. Browser examples are explicitly synthetic QA, never claims of a working native sensor or installed catalog.

## Brand and asset provenance

The visual direction uses warm paper, slate blue, restrained plum route emphasis and angular open-ridge geometry. These are project-authored tokens and 24-unit line icons, created with AI assistance for Open Outdoor under Apache-2.0. No source-service logo, palette, layout, font, photo, map style or icon pack was used as a reference or copied. The system uses the platform system font. This is an original implementation/provenance record, not a trademark clearance opinion.

| Asset | Source of truth | Rights / dependencies |
| --- | --- | --- |
| Brand, color, type, spacing, radius, border, elevation, motion and haptic tokens | `packages/shared/src/design-system.ts` | Original, Apache-2.0 |
| Eleven coherent line icons | `iconPaths` in the shared system | Original, Apache-2.0; SVG on browser, native View line segments on iOS |
| Light, dark and high-contrast map documents | `packages/map/src/product-style.ts` | Original, Apache-2.0; no remote glyphs, sprites, fonts or styles |
| Schematic preview geometry | `apps/browser-fixture/src/main.ts` | Original synthetic QA; never geographic evidence |
| Browser QA dependency | Playwright 1.62.1 | Apache-2.0; development only, pinned in lockfile |

## Component contract and state coverage

The shared `componentCatalog` is the state inventory. Native components live in `apps/mobile/ProductComponents.tsx`; browser semantic renderers live in `apps/browser-fixture/src/components.ts`. The browser catalog displays every field-state definition and inventories every component variant. It is a local development surface, not a consumer web product.

| Component | Variants/states | Behavior and review |
| --- | --- | --- |
| Button | Default, pressed, focused, selected, disabled, busy, destructive | 52-point minimum; text label; selected semantics and border/text treatment; busy disables activation; destructive meaning is explicit. Real recorder discard retains its confirmation. |
| Navigation | Default, selected, focused | Explore, Search, Track, Saved; accessible names and selected state; active recording offers a return-to-controls action. |
| Notice | All 24 field states below | Title, body, original icon and semantic tone; live announcements only at active state surfaces, not the entire static catalog. |
| Origin badge | Public catalog, private catalog, private activity, unknown; synthetic fixture explicitly named | Never infer public origin from an unrecognized value. A private label does not grant redistribution rights. |
| Card | Default, selected, empty | Wrapping content, heading, border; explicit selection label; meaningful empty-state next step. |
| Search | Default, focused, populated, empty, disabled | Visible name, local text/filter results and result count. Browser filter and query survive appearance changes. Native search uses the existing synthetic fixture. |
| Metric | Available, unknown, degraded | Unknown is a word, not a fabricated zero; reduced confidence is written out. |
| Detail | Fresh, stale, unknown, conflict, closure, private origin | Name, source, origin, coverage, freshness, restrictions, uncertainty and provenance; no current-access promise based on a source date. Untrusted browser strings are escaped. |
| Legend | Collapsed, expanded | Seven camping statuses, individual text/mark and explanations; no color-only permission inference. |

Required field states: empty, loading, error, stale source, degraded GPS, offline, denied permission, expired provisioning, catalog activation, rollback, partial import, insufficient space, source conflict, unavailable private extension, rights-excluded content, private origin, closure, unknown access, recording, paused, recoverable, low battery, checkpoint error and completion. Each has a stable `fieldStates` key, meaningful copy, tone and icon; all are rendered in the interactive catalog. A preview state is not a substitute for a backend event or a claimed completed action.

## Map hierarchy and integration

`createProductMapStyle` accepts local GeoJSON for base features, canonical places, selected route, active track and user location. Base feature `kind` values are land, water, road, trail, closure and hazard; land `campingStatus` uses the seven canonical statuses. Geometry types must match the layer (polygons for land/water, lines for road/trail/closure, points for hazards/places/location). Callers pass canonically resolved places from the existing data pipeline; styling does not re-merge records or stack source copies.

Layer order is background → land/water → road/trail → land status boundaries → clustered places → closures/hazards → selected route and halo → active recording and halo → user location and halo. Clusters use a 44-pixel radius through zoom 13; individual points progressively increase size with zoom. The selected route is dashed; recording is solid; the user position is ringed. Status boundary patterns supplement color; the semantic legend and non-map detail are required companions, especially where patterns coincide. Cluster membership/count and source/confidence remain the renderer's accessible detail responsibility.

The browser schematic consumes the actual map paint definitions. The existing mobile app still uses its fixture map adapter and text alternative; this package supplies local style documents for the production renderer and does not claim a native GPU map render or installed field catalog. Native controls, search, detail, legend, metrics and cards consume the shared tokens. Diagnostics retain their dedicated acceptance UI.

## Appearance, motion and feedback

The mobile shell follows device light/dark appearance unless explicitly overridden; high contrast is available in its secondary appearance controls. The browser initially observes dark and increased-contrast preferences and provides all three overrides. Production VoiceOver/Increase Contrast/Bold Text device acceptance belongs to WP-502.

Every enabled palette text pair is tested at 4.5:1 and meaningful control/map halo contrasts at 3:1 where applicable. Layout wraps rather than clamping Dynamic Type. Browser keyboard focus has an explicit ring; reduced motion removes the optional button color transition. Native components do not introduce animations or background timers. The feedback policy defines short optional lifecycle, favorite, catalog/import, filter and error feedback; reduced motion yields zero duration and the haptics-off preference yields no haptic. This is the shared policy for native feedback adapters, not a claim of measured haptic behavior on hardware.

## Reproduce the review

1. Use the repository-pinned Node and pnpm versions and run `pnpm install --frozen-lockfile`.
2. Run `pnpm quality`, `pnpm test:privacy`, and `pnpm build:ios:bundle`.
3. Install Chromium with `pnpm exec playwright install chromium`, then run `pnpm test:design:browser`. Alternatively set `BROWSER_CHANNEL=msedge` for an installed Edge browser.
4. Inspect `dist/design-qa/report.json` and six synthetic screenshots. Browser checks cover 320/1024-pixel widths, all appearances, 200% text, target sizes, keyboard skip/focus, search/filter/empty/detail, native-capability messaging, private origin, state changes, disabled/busy controls, reduced motion and absence of external requests.
5. For interactive review, run `pnpm --filter @open-outdoor/browser-fixture exec vite --host 127.0.0.1`. Review the catalog, all field states and camping legend using keyboard and supported appearances.

No browser result closes physical iPhone 14, VoiceOver, Dynamic Type, outdoor-readability, energy, endurance or production GPU-map gates. Record those on a pinned candidate in WP-502/WP-503 and the WP-506 release audit.
