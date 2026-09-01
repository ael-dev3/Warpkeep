// @vitest-environment node

import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { build as esbuild } from 'esbuild';

import {
  createSealedRealmsProductionContinuationStore,
} from '../scripts/sealed-realms-production-continuation.mjs';
import {
  createSealedRealmsProductionDispatcher,
} from '../scripts/sealed-realms-production-dispatch.mjs';
import {
  createSealedRealmsProductionG001Lane,
  createSealedRealmsProductionG001LaunchAuthority,
} from '../scripts/sealed-realms-production-g001-lane-entry.mjs';
import {
  createSealedRealmsProductionPrivateState,
} from '../scripts/sealed-realms-production-private-state.mjs';
import {
  authenticateSealedRealmsProductionSourceAuthority,
} from '../scripts/sealed-realms-production-source-authority.mjs';
import {
  issueSealedRealmsProductionWorkflowPermit,
} from '../scripts/sealed-realms-production-workflow-authority.mjs';

const S = '1'.repeat(40);
const TOKEN = 'github-sealed-realms-owner-token';
const RUN_ID = '9001';

function sourceAuthority(operation = 'preflight') {
  return authenticateSealedRealmsProductionSourceAuthority({
    operation: operation as never,
    workflowInputSha: S,
    readGit: () => `${S}\n`,
    readBinding: () => ({
      schemaVersion: 1,
      profile: 'warpkeep-0.4.0-sealed-launch-v1',
      pagesDeploymentApproved: false,
      preparationSourceCommit: S,
    }),
    verifyEvidence: commit => ({ verifiedSha: commit }),
  });
}

function githubResponse(url: string, body: unknown) {
  const encoded = JSON.stringify(body);
  const response = new Response(encoded, {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(encoded)),
    },
  });
  Object.defineProperty(response, 'url', { value: url });
  return response;
}

