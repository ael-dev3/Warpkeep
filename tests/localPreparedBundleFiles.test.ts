// @vitest-environment node

import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

import * as engine from '../scripts/sealed-realms-production-bundle-engine.mjs';

const REPOSITORY_ROOT = resolve(import.meta.dirname, '..');
const PROFILE = 'warpkeep-spacetime-binding-final-preparation-linux-x64-v1';
const SOURCE_COMMIT = 'a'.repeat(40);
const SOURCE_TREE = 'b'.repeat(40);
const MANIFEST_PATH = 'scripts/sealed-realms-production-bundle-manifest-v1.json';
const DISPATCH_DECLARATION_PATH = 'scripts/sealed-realms-production-dispatch.d.mts';
const SPECS = {
  activation: {
    entryPath: 'scripts/sealed-realms-production-activation-workflow-entry.mjs',
    basename: 'sealed-realms-production-activation-lane.bundle.mjs',
    graphCount: 14,
    factoryExport: 'createSealedRealmsProductionActivationWorkflowRuntime',
    factoryFailureCode: 'SEALED_REALMS_ACTIVATION_WORKFLOW_INPUT_INVALID',
    exportNames: ['createSealedRealmsProductionActivationWorkflowRuntime',
      'runSealedRealmsProductionActivationOperation'],
    acceptedOperation: 'activation-evidence-inspect',
  },
  g001: {
    entryPath: 'scripts/sealed-realms-production-g001-workflow-entry.mjs',
    basename: 'sealed-realms-production-g001-lane.bundle.mjs',
    graphCount: 12,
    factoryExport: 'createSealedRealmsProductionG001WorkflowRuntime',
    factoryFailureCode: 'SEALED_REALMS_G001_WORKFLOW_INPUT_INVALID',
    exportNames: ['createSealedRealmsProductionG001WorkflowRuntime',
      'runSealedRealmsProductionG001Operation'],
    acceptedOperation: 'preflight',
  },
  g002: {
    entryPath: 'scripts/sealed-realms-production-g002-workflow-entry.mjs',
    basename: 'sealed-realms-production-g002-lane.bundle.mjs',
    graphCount: 131,
    factoryExport: 'createSealedRealmsProductionG002WorkflowRuntime',
    factoryFailureCode: 'SEALED_REALMS_G002_WORKFLOW_INPUT_INVALID',
    exportNames: ['createSealedRealmsProductionG002WorkflowRuntime',
      'runSealedRealmsProductionG002Operation'],
    acceptedOperation: 'g002-publish-inspect',
  },
  ptr: {
    entryPath: 'scripts/sealed-realms-production-ptr-workflow-entry.mjs',
    basename: 'sealed-realms-production-ptr-lane.bundle.mjs',
    graphCount: 131,
    factoryExport: 'createSealedRealmsProductionPtrWorkflowRuntime',
    factoryFailureCode: 'SEALED_REALMS_PTR_WORKFLOW_INPUT_INVALID',
    exportNames: ['createSealedRealmsProductionPtrWorkflowRuntime',
      'runSealedRealmsProductionPtrOperation'],
    acceptedOperation: 'ptr-publish-inspect',
  },
} as const;
const LANES = ['activation', 'g001', 'g002', 'ptr'] as const;
const EXPECTED_PATHS = [
  'scripts/sealed-realms-production-activation-lane.bundle.d.mts',
  'scripts/sealed-realms-production-activation-lane.bundle.mjs',
  MANIFEST_PATH,
  'scripts/sealed-realms-production-g001-lane.bundle.d.mts',
  'scripts/sealed-realms-production-g001-lane.bundle.mjs',
  'scripts/sealed-realms-production-g002-lane.bundle.d.mts',
  'scripts/sealed-realms-production-g002-lane.bundle.mjs',
  'scripts/sealed-realms-production-ptr-lane.bundle.d.mts',
  'scripts/sealed-realms-production-ptr-lane.bundle.mjs',
] as const;

