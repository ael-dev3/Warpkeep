import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { setGlobalLogLevel } from 'spacetimedb';

import {
  GENESIS_001_DATABASE_IDENTITY,
  GENESIS_001_FREEZE_RELEASE_NONCE,
  GENESIS_001_LIVE_POLICY_OBSERVATION_PROFILE,
  GENESIS_001_SOURCE_BASELINE_COMMIT,
  genesis001PolicyReceiptDigest,
} from './genesis001-sealed-launch-adoption.mjs';
import {
  attestGreaterRealmProductionProtectedMain,
} from './greater-realm-production-provenance.ts';
import {
  createGreaterRealmAdminTransportSession,
  readGreaterRealmProductionAdminSecretFile,
} from './greater-realm-production-transport.ts';

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const BOOTSTRAP_PROFILE = 'warpkeep-greater-realm-production-bootstrap-v1';
const COMMIT = /^[0-9a-f]{40}$/u;
const TRUSTED_BOOTSTRAP_BINDINGS = Object.freeze([
  'WKGR_PRODUCTION_BOOTSTRAP_PROFILE',
  'WKGR_PRODUCTION_PROTECTED_COMMIT',
  'WKGR_PRODUCTION_ADMIN_SECRET_PATH',
  'WKGR_PRODUCTION_DEPENDENCY_CACHE_ROOT',
]);
const POLICY_KEYS = Object.freeze([
  'realmId',
  'releaseVersion',
  'playerAccessEnabled',
  'admissionStateMutationsEnabled',
  'accessRequestSubmissionsEnabled',
  'sourceBaselineCommit',
  'freezeReleaseNonce',
]);

export const GENESIS_001_POLICY_OBSERVATION_PROCEDURE =
  'genesis_001_access_policy_v1';

export class Genesis001PolicyObservationError extends Error {
  constructor(code) {
    super(code);
    this.name = 'Genesis001PolicyObservationError';
    this.code = code;
  }
}

function fail(code) {
  throw new Genesis001PolicyObservationError(code);
}

function competingSecretAuthority(key) {
  return key.startsWith('WARPKEEP_ADMIN_TOKEN_SECRET')
    || key.startsWith('WARPKEEP_PRODUCTION_ADMIN_')
    || key.startsWith('WKGR_PRODUCTION_ADMIN_SECRET')
    || key.startsWith('WKGR_PRODUCTION_NOTIFICATION_SECRET')
    || key === 'WKGR_PRODUCTION_PRIVATE_INPUT_PATH';
}

/**
 * Captures the sealed bootstrap authority before any provenance or transport
 * work, then removes every trusted path/commit binding from the child
 * environment. Competing credential channels remain untouched and cause an
 * immediate rejection.
 */
export function captureGenesis001PolicyObservationBootstrapAuthority(
  environment = process.env,
) {
  if (environment === null || typeof environment !== 'object') {
    fail('GENESIS_001_POLICY_OBSERVATION_TRUSTED_BOOTSTRAP_REQUIRED');
  }
  const profile = environment.WKGR_PRODUCTION_BOOTSTRAP_PROFILE;
  const sourceCommit = environment.WKGR_PRODUCTION_PROTECTED_COMMIT;
  const adminSecretPath = environment.WKGR_PRODUCTION_ADMIN_SECRET_PATH;
  for (const key of TRUSTED_BOOTSTRAP_BINDINGS) delete environment[key];

  if (profile !== BOOTSTRAP_PROFILE) {
    fail('GENESIS_001_POLICY_OBSERVATION_TRUSTED_BOOTSTRAP_REQUIRED');
  }
  if (!COMMIT.test(sourceCommit ?? '')) {
    fail('GENESIS_001_POLICY_OBSERVATION_SOURCE_INVALID');
  }
  if (
    typeof adminSecretPath !== 'string'
    || !isAbsolute(adminSecretPath)
    || resolve(adminSecretPath) !== adminSecretPath
  ) {
    fail('GENESIS_001_POLICY_OBSERVATION_SECRET_AUTHORITY_UNAVAILABLE');
  }
  if (Object.keys(environment).some(competingSecretAuthority)) {
    fail('GENESIS_001_POLICY_OBSERVATION_SECRET_AUTHORITY_AMBIGUOUS');
  }
  return Object.freeze({ sourceCommit, adminSecretPath });
}

export function parseGenesis001PolicyObservationArguments(arguments_) {
  if (
    !Array.isArray(arguments_)
    || arguments_.length !== 1
    || arguments_[0] !== 'observe'
  ) fail('GENESIS_001_POLICY_OBSERVATION_ARGUMENTS_INVALID');
  return Object.freeze({ command: 'observe' });
}

