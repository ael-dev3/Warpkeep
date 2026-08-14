// @vitest-environment node

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import {
  chmodSync,
  linkSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_PROFILE,
  AUTH_BRIDGE_NOTIFICATION_B0_SECRET_BINDING_NAMES,
  attestAuthBridgeNotificationB0Deployment,
  authBridgeNotificationB0VersionContract,
  executeAuthBridgeNotificationB0DeployAdapter,
} from '../scripts/auth-bridge-notification-b0-deploy-adapter.mjs';
import {
  attestAuthBridgeNotificationB0CandidateMultipartMetadata,
  projectAuthBridgeNotificationB0CloudflareVersion,
} from '../scripts/auth-bridge-notification-b0-cloudflare-runtime.mjs';
import {
  AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_STATE_CHILD,
  withAuthBridgeNotificationB0DeployJournal,
} from '../scripts/auth-bridge-notification-b0-deploy-journal.mjs';

const ACCOUNT_ID = 'a'.repeat(32);
const ZONE_ID = 'b'.repeat(32);
const SOURCE_COMMIT = 'c'.repeat(40);
const SOURCE_DIGEST = 'd'.repeat(64);
const PREDECESSOR_DEPLOYMENT_ID =
  '123e4567-e89b-42d3-a456-426614174001';
const PREDECESSOR_VERSION_ID =
  '123e4567-e89b-42d3-a456-426614174002';
const VERSION_ID = '123e4567-e89b-42d3-a456-426614174003';
const NOW = new Date('2026-08-13T12:00:00.000Z');
const temporaryDirectories: string[] = [];
type Phase =
  | 'prepared'
  | 'remote-reconcile-started'
  | 'upload-invoked'
  | 'uploaded'
  | 'release-uncertain'
  | 'release-invoked'
  | 'completed'
  | null;

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function contract() {
  return authBridgeNotificationB0VersionContract({
    accountId: ACCOUNT_ID,
    zoneId: ZONE_ID,
    sourceCommit: SOURCE_COMMIT,
    sourceDigest: SOURCE_DIGEST,
    beforeModes: {
      bridgeSourceCommit: SOURCE_COMMIT,
      publicAuthEnabled: true,
      accessExpectedFidRequired: false,
    },
  }) as Readonly<Record<string, unknown>> & Readonly<{
    durableObjectBindings: readonly Readonly<{
      name: string;
      className: string;
    }>[];
    migrations: readonly Readonly<{
      tag: string;
      newSqliteClasses: readonly string[];
    }>[];
    variables: Readonly<Record<string, string>>;
    versionMessage: string;
    versionTag: string;
  }>;
}

function candidateMetadata(value = contract()) {
  return {
    main_module: 'index.js',
    bindings: [
      ...Object.entries(value.variables).map(([name, text]) => ({
        name,
        type: 'plain_text',
        text,
      })),
      ...value.durableObjectBindings.map(binding => ({
        name: binding.name,
        type: 'durable_object_namespace',
        class_name: binding.className,
      })),
      ...AUTH_BRIDGE_NOTIFICATION_B0_SECRET_BINDING_NAMES.map(name => ({
        name,
        type: 'inherit',
      })),
    ],
    compatibility_date: '2026-07-11',
    compatibility_flags: ['nodejs_compat'],
    annotations: {
      'workers/message': value.versionMessage,
      'workers/tag': value.versionTag,
    },
    migrations: {
      old_tag: 'v4',
      new_tag: 'v5',
      steps: [{ new_sqlite_classes: ['AdmissionNotification'] }],
    },
  };
}

function deployment(versionId = VERSION_ID) {
  return {
    schemaVersion: 1,
    profile: AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_PROFILE,
    accountId: ACCOUNT_ID,
    zoneId: ZONE_ID,
    workerName: 'warpkeep-auth-bridge',
    route: { pattern: 'auth.warpkeep.com', customDomain: true },
    versionId,
    versionTag: `notification-b0-${SOURCE_COMMIT}`,
    sourceCommit: SOURCE_COMMIT,
    trafficPercentage: 100,
    observedAt: '2026-08-13T11:59:00.000Z',
  };
}

