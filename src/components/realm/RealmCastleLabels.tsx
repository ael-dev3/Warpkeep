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

  useEffect(() => setFailed(false), [safeUrl]);

  return (
    <span
      aria-hidden="true"
      className="realm-castle-avatar"
      data-size={size}
      style={{ '--realm-avatar-hue': String((profile.fid * 47) % 360) } as CSSProperties}
    >
      {safeUrl && !failed ? (
        <img
          alt=""
          decoding="async"
          loading="lazy"
          onError={() => setFailed(true)}
          referrerPolicy="no-referrer"
          src={safeUrl}
        />
      ) : (
        <span>{castleProfileMonogram(profile)}</span>
      )}
    </span>
  );
}

export function RealmCastleLabels({
  labels,
  records,
  selectedCastleId,
  ownCastleId,
  onActivate
}: Readonly<{
  labels: readonly VisibleCastleLabel[];
  records: ReadonlyMap<number, CastleLabelRecord>;
  selectedCastleId?: number;
  ownCastleId?: number;
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
        return (
          <button
            key={label.castleId}
            type="button"
            aria-label={`Inspect ${profileLabel} castle, ${record.castle.name}, cell ${record.castle.q},${record.castle.r}${own ? ', your castle' : ''}`}
            aria-pressed={selected}
            className="realm-castle-label"
            data-compact={label.compact ? 'true' : 'false'}
            data-own={own ? 'true' : 'false'}
            style={{
              '--realm-castle-label-x': `${label.x}px`,
              '--realm-castle-label-y': `${label.y}px`
            } as CSSProperties}
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
