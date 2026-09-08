import { spawnSync } from 'node:child_process';
import { join, isAbsolute } from 'node:path';
import {
  parseExistingUpdateJson,
  updateCanonical,
  updateSha256,
} from './sealed-realms-existing-update-protocol.mjs';

export const PTR_RAW_V10_PROFILE =
  'warpkeep-raw-v10-normalized-no-views-rls-http-defaults-v1';
const fail = () => {
  throw new Error('PTR_ARTIFACT_DESCRIPTION_INVALID');
};
const HASH = /^[a-f0-9]{64}$/u;
const MAX_BYTES = 16 * 1024 * 1024;
const exact = (v, keys) => {
  if (
    !v ||
    Object.getPrototypeOf(v) !== Object.prototype ||
    Object.keys(v).sort().join('\0') !== [...keys].sort().join('\0')
  )
    fail();
  return v;
};
const string = (v) => {
  if (typeof v !== 'string' || !v.length || v.length > 1024) fail();
  return v;
};
const integer = (v) => {
  if (!Number.isSafeInteger(v)) fail();
  return v;
};
const uint = (v) => {
  if (integer(v) < 0 || v > 0xffffffff) fail();
  return v;
};
const bool = (v) => {
  if (typeof v !== 'boolean') fail();
  return v;
};
const array = (v, fn) => {
  if (!Array.isArray(v) || v.length > 100000) fail();
  return v.map(fn);
};
const empty = (v) => {
  if (!Array.isArray(v) || v.length) fail();
  return [];
};
const tagged = (v, variants) => {
  if (
    !v ||
    Object.getPrototypeOf(v) !== Object.prototype ||
    Object.keys(v).length !== 1
  )
    fail();
  const key = Object.keys(v)[0];
  if (!Object.hasOwn(variants, key)) fail();
  return { [key]: variants[key](v[key]) };
};
const option = (v, fn) => tagged(v, { some: fn, none: empty });
const named = (v) => {
  exact(v, ['some']);
  return string(v.some);
};
const object = (v, shape) => {
  exact(v, Object.keys(shape));
  return Object.fromEntries(
    Object.entries(shape).map(([k, fn]) => [k, fn(v[k])]),
  );
};
const keyed = (v, fn, key) => {
  const items = array(v, fn),
    seen = new Set();
  for (const item of items) {
    const k = key(item);
    if (seen.has(k)) fail();
    seen.add(k);
  }
  return items.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
};
const freeze = (v) => {
  if (v && typeof v === 'object') {
    for (const x of Object.values(v)) freeze(x);
    Object.freeze(v);
  }
  return v;
};

