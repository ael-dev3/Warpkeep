export type RealmLabelPriority = 'selected' | 'own' | 'near' | 'far';

export type RealmLabelPresentation = 'full' | 'avatar';

export type RealmScreenPoint = Readonly<{
  x: number;
  y: number;
}>;

export type RealmScreenRect = Readonly<{
  left: number;
  top: number;
  right: number;
  bottom: number;
}>;

/**
 * The measured DOM rectangle relative to the label's CSS placement point.
 * For a bottom-centred 120 x 40 label this is
 * `{ offsetX: -60, offsetY: -40, width: 120, height: 40 }`.
 */
export type RealmMeasuredLabelRectangle = Readonly<{
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}>;

export type RealmProjectedLabelAnchor = Readonly<{
  castleId: number;
  x: number;
  y: number;
  inFrontOfCamera: boolean;
  priority: RealmLabelPriority;
  distance: number;
  /** Projected bounds of this label's own castle silhouette. */
  occlusionBounds?: RealmScreenRect;
  measurements: Readonly<{
    full?: RealmMeasuredLabelRectangle;
    avatar?: RealmMeasuredLabelRectangle;
  }>;
}>;

export type RealmLabelHysteresis = Readonly<{
  /** Bias retained members by this much in the candidate distance ordering. */
  membershipDistance: number;
  /**
   * Retained for call-site compatibility. Camera-driven positions always
   * follow their current projected anchor; only membership is hysteretic.
   */
  anchorJitterPixels: number;
}>;

export type RealmLabelPlacement = Readonly<{
  castleId: number;
  x: number;
  y: number;
  projectedAnchor: RealmScreenPoint;
  layoutAnchor: RealmScreenPoint;
  priority: RealmLabelPriority;
  presentation: RealmLabelPresentation;
  bounds: RealmScreenRect;
}>;

export type RealmLabelCullReason =
  | 'behind-camera'
  | 'offscreen'
  | 'invalid-projection'
  | 'unmeasured'
  | 'reserved-ui'
  | 'associated-castle'
  | 'collision'
  | 'no-safe-placement'
  | 'capacity'
  | 'duplicate';

export type RealmCulledLabel = Readonly<{
  castleId: number;
  reason: RealmLabelCullReason;
}>;

export type RealmMeasuredLabelLayoutInput = Readonly<{
  anchors: readonly RealmProjectedLabelAnchor[];
  viewportBounds: RealmScreenRect;
  safeAreaBounds: RealmScreenRect;
  reservedUiRects: readonly RealmScreenRect[];
  maximumLabels: number;
  previousPlacements?: readonly RealmLabelPlacement[];
  hysteresis?: Partial<RealmLabelHysteresis>;
  collisionPaddingPixels?: number;
  placementGapPixels?: number;
}>;

export type RealmMeasuredLabelLayout = Readonly<{
  placements: readonly RealmLabelPlacement[];
  culled: readonly RealmCulledLabel[];
}>;

type PlacementProposal = Readonly<{
  x: number;
  y: number;
  layoutAnchor: RealmScreenPoint;
}>;

const MAX_PRIORITY_NUDGE_PIXELS = 12;

const PRIORITY_RANK: Readonly<Record<RealmLabelPriority, number>> = {
  selected: 0,
  own: 1,
  near: 2,
  far: 3
};

function finiteNonNegative(value: number | undefined, fallback: number) {
  return Number.isFinite(value) ? Math.max(0, value!) : fallback;
}

function validRect(rect: RealmScreenRect) {
  return Number.isFinite(rect.left)
    && Number.isFinite(rect.top)
    && Number.isFinite(rect.right)
    && Number.isFinite(rect.bottom)
    && rect.right > rect.left
    && rect.bottom > rect.top;
}

function validMeasurement(
  rect: RealmMeasuredLabelRectangle | undefined
): rect is RealmMeasuredLabelRectangle {
  return rect !== undefined
    && Number.isFinite(rect.offsetX)
    && Number.isFinite(rect.offsetY)
    && Number.isFinite(rect.width)
    && Number.isFinite(rect.height)
    && rect.width > 0
    && rect.height > 0;
}

function intersectRects(first: RealmScreenRect, second: RealmScreenRect): RealmScreenRect | null {
  const intersection = {
    left: Math.max(first.left, second.left),
    top: Math.max(first.top, second.top),
    right: Math.min(first.right, second.right),
    bottom: Math.min(first.bottom, second.bottom)
  };
  return validRect(intersection) ? intersection : null;
}

