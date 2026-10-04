# PR 18 bug audit and simplification

Reviewed the stock bundle, map camera and selection, state catalog queries, import and laptop flows, private notes, recording review/retry, and shared UI components.

| Finding | Result | Regression evidence |
| --- | --- | --- |
| Search category controls did not filter results; filtering after a capped native query would also miss matching places. | One retained category drives local search and parameterized native SQL. Both filter before the result limit. Native results belong to their query, category and package list. | `category-search.test.ts`, `state-search-hook.test.ts`, production-builder SQLite tests |
| A failed note write was published in memory before the protected store confirmed it. | Validate a draft, persist it, then publish the journal change. Failed writes leave the previous entry intact and allow retry. | `mobile-persistence.test.ts` |
| A recording checkpoint prepared during a pending note write could omit that note. | The shared write queue includes the latest committed journal when serializing a checkpoint. | `mobile-persistence.test.ts` |
| Overlapping check-ins could replace each other, and a late save could overwrite another place's draft. | Journal changes read the latest entry inside the write queue. The editor prevents overlapping actions and ignores results for a previous selection. | `mobile-persistence.test.ts`, `place-journal-hook.test.ts` |
| Saved notes required a catalog feature to open after its package was removed. | Saved opens the protected note directly. Explore and Saved share the same editor. | `mobile-shell.test.ts` |
| Delayed map queries, state details or cluster expansion could replace a newer selection or camera destination. | Selection requests are invalidated when selection or installed packages change. Late native callbacks are ignored. | `outdoor-map-ui.test.ts` |
| Private bundled trail profiles were mistaken for manual imports and suppressed. | Resolve selected geometry or visible imports first, then verified bundled profiles regardless of origin. | `map-hike-route.test.ts` |
| Trail end-marker colors did not refresh with appearance. | Marker memoization includes the route color. | `outdoor-map-ui.test.ts` |

Simplifications remove unused App styles, duplicate recording-mode labels and a redundant pause update/button branch; replace the nested map-style construction with a guarded block; and share note editing and private persistence between their callers. Snapshot schemas, source data and dependency versions are unchanged. The stock app still contains no optional public or private catalog packages.

Validation: repository quality checks, focused asynchronous regressions, production-builder SQLite tests, browser accessibility/design acceptance, offline map rendering, public-boundary scan, web and iOS bundle exports, and hosted native iOS compilation/packaging. Native host controls are mocked in UI regressions. Physical iPhone, VoiceOver, screen-lock and outdoor performance review remain separate device checks.
