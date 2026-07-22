import { createHash } from 'node:crypto';

const MAX_CANONICAL_DEPTH = 128;

export class TableSchemaAttestationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TableSchemaAttestationError';
  }
}

function fail(message) {
  throw new TableSchemaAttestationError(message);
}

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function canonicalJson(value, depth = 0, ancestors = new Set()) {
  if (depth > MAX_CANONICAL_DEPTH) fail('The table schema boundary exceeded its canonical depth limit.');
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('The table schema boundary contained a non-finite number.');
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') {
    fail('The table schema boundary contained a non-JSON value.');
  }
  if (ancestors.has(value)) fail('The table schema boundary contained a cycle.');
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value.map(entry => canonicalJson(entry, depth + 1, ancestors)).join(',')}]`;
    }
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some(key => typeof key !== 'string')) {
      fail('The table schema boundary contained a non-JSON object key.');
    }
    const keys = ownKeys.sort();
    return `{${keys.map(key => {
      const entry = value[key];
      if (entry === undefined) fail('The table schema boundary contained an undefined field.');
      return `${JSON.stringify(key)}:${canonicalJson(entry, depth + 1, ancestors)}`;
    }).join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}

function collectReferencedTypeRefs(value, refs, depth = 0, ancestors = new Set()) {
  if (depth > MAX_CANONICAL_DEPTH) fail('The table schema type graph exceeded its depth limit.');
  if (value === null || typeof value !== 'object') return;
  if (ancestors.has(value)) fail('The table schema type graph contained an object cycle.');
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      for (const entry of value) collectReferencedTypeRefs(entry, refs, depth + 1, ancestors);
      return;
    }
    const keys = Object.keys(value);
    if (Object.hasOwn(value, 'Ref')) {
      if (keys.length !== 1 || !Number.isSafeInteger(value.Ref) || value.Ref < 0) {
        fail('The table schema type graph contained an invalid type reference.');
      }
      refs.add(value.Ref);
      return;
    }
    // The CLI JSON uses externally tagged `{ Ref: n }` values. Supporting the
    // SDK's equivalent tagged shape as well keeps this helper usable in strict
    // local fixtures without weakening the accepted reference envelope.
    if (value.tag === 'Ref') {
      if (
        keys.length !== 2
        || !keys.includes('tag')
        || !keys.includes('value')
        || !Number.isSafeInteger(value.value)
        || value.value < 0
      ) fail('The table schema type graph contained an invalid type reference.');
      refs.add(value.value);
      return;
    }
    for (const key of keys) {
      collectReferencedTypeRefs(value[key], refs, depth + 1, ancestors);
    }
  } finally {
    ancestors.delete(value);
  }
}

function exactTableNames(value) {
  if (!Array.isArray(value) || value.length === 0) {
    fail('The table schema boundary requires one exact non-empty table set.');
  }
  const names = value.map(name => {
    if (typeof name !== 'string' || !/^[a-z][a-z0-9_]*$/.test(name)) {
      fail('The table schema boundary contained an invalid expected table name.');
    }
    return name;
  });
  if (new Set(names).size !== names.length) {
    fail('The table schema boundary contained duplicate expected table names.');
  }
  return Object.freeze([...names].sort());
}

/**
 * Select the complete table schema and only the typespace closure reachable
 * from those table row roots. Reducer/procedure-only types are deliberately
 * excluded so an operational code change cannot perturb the data boundary.
 */
export function canonicalTableSchemaBoundary(description, expectedTableNames) {
  const names = exactTableNames(expectedTableNames);
  if (
    !record(description)
    || !Array.isArray(description.tables)
    || !record(description.typespace)
    || !Array.isArray(description.typespace.types)
  ) fail('The table schema description was invalid.');

  const tablesByName = new Map();
  for (const table of description.tables) {
    if (
      !record(table)
      || typeof table.name !== 'string'
      || tablesByName.has(table.name)
    ) fail('The table schema description contained an invalid table descriptor.');
    tablesByName.set(table.name, table);
  }
  const actualNames = [...tablesByName.keys()].sort();
  if (
    actualNames.length !== names.length
    || actualNames.some((name, index) => name !== names[index])
  ) fail('The table schema description did not match the exact table set.');

  const tableDescriptors = [];
  const pendingRefs = [];
  for (const name of names) {
    const table = tablesByName.get(name);
    if (!Number.isSafeInteger(table.product_type_ref) || table.product_type_ref < 0) {
      fail('The table schema description contained an invalid row-type reference.');
    }
    tableDescriptors.push(table);
    pendingRefs.push(table.product_type_ref);
  }

  const reachableRefs = new Set();
  while (pendingRefs.length > 0) {
    const ref = pendingRefs.pop();
    if (reachableRefs.has(ref)) continue;
    const type = description.typespace.types[ref];
    if (!record(type)) fail('The table schema description omitted a reachable row type.');
    reachableRefs.add(ref);
    const discovered = new Set();
    collectReferencedTypeRefs(type, discovered);
    for (const referencedRef of discovered) {
      if (referencedRef >= description.typespace.types.length) {
        fail('The table schema type graph referenced an absent type.');
      }
      pendingRefs.push(referencedRef);
    }
  }

  const reachableTypes = [...reachableRefs]
    .sort((left, right) => left - right)
    .map(ref => Object.freeze({ ref, type: description.typespace.types[ref] }));
  return Object.freeze({
    protocol: 'warpkeep-table-schema-boundary-v1',
    tables: Object.freeze(tableDescriptors),
    reachableTypes: Object.freeze(reachableTypes),
  });
}

export function canonicalTableSchemaBoundaryDigest(description, expectedTableNames) {
  const boundary = canonicalTableSchemaBoundary(description, expectedTableNames);
  return createHash('sha256').update(canonicalJson(boundary)).digest('hex');
}
