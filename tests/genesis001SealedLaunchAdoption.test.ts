// @vitest-environment node

import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  deriveGenesis001SealedLaunchEvidence,
  deriveGenesis001SealedLaunchEvidenceForTesting,
  genesis001AdmissionMonitorCurrentStateReceiptDigest,
  genesis001CensusOpaqueProofDigest,
  genesis001FreezePublishReceiptDigest,
  genesis001MonitorSuspensionReceiptDigest,
  genesis001PolicyObservationBootstrapReceiptDigest,
  genesis001PolicyReceiptDigest,
} from '../scripts/genesis001-sealed-launch-adoption.mjs';

const FREEZE_SOURCE_COMMIT = 'd945256b217fa13ade944b9ed9880e8463b46123';
const PREPARATION_SOURCE_COMMIT = 'a'.repeat(40);
const G001_DATABASE_IDENTITY =
  'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e';
const BASELINE_COMMIT = '2ae51984e1fa6ce5b0028c1a250359fed79d819b';
const BASELINE_ABI =
  'cb7d69d2bed316702ffa1aa8696a4e1ca1934a775b8312129b305a9c33eb0e03';
const FREEZE_NONCE =
  '3f158f17acd5e1e63c74befef7cb3ccab7cb07feaaed432e7483467e1c856f00';

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}

function descriptorDigest(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}

function policy() {
  return {
    realmId: 'GENESIS_001',
    releaseVersion: '0.3.43',
    playerAccessEnabled: true,
    admissionStateMutationsEnabled: false,
    accessRequestSubmissionsEnabled: false,
    sourceBaselineCommit: BASELINE_COMMIT,
    freezeReleaseNonce: FREEZE_NONCE,
  } as const;
}

function buildProvenance() {
  return {
    schemaVersion: 2,
    profile: 'warpkeep-genesis-001-frozen-build-provenance-v2',
    platform: 'darwin',
    architecture: 'arm64',
    nodeVersion: 'v24.19.0',
    nodeExecutableSha256:
      '27db838bb204ef7c21df2931f5656e4c8fb32e6e947f363a402b49714d32b5b1',
    spacetimeCliVersion: '2.6.1',
    spacetimeCliCommit: '052c83fe984a4c4eb7bb4f9afa5c6b1903891d87',
    spacetimeCliExecutableSha256:
      '2e737ddbbd7d337bb19c8fc22da9de44be4b7b2062146e7f65aa3f298d7994d6',
    spacetimeStandaloneExecutableSha256:
      '15a0965f1deec6b79f67fc04b616fd1a6b8f633301b0cfd2ebb7f961b919a8fa',
    dependencyInstallerProfile:
      'warpkeep-genesis-001-historical-root-dependency-closure-v1',
    dependencyLockfileSha256:
      '7bbf5d888143d6342219dbba9f501d15bcc9627a7bb6f2be07ea197760d4e234',
    lockedPackageCount: 16,
    dependencyArchiveClosureSha256: '1'.repeat(64),
    dependencyClosureSha256: '2'.repeat(64),
    dependencyTreeEntryCount: 128,
  };
}

function freezeReceipt() {
  const livePolicyReceipt = policy();
  const provenance = buildProvenance();
  return {
    schemaVersion: 2,
    profile: 'warpkeep-genesis-001-freeze-publish-final-receipt-v2',
    outcome: 'published',
    target: {
      uri: 'https://maincloud.spacetimedb.com',
      database: G001_DATABASE_IDENTITY,
    },
    protectedMainCommit: FREEZE_SOURCE_COMMIT,
    sourceBaselineCommit: BASELINE_COMMIT,
    baselineAbiSha256: BASELINE_ABI,
    freezeReleaseNonce: FREEZE_NONCE,
    artifactSha256: '3'.repeat(64),
    candidateDescriptorSha256: '4'.repeat(64),
    postflightDescriptorSha256: '4'.repeat(64),
    buildProvenance: provenance,
    buildProvenanceSha256: descriptorDigest(provenance),
    livePolicyReceipt,
    livePolicyReceiptSha256: genesis001PolicyReceiptDigest(livePolicyReceipt),
  };
}

