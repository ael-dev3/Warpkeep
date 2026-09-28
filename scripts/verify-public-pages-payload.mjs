import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SyntaxKind } from 'typescript/unstable/ast';
import {
  isArrayLiteralExpression,
  isCallExpression,
  isExportDeclaration,
  isIdentifier,
  isImportDeclaration,
  isNoSubstitutionTemplateLiteral,
  isNumericLiteral,
  isStringLiteral,
} from 'typescript/unstable/ast/is';
import { createVirtualFileSystem } from 'typescript/unstable/fs';
import { API as TypeScriptAPI } from 'typescript/unstable/sync';

import { readLocalBindingBoundedFile } from './local-binding-bounded-file.mjs';
import { verifyProductionDistExclusions } from './verify-production-dist-exclusions.mjs';
import { rootAssetUrls } from './verify-alpha-production.mjs';

const SOURCE_SHA = /^[a-f0-9]{40}$/u;
const CANONICAL_ORIGIN = 'https://warpkeep.com';
const MANIFEST_PATH = 'artifacts/delivery/0.4.0/public-pages-payload-v1.json';
const PUBLICATION_PATHS = new Set(['/', '/ptr/']);
const MAX_FILES = 20_000;
const MAX_FILE_BYTES = 64 * 1024 * 1024;
const MAX_TOTAL_BYTES = 150 * 1024 * 1024;
const REQUIRED_FILES = Object.freeze([
  '.well-known/farcaster.json',
  'apple-touch-icon-180-fe27e8dc1c97cc36.png',
  'favicon-64-7b82ca973fe757f5.png',
  'index.html',
  'legal/warpkeep-legal.css',
  'owner-canary/index.html',
  'privacy/index.html',
  'social-contract/index.html',
  'terms/index.html',
  'warpkeep-boot.css',
  'warpkeep-noscript.css',
]);
const ROOT_FILES = new Set(REQUIRED_FILES.filter(path => !path.includes('/')));
const DIRECTORIES = new Set([
  '.well-known', 'assets', 'audio', 'images', 'legal', 'models',
  'owner-canary', 'privacy', 'social-contract', 'terms', 'video',
]);

export class PublicPagesPayloadError extends Error {
  constructor(code) {
    super(code);
    this.name = 'PublicPagesPayloadError';
    this.code = code;
  }
}

function fail(code) {
  throw new PublicPagesPayloadError(code);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function git(repositoryRoot, args, maxBuffer = 64 * 1024) {
  const result = spawnSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    shell: false,
    timeout: 10_000,
    maxBuffer,
    windowsHide: true,
  });
  if (result.error || result.status !== 0 || result.signal) {
    fail('PUBLIC_PAGES_PAYLOAD_SOURCE_UNAVAILABLE');
  }
  return result.stdout.trim();
}

function sourceIdentity(repositoryRoot, expectedSourceCommit) {
  if (!SOURCE_SHA.test(expectedSourceCommit ?? '')) {
    fail('PUBLIC_PAGES_PAYLOAD_SOURCE_INVALID');
  }
  const root = realpathSync(resolve(repositoryRoot));
  if (realpathSync(resolve(git(root, ['rev-parse', '--show-toplevel']))) !== root) {
    fail('PUBLIC_PAGES_PAYLOAD_REPOSITORY_MISMATCH');
  }
  const sourceCommit = git(root, ['rev-parse', 'HEAD']);
  const sourceTree = git(root, ['rev-parse', 'HEAD^{tree}']);
  if (
    sourceCommit !== expectedSourceCommit
    || !SOURCE_SHA.test(sourceTree)
    || git(root, ['status', '--porcelain=v1', '--untracked-files=all']) !== ''
  ) {
    fail('PUBLIC_PAGES_PAYLOAD_SOURCE_CHANGED');
  }
  // Status can omit working bytes hidden by assume-unchanged or skip-worktree.
  // A candidate build must come from a fully visible checkout at both scans.
  const indexed = git(root, ['ls-files', '-v', '-z', '--cached'], 4 * 1024 * 1024).split('\0');
  if (indexed.length < 2 || indexed.pop() !== '' || indexed.some(entry => !entry.startsWith('H '))) {
    fail('PUBLIC_PAGES_PAYLOAD_SOURCE_CHANGED');
  }
  return Object.freeze({ root, sourceCommit, sourceTree });
}

