import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  GENESIS_WORLD_PUBLISH_STAGE,
  PRODUCTION_V11_TABLE_PRODUCT_TYPE_REFS,
  RESOURCE_PUBLISH_ROLLOUT_STAGE,
  WORKER_PUBLISH_ROLLOUT_STAGE,
  WORKER_V12_TABLE_CONTRACTS,
  alphaV10AggregateChildArguments,
  alphaV12AggregateChildArguments,
  alphaV8AggregateChildArguments,
  canonicalSchemaDescribeChildArguments,
  createPrivatePublishSnapshot,
  parseCanonicalSchemaDescription,
  parseMigrationProofReceipt,
  parsePublishArguments,
  publishPostV12AggregateChildArguments,
  publishPreV12AggregateChildArguments,
  publishChildEnvironment,
  publishModule,
  readFoundedPublishExpectations,
  requireCanonicalPublishCoordinates,
  runCurrentAdditiveMigrationProof,
  validateIssuerDeployment,
  verifyCanonicalDatabaseList,
  verifyFreshAlphaStatusV8Aggregate,
  verifyFreshAlphaStatusV10Aggregate,
  verifyFreshAlphaStatusV12Aggregate,
  verifyFreshPublishPreV12Aggregate,
  verifyFreshProductionV11Schema,
  verifyFreshFoundedProtocolV3Aggregate,
  verifyFreshResourceProtocolV4PrebackfillAggregate,
  verifyFreshResourceProtocolV4ReadyAggregate,
  verifyMigrationArtifactReceipt,
  verifyPinnedCliAttestation,
  verifyPostPublishAlphaStatusV8Aggregate,
  verifyPostPublishAlphaStatusV10Aggregate,
  verifyPostPublishAlphaStatusV12Aggregate,
  verifyPostPublishCombinedV12Aggregate,
  verifyPostPublishFoundedProtocolV3Aggregate,
  verifyPostPublishProductionV12Schema,
  verifyPostPublishResourceProtocolV4PrebackfillAggregate,
  verifyPostPublishResourceProtocolV4ReadyAggregate,
  verifyPostPublishResourcePublicationCheckpoints,
  verifyPrivacySafeAlphaStatusV8Output,
  verifyPrivacySafeAlphaStatusV10Output,
  verifyPrivacySafeAlphaStatusV12Output,
  verifyPrivacySafePublishPostV12Output,
  verifyPrivacySafePublishPreV12Output,
  verifyEmptyAlphaStatusV12,
  verifyExactProductionV11Schema,
  verifyExactProductionV12Schema,
} from '../scripts/publish-spacetime-dev.mjs';
// @ts-expect-error Repository JavaScript scripts intentionally expose test hooks.
import { ADDITIVE_MIGRATION_PROOF_MINIMUM_LIFECYCLE_MILLISECONDS, ADDITIVE_MIGRATION_PROOF_PROCESS_TIMEOUT_MILLISECONDS, ADDITIVE_MIGRATION_PROOF_PROTOCOL_VERSION, ADDITIVE_MIGRATION_PROOF_SPACETIME_CLI_VERSION, formatAdditiveMigrationProofReceipt } from '../scripts/spacetime-additive-migration-proof.mjs';
// @ts-expect-error Repository JavaScript scripts intentionally expose test hooks.
import { canonicalTableSchemaBoundaryDigest } from '../scripts/spacetime-table-schema-attestation.mjs';
// @ts-expect-error Repository JavaScript scripts intentionally expose test hooks.
import { PROTECTED_AGGREGATE_STAGE, parseProductionVerifierArguments, protectedAggregateChildArguments, protectedAggregateChildEnvironment, protectedAggregateChildOptions, requiredProtectedAggregateSecret, resourceV4AggregateChildArguments, resourceV4ReadyAggregateChildEnvironment, resourceV4ReadyAggregateChildOptions, rootAssetUrls, validateProductionSigningKey, verifyBridge, verifyExpectedAlphaAggregate, verifyExpectedAlphaV2Aggregate, verifyExpectedAlphaV3Aggregate, verifyExpectedAlphaV4ResourcePrebackfillAggregate, verifyExpectedAlphaV4ResourceReadyAggregate, verifyPostBackfillResourceAggregateCheckpoints, verifyRootAssets } from '../scripts/verify-alpha-production.mjs';
// @ts-expect-error Repository JavaScript scripts intentionally expose test hooks.
import { cleanupMigrationProofResources, containServerProcessErrors, installMigrationProofSignalCleanup, stopServer } from '../scripts/verify-spacetime-additive-migration.mjs';
import {
  ALPHA_ACTIVATION_COMPONENTS,
  ALPHA_ACTIVATION_SCHEMA_PROTOCOL_VERSION,
} from '../spacetimedb/src/alphaActivationPolicy';
import {
  ALPHA_V10_ACTIVATION_COMPONENTS,
  ALPHA_V10_ACTIVATION_SCHEMA_PROTOCOL_VERSION,
} from '../spacetimedb/src/alphaV10ActivationPolicy';
import { WARPKEEP_BACKEND_PROTOCOL_VERSION } from '../spacetimedb/src/config';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const provenArtifactPath = resolve(repositoryRoot, 'spacetimedb/dist/bundle.js');
const CANONICAL_DATABASE_IDENTITY = 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e';
const ISSUER = 'https://auth.warpkeep.com';
const FRONTEND = 'https://warpkeep.com';
const AUTH_V2_CLAIMS = [
  'sub',
  'aud',
  'fid',
  'token_type',
  'auth_version',
  'auth_epoch',
  'roles',
  'session_iat',
  'session_exp',
];
const AUTH_V2_SECURITY_HEADERS = {
  'cache-control': 'no-store',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'referrer-policy': 'no-referrer',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-site',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'x-permitted-cross-domain-policies': 'none',
};
const AUTH_V2_CREDENTIAL_PATHS = new Set([
  '/v2/farcaster/challenge',
  '/v2/farcaster/exchange',
  '/v2/session/refresh',
  '/v2/session/logout',
]);
const AUTH_V2_PAUSED_PATHS = new Set([
  '/v2/farcaster/challenge',
  '/v2/farcaster/exchange',
  '/v2/session/refresh',
]);
const AUTH_V2_SERVER_ONLY_ADMIN_PATHS = new Set([
  '/v1/admin/token',
  '/v1/admin/auth-epoch-probe',
  '/v1/admin/config-attestation',
]);
let publicJwk: JsonWebKey;

function alphaStatusV8(overrides: Record<string, unknown> = {}) {
  const { gold, forest, food, wood } = ALPHA_ACTIVATION_COMPONENTS;
  return {
    schemaProtocolVersion: ALPHA_ACTIVATION_SCHEMA_PROTOCOL_VERSION,
    backendProtocolVersion: WARPKEEP_BACKEND_PROTOCOL_VERSION,
    goldSitePolicyVersion: gold.sitePolicyVersion,
    goldExpeditionPolicyVersion: gold.expeditionPolicyVersion,
    canonicalGoldSiteCatalogDigest: gold.siteCatalogDigest,
    goldSites: '0',
    canonicalGoldSites: '0',
    goldOccupations: '0',
    goldExpeditions: '0',
    goldIdempotencyReceipts: '0',
    goldSchedules: '0',
    forestLayoutVersion: forest.layoutVersion,
    forestPolicyVersion: forest.policyVersion,
    canonicalForestLayoutDigest: forest.layoutDigest,
    canonicalForestAssetCatalogDigest: forest.assetCatalogDigest,
    forestLayouts: '0',
    canonicalForestLayouts: '0',
    forestInstances: '0',
    canonicalForestInstances: '0',
    foodSitePolicyVersion: food.sitePolicyVersion,
    foodExpeditionPolicyVersion: food.expeditionPolicyVersion,
    canonicalFoodSiteCatalogDigest: food.siteCatalogDigest,
    foodSites: '0',
    canonicalFoodSites: '0',
    foodOccupations: '0',
    foodExpeditions: '0',
    foodIdempotencyReceipts: '0',
    foodSchedules: '0',
    woodSitePolicyVersion: wood.sitePolicyVersion,
    woodExpeditionPolicyVersion: wood.expeditionPolicyVersion,
    canonicalWoodSiteCatalogDigest: wood.siteCatalogDigest,
    woodSites: '0',
    canonicalWoodSites: '0',
    woodOccupations: '0',
    woodExpeditions: '0',
    woodIdempotencyReceipts: '0',
    woodSchedules: '0',
    ...overrides,
  };
}

function alphaStatusV10(overrides: Record<string, unknown> = {}) {
  const { water, stone } = ALPHA_V10_ACTIVATION_COMPONENTS;
  return {
    schemaProtocolVersion: ALPHA_V10_ACTIVATION_SCHEMA_PROTOCOL_VERSION,
    backendProtocolVersion: WARPKEEP_BACKEND_PROTOCOL_VERSION,
    waterPolicyVersion: water.policyVersion,
    waterLayoutVersion: water.layoutVersion,
    canonicalWaterLayoutDigest: water.layoutDigest,
    waterActivated: false,
    waterLayouts: '0',
    canonicalWaterLayouts: '0',
    waterBodies: '0',
    canonicalWaterBodies: '0',
    waterCells: '0',
    canonicalWaterCells: '0',
    realmEnvironments: '0',
    canonicalRealmEnvironments: '0',
    stoneSitePolicyVersion: stone.sitePolicyVersion,
    stoneExpeditionPolicyVersion: stone.expeditionPolicyVersion,
    canonicalStoneSiteCatalogDigest: stone.siteCatalogDigest,
    stoneSites: '0',
    canonicalStoneSites: '0',
    stoneOccupations: '0',
    stoneExpeditions: '0',
    stoneIdempotencyReceipts: '0',
    stoneSchedules: '0',
    ...overrides,
  };
}

function alphaStatusV12(overrides: Record<string, unknown> = {}) {
  const zeroCounts = Object.fromEntries([
    'systemRows', 'expectedCastleCount', 'expectedWorkerCount', 'actualWorkerCount',
    'castlesWithExtraWorkers', 'duplicateOrdinals', 'malformedWorkerIds',
    'invalidWorkerStates', 'idleWorkers', 'outboundWorkers', 'gatheringWorkers',
    'returningWorkers', 'assignments', 'occupations', 'schedules', 'orphanWorkers',
    'orphanAssignments', 'assignmentsMissingOccupation',
    'assignmentsWithoutSingleSchedule', 'orphanOccupations', 'orphanSchedules',
    'invalidSchedules', 'assignmentPublicMismatches', 'occupationSiteMismatches',
    'invalidAssignments', 'idempotencyReceipts', 'invalidIdempotencyReceipts',
    'idempotencyOverflowFids',
  ].map(field => [field, '0']));
  return {
    ...zeroCounts,
    mode: 'absent',
    systemConfigValid: false,
    legacyDrainRequired: true,
    expectedCountsMatch: false,
    rosterDigestMatches: false,
    castlesMissingWorkers: '4',
    legacyExpeditions: '2',
    legacyOccupations: '1',
    legacySchedules: '3',
    rosterDigest: '',
    rosterDigestExpected: '0123456789abcdef',
    ...overrides,
  };
}

function publishProtocolV3Status(overrides: Record<string, unknown> = {}) {
  const invariantFields = [
    'orphanedPlayerRowsV2',
    'orphanedOwnershipRowsV2',
    'orphanedCastleClaims',
    'orphanedCastles',
    'orphanedRealmProfiles',
    'orphanedMarkAccounts',
    'orphanedBurnCredits',
    'orphanedTermsAcceptances',
    'founderStateGaps',
    'markAccountInvariantViolations',
    'publicMarkProjectionViolations',
    'duplicateBurnReferences',
    'burnAccountReconciliationViolations',
    'ambiguousActiveWalletAddresses',
    'staticWorldDriftViolations',
    'termsAcceptanceInvariantViolations',
  ];
  return {
    worldTiles: '1261',
    occupiedWorldTiles: '4',
    worldTileMeta: '1261',
    realms: '1',
    castleSlots: '100',
    castleSlotClaims: '4',
    legacyPlayers: '0',
    playersV2: '1',
    playerOwnershipsV2: '1',
    castles: '4',
    realmProfiles: '4',
    markAccounts: '4',
    snapBurnCredits: '0',
    walletAttributions: '0',
    walletAttributionSnapshots: '0',
    scanCursors: '0',
    scanBatches: '0',
    alphaTermsAcceptances: '1',
    allowedFids: '4',
    enabledAllowedFids: '4',
    auditEntries: '7',
    ...Object.fromEntries(invariantFields.map(field => [field, '0'])),
    protocolVersion: 3,
    worldSeed: 3_445_214_658,
    worldSeedName: 'HEGEMONY_GENESIS_001',
    ...overrides,
  };
}

function publishResourceV4Status(
  stage: 'prebackfill' | 'ready' = 'prebackfill',
  overrides: Record<string, unknown> = {},
) {
  return {
    allowedFids: '4',
    castles: '4',
    markAccounts: '4',
    resourceAccounts: stage === 'ready' ? '4' : '0',
    missingResourceAccounts: stage === 'ready' ? '0' : '4',
    orphanedResourceAccounts: '0',
    resourceInvariantViolations: '0',
    protocolVersion: 3,
    resourcePolicyVersion: 'genesis-resource-yield-v1',
    ...overrides,
  };
}

function productionSchemaDescription(includeWorkerV12: boolean) {
  const refs: Record<string, number> = {
    ...PRODUCTION_V11_TABLE_PRODUCT_TYPE_REFS,
  };
  if (includeWorkerV12) {
    for (const [name, contract] of Object.entries(WORKER_V12_TABLE_CONTRACTS)) {
      refs[name] = contract.productTypeRef;
    }
  }
  const types: Array<{
    Product: {
      elements: Array<{
        name: { some: string };
        algebraic_type: Record<string, unknown>;
      }>;
    };
  }> = Array.from({ length: Math.max(...Object.values(refs)) + 1 }, (_unused, ref) => ({
    Product: { elements: [{ name: { some: `legacy_field_${ref}` }, algebraic_type: { U64: {} } }] },
  }));
  const tables: Array<{
    name: string;
    product_type_ref: number;
    table_access: Record<string, object>;
    indexes: Array<Record<string, unknown>>;
    constraints: Array<Record<string, unknown>>;
  }> = Object.entries(refs).map(([name, productTypeRef]) => ({
    name,
    product_type_ref: productTypeRef,
    table_access: { [name === 'admin_audit' ? 'Private' : 'Public']: {} },
    indexes: [{ name: `${name}_by_primary`, algorithm: { BTree: { columns: [0] } } }],
    constraints: [{ name: `${name}_primary`, data: { Unique: { columns: [0] } } }],
  }));
  if (includeWorkerV12) {
    for (const [name, contract] of Object.entries(WORKER_V12_TABLE_CONTRACTS)) {
      types[contract.productTypeRef] = {
        Product: {
          elements: contract.fields.map(field => ({
            name: { some: field },
            algebraic_type: { String: {} },
          })),
        },
      };
      const table = tables.find(candidate => candidate.name === name)!;
      table.table_access = { [contract.access]: {} };
    }
  }
  return { tables, typespace: { types } };
}

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
});

afterEach(() => {
  vi.useRealTimers();
});

function jsonResponse(value: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has('content-type')) headers.set('content-type', 'application/json');
  return new Response(JSON.stringify(value), { ...init, headers });
}

function validDocuments() {
  return {
    discovery: {
      issuer: ISSUER,
      jwks_uri: `${ISSUER}/.well-known/jwks.json`,
      id_token_signing_alg_values_supported: ['ES256'],
    },
    jwks: {
      keys: [{
        kty: 'EC',
        crv: 'P-256',
        alg: 'ES256',
        use: 'sig',
        kid: 'warpkeep-test-key',
        x: publicJwk.x,
        y: publicJwk.y,
      }],
    },
  };
}

type AuthV2FixtureOptions = {
  health?: Record<string, unknown>;
  publicAuthEnabled?: boolean;
  discoveryClaims?: string[];
  omitSecurityHeader?: string;
  legacyNotRetired?: boolean;
  omitCredentialedCors?: boolean;
  exposeHostileCors?: boolean;
  publicRoutesNotPaused?: boolean;
  publicRoutesPaused?: boolean;
  adminCorsLeak?: Readonly<{
    pathname: string;
    method: 'GET' | 'OPTIONS';
    origin: string;
  }>;
};

function authV2Headers(
  extra: HeadersInit = {},
  omitSecurityHeader?: string,
) {
  const headers = new Headers(AUTH_V2_SECURITY_HEADERS);
  if (omitSecurityHeader) headers.delete(omitSecurityHeader);
  new Headers(extra).forEach((value, name) => headers.set(name, value));
  return headers;
}

function credentialedCors(origin: string): HeadersInit {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-credentials': 'true',
    'access-control-max-age': '600',
    vary: 'Origin',
  };
}

