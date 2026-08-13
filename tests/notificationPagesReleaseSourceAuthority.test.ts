// @vitest-environment node

import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  classifyNotificationPagesDeployLane,
} from '../scripts/notification-pages-deploy-lane.mjs';
import {
  parseNotificationPagesReleaseSources,
} from '../scripts/notification-pages-release-source-parser.mjs';

const repositoryRoot = resolve(import.meta.dirname, '..');
const DIGEST_A = 'a'.repeat(64);
const DIGEST_B = 'b'.repeat(64);
const COMMIT_C = 'c'.repeat(40);
const ROOT_DIGEST = 'd'.repeat(64);
const ROOT_COMMIT = 'e'.repeat(40);
const fixtureRoots: string[] = [];

const bindingPaths = Object.freeze([
  'scripts/auth-bridge-notification-prepared-release-binding.mjs',
  'scripts/notification-pages-private-release-binding.mjs',
  'scripts/notification-pages-live-release-binding.mjs',
]);

function checkedInReleaseSources() {
  return {
    pagesWorkflowSource: readFileSync(
      resolve(repositoryRoot, '.github/workflows/deploy-pages.yml'),
      'utf8',
    ),
    hermesSource: readFileSync(
      resolve(repositoryRoot, 'scripts/hermes-admin.ts'),
      'utf8',
    ),
    preparedBindingSource: readFileSync(
      resolve(repositoryRoot, bindingPaths[0]),
      'utf8',
    ),
    privateBindingSource: readFileSync(
      resolve(repositoryRoot, bindingPaths[1]),
      'utf8',
    ),
    liveRootBindingSource: readFileSync(
      resolve(repositoryRoot, bindingPaths[2]),
      'utf8',
    ),
  };
}

function git(root: string, ...arguments_: string[]): string {
  return execFileSync('/usr/bin/git', arguments_, {
    cwd: root,
    encoding: 'utf8',
    env: {
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
      HOME: '/nonexistent',
      PATH: '/usr/bin:/bin',
    },
  }).trim();
}

function replaceBinding(
  source: string,
  field: string,
  value: string | number | null,
): string {
  const encoded = typeof value === 'string' ? `'${value}'` : String(value);
  return source.replace(
    new RegExp(`^(  ${field}: )[^,]+,$`, 'm'),
    `$1${encoded},`,
  );
}

function sourceFixture({
  prepared = false,
  privateInputs = false,
  root = false,
  mutate,
}: {
  prepared?: boolean;
  privateInputs?: boolean;
  root?: boolean;
  mutate?: (sources: Map<string, string>) => void;
} = {}) {
  const rootPath = realpathSync(mkdtempSync(
    resolve(tmpdir(), 'warpkeep-pages-lane-'),
  ));
  fixtureRoots.push(rootPath);
  mkdirSync(resolve(rootPath, 'scripts'), { recursive: true });
  const sources = new Map(bindingPaths.map(relative => [
    relative,
    readFileSync(resolve(repositoryRoot, relative), 'utf8'),
  ]));
  if (prepared) {
    let source = sources.get(bindingPaths[0])!;
    source = replaceBinding(
      source,
      'notificationPreparedReceiptDigest',
      DIGEST_A,
    );
    source = replaceBinding(
      source,
      'notificationPreparedBridgeSourceCommit',
      COMMIT_C,
    );
    sources.set(bindingPaths[0], source);
  }
  if (privateInputs) {
    let source = sources.get(bindingPaths[1])!;
    source = replaceBinding(
      source,
      'notificationPagesActiveV17EvidenceDigest',
      DIGEST_A,
    );
    source = replaceBinding(
      source,
      'notificationPagesDeployedModuleReceiptDigest',
      DIGEST_B,
    );
    source = replaceBinding(source, 'notificationPagesExpectedFounderCount', 84);
    sources.set(bindingPaths[1], source);
  }
  if (root) {
    let source = sources.get(bindingPaths[2])!;
    source = replaceBinding(
      source,
      'notificationPagesLiveRootReceiptDigest',
      ROOT_DIGEST,
    );
    source = replaceBinding(
      source,
      'notificationPagesLiveRootPagesSourceCommit',
      ROOT_COMMIT,
    );
    sources.set(bindingPaths[2], source);
  }
  mutate?.(sources);
  for (const [relative, source] of sources) {
    writeFileSync(resolve(rootPath, relative), source, { mode: 0o600 });
  }
  git(rootPath, 'init', '--quiet');
  git(rootPath, 'config', 'user.name', 'Warpkeep test');
  git(rootPath, 'config', 'user.email', 'warpkeep-test@example.invalid');
  git(rootPath, 'add', '--', ...bindingPaths);
  git(rootPath, 'commit', '--quiet', '-m', 'fixture');
  return Object.freeze({
    repositoryRoot: rootPath,
    candidatePagesSourceCommit: git(rootPath, 'rev-parse', 'HEAD'),
  });
}

