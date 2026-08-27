export const GENESIS_001_LEGACY_GREATER_REALM_PRODUCTION_SEAL_PROFILE:
  'warpkeep-genesis-001-legacy-greater-realm-production-seal-v1';
export const GENESIS_001_LEGACY_GREATER_REALM_DATABASE_IDENTITY: string;

export class Genesis001LegacyGreaterRealmProductionSealError extends Error {
  readonly code: string;
}

export function requireGenesis001LegacyGreaterRealmProductionCliReadOnly(
  input: Readonly<{
    entrypoint: 'publisher' | 'import' | 'relocation' | 'bootstrap';
    arguments_: readonly string[];
  }>,
): void;
