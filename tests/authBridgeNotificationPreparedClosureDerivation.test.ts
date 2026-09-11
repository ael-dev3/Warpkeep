// @vitest-environment node

import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  assertAuthBridgeNotificationPreparedDeployClosureAuthority,
  AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MANIFEST_PATH,
  AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MEMBER_PATHS,
  deriveAuthBridgeNotificationPreparedDeployClosure,
  verifyAuthBridgeNotificationPreparedDeployClosure,
} from '../scripts/auth-bridge-notification-prepared-deploy-closure.mjs';
import {
  AUTH_BRIDGE_RELEASE_TRANSITION_FIXTURE_PATHS,
  canonicalAuthBridgeReleaseTransitionFixtureSource,
} from './helpers/authBridgeReleaseTransitionFixture';

const repositoryRoot = process.cwd();
const PROFILE = 'warpkeep-auth-bridge-notification-prepared-deploy-closure-v1';
const ZERO_SHA256 = '0'.repeat(64);
const MAX_MEMBER_BYTES = 4 * 1_024 * 1_024;
const MAX_AGGREGATE_BYTES = 128 * 1_024 * 1_024;
const RAW_FILE_DIGEST_PROFILE = 'raw-file-sha256-v1';
const BOOTSTRAP_PIN_DIGEST_PROFILE =
  'bootstrap-pin-projection-sha256-v1';
const REVIEWED_RELEASE_TRANSITION_DIGEST_PROFILE =
  'reviewed-release-transition-projection-sha256-v1';
const REVIEWED_RELEASE_TRANSITION_PLUS_BOOTSTRAP_PIN_DIGEST_PROFILE =
  'reviewed-release-transition-plus-bootstrap-pin-projection-sha256-v1';
const BOOTSTRAP_BINDINGS = Object.freeze([
  Object.freeze({
    name: 'WARPKEEP_PREPARED_SOURCE_CLOSURE_VERIFIER_SHA256',
    path: 'scripts/auth-bridge-notification-prepared-deploy-closure.mjs',
  }),
  Object.freeze({
    name: 'WARPKEEP_PREPARED_SOURCE_CLOSURE_MANIFEST_SHA256',
    path: AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MANIFEST_PATH,
  }),
  Object.freeze({
    name: 'WARPKEEP_PREPARED_INSTALLED_TOOLCHAIN_VERIFIER_SHA256',
    path: 'scripts/auth-bridge-notification-prepared-installed-toolchain.mjs',
  }),
  Object.freeze({
    name: 'WARPKEEP_PREPARED_INSTALLED_TOOLCHAIN_MANIFEST_SHA256',
    path:
      'scripts/auth-bridge-notification-prepared-installed-toolchain-darwin-arm64-v1.json',
  }),
  Object.freeze({
    name: 'WARPKEEP_PREPARED_PNPM_AUTHORITY_MANIFEST_SHA256',
    path: 'scripts/auth-bridge-notification-prepared-pnpm-linux-x64-v1.json',
  }),
  Object.freeze({
    name: 'WARPKEEP_PREPARED_LINUX_INSTALLED_TOOLCHAIN_MANIFEST_SHA256',
    path:
      'scripts/auth-bridge-notification-prepared-installed-toolchain-linux-x64-v1.json',
  }),
  Object.freeze({
    name: 'WARPKEEP_NOTIFICATION_PAGES_PROTECTED_DEPLOY_LAUNCHER_SHA256',
    path: 'scripts/notification-pages-private-deploy-launcher.mjs',
  }),
]);
const BOOTSTRAP_WORKFLOWS = Object.freeze({
  '.github/workflows/deploy-pages.yml': Object.freeze({
    indentation: '  ',
    names: [
      ...BOOTSTRAP_BINDINGS.slice(0, 4).map(binding => binding.name),
      BOOTSTRAP_BINDINGS[6].name,
    ],
  }),
  '.github/workflows/notification-bridge-b0.yml': Object.freeze({
    indentation: '      ',
    names: BOOTSTRAP_BINDINGS.slice(0, 4).map(binding => binding.name),
  }),
  '.github/workflows/notification-bridge-prepared.yml': Object.freeze({
    indentation: '      ',
    names: BOOTSTRAP_BINDINGS.slice(0, 4).map(binding => binding.name),
  }),
  '.github/workflows/notification-bridge-prepared-linux.yml': Object.freeze({
    indentation: '      ',
    names: [
      ...BOOTSTRAP_BINDINGS.slice(0, 3).map(binding => binding.name),
      BOOTSTRAP_BINDINGS[5].name,
      BOOTSTRAP_BINDINGS[4].name,
    ],
  }),
});
const workflowPaths = Object.keys(BOOTSTRAP_WORKFLOWS).sort();
const temporaryDirectories: string[] = [];
let fixtureMemberBodies: ReadonlyMap<string, Uint8Array>;
let expectedFixtureManifestBytes: Buffer;

