# Production accessibility and performance

**Status:** WP-502/WP-503 implementation with automated validation. Physical acceptance deferred to Phase 5 end by the owner under [ADR-049](DECISION_LOG.md). No physical result is marked passed by that decision.

## Native accessibility

The mobile shell subscribes to initial and changing VoiceOver, Bold Text, Reduce Motion and Increase Contrast settings. A later native event wins over a stale initial preference promise; subscriptions are removed on unmount. Increase Contrast overrides a lower-contrast appearance choice. Product text keeps Dynamic Type scaling with no line-count clipping and respects Bold Text. Native controls expose disabled, busy, selected and expanded states, keyboard-focus borders and 52-point minimum targets. An in-flight action cannot be activated twice; failures retain an actionable label and are announced.

VoiceOver receives queued, deduplicated status changes via the iOS announcement API. Updating distance or a checkpoint counter does not continuously interrupt speech. Search remains labeled and results include equivalent source/access details. Critical field notices have combined accessible labels; destructive recorder discard retains the existing native confirmation. No animation is required; the native components introduce none, and the browser suppresses its optional transition under Reduce Motion.

Mock-host tests exercise preference updates/subscription cleanup, queued announcements and async control states. They do not simulate VoiceOver, physical touch or real text layout. The browser runner performs twelve axe-core WCAG 2/2.1/2.2 A/AA tagged scans across four sections and three appearances with the full component catalog expanded. Its negative control confirms that a missing button name is detected. Axe incomplete results are preserved for manual review. Existing keyboard, 200%-text, target and state checks remain in place.

## Runtime hardening

Recorder start, pause, resume, recovery, synchronization and finish operations are serialized. Empty reads no longer clone/write the private snapshot or send redundant acknowledgements. A failed persistence operation remains dirty until retry succeeds; a failed acknowledgement retries without another write. Recovery still persists lifecycle changes even when no samples are pending. Tests cover 720 empty refreshes with zero additional snapshot writes, failed disk and bridge operations, duplicate prevention and refresh/pause overlap.

The UI refresh scheduler runs only while foregrounded and recording, waits for completion before scheduling another operation, and cancels future callbacks on backgrounding or unmount. Native durable spooling continues during screen lock; the UI scheduler is not the native durability clock. Unchanged session/sequence revisions skip full metric recalculation and map updates. Display geometry is capped at 2,048 sampled points with endpoints retained; durable samples, distance and elevation algorithms remain unchanged. This display sampling is not navigation geometry or a modification to saved tracks.

These changes remove demonstrated unnecessary work; they do not establish iPhone battery or memory performance. The existing native persistence layer still serializes full snapshots for nonempty batches, and metrics still process the accumulated observations when the revision changes. The final device profiles must detect whether further optimization is needed at the full catalog/long-track scale.

## Automated review

Use pinned Node/pnpm and install dependencies with `pnpm install --frozen-lockfile`. Install Chromium with `pnpm exec playwright install chromium` (or set `BROWSER_CHANNEL=msedge` for an installed Edge). Run:

```text
pnpm quality
pnpm test:privacy
pnpm phase5:quality
pnpm build:ios:bundle
```

`phase5:quality` executes the targeted regressions, browser accessibility suite and supplemental desktop profiler. It writes `dist/production-quality/report.json`, a physical template and `desktop-profile.json`. The implementation result and physical release result are separate: successful automation may complete the packages under ADR-049 while physical release acceptance stays blocked. `profile:desktop` can run independently; its page-load/search/frame/scroll distributions and raw samples are explicitly desktop-only, on the small synthetic browser fixture. A separate 100,000-point synthetic input checks bounded display allocation. None represents dense New York native rendering.

## End-of-Phase-5 physical protocol

Pin the final clean source commit and SHA-256 of the installed binary. Use iPhone 14/iOS 26.6 with the maximum supported catalog for launch and representative dense New York data for map/search. Record the actual fixture checksum and an evidence-file checksum for each measurement. Preserve raw private capture files externally; the public report accepts only numeric samples, checksums, fixed case IDs and a public reviewer handle. Never include routes, screenshots of private locations, free-form diagnostics or private paths.

The release configuration points to `config/production-quality-profile.json`. It binds:

| Measurement | Collection | Existing budget |
| --- | --- | --- |
| Cold launch | 20 independent launches, offline primary screen usable, no migration | p50 ≤ 2,500 ms; p95 ≤ 4,000 ms |
| Offline search/filter | 20 representative queries returning the first 50 results | p50 ≤ 150 ms; p95 ≤ 500 ms; max ≤ 1,000 ms |
| Dense map | At least 600 frame intervals over at least 30 seconds after warm load | p95 frame interval ≤ 33.34 ms (30 fps floor); no stall > 250 ms |
| Dense scroll | At least 600 frame intervals over at least 30 seconds | No main-thread stall > 250 ms; report p50/p95/max |
| Dense-map resident memory | At least 60 samples over five minutes | p95 ≤ 500 MiB |
| Screen-off tracker memory | At least 360 samples over 30 minutes | p95 ≤ 150 MiB |
| Start/stop acknowledgement | 20 measurements per action | p95 ≤ 500 ms |

Use Instruments/native diagnostics for actual UI frame and memory measurements; browser timings cannot be substituted. Missing, zero, negative, malformed, undersampled or mismatched evidence fails closed. Catalog activation and switch acceptance remain covered by the existing Phase 3/production audit; this gate does not replace them.

The physical accessibility template enumerates 11 critical flows × 9 settings (99 checks): permissions; recording lifecycle; recover/discard; search/detail; map/legend/alternative; catalog/rollback/space; import/export; backup/restore/delete; private origin/unavailable; closure/conflict/unknown; GPS/battery/checkpoint, each under VoiceOver, largest Dynamic Type, Bold Text, Increase Contrast, Differentiate Without Color, Reduce Motion, dark appearance, one-handed touch and outdoor readability. Execute the actual installed flow and attach the evidence digest; do not tick an unimplemented or unavailable surface as passed. Missing cases or unresolved critical/high defects block release. Physical haptic review remains part of the end-of-phase production design review; shared policy tests are not hardware evidence.

For endurance, retain three independent runs per Balanced and Endurance mode, each ≥180 minutes, without charging. Record start/end UTC instants, binary/commit, battery percentages, thermal durations, maximum checkpoint gap, storage growth and post-stop sensor activity, plus offline browse/search/recovery/GPS/accessibility results. Runs cannot overlap or reuse identifiers/evidence hashes. Limits remain 6/4 battery percentage points per hour, zero serious/critical thermal time, ≤30-second checkpoint gaps, ≤64 MiB/hour growth, and zero post-stop sensor activity. Device/source timestamps and protocol independence must be checked by the reviewer; a hash is an identity reference, not proof that measurements occurred.

Evaluate the completed report against the final candidate:

```text
pnpm phase5:quality --verify-physical --physical-report <external-redacted-report.json> --binary-sha256 <installed-binary-sha256>
```

This command exits nonzero for missing or failing evidence, stale commits/binaries, an unclean candidate, unknown report fields, wrong device/environment, repeated/overlapping runs, failed thresholds or incomplete reviewer attestation. Empty template fields are unexecuted, never fabricated zeros. WP-506 must also complete its remaining release/privacy/rights checks before release.
