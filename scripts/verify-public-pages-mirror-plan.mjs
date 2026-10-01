import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  lstatSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  closeSync,
  existsSync,
  fsyncSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  checkPublicPagesPayloadManifest,
  verifyPublicPagesPayload,
} from './verify-public-pages-payload.mjs';

const COMMIT = /^[a-f0-9]{40}$/u;
const PUBLIC_ORIGIN = 'https://github.com/ael-dev3/Warpkeep-Live.git';
const PAYLOAD_MANIFEST = 'artifacts/delivery/0.4.0/public-pages-payload-v1.json';
const REVIEWED_PLAN = 'artifacts/delivery/0.4.0/public-pages-ptr-mirror-plan-v1.json';
export const PUBLIC_PAGES_MIRROR_MANIFEST_PATH =
  'docs/releases/0.4.0/public-pages-ptr-payload-v1.json';
const PTR_PREFIX = 'ptr/';
const HOST_FILES = new Set(['.nojekyll', '404.html', 'CNAME']);
const GENERATED_ROOT_FILES = new Set([
  'apple-touch-icon-180-fe27e8dc1c97cc36.png',
  'favicon-64-7b82ca973fe757f5.png',
  'index.html',
  'warpkeep-boot.css',
  'warpkeep-noscript.css',
]);
const GENERATED_DIRECTORIES = new Set([
  '.well-known', 'assets', 'audio', 'images', 'legal', 'models',
  'owner-canary', 'privacy', 'social-contract', 'terms', 'video',
]);
export const SOURCE_PUBLIC_DOCUMENTS = Object.freeze([
  'ASSETS-LICENSE.md',
  'LICENSE',
  'LICENSE-CC-BY-4.0',
  'LICENSING.md',
  'NOTICE',
  'TRADEMARKS.md',
  'docs/legal/license-inventory.md',
  'licenses/LicenseRef-Warpkeep-Provenance-Required.txt',
  'licenses/legacy/LICENSE-0BSD-v0.2.0',
  'licenses/legacy/LICENSE-CC0-1.0-v0.2.0',
]);
const PUBLIC_DOCUMENT_SET = new Set([...SOURCE_PUBLIC_DOCUMENTS, 'README.md']);

export class PublicPagesMirrorPlanError extends Error {
  constructor(code) {
    super(code);
    this.name = 'PublicPagesMirrorPlanError';
    this.code = code;
  }
}

function fail(code) {
  throw new PublicPagesMirrorPlanError(code);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function git(root, args, maxBuffer = 4 * 1024 * 1024, encoding = 'utf8') {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding,
    shell: false,
    timeout: 30_000,
    maxBuffer,
    windowsHide: true,
  });
  if (result.error || result.status !== 0 || result.signal) {
    fail('PUBLIC_PAGES_MIRROR_GIT_INVALID');
  }
  return result.stdout;
}

function safeRelativePath(path) {
  return path.length <= 1024
    && !/[^\x20-\x7e]/u.test(path)
    && !path.includes('\\')
    && path.split('/').every(segment => segment !== '.' && segment !== '..'
      && /^[A-Za-z0-9._-]+$/u.test(segment));
}

export function generatedPath(path) {
  if (!safeRelativePath(path)) return false;
  if (path === 'ptr/404.html') return true;
  if (path.startsWith(PTR_PREFIX)) {
    const nestedPath = path.slice(PTR_PREFIX.length);
    return !nestedPath.startsWith(PTR_PREFIX) && generatedPath(nestedPath);
  }
  if (!path.includes('/')) return GENERATED_ROOT_FILES.has(path);
  const parts = path.split('/');
  if (!GENERATED_DIRECTORIES.has(parts[0])) return false;
  const name = parts.at(-1);
  if (parts[0] === '.well-known') return path === '.well-known/farcaster.json';
  if (parts[0] === 'assets') return /\.(?:css|js)$/u.test(name);
  if (parts[0] === 'audio') return /\.mp3$/u.test(name)
    || path === 'audio/warpkeep-verdant-menu-theme.m4a';
  if (parts[0] === 'images') return /\.(?:png|webp)$/u.test(name);
  if (parts[0] === 'models') return /\.glb$/u.test(name);
  if (parts[0] === 'video') return /\.mp4$/u.test(name);
  if (parts[0] === 'legal') return path === 'legal/warpkeep-legal.css';
  return parts.length === 2 && name === 'index.html';
}

