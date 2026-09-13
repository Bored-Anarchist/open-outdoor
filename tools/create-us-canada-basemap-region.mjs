import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath || process.argv.length !== 4) {
  throw new Error(
    'Usage: node tools/create-us-canada-basemap-region.mjs INPUT.geojson OUTPUT.geojson',
  );
}

const expectedInputSha256 = 'b8d421aca6e9e08e8cdf09cc26af111cc3e0deba4fe915611d58ade71e8a4db0';
const expectedOutputSha256 = '42b35d623ae550ea2be14759061fc4611f32ed97f1240acf7a9ab59b0df89e51';
const inputBytes = await readFile(inputPath);
if (createHash('sha256').update(inputBytes).digest('hex') !== expectedInputSha256) {
  throw new Error('Natural Earth map-unit input does not match the pinned SHA-256');
}

const source = JSON.parse(inputBytes.toString('utf8'));
if (source.type !== 'FeatureCollection' || !Array.isArray(source.features)) {
  throw new Error('Natural Earth map-unit input is not a GeoJSON FeatureCollection');
}
const selected = source.features.filter((feature) =>
  ['US1', 'CAN'].includes(feature.properties?.SOV_A3),
);
const selectedNames = selected.map((feature) => feature.properties?.NAME_LONG).sort();
const expectedNames = [
  'American Samoa',
  'Canada',
  'Guam',
  'Northern Mariana Islands',
  'Puerto Rico',
  'United States',
  'United States Virgin Islands',
];
if (JSON.stringify(selectedNames) !== JSON.stringify(expectedNames)) {
  throw new Error('Pinned Natural Earth input has an unexpected US/Canada map-unit inventory');
}

const polygons = [];
for (const feature of selected) {
  if (feature.geometry?.type === 'Polygon') polygons.push(feature.geometry.coordinates);
  else if (feature.geometry?.type === 'MultiPolygon') {
    polygons.push(...feature.geometry.coordinates);
  } else {
    throw new Error('Selected map unit has an unsupported geometry type');
  }
}

// Natural Earth omits these very small US possessions at 1:50m. Each small
// square selects the z7-z9 tile containing the island without turning a broad
// ocean bounding box into regional coverage.
const minorOutlyingIslands = [
  ['Baker Island', -176.48, 0.19],
  ['Howland Island', -176.62, 0.81],
  ['Jarvis Island', -159.996, -0.374],
  ['Johnston Atoll', -169.53, 16.73],
  ['Kingman Reef', -162.39, 6.4],
  ['Midway Atoll', -177.36, 28.21],
  ['Navassa Island', -75.01, 18.41],
  ['Palmyra Atoll', -162.08, 5.88],
  ['Wake Island', 166.62, 19.29],
];
for (const [, longitude, latitude] of minorOutlyingIslands) {
  const margin = 0.12;
  polygons.push([
    [
      [longitude - margin, latitude - margin],
      [longitude + margin, latitude - margin],
      [longitude + margin, latitude + margin],
      [longitude - margin, latitude + margin],
      [longitude - margin, latitude - margin],
    ],
  ]);
}

const outputBytes = Buffer.from(
  JSON.stringify({ type: 'MultiPolygon', coordinates: polygons }) + '\n',
);
const outputSha256 = createHash('sha256').update(outputBytes).digest('hex');
if (outputSha256 !== expectedOutputSha256) {
  throw new Error('Generated US/Canada extraction boundary is not byte-reproducible');
}
await writeFile(outputPath, outputBytes, { flag: 'wx' });
console.log(
  `Generated ${polygons.length} extraction polygons for US, Canada, and all US territories (${outputSha256}).`,
);
