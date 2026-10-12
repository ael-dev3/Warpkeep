// @vitest-environment node
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureNativeBuildOutput, NATIVE_BUILD_OUTPUT_PROFILE, type NativeBuildVariant } from '../scripts/native-source-verification-build-output.mjs';

const temporaryRoots: string[] = [];
const nativeOwner = process.platform === 'linux' && process.getuid?.() === 1000 && process.getgid?.() === 1000;
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

function write(path: string, body: string | Uint8Array) {
  fs.mkdirSync(dirname(path), { recursive: true, mode: 0o755 });
  fs.writeFileSync(path, body, { mode: 0o644 });
  fs.chmodSync(path, 0o644);
}
function fixture(base = '/') {
  const root = fs.mkdtempSync(join(tmpdir(), 'warpkeep-native-output-'));
  temporaryRoots.push(root);
  const dist = join(root, 'dist');
  write(join(dist, 'assets/application-reviewed.js'), 'export const application = true;');
  write(join(dist, 'assets/application-reviewed.css'), 'body{margin:0}');
  write(join(dist, 'assets/ownerCanary-reviewed.js'), 'export const owner = true;');
  write(join(dist, 'assets/ownerCanary-reviewed.css'), 'body{color:white}');
  write(join(dist, 'assets/chunk-reviewed.js'), 'export const shared = true;');
  write(join(dist, 'warpkeep-boot.css'), 'body{min-height:100vh}');
  write(join(dist, 'warpkeep-noscript.css'), 'p{display:block}');
  write(join(dist, 'index.html'), `<!doctype html><html><head>
    <script type="module" crossorigin src="${base}assets/application-reviewed.js"></script>
    <link rel="modulepreload" href="${base}assets/chunk-reviewed.js">
    <link rel="stylesheet" href="${base}assets/application-reviewed.css">
    <link rel="stylesheet" href="${base}warpkeep-boot.css">
    </head><body><noscript><link rel="stylesheet" href="${base}warpkeep-noscript.css"></noscript></body></html>`);
  write(join(dist, 'owner-canary/index.html'), `<!doctype html><html><head>
    <script type='module' crossorigin src='${base}assets/ownerCanary-reviewed.js'></script>
    <link rel='stylesheet' href='${base}assets/ownerCanary-reviewed.css'>
    </head><body></body></html>`);
  for (const path of ['privacy/index.html', 'social-contract/index.html', 'terms/index.html']) {
    write(join(dist, path), '<!doctype html><html><head><title>Warpkeep</title></head><body>Terms</body></html>');
  }
  write(join(dist, '.well-known/farcaster.json'), '{"miniapp":{}}');
  write(join(dist, 'models/greater-realm/biome-trees/v3/manifest.json'), '{}');
  write(join(dist, 'models/tree-reviewed.glb'), new Uint8Array([0x67, 0x6c, 0x54, 0x46, 0, 1, 2, 3]));
  write(join(dist, 'audio/warpkeep-genesis-002-theme.m4a'), new Uint8Array([0, 1, 2]));
  return { root, dist };
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of temporaryRoots.splice(0)) fs.rmSync(root, { recursive: true, force: false });
});

describe('native build output API import boundary', () => {
  it('imports synchronously with require without capturing output or launching an actor', () => {
    const require = createRequire(import.meta.url);
    const module = require('../scripts/native-source-verification-build-output.mjs') as {
      captureNativeBuildOutput: unknown; NATIVE_BUILD_OUTPUT_PROFILE: string;
    };
    expect(typeof module.captureNativeBuildOutput).toBe('function');
    expect(module.NATIVE_BUILD_OUTPUT_PROFILE).toBe(NATIVE_BUILD_OUTPUT_PROFILE);
  });
});