function rawCandidateVersion(value = contract()) {
  return {
    id: VERSION_ID,
    metadata: {
      created_on: '2026-08-13T11:58:00.000Z',
      source: 'api',
    },
    annotations: {
      'workers/message': value.versionMessage,
      'workers/tag': value.versionTag,
    },
    resources: {
      bindings: [
        ...Object.entries(value.variables).map(([name, text]) => ({
          name,
          type: 'plain_text',
          text,
        })),
        ...AUTH_BRIDGE_NOTIFICATION_B0_SECRET_BINDING_NAMES.map(name => ({
          name,
          type: 'secret_text',
        })),
        ...value.durableObjectBindings.map(binding => ({
          name: binding.name,
          type: 'durable_object_namespace',
          class_name: binding.className,
        })),
      ],
      script: { etag: SOURCE_DIGEST },
      script_runtime: {
        compatibility_date: '2026-07-11',
        compatibility_flags: ['nodejs_compat'],
        migration_tag: 'v5',
        exports: Object.fromEntries([
          ['default', { type: 'worker' }],
          ...value.durableObjectBindings.map(binding => [
            binding.className,
            { type: 'durable-object', storage: 'sqlite' },
          ]),
        ]),
      },
    },
  };
}

function recoveryHarness({
  uploadLosesResponse = false,
  releaseLosesResponse = false,
  initialPhase = null,
  initialCandidateExists = false,
  initialLiveVersion = PREDECESSOR_VERSION_ID,
}: Readonly<{
  uploadLosesResponse?: boolean;
  releaseLosesResponse?: boolean;
  initialPhase?: Phase;
  initialCandidateExists?: boolean;
  initialLiveVersion?: string;
}> = {}) {
  const value = contract();
  const events: string[] = [];
  let phase: Phase = initialPhase;
  let candidateExists = initialCandidateExists;
  let liveVersion = initialLiveVersion;
  const journal = {
    inspect: vi.fn(() => ({
      phase,
      predecessorDeploymentId: PREDECESSOR_DEPLOYMENT_ID,
      predecessorVersionId: PREDECESSOR_VERSION_ID,
    })),
    prepared: vi.fn(async () => { phase ??= 'prepared'; }),
    remoteReconcileStarted: vi.fn(async () => {
      if (phase === 'prepared') phase = 'remote-reconcile-started';
    }),
    uploadInvoked: vi.fn(async () => { phase = 'upload-invoked'; }),
    uploaded: vi.fn(async () => {
      if (!['release-uncertain', 'release-invoked', 'completed'].includes(
        phase ?? '',
      )) phase = 'uploaded';
    }),
    releaseUncertain: vi.fn(async () => {
      if (!['release-invoked', 'completed'].includes(phase ?? '')) {
        phase = 'release-uncertain';
      }
    }),
    releaseInvoked: vi.fn(async () => { phase = 'release-invoked'; }),
    completed: vi.fn(async () => { phase = 'completed'; }),
  };
  const releaseVersion = vi.fn(async () => {
    events.push('deployments-post');
    liveVersion = VERSION_ID;
    if (releaseLosesResponse) throw new Error('lost deployment response');
  });
  return {
    events,
    releaseVersion,
    options: {
      contract: value,
      prepareUpload: vi.fn(async () => ({
        mode: 'version' as const,
        predecessorDeploymentId: PREDECESSOR_DEPLOYMENT_ID,
        predecessorVersionId: PREDECESSOR_VERSION_ID,
      })),
      reconcileVersion: vi.fn(async () => (
        candidateExists ? [VERSION_ID] : []
      )),
      uploadVersion: vi.fn(async () => {
        events.push('versions-post');
        candidateExists = true;
        if (uploadLosesResponse) throw new Error('lost version response');
        return { versionId: VERSION_ID };
      }),
      inspectVersion: vi.fn(async () => ({
        ...value,
        versionId: VERSION_ID,
        createdAt: '2026-08-13T11:58:00.000Z',
      })),
      inspectDeployment: vi.fn(async () => deployment(liveVersion)),
      assertPredecessorStable: vi.fn(async () => undefined),
      releaseVersion,
      assertCanStartWrite: vi.fn(async () => true as const),
      journal,
      clock: () => new Date(NOW),
    },
  };
}

