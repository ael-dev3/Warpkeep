// @vitest-environment node

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  assertNotificationPagesProductionPlayerCanaryActivationTransition,
  notificationPagesLiveReceiptTestSeams,
  NOTIFICATION_PAGES_PRODUCTION_PLAYER_CANARY_ACTIVATION_PATHS,
} from '../scripts/notification-pages-live-receipt.mjs';

const ROOT = process.cwd();
const HEAD = execFileSync(
  '/usr/bin/git',
  ['rev-parse', '--verify', 'HEAD^{commit}'],
  { cwd: ROOT, encoding: 'utf8' },
).trim();
const temporaryDirectories: string[] = [];

function sourceAt(commit: string, path: string): string {
  return execFileSync('/usr/bin/git', ['show', `${commit}:${path}`], {
    cwd: ROOT,
    encoding: 'utf8',
  });
}

function replaceOnce(source: string, before: string, after: string): string {
  if (source.split(before).length !== 2) {
    throw new Error(`expected one transition slot: ${before}`);
  }
  return source.replace(before, after);
}

function descendantCommitWithSources(
  parent: string,
  sources: Readonly<Record<string, string>>,
): string {
  const directory = mkdtempSync(join(tmpdir(), 'warpkeep-c7-transition-'));
  temporaryDirectories.push(directory);
  const environment = {
    ...process.env,
    GIT_INDEX_FILE: join(directory, 'index'),
    GIT_AUTHOR_NAME: 'Warpkeep C7 Transition Test',
    GIT_AUTHOR_EMAIL: 'c7-transition@warpkeep.invalid',
    GIT_AUTHOR_DATE: '1700000000 +0000',
    GIT_COMMITTER_NAME: 'Warpkeep C7 Transition Test',
    GIT_COMMITTER_EMAIL: 'c7-transition@warpkeep.invalid',
    GIT_COMMITTER_DATE: '1700000000 +0000',
  };
  execFileSync('/usr/bin/git', ['read-tree', parent], {
    cwd: ROOT,
    env: environment,
    stdio: 'ignore',
  });
  for (const [path, source] of Object.entries(sources)) {
    const entry = execFileSync(
      '/usr/bin/git',
      ['ls-tree', parent, '--', path],
      { cwd: ROOT, encoding: 'utf8' },
    ).trim();
    const mode = /^(100644|100755) blob [0-9a-f]{40}\t/u.exec(entry)?.[1]
      ?? '100644';
    const objectId = execFileSync(
      '/usr/bin/git',
      ['hash-object', '-w', '--stdin'],
      { cwd: ROOT, encoding: 'utf8', input: source },
    ).trim();
    execFileSync(
      '/usr/bin/git',
      ['update-index', '--add', '--cacheinfo', mode, objectId, path],
      { cwd: ROOT, env: environment, stdio: 'ignore' },
    );
  }
  const tree = execFileSync('/usr/bin/git', ['write-tree'], {
    cwd: ROOT,
    env: environment,
    encoding: 'utf8',
  }).trim();
  return execFileSync('/usr/bin/git', ['commit-tree', tree, '-p', parent], {
    cwd: ROOT,
    env: environment,
    encoding: 'utf8',
    input: 'test exact C7 transition\n',
  }).trim();
}

