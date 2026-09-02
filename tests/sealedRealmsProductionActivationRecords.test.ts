// @vitest-environment node

import {
  createHash,
} from 'node:crypto';
import {
  chmodSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  GENESIS_001_ADMITTED_PLAYER_CENSUS_NORMALIZED_SET_DOMAIN,
  GENESIS_001_ADMITTED_PLAYER_CENSUS_OPAQUE_PROOF_DOMAIN,
  GENESIS_001_ADMITTED_PLAYER_CENSUS_RAW_EVIDENCE_DOMAIN,
} from '../scripts/genesis001-admitted-player-census.mjs';
import {
  genesis001CensusOpaqueProofDigest,
} from '../scripts/genesis001-sealed-launch-adoption.mjs';
import {
  ptrOwnerProvisionReceiptDigest,
} from '../scripts/generate-0.4.0-sealed-launch-activation.mjs';
import {
  createSealedRealmsProductionPrivateState,
} from '../scripts/sealed-realms-production-private-state.mjs';
import {
  createSealedRealmsProductionActivationRecords,
  writeSealedRealmsProductionActivationDescriptor,
} from '../scripts/sealed-realms-production-activation-records.mjs';
import * as activationRecordsModule from '../scripts/sealed-realms-production-activation-records.mjs';
import {
  authenticateSealedRealmsProductionSourceAuthority,
} from '../scripts/sealed-realms-production-source-authority.mjs';

const temporaryHomes: string[] = [];
const FIXED_DESCRIPTOR_RELATIVE_PATH =
  'activation-evidence/0.4.0-sealed-launch-envelope.json';
const G001_DATABASE_IDENTITY =
  'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e';
const G001_MAXIMUM_ROWS = 4_096;

function sha256(...parts: readonly string[]) {
  const hash = createHash('sha256');
  for (const part of parts) hash.update(part);
  return hash.digest('hex');
}

function maxCensusEntries() {
  return Array.from({ length: G001_MAXIMUM_ROWS }, (_unused, index) => ({
    fid: (9_000_000_000_000_000n + BigInt(index)).toString(),
    authEpoch: '4294967295',
  }));
}

function maxAdmittedPlayerReceipt(
  sourceCommit: string,
  observedAt: string,
  nonceHex: string,
) {
  const entries = maxCensusEntries();
  const normalizedSetDigest = sha256(
    GENESIS_001_ADMITTED_PLAYER_CENSUS_NORMALIZED_SET_DOMAIN,
    `${entries.map(entry => JSON.stringify(entry)).join('\n')}\n`,
  );
  const proof = {
    schemaVersion: 1,
    profile: 'warpkeep-genesis-001-admitted-player-census-private-proof-v1',
    realmId: 'GENESIS_001',
    releaseVersion: '0.3.43',
    databaseIdentity: G001_DATABASE_IDENTITY,
    preparationSourceCommit: sourceCommit,
    observedAt,
    collectionMethod: 'preferred-exact-query',
    beforeAggregate: { allowedFids: String(G001_MAXIMUM_ROWS), enabledAllowedFids: String(G001_MAXIMUM_ROWS) },
    afterAggregate: { allowedFids: String(G001_MAXIMUM_ROWS), enabledAllowedFids: String(G001_MAXIMUM_ROWS) },
    admittedPlayerCount: String(G001_MAXIMUM_ROWS),
    entries,
    normalizedSetDigest,
    rawEvidenceDigest: sha256(
      GENESIS_001_ADMITTED_PLAYER_CENSUS_RAW_EVIDENCE_DOMAIN,
      `maximum-${observedAt}`,
    ),
    nonceHex,
  };
  return {
    ...proof,
    opaqueProofDigest: sha256(
      GENESIS_001_ADMITTED_PLAYER_CENSUS_OPAQUE_PROOF_DOMAIN,
      `${JSON.stringify(proof)}\n`,
    ),
  };
}

