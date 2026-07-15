import { constants } from 'node:fs';
import { accessSync, lstatSync } from 'node:fs';

export const SYSTEM_UNZIP_CANDIDATES = Object.freeze({
  darwin: Object.freeze(['/usr/bin/unzip']),
  linux: Object.freeze(['/usr/bin/unzip'])
});

export function resolveAttestedSystemUnzip(options = {}) {
  const platform = options.platform ?? process.platform;
  const candidates = options.candidates ?? SYSTEM_UNZIP_CANDIDATES[platform] ?? [];
  const lstat = options.lstat ?? lstatSync;
  const access = options.access ?? accessSync;
  const failures = [];

  for (const path of candidates) {
    if (typeof path !== 'string' || !path.startsWith('/')) {
      failures.push(`${String(path)} is not absolute`);
      continue;
    }
    let details;
    try {
      details = lstat(path);
      access(path, constants.X_OK);
    } catch (error) {
      failures.push(`${path} is unavailable (${error instanceof Error ? error.message : String(error)})`);
      continue;
    }
    if (!details.isFile() || details.isSymbolicLink()) {
      failures.push(`${path} is not an ordinary non-symlink file`);
      continue;
    }
    if (typeof details.uid !== 'number' || details.uid !== 0) {
      failures.push(`${path} is not owned by root`);
      continue;
    }
    if ((details.mode & 0o022) !== 0) {
      failures.push(`${path} is group- or world-writable`);
      continue;
    }
    if ((details.mode & 0o111) === 0) {
      failures.push(`${path} has no executable bit`);
      continue;
    }
    return path;
  }

  throw new Error(
    `No attested system unzip is available for ${platform}: ${failures.join('; ') || 'no fixed candidate exists'}.`
  );
}
