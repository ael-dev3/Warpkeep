import { join } from 'node:path';

/** Fixture path mirrors the actual host namespace; it is not a production override. */
export function sealedRealmsPrivateBase(home: string): string {
  return process.platform === 'linux'
    ? join(home, '.warpkeep', 'private', 'sealed-realms-v1')
    : join(home, 'Library', 'Application Support', 'Warpkeep', 'operations');
}
