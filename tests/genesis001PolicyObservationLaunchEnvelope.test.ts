// @vitest-environment node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const repositoryRoot = resolve(import.meta.dirname, '..');
const legacyEnvelopePath = resolve(
  repositoryRoot,
  'docs/operations/greater-realm-production-launch-envelope.sh.txt',
);
const observationEnvelopePath = resolve(
  repositoryRoot,
  'docs/operations/genesis-001-policy-observation-launch-envelope.sh.txt',
);

const LEGACY_SHA256 =
  'ffaa86e602b08d5a3b5994120a822194860b64d8ee117dea4d454b28fde7594a';
const BODY_MARKER = Buffer.from('set -eu\n');
const OBSERVATION_HEADER = Buffer.from(
  [
    '# GENESIS 001 POLICY OBSERVATION - SEALED 0.4.0',
    '#',
    '# Dedicated review copy. The only production operator admitted by this envelope',
    '# is the read-only `g001-policy-observe` command. The only other admitted rows',
    '# are local launch-lifecycle inspection and confirmed cleanup; neither opens a',
    '# credential or network boundary.',
    '#',
    '# This file is a review copy, not an executable. The supported production',
    '# invocation supplies these exact bytes from the protected S release packet to:',
    "#   /usr/bin/env -i /bin/sh -c '<EXACT_REVIEWED_TEXT>' warpkeep-production \\",
    '#     PROTECTED_MAIN_40 TREE_40 BOOTSTRAP_BLOB_40 BOOTSTRAP_SHA256_64 \\',
    '#     ABSOLUTE_SIGNED_NODE ABSOLUTE_SPACETIME_OR_DASH \\',
    '#     ABSOLUTE_SPACETIME_CLI_CONFIG_OR_DASH ABSOLUTE_ADMIN_SECRET \\',
    '#     ABSOLUTE_NOTIFICATION_SECRET_OR_DASH ABSOLUTE_PRIVATE_INPUT_OR_DASH \\',
    '#     COMMAND [COMMAND_ARGUMENTS...]',
    '# `g001-policy-observe` takes no command arguments and requires only the signed',
    '# Node runtime plus the owner-private administrator-secret path. Spacetime,',
    '# Spacetime CLI configuration, notification-secret, and private-input slots are',
    '# all `-`.',
    '# The local lifecycle rows use six `-` runtime/credential slots:',
    '#     launch-run-inspect [RUN_ID]',
    '#     launch-run-cleanup RUN_ID CONFIRMATION_DIGEST',
    '# Run the production operator only while S remains protected remote main. Its',
    '# receipt becomes eligible only after the enclosing bootstrap succeeds,',
    '# postflight completes, and cleanup is confirmed. Use the lifecycle rows to',
    '# inspect or recover an interrupted run.',
    '# Never execute this file by pathname from a mutable checkout.',
    '',
  ].join('\n'),
  'utf8',
);

const OUTER_ALLOWLIST = Buffer.from(
  '  import-inspect|import-apply|import-recover-inspect|import-recover|publish|publish-recover-inspect|publish-recover|relocation|relocation-recover-inspect|relocation-recover|verify|pages-active-evidence|hermes-list-pending|hermes-admit-dry|hermes-admit-confirm|hermes-allow-dry|hermes-allow-confirm|hermes-notification-inspect|hermes-notification-recover-dry|hermes-notification-recover-confirm|launch-run-inspect|launch-run-cleanup) ;;',
);
const OBSERVATION_ALLOWLIST = Buffer.from(
  '  g001-policy-observe|launch-run-inspect|launch-run-cleanup) ;;',
);
const ADMIN_REQUIRED_ARM = Buffer.from(
  '  import-inspect|import-apply|publish|relocation|verify|pages-active-evidence|hermes-list-pending|hermes-admit-confirm|hermes-allow-confirm|hermes-notification-recover-dry|hermes-notification-recover-confirm)',
);
const OBSERVATION_ADMIN_REQUIRED_ARM = Buffer.from(
  '  g001-policy-observe)',
);
const LEGACY_ZERO_ARGUMENT_ARM = Buffer.from('  hermes-list-pending)\n');
const OBSERVATION_ZERO_ARGUMENT_ARM = Buffer.from(
  '  g001-policy-observe)\n',
);

