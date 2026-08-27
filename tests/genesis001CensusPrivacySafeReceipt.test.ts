// @vitest-environment node

import { createHash } from 'node:crypto';
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  executeGenesis001CensusPrivacySafeReceipt,
} from '../scripts/genesis001-census-privacy-safe-receipt.mjs';

const COMMIT = '7'.repeat(40);
const BASENAME = 'warpkeep-access-request-census-20260827T123456Z.txt';
const EXPORT_REFERENCE_BASENAME =
  'warpkeep-access-request-census-export-reference-20260827T123456Z.json';

function censusText() {
  return [
    'warpkeep-access-request-census-v1',
    'realm-id\tGENESIS_001',
    'release-version\t0.3.43',
    'source-baseline-commit\t2ae51984e1fa6ce5b0028c1a250359fed79d819b',
    'admission-freeze-attestation\tb043a0e2e4e2c23e183a0497f47c6d8265f4d95e1d3b58c85629d0de80683304',
    'target-configuration-digest\tfed7c0345b370df3fd2399fb0654f55dc55f8f1397ca95544a46429fecb20470',
    'total-requests\t2',
    'pending-requests\t1',
    'requested-at-micros\tfid\trequest-state\tadmission-state',
    '1000000\t111\tpending\tmissing',
    '2000000\t222\tresolved\tenabled',
    '',
  ].join('\n');
}

function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'warpkeep-census-proof-')));
  chmodSync(root, 0o700);
  const censusPath = join(root, BASENAME);
  const exporterReceiptPath = join(root, EXPORT_REFERENCE_BASENAME);
  const privateReceiptDirectory = join(root, 'private-receipts');
  mkdirSync(privateReceiptDirectory, { mode: 0o700 });
  const text = censusText();
  const bytes = Buffer.from(text, 'utf8');
  const reference = {
    count: 2,
    size: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    pathBasename: BASENAME,
  };
  writeFileSync(censusPath, bytes, { mode: 0o600 });
  writeFileSync(
    exporterReceiptPath,
    `${JSON.stringify(reference)}\n`,
    { mode: 0o600 },
  );
  bytes.fill(0);
  return { root, censusPath, exporterReceiptPath, privateReceiptDirectory, reference };
}

function execute(
  files: ReturnType<typeof fixture>,
  overrides: Readonly<Record<string, unknown>> = {},
  hooks: Readonly<Record<string, () => void>> = {},
) {
  return executeGenesis001CensusPrivacySafeReceipt({
    sourceCommit: COMMIT,
    censusPath: files.censusPath,
    exporterReceiptPath: files.exporterReceiptPath,
    privateReceiptDirectory: files.privateReceiptDirectory,
    randomBytes: vi.fn(() => Buffer.alloc(32, 0x11)),
    ...overrides,
  }, hooks);
}

describe('Genesis 001 census privacy-safe receipt', () => {
  it('re-attests the canonical TXT, generates a nonce, stores private proof, and emits no census verifier', () => {
    const files = fixture();
    const randomBytes = vi.fn(() => Buffer.alloc(32, 0x27));
    const result = execute(files, { randomBytes });

    expect(randomBytes).toHaveBeenCalledOnce();
    expect(randomBytes).toHaveBeenCalledWith(32);
    expect(result).toEqual({
      profile: 'warpkeep-genesis-001-census-export-privacy-safe-v1',
      opaqueProofDigest: expect.stringMatching(/^[0-9a-f]{64}$/u),
      privateReceiptBasename: expect.stringMatching(
        /^genesis-001-census-privacy-safe-[0-9a-f]{64}\.json$/u,
      ),
    });
    const rendered = JSON.stringify(result);
    expect(rendered).not.toContain(files.reference.sha256);
    expect(rendered).not.toContain('"count"');
    expect(rendered).not.toContain(BASENAME);
    expect(result.opaqueProofDigest).not.toBe(files.reference.sha256);

    const privatePath = join(
      files.privateReceiptDirectory,
      result.privateReceiptBasename,
    );
    expect(lstatSync(privatePath).mode & 0o7777).toBe(0o600);
    const stored = JSON.parse(readFileSync(privatePath, 'utf8'));
    expect(stored).toMatchObject({
      privateCensusReference: files.reference,
      privateBlindingNonceHex: Buffer.alloc(32, 0x27).toString('hex'),
      opaqueProofDigest: result.opaqueProofDigest,
    });
  });

  it('rejects mismatched exporter metadata or a noncanonical TXT', () => {
    for (const mutate of [
      (files: ReturnType<typeof fixture>) => {
        writeFileSync(files.exporterReceiptPath, `${JSON.stringify({
          ...files.reference,
          sha256: 'a'.repeat(64),
        })}\n`, { mode: 0o600 });
      },
      (files: ReturnType<typeof fixture>) => {
        writeFileSync(files.exporterReceiptPath, `${JSON.stringify({
          ...files.reference,
          count: 1,
        })}\n`, { mode: 0o600 });
      },
      (files: ReturnType<typeof fixture>) => {
        writeFileSync(files.censusPath, censusText().replace(
          'pending-requests\t1',
          'pending-requests\t2',
        ), { mode: 0o600 });
      },
    ]) {
      const files = fixture();
      mutate(files);
      expect(() => execute(files)).toThrow();
    }
  });

  it('rejects a caller-authored reference with the wrong canonical export basename', () => {
    const files = fixture();
    const wrongReferencePath = join(
      files.root,
      'warpkeep-access-request-census-export-reference-20260827T123457Z.json',
    );
    writeFileSync(
      wrongReferencePath,
      readFileSync(files.exporterReceiptPath),
      { mode: 0o600 },
    );
    expect(() => execute(files, {
      exporterReceiptPath: wrongReferencePath,
    })).toThrow('GENESIS_001_CENSUS_PRIVACY_SAFE_EXPORT_REFERENCE_INVALID');
  });

  it('rejects symlink and path-swap inputs after opening the census', () => {
    const symlinkFiles = fixture();
    const censusAlias = join(
      symlinkFiles.root,
      'warpkeep-access-request-census-20260827T123457Z.txt',
    );
    symlinkSync(symlinkFiles.censusPath, censusAlias);
    expect(() => execute(symlinkFiles, { censusPath: censusAlias })).toThrow(
      'GENESIS_001_CENSUS_PRIVACY_SAFE_PRIVATE_FILE_INVALID',
    );

    const swapped = fixture();
    const displaced = join(swapped.root, 'displaced.txt');
    expect(() => execute(swapped, {}, {
      afterCensusOpen: () => {
        renameSync(swapped.censusPath, displaced);
        writeFileSync(swapped.censusPath, censusText(), { mode: 0o600 });
      },
    })).toThrow('GENESIS_001_CENSUS_PRIVACY_SAFE_PRIVATE_FILE_CHANGED');
  });

  it('never overwrites a private receipt when an injected nonce repeats', () => {
    const files = fixture();
    const first = execute(files);
    expect(first.privateReceiptBasename).toMatch(/\.json$/u);
    expect(() => execute(files)).toThrow(
      'GENESIS_001_CENSUS_PRIVACY_SAFE_RECEIPT_EXISTS',
    );
  });
});
