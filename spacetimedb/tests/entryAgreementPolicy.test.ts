import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  EntryAgreementStatusConflictError,
  readCurrentEntryAgreementStatusV1,
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
    '2026-07-19-hegemony-entry-agreement-v3',
  );
  assert.equal(WARPKEEP_ALPHA_TERMS_VERSION, WARPKEEP_ENTRY_AGREEMENT_VERSION);
  assert.equal(REEXPORTED_ALPHA_TERMS_VERSION, WARPKEEP_ENTRY_AGREEMENT_VERSION);
  assert.equal(REEXPORTED_ENTRY_AGREEMENT_VERSION, WARPKEEP_ENTRY_AGREEMENT_VERSION);
});

test('historical immutable evidence remains bounded and never becomes the current version', () => {
  assert.deepEqual(WARPKEEP_HISTORICAL_ENTRY_AGREEMENT_VERSIONS, [
    '2026-07-19-hegemony-entry-agreement-v2',
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

test('caller status reports missing exact-current evidence without mutation', () => {
  const fid = 539_854n;
  const lookupKeys: string[] = [];
  let mutationCount = 0;
  const acceptanceTable = {
    find(acceptanceKey: string) {
      lookupKeys.push(acceptanceKey);
      return null;
    },
    insert() {
      mutationCount += 1;
    },
    update() {
      mutationCount += 1;
    },
    delete() {
      mutationCount += 1;
    },
  };

  const result = readCurrentEntryAgreementStatusV1(
    () => fid,
    acceptanceKey => acceptanceTable.find(acceptanceKey),
  );

  assert.deepEqual(result, {
    requiredVersion: WARPKEEP_ALPHA_TERMS_VERSION,
    acceptedCurrent: false,
  });
  assert.deepEqual(lookupKeys, [
    `${fid}:${WARPKEEP_ALPHA_TERMS_VERSION}`,
  ]);
  assert.equal(mutationCount, 0);
  assert.ok(Object.isFrozen(result));
});

test('caller status accepts only one exact-current row for the admitted FID', () => {
  const fid = 1_020_848n;
  const acceptanceKey = `${fid}:${WARPKEEP_ALPHA_TERMS_VERSION}`;
  const exactEvidence = Object.freeze({
    acceptanceKey,
    fid,
    termsVersion: WARPKEEP_ALPHA_TERMS_VERSION,
  });

  assert.deepEqual(
    readCurrentEntryAgreementStatusV1(
      () => fid,
      requestedKey => requestedKey === acceptanceKey ? exactEvidence : null,
    ),
    {
      requiredVersion: WARPKEEP_ALPHA_TERMS_VERSION,
      acceptedCurrent: true,
    },
  );
});

test('caller status rejects corrupt key, FID, and version evidence', () => {
  const fid = 873_944n;
  const acceptanceKey = `${fid}:${WARPKEEP_ALPHA_TERMS_VERSION}`;
  const corruptEvidence = [
    {
      acceptanceKey: `wrong:${WARPKEEP_ALPHA_TERMS_VERSION}`,
      fid,
      termsVersion: WARPKEEP_ALPHA_TERMS_VERSION,
    },
    {
      acceptanceKey,
      fid: fid + 1n,
      termsVersion: WARPKEEP_ALPHA_TERMS_VERSION,
    },
    {
      acceptanceKey,
      fid,
      termsVersion: '2026-07-19-hegemony-entry-agreement-v2',
    },
  ];

  for (const evidence of corruptEvidence) {
    assert.throws(
      () => readCurrentEntryAgreementStatusV1(
        () => fid,
        () => evidence,
      ),
      (error: unknown) => (
        error instanceof EntryAgreementStatusConflictError
        && error.message === 'ALPHA_TERMS_ACCEPTANCE_CONFLICT'
      ),
    );
  }
});

test('caller status preserves admission rejection before any acceptance lookup', () => {
  const notAdmitted = new Error('NOT_ADMITTED');
  let lookupCount = 0;

  assert.throws(
    () => readCurrentEntryAgreementStatusV1(
      () => {
        throw notAdmitted;
      },
      () => {
        lookupCount += 1;
        return null;
      },
    ),
    (error: unknown) => error === notAdmitted,
  );
  assert.equal(lookupCount, 0);
});

test('the caller-only status procedure reveals only exact current-version acceptance', () => {
  const admission = source('../src/reducers/admission.ts');
  const policy = source('../src/entryAgreementPolicy.ts');
  const schema = source('../src/schema.ts');
  const moduleIndex = source('../src/index.ts');
  const procedureStart = admission.indexOf(
    'export const getMyEntryAgreementStatusV1',
  );
  const procedureEnd = admission.indexOf(
    'function assertExistingPlayerV2Consistency',
    procedureStart,
  );
  const procedure = admission.slice(procedureStart, procedureEnd);

  assert.ok(procedureStart >= 0);
  assert.ok(procedureEnd > procedureStart);
  assert.match(admission, /t\.object\('MyEntryAgreementStatusV1', \{\s*requiredVersion: t\.string\(\),\s*acceptedCurrent: t\.bool\(\),\s*\}\)/);
  assert.match(procedure, /\{ name: 'get_my_entry_agreement_status_v1' \}/);
  assert.match(procedure, /return readCurrentEntryAgreementStatusV1\(/);
  assert.match(procedure, /\(\) => requireAdmittedPlayer\(tx\)\.claims\.fid/);
  assert.match(procedure, /alphaTermsAcceptanceV1\.acceptanceKey\.find\(acceptanceKey\)/);
  assert.match(procedure, /error instanceof EntryAgreementStatusConflictError/);
  assert.match(procedure, /throw new SenderError\('ALPHA_TERMS_ACCEPTANCE_CONFLICT'\)/);
  assert.doesNotMatch(
    procedure,
    /acceptedAt|historical|\.iter\s*\(|\.(?:insert|update|delete)\s*\(|t\.u64\(\)/,
  );
  assert.match(
    policy,
    /acceptanceKey = `\$\{fid\}:\$\{WARPKEEP_ALPHA_TERMS_VERSION\}`/,
  );
  assert.match(policy, /acceptance\.acceptanceKey !== acceptanceKey/);
  assert.match(policy, /acceptance\.fid !== fid/);
  assert.match(policy, /acceptance\.termsVersion !== WARPKEEP_ALPHA_TERMS_VERSION/);
  assert.match(policy, /requiredVersion: WARPKEEP_ALPHA_TERMS_VERSION/);
  assert.match(policy, /acceptedCurrent: acceptance !== null/);
  assert.doesNotMatch(
    policy,
    /acceptedAt|historical.*findAcceptance|\.iter\s*\(|\.(?:insert|update|delete)\s*\(/,
  );
  assert.match(schema, /'get_my_entry_agreement_status_v1'/);
  assert.match(moduleIndex, /getMyEntryAgreementStatusV1/);
});
