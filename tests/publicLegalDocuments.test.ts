import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  WARPKEEP_ENTRY_AGREEMENT_VERSION,
  WARPKEEP_HEGEMONY_SOCIAL_CONTRACT_VERSION,
} from '../src/legal/alphaTermsPolicy';
import {
  resolvePublicDocumentUrl,
  WARPKEEP_ALPHA_PRIVACY_URL,
  WARPKEEP_ALPHA_TERMS_URL,
  WARPKEEP_HEGEMONY_SOCIAL_CONTRACT_URL,
} from '../src/legal/publicDocuments';

const termsHtml = readFileSync('public/terms/index.html', 'utf8');
const socialContractHtml = readFileSync('public/social-contract/index.html', 'utf8');
const privacyHtml = readFileSync('public/privacy/index.html', 'utf8');
const legalCss = readFileSync('public/legal/warpkeep-legal.css', 'utf8');

const strictPublicLegalCsp =
  "default-src 'none'; style-src 'self'; base-uri 'none'; form-action 'none'";

function parse(html: string) {
  return new DOMParser().parseFromString(html, 'text/html');
}

function textContent(html: string) {
  return parse(html).body.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

const termsText = textContent(termsHtml);
const socialContractText = textContent(socialContractHtml);
const privacyText = textContent(privacyHtml);

const publicDocuments = [
  {
    name: 'Alpha Terms',
    html: termsHtml,
    canonicalUrl: 'https://warpkeep.com/terms/',
  },
  {
    name: 'Hegemony Social Contract',
    html: socialContractHtml,
    canonicalUrl: 'https://warpkeep.com/social-contract/',
  },
  {
    name: 'Privacy Notice',
    html: privacyHtml,
    canonicalUrl: 'https://warpkeep.com/privacy/',
  },
] as const;

describe('public Alpha legal documents', () => {
  it('keeps stable deployment-base-aware URLs and canonical public routes', () => {
    expect(WARPKEEP_ALPHA_TERMS_URL).toBe('/terms/index.html');
    expect(WARPKEEP_HEGEMONY_SOCIAL_CONTRACT_URL).toBe('/social-contract/index.html');
    expect(WARPKEEP_ALPHA_PRIVACY_URL).toBe('/privacy/index.html');
    expect(resolvePublicDocumentUrl('/Warpkeep/', '/terms/index.html'))
      .toBe('/Warpkeep/terms/index.html');
    expect(resolvePublicDocumentUrl('/Warpkeep', 'social-contract/index.html'))
      .toBe('/Warpkeep/social-contract/index.html');
    expect(resolvePublicDocumentUrl('/Warpkeep', 'privacy/index.html'))
      .toBe('/Warpkeep/privacy/index.html');

    for (const document of publicDocuments) {
      const parsed = parse(document.html);
      expect(parsed.querySelector('link[rel="canonical"]')?.getAttribute('href'))
        .toBe(document.canonicalUrl);
    }
  });

  it('uses one main landmark and one ordered, current-aware legal navigation per document', () => {
    const expectedNames = ['Alpha Terms', 'Hegemony Social Contract', 'Privacy Notice'];

    for (const publicDocument of publicDocuments) {
      const document = parse(publicDocument.html);
      expect(document.querySelectorAll('main')).toHaveLength(1);
      expect(document.querySelector('article main, main main')).toBeNull();
      expect(document.querySelector('main h1')).not.toBeNull();

      const navigation = document.querySelector('nav');
      expect(navigation).not.toBeNull();
      const documentLinks = navigation!.querySelectorAll('.legal-nav__documents a');
      expect([...documentLinks].map(link => link.textContent?.trim())).toEqual(expectedNames);
      for (const link of documentLinks) {
        expect(link.getAttribute('href')).toMatch(
          /(?:^\.\/|^\.\.\/(?:terms|social-contract|privacy)\/)index\.html$/,
        );
      }

      const currentLinks = navigation!.querySelectorAll('.legal-nav__documents a[aria-current="page"]');
      expect(currentLinks).toHaveLength(1);
      expect(currentLinks[0]?.textContent?.trim()).toBe(publicDocument.name);
    }
  });

  it('is script-free, CSP-hardened, self-styled, and hardens every new-tab link', () => {
    for (const publicDocument of publicDocuments) {
      const document = parse(publicDocument.html);
      expect(document.querySelector('script')).toBeNull();
      expect(document.querySelector('form')).toBeNull();
      expect(document.querySelector('meta[http-equiv="Content-Security-Policy"]')
        ?.getAttribute('content')).toBe(strictPublicLegalCsp);
      expect(document.querySelector('meta[name="referrer"]')?.getAttribute('content'))
        .toBe('no-referrer');
      expect(document.querySelector('link[rel="stylesheet"]')?.getAttribute('href'))
        .toBe('../legal/warpkeep-legal.css');

      for (const link of document.querySelectorAll<HTMLAnchorElement>('a[target="_blank"]')) {
        expect(link.rel.split(/\s+/)).toEqual(expect.arrayContaining(['noopener', 'noreferrer']));
      }

      for (const asset of document.querySelectorAll(
        'img, source, video, audio, script, iframe, object, embed',
      )) {
        expect(asset.getAttribute('src') ?? asset.getAttribute('data')).not.toMatch(/^https?:/i);
      }
    }

    expect(legalCss).toContain('env(safe-area-inset-top)');
    expect(legalCss).toContain('@media (max-width: 520px)');
    expect(legalCss).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('binds Alpha Terms to the current two-document entry agreement without adding a Privacy consent', () => {
    expect(termsText).toContain('Hegemony Social Contract');
    expect(termsText).toContain(WARPKEEP_ENTRY_AGREEMENT_VERSION);
    expect(termsText).toContain(WARPKEEP_HEGEMONY_SOCIAL_CONTRACT_VERSION);
    expect(termsText).toContain('developed and operated by one person');
    expect(termsText).toContain('may change, break, pause, or be reset');
    expect(termsText).toContain('will not earn or entitle you to tokens, airdrops, allocations');
    expect(termsText).toContain('Marks are non-transferable, non-redeemable accounting units');
    expect(termsText).toContain('does not ask the browser to connect a wallet');
    expect(termsText).toContain('not sponsored, operated, or endorsed by Farcaster');
    expect(termsText).toContain('Formal legal review remains necessary');
    expect(termsText).toContain('core strategy gameplay loop is not implemented yet');
    expect(termsText).toContain('persistent visual preview of a living world');
    expect(termsText).toContain('Warpkeep is open source');
    expect(termsText).toContain('does not guarantee that a suggestion');
    expect(termsText).toContain('Access is allowlist gated and conditional');
    expect(termsText).not.toContain('tokens, points, airdrops');
  });

  it('keeps the Hegemony covenant concise about fiction, conduct, and unfinished systems', () => {
    for (const expected of [
      'Hegemony',
      'Article II',
      'Article III',
      'Article VI',
      'Honest counsel strengthens',
      'Criticizing Warpkeep',
      'Threats',
      'core strategy loop',
      'Hegemony is game fiction',
      'warn, limit, suspend, or revoke',
    ]) expect(socialContractText).toContain(expected);
    for (const absent of ['Ouster', 'IP-level bans', 'Tribute is final']) {
      expect(socialContractText).not.toContain(absent);
    }
  });

  it('keeps privacy disclosures factual while limiting entry-agreement evidence to the stated record', () => {
    for (const expected of [
      'single-developer project',
      'private, versioned acceptance evidence',
      'Privacy contact request',
      'accepts, stores, and issues only the verified FID as session identity',
      'Cloudflare supplies the connecting IP',
      'SpacetimeDB stores admission, ownership, world, player',
      'Application logs are designed not to contain FIDs',
      'Authority expires after at most ten minutes',
      'at most fifteen seconds',
      'frozen legacy public player schema',
      'Private deployment checks read only its aggregate row count',
      'require it to remain empty',
      'finalized public Ethereum mainnet events',
      'wallet associations remain private operator state',
      'browser never scans wallets',
      'non-transferable, non-redeemable, without cash value',
      'Only privacy-bounded aggregate figures become public game state',
      'no-referrer browser policy',
      'No fixed Alpha deletion schedule yet',
      'Legal bases where applicable',
      'processed in multiple countries',
      'access, correct, erase, restrict',
      'privacy or data-protection authority that applies',
      'does not use player data for credit scoring',
      'Alpha participation earns none of those benefits',
      'Hegemony Social Contract',
      WARPKEEP_HEGEMONY_SOCIAL_CONTRACT_VERSION,
      WARPKEEP_ENTRY_AGREEMENT_VERSION,
      'cryptographically binds the exact visible Terms and Social Contract texts',
    ]) expect(privacyText).toContain(expected);

    expect(privacyText).toMatch(/FID.*entry.agreement.*accept(?:ed|ance).*(?:time|timestamp)/i);
    expect(privacyText).toMatch(/not (?:this )?Privacy Notice.*blanket privacy consent/i);
    expect(privacyText).not.toContain('world, player, faction');
    expect(privacyText).not.toContain('tokens, points, airdrops');
  });

  it('keeps the narrow-screen retention table a labelled keyboard scroll region', () => {
    const privacy = parse(privacyHtml);
    const retention = privacy.querySelector('#retention');
    const tableRegion = privacy.querySelector('.legal-table-wrap');

    expect(retention).not.toBeNull();
    expect(tableRegion?.getAttribute('role')).toBe('region');
    expect(tableRegion?.getAttribute('tabindex')).toBe('0');
    expect(tableRegion?.getAttribute('aria-labelledby')).toBe('retention');
    expect(tableRegion?.querySelector('table')).not.toBeNull();
    expect(privacyText).toContain('Versioned entry-agreement acceptance evidence');
    expect(legalCss).toContain('.legal-table-wrap:focus-visible');
    expect(legalCss).toContain('overflow-x: auto');
  });
});
