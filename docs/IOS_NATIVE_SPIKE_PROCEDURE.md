# WP-007/WP-008 physical iPhone workoff procedure

**Device/profile:** iPhone 14, iOS 26.2, `iphone14-ios26.2-phase0-v1`

## Candidate preparation

1. Run the complete Windows quality gate and record the exact commit and release-config SHA-256.
2. Dispatch `macos-ios-build` once for that commit. Confirm the autolinked `OpenOutdoorNativeSpikes` pod compiles under Xcode 26.4.1 and record the IPA digest.
3. Sign/install through AltServer with `org.openoutdoor.local`; do not delete the existing app container for the A→B path.
4. Keep routes, device/account identifiers, screenshots, and raw logs private. Publish only reviewed summaries.

## Tracker protocol

1. Warm up once, then record at least three independent four-hour screen-off runs for Balanced and three for Endurance.
2. Record start/stop acknowledgement, battery start/end, battery health, p95 resident memory, temperature, radio/GPS conditions, travelled distance, screen time, wakeups/retries, and thermal state.
3. During dedicated shorter cases, lock the screen, suspend/foreground, enter poor GPS, enable airplane/weak-cell conditions, terminate the process after a known checkpoint, relaunch, and verify sequence/gap state.
4. Stop recording and prove no later location/barometer observations are appended.
5. Measure High Accuracy separately; keep the mode blocked until a limit is approved.

## Protection and backup inspection

1. After first unlock, create an active spool, sealed user database with WAL/SHM, attachment, public/private catalog, diagnostic, and explicit-backup temporary file.
2. Inspect each file/directory for the declared protection class and `isExcludedFromBackupKey`, including after copy, replacement, migration, and pointer activation.
3. Lock the device: the active spool must remain available; the sealed private database must be denied. Reboot and verify safe pre-first-unlock behavior.
4. Inspect the system backup inventory and prove excluded private/regenerable content is absent.

## Same-identity A→B and downgrade matrix

1. In A create an activity, user trail, association, overlay, note, favorite, and attachment; record private counts/hashes.
2. Install/refresh B with schema migration, catalog replacement, ID remap, promotion link, and one unresolved link.
3. Verify exact counts/hashes, composed queries, duplicate suppression, unresolved review, and catalog integrity.
4. Force failure at copy/checksum/compatibility/remap/pointer/first-launch boundaries; retain either old known-good or fully confirmed new catalog and never roll back private data.
5. Attempt unsupported older app/catalog/backup combinations and prove read-only failure before mutation.

Record every exact case ID, environment, timestamps, artifact/config hashes, result, redaction class, reviewer, and residual risk in WP-007/WP-008 evidence before changing the Phase 0 gate.
