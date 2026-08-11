import { describe, expect, it, vi } from 'vitest';

import {
  GREATER_REALM_SYNTHETIC_REVISION,
  GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE,
  createGreaterRealmSyntheticTransport
} from '../src/dev/greaterRealmSyntheticTierOneFixture';
import {
  GREATER_REALM_TRAVEL_CLASS,
  GreaterRealmPublicContractError,
  assertGreaterRealmChunkMatchesDescriptor,
  assertGreaterRealmMonotonicLodChunks,
  decodeGreaterRealmBootstrapDto,
  decodeGreaterRealmChunkDto,
  decodeGreaterRealmRoutePageDto,
  decodeGreaterRealmWindowDto
} from '../src/greater-realm/greaterRealmPublicContract';
import {
  GREATER_REALM_PUBLIC_PROCEDURES,
  GREATER_REALM_SERVER_PRESENTATION_ALLOWED,
  GreaterRealmTransportUnavailableError,
  createGreaterRealmProcedureTransport
} from '../src/greater-realm/greaterRealmTransport';

function mutable<T>(value: T): T {
  return structuredClone(value);
}

describe('Greater Realm public runtime contract', () => {
  it('accepts only the exact Tier-I v17 projection and opaque chunk handles', () => {
    const fixture = GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE;
    expect(fixture.bootstrap.protocolVersion).toBe(17);
    expect(fixture.bootstrap.visibleTierMax).toBe(1);
    expect(fixture.bootstrap.regions).toHaveLength(6);
    expect(fixture.bootstrap.castleCapacity).toBe(600);
    expect(fixture.window.chunks).toHaveLength(2);
    expect(fixture.window.chunks.every((chunk) => /^GRK-[A-Z2-7]{26}$/u.test(
      chunk.chunkHandle
    ))).toBe(true);
    expect(fixture.chunks.every((chunk) => (
      chunk.coreCells.every((cell) => cell.tier === 1)
      && chunk.apronCells.every((cell) => cell.tier === 1)
    ))).toBe(true);
  });

  it('seals bootstrap region identity, capacity, resources, and readable modes', () => {
    for (const mutate of [
      (row: any) => { row.regions[0].publicName = 'Lookalike'; },
      (row: any) => { row.regions[0].castleCapacity = 99; row.castleCapacity = 599; },
      (row: any) => { row.regions[0].foodNodeCount = 499; row.regions[0].resourceNodeCount = 1_999; },
      (row: any) => { row.mode = 'ready'; },
      (row: any) => { row.regions[0].regionId = 'T1_UNREVIEWED'; }
    ]) {
      const hostile = mutable(GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.bootstrap) as any;
      mutate(hostile);
      expect(() => decodeGreaterRealmBootstrapDto(hostile)).toThrow(
        'GREATER_REALM_BOOTSTRAP_INVALID'
      );
    }
  });

  it('accepts apron-heavy border descriptors with the frozen LOD cardinalities', () => {
    const border = mutable(GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.window) as any;
    border.chunks = [{
      chunkHandle: 'GRK-CCCCCCCCCCCCCCCCCCCCCCCCCC',
      binQ: 0,
      binR: 0,
      coreCellCount: 2,
      apronCellCount: 6,
      lod0CellCount: 2,
      lod1CellCount: 4,
      lod2CellCount: 2,
      lod3CellCount: 1
    }];
    expect(decodeGreaterRealmWindowDto(border).chunks[0]).toMatchObject({
      coreCellCount: 2,
      apronCellCount: 6,
      lod1CellCount: 4
    });
    border.chunks[0].lod1CellCount = 2;
    expect(() => decodeGreaterRealmWindowDto(border)).toThrow('GREATER_REALM_WINDOW_INVALID');
  });

  it('rejects private topology, node detail, coordinate-derived handles, and extension fields', () => {
    const extended = mutable(GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.chunks[0]) as any;
    extended.unreviewed = 'payload';
    expect(() => decodeGreaterRealmChunkDto(extended)).toThrow(GreaterRealmPublicContractError);

    const coordinateHandle = mutable(GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.chunks[0]) as any;
    coordinateHandle.chunkHandle = 't1/chunk/0/0';
    expect(() => decodeGreaterRealmChunkDto(coordinateHandle)).toThrow(
      'GREATER_REALM_CHUNK_INVALID'
    );

    for (const privateField of ['componentKey', 'ridgeId', 'routeParentDirection', 'routeDepth']) {
      const hostile = mutable(GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.chunks[0]) as any;
      hostile.coreCells[0][privateField] = 'private';
      expect(() => decodeGreaterRealmChunkDto(hostile)).toThrow(
        'GREATER_REALM_CHUNK_INVALID'
      );
    }

    const nodeLeak = mutable(GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.chunks[0]) as any;
    nodeLeak.resourceLocations[0].nodeId = 'GRN-CONCRETE';
    expect(() => decodeGreaterRealmChunkDto(nodeLeak)).toThrow(
      'GREATER_REALM_CHUNK_INVALID'
    );

    const unknownCellRegion = mutable(
      GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.chunks[0]
    ) as any;
    unknownCellRegion.coreCells[0].regionId = 'T1_UNREVIEWED';
    expect(() => decodeGreaterRealmChunkDto(unknownCellRegion)).toThrow(
      'GREATER_REALM_CHUNK_INVALID'
    );

    const unknownResourceRegion = mutable(
      GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.chunks[0]
    ) as any;
    unknownResourceRegion.resourceLocations[0].regionId = 'T1_UNREVIEWED';
    expect(() => decodeGreaterRealmChunkDto(unknownResourceRegion)).toThrow(
      'GREATER_REALM_CHUNK_INVALID'
    );
  });

  it('trusts explicit passability for a river ford and never grants it implicitly', () => {
    const ford = GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.chunks
      .flatMap((chunk) => chunk.coreCells)
      .find((cell) => cell.travelClass === GREATER_REALM_TRAVEL_CLASS.FORD)!;
    expect(ford.passable).toBe(true);

    const hostile = mutable(GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.chunks[0]) as any;
    const hostileFord = hostile.coreCells.find((cell: any) => (
      cell.travelClass === GREATER_REALM_TRAVEL_CLASS.FORD
    ));
    hostileFord.passable = false;
    hostileFord.movementCost = 1_000_000;
    expect(() => decodeGreaterRealmChunkDto(hostile)).toThrow(
      'GREATER_REALM_CHUNK_INVALID'
    );
  });

  it('proves stable monotonic LOD subsets and descriptor agreement', async () => {
    const transport = createGreaterRealmSyntheticTransport();
    const signal = new AbortController().signal;
    const descriptor = GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.window.chunks[0]!;
    const chunks = await Promise.all(([0, 1, 2, 3] as const).map((lod) => (
      transport.getChunk({
        chunkHandle: descriptor.chunkHandle,
        lod,
        expectedRevision: GREATER_REALM_SYNTHETIC_REVISION
      }, signal)
    )));
    expect(() => assertGreaterRealmMonotonicLodChunks(chunks)).not.toThrow();
    chunks.forEach((chunk) => {
      expect(() => assertGreaterRealmChunkMatchesDescriptor(chunk, descriptor)).not.toThrow();
    });

    const hostileRaw = mutable(chunks[2]) as any;
    hostileRaw.coreCells[0] = mutable(chunks[0].coreCells.at(-1));
    const hostile = decodeGreaterRealmChunkDto(hostileRaw);
    expect(() => assertGreaterRealmMonotonicLodChunks([
      chunks[0], chunks[1], hostile, chunks[3]
    ])).toThrow('GREATER_REALM_CHUNK_LOD_INVALID');
  });

  it('bounds route pages, requires axial adjacency, and preserves endpoint cells', async () => {
    const transport = createGreaterRealmSyntheticTransport();
    const signal = new AbortController().signal;
    const routeKeys = GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.routeCellKeys;
    const page = await transport.planRoute({
      originCellKey: routeKeys[0]!,
      destinationCellKey: routeKeys.at(-1)!,
      offset: 0,
      limit: 128,
      expectedRevision: GREATER_REALM_SYNTHETIC_REVISION
    }, signal);
    expect(page.cells[0]?.cellKey).toBe(routeKeys[0]);
    expect(page.cells.at(-1)?.cellKey).toBe(routeKeys.at(-1));
    expect(page.complete).toBe(true);

    const nonAdjacent = mutable(page) as any;
    nonAdjacent.cells[1].atlasQ += 50;
    expect(() => decodeGreaterRealmRoutePageDto(nonAdjacent)).toThrow(
      'GREATER_REALM_ROUTE_PLAN_INVALID'
    );
    const tooLong = mutable(page) as any;
    tooLong.totalLength = 8_194;
    expect(() => decodeGreaterRealmRoutePageDto(tooLong)).toThrow(
      'GREATER_REALM_ROUTE_PLAN_INVALID'
    );
  });

  it('keeps exact production procedure names fail-closed before v17 activation', async () => {
    const call = vi.fn(async () => GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.bootstrap);
    const transport = createGreaterRealmProcedureTransport({ call });
    const controller = new AbortController();
    expect(GREATER_REALM_SERVER_PRESENTATION_ALLOWED).toBe(false);
    expect(GREATER_REALM_PUBLIC_PROCEDURES).toEqual({
      bootstrap: 'get_realm_atlas_bootstrap_v1',
      window: 'get_realm_atlas_window_v1',
      chunk: 'get_realm_atlas_chunk_v1',
      planRoute: 'plan_realm_route_v1',
      workerControlState: 'get_my_worker_control_state_v2'
    });
    await expect(transport.getBootstrap(controller.signal)).rejects.toBeInstanceOf(
      GreaterRealmTransportUnavailableError
    );
    expect(call).not.toHaveBeenCalled();
  });
});
