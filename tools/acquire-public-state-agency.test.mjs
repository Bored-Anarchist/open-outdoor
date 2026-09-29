import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acquirePublicAgency } from './acquire-public-state-agency.mjs';
import { readFileSync } from 'node:fs';
import { conditionalPublicPolicy } from './conditional-public-agency.mjs';

test('conditional clearance is limited to exact noncommercial sources and filtered Minnesota fields', () => {
  const config = JSON.parse(
    readFileSync(new URL('../config/public-state-agency-sources.json', import.meta.url)),
  );
  const hiking = config.sources.find((s) => s.id === 'mn-dnr-hiking');
  const virginia = config.sources.find((s) => s.id === 'va-dcr-trails');
  assert.ok(conditionalPublicPolicy(hiking));
  assert.ok(conditionalPublicPolicy(virginia));
  for (const source of config.sources.filter((s) => s.distributionScope === 'noncommercial'))
    assert.ok(conditionalPublicPolicy(source));
  for (const patch of [
    { where: '1=1' },
    { fields: ['*'] },
    { distributionScope: 'commercial' },
    { url: hiking.url.replace('/0', '/1') },
  ])
    assert.equal(conditionalPublicPolicy({ ...hiking, ...patch }), null);
  assert.equal(conditionalPublicPolicy({ ...virginia, distributionScope: 'commercial' }), null);
});

test('public acquisition rejects permission-held and conditional feeds before network or staging', async () => {
  const source = {
    id: 'synthetic',
    state: 'CT',
    url: 'https://example.invalid/0',
    basisUrl: 'https://example.invalid/catalog',
  };
  for (const rightsStatus of ['Unconfirmed', 'Permission required', 'Restricted', 'Conditional']) {
    await assert.rejects(
      acquirePublicAgency(source, [{ state: 'CT', url: source.basisUrl, rightsStatus }]),
      /lacks a Supported rights decision/,
    );
  }
  await assert.rejects(
    acquirePublicAgency(source, [{ state: 'NY', url: source.basisUrl, rightsStatus: 'Supported' }]),
    /lacks a Supported rights decision/,
  );
});