function sha256(bytes: Uint8Array | string) {
  return createHash('sha256').update(bytes).digest('hex');
}

function gitBlob(path: string) {
  return execFileSync('git', ['show', `HEAD:${path}`], {
    cwd: REPOSITORY_ROOT, encoding: 'buffer', windowsHide: true,
  });
}

function declarationPath(entryPath: string) {
  return entryPath.replace(/\.mjs$/u, '.d.mts');
}

function outputDeclarationPath(basename: string) {
  return `scripts/${basename.replace(/\.mjs$/u, '.d.mts')}`;
}

function sourceClosureDigest(lane: string, graphManifest: unknown) {
  return sha256(Buffer.from(JSON.stringify([
    'warpkeep-sealed-realms-production-source-graph-v1', lane, graphManifest,
  ]), 'utf8'));
}

function fixedGraphManifest(lane: typeof LANES[number], longPaths = false) {
  const spec = SPECS[lane];
  const generated = Array.from({ length: spec.graphCount - 1 }, (_, index) => {
    const path = longPaths
      ? `scripts/${lane}/${String(index).padStart(3, '0')}-${'x'.repeat(4_096)}.mjs`
      : `node_modules/warpkeep-fixture/${lane}/${String(index).padStart(3, '0')}.mjs`;
    return { path, byteLength: Buffer.byteLength(path), sha256: sha256(path) };
  });
  return [...generated, ...engine.getSealedRealmOperationBundleSpecification(lane).requiredGraphPaths.map(path => ({
    path, byteLength: Buffer.byteLength(path), sha256: sha256(path),
  }))].sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
}

function fixture() {
  const entryDeclarations = new Map<string, Uint8Array>();
  const bundles = LANES.map((lane, index) => {
    const spec = SPECS[lane];
    const declaration = gitBlob(declarationPath(spec.entryPath));
    entryDeclarations.set(declarationPath(spec.entryPath), new Uint8Array(declaration));
    const bytes = Buffer.from(`export const ${lane}BundleFixture = ${index};\n`, 'utf8');
    const graphManifest = fixedGraphManifest(lane);
    const byteDigest = sha256(bytes);
    return {
      lane,
      basename: spec.basename,
      bytes: new Uint8Array(bytes),
      byteDigest,
      sourceClosureDigest: sourceClosureDigest(lane, graphManifest),
      graphManifest,
      exportNames: [...spec.exportNames],
      factoryExport: spec.factoryExport,
      factoryFailureCode: spec.factoryFailureCode,
      load: {
        profile: 'warpkeep-linux-operation-bundle-load-v1',
        byteDigest,
        exportNames: [...spec.exportNames],
        factoryFailureCode: spec.factoryFailureCode,
      },
    };
  });
  return {
    bundles: { profile: PROFILE, sourceCommit: SOURCE_COMMIT, sourceTree: SOURCE_TREE, bundles },
    entryDeclarations,
  };
}

function expectedManifest(input: ReturnType<typeof fixture>) {
  return {
    schemaVersion: 1,
    profile: PROFILE,
    sourceCommit: SOURCE_COMMIT,
    sourceTree: SOURCE_TREE,
    bundles: LANES.map((lane) => {
      const bundle = input.bundles.bundles.find(candidate => candidate.lane === lane)!;
      const declaration = input.entryDeclarations.get(declarationPath(SPECS[lane].entryPath))!;
      return {
        lane,
        path: `scripts/${bundle.basename}`,
        byteLength: bundle.bytes.byteLength,
        sha256: sha256(bundle.bytes),
        sourceClosureDigest: bundle.sourceClosureDigest,
        graphManifest: bundle.graphManifest.map(member => ({ ...member })),
        declaration: {
          path: outputDeclarationPath(bundle.basename),
          byteLength: declaration.byteLength,
          sha256: sha256(declaration),
        },
        exportNames: [...bundle.exportNames],
        factoryExport: bundle.factoryExport,
        factoryFailureCode: bundle.factoryFailureCode,
      };
    }),
  };
}

