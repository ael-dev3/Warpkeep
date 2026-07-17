export type RealmPointerStartLane = 'canvas' | 'label';

export type RealmPointerPosition = Readonly<{
  x: number;
  y: number;
}>;

export type RealmPointerStart = RealmPointerPosition & Readonly<{
  pointerId: number;
  pointerType?: string;
  lane: RealmPointerStartLane;
}>;

export type RealmPointerMove = RealmPointerPosition & Readonly<{
  pointerId: number;
  pointerType?: string;
  /** The PointerEvent `buttons` bitfield, when the integration has one. */
  buttons?: number;
}>;

export type RealmPointerEnd = RealmPointerPosition & Readonly<{
  pointerId: number;
}>;

export type RealmPointerGesturePhase = 'idle' | 'pending' | 'dragging' | 'pinching';

export type RealmPointerCaptureStatus = 'captured' | 'failed' | 'unavailable';

export type RealmPointerTap = RealmPointerPosition & Readonly<{
  pointerId: number;
  lane: RealmPointerStartLane;
}>;

export type RealmPointerPinch = Readonly<{
  /** True only for the baseline emitted when the second pointer joins. */
  reset: boolean;
  centroid: RealmPointerPosition;
  distance: number;
  centroidDelta: RealmPointerPosition;
  /** Multiplicative distance change since the previous pinch sample. */
  scaleRatio: number;
}>;

export type RealmPointerGestureResult = Readonly<{
  accepted: boolean;
  phase: RealmPointerGesturePhase;
  pointerCount: number;
  panDelta: RealmPointerPosition | null;
  pinch: RealmPointerPinch | null;
  tap: RealmPointerTap | null;
  cancelled: boolean;
  captureStatus: RealmPointerCaptureStatus | null;
}>;

export type RealmPointerGestureSnapshot = Readonly<{
  phase: RealmPointerGesturePhase;
  pointerCount: number;
  labelClickSuppressionPending: boolean;
}>;

export type RealmPointerGestureCoordinatorOptions = Readonly<{
  dragThreshold?: number;
  /** Return false when capture was attempted but not acquired. */
  capturePointer?: (pointerId: number) => boolean | void;
  releasePointer?: (pointerId: number) => void;
}>;

export type RealmPointerGestureCoordinator = Readonly<{
  start: (pointer: RealmPointerStart) => RealmPointerGestureResult;
  move: (pointer: RealmPointerMove) => RealmPointerGestureResult;
  end: (pointer: RealmPointerEnd) => RealmPointerGestureResult;
  cancel: (pointerId: number) => RealmPointerGestureResult;
  lostCapture: (pointerId: number) => RealmPointerGestureResult;
  blur: () => RealmPointerGestureResult;
  visibilityChanged: (hidden: boolean) => RealmPointerGestureResult;
  dispose: () => void;
  snapshot: () => RealmPointerGestureSnapshot;
  /**
   * Consumes the synthetic/native click guard armed by a label drag or pinch.
   * A new pointer session clears an unconsumed stale
   * guard, so it can never suppress a later intentional label tap.
   */
  consumeLabelClickSuppression: () => boolean;
}>;

type MutablePointer = {
  pointerId: number;
  pointerType: string;
  lane: RealmPointerStartLane;
  originX: number;
  originY: number;
  x: number;
  y: number;
  lastAppliedX: number;
  lastAppliedY: number;
  dragged: boolean;
  captured: boolean;
};

type PinchBaseline = Readonly<{
  centroid: RealmPointerPosition;
  distance: number;
}>;

const DEFAULT_DRAG_THRESHOLD = 5;

function finitePosition(position: RealmPointerPosition) {
  return Number.isFinite(position.x) && Number.isFinite(position.y);
}

function validPointerId(pointerId: number) {
  return Number.isSafeInteger(pointerId) && pointerId >= 0;
}

function distanceBetween(first: RealmPointerPosition, second: RealmPointerPosition) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function phaseFor(pointers: ReadonlyMap<number, MutablePointer>): RealmPointerGesturePhase {
  if (pointers.size === 0) return 'idle';
  if (pointers.size > 1) return 'pinching';
  return pointers.values().next().value?.dragged ? 'dragging' : 'pending';
}

function pinchFor(pointers: ReadonlyMap<number, MutablePointer>): PinchBaseline | null {
  const iterator = pointers.values();
  const first = iterator.next().value;
  const second = iterator.next().value;
  if (!first || !second) return null;
  return {
    centroid: {
      x: (first.x + second.x) * 0.5,
      y: (first.y + second.y) * 0.5
    },
    distance: distanceBetween(first, second)
  };
}

