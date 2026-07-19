import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  ALPHA_ACTIVATION_COMPONENTS,
  ALPHA_ACTIVATION_SCHEMA_PROTOCOL_VERSION,
} from '../src/alphaActivationPolicy';

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

function section(text: string, startNeedle: string): string {
  const start = text.indexOf(startNeedle);
  assert.notEqual(start, -1, `missing source section: ${startNeedle}`);
  return text.slice(start);
}

test('v8 activation identity pins every canonical catalog and expedition policy', () => {
  assert.equal(ALPHA_ACTIVATION_SCHEMA_PROTOCOL_VERSION, 8);
  assert.deepEqual(Object.keys(ALPHA_ACTIVATION_COMPONENTS), [
    'gold',
    'forest',
    'food',
    'wood',
  ]);
  assert.equal(ALPHA_ACTIVATION_COMPONENTS.gold.siteCount, 24);
  assert.equal(ALPHA_ACTIVATION_COMPONENTS.forest.layoutCount, 1);
  assert.equal(ALPHA_ACTIVATION_COMPONENTS.forest.instanceCount, 210);
  assert.equal(ALPHA_ACTIVATION_COMPONENTS.food.siteCount, 96);
  assert.equal(ALPHA_ACTIVATION_COMPONENTS.wood.siteCount, 96);
  for (const digest of [
    ALPHA_ACTIVATION_COMPONENTS.gold.siteCatalogDigest,
    ALPHA_ACTIVATION_COMPONENTS.forest.layoutDigest,
    ALPHA_ACTIVATION_COMPONENTS.forest.assetCatalogDigest,
    ALPHA_ACTIVATION_COMPONENTS.food.siteCatalogDigest,
    ALPHA_ACTIVATION_COMPONENTS.wood.siteCatalogDigest,
  ]) assert.match(digest, /^[a-f0-9]{64}$/);
});

test('admin_get_alpha_status_v8 is Hermes-only, aggregate-only, and read-only', () => {
  const reducer = source('../src/reducers/alphaStatus.ts');
  const status = section(reducer, 'export const adminGetAlphaStatusV8');
  const index = source('../src/index.ts');
  const schema = source('../src/schema.ts');

  assert.match(status, /name: 'admin_get_alpha_status_v8'/);
  assert.match(status, /ctx => ctx\.withTx\(tx => \{\s*requireAdmin\(tx\);/);
  assert.equal(status.match(/tx\.db\.[A-Za-z0-9]+\.count\(\)/g)?.length, 17);
  assert.equal(status.match(/tx\.db\.[A-Za-z0-9]+\.iter\(\)/g)?.length, 5);
  assert.doesNotMatch(status, /\.(?:find|insert|update|delete)\s*\(/);
  assert.doesNotMatch(
    status,
    /(?:fid|castleId|siteId|timestamp|startedAt|returnsAt|identity|username|balance|rowDump)\s*:/i,
  );
  assert.match(index, /export \{ adminGetAlphaStatusV8 \} from '.\/reducers\/alphaStatus';/);
  assert.match(schema, /'admin_get_alpha_status_v8'/);
  assert.match(source('../src/reducers/admin.ts'), /adminGetAlphaStatusV3/);
  assert.match(source('../src/reducers/resources.ts'), /adminGetAlphaStatusV4/);
});
