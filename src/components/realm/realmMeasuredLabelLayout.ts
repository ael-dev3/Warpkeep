export type RealmLabelPriority = 'selected' | 'hovered' | 'own' | 'near' | 'far';

/**
 * Rectangle primitives remain shared with composition measurement. The label
 * packing/culling functions below are legacy regression utilities only and
 * must not be reconnected to Alpha 0.3.6 world-label membership.
 */

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

/**
 * A projected castle silhouette that direct identity labels must not cover.
 * The castle ID keeps the shape closed and lets the solver exclude the
 * candidate's own silhouette from the foreign-castle pass; its calibrated
 * `occlusionBounds` remains the authority for its own roof attachment.
 */
export type RealmProtectedCastleSilhouette = Readonly<{
  castleId: number;
  bounds: RealmScreenRect;
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
  | 'foreign-castle'
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
  /** Closed projected silhouettes for every visible/presented castle. */
  protectedCastleSilhouettes: readonly RealmProtectedCastleSilhouette[];
  viewportBounds: RealmScreenRect;
  safeAreaBounds: RealmScreenRect;
  reservedUiRects: readonly RealmScreenRect[];
  maximumLabels: number;
  /**
   * Mandatory identities may use any collision-free point inside the bounded
   * roof-attachment radius. This is reserved for direct player intent
   * (selection, hover, or the player's own keep), never for increasing normal
   * label density.
   */
  mandatoryCastleIds?: readonly number[];
  previousPlacements?: readonly RealmLabelPlacement[];
  hysteresis?: Partial<RealmLabelHysteresis>;
  collisionPaddingPixels?: number;
}>;

export type RealmMeasuredLabelLayout = Readonly<{
  placements: readonly RealmLabelPlacement[];
  culled: readonly RealmCulledLabel[];
}>;

/**
 * Optional deterministic work accounting for solver performance regressions.
 * Runtime callers should omit this; tests can supply a fresh mutable counter
 * without relying on machine-specific wall-clock timing.
 */
export type RealmMeasuredLabelLayoutWorkCounter = {
  proposalEvaluations: number;
  rectangleIntersectionEvaluations: number;
};

type PlacementProposal = Readonly<{
  x: number;
  y: number;
  layoutAnchor: RealmScreenPoint;
}>;

type RealmLabelOffset = Readonly<{ x: number; y: number }>;

/**
 * A readable castle identity is fixed to its projected foundation base.
 * Collisions belong in the deterministic cluster/Explore fallback instead of
 * turning a direct username into a floating map label.
 */
export const REALM_CASTLE_LABEL_MAX_ANCHOR_DISPLACEMENT_PIXELS = 0;

const MAX_PRIORITY_NUDGE_PIXELS = 0;
const MAX_STANDARD_NUDGE_PIXELS = 0;

/**
 * Full and compact labels share the exact foundation anchor. A compact
 * presentation may reduce visible chrome, but it cannot relocate identity.
 */
const COMPACT_ATTACHMENT_OFFSETS: readonly RealmLabelOffset[] = Object.freeze([
  { x: 0, y: 0 }
]);

const DIRECT_ATTACHMENT_OFFSET: readonly RealmLabelOffset[] = Object.freeze([
  { x: 0, y: 0 }
]);

