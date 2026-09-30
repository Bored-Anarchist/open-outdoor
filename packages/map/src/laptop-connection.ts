export interface LaptopStatePackage {
  readonly state: string;
  readonly name: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly installedBytes: number;
  readonly generatedAt?: string;
  readonly revision?: number;
  readonly requiresTrust?: boolean;
  readonly signed?: boolean;
}

export interface LaptopCatalog {
  readonly packages: readonly LaptopStatePackage[];
  readonly unsupportedCount: number;
  readonly blockedCount?: number;
  readonly signerFingerprint?: string;
  readonly signerTrusted?: boolean;
  readonly canTrustSigner?: boolean;
}

export interface LaptopTransferProgress {
  readonly phase: 'idle' | 'connecting' | 'downloading' | 'verifying';
  readonly receivedBytes: number;
  readonly totalBytes: number;
}

/** Accept only a literal private IPv4 address: no DNS, URL secrets or alternate origins. */
export function validateLaptopAddress(address: string): string {
  const match = /^http:\/\/(\d{1,3}(?:\.\d{1,3}){3}):(\d{4,5})\/?$/.exec(address.trim());
  const parts = match?.[1]?.split('.') ?? [];
  const numbers = parts.map(Number);
  const [a, b = -1] = numbers;
  const port = Number(match?.[2]);
  if (
    parts.length !== 4 ||
    parts.some((part) => !/^(0|[1-9]\d{0,2})$/.test(part) || Number(part) > 255) ||
    !(a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) ||
    port < 1024 ||
    port > 65535
  )
    throw new Error(
      'Enter the laptop address shown in its terminal, such as http://192.168.1.20:8765.',
    );
  return `http://${parts.join('.')}:${port}`;
}

export function validateLaptopConnection(
  address: string,
  pairingCode: string,
  signerFingerprint = '',
) {
  const normalized = validateLaptopAddress(address);
  const code = pairingCode.trim().toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(code))
    throw new Error('Paste the 32-character pairing code shown in the laptop terminal.');
  const fingerprint = signerFingerprint.trim().toLowerCase().replace(/\s/g, '');
  if (fingerprint && !/^[a-f0-9]{64}$/.test(fingerprint))
    throw new Error(
      'Enter the complete 64-character signing fingerprint shown on the laptop pairing page.',
    );
  return {
    address: normalized,
    pairingCode: code,
    ...(fingerprint ? { signerFingerprint: fingerprint } : {}),
  };
}

export interface DiscoveredLaptop {
  readonly name: string;
  readonly address: string;
}

export function parseLaptopPairingQr(raw: string) {
  try {
    if (raw.length > 1024) throw new Error();
    const value = JSON.parse(raw);
    if (
      value.type !== 'open-outdoor-laptop' ||
      (value.version !== 1 && value.version !== 2) ||
      typeof value.address !== 'string' ||
      typeof value.pairingCode !== 'string'
    )
      throw new Error();
    if (
      value.version === 2 &&
      (typeof value.signerFingerprint !== 'string' ||
        !/^[a-f0-9]{64}$/.test(value.signerFingerprint))
    )
      throw new Error();
    return validateLaptopConnection(
      value.address,
      value.pairingCode,
      value.version === 2 ? value.signerFingerprint : '',
    );
  } catch {
    throw new Error('Scan the pairing QR code shown by the Open Outdoor laptop server.');
  }
}

export function parseDiscoveredLaptops(raw: string): readonly DiscoveredLaptop[] {
  if (raw.length > 8192) throw new Error('Nearby laptop list is too large.');
  const values = JSON.parse(raw);
  if (!Array.isArray(values) || values.length > 20)
    throw new Error('Nearby laptop list is invalid.');
  const seen = new Set<string>();
  return values.flatMap((value) => {
    if (
      !value ||
      typeof value.name !== 'string' ||
      value.name.length > 80 ||
      /[\u0000-\u001f\u007f]/.test(value.name) ||
      typeof value.address !== 'string'
    )
      return [];
    let address: string;
    try {
      address = validateLaptopAddress(value.address);
    } catch {
      return [];
    }
    if (seen.has(address)) return [];
    seen.add(address);
    return [{ name: value.name, address }];
  });
}

export function laptopTransferMessage(progress: LaptopTransferProgress): string | null {
  if (progress.phase === 'verifying')
    return 'Verifying the state package and installing it for offline use…';
  if (progress.phase !== 'downloading' || progress.totalBytes <= 0) return null;
  const received = Math.min(progress.receivedBytes, progress.totalBytes);
  return `Downloading state: ${(received / 1048576).toFixed(1)} of ${(progress.totalBytes / 1048576).toFixed(1)} MiB (${Math.floor((received / progress.totalBytes) * 100)}%). Keep the app open.`;
}