function countBytes(haystack: Buffer, needle: Buffer): number {
  let count = 0;
  let offset = 0;
  while (offset <= haystack.byteLength - needle.byteLength) {
    const index = haystack.indexOf(needle, offset);
    if (index < 0) break;
    count += 1;
    offset = index + needle.byteLength;
  }
  return count;
}

function replaceUnique(
  input: Buffer,
  before: Buffer,
  after: Buffer,
): Buffer {
  expect(countBytes(input, before)).toBe(1);
  const index = input.indexOf(before);
  return Buffer.concat([
    input.subarray(0, index),
    after,
    input.subarray(index + before.byteLength),
  ]);
}

function reconstructObservationEnvelope(legacy: Buffer): Buffer {
  expect(countBytes(legacy, BODY_MARKER)).toBe(1);
  const bodyOffset = legacy.indexOf(BODY_MARKER);
  let body = legacy.subarray(bodyOffset);
  body = replaceUnique(body, OUTER_ALLOWLIST, OBSERVATION_ALLOWLIST);
  body = replaceUnique(
    body,
    ADMIN_REQUIRED_ARM,
    OBSERVATION_ADMIN_REQUIRED_ARM,
  );
  body = replaceUnique(
    body,
    LEGACY_ZERO_ARGUMENT_ARM,
    OBSERVATION_ZERO_ARGUMENT_ARM,
  );
  return Buffer.concat([OBSERVATION_HEADER, body]);
}

function invokePreflight(
  preflightPath: string,
  command: string,
  slots: readonly string[],
  commandArguments: readonly string[] = [],
) {
  return spawnSync('/bin/sh', [
    preflightPath,
    '1'.repeat(40),
    '2'.repeat(40),
    '3'.repeat(40),
    '4'.repeat(64),
    ...slots,
    command,
    ...commandArguments,
  ], {
    encoding: 'utf8',
    env: { PATH: '/usr/bin:/bin' },
    timeout: 10_000,
  });
}

