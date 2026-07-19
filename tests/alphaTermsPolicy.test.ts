import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  WARPKEEP_ALPHA_TERMS_TEXT_SHA256,
  WARPKEEP_ALPHA_TERMS_VERSION,
  WARPKEEP_ENTRY_AGREEMENT_VERSION,
  WARPKEEP_HEGEMONY_SOCIAL_CONTRACT_TEXT_SHA256,
  WARPKEEP_HEGEMONY_SOCIAL_CONTRACT_VERSION,
} from '../src/legal/alphaTermsPolicy';
import {
  WARPKEEP_ALPHA_TERMS_VERSION as MODULE_ALPHA_TERMS_VERSION,
  WARPKEEP_ENTRY_AGREEMENT_VERSION as MODULE_ENTRY_AGREEMENT_VERSION,
} from '../spacetimedb/src/marksAuthorityPolicy';
import {
  WARPKEEP_ENTRY_AGREEMENT_ACCEPTANCE_RECORDS_PER_FID_MAXIMUM,
  WARPKEEP_ENTRY_AGREEMENT_EVIDENCE_VERSIONS,
  WARPKEEP_HISTORICAL_ENTRY_AGREEMENT_VERSIONS,
} from '../spacetimedb/src/entryAgreementPolicy';
import {
  WARPKEEP_ENTRY_AGREEMENT_ACCEPTANCE_RECORDS_PER_FID_MAXIMUM as TOOLING_ENTRY_AGREEMENT_ACCEPTANCE_RECORDS_PER_FID_MAXIMUM,
  WARPKEEP_ENTRY_AGREEMENT_EVIDENCE_VERSIONS as TOOLING_ENTRY_AGREEMENT_EVIDENCE_VERSIONS,
  WARPKEEP_ENTRY_AGREEMENT_VERSION as TOOLING_ENTRY_AGREEMENT_VERSION,
  WARPKEEP_HISTORICAL_ENTRY_AGREEMENT_VERSIONS as TOOLING_HISTORICAL_ENTRY_AGREEMENT_VERSIONS,
} from '../scripts/entry-agreement-policy.mjs';

const termsHtml = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../public/terms/index.html'),
  'utf8'
);
const socialContractHtml = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../public/social-contract/index.html'),
  'utf8'
);

function normalizedPublicDocumentText(html: string, documentName: string) {
  const parsedDocument = new DOMParser().parseFromString(html, 'text/html');
  const main = parsedDocument.querySelector('main');
  if (!main) throw new Error(`Canonical ${documentName} must contain one main document.`);
  return main.textContent.replace(/\s+/g, ' ').trim();
}

describe('versioned Alpha entry-agreement binding', () => {
  it('keeps browser and server acceptance authority on the exact current bundle', () => {
    expect(WARPKEEP_ALPHA_TERMS_VERSION).toBe(MODULE_ALPHA_TERMS_VERSION);
    expect(WARPKEEP_ENTRY_AGREEMENT_VERSION).toBe(MODULE_ENTRY_AGREEMENT_VERSION);
    expect(WARPKEEP_ALPHA_TERMS_VERSION).toBe(WARPKEEP_ENTRY_AGREEMENT_VERSION);
    expect(WARPKEEP_ENTRY_AGREEMENT_VERSION).toBe(
      '2026-07-19-hegemony-entry-agreement-v3',
    );
    expect(WARPKEEP_HEGEMONY_SOCIAL_CONTRACT_VERSION).toBe(
      '2026-07-19-HEGEMONY-SOCIAL-CONTRACT-V3',
    );
    expect(WARPKEEP_ENTRY_AGREEMENT_VERSION).toBe(
      '2026-07-19-hegemony-entry-agreement-v3',
    );
    expect(WARPKEEP_ENTRY_AGREEMENT_VERSION).not.toBe('2026-07-14');
  });

  it('keeps historical evidence distinct from the current entry/gameplay version', () => {
    expect(WARPKEEP_HISTORICAL_ENTRY_AGREEMENT_VERSIONS).toContain('2026-07-14');
    expect(WARPKEEP_HISTORICAL_ENTRY_AGREEMENT_VERSIONS)
      .toContain('2026-07-19-hegemony-entry-agreement-v2');
    expect(WARPKEEP_HISTORICAL_ENTRY_AGREEMENT_VERSIONS)
      .toContain('2026-07-18-hegemony-entry-agreement-v1');
    expect(WARPKEEP_HISTORICAL_ENTRY_AGREEMENT_VERSIONS).not.toContain(
      WARPKEEP_ENTRY_AGREEMENT_VERSION,
    );
    expect(WARPKEEP_ENTRY_AGREEMENT_EVIDENCE_VERSIONS).toEqual([
      WARPKEEP_ENTRY_AGREEMENT_VERSION,
      ...WARPKEEP_HISTORICAL_ENTRY_AGREEMENT_VERSIONS,
    ]);
    expect(WARPKEEP_ENTRY_AGREEMENT_ACCEPTANCE_RECORDS_PER_FID_MAXIMUM)
      .toBe(WARPKEEP_ENTRY_AGREEMENT_EVIDENCE_VERSIONS.length);
    expect(TOOLING_ENTRY_AGREEMENT_VERSION).toBe(WARPKEEP_ENTRY_AGREEMENT_VERSION);
    expect(TOOLING_HISTORICAL_ENTRY_AGREEMENT_VERSIONS)
      .toEqual(WARPKEEP_HISTORICAL_ENTRY_AGREEMENT_VERSIONS);
    expect(TOOLING_ENTRY_AGREEMENT_EVIDENCE_VERSIONS)
      .toEqual(WARPKEEP_ENTRY_AGREEMENT_EVIDENCE_VERSIONS);
    expect(TOOLING_ENTRY_AGREEMENT_ACCEPTANCE_RECORDS_PER_FID_MAXIMUM)
      .toBe(WARPKEEP_ENTRY_AGREEMENT_ACCEPTANCE_RECORDS_PER_FID_MAXIMUM);
  });

  it.each([
    [
      'Alpha Terms',
      termsHtml,
      WARPKEEP_ALPHA_TERMS_TEXT_SHA256,
      [
        WARPKEEP_ENTRY_AGREEMENT_VERSION,
        WARPKEEP_HEGEMONY_SOCIAL_CONTRACT_VERSION,
      ],
    ],
    [
      'Hegemony Social Contract',
      socialContractHtml,
      WARPKEEP_HEGEMONY_SOCIAL_CONTRACT_TEXT_SHA256,
      [WARPKEEP_HEGEMONY_SOCIAL_CONTRACT_VERSION],
    ],
  ] as const)(
    'fails when canonical visible %s wording drifts without policy review',
    (documentName, html, expectedDigest, requiredVersions) => {
      const visibleText = normalizedPublicDocumentText(html, documentName);
      const digest = createHash('sha256').update(visibleText).digest('hex');

      expect(digest).toBe(expectedDigest);
      for (const version of requiredVersions) expect(visibleText).toContain(version);
    },
  );
});
