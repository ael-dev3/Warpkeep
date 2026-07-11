import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const database = process.env.WARPKEEP_SPACETIMEDB_DATABASE || 'warpkeep-89e4u';
const configuredIssuer = process.env.WARPKEEP_OIDC_ISSUER;
const sourceConfigPath = join(repositoryRoot, 'spacetimedb', 'src', 'config.ts');
const command = process.env.SPACETIME_BIN || 'spacetime';

function requireHttpsOrigin(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} is required.`);
  }
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.origin !== value || url.hostname.endsWith('.invalid')) {
    throw new Error(`${label} must be a stable public HTTPS origin.`);
  }
  return url.origin;
}

async function validateIssuerDeployment(issuer) {
  const discovery = await fetch(`${issuer}/.well-known/openid-configuration`, {
    signal: AbortSignal.timeout(10_000),
    headers: { accept: 'application/json' }
  });
  if (!discovery.ok) throw new Error('OIDC discovery is not reachable.');
  const configuration = await discovery.json();
  if (
    !configuration
    || configuration.issuer !== issuer
    || configuration.jwks_uri !== `${issuer}/.well-known/jwks.json`
  ) {
    throw new Error('OIDC discovery does not describe the configured issuer.');
  }
  const jwks = await fetch(configuration.jwks_uri, {
    signal: AbortSignal.timeout(10_000),
    headers: { accept: 'application/json' }
  });
  if (!jwks.ok) throw new Error('OIDC JWKS is not reachable.');
  const document = await jwks.json();
  if (
    !Array.isArray(document?.keys)
    || document.keys.length !== 1
    || document.keys.some(key => (
      !key
      || typeof key !== 'object'
      || 'd' in key
      || key.kty !== 'EC'
      || key.crv !== 'P-256'
      || key.alg !== 'ES256'
      || typeof key.kid !== 'string'
      || key.kid.length === 0
    ))
  ) {
    throw new Error('OIDC JWKS is missing a public-only signing key.');
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(database)) {
    throw new Error('WARPKEEP_SPACETIMEDB_DATABASE is invalid.');
  }
  if (dryRun && !configuredIssuer) {
    console.log(`Dry run: publish is blocked until WARPKEEP_OIDC_ISSUER and the module issuer are configured for ${database}.`);
    return;
  }
  const issuer = requireHttpsOrigin(configuredIssuer, 'WARPKEEP_OIDC_ISSUER');
  const sourceConfig = await readFile(sourceConfigPath, 'utf8');
  const sourceMatch = sourceConfig.match(/WARPKEEP_OIDC_ISSUER\s*=\s*'([^']+)'/);
  if (!sourceMatch || sourceMatch[1] !== issuer) {
    throw new Error('The module source issuer must exactly match WARPKEEP_OIDC_ISSUER before publishing.');
  }
  if (dryRun) {
    await validateIssuerDeployment(issuer);
    console.log(`Dry run: verified ${issuer}; would publish ${database} without deleting data.`);
    return;
  }
  if (process.env.WARPKEEP_PUBLISH_CONFIRM !== database) {
    throw new Error(`Set WARPKEEP_PUBLISH_CONFIRM=${database} after reviewing the target database; publish was not attempted.`);
  }

  await validateIssuerDeployment(issuer);
  execFileSync(command, [
    'publish',
    '--server', 'maincloud',
    '--module-path', 'spacetimedb',
    '--delete-data=never',
    '--yes=remote',
    database
  ], { cwd: repositoryRoot, stdio: 'inherit' });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Non-destructive publish was not attempted.');
  process.exitCode = 1;
});
