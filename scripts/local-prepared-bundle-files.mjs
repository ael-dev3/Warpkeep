import { createHash } from 'node:crypto';

import {
  deriveSealedRealmOperationBundleSourceClosureDigest,
  getSealedRealmOperationBundleSpecification,
} from './sealed-realms-production-bundle-engine.mjs';

const PROFILE = 'warpkeep-spacetime-binding-final-preparation-linux-x64-v1';
const LOAD_PROFILE = 'warpkeep-linux-operation-bundle-load-v1';
const MANIFEST_PATH = 'scripts/sealed-realms-production-bundle-manifest-v1.json';
const LANES = Object.freeze(['activation', 'g001', 'g002', 'ptr']);
const MAX_BUNDLE_BYTES = 4 * 1024 * 1024;
const MAX_DECLARATION_BYTES = 64 * 1024;
const MAX_AGGREGATE_BYTES = 32 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 1024 * 1024;
const HEX_40 = /^[0-9a-f]{40}$/u;
const HEX_64 = /^[0-9a-f]{64}$/u;

export class LocalPreparedBundleFilesError extends Error {
  constructor() {
    super('LOCAL_PREPARED_BUNDLE_FILES_INVALID');
    this.name = 'LocalPreparedBundleFilesError';
    this.code = 'LOCAL_PREPARED_BUNDLE_FILES_INVALID';
  }
}

function fail() { throw new LocalPreparedBundleFilesError(); }

function exactObject(value, keys) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype
      || Object.keys(value).length !== keys.length
      || !keys.every(key => Object.hasOwn(value, key))) fail();
  return value;
}

function sameArray(value, expected) {
  return Array.isArray(value) && value.length === expected.length
    && value.every((entry, index) => entry === expected[index]);
}

function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

function entryDeclarationPath(entryPath) {
  if (!entryPath.endsWith('.mjs')) fail();
  return `${entryPath.slice(0, -4)}.d.mts`;
}

function outputDeclarationPath(basename) {
  if (!basename.endsWith('.mjs')) fail();
  return `scripts/${basename.slice(0, -4)}.d.mts`;
}

function validGraphPath(path) {
  if (typeof path !== 'string' || path.length === 0 || path.startsWith('/')
      || path.includes('\\') || path.includes('\0') || /^[A-Za-z]:/u.test(path)) return false;
  const parts = path.split('/');
  return parts.every(part => part !== '' && part !== '.' && part !== '..');
}

function copyGraphManifest(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 256) fail();
  let previous = '';
  return value.map((candidate) => {
    const member = exactObject(candidate, ['path', 'byteLength', 'sha256']);
    if (!validGraphPath(member.path) || member.path <= previous
        || !Number.isSafeInteger(member.byteLength) || member.byteLength < 0
        || typeof member.sha256 !== 'string' || !HEX_64.test(member.sha256)) fail();
    previous = member.path;
    return Object.freeze({
      path: member.path, byteLength: member.byteLength, sha256: member.sha256,
    });
  });
}

function declarationTokens(source) {
  const tokens = [];
  const opening = new Map([['(', ')'], ['[', ']'], ['{', '}']]);
  const closing = new Set(opening.values());
  const stack = [];
  let index = 0;
  while (index < source.length) {
    const character = source[index];
    if (/\s/u.test(character)) { index += 1; continue; }
    if (character === '/' && source[index + 1] === '/') {
      index += 2;
      while (index < source.length && source[index] !== '\n') index += 1;
      continue;
    }
    if (character === '/' && source[index + 1] === '*') {
      const end = source.indexOf('*/', index + 2);
      if (end < 0) fail();
      index = end + 2;
      continue;
    }
    if (character === "'" || character === '"') {
      const quote = character;
      let raw = quote;
      index += 1;
      let closed = false;
      while (index < source.length) {
        const next = source[index];
        if (next === '\n' || next === '\r') fail();
        raw += next;
        index += 1;
        if (next === '\\') {
          if (index >= source.length) fail();
          raw += source[index];
          index += 1;
        } else if (next === quote) {
          closed = true;
          break;
        }
      }
      if (!closed) fail();
      tokens.push({ value: raw, depth: stack.length });
      continue;
    }
    if (character === '`') fail();
    if (/[A-Za-z_$]/u.test(character)) {
      let end = index + 1;
      while (end < source.length && /[A-Za-z0-9_$]/u.test(source[end])) end += 1;
      tokens.push({ value: source.slice(index, end), depth: stack.length });
      index = end;
      continue;
    }
    if (opening.has(character)) {
      tokens.push({ value: character, depth: stack.length });
      stack.push(opening.get(character));
      index += 1;
      continue;
    }
    if (closing.has(character)) {
      if (stack.pop() !== character) fail();
      tokens.push({ value: character, depth: stack.length });
      index += 1;
      continue;
    }
    tokens.push({ value: character, depth: stack.length });
    index += 1;
  }
  if (stack.length !== 0) fail();
  return tokens;
}

