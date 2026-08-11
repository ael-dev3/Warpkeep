// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  GREATER_REALM_CASTLE_AUDIT_POLICY,
  GREATER_REALM_INNER_GATE_THRONE_POLICY,
  GREATER_REALM_REGION_BOUNDARY_ALIGNMENT_POLICY,
  GREATER_REALM_STRATEGIC_AUDITS_VERSION,
  GREATER_REALM_TIER_POTENTIAL_DENSITY_POLICY,
  measureGreaterRealmCastleSuitability,
  measureGreaterRealmInnerGateThroneRedundancy,
  measureGreaterRealmRegionBoundaryAlignment,
  measureGreaterRealmTierPotentialDensity,
  type GreaterRealmAuditGate,
  type GreaterRealmCastleAuditInput,
  type GreaterRealmCastleAuditPolicy,
  type GreaterRealmInnerGateThroneInput,
  type GreaterRealmRegionBoundaryAlignmentInput,
} from '../scripts/atlas/greater-realm-strategic-audits';
import {
  GREATER_REALM_BIOME_ID,
  GREATER_REALM_LANDFORM_ID,
} from '../scripts/atlas/greater-realm-biomes';
import {
  GREATER_REALM_ECOLOGY_CLASS,
  GREATER_REALM_ROUTE_CLASS,
} from '../scripts/atlas/greater-realm-living-world';
import {
  GREATER_REALM_AXIAL_DIRECTIONS,
  indexGreaterRealmAxialGrid,
  type AxialCoordinate,
  type IndexedAxialGrid,
} from '../scripts/atlas/greater-realm-terrain';

function hexDisc(radius: number): readonly AxialCoordinate[] {
  const coordinates: AxialCoordinate[] = [];
  for (let q = -radius; q <= radius; q += 1) {
    const minimumR = Math.max(-radius, -q - radius);
    const maximumR = Math.min(radius, -q + radius);
    for (let r = minimumR; r <= maximumR; r += 1) coordinates.push({ q, r });
  }
  return coordinates;
}

function index(grid: IndexedAxialGrid, q: number, r: number): number {
  const result = grid.indexOf({ q, r });
  if (result < 0) throw new Error(`fixture cell missing: ${q},${r}`);
  return result;
}

function copyBytes(values: readonly ArrayBufferView[]): readonly Uint8Array[] {
  return values.map(value => new Uint8Array(
    value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength),
  ));
}

function expectBytesUnchanged(
  values: readonly ArrayBufferView[],
  before: readonly Uint8Array[],
): void {
  expect(values).toHaveLength(before.length);
  values.forEach((value, position) => {
    expect(new Uint8Array(value.buffer, value.byteOffset, value.byteLength))
      .toEqual(before[position]);
  });
}

function boundaryFixture(): GreaterRealmRegionBoundaryAlignmentInput {
  const grid = indexGreaterRealmAxialGrid(hexDisc(3));
  const cellCount = grid.cellCount;
  const regionId = new Uint8Array(cellCount);
  const waterRegime = new Uint8Array(cellCount);
  const barrier = new Uint8Array(cellCount);
  const geologicalBarrierBand = new Uint8Array(cellCount);
  const watershedId = new Int32Array(cellCount);
  const ridgeId = new Int32Array(cellCount);
  const landformId = new Uint8Array(cellCount);
  const biomeId = new Uint8Array(cellCount);
  watershedId.fill(1);
  landformId.fill(GREATER_REALM_LANDFORM_ID.LOWLAND);
  biomeId.fill(GREATER_REALM_BIOME_ID.TEMPERATE_LOWLAND);
  for (let cell = 0; cell < cellCount; cell += 1) {
    regionId[cell] = grid.q[cell]! < 0 ? 0 : 6;
  }
  for (let cell = 0; cell < cellCount; cell += 1) {
    for (let direction = 0; direction < 6; direction += 1) {
      const neighbor = grid.neighbors[cell * 6 + direction]!;
      if (neighbor >= 0 && regionId[cell] !== regionId[neighbor]) barrier[cell] = 1;
    }
  }
  return Object.freeze({
    grid,
    regionId,
    waterRegime,
    barrier,
    geologicalBarrierBand,
    watershedId,
    ridgeId,
    landformId,
    biomeId,
    policy: Object.freeze({
      minimumStructuralAlignmentBasisPoints: 10_000,
      minimumAnyNaturalAlignmentBasisPoints: 10_000,
    }),
  });
}