export function allowedPath(path, directory) {
  if (
    path.length > 1024
    || /[^\x20-\x7e]/u.test(path)
    || path.includes('\\')
    || path.split('/').some(segment => !segment || segment === '.' || segment === '..')
  ) return false;
  if (directory) {
    return DIRECTORIES.has(path.split('/')[0])
      && path.split('/').every(segment => /^[A-Za-z0-9._-]+$/u.test(segment));
  }
  if (!path.includes('/')) return ROOT_FILES.has(path);
  if (REQUIRED_FILES.includes(path)) return true;
  const segments = path.split('/');
  if (segments.some(segment => !/^[A-Za-z0-9._-]+$/u.test(segment))) return false;
  const top = segments[0];
  const name = segments.at(-1);
  if (top === 'assets') return /\.(?:css|js)$/u.test(name);
  if (top === 'audio') return /\.mp3$/u.test(name)
    || path === 'audio/warpkeep-verdant-menu-theme.m4a';
  if (top === 'images') return /\.(?:png|webp)$/u.test(name);
  if (top === 'models') return /\.glb$/u.test(name);
  if (top === 'video') return /\.mp4$/u.test(name);
  return false;
}

function sameDirectoryIdentity(before, after) {
  return ['dev', 'ino', 'mode', 'uid', 'nlink', 'mtimeNs', 'ctimeNs']
    .every(key => before[key] === after[key]);
}

function javascriptDependencies(path, source, sourceFile) {
  const dependencies = new Set();
  const mapSource = source.match(/m\.f=\[([^\]]{0,16384})\]/u)?.[1];
  let viteDependencies;
  if (mapSource !== undefined) {
    try {
      viteDependencies = JSON.parse(`[${mapSource}]`);
    } catch {
      fail('PUBLIC_PAGES_PAYLOAD_SCRIPT_GRAPH_INVALID');
    }
    if (
      !Array.isArray(viteDependencies)
      || viteDependencies.length > 512
      || viteDependencies.some(value => (
        typeof value !== 'string'
        || !/^assets\/[A-Za-z0-9._-]+\.(?:css|js)$/u.test(value)
      ))
    ) fail('PUBLIC_PAGES_PAYLOAD_SCRIPT_GRAPH_INVALID');
  }
  function addRelative(specifier) {
    if (!/^\.{1,2}\/[A-Za-z0-9._/-]+\.js$/u.test(specifier)) {
      fail('PUBLIC_PAGES_PAYLOAD_SCRIPT_GRAPH_INVALID');
    }
    const target = posix.normalize(posix.join(posix.dirname(path), specifier));
    if (!/^assets\/[A-Za-z0-9._-]+\.js$/u.test(target)) {
      fail('PUBLIC_PAGES_PAYLOAD_SCRIPT_GRAPH_INVALID');
    }
    dependencies.add(target);
  }
  const visit = node => {
    if (
      (isImportDeclaration(node) || isExportDeclaration(node))
      && node.moduleSpecifier !== undefined
      && isStringLiteral(node.moduleSpecifier)
      && node.moduleSpecifier.text.startsWith('.')
    ) addRelative(node.moduleSpecifier.text);
    if (isCallExpression(node)) {
      if (node.expression.kind === SyntaxKind.ImportKeyword) {
        const specifier = node.arguments[0];
        if (
          specifier
          && (isStringLiteral(specifier) || isNoSubstitutionTemplateLiteral(specifier))
          && specifier.text.startsWith('.')
        ) addRelative(specifier.text);
      } else if (
        isIdentifier(node.expression)
        && node.expression.text === '__vite__mapDeps'
      ) {
        if (!viteDependencies || !isArrayLiteralExpression(node.arguments[0])) {
          fail('PUBLIC_PAGES_PAYLOAD_SCRIPT_GRAPH_INVALID');
        }
        for (const index of node.arguments[0].elements) {
          if (!isNumericLiteral(index) || !/^\d+$/u.test(index.text)) {
            fail('PUBLIC_PAGES_PAYLOAD_SCRIPT_GRAPH_INVALID');
          }
          const target = viteDependencies[Number(index.text)];
          if (target === undefined) fail('PUBLIC_PAGES_PAYLOAD_SCRIPT_GRAPH_INVALID');
          dependencies.add(target);
        }
      }
    }
    node.forEachChild(visit);
  };
  sourceFile.forEachChild(visit);
  return dependencies;
}

