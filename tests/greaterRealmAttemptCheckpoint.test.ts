// @vitest-environment node

import {
  closeSync,
  constants,
  existsSync,
  mkdtempSync,
  openSync,
  readSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  abortGreaterRealmAttemptCheckpoint,
  assertGreaterRealmAttemptSelectionReady,
  clearGreaterRealmAttemptCheckpoint,
  clearGreaterRealmAttemptCheckpointSecret,
  createGreaterRealmAttemptCheckpoint,
  greaterRealmAttemptCheckpointTestSeams,
  readGreaterRealmAttemptCompletionReceipt,
  reconcileGreaterRealmAttemptCompletion,
  recordGreaterRealmAcceptedAttempt,
  recordGreaterRealmRejectedAttempt,
  resumeGreaterRealmAttemptCheckpoint,
  writeGreaterRealmAttemptCompletionReceipt,
  type GreaterRealmAttemptCheckpointBinding,
  type GreaterRealmAttemptCheckpointState,
} from '../scripts/atlas/greater-realm-attempt-checkpoint';
import { openGreaterRealmPrivateWorkspace } from '../scripts/atlas/greater-realm-private-workspace';

const repositoryRoot = resolve(import.meta.dirname, '..');
const temporaryRoots: string[] = [];
const BATCH_HANDLE = 'GR-B-AAAAAAAAAAAAAAAA';
const FIRST_CANDIDATE = 'GR-A-AAAAAAAAAAAAAAAA';
const SECOND_CANDIDATE = 'GR-A-BBBBBBBBBBBBBBBB';
const THIRD_CANDIDATE = 'GR-A-CCCCCCCCCCCCCCCC';
const CANDIDATE_DIGEST = 'c'.repeat(64);

function binding(
  overrides: Partial<GreaterRealmAttemptCheckpointBinding> = {},
): GreaterRealmAttemptCheckpointBinding {
  return Object.freeze({
    generatorVersion: 'greater-realm-v2-natural-continent-pr-a.17',
    sourceCommit: 'a'.repeat(40),
    toolchainReceipt: `sha256:${'b'.repeat(64)}`,
    toolchainProfile: 'darwin-arm64',
    nodeVersion: '22.22.3',
    requestedCount: 1,
    maximumAttempts: 8,
    ...overrides,
  });
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'warpkeep-attempt-checkpoint-'));
  temporaryRoots.push(root);
  const workspace = openGreaterRealmPrivateWorkspace({
    repositoryRoot,
    workspaceRoot: join(root, 'owner-private'),
  });
  return Object.freeze({ root, workspace });
}

function seed(): Buffer {
  return Buffer.from(Array.from({ length: 32 }, (_value, index) => index + 1));
}

function createInitial(
  workspace: ReturnType<typeof openGreaterRealmPrivateWorkspace>,
): GreaterRealmAttemptCheckpointState {
  const rootSeed = seed();
  try {
    return createGreaterRealmAttemptCheckpoint({
      workspace,
      binding: binding(),
      batchHandle: BATCH_HANDLE,
      rootSeed,
      candidateHandle: FIRST_CANDIDATE,
    });
  } finally {
    rootSeed.fill(0);
  }
}

function checkpointFile(
  workspace: ReturnType<typeof openGreaterRealmPrivateWorkspace>,
  sequence: number,
): string {
  return join(
    workspace.root,
    greaterRealmAttemptCheckpointTestSeams.checkpointPath(sequence),
  );
}

