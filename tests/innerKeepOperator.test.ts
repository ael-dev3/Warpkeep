import { constants } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  INNER_KEEP_CANONICAL_TARGET,
  INNER_KEEP_PROTECTED_STATE_PROOF_PROTOCOL,
  INNER_KEEP_PROTECTED_STATE_QUERIES,
  InnerKeepOperatorError,
  assertBuilderPlanMatchesArguments,
  assertCanonicalInnerKeepTarget,
  assertCatalogPlanMatchesArguments,
  captureInnerKeepProtectedState,
  createInnerKeepDryRunRecord,
  innerKeepDeactivationReducerArguments,
  innerKeepStaticAttestation,
  parseInnerKeepOperatorArguments,
  printableInnerKeepRecord,
  projectInnerKeepBuilderPlan,
  projectInnerKeepCatalogPlan,
  projectInnerKeepStatus,
  verifyInnerKeepMutationPostcondition,
  verifyInnerKeepProtectedStatePreserved,
  type InnerKeepProtectedStateSnapshot,
  type InnerKeepProtectedStateSurface,
  type InnerKeepStatus,
} from '../scripts/inner-keep-operator-core';
import {
  collectInnerKeepRuntimeFiles,
  executeConnectedCommand,
  inspectExactInnerKeepRuntimeFile,
  verifyAuthorizedInnerKeepRuntimeRegistry,
  verifyInnerKeepRuntimeRegistryPreflight,
} from '../scripts/inner-keep-operator';
import {
  INNER_KEEP_ASSET_SELECTION,
  INNER_KEEP_PLANNED_RUNTIME_PATHS,
  INNER_KEEP_SELECTED_MODELS,
  INNER_KEEP_SELECTED_PREVIEWS,
} from '../scripts/inner-keep-runtime-asset-contract.mjs';
import {
  INNER_KEEP_POPULATION_MODELS,
  INNER_KEEP_POPULATION_RUNTIME_PATHS,
  INNER_KEEP_POPULATION_SELECTION,
} from '../scripts/inner-keep-population-runtime-contract.mjs';

function status(overrides: Partial<InnerKeepStatus> = {}): InnerKeepStatus {
  const attestation = innerKeepStaticAttestation();
  return Object.freeze({
    layoutRows: 1n,
    slotRows: 12n,
    buildingCatalogRows: 4n,
    levelPolicyRows: 20n,
    castleRows: 3n,
    builderRows: 3n,
    buildingRows: 0n,
    activeProjects: 0n,
    receiptRows: 0n,
    scheduleRows: 0n,
    missingBuilders: 0n,
    orphanBuilders: 0n,
    invalidBuilders: 0n,
    invalidBuildings: 0n,
    invalidSchedules: 0n,
    builderProjectMismatches: 0n,
    staticCatalogExact: true,
    workerSystemReady: true,
    readyForCatalogSeed: false,
    readyForBuilderBackfill: true,
    readyForActivation: true,
    active: false,
    policyVersion: attestation.policyVersion,
    policyDigest: attestation.policyDigest,
    layoutPolicyVersion: attestation.layoutPolicyVersion,
    layoutDigest: attestation.layoutDigest,
    assetCatalogDigest: attestation.assetCatalogDigest,
    ...overrides,
  });
}

type RuntimeStatusFixture = Readonly<{
  dev: number;
  ino: number;
  size: number;
  mtimeMs: number;
  ctimeMs: number;
  isDirectory: () => boolean;
  isFile: () => boolean;
  isSymbolicLink: () => boolean;
}>;

function runtimeFileStatus(
  overrides: Partial<RuntimeStatusFixture> = {},
): RuntimeStatusFixture {
  return {
    dev: 1,
    ino: 2,
    size: 4,
    mtimeMs: 3,
    ctimeMs: 4,
    isDirectory: () => false,
    isFile: () => true,
    isSymbolicLink: () => false,
    ...overrides,
  };
}

