console.error(
  'Refusing to publish: spacetimedb/src/config.ts still pins the fail-closed issuer https://auth.warpkeep.invalid. ' +
    'Deploy a public OIDC discovery/JWKS endpoint, replace the exact issuer in source, build, inspect the target database, and publish non-destructively by hand.',
);
process.exitCode = 1;
