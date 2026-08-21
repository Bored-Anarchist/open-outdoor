# iOS Data Protection and Backup Policy

**Status:** Implementation foundation complete; physical inspection and restore evidence pending  
**Goal:** Preserve locked-screen recording while keeping sensitive location data out of implicit system backups
**Implementation:** WP-007/WP-008 add the protected native active spool, explicit file-policy helper, split SQLite capability boundary, and post-activation attribute reapplication. `T-PHY-005-C01`–`C08` still require the pinned iPhone; the Swift/Windows checks are not physical acceptance.

## 1. Policy decisions

- Private user data is excluded from automatic app-container backups. Recovery relies on the app's explicit encrypted backup/export flow.
- Regenerable public/private reference catalogs, caches, logs, and staging files are excluded from system backup.
- Sensitive data receives an explicit iOS file-protection class; the project does not rely on unspecified defaults.
- Locked-screen recording uses a separate active-recording spool from the sealed private library so protection can match background access needs.
- The app explains that uninstall/reinstall or device loss is unrecoverable without an explicit encrypted backup retained by the user.

## 2. Storage/protection matrix

| Data | Planned location | iOS file protection | System backup | Rationale |
| --- | --- | --- | --- | --- |
| Active recording spool, WAL/SHM, checkpoint | `Library/Application Support/Tracking/Active` | `completeUntilFirstUserAuthentication` | Excluded | Allows background reopen after first device unlock while recording; unavailable before first unlock after reboot |
| Sealed private SQLite database and WAL/SHM | `Library/Application Support/UserData` | `complete` | Excluded | Strong protection; opened only while foreground/unlocked except controlled handoff from active spool |
| Private attachments/photos managed by app | `Library/Application Support/UserData/Attachments` | `complete` | Excluded | Sensitive user-created content |
| Explicit encrypted backup being created | Task-specific temporary directory | `complete` | Excluded | Foreground-only; deleted after success/failure |
| Public reference catalog/basemap | `Library/Application Support/Catalogs/Public` | `completeUntilFirstUserAuthentication` | Excluded | Regenerable and usable after first unlock |
| Private reference catalog | `Library/Application Support/Catalogs/Private` | `completeUntilFirstUserAuthentication` | Excluded | Permission-limited; not copied to implicit backups |
| Import staging and export previews | Task-specific temporary directory | `complete` | Excluded | Untrusted/sensitive transient data |
| Diagnostics | `Library/Caches/Diagnostics` | `complete` | Excluded | Private operational data; foreground review/export |
| Non-sensitive disposable caches | `Library/Caches` | Appropriate explicit class | Excluded | Regenerable |

The implementation applies protection and backup-exclusion attributes to SQLite main, WAL, SHM, attachments, directories, copied/replaced files, and newly activated catalogs. Common file replacement operations can reset resource attributes, so attributes are verified after each write/copy/rename/activation.

## 3. Active recording handoff

1. Start creates/opens a dedicated active spool while the device is unlocked.
2. Native tracker appends bounded, sequenced batches and durable checkpoints.
3. Screen lock does not require opening the sealed private library.
4. On finish/recovery with protected data available, the app validates and transactionally imports the spool into the sealed private database.
5. The sealed result is verified before the spool is securely logically deleted.
6. If the device reboots, recording/recovery cannot resume before first unlock; the UI discloses this platform limitation.

## 4. Keychain policy

- Backup/recovery secrets must not exist solely in Keychain; the user retains the passphrase/recovery key independently.
- Convenience key material for foreground backup operations uses a `ThisDeviceOnly` accessibility class appropriate to unlocked access.
- No keychain item synchronizes through iCloud unless a future explicitly approved feature changes this policy.
- Signing credentials do not enter the application or public CI.

Exact Keychain accessibility constants and cryptographic library are decided by ADR-022 and validated on the pinned iOS version.

## 5. System and explicit backup behavior

- `isExcludedFromBackupKey` is set and verified for all application-managed data listed as excluded.
- The app's Settings/Privacy screen states that ordinary device backup is not the supported recovery mechanism for Open Outdoor data.
- Explicit backup creates the authenticated encrypted container defined in the project scope and lets the user choose its destination.
- Once exported, the file is governed by the destination provider/device and the user's actions; the app warns that copying it to cloud/email exposes ciphertext and requires protecting the recovery secret separately.
- Reference catalogs are identified by version and reinstalled rather than included in explicit private backups.

## 6. Permissions and privacy notice

Before requesting system permissions, the app explains:

- when and why precise/background location is needed;
- that tracking occurs only during an active recording;
- which motion/barometer data is retained and which raw motion data is not;
- how photos/imports are copied and stored;
- how long data remains until user deletion;
- system-backup exclusion and explicit-backup consequences; and
- how to export or delete individual/all private data.

Permission denial preserves non-dependent offline browsing and provides a settings/retry path without coercion.

## 7. Deletion semantics

- Delete removes primary rows, derived rows, associations, attachments, thumbnails, export history content, active spools, and eligible diagnostics in one auditable operation.
- SQLite deletion includes checkpointing/compaction policy to prevent ordinary application access to deleted rows; the app does not promise forensic secure erasure from flash storage or copies already exported.
- Explicit backups are independent files and are not deleted by deleting app data; the UI states this clearly.
- `Delete all private data` requires deliberate confirmation, closes active recording, rotates/destroys app-held convenience keys, and verifies record/file counts afterward.

## 8. Acceptance tests

- File protection attributes are asserted on every protected file type after creation, WAL generation, copy, replacement, migration, and activation.
- Active recording continues through screen lock after first unlock and imports to sealed storage after unlock.
- Pre-first-unlock behavior after reboot is safe and explicit.
- Device backup inspection confirms excluded content is absent.
- Uninstall/reinstall without explicit backup loses data with a prior warning; explicit encrypted restore succeeds.
- Wrong key, tamper, low space, interruption, and unsupported version do not mutate existing data.
- Permission and deletion flows pass native accessibility and privacy-copy review.

## 9. Platform references

- [Apple: Encrypting Your App's Files](https://developer.apple.com/documentation/uikit/encrypting-your-app-s-files)
- [Apple: `isExcludedFromBackupKey`](https://developer.apple.com/documentation/foundation/urlresourcekey/isexcludedfrombackupkey)
- [Apple: Using the File System Effectively](https://developer.apple.com/documentation/foundation/using-the-file-system-effectively)
