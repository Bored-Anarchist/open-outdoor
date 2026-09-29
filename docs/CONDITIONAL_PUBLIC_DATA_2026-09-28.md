# Minnesota and Virginia public derivative review — 2026-09-28

The project owner confirmed this application is noncommercial. Four exact conditional agency feeds are now included in the public Minnesota and Virginia packages. The upstream rights matrix remains Conditional; acquisition receipts clear only this processed distribution and retain the source terms. Permission-held New York and other agency data remain in the private system.

| Public input | Selected records | Processing and conditions |
| --- | ---: | --- |
| Minnesota State Park Trails and Roads | 7,818 of 26,963 | Hiking-designated, non-abandoned segments; selected visitor fields, reprojected and modified geometry. MNDNR credit; reference only, no navigation or legal boundaries/access. |
| Minnesota State Forest Campgrounds | 54 of 61 | Facilities whose source type contains Camp; selected visitor fields, modified geometry. Same MNDNR conditions. |
| Virginia DCR State Park Trails | 631 | Source geometry processed for public packages; DCR credit and separate terms. Redistribution for profit prohibited. |
| Virginia DCR State Park Boundaries | 44 | Same DCR conditions; informational boundaries do not establish legal access. |

## Minnesota evidence and derivative

The [MNDNR GIS license](https://www.dnr.state.mn.us/sitetools/data_software_license_plain.html) allows credited modified derivatives, restricts entire-source redistribution and requires reference-only use. Current item metadata binds the exact [trails item](https://www.arcgis.com/sharing/rest/content/items/c90e8f624b714e3498a4c21b4e52df32/info/metadata/metadata.xml) and [campgrounds item](https://www.arcgis.com/sharing/rest/content/items/28d6a3aa5bc8431bb90af36ac80974af/info/metadata/metadata.xml) to that license. Acquisition receipts retain the metadata evidence URL/hash, current terms hash, source and selected counts, object-ID pages, field selection and modifications. The complete license notice is carried in DATA_NOTICES.md and embedded in the SQLite catalog.

Trails select `(use_hike=1 OR use_hiking=1 OR use_selfgu=1 OR use_accpat=1 OR use_wntrhi=1) AND (use_abando IS NULL OR use_abando<>1)`. Their retained source fields are `objectid`, `trail_name`, `road_name`, `public_use`, `use_hike`, `use_hiking` and `lengthmile`. Campgrounds select `site_type LIKE '%Camp%'`, retaining `objectid`, `facility_name`, `site_type`, `state_forest` and `pat_admin_unit`. The pipeline rejects entire-source selections and unexpected fields. Geometry is requested in WGS84, simplified at 0.00003 degrees and rounded to five decimal places. This is a selected visitor derivative, rather than an entire dataset repackaged in SQLite.

Every Minnesota derivative record carries `navigationAllowed: false` and a reference-only access notice. The app disables its directions action and guards both directions handlers for these records. Manual import, save/restore, index summaries and SQLite retain those properties. Feature details show source credit and distribution conditions. Current access and legal boundaries must be checked with the manager. No MNDNR endorsement is implied.

Entire raw Minnesota datasets are not public package inputs. Forest Stand Inventory remains excluded because timber stands are not visitor POIs.

## Virginia distribution

The live DCR [trails terms](https://services1.arcgis.com/PxUNqSbaWFvFgHnJ/ArcGIS/rest/services/SP_Trails/FeatureServer/info/iteminfo?f=pjson) and [boundary terms](https://services1.arcgis.com/PxUNqSbaWFvFgHnJ/ArcGIS/rest/services/SP_Boundary/FeatureServer/info/iteminfo?f=pjson) prohibit redistribution for profit and require DCR credit. The current noncommercial scope satisfies that distribution condition. Source notices, manifests and visitor records preserve those terms; Virginia source data are outside the project code license. A future commercial distribution must revisit this clearance.

Only these two DCR services are cleared. Virginia State Trails and forestry sources with unconfirmed rights retain their existing gates.

## Rebuild and verification

`tools/conditional-public-agency.mjs` pins the exact URLs, Minnesota filters/fields and noncommercial scope. Broadening those inputs fails clearance. `tools/acquire-public-state-agency.mjs` independently acquires the public sources and rechecks live terms. The public builder never reads PrivateData. Tests cover rejected broadened/commercial profiles and the preservation of credit, conditions and the navigation restriction through packaging and manual import/save/restore.

Rebuild selected sources with `node tools/acquire-public-state-agency.mjs mn-dnr-hiking mn-dnr-campgrounds va-dcr-trails va-dcr-boundaries`, then run `node tools/build-public-state-packages.mjs MN VA`, `node tools/report-public-state-packages.mjs`, `python tools/build-state-loader.py --states MN VA --workers 2` and both public-package and state-loader verifiers. Full-state catalogs contain 25,726 Minnesota records and 11,676 Virginia records including their existing national baseline. The complete public inventory now contains 748,156 features, 77,013 POIs and 129,406 direct agency records from 16 acquisitions in 10 states.

Verification passed for all 50 public packages and 168 import parts, all 748,156 SQLite catalog records with original geometries, source/index bindings, complete notices and tile hashes, 419 application tests, 104 release tests and six Python catalog tests. TypeScript and local iOS/Metro export passed. Native compilation and physical phone acceptance are separate checks.