function intersects(first: RealmScreenRect, second: RealmScreenRect) {
  return first.left < second.right
    && first.right > second.left
    && first.top < second.bottom
    && first.bottom > second.top;
}

function expandRect(rect: RealmScreenRect, pixels: number): RealmScreenRect {
  return {
    left: rect.left - pixels,
    top: rect.top - pixels,
    right: rect.right + pixels,
    bottom: rect.bottom + pixels
  };
}

function containsPoint(rect: RealmScreenRect, point: RealmScreenPoint) {
  return point.x >= rect.left
    && point.x <= rect.right
    && point.y >= rect.top
    && point.y <= rect.bottom;
}

function boundsAt(
  point: RealmScreenPoint,
  measurement: RealmMeasuredLabelRectangle
): RealmScreenRect {
  return {
    left: point.x + measurement.offsetX,
    top: point.y + measurement.offsetY,
    right: point.x + measurement.offsetX + measurement.width,
    bottom: point.y + measurement.offsetY + measurement.height
  };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function clampProposalToSafeArea(
  proposal: PlacementProposal,
  measurement: RealmMeasuredLabelRectangle,
  safeArea: RealmScreenRect,
  maximumNudgePixels: number
): PlacementProposal | null {
  const minimumX = safeArea.left - measurement.offsetX;
  const maximumX = safeArea.right - measurement.offsetX - measurement.width;
  const minimumY = safeArea.top - measurement.offsetY;
  const maximumY = safeArea.bottom - measurement.offsetY - measurement.height;
  if (maximumX < minimumX || maximumY < minimumY) return null;

  const x = clamp(proposal.x, minimumX, maximumX);
  const y = clamp(proposal.y, minimumY, maximumY);
  if (Math.hypot(x - proposal.x, y - proposal.y) > maximumNudgePixels) {
    return null;
  }
  return {
    x,
    y,
    layoutAnchor: proposal.layoutAnchor
  };
}

function placementProposals(
  anchor: RealmScreenPoint,
  measurement: RealmMeasuredLabelRectangle,
  safeArea: RealmScreenRect,
  maximumNudgePixels: number
) {
  const attached = { x: anchor.x, y: anchor.y, layoutAnchor: anchor };
  const proposal = clampProposalToSafeArea(
    attached,
    measurement,
    safeArea,
    maximumNudgePixels
  );
  return proposal ? [proposal] : [];
}

function presentationFor(_priority: RealmLabelPriority): RealmLabelPresentation {
  // Capacity and collision culling already bound density. Every marker that
  // survives those checks must retain the player's visible identity label.
  return 'full';
}

/**
 * Resolves measured castle labels without React, DOM reads, or projection work.
 * Feeding `placements` back as `previousPlacements` preserves membership
 * hysteresis while positions continue following every projected camera frame.
 */
export function resolveMeasuredRealmLabelLayout(
  input: RealmMeasuredLabelLayoutInput
): RealmMeasuredLabelLayout {
  const culled: RealmCulledLabel[] = [];
  const placements: RealmLabelPlacement[] = [];
  const maximumLabels = Number.isFinite(input.maximumLabels)
    ? Math.max(0, Math.floor(input.maximumLabels))
    : 0;
  const collisionPadding = finiteNonNegative(input.collisionPaddingPixels, 2);
  const membershipDistance = finiteNonNegative(input.hysteresis?.membershipDistance, 0);
  const previousPlacements = input.previousPlacements ?? [];
  const previousById = new Map(previousPlacements.map((placement) => [
    placement.castleId,
    placement
  ]));
  const previousOrder = new Map(previousPlacements.map((placement, index) => [
    placement.castleId,
    index
  ]));
  const safeArea = validRect(input.viewportBounds) && validRect(input.safeAreaBounds)
    ? intersectRects(input.viewportBounds, input.safeAreaBounds)
    : null;
  const reservedUiRects = input.reservedUiRects.filter(validRect);

  const candidates = [...input.anchors].sort((left, right) => {
    const priorityDifference = PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority];
    if (priorityDifference !== 0) return priorityDifference;
    const leftPrevious = previousById.has(left.castleId);
    const rightPrevious = previousById.has(right.castleId);
    const leftDistance = Number.isFinite(left.distance) ? left.distance : Number.MAX_SAFE_INTEGER;
    const rightDistance = Number.isFinite(right.distance) ? right.distance : Number.MAX_SAFE_INTEGER;
    const distanceDifference = (leftDistance - (leftPrevious ? membershipDistance : 0))
      - (rightDistance - (rightPrevious ? membershipDistance : 0));
    if (distanceDifference !== 0) return distanceDifference;
    if (leftPrevious !== rightPrevious) return leftPrevious ? -1 : 1;
    const previousDifference = (previousOrder.get(left.castleId) ?? Number.MAX_SAFE_INTEGER)
      - (previousOrder.get(right.castleId) ?? Number.MAX_SAFE_INTEGER);
    return previousDifference || left.castleId - right.castleId;
  });

  const processedIds = new Set<number>();
  for (const candidate of candidates) {
    if (processedIds.has(candidate.castleId)) {
      culled.push({ castleId: candidate.castleId, reason: 'duplicate' });
      continue;
    }
    processedIds.add(candidate.castleId);

    if (!candidate.inFrontOfCamera) {
      culled.push({ castleId: candidate.castleId, reason: 'behind-camera' });
      continue;
    }
    const anchor = { x: candidate.x, y: candidate.y };
    if (!Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) {
      culled.push({ castleId: candidate.castleId, reason: 'invalid-projection' });
      continue;
    }
    if (!validRect(input.viewportBounds) || !containsPoint(input.viewportBounds, anchor)) {
      culled.push({ castleId: candidate.castleId, reason: 'offscreen' });
      continue;
    }
    if (placements.length >= maximumLabels) {
      culled.push({ castleId: candidate.castleId, reason: 'capacity' });
      continue;
    }

    const presentation = presentationFor(candidate.priority);
    const measurement = presentation === 'avatar'
      ? candidate.measurements.avatar
      : candidate.measurements.full;
    if (!validMeasurement(measurement)) {
      culled.push({ castleId: candidate.castleId, reason: 'unmeasured' });
      continue;
    }
    if (!safeArea) {
      culled.push({ castleId: candidate.castleId, reason: 'no-safe-placement' });
      continue;
    }

    const proposals = placementProposals(
      anchor,
      measurement,
      safeArea,
      candidate.priority === 'selected' || candidate.priority === 'own'
        ? MAX_PRIORITY_NUDGE_PIXELS
        : 0
    );
    let accepted: RealmLabelPlacement | undefined;
    let sawSafeWithoutReservedUi = false;
    let sawReservedUi = false;
    let sawAssociatedCastle = false;
    let sawLabelCollision = false;
    const associatedCastleBounds = candidate.occlusionBounds
      && validRect(candidate.occlusionBounds)
      ? candidate.occlusionBounds
      : undefined;
    for (const proposal of proposals) {
      const bounds = boundsAt(proposal, measurement);
      const paddedBounds = expandRect(bounds, collisionPadding);
      if (reservedUiRects.some((reserved) => intersects(paddedBounds, reserved))) {
        sawReservedUi = true;
        continue;
      }
      if (associatedCastleBounds && intersects(bounds, associatedCastleBounds)) {
        sawAssociatedCastle = true;
        continue;
      }
      sawSafeWithoutReservedUi = true;
      if (placements.some((placement) => intersects(paddedBounds, placement.bounds))) {
        sawLabelCollision = true;
        continue;
      }
      accepted = {
        castleId: candidate.castleId,
        x: proposal.x,
        y: proposal.y,
        projectedAnchor: anchor,
        layoutAnchor: proposal.layoutAnchor,
        priority: candidate.priority,
        presentation,
        bounds
      };
      break;
    }

    if (accepted) {
      placements.push(accepted);
    } else if (sawLabelCollision && sawSafeWithoutReservedUi) {
      culled.push({ castleId: candidate.castleId, reason: 'collision' });
    } else if (sawAssociatedCastle) {
      culled.push({ castleId: candidate.castleId, reason: 'associated-castle' });
    } else if (sawReservedUi) {
      culled.push({ castleId: candidate.castleId, reason: 'reserved-ui' });
    } else {
      culled.push({ castleId: candidate.castleId, reason: 'no-safe-placement' });
    }
  }

  return { placements, culled };
}
