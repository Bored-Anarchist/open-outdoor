const { existsSync } = require('node:fs');
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
for (const extension of ['geojson', 'pmtiles']) {
  if (!config.resolver.assetExts.includes(extension)) {
    config.resolver.assetExts.push(extension);
  }
}

const mapDataAlias = '@open-outdoor/mobile-map-data';
const privateMapData = process.env.OPEN_OUTDOOR_PRIVATE_MAP_DATA === '1';
const selectedMapDataModule = path.resolve(
  __dirname,
  privateMapData ? '.private-map-data/mapData.private.ts' : 'mapData.public.ts',
);
if (privateMapData && !existsSync(selectedMapDataModule)) {
  throw new Error(
    'OPEN_OUTDOOR_PRIVATE_MAP_DATA=1 requires pnpm map:private:stage before Metro starts.',
  );
}
config.resolver.resolveRequest = (context, moduleName, platform) =>
  context.resolveRequest(
    context,
    moduleName === mapDataAlias ? selectedMapDataModule : moduleName,
    platform,
  );

module.exports = config;
