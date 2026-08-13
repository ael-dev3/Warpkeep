// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import {
  executeGreaterRealmProductionPagesEvidenceOperator,
  parseGreaterRealmProductionPagesEvidenceOperatorArguments,
} from '../scripts/greater-realm-production-pages-evidence-operator';
import {
  GREATER_REALM_PRODUCTION_PAGES_EVIDENCE_MAXIMUM_AGE_MILLISECONDS,
  verifyAndWritePrivateGreaterRealmProductionPagesEvidence,
} from '../scripts/greater-realm-production-pages-evidence';
import { inspectGreaterRealmProductionProvenance } from '../scripts/greater-realm-production-provenance';

const SOURCE_RELEASE = Object.freeze({
  atlasSourceCommit: 'a'.repeat(40),
  atlasId: 'GR-ATLAS-PAGES-OPERATOR',
  publicReleaseId: 'GRR-PAGES-OPERATOR',
  expectedReleaseSha256: 'b'.repeat(64),
  moduleSourceCommit: 'c'.repeat(40),
});

describe('Greater Realm active-v17 Pages evidence operator', () => {
  it('accepts exactly one canonical founder count from 1 through 600', () => {
    expect(parseGreaterRealmProductionPagesEvidenceOperatorArguments([
      '--expected-founder-count=1',
    ])).toEqual({ expectedFounderCount: 1 });
    expect(parseGreaterRealmProductionPagesEvidenceOperatorArguments([
      '--expected-founder-count=600',
    ])).toEqual({ expectedFounderCount: 600 });
    for (const arguments_ of [
      [],
      ['1'],
      ['--expected-founder-count=0'],
      ['--expected-founder-count=01'],
      ['--expected-founder-count=601'],
      ['--expected-founder-count=1', '--confirm'],
    ]) {
      expect(() => parseGreaterRealmProductionPagesEvidenceOperatorArguments(arguments_))
        .toThrow(/PAGES_EVIDENCE_(?:USAGE|FOUNDER_COUNT_INVALID)/u);
    }
  });

  it('attests provenance before verification and returns no private path or secret', async () => {
    const events: string[] = [];
    const inspectProvenance = vi.fn(() => {
      events.push('provenance');
      return {
        ...SOURCE_RELEASE,
        workspace: {},
        artifacts: {},
      } as unknown as ReturnType<typeof inspectGreaterRealmProductionProvenance>;
    }) as unknown as typeof inspectGreaterRealmProductionProvenance;
    const writeEvidence = vi.fn(async () => {
      events.push('verify-and-write');
      return {
        path: `/owner/private/evidence/greater-realm-pages-active-v17-${'d'.repeat(64)}.json`,
        evidenceDigest: 'd'.repeat(64),
        recordedAt: '2026-08-13T00:00:00.000Z',
        expiresAt: '2026-08-14T00:00:00.000Z',
        result: 'installed',
        evidence: {
          expectedFounderCount: 417,
          founderCapacityRemaining: 183,
          activeAdmissionEligible: true,
        },
      } as unknown as Awaited<ReturnType<
        typeof verifyAndWritePrivateGreaterRealmProductionPagesEvidence
      >>;
    }) as unknown as typeof verifyAndWritePrivateGreaterRealmProductionPagesEvidence;

    const result = await executeGreaterRealmProductionPagesEvidenceOperator({
      expectedFounderCount: 417,
      adminSecretPath: '/owner/private/admin-secret',
      environment: {
        WARPKEEP_SPACETIMEDB_URI: 'https://maincloud.spacetimedb.com',
      },
      repositoryRoot: '/trusted/repository',
      workspaceRoot: '/owner/private/atlas-workspace',
      directory: '/owner/private/evidence',
      testOnlyDependencies: { inspectProvenance, writeEvidence },
    });

    expect(events).toEqual(['provenance', 'verify-and-write']);
    expect(inspectProvenance).toHaveBeenCalledWith(expect.objectContaining({
      repositoryRoot: '/trusted/repository',
      workspaceRoot: '/owner/private/atlas-workspace',
      attestModuleSourceCommit: expect.any(Function),
    }));
    expect(writeEvidence).toHaveBeenCalledWith({
      directory: '/owner/private/evidence',
      repositoryRoot: '/trusted/repository',
      adminSecretPath: '/owner/private/admin-secret',
      environment: {
        WARPKEEP_SPACETIMEDB_URI: 'https://maincloud.spacetimedb.com',
      },
      workspaceRoot: '/owner/private/atlas-workspace',
      expectedSourceRelease: SOURCE_RELEASE,
      expectedFounderCount: 417,
      maximumAgeMilliseconds:
        GREATER_REALM_PRODUCTION_PAGES_EVIDENCE_MAXIMUM_AGE_MILLISECONDS,
    });
    expect(result).toEqual({
      filename: `greater-realm-pages-active-v17-${'d'.repeat(64)}.json`,
      evidenceDigest: 'd'.repeat(64),
      recordedAt: '2026-08-13T00:00:00.000Z',
      expiresAt: '2026-08-14T00:00:00.000Z',
      result: 'installed',
      expectedFounderCount: 417,
      founderCapacityRemaining: 183,
      activeAdmissionEligible: true,
    });
    expect(JSON.stringify(result)).not.toContain('/owner/private');
    expect(JSON.stringify(result)).not.toContain('admin-secret');
  });

  it('does not verify or write when local provenance attestation fails', async () => {
    const writeEvidence = vi.fn();
    await expect(executeGreaterRealmProductionPagesEvidenceOperator({
      expectedFounderCount: 100,
      adminSecretPath: '/owner/private/admin-secret',
      environment: {},
      testOnlyDependencies: {
        inspectProvenance: vi.fn(() => {
          throw new Error('GREATER_REALM_PRODUCTION_SOURCE_ANCESTRY_INVALID');
        }) as unknown as typeof inspectGreaterRealmProductionProvenance,
        writeEvidence: writeEvidence as unknown as
          typeof verifyAndWritePrivateGreaterRealmProductionPagesEvidence,
      },
    })).rejects.toThrow('GREATER_REALM_PRODUCTION_SOURCE_ANCESTRY_INVALID');
    expect(writeEvidence).not.toHaveBeenCalled();
  });
});
