// Read-only native output capture. Importing (including Node require(ESM)) runs nothing.
// Actual build commands, environments and their terminal/source proofs belong to the producer.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { isAbsolute, join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { allowedProductionHiddenPaths, allowedProductionHtmlPaths } from './verify-production-dist-exclusions.mjs';

export const NATIVE_BUILD_OUTPUT_PROFILE = 'warpkeep-native-build-output-v1';
const BASES = Object.freeze({ default: '/', 'github-pages': '/Warpkeep/', 'canonical-pages': '/' });
const LIMITS = Object.freeze({ files: 20000, directories: 4096, depth: 16,
  fileBytes: 64 * 1024 * 1024, totalBytes: 150 * 1024 * 1024, documentBytes: 1024 * 1024 });
const IDENTITY_KEYS = Object.freeze(['dev', 'ino', 'mode', 'uid', 'gid', 'nlink', 'size', 'mtimeNs', 'ctimeNs']);
const HTML = new Set(allowedProductionHtmlPaths), HIDDEN = new Set(allowedProductionHiddenPaths);
const TOP_DIRECTORIES = new Set(['.well-known', 'assets', 'audio', 'images', 'legal', 'models',
  'owner-canary', 'privacy', 'social-contract', 'terms', 'video']);
const ROOT_FILES = new Set(['index.html', 'apple-touch-icon-180-fe27e8dc1c97cc36.png',
  'favicon-64-7b82ca973fe757f5.png', 'warpkeep-boot.css', 'warpkeep-noscript.css']);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = code => { throw Error(`NATIVE_BUILD_OUTPUT_${code}`); };
const identity = state => Object.freeze(Object.fromEntries(IDENTITY_KEYS.map(key => [key, String(state[key])])));
const same = (left, right) => { if (!isDeepStrictEqual(left, right)) fail('CHANGED'); };