function approvedPublicPath(path) {
  return safeRelativePath(path) && (
    generatedPath(path)
    || HOST_FILES.has(path)
    || PUBLIC_DOCUMENT_SET.has(path)
    || path === PUBLIC_PAGES_MIRROR_MANIFEST_PATH
  );
}

export function inspectPublicMirror(publicRoot, expectedPublicHead) {
  if (!COMMIT.test(expectedPublicHead ?? '')) {
    fail('PUBLIC_PAGES_MIRROR_HEAD_INVALID');
  }
  const root = realpathSync(resolve(publicRoot));
  if (
    realpathSync(resolve(git(root, ['rev-parse', '--show-toplevel']).trim())) !== root
    || git(root, ['remote', 'get-url', '--all', 'origin']).trim() !== PUBLIC_ORIGIN
    || git(root, ['remote', 'get-url', '--push', '--all', 'origin']).trim() !== PUBLIC_ORIGIN
    || git(root, ['branch', '--show-current']).trim() !== 'main'
    || git(root, ['rev-parse', 'HEAD']).trim() !== expectedPublicHead
    || git(root, ['status', '--porcelain=v1', '--untracked-files=all']).trim() !== ''
  ) fail('PUBLIC_PAGES_MIRROR_CHECKOUT_INVALID');
  const publicTree = git(root, ['rev-parse', 'HEAD^{tree}']).trim();
  if (!COMMIT.test(publicTree)) fail('PUBLIC_PAGES_MIRROR_CHECKOUT_INVALID');
  const indexed = git(root, ['ls-files', '-v', '-z', '--cached']).split('\0');
  if (indexed.length < 2 || indexed.pop() !== '' || indexed.some(entry => !entry.startsWith('H '))) {
    fail('PUBLIC_PAGES_MIRROR_CHECKOUT_INVALID');
  }
  const tracked = new Set(git(root, ['ls-files', '-z']).split('\0').filter(Boolean));
  const seen = new Set();
  const seenFolded = new Set();
  function walk(directory, prefix = '') {
    for (const name of readdirSync(directory)) {
      const path = `${prefix}${name}`;
      if (prefix === '' && name === '.git') continue;
      const fullPath = join(directory, name);
      const state = lstatSync(fullPath);
      if (
        !safeRelativePath(path)
        || state.isSymbolicLink()
        || seenFolded.has(path.toLowerCase())
        || realpathSync(fullPath) !== fullPath
      ) fail('PUBLIC_PAGES_MIRROR_FILE_BOUNDARY_INVALID');
      seenFolded.add(path.toLowerCase());
      if (state.isDirectory()) {
        walk(fullPath, `${path}/`);
      } else if (state.isFile() && approvedPublicPath(path) && tracked.has(path)) {
        seen.add(path);
      } else {
        fail('PUBLIC_PAGES_MIRROR_FILE_BOUNDARY_INVALID');
      }
    }
  }
  walk(root);
  if (seen.size !== tracked.size || [...tracked].some(path => !seen.has(path))) {
    fail('PUBLIC_PAGES_MIRROR_FILE_BOUNDARY_INVALID');
  }
  if (
    [...PUBLIC_DOCUMENT_SET].some(path => !seen.has(path))
    || [...HOST_FILES].some(path => !seen.has(path))
    || !seen.has('index.html')
  ) fail('PUBLIC_PAGES_MIRROR_REQUIRED_FILE_MISSING');
  const currentCname = readFileSync(join(root, 'CNAME'));
  if (
    ![
      Buffer.from('warpkeep.com\n'),
      Buffer.from('warpkeep.com\r\n'),
    ].some(value => currentCname.equals(value))
    || readFileSync(join(root, '.nojekyll')).length !== 0
    || !readFileSync(join(root, '404.html')).equals(readFileSync(join(root, 'index.html')))
  ) fail('PUBLIC_PAGES_MIRROR_HOSTING_INVALID');
  if (seen.has('ptr/index.html') !== seen.has('ptr/404.html')
    || ([...seen].some(path => path.startsWith(PTR_PREFIX)) && !seen.has('ptr/index.html'))
    || (seen.has('ptr/index.html')
      && !readFileSync(join(root, 'ptr/404.html')).equals(readFileSync(join(root, 'ptr/index.html'))))) {
    fail('PUBLIC_PAGES_MIRROR_HOSTING_INVALID');
  }
  // Git status can hide a tracked edit via assume-unchanged. Fail unless a
  // full working-tree comparison also confirms the reviewed public commit.
  git(root, ['-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false',
    'diff', '--no-ext-diff', '--no-textconv', '--exit-code', 'HEAD', '--']);
  return Object.freeze({ root, publicTree, tracked: Object.freeze([...tracked]) });
}

