import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  ALPHA_V10_ACTIVATION_COMPONENTS,
  ALPHA_V10_ACTIVATION_SCHEMA_PROTOCOL_VERSION,
} from '../src/alphaV10ActivationPolicy';

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

test('v10 activation identity pins Water and Stone policy', () => {
  assert.equal(ALPHA_V10_ACTIVATION_SCHEMA_PROTOCOL_VERSION, 10);
  assert.deepEqual(Object.keys(ALPHA_V10_ACTIVATION_COMPONENTS), ['water', 'stone']);
  assert.equal(ALPHA_V10_ACTIVATION_COMPONENTS.water.layoutCount, 1);
  assert.equal(ALPHA_V10_ACTIVATION_COMPONENTS.water.environmentCount, 1);
  assert.equal(ALPHA_V10_ACTIVATION_COMPONENTS.stone.siteCount, 96);
  assert.match(ALPHA_V10_ACTIVATION_COMPONENTS.water.layoutDigest, /^[a-f0-9]{64}$/);
  assert.match(ALPHA_V10_ACTIVATION_COMPONENTS.stone.siteCatalogDigest, /^[a-f0-9]{64}$/);
});

test('admin_get_alpha_status_v10 is Hermes-only, aggregate-only, and read-only', () => {
  const status = source('../src/reducers/alphaStatusV10.ts');
  const index = source('../src/index.ts');

  assert.match(status, /name: 'admin_get_alpha_status_v10'/);
  assert.match(status, /ctx => ctx\.withTx\(tx => \{\s*requireAdmin\(tx\);/);
  assert.doesNotMatch(status, /\.(?:insert|update|delete)\s*\(/);
  assert.doesNotMatch(
    status,
    /(?:fid|castleId|siteId|startedAt|returnsAt|identity|username|balance|rowDump)\s*:/i,
  );
  assert.match(index, /export \{ adminGetAlphaStatusV10 \} from '.\/reducers\/alphaStatusV10';/);
});
