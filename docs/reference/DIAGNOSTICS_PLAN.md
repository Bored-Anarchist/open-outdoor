# Diagnostics and Evidence Plan

**Status:** Accepted planning baseline  
**Default:** Local-only, private, bounded, and user-controlled

## 1. Goals

- Diagnose recording, storage, import, catalog, map, and build failures without collecting unnecessary personal data.
- Produce reproducible private physical/source evidence and safe public summaries.
- Prevent logs, crash data, screenshots, and artifacts from bypassing the public/private boundary.

## 2. No hosted telemetry by default

The MVP sends no analytics, crash reports, tracks, diagnostics, or usage telemetry to a project server or third party. A future hosted diagnostic service requires a scope/privacy/threat/consent change.

## 3. Diagnostic classes

| Class | Examples | Retention/default limit | Export |
| --- | --- | --- | --- |
| Operational event | State transition, error code, duration, count, version | 7 days / 20 MiB rolling | Private reviewed bundle |
| Recording quality | Accuracy buckets, batch/sequence gaps, mode changes, no raw coordinate by default | Activity lifetime for derived summary; raw debug max 24 h when explicitly enabled | Private only |
| Catalog/build | Bundle/source IDs, checksums, counts, timings, inclusion/exclusion reasons | 30 days / 100 MiB in private build root | Safe summary may be public after review |
| Security/privacy | Gate rule IDs, safe hashes, incident timeline | Incident policy | Private only unless advisory-reviewed |
| Physical test evidence | Device/OS/build/battery/temperature/procedure/results | Project evidence retention | Redacted public summary |

Limits are per environment and configurable downward. Exceeding a limit rotates oldest eligible diagnostics, never private user records.

## 4. Allowed fields

- Timestamp, event/error code, component/version, correlation ID, duration, counts, boolean state, coarse quality bucket, catalog/source/fixture version, and safe content hash.
- Device model, OS/app version, battery health/level, temperature range, radio state, and screen conditions when required for private physical evidence.
- Source partition identifiers only when policy permits and public/private classification is retained.

## 5. Forbidden by default

- Precise coordinates, full tracks, home/start/end location, user text/notes, photos/media, filenames containing personal data.
- Authentication headers, cookies, tokens, passwords, signing/recovery keys, query secrets.
- Private-root absolute paths, device/account IDs, emails, usernames, or raw database rows.
- Permission-limited source bodies unless an explicitly classified private parser fixture/evidence capture is enabled.

Debug capture of a normally forbidden field requires an explicit time-limited private session, visible user/operator consent, encrypted/protected storage, and automatic expiry.

## 6. Correlation and redaction

- Use random per-session correlation IDs that do not encode user/device/location identity.
- Redaction occurs before persistence and again before export/publication.
- URLs retain scheme/approved host/path template while removing query secrets and user-derived path segments.
- Paths are replaced with logical roots such as `<PUBLIC_ROOT>` or `<PRIVATE_ROOT>`.
- Coordinates in public evidence use synthetic fixtures; private evidence never becomes public merely through rounding.

## 7. User-facing diagnostic export

1. User opens Diagnostics and sees categories, time range, estimated size, and privacy warning.
2. App previews included files/field classes and defaults to the minimum support bundle.
3. User may exclude recording quality, screenshots, or other optional content.
4. App applies redaction, creates a manifest/checksums, and encrypts the bundle when it contains sensitive evidence.
5. User explicitly selects a destination/recipient.
6. Temporary bundle is deleted after completion/cancellation.

No automatic upload exists.

## 8. Crash and hang handling

- Persist only a bounded local crash marker and safe component/state/error metadata by default.
- Do not install a hosted third-party crash SDK in the MVP.
- Native crash reports collected through device tools are private operational evidence and are reviewed/redacted before sharing.
- Watchdog/hang diagnostics record duration/component state without coordinates or user content.

## 9. Public release evidence

Public evidence may contain aggregate counts, timings, budget outcomes, safe hashes, synthetic screenshots, fixture IDs, and redacted limitations. It must not contain raw routes, device/account identifiers, private source values, private paths, or secrets.

## 10. Acceptance tests

- Seed every forbidden field type and prove it is absent from stored/exported/public diagnostics.
- Verify rotation/expiry and that diagnostics cleanup never deletes user data.
- Verify public/private root/path redaction and query/header secret redaction.
- Verify opt-in debug capture expires and cannot enter public CI/artifacts.
- Inspect crash, catalog failure, import failure, backup failure, and recording recovery bundles.
- Verify diagnostic export accessibility and cancellation cleanup.
