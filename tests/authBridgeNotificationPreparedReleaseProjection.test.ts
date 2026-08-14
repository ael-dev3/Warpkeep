// @vitest-environment node

import { createHash } from 'node:crypto';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MANIFEST_PATH,
  AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MEMBER_PATHS,
  verifyAuthBridgeNotificationPreparedDeployClosure,
} from '../scripts/auth-bridge-notification-prepared-deploy-closure.mjs';
import {
  AUTH_BRIDGE_RELEASE_TRANSITION_FIXTURE_PATHS,
  canonicalAuthBridgeReleaseTransitionFixtureSource,
} from './helpers/authBridgeReleaseTransitionFixture';

const repositoryRoot = process.cwd();
const PROFILE = 'warpkeep-auth-bridge-notification-prepared-deploy-closure-v1';
const ZERO_SHA256 = '0'.repeat(64);
const RAW_FILE_DIGEST_PROFILE = 'raw-file-sha256-v1';
const BOOTSTRAP_PIN_DIGEST_PROFILE =
  'bootstrap-pin-projection-sha256-v1';
const REVIEWED_RELEASE_TRANSITION_DIGEST_PROFILE =
  'reviewed-release-transition-projection-sha256-v1';
const REVIEWED_RELEASE_TRANSITION_PLUS_BOOTSTRAP_PIN_DIGEST_PROFILE =
  'reviewed-release-transition-plus-bootstrap-pin-projection-sha256-v1';
const INERT_CLIENT_RELEASE_VERSION = '0.3.43';
const ACTIVE_CLIENT_RELEASE_VERSION = '0.3.44';
const INERT_FARCASTER_DESCRIPTION =
  'Command four Workers, gather resources and return to a permanent keep in Genesis 001. Invite-only Alpha.';
const ACTIVE_FARCASTER_DESCRIPTION =
  'Explore a six-region world foundation. The core gameplay loop remains incomplete; invite-only Alpha.';
const BOOTSTRAP_BINDINGS = Object.freeze([
  Object.freeze({
    name: 'WARPKEEP_PREPARED_SOURCE_CLOSURE_VERIFIER_SHA256',
    path: 'scripts/auth-bridge-notification-prepared-deploy-closure.mjs',
  }),
  Object.freeze({
    name: 'WARPKEEP_PREPARED_SOURCE_CLOSURE_MANIFEST_SHA256',
    path: AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MANIFEST_PATH,
  }),
  Object.freeze({
    name: 'WARPKEEP_PREPARED_INSTALLED_TOOLCHAIN_VERIFIER_SHA256',
    path: 'scripts/auth-bridge-notification-prepared-installed-toolchain.mjs',
  }),
  Object.freeze({
    name: 'WARPKEEP_PREPARED_INSTALLED_TOOLCHAIN_MANIFEST_SHA256',
    path:
      'scripts/auth-bridge-notification-prepared-installed-toolchain-darwin-arm64-v1.json',
  }),
  Object.freeze({
    name: 'WARPKEEP_NOTIFICATION_PAGES_PROTECTED_DEPLOY_LAUNCHER_SHA256',
    path: 'scripts/notification-pages-private-deploy-launcher.mjs',
  }),
]);
const BOOTSTRAP_WORKFLOWS = Object.freeze({
  '.github/workflows/deploy-pages.yml': Object.freeze({
    indentation: '  ',
    names: BOOTSTRAP_BINDINGS.map(binding => binding.name),
  }),
  '.github/workflows/notification-bridge-b0.yml': Object.freeze({
    indentation: '      ',
    names: BOOTSTRAP_BINDINGS.slice(0, 4).map(binding => binding.name),
  }),
  '.github/workflows/notification-bridge-prepared.yml': Object.freeze({
    indentation: '      ',
    names: BOOTSTRAP_BINDINGS.slice(0, 4).map(binding => binding.name),
  }),
});
const REVIEWED_RELEASE_TRANSITION_PATHS =
  AUTH_BRIDGE_RELEASE_TRANSITION_FIXTURE_PATHS;
const RETAINED_TYPE_ONLY_DECLARATION_PATHS = Object.freeze([
  'scripts/production-player-canary-activation-launcher.d.mts',
  'scripts/production-player-canary-browser-launcher.d.mts',
  'scripts/production-player-canary-release-binding.d.mts',
]);
const temporaryDirectories: string[] = [];

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function replaceOnly(source: string, before: string, after: string): string {
  if (source.split(before).length !== 2) {
    throw new Error(`fixture source did not contain exactly one ${before}`);
  }
  return source.replace(before, after);
}

function replaceFile(root: string, relativePath: string, before: string, after: string): void {
  const path = resolve(root, relativePath);
  writeFileSync(path, replaceOnly(readFileSync(path, 'utf8'), before, after));
}

