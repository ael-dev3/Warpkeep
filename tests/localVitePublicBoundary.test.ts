import { describe, expect, it, vi } from 'vitest';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  WARPKEEP_LOCAL_VITE_FS_DENY,
  warpkeepLocalPublicBoundaryPlugin,
} from '../scripts/qa-observer/local-vite-fs-deny.mjs';
// @ts-expect-error Executable ESM scanner exposes immutable marker text.
import { GREATER_REALM_PRIVATE_MARKER_TEXT } from '../scripts/atlas/greater-realm-private-markers.mjs';

const PRIVATE_MARKER_CASES = (GREATER_REALM_PRIVATE_MARKER_TEXT as readonly string[])
  .map((marker, index): [number, string] => [index, marker]);

type BoundaryMiddleware = (
  request: Readonly<{ url?: string }>,
  response: Readonly<{
    end: ReturnType<typeof vi.fn>;
    setHeader: ReturnType<typeof vi.fn>;
  }> & { statusCode: number },
  next: ReturnType<typeof vi.fn>,
) => void;

function configuredBoundary(publicDirectory: string, base = '/') {
  const plugin = warpkeepLocalPublicBoundaryPlugin();
  if (typeof plugin.configResolved !== 'function' || typeof plugin.configureServer !== 'function') {
    throw new Error('Expected the Warpkeep local public boundary hooks.');
  }
  plugin.configResolved.call({} as never, { publicDir: publicDirectory, base } as never);
  let middleware: BoundaryMiddleware | undefined;
  plugin.configureServer.call({} as never, {
    middlewares: {
      use(candidate: BoundaryMiddleware) {
        middleware = candidate;
      },
    },
  } as never);
  if (!middleware) throw new Error('Expected the Warpkeep local public boundary middleware.');
  return middleware;
}

function invoke(middleware: BoundaryMiddleware, url: string) {
  const response = {
    statusCode: 200,
    end: vi.fn(),
    setHeader: vi.fn(),
  };
  const next = vi.fn();
  middleware({ url }, response, next);
  return { next, response };
}

function utf32Authority(field: string, bigEndian: boolean) {
  const bytes = Buffer.allocUnsafe([...field].length * 4);
  [...field].forEach((character, index) => {
    const value = character.codePointAt(0)!;
    if (bigEndian) bytes.writeUInt32BE(value, index * 4);
    else bytes.writeUInt32LE(value, index * 4);
  });
  return bytes;
}

