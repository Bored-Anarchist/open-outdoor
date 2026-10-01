# Security and code quality audit — 2026-09-30

Audited baseline: `d2b94541b6680060549a77398b08e7ba9ede68e6` (main before this change). All evidence links below point to that immutable revision; their line numbers describe the vulnerable code, not the subsequently repaired code.

Result: **0 confirmed P0, 17 P1, 3 P2**, including eight dependency-remediation groups from the subsequently authorized npm check. This PR implements all twenty fixes. P0 means a confirmed critical compromise requiring immediate action; P1 means a significant security boundary failure, privacy failure, recovery bug, or resource-exhaustion path; P2 means a smaller correctness/error-handling defect. Library-only paths are identified explicitly and are not presented as remotely reachable vulnerabilities in the shipping iOS app.

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

Evidence: [packages/data/src/ingestion.ts:217](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/packages/data/src/ingestion.ts#L217), [packages/data/src/ingestion.ts:222](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/packages/data/src/ingestion.ts#L222), [tools/lib/private-root-lib.mjs:38](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/tools/lib/private-root-lib.mjs#L38), [tools/lib/private-root-lib.mjs:49](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/tools/lib/private-root-lib.mjs#L49).

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

Evidence: [tools/acquisition/convert-private-agency-shapefiles.py:104](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/tools/acquisition/convert-private-agency-shapefiles.py#L104), [tools/acquisition/convert-private-agency-shapefiles.py:107](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/tools/acquisition/convert-private-agency-shapefiles.py#L107), [tools/acquisition/convert-public-agency-geodatabase.py:22](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/tools/acquisition/convert-public-agency-geodatabase.py#L22), [tools/acquisition/convert-public-agency-geodatabase.py:27](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/tools/acquisition/convert-public-agency-geodatabase.py#L27).

The private converter reads four fully expanded members into memory without inspecting entry sizes/ratios. The public converter hands the archive to the native GIS reader after checking only directory/layer counts. A source checksum authenticates downloaded compressed bytes; it does not bound their expansion. Malicious or unexpectedly large source ZIPs can exhaust the local conversion process. No filesystem extraction exploit is claimed here.

Implemented fix: call the shared `tools/lib/archive_security.py::inspect_zip` before member reads or native GIS access. Default limits: 10,000 entries, 512 MiB per member, 1 GiB total expanded size, compression ratio 1,000, and sixteen path components. Reject path aliases/traversal, case-colliding entries, and link members as well. Sources exceeding these limits require an explicit reviewed processing-budget change.

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

## Dependency advisory findings after authorized npm verification

The owner authorized sending the package-name/version inventory to npm on 2026-09-30. pnpm 11.20.0's bulk advisory endpoint returned **39 advisory entries (28 high, 11 moderate, zero critical)** against the baseline lockfile: 580 unique package/version pairs. Entries can repeat a GHSA for distinct packages or version ranges. This is confirmed vulnerable-version inventory evidence, not proof that each upstream exploit is reachable in this application's runtime. The table retains npm's severity separately from the repository's P0/P1/P2 priority.

The seven P1 items below are dependency remediation work; UUID is P2 because the observed xcode caller uses `v4()` without an external buffer, while its advisory concerns `v3()`/`v5()`/`v6()` buffer bounds. Owner: repository maintainer. Mitigation: the changes in this PR; due: before merge/next release. Uncertain exploit reachability is explicitly recorded below.

| Finding | Priority | Locked evidence | Context and specific implemented fix |
| --- | --- | --- | --- |
| AUD-013 — `vite` | P1 | [pnpm-lock.yaml:2569](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/pnpm-lock.yaml#L2569) | Developer-server file-read/deny-list bypass and Windows credential-disclosure advisories. A running affected development server is a prerequisite; no production static-build exploit is demonstrated. Pin root and browser-fixture Vite to **8.0.16**. |
| AUD-014 — `vitest` | P1 | [pnpm-lock.yaml:2612](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/pnpm-lock.yaml#L2612) | Test/browser mock-server path traversal. The current suite uses the Node environment and does not establish browser-server exploit reachability. Pin Vitest to **4.1.11**, which also updates `@vitest/mocker`. |
| AUD-015 — `@xmldom/xmldom` | P1 | [pnpm-lock.yaml:1061](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/pnpm-lock.yaml#L1061), [pnpm-lock.yaml:1066](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/pnpm-lock.yaml#L1066) | Expo build-tool plist/XML dependencies contain parser exhaustion and XML-construction/serialization defects. Attacker-controlled DOM names/XML and the relevant parser or serializer path are prerequisites; no iOS-runtime XML exploit is demonstrated. Override within each existing version line to **0.8.15 / 0.9.12**. |
| AUD-016 — `fast-uri` | P1 | [pnpm-lock.yaml:1558](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/pnpm-lock.yaml#L1558) | AJV and transitive tooling use affected URI normalization. Host confusion/SSRF requires a consumer making network/security decisions from attacker-controlled URI results; such a network sink is not demonstrated here. Override the 3.x dependency to **3.1.8**. |
| AUD-017 — `js-yaml` | P1 | [pnpm-lock.yaml:1738](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/pnpm-lock.yaml#L1738) | Expo tooling includes the YAML merge-budget CPU exhaustion defect. Untrusted crafted YAML is a prerequisite; this inventory result does not establish such an input in the app. Override the 4.x dependency to **4.3.2**. |
| AUD-018 — `image-size` | P1 | [pnpm-lock.yaml:1681](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/pnpm-lock.yaml#L1681) | Metro asset parsing includes JXL/HEIF/ICNS infinite-loop advisories. Crafted image bytes processed by the affected parsers are a prerequisite; normal Metro extension filtering reduces exposure but does not prove all call sites safe. Upgrade **Metro 0.84.4 to 0.84.6**, whose upstream image parser removes this dependency. Do not override image-size to v2 beneath the old callable/path-based Metro API. |
| AUD-019 — `brace-expansion` | P1 | [pnpm-lock.yaml:1219](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/pnpm-lock.yaml#L1219) | Expo glob/minimatch tooling includes CPU and stack-exhaustion defects. Attacker-controlled brace patterns are a prerequisite and are not shown reachable through the shipping app. Override the existing 5.x line to **5.0.12**. |
| AUD-020 — `uuid` | P2 | [pnpm-lock.yaml:2556](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/pnpm-lock.yaml#L2556) | xcode build tooling contains the UUID output-buffer bounds defect. Its inspected caller uses `uuid.v4()` to generate project identifiers, outside the reported affected APIs. Scope the override to **xcode@3.0.1 > uuid@11.1.1**, retaining CommonJS compatibility and verifying the real project-identifier call. |

Minimal remediation is the exact Vite/Vitest pin changes in both package manifests plus the seven scoped `overrides` in `pnpm-workspace.yaml`; `pnpm install --ignore-scripts` regenerates the committed lockfile. Existing strict peer checks, integrity checks, Node pin and 24-hour minimum-release-age policy remain enforced. No blanket advisory ignore, lifecycle-script enablement, or npm `--force` upgrade is used. Metro 0.84.6's [upstream asset code](https://github.com/react/metro/blob/v0.84.6/packages/metro/src/Assets.js) and [package metadata](https://github.com/react/metro/blob/v0.84.6/packages/metro/package.json) confirm its replacement of image-size. The UUID [upstream advisory](https://github.com/uuidjs/uuid/security/advisories/GHSA-w5hq-g745-h8pq) identifies the affected buffer-taking APIs. The npm response omitted a patched range for GHSA-jxjr-3g7g-3944; the [maintainer advisory](https://github.com/xmldom/xmldom/security/advisories/GHSA-jxjr-3g7g-3944) explicitly identifies 0.9.12 as patched.

### Advisory-level evidence

Each row records the exact locked package/version and upstream advisory returned by npm. Repeated GHSA rows represent distinct package/version-range matches, not independently demonstrated application exploits.

| Package/version | npm severity | Baseline file citation | Upstream advisory and defect |
| --- | --- | --- | --- |
| `vite@8.0.0` | moderate | [pnpm-lock.yaml:2569](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/pnpm-lock.yaml#L2569) | [GHSA-4w7w-66w2-5vf9](https://github.com/advisories/GHSA-4w7w-66w2-5vf9) — Vite Vulnerable to Path Traversal in Optimized Deps `.map` Handling |
| `vite@8.0.0` | high | [pnpm-lock.yaml:2569](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/pnpm-lock.yaml#L2569) | [GHSA-v2wj-q39q-566r](https://github.com/advisories/GHSA-v2wj-q39q-566r) — Vite: `server.fs.deny` bypassed with queries |
| `vite@8.0.0` | high | [pnpm-lock.yaml:2569](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/pnpm-lock.yaml#L2569) | [GHSA-p9ff-h696-f583](https://github.com/advisories/GHSA-p9ff-h696-f583) — Vite Vulnerable to Arbitrary File Read via Vite Dev Server WebSocket |
| `uuid@7.0.3` | moderate | [pnpm-lock.yaml:2556](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/pnpm-lock.yaml#L2556) | [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) — uuid: Missing buffer bounds check in v3/v5/v6 when buf is provided |
| `vite@8.0.0` | moderate | [pnpm-lock.yaml:2569](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/pnpm-lock.yaml#L2569) | [GHSA-v6wh-96g9-6wx3](https://github.com/advisories/GHSA-v6wh-96g9-6wx3) — launch-editor: NTLMv2 hash disclosure via UNC path handling on Windows |
| `vite@8.0.0` | high | [pnpm-lock.yaml:2569](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/pnpm-lock.yaml#L2569) | [GHSA-fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff) — vite: `server.fs.deny` bypass on Windows alternate paths |
| `@xmldom/xmldom@0.9.11` | moderate | [pnpm-lock.yaml:1066](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/pnpm-lock.yaml#L1066) | [GHSA-6gmq-8vp8-gcm6](https://github.com/advisories/GHSA-6gmq-8vp8-gcm6) — xmldom: XML fragment injection via invalid EntityReference.nodeName during requireWellFormed serialization |
| `@xmldom/xmldom@0.8.14` | moderate | [pnpm-lock.yaml:1061](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/pnpm-lock.yaml#L1061) | [GHSA-6gmq-8vp8-gcm6](https://github.com/advisories/GHSA-6gmq-8vp8-gcm6) — xmldom: XML fragment injection via invalid EntityReference.nodeName during requireWellFormed serialization |
| `fast-uri@3.1.5` | high | [pnpm-lock.yaml:1558](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/pnpm-lock.yaml#L1558) | [GHSA-5jgf-p345-68v8](https://github.com/advisories/GHSA-5jgf-p345-68v8) — fast-uri vulnerable to host confusion via skipped IDN canonicalization on scheme-relative references |
| `fast-uri@3.1.5` | high | [pnpm-lock.yaml:1558](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/pnpm-lock.yaml#L1558) | [GHSA-f65p-4m7j-42xc](https://github.com/advisories/GHSA-f65p-4m7j-42xc) — fast-uri vulnerable to server-side request forgery via malformed IPv6 normalization |
| `fast-uri@3.1.5` | high | [pnpm-lock.yaml:1558](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/pnpm-lock.yaml#L1558) | [GHSA-fph4-wmhf-6fwf](https://github.com/advisories/GHSA-fph4-wmhf-6fwf) — fast-uri vulnerable to server-side request forgery via repeated hostname percent-decoding |
| `fast-uri@3.1.5` | high | [pnpm-lock.yaml:1558](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/pnpm-lock.yaml#L1558) | [GHSA-jqff-g426-hqxp](https://github.com/advisories/GHSA-jqff-g426-hqxp) — fast-uri vulnerable to host confusion via percent-encoded scheme normalization |
| `@xmldom/xmldom@0.9.11` | high | [pnpm-lock.yaml:1066](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/pnpm-lock.yaml#L1066) | [GHSA-6mj3-qw4j-hgrw](https://github.com/advisories/GHSA-6mj3-qw4j-hgrw) — xmldom: HTML raw-text closing-tag case mismatch causes output amplification |
| `vitest@4.1.0` | moderate | [pnpm-lock.yaml:2612](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/pnpm-lock.yaml#L2612) | [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9) — Vitest: Path Traversal / Arbitrary File Read via @vitest/mocker Redirect Mock |
| `@vitest/mocker@4.1.0` | moderate | [pnpm-lock.yaml:1035](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/pnpm-lock.yaml#L1035) | [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9) — Vitest: Path Traversal / Arbitrary File Read via @vitest/mocker Redirect Mock |
| `@xmldom/xmldom@0.9.11` | high | [pnpm-lock.yaml:1066](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/pnpm-lock.yaml#L1066) | [GHSA-c7q8-3ch8-vqpv](https://github.com/advisories/GHSA-c7q8-3ch8-vqpv) — xmldom: Processing Instruction Target Injection Bypasses requireWellFormed |
| `@xmldom/xmldom@0.8.14` | high | [pnpm-lock.yaml:1061](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/pnpm-lock.yaml#L1061) | [GHSA-c7q8-3ch8-vqpv](https://github.com/advisories/GHSA-c7q8-3ch8-vqpv) — xmldom: Processing Instruction Target Injection Bypasses requireWellFormed |
| `@xmldom/xmldom@0.9.11` | high | [pnpm-lock.yaml:1066](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/pnpm-lock.yaml#L1066) | [GHSA-jxjr-3g7g-3944](https://github.com/advisories/GHSA-jxjr-3g7g-3944) — xmldom: requireWellFormed element/attribute name validation is bypassable via an embedded line terminator |
| `@xmldom/xmldom@0.9.11` | high | [pnpm-lock.yaml:1066](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/pnpm-lock.yaml#L1066) | [GHSA-27p8-2357-5qqv](https://github.com/advisories/GHSA-27p8-2357-5qqv) — xmldom: DocType `name` Injection Bypasses requireWellFormed |
| `@xmldom/xmldom@0.8.14` | high | [pnpm-lock.yaml:1061](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/pnpm-lock.yaml#L1061) | [GHSA-27p8-2357-5qqv](https://github.com/advisories/GHSA-27p8-2357-5qqv) — xmldom: DocType `name` Injection Bypasses requireWellFormed |
| `@xmldom/xmldom@0.9.11` | high | [pnpm-lock.yaml:1066](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/pnpm-lock.yaml#L1066) | [GHSA-3px3-54cx-rmw9](https://github.com/advisories/GHSA-3px3-54cx-rmw9) — xmldom: Creation-time XML Name/QName validation is bypassable via an embedded line terminator, allowing injection on the default serialization path |
| `@xmldom/xmldom@0.9.11` | high | [pnpm-lock.yaml:1066](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/pnpm-lock.yaml#L1066) | [GHSA-vr34-hp96-76pp](https://github.com/advisories/GHSA-vr34-hp96-76pp) — xmldom: requireWellFormed DocType publicId/systemId validation is bypassable via an embedded line terminator |
| `@xmldom/xmldom@0.9.11` | moderate | [pnpm-lock.yaml:1066](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/pnpm-lock.yaml#L1066) | [GHSA-6h8r-xr42-gp59](https://github.com/advisories/GHSA-6h8r-xr42-gp59) — xmldom: Parser silently accepts a not-well-formed end tag whose name is followed by a line break and trailing content |
| `@xmldom/xmldom@0.8.14` | moderate | [pnpm-lock.yaml:1061](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/pnpm-lock.yaml#L1061) | [GHSA-6h8r-xr42-gp59](https://github.com/advisories/GHSA-6h8r-xr42-gp59) — xmldom: Parser silently accepts a not-well-formed end tag whose name is followed by a line break and trailing content |
| `@xmldom/xmldom@0.9.11` | high | [pnpm-lock.yaml:1066](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/pnpm-lock.yaml#L1066) | [GHSA-8344-3jmq-59r6](https://github.com/advisories/GHSA-8344-3jmq-59r6) — xmldom: Quadratic-time attribute deduplication |
| `@xmldom/xmldom@0.8.14` | high | [pnpm-lock.yaml:1061](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/pnpm-lock.yaml#L1061) | [GHSA-8344-3jmq-59r6](https://github.com/advisories/GHSA-8344-3jmq-59r6) — xmldom: Quadratic-time attribute deduplication |
| `@xmldom/xmldom@0.8.14` | high | [pnpm-lock.yaml:1061](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/pnpm-lock.yaml#L1061) | [GHSA-x4fp-j954-r2f4](https://github.com/advisories/GHSA-x4fp-j954-r2f4) — xmldom: End-tag Whitespace-Trim Regex ReDoS — quadratic backtracking in the 0.8.x end-tag parser |
| `@xmldom/xmldom@0.9.11` | high | [pnpm-lock.yaml:1066](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/pnpm-lock.yaml#L1066) | [GHSA-965w-775f-mr7g](https://github.com/advisories/GHSA-965w-775f-mr7g) — xmldom: Quadratic-memory consumption |
| `@xmldom/xmldom@0.8.14` | high | [pnpm-lock.yaml:1061](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/pnpm-lock.yaml#L1061) | [GHSA-965w-775f-mr7g](https://github.com/advisories/GHSA-965w-775f-mr7g) — xmldom: Quadratic-memory consumption |
| `@xmldom/xmldom@0.9.11` | high | [pnpm-lock.yaml:1066](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/pnpm-lock.yaml#L1066) | [GHSA-93r5-fhx6-vmg9](https://github.com/advisories/GHSA-93r5-fhx6-vmg9) — xmldom: Quadratic-time parsing via the malformed-input recovery path — `parseElementStartPart` re-scan and `normalize()` adjacent-text merge |
| `@xmldom/xmldom@0.8.14` | high | [pnpm-lock.yaml:1061](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/pnpm-lock.yaml#L1061) | [GHSA-93r5-fhx6-vmg9](https://github.com/advisories/GHSA-93r5-fhx6-vmg9) — xmldom: Quadratic-time parsing via the malformed-input recovery path — `parseElementStartPart` re-scan and `normalize()` adjacent-text merge |
| `js-yaml@4.3.1` | high | [pnpm-lock.yaml:1738](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/pnpm-lock.yaml#L1738) | [GHSA-2883-xcg3-v3hh](https://github.com/advisories/GHSA-2883-xcg3-v3hh) — js-yaml: maxTotalMergeKeys does not limit CPU use for empty merge sources |
| `image-size@1.2.1` | high | [pnpm-lock.yaml:1681](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/pnpm-lock.yaml#L1681) | [GHSA-5p2g-fcmc-qvqq](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq) — image-size: JXL and HEIF parsers allow denial of service through infinite loops |
| `image-size@1.2.1` | high | [pnpm-lock.yaml:1681](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/pnpm-lock.yaml#L1681) | [GHSA-w3rx-r6r6-pgpr](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr) — image-size: ICNS parser allows denial of service through an infinite loop |
| `fast-uri@3.1.5` | high | [pnpm-lock.yaml:1558](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/pnpm-lock.yaml#L1558) | [GHSA-qw65-cvwx-89v3](https://github.com/advisories/GHSA-qw65-cvwx-89v3) — fast-uri vulnerable to authority injection via an unvalidated port in serialize |
| `fast-uri@3.1.5` | moderate | [pnpm-lock.yaml:1558](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/pnpm-lock.yaml#L1558) | [GHSA-hrr3-gc8f-f4qj](https://github.com/advisories/GHSA-hrr3-gc8f-f4qj) — fast-uri vulnerable to inconsistent host case normalization via percent-encoded octets |
| `brace-expansion@5.0.9` | moderate | [pnpm-lock.yaml:1219](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/pnpm-lock.yaml#L1219) | [GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr) — brace-expansion: Quadratic-time expansion of the `{a},b}` rewrite causes CPU denial of service |
| `brace-expansion@5.0.9` | high | [pnpm-lock.yaml:1219](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/pnpm-lock.yaml#L1219) | [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7) — brace-expansion: DoS via uncontrolled recursion on nested brace groups causing stack exhaustion |
| `brace-expansion@5.0.9` | high | [pnpm-lock.yaml:1219](https://github.com/Bored-Anarchist/open-outdoor/blob/d2b94541b6680060549a77398b08e7ba9ede68e6/pnpm-lock.yaml#L1219) | [GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p) — brace-expansion: DoS via uncontrolled recursion in parseCommaParts causing stack exhaustion |

Verification: a second authorized `pnpm audit --json` exits zero and reports **zero advisories in all severity categories**, covering 591 unique package/version pairs after resolution. This is the npm database result at audit time, not a guarantee against unknown vulnerabilities or coverage of Python/native ecosystems. No affected image-size, UUID 7, or superseded versions listed above remain in the committed lockfile. Three committed compatibility tests exercise Metro buffer dimensions, real on-disk asset density scaling, and xcode's real UUID call through Expo's dependency resolution. Web production build and public iOS JavaScript export are checked separately; JavaScript export does not establish native/device correctness.

## Validation and limitations

- `pnpm quality`: storage policy, workspace types, formatting, release/workflow/native contract checks, Vitest, and Node release-tool tests.
- Final full run: 480 Vitest tests, 153 Node release-tool tests, and three dependency-compatibility tests passed. The public-boundary privacy suite and `git diff --check` also passed.
- Python 3.13.14 in the repository virtual environment: ten tests passed, including five ZIP-security tests.
- The original-source adversarial run is deliberately failing evidence, not a remaining fixed-branch failure.
- Credentials/history scan was local. No recognized credential match was found; unknown formats, embedded binary content, ignored files, and unreachable Git objects remain outside that claim.
- After explicit owner authorization, npm advisory verification completed: 39 original advisory entries, zero after remediation. The preceding failed/blocked request was not bypassed; the owner subsequently approved the metadata transfer. Coverage is limited to npm package advisories at query time.
- Windows cannot compile/run UIKit/CoreLocation/CryptoKit device integrations. Existing source-contract checks and synthetic JS/Node tests passed; native compile, physical-device sensor behavior, and real large GIS conversions still need their respective environments.
- Local link checks do not replace process isolation against concurrent privileged filesystem mutation. Connector timeouts are cooperative cancellation; trusted extension execution still requires its documented isolation policy.

## Review/traceability

Relevant existing work: WP-105 recorder, WP-106 import/export, WP-107/WP-306 backup, WP-202 ingestion, WP-303 catalog activation, and WP-502/WP-503 runtime hardening. Relevant threat register entries: THR-001/002/005/008/009/012/015. New tests and this report are corrective evidence, not physical-device release acceptance or an independent release approval.

All new source and evidence is project-authored/AI-assisted code and synthetic fixtures submitted under the repository's Apache-2.0 contribution terms. Dependency pins and transitives are updated as documented above; no new production signing key, third-party data payload, or public-data rights grant is introduced.
