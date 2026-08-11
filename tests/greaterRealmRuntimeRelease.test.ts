// @vitest-environment node

import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { GREATER_REALM_REGION_SPECS } from '../scripts/atlas/greater-realm-candidate-generator';
import {
  GREATER_REALM_WATER_REGIME_ID,
} from '../scripts/atlas/greater-realm-hydrology-authority';
import {
  GREATER_REALM_ROUTE_CLASS,
} from '../scripts/atlas/greater-realm-living-world';
import { openGreaterRealmPrivateWorkspace } from '../scripts/atlas/greater-realm-private-workspace';
import {
  GREATER_REALM_RUNTIME_RELEASE_FIXTURE_LEGACY_RESOURCE_COUNT,
  GREATER_REALM_RUNTIME_RELEASE_FIXTURE_LOWLANDS_TILE_KEYS,
  GREATER_REALM_RUNTIME_RELEASE_FIXTURE_SOURCE_COMMIT,
  createGreaterRealmRuntimeReleaseFixtureSource,
  greaterRealmRuntimeReleaseFixtureSeed,
} from '../scripts/atlas/greater-realm-runtime-release-test-fixture';
import {
  GREATER_REALM_RUNTIME_RELEASE_DIRECTORY,
  GREATER_REALM_RUNTIME_RELEASE_SEED_CONTROL_PATH,
  createGreaterRealmRuntimeRelease,
  greaterRealmRuntimeReleaseTestSeams,
  openOrCreateGreaterRealmRuntimeReleaseSeed,
  readGreaterRealmRuntimeRelease,
  verifyGreaterRealmRuntimeReleaseArtifacts,
  writeGreaterRealmRuntimeRelease,
  type GreaterRealmRuntimeReleaseArtifacts,
  type GreaterRealmRuntimeReleaseSource,
} from '../scripts/atlas/greater-realm-runtime-release';

vi.setConfig({ testTimeout: 90_000 });

const temporaryRoots: string[] = [];

function mutateAndRehashChunk(
  sourceArtifacts: GreaterRealmRuntimeReleaseArtifacts,
  chunkIndex: number,
  mutate: (payload: Record<string, unknown>) => void,
): GreaterRealmRuntimeReleaseArtifacts {
  const chunks = [...sourceArtifacts.chunks];
  const original = chunks[chunkIndex]!;
  const payload = JSON.parse(JSON.stringify(original.payload)) as Record<string, unknown>;
  mutate(payload);
  const cells = payload.cells as readonly Readonly<{ releaseOrdinal: number }>[];
  const apron = payload.apronCellKeys as readonly string[];
  const slots = payload.castleSlots as readonly Readonly<{ releaseOrdinal: number }>[];
  const nodes = payload.resourceNodes as readonly Readonly<{ releaseOrdinal: number }>[];
  const lod1 = payload.lod1CellKeys as readonly string[];
  const lod2 = payload.lod2CellKeys as readonly string[];
  const lod3 = payload.lod3CellKeys as readonly string[];
  payload.importBatches = {
    castleSlots: greaterRealmRuntimeReleaseTestSeams.importBatchDescriptors(slots, 128),
    resourceNodes: greaterRealmRuntimeReleaseTestSeams.importBatchDescriptors(nodes, 256),
  };
  payload.sectionDigests = {
    cellsSha256: greaterRealmRuntimeReleaseTestSeams.sha256(
      greaterRealmRuntimeReleaseTestSeams.canonicalBytes(cells),
    ),
    apronSha256: greaterRealmRuntimeReleaseTestSeams.sha256(
      greaterRealmRuntimeReleaseTestSeams.canonicalBytes(apron),
    ),
    lodSha256: greaterRealmRuntimeReleaseTestSeams.sha256(
      greaterRealmRuntimeReleaseTestSeams.canonicalBytes({ lod1, lod2, lod3 }),
    ),
    castleSlotsSha256: greaterRealmRuntimeReleaseTestSeams.sha256(
      greaterRealmRuntimeReleaseTestSeams.canonicalBytes(slots),
    ),
    resourceNodesSha256: greaterRealmRuntimeReleaseTestSeams.sha256(
      greaterRealmRuntimeReleaseTestSeams.canonicalBytes(nodes),
    ),
  };
  const bytes = greaterRealmRuntimeReleaseTestSeams.canonicalBytes(payload);
  chunks[chunkIndex] = Object.freeze({
    path: original.path,
    bytes,
    payload: payload as never,
  });
  const manifest = JSON.parse(JSON.stringify(sourceArtifacts.manifest)) as Record<string, unknown>;
  const descriptor = (manifest.chunks as Array<Record<string, unknown>>)[chunkIndex]!;
  descriptor.sectionDigests = payload.sectionDigests;
  descriptor.payloadSha256 = greaterRealmRuntimeReleaseTestSeams.sha256(bytes);
  return Object.freeze({
    ...sourceArtifacts,
    manifest,
    manifestBytes: greaterRealmRuntimeReleaseTestSeams.canonicalBytes(manifest),
    chunks: Object.freeze(chunks),
  });
}

