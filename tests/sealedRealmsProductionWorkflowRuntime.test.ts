// @vitest-environment node

import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { recoveryBindingCandidate } from './fixtures/recoveryBindingCandidate';
import { createRecoveryActivationBinding } from '../scripts/recovery-activation-candidate.mjs';

const SWAPPED_SOURCE = 'b'.repeat(40);
const BINDING_PATH = 'config/releases/0.4.0-sealed-launch.json';
const INERT_BINDING_SOURCE = readFileSync(new URL(`../${BINDING_PATH}`, import.meta.url), 'utf8');
const EVIDENCE_MODULE = '../scripts/sealed-realms-production-workflow-evidence.mjs';
const PRIVATE_RESOLVER_MODULE = '../scripts/sealed-realms-production-workflow-private-state.mjs';
const PRIVATE_STATE_MODULE = '../scripts/sealed-realms-production-private-state.mjs';
const FIXTURE_TIMEOUT = 30_000;

type AnyFunction = (...arguments_: any[]) => any;
type RuntimeModule = Readonly<Record<string, unknown>>;

const ENTRIES = Object.freeze([
  Object.freeze({
    lane: 'g001',
    path: '../scripts/sealed-realms-production-g001-workflow-entry.mjs',
    factory: 'createSealedRealmsProductionG001WorkflowRuntime',
    run: 'runSealedRealmsProductionG001Operation',
    operation: 'preflight',
    crossedOperation: 'g002-publish-inspect',
    expected: Object.freeze({ operation: 'preflight', status: 'preflight-inspected' }),
  }),
  Object.freeze({
    lane: 'g002',
    path: '../scripts/sealed-realms-production-g002-workflow-entry.mjs',
    factory: 'createSealedRealmsProductionG002WorkflowRuntime',
    run: 'runSealedRealmsProductionG002Operation',
    operation: 'g002-publish-inspect',
    crossedOperation: 'ptr-publish-inspect',
    expectedFailure: 'SEALED_REALMS_DISPATCH_LANE_FAILED',
  }),
  Object.freeze({
    lane: 'ptr',
    path: '../scripts/sealed-realms-production-ptr-workflow-entry.mjs',
    factory: 'createSealedRealmsProductionPtrWorkflowRuntime',
    run: 'runSealedRealmsProductionPtrOperation',
    operation: 'ptr-publish-inspect',
    crossedOperation: 'activation-evidence-inspect',
    expectedFailure: 'SEALED_REALMS_DISPATCH_LANE_FAILED',
  }),
  Object.freeze({
    lane: 'activation',
    path: '../scripts/sealed-realms-production-activation-workflow-entry.mjs',
    factory: 'createSealedRealmsProductionActivationWorkflowRuntime',
    run: 'runSealedRealmsProductionActivationOperation',
    operation: 'activation-evidence-inspect',
    crossedOperation: 'preflight',
    expectedFailure: 'SEALED_REALMS_DISPATCH_LANE_FAILED',
  }),
] as const);

const LIVE_ENTRIES = Object.freeze([
  Object.freeze({
    lane: 'g002',
    path: '../scripts/sealed-realms-production-g002-workflow-entry.mjs',
    factory: 'createSealedRealmsProductionG002WorkflowRuntime',
    run: 'runSealedRealmsProductionG002Operation',
    operation: 'g002-live-inspect',
  }),
  Object.freeze({
    lane: 'ptr',
    path: '../scripts/sealed-realms-production-ptr-workflow-entry.mjs',
    factory: 'createSealedRealmsProductionPtrWorkflowRuntime',
    run: 'runSealedRealmsProductionPtrOperation',
    operation: 'ptr-live-inspect',
  }),
] as const);

function git(repositoryRoot: string, arguments_: readonly string[], input?: string) {
  return execFileSync('git', [...arguments_], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    input,
    maxBuffer: 128 * 1_024,
    timeout: 5_000,
    windowsHide: true,
  }).trim();
}

