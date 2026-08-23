# WP-007/WP-008 physical iPhone workoff procedure

**Device/profile:** iPhone 14, iOS 26.2, `iphone14-ios26.2-phase0-v1`

## Candidate preparation

1. Run the complete Windows quality gate and record the exact commit and release-config SHA-256.
2. Dispatch `macos-ios-build` once for that commit. Confirm the autolinked `OpenOutdoorNativeSpikes` pod compiles under Xcode 26.4.1 and record the IPA digest.
3. Sign/install through AltServer with `org.openoutdoor.local`; do not delete the existing app container for the A→B path.
4. Keep routes, device/account identifiers, screenshots, and raw logs private. Publish only reviewed summaries.

## Tracker protocol

1. Open **Open Outdoor native feasibility**, request Always Location, choose Balanced or Endurance, and use the native Start/Stop controls.
2. With no active/recoverable session, tap **Measure 20 Start/Stop acknowledgements**. Require 20 bridge-inclusive Start samples and 20 Stop samples with both nearest-rank p95 values at or below 500 ms.
3. Select High Accuracy, start recording, and tap **Inspect active tracking protection**. Require the active directory, manifest, and spool to report `NSFileProtectionCompleteUntilFirstUserAuthentication` and backup exclusion.
4. While that session remains active, tap **Begin 30-minute memory profile**, lock the phone for at least 30 minutes, unlock, and tap **Finish 30-minute memory profile** before Stop. Require at least 20 resident-memory samples and p95 at or below 150 MiB. Tap **Share physical diagnostic JSON** and retain the coordinate-free report.
5. During dedicated functional cases, lock the screen, suspend/foreground, enter poor GPS, and enable airplane/weak-cell conditions. For process death, terminate after a known checkpoint, relaunch, tap **Inspect tracking spool**, confirm the recovered sequence/mode/session and any torn-line flag, then tap **Recover interrupted session** and continue.
6. Stop recording and prove no later location/barometer observations are appended.
7. Confirm mode behavior by source/config inspection: High Accuracy is explicit, Balanced uses a 10 m distance filter, Endurance uses 25 m, sensors run only during active recording, and no continuous polling is introduced.

Full battery/thermal characterization is deferred to WP-307/WP-503 and must not be inferred from this workoff.

## Protection and system-backup inspection

1. Tap **Seed fixture version A**. This creates only synthetic user SQLite/WAL/SHM records, an attachment, diagnostic, and public/private catalogs.
2. Tap **Inspect current fixture** and **Share diagnostic JSON**. Review every reported effective protection class, backup-exclusion value, record count, and record hash.
3. Use the physical diagnostic report for the active-spool effective policy. Lock the device: the active spool must remain available; the sealed private database must be denied. Reboot and verify safe pre-first-unlock behavior separately; effective policy metadata cannot substitute for the reboot case.
4. Create a temporary local Apple Devices/iTunes backup on Windows with **Encrypt local backup** disabled. Phase 0 reads only the plaintext `Manifest.db` inventory and never reads payload files. Run `uv run --frozen python -m open_outdoor_data.ios_backup_inspector --backup-root <backup-directory> --report <private-report.json>` and require `passed: true`, then delete the temporary unencrypted backup after retaining the redacted report. Encrypted-container parsing and restore remain WP-107/WP-306 under ADR-041.
5. Verify the uninstall warning. Do not uninstall for Phase 0: ADR-041 moves encrypted restore to WP-107/WP-306.

## Same-identity A→B and downgrade matrix

1. In version A tap **Seed fixture version A**, share the report, and retain its synthetic record counts/hashes privately.
2. Install/refresh version B with the same bundle identity. Tap **Inspect current fixture** before mutation to prove A survived.
3. Re-seed A before each independent checkpoint case, select the checkpoint, and tap **Apply version B**. Before-pointer checkpoints retain catalog A; after-pointer interruption rolls back; `after-first-launch` activates B.
4. On the successful B path, verify unchanged activity/user-trail/note/favorite/attachment hashes, changed association/overlay hashes, the remapped link, and one unresolved-review link.
5. Attempt unsupported older app/catalog combinations and prove read-only failure before mutation. Backup-schema compatibility and restore are WP-107/T-BAK-001.

Record every exact case ID, environment, timestamps, artifact/config hashes, result, redaction class, reviewer, and residual risk in WP-007/WP-008 evidence before changing the Phase 0 gate.
