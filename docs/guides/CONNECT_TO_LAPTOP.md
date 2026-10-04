# Connect to laptop

The project owner requested local Wi-Fi package installation on 2026-09-30. This extends the state loader under WP-303 and WP-501, with REQ-CAT-002, REQ-USR-002, REQ-SEC-001, REQ-UX-001 and REQ-A11Y-001. It adds an explicit, foreground local transfer of existing public state packages; installed maps remain offline. No hosted service, cloud account or background synchronization is introduced.

## Start the laptop

Use the repository's pinned Node.js and pnpm versions. In the Open Outdoor checkout, run:

```powershell
pnpm map:laptop
```

The server verifies the public state's files against `loader-inventory.json` before listing them. It announces a nearby Open Outdoor laptop and prints a loopback pairing-page link, address and fresh session code. Open the printed `/pair` link in a browser **on the laptop** to display the QR code. Keep the terminal open. Allow the server through Windows Firewall for the Wi-Fi network in use. The package server binds to one selected local interface address, with the pairing page available only on the laptop. If several interfaces are present, choose the laptop's Wi-Fi address explicitly:

```powershell
pnpm map:laptop --host 192.168.1.20 --port 8765
```

The address above is a synthetic example; use the address assigned to your laptop's Wi-Fi interface. Ports must be between 1024 and 65535. Private, shared (including `100.64.0.0/10`), link-local and publicly assigned unicast IPv4 ranges work. IPv6 supports global, unique-local and link-local addresses, entered in brackets such as `http://[fd12:3456::20]:8765`. To select an IPv6 listener, pass the unbracketed address to `--host`; for a link-local listener include its laptop interface scope, such as `--host 'fe80::20%12'`. These examples are synthetic. The loopback pairing page displays an address without the laptop's scope ID; the iPhone assigns its own Wi-Fi scope (`en0`). A manually entered scope belongs to the receiving phone and uses `%25`, as in `http://[fe80::20%25en0]:8765`.

Bonjour discovers `_openoutdoor._tcp.local.` services over the selected address family, then checks the advertised literal against resolved IPv4 or IPv6 addresses and port. `.local` names and other DNS names are not transfer addresses. Unspecified, loopback, multicast, reserved IPv4 and IPv4-compatible/mapped IPv6 aliases are rejected. The server accepts only an address assigned to the laptop and keeps its read-only, pairing and integrity checks. Both devices still need a reachable route on the same trusted network; address support cannot bypass guest isolation or firewall rules. Transfers remain local HTTP, even on networks that assign public addresses; use this feature only on a trusted network.

Missing or changed catalogs are omitted. Restore the desired states using [package maintenance](PACKAGE_MAINTENANCE.md), then restart the server:

```powershell
pnpm map:public:restore NY
```

## Connect and install

1. Connect the iPhone and laptop to the same trusted Wi-Fi; a local network does not need an internet uplink.
2. In an app build containing this feature, open **Settings → Maps → Add a map → From laptop**.
3. The panel searches for nearby laptops for five seconds. Allow iOS **Local Network** access if asked. Choose **Scan QR code**, allow Camera access, and scan the QR code on the laptop pairing page. The app connects automatically. Nearby entries can fill the address for manual pairing. Alternatively choose **Enter address and code**, enter the terminal values, and choose **Connect**. **Search again** refreshes discovery.
4. Choose **Download** for a state. The list shows its transfer and installed sizes and marks already installed versions.
5. Keep the app open and the laptop awake until installation finishes. Choose **Disconnect** when done; installed states continue to work offline. **Settings → Maps** shows installed public packages, private datasets, and their visibility switches.

Build-pinned packages remain available without approving update trust. Open Outdoor Local also supports [signed state updates](LAPTOP_STATE_UPDATES.md): scan the signing fingerprint carried by the laptop's QR code, or enter it manually, then explicitly choose **Trust updates**. The panel shows installed/available snapshots and packaging dates and offers **Update** without another app build when the package schema/app interval is compatible. Incompatible engines still need a matching app build. A connection or failed download can be cancelled without replacing the active package. Once verification/activation begins, it completes through the existing atomic installer. Backgrounding cancels transfers and forgets session credentials; permission dialogs do not cancel pairing. Persistent update trust is managed separately and can be revoked offline.

Stop sharing with **Ctrl+C**. Restarting the server generates a different pairing code. No account, hosted server or automatic/background synchronization is required.

