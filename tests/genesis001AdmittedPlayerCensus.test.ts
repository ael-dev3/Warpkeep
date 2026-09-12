// @vitest-environment node

import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import {
  GENESIS_001_ADMITTED_PLAYER_CENSUS_FALLBACK_PROCEDURE,
  GENESIS_001_ADMITTED_PLAYER_CENSUS_FALLBACK_SQL,
  GENESIS_001_ADMITTED_PLAYER_CENSUS_MAXIMUM_QUERY_OUTPUT_BYTES,
  GENESIS_001_ADMITTED_PLAYER_CENSUS_MAXIMUM_ROWS,
  GENESIS_001_ADMITTED_PLAYER_CENSUS_MAXIMUM_STABLE_SEPARATION_MS,
  GENESIS_001_ADMITTED_PLAYER_CENSUS_MINIMUM_STABLE_SEPARATION_MS,
  GENESIS_001_ADMITTED_PLAYER_CENSUS_NORMALIZED_SET_DOMAIN,
  GENESIS_001_ADMITTED_PLAYER_CENSUS_OPAQUE_PROOF_DOMAIN,
  GENESIS_001_ADMITTED_PLAYER_CENSUS_PREFERRED_SQL,
  GENESIS_001_ADMITTED_PLAYER_CENSUS_PRIVATE_PROFILE,
  GENESIS_001_ADMITTED_PLAYER_CENSUS_PUBLIC_PROFILE,
  GENESIS_001_ADMITTED_PLAYER_CENSUS_RAW_EVIDENCE_DOMAIN,
  collectGenesis001AdmittedPlayerCensus,
  parseGenesis001AdmittedPlayerPreferredResult,
  projectGenesis001AdmittedPlayerCensusStablePair,
  serializeGenesis001AdmittedPlayerCensusPrivateReceipt,
  verifyGenesis001AdmittedPlayerCensusReceipt,
} from '../scripts/genesis001-admitted-player-census.mjs';

const SOURCE_COMMIT = '7'.repeat(40);
const DATABASE_IDENTITY =
  'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e';
const FIRST_TIME = '2026-08-30T12:00:00.000Z';

const bytes = (value: string): Uint8Array => Buffer.from(value, 'utf8');
const preferred = (value: string) => ({
  outcome: 'exact-query-supported' as const,
  output: bytes(value),
});
const unsupported = () => ({ outcome: 'unsupported-exact-query' as const });
const aggregate = (count = '3') => ({
  allowedFids: count,
  enabledAllowedFids: count,
});
const enabledStatus = (authEpoch: number) => ({
  admissionState: 'enabled' as const,
  authEpoch,
  requestState: 'not_requested' as const,
  requestCycle: undefined,
  requestedAtMicros: undefined,
});
const preferredOutput = (rows = [
  '9007199254740991\ttrue\t4294967295',
  '2\ttrue\t7',
  '10\ttrue\t8',
]) => `fid\tenabled\tauth_epoch\n${rows.join('\n')}\n`;

function collectionInput(overrides: Record<string, unknown> = {}) {
  return {
    preparationSourceCommit: SOURCE_COMMIT,
    observedAt: FIRST_TIME,
    readAggregates: vi.fn()
      .mockResolvedValueOnce(aggregate())
      .mockResolvedValueOnce(aggregate()),
    queryPreferred: vi.fn().mockResolvedValue(preferred(preferredOutput())),
    queryFallbackFids: vi.fn(),
    readAdmissionStatus: vi.fn(),
    randomBytes: vi.fn(() => Uint8Array.from({ length: 32 }, (_, i) => i + 1)),
    ...overrides,
  };
}

async function receipt(overrides: Record<string, unknown> = {}) {
  return collectGenesis001AdmittedPlayerCensus(collectionInput(overrides));
}

function rehashPrivateReceipt(
  receiptValue: Awaited<ReturnType<typeof receipt>>,
  changes: Record<string, unknown>,
) {
  const changed = { ...receiptValue, ...changes };
  const proof = {
    schemaVersion: changed.schemaVersion,
    profile: changed.profile,
    realmId: changed.realmId,
    releaseVersion: changed.releaseVersion,
    databaseIdentity: changed.databaseIdentity,
    preparationSourceCommit: changed.preparationSourceCommit,
    observedAt: changed.observedAt,
    collectionMethod: changed.collectionMethod,
    beforeAggregate: changed.beforeAggregate,
    afterAggregate: changed.afterAggregate,
    admittedPlayerCount: changed.admittedPlayerCount,
    entries: changed.entries,
    normalizedSetDigest: changed.normalizedSetDigest,
    rawEvidenceDigest: changed.rawEvidenceDigest,
    nonceHex: changed.nonceHex,
  };
  return {
    ...changed,
    opaqueProofDigest: createHash('sha256')
      .update(GENESIS_001_ADMITTED_PLAYER_CENSUS_OPAQUE_PROOF_DOMAIN)
      .update(`${JSON.stringify(proof)}\n`)
      .digest('hex'),
  };
}