afterEach(() => {
  while (fixtureRoots.length > 0) {
    rmSync(fixtureRoots.pop()!, { recursive: true, force: true });
  }
});

describe('notification Pages dependency-free deploy lane authority', () => {
  it('classifies only exact complete source tuples in an archive without node_modules', () => {
    expect(classifyNotificationPagesDeployLane(sourceFixture()).mode)
      .toBe('closed-review');
    expect(classifyNotificationPagesDeployLane(sourceFixture({
      prepared: true,
      privateInputs: true,
    })).mode).toBe('gen0');
    expect(classifyNotificationPagesDeployLane(sourceFixture({ root: true })).mode)
      .toBe('durable');
    for (const rootPath of fixtureRoots) {
      expect(() => readFileSync(resolve(rootPath, 'node_modules/.bin/node')))
        .toThrow();
    }
  });

  it('never executes candidate binding modules', () => {
    const fixture = sourceFixture({
      prepared: true,
      privateInputs: true,
      mutate(sources) {
        sources.set(
          bindingPaths[1],
          `${sources.get(bindingPaths[1])!}\nthrow new Error('candidate executed');\n`,
        );
      },
    });
    expect(classifyNotificationPagesDeployLane(fixture).mode).toBe('gen0');
  });

  it('rejects partial tuples and comment, template, or regex declaration decoys', () => {
    const partial = sourceFixture({
      mutate(sources) {
        sources.set(
          bindingPaths[0],
          replaceBinding(
            sources.get(bindingPaths[0])!,
            'notificationPreparedBridgeSourceCommit',
            COMMIT_C,
          ),
        );
      },
    });
    expect(() => classifyNotificationPagesDeployLane(partial)).toThrow(
      'NOTIFICATION_PAGES_DEPLOY_LANE_PREPARED_BINDING_INVALID',
    );

    for (const decoy of [
      `/* export const AUTH_BRIDGE_NOTIFICATION_PREPARED_RELEASE_BINDING = Object.freeze({\n  notificationPreparedReceiptDigest: '${DIGEST_A}',\n  notificationPreparedBridgeSourceCommit: '${COMMIT_C}',\n}); */\n`,
      `const decoy = \`export const AUTH_BRIDGE_NOTIFICATION_PREPARED_RELEASE_BINDING = Object.freeze({\n  notificationPreparedReceiptDigest: '${DIGEST_A}',\n  notificationPreparedBridgeSourceCommit: '${COMMIT_C}',\n});\`;\n`,
      `const decoy = /export const AUTH_BRIDGE_NOTIFICATION_PREPARED_RELEASE_BINDING/;\n`,
    ]) {
      const fixture = sourceFixture({
        mutate(sources) {
          const actual = sources.get(bindingPaths[0])!;
          sources.set(bindingPaths[0], `${decoy}${actual}`);
        },
      });
      if (decoy.startsWith('/*')) {
        expect(classifyNotificationPagesDeployLane(fixture).mode)
          .toBe('closed-review');
      } else {
        expect(() => classifyNotificationPagesDeployLane(fixture)).toThrow(
          'NOTIFICATION_PAGES_DEPLOY_LANE_PREPARED_BINDING_INVALID',
        );
      }
    }
  });

  it('compares binding bytes to HEAD even when an index flag hides the edit', () => {
    const fixture = sourceFixture();
    git(fixture.repositoryRoot, 'update-index', '--assume-unchanged', '--', bindingPaths[0]);
    writeFileSync(
      resolve(fixture.repositoryRoot, bindingPaths[0]),
      replaceBinding(
        readFileSync(resolve(fixture.repositoryRoot, bindingPaths[0]), 'utf8'),
        'notificationPreparedReceiptDigest',
        DIGEST_A,
      ),
    );
    expect(() => classifyNotificationPagesDeployLane(fixture)).toThrow(
      'NOTIFICATION_PAGES_DEPLOY_LANE_PREPARED_BINDING_INVALID',
    );
  });
});

