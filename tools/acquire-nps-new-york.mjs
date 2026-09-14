#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, isAbsolute, join, resolve } from 'node:path';

const API_ROOT = 'https://developer.nps.gov/api/v1';
const STATE_CODE = 'NY';

function argumentsByName(values) {
  const parsed = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const name = values[index];
    const value = values[index + 1];
    if (!name?.startsWith('--') || value === undefined || value.startsWith('--')) {
      throw new Error(`invalid argument near ${name ?? '<end>'}`);
    }
    parsed.set(name.slice(2), value);
  }
  return parsed;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

const args = argumentsByName(process.argv.slice(2));
const outputArgument = args.get('output');
if (!outputArgument) {
  throw new Error(
    'usage: pnpm nps:acquire:ny -- --output <directory> [--generated-at <normalized UTC>]',
  );
}
const outputDirectory = resolve(outputArgument);
if (!isAbsolute(outputDirectory)) throw new Error('output must resolve to an absolute path');
const retrievedAt = args.get('generated-at') ?? new Date().toISOString();
if (new Date(retrievedAt).toISOString() !== retrievedAt) {
  throw new Error('generated-at must be a normalized UTC timestamp');
}
const apiKey = process.env.NPS_API_KEY || 'DEMO_KEY';

async function fetchJson(url) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Open-Outdoor private catalog acquisition',
        'X-Api-Key': apiKey,
      },
      signal: AbortSignal.timeout(60_000),
    });
    if (response.ok) return response.json();
    if (response.status !== 429 || attempt === 4) {
      throw new Error(`NPS request failed (${response.status}): ${url}`);
    }
    const retryAfter = Number(response.headers.get('retry-after'));
    const delayMilliseconds = Number.isFinite(retryAfter)
      ? Math.max(1_000, retryAfter * 1_000)
      : 1_500 * 2 ** attempt;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, delayMilliseconds));
  }
  throw new Error(`NPS request retry loop ended unexpectedly: ${url}`);
}

async function fetchEndpoint(endpoint) {
  const url = new URL(`${API_ROOT}/${endpoint}`);
  url.searchParams.set('stateCode', STATE_CODE);
  url.searchParams.set('limit', '500');
  const document = await fetchJson(url);
  if (!Array.isArray(document.data)) throw new Error(`${endpoint} response is missing data`);
  return document.data;
}

const rawParks = await fetchEndpoint('parks');
const rawCampgrounds = await fetchEndpoint('campgrounds');
const rawAlerts = await fetchEndpoint('alerts');

const parks = rawParks
  .map((item) => ({
    id: String(item.id),
    parkCode: String(item.parkCode),
    fullName: String(item.fullName),
    latitude: String(item.latitude ?? ''),
    longitude: String(item.longitude ?? ''),
    lastIndexedDate: item.lastIndexedDate ? String(item.lastIndexedDate) : undefined,
    url: item.url ? String(item.url) : undefined,
  }))
  .sort((left, right) => left.parkCode.localeCompare(right.parkCode));

const campgrounds = rawCampgrounds
  .map((item) => ({
    id: String(item.id),
    parkCode: String(item.parkCode),
    name: String(item.name),
    latitude: String(item.latitude ?? ''),
    longitude: String(item.longitude ?? ''),
    lastIndexedDate: item.lastIndexedDate ? String(item.lastIndexedDate) : undefined,
    url: item.url ? String(item.url) : undefined,
  }))
  .sort((left, right) => left.id.localeCompare(right.id));

const alerts = rawAlerts
  .map((item) => ({
    id: String(item.id),
    parkCode: String(item.parkCode),
    title: String(item.title),
    category: item.category ? String(item.category) : undefined,
    lastIndexedDate: item.lastIndexedDate ? String(item.lastIndexedDate) : undefined,
    url: item.url ? String(item.url) : undefined,
  }))
  .sort((left, right) => left.id.localeCompare(right.id));

const boundaries = [];
for (const park of parks) {
  const document = await fetchJson(
    `${API_ROOT}/mapdata/parkboundaries/${encodeURIComponent(park.parkCode)}`,
  );
  const features = Array.isArray(document.features)
    ? document.features
    : Array.isArray(document.data)
      ? document.data
      : [];
  for (const [index, feature] of features.entries()) {
    if (
      feature?.type !== 'Feature' ||
      (feature.geometry?.type !== 'Polygon' && feature.geometry?.type !== 'MultiPolygon')
    ) {
      continue;
    }
    boundaries.push({
      type: 'Feature',
      id: `${park.parkCode}:${index + 1}`,
      properties: { parkCode: park.parkCode, fullName: park.fullName },
      geometry: feature.geometry,
    });
  }
}
boundaries.sort((left, right) => String(left.id).localeCompare(String(right.id)));

const snapshot = {
  schemaVersion: 1,
  stateCode: STATE_CODE,
  retrievedAt,
  parks,
  campgrounds,
  alerts,
  boundaries,
};
const snapshotBytes = Buffer.from(`${stableJson(snapshot)}\n`);
const endpoints = [
  `${API_ROOT}/parks?stateCode=NY`,
  `${API_ROOT}/campgrounds?stateCode=NY`,
  `${API_ROOT}/alerts?stateCode=NY`,
  `${API_ROOT}/mapdata/parkboundaries/{parkCode}`,
];
const manifest = {
  schemaVersion: 1,
  sourceId: 'nps-new-york',
  publisher: 'National Park Service',
  retrievedAt,
  stateCode: STATE_CODE,
  authentication: process.env.NPS_API_KEY ? 'NPS_API_KEY environment variable' : 'DEMO_KEY',
  apiKeyStored: false,
  endpoints,
  counts: {
    parks: parks.length,
    campgrounds: campgrounds.length,
    alerts: alerts.length,
    boundaries: boundaries.length,
  },
  artifact: {
    file: 'nps-new-york.json',
    bytes: snapshotBytes.byteLength,
    sha256: sha256(snapshotBytes),
  },
  termsUrl: 'https://www.nps.gov/aboutus/disclaimer.htm',
};

await mkdir(outputDirectory, { recursive: false });
await writeFile(join(outputDirectory, 'nps-new-york.json'), snapshotBytes, { flag: 'wx' });
await writeFile(join(outputDirectory, 'manifest.json'), `${stableJson(manifest)}\n`, {
  flag: 'wx',
});
process.stdout.write(
  `${JSON.stringify({ outputDirectory, snapshot: basename('nps-new-york.json'), counts: manifest.counts }, null, 2)}\n`,
);
