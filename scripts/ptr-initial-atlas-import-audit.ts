import { GREATER_REALM_MAX_COMPONENTS, GREATER_REALM_MAX_CHUNKS, GREATER_REALM_MAX_CELLS,
  GREATER_REALM_MAX_COMPONENT_IMPORT_ROWS, GREATER_REALM_MAX_VERIFY_ROWS, GREATER_REALM_VISIBLE_REGION_COUNT,
} from '../spacetimedb/ptr/src/atlasPolicy';
import { updateCanonical, updateDigest } from './sealed-realms-existing-update-protocol.mjs';

type Row = Readonly<Record<string, unknown>>;
function fail(): never { throw Object.assign(new Error('PTR_INITIAL_ATLAS_IMPORT_AUDIT_DIFFERENT'),
  { code: 'PTR_INITIAL_ATLAS_IMPORT_AUDIT_DIFFERENT' }); }
function integer(value: unknown, maximum: bigint): bigint {
  if (typeof value === 'number') { if (!Number.isSafeInteger(value) || value < 0) fail(); value = String(value); }
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]{0,19})$/u.test(value)) fail();
  const result = BigInt(value); if (result > maximum) fail(); return result;
}
function bounded(value: number, maximum: number): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) fail();
}
export type PtrInitialAtlasImportAuditInput = Readonly<{
  rows: readonly Row[]; atlasId: string; componentCount: number; regionCount: number;
  chunkCount: number; verificationCursor: number;
}>;

/** Qualifies the complete initial-import audit from an empty baseline, not a receipt or write authority. */
export function verifyPtrInitialAtlasImportAudit(input: PtrInitialAtlasImportAuditInput) {
  try {
    if (input.atlasId !== 'PTR_GREATER_REALM' || input.regionCount !== GREATER_REALM_VISIBLE_REGION_COUNT) fail();
    bounded(input.componentCount, GREATER_REALM_MAX_COMPONENTS);
    bounded(input.chunkCount, GREATER_REALM_MAX_CHUNKS);
    bounded(input.verificationCursor, GREATER_REALM_MAX_CELLS - 1);
    if (input.rows.length < 1 || input.rows.length > 8192) fail();
    const schemaKeys = ['id', 'action', 'target_fid', 'actor_subject', 'created_at', 'note'].sort().join('\0');
    let previousTime = 0n;
    const ordered = input.rows.map(row => {
      if (Object.keys(row).sort().join('\0') !== schemaKeys || row.actor_subject !== 'service:hermes'
        || updateCanonical(row.target_fid) !== updateCanonical([1, []])
        || typeof row.action !== 'string' || typeof row.note !== 'string'
        || !Array.isArray(row.created_at) || row.created_at.length !== 1) fail();
      return { id: integer(row.id, (1n << 64n) - 1n), action: row.action,
        note: row.note, time: integer(row.created_at[0], (1n << 63n) - 1n), row };
    }).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    for (let index = 0; index < ordered.length; index++) {
      const row = ordered[index]!;
      // Auto-increment allocation is not transactional. Gaps and a non-one first
      // ID are valid; complete SQL coverage and the exact semantic sequence below
      // establish completeness, rather than allocator continuity.
      if (row.id < 1n || (index > 0 && row.id <= ordered[index - 1]!.id)
        || row.time < 1n || row.time < previousTime) fail();
      previousTime = row.time;
    }
    let cursor = 0;
    const take = (action: string, note: string) => {
      const row = ordered[cursor++]; if (!row || row.action !== action || row.note !== note) fail();
    };
    const atlas = `atlas=${input.atlasId}`;
    take('ptr_stage_greater_realm_release_v1', `${atlas};result=inserted;activation=false`);
    let componentImportCalls = 0;
    for (let inserted = 0; inserted < input.componentCount;) {
      const count = Math.min(GREATER_REALM_MAX_COMPONENT_IMPORT_ROWS, input.componentCount - inserted);
      take('ptr_import_greater_realm_components_v1', `${atlas};inserted=${count}`);
      inserted += count; componentImportCalls++;
    }
    take('ptr_import_greater_realm_regions_v1', `${atlas};inserted=${input.regionCount}`);
    for (let index = 0; index < input.chunkCount; index++)
      take('ptr_import_greater_realm_chunk_v1', `${atlas};result=inserted`);
    take('ptr_begin_greater_realm_verification_v1', atlas);
    const verifyCalls = { components: 0, chunks: 0, cells: 0 };
    for (const [phase, count] of [['components', input.componentCount], ['chunks', input.chunkCount],
      ['cells', input.verificationCursor]] as const) {
      for (let verified = 0; verified < count;) {
        const processed = Math.min(GREATER_REALM_MAX_VERIFY_ROWS, count - verified);
        take('ptr_verify_greater_realm_batch_v1', `${atlas};phase=${phase};processed=${processed}`);
        verified += processed; verifyCalls[phase]++;
      }
    }
    if (cursor !== ordered.length) fail();
    const proof = { profile: 'warpkeep-ptr-initial-atlas-import-audit-v1' as const,
      atlasId: input.atlasId, rowCount: ordered.length,
      firstId: ordered[0]!.id.toString(), lastId: ordered.at(-1)!.id.toString(),
      componentCount: input.componentCount, regionCount: input.regionCount, chunkCount: input.chunkCount,
      verificationCursor: input.verificationCursor, componentImportCalls, verifyCalls,
      rowsDigest: updateDigest(ordered.map(row => updateCanonical(row.row)).sort()),
      emptyHistoricalBaseline: true as const, providerWritesAttempted: false as const,
      receiptProven: false as const };
    return Object.freeze({ ...proof, digest: updateDigest(proof) });
  } catch { fail(); }
}