const PRIORITY_RANK: Readonly<Record<RealmLabelPriority, number>> = {
  selected: 0,
  hovered: 1,
  own: 2,
  near: 3,
  far: 4
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

const RECTANGLE_INDEX_CELL_SIZE_PIXELS = 32;
const MAX_RECTANGLE_INDEX_CELLS_PER_ENTRY = 64;
const MAX_RECTANGLE_INDEX_CELLS_PER_QUERY = 256;

type IndexedScreenRect<T> = Readonly<{
  id: number;
  bounds: RealmScreenRect;
  value: T;
}>;

/**
 * Exact broad-phase index: grid membership only narrows candidates and every
 * reported hit still passes the original strict rectangle intersection test.
 * Extremely large or imprecise coordinates fall back to a bounded linear
 * scan, avoiding untrusted geometry turning cell enumeration into a hang.
 */
class ScreenRectIndex<T> {
  readonly #entries: IndexedScreenRect<T>[] = [];
  readonly #wideEntries: IndexedScreenRect<T>[] = [];
  readonly #cellRows = new Map<number, Map<number, IndexedScreenRect<T>[]>>();
  readonly #visitedAtGeneration: number[] = [];
  #queryGeneration = 0;

  constructor(private readonly workCounter?: RealmMeasuredLabelLayoutWorkCounter) {}

  insert(bounds: RealmScreenRect, value: T) {
    const entry = { id: this.#entries.length, bounds, value };
    this.#entries.push(entry);
    const span = this.#cellSpan(bounds);
    if (!span || span.cellCount > MAX_RECTANGLE_INDEX_CELLS_PER_ENTRY) {
      this.#wideEntries.push(entry);
      return;
    }
    for (let cellY = span.minimumY; cellY <= span.maximumY; cellY += 1) {
      let row = this.#cellRows.get(cellY);
      if (!row) {
        row = new Map();
        this.#cellRows.set(cellY, row);
      }
      for (let cellX = span.minimumX; cellX <= span.maximumX; cellX += 1) {
        const entries = row.get(cellX);
        if (entries) entries.push(entry);
        else row.set(cellX, [entry]);
      }
    }
  }

  someIntersecting(
    bounds: RealmScreenRect,
    predicate?: (value: T) => boolean
  ) {
    if (this.#entries.length === 0) return false;
    const span = this.#cellSpan(bounds);
    if (!span || span.cellCount > MAX_RECTANGLE_INDEX_CELLS_PER_QUERY) {
      return this.#someEntryIntersects(this.#entries, bounds, predicate);
    }

    this.#queryGeneration += 1;
    if (this.#queryGeneration >= Number.MAX_SAFE_INTEGER) {
      this.#visitedAtGeneration.length = 0;
      this.#queryGeneration = 1;
    }
    if (this.#someEntryIntersects(
      this.#wideEntries,
      bounds,
      predicate,
      this.#queryGeneration
    )) {
      return true;
    }
    for (let cellY = span.minimumY; cellY <= span.maximumY; cellY += 1) {
      const row = this.#cellRows.get(cellY);
      if (!row) continue;
      for (let cellX = span.minimumX; cellX <= span.maximumX; cellX += 1) {
        const entries = row.get(cellX);
        if (entries && this.#someEntryIntersects(
          entries,
          bounds,
          predicate,
          this.#queryGeneration
        )) {
          return true;
        }
      }
    }
    return false;
  }

  #someEntryIntersects(
    entries: readonly IndexedScreenRect<T>[],
    bounds: RealmScreenRect,
    predicate: ((value: T) => boolean) | undefined,
    queryGeneration?: number
  ) {
    for (const entry of entries) {
      if (queryGeneration !== undefined) {
        if (this.#visitedAtGeneration[entry.id] === queryGeneration) continue;
        this.#visitedAtGeneration[entry.id] = queryGeneration;
      }
      if (predicate && !predicate(entry.value)) continue;
      if (this.workCounter) this.workCounter.rectangleIntersectionEvaluations += 1;
      if (intersects(bounds, entry.bounds)) return true;
    }
    return false;
  }

  #cellSpan(bounds: RealmScreenRect) {
    const minimumX = Math.floor(bounds.left / RECTANGLE_INDEX_CELL_SIZE_PIXELS);
    // Rectangles are strict/half-open in `intersects`; keep a right or bottom
    // edge on a cell boundary out of the following cell as well.
    const maximumX = Math.ceil(bounds.right / RECTANGLE_INDEX_CELL_SIZE_PIXELS) - 1;
    const minimumY = Math.floor(bounds.top / RECTANGLE_INDEX_CELL_SIZE_PIXELS);
    const maximumY = Math.ceil(bounds.bottom / RECTANGLE_INDEX_CELL_SIZE_PIXELS) - 1;
    if (
      !Number.isSafeInteger(minimumX)
      || !Number.isSafeInteger(maximumX)
      || !Number.isSafeInteger(minimumY)
      || !Number.isSafeInteger(maximumY)
    ) return null;
    const width = maximumX - minimumX + 1;
    const height = maximumY - minimumY + 1;
    const cellCount = width * height;
    if (!Number.isSafeInteger(cellCount) || cellCount < 1) return null;
    return { minimumX, maximumX, minimumY, maximumY, cellCount };
  }
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

function withinMaximumAnchorDisplacement(
  point: Readonly<{ x: number; y: number }>,
  anchor: RealmScreenPoint
) {
  return Math.hypot(point.x - anchor.x, point.y - anchor.y)
    <= REALM_CASTLE_LABEL_MAX_ANCHOR_DISPLACEMENT_PIXELS;
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
    if (!proposal || !withinMaximumAnchorDisplacement(proposal, anchor)) continue;
    if (proposals.some((existing) => existing.x === proposal.x && existing.y === proposal.y)) {
      continue;
    }
    proposals.push(proposal);
  }
  return proposals;
}

