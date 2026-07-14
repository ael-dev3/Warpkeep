import { useEffect, useId, useState } from 'react';

import { hexDistance } from '../../game/map/hexCoordinates';
import type { WarpkeepWorldTileMetadata } from '../../spacetime/warpkeepBackendTypes';
import type { RealmCastleProjection } from './RealmMapScreen';
import { CastleProfileAvatar } from './RealmCastleLabels';
import {
  castleProfileLabel,
  farcasterProfileUrl,
  formatPublicMarkMicros,
  formatPublicRealmDate,
  sectorForRealmCoord,
  type RealmCastlePublicPresentation
} from './realmCastlePresentation';

export const CASTLE_WARP_PREVIEW_MESSAGE = 'CASTLE WARP IS UNDER DEVELOPMENT. FUTURE RELOCATION WILL COST 100 MARKS. NO MARKS WERE SPENT.';
const COMPACT_INSPECTION_QUERY = '(max-width: 680px), (max-height: 610px)';

function inspectionStartsOpen() {
  return typeof window === 'undefined'
    || typeof window.matchMedia !== 'function'
    || !window.matchMedia(COMPACT_INSPECTION_QUERY).matches;
}

function PublicDate({ value }: Readonly<{ value: number | undefined }>) {
  const formatted = formatPublicRealmDate(value);
  return formatted ? <time dateTime={formatted}>{formatted}</time> : <>Not available</>;
}

function PublicMarkAmount({ value }: Readonly<{ value: bigint | undefined }>) {
  return <>{formatPublicMarkMicros(value) ?? 'Not available'}</>;
}

function PublicField({
  label,
  children
}: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <div className="castle-inspection__field">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function CastleInspectionPanel({
  castle,
  profile,
  tileMetadata,
  realmName,
  own
}: Readonly<{
  castle: RealmCastleProjection;
  profile: RealmCastlePublicPresentation;
  tileMetadata?: WarpkeepWorldTileMetadata;
  realmName: string;
  own: boolean;
}>) {
  const [open, setOpen] = useState(inspectionStartsOpen);
  const [warpNoticeVisible, setWarpNoticeVisible] = useState(false);
  const [warpNoticePinned, setWarpNoticePinned] = useState(false);
  const warpNoticeId = useId();
  const titleId = useId();
  const username = castleProfileLabel(profile);
  const profileUrl = farcasterProfileUrl(profile.canonicalUsername);
  const coord = { q: castle.q, r: castle.r };
  const s = -castle.q - castle.r;
  const ring = tileMetadata?.ring ?? hexDistance({ q: 0, r: 0 }, coord);
  const sector = tileMetadata?.sector ?? sectorForRealmCoord(coord);

  useEffect(() => {
    setOpen(inspectionStartsOpen());
    setWarpNoticeVisible(false);
    setWarpNoticePinned(false);
  }, [castle.castleId]);

  const showTransientWarpNotice = () => setWarpNoticeVisible(true);
  const hideTransientWarpNotice = () => {
    if (!warpNoticePinned) setWarpNoticeVisible(false);
  };

  return (
    <aside
      className="castle-inspection"
      aria-labelledby={titleId}
      data-open={open ? 'true' : 'false'}
    >
      <details open={open}>
        <summary
          onClick={(event) => {
            event.preventDefault();
            setOpen((current) => !current);
          }}
        >
          <span>CASTLE RECORD</span>
          <strong>{castle.name}</strong>
          <small>{open ? 'Collapse' : 'Expand'}</small>
        </summary>

        <div className="castle-inspection__body">
          <button
            className="castle-inspection__close"
            onClick={() => setOpen(false)}
            type="button"
          >
            CLOSE RECORD
          </button>
          <header className="castle-inspection__identity">
            <CastleProfileAvatar profile={profile} size="large" />
            <div>
              <p>{own ? 'YOUR CASTLE' : 'PLAYER CASTLE'}</p>
              <h2 id={titleId}>{username}</h2>
              {profile.displayName ? <span>{profile.displayName}</span> : null}
              <small>FID {profile.fid}</small>
            </div>
          </header>

          {profile.publicBio ? (
            <p className="castle-inspection__bio">{profile.publicBio}</p>
          ) : null}

          {profileUrl ? (
            <a
              className="castle-inspection__profile-link"
              href={profileUrl}
              rel="noreferrer noopener"
              target="_blank"
            >
              View Farcaster profile
            </a>
          ) : null}

          <dl className="castle-inspection__fields">
            <PublicField label="Admitted to Hegemony">
              <PublicDate value={profile.admittedAt} />
            </PublicField>
            <PublicField label="First Warpkeep authentication">
              <PublicDate value={profile.firstAuthenticatedAt} />
            </PublicField>
            <PublicField label="Castle founded">
              <PublicDate value={castle.foundedAt} />
            </PublicField>
            <PublicField label="Castle name">{castle.name}</PublicField>
            <PublicField label="Castle level">{castle.level}</PublicField>
            <PublicField label="Realm">{realmName}</PublicField>
            <PublicField label="Axial coordinates">
              q {castle.q} · r {castle.r} · s {s}
            </PublicField>
            <PublicField label="Ring and sector">
              Ring {ring} · Sector {sector}
            </PublicField>
          </dl>

          <section className="castle-inspection__marks" aria-label="Public Marks record">
            <h3>COMMUNITY MARKS</h3>
            {profile.communityStatsVisible ? (
              <dl className="castle-inspection__fields">
                <PublicField label="Total SNAP burned">
                  <PublicMarkAmount value={profile.totalSnapBurnedMicros} />
                </PublicField>
                <PublicField label="Marks earned">
                  <PublicMarkAmount value={profile.marksEarnedMicros} />
                </PublicField>
                <PublicField label="Marks spent">
                  <PublicMarkAmount value={profile.marksSpentMicros} />
                </PublicField>
                <PublicField label="Marks balance">
                  <PublicMarkAmount value={profile.marksBalanceMicros} />
                </PublicField>
              </dl>
            ) : (
              <p>Community statistics are not public for this player.</p>
            )}
            <p className="castle-inspection__policy">
              POLICY // {profile.marksPolicyVersion ?? 'NOT PUBLICLY ACTIVATED'}
            </p>
          </section>

          {own ? (
            <div
              className="castle-inspection__warp-preview"
              onPointerEnter={showTransientWarpNotice}
              onPointerLeave={hideTransientWarpNotice}
            >
              <button
                type="button"
                aria-describedby={warpNoticeId}
                aria-disabled="true"
                onBlur={hideTransientWarpNotice}
                onClick={() => {
                  setWarpNoticePinned((pinned) => {
                    const next = !pinned;
                    setWarpNoticeVisible(next);
                    return next;
                  });
                }}
                onFocus={showTransientWarpNotice}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    setWarpNoticePinned(false);
                    setWarpNoticeVisible(false);
                  }
                }}
              >
                WARP CASTLE · 100 MARKS
              </button>
              <p
                id={warpNoticeId}
                role="status"
                aria-live="polite"
                data-visible={warpNoticeVisible ? 'true' : 'false'}
              >
                {warpNoticeVisible
                  ? CASTLE_WARP_PREVIEW_MESSAGE
                  : 'Castle warp preview. Under development; no action is available.'}
              </p>
            </div>
          ) : null}
        </div>
      </details>
    </aside>
  );
}
