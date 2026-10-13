# Connect to laptop

Open Outdoor transfers public state packages through the **laptop's Windows Mobile hotspot**. Starting the server enables the hotspot automatically. The phone joins that hotspot before pairing; the server binds only to the hotspot address. This avoids networks that block communication between their clients, as observed during the owner's October 12, 2026 investigation.

This extends WP-303/WP-501 and REQ-CAT-002, REQ-USR-002, REQ-SEC-001, REQ-UX-001 and REQ-A11Y-001. Transfers remain explicit and foreground-only. Installed maps work offline; there is no hosted service, cloud account or background synchronization.

## Start the laptop

Use Windows 10 or 11 with Mobile hotspot support and the repository's pinned Node.js and pnpm versions. Windows needs an active upstream connection profile to enable Mobile hotspot, so leave the laptop connected to Wi-Fi or Ethernet. Package bytes travel directly between the phone and laptop over the hotspot.

```powershell
pnpm map:laptop
```

Startup automatically acquires the laptop signing lock, enables the existing Windows hotspot, discovers its actual private IPv4 address and Wi-Fi Direct adapter, prepares a scoped firewall rule and verifies public state packages before opening the server. The hotspot's name and password are retained. Its address and adapter name are not hard-coded. Ambiguous adapters, unavailable hotspot support or an unsupported operating system fail with guidance rather than falling back to another network.

Windows asks for administrator approval when the dedicated firewall rule is missing or its address, adapter, executable or port changed. A matching rule is reused on later starts. The rule allows only the current Node executable, hotspot adapter, hotspot local address, selected TCP port and hotspot subnet. It does not depend on one phone's changing DHCP address. Global firewall settings and unrelated rules are left intact.

Open the printed `/pair` link **on the laptop**. It shows the hotspot name/password followed by the app pairing QR, current address, session pairing code and signing fingerprint. The Wi-Fi password is not printed in the terminal, carried in the app QR or advertised through Bonjour. The page has no external resources and is unavailable to other devices.

The default port is 8765. To choose another:

```powershell
pnpm map:laptop --port 9000
```

Ports must be 1024–65535. `--host` is no longer supported: the automatically prepared hotspot chooses the address. Missing or changed packages are omitted. Restore desired states using [package maintenance](PACKAGE_MAINTENANCE.md), then restart:

```powershell
pnpm map:public:restore NY
```

## Connect and install

1. Start `pnpm map:laptop` and open its printed pairing page on the laptop.
2. On the iPhone, open **Settings → Wi-Fi**, join the hotspot name displayed on the page and enter its Wi-Fi password. Keep the phone on this hotspot throughout pairing and downloads.
3. In Open Outdoor, open **Settings → Maps → Add a map → From laptop**. Allow **Local Network** access if asked.
4. Choose **Scan QR code**, allow Camera access and scan the app pairing QR on the laptop. Alternatively, choose **Enter address and code**, enter the current address/session code and choose **Connect**. The hotspot Wi-Fi password and app pairing code are separate credentials.
5. Choose **Download** for a state. Keep the app open and laptop awake until installation finishes. Choose **Disconnect** when done. Installed states remain available offline.

Nearby discovery searches the hotspot for five seconds. If discovery is unavailable, QR/manual pairing still works. After joining the hotspot, choose **Search again**. Permission dialogs do not cancel pairing; backgrounding or closing the panel cancels discovery/scanning/transfers and forgets session credentials. Camera frames are never saved or uploaded.

For [signed state updates](LAPTOP_STATE_UPDATES.md), scan or compare the signing fingerprint and explicitly choose **Trust updates**. Update trust is separate from Wi-Fi access and pairing. Matching build-pinned packages remain available without approving update trust. Failed or cancelled downloads retain the installed package; verification and activation reuse the atomic installer.

## Stop and restart

Press **Ctrl+C** to close listeners/discovery, expire the pairing code and release the signing lock. If this server turned the hotspot on, it turns it off. If the hotspot was already on before startup, it leaves it on for its other users.

Windows' no-client idle shutdown is disabled while the server awaits its phone and restored to its previous setting on exit. A piped PowerShell helper also cleans up when the parent server exits unexpectedly. Turning the hotspot off manually or changing its address stops sharing with restart guidance; the server does not switch adapters. Abrupt OS shutdown or a stuck helper cannot guarantee immediate cleanup; a cleanup warning directs the user to Windows Mobile hotspot settings.

The narrow per-port firewall rule remains for later starts and is refreshed with administrator approval if its configuration changes. Restarting creates a fresh pairing code; reopen the current page and rescan.

## Troubleshooting