/**
 * A wider, but still roof-bounded, search used for direct intent and the
 * monotonic dense-layout rescue pass. Retain the original roof as
 * `layoutAnchor` so a connector explains every meaningful displacement. If no
 * collision-free point exists within the fixed attachment radius,
 * clustering/Explore remains the honest fallback.
 */
function boundedRoofAttachmentProposals(
  anchor: RealmScreenPoint,
  measurement: RealmMeasuredLabelRectangle,
  safeArea: RealmScreenRect,
  density: 'normal' | 'dense' = 'normal'
) {
  const minimumX = safeArea.left - measurement.offsetX;
  const maximumX = safeArea.right - measurement.offsetX - measurement.width;
  const minimumY = safeArea.top - measurement.offsetY;
  const maximumY = safeArea.bottom - measurement.offsetY - measurement.height;
  if (maximumX < minimumX || maximumY < minimumY) return [];

  const stepX = density === 'dense'
    ? 12
    : Math.max(16, Math.min(48, measurement.width * 0.45));
  const stepY = density === 'dense'
    ? 10
    : Math.max(14, Math.min(36, measurement.height * 0.8));
  const points: PlacementProposal[] = [];
  const pointKeys = new Set<string>();
  const pushUniquePoint = (point: PlacementProposal) => {
    const key = `${point.x}:${point.y}`;
    if (pointKeys.has(key)) return;
    pointKeys.add(key);
    points.push(point);
  };
  const searchMinimumX = Math.max(
    minimumX,
    anchor.x - REALM_CASTLE_LABEL_MAX_ANCHOR_DISPLACEMENT_PIXELS
  );
  const searchMaximumX = Math.min(
    maximumX,
    anchor.x + REALM_CASTLE_LABEL_MAX_ANCHOR_DISPLACEMENT_PIXELS
  );
  const searchMinimumY = Math.max(
    minimumY,
    anchor.y - REALM_CASTLE_LABEL_MAX_ANCHOR_DISPLACEMENT_PIXELS
  );
  const searchMaximumY = Math.min(
    maximumY,
    anchor.y + REALM_CASTLE_LABEL_MAX_ANCHOR_DISPLACEMENT_PIXELS
  );
  for (let y = searchMinimumY; y <= searchMaximumY + 0.001; y += stepY) {
    for (let x = searchMinimumX; x <= searchMaximumX + 0.001; x += stepX) {
      const point = {
        x: Math.min(maximumX, x),
        y: Math.min(maximumY, y),
        layoutAnchor: anchor
      };
      if (withinMaximumAnchorDisplacement(point, anchor)) pushUniquePoint(point);
    }
  }
  const clampedAnchor = {
    x: clamp(anchor.x, minimumX, maximumX),
    y: clamp(anchor.y, minimumY, maximumY),
    layoutAnchor: anchor
  };
  if (withinMaximumAnchorDisplacement(clampedAnchor, anchor)) pushUniquePoint(clampedAnchor);
  return points.sort((left, right) => (
    ((left.x - anchor.x) ** 2 + (left.y - anchor.y) ** 2)
      - ((right.x - anchor.x) ** 2 + (right.y - anchor.y) ** 2)
    || left.y - right.y
    || left.x - right.x
  ));
}

/**
 * Resolves measured castle labels without React, DOM reads, or projection work.
 * Feeding `placements` back as `previousPlacements` preserves membership
 * hysteresis while positions continue following every projected camera frame.
 */