function createJavascriptParser() {
  const virtualFs = createVirtualFileSystem({});
  const api = new TypeScriptAPI({ cwd: '/warpkeep-public-pages-payload', fs: virtualFs });
  let previousFile;
  return Object.freeze({
    dependencies(path, source) {
      const fileName = `/warpkeep-public-pages-payload/${path}`;
      const previousFiles = previousFile === undefined ? [] : [previousFile];
      let snapshot;
      try {
        for (const previous of previousFiles) virtualFs.removeFile(previous);
        virtualFs.writeFile(fileName, source);
        snapshot = api.updateSnapshot({
          openFiles: [fileName],
          closeFiles: previousFiles,
          fileChanges: { created: [fileName], deleted: previousFiles },
        });
        previousFile = fileName;
        const project = snapshot.getDefaultProjectForFile(fileName);
        const sourceFile = project?.program.getSourceFile(fileName);
        if (
          !sourceFile
          || sourceFile.text !== source
          || project.program.getSyntacticDiagnostics(fileName).length > 0
        ) fail('PUBLIC_PAGES_PAYLOAD_SCRIPT_GRAPH_INVALID');
        return javascriptDependencies(path, source, sourceFile);
      } catch (error) {
        if (error instanceof PublicPagesPayloadError) throw error;
        fail('PUBLIC_PAGES_PAYLOAD_SCRIPT_GRAPH_INVALID');
      } finally {
        snapshot?.dispose();
      }
    },
    close() { api.close(); },
  });
}