function policyObservation() {
  const observedPolicy = policy();
  return {
    schemaVersion: 1,
    profile: 'warpkeep-genesis-001-live-policy-observation-v1',
    sourceCommit: PREPARATION_SOURCE_COMMIT,
    observedAt: '2026-08-28T12:00:00.000Z',
    databaseIdentity: G001_DATABASE_IDENTITY,
    procedure: 'genesis_001_access_policy_v1',
    mutationSubmitted: false,
    policy: observedPolicy,
    policyReceiptDigest: genesis001PolicyReceiptDigest(observedPolicy),
  };
}

function updateLengthFramed(
  hash: ReturnType<typeof createHash>,
  label: string,
  value: string,
) {
  const labelBytes = Buffer.from(label, 'utf8');
  const valueBytes = Buffer.from(value, 'utf8');
  const length = Buffer.alloc(8);
  length.writeBigUInt64BE(BigInt(labelBytes.length));
  hash.update(length).update(labelBytes);
  length.writeBigUInt64BE(BigInt(valueBytes.length));
  hash.update(length).update(valueBytes);
}

function relinkPolicyObservationBootstrapReceipt<T extends {
  protectedCommit: string;
  moduleTreeId: string;
  bootstrapBlob: string;
  bootstrapSha256: string;
  launchCleanup: Record<string, unknown>;
  policyObservationReceipt: ReturnType<typeof policyObservation>;
  policyObservationReceiptLinkSha256: string;
}>(receipt: T): T {
  const hash = createHash('sha256');
  updateLengthFramed(
    hash,
    'domain',
    'warpkeep-production-g001-policy-observation-bootstrap-link-v1',
  );
  updateLengthFramed(hash, 'protectedCommit', receipt.protectedCommit);
  updateLengthFramed(hash, 'moduleTreeId', receipt.moduleTreeId);
  updateLengthFramed(hash, 'bootstrapBlob', receipt.bootstrapBlob);
  updateLengthFramed(hash, 'bootstrapSha256', receipt.bootstrapSha256);
  updateLengthFramed(hash, 'command', 'g001-policy-observe');
  updateLengthFramed(
    hash,
    'launchCleanup',
    `${JSON.stringify(canonical(receipt.launchCleanup))}\n`,
  );
  updateLengthFramed(
    hash,
    'policyObservationReceipt',
    `${JSON.stringify(receipt.policyObservationReceipt)}\n`,
  );
  receipt.policyObservationReceiptLinkSha256 = hash.digest('hex');
  return receipt;
}

function policyObservationBootstrapReceipt() {
  const receipt = {
    profile: 'warpkeep-greater-realm-production-bootstrap-v1',
    protectedCommit: PREPARATION_SOURCE_COMMIT,
    moduleTreeId: '1'.repeat(40),
    bootstrapBlob: '2'.repeat(40),
    bootstrapSha256: '3'.repeat(64),
    moduleArchiveCount: 16,
    command: 'g001-policy-observe',
    launchCleanup: {
      outcome: 'cleaned',
      runId: `run-${'4'.repeat(32)}`,
      cleanupConfirmationSha256: '5'.repeat(64),
      treeInventorySha256: '6'.repeat(64),
    },
    policyObservationReceipt: policyObservation(),
    policyObservationReceiptLinkSha256: '',
  };
  return relinkPolicyObservationBootstrapReceipt(receipt);
}

function censusReceipt(
  stamp = '20260828T120000Z',
  nonceHex = '7'.repeat(64),
) {
  const receipt = {
    schemaVersion: 1,
    profile: 'warpkeep-genesis-001-census-export-private-proof-v1',
    realmId: 'GENESIS_001',
    releaseVersion: '0.3.43',
    sourceCommit: PREPARATION_SOURCE_COMMIT,
    privateCensusReference: {
      count: 1,
      pathBasename: `warpkeep-access-request-census-${stamp}.txt`,
      sha256: '6'.repeat(64),
      size: 128,
    },
    privateBlindingNonceHex: nonceHex,
  };
  return {
    ...receipt,
    opaqueProofDigest: genesis001CensusOpaqueProofDigest(receipt),
  };
}

