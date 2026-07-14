import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type Ref
} from 'react';

import { hexDistance } from '../../game/map/hexCoordinates';
import type { WarpkeepWorldTileMetadata } from '../../spacetime/warpkeepBackendTypes';
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
}: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div className="castle-inspection__field">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === 'function') {
    ref(value);
  } else if (ref) {
    (ref as { current: T | null }).current = value;
  }
}

export type CastleInspectionRecord = Readonly<{
  castleId: number;
  q: number;
  r: number;
  level: number;
  name: string;
  foundedAt?: number;
}>;

export type CastleInspectionPanelProps = Readonly<{
  id: string;
  castle: CastleInspectionRecord;
  profile: RealmCastlePublicPresentation;
  tileMetadata?: WarpkeepWorldTileMetadata;
  realmName: string;
  own: boolean;
  onRequestClose: () => void;
  focusTargetRef?: Ref<HTMLButtonElement>;
}>;

export function CastleInspectionPanel({
  id,
  castle,
  profile,
  tileMetadata,
  realmName,
  own,
  onRequestClose,
  focusTargetRef
}: CastleInspectionPanelProps) {
  const [warpNoticeVisible, setWarpNoticeVisible] = useState(false);
  const [warpNoticePinned, setWarpNoticePinned] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const warpNoticeId = useId();
  const titleId = `${id}-title`;
  const username = castleProfileLabel(profile);
  const profileUrl = farcasterProfileUrl(profile.canonicalUsername);
  const coord = { q: castle.q, r: castle.r };
  const s = -castle.q - castle.r;
  const ring = tileMetadata?.ring ?? hexDistance({ q: 0, r: 0 }, coord);
  const sector = tileMetadata?.sector ?? sectorForRealmCoord(coord);

  const setCloseButtonRef = useCallback((element: HTMLButtonElement | null) => {
    closeButtonRef.current = element;
    assignRef(focusTargetRef, element);
  }, [focusTargetRef]);

  useEffect(() => {
    setWarpNoticeVisible(false);
    setWarpNoticePinned(false);
    closeButtonRef.current?.focus({ preventScroll: true });
  }, [castle.castleId, id]);

  const showTransientWarpNotice = () => setWarpNoticeVisible(true);
  const hideTransientWarpNotice = () => {
    if (!warpNoticePinned) setWarpNoticeVisible(false);
  };

  return (
    <aside
      id={id}
      className="castle-inspection"
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      data-open="true"
    >
      <div className="castle-inspection__drawer">
        <header className="castle-inspection__record-heading">
          <span>CASTLE RECORD</span>
          <strong>{castle.name}</strong>
          <button
            ref={setCloseButtonRef}
            className="castle-inspection__dismiss"
            onClick={onRequestClose}
            type="button"
          >
            CLOSE RECORD
          </button>
        </header>

        <div className="castle-inspection__body">
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
                aria-controls={warpNoticeId}
                aria-describedby={warpNoticeId}
                aria-expanded={warpNoticeVisible}
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
                  if (event.key === 'Escape' && warpNoticeVisible) {
                    event.preventDefault();
                    event.stopPropagation();
                    setWarpNoticePinned(false);
                    setWarpNoticeVisible(false);
                  }
                }}
              >
                CASTLE WARP PREVIEW · 100 MARKS
              </button>
              <p
                id={warpNoticeId}
                data-visible={warpNoticeVisible ? 'true' : 'false'}
              >
                {warpNoticeVisible
                  ? CASTLE_WARP_PREVIEW_MESSAGE
                  : 'Castle warp preview. Under development; no action is available.'}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