function runtimeDirectoryStatus(
  overrides: Partial<RuntimeStatusFixture> = {},
): RuntimeStatusFixture {
  return runtimeFileStatus({
    size: 64,
    isDirectory: () => true,
    isFile: () => false,
    ...overrides,
  });
}

async function protectedSnapshot(
  overrides: Readonly<Record<string, string>> = {},
): Promise<InnerKeepProtectedStateSnapshot> {
  return captureInnerKeepProtectedState(async ({ table }) => (
    overrides[table] ?? `private rows for ${table}\n`
  ));
}

describe('Inner Keep operator arguments', () => {
  it('keeps read-only commands argument-free', () => {
    expect(parseInnerKeepOperatorArguments(['inspect-inner-keep'])).toEqual({
      command: 'inspect-inner-keep',
      confirmed: false,
    });
    expect(parseInnerKeepOperatorArguments(['plan-inner-keep-catalog'])).toEqual({
      command: 'plan-inner-keep-catalog',
      confirmed: false,
    });
    expect(() => parseInnerKeepOperatorArguments([
      'inspect-inner-keep', '--confirm',
    ])).toThrow(InnerKeepOperatorError);
  });

  it('makes exact catalog seeding a dry run unless separately confirmed', () => {
    const base = [
      'seed-inner-keep-catalog',
      '--expected-missing-layout', '1',
      '--expected-missing-slots', '12',
      '--expected-missing-buildings', '4',
      '--expected-missing-levels', '20',
    ];
    const parsed = parseInnerKeepOperatorArguments(base);
    expect(parsed).toMatchObject({
      command: 'seed-inner-keep-catalog',
      confirmed: false,
      expectedMissingLayout: 1,
      expectedMissingSlots: 12,
      expectedMissingBuildings: 4,
      expectedMissingLevels: 20,
    });
    expect(parseInnerKeepOperatorArguments([...base, '--confirm']).confirmed).toBe(true);
    expect(parseInnerKeepOperatorArguments([...base, '--dry-run']).confirmed).toBe(false);
    expect(() => parseInnerKeepOperatorArguments([
      ...base, '--dry-run', '--confirm',
    ])).toThrow('--confirm and --dry-run are mutually exclusive.');
  });

  it('requires a complete exact Builder-count attestation', () => {
    const parsed = parseInnerKeepOperatorArguments([
      'backfill-inner-keep-builders',
      '--expected-castles', '8',
      '--expected-existing-builders', '3',
      '--expected-missing-builders', '5',
    ]);
    expect(parsed).toMatchObject({
      confirmed: false,
      expectedCastles: 8,
      expectedExistingBuilders: 3,
      expectedMissingBuilders: 5,
    });
    expect(() => parseInnerKeepOperatorArguments([
      'backfill-inner-keep-builders',
      '--expected-castles', '8',
      '--expected-existing-builders', '4',
      '--expected-missing-builders', '5',
    ])).toThrow('inconsistent');
  });

  it('requires exact release, artifact, source, and castle inputs for activation', () => {
    const sha = 'a'.repeat(64);
    const commit = 'b'.repeat(40);
    const parsed = parseInnerKeepOperatorArguments([
      'activate-inner-keep',
      '--expected-castles', '3',
      '--client-release', 'alpha-0.3.43',
      '--client-artifact-digest', sha,
      '--module-artifact-digest', sha,
      '--source-commit', commit,
    ]);
    expect(parsed).toMatchObject({
      confirmed: false,
      expectedCastles: 3,
      clientRelease: 'alpha-0.3.43',
      clientArtifactDigest: sha,
      moduleArtifactDigest: sha,
      sourceCommit: commit,
    });
    expect(() => parseInnerKeepOperatorArguments([
      'activate-inner-keep',
      '--expected-castles', '3',
      '--client-release', 'latest',
      '--client-artifact-digest', sha,
      '--module-artifact-digest', sha,
      '--source-commit', commit,
    ])).toThrow('--client-release is invalid.');
  });

  it('binds deactivation to fresh castle and active-project counts', () => {
    const parsed = parseInnerKeepOperatorArguments([
      'deactivate-inner-keep',
      '--expected-castles', '3',
      '--expected-active-projects', '1',
      '--confirm',
    ]);
    expect(parsed).toMatchObject({
      confirmed: true,
      expectedCastles: 3,
      expectedActiveProjects: 1,
    });
    expect(innerKeepDeactivationReducerArguments(parsed)).toEqual({
      capability: innerKeepStaticAttestation().capability,
      expectedCastleCount: 3,
      expectedActiveProjects: 1,
    });
    expect(() => innerKeepDeactivationReducerArguments({
      command: 'deactivate-inner-keep',
      confirmed: true,
      expectedCastles: 3,
    })).toThrow('deactivation reducer arguments are invalid');
  });
});

