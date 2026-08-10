/**
 * Pure client-side mirror of the reviewed Inner Keep placement surface.
 *
 * Coordinates are integer microunits so previews, accessibility controls, and
 * eventual server authority can make the same boundary and overlap decision
 * without trusting browser floating-point transforms.
 */

export const INNER_KEEP_FREE_PLACEMENT_POLICY_VERSION =
  'genesis-001-inner-keep-free-placement-v1';
export const INNER_KEEP_MICROUNITS_PER_METER = 1_000_000n;
export const INNER_KEEP_PLACEMENT_SNAP_MICROUNITS = 500_000n;

export type InnerKeepFreePlacementBuildingKind =
  | 'city-mill'
  | 'lumber-camp'
  | 'city-stoneworks'
  | 'city-goldworks'
  | 'city-barracks'
  | 'grand-covenant-cathedral';

export type InnerKeepFreePlacementRotation = 0 | 90_000 | 180_000 | 270_000;

export type InnerKeepFreePlacementTransform = Readonly<{
  localXMicrounits: bigint;
  localZMicrounits: bigint;
  rotationMilliDegrees: InnerKeepFreePlacementRotation;
}>;

export type InnerKeepOccupiedPlacement = InnerKeepFreePlacementTransform & Readonly<{
  buildingKey: string;
  buildingKind: InnerKeepFreePlacementBuildingKind;
}>;

export type InnerKeepPlacementEnvelope = Readonly<{
  buildingKind: InnerKeepFreePlacementBuildingKind;
  assetBoundsMeters: readonly [number, number];
  halfExtentsMeters: readonly [number, number];
  halfExtentsMicrounits: readonly [bigint, bigint];
  entranceApronMeters: readonly [number, number];
  runtimeScalePermille: 1_000;
}>;

function envelope(
  buildingKind: InnerKeepFreePlacementBuildingKind,
  assetBoundsMeters: readonly [number, number],
  halfExtentsMeters: readonly [number, number],
  entranceApronMeters: readonly [number, number],
): InnerKeepPlacementEnvelope {
  return Object.freeze({
    buildingKind,
    assetBoundsMeters: Object.freeze(assetBoundsMeters),
    halfExtentsMeters: Object.freeze(halfExtentsMeters),
    halfExtentsMicrounits: Object.freeze([
      BigInt(Math.round(halfExtentsMeters[0] * 1_000_000)),
      BigInt(Math.round(halfExtentsMeters[1] * 1_000_000)),
    ] as const),
    entranceApronMeters: Object.freeze(entranceApronMeters),
    runtimeScalePermille: 1_000 as const,
  });
}

export const INNER_KEEP_FREE_PLACEMENT_ENVELOPES = Object.freeze({
  'city-mill': envelope('city-mill', [9.3, 7.5], [5.65, 4.75], [6, 4]),
  'lumber-camp': envelope('lumber-camp', [8.6, 6.8], [5.3, 4.4], [6, 4]),
  'city-stoneworks': envelope('city-stoneworks', [9, 7.2], [5.5, 4.6], [6, 4]),
  'city-goldworks': envelope('city-goldworks', [9, 7.2], [5.5, 4.6], [6, 4]),
  'city-barracks': envelope('city-barracks', [16, 13], [9.25, 7.75], [6, 4]),
  'grand-covenant-cathedral': envelope(
    'grand-covenant-cathedral',
    [34, 29.02],
    [18.5, 16.01],
    [8, 5],
  ),
} satisfies Readonly<Record<InnerKeepFreePlacementBuildingKind, InnerKeepPlacementEnvelope>>);

export const INNER_KEEP_FREE_PLACEMENT_ROTATIONS = Object.freeze([
  0,
  90_000,
  180_000,
  270_000,
] as const satisfies readonly InnerKeepFreePlacementRotation[]);

export type InnerKeepPermanentPlacementExclusion = Readonly<{
  exclusionId: string;
  kind: 'road-surface' | 'civic-commons' | 'gate-approach';
  centerMicrounits: readonly [bigint, bigint];
  halfExtentsMicrounits: readonly [bigint, bigint];
}>;

const meters = (value: number) => BigInt(Math.round(value * 1_000_000));