function castleFixture(): Readonly<{
  input: GreaterRealmCastleAuditInput;
  centers: readonly number[];
  rings: readonly (readonly number[])[];
}> {
  const coordinates: AxialCoordinate[] = [];
  for (let region = 0; region < 6; region += 1) {
    const centerQ = region * 20;
    for (const coordinate of hexDisc(2)) {
      coordinates.push({ q: centerQ + coordinate.q, r: coordinate.r });
    }
  }
  coordinates.push({ q: -20, r: 0 }, { q: -19, r: 0 });
  const grid = indexGreaterRealmAxialGrid(coordinates);
  const cellCount = grid.cellCount;
  const regionId = new Uint8Array(cellCount);
  const tierId = new Uint8Array(cellCount);
  const waterRegime = new Uint8Array(cellCount);
  const barrier = new Uint8Array(cellCount);
  const castleSlot = new Uint8Array(cellCount);
  const legacyCastleSlot = new Uint8Array(cellCount);
  const resourcePotential = new Uint8Array(cellCount);
  const corePotential = new Uint8Array(cellCount);
  const throneAnchor = new Uint8Array(cellCount);
  const slope = new Uint16Array(cellCount);
  const wetnessIndex = new Uint16Array(cellCount);
  const distanceToFreshwater = new Uint16Array(cellCount);
  const distanceToCoast = new Uint16Array(cellCount);
  const landformId = new Uint8Array(cellCount);
  const ecologyClass = new Uint8Array(cellCount);
  const routeClass = new Uint8Array(cellCount);
  const landmarkClass = new Uint8Array(cellCount);
  slope.fill(100);
  wetnessIndex.fill(100);
  distanceToFreshwater.fill(10);
  distanceToCoast.fill(10);
  landformId.fill(GREATER_REALM_LANDFORM_ID.LOWLAND);
  ecologyClass.fill(GREATER_REALM_ECOLOGY_CLASS.PLAINS);

  const centers: number[] = [];
  const rings: number[][] = [];
  for (let region = 0; region < 6; region += 1) {
    const centerQ = region * 20;
    for (const coordinate of hexDisc(2)) {
      const cell = index(grid, centerQ + coordinate.q, coordinate.r);
      regionId[cell] = region;
      tierId[cell] = 1;
    }
    const center = index(grid, centerQ, 0);
    centers.push(center);
    castleSlot[center] = 1;
    if (region === 0) legacyCastleSlot[center] = 1;
    const ring = GREATER_REALM_AXIAL_DIRECTIONS.map(direction => (
      index(grid, centerQ + direction.q, direction.r)
    ));
    rings.push(ring);
    for (let ordinal = 0; ordinal < ring.length; ordinal += 1) {
      const cell = ring[ordinal]!;
      regionId[cell] = region;
      tierId[cell] = 1;
      routeClass[cell] = ordinal % 2 === 0
        ? GREATER_REALM_ROUTE_CLASS.ROAD
        : GREATER_REALM_ROUTE_CLASS.CARRIAGEWAY;
    }
    regionId[center] = region;
    tierId[center] = 1;
  }
  const firstGateCell = index(grid, -20, 0);
  const secondGateCell = index(grid, -19, 0);
  regionId[firstGateCell] = 0;
  tierId[firstGateCell] = 1;
  regionId[secondGateCell] = 6;
  tierId[secondGateCell] = 2;
  barrier[firstGateCell] = 1;
  barrier[secondGateCell] = 1;
  const gate = Object.freeze({
    gateIndex: 0,
    firstRegion: 0,
    secondRegion: 6,
    firstCell: firstGateCell,
    secondCell: secondGateCell,
    firstApproachPath: Object.freeze([]),
    firstAlternateApproachPath: Object.freeze([]),
    secondApproachPath: Object.freeze([]),
    secondAlternateApproachPath: Object.freeze([]),
  }) satisfies GreaterRealmAuditGate;
  const policy = Object.freeze({
    ...GREATER_REALM_CASTLE_AUDIT_POLICY,
    expectedTotalCastleSlots: 6,
    expectedLegacyCastleSlots: 1,
    expectedNewCastleSlots: 5,
    expectedSlotsPerTierIRegion: 1,
    minimumOccupiedDistributionSectors: 1,
    maximumDistributionSectorShareBasisPoints: 10_000,
  }) satisfies GreaterRealmCastleAuditPolicy;
  return Object.freeze({
    input: Object.freeze({
      grid,
      regionId,
      tierId,
      waterRegime,
      barrier,
      castleSlot,
      legacyCastleSlot,
      resourcePotential,
      corePotential,
      throneAnchor,
      slope,
      wetnessIndex,
      distanceToFreshwater,
      distanceToCoast,
      landformId,
      ecologyClass,
      routeClass,
      landmarkClass,
      gates: Object.freeze([gate]),
      policy,
    }),
    centers: Object.freeze(centers),
    rings: Object.freeze(rings.map(ring => Object.freeze(ring))),
  });
}