Discovery and scanning also stop on closing the panel, leaving the map or entering the background. Permission dialogs do not cancel them. Camera frames are never saved or uploaded. **Cancel scan** returns to manual entry. Older builds with the original connection feature retain manual pairing. Stopping the server withdraws discovery; restarting generates a fresh temporary service name and pairing code.

## Integrity, privacy and transport

The additional `/pair` page requires a same-laptop connection and rejects cross-site fetch metadata. It has no external scripts/assets, uses no-store caching and forbids framing. Credentials do not appear in its URL or Bonjour announcements. Bonjour publishes only the selected interface's IPv4 address, port, version and random temporary service/host name, never a machine/account identifier. The phone searches the declared service type only; resolved addresses must agree with its advertised private address and port. Discovery is bounded to five seconds and twenty resolving services. QR input is capped at 1 KiB, requires the Open Outdoor type/version and validates address/code before connecting; other codes never open links.

The package server is read-only and exposes `/v1/catalog` and `/v1/packages/STATE`. It accepts a random 128-bit session pairing code in the Authorization header, verifies Host against its bound interface, rejects browser Origin requests, and sends no CORS headers. It never lists arbitrary files or reads private state packages, user journals, GPS recordings or private imports. Public file paths must stay inside the public package root; invalid classifications, duplicates, symlinks escaping that root, corrupt bytes and unsupported sizes fail closed. Each download is reverified on the laptop before streaming from the verified file handle.

The phone uses an ephemeral URLSession, with no cookies, disk cache, saved credentials or cellular transfer. It accepts validated literal unicast IPv4 or IPv6 endpoints, never uses laptop-provided download URLs, and rejects redirects rather than forwarding the pairing code. Catalog responses are capped at 64 KiB/50 states. Downloaded data is streamed to a temporary file, checked against the exact expected length and installed through the existing checksum, SQLite, embedded-tile, storage-reserve and atomic-activation checks. Failed/cancelled downloads are discarded. A preflight includes download staging space before transfer begins. Notes and recordings are never uploaded, changed or removed by this flow.

Transfers use **local HTTP**, so the pairing code and public files are not encrypted against someone monitoring that network. Use trusted Wi-Fi. Pairing limits access; compiled checksums or independently approved laptop signatures protect package integrity. iOS adds only `NSAllowsLocalNetworking` to ATS. Laptop update trust is restricted to the local app identity and does not establish production release trust or replace ADR-031's gates.

## Troubleshooting and verification

Guest-network isolation can prevent all pairing. Multicast blocking can hide a reachable laptop: scan its QR code or use manual entry. Bonjour failure leaves QR/manual transfer available. Camera denial can be corrected in Settings or bypassed with manual entry. A stopped server's QR code expires; use its current pairing page. Local Network permission changes take effect on **Search again** or reconnect.

If connection fails, check that both devices use the same network, the laptop terminal is still running, the displayed address belongs to its Wi-Fi interface, the pairing code is current, and Windows permits the server on the private network. Guest Wi-Fi may isolate devices. In iPhone **Settings → Privacy & Security → Local Network**, allow Open Outdoor, then reconnect. The app's network wait is bounded: pairing times out after 30 seconds and a package transfer after 15 minutes. Low-space errors leave the active package in place; free storage or remove another state and retry.

Run `pnpm test:laptop` for synthetic server integration tests, connection-input validation and native-hook/UI interaction tests. These cover pairing denial, browser/rebinding requests, path/private-file exclusion, corrupt and changed packages, symlink escapes, overlapping operations, cancellation, progress, failed downloads, stale catalog responses and the Local Network permission dialog. The server tests are included in `pnpm test:release`; app tests run with `pnpm test`.

The change extends T-INT-002 (catalog integrity/lifecycle), T-SEC-002 (public/private boundary) and T-E2E-001 (offline discovery). Project-authored code and synthetic fixtures are Apache-2.0. Pinned laptop-only Bonjour/QR dependencies and a test-only independent decoder are recorded in [third-party notices](../../THIRD_PARTY_NOTICES.md); scanning uses Apple's AVFoundation framework. Tests additionally cover independent QR decoding, publication privacy/scoping, unsafe QR input, stale discovery/scan callbacks, camera denial/cancellation and manual fallback. TypeScript/automated checks and native compilation are separate from physical iPhone acceptance. Required device cases include Local Network/Camera first grant/denial and retry, multiple laptops, stale discovery, multicast-blocked QR/manual pairing, closing/backgrounding during search/permission/scan, actual Windows Wi-Fi transfer, a large state, interrupted/cancelled download, low storage, installed-state search/map display in airplane mode, rollback and notes/recordings retained after removal.
