// @vitest-environment node

import {
  chmodSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createSealedLaunchActivationBinding,
} from '../scripts/verify-0.4.0-sealed-launch.mjs';

const repositoryRoot = resolve(import.meta.dirname, '..');
const artifactSuffix = join(
  'Library',
  'Application Support',
  'Warpkeep',
  'operations',
  'runtime',
  'sealed-realms-v1',
  'public',
  '0.4.0-sealed-launch.json',
);

function validBinding(): Record<string, unknown> {
  const candidate = JSON.parse(readFileSync(
    resolve(repositoryRoot, 'config/releases/0.4.0-sealed-launch.json'),
    'utf8',
  )) as Record<string, unknown>;
  for (const key of Object.keys(candidate)) {
    if (key.endsWith('Commitment')) candidate[key] = null;
    else if (
      key.endsWith('Digest')
      || key.endsWith('Sha256')
      || key.endsWith('Identity')
      || key.endsWith('Nonce')
    ) candidate[key] = 'a'.repeat(64);
    else if (key.endsWith('Commit') || key.endsWith('TreeId')) {
      candidate[key] = 'b'.repeat(40);
    }
  }
  Object.assign(candidate, {
    pagesDeploymentApproved: true,
    preparationSourceCommit: 'b'.repeat(40),
    g001DatabaseIdentity:
      'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
    g001SourceBaselineCommit:
      '2ae51984e1fa6ce5b0028c1a250359fed79d819b',
    g001BaselineAbiSha256:
      'cb7d69d2bed316702ffa1aa8696a4e1ca1934a775b8312129b305a9c33eb0e03',
    g001FreezeReleaseNonce:
      '3f158f17acd5e1e63c74befef7cb3ccab7cb07feaaed432e7483467e1c856f00',
    g001FreezePublishReceiptDigest:
      '5a9629c7ee695abc2b2369921274dcaa9c618b747387b90f9444429ab8e81d63',
    g001PolicyReceiptDigest:
      'acf64ca8f02dcfc1e2a162067d2132d02a7155bebe8895c56a85dbbfefd35b60',
    g001PolicySourceCommit: 'b'.repeat(40),
    authBridgeSourceCommit: 'b'.repeat(40),
    g001ReleaseVersion: '0.3.43',
    g001PlayerAccessEnabled: true,
    g001AdmissionStateMutationsEnabled: false,
    g001AccessRequestSubmissionsEnabled: false,
    g001CensusPrivacySafeReceiptProfile:
      'warpkeep-genesis-001-census-export-privacy-safe-v1',
    g001AdmittedPlayerCensusReceiptProfile:
      'warpkeep-genesis-001-admitted-player-census-privacy-safe-v1',
    admissionMonitorDisabled: true,
    admissionMonitorLoaded: false,
    g002DatabaseIdentity: 'c'.repeat(64),
    g002ModuleSourceCommit: 'b'.repeat(40),
    g002AtlasSourceCommit: 'b'.repeat(40),
    g002AtlasId: 'GENESIS_002_GREATER_REALM',
    g002PublicReleaseId: `GRR-${'A'.repeat(26)}`,
    g002AllowedFids: 0,
    g002AccessRequests: 0,
    g002PlayersV1: 0,
    g002PlayersV2: 0,
    g002OwnershipBindings: 0,
    g002Founders: 0,
    g002Castles: 0,
    g002RealmProfiles: 0,
    g002TermsAcceptances: 0,
    g002MarkAccounts: 0,
    g002ResourceAccounts: 0,
    g002Claims: 0,
    g002Occupancies: 0,
    g002ActivationRows: 0,
    g002WorkerSystemRows: 0,
    g002AtlasReady: true,
    g002AtlasFinalized: true,
    g002AtlasWritesClosedByFinalization: true,
    g002AtlasImportMutationsEnabled: true,
    g002AtlasActivationMutationsEnabled: false,
    g002PlayerAccessEnabled: false,
    g002AdmissionMutationsEnabled: false,
    ptrDatabaseIdentity: 'd'.repeat(64),
    ptrModuleSourceCommit: 'b'.repeat(40),
    ptrAtlasSourceCommit: 'b'.repeat(40),
    ptrAtlasId: 'PTR_GREATER_REALM',
    ptrPublicReleaseId: `GRR-${'B'.repeat(26)}`,
    ptrReleaseVersion: '0.4.0-ptr.1',
    ptrAllowedFids: 0,
    ptrAccessRequests: 0,
    ptrPlayersV1: 0,
    ptrPlayersV2: 0,
    ptrOwnershipBindings: 0,
    ptrCastles: 0,
    ptrRealmProfiles: 0,
    ptrTermsAcceptances: 0,
    ptrMarkAccounts: 0,
    ptrResourceAccounts: 0,
    ptrClaims: 0,
    ptrOccupancies: 0,
    ptrActivationRows: 0,
    ptrPublicAtlasRows: 0,
    ptrPublicRegionRows: 0,
    ptrWorkerSystemRows: 0,
    ptrAtlasReady: true,
    ptrAtlasFinalized: true,
    ptrAtlasWritesClosedByFinalization: true,
    ptrAtlasImportsExact: true,
    ptrAtlasImportMutationsCompiled: true,
    ptrAtlasActivationMutationsCompiled: false,
    ptrOwnerAnchorRows: 1,
    ptrOwnerProvisioned: true,
    ptrOwnerEnabled: true,
    ptrAdmissionsOpen: false,
    ptrAccessRequestsOpen: false,
    ptrAdmissionSurfacePresent: false,
    ptrAccessRequestSurfacePresent: false,
    g002PresentationEnabled: false,
    ptrPresentationEnabled: true,
    legacyGreaterRealmClientPresentationEnabled: false,
    legacyGreaterRealmServerPresentationEnabled: false,
    admissionNotificationsEnabled: false,
  });
  return JSON.parse(JSON.stringify(
    createSealedLaunchActivationBinding(candidate),
  ));
}