// Functional filesystem captures require the real native owner; this is not an API waiver.
// The producer still has to provide all actual environment/build/source/terminal proofs.
describe.skipIf(!nativeOwner)('actual UID1000 native dist capture', () => {
  it.each([
    ['default', '/'], ['github-pages', '/Warpkeep/'], ['canonical-pages', '/'],
  ] as const)('captures every actual output for fixed %s variant', (variant, base) => {
    const { root, dist } = fixture(base), before = fs.statSync(dist, { bigint: true });
    const result = captureNativeBuildOutput(root, variant);
    expect(result.profile).toBe(NATIVE_BUILD_OUTPUT_PROFILE);
    expect(result.variant).toBe(variant);
    expect(result.base).toBe(base);
    expect(result.outputRoot).toBe(dist);
    expect(result.fileCount).toBe(16);
    expect(result.files.map(file => file.path)).toEqual([...result.files.map(file => file.path)].sort());
    expect(result.files.reduce((sum, file) => sum + file.bytes, 0)).toBe(result.totalBytes);
    for (const file of result.files) {
      const body = fs.readFileSync(join(dist, file.path));
      expect(file.sha256).toBe(digest(body));
      expect(file.bytes).toBe(body.length);
      expect(file.mode).toBe(0o644);
      expect(file.identity.uid).toBe('1000');
      expect(file.identity.gid).toBe('1000');
      expect(file.identity.nlink).toBe('1');
    }
    expect(result.directoryCount).toBe(result.directories.length);
    expect(result.directories[0].path).toBe('');
    expect(result.directories[0].identity.ino).toBe(String(before.ino));
    expect(result.documents).toEqual([
      { path: 'index.html', moduleScript: 'assets/application-reviewed.js',
        stylesheets: ['assets/application-reviewed.css', 'warpkeep-boot.css', 'warpkeep-noscript.css'],
        modulePreloads: ['assets/chunk-reviewed.js'] },
      { path: 'owner-canary/index.html', moduleScript: 'assets/ownerCanary-reviewed.js',
        stylesheets: ['assets/ownerCanary-reviewed.css'], modulePreloads: [] },
    ]);
    expect(result.inventoryStable).toBe(true);
    expect(result.environmentVerified).toBe(false);
    expect(result.releaseAuthorized).toBe(false);
    expect(Object.isFrozen(result)).toBe(true);
    expect(fs.statSync(dist, { bigint: true }).mtimeNs).toBe(before.mtimeNs);
    expect(captureNativeBuildOutput(root, variant).contentManifestSha256).toBe(result.contentManifestSha256);
  });

  it.each(['/', '/ptr/', '//Warpkeep/'])('rejects a wrong github-pages reference base %s', base => {
    expect(() => captureNativeBuildOutput(fixture(base).root, 'github-pages')).toThrow(/REFERENCE_(?:BASE|MISSING)/u);
  });
  it('does not accept a caller-selected base or unrecognized variant', () => {
    const { root } = fixture();
    expect(() => captureNativeBuildOutput(root, '/ptr/' as NativeBuildVariant)).toThrow('INPUT_INVALID');
    expect(() => captureNativeBuildOutput(root + '/.', 'default')).toThrow('INPUT_INVALID');
  });
  it.each(['assets/application-reviewed.js', 'assets/ownerCanary-reviewed.css', 'assets/chunk-reviewed.js'])('rejects a missing critical target %s', path => {
    const { root, dist } = fixture();
    fs.unlinkSync(join(dist, path));
    expect(() => captureNativeBuildOutput(root, 'default')).toThrow('REFERENCE_MISSING');
  });
  it.each(['owner-canary/index.html', 'privacy/index.html'])('requires the complete reviewed HTML family: %s', path => {
    const { root, dist } = fixture();
    fs.unlinkSync(join(dist, path));
    expect(() => captureNativeBuildOutput(root, 'default')).toThrow('DOCUMENT_INVENTORY');
  });
  it.each(['dev/realm-qa.html', 'extra/index.html', 'terms-copy/index.HTML', '.env',
    '.well-known/private.json', 'assets/.secret', 'assets/application-reviewed.js.map',
    'assets/innerKeepQaMain-reviewed.js', 'scripts/secret.ts'])('rejects leaked or unrecognized output %s', path => {
    const { root, dist } = fixture();
    write(join(dist, path), 'not production');
    expect(() => captureNativeBuildOutput(root, 'default')).toThrow('PATH_LEAK');
  });
  it.each(['file', 'directory', 'dist'] as const)('rejects a symbolic %s path', kind => {
    const { root, dist } = fixture();
    if (kind === 'file') fs.symlinkSync(join(dist, 'assets/application-reviewed.js'), join(dist, 'assets/link.js'));
    else if (kind === 'directory') fs.symlinkSync(join(dist, 'assets'), join(dist, 'images'), 'dir');
    else {
      fs.renameSync(dist, join(root, 'real-dist'));
      fs.symlinkSync(join(root, 'real-dist'), dist, 'dir');
    }
    expect(() => captureNativeBuildOutput(root, 'default')).toThrow('NONREGULAR_PATH');
  });
  it('rejects hard-linked files and group-writable files/directories', () => {
    const linked = fixture();
    fs.linkSync(join(linked.dist, 'assets/application-reviewed.js'), join(linked.dist, 'assets/duplicate.js'));
    expect(() => captureNativeBuildOutput(linked.root, 'default')).toThrow('HARDLINK');
    const writable = fixture();
    fs.chmodSync(join(writable.dist, 'assets/application-reviewed.js'), 0o664);
    expect(() => captureNativeBuildOutput(writable.root, 'default')).toThrow('MODE_INVALID');
    const directory = fixture();
    fs.chmodSync(join(directory.dist, 'assets'), 0o775);
    expect(() => captureNativeBuildOutput(directory.root, 'default')).toThrow('MODE_INVALID');
  });
  it('rejects an observed wrong native owner before reading that file', () => {
    const { root, dist } = fixture(), target = join(dist, 'models/tree-reviewed.glb');
    const original = fs.lstatSync.bind(fs);
    vi.spyOn(fs, 'lstatSync').mockImplementation(((...args: Parameters<typeof fs.lstatSync>) => {
      const value = original(...args);
      if (!value || String(args[0]) !== target) return value;
      return Object.create(value, { uid: { value: 0n } });
    }) as typeof fs.lstatSync);
    expect(() => captureNativeBuildOutput(root, 'default')).toThrow('OWNER_INVALID');
  });
  it('rejects excessive file size without reading the oversized body', () => {
    const { root, dist } = fixture(), descriptor = fs.openSync(join(dist, 'models/oversized.glb'), 'wx', 0o644);
    try { fs.ftruncateSync(descriptor, 64 * 1024 * 1024 + 1); } finally { fs.closeSync(descriptor); }
    expect(() => captureNativeBuildOutput(root, 'default')).toThrow('FILE_BOUND');
  });
  it('rejects excessive directory depth, including empty nested outputs', () => {
    const { root, dist } = fixture();
    fs.mkdirSync(join(dist, 'models', ...Array.from({ length: 17 }, () => 'nested')), { recursive: true, mode: 0o755 });
    expect(() => captureNativeBuildOutput(root, 'default')).toThrow('TREE_BOUND');
  });
  it.each([
    '<base href="https://outside.invalid/">',
    '<script type="module" src="/assets/application-reviewed.js"></script>',
    '<script>window.unreviewed = true;</script>',
    '<link rel="stylesheet" href="https://outside.invalid/site.css">',
    '<link rel="stylesheet" href="/assets/application-reviewed.css?x=1">',
  ])('rejects an altered executable document boundary %s', added => {
    const { root, dist } = fixture(), path = join(dist, 'index.html');
    fs.appendFileSync(path, added);
    expect(() => captureNativeBuildOutput(root, 'default')).toThrow(/(?:DOCUMENT_REFERENCE|REFERENCE_BASE)/u);
  });
  it('rejects malformed and duplicate reference attributes', () => {
    const { root, dist } = fixture(), path = join(dist, 'owner-canary/index.html');
    fs.writeFileSync(path, fs.readFileSync(path, 'utf8').replace("src='/assets/ownerCanary-reviewed.js'",
      "src='/assets/ownerCanary-reviewed.js' src='/assets/application-reviewed.js'"));
    expect(() => captureNativeBuildOutput(root, 'default')).toThrow('DOCUMENT_REFERENCE');
  });
  it('rejects file mutation during an actual bounded read', () => {
    const { root, dist } = fixture(), original = fs.readSync.bind(fs);
    let changed = false;
    vi.spyOn(fs, 'readSync').mockImplementation(((...args: Parameters<typeof fs.readSync>) => {
      const count = original(...args);
      if (count > 0 && !changed) {
        changed = true;
        fs.appendFileSync(join(dist, '.well-known/farcaster.json'), ' ');
      }
      return count;
    }) as typeof fs.readSync);
    expect(() => captureNativeBuildOutput(root, 'default')).toThrow('CHANGED');
    expect(changed).toBe(true);
  });
  it('rejects directory additions between the two complete inventory reads', () => {
    const { root, dist } = fixture(), original = fs.opendirSync.bind(fs);
    let rootReads = 0;
    vi.spyOn(fs, 'opendirSync').mockImplementation(((...args: Parameters<typeof fs.opendirSync>) => {
      if (String(args[0]) === dist && ++rootReads === 2) write(join(dist, 'images/new.png'), new Uint8Array([9]));
      return original(...args);
    }) as typeof fs.opendirSync);
    expect(() => captureNativeBuildOutput(root, 'default')).toThrow('CHANGED');
    expect(rootReads).toBe(2);
  });
});
