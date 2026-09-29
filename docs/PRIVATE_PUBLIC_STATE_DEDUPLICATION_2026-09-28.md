# Private packages deduplicated against public state packages

All 50 active packages under Git-ignored `PrivateData/catalogs/US/<state>/current/` were compared only with the public package for the same state. Public data and its manifests remain unchanged. This report publishes counts only; original records, community narratives, match IDs and coordinates remain private.

Removed **8,760 duplicate private entries** across **27 states**. Retained **527,153 private features**: **463,870 agency/DEC/OPRHP records** and **63,283 iOverlander places**. New York's reviewed identity catalog, map/index and 5,289 DEC profiles remain unchanged; it has zero qualifying public matches.

The public feature wins when both entries have the same normalized exact source-layer URL and external record ID with matching geometry dimension. Otherwise matching requires a meaningful normalized name, compatible normalized POI categories (raw categories are fallback evidence) and the same geometry dimension. Points must be within 25 meters. Lines and polygons must have bounds within 20 meters, length/area ratio at least 98%, and continuous bidirectional segment coverage no greater than 20 meters. Polygon matches also require intersection-over-union of at least 90%; uncertain geometry is retained for review. This accommodates public rounding and simplification. Generic names alone, nearby facilities, overlapping land parcels, and points inside park boundaries are insufficient.

The [policy v2 audit fixes](PRIVATE_PUBLIC_DEDUPLICATION_FIXES_2026-09-28.md) document 40 restored uncertain removals, 49 additional POI matches and failure-recovery validation.

These are conservative automatic matches, not a claim that every semantic duplicate or alternate-name record has been resolved. Different representations and uncertain matches stay private for review. Rights, access and currency classifications are unchanged.

Each private manifest pins the public GeoJSON checksum, policy version, output checksum, complete pre-deduplication input and match report. Immutable, hash-named pre-deduplication inputs, reports, map outputs and private enrichment files preserve original records and removed private details. The active manifest selects the current generation; consult its artifact filenames rather than older fixed GeoJSON paths. Repeated runs replay the preserved input, so counts do not drift; a changed public package triggers reconciliation against that input. Raw sources are untouched. Builders validate deduplication before activation. Non-New-York packages activate through an atomic manifest replacement after every immutable artifact is written; prior manifests and artifacts remain available for recovery. New York builds in a separate directory and uses an activation journal with rollback. Corrupt active outputs can be recovered from checksum-verified preserved input. Inventory verification rejects stale public pins, enrichment changes or a replay mismatch.

Deduplicated community places keep their descriptions and check-ins in a checksum-bound PRIVATE_USER enrichment artifact. `composePrivateStateView` in `tools/private-public-enrichment.mjs` applies those details to the canonical public IDs for private display without duplicating geometry or modifying public data. The resulting view must remain private.

| State | Private entries removed | Retained agency / DEC | Retained iOverlander | Retained total |
| --- | ---: | ---: | ---: | ---: |
| Alabama (AL) | 0 | 596 | 520 | 1,116 |
| Alaska (AK) | 0 | 1,240 | 1,784 | 3,024 |
| Arizona (AZ) | 3 | 170,035 | 4,243 | 174,278 |
| Arkansas (AR) | 0 | 436 | 722 | 1,158 |
| California (CA) | 5 | 0 | 8,016 | 8,016 |
| Colorado (CO) | 1,213 | 920 | 3,692 | 4,612 |
| Connecticut (CT) | 0 | 0 | 176 | 176 |
| Delaware (DE) | 35 | 7,646 | 61 | 7,707 |
| Florida (FL) | 15 | 16,699 | 2,445 | 19,144 |
| Georgia (GA) | 1 | 6,262 | 814 | 7,076 |
| Hawaii (HI) | 16 | 584 | 79 | 663 |
| Idaho (ID) | 7,012 | 63,970 | 1,968 | 65,938 |
| Illinois (IL) | 0 | 384 | 586 | 970 |
| Indiana (IN) | 0 | 6,148 | 458 | 6,606 |
| Iowa (IA) | 0 | 2,876 | 555 | 3,431 |
| Kansas (KS) | 2 | 541 | 581 | 1,122 |
| Kentucky (KY) | 1 | 4,092 | 446 | 4,538 |
| Louisiana (LA) | 0 | 28 | 550 | 578 |
| Maine (ME) | 0 | 12,942 | 661 | 13,603 |
| Maryland (MD) | 1 | 626 | 261 | 887 |
| Massachusetts (MA) | 0 | 0 | 373 | 373 |
| Michigan (MI) | 2 | 0 | 1,143 | 1,143 |
| Minnesota (MN) | 1 | 0 | 835 | 835 |
| Mississippi (MS) | 1 | 2,928 | 444 | 3,372 |
| Missouri (MO) | 0 | 2,137 | 787 | 2,924 |
| Montana (MT) | 6 | 8,752 | 2,168 | 10,920 |
| Nebraska (NE) | 0 | 0 | 504 | 504 |
| Nevada (NV) | 2 | 30 | 1,635 | 1,665 |
| New Hampshire (NH) | 0 | 20,012 | 351 | 20,363 |
| New Jersey (NJ) | 136 | 10,007 | 218 | 10,225 |
| New Mexico (NM) | 3 | 34 | 2,071 | 2,105 |
| New York (NY) | 0 | 40,087 | 1,186 | 41,273 |
| North Carolina (NC) | 1 | 67 | 1,018 | 1,085 |
| North Dakota (ND) | 0 | 48 | 389 | 437 |
| Ohio (OH) | 0 | 11,572 | 611 | 12,183 |
| Oklahoma (OK) | 0 | 44 | 563 | 607 |
| Oregon (OR) | 5 | 1,110 | 3,485 | 4,595 |
| Pennsylvania (PA) | 72 | 2,214 | 797 | 3,011 |
| Rhode Island (RI) | 45 | 3,199 | 71 | 3,270 |
| South Carolina (SC) | 0 | 324 | 491 | 815 |
| South Dakota (SD) | 0 | 298 | 716 | 1,014 |
| Tennessee (TN) | 0 | 5,789 | 777 | 6,566 |
| Texas (TX) | 0 | 6,681 | 2,912 | 9,593 |
| Utah (UT) | 9 | 93 | 3,706 | 3,799 |
| Vermont (VT) | 163 | 4,578 | 406 | 4,984 |
| Virginia (VA) | 7 | 2,655 | 920 | 3,575 |
| Washington (WA) | 2 | 7,426 | 3,281 | 10,707 |
| West Virginia (WV) | 1 | 5,834 | 353 | 6,187 |
| Wisconsin (WI) | 0 | 123 | 866 | 989 |
| Wyoming (WY) | 0 | 31,803 | 1,588 | 33,391 |

## Rebuild and verify

```text
node tools/build-private-state-agency-ioverlander.mjs --all
node tools/deduplicate-private-state-packages.mjs --all
node tools/deduplicate-private-state-packages.mjs --verify
node tools/report-private-state-packages.mjs
node --test tools/private-public-dedup.test.mjs
```

New York keeps its separate reviewed builder. Future public matches affecting its identity catalog or DEC profile bindings require a coordinated rebuild; the tool fails before modifying that package. The current 50-state verification confirms no such matches.