function monitorReceipt() {
  return {
    disabled: true,
    label: 'com.warpkeep.hermes-admission-monitor',
    loaded: false,
    monitorPlistSha256:
      'a85b1eb4810ed798185f762044d3dac9d29ebee15a09b95bfb2ddbb6de71acaf',
    monitorProgramSha256:
      '1479a2b5fff85d15f8c04175962dfb898023d14cf418e27b7c1332202cb56de6',
    profile: 'warpkeep-genesis001-admission-monitor-suspension-v1',
    realmId: 'GENESIS_001',
    release: '0.3.43',
    sourceCommit: PREPARATION_SOURCE_COMMIT,
    suspendedAt: '2026-08-28T12:01:00.000Z',
  };
}

function monitorCurrentStateReceipt() {
  return {
    schemaVersion: 1,
    profile: 'warpkeep-genesis001-admission-monitor-current-state-v1',
    realmId: 'GENESIS_001',
    release: '0.3.43',
    sourceCommit: PREPARATION_SOURCE_COMMIT,
    observedAt: '2026-08-28T12:01:30.000Z',
    label: 'com.warpkeep.hermes-admission-monitor',
    disabled: true,
    loaded: false,
    monitorPlistSha256:
      'a85b1eb4810ed798185f762044d3dac9d29ebee15a09b95bfb2ddbb6de71acaf',
    monitorProgramSha256:
      '1479a2b5fff85d15f8c04175962dfb898023d14cf418e27b7c1332202cb56de6',
  };
}

function evidence() {
  const frozen = freezeReceipt();
  const freezeDigest = genesis001FreezePublishReceiptDigest(frozen);
  const monitor = monitorReceipt();
  const monitorDigest = genesis001MonitorSuspensionReceiptDigest(monitor);
  const privateEvidence = {
    preparationSourceCommit: PREPARATION_SOURCE_COMMIT,
    freezePublishReceipt: {
      receiptBasename:
        'genesis-001-freeze-publish-00000000-0000-4000-8000-000000000001.json',
      receiptSha256: freezeDigest,
      receipt: frozen,
    },
    policyObservationBootstrapReceipt: policyObservationBootstrapReceipt(),
    censusPrivacySafePrivateReceipt: {
      first: censusReceipt(),
      second: censusReceipt('20260828T120100Z', '8'.repeat(64)),
    },
    admissionMonitorSuspensionReceipt: {
      receiptBasename:
        `genesis001-admission-monitor-suspended-20260828T120100000Z-${monitorDigest.slice(0, 12)}.json`,
      receiptSha256: monitorDigest,
      receipt: monitor,
    },
    admissionMonitorCurrentStateReceipt: monitorCurrentStateReceipt(),
  };
  const authority = {
    freezePublishSourceCommit: FREEZE_SOURCE_COMMIT,
    freezePublishReceiptBasename:
      privateEvidence.freezePublishReceipt.receiptBasename,
    freezePublishReceiptDigest: freezeDigest,
  };
  return { privateEvidence, authority };
}