/** Exact public README bytes for a future reviewed publication operator. */
export function renderPublicPagesMirrorReadme(manifest, manifestSha256) {
  if (
    !COMMIT.test(manifest?.sourceCommit ?? '')
    || !COMMIT.test(manifest?.sourceTree ?? '')
    || !/^[a-f0-9]{64}$/u.test(manifestSha256 ?? '')
  ) fail('PUBLIC_PAGES_MIRROR_README_INPUT_INVALID');
  return Buffer.from(
    '# Warpkeep Live\n\n'
    + 'This public repository keeps the existing Warpkeep Alpha at https://warpkeep.com/ '
    + 'and hosts the generated Warpkeep 0.4 owner PTR under https://warpkeep.com/ptr/. '
    + 'The development source and release controls remain '
    + 'in the private `ael-dev3/Warpkeep` repository.\n\n'
    + `Source commit: \`${manifest.sourceCommit}\`  \n`
    + `Source tree: \`${manifest.sourceTree}\`  \n`
    + `Payload manifest SHA-256: \`${manifestSha256}\`\n\n`
    + 'This repository contains generated public assets and their license and '
    + 'provenance records. PTR publication preserves the Alpha root files byte for '
    + 'byte. The PTR is owner-only; publication of these files does not open '
    + 'admissions or establish backend access.\n',
    'utf8',
  );
}

