// @vitest-environment node

import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createSealedRealmsProductionContinuationStore,
} from '../scripts/sealed-realms-production-continuation.mjs';
import {
  createSealedRealmsProductionDispatcher,
} from '../scripts/sealed-realms-production-dispatch.mjs';
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
    testOnlyLanes: {
      g001: { execute: vi.fn(async () => Object.freeze({ status: 'preflight-inspected' })) },
    },
    ...extra,
  };
}

describe('sealed-realms production dispatch continuation boundary', () => {
  it('requires the internally branded permit/store and fixed run identity at construction', () => {
    const input = dispatcherInput();
    delete (input as { testOnlyLanes?: unknown }).testOnlyLanes;
    expect(() => createSealedRealmsProductionDispatcher(input))
      .toThrow(expect.objectContaining({ code: 'SEALED_REALMS_DISPATCH_INPUT_INVALID' }));
  });

  it('accepts no operational confirmation input and emits no confirmation material', async () => {
    const context = await protectedContext();
    const lane = {
      execute: vi.fn(async () => Object.freeze({ status: 'preflight-inspected' })),
    };
    const dispatcher = createSealedRealmsProductionDispatcher(dispatcherInput({
      ...context,
      runId: RUN_ID,
      runAttempt: '1',
      testOnlyLanes: { g001: lane },
    }) as never);

    await expect(dispatcher.dispatch({
      operation: 'preflight',
      workflowInputSha: S,
      input: { confirmation: {} },
    } as never)).rejects.toMatchObject({ code: 'SEALED_REALMS_DISPATCH_REQUEST_INVALID' });
    expect(lane.execute).not.toHaveBeenCalled();

    const result = await dispatcher.dispatch({ operation: 'preflight', workflowInputSha: S });
    expect(result).toEqual({ operation: 'preflight', status: 'preflight-inspected' });
    expect(JSON.stringify(result)).not.toMatch(/confirmation|continuation|digest|path|token/iu);
  });
});