export function resolveMeasuredRealmLabelLayout(
  input: RealmMeasuredLabelLayoutInput,
  workCounter?: RealmMeasuredLabelLayoutWorkCounter
): RealmMeasuredLabelLayout {
  const culled: RealmCulledLabel[] = [];
  const placements: RealmLabelPlacement[] = [];
  const maximumLabels = Number.isFinite(input.maximumLabels)
    ? Math.max(0, Math.floor(input.maximumLabels))
    : 0;
  const collisionPadding = finiteNonNegative(input.collisionPaddingPixels, 2);
  const membershipDistance = finiteNonNegative(input.hysteresis?.membershipDistance, 0);
  const previousPlacements = input.previousPlacements ?? [];
  const mandatoryCastleIds = new Set(
    (input.mandatoryCastleIds ?? []).filter((castleId) => Number.isSafeInteger(castleId))
  );
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
  const protectedCastleSilhouettes = input.protectedCastleSilhouettes.filter((silhouette) => (
    Number.isSafeInteger(silhouette.castleId)
    && silhouette.castleId > 0
    && validRect(silhouette.bounds)
  ));
  const reservedUiIndex = new ScreenRectIndex<true>(workCounter);
  reservedUiRects.forEach((bounds) => reservedUiIndex.insert(bounds, true));
  const castleSilhouetteIndex = new ScreenRectIndex<ReadonlySet<number>>(workCounter);
  const castleSilhouetteGroups = new Map<string, {
    bounds: RealmScreenRect;
    castleIds: Set<number>;
  }>();
  protectedCastleSilhouettes.forEach(({ castleId, bounds }) => {
    const key = `${bounds.left}:${bounds.top}:${bounds.right}:${bounds.bottom}`;
    const group = castleSilhouetteGroups.get(key);
    if (group) group.castleIds.add(castleId);
    else castleSilhouetteGroups.set(key, { bounds, castleIds: new Set([castleId]) });
  });
  castleSilhouetteGroups.forEach(({ bounds, castleIds }) => {
    castleSilhouetteIndex.insert(bounds, castleIds);
  });
  const placementIndex = new ScreenRectIndex<number>(workCounter);

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
    let sawForeignCastle = false;
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
    const preferCompact = candidate.priority === 'far'
      || (input.viewportBounds.right - input.viewportBounds.left <= 680
        && candidate.priority !== 'selected'
        && candidate.priority !== 'own');
    const presentations: readonly Readonly<{
      presentation: RealmLabelPresentation;
      measurement: RealmMeasuredLabelRectangle | undefined;
      offsets: readonly RealmLabelOffset[];
    }>[] = preferCompact
      ? [compactPresentation, fullPresentation]
      : [fullPresentation, compactPresentation];
    const mandatory = mandatoryCastleIds.has(candidate.castleId);
    const maximumNudgePixels = candidate.priority === 'selected'
      || candidate.priority === 'hovered'
      || candidate.priority === 'own'
      ? MAX_PRIORITY_NUDGE_PIXELS
      : MAX_STANDARD_NUDGE_PIXELS;

    for (const option of presentations) {
      if (!validMeasurement(option.measurement)) continue;
      sawMeasurement = true;
      const attachedProposals = placementProposals(
        anchor,
        option.measurement,
        safeArea,
        maximumNudgePixels,
        option.offsets
      );
      const proposalGroups: Array<() => readonly PlacementProposal[]> = [
        () => attachedProposals
      ];
      if (mandatory) {
        // Generate the wider grid lazily: the normal roof attachment succeeds
        // in the common case, so camera motion does not pay for a viewport-wide
        // search on every frame merely because the own castle is mandatory.
        proposalGroups.push(() => boundedRoofAttachmentProposals(
          anchor,
          option.measurement!,
          safeArea,
          'dense'
        ).filter((proposal) => (
          !attachedProposals.some((attached) => (
            attached.x === proposal.x && attached.y === proposal.y
          ))
        )));
      }
      for (const proposals of proposalGroups) {
        for (const proposal of proposals()) {
          if (workCounter) workCounter.proposalEvaluations += 1;
          // Keep this final guard at the acceptance boundary so future proposal
          // sources cannot accidentally bypass the public attachment contract.
          if (!withinMaximumAnchorDisplacement(proposal, anchor)) continue;
          const bounds = boundsAt(proposal, option.measurement);
          const paddedBounds = expandRect(bounds, collisionPadding);
          if (reservedUiIndex.someIntersecting(paddedBounds)) {
            sawReservedUi = true;
            continue;
          }
          if (associatedCastleBounds) {
            if (workCounter) workCounter.rectangleIntersectionEvaluations += 1;
            if (intersects(bounds, associatedCastleBounds)) {
              sawAssociatedCastle = true;
              continue;
            }
          }
          if (castleSilhouetteIndex.someIntersecting(
            bounds,
            (castleIds) => castleIds.size > 1 || !castleIds.has(candidate.castleId)
          )) {
            sawForeignCastle = true;
            continue;
          }
          sawSafeWithoutReservedUi = true;
          if (placementIndex.someIntersecting(paddedBounds)) {
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
      if (accepted) break;
    }

    if (accepted) {
      placements.push(accepted);
      placementIndex.insert(accepted.bounds, accepted.castleId);
    } else if (!sawMeasurement) {
      culled.push({ castleId: candidate.castleId, reason: 'unmeasured' });
    } else if (sawLabelCollision && sawSafeWithoutReservedUi) {
      culled.push({ castleId: candidate.castleId, reason: 'collision' });
    } else if (sawAssociatedCastle) {
      culled.push({ castleId: candidate.castleId, reason: 'associated-castle' });
    } else if (sawForeignCastle) {
      culled.push({ castleId: candidate.castleId, reason: 'foreign-castle' });
    } else if (sawReservedUi) {
      culled.push({ castleId: candidate.castleId, reason: 'reserved-ui' });
    } else {
      culled.push({ castleId: candidate.castleId, reason: 'no-safe-placement' });
    }
  }

  /**
   * Preserve the complete first-pass result, then use otherwise-empty safe
   * roof berths for identities that were rejected only by local geometry. A
   * denser proposal list in the first pass could move an already-accepted
   * identity and reduce total capacity; appending rescued placements makes
   * this pass monotonic by construction.
   */
  if (safeArea && placements.length < maximumLabels) {
    const retryableReasons = new Set<RealmLabelCullReason>([
      'reserved-ui',
      'associated-castle',
      'foreign-castle',
      'collision',
      'no-safe-placement'
    ]);
    const retriedCastleIds = new Set<number>();
    for (const candidate of candidates) {
      if (placements.length >= maximumLabels) break;
      if (
        retriedCastleIds.has(candidate.castleId)
        || mandatoryCastleIds.has(candidate.castleId)
      ) continue;
      retriedCastleIds.add(candidate.castleId);
      const cullIndex = culled.findIndex((entry) => (
        entry.castleId === candidate.castleId
        && retryableReasons.has(entry.reason)
      ));
      if (cullIndex < 0) continue;

      const anchor = { x: candidate.x, y: candidate.y };
      const associatedCastleBounds = candidate.occlusionBounds
        && validRect(candidate.occlusionBounds)
        ? candidate.occlusionBounds
        : undefined;
      const measurements = [
        candidate.measurements.compact,
        candidate.measurements.full
      ].filter(validMeasurement);
      let rescued: RealmLabelPlacement | undefined;
      for (const measurement of measurements) {
        for (const proposal of boundedRoofAttachmentProposals(
          anchor,
          measurement,
          safeArea,
          'dense'
        )) {
          if (workCounter) workCounter.proposalEvaluations += 1;
          if (!withinMaximumAnchorDisplacement(proposal, anchor)) continue;
          const bounds = boundsAt(proposal, measurement);
          const paddedBounds = expandRect(bounds, collisionPadding);
          if (reservedUiIndex.someIntersecting(paddedBounds)) continue;
          if (associatedCastleBounds) {
            if (workCounter) workCounter.rectangleIntersectionEvaluations += 1;
            if (intersects(bounds, associatedCastleBounds)) continue;
          }
          if (castleSilhouetteIndex.someIntersecting(
            bounds,
            (castleIds) => castleIds.size > 1 || !castleIds.has(candidate.castleId)
          )) {
            continue;
          }
          if (placementIndex.someIntersecting(paddedBounds)) continue;
          rescued = {
            castleId: candidate.castleId,
            x: proposal.x,
            y: proposal.y,
            projectedAnchor: anchor,
            layoutAnchor: proposal.layoutAnchor,
            priority: candidate.priority,
            presentation: measurement === candidate.measurements.compact ? 'compact' : 'full',
            bounds
          };
          break;
        }
        if (rescued) break;
      }
      if (!rescued) continue;
      placements.push(rescued);
      placementIndex.insert(rescued.bounds, rescued.castleId);
      culled.splice(cullIndex, 1);
    }
  }

  return { placements, culled };
}
