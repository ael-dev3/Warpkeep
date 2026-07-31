import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(import.meta.dirname, '..');

function read(path: string): string {
  return readFileSync(resolve(repositoryRoot, path), 'utf8');
}

describe('retired SNAP-burn product surface', () => {
  it('does not ship the former scanner, operator, or wallet-attribution policy', () => {
    for (const path of [
      'scripts/marks/marks-operator.ts',
      'scripts/marks/operator-core.ts',
      'scripts/marks/operator-transport.ts',
      'scripts/marks/snap-burn-policy.ts',
      'scripts/marks/launchd/com.warpkeep.marks-scan.plist.template',
      'scripts/marks/launchd/marks-keychain-wrapper.zsh.template',
      'spacetimedb/src/scanBatchPolicy.ts',
    ]) expect(existsSync(resolve(repositoryRoot, path)), path).toBe(false);

    const packageJson = JSON.parse(read('package.json')) as {
      scripts?: Readonly<Record<string, string>>;
    };
    for (const command of [
      'marks:plan',
      'marks:scan',
      'marks:apply',
      'marks:reconcile',
      'marks:inspect',
    ]) expect(packageJson.scripts?.[command], command).toBeUndefined();

    const profilePolicy = read('spacetimedb/src/profileAuthorityPolicy.ts');
    expect(profilePolicy).not.toContain('FARCASTER_WALLET_POLICY_VERSION');
    expect(profilePolicy).not.toContain('normalizeTrustedWalletAttribution');
  });

  it('keeps current player-facing Marks surfaces independent of SNAP and burning', () => {
    for (const path of [
      'docs/gameplay/marks-policy-v1.md',
      'docs/operations/daily-marks.md',
      'public/privacy/index.html',
      'public/social-contract/index.html',
      'public/terms/index.html',
      'src/components/realm/CastleInspectionPanel.tsx',
      'src/components/realm/realmCastlePresentation.ts',
      'src/marks/marksPolicy.ts',
      'src/spacetime/warpkeepBackendTypes.ts',
    ]) {
      const productSurface = read(path);
      expect(productSurface, path).not.toMatch(/\bSNAP\b|\bburn(?:ed|ing|s)?\b/iu);
    }
  });

  it('exports only the fixed admitted-player daily policy from browser accounting', () => {
    const policy = read('src/marks/marksPolicy.ts');
    expect(policy).toContain("MARK_DAILY_GRANT_POLICY_ID = 'admitted-daily-mark-v1'");
    expect(policy).toContain('MICROS_PER_MARK = 1_000_000n');
    expect(policy).not.toContain('snapMicrosToMarkMicros');
    expect(policy).not.toContain('MARK_ATTRIBUTION_POLICY_ID');
  });
});