describe('Genesis 001 policy-observation launch envelope', () => {
  let envelope: Buffer;
  let preflightPath: string;
  let temporaryRoot: string;

  beforeAll(() => {
    const legacy = readFileSync(legacyEnvelopePath);
    expect(createHash('sha256').update(legacy).digest('hex')).toBe(
      LEGACY_SHA256,
    );
    expect(legacy.filter(byte => byte === 13)).toHaveLength(1);

    expect(existsSync(observationEnvelopePath)).toBe(true);
    envelope = existsSync(observationEnvelopePath)
      ? readFileSync(observationEnvelopePath)
      : Buffer.alloc(0);
    expect(envelope.equals(reconstructObservationEnvelope(legacy))).toBe(true);
    expect(envelope.filter(byte => byte === 13)).toHaveLength(1);

    temporaryRoot = mkdtempSync(resolve(tmpdir(), 'warpkeep-g001-observe-envelope-'));
    preflightPath = resolve(temporaryRoot, 'preflight.sh');
    const preflightEnd = envelope.indexOf(Buffer.from('account_home=$('));
    expect(preflightEnd).toBeGreaterThan(0);
    writeFileSync(
      preflightPath,
      Buffer.concat([
        envelope.subarray(0, preflightEnd),
        Buffer.from('exit 0\n'),
      ]),
      { mode: 0o700 },
    );
    chmodSync(preflightPath, 0o700);
  });

  afterAll(() => {
    if (temporaryRoot !== undefined) {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('is valid POSIX shell', () => {
    const syntax = spawnSync('/bin/sh', ['-n', observationEnvelopePath], {
      encoding: 'utf8',
      timeout: 10_000,
    });
    expect({ status: syntax.status, stderr: syntax.stderr }).toEqual({
      status: 0,
      stderr: '',
    });
  });

  it('admits only the observer and two local lifecycle commands at the outer boundary', () => {
    const observerSlots = [
      '/absolute/signed-node',
      '-',
      '-',
      '/absolute/admin-secret',
      '-',
      '-',
    ];
    const lifecycleSlots = ['-', '-', '-', '-', '-', '-'];

    expect(invokePreflight(
      preflightPath,
      'g001-policy-observe',
      observerSlots,
    ).status).toBe(0);
    expect(invokePreflight(
      preflightPath,
      'launch-run-inspect',
      lifecycleSlots,
    ).status).toBe(0);
    expect(invokePreflight(
      preflightPath,
      'launch-run-cleanup',
      lifecycleSlots,
      [`run-${'a'.repeat(32)}`, 'b'.repeat(64)],
    ).status).toBe(0);

    for (const command of [
      'import-inspect',
      'import-apply',
      'import-recover-inspect',
      'import-recover',
      'publish',
      'publish-recover-inspect',
      'publish-recover',
      'relocation',
      'relocation-recover-inspect',
      'relocation-recover',
      'verify',
      'pages-active-evidence',
      'hermes-list-pending',
      'hermes-admit-dry',
      'hermes-admit-confirm',
      'hermes-allow-dry',
      'hermes-allow-confirm',
      'hermes-notification-inspect',
      'hermes-notification-recover-dry',
      'hermes-notification-recover-confirm',
      'unknown-command',
    ]) {
      const result = invokePreflight(
        preflightPath,
        command,
        observerSlots,
      );
      expect(result.status, command).toBe(1);
      expect(result.stderr, command).toMatch(
        /GENESIS_001_LEGACY_GREATER_REALM_PRODUCTION_MUTATION_SEALED|GREATER_REALM_PRODUCTION_LAUNCH_ARGUMENTS_INVALID/u,
      );
    }
  });

  it('requires zero observer arguments, the admin path, and only dash auxiliary slots', () => {
    const valid = [
      '/absolute/signed-node',
      '-',
      '-',
      '/absolute/admin-secret',
      '-',
      '-',
    ];
    const invalidSlots = [
      ['-', '-', '-', '/absolute/admin-secret', '-', '-'],
      ['/absolute/signed-node', '/absolute/spacetime', '-', '/absolute/admin-secret', '-', '-'],
      ['/absolute/signed-node', '-', '/absolute/config', '/absolute/admin-secret', '-', '-'],
      ['/absolute/signed-node', '-', '-', '-', '-', '-'],
      ['/absolute/signed-node', '-', '-', '/absolute/admin-secret', '/absolute/notification', '-'],
      ['/absolute/signed-node', '-', '-', '/absolute/admin-secret', '-', '/absolute/private-input'],
    ];

    for (const slots of invalidSlots) {
      const result = invokePreflight(
        preflightPath,
        'g001-policy-observe',
        slots,
      );
      expect(result.status, slots.join(':')).toBe(1);
      expect(result.stderr, slots.join(':')).toContain(
        'GREATER_REALM_PRODUCTION_LAUNCH_ARGUMENTS_INVALID',
      );
    }
    const extraArgument = invokePreflight(
      preflightPath,
      'g001-policy-observe',
      valid,
      ['unexpected'],
    );
    expect(extraArgument.status).toBe(1);
    expect(extraArgument.stderr).toContain(
      'GREATER_REALM_PRODUCTION_LAUNCH_ARGUMENTS_INVALID',
    );
  });

  it('requires all six runtime and credential slots to be dashes for lifecycle recovery', () => {
    for (const command of ['launch-run-inspect', 'launch-run-cleanup']) {
      for (let index = 0; index < 6; index += 1) {
        const slots = ['-', '-', '-', '-', '-', '-'];
        slots[index] = '/absolute/unexpected';
        const commandArguments = command === 'launch-run-cleanup'
          ? [`run-${'a'.repeat(32)}`, 'b'.repeat(64)]
          : [];
        const result = invokePreflight(
          preflightPath,
          command,
          slots,
          commandArguments,
        );
        expect(result.status, `${command}:${index}`).toBe(1);
        expect(result.stderr, `${command}:${index}`).toContain(
          'GREATER_REALM_PRODUCTION_LAUNCH_ARGUMENTS_INVALID',
        );
      }
    }
  });
});
