// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  authBridgeNotificationPreparedDeployClosureTestSeams,
} from '../scripts/auth-bridge-notification-prepared-deploy-closure.mjs';

const seams = authBridgeNotificationPreparedDeployClosureTestSeams!;

function manifest(path: string): Buffer {
  return Buffer.from(`${JSON.stringify({
    schemaVersion: 2,
    profile: 'warpkeep-auth-bridge-notification-prepared-deploy-closure-v1',
    members: [{ path, digestProfile: 'raw-file-sha256-v1', sha256: 'a'.repeat(64) }],
  }, null, 2)}\n`);
}

describe('prepared source manifest PTR and observation verifier namespaces', () => {
  it.each([
    'spacetimedb/ptr/src/ownerPolicy.ts',
    'spacetimedb/ptr/package.json',
    'spacetimedb/ptr/pnpm-lock.yaml',
    'spacetimedb/ptr/tsconfig.json',
    'spacetimedb/ptr/.gitignore',
    'spacetimedb/ptr/generated-bindings/get_ptr_owner_status_v_1_procedure.ts',
    'services/release-recovery/src/config.ts',
    'services/release-recovery/src/crypto.ts',
    'services/release-recovery/src/http.ts',
    'services/release-recovery/src/protocol.ts',
    'services/release-recovery/src/ptrObservation.ts',
    'services/release-recovery/src/recoveryPublicKey.ts',
  ])('accepts protected source or explicitly allowed ABI: %s', path => {
    expect(seams.parseManifest(manifest(path))).toMatchObject({
      members: [{ path }],
    });
  });

  it.each([
    'spacetimedb/ptr/generated-bindings/private_admin_audit_table.ts',
    'spacetimedb/ptr/dist/bundle.ts',
    'spacetimedb/ptr/.env',
    'spacetimedb/ptr/src/../private.ts',
    'spacetimedb/ptr/src//ownerPolicy.ts',
    'services/release-recovery/src/signerPtrObservation.ts',
    'services/release-recovery/src/gateway.ts',
    'services/release-recovery/private/signing-key.jwk',
  ])('rejects an unapproved or noncanonical path: %s', path => {
    expect(() => seams.parseManifest(manifest(path)))
      .toThrow('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_MANIFEST_INVALID');
  });
});
