import { assertCoordinate, type Coordinate } from '@open-outdoor/shared';
import { RouteFileError, type ImportedRoute } from './index.js';
import { checkImportLimits, importLimits, type ImportLimits } from './selected-import.js';

// FIT protocol: https://developer.garmin.com/fit/protocol/
export function fitCrc(bytes: Uint8Array): number {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
  }
  return crc;
}
function invalid(message: string): never {
  throw new RouteFileError('MALFORMED_INPUT', message);
}
interface Field {
  number: number;
  size: number;
  type: number;
}
interface Definition {
  global: number;
  little: boolean;
  fields: Field[];
  developerBytes: number;
}

/** Decode position-bearing record messages; unknown fields/messages are safely skipped. */
export function importFit(bytes: Uint8Array, limits: ImportLimits = importLimits): ImportedRoute {
  checkImportLimits(bytes.length, limits);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const header = bytes[0];
  if (
    (header !== 12 && header !== 14) ||
    bytes.length < header + 2 ||
    new TextDecoder().decode(bytes.subarray(8, 12)) !== '.FIT'
  )
    invalid('invalid FIT header');
  if (bytes[1]! >>> 4 > 2)
    throw new RouteFileError('FORMAT_UNSUPPORTED', 'unsupported FIT protocol');
  const end = header + view.getUint32(4, true);
  if (end + 2 !== bytes.length) invalid('FIT data length mismatch');
  if (header === 14 && view.getUint16(12, true) !== 0 && fitCrc(bytes.subarray(0, 14)) !== 0)
    invalid('FIT header CRC mismatch');
  if (fitCrc(bytes) !== 0) invalid('FIT file CRC mismatch');
  let cursor = header;
  const definitions = new Map<number, Definition>();
  let timestamp: number | null = null;
  const coordinates: Coordinate[] = [];
  const timestamps: (string | null)[] = [];
  const need = (count: number): void => {
    if (cursor + count > end) invalid('truncated FIT message');
  };
  while (cursor < end) {
    const record = bytes[cursor++]!;
    const compressed = (record & 0x80) !== 0;
    const local = compressed ? (record >>> 5) & 3 : record & 15;
    if (!compressed && record & 0x10) invalid('reserved FIT header bit');
    if (!compressed && record & 0x40) {
      need(5);
      if (bytes[cursor] !== 0 || (bytes[cursor + 1] !== 0 && bytes[cursor + 1] !== 1))
        invalid('invalid FIT architecture');
      const little = bytes[cursor + 1] === 0;
      const global = view.getUint16(cursor + 2, little);
      const count = bytes[cursor + 4]!;
      cursor += 5;
      need(count * 3);
      const fields: Field[] = [];
      for (let index = 0; index < count; index++) {
        const field = {
          number: bytes[cursor]!,
          size: bytes[cursor + 1]!,
          type: bytes[cursor + 2]!,
        };
        if (!field.size || fields.some((item) => item.number === field.number))
          invalid('invalid FIT field definition');
        fields.push(field);
        cursor += 3;
      }
      let developerBytes = 0;
      if (record & 0x20) {
        need(1);
        const developers = bytes[cursor++]!;
        need(developers * 3);
        for (let index = 0; index < developers; index++) {
          developerBytes += bytes[cursor + 1]!;
          cursor += 3;
        }
      }
      definitions.set(local, { global, little, fields, developerBytes });
      continue;
    }
    if (!compressed && record & 0x20) invalid('reserved FIT data bit');
    const definition = definitions.get(local);
    if (!definition) invalid('FIT data precedes definition');
    let recordTimestamp: number | null = null;
    if (compressed) {
      if (
        timestamp === null ||
        !definition.fields.some(
          (field) => field.number === 253 && field.type === 0x86 && field.size === 4,
        )
      )
        invalid('compressed FIT timestamp lacks base');
      const offset = record & 31;
      timestamp = timestamp - (timestamp % 32) + offset + (offset < timestamp % 32 ? 32 : 0);
    }
    if (compressed) recordTimestamp = timestamp;
    let latitude: number | null = null;
    let longitude: number | null = null;
    for (const field of definition.fields) {
      if (compressed && field.number === 253) continue;
      need(field.size);
      if (field.number === 253 && field.type === 0x86 && field.size === 4) {
        const value = view.getUint32(cursor, definition.little);
        timestamp = value === 0xffffffff ? null : value;
        recordTimestamp = timestamp;
      }
      if (definition.global === 20 && (field.number === 0 || field.number === 1)) {
        if (field.type !== 0x85 || field.size !== 4) invalid('invalid FIT position field');
        const value = view.getInt32(cursor, definition.little);
        const degrees = value === 0x7fffffff ? null : value * (180 / 2 ** 31);
        if (field.number === 0) latitude = degrees;
        else longitude = degrees;
      }
      cursor += field.size;
    }
    need(definition.developerBytes);
    cursor += definition.developerBytes;
    if (definition.global === 20 && latitude !== null && longitude !== null) {
      if (coordinates.length >= limits.maximumPoints)
        throw new RouteFileError('INPUT_LIMIT_EXCEEDED', 'FIT point limit exceeded');
      try {
        coordinates.push(assertCoordinate([longitude, latitude]));
      } catch {
        invalid('FIT position out of range');
      }
      timestamps.push(
        recordTimestamp === null
          ? null
          : new Date(Date.UTC(1989, 11, 31) + recordTimestamp * 1000).toISOString(),
      );
    }
  }
  if (coordinates.length < 2)
    throw new RouteFileError('NO_USABLE_GEOMETRY', 'FIT file has no usable route');
  return { name: null, coordinates, timestamps, sourceFormat: 'fit', private: true };
}