/** Read-only publication plan; never stages, commits, pushes or calls a provider. */
export function verifyPublicPagesMirrorPlan({
  sourceRoot,
  expectedSourceCommit,
  publicRoot,
  expectedPublicHead,
  publicationPath = '/ptr/',
}) {
  if (publicationPath !== '/ptr/') fail('PUBLIC_PAGES_MIRROR_PUBLICATION_PATH_INVALID');
  const mirror = inspectPublicMirror(publicRoot, expectedPublicHead);
  checkPublicPagesPayloadManifest({
    repositoryRoot: sourceRoot,
    expectedSourceCommit,
    publicationPath,
  });
  const payload = verifyPublicPagesPayload({
    repositoryRoot: sourceRoot,
    expectedSourceCommit,
    publicationPath,
  });
  const manifestBytes = readFileSync(join(resolve(sourceRoot), PAYLOAD_MANIFEST));
  if (!manifestBytes.equals(payload.bytes)) fail('PUBLIC_PAGES_MIRROR_PAYLOAD_CHANGED');
  const entries = new Map();
  for (const path of mirror.tracked) {
    if (path.startsWith(PTR_PREFIX) || path === 'README.md'
      || SOURCE_PUBLIC_DOCUMENTS.includes(path) || path === PUBLIC_PAGES_MIRROR_MANIFEST_PATH) continue;
    if (!generatedPath(path) && !HOST_FILES.has(path)) continue;
    // Publication preserves parent Git blobs, not checkout-smudged bytes.
    // Binary output also keeps models/audio exact without UTF-8 decoding.
    const bytes = git(mirror.root, ['show', `${expectedPublicHead}:${path}`],
      64 * 1024 * 1024, null);
    entries.set(path, Object.freeze({
      path,
      byteLength: bytes.length,
      sha256: sha256(bytes),
      origin: 'preserved-existing',
    }));
  }
  for (const entry of payload.manifest.files) {
    const path = `${PTR_PREFIX}${entry.path}`;
    if (entries.has(path)) fail('PUBLIC_PAGES_MIRROR_TARGET_COLLISION');
    entries.set(path, Object.freeze({
      path,
      byteLength: entry.byteLength,
      sha256: entry.sha256,
      origin: 'generated',
    }));
  }
  const publicReadme = renderPublicPagesMirrorReadme(
    payload.manifest,
    sha256(manifestBytes),
  );
  for (const [path, bytes] of [
    ['ptr/404.html', readFileSync(join(resolve(sourceRoot), 'dist/index.html'))],
    [PUBLIC_PAGES_MIRROR_MANIFEST_PATH, manifestBytes],
    ['README.md', publicReadme],
  ]) {
    if (entries.has(path)) fail('PUBLIC_PAGES_MIRROR_TARGET_COLLISION');
    entries.set(path, Object.freeze({
      path, byteLength: bytes.length, sha256: sha256(bytes), origin: 'hosting',
    }));
  }
  if (entries.get('ptr/404.html').sha256
    !== entries.get('ptr/index.html')?.sha256) {
    fail('PUBLIC_PAGES_MIRROR_PAYLOAD_CHANGED');
  }
  for (const path of SOURCE_PUBLIC_DOCUMENTS) {
    if (entries.has(path)) fail('PUBLIC_PAGES_MIRROR_TARGET_COLLISION');
    const bytes = readFileSync(join(resolve(sourceRoot), path));
    if (bytes.length > 1024 * 1024) fail('PUBLIC_PAGES_MIRROR_DOCUMENT_INVALID');
    const reviewedBlob = spawnSync('git', ['show', `${expectedSourceCommit}:${path}`], {
      cwd: resolve(sourceRoot),
      encoding: null,
      shell: false,
      timeout: 10_000,
      maxBuffer: 1024 * 1024 + 1,
      windowsHide: true,
    });
    if (
      reviewedBlob.error || reviewedBlob.status !== 0 || reviewedBlob.signal
      || !bytes.equals(reviewedBlob.stdout)
    ) fail('PUBLIC_PAGES_MIRROR_DOCUMENT_INVALID');
    entries.set(path, Object.freeze({
      path, byteLength: bytes.length, sha256: sha256(bytes), origin: 'reviewed-source',
    }));
  }
  const sortedEntries = [...entries.values()].sort((a, b) => (
    Buffer.compare(Buffer.from(a.path), Buffer.from(b.path))
  ));
  if (new Set(sortedEntries.map(entry => entry.path.toLowerCase())).size !== sortedEntries.length) {
    fail('PUBLIC_PAGES_MIRROR_TARGET_COLLISION');
  }
  return Object.freeze({
    schemaVersion: 2,
    profile: 'warpkeep-public-pages-ptr-mirror-plan-v1',
    publicationPath,
    sourceCommit: payload.manifest.sourceCommit,
    sourceTree: payload.manifest.sourceTree,
    publicParentCommit: expectedPublicHead,
    publicParentTree: mirror.publicTree,
    payloadManifestSha256: sha256(manifestBytes),
    preservedRootEntryCount: sortedEntries.filter(entry => entry.origin === 'preserved-existing').length,
    preservedRootManifestSha256: sha256(Buffer.from(JSON.stringify(
      sortedEntries.filter(entry => entry.origin === 'preserved-existing'),
    ))),
    targetFileCount: sortedEntries.length,
    targetEntries: Object.freeze(sortedEntries),
    obsoleteGeneratedPaths: Object.freeze(mirror.tracked.filter(path => (
      path.startsWith(PTR_PREFIX) && generatedPath(path) && !entries.has(path)
    )).sort()),
  });
}

