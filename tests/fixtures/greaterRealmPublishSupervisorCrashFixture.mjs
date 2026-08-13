import { setTimeout as delay } from 'node:timers/promises';
import { chmodSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import {
  inspectGreaterRealmPublishSupervisor,
  planGreaterRealmPublishSupervisor,
} from '../../scripts/publish-spacetime-dev.mjs';

const [mode, supervisorRoot] = process.argv.slice(2);
const crashBoundary = mode?.startsWith('gate-consumed-')
  ? mode.slice('gate-consumed-'.length)
  : undefined;
const crashAfterSpawnAuthorized = mode === 'spawn-authorized';
if (
  !['pre-gate', 'post-gate', 'direct-waiting'].includes(mode)
  && !crashAfterSpawnAuthorized
  && !['temporary-created', 'linked', 'post-unlink'].includes(crashBoundary)
  || supervisorRoot === undefined
) {
  throw new Error('GREATER_REALM_PUBLISH_SUPERVISOR_FIXTURE_USAGE');
}

const fixtureRoot = dirname(supervisorRoot);
const cliConfigPath = join(fixtureRoot, 'cli.toml');
const executablePath = join(fixtureRoot, 'fixture-spacetime');
writeFileSync(cliConfigPath, 'spacetimedb_token = "test-only-token"\n', { mode: 0o600 });
writeFileSync(executablePath, '#!/bin/sh\n/bin/sleep 30\n', { mode: 0o500 });
chmodSync(cliConfigPath, 0o600);
chmodSync(executablePath, 0o500);
const plan = planGreaterRealmPublishSupervisor(
  supervisorRoot,
  cliConfigPath,
  crashBoundary === undefined
    ? (crashAfterSpawnAuthorized
        ? { state: 'spawn-authorized', boundary: 'final-installed' }
        : undefined)
    : { state: 'gate-consumed', boundary: crashBoundary },
);
plan.allocate();
if (crashAfterSpawnAuthorized) {
  process.stdout.write(`${JSON.stringify(plan.identity)}\n`);
}
await plan.start(executablePath, []);
if (!crashAfterSpawnAuthorized) process.stdout.write(`${JSON.stringify(plan.identity)}\n`);
if (mode === 'post-gate' || crashBoundary !== undefined) {
  await plan.release();
}
if (mode === 'post-gate') {
  for (;;) {
    const inspection = inspectGreaterRealmPublishSupervisor(plan.identity);
    if (inspection.status.state === 'gate-consumed') break;
    await delay(10);
  }
}
if (crashBoundary !== undefined) {
  for (;;) {
    if (plan.executionState().closed !== undefined || plan.executionState().error !== undefined) {
      break;
    }
    await delay(10);
  }
  process.exit(0);
}
await delay(60 * 60 * 1_000);