describe('local Vite public boundary', () => {
  it('denies every ignored credential, capture, database, and recovery class', () => {
    expect(WARPKEEP_LOCAL_VITE_FS_DENY).toEqual(expect.arrayContaining([
      '.env',
      '.env.*',
      '.dev.vars*',
      '.npmrc',
      'credentials.json',
      '*.{cer,key,p12,pfx,jks,keystore,jwk,token}',
      '*.local',
      '*.{log,har,trace}',
      '*.{bak,backup,tmp}',
      '*.{sqlite,sqlite3,db,dump}',
      '*.{7z,bz2,gz,rar,tar,tar.gz,tgz,xz,zip,zst}',
      '**/.git/**',
      '**/.cache/**',
      '**/.wrangler/**',
      '**/.secrets/**',
      '**/.warpkeep-private/**',
      '**/greater-realm-private/**',
      'seed.bin',
      'batch-seed.bin',
      'manifest.private.json',
      'batch.private.json',
      'selection.private.json',
      'shortlist.private.json',
      '*private-preview*',
      '*.{wkgr-atlas,wkgr-checkpoint,wkgr-private}',
    ]));
  });

  it.each([
    'admin-secret.txt',
    'private-session.har',
    'operator.trace',
    'session.sqlite3',
    'recovery.bz2',
    'recovery.gz',
    'recovery.rar',
    'recovery.tar.gz',
    'recovery.xz',
    'recovery.zst',
    'candidate.wkgr-atlas',
    'checkpoint.wkgr-checkpoint',
    'seed.bin',
    'batch-seed.bin',
    'manifest.private.json',
    'batch.private.json',
    'selection.private.json',
    'shortlist.private.json',
    'private-preview-silhouette.png',
  ])('refuses a pre-existing sensitive public artifact: %s', (filename) => {
    const root = mkdtempSync(join(tmpdir(), 'warpkeep-public-boundary-'));
    const publicDirectory = join(root, 'public');
    mkdirSync(publicDirectory);
    writeFileSync(join(publicDirectory, filename), 'controlled non-secret fixture');
    try {
      expect(() => configuredBoundary(publicDirectory)).toThrow(
        'Warpkeep public directory contains a prohibited local artifact.',
      );
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it.each(PRIVATE_MARKER_CASES)(
    'refuses renamed Greater Realm private marker family %i',
    (index, marker) => {
      const root = mkdtempSync(join(tmpdir(), 'warpkeep-public-marker-'));
      const publicDirectory = join(root, 'public');
      mkdirSync(publicDirectory);
      writeFileSync(join(publicDirectory, `ordinary-${index}.bin`), `prefix\0${marker}\0suffix`);
      try {
        expect(() => configuredBoundary(publicDirectory)).toThrow(
          'Warpkeep public directory contains a prohibited local artifact.',
        );
      } finally {
        rmSync(root, { force: true, recursive: true });
      }
    },
  );

  it('detects a renamed private marker spanning public-file read chunks', () => {
    const root = mkdtempSync(join(tmpdir(), 'warpkeep-public-split-marker-'));
    const publicDirectory = join(root, 'public');
    mkdirSync(publicDirectory);
    const marker = Buffer.from(GREATER_REALM_PRIVATE_MARKER_TEXT[7]!, 'utf8');
    const bytes = Buffer.alloc(64 * 1024 + marker.length, 0x41);
    marker.copy(bytes, 64 * 1024 - Math.floor(marker.length / 2));
    writeFileSync(join(publicDirectory, 'ordinary-map.bin'), bytes);
    try {
      expect(() => configuredBoundary(publicDirectory)).toThrow(
        'Warpkeep public directory contains a prohibited local artifact.',
      );
    } finally {
      bytes.fill(0);
      marker.fill(0);
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('fails closed before reading an oversized public file', () => {
    const root = mkdtempSync(join(tmpdir(), 'warpkeep-public-oversized-'));
    const publicDirectory = join(root, 'public');
    mkdirSync(publicDirectory);
    const oversized = join(publicDirectory, 'ordinary-map.bin');
    writeFileSync(oversized, '');
    truncateSync(oversized, 128 * 1024 * 1024 + 1);
    try {
      expect(() => configuredBoundary(publicDirectory)).toThrow(
        'Warpkeep public directory contains a prohibited local artifact.',
      );
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('blocks a renamed private artifact created after startup', () => {
    const root = mkdtempSync(join(tmpdir(), 'warpkeep-public-late-marker-'));
    const publicDirectory = join(root, 'public');
    mkdirSync(publicDirectory);
    try {
      const middleware = configuredBoundary(publicDirectory);
      writeFileSync(
        join(publicDirectory, 'ordinary-map.bin'),
        GREATER_REALM_PRIVATE_MARKER_TEXT[2]!,
      );
      const { next, response } = invoke(middleware, '/ordinary-map.bin');
      expect(next).not.toHaveBeenCalled();
      expect(response.statusCode).toBe(404);
      expect(response.setHeader).toHaveBeenCalledWith('cache-control', 'no-store');
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it.each([
    ['ZIP', Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0])],
    ['GZIP', Buffer.from([0x1f, 0x8b, 0x08, 0, 0, 0, 0, 0])],
    ['Zstandard', Buffer.from([0x28, 0xb5, 0x2f, 0xfd, 0, 0, 0, 0])],
    [
      'tar',
      (() => {
        const bytes = Buffer.alloc(512);
        bytes.write('ustar', 257, 'ascii');
        return bytes;
      })(),
    ],
  ])('refuses renamed %s archive magic before local serving', (_label, bytes) => {
    const root = mkdtempSync(join(tmpdir(), 'warpkeep-public-archive-'));
    const publicDirectory = join(root, 'public');
    mkdirSync(publicDirectory);
    try {
      writeFileSync(join(publicDirectory, 'ordinary-container.bin'), bytes);
      expect(() => configuredBoundary(publicDirectory)).toThrow(
        'Warpkeep public directory contains a prohibited local artifact.',
      );
    } finally {
      bytes.fill(0);
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('blocks a renamed archive created after local startup', () => {
    const root = mkdtempSync(join(tmpdir(), 'warpkeep-public-late-archive-'));
    const publicDirectory = join(root, 'public');
    mkdirSync(publicDirectory);
    const bytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
    try {
      const middleware = configuredBoundary(publicDirectory);
      writeFileSync(join(publicDirectory, 'ordinary-container.bin'), bytes);
      const { next, response } = invoke(middleware, '/ordinary-container.bin');
      expect(next).not.toHaveBeenCalled();
      expect(response.statusCode).toBe(404);
      expect(response.setHeader).toHaveBeenCalledWith('cache-control', 'no-store');
    } finally {
      bytes.fill(0);
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('retains self-extracting ZIP evidence across all public-file chunks', () => {
    const root = mkdtempSync(join(tmpdir(), 'warpkeep-public-sfx-archive-'));
    const publicDirectory = join(root, 'public');
    mkdirSync(publicDirectory);
    const bytes = Buffer.alloc(2 * 64 * 1024 + 16, 0x41);
    Buffer.from([0x50, 0x4b, 0x03, 0x04]).copy(bytes, 101);
    Buffer.from([0x50, 0x4b, 0x01, 0x02]).copy(bytes, 64 * 1024 - 2);
    Buffer.from([0x50, 0x4b, 0x05, 0x06]).copy(bytes, 2 * 64 * 1024 + 4);
    try {
      const middleware = configuredBoundary(publicDirectory);
      writeFileSync(join(publicDirectory, 'ordinary-self-extractor.bin'), bytes);
      const { next, response } = invoke(middleware, '/ordinary-self-extractor.bin');
      expect(next).not.toHaveBeenCalled();
      expect(response.statusCode).toBe(404);
    } finally {
      bytes.fill(0);
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('case-folds initialized living-world JSON authority across read chunks', () => {
    const root = mkdtempSync(join(tmpdir(), 'warpkeep-public-authority-'));
    const publicDirectory = join(root, 'public');
    mkdirSync(publicDirectory);
    const authority = Buffer.from('"GrOuNdCoVeRdEnSiTy"\n : "AgAEBg=="', 'utf8');
    const bytes = Buffer.alloc(64 * 1024 + authority.length, 0x20);
    authority.copy(bytes, 64 * 1024 - 7);
    try {
      writeFileSync(join(publicDirectory, 'ordinary-authority.json'), bytes);
      expect(() => configuredBoundary(publicDirectory)).toThrow(
        'Warpkeep public directory contains a prohibited local artifact.',
      );
    } finally {
      bytes.fill(0);
      authority.fill(0);
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('blocks living-world JSON authority created after local startup', () => {
    const root = mkdtempSync(join(tmpdir(), 'warpkeep-public-late-authority-'));
    const publicDirectory = join(root, 'public');
    mkdirSync(publicDirectory);
    const bytes = Buffer.from('{"wildflower-density":{"encoding":"base64"}}\n', 'utf8');
    try {
      const middleware = configuredBoundary(publicDirectory);
      writeFileSync(join(publicDirectory, 'ordinary-authority.json'), bytes);
      const { next, response } = invoke(middleware, '/ordinary-authority.json');
      expect(next).not.toHaveBeenCalled();
      expect(response.statusCode).toBe(404);
    } finally {
      bytes.fill(0);
      rmSync(root, { force: true, recursive: true });
    }
  });

  it.each([
    [
      'Buffer.from string',
      ['groundcover', 'Density'].join(''),
      (name: string) => `export const ${name} = Buffer.from("AQIDBA==", "base64");\n`,
    ],
    [
      'atob string',
      ['wildflower', 'Density'].join(''),
      (name: string) => `export const ${name} = atob("AQIDBA==");\n`,
    ],
    [
      'Uint8Array-wrapped string',
      ['groundcover', 'Density'].join(''),
      (name: string) => (
        `export const ${name} = Uint8Array.from(atob("AQIDBA=="), value => value.charCodeAt(0));\n`
      ),
    ],
    [
      'encoded object',
      ['wildflower', 'Density'].join(''),
      (name: string) => (
        `export const ${name} = { encoding: "base64", data: "AQIDBA==" };\n`
      ),
    ],
    [
      'Uint8Array.of numbers',
      ['groundcover', 'Density'].join(''),
      (name: string) => `export const ${name} = Uint8Array.of(12, 34, 56);\n`,
    ],
    [
      'Buffer-wrapped Uint8Array.of numbers',
      ['wildflower', 'Density'].join(''),
      (name: string) => (
        `export const ${name} = Buffer.from(Uint8Array.of(7, 8, 9));\n`
      ),
    ],
    [
      'Buffer-wrapped Uint8Array numbers',
      ['groundcover', 'Density'].join(''),
      (name: string) => (
        `export const ${name} = Buffer.from(new Uint8Array([1, 2, 3]));\n`
      ),
    ],
    [
      'Buffer-wrapped Uint8Array.from numbers',
      ['wildflower', 'Density'].join(''),
      (name: string) => (
        `export const ${name} = Buffer.from(Uint8Array.from([4, 5, 6]));\n`
      ),
    ],
    [
      'Uint8Array-wrapped Buffer numbers',
      ['groundcover', 'Density'].join(''),
      (name: string) => (
        `export const ${name} = new Uint8Array(Buffer.from([7, 8, 9]));\n`
      ),
    ],
  ])('blocks a public source-like %s authority initializer', (
    _label,
    authorityName,
    fixture,
  ) => {
    const root = mkdtempSync(join(tmpdir(), 'warpkeep-public-encoded-source-'));
    const publicDirectory = join(root, 'public');
    mkdirSync(publicDirectory);
    try {
      writeFileSync(
        join(publicDirectory, 'ordinary-module.js'),
        fixture(authorityName),
      );
      expect(() => configuredBoundary(publicDirectory)).toThrow(
        'Warpkeep public directory contains a prohibited local artifact.',
      );
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it.each([
    [
      'UTF-16LE',
      Buffer.from('GrOuNdCoVeR-DeNsItY', 'utf16le'),
    ],
    [
      'UTF-16BE',
      (() => {
        const bytes = Buffer.from('WiLdFlOwErDeNsItY', 'utf16le');
        bytes.swap16();
        return bytes;
      })(),
    ],
    ['UTF-32LE', utf32Authority('WiLdFlOwEr-DeNsItY', false)],
    ['UTF-32BE', utf32Authority('GrOuNdCoVeRdEnSiTy', true)],
  ])('blocks case-folded %s living-world authority', (_label, authority) => {
    const root = mkdtempSync(join(tmpdir(), 'warpkeep-public-encoded-authority-'));
    const publicDirectory = join(root, 'public');
    mkdirSync(publicDirectory);
    const bytes = Buffer.alloc(64 * 1024 + authority.length, 0x80);
    authority.copy(bytes, 64 * 1024 - 7);
    try {
      writeFileSync(join(publicDirectory, 'ordinary-authority.bin'), bytes);
      expect(() => configuredBoundary(publicDirectory)).toThrow(
        'Warpkeep public directory contains a prohibited local artifact.',
      );
    } finally {
      bytes.fill(0);
      authority.fill(0);
      rmSync(root, { force: true, recursive: true });
    }
  });

  it.each([
    [
      'UTF-16BE relief metric',
      (() => {
        const bytes = Buffer.from('PaIrCoUnTsByLaGaNdAxIs', 'utf16le');
        bytes.swap16();
        return bytes;
      })(),
    ],
    [
      'UTF-32LE private text field',
      utf32Authority('PrIvAtEsEeDhEx', false),
    ],
  ])('blocks encoded %s authority', (_label, authority) => {
    const root = mkdtempSync(join(tmpdir(), 'warpkeep-public-encoded-private-field-'));
    const publicDirectory = join(root, 'public');
    mkdirSync(publicDirectory);
    const bytes = Buffer.alloc(64 * 1024 + authority.length, 0x80);
    authority.copy(bytes, 64 * 1024 - 7);
    try {
      writeFileSync(join(publicDirectory, 'ordinary-private-field.bin'), bytes);
      expect(() => configuredBoundary(publicDirectory)).toThrow(
        'Warpkeep public directory contains a prohibited local artifact.',
      );
    } finally {
      bytes.fill(0);
      authority.fill(0);
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('blocks escaped private JSON keys without rejecting ordinary escaped JSON', () => {
    const root = mkdtempSync(join(tmpdir(), 'warpkeep-public-escaped-authority-'));
    const publicDirectory = join(root, 'public');
    mkdirSync(publicDirectory);
    const benign = Buffer.from('{"message":"ordinary\\ntext"}\n', 'utf8');
    const authority = Buffer.from('{"groundcover\\u0044ensity":1}\n', 'utf8');
    try {
      writeFileSync(join(publicDirectory, 'ordinary.json'), benign);
      const middleware = configuredBoundary(publicDirectory);
      expect(invoke(middleware, '/ordinary.json').next).toHaveBeenCalledTimes(1);
      writeFileSync(join(publicDirectory, 'ordinary-authority.json'), authority);
      const { next, response } = invoke(middleware, '/ordinary-authority.json');
      expect(next).not.toHaveBeenCalled();
      expect(response.statusCode).toBe(404);
    } finally {
      benign.fill(0);
      authority.fill(0);
      rmSync(root, { force: true, recursive: true });
    }
  });

  it.each([
    ['PNG', Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])],
    ['GLB', Buffer.from([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0])],
  ])('continues to allow ordinary %s media signatures', (_label, bytes) => {
    const root = mkdtempSync(join(tmpdir(), 'warpkeep-public-media-'));
    const publicDirectory = join(root, 'public');
    mkdirSync(publicDirectory);
    try {
      writeFileSync(join(publicDirectory, 'ordinary-media.bin'), bytes);
      const middleware = configuredBoundary(publicDirectory);
      expect(invoke(middleware, '/ordinary-media.bin').next).toHaveBeenCalledTimes(1);
    } finally {
      bytes.fill(0);
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('rejects a renamed public symlink before scanning its target', () => {
    const root = mkdtempSync(join(tmpdir(), 'warpkeep-public-linked-marker-'));
    const publicDirectory = join(root, 'public');
    const outside = join(root, 'outside.bin');
    mkdirSync(publicDirectory);
    writeFileSync(outside, 'ordinary external fixture');
    symlinkSync(outside, join(publicDirectory, 'ordinary-map.bin'));
    try {
      expect(() => configuredBoundary(publicDirectory)).toThrow(
        'Warpkeep public directory contains a prohibited local artifact.',
      );
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('blocks sensitive and encoded filenames created after startup', () => {
    const root = mkdtempSync(join(tmpdir(), 'warpkeep-public-request-'));
    const publicDirectory = join(root, 'public');
    mkdirSync(publicDirectory);
    try {
      const middleware = configuredBoundary(publicDirectory);
      writeFileSync(join(publicDirectory, 'private-session.har'), 'controlled non-secret fixture');
      writeFileSync(join(publicDirectory, 'batch-seed.bin'), 'controlled non-secret fixture');
      for (const requestPath of [
        '/private-session.har',
        '/private-session%2Ehar',
        '/batch-seed.bin',
        '/batch-seed%2Ebin',
      ]) {
        const { next, response } = invoke(middleware, requestPath);
        expect(next).not.toHaveBeenCalled();
        expect(response.statusCode).toBe(404);
        expect(response.setHeader).toHaveBeenCalledWith('cache-control', 'no-store');
        expect(response.end).toHaveBeenCalledWith('Not Found\n');
      }
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('blocks a public root swapped to an external symlink after startup', () => {
    const root = mkdtempSync(join(tmpdir(), 'warpkeep-public-root-swap-'));
    const publicDirectory = join(root, 'public');
    const outside = join(root, 'outside');
    mkdirSync(publicDirectory);
    mkdirSync(outside);
    writeFileSync(join(outside, 'innocent.txt'), 'controlled non-secret fixture');
    try {
      const middleware = configuredBoundary(publicDirectory);
      rmSync(publicDirectory, { recursive: true });
      symlinkSync(outside, publicDirectory, 'dir');
      const { next, response } = invoke(middleware, '/innocent.txt');
      expect(next).not.toHaveBeenCalled();
      expect(response.statusCode).toBe(404);
      expect(response.setHeader).toHaveBeenCalledWith('cache-control', 'no-store');
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('allows an ordinary regular public asset and fails closed on malformed encoding', () => {
    const root = mkdtempSync(join(tmpdir(), 'warpkeep-public-ordinary-'));
    const publicDirectory = join(root, 'public');
    mkdirSync(publicDirectory);
    writeFileSync(join(publicDirectory, 'ordinary.svg'), '<svg/>');
    try {
      const middleware = configuredBoundary(publicDirectory);
      expect(invoke(middleware, '/ordinary.svg').next).toHaveBeenCalledTimes(1);
      const malformed = invoke(middleware, '/%E0%A4%A');
      expect(malformed.next).not.toHaveBeenCalled();
      expect(malformed.response.statusCode).toBe(404);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});
