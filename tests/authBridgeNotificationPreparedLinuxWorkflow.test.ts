import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const workflowPath = '.github/workflows/notification-bridge-prepared-linux.yml';
const manifestPath =
  'scripts/auth-bridge-notification-prepared-pnpm-linux-x64-v1.json';

describe('prepared Linux production workflow', () => {
  it('reads the public PTR identity from configuration while preserving private credentials', () => {
    const workflow = parse(readFileSync(workflowPath, 'utf8')) as {
      jobs: Record<string, { steps: { name?: string; env?: Record<string, string> }[] }>;
    };
    const steps = Object.values(workflow.jobs).flatMap(job => job.steps);
    const deploy = steps.find(step => step.name === 'Run attested Linux deployment or recovery');
    expect(deploy?.env).toMatchObject({
      WARPKEEP_PTR_SPACETIMEDB_DATABASE: '${{ vars.WARPKEEP_PTR_SPACETIMEDB_DATABASE }}',
      WARPKEEP_PLAYER_CANARY_OWNER_FID: '${{ secrets.WARPKEEP_PLAYER_CANARY_OWNER_FID }}',
      WARPKEEP_PRODUCTION_ADMIN_TOKEN: '${{ secrets.WARPKEEP_PRODUCTION_ADMIN_TOKEN }}',
      WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN: '${{ secrets.WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN }}',
    });
  });

  it('keeps the durable caller on the attested Linux authority', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    expect(workflow).toContain(
      'runs-on: [self-hosted, Linux, X64, warpkeep-production-admin, warpkeep-repository-exclusive]',
    );
    expect(workflow).toContain(
      'WARPKEEP_AUTH_BRIDGE_PREPARED_INSTALLED_TOOLCHAIN_PROFILE: linux-x64',
    );
    expect(workflow).toContain(
      'WARPKEEP_PREPARED_LINUX_INSTALLED_TOOLCHAIN_MANIFEST_SHA256:',
    );
    expect(workflow).not.toContain(
      'WARPKEEP_PREPARED_INSTALLED_TOOLCHAIN_MANIFEST_SHA256:',
    );
    expect(workflow).toContain(
      'scripts/auth-bridge-notification-prepared-installed-toolchain-linux-x64-v1.json',
    );
    expect(workflow).toContain(
      'scripts/auth-bridge-notification-prepared-linux-runner.mjs',
    );
    expect(workflow).toContain(
      '/home/warpkeep/.warpkeep/release-preparation-v1/toolchain/node-v22.22.3-linux-x64/bin/node',
    );
    expect(workflow).toContain(
      '/home/warpkeep/.warpkeep/release-preparation-v1/toolchain/pnpm-v11.7.0-linux-x64/pnpm',
    );
    expect(workflow).toContain(
      '-u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u NO_PROXY',
    );
    expect(workflow).toContain(
      'PATH=/usr/bin:/bin /bin/bash --noprofile --norc -p -e -o pipefail {0}',
    );
    expect(workflow).not.toContain('macOS');
    expect(workflow).not.toContain('darwin-arm64');
    expect(workflow).not.toContain('/private/var/db/warpkeep');
  });

  it('pins the private pnpm authority to the reviewed archive and wrapper', () => {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
    expect(manifest).toMatchObject({
      schemaVersion: 1,
      profile: 'warpkeep-auth-bridge-notification-prepared-pnpm-linux-x64-v1',
      packageManager: 'pnpm@11.7.0',
      platform: 'linux',
      architecture: 'x64',
      nodeVersion: 'v22.22.3',
      pnpmExecutableSha256:
        '5eb52f5b7fe3c4ef589393f81f33b28482f7657109239de7bc5dc4e4e56aafc4',
      pnpmPackageSha256:
        '67b035e322203961795e8e34ca63a08c37a4386eda94107fb3d28f3246d882ad',
      archiveSha256:
        'deafa7ec98a1218b6a047289b92fbe2395c1e22d3495bb711653013218ee15ee',
    });
    const manifestSha = createHash('sha256')
      .update(readFileSync(manifestPath))
      .digest('hex');
    expect(manifestSha).toBe(
      '346661bf89426db64f2911b6b0e7d3f5abf0d717d067b0b6c81602e6c570519a',
    );
  });
});
