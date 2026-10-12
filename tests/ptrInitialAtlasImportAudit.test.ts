// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { verifyPtrInitialAtlasImportAudit } from '../scripts/ptr-initial-atlas-import-audit';

// Synthetic audit rows exercise the contract; they are not live acceptance evidence.
function fixture() {
  const rows: Record<string, any>[] = [];
  const add = (action: string, note: string) => rows.push({ id: String(rows.length + 1), action,
    target_fid: [1, []], actor_subject: 'service:hermes', created_at: [String(1000 + rows.length)], note });
  const atlas = 'atlas=PTR_GREATER_REALM';
  add('ptr_stage_greater_realm_release_v1', `${atlas};result=inserted;activation=false`);
  add('ptr_import_greater_realm_components_v1', `${atlas};inserted=128`);
  add('ptr_import_greater_realm_components_v1', `${atlas};inserted=49`);
  add('ptr_import_greater_realm_regions_v1', `${atlas};inserted=6`);
  for (let index = 0; index < 624; index++) add('ptr_import_greater_realm_chunk_v1', `${atlas};result=inserted`);
  add('ptr_begin_greater_realm_verification_v1', atlas);
  add('ptr_verify_greater_realm_batch_v1', `${atlas};phase=components;processed=177`);
  for (const processed of [256, 256, 112]) add('ptr_verify_greater_realm_batch_v1', `${atlas};phase=chunks;processed=${processed}`);
  for (let index = 0; index < 210; index++) add('ptr_verify_greater_realm_batch_v1', `${atlas};phase=cells;processed=256`);
  return { rows, atlasId: 'PTR_GREATER_REALM', componentCount: 177, regionCount: 6,
    chunkCount: 624, verificationCursor: 53760 };
}
describe('initial atlas import audit qualification', () => {
  it('qualifies exact bounded operations, retaining only counts and digests', () => {
    const input = fixture(), original = JSON.stringify(input);
    const proof = verifyPtrInitialAtlasImportAudit(input);
    expect(proof).toMatchObject({ rowCount: 843, componentImportCalls: 2,
      verifyCalls: { components: 1, chunks: 3, cells: 210 }, providerWritesAttempted: false, receiptProven: false });
    expect(proof.digest).toMatch(/^[a-f0-9]{64}$/); expect(proof.rowsDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(proof)).not.toContain('service:hermes');
    expect(JSON.stringify(proof)).not.toContain('result=inserted'); expect(JSON.stringify(input)).toBe(original);
    expect(verifyPtrInitialAtlasImportAudit({ ...input, rows: [...input.rows].reverse() })).toEqual(proof);
  });
  it('accepts unique allocator gaps and reports actual IDs without using them as coverage proof', () => {
    const input = fixture();
    input.rows.forEach((row, index) => { row.id = String(index + 1 + (index >= 128 ? 3821 : 0)); });
    const proof = verifyPtrInitialAtlasImportAudit(input);
    expect(proof).toMatchObject({ rowCount: 843, firstId: '1', lastId: '4664' });
    input.rows.forEach(row => { row.id = String(BigInt(row.id) + 2000n); });
    expect(verifyPtrInitialAtlasImportAudit(input)).toMatchObject({ rowCount: 843, firstId: '2001', lastId: '6664' });
  });
  it.each(['unknown-action', 'wrong-atlas', 'changed-actor', 'target-fid', 'extra-column', 'missing-column',
    'duplicate-id', 'id-gap', 'missing-first', 'zero-id', 'negative-timestamp', 'timestamp-regression',
    'wrong-phase', 'reordered-actions', 'replay', 'component-overflow', 'verify-overflow', 'zero-processed',
    'extra-note', 'missing-final-row', 'duplicate-final-row', 'component-count', 'region-count', 'chunk-count', 'cursor'])
    ('rejects changed audit evidence: %s', mode => {
      const input = fixture();
      if (mode === 'unknown-action') input.rows[0]!.action = 'ptr_provision_owner_v1';
      if (mode === 'wrong-atlas') input.rows[0]!.note = input.rows[0]!.note.replace('PTR_GREATER_REALM', 'OTHER');
      if (mode === 'changed-actor') input.rows[0]!.actor_subject = 'service:other';
      if (mode === 'target-fid') input.rows[0]!.target_fid = [0, '123'];
      if (mode === 'extra-column') input.rows[0]!.unexpected = 1;
      if (mode === 'missing-column') delete input.rows[0]!.note;
      if (mode === 'duplicate-id') input.rows[1]!.id = '1';
      if (mode === 'id-gap') input.rows[1]!.id = '9000';
      if (mode === 'missing-first') input.rows.shift();
      if (mode === 'zero-id') input.rows[0]!.id = '0';
      if (mode === 'negative-timestamp') input.rows[0]!.created_at = ['-1'];
      if (mode === 'timestamp-regression') input.rows[10]!.created_at = ['1'];
      if (mode === 'wrong-phase') input.rows.at(-1)!.note = 'atlas=PTR_GREATER_REALM;phase=slots;processed=256';
      if (mode === 'reordered-actions') [input.rows[1]!.action, input.rows[3]!.action] = [input.rows[3]!.action, input.rows[1]!.action];
      if (mode === 'replay') input.rows[4]!.note = 'atlas=PTR_GREATER_REALM;result=unchanged';
      if (mode === 'component-overflow') input.rows[1]!.note = 'atlas=PTR_GREATER_REALM;inserted=129';
      if (mode === 'verify-overflow') input.rows.at(-1)!.note = 'atlas=PTR_GREATER_REALM;phase=cells;processed=257';
      if (mode === 'zero-processed') input.rows.at(-1)!.note = 'atlas=PTR_GREATER_REALM;phase=cells;processed=0';
      if (mode === 'extra-note') input.rows[0]!.note += ';unexpected=true';
      if (mode === 'missing-final-row') input.rows.pop();
      if (mode === 'duplicate-final-row') input.rows.push({ ...input.rows.at(-1)!, id: '844' });
      if (mode === 'component-count') input.componentCount++;
      if (mode === 'region-count') input.regionCount--;
      if (mode === 'chunk-count') input.chunkCount++;
      if (mode === 'cursor') input.verificationCursor++;
      expect(() => verifyPtrInitialAtlasImportAudit(input)).toThrow('PTR_INITIAL_ATLAS_IMPORT_AUDIT_DIFFERENT');
    });
});
