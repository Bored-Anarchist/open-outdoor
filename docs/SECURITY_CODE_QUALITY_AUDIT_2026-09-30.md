# Security and code quality audit — 2026-09-30

Audited baseline: `d2b94541b6680060549a77398b08e7ba9ede68e6` (main before this change). All evidence links below point to that immutable revision; their line numbers describe the vulnerable code, not the subsequently repaired code.

Result: **0 confirmed P0, 10 P1, 2 P2**. This PR implements all twelve fixes. P0 means a confirmed critical compromise requiring immediate action; P1 means a significant security boundary failure, privacy failure, recovery bug, or resource-exhaustion path; P2 means a smaller correctness/error-handling defect. Library-only paths are identified explicitly and are not presented as remotely reachable vulnerabilities in the shipping iOS app.

## Scope and method

- Inventoried 684 tracked files, including 131 TypeScript files, 104 JavaScript modules, 15 Swift files, 12 Python files, eight PowerShell scripts, and workflow/configuration files.
- Searched source for dynamic execution, shell subprocesses, SQL construction, HTML sinks, network requests, archive readers, exception suppression, credential patterns, and persistence/activation boundaries.
- Manually traced laptop HTTP pairing, native download/redirect handling, independently enrolled signing keys, replay floors, SQLite package activation, selected-file imports, encrypted backup creation/restore, raw artifact acquisition, private extension/root confinement, recorder persistence, diagnostics, and CI permissions.
- Scanned 1,543 reachable text blobs across 16 commits for private-key blocks, AWS access-key identifiers, GitHub token formats, and OpenAI key formats. No matches. Nine binary blobs were excluded; this is a format-based scan, not proof that every possible secret representation is absent. Ignored private datasets and ambient account credentials were outside scope.
- Started from 459 passing Vitest tests. New security/failure regressions produced 16 failures against the original source in six targeted files. Fixed-source targeted tests subsequently passed. Additional backup and ZIP tests exercise the later findings.
- Tests use synthetic payloads, generated test signing keys, temporary isolated directories, failure injection, and real Ed25519 verification; no real route, signing key, or private dataset is published.

## P0

No confirmed critical exploit or committed credential was identified in the reviewed scope. This statement is bounded by the limitations below.

## P1 findings and implemented remediation

### AUD-001 — Catalog activation does not bind the database to its signed manifest

