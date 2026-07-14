export const CASTLE_LODS = ['compact', 'balanced', 'high'] as const;

export type CastleLod = (typeof CASTLE_LODS)[number];

export type CastleLodPolicy = Readonly<{
  /** Promote a Balanced castle to High at or above this projected diameter. */
  highEnterPixels: number;
  /** Keep a High castle in High until it falls below this projected diameter. */
  highExitPixels: number;
  /** Promote a Compact castle to Balanced at or above this projected diameter. */
  balancedEnterPixels: number;
  /** Keep a Balanced castle in Balanced until it falls below this diameter. */
  balancedExitPixels: number;
  /** Device/profile ceiling. A selected castle never exceeds this LOD. */
  maximumLod: CastleLod;
  /** Minimum selected-castle LOD, capped by maximumLod. */
  selectedMinimumLod: CastleLod;
  /** Hard cap for simultaneously visible High instances. */
  highInstanceBudget: number;
  /** Hard cap for simultaneously visible Balanced instances. */
  balancedInstanceBudget: number;
}>;

export const DEFAULT_CASTLE_LOD_POLICY: CastleLodPolicy = Object.freeze({
  highEnterPixels: 96,
  highExitPixels: 76,
  balancedEnterPixels: 36,
  balancedExitPixels: 28,
  maximumLod: 'high',
  selectedMinimumLod: 'high',
  highInstanceBudget: 8,
  balancedInstanceBudget: 24
});

export type CastleLodState = Readonly<Record<string, CastleLod>>;

export type CastleInstanceCandidate<T> = Readonly<{
  castleId: number;
  projectedDiameterPixels: number;
  /** Camera-space priority. Smaller finite values win constrained LOD slots. */
  cameraDistance?: number;
  visible: boolean;
  data: T;
}>;

export type PackedCastleInstance<T> = Readonly<{
  castleId: number;
  instanceId: number;
  lod: CastleLod;
  data: T;
}>;

export type CastleInstanceLocation = Readonly<{
  instanceId: number;
  lod: CastleLod;
}>;

export type CastleInstancePacking<T> = Readonly<{
  buckets: Readonly<Record<CastleLod, readonly PackedCastleInstance<T>[]>>;
  lodByCastleId: CastleLodState;
  totalVisible: number;
  resolveCastleId: (lod: CastleLod, instanceId: number) => number | undefined;
  resolveInstance: (castleId: number) => CastleInstanceLocation | undefined;
}>;

export type PackCastleInstancesOptions = Readonly<{
  policy?: CastleLodPolicy;
  previousLods?: CastleLodState;
  selectedCastleId?: number;
}>;

const LOD_RANK: Readonly<Record<CastleLod, number>> = Object.freeze({
  compact: 0,
  balanced: 1,
  high: 2
});

