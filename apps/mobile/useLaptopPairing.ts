import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  parseDiscoveredLaptops,
  parseLaptopPairingQr,
  type DiscoveredLaptop,
} from '@open-outdoor/map';
import { nativeSpikes } from './nativeSpikes';

export function useLaptopPairing(
  enabled: boolean,
  connect: (address: string, code: string) => Promise<boolean>,
  onAddress: (address: string) => void,
) {
  const [laptops, setLaptops] = useState<readonly DiscoveredLaptop[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [status, setStatus] = useState('');
  const generation = useRef(0);
  const active = useRef(enabled);
  const scanActive = useRef(false);
  const callbacks = useRef({ connect, onAddress });
  callbacks.current = { connect, onAddress };
  active.current = enabled;
  const available = nativeSpikes.laptopPairingAvailable;
  const stop = useCallback(() => {
    generation.current += 1;
    scanActive.current = false;
    if (available) {
      void nativeSpikes.cancelLaptopDiscovery().catch(() => {});
      void nativeSpikes.cancelLaptopPairingQr().catch(() => {});
    }
  }, [available]);
  const discover = useCallback(async () => {
    if (!active.current || !available || scanActive.current) return;
    const request = ++generation.current;
    setDiscovering(true);
    setLaptops([]);
    setStatus('Searching for nearby Open Outdoor laptops…');
    try {
      const values = parseDiscoveredLaptops(await nativeSpikes.discoverLaptopPackages());
      if (request !== generation.current || !active.current) return;
      setLaptops(values);
      setStatus(
        values.length
          ? 'Nearby laptops found. Scan the QR code on your laptop to pair.'
          : 'No laptop found. Start its package server, then search again or scan its QR code.',
      );
    } catch {
      if (request === generation.current && active.current)
        setStatus(
          'Nearby search is unavailable. Scan the laptop QR code or enter its address manually.',
        );
    } finally {
      if (request === generation.current && active.current) setDiscovering(false);
    }
  }, [available]);
  const scan = useCallback(async () => {
    if (!active.current || !available || scanActive.current) return;
    scanActive.current = true;
    const request = ++generation.current;
    setDiscovering(false);
    setScanning(true);
    setStatus('Scan the QR code on the laptop pairing page.');
    void nativeSpikes.cancelLaptopDiscovery().catch(() => {});
    try {
      const raw = await nativeSpikes.scanLaptopPairingQr();
      if (request !== generation.current || !active.current) return;
      if (raw === null) {
        setStatus('Scan cancelled. You can scan again or enter the address manually.');
        return;
      }
      const pair = parseLaptopPairingQr(raw);
      callbacks.current.onAddress(pair.address);
      setStatus('');
      await callbacks.current.connect(pair.address, pair.pairingCode);
    } catch (error) {
      if (request === generation.current && active.current)
        setStatus(
          error instanceof Error
            ? error.message
            : 'Could not scan the pairing QR code. Try manual entry.',
        );
    } finally {
      if (request === generation.current) {
        scanActive.current = false;
        if (active.current) setScanning(false);
      }
    }
  }, [available]);
  useEffect(() => {
    setDiscovering(false);
    setScanning(false);
    setLaptops([]);
    setStatus('');
    if (enabled && available) void discover();
    return stop;
  }, [enabled, available, discover, stop]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => {
      // Permission dialogs make iOS inactive; only real backgrounding cancels pairing.
      if (state !== 'background') return;
      stop();
      setDiscovering(false);
      setScanning(false);
      setLaptops([]);
      if (active.current)
        setStatus('Pairing stopped in the background. Search again when you return.');
    });
    return () => listener.remove();
  }, [stop]);
  return { available, laptops, discovering, scanning, status, discover, scan };
}
