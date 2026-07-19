import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  WARPKEEP_ALPHA_TERMS_VERSION,
  WARPKEEP_ENTRY_AGREEMENT_ACCEPTANCE_RECORDS_PER_FID_MAXIMUM,
  WARPKEEP_ENTRY_AGREEMENT_EVIDENCE_VERSIONS,
  WARPKEEP_ENTRY_AGREEMENT_VERSION,
  WARPKEEP_HISTORICAL_ENTRY_AGREEMENT_VERSIONS,
} from '../src/entryAgreementPolicy';
import {
  WARPKEEP_ALPHA_TERMS_VERSION as REEXPORTED_ALPHA_TERMS_VERSION,
  WARPKEEP_ENTRY_AGREEMENT_VERSION as REEXPORTED_ENTRY_AGREEMENT_VERSION,
} from '../src/marksAuthorityPolicy';

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

test('the current Hegemony entry agreement preserves the deployed Terms-shaped version alias', () => {
  assert.equal(
    WARPKEEP_ENTRY_AGREEMENT_VERSION,
    '2026-07-19-hegemony-entry-agreement-v2',
  );
  assert.equal(WARPKEEP_ALPHA_TERMS_VERSION, WARPKEEP_ENTRY_AGREEMENT_VERSION);
  assert.equal(REEXPORTED_ALPHA_TERMS_VERSION, WARPKEEP_ENTRY_AGREEMENT_VERSION);
  assert.equal(REEXPORTED_ENTRY_AGREEMENT_VERSION, WARPKEEP_ENTRY_AGREEMENT_VERSION);
});

test('historical immutable evidence remains bounded and never becomes the current version', () => {
  assert.deepEqual(WARPKEEP_HISTORICAL_ENTRY_AGREEMENT_VERSIONS, [
    '2026-07-18-hegemony-entry-agreement-v1',
    '2026-07-14',
  ]);
  assert.deepEqual(WARPKEEP_ENTRY_AGREEMENT_EVIDENCE_VERSIONS, [
    WARPKEEP_ENTRY_AGREEMENT_VERSION,
    ...WARPKEEP_HISTORICAL_ENTRY_AGREEMENT_VERSIONS,
  ]);
  assert.ok(Object.isFrozen(WARPKEEP_ENTRY_AGREEMENT_EVIDENCE_VERSIONS));
  assert.ok(!WARPKEEP_HISTORICAL_ENTRY_AGREEMENT_VERSIONS.includes(
    WARPKEEP_ENTRY_AGREEMENT_VERSION,
  ));
  assert.equal(
    WARPKEEP_ENTRY_AGREEMENT_ACCEPTANCE_RECORDS_PER_FID_MAXIMUM,
    WARPKEEP_ENTRY_AGREEMENT_EVIDENCE_VERSIONS.length,
  );
});

test('the current reducer wire and gameplay gate remain exact-current while Marks retain bounded history', () => {
  const admission = source('../src/reducers/admission.ts');
  const auth = source('../src/auth.ts');
  const admin = source('../src/reducers/admin.ts');

  assert.match(admission, /\{ name: 'accept_alpha_terms_v1' \}/);
  assert.match(admission, /\{ termsVersion: t\.string\(\), accepted: t\.bool\(\) \}/);
  assert.match(admission, /termsVersion !== WARPKEEP_ALPHA_TERMS_VERSION/);
  assert.match(admission, /acceptanceKey = `\$\{claims\.fid\}:\$\{WARPKEEP_ALPHA_TERMS_VERSION\}`/);

  assert.match(auth, /acceptanceKey = `\$\{admitted\.claims\.fid\}:\$\{WARPKEEP_ALPHA_TERMS_VERSION\}`/);
  assert.match(auth, /acceptance\.termsVersion !== WARPKEEP_ALPHA_TERMS_VERSION/);
  assert.doesNotMatch(auth, /WARPKEEP_ENTRY_AGREEMENT_EVIDENCE_VERSIONS/);

  assert.match(admin, /hasRetainedEntryAgreementEvidence/);
  assert.match(admin, /WARPKEEP_ENTRY_AGREEMENT_EVIDENCE_VERSIONS\.some/);
  assert.match(admin, /fid \+ ':' \+ entryAgreementVersion/);
  assert.match(admin, /acceptance\.termsVersion === entryAgreementVersion/);
  assert.match(admin, /entryAgreementAcceptanceCounts = new Map<bigint, number>\(\)/);
  assert.match(
    admin,
    /acceptanceCount > WARPKEEP_ENTRY_AGREEMENT_ACCEPTANCE_RECORDS_PER_FID_MAXIMUM/,
  );
});