function binding(preparationSourceCommit: string | null, pagesDeploymentApproved: boolean) {
  return `${JSON.stringify({
    ...JSON.parse(INERT_BINDING_SOURCE),
    pagesDeploymentApproved,
    preparationSourceCommit,
  })}\n`;
}

function repositoryFixture(
  mode: 'S' | 'A' | 'V2',
  options: Readonly<{ extraActivationPath?: boolean; invalidParentBinding?: boolean }> = {},
) {
  const repositoryRoot = mkdtempSync(join(tmpdir(), 'warpkeep-workflow-repository-'));
  git(repositoryRoot, ['init', '--quiet']);
  git(repositoryRoot, ['config', 'user.email', 'workflow-test@warpkeep.invalid']);
  git(repositoryRoot, ['config', 'user.name', 'Warpkeep Workflow Test']);
  git(repositoryRoot, ['config', 'core.autocrlf', 'false']);
  const bindingFile = join(repositoryRoot, ...BINDING_PATH.split('/'));
  mkdirSync(join(repositoryRoot, 'config', 'releases'), { recursive: true });
  // Commit the real inert source bytes before learning their Git commit ID.
  // A malformed-parent case is explicit; ordinary S needs no replacement refs.
  writeFileSync(bindingFile, options.invalidParentBinding === true
    ? binding(SWAPPED_SOURCE, false) : INERT_BINDING_SOURCE, 'utf8');
  writeFileSync(join(repositoryRoot, 'package.json'), '{"fixture":1}\n', 'utf8');
  writeFileSync(join(repositoryRoot, 'package-lock.json'), '{"fixture":1}\n', 'utf8');
  if (mode === 'V2') {
    for (const path of ['package.json', 'package-lock.json']) {
      writeFileSync(join(repositoryRoot, path), readFileSync(new URL(`../${path}`, import.meta.url)));
    }
  }
  git(repositoryRoot, ['add', '--', BINDING_PATH, 'package.json', 'package-lock.json']);
  git(repositoryRoot, ['commit', '--quiet', '-m', 'inert preparation source']);
  const preparationSourceCommit = git(repositoryRoot, ['rev-parse', 'HEAD']);

  let sourceCommit = preparationSourceCommit;
  if (mode === 'A' || mode === 'V2') {
    writeFileSync(bindingFile, binding(preparationSourceCommit, true), 'utf8');
    writeFileSync(join(repositoryRoot, 'package.json'), '{"fixture":2}\n', 'utf8');
    writeFileSync(join(repositoryRoot, 'package-lock.json'), '{"fixture":2}\n', 'utf8');
    if (mode === 'V2') {
      const candidate = recoveryBindingCandidate();
      Object.assign(candidate, { preparationSourceCommit, preparationSourceTree: git(repositoryRoot, ['rev-parse', 'HEAD^{tree}']),
        g001PolicySourceCommit: preparationSourceCommit, authBridgeSourceCommit: preparationSourceCommit });
      writeFileSync(bindingFile, `${JSON.stringify(createRecoveryActivationBinding(`${JSON.stringify(candidate, null, 2)}\n`), null, 2)}\n`);
      for (const path of ['package.json', 'package-lock.json']) {
        const value = JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
        value.version = '0.4.0';
        if (path === 'package-lock.json') value.packages[''].version = '0.4.0';
        writeFileSync(join(repositoryRoot, path), `${JSON.stringify(value, null, 2)}\n`);
      }
    }
    const activationPaths = [BINDING_PATH, 'package.json', 'package-lock.json'];
    if (options.extraActivationPath === true) {
      writeFileSync(join(repositoryRoot, 'unexpected.txt'), 'unexpected\n', 'utf8');
      activationPaths.push('unexpected.txt');
    }
    git(repositoryRoot, ['add', '--', ...activationPaths]);
    git(repositoryRoot, ['commit', '--quiet', '-m', 'activate fixed source']);
    sourceCommit = git(repositoryRoot, ['rev-parse', 'HEAD']);
  }
  git(repositoryRoot, ['update-ref', 'refs/remotes/origin/main', sourceCommit]);
  return Object.freeze({
    repositoryRoot,
    sourceCommit,
    preparationSourceCommit,
    cleanup: () => rmSync(repositoryRoot, { recursive: true, force: true }),
  });
}