function retiredStateDirectory(
  workspace: ReturnType<typeof openGreaterRealmPrivateWorkspace>,
  name: 'single-world-generation' | 'single-world-completion',
): string {
  return join(
    workspace.root,
    'checkpoints',
    `.retired-${name}-00000000-0000-4000-8000-000000000000`,
  );
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

describe('Greater Realm attempt-boundary checkpoint', () => {
  it('encrypts seed material and request metadata in owner-only atomic records', () => {
    const { workspace } = fixture();
    const expectedSeed = seed();
    const state = createInitial(workspace);
    try {
      const checkpoint = readFileSync(checkpointFile(workspace, 0));
      const keyPath = join(
        workspace.root,
        greaterRealmAttemptCheckpointTestSeams.ownerKeyPath,
      );
      expect(checkpoint.indexOf(expectedSeed)).toBe(-1);
      expect(checkpoint.toString('utf8')).not.toContain(expectedSeed.toString('base64'));
      expect(checkpoint.toString('utf8')).not.toContain(BATCH_HANDLE);
      expect(checkpoint.toString('utf8')).not.toContain(FIRST_CANDIDATE);
      expect(statSync(checkpointFile(workspace, 0)).mode & 0o777).toBe(0o600);
      expect(statSync(keyPath).mode & 0o777).toBe(0o600);
      expect(statSync(workspace.root).mode & 0o777).toBe(0o700);

      const resumed = resumeGreaterRealmAttemptCheckpoint({
        workspace,
        binding: binding(),
      });
      try {
        expect(resumed).toMatchObject({
          phase: 'searching',
          sequence: 0,
          nextOrdinal: 0,
          batchHandle: BATCH_HANDLE,
          candidateHandle: FIRST_CANDIDATE,
          rejectedAttempts: [],
          acceptedPerformance: null,
        });
        expect(resumed.rootSeed).toEqual(expectedSeed);
      } finally {
        clearGreaterRealmAttemptCheckpointSecret(resumed);
      }
    } finally {
      expectedSeed.fill(0);
      clearGreaterRealmAttemptCheckpointSecret(state);
    }
  });

  it('resumes at the exact next ordinal with a chained rejection ledger and stable handle', () => {
    const { workspace } = fixture();
    const initial = createInitial(workspace);
    let afterProof: GreaterRealmAttemptCheckpointState | undefined;
    let afterGeography: GreaterRealmAttemptCheckpointState | undefined;
    let accepted: GreaterRealmAttemptCheckpointState | undefined;
    try {
      afterProof = recordGreaterRealmRejectedAttempt({
        workspace,
        state: initial,
        rejectedAttempt: Object.freeze({
          kind: 'proof-rejection',
          candidateOrdinal: 0,
          activeCellCount: 123_456,
          failedProofs: Object.freeze(['NATURAL_OUTER_BOUNDARY']),
        }),
        nextCandidateHandle: SECOND_CANDIDATE,
      });
      afterGeography = recordGreaterRealmRejectedAttempt({
        workspace,
        state: afterProof,
        rejectedAttempt: Object.freeze({
          kind: 'geography-exhaustion',
          candidateOrdinal: 1,
          rejectionCode: 'GREATER_REALM_ACTIVE_GRID_CELL_COUNT_OUT_OF_RANGE',
        }),
        nextCandidateHandle: THIRD_CANDIDATE,
      });
      accepted = recordGreaterRealmAcceptedAttempt({
        workspace,
        state: afterGeography,
        candidateDigest: CANDIDATE_DIGEST,
        performance: Object.freeze({
          generationMilliseconds: 2_400,
          processPeakMemoryMiB: 512,
        }),
      });
      const resumed = resumeGreaterRealmAttemptCheckpoint({
        workspace,
        binding: binding(),
      });
      try {
        expect(resumed.phase).toBe('accepted');
        expect(resumed.sequence).toBe(3);
        expect(resumed.nextOrdinal).toBe(2);
        expect(resumed.candidateHandle).toBe(THIRD_CANDIDATE);
        expect(resumed.rejectedAttempts).toEqual([
          {
            kind: 'proof-rejection',
            candidateOrdinal: 0,
            activeCellCount: 123_456,
            failedProofs: ['NATURAL_OUTER_BOUNDARY'],
          },
          {
            kind: 'geography-exhaustion',
            candidateOrdinal: 1,
            rejectionCode: 'GREATER_REALM_ACTIVE_GRID_CELL_COUNT_OUT_OF_RANGE',
          },
        ]);
        expect(resumed.acceptedPerformance).toEqual({
          generationMilliseconds: 2_400,
          processPeakMemoryMiB: 512,
        });
        expect(resumed.acceptedCandidateDigest).toBe(CANDIDATE_DIGEST);
        expect(resumed.previousRecordDigest).toBe(afterGeography.recordDigest);
      } finally {
        clearGreaterRealmAttemptCheckpointSecret(resumed);
      }
      for (let sequence = 0; sequence <= 3; sequence += 1) {
        expect(existsSync(checkpointFile(workspace, sequence))).toBe(true);
      }
    } finally {
      clearGreaterRealmAttemptCheckpointSecret(accepted);
      clearGreaterRealmAttemptCheckpointSecret(afterGeography);
      clearGreaterRealmAttemptCheckpointSecret(afterProof);
      clearGreaterRealmAttemptCheckpointSecret(initial);
    }
  });

  it('fails closed on ciphertext tamper, truncation, chain gaps, and stale bindings', () => {
    for (const mutation of ['tamper', 'truncate', 'gap'] as const) {
      const { workspace } = fixture();
      const initial = createInitial(workspace);
      const next = recordGreaterRealmRejectedAttempt({
        workspace,
        state: initial,
        rejectedAttempt: Object.freeze({
          kind: 'geography-exhaustion',
          candidateOrdinal: 0,
          rejectionCode: 'GREATER_REALM_ACTIVE_MASK_EMPTY',
        }),
        nextCandidateHandle: SECOND_CANDIDATE,
      });
      try {
        if (mutation === 'gap') {
          rmSync(checkpointFile(workspace, 0));
        } else {
          const path = checkpointFile(workspace, 1);
          const bytes = readFileSync(path);
          if (mutation === 'tamper') bytes[bytes.length - 1] ^= 0x80;
          writeFileSync(path, mutation === 'truncate' ? bytes.subarray(0, 31) : bytes);
          bytes.fill(0);
        }
        expect(() => resumeGreaterRealmAttemptCheckpoint({
          workspace,
          binding: binding(),
        })).toThrow('GREATER_REALM_ATTEMPT_CHECKPOINT_');
      } finally {
        clearGreaterRealmAttemptCheckpointSecret(next);
        clearGreaterRealmAttemptCheckpointSecret(initial);
      }
    }

    const { workspace } = fixture();
    const state = createInitial(workspace);
    try {
      for (const stale of [
        binding({ generatorVersion: 'greater-realm-v2-natural-continent-pr-a.18' }),
        binding({ sourceCommit: 'c'.repeat(40) }),
        binding({ toolchainReceipt: `sha256:${'d'.repeat(64)}` }),
        binding({ toolchainProfile: 'linux-x64' }),
        binding({ nodeVersion: '22.23.0' }),
        binding({ maximumAttempts: 9 }),
      ]) {
        expect(() => resumeGreaterRealmAttemptCheckpoint({
          workspace,
          binding: stale,
        })).toThrow('GREATER_REALM_ATTEMPT_CHECKPOINT_REQUEST_MISMATCH');
      }
    } finally {
      clearGreaterRealmAttemptCheckpointSecret(state);
    }
  });

  it('rejects invalid transitions and stale concurrent appends without replacing records', () => {
    const { workspace } = fixture();
    const initial = createInitial(workspace);
    let next: GreaterRealmAttemptCheckpointState | undefined;
    try {
      expect(() => recordGreaterRealmRejectedAttempt({
        workspace,
        state: initial,
        rejectedAttempt: Object.freeze({
          kind: 'geography-exhaustion',
          candidateOrdinal: 0,
          rejectionCode: 'GREATER_REALM_AUDIT_GRID_SIZE_INVALID' as never,
        }),
        nextCandidateHandle: SECOND_CANDIDATE,
      })).toThrow('GREATER_REALM_ATTEMPT_CHECKPOINT_INVALID');

      expect(() => recordGreaterRealmRejectedAttempt({
        workspace,
        state: initial,
        rejectedAttempt: Object.freeze({
          kind: 'geography-exhaustion',
          candidateOrdinal: 1,
          rejectionCode: 'GREATER_REALM_ACTIVE_MASK_EMPTY',
        }),
        nextCandidateHandle: SECOND_CANDIDATE,
      })).toThrow('GREATER_REALM_ATTEMPT_CHECKPOINT_INVALID');

      next = recordGreaterRealmRejectedAttempt({
        workspace,
        state: initial,
        rejectedAttempt: Object.freeze({
          kind: 'geography-exhaustion',
          candidateOrdinal: 0,
          rejectionCode: 'GREATER_REALM_ACTIVE_MASK_EMPTY',
        }),
        nextCandidateHandle: SECOND_CANDIDATE,
      });
      const installed = readFileSync(checkpointFile(workspace, 1));
      expect(() => recordGreaterRealmRejectedAttempt({
        workspace,
        state: initial,
        rejectedAttempt: Object.freeze({
          kind: 'geography-exhaustion',
          candidateOrdinal: 0,
          rejectionCode: 'GREATER_REALM_ACTIVE_MASK_EMPTY',
        }),
        nextCandidateHandle: THIRD_CANDIDATE,
      })).toThrow('GREATER_REALM_ATTEMPT_CHECKPOINT_CONFLICT');
      expect(readFileSync(checkpointFile(workspace, 1))).toEqual(installed);
      installed.fill(0);
    } finally {
      clearGreaterRealmAttemptCheckpointSecret(next);
      clearGreaterRealmAttemptCheckpointSecret(initial);
    }
  });

  it('atomically retires authenticated checkpoint records only after acceptance', () => {
    const { workspace } = fixture();
    const initial = createInitial(workspace);
    let accepted: GreaterRealmAttemptCheckpointState | undefined;
    try {
      expect(() => clearGreaterRealmAttemptCheckpoint({
        workspace,
        state: initial,
      })).toThrow('GREATER_REALM_ATTEMPT_CHECKPOINT_INVALID');
      accepted = recordGreaterRealmAcceptedAttempt({
        workspace,
        state: initial,
        candidateDigest: CANDIDATE_DIGEST,
        performance: Object.freeze({
          generationMilliseconds: 100,
          processPeakMemoryMiB: 8,
        }),
      });
      expect(() => abortGreaterRealmAttemptCheckpoint({ workspace }))
        .toThrow('GREATER_REALM_ATTEMPT_CHECKPOINT_FINALIZATION_REQUIRED');
      expect(() => assertGreaterRealmAttemptSelectionReady({ workspace }))
        .toThrow('GREATER_REALM_ATTEMPT_CHECKPOINT_FINALIZATION_REQUIRED');
      const retiredPath = checkpointFile(workspace, 0);
      const retiredBytes = readFileSync(retiredPath);
      const retiredDescriptor = openSync(retiredPath, constants.O_RDONLY);
      try {
        clearGreaterRealmAttemptCheckpoint({ workspace, state: accepted });
        const observed = Buffer.alloc(retiredBytes.byteLength, 0xff);
        try {
          expect(readSync(
            retiredDescriptor,
            observed,
            0,
            observed.byteLength,
            0,
          )).toBe(observed.byteLength);
          expect(observed.every(byte => byte === 0)).toBe(true);
        } finally {
          observed.fill(0);
        }
      } finally {
        closeSync(retiredDescriptor);
        retiredBytes.fill(0);
      }
      expect(() => assertGreaterRealmAttemptSelectionReady({ workspace })).not.toThrow();
      expect(existsSync(join(
        workspace.root,
        greaterRealmAttemptCheckpointTestSeams.checkpointDirectory,
      ))).toBe(false);
      expect(existsSync(join(
        workspace.root,
        greaterRealmAttemptCheckpointTestSeams.ownerKeyPath,
      ))).toBe(true);
      expect(() => resumeGreaterRealmAttemptCheckpoint({
        workspace,
        binding: binding(),
      })).toThrow('GREATER_REALM_ATTEMPT_CHECKPOINT_MISSING');
    } finally {
      clearGreaterRealmAttemptCheckpointSecret(accepted);
      clearGreaterRealmAttemptCheckpointSecret(initial);
    }
  });

  it('finishes secure checkpoint retirement after a hard crash following the durable rename', () => {
    const { workspace } = fixture();
    const initial = createInitial(workspace);
    let accepted: GreaterRealmAttemptCheckpointState | undefined;
    let retiredDescriptor: number | undefined;
    try {
      accepted = recordGreaterRealmAcceptedAttempt({
        workspace,
        state: initial,
        candidateDigest: CANDIDATE_DIGEST,
        performance: Object.freeze({
          generationMilliseconds: 100,
          processPeakMemoryMiB: 8,
        }),
      });
      const receipt = writeGreaterRealmAttemptCompletionReceipt({ workspace, state: accepted });
      const checkpointPath = checkpointFile(workspace, 0);
      const checkpointBytes = statSync(checkpointPath).size;
      retiredDescriptor = openSync(checkpointPath, constants.O_RDONLY);
      renameSync(
        join(workspace.root, greaterRealmAttemptCheckpointTestSeams.checkpointDirectory),
        retiredStateDirectory(workspace, 'single-world-generation'),
      );

      reconcileGreaterRealmAttemptCompletion({ workspace, receipt });

      const observed = Buffer.alloc(checkpointBytes, 0xff);
      try {
        expect(readSync(retiredDescriptor, observed, 0, observed.length, 0))
          .toBe(observed.length);
        expect(observed.every(byte => byte === 0)).toBe(true);
      } finally {
        observed.fill(0);
      }
      expect(existsSync(retiredStateDirectory(workspace, 'single-world-generation')))
        .toBe(false);
      expect(readdirSync(join(workspace.root, 'checkpoints'))
        .some(name => name.startsWith('.retired-'))).toBe(false);
      expect(readGreaterRealmAttemptCompletionReceipt({ workspace }))
        .toEqual(receipt);
    } finally {
      if (retiredDescriptor !== undefined) closeSync(retiredDescriptor);
      clearGreaterRealmAttemptCheckpointSecret(accepted);
      clearGreaterRealmAttemptCheckpointSecret(initial);
    }
  });

  it('finishes an interrupted abort once and removes the old seed before rotating', () => {
    const { workspace } = fixture();
    const initial = createInitial(workspace);
    const checkpointPath = checkpointFile(workspace, 0);
    const checkpointBytes = statSync(checkpointPath).size;
    const retiredDescriptor = openSync(checkpointPath, constants.O_RDONLY);
    try {
      renameSync(
        join(workspace.root, greaterRealmAttemptCheckpointTestSeams.checkpointDirectory),
        retiredStateDirectory(workspace, 'single-world-generation'),
      );

      expect(() => abortGreaterRealmAttemptCheckpoint({ workspace })).not.toThrow();

      const observed = Buffer.alloc(checkpointBytes, 0xff);
      try {
        expect(readSync(retiredDescriptor, observed, 0, observed.length, 0))
          .toBe(observed.length);
        expect(observed.every(byte => byte === 0)).toBe(true);
      } finally {
        observed.fill(0);
      }
      expect(existsSync(retiredStateDirectory(workspace, 'single-world-generation')))
        .toBe(false);
      expect(() => abortGreaterRealmAttemptCheckpoint({ workspace }))
        .toThrow('GREATER_REALM_ATTEMPT_CHECKPOINT_MISSING');
      const rotated = createInitial(workspace);
      clearGreaterRealmAttemptCheckpointSecret(rotated);
    } finally {
      closeSync(retiredDescriptor);
      clearGreaterRealmAttemptCheckpointSecret(initial);
    }
  });

  it('fails closed on malformed and non-directory retired checkpoint entries', () => {
    const malformed = fixture().workspace;
    malformed.ensureDirectory(
      'checkpoints/.retired-single-world-generation-not-a-uuid',
    );
    expect(() => assertGreaterRealmAttemptSelectionReady({ workspace: malformed }))
      .toThrow('GREATER_REALM_ATTEMPT_CHECKPOINT_CLEANUP_FAILED');

    const special = fixture().workspace;
    special.ensureDirectory('checkpoints');
    writeFileSync(
      retiredStateDirectory(special, 'single-world-completion'),
      'not a retired directory',
      { mode: 0o600 },
    );
    expect(() => readGreaterRealmAttemptCompletionReceipt({ workspace: special }))
      .toThrow('GREATER_REALM_ATTEMPT_CHECKPOINT_CLEANUP_FAILED');
  });

  it('keeps an authenticated seed-free completion receipt for idempotent resume', async () => {
    const { workspace } = fixture();
    const privateSeed = seed();
    const privateSeedHex = privateSeed.toString('hex');
    const initial = createInitial(workspace);
    let accepted: GreaterRealmAttemptCheckpointState | undefined;
    try {
      accepted = recordGreaterRealmAcceptedAttempt({
        workspace,
        state: initial,
        candidateDigest: CANDIDATE_DIGEST,
        performance: Object.freeze({
          generationMilliseconds: 400,
          processPeakMemoryMiB: 16,
        }),
      });
      await workspace.withAtomicDirectoryPublish(
        `batches/${BATCH_HANDLE}`,
        async staged => {
          staged.writeFileAtomic(
            `batches/${BATCH_HANDLE}/candidate.bin`,
            Uint8Array.of(1),
          );
        },
      );
      const receipt = writeGreaterRealmAttemptCompletionReceipt({ workspace, state: accepted });
      const receiptPath = join(
        workspace.root,
        greaterRealmAttemptCheckpointTestSeams.completionPath,
      );
      const receiptBytes = readFileSync(receiptPath);
      expect(receiptBytes.toString('utf8')).not.toContain(privateSeedHex);
      expect(statSync(receiptPath).mode & 0o777).toBe(0o600);
      expect(readGreaterRealmAttemptCompletionReceipt({
        workspace,
        binding: binding(),
      })).toEqual(receipt);

      reconcileGreaterRealmAttemptCompletion({ workspace, receipt });
      expect(existsSync(join(
        workspace.root,
        greaterRealmAttemptCheckpointTestSeams.checkpointDirectory,
      ))).toBe(false);
      expect(existsSync(join(
        workspace.root,
        greaterRealmAttemptCheckpointTestSeams.completionDirectory,
      ))).toBe(true);
      expect(readGreaterRealmAttemptCompletionReceipt({
        workspace,
        binding: binding(),
      })?.receiptDigest).toBe(receipt.receiptDigest);
      expect(() => createInitial(workspace))
        .toThrow('GREATER_REALM_ATTEMPT_COMPLETION_EXISTS');

      expect(() => abortGreaterRealmAttemptCheckpoint({ workspace }))
        .toThrow('GREATER_REALM_ATTEMPT_CHECKPOINT_FINALIZATION_REQUIRED');
      expect(existsSync(join(
        workspace.root,
        greaterRealmAttemptCheckpointTestSeams.completionDirectory,
      ))).toBe(true);
      expect(() => createInitial(workspace))
        .toThrow('GREATER_REALM_ATTEMPT_COMPLETION_EXISTS');
    } finally {
      privateSeed.fill(0);
      clearGreaterRealmAttemptCheckpointSecret(accepted);
      clearGreaterRealmAttemptCheckpointSecret(initial);
    }
  });

  it('fails closed on completion tamper and aborts a stale valid request without rebinding', () => {
    const { workspace } = fixture();
    const initial = createInitial(workspace);
    let accepted: GreaterRealmAttemptCheckpointState | undefined;
    try {
      accepted = recordGreaterRealmAcceptedAttempt({
        workspace,
        state: initial,
        candidateDigest: CANDIDATE_DIGEST,
        performance: Object.freeze({
          generationMilliseconds: 100,
          processPeakMemoryMiB: 8,
        }),
      });
      writeGreaterRealmAttemptCompletionReceipt({ workspace, state: accepted });
      const receiptPath = join(
        workspace.root,
        greaterRealmAttemptCheckpointTestSeams.completionPath,
      );
      const bytes = readFileSync(receiptPath);
      bytes[bytes.length - 1] ^= 0x40;
      writeFileSync(receiptPath, bytes);
      bytes.fill(0);
      expect(() => readGreaterRealmAttemptCompletionReceipt({
        workspace,
        binding: binding(),
      })).toThrow('GREATER_REALM_ATTEMPT_COMPLETION_INVALID');
      expect(() => abortGreaterRealmAttemptCheckpoint({ workspace }))
        .toThrow('GREATER_REALM_ATTEMPT_COMPLETION_INVALID');
    } finally {
      clearGreaterRealmAttemptCheckpointSecret(accepted);
      clearGreaterRealmAttemptCheckpointSecret(initial);
    }

    const second = fixture().workspace;
    const stale = createInitial(second);
    try {
      expect(() => resumeGreaterRealmAttemptCheckpoint({
        workspace: second,
        binding: binding({ sourceCommit: 'f'.repeat(40) }),
      })).toThrow('GREATER_REALM_ATTEMPT_CHECKPOINT_REQUEST_MISMATCH');
      abortGreaterRealmAttemptCheckpoint({ workspace: second });
      expect(() => resumeGreaterRealmAttemptCheckpoint({
        workspace: second,
        binding: binding(),
      })).toThrow('GREATER_REALM_ATTEMPT_CHECKPOINT_MISSING');
    } finally {
      clearGreaterRealmAttemptCheckpointSecret(stale);
    }
  });

  it('never rotates a completion receipt even when its bound batch is absent', () => {
    const { workspace } = fixture();
    const initial = createInitial(workspace);
    let accepted: GreaterRealmAttemptCheckpointState | undefined;
    try {
      accepted = recordGreaterRealmAcceptedAttempt({
        workspace,
        state: initial,
        candidateDigest: CANDIDATE_DIGEST,
        performance: Object.freeze({
          generationMilliseconds: 100,
          processPeakMemoryMiB: 8,
        }),
      });
      const receipt = writeGreaterRealmAttemptCompletionReceipt({ workspace, state: accepted });
      reconcileGreaterRealmAttemptCompletion({ workspace, receipt });
      expect(() => abortGreaterRealmAttemptCheckpoint({ workspace }))
        .toThrow('GREATER_REALM_ATTEMPT_CHECKPOINT_FINALIZATION_REQUIRED');
      expect(readGreaterRealmAttemptCompletionReceipt({ workspace }))
        .toEqual(receipt);
    } finally {
      clearGreaterRealmAttemptCheckpointSecret(accepted);
      clearGreaterRealmAttemptCheckpointSecret(initial);
    }
  });

  it('rotates an authenticated exhausted attempt ledger so a new request can start', () => {
    const { workspace } = fixture();
    let state = createInitial(workspace);
    try {
      for (let ordinal = 0; ordinal < 8; ordinal += 1) {
        state = recordGreaterRealmRejectedAttempt({
          workspace,
          state,
          rejectedAttempt: Object.freeze({
            kind: 'geography-exhaustion',
            candidateOrdinal: ordinal,
            rejectionCode: 'GREATER_REALM_ACTIVE_MASK_EMPTY',
          }),
          nextCandidateHandle: SECOND_CANDIDATE,
        });
      }
      const exhausted = resumeGreaterRealmAttemptCheckpoint({
        workspace,
        binding: binding(),
      });
      try {
        expect(exhausted.phase).toBe('searching');
        expect(exhausted.nextOrdinal).toBe(8);
        expect(exhausted.rejectedAttempts).toHaveLength(8);
      } finally {
        clearGreaterRealmAttemptCheckpointSecret(exhausted);
      }
      abortGreaterRealmAttemptCheckpoint({ workspace });
      const rotated = createInitial(workspace);
      clearGreaterRealmAttemptCheckpointSecret(rotated);
    } finally {
      clearGreaterRealmAttemptCheckpointSecret(state);
    }
  });

  it('accepts only a single-world request and never reflects private bytes in diagnostics', () => {
    const { workspace } = fixture();
    const privateSeed = seed();
    const privateText = privateSeed.toString('hex');
    try {
      let thrown: unknown;
      try {
        createGreaterRealmAttemptCheckpoint({
          workspace,
          binding: binding({ requestedCount: 2 as 1 }),
          batchHandle: BATCH_HANDLE,
          rootSeed: privateSeed,
          candidateHandle: FIRST_CANDIDATE,
        });
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(Error);
      expect((thrown as Error).message)
        .toBe('GREATER_REALM_ATTEMPT_CHECKPOINT_REQUEST_INVALID');
      expect((thrown as Error).message).not.toContain(privateText);
    } finally {
      privateSeed.fill(0);
    }
  });
});
