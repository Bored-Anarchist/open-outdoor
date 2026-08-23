# Threat Model

**Status:** Accepted initial model  
**Method:** Asset/trust-boundary review with STRIDE-style threat categories and privacy misuse cases

## 1. Security and privacy objectives

- Private user/source data never reaches public systems without explicit reviewed transformation.
- Catalogs and releases are authentic, intact, rights-eligible, and compatible.
- Malicious source/import/extension content cannot escape its processing boundary or corrupt known-good/private data.
- Background recording is durable and stops when requested.
- Backups preserve confidentiality/integrity and never partially restore.
- The app minimizes sensitive collection and communicates remaining platform risks honestly.

## 2. Protected assets

- Exact tracks, home/start/end locations, favorites, notes, photos, visits, and private corrections.
- Permission-limited source records/media and permission evidence.
- Credentials, signing keys, recovery secrets, cookies, and tokens.
- App/private database integrity and recording continuity.
- Catalog/source provenance, rights, freshness, and camping-status correctness.
- Release source, build configuration, signatures, and provenance.
- Maintainer/reporter identities and private incident evidence.

## 3. Trust boundaries

- Public GitHub/CI versus private roots/repositories/CI.
- Network/source/import payload versus isolated acquisition/parser.
- Connector/extension code versus build host and credentials.
- Read-only catalog versus writable private user database.
- Native tracker/spool versus React Native UI/private library.
- App container versus exported encrypted backup/share file.
- Protected source commit versus release/signing service.

## 4. Threat register

| ID | Threat | Impact | Required controls | Verification |
| --- | --- | --- | --- | --- |
| `THR-001` | Private file/route/secret committed or uploaded publicly | Irreversible privacy/credential exposure | Classification, content/path scans, safe fixtures, incident response | T-SEC-002 |
| `THR-002` | Malicious archive/GIS/media escapes extraction/parser | Host compromise, data corruption | Traversal/bomb/entity/resource limits, isolated temp/staging, least privilege | T-SEC-001 |
| `THR-003` | Compromised connector/private extension executes arbitrary build-host actions | Secret/data theft | Explicit allowlist/hash pin, least privilege, no arbitrary hooks, isolated process/container | T-SEC-001, T-SEC-003 |
| `THR-004` | Untrusted PR code runs with secrets/private runner access | Supply-chain/private-data compromise | No privileged head execution; ephemeral isolated runners; least token permissions | T-SEC-003 |
| `THR-005` | Catalog is modified, replayed, downgraded, or signed by wrong channel | Incorrect/safety-harmful data | Signature, channel/region/version binding, expiry, anti-downgrade policy | T-INT-002, T-INT-006, T-REL-003 |
| `THR-006` | Catalog activation/migration writes or deletes private records | Permanent user-data loss | Separate files, transactional remaps, interruption matrix, counts/hashes | T-INT-001, T-INT-002 |
| `THR-007` | Lost/stolen phone exposes tracks or backups | Personal safety/privacy harm | Explicit file protection, system-backup exclusion, encrypted export, permission/deletion UX | T-PHY-005, T-BAK-001 |
| `THR-008` | Backup key guessing/tamper/partial restore | Disclosure or corruption | Memory-hard KDF, authenticated encryption, staging validation, rate/user controls | T-BAK-001 |
| `THR-009` | Persistent diagnostics reveal locations/secrets | Privacy exposure | Local-only default, field allowlist, redaction, bounded retention, reviewed export | T-DIA-001, T-SEC-002 |
| `THR-010` | Poisoned/stale/conflicting source produces false positive camping status | Legal/safety harm | Authority/scope/freshness evaluator, provenance, conflict-to-unknown, release block | T-UNIT-001 |
| `THR-011` | False entity merge combines distinct sites/restrictions | Misleading location/safety state | Precision-first thresholds, source/type calibration, reversible audit/review | T-UNIT-003 |
| `THR-012` | Background recorder continues after stop or loses unreported samples | Privacy/battery/data-integrity harm | Native state machine, durable sequence/checkpoints, visible state, active-session-only sensors | T-PHY-001, configuration/source review |
| `THR-013` | Source revocation/retention deadline cannot be enforced in Git/cache/backups | Contract/license violation | No deadline-bound data in Git, classified inventories, purge/expiry jobs | T-UNIT-004, T-SEC-002, T-SEC-003 |
| `THR-014` | Dependency/action/toolchain compromise alters release | Supply-chain compromise | Immutable pins, SBOM, provenance, clean reproduction, signature | T-REL-001, T-REL-002 |
| `THR-015` | Sensitive export is shared without trimming/awareness | Location privacy harm | Explicit selection, endpoint/EXIF preview, confirmation, encrypted backup distinction | T-INT-004 |
| `THR-016` | Public contribution metadata or evidence exposes contributor identity details | Durable privacy exposure through Git/forks/caches | Public handle/noreply identity, account-bound attestation, PII scanning, private incident path | T-REL-004, T-SEC-002 |

## 5. Private extension execution policy

- Extensions are trusted code only after explicit registration, compatible-version check, content hash/lock, and operator approval.
- Extension discovery never runs in public CI or ordinary public commands.
- Extensions receive only declared source secrets/paths, not the whole environment.
- Arbitrary pre/post shell hooks are prohibited by default.
- Parser/acquisition work runs with bounded filesystem/network/process access where the selected Windows runtime permits it.

## 6. CI runner policy

- Public untrusted PRs use GitHub-hosted or equivalently isolated runners with read-only minimum token and no private secrets.
- Private-data jobs use ephemeral single-job runners or a documented local equivalent that wipes workspaces/caches after completion.
- `pull_request_target` never checks out and executes untrusted head code with elevated permissions.
- Public and private cache namespaces, artifacts, logs, and credentials are separated.

## 7. Residual risks

- A compromised unlocked device/process may access active data.
- Flash storage and user-copied backups prevent guaranteed forensic erasure.
- Incorrect authoritative source content can remain wrong despite provenance; the app cannot guarantee legality/safety.
- Free provisioning can make the app unavailable until refreshed.
- User-held recovery-secret loss makes an encrypted backup unrecoverable.

The UI and release notes disclose material residual risks rather than weakening controls silently.

## 8. Review triggers

Review this model for any new platform, hosted service, sensor, account/sync feature, source acquisition mode, extension execution capability, signing model, backup format, public distribution channel, or significant incident.
