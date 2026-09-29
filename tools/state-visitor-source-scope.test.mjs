import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertVisitorSource, visitorSourceExclusion } from './state-visitor-source-scope.mjs';
import { acquirePublicAgency } from './acquire-public-state-agency.mjs';
import { stageApprovedFeed } from './state-agency-feeds.mjs';

test('excluded purposes and known inventory, raster and planning sources fail before acquisition', async () => {
  const sources = [
    ...['forestry-inventory', 'land-cover', 'planning'].map((datasetPurpose) => ({
      datasetPurpose,
    })),
    {
      url: 'https://services3.arcgis.com/yrIZ0Nv0mSGTWJsH/arcgis/rest/services/Eco_Inventory_view/FeatureServer/68',
    },
    { url: 'https://www.fs.usda.gov/rds/archive/catalog/RDS-2017-0025' },
    { url: 'https://www.fs.usda.gov/rds/archive/catalog/RDS-2019-0038' },
    { url: 'https://data.fs.usda.gov/geodata/rastergateway/treecanopycover/' },
    { url: 'https://www.ncmhtd.com/ncfs/ncfap/' },
    {
      sourceUrl:
        'https://ncnhde.natureserve.org/arcgis/rest/services/NC_Public/Managed_Areas/MapServer/0',
    },
  ];
  for (const source of sources) {
    assert.throws(() => assertVisitorSource(source), /outside visitor scope/);
    await assert.rejects(acquirePublicAgency(source, []), /outside visitor scope/);
    await assert.rejects(stageApprovedFeed(source, {}), /outside visitor scope/);
  }
});

test('forest boundaries and actual visitor trails do not inherit a planning or inventory exclusion', () => {
  for (const url of [
    'https://services.example/NCFS_StateForests/FeatureServer/0',
    'https://services.example/SCORP_NonMoto_Trails_Master/FeatureServer/0',
    'https://services.example/State_Owned_Land_NC_Latest_02/FeatureServer/0',
  ])
    assert.equal(visitorSourceExclusion({ url, datasetPurpose: 'managed-land-boundaries' }), null);
});
