import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setGlobalLogLevel, stdbLogger } from 'spacetimedb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GENESIS_RESOURCE_POLICY_VERSION } from '../spacetimedb/src/resourceAuthorityPolicy';
import { configureHermesMachineOutput } from '../scripts/hermes-machine-output';
import {
  admissionReadinessSummary,
  connect,
  parseHermesArguments,
  privacySafeHermesErrorMessage,
  readStatus,
  requestAdminToken,
  requireCredentialedProductionTarget,
  requireFounderAdmissionProductionTarget,
  requireGenesisExpansionProductionTarget,
  requireResourceBackfillProductionTarget,
  resolveAdmissionReadyFounderProfile,
  throwHermesOperationFailure,
  verifyExpectedResourceAggregateV4,
  verifyFounderAdmissionPostconditionV3,
  verifyFounderAdmissionPreconditionV3,
  verifyFounderAdmissionResourcePostconditionV4,
  verifyFounderAdmissionResourcePreconditionV4,
  verifyGenesisExpansionPostconditionV3,
  verifyGenesisExpansionPreconditionV3,
  verifyGenesisExpansionResourceCheckpointV4,
  verifyGenesisExpansionResourcePreservationV4,
  withOperationTimeout,
} from '../scripts/hermes-admin';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tsxCli = resolve(repositoryRoot, 'node_modules/tsx/dist/cli.mjs');
const TEST_SECRET = 'TEST_ONLY_HERMES_SECRET_'.repeat(2);

afterEach(() => {
  vi.useRealTimers();
});

function runHermes(
  args: string[],
  overrides: Record<string, string | undefined> = {},
  input?: string,
) {
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    // Preserve the autonomous runner's one sandbox-authorized IPC namespace.
    // `tsx` creates a short-lived Unix socket before evaluating Hermes; falling
    // back to shared `/tmp` would fail the boundary for the wrong reason.
    TMPDIR: process.env.TMPDIR,
    WARPKEEP_QA_SOCKET_TMP: process.env.WARPKEEP_QA_SOCKET_TMP,
    WARPKEEP_SPACETIMEDB_URI: 'https://maincloud.spacetimedb.com',
    WARPKEEP_SPACETIMEDB_DATABASE: 'warpkeep-89e4u',
    WARPKEEP_AUTH_BRIDGE_URL: 'https://auth.warpkeep.com',
    WARPKEEP_ADMIN_TOKEN_SECRET: TEST_SECRET,
    ...overrides
  };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete env[key];
  }
  return spawnSync(process.execPath, [tsxCli, 'scripts/hermes-admin.ts', ...args], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env,
    input,
    timeout: 5_000
  });
}

function foundedGenerationV2Status(overrides: Record<string, bigint | number | string> = {}) {
  return {
    worldTiles: 1_261n,
    occupiedWorldTiles: 3n,
    worldTileMeta: 1_261n,
    realms: 1n,
    castleSlots: 100n,
    castleSlotClaims: 3n,
    legacyPlayers: 0n,
    playersV2: 2n,
    playerOwnershipsV2: 2n,
    castles: 3n,
    realmProfiles: 3n,
    markAccounts: 3n,
    snapBurnCredits: 2n,
    walletAttributions: 4n,
    walletAttributionSnapshots: 1n,
    scanCursors: 1n,
    scanBatches: 2n,
    alphaTermsAcceptances: 2n,
    allowedFids: 3n,
    enabledAllowedFids: 3n,
    auditEntries: 14n,
    orphanedPlayerRowsV2: 0n,
    orphanedOwnershipRowsV2: 0n,
    orphanedCastleClaims: 0n,
    orphanedCastles: 0n,
    orphanedRealmProfiles: 0n,
    orphanedMarkAccounts: 0n,
    orphanedBurnCredits: 0n,
    orphanedTermsAcceptances: 0n,
    founderStateGaps: 0n,
    markAccountInvariantViolations: 0n,
    publicMarkProjectionViolations: 0n,
    duplicateBurnReferences: 0n,
    burnAccountReconciliationViolations: 0n,
    ambiguousActiveWalletAddresses: 0n,
    staticWorldDriftViolations: 0n,
    termsAcceptanceInvariantViolations: 0n,
    protocolVersion: 3,
    worldSeed: 3_445_214_658,
    worldSeedName: 'HEGEMONY_GENESIS_001',
    ...overrides,
  };
}

function foundedGenerationV3Status(overrides: Record<string, bigint | number | string> = {}) {
  return foundedGenerationV2Status({
    worldTiles: 10_000n,
    worldTileMeta: 10_000n,
    ...overrides,
  });
}

