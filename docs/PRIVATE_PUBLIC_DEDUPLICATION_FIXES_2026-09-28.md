# Private/public deduplication audit fixes — 2026-09-28

Policy v2 resolves the matching and activation defects audited in commit `3a82ce99c8988ef6f269f591f3c08f3668805e7f`. All 50 local private packages were reconciled from their checksum-pinned original inputs. Public packages are unchanged; private coordinates, match identifiers, descriptions and community check-ins remain Git-ignored.

Compared with v1, **40 records were restored** (38 polygons and two Idaho trails) and **49 additional POIs were matched** across 18 states. The current result is **8,760 removals across 27 states**, **527,153 retained private features**, **463,870 agency/DEC/OPRHP records**, **63,283 iOverlander places**, and **5,289 DEC profiles**. These are policy-based matches, not a claim that all semantic duplicates have been resolved.

## Corrections

- Polygon matches now require at least 90% intersection-over-union in addition to the existing name, category, area and boundary checks. The disjoint same-name parcel counterexample is retained. Uncertain geometry stays in the private package.
- Shape distance now verifies continuous segment coverage in both directions using convex target-segment capsules and conservative subdivision. Unresolved coverage is retained. Both questionable Idaho trail removals are restored.
- POIs compare the shared normalized category first; raw source categories supply fallback evidence. Nearby places with different normalized categories remain distinct.
- New compositions and public checksums are validated before activation. Non-New-York packages use immutable hash-named artifacts and one atomic manifest replacement; previous manifests and artifacts are preserved. Artifact creation publishes only complete files. New York uses an isolated staging directory, a recovery journal and rollback. The full catalog builder and agency integration both stage their writes.
- Recovery can rebuild a damaged active output from verified original input, preserving the damaged artifact for inspection. Verification rejects damaged outputs, stale policy/public pins, missing or changed enrichment, and replay mismatches.
- All 50 deduplicated iOverlander entries retain their complete converted private properties in checksum-bound enrichment assets. `composePrivateStateView` applies their community details to canonical public IDs without duplicating geometry or mutating public data. It returns a private-only collection; consumers must explicitly use this adapter. Utah's previously removed North Campground retains its 23 check-ins. Enrichments are never published as public package assets.

## Validation

- The full `pnpm quality` suite passed: TypeScript builds, formatting, release configuration/workflow validation, **419 application tests** and **130 release regression tests**. Documentation governance and relative-link validation also passed. Release regression coverage includes canonical-category matching, disjoint parcels, community enrichment, injected activation failures, first-generation retry, journal recovery and corrupt-output repair.
- The 50-state inventory verifier replayed matching against pinned public packages and checked private outputs, inputs, reports, enrichment and DEC profiles.
- Independent Shapely measurements checked all **8,760 matched pairs**: no polygon IoU below 90% and no sampled distance above the applicable 20-meter shape or 25-meter point tolerance. Invalid geometry was repaired only in audit memory; source geometry was not rewritten. This independent sampling supplements the continuous coverage proof used by the matcher.
- Real Colorado and staged New York agency rebuilds succeeded. New York still has zero public matches and preserves the reviewed identity catalog and profile bindings. Future NY matches still require a coordinated identity/profile rebuild; the tool fails before activation.

## Changes by state

| State | Earlier removals restored | Additional POIs matched |
| --- | ---: | ---: |
| AZ | 0 | 3 |
| CA | 0 | 5 |
| CO | 0 | 4 |
| DE | 5 | 0 |
| FL | 0 | 1 |
| GA | 0 | 1 |
| HI | 2 | 0 |
| ID | 2 | 7 |
| KY | 1 | 1 |
| MI | 0 | 2 |
| MN | 0 | 1 |
| MS | 0 | 1 |
| MT | 0 | 6 |
| NV | 0 | 2 |
| NJ | 19 | 0 |
| NM | 0 | 2 |
| NC | 0 | 1 |
| OR | 1 | 1 |
| PA | 1 | 0 |
| RI | 6 | 0 |
| UT | 0 | 8 |
| VT | 3 | 0 |
| WA | 0 | 2 |
| WV | 0 | 1 |

See the [current deduplication results](PRIVATE_PUBLIC_STATE_DEDUPLICATION_2026-09-28.md) and [private inventory](PRIVATE_STATE_PACKAGE_INVENTORY_2026-09-27.md) for per-state totals and verification commands.
