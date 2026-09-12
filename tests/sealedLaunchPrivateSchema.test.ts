// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { verifyGenesis002PrivateSchemaSources } from '../scripts/verify-0.4.0-sealed-launch.mjs';
const root = resolve(import.meta.dirname, '..');
const schema = readFileSync(resolve(root, 'spacetimedb/genesis002/src/schema.ts'), 'utf8');
const gameplay = readFileSync(resolve(root, 'spacetimedb/genesis002/src/gameplaySchema.ts'), 'utf8');
it('accepts the exact thirty-table closed G002 schema', () => {
  expect(() => verifyGenesis002PrivateSchemaSources(schema, gameplay)).not.toThrow();
});
it.each([
  ['remove privacy wrapper', schema.replace('allowedFid: makeGenesis002PrivateTable(allowedFid)', 'allowedFid')],
  ['public inherited tables', schema.replace("tableAccess: { tag: 'Private' }", "tableAccess: { tag: 'Public' }")],
  ['missing gameplay table', schema.replace('  gameplay04KeepV1,\n  gameplay04WorkerV1,', '  gameplay04WorkerV1,')],
  ['additional registration', schema.replace('const genesis002Tables = {', 'const genesis002Tables = {\n  extraTable,')],
  ['wrong table count', schema.replace('PRIVATE_TABLE_COUNT = 30', 'PRIVATE_TABLE_COUNT = 31')],
])('rejects %s', (_name, changed) => {
  expect(changed).not.toBe(schema);
  expect(() => verifyGenesis002PrivateSchemaSources(changed, gameplay)).toThrow('SEALED_LAUNCH_G002_PRIVATE_SCHEMA_INVALID');
});
it.each(['keep', 'worker', 'receipt', 'reservation', 'building', 'project', 'schedule'])('rejects public gameplay %s options', name => {
  const changed = gameplay.replace(`name: 'gameplay04_${name}_v1'`, `public: true, name: 'gameplay04_${name}_v1'`);
  expect(changed).not.toBe(gameplay);
  expect(() => verifyGenesis002PrivateSchemaSources(schema, changed)).toThrow('SEALED_LAUNCH_G002_PRIVATE_SCHEMA_INVALID');
});
