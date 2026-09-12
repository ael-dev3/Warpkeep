import { canonicalizePtrRawV10 } from './ptr-artifact-description.mjs';
import { canonicalTableSchemaBoundary } from './spacetime-table-schema-attestation.mjs';
import {
  parseExistingUpdateJson,
  updateCanonical,
  updateDigest,
} from './sealed-realms-existing-update-protocol.mjs';

export const PTR_UPDATE_DEFINITION_POLICY =
  'warpkeep-ptr-raw-v10-stable-row-schema-v1';
const fail = () => {
  throw new Error('PTR_UPDATE_DEFINITION_POLICY_INVALID');
};
const freeze = (value) => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};
// Do not let JSON.stringify hide accessors, symbols, holes, undefined, or lossy numbers
// in an in-process candidate. The producer supplies its actual frozen definition.
function exactJson(value, depth = 0, ancestors = new Set()) {
  if (depth > 64) fail();
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) fail();
    return;
  }
  if (!value || typeof value !== 'object' || ancestors.has(value)) fail();
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype
  )
    fail();
  ancestors.add(value);
  const keys = Reflect.ownKeys(value);
  if (Array.isArray(value) && keys.length !== value.length + 1) fail();
  for (const key of keys) {
    if (Array.isArray(value) && key === 'length') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      typeof key !== 'string' ||
      !descriptor.enumerable ||
      !Object.hasOwn(descriptor, 'value')
    )
      fail();
    exactJson(descriptor.value, depth + 1, ancestors);
  }
  ancestors.delete(value);
}
function parseDefinition(definition) {
  exactJson(definition);
  const normalized = canonicalizePtrRawV10(
    Buffer.from(JSON.stringify({ V10: definition })),
  );
  return freeze({
    profile: PTR_UPDATE_DEFINITION_POLICY,
    definition: normalized.definition,
    fullDigest: normalized.digest,
  });
}

/** Server responses contain inner RawV10, unlike the standalone extraction envelope. */
export function parsePtrUpdateDefinition(serverInnerBytes) {
  const parsed = parseDefinition(parseExistingUpdateJson(serverInnerBytes));
  inspect(parsed);
  return parsed;
}

function inspect(parsed) {
  const sections = Object.fromEntries(
    parsed.definition.sections.map((section) => Object.entries(section)[0]),
  );
  const tables = sections.Tables ?? [];
  const mappings = sections.ExplicitNames?.entries ?? [];
  const tableNames = new Map();
  const canonicalNames = new Set();
  const tableSources = new Set(tables.map((table) => table.source_name));
  const indexSources = new Set(
    tables.flatMap((table) =>
      table.indexes.flatMap((index) => [
        index.source_name.some,
        ...(index.accessor_name.some ? [index.accessor_name.some] : []),
      ]),
    ),
  );
  for (const entry of mappings) {
    if (entry.Table) {
      const { source_name, canonical_name } = entry.Table;
      if (!tableSources.has(source_name) || canonicalNames.has(canonical_name))
        fail();
      tableNames.set(source_name, canonical_name);
      canonicalNames.add(canonical_name);
    }
    if (entry.Index && !indexSources.has(entry.Index.source_name)) fail();
  }
  // Official normalized output explicitly records each table's canonical name.
  // Refuse omitted mappings instead of reimplementing the server's naming rules.
  if (tableNames.size !== tables.length) fail();
  const scheduledTables = new Set();
  for (const schedule of sections.Schedules ?? []) {
    if (
      !canonicalNames.has(schedule.table_name) ||
      scheduledTables.has(schedule.table_name)
    )
      fail();
    scheduledTables.add(schedule.table_name);
    const table = tables.find(
      (table) => tableNames.get(table.source_name) === schedule.table_name,
    );
    const row = sections.Typespace.types[table.product_type_ref];
    if (schedule.schedule_at_col >= row.Product.elements.length) fail();
  }
  return { sections, tables, tableNames, canonicalNames, mappings };
}

function preservation(state, names) {
  const selected = state.tables.filter((table) =>
    names.includes(state.tableNames.get(table.source_name)),
  );
  // Reuse the V9 boundary's stable reference-number semantics and full row-type closure.
  // Equivalent type renumbering is unsupported, not a claim of actual data destruction.
  const boundary =
    names.length === 0
      ? { tables: [], reachableTypes: [] }
      : canonicalTableSchemaBoundary(
          {
            tables: selected.map((table) => ({
              ...table,
              name: state.tableNames.get(table.source_name),
            })),
            typespace: state.sections.Typespace,
          },
          names,
        );
  const sourceNames = new Set(selected.map((table) => table.source_name));
  const indexNames = new Set(
    selected.flatMap((table) =>
      table.indexes.flatMap((index) => [
        index.source_name.some,
        ...(index.accessor_name.some ? [index.accessor_name.some] : []),
      ]),
    ),
  );
  const reachable = new Set(boundary.reachableTypes.map((entry) => entry.ref));
  return {
    profile: PTR_UPDATE_DEFINITION_POLICY,
    boundary,
    rowTypeDeclarations: (state.sections.Types ?? []).filter((type) =>
      reachable.has(type.ty),
    ),
    namingPolicy: state.sections.CaseConversionPolicy ?? null,
    names: state.mappings.filter(
      (entry) =>
        (entry.Table && sourceNames.has(entry.Table.source_name)) ||
        (entry.Index && indexNames.has(entry.Index.source_name)),
    ),
    schedules: (state.sections.Schedules ?? []).filter((schedule) =>
      names.includes(schedule.table_name),
    ),
  };
}

/** Describes supported row-schema preservation only; never authorizes an update or arbitrary code. */
export function comparePtrUpdateDefinitions({
  priorServerSchema,
  candidateArtifactDefinition,
}) {
  const prior = parsePtrUpdateDefinition(priorServerSchema);
  const candidate = parseDefinition(candidateArtifactDefinition);
  const oldState = inspect(prior),
    newState = inspect(candidate);
  const names = [...oldState.canonicalNames].sort();
  if (names.some((name) => !newState.canonicalNames.has(name))) fail();
  const before = preservation(oldState, names),
    after = preservation(newState, names);
  if (updateCanonical(before) !== updateCanonical(after)) fail();
  const addedTables = [...newState.canonicalNames]
    .filter((name) => !oldState.canonicalNames.has(name))
    .sort();
  return freeze({
    profile: PTR_UPDATE_DEFINITION_POLICY,
    priorDigest: prior.fullDigest,
    candidateDigest: candidate.fullDigest,
    priorPreservationDigest: updateDigest(before),
    candidatePreservationDigest: updateDigest(after),
    addedTables,
    classification: addedTables.length
      ? 'tables-preserved-with-additions'
      : 'tables-preserved',
  });
}
