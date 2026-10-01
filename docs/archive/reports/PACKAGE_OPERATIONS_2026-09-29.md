# Package backup and refresh operations — 2026-09-29

## Verified external mirrors

All 50 public packages were copied and checksum-verified outside the repository: 421 files, 4,052,669,945 logical bytes, including GeoJSON, indexes, import parts, SQLite catalogs, notices, manifests and inventories. All 50 active private packages were backed up: 260 files, 3,262,214,848 logical bytes, including pinned deduplication inputs, audit reports, community enrichments and New York's packaged profiles. Raw private source archives and disposable caches are outside this package-backup scope.

Public and private roots are separate. Private storage disables inherited permissions and grants access only to the current Windows account, SYSTEM and local administrators. Checksum-named objects and hard-linked release views avoid copying unchanged content for each snapshot. The private object store contains 2,776,110,741 content bytes for this snapshot. Treat mirror files as immutable: restore or copy them for editing instead of modifying linked release files.

The mirror is on the same computer. An external-drive or cloud copy is still needed for hardware-loss protection; no paid hosting was provisioned. Machine-specific locations and current release paths live in ignored `.private/package-maintenance.json`, not public Git. `pnpm map:public:restore NY` uses that public mirror automatically; explicit `--from` or HTTPS settings take precedence.

## Restore evidence

A fresh Git archive contained no generated state data. New York's GeoJSON, index, SQLite catalog and import part were restored from the mirror into that checkout. Independent checks verified all five manifest-pinned state artifacts, including the already tracked source notices. The normal checkout's default mirror setting was also tested and skipped intact files.

Operation tests cover state-relative backup receipts, content sharing across snapshots, corrupt input rejection, private recovery/enrichment selection and persistent pending source changes. Maintenance tests also cover streaming restore integrity and failed private refresh recovery.

## Weekly source checks

A local Codex heartbeat checks sources every Monday at 08:00 in the app's local schedule. It follows the [maintenance guide](../../guides/PACKAGE_MAINTENANCE.md), uses ignored reports/configuration, and refreshes affected versioned sources through existing rights-gated adapters. It verifies rebuilds and private deduplication, updates completed external backups, and publishes only verified metadata/tooling changes. Pending changes remain flagged until verification succeeds. `--acknowledge` is only for resolved changes.

The initial metadata check returned no request errors for 156 source references: 51 provided edit revisions and 105 did not. These are observation baselines, not proof that packaged snapshots are current. Unversioned APIs, file-only downloads and local iOverlander archives remain flagged for source-specific refresh methods. Unchanged metadata or matching counts cannot establish unchanged records.

The heartbeat excludes history rewriting, backup deletion, paid hosting and publisher-permission renewal. Missing approvals, changed rights and failed checks are reported without publishing incomplete packages.

## Historical storage review

Read-only auditing found 602 historical state-package Git blobs totaling 3,913,975,289 uncompressed bytes and 56 distinct referenced state-package LFS objects totaling 1,707,677,815 bytes. These are referenced-content measurements, not GitHub billing totals. Local ordinary Git object storage was approximately 702.7 MiB at review time. Current tracking includes zero complete generated state-package files.

History remains unchanged. The reviewed cleanup sequence is to preserve verified packages and a recoverable repository/ref backup, inventory affected branches/tags/PRs/forks, perform a path-filtered rewrite in an isolated clone, run code and restore checks, coordinate remote-ref updates and fresh collaborator clones, then review GitHub LFS retention separately. Preserve starter app assets, metadata and notices. Rewriting pointers does not establish that hosted LFS storage has been reclaimed.

This plan does not alter refs: a history rewrite would affect existing clones and branches and requires separate coordination.