function authV2JsonResponse(
  value: unknown,
  status: number,
  extraHeaders: HeadersInit = {},
  omitSecurityHeader?: string,
) {
  const headers = authV2Headers(extraHeaders, omitSecurityHeader);
  headers.set('content-type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(value), { status, headers });
}

function authV2EmptyResponse(
  status: number,
  extraHeaders: HeadersInit = {},
  omitSecurityHeader?: string,
) {
  return new Response(null, {
    status,
    headers: authV2Headers(extraHeaders, omitSecurityHeader),
  });
}

function authV2BridgeFetch(options: AuthV2FixtureOptions = {}) {
  const publicAuthEnabled = options.publicAuthEnabled ?? false;
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const requestHeaders = new Headers(init?.headers);
    const origin = requestHeaders.get('origin');
    if (url.origin !== ISSUER) throw new Error('Unexpected fixture origin.');

    if (method === 'GET' && url.pathname === '/healthz') {
      return authV2JsonResponse(options.health ?? {
        ok: true,
        service: 'warpkeep-auth-bridge',
        securityProfile: 'warpkeep-auth-v2',
        publicAuthEnabled,
      }, 200, {}, options.omitSecurityHeader);
    }
    if (method === 'GET' && url.pathname === '/.well-known/openid-configuration') {
      return authV2JsonResponse({
        issuer: ISSUER,
        jwks_uri: `${ISSUER}/.well-known/jwks.json`,
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['ES256'],
        claims_supported: options.discoveryClaims ?? AUTH_V2_CLAIMS,
      }, 200, {}, options.omitSecurityHeader);
    }
    if (method === 'GET' && url.pathname === '/.well-known/jwks.json') {
      return authV2JsonResponse({
        keys: [{
          kty: 'EC',
          crv: 'P-256',
          alg: 'ES256',
          use: 'sig',
          kid: 'warpkeep-test-key',
          x: publicJwk.x,
          y: publicJwk.y,
        }],
      }, 200, {}, options.omitSecurityHeader);
    }

    if (
      method === 'OPTIONS'
      && (url.pathname === '/v1/farcaster/challenge' || url.pathname === '/v1/farcaster/exchange')
    ) {
      if (options.legacyNotRetired) {
        return authV2EmptyResponse(204, origin === FRONTEND ? {
          'access-control-allow-origin': FRONTEND,
          'access-control-allow-methods': 'POST, OPTIONS',
          'access-control-allow-headers': 'content-type',
          'access-control-max-age': '600',
          vary: 'Origin',
        } : {}, options.omitSecurityHeader);
      }
      return authV2JsonResponse({
        error: {
          code: 'legacy_auth_retired',
          message: 'This authentication protocol has been retired.',
        },
      }, 410, origin === FRONTEND ? {
        'access-control-allow-origin': FRONTEND,
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': 'content-type',
        'access-control-max-age': '600',
        vary: 'Origin',
      } : {}, options.omitSecurityHeader);
    }

    if (method === 'OPTIONS' && AUTH_V2_CREDENTIAL_PATHS.has(url.pathname)) {
      const cors = origin === FRONTEND
        ? credentialedCors(FRONTEND)
        : options.exposeHostileCors
          ? credentialedCors(origin ?? '*')
          : {};
      if (options.omitCredentialedCors && origin === FRONTEND) {
        delete (cors as Record<string, string>)['access-control-allow-credentials'];
      }
      const publicRoutesPaused = options.publicRoutesPaused
        ?? (!publicAuthEnabled && !options.publicRoutesNotPaused);
      if (AUTH_V2_PAUSED_PATHS.has(url.pathname) && publicRoutesPaused) {
        return authV2JsonResponse({
          error: {
            code: 'public_auth_paused',
            message: 'Farcaster sign-in is temporarily paused for security hardening.',
          },
        }, 503, cors, options.omitSecurityHeader);
      }
      if (origin === FRONTEND) {
        return authV2EmptyResponse(204, cors, options.omitSecurityHeader);
      }
      return authV2JsonResponse({
        error: {
          code: 'origin_not_allowed',
          message: 'This browser origin is not allowed.',
        },
      }, 403, {}, options.omitSecurityHeader);
    }

    if (
      (method === 'GET' || method === 'OPTIONS')
      && AUTH_V2_SERVER_ONLY_ADMIN_PATHS.has(url.pathname)
    ) {
      const leak = options.adminCorsLeak;
      const cors: HeadersInit = leak
        && leak.pathname === url.pathname
        && leak.method === method
        && leak.origin === origin
        ? { 'access-control-allow-origin': origin }
        : {};
      return authV2JsonResponse({
        error: { code: 'not_found', message: 'Route not found.' },
      }, 404, cors, options.omitSecurityHeader);
    }
    throw new Error(`Unexpected fixture request: ${method} ${url.pathname}`);
  });
}

function legacyBridgeFetch() {
  const documents = validDocuments();
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const origin = new Headers(init?.headers).get('origin');
    if (method === 'GET' && url.pathname === '/healthz') {
      return jsonResponse({ ok: true, service: 'warpkeep-auth-bridge' });
    }
    if (method === 'GET' && url.pathname === '/.well-known/openid-configuration') {
      return jsonResponse(documents.discovery);
    }
    if (method === 'GET' && url.pathname === '/.well-known/jwks.json') {
      return jsonResponse(documents.jwks);
    }
    if (
      method === 'OPTIONS'
      && (url.pathname === '/v1/farcaster/challenge' || url.pathname === '/v1/farcaster/exchange')
    ) {
      return new Response(null, {
        status: origin === FRONTEND ? 204 : 403,
        headers: origin === FRONTEND ? {
          'access-control-allow-origin': FRONTEND,
          'access-control-allow-methods': 'POST, OPTIONS',
          'access-control-allow-headers': 'content-type',
          vary: 'Origin',
        } : {},
      });
    }
    if (method === 'OPTIONS' && url.pathname === '/v1/admin/token') {
      return jsonResponse({ error: { code: 'not_found' } }, { status: 404 });
    }
    throw new Error(`Unexpected fixture request: ${method} ${url.pathname}`);
  });
}

function withNonCanonicalPaddingBits(value: string) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const index = alphabet.indexOf(value.at(-1) ?? '');
  if (index < 0 || index % 4 !== 0) throw new Error('Expected a canonical test coordinate.');
  return `${value.slice(0, -1)}${alphabet[index + 1]}`;
}

async function withTestProvenArtifact<T>(callback: (receipt: {
  artifactPath: string;
  v11TableSchemaDigest: string;
  v12TableSchemaDigest: string;
  artifactDigest: string;
}) => Promise<T> | T): Promise<T> {
  let previous: Buffer | undefined;
  try {
    previous = await readFile(provenArtifactPath);
  } catch {
    // A clean checkout has no ignored build output to preserve.
  }
  const content = Buffer.from('test-only-proven-spacetimedb-artifact');
  await mkdir(dirname(provenArtifactPath), { recursive: true });
  await writeFile(provenArtifactPath, content, { mode: 0o600 });
  const receipt = Object.freeze({
    artifactPath: provenArtifactPath,
    v11TableSchemaDigest: 'a'.repeat(64),
    v12TableSchemaDigest: 'b'.repeat(64),
    artifactDigest: createHash('sha256').update(content).digest('hex'),
  });
  try {
    return await callback(receipt);
  } finally {
    if (previous === undefined) await rm(provenArtifactPath, { force: true });
    else await writeFile(provenArtifactPath, previous);
  }
}