function canonical(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

it('is a standalone builtins-only verifier with no generator coupling', () => {
  const source = readFileSync(resolve(
    repositoryRoot,
    'scripts/verify-sealed-realms-public-activation-artifact.mjs',
  ), 'utf8');
  expect(source).not.toContain("from './generate-0.4.0-sealed-launch-activation.mjs'");
  expect(source).not.toContain("from './verify-0.4.0-sealed-launch.mjs'");
  expect(source.match(/readSync\(/gu)).toHaveLength(1);
});

it('fences same-inode mutation around the bounded single read', () => {
  const source = readFileSync(resolve(
    repositoryRoot,
    'scripts/verify-sealed-realms-public-activation-artifact.mjs',
  ), 'utf8');
  expect(source.match(/fstatSync\(/gu)).toHaveLength(2);
  for (const stableField of ['size', 'mtimeNs', 'ctimeNs']) {
    expect(source).toContain(`after.${stableField} !== opened.${stableField}`);
  }
  expect(source).toContain('MAXIMUM_ARTIFACT_BYTES');
  expect(source).toContain('bytes.byteLength !== Number(opened.size)');
});

describe.skipIf(process.platform === 'win32')(
  'sealed-realms public activation artifact verifier',
  () => {
    let home: string;
    let artifactPath: string;
    let priorHome: string | undefined;

    beforeEach(() => {
      priorHome = process.env.HOME;
      home = mkdtempSync(resolve(tmpdir(), 'warpkeep-public-activation-'));
      process.env.HOME = home;
      artifactPath = resolve(home, artifactSuffix);
      mkdirSync(dirname(artifactPath), { recursive: true, mode: 0o700 });
      writeFileSync(artifactPath, canonical(validBinding()), { mode: 0o600 });
      chmodSync(artifactPath, 0o600);
    });

    afterEach(() => {
      if (priorHome === undefined) delete process.env.HOME;
      else process.env.HOME = priorHome;
      rmSync(home, { force: true, recursive: true });
    });

    async function verify(...arguments_: unknown[]): Promise<Buffer> {
      const module = await import(
        '../scripts/verify-sealed-realms-public-activation-artifact.mjs'
      );
      const verifier = module.verifySealedRealmsPublicActivationArtifact as
        unknown as (...input: unknown[]) => Buffer;
      return verifier(...arguments_);
    }

    it('returns the exact single-read canonical bytes from only the fixed path', async () => {
      const expected = readFileSync(artifactPath);
      await expect(verify()).resolves.toEqual(expected);
      await expect(verify(resolve(home, 'alternate.json'))).rejects.toThrow();
      expect(lstatSync(artifactPath).nlink).toBe(1);
    });

    it.each([
      ['unsupported profile', (value: Record<string, unknown>) => {
        value.profile = 'warpkeep-0.4.0-sealed-launch-v2';
      }],
      ['extra private envelope', (value: Record<string, unknown>) => {
        value.bindingCandidate = {};
      }],
      ['private receipt body', (value: Record<string, unknown>) => {
        value.privateReceiptBody = 'forbidden';
      }],
      ['FID', (value: Record<string, unknown>) => {
        value.ownerFid = '4242';
      }],
      ['epoch', (value: Record<string, unknown>) => {
        value.authEpoch = '7';
      }],
      ['count', (value: Record<string, unknown>) => {
        value.admittedPlayerCount = '1';
      }],
      ['raw digest', (value: Record<string, unknown>) => {
        value.rawEvidenceDigest = 'e'.repeat(64);
      }],
      ['normalized digest', (value: Record<string, unknown>) => {
        value.normalizedSetDigest = 'e'.repeat(64);
      }],
      ['token', (value: Record<string, unknown>) => {
        value.token = 'secret';
      }],
      ['absolute path', (value: Record<string, unknown>) => {
        value.receiptPath = '/private/receipt.json';
      }],
      ['changed commitment', (value: Record<string, unknown>) => {
        value.g001AdmittedPlayerCensusReceiptCommitment = 'f'.repeat(64);
      }],
    ] as const)('rejects %s content', async (_name, mutate) => {
      const value = validBinding();
      mutate(value);
      writeFileSync(artifactPath, canonical(value), { mode: 0o600 });
      await expect(verify()).rejects.toThrow();
    });

    it('rejects noncanonical order, permissions, symlinks, and hardlinks', async () => {
      const value = validBinding();
      const entries = Object.entries(value);
      writeFileSync(artifactPath, canonical(Object.fromEntries([
        entries[1]!, entries[0]!, ...entries.slice(2),
      ])), { mode: 0o600 });
      await expect(verify()).rejects.toThrow();

      writeFileSync(artifactPath, canonical(value), { mode: 0o644 });
      chmodSync(artifactPath, 0o644);
      await expect(verify()).rejects.toThrow();

      rmSync(artifactPath);
      const target = resolve(home, 'target.json');
      writeFileSync(target, canonical(value), { mode: 0o600 });
      symlinkSync(target, artifactPath);
      await expect(verify()).rejects.toThrow();

      rmSync(artifactPath);
      linkSync(target, artifactPath);
      await expect(verify()).rejects.toThrow();
    });

    it('rejects an oversized regular file before reading it', async () => {
      writeFileSync(artifactPath, Buffer.alloc(32 * 1_024 + 1), {
        mode: 0o600,
      });
      await expect(verify()).rejects.toThrow(
        'SEALED_REALMS_PUBLIC_ACTIVATION_FILE_SIZE_INVALID',
      );
    });
  },
);