function inspectDist(distRoot, expectedSourceCommit, publicationPath) {
  const rootStatus = lstatSync(distRoot, { bigint: true });
  if (
    !rootStatus.isDirectory()
    || rootStatus.isSymbolicLink()
    || realpathSync(distRoot) !== distRoot
  ) fail('PUBLIC_PAGES_PAYLOAD_DIST_INVALID');

  const entries = [];
  const knownPaths = new Set();
  const knownCasefoldPaths = new Set();
  const directories = [];
  const shaBearingScripts = new Set();
  const scriptGraph = new Map();
  const javascriptParser = createJavascriptParser();
  let indexHtml;
  let totalByteLength = 0;

  function walk(directory, prefix = '') {
    const before = lstatSync(directory, { bigint: true });
    if (!before.isDirectory() || before.isSymbolicLink()) {
      fail('PUBLIC_PAGES_PAYLOAD_FILE_BOUNDARY_INVALID');
    }
    directories.push({ path: directory, before });
    for (const name of readdirSync(directory).sort()) {
      const path = `${prefix}${name}`;
      const fullPath = join(directory, name);
      const state = lstatSync(fullPath, { bigint: true });
      const isDirectory = state.isDirectory();
      if (
        !allowedPath(path, isDirectory)
        || state.isSymbolicLink()
        || (!isDirectory && !state.isFile())
        || knownCasefoldPaths.has(path.toLowerCase())
      ) fail('PUBLIC_PAGES_PAYLOAD_FILE_BOUNDARY_INVALID');
      knownPaths.add(path);
      knownCasefoldPaths.add(path.toLowerCase());
      if (knownPaths.size > MAX_FILES) fail('PUBLIC_PAGES_PAYLOAD_SIZE_INVALID');
      if (isDirectory) {
        walk(fullPath, `${path}/`);
        continue;
      }
      if (state.size > BigInt(MAX_FILE_BYTES)) {
        fail('PUBLIC_PAGES_PAYLOAD_SIZE_INVALID');
      }
      const opened = readLocalBindingBoundedFile(fullPath, {
        maximumBytes: MAX_FILE_BYTES,
      });
      try {
        totalByteLength += opened.body.byteLength;
        if (totalByteLength > MAX_TOTAL_BYTES) {
          fail('PUBLIC_PAGES_PAYLOAD_SIZE_INVALID');
        }
        entries.push(Object.freeze({
          path,
          byteLength: opened.body.byteLength,
          sha256: sha256(opened.body),
        }));
        if (path === 'index.html') indexHtml = opened.body.toString('utf8');
        if (path.startsWith('assets/') && path.endsWith('.js')) {
          const source = opened.body.toString('utf8');
          scriptGraph.set(path, javascriptParser.dependencies(path, source));
          if (source.includes(expectedSourceCommit)) shaBearingScripts.add(path);
        }
      } finally {
        opened.body.fill(0);
      }
    }
    if (!sameDirectoryIdentity(before, lstatSync(directory, { bigint: true }))) {
      fail('PUBLIC_PAGES_PAYLOAD_FILE_CHANGED');
    }
  }
  try {
    walk(distRoot);
  } finally {
    javascriptParser.close();
  }
  for (const { path, before } of directories) {
    if (!sameDirectoryIdentity(before, lstatSync(path, { bigint: true }))) {
      fail('PUBLIC_PAGES_PAYLOAD_FILE_CHANGED');
    }
  }
  if (REQUIRED_FILES.some(path => !knownPaths.has(path))) {
    fail('PUBLIC_PAGES_PAYLOAD_REQUIRED_FILE_MISSING');
  }
  if (
    !indexHtml.includes('<link rel="canonical" href="https://warpkeep.com/"')
    || !indexHtml.includes('<meta property="og:url" content="https://warpkeep.com/"')
  ) fail('PUBLIC_PAGES_PAYLOAD_ORIGIN_INVALID');
  const rootAssets = rootAssetUrls(indexHtml, CANONICAL_ORIGIN, publicationPath);
  const reachable = new Set();
  const pending = rootAssets
    .filter(asset => asset.pathname.endsWith('.js'))
    .map(asset => asset.pathname.slice(publicationPath.length));
  while (pending.length > 0) {
    const path = pending.pop();
    if (reachable.has(path)) continue;
    reachable.add(path);
    if (!scriptGraph.has(path)) {
      fail('PUBLIC_PAGES_PAYLOAD_BUILD_IDENTITY_INVALID');
    }
    for (const dependency of scriptGraph.get(path)) {
      if (!knownPaths.has(dependency)) {
        fail('PUBLIC_PAGES_PAYLOAD_BUILD_IDENTITY_INVALID');
      }
      if (dependency.endsWith('.js')) pending.push(dependency);
    }
  }
  if (
    rootAssets.some(asset => (
      asset.search !== ''
      || asset.hash !== ''
      || !knownPaths.has(asset.pathname.slice(publicationPath.length))
    ))
    || ![...reachable].some(path => shaBearingScripts.has(path))
  ) fail('PUBLIC_PAGES_PAYLOAD_BUILD_IDENTITY_INVALID');
  entries.sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
  return Object.freeze({
    entries: Object.freeze(entries),
    contentManifestSha256: sha256(Buffer.from(JSON.stringify(entries))),
    totalByteLength,
    rootHtmlSha256: entries.find(entry => entry.path === 'index.html').sha256,
  });
}

/** Candidate-only local inspection. This does not grant release or deployment authority. */
export function verifyPublicPagesPayload({
  repositoryRoot, expectedSourceCommit, publicationPath = '/',
}) {
  if (!PUBLICATION_PATHS.has(publicationPath)) fail('PUBLIC_PAGES_PAYLOAD_PUBLICATION_PATH_INVALID');
  const source = sourceIdentity(repositoryRoot, expectedSourceCommit);
  const distRoot = join(source.root, 'dist');
  verifyProductionDistExclusions(distRoot);
  const content = inspectDist(distRoot, source.sourceCommit, publicationPath);
  // A changed source or index during scanning invalidates the candidate.
  const after = sourceIdentity(repositoryRoot, expectedSourceCommit);
  if (after.sourceTree !== source.sourceTree) {
    fail('PUBLIC_PAGES_PAYLOAD_SOURCE_CHANGED');
  }
  const manifest = Object.freeze({
    schemaVersion: 1,
    profile: 'warpkeep-public-pages-payload-v1',
    canonicalOrigin: CANONICAL_ORIGIN,
    sourceCommit: source.sourceCommit,
    sourceTree: source.sourceTree,
    publicationPath,
    fileCount: content.entries.length,
    totalByteLength: content.totalByteLength,
    rootHtmlSha256: content.rootHtmlSha256,
    contentManifestSha256: content.contentManifestSha256,
    files: content.entries,
  });
  return Object.freeze({
    manifest,
    bytes: Buffer.from(`${JSON.stringify(manifest)}\n`, 'utf8'),
  });
}

