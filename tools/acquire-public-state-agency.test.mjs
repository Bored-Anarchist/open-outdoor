import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acquirePublicAgency } from './acquire-public-state-agency.mjs';

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
