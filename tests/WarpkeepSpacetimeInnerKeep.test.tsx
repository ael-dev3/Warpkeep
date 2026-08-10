import { SenderError } from 'spacetimedb';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockedFarcaster = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock('../src/farcaster/FarcasterAuthProviderCore', () => ({
  useFarcasterAuth: () => mockedFarcaster.current
}));

import {
  WarpkeepSpacetimeProvider,
  useWarpkeepBackend,
  type WarpkeepBackendControllerValue,
  type WarpkeepBackendRuntime
} from '../src/spacetime/WarpkeepSpacetimeProvider';
import { InnerKeepProjectNoCommitError } from '../src/components/inner-keep/innerKeepPresentation';
import type { ReadyInnerKeepProjection } from '../src/spacetime/innerKeepProjection';
import type { InnerKeepRequestReceipt } from '../src/spacetime/innerKeepCommandIdempotency';
import {
  CANONICAL_WARPKEEP_AUTH_ORIGIN,
  DEFAULT_SPACETIMEDB_DATABASE,
  type WarpkeepRuntimeConfig
} from '../src/spacetime/warpkeepConfig';
import { createReadyResourceState } from './fixtures/resourceState';
import { createCanonicalGenesisSnapshot } from './fixtures/canonicalGenesisSnapshot';
import { createInnerKeepPresentation } from './fixtures/innerKeepPresentation';
import {
  INNER_KEEP_POLICY_DIGEST,
  INNER_KEEP_POLICY_VERSION
} from '../spacetimedb/src/innerKeepPolicy';
import {
  INNER_KEEP_ASSET_CATALOG_DIGEST,
  INNER_KEEP_LAYOUT_DIGEST,
  INNER_KEEP_LAYOUT_ID,
  INNER_KEEP_LAYOUT_VERSION
} from '../spacetimedb/src/innerKeepLayoutPolicy';

const CONFIG: WarpkeepRuntimeConfig = Object.freeze({
  spacetimeUri: 'https://maincloud.spacetimedb.com',
  spacetimeDatabase: DEFAULT_SPACETIMEDB_DATABASE,
  bridgeUrl: CANONICAL_WARPKEEP_AUTH_ORIGIN,
  issuer: CANONICAL_WARPKEEP_AUTH_ORIGIN,
  audience: 'warpkeep-spacetimedb',
  publicConfigValid: true,
  sharedAlphaEnabled: true
});

