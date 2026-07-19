import {
  GENESIS_WATER_BODIES_V1,
  GENESIS_WATER_CELLS_V1,
  GENESIS_WATER_ENVIRONMENT_EPOCH,
  GENESIS_WATER_LAYOUT_V1,
  GENESIS_WATER_SUN_DIRECTION_MICRO,
  type GenesisWaterCellV1
} from '../../../spacetimedb/src/waterWorld';
import {
  CANONICAL_GENESIS_WATER_REVISION_V1,
  GENESIS_WATER_REVISION_ENABLED_CELLS_V1,
  matchesCanonicalGenesisWaterRevisionV1,
  type GenesisWaterRevisionV1
} from '../../../spacetimedb/src/waterRevision';

function row(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : undefined;
}

/**
 * Decode the complete public water projection. A valid digest and exact row
 * catalog are required before any geometry is built; otherwise the caller
 * receives no water and keeps the conservative sky/fog fallback.
 */
export function resolveCanonicalWaterProjection(
  layoutValue: unknown,
  bodiesValue: unknown,
  cellsValue: unknown,
  environmentValue: unknown,
  revisionValue?: unknown
): readonly GenesisWaterCellV1[] | undefined {
  const layout = row(layoutValue);
  if (!layout || layout.activated !== true) return undefined;
  const environment = row(environmentValue);
  if (
    !environment
    || environment.realmId !== GENESIS_WATER_LAYOUT_V1.realmId
    || environment.environmentEpoch !== GENESIS_WATER_ENVIRONMENT_EPOCH
    || environment.waterLayoutVersion !== GENESIS_WATER_LAYOUT_V1.layoutVersion
    || environment.seaLevelMilli !== GENESIS_WATER_LAYOUT_V1.seaLevelMilli
    || environment.sunDirectionXMicro !== GENESIS_WATER_SUN_DIRECTION_MICRO.x
    || environment.sunDirectionYMicro !== GENESIS_WATER_SUN_DIRECTION_MICRO.y
    || environment.sunDirectionZMicro !== GENESIS_WATER_SUN_DIRECTION_MICRO.z
  ) return undefined;
  const fields: readonly [string, unknown][] = [
    ['realmId', GENESIS_WATER_LAYOUT_V1.realmId],
    ['layoutVersion', GENESIS_WATER_LAYOUT_V1.layoutVersion],
    ['policyVersion', GENESIS_WATER_LAYOUT_V1.policyVersion],
    ['generationVersion', GENESIS_WATER_LAYOUT_V1.generationVersion],
    ['canonicalLandCellCount', GENESIS_WATER_LAYOUT_V1.canonicalLandCellCount],
    ['oceanCellCount', GENESIS_WATER_LAYOUT_V1.oceanCellCount],
    ['lakeCellCount', GENESIS_WATER_LAYOUT_V1.lakeCellCount],
    ['lakeBodyCount', GENESIS_WATER_LAYOUT_V1.lakeBodyCount],
    ['riverCount', GENESIS_WATER_LAYOUT_V1.riverCount],
    ['riverCellCount', GENESIS_WATER_LAYOUT_V1.riverCellCount],
    ['seaLevelMilli', GENESIS_WATER_LAYOUT_V1.seaLevelMilli],
    ['seaLevelPolicyVersion', GENESIS_WATER_LAYOUT_V1.seaLevelPolicyVersion],
    ['fogStartDepthCells', GENESIS_WATER_LAYOUT_V1.fogStartDepthCells],
    ['fogFullDepthCells', GENESIS_WATER_LAYOUT_V1.fogFullDepthCells],
    ['hiddenBufferCells', GENESIS_WATER_LAYOUT_V1.hiddenBufferCells],
    ['layoutDigest', GENESIS_WATER_LAYOUT_V1.layoutDigest],
    ['sourceCommit', GENESIS_WATER_LAYOUT_V1.sourceCommit]
  ];
  if (!fields.every(([name, expected]) => layout[name] === expected)) return undefined;
  if (!Array.isArray(bodiesValue) || bodiesValue.length !== GENESIS_WATER_BODIES_V1.length) return undefined;
  if (!Array.isArray(cellsValue) || cellsValue.length !== GENESIS_WATER_CELLS_V1.length) return undefined;
  const bodies = new Map(GENESIS_WATER_BODIES_V1.map((body) => [body.bodyId, body]));
  const seenBodies = new Set<string>();
  for (const value of bodiesValue) {
    const candidate = row(value);
    if (!candidate || typeof candidate.bodyId !== 'string' || seenBodies.has(candidate.bodyId)) return undefined;
    const expected = bodies.get(candidate.bodyId);
    if (!expected || candidate.realmId !== expected.realmId || candidate.regime !== expected.regime
      || candidate.cellCount !== expected.cellCount || candidate.sourceCellKey !== expected.sourceCellKey
      || candidate.mouthCellKey !== expected.mouthCellKey || candidate.surfaceLevelMilli !== expected.surfaceLevelMilli
      || candidate.flowDirectionXQ15 !== expected.flowDirectionXQ15
      || candidate.flowDirectionZQ15 !== expected.flowDirectionZQ15
      || candidate.wavePreset !== expected.wavePreset
      || candidate.ordinal !== expected.ordinal
      || candidate.seed !== expected.seed
      || candidate.generationVersion !== expected.generationVersion
      || candidate.layoutVersion !== expected.layoutVersion) return undefined;
    seenBodies.add(candidate.bodyId);
  }
  const cells = new Map(GENESIS_WATER_CELLS_V1.map((cell) => [cell.cellKey, cell]));
  const seenCells = new Set<string>();
  for (const value of cellsValue) {
    const candidate = row(value);
    if (!candidate || typeof candidate.cellKey !== 'string' || seenCells.has(candidate.cellKey)) return undefined;
    const expected = cells.get(candidate.cellKey);
    if (!expected || candidate.realmId !== expected.realmId || candidate.q !== expected.q || candidate.r !== expected.r
      || candidate.regime !== expected.regime || candidate.bodyId !== expected.bodyId
      || candidate.depthCells !== expected.depthCells || candidate.elevationMilli !== expected.elevationMilli
      || candidate.surfaceLevelMilli !== expected.surfaceLevelMilli
      || candidate.ring !== expected.ring || candidate.s !== expected.s
      || candidate.underlyingTileKey !== (expected.underlyingTileKey ?? undefined)
      || candidate.riverOrdinal !== (expected.riverOrdinal ?? undefined)
      || candidate.riverOrder !== (expected.riverOrder ?? undefined)
      || candidate.downstreamWaterCellKey !== (expected.downstreamWaterCellKey ?? undefined)
      || candidate.flowAccumulation !== expected.flowAccumulation
      || candidate.depthClass !== expected.depthClass
      || candidate.oceanDepth !== expected.oceanDepth
      || candidate.bankSeed !== expected.bankSeed
      || candidate.generationVersion !== expected.generationVersion
      || candidate.fogBand !== expected.fogBand
      || candidate.layoutVersion !== expected.layoutVersion) return undefined;
    seenCells.add(candidate.cellKey);
  }
  if (revisionValue === undefined) return GENESIS_WATER_CELLS_V1;
  const revision = row(revisionValue);
  if (
    !revision
    || typeof revision.activated !== 'boolean'
    || !matchesCanonicalGenesisWaterRevisionV1(
      revision as GenesisWaterRevisionV1
    )
  ) return undefined;
  if (!revision.activated) return GENESIS_WATER_CELLS_V1;
  if (
    revision.revisionVersion !== CANONICAL_GENESIS_WATER_REVISION_V1.revisionVersion
    || GENESIS_WATER_REVISION_ENABLED_CELLS_V1.some((cell) => cell.regime === 'lake')
  ) return undefined;
  return GENESIS_WATER_REVISION_ENABLED_CELLS_V1;
}
