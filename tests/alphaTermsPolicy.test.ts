import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  WARPKEEP_ALPHA_TERMS_TEXT_SHA256,
  WARPKEEP_ALPHA_TERMS_VERSION
} from '../src/legal/alphaTermsPolicy';
import { WARPKEEP_ALPHA_TERMS_VERSION as MODULE_ALPHA_TERMS_VERSION } from '../spacetimedb/src/marksAuthorityPolicy';

const termsHtml = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../public/terms/index.html'),
  'utf8'
);

function normalizedTermsText(html: string) {
  const parsedDocument = new DOMParser().parseFromString(html, 'text/html');
  const main = parsedDocument.querySelector('main');
  if (!main) throw new Error('Canonical Alpha Terms must contain one main document.');
  return main.textContent.replace(/\s+/g, ' ').trim();
}

describe('Alpha Terms version binding', () => {
  it('keeps browser and server acceptance authority on one exact version', () => {
    expect(WARPKEEP_ALPHA_TERMS_VERSION).toBe(MODULE_ALPHA_TERMS_VERSION);
  });

  it('fails when canonical visible Terms wording drifts without policy review', () => {
    const digest = createHash('sha256')
      .update(normalizedTermsText(termsHtml))
      .digest('hex');

    expect(digest).toBe(WARPKEEP_ALPHA_TERMS_TEXT_SHA256);
  });
});
