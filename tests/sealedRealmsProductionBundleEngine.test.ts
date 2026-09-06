// @vitest-environment node

import {
  copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync,
  rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { build, type BuildOptions, type Plugin } from 'esbuild';
import { describe, expect, it, vi } from 'vitest';

import {
  buildSealedRealmOperationBundle,
  SealedRealmsProductionBundlesError as EngineError,
} from '../scripts/sealed-realms-production-bundle-engine.mjs';
import {
  SealedRealmsProductionBundlesError as PublicError,
} from '../scripts/build-sealed-realms-production-bundles.mjs';

const REPOSITORY_ROOT = resolve(import.meta.dirname, '..');
const ACTIVATION_GRAPH_PATHS = [
  'scripts/auth-bridge-config-attestation.mjs',
  'scripts/auth-bridge-notification-prepared-deploy-journal.mjs',
  'scripts/auth-bridge-notification-prepared-receipt.mjs',
  'scripts/production-admin-token-budget.mjs',
  'scripts/sealed-realms-production-activation-lane-entry.mjs',
  'scripts/sealed-realms-production-activation-workflow-entry.mjs',
  'scripts/sealed-realms-production-auth-bridge-state.mjs',
  'scripts/sealed-realms-production-continuation.mjs',
  'scripts/sealed-realms-production-dispatch.mjs',
  'scripts/sealed-realms-production-private-state.mjs',
  'scripts/sealed-realms-production-source-authority.mjs',
  'scripts/sealed-realms-production-workflow-authority.mjs',
  'scripts/sealed-realms-production-workflow-evidence.mjs',
  'scripts/sealed-realms-production-workflow-private-state.mjs',
] as const;
const FROZEN_SOURCE_PATH = 'scripts/genesis001-binding-frozen-source.mjs';

function sourceFixture(extraPaths: readonly string[] = []) {
  const parent = realpathSync(mkdtempSync(join(tmpdir(), 'warpkeep-bundle-engine-')));
  const root = join(parent, 'repository');
  for (const path of [...ACTIVATION_GRAPH_PATHS, ...extraPaths]) {
    const destination = resolve(root, path);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(resolve(REPOSITORY_ROOT, path), destination);
  }
  return { parent, root, cleanup: () => rmSync(parent, { recursive: true, force: true }) };
}

async function loadTransformedSource(plugin: Plugin, path: string): Promise<string> {
  type LoaderCallback = (args: never) => unknown | Promise<unknown>;
  const loaders: Array<Readonly<{
    filter: RegExp;
    callback: LoaderCallback;
  }>> = [];
  plugin.setup({
    onLoad(options: { filter: RegExp }, callback: LoaderCallback) {
      loaders.push({ filter: options.filter, callback });
    },
  } as never);
  const registration = loaders.find(loader => loader.filter.test(path));
  if (registration === undefined) throw new Error(`no transform registered for ${path}`);
  const loaded = await registration.callback({ path } as never) as { contents?: string };
  if (typeof loaded.contents !== 'string') throw new Error(`transform returned no source for ${path}`);
  return loaded.contents;
}

function evaluatedBootstrap(source: string, operation: string): string {
  const assignment = 'const bootstrap = ';
  const start = source.indexOf(assignment);
  const end = source.indexOf(".join('');", start);
  if (start < 0 || end < 0) throw new Error('transformed bootstrap expression unavailable');
  const expression = source.slice(start + assignment.length, end);
  return Function('operation', `'use strict'; return (${expression}).join('');`)(operation) as string;
}

describe('sealed-realms production bundle engine', () => {
  it('imports in an isolated directory where bare third-party resolution is unavailable', () => {
    const local = sourceFixture();
    const isolatedEngine = join(local.parent, 'sealed-realms-production-bundle-engine.mjs');
    copyFileSync(resolve(REPOSITORY_ROOT, 'scripts/sealed-realms-production-bundle-engine.mjs'), isolatedEngine);
    const program = [
      "let bareRejected = false;",
      "try { await import('esbuild'); } catch (error) { bareRejected = error?.code === 'ERR_MODULE_NOT_FOUND'; }",
      "if (!bareRejected) throw new Error('bare package resolution was not rejected');",
      `const engine = await import(${JSON.stringify(pathToFileURL(isolatedEngine).href)});`,
      "if (typeof engine.buildSealedRealmOperationBundle !== 'function') throw new Error('engine unavailable');",
    ].join('\n');
    try {
      execFileSync(process.execPath, ['--input-type=module', '--eval', program], {
        cwd: local.parent, env: {}, stdio: 'pipe', windowsHide: true,
      });
    } finally { local.cleanup(); }
  });

  it('builds identical activation artifacts after an independent source root is relocated', async () => {
    const firstLocal = sourceFixture();
    const secondLocal = sourceFixture();
    const relocatedRoot = join(secondLocal.parent, 'relocated-repository');
    renameSync(secondLocal.root, relocatedRoot);
    try {
      const first = await buildSealedRealmOperationBundle({
        lane: 'activation', sourceRoot: firstLocal.root, build,
      });
      const second = await buildSealedRealmOperationBundle({
        lane: 'activation', sourceRoot: relocatedRoot, build,
      });
      expect(second.bytes).toEqual(first.bytes);
      expect(second.graphManifest).toEqual(first.graphManifest);
      expect(second.sourceClosureDigest).toBe(first.sourceClosureDigest);
    } finally {
      firstLocal.cleanup();
      secondLocal.cleanup();
    }
  });

  it('binds graph reads to the supplied source root', async () => {
    const firstLocal = sourceFixture();
    const secondLocal = sourceFixture();
    const changedPath = resolve(secondLocal.root,
      'scripts/sealed-realms-production-activation-workflow-entry.mjs');
    writeFileSync(changedPath, Buffer.concat([readFileSync(changedPath), Buffer.from('\n')]));
    try {
      const first = await buildSealedRealmOperationBundle({
        lane: 'activation', sourceRoot: firstLocal.root, build,
      });
      const second = await buildSealedRealmOperationBundle({
        lane: 'activation', sourceRoot: secondLocal.root, build,
      });
      expect(second.graphManifest).not.toEqual(first.graphManifest);
      expect(second.sourceClosureDigest).not.toBe(first.sourceClosureDigest);
    } finally {
      firstLocal.cleanup();
      secondLocal.cleanup();
    }
  });

  it('rejects an invalid lane or relative root before compiler invocation', async () => {
    expect(PublicError).toBe(EngineError);
    for (const input of [
      { lane: 'other', sourceRoot: REPOSITORY_ROOT },
      { lane: 'activation', sourceRoot: 'relative/source' },
    ] as const) {
      const compiler = vi.fn();
      await expect(buildSealedRealmOperationBundle({ ...input, build: compiler } as never))
        .rejects.toMatchObject({ code: 'SEALED_REALMS_BUNDLES_INPUT_INVALID' });
      expect(compiler).not.toHaveBeenCalled();
    }
  });

  it('preserves exact frozen-source child bootstrap bytes through the fixed transform', async () => {
    const operations = ['materializeGenesis001HistoricalBaseline', 'materializeGenesis001Frozen'];
    let transformed = '';
    const compiler: typeof build = async (options: BuildOptions) => {
      transformed = await loadTransformedSource(
        options.plugins![0]!, resolve(REPOSITORY_ROOT, FROZEN_SOURCE_PATH),
      );
      return build(options);
    };
    const artifact = await buildSealedRealmOperationBundle({
      lane: 'g002', sourceRoot: REPOSITORY_ROOT, build: compiler,
    });
    expect(artifact.graphManifest.filter(member => member.path.startsWith('node_modules/yaml/')))
      .toHaveLength(72);
    expect(artifact.graphManifest.some(member => member.path.startsWith('../'))).toBe(false);
    for (const operation of operations) {
      const expected = [
        'const loaded=await import(process.argv[1]);',
        `const value=loaded.${operation}({repoRoot:process.argv[2],destination:process.argv[3]});`,
        'process.stdout.write(JSON.stringify(value));',
      ].join('');
      expect(Buffer.from(evaluatedBootstrap(transformed, operation)))
        .toEqual(Buffer.from(expected));
    }
  });

  it('fails closed when the frozen-source bootstrap shape changes', async () => {
    const local = sourceFixture([FROZEN_SOURCE_PATH]);
    const path = resolve(local.root, FROZEN_SOURCE_PATH);
    const source = readFileSync(path, 'utf8');
    writeFileSync(path, source.replace(
      'const loaded=await import(process.argv[1]);',
      'const loaded = await import(process.argv[1]);',
    ));
    const compiler: typeof build = async (options: BuildOptions) => {
      await loadTransformedSource(options.plugins![0]!, path);
      return build(options);
    };
    try {
      await expect(buildSealedRealmOperationBundle({
        lane: 'activation', sourceRoot: local.root, build: compiler,
      })).rejects.toMatchObject({ code: 'SEALED_REALMS_BUNDLES_SOURCE_INVALID' });
    } finally { local.cleanup(); }
  });
});