function canonicalBootstrapWorkflow(relativePath: string, source: string): string {
  const releaseCanonical = canonicalAuthBridgeReleaseTransitionFixtureSource(
    relativePath,
    source,
  );
  const workflow = BOOTSTRAP_WORKFLOWS[
    relativePath as keyof typeof BOOTSTRAP_WORKFLOWS
  ];
  if (workflow === undefined) return releaseCanonical;
  let canonical = releaseCanonical;
  for (const name of workflow.names) {
    const pattern = new RegExp(
      `^${workflow.indentation}${name}: '[a-f0-9]{64}'$`,
      'gmu',
    );
    if ([...canonical.matchAll(pattern)].length !== 1) {
      throw new Error(`fixture bootstrap pin ${name} was not exact`);
    }
    canonical = canonical.replace(
      pattern,
      `${workflow.indentation}${name}: '${ZERO_SHA256}'`,
    );
  }
  return canonical;
}

function digestProfileForPath(relativePath: string): string {
  if (
    REVIEWED_RELEASE_TRANSITION_PATHS.has(relativePath)
    && relativePath in BOOTSTRAP_WORKFLOWS
  ) {
    return REVIEWED_RELEASE_TRANSITION_PLUS_BOOTSTRAP_PIN_DIGEST_PROFILE;
  }
  if (REVIEWED_RELEASE_TRANSITION_PATHS.has(relativePath)) {
    return REVIEWED_RELEASE_TRANSITION_DIGEST_PROFILE;
  }
  if (relativePath in BOOTSTRAP_WORKFLOWS) {
    return BOOTSTRAP_PIN_DIGEST_PROFILE;
  }
  return RAW_FILE_DIGEST_PROFILE;
}

function createTransitionFixture(sourcePhase = 0): string {
  const root = realpathSync(mkdtempSync(join(
    tmpdir(),
    'warpkeep-release-transition-closure-',
  )));
  temporaryDirectories.push(root);
  for (const relativePath of AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MEMBER_PATHS) {
    const destination = resolve(root, relativePath);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(resolve(repositoryRoot, relativePath), destination);
  }
  for (const relativePath of RETAINED_TYPE_ONLY_DECLARATION_PATHS) {
    const destination = resolve(root, relativePath);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(resolve(repositoryRoot, relativePath), destination);
  }
  for (const relativePath of REVIEWED_RELEASE_TRANSITION_PATHS) {
    const path = resolve(root, relativePath);
    writeFileSync(
      path,
      canonicalAuthBridgeReleaseTransitionFixtureSource(
        relativePath,
        readFileSync(path, 'utf8'),
      ),
    );
  }
  advanceFixtureSourceToPhase(root, sourcePhase);
  for (const relativePath of REVIEWED_RELEASE_TRANSITION_PATHS) {
    const path = resolve(root, relativePath);
    writeFileSync(
      path,
      canonicalAuthBridgeReleaseTransitionFixtureSource(
        relativePath,
        readFileSync(path, 'utf8'),
      ),
    );
  }
  const manifest = {
    schemaVersion: 2,
    profile: PROFILE,
    members: AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MEMBER_PATHS.map(
      relativePath => ({
        path: relativePath,
        digestProfile: digestProfileForPath(relativePath),
        sha256: sha256(canonicalBootstrapWorkflow(
          relativePath,
          readFileSync(resolve(root, relativePath), 'utf8'),
        )),
      }),
    ),
  };
  const manifestPath = resolve(
    root,
    AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MANIFEST_PATH,
  );
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const pinValues = new Map(BOOTSTRAP_BINDINGS.map(binding => [
    binding.name,
    binding.path === AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MANIFEST_PATH
      ? sha256(readFileSync(manifestPath))
      : sha256(readFileSync(resolve(root, binding.path))),
  ]));
  for (const [relativePath, workflow] of Object.entries(BOOTSTRAP_WORKFLOWS)) {
    const path = resolve(root, relativePath);
    let source = readFileSync(path, 'utf8');
    for (const name of workflow.names) {
      const current = source.match(new RegExp(
        `^${workflow.indentation}${name}: '([a-f0-9]{64})'$`,
        'mu',
      ))?.[1];
      const expected = pinValues.get(name);
      if (current === undefined || expected === undefined) {
        throw new Error(`fixture bootstrap pin ${name} was unavailable`);
      }
      source = replaceOnly(source, current, expected);
    }
    writeFileSync(path, source);
  }
  return root;
}

function verify(root: string) {
  return verifyAuthBridgeNotificationPreparedDeployClosure({ repositoryRoot: root });
}

function setPublisherFlag(root: string, name: string, value: boolean): void {
  replaceFile(
    root,
    'scripts/greater-realm-production-publisher-core.ts',
    `  ${name}: ${value ? 'false' : 'true'},`,
    `  ${name}: ${value ? 'true' : 'false'},`,
  );
}

function setDownstreamFlag(root: string, name: string, value: boolean): void {
  replaceFile(
    root,
    'scripts/greater-realm-downstream-release-policy.ts',
    `  ${name}: ${value ? 'false' : 'true'},`,
    `  ${name}: ${value ? 'true' : 'false'},`,
  );
}

