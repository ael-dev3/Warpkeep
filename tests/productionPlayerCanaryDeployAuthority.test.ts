// @vitest-environment node

import { createHash } from 'node:crypto';
import {
  chmodSync,
  linkSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  parseProductionPlayerCanaryActivationRequest,
  PRODUCTION_PLAYER_CANARY_DEPLOY_AUTHORITY_PROFILE,
  productionPlayerCanaryDeployAuthorityTestSeams,
} from '../scripts/production-player-canary-deploy-authority.mjs';

const seams = productionPlayerCanaryDeployAuthorityTestSeams!;

const request = Object.freeze({
  schemaVersion: 1,
  profile: PRODUCTION_PLAYER_CANARY_DEPLOY_AUTHORITY_PROFILE,
  candidatePagesSourceCommit: 'a'.repeat(40),
  predecessorPagesSourceCommit: 'b'.repeat(40),
  predecessorProtectedTree: 'c'.repeat(40),
  productionPlayerCanaryReceiptDigest: 'd'.repeat(64),
  founderPlanDirectory: '/private/production/founder-plans',
  reviewedAdmissionPlanReference: Object.freeze({
    filename: 'reviewed-founder-plan.json',
    sha256: 'e'.repeat(64),
  }),
  ownerApprovalDirectory: '/private/production/canary-approvals',
  ownerApprovalReference: Object.freeze({
    filename: 'owner-approval.json',
    sha256: 'f'.repeat(64),
  }),
});

