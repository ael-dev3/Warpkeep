import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SEMANTIC_VERSION_PATTERN = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const PACKAGE_MANIFEST_PATH = resolve(import.meta.dirname, '..', 'package.json');

/**
 * Accept only a full semantic version so callers can safely use the result in
 * operator reports and outbound metadata such as a User-Agent header.
 */
export function parseWarpkeepPackageVersion(manifest) {
  if (
    manifest === null
    || typeof manifest !== 'object'
    || Array.isArray(manifest)
    || typeof manifest.version !== 'string'
    || !SEMANTIC_VERSION_PATTERN.test(manifest.version)
  ) {
    throw new Error('Warpkeep package version is missing or invalid.');
  }
  return manifest.version;
}

/**
 * Read the repository manifest from this module's fixed parent directory,
 * rather than from an operator-controlled working directory or path.
 */
export function readWarpkeepPackageVersion() {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(PACKAGE_MANIFEST_PATH, 'utf8'));
  } catch {
    throw new Error('Warpkeep package manifest could not be read.');
  }
  return parseWarpkeepPackageVersion(parsed);
}
