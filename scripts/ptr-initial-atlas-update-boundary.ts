import { assertPtrInitialOwnerUpdateCandidateSnapshot, validatePtrInitialOwnerUpdateInspection,
  type PtrInitialOwnerUpdateInspection, type PtrInitialOwnerUpdateSnapshot } from './ptr-initial-owner-update-core.mjs';
import type { verifyPtrInitialAtlasVerificationPrefix } from './ptr-initial-atlas-verification-prefix';
import type { verifyPtrInitialAtlasImportAudit } from './ptr-initial-atlas-import-audit';
import { GREATER_REALM_VISIBLE_REGION_COUNT } from '../spacetimedb/ptr/src/atlasPolicy';
import { updateCanonical, updateDigest } from './sealed-realms-existing-update-protocol.mjs';

const IMPORT_TABLES = ['admin_audit', 'greater_realm_release_v1',
  'greater_realm_navigation_component_v1', 'greater_realm_chunk_v1',
  'greater_realm_cell_v1', 'greater_realm_castle_slot_v1', 'greater_realm_resource_node_v1'] as const;
const fail = (): never => { throw Object.assign(new Error('PTR_INITIAL_ATLAS_UPDATE_BOUNDARY_DIFFERENT'),
  { code: 'PTR_INITIAL_ATLAS_UPDATE_BOUNDARY_DIFFERENT' }); };
type Footprint = PtrInitialOwnerUpdateSnapshot['tables'][number];

/** Only the qualified initial import may bridge an otherwise exact preservation history.
 * The caller must obtain the prefix, audit proof and SQL footprints from the same
 * bracketed readback; this function neither reads a provider nor grants write authority. */
export function assertPtrInitialAtlasImportedUpdateBoundary(input: Readonly<{
  historicalUpdate: PtrInitialOwnerUpdateInspection;
  currentUpdate: PtrInitialOwnerUpdateInspection;
  prefix: ReturnType<typeof verifyPtrInitialAtlasVerificationPrefix>;
  audit: ReturnType<typeof verifyPtrInitialAtlasImportAudit>;
  importedTables: readonly Footprint[];
}>) {
  const historical = validatePtrInitialOwnerUpdateInspection(input.historicalUpdate);
  const current = validatePtrInitialOwnerUpdateInspection(input.currentUpdate);
  const { digest: prefixDigest, ...prefixFacts } = input.prefix;
  const { digest: auditDigest, ...auditFacts } = input.audit;
  if (prefixDigest !== updateDigest(prefixFacts)
    || input.prefix.profile !== 'warpkeep-ptr-initial-atlas-verification-prefix-v1'
    || input.prefix.atlasId !== 'PTR_GREATER_REALM' || input.prefix.verificationPhase !== 'cells'
    || input.prefix.providerWritesAttempted !== false || input.prefix.completionProven !== false
    || auditDigest !== updateDigest(auditFacts)
    || input.audit.profile !== 'warpkeep-ptr-initial-atlas-import-audit-v1'
    || input.audit.atlasId !== input.prefix.atlasId || input.audit.componentCount !== input.prefix.componentCount
    || input.audit.chunkCount !== input.prefix.chunkCount || input.audit.verificationCursor !== input.prefix.verificationCursor
    || input.audit.regionCount !== GREATER_REALM_VISIBLE_REGION_COUNT || input.audit.emptyHistoricalBaseline !== true
    || input.audit.providerWritesAttempted !== false || input.audit.receiptProven !== false
    || !/^[a-f0-9]{64}$/u.test(auditDigest) || !Number.isSafeInteger(input.audit.rowCount)
    || input.audit.rowCount < 1 || current.binding.databaseIdentity !== historical.binding.databaseIdentity
    || current.binding.cliDigest !== historical.binding.cliDigest
    || current.binding.cliConfigDigest !== historical.binding.cliConfigDigest
    || historical.before.owner.state !== 'ownerless' || current.before.owner.state !== 'ownerless'
    || historical.before.atlas.state !== 'absent' || current.before.atlas.state !== 'verifying'
    || !('verificationPhase' in current.before.atlas) || current.before.atlas.verificationPhase !== 'cells'
    || current.before.atlas.importEpoch !== '1'
    || current.before.atlas.releaseDigest !== input.prefix.expectedReleaseSha256
    || input.importedTables.length !== IMPORT_TABLES.length
    || updateCanonical(input.importedTables.map(table => table.name).sort()) !== updateCanonical([...IMPORT_TABLES].sort())) fail();
  const old = new Map(historical.before.tables.map(table => [table.name, table]));
  const fresh = new Map(current.before.tables.map(table => [table.name, table]));
  const counts: Record<typeof IMPORT_TABLES[number], number> = {
    admin_audit: input.audit.rowCount, greater_realm_release_v1: 1,
    greater_realm_navigation_component_v1: input.prefix.componentCount,
    greater_realm_chunk_v1: input.prefix.chunkCount, greater_realm_cell_v1: input.prefix.cellCount,
    greater_realm_castle_slot_v1: input.prefix.slotCount, greater_realm_resource_node_v1: input.prefix.resourceCount,
  };
  for (const table of input.importedTables) {
    const prior = old.get(table.name);
    if (!prior || prior.count !== 0 || prior.rowsDigest !== updateDigest([])
      || updateCanonical(fresh.get(table.name)) !== updateCanonical(table)
      || table.count !== counts[table.name as keyof typeof counts]) fail();
  }
  // Reuse the unchanged strict preservation rule for every other row and schema.
  // The only projected differences above have complete package/audit qualification.
  assertPtrInitialOwnerUpdateCandidateSnapshot(historical, {
    state: { ...current.before, atlas: historical.before.atlas,
      tables: current.before.tables.map(table => (IMPORT_TABLES as readonly string[]).includes(table.name)
        ? { ...table, count: 0, rowsDigest: updateDigest([]) } : table) },
    configuration: current.configuration, installedDescriptionDigest: current.preservation.priorDigest,
  });
  const facts = { profile: 'warpkeep-ptr-initial-atlas-imported-update-boundary-v1' as const,
    historicalInspectionDigest: historical.inspectionDigest, currentInspectionDigest: current.inspectionDigest,
    historicalProgram: historical.binding.candidateProgram, currentProgram: current.binding.candidateProgram,
    prefixDigest, auditDigest: input.audit.digest, importedTables: input.importedTables,
    installationProvenByReadback: false as const, providerWritesAttempted: false as const,
    completionProven: false as const };
  return Object.freeze({ ...facts, digest: updateDigest(facts) });
}