function canonicalPath(path) {
  return typeof path === 'string' && path.length > 0 && path.length <= 4096
    && isAbsolute(path) && resolve(path) === path && !/[\x00-\x1f\x7f\\]/u.test(path);
}
function state(path, directory) {
  const value = fs.lstatSync(path, { bigint: true });
  if (value.isSymbolicLink() || (directory ? !value.isDirectory() : !value.isFile())
    || fs.realpathSync(path) !== path) fail('NONREGULAR_PATH');
  if (value.uid !== 1000n || value.gid !== 1000n) fail('OWNER_INVALID');
  const mode = Number(value.mode & 0o7777n);
  if ((mode & 0o022) !== 0 || !(directory ? [0o700, 0o755] : [0o600, 0o644]).includes(mode)) fail('MODE_INVALID');
  if (!directory && value.nlink !== 1n) fail('HARDLINK');
  return { identity: identity(value), mode, size: Number(value.size) };
}
function allowedPath(path, directory) {
  if (path.length > 1024 || !path.split('/').every(part => /^[A-Za-z0-9._-]+$/u.test(part)
    && part !== '.' && part !== '..')) return false;
  const parts = path.split('/');
  if (parts.some(part => part.startsWith('.'))
    && !(directory ? path === '.well-known' : HIDDEN.has(path))) return false;
  if (directory) return TOP_DIRECTORIES.has(parts[0]);
  if (/\.(?:html?|xhtml)$/iu.test(path)) return HTML.has(path);
  if (HIDDEN.has(path)) return true;
  if (parts.length === 1) return ROOT_FILES.has(path);
  if (path === 'legal/warpkeep-legal.css') return true;
  const name = parts.at(-1);
  if (parts[0] === 'assets') return /\.(?:js|css)$/u.test(name)
    && !/(?:qa(?:Journey|Observer|Main|Harness|Fixture)|local[-_]?qa)/iu.test(name);
  if (parts[0] === 'audio') return /\.mp3$/u.test(name)
    || ['audio/warpkeep-verdant-menu-theme.m4a', 'audio/warpkeep-genesis-002-theme.m4a'].includes(path);
  if (parts[0] === 'images') return /\.(?:png|webp)$/u.test(name);
  if (parts[0] === 'models') return /\.glb$/u.test(name)
    || path === 'models/greater-realm/biome-trees/v3/manifest.json';
  return parts[0] === 'video' && /\.mp4$/u.test(name);
}
function readFile(path, expected, document) {
  const before = state(path, false);
  if (expected) same(before, expected);
  const maximum = document ? LIMITS.documentBytes : LIMITS.fileBytes;
  if (!Number.isSafeInteger(before.size) || before.size < 0 || before.size > maximum) fail('FILE_BOUND');
  let descriptor;
  const buffer = Buffer.alloc(64 * 1024), hash = createHash('sha256'), chunks = document ? [] : null;
  try {
    descriptor = fs.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    same(identity(fs.fstatSync(descriptor, { bigint: true })), before.identity);
    let offset = 0;
    while (offset < before.size) {
      const size = Math.min(buffer.length, before.size - offset);
      const count = fs.readSync(descriptor, buffer, 0, size, offset);
      if (!Number.isInteger(count) || count < 1 || count > size) fail('CHANGED');
      hash.update(buffer.subarray(0, count));
      if (chunks) chunks.push(Buffer.from(buffer.subarray(0, count)));
      offset += count;
    }
    if (fs.readSync(descriptor, buffer, 0, 1, offset) !== 0) fail('CHANGED');
    same(identity(fs.fstatSync(descriptor, { bigint: true })), before.identity);
    same(state(path, false), before);
    let text;
    if (chunks) {
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)); }
      catch { fail('DOCUMENT_ENCODING'); }
    }
    return { ...before, sha256: hash.digest('hex'), text };
  } finally {
    buffer.fill(0);
    if (chunks) for (const chunk of chunks) chunk.fill(0);
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}
function captureTree(outputRoot) {
  const files = [], directories = [], documents = new Map();
  let totalBytes = 0, entries = 0;
  function visit(path, relative, depth) {
    if (depth > LIMITS.depth || directories.length >= LIMITS.directories) fail('TREE_BOUND');
    const before = state(path, true), names = [];
    const directory = fs.opendirSync(path);
    try {
      let entry;
      while ((entry = directory.readSync()) !== null) {
        if (++entries > LIMITS.files + LIMITS.directories) fail('TREE_BOUND');
        names.push(entry.name);
      }
    } finally { directory.closeSync(); }
    names.sort();
    directories.push(Object.freeze({ path: relative, mode: before.mode, identity: before.identity,
      entriesSha256: sha(Buffer.from(JSON.stringify(names))) }));
    for (const name of names) {
      const childRelative = relative ? relative + '/' + name : name, child = join(path, name);
      const childState = fs.lstatSync(child, { bigint: true });
      if (childState.isSymbolicLink() || (!childState.isDirectory() && !childState.isFile())) fail('NONREGULAR_PATH');
      if (!allowedPath(childRelative, childState.isDirectory())) fail('PATH_LEAK');
      if (childState.isDirectory()) visit(child, childRelative, depth + 1);
      else {
        if (files.length >= LIMITS.files) fail('TREE_BOUND');
        const size = Number(childState.size);
        if (!Number.isSafeInteger(size) || size < 0 || size > LIMITS.fileBytes) fail('FILE_BOUND');
        totalBytes += size;
        if (!Number.isSafeInteger(totalBytes) || totalBytes > LIMITS.totalBytes) fail('TOTAL_BOUND');
        const captured = readFile(child, { identity: identity(childState),
          mode: Number(childState.mode & 0o7777n), size }, HTML.has(childRelative));
        if (captured.size !== size) fail('CHANGED');
        files.push(Object.freeze({ path: childRelative, bytes: captured.size, mode: captured.mode,
          sha256: captured.sha256, identity: captured.identity }));
        if (captured.text !== undefined) documents.set(childRelative, captured.text);
      }
    }
    same(state(path, true), before);
  }
  visit(outputRoot, '', 0);
  files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  directories.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  if (!isDeepStrictEqual([...documents.keys()].sort(), [...HTML].sort())) fail('DOCUMENT_INVENTORY');
  return { files, directories, documents, totalBytes };
}
function attributes(tag) {
  const opening = /^<[A-Za-z]+\b/u.exec(tag);
  if (!opening) fail('DOCUMENT_REFERENCE');
  const source = tag.slice(opening[0].length).replace(/\/?\s*>$/u, ''), values = new Map();
  const pattern = /\s+([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/uy;
  let offset = 0;
  while (offset < source.length) {
    if (/^\s*$/u.test(source.slice(offset))) break;
    pattern.lastIndex = offset;
    const match = pattern.exec(source);
    if (!match || match.index !== offset) fail('DOCUMENT_REFERENCE');
    const name = match[1].toLowerCase();
    if (values.has(name)) fail('DOCUMENT_REFERENCE');
    values.set(name, match[2] ?? match[3] ?? match[4] ?? '');
    offset = pattern.lastIndex;
  }
  return values;
}
function references(documentPath, original, base, files) {
  const document = original.replace(/<!--[\s\S]*?-->/gu, '');
  if (/<base\b/iu.test(document)) fail('DOCUMENT_REFERENCE');
  const tagPattern = /<(?:script|link)\b(?:[^"'>]|"[^"]*"|'[^']*')*>/giu;
  const scripts = [], stylesheets = [], modulePreloads = [];
  function localTarget(url, suffix) {
    if (typeof url !== 'string' || !url.startsWith(base) || /[%&#?\\\x00-\x20\x7f]/u.test(url)) fail('REFERENCE_BASE');
    const path = url.slice(base.length);
    if (!allowedPath(path, false) || !suffix.test(path) || !files.has(path)) fail('REFERENCE_MISSING');
    return path;
  }
  for (const match of document.matchAll(tagPattern)) {
    const values = attributes(match[0]);
    if (/^<script\b/iu.test(match[0])) {
      if (values.get('type') !== 'module' || !/^\s*<\/script\s*>/iu.test(document.slice(match.index + match[0].length))) fail('DOCUMENT_REFERENCE');
      scripts.push(localTarget(values.get('src'), /^assets\/[A-Za-z0-9_-]+\.js$/u));
    } else {
      const rel = (values.get('rel') ?? '').toLowerCase().split(/\s+/u);
      if (rel.includes('stylesheet')) stylesheets.push(localTarget(values.get('href'), /\.css$/u));
      if (rel.includes('modulepreload')) modulePreloads.push(localTarget(values.get('href'), /^assets\/[A-Za-z0-9_-]+\.js$/u));
    }
  }
  const entry = documentPath === 'index.html' ? 'application' : 'ownerCanary';
  if (scripts.length !== 1 || !new RegExp(`^assets/${entry}-[A-Za-z0-9_-]+\\.js$`, 'u').test(scripts[0])
    || !stylesheets.some(path => new RegExp(`^assets/${entry}-[A-Za-z0-9_-]+\\.css$`, 'u').test(path))
    || new Set(stylesheets).size !== stylesheets.length || new Set(modulePreloads).size !== modulePreloads.length) fail('DOCUMENT_REFERENCE');
  if (documentPath === 'index.html' && !['warpkeep-boot.css', 'warpkeep-noscript.css'].every(path => stylesheets.includes(path))) fail('DOCUMENT_REFERENCE');
  return Object.freeze({ path: documentPath, moduleScript: scripts[0], stylesheets: Object.freeze(stylesheets),
    modulePreloads: Object.freeze(modulePreloads) });
}

export function captureNativeBuildOutput(repositoryRoot, variant) {
  if (process.platform !== 'linux' || process.getuid?.() !== 1000 || process.getgid?.() !== 1000) fail('HOST_INVALID');
  if (!canonicalPath(repositoryRoot) || typeof variant !== 'string' || !Object.hasOwn(BASES, variant)) fail('INPUT_INVALID');
  const rootBefore = state(repositoryRoot, true), outputRoot = join(repositoryRoot, 'dist'), base = BASES[variant];
  const first = captureTree(outputRoot), fileMap = new Map(first.files.map(file => [file.path, file]));
  const documents = Object.freeze(['index.html', 'owner-canary/index.html'].map(path =>
    references(path, first.documents.get(path), base, fileMap)));
  // A second complete hash/inventory pass catches writes to earlier files and added/removed paths.
  const second = captureTree(outputRoot);
  same({ files: first.files, directories: first.directories, totalBytes: first.totalBytes },
    { files: second.files, directories: second.directories, totalBytes: second.totalBytes });
  same(state(repositoryRoot, true), rootBefore);
  const files = Object.freeze(first.files), directories = Object.freeze(first.directories);
  const contentManifestSha256 = sha(Buffer.from(JSON.stringify(files.map(({ path, bytes, mode, sha256 }) =>
    ({ path, bytes, mode, sha256 }))) + '\n'));
  return Object.freeze({ schemaVersion: 1, profile: NATIVE_BUILD_OUTPUT_PROFILE, variant, base, outputRoot,
    repositoryIdentity: rootBefore.identity, fileCount: files.length, directoryCount: directories.length,
    totalBytes: first.totalBytes, files, directories, documents, contentManifestSha256,
    inventoryStable: true, environmentVerified: false, releaseAuthorized: false,
    scope: 'Actual bounded native dist bytes and critical document references only. Actual build environment, terminal, source, exclusion/public-boundary/miniapp checks and CI/release authority require separate producer evidence.' });
}