describe('Genesis 001 sealed-launch adoption', () => {
  it('derives the public G001 projection from one historical freeze and fresh S-bound evidence', () => {
    const { privateEvidence, authority } = evidence();
    const result = deriveGenesis001SealedLaunchEvidenceForTesting(
      privateEvidence,
      authority,
      new Date('2026-08-28T12:02:00.000Z'),
    );
    expect(result).toEqual({
      g001DatabaseIdentity: G001_DATABASE_IDENTITY,
      g001SourceBaselineCommit: BASELINE_COMMIT,
      g001BaselineAbiSha256: BASELINE_ABI,
      g001FreezeReleaseNonce: FREEZE_NONCE,
      g001FreezePublishReceiptDigest:
        authority.freezePublishReceiptDigest,
      g001PolicyReceiptDigest:
          privateEvidence.policyObservationBootstrapReceipt
            .policyObservationReceipt.policyReceiptDigest,
      g001PolicyObservationBootstrapReceiptDigest:
        genesis001PolicyObservationBootstrapReceiptDigest(
          privateEvidence.policyObservationBootstrapReceipt,
        ),
      g001PolicySourceCommit: PREPARATION_SOURCE_COMMIT,
      g001ReleaseVersion: '0.3.43',
      g001PlayerAccessEnabled: true,
      g001AdmissionStateMutationsEnabled: false,
      g001AccessRequestSubmissionsEnabled: false,
      g001CensusPrivacySafeReceiptProfile:
        'warpkeep-genesis-001-census-export-privacy-safe-v1',
      g001CensusPrivacySafeReceiptDigest:
        privateEvidence.censusPrivacySafePrivateReceipt.second.opaqueProofDigest,
      admissionMonitorSuspensionReceiptDigest:
        genesis001MonitorSuspensionReceiptDigest(
          privateEvidence.admissionMonitorSuspensionReceipt.receipt,
        ),
      admissionMonitorCurrentStateReceiptDigest:
        genesis001AdmissionMonitorCurrentStateReceiptDigest(
          privateEvidence.admissionMonitorCurrentStateReceipt,
        ),
      admissionMonitorDisabled: true,
      admissionMonitorLoaded: false,
    });
    const publicProjection = JSON.stringify(result);
    for (const privateKey of [
      'count',
      'size',
      'privateCensusReference',
      'privateBlindingNonceHex',
      'pathBasename',
    ]) expect(publicProjection).not.toContain(privateKey);
    for (const privateValue of [
      '6'.repeat(64),
      'warpkeep-access-request-census-20260828T120100Z.txt',
      '8'.repeat(64),
    ]) expect(publicProjection).not.toContain(privateValue);
  });

  it('uses the immutable production authority by default', () => {
    const { privateEvidence } = evidence();
    expect(() => deriveGenesis001SealedLaunchEvidence(privateEvidence))
      .toThrow();
  });

  it('rejects a fabricated freeze, stale evidence, or reopened policy/monitor state', () => {
    const { privateEvidence: baseline, authority } = evidence();
    const zeroNonceProof = {
      ...baseline.censusPrivacySafePrivateReceipt.second,
      privateBlindingNonceHex: '0'.repeat(64),
    };
    zeroNonceProof.opaqueProofDigest =
      genesis001CensusOpaqueProofDigest(zeroNonceProof);
    const mismatchedReferenceProof = {
      ...baseline.censusPrivacySafePrivateReceipt.second,
      privateCensusReference: {
        ...baseline.censusPrivacySafePrivateReceipt.second
          .privateCensusReference,
        sha256: '9'.repeat(64),
      },
    };
    mismatchedReferenceProof.opaqueProofDigest =
      genesis001CensusOpaqueProofDigest(mismatchedReferenceProof);
    const reorderedReferenceProof = {
      ...baseline.censusPrivacySafePrivateReceipt.second,
      privateCensusReference: {
        count: baseline.censusPrivacySafePrivateReceipt.second
          .privateCensusReference.count,
        size: baseline.censusPrivacySafePrivateReceipt.second
          .privateCensusReference.size,
        sha256: baseline.censusPrivacySafePrivateReceipt.second
          .privateCensusReference.sha256,
        pathBasename: baseline.censusPrivacySafePrivateReceipt.second
          .privateCensusReference.pathBasename,
      },
    };
    reorderedReferenceProof.opaqueProofDigest =
      genesis001CensusOpaqueProofDigest(reorderedReferenceProof);
    const censusAt = (stamp: string) => {
      const receipt = {
        ...baseline.censusPrivacySafePrivateReceipt.second,
        privateCensusReference: {
          ...baseline.censusPrivacySafePrivateReceipt.second
            .privateCensusReference,
          pathBasename: `warpkeep-access-request-census-${stamp}.txt`,
        },
      };
      receipt.opaqueProofDigest = genesis001CensusOpaqueProofDigest(receipt);
      return receipt;
    };
    const cases = [
      {
        ...baseline,
        freezePublishReceipt: {
          ...baseline.freezePublishReceipt,
          receipt: {
            ...baseline.freezePublishReceipt.receipt,
            artifactSha256: '8'.repeat(64),
          },
        },
      },
      {
        ...baseline,
        policyObservationBootstrapReceipt: {
          ...baseline.policyObservationBootstrapReceipt,
          policyObservationReceipt: {
            ...baseline.policyObservationBootstrapReceipt
              .policyObservationReceipt,
            sourceCommit: FREEZE_SOURCE_COMMIT,
          },
        },
      },
      {
        ...baseline,
        censusPrivacySafePrivateReceipt: {
          ...baseline.censusPrivacySafePrivateReceipt,
          second: {
            ...baseline.censusPrivacySafePrivateReceipt.second,
            sourceCommit: FREEZE_SOURCE_COMMIT,
          },
        },
      },
      {
        ...baseline,
        censusPrivacySafePrivateReceipt: {
          first: baseline.censusPrivacySafePrivateReceipt.second,
          second: baseline.censusPrivacySafePrivateReceipt.first,
        },
      },
      {
        ...baseline,
        censusPrivacySafePrivateReceipt: {
          ...baseline.censusPrivacySafePrivateReceipt,
          second: censusAt('20260828T120200Z'),
        },
      },
      {
        ...baseline,
        censusPrivacySafePrivateReceipt: {
          ...baseline.censusPrivacySafePrivateReceipt,
          second: censusAt('20260230T120100Z'),
        },
      },
      {
        ...baseline,
        policyObservationBootstrapReceipt: {
          ...baseline.policyObservationBootstrapReceipt,
          policyObservationReceipt: {
            ...baseline.policyObservationBootstrapReceipt
              .policyObservationReceipt,
            policy: {
              ...baseline.policyObservationBootstrapReceipt
                .policyObservationReceipt.policy,
            admissionStateMutationsEnabled: true,
            },
          },
        },
      },
      {
        ...baseline,
        policyObservationBootstrapReceipt: {
          ...baseline.policyObservationBootstrapReceipt,
          policyObservationReceipt: {
            ...baseline.policyObservationBootstrapReceipt
              .policyObservationReceipt,
            observedAt: '2026-08-28T12:00:30.000Z',
          },
        },
      },
      {
        ...baseline,
        admissionMonitorSuspensionReceipt: {
          ...baseline.admissionMonitorSuspensionReceipt,
          receipt: {
            ...baseline.admissionMonitorSuspensionReceipt.receipt,
            loaded: true,
          },
        },
      },
      {
        ...baseline,
        censusPrivacySafePrivateReceipt: {
          ...baseline.censusPrivacySafePrivateReceipt,
          second: zeroNonceProof,
        },
      },
      {
        ...baseline,
        censusPrivacySafePrivateReceipt: {
          ...baseline.censusPrivacySafePrivateReceipt,
          second: mismatchedReferenceProof,
        },
      },
      {
        ...baseline,
        censusPrivacySafePrivateReceipt: {
          ...baseline.censusPrivacySafePrivateReceipt,
          second: reorderedReferenceProof,
        },
      },
      {
        ...baseline,
        censusPrivacySafePrivateReceipt: {
          first: baseline.censusPrivacySafePrivateReceipt.first,
          second: baseline.censusPrivacySafePrivateReceipt.first,
        },
      },
      {
        ...baseline,
        policyObservationBootstrapReceipt: {
          ...baseline.policyObservationBootstrapReceipt,
          policyObservationReceipt: {
            ...baseline.policyObservationBootstrapReceipt
              .policyObservationReceipt,
            observedAt: '2026-08-28T12:02:00.000Z',
          },
        },
      },
    ];
    for (const candidate of cases) {
      expect(
        () => deriveGenesis001SealedLaunchEvidenceForTesting(
          candidate as never,
          authority,
          new Date('2026-08-28T12:02:00.000Z'),
        ),
      ).toThrow();
    }
  });

  it('rejects naked or forged bootstrap authority and stale current monitor state', () => {
    const { privateEvidence: baseline, authority } = evidence();
    const monitorAt = (suspendedAt: string) => {
      const receipt = {
        ...baseline.admissionMonitorSuspensionReceipt.receipt,
        suspendedAt,
      };
      const receiptSha256 = genesis001MonitorSuspensionReceiptDigest(receipt);
      const stamp = suspendedAt.replace(/[-:.]/gu, '');
      return {
        receiptBasename:
          `genesis001-admission-monitor-suspended-${stamp}-${receiptSha256.slice(0, 12)}.json`,
        receiptSha256,
        receipt,
      };
    };
    const cases: Array<{ candidate: unknown; verifiedAt?: string }> = [
      {
        candidate: {
          ...baseline,
          policyObservationBootstrapReceipt:
            baseline.policyObservationBootstrapReceipt.policyObservationReceipt,
        },
      },
      {
        candidate: {
          ...baseline,
          policyObservationBootstrapReceipt: {
            ...baseline.policyObservationBootstrapReceipt,
            policyObservationReceiptLinkSha256: 'f'.repeat(64),
          },
        },
      },
      {
        candidate: {
          ...baseline,
          policyObservationBootstrapReceipt:
            relinkPolicyObservationBootstrapReceipt({
            ...baseline.policyObservationBootstrapReceipt,
            launchCleanup: {
              ...baseline.policyObservationBootstrapReceipt.launchCleanup,
              outcome: 'retained',
            },
          }),
        },
      },
      {
        candidate: {
          ...baseline,
          policyObservationBootstrapReceipt:
            relinkPolicyObservationBootstrapReceipt({
            ...baseline.policyObservationBootstrapReceipt,
            command: 'verify',
          }),
        },
      },
      {
        candidate: {
          ...baseline,
          policyObservationBootstrapReceipt:
            relinkPolicyObservationBootstrapReceipt({
            ...baseline.policyObservationBootstrapReceipt,
            moduleArchiveCount: 15,
          }),
        },
      },
      {
        candidate: Object.fromEntries(
          Object.entries(baseline).filter(([key]) => (
            key !== 'admissionMonitorCurrentStateReceipt'
          )),
        ),
      },
      {
        candidate: {
          ...baseline,
          admissionMonitorCurrentStateReceipt: {
            ...baseline.admissionMonitorCurrentStateReceipt,
            loaded: true,
          },
        },
      },
      {
        candidate: {
          ...baseline,
          admissionMonitorCurrentStateReceipt: {
            ...baseline.admissionMonitorCurrentStateReceipt,
            disabled: false,
          },
        },
      },
      {
        candidate: {
          ...baseline,
          admissionMonitorCurrentStateReceipt: {
            ...baseline.admissionMonitorCurrentStateReceipt,
            sourceCommit: FREEZE_SOURCE_COMMIT,
          },
        },
      },
      {
        candidate: {
          ...baseline,
          admissionMonitorCurrentStateReceipt: {
            ...baseline.admissionMonitorCurrentStateReceipt,
            observedAt: '2026-08-28T12:02:01.000Z',
          },
        },
      },
      {
        candidate: baseline,
        verifiedAt: '2026-08-28T12:06:31.000Z',
      },
      {
        candidate: {
          ...baseline,
          policyObservationBootstrapReceipt:
            relinkPolicyObservationBootstrapReceipt({
              ...baseline.policyObservationBootstrapReceipt,
              policyObservationReceipt: {
                ...baseline.policyObservationBootstrapReceipt
                  .policyObservationReceipt,
                observedAt: '2026-08-28T11:54:00.000Z',
              },
            }),
        },
      },
      {
        candidate: {
          ...baseline,
          policyObservationBootstrapReceipt:
            relinkPolicyObservationBootstrapReceipt({
              ...baseline.policyObservationBootstrapReceipt,
              policyObservationReceipt: {
                ...baseline.policyObservationBootstrapReceipt
                  .policyObservationReceipt,
                observedAt: '2026-08-28T11:55:00.000Z',
              },
            }),
          admissionMonitorCurrentStateReceipt: {
            ...baseline.admissionMonitorCurrentStateReceipt,
            observedAt: '2026-08-28T12:09:30.000Z',
          },
        },
        verifiedAt: '2026-08-28T12:10:00.000Z',
      },
      {
        candidate: {
          ...baseline,
          censusPrivacySafePrivateReceipt: {
            ...baseline.censusPrivacySafePrivateReceipt,
            second: censusReceipt('20260828T120030Z', '8'.repeat(64)),
          },
        },
      },
      {
        candidate: {
          ...baseline,
          censusPrivacySafePrivateReceipt: {
            ...baseline.censusPrivacySafePrivateReceipt,
            second: censusReceipt('20260828T120600Z', '8'.repeat(64)),
          },
          admissionMonitorSuspensionReceipt:
            monitorAt('2026-08-28T12:06:00.000Z'),
          admissionMonitorCurrentStateReceipt: {
            ...baseline.admissionMonitorCurrentStateReceipt,
            observedAt: '2026-08-28T12:06:30.000Z',
          },
        },
        verifiedAt: '2026-08-28T12:07:00.000Z',
      },
    ];
    for (const { candidate, verifiedAt = '2026-08-28T12:02:00.000Z' } of cases) {
      expect(() => deriveGenesis001SealedLaunchEvidenceForTesting(
        candidate,
        authority,
        new Date(verifiedAt),
      )).toThrow();
    }
  });
});