function privateHomeFixture() {
  const home = mkdtempSync(join(tmpdir(), 'warpkeep-workflow-private-'));
  chmodSync(home, 0o700);
  for (const root of [
    join(home, 'Library', 'Application Support', 'Warpkeep', 'operations', 'audit', 'private'),
    join(home, 'Library', 'Application Support', 'Warpkeep', 'operations', 'runtime'),
    join(home, 'Library', 'Application Support', 'Warpkeep', 'operations', 'cache'),
  ]) {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    chmodSync(root, 0o700);
  }
  return Object.freeze({
    home,
    cleanup: () => rmSync(home, { recursive: true, force: true }),
  });
}

function installEvidenceVerifier(
  transform: (commit: string) => string = commit => commit,
) {
  const verifiedCommits: string[] = [];
  vi.doMock(EVIDENCE_MODULE, () => ({
    createSealedRealmsProductionWorkflowEvidence: async () => Object.freeze({}),
    refreshSealedRealmsProductionWorkflowEvidence: async () => undefined,
    revokeSealedRealmsProductionWorkflowEvidence: () => undefined,
    verifySealedRealmsProductionWorkflowEvidence: (_scope: unknown, commit: string) => {
      verifiedCommits.push(commit);
      return Object.freeze({ verifiedSha: transform(commit) });
    },
  }));
  return verifiedCommits;
}

function installPrivateResolver(home: string) {
  const resolutions: unknown[] = [];
  vi.doMock(PRIVATE_RESOLVER_MODULE, async () => {
    const actual = await vi.importActual<typeof import(
      '../scripts/sealed-realms-production-private-state.mjs'
    )>(PRIVATE_STATE_MODULE);
    return {
      resolveSealedRealmsProductionWorkflowPrivateState: () => {
        const state = actual.createSealedRealmsProductionPrivateState({
          reportedHome: home,
          testOnlyOwnerUid: statSync(home).uid,
          testOnlyFsync: () => {},
          testOnlyAllowPlatformMode: true,
        });
        resolutions.push(state);
        return state;
      },
    };
  });
  return resolutions;
}

function githubResponse(url: string, value: unknown) {
  const body = JSON.stringify(value);
  const result = new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(body)),
    },
  });
  Object.defineProperty(result, 'url', { value: url });
  return result;
}

function installWorkflowContext(sourceCommit: string, runId = '7001') {
  vi.stubEnv('GITHUB_TOKEN', 'github-sealed-realms-owner-token');
  vi.stubEnv('GITHUB_RUN_ID', runId);
  vi.stubEnv('GITHUB_RUN_ATTEMPT', '1');
  const fetchImpl = vi.fn(async (request: string | URL | Request) => {
    const url = String(request);
    if (url.endsWith('/branches/main')) {
      return githubResponse(url, {
        name: 'main', protected: true, commit: { sha: sourceCommit },
      });
    }
    return githubResponse(url, {
      id: Number(runId),
      run_attempt: 1,
      event: 'workflow_dispatch',
      status: 'in_progress',
      conclusion: null,
      head_branch: 'main',
      head_sha: sourceCommit,
      path: '.github/workflows/sealed-realms-production.yml',
      repository: { full_name: 'ael-dev3/Warpkeep' },
    });
  });
  vi.stubGlobal('fetch', fetchImpl);
  return fetchImpl;
}

async function loadEntry(path: string): Promise<RuntimeModule> {
  return import(path) as Promise<RuntimeModule>;
}

function functionExport(module: RuntimeModule, name: string): AnyFunction {
  const value = module[name];
  expect(value, `${name} must be exported`).toBeTypeOf('function');
  return value as AnyFunction;
}

