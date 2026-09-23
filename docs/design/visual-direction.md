# Open Outdoor visual direction

Open Outdoor uses deep forest green, warm linen, pale sage, and restrained ochre. Nature apps such as AllTrails informed familiar discovery patterns for maps, route details, search, and saved outings. The palette, map styles, icons, copy, and mountain illustration remain project-authored.

## Experience structure

- Explore opens with a short invitation and a map-led discovery surface. The map and legend come before place evidence and recording actions; catalog administration stays later in the flow.
- Search keeps the map context while people enter a query, filter results, and inspect a selected place.
- Track centers recording status, glanceable metrics, and clear start, pause, resume, finish, and recovery actions.
- Saved presents a private library of places and recorded outings with clear origin labels.
- Persistent labeled navigation keeps Explore, Search, Track, and Saved reachable. Appearance controls remain secondary.

## Components and accessibility

Use shared colors in light, dark, and high-contrast modes. Controls use 52-point minimum targets, visible state, accessible names, and native text scaling. Cards use 22-point corners; controls use 14-point corners. Selection uses forest green. Warnings, route lines, recording paths, and user location retain distinct colors and labels.

## Art and provenance

The browser reference includes original vector mountain artwork. The app has no stock-photo dependency, downloaded font, or network asset request. Future place photography should be factual, locally bundled or explicitly cached, and supplied with useful alternative text. Do not fabricate trail ratings, conditions, or access claims for appearance.

## Implementation boundary

The mobile app receives the shared palette, compact persistent navigation, section introductions, and map-led content order. The browser fixture is a synthetic visual reference, not the native map experience. Existing import, recording, recovery, and source disclosures remain available. Hardware-specific behavior requires a native device build.

## Reference

[AllTrails app guide](https://support.alltrails.com/hc/en-us/articles/44409942124052-Understanding-the-AllTrails-App) informed the broad Explore and Saved workflow patterns. Open Outdoor uses its own visual expression and project-authored assets.


## Whole-app surface refinement

The browser reference now gives each section a distinct purpose: Explore uses a map and adjacent detail panel on desktop; Search uses scannable icon-led place rows; Track uses a calm readiness illustration and separate metric tiles; Saved uses an illustrated journal empty state and an Explore action. Supporting source information expands below the core place information. Unknown values remain explicit and the browser does not simulate a recorded activity. Native recording metrics use the same label/value hierarchy and softly inset surfaces.


## Navigation and small-screen layout

The phone browser shell reserves a dedicated row for bottom navigation. Main content scrolls independently above it, so primary actions and final content are reachable without sliding behind navigation. Safe-area padding protects controls near device edges. Track and Saved use more compact introductions and illustration spacing to prioritize their primary actions.


## Final handoff

The visual implementation is complete for this iteration. The native shell respects device safe areas; selected actions keep concise visible labels and retain their accessible selected state. The browser reference supports light, dark and high contrast palettes, keyboard focus, long place names, readable action feedback and a dedicated mobile navigation row. Build, screenshots and final document validation belong to the coordinating workflow; the implementation agent did not run tests or review passes.

## Current screen captures

These 390 × 844 phone views and the 1024 × 960 desktop view are synthetic browser references for the final layout. They show the four primary app areas and the desktop map/details arrangement; none represents live map data or a native-device screen.

| View | Screenshot |
| --- | --- |
| Desktop Explore | [app-desktop-current.png](app-desktop-current.png) |
| Phone Explore | [app-explore-mobile-current.png](app-explore-mobile-current.png) |
| Phone Search | [app-search-mobile-current.png](app-search-mobile-current.png) |
| Phone Track | [app-track-mobile-current.png](app-track-mobile-current.png) |
| Phone Saved | [app-saved-mobile-current.png](app-saved-mobile-current.png) |


## Final field-guide refinement

Page titles name the task directly: Explore outdoors, Find a place, Record a hike and Your hikes. A moderate serif heading adds warmth; sentence-case labels, brief descriptions, and readable metadata keep each screen practical. Cards use quieter outlines and surfaces, allowing the map and place information to carry more of the visual interest. Native titles and metric labels follow the same hierarchy.

Selected navigation has one clear, high-contrast treatment in browser and native layouts. Explore foregrounds the map and legend, Search foregrounds the query and scannable place rows, Track foregrounds readiness and the recording action, and Saved foregrounds a private journal. The browser desktop view pairs the map with place details; phone content scrolls above its persistent navigation row. Each area retains its own content rhythm while sharing typography, palette, and interaction cues.

The interface favors specific, useful language over promotional taglines. Source and uncertainty details remain visible where they help explain a place; the visual reference uses original vector artwork and synthetic map examples. The screenshots are illustrative browser layouts rather than live map data or native-device captures.