export const INNER_KEEP_FREE_PLACEMENT_POLICY = Object.freeze({
  policyVersion: INNER_KEEP_FREE_PLACEMENT_POLICY_VERSION,
  units: 'microunits',
  snapIncrementMicrounits: INNER_KEEP_PLACEMENT_SNAP_MICROUNITS,
  rotationsMilliDegrees: INNER_KEEP_FREE_PLACEMENT_ROTATIONS,
  compound: Object.freeze({
    widthMeters: 96,
    depthMeters: 80,
    centerZMeters: -4,
  }),
  supportBoundsMicrounits: Object.freeze({
    minimumX: meters(-44),
    maximumX: meters(44),
    minimumZ: meters(-40),
    maximumZ: meters(32),
  }),
  wallInteriorSetbackMeters: 4,
  permanentExclusions: Object.freeze([
    Object.freeze({
      exclusionId: 'inner-keep-permanent-gate-spine',
      kind: 'road-surface' as const,
      centerMicrounits: Object.freeze([meters(0), meters(14.5)] as const),
      halfExtentsMicrounits: Object.freeze([meters(3), meters(17.5)] as const),
    }),
    Object.freeze({
      exclusionId: 'inner-keep-permanent-civic-commons',
      kind: 'civic-commons' as const,
      centerMicrounits: Object.freeze([meters(0), meters(2)] as const),
      halfExtentsMicrounits: Object.freeze([meters(5), meters(5)] as const),
    }),
    Object.freeze({
      exclusionId: 'inner-keep-permanent-gate-approach',
      kind: 'gate-approach' as const,
      centerMicrounits: Object.freeze([meters(0), meters(30)] as const),
      halfExtentsMicrounits: Object.freeze([meters(4), meters(2)] as const),
    }),
  ] satisfies readonly InnerKeepPermanentPlacementExclusion[]),
  envelopes: INNER_KEEP_FREE_PLACEMENT_ENVELOPES,
  presentationOnly: false,
});

export type InnerKeepPlacementInvalidReason =
  | 'invalid-transform'
  | 'off-grid'
  | 'rotation-unsupported'
  | 'outside-buildable-area'
  | 'permanent-exclusion'
  | 'building-overlap';

export type InnerKeepPlacementEvaluation = Readonly<{
  valid: boolean;
  reason: InnerKeepPlacementInvalidReason | null;
  conflictingId: string | null;
  halfExtentsMicrounits: readonly [bigint, bigint];
}>;

function rotatedHalfExtents(
  envelopePolicy: InnerKeepPlacementEnvelope,
  rotationMilliDegrees: number,
): readonly [bigint, bigint] {
  return rotationMilliDegrees === 90_000 || rotationMilliDegrees === 270_000
    ? Object.freeze([
      envelopePolicy.halfExtentsMicrounits[1],
      envelopePolicy.halfExtentsMicrounits[0],
    ] as const)
    : envelopePolicy.halfExtentsMicrounits;
}

function rectanglesOverlap(
  leftCenter: readonly [bigint, bigint],
  leftHalf: readonly [bigint, bigint],
  rightCenter: readonly [bigint, bigint],
  rightHalf: readonly [bigint, bigint],
) {
  const deltaX = leftCenter[0] >= rightCenter[0]
    ? leftCenter[0] - rightCenter[0]
    : rightCenter[0] - leftCenter[0];
  const deltaZ = leftCenter[1] >= rightCenter[1]
    ? leftCenter[1] - rightCenter[1]
    : rightCenter[1] - leftCenter[1];
  return deltaX < leftHalf[0] + rightHalf[0]
    && deltaZ < leftHalf[1] + rightHalf[1];
}

function invalidEvaluation(
  reason: InnerKeepPlacementInvalidReason,
  halfExtentsMicrounits: readonly [bigint, bigint],
  conflictingId: string | null = null,
): InnerKeepPlacementEvaluation {
  return Object.freeze({
    valid: false,
    reason,
    conflictingId,
    halfExtentsMicrounits,
  });
}

