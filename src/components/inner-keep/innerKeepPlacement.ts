import {
  INNER_KEEP_FREE_PLACEMENT_ROTATIONS,
  INNER_KEEP_PLACEMENT_SNAP_MICROUNITS,
  defaultInnerKeepPlacementTransform,
  evaluateInnerKeepPlacement,
  type InnerKeepFreePlacementRotation,
  type InnerKeepOccupiedPlacement,
  type InnerKeepPlacementEvaluation,
  type InnerKeepPlacementInvalidReason,
} from './innerKeepFreePlacementPolicy';
import {
  type InnerKeepBuildingKind,
  type InnerKeepBuildingPresentation,
  type InnerKeepPlacementTransform,
} from './innerKeepPresentation';

export type InnerKeepPlacementDraft = Readonly<{
  buildingKind: InnerKeepBuildingKind;
  transform: InnerKeepPlacementTransform;
  evaluation: InnerKeepPlacementEvaluation;
}>;

const INVALID_REASON_COPY: Readonly<Record<InnerKeepPlacementInvalidReason, string>> =
  Object.freeze({
    'invalid-transform': 'That placement could not be verified.',
    'off-grid': 'Buildings must align to the town planning grid.',
    'rotation-unsupported': 'Choose one of the four supported orientations.',
    'outside-buildable-area': 'Move the whole building inside the town walls.',
    'permanent-exclusion': 'Keep permanent roads and civic spaces clear.',
    'building-overlap': 'Move clear of another building.',
  });

function occupiedPlacements(
  buildings: readonly InnerKeepBuildingPresentation[],
): readonly InnerKeepOccupiedPlacement[] {
  return buildings.map((building) => Object.freeze({
    buildingKey: building.buildingKey,
    buildingKind: building.buildingKind,
    localXMicrounits: building.placement.localXMicrounits,
    localZMicrounits: building.placement.localZMicrounits,
    rotationMilliDegrees: (
      building.placement.rotationMilliDegrees as InnerKeepFreePlacementRotation
    ),
  }));
}

export function innerKeepPlacementReasonCopy(
  evaluation: InnerKeepPlacementEvaluation,
) {
  return evaluation.valid || evaluation.reason === null
    ? 'This location is ready for construction.'
    : INVALID_REASON_COPY[evaluation.reason];
}

export function evaluateInnerKeepPlacementDraft(
  buildingKind: InnerKeepBuildingKind,
  transform: InnerKeepPlacementTransform,
  buildings: readonly InnerKeepBuildingPresentation[],
): InnerKeepPlacementDraft {
  const evaluation = evaluateInnerKeepPlacement(
    buildingKind,
    transform as InnerKeepPlacementTransform & Readonly<{
      rotationMilliDegrees: InnerKeepFreePlacementRotation;
    }>,
    occupiedPlacements(buildings),
  );
  return Object.freeze({
    buildingKind,
    transform: Object.freeze({ ...transform }),
    evaluation,
  });
}

export function initialInnerKeepPlacementDraft(
  buildingKind: InnerKeepBuildingKind,
  buildings: readonly InnerKeepBuildingPresentation[],
): InnerKeepPlacementDraft | null {
  const transform = defaultInnerKeepPlacementTransform(
    buildingKind,
    occupiedPlacements(buildings),
  );
  return transform
    ? evaluateInnerKeepPlacementDraft(buildingKind, transform, buildings)
    : null;
}

export function nudgeInnerKeepPlacementDraft(
  draft: InnerKeepPlacementDraft,
  deltaXSteps: number,
  deltaZSteps: number,
  buildings: readonly InnerKeepBuildingPresentation[],
) {
  if (!Number.isSafeInteger(deltaXSteps) || !Number.isSafeInteger(deltaZSteps)) {
    return draft;
  }
  return evaluateInnerKeepPlacementDraft(
    draft.buildingKind,
    Object.freeze({
      ...draft.transform,
      localXMicrounits: draft.transform.localXMicrounits
        + BigInt(deltaXSteps) * INNER_KEEP_PLACEMENT_SNAP_MICROUNITS,
      localZMicrounits: draft.transform.localZMicrounits
        + BigInt(deltaZSteps) * INNER_KEEP_PLACEMENT_SNAP_MICROUNITS,
    }),
    buildings,
  );
}

export function rotateInnerKeepPlacementDraft(
  draft: InnerKeepPlacementDraft,
  direction: -1 | 1,
  buildings: readonly InnerKeepBuildingPresentation[],
) {
  const currentIndex = INNER_KEEP_FREE_PLACEMENT_ROTATIONS.indexOf(
    draft.transform.rotationMilliDegrees as InnerKeepFreePlacementRotation,
  );
  const normalizedIndex = currentIndex < 0 ? 0 : currentIndex;
  const nextIndex = (
    normalizedIndex + direction + INNER_KEEP_FREE_PLACEMENT_ROTATIONS.length
  ) % INNER_KEEP_FREE_PLACEMENT_ROTATIONS.length;
  return evaluateInnerKeepPlacementDraft(
    draft.buildingKind,
    Object.freeze({
      ...draft.transform,
      rotationMilliDegrees: INNER_KEEP_FREE_PLACEMENT_ROTATIONS[nextIndex]!,
    }),
    buildings,
  );
}

export function innerKeepPlacementMetersCopy(
  placement: InnerKeepPlacementTransform,
) {
  const x = Number(placement.localXMicrounits) / 1_000_000;
  const z = Number(placement.localZMicrounits) / 1_000_000;
  return `X ${x.toFixed(1)} m · Z ${z.toFixed(1)} m · ${
    placement.rotationMilliDegrees / 1_000
  }°`;
}
