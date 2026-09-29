# State dataset release readiness — 2026-09-28

The current [inventory](PUBLIC_STATE_PACKAGE_INVENTORY_2026-09-27.md) and [format/rebuild guide](PUBLIC_STATE_PACKAGE_FORMAT.md) replace the earlier category/import gate decision. Existing source rights classifications remain unchanged. Minnesota and Virginia conditional derivatives are cleared for this scoped noncommercial distribution; see the [condition review](CONDITIONAL_PUBLIC_DATA_2026-09-28.md).

**State loader update:** The dedicated [offline state loader](STATE_PACKAGE_LOADER.md) installs complete catalogs with local tiles, search, checksum verification and rollback. The previous unsigned iOS build passed for code commit `dbd9bcd8aae2ac2aa4dafaa40bd05494ae420b7e`; the refreshed packages and source-condition UI require a new build. Physical phone acceptance and production catalog trust integration remain pending.

| Data | Current decision | Remaining limits |
| --- | --- | --- |
| All 50 public state packages | Packaged with GeoJSON, index, checksum manifest and 168 parser-validated import parts | Dedicated state SQLite loader supports complete states; manual imports retain five files and 50 MiB combined storage. Physical phone acceptance remains pending. |
| POI taxonomy | 77,013 points mapped from source categories; 20,540 remain Other | Unknown/infrastructure/toilet types retain source types and amenities. No invented traveler services or access claims. |
| Eligible state agency inputs | 129,406 features from 16 exact acquisitions in AR, CA, CO, CT, MA, MN, NE, NV, UT, VA | Repeated role URLs ingest once; separate points/lines keep independent receipts. Malformed/empty geometry is rejected and counted. |
| Historical agency inputs | Arkansas facilities, CAL FIRE 2024 boundaries and Massachusetts 2015 trails included as clearly dated informational references | Current facility existence, access, closure and completeness are not asserted. Arkansas operating-status verification and CAL FIRE's conflicting 14/15-forest counts remain unresolved. |
| Minnesota DNR | Filtered hiking and campground visitor derivatives included | 7,818 of 26,963 trail/road records and 54 of 61 facilities, with selected visitor fields and modified geometry. Credit MNDNR; reference only, no navigation/legal-access use. Entire raw datasets and non-visitor forest stand inventory excluded. |
| Virginia DCR | 631 trails and 44 boundaries included for the noncommercial application | Redistribution for profit prohibited; DCR credit and separate source terms retained in notices/manifests and visitor records. These data are outside the project code license. |
| Unconfirmed, restricted and permission-required agency sources | Excluded from public packages; private system retains eligible private validation data | No rights reclassification is implied by packaging public inputs. |
| New York | Same public state format; default app map/index synchronized; public hike document empty and bound to corrected checksum | 326 public features: civil boundary plus federal records. DEC's 14,454 records and 5,289 profiles remain private; OPRHP is excluded. Historical Git copies still exist. |

Connecticut's three distinct CC0 feeds are now packaged: properties, trails and access locations. Acquisition receipts record object-ID inventories, pages, edit dates, terms checksums, attribution and modifications. Their geometries are distinct feature types; a property or access point is not a legal permission or current closure record.

All 50 private packages remain intact. Restage the private New York mobile overlay after a public asset update to rebind the combined map/profile checksum. The public packaging tool never reads private source files.

Six forestry source roles remain leads: Arizona, Mississippi, Nevada, New Mexico and two South Dakota roles. Kansas and South Carolina partial agency layers remain permission-held. OSM extracts remain candidates requiring their separate source/ODbL integration path. No iOverlander source records are in the public packages.
