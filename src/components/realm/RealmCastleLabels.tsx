import {
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent
} from 'react';

import { StaticProfileImageCanvas } from '../profile/StaticProfileImageCanvas';
import type { RealmCastleProjection } from './realmMapProjectionStability';
import {
  castleProfileLabel,
  castleProfileMonogram,
  type RealmCastlePublicPresentation,
  type VisibleCastleLabel
} from './realmCastlePresentation';
import { reviewedRealmProfileImageUrl } from './loadRealmProfileImage';

export type CastleLabelRecord = Readonly<{
  castle: RealmCastleProjection;
  profile: RealmCastlePublicPresentation;
}>;

type CastleLabelPoint = Readonly<{
  castleId: number;
  button: HTMLButtonElement;
  x: number;
  y: number;
}>;

type PendingCastleLabelFocus = Readonly<{
  castleId: number;
  x: number;
  y: number;
}>;

const PROFILE_SNAPSHOT_PIXELS = Object.freeze({
  compact: 96,
  normal: 128,
  large: 192
} satisfies Record<'compact' | 'normal' | 'large', number>);

function labelCoordinate(button: HTMLButtonElement, property: string) {
  const value = Number.parseFloat(button.style.getPropertyValue(property));
  return Number.isFinite(value) ? value : undefined;
}

function castleLabelPoint(button: HTMLButtonElement): CastleLabelPoint | undefined {
  const castleId = Number(button.dataset.castleId);
  const x = labelCoordinate(button, '--realm-castle-label-x');
  const y = labelCoordinate(button, '--realm-castle-label-y');
  return Number.isSafeInteger(castleId)
    && castleId > 0
    && x !== undefined
    && y !== undefined
    ? { castleId, button, x, y }
    : undefined;
}

function visibleCastleLabelPoints(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLButtonElement>(
    'button.realm-castle-label[data-castle-id]'
  )]
    .filter((button) => button.style.visibility !== 'hidden' && !button.disabled)
    .map(castleLabelPoint)
    .filter((point): point is CastleLabelPoint => point !== undefined);
}

function readingOrder(left: CastleLabelPoint, right: CastleLabelPoint) {
  return left.y - right.y || left.x - right.x || left.castleId - right.castleId;
}

function nearestPoint(
  points: readonly CastleLabelPoint[],
  origin: Readonly<{ x: number; y: number }>
) {
  return [...points].sort((left, right) => (
    Math.hypot(left.x - origin.x, left.y - origin.y)
      - Math.hypot(right.x - origin.x, right.y - origin.y)
    || readingOrder(left, right)
  ))[0];
}

function directionalPoint(
  points: readonly CastleLabelPoint[],
  current: CastleLabelPoint,
  key: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight'
) {
  const vertical = key === 'ArrowUp' || key === 'ArrowDown';
  const direction = key === 'ArrowUp' || key === 'ArrowLeft' ? -1 : 1;
  return points
    .filter((candidate) => {
      if (candidate.button === current.button) return false;
      const primaryDelta = vertical
        ? candidate.y - current.y
        : candidate.x - current.x;
      return primaryDelta * direction > 0.5;
    })
    .sort((left, right) => {
      const leftPrimary = Math.abs(vertical ? left.y - current.y : left.x - current.x);
      const rightPrimary = Math.abs(vertical ? right.y - current.y : right.x - current.x);
      const leftSecondary = Math.abs(vertical ? left.x - current.x : left.y - current.y);
      const rightSecondary = Math.abs(vertical ? right.x - current.x : right.y - current.y);
      const leftScore = leftPrimary + leftSecondary * 0.35;
      const rightScore = rightPrimary + rightSecondary * 0.35;
      return leftScore - rightScore
        || leftSecondary - rightSecondary
        || leftPrimary - rightPrimary
        || readingOrder(left, right);
    })[0];
}

function setCastleLabelTabStop(
  points: readonly CastleLabelPoint[],
  target: CastleLabelPoint
) {
  points.forEach(({ button }) => {
    button.tabIndex = button === target.button ? 0 : -1;
  });
}

export function CastleProfileAvatar({
  profile,
  size = 'normal'
}: Readonly<{
  profile: RealmCastlePublicPresentation;
  size?: 'compact' | 'normal' | 'large';
}>) {
  const safeUrl = reviewedRealmProfileImageUrl(profile.pfpUrl);
  const snapshotPixels = PROFILE_SNAPSHOT_PIXELS[size];
  const monogram = castleProfileMonogram(profile);

  return (
    <span
      aria-hidden="true"
      className="realm-castle-avatar"
      data-size={size}
      style={{ '--realm-avatar-hue': String((monogram.codePointAt(0) ?? 87) % 360) } as CSSProperties}
    >
      {safeUrl ? (
        <StaticProfileImageCanvas
          fallback={<span>{monogram}</span>}
          key={`${size}:${safeUrl}`}
          safeUrl={safeUrl}
          snapshotPixels={snapshotPixels}
        />
      ) : <span>{monogram}</span>}
    </span>
  );
}