function maximumCensusPrivacyReceipt(sourceCommit: string, stamp: string, nonceHex: string) {
  const proof = {
    schemaVersion: 1,
    profile: 'warpkeep-genesis-001-census-export-private-proof-v1',
    realmId: 'GENESIS_001',
    releaseVersion: '0.3.43',
    sourceCommit,
    privateCensusReference: {
      count: G001_MAXIMUM_ROWS,
      pathBasename: `warpkeep-access-request-census-${stamp}.txt`,
      sha256: '89'.repeat(32),
      size: 1_048_576,
    },
    privateBlindingNonceHex: nonceHex,
  };
  return { ...proof, opaqueProofDigest: genesis001CensusOpaqueProofDigest(proof) };
}

function maximumG001CensusActivationWrapper(sourceCommit: string) {
  const applicantFirst = maximumCensusPrivacyReceipt(sourceCommit, '20260828T120000Z', '1'.repeat(64));
  const applicantSecond = maximumCensusPrivacyReceipt(sourceCommit, '20260828T120100Z', '2'.repeat(64));
  const admittedFirst = maxAdmittedPlayerReceipt(sourceCommit, '2026-08-28T12:00:00.000Z', '3'.repeat(64));
  const admittedSecond = maxAdmittedPlayerReceipt(sourceCommit, '2026-08-28T12:01:00.000Z', '4'.repeat(64));
  const record = (applicant: object, admitted: object, observedAt: string) => ({
    schemaVersion: 1,
    profile: 'warpkeep-sealed-realms-g001-census-private-v1',
    sourceCommit,
    applicant,
    admitted,
    observedAt,
  });
  const envelope = (value: object) => ({
    recordDigest: sha256(`${JSON.stringify(value)}\n`),
    record: value,
  });
  const first = envelope(record(applicantFirst, admittedFirst, '2026-08-28T12:00:00.000Z'));
  const second = envelope(record(applicantSecond, admittedSecond, '2026-08-28T12:01:00.000Z'));
  const expiresAt = '2026-08-28T12:06:00.000Z';
  const confirmationDigest = sha256([
    'warpkeep.sealed-realms.g001-census-confirmation.v1', sourceCommit,
    first.recordDigest, second.recordDigest, expiresAt,
  ].join('\n'));
  return {
    schemaVersion: 1,
    profile: 'warpkeep-sealed-realms-g001-census-activation-private-v1',
    first,
    second,
    confirmation: envelope({
      schemaVersion: 1,
      profile: 'warpkeep-sealed-realms-g001-census-private-v1',
      sourceCommit,
      firstDigest: first.recordDigest,
      secondDigest: second.recordDigest,
      secondObservedAt: '2026-08-28T12:01:00.000Z',
      expiresAt,
      confirmationDigest,
    }),
    consumed: envelope({
      schemaVersion: 1,
      profile: 'warpkeep-sealed-realms-g001-census-private-v1',
      sourceCommit,
      firstDigest: first.recordDigest,
      secondDigest: second.recordDigest,
      confirmationDigest,
      consumedAt: '2026-08-28T12:01:00.000Z',
    }),
  };
}

function privateStateFixture(options: Readonly<{
  testOnlyRace?: (phase: string, path: string) => void;
}> = {}) {
  const home = mkdtempSync(join(tmpdir(), 'warpkeep-activation-records-'));
  temporaryHomes.push(home);
  for (const root of [
    join(home, 'Library', 'Application Support', 'Warpkeep', 'operations', 'audit', 'private'),
    join(home, 'Library', 'Application Support', 'Warpkeep', 'operations', 'runtime'),
    join(home, 'Library', 'Application Support', 'Warpkeep', 'operations', 'cache'),
  ]) {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    chmodSync(root, 0o700);
  }
  return createSealedRealmsProductionPrivateState({
    reportedHome: home,
    testOnlyOwnerUid: statSync(home).uid,
    testOnlyFsync: () => {},
    testOnlyAllowPlatformMode: true,
    ...options,
  });
}

function runtimePath(home: string, relativePath: string) {
  return join(
    home,
    'Library', 'Application Support', 'Warpkeep', 'operations', 'runtime',
    'sealed-realms-v1',
    ...relativePath.split('/'),
  );
}