function revokedProxy<T extends object>(value: T) {
  const proxy = Proxy.revocable(value, {});
  proxy.revoke();
  return proxy.proxy;
}

async function inRepository<T>(repositoryRoot: string, action: () => T | Promise<T>) {
  const previous = process.cwd();
  process.chdir(repositoryRoot);
  try {
    return await action();
  } finally {
    process.chdir(previous);
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.doUnmock(EVIDENCE_MODULE);
  vi.doUnmock(PRIVATE_RESOLVER_MODULE);
  vi.resetModules();
});

describe.sequential('sealed-realms production workflow runtime composition', () => {
  it('constructs S from exact checked-in inert bytes without replacement objects', () => {
    const repository = repositoryFixture('S');
    try {
      expect(JSON.parse(INERT_BINDING_SOURCE)).toMatchObject({
        schemaVersion: 1, profile: 'warpkeep-0.4.0-sealed-launch-v1',
        pagesDeploymentApproved: false, preparationSourceCommit: null,
      });
      expect(git(repository.repositoryRoot, ['show', `${repository.sourceCommit}:${BINDING_PATH}`]))
        .toBe(INERT_BINDING_SOURCE.trim());
      expect(git(repository.repositoryRoot, ['for-each-ref', '--format=%(refname)', 'refs/replace/']))
        .toBe('');
      expect(git(repository.repositoryRoot, ['--no-replace-objects', 'rev-parse', 'HEAD']))
        .toBe(repository.sourceCommit);
    } finally { repository.cleanup(); }
  });

  it.each(ENTRIES)('$lane production construction fails closed before private-state resolution', async entry => {
    const repository = repositoryFixture('S');
    const privateHome = privateHomeFixture();
    const privateResolutions = installPrivateResolver(privateHome.home);
    const github = installWorkflowContext(repository.sourceCommit);
    try {
      await inRepository(repository.repositoryRoot, async () => {
        const module = await loadEntry(entry.path);
        const factory = functionExport(module, entry.factory);
        await expect(factory({
          operation: entry.operation,
          workflowInputSha: repository.sourceCommit,
        })).rejects.toMatchObject({
          code: 'SEALED_REALMS_WORKFLOW_EVIDENCE_CONTEXT_INVALID',
        });
      });
      expect(privateResolutions).toEqual([]);
      expect(github).not.toHaveBeenCalled();
    } finally {
      repository.cleanup();
      privateHome.cleanup();
    }
  }, FIXTURE_TIMEOUT);

  it.each(ENTRIES)('$lane entry exports only its fixed runtime factory/run pair', async entry => {
    const module = await loadEntry(entry.path);
    expect(Object.keys(module).sort()).toEqual([entry.factory, entry.run].sort());
  });

  it.each(ENTRIES)('$lane entry composes its real same-graph core behind the two private resolvers', async entry => {
    const repository = repositoryFixture('S');
    const privateHome = privateHomeFixture();
    const verifiedCommits = installEvidenceVerifier();
    const privateResolutions = installPrivateResolver(privateHome.home);
    installWorkflowContext(repository.sourceCommit);
    vi.stubGlobal('WebSocket', class WebSocket {});
    try {
      await inRepository(repository.repositoryRoot, async () => {
        const module = await loadEntry(entry.path);
        const factory = functionExport(module, entry.factory);
        const run = functionExport(module, entry.run);
        const runtime = await factory({
          operation: entry.operation,
          workflowInputSha: repository.sourceCommit,
        });
        expect(Object.isFrozen(runtime)).toBe(true);
        expect(Reflect.ownKeys(runtime)).toEqual([]);
        expect(JSON.stringify(runtime)).toBe('{}');
        const request = {
          runtime,
          operation: entry.operation,
          workflowInputSha: repository.sourceCommit,
        };
        await expect(run({ ...request, operation: entry.crossedOperation }))
          .rejects.toMatchObject({ code: expect.stringMatching(/WORKFLOW_OPERATION_INVALID$/u) });
        await expect(run({ ...request, workflowInputSha: SWAPPED_SOURCE }))
          .rejects.toMatchObject({ code: expect.stringMatching(/WORKFLOW_SOURCE_INVALID$/u) });
        if ('expected' in entry) {
          await expect(run(request)).resolves.toEqual(entry.expected);
        } else {
          await expect(run(request)).rejects.toMatchObject({ code: entry.expectedFailure });
        }
        await expect(run(request)).rejects.toMatchObject({
          code: expect.stringMatching(/RUNTIME_(?:INVALID|CONSUMED)$/u),
        });
      });
      expect(verifiedCommits).toEqual([
        repository.sourceCommit,
        repository.sourceCommit,
      ]);
      expect(privateResolutions).toHaveLength(1);
    } finally {
      repository.cleanup();
      privateHome.cleanup();
    }
  }, FIXTURE_TIMEOUT);

  it.each(LIVE_ENTRIES.flatMap(entry => ['A', 'V2'].map(mode => ({ ...entry, mode: mode as 'A' | 'V2' }))))(
    '$lane constructs the historical-S bridge from an authenticated $mode parent', async entry => {
    const repository = repositoryFixture(entry.mode);
    const privateHome = privateHomeFixture();
    const verifiedCommits = installEvidenceVerifier();
    const privateResolutions = installPrivateResolver(privateHome.home);
    installWorkflowContext(repository.sourceCommit);
    vi.stubGlobal('WebSocket', class WebSocket {});
    try {
      await inRepository(repository.repositoryRoot, async () => {
        const module = await loadEntry(entry.path);
        const factory = functionExport(module, entry.factory);
        const run = functionExport(module, entry.run);
        const runtime = await factory({
          operation: entry.operation,
          workflowInputSha: repository.sourceCommit,
        });
        expect(Object.isFrozen(runtime)).toBe(true);
        expect(Reflect.ownKeys(runtime)).toEqual([]);
        await expect(run({
          runtime,
          operation: entry.operation,
          workflowInputSha: repository.sourceCommit,
        })).rejects.toMatchObject({ code: 'SEALED_REALMS_DISPATCH_LANE_FAILED' });
      });
      expect(verifiedCommits).toEqual([
        repository.preparationSourceCommit,
        repository.sourceCommit,
        repository.preparationSourceCommit,
        repository.preparationSourceCommit,
        repository.sourceCommit,
      ]);
      expect(privateResolutions).toHaveLength(1);
    } finally {
      repository.cleanup();
      privateHome.cleanup();
    }
  }, FIXTURE_TIMEOUT);

  it.each(ENTRIES)('$lane ignores real Git replacement objects that disguise invalid committed source', async entry => {
    const repository = repositoryFixture('S');
    const privateHome = privateHomeFixture();
    const verifiedCommits = installEvidenceVerifier();
    const privateResolutions = installPrivateResolver(privateHome.home);
    try {
      writeFileSync(join(repository.repositoryRoot, BINDING_PATH), binding(SWAPPED_SOURCE, false));
      git(repository.repositoryRoot, ['add', BINDING_PATH]);
      git(repository.repositoryRoot, ['commit', '--quiet', '-m', 'invalid source must remain invalid']);
      const invalid = git(repository.repositoryRoot, ['rev-parse', 'HEAD']);
      git(repository.repositoryRoot, ['update-ref', 'refs/remotes/origin/main', invalid]);
      git(repository.repositoryRoot, ['replace', invalid, repository.sourceCommit]);
      // Ordinary Git now lies about the binding at the same unchanged HEAD SHA.
      expect(git(repository.repositoryRoot, ['show', `HEAD:${BINDING_PATH}`])).toBe(INERT_BINDING_SOURCE.trim());
      await inRepository(repository.repositoryRoot, async () => {
        const module = await loadEntry(entry.path);
        await expect(functionExport(module, entry.factory)({ operation: entry.operation, workflowInputSha: invalid }))
          .rejects.toMatchObject({ code: 'SEALED_REALMS_SOURCE_AUTHORITY_BINDING_INVALID' });
      });
      expect(verifiedCommits).toEqual([]);
      expect(privateResolutions).toEqual([]);
    } finally { repository.cleanup(); privateHome.cleanup(); }
  }, FIXTURE_TIMEOUT);

  it('refuses activation generation from an empty authenticated record corpus without runtime or output', async () => {
    const repository = repositoryFixture('S');
    const privateHome = privateHomeFixture();
    const verifiedCommits = installEvidenceVerifier();
    const privateResolutions = installPrivateResolver(privateHome.home);
    const github = installWorkflowContext(repository.sourceCommit);
    const runtimeRoot = join(privateHome.home, 'Library', 'Application Support', 'Warpkeep', 'operations', 'runtime');
    const auditRoot = join(privateHome.home, 'Library', 'Application Support', 'Warpkeep', 'operations', 'audit', 'private');
    const cacheRoot = join(privateHome.home, 'Library', 'Application Support', 'Warpkeep', 'operations', 'cache');
    let runtime: unknown;
    try {
      await inRepository(repository.repositoryRoot, async () => {
        const module = await loadEntry('../scripts/sealed-realms-production-activation-workflow-entry.mjs');
        const factory = functionExport(module, 'createSealedRealmsProductionActivationWorkflowRuntime');
        await expect(factory({
          operation: 'activation-evidence-generate', workflowInputSha: repository.sourceCommit,
        }).then((value: unknown) => { runtime = value; })).rejects.toMatchObject({
          code: 'SEALED_REALMS_ACTIVATION_RECORDS_INCOMPLETE',
        });
      });
      expect(runtime).toBeUndefined();
      expect(verifiedCommits).toEqual([repository.sourceCommit]);
      expect(privateResolutions).toHaveLength(1);
      expect(readdirSync(runtimeRoot)).toEqual([]);
      expect(readdirSync(auditRoot)).toEqual([]);
      expect(readdirSync(cacheRoot)).toEqual([]);
      // Only the mocked read-only workflow permit lookups precede refusal.
      expect(github).toHaveBeenCalledTimes(2);
      expect(github.mock.calls.map(([request]) => String(request))).toEqual([
        'https://api.github.com/repos/ael-dev3/Warpkeep/branches/main',
        'https://api.github.com/repos/ael-dev3/Warpkeep/actions/runs/7001',
      ]);
      expect((github.mock.calls as unknown as Array<[unknown, RequestInit]>).map(([, options]) => options.method))
        .toEqual(['GET', 'GET']);
    } finally {
      repository.cleanup();
      privateHome.cleanup();
    }
  }, FIXTURE_TIMEOUT);

  it.each(LIVE_ENTRIES)('$lane rejects an A whose authenticated parent binding is not exact', async entry => {
    const repository = repositoryFixture('A', { invalidParentBinding: true });
    const privateHome = privateHomeFixture();
    installEvidenceVerifier();
    const privateResolutions = installPrivateResolver(privateHome.home);
    try {
      await inRepository(repository.repositoryRoot, async () => {
        const module = await loadEntry(entry.path);
        const factory = functionExport(module, entry.factory);
        await expect(factory({
          operation: entry.operation,
          workflowInputSha: repository.sourceCommit,
        })).rejects.toMatchObject({
          code: 'SEALED_REALMS_SOURCE_AUTHORITY_BINDING_INVALID',
        });
      });
      expect(privateResolutions).toEqual([]);
    } finally {
      repository.cleanup();
      privateHome.cleanup();
    }
  }, FIXTURE_TIMEOUT);

  it.each(LIVE_ENTRIES)('$lane rejects an A with any non-activation path before resolving private state', async entry => {
    const repository = repositoryFixture('A', { extraActivationPath: true });
    const privateHome = privateHomeFixture();
    installEvidenceVerifier();
    const privateResolutions = installPrivateResolver(privateHome.home);
    try {
      await inRepository(repository.repositoryRoot, async () => {
        const module = await loadEntry(entry.path);
        const factory = functionExport(module, entry.factory);
        await expect(factory({
          operation: entry.operation,
          workflowInputSha: repository.sourceCommit,
        })).rejects.toMatchObject({
          code: 'SEALED_REALMS_SOURCE_AUTHORITY_ACTIVATION_DIFF_INVALID',
        });
      });
      expect(privateResolutions).toEqual([]);
    } finally {
      repository.cleanup();
      privateHome.cleanup();
    }
  }, FIXTURE_TIMEOUT);

  it.each(ENTRIES)('$lane entry rejects resolver injection and cross-lane selection', async entry => {
    const module = await loadEntry(entry.path);
    const factory = functionExport(module, entry.factory);
    const run = functionExport(module, entry.run);

    for (const injected of [
      { readGit: () => '' },
      { adapter: Object.freeze({}) },
      { callback: () => {} },
      { constructor: class Forged {} },
      { importPath: '../scripts/sealed-realms-production-dispatch.mjs' },
      { privateState: Object.freeze({}) },
      { privateStateResolver: () => Object.freeze({}) },
      { evidenceVerifier: () => Object.freeze({}) },
    ]) {
      await expect(factory({
        operation: entry.operation,
        workflowInputSha: 'a'.repeat(40),
        ...injected,
      })).rejects.toMatchObject({ code: expect.stringMatching(/WORKFLOW_INPUT_INVALID$/u) });
    }
    const symbolInjected = {
      operation: entry.operation,
      workflowInputSha: 'a'.repeat(40),
      [Symbol('resolver')]: () => Object.freeze({}),
    };
    await expect(factory(symbolInjected)).rejects.toMatchObject({
      code: expect.stringMatching(/WORKFLOW_INPUT_INVALID$/u),
    });
    const hiddenInjected = {
      operation: entry.operation,
      workflowInputSha: 'a'.repeat(40),
    };
    Object.defineProperty(hiddenInjected, 'privateStateResolver', {
      value: () => Object.freeze({}),
    });
    await expect(factory(hiddenInjected)).rejects.toMatchObject({
      code: expect.stringMatching(/WORKFLOW_INPUT_INVALID$/u),
    });
    const accessorInjected = Object.defineProperties({}, {
      operation: { enumerable: true, get: () => entry.operation },
      workflowInputSha: { enumerable: true, get: () => 'a'.repeat(40) },
    });
    await expect(factory(accessorInjected)).rejects.toMatchObject({
      code: expect.stringMatching(/WORKFLOW_INPUT_INVALID$/u),
    });
    await expect(factory({
      operation: entry.crossedOperation,
      workflowInputSha: 'a'.repeat(40),
    })).rejects.toMatchObject({ code: expect.stringMatching(/WORKFLOW_OPERATION_INVALID$/u) });
    await expect(factory({ operation: entry.operation, workflowInputSha: 'not-a-sha' }))
      .rejects.toMatchObject({ code: expect.stringMatching(/WORKFLOW_SOURCE_INVALID$/u) });

    await expect(run({
      runtime: Object.freeze({}),
      operation: entry.operation,
      workflowInputSha: 'a'.repeat(40),
    })).rejects.toMatchObject({ code: expect.stringMatching(/WORKFLOW_RUNTIME_INVALID$/u) });
    await expect(run({
      runtime: Object.freeze({}),
      operation: entry.operation,
      workflowInputSha: 'a'.repeat(40),
      evidenceVerifier: () => Object.freeze({}),
    })).rejects.toMatchObject({ code: expect.stringMatching(/WORKFLOW_INPUT_INVALID$/u) });
  });

  it.each(ENTRIES)('$lane entry rejects transparent and revoked proxy factory/runtime inputs before authority work', async entry => {
    const module = await loadEntry(entry.path);
    const factory = functionExport(module, entry.factory);
    const run = functionExport(module, entry.run);
    const callback = vi.fn();
    const factoryInput = {
      operation: entry.operation,
      workflowInputSha: 'not-a-sha',
    };
    const trappedFactoryInput = new Proxy(factoryInput, {
      ownKeys(target) {
        callback();
        return Reflect.ownKeys(target);
      },
    });

    await expect(factory(new Proxy(factoryInput, {}) as never)).rejects.toMatchObject({
      code: expect.stringMatching(/WORKFLOW_INPUT_INVALID$/u),
    });
    await expect(factory(trappedFactoryInput as never)).rejects.toMatchObject({
      code: expect.stringMatching(/WORKFLOW_INPUT_INVALID$/u),
    });
    await expect(factory(revokedProxy(factoryInput) as never)).rejects.toMatchObject({
      code: expect.stringMatching(/WORKFLOW_INPUT_INVALID$/u),
    });
    expect(callback).not.toHaveBeenCalled();

    const runtimeInput = {
      runtime: Object.freeze({}),
      operation: entry.operation,
      workflowInputSha: 'a'.repeat(40),
    };
    await expect(run(new Proxy(runtimeInput, {}) as never)).rejects.toMatchObject({
      code: expect.stringMatching(/WORKFLOW_INPUT_INVALID$/u),
    });
    await expect(run(revokedProxy(runtimeInput) as never)).rejects.toMatchObject({
      code: expect.stringMatching(/WORKFLOW_INPUT_INVALID$/u),
    });
    await expect(run({
      ...runtimeInput,
      runtime: new Proxy(runtimeInput.runtime, {}),
    } as never)).rejects.toMatchObject({
      code: expect.stringMatching(/WORKFLOW_INPUT_INVALID$/u),
    });
    await expect(run({
      ...runtimeInput,
      runtime: revokedProxy(runtimeInput.runtime),
    } as never)).rejects.toMatchObject({
      code: expect.stringMatching(/WORKFLOW_INPUT_INVALID$/u),
    });
  });

  it.each(ENTRIES)('$lane import is inert with no evidence or private-state resolution', async entry => {
    const privateHome = privateHomeFixture();
    const verifiedCommits = installEvidenceVerifier();
    const privateResolutions = installPrivateResolver(privateHome.home);
    try {
      await loadEntry(entry.path);
      expect(verifiedCommits).toEqual([]);
      expect(privateResolutions).toEqual([]);
    } finally {
      privateHome.cleanup();
    }
  });

  it.each(LIVE_ENTRIES)('$lane missing publisher marker creates no publication state', async entry => {
    const repository = repositoryFixture('S');
    const privateHome = privateHomeFixture();
    installEvidenceVerifier();
    installPrivateResolver(privateHome.home);
    installWorkflowContext(repository.sourceCommit);
    vi.stubGlobal('WebSocket', class WebSocket {});
    try {
      await inRepository(repository.repositoryRoot, async () => {
        const module = await loadEntry(entry.path);
        const factory = functionExport(module, entry.factory);
        const run = functionExport(module, entry.factory.replace('create', 'run').replace('WorkflowRuntime', 'Operation'));
        const operation = `${entry.lane}-publish-inspect`;
        const runtime = await factory({ operation, workflowInputSha: repository.sourceCommit });
        await expect(run({ runtime, operation, workflowInputSha: repository.sourceCommit }))
          .rejects.toMatchObject({ code: 'SEALED_REALMS_DISPATCH_LANE_FAILED' });
      });
      const runtimeRoot = join(
        privateHome.home,
        'Library',
        'Application Support',
        'Warpkeep',
        'operations',
        'runtime',
      );
      expect(readdirSync(runtimeRoot)).toEqual([]);
    } finally {
      repository.cleanup();
      privateHome.cleanup();
    }
  }, FIXTURE_TIMEOUT);
});
