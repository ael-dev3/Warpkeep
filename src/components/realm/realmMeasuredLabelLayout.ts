export type RealmLabelPriority = 'selected' | 'own' | 'near' | 'far';

/**
 * `compact` still carries a short public identity string. It is deliberately
 * not an avatar-only mode: a castle marker without readable identity is not a
 * useful map affordance in a dense founding district.
 */
export type RealmLabelPresentation = 'full' | 'compact';

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
    /** Compact, text-bearing label measurement. */
    compact?: RealmMeasuredLabelRectangle;
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

type RealmLabelOffset = Readonly<{ x: number; y: number }>;

const MAX_PRIORITY_NUDGE_PIXELS = 40;
const MAX_STANDARD_NUDGE_PIXELS = 32;

/**
 * Dense labels remain tied to the roof they describe. Compact labels first
 * stay directly above the roof, then use a small upward stack. These are
 * layout offsets from the projected roof, not free-floating screen
 * coordinates.
 */
const COMPACT_ATTACHMENT_OFFSETS: readonly RealmLabelOffset[] = Object.freeze([
  { x: 0, y: 0 },
  { x: 0, y: -50 },
  { x: 58, y: 0 },
  { x: -58, y: 0 },
  { x: 58, y: -50 },
  { x: -58, y: -50 },
  { x: 0, y: -96 }
]);

const DIRECT_ATTACHMENT_OFFSET: readonly RealmLabelOffset[] = Object.freeze([
  { x: 0, y: 0 }
]);

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
  maximumNudgePixels: number,
  offsets: readonly RealmLabelOffset[]
) {
  const proposals: PlacementProposal[] = [];
  for (const offset of offsets) {
    const attached = {
      x: anchor.x + offset.x,
      y: anchor.y + offset.y,
      layoutAnchor: anchor
    };
    const proposal = clampProposalToSafeArea(
      attached,
      measurement,
      safeArea,
      maximumNudgePixels
    );
    if (!proposal) continue;
    if (proposals.some((existing) => existing.x === proposal.x && existing.y === proposal.y)) {
      continue;
    }
    proposals.push(proposal);
  }
  return proposals;
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

    if (!safeArea) {
      culled.push({ castleId: candidate.castleId, reason: 'no-safe-placement' });
      continue;
    }
    let accepted: RealmLabelPlacement | undefined;
    let sawSafeWithoutReservedUi = false;
    let sawReservedUi = false;
    let sawAssociatedCastle = false;
    let sawLabelCollision = false;
    let sawMeasurement = false;
    const associatedCastleBounds = candidate.occlusionBounds
      && validRect(candidate.occlusionBounds)
      ? candidate.occlusionBounds
      : undefined;

    const fullPresentation = {
      presentation: 'full' as const,
      measurement: candidate.measurements.full,
      offsets: DIRECT_ATTACHMENT_OFFSET
    };
    const compactPresentation = {
      presentation: 'compact' as const,
      measurement: candidate.measurements.compact,
      offsets: COMPACT_ATTACHMENT_OFFSETS
    };
    const preferCompact = input.viewportBounds.right - input.viewportBounds.left <= 680
      && candidate.priority !== 'selected'
      && candidate.priority !== 'own';
    const presentations: readonly Readonly<{
      presentation: RealmLabelPresentation;
      measurement: RealmMeasuredLabelRectangle | undefined;
      offsets: readonly RealmLabelOffset[];
    }>[] = preferCompact
      ? [compactPresentation, fullPresentation]
      : [fullPresentation, compactPresentation];
    const maximumNudgePixels = candidate.priority === 'selected' || candidate.priority === 'own'
      ? MAX_PRIORITY_NUDGE_PIXELS
      : MAX_STANDARD_NUDGE_PIXELS;

    for (const option of presentations) {
      if (!validMeasurement(option.measurement)) continue;
      sawMeasurement = true;
      const proposals = placementProposals(
        anchor,
        option.measurement,
        safeArea,
        maximumNudgePixels,
        option.offsets
      );
      for (const proposal of proposals) {
        const bounds = boundsAt(proposal, option.measurement);
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
          presentation: option.presentation,
          bounds
        };
        break;
      }
      if (accepted) break;
    }

    if (accepted) {
      placements.push(accepted);
    } else if (!sawMeasurement) {
      culled.push({ castleId: candidate.castleId, reason: 'unmeasured' });
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