describe('activation publish safety', () => {
  it('accepts only direct, no-store, bounded OIDC documents with one exact public key', async () => {
    const documents = validDocuments();
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      return jsonResponse(url.endsWith('/openid-configuration') ? documents.discovery : documents.jwks);
    };

    await expect(validateIssuerDeployment(ISSUER, fetchImpl as typeof fetch)).resolves.toBeUndefined();
    expect(calls).toHaveLength(2);
    expect(calls.every(({ init }) => init?.redirect === 'error' && init.cache === 'no-store')).toBe(true);
  });

  it('rejects redirects, wrong media types, chunked oversized bodies, and incomplete keys', async () => {
    await expect(validateIssuerDeployment(ISSUER, (async () => new Response(null, {
      status: 302,
      headers: { location: 'https://redirect.example/' },
    })) as typeof fetch)).rejects.toThrow(/without redirects/i);

    await expect(validateIssuerDeployment(ISSUER, (async () => jsonResponse(validDocuments().discovery, {
      headers: { 'content-type': 'application/jsonp' },
    })) as typeof fetch)).rejects.toThrow(/exact JSON/i);

    await expect(validateIssuerDeployment(ISSUER, (async () => new Response('{}', {
      headers: {
        'content-type': 'application/json',
        'content-length': String(64 * 1_024 + 1),
      },
    })) as typeof fetch)).rejects.toThrow(/response limit/i);

    const oversized = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(64 * 1_024 + 1));
        controller.close();
      },
    });
    await expect(validateIssuerDeployment(ISSUER, (async () => new Response(oversized, {
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch)).rejects.toThrow(/response limit/i);

    const cancelFailure = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(64 * 1_024 + 1));
      },
      cancel() {
        throw new Error('publish-stream-cancel-sentinel');
      },
    });
    await expect(validateIssuerDeployment(ISSUER, (async () => new Response(cancelFailure, {
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch)).rejects.toThrow(/response limit/i);

    const documents = validDocuments();
    delete (documents.jwks.keys[0] as { x?: string }).x;
    const incompleteKeyFetch = async (input: string | URL | Request) => (
      String(input).endsWith('/openid-configuration')
        ? jsonResponse(documents.discovery)
        : jsonResponse(documents.jwks)
    );
    await expect(validateIssuerDeployment(ISSUER, incompleteKeyFetch as typeof fetch))
      .rejects.toThrow(/public-only ES256 signing key/i);
  });

  it('rejects syntactically shaped coordinates that are not a usable P-256 point', async () => {
    const documents = validDocuments();
    documents.jwks.keys[0].x = 'A'.repeat(43);
    documents.jwks.keys[0].y = 'A'.repeat(43);
    const fetchImpl = async (input: string | URL | Request) => (
      String(input).endsWith('/openid-configuration')
        ? jsonResponse(documents.discovery)
        : jsonResponse(documents.jwks)
    );
    await expect(validateIssuerDeployment(ISSUER, fetchImpl as typeof fetch))
      .rejects.toThrow(/usable public-only ES256/i);
    await expect(validateProductionSigningKey(documents.jwks.keys[0]))
      .rejects.toThrow(/unusable public signing key/i);
  });

  it('rejects a non-canonical base64url encoding of a valid P-256 point', async () => {
    const documents = validDocuments();
    documents.jwks.keys[0].x = withNonCanonicalPaddingBits(documents.jwks.keys[0].x!);
    const fetchImpl = async (input: string | URL | Request) => (
      String(input).endsWith('/openid-configuration')
        ? jsonResponse(documents.discovery)
        : jsonResponse(documents.jwks)
    );
    await expect(validateIssuerDeployment(ISSUER, fetchImpl as typeof fetch))
      .rejects.toThrow(/exact public-only ES256 signing key/i);
    await expect(validateProductionSigningKey(documents.jwks.keys[0]))
      .rejects.toThrow(/invalid or private signing key/i);
  });

  it('publishes only an owner-private artifact snapshot after the proven source is replaced', async () => {
    const calls: unknown[][] = [];
    let snapshotPath = '';
    let snapshotDirectory = '';
    let snapshotBytes = Buffer.alloc(0);
    let snapshotFileMode = 0;
    let snapshotDirectoryMode = 0;
    const child = new EventEmitter() as EventEmitter & { kill: ReturnType<typeof vi.fn> };
    child.kill = vi.fn();
    const fakeSpawn = (...args: unknown[]) => {
      calls.push(args);
      const publishArguments = args[1] as string[];
      snapshotPath = publishArguments[publishArguments.indexOf('--js-path') + 1] ?? '';
      snapshotDirectory = dirname(snapshotPath);
      writeFileSync(provenArtifactPath, 'test-only-replacement-after-attestation');
      snapshotBytes = readFileSync(snapshotPath);
      snapshotFileMode = statSync(snapshotPath).mode & 0o777;
      snapshotDirectoryMode = statSync(snapshotDirectory).mode & 0o777;
      queueMicrotask(() => child.emit('close', 0, null));
      return child;
    };
    const databaseIdentity = CANONICAL_DATABASE_IDENTITY;
    await withTestProvenArtifact(async receipt => {
      await expect(publishModule(
        'spacetime',
        databaseIdentity,
        receipt,
        fakeSpawn as never,
      )).resolves.toBeUndefined();
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toBe('spacetime');
    expect(snapshotPath).not.toBe(provenArtifactPath);
    expect(snapshotPath).toBe(join(snapshotDirectory, 'module.js'));
    expect(snapshotBytes).toEqual(Buffer.from('test-only-proven-spacetimedb-artifact'));
    expect(snapshotFileMode).toBe(0o400);
    expect(snapshotDirectoryMode).toBe(0o700);
    expect(calls[0]?.[1]).toEqual([
      'publish',
      '--server', 'https://maincloud.spacetimedb.com',
      '--js-path', snapshotPath,
      '--delete-data=never',
      '--yes=remote',
      '--no-config',
      databaseIdentity,
    ]);
    expect(calls[0]?.[1]).not.toContain('--module-path');
    expect(calls[0]?.[2]).toMatchObject({
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    expect(calls[0]?.[2]).not.toHaveProperty('shell');
    expect(calls[0]?.[2]).toHaveProperty('env');
    expect(() => statSync(snapshotPath)).toThrow();
    expect(() => statSync(snapshotDirectory)).toThrow();
  });

  it('executes only the attested CLI snapshot after its source path is replaced', async () => {
    const sourceDirectory = await mkdtemp(join(tmpdir(), 'warpkeep-cli-source-'));
    const sourcePath = join(sourceDirectory, 'spacetime-test');
    const original = Buffer.from('#!/bin/sh\nprintf original-cli');
    await writeFile(sourcePath, original, { mode: 0o700 });
    const digest = createHash('sha256').update(original).digest('hex');
    const snapshot = createPrivatePublishSnapshot(sourcePath, digest, 'executable');
    const snapshotPath = snapshot.path;
    const snapshotDirectory = snapshot.directory;
    try {
      expect(snapshotPath).not.toBe(sourcePath);
      expect(snapshotPath).toBe(join(snapshotDirectory, 'spacetime'));
      expect(statSync(snapshotDirectory).mode & 0o777).toBe(0o700);
      expect(statSync(snapshotPath).mode & 0o777).toBe(0o500);

      await writeFile(sourcePath, '#!/bin/sh\nprintf replaced-cli', { mode: 0o700 });
      const result = spawnSync(snapshotPath, [], { encoding: 'utf8' });
      expect(result.status).toBe(0);
      expect(result.signal).toBeNull();
      expect(result.stdout).toBe('original-cli');
      expect(readFileSync(snapshotPath)).toEqual(original);
    } finally {
      snapshot.cleanup();
      await rm(sourceDirectory, { recursive: true, force: true });
    }
    expect(() => statSync(snapshotPath)).toThrow();
    expect(() => statSync(snapshotDirectory)).toThrow();
  });

  it('requires an anonymous immutable-identity v11 schema and one exact additive v12 suffix', () => {
    expect(canonicalSchemaDescribeChildArguments()).toEqual([
      'describe',
      '--json',
      '--anonymous',
      '--server', 'https://maincloud.spacetimedb.com',
      '--no-config',
      CANONICAL_DATABASE_IDENTITY,
    ]);
    expect(canonicalSchemaDescribeChildArguments()).not.toContain('warpkeep-89e4u');

    const v11 = productionSchemaDescription(false);
    const parsed = parseCanonicalSchemaDescription(JSON.stringify(v11));
    const v11TableNames = Object.keys(PRODUCTION_V11_TABLE_PRODUCT_TYPE_REFS);
    const v11TableSchemaDigest = canonicalTableSchemaBoundaryDigest(parsed, v11TableNames);
    const predecessor = verifyExactProductionV11Schema(parsed, v11TableSchemaDigest);
    expect(Object.keys(predecessor)).toHaveLength(47);

    const calls: unknown[][] = [];
    const v11Spawn = (...args: unknown[]) => {
      calls.push(args);
      return { status: 0, signal: null, stdout: JSON.stringify(v11), stderr: '' };
    };
    expect(verifyFreshProductionV11Schema(
      'spacetime',
      v11TableSchemaDigest,
      v11Spawn as never,
    ))
      .toEqual(predecessor);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[1]).toEqual(canonicalSchemaDescribeChildArguments());
    const options = calls[0]?.[2] as { env?: Record<string, string>; input?: string };
    expect(options.input).toBe('');
    expect(options.env).not.toHaveProperty('WARPKEEP_ADMIN_TOKEN_SECRET');
    expect(options.env).not.toHaveProperty('WARPKEEP_ADMIN_TOKEN_SECRET_STDIN');

    const v12 = productionSchemaDescription(true);
    const v12TableNames = [
      ...v11TableNames,
      ...Object.keys(WORKER_V12_TABLE_CONTRACTS),
    ];
    const v12TableSchemaDigest = canonicalTableSchemaBoundaryDigest(v12, v12TableNames);
    expect(verifyExactProductionV12Schema(
      predecessor,
      v12,
      v12TableSchemaDigest,
    )).toEqual({
      predecessorTableCount: 47,
      appendedWorkerTableCount: 6,
      totalTableCount: 53,
    });
    expect(verifyPostPublishProductionV12Schema(
      'spacetime',
      predecessor,
      v12TableSchemaDigest,
      (() => ({ status: 0, signal: null, stdout: JSON.stringify(v12), stderr: '' })) as never,
    )).toEqual({
      predecessorTableCount: 47,
      appendedWorkerTableCount: 6,
      totalTableCount: 53,
    });

    const extraV11Table = structuredClone(v11);
    extraV11Table.tables.push({
      name: 'unexpected_table',
      product_type_ref: 47,
      table_access: { Public: {} },
      indexes: [],
      constraints: [],
    });
    expect(() => verifyExactProductionV11Schema(extraV11Table, v11TableSchemaDigest))
      .toThrow(/table set/i);

    const allPublicV11 = structuredClone(v11);
    allPublicV11.tables.find(table => table.name === 'admin_audit')!.table_access = { Public: {} };
    expect(() => verifyExactProductionV11Schema(allPublicV11, v11TableSchemaDigest))
      .toThrow(/proven publication boundary/i);

    const changedV11FieldType = structuredClone(v11);
    const castleRef = PRODUCTION_V11_TABLE_PRODUCT_TYPE_REFS.castle;
    changedV11FieldType.typespace.types[castleRef].Product.elements[0].algebraic_type = {
      String: {},
    };
    expect(() => verifyExactProductionV11Schema(changedV11FieldType, v11TableSchemaDigest))
      .toThrow(/proven publication boundary/i);

    const changedV11Index = structuredClone(v11);
    changedV11Index.tables.find(table => table.name === 'castle')!.indexes[0] = {
      name: 'castle_by_primary',
      algorithm: { BTree: { columns: [1] } },
    };
    expect(() => verifyExactProductionV11Schema(changedV11Index, v11TableSchemaDigest))
      .toThrow(/proven publication boundary/i);

    const changedV11Constraint = structuredClone(v11);
    changedV11Constraint.tables.find(table => table.name === 'castle')!.constraints[0] = {
      name: 'castle_primary',
      data: { Unique: { columns: [1] } },
    };
    expect(() => verifyExactProductionV11Schema(changedV11Constraint, v11TableSchemaDigest))
      .toThrow(/proven publication boundary/i);

    const changedPredecessor = structuredClone(v12);
    changedPredecessor.tables.find(table => table.name === 'castle')!.table_access = { Private: {} };
    expect(() => verifyExactProductionV12Schema(
      predecessor,
      changedPredecessor,
      v12TableSchemaDigest,
    ))
      .toThrow(/pre-existing production table changed/i);

    const changedWorker = structuredClone(v12);
    changedWorker.tables.find(table => table.name === 'worker_assignment_v1')!.table_access = { Public: {} };
    expect(() => verifyExactProductionV12Schema(
      predecessor,
      changedWorker,
      v12TableSchemaDigest,
    ))
      .toThrow(/exact v12 contract/i);

    const workerRef = WORKER_V12_TABLE_CONTRACTS.castle_worker_v1.productTypeRef;
    const changedWorkerFieldType = structuredClone(v12);
    changedWorkerFieldType.typespace.types[workerRef].Product.elements[0].algebraic_type = {
      U64: {},
    };
    expect(() => verifyExactProductionV12Schema(
      predecessor,
      changedWorkerFieldType,
      v12TableSchemaDigest,
    )).toThrow(/proven publication boundary/i);

    const changedWorkerIndex = structuredClone(v12);
    changedWorkerIndex.tables.find(table => table.name === 'castle_worker_v1')!.indexes[0] = {
      name: 'castle_worker_v1_by_primary',
      algorithm: { BTree: { columns: [1] } },
    };
    expect(() => verifyExactProductionV12Schema(
      predecessor,
      changedWorkerIndex,
      v12TableSchemaDigest,
    )).toThrow(/proven publication boundary/i);

    const changedWorkerConstraint = structuredClone(v12);
    changedWorkerConstraint.tables
      .find(table => table.name === 'castle_worker_v1')!.constraints[0] = {
        name: 'castle_worker_v1_primary',
        data: { Unique: { columns: [1] } },
      };
    expect(() => verifyExactProductionV12Schema(
      predecessor,
      changedWorkerConstraint,
      v12TableSchemaDigest,
    )).toThrow(/proven publication boundary/i);

    const nestedV11 = structuredClone(v11);
    const nestedRef = nestedV11.typespace.types.length;
    nestedV11.typespace.types.push({
      Product: { elements: [{ name: { some: 'nested' }, algebraic_type: { U64: {} } }] },
    });
    nestedV11.typespace.types[castleRef].Product.elements[0].algebraic_type = { Ref: nestedRef };
    const nestedDigest = canonicalTableSchemaBoundaryDigest(nestedV11, v11TableNames);
    expect(() => verifyExactProductionV11Schema(nestedV11, nestedDigest)).not.toThrow();
    const changedNestedType = structuredClone(nestedV11);
    changedNestedType.typespace.types[nestedRef].Product.elements[0].algebraic_type = {
      String: {},
    };
    expect(() => verifyExactProductionV11Schema(changedNestedType, nestedDigest))
      .toThrow(/proven publication boundary/i);

    const unrelatedSchema = structuredClone(nestedV11);
    unrelatedSchema.typespace.types.push({
      Product: { elements: [{ name: { some: 'reducer_only' }, algebraic_type: { Bool: {} } }] },
    });
    Object.assign(unrelatedSchema, {
      reducers: [{ name: 'unrelated_reducer' }],
      procedures: [{ name: 'unrelated_procedure' }],
    });
    expect(canonicalTableSchemaBoundaryDigest(unrelatedSchema, v11TableNames))
      .toBe(nestedDigest);

    const indeterminate = () => verifyPostPublishProductionV12Schema(
      'spacetime',
      predecessor,
      v12TableSchemaDigest,
      (() => ({ status: 1, signal: null, stdout: 'private', stderr: 'private' })) as never,
    );
    expect(indeterminate).toThrow(/indeterminate.*anonymous read-only schema inspection/i);
    expect(indeterminate).not.toThrow(/private|retry/i);
    expect(() => parseCanonicalSchemaDescription('private, not json'))
      .toThrow(/machine-readable JSON/i);
  });

  it('binds an exact single migration receipt and rejects artifact changes before spawn', async () => {
    await withTestProvenArtifact(async receipt => {
      const success = `${formatAdditiveMigrationProofReceipt({
        summary: 'test-only receipt.',
        v11TableSchemaDigest: receipt.v11TableSchemaDigest,
        v12TableSchemaDigest: receipt.v12TableSchemaDigest,
        artifactDigest: receipt.artifactDigest,
      })}\n`;
      const parsed = parseMigrationProofReceipt(success);
      expect(parsed).toEqual(receipt);
      expect(Object.isFrozen(parsed)).toBe(true);
      expect(() => parseMigrationProofReceipt('')).toThrow(/exact success receipt/i);
      expect(() => parseMigrationProofReceipt(`${success}${success}`)).toThrow(/exact success receipt/i);
      expect(() => parseMigrationProofReceipt(success.replace(
        `protocol-v${ADDITIVE_MIGRATION_PROOF_PROTOCOL_VERSION}`,
        `protocol-v${ADDITIVE_MIGRATION_PROOF_PROTOCOL_VERSION - 1}`,
      ))).toThrow(/exact success receipt/i);
      expect(() => parseMigrationProofReceipt(success.replace(
        ADDITIVE_MIGRATION_PROOF_SPACETIME_CLI_VERSION,
        '0.0.0',
      )))
        .toThrow(/exact success receipt/i);
      expect(() => parseMigrationProofReceipt(success.replace('artifact_sha256=', 'artifact_digest=')))
        .toThrow(/exact success receipt/i);
      expect(() => parseMigrationProofReceipt(success.replace(
        ` v11_table_schema_sha256=${receipt.v11TableSchemaDigest}`,
        '',
      ))).toThrow(/exact success receipt/i);
      expect(() => parseMigrationProofReceipt(success.replace(
        ` v12_table_schema_sha256=${receipt.v12TableSchemaDigest}`,
        ` v11_table_schema_sha256=${receipt.v11TableSchemaDigest}`
          + ` v12_table_schema_sha256=${receipt.v12TableSchemaDigest}`,
      ))).toThrow(/exact success receipt/i);
      expect(() => parseMigrationProofReceipt(success.replace(
        ` v11_table_schema_sha256=${receipt.v11TableSchemaDigest}`
          + ` v12_table_schema_sha256=${receipt.v12TableSchemaDigest}`,
        ` v12_table_schema_sha256=${receipt.v12TableSchemaDigest}`
          + ` v11_table_schema_sha256=${receipt.v11TableSchemaDigest}`,
      ))).toThrow(/exact success receipt/i);
      expect(() => parseMigrationProofReceipt(success.replace(
        receipt.v11TableSchemaDigest,
        'not-a-digest',
      ))).toThrow(/exact success receipt/i);
      expect(() => parseMigrationProofReceipt(success.replace(receipt.artifactDigest, '0'.repeat(64))))
        .toThrow(/changed after migration/i);
      expect(() => parseMigrationProofReceipt(success.replace(receipt.artifactDigest, 'not-a-digest')))
        .toThrow(/exact success receipt/i);
      expect(() => verifyMigrationArtifactReceipt({
        ...receipt,
        artifactPath: resolve(repositoryRoot, 'spacetimedb/dist/other.js'),
      })).toThrow(/receipt was invalid/i);
      expect(() => verifyMigrationArtifactReceipt({
        ...receipt,
        artifactDigest: receipt.artifactDigest.toUpperCase(),
      })).toThrow(/receipt was invalid/i);
      expect(() => verifyMigrationArtifactReceipt({
        ...receipt,
        v12TableSchemaDigest: receipt.v12TableSchemaDigest.toUpperCase(),
      })).toThrow(/receipt was invalid/i);
      expect(() => verifyMigrationArtifactReceipt({ ...receipt, extra: true }))
        .toThrow(/receipt was invalid/i);
      await expect(publishModule(
        'spacetime',
        'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b5700',
        receipt,
        vi.fn() as never,
      )).rejects.toThrow(/pinned canonical database identity/i);

      await writeFile(provenArtifactPath, 'test-only-changed-artifact');
      expect(() => verifyMigrationArtifactReceipt(receipt)).toThrow(/changed after migration/i);
      const spawnProcess = vi.fn();
      await expect(publishModule(
        'spacetime',
        CANONICAL_DATABASE_IDENTITY,
        receipt,
        spawnProcess as never,
      )).rejects.toThrow(/changed after migration/i);
      expect(spawnProcess).not.toHaveBeenCalled();
    });
  });

  it('gives the real scheduler migration proof a dedicated bounded process deadline', async () => {
    await withTestProvenArtifact(async receipt => {
      const calls: unknown[][] = [];
      const success = `${formatAdditiveMigrationProofReceipt({
        summary: 'test-only scheduler receipt.',
        v11TableSchemaDigest: receipt.v11TableSchemaDigest,
        v12TableSchemaDigest: receipt.v12TableSchemaDigest,
        artifactDigest: receipt.artifactDigest,
      })}\n`;
      const fakeSpawnSync = (...args: unknown[]) => {
        calls.push(args);
        return {
          error: undefined,
          signal: null,
          status: 0,
          stderr: '',
          stdout: success,
        };
      };

      expect(runCurrentAdditiveMigrationProof('spacetime', fakeSpawnSync as never))
        .toEqual(receipt);
      expect(calls).toHaveLength(1);
      expect(calls[0]?.[0]).toBe(process.execPath);
      expect(calls[0]?.[1]).toEqual(['scripts/verify-spacetime-additive-migration.mjs']);
      expect(calls[0]?.[2]).toMatchObject({
        timeout: ADDITIVE_MIGRATION_PROOF_PROCESS_TIMEOUT_MILLISECONDS,
      });
      expect(ADDITIVE_MIGRATION_PROOF_PROCESS_TIMEOUT_MILLISECONDS)
        .toBe(15 * 60 * 1_000);
      expect(ADDITIVE_MIGRATION_PROOF_MINIMUM_LIFECYCLE_MILLISECONDS)
        .toBe(10 * 60 * 1_000);
      expect(ADDITIVE_MIGRATION_PROOF_MINIMUM_LIFECYCLE_MILLISECONDS)
        .toBeGreaterThan(5 * 60 * 1_000);
    });
  });

  it('rejects a symlink at the canonical proven-artifact path', async () => {
    await withTestProvenArtifact(async receipt => {
      await rm(provenArtifactPath, { force: true });
      try {
        await symlink(resolve(repositoryRoot, 'spacetimedb/src/config.ts'), provenArtifactPath);
        expect(() => verifyMigrationArtifactReceipt(receipt)).toThrow(/could not be read/i);
      } finally {
        await rm(provenArtifactPath, { force: true });
      }
    });
  });

  it('kills and rejects a publish whose combined output exceeds the fixed bound', async () => {
    await withTestProvenArtifact(async receipt => {
      let snapshotPath = '';
      const child = new EventEmitter() as EventEmitter & {
        kill: ReturnType<typeof vi.fn>;
        stdout: EventEmitter;
        stderr: EventEmitter;
      };
      child.kill = vi.fn();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      const publish = publishModule(
        'spacetime',
        CANONICAL_DATABASE_IDENTITY,
        receipt,
        ((...args: unknown[]) => {
          const publishArguments = args[1] as string[];
          snapshotPath = publishArguments[publishArguments.indexOf('--js-path') + 1] ?? '';
          return child;
        }) as never,
      );
      child.stdout.emit('data', Buffer.alloc(1_000_001));
      child.emit('close', 1, 'SIGKILL');
      await expect(publish).rejects.toThrow(/did not complete successfully/i);
      expect(child.kill).toHaveBeenCalledWith('SIGKILL');
      expect(snapshotPath).not.toBe('');
      expect(() => statSync(snapshotPath)).toThrow();
    });
  });

  it('rejects unknown publisher flags and noncanonical production coordinates', () => {
    expect(parsePublishArguments([
      '--resource-rollout-stage=prebackfill',
      '--genesis-world-stage=pre-expansion',
      '--worker-rollout-stage=empty',
    ])).toEqual({
      dryRun: false,
      resourceRolloutStage: RESOURCE_PUBLISH_ROLLOUT_STAGE.PREBACKFILL,
      genesisWorldRolloutStage: GENESIS_WORLD_PUBLISH_STAGE.PRE_EXPANSION,
      workerRolloutStage: WORKER_PUBLISH_ROLLOUT_STAGE.EMPTY,
    });
    expect(parsePublishArguments([
      '--resource-rollout-stage=ready',
      '--genesis-world-stage=expanded',
      '--worker-rollout-stage=empty',
      '--dry-run',
    ])).toEqual({
      dryRun: true,
      resourceRolloutStage: RESOURCE_PUBLISH_ROLLOUT_STAGE.READY,
      genesisWorldRolloutStage: GENESIS_WORLD_PUBLISH_STAGE.EXPANDED,
      workerRolloutStage: WORKER_PUBLISH_ROLLOUT_STAGE.EMPTY,
    });
    expect(() => parsePublishArguments([])).toThrow(/explicit resource rollout stage/i);
    expect(() => parsePublishArguments(['--dry-run'])).toThrow(/explicit resource rollout stage/i);
    expect(() => parsePublishArguments(['--dryrun'])).toThrow(/unknown or duplicate/i);
    expect(() => parsePublishArguments([
      '--dry-run',
      '--dry-run',
      '--resource-rollout-stage=prebackfill',
      '--genesis-world-stage=pre-expansion',
      '--worker-rollout-stage=empty',
    ])).toThrow(/unknown or duplicate/i);
    expect(() => parsePublishArguments([
      '--resource-rollout-stage=prebackfill',
      '--resource-rollout-stage=ready',
      '--genesis-world-stage=pre-expansion',
      '--worker-rollout-stage=empty',
    ])).toThrow(/unknown or duplicate/i);
    expect(() => parsePublishArguments([
      '--resource-rollout-stage=unknown',
      '--genesis-world-stage=pre-expansion',
      '--worker-rollout-stage=empty',
    ])).toThrow(/unknown or duplicate/i);
    expect(() => parsePublishArguments([
      '--resource-rollout-stage=ready',
      '--worker-rollout-stage=empty',
    ])).toThrow(/explicit Genesis world stage/i);
    expect(() => parsePublishArguments([
      '--resource-rollout-stage=ready',
      '--genesis-world-stage=pre-expansion',
      '--genesis-world-stage=expanded',
      '--worker-rollout-stage=empty',
    ])).toThrow(/unknown or duplicate/i);
    expect(() => parsePublishArguments([
      '--resource-rollout-stage=ready',
      '--genesis-world-stage=expanded',
    ])).toThrow(/explicit empty Worker rollout stage/i);
    expect(() => parsePublishArguments([
      '--resource-rollout-stage=ready',
      '--genesis-world-stage=expanded',
      '--worker-rollout-stage=unknown',
    ])).toThrow(/unknown or duplicate/i);
    expect(() => parsePublishArguments([
      '--resource-rollout-stage=ready',
      '--genesis-world-stage=expanded',
      '--worker-rollout-stage=empty',
      '--worker-rollout-stage=empty',
    ])).toThrow(/unknown or duplicate/i);
    expect(() => requireCanonicalPublishCoordinates({
      WARPKEEP_SPACETIMEDB_DATABASE: 'warpkeep-lookalike',
    })).toThrow(/canonical existing/i);
    expect(() => requireCanonicalPublishCoordinates({
      WARPKEEP_SPACETIMEDB_DATABASE: 'warpkeep-89e4u',
      WARPKEEP_SPACETIMEDB_URI: 'https://maincloud.spacetimedb.com',
    })).not.toThrow();
  });

  it('requires exact canonical founded-state expectations for a live republish', () => {
    const expectations = readFoundedPublishExpectations({
      WARPKEEP_EXPECTED_FOUNDER_COUNT: '4',
      WARPKEEP_EXPECTED_PLAYER_COUNT: '1',
      WARPKEEP_EXPECTED_TERMS_ACCEPTANCE_COUNT: '1',
    });
    expect(expectations).toEqual({
      expectedFounderCount: 4,
      expectedPlayerCount: 1,
      expectedTermsAcceptanceCount: 1,
    });
    expect(Object.isFrozen(expectations)).toBe(true);
    expect(readFoundedPublishExpectations({
      WARPKEEP_EXPECTED_FOUNDER_COUNT: '4',
      WARPKEEP_EXPECTED_PLAYER_COUNT: '0',
      WARPKEEP_EXPECTED_TERMS_ACCEPTANCE_COUNT: '0',
    })).toEqual({
      expectedFounderCount: 4,
      expectedPlayerCount: 0,
      expectedTermsAcceptanceCount: 0,
    });
    expect(readFoundedPublishExpectations({
      WARPKEEP_EXPECTED_FOUNDER_COUNT: '4',
      WARPKEEP_EXPECTED_PLAYER_COUNT: '1',
      WARPKEEP_EXPECTED_TERMS_ACCEPTANCE_COUNT: '2',
    })).toEqual({
      expectedFounderCount: 4,
      expectedPlayerCount: 1,
      expectedTermsAcceptanceCount: 2,
    });
    expect(readFoundedPublishExpectations({
      WARPKEEP_EXPECTED_FOUNDER_COUNT: '100',
      WARPKEEP_EXPECTED_PLAYER_COUNT: '100',
      WARPKEEP_EXPECTED_TERMS_ACCEPTANCE_COUNT: '300',
    })).toEqual({
      expectedFounderCount: 100,
      expectedPlayerCount: 100,
      expectedTermsAcceptanceCount: 300,
    });

    expect(() => readFoundedPublishExpectations({
      WARPKEEP_EXPECTED_PLAYER_COUNT: '0',
      WARPKEEP_EXPECTED_TERMS_ACCEPTANCE_COUNT: '0',
    })).toThrow(/EXPECTED_FOUNDER_COUNT.*canonical integer/i);
    expect(() => readFoundedPublishExpectations({
      WARPKEEP_EXPECTED_FOUNDER_COUNT: '04',
      WARPKEEP_EXPECTED_PLAYER_COUNT: '1',
      WARPKEEP_EXPECTED_TERMS_ACCEPTANCE_COUNT: '1',
    })).toThrow(/canonical integer/i);
    expect(() => readFoundedPublishExpectations({
      WARPKEEP_EXPECTED_FOUNDER_COUNT: '4',
      WARPKEEP_EXPECTED_TERMS_ACCEPTANCE_COUNT: '0',
    })).toThrow(/EXPECTED_PLAYER_COUNT.*canonical integer/i);
    expect(() => readFoundedPublishExpectations({
      WARPKEEP_EXPECTED_FOUNDER_COUNT: '4',
      WARPKEEP_EXPECTED_PLAYER_COUNT: '0',
    })).toThrow(/EXPECTED_TERMS_ACCEPTANCE_COUNT.*canonical integer/i);
    expect(() => readFoundedPublishExpectations({
      WARPKEEP_EXPECTED_FOUNDER_COUNT: '4',
      WARPKEEP_EXPECTED_PLAYER_COUNT: '01',
      WARPKEEP_EXPECTED_TERMS_ACCEPTANCE_COUNT: '0',
    })).toThrow(/EXPECTED_PLAYER_COUNT.*canonical integer/i);
    expect(() => readFoundedPublishExpectations({
      WARPKEEP_EXPECTED_FOUNDER_COUNT: '4',
      WARPKEEP_EXPECTED_PLAYER_COUNT: '1',
      WARPKEEP_EXPECTED_TERMS_ACCEPTANCE_COUNT: '01',
    })).toThrow(/EXPECTED_TERMS_ACCEPTANCE_COUNT.*canonical integer/i);
    expect(() => readFoundedPublishExpectations({
      WARPKEEP_EXPECTED_FOUNDER_COUNT: '3',
      WARPKEEP_EXPECTED_PLAYER_COUNT: '4',
      WARPKEEP_EXPECTED_TERMS_ACCEPTANCE_COUNT: '1',
    })).toThrow(/expectations were invalid/i);
    expect(() => readFoundedPublishExpectations({
      WARPKEEP_EXPECTED_FOUNDER_COUNT: '3',
      WARPKEEP_EXPECTED_PLAYER_COUNT: '1',
      WARPKEEP_EXPECTED_TERMS_ACCEPTANCE_COUNT: '5',
    })).toThrow(/expectations were invalid/i);
    expect(() => readFoundedPublishExpectations({
      WARPKEEP_EXPECTED_FOUNDER_COUNT: '100',
      WARPKEEP_EXPECTED_PLAYER_COUNT: '100',
      WARPKEEP_EXPECTED_TERMS_ACCEPTANCE_COUNT: '401',
    })).toThrow(/EXPECTED_TERMS_ACCEPTANCE_COUNT.*canonical integer/i);
  });

  it('pins the exact CLI build and canonical existing database identity', () => {
    expect(() => verifyPinnedCliAttestation(
      'spacetimedb tool version 2.6.1; Commit: 052c83fe984a4c4eb7bb4f9afa5c6b1903891d87',
      '4d76214ab1ba1462bd1500739641ec1c8322f99529d899c28612bfa665ccdfc6',
      'darwin',
      'arm64',
    )).not.toThrow();
    expect(() => verifyPinnedCliAttestation(
      'spacetimedb tool version 2.6.2; Commit: other',
      '4d76214ab1ba1462bd1500739641ec1c8322f99529d899c28612bfa665ccdfc6',
      'darwin',
      'arm64',
    )).toThrow(/exact reviewed/i);
    expect(() => verifyCanonicalDatabaseList(
      'warpkeep-89e4u   | c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e\n',
    )).not.toThrow();
    expect(() => verifyCanonicalDatabaseList(
      'warpkeep-89e4u   | a2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e\n',
    )).toThrow(/identity/i);
  });

  it('runs the exact founded protocol-v3 aggregate as the fresh pre-publication hard stop', () => {
    const calls: unknown[][] = [];
    const invariantFields = [
      'orphanedPlayerRowsV2',
      'orphanedOwnershipRowsV2',
      'orphanedCastleClaims',
      'orphanedCastles',
      'orphanedRealmProfiles',
      'orphanedMarkAccounts',
      'orphanedBurnCredits',
      'orphanedTermsAcceptances',
      'founderStateGaps',
      'markAccountInvariantViolations',
      'publicMarkProjectionViolations',
      'duplicateBurnReferences',
      'burnAccountReconciliationViolations',
      'ambiguousActiveWalletAddresses',
      'staticWorldDriftViolations',
      'termsAcceptanceInvariantViolations',
    ];
    const fakeSpawnSync = (...args: unknown[]) => {
      calls.push(args);
      return {
      status: 0,
      signal: null,
      stdout: JSON.stringify({
        worldTiles: '1261',
        occupiedWorldTiles: '4',
        worldTileMeta: '1261',
        realms: '1',
        castleSlots: '100',
        castleSlotClaims: '4',
        legacyPlayers: '0',
        playersV2: '1',
        playerOwnershipsV2: '1',
        castles: '4',
        realmProfiles: '4',
        markAccounts: '4',
        snapBurnCredits: '0',
        walletAttributions: '0',
        walletAttributionSnapshots: '0',
        scanCursors: '0',
        scanBatches: '0',
        alphaTermsAcceptances: '1',
        allowedFids: '4',
        enabledAllowedFids: '4',
        auditEntries: '7',
        ...Object.fromEntries(invariantFields.map(field => [field, '0'])),
        protocolVersion: 3,
        worldSeed: 3_445_214_658,
        worldSeedName: 'HEGEMONY_GENESIS_001',
      }),
      stderr: '',
      };
    };
    const testSecret = 'TEST_ONLY_HERMES_SECRET_'.repeat(2);
    expect(() => verifyFreshFoundedProtocolV3Aggregate(
      testSecret,
      {
        expectedFounderCount: 4,
        expectedPlayerCount: 1,
        expectedTermsAcceptanceCount: 1,
      },
      fakeSpawnSync,
    )).not.toThrow();
    expect(calls[0]?.[1]).toEqual([
      resolve(repositoryRoot, 'node_modules/tsx/dist/cli.mjs'),
      'scripts/hermes-admin.ts',
      'inspect-alpha-v3',
      '--json',
    ]);
    const options = calls[0]?.[2] as { env?: Record<string, string>; input?: string };
    expect(options.env).toMatchObject({
      WARPKEEP_SPACETIMEDB_DATABASE: CANONICAL_DATABASE_IDENTITY,
      WARPKEEP_SPACETIMEDB_URI: 'https://maincloud.spacetimedb.com',
    });
    expect(options.input).toBe(testSecret);
    expect(Object.keys(options.env ?? {}).sort()).toEqual([
      'WARPKEEP_ADMIN_TOKEN_SECRET_STDIN',
      'WARPKEEP_AUTH_BRIDGE_URL',
      'WARPKEEP_SPACETIMEDB_DATABASE',
      'WARPKEEP_SPACETIMEDB_URI',
    ]);
    expect(JSON.stringify(calls[0]?.[1])).not.toContain(testSecret);
    expect(JSON.stringify(options.env)).not.toContain(testSecret);

    expect(() => verifyFreshFoundedProtocolV3Aggregate(
      testSecret,
      {
        expectedFounderCount: 5,
        expectedPlayerCount: 1,
        expectedTermsAcceptanceCount: 1,
      },
      fakeSpawnSync,
    )).toThrow(/did not match the required rollout stage/i);
    expect(() => verifyFreshFoundedProtocolV3Aggregate(
      testSecret,
      {
        expectedFounderCount: 4,
        expectedPlayerCount: 1,
        expectedTermsAcceptanceCount: 1,
        extra: true,
      },
      fakeSpawnSync,
    )).toThrow(/expectations are required/i);
    expect(() => verifyFreshFoundedProtocolV3Aggregate(
      testSecret,
      {
        expectedFounderCount: 4,
        expectedPlayerCount: 1,
        expectedTermsAcceptanceCount: 1,
      },
      fakeSpawnSync,
      GENESIS_WORLD_PUBLISH_STAGE.EXPANDED,
    )).toThrow(/did not match the required rollout stage/i);

    const postPublishFailure = () => verifyPostPublishFoundedProtocolV3Aggregate(
      'TEST_ONLY_HERMES_SECRET_'.repeat(2),
      {
        expectedFounderCount: 4,
        expectedPlayerCount: 1,
        expectedTermsAcceptanceCount: 1,
      },
      (() => ({ status: 1, signal: null, stdout: '', stderr: '' })) as never,
    );
    expect(postPublishFailure).toThrow(/fresh read-only inspection/i);
    expect(postPublishFailure).not.toThrow(/no publish was attempted/i);
    expect(postPublishFailure).not.toThrow(/retry/i);
  });

  it('runs an exact counts-only resource procedure-v4 checkpoint only for post-publish pre-backfill state', () => {
    const calls: unknown[][] = [];
    const aggregate = {
      allowedFids: '4',
      castles: '4',
      markAccounts: '4',
      resourceAccounts: '0',
      missingResourceAccounts: '4',
      orphanedResourceAccounts: '0',
      resourceInvariantViolations: '0',
      protocolVersion: 3,
      resourcePolicyVersion: 'genesis-resource-yield-v1',
    };
    const fakeSpawnSync = (...args: unknown[]) => {
      calls.push(args);
      return {
        status: 0,
        signal: null,
        stdout: JSON.stringify(aggregate),
        stderr: '',
      };
    };
    const testSecret = 'TEST_ONLY_HERMES_SECRET_'.repeat(2);
    expect(() => verifyFreshResourceProtocolV4PrebackfillAggregate(
      testSecret,
      4,
      fakeSpawnSync,
    )).not.toThrow();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[1]).toEqual([
      resolve(repositoryRoot, 'node_modules/tsx/dist/cli.mjs'),
      'scripts/hermes-admin.ts',
      'inspect-alpha-v4',
      '--json',
    ]);
    const options = calls[0]?.[2] as {
      env?: Record<string, string>;
      input?: string;
      timeout?: number;
      maxBuffer?: number;
      killSignal?: string;
    };
    expect(options).toMatchObject({
      input: testSecret,
      timeout: 30_000,
      maxBuffer: 1_000_000,
      killSignal: 'SIGKILL',
    });
    expect(options.env).toEqual({
      WARPKEEP_SPACETIMEDB_URI: 'https://maincloud.spacetimedb.com',
      WARPKEEP_SPACETIMEDB_DATABASE: CANONICAL_DATABASE_IDENTITY,
      WARPKEEP_AUTH_BRIDGE_URL: 'https://auth.warpkeep.com',
      WARPKEEP_ADMIN_TOKEN_SECRET_STDIN: '1',
    });
    expect(JSON.stringify(calls[0]?.[1])).not.toContain(testSecret);
    expect(JSON.stringify(options.env)).not.toContain(testSecret);

    expect(() => verifyFreshResourceProtocolV4PrebackfillAggregate(
      testSecret,
      5,
      fakeSpawnSync,
    )).toThrow(/pre-backfill state/i);
    expect(() => verifyFreshResourceProtocolV4PrebackfillAggregate(
      testSecret,
      0,
      fakeSpawnSync,
    )).toThrow(/founder count was invalid/i);

    const readyAggregate = {
      ...aggregate,
      resourceAccounts: '4',
      missingResourceAccounts: '0',
    };
    const readySpawn = vi.fn(() => ({
      status: 0,
      signal: null,
      stdout: JSON.stringify(readyAggregate),
      stderr: '',
    }));
    expect(() => verifyFreshResourceProtocolV4ReadyAggregate(
      testSecret,
      4,
      readySpawn as never,
    )).not.toThrow();
    expect(readySpawn).toHaveBeenCalledOnce();
    expect(() => verifyFreshResourceProtocolV4ReadyAggregate(
      testSecret,
      4,
      fakeSpawnSync,
    )).toThrow(/post-backfill ready state/i);

    const postPublishFailure = () => verifyPostPublishResourceProtocolV4PrebackfillAggregate(
      testSecret,
      4,
      (() => ({ status: 1, signal: null, stdout: '', stderr: '' })) as never,
    );
    expect(postPublishFailure).toThrow(/indeterminate.*fresh read-only inspection/i);
    expect(postPublishFailure).not.toThrow(/retry/i);
    expect(postPublishFailure).not.toThrow(/no publish was attempted/i);
    const postReadyFailure = () => verifyPostPublishResourceProtocolV4ReadyAggregate(
      testSecret,
      4,
      (() => ({ status: 1, signal: null, stdout: '', stderr: '' })) as never,
    );
    expect(postReadyFailure).toThrow(/ready.*indeterminate.*fresh read-only inspection/i);
    expect(postReadyFailure).not.toThrow(/retry/i);

    const orderedFailureCalls: unknown[][] = [];
    const orderedFailureSpawn = (...args: unknown[]) => {
      orderedFailureCalls.push(args);
      return {
        status: 1,
        signal: null,
        stdout: '',
        stderr: '',
      };
    };
    expect(() => verifyPostPublishResourcePublicationCheckpoints(
      testSecret,
      {
        expectedFounderCount: 4,
        expectedPlayerCount: 1,
        expectedTermsAcceptanceCount: 1,
      },
      RESOURCE_PUBLISH_ROLLOUT_STAGE.PREBACKFILL,
      WORKER_PUBLISH_ROLLOUT_STAGE.EMPTY,
      orderedFailureSpawn as never,
    )).toThrow(/combined protocol-v3\/v4\/v8\/v10\/v12 checkpoint is indeterminate/i);
    expect(orderedFailureCalls).toHaveLength(1);
    expect(orderedFailureCalls[0]?.[1]).toEqual([
      resolve(repositoryRoot, 'node_modules/tsx/dist/cli.mjs'),
      'scripts/hermes-admin.ts',
      'inspect-publish-post-v12',
      '--json',
    ]);
    expect(() => verifyPostPublishResourcePublicationCheckpoints(
      testSecret,
      {
        expectedFounderCount: 4,
        expectedPlayerCount: 1,
        expectedTermsAcceptanceCount: 1,
      },
      'unknown',
      WORKER_PUBLISH_ROLLOUT_STAGE.EMPTY,
      orderedFailureSpawn as never,
    )).toThrow(/rollout stage was invalid/i);
    expect(() => verifyPostPublishResourcePublicationCheckpoints(
      testSecret,
      {
        expectedFounderCount: 4,
        expectedPlayerCount: 1,
        expectedTermsAcceptanceCount: 1,
      },
      RESOURCE_PUBLISH_ROLLOUT_STAGE.PREBACKFILL,
      'staged',
      orderedFailureSpawn as never,
    )).toThrow(/Worker rollout stage was invalid/i);
  });

  it('uses exactly one bounded token-bearing child before and after publish for every aggregate checkpoint', () => {
    const secret = 'TEST_ONLY_HERMES_SECRET_'.repeat(2);
    const expectations = {
      expectedFounderCount: 4,
      expectedPlayerCount: 1,
      expectedTermsAcceptanceCount: 1,
    };
    const preEnvelope = {
      protocolV3: publishProtocolV3Status(),
      resourceV4: publishResourceV4Status(),
    };
    const postEnvelope = {
      ...preEnvelope,
      alphaV8: alphaStatusV8(),
      alphaV10: alphaStatusV10(),
      workerV12: alphaStatusV12(),
    };
    const calls: unknown[][] = [];
    const fakeSpawnSync = (...args: unknown[]) => {
      calls.push(args);
      const childArguments = args[1] as string[];
      return {
        status: 0,
        signal: null,
        stdout: JSON.stringify(childArguments.includes('inspect-publish-pre-v12')
          ? preEnvelope
          : postEnvelope),
        stderr: '',
      };
    };

    expect(verifyFreshPublishPreV12Aggregate(
      secret,
      expectations,
      RESOURCE_PUBLISH_ROLLOUT_STAGE.PREBACKFILL,
      fakeSpawnSync as never,
    )).toEqual(preEnvelope);
    expect(verifyPostPublishCombinedV12Aggregate(
      secret,
      expectations,
      RESOURCE_PUBLISH_ROLLOUT_STAGE.PREBACKFILL,
      WORKER_PUBLISH_ROLLOUT_STAGE.EMPTY,
      fakeSpawnSync as never,
    )).toEqual(postEnvelope);

    expect(calls).toHaveLength(2);
    expect(calls[0]?.[0]).toBe(process.execPath);
    expect(calls[0]?.[1]).toEqual(publishPreV12AggregateChildArguments(
      resolve(repositoryRoot, 'node_modules/tsx/dist/cli.mjs'),
    ));
    expect(calls[1]?.[0]).toBe(process.execPath);
    expect(calls[1]?.[1]).toEqual(publishPostV12AggregateChildArguments(
      resolve(repositoryRoot, 'node_modules/tsx/dist/cli.mjs'),
    ));
    const preOptions = calls[0]?.[2] as {
      env?: Record<string, string>;
      input?: string;
      timeout?: number;
      maxBuffer?: number;
      killSignal?: string;
    };
    const postOptions = calls[1]?.[2] as typeof preOptions;
    expect(preOptions).toMatchObject({
      input: secret,
      timeout: 90_000,
      maxBuffer: 1_000_000,
      killSignal: 'SIGKILL',
    });
    expect(postOptions).toMatchObject({
      input: secret,
      timeout: 150_000,
      maxBuffer: 1_000_000,
      killSignal: 'SIGKILL',
    });
    for (const [index, options] of [preOptions, postOptions].entries()) {
      expect(options.env).toEqual({
        WARPKEEP_SPACETIMEDB_URI: 'https://maincloud.spacetimedb.com',
        WARPKEEP_SPACETIMEDB_DATABASE: CANONICAL_DATABASE_IDENTITY,
        WARPKEEP_AUTH_BRIDGE_URL: ISSUER,
        WARPKEEP_ADMIN_TOKEN_SECRET_STDIN: '1',
      });
      expect(JSON.stringify(calls[index]?.[1])).not.toContain(secret);
      expect(JSON.stringify(options.env)).not.toContain(secret);
    }
  });

  it('rejects malformed or identity-bearing combined publication envelopes', () => {
    const preEnvelope = {
      protocolV3: publishProtocolV3Status(),
      resourceV4: publishResourceV4Status(),
    };
    const postEnvelope = {
      ...preEnvelope,
      alphaV8: alphaStatusV8(),
      alphaV10: alphaStatusV10(),
      workerV12: alphaStatusV12(),
    };
    expect(verifyPrivacySafePublishPreV12Output(JSON.stringify(preEnvelope)))
      .toEqual(preEnvelope);
    expect(verifyPrivacySafePublishPostV12Output(JSON.stringify(postEnvelope)))
      .toEqual(postEnvelope);
    for (const invalid of [
      '',
      '[]',
      JSON.stringify({ ...preEnvelope, token: 'private' }),
      JSON.stringify({ protocolV3: preEnvelope.protocolV3 }),
      JSON.stringify({ ...preEnvelope, resourceV4: [] }),
    ]) {
      expect(() => verifyPrivacySafePublishPreV12Output(invalid)).toThrow();
    }
    for (const invalid of [
      JSON.stringify({ ...postEnvelope, fid: '539854' }),
      JSON.stringify({ ...postEnvelope, alphaV10: null }),
      JSON.stringify({
        ...postEnvelope,
        workerV12: { ...postEnvelope.workerV12, token: 'private' },
      }),
    ]) {
      const spawn = vi.fn(() => ({
        status: 0,
        signal: null,
        stdout: invalid,
        stderr: '',
      }));
      expect(() => verifyPostPublishCombinedV12Aggregate(
        'TEST_ONLY_HERMES_SECRET_'.repeat(2),
        {
          expectedFounderCount: 4,
          expectedPlayerCount: 1,
          expectedTermsAcceptanceCount: 1,
        },
        RESOURCE_PUBLISH_ROLLOUT_STAGE.PREBACKFILL,
        WORKER_PUBLISH_ROLLOUT_STAGE.EMPTY,
        spawn as never,
      )).toThrow(/combined protocol-v3\/v4\/v8\/v10\/v12 checkpoint is indeterminate/i);
      expect(spawn).toHaveBeenCalledOnce();
    }
  });

  it('requires one closed, privacy-safe v8 checkpoint after publication and before seeding', () => {
    const calls: unknown[][] = [];
    const aggregate = alphaStatusV8();
    const fakeSpawnSync = (...args: unknown[]) => {
      calls.push(args);
      return {
        status: 0,
        signal: null,
        stdout: JSON.stringify(aggregate),
        stderr: '',
      };
    };
    const secret = 'TEST_ONLY_HERMES_SECRET_'.repeat(2);
    expect(verifyFreshAlphaStatusV8Aggregate(secret, fakeSpawnSync)).toEqual(aggregate);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toBe(process.execPath);
    expect(calls[0]?.[1]).toEqual(alphaV8AggregateChildArguments(
      resolve(repositoryRoot, 'node_modules/tsx/dist/cli.mjs'),
    ));
    const options = calls[0]?.[2] as { env?: Record<string, string>; input?: string };
    expect(options.input).toBe(secret);
    expect(options.env).toEqual({
      WARPKEEP_SPACETIMEDB_URI: 'https://maincloud.spacetimedb.com',
      WARPKEEP_SPACETIMEDB_DATABASE: CANONICAL_DATABASE_IDENTITY,
      WARPKEEP_AUTH_BRIDGE_URL: ISSUER,
      WARPKEEP_ADMIN_TOKEN_SECRET_STDIN: '1',
    });
    expect(JSON.stringify(calls[0]?.[1])).not.toContain(secret);
    expect(JSON.stringify(options.env)).not.toContain(secret);
    expect(() => verifyPostPublishAlphaStatusV8Aggregate(secret, fakeSpawnSync))
      .not.toThrow();

    for (const invalid of [
      { ...aggregate, fid: '424242424242' },
      { ...aggregate, goldSites: 0 },
      { ...aggregate, goldSites: '00' },
      { ...aggregate, goldSites: '18446744073709551616' },
      { ...aggregate, schemaProtocolVersion: 7 },
      { ...aggregate, canonicalGoldSiteCatalogDigest: 'not-a-digest' },
    ]) {
      expect(() => verifyPrivacySafeAlphaStatusV8Output(JSON.stringify(invalid)))
        .toThrow();
    }

    const postPublishFailure = () => verifyPostPublishAlphaStatusV8Aggregate(
      secret,
      (() => ({ status: 1, signal: null, stdout: 'private', stderr: 'private' })) as never,
    );
    expect(postPublishFailure).toThrow(/read-only v8 inspection.*before any component seed/i);
    expect(postPublishFailure).not.toThrow(/private/i);
    expect(postPublishFailure).not.toThrow(/retry/i);
  });

  it('requires one closed, privacy-safe v10 checkpoint after publication', () => {
    const calls: unknown[][] = [];
    const aggregate = alphaStatusV10();
    const fakeSpawnSync = (...args: unknown[]) => {
      calls.push(args);
      return {
        status: 0,
        signal: null,
        stdout: JSON.stringify(aggregate),
        stderr: '',
      };
    };
    const secret = 'TEST_ONLY_HERMES_SECRET_'.repeat(2);
    expect(verifyFreshAlphaStatusV10Aggregate(secret, fakeSpawnSync)).toEqual(aggregate);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[1]).toEqual(alphaV10AggregateChildArguments(
      resolve(repositoryRoot, 'node_modules/tsx/dist/cli.mjs'),
    ));
    const options = calls[0]?.[2] as { env?: Record<string, string>; input?: string };
    expect(options.input).toBe(secret);
    expect(options.env).toEqual({
      WARPKEEP_SPACETIMEDB_URI: 'https://maincloud.spacetimedb.com',
      WARPKEEP_SPACETIMEDB_DATABASE: CANONICAL_DATABASE_IDENTITY,
      WARPKEEP_AUTH_BRIDGE_URL: ISSUER,
      WARPKEEP_ADMIN_TOKEN_SECRET_STDIN: '1',
    });
    expect(JSON.stringify(calls[0]?.[1])).not.toContain(secret);
    expect(JSON.stringify(options.env)).not.toContain(secret);
    expect(() => verifyPostPublishAlphaStatusV10Aggregate(secret, fakeSpawnSync))
      .not.toThrow();

    for (const invalid of [
      { ...aggregate, fid: '424242424242' },
      { ...aggregate, waterCells: 0 },
      { ...aggregate, waterCells: '00' },
      { ...aggregate, stoneSites: '18446744073709551616' },
      { ...aggregate, schemaProtocolVersion: 9 },
      { ...aggregate, waterActivated: 'false' },
      { ...aggregate, canonicalWaterLayoutDigest: 'not-a-digest' },
    ]) {
      expect(() => verifyPrivacySafeAlphaStatusV10Output(JSON.stringify(invalid)))
        .toThrow();
    }

    const postPublishFailure = () => verifyPostPublishAlphaStatusV10Aggregate(
      secret,
      (() => ({ status: 1, signal: null, stdout: 'private', stderr: 'private' })) as never,
    );
    expect(postPublishFailure).toThrow(/read-only v10 inspection.*Water or Stone activation/i);
    expect(postPublishFailure).not.toThrow(/private/i);
    expect(postPublishFailure).not.toThrow(/retry/i);
  });

  it('requires the exact empty and inert Worker v12 checkpoint after publication', () => {
    const calls: unknown[][] = [];
    const aggregate = alphaStatusV12();
    const fakeSpawnSync = (...args: unknown[]) => {
      calls.push(args);
      return {
        status: 0,
        signal: null,
        stdout: JSON.stringify(aggregate),
        stderr: '',
      };
    };
    const secret = 'TEST_ONLY_HERMES_SECRET_'.repeat(2);
    expect(verifyFreshAlphaStatusV12Aggregate(secret, 4, fakeSpawnSync))
      .toEqual(aggregate);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[1]).toEqual(alphaV12AggregateChildArguments(
      resolve(repositoryRoot, 'node_modules/tsx/dist/cli.mjs'),
    ));
    const options = calls[0]?.[2] as { env?: Record<string, string>; input?: string };
    expect(options.input).toBe(secret);
    expect(options.env).toEqual({
      WARPKEEP_SPACETIMEDB_URI: 'https://maincloud.spacetimedb.com',
      WARPKEEP_SPACETIMEDB_DATABASE: CANONICAL_DATABASE_IDENTITY,
      WARPKEEP_AUTH_BRIDGE_URL: ISSUER,
      WARPKEEP_ADMIN_TOKEN_SECRET_STDIN: '1',
    });
    expect(JSON.stringify(calls[0]?.[1])).not.toContain(secret);
    expect(JSON.stringify(options.env)).not.toContain(secret);
    expect(() => verifyPostPublishAlphaStatusV12Aggregate(secret, 4, fakeSpawnSync))
      .not.toThrow();

    for (const invalid of [
      { ...aggregate, fid: '424242424242' },
      { ...aggregate, assignments: 0 },
      { ...aggregate, assignments: '00' },
      { ...aggregate, assignments: '18446744073709551616' },
      { ...aggregate, systemConfigValid: 'false' },
      { ...aggregate, mode: 'disabled' },
      { ...aggregate, rosterDigestExpected: 'not-a-digest' },
    ]) {
      expect(() => verifyPrivacySafeAlphaStatusV12Output(JSON.stringify(invalid)))
        .toThrow();
    }
    for (const nonempty of [
      { ...aggregate, systemRows: '1' },
      { ...aggregate, mode: 'staged' },
      { ...aggregate, systemConfigValid: true },
      { ...aggregate, legacyDrainRequired: false },
      { ...aggregate, expectedCountsMatch: true },
      { ...aggregate, rosterDigestMatches: true },
      { ...aggregate, castlesMissingWorkers: '3' },
      { ...aggregate, actualWorkerCount: '1' },
      { ...aggregate, assignments: '1' },
      { ...aggregate, occupations: '1' },
      { ...aggregate, schedules: '1' },
      { ...aggregate, idempotencyReceipts: '1' },
      { ...aggregate, rosterDigest: '0123456789abcdef' },
    ]) {
      expect(() => verifyEmptyAlphaStatusV12(
        verifyPrivacySafeAlphaStatusV12Output(JSON.stringify(nonempty)),
        4,
      )).toThrow(/empty, inert Worker suffix/i);
    }
    expect(() => verifyEmptyAlphaStatusV12(
      verifyPrivacySafeAlphaStatusV12Output(JSON.stringify(aggregate)),
      0,
    )).toThrow(/expected founder count/i);

    const postPublishFailure = () => verifyPostPublishAlphaStatusV12Aggregate(
      secret,
      4,
      (() => ({ status: 1, signal: null, stdout: 'private', stderr: 'private' })) as never,
    );
    expect(postPublishFailure).toThrow(/read-only v12 inspection.*before any merge/i);
    expect(postPublishFailure).not.toThrow(/private|retry/i);
  });

  it('enforces a hard deadline with graceful then forced termination', async () => {
    vi.useFakeTimers();
    const child = new EventEmitter() as EventEmitter & { kill: ReturnType<typeof vi.fn> };
    child.kill = vi.fn();
    await withTestProvenArtifact(async receipt => {
      const publish = publishModule(
        'spacetime',
        CANONICAL_DATABASE_IDENTITY,
        receipt,
        (() => child) as never,
      );
      const rejection = expect(publish).rejects.toThrow(/hard deadline/i);

      await vi.advanceTimersByTimeAsync(120_000);
      expect(child.kill).toHaveBeenCalledWith('SIGTERM');
      child.emit('error', new Error('test-only signal delivery failure'));
      await vi.advanceTimersByTimeAsync(5_000);
      expect(child.kill).toHaveBeenCalledWith('SIGKILL');
      child.emit('error', new Error('test-only forced-kill delivery failure'));
      await rejection;
    });
  });

  it('contains loopback-server spawn errors and awaits close after forced cleanup', async () => {
    vi.useFakeTimers();
    const child = new EventEmitter() as EventEmitter & {
      exitCode: number | null;
      signalCode: NodeJS.Signals | null;
      kill: ReturnType<typeof vi.fn>;
    };
    child.exitCode = null;
    child.signalCode = null;
    child.kill = vi.fn(() => true);
    containServerProcessErrors(child);
    expect(() => child.emit('error', new Error('test-only-startup-failure'))).not.toThrow();

    let completed = false;
    const cleanup = stopServer(child, 100, 100).then(() => { completed = true; });
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    await vi.advanceTimersByTimeAsync(100);
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    expect(completed).toBe(false);
    child.emit('close', null, 'SIGKILL');
    await cleanup;
    expect(completed).toBe(true);
  });

  it('fails closed when a killed loopback child never reports close', async () => {
    vi.useFakeTimers();
    const child = new EventEmitter() as EventEmitter & {
      exitCode: number | null;
      signalCode: NodeJS.Signals | null;
      kill: ReturnType<typeof vi.fn>;
    };
    child.exitCode = null;
    child.signalCode = null;
    child.kill = vi.fn(() => true);

    const cleanup = stopServer(child, 100, 100);
    const rejection = expect(cleanup).rejects.toThrow(/cleanup deadline/i);
    await vi.advanceTimersByTimeAsync(200);
    await rejection;
    expect(child.listenerCount('close')).toBe(0);
  });

  it('removes private migration data when loopback cleanup reaches its hard deadline', async () => {
    vi.useFakeTimers();
    const dataDirectory = await mkdtemp(join(tmpdir(), 'warpkeep-cleanup-test-'));
    await writeFile(join(dataDirectory, 'cli.toml'), 'test-only-private-credential');
    const child = new EventEmitter() as EventEmitter & {
      exitCode: number | null;
      signalCode: NodeJS.Signals | null;
      kill: ReturnType<typeof vi.fn>;
    };
    child.exitCode = null;
    child.signalCode = null;
    child.kill = vi.fn(() => true);

    try {
      const cleanup = cleanupMigrationProofResources(child, dataDirectory, 100, 100);
      const rejection = expect(cleanup).rejects.toThrow(/cleanup deadline/i);
      await vi.advanceTimersByTimeAsync(200);
      await rejection;
      await expect(stat(dataDirectory)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(dataDirectory, { recursive: true, force: true });
    }
  });

  it('preserves the live-server failure when directory removal also fails', async () => {
    vi.useFakeTimers();
    const child = new EventEmitter() as EventEmitter & {
      exitCode: number | null;
      signalCode: NodeJS.Signals | null;
      kill: ReturnType<typeof vi.fn>;
    };
    child.exitCode = null;
    child.signalCode = null;
    child.kill = vi.fn(() => true);
    const removeDirectory = vi.fn(async () => {
      throw new Error('test-only-removal-failure');
    });

    const cleanup = cleanupMigrationProofResources(
      child,
      '/test-only-private-migration-directory',
      100,
      100,
      removeDirectory,
    );
    const rejection = expect(cleanup).rejects.toThrow(/cleanup deadline/i);
    await vi.advanceTimersByTimeAsync(200);
    await rejection;
    expect(removeDirectory).toHaveBeenCalledTimes(1);
  });

  it('runs one synchronous cleanup and exits with the received signal status', () => {
    const processTarget = new EventEmitter() as EventEmitter & {
      exit: ReturnType<typeof vi.fn>;
    };
    processTarget.exit = vi.fn();
    const cleanup = vi.fn();
    const remove = installMigrationProofSignalCleanup(cleanup, processTarget);

    processTarget.emit('SIGINT');
    processTarget.emit('SIGTERM');

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(processTarget.exit).toHaveBeenCalledTimes(1);
    expect(processTarget.exit).toHaveBeenCalledWith(130);
    expect(processTarget.listenerCount('SIGINT')).toBe(0);
    expect(processTarget.listenerCount('SIGTERM')).toBe(0);
    expect(() => remove()).not.toThrow();
  });

  it('fails closed without exposing signal-cleanup errors', () => {
    const processTarget = new EventEmitter() as EventEmitter & {
      exit: ReturnType<typeof vi.fn>;
    };
    processTarget.exit = vi.fn();
    const cleanup = vi.fn(() => {
      throw new Error('test-only-private-cleanup-detail');
    });
    installMigrationProofSignalCleanup(cleanup, processTarget);

    expect(() => processTarget.emit('SIGTERM')).not.toThrow();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(processTarget.exit).toHaveBeenCalledWith(1);
    expect(processTarget.listenerCount('SIGINT')).toBe(0);
    expect(processTarget.listenerCount('SIGTERM')).toBe(0);
  });

  it('returns a failing status when dry-run issuer configuration is absent', () => {
    const result = spawnSync(process.execPath, [
      'scripts/publish-spacetime-dev.mjs',
      '--dry-run',
      '--resource-rollout-stage=prebackfill',
      '--genesis-world-stage=pre-expansion',
      '--worker-rollout-stage=empty',
    ], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: {},
      timeout: 5_000,
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('WARPKEEP_OIDC_ISSUER is required');
  });

  it('requires the founded-state expectation contract even for a dry run', () => {
    const result = spawnSync(process.execPath, [
      'scripts/publish-spacetime-dev.mjs',
      '--dry-run',
      '--resource-rollout-stage=prebackfill',
      '--genesis-world-stage=pre-expansion',
      '--worker-rollout-stage=empty',
    ], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: { WARPKEEP_OIDC_ISSUER: ISSUER },
      timeout: 5_000,
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('WARPKEEP_EXPECTED_FOUNDER_COUNT');
  });
});

describe('bounded auth-v2 production readiness verification', () => {
  afterEach(() => vi.restoreAllMocks());

  it('preserves the explicit legacy-compatible mode for the currently contained service', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const fetchImpl = legacyBridgeFetch();

    await expect(verifyBridge(FRONTEND, ISSUER, { fetchImpl })).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(8);
    expect(log).toHaveBeenCalledWith(
      'bridge: legacy-compatible health, discovery, JWKS, and strict CORS verified (auth-v2 gate not requested)',
    );
  });

  it('attests contained auth-v2 using only bounded GET and OPTIONS requests', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const fetchImpl = authV2BridgeFetch();

    await expect(verifyBridge(FRONTEND, ISSUER, {
      requireAuthV2: true,
      fetchImpl,
    })).resolves.toBeUndefined();

    expect(fetchImpl).toHaveBeenCalledTimes(22);
    for (const [input, init] of fetchImpl.mock.calls) {
      const url = new URL(String(input));
      const headers = new Headers(init?.headers);
      expect(url.origin).toBe(ISSUER);
      expect(init?.method ?? 'GET').toMatch(/^(?:GET|OPTIONS)$/);
      expect(init?.body).toBeUndefined();
      expect(init?.redirect).toBe('manual');
      expect(init?.cache).toBe('no-store');
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect(headers.has('authorization')).toBe(false);
      expect(headers.has('cookie')).toBe(false);
      if (
        AUTH_V2_CREDENTIAL_PATHS.has(url.pathname)
        || url.pathname === '/v1/farcaster/challenge'
        || url.pathname === '/v1/farcaster/exchange'
      ) {
        expect(headers.get('access-control-request-method')).toBe('POST');
        expect(headers.get('access-control-request-headers')).toBe('content-type');
        expect([FRONTEND, 'https://not-warpkeep.invalid']).toContain(headers.get('origin'));
      }
      if (AUTH_V2_SERVER_ONLY_ADMIN_PATHS.has(url.pathname)) {
        expect([FRONTEND, 'https://not-warpkeep.invalid']).toContain(headers.get('origin'));
        if (init?.method === 'OPTIONS') {
          expect(headers.get('access-control-request-method')).toBe('POST');
          expect(headers.get('access-control-request-headers')).toBe('authorization, content-type');
        } else {
          expect(headers.has('access-control-request-method')).toBe(false);
          expect(headers.has('access-control-request-headers')).toBe(false);
        }
      }
    }
    for (const pathname of AUTH_V2_SERVER_ONLY_ADMIN_PATHS) {
      const calls = fetchImpl.mock.calls.filter(([input]) => new URL(String(input)).pathname === pathname);
      expect(calls).toHaveLength(3);
      expect(calls.map(([, init]) => init?.method)).toEqual(['GET', 'OPTIONS', 'OPTIONS']);
    }
    expect(log).toHaveBeenCalledWith(
      'bridge: contained auth-v2 health, discovery, JWKS, retired v1, security headers, and credentialed CORS verified',
    );
  });

  it('attests enabled auth-v2 without creating challenge or session state', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const fetchImpl = authV2BridgeFetch({ publicAuthEnabled: true });

    await expect(verifyBridge(FRONTEND, ISSUER, {
      requireAuthV2Enabled: true,
      fetchImpl,
    })).resolves.toBeUndefined();

    expect(fetchImpl).toHaveBeenCalledTimes(22);
    for (const [input, init] of fetchImpl.mock.calls) {
      const url = new URL(String(input));
      const headers = new Headers(init?.headers);
      expect(url.origin).toBe(ISSUER);
      expect(init?.method ?? 'GET').toMatch(/^(?:GET|OPTIONS)$/);
      expect(init?.body).toBeUndefined();
      expect(init?.redirect).toBe('manual');
      expect(init?.cache).toBe('no-store');
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect(headers.has('authorization')).toBe(false);
      expect(headers.has('cookie')).toBe(false);
      expect(headers.has('x-fid')).toBe(false);
    }
    for (const pathname of AUTH_V2_SERVER_ONLY_ADMIN_PATHS) {
      const calls = fetchImpl.mock.calls.filter(([input]) => new URL(String(input)).pathname === pathname);
      expect(calls).toHaveLength(3);
      expect(calls.map(([, init]) => init?.method)).toEqual(['GET', 'OPTIONS', 'OPTIONS']);
    }
    expect(log).toHaveBeenCalledWith(
      'bridge: enabled auth-v2 read-only health, discovery, JWKS, retired v1, security headers, and credentialed CORS verified',
    );
  });

  it.each([
    [
      'a disabled public-auth switch',
      { publicAuthEnabled: false },
      /enabled Warpkeep security profile/i,
    ],
    [
      'paused public routes behind an enabled health response',
      { publicAuthEnabled: true, publicRoutesPaused: true },
      /enabled preflight did not return an empty HTTP 204 response/i,
    ],
  ] as const)(
    'fails the enabled auth-v2 gate for %s',
    async (_label, options, expectedError) => {
      vi.spyOn(console, 'log').mockImplementation(() => undefined);
      await expect(verifyBridge(FRONTEND, ISSUER, {
        requireAuthV2Enabled: true,
        fetchImpl: authV2BridgeFetch(options),
      })).rejects.toThrow(expectedError);
    },
  );

  it.each([...AUTH_V2_SERVER_ONLY_ADMIN_PATHS])(
    'fails closed when allowed-origin GET exposes CORS on %s',
    async (pathname) => {
      vi.spyOn(console, 'log').mockImplementation(() => undefined);
      await expect(verifyBridge(FRONTEND, ISSUER, {
        requireAuthV2Enabled: true,
        fetchImpl: authV2BridgeFetch({
          publicAuthEnabled: true,
          adminCorsLeak: { pathname, method: 'GET', origin: FRONTEND },
        }),
      })).rejects.toThrow(/exposed browser CORS/i);
    },
  );

  it.each([
    ...[...AUTH_V2_SERVER_ONLY_ADMIN_PATHS].map(pathname => [pathname, FRONTEND] as const),
    ...[...AUTH_V2_SERVER_ONLY_ADMIN_PATHS].map(pathname => [pathname, 'https://not-warpkeep.invalid'] as const),
  ])(
    'fails closed when an admin preflight exposes CORS on %s to %s',
    async (pathname, origin) => {
      vi.spyOn(console, 'log').mockImplementation(() => undefined);
      await expect(verifyBridge(FRONTEND, ISSUER, {
        requireAuthV2Enabled: true,
        fetchImpl: authV2BridgeFetch({
          publicAuthEnabled: true,
          adminCorsLeak: { pathname, method: 'OPTIONS', origin },
        }),
      })).rejects.toThrow(/exposed browser CORS/i);
    },
  );

  it('rejects simultaneous paused and enabled auth-v2 library modes', async () => {
    await expect(verifyBridge(FRONTEND, ISSUER, {
      requireAuthV2: true,
      requireAuthV2Enabled: true,
      fetchImpl: authV2BridgeFetch(),
    })).rejects.toThrow(/mutually exclusive/i);
  });

  it.each([
    [
      'a legacy health document',
      { health: { ok: true, service: 'warpkeep-auth-bridge' } },
      /contained Warpkeep security profile/i,
    ],
    [
      'an enabled public-auth switch',
      {
        health: {
          ok: true,
          service: 'warpkeep-auth-bridge',
          securityProfile: 'warpkeep-auth-v2',
          publicAuthEnabled: true,
        },
      },
      /contained Warpkeep security profile/i,
    ],
    [
      'incomplete v2 discovery claims',
      { discoveryClaims: AUTH_V2_CLAIMS.slice(0, -1) },
      /exact required profile and claims/i,
    ],
    [
      'a missing HSTS policy',
      { omitSecurityHeader: 'strict-transport-security' },
      /exact strict-transport-security security header/i,
    ],
    [
      'a non-retired v1 route',
      { legacyNotRetired: true },
      /retired bridge .* returned HTTP 204/i,
    ],
    [
      'non-credentialed v2 CORS',
      { omitCredentialedCors: true },
      /exact credentialed browser CORS/i,
    ],
    [
      'hostile-origin credentialed CORS',
      { exposeHostileCors: true },
      /exposed browser CORS to an untrusted origin/i,
    ],
    [
      'v2 routes that are not demonstrably paused',
      { publicRoutesNotPaused: true },
      /paused check returned HTTP 204/i,
    ],
  ] as const)(
    'fails the explicit auth-v2 gate for %s',
    async (_label, options, expectedError) => {
      vi.spyOn(console, 'log').mockImplementation(() => undefined);
      await expect(verifyBridge(FRONTEND, ISSUER, {
        requireAuthV2: true,
        fetchImpl: authV2BridgeFetch(options),
      })).rejects.toThrow(expectedError);
    },
  );
});