function fixture() {
  const c6 = descendantCommitWithSources(HEAD, {
    '.github/workflows/deploy-pages.yml': replaceOnce(
      sourceAt(HEAD, '.github/workflows/deploy-pages.yml'),
      "      VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED: 'false'",
      "      VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED: 'true'",
    ),
    'scripts/hermes-admin.ts': replaceOnce(
      sourceAt(HEAD, 'scripts/hermes-admin.ts'),
      'export const FOUNDER_ADMISSION_NOTIFICATION_DELIVERY_APPROVED = false as const;',
      'export const FOUNDER_ADMISSION_NOTIFICATION_DELIVERY_APPROVED = true as const;',
    ),
    'scripts/greater-realm-downstream-release-policy.ts': replaceOnce(
      sourceAt(HEAD, 'scripts/greater-realm-downstream-release-policy.ts'),
      '  admissionNotificationsApproved: false,',
      '  admissionNotificationsApproved: true,',
    ),
    'scripts/notification-pages-live-release-binding.mjs': sourceAt(
      HEAD,
      'scripts/notification-pages-live-release-binding.mjs',
    )
      .replace(
        '  notificationPagesLiveRootReceiptDigest: null,',
        `  notificationPagesLiveRootReceiptDigest: '${'4'.repeat(64)}',`,
      )
      .replace(
        '  notificationPagesLiveRootPagesSourceCommit: null,',
        `  notificationPagesLiveRootPagesSourceCommit: '${HEAD}',`,
      ),
  });
  const oldDescription =
    'Command four Workers, gather resources and return to a permanent keep in Genesis 001. Invite-only Alpha.';
  const newDescription =
    'Explore a six-region world foundation. The core gameplay loop remains incomplete; invite-only Alpha.';
  const sources: Record<string, string> = {};
  for (const path of [
    'CHANGELOG.md',
    'README.md',
    'index.html',
    'src/components/menu/latestPatchNotes.ts',
    'tests/buildInfo.test.ts',
    'tests/deploymentBase.test.ts',
    'tests/farcasterMiniAppContract.test.ts',
    'tests/latestPatchNotes.test.ts',
    'tests/menuFarcasterAuthIntegration.test.tsx',
    'tests/menuMainMenu.test.tsx',
  ]) {
    const marker = /\.(?:md|html)$/u.test(path)
      ? `<!-- world-foundation-c7:${path} -->`
      : `// world-foundation-c7:${path}`;
    sources[path] = `${sourceAt(c6, path)}\n${marker}\n`;
  }
  sources['package.json'] = replaceOnce(
    sourceAt(c6, 'package.json'),
    '"version": "0.3.43"',
    '"version": "0.3.44"',
  );
  const lock = sourceAt(c6, 'package-lock.json');
  if (lock.match(/"version": "0\.3\.43"/gu)?.length !== 2) {
    throw new Error('expected exact package-lock transition slots');
  }
  sources['package-lock.json'] = lock.replaceAll(
    '"version": "0.3.43"',
    '"version": "0.3.44"',
  );
  sources['public/.well-known/farcaster.json'] = replaceOnce(
    sourceAt(c6, 'public/.well-known/farcaster.json'),
    oldDescription,
    newDescription,
  );
  sources['scripts/farcaster-miniapp-contract.mjs'] = replaceOnce(
    sourceAt(c6, 'scripts/farcaster-miniapp-contract.mjs'),
    oldDescription,
    newDescription,
  );
  sources['scripts/greater-realm-downstream-release-policy.ts'] = replaceOnce(
    sourceAt(c6, 'scripts/greater-realm-downstream-release-policy.ts'),
    '  clientActivationApproved: false,',
    '  clientActivationApproved: true,',
  );
  sources['scripts/production-player-canary-release-binding.mjs'] = sourceAt(
    c6,
    'scripts/production-player-canary-release-binding.mjs',
  )
    .replace(
      '  productionPlayerCanaryReceiptDigest: null,',
      `  productionPlayerCanaryReceiptDigest: '${'5'.repeat(64)}',`,
    )
    .replace(
      '  productionPlayerCanarySourceCommit: null,',
      `  productionPlayerCanarySourceCommit: '${c6}',`,
    );
  sources['src/greater-realm/greaterRealmTransport.ts'] = replaceOnce(
    sourceAt(c6, 'src/greater-realm/greaterRealmTransport.ts'),
    'export const GREATER_REALM_SERVER_PRESENTATION_ALLOWED = false as const;',
    'export const GREATER_REALM_SERVER_PRESENTATION_ALLOWED = true as const;',
  );
  sources['src/spacetime/greaterRealmProviderBridge.ts'] = replaceOnce(
    sourceAt(c6, 'src/spacetime/greaterRealmProviderBridge.ts'),
    'export const GREATER_REALM_CLIENT_PRESENTATION_ALLOWED = false as const;',
    'export const GREATER_REALM_CLIENT_PRESENTATION_ALLOWED = true as const;',
  );
  return Object.freeze({ c6, sources: Object.freeze(sources) });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('notification Pages player-canary activation transition', () => {
  it('accepts the exact C6 to C7 eighteen-path world-foundation transition', () => {
    const transition = fixture();
    const c7 = descendantCommitWithSources(transition.c6, transition.sources);
    expect(notificationPagesLiveReceiptTestSeams
      ?.assertProductionPlayerCanaryActivationSourceTransition(
        transition.c6,
        c7,
      )).toEqual({
      predecessorPagesSourceCommit: transition.c6,
      candidatePagesSourceCommit: c7,
      productionPlayerCanaryReceiptDigest: '5'.repeat(64),
    });
    expect(notificationPagesLiveReceiptTestSeams?.exactChangedPaths(
      transition.c6,
      c7,
      'TEST_INVALID',
    )).toEqual([...NOTIFICATION_PAGES_PRODUCTION_PLAYER_CANARY_ACTIVATION_PATHS]
      .sort());
    expect(() => assertNotificationPagesProductionPlayerCanaryActivationTransition({
      predecessorPagesSourceCommit: transition.c6,
      candidatePagesSourceCommit: c7,
      activationAuthority: Object.freeze({}),
    })).toThrow('PRODUCTION_PLAYER_CANARY_ACTIVATION_AUTHORITY_REQUIRED');
  }, 30_000);

  it('rejects missing/extra paths and identity, gate, or binding decoys', () => {
    const transition = fixture();
    const reject = (sources: Record<string, string>) => {
      const candidate = descendantCommitWithSources(transition.c6, sources);
      expect(() => notificationPagesLiveReceiptTestSeams
        ?.assertProductionPlayerCanaryActivationSourceTransition(
          transition.c6,
          candidate,
        )).toThrow('NOTIFICATION_PAGES_LIVE_PLAYER_CANARY_TRANSITION_INVALID');
    };

    const missing = { ...transition.sources };
    delete missing['README.md'];
    reject(missing);
    reject({
      ...transition.sources,
      'src/main.tsx': `${sourceAt(transition.c6, 'src/main.tsx')}\n// decoy\n`,
    });
    reject({
      ...transition.sources,
      'package.json': transition.sources['package.json'].replace(
        '"version": "0.3.44"',
        '"version": "0.3.45"',
      ),
    });
    reject({
      ...transition.sources,
      'scripts/greater-realm-downstream-release-policy.ts':
        transition.sources['scripts/greater-realm-downstream-release-policy.ts']
        + '\nexport const decoy = true;\n',
    });
    reject({
      ...transition.sources,
      'scripts/production-player-canary-release-binding.mjs':
        transition.sources['scripts/production-player-canary-release-binding.mjs']
          .replace(transition.c6, HEAD),
    });
  });
});