function jwtPart(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function authenticatedFarcaster(fid = 12_345) {
  const now = Math.floor(Date.now() / 1_000);
  return {
    state: {
      phase: 'authenticated',
      assurance: 'bridge-oidc-alpha',
      identity: {
        fid,
        username: `keeper${fid}`,
        verifications: [],
        authMethod: 'authAddress',
        verifiedAt: Date.now()
      }
    },
    oidcSession: {
      jwt: [
        jwtPart({ alg: 'ES256', typ: 'JWT' }),
        jwtPart({
          iss: CONFIG.issuer,
          aud: CONFIG.audience,
          sub: `farcaster:${fid}`,
          fid: String(fid),
          token_type: 'spacetime-access',
          auth_version: 2,
          auth_epoch: 1,
          roles: [],
          jti: 'inner-keep-provider-test',
          iat: now,
          nbf: now,
          exp: now + 300,
          session_iat: now,
          session_exp: now + 300
        }),
        'signature'
      ].join('.'),
      issuer: CONFIG.issuer,
      audience: CONFIG.audience,
      expiresAt: (now + 300) * 1_000
    }
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

let captured: WarpkeepBackendControllerValue | undefined;

function Probe() {
  captured = useWarpkeepBackend();
  return (
    <>
      <output data-testid="phase">{captured.state.phase}</output>
      <output data-testid="inner-phase">{captured.state.innerKeep?.phase ?? ''}</output>
      <output data-testid="inner-castle">
        {captured.state.innerKeep?.castleId.toString() ?? ''}
      </output>
      <output data-testid="inner-commands">
        {String(captured.state.innerKeep?.commandsEnabled ?? false)}
      </output>
      <output data-testid="inner-food">
        {captured.state.innerKeep?.resources.available.food.toString() ?? ''}
      </output>
      <output data-testid="inner-status">
        {captured.state.innerKeep?.statusMessage ?? ''}
      </output>
    </>
  );
}

function projectionFor(
  input: Parameters<NonNullable<WarpkeepBackendRuntime['readInnerKeepProjection']>>[1],
  constructing: boolean,
  advanced = false
): ReadyInnerKeepProjection {
  const building = Object.freeze({
    castleId: input.scope.castleId,
    buildingKey: `${input.scope.castleId}:city-mill`,
    slotKey: `${input.scope.castleId}:inner-keep-slot-m01`,
    slotId: 'inner-keep-slot-m01',
    buildingKind: 'city-mill' as const,
    completedLevel: advanced ? 1 : 0,
    targetLevel: advanced ? 2 : 1,
    phase: 'constructing' as const,
    startedAtMicros: advanced ? 200n : 100n,
    completesAtMicros: advanced ? 172_800_000_200n : 86_400_000_100n,
    revision: advanced ? 2n : 0n,
    policyVersion: INNER_KEEP_POLICY_VERSION
  });
  const basePresentation = constructing
    ? createInnerKeepPresentation({
        available: Object.freeze({
          food: advanced ? 9_000n : 9_700n,
          wood: advanced ? 7_100n : 9_100n,
          stone: advanced ? 8_000n : 9_400n,
          gold: 10_000n
        }),
        buildings: [building],
        builder: Object.freeze({
          state: 'busy',
          slotId: building.slotId,
          buildingKind: building.buildingKind,
          targetLevel: building.targetLevel,
          completesAtMicros: building.completesAtMicros
        }),
        commandsEnabled: false,
        phase: 'constructing',
        projectRevision: advanced ? 7n : 3n
      })
    : createInnerKeepPresentation({ projectRevision: 1n });
  const presentation = Object.freeze({
    ...basePresentation,
    castleId: input.scope.castleId,
    ...(input.pendingAttempt === undefined ? {} : {
      phase: input.pendingAttempt.phase === 'sending'
        ? 'project-submitting' as const
        : 'synchronizing' as const,
      commandsEnabled: false
    })
  });
  return Object.freeze({
    scope: Object.freeze({
      ...input.scope,
      layoutId: INNER_KEEP_LAYOUT_ID,
      layoutVersion: INNER_KEEP_LAYOUT_VERSION,
      policyVersion: INNER_KEEP_POLICY_VERSION,
      policyDigest: INNER_KEEP_POLICY_DIGEST,
      layoutDigest: INNER_KEEP_LAYOUT_DIGEST,
      assetCatalogDigest: INNER_KEEP_ASSET_CATALOG_DIGEST,
      projectRevision: presentation.projectRevision
    }),
    presentation,
    buildings: constructing ? Object.freeze([building]) : Object.freeze([])
  });
}

function readyRuntimeForStart(
  startInnerKeepProject: NonNullable<WarpkeepBackendRuntime['startInnerKeepProject']>
) {
  const snapshot = createCanonicalGenesisSnapshot(12_345);
  const readInnerKeepProjection = vi.fn(async (
    _connection,
    input: Parameters<NonNullable<WarpkeepBackendRuntime['readInnerKeepProjection']>>[1]
  ) => projectionFor(input, false));
  const readInnerKeepRequestStatus = vi.fn(async () => (
    Object.freeze({ found: false as const })
  ));
  const runtime = {
    connect: vi.fn(async () => ({ disconnect: vi.fn(), isDisconnectRequested: false })),
    disconnect: vi.fn(),
    readBackendInfo: vi.fn(async () => ({
      protocolVersion: 3,
      worldSeed: 3_445_214_658,
      worldSeedName: 'HEGEMONY_GENESIS_001'
    })),
    readAdmission: vi.fn(async () => 'ready'),
    bootstrapPlayer: vi.fn(async () => undefined),
    readEntryAgreementStatus: vi.fn(async () => true),
    acceptAlphaTerms: vi.fn(async () => undefined),
    readResourceState: vi.fn(async () => createReadyResourceState(12_345)),
    collectResources: vi.fn(async () => createReadyResourceState(12_345)),
    observeRealm: vi.fn(() => vi.fn()),
    readRealmSnapshot: vi.fn(() => snapshot),
    subscribeRealm: vi.fn((_connection, onApplied: () => void) => {
      onApplied();
      return { unsubscribe: vi.fn() };
    }),
    readInnerKeepProjection,
    readInnerKeepRequestStatus,
    startInnerKeepProject
  } as unknown as WarpkeepBackendRuntime;
  return Object.freeze({
    runtime,
    snapshot,
    readInnerKeepProjection,
    readInnerKeepRequestStatus
  });
}

afterEach(() => {
  cleanup();
  captured = undefined;
  mockedFarcaster.current = undefined;
  vi.restoreAllMocks();
});

describe('Inner Keep provider command lifecycle', () => {
  it('single-flights one command and unseals only after receipt plus public project agree', async () => {
    mockedFarcaster.current = authenticatedFarcaster();
    const reducer = deferred<void>();
    let constructing = false;
    let receipt: InnerKeepRequestReceipt = Object.freeze({ found: false });
    let observedRealmChange:
      | ((snapshot: ReturnType<typeof createCanonicalGenesisSnapshot>) => void)
      | undefined;
    let projectionGate: ReturnType<typeof deferred<ReadyInnerKeepProjection>> | undefined;
    let gatedProjectionInput:
      | Parameters<NonNullable<WarpkeepBackendRuntime['readInnerKeepProjection']>>[1]
      | undefined;
    const startInnerKeepProject = vi.fn(() => reducer.promise);
    const readInnerKeepProjection = vi.fn(async (
      _connection,
      input: Parameters<NonNullable<WarpkeepBackendRuntime['readInnerKeepProjection']>>[1]
    ) => {
      if (projectionGate !== undefined) {
        const gate = projectionGate;
        projectionGate = undefined;
        gatedProjectionInput = input;
        return gate.promise;
      }
      return projectionFor(input, constructing);
    });
    const readInnerKeepRequestStatus = vi.fn(async () => receipt);
    const snapshot = createCanonicalGenesisSnapshot(12_345);
    const runtime = {
      connect: vi.fn(async () => ({ disconnect: vi.fn(), isDisconnectRequested: false })),
      disconnect: vi.fn(),
      readBackendInfo: vi.fn(async () => ({
        protocolVersion: 3,
        worldSeed: 3_445_214_658,
        worldSeedName: 'HEGEMONY_GENESIS_001'
      })),
      readAdmission: vi.fn(async () => 'ready'),
      bootstrapPlayer: vi.fn(async () => undefined),
      readEntryAgreementStatus: vi.fn(async () => true),
      acceptAlphaTerms: vi.fn(async () => undefined),
      readResourceState: vi.fn(async () => createReadyResourceState(12_345)),
      collectResources: vi.fn(async () => createReadyResourceState(12_345)),
      observeRealm: vi.fn((_connection, _fid, onChange) => {
        observedRealmChange = onChange;
        return vi.fn();
      }),
      readRealmSnapshot: vi.fn(() => snapshot),
      subscribeRealm: vi.fn((_connection, onApplied: () => void) => {
        onApplied();
        return { unsubscribe: vi.fn() };
      }),
      readInnerKeepProjection,
      readInnerKeepRequestStatus,
      startInnerKeepProject
    } as unknown as WarpkeepBackendRuntime;

    render(
      <WarpkeepSpacetimeProvider config={CONFIG} runtime={runtime}>
        <Probe />
      </WarpkeepSpacetimeProvider>
    );
    await waitFor(() => expect(screen.getByTestId('inner-phase').textContent).toBe('ready'));
    expect(screen.getByTestId('inner-castle').textContent)
      .toBe(snapshot.ownCastle.castleId.toString());
    expect(screen.getByTestId('inner-food').textContent).toBe('10000');

    const retainedProjectionGate = deferred<ReadyInnerKeepProjection>();
    projectionGate = retainedProjectionGate;
    act(() => observedRealmChange!(snapshot));
    expect(screen.getByTestId('inner-phase').textContent).toBe('ready');
    expect(screen.getByTestId('inner-castle').textContent)
      .toBe(snapshot.ownCastle.castleId.toString());
    await act(async () => {
      retainedProjectionGate.resolve(projectionFor(gatedProjectionInput!, false));
      await retainedProjectionGate.promise;
    });
    await waitFor(() => expect(screen.getByTestId('inner-phase').textContent).toBe('ready'));

    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = captured!.startInnerKeepProject('inner-keep-slot-m01', 'city-mill');
      second = captured!.startInnerKeepProject('inner-keep-slot-m01', 'city-mill');
    });
    await expect(second).rejects.toThrow('status is uncertain');
    expect(startInnerKeepProject).toHaveBeenCalledTimes(1);
    expect(startInnerKeepProject).toHaveBeenCalledWith(
      expect.anything(),
      'inner-keep-slot-m01',
      'city-mill',
      expect.any(String),
      1,
      '1',
      INNER_KEEP_POLICY_DIGEST
    );
    await act(async () => {
      reducer.resolve();
      await first;
    });
    await waitFor(() => expect(screen.getByTestId('inner-phase').textContent).toBe('synchronizing'));
    expect(screen.getByTestId('inner-commands').textContent).toBe('false');

    constructing = true;
    const pendingReadCount = readInnerKeepProjection.mock.calls.length;
    const pendingStatusReadCount = readInnerKeepRequestStatus.mock.calls.length;
    act(() => captured!.retryInnerKeepSync());
    await waitFor(() => expect(readInnerKeepProjection.mock.calls.length)
      .toBeGreaterThan(pendingReadCount));
    await waitFor(() => expect(readInnerKeepRequestStatus.mock.calls.length)
      .toBeGreaterThan(pendingStatusReadCount));
    expect(screen.getByTestId('inner-phase').textContent).toBe('synchronizing');
    expect(screen.getByTestId('inner-food').textContent).toBe('10000');

    receipt = Object.freeze({
      found: true,
      castleId: BigInt(snapshot.ownCastle.castleId),
      buildingKey: `${snapshot.ownCastle.castleId}:city-mill`,
      slotId: 'inner-keep-slot-m01',
      buildingKind: 'city-mill',
      targetLevel: 1,
      deducted: Object.freeze({ food: 300n, wood: 900n, stone: 600n, gold: 0n }),
      startedAtMicros: 100n,
      policyVersion: INNER_KEEP_POLICY_VERSION
    });
    act(() => captured!.retryInnerKeepSync());
    await waitFor(() => expect(screen.getByTestId('inner-phase').textContent).toBe('constructing'));
    expect(screen.getByTestId('inner-food').textContent).toBe('9700');
    expect(startInnerKeepProject).toHaveBeenCalledTimes(1);
    expect(readInnerKeepRequestStatus).toHaveBeenCalled();
  });

  it('unseals an ambiguous request after another client advances the accepted project', async () => {
    mockedFarcaster.current = authenticatedFarcaster();
    let advanced = false;
    const snapshot = createCanonicalGenesisSnapshot(12_345);
    const receipt: InnerKeepRequestReceipt = Object.freeze({
      found: true,
      castleId: BigInt(snapshot.ownCastle.castleId),
      buildingKey: `${snapshot.ownCastle.castleId}:city-mill`,
      slotId: 'inner-keep-slot-m01',
      buildingKind: 'city-mill',
      targetLevel: 1,
      deducted: Object.freeze({ food: 300n, wood: 900n, stone: 600n, gold: 0n }),
      startedAtMicros: 100n,
      policyVersion: INNER_KEEP_POLICY_VERSION
    });
    const readInnerKeepProjection = vi.fn(async (
      _connection,
      input: Parameters<NonNullable<WarpkeepBackendRuntime['readInnerKeepProjection']>>[1]
    ) => projectionFor(input, advanced, advanced));
    const runtime = {
      connect: vi.fn(async () => ({ disconnect: vi.fn(), isDisconnectRequested: false })),
      disconnect: vi.fn(),
      readBackendInfo: vi.fn(async () => ({
        protocolVersion: 3,
        worldSeed: 3_445_214_658,
        worldSeedName: 'HEGEMONY_GENESIS_001'
      })),
      readAdmission: vi.fn(async () => 'ready'),
      bootstrapPlayer: vi.fn(async () => undefined),
      readEntryAgreementStatus: vi.fn(async () => true),
      acceptAlphaTerms: vi.fn(async () => undefined),
      readResourceState: vi.fn(async () => createReadyResourceState(12_345)),
      collectResources: vi.fn(async () => createReadyResourceState(12_345)),
      observeRealm: vi.fn(() => vi.fn()),
      readRealmSnapshot: vi.fn(() => snapshot),
      subscribeRealm: vi.fn((_connection, onApplied: () => void) => {
        onApplied();
        return { unsubscribe: vi.fn() };
      }),
      readInnerKeepProjection,
      readInnerKeepRequestStatus: vi.fn(async () => receipt),
      startInnerKeepProject: vi.fn().mockRejectedValue(new Error('transport result unknown'))
    } as unknown as WarpkeepBackendRuntime;

    render(
      <WarpkeepSpacetimeProvider config={CONFIG} runtime={runtime}>
        <Probe />
      </WarpkeepSpacetimeProvider>
    );
    await waitFor(() => expect(screen.getByTestId('inner-phase').textContent).toBe('ready'));

    await act(async () => {
      await expect(captured!.startInnerKeepProject('inner-keep-slot-m01', 'city-mill'))
        .rejects.toThrow('Inner Keep construction status is uncertain.');
    });
    await waitFor(() => expect(screen.getByTestId('inner-phase').textContent)
      .toBe('synchronizing'));
    expect(screen.getByTestId('inner-food').textContent).toBe('10000');

    advanced = true;
    act(() => captured!.retryInnerKeepSync());
    await waitFor(() => expect(screen.getByTestId('inner-phase').textContent)
      .toBe('constructing'));
    expect(screen.getByTestId('inner-food').textContent).toBe('9000');
    expect(screen.getByTestId('inner-commands').textContent).toBe('false');
    expect(runtime.startInnerKeepProject).toHaveBeenCalledOnce();
  });

  it('marks a local preflight rejection as no-commit and keeps a valid attempt available', async () => {
    mockedFarcaster.current = authenticatedFarcaster();
    const startInnerKeepProject = vi.fn().mockResolvedValue(undefined);
    const harness = readyRuntimeForStart(startInnerKeepProject);
    render(
      <WarpkeepSpacetimeProvider config={CONFIG} runtime={harness.runtime}>
        <Probe />
      </WarpkeepSpacetimeProvider>
    );
    await waitFor(() => expect(screen.getByTestId('inner-phase').textContent).toBe('ready'));

    let rejection: unknown;
    await act(async () => {
      try {
        await captured!.startInnerKeepProject('not-a-canonical-slot', 'city-mill');
      } catch (error) {
        rejection = error;
      }
    });
    expect(rejection).toBeInstanceOf(InnerKeepProjectNoCommitError);
    expect(startInnerKeepProject).not.toHaveBeenCalled();

    await act(async () => {
      await captured!.startInnerKeepProject('inner-keep-slot-m01', 'city-mill');
    });
    expect(startInnerKeepProject).toHaveBeenCalledOnce();
  });

  it('clears only an exact definitive SenderError and shows fixed player-safe copy', async () => {
    mockedFarcaster.current = authenticatedFarcaster();
    const startInnerKeepProject = vi.fn()
      .mockRejectedValueOnce(new SenderError('INNER_KEEP_INSUFFICIENT_WOOD'))
      .mockResolvedValueOnce(undefined);
    const harness = readyRuntimeForStart(startInnerKeepProject);
    render(
      <WarpkeepSpacetimeProvider config={CONFIG} runtime={harness.runtime}>
        <Probe />
      </WarpkeepSpacetimeProvider>
    );
    await waitFor(() => expect(screen.getByTestId('inner-phase').textContent).toBe('ready'));

    await act(async () => {
      await expect(captured!.startInnerKeepProject('inner-keep-slot-m01', 'city-mill'))
        .rejects.toThrow('There is not enough stored Wood for this project.');
    });
    await waitFor(() => expect(screen.getByTestId('inner-phase').textContent).toBe('failed'));
    expect(screen.getByTestId('inner-status').textContent)
      .toBe('There is not enough stored Wood for this project.');
    expect(screen.getByTestId('inner-status').textContent).not.toContain('INNER_KEEP_');
    expect(startInnerKeepProject).toHaveBeenCalledTimes(1);

    act(() => captured!.retryInnerKeepSync());
    await waitFor(() => expect(screen.getByTestId('inner-phase').textContent).toBe('ready'));
    await act(async () => {
      await captured!.startInnerKeepProject('inner-keep-slot-m01', 'city-mill');
    });
    expect(startInnerKeepProject).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.getByTestId('inner-phase').textContent)
      .toBe('synchronizing'));
  });

  it('keeps unknown SenderErrors ambiguous and never forwards their text', async () => {
    mockedFarcaster.current = authenticatedFarcaster();
    const startInnerKeepProject = vi.fn().mockRejectedValue(
      new SenderError('unreviewed server copy with private detail')
    );
    const harness = readyRuntimeForStart(startInnerKeepProject);
    render(
      <WarpkeepSpacetimeProvider config={CONFIG} runtime={harness.runtime}>
        <Probe />
      </WarpkeepSpacetimeProvider>
    );
    await waitFor(() => expect(screen.getByTestId('inner-phase').textContent).toBe('ready'));

    await act(async () => {
      await expect(captured!.startInnerKeepProject('inner-keep-slot-m01', 'city-mill'))
        .rejects.toThrow('Inner Keep construction status is uncertain.');
    });
    await waitFor(() => expect(screen.getByTestId('inner-phase').textContent)
      .toBe('synchronizing'));
    expect(screen.getByTestId('inner-status').textContent)
      .not.toContain('private detail');
    const readsBeforeRetry = harness.readInnerKeepProjection.mock.calls.length;
    act(() => captured!.retryInnerKeepSync());
    await waitFor(() => expect(harness.readInnerKeepProjection.mock.calls.length)
      .toBeGreaterThan(readsBeforeRetry));
    expect(startInnerKeepProject).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('inner-commands').textContent).toBe('false');
  });
});