describe('bounded frontend root-asset verification', () => {
  it('rejects a document with more than the fixed unique root-asset count', () => {
    const tags = Array.from({ length: 17 }, (_, index) => (
      `<script type="module" src="/assets/root-${index}.js"></script>`
    )).join('');
    expect(() => rootAssetUrls(tags, FRONTEND)).toThrow(/too many root application assets/i);
  });

  it('verifies root assets sequentially under one cumulative byte budget', async () => {
    const assets = [
      new URL('/assets/root-a.js', FRONTEND),
      new URL('/assets/root-b.js', FRONTEND),
      new URL('/assets/root.css', FRONTEND),
    ];
    let active = 0;
    let maximumActive = 0;
    const result = await verifyRootAssets(assets, undefined, async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise<void>(resolvePromise => queueMicrotask(resolvePromise));
      active -= 1;
      return { byteLength: 1, shaMatches: false };
    });
    expect(result).toEqual({ totalBytes: 3, shaMatches: false });
    expect(maximumActive).toBe(1);

    const budgets: number[] = [];
    await expect(verifyRootAssets(assets, undefined, async (
      _asset: URL,
      _sha: string | undefined,
      maximumBytes: number,
    ) => {
      budgets.push(maximumBytes);
      return { byteLength: maximumBytes, shaMatches: false };
    })).rejects.toThrow(/cumulative byte limit/i);
    expect(budgets).toEqual([16_000_000, 8_000_000]);
  });
});

