import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  resolvePublicDocumentUrl,
  WARPKEEP_ALPHA_PRIVACY_URL,
  WARPKEEP_ALPHA_TERMS_URL
} from '../src/legal/publicDocuments';

const termsHtml = readFileSync('public/terms/index.html', 'utf8');
const privacyHtml = readFileSync('public/privacy/index.html', 'utf8');
const legalCss = readFileSync('public/legal/warpkeep-legal.css', 'utf8');

function parse(html: string) {
  return new DOMParser().parseFromString(html, 'text/html');
}

function textContent(html: string) {
  return parse(html).body.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

const termsText = textContent(termsHtml);
const privacyText = textContent(privacyHtml);

describe('public Alpha legal documents', () => {
  it('keeps stable deployment-base-aware URLs and canonical public routes', () => {
    expect(WARPKEEP_ALPHA_TERMS_URL).toBe('/terms/index.html');
    expect(WARPKEEP_ALPHA_PRIVACY_URL).toBe('/privacy/index.html');
    expect(resolvePublicDocumentUrl('/Warpkeep/', '/terms/index.html'))
      .toBe('/Warpkeep/terms/index.html');
    expect(resolvePublicDocumentUrl('/Warpkeep', 'privacy/index.html'))
      .toBe('/Warpkeep/privacy/index.html');

    const terms = parse(termsHtml);
    const privacy = parse(privacyHtml);
    expect(terms.querySelector('link[rel="canonical"]')?.getAttribute('href'))
      .toBe('https://warpkeep.com/terms/');
    expect(privacy.querySelector('link[rel="canonical"]')?.getAttribute('href'))
      .toBe('https://warpkeep.com/privacy/');
    expect(terms.querySelector('a[href="../privacy/index.html"]')).not.toBeNull();
    expect(privacy.querySelector('a[href="../terms/index.html"]')).not.toBeNull();
  });

  it('uses one valid main landmark per document', () => {
    for (const html of [termsHtml, privacyHtml]) {
      const document = parse(html);
      expect(document.querySelectorAll('main')).toHaveLength(1);
      expect(document.querySelector('article main, main main')).toBeNull();
      expect(document.querySelector('main h1')).not.toBeNull();
    }
  });

  it('publishes the required factual Alpha and no-reward terms', () => {
    expect(termsText).toContain('Last updated 14 July 2026');
    expect(termsText).toContain('developed and operated by one person');
    expect(termsText).toContain('may change, break, pause, or be reset');
    expect(termsText).toContain('will not earn or entitle you to rewards, tokens, points, airdrops');
    expect(termsText).toContain('There is no current promise of SNAP-linked rewards.');
    expect(termsText).toContain('does not guarantee an airdrop, reward, or gain');
    expect(termsText).toContain('not sponsored, operated, or endorsed by Farcaster');
    expect(termsText).toContain('not a legal-compliance certification');
  });

  it('states actual identity, session, public-state, retention, and rights limits', () => {
    for (const expected of [
      'Last updated 14 July 2026',
      'single-developer project',
      'Privacy contact request',
      'accepts, stores, and issues only the verified FID as identity',
      'Cloudflare supplies the connecting IP',
      'SpacetimeDB stores admission, ownership, world, player',
      'Application logs are designed not to contain FIDs',
      'Authority expires after at most ten minutes',
      'browser suspension can delay cleanup without extending token authority',
      'at most fifteen seconds',
      'credential expiry does not itself close that subscription',
      'frozen legacy public player schema',
      'production verification requires it to remain empty',
      'authority and active-use windows, not promises',
      'Storage denial may leave the physical key',
      'a later reload may continue to treat an unexpired leftover marker as logout intent',
      'server authority still expires after thirty days',
      'No fixed Alpha deletion schedule yet',
      'Legal bases where applicable',
      'Services, recipients, and locations',
      'processed in multiple countries',
      'access, correct, erase, restrict',
      'privacy or data-protection authority that applies',
      'does not use player data for credit scoring',
      'Alpha participation earns none of those benefits'
    ]) {
      expect(privacyText).toContain(expected);
    }

    expect(privacyText).not.toContain('world, player, faction');
  });

  it('makes the narrow-screen retention table a labelled keyboard scroll region', () => {
    const privacy = parse(privacyHtml);
    const retention = privacy.querySelector('#retention');
    const tableRegion = privacy.querySelector('.legal-table-wrap');

    expect(retention).not.toBeNull();
    expect(tableRegion?.getAttribute('role')).toBe('region');
    expect(tableRegion?.getAttribute('tabindex')).toBe('0');
    expect(tableRegion?.getAttribute('aria-labelledby')).toBe('retention');
    expect(tableRegion?.querySelector('table')).not.toBeNull();
    expect(legalCss).toContain('.legal-table-wrap:focus-visible');
    expect(legalCss).toContain('overflow-x: auto');
  });

  it('uses script-free, self-styled pages and hardens every new-tab link', () => {
    for (const html of [termsHtml, privacyHtml]) {
      const document = parse(html);
      expect(document.querySelector('script')).toBeNull();
      expect(document.querySelector('meta[http-equiv="Content-Security-Policy"]'))
        .not.toBeNull();
      for (const link of document.querySelectorAll<HTMLAnchorElement>('a[target="_blank"]')) {
        expect(link.rel.split(/\s+/)).toEqual(expect.arrayContaining(['noopener', 'noreferrer']));
      }
    }

    expect(legalCss).toContain('env(safe-area-inset-top)');
    expect(legalCss).toContain('@media (max-width: 520px)');
    expect(legalCss).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
