# Connect to laptop

The project owner requested local Wi-Fi package installation on 2026-09-30. This extends the state loader under WP-303 and WP-501, with REQ-CAT-002, REQ-USR-002, REQ-SEC-001, REQ-UX-001 and REQ-A11Y-001. It adds an explicit, foreground local transfer of existing public state packages; installed maps remain offline. No hosted service, cloud account or background synchronization is introduced.

## Start the laptop

Use the repository's pinned Node.js and pnpm versions. In the Open Outdoor checkout, run:

```powershell
pnpm map:laptop
```

The server verifies the public state's files against `loader-inventory.json` before listing them. It announces a nearby Open Outdoor laptop and prints a pairing-page link, address and fresh session code. Open the `/pair` link in a browser **on the laptop** to display the QR code. Keep the terminal open. If Windows asks, allow Node on **Private networks**. The server binds only to one local private IPv4 interface. If several interfaces are present, choose the laptop's Wi-Fi address explicitly:

```powershell
pnpm map:laptop --host 192.168.1.20 --port 8765
```

The address above is a synthetic example; use the private IPv4 address assigned to your laptop. Ports must be between 1024 and 65535. Package connections use RFC1918 IPv4 addresses. Bonjour discovers `_openoutdoor._tcp.local.` services, then validates their private IPv4 address and port. `.local` names are not accepted as transfer addresses. IPv6-only networks, tunnels and internet hosts are unsupported.

Missing or changed catalogs are omitted. Restore the desired states using [package maintenance](PACKAGE_MAINTENANCE.md), then restart the server:

```powershell
pnpm map:public:restore NY
```

## Connect and install

1. Connect the iPhone and laptop to the same trusted Wi-Fi; a local network does not need an internet uplink.
2. In an app build containing this feature, open **Explore → Offline state packages → Connect to laptop**.
3. The panel searches for nearby laptops for five seconds. Allow iOS **Local Network** access if asked. Choose **Scan pairing QR code**, allow Camera access, and scan the QR code on the laptop pairing page. The app connects automatically. Nearby entries can fill the address for manual pairing. Alternatively enter the terminal address and code and choose **Browse laptop packages**. **Search again** refreshes discovery.
4. Choose **Download** for a state. The list shows its transfer and installed sizes and marks already installed versions.
5. Keep the app open and the laptop awake until installation finishes. Choose **Disconnect laptop** when done; installed states continue to work offline.

Only packages matching this app build's state, checksum and byte-count pins are offered for installation. If the laptop has newer packages, the app reports their incompatibility; install a matching app build or restore the pinned package version. A connection or failed download can be cancelled without replacing the active package. Once local verification/activation begins, it completes through the existing atomic installer. Leaving the app for the background cancels network transfers and forgets the connection. The iOS permission dialog itself does not cancel pairing. Connections and pairing codes are kept in memory and discarded on disconnect, closing the panel, leaving the map, or app shutdown.

Stop sharing with **Ctrl+C**. Restarting the server generates a different pairing code. No account, hosted server or automatic/background synchronization is required.

Discovery and scanning also stop on closing the panel, leaving the map or entering the background. Permission dialogs do not cancel them. Camera frames are never saved or uploaded. **Cancel scan** returns to manual entry. Older builds with the original connection feature retain manual pairing. Stopping the server withdraws discovery; restarting generates a fresh temporary service name and pairing code.

## Integrity, privacy and transport

The additional `/pair` page requires a same-laptop connection and rejects cross-site fetch metadata. It has no external scripts/assets, uses no-store caching and forbids framing. Credentials do not appear in its URL or Bonjour announcements. Bonjour publishes only the selected interface's IPv4 address, port, version and random temporary service/host name, never a machine/account identifier. The phone searches the declared service type only; resolved addresses must agree with its advertised private address and port. Discovery is bounded to five seconds and twenty resolving services. QR input is capped at 1 KiB, requires the Open Outdoor type/version and validates address/code before connecting; other codes never open links.

The package server is read-only and exposes `/v1/catalog` and `/v1/packages/STATE`. It accepts a random 128-bit session pairing code in the Authorization header, verifies Host against its bound interface, rejects browser Origin requests, and sends no CORS headers. It never lists arbitrary files or reads private state packages, user journals, GPS recordings or private imports. Public file paths must stay inside the public package root; invalid classifications, duplicates, symlinks escaping that root, corrupt bytes and unsupported sizes fail closed. Each download is reverified on the laptop before streaming from the verified file handle.

The phone uses an ephemeral URLSession, with no cookies, disk cache, saved credentials or cellular transfer. It accepts literal private IPv4 addresses only, never uses laptop-provided download URLs, and rejects redirects rather than forwarding the pairing code. Catalog responses are capped at 64 KiB/50 states. Downloaded data is streamed to a temporary file, checked against the exact expected length and installed through the existing checksum, SQLite, embedded-tile, storage-reserve and atomic-activation checks. Failed/cancelled downloads are discarded. A preflight includes download staging space before transfer begins. Notes and recordings are never uploaded, changed or removed by this flow.

Transfers use **local HTTP**, so the pairing code and public files are not encrypted against someone monitoring that network. Use a trusted Wi-Fi network. Pairing limits access; the compiled checksum pins independently protect package integrity. iOS adds only `NSAllowsLocalNetworking` to ATS; general internet HTTP exceptions are not enabled. This feature does not establish production catalog trust or replace ADR-031's signed-provenance gates.

## Troubleshooting and verification

Guest-network isolation can prevent all pairing. Multicast blocking can hide a reachable laptop: scan its QR code or use manual entry. Bonjour failure leaves QR/manual transfer available. Camera denial can be corrected in Settings or bypassed with manual entry. A stopped server's QR code expires; use its current pairing page. Local Network permission changes take effect on **Search again** or reconnect.

If connection fails, check that both devices use the same network, the laptop terminal is still running, the displayed address belongs to its Wi-Fi interface, the pairing code is current, and Windows permits the server on the private network. Guest Wi-Fi may isolate devices. In iPhone **Settings → Privacy & Security → Local Network**, allow Open Outdoor, then reconnect. The app's network wait is bounded: pairing times out after 30 seconds and a package transfer after 15 minutes. Low-space errors leave the active package in place; free storage or remove another state and retry.

Run `pnpm test:laptop` for synthetic server integration tests, connection-input validation and native-hook/UI interaction tests. These cover pairing denial, browser/rebinding requests, path/private-file exclusion, corrupt and changed packages, symlink escapes, overlapping operations, cancellation, progress, failed downloads, stale catalog responses and the Local Network permission dialog. The server tests are included in `pnpm test:release`; app tests run with `pnpm test`.

The change extends T-INT-002 (catalog integrity/lifecycle), T-SEC-002 (public/private boundary) and T-E2E-001 (offline discovery). Project-authored code and synthetic fixtures are Apache-2.0. Pinned laptop-only Bonjour/QR dependencies and a test-only independent decoder are recorded in [third-party notices](../THIRD_PARTY_NOTICES.md); scanning uses Apple's AVFoundation framework. Tests additionally cover independent QR decoding, publication privacy/scoping, unsafe QR input, stale discovery/scan callbacks, camera denial/cancellation and manual fallback. TypeScript/automated checks and native compilation are separate from physical iPhone acceptance. Required device cases include Local Network/Camera first grant/denial and retry, multiple laptops, stale discovery, multicast-blocked QR/manual pairing, closing/backgrounding during search/permission/scan, actual Windows Wi-Fi transfer, a large state, interrupted/cancelled download, low storage, installed-state search/map display in airplane mode, rollback and notes/recordings retained after removal.
