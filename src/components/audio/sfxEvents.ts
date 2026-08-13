export type WarpkeepSfxEmphasis = 'quiet' | 'normal' | 'primary';

type ScreenPosition = Readonly<{
  /** Browser client-space x coordinate. Omitted when no reliable projection exists. */
  screenX?: number;
}>;

type CountedWorldEvent = ScreenPosition & Readonly<{
  count: number;
}>;

export type WarpkeepSfxEvent =
  | Readonly<{
      kind: 'ui-press';
      emphasis?: WarpkeepSfxEmphasis;
    }>
  | Readonly<{ kind: 'ui-back' | 'ui-open' | 'ui-close' | 'ui-deny' }>
  | (ScreenPosition & Readonly<{
      kind:
        | 'select-keep'
        | 'select-worker'
        | 'select-gold'
        | 'select-food'
        | 'select-wood'
        | 'select-stone';
    }>)
  | (ScreenPosition & Readonly<{
      kind: 'select-water';
      regime: 'river' | 'ocean';
    }>)
  | (CountedWorldEvent & Readonly<{
      kind:
        | 'worker-dispatch-confirmed'
        | 'worker-recall-confirmed'
        | 'worker-arrived'
        | 'worker-returned';
    }>)
  | Readonly<{ kind: 'access-request-confirmed' }>
  | Readonly<{
      kind:
        | 'inner-keep-menu-opened'
        | 'inner-keep-project-confirmed'
        | 'inner-keep-project-completed';
    }>
  | Readonly<{ kind: 'command-failed' }>
  | (ScreenPosition & Readonly<{ kind: 'river-focus-entered' }>)
  | Readonly<{ kind: 'river-focus-left' }>;

export const WARPKEEP_SFX_EVENT_KINDS = Object.freeze([
  'ui-press',
  'ui-back',
  'ui-open',
  'ui-close',
  'ui-deny',
  'select-keep',
  'select-worker',
  'select-gold',
  'select-food',
  'select-wood',
  'select-stone',
  'select-water',
  'worker-dispatch-confirmed',
  'worker-recall-confirmed',
  'worker-arrived',
  'worker-returned',
  'access-request-confirmed',
  'inner-keep-menu-opened',
  'inner-keep-project-confirmed',
  'inner-keep-project-completed',
  'command-failed',
  'river-focus-entered',
  'river-focus-left'
] as const satisfies readonly WarpkeepSfxEvent['kind'][]);

export const WARPKEEP_SFX_VOICE_CAP = 16;
export const WARPKEEP_SFX_EFFECTS_LEVEL = 0.24;

const countedKinds = new Set<WarpkeepSfxEvent['kind']>([
  'worker-dispatch-confirmed',
  'worker-recall-confirmed',
  'worker-arrived',
  'worker-returned'
]);

function boundedCount(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(8, Math.floor(value)));
}

export function warpkeepSfxEventCount(event: WarpkeepSfxEvent) {
  return countedKinds.has(event.kind) && 'count' in event
    ? boundedCount(event.count)
    : 1;
}

export function warpkeepSfxEventFamily(event: WarpkeepSfxEvent) {
  if (event.kind === 'ui-press') {
    return `${event.kind}:${event.emphasis ?? 'normal'}`;
  }
  if (event.kind === 'select-water') {
    return `${event.kind}:${event.regime}`;
  }
  return event.kind;
}

export function warpkeepSfxPan(screenX: number | undefined, viewportWidth: number) {
  if (
    screenX === undefined
    || !Number.isFinite(screenX)
    || !Number.isFinite(viewportWidth)
    || viewportWidth <= 0
  ) return 0;
  return Math.max(-0.72, Math.min(0.72, (screenX / viewportWidth) * 2 - 1));
}

function mergeScreenX(
  left: WarpkeepSfxEvent,
  right: WarpkeepSfxEvent,
  leftCount: number,
  rightCount: number
) {
  const leftX = 'screenX' in left ? left.screenX : undefined;
  const rightX = 'screenX' in right ? right.screenX : undefined;
  if (leftX === undefined) return rightX;
  if (rightX === undefined) return leftX;
  return (leftX * leftCount + rightX * rightCount) / (leftCount + rightCount);
}

/**
 * Coalesces one synchronous presentation batch. Worker lifecycle projection
 * changes use this path so Recall All and simultaneous arrivals remain one
 * stronger cue rather than several phase-stacked copies.
 */
export function clusterWarpkeepSfxEvents(
  events: readonly WarpkeepSfxEvent[]
): readonly WarpkeepSfxEvent[] {
  const clustered: WarpkeepSfxEvent[] = [];
  const familyIndices = new Map<string, number>();

  for (const event of events) {
    const family = warpkeepSfxEventFamily(event);
    const existingIndex = familyIndices.get(family);
    if (existingIndex === undefined || !countedKinds.has(event.kind)) {
      familyIndices.set(family, clustered.length);
      clustered.push(event);
      continue;
    }

    const existing = clustered[existingIndex];
    if (!countedKinds.has(existing.kind) || !('count' in existing) || !('count' in event)) {
      continue;
    }
    const existingCount = warpkeepSfxEventCount(existing);
    const eventCount = warpkeepSfxEventCount(event);
    const screenX = mergeScreenX(existing, event, existingCount, eventCount);
    clustered[existingIndex] = Object.freeze({
      ...existing,
      count: boundedCount(existingCount + eventCount),
      ...(screenX === undefined ? {} : { screenX })
    }) as WarpkeepSfxEvent;
  }

  return Object.freeze(clustered);
}

type WarpkeepSfxListener = (events: readonly WarpkeepSfxEvent[]) => void;
type WarpkeepSfxStopListener = () => void;

const listeners = new Set<WarpkeepSfxListener>();
const stopListeners = new Set<WarpkeepSfxStopListener>();

export function subscribeWarpkeepSfx(listener: WarpkeepSfxListener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function subscribeWarpkeepSfxStop(listener: WarpkeepSfxStopListener) {
  stopListeners.add(listener);
  return () => stopListeners.delete(listener);
}

export function emitWarpkeepSfx(event: WarpkeepSfxEvent) {
  emitWarpkeepSfxBatch([event]);
}

export function emitWarpkeepSfxBatch(events: readonly WarpkeepSfxEvent[]) {
  if (events.length === 0) return;
  const clustered = clusterWarpkeepSfxEvents(events);
  for (const listener of listeners) listener(clustered);
}

export function stopWarpkeepSfxVoices() {
  for (const listener of stopListeners) listener();
}
