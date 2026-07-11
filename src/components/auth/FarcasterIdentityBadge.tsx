import { useEffect, useState } from 'react';

import type { VerifiedFarcasterIdentity } from '../../farcaster/farcasterAuthTypes';
import './FarcasterQrAuthPanel.css';

export type FarcasterIdentityBadgeProps = {
  identity: VerifiedFarcasterIdentity;
  compact?: boolean;
  className?: string;
  onActivate?: () => void;
};

function readDisplayText(value: string | undefined) {
  const normalizedValue = value?.trim();
  return normalizedValue ? normalizedValue : undefined;
}

export function normalizeFarcasterUsername(username: string | undefined) {
  const normalizedUsername = readDisplayText(username)?.replace(/^@+/, '');
  return normalizedUsername ? `@${normalizedUsername}` : undefined;
}

export function getSafeFarcasterProfileImageUrl(profileImageUrl: string | undefined) {
  if (!profileImageUrl) {
    return undefined;
  }

  try {
    const parsedUrl = new URL(profileImageUrl);
    if (
      (parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'http:')
      && !parsedUrl.username
      && !parsedUrl.password
    ) {
      return parsedUrl.toString();
    }
  } catch {
    // Untrusted profile metadata should degrade to the local monogram.
  }

  return undefined;
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
  const safeProfileImageUrl = getSafeFarcasterProfileImageUrl(identity.pfpUrl);
  const [profileImageFailed, setProfileImageFailed] = useState(false);

  useEffect(() => {
    setProfileImageFailed(false);
  }, [safeProfileImageUrl]);

  const rootClassName = [
    'farcaster-identity-badge',
    compact ? 'farcaster-identity-badge--compact' : '',
    className
  ].filter(Boolean).join(' ');

  const badgeContents = (
    <>
      <div aria-hidden="true" className="farcaster-identity-badge__portrait">
        {safeProfileImageUrl && !profileImageFailed ? (
          <img
            alt=""
            decoding="async"
            onError={() => setProfileImageFailed(true)}
            referrerPolicy="no-referrer"
            src={safeProfileImageUrl}
          />
        ) : (
          <span className="farcaster-identity-badge__monogram">
            {getFarcasterIdentityMonogram(identity)}
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
        <span className="farcaster-identity-badge__fid">FID {identity.fid}</span>
      </div>
    </>
  );

  if (onActivate) {
    return (
      <button
        aria-label={`Open Farcaster identity, FID ${identity.fid}`}
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