describe('Inner Keep operator aggregate boundary', () => {
  it('accepts and reprojects only the exact counts-only v15 status', () => {
    expect(projectInnerKeepStatus(status())).toEqual(status());
    const printable = printableInnerKeepRecord(projectInnerKeepStatus(status()));
    expect(printable.castleRows).toBe('3');
    expect(JSON.stringify(printable)).not.toMatch(/fid|balance|receiptKey|requestKey|secret/iu);
  });

  it('rejects extra fields, drifted digests, and inconsistent readiness', () => {
    expect(() => projectInnerKeepStatus({ ...status(), fid: 123n })).toThrow('unexpected fields');
    expect(() => projectInnerKeepStatus({
      ...status(), policyDigest: '0'.repeat(64),
    })).toThrow('protocol v15');
    expect(() => projectInnerKeepStatus({
      ...status(), builderRows: 2n, readyForActivation: true,
    })).toThrow('inconsistent aggregate');
    expect(() => projectInnerKeepStatus({
      ...status(), active: true, workerSystemReady: false, readyForActivation: false,
    })).toThrow('inconsistent aggregate');
  });

  it('validates deterministic catalog and Builder plans', () => {
    const catalog = projectInnerKeepCatalogPlan({
      missingLayout: 1,
      missingSlots: 12,
      missingBuildings: 4,
      missingLevels: 20,
      ready: false,
    });
    assertCatalogPlanMatchesArguments(catalog, parseInnerKeepOperatorArguments([
      'seed-inner-keep-catalog',
      '--expected-missing-layout', '1',
      '--expected-missing-slots', '12',
      '--expected-missing-buildings', '4',
      '--expected-missing-levels', '20',
    ]));
    const builders = projectInnerKeepBuilderPlan({
      expectedCastles: 3,
      existingBuilders: 1,
      missingBuilders: 2,
      ready: false,
    });
    assertBuilderPlanMatchesArguments(builders, parseInnerKeepOperatorArguments([
      'backfill-inner-keep-builders',
      '--expected-castles', '3',
      '--expected-existing-builders', '1',
      '--expected-missing-builders', '2',
    ]));
    expect(() => projectInnerKeepCatalogPlan({
      missingLayout: 0,
      missingSlots: 0,
      missingBuildings: 0,
      missingLevels: 0,
      ready: false,
    })).toThrow('inconsistent counts');
  });

  it('validates the Inner Keep row-count postconditions', () => {
    const seededBefore = status({
      layoutRows: 0n,
      slotRows: 0n,
      buildingCatalogRows: 0n,
      levelPolicyRows: 0n,
      builderRows: 0n,
      staticCatalogExact: false,
      readyForCatalogSeed: true,
      readyForBuilderBackfill: false,
      readyForActivation: false,
    });
    const seededAfter = status({
      builderRows: 0n,
      missingBuilders: 3n,
      readyForActivation: false,
    });
    expect(() => verifyInnerKeepMutationPostcondition(
      'seed-inner-keep-catalog', seededBefore, seededAfter,
    )).not.toThrow();

    const active = status({ active: true, readyForActivation: false });
    expect(() => verifyInnerKeepMutationPostcondition(
      'activate-inner-keep', status(), active,
    )).not.toThrow();
    expect(() => verifyInnerKeepMutationPostcondition(
      'activate-inner-keep', status(), {
        ...active, receiptRows: 1n,
      },
    )).toThrow('postcondition failed');
  });
});

