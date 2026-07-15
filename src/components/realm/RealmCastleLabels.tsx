import { Fragment, useEffect, useRef, useState, type CSSProperties } from 'react';

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

const PROFILE_SNAPSHOT_PIXELS = Object.freeze({
  compact: 96,
  normal: 128,
  large: 192
} satisfies Record<'compact' | 'normal' | 'large', number>);

function StaticProfileAvatarSnapshot({
  monogram,
  safeUrl,
  snapshotPixels
}: Readonly<{
  monogram: string;
  safeUrl: string;
  snapshotPixels: number;
}>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    const image = new Image();
    const detachImage = () => {
      image.onload = null;
      image.onerror = null;
      image.removeAttribute('src');
    };
    const retainFallback = () => {
      if (active) setReady(false);
      detachImage();
    };

    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    image.onerror = retainFallback;
    image.onload = () => {
      if (!active) {
        detachImage();
        return;
      }

      const canvas = canvasRef.current;
      const sourceWidth = image.naturalWidth;
      const sourceHeight = image.naturalHeight;
      try {
        if (!canvas || sourceWidth <= 0 || sourceHeight <= 0) {
          throw new Error('Profile image has no drawable dimensions.');
        }
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas 2D rendering is unavailable.');

        const sourceSize = Math.min(sourceWidth, sourceHeight);
        const sourceX = (sourceWidth - sourceSize) / 2;
        const sourceY = (sourceHeight - sourceSize) / 2;
        context.clearRect(0, 0, snapshotPixels, snapshotPixels);
        context.drawImage(
          image,
          sourceX,
          sourceY,
          sourceSize,
          sourceSize,
          0,
          0,
          snapshotPixels,
          snapshotPixels
        );
        setReady(true);
      } catch {
        setReady(false);
      } finally {
        detachImage();
      }
    };
    image.src = safeUrl;

    return () => {
      active = false;
      detachImage();
    };
  }, [safeUrl, snapshotPixels]);

  return (
    <>
      <canvas
        aria-hidden="true"
        height={snapshotPixels}
        ref={canvasRef}
        style={{
          display: ready ? 'block' : 'none',
          height: '100%',
          width: '100%'
        }}
        width={snapshotPixels}
      />
      {!ready ? <span>{monogram}</span> : null}
    </>
  );
}

export function CastleProfileAvatar({
  profile,
  size = 'normal'
}: Readonly<{
  profile: RealmCastlePublicPresentation;
  size?: 'compact' | 'normal' | 'large';
}>) {
  const safeUrl = safeRealmProfileImageUrl(profile.pfpUrl);
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
        <StaticProfileAvatarSnapshot
          key={`${size}:${safeUrl}`}
          monogram={monogram}
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
          const profileLabel = castleProfileLabel(record.profile);
          return (
            <Fragment key={`measure-${record.castle.castleId}`}>
              <span
                className="realm-castle-label realm-castle-label--measurement"
                data-measure-castle-id={record.castle.castleId}
              >
                <span
                  className="realm-castle-avatar"
                  style={{ '--realm-avatar-hue': String((monogram.codePointAt(0) ?? 87) % 360) } as CSSProperties}
                >
                  <span>{monogram}</span>
                </span>
                <span className="realm-castle-label__identity">{profileLabel}</span>
              </span>
              <span
                className="realm-castle-label realm-castle-label--measurement"
                data-compact="true"
                data-measure-compact-castle-id={record.castle.castleId}
              >
                <span className="realm-castle-label__identity">{profileLabel}</span>
              </span>
            </Fragment>
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
            {!label.compact ? (
              <CastleProfileAvatar profile={record.profile} size="normal" />
            ) : null}
            <span className="realm-castle-label__identity">{profileLabel}</span>
          </button>
        );
      })}
    </div>
  );
}
