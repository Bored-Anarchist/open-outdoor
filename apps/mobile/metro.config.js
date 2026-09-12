const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
if (!config.resolver.assetExts.includes('geojson')) {
  config.resolver.assetExts.push('geojson');
}

module.exports = config;