function throneFixture(): Readonly<{
  input: GreaterRealmInnerGateThroneInput;
  alternateInterior: number;
}> {
  const grid = indexGreaterRealmAxialGrid([
    { q: 3, r: 0 },
    { q: 2, r: 0 },
    { q: 1, r: 0 },
    { q: 1, r: 1 },
    { q: 0, r: 1 },
    { q: 0, r: 0 },
  ]);
  const regionId = new Uint8Array(grid.cellCount);
  regionId.fill(9);
  const firstCell = index(grid, 3, 0);
  const secondCell = index(grid, 2, 0);
  const primary = index(grid, 1, 0);
  const alternate = index(grid, 1, 1);
  const alternateInterior = index(grid, 0, 1);
  const throne = index(grid, 0, 0);
  regionId[firstCell] = 6;
  const waterRegime = new Uint8Array(grid.cellCount);
  const barrier = new Uint8Array(grid.cellCount);
  barrier[firstCell] = 1;
  barrier[secondCell] = 1;
  const throneAnchor = new Uint8Array(grid.cellCount);
  throneAnchor[throne] = 1;
  const gate = Object.freeze({
    gateIndex: 0,
    firstRegion: 6,
    secondRegion: 9,
    firstCell,
    secondCell,
    firstApproachPath: Object.freeze([]),
    firstAlternateApproachPath: Object.freeze([]),
    secondApproachPath: Object.freeze([primary]),
    secondAlternateApproachPath: Object.freeze([alternate]),
  }) satisfies GreaterRealmAuditGate;
  return Object.freeze({
    input: Object.freeze({
      grid,
      regionId,
      waterRegime,
      barrier,
      throneAnchor,
      gates: Object.freeze([gate]),
      policy: Object.freeze({
        ...GREATER_REALM_INNER_GATE_THRONE_POLICY,
        expectedInnerGateCount: 1,
      }),
    }),
    alternateInterior,
  });
}

