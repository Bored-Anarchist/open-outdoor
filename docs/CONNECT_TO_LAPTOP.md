# Connect to laptop

The project owner requested local Wi-Fi package installation on 2026-09-30. This extends the state loader under WP-303 and WP-501, with REQ-CAT-002, REQ-USR-002, REQ-SEC-001, REQ-UX-001 and REQ-A11Y-001. It adds an explicit, foreground local transfer of existing public state packages; installed maps remain offline. No hosted service, cloud account or background synchronization is introduced.

## Start the laptop

Use the repository's pinned Node.js and pnpm versions. In the Open Outdoor checkout, run:

```powershell
pnpm map:laptop
```

The server verifies the public state's files against `loader-inventory.json` before listing them. It prints a laptop address and a new pairing code for this session. Keep the terminal open. If Windows asks, allow Node on **Private networks**. The server binds only to one local private IPv4 interface, not all interfaces. If several interfaces are present, choose the laptop's Wi-Fi address explicitly:

```powershell
pnpm map:laptop --host 192.168.1.20 --port 8765
```

The address above is a synthetic example; use the private IPv4 address assigned to your laptop. Ports must be between 1024 and 65535. Only RFC1918 IPv4 addresses are supported in this first version. IPv6, `.local` names, discovery, tunnels and internet hosts are not supported.

Missing or changed catalogs are omitted. Restore the desired states using [package maintenance](PACKAGE_MAINTENANCE.md), then restart the server:

```powershell
pnpm map:public:restore NY
```

## Connect and install

1. Connect the iPhone and laptop to the same trusted Wi-Fi; a local network does not need an internet uplink.
2. In an app build containing this feature, open **Explore → Offline state packages → Connect to laptop**.
3. Enter the address and paste the pairing code printed in the laptop terminal, then choose **Browse laptop packages**. Allow iOS **Local Network** access if asked.
4. Choose **Download** for a state. The list shows its transfer and installed sizes and marks already installed versions.
5. Keep the app open and the laptop awake until installation finishes. Choose **Disconnect laptop** when done; installed states continue to work offline.

Only packages matching this app build's state, checksum and byte-count pins are offered for installation. If the laptop has newer packages, the app reports their incompatibility; install a matching app build or restore the pinned package version. A connection or failed download can be cancelled without replacing the active package. Once local verification/activation begins, it completes through the existing atomic installer. Leaving the app for the background cancels network transfers and forgets the connection. The iOS permission dialog itself does not cancel pairing. Connections and pairing codes are kept in memory and discarded on disconnect, closing the panel, leaving the map, or app shutdown.

Stop sharing with **Ctrl+C**. Restarting the server generates a different pairing code. No account, hosted server or automatic/background synchronization is required.

## Integrity, privacy and transport

The server is read-only and exposes only `/v1/catalog` and `/v1/packages/STATE`. It accepts a random 128-bit session pairing code in the Authorization header, verifies Host against its bound interface, rejects browser Origin requests, and sends no CORS headers. It never lists arbitrary files or reads private state packages, user journals, GPS recordings or private imports. Public file paths must stay inside the public package root; invalid classifications, duplicates, symlinks escaping that root, corrupt bytes and unsupported sizes fail closed. Each download is reverified on the laptop before streaming from the verified file handle.

The phone uses an ephemeral URLSession, with no cookies, disk cache, saved credentials or cellular transfer. It accepts literal private IPv4 addresses only, never uses laptop-provided download URLs, and rejects redirects rather than forwarding the pairing code. Catalog responses are capped at 64 KiB/50 states. Downloaded data is streamed to a temporary file, checked against the exact expected length and installed through the existing checksum, SQLite, embedded-tile, storage-reserve and atomic-activation checks. Failed/cancelled downloads are discarded. A preflight includes download staging space before transfer begins. Notes and recordings are never uploaded, changed or removed by this flow.

Transfers use **local HTTP**, so the pairing code and public files are not encrypted against someone monitoring that network. Use a trusted Wi-Fi network. Pairing limits access; the compiled checksum pins independently protect package integrity. iOS adds only `NSAllowsLocalNetworking` to ATS; general internet HTTP exceptions are not enabled. This feature does not establish production catalog trust or replace ADR-031's signed-provenance gates.

## Troubleshooting and verification

If connection fails, check that both devices use the same network, the laptop terminal is still running, the displayed address belongs to its Wi-Fi interface, the pairing code is current, and Windows permits the server on the private network. Guest Wi-Fi may isolate devices. In iPhone **Settings → Privacy & Security → Local Network**, allow Open Outdoor, then reconnect. The app's network wait is bounded: pairing times out after 30 seconds and a package transfer after 15 minutes. Low-space errors leave the active package in place; free storage or remove another state and retry.

Run `pnpm test:laptop` for synthetic server integration tests, connection-input validation and native-hook/UI interaction tests. These cover pairing denial, browser/rebinding requests, path/private-file exclusion, corrupt and changed packages, symlink escapes, overlapping operations, cancellation, progress, failed downloads, stale catalog responses and the Local Network permission dialog. The server tests are included in `pnpm test:release`; app tests run with `pnpm test`.

The change extends T-INT-002 (catalog integrity/lifecycle), T-SEC-002 (public/private boundary) and T-E2E-001 (offline discovery). It uses original project code and generated synthetic test bytes under Apache-2.0; no third-party source or new dependency is incorporated. TypeScript/automated checks and native compilation are separate from physical iPhone acceptance. Required device cases include first permission grant/denial and retry, actual Windows Wi-Fi transfer, a large state, interrupted/cancelled download, low storage, installed-state search/map display in airplane mode, rollback and notes/recordings retained after removal.
