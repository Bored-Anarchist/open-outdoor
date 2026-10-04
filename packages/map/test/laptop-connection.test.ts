import { describe, expect, it } from 'vitest';
import { laptopTransferMessage, validateLaptopConnection } from '../src/laptop-connection';

const code = 'a'.repeat(32);
describe('local laptop connection', () => {
  it('normalizes pasted addresses and codes', () => {
    expect(
      validateLaptopConnection(' http://192.168.1.20:8765/ ', ` ${code.toUpperCase()} `),
    ).toEqual({ address: 'http://192.168.1.20:8765', pairingCode: code });
    for (const address of [
      'http://10.0.0.1:1024',
      'http://172.16.0.1:65535',
      'http://172.31.0.1:8765',
      'http://100.64.0.0:8765',
      'http://100.96.1.20:8765',
      'http://100.127.255.255:8765',
      'http://169.254.1.20:8765',
      'http://198.51.100.20:8765',
      'http://203.0.113.20:8765',
      'http://100.63.255.255:8765',
      'http://100.128.0.1:8765',
      'http://172.32.1.1:8765',
      'http://172.15.1.1:8765',
    ])
      expect(validateLaptopConnection(address, code).address).toBe(address);
  });
  it.each([
    'https://192.168.1.20:8765',
    'http://example.com:8765',
    'http://127.0.0.1:8765',
    'http://127.1.2.3:8765',
    'http://0.0.0.0:8765',
    'http://0.1.2.3:8765',
    'http://224.0.0.1:8765',
    'http://239.255.255.255:8765',
    'http://240.0.0.1:8765',
    'http://255.255.255.255:8765',
    'http://192.168.999.1:8765',
    'http://010.0.0.1:8765',
    'http://100.96.256.1:8765',
    'http://100.096.1.20:8765',
    'http://192.168.1.20:80',
    'http://192.168.1.20:65536',
    'http://user@192.168.1.20:8765',
    'http://192.168.1.20:8765/path',
    'http://192.168.1.20:8765?code=secret',
    'http://192.168.1.20:8765#fragment',
    'http://0xc0a80114:8765',
  ])('rejects unusable, ambiguous or credential-bearing address %s', (address) => {
    expect(() => validateLaptopConnection(address, code)).toThrow('laptop address');
  });
  it('normalizes IPv6 literals, including Wi-Fi scopes and translated IPv4 tails', () => {
    for (const [input, expected] of [
      ['http://[2001:0DB8:0:0:0:0:0:20]:8765/', 'http://[2001:db8::20]:8765'],
      ['http://[fd12:3456::20]:8765', 'http://[fd12:3456::20]:8765'],
      ['http://[fe80::20]:8765', 'http://[fe80::20]:8765'],
      ['http://[fe80::20%25en0]:8765', 'http://[fe80::20%25en0]:8765'],
      ['http://[64:ff9b::192.0.2.20]:8765', 'http://[64:ff9b::c000:214]:8765'],
      ['http://[ff1::20]:8765', 'http://[ff1::20]:8765'],
    ])
      expect(validateLaptopConnection(input!, code).address).toBe(expected);
  });
  it.each([
    'http://[::]:8765',
    'http://[::1]:8765',
    'http://[ff02::1]:8765',
    'http://[::ffff:127.0.0.1]:8765',
    'http://[::ffff:198.51.100.20]:8765',
    'http://[::192.168.1.20]:8765',
    'http://2001:db8::20:8765',
    'http://[example.com]:8765',
    'http://[2001:db8::20%25en0]:8765',
    'http://[fe80::20%en0]:8765',
    'http://[fe80::20%25bad%25scope]:8765',
    'http://[fe8::20%25en0]:8765',
    'http://[2001::db8::20]:8765',
    'http://[1:2:3:4:5:6:7:8:9]:8765',
  ])('rejects unusable or ambiguous IPv6 endpoint %s', (address) => {
    expect(() => validateLaptopConnection(address, code)).toThrow('laptop address');
  });
  it.each(['', 'short', 'g'.repeat(32), 'a'.repeat(31), 'a'.repeat(33)])(
    'rejects invalid pairing codes',
    (value) => {
      expect(() => validateLaptopConnection('http://192.168.1.20:8765', value)).toThrow(
        'pairing code',
      );
    },
  );
  it('shows bounded byte progress, verification, and no idle announcement', () => {
    expect(
      laptopTransferMessage({ phase: 'downloading', receivedBytes: 1048576, totalBytes: 2097152 }),
    ).toContain('1.0 of 2.0 MiB (50%)');
    expect(
      laptopTransferMessage({ phase: 'downloading', receivedBytes: 3145728, totalBytes: 2097152 }),
    ).toContain('(100%)');
    expect(
      laptopTransferMessage({ phase: 'verifying', receivedBytes: 0, totalBytes: 0 }),
    ).toContain('Verifying');
    expect(laptopTransferMessage({ phase: 'idle', receivedBytes: 0, totalBytes: 0 })).toBeNull();
  });
});