/** Writes only the ignored local manifest, after full read-only verification. */
export function writePublicPagesPayloadManifest(options) {
  const result = verifyPublicPagesPayload(options);
  const root = realpathSync(resolve(options.repositoryRoot));
  const output = join(root, MANIFEST_PATH);
  const directory = dirname(output);
  let current = root;
  for (const segment of ['artifacts', 'delivery', '0.4.0']) {
    current = join(current, segment);
    if (!existsSync(current)) mkdirSync(current);
    const status = lstatSync(current);
    if (!status.isDirectory() || status.isSymbolicLink() || realpathSync(current) !== current) {
      fail('PUBLIC_PAGES_PAYLOAD_OUTPUT_INVALID');
    }
  }
  if (existsSync(output) && (!lstatSync(output).isFile() || lstatSync(output).isSymbolicLink())) {
    fail('PUBLIC_PAGES_PAYLOAD_OUTPUT_INVALID');
  }
  const temporary = join(directory, `.public-pages-payload-${randomBytes(8).toString('hex')}.tmp`);
  let descriptor;
  try {
    descriptor = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
    writeFileSync(descriptor, result.bytes);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporary, output);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (existsSync(temporary)) unlinkSync(temporary);
  }
  // Read the saved bytes, not the in-memory value, before returning success.
  if (!readFileSync(output).equals(result.bytes)) {
    fail('PUBLIC_PAGES_PAYLOAD_OUTPUT_CHANGED');
  }
  return Object.freeze({ path: output, manifestSha256: sha256(result.bytes) });
}

/** Rechecks a saved local candidate after any intervening build or file change. */
export function checkPublicPagesPayloadManifest(options) {
  const result = verifyPublicPagesPayload(options);
  const root = realpathSync(resolve(options.repositoryRoot));
  const output = join(root, MANIFEST_PATH);
  let current = root;
  for (const segment of ['artifacts', 'delivery', '0.4.0']) {
    current = join(current, segment);
    if (!existsSync(current)) fail('PUBLIC_PAGES_PAYLOAD_MANIFEST_MISSING');
    const status = lstatSync(current);
    if (!status.isDirectory() || status.isSymbolicLink() || realpathSync(current) !== current) {
      fail('PUBLIC_PAGES_PAYLOAD_OUTPUT_INVALID');
    }
  }
  if (!existsSync(output)) fail('PUBLIC_PAGES_PAYLOAD_MANIFEST_MISSING');
  const opened = readLocalBindingBoundedFile(output, { maximumBytes: 4 * 1024 * 1024 });
  try {
    if (!opened.body.equals(result.bytes)) {
      fail('PUBLIC_PAGES_PAYLOAD_MANIFEST_MISMATCH');
    }
  } finally {
    opened.body.fill(0);
  }
  return Object.freeze({ path: output, manifestSha256: sha256(result.bytes) });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const mode = process.argv[2];
    const sourceCommit = process.argv[3];
    let publicationPath = '/';
    if (process.argv.length === 6 && process.argv[4] === '--publication-path') {
      publicationPath = process.argv[5];
    } else if (process.argv.length !== 4) fail('PUBLIC_PAGES_PAYLOAD_ARGUMENT_INVALID');
    if (!['--write', '--check'].includes(mode) || !SOURCE_SHA.test(sourceCommit ?? '')
      || !PUBLICATION_PATHS.has(publicationPath)) fail('PUBLIC_PAGES_PAYLOAD_ARGUMENT_INVALID');
    const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const options = {
      repositoryRoot,
      expectedSourceCommit: sourceCommit,
      publicationPath,
    };
    const result = mode === '--write'
      ? writePublicPagesPayloadManifest(options)
      : checkPublicPagesPayloadManifest(options);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof PublicPagesPayloadError
      ? error.code
      : 'PUBLIC_PAGES_PAYLOAD_INVALID'}\n`);
    process.exitCode = 1;
  }
}