describe('Genesis 001 admitted-player census preferred evidence', () => {
  it('exports the exact authority constants and numerically normalizes the exact preferred query', () => {
    expect(GENESIS_001_ADMITTED_PLAYER_CENSUS_PRIVATE_PROFILE).toBe(
      'warpkeep-genesis-001-admitted-player-census-private-proof-v1',
    );
    expect(GENESIS_001_ADMITTED_PLAYER_CENSUS_PUBLIC_PROFILE).toBe(
      'warpkeep-genesis-001-admitted-player-census-privacy-safe-v1',
    );
    expect(GENESIS_001_ADMITTED_PLAYER_CENSUS_PREFERRED_SQL).toBe(
      'SELECT fid, enabled, auth_epoch FROM allowed_fid',
    );
    expect(GENESIS_001_ADMITTED_PLAYER_CENSUS_FALLBACK_SQL).toBe(
      'SELECT fid FROM player_v2',
    );
    expect(GENESIS_001_ADMITTED_PLAYER_CENSUS_FALLBACK_PROCEDURE).toBe(
      'admin_get_access_request_admission_status_v1',
    );
    expect(GENESIS_001_ADMITTED_PLAYER_CENSUS_MAXIMUM_ROWS).toBe(4_096);
    expect(GENESIS_001_ADMITTED_PLAYER_CENSUS_MAXIMUM_QUERY_OUTPUT_BYTES)
      .toBe(1_024 * 1_024);
    expect(GENESIS_001_ADMITTED_PLAYER_CENSUS_MINIMUM_STABLE_SEPARATION_MS)
      .toBe(60_000);
    expect(GENESIS_001_ADMITTED_PLAYER_CENSUS_MAXIMUM_STABLE_SEPARATION_MS)
      .toBe(300_000);

    const parsed = parseGenesis001AdmittedPlayerPreferredResult(
      bytes(preferredOutput()),
    );
    expect(parsed.entries).toEqual([
      { fid: '2', authEpoch: '7' },
      { fid: '10', authEpoch: '8' },
      { fid: '9007199254740991', authEpoch: '4294967295' },
    ]);
    const canonicalRows = [
      '{"fid":"2","authEpoch":"7"}',
      '{"fid":"10","authEpoch":"8"}',
      '{"fid":"9007199254740991","authEpoch":"4294967295"}',
      '',
    ].join('\n');
    expect(parsed.normalizedSetDigest).toBe(createHash('sha256')
      .update(GENESIS_001_ADMITTED_PLAYER_CENSUS_NORMALIZED_SET_DOMAIN)
      .update(canonicalRows)
      .digest('hex'));
  });

  it.each([
    ['missing row versus aggregate', { aggregateCount: '4' }],
    ['duplicate FID', { rows: ['2\ttrue\t7', '2\ttrue\t8', '10\ttrue\t8'] }],
    ['disabled row', { rows: ['2\tfalse\t7', '10\ttrue\t8', '11\ttrue\t9'] }],
    ['wrong enabled encoding', { rows: ['2\tTRUE\t7', '10\ttrue\t8', '11\ttrue\t9'] }],
  ])('rejects %s', async (_name, setup) => {
    const rows = 'rows' in setup ? setup.rows : [
      '2\ttrue\t7', '10\ttrue\t8', '11\ttrue\t9',
    ];
    const count = 'aggregateCount' in setup ? setup.aggregateCount : '3';
    await expect(receipt({
      readAggregates: vi.fn()
        .mockResolvedValueOnce(aggregate(count))
        .mockResolvedValueOnce(aggregate(count)),
      queryPreferred: vi.fn().mockResolvedValue(preferred(preferredOutput(rows))),
    })).rejects.toThrow();
  });

  it.each([
    '0', '-1', '+1', '01', '1.0', '9007199254740992',
  ])('rejects noncanonical or out-of-range FID %s', (fid) => {
    expect(() => parseGenesis001AdmittedPlayerPreferredResult(bytes(
      preferredOutput([`${fid}\ttrue\t7`]),
    ))).toThrow();
  });

  it.each([
    '0', '-1', '+1', '01', '1.0', '4294967296',
  ])('rejects noncanonical or out-of-range auth epoch %s', (epoch) => {
    expect(() => parseGenesis001AdmittedPlayerPreferredResult(bytes(
      preferredOutput([`2\ttrue\t${epoch}`]),
    ))).toThrow();
  });

  it.each([
    ['wrong header', 'enabled\tfid\tauth_epoch\n2\ttrue\t7\n'],
    ['missing header', 'fid\tenabled\n2\ttrue\n'],
    ['extra header', 'fid\tenabled\tauth_epoch\textra\n2\ttrue\t7\tx\n'],
    ['extra field', 'fid\tenabled\tauth_epoch\n2\ttrue\t7\tx\n'],
    ['diagnostic', 'warning: query changed\nfid\tenabled\tauth_epoch\n2\ttrue\t7\n'],
    ['ANSI', 'fid\tenabled\tauth_epoch\n\u001b[31m2\ttrue\t7\n'],
    ['NUL', 'fid\tenabled\tauth_epoch\n2\ttrue\t7\u0000\n'],
    ['CRLF', 'fid\tenabled\tauth_epoch\r\n2\ttrue\t7\r\n'],
    ['missing final newline', 'fid\tenabled\tauth_epoch\n2\ttrue\t7'],
    ['UTF-8 BOM', '\ufefffid\tenabled\tauth_epoch\n2\ttrue\t7\n'],
  ])('rejects %s preferred output', (_name, output) => {
    expect(() => parseGenesis001AdmittedPlayerPreferredResult(bytes(output)))
      .toThrow();
  });

  it('rejects invalid UTF-8, oversized output, and more than 4,096 rows', () => {
    expect(() => parseGenesis001AdmittedPlayerPreferredResult(
      Uint8Array.from([0xc3, 0x28]),
    )).toThrow();
    expect(() => parseGenesis001AdmittedPlayerPreferredResult(
      new Uint8Array(1_024 * 1_024 + 1),
    )).toThrow();
    const rows = Array.from(
      { length: 4_097 },
      (_, index) => `${index + 1}\ttrue\t1`,
    );
    expect(() => parseGenesis001AdmittedPlayerPreferredResult(
      bytes(preferredOutput(rows)),
    )).toThrow();
  });

  it('requires equal enabled aggregates and stable exact pre/post aggregates', async () => {
    for (const aggregates of [
      [
        { allowedFids: '3', enabledAllowedFids: '2' },
        aggregate(),
      ],
      [aggregate(), { allowedFids: '3', enabledAllowedFids: '2' }],
      [aggregate(), aggregate('4')],
      [aggregate('0'), aggregate('0')],
      [
        { ...aggregate(), diagnostic: 'unexpected' },
        aggregate(),
      ],
    ]) {
      await expect(receipt({
        readAggregates: vi.fn()
          .mockResolvedValueOnce(aggregates[0])
          .mockResolvedValueOnce(aggregates[1]),
      })).rejects.toThrow();
    }
  });

  it.each([
    [{ allowedFids: 3, enabledAllowedFids: '3' }],
    [{ allowedFids: '03', enabledAllowedFids: '03' }],
    [{ allowedFids: '4097', enabledAllowedFids: '4097' }],
    [{ allowedFids: '3' }],
    [{ allowedFids: '3', enabledAllowedFids: '3', extra: '0' }],
  ])('rejects a noncanonical aggregate %#', async (invalidAggregate) => {
    await expect(receipt({
      readAggregates: vi.fn()
        .mockResolvedValueOnce(invalidAggregate)
        .mockResolvedValueOnce(aggregate()),
    })).rejects.toThrow();
  });

  it('rejects non-plain, accessor, and non-enumerable aggregate records', async () => {
    const inherited = Object.assign(Object.create({ inherited: true }), aggregate());
    const accessor = {
      get allowedFids() { return '3'; },
      enabledAllowedFids: '3',
    };
    const hidden = Object.defineProperty({ ...aggregate() }, 'hidden', {
      value: 'private',
      enumerable: false,
    });
    for (const invalidAggregate of [inherited, accessor, hidden]) {
      await expect(receipt({
        readAggregates: vi.fn()
          .mockResolvedValueOnce(invalidAggregate)
          .mockResolvedValueOnce(aggregate()),
      })).rejects.toThrow();
    }
  });

  it('binds the exact preferred bytes in the independent raw evidence digest', async () => {
    const exactBytes = bytes(preferredOutput());
    const result = await receipt({
      queryPreferred: vi.fn().mockResolvedValue(preferred(preferredOutput())),
    });
    expect(GENESIS_001_ADMITTED_PLAYER_CENSUS_RAW_EVIDENCE_DOMAIN).toBe(
      'warpkeep.genesis-001.admitted-player-census.raw-evidence.v1\n',
    );
    expect(result.rawEvidenceDigest).toBe(createHash('sha256')
      .update(GENESIS_001_ADMITTED_PLAYER_CENSUS_RAW_EVIDENCE_DOMAIN)
      .update(exactBytes)
      .digest('hex'));

    const reordered = await receipt({
      queryPreferred: vi.fn().mockResolvedValue(preferred(preferredOutput([
        '2\ttrue\t7',
        '9007199254740991\ttrue\t4294967295',
        '10\ttrue\t8',
      ]))),
      randomBytes: vi.fn(() => new Uint8Array(32).fill(2)),
    });
    expect(reordered.normalizedSetDigest).toBe(result.normalizedSetDigest);
    expect(reordered.rawEvidenceDigest).not.toBe(result.rawEvidenceDigest);
  });
});