export function createRealmPointerGestureCoordinator(
  options: RealmPointerGestureCoordinatorOptions = {}
): RealmPointerGestureCoordinator {
  const pointers = new Map<number, MutablePointer>();
  const dragThreshold = Math.max(
    0,
    Number.isFinite(options.dragThreshold)
      ? options.dragThreshold ?? DEFAULT_DRAG_THRESHOLD
      : DEFAULT_DRAG_THRESHOLD
  );
  let pinchBaseline: PinchBaseline | null = null;
  let labelClickSuppressionPending = false;
  let disposed = false;

  const snapshot = (): RealmPointerGestureSnapshot => Object.freeze({
    phase: phaseFor(pointers),
    pointerCount: pointers.size,
    labelClickSuppressionPending
  });

  const result = (
    input: Partial<Omit<RealmPointerGestureResult, 'phase' | 'pointerCount'>> = {}
  ): RealmPointerGestureResult => Object.freeze({
    accepted: input.accepted ?? true,
    phase: phaseFor(pointers),
    pointerCount: pointers.size,
    panDelta: input.panDelta ?? null,
    pinch: input.pinch ?? null,
    tap: input.tap ?? null,
    cancelled: input.cancelled ?? false,
    captureStatus: input.captureStatus ?? null
  });

  const rejected = () => result({ accepted: false });

  const safelyCapture = (pointer: MutablePointer): RealmPointerCaptureStatus => {
    if (pointer.captured) return 'captured';
    if (!options.capturePointer) return 'unavailable';
    try {
      const captured = options.capturePointer(pointer.pointerId) !== false;
      pointer.captured = captured;
      return captured ? 'captured' : 'failed';
    } catch {
      pointer.captured = false;
      return 'failed';
    }
  };

  const markDragged = (pointer: MutablePointer) => {
    pointer.dragged = true;
    if (pointer.lane === 'label') labelClickSuppressionPending = true;
    return safelyCapture(pointer);
  };

  const safelyRelease = (pointer: MutablePointer) => {
    if (!pointer.captured || !options.releasePointer) return;
    pointer.captured = false;
    try {
      options.releasePointer(pointer.pointerId);
    } catch {
      // Browser capture ownership can change asynchronously. Cleanup remains
      // authoritative even when releasePointerCapture rejects the old owner.
    }
  };

  const resetRemainingPointer = () => {
    if (pointers.size !== 1) return;
    const remaining = pointers.values().next().value;
    if (!remaining) return;
    remaining.lastAppliedX = remaining.x;
    remaining.lastAppliedY = remaining.y;
  };

  const removePointer = (pointer: MutablePointer, release: boolean) => {
    pointers.delete(pointer.pointerId);
    if (release) safelyRelease(pointer);
    else pointer.captured = false;
    pinchBaseline = pinchFor(pointers);
    resetRemainingPointer();
  };

  const advancePointer = (pointer: MutablePointer, x: number, y: number) => {
    pointer.x = x;
    pointer.y = y;
    if (pointers.size > 1) {
      const nextPinch = pinchFor(pointers);
      if (!nextPinch) return result();
      const previousPinch = pinchBaseline ?? nextPinch;
      pinchBaseline = nextPinch;
      let captureStatus: RealmPointerCaptureStatus | null = null;
      pointers.forEach((activePointer) => {
        const status = markDragged(activePointer);
        if (status === 'failed' || captureStatus === null) captureStatus = status;
      });
      return result({
        captureStatus,
        pinch: Object.freeze({
          reset: false,
          centroid: Object.freeze({ ...nextPinch.centroid }),
          distance: nextPinch.distance,
          centroidDelta: Object.freeze({
            x: nextPinch.centroid.x - previousPinch.centroid.x,
            y: nextPinch.centroid.y - previousPinch.centroid.y
          }),
          scaleRatio: previousPinch.distance > 0 && nextPinch.distance > 0
            ? nextPinch.distance / previousPinch.distance
            : 1
        })
      });
    }

    if (!pointer.dragged) {
      const travelled = Math.hypot(
        pointer.x - pointer.originX,
        pointer.y - pointer.originY
      );
      if (travelled < dragThreshold) return result();
      const captureStatus = markDragged(pointer);
      const panDelta = {
        x: pointer.x - pointer.lastAppliedX,
        y: pointer.y - pointer.lastAppliedY
      };
      pointer.lastAppliedX = pointer.x;
      pointer.lastAppliedY = pointer.y;
      return result({
        captureStatus,
        panDelta: panDelta.x === 0 && panDelta.y === 0
          ? null
          : Object.freeze(panDelta)
      });
    }

    const panDelta = {
      x: pointer.x - pointer.lastAppliedX,
      y: pointer.y - pointer.lastAppliedY
    };
    pointer.lastAppliedX = pointer.x;
    pointer.lastAppliedY = pointer.y;
    return result({
      captureStatus: pointer.captured ? null : safelyCapture(pointer),
      panDelta: panDelta.x === 0 && panDelta.y === 0
        ? null
        : Object.freeze(panDelta)
    });
  };

  const start = (input: RealmPointerStart) => {
    if (
      disposed
      || !validPointerId(input.pointerId)
      || !finitePosition(input)
      || pointers.has(input.pointerId)
      || pointers.size >= 2
    ) return rejected();

    if (pointers.size === 0) labelClickSuppressionPending = false;
    const pointer: MutablePointer = {
      pointerId: input.pointerId,
      pointerType: input.pointerType ?? 'unknown',
      lane: input.lane,
      originX: input.x,
      originY: input.y,
      x: input.x,
      y: input.y,
      lastAppliedX: input.x,
      lastAppliedY: input.y,
      dragged: false,
      captured: false
    };
    // Record first. Pending presses deliberately do not capture: a label tap
    // must retain its native click target. Window-level fallback listeners
    // own pending cleanup; capture begins only after drag/pinch intent exists.
    pointers.set(pointer.pointerId, pointer);

    if (pointers.size === 2) {
      let captureStatus: RealmPointerCaptureStatus | null = null;
      pointers.forEach((activePointer) => {
        const status = markDragged(activePointer);
        if (status === 'failed' || captureStatus === null) captureStatus = status;
      });
      pinchBaseline = pinchFor(pointers);
      const baseline = pinchBaseline;
      return result({
        captureStatus,
        pinch: baseline ? Object.freeze({
          reset: true,
          centroid: Object.freeze({ ...baseline.centroid }),
          distance: baseline.distance,
          centroidDelta: Object.freeze({ x: 0, y: 0 }),
          scaleRatio: 1
        }) : null
      });
    }

    return result();
  };

  const cancel = (pointerId: number, release = true) => {
    if (disposed || !validPointerId(pointerId)) return rejected();
    const pointer = pointers.get(pointerId);
    if (!pointer) return rejected();
    removePointer(pointer, release);
    return result({ cancelled: true });
  };

  const move = (input: RealmPointerMove) => {
    if (disposed || !validPointerId(input.pointerId) || !finitePosition(input)) {
      return rejected();
    }
    const pointer = pointers.get(input.pointerId);
    if (!pointer) return rejected();
    const pointerType = input.pointerType ?? pointer.pointerType;
    if (pointerType !== 'touch' && input.buttons === 0) {
      return cancel(input.pointerId);
    }
    return advancePointer(pointer, input.x, input.y);
  };

  const end = (input: RealmPointerEnd) => {
    if (disposed || !validPointerId(input.pointerId) || !finitePosition(input)) {
      return rejected();
    }
    const pointer = pointers.get(input.pointerId);
    if (!pointer) return rejected();

    const movement = advancePointer(pointer, input.x, input.y);
    const wasOnlyPointer = pointers.size === 1;
    const tap = wasOnlyPointer && !pointer.dragged
      ? Object.freeze({
          pointerId: pointer.pointerId,
          lane: pointer.lane,
          x: pointer.x,
          y: pointer.y
        })
      : null;
    removePointer(pointer, true);
    return result({
      panDelta: movement.panDelta,
      pinch: movement.pinch,
      tap
    });
  };

  const cancelAll = () => {
    if (disposed || pointers.size === 0) return rejected();
    const activePointers = [...pointers.values()];
    pointers.clear();
    pinchBaseline = null;
    activePointers.forEach(safelyRelease);
    return result({ cancelled: true });
  };

  return Object.freeze({
    start,
    move,
    end,
    cancel: (pointerId) => cancel(pointerId),
    lostCapture: (pointerId) => cancel(pointerId, false),
    blur: cancelAll,
    visibilityChanged: (hidden) => hidden ? cancelAll() : rejected(),
    dispose: () => {
      if (disposed) return;
      const activePointers = [...pointers.values()];
      pointers.clear();
      pinchBaseline = null;
      activePointers.forEach(safelyRelease);
      disposed = true;
    },
    snapshot,
    consumeLabelClickSuppression: () => {
      const pending = labelClickSuppressionPending;
      labelClickSuppressionPending = false;
      return pending;
    }
  });
}