function setClientReleaseIdentity(root: string, active: boolean): void {
  const beforeVersion = active
    ? INERT_CLIENT_RELEASE_VERSION
    : ACTIVE_CLIENT_RELEASE_VERSION;
  const afterVersion = active
    ? ACTIVE_CLIENT_RELEASE_VERSION
    : INERT_CLIENT_RELEASE_VERSION;
  const beforeDescription = active
    ? INERT_FARCASTER_DESCRIPTION
    : ACTIVE_FARCASTER_DESCRIPTION;
  const afterDescription = active
    ? ACTIVE_FARCASTER_DESCRIPTION
    : INERT_FARCASTER_DESCRIPTION;
  replaceFile(
    root,
    'package.json',
    `  "version": "${beforeVersion}",`,
    `  "version": "${afterVersion}",`,
  );
  replaceFile(
    root,
    'package-lock.json',
    `  "version": "${beforeVersion}",\n`
      + '  "lockfileVersion": 3,\n'
      + '  "requires": true,\n'
      + '  "packages": {\n'
      + '    "": {\n'
      + '      "name": "warpkeep",\n'
      + `      "version": "${beforeVersion}",`,
    `  "version": "${afterVersion}",\n`
      + '  "lockfileVersion": 3,\n'
      + '  "requires": true,\n'
      + '  "packages": {\n'
      + '    "": {\n'
      + '      "name": "warpkeep",\n'
      + `      "version": "${afterVersion}",`,
  );
  replaceFile(
    root,
    'scripts/farcaster-miniapp-contract.mjs',
    `  description:\n    '${beforeDescription}',`,
    `  description:\n    '${afterDescription}',`,
  );
  replaceFile(
    root,
    'public/.well-known/farcaster.json',
    `    "description": "${beforeDescription}",`,
    `    "description": "${afterDescription}",`,
  );
}

function advanceToActivationOnlyPhase(root: string): void {
  setPublisherFlag(root, 'entryAgreementApproved', true);
  setPublisherFlag(root, 'additivePublishApproved', true);
  replaceFile(
    root,
    'spacetimedb/src/greaterRealmV17Policy.ts',
    'export const GREATER_REALM_V17_ACTIVATION_MUTATIONS_ALLOWED = false;',
    'export const GREATER_REALM_V17_ACTIVATION_MUTATIONS_ALLOWED = true;',
  );
  setPublisherFlag(root, 'activationForwardFixApproved', true);
}

function activateClientIdentity(root: string): void {
  setClientReleaseIdentity(root, true);
  setDownstreamFlag(root, 'clientActivationApproved', true);
  replaceFile(
    root,
    'src/spacetime/greaterRealmProviderBridge.ts',
    'export const GREATER_REALM_CLIENT_PRESENTATION_ALLOWED = false as const;',
    'export const GREATER_REALM_CLIENT_PRESENTATION_ALLOWED = true as const;',
  );
  replaceFile(
    root,
    'src/greater-realm/greaterRealmTransport.ts',
    'export const GREATER_REALM_SERVER_PRESENTATION_ALLOWED = false as const;',
    'export const GREATER_REALM_SERVER_PRESENTATION_ALLOWED = true as const;',
  );
}