describe('production player canary deploy authority', () => {
  it('accepts only the exact non-secret fixed-path activation descriptor schema', () => {
    expect(parseProductionPlayerCanaryActivationRequest(request)).toEqual(request);
    for (const mutation of [
      { ...request, candidatePagesSourceCommit: request.predecessorPagesSourceCommit },
      { ...request, predecessorProtectedTree: 'not-a-tree' },
      { ...request, founderPlanDirectory: 'relative/founder-plans' },
      { ...request, reviewedAdmissionPlanReference: {
        ...request.reviewedAdmissionPlanReference,
        filename: '../reviewed-founder-plan.json',
      } },
      { ...request, ownerApprovalReference: {
        ...request.ownerApprovalReference,
        sha256: '0'.repeat(63),
      } },
    ]) {
      expect(() => parseProductionPlayerCanaryActivationRequest(mutation))
        .toThrow('PRODUCTION_PLAYER_CANARY_ACTIVATION_REQUEST_INVALID');
    }
  });

  it.each([
    ['fid', '123'],
    ['adminSecret', 'private'],
    ['notificationOperatorSecret', 'private'],
    ['adminSecretPath', '/private/secret'],
    ['notificationSecretPath', '/private/secret'],
    ['bridgeUrl', 'https://auth.warpkeep.com'],
    ['database', 'production'],
    ['createdAt', '2026-08-13T12:00:00.000Z'],
  ])('rejects forbidden descriptor field %s', (field, value) => {
    expect(() => parseProductionPlayerCanaryActivationRequest({
      ...request,
      [field]: value,
    })).toThrow('PRODUCTION_PLAYER_CANARY_ACTIVATION_REQUEST_INVALID');
  });

  it('binds publication to freshly inspected plan and owner-approval references', () => {
    const inspectedPlan = {
      planDigest: request.reviewedAdmissionPlanReference.sha256,
      plan: {
        notificationPagesLiveReceiptDigest: '1'.repeat(64),
        notificationPagesLivePagesSourceCommit:
          request.predecessorPagesSourceCommit,
        notificationPagesLiveRootReceiptDigest: '2'.repeat(64),
        notificationPagesLiveRootPagesSourceCommit: '3'.repeat(40),
      },
    };
    const inspectedApproval = {
      artifactDigest: request.ownerApprovalReference.sha256,
      approval: {
        reviewedAdmissionPlanDigest:
          request.reviewedAdmissionPlanReference.sha256,
        protectedCommit: request.predecessorPagesSourceCommit,
        protectedTree: request.predecessorProtectedTree,
        predecessorLiveReceiptDigest: '1'.repeat(64),
        predecessorLiveRootReceiptDigest: '2'.repeat(64),
        predecessorLiveRootPagesSourceCommit: '3'.repeat(40),
      },
    };
    expect(seams.requireInspectedActivationRequestReferences(
      request,
      inspectedPlan,
      inspectedApproval,
    )).toEqual(request);
    expect(() => seams.requireInspectedActivationRequestReferences(
      request,
      inspectedPlan,
      {
        ...inspectedApproval,
        approval: {
          ...inspectedApproval.approval,
          protectedTree: '0'.repeat(40),
        },
      },
    )).toThrow('PRODUCTION_PLAYER_CANARY_ACTIVATION_REQUEST_REFERENCE_MISMATCH');
  });

  it('uses one post-evidence clock boundary for inspection and freshness', async () => {
    const boundary = new Date('2026-08-13T12:06:00.000Z');
    const authority = Object.freeze({ branded: true });
    const calls: string[] = [];
    await expect(seams.inspectActivationAfterEvidence({
      acquireEvidenceAuthority: async () => {
        calls.push('evidence');
        return {
          notificationPagesLiveReceiptDigest: '1'.repeat(64),
          notificationPagesLivePagesSourceCommit: '2'.repeat(40),
          notificationPagesLiveRootReceiptDigest: '3'.repeat(64),
          notificationPagesLiveRootPagesSourceCommit: '4'.repeat(40),
        };
      },
      activationInput: {},
      candidatePagesSourceCommit: '5'.repeat(40),
      predecessorPagesSourceCommit: '6'.repeat(40),
    }, {
      trustedClock: () => {
        calls.push('clock');
        return boundary;
      },
      inspectActivationAuthority: input => {
        calls.push('inspect');
        expect(input.now).toBe(boundary);
        return authority;
      },
      requireFreshActivationAuthority: (value, input) => {
        calls.push('fresh');
        expect(value).toBe(authority);
        expect(input.now).toBe(boundary.getTime());
      },
      activationAuthorityDigest: value => {
        calls.push('digest');
        expect(value).toBe(authority);
        return '7'.repeat(64);
      },
    })).resolves.toEqual({
      authority,
      authorityDigest: '7'.repeat(64),
    });
    expect(calls).toEqual(['evidence', 'clock', 'inspect', 'fresh', 'digest']);
  });

  it('publishes canonically without clobber and recovers exact hard-link crashes', () => {
    const stateDirectory = mkdtempSync(join(tmpdir(), 'warpkeep-canary-deploy-'));
    chmodSync(stateDirectory, 0o700);
    const destination = join(stateDirectory, 'activation-request-v1.json');
    const canonical = `${JSON.stringify(request, null, 2)}\n`;
    const expectedDigest = createHash('sha256').update(canonical).digest('hex');

    expect(seams.publishCanonicalRequest(stateDirectory, request)).toEqual({
      activationRequestDigest: expectedDigest,
    });
    expect(readFileSync(destination, 'utf8')).toBe(canonical);
    expect(lstatSync(destination).mode & 0o7777).toBe(0o600);
    expect(lstatSync(destination).nlink).toBe(1);
    const installed = lstatSync(destination, { bigint: true });

    expect(seams.publishCanonicalRequest(stateDirectory, request)).toEqual({
      activationRequestDigest: expectedDigest,
    });
    expect(lstatSync(destination, { bigint: true }).ino).toBe(installed.ino);

    const linkedCrash = join(
      stateDirectory,
      `.activation-request-v1.json.${'1'.repeat(32)}.tmp`,
    );
    linkSync(destination, linkedCrash);
    expect(lstatSync(destination).nlink).toBe(2);
    seams.publishCanonicalRequest(stateDirectory, request);
    expect(lstatSync(destination).nlink).toBe(1);
    expect(readdirSync(stateDirectory)).toEqual(['activation-request-v1.json']);

    const preinstallCrash = join(
      stateDirectory,
      `.activation-request-v1.json.${'2'.repeat(32)}.tmp`,
    );
    linkSync(destination, preinstallCrash);
    unlinkSync(destination);
    seams.publishCanonicalRequest(stateDirectory, request);
    expect(readFileSync(destination, 'utf8')).toBe(canonical);
    expect(lstatSync(destination).nlink).toBe(1);
    expect(readdirSync(stateDirectory)).toEqual(['activation-request-v1.json']);
  });

  it('preflights absent, installed, and recoverable publication states read-only', () => {
    const stateDirectory = mkdtempSync(join(tmpdir(), 'warpkeep-canary-preflight-'));
    chmodSync(stateDirectory, 0o700);
    const snapshot = () => readdirSync(stateDirectory).sort().map(name => {
      const path = join(stateDirectory, name);
      const status = lstatSync(path, { bigint: true });
      return {
        name,
        bytes: status.isFile() ? readFileSync(path).toString('base64') : null,
        ino: status.ino,
        mode: status.mode,
        nlink: status.nlink,
        mtimeNs: status.mtimeNs,
        ctimeNs: status.ctimeNs,
      };
    });
    const digest = createHash('sha256')
      .update(`${JSON.stringify(request, null, 2)}\n`)
      .digest('hex');
    expect(seams.preflightCanonicalRequestAtStateDirectory(
      stateDirectory,
      request,
    )).toEqual({ state: 'absent', activationRequestDigest: digest });
    expect(snapshot()).toEqual([]);

    seams.publishCanonicalRequest(stateDirectory, request);
    const installed = snapshot();
    expect(seams.preflightCanonicalRequestAtStateDirectory(
      stateDirectory,
      request,
    )).toEqual({ state: 'installed', activationRequestDigest: digest });
    expect(snapshot()).toEqual(installed);

    const destination = join(stateDirectory, 'activation-request-v1.json');
    const linkedCrash = join(
      stateDirectory,
      `.activation-request-v1.json.${'3'.repeat(32)}.tmp`,
    );
    linkSync(destination, linkedCrash);
    const recoverable = snapshot();
    expect(seams.preflightCanonicalRequestAtStateDirectory(
      stateDirectory,
      request,
    )).toEqual({ state: 'recoverable', activationRequestDigest: digest });
    expect(snapshot()).toEqual(recoverable);
  });

  it('detects every known conflict before the writer can create a directory or file', () => {
    const stateDirectory = mkdtempSync(join(tmpdir(), 'warpkeep-canary-preflight-'));
    chmodSync(stateDirectory, 0o700);
    const destination = join(stateDirectory, 'activation-request-v1.json');
    const conflicting = `${JSON.stringify({
      ...request,
      candidatePagesSourceCommit: '9'.repeat(40),
    }, null, 2)}\n`;
    writeFileSync(destination, conflicting, { mode: 0o600 });
    const before = readFileSync(destination);
    expect(() => seams.preflightCanonicalRequestAtStateDirectory(
      stateDirectory,
      request,
    )).toThrow('PRODUCTION_PLAYER_CANARY_ACTIVATION_REQUEST_CONFLICT');
    expect(readFileSync(destination)).toEqual(before);
    expect(readdirSync(stateDirectory)).toEqual(['activation-request-v1.json']);

    const source = readFileSync(
      join(process.cwd(), 'scripts/production-player-canary-deploy-authority.mjs'),
      'utf8',
    );
    const writer = source.slice(source.indexOf(
      'export async function writeProductionPlayerCanaryActivationRequest',
    ));
    expect(writer.indexOf(
      'preflightProductionPlayerCanaryActivationRequestPublication({ request });',
    )).toBeGreaterThanOrEqual(0);
    expect(writer.indexOf(
      'preflightProductionPlayerCanaryActivationRequestPublication({ request });',
    )).toBeLessThan(writer.indexOf(
      'const parent = ensureCanonicalProductionAdminStateDirectory();',
    ));
  });

  it('leaves a different installed request untouched', () => {
    const stateDirectory = mkdtempSync(join(tmpdir(), 'warpkeep-canary-conflict-'));
    chmodSync(stateDirectory, 0o700);
    const destination = join(stateDirectory, 'activation-request-v1.json');
    const conflicting = `${JSON.stringify({
      ...request,
      candidatePagesSourceCommit: '9'.repeat(40),
    }, null, 2)}\n`;
    writeFileSync(destination, conflicting, { mode: 0o600 });
    expect(() => seams.publishCanonicalRequest(stateDirectory, request))
      .toThrow('PRODUCTION_PLAYER_CANARY_ACTIVATION_REQUEST_CONFLICT');
    expect(readFileSync(destination, 'utf8')).toBe(conflicting);
  });
});