describe('Genesis 001 admitted-player census fallback', () => {
  it('falls back only for the explicit unsupported result and calls exact authority once per FID', async () => {
    const queryPreferred = vi.fn().mockResolvedValue(unsupported());
    const queryFallbackFids = vi.fn().mockResolvedValue(bytes('fid\n10\n2\n3\n'));
    const readAdmissionStatus = vi.fn(async (_procedure: string, fid: string) =>
      enabledStatus({ '2': 7, '3': 9, '10': 8 }[fid] ?? 0));
    const result = await receipt({
      queryPreferred,
      queryFallbackFids,
      readAdmissionStatus,
    });

    expect(queryPreferred).toHaveBeenCalledOnce();
    expect(queryPreferred).toHaveBeenCalledWith(
      GENESIS_001_ADMITTED_PLAYER_CENSUS_PREFERRED_SQL,
    );
    expect(queryFallbackFids).toHaveBeenCalledOnce();
    expect(queryFallbackFids).toHaveBeenCalledWith(
      GENESIS_001_ADMITTED_PLAYER_CENSUS_FALLBACK_SQL,
    );
    expect(readAdmissionStatus.mock.calls).toEqual([
      [GENESIS_001_ADMITTED_PLAYER_CENSUS_FALLBACK_PROCEDURE, '2'],
      [GENESIS_001_ADMITTED_PLAYER_CENSUS_FALLBACK_PROCEDURE, '3'],
      [GENESIS_001_ADMITTED_PLAYER_CENSUS_FALLBACK_PROCEDURE, '10'],
    ]);
    expect(result.collectionMethod).toBe('fallback-player-v2-status-v1');
    expect(result.entries).toEqual([
      { fid: '2', authEpoch: '7' },
      { fid: '3', authEpoch: '9' },
      { fid: '10', authEpoch: '8' },
    ]);
    const canonicalStatuses = [7, 9, 8].map(authEpoch => ({
      admissionState: 'enabled',
      authEpoch: String(authEpoch),
      requestState: 'not_requested',
      requestCycle: null,
      requestedAtMicros: null,
    }));
    const expectedRawDigest = createHash('sha256')
      .update(GENESIS_001_ADMITTED_PLAYER_CENSUS_RAW_EVIDENCE_DOMAIN)
      .update(bytes('fid\n10\n2\n3\n'));
    for (const status of canonicalStatuses) {
      expectedRawDigest.update(`${JSON.stringify(status)}\n`);
    }
    expect(result.rawEvidenceDigest).toBe(expectedRawDigest.digest('hex'));
  });

  it('calls injected authorities in exact pre-query-status-post order', async () => {
    const calls: string[] = [];
    const readAggregates = vi.fn(async () => {
      calls.push('aggregate');
      return aggregate();
    });
    const queryPreferred = vi.fn(async () => {
      calls.push('preferred');
      return unsupported();
    });
    const queryFallbackFids = vi.fn(async () => {
      calls.push('fallback-query');
      return bytes('fid\n10\n2\n3\n');
    });
    const readAdmissionStatus = vi.fn(async (_procedure: string, fid: string) => {
      calls.push(`status:${fid}`);
      return enabledStatus(7);
    });
    const randomBytes = vi.fn(() => {
      calls.push('nonce');
      return new Uint8Array(32).fill(1);
    });
    await receipt({
      readAggregates,
      queryPreferred,
      queryFallbackFids,
      readAdmissionStatus,
      randomBytes,
    });
    expect(calls).toEqual([
      'aggregate',
      'preferred',
      'fallback-query',
      'status:2',
      'status:3',
      'status:10',
      'aggregate',
      'nonce',
    ]);
    expect(readAggregates).toHaveBeenCalledTimes(2);
    expect(randomBytes).toHaveBeenCalledOnce();
    expect(randomBytes).toHaveBeenCalledWith(32);
  });

  it.each([
    'timeout', 'authentication-failure', 'malformed', 'oversized',
    'duplicate', 'disabled',
  ])('does not fall back for preferred outcome %s', async (outcome) => {
    const queryFallbackFids = vi.fn();
    await expect(receipt({
      queryPreferred: vi.fn().mockResolvedValue({ outcome }),
      queryFallbackFids,
    })).rejects.toThrow();
    expect(queryFallbackFids).not.toHaveBeenCalled();
  });

  it('does not fall back when supported preferred evidence is malformed', async () => {
    const queryFallbackFids = vi.fn();
    await expect(receipt({
      queryPreferred: vi.fn().mockResolvedValue(preferred('diagnostic\n')),
      queryFallbackFids,
    })).rejects.toThrow();
    expect(queryFallbackFids).not.toHaveBeenCalled();
  });

  it.each([
    ['missing status', { ...enabledStatus(7), admissionState: 'missing', authEpoch: 0 }],
    ['disabled status', { ...enabledStatus(7), admissionState: 'disabled' }],
    ['unexpected status field', { ...enabledStatus(7), extra: true }],
    ['invalid epoch', enabledStatus(0)],
    ['fractional epoch', enabledStatus(1.5)],
  ])('rejects fallback %s', async (_name, status) => {
    await expect(receipt({
      queryPreferred: vi.fn().mockResolvedValue(unsupported()),
      queryFallbackFids: vi.fn().mockResolvedValue(bytes('fid\n2\n10\n3\n')),
      readAdmissionStatus: vi.fn().mockResolvedValue(status),
    })).rejects.toThrow();
  });

  it('accepts a semantically complete resolved enabled status', async () => {
    const result = await receipt({
      queryPreferred: vi.fn().mockResolvedValue(unsupported()),
      queryFallbackFids: vi.fn().mockResolvedValue(bytes('fid\n2\n10\n3\n')),
      readAdmissionStatus: vi.fn().mockResolvedValue({
        admissionState: 'enabled',
        authEpoch: 7,
        requestState: 'resolved',
        requestCycle: 7n,
        requestedAtMicros: 1_800_000_000_000_000n,
      }),
    });
    expect(result.entries.map(entry => entry.authEpoch)).toEqual(['7', '7', '7']);
  });

  it.each([
    ['bad request state', { ...enabledStatus(7), requestState: 'pending' }],
    ['half request tuple', { ...enabledStatus(7), requestCycle: 1n }],
    ['wrong request-cycle type', {
      ...enabledStatus(7), requestState: 'resolved', requestCycle: 1,
      requestedAtMicros: 1n,
    }],
    ['negative request cycle', {
      ...enabledStatus(7), requestState: 'resolved', requestCycle: -1n,
      requestedAtMicros: 1n,
    }],
    ['u64 request-cycle overflow', {
      ...enabledStatus(7), requestState: 'resolved',
      requestCycle: 18_446_744_073_709_551_616n, requestedAtMicros: 1n,
    }],
    ['zero timestamp', {
      ...enabledStatus(7), requestState: 'resolved', requestCycle: 1n,
      requestedAtMicros: 0n,
    }],
    ['u64 timestamp overflow', {
      ...enabledStatus(7), requestState: 'resolved', requestCycle: 1n,
      requestedAtMicros: 18_446_744_073_709_551_616n,
    }],
    ['future cycle', {
      ...enabledStatus(7), requestState: 'resolved', requestCycle: 8n,
      requestedAtMicros: 1n,
    }],
    ['pending enabled tuple', {
      ...enabledStatus(7), requestState: 'pending', requestCycle: 7n,
      requestedAtMicros: 1n,
    }],
  ])('rejects fallback status semantic error: %s', async (_name, status) => {
    await expect(receipt({
      queryPreferred: vi.fn().mockResolvedValue(unsupported()),
      queryFallbackFids: vi.fn().mockResolvedValue(bytes('fid\n2\n10\n3\n')),
      readAdmissionStatus: vi.fn().mockResolvedValue(status),
    })).rejects.toThrow();
  });

  it('accepts the exact u64 requested-at upper boundary', async () => {
    await expect(receipt({
      queryPreferred: vi.fn().mockResolvedValue(unsupported()),
      queryFallbackFids: vi.fn().mockResolvedValue(bytes('fid\n2\n10\n3\n')),
      readAdmissionStatus: vi.fn().mockResolvedValue({
        admissionState: 'enabled',
        authEpoch: 7,
        requestState: 'resolved',
        requestCycle: 7n,
        requestedAtMicros: 18_446_744_073_709_551_615n,
      }),
    })).resolves.toMatchObject({ collectionMethod: 'fallback-player-v2-status-v1' });
  });

  it('rejects non-plain, accessor, and non-enumerable fallback status records', async () => {
    const inherited = Object.assign(Object.create({ inherited: true }), enabledStatus(7));
    const accessor = {
      admissionState: 'enabled',
      get authEpoch() { return 7; },
      requestState: 'not_requested',
      requestCycle: undefined,
      requestedAtMicros: undefined,
    };
    const hidden = Object.defineProperty({ ...enabledStatus(7) }, 'hidden', {
      value: 'private',
      enumerable: false,
    });
    for (const status of [inherited, accessor, hidden]) {
      await expect(receipt({
        queryPreferred: vi.fn().mockResolvedValue(unsupported()),
        queryFallbackFids: vi.fn().mockResolvedValue(bytes('fid\n2\n10\n3\n')),
        readAdmissionStatus: vi.fn().mockResolvedValue(status),
      })).rejects.toThrow();
    }
  });

  it('rejects duplicate/noncanonical fallback FIDs and aggregate mismatch', async () => {
    for (const output of ['fid\n2\n2\n10\n', 'fid\n02\n10\n3\n']) {
      await expect(receipt({
        queryPreferred: vi.fn().mockResolvedValue(unsupported()),
        queryFallbackFids: vi.fn().mockResolvedValue(bytes(output)),
      })).rejects.toThrow();
    }
    await expect(receipt({
      readAggregates: vi.fn()
        .mockResolvedValueOnce(aggregate('4'))
        .mockResolvedValueOnce(aggregate('4')),
      queryPreferred: vi.fn().mockResolvedValue(unsupported()),
      queryFallbackFids: vi.fn().mockResolvedValue(bytes('fid\n2\n10\n3\n')),
      readAdmissionStatus: vi.fn().mockResolvedValue(enabledStatus(7)),
    })).rejects.toThrow();
  });

  it.each([
    ['wrong header', 'enabled\n2\n10\n3\n'],
    ['diagnostic', 'warning: changed\nfid\n2\n10\n3\n'],
    ['ANSI', 'fid\n\u001b[31m2\n10\n3\n'],
    ['NUL', 'fid\n2\u0000\n10\n3\n'],
    ['CRLF', 'fid\r\n2\r\n10\r\n3\r\n'],
    ['blank', 'fid\n2\n\n3\n'],
    ['zero FID', 'fid\n0\n10\n3\n'],
    ['unsafe FID', 'fid\n9007199254740992\n10\n3\n'],
    ['UTF-8 BOM', '\ufefffid\n2\n10\n3\n'],
  ])('rejects fallback text %s', async (_name, output) => {
    await expect(receipt({
      queryPreferred: vi.fn().mockResolvedValue(unsupported()),
      queryFallbackFids: vi.fn().mockResolvedValue(bytes(output)),
    })).rejects.toThrow();
  });

  it('rejects invalid UTF-8, oversized, and over-row-limit fallback evidence', async () => {
    for (const output of [
      Uint8Array.from([0xc3, 0x28]),
      new Uint8Array(1_024 * 1_024 + 1),
      bytes(`fid\n${Array.from(
        { length: 4_097 },
        (_, index) => `${index + 1}`,
      ).join('\n')}\n`),
    ]) {
      await expect(receipt({
        queryPreferred: vi.fn().mockResolvedValue(unsupported()),
        queryFallbackFids: vi.fn().mockResolvedValue(output),
      })).rejects.toThrow();
    }
  });
});

