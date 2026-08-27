export const GENESIS_001_LEGACY_GREATER_REALM_PRODUCTION_SEAL_PROFILE =
  'warpkeep-genesis-001-legacy-greater-realm-production-seal-v1';
export const GENESIS_001_LEGACY_GREATER_REALM_DATABASE_IDENTITY =
  'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e';

const SEALED_ERROR =
  'GENESIS_001_LEGACY_GREATER_REALM_PRODUCTION_MUTATION_SEALED';
const BOOTSTRAP_MUTATIONS = new Set([
  'hermes-admit-confirm',
  'hermes-admit-dry',
  'hermes-allow-confirm',
  'hermes-allow-dry',
  'hermes-list-pending',
  'hermes-notification-recover-confirm',
  'hermes-notification-recover-dry',
  'import-apply',
  'import-recover',
  'publish',
  'publish-recover',
  'relocation-recover',
]);
const RELOCATION_MUTATIONS = new Set([
  'prepare',
  'begin-drain',
  'freeze',
  'plan',
  'canary',
  'commit',
  'halt',
  'resume',
  'rollback',
  'recover',
]);

export class Genesis001LegacyGreaterRealmProductionSealError extends Error {
  constructor(code) {
    super(code);
    this.name = 'Genesis001LegacyGreaterRealmProductionSealError';
    this.code = code;
  }
}

function fail() {
  throw new Genesis001LegacyGreaterRealmProductionSealError(SEALED_ERROR);
}

/**
 * Source-bound executable gate for the superseded G001 Greater Realm lane.
 * Callers invoke this as the first statement of their CLI main, before private
 * workspace inspection, credentials, child processes, network, or writes.
 */
export function requireGenesis001LegacyGreaterRealmProductionCliReadOnly({
  entrypoint,
  arguments_,
}) {
  if (
    !['publisher', 'import', 'relocation', 'bootstrap'].includes(entrypoint)
    || !Array.isArray(arguments_)
    || arguments_.some(argument => typeof argument !== 'string')
  ) fail();

  const command = entrypoint === 'bootstrap' ? arguments_[12] : arguments_[0];
  if (entrypoint === 'publisher') {
    if (command !== 'recover-inspect') fail();
    return;
  }
  if (entrypoint === 'import') {
    if (command === 'apply' || command === 'recover') fail();
    return;
  }
  if (entrypoint === 'relocation') {
    if (RELOCATION_MUTATIONS.has(command)) fail();
    return;
  }
  if (
    BOOTSTRAP_MUTATIONS.has(command)
    || (command === 'relocation' && arguments_[13] !== 'inspect')
  ) fail();
}