function advanceFixtureSourceToPhase(root: string, phase: number): void {
  if (!Number.isSafeInteger(phase) || phase < 0 || phase > 7) {
    throw new Error('fixture release phase was invalid');
  }
  if (phase === 0) return;
  setPublisherFlag(root, 'entryAgreementApproved', true);
  setPublisherFlag(root, 'additivePublishApproved', true);
  if (phase === 1) return;
  if (phase === 2) {
    replaceFile(
      root,
      'spacetimedb/src/greaterRealmV17Policy.ts',
      'export const GREATER_REALM_V17_IMPORT_MUTATIONS_ALLOWED = false;',
      'export const GREATER_REALM_V17_IMPORT_MUTATIONS_ALLOWED = true;',
    );
    setPublisherFlag(root, 'importForwardFixApproved', true);
    return;
  }
  replaceFile(
    root,
    'spacetimedb/src/greaterRealmV17Policy.ts',
    'export const GREATER_REALM_V17_ACTIVATION_MUTATIONS_ALLOWED = false;',
    'export const GREATER_REALM_V17_ACTIVATION_MUTATIONS_ALLOWED = true;',
  );
  setPublisherFlag(root, 'activationForwardFixApproved', true);
  if (phase === 3) return;
  // C4-C6 bring notification presentation, its durable root, and Hermes live
  // while the Greater Realm world client remains the inert 0.3.43 identity.
  setDownstreamFlag(root, 'admissionNotificationsApproved', true);
  replaceFile(
    root,
    '.github/workflows/deploy-pages.yml',
    "      VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED: 'false'",
    "      VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED: 'true'",
  );
  replaceFile(
    root,
    'scripts/auth-bridge-notification-prepared-release-binding.mjs',
    '  notificationPreparedReceiptDigest: null,\n'
      + '  notificationPreparedBridgeSourceCommit: null,',
    `  notificationPreparedReceiptDigest: '${'a'.repeat(64)}',\n`
      + `  notificationPreparedBridgeSourceCommit: '${'b'.repeat(40)}',`,
  );
  replaceFile(
    root,
    'scripts/notification-pages-private-release-binding.mjs',
    '  notificationPagesActiveV17EvidenceDigest: null,\n'
      + '  notificationPagesDeployedModuleReceiptDigest: null,\n'
      + '  notificationPagesExpectedFounderCount: null,',
    `  notificationPagesActiveV17EvidenceDigest: '${'c'.repeat(64)}',\n`
      + `  notificationPagesDeployedModuleReceiptDigest: '${'d'.repeat(64)}',\n`
      + '  notificationPagesExpectedFounderCount: 417,',
  );
  if (phase === 4) return;
  replaceFile(
    root,
    'scripts/auth-bridge-notification-prepared-release-binding.mjs',
    `  notificationPreparedReceiptDigest: '${'a'.repeat(64)}',\n`
      + `  notificationPreparedBridgeSourceCommit: '${'b'.repeat(40)}',`,
    '  notificationPreparedReceiptDigest: null,\n'
      + '  notificationPreparedBridgeSourceCommit: null,',
  );
  replaceFile(
    root,
    'scripts/notification-pages-private-release-binding.mjs',
    `  notificationPagesActiveV17EvidenceDigest: '${'c'.repeat(64)}',\n`
      + `  notificationPagesDeployedModuleReceiptDigest: '${'d'.repeat(64)}',\n`
      + '  notificationPagesExpectedFounderCount: 417,',
    '  notificationPagesActiveV17EvidenceDigest: null,\n'
      + '  notificationPagesDeployedModuleReceiptDigest: null,\n'
      + '  notificationPagesExpectedFounderCount: null,',
  );
  replaceFile(
    root,
    'scripts/notification-pages-live-release-binding.mjs',
    '  notificationPagesLiveRootReceiptDigest: null,\n'
      + '  notificationPagesLiveRootPagesSourceCommit: null,',
    `  notificationPagesLiveRootReceiptDigest: '${'e'.repeat(64)}',\n`
      + `  notificationPagesLiveRootPagesSourceCommit: '${'f'.repeat(40)}',`,
  );
  if (phase === 5) return;
  replaceFile(
    root,
    'scripts/hermes-admin.ts',
    'export const FOUNDER_ADMISSION_NOTIFICATION_DELIVERY_APPROVED = false as const;',
    'export const FOUNDER_ADMISSION_NOTIFICATION_DELIVERY_APPROVED = true as const;',
  );
  if (phase === 6) return;
  replaceFile(
    root,
    'scripts/production-player-canary-release-binding.mjs',
    '  productionPlayerCanaryReceiptDigest: null,\n'
      + '  productionPlayerCanarySourceCommit: null,',
    `  productionPlayerCanaryReceiptDigest: '${'1'.repeat(64)}',\n`
      + `  productionPlayerCanarySourceCommit: '${'2'.repeat(40)}',`,
  );
  activateClientIdentity(root);
}

