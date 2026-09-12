// @vitest-environment node
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statfsSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterEach, expect, it, vi } from 'vitest';
import * as boundedFiles from '../scripts/local-binding-bounded-file.mjs';
import { assertPreparedClosureScannerNamespace } from '../scripts/local-prepared-closure-scanner-namespace.mjs';
import { derivePreparedClosureScannerArchiveFiles } from '../scripts/local-prepared-closure-scanner-archive.mjs';
import { installPreparedClosureScanner } from '../scripts/local-prepared-closure-scanner.mjs';
import { derivePreparedClosureScannerManifest } from '../scripts/local-prepared-closure-scanner-manifest.mjs';

const integrity = (bytes: Buffer) => `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
const roots: string[] = [];
// Namespace attestation intentionally belongs to the native preparation owner
// and filesystem. Other CI hosts exercise rejection before any bounded read.
const supportedNamespaceHost = process.platform === 'linux' && process.arch === 'x64'
  && process.getuid?.() === 1000 && statfsSync(tmpdir()).type === 0xef53;
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) rmSync(root, {recursive: true}); });
function checksum(header: Buffer) {
  header.fill(32, 148, 156);
  const sum = header.reduce((total, byte) => total + byte, 0);
  header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
}
function tar(entries: {name: string; content: string; type?: string; mode?: number}[]) {
  const chunks: Buffer[] = [];
  for (const entry of entries) {
    const header = Buffer.alloc(512);
    header.write(`package/${entry.name}`);
    header.write(`${(entry.mode ?? 0o644).toString(8).padStart(7, '0')}\0`, 100, 8, 'ascii');
    header.write(`${Buffer.byteLength(entry.content).toString(8).padStart(11, '0')}\0`, 124, 12, 'ascii');
    header.write(entry.type ?? '0', 156);
    header.write('ustar\0', 257);
    checksum(header);
    const body = Buffer.alloc(Math.ceil(Buffer.byteLength(entry.content) / 512) * 512);
    body.write(entry.content);
    chunks.push(header, body);
  }
  return Buffer.concat([...chunks, Buffer.alloc(1024)]);
}
function archive(entries: Parameters<typeof tar>[0]) { return gzipSync(tar(entries)); }
it('authenticates the compressed archive before returning bounded, sorted owned bytes', () => {
  const bytes = archive([{name: 'lib/b.js', content: 'export const b = 2;'}, {name: 'lib/a.js', content: 'export const a = 1;'}]);
  const before = Buffer.from(bytes);
  const result = derivePreparedClosureScannerArchiveFiles(bytes, integrity(bytes));
  expect(result.map(file => [file.path, file.bytes.toString()])).toEqual([
    ['lib/a.js', 'export const a = 1;'], ['lib/b.js', 'export const b = 2;'],
  ]);
  result[0].bytes.fill(0);
  expect(bytes).toEqual(before);
  expect(derivePreparedClosureScannerArchiveFiles(bytes, integrity(bytes))[0].bytes.toString()).toBe('export const a = 1;');
});
it.each(['wrong-integrity', 'malformed-integrity', 'not-gzip', 'truncated-gzip', 'oversize'])('rejects %s before returning source bytes', kind => {
  let bytes = archive([{name: 'a.js', content: 'x'}]);
  let sri = integrity(bytes);
  if (kind === 'wrong-integrity') sri = integrity(Buffer.from('unrelated'));
  if (kind === 'malformed-integrity') sri = 'sha256-' + 'a'.repeat(64);
  if (kind === 'not-gzip') bytes = Buffer.from('not an archive');
  if (kind === 'truncated-gzip') bytes = bytes.subarray(0, bytes.length - 5);
  if (kind === 'oversize') bytes = Buffer.alloc(32 * 1024 * 1024 + 1);
  if (['not-gzip', 'truncated-gzip', 'oversize'].includes(kind)) sri = integrity(bytes);
  expect(() => derivePreparedClosureScannerArchiveFiles(bytes, sri)).toThrow('LOCAL_PREPARED_CLOSURE_SCANNER_ARCHIVE_INVALID');
});
it('rejects matching-integrity compressed data exceeding the decompression resource bound', () => {
  const bytes = gzipSync(Buffer.alloc(64 * 1024 * 1024 + 512));
  expect(() => derivePreparedClosureScannerArchiveFiles(bytes, integrity(bytes))).toThrow('LOCAL_PREPARED_CLOSURE_SCANNER_ARCHIVE_INVALID');
});
it.each(['../escape', '/absolute', 'a//b.js', 'a/./b.js', 'a\\b.js', 'a b.js'])('rejects noncanonical archive member %s', name => {
  const bytes = archive([{name, content: 'x'}]);
  expect(() => derivePreparedClosureScannerArchiveFiles(bytes, integrity(bytes))).toThrow();
});
it.each(['1', '2', '3', '5', 'x', 'g', 'L'])('rejects archive entry type %s (including links and metadata overrides)', type => {
  const bytes = archive([{name: 'a.js', content: 'x', type}]);
  expect(() => derivePreparedClosureScannerArchiveFiles(bytes, integrity(bytes))).toThrow();
});
it.each(['duplicate', 'case-collision', 'empty', 'special-mode'])('rejects %s archive members', kind => {
  const entries = [{name: 'a.js', content: 'x', mode: 0o644}];
  if (kind === 'duplicate') entries.push({...entries[0]});
  if (kind === 'case-collision') entries.push({...entries[0], name: 'A.js'});
  if (kind === 'empty') entries[0].content = '';
  if (kind === 'special-mode') entries[0].mode = 0o4755;
  const bytes = archive(entries);
  expect(() => derivePreparedClosureScannerArchiveFiles(bytes, integrity(bytes))).toThrow();
});
it.each(['checksum', 'member-size', 'padding', 'no-terminator', 'one-zero-block', 'trailing-data'])('rejects malformed tar %s even with matching compressed integrity', kind => {
  let raw = tar([{name: 'a.js', content: 'x'}]);
  if (kind === 'checksum') raw[0] = 0;
  if (kind === 'member-size') { raw.write('77777777777\0', 124, 12, 'ascii'); checksum(raw.subarray(0, 512)); }
  if (kind === 'padding') raw[513] = 1;
  if (kind === 'no-terminator') raw = raw.subarray(0, 1024);
  if (kind === 'one-zero-block') raw = raw.subarray(0, 1536);
  if (kind === 'trailing-data') raw[raw.length - 1] = 1;
  const bytes = gzipSync(raw);
  expect(() => derivePreparedClosureScannerArchiveFiles(bytes, integrity(bytes))).toThrow();
});
it('rejects caller runtime roots, source maps and executor hooks without reading accessors', () => {
  let invoked = false;
  const install = installPreparedClosureScanner as (...args: unknown[]) => unknown;
  expect(() => install({get root() { invoked = true; return '/tmp/caller'; }})).toThrow();
  expect(() => install({execute: () => { invoked = true; }})).toThrow();
  expect(() => (derivePreparedClosureScannerManifest as (...args: unknown[]) => unknown)({get archive() {
    invoked = true; return Buffer.alloc(0);
  }})).toThrow();
  expect(invoked).toBe(false);
});
it('records full package namespaces attributable to the committed service lock', () => {
  const manifest = JSON.parse(readFileSync(new URL('../scripts/local-prepared-closure-scanner-v1.json', import.meta.url), 'utf8'));
  const lock = readFileSync(new URL('../services/auth-bridge/pnpm-lock.yaml', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
  expect(manifest.profile).toBe('warpkeep-prepared-closure-scanner-linux-x64-v1');
  expect(manifest.packages.map((entry: {name: string}) => entry.name)).toEqual(['typescript', '@typescript/typescript-linux-x64']);
  for (const package_ of manifest.packages) {
    const key = package_.name.startsWith('@') ? `'${package_.name}@${package_.version}'` : `${package_.name}@${package_.version}`;
    expect(lock).toContain(`  ${key}:\n    resolution: {integrity: ${package_.integrity}}\n`);
    const paths = package_.files.map((file: {path: string}) => file.path);
    expect(paths).toEqual([...new Set(paths)].sort());
    expect(paths).toContain('package.json');
  }
  expect(manifest.packages[0].files.map((file: {path: string}) => file.path)).toContain('dist/api/sync/api.js');
  expect(manifest.packages[1].files.find((file: {path: string}) => file.path === 'lib/tsc').mode).toBe(0o500);
});
function namespaceFixture() {
  const root = mkdtempSync(join(tmpdir(), 'warpkeep-scanner-namespace-')); roots.push(root); chmodSync(root, 0o700);
  const records = ['@typescript/typescript-linux-x64/lib/tsc', 'typescript/dist/api/sync/api.js'].map((path, index) => {
    let current = root;
    for (const part of path.split('/').slice(0, -1)) {
      current = join(current, part); mkdirSync(current, {recursive: true, mode: 0o700}); chmodSync(current, 0o700);
    }
    const bytes = Buffer.from(index ? 'export const API = 1;' : 'native-executable-fixture');
    const mode = index ? 0o400 : 0o500;
    writeFileSync(join(root, path), bytes, {mode}); chmodSync(join(root, path), mode);
    return {path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), mode};
  });
  return {root, records};
}
it.skipIf(!supportedNamespaceHost)('accepts only the complete private namespace without mutating it', () => {
  const {root, records} = namespaceFixture();
  const read = vi.spyOn(boundedFiles, 'readLocalBindingBoundedFile');
  assertPreparedClosureScannerNamespace(root, records);
  expect(read).toHaveBeenCalledTimes(records.length);
  expect(readFileSync(join(root, records[0].path), 'utf8')).toBe('native-executable-fixture');
});
it.skipIf(supportedNamespaceHost)('rejects an unsupported namespace host before reading package bodies', () => {
  const {root, records} = namespaceFixture();
  const read = vi.spyOn(boundedFiles, 'readLocalBindingBoundedFile');
  expect(() => assertPreparedClosureScannerNamespace(root, records))
    .toThrow('LOCAL_PREPARED_CLOSURE_SCANNER_NAMESPACE_INVALID');
  expect(read).not.toHaveBeenCalled();
  expect(readFileSync(join(root, records[0].path), 'utf8')).toBe('native-executable-fixture');
});
it.skipIf(!supportedNamespaceHost).each(['native-binary', 'extra-file', 'ancestor', 'symlink'])('rejects late %s replacement during another real bounded read', kind => {
  const {root, records} = namespaceFixture();
  const native = join(root, records[0].path);
  const read = boundedFiles.readLocalBindingBoundedFile;
  let changed = false;
  vi.spyOn(boundedFiles, 'readLocalBindingBoundedFile').mockImplementation((path, options) => {
    const result = read(path, options);
    if (!changed && path === join(root, records[1].path)) {
      changed = true;
      if (kind === 'native-binary') { chmodSync(native, 0o600); writeFileSync(native, 'changed-native-executable'); chmodSync(native, 0o500); }
      if (kind === 'extra-file') writeFileSync(join(dirname(native), 'unexpected.js'), 'x', {mode: 0o400});
      if (kind === 'ancestor') chmodSync(dirname(native), 0o750);
      if (kind === 'symlink') { renameSync(native, `${native}.old`); symlinkSync(`${native}.old`, native); }
    }
    return result;
  });
  expect(() => assertPreparedClosureScannerNamespace(root, records)).toThrow('LOCAL_PREPARED_CLOSURE_SCANNER_NAMESPACE_INVALID');
  expect(changed).toBe(true);
});
