# WP-007/WP-008 physical iPhone workoff procedure

**Device/profile:** iPhone 14, iOS 26.2, `iphone14-ios26.2-phase0-v1`

## Candidate preparation

1. Run the complete Windows quality gate and record the exact commit and release-config SHA-256.
2. Dispatch `macos-ios-build` once for that commit. Confirm the autolinked `OpenOutdoorNativeSpikes` pod compiles under Xcode 26.4.1 and record the IPA digest.
3. Sign/install through AltServer with `org.openoutdoor.local`; do not delete the existing app container for the A→B path.
4. Keep routes, device/account identifiers, screenshots, and raw logs private. Publish only reviewed summaries.

## Tracker protocol

1. Open **Open Outdoor native feasibility**, request Always Location, choose Balanced or Endurance, and use the native Start/Stop controls.
2. Record start/stop acknowledgement and p95 resident memory during one 30-minute screen-off smoke. Battery percentage and thermal endurance are not acceptance evidence in Phase 0/Phase 1.
3. During dedicated functional cases, lock the screen, suspend/foreground, enter poor GPS, and enable airplane/weak-cell conditions. For process death, terminate after a known checkpoint, relaunch, tap **Inspect tracking spool**, confirm the recovered sequence/mode/session and any torn-line flag, then tap **Recover interrupted session** and continue.
4. Stop recording and prove no later location/barometer observations are appended.
5. Confirm mode behavior by source/config inspection: High Accuracy is explicit, Balanced uses a 10 m distance filter, Endurance uses 25 m, sensors run only during active recording, and no continuous polling is introduced.

Full battery/thermal characterization is deferred to WP-307/WP-503 and must not be inferred from this workoff.

## Protection and system-backup inspection

1. Tap **Seed fixture version A**. This creates only synthetic user SQLite/WAL/SHM records, an attachment, diagnostic, and public/private catalogs.
2. Tap **Inspect current fixture** and **Share diagnostic JSON**. Review every reported effective protection class, backup-exclusion value, record count, and record hash.
3. Lock the device: the active spool must remain available; the sealed private database must be denied. Reboot and verify safe pre-first-unlock behavior.
4. Create an encrypted iTunes backup on Windows. Run `uv run --frozen python -m open_outdoor_data.ios_backup_inspector --backup-root <backup-directory> --report <private-report.json>` and require `passed: true`.
5. Verify the uninstall warning. Do not uninstall for Phase 0: ADR-041 moves encrypted restore to WP-107/WP-306.

## Same-identity A→B and downgrade matrix

1. In version A tap **Seed fixture version A**, share the report, and retain its synthetic record counts/hashes privately.
2. Install/refresh version B with the same bundle identity. Tap **Inspect current fixture** before mutation to prove A survived.
3. Re-seed A before each independent checkpoint case, select the checkpoint, and tap **Apply version B**. Before-pointer checkpoints retain catalog A; after-pointer interruption rolls back; `after-first-launch` activates B.
4. On the successful B path, verify unchanged activity/user-trail/note/favorite/attachment hashes, changed association/overlay hashes, the remapped link, and one unresolved-review link.
5. Attempt unsupported older app/catalog combinations and prove read-only failure before mutation. Backup-schema compatibility and restore are WP-107/T-BAK-001.

Record every exact case ID, environment, timestamps, artifact/config hashes, result, redaction class, reviewer, and residual risk in WP-007/WP-008 evidence before changing the Phase 0 gate.