describe('Inner Keep exact protected-state evidence', () => {
  it('covers castle state, balances, Terms, the complete generic-Worker graph, and Marks', () => {
    expect(INNER_KEEP_PROTECTED_STATE_QUERIES.map(({ table }) => table)).toEqual([
      'castle',
      'castle_slot_claim_v1',
      'resource_account_v1',
      'alpha_terms_acceptance_v1',
      'realm_worker_system_v1',
      'castle_worker_v1',
      'worker_assignment_v1',
      'worker_node_occupation_v1',
      'worker_assignment_schedule_v_1',
      'worker_command_idempotency_v1',
      'realm_profile_v1',
      'mark_account_v1',
      'snap_burn_credit_v1',
      'daily_mark_grant_v1',
      'daily_mark_schedule_v_1',
    ]);
    expect(new Set(INNER_KEEP_PROTECTED_STATE_QUERIES.map(({ surface }) => surface))).toEqual(
      new Set<InnerKeepProtectedStateSurface>([
        'castleState',
        'resources',
        'termsAcceptance',
        'genericWorkers',
        'marks',
      ]),
    );
    for (const query of INNER_KEEP_PROTECTED_STATE_QUERIES) {
      expect(query.sql).toBe(`SELECT * FROM ${query.table}`);
    }
  });

  it('compares every private row byte and returns only non-sensitive structured proof', async () => {
    const calls: string[] = [];
    const before = await captureInnerKeepProtectedState(async (query) => {
      calls.push(query.table);
      return Buffer.from(`fid=730001;secret-balance=400;table=${query.table}\n`);
    });
    const after = await protectedSnapshot(Object.fromEntries(
      INNER_KEEP_PROTECTED_STATE_QUERIES.map(({ table }) => [
        table,
        `fid=730001;secret-balance=400;table=${table}\n`,
      ]),
    ));
    expect(calls).toEqual(INNER_KEEP_PROTECTED_STATE_QUERIES.map(({ table }) => table));
    const proof = verifyInnerKeepProtectedStatePreserved(before, after);
    expect(proof).toEqual({
      protocol: INNER_KEEP_PROTECTED_STATE_PROOF_PROTOCOL,
      comparison: 'exact-private-sql-bytes',
      tablesCompared: 15,
      surfaces: {
        castleState: true,
        resources: true,
        termsAcceptance: true,
        genericWorkers: true,
        marks: true,
      },
      privateRowsEmitted: false,
      verified: true,
    });
    expect(JSON.stringify(proof)).not.toMatch(/730001|secret-balance|resource_account/iu);
  });

  it('treats even a private output line-ending change as protected-state drift', async () => {
    const before = await protectedSnapshot({ castle: 'same row\n' });
    const after = await protectedSnapshot({ castle: 'same row\r\n' });
    expect(() => verifyInnerKeepProtectedStatePreserved(before, after)).toThrow(
      'castleState state changed',
    );
  });

  it('fails closed on one changed table in every protected surface without echoing rows', async () => {
    const before = await protectedSnapshot();
    for (const surface of [
      'castleState',
      'resources',
      'termsAcceptance',
      'genericWorkers',
      'marks',
    ] as const) {
      const table = INNER_KEEP_PROTECTED_STATE_QUERIES.find(
        (query) => query.surface === surface,
      )!.table;
      const after = await protectedSnapshot({
        [table]: 'private-fid=730001;changed-balance=999999\n',
      });
      let thrown: unknown;
      try {
        verifyInnerKeepProtectedStatePreserved(before, after);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(InnerKeepOperatorError);
      expect((thrown as Error).message).toContain(surface);
      expect((thrown as Error).message).toContain('Stop and inspect before any retry.');
      expect((thrown as Error).message).not.toMatch(/730001|999999|private-fid/iu);
    }
  });

  it('rejects missing, unsafe, and unbounded private SQL output', async () => {
    await expect(captureInnerKeepProtectedState(async () => '')).rejects.toThrow(
      'could not be read safely',
    );
    await expect(captureInnerKeepProtectedState(async () => 'row\0value')).rejects.toThrow(
      'could not be read safely',
    );
    await expect(captureInnerKeepProtectedState(async () => 'x'.repeat(1_000_001))).rejects.toThrow(
      'could not be read safely',
    );
    await expect(captureInnerKeepProtectedState(async () => {
      throw new Error('private-fid=730001');
    })).rejects.toThrow('could not be read safely');
  });

  it('brackets a Builder backfill with private snapshots before postflight', async () => {
    const events: string[] = [];
    const before = status({
      builderRows: 1n,
      missingBuilders: 2n,
      readyForActivation: false,
    });
    const after = status();
    let statusRead = 0;
    const connection = {
      procedures: {
        adminGetInnerKeepStatusV1: async () => {
          events.push(statusRead === 0 ? 'inspect-before' : 'inspect-after');
          statusRead += 1;
          return statusRead === 1 ? before : after;
        },
        adminPlanInnerKeepBuildersV1: async () => {
          events.push('plan');
          return {
            expectedCastles: 3,
            existingBuilders: 1,
            missingBuilders: 2,
            ready: false,
          };
        },
      },
      reducers: {
        adminBackfillInnerKeepBuildersV1: async () => {
          events.push('reducer');
        },
      },
    } as unknown as Parameters<typeof executeConnectedCommand>[0];
    const snapshot = await protectedSnapshot();
    let snapshotRead = 0;
    const result = await executeConnectedCommand(
      connection,
      parseInnerKeepOperatorArguments([
        'backfill-inner-keep-builders',
        '--expected-castles', '3',
        '--expected-existing-builders', '1',
        '--expected-missing-builders', '2',
        '--confirm',
      ]),
      async () => {
        events.push(snapshotRead === 0 ? 'protected-before' : 'protected-after');
        snapshotRead += 1;
        return snapshot;
      },
    );
    expect(events).toEqual([
      'inspect-before',
      'plan',
      'protected-before',
      'reducer',
      'protected-after',
      'inspect-after',
    ]);
    expect(result).toMatchObject({
      command: 'backfill-inner-keep-builders',
      mode: 'confirmed',
      protectedStateProof: {
        protocol: INNER_KEEP_PROTECTED_STATE_PROOF_PROTOCOL,
        tablesCompared: 15,
        privateRowsEmitted: false,
        verified: true,
      },
    });
    expect(JSON.stringify(printableInnerKeepRecord(result))).not.toMatch(
      /private rows|resource_account_v1/iu,
    );
  });

  it('brackets activation and refuses to call its reducer without evidence', async () => {
    const arguments_ = parseInnerKeepOperatorArguments([
      'activate-inner-keep',
      '--expected-castles', '3',
      '--client-release', 'alpha-0.3.43',
      '--client-artifact-digest', 'a'.repeat(64),
      '--module-artifact-digest', 'b'.repeat(64),
      '--source-commit', 'c'.repeat(40),
      '--confirm',
    ]);
    const events: string[] = [];
    let statusRead = 0;
    const connection = {
      procedures: {
        adminGetInnerKeepStatusV1: async () => {
          events.push(statusRead === 0 ? 'inspect-before' : 'inspect-after');
          statusRead += 1;
          return statusRead === 1
            ? status()
            : status({
                active: true,
                readyForBuilderBackfill: false,
                readyForActivation: false,
              });
        },
      },
      reducers: {
        adminActivateInnerKeepV1: async () => {
          events.push('reducer');
        },
      },
    } as unknown as Parameters<typeof executeConnectedCommand>[0];
    await expect(executeConnectedCommand(connection, arguments_)).rejects.toThrow(
      'protected-state evidence is required before mutation',
    );
    expect(events).toEqual(['inspect-before']);

    events.length = 0;
    statusRead = 0;
    const snapshot = await protectedSnapshot();
    let snapshotRead = 0;
    await expect(executeConnectedCommand(connection, arguments_, async () => {
      events.push(snapshotRead === 0 ? 'protected-before' : 'protected-after');
      snapshotRead += 1;
      return snapshot;
    })).resolves.toMatchObject({
      command: 'activate-inner-keep',
      protectedStateProof: { verified: true },
    });
    expect(events).toEqual([
      'inspect-before',
      'protected-before',
      'reducer',
      'protected-after',
      'inspect-after',
    ]);

    events.length = 0;
    statusRead = 0;
    snapshotRead = 0;
    const changedSnapshot = await protectedSnapshot({
      resource_account_v1: 'private changed balance\n',
    });
    await expect(executeConnectedCommand(connection, arguments_, async () => {
      events.push(snapshotRead === 0 ? 'protected-before' : 'protected-after');
      snapshotRead += 1;
      return snapshotRead === 1 ? snapshot : changedSnapshot;
    })).rejects.toThrow('resources state changed');
    expect(events).toEqual([
      'inspect-before',
      'protected-before',
      'reducer',
      'protected-after',
    ]);
  });
});

describe('Inner Keep operator safety gates', () => {
  it('rejects mutable target overrides', () => {
    expect(assertCanonicalInnerKeepTarget({})).toEqual(INNER_KEEP_CANONICAL_TARGET);
    expect(() => assertCanonicalInnerKeepTarget({
      WARPKEEP_SPACETIMEDB_DATABASE: 'staging',
    })).toThrow('immutable Warpkeep production target');
  });

  it('emits a non-mutating privacy-safe default plan', () => {
    const args = parseInnerKeepOperatorArguments([
      'deactivate-inner-keep',
      '--expected-castles', '3',
      '--expected-active-projects', '0',
    ]);
    const record = createInnerKeepDryRunRecord(args);
    expect(record).toMatchObject({
      mode: 'dry-run',
      dataDeletion: false,
      secretsInOutput: false,
      publicIdentifiersInOutput: false,
      blindRetryAllowed: false,
    });
    expect(JSON.stringify(record)).not.toMatch(/fid|token|secretValue|receiptKey/iu);
  });

  it('rejects a runtime file pathname replaced by a symlink after descriptor open', () => {
    const opened = runtimeFileStatus();
    const replacement = runtimeFileStatus({
      ino: 99,
      isFile: () => false,
      isSymbolicLink: () => true,
    });
    let pathRead = 0;
    let openFlags = 0;
    let closes = 0;
    expect(() => inspectExactInnerKeepRuntimeFile(
      INNER_KEEP_PLANNED_RUNTIME_PATHS[0],
      {
        close: () => { closes += 1; },
        fstat: () => opened,
        lstat: () => {
          pathRead += 1;
          return pathRead === 1 ? opened : replacement;
        },
        open: (_path, flags) => {
          openFlags = flags;
          return 17;
        },
        readFile: () => Buffer.from('safe', 'utf8'),
        readdir: () => [],
        realpath: (path) => path,
      },
    )).toThrow('does not match the authorized selection');
    expect(openFlags & constants.O_NOFOLLOW).toBe(constants.O_NOFOLLOW);
    expect(closes).toBe(1);
  });

  it('rejects a runtime directory replaced during recursive enumeration', () => {
    const opened = runtimeDirectoryStatus();
    const replacement = runtimeDirectoryStatus({ ino: 99 });
    let pathRead = 0;
    let openFlags = 0;
    let closes = 0;
    expect(() => collectInnerKeepRuntimeFiles(
      'public/models/hegemony/inner-keep',
      {
        close: () => { closes += 1; },
        fstat: () => opened,
        lstat: () => {
          pathRead += 1;
          return pathRead < 3 ? opened : replacement;
        },
        open: (_path, flags) => {
          openFlags = flags;
          return 23;
        },
        readFile: () => Buffer.alloc(0),
        readdir: () => [],
        realpath: (path) => path,
      },
    )).toThrow('directory changed while it was inspected');
    expect(openFlags & constants.O_DIRECTORY).toBe(constants.O_DIRECTORY);
    expect(openFlags & constants.O_NOFOLLOW).toBe(constants.O_NOFOLLOW);
    expect(closes).toBe(1);
  });

  it('accepts both owner-authorized exact runtime registries', () => {
    expect(() => verifyAuthorizedInnerKeepRuntimeRegistry()).not.toThrow();
  });

  it('rejects a missing population asset from the complete runtime registry', () => {
    const missingPath = INNER_KEEP_POPULATION_RUNTIME_PATHS[0];
    expect(() => verifyInnerKeepRuntimeRegistryPreflight({
      staticSelection: INNER_KEEP_ASSET_SELECTION,
      populationSelection: INNER_KEEP_POPULATION_SELECTION,
      observedPaths: [
        ...INNER_KEEP_PLANNED_RUNTIME_PATHS,
        ...INNER_KEEP_POPULATION_RUNTIME_PATHS.filter((path) => path !== missingPath),
      ],
      inspectRuntimeFile: () => {
        throw new Error('file inspection must not start for an incomplete registry');
      },
    })).toThrow('paths do not match both authorized selections');
  });

  it('rejects tampered population bytes from an otherwise complete registry', () => {
    const expectedFiles = [
      ...INNER_KEEP_SELECTED_MODELS,
      ...INNER_KEEP_SELECTED_PREVIEWS,
      ...INNER_KEEP_POPULATION_MODELS,
    ];
    const expectedByPath = new Map(expectedFiles.map((file) => [
      file.destinationPath,
      file,
    ]));
    const tamperedPath = INNER_KEEP_POPULATION_RUNTIME_PATHS[0];
    expect(() => verifyInnerKeepRuntimeRegistryPreflight({
      staticSelection: INNER_KEEP_ASSET_SELECTION,
      populationSelection: INNER_KEEP_POPULATION_SELECTION,
      observedPaths: [
        ...INNER_KEEP_PLANNED_RUNTIME_PATHS,
        ...INNER_KEEP_POPULATION_RUNTIME_PATHS,
      ],
      inspectRuntimeFile: (path) => {
        const expected = expectedByPath.get(path);
        if (expected === undefined) throw new Error(`unexpected runtime path ${path}`);
        return {
          bytes: expected.bytes,
          sha256: path === tamperedPath ? '0'.repeat(64) : expected.sha256,
        };
      },
    })).toThrow('does not match the authorized selection');
  });

  it('fails closed on population authorization before inspecting installed files', () => {
    let inspected = false;
    expect(() => verifyInnerKeepRuntimeRegistryPreflight({
      staticSelection: INNER_KEEP_ASSET_SELECTION,
      populationSelection: {
        ...INNER_KEEP_POPULATION_SELECTION,
        authorization: {
          ...INNER_KEEP_POPULATION_SELECTION.authorization,
          officialRepositoryRuntimeUseAuthorized: false,
        },
      },
      observedPaths: [
        ...INNER_KEEP_PLANNED_RUNTIME_PATHS,
        ...INNER_KEEP_POPULATION_RUNTIME_PATHS,
      ],
      inspectRuntimeFile: () => {
        inspected = true;
        throw new Error('authorization must fail before file inspection');
      },
    })).toThrow('population asset registry is not recorded');
    expect(inspected).toBe(false);
  });
});