/** Conservative normalized RawV10 grammar; this is description identity, not migration approval. */
export function canonicalizePtrRawV10(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length > MAX_BYTES) fail();
  const outer = exact(parseExistingUpdateJson(bytes), ['V10']);
  const raw = exact(outer.V10, ['sections']);
  if (!Array.isArray(raw.sections)) fail();
  const sections = new Map();
  for (const s of raw.sections) {
    if (!s || Object.keys(s).length !== 1) fail();
    const name = Object.keys(s)[0];
    if (sections.has(name)) fail();
    sections.set(name, s[name]);
  }
  const typespace = exact(sections.get('Typespace'), ['types']);
  if (!Array.isArray(typespace.types)) fail();
  const ref = (v) => {
    uint(v);
    if (v >= typespace.types.length) fail();
    return v;
  };
  let depth = 0;
  const type = (v) => {
    if (++depth > 64) fail();
    try {
      return tagged(v, {
        Ref: ref,
        Array: type,
        Product: (p) => object(p, { elements: (e) => array(e, member) }),
        Sum: (s) => object(s, { variants: (e) => array(e, member) }),
        ...Object.fromEntries(
          [
            'Bool',
            'I8',
            'U8',
            'I16',
            'U16',
            'I32',
            'U32',
            'I64',
            'U64',
            'I128',
            'U128',
            'I256',
            'U256',
            'F32',
            'F64',
            'String',
          ].map((k) => [k, empty]),
        ),
      });
    } finally {
      depth--;
    }
  };
  const member = (m) =>
    object(m, { name: (v) => option(v, string), algebraic_type: type });
  const product = (p) => object(p, { elements: (e) => array(e, member) });
  const visibility = (v) =>
    tagged(v, { ClientCallable: empty, Private: empty });
  const table = (t) => {
    exact(t, [
      'source_name',
      'product_type_ref',
      'primary_key',
      'indexes',
      'constraints',
      'sequences',
      'table_type',
      'table_access',
      'default_values',
      'is_event',
    ]);
    const productRef = ref(t.product_type_ref),
      row = typespace.types[productRef];
    if (!row || !Object.hasOwn(row, 'Product')) fail();
    const column = (v) => {
      uint(v);
      if (v >= row.Product.elements.length) fail();
      return v;
    };
    const columns = (v) => {
      const result = array(v, column);
      if (new Set(result).size !== result.length) fail();
      return result;
    };
    return {
      source_name: string(t.source_name),
      product_type_ref: productRef,
      primary_key: columns(t.primary_key),
      indexes: keyed(
        t.indexes,
        (x) =>
          object(x, {
            source_name: (v) => ({ some: named(v) }),
            accessor_name: (v) => option(v, string),
            algorithm: (v) =>
              tagged(v, { BTree: columns, Hash: columns, Direct: column }),
          }),
        (x) => x.source_name.some,
      ),
      constraints: keyed(
        t.constraints,
        (x) =>
          object(x, {
            source_name: (v) => ({ some: named(v) }),
            data: (v) => tagged(v, { Unique: (u) => object(u, { columns }) }),
          }),
        (x) => x.source_name.some,
      ),
      sequences: keyed(
        t.sequences,
        (x) =>
          object(x, {
            source_name: (v) => ({ some: named(v) }),
            column,
            start: (v) => option(v, integer),
            min_value: (v) => option(v, integer),
            max_value: (v) => option(v, integer),
            increment: integer,
          }),
        (x) => x.source_name.some,
      ),
      table_type: tagged(t.table_type, { User: empty }),
      table_access: tagged(t.table_access, { Private: empty, Public: empty }),
      default_values: empty(t.default_values),
      is_event: bool(t.is_event),
    };
  };
  const mapping = (x) =>
    tagged(
      x,
      Object.fromEntries(
        ['Table', 'Function', 'Index'].map((k) => [
          k,
          (v) => object(v, { source_name: string, canonical_name: string }),
        ]),
      ),
    );
  const mappingKey = (x) => {
    const k = Object.keys(x)[0];
    return `${k}\0${x[k].source_name}`;
  };
  const shapes = {
    Typespace: (v) => object(v, { types: (t) => array(t, type) }),
    Types: (v) =>
      keyed(
        v,
        (t) =>
          object(t, {
            source_name: (n) =>
              object(n, {
                scope: (s) => array(s, string),
                source_name: string,
              }),
            ty: ref,
            custom_ordering: bool,
          }),
        (t) => JSON.stringify([t.source_name.scope, t.source_name.source_name]),
      ),
    Tables: (v) => keyed(v, table, (t) => t.source_name),
    // Function array order is retained: official runtime IDs depend on it.
    Reducers: (v) => {
      const items = array(v, (r) =>
        object(r, {
          source_name: string,
          params: product,
          visibility,
          ok_return_type: type,
          err_return_type: type,
        }),
      );
      if (new Set(items.map((x) => x.source_name)).size !== items.length)
        fail();
      return items;
    },
    Procedures: (v) => {
      const items = array(v, (r) =>
        object(r, {
          source_name: string,
          params: product,
          return_type: type,
          visibility,
        }),
      );
      if (new Set(items.map((x) => x.source_name)).size !== items.length)
        fail();
      return items;
    },
    Schedules: (v) =>
      keyed(
        v,
        (s) =>
          object(s, {
            source_name: (n) => ({ some: named(n) }),
            table_name: string,
            schedule_at_col: uint,
            function_name: string,
          }),
        (s) => s.source_name.some,
      ),
    LifeCycleReducers: (v) =>
      keyed(
        v,
        (s) =>
          object(s, {
            lifecycle_spec: (l) =>
              tagged(l, { Init: empty, OnConnect: empty, OnDisconnect: empty }),
            function_name: string,
          }),
        (s) => Object.keys(s.lifecycle_spec)[0],
      ),
    ExplicitNames: (v) =>
      object(v, { entries: (e) => keyed(e, mapping, mappingKey) }),
    Views: empty,
    ViewPrimaryKeys: empty,
    RowLevelSecurity: empty,
    HttpHandlers: empty,
    HttpRoutes: empty,
    CaseConversionPolicy: (v) => tagged(v, { None: empty, SnakeCase: empty }),
  };
  for (const key of sections.keys()) if (!Object.hasOwn(shapes, key)) fail();
  const definition = {
    sections: Object.keys(shapes)
      .filter((key) => sections.has(key))
      .map((key) => ({ [key]: shapes[key](sections.get(key)) })),
  };
  const canonical = updateCanonical({
    profile: PTR_RAW_V10_PROFILE,
    definition,
  });
  return freeze({
    profile: PTR_RAW_V10_PROFILE,
    definition,
    digest: updateSha256(Buffer.from(canonical)),
  });
}

/** The capability comes from the publisher's private, hash-attested CLI snapshot. */
export function describePtrArtifact({
  artifactDescriptor,
  artifactSha256,
  assertArtifact,
  cli,
  spawn = spawnSync,
}) {
  if (
    !Number.isInteger(artifactDescriptor) ||
    artifactDescriptor < 0 ||
    !HASH.test(artifactSha256) ||
    typeof assertArtifact !== 'function' ||
    !cli ||
    typeof cli.verify !== 'function' ||
    typeof cli.directory !== 'string' ||
    !isAbsolute(cli.directory) ||
    !HASH.test(cli.provenance?.standaloneExecutableSha256)
  )
    fail();
  cli.verify();
  assertArtifact();
  const result = spawn(
    join(cli.directory, 'spacetimedb-standalone'),
    ['extract-schema', '/dev/fd/3', '--host-type', 'js'],
    {
      cwd: cli.directory,
      env: Object.freeze({ PATH: '/usr/bin:/bin' }),
      input: '',
      stdio: ['ignore', 'pipe', 'pipe', artifactDescriptor],
      timeout: 40_000,
      killSignal: 'SIGKILL',
      maxBuffer: MAX_BYTES,
    },
  );
  cli.verify();
  assertArtifact();
  if (
    result?.error ||
    result?.signal ||
    result?.status !== 0 ||
    !(result.stdout instanceof Uint8Array) ||
    !(result.stderr instanceof Uint8Array) ||
    result.stdout.length > MAX_BYTES ||
    result.stderr.length > MAX_BYTES
  )
    fail();
  const normalized = canonicalizePtrRawV10(result.stdout);
  return freeze({
    profile: 'warpkeep-ptr-artifact-description-v1',
    artifactSha256,
    rawModuleDefVersion: 10,
    standaloneExecutableSha256: cli.provenance.standaloneExecutableSha256,
    rawExtractionSha256: updateSha256(result.stdout),
    canonicalizationProfile: normalized.profile,
    descriptionSha256: normalized.digest,
    definition: normalized.definition,
  });
}