/** Save the canonical reviewed input beside the ignored candidate manifest. */
export function writePublicPagesMirrorPlan(options) {
  const plan = verifyPublicPagesMirrorPlan(options);
  const bytes = Buffer.from(`${JSON.stringify(plan)}\n`, 'utf8');
  const source = realpathSync(resolve(options.sourceRoot));
  const output = join(source, REVIEWED_PLAN);
  const directory = dirname(output);
  if (!existsSync(directory) || !lstatSync(directory).isDirectory()
    || lstatSync(directory).isSymbolicLink()
    || realpathSync(directory) !== directory) {
    fail('PUBLIC_PAGES_MIRROR_OUTPUT_INVALID');
  }
  if (existsSync(output) && (!lstatSync(output).isFile()
    || lstatSync(output).isSymbolicLink())) fail('PUBLIC_PAGES_MIRROR_OUTPUT_INVALID');
  const temporary = join(directory, `.public-pages-mirror-${randomBytes(8).toString('hex')}.tmp`);
  let descriptor;
  try {
    descriptor = openSync(temporary, 'wx', 0o600);
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporary, output);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (existsSync(temporary)) unlinkSync(temporary);
  }
  if (!readFileSync(output).equals(bytes)
    || !Buffer.from(`${JSON.stringify(verifyPublicPagesMirrorPlan(options))}\n`).equals(bytes)) {
    fail('PUBLIC_PAGES_MIRROR_OUTPUT_CHANGED');
  }
  return Object.freeze({ path: output, planSha256: sha256(bytes),
    sourceCommit: plan.sourceCommit, publicParentCommit: plan.publicParentCommit,
    publicationPath: plan.publicationPath,
    preservedRootEntryCount: plan.preservedRootEntryCount,
    preservedRootManifestSha256: plan.preservedRootManifestSha256,
    targetFileCount: plan.targetFileCount,
    obsoleteGeneratedFileCount: plan.obsoleteGeneratedPaths.length });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (
      ![6, 7].includes(process.argv.length)
      || process.argv[2] !== '--public-root'
      || !COMMIT.test(process.argv[4] ?? '')
      || !COMMIT.test(process.argv[5] ?? '')
        || (process.argv.length === 7 && process.argv[6] !== '--write-plan')
    ) fail('PUBLIC_PAGES_MIRROR_ARGUMENT_INVALID');
    const options = {
      sourceRoot: resolve(dirname(fileURLToPath(import.meta.url)), '..'),
      publicRoot: process.argv[3],
      expectedSourceCommit: process.argv[4],
      expectedPublicHead: process.argv[5],
    };
    if (process.argv.length === 7) {
      process.stdout.write(`${JSON.stringify(writePublicPagesMirrorPlan(options))}\n`);
    } else {
      const plan = verifyPublicPagesMirrorPlan(options);
      process.stdout.write(`${JSON.stringify({
        profile: plan.profile,
        publicationPath: plan.publicationPath,
        sourceCommit: plan.sourceCommit,
        publicParentCommit: plan.publicParentCommit,
        payloadManifestSha256: plan.payloadManifestSha256,
        preservedRootEntryCount: plan.preservedRootEntryCount,
        preservedRootManifestSha256: plan.preservedRootManifestSha256,
        targetFileCount: plan.targetFileCount,
        obsoleteGeneratedFileCount: plan.obsoleteGeneratedPaths.length,
      })}\n`);
    }
  } catch (error) {
    process.stderr.write(`${error instanceof PublicPagesMirrorPlanError
      ? error.code
      : 'PUBLIC_PAGES_MIRROR_PLAN_INVALID'}\n`);
    process.exitCode = 1;
  }
}