describe('Hermes machine-readable output', () => {
  afterEach(() => {
    setGlobalLogLevel('info');
    vi.restoreAllMocks();
  });

  it('suppresses SpacetimeDB info logs only in machine-readable mode', () => {
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    configureHermesMachineOutput(true);
    stdbLogger('info', 'transport chatter');
    expect(output).not.toHaveBeenCalled();

    configureHermesMachineOutput(false);
    stdbLogger('info', 'human transport status');
    expect(output).toHaveBeenCalledOnce();
  });

  it('never prints arbitrary SDK, transport, or server error messages', () => {
    const sensitive = 'FID 424242; token=private; response-body=private';
    const rendered = privacySafeHermesErrorMessage(new Error(sensitive));
    expect(rendered).toBe('Hermes command failed.');
    expect(rendered).not.toContain('424242');
    expect(rendered).not.toContain('private');
  });

  it('preserves fixed ambiguous-timeout guidance without exposing arbitrary errors', async () => {
    vi.useFakeTimers();
    const rendered = withOperationTimeout(new Promise<never>(() => undefined))
      .catch(error => privacySafeHermesErrorMessage(error));
    await vi.advanceTimersByTimeAsync(15_000);
    await expect(rendered).resolves.toMatch(/may still commit; inspect current state before retrying/i);
  });

  it('maps every failure after a one-use admission claim to fresh-inspection guidance', () => {
    const sensitive = new Error('private FID and server response must not escape');
    let caught: unknown;
    try {
      throwHermesOperationFailure(sensitive, true);
    } catch (error) {
      caught = error;
    }
    const rendered = privacySafeHermesErrorMessage(caught);
    expect(rendered).toMatch(/may have committed.*inspect fresh v3\/v4 aggregate state/i);
    expect(rendered).not.toContain('private FID');
    expect(rendered).not.toContain('server response');
  });

  it('projects the protocol-v2 inspection to an exact aggregate allowlist', async () => {
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const status = {
      worldTiles: 61n,
      legacyPlayers: 0n,
      playersV2: 0n,
      playerOwnershipsV2: 0n,
      consistentPlayerPairsV2: 0n,
      orphanedPlayerRowsV2: 0n,
      orphanedOwnershipRowsV2: 0n,
      castles: 0n,
      allowedFids: 0n,
      enabledAllowedFids: 0n,
      auditEntries: 2n,
      protocolVersion: 2,
      worldSeed: 3_445_214_658,
      worldSeedName: 'HEGEMONY_GENESIS_001',
      identity: 'must-not-escape',
      note: 'must-not-escape',
    };
    const connection = {
      procedures: { adminGetAlphaStatusV2: vi.fn(async () => status) },
    };

    await readStatus(connection as never, 'v2', true);
    expect(output).toHaveBeenCalledOnce();
    const rendered = output.mock.calls[0]?.[0] as string;
    expect(JSON.parse(rendered)).toEqual({
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
    expect(rendered).not.toContain('must-not-escape');
  });

  it('projects protocol-v3 inspection without private rows or identifiers', async () => {
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const zeroFields = Object.fromEntries([
      'worldTiles', 'worldTileMeta', 'realms', 'castleSlots', 'castleSlotClaims',
      'legacyPlayers', 'playersV2', 'playerOwnershipsV2', 'castles', 'realmProfiles',
      'markAccounts', 'snapBurnCredits', 'walletAttributions', 'scanCursors',
      'allowedFids', 'enabledAllowedFids', 'auditEntries', 'orphanedPlayerRowsV2',
      'orphanedOwnershipRowsV2', 'orphanedCastleClaims', 'orphanedCastles',
      'orphanedRealmProfiles', 'orphanedMarkAccounts', 'orphanedBurnCredits',
      'founderStateGaps', 'markAccountInvariantViolations',
      'publicMarkProjectionViolations', 'duplicateBurnReferences',
      'burnAccountReconciliationViolations', 'ambiguousActiveWalletAddresses',
    ].map((key) => [key, 0n]));
    const status = {
      ...zeroFields,
      protocolVersion: 3,
      worldSeed: 3_445_214_658,
      worldSeedName: 'HEGEMONY_GENESIS_001',
      identity: 'must-not-escape',
      walletAddress: 'must-not-escape',
      transactionHash: 'must-not-escape',
    };
    const connection = {
      procedures: { adminGetAlphaStatusV3: vi.fn(async () => status) },
    };

    const safeStatus = await readStatus(connection as never, 'v3', true);
    expect(output).toHaveBeenCalledOnce();
    const rendered = output.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(rendered) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual([
      ...Object.keys(zeroFields),
      'protocolVersion', 'worldSeed', 'worldSeedName',
    ].sort());
    expect(parsed).toMatchObject({
      worldTiles: '0',
      snapBurnCredits: '0',
      ambiguousActiveWalletAddresses: '0',
      protocolVersion: 3,
      worldSeedName: 'HEGEMONY_GENESIS_001',
    });
    expect(rendered).not.toContain('must-not-escape');
    expect(safeStatus).toMatchObject({
      worldTiles: 0n,
      protocolVersion: 3,
      worldSeedName: 'HEGEMONY_GENESIS_001',
    });
  });

  it('projects protocol-v4 inspection to resource counts and policy only', async () => {
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const status = {
      allowedFids: 4n,
      castles: 4n,
      markAccounts: 4n,
      resourceAccounts: 4n,
      missingResourceAccounts: 0n,
      orphanedResourceAccounts: 0n,
      resourceInvariantViolations: 0n,
      protocolVersion: 3,
      resourcePolicyVersion: 'genesis-resource-yield-v1',
      fid: 424_242_424_242n,
      food: 200n,
      identity: 'must-not-escape',
    };
    const connection = {
      procedures: { adminGetAlphaStatusV4: vi.fn(async () => status) },
    };

    await readStatus(connection as never, 'v4', true, 4n);
    expect(output).toHaveBeenCalledOnce();
    const rendered = output.mock.calls[0]?.[0] as string;
    expect(JSON.parse(rendered)).toEqual({
      allowedFids: '4',
      castles: '4',
      markAccounts: '4',
      resourceAccounts: '4',
      missingResourceAccounts: '0',
      orphanedResourceAccounts: '0',
      resourceInvariantViolations: '0',
      protocolVersion: 3,
      resourcePolicyVersion: 'genesis-resource-yield-v1',
    });
    expect(rendered).not.toContain('424242424242');
    expect(rendered).not.toContain('must-not-escape');
  });

  it('requires the exact post-backfill founder graph before reporting success', () => {
    const valid = {
      allowedFids: 4n,
      castles: 4n,
      markAccounts: 4n,
      resourceAccounts: 4n,
      missingResourceAccounts: 0n,
      orphanedResourceAccounts: 0n,
      resourceInvariantViolations: 0n,
      protocolVersion: 3,
      resourcePolicyVersion: 'genesis-resource-yield-v1',
    };
    expect(verifyExpectedResourceAggregateV4(valid, 4n)).toEqual(valid);
    for (const changed of [
      { resourceAccounts: 3n },
      { missingResourceAccounts: 1n },
      { orphanedResourceAccounts: 1n },
      { resourceInvariantViolations: 1n },
      { protocolVersion: 4 },
      { resourcePolicyVersion: 'genesis-resource-yield-v2' },
    ]) {
      expect(() => verifyExpectedResourceAggregateV4({ ...valid, ...changed }, 4n))
        .toThrow(/postcondition failed/i);
    }
    expect(() => verifyExpectedResourceAggregateV4(valid, 0n)).toThrow(/postcondition failed/i);
    expect(() => verifyExpectedResourceAggregateV4(valid, 101n)).toThrow(/postcondition failed/i);
  });

  it('accepts only the exact generation-v2 founded expansion checkpoint', () => {
    const status = foundedGenerationV2Status();
    expect(verifyGenesisExpansionPreconditionV3(status)).toEqual(status);

    for (const changed of [
      { worldTiles: 1_260n },
      { worldTileMeta: 10_000n },
      { realms: 2n },
      { castleSlots: 99n },
      { staticWorldDriftViolations: 1n },
      { orphanedCastleClaims: 1n },
      { playerOwnershipsV2: 1n },
      { enabledAllowedFids: 2n },
      { protocolVersion: 4 },
      { worldSeedName: 'LOOKALIKE_WORLD' },
    ]) {
      expect(() => verifyGenesisExpansionPreconditionV3({ ...status, ...changed }))
        .toThrow(/expansion|checkpoint|founded/i);
    }
  });

  it('preserves either exact pre-backfill or ready private resource aggregates', () => {
    const prebackfill = {
      allowedFids: 3n,
      castles: 3n,
      markAccounts: 3n,
      resourceAccounts: 0n,
      missingResourceAccounts: 3n,
      orphanedResourceAccounts: 0n,
      resourceInvariantViolations: 0n,
      protocolVersion: 3,
      resourcePolicyVersion: GENESIS_RESOURCE_POLICY_VERSION,
    };
    const ready = {
      ...prebackfill,
      resourceAccounts: 3n,
      missingResourceAccounts: 0n,
    };
    expect(verifyGenesisExpansionResourceCheckpointV4(prebackfill)).toEqual(prebackfill);
    expect(verifyGenesisExpansionResourceCheckpointV4(ready)).toEqual(ready);
    expect(verifyGenesisExpansionResourcePreservationV4(ready, ready)).toEqual(ready);

    for (const changed of [
      { resourceAccounts: 1n },
      { missingResourceAccounts: 2n },
      { orphanedResourceAccounts: 1n },
      { resourceInvariantViolations: 1n },
      { resourcePolicyVersion: 'unknown' },
    ]) {
      expect(() => verifyGenesisExpansionResourceCheckpointV4({
        ...prebackfill,
        ...changed,
      })).toThrow(/resource checkpoint was not exact/i);
    }
    expect(() => verifyGenesisExpansionResourcePreservationV4(ready, prebackfill))
      .toThrow(/changed private resource aggregate state/i);
  });

  it('requires an exact 10,000-cell transition that preserves all player state', () => {
    const before = verifyGenesisExpansionPreconditionV3(foundedGenerationV2Status());
    const after = {
      ...before,
      worldTiles: 10_000n,
      worldTileMeta: 10_000n,
      auditEntries: before.auditEntries + 1n,
    };
    expect(verifyGenesisExpansionPostconditionV3(after, before)).toEqual(after);

    expect(() => verifyGenesisExpansionPostconditionV3(
      { ...after, worldTiles: 9_999n },
      before,
    )).toThrow(/postcondition failed/i);
    expect(() => verifyGenesisExpansionPostconditionV3(
      { ...after, playersV2: before.playersV2 + 1n, playerOwnershipsV2: before.playerOwnershipsV2 + 1n },
      before,
    )).toThrow(/changed persistent player state/i);
    expect(() => verifyGenesisExpansionPostconditionV3(
      { ...after, auditEntries: before.auditEntries + 2n },
      before,
    )).toThrow(/audit transition/i);
    expect(() => verifyGenesisExpansionPostconditionV3(
      { ...after, termsAcceptanceInvariantViolations: 1n },
      before,
    )).toThrow(/nonzero termsAcceptanceInvariantViolations/i);
  });

  it('checks exact v3/v4 founder capacity before claim and exact aggregate mutation after submit', () => {
    const before = foundedGenerationV3Status();
    expect(verifyFounderAdmissionPreconditionV3(before)).toEqual(before);
    const beforeResources = {
      allowedFids: 3n,
      castles: 3n,
      markAccounts: 3n,
      resourceAccounts: 3n,
      missingResourceAccounts: 0n,
      orphanedResourceAccounts: 0n,
      resourceInvariantViolations: 0n,
      protocolVersion: 3,
      resourcePolicyVersion: GENESIS_RESOURCE_POLICY_VERSION,
    };
    expect(verifyFounderAdmissionResourcePreconditionV4(beforeResources, 3n))
      .toEqual(beforeResources);

    const after = {
      ...before,
      occupiedWorldTiles: 4n,
      castleSlotClaims: 4n,
      castles: 4n,
      realmProfiles: 4n,
      markAccounts: 4n,
      allowedFids: 4n,
      enabledAllowedFids: 4n,
      auditEntries: before.auditEntries + 1n,
    };
    expect(verifyFounderAdmissionPostconditionV3(after, before)).toEqual(after);
    const afterResources = {
      ...beforeResources,
      allowedFids: 4n,
      castles: 4n,
      markAccounts: 4n,
      resourceAccounts: 4n,
    };
    expect(verifyFounderAdmissionResourcePostconditionV4(afterResources, beforeResources))
      .toEqual(afterResources);

    expect(() => verifyFounderAdmissionPreconditionV3({
      ...before,
      founderStateGaps: 1n,
    })).toThrow(/nonzero founderStateGaps/i);
    expect(() => verifyFounderAdmissionPreconditionV3(foundedGenerationV3Status({
      occupiedWorldTiles: 100n,
      castleSlotClaims: 100n,
      castles: 100n,
      realmProfiles: 100n,
      markAccounts: 100n,
      allowedFids: 100n,
      enabledAllowedFids: 100n,
    }))).toThrow(/capacity-safe/i);
    expect(() => verifyFounderAdmissionResourcePreconditionV4({
      ...beforeResources,
      resourceAccounts: 2n,
      missingResourceAccounts: 1n,
    }, 3n)).toThrow(/resource checkpoint/i);
    expect(() => verifyFounderAdmissionPostconditionV3({
      ...after,
      playersV2: before.playersV2 + 1n,
      playerOwnershipsV2: before.playerOwnershipsV2 + 1n,
    }, before)).toThrow(/unrelated persistent aggregate state/i);
  });
});

describe('Hermes command-line boundary', () => {
  it('rejects unknown, duplicate, misplaced, and extra arguments', () => {
    expect(parseHermesArguments(['inspect-alpha', '--json'])).toMatchObject({
      command: 'inspect-alpha',
      inspection: true,
      machineReadableInspection: true,
    });
    expect(() => parseHermesArguments(['inspect-alpha', '--jsno'])).toThrow(/unknown or duplicate/i);
    expect(() => parseHermesArguments(['inspect-alpha', '--json', '--json'])).toThrow(/unknown or duplicate/i);
    expect(() => parseHermesArguments(['inspect-alpha', '--confirm'])).toThrow(/invalid for this operation/i);
    expect(() => parseHermesArguments(['allow-fid', '123', 'note', '--json'])).toThrow(/invalid for this operation/i);
    expect(parseHermesArguments(['admit-founder', '--input-stdin', '--dry-run'])).toMatchObject({
      command: 'admit-founder',
      inspection: false,
      dryRun: true,
      existingFounderReenableOnly: false,
      privateInputStdin: true,
    });
    expect(parseHermesArguments(['admit-founder', '--input-stdin', '--confirm'])).toMatchObject({
      command: 'admit-founder',
      confirmedByFlag: true,
      privateInputStdin: true,
    });
    expect(parseHermesArguments(['allow-fid', '123', 'note', '--dry-run'])).toMatchObject({
      command: 'allow-fid',
      existingFounderReenableOnly: true,
    });
    expect(() => parseHermesArguments(['admit-founder', '123', 'note', '--dry-run']))
      .toThrow(/unexpected number/i);
    expect(() => parseHermesArguments(['admit-founder', '--dry-run']))
      .toThrow(/private input/i);
    expect(() => parseHermesArguments(['admit-founder', '--input-stdin']))
      .toThrow(/exactly one/i);
    expect(() => parseHermesArguments([
      'admit-founder', '--input-stdin', '--dry-run', '--confirm',
    ])).toThrow(/exactly one/i);
    expect(() => parseHermesArguments(['inspect-alpha', '--input-stdin']))
      .toThrow(/invalid for this operation/i);
    expect(() => parseHermesArguments(['inspect-alpha', 'extra'])).toThrow(/unexpected number/i);
    expect(parseHermesArguments(['inspect-alpha-v4', '--json'])).toMatchObject({
      command: 'inspect-alpha-v4',
      inspection: true,
      machineReadableInspection: true,
    });
    expect(parseHermesArguments(['backfill-resources', '4', '--confirm'])).toMatchObject({
      command: 'backfill-resources',
      inspection: false,
      confirmedByFlag: true,
    });
    expect(() => parseHermesArguments(['backfill-resources', '4', '--json'])).toThrow(/invalid for this operation/i);
    expect(() => parseHermesArguments(['backfill-resources'])).toThrow(/unexpected number/i);
    expect(parseHermesArguments(['expand-world-v3', '--dry-run', '--confirm'])).toMatchObject({
      command: 'expand-world-v3',
      inspection: false,
      dryRun: true,
      confirmedByFlag: true,
    });
    expect(() => parseHermesArguments(['expand-world-v3', '1261', '--confirm']))
      .toThrow(/unexpected number/i);
  });
});

describe('Hermes atomic profiled admission boundary', () => {
  const fid = 12_345n;

  function currentProfileEnvelope(includePfp = true) {
    const fields = [
      ['USER_DATA_TYPE_USERNAME', 'fixture.eth'],
      ['USER_DATA_TYPE_DISPLAY', 'Fixture Keeper'],
      ['USER_DATA_TYPE_BIO', 'Controlled public fixture'],
      ...(includePfp
        ? [['USER_DATA_TYPE_PFP', 'https://images.example/fixture.png']] as const
        : []),
    ];
    return {
      messages: fields.map(([type, value], index) => ({
        data: {
          type: 'MESSAGE_TYPE_USER_DATA_ADD',
          fid: Number(fid),
          timestamp: 10 + index,
          network: 'FARCASTER_NETWORK_MAINNET',
          userDataBody: { type, value },
        },
      })),
      nextPageToken: '',
    };
  }

  it('resolves exactly one complete profile through the pinned public source', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(String(input));
      expect(url.origin).toBe('https://rho.farcaster.xyz:3381');
      expect(url.pathname).toBe('/v1/userDataByFid');
      expect(url.searchParams.get('fid')).toBe(fid.toString());
      expect(init).toMatchObject({ method: 'GET', cache: 'no-store', redirect: 'error' });
      return new Response(JSON.stringify(currentProfileEnvelope()), {
        headers: { 'content-type': 'application/json' },
      });
    });

    await expect(resolveAdmissionReadyFounderProfile(fid, fetchImpl)).resolves.toEqual({
      canonicalUsername: 'fixture.eth',
      displayName: 'Fixture Keeper',
      pfpUrl: 'https://images.example/fixture.png',
      publicBio: 'Controlled public fixture',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('fails closed before admission when username or HTTPS PFP is unavailable', async () => {
    const missingPfp = vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify(currentProfileEnvelope(false)),
      { headers: { 'content-type': 'application/json' } },
    ));
    await expect(resolveAdmissionReadyFounderProfile(fid, missingPfp))
      .rejects.toThrow(/username and HTTPS profile image are required/i);

    const unsafePfpEnvelope = currentProfileEnvelope();
    const pfpMessage = unsafePfpEnvelope.messages.find(message => (
      message.data.userDataBody.type === 'USER_DATA_TYPE_PFP'
    ));
    if (pfpMessage) pfpMessage.data.userDataBody.value = 'http://localhost/private.png';
    const unsafePfp = vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify(unsafePfpEnvelope),
      { headers: { 'content-type': 'application/json' } },
    ));
    await expect(resolveAdmissionReadyFounderProfile(fid, unsafePfp))
      .rejects.toThrow(/username and HTTPS profile image are required/i);
  });

  it('renders a dry-run summary containing booleans and counts only', () => {
    const summary = admissionReadinessSummary({
      canonicalUsername: 'must-not-escape.eth',
      displayName: 'must-not-escape',
      pfpUrl: 'https://must-not-escape.example/pfp.png',
      publicBio: 'must-not-escape',
    });
    expect(summary).toEqual({
      ready: true,
      trustedSourcePinned: true,
      requiredFieldsPresent: 2,
      requiredFieldsExpected: 2,
      optionalFieldsPresent: 2,
      publicFieldsPresent: 4,
      credentialsAccessed: false,
      mutationSubmitted: false,
      dryRun: true,
    });
    expect(Object.values(summary).every(value => (
      typeof value === 'boolean' || typeof value === 'number'
    ))).toBe(true);
    expect(JSON.stringify(summary)).not.toContain('must-not-escape');
    expect(JSON.stringify(summary)).not.toContain(fid.toString());
  });

  it('binds confirmed admission to one reviewed plan without a profile refetch', () => {
    const source = readFileSync(resolve(repositoryRoot, 'scripts/hermes-admin.ts'), 'utf8');
    const mainSource = source.slice(source.indexOf('async function main()'));
    const resolveForPlan = mainSource.indexOf(
      'await resolveAdmissionReadyFounderProfile(request.fid)',
    );
    const writePlan = mainSource.indexOf('writeReviewedFounderAdmissionPlan({ plan })');
    const readPlan = mainSource.indexOf('readReviewedFounderAdmissionPlan({');
    const readCredential = mainSource.indexOf('readAdminSecret(');
    const verifyV3Checkpoint = mainSource.indexOf('verifyFounderAdmissionPreconditionV3(');
    const verifyV4Checkpoint = mainSource.indexOf('verifyFounderAdmissionResourcePreconditionV4(');
    const claimPlan = mainSource.indexOf('claimReviewedFounderAdmissionPlan({');
    const submitAdmission = mainSource.indexOf('connection.reducers.adminAdmitFounderV1(');
    expect(resolveForPlan).toBeGreaterThan(-1);
    expect(writePlan).toBeGreaterThan(resolveForPlan);
    expect(readPlan).toBeGreaterThan(writePlan);
    expect(readCredential).toBeGreaterThan(readPlan);
    expect(verifyV3Checkpoint).toBeGreaterThan(readCredential);
    expect(verifyV4Checkpoint).toBeGreaterThan(verifyV3Checkpoint);
    expect(claimPlan).toBeGreaterThan(verifyV4Checkpoint);
    expect(submitAdmission).toBeGreaterThan(claimPlan);
    expect(mainSource).not.toContain('resolveAdmissionReadyFounderProfile(fid)');

    const packageManifest = JSON.parse(
      readFileSync(resolve(repositoryRoot, 'package.json'), 'utf8'),
    ) as { scripts: Record<string, string> };
    expect(packageManifest.scripts['stdb:admit-founder'])
      .toBe('tsx scripts/hermes-admin.ts admit-founder');
  });

  it('does not accept a founder identity or note in argv', () => {
    const result = runHermes(['admit-founder', fid.toString(), 'controlled fixture', '--dry-run'], {
      WARPKEEP_AUTH_BRIDGE_URL: undefined,
      WARPKEEP_ADMIN_TOKEN_SECRET: undefined,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('unexpected number');
    expect(`${result.stdout}${result.stderr}`).not.toContain(fid.toString());
    expect(`${result.stdout}${result.stderr}`).not.toContain('controlled fixture');
  });

  it('does not let the legacy noninteractive switch authorize a new founder', () => {
    const result = runHermes(['admit-founder', '--input-stdin'], {
      WARPKEEP_HERMES_NONINTERACTIVE: 'yes',
      WARPKEEP_AUTH_BRIDGE_URL: undefined,
      WARPKEEP_ADMIN_TOKEN_SECRET: undefined,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('exactly one of --dry-run or --confirm');
    expect(result.stderr).not.toContain('Farcaster');
    expect(`${result.stdout}${result.stderr}`).not.toContain(TEST_SECRET);
  });
});

describe('Hermes credential destination policy', () => {
  it('accepts the canonical name or its pinned immutable identity only', () => {
    const uri = 'https://maincloud.spacetimedb.com';
    const bridge = 'https://auth.warpkeep.com';
    expect(() => requireCredentialedProductionTarget(uri, 'warpkeep-89e4u', bridge)).not.toThrow();
    expect(() => requireCredentialedProductionTarget(
      uri,
      'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
      bridge,
    )).not.toThrow();
    expect(() => requireCredentialedProductionTarget(uri, 'warpkeep-lookalike', bridge))
      .toThrow(/canonical Warpkeep production targets/i);
  });

  it('requires the immutable database identity for profiled founder admission', () => {
    expect(() => requireFounderAdmissionProductionTarget(
      'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
    )).not.toThrow();
    expect(() => requireFounderAdmissionProductionTarget('warpkeep-89e4u'))
      .toThrow(/immutable Warpkeep production database identity/i);
  });

  it.each([
    ['bridge', { WARPKEEP_AUTH_BRIDGE_URL: 'https://lookalike.example' }],
    ['SpacetimeDB origin', { WARPKEEP_SPACETIMEDB_URI: 'https://lookalike.example' }],
    ['database', { WARPKEEP_SPACETIMEDB_DATABASE: 'lookalike-db' }]
  ])('rejects a non-canonical %s before network use', (_label, overrides) => {
    const result = runHermes(['inspect-alpha', '--json'], overrides);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('require the canonical Warpkeep production targets');
    expect(`${result.stdout}${result.stderr}`).not.toContain(TEST_SECRET);
  });

  it('pins durable resource backfill to the immutable database identity before token acquisition', () => {
    const identity = 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e';
    expect(() => requireResourceBackfillProductionTarget(identity)).not.toThrow();
    expect(() => requireResourceBackfillProductionTarget('warpkeep-89e4u'))
      .toThrow(/immutable Warpkeep production database identity/i);

    for (const database of [undefined, 'warpkeep-89e4u', 'warpkeep-lookalike']) {
      const result = runHermes(
        ['backfill-resources', '4', '--confirm'],
        { WARPKEEP_SPACETIMEDB_DATABASE: database },
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('immutable Warpkeep production database identity');
      expect(`${result.stdout}${result.stderr}`).not.toContain(TEST_SECRET);
      expect(`${result.stdout}${result.stderr}`).not.toContain('Could not reach');
    }
  });

  it('pins the persistent world expansion to the immutable database identity before token acquisition', () => {
    const identity = 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e';
    expect(() => requireGenesisExpansionProductionTarget(identity)).not.toThrow();
    expect(() => requireGenesisExpansionProductionTarget('warpkeep-89e4u'))
      .toThrow(/immutable Warpkeep production database identity/i);

    for (const database of [undefined, 'warpkeep-89e4u', 'warpkeep-lookalike']) {
      const result = runHermes(
        ['expand-world-v3', '--confirm'],
        { WARPKEEP_SPACETIMEDB_DATABASE: database },
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('immutable Warpkeep production database identity');
      expect(`${result.stdout}${result.stderr}`).not.toContain(TEST_SECRET);
      expect(`${result.stdout}${result.stderr}`).not.toContain('Could not reach');
    }
  });

  it('allows custom targets only for a secret-free dry run', () => {
    const result = runHermes(
      ['allow-fid', '12345', 'test-only-note', '--dry-run', '--confirm'],
      {
        WARPKEEP_SPACETIMEDB_URI: 'https://staging.example',
        WARPKEEP_SPACETIMEDB_DATABASE: 'warpkeep-staging',
        WARPKEEP_AUTH_BRIDGE_URL: undefined,
        WARPKEEP_ADMIN_TOKEN_SECRET: undefined
      }
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('"dryRun":true');
    expect(result.stdout).toContain('existing complete founder re-enable only');
    expect(result.stdout).toContain('"existingFounderReenableOnly":true');
    expect(result.stderr).toBe('');
  });

  it('classifies protocol-v2 aggregate inspection as read-only', () => {
    const result = runHermes(['inspect-alpha-v2', '--json', '--dry-run'], {
      WARPKEEP_AUTH_BRIDGE_URL: undefined,
      WARPKEEP_ADMIN_TOKEN_SECRET: undefined,
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('"command":"inspect-alpha-v2"');
    expect(result.stdout).toContain('"mutation":false');
    expect(result.stderr).toBe('');
  });

  it('classifies protocol-v3 aggregate inspection as read-only', () => {
    const result = runHermes(['inspect-alpha-v3', '--json', '--dry-run'], {
      WARPKEEP_AUTH_BRIDGE_URL: undefined,
      WARPKEEP_ADMIN_TOKEN_SECRET: undefined,
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('"command":"inspect-alpha-v3"');
    expect(result.stdout).toContain('"mutation":false');
    expect(result.stderr).toBe('');
  });

  it('classifies protocol-v4 aggregate inspection as read-only', () => {
    const result = runHermes(['inspect-alpha-v4', '--json', '--dry-run'], {
      WARPKEEP_AUTH_BRIDGE_URL: undefined,
      WARPKEEP_ADMIN_TOKEN_SECRET: undefined,
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('"command":"inspect-alpha-v4"');
    expect(result.stdout).toContain('"mutation":false');
    expect(result.stderr).toBe('');
  });

  it('validates and dry-runs the resource backfill without credentials or network use', () => {
    const result = runHermes(['backfill-resources', '4', '--dry-run', '--confirm'], {
      WARPKEEP_AUTH_BRIDGE_URL: undefined,
      WARPKEEP_ADMIN_TOKEN_SECRET: undefined,
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('"command":"backfill-resources"');
    expect(result.stdout).toContain('"expectedFounderCount":"4"');
    expect(result.stdout).toContain('"resourcePolicyVersion":"genesis-resource-yield-v1"');
    expect(result.stdout).toContain('"mutation":true');
    expect(result.stderr).toBe('');

    for (const count of ['0', '001', '101', '1000', '-1', '1e2']) {
      const rejected = runHermes(['backfill-resources', count, '--dry-run', '--confirm'], {
        WARPKEEP_AUTH_BRIDGE_URL: undefined,
        WARPKEEP_ADMIN_TOKEN_SECRET: undefined,
      });
      expect(rejected.status, count).toBe(1);
      expect(rejected.stderr, count).toContain('founder count from 1 to 100');
    }
  });

  it('dry-runs the exact world expansion without credentials or network use', () => {
    const result = runHermes(['expand-world-v3', '--dry-run', '--confirm'], {
      WARPKEEP_SPACETIMEDB_DATABASE: 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
      WARPKEEP_AUTH_BRIDGE_URL: undefined,
      WARPKEEP_ADMIN_TOKEN_SECRET: undefined,
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('"command":"expand-world-v3"');
    expect(result.stdout).toContain('"expectedWorldTiles":"1261"');
    expect(result.stdout).toContain('"expectedWorldTileMeta":"1261"');
    expect(result.stdout).toContain('"expectedGenerationVersion":2');
    expect(result.stdout).toContain('"targetWorldTiles":"10000"');
    expect(result.stdout).toContain('"mutation":true');
    expect(result.stderr).toBe('');
  });

  it('does not let the legacy noninteractive switch authorize a resource backfill', () => {
    const result = runHermes(['backfill-resources', '4'], {
      WARPKEEP_HERMES_NONINTERACTIVE: 'yes',
      WARPKEEP_AUTH_BRIDGE_URL: undefined,
      WARPKEEP_ADMIN_TOKEN_SECRET: undefined,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Refusing mutation without --confirm');
    expect(result.stdout).toContain('Warpkeep Hermes target');
    expect(result.stdout).not.toContain(TEST_SECRET);
  });

  it('does not let the legacy noninteractive switch authorize the world expansion', () => {
    const result = runHermes(['expand-world-v3'], {
      WARPKEEP_SPACETIMEDB_DATABASE: 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
      WARPKEEP_HERMES_NONINTERACTIVE: 'yes',
      WARPKEEP_AUTH_BRIDGE_URL: undefined,
      WARPKEEP_ADMIN_TOKEN_SECRET: undefined,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Refusing mutation without --confirm');
    expect(result.stdout).toContain('Warpkeep Hermes target');
    expect(result.stdout).not.toContain(TEST_SECRET);
    expect(result.stderr).not.toContain('WARPKEEP_ADMIN_TOKEN_SECRET');
  });

  it('rejects a weak admin secret before network use', () => {
    const result = runHermes(['inspect-alpha', '--json'], {
      WARPKEEP_ADMIN_TOKEN_SECRET: 'replace-me'
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('must contain 32 to 512 bytes');
    expect(result.stdout).toBe('');
  });

  it('accepts only a bounded exact-JSON admin session and rejects redirects', async () => {
    const fetchImpl = async (_input: string | URL | Request, init?: RequestInit) => {
      expect(init?.redirect).toBe('error');
      expect(init?.cache).toBe('no-store');
      return new Response(JSON.stringify({
        token: 'header.payload.signature',
        tokenType: 'spacetime-access'
      }), { headers: { 'content-type': 'application/json; charset=utf-8' } });
    };
    await expect(requestAdminToken(
      'https://auth.warpkeep.com',
      TEST_SECRET,
      fetchImpl as typeof fetch
    )).resolves.toBe('header.payload.signature');
  });

  it('rejects wrong-media and chunked oversized admin responses generically', async () => {
    const wrongMedia = async () => new Response(JSON.stringify({
      token: 'header.payload.signature',
      tokenType: 'spacetime-access'
    }), { headers: { 'content-type': 'text/plain' } });
    await expect(requestAdminToken(
      'https://auth.warpkeep.com', TEST_SECRET, wrongMedia as typeof fetch
    )).rejects.toThrow('invalid response');

    const oversized = async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(32 * 1_024 + 1));
        controller.close();
      }
    }), { headers: { 'content-type': 'application/json' } });
    await expect(requestAdminToken(
      'https://auth.warpkeep.com', TEST_SECRET, oversized as typeof fetch
    )).rejects.toThrow('invalid response');

    const cancelFailure = async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(32 * 1_024 + 1));
      },
      cancel() {
        throw new Error('stream-cancel-sentinel');
      },
    }), { headers: { 'content-type': 'application/json' } });
    await expect(requestAdminToken(
      'https://auth.warpkeep.com', TEST_SECRET, cancelFailure as typeof fetch
    )).rejects.toThrow('invalid response');

    const readFailure = async () => new Response(new ReadableStream<Uint8Array>({
      pull() {
        throw new Error('stream-read-sentinel');
      },
    }), { headers: { 'content-type': 'application/json' } });
    await expect(requestAdminToken(
      'https://auth.warpkeep.com', TEST_SECRET, readFailure as typeof fetch
    )).rejects.toThrow('invalid response');
  });

  it('disconnects a silent connection when the handshake deadline expires', async () => {
    vi.useFakeTimers();
    const disconnect = vi.fn();
    const pendingConnection = {
      get isDisconnectRequested() { return disconnect.mock.calls.length > 0; },
      disconnect,
    };
    const builder = {
      withUri: vi.fn(() => builder),
      withDatabaseName: vi.fn(() => builder),
      withToken: vi.fn(() => builder),
      onConnect: vi.fn(() => builder),
      onConnectError: vi.fn(() => builder),
      build: vi.fn(() => pendingConnection),
    };

    const connection = connect(
      'https://maincloud.spacetimedb.com',
      'warpkeep-89e4u',
      'header.payload.signature',
      () => builder as never,
    );
    const rejection = expect(connection).rejects.toThrow('Could not connect to the Warpkeep database.');
    await vi.advanceTimersByTimeAsync(30_000);
    await rejection;
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
