import type { VerifiedFarcasterIdentity } from '../../farcaster/farcasterAuthTypes';
import { safePublicHttpsImageUrl } from '../../security/publicImageUrl';
import { normalizePublicProfileText } from '../../security/publicProfileText';
import { StaticProfileImageCanvas } from '../profile/StaticProfileImageCanvas';
import { reviewedRealmProfileImageUrl } from '../realm/loadRealmProfileImage';
import './FarcasterQrAuthPanel.css';

export type FarcasterIdentityBadgeProps = {
  identity: VerifiedFarcasterIdentity;
  compact?: boolean;
  className?: string;
  onActivate?: () => void;
};

function readDisplayText(value: string | undefined) {
  return normalizePublicProfileText(value);
}

export function normalizeFarcasterUsername(username: string | undefined) {
  const normalizedUsername = readDisplayText(username)?.replace(/^@+/, '');
  return normalizedUsername ? `@${normalizedUsername}` : undefined;
}

export function getSafeFarcasterProfileImageUrl(profileImageUrl: string | undefined) {
  return reviewedRealmProfileImageUrl(safePublicHttpsImageUrl(profileImageUrl));
}

export function getFarcasterIdentityMonogram(identity: VerifiedFarcasterIdentity) {
  const username = readDisplayText(identity.username)?.replace(/^@+/, '');
  const displayName = readDisplayText(identity.displayName);
  const firstCharacter = username?.[0] ?? displayName?.[0];
  return firstCharacter?.toLocaleUpperCase() ?? 'W';
}

export function FarcasterIdentityBadge({
  identity,
  compact = false,
  className,
  onActivate
}: FarcasterIdentityBadgeProps) {
  const username = normalizeFarcasterUsername(identity.username);
  const displayName = readDisplayText(identity.displayName);
  const publicLabel = username ?? `FID ${identity.fid}`;
  const safeProfileImageUrl = getSafeFarcasterProfileImageUrl(identity.pfpUrl);
  const monogram = getFarcasterIdentityMonogram(identity);

  const rootClassName = [
    'farcaster-identity-badge',
    compact ? 'farcaster-identity-badge--compact' : '',
    className
  ].filter(Boolean).join(' ');

  const badgeContents = (
    <>
      <div aria-hidden="true" className="farcaster-identity-badge__portrait">
        {safeProfileImageUrl ? (
          <StaticProfileImageCanvas
            fallback={(
              <span className="farcaster-identity-badge__monogram">
                {monogram}
              </span>
            )}
            key={`${compact ? 'compact' : 'normal'}:${safeProfileImageUrl}`}
            safeUrl={safeProfileImageUrl}
            snapshotPixels={compact ? 96 : 128}
          />
        ) : (
          <span className="farcaster-identity-badge__monogram">
            {monogram}
          </span>
        )}
      </div>

      <div className="farcaster-identity-badge__record">
        {username ? (
          <strong className="farcaster-identity-badge__username">{username}</strong>
        ) : null}
        {!compact && displayName && displayName !== username ? (
          <span className="farcaster-identity-badge__display-name">{displayName}</span>
        ) : null}
        {!username ? (
          <span className="farcaster-identity-badge__fid">FID {identity.fid}</span>
        ) : null}
      </div>
    </>
  );

  if (onActivate) {
    return (
      <button
        aria-label={`Open Farcaster identity, ${publicLabel}`}
        className={`${rootClassName} farcaster-identity-badge--interactive`}
        data-compact={compact ? 'true' : 'false'}
        onClick={onActivate}
        type="button"
      >
        {badgeContents}
      </button>
    );
  }

  return (
    <div className={rootClassName} data-compact={compact ? 'true' : 'false'}>
      {badgeContents}
    </div>
  );
}
