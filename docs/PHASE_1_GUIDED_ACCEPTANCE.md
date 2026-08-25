# Phase 1 guided acceptance

The guided runner reduces WP-109 to one persistent workflow while preserving every binding physical and accessibility threshold. It is compiled only in the local diagnostics channel and never records coordinates.

## Before starting

- Install the exact candidate build on the pinned iPhone 14/iOS 26.6 profile.
- Know the independent ascent of the controlled climb in metres.
- Grant Always Location permission.
- Use synthetic or private test data; only the coordinate-free exported report may enter the public repository.

## Guided device run

1. Open **Physical acceptance evidence** and choose **Begin guided acceptance**.
2. Choose **Start and arm crash test**, force-close the app once, relaunch, then choose **Recover and finish crash recording**.
3. Choose **Start permission test and open Settings**. Set location permission to Never and return so the safe stop is captured. Reopen Settings, restore Always Location, and return.
4. Recover the permission-interrupted recording and choose **Begin combined 30-minute field run**.
5. Lock the phone, complete the known climb, and toggle Airplane Mode off and on once. Return after at least 30 minutes and finish the combined run.
6. Enable VoiceOver, the largest Dynamic Type size, Bold Text, Increase Contrast, Differentiate Without Color, Reduce Motion, and dark mode. Exercise the critical controls and record the single usability result.
7. Export the consolidated report.

The runner automatically captures process relaunch, durable tracker recovery, authorization transitions, safe sensor stop, screen-off duration, network transitions, weak GPS, explicit stop, resident-memory samples, elevation error, accessibility settings, device/OS/build metadata, and timestamps.

## Repository ingestion

From the repository root, run:

```powershell
pnpm phase1:evidence --report <path-to-phase1-physical-report.json>
```

The command validates the report schema, rejects coordinate-bearing fields, independently re-evaluates memory and elevation thresholds, verifies every tracker/accessibility check, hashes the source report, binds the proposal to the current Git commit, and writes `dist/phase1-evidence-proposal.json`.

A passing proposal does not modify `config/phase1-gate.json`. A reviewer must inspect the exact build/report hashes, retain the appropriately redacted evidence artifact, record reviewer/date/residual risks, and explicitly accept the affected work packages.

## Binding limits

- Screen-off field duration: at least 30 minutes.
- Memory samples: at least 20.
- Resident-memory p95: at most 150 MiB.
- Elevation error: at most the greater of 15 m or 10% of the reference climb.
- Tracker: crash relaunch/recovery, permission loss/safe stop/restoration, radio transition, weak GPS, screen-off duration, and explicit stop must all be observed.
- Accessibility: VoiceOver and the complete worst-case display configuration must be detected, plus one human usability confirmation.

Measured battery draw and thermal endurance remain deferred to WP-307/WP-503.
