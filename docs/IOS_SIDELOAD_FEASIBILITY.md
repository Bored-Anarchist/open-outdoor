# iOS build and Windows sideload feasibility

**Package:** WP-006
**Status:** implementation complete; physical-device acceptance pending

## Build boundary

The manual-only `macos-ios-build` workflow selects `/Applications/Xcode_26.4.1.app`, verifies the exact version, generates the Expo iOS project, and builds with code signing disabled. It publishes an unsigned IPA plus SHA-256 digest for one day. The workflow has read-only repository permission and receives no signing identity, Apple credential, provisioning profile, or private root.

An unsigned IPA cannot launch on an iPhone. Signing and installation happen from the operator's Windows machine through AltServer/AltStore using the `local` identity declared in `config/release.json`. Apple credentials must be typed only into AltServer and must never be stored in Git, CI, an issue, a diagnostic bundle, or a script.

The Windows workstation can validate the JavaScript/Hermes payload with `pnpm build:ios:bundle`. Expo native iOS project generation and Xcode compilation do not run on Windows; those steps belong exclusively to the manual hosted macOS workflow. A personally owned Mac is not required.

## Windows signing and installation trial

1. Manually dispatch `macos-ios-build` for the exact public commit and download `OpenOutdoor-unsigned.ipa` before its one-day artifact retention expires.
2. Verify `OpenOutdoor-unsigned.ipa.sha256` locally with `Get-FileHash -Algorithm SHA256`.
3. Install current AltServer for Windows plus the Apple-distributed desktop iTunes and iCloud packages. Connect and trust the unlocked test iPhone, enable Wi-Fi sync if desired, and enable Developer Mode on iOS 16 or later.
4. Install AltStore Classic on the device. Do not paste the Apple credential anywhere except the AltServer prompt.
5. Hold **Shift** while clicking the AltServer tray icon, choose **Sideload .ipa…**, select the unsigned IPA, and target the physical iPhone. AltServer performs local development signing and installation.
6. Launch Open Outdoor Local and record the installed bundle identifier, provisioning start time, exact expiry shown by AltStore, device/iOS version, artifact SHA-256, and whether relaunch succeeds.
7. Before expiry, keep AltServer available on the same network (or connect USB), refresh the app, record the new exact expiry, force-quit, and relaunch without deleting the app.

Free-account apps expire after seven days unless refreshed. The acceptance gate requires the exact observed expiry and refresh result; “about a week” is not evidence.

## Acceptance record

| Check | Required evidence | Current result |
| --- | --- | --- |
| Pinned unsigned macOS build | Workflow URL, commit, Xcode output, artifact digest | Pending first manual candidate run |
| Physical iPhone launch | Device model, iOS version, bundle ID, timestamp | Pending physical device |
| Exact provisioning expiry | Screenshot/transcription of AltStore expiry | Pending physical device |
| Refresh before expiry | Old/new expiry and refresh timestamp | Pending physical device |
| Relaunch and retention | Force-quit/relaunch result; later packages add state retention | Pending physical device |

The documented Windows path follows the official [AltStore Windows installation guide](https://faq.altstore.io/altstore-classic/how-to-install-altstore-windows), [direct IPA sideload behavior](https://github.com/altstoreio/FAQ/blob/main/release-notes/altserver.md), and [seven-day refresh behavior](https://faq.altstore.io/altstore-classic/your-altstore). The selected Xcode path is present in GitHub's [macOS 26 runner inventory](https://github.com/actions/runner-images/blob/main/images/macos/macos-26-arm64-Readme.md).