describe('auth-bridge notification B0 deploy', () => {
  it('binds only the established six inherited secrets and exact v4-to-v5 migration', () => {
    const value = contract();
    expect(value.secretBindingNames).toEqual([
      'ADMIN_TOKEN_SECRET',
      'FARCASTER_RPC_URL',
      'FARCASTER_RPC_URL_SECONDARY',
      'NOTIFICATION_OPERATOR_SECRET',
      'SESSION_COOKIE_KEY',
      'SIGNING_KEY_JWK',
    ]);
    expect(JSON.stringify(value)).not.toContain('PLAYER_CANARY_OWNER_FID');
    expect(attestAuthBridgeNotificationB0CandidateMultipartMetadata({
      metadata: candidateMetadata(value),
      contract: value,
      predecessorVersionId: PREDECESSOR_VERSION_ID,
    })).toBe(true);
    expect(() => attestAuthBridgeNotificationB0CandidateMultipartMetadata({
      metadata: {
        ...candidateMetadata(value),
        bindings: [
          ...candidateMetadata(value).bindings,
          { name: 'PLAYER_CANARY_OWNER_FID', type: 'secret_text', text: '1' },
        ],
      },
      contract: value,
      predecessorVersionId: PREDECESSOR_VERSION_ID,
    })).toThrowError(/(?:MULTIPART_METADATA_MISMATCH|VERSION_BINDING_UNEXPECTED)/u);
    expect(() => attestAuthBridgeNotificationB0CandidateMultipartMetadata({
      metadata: {
        ...candidateMetadata(value),
        bindings: candidateMetadata(value).bindings.map(binding => (
          binding.name === 'ADMIN_TOKEN_SECRET'
            ? { ...binding, version_id: PREDECESSOR_VERSION_ID }
            : binding
        )),
      },
      contract: value,
      predecessorVersionId: PREDECESSOR_VERSION_ID,
    })).toThrowError(/MULTIPART_METADATA_MISMATCH/u);
  });

  it('attests exact uploaded source, v5 runtime, configuration, DO exports, and six secrets', () => {
    const value = contract();
    expect(projectAuthBridgeNotificationB0CloudflareVersion({
      value: rawCandidateVersion(value),
      contract: value,
      sourceDigest: SOURCE_DIGEST,
    })).toMatchObject({
      sourceDigest: SOURCE_DIGEST,
      versionId: VERSION_ID,
      createdAt: '2026-08-13T11:58:00.000Z',
    });
    expect(() => projectAuthBridgeNotificationB0CloudflareVersion({
      value: {
        ...rawCandidateVersion(value),
        resources: {
          ...rawCandidateVersion(value).resources,
          script_runtime: {
            ...rawCandidateVersion(value).resources.script_runtime,
            migration_tag: 'v4',
          },
        },
      },
      contract: value,
      sourceDigest: SOURCE_DIGEST,
    })).toThrowError(/VERSION_MISMATCH/u);
    expect(() => projectAuthBridgeNotificationB0CloudflareVersion({
      value: {
        ...rawCandidateVersion(value),
        resources: {
          ...rawCandidateVersion(value).resources,
          bindings: [
            ...rawCandidateVersion(value).resources.bindings,
            { name: 'PLAYER_CANARY_OWNER_FID', type: 'secret_text' },
          ],
        },
      },
      contract: value,
      sourceDigest: SOURCE_DIGEST,
    })).toThrowError(/VERSION_BINDING_MISMATCH/u);
  });

  it('orders one nondeploying candidate upload before attestation and one deployment POST', async () => {
    const value = contract();
    const events: string[] = [];
    let phase: Phase = null;
    let candidateExists = false;
    let live = PREDECESSOR_VERSION_ID;
    const journal = {
      inspect: vi.fn(() => ({
        phase,
        predecessorDeploymentId: PREDECESSOR_DEPLOYMENT_ID,
        predecessorVersionId: PREDECESSOR_VERSION_ID,
      })),
      prepared: vi.fn(async () => { events.push('prepared'); phase ??= 'prepared'; }),
      remoteReconcileStarted: vi.fn(async () => {
        events.push('remote-reconcile-started');
        phase = 'remote-reconcile-started';
      }),
      uploadInvoked: vi.fn(async () => {
        events.push('upload-invoked');
        phase = 'upload-invoked';
      }),
      uploaded: vi.fn(async () => { events.push('uploaded'); phase = 'uploaded'; }),
      releaseUncertain: vi.fn(async () => {
        events.push('release-uncertain');
        phase = 'release-uncertain';
      }),
      releaseInvoked: vi.fn(async () => {
        events.push('release-invoked');
        phase = 'release-invoked';
      }),
      completed: vi.fn(async () => { events.push('completed'); phase = 'completed'; }),
    };
    await executeAuthBridgeNotificationB0DeployAdapter({
      contract: value,
      prepareUpload: vi.fn(async () => {
        events.push('prepare-upload');
        return {
          mode: 'version' as const,
          predecessorDeploymentId: PREDECESSOR_DEPLOYMENT_ID,
          predecessorVersionId: PREDECESSOR_VERSION_ID,
        };
      }),
      reconcileVersion: vi.fn(async () => {
        events.push('reconcile-version');
        return candidateExists ? [VERSION_ID] : [];
      }),
      uploadVersion: vi.fn(async () => {
        events.push('versions-post');
        candidateExists = true;
        return { versionId: VERSION_ID };
      }),
      inspectVersion: vi.fn(async () => {
        events.push('inspect-version-source-config-migration-bindings');
        return {
          ...value,
          versionId: VERSION_ID,
          createdAt: '2026-08-13T11:58:00.000Z',
        };
      }),
      inspectDeployment: vi.fn(async () => {
        events.push('inspect-deployment');
        return deployment(live);
      }),
      assertPredecessorStable: vi.fn(async () => {
        events.push('assert-predecessor-stable');
      }),
      releaseVersion: vi.fn(async () => {
        events.push('deployments-post');
        live = VERSION_ID;
      }),
      assertCanStartWrite: vi.fn(async write => {
        events.push(`permit-${write}`);
        return true as const;
      }),
      journal,
      clock: () => new Date(NOW),
    });
    expect(events.filter(event => event === 'versions-post')).toHaveLength(1);
    expect(events.filter(event => event === 'deployments-post')).toHaveLength(1);
    expect(events.indexOf('versions-post')).toBeLessThan(
      events.indexOf('inspect-version-source-config-migration-bindings'),
    );
    expect(events.indexOf('assert-predecessor-stable')).toBeLessThan(
      events.indexOf('deployments-post'),
    );
    expect(events.indexOf('release-invoked')).toBeLessThan(
      events.indexOf('deployments-post'),
    );
  });

  it('requires exact fresh postflight identity', () => {
    expect(attestAuthBridgeNotificationB0Deployment({
      value: deployment(),
      contract: contract(),
      versionId: VERSION_ID,
      versionCreatedAt: '2026-08-13T11:58:00.000Z',
      now: NOW,
    }).versionId).toBe(VERSION_ID);
    expect(() => attestAuthBridgeNotificationB0Deployment({
      value: { ...deployment(), trafficPercentage: 99 },
      contract: contract(),
      versionId: VERSION_ID,
      versionCreatedAt: '2026-08-13T11:58:00.000Z',
      now: NOW,
    })).toThrowError(/POSTFLIGHT_MISMATCH/u);
  });

  it('recovers a lost version-upload response from one exact remote candidate', async () => {
    const harness = recoveryHarness({ uploadLosesResponse: true });
    const result = await executeAuthBridgeNotificationB0DeployAdapter(
      harness.options,
    );
    expect(result.outcome).toBe('verified');
    expect(harness.events.filter(event => event === 'versions-post')).toHaveLength(1);
    expect(harness.events.filter(event => event === 'deployments-post')).toHaveLength(1);
  });

  it('accepts a lost deployment response only after exact postflight proof', async () => {
    const harness = recoveryHarness({ releaseLosesResponse: true });
    const result = await executeAuthBridgeNotificationB0DeployAdapter(
      harness.options,
    );
    expect(result.outcome).toBe('verified-after-release-error');
    expect(harness.events.filter(event => event === 'deployments-post')).toHaveLength(1);
  });

  it('never repeats a journaled deployment invocation without remote proof', async () => {
    const harness = recoveryHarness({
      initialPhase: 'release-invoked',
      initialCandidateExists: true,
    });
    await expect(executeAuthBridgeNotificationB0DeployAdapter(
      harness.options,
    )).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_RELEASE_OPERATOR_ADJUDICATION_REQUIRED',
      deploymentMayHaveChanged: true,
    });
    expect(harness.releaseVersion).not.toHaveBeenCalled();
  });

  it('persists a separate no-replace B0 WAL and repairs an exact crash link', async () => {
    const home = mkdtempSync(join(realpathSync(tmpdir()), 'warpkeep-b0-journal-'));
    chmodSync(home, 0o700);
    temporaryDirectories.push(home);
    const options = {
      contract: contract(),
      repositoryRoot: realpathSync(process.cwd()),
      reportedHome: home,
      runId: '1001',
      runAttempt: 1,
      clock: () => new Date(NOW),
      processIdentity: 'test-process-start-identity',
    } as const;
    await withAuthBridgeNotificationB0DeployJournal({
      ...options,
      operation: async journal => {
        await journal.prepared(contract());
        await journal.remoteReconcileStarted({
          predecessorDeploymentId: PREDECESSOR_DEPLOYMENT_ID,
          predecessorVersionId: PREDECESSOR_VERSION_ID,
          sourceCommit: SOURCE_COMMIT,
          sourceDigest: SOURCE_DIGEST,
          versionTag: `notification-b0-${SOURCE_COMMIT}`,
        });
      },
    });
    const stateDirectory = join(
      home,
      '.warpkeep/private/production-admin-v1',
      AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_STATE_CHILD,
    );
    const remoteRecord = readdirSync(stateDirectory).find(name =>
      name.endsWith('-remote-reconcile-started.json'));
    expect(remoteRecord).toBeDefined();
    const recordPath = join(stateDirectory, remoteRecord!);
    const body = readFileSync(recordPath, 'utf8');
    expect(body).toContain(PREDECESSOR_DEPLOYMENT_ID);
    expect(body).toContain(PREDECESSOR_VERSION_ID);
    expect(body).not.toContain('PLAYER_CANARY_OWNER_FID');

    const match = /^auth-bridge-notification-b0-deploy-([a-f0-9]{64})-(02)-(remote-reconcile-started)\.json$/u
      .exec(remoteRecord!);
    expect(match).not.toBeNull();
    const temporary = join(
      stateDirectory,
      `.auth-bridge-notification-b0-deploy-${match![1]}-${match![2]}-${match![3]}-${'a'.repeat(24)}.json.tmp`,
    );
    linkSync(recordPath, temporary);
    await withAuthBridgeNotificationB0DeployJournal({
      ...options,
      runId: '1002',
      runAttempt: 2,
      operation: async journal => {
        expect(journal.inspect().phase).toBe('remote-reconcile-started');
      },
    });
    expect(readdirSync(stateDirectory)).not.toContain(temporary.split('/').at(-1));
  });

  it('retains the kernel lock in Node after the synchronous helper exits', async () => {
    const home = mkdtempSync(join(realpathSync(tmpdir()), 'warpkeep-b0-lock-'));
    chmodSync(home, 0o700);
    temporaryDirectories.push(home);
    const options = {
      contract: contract(),
      repositoryRoot: realpathSync(process.cwd()),
      reportedHome: home,
      runId: '2001',
      runAttempt: 1,
      clock: () => new Date(NOW),
      processIdentity: 'test-process-start-identity',
    } as const;
    await withAuthBridgeNotificationB0DeployJournal({
      ...options,
      operation: async () => {
        await expect(withAuthBridgeNotificationB0DeployJournal({
          ...options,
          runId: '2002',
          runAttempt: 2,
          operation: journal => journal.inspect(),
        })).rejects.toMatchObject({
          code: 'AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_BUSY',
        });
      },
    });
    await expect(withAuthBridgeNotificationB0DeployJournal({
      ...options,
      runId: '2003',
      runAttempt: 3,
      operation: journal => journal.inspect(),
    })).resolves.toMatchObject({ phase: null });
  });

  it('releases only by closing the retained descriptor or actor process death', async () => {
    const home = mkdtempSync(join(realpathSync(tmpdir()), 'warpkeep-b0-death-'));
    chmodSync(home, 0o700);
    temporaryDirectories.push(home);
    const repositoryRoot = realpathSync(process.cwd());
    const moduleUrl = new URL(
      '../scripts/auth-bridge-notification-b0-deploy-journal.mjs',
      import.meta.url,
    ).href;
    const childProgram = `
      import { withAuthBridgeNotificationB0DeployJournal } from ${JSON.stringify(moduleUrl)};
      await withAuthBridgeNotificationB0DeployJournal({
        contract: ${JSON.stringify(contract())},
        repositoryRoot: ${JSON.stringify(repositoryRoot)},
        reportedHome: ${JSON.stringify(home)},
        runId: '3001',
        runAttempt: 1,
        processIdentity: 'child-process-start-identity',
        operation: async () => {
          process.stdout.write('READY\\n');
          await new Promise(() => { setInterval(() => {}, 1_000); });
        },
      });
    `;
    const child = spawn(process.execPath, [
      '--input-type=module', '-e', childProgram,
    ], {
      cwd: repositoryRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => { output += String(chunk); });
    const deadline = Date.now() + 10_000;
    while (!output.includes('READY\n')) {
      if (child.exitCode !== null) {
        throw new Error('B0 lock holder exited before acquiring its lock');
      }
      if (Date.now() >= deadline) throw new Error('B0 lock holder did not start');
      await new Promise(resolvePromise => setTimeout(resolvePromise, 10));
    }
    const contender = {
      contract: contract(),
      repositoryRoot,
      reportedHome: home,
      runId: '3002',
      runAttempt: 2,
      processIdentity: 'parent-process-start-identity',
      operation: (journal: { inspect: () => unknown }) => journal.inspect(),
    } as const;
    await expect(withAuthBridgeNotificationB0DeployJournal(contender))
      .rejects.toMatchObject({
        code: 'AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_BUSY',
      });
    child.kill('SIGKILL');
    await once(child, 'close');
    await expect(withAuthBridgeNotificationB0DeployJournal({
      ...contender,
      runId: '3003',
      runAttempt: 3,
    })).resolves.toMatchObject({ phase: null });
  });
});
