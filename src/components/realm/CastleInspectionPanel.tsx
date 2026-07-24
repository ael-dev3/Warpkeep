import {
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
  type Ref
} from 'react';

import { CastleProfileAvatar } from './RealmCastleLabels';
import {
  castleProfileLabel,
  farcasterProfileUrl,
  formatPublicMarkMicros,
  formatPublicRealmDate,
  type RealmCastlePublicPresentation
} from './realmCastlePresentation';

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
}>;

export type CastleInspectionPanelProps = Readonly<{
  id: string;
  castle: CastleInspectionRecord;
  profile: RealmCastlePublicPresentation;
  own: boolean;
  observer?: boolean;
  onRequestClose: () => void;
  focusTargetRef?: Ref<HTMLButtonElement>;
}>;

export function CastleInspectionPanel({
  id,
  castle,
  profile,
  own,
  observer = false,
  onRequestClose,
  focusTargetRef
}: CastleInspectionPanelProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
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

  const setCloseButtonRef = useCallback((element: HTMLButtonElement | null) => {
    closeButtonRef.current = element;
    assignRef(focusTargetRef, element);
  }, [focusTargetRef]);

  useEffect(() => {
    closeButtonRef.current?.focus({ preventScroll: true });
  }, [castle.castleId, id]);

  return (
    <aside
      id={id}
      className="castle-inspection realm-camera-neutral-inspector"
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      aria-describedby={keeperIdentityId}
      data-open="true"
    >
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
            <h2 id={titleId}>{castle.name}</h2>
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
            <PublicField label="Keeper">{username}</PublicField>
            <PublicField label="Castle level">{castle.level}</PublicField>
            <PublicField label="Coordinates">q {castle.q} · r {castle.r}</PublicField>
            {foundedDate ? (
              <PublicField label="Castle founded">
                <time dateTime={foundedDate}>{foundedDate}</time>
              </PublicField>
            ) : null}
          </dl>

          {totalSnapBurned !== undefined || marksBalance !== undefined ? (
            <section className="castle-inspection__marks" aria-label="Public Marks record">
              <h3>PUBLIC COMMUNITY MARKS</h3>
              <dl className="castle-inspection__fields">
                {totalSnapBurned !== undefined ? (
                  <PublicField label="Total SNAP burned">{totalSnapBurned}</PublicField>
                ) : null}
                {marksBalance !== undefined ? (
                  <PublicField label="Marks balance">{marksBalance}</PublicField>
                ) : null}
              </dl>
            </section>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
