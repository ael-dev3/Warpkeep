import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveDeploymentBase } from '../vite.config';

describe('Warpkeep deployment base and canonical metadata', () => {
  it('keeps root as the default/custom-domain base while retaining the legacy project-path build', () => {
    expect(resolveDeploymentBase({})).toBe('/');
    expect(resolveDeploymentBase({ GITHUB_PAGES: 'true' })).toBe('/Warpkeep/');
    expect(resolveDeploymentBase({ GITHUB_PAGES: 'true', DEPLOY_BASE: '/' })).toBe('/');
    expect(resolveDeploymentBase({ DEPLOY_BASE: '/Warpkeep' })).toBe('/Warpkeep/');
    expect(() => resolveDeploymentBase({ DEPLOY_BASE: 'https://attacker.example/' })).toThrow(/DEPLOY_BASE/i);
  });

  it('declares warpkeep.com as the canonical and Open Graph URL', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
    expect(html).toContain('<link rel="canonical" href="https://warpkeep.com/" />');
    expect(html).toContain('<meta property="og:url" content="https://warpkeep.com/" />');
    expect(html).toContain('<meta name="description" content="Warpkeep: Every FID has a castle." />');
  });
});