describe('Genesis 001 admitted-player private receipt and stable pair', () => {
  it('creates exact canonical private data and recomputes both domain-separated digests', async () => {
    const result = await receipt();
    const proof = {
      schemaVersion: 1,
      profile: GENESIS_001_ADMITTED_PLAYER_CENSUS_PRIVATE_PROFILE,
      realmId: 'GENESIS_001',
      releaseVersion: '0.3.43',
      databaseIdentity: DATABASE_IDENTITY,
      preparationSourceCommit: SOURCE_COMMIT,
      observedAt: FIRST_TIME,
      collectionMethod: 'preferred-exact-query',
      beforeAggregate: aggregate(),
      afterAggregate: aggregate(),
      admittedPlayerCount: '3',
      entries: [
        { fid: '2', authEpoch: '7' },
        { fid: '10', authEpoch: '8' },
        { fid: '9007199254740991', authEpoch: '4294967295' },
      ],
      normalizedSetDigest: result.normalizedSetDigest,
      rawEvidenceDigest: result.rawEvidenceDigest,
      nonceHex: Buffer.from(
        Uint8Array.from({ length: 32 }, (_, index) => index + 1),
      ).toString('hex'),
    };
    const expectedDigest = createHash('sha256')
      .update(GENESIS_001_ADMITTED_PLAYER_CENSUS_OPAQUE_PROOF_DOMAIN)
      .update(`${JSON.stringify(proof)}\n`)
      .digest('hex');
    expect(result).toEqual({ ...proof, opaqueProofDigest: expectedDigest });
    expect(serializeGenesis001AdmittedPlayerCensusPrivateReceipt(result))
      .toEqual(Buffer.from(`${JSON.stringify(result)}\n`, 'utf8'));
    expect(verifyGenesis001AdmittedPlayerCensusReceipt(result)).toEqual(result);
  });

  it('projects exactly the minimal public profile and second opaque digest', async () => {
    const first = await receipt();
    const second = await receipt({
      observedAt: '2026-08-30T12:01:00.000Z',
      randomBytes: vi.fn(() => new Uint8Array(32).fill(2)),
      queryPreferred: vi.fn().mockResolvedValue(preferred(preferredOutput([
        '10\ttrue\t8',
        '9007199254740991\ttrue\t4294967295',
        '2\ttrue\t7',
      ]))),
    });
    const projected = projectGenesis001AdmittedPlayerCensusStablePair({ first, second });
    expect(projected).toEqual({
      profile: GENESIS_001_ADMITTED_PLAYER_CENSUS_PUBLIC_PROFILE,
      opaqueProofDigest: second.opaqueProofDigest,
    });
    expect(Object.keys(projected)).toEqual(['profile', 'opaqueProofDigest']);
    const publicText = JSON.stringify(projected);
    for (const privateValue of [
      'fid', 'authEpoch', 'admittedPlayerCount', 'normalizedSetDigest',
      'rawEvidenceDigest', 'nonceHex', 'beforeAggregate', 'afterAggregate',
      'entries', 'observedAt', 'private', '\\', '/',
    ]) expect(publicText).not.toContain(privateValue);
  });

  it.each([60_000, 300_000])(
    'accepts stable reordered evidence at the inclusive %i ms boundary',
    async (separation) => {
      const first = await receipt();
      const second = await receipt({
        observedAt: new Date(Date.parse(FIRST_TIME) + separation).toISOString(),
        randomBytes: vi.fn(() => new Uint8Array(32).fill(2)),
        queryPreferred: vi.fn().mockResolvedValue(preferred(preferredOutput([
          '10\ttrue\t8',
          '2\ttrue\t7',
          '9007199254740991\ttrue\t4294967295',
        ]))),
      });
      expect(projectGenesis001AdmittedPlayerCensusStablePair({ first, second }))
        .toEqual({
          profile: GENESIS_001_ADMITTED_PLAYER_CENSUS_PUBLIC_PROFILE,
          opaqueProofDigest: second.opaqueProofDigest,
        });
    },
  );

  it.each([59_999, 300_001, 0])('rejects %i ms separation', async (separation) => {
    const first = await receipt();
    const second = await receipt({
      observedAt: new Date(Date.parse(FIRST_TIME) + separation).toISOString(),
      randomBytes: vi.fn(() => new Uint8Array(32).fill(2)),
    });
    expect(() => projectGenesis001AdmittedPlayerCensusStablePair({ first, second }))
      .toThrow();
  });

  it('rejects reused nonce/digest and every changed stable authority field', async () => {
    const first = await receipt();
    const stableSecond = await receipt({
      observedAt: '2026-08-30T12:01:00.000Z',
      randomBytes: vi.fn(() => new Uint8Array(32).fill(2)),
    });
    const cases = [
      { ...stableSecond, preparationSourceCommit: '8'.repeat(40) },
      { ...stableSecond, databaseIdentity: '8'.repeat(64) },
      { ...stableSecond, collectionMethod: 'fallback-player-v2-status-v1' },
      { ...stableSecond, admittedPlayerCount: '4' },
      { ...stableSecond, entries: [{ fid: '2', authEpoch: '9' }] },
      { ...stableSecond, normalizedSetDigest: '8'.repeat(64) },
      { ...stableSecond, nonceHex: first.nonceHex },
      { ...stableSecond, opaqueProofDigest: first.opaqueProofDigest },
      { ...stableSecond, unknown: true },
    ];
    for (const second of cases) {
      expect(() => projectGenesis001AdmittedPlayerCensusStablePair({ first, second }))
        .toThrow();
    }
    expect(() => projectGenesis001AdmittedPlayerCensusStablePair({
      first,
      second: stableSecond,
      unknown: true,
    } as never)).toThrow();
  });

  it('rejects independently authenticated source, method, count, and set drift', async () => {
    const first = await receipt();
    const stableSecond = await receipt({
      observedAt: '2026-08-30T12:01:00.000Z',
      randomBytes: vi.fn(() => new Uint8Array(32).fill(2)),
    });
    const changedSet = await receipt({
      observedAt: '2026-08-30T12:01:00.000Z',
      readAggregates: vi.fn()
        .mockResolvedValueOnce(aggregate('2'))
        .mockResolvedValueOnce(aggregate('2')),
      queryPreferred: vi.fn().mockResolvedValue(preferred(preferredOutput([
        '2\ttrue\t7', '10\ttrue\t8',
      ]))),
      randomBytes: vi.fn(() => new Uint8Array(32).fill(2)),
    });
    const cases = [
      rehashPrivateReceipt(stableSecond, {
        preparationSourceCommit: '8'.repeat(40),
      }),
      rehashPrivateReceipt(stableSecond, {
        collectionMethod: 'fallback-player-v2-status-v1',
      }),
      changedSet,
    ];
    for (const second of cases) {
      expect(() => verifyGenesis001AdmittedPlayerCensusReceipt(second))
        .not.toThrow();
      expect(() => projectGenesis001AdmittedPlayerCensusStablePair({ first, second }))
        .toThrow();
    }
  });

  it('rejects tampered private receipts and noncanonical time/nonce inputs', async () => {
    const valid = await receipt();
    for (const changed of [
      { ...valid, rawEvidenceDigest: '8'.repeat(64) },
      { ...valid, nonceHex: '0'.repeat(64) },
      { ...valid, observedAt: '2026-08-30T12:00:00Z' },
      { ...valid, extra: true },
    ]) expect(() => verifyGenesis001AdmittedPlayerCensusReceipt(changed)).toThrow();
    await expect(receipt({ randomBytes: vi.fn(() => new Uint8Array(32)) }))
      .rejects.toThrow();
  });

  it.each([
    ['wrong nonce type', () => 'private'],
    ['short nonce', () => new Uint8Array(31).fill(1)],
    ['long nonce', () => new Uint8Array(33).fill(1)],
    ['throwing nonce source', () => { throw new Error('private'); }],
  ])('rejects %s and never retries randomness', async (_name, callback) => {
    const randomBytes = vi.fn(callback);
    await expect(receipt({ randomBytes })).rejects.toThrow();
    expect(randomBytes).toHaveBeenCalledOnce();
    expect(randomBytes).toHaveBeenCalledWith(32);
  });

  it('rejects non-exact, unsorted, duplicate, and count-inconsistent nested receipts', async () => {
    const valid = await receipt();
    const reversedEntries = [...valid.entries].reverse();
    const duplicateEntries = [valid.entries[0], valid.entries[0], valid.entries[2]];
    const cases = [
      rehashPrivateReceipt(valid, {
        beforeAggregate: { ...valid.beforeAggregate, extra: '0' },
      }),
      rehashPrivateReceipt(valid, {
        entries: [{ ...valid.entries[0], extra: '0' }, ...valid.entries.slice(1)],
      }),
      rehashPrivateReceipt(valid, { entries: reversedEntries }),
      rehashPrivateReceipt(valid, { entries: duplicateEntries }),
      rehashPrivateReceipt(valid, { admittedPlayerCount: '2' }),
    ];
    for (const invalid of cases) {
      expect(() => verifyGenesis001AdmittedPlayerCensusReceipt(invalid)).toThrow();
    }
    const inherited = Object.assign(Object.create({ inherited: true }), valid);
    const accessor = { ...valid };
    Object.defineProperty(accessor, 'profile', {
      get: () => GENESIS_001_ADMITTED_PLAYER_CENSUS_PRIVATE_PROFILE,
      enumerable: true,
    });
    const hidden = Object.defineProperty({ ...valid }, 'hidden', {
      value: 'private',
      enumerable: false,
    });
    for (const invalid of [inherited, accessor, hidden]) {
      expect(() => verifyGenesis001AdmittedPlayerCensusReceipt(invalid)).toThrow();
    }
  });

  it('never logs private success or failure data', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await receipt();
    await expect(receipt({
      queryPreferred: vi.fn().mockResolvedValue(preferred('private failure detail')),
    })).rejects.toThrow();
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    log.mockRestore();
    error.mockRestore();
  });
});