describe('notification Pages structural release source authority', () => {
  it('parses checked-in YAML and TypeScript as data without executing bindings', () => {
    const sources = checkedInReleaseSources();
    sources.privateBindingSource += '\nthrow new Error("binding executed");\n';
    expect(parseNotificationPagesReleaseSources(sources)).toMatchObject({
      phase: {
        pagesPresentationEnabled: false,
        hermesExecutionApproved: false,
      },
      preparedBinding: {
        notificationPreparedReceiptDigest: null,
        notificationPreparedBridgeSourceCommit: null,
      },
      privateBinding: {
        notificationPagesActiveV17EvidenceDigest: null,
        notificationPagesDeployedModuleReceiptDigest: null,
        notificationPagesExpectedFounderCount: null,
      },
      liveRootBinding: {
        notificationPagesLiveRootReceiptDigest: null,
        notificationPagesLiveRootPagesSourceCommit: null,
      },
    });
  });

  it('reads the exact YAML build scalar and rejects block or shadow overrides', () => {
    const sources = checkedInReleaseSources();
    const comment = {
      ...sources,
      pagesWorkflowSource:
        `# VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED: 'true'\n`
        + sources.pagesWorkflowSource,
    };
    expect(parseNotificationPagesReleaseSources(comment).phase)
      .toMatchObject({ pagesPresentationEnabled: false });

    const blockScalar = {
      ...sources,
      pagesWorkflowSource: sources.pagesWorkflowSource.replace(
        "VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED: 'false'",
        'VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED: |-\n        false',
      ),
    };
    expect(() => parseNotificationPagesReleaseSources(blockScalar)).toThrow(
      'NOTIFICATION_PAGES_RELEASE_SOURCE_PAGES_INVALID',
    );

    const shadow = {
      ...sources,
      pagesWorkflowSource: sources.pagesWorkflowSource.replace(
        '      - name: Build\n',
        "      - name: Build\n        env:\n          VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED: 'true'\n",
      ),
    };
    expect(() => parseNotificationPagesReleaseSources(shadow)).toThrow(
      'NOTIFICATION_PAGES_RELEASE_SOURCE_PAGES_INVALID',
    );
  });

  it('ignores Hermes declaration tokens in comments, templates, and regex literals', () => {
    const sources = checkedInReleaseSources();
    for (const decoy of [
      '// export const FOUNDER_ADMISSION_NOTIFICATION_DELIVERY_APPROVED = true as const;\n',
      'const decoy = `export const FOUNDER_ADMISSION_NOTIFICATION_DELIVERY_APPROVED = true as const;`;\n',
      'const decoy = /export const FOUNDER_ADMISSION_NOTIFICATION_DELIVERY_APPROVED = true as const/;\n',
    ]) {
      expect(parseNotificationPagesReleaseSources({
        ...sources,
        hermesSource: `${decoy}${sources.hermesSource}`,
      }).phase.hermesExecutionApproved).toBe(false);
    }
    expect(() => parseNotificationPagesReleaseSources({
      ...sources,
      hermesSource:
        'export const FOUNDER_ADMISSION_NOTIFICATION_DELIVERY_APPROVED = true as const;\n'
        + sources.hermesSource,
    })).toThrow('NOTIFICATION_PAGES_RELEASE_SOURCE_HERMES_INVALID');
  });

  it('ignores binding declaration tokens in comments, templates, and regex literals', () => {
    const sources = checkedInReleaseSources();
    const declaration =
      `export const AUTH_BRIDGE_NOTIFICATION_PREPARED_RELEASE_BINDING = Object.freeze({\n`
      + `  notificationPreparedReceiptDigest: '${DIGEST_A}',\n`
      + `  notificationPreparedBridgeSourceCommit: '${COMMIT_C}',\n`
      + '});';
    for (const decoy of [
      `// ${declaration.replaceAll('\n', ' ')}\n`,
      `const decoy = \`${declaration}\`;\n`,
      'const decoy = /AUTH_BRIDGE_NOTIFICATION_PREPARED_RELEASE_BINDING/;\n',
    ]) {
      expect(parseNotificationPagesReleaseSources({
        ...sources,
        preparedBindingSource: `${decoy}${sources.preparedBindingSource}`,
      }).preparedBinding).toMatchObject({
        notificationPreparedReceiptDigest: null,
        notificationPreparedBridgeSourceCommit: null,
      });
    }
  });

  it('requires every binding tuple to be exactly all-null or all-populated', () => {
    const sources = checkedInReleaseSources();
    const cases = [
      {
        key: 'preparedBindingSource' as const,
        field: 'notificationPreparedReceiptDigest',
        value: DIGEST_A,
        code: 'NOTIFICATION_PAGES_RELEASE_SOURCE_PREPARED_BINDING_INVALID',
      },
      {
        key: 'privateBindingSource' as const,
        field: 'notificationPagesExpectedFounderCount',
        value: 84,
        code: 'NOTIFICATION_PAGES_RELEASE_SOURCE_PRIVATE_BINDING_INVALID',
      },
      {
        key: 'liveRootBindingSource' as const,
        field: 'notificationPagesLiveRootReceiptDigest',
        value: ROOT_DIGEST,
        code: 'NOTIFICATION_PAGES_RELEASE_SOURCE_ROOT_BINDING_INVALID',
      },
    ];
    for (const { key, field, value, code } of cases) {
      expect(() => parseNotificationPagesReleaseSources({
        ...sources,
        [key]: replaceBinding(sources[key], field, value),
      })).toThrow(code);
    }
  });
});