afterEach(() => {
  for (const path of temporaryDirectories.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe('auth-bridge reviewed release-transition source projection', () => {
  it('constructs the same C0 authority from every reviewed checkout phase', () => {
    const manifestDigests = new Set<string>();
    for (let phase = 0; phase <= 7; phase += 1) {
      const root = createTransitionFixture(phase);
      const authority = verify(root);
      expect(authority.memberCount).toBe(384);
      manifestDigests.add(authority.manifestSha256);
      for (const relativePath of REVIEWED_RELEASE_TRANSITION_PATHS) {
        const source = readFileSync(resolve(root, relativePath), 'utf8');
        expect(
          canonicalAuthBridgeReleaseTransitionFixtureSource(relativePath, source),
          `${relativePath} at simulated C${phase}`,
        ).toBe(source);
      }
    }
    expect(manifestDigests.size).toBe(1);
  }, 180_000);

  it('retains one closure authority through every exact reviewed phase', () => {
    const root = createTransitionFixture();
    const baseline = verify(root);
    expect(baseline.memberCount).toBe(384);
    const expectActiveIdentityRejectedBeforeActivation = (): void => {
      setClientReleaseIdentity(root, true);
      expect(() => verify(root)).toThrow(
        'AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_RELEASE_PHASE_INVALID',
      );
      setClientReleaseIdentity(root, false);
    };
    const expectInertIdentityRejectedAfterActivation = (): void => {
      setClientReleaseIdentity(root, false);
      expect(() => verify(root)).toThrow(
        'AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_RELEASE_PHASE_INVALID',
      );
      setClientReleaseIdentity(root, true);
    };

    // C0 cannot publish the activation-client identity.
    expectActiveIdentityRejectedBeforeActivation();

    setPublisherFlag(root, 'entryAgreementApproved', true);
    setPublisherFlag(root, 'additivePublishApproved', true);
    expect(verify(root).manifestSha256).toBe(baseline.manifestSha256);
    // C1 remains inert even after the reviewed append is approved.
    expectActiveIdentityRejectedBeforeActivation();

    replaceFile(
      root,
      'spacetimedb/src/greaterRealmV17Policy.ts',
      'export const GREATER_REALM_V17_IMPORT_MUTATIONS_ALLOWED = false;',
      'export const GREATER_REALM_V17_IMPORT_MUTATIONS_ALLOWED = true;',
    );
    setPublisherFlag(root, 'importForwardFixApproved', true);
    expect(verify(root).manifestSha256).toBe(baseline.manifestSha256);
    // C2 import-only authority does not publish a client release.
    expectActiveIdentityRejectedBeforeActivation();

    replaceFile(
      root,
      'spacetimedb/src/greaterRealmV17Policy.ts',
      'export const GREATER_REALM_V17_IMPORT_MUTATIONS_ALLOWED = true;',
      'export const GREATER_REALM_V17_IMPORT_MUTATIONS_ALLOWED = false;',
    );
    replaceFile(
      root,
      'spacetimedb/src/greaterRealmV17Policy.ts',
      'export const GREATER_REALM_V17_ACTIVATION_MUTATIONS_ALLOWED = false;',
      'export const GREATER_REALM_V17_ACTIVATION_MUTATIONS_ALLOWED = true;',
    );
    setPublisherFlag(root, 'importForwardFixApproved', false);
    setPublisherFlag(root, 'activationForwardFixApproved', true);
    expect(verify(root).manifestSha256).toBe(baseline.manifestSha256);
    // C3 activation-only authority still requires the inert identity.
    expectActiveIdentityRejectedBeforeActivation();

    setDownstreamFlag(root, 'admissionNotificationsApproved', true);
    replaceFile(
      root,
      '.github/workflows/deploy-pages.yml',
      "      VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED: 'false'",
      "      VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED: 'true'",
    );
    replaceFile(
      root,
      'scripts/auth-bridge-notification-prepared-release-binding.mjs',
      '  notificationPreparedReceiptDigest: null,\n'
        + '  notificationPreparedBridgeSourceCommit: null,',
      `  notificationPreparedReceiptDigest: '${'a'.repeat(64)}',\n`
        + `  notificationPreparedBridgeSourceCommit: '${'b'.repeat(40)}',`,
    );
    replaceFile(
      root,
      'scripts/notification-pages-private-release-binding.mjs',
      '  notificationPagesActiveV17EvidenceDigest: null,\n'
        + '  notificationPagesDeployedModuleReceiptDigest: null,\n'
        + '  notificationPagesExpectedFounderCount: null,',
      `  notificationPagesActiveV17EvidenceDigest: '${'c'.repeat(64)}',\n`
        + `  notificationPagesDeployedModuleReceiptDigest: '${'d'.repeat(64)}',\n`
        + '  notificationPagesExpectedFounderCount: 417,',
    );
    expect(verify(root).manifestSha256).toBe(baseline.manifestSha256);
    expectActiveIdentityRejectedBeforeActivation();

    replaceFile(
      root,
      'scripts/auth-bridge-notification-prepared-release-binding.mjs',
      `  notificationPreparedReceiptDigest: '${'a'.repeat(64)}',\n`
        + `  notificationPreparedBridgeSourceCommit: '${'b'.repeat(40)}',`,
      '  notificationPreparedReceiptDigest: null,\n'
        + '  notificationPreparedBridgeSourceCommit: null,',
    );
    replaceFile(
      root,
      'scripts/notification-pages-private-release-binding.mjs',
      `  notificationPagesActiveV17EvidenceDigest: '${'c'.repeat(64)}',\n`
        + `  notificationPagesDeployedModuleReceiptDigest: '${'d'.repeat(64)}',\n`
        + '  notificationPagesExpectedFounderCount: 417,',
      '  notificationPagesActiveV17EvidenceDigest: null,\n'
        + '  notificationPagesDeployedModuleReceiptDigest: null,\n'
        + '  notificationPagesExpectedFounderCount: null,',
    );
    replaceFile(
      root,
      'scripts/notification-pages-live-release-binding.mjs',
      '  notificationPagesLiveRootReceiptDigest: null,\n'
        + '  notificationPagesLiveRootPagesSourceCommit: null,',
      `  notificationPagesLiveRootReceiptDigest: '${'e'.repeat(64)}',\n`
        + `  notificationPagesLiveRootPagesSourceCommit: '${'f'.repeat(40)}',`,
    );
    expect(verify(root).manifestSha256).toBe(baseline.manifestSha256);
    expectActiveIdentityRejectedBeforeActivation();

    replaceFile(
      root,
      'scripts/hermes-admin.ts',
      'export const FOUNDER_ADMISSION_NOTIFICATION_DELIVERY_APPROVED = false as const;',
      'export const FOUNDER_ADMISSION_NOTIFICATION_DELIVERY_APPROVED = true as const;',
    );
    expect(verify(root).manifestSha256).toBe(baseline.manifestSha256);
    expectActiveIdentityRejectedBeforeActivation();

    replaceFile(
      root,
      'scripts/production-player-canary-release-binding.mjs',
      '  productionPlayerCanaryReceiptDigest: null,\n'
        + '  productionPlayerCanarySourceCommit: null,',
      `  productionPlayerCanaryReceiptDigest: '${'1'.repeat(64)}',\n`
        + `  productionPlayerCanarySourceCommit: '${'2'.repeat(40)}',`,
    );
    // A canary binding cannot activate presentation on its own.
    expect(() => verify(root)).toThrow(
      'AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_RELEASE_PHASE_INVALID',
    );

    activateClientIdentity(root);
    expect(verify(root).manifestSha256).toBe(baseline.manifestSha256);
    expectInertIdentityRejectedAfterActivation();
  }, 120_000);

  it('rejects impossible tuples, nonliteral drift, extra bytes, and declaration drift', () => {
    const root = createTransitionFixture();
    const expectMutationRejected = (
      relativePath: string,
      mutate: (source: string) => string,
      code: string,
    ): void => {
      const path = resolve(root, relativePath);
      const source = readFileSync(path, 'utf8');
      try {
        writeFileSync(path, mutate(source));
        expect(() => verify(root)).toThrow(code);
      } finally {
        writeFileSync(path, source);
      }
    };

    expectMutationRejected(
      'spacetimedb/src/greaterRealmV17Policy.ts',
      source => source
        .replace(
          'GREATER_REALM_V17_IMPORT_MUTATIONS_ALLOWED = false',
          'GREATER_REALM_V17_IMPORT_MUTATIONS_ALLOWED = true',
        )
        .replace(
          'GREATER_REALM_V17_ACTIVATION_MUTATIONS_ALLOWED = false',
          'GREATER_REALM_V17_ACTIVATION_MUTATIONS_ALLOWED = true',
        ),
      'AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_RELEASE_PHASE_INVALID',
    );
    expectMutationRejected(
      'scripts/greater-realm-production-publisher-core.ts',
      source => source.replace(
        '  entryAgreementApproved: false,',
        '  entryAgreementApproved: true,',
      ),
      'AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_RELEASE_PHASE_INVALID',
    );
    expectMutationRejected(
      'scripts/greater-realm-production-publisher-core.ts',
      source => source.replace(
        '  clientActivationApproved: false,',
        '  clientActivationApproved: true,',
      ),
      'AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_RELEASE_PHASE_INVALID',
    );
    expectMutationRejected(
      'scripts/greater-realm-downstream-release-policy.ts',
      source => source.replace(
        '  admissionNotificationsApproved: false,',
        '  admissionNotificationsApproved: true,',
      ),
      'AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_RELEASE_PHASE_INVALID',
    );
    expectMutationRejected(
      'src/spacetime/greaterRealmProviderBridge.ts',
      source => source.replace(
        'GREATER_REALM_CLIENT_PRESENTATION_ALLOWED = false',
        'GREATER_REALM_CLIENT_PRESENTATION_ALLOWED = true',
      ),
      'AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_RELEASE_PHASE_INVALID',
    );
    expectMutationRejected(
      'spacetimedb/src/greaterRealmV17Policy.ts',
      source => source.replace(
        'GREATER_REALM_V17_IMPORT_MUTATIONS_ALLOWED = false;',
        'GREATER_REALM_V17_IMPORT_MUTATIONS_ALLOWED = Boolean(false);',
      ),
      'AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_RELEASE_SOURCE_INVALID',
    );
    expectMutationRejected(
      'scripts/auth-bridge-notification-prepared-release-binding.mjs',
      source => source.replace(
        'notificationPreparedReceiptDigest: null',
        `notificationPreparedReceiptDigest: '${'a'.repeat(64)}'`,
      ),
      'AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_RELEASE_SOURCE_INVALID',
    );
    expectMutationRejected(
      'scripts/production-player-canary-release-binding.mjs',
      source => source.replace(
        'productionPlayerCanaryReceiptDigest: null',
        `productionPlayerCanaryReceiptDigest: '${'1'.repeat(64)}'`,
      ),
      'AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_RELEASE_SOURCE_INVALID',
    );
    expectMutationRejected(
      'spacetimedb/src/greaterRealmV17Policy.ts',
      source => `${source}\n`,
      'AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_DIGEST_MISMATCH',
    );
    expectMutationRejected(
      'scripts/notification-pages-live-release-binding.d.mts',
      source => `${source}\n`,
      'AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_DIGEST_MISMATCH',
    );
    const retainedDeclaration =
      'scripts/production-player-canary-release-binding.d.mts';
    expect(AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MEMBER_PATHS)
      .not.toContain(retainedDeclaration);
    const retainedDeclarationPath = resolve(root, retainedDeclaration);
    const retainedDeclarationSource = readFileSync(
      retainedDeclarationPath,
      'utf8',
    );
    const baselineManifestSha256 = verify(root).manifestSha256;
    try {
      writeFileSync(retainedDeclarationPath, `${retainedDeclarationSource}\n`);
      expect(verify(root).manifestSha256).toBe(baselineManifestSha256);
    } finally {
      writeFileSync(retainedDeclarationPath, retainedDeclarationSource);
    }
  }, 120_000);

  it('rejects every partial or mismatched activation-client identity', () => {
    const root = createTransitionFixture();
    advanceToActivationOnlyPhase(root);
    setDownstreamFlag(root, 'admissionNotificationsApproved', true);
    replaceFile(
      root,
      '.github/workflows/deploy-pages.yml',
      "      VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED: 'false'",
      "      VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED: 'true'",
    );
    replaceFile(
      root,
      'scripts/notification-pages-live-release-binding.mjs',
      '  notificationPagesLiveRootReceiptDigest: null,\n'
        + '  notificationPagesLiveRootPagesSourceCommit: null,',
      `  notificationPagesLiveRootReceiptDigest: '${'e'.repeat(64)}',\n`
        + `  notificationPagesLiveRootPagesSourceCommit: '${'f'.repeat(40)}',`,
    );
    replaceFile(
      root,
      'scripts/hermes-admin.ts',
      'export const FOUNDER_ADMISSION_NOTIFICATION_DELIVERY_APPROVED = false as const;',
      'export const FOUNDER_ADMISSION_NOTIFICATION_DELIVERY_APPROVED = true as const;',
    );
    activateClientIdentity(root);
    const expectIdentityMutationRejected = (
      relativePath: string,
      before: string,
      after: string,
      code = 'AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_RELEASE_PHASE_INVALID',
    ): void => {
      replaceFile(root, relativePath, before, after);
      expect(() => verify(root)).toThrow(code);
      replaceFile(root, relativePath, after, before);
    };

    replaceFile(
      root,
      'scripts/production-player-canary-release-binding.mjs',
      '  productionPlayerCanaryReceiptDigest: null,\n'
        + '  productionPlayerCanarySourceCommit: null,',
      `  productionPlayerCanaryReceiptDigest: '${'1'.repeat(64)}',\n`
        + `  productionPlayerCanarySourceCommit: '${'2'.repeat(40)}',`,
    );
    expect(verify(root).memberCount).toBe(384);
    expectIdentityMutationRejected(
      'package.json',
      '  "version": "0.3.44",',
      '  "version": "0.3.43",',
    );
    expectIdentityMutationRejected(
      'package-lock.json',
      '  "version": "0.3.44",\n  "lockfileVersion": 3,',
      '  "version": "0.3.43",\n  "lockfileVersion": 3,',
      'AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_RELEASE_SOURCE_INVALID',
    );
    expectIdentityMutationRejected(
      'package-lock.json',
      '      "version": "0.3.44",',
      '      "version": "0.3.43",',
      'AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_RELEASE_SOURCE_INVALID',
    );
    expectIdentityMutationRejected(
      'scripts/farcaster-miniapp-contract.mjs',
      `  description:\n    '${ACTIVE_FARCASTER_DESCRIPTION}',`,
      `  description:\n    '${INERT_FARCASTER_DESCRIPTION}',`,
    );
    expectIdentityMutationRejected(
      'public/.well-known/farcaster.json',
      `    "description": "${ACTIVE_FARCASTER_DESCRIPTION}",`,
      `    "description": "${INERT_FARCASTER_DESCRIPTION}",`,
    );
  }, 120_000);

  it('rejects unsupported versions, decoys, arbitrary Mini App text, and other bytes', () => {
    const root = createTransitionFixture();
    const expectMutationRejected = (
      relativePath: string,
      mutate: (source: string) => string,
      code: string,
    ): void => {
      const path = resolve(root, relativePath);
      const source = readFileSync(path, 'utf8');
      try {
        writeFileSync(path, mutate(source));
        expect(() => verify(root)).toThrow(code);
      } finally {
        writeFileSync(path, source);
      }
    };
    for (const version of ['0.4.0', '0.3.45', '0.3.44-alpha.1']) {
      expectMutationRejected(
        'package.json',
        source => source.replace('"version": "0.3.43"', `"version": "${version}"`),
        'AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_RELEASE_SOURCE_INVALID',
      );
    }
    expectMutationRejected(
      'package.json',
      source => source.replace(
        '  "private": true,',
        '  "private": true,\n  "version": "0.3.44",',
      ),
      'AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_RELEASE_SOURCE_INVALID',
    );
    expectMutationRejected(
      'package-lock.json',
      source => source.replace(
        '  "lockfileVersion": 3,',
        '  "version": "0.3.44",\n  "lockfileVersion": 3,',
      ),
      'AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_RELEASE_SOURCE_INVALID',
    );
    expectMutationRejected(
      'scripts/farcaster-miniapp-contract.mjs',
      source => source.replace(
        `    '${INERT_FARCASTER_DESCRIPTION}',`,
        "    'THE GREATER REALM OPENS. Invite-only Alpha.',",
      ),
      'AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_RELEASE_SOURCE_INVALID',
    );
    expectMutationRejected(
      'scripts/farcaster-miniapp-contract.mjs',
      source => source.replace(
        "  subtitle: 'Persistent Farcaster strategy',",
        "  subtitle: 'Explore the Greater Realm',",
      ),
      'AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_DIGEST_MISMATCH',
    );
    expectMutationRejected(
      'public/.well-known/farcaster.json',
      source => source.replace(
        '    "subtitle": "Persistent Farcaster strategy",',
        '    "subtitle": "Explore the Greater Realm",',
      ),
      'AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_DIGEST_MISMATCH',
    );
    expectMutationRejected(
      'public/.well-known/farcaster.json',
      source => source.replace(
        `    "description": "${INERT_FARCASTER_DESCRIPTION}",`,
        `    "description": "${INERT_FARCASTER_DESCRIPTION}",\n`
          + `    "description": "${ACTIVE_FARCASTER_DESCRIPTION}",`,
      ),
      'AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_RELEASE_SOURCE_INVALID',
    );
  }, 120_000);

  it('keeps Pages bootstrap pins exact after activation-client projection', () => {
    const root = createTransitionFixture(7);
    expect(verify(root).memberCount).toBe(384);
    const path = resolve(root, '.github/workflows/deploy-pages.yml');
    const source = readFileSync(path, 'utf8');
    const name = 'WARPKEEP_PREPARED_SOURCE_CLOSURE_VERIFIER_SHA256';
    const match = source.match(new RegExp(
      `^  ${name}: '([a-f0-9]{64})'$`,
      'mu',
    ));
    if (match === null) throw new Error('fixture Pages pin missing');
    const digest = match[1];
    writeFileSync(path, source.replace(
      digest,
      `${digest.slice(0, -1)}${digest.endsWith('0') ? '1' : '0'}`,
    ));
    expect(() => verify(root)).toThrow(
      'AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_BOOTSTRAP_INVALID',
    );
    writeFileSync(path, source.replace(
      `  ${name}: '${digest}'`,
      `  ${name}: '${digest}'\n  ${name}: '${digest}'`,
    ));
    expect(() => verify(root)).toThrow(
      'AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_BOOTSTRAP_INVALID',
    );
  }, 120_000);

  it('binds every schema-v2 digest profile to its exact member path', () => {
    const expectManifestRejected = (
      mutate: (manifest: {
        schemaVersion: number;
        profile: string;
        members: Array<{
          path: string;
          digestProfile?: string;
          sha256: string;
        }>;
      }) => void,
    ): void => {
      const root = createTransitionFixture();
      const path = resolve(
        root,
        AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MANIFEST_PATH,
      );
      const manifest = JSON.parse(readFileSync(path, 'utf8')) as {
        schemaVersion: number;
        profile: string;
        members: Array<{
          path: string;
          digestProfile?: string;
          sha256: string;
        }>;
      };
      mutate(manifest);
      writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
      expect(() => verify(root)).toThrow(
        'AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_MANIFEST_INVALID',
      );
    };
    const member = (
      manifest: {
        members: Array<{ path: string; digestProfile?: string }>;
      },
      relativePath: string,
    ) => {
      const value = manifest.members.find(entry => entry.path === relativePath);
      if (value === undefined) throw new Error(`fixture member ${relativePath} missing`);
      return value;
    };

    expectManifestRejected(manifest => {
      manifest.schemaVersion = 1;
    });
    expectManifestRejected(manifest => {
      delete member(manifest, 'package.json').digestProfile;
    });
    expectManifestRejected(manifest => {
      member(manifest, 'package.json').digestProfile = RAW_FILE_DIGEST_PROFILE;
    });
    expectManifestRejected(manifest => {
      member(manifest, 'src/spacetime/module_bindings/types.ts').digestProfile =
        REVIEWED_RELEASE_TRANSITION_DIGEST_PROFILE;
    });
    expectManifestRejected(manifest => {
      const raw = member(manifest, 'src/spacetime/module_bindings/types.ts');
      const projected = member(manifest, 'package.json');
      [raw.digestProfile, projected.digestProfile] = [
        projected.digestProfile,
        raw.digestProfile,
      ];
    });
    expectManifestRejected(manifest => {
      member(manifest, 'package.json').digestProfile = 'unknown-sha256-v1';
    });
    expectManifestRejected(manifest => {
      member(manifest, '.github/workflows/deploy-pages.yml').digestProfile =
        REVIEWED_RELEASE_TRANSITION_DIGEST_PROFILE;
    });
    expectManifestRejected(manifest => {
      member(
        manifest,
        '.github/workflows/notification-bridge-prepared.yml',
      ).digestProfile =
        REVIEWED_RELEASE_TRANSITION_PLUS_BOOTSTRAP_PIN_DIGEST_PROFILE;
    });
  }, 120_000);
});
