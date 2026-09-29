# Private packages deduplicated against public state packages

All 50 active packages under Git-ignored `PrivateData/catalogs/US/<state>/current/` were compared only with the public package for the same state. Public data and its manifests remain unchanged. This report publishes counts only; original records, community narratives, match IDs and coordinates remain private.

Removed **8,751 duplicate private entries** across **16 states**. Retained **527,162 private features**: **463,830 agency/DEC/OPRHP records** and **63,332 iOverlander places**. New York's reviewed identity catalog, map/index and 5,289 DEC profiles remain unchanged; it has zero qualifying public matches.

The public feature wins when both entries have the same normalized exact source-layer URL and external record ID with matching geometry dimension. Otherwise matching requires a meaningful normalized name, compatible POI categories and the same geometry dimension. Points must be within 25 meters. Lines and polygons must have bounds within 20 meters, length/area ratio at least 98%, and bidirectional vertex/midpoint-to-segment distances no greater than 20 meters. This accommodates public rounding and simplification. Generic names alone, nearby facilities, overlapping land parcels, and points inside park boundaries are insufficient.

These are conservative automatic matches, not a claim that every semantic duplicate or alternate-name record has been resolved. Different representations and uncertain matches stay private for review. Rights, access and currency classifications are unchanged.

Each private manifest pins the public GeoJSON checksum, policy version, output checksum, complete pre-deduplication input and match report. The ignored `before-public-dedup.geojson` and `public-dedup.private.json` preserve every original feature and removed private detail. Repeated runs replay the preserved input, so counts do not drift; a changed public package triggers reconciliation against that input. Raw sources are untouched. Builders apply deduplication after composition; inventory verification rejects stale public pins or a replay mismatch.

| State | Private entries removed | Retained agency / DEC | Retained iOverlander | Retained total |
| --- | ---: | ---: | ---: | ---: |
| Alabama (AL) | 0 | 596 | 520 | 1,116 |
| Alaska (AK) | 0 | 1,240 | 1,784 | 3,024 |
| Arizona (AZ) | 0 | 170,035 | 4,246 | 174,281 |
| Arkansas (AR) | 0 | 436 | 722 | 1,158 |
| California (CA) | 0 | 0 | 8,021 | 8,021 |
| Colorado (CO) | 1,209 | 920 | 3,696 | 4,616 |
| Connecticut (CT) | 0 | 0 | 176 | 176 |
| Delaware (DE) | 40 | 7,641 | 61 | 7,702 |
| Florida (FL) | 14 | 16,699 | 2,446 | 19,145 |
| Georgia (GA) | 0 | 6,262 | 815 | 7,077 |
| Hawaii (HI) | 18 | 582 | 79 | 661 |
| Idaho (ID) | 7,007 | 63,968 | 1,975 | 65,943 |
| Illinois (IL) | 0 | 384 | 586 | 970 |
| Indiana (IN) | 0 | 6,148 | 458 | 6,606 |
| Iowa (IA) | 0 | 2,876 | 555 | 3,431 |
| Kansas (KS) | 2 | 541 | 581 | 1,122 |
| Kentucky (KY) | 1 | 4,091 | 447 | 4,538 |
| Louisiana (LA) | 0 | 28 | 550 | 578 |
| Maine (ME) | 0 | 12,942 | 661 | 13,603 |
| Maryland (MD) | 1 | 626 | 261 | 887 |
| Massachusetts (MA) | 0 | 0 | 373 | 373 |
| Michigan (MI) | 0 | 0 | 1,145 | 1,145 |
| Minnesota (MN) | 0 | 0 | 836 | 836 |
| Mississippi (MS) | 0 | 2,928 | 445 | 3,373 |
| Missouri (MO) | 0 | 2,137 | 787 | 2,924 |
| Montana (MT) | 0 | 8,752 | 2,174 | 10,926 |
| Nebraska (NE) | 0 | 0 | 504 | 504 |
| Nevada (NV) | 0 | 30 | 1,637 | 1,667 |
| New Hampshire (NH) | 0 | 20,012 | 351 | 20,363 |
| New Jersey (NJ) | 155 | 9,988 | 218 | 10,206 |
| New Mexico (NM) | 1 | 34 | 2,073 | 2,107 |
| New York (NY) | 0 | 40,087 | 1,186 | 41,273 |
| North Carolina (NC) | 0 | 67 | 1,019 | 1,086 |
| North Dakota (ND) | 0 | 48 | 389 | 437 |
| Ohio (OH) | 0 | 11,572 | 611 | 12,183 |
| Oklahoma (OK) | 0 | 44 | 563 | 607 |
| Oregon (OR) | 5 | 1,109 | 3,486 | 4,595 |
| Pennsylvania (PA) | 73 | 2,213 | 797 | 3,010 |
| Rhode Island (RI) | 51 | 3,193 | 71 | 3,264 |
| South Carolina (SC) | 0 | 324 | 491 | 815 |
| South Dakota (SD) | 0 | 298 | 716 | 1,014 |
| Tennessee (TN) | 0 | 5,789 | 777 | 6,566 |
| Texas (TX) | 0 | 6,681 | 2,912 | 9,593 |
| Utah (UT) | 1 | 93 | 3,714 | 3,807 |
| Vermont (VT) | 166 | 4,575 | 406 | 4,981 |
| Virginia (VA) | 7 | 2,655 | 920 | 3,575 |
| Washington (WA) | 0 | 7,426 | 3,283 | 10,709 |
| West Virginia (WV) | 0 | 5,834 | 354 | 6,188 |
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