function sha256(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function replaceOnly(source: string, pattern: RegExp, replacement: string): string {
  const matches = [...source.matchAll(pattern)];
  if (matches.length !== 1) throw new Error('fixture replacement was not exact');
  return source.replace(pattern, replacement);
}

function fixtureDigestProfile(relativePath: string): string {
  const release = AUTH_BRIDGE_RELEASE_TRANSITION_FIXTURE_PATHS.has(relativePath);
  const workflow = relativePath in BOOTSTRAP_WORKFLOWS;
  if (release && workflow) {
    return REVIEWED_RELEASE_TRANSITION_PLUS_BOOTSTRAP_PIN_DIGEST_PROFILE;
  }
  if (release) return REVIEWED_RELEASE_TRANSITION_DIGEST_PROFILE;
  if (workflow) return BOOTSTRAP_PIN_DIGEST_PROFILE;
  return RAW_FILE_DIGEST_PROFILE;
}

function zeroPinFixtureBody(relativePath: string, body: Uint8Array): Buffer {
  const workflow = BOOTSTRAP_WORKFLOWS[
    relativePath as keyof typeof BOOTSTRAP_WORKFLOWS
  ];
  if (workflow === undefined) return Buffer.from(body);
  let source = new TextDecoder('utf-8', { fatal: true }).decode(body);
  for (const name of workflow.names) {
    source = replaceOnly(
      source,
      new RegExp(`^${workflow.indentation}${name}: '[a-f0-9]{64}'$`, 'gmu'),
      `${workflow.indentation}${name}: '${ZERO_SHA256}'`,
    );
  }
  return Buffer.from(source, 'utf8');
}

function independentlyDeriveManifestBytes(
  memberBodies: ReadonlyMap<string, Uint8Array>,
): Buffer {
  const members = AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MEMBER_PATHS.map(
    relativePath => {
      const body = memberBodies.get(relativePath);
      if (body === undefined) throw new Error(`fixture member ${relativePath} missing`);
      return {
        path: relativePath,
        digestProfile: fixtureDigestProfile(relativePath),
        sha256: sha256(zeroPinFixtureBody(relativePath, body)),
      };
    },
  );
  return Buffer.from(`${JSON.stringify({
    schemaVersion: 2,
    profile: PROFILE,
    members,
  }, null, 2)}\n`, 'utf8');
}

function expectedWorkflowBodies(
  memberBodies: ReadonlyMap<string, Uint8Array>,
  manifestBytes: Uint8Array,
): Array<{ path: string; bytes: Uint8Array }> {
  const pins = new Map(BOOTSTRAP_BINDINGS.map(binding => {
    if (binding.path === AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MANIFEST_PATH) {
      return [binding.name, sha256(manifestBytes)] as const;
    }
    const body = memberBodies.get(binding.path);
    if (body === undefined) throw new Error(`fixture pin source ${binding.path} missing`);
    return [binding.name, sha256(body)] as const;
  }));
  return workflowPaths.map(relativePath => {
    const body = memberBodies.get(relativePath);
    if (body === undefined) throw new Error(`fixture workflow ${relativePath} missing`);
    const workflow = BOOTSTRAP_WORKFLOWS[
      relativePath as keyof typeof BOOTSTRAP_WORKFLOWS
    ];
    let source = new TextDecoder('utf-8', { fatal: true }).decode(body);
    for (const name of workflow.names) {
      const expected = pins.get(name);
      if (expected === undefined) throw new Error(`fixture pin ${name} missing`);
      source = replaceOnly(
        source,
        new RegExp(`^${workflow.indentation}${name}: '[a-f0-9]{64}'$`, 'gmu'),
        `${workflow.indentation}${name}: '${expected}'`,
      );
    }
    return { path: relativePath, bytes: Buffer.from(source, 'utf8') };
  });
}

function mutableFixture(): Map<string, Uint8Array> {
  return new Map(fixtureMemberBodies);
}

function replaceMember(
  members: Map<string, Uint8Array>,
  relativePath: string,
  transform: (source: string) => string,
): void {
  const body = members.get(relativePath);
  if (body === undefined) throw new Error(`fixture member ${relativePath} missing`);
  members.set(relativePath, Buffer.from(transform(Buffer.from(body).toString('utf8'))));
}

function writeFixture(
  memberBodies: ReadonlyMap<string, Uint8Array>,
  manifestBytes: Uint8Array,
): string {
  const root = mkdtempSync(join(tmpdir(), 'warpkeep-prepared-derive-'));
  temporaryDirectories.push(root);
  for (const [relativePath, body] of memberBodies) {
    const path = resolve(root, relativePath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, body, { mode: 0o600 });
  }
  const manifestPath = resolve(root, AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MANIFEST_PATH);
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, manifestBytes, { mode: 0o600 });
  return root;
}

