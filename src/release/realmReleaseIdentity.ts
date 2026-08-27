/** Exact player-facing identities for the owner-approved sealed 0.4.0 launch. */
export const WARPKEEP_LAUNCHER_RELEASE_VERSION = '0.4.0' as const;
export const GENESIS_001_PRESERVED_RELEASE_VERSION = '0.3.43' as const;
export const GENESIS_002_SEALED_RELEASE_VERSION = '0.4.0' as const;

export const GENESIS_001_RELEASE_STATE = 'preserved-player-access' as const;
export const GENESIS_002_RELEASE_STATE = 'sealed-no-player-access' as const;

export const SEALED_LAUNCH_REALM_SUMMARY =
  'Genesis 001 is preserved at 0.3.43. Genesis 002 is sealed at 0.4.0, and new admissions are suspended.';
