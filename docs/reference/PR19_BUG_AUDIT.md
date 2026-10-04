# PR 19 bug audit and simplification

Reviewed the PR's native map lifecycle, camera commands, selection callbacks, shared sheets, location authorization, literal address parsing, laptop HTTP guards, discovery and pairing.

| Finding | Result | Regression evidence |
| --- | --- | --- |
| Selecting a Search result called a missing native camera; returning to Explore retained the old view. Other camera actions could also disappear during map loading. | Queue the latest destination until Explore finishes rendering. Point, route, cluster, recording and coverage fits use one helper. Zoom controls retain consecutive changes while the native surface is unavailable. | `outdoor-map-ui.test.ts`, `map-camera-fit.test.ts` |
| Package coverage could be consumed while the native map was hidden. | Consume coverage only with an active, loaded camera; a newer user destination cancels outstanding coverage. | `outdoor-map-ui.test.ts` |
| A map query or cluster expansion finishing after switching to Search could change selection or camera. | Invalidate pending selection work on every visibility or section change. | `outdoor-map-ui.test.ts` |
| An old native camera echo marker could suppress a later external command to the same view. | Consume the marker when processing its corresponding adapter update. | `map-camera-sync.test.ts` |
| The first of two overlapping authorization reads could clear the busy state before the newer read finished. | Only the latest read updates authorization, errors and checking state. Removed native listeners also ignore queued callbacks. | `location-access-hook.test.ts` |
| Shared sheet pages reused the previous page's scroll position. | Reset scrolling on page changes and reopening, while preserving position during edits on the same page. The native modal remains shared. | `product-sheet.test.ts` |
| Link-local IPv6 discovery could publish an interface scope in an AAAA address record. | Publish canonical bare address bytes for the selected address only; multicast retains its local interface scope. | `laptop-pairing.test.mjs` |
| Laptop QR instructions used an obsolete app path. | Match Settings → Maps → Add a map → From laptop → Scan QR code. | `laptop-pairing.test.mjs` |

The camera helper removes repeated point-versus-bounds branches. One map-active condition governs native rendering and installed-place queries. Discovery records use a single selected-family normalization pass. No schema, dependency or package payload changes are required; the base app still excludes optional public and private packages.

Validation uses `pnpm quality`, `pnpm test:laptop`, `pnpm test:privacy`, targeted asynchronous/native-control regressions and candidate GitHub checks. The hosted native iOS workflow compiles the device app, executes Swift endpoint and signed-update trust regressions, and packages the IPA. Exact candidate results are recorded in PR #19.

Traceability: WP-303, WP-304, WP-501; REQ-CAT-002, REQ-SEC-001, REQ-MAP-001, REQ-UX-001, REQ-A11Y-001, REQ-TRK-001; T-INT-002, T-SEC-002, T-E2E-001, T-E2E-002; ADR-052. Existing risks R-002, R-004, R-013, R-017 and R-029 retain their separate device/privacy/build acceptance controls.

Synthetic React tests mock native controls. Physical iPhone transfer, actual IPv6 network discovery, VoiceOver and the reported intermittent Explore freeze still need device acceptance; automated tests and compilation do not establish those results. The laptop transfer server remains stopped.
