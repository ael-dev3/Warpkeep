function unsafePublicImageHostname(hostname: string) {
  const normalized = hostname
    .toLowerCase()
    .replace(/\.$/, '')
    .replace(/^\[|\]$/g, '');
  if (
    normalized === 'localhost'
    || normalized.endsWith('.localhost')
    || normalized.endsWith('.local')
    || normalized.endsWith('.internal')
    || normalized.endsWith('.invalid')
  ) return true;

  // Public profile media has no operational need for literal IP origins.
  // Reject every IPv4/IPv6 literal so newly assigned special-use ranges,
  // unusual IPv4 spellings normalized by URL, and IPv4-mapped/tunneled IPv6
  // forms cannot bypass an inevitably stale address-range list.
  if (normalized.includes(':')) return true;
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(normalized);
}

export const WARPKEEP_SAME_ORIGIN_PROFILE_PLACEHOLDER_PATH =
  '/images/factions/hegemony/marks/hegemony-mark-128.png';

/**
 * Browser-safe public image URL policy for all untrusted identity surfaces.
 * It blocks local names and all literal IP targets before the DOM can issue a
 * request. Network-side proxies require their own DNS/redirect enforcement.
 */
export function safePublicHttpsImageUrl(value: string | undefined) {
  if (!value || value.length > 2_048) return undefined;
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== 'https:'
      || parsed.username
      || parsed.password
      || parsed.port
      || !parsed.hostname
      || unsafePublicImageHostname(parsed.hostname)
    ) return undefined;
    parsed.hash = '';
    const normalized = parsed.toString();
    return normalized.length <= 2_048 ? normalized : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The local observer never receives a profile URL. Its boolean portrait signal
 * may select only this repository-owned placeholder on the current origin.
 */
export function safeWarpkeepProfileImageUrl(value: string | undefined) {
  if (
    value === WARPKEEP_SAME_ORIGIN_PROFILE_PLACEHOLDER_PATH
    && typeof window !== 'undefined'
  ) {
    try {
      const resolved = new URL(value, window.location.origin);
      return resolved.origin === window.location.origin ? resolved.toString() : undefined;
    } catch {
      return undefined;
    }
  }
  return safePublicHttpsImageUrl(value);
}