function validateDeclaration(bytes, spec) {
  let source;
  try { source = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail(); }
  if (source.includes('\r') || source.includes('\0')) fail();
  const tokens = declarationTokens(source);
  const imports = tokens.map((token, index) => ({ token, index }))
    .filter(({ token }) => token.value === 'import');
  if (imports.length !== 1 || imports[0].token.depth !== 0) fail();
  const importStart = imports[0].index;
  const importEnd = tokens.findIndex((token, index) => index >= importStart && token.value === ';');
  if (importEnd < 0) fail();
  const importValues = tokens.slice(importStart, importEnd + 1).map(token => token.value);
  const importWithoutTrailingComma = [
    'import', 'type', '{', 'SealedRealmsProductionDispatcher', '}', 'from',
    "'./sealed-realms-production-dispatch.mjs'", ';',
  ];
  const importWithTrailingComma = [
    'import', 'type', '{', 'SealedRealmsProductionDispatcher', ',', '}', 'from',
    "'./sealed-realms-production-dispatch.mjs'", ';',
  ];
  if (!sameArray(importValues, importWithoutTrailingComma)
      && !sameArray(importValues, importWithTrailingComma)) fail();

  const exports = tokens.map((token, index) => ({ token, index }))
    .filter(({ token }) => token.value === 'export');
  if (exports.length !== spec.exportNames.length) fail();
  const names = exports.map(({ token, index }) => {
    if (token.depth !== 0 || tokens[index + 1]?.value !== 'function'
        || tokens[index + 2]?.depth !== 0
        || !/^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(tokens[index + 2]?.value ?? '')
        || tokens[index + 3]?.value !== '(') fail();
    return tokens[index + 2].value;
  });
  if (!sameArray(names, spec.exportNames)) fail();
}

function validateDeclarationMap(value, specifications) {
  if (!(value instanceof Map) || Object.getPrototypeOf(value) !== Map.prototype
      || value.size !== specifications.length) fail();
  const expectedPaths = new Set(specifications.map(spec => entryDeclarationPath(spec.entryPath)));
  for (const [path, bytes] of value) {
    if (!expectedPaths.has(path) || !(bytes instanceof Uint8Array)
        || bytes.byteLength < 1 || bytes.byteLength > MAX_DECLARATION_BYTES) fail();
  }
}

