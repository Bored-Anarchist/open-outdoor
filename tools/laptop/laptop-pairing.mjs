import Bonjour from 'bonjour-service';
import QRCode from 'qrcode';
import { randomBytes } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import { laptopAddress, literalHost } from './laptop-network.mjs';

export function pairingPayload(address, pairingCode, signerFingerprint) {
  return JSON.stringify({
    type: 'open-outdoor-laptop',
    version: signerFingerprint ? 2 : 1,
    address,
    pairingCode,
    ...(signerFingerprint ? { signerFingerprint } : {}),
  });
}

export async function pairingPage(address, pairingCode, signerFingerprint, hotspot) {
  const svg = await QRCode.toString(pairingPayload(address, pairingCode, signerFingerprint), {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 4,
  });
  // A Windows hotspot name/password can contain markup; keep both laptop-local and escaped.
  const escape = (value) =>
    String(value).replace(
      /[&<>"']/g,
      (character) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character],
    );
  const join = hotspot
    ? `<h2>1. Join the laptop hotspot</h2><p>On your phone, open Settings → Wi-Fi and join <strong>${escape(hotspot.networkName)}</strong>.</p><p>Wi-Fi password: <code>${escape(hotspot.passphrase)}</code></p><p>Keep the phone connected to this hotspot during pairing and downloads.</p><h2>2. Pair in Open Outdoor</h2>`
    : '<p>Join the laptop hotspot on your phone before pairing.</p>';
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Connect Open Outdoor</title><style>body{font:20px system-ui;max-width:560px;margin:40px auto;padding:20px;background:#fff;color:#152820}svg{width:100%;max-width:440px}code{overflow-wrap:anywhere}h1{font-size:30px}h2{font-size:24px}</style><main><h1>Connect your phone</h1>${join}<p>In Open Outdoor, choose Settings → Maps → Add a map → From laptop, then Scan QR code.</p>${svg.replace('<svg ', '<svg role="img" aria-label="Laptop pairing QR code" ')}<p>Laptop address: <code>${escape(address)}</code></p><p>Manual pairing code: <code>${escape(pairingCode)}</code></p>${signerFingerprint ? `<p>Signing fingerprint: <code>${escape(signerFingerprint)}</code></p><p>Approve this laptop for state updates only after comparing this fingerprint or scanning this page.</p>` : ''}<p>Keep the laptop server running. Closing the server expires this code. Downloads use local HTTP.</p></main></html>`;
}

export function canViewPairingPage(remoteAddress, localAddress, fetchSite) {
  return (
    remoteAddress === localAddress && (!fetchSite || ['none', 'same-origin'].includes(fetchSite))
  );
}

export function advertiseLaptop(
  host,
  port,
  { BonjourClass = Bonjour, onError = () => {}, interfaces = networkInterfaces() } = {},
) {
  const id = randomBytes(4).toString('hex');
  const selected = literalHost(host);
  if (!selected) throw new Error('Choose a literal laptop address.');
  let options = { interface: host };
  if (selected.family === 6) {
    const adapter = Object.entries(interfaces).find(([, entries]) =>
      entries?.some((entry) => literalHost(entry.address)?.host === selected.host),
    );
    const scope =
      selected.scope ?? adapter?.[1]?.find((entry) => entry.scopeid > 0)?.scopeid ?? adapter?.[0];
    if (!scope || !/^[A-Za-z0-9_.-]{1,32}$/.test(String(scope)))
      throw new Error('IPv6 discovery requires a local interface scope. Use QR or manual pairing.');
    options = { type: 'udp6', ip: `ff02::fb%${scope}`, interface: `::%${scope}`, bind: '::' };
  }
  const bonjour = new BonjourClass(options, onError);
  let service;
  try {
    // Publication probes asynchronously; scope records before its first announcement.
    service = bonjour.publish({
      name: `Open Outdoor laptop ${id}`,
      host: `open-outdoor-${id}.local`,
      type: 'openoutdoor',
      protocol: 'tcp',
      port,
      disableIPv6: selected.family === 4,
      txt: { v: '1', address: laptopAddress(host, port) },
    });
    const records = service.records.bind(service);
    const addressType = selected.family === 4 ? 'A' : 'AAAA';
    service.records = () =>
      records().flatMap((record) => {
        if (record.type !== 'A' && record.type !== 'AAAA') return [record];
        if (record.type !== addressType || literalHost(record.data)?.host !== selected.host)
          return [];
        // DNS address records contain the address bytes, never a local interface scope.
        return [{ ...record, data: selected.host }];
      });
  } catch (error) {
    bonjour.destroy();
    throw error;
  }
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    const timer = setTimeout(() => bonjour.destroy(), 500);
    timer.unref();
    service.stop(() => {
      clearTimeout(timer);
      bonjour.destroy();
    });
  };
}