function fixedDescriptorPath(home: string) {
  return runtimePath(home, FIXED_DESCRIPTOR_RELATIVE_PATH);
}

afterEach(() => {
  for (const home of temporaryHomes.splice(0)) {
    rmSync(home, { recursive: true, force: true });
  }
});

describe('sealed-realms activation descriptor records', () => {
  it('exposes no raw-receipt capture surface and never accepts descriptor evidence input', () => {
    const state = privateStateFixture();
    const source = 'a'.repeat(40);
    const authority = authenticateSealedRealmsProductionSourceAuthority({
      operation: 'g002-publish-apply',
      workflowInputSha: source,
      readGit: args => args[0] === 'rev-parse'
        ? `${source}\n`
        : (() => { throw new Error('unexpected git request'); })(),
      readBinding: () => ({
        schemaVersion: 1,
        profile: 'warpkeep-0.4.0-sealed-launch-v1',
        pagesDeploymentApproved: false,
        preparationSourceCommit: source,
      }),
      verifyEvidence: verifiedSha => ({ verifiedSha }),
    });
    const records = createSealedRealmsProductionActivationRecords({
      privateState: state,
      authority,
      readBindingCandidate: () => ({
        schemaVersion: 1,
        profile: 'warpkeep-0.4.0-sealed-launch-v1',
        pagesDeploymentApproved: false,
        preparationSourceCommit: source,
        g002PublishReceiptDigest: null,
      }),
    });
    expect(Object.keys(records)).toEqual([]);
    expect(Object.keys(activationRecordsModule))
      .not.toContain('captureSealedRealmsProductionActivationReceipt');
    expect(() => writeSealedRealmsProductionActivationDescriptor({
      records,
      evidence: {},
      consumeDescriptor: () => undefined,
    } as never)).toThrow();
    expect(() => writeSealedRealmsProductionActivationDescriptor({
      records,
      consumeDescriptor: () => undefined,
    })).toThrow('SEALED_REALMS_ACTIVATION_RECORDS_BINDING_INVALID');
  });

  it('keeps a schema-valid maximum-width G001 census record below the generic cap', () => {
    const source = 'a'.repeat(40);
    const receipt = maximumG001CensusActivationWrapper(source);
    const record = {
      schemaVersion: 1,
      profile: 'warpkeep-sealed-realms-activation-record-v1',
      member: 'g001AdmittedPlayerCensusPrivateReceipt',
      preparationSourceCommit: source,
      sourceCommit: source,
      operation: 'g001-census-second-inspect',
      sourceAuthorityDigest: 'b'.repeat(64),
      bodyDigest: sha256(`${JSON.stringify(receipt)}\n`),
      receipt,
      semanticDigest: 'c'.repeat(64),
    };
    const bytes = Buffer.from(`${JSON.stringify(record)}\n`, 'utf8');
    try {
      expect(bytes.byteLength).toBeGreaterThan(400 * 1_024);
      expect(bytes.byteLength).toBeLessThanOrEqual(512 * 1_024);
    } finally {
      bytes.fill(0);
    }
  }, 30_000);

  it('keeps the descriptor FD callback synchronous, no-clobber, and private', () => {
    const state = privateStateFixture();
    const bytes = Buffer.from('{\n  "private": true\n}\n', 'utf8');
    let observed = '';
    try {
      expect(state.writeCanonicalNoClobberAndConsumeDescriptor({
        bytes,
        consume: descriptor => {
          observed = readFileSync(descriptor, 'utf8');
          return undefined;
        },
      })).toEqual({});
      expect(observed).toBe('{\n  "private": true\n}\n');
      expect(() => state.writeCanonicalNoClobberAndConsumeDescriptor({
        bytes: Buffer.from('{\n  "private": false\n}\n', 'utf8'),
        consume: () => undefined,
      })).toThrow();
    } finally {
      bytes.fill(0);
    }
  });

  it('rejects a caller-selected descriptor target before any private write', () => {
    const state = privateStateFixture();
    const bytes = Buffer.from('{"private":true}\n', 'utf8');
    try {
      expect(() => state.writeCanonicalNoClobberAndConsumeDescriptor({
        root: 'audit',
        relativePath: 'caller-selected.json',
        bytes,
        consume: () => undefined,
      } as never)).toThrow('SEALED_REALMS_PRIVATE_STATE_DESCRIPTOR_TARGET_INVALID');
      expect(state.exists({ root: 'audit', relativePath: 'caller-selected.json' })).toBe(false);
    } finally {
      bytes.fill(0);
    }
  });

  it('closes the descriptor FD after a callback throw or thenable result', () => {
    const thrownState = privateStateFixture();
    let thrownDescriptor = -1;
    const callbackFailure = new Error('consume failure');
    expect(() => thrownState.writeCanonicalNoClobberAndConsumeDescriptor({
      bytes: Buffer.from('{"private":true}\n', 'utf8'),
      consume: descriptor => {
        thrownDescriptor = descriptor;
        throw callbackFailure;
      },
    })).toThrow(callbackFailure);
    expect(() => readFileSync(thrownDescriptor)).toThrow();

    const thenableState = privateStateFixture();
    let thenableDescriptor = -1;
    expect(() => thenableState.writeCanonicalNoClobberAndConsumeDescriptor({
      bytes: Buffer.from('{"private":true}\n', 'utf8'),
      consume: descriptor => {
        thenableDescriptor = descriptor;
        return Promise.resolve() as never;
      },
    })).toThrow('SEALED_REALMS_PRIVATE_STATE_DESCRIPTOR_ASYNC_CONSUME');
    expect(() => readFileSync(thenableDescriptor)).toThrow();
  });

  it('allows only the fixed descriptor path to use its 1 MiB ceiling', () => {
    const genericState = privateStateFixture();
    const descriptorBytes = Buffer.alloc((512 * 1_024) + 1, 0x61);
    const oversizedDescriptor = Buffer.alloc((1 * 1_024 * 1_024) + 1, 0x62);
    try {
      expect(() => genericState.write({
        root: 'runtime',
        relativePath: 'activation-evidence/generic-stays-bounded.json',
        bytes: Buffer.from(descriptorBytes),
      })).toThrow('SEALED_REALMS_PRIVATE_STATE_BYTES_INVALID');
      let observedByteLength = 0;
      const descriptorState = privateStateFixture();
      expect(descriptorState.writeCanonicalNoClobberAndConsumeDescriptor({
        bytes: descriptorBytes,
        consume: descriptor => {
          observedByteLength = readFileSync(descriptor).byteLength;
          return undefined;
        },
      })).toEqual({});
      expect(observedByteLength).toBe(descriptorBytes.byteLength);
      const oversizedState = privateStateFixture();
      expect(() => oversizedState.writeCanonicalNoClobberAndConsumeDescriptor({
        bytes: oversizedDescriptor,
        consume: () => undefined,
      })).toThrow('SEALED_REALMS_PRIVATE_STATE_BYTES_INVALID');
    } finally {
      descriptorBytes.fill(0);
      oversizedDescriptor.fill(0);
    }
  });

  it('rejects a descriptor name replacement before it exposes the reopened FD', () => {
    let armed = false;
    let callbackCalled = false;
    const state = privateStateFixture({
      testOnlyRace: (phase, path) => {
        if (armed && phase === 'descriptor-after-open') {
          armed = false;
          renameSync(path, `${path}.displaced`);
          writeFileSync(path, '{"attacker":true}\n');
        }
      },
    });
    armed = true;
    expect(() => state.writeCanonicalNoClobberAndConsumeDescriptor({
      bytes: Buffer.from('{"private":true}\n', 'utf8'),
      consume: () => {
        callbackCalled = true;
        return undefined;
      },
    })).toThrow('SEALED_REALMS_PRIVATE_STATE_DESCRIPTOR_REPLACED');
    expect(callbackCalled).toBe(false);
  });

  it('rejects pre-existing and hard-link descriptor names without overwriting them', () => {
    for (const [basename, create] of [
      ['pre-existing', (target: string, _anchor: string) => writeFileSync(target, '{"old":true}\n')],
      ['hard-link', (target: string, anchor: string) => linkSync(anchor, target)],
    ] as const) {
      const state = privateStateFixture();
      const home = temporaryHomes.at(-1)!;
      const target = fixedDescriptorPath(home);
      const parent = runtimePath(home, 'activation-evidence');
      mkdirSync(parent, { recursive: true, mode: 0o700 });
      const anchor = join(parent, `${basename}-anchor.json`);
      writeFileSync(anchor, '{"anchor":true}\n', { mode: 0o600 });
      create(target, anchor);
      expect(() => state.writeCanonicalNoClobberAndConsumeDescriptor({
        bytes: Buffer.from('{"private":true}\n', 'utf8'),
        consume: () => undefined,
      })).toThrow('SEALED_REALMS_PRIVATE_STATE_FILE_EXISTS');
      expect(readFileSync(target, 'utf8')).not.toBe('{"private":true}\n');
    }
  });

  it.skipIf(process.platform === 'win32')(
    'rejects a pre-existing symlink descriptor name without overwriting it',
    () => {
      const state = privateStateFixture();
      const home = temporaryHomes.at(-1)!;
      const parent = runtimePath(home, 'activation-evidence');
      mkdirSync(parent, { recursive: true, mode: 0o700 });
      const anchor = join(parent, 'anchor.json');
      writeFileSync(anchor, '{"anchor":true}\n', { mode: 0o600 });
      const target = fixedDescriptorPath(home);
      symlinkSync(anchor, target);
      expect(() => state.writeCanonicalNoClobberAndConsumeDescriptor({
        bytes: Buffer.from('{"private":true}\n', 'utf8'),
        consume: () => undefined,
      })).toThrow('SEALED_REALMS_PRIVATE_STATE_FILE_EXISTS');
      expect(readFileSync(target, 'utf8')).toBe('{"anchor":true}\n');
    },
  );

  it('rejects a post-consume descriptor replacement before returning', () => {
    const state = privateStateFixture();
    const home = temporaryHomes.at(-1)!;
    const target = fixedDescriptorPath(home);
    expect(() => state.writeCanonicalNoClobberAndConsumeDescriptor({
      bytes: Buffer.from('{"private":true}\n', 'utf8'),
      consume: () => {
        renameSync(target, `${target}.displaced`);
        writeFileSync(target, '{"attacker":true}\n');
        return undefined;
      },
    })).toThrow('SEALED_REALMS_PRIVATE_STATE_DESCRIPTOR_REPLACED');
  });

  it('rejects a post-consume descriptor hard-link before returning', () => {
    const state = privateStateFixture();
    const home = temporaryHomes.at(-1)!;
    const target = fixedDescriptorPath(home);
    expect(() => state.writeCanonicalNoClobberAndConsumeDescriptor({
      bytes: Buffer.from('{"private":true}\n', 'utf8'),
      consume: () => {
        linkSync(target, `${target}.alias`);
        return undefined;
      },
    })).toThrow('SEALED_REALMS_PRIVATE_STATE_DESCRIPTOR_REPLACED');
  });

  it('preserves the PTR owner receipt import digest in its signed canonical body', () => {
    const receipt = {
      schemaVersion: 1,
      profile: 'warpkeep-ptr-owner-provision-v1',
      outcome: 'verified',
      databaseIdentity: '9'.repeat(64),
      databaseAlias: 'warpkeep-ptr',
      moduleIdentity: 'warpkeep-ptr-owner-view-v1',
      moduleSourceCommit: 'a'.repeat(40),
      atlasImportReceiptDigest: '2'.repeat(64),
      ownerOpaqueProofDigest: '0123456789abcdef'.repeat(4),
      ownerAnchorRows: 1,
      ownerProvisioned: true,
      ownerEnabled: true,
      zeroPopulationBoundary: true,
    } as const;
    const digest = ptrOwnerProvisionReceiptDigest(receipt);
    expect(digest).toMatch(/^[a-f0-9]{64}$/u);
    expect(ptrOwnerProvisionReceiptDigest({
      ...receipt,
      atlasImportReceiptDigest: '3'.repeat(64),
    })).not.toBe(digest);
  });
});
