# State dataset release readiness — 2026-09-27

The current [inventory](PUBLIC_STATE_PACKAGE_INVENTORY_2026-09-27.md) and [format/rebuild guide](PUBLIC_STATE_PACKAGE_FORMAT.md) replace the earlier category/import gate decision. Existing source rights classifications remain unchanged.

| Data | Current decision | Remaining limits |
| --- | --- | --- |
| All 50 public state packages | Packaged with GeoJSON, index, checksum manifest and 167 parser-validated import parts | Five active imports and 50 MiB combined storage remain; whole-state automatic activation and native phone acceptance are separate. |
| POI taxonomy | 76,959 points mapped from source categories; 20,540 remain Other | Unknown/infrastructure/toilet types retain source types and amenities. No invented traveler services or access claims. |
| Eligible state agency inputs | 120,859 features from 12 exact acquisitions in AR, CA, CO, CT, MA, NE, NV and UT | Repeated role URLs ingest once; separate points/lines keep independent receipts. Malformed/empty geometry is rejected and counted. |
| Historical agency inputs | Arkansas facilities, CAL FIRE 2024 boundaries and Massachusetts 2015 trails included as clearly dated informational references | Current facility existence, access, closure and completeness are not asserted. Arkansas operating-status verification and CAL FIRE's conflicting 14/15-forest counts remain unresolved. |
| Minnesota DNR | Conditional derivative path remains held | Exact downloads, item-specific terms and a permitted filtered/modified derivative are still needed; never ship complete raw datasets. |
| Virginia DCR | Conditional distribution remains held | Noncommercial-only terms, credit and separate data notice must be resolved for a public distribution plan. |
| Unconfirmed, restricted and permission-required agency sources | Excluded from public packages; private system retains eligible private validation data | No rights reclassification is implied by packaging public inputs. |
| New York | Same public state format; default app map/index synchronized; public hike document empty and bound to corrected checksum | 326 public features: civil boundary plus federal records. DEC's 14,454 records and 5,289 profiles remain private; OPRHP is excluded. Historical Git copies still exist. |

Connecticut's three distinct CC0 feeds are now packaged: properties, trails and access locations. Acquisition receipts record object-ID inventories, pages, edit dates, terms checksums, attribution and modifications. Their geometries are distinct feature types; a property or access point is not a legal permission or current closure record.

All 50 private packages remain intact. Restage the private New York mobile overlay after a public asset update to rebind the combined map/profile checksum. The public packaging tool never reads private source files.

Six forestry source roles remain leads: Arizona, Mississippi, Nevada, New Mexico and two South Dakota roles. Kansas and South Carolina partial agency layers remain permission-held. OSM extracts remain candidates requiring their separate source/ODbL integration path. No iOverlander source records are in the public packages.
