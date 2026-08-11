// @vitest-environment node

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import {
  AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOYMENT_BLOCKER,
  verifyAuthBridgeNotificationPreparedStaticPolicy,
} from '../scripts/verify-auth-bridge-notification-prepared-policy.mjs';

const repositoryRoot = process.cwd();
const workflowPath = resolve(
  repositoryRoot,
  '.github/workflows/notification-bridge-prepared.yml',
);

function workflow(): string {
  return readFileSync(workflowPath, 'utf8');
}

describe('notification-bridge-prepared protected workflow', () => {
  it('is manual-only, protected, bounded, and checks out an exact protected SHA', () => {
    const source = workflow();
    const document = parse(source) as {
      on?: Record<string, unknown>;
      jobs?: Record<string, {
        environment?: { name?: string };
        ['timeout-minutes']?: number;
      }>;
    };
    expect(Object.keys(document.on ?? {})).toEqual(['workflow_dispatch']);
    expect(document.jobs?.['notification-bridge-prepared']?.environment?.name)
      .toBe('notification-bridge-prepared');
    expect(document.jobs?.['notification-bridge-prepared']?.['timeout-minutes'])
      .toBe(20);
    expect(source).toContain(
      'gh api "repos/${GITHUB_REPOSITORY}/git/ref/heads/main"',
    );
    expect(source).toContain(
      'ref: ${{ inputs.source_commit }}',
    );
    expect(source).toContain('persist-credentials: false');
    expect(source).toContain(
      "origin_url\" != 'https://github.com/ael-dev3/Warpkeep'",
    );
    expect(source).toContain('git symbolic-ref -q HEAD');
    expect(source).not.toMatch(/^\s+(?:push|workflow_run|schedule):/mu);
  });

  it('expresses only bridge preparation while Hermes, Pages, and checked flags stay inert', () => {
    const source = workflow();
    expect(source).toContain(
      "WARPKEEP_BRIDGE_NOTIFICATION_DELIVERY_ENABLED: 'true'",
    );
    expect(source).toContain(
      "WARPKEEP_HERMES_EXECUTION_APPROVED: 'false'",
    );
    expect(source).toContain(
      "WARPKEEP_PAGES_PRESENTATION_ENABLED: 'false'",
    );
    expect(source).toContain(
      'actions/variables',
    );
    expect(source).toContain(
      'select(.name == "WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED")',
    );
    expect(verifyAuthBridgeNotificationPreparedStaticPolicy({ repositoryRoot }))
      .toEqual({
        bridgeNotificationDeliveryEnabled: true,
        hermesExecutionApproved: false,
        pagesPresentationEnabled: false,
        checkedInWorkerGateEnabled: false,
        deploymentMechanicsReady: false,
        blocker: AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOYMENT_BLOCKER,
      });
  });

  it('fails before credentials or production I/O when the safe adapter and sink are absent', () => {
    const source = workflow();
    const blocker = source.indexOf(
      'Require reviewed deploy adapter and durable private receipt sink',
    );
    expect(blocker).toBeGreaterThan(0);
    expect(source.slice(blocker)).toContain(
      `echo '${AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOYMENT_BLOCKER}' >&2`,
    );
    expect(source.slice(blocker)).toMatch(/\n\s+exit 1\s*$/u);
    expect(source).not.toMatch(/\bwrangler\s+(?:deploy|publish|versions\s+upload)\b/u);
    expect(source).not.toMatch(/\b(?:curl|wget)\b/u);
    expect(source).not.toContain('upload-artifact@');
    expect(source).not.toContain('upload-pages-artifact@');
    expect(source).not.toContain('WARPKEEP_ADMIN_TOKEN_SECRET');
    expect(source).not.toContain('CLOUDFLARE_API_TOKEN');
    expect(source).not.toContain('secrets.');
  });

  it('uses only the exact lockfile toolchain from the protected checkout', () => {
    const source = workflow();
    expect(source).toContain(
      'pnpm/action-setup@0ebf47130e4866e96fce0953f49152a61190b271',
    );
    expect(source).toContain('version: 11.7.0');
    expect(source).toContain(
      'pnpm --dir services/auth-bridge install --frozen-lockfile',
    );
    expect(source).toContain('pnpm --dir services/auth-bridge run check');
    expect(source).toContain(
      'node scripts/verify-auth-bridge-notification-prepared-policy.mjs',
    );
  });

  it('keeps the private receipt path out of argv and diagnostic output', () => {
    const privatePath = '/private/sensitive-receipt-location.json';
    const result = spawnSync(
      process.execPath,
      [resolve(
        repositoryRoot,
        'scripts/verify-auth-bridge-notification-prepared-receipt.mjs',
      )],
      {
        cwd: repositoryRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          WARPKEEP_AUTH_BRIDGE_NOTIFICATION_PREPARED_RECEIPT_PATH: privatePath,
        },
      },
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(/^AUTH_BRIDGE_PREPARED_[A-Z_]+\n$/u);
    expect(result.stderr).not.toContain(privatePath);
  });
});