- **Hotspot cannot start:** check Windows Mobile hotspot support, Wi-Fi radio and an active Wi-Fi/Ethernet upstream connection. Open **Windows Settings → Network & internet → Mobile hotspot**. Close conflicting Wi-Fi Direct sessions and restart.
- **Administrator approval declined:** restart and approve the scoped firewall prompt. Sharing does not start without the required rule.
- **Phone is on building Wi-Fi:** join the laptop hotspot shown on the pairing page, then reconnect in the app.
- **Safari reachability:** while on the hotspot, open the displayed laptop address with `/v1/catalog` appended in iPhone Safari. `Pairing code required.` confirms reachability without putting a code in a URL. If it hangs, verify the hotspot/server, phone's selected network, VPN/proxy settings and scoped firewall rule.
- **Safari works but the app fails:** allow Open Outdoor under **iPhone Settings → Privacy & Security → Local Network**, reconnect and read the exact error. An older app may need a build containing numeric-IP HTTP policy and actionable native errors.
- **Old QR/address or hotspot stopped:** restart the server, join its current hotspot and scan its current pairing page.

Pairing has a 30-second network timeout; package transfers have a 15-minute limit. Startup explains an occupied port, signing-writer conflict or missing verified packages. Low-space and integrity failures preserve the active package.

## Integrity, privacy and transport

Transfers use local HTTP inside the password-protected hotspot. The HTTP pairing header and public bytes are not protected by application-layer TLS; keep the hotspot password private. Pairing limits access; compiled checksums or independently approved signatures protect integrity.

The read-only server exposes `/v1/catalog` and `/v1/packages/STATE`, requires a random 128-bit session code in the Authorization header, verifies Host against its bound address, rejects browser Origin requests and sends no CORS headers. Production sessions additionally reject peers outside the hotspot subnet. The laptop-only `/pair` page requires a same-laptop connection, rejects cross-site fetch metadata, forbids framing and uses no-store caching. Hotspot names/passwords are escaped before rendering.

Bonjour publishes only the selected hotspot address, port, protocol version and random temporary service/host name. It never publishes the Wi-Fi password, session code, signing fingerprint or machine/account name. App pairing QR input remains capped at 1 KiB and contains only its validated type/version, address, session code and optional public fingerprint. Older IPv4/IPv6 payloads remain parseable for protocol compatibility; current laptop startup is Windows hotspot-only.

Public file paths stay within the public root. Invalid classifications, duplicates, escaping symlinks, corrupt bytes and unsupported sizes fail closed. Each download is reverified before streaming. Private packages, notes, GPS recordings and private imports are never served or uploaded.

The phone uses an ephemeral URLSession without cookies, disk cache, saved credentials or cellular transfer. Redirects are rejected. Catalogs are capped at 64 KiB/50 states. Downloads are length-checked, streamed to temporary storage and installed through existing checksum, SQLite, embedded-tile, storage-reserve and atomic-activation checks. iOS declares Local Network/Bonjour permissions and scoped numeric IP/CIDR HTTP allowances without a global arbitrary-load exception. Native policy changes require a new iOS build.

## Verification

Run `pnpm test:laptop` for server, hotspot supervisor, Windows adapter/firewall, input and native-hook/UI tests. Windows regressions execute the actual PowerShell parser and synthetic adapter/firewall inputs without changing system settings. Other platforms run the Node lifecycle tests and skip the Windows-native test. Release tests discover these files automatically.

Cases include hotspot-only binding, failure/cancellation cleanup, unexpected helper exit, invalid/ambiguous adapters, no LAN fallback, scoped firewall checks, changing phone addresses, credential rendering, authorization, browser/rebinding requests, corrupt/changed packages, private/path exclusion, cancellation and permission-dialog behavior. Physical acceptance still includes first-time Windows approval, fresh automatic hotspot startup, phone join, app QR pairing, actual state download, interruption, low storage and offline map use.

Microsoft documents [Windows Mobile hotspot](https://support.microsoft.com/en-us/windows/experience/connectivity-networking/use-your-windows-device-as-a-mobile-hotspot), [the tethering lifecycle](https://learn.microsoft.com/en-us/uwp/api/windows.networking.networkoperators.networkoperatortetheringmanager) and [no-client timeout control](https://learn.microsoft.com/en-us/uwp/api/windows.networking.networkoperators.networkoperatortetheringmanager.disablenoconnectionstimeoutasync). Project-authored code and synthetic fixtures are Apache-2.0; pinned Bonjour/QR dependencies and the test decoder remain recorded in [third-party notices](../../THIRD_PARTY_NOTICES.md).
