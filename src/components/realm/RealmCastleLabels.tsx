import { useEffect, useState, type CSSProperties } from 'react';

import type { RealmCastleProjection } from './RealmMapScreen';
import {
  castleProfileLabel,
  castleProfileMonogram,
  safeRealmProfileImageUrl,
  type RealmCastlePublicPresentation,
  type VisibleCastleLabel
} from './realmCastlePresentation';

export type CastleLabelRecord = Readonly<{
  castle: RealmCastleProjection;
  profile: RealmCastlePublicPresentation;
}>;

export function CastleProfileAvatar({
  profile,
  size = 'normal'
}: Readonly<{
  profile: RealmCastlePublicPresentation;
  size?: 'compact' | 'normal' | 'large';
}>) {
  const safeUrl = safeRealmProfileImageUrl(profile.pfpUrl);
  const [failed, setFailed] = useState(false);
  const monogram = castleProfileMonogram(profile);

  useEffect(() => setFailed(false), [safeUrl]);

  return (
    <span
      aria-hidden="true"
      className="realm-castle-avatar"
      data-size={size}
      style={{ '--realm-avatar-hue': String((monogram.codePointAt(0) ?? 87) % 360) } as CSSProperties}
    >
      {safeUrl && !failed ? (
        <img
          alt=""
          decoding="async"
          loading="eager"
          onError={() => setFailed(true)}
          referrerPolicy="no-referrer"
          src={safeUrl}
        />
      ) : (
        <span>{monogram}</span>
      )}
    </span>
  );
}

export function RealmCastleLabels({
  labels,
  records,
  selectedCastleId,
  inspectorCastleId,
  ownCastleId,
  inspectorId,
  inspectorOpen,
  onActivate
}: Readonly<{
  labels: readonly VisibleCastleLabel[];
  records: ReadonlyMap<number, CastleLabelRecord>;
  selectedCastleId?: number;
  inspectorCastleId?: number;
  ownCastleId?: number;
  inspectorId: string;
  inspectorOpen: boolean;
  onActivate: (castle: RealmCastleProjection) => void;
}>) {
  return (
    <div className="realm-castle-labels" aria-label="Visible player castles">
      <div className="realm-castle-label-measurements" aria-hidden="true">
        {[...records.values()].map((record) => {
          const monogram = castleProfileMonogram(record.profile);
          return (
            <span
              className="realm-castle-label realm-castle-label--measurement"
              data-measure-castle-id={record.castle.castleId}
              key={`measure-${record.castle.castleId}`}
            >
              <span
                className="realm-castle-avatar"
                style={{ '--realm-avatar-hue': String((monogram.codePointAt(0) ?? 87) % 360) } as CSSProperties}
              >
                <span>{monogram}</span>
              </span>
              <span>{castleProfileLabel(record.profile)}</span>
            </span>
          );
        })}
      </div>
      {labels.map((label) => {
        const record = records.get(label.castleId);
        if (!record) return null;
        const profileLabel = castleProfileLabel(record.profile);
        const own = label.castleId === ownCastleId;
        const selected = label.castleId === selectedCastleId;
        const expanded = label.castleId === inspectorCastleId && inspectorOpen;
        return (
          <button
            key={label.castleId}
            type="button"
            aria-label={`Inspect ${profileLabel} castle, ${record.castle.name}, cell ${record.castle.q},${record.castle.r}${own ? ', your castle' : ''}`}
            aria-controls={inspectorId}
            aria-expanded={expanded}
            aria-pressed={selected}
            className="realm-castle-label"
            data-castle-id={label.castleId}
            data-compact={label.compact ? 'true' : 'false'}
            data-own={own ? 'true' : 'false'}
            style={{
              '--realm-castle-label-x': `${label.x}px`,
              '--realm-castle-label-y': `${label.y}px`
            } as CSSProperties}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onActivate(record.castle)}
          >
            <CastleProfileAvatar
              profile={record.profile}
              size={label.compact ? 'compact' : 'normal'}
            />
            {!label.compact ? <span>{profileLabel}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