Evidence: [packages/storage/src/catalog-activation.ts:27](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/packages/storage/src/catalog-activation.ts#L27), [packages/storage/src/catalog-activation.ts:219](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/packages/storage/src/catalog-activation.ts#L219), [packages/storage/src/catalog-activation.ts:231](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/packages/storage/src/catalog-activation.ts#L231).

The checksum check compares staged bytes with `candidate.catalogChecksum`, which the candidate supplies. The verifier sees only manifest/envelope bytes and returns version/channel; the coordinator never compares the signed manifest's database checksum with staged bytes. A caller can substitute a database and its checksum while retaining an authentic manifest/signature. The regression demonstrates this with a real Ed25519 signature. This is the shared catalog coordinator; the native laptop/state installer has separate signed/build-pinned checks and is not shown bypassable by this test.

Implemented fix: require `CatalogTrustVerifier.verify` to return the checksum extracted from the authenticated manifest, and reject any mismatch before switching the active pointer.

```diff
 const trust = this.trust.verify(candidate, this.repository.lastAcceptedVersion());
 if (
   trust.contentVersion !== candidate.contentVersion ||
+  trust.catalogChecksum !== stagedChecksum ||
   trust.channel !== candidate.channel ||
   trust.channel !== environment.expectedChannel
 ) { /* reject */ }
```

Validation: the authentic original database activates; substituted bytes with a self-consistent caller checksum fail without changing the active catalog or accepted version.

### AUD-002 — JPEG sanitization preserves metadata after the first scan

Evidence: [packages/import-export/src/index.ts:348](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/packages/import-export/src/index.ts#L348), [packages/import-export/src/index.ts:360](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/packages/import-export/src/index.ts#L360), [packages/import-export/src/index.ts:400](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/packages/import-export/src/index.ts#L400).

On the first SOS marker, the sanitizer copies the entire remaining input and returns `removedMetadata: true`. Metadata markers between scans and appended metadata after EOI therefore survive. That contradicts the API's privacy result and can preserve location-bearing metadata in exported photo bytes. This is an exported shared API, not a demonstrated automatic external upload.

Implemented fix: walk JPEG entropy data using byte-stuffing/restart rules, resume marker parsing after every scan, strip APP1/APP13/COM wherever encountered, stop at EOI and discard trailing bytes, and reject truncated scans. This preserves multiple scans without copying unexamined trailing metadata.

Validation: synthetic multi-scan JPEG with embedded APP1 markers loses those markers; escaped entropy bytes/restart markers remain intact; truncated scan fails closed.

### AUD-003 — Ordinary photos overflow the JavaScript argument limit

Evidence: [packages/import-export/src/index.ts:349](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/packages/import-export/src/index.ts#L349), [packages/import-export/src/index.ts:362](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/packages/import-export/src/index.ts#L362), [packages/import-export/src/index.ts:382](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/packages/import-export/src/index.ts#L382), [packages/import-export/src/index.ts:395](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/packages/import-export/src/index.ts#L395).

`output.push(...bytes.slice(...))` turns each image byte into a function argument. A one-MiB JPEG scan or PNG chunk throws `RangeError` on the audited runtime despite being far below the advertised 100-MiB photo limit. The number-array representation also expands memory usage.

Implemented fix: retain bounded `Uint8Array.subarray` chunks, allocate an output `Uint8Array` once, and copy using `set` with tracked offsets. No pixel buffer is spread into arguments or boxed into a number array.

Validation: one-MiB JPEG and PNG buffers sanitize and remain byte-identical when no sensitive metadata is present. Assertions compare buffers in linear time without expensive per-element test reporting.

### AUD-004 — Raw-artifact persistence can report success without provenance

Evidence: [packages/data/src/ingestion.ts:222](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/packages/data/src/ingestion.ts#L222), [packages/data/src/ingestion.ts:224](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/packages/data/src/ingestion.ts#L224), [packages/data/src/ingestion.ts:228](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/packages/data/src/ingestion.ts#L228).

One catch covers both exclusive writes. If the metadata write fails, checking that payload bytes hash correctly suppresses the failure. On retry, an already-present payload raises EEXIST before metadata is written, and the same catch reports success again. Retention/rights/source provenance may remain absent or silently conflict for identical content acquired under different metadata.

Implemented fix: handle payload and metadata independently; tolerate only EEXIST; verify existing payload integrity; retry missing metadata; propagate write/read failures; and reject conflicting source/rights/retention metadata. Rechecking unchanged content may have a newer retrieval time while its first stored receipt remains immutable. Publication is successful only after both artifacts exist and their provenance agrees. Failures may leave an immutable payload orphan, which a subsequent valid retry repairs.

Validation: retries create missing provenance; an unusable metadata destination rejects; conflicting retention provenance rejects; identical retries remain idempotent.

### AUD-005 — Lexical root checks allow filesystem links to escape processing boundaries

Evidence: [packages/data/src/ingestion.ts:217](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/packages/data/src/ingestion.ts#L217), [packages/data/src/ingestion.ts:222](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/packages/data/src/ingestion.ts#L222), [tools/private-root-lib.mjs:38](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/tools/private-root-lib.mjs#L38), [tools/private-root-lib.mjs:49](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/tools/private-root-lib.mjs#L49).

Resolving a string path and checking `relative` does not account for junctions/symlinks. A linked raw shard writes outside its selected raw root; a linked private connector is accepted outside its private root; a linked `output` writes the composed artifact outside the private root, potentially into the public checkout. Reproduction requires control of local processing directories; this is not an unauthenticated remote file-write claim. The newer private-extension verifier already checks links independently.

Implemented fix: compare canonical real paths, inspect raw shard/file types with `lstat`, and reject linked/nonregular destinations. Walk and check each private manifest/connector/output path component before access or creation. Existing root selection still uses the caller's explicitly selected canonical root.

Validation: actual Windows junctions to separate temporary directories are rejected, and no output appears in those external targets. These checks address pre-existing links; they do not provide an OS sandbox against a concurrent same-privilege filesystem adversary.

### AUD-006 — Diagnostic redaction leaks credential suffixes and free-text secrets

Evidence: [packages/privacy/src/index.ts:1](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/packages/privacy/src/index.ts#L1), [packages/privacy/src/index.ts:20](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/packages/privacy/src/index.ts#L20).

The bearer pattern omits `+`, `/`, and `=`, so credential suffixes remain in diagnostic strings. Free-text `password=...`/`api_key=...` values and fields named `credential`, `privateKey`, or `session` also survive. Preview/export consent does not repair an incorrectly redacted payload. This affects the exported diagnostics helper; no existing automatic telemetry transmission was found.

Implemented fix: redact the complete bearer token alphabet, key/value credential forms and private-key blocks; extend the sensitive field-name pattern for credentials, private keys, and sessions.

Validation: nested structured fields and free-text synthetic secrets are removed completely while ordinary event text is retained.

### AUD-007 — Failed recording start/resume leaves native GPS active

Evidence: [packages/recorder/src/index.ts:179](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/packages/recorder/src/index.ts#L179), [packages/recorder/src/index.ts:197](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/packages/recorder/src/index.ts#L197), [packages/recorder/src/index.ts:215](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/packages/recorder/src/index.ts#L215), [apps/mobile/App.tsx:390](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/apps/mobile/App.tsx#L390).

Native sensors start or resume before the durable snapshot is committed. A persistence failure rejects the operation without pausing/stopping sensors; the mobile start handler displays failure without entering its successful recording state. This creates location collection after an operation the UI reported failed, with battery and recovery consequences. A second start also reaches the native tracker before the JS state transition can reject it.

Implemented fix: guard the current session and timestamps before native start; on failed start/resume persistence, pause native sensors and the JS state; fall back to native stop if pause fails and preserve the underlying errors if both fail. Keep the spool for recovery and expose the paused startup state to the mobile UI.

Validation: injected start/resume write failures leave the fixture tracker paused; recovery/finish or retry resume succeeds; a second start does not call the native start port.

### AUD-008 — Finish can keep sensors running or become impossible to retry

Evidence: [packages/recorder/src/index.ts:330](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/packages/recorder/src/index.ts#L330), [packages/recorder/src/index.ts:342](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/packages/recorder/src/index.ts#L342), [packages/recorder/src/index.ts:353](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/packages/recorder/src/index.ts#L353), [packages/recorder/src/index.ts:382](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/packages/recorder/src/index.ts#L382).

Finish first drains/persists batches while sensors remain active. A drain failure prevents stop. Later, it changes the state machine to finished before final persistence and native finalization. If either fails, another Finish calls synchronize on a finished state and rejects. The derived revision also already exists, so blindly repeating final construction would conflict.

Implemented fix: stop sensors first; cache the sealed spool's final sequence; drain that same spool on retry without another native stop. Preserve a pending finished summary and retry its durable commit/finalization without duplicating its derived revision. Block a new start/resume/recovery while final save is pending. Clear pending acknowledgements only after completion. Preserve each sample's original paused state when draining the stopped session.

Validation: failed drain still calls stop; retry imports one copy of each sample; failed final snapshot or finalization can be retried; exactly one revision remains. The fixture tracker now reports its highest acquired sequence on stop, matching the production stop contract rather than only the highest acknowledged sequence.

### AUD-009 — GIS ZIP conversion bypasses archive expansion budgets

Evidence: [tools/convert-private-agency-shapefiles.py:104](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/tools/convert-private-agency-shapefiles.py#L104), [tools/convert-private-agency-shapefiles.py:107](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/tools/convert-private-agency-shapefiles.py#L107), [tools/convert-public-agency-geodatabase.py:22](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/tools/convert-public-agency-geodatabase.py#L22), [tools/convert-public-agency-geodatabase.py:27](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/tools/convert-public-agency-geodatabase.py#L27).

The private converter reads four fully expanded members into memory without inspecting entry sizes/ratios. The public converter hands the archive to the native GIS reader after checking only directory/layer counts. A source checksum authenticates downloaded compressed bytes; it does not bound their expansion. Malicious or unexpectedly large source ZIPs can exhaust the local conversion process. No filesystem extraction exploit is claimed here.

Implemented fix: call the shared `tools/archive_security.py::inspect_zip` before member reads or native GIS access. Default limits: 10,000 entries, 512 MiB per member, 1 GiB total expanded size, compression ratio 1,000, and sixteen path components. Reject path aliases/traversal, case-colliding entries, and link members as well. Sources exceeding these limits require an explicit reviewed processing-budget change.

Validation: stdlib ZIP tests cover a highly compressed payload, individual/aggregate/count limits, traversal/Windows aliases, case collisions, and links. Full GIS conversion was not exercised against real datasets or native GIS dependencies.

### AUD-010 — Backup creation can return a container its own restore rejects

Evidence: [packages/backup/src/index.ts:19](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/packages/backup/src/index.ts#L19), [packages/backup/src/index.ts:220](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/packages/backup/src/index.ts#L220), [packages/backup/src/index.ts:274](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/packages/backup/src/index.ts#L274), [packages/backup/src/index.ts:279](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/packages/backup/src/index.ts#L279).

Export checks attachment count and each attachment's 256-MiB ceiling, but not aggregate serialized container size. Restore rejects containers above 512 MiB. Base64 attachment strings inside encrypted JSON are base64-encoded again as ciphertext: 288 MiB of raw attachments already becomes 512 MiB before JSON/header overhead. An apparently successful export can therefore be unusable for recovery.

Implemented fix: compute the nested base64 lower bound before allocating attachment strings, then calculate exact outer-container length from serialized plaintext before encryption. Reject exports over the restore ceiling with `BackupError(INPUT_INVALID)`. An optional stricter caller limit is validated and cannot exceed the restore ceiling.

Validation: small-budget tests cover lower-bound rejection and exact JSON/header-overhead rejection; a container below the budget still decrypts/restores. The production 512-MiB boundary is verified by the same arithmetic rather than allocating a multi-hundred-MiB test artifact.

## P2 findings and implemented remediation

### AUD-011 — Malformed backup crypto fields escape the typed error contract

Evidence: [packages/backup/src/index.ts:304](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/packages/backup/src/index.ts#L304), [packages/backup/src/index.ts:315](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/packages/backup/src/index.ts#L315).

Container parsing validates ciphertext/tag types but not salt/nonce types. Missing or object-valued fields reach `Buffer.from` outside the decryption catch and raise a raw TypeError. Fix: validate both fields as strings during parsing. Regression: malformed salt and nonce each raise `BackupError` without committing restored data.

### AUD-012 — A verified backup is always considered stale when no change is recorded

Evidence: [packages/backup/src/index.ts:525](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/packages/backup/src/index.ts#L525), [packages/backup/src/index.ts:530](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/packages/backup/src/index.ts#L530).

Null `privateDataChangedAt` becomes negative infinity, then `!Number.isFinite(changedAt)` marks it stale. The sentinel says no change is recorded, so this is a false recovery warning. Fix: evaluate invalid/newer change timestamps only when the original field is nonnull. Existing missing/stale/recovery-secret checks remain intact. Regression: a verified backup with null change time and confirmed independent secret is accepted.

## Validation and limitations

- `pnpm quality`: storage policy, workspace types, formatting, release/workflow/native contract checks, Vitest, and Node release-tool tests.
- Final full run: 480 Vitest tests and 153 Node release-tool tests passed. The public-boundary privacy suite and `git diff --check` also passed.
- Python 3.13.14 in the repository virtual environment: ten tests passed, including five ZIP-security tests.
- The original-source adversarial run is deliberately failing evidence, not a remaining fixed-branch failure.
- Credentials/history scan was local. No recognized credential match was found; unknown formats, embedded binary content, ignored files, and unreachable Git objects remain outside that claim.
- Dependency advisory verification is **unverified**. The initial advisory request failed; automatic approval review then rejected retrying the npm advisory lookup because it would export dependency metadata to a public service. No workaround, lockfile update, or claim of dependency safety is included.
- Windows cannot compile/run UIKit/CoreLocation/CryptoKit device integrations. Existing source-contract checks and synthetic JS/Node tests passed; native compile, physical-device sensor behavior, and real large GIS conversions still need their respective environments.
- Local link checks do not replace process isolation against concurrent privileged filesystem mutation. Connector timeouts are cooperative cancellation; trusted extension execution still requires its documented isolation policy.

## Review/traceability

Relevant existing work: WP-105 recorder, WP-106 import/export, WP-107/WP-306 backup, WP-202 ingestion, WP-303 catalog activation, and WP-502/WP-503 runtime hardening. Relevant threat register entries: THR-001/002/005/008/009/012/015. New tests and this report are corrective evidence, not physical-device release acceptance or an independent release approval.

All new source and evidence is project-authored/AI-assisted code and synthetic fixtures submitted under the repository's Apache-2.0 contribution terms. No new runtime dependency, production signing key, third-party data payload, or public-data rights grant is introduced.
