// @vitest-environment node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import {
  authBridgeNotificationB0PolicyTestSeams,
} from '../scripts/verify-auth-bridge-notification-b0-policy.mjs';

const repository = resolve(import.meta.dirname, '..');
const workflowPath = resolve(
  repository,
  '.github/workflows/notification-bridge-b0.yml',
);
const workflowSource = readFileSync(workflowPath, 'utf8');
const workflow = parse(workflowSource) as Record<string, unknown>;
const runtimeSource = readFileSync(resolve(
  repository,
  'scripts/auth-bridge-notification-b0-cloudflare-runtime.mjs',
), 'utf8');
const predecessorReattestation =
  'await assertPredecessorStable(Object.freeze({';
const policyTestSeams = authBridgeNotificationB0PolicyTestSeams!;

describe('notification bridge B0 protected workflow', () => {
  it('is manual-only, protected-main-only, and repository-exclusive', () => {
    expect(workflowSource).toContain('workflow_dispatch:');
    expect(workflowSource).not.toMatch(/\b(?:push|schedule|pull_request):/u);
    expect(workflowSource).toContain("GITHUB_REF\" != 'refs/heads/main'");
    expect(workflowSource).toContain(
      "gh api \"repos/ael-dev3/Warpkeep/branches/main\"",
    );
    expect(workflowSource).toContain(
      'runs-on: [self-hosted, macOS, ARM64, warpkeep-production-admin, warpkeep-repository-exclusive]',
    );
    expect(workflowSource).not.toContain('ubuntu-latest');
    expect(workflowSource).toContain('persist-credentials: false');
    expect(workflowSource).toContain('clean: true');
    expect(workflowSource).toContain('fetch-depth: 1');
    expect(workflow).toBeTruthy();
  });

  it('loads only the existing four workflow credentials and never the seventh secret', () => {
    const expected = [
      'GITHUB_TOKEN',
      'WARPKEEP_AUTH_BRIDGE_ACCOUNT_ID',
      'WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN',
      'WARPKEEP_AUTH_BRIDGE_ZONE_ID',
      'WARPKEEP_PRODUCTION_ADMIN_TOKEN',
    ];
    for (const name of expected) expect(workflowSource).toContain(name);
    expect(workflowSource).not.toContain('PLAYER_CANARY_OWNER_FID');
    expect(workflowSource).not.toContain('WARPKEEP_PLAYER_CANARY_OWNER_FID');
    expect(workflowSource).not.toMatch(/\bsecrets:\s*inherit\b/u);
    expect(workflowSource).not.toMatch(/wrangler\s+(?:deploy|versions|secret)/u);
  });

  it('keeps all downstream activation gates inert and executes only the B0 entrypoint', () => {
    expect(workflowSource).toContain(
      "WARPKEEP_BRIDGE_NOTIFICATION_DELIVERY_ENABLED: 'true'",
    );
    expect(workflowSource).toContain(
      "WARPKEEP_HERMES_EXECUTION_APPROVED: 'false'",
    );
    expect(workflowSource).toContain(
      "WARPKEEP_PAGES_PRESENTATION_ENABLED: 'false'",
    );
    expect(workflowSource).not.toContain('0.3.44');
    expect(workflowSource).not.toContain('0.4.');
    expect(workflowSource).not.toContain('deploy-pages');
    expect(workflowSource).not.toContain('spacetime publish');
    expect(workflowSource).not.toContain('production-player-canary');
    expect(workflowSource).toContain(
      'node scripts/verify-auth-bridge-notification-b0-policy.mjs',
    );
    expect(workflowSource.match(
      /node scripts\/auth-bridge-notification-b0-deploy\.mjs/g,
    )).toHaveLength(2);
  });

  it('always attempts one recovery pass after a failed guarded invocation', () => {
    expect(workflowSource).toContain('continue-on-error: true');
    expect(workflowSource).toContain(
      "steps.deploy.outputs.attempted == 'true' && steps.deploy.outcome != 'success'",
    );
    expect(workflowSource).toContain(
      'AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_OR_RECOVERY_UNVERIFIED',
    );
  });

  it('rejects both missing and surplus predecessor reattestation boundaries', () => {
    const missingBoundary = runtimeSource.replace(predecessorReattestation, '');
    const surplusBoundary = runtimeSource.replace(
      predecessorReattestation,
      `${predecessorReattestation}${predecessorReattestation}`,
    );

    expect(() => policyTestSeams.assertExactPredecessorReattestationCount(
      runtimeSource,
    )).not.toThrow();
    expect(() => policyTestSeams.assertExactPredecessorReattestationCount(
      missingBoundary,
    )).toThrow('AUTH_BRIDGE_NOTIFICATION_B0_RUNTIME_BOUNDARY_INVALID');
    expect(() => policyTestSeams.assertExactPredecessorReattestationCount(
      surplusBoundary,
    )).toThrow('AUTH_BRIDGE_NOTIFICATION_B0_RUNTIME_BOUNDARY_INVALID');
  });
});