export function derivePreparedOperationBundleFiles(input) {
  const ownedBytes = [];
  try {
    const options = exactObject(input, ['bundles', 'entryDeclarations']);
    const prepared = exactObject(options.bundles,
      ['profile', 'sourceCommit', 'sourceTree', 'bundles']);
    if (prepared.profile !== PROFILE || typeof prepared.sourceCommit !== 'string'
        || !HEX_40.test(prepared.sourceCommit) || typeof prepared.sourceTree !== 'string'
        || !HEX_40.test(prepared.sourceTree) || !Array.isArray(prepared.bundles)
        || prepared.bundles.length !== LANES.length) fail();
    const specifications = LANES.map(lane => getSealedRealmOperationBundleSpecification(lane));
    validateDeclarationMap(options.entryDeclarations, specifications);

    let aggregateBytes = 0;
    const validated = LANES.map((lane, index) => {
      const spec = specifications[index];
      const bundle = exactObject(prepared.bundles[index], [
        'lane', 'basename', 'bytes', 'byteDigest', 'sourceClosureDigest', 'graphManifest',
        'exportNames', 'factoryExport', 'factoryFailureCode', 'load',
      ]);
      const load = exactObject(bundle.load,
        ['profile', 'byteDigest', 'exportNames', 'factoryFailureCode']);
      const declarationPath = entryDeclarationPath(spec.entryPath);
      const declarationBytes = options.entryDeclarations.get(declarationPath);
      if (bundle.lane !== lane || bundle.basename !== spec.basename
          || !(bundle.bytes instanceof Uint8Array) || bundle.bytes.byteLength < 1
          || bundle.bytes.byteLength > MAX_BUNDLE_BYTES
          || typeof bundle.byteDigest !== 'string' || !HEX_64.test(bundle.byteDigest)
          || typeof bundle.sourceClosureDigest !== 'string' || !HEX_64.test(bundle.sourceClosureDigest)
          || !sameArray(bundle.exportNames, spec.exportNames)
          || bundle.factoryExport !== spec.factoryExport
          || bundle.factoryFailureCode !== spec.factoryFailureCode
          || load.profile !== LOAD_PROFILE || load.byteDigest !== bundle.byteDigest
          || !sameArray(load.exportNames, spec.exportNames)
          || load.factoryFailureCode !== spec.factoryFailureCode) fail();
      const graphManifest = copyGraphManifest(bundle.graphManifest);
      // The fixed compiler validates complete reachable membership; this data
      // projection retains its exact manifest/digest and required authority roots.
      if (spec.requiredGraphPaths.some(path => !graphManifest.some(member => member.path === path))) fail();
      if (bundle.sourceClosureDigest
          !== deriveSealedRealmOperationBundleSourceClosureDigest(lane, graphManifest)) fail();
      validateDeclaration(declarationBytes, spec);
      aggregateBytes += bundle.bytes.byteLength + declarationBytes.byteLength;
      if (!Number.isSafeInteger(aggregateBytes) || aggregateBytes > MAX_AGGREGATE_BYTES) fail();
      return { lane, spec, bundle, graphManifest, declarationBytes };
    });

    const files = [];
    const manifestBundles = [];
    for (const value of validated) {
      const bundleBytes = new Uint8Array(value.bundle.bytes);
      const declarationBytes = new Uint8Array(value.declarationBytes);
      ownedBytes.push(bundleBytes, declarationBytes);
      const bundleDigest = sha256(bundleBytes);
      if (bundleDigest !== value.bundle.byteDigest) fail();
      const bundlePath = `scripts/${value.spec.basename}`;
      const declarationPath = outputDeclarationPath(value.spec.basename);
      files.push(Object.freeze({ path: bundlePath, bytes: bundleBytes }));
      files.push(Object.freeze({ path: declarationPath, bytes: declarationBytes }));
      manifestBundles.push({
        lane: value.lane,
        path: bundlePath,
        byteLength: bundleBytes.byteLength,
        sha256: bundleDigest,
        sourceClosureDigest: value.bundle.sourceClosureDigest,
        graphManifest: value.graphManifest,
        declaration: {
          path: declarationPath,
          byteLength: declarationBytes.byteLength,
          sha256: sha256(declarationBytes),
        },
        exportNames: [...value.spec.exportNames],
        factoryExport: value.spec.factoryExport,
        factoryFailureCode: value.spec.factoryFailureCode,
      });
    }
    const manifest = {
      schemaVersion: 1,
      profile: PROFILE,
      sourceCommit: prepared.sourceCommit,
      sourceTree: prepared.sourceTree,
      bundles: manifestBundles,
    };
    const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    ownedBytes.push(manifestBytes);
    if (manifestBytes.byteLength > MAX_MANIFEST_BYTES) fail();
    files.push(Object.freeze({ path: MANIFEST_PATH, bytes: manifestBytes }));
    files.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
    return Object.freeze({
      profile: PROFILE,
      sourceCommit: prepared.sourceCommit,
      sourceTree: prepared.sourceTree,
      files: Object.freeze(files),
    });
  } catch (error) {
    for (const bytes of ownedBytes) bytes.fill(0);
    if (error instanceof LocalPreparedBundleFilesError) throw error;
    throw new LocalPreparedBundleFilesError();
  }
}