function exactClosedPolicy(value) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || Reflect.ownKeys(value).length !== POLICY_KEYS.length
    || POLICY_KEYS.some(key => !Object.prototype.hasOwnProperty.call(value, key))
    || Object.values(Object.getOwnPropertyDescriptors(value)).some(
      descriptor => !('value' in descriptor) || descriptor.enumerable !== true,
    )
    || value.realmId !== 'GENESIS_001'
    || value.releaseVersion !== '0.3.43'
    || value.playerAccessEnabled !== true
    || value.admissionStateMutationsEnabled !== false
    || value.accessRequestSubmissionsEnabled !== false
    || value.sourceBaselineCommit !== GENESIS_001_SOURCE_BASELINE_COMMIT
    || value.freezeReleaseNonce !== GENESIS_001_FREEZE_RELEASE_NONCE
  ) fail('GENESIS_001_POLICY_OBSERVATION_LIVE_POLICY_INVALID');
  return Object.freeze({
    realmId: 'GENESIS_001',
    releaseVersion: '0.3.43',
    playerAccessEnabled: true,
    admissionStateMutationsEnabled: false,
    accessRequestSubmissionsEnabled: false,
    sourceBaselineCommit: GENESIS_001_SOURCE_BASELINE_COMMIT,
    freezeReleaseNonce: GENESIS_001_FREEZE_RELEASE_NONCE,
  });
}

function exactTimestamp(value) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    fail('GENESIS_001_POLICY_OBSERVATION_TIMESTAMP_INVALID');
  }
  const rendered = value.toISOString();
  if (new Date(rendered).toISOString() !== rendered) {
    fail('GENESIS_001_POLICY_OBSERVATION_TIMESTAMP_INVALID');
  }
  return rendered;
}

const PRODUCTION_DEPENDENCIES = Object.freeze({
  attestProtectedMain: attestGreaterRealmProductionProtectedMain,
  readAdminSecretFile: readGreaterRealmProductionAdminSecretFile,
  createSession: createGreaterRealmAdminTransportSession,
  now: () => new Date(),
});

export async function executeGenesis001PolicyObservation(input) {
  if (
    input === null
    || typeof input !== 'object'
    || !COMMIT.test(input.sourceCommit ?? '')
    || typeof input.adminSecretPath !== 'string'
    || !isAbsolute(input.adminSecretPath)
    || resolve(input.adminSecretPath) !== input.adminSecretPath
    || typeof input.repositoryRoot !== 'string'
    || !isAbsolute(input.repositoryRoot)
    || resolve(input.repositoryRoot) !== input.repositoryRoot
  ) fail('GENESIS_001_POLICY_OBSERVATION_INPUT_INVALID');
  if (
    input.testOnlyDependencies !== undefined
    && process.env.NODE_ENV !== 'test'
  ) fail('GENESIS_001_POLICY_OBSERVATION_TEST_DEPENDENCY_FORBIDDEN');
  const dependencies = input.testOnlyDependencies ?? PRODUCTION_DEPENDENCIES;
  const attestedSource = dependencies.attestProtectedMain(input.repositoryRoot);
  if (attestedSource !== input.sourceCommit) {
    fail('GENESIS_001_POLICY_OBSERVATION_SOURCE_INVALID');
  }

  let adminSecret = dependencies.readAdminSecretFile(input.adminSecretPath);
  let session;
  try {
    session = dependencies.createSession({ adminSecret });
  } finally {
    adminSecret = '';
  }
  try {
    await session.invalidate();
    const policy = exactClosedPolicy(
      await session.inspect('genesis_001_access_policy_v1'),
    );
    return Object.freeze({
      schemaVersion: 1,
      profile: GENESIS_001_LIVE_POLICY_OBSERVATION_PROFILE,
      sourceCommit: input.sourceCommit,
      observedAt: exactTimestamp(dependencies.now()),
      databaseIdentity: GENESIS_001_DATABASE_IDENTITY,
      procedure: GENESIS_001_POLICY_OBSERVATION_PROCEDURE,
      mutationSubmitted: false,
      policy,
      policyReceiptDigest: genesis001PolicyReceiptDigest(policy),
    });
  } finally {
    await session.close();
  }
}

async function main() {
  // Stdout is a single canonical receipt consumed by the protected bootstrap.
  // Suppress the SDK's informational connection notice before any session can
  // open so machine-readable evidence cannot be contaminated or disclosed.
  setGlobalLogLevel('error');
  const authority = captureGenesis001PolicyObservationBootstrapAuthority(
    process.env,
  );
  parseGenesis001PolicyObservationArguments(process.argv.slice(2));
  const receipt = await executeGenesis001PolicyObservation({
    ...authority,
    repositoryRoot: REPOSITORY_ROOT,
  });
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch(error => {
    process.stderr.write(`${
      error instanceof Genesis001PolicyObservationError
        ? error.code
        : 'GENESIS_001_POLICY_OBSERVATION_FAILED'
    }\n`);
    process.exitCode = 1;
  });
}