export function RealmCastleLabels({
  labels,
  records,
  selectedCastleId,
  inspectorCastleId,
  focusedCastleId,
  hoveredCastleId,
  ownCastleId,
  inspectorId,
  inspectorOpen,
  onActivate
}: Readonly<{
  labels: readonly VisibleCastleLabel[];
  records: ReadonlyMap<number, CastleLabelRecord>;
  selectedCastleId?: number;
  inspectorCastleId?: number;
  focusedCastleId?: number;
  hoveredCastleId?: number;
  ownCastleId?: number;
  inspectorId: string;
  inspectorOpen: boolean;
  onActivate: (castle: RealmCastleProjection) => void;
}>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rovingCastleIdRef = useRef<number | undefined>(ownCastleId);
  const pendingFocusRef = useRef<PendingCastleLabelFocus | undefined>(undefined);
  const focusedPointRef = useRef<PendingCastleLabelFocus | undefined>(undefined);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const points = visibleCastleLabelPoints(container);
    const rememberedFocus = focusedPointRef.current;
    const activeElement = document.activeElement;
    const focusLostWithProjection = rememberedFocus
      && !points.some((point) => point.castleId === rememberedFocus.castleId)
      && (
        activeElement === null
        || activeElement === document.body
        || activeElement === document.documentElement
        || !activeElement.isConnected
      )
      ? rememberedFocus
      : undefined;
    const pendingFocus = pendingFocusRef.current ?? focusLostWithProjection;
    pendingFocusRef.current = undefined;
    const preferredCastleIds = [
      pendingFocus?.castleId,
      rovingCastleIdRef.current,
      focusedCastleId,
      selectedCastleId,
      ownCastleId
    ];
    const preferred = preferredCastleIds
      .map((castleId) => points.find((point) => point.castleId === castleId))
      .find((point) => point !== undefined)
      ?? (pendingFocus ? nearestPoint(points, pendingFocus) : undefined)
      ?? [...points].sort(readingOrder)[0];

    if (preferred) {
      rovingCastleIdRef.current = preferred.castleId;
      setCastleLabelTabStop(points, preferred);
      if (pendingFocus && document.activeElement !== preferred.button) {
        focusedPointRef.current = preferred;
        preferred.button.focus({ preventScroll: true });
      }
    } else if (pendingFocus) {
      rovingCastleIdRef.current = undefined;
      focusedPointRef.current = undefined;
      container.closest<HTMLElement>('.realm-map-screen')?.focus({ preventScroll: true });
    }

    return () => {
      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLButtonElement
        && container.contains(activeElement)
        && activeElement.classList.contains('realm-castle-label')
      ) {
        const point = castleLabelPoint(activeElement);
        if (point) pendingFocusRef.current = point;
      }
    };
  }, [focusedCastleId, labels, ownCastleId, selectedCastleId]);

  const handleLabelFocus = (button: HTMLButtonElement) => {
    const container = containerRef.current;
    const point = castleLabelPoint(button);
    if (!container || !point) return;
    const points = visibleCastleLabelPoints(container);
    rovingCastleIdRef.current = point.castleId;
    focusedPointRef.current = point;
    setCastleLabelTabStop(points, point);
  };

  const handleLabelKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (![
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'Home',
      'End'
    ].includes(event.key)) return;
    const container = containerRef.current;
    const current = castleLabelPoint(event.currentTarget);
    if (!container || !current) return;
    const points = visibleCastleLabelPoints(container);
    const ordered = [...points].sort(readingOrder);
    const next = event.key === 'Home'
      ? ordered[0]
      : event.key === 'End'
        ? ordered.at(-1)
        : directionalPoint(
            points,
            current,
            event.key as 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight'
          );
    if (!next) return;
    event.preventDefault();
    event.stopPropagation();
    rovingCastleIdRef.current = next.castleId;
    setCastleLabelTabStop(points, next);
    next.button.focus({ preventScroll: true });
  };

  return (
    <div
      className="realm-castle-labels"
      aria-label="Visible player castles"
      onBlur={(event) => {
        if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
          focusedPointRef.current = undefined;
        }
      }}
      ref={containerRef}
    >
      {labels.map((label) => {
        const record = records.get(label.castleId);
        if (!record) return null;
        const profileLabel = castleProfileLabel(record.profile);
        const own = label.castleId === ownCastleId;
        const selected = label.castleId === selectedCastleId;
        const focused = label.castleId === focusedCastleId;
        const hovered = label.castleId === hoveredCastleId;
        const expanded = label.castleId === inspectorCastleId && inspectorOpen;
        const positionStyle = {
          '--realm-castle-label-x': `${label.x}px`,
          '--realm-castle-label-y': `${label.y}px`,
          '--realm-castle-anchor-x': `${label.projectedAnchor.x}px`,
          '--realm-castle-anchor-y': `${label.projectedAnchor.y}px`
        } as CSSProperties;
        return (
          <button
            key={label.castleId}
            type="button"
            aria-label={`Inspect ${profileLabel} castle, ${record.castle.name}, cell ${record.castle.q},${record.castle.r}${own ? ', your castle' : ''}`}
            aria-controls={inspectorId}
            aria-expanded={expanded}
            aria-pressed={selected}
            className="realm-castle-label"
            data-anchor="foundation-base"
            data-castle-id={label.castleId}
            data-compact={label.compact ? 'true' : 'false'}
            data-displaced="false"
            data-focused={focused ? 'true' : 'false'}
            data-hovered={hovered ? 'true' : 'false'}
            data-own={own ? 'true' : 'false'}
            style={positionStyle}
            tabIndex={label.castleId === rovingCastleIdRef.current ? 0 : -1}
            onClick={() => onActivate(record.castle)}
            onFocus={(event) => handleLabelFocus(event.currentTarget)}
            onKeyDown={handleLabelKeyDown}
          >
            <span className="realm-castle-label__plate">
              <span className="realm-castle-label__identity">{profileLabel}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