async function preparedModule(): Promise<Record<string, any>> {
  const url = pathToFileURL(resolve(REPOSITORY_ROOT,
    'scripts/local-prepared-bundle-files.mjs')).href;
  return import(url);
}

function replaceDeclaration(input: ReturnType<typeof fixture>, lane: typeof LANES[number],
  update: (source: string) => string) {
  const path = declarationPath(SPECS[lane].entryPath);
  const source = Buffer.from(input.entryDeclarations.get(path)!).toString('utf8');
  input.entryDeclarations.set(path, Buffer.from(update(source), 'utf8'));
}

function expectInvalid(call: () => unknown, rawInput?: string) {
  try {
    call();
    throw new Error('expected prepared-bundle validation failure');
  } catch (error) {
    expect(error).toMatchObject({
      name: 'LocalPreparedBundleFilesError',
      code: 'LOCAL_PREPARED_BUNDLE_FILES_INVALID',
      message: 'LOCAL_PREPARED_BUNDLE_FILES_INVALID',
    });
    if (rawInput !== undefined) expect(String(error)).not.toContain(rawInput);
  }
}

describe('local prepared bundle files', () => {
  it('exposes the engine fixed specifications by identity and rejects unknown lanes', () => {
    const get = (engine as Record<string, any>).getSealedRealmOperationBundleSpecification;
    expect(typeof get).toBe('function');
    for (const lane of LANES) {
      const first = get(lane);
      const { acceptedOperation: _acceptedOperation, graphCount: _fixtureGraphCount,
        ...expectedSpec } = SPECS[lane];
      expect(first).toEqual({ ...expectedSpec, requiredGraphPaths: expect.any(Array) });
      expect(first.requiredGraphPaths).toContain(expectedSpec.entryPath);
      expect(first.requiredGraphPaths).toContain('scripts/sealed-realms-production-source-authority.mjs');
      expect(get(lane)).toBe(first);
      expect(Object.isFrozen(first)).toBe(true);
      expect(Object.isFrozen(first.exportNames)).toBe(true);
      expect(Object.isFrozen(first.requiredGraphPaths)).toBe(true);
    }
    expect(() => get('unknown')).toThrow(expect.objectContaining({
      name: 'SealedRealmsProductionBundlesError',
      code: 'SEALED_REALMS_BUNDLES_INPUT_INVALID',
    }));
  });

  it('emits the exact deterministic nine-file family and complete manifest', async () => {
    const module = await preparedModule();
    const input = fixture();
    const result = module.derivePreparedOperationBundleFiles(input);
    const expectedManifestBytes = Buffer.from(
      `${JSON.stringify(expectedManifest(input), null, 2)}\n`, 'utf8',
    );

    expect(result.files.map((file: { path: string }) => file.path)).toEqual(EXPECTED_PATHS);
    expect(result.files.find((file: { path: string }) => file.path === MANIFEST_PATH)?.bytes)
      .toEqual(expectedManifestBytes);
    expect(module.derivePreparedOperationBundleFiles(input)).toEqual(result);
    expect(result).toMatchObject({
      profile: PROFILE, sourceCommit: SOURCE_COMMIT, sourceTree: SOURCE_TREE,
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.files)).toBe(true);
    expect(result.files.every((file: unknown) => Object.isFrozen(file))).toBe(true);
    for (const lane of LANES) {
      const spec = SPECS[lane];
      expect(result.files.find((file: { path: string }) => (
        file.path === outputDeclarationPath(spec.basename)
      ))?.bytes).toEqual(input.entryDeclarations.get(declarationPath(spec.entryPath)));
    }
  });

  it('copies all output bytes without aliasing caller buffers or repeat results', async () => {
    const module = await preparedModule();
    const input = fixture();
    const callerBundle = input.bundles.bundles[0].bytes;
    const callerDeclaration = input.entryDeclarations.values().next().value!;
    const bundleSnapshot = new Uint8Array(callerBundle);
    const declarationSnapshot = new Uint8Array(callerDeclaration);
    const first = module.derivePreparedOperationBundleFiles(input);
    const second = module.derivePreparedOperationBundleFiles(input);
    const firstBundle = first.files.find((file: { path: string }) => file.path.endsWith('.bundle.mjs'));
    const secondBundle = second.files.find((file: { path: string }) => file.path === firstBundle.path);
    const firstDeclaration = first.files.find((file: { path: string }) => file.path.endsWith('.d.mts'));
    const secondDeclaration = second.files.find(
      (file: { path: string }) => file.path === firstDeclaration.path,
    );
    expect(firstBundle.bytes).not.toBe(callerBundle);
    expect(firstBundle.bytes).not.toBe(secondBundle.bytes);
    expect(firstDeclaration.bytes).not.toBe(callerDeclaration);
    expect(firstDeclaration.bytes).not.toBe(secondDeclaration.bytes);
    firstBundle.bytes.fill(0);
    firstDeclaration.bytes.fill(0);
    expect(callerBundle).toEqual(bundleSnapshot);
    expect(callerDeclaration).toEqual(declarationSnapshot);
    expect(secondBundle.bytes).toEqual(bundleSnapshot);
    expect(secondDeclaration.bytes).toEqual(declarationSnapshot);
  });

  const mutations: Array<readonly [string, (input: ReturnType<typeof fixture>) => unknown]> = [
    ['rejects wrong preparation profile', input => { input.bundles.profile = 'other'; }],
    ['rejects malformed source commit', input => { input.bundles.sourceCommit = 'A'.repeat(40); }],
    ['rejects malformed source tree', input => { input.bundles.sourceTree = 'b'.repeat(39); }],
    ['rejects extra runtime result keys', input => { (input.bundles as any).extra = true; }],
    ['rejects missing runtime result keys', input => { delete (input.bundles as any).sourceTree; }],
    ['rejects missing lanes', input => { input.bundles.bundles.pop(); }],
    ['rejects extra lanes', input => { input.bundles.bundles.push({ ...input.bundles.bundles[0] }); }],
    ['rejects duplicate lanes', input => { input.bundles.bundles[1].lane = 'activation'; }],
    ['rejects unknown lanes', input => { (input.bundles.bundles[1] as any).lane = 'unknown'; }],
    ['rejects out-of-order lanes', input => { input.bundles.bundles.reverse(); }],
    ['rejects extra bundle keys', input => { (input.bundles.bundles[0] as any).extra = true; }],
    ['rejects missing bundle keys', input => { delete (input.bundles.bundles[0] as any).load; }],
    ['rejects wrong basenames', input => { (input.bundles.bundles[0] as any).basename = 'wrong.mjs'; }],
    ['rejects non-byte bundle bodies', input => { input.bundles.bundles[0].bytes = 'body' as any; }],
    ['rejects empty bundle bodies', input => { input.bundles.bundles[0].bytes = new Uint8Array(); }],
    ['rejects bundle bodies over 4 MiB', input => {
      input.bundles.bundles[0].bytes = new Uint8Array(4 * 1024 * 1024 + 1);
    }],
    ['rejects wrong bundle body hashes', input => {
      input.bundles.bundles[0].byteDigest = '0'.repeat(64);
      input.bundles.bundles[0].load.byteDigest = '0'.repeat(64);
    }],
    ['rejects wrong source graph hashes', input => {
      input.bundles.bundles[0].sourceClosureDigest = '0'.repeat(64);
    }],
    ['rejects wrong export names', input => { input.bundles.bundles[0].exportNames.reverse(); }],
    ['rejects wrong factory exports', input => {
      (input.bundles.bundles[0] as any).factoryExport = 'wrong';
    }],
    ['rejects wrong factory failure codes', input => {
      (input.bundles.bundles[0] as any).factoryFailureCode = 'WRONG';
    }],
    ['rejects extra load keys', input => { (input.bundles.bundles[0].load as any).extra = true; }],
    ['rejects missing load keys', input => {
      delete (input.bundles.bundles[0].load as any).factoryFailureCode;
    }],
    ['rejects wrong load profile', input => { input.bundles.bundles[0].load.profile = 'other'; }],
    ['rejects mismatched load body hashes', input => {
      input.bundles.bundles[0].load.byteDigest = '0'.repeat(64);
    }],
    ['rejects mismatched load exports', input => { input.bundles.bundles[0].load.exportNames.reverse(); }],
    ['rejects mismatched load failure codes', input => {
      (input.bundles.bundles[0].load as any).factoryFailureCode = 'WRONG';
    }],
    ['rejects empty source graphs', input => {
      input.bundles.bundles[0].graphManifest = [];
      input.bundles.bundles[0].sourceClosureDigest = sourceClosureDigest('activation', []);
    }],
    ['rejects a missing required authority member with a recomputed closure digest', input => {
      const bundle = input.bundles.bundles[0];
      const removable = bundle.graphManifest.findIndex(member => member.path === 'scripts/sealed-realms-production-source-authority.mjs');
      bundle.graphManifest.splice(removable, 1);
      bundle.sourceClosureDigest = sourceClosureDigest('activation', bundle.graphManifest);
    }],
    ['rejects a graph missing its fixed entry path with a recomputed closure digest', input => {
      const bundle = input.bundles.bundles[0];
      const entry = bundle.graphManifest.findIndex(member => member.path === SPECS.activation.entryPath);
      (bundle.graphManifest as Array<{ path: string; byteLength: number; sha256: string }>)[entry] = {
        path: 'scripts/zz-missing-activation-entry.mjs',
        byteLength: 1,
        sha256: sha256('invented graph member'),
      };
      bundle.graphManifest.sort((left, right) => (
        left.path < right.path ? -1 : left.path > right.path ? 1 : 0
      ));
      bundle.sourceClosureDigest = sourceClosureDigest('activation', bundle.graphManifest);
    }],
    ['rejects absolute graph paths', input => {
      (input.bundles.bundles[0].graphManifest[0] as any).path = '/x';
    }],
    ['rejects backslash graph paths', input => {
      (input.bundles.bundles[0].graphManifest[0] as any).path = 'scripts\\x';
    }],
    ['rejects graph dot segments', input => {
      (input.bundles.bundles[0].graphManifest[0] as any).path = 'scripts/../x';
    }],
    ['rejects duplicate graph paths', input => {
      const member = input.bundles.bundles[0].graphManifest[0];
      input.bundles.bundles[0].graphManifest = [{ ...member }, { ...member }];
    }],
    ['rejects out-of-order graph paths', input => {
      const member = input.bundles.bundles[0].graphManifest[0];
      (input.bundles.bundles[0] as any).graphManifest = [
        { ...member, path: 'scripts/z.mjs' }, { ...member, path: 'scripts/a.mjs' },
      ];
    }],
    ['rejects malformed graph digests', input => {
      input.bundles.bundles[0].graphManifest[0].sha256 = 'A'.repeat(64);
    }],
    ['rejects extra graph member keys', input => {
      (input.bundles.bundles[0].graphManifest[0] as any).extra = true;
    }],
    ['rejects malformed graph byte lengths', input => {
      input.bundles.bundles[0].graphManifest[0].byteLength = -1;
    }],
    ['rejects fractional graph byte lengths', input => {
      input.bundles.bundles[0].graphManifest[0].byteLength = 0.5;
    }],
    ['rejects non-Map declaration collections', input => { input.entryDeclarations = {} as any; }],
    ['rejects Map subclasses', input => {
      class DeclarationMap extends Map<string, Uint8Array> {}
      input.entryDeclarations = new DeclarationMap(input.entryDeclarations);
    }],
    ['rejects missing declarations', input => {
      input.entryDeclarations.delete(declarationPath(SPECS.activation.entryPath));
    }],
    ['rejects extra declarations', input => { input.entryDeclarations.set('scripts/extra.d.mts', Buffer.from('x')); }],
    ['rejects non-byte declarations', input => {
      input.entryDeclarations.set(declarationPath(SPECS.activation.entryPath), 'text' as any);
    }],
    ['rejects empty declarations', input => {
      input.entryDeclarations.set(declarationPath(SPECS.activation.entryPath), new Uint8Array());
    }],
    ['rejects declarations over 64 KiB', input => {
      input.entryDeclarations.set(declarationPath(SPECS.activation.entryPath),
        new Uint8Array(64 * 1024 + 1));
    }],
    ['rejects invalid UTF-8 declarations', input => {
      input.entryDeclarations.set(declarationPath(SPECS.activation.entryPath),
        Uint8Array.from([0xc3, 0x28]));
    }],
    ['rejects CR declaration bytes', input => replaceDeclaration(input, 'activation',
      source => source.replace('\n', '\r\n'))],
    ['rejects NUL declaration bytes', input => replaceDeclaration(input, 'activation',
      source => `${source}\0`)],
    ['rejects additional external declaration imports', input => replaceDeclaration(input,
      'activation', source => `${source}\nimport type { Extra } from './extra.mjs';\n`)],
    ['rejects changed dispatcher declaration imports', input => replaceDeclaration(input,
      'activation', source => source.replace('./sealed-realms-production-dispatch.mjs', './other.mjs'))],
    ['rejects value dispatcher declaration imports', input => replaceDeclaration(input,
      'activation', source => source.replace('import type {', 'import {'))],
    ['rejects declaration reexports', input => replaceDeclaration(input, 'activation',
      source => `${source}\nexport { Extra } from './extra.mjs';\n`)],
    ['rejects declaration export assignments', input => replaceDeclaration(input, 'activation',
      source => `${source}\nexport = activationWorkflowRuntimeBrand;\n`)],
  ];

  it.each(mutations)('%s', async (_name, mutate) => {
    const module = await preparedModule();
    const input = fixture();
    mutate(input);
    expectInvalid(() => module.derivePreparedOperationBundleFiles(input));
  });

  it('rejects non-exact top-level options', async () => {
    const module = await preparedModule();
    const input = fixture();
    for (const invalid of [
      null,
      {},
      { bundles: input.bundles },
      { ...input, extra: true },
    ]) expectInvalid(() => module.derivePreparedOperationBundleFiles(invalid));
  });

  it('rejects an exact declaration that is missing one required export', async () => {
    const module = await preparedModule();
    const input = fixture();
    replaceDeclaration(input, 'activation', source => source.replace(
      'export function runSealedRealmsProductionActivationOperation',
      'declare function runSealedRealmsProductionActivationOperation',
    ));
    expectInvalid(() => module.derivePreparedOperationBundleFiles(input));
  });

  it('rejects a declaration exporting an extra function', async () => {
    const module = await preparedModule();
    const input = fixture();
    replaceDeclaration(input, 'activation', source => `${source}\nexport function extra(): void;\n`);
    expectInvalid(() => module.derivePreparedOperationBundleFiles(input));
  });

  it('does not wipe or mutate caller buffers on failure', async () => {
    const module = await preparedModule();
    const input = fixture();
    const bundle = input.bundles.bundles[0].bytes;
    const declaration = input.entryDeclarations.values().next().value!;
    const bundleSnapshot = new Uint8Array(bundle);
    const declarationSnapshot = new Uint8Array(declaration);
    input.bundles.bundles[3].byteDigest = '0'.repeat(64);
    expectInvalid(() => module.derivePreparedOperationBundleFiles(input),
      Buffer.from(bundle).toString('utf8'));
    expect(bundle).toEqual(bundleSnapshot);
    expect(declaration).toEqual(declarationSnapshot);
  });

  it('rejects a manifest over 1 MiB', async () => {
    const module = await preparedModule();
    const input = fixture();
    for (const [laneIndex, lane] of LANES.entries()) {
      const bundle = input.bundles.bundles[laneIndex];
      (bundle as any).graphManifest = fixedGraphManifest(lane, true);
      bundle.sourceClosureDigest = sourceClosureDigest(lane, bundle.graphManifest);
    }
    expect(Buffer.byteLength(`${JSON.stringify(expectedManifest(input), null, 2)}\n`, 'utf8'))
      .toBeGreaterThan(1024 * 1024);
    expectInvalid(() => module.derivePreparedOperationBundleFiles(input));
  });

  it('preserves the four real declaration ABIs for accepted and rejected operations', async () => {
    const module = await preparedModule();
    const input = fixture();
    const result = module.derivePreparedOperationBundleFiles(input);
    const root = mkdtempSync(resolve(tmpdir(), 'warpkeep-prepared-declarations-'));
    try {
      const declarationPaths = execFileSync('git', [
        'ls-tree', '-r', '--name-only', 'HEAD', '--', 'scripts',
      ], { cwd: REPOSITORY_ROOT, encoding: 'utf8', windowsHide: true })
        .trim().split('\n').filter(path => (
          /^scripts\/sealed-realms-production-.*\.d\.mts$/u.test(path)
        ));
      for (const path of declarationPaths) {
        const destination = resolve(root, path);
        mkdirSync(dirname(destination), { recursive: true });
        writeFileSync(destination, gitBlob(path));
      }
      expect(declarationPaths).toContain(DISPATCH_DECLARATION_PATH);
      for (const file of result.files.filter((candidate: { path: string }) => (
        candidate.path.endsWith('.d.mts')
      ))) {
        const destination = resolve(root, file.path);
        mkdirSync(dirname(destination), { recursive: true });
        writeFileSync(destination, file.bytes);
      }
      const compiler = resolve(REPOSITORY_ROOT, 'node_modules/typescript/bin/tsc');
      for (const lane of LANES) {
        const spec = SPECS[lane];
        const imports = [
          spec.entryPath,
          `scripts/${spec.basename}`,
        ];
        const statuses: Record<string, number | null> = {};
        const diagnostics: Record<string, string> = {};
        for (const kind of ['accepted', 'rejectedFactory', 'rejectedRun'] as const) {
          const outcomes = imports.map((path, index) => {
            const consumer = resolve(root, `consumer-${lane}-${kind}-${index}.mts`);
            const factoryOperation = kind === 'rejectedFactory'
              ? 'not-a-real-operation' : spec.acceptedOperation;
            const runOperation = kind === 'rejectedRun'
              ? 'not-a-real-operation' : spec.acceptedOperation;
            writeFileSync(consumer, [
              `import { ${spec.factoryExport} as create, ${spec.exportNames[1]} as run } from './${path}';`,
              'async function consume(): Promise<void> {',
              `  const runtime = await create({ operation: '${factoryOperation}', workflowInputSha: '${'c'.repeat(64)}' });`,
              `  void run({ runtime, operation: '${runOperation}', workflowInputSha: '${'c'.repeat(64)}' });`,
              '}',
              'void consume();',
              '',
            ].join('\n'));
            return spawnSync(process.execPath, [compiler, '--noEmit', '--strict', '--target', 'ES2022',
              '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--types', 'node',
              '--typeRoots', resolve(REPOSITORY_ROOT, 'node_modules/@types'), consumer], {
              cwd: root, encoding: 'utf8', windowsHide: true,
            });
          });
          expect(outcomes[0].status, outcomes[0].stderr || outcomes[0].stdout)
            .toBe(outcomes[1].status);
          statuses[kind] = outcomes[0].status;
          diagnostics[kind] = outcomes[0].stderr || outcomes[0].stdout;
        }
        expect(statuses.accepted, diagnostics.accepted).toBe(0);
        expect(statuses.rejectedFactory, diagnostics.rejectedFactory).not.toBe(0);
        expect(statuses.rejectedRun, diagnostics.rejectedRun).not.toBe(0);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);
});