describe('Greater Realm final strategic audits', () => {
  it('pins production policies to the prompt-level review thresholds', () => {
    expect(GREATER_REALM_STRATEGIC_AUDITS_VERSION)
      .toBe('greater-realm-strategic-audits-v1');
    expect(GREATER_REALM_REGION_BOUNDARY_ALIGNMENT_POLICY).toEqual({
      minimumStructuralAlignmentBasisPoints: 7_500,
      minimumAnyNaturalAlignmentBasisPoints: 9_000,
    });
    expect(GREATER_REALM_TIER_POTENTIAL_DENSITY_POLICY).toEqual({
      resource: {
        tierI: { minimumBasisPoints: 1_800, maximumBasisPoints: 2_200 },
        tierII: { minimumBasisPoints: 2_600, maximumBasisPoints: 3_000 },
        tierIII: { minimumBasisPoints: 3_700, maximumBasisPoints: 4_300 },
      },
      core: {
        tierI: { minimumBasisPoints: 1_200, maximumBasisPoints: 1_600 },
        tierII: { minimumBasisPoints: 1_800, maximumBasisPoints: 2_200 },
        tierIII: { minimumBasisPoints: 2_500, maximumBasisPoints: 3_000 },
      },
    });
    expect(GREATER_REALM_CASTLE_AUDIT_POLICY).toMatchObject({
      expectedTotalCastleSlots: 600,
      expectedLegacyCastleSlots: 100,
      expectedNewCastleSlots: 500,
      expectedSlotsPerTierIRegion: 100,
      minimumCastleSpacing: 5,
      minimumGateClearance: 3,
      minimumPassableNeighbors: 4,
      minimumEcologicallySuitableNeighbors: 4,
    });
    expect(GREATER_REALM_INNER_GATE_THRONE_POLICY).toEqual({
      expectedInnerGateCount: 6,
      requiredIndependentRouteCount: 2,
    });
  });

  it('measures final region edges from structural and ecological authority only', () => {
    const input = boundaryFixture();
    const fields = [
      input.regionId,
      input.waterRegime,
      input.barrier,
      input.geologicalBarrierBand,
      input.watershedId,
      input.ridgeId,
      input.landformId,
      input.biomeId,
    ];
    const before = copyBytes(fields);
    try {
      const metrics = measureGreaterRealmRegionBoundaryAlignment(input);
      expect(metrics.boundaryEdgeCount).toBeGreaterThan(0);
      expect(metrics.structuralAlignmentBasisPoints).toBe(10_000);
      expect(metrics.anyNaturalAlignmentBasisPoints).toBe(10_000);
      expect(metrics.unalignedEdgeCount).toBe(0);
      expect(metrics.proof).toBe(true);
      expect(Object.values(metrics).every(value => typeof value === 'number' || typeof value === 'boolean'))
        .toBe(true);
      expect(JSON.stringify(metrics)).not.toMatch(/(?:coordinate|cellKey|regionPair|path)/iu);
      expectBytesUnchanged(fields, before);
    } finally {
      input.grid.clearIndex?.();
    }
  });

  it('rejects politically assigned edges with no natural alignment', () => {
    const fixture = boundaryFixture();
    fixture.barrier.fill(0);
    try {
      const metrics = measureGreaterRealmRegionBoundaryAlignment(fixture);
      expect(metrics.structuralAlignmentBasisPoints).toBe(0);
      expect(metrics.anyNaturalAlignmentBasisPoints).toBe(0);
      expect(metrics.unalignedEdgeCount).toBe(metrics.boundaryEdgeCount);
      expect(metrics.proof).toBe(false);
    } finally {
      fixture.grid.clearIndex?.();
    }
  });

  it('fails closed on a non-reciprocal or non-hex neighbor topology', () => {
    const fixture = boundaryFixture();
    const neighbors = new Int32Array(fixture.grid.neighbors);
    const firstNeighborSlot = neighbors.findIndex(value => value >= 0);
    neighbors[firstNeighborSlot] = 0;
    const malformed = Object.freeze({ ...fixture.grid, neighbors });
    try {
      expect(() => measureGreaterRealmRegionBoundaryAlignment({
        ...fixture,
        grid: malformed,
      })).toThrow(/GREATER_REALM_AUDIT_GRID_NEIGHBOR/u);
    } finally {
      fixture.grid.clearIndex?.();
    }
  });

  it('fails closed when a canonical edge is omitted in both directions', () => {
    const fixture = boundaryFixture();
    const neighbors = new Int32Array(fixture.grid.neighbors);
    const firstNeighborSlot = neighbors.findIndex(value => value >= 0);
    const cell = Math.floor(firstNeighborSlot / 6);
    const direction = firstNeighborSlot % 6;
    const neighbor = neighbors[firstNeighborSlot]!;
    neighbors[firstNeighborSlot] = -1;
    neighbors[neighbor * 6 + ((direction + 3) % 6)] = -1;
    const malformed = Object.freeze({ ...fixture.grid, neighbors });
    try {
      expect(() => measureGreaterRealmRegionBoundaryAlignment({
        ...fixture,
        grid: malformed,
      })).toThrow('GREATER_REALM_AUDIT_GRID_NEIGHBOR_CANONICAL_INVALID');
    } finally {
      fixture.grid.clearIndex?.();
    }
  });

  it('reports exact per-tier resource and Core density without retaining cells', () => {
    const cellCount = 300;
    const tierId = new Uint8Array(cellCount);
    const waterRegime = new Uint8Array(cellCount);
    const barrier = new Uint8Array(cellCount);
    const castleSlot = new Uint8Array(cellCount);
    const legacyProtectedCell = new Uint8Array(cellCount);
    const resourcePotential = new Uint8Array(cellCount);
    const corePotential = new Uint8Array(cellCount);
    const resourceCounts = [20, 28, 40];
    const coreCounts = [14, 20, 28];
    for (let tier = 1; tier <= 3; tier += 1) {
      const start = (tier - 1) * 100;
      tierId.fill(tier, start, start + 100);
      resourcePotential.fill(tier, start, start + resourceCounts[tier - 1]!);
      corePotential.fill(tier, start, start + coreCounts[tier - 1]!);
    }
    const fields = [
      tierId,
      waterRegime,
      barrier,
      castleSlot,
      legacyProtectedCell,
      resourcePotential,
      corePotential,
    ];
    const before = copyBytes(fields);
    const metrics = measureGreaterRealmTierPotentialDensity({
      tierId,
      waterRegime,
      barrier,
      castleSlot,
      legacyProtectedCell,
      resourcePotential,
      corePotential,
    });
    expect(metrics.eligibleCellCount).toEqual({ tierI: 100, tierII: 100, tierIII: 100 });
    expect(metrics.resourceBasisPoints).toEqual({ tierI: 2_000, tierII: 2_800, tierIII: 4_000 });
    expect(metrics.coreBasisPoints).toEqual({ tierI: 1_400, tierII: 2_000, tierIII: 2_800 });
    expect(metrics.invalidPotentialValueCount).toBe(0);
    expect(metrics.ineligiblePotentialCellCount).toBe(0);
    expect(metrics.proof).toBe(true);
    expect(JSON.stringify(metrics)).not.toMatch(/(?:coordinate|cellKey|path)/iu);
    expectBytesUnchanged(fields, before);
  });

  it('fails density proof for wrong-tier and ineligible potential authority', () => {
    const tierId = new Uint8Array(300);
    const waterRegime = new Uint8Array(300);
    const barrier = new Uint8Array(300);
    const castleSlot = new Uint8Array(300);
    const legacyProtectedCell = new Uint8Array(300);
    const resourcePotential = new Uint8Array(300);
    const corePotential = new Uint8Array(300);
    for (let tier = 1; tier <= 3; tier += 1) {
      const start = (tier - 1) * 100;
      tierId.fill(tier, start, start + 100);
      resourcePotential.fill(tier, start, start + [20, 28, 40][tier - 1]!);
      corePotential.fill(tier, start, start + [14, 20, 28][tier - 1]!);
    }
    resourcePotential[0] = 3;
    barrier[1] = 1;
    corePotential[1] = 1;
    const metrics = measureGreaterRealmTierPotentialDensity({
      tierId,
      waterRegime,
      barrier,
      castleSlot,
      legacyProtectedCell,
      resourcePotential,
      corePotential,
    });
    expect(metrics.invalidPotentialValueCount).toBe(1);
    expect(metrics.ineligiblePotentialCellCount).toBe(1);
    expect(metrics.proof).toBe(false);
  });

  it('proves castle capacity, full footprints, broad placement, and robust routes', () => {
    const fixture = castleFixture();
    const input = fixture.input;
    const fields = [
      input.regionId,
      input.tierId,
      input.waterRegime,
      input.barrier,
      input.castleSlot,
      input.legacyCastleSlot,
      input.resourcePotential,
      input.corePotential,
      input.throneAnchor,
      input.slope,
      input.wetnessIndex,
      input.distanceToFreshwater,
      input.distanceToCoast,
      input.landformId,
      input.ecologyClass,
      input.routeClass,
      input.landmarkClass,
    ];
    const before = copyBytes(fields);
    try {
      const metrics = measureGreaterRealmCastleSuitability(input);
      expect(metrics).toMatchObject({
        totalCastleSlotCount: 6,
        legacyCastleSlotCount: 1,
        newCastleSlotCount: 5,
        minimumRegionCastleSlotCount: 1,
        maximumRegionCastleSlotCount: 1,
        fullyClearNewCastleFootprintCount: 5,
        twoRouteAccessCastleCount: 6,
        twoRouteAccessNewCastleCount: 5,
        twoRouteAccessLegacyCastleCount: 1,
        exactCapacityProof: true,
        suitabilityProof: true,
        fullFootprintProof: true,
        distributionProof: true,
        twoRouteAccessProof: true,
        proof: true,
      });
      expect(metrics.minimumMeasuredCastleSpacing).toBeGreaterThanOrEqual(5);
      expect(JSON.stringify(metrics)).not.toMatch(/(?:coordinate|cellKey|regionId|path)/iu);
      expectBytesUnchanged(fields, before);
    } finally {
      input.grid.clearIndex?.();
    }
  });

  it('does not let remote major routes certify missing castle-perimeter entries', () => {
    const fixture = castleFixture();
    const input = fixture.input;
    const targetRegion = 1;
    const centerQ = targetRegion * 20;
    for (const cell of fixture.rings[targetRegion]!) {
      input.routeClass[cell] = GREATER_REALM_ROUTE_CLASS.NONE;
    }
    for (const coordinate of hexDisc(2)) {
      if (Math.max(
        Math.abs(coordinate.q),
        Math.abs(coordinate.r),
        Math.abs(-coordinate.q - coordinate.r),
      ) !== 2) continue;
      input.routeClass[index(
        input.grid,
        centerQ + coordinate.q,
        coordinate.r,
      )] = GREATER_REALM_ROUTE_CLASS.ROAD;
    }
    try {
      const metrics = measureGreaterRealmCastleSuitability(input);
      expect(metrics.routeAccessViolationCount).toBe(1);
      expect(metrics.twoRouteAccessNewCastleCount).toBe(4);
      expect(metrics.twoRouteAccessProof).toBe(false);
      expect(metrics.proof).toBe(false);
    } finally {
      input.grid.clearIndex?.();
    }
  });

  it('requires two connected castle-perimeter entries, not one or two bridges', () => {
    const singleEntryFixture = castleFixture();
    const singleEntryInput = singleEntryFixture.input;
    const targetRegion = 1;
    const centerQ = targetRegion * 20;
    for (const cell of singleEntryFixture.rings[targetRegion]!) {
      singleEntryInput.routeClass[cell] = GREATER_REALM_ROUTE_CLASS.NONE;
    }
    singleEntryInput.routeClass[singleEntryFixture.rings[targetRegion]![0]!]
      = GREATER_REALM_ROUTE_CLASS.ROAD;
    for (const coordinate of hexDisc(2)) {
      if (Math.max(
        Math.abs(coordinate.q),
        Math.abs(coordinate.r),
        Math.abs(-coordinate.q - coordinate.r),
      ) !== 2) continue;
      singleEntryInput.routeClass[index(
        singleEntryInput.grid,
        centerQ + coordinate.q,
        coordinate.r,
      )] = GREATER_REALM_ROUTE_CLASS.ROAD;
    }
    try {
      const singleEntry = measureGreaterRealmCastleSuitability(singleEntryInput);
      expect(singleEntry.routeAccessViolationCount).toBe(1);
      expect(singleEntry.twoRouteAccessProof).toBe(false);
    } finally {
      singleEntryInput.grid.clearIndex?.();
    }

    const disconnectedFixture = castleFixture();
    const disconnectedInput = disconnectedFixture.input;
    for (const cell of disconnectedFixture.rings[targetRegion]!) {
      disconnectedInput.routeClass[cell] = GREATER_REALM_ROUTE_CLASS.NONE;
    }
    disconnectedInput.routeClass[disconnectedFixture.rings[targetRegion]![0]!]
      = GREATER_REALM_ROUTE_CLASS.ROAD;
    disconnectedInput.routeClass[disconnectedFixture.rings[targetRegion]![3]!]
      = GREATER_REALM_ROUTE_CLASS.CARRIAGEWAY;
    try {
      const disconnected = measureGreaterRealmCastleSuitability(disconnectedInput);
      expect(disconnected.routeAccessViolationCount).toBe(1);
      expect(disconnected.twoRouteAccessProof).toBe(false);
    } finally {
      disconnectedInput.grid.clearIndex?.();
    }
  });

  it('separately exposes footprint, flood, and route-access failures', () => {
    const fixture = castleFixture();
    const input = fixture.input;
    const firstNewCastle = fixture.centers[1]!;
    const firstNewNeighbor = fixture.rings[1]![0]!;
    input.resourcePotential[firstNewNeighbor] = 1;
    input.distanceToFreshwater[firstNewCastle] = 1;
    for (const cell of fixture.rings[2]!) input.routeClass[cell] = GREATER_REALM_ROUTE_CLASS.NONE;
    try {
      const metrics = measureGreaterRealmCastleSuitability(input);
      expect(metrics.footprintViolationCount).toBe(1);
      expect(metrics.floodOrWaterClearanceViolationCount).toBe(1);
      expect(metrics.routeAccessViolationCount).toBe(1);
      expect(metrics.suitabilityProof).toBe(false);
      expect(metrics.fullFootprintProof).toBe(false);
      expect(metrics.twoRouteAccessProof).toBe(false);
      expect(metrics.proof).toBe(false);
    } finally {
      input.grid.clearIndex?.();
    }
  });

  it('applies terrain and ecology admission gates only to new castle sites', () => {
    const fixture = castleFixture();
    const input = fixture.input;
    const legacyCastle = fixture.centers[0]!;
    input.slope[legacyCastle] = 0xffff;
    input.wetnessIndex[legacyCastle] = 0xffff;
    input.distanceToFreshwater[legacyCastle] = 0;
    input.distanceToCoast[legacyCastle] = 0;
    input.landformId[legacyCastle] = GREATER_REALM_LANDFORM_ID.MOUNTAIN;
    for (const cell of fixture.rings[0]!) {
      input.ecologyClass[cell] = GREATER_REALM_ECOLOGY_CLASS.NONE;
    }
    try {
      const admitted = measureGreaterRealmCastleSuitability(input);
      expect(admitted.slopeOrStabilityViolationCount).toBe(0);
      expect(admitted.floodOrWaterClearanceViolationCount).toBe(0);
      expect(admitted.ecologyViolationCount).toBe(0);
      expect(admitted.proof).toBe(true);

      input.waterRegime[legacyCastle] = 1;
      const integrityFailure = measureGreaterRealmCastleSuitability(input);
      expect(integrityFailure.waterOrBarrierConflictCount).toBe(1);
      expect(integrityFailure.proof).toBe(false);
    } finally {
      input.grid.clearIndex?.();
    }
  });

  it('fails castle audit before allocation-heavy work on malformed authority', () => {
    const fixture = castleFixture();
    try {
      expect(() => measureGreaterRealmCastleSuitability({
        ...fixture.input,
        slope: new Uint16Array(fixture.input.grid.cellCount - 1),
      })).toThrow('GREATER_REALM_AUDIT_SLOPE_FIELD_INVALID');
    } finally {
      fixture.input.grid.clearIndex?.();
    }
  });

  it('proves two internally vertex-disjoint routes from an inner gate to the throne', () => {
    const fixture = throneFixture();
    const input = fixture.input;
    const fields = [input.regionId, input.waterRegime, input.barrier, input.throneAnchor];
    const before = copyBytes(fields);
    try {
      const metrics = measureGreaterRealmInnerGateThroneRedundancy(input);
      expect(metrics).toEqual({
        innerGateCount: 1,
        validApproachPairCount: 1,
        gateWithTwoIndependentRoutesCount: 1,
        minimumIndependentRouteCount: 2,
        throneAnchorCount: 1,
        proof: true,
      });
      expect(JSON.stringify(metrics)).not.toMatch(/(?:coordinate|cellKey|regionId|path)/iu);
      expectBytesUnchanged(fields, before);
    } finally {
      input.grid.clearIndex?.();
    }
  });

  it('detects the one-cell inner-route cut instead of accepting two named approaches', () => {
    const fixture = throneFixture();
    fixture.input.barrier[fixture.alternateInterior] = 1;
    try {
      const metrics = measureGreaterRealmInnerGateThroneRedundancy(fixture.input);
      expect(metrics.validApproachPairCount).toBe(1);
      expect(metrics.minimumIndependentRouteCount).toBe(1);
      expect(metrics.gateWithTwoIndependentRoutesCount).toBe(0);
      expect(metrics.proof).toBe(false);
    } finally {
      fixture.input.grid.clearIndex?.();
    }
  });

  it('requires one and only one private throne anchor', () => {
    const fixture = throneFixture();
    const extra = index(fixture.input.grid, 0, 1);
    fixture.input.throneAnchor[extra] = 1;
    try {
      const metrics = measureGreaterRealmInnerGateThroneRedundancy(fixture.input);
      expect(metrics.throneAnchorCount).toBe(2);
      expect(metrics.proof).toBe(false);
    } finally {
      fixture.input.grid.clearIndex?.();
    }
  });
});
