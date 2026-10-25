# New York refresh status — 2026-10-24

OPRHP and DEC are now refreshed privately under explicit owner authorization. NPS and the local iOverlander archive retain their separately documented snapshot limitations. Package integrity and source freshness are separate outcomes.

| Source | Result |
| --- | --- |
| Civil boundary | Reacquired and validated on October 24. |
| USFS / BLM | Fully reacquired on October 24: 201 ownership records, 25 recreation sites, 12 MVUM roads; zero MVUM trails or BLM managed-land records returned. |
| NPS | Refresh returned HTTP 429 using the available demo credentials; no configured NPS API key. Preserve the September 16 records and original source receipts, including visitor details and 24 dated alerts. They are not current condition assertions. |
| OPRHP | All eight layers reacquired on October 24. Durable selected overlay contains 25,517 records. Park polygons and temporal/seasonal layers remain separate private references. |
| Private authorization | The owner authorized all eight OPRHP and all four DEC sources for private collection/packages. Exact local approvals were recorded for 90 days; publisherGrant and publicDistribution remain false. Acquisition commands reuse approvals without renewing them. |
| DEC | Fully reacquired under owner-authorized private validation: 3,300 lands, 1,308 roads, 5,296 trails and 4,560 POIs, totaling 14,464 records. All 5,296 trail profiles were regenerated from current geometry and 371 locally cached terrain tiles. No private geometry was sent to a terrain provider. |
| iOverlander | Existing 1,186 reviewed private places retained; no new archive acquired. |

Public NY contains 327 features and 81 POIs. Private NY contains 41,167 features: 14,464 DEC, 25,517 selected OPRHP and 1,186 iOverlander. Elevation profiles describe existing trails and are not additional features. The new source checker lists 22 NY references, including all eight OPRHP layers, four DEC sources and NPS endpoints. First revision baselines are metadata observations, not freshness evidence.

The richer committed NPS records were recovered with their September 16 receipts after a prior composition replaced them with a September 14 snapshot that omitted visitor details. Future composition rejects that regression unless explicitly retaining the previous NPS records. The manifest records source-specific freshness instead of attributing the newest package date to every source.

Use the [maintenance guide](../guides/PACKAGE_MAINTENANCE.md#new-york-refresh) for the repeatable refresh command and remaining requirements. Private records, private evidence and local archive paths are excluded from GitHub.
