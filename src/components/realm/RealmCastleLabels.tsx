import { type CSSProperties } from 'react';

import { StaticProfileImageCanvas } from '../profile/StaticProfileImageCanvas';
import type { RealmCastleProjection } from './RealmMapScreen';
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

const PROFILE_SNAPSHOT_PIXELS = Object.freeze({
  compact: 96,
  normal: 128,
  large: 192
} satisfies Record<'compact' | 'normal' | 'large', number>);

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
  return (
    <div className="realm-castle-labels" aria-label="Visible player castles">
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
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onActivate(record.castle)}
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