function github(sourceCommit: string) {
  return vi.fn(async (request: string | URL | Request) => {
    const url = String(request);
    if (url.endsWith('/branches/main')) {
      return githubResponse(url, {
        name: 'main', protected: true, commit: { sha: sourceCommit },
      });
    }
    return githubResponse(url, {
      id: Number(RUN_ID),
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
}

function privateFixture() {
  const home = mkdtempSync(join(tmpdir(), 'warpkeep-dispatch-task5-'));
  for (const root of [
    join(home, 'Library', 'Application Support', 'Warpkeep', 'operations', 'audit', 'private'),
    join(home, 'Library', 'Application Support', 'Warpkeep', 'operations', 'runtime'),
    join(home, 'Library', 'Application Support', 'Warpkeep', 'operations', 'cache'),
  ]) {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    chmodSync(root, 0o700);
  }
  const privateState = createSealedRealmsProductionPrivateState({
    reportedHome: home,
    testOnlyOwnerUid: statSync(home).uid,
    testOnlyFsync: () => {},
    testOnlyAllowPlatformMode: true,
  });
  return Object.freeze({
    privateState,
    cleanup: () => rmSync(home, { recursive: true, force: true }),
  });
}

const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
  vi.unstubAllGlobals();
});

async function protectedContext() {
  const fixture = privateFixture();
  cleanups.push(fixture.cleanup);
  const source = sourceAuthority();
  const permit = await issueSealedRealmsProductionWorkflowPermit({
    sourceAuthority: source,
    githubToken: TOKEN,
    runId: RUN_ID,
    runAttempt: '1',
    fetchImpl: github(S),
  });
  const continuationStore = createSealedRealmsProductionContinuationStore({
    privateState: fixture.privateState,
  });
  return Object.freeze({ permit, continuationStore, sourceAuthority: source });
}

function dispatcherInput(extra: Readonly<Record<string, unknown>> = {}) {
  return {
    readGit: () => `${S}\n`,
    readBinding: () => ({
      schemaVersion: 1,
      profile: 'warpkeep-0.4.0-sealed-launch-v1',
      pagesDeploymentApproved: false,
      preparationSourceCommit: S,
    }),
    verifyEvidence: (commit: string) => ({ verifiedSha: commit }),
    ...extra,
  };
}

function preflightLane(preflight = vi.fn(async () => undefined)) {
  return Object.freeze({
    lane: createSealedRealmsProductionG001Lane({
      launchAuthority: createSealedRealmsProductionG001LaunchAuthority({
        readRawGit: () => `${S}\n`,
        resolveAdminSecretPath: () => ({ sourceCommit: S, path: '/private/unreachable' }),
        persistPolicyObservation: () => undefined,
      }),
      attestDispatcherNode: () => { throw new Error('unreachable'); },
      runEnvelopeChild: () => { throw new Error('unreachable'); },
      censusAuthority: undefined,
      currentState: {
        runChild: () => { throw new Error('unreachable'); },
        readFixedFile: () => { throw new Error('unreachable'); },
        resolveAccountUid: () => { throw new Error('unreachable'); },
        resolveAccountHome: () => { throw new Error('unreachable'); },
        testOnlyAdapter: undefined,
      },
      currentStateOperator: () => { throw new Error('unreachable'); },
      preflight,
    } as never),
    preflight,
  });
}

describe('sealed-realms production dispatch continuation boundary', () => {
  it('keeps the opaque lane registry graph-local without dispatcher imports of every lane', () => {
    const dispatcher = readFileSync(
      join(process.cwd(), 'scripts/sealed-realms-production-dispatch.mjs'),
      'utf8',
    );
    expect(dispatcher).toContain("from './sealed-realms-production-lane-registry.mjs'");
    expect(dispatcher).not.toMatch(
      /from '.\/sealed-realms-production-(?:g001|g002|ptr|activation)-lane-entry\.mjs'/u,
    );
    for (const lane of ['g001', 'g002', 'ptr', 'activation']) {
      const source = readFileSync(
        join(process.cwd(), `scripts/sealed-realms-production-${lane}-lane-entry.mjs`),
        'utf8',
      );
      expect(source).toContain("from './sealed-realms-production-lane-registry.mjs'");
    }
  });

  it('rejects an authentic lane branded by a different bundled registry graph', async () => {
    const { lane } = preflightLane();
    const registryBuild = await esbuild({
      entryPoints: ['scripts/sealed-realms-production-lane-registry.mjs'],
      absWorkingDir: process.cwd(),
      bundle: true,
      format: 'esm',
      platform: 'node',
      target: 'node22',
      write: false,
    });
    const registry = await import(
      `data:text/javascript;base64,${Buffer.from(registryBuild.outputFiles[0]!.contents).toString('base64')}`
    );
    expect(() => registry.assertSealedRealmsProductionLane(lane, 'g001'))
      .toThrow(expect.objectContaining({
        code: 'SEALED_REALMS_LANE_REGISTRY_CAPABILITY_INVALID',
      }));
  });

  it('requires the internally branded permit/store and fixed run identity at construction', () => {
    const input = dispatcherInput();
    expect(() => createSealedRealmsProductionDispatcher(input as never))
      .toThrow(expect.objectContaining({ code: 'SEALED_REALMS_DISPATCH_INPUT_INVALID' }));
  });

  it('rejects the legacy unbranded test lane bypass even with a real protected context', async () => {
    const context = await protectedContext();
    const effect = vi.fn(async () => Object.freeze({ status: 'preflight-inspected' }));
    expect(() => createSealedRealmsProductionDispatcher(dispatcherInput({
      ...context,
      runId: RUN_ID,
      runAttempt: '1',
      testOnlyLanes: { g001: { execute: effect } },
    }) as never)).toThrow(expect.objectContaining({
      code: 'SEALED_REALMS_DISPATCH_INPUT_INVALID',
    }));
    expect(effect).not.toHaveBeenCalled();
  });

  it('rejects structural, unbranded, and wrong-slot lanes at construction', async () => {
    const context = await protectedContext();
    const execute = vi.fn(async () => Object.freeze({ status: 'preflight-inspected' }));
    const common = {
      ...context,
      runId: RUN_ID,
      runAttempt: '1',
    };

    expect(() => createSealedRealmsProductionDispatcher(dispatcherInput({
      ...common,
      g001Lane: Object.freeze({ execute }),
    }) as never)).toThrow(expect.objectContaining({
      code: 'SEALED_REALMS_DISPATCH_INPUT_INVALID',
    }));

    const { lane } = preflightLane();
    expect(() => createSealedRealmsProductionDispatcher(dispatcherInput({
      ...common,
      g002Lane: lane,
    }) as never)).toThrow(expect.objectContaining({
      code: 'SEALED_REALMS_DISPATCH_INPUT_INVALID',
    }));
    expect(execute).not.toHaveBeenCalled();
  });

  it('accepts no operational confirmation input and emits no confirmation material', async () => {
    const context = await protectedContext();
    const { lane, preflight } = preflightLane();
    const dispatcher = createSealedRealmsProductionDispatcher(dispatcherInput({
      ...context,
      runId: RUN_ID,
      runAttempt: '1',
      g001Lane: lane,
    }) as never);

    await expect(dispatcher.dispatch({
      operation: 'preflight',
      workflowInputSha: S,
      input: { confirmation: {} },
    } as never)).rejects.toMatchObject({ code: 'SEALED_REALMS_DISPATCH_REQUEST_INVALID' });
    expect(preflight).not.toHaveBeenCalled();

    const result = await dispatcher.dispatch({ operation: 'preflight', workflowInputSha: S });
    expect(result).toEqual({ operation: 'preflight', status: 'preflight-inspected' });
    expect(preflight).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toMatch(/confirmation|continuation|digest|path|token/iu);
  });
});
