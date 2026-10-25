# New York refresh status — 2026-10-24

NY is partially refreshed. Package integrity and source freshness are separate outcomes.

| Source | Result |
| --- | --- |
| Civil boundary | Reacquired and validated on October 24. |
| USFS / BLM | Fully reacquired on October 24: 201 ownership records, 25 recreation sites, 12 MVUM roads; zero MVUM trails or BLM managed-land records returned. |
| NPS | Refresh returned HTTP 429 using the available demo credentials; no configured NPS API key. Preserve the September 16 records and original source receipts, including visitor details and 24 dated alerts. They are not current condition assertions. |
| OPRHP | All eight layers reacquired on October 24. Durable selected overlay contains 25,517 records. Park polygons and temporal/seasonal layers remain separate private references. |
| OPRHP approval ledger | No exact OPRHP entries are currently stored in the local approval ledger. Future refreshes require explicitly recorded, unexpired source approvals; the adapter preserves existing snapshots and never creates or renews approvals. |
| DEC | Existing 14,454 records and 5,289 elevation profiles retained. Publisher grant evidence required by the adapter is absent; no fresh DEC acquisition claimed. |
| iOverlander | Existing 1,186 reviewed private places retained; no new archive acquired. |

Public NY contains 327 features and 81 POIs. Private NY contains 41,157 features: 14,454 DEC, 25,517 selected OPRHP and 1,186 iOverlander. Elevation profiles describe existing trails and are not additional features. The new source checker lists 22 NY references, including all eight OPRHP layers, four DEC sources and NPS endpoints. First revision baselines are metadata observations, not freshness evidence.

The richer committed NPS records were recovered with their September 16 receipts after a prior composition replaced them with a September 14 snapshot that omitted visitor details. Future composition rejects that regression unless explicitly retaining the previous NPS records. The manifest records source-specific freshness instead of attributing the newest package date to every source.

Use the [maintenance guide](../guides/PACKAGE_MAINTENANCE.md#new-york-refresh) for the repeatable refresh command and remaining requirements. Private records, private evidence and local archive paths are excluded from GitHub.
