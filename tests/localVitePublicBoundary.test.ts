import { describe, expect, it, vi } from 'vitest';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  WARPKEEP_LOCAL_VITE_FS_DENY,
  warpkeepLocalPublicBoundaryPlugin,
} from '../scripts/qa-observer/local-vite-fs-deny.mjs';

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
      '*.{zip,tar,tar.gz,tgz,7z}',
      '**/.git/**',
      '**/.cache/**',
      '**/.wrangler/**',
      '**/.secrets/**',
    ]));
  });

  it.each([
    'admin-secret.txt',
    'private-session.har',
    'operator.trace',
    'session.sqlite3',
    'recovery.tar.gz',
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

  it('blocks sensitive and encoded filenames created after startup', () => {
    const root = mkdtempSync(join(tmpdir(), 'warpkeep-public-request-'));
    const publicDirectory = join(root, 'public');
    mkdirSync(publicDirectory);
    try {
      const middleware = configuredBoundary(publicDirectory);
      writeFileSync(join(publicDirectory, 'private-session.har'), 'controlled non-secret fixture');
      for (const requestPath of ['/private-session.har', '/private-session%2Ehar']) {
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
