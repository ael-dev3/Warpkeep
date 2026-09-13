// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as definitions from '../scripts/ptr-update-definition-policy.mjs';
const fixture = (name = 'first') =>
  JSON.parse(
    readFileSync(
      new URL(
        `./fixtures/ptr-artifact-description-2.6.1/${name}.json`,
        import.meta.url,
      ),
      'utf8',
    ),
  ).V10;
const bytes = (v: any) => Buffer.from(JSON.stringify(v));
const section = (v: any, k: string) => v.sections.find((s: any) => k in s)?.[k];
const add = (v: any) => {
  const tables = section(v, 'Tables');
  const t = structuredClone(tables[0]);
  t.source_name = 'newTable';
  t.indexes = [];
  t.constraints = [];
  t.sequences = [];
  t.primary_key = [];
  tables.push(t);
  section(v, 'ExplicitNames').entries.push({
    Table: { source_name: 'newTable', canonical_name: 'new_table' },
  });
  return v;
};
describe.each(['ptr', 'g002'] as const)('actual %s RawV10 preservation boundary', lane => {
  const parseDefinition = lane === 'ptr' ? definitions.parsePtrUpdateDefinition : definitions.parseG002UpdateDefinition;
  const compareDefinitions = lane === 'ptr' ? definitions.comparePtrUpdateDefinitions : definitions.compareG002UpdateDefinitions;
  const compare = (candidate: any, prior = fixture()) => compareDefinitions({
    priorServerSchema: bytes(prior), candidateArtifactDefinition: candidate,
  });
  it('uses a fixed realm policy with unchanged normalization and isolated preservation commitments', () => {
    const result = compare(fixture('second'));
    expect(result.profile).toBe(lane === 'ptr' ? 'warpkeep-ptr-raw-v10-stable-row-schema-v1' : 'warpkeep-g002-raw-v10-stable-row-schema-v1');
    expect(parseDefinition(bytes(fixture())).profile).toBe(result.profile);
    expect(result.priorDigest).toBe('b1814f206d207e5fd9737248137e3e657be74312aaa54a89a7dd4c6da02e7304');
    expect(result.candidateDigest).toBe('b1814f206d207e5fd9737248137e3e657be74312aaa54a89a7dd4c6da02e7304');
    if (lane === 'ptr') {
      expect(result.priorPreservationDigest).toBe('fc48dfdd5426c22c1e78ac3158fa05d3105a108a4dd19bf93ae48b75e094f28e');
      expect(result.candidatePreservationDigest).toBe('fc48dfdd5426c22c1e78ac3158fa05d3105a108a4dd19bf93ae48b75e094f28e');
    } else {
      expect(result.priorPreservationDigest).not.toBe('fc48dfdd5426c22c1e78ac3158fa05d3105a108a4dd19bf93ae48b75e094f28e');
      expect(result.candidatePreservationDigest).toBe(result.priorPreservationDigest);
    }
  });
  it('compares independently extracted official schemas and derives frozen full digests', () => {
    const result = compare(fixture('second'));
    expect(result.classification).toBe('tables-preserved');
    expect(result.priorDigest).toBe(result.candidateDigest);
    expect(result.priorPreservationDigest).toBe(
      result.candidatePreservationDigest,
    );
    expect(result.addedTables).toEqual([]);
    expect(Object.isFrozen(result.addedTables)).toBe(true);
  });
  it('accepts official server inner shape only', () => {
    expect(
      parseDefinition(bytes(fixture())).definition.sections.length,
    ).toBeGreaterThan(0);
    expect(() => parseDefinition(bytes({ V10: fixture() }))).toThrow();
  });
  it('allows additions with schedules belonging only to added tables', () => {
    const v = add(fixture());
    section(v, 'Schedules').push({
      source_name: { some: 'new_sched' },
      table_name: 'new_table',
      schedule_at_col: 1,
      function_name: section(v, 'Schedules')[0].function_name,
    });
    const result = compare(v);
    expect(result.classification).toBe('tables-preserved-with-additions');
    expect(result.addedTables).toEqual(['new_table']);
    expect(result.priorDigest).not.toBe(result.candidateDigest);
  });
  it.each(['reducer', 'procedure', 'lifecycle', 'functionType'])(
    'allows %s changes but commits the complete changed definition',
    (kind) => {
      const v = fixture();
      if (kind === 'reducer') section(v, 'Reducers')[0].params.elements = [];
      if (kind === 'procedure')
        section(v, 'Procedures')[0].return_type = { String: [] };
      if (kind === 'lifecycle')
        section(v, 'LifeCycleReducers')[0].function_name = 'changed_function';
      if (kind === 'functionType')
        section(v, 'Typespace').types.push({ Product: { elements: [] } });
      const result = compare(v);
      expect(result.classification).toBe('tables-preserved');
      expect(result.priorDigest).not.toBe(result.candidateDigest);
      expect(result.priorPreservationDigest).toBe(
        result.candidatePreservationDigest,
      );
    },
  );
  it.each([
    'table',
    'index',
    'sequence',
    'schedule',
    'newOldSchedule',
    'rowType',
    'reachableType',
    'typeDeclaration',
    'removedTable',
    'tableName',
    'indexName',
    'policy',
  ])('rejects old %s mutation', (kind) => {
    const v = fixture();
    const tables = section(v, 'Tables');
    const types = section(v, 'Typespace').types;
    if (kind === 'table') tables[0].table_access = { Public: [] };
    if (kind === 'index') tables[0].indexes[0].algorithm = { BTree: [0] };
    if (kind === 'sequence')
      tables.find((t: any) => t.sequences.length).sequences[0].increment = 2;
    if (kind === 'schedule')
      section(v, 'Schedules')[0].function_name = 'changed_function';
    if (kind === 'newOldSchedule')
      section(v, 'Schedules').push({
        source_name: { some: 'new_sched' },
        table_name: section(v, 'ExplicitNames').entries.find(
          (e: any) => e.Table,
        ).Table.canonical_name,
        schedule_at_col: 0,
        function_name: 'changed_function',
      });
    if (kind === 'rowType')
      types[tables[0].product_type_ref].Product.elements[0].algebraic_type = {
        Bool: [],
      };
    if (kind === 'reachableType') {
      const table = tables.find((t: any) =>
        types[t.product_type_ref].Product.elements.some(
          (e: any) => e.algebraic_type.Ref !== undefined,
        ),
      );
      const ref = types[table.product_type_ref].Product.elements.find(
        (e: any) => e.algebraic_type.Ref !== undefined,
      ).algebraic_type.Ref;
      types[ref] = { String: [] };
    }
    if (kind === 'typeDeclaration')
      section(v, 'Types').find(
        (t: any) => t.ty === tables[0].product_type_ref,
      ).custom_ordering = false;
    if (kind === 'removedTable') tables.pop();
    if (kind === 'tableName')
      section(v, 'ExplicitNames').entries.find(
        (e: any) => e.Table,
      ).Table.canonical_name = 'renamed_table';
    if (kind === 'indexName')
      section(v, 'ExplicitNames').entries.push({
        Index: {
          source_name: tables[0].indexes[0].source_name.some,
          canonical_name: 'renamed_index',
        },
      });
    if (kind === 'policy')
      v.sections.push({ CaseConversionPolicy: { SnakeCase: [] } });
    expect(() => compare(v)).toThrow();
  });
  it('conservatively rejects equivalent row-reference renumbering', () => {
    const v = fixture();
    const table = section(v, 'Tables')[0];
    const types = section(v, 'Typespace').types;
    types.push(structuredClone(types[table.product_type_ref]));
    table.product_type_ref = types.length - 1;
    expect(() => compare(v)).toThrow();
  });
  it('rejects hidden candidate properties instead of silently discarding them', () => {
    const v = fixture();
    Object.defineProperty(v, 'hidden', { value: true });
    expect(() => compare(v)).toThrow();
  });
  it.each([
    'unknown',
    'duplicate',
    'duplicateCanonical',
    'missingMapping',
    'orphanSchedule',
  ])('rejects %s schema before preservation classification', (kind) => {
    const v = fixture();
    if (kind === 'unknown') v.sections.push({ Unknown: [] });
    if (kind === 'duplicate')
      section(v, 'Tables').push(section(v, 'Tables')[0]);
    if (kind === 'duplicateCanonical') {
      const mappings = section(v, 'ExplicitNames').entries.filter(
        (e: any) => e.Table,
      );
      mappings[1].Table.canonical_name = mappings[0].Table.canonical_name;
    }
    if (kind === 'missingMapping')
      section(v, 'ExplicitNames').entries = section(
        v,
        'ExplicitNames',
      ).entries.filter((e: any) => !e.Table);
    if (kind === 'orphanSchedule')
      section(v, 'Schedules')[0].table_name = 'absent';
    expect(() => compare(v)).toThrow();
  });
});