beforeAll(() => {
  fixtureMemberBodies = new Map(
    AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MEMBER_PATHS.map(relativePath => {
      const body = readFileSync(resolve(repositoryRoot, relativePath));
      if (!AUTH_BRIDGE_RELEASE_TRANSITION_FIXTURE_PATHS.has(relativePath)) {
        return [relativePath, body] as const;
      }
      return [relativePath, Buffer.from(
        canonicalAuthBridgeReleaseTransitionFixtureSource(
          relativePath,
          body.toString('utf8'),
        ),
        'utf8',
      )] as const;
    }),
  );
  expectedFixtureManifestBytes = independentlyDeriveManifestBytes(fixtureMemberBodies);
});

afterEach(() => {
  for (const path of temporaryDirectories.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe('prepared deploy closure derivation', () => {
  it('derives the independently generated current-inventory manifest and convergent workflows', () => {
    const first = deriveAuthBridgeNotificationPreparedDeployClosure({
      memberBodies: fixtureMemberBodies,
    });
    expect(first.profile).toBe(PROFILE);
    expect(first.memberCount).toBe(AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MEMBER_PATHS.length);
    expect(first.manifestBytes).toEqual(expectedFixtureManifestBytes);
    expect(first.manifestSha256).toBe(sha256(expectedFixtureManifestBytes));
    expect(first.workflowBodies).toEqual(
      expectedWorkflowBodies(fixtureMemberBodies, expectedFixtureManifestBytes),
    );
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.workflowBodies)).toBe(true);
    expect(first.workflowBodies.every(member => Object.isFrozen(member))).toBe(true);
    expect(first.manifestBytes.byteLength).toBeLessThanOrEqual(256 * 1_024);

    const installed = new Map(fixtureMemberBodies);
    for (const member of first.workflowBodies) installed.set(member.path, member.bytes);
    const second = deriveAuthBridgeNotificationPreparedDeployClosure({ memberBodies: installed });
    expect(second.manifestBytes).toEqual(first.manifestBytes);
    expect(second.manifestBytes).not.toBe(first.manifestBytes);
    expect(second.workflowBodies).toEqual(first.workflowBodies);
    for (let index = 0; index < second.workflowBodies.length; index += 1) {
      expect(second.workflowBodies[index].bytes).not.toBe(first.workflowBodies[index].bytes);
    }
    expect(() => assertAuthBridgeNotificationPreparedDeployClosureAuthority(
      first as never,
      { repositoryRoot },
    )).toThrow();
  });

  it('uses all four fixed digest profiles in canonical member order', () => {
    const closure = deriveAuthBridgeNotificationPreparedDeployClosure({
      memberBodies: fixtureMemberBodies,
    });
    const manifest = JSON.parse(Buffer.from(closure.manifestBytes).toString('utf8')) as {
      members: Array<{ path: string; digestProfile: string }>;
    };
    expect(manifest.members.map(member => member.path)).toEqual(
      AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MEMBER_PATHS,
    );
    expect(new Set(manifest.members.map(member => member.digestProfile))).toEqual(new Set([
      RAW_FILE_DIGEST_PROFILE,
      BOOTSTRAP_PIN_DIGEST_PROFILE,
      REVIEWED_RELEASE_TRANSITION_DIGEST_PROFILE,
      REVIEWED_RELEASE_TRANSITION_PLUS_BOOTSTRAP_PIN_DIGEST_PROFILE,
    ]));
  });

  it('derives the same fixture from the checkout accepted phase and canonical C0', () => {
    const checkoutBodies = new Map(
      AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MEMBER_PATHS.map(
        relativePath => [
          relativePath,
          readFileSync(resolve(repositoryRoot, relativePath)),
        ] as const,
      ),
    );
    const checkout = deriveAuthBridgeNotificationPreparedDeployClosure({
      memberBodies: checkoutBodies,
    });
    const canonical = deriveAuthBridgeNotificationPreparedDeployClosure({
      memberBodies: fixtureMemberBodies,
    });
    expect(checkout.manifestBytes).toEqual(canonical.manifestBytes);
  });

  it('repairs stale well-formed workflow pins while preserving unrelated bytes', () => {
    const stale = mutableFixture();
    for (const relativePath of workflowPaths) {
      replaceMember(stale, relativePath, source => source.replace(
        /^(\s*WARPKEEP_[A-Z0-9_]+_SHA256): '[a-f0-9]{64}'$/gmu,
        `$1: '${ZERO_SHA256}'`,
      ));
    }
    const closure = deriveAuthBridgeNotificationPreparedDeployClosure({ memberBodies: stale });
    expect(closure.manifestBytes).toEqual(expectedFixtureManifestBytes);
    expect(closure.workflowBodies).toEqual(
      expectedWorkflowBodies(stale, expectedFixtureManifestBytes),
    );
  });

  it('changes a workflow digest for an unrelated byte mutation', () => {
    const changed = mutableFixture();
    const workflowPath = '.github/workflows/notification-bridge-b0.yml';
    replaceMember(changed, workflowPath, source => `${source}\n# derivation fixture mutation\n`);
    const baseline = deriveAuthBridgeNotificationPreparedDeployClosure({
      memberBodies: fixtureMemberBodies,
    });
    const mutated = deriveAuthBridgeNotificationPreparedDeployClosure({ memberBodies: changed });
    const digest = (bytes: Uint8Array): string => {
      const manifest = JSON.parse(Buffer.from(bytes).toString('utf8')) as {
        members: Array<{ path: string; sha256: string }>;
      };
      const member = manifest.members.find(value => value.path === workflowPath);
      if (member === undefined) throw new Error('fixture manifest workflow missing');
      return member.sha256;
    };
    expect(digest(mutated.manifestBytes)).not.toBe(digest(baseline.manifestBytes));
  });

  it.each([
    ['missing', (source: string) => source.replace(
      /^\s*WARPKEEP_PREPARED_SOURCE_CLOSURE_VERIFIER_SHA256: '[a-f0-9]{64}'\n/mu,
      '',
    )],
    ['duplicate', (source: string) => `${source}\n      WARPKEEP_PREPARED_SOURCE_CLOSURE_VERIFIER_SHA256: '${'b'.repeat(64)}'\n`],
    ['unexpected', (source: string) => `${source}\n      WARPKEEP_NOTIFICATION_PAGES_PROTECTED_DEPLOY_LAUNCHER_SHA256: '${'c'.repeat(64)}'\n`],
  ])('rejects a %s workflow pin declaration', (_name, transform) => {
    const members = mutableFixture();
    replaceMember(members, '.github/workflows/notification-bridge-b0.yml', transform);
    expect(() => deriveAuthBridgeNotificationPreparedDeployClosure({ memberBodies: members }))
      .toThrow('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_BOOTSTRAP_INVALID');
  });

  it('rejects an inconsistent release phase instead of canonicalizing it', () => {
    const members = mutableFixture();
    replaceMember(members, 'spacetimedb/src/greaterRealmV17Policy.ts', source => source.replace(
      'export const GREATER_REALM_V17_IMPORT_MUTATIONS_ALLOWED = false;',
      'export const GREATER_REALM_V17_IMPORT_MUTATIONS_ALLOWED = true;',
    ));
    expect(() => deriveAuthBridgeNotificationPreparedDeployClosure({ memberBodies: members }))
      .toThrow('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_RELEASE_PHASE_INVALID');
  });

  it('rejects missing, extra, malformed and wrong-namespace members before projection', () => {
    const missing = mutableFixture();
    missing.delete('package.json');
    expect(() => deriveAuthBridgeNotificationPreparedDeployClosure({ memberBodies: missing }))
      .toThrow('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_MEMBER_SET_INVALID');

    const extra = mutableFixture();
    extra.set('scripts/not-in-the-fixed-inventory.mjs', Buffer.from('export {};\n'));
    expect(() => deriveAuthBridgeNotificationPreparedDeployClosure({ memberBodies: extra }))
      .toThrow('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_MEMBER_SET_INVALID');

    const malformed = mutableFixture();
    malformed.delete('package.json');
    malformed.set('scripts/../package.json', Buffer.from('{}\n'));
    expect(() => deriveAuthBridgeNotificationPreparedDeployClosure({ memberBodies: malformed }))
      .toThrow('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_MEMBER_SET_INVALID');

    const namespace = mutableFixture();
    namespace.delete('package.json');
    namespace.set('private/package.json', Buffer.from('{}\n'));
    expect(() => deriveAuthBridgeNotificationPreparedDeployClosure({ memberBodies: namespace }))
      .toThrow('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_MEMBER_SET_INVALID');
  });

  it('rejects non-byte, empty, oversized and aggregate-oversized bodies', () => {
    const nonByte = mutableFixture();
    nonByte.set('src/styles/global.css', 'not bytes' as unknown as Uint8Array);
    expect(() => deriveAuthBridgeNotificationPreparedDeployClosure({ memberBodies: nonByte }))
      .toThrow('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_MEMBER_INVALID');

    const empty = mutableFixture();
    empty.set('src/styles/global.css', new Uint8Array());
    expect(() => deriveAuthBridgeNotificationPreparedDeployClosure({ memberBodies: empty }))
      .toThrow('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_MEMBER_INVALID');

    const oversized = mutableFixture();
    oversized.set('src/styles/global.css', new Uint8Array(MAX_MEMBER_BYTES + 1));
    expect(() => deriveAuthBridgeNotificationPreparedDeployClosure({ memberBodies: oversized }))
      .toThrow('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_MEMBER_INVALID');

    const aggregate = mutableFixture();
    const replaceablePaths = AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MEMBER_PATHS
      .filter(relativePath => (
        !AUTH_BRIDGE_RELEASE_TRANSITION_FIXTURE_PATHS.has(relativePath)
        && !(relativePath in BOOTSTRAP_WORKFLOWS)
      ));
    const shared = new Uint8Array(
      Math.ceil(MAX_AGGREGATE_BYTES / replaceablePaths.length) + 1,
    );
    for (const relativePath of AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MEMBER_PATHS) {
      if (
        !AUTH_BRIDGE_RELEASE_TRANSITION_FIXTURE_PATHS.has(relativePath)
        && !(relativePath in BOOTSTRAP_WORKFLOWS)
      ) aggregate.set(relativePath, shared);
    }
    expect(() => deriveAuthBridgeNotificationPreparedDeployClosure({ memberBodies: aggregate }))
      .toThrow('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_MEMBER_INVALID');
  });

  it('rejects malformed UTF-8 wherever a text projection is required', () => {
    const release = mutableFixture();
    release.set('package.json', new Uint8Array([0xc3, 0x28]));
    expect(() => deriveAuthBridgeNotificationPreparedDeployClosure({ memberBodies: release }))
      .toThrow('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_RELEASE_SOURCE_INVALID');

    const workflow = mutableFixture();
    workflow.set('.github/workflows/notification-bridge-b0.yml', new Uint8Array([0xc3, 0x28]));
    expect(() => deriveAuthBridgeNotificationPreparedDeployClosure({ memberBodies: workflow }))
      .toThrow('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_BOOTSTRAP_INVALID');
  });

  it('accepts only the memberBodies option', () => {
    expect(() => deriveAuthBridgeNotificationPreparedDeployClosure({
      memberBodies: fixtureMemberBodies,
      repositoryRoot,
    } as never)).toThrow('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_MEMBER_SET_INVALID');
  });

  it('does not mutate or alias caller bytes and returns fresh output bytes', () => {
    const members = mutableFixture();
    const inputHashes = new Map([...members].map(([path, bytes]) => [path, sha256(bytes)]));
    const closure = deriveAuthBridgeNotificationPreparedDeployClosure({ memberBodies: members });
    expect(new Map([...members].map(([path, bytes]) => [path, sha256(bytes)]))).toEqual(inputHashes);
    expect([...members.values()]).not.toContain(closure.manifestBytes);
    for (const workflow of closure.workflowBodies) {
      expect(workflow.bytes).not.toBe(members.get(workflow.path));
    }

    const firstWorkflow = closure.workflowBodies[0];
    const callerBody = members.get(firstWorkflow.path);
    if (callerBody === undefined) throw new Error('fixture caller workflow missing');
    const callerFirstByte = callerBody[0];
    firstWorkflow.bytes[0] ^= 0xff;
    expect(callerBody[0]).toBe(callerFirstByte);
  });

  it.skipIf(typeof process.getuid !== 'function')(
    'keeps stale inputs unauthenticated and verifies only after installing derived outputs',
    () => {
      const stale = mutableFixture();
      for (const relativePath of workflowPaths) {
        replaceMember(stale, relativePath, source => source.replace(
          /^(\s*WARPKEEP_[A-Z0-9_]+_SHA256): '[a-f0-9]{64}'$/gmu,
          `$1: '${'d'.repeat(64)}'`,
        ));
      }
      const closure = deriveAuthBridgeNotificationPreparedDeployClosure({ memberBodies: stale });
      const root = writeFixture(stale, closure.manifestBytes);
      expect(() => verifyAuthBridgeNotificationPreparedDeployClosure({ repositoryRoot: root }))
        .toThrow('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_BOOTSTRAP_INVALID');
      for (const workflow of closure.workflowBodies) {
        writeFileSync(resolve(root, workflow.path), workflow.bytes, { mode: 0o600 });
      }
      expect(verifyAuthBridgeNotificationPreparedDeployClosure({ repositoryRoot: root }))
        .toMatchObject({ manifestSha256: closure.manifestSha256 });
    },
    180_000,
  );

  it.skipIf(typeof process.getuid !== 'function')(
    'bounds aggregate member bytes before the verifier retains the full inventory',
    () => {
      const closure = deriveAuthBridgeNotificationPreparedDeployClosure({
        memberBodies: fixtureMemberBodies,
      });
      const installed = mutableFixture();
      for (const workflow of closure.workflowBodies) {
        installed.set(workflow.path, workflow.bytes);
      }
      const root = writeFixture(installed, closure.manifestBytes);
      const maximumBody = Buffer.alloc(MAX_MEMBER_BYTES);
      const largeRawPaths = AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MEMBER_PATHS
        .filter(relativePath => fixtureDigestProfile(relativePath) === RAW_FILE_DIGEST_PROFILE)
        .slice(0, 33);
      expect(largeRawPaths).toHaveLength(33);
      for (const relativePath of largeRawPaths) {
        writeFileSync(resolve(root, relativePath), maximumBody, { mode: 0o600 });
      }
      expect(() => verifyAuthBridgeNotificationPreparedDeployClosure({ repositoryRoot: root }))
        .toThrow('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_MEMBER_INVALID');
    },
    180_000,
  );
});
