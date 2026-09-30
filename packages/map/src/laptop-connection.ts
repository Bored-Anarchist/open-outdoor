export interface LaptopStatePackage {
  readonly state: string;
  readonly name: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly installedBytes: number;
}

export interface LaptopCatalog {
  readonly packages: readonly LaptopStatePackage[];
  readonly unsupportedCount: number;
}

export interface LaptopTransferProgress {
  readonly phase: 'idle' | 'connecting' | 'downloading' | 'verifying';
  readonly receivedBytes: number;
  readonly totalBytes: number;
}

/** Accept only a literal private IPv4 address: no DNS, URL secrets or alternate origins. */
export function validateLaptopConnection(address: string, pairingCode: string) {
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
  const code = pairingCode.trim().toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(code))
    throw new Error('Paste the 32-character pairing code shown in the laptop terminal.');
  return { address: `http://${parts.join('.')}:${port}`, pairingCode: code };
}

export function laptopTransferMessage(progress: LaptopTransferProgress): string | null {
  if (progress.phase === 'verifying')
    return 'Verifying the state package and installing it for offline use…';
  if (progress.phase !== 'downloading' || progress.totalBytes <= 0) return null;
  const received = Math.min(progress.receivedBytes, progress.totalBytes);
  return `Downloading state: ${(received / 1048576).toFixed(1)} of ${(progress.totalBytes / 1048576).toFixed(1)} MiB (${Math.floor((received / progress.totalBytes) * 100)}%). Keep the app open.`;
}
