import {
  useCallback,
  useEffect,
  useRef,
  type Ref
} from 'react';

import { useMiniAppHost } from '../../farcaster/miniapp';
import { CastleProfileAvatar } from './RealmCastleLabels';
import { RealmRecordField } from './RealmRecordPrimitives';
import {
  castleProfileLabel,
  farcasterProfileUrl,
  formatPublicMarkMicros,
  formatPublicRealmDate,
  type RealmCastlePublicPresentation
} from './realmCastlePresentation';

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === 'function') {
    ref(value);
  } else if (ref) {
    (ref as { current: T | null }).current = value;
  }
}

function publicAssetUrl(path: string) {
  const base = import.meta.env.BASE_URL || '/';
  return `${base.endsWith('/') ? base : `${base}/`}${path.replace(/^\/+/, '')}`;
}

export type CastleInspectionRecord = Readonly<{
  castleId: number;
  q: number;
  r: number;
  level: number;
  name: string;
  foundedAt?: number;
  ownerFid?: number;
}>;

export type CastleInspectionPanelProps = Readonly<{
  id: string;
  castle: CastleInspectionRecord;
  profile: RealmCastlePublicPresentation;
  own: boolean;
  observer?: boolean;
  /** Compact and Mini App records are hosted navigation destinations. */
  hostedDestination?: boolean;
  /** Returns to the preceding nested destination without moving the camera. */
  onRequestBack?: () => void;
  onRequestClose: () => void;
  focusTargetRef?: Ref<HTMLButtonElement>;
}>;

export function CastleInspectionPanel({
  id,
  castle,
  profile,
  own,
  observer = false,
  hostedDestination = false,
  onRequestBack,
  onRequestClose,
  focusTargetRef
}: CastleInspectionPanelProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const miniAppHost = useMiniAppHost();
  const titleId = `${id}-title`;
  const keeperIdentityId = `${id}-keeper-identity`;
  const username = castleProfileLabel(profile);
  const profileUrl = observer ? undefined : farcasterProfileUrl(profile.canonicalUsername);
  const totalSnapBurned = !observer && profile.communityStatsVisible
    ? formatPublicMarkMicros(profile.totalSnapBurnedMicros)
    : undefined;
  const marksBalance = !observer && profile.communityStatsVisible
    ? formatPublicMarkMicros(profile.marksBalanceMicros)
    : undefined;
  const foundedDate = formatPublicRealmDate(castle.foundedAt);
  const keeperName = profile.displayName ?? username;
  const showUsernameUnderName = keeperName !== username;
  const canUseMiniAppProfile = miniAppHost.isMiniApp
    && miniAppHost.hasCapability('actions.viewProfile')
    && Number.isSafeInteger(castle.ownerFid)
    && (castle.ownerFid ?? 0) > 0;

  const setCloseButtonRef = useCallback((element: HTMLButtonElement | null) => {
    closeButtonRef.current = element;
    assignRef(focusTargetRef, element);
  }, [focusTargetRef]);

  useEffect(() => {
    if (hostedDestination) {
      headingRef.current?.focus({ preventScroll: true });
    } else {
      closeButtonRef.current?.focus({ preventScroll: true });
    }
  }, [castle.castleId, hostedDestination, id]);

  return (
    <aside
      id={id}
      className="castle-inspection realm-camera-neutral-inspector"
      role={hostedDestination ? 'region' : 'dialog'}
      aria-modal={hostedDestination ? undefined : false}
      aria-labelledby={titleId}
      aria-describedby={keeperIdentityId}
      data-open="true"
      ref={dialogRef}
    >
      {onRequestBack ? (
        <button
          className="realm-world-surface-back"
          onClick={onRequestBack}
          type="button"
        >
          <span aria-hidden="true">‹</span>
          BACK
        </button>
      ) : null}
      <div className="castle-inspection__drawer">
        <header className="castle-inspection__hero">
          <div aria-hidden="true" className="castle-inspection__hero-orbit" />
          <div aria-hidden="true" className="castle-inspection__hero-art-stage">
            <img
              alt=""
              aria-hidden="true"
              className="castle-inspection__hero-art"
              decoding="async"
              draggable="false"
              height="1254"
              src={publicAssetUrl('images/realm/hegemony-castle-record.webp')}
              width="1254"
            />
          </div>
          <button
            ref={setCloseButtonRef}
            className="castle-inspection__dismiss"
            aria-label="CLOSE RECORD"
            onClick={onRequestClose}
            type="button"
          >
            <span aria-hidden="true">×</span>
          </button>
          <div className="castle-inspection__title-lockup">
            <p>{observer ? 'PUBLIC REALM RECORD' : own ? 'YOUR FOUNDED KEEP' : 'FOUNDED KEEP'}</p>
            <h2 id={titleId} ref={headingRef} tabIndex={-1}>{castle.name}</h2>
          </div>
        </header>

        <div className="castle-inspection__body">
          <section className="castle-inspection__identity" aria-label="Farcaster keeper identity">
            <CastleProfileAvatar profile={profile} size="large" />
            <div id={keeperIdentityId} className="castle-inspection__identity-copy">
              <p>KEEPER</p>
              <strong>{keeperName}</strong>
              {showUsernameUnderName ? <span>{username}</span> : null}
            </div>
            {profileUrl ? (
              <a
                aria-label="View Farcaster profile"
                className="castle-inspection__profile-link"
                href={profileUrl}
                onClick={(event) => {
                  if (!canUseMiniAppProfile || castle.ownerFid === undefined) return;
                  event.preventDefault();
                  void miniAppHost.actions.viewProfile(castle.ownerFid).then((opened) => {
                    if (!opened) void miniAppHost.actions.openUrl(profileUrl);
                  });
                }}
                rel="noreferrer noopener"
                target="_blank"
              >
                <span aria-hidden="true">↗</span>
              </a>
            ) : null}
          </section>

          {profile.publicBio ? (
            <p className="castle-inspection__bio">{profile.publicBio}</p>
          ) : null}

          <dl className="castle-inspection__fields" aria-label="Public castle data">
            <RealmRecordField className="castle-inspection__field" label="Keeper">
              {username}
            </RealmRecordField>
            <RealmRecordField className="castle-inspection__field" label="Castle level">
              {castle.level}
            </RealmRecordField>
            {observer ? (
              <RealmRecordField className="castle-inspection__field" label="Coordinates">
                q {castle.q} · r {castle.r}
              </RealmRecordField>
            ) : null}
            {foundedDate ? (
              <RealmRecordField className="castle-inspection__field" label="Castle founded">
                <time dateTime={foundedDate}>{foundedDate}</time>
              </RealmRecordField>
            ) : null}
          </dl>

          {totalSnapBurned !== undefined || marksBalance !== undefined ? (
            <section className="castle-inspection__marks" aria-label="Public Marks record">
              <h3>PUBLIC COMMUNITY MARKS</h3>
              <dl className="castle-inspection__fields">
                {totalSnapBurned !== undefined ? (
                  <RealmRecordField
                    className="castle-inspection__field"
                    label="Total SNAP burned"
                  >
                    {totalSnapBurned}
                  </RealmRecordField>
                ) : null}
                {marksBalance !== undefined ? (
                  <RealmRecordField
                    className="castle-inspection__field"
                    label="Marks balance"
                  >
                    {marksBalance}
                  </RealmRecordField>
                ) : null}
              </dl>
            </section>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
