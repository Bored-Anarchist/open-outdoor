# Private state package inventory

**50 active packages: one for each U.S. state.** This count excludes source ZIPs, historical archives, and territories. All packages remain local under Git-ignored `PrivateData/`; only this inventory and the tooling are published to GitHub.

The inventory verifier checks each package checksum and its feature counts against the manifest. 43 packages contain agency + iOverlander data, New York contains DEC + selected OPRHP + iOverlander, and 6 packages use iOverlander alone because no eligible staged agency records are available.

Totals: **463,870 agency/DEC features**, **63,283 iOverlander places**, and **527,153 features**. Counts do not establish current access, source completeness, or permission to redistribute.

The [private/public deduplication report](PRIVATE_PUBLIC_STATE_DEDUPLICATION_2026-09-28.md) records same-state matches, retained counts, thresholds and recoverable private audit files. Rebuilds automatically apply these checks; inventory verification replays every match against the pinned public package.

The [NC/LA visitor coverage update](NC_LA_VISITOR_COVERAGE_2026-09-28.md) records current NC forest selections and the checksum-bound Indian Creek agency visitor reference. Forestry inventory, land-cover and planning sources are excluded; Oklahoma tree-inventory records are removed from its active visitor package.

New York also packages **5,289 DEC trail elevation profiles**, verified against every packaged trail sample and statistic. Profiles describe existing trail features and are not added to the feature total. Florida includes 76 converted forest polygons; Oklahoma includes 44 historical state-park location points. See the [integration report](PRIVATE_PACKAGE_INTEGRATION_2026-09-27.md).

California combines both source packages. Connecticut and Massachusetts use their shared source package, filtered to each state boundary. Packages containing only iOverlander can add eligible agency data on a later rebuild; their agency permissions remain unchanged.

| State | Package contents | Agency / DEC features | iOverlander places | Total |
| --- | --- | ---: | ---: | ---: |
| Alabama (AL) | Agency + iOverlander | 596 | 520 | 1,116 |
| Alaska (AK) | Agency + iOverlander | 1,240 | 1,784 | 3,024 |
| Arizona (AZ) | Agency + iOverlander | 170,035 | 4,243 | 174,278 |
| Arkansas (AR) | Agency + iOverlander | 436 | 722 | 1,158 |
| California (CA) | iOverlander only | 0 | 8,016 | 8,016 |
| Colorado (CO) | Agency + iOverlander | 920 | 3,692 | 4,612 |
| Connecticut (CT) | iOverlander only | 0 | 176 | 176 |
| Delaware (DE) | Agency + iOverlander | 7,646 | 61 | 7,707 |
| Florida (FL) | Agency + iOverlander | 16,699 | 2,445 | 19,144 |
| Georgia (GA) | Agency + iOverlander | 6,262 | 814 | 7,076 |
| Hawaii (HI) | Agency + iOverlander | 584 | 79 | 663 |
| Idaho (ID) | Agency + iOverlander | 63,970 | 1,968 | 65,938 |
| Illinois (IL) | Agency + iOverlander | 384 | 586 | 970 |
| Indiana (IN) | Agency + iOverlander | 6,148 | 458 | 6,606 |
| Iowa (IA) | Agency + iOverlander | 2,876 | 555 | 3,431 |
| Kansas (KS) | Agency + iOverlander | 541 | 581 | 1,122 |
| Kentucky (KY) | Agency + iOverlander | 4,092 | 446 | 4,538 |
| Louisiana (LA) | Agency + iOverlander | 28 | 550 | 578 |
| Maine (ME) | Agency + iOverlander | 12,942 | 661 | 13,603 |
| Maryland (MD) | Agency + iOverlander | 626 | 261 | 887 |
| Massachusetts (MA) | iOverlander only | 0 | 373 | 373 |
| Michigan (MI) | iOverlander only | 0 | 1,143 | 1,143 |
| Minnesota (MN) | iOverlander only | 0 | 835 | 835 |
| Mississippi (MS) | Agency + iOverlander | 2,928 | 444 | 3,372 |
| Missouri (MO) | Agency + iOverlander | 2,137 | 787 | 2,924 |
| Montana (MT) | Agency + iOverlander | 8,752 | 2,168 | 10,920 |
| Nebraska (NE) | iOverlander only | 0 | 504 | 504 |
| Nevada (NV) | Agency + iOverlander | 30 | 1,635 | 1,665 |
| New Hampshire (NH) | Agency + iOverlander | 20,012 | 351 | 20,363 |
| New Jersey (NJ) | Agency + iOverlander | 10,007 | 218 | 10,225 |
| New Mexico (NM) | Agency + iOverlander | 34 | 2,071 | 2,105 |
| New York (NY) | DEC + OPRHP + iOverlander | 40,087 | 1,186 | 41,273 |
| North Carolina (NC) | Agency + iOverlander | 67 | 1,018 | 1,085 |
| North Dakota (ND) | Agency + iOverlander | 48 | 389 | 437 |
| Ohio (OH) | Agency + iOverlander | 11,572 | 611 | 12,183 |
| Oklahoma (OK) | Agency + iOverlander | 44 | 563 | 607 |
| Oregon (OR) | Agency + iOverlander | 1,110 | 3,485 | 4,595 |
| Pennsylvania (PA) | Agency + iOverlander | 2,214 | 797 | 3,011 |
| Rhode Island (RI) | Agency + iOverlander | 3,199 | 71 | 3,270 |
| South Carolina (SC) | Agency + iOverlander | 324 | 491 | 815 |
| South Dakota (SD) | Agency + iOverlander | 298 | 716 | 1,014 |
| Tennessee (TN) | Agency + iOverlander | 5,789 | 777 | 6,566 |
| Texas (TX) | Agency + iOverlander | 6,681 | 2,912 | 9,593 |
| Utah (UT) | Agency + iOverlander | 93 | 3,706 | 3,799 |
| Vermont (VT) | Agency + iOverlander | 4,578 | 406 | 4,984 |
| Virginia (VA) | Agency + iOverlander | 2,655 | 920 | 3,575 |
| Washington (WA) | Agency + iOverlander | 7,426 | 3,281 | 10,707 |
| West Virginia (WV) | Agency + iOverlander | 5,834 | 353 | 6,187 |
| Wisconsin (WI) | Agency + iOverlander | 123 | 866 | 989 |
| Wyoming (WY) | Agency + iOverlander | 31,803 | 1,588 | 33,391 |

## Rebuild and verify

```text
node tools/packages/build-private-state-agency-ioverlander.mjs --all
node tools/packages/deduplicate-private-state-packages.mjs --all
node tools/reporting/report-private-state-packages.mjs
```

New York uses its separate reviewed DEC+iOverlander builder followed by `node tools/packages/package-private-new-york-agencies.mjs`. Selected public-designated OPRHP trails and facilities, camping and park locators are private dated references. Unchanged park polygons and temporal feeds remain separate private reference snapshots. Its civil boundary, NPS, and USFS data remain in the public system. See [remaining-gap resolution](STATE_AGENCY_GAP_RESOLUTION_2026-09-28.md).
