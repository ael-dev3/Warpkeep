// @vitest-environment node

import {
  copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync,
  rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { build, type BuildOptions, type Plugin } from 'esbuild';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import {
  buildSealedRealmOperationBundle,
  SealedRealmsProductionBundlesError as EngineError,
} from '../scripts/sealed-realms-production-bundle-engine.mjs';
import {
  SealedRealmsProductionBundlesError as PublicError,
} from '../scripts/build-sealed-realms-production-bundles.mjs';

import { OPERATION_BUNDLE_NOBLE_PACKAGE } from '../scripts/local-operation-bundle-noble-v1.mjs';

const FILESYSTEM_BUILD_TIMEOUT = process.platform === 'win32' ? 30_000 : 10_000;
const REPOSITORY_ROOT = resolve(import.meta.dirname, '..');
// A source fixture is deliberately not a second manually maintained graph list.
// The real compiler determines which of these source modules is reachable.
let activationSourceFixturePaths: readonly string[];
beforeAll(async () => {
  const artifact = await buildSealedRealmOperationBundle({ lane: 'activation', sourceRoot: REPOSITORY_ROOT, build });
  const paths = new Set(artifact.graphManifest.map(member => member.path));
  // Compiler inputs include consumed JS/TS, while package export/type metadata
  // also controls resolution. Preserve only those ancestor manifests, not the
  // dependency installation or an independently maintained source-file list.
  for (const member of artifact.graphManifest) {
    if (!member.path.startsWith('node_modules/')) continue;
    let parent = dirname(member.path);
    while (parent !== 'node_modules' && parent !== '.') {
      const manifest = `${parent.replaceAll('\\', '/')}/package.json`;
      if (existsSync(resolve(REPOSITORY_ROOT, manifest))) {
        if (manifest.startsWith(`${OPERATION_BUNDLE_NOBLE_PACKAGE.key}/`)) {
          const relative = manifest.slice(OPERATION_BUNDLE_NOBLE_PACKAGE.key.length + 1);
          const pinned = OPERATION_BUNDLE_NOBLE_PACKAGE.files.find(file => file.path === relative);
          const bytes = readFileSync(resolve(REPOSITORY_ROOT, manifest));
          expect(pinned).toMatchObject({ bytes: bytes.length,
            sha256: createHash('sha256').update(bytes).digest('hex') });
        }
        paths.add(manifest);
      }
      parent = dirname(parent);
    }
  }
  activationSourceFixturePaths = [...paths];
});
const FROZEN_SOURCE_PATH = 'scripts/genesis001-binding-frozen-source.mjs';

function sourceFixture(extraPaths: readonly string[] = []) {
  const parent = realpathSync(mkdtempSync(join(tmpdir(), 'warpkeep-bundle-engine-')));
  const root = join(parent, 'repository');
  for (const path of new Set([...activationSourceFixturePaths, ...extraPaths])) {
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
  it.each(['disconnected-input', 'missing-import-target', 'unauthorized-external', 'relative-external',
    'unknown-synthetic-input', 'missing-authority', 'bare-builtin-outside-pinned-yaml'])('rejects %s in a real compiler graph', async kind => {
    const compiler: typeof build = async options => {
      const result = await build(options);
      const inputs = result.metafile!.inputs;
      const entry = inputs['scripts/sealed-realms-production-activation-workflow-entry.mjs'];
      if (kind === 'disconnected-input') inputs['scripts/compiler-orphan-fixture.mjs'] = {bytes: 1, imports: []};
      if (kind === 'missing-import-target') delete inputs['scripts/auth-bridge-config-attestation.mjs'];
      if (kind === 'unauthorized-external') entry.imports.push({path: 'unreviewed-package', kind: 'import-statement', external: true});
      if (kind === 'relative-external') entry.imports.push({path: './hidden-runtime.mjs', kind: 'import-statement', external: true});
      if (kind === 'unknown-synthetic-input') inputs['<unreviewed-define>'] = {bytes: 2, imports: []};
      if (kind === 'bare-builtin-outside-pinned-yaml') entry.imports.push({path: 'process', kind: 'require-call', external: true});
      if (kind === 'missing-authority') {
        const removed = 'scripts/sealed-realms-production-source-authority.mjs';
        delete inputs[removed];
        for (const input of Object.values(inputs)) input.imports = input.imports.filter(edge => edge.path !== removed);
      }
      return result;
    };
    await expect(buildSealedRealmOperationBundle({lane: 'activation', sourceRoot: REPOSITORY_ROOT, build: compiler}))
      .rejects.toMatchObject({code: 'SEALED_REALMS_BUNDLES_SOURCE_GRAPH_INVALID'});
  });

  it('derives newly reachable source membership without changing a stored count and hashes raw source bytes', async () => {
    const local = sourceFixture();
    const entry = join(local.root, 'scripts/sealed-realms-production-activation-workflow-entry.mjs');
    const extra = 'scripts/compiler-extra-fixture.mjs';
    try {
      const baseline = await buildSealedRealmOperationBundle({lane: 'activation', sourceRoot: local.root, build});
      writeFileSync(join(local.root, extra), 'export const unusedFixtureValue = 1;\n');
      writeFileSync(entry, `import './compiler-extra-fixture.mjs';\n${readFileSync(entry, 'utf8')}`);
      const changed = await buildSealedRealmOperationBundle({lane: 'activation', sourceRoot: local.root, build});
      expect(changed.graphManifest.map(file => file.path)).toEqual([...baseline.graphManifest.map(file => file.path), extra].sort());
      for (const member of changed.graphManifest) {
        const bytes = readFileSync(join(local.root, member.path));
        expect(member).toMatchObject({byteLength: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')});
      }
      const repeated = await buildSealedRealmOperationBundle({lane: 'activation', sourceRoot: local.root, build});
      expect(repeated.graphManifest).toEqual(changed.graphManifest);
      expect(repeated.bytes).toEqual(changed.bytes);
    } finally { local.cleanup(); }
  });

  it('imports in an isolated directory where bare third-party resolution is unavailable', () => {
    const local = sourceFixture();
    const isolatedEngine = join(local.parent, 'sealed-realms-production-bundle-engine.mjs');
    copyFileSync(resolve(REPOSITORY_ROOT, 'scripts/sealed-realms-production-bundle-engine.mjs'), isolatedEngine);
    copyFileSync(resolve(REPOSITORY_ROOT, 'scripts/local-operation-bundle-noble-v1.mjs'), join(local.parent, 'local-operation-bundle-noble-v1.mjs'));
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
  }, FILESYSTEM_BUILD_TIMEOUT);

  it('normalizes equivalent absolute source-root spellings before a real activation build', async () => {
    const local = sourceFixture();
    const observedWorkingDirectories: string[] = [];
    const compiler: typeof build = (options: BuildOptions) => {
      observedWorkingDirectories.push(options.absWorkingDir!);
      return build(options);
    };
    try {
      const normalized = await buildSealedRealmOperationBundle({
        lane: 'activation', sourceRoot: local.root, build: compiler,
      });
      const trailingSeparator = await buildSealedRealmOperationBundle({
        lane: 'activation', sourceRoot: `${local.root}${sep}`, build: compiler,
      });
      const dotSegments = await buildSealedRealmOperationBundle({
        lane: 'activation', sourceRoot: `${local.root}${sep}unused${sep}..`, build: compiler,
      });
      for (const equivalent of [trailingSeparator, dotSegments]) {
        expect(equivalent.bytes).toEqual(normalized.bytes);
        expect(equivalent.graphManifest).toEqual(normalized.graphManifest);
        expect(equivalent.sourceClosureDigest).toBe(normalized.sourceClosureDigest);
      }
      expect(observedWorkingDirectories).toEqual([
        local.root, local.root, local.root,
      ]);
    } finally { local.cleanup(); }
  }, FILESYSTEM_BUILD_TIMEOUT);

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
  }, FILESYSTEM_BUILD_TIMEOUT);

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
  }, FILESYSTEM_BUILD_TIMEOUT);

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