function finitePixels(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function assertPolicy(policy: CastleLodPolicy) {
  const values = [
    policy.balancedExitPixels,
    policy.balancedEnterPixels,
    policy.highExitPixels,
    policy.highEnterPixels
  ];
  const selectedFloorRank = Math.min(
    LOD_RANK[policy.selectedMinimumLod],
    LOD_RANK[policy.maximumLod]
  );
  if (
    values.some((value) => !Number.isFinite(value) || value < 0)
    || !Number.isSafeInteger(policy.highInstanceBudget)
    || policy.highInstanceBudget < 0
    || !Number.isSafeInteger(policy.balancedInstanceBudget)
    || policy.balancedInstanceBudget < 0
    || policy.balancedExitPixels > policy.balancedEnterPixels
    || policy.balancedEnterPixels > policy.highExitPixels
    || policy.highExitPixels > policy.highEnterPixels
    || (selectedFloorRank === LOD_RANK.high && policy.highInstanceBudget < 1)
    || (selectedFloorRank === LOD_RANK.balanced && policy.balancedInstanceBudget < 1)
  ) {
    throw new Error('Invalid castle LOD hysteresis policy.');
  }
}

function priorityDistance<T>(candidate: CastleInstanceCandidate<T>) {
  return Number.isFinite(candidate.cameraDistance)
    ? Math.max(0, candidate.cameraDistance ?? 0)
    : Number.POSITIVE_INFINITY;
}

function compareCastlePriority<T>(
  left: CastleInstanceCandidate<T>,
  right: CastleInstanceCandidate<T>,
  selectedCastleId: number | undefined
) {
  const leftSelected = left.castleId === selectedCastleId ? 0 : 1;
  const rightSelected = right.castleId === selectedCastleId ? 0 : 1;
  return leftSelected - rightSelected
    || priorityDistance(left) - priorityDistance(right)
    || finitePixels(right.projectedDiameterPixels) - finitePixels(left.projectedDiameterPixels)
    || left.castleId - right.castleId;
}

function lowerQuality(first: CastleLod, second: CastleLod) {
  return LOD_RANK[first] <= LOD_RANK[second] ? first : second;
}

function higherQuality(first: CastleLod, second: CastleLod) {
  return LOD_RANK[first] >= LOD_RANK[second] ? first : second;
}

/**
 * Pure screen-space LOD selection with separate enter/exit thresholds.
 * Callers retain the returned LOD by castle ID and feed it into the next pack.
 */
export function selectCastleLod(
  projectedDiameterPixels: number,
  previousLod: CastleLod | undefined,
  selected: boolean,
  policy: CastleLodPolicy = DEFAULT_CASTLE_LOD_POLICY
): CastleLod {
  assertPolicy(policy);
  const pixels = finitePixels(projectedDiameterPixels);
  const cappedPrevious = previousLod
    ? lowerQuality(previousLod, policy.maximumLod)
    : undefined;
  let lod: CastleLod;

  if (cappedPrevious === 'high') {
    lod = pixels >= policy.highExitPixels
      ? 'high'
      : pixels >= policy.balancedExitPixels ? 'balanced' : 'compact';
  } else if (cappedPrevious === 'balanced') {
    lod = pixels >= policy.highEnterPixels
      ? 'high'
      : pixels >= policy.balancedExitPixels ? 'balanced' : 'compact';
  } else {
    lod = pixels >= policy.highEnterPixels
      ? 'high'
      : pixels >= policy.balancedEnterPixels ? 'balanced' : 'compact';
  }

  lod = lowerQuality(lod, policy.maximumLod);
  if (selected) {
    lod = higherQuality(lod, lowerQuality(policy.selectedMinimumLod, policy.maximumLod));
  }
  return lod;
}

/**
 * Deterministically repacks visible castles into one instance-ID namespace per
 * LOD. Input subscription order is intentionally irrelevant: castleId is the
 * sole packing key and duplicate IDs fail closed.
 */
export function packCastleInstances<T>(
  candidates: readonly CastleInstanceCandidate<T>[],
  options: PackCastleInstancesOptions = {}
): CastleInstancePacking<T> {
  const policy = options.policy ?? DEFAULT_CASTLE_LOD_POLICY;
  assertPolicy(policy);
  const ordered = [...candidates].sort((left, right) => left.castleId - right.castleId);
  const seen = new Set<number>();
  const buckets: Record<CastleLod, PackedCastleInstance<T>[]> = {
    compact: [],
    balanced: [],
    high: []
  };
  const lodByCastleId: Record<string, CastleLod> = Object.create(null) as Record<string, CastleLod>;
  const locationByCastleId: Record<string, CastleInstanceLocation> = Object.create(null) as Record<string, CastleInstanceLocation>;
  const desiredLodByCastleId: Record<string, CastleLod> = Object.create(null) as Record<string, CastleLod>;

  for (const candidate of ordered) {
    if (!Number.isSafeInteger(candidate.castleId) || candidate.castleId < 0) {
      throw new Error(`Invalid castle ID: ${candidate.castleId}.`);
    }
    if (seen.has(candidate.castleId)) {
      throw new Error(`Duplicate castle ID: ${candidate.castleId}.`);
    }
    seen.add(candidate.castleId);
    const key = String(candidate.castleId);
    const lod = selectCastleLod(
      candidate.projectedDiameterPixels,
      options.previousLods?.[key],
      candidate.castleId === options.selectedCastleId,
      policy
    );
    desiredLodByCastleId[key] = lod;
  }

  const visible = ordered.filter((candidate) => candidate.visible);
  const prioritized = [...visible].sort((left, right) => (
    compareCastlePriority(left, right, options.selectedCastleId)
  ));
  const highCastleIds = new Set(
    prioritized
      .filter((candidate) => desiredLodByCastleId[String(candidate.castleId)] === 'high')
      .slice(0, policy.highInstanceBudget)
      .map((candidate) => candidate.castleId)
  );
  const balancedCastleIds = new Set(
    prioritized
      .filter((candidate) => (
        !highCastleIds.has(candidate.castleId)
        && desiredLodByCastleId[String(candidate.castleId)] !== 'compact'
      ))
      .slice(0, policy.balancedInstanceBudget)
      .map((candidate) => candidate.castleId)
  );

  for (const candidate of ordered) {
    const key = String(candidate.castleId);
    const desiredLod = desiredLodByCastleId[key];
    const lod: CastleLod = !candidate.visible
      ? desiredLod
      : highCastleIds.has(candidate.castleId)
        ? 'high'
        : balancedCastleIds.has(candidate.castleId) ? 'balanced' : 'compact';
    lodByCastleId[key] = lod;
    if (!candidate.visible) continue;

    const instanceId = buckets[lod].length;
    const packed = Object.freeze({
      castleId: candidate.castleId,
      instanceId,
      lod,
      data: candidate.data
    });
    buckets[lod].push(packed);
    locationByCastleId[key] = Object.freeze({ instanceId, lod });
  }

  const frozenBuckets = Object.freeze({
    compact: Object.freeze(buckets.compact),
    balanced: Object.freeze(buckets.balanced),
    high: Object.freeze(buckets.high)
  });
  const castleIdsByLod = Object.freeze({
    compact: Object.freeze(frozenBuckets.compact.map((entry) => entry.castleId)),
    balanced: Object.freeze(frozenBuckets.balanced.map((entry) => entry.castleId)),
    high: Object.freeze(frozenBuckets.high.map((entry) => entry.castleId))
  });

  return Object.freeze({
    buckets: frozenBuckets,
    lodByCastleId: Object.freeze(lodByCastleId),
    totalVisible: frozenBuckets.compact.length
      + frozenBuckets.balanced.length
      + frozenBuckets.high.length,
    resolveCastleId: (lod: CastleLod, instanceId: number) => (
      Number.isSafeInteger(instanceId) && instanceId >= 0
        ? castleIdsByLod[lod][instanceId]
        : undefined
    ),
    resolveInstance: (castleId: number) => locationByCastleId[String(castleId)]
  });
}