describe('Greater Realm declassified runtime release', () => {
  let source: GreaterRealmRuntimeReleaseSource;
  let artifacts: GreaterRealmRuntimeReleaseArtifacts;

  beforeAll(() => {
    source = createGreaterRealmRuntimeReleaseFixtureSource();
    artifacts = createGreaterRealmRuntimeRelease({
      source,
      sourceCommit: GREATER_REALM_RUNTIME_RELEASE_FIXTURE_SOURCE_COMMIT,
      releaseSeed: greaterRealmRuntimeReleaseFixtureSeed(),
    });
  });

  afterAll(() => {
    source.grid.clearIndex?.();
    for (const root of temporaryRoots.splice(0)) {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('exports six exact Tier-I aggregates, 600 slots, and 12,000 regional resource nodes', () => {
    expect(() => verifyGreaterRealmRuntimeReleaseArtifacts(artifacts)).not.toThrow();
    expect(artifacts.manifest.regions).toEqual(
      GREATER_REALM_REGION_SPECS.slice(0, 6).map((region, ordinal) => expect.objectContaining({
        regionId: region.id,
        publicName: region.name,
        ordinal,
        tier: 1,
        castleCapacity: 100,
        resourceNodeCount: 2_000,
        foodNodeCount: 500,
        woodNodeCount: 500,
        stoneNodeCount: 500,
        goldNodeCount: 500,
      })),
    );
    expect(artifacts.status).toMatchObject({
      verified: true,
      tierOneOnly: true,
      regionCount: 6,
      castleSlotCount: 600,
      resourceNodeCount: 12_000,
      productionUntouched: true,
    });
    // Contract vector: length-framed canonical header, ordered chunks,
    // components, and all six four-kind region aggregates.
    expect(artifacts.manifest.releaseSha256)
      .toBe('79586429fc5667ca33fd1d6d957891c51c376588ab83e6d39adbfe2df03e68ad');
    expect((artifacts.manifest.components as Array<Record<string, unknown>>)[0]!.componentSha256)
      .toBe('041f1c83565865d554ffe4a74325959aa6d2e588ca64fb780a9ec31ece2243e3');
    const slotless = (artifacts.manifest.components as Array<Record<string, number>>)
      .filter(component => component.expectedSlotCount === 0);
    expect(slotless.length).toBeGreaterThan(0);
    expect(slotless.every(component => (
      component.expectedFoodNodeCount === 0
      && component.expectedWoodNodeCount === 0
      && component.expectedStoneNodeCount === 0
      && component.expectedGoldNodeCount === 0
    ))).toBe(true);
  });

  it('uses exact 15x15 axial bins, bounded visible windows, and exact public cell keys', () => {
    const descriptors = artifacts.manifest.chunks as Array<Record<string, unknown>>;
    let sawApronHeavyBorderChunk = false;
    for (const [index, chunk] of artifacts.chunks.entries()) {
      const descriptor = descriptors[index]!;
      expect(chunk.payload.cells.length).toBeLessThanOrEqual(225);
      expect(chunk.payload.cells.length + chunk.payload.apronCellKeys.length)
        .toBeLessThanOrEqual(384);
      expect(descriptor.chunkCoordKey).toBe(`B:${descriptor.binQ}:${descriptor.binR}`);
      for (const cell of chunk.payload.cells) {
        expect(Math.floor(cell.atlasQ / 15)).toBe(descriptor.binQ);
        expect(Math.floor(cell.atlasR / 15)).toBe(descriptor.binR);
        expect(cell.cellKey).toBe(`${cell.regionId}:${cell.localQ}:${cell.localR}`);
      }
      const visible = [
        ...chunk.payload.cells.map(cell => cell.cellKey),
        ...chunk.payload.apronCellKeys,
      ];
      if (chunk.payload.apronCellKeys.length > chunk.payload.cells.length) {
        sawApronHeavyBorderChunk = true;
      }
      expect(chunk.payload.lod1CellKeys).toHaveLength(Math.ceil(visible.length / 2));
      expect(chunk.payload.lod2CellKeys).toHaveLength(
        Math.ceil(chunk.payload.lod1CellKeys.length / 2),
      );
      expect(chunk.payload.lod3CellKeys).toHaveLength(
        Math.ceil(chunk.payload.lod2CellKeys.length / 2),
      );
      expect(chunk.payload.lod1CellKeys.every(key => visible.includes(key))).toBe(true);
      expect(chunk.payload.lod2CellKeys.every(key => chunk.payload.lod1CellKeys.includes(key)))
        .toBe(true);
      expect(chunk.payload.lod3CellKeys.every(key => chunk.payload.lod2CellKeys.includes(key)))
        .toBe(true);
      const coreKeys = new Set(chunk.payload.cells.map(cell => cell.cellKey));
      expect(chunk.payload.lod1CellKeys.some(key => coreKeys.has(key))).toBe(true);
      expect(chunk.payload.lod2CellKeys.some(key => coreKeys.has(key))).toBe(true);
      expect(chunk.payload.lod3CellKeys.some(key => coreKeys.has(key))).toBe(true);
    }
    expect(sawApronHeavyBorderChunk).toBe(true);
  });

  it('pins every passable parent and retains only reviewed river or stream fords as wet routes', () => {
    const cells = artifacts.chunks.flatMap(chunk => chunk.payload.cells);
    const byCoordinate = new Map(cells.map(cell => [cell.atlasCoordKey, cell] as const));
    for (const cell of cells) {
      if (!cell.passable) {
        expect(cell.componentKey).toBeUndefined();
        expect(cell.routeDepth).toBeUndefined();
        expect(cell.routeParentDirection).toBeUndefined();
        continue;
      }
      expect(cell.componentKey).toMatch(/^GRC-[A-Z2-7]{26}$/u);
      if (cell.routeDepth === 0) {
        expect(cell.routeParentDirection).toBeUndefined();
        continue;
      }
      const direction = [
        [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1],
      ][cell.routeParentDirection!]!;
      const parent = byCoordinate.get(`A:${cell.atlasQ + direction[0]}:${cell.atlasR + direction[1]}`);
      expect(parent?.componentKey).toBe(cell.componentKey);
      expect(parent?.routeDepth).toBe(cell.routeDepth! - 1);
    }
    const wetPassable = cells.filter(cell => (
      cell.passable && cell.hydroRegime !== GREATER_REALM_WATER_REGIME_ID.DRY
    ));
    expect(wetPassable).toHaveLength(1);
    expect(wetPassable[0]).toMatchObject({
      hydroRegime: GREATER_REALM_WATER_REGIME_ID.RIVER,
      travelClass: GREATER_REALM_ROUTE_CLASS.FORD,
    });
  });

  it('remaps topology identity and derives full public presentation without private material', () => {
    const cells = artifacts.chunks.flatMap(chunk => chunk.payload.cells);
    const lakes = cells.filter(cell => cell.hydroRegime === GREATER_REALM_WATER_REGIME_ID.LAKE);
    expect(lakes).toHaveLength(2);
    expect(new Set(lakes.map(cell => cell.hydroBodyId)).size).toBe(1);
    expect(lakes[0]!.hydroBodyId).toMatch(/^GRW-[A-Z2-7]{26}$/u);
    expect(lakes.every(cell => !cell.passable && cell.componentKey === undefined)).toBe(true);
    const ridge = cells.find(cell => cell.ridgeId !== undefined);
    expect(ridge?.ridgeId).toMatch(/^GRD-[A-Z2-7]{26}$/u);
    expect(ridge?.ridgeId).not.toContain('42');
    expect(cells[0]).toEqual(expect.objectContaining({
      profileCurvature: 17,
      planCurvature: -19,
      habitatClass: expect.any(Number),
      canopyBasisPoints: expect.any(Number),
      groundcoverBasisPoints: expect.any(Number),
      wildflowerBasisPoints: expect.any(Number),
      bankVariant: expect.any(Number),
      presentationVariant: expect.any(Number),
    }));
    const wireText = JSON.stringify({
      manifest: artifacts.manifest,
      status: artifacts.status,
      chunks: artifacts.chunks.map(chunk => chunk.payload),
    });
    expect(wireText).not.toContain('deadbeef');
    expect(wireText).not.toContain('T2_CROWNWOOD');
    expect(wireText).not.toContain('20000:-20000');
  });

  it('preserves exact reversible Lowlands cells, slots, and all catalog locations', () => {
    const cells = artifacts.chunks.flatMap(chunk => chunk.payload.cells);
    const lowlandsKeys = new Set(cells
      .filter(cell => cell.regionId === 'T1_LOWLANDS')
      .map(cell => `${cell.localQ},${cell.localR}`));
    expect(lowlandsKeys.size).toBe(10_000);
    for (const key of GREATER_REALM_RUNTIME_RELEASE_FIXTURE_LOWLANDS_TILE_KEYS) {
      expect(lowlandsKeys.has(key)).toBe(true);
    }
    const slots = artifacts.chunks.flatMap(chunk => chunk.payload.castleSlots);
    expect(slots.filter(slot => slot.legacySlotId !== undefined)
      .map(slot => slot.legacySlotId)
      .sort((first, second) => first! - second!))
      .toEqual(Array.from({ length: 100 }, (_, index) => index + 1));
    expect(slots.filter(slot => slot.legacySlotId === undefined)).toHaveLength(500);
    const nodes = artifacts.chunks.flatMap(chunk => chunk.payload.resourceNodes);
    const catalogIds = new Set(nodes
      .filter(node => node.legacyCatalogId !== undefined)
      .map(node => `${node.resourceKind}:${node.legacyCatalogId}`));
    expect(catalogIds.size).toBe(GREATER_REALM_RUNTIME_RELEASE_FIXTURE_LEGACY_RESOURCE_COUNT);
    expect(nodes.filter(node => node.regionId === 'T1_LOWLANDS')).toHaveLength(2_000);
  });

  it('is deterministic for one control seed and independent for a fresh public seed', () => {
    const replay = createGreaterRealmRuntimeRelease({
      source,
      sourceCommit: GREATER_REALM_RUNTIME_RELEASE_FIXTURE_SOURCE_COMMIT,
      releaseSeed: greaterRealmRuntimeReleaseFixtureSeed(),
    });
    const fresh = createGreaterRealmRuntimeRelease({
      source,
      sourceCommit: GREATER_REALM_RUNTIME_RELEASE_FIXTURE_SOURCE_COMMIT,
      releaseSeed: greaterRealmRuntimeReleaseFixtureSeed(7),
    });
    expect(replay.manifestBytes).toEqual(artifacts.manifestBytes);
    expect(replay.statusBytes).toEqual(artifacts.statusBytes);
    expect(replay.chunks.map(chunk => chunk.bytes)).toEqual(artifacts.chunks.map(chunk => chunk.bytes));
    expect(fresh.manifest.publicReleaseId).not.toBe(artifacts.manifest.publicReleaseId);
    expect(fresh.manifest.publicApprovalReceiptId).not.toBe(artifacts.manifest.publicApprovalReceiptId);
  });

  it('does not let an unused owner selection channel influence any release byte', () => {
    const alternateSource = createGreaterRealmRuntimeReleaseFixtureSource({
      fillUnusedOwnerSelectionChannel: true,
    });
    try {
      const alternate = createGreaterRealmRuntimeRelease({
        source: alternateSource,
        sourceCommit: GREATER_REALM_RUNTIME_RELEASE_FIXTURE_SOURCE_COMMIT,
        releaseSeed: greaterRealmRuntimeReleaseFixtureSeed(),
      });
      expect(alternate.manifestBytes).toEqual(artifacts.manifestBytes);
      expect(alternate.statusBytes).toEqual(artifacts.statusBytes);
      expect(alternate.chunks.map(chunk => chunk.bytes))
        .toEqual(artifacts.chunks.map(chunk => chunk.bytes));
    } finally {
      alternateSource.grid.clearIndex?.();
    }
  });

  it('rejects byte tampering and private authority injected into a public object', () => {
    const first = artifacts.chunks[0]!;
    const tamperedBytes = Buffer.from(first.bytes);
    tamperedBytes[tamperedBytes.length - 2] ^= 1;
    const tampered = Object.freeze({
      ...artifacts,
      chunks: Object.freeze([
        Object.freeze({ ...first, bytes: tamperedBytes }),
        ...artifacts.chunks.slice(1),
      ]),
    });
    expect(() => verifyGreaterRealmRuntimeReleaseArtifacts(tampered))
      .toThrow('GREATER_REALM_RUNTIME_RELEASE_CHUNK_INVALID');
    expect(() => greaterRealmRuntimeReleaseTestSeams.assertNoPrivateReleaseMaterial({
      ...artifacts.manifest,
      candidateHandle: 'GR-A-AAAAAAAAAAAAAAAA',
    })).toThrow('GREATER_REALM_RUNTIME_RELEASE_PRIVACY_BOUNDARY_INVALID');
    for (const generatorOnlyKey of [
      'resourcePotential',
      'corePotential',
      'throneAnchor',
      'gateCell',
      'gateApproachCell',
      'barrier',
      'barrierCrossSections',
      'seedNamespace',
      'terrainSeedNamespace',
      'rootSeed',
      'candidateSeed',
      'presentationSeed',
    ]) {
      expect(() => greaterRealmRuntimeReleaseTestSeams.assertNoPrivateReleaseMaterial({
        [generatorOnlyKey]: 1,
      })).toThrow('GREATER_REALM_RUNTIME_RELEASE_PRIVACY_BOUNDARY_INVALID');
    }
  });

  it('rejects rehashed route-closure and resource-count tampering', () => {
    const closureChunkIndex = artifacts.chunks.findIndex(chunk => (
      chunk.payload.cells.some(cell => cell.routeDepth === 1)
    ));
    const closureTampered = mutateAndRehashChunk(artifacts, closureChunkIndex, payload => {
      const cell = (payload.cells as Array<Record<string, unknown>>)
        .find(candidate => candidate.routeDepth === 1)!;
      cell.routeDepth = 3;
    });
    expect(() => verifyGreaterRealmRuntimeReleaseArtifacts(closureTampered))
      .toThrow('GREATER_REALM_RUNTIME_RELEASE_COMPONENT_CLOSURE_INVALID');

    const countChunkIndex = artifacts.chunks.findIndex(chunk => (
      chunk.payload.resourceNodes.length > 0
    ));
    const countTampered = mutateAndRehashChunk(artifacts, countChunkIndex, payload => {
      (payload.resourceNodes as unknown[]).pop();
    });
    expect(() => verifyGreaterRealmRuntimeReleaseArtifacts(countTampered))
      .toThrow('GREATER_REALM_RUNTIME_RELEASE_COUNT_INVALID');
  });

  it('persists a 0600 seed control before a 0700 release and makes exact retries idempotent', async () => {
    const root = mkdtempSync(join(tmpdir(), 'warpkeep-runtime-release-'));
    temporaryRoots.push(root);
    const repositoryRoot = join(root, 'repository');
    const workspaceRoot = join(root, 'private-workspace');
    mkdirSync(repositoryRoot, { mode: 0o700 });
    const workspace = openGreaterRealmPrivateWorkspace({ repositoryRoot, workspaceRoot });
    const firstSeed = openOrCreateGreaterRealmRuntimeReleaseSeed(workspace);
    const firstSeedCopy = Buffer.from(firstSeed);
    const controlledArtifacts = createGreaterRealmRuntimeRelease({
      source,
      sourceCommit: GREATER_REALM_RUNTIME_RELEASE_FIXTURE_SOURCE_COMMIT,
      releaseSeed: firstSeed,
    });
    firstSeed.fill(0);
    const replaySeed = openOrCreateGreaterRealmRuntimeReleaseSeed(workspace);
    expect(replaySeed).toEqual(firstSeedCopy);
    replaySeed.fill(0);
    firstSeedCopy.fill(0);
    await expect(writeGreaterRealmRuntimeRelease({ workspace, artifacts: controlledArtifacts }))
      .resolves.toBe('installed');
    await expect(writeGreaterRealmRuntimeRelease({ workspace, artifacts: controlledArtifacts }))
      .resolves.toBe('unchanged');
    const installed = readGreaterRealmRuntimeRelease(workspace);
    expect(installed.manifestBytes).toEqual(controlledArtifacts.manifestBytes);
    expect(statSync(workspaceRoot).mode & 0o777).toBe(0o700);
    expect(statSync(join(workspaceRoot, GREATER_REALM_RUNTIME_RELEASE_SEED_CONTROL_PATH)).mode & 0o777)
      .toBe(0o600);
    expect(statSync(join(workspaceRoot, GREATER_REALM_RUNTIME_RELEASE_DIRECTORY)).mode & 0o777)
      .toBe(0o700);
  });

  it('fails closed when publication lacks its separate seed control', async () => {
    const root = mkdtempSync(join(tmpdir(), 'warpkeep-runtime-release-no-control-'));
    temporaryRoots.push(root);
    const repositoryRoot = join(root, 'repository');
    const workspaceRoot = join(root, 'private-workspace');
    mkdirSync(repositoryRoot, { mode: 0o700 });
    const workspace = openGreaterRealmPrivateWorkspace({ repositoryRoot, workspaceRoot });
    await expect(writeGreaterRealmRuntimeRelease({ workspace, artifacts }))
      .rejects.toThrow('GREATER_REALM_RUNTIME_RELEASE_SEED_CONTROL_MISSING');
  });
});
