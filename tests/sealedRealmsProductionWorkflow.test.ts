// @vitest-environment node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import {
  SEALED_REALMS_OPERATIONS,
} from '../scripts/sealed-realms-production-source-authority.mjs';

const repositoryRoot = resolve(import.meta.dirname, '..');
const workflow = (name: string) => readFileSync(
  resolve(repositoryRoot, `.github/workflows/${name}`),
  'utf8',
);

describe('sealed-realms production workflow authority', () => {
  const hardenedShell =
    '/usr/bin/env -u BASH_ENV -u ENV -u SHELLOPTS -u BASHOPTS -u PS4 -u NODE_OPTIONS -u NODE_PATH -u DYLD_INSERT_LIBRARIES -u DYLD_LIBRARY_PATH PATH=/usr/bin:/bin /bin/bash --noprofile --norc -p -e -o pipefail {0}';
  it('admits only the exact manual source commit and 20 ordered operations', () => {
    const source = workflow('sealed-realms-production.yml');
    const document = parse(source) as {
      on?: { workflow_dispatch?: { inputs?: Record<string, unknown> } };
      permissions?: Record<string, unknown>;
    };
    const inputs = document.on?.workflow_dispatch?.inputs as Record<
      string,
      { required?: boolean; default?: string; type?: string; options?: string[] }
    >;
    expect(Object.keys(document.on ?? {})).toEqual(['workflow_dispatch']);
    expect(Object.keys(inputs)).toEqual(['source_commit', 'operation']);
    expect(inputs.source_commit).toMatchObject({ required: true, type: 'string' });
    expect(inputs.operation).toEqual({
      description: expect.any(String),
      required: true,
      default: 'preflight',
      type: 'choice',
      options: [...SEALED_REALMS_OPERATIONS],
    });
    expect(document.permissions).toEqual({ actions: 'read', contents: 'read' });
  });

  it('uses only the protected exclusive runner and one bounded public result line', () => {
    const source = workflow('sealed-realms-production.yml');
    const document = parse(source) as {
      jobs?: Record<string, {
        environment?: string;
        'runs-on'?: string[];
        'timeout-minutes'?: number;
      }>;
    };
    expect(Object.keys(document.jobs ?? {})).toEqual(['operate']);
    expect(document.jobs?.operate).toMatchObject({
      environment: 'notification-bridge-prepared',
      'runs-on': [
        'self-hosted', 'macOS', 'ARM64', 'warpkeep-production-admin',
        'warpkeep-repository-exclusive',
      ],
    });
    expect(document.jobs?.operate?.['timeout-minutes']).toBeGreaterThan(0);
    expect(source.match(/WARPKEEP_OPERATION_RESULT /gu)).toHaveLength(1);
    expect(source).toContain('Refuse stale closure before sealed-realms dispatch');
    expect(source).toContain('SEALED_REALMS_TASK_7_CLOSURE_UNAVAILABLE');
    expect(source).toContain('exit 1');
    expect(source).not.toMatch(
      /(?:node|node_executable).*sealed-realms-production-dispatch\.mjs/iu,
    );
    expect(source).not.toMatch(/(?:npm|pnpm|npx|tsx) (?:ci|install|run)/u);
    expect(source).not.toMatch(/console\.log|set -x|printenv|env\s*$/mu);
    expect(source).toContain('persist-credentials: false');
    for (const reference of source.matchAll(/uses:\s*([^\s]+)/gu)) {
      expect(reference[1]).toMatch(/@[0-9a-f]{40}$/u);
    }
  });

  it('strips ambient shell bootstrap authority before the terminal fence', () => {
    const document = parse(workflow('sealed-realms-production.yml')) as {
      jobs?: Record<string, {
        steps?: Array<{ name?: string; shell?: string; run?: string }>;
      }>;
    };
    const fence = document.jobs?.operate?.steps?.find(
      step => step.name === 'Refuse stale closure before sealed-realms dispatch',
    );
    expect(fence).toBeDefined();
    expect(fence?.shell).toBe(hardenedShell);
    expect(fence?.run).toContain('SEALED_REALMS_TASK_7_CLOSURE_UNAVAILABLE');
    expect(fence?.run).toContain('exit 1');
  });

  it('verifies and uploads only the fixed public activation path', () => {
    const source = workflow('sealed-realms-production.yml');
    const immutableNode =
      '/private/var/db/warpkeep/runtime/node-v22.22.3-darwin-arm64/bin/node';
    expect(source).toContain(
      '"$node_executable" scripts/verify-sealed-realms-public-activation-artifact.mjs',
    );
    expect(source).toContain(immutableNode);
    expect(source).toContain('/usr/bin/codesign --verify --strict --verbose=4');
    expect(source).toContain(
      "'5d9d3872911e2340a43b707962e68143de8a4e8d54628845c0c4f2de1fb7cd5c'",
    );
    expect(source).not.toContain(
      'node scripts/verify-sealed-realms-public-activation-artifact.mjs',
    );
    expect(source).toContain("github.event.inputs.operation == 'activation-evidence-generate'");
    expect(source.match(/actions\/upload-artifact@/gu)).toHaveLength(1);
    expect(source).toContain('${{ steps.activation-artifact.outputs.path }}');
    expect(source).toContain('mktemp -d');
    expect(source).not.toMatch(/\bmv\s+(?:-[^\s]+\s+)*--?/u);
    expect(source).not.toMatch(/>\s*"\$artifact"/u);
    expect(source).not.toMatch(/artifact-path|candidate-path|expected-digest/iu);
  });

  it('shares one non-cancelling state lock with B0, prepared, and Pages', () => {
    const names = [
      'sealed-realms-production.yml',
      'notification-bridge-b0.yml',
      'notification-bridge-prepared.yml',
      'deploy-pages.yml',
    ];
    for (const name of names) {
      const source = workflow(name);
      const document = parse(source) as {
        concurrency?: { group?: string; 'cancel-in-progress'?: boolean };
      };
      expect(document.concurrency).toEqual({
        group: 'warpkeep-production-state',
        'cancel-in-progress': false,
      });
      expect(source).not.toMatch(/^\s+cancel-in-progress: true\s*$/mu);
    }
  });

  it('keeps the stable verify check as an always-run five-job aggregator', () => {
    const source = workflow('verify.yml');
    const document = parse(source) as {
      jobs?: Record<string, {
        name?: string;
        needs?: string[];
        if?: string;
        'runs-on'?: string | string[];
        environment?: unknown;
      }>;
    };
    expect(Object.keys(document.jobs ?? {})).toEqual([
      'linux', 'auth-bridge', 'spacetimedb-module', 'native-contract', 'verify',
    ]);
    expect(document.jobs?.['native-contract']?.['runs-on']).toBe(
      'macos-14-xlarge',
    );
    expect(document.jobs?.['native-contract']).not.toHaveProperty('environment');
    const nativeJob = source.slice(
      source.indexOf('  native-contract:'),
      source.indexOf('  verify:', source.indexOf('  native-contract:')),
    );
    expect(nativeJob).toContain('RUNNER_ARCH');
    expect(nativeJob).toContain('ARM64');
    expect(nativeJob).not.toMatch(/secrets\.|warpkeep-production-admin|self-hosted/u);
    expect(document.jobs?.verify).toMatchObject({
      name: 'Verify',
      needs: ['linux', 'auth-bridge', 'spacetimedb-module', 'native-contract'],
    });
    expect(document.jobs?.verify?.if).toContain('always()');
    expect(source).toContain("needs.linux.result == 'success'");
    expect(source).toContain("needs.auth-bridge.result == 'success'");
    expect(source).toContain("needs.spacetimedb-module.result == 'success'");
    expect(source).toContain("needs.native-contract.result == 'success'");
  });

  it('makes prepared recovery an explicit no-deploy operation choice', () => {
    const source = workflow('notification-bridge-prepared.yml');
    const document = parse(source) as {
      on?: { workflow_dispatch?: { inputs?: Record<string, unknown> } };
    };
    const inputs = document.on?.workflow_dispatch?.inputs as Record<
      string,
      { required?: boolean; default?: string; type?: string; options?: string[] }
    >;
    expect(Object.keys(inputs)).toEqual(['source_commit', 'operation']);
    expect(inputs.operation).toEqual({
      description: expect.any(String),
      required: true,
      default: 'deploy',
      type: 'choice',
      options: ['deploy', 'recover-expired-authority-read-only'],
    });
    const deployStart = source.indexOf(
      '      - name: Run guarded prepared bridge deployment',
    );
    const recoveryStart = source.indexOf(
      '      - name: Recover expired authority without deployment',
    );
    expect(deployStart).toBeGreaterThan(-1);
    expect(recoveryStart).toBeGreaterThan(deployStart);
    expect(source.slice(deployStart, recoveryStart)).toContain(
      "inputs.operation == 'deploy'",
    );
    const recovery = source.slice(recoveryStart);
    expect(recovery).toContain(
      'runAuthBridgeNotificationPreparedReadOnlyRecovery',
    );
    expect(recovery).toContain('verified-read-only-recovery');
    expect(recovery).not.toContain(
      'await entrypoint.runAuthBridgeNotificationPreparedDeploy();',
    );
  });

  it('does not transport owner or PTR database authority into prepared recovery', () => {
    const source = workflow('notification-bridge-prepared.yml');
    const recoveryStart = source.indexOf(
      '      - name: Recover expired authority without deployment',
    );
    const recoveryEnd = source.indexOf(
      '      - name: Require a verified deployment or recovery',
      recoveryStart,
    );
    expect(recoveryStart).toBeGreaterThan(-1);
    expect(recoveryEnd).toBeGreaterThan(recoveryStart);
    const deploy = source.slice(0, recoveryStart);
    const recovery = source.slice(recoveryStart, recoveryEnd);
    for (const forbidden of [
      'WARPKEEP_PLAYER_CANARY_OWNER_FID',
      'WARPKEEP_PTR_SPACETIMEDB_DATABASE',
    ]) {
      expect(deploy).toContain(forbidden);
      expect(recovery).not.toContain(forbidden);
    }
    for (const required of [
      'WARPKEEP_AUTH_BRIDGE_ACCOUNT_ID',
      'WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN',
      'WARPKEEP_AUTH_BRIDGE_ZONE_ID',
      'WARPKEEP_PRODUCTION_ADMIN_TOKEN',
      'WARPKEEP_NODE_EXECUTABLE',
    ]) expect(recovery).toContain(required);
  });
});
