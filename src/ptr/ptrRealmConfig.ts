export const PTR_SPACETIME_URI = 'https://maincloud.spacetimedb.com' as const;

const DATABASE_IDENTITY = /^[a-f0-9]{64}$/u;

export type UnavailablePtrRealmConfig = Readonly<{
  availability: 'unavailable';
}>;

export type AvailablePtrRealmConfig = Readonly<{
  availability: 'available';
  enabled: true;
  spacetimeUri: typeof PTR_SPACETIME_URI;
  databaseIdentity: string;
}>;

export type PtrRealmConfig = UnavailablePtrRealmConfig | AvailablePtrRealmConfig;

type PtrRealmPublicEnvironment = Readonly<Record<string, string | undefined>>;

const UNAVAILABLE_PTR_REALM_CONFIG: UnavailablePtrRealmConfig = Object.freeze({
  availability: 'unavailable',
});

/** PTR is an explicit public build target; there is no Genesis or alias fallback. */
export function readPtrRealmConfig(
  environment: PtrRealmPublicEnvironment = import.meta.env,
): PtrRealmConfig {
  const enabled = environment.VITE_WARPKEEP_PTR_ENABLED;
  const databaseIdentity = environment.VITE_PTR_SPACETIMEDB_DATABASE;
  const configurableUri = environment.VITE_PTR_SPACETIMEDB_URI;
  if (
    enabled !== 'true'
    || typeof databaseIdentity !== 'string'
    || !DATABASE_IDENTITY.test(databaseIdentity)
    || configurableUri !== undefined
  ) return UNAVAILABLE_PTR_REALM_CONFIG;

  return Object.freeze({
    availability: 'available',
    enabled: true,
    spacetimeUri: PTR_SPACETIME_URI,
    databaseIdentity,
  });
}
