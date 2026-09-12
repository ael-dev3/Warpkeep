// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseExistingUpdateSchema, updateDigest } from '../scripts/sealed-realms-existing-update-protocol.mjs';
const bytes = (value: unknown) => Buffer.from(JSON.stringify(value));
const capture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/existing-update-definitions-2.6.1/${name}.schema.json`, import.meta.url), 'utf8'));
const policy = 'warpkeep-raw-module-v9-no-views-rls-defaults-v1';
describe('existing-update complete definition policy', () => {
  it.each(['g002', 'ptr'])('accepts actual %s additive A to B and identical-definition replacements', lane => {
    const old = parseExistingUpdateSchema(bytes(capture(`${lane}.a`)));
    const candidate = parseExistingUpdateSchema(bytes(capture(`${lane}.b`)));
    expect(candidate).toHaveProperty('definitionPolicy', policy);
    expect(candidate.names.length).toBeGreaterThan(old.names.length);
    for (const name of old.names) expect(candidate.tableSchemas[name]).toBe(old.tableSchemas[name]);
    expect(parseExistingUpdateSchema(bytes(capture(`${lane}.b`)))).toEqual(candidate);
  });
  it.each([
    (x: any) => { x.misc_exports.push({ View: { name: 'hidden' } }); },
    (x: any) => { x.row_level_security.push({ sql: 'SELECT * FROM gameplay04_keep_v1' }); },
    (x: any) => { x.misc_exports.push({ ColumnDefaultValue: { table: 'gameplay04_keep_v1', col_id: 0, value: [] } }); },
    (x: any) => { x.misc_exports.push({ FutureMigrationHook: {} }); },
    (x: any) => { x.misc_exports[0].View = {}; },
    (x: any) => { x.misc_exports[0].Procedure.hidden_migration = {}; },
    (x: any) => { x.hidden_migration = {}; },
    (x: any) => { delete x.row_level_security; },
    (x: any) => { x.row_level_security = null; },
    (x: any) => { x.typespace.hidden_migration = {}; },
    (x: any) => { x.reducers[0].update_hook = true; },
    (x: any) => { x.types[0].migration = true; },
  ])('rejects non-table hidden/unknown definition state %#', mutate => {
    const source = capture('ptr.b');
    const changed = structuredClone(source); mutate(changed);
    expect(changed.tables).toEqual(source.tables);
    expect(() => parseExistingUpdateSchema(bytes(changed))).toThrow('SEALED_REALMS_EXISTING_UPDATE_PROTOCOL_INVALID');
  });
  it('allows changed procedures and reducers while binding their complete description', () => {
    const source = capture('ptr.b'); const changed = structuredClone(source);
    changed.misc_exports[0].Procedure.name = 'new_application_procedure';
    changed.reducers[0].name = 'new_application_reducer';
    const old = parseExistingUpdateSchema(bytes(source)), candidate = parseExistingUpdateSchema(bytes(changed));
    expect(candidate.tableSchemas).toEqual(old.tableSchemas);
    expect(candidate.digest).not.toBe(old.digest);
    expect(candidate.digest).toBe(updateDigest({ definitionPolicy: policy, definition: changed }));
  });
});