describe('protected aggregate child isolation', () => {
  const additiveV2Aggregate = Object.freeze({
    worldTiles: '61',
    legacyPlayers: '0',
    playersV2: '0',
    playerOwnershipsV2: '0',
    consistentPlayerPairsV2: '0',
    orphanedPlayerRowsV2: '0',
    orphanedOwnershipRowsV2: '0',
    castles: '0',
    allowedFids: '0',
    enabledAllowedFids: '0',
    auditEntries: '2',
    protocolVersion: 2,
    worldSeed: 3_445_214_658,
    worldSeedName: 'HEGEMONY_GENESIS_001',
  });

  const v3InvariantFields = Object.freeze([
    'orphanedPlayerRowsV2',
    'orphanedOwnershipRowsV2',
    'orphanedCastleClaims',
    'orphanedCastles',
    'orphanedRealmProfiles',
    'orphanedMarkAccounts',
    'orphanedBurnCredits',
    'orphanedTermsAcceptances',
    'founderStateGaps',
    'markAccountInvariantViolations',
    'publicMarkProjectionViolations',
    'duplicateBurnReferences',
    'burnAccountReconciliationViolations',
    'ambiguousActiveWalletAddresses',
    'staticWorldDriftViolations',
    'termsAcceptanceInvariantViolations',
  ]);
  const additiveV3PreseedAggregate = Object.freeze({
    worldTiles: '61',
    occupiedWorldTiles: '0',
    worldTileMeta: '0',
    realms: '0',
    castleSlots: '0',
    castleSlotClaims: '0',
    legacyPlayers: '0',
    playersV2: '0',
    playerOwnershipsV2: '0',
    castles: '0',
    realmProfiles: '0',
    markAccounts: '0',
    snapBurnCredits: '0',
    walletAttributions: '0',
    walletAttributionSnapshots: '0',
    scanCursors: '0',
    scanBatches: '0',
    alphaTermsAcceptances: '0',
    allowedFids: '0',
    enabledAllowedFids: '0',
    auditEntries: '2',
    ...Object.fromEntries(v3InvariantFields.map(field => [field, '0'])),
    protocolVersion: 3,
    worldSeed: 3_445_214_658,
    worldSeedName: 'HEGEMONY_GENESIS_001',
  });
  const genesisV3SeededEmptyAggregate = Object.freeze({
    ...additiveV3PreseedAggregate,
    worldTiles: '1261',
    worldTileMeta: '1261',
    realms: '1',
    castleSlots: '100',
    auditEntries: '3',
  });
  const genesisV3FoundedAggregate = Object.freeze({
    ...genesisV3SeededEmptyAggregate,
    occupiedWorldTiles: '3',
    castleSlotClaims: '3',
    castles: '3',
    realmProfiles: '3',
    markAccounts: '3',
    allowedFids: '3',
    enabledAllowedFids: '3',
    auditEntries: '6',
  });
  const authenticatedGenesisV3FoundedAggregate = Object.freeze({
    ...genesisV3FoundedAggregate,
    playersV2: '1',
    playerOwnershipsV2: '1',
    alphaTermsAcceptances: '1',
  });
  const historicalAndCurrentEntryAgreementAggregate = Object.freeze({
    ...authenticatedGenesisV3FoundedAggregate,
    alphaTermsAcceptances: '2',
  });
  const completeEntryAgreementHistoryAggregate = Object.freeze({
    ...authenticatedGenesisV3FoundedAggregate,
    alphaTermsAcceptances: '4',
  });
  const genesisGenerationV3FoundedAggregate = Object.freeze({
    ...genesisV3FoundedAggregate,
    worldTiles: '10000',
    worldTileMeta: '10000',
  });

  it('accepts only exact legacy and additive-v2 aggregate objects', () => {
    expect(() => verifyExpectedAlphaAggregate(JSON.stringify({
      worldTiles: '61',
      allowedFids: '0',
      enabledAllowedFids: '0',
      players: '0',
      castles: '0',
    }))).not.toThrow();
    expect(() => verifyExpectedAlphaV2Aggregate(JSON.stringify(additiveV2Aggregate))).not.toThrow();
  });

  it('accepts exact protocol and world-generation rollout aggregate stages', () => {
    expect(() => verifyExpectedAlphaV3Aggregate(
      JSON.stringify(additiveV3PreseedAggregate),
      PROTECTED_AGGREGATE_STAGE.ADDITIVE_V3_PRESEED,
    )).not.toThrow();
    expect(() => verifyExpectedAlphaV3Aggregate(
      JSON.stringify(genesisV3SeededEmptyAggregate),
      PROTECTED_AGGREGATE_STAGE.GENESIS_V3_SEEDED_EMPTY,
    )).not.toThrow();
    expect(() => verifyExpectedAlphaV3Aggregate(
      JSON.stringify(genesisV3FoundedAggregate),
      PROTECTED_AGGREGATE_STAGE.GENESIS_V3_FOUNDED,
      3,
    )).not.toThrow();
    expect(() => verifyExpectedAlphaV3Aggregate(
      JSON.stringify(authenticatedGenesisV3FoundedAggregate),
      PROTECTED_AGGREGATE_STAGE.GENESIS_V3_FOUNDED,
      3,
      1,
      1,
    )).not.toThrow();
    expect(() => verifyExpectedAlphaV3Aggregate(
      JSON.stringify(historicalAndCurrentEntryAgreementAggregate),
      PROTECTED_AGGREGATE_STAGE.GENESIS_V3_FOUNDED,
      3,
      1,
      2,
    )).not.toThrow();
    expect(() => verifyExpectedAlphaV3Aggregate(
      JSON.stringify(genesisGenerationV3FoundedAggregate),
      PROTECTED_AGGREGATE_STAGE.GENESIS_GENERATION_V3_FOUNDED,
      3,
    )).not.toThrow();
    expect(() => verifyExpectedAlphaV3Aggregate(
      JSON.stringify(genesisV3FoundedAggregate),
      PROTECTED_AGGREGATE_STAGE.GENESIS_GENERATION_V3_FOUNDED,
      3,
    )).toThrow(/rollout stage/i);
  });

  it('accepts only the exact counts-only resource procedure-v4 pre-backfill aggregate', () => {
    const aggregate = {
      allowedFids: '3',
      castles: '3',
      markAccounts: '3',
      resourceAccounts: '0',
      missingResourceAccounts: '3',
      orphanedResourceAccounts: '0',
      resourceInvariantViolations: '0',
      protocolVersion: 3,
      resourcePolicyVersion: 'genesis-resource-yield-v1',
    };
    expect(() => verifyExpectedAlphaV4ResourcePrebackfillAggregate(
      JSON.stringify(aggregate),
      3,
    )).not.toThrow();

    for (const value of [
      { ...aggregate, resourceAccounts: '1', missingResourceAccounts: '2' },
      { ...aggregate, orphanedResourceAccounts: '1' },
      { ...aggregate, resourceInvariantViolations: '1' },
      { ...aggregate, protocolVersion: 4 },
      { ...aggregate, resourcePolicyVersion: 'other' },
      { ...aggregate, fid: '424242424242' },
      { ...aggregate, balance: '200' },
      { ...aggregate, resourceAccounts: 0 },
      { ...aggregate, resourceAccounts: '00' },
    ]) {
      expect(() => verifyExpectedAlphaV4ResourcePrebackfillAggregate(
        JSON.stringify(value),
        3,
      )).toThrow();
    }

    const missing = { ...aggregate } as Record<string, unknown>;
    delete missing.missingResourceAccounts;
    expect(() => verifyExpectedAlphaV4ResourcePrebackfillAggregate(
      JSON.stringify(missing),
      3,
    )).toThrow(/unexpected fields/i);
  });

  it('accepts only the exact counts-only resource procedure-v4 post-backfill ready aggregate', () => {
    const aggregate = {
      allowedFids: '3',
      castles: '3',
      markAccounts: '3',
      resourceAccounts: '3',
      missingResourceAccounts: '0',
      orphanedResourceAccounts: '0',
      resourceInvariantViolations: '0',
      protocolVersion: 3,
      resourcePolicyVersion: 'genesis-resource-yield-v1',
    };
    expect(() => verifyExpectedAlphaV4ResourceReadyAggregate(
      JSON.stringify(aggregate),
      3,
    )).not.toThrow();

    for (const value of [
      { ...aggregate, resourceAccounts: '0', missingResourceAccounts: '3' },
      { ...aggregate, allowedFids: '2' },
      { ...aggregate, castles: '2' },
      { ...aggregate, markAccounts: '2' },
      { ...aggregate, orphanedResourceAccounts: '1' },
      { ...aggregate, resourceInvariantViolations: '1' },
      { ...aggregate, protocolVersion: 4 },
      { ...aggregate, resourcePolicyVersion: 'other' },
      { ...aggregate, fid: '424242424242' },
      { ...aggregate, food: '200' },
      { ...aggregate, resourceAccounts: 3 },
      { ...aggregate, resourceAccounts: '03' },
    ]) {
      expect(() => verifyExpectedAlphaV4ResourceReadyAggregate(
        JSON.stringify(value),
        3,
      )).toThrow();
    }

    const missing = { ...aggregate } as Record<string, unknown>;
    delete missing.resourceInvariantViolations;
    expect(() => verifyExpectedAlphaV4ResourceReadyAggregate(
      JSON.stringify(missing),
      3,
    )).toThrow(/unexpected fields/i);
    expect(() => verifyExpectedAlphaV4ResourceReadyAggregate(
      JSON.stringify(aggregate),
      undefined,
    )).toThrow(/expected founder count/i);
  });

  it.each(v3InvariantFields)(
    'rejects a nonzero protocol-v3 %s invariant at every empty rollout stage',
    field => {
      for (const [stage, fixture] of [
        [PROTECTED_AGGREGATE_STAGE.ADDITIVE_V3_PRESEED, additiveV3PreseedAggregate],
        [PROTECTED_AGGREGATE_STAGE.GENESIS_V3_SEEDED_EMPTY, genesisV3SeededEmptyAggregate],
        [PROTECTED_AGGREGATE_STAGE.GENESIS_V3_FOUNDED, genesisV3FoundedAggregate],
      ] as const) {
        expect(() => verifyExpectedAlphaV3Aggregate(
          JSON.stringify({ ...fixture, [field]: '1' }),
          stage,
          stage === PROTECTED_AGGREGATE_STAGE.GENESIS_V3_FOUNDED ? 3 : undefined,
        )).toThrow(/invariant/i);
      }
    },
  );

  it.each([
    'occupiedWorldTiles',
    'walletAttributionSnapshots',
    'scanBatches',
    'alphaTermsAcceptances',
  ])('rejects rogue protocol-v3 %s rows at every empty rollout stage', field => {
    for (const [stage, fixture] of [
      [PROTECTED_AGGREGATE_STAGE.ADDITIVE_V3_PRESEED, additiveV3PreseedAggregate],
      [PROTECTED_AGGREGATE_STAGE.GENESIS_V3_SEEDED_EMPTY, genesisV3SeededEmptyAggregate],
    ] as const) {
      expect(() => verifyExpectedAlphaV3Aggregate(
        JSON.stringify({ ...fixture, [field]: '1' }),
        stage,
      )).toThrow(/rollout stage/i);
    }
  });

  it.each([
    'legacyPlayers',
    'playersV2',
    'playerOwnershipsV2',
    'snapBurnCredits',
    'walletAttributions',
    'walletAttributionSnapshots',
    'scanCursors',
    'scanBatches',
    'alphaTermsAcceptances',
  ])('rejects rogue protocol-v3 founded-stage %s rows', field => {
    expect(() => verifyExpectedAlphaV3Aggregate(
      JSON.stringify({ ...genesisV3FoundedAggregate, [field]: '1' }),
      PROTECTED_AGGREGATE_STAGE.GENESIS_V3_FOUNDED,
      3,
    )).toThrow(/rollout stage/i);
  });

  it.each([
    ['playersV2', '2'],
    ['playerOwnershipsV2', '2'],
    ['alphaTermsAcceptances', '2'],
  ])('requires authenticated founded-stage %s to match its exact expectation', (field, value) => {
    expect(() => verifyExpectedAlphaV3Aggregate(
      JSON.stringify({ ...authenticatedGenesisV3FoundedAggregate, [field]: value }),
      PROTECTED_AGGREGATE_STAGE.GENESIS_V3_FOUNDED,
      3,
      1,
      1,
    )).toThrow(/rollout stage/i);
  });

  it('keeps founded-stage authenticated count expectations at zero by default', () => {
    expect(() => verifyExpectedAlphaV3Aggregate(
      JSON.stringify(authenticatedGenesisV3FoundedAggregate),
      PROTECTED_AGGREGATE_STAGE.GENESIS_V3_FOUNDED,
      3,
    )).toThrow(/rollout stage/i);
  });

  it('allows every supported immutable entry-agreement row per player and rejects another', () => {
    expect(() => verifyExpectedAlphaV3Aggregate(
      JSON.stringify(historicalAndCurrentEntryAgreementAggregate),
      PROTECTED_AGGREGATE_STAGE.GENESIS_V3_FOUNDED,
      3,
      1,
      2,
    )).not.toThrow();
    expect(() => verifyExpectedAlphaV3Aggregate(
      JSON.stringify(authenticatedGenesisV3FoundedAggregate),
      PROTECTED_AGGREGATE_STAGE.GENESIS_V3_FOUNDED,
      3,
      1,
      2,
    )).toThrow(/rollout stage/i);
    expect(() => verifyExpectedAlphaV3Aggregate(
      JSON.stringify(completeEntryAgreementHistoryAggregate),
      PROTECTED_AGGREGATE_STAGE.GENESIS_V3_FOUNDED,
      3,
      1,
      4,
    )).not.toThrow();
    expect(() => verifyExpectedAlphaV3Aggregate(
      JSON.stringify(authenticatedGenesisV3FoundedAggregate),
      PROTECTED_AGGREGATE_STAGE.GENESIS_V3_FOUNDED,
      3,
      1,
      5,
    )).toThrow(/entry-agreement row count was invalid/i);
  });

  it.each([
    [PROTECTED_AGGREGATE_STAGE.ADDITIVE_V3_PRESEED, additiveV3PreseedAggregate],
    [PROTECTED_AGGREGATE_STAGE.GENESIS_V3_SEEDED_EMPTY, genesisV3SeededEmptyAggregate],
  ] as const)('rejects authenticated expectations outside the founded stage: %s', (stage, fixture) => {
    expect(() => verifyExpectedAlphaV3Aggregate(
      JSON.stringify(fixture),
      stage,
      undefined,
      1,
      1,
    )).toThrow(/require the founded aggregate stage/i);
  });

  it.each([
    ['player count', genesisV3FoundedAggregate, 4, 0],
    ['entry-agreement row count', authenticatedGenesisV3FoundedAggregate, 1, 5],
  ])('rejects an expected %s above its bounded aggregate limit', (_label, aggregate, players, terms) => {
    expect(() => verifyExpectedAlphaV3Aggregate(
      JSON.stringify(aggregate),
      PROTECTED_AGGREGATE_STAGE.GENESIS_V3_FOUNDED,
      3,
      players,
      terms,
    )).toThrow(/was invalid/i);
  });

  it.each([
    'occupiedWorldTiles',
    'castleSlotClaims',
    'castles',
    'realmProfiles',
    'markAccounts',
    'allowedFids',
    'enabledAllowedFids',
  ])('requires founded-stage %s to equal the private expected count', field => {
    expect(() => verifyExpectedAlphaV3Aggregate(
      JSON.stringify({ ...genesisV3FoundedAggregate, [field]: '2' }),
      PROTECTED_AGGREGATE_STAGE.GENESIS_V3_FOUNDED,
      3,
    )).toThrow(/rollout stage/i);
  });

  it.each([
    ['missing field', (() => {
      const value = { ...additiveV3PreseedAggregate } as Record<string, unknown>;
      delete value.markAccounts;
      return value;
    })()],
    ['unexpected identity-shaped field', { ...additiveV3PreseedAggregate, identity: 'forbidden' }],
    ['numeric u64 count', { ...additiveV3PreseedAggregate, markAccounts: 0 }],
    ['noncanonical decimal count', { ...additiveV3PreseedAggregate, markAccounts: '00' }],
    ['oversized u64 count', { ...additiveV3PreseedAggregate, markAccounts: '18446744073709551616' }],
    ['wrong protocol type', { ...additiveV3PreseedAggregate, protocolVersion: '3' }],
    ['wrong seed type', { ...additiveV3PreseedAggregate, worldSeed: '3445214658' }],
    ['wrong seed name', { ...additiveV3PreseedAggregate, worldSeedName: 'OTHER' }],
  ])('rejects a protocol-v3 aggregate with %s', (_label, value) => {
    expect(() => verifyExpectedAlphaV3Aggregate(
      JSON.stringify(value),
      PROTECTED_AGGREGATE_STAGE.ADDITIVE_V3_PRESEED,
    )).toThrow();
  });

  it('keeps preseed and seeded-empty state expectations distinct', () => {
    expect(() => verifyExpectedAlphaV3Aggregate(
      JSON.stringify(genesisV3SeededEmptyAggregate),
      PROTECTED_AGGREGATE_STAGE.ADDITIVE_V3_PRESEED,
    )).toThrow(/rollout stage/i);
    expect(() => verifyExpectedAlphaV3Aggregate(
      JSON.stringify(additiveV3PreseedAggregate),
      PROTECTED_AGGREGATE_STAGE.GENESIS_V3_SEEDED_EMPTY,
    )).toThrow(/rollout stage/i);
    expect(() => verifyExpectedAlphaV3Aggregate(
      JSON.stringify(genesisV3SeededEmptyAggregate),
      PROTECTED_AGGREGATE_STAGE.GENESIS_V3_FOUNDED,
      3,
    )).toThrow(/rollout stage/i);
    expect(() => verifyExpectedAlphaV3Aggregate(
      JSON.stringify(genesisV3FoundedAggregate),
      PROTECTED_AGGREGATE_STAGE.GENESIS_V3_SEEDED_EMPTY,
    )).toThrow(/rollout stage/i);
    expect(() => verifyExpectedAlphaV3Aggregate(
      JSON.stringify(genesisV3FoundedAggregate),
      PROTECTED_AGGREGATE_STAGE.GENESIS_V3_FOUNDED,
    )).toThrow(/expected founder count/i);
  });

  it.each([
    ['missing ownership count', (() => {
      const value = { ...additiveV2Aggregate } as Record<string, unknown>;
      delete value.playerOwnershipsV2;
      return value;
    })()],
    ['unexpected identity-shaped field', { ...additiveV2Aggregate, identity: 'forbidden' }],
    ['nonzero orphan count', { ...additiveV2Aggregate, orphanedPlayerRowsV2: '1' }],
    ['wrong protocol', { ...additiveV2Aggregate, protocolVersion: 1 }],
    ['wrong generation', { ...additiveV2Aggregate, worldSeedName: 'OTHER' }],
  ])('rejects a protocol-v2 aggregate with %s', (_label, value) => {
    expect(() => verifyExpectedAlphaV2Aggregate(JSON.stringify(value))).toThrow();
  });

  it('rejects malformed and extra-key legacy aggregate output', () => {
    expect(() => verifyExpectedAlphaAggregate('{')).toThrow(/machine-readable/i);
    expect(() => verifyExpectedAlphaAggregate(JSON.stringify({
      worldTiles: '61',
      allowedFids: '0',
      enabledAllowedFids: '0',
      players: '0',
      castles: '0',
      identity: 'forbidden',
    }))).toThrow(/unexpected fields/i);
  });

  it('passes only the four required values and never forwards the ambient environment', () => {
    process.env.WARPKEEP_UNRELATED_SECRET_SENTINEL = 'must-not-be-forwarded';
    try {
      const child = protectedAggregateChildEnvironment(ISSUER);
      expect(Object.keys(child).sort()).toEqual([
        'WARPKEEP_ADMIN_TOKEN_SECRET_STDIN',
        'WARPKEEP_AUTH_BRIDGE_URL',
        'WARPKEEP_SPACETIMEDB_DATABASE',
        'WARPKEEP_SPACETIMEDB_URI',
      ]);
      expect(JSON.stringify(child)).not.toContain('must-not-be-forwarded');
      expect(JSON.stringify(child)).not.toContain('test-only-secret');
    } finally {
      delete process.env.WARPKEEP_UNRELATED_SECRET_SENTINEL;
    }
  });

  it('hard-kills a hung read-only aggregate child at the fixed deadline', () => {
    const options = protectedAggregateChildOptions(repositoryRoot, ISSUER, 'test-only-secret');
    expect(options).toMatchObject({
      cwd: repositoryRoot,
      encoding: 'utf8',
      maxBuffer: 1_000_000,
      timeout: 30_000,
      killSignal: 'SIGKILL',
    });
    expect(options.input).toBe('test-only-secret');
    expect(JSON.stringify(options.env)).not.toContain('test-only-secret');
  });

  it('selects the exact aggregate command for every rollout stage', () => {
    expect(protectedAggregateChildArguments('/test/tsx', false)).toEqual([
      '/test/tsx', 'scripts/hermes-admin.ts', 'inspect-alpha', '--json',
    ]);
    expect(protectedAggregateChildArguments('/test/tsx', true)).toEqual([
      '/test/tsx', 'scripts/hermes-admin.ts', 'inspect-alpha-v2', '--json',
    ]);
    expect(protectedAggregateChildArguments(
      '/test/tsx',
      PROTECTED_AGGREGATE_STAGE.ADDITIVE_V3_PRESEED,
    )).toEqual([
      '/test/tsx', 'scripts/hermes-admin.ts', 'inspect-alpha-v3', '--json',
    ]);
    expect(protectedAggregateChildArguments(
      '/test/tsx',
      PROTECTED_AGGREGATE_STAGE.GENESIS_V3_SEEDED_EMPTY,
    )).toEqual([
      '/test/tsx', 'scripts/hermes-admin.ts', 'inspect-alpha-v3', '--json',
    ]);
    expect(protectedAggregateChildArguments(
      '/test/tsx',
      PROTECTED_AGGREGATE_STAGE.GENESIS_V3_FOUNDED,
    )).toEqual([
      '/test/tsx', 'scripts/hermes-admin.ts', 'inspect-alpha-v3', '--json',
    ]);
    expect(resourceV4AggregateChildArguments('/test/tsx')).toEqual([
      '/test/tsx', 'scripts/hermes-admin.ts', 'inspect-alpha-v4', '--json',
    ]);
  });

  it('runs founded-v3 and resource-v4 readiness against one immutable child target', () => {
    const calls: unknown[][] = [];
    const secret = 'TEST_ONLY_HERMES_SECRET_'.repeat(2);
    const exactEnvironment = {
      WARPKEEP_SPACETIMEDB_URI: 'https://maincloud.spacetimedb.com',
      WARPKEEP_SPACETIMEDB_DATABASE: CANONICAL_DATABASE_IDENTITY,
    };
    const aggregate = {
      allowedFids: '3',
      castles: '3',
      markAccounts: '3',
      resourceAccounts: '3',
      missingResourceAccounts: '0',
      orphanedResourceAccounts: '0',
      resourceInvariantViolations: '0',
      protocolVersion: 3,
      resourcePolicyVersion: 'genesis-resource-yield-v1',
    };
    const fakeSpawnSync = (...args: unknown[]) => {
      calls.push(args);
      const childArguments = args[1] as string[];
      return {
        status: 0,
        signal: null,
        stdout: JSON.stringify(
          childArguments.includes('inspect-alpha-v3')
            ? authenticatedGenesisV3FoundedAggregate
            : aggregate,
        ),
        stderr: '',
      };
    };
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      expect(() => verifyPostBackfillResourceAggregateCheckpoints(
        ISSUER,
        3,
        1,
        1,
        secret,
        fakeSpawnSync,
        repositoryRoot,
        exactEnvironment,
      )).not.toThrow();
      expect(calls).toHaveLength(2);
      expect(calls[0]?.[0]).toBe(process.execPath);
      expect(calls[0]?.[1]).toEqual([
        resolve(repositoryRoot, 'node_modules/tsx/dist/cli.mjs'),
        'scripts/hermes-admin.ts',
        'inspect-alpha-v3',
        '--json',
      ]);
      expect(calls[1]?.[0]).toBe(process.execPath);
      expect(calls[1]?.[1]).toEqual([
        resolve(repositoryRoot, 'node_modules/tsx/dist/cli.mjs'),
        'scripts/hermes-admin.ts',
        'inspect-alpha-v4',
        '--json',
      ]);
      const options = calls[0]?.[2] as ReturnType<typeof resourceV4ReadyAggregateChildOptions>;
      expect(calls[1]?.[2]).toBe(options);
      expect(options).toEqual(resourceV4ReadyAggregateChildOptions(
        repositoryRoot,
        ISSUER,
        secret,
        exactEnvironment,
      ));
      expect(options.env).toEqual(resourceV4ReadyAggregateChildEnvironment(
        ISSUER,
        exactEnvironment,
      ));
      expect(options.env).toEqual({
        WARPKEEP_SPACETIMEDB_URI: 'https://maincloud.spacetimedb.com',
        WARPKEEP_SPACETIMEDB_DATABASE: CANONICAL_DATABASE_IDENTITY,
        WARPKEEP_AUTH_BRIDGE_URL: 'https://auth.warpkeep.com',
        WARPKEEP_ADMIN_TOKEN_SECRET_STDIN: '1',
      });
      expect(JSON.stringify(options.env)).not.toContain(secret);
      expect(log).toHaveBeenCalledWith(
        'alpha status: required Genesis protocol-v3 founded aggregate state verified',
      );
      expect(log).toHaveBeenCalledWith(
        'alpha status: required resource procedure-v4 ready aggregate state verified',
      );
      expect(JSON.stringify(log.mock.calls)).not.toContain(
        JSON.stringify(authenticatedGenesisV3FoundedAggregate),
      );
      expect(JSON.stringify(log.mock.calls)).not.toContain(JSON.stringify(aggregate));
    } finally {
      log.mockRestore();
    }

    const childFailure = () => verifyPostBackfillResourceAggregateCheckpoints(
      ISSUER,
      3,
      1,
      1,
      secret,
      ((...args: unknown[]) => {
        const childArguments = args[1] as string[];
        return childArguments.includes('inspect-alpha-v3')
          ? {
            status: 0,
            signal: null,
            stdout: JSON.stringify(authenticatedGenesisV3FoundedAggregate),
            stderr: '',
          }
          : { status: 1, signal: null, stdout: 'private', stderr: 'private' };
      }) as never,
      repositoryRoot,
      exactEnvironment,
    );
    expect(childFailure).toThrow(/ready aggregate inspection failed/i);
    expect(childFailure).not.toThrow(/private/i);

    for (const [bridge, environment, expected] of [
      ['https://staging-auth.warpkeep.com', exactEnvironment, /canonical Warpkeep bridge/i],
      [ISSUER, {
        ...exactEnvironment,
        WARPKEEP_SPACETIMEDB_URI: 'https://staging.spacetimedb.com',
      }, /remapped SpacetimeDB URI/i],
      [ISSUER, {
        ...exactEnvironment,
        WARPKEEP_SPACETIMEDB_DATABASE: 'warpkeep-89e4u',
      }, /immutable production database identity/i],
      [ISSUER, {
        ...exactEnvironment,
        WARPKEEP_SPACETIMEDB_DATABASE: 'warpkeep-staging',
      }, /immutable production database identity/i],
    ] as const) {
      expect(() => resourceV4ReadyAggregateChildOptions(
        repositoryRoot,
        bridge,
        secret,
        environment,
      )).toThrow(expected);
      const spawn = vi.fn();
      expect(() => verifyPostBackfillResourceAggregateCheckpoints(
        bridge,
        3,
        1,
        1,
        secret,
        spawn as never,
        repositoryRoot,
        environment,
      )).toThrow(expected);
      expect(spawn).not.toHaveBeenCalled();
    }
    expect(() => resourceV4ReadyAggregateChildOptions(
      repositoryRoot,
      ISSUER,
      'too-short',
      exactEnvironment,
    )).toThrow(/32-to-512-byte Hermes credential/i);
  });

  it('rejects unknown or duplicate production-verifier flags', () => {
    const defaults = {
      requireProtectedAggregate: false,
      requireAdditiveV2Aggregate: false,
      requireAdditiveV3PreseedAggregate: false,
      requireGenesisV3SeededEmptyAggregate: false,
      requireGenesisV3FoundedAggregate: false,
      requireGenesisGenerationV3FoundedAggregate: false,
      requireResourceV4ReadyAggregate: false,
      expectedFounderCount: undefined,
      expectedPlayerCount: 0,
      expectedTermsAcceptanceCount: 0,
      requireAuthV2: false,
      requireAuthV2Enabled: false,
      aggregateStage: PROTECTED_AGGREGATE_STAGE.LEGACY,
    };
    expect(parseProductionVerifierArguments([
      '--require-auth-v2',
      '--require-additive-v2-aggregate',
    ])).toEqual({
      ...defaults,
      requireAdditiveV2Aggregate: true,
      requireAuthV2: true,
      aggregateStage: PROTECTED_AGGREGATE_STAGE.ADDITIVE_V2,
    });
    expect(parseProductionVerifierArguments([
      '--require-auth-v2-enabled',
    ])).toEqual({
      ...defaults,
      requireAuthV2Enabled: true,
    });
    expect(parseProductionVerifierArguments([
      '--require-auth-v2-enabled',
      '--require-additive-v2-aggregate',
    ])).toEqual({
      ...defaults,
      requireAdditiveV2Aggregate: true,
      requireAuthV2Enabled: true,
      aggregateStage: PROTECTED_AGGREGATE_STAGE.ADDITIVE_V2,
    });
    expect(parseProductionVerifierArguments([
      '--require-protected-aggregate',
      '--require-additive-v3-preseed-aggregate',
    ])).toEqual({
      ...defaults,
      requireProtectedAggregate: true,
      requireAdditiveV3PreseedAggregate: true,
      aggregateStage: PROTECTED_AGGREGATE_STAGE.ADDITIVE_V3_PRESEED,
    });
    expect(parseProductionVerifierArguments([
      '--require-genesis-v3-seeded-empty-aggregate',
    ])).toEqual({
      ...defaults,
      requireGenesisV3SeededEmptyAggregate: true,
      aggregateStage: PROTECTED_AGGREGATE_STAGE.GENESIS_V3_SEEDED_EMPTY,
    });
    expect(parseProductionVerifierArguments([
      '--require-genesis-v3-founded-aggregate',
      '--expected-founder-count=3',
    ])).toEqual({
      ...defaults,
      requireGenesisV3FoundedAggregate: true,
      expectedFounderCount: 3,
      aggregateStage: PROTECTED_AGGREGATE_STAGE.GENESIS_V3_FOUNDED,
    });
    expect(parseProductionVerifierArguments([
      '--require-genesis-generation-v3-founded-aggregate',
      '--expected-founder-count=3',
    ])).toEqual({
      ...defaults,
      requireGenesisV3FoundedAggregate: true,
      requireGenesisGenerationV3FoundedAggregate: true,
      expectedFounderCount: 3,
      aggregateStage: PROTECTED_AGGREGATE_STAGE.GENESIS_GENERATION_V3_FOUNDED,
    });
    expect(parseProductionVerifierArguments([
      '--require-auth-v2-enabled',
      '--require-genesis-v3-founded-aggregate',
      '--require-resource-v4-ready-aggregate',
      '--expected-founder-count=4',
      '--expected-player-count=1',
      '--expected-terms-acceptance-count=1',
    ])).toEqual({
      ...defaults,
      requireGenesisV3FoundedAggregate: true,
      requireResourceV4ReadyAggregate: true,
      expectedFounderCount: 4,
      expectedPlayerCount: 1,
      expectedTermsAcceptanceCount: 1,
      requireAuthV2Enabled: true,
      aggregateStage: PROTECTED_AGGREGATE_STAGE.GENESIS_V3_FOUNDED,
    });
    expect(parseProductionVerifierArguments([
      '--require-genesis-v3-founded-aggregate',
      '--expected-founder-count=4',
      '--expected-player-count=1',
      '--expected-terms-acceptance-count=1',
    ])).toEqual({
      ...defaults,
      requireGenesisV3FoundedAggregate: true,
      expectedFounderCount: 4,
      expectedPlayerCount: 1,
      expectedTermsAcceptanceCount: 1,
      aggregateStage: PROTECTED_AGGREGATE_STAGE.GENESIS_V3_FOUNDED,
    });
    expect(parseProductionVerifierArguments([
      '--require-genesis-v3-founded-aggregate',
      '--expected-founder-count=4',
      '--expected-player-count=1',
      '--expected-terms-acceptance-count=2',
    ])).toEqual({
      ...defaults,
      requireGenesisV3FoundedAggregate: true,
      expectedFounderCount: 4,
      expectedPlayerCount: 1,
      expectedTermsAcceptanceCount: 2,
      aggregateStage: PROTECTED_AGGREGATE_STAGE.GENESIS_V3_FOUNDED,
    });
    expect(() => parseProductionVerifierArguments(['--require-auth-v3']))
      .toThrow(/unknown or duplicate/i);
    expect(() => parseProductionVerifierArguments(['--require-genesis-v2-seeded-empty-aggregate']))
      .toThrow(/unknown or duplicate/i);
    expect(() => parseProductionVerifierArguments([
      '--require-auth-v2',
      '--require-auth-v2',
    ])).toThrow(/unknown or duplicate/i);
    expect(() => parseProductionVerifierArguments([
      '--require-auth-v2',
      '--require-auth-v2-enabled',
    ])).toThrow(/mutually exclusive/i);
    expect(() => parseProductionVerifierArguments([
      '--require-additive-v2-aggregate',
      '--require-additive-v3-preseed-aggregate',
    ])).toThrow(/mutually exclusive/i);
    expect(() => parseProductionVerifierArguments([
      '--require-additive-v3-preseed-aggregate',
      '--require-genesis-v3-seeded-empty-aggregate',
    ])).toThrow(/mutually exclusive/i);
    expect(() => parseProductionVerifierArguments([
      '--require-genesis-v3-seeded-empty-aggregate',
      '--require-genesis-v3-founded-aggregate',
      '--expected-founder-count=3',
    ])).toThrow(/mutually exclusive/i);
    expect(() => parseProductionVerifierArguments([
      '--require-resource-v4-ready-aggregate',
    ])).toThrow(/requires the founded protocol-v3 aggregate stage/i);
    expect(() => parseProductionVerifierArguments([
      '--require-resource-v4-ready-aggregate',
      '--require-resource-v4-ready-aggregate',
    ])).toThrow(/unknown or duplicate/i);
  });

  it.each([
    [[
      '--require-genesis-v3-founded-aggregate',
      '--require-resource-v4-ready-aggregate',
      '--expected-founder-count=3',
      '--expected-player-count=0',
    ]],
    [[
      '--require-genesis-v3-founded-aggregate',
      '--require-resource-v4-ready-aggregate',
      '--expected-founder-count=3',
      '--expected-terms-acceptance-count=0',
    ]],
  ])('requires explicit authenticated counts for a resource-v4 readiness check: %j', arguments_ => {
    expect(() => parseProductionVerifierArguments(arguments_))
      .toThrow(/requires explicit player and Terms acceptance counts/i);
  });

  it.each([
    [['--require-genesis-v3-founded-aggregate']],
    [['--expected-founder-count=3']],
    [['--require-additive-v3-preseed-aggregate', '--expected-founder-count=3']],
  ])('requires the founded aggregate flag/count pair: %j', arguments_ => {
    expect(() => parseProductionVerifierArguments(arguments_))
      .toThrow(/supplied together/i);
  });

  it.each([
    [['--expected-player-count=0']],
    [['--expected-terms-acceptance-count=0']],
    [['--require-additive-v3-preseed-aggregate', '--expected-player-count=0']],
  ])('rejects founded authenticated expectations at another stage: %j', arguments_ => {
    expect(() => parseProductionVerifierArguments(arguments_))
      .toThrow(/require the founded aggregate stage/i);
  });

  it.each(['0', '00', '01', '101', '-1', '+1', '1.0', '1e2', 'abc', ''])(
    'rejects invalid expected founder count %j',
    value => {
      expect(() => parseProductionVerifierArguments([
        '--require-genesis-v3-founded-aggregate',
        `--expected-founder-count=${value}`,
      ])).toThrow(/canonical integer/i);
    },
  );

  it('rejects duplicate expected founder counts', () => {
    expect(() => parseProductionVerifierArguments([
      '--require-genesis-v3-founded-aggregate',
      '--expected-founder-count=3',
      '--expected-founder-count=3',
    ])).toThrow(/unknown or duplicate/i);
  });

  it.each(['-1', '00', '01', '+1', '1.0', '1e2', '101', 'abc', ''])
    ('rejects noncanonical or out-of-range expected player counts: %j', value => {
      expect(() => parseProductionVerifierArguments([
        '--require-genesis-v3-founded-aggregate',
        '--expected-founder-count=3',
        `--expected-player-count=${value}`,
      ])).toThrow(/canonical integer/i);
    });

  it.each(['-1', '00', '01', '+1', '1.0', '1e2', '401', 'abc', ''])
    ('rejects noncanonical or globally out-of-range entry-agreement counts: %j', value => {
      expect(() => parseProductionVerifierArguments([
        '--require-genesis-v3-founded-aggregate',
        '--expected-founder-count=3',
        `--expected-terms-acceptance-count=${value}`,
      ])).toThrow(/canonical integer/i);
    });

  it.each([
    '--expected-player-count=1',
    '--expected-terms-acceptance-count=1',
  ])('rejects duplicate authenticated count argument %s', argument => {
    expect(() => parseProductionVerifierArguments([
      '--require-genesis-v3-founded-aggregate',
      '--expected-founder-count=3',
      argument,
      argument,
    ])).toThrow(/unknown or duplicate/i);
  });

  it('rejects an authenticated player count above the expected founder count', () => {
    expect(() => parseProductionVerifierArguments([
      '--require-genesis-v3-founded-aggregate',
      '--expected-founder-count=3',
      '--expected-player-count=4',
    ])).toThrow(/cannot exceed/i);
  });

  it('allows the complete immutable acceptance history per player but fails closed above it', () => {
    expect(parseProductionVerifierArguments([
      '--require-genesis-v3-founded-aggregate',
      '--expected-founder-count=3',
      '--expected-player-count=1',
      '--expected-terms-acceptance-count=4',
    ])).toMatchObject({
      expectedFounderCount: 3,
      expectedPlayerCount: 1,
      expectedTermsAcceptanceCount: 4,
    });
    expect(() => parseProductionVerifierArguments([
      '--require-genesis-v3-founded-aggregate',
      '--expected-founder-count=3',
      '--expected-player-count=1',
      '--expected-terms-acceptance-count=5',
    ])).toThrow(/supported immutable row history/i);
    expect(parseProductionVerifierArguments([
      '--require-genesis-v3-founded-aggregate',
      '--expected-founder-count=100',
      '--expected-player-count=100',
      '--expected-terms-acceptance-count=300',
    ])).toMatchObject({
      expectedFounderCount: 100,
      expectedPlayerCount: 100,
      expectedTermsAcceptanceCount: 300,
    });
  });

  it('fails closed when the activation gate requires an unavailable aggregate credential', () => {
    expect(() => requiredProtectedAggregateSecret(undefined, true))
      .toThrow(/protected aggregate inspection was required/i);
    expect(requiredProtectedAggregateSecret(undefined, false)).toBeUndefined();
  });

  it('does not forward ambient Warpkeep data to the publish CLI', () => {
    const child = publishChildEnvironment({
      PATH: '/test/bin',
      HOME: '/test/home',
      WARPKEEP_UNRELATED_SECRET_SENTINEL: 'must-not-be-forwarded',
      WARPKEEP_ADMIN_TOKEN_SECRET: 'must-not-be-forwarded',
      WARPKEEP_EXPECTED_FOUNDER_COUNT: 'must-not-be-forwarded',
      WARPKEEP_EXPECTED_PLAYER_COUNT: 'must-not-be-forwarded',
      WARPKEEP_EXPECTED_TERMS_ACCEPTANCE_COUNT: 'must-not-be-forwarded',
      SIGNING_KEY_JWK: 'must-not-be-forwarded',
    });
    expect(child).toEqual({ PATH: '/test/bin', HOME: '/test/home' });
    expect(JSON.stringify(child)).not.toContain('must-not-be-forwarded');
  });
});
