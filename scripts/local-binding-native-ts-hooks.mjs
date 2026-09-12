import { lstatSync, readdirSync, realpathSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readLocalBindingBoundedFile } from './local-binding-bounded-file.mjs';

const SYNTHETIC_ENTRIES = new Map([
  ['scripts/ptr-binding-linux-locked-source-build.ts', 'warpkeep:ptr-binding-entry'],
  ['scripts/genesis002-binding-linux-locked-source-build.ts', 'warpkeep:genesis002-binding-entry'],
  ['scripts/genesis001-binding-linux-locked-source-build.ts', 'warpkeep:genesis001-binding-entry'],
  ['scripts/genesis001-current-binding-linux-locked-source-build.ts', 'warpkeep:genesis001-current-binding-entry'],
  ['scripts/genesis001-baseline-binding-linux-locked-source-build.ts', 'warpkeep:genesis001-compatibility-entry'],
  ['scripts/local-operation-bundle-packages.ts', 'warpkeep:operation-bundle-packages'],
]);
const MAX_SOURCE_BYTES = 4 * 1024 * 1024;
const YAML_BUILTINS = new Set(['buffer', 'process']);

function fail(code, cause) {
  throw new Error(code, cause === undefined ? undefined : { cause });
}

function exactKeys(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function contained(root, candidate) {
  const difference = relative(root, candidate);
  return difference === '' || (difference !== '..' && !difference.startsWith(`..${sep}`) && !isAbsolute(difference));
}

function validateRelativePath(path) {
  return typeof path === 'string' && path.length > 0 && path.length <= 512
    && !path.startsWith('/') && !path.includes('\\')
    && path.split('/').every(part => part && part !== '.' && part !== '..' && !/[\u0000-\u001f\u007f]/u.test(part));
}

function stableRead(root, path, record, requireMode) {
  if (!validateRelativePath(path)) fail('LOCAL_BINDING_HOOK_RECORD_INVALID');
  const absolute = resolve(root, ...path.split('/'));
  if (!contained(root, absolute)) fail('LOCAL_BINDING_HOOK_RECORD_INVALID');
  try {
    return readLocalBindingBoundedFile(absolute, {
      maximumBytes: MAX_SOURCE_BYTES,
      expectedBytes: record.bytes,
      expectedSha256: record.sha256,
      expectedMode: requireMode && process.platform !== 'win32' ? record.mode : undefined,
      expectedIdentity: record.identity,
    }).body;
  } catch (error) {
    if (error?.code === 'LOCAL_BINDING_BOUNDED_FILE_INVALID') fail('LOCAL_BINDING_HOOK_FILE_INVALID', error);
    if (error?.code === 'LOCAL_BINDING_BOUNDED_FILE_CHANGED') fail('LOCAL_BINDING_HOOK_FILE_CHANGED', error);
    throw error;
  }
}

function records(graph, yaml) {
  if (!exactKeys(graph, ['root', 'entry', 'modules']) || !isAbsolute(graph.root)
      || !validateRelativePath(graph.entry) || !Array.isArray(graph.modules)
      || graph.modules.length === 0 || graph.modules.length > 256
      || !exactKeys(yaml, ['root', 'entry', 'files']) || !isAbsolute(yaml.root)
      || !validateRelativePath(yaml.entry) || !Array.isArray(yaml.files) || yaml.files.length === 0) {
    fail('LOCAL_BINDING_HOOK_RECORD_INVALID');
  }
  const sourceRoot = realpathSync(graph.root);
  const yamlRoot = realpathSync(yaml.root);
  for (const [root, code] of [[sourceRoot, 'LOCAL_BINDING_HOOK_RECORD_INVALID'], [yamlRoot, 'LOCAL_BINDING_HOOK_YAML_INVALID']]) {
    const state = lstatSync(root, { bigint: true });
    if (root !== (root === sourceRoot ? graph.root : yaml.root) || !state.isDirectory() || state.isSymbolicLink()) fail(code);
  }
  const source = new Map();
  for (const record of graph.modules) {
    if (!exactKeys(record, ['path', 'format', 'imports', 'bytes', 'sha256', 'identity'])
        || !validateRelativePath(record.path) || !['typescript', 'module'].includes(record.format)
        || !Number.isSafeInteger(record.bytes) || record.bytes < 0 || record.bytes > MAX_SOURCE_BYTES
        || !/^[0-9a-f]{64}$/u.test(record.sha256) || !Array.isArray(record.imports)
        || !exactKeys(record.identity, ['dev', 'ino', 'mode', 'uid', 'nlink', 'size', 'mtimeNs', 'ctimeNs'])
        || Object.values(record.identity).some(part => !/^[0-9]+$/u.test(part))
        || source.has(record.path)) fail('LOCAL_BINDING_HOOK_RECORD_INVALID');
    const imports = new Map();
    for (const edge of record.imports) {
      if (!exactKeys(edge, edge?.yaml === true ? ['specifier', 'yaml']
        : edge?.builtin === true ? ['specifier', 'builtin'] : ['specifier', 'target'])
          || typeof edge.specifier !== 'string' || imports.has(edge.specifier)) {
        fail('LOCAL_BINDING_HOOK_RECORD_INVALID');
      }
      if (edge.yaml === true && edge.specifier !== 'yaml') fail('LOCAL_BINDING_HOOK_RECORD_INVALID');
      if (edge.builtin === true && !edge.specifier.startsWith('node:')) fail('LOCAL_BINDING_HOOK_RECORD_INVALID');
      if (Object.hasOwn(edge, 'target') && !validateRelativePath(edge.target)) fail('LOCAL_BINDING_HOOK_RECORD_INVALID');
      imports.set(edge.specifier, edge);
    }
    source.set(record.path, { ...record, imports });
  }
  if (!source.has(graph.entry)) fail('LOCAL_BINDING_HOOK_RECORD_INVALID');
  const yamlRecords = new Map();
  for (const record of yaml.files) {
    if (!exactKeys(record, ['path', 'mode', 'bytes', 'sha256']) || !validateRelativePath(record.path)
        || ![0o644, 0o755].includes(record.mode) || !Number.isSafeInteger(record.bytes)
        || record.bytes < 0 || record.bytes > MAX_SOURCE_BYTES || !/^[0-9a-f]{64}$/u.test(record.sha256)
        || yamlRecords.has(record.path)) fail('LOCAL_BINDING_HOOK_RECORD_INVALID');
    yamlRecords.set(record.path, record);
  }
  if (!yamlRecords.has(yaml.entry)) fail('LOCAL_BINDING_HOOK_RECORD_INVALID');
  for (const record of source.values()) stableRead(sourceRoot, record.path, record, false);
  const observedYaml = new Set();
  function visitYaml(directory, segments) {
    const directoryState = lstatSync(directory, { bigint: true });
    if (!directoryState.isDirectory() || directoryState.isSymbolicLink()
        || (process.platform !== 'win32' && (directoryState.mode & 0o777n) !== 0o700n)) {
      fail('LOCAL_BINDING_HOOK_YAML_INVALID');
    }
    for (const child of readdirSync(directory, { withFileTypes: true })) {
      const path = [...segments, child.name].join('/');
      const absolute = resolve(directory, child.name);
      if (child.isSymbolicLink()) fail('LOCAL_BINDING_HOOK_YAML_INVALID');
      if (child.isDirectory()) visitYaml(absolute, [...segments, child.name]);
      else if (child.isFile()) {
        const record = yamlRecords.get(path);
        if (record === undefined) fail('LOCAL_BINDING_HOOK_YAML_INVALID');
        stableRead(yamlRoot, path, record, true);
        observedYaml.add(path);
      } else fail('LOCAL_BINDING_HOOK_YAML_INVALID');
    }
  }
  visitYaml(yamlRoot, []);
  if (observedYaml.size !== yamlRecords.size) fail('LOCAL_BINDING_HOOK_YAML_INVALID');
  return { sourceRoot, yamlRoot, source, yamlRecords };
}

export function installLocalBindingNativeTsHooks(attestedGraph, attestedYaml) {
  const state = records(attestedGraph, attestedYaml);
  // Preserve the legacy PTR hook semantics for controlled graphs while giving
  // the fixed G002 graph its own non-interchangeable synthetic entry.
  const syntheticEntry = SYNTHETIC_ENTRIES.get(attestedGraph.entry)
    ?? 'warpkeep:ptr-binding-entry';
  const sourceByUrl = new Map([...state.source].map(([path, record]) => [
    pathToFileURL(resolve(state.sourceRoot, ...path.split('/'))).href, record,
  ]));
  const yamlByUrl = new Map([...state.yamlRecords].map(([path, record]) => [
    pathToFileURL(resolve(state.yamlRoot, ...path.split('/'))).href, record,
  ]));
  const yamlEntryUrl = pathToFileURL(resolve(state.yamlRoot, ...attestedYaml.entry.split('/'))).href;
  let entryResolved = false;

  return registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === syntheticEntry && !entryResolved) {
        entryResolved = true;
        return { url: pathToFileURL(resolve(state.sourceRoot, ...attestedGraph.entry.split('/'))).href, shortCircuit: true };
      }
      const sourceParent = sourceByUrl.get(context.parentURL);
      if (sourceParent !== undefined) {
        const edge = sourceParent.imports.get(specifier);
        if (edge === undefined) fail('LOCAL_BINDING_HOOK_RESOLUTION_DENIED');
        if (edge.builtin === true) return nextResolve(specifier, context);
        if (edge.yaml === true) return { url: yamlEntryUrl, shortCircuit: true };
        const target = pathToFileURL(resolve(state.sourceRoot, ...edge.target.split('/'))).href;
        if (!sourceByUrl.has(target)) fail('LOCAL_BINDING_HOOK_RECORD_INVALID');
        return { url: target, shortCircuit: true };
      }
      if (yamlByUrl.has(context.parentURL)) {
        if (typeof specifier !== 'string') {
          fail('LOCAL_BINDING_HOOK_RESOLUTION_DENIED');
        }
        if (YAML_BUILTINS.has(specifier)) return nextResolve(`node:${specifier}`, context);
        let target;
        if (specifier.startsWith('.')) target = new URL(specifier, context.parentURL).href;
        else if (specifier.startsWith('file:')) target = new URL(specifier).href;
        else if (isAbsolute(specifier)) target = pathToFileURL(specifier).href;
        else fail('LOCAL_BINDING_HOOK_RESOLUTION_DENIED');
        if (!yamlByUrl.has(target)) fail('LOCAL_BINDING_HOOK_RESOLUTION_DENIED');
        return { url: target, shortCircuit: true };
      }
      if (YAML_BUILTINS.has(specifier)) fail('LOCAL_BINDING_HOOK_RESOLUTION_DENIED');
      return nextResolve(specifier, context);
    },
    load(url, _context, nextLoad) {
      const sourceRecord = sourceByUrl.get(url);
      if (sourceRecord !== undefined) {
        const path = fileURLToPath(url);
        const relativePath = relative(state.sourceRoot, path).split(sep).join('/');
        const body = stableRead(state.sourceRoot, relativePath, sourceRecord, false);
        const source = sourceRecord.format === 'typescript'
          ? stripTypeScriptTypes(body.toString('utf8'), { mode: 'transform', sourceMap: false })
          : body;
        return { format: 'module', source, shortCircuit: true };
      }
      const yamlRecord = yamlByUrl.get(url);
      if (yamlRecord !== undefined) {
        const path = fileURLToPath(url);
        const relativePath = relative(state.yamlRoot, path).split(sep).join('/');
        const body = stableRead(state.yamlRoot, relativePath, yamlRecord, true);
        const format = relativePath.endsWith('.json') ? 'json' : 'commonjs';
        return { format, source: body, shortCircuit: true };
      }
      return nextLoad(url, _context);
    },
  });
}