export function evaluateInnerKeepPlacement(
  buildingKind: InnerKeepFreePlacementBuildingKind,
  transform: InnerKeepFreePlacementTransform,
  occupied: readonly InnerKeepOccupiedPlacement[],
): InnerKeepPlacementEvaluation {
  const envelopePolicy = INNER_KEEP_FREE_PLACEMENT_ENVELOPES[buildingKind];
  const fallbackHalfExtents = envelopePolicy.halfExtentsMicrounits;
  if (
    typeof transform.localXMicrounits !== 'bigint'
    || typeof transform.localZMicrounits !== 'bigint'
    || !Number.isSafeInteger(transform.rotationMilliDegrees)
  ) return invalidEvaluation('invalid-transform', fallbackHalfExtents);
  if (!INNER_KEEP_FREE_PLACEMENT_ROTATIONS.includes(
    transform.rotationMilliDegrees as InnerKeepFreePlacementRotation,
  )) return invalidEvaluation('rotation-unsupported', fallbackHalfExtents);
  const halfExtents = rotatedHalfExtents(envelopePolicy, transform.rotationMilliDegrees);
  if (
    transform.localXMicrounits % INNER_KEEP_PLACEMENT_SNAP_MICROUNITS !== 0n
    || transform.localZMicrounits % INNER_KEEP_PLACEMENT_SNAP_MICROUNITS !== 0n
  ) return invalidEvaluation('off-grid', halfExtents);
  const support = INNER_KEEP_FREE_PLACEMENT_POLICY.supportBoundsMicrounits;
  if (
    transform.localXMicrounits - halfExtents[0] < support.minimumX
    || transform.localXMicrounits + halfExtents[0] > support.maximumX
    || transform.localZMicrounits - halfExtents[1] < support.minimumZ
    || transform.localZMicrounits + halfExtents[1] > support.maximumZ
  ) return invalidEvaluation('outside-buildable-area', halfExtents);
  const center = [transform.localXMicrounits, transform.localZMicrounits] as const;
  for (const exclusion of INNER_KEEP_FREE_PLACEMENT_POLICY.permanentExclusions) {
    if (rectanglesOverlap(
      center,
      halfExtents,
      exclusion.centerMicrounits,
      exclusion.halfExtentsMicrounits,
    )) return invalidEvaluation('permanent-exclusion', halfExtents, exclusion.exclusionId);
  }
  for (const existing of occupied) {
    const existingEnvelope = INNER_KEEP_FREE_PLACEMENT_ENVELOPES[existing.buildingKind];
    const existingHalfExtents = rotatedHalfExtents(
      existingEnvelope,
      existing.rotationMilliDegrees,
    );
    if (rectanglesOverlap(
      center,
      halfExtents,
      [existing.localXMicrounits, existing.localZMicrounits],
      existingHalfExtents,
    )) return invalidEvaluation('building-overlap', halfExtents, existing.buildingKey);
  }
  return Object.freeze({
    valid: true,
    reason: null,
    conflictingId: null,
    halfExtentsMicrounits: halfExtents,
  });
}

const DEFAULT_CENTERS_METERS: Readonly<Record<
  InnerKeepFreePlacementBuildingKind,
  readonly [number, number]
>> = Object.freeze({
  'grand-covenant-cathedral': Object.freeze([-24, -22] as const),
  'city-barracks': Object.freeze([24, -29] as const),
  'city-mill': Object.freeze([14, -10] as const),
  'lumber-camp': Object.freeze([29, -10] as const),
  'city-stoneworks': Object.freeze([14, 10] as const),
  'city-goldworks': Object.freeze([29, 10] as const),
});

/** Deterministic first valid preview location; returns null only when the yard is full. */
export function defaultInnerKeepPlacementTransform(
  buildingKind: InnerKeepFreePlacementBuildingKind,
  occupied: readonly InnerKeepOccupiedPlacement[],
): InnerKeepFreePlacementTransform | null {
  const [preferredX, preferredZ] = DEFAULT_CENTERS_METERS[buildingKind];
  const preferred = Object.freeze({
    localXMicrounits: meters(preferredX),
    localZMicrounits: meters(preferredZ),
    rotationMilliDegrees: 0 as const,
  });
  if (evaluateInnerKeepPlacement(buildingKind, preferred, occupied).valid) return preferred;

  const support = INNER_KEEP_FREE_PLACEMENT_POLICY.supportBoundsMicrounits;
  for (
    let z = support.minimumZ;
    z <= support.maximumZ;
    z += INNER_KEEP_PLACEMENT_SNAP_MICROUNITS
  ) {
    for (
      let x = support.minimumX;
      x <= support.maximumX;
      x += INNER_KEEP_PLACEMENT_SNAP_MICROUNITS
    ) {
      const candidate = Object.freeze({
        localXMicrounits: x,
        localZMicrounits: z,
        rotationMilliDegrees: 0 as const,
      });
      if (evaluateInnerKeepPlacement(buildingKind, candidate, occupied).valid) {
        return candidate;
      }
    }
  }
  return null;
}
