import Bonjour from 'bonjour-service';
import QRCode from 'qrcode';
import { randomBytes } from 'node:crypto';

export function pairingPayload(address, pairingCode) {
  return JSON.stringify({ type: 'open-outdoor-laptop', version: 1, address, pairingCode });
}

export async function pairingPage(address, pairingCode) {
  const svg = await QRCode.toString(pairingPayload(address, pairingCode), {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 4,
  });
  // Both values originate in the validated server configuration, never request input.
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Connect Open Outdoor</title><style>body{font:20px system-ui;max-width:560px;margin:40px auto;padding:20px;background:#fff;color:#152820}svg{width:100%;max-width:440px}code{overflow-wrap:anywhere}h1{font-size:30px}</style><main><h1>Connect your phone</h1><p>Keep both devices on the same trusted Wi-Fi. In Open Outdoor, choose Connect to laptop, then Scan pairing QR code.</p>${svg.replace('<svg ', '<svg role="img" aria-label="Laptop pairing QR code" ')}<p>Laptop address: <code>${address}</code></p><p>Manual pairing code: <code>${pairingCode}</code></p><p>Keep the laptop server running. Closing the server expires this code. Downloads use local HTTP.</p></main></html>`;
}

export function canViewPairingPage(remoteAddress, localAddress, fetchSite) {
  return (
    remoteAddress === localAddress && (!fetchSite || ['none', 'same-origin'].includes(fetchSite))
  );
}

export function advertiseLaptop(host, port, { BonjourClass = Bonjour, onError = () => {} } = {}) {
  const id = randomBytes(4).toString('hex');
  const bonjour = new BonjourClass({ interface: host }, onError);
  let service;
  try {
    // Publication probes asynchronously; scope records before its first announcement.
    service = bonjour.publish({
      name: `Open Outdoor laptop ${id}`,
      host: `open-outdoor-${id}.local`,
      type: 'openoutdoor',
      protocol: 'tcp',
      port,
      disableIPv6: true,
      txt: { v: '1', address: `http://${host}:${port}` },
    });
    const records = service.records.bind(service);
    service.records = () =>
      records().filter(
        (record) => record.type !== 'AAAA' && (record.type !== 'A' || record.data === host),
      );
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
