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
  onRequestClose: () => void;
  focusTargetRef?: Ref<HTMLButtonElement>;
}>;

export function CastleInspectionPanel({
  id,
  castle,
  profile,
  own,
  onRequestClose,
  focusTargetRef
}: CastleInspectionPanelProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = `${id}-title`;
  const username = castleProfileLabel(profile);
  const profileUrl = farcasterProfileUrl(profile.canonicalUsername);
  const totalSnapBurned = profile.communityStatsVisible
    ? formatPublicMarkMicros(profile.totalSnapBurnedMicros)
    : undefined;
  const marksBalance = profile.communityStatsVisible
    ? formatPublicMarkMicros(profile.marksBalanceMicros)
    : undefined;
  const foundedDate = formatPublicRealmDate(castle.foundedAt);

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
              <h3>COMMUNITY MARKS</h3>
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
