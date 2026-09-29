# Installable public state catalog inventory — updated 2026-09-28

Each state is one `state.sqlite` package. Transfer size is the complete externally stored SQLite file; installed size adds its extracted local PMTiles archive. No private or iOverlander source records are distributed in these public catalogs. Source coverage, agency rights and historical limitations remain as recorded in the [public source inventory](PUBLIC_STATE_PACKAGE_INVENTORY_2026-09-27.md).

All 50 states contain 757,622 catalog records and 25,488 tiles. Combined transfer size is 1,393,717,248 bytes (1.30 GiB); installed size is 1,560,053,331 bytes (1.45 GiB). These totals exclude rollback copies, source downloads, existing basemaps and user data.

| State | Records | Transfer MiB | Installed MiB | Tiles |
| --- | ---: | ---: | ---: | ---: |
| Alabama (AL) | 1,995 | 6.86 | 7.76 | 202 |
| Alaska (AK) | 22,999 | 107.04 | 123.00 | 8,328 |
| Arizona (AZ) | 16,757 | 30.52 | 34.21 | 414 |
| Arkansas (AR) | 6,214 | 10.05 | 11.33 | 217 |
| California (CA) | 66,285 | 108.87 | 121.60 | 728 |
| Colorado (CO) | 31,137 | 59.76 | 66.44 | 483 |
| Connecticut (CT) | 24,047 | 29.80 | 32.33 | 42 |
| Delaware (DE) | 2,683 | 4.68 | 5.38 | 26 |
| Florida (FL) | 14,006 | 22.74 | 25.99 | 284 |
| Georgia (GA) | 5,958 | 10.76 | 12.40 | 259 |
| Hawaii (HI) | 1,071 | 3.37 | 4.07 | 1,680 |
| Idaho (ID) | 25,629 | 60.07 | 66.69 | 501 |
| Illinois (IL) | 10,614 | 14.31 | 16.45 | 281 |
| Indiana (IN) | 3,361 | 5.16 | 5.99 | 180 |
| Iowa (IA) | 4,893 | 7.80 | 9.16 | 294 |
| Kansas (KS) | 2,154 | 3.07 | 3.58 | 261 |
| Kentucky (KY) | 7,230 | 13.08 | 14.88 | 210 |
| Louisiana (LA) | 4,783 | 6.74 | 7.67 | 205 |
| Maine (ME) | 4,334 | 8.34 | 9.70 | 216 |
| Maryland (MD) | 4,910 | 8.61 | 9.92 | 92 |
| Massachusetts (MA) | 70,399 | 87.19 | 94.72 | 83 |
| Michigan (MI) | 31,083 | 47.54 | 51.45 | 412 |
| Minnesota (MN) | 25,726 | 43.95 | 48.52 | 511 |
| Mississippi (MS) | 2,733 | 5.12 | 5.91 | 215 |
| Missouri (MO) | 6,447 | 10.15 | 11.68 | 331 |
| Montana (MT) | 29,557 | 60.20 | 67.73 | 1,104 |
| Nebraska (NE) | 2,332 | 4.00 | 4.63 | 291 |
| Nevada (NV) | 29,318 | 42.54 | 46.17 | 494 |
| New Hampshire (NH) | 5,538 | 9.04 | 10.28 | 77 |
| New Jersey (NJ) | 14,743 | 24.59 | 28.19 | 61 |
| New Mexico (NM) | 12,896 | 26.73 | 30.46 | 559 |
| New York (NY) | 326 | 2.20 | 2.57 | 468 |
| North Carolina (NC) | 9,541 | 22.56 | 26.00 | 245 |
| North Dakota (ND) | 1,125 | 3.88 | 4.68 | 404 |
| Ohio (OH) | 7,161 | 11.16 | 12.91 | 216 |
| Oklahoma (OK) | 2,299 | 4.48 | 5.33 | 324 |
| Oregon (OR) | 44,590 | 68.44 | 76.32 | 777 |
| Pennsylvania (PA) | 14,246 | 22.00 | 25.44 | 236 |
| Rhode Island (RI) | 1,767 | 2.46 | 2.82 | 19 |
| South Carolina (SC) | 4,347 | 8.35 | 9.61 | 147 |
| South Dakota (SD) | 5,616 | 10.52 | 11.99 | 405 |
| Tennessee (TN) | 6,044 | 13.09 | 14.96 | 208 |
| Texas (TX) | 12,960 | 19.68 | 22.81 | 780 |
| Utah (UT) | 73,606 | 117.22 | 125.75 | 393 |
| Vermont (VT) | 2,944 | 5.39 | 6.11 | 75 |
| Virginia (VA) | 11,676 | 22.09 | 24.55 | 246 |
| Washington (WA) | 19,086 | 38.28 | 43.16 | 436 |
| West Virginia (WV) | 2,883 | 5.71 | 6.47 | 143 |
| Wisconsin (WI) | 10,355 | 17.21 | 19.83 | 341 |
| Wyoming (WY) | 35,218 | 51.77 | 58.16 | 584 |

Exact whole-file, tile and source/index SHA-256 checksums are pinned in `packages/map/src/assets/state-packages/US/loader-inventory.json`. Files are installed through the [state package loader](STATE_PACKAGE_LOADER.md); the original manual GeoJSON importer retains its existing limits.

Independent verification passed for all 50 catalogs and all 757,622 original geometries, visitor summaries, feature/search/spatial counts, source/index bindings, full source notices, tile-blob hashes, PMTiles headers/sample tile decoding and read-only queries. The application suite passed 419 tests across 61 files, release checks passed 115 tests, and the Python catalog tests passed six tests. TypeScript, formatting and documentation governance passed. Local iOS/Metro export passed again after the NC catalog update. These automated checks do not establish physical phone acceptance.

The preceding complete [unsigned iOS build](https://github.com/Bored-Anarchist/open-outdoor/actions/runs/36507140356) passed for code commit `da5b7109fa03f074b990a5e1ca306d792f4f7adb`, including native compilation, Metro/Hermes bundling, app packaging and artifact upload. All five hosted PR jobs passed for that code commit. Physical phone acceptance and production catalog trust integration remain pending.
