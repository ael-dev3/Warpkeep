import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  closeSync,
  constants,
  existsSync,
  fchmodSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import type { Stats } from 'node:fs';
import { basename, dirname, isAbsolute, parse, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  generateGreaterRealmCandidate,
  GREATER_REALM_GENERATOR_VERSION,
} from './greater-realm-candidate-generator';
import {
  GREATER_REALM_CANDIDATE_REJECTION_CODES,
  greaterRealmCandidateRejectionCode,
  type GreaterRealmCandidateRejectionCode,
} from './greater-realm-candidate-rejection';
import {
  clearGreaterRealmPrivateCandidateBuffers,
  verifyGreaterRealmPrivateCandidatePackage,
  writeGreaterRealmPrivateCandidate,
  type GreaterRealmCandidatePerformance,
  type GreaterRealmVerifiedPrivateShortlistMetrics,
} from './greater-realm-candidate-package';
import {
  createGreaterRealmCandidateHandle,
  createGreaterRealmReviewBatchHandle,
  GREATER_REALM_MAXIMUM_CANDIDATE_COUNT,
  GREATER_REALM_MINIMUM_CANDIDATE_COUNT,
  type GreaterRealmSanitizedCandidateSource,
  type GreaterRealmSanitizedReview,
} from './greater-realm-contracts';
import {
  assertGreaterRealmLegacyLowlandsPatchLocked,
} from './greater-realm-legacy-lowlands';
import {
  assertGreaterRealmPrivateInvocation,
  defaultGreaterRealmPrivateWorkspaceRoot,
  openGreaterRealmPrivateWorkspace,
} from './greater-realm-private-workspace';
import {
  GREATER_REALM_PRIVATE_SEED_ENVELOPE_BYTES,
  decodeGreaterRealmPrivateSeed,
  encodeGreaterRealmPrivateSeed,
} from './greater-realm-private-seed';
import {
  createGreaterRealmSanitizedReview,
  parseGreaterRealmSanitizedReview,
  serializeGreaterRealmSanitizedReview,
} from './greater-realm-sanitized-review';
import { runGreaterRealmTrustedGit } from './greater-realm-git';

type Command =
  | 'generate-candidates'
  | 'compare-candidates'
  | 'verify-private-package'
  | 'export-sanitized-review'
  | 'verify-sanitized-review'
  | 'select-candidate';

type ParsedArguments = Readonly<{
  command: Command;
  workspaceRoot: string;
  count?: number;
  maximumAttempts?: number;
  batchHandle?: string;
  candidateHandle?: string;
  approvalReference?: string;
  outputPath?: string;
  inputPath?: string;
  confirmSelection: boolean;
}>;

const BATCH_HANDLE = /^GR-B-[A-Z2-7]{16}$/u;
const CANDIDATE_HANDLE = /^GR-A-[A-Z2-7]{16}$/u;
const APPROVAL_REFERENCE = /^OWNER-[A-Z0-9][A-Z0-9._-]{7,63}$/u;
const ROOT = resolve(import.meta.dirname, '..', '..');
const PRIVATE_JSON_MAXIMUM_BYTES = 16 * 1024 * 1024;
const PRIVATE_BATCH_MAXIMUM_BYTES = GREATER_REALM_MAXIMUM_CANDIDATE_COUNT
  * (
    128 * 1024 * 1024
    + 6 * 16 * 1024 * 1024
    + 4 * 1024 * 1024
    + GREATER_REALM_PRIVATE_SEED_ENVELOPE_BYTES
  )
  + 4 * PRIVATE_JSON_MAXIMUM_BYTES
  + GREATER_REALM_PRIVATE_SEED_ENVELOPE_BYTES;

function fail(code: string): never {
  throw new Error(code);
}

function exactRecord(
  value: unknown,
  expectedKeys: readonly string[],
  code: string,
): Readonly<Record<string, unknown>> {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  ) fail(code);
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some(key => typeof key !== 'string')) fail(code);
  const actual = (ownKeys as string[]).sort();
  const expected = [...expectedKeys].sort();
  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) fail(code);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.values(descriptors).some(descriptor => !('value' in descriptor))) fail(code);
  return value as Readonly<Record<string, unknown>>;
}

function safeInteger(value: string, minimum: number, maximum: number): number {
  if (!/^(?:0|[1-9][0-9]*)$/u.test(value)) fail('GREATER_REALM_CLI_INTEGER_INVALID');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    fail('GREATER_REALM_CLI_INTEGER_INVALID');
  }
  return parsed;
}

function parseArguments(argv: readonly string[]): ParsedArguments {
  const commandValue = argv[0];
  if (![
    'generate-candidates',
    'compare-candidates',
    'verify-private-package',
    'export-sanitized-review',
    'verify-sanitized-review',
    'select-candidate',
  ].includes(commandValue ?? '')) fail('GREATER_REALM_CLI_USAGE');
  const command = commandValue as Command;
  let workspaceRoot = defaultGreaterRealmPrivateWorkspaceRoot();
  let count: number | undefined;
  let maximumAttempts: number | undefined;
  let batchHandle: string | undefined;
  let candidateHandle: string | undefined;
  let approvalReference: string | undefined;
  let outputPath: string | undefined;
  let inputPath: string | undefined;
  let confirmSelection = false;
  const seen = new Set<string>();
  for (let index = 1; index < argv.length; index += 1) {
    const flag = argv[index]!;
    if (seen.has(flag)) fail('GREATER_REALM_CLI_ARGUMENTS_INVALID');
    seen.add(flag);
    if (flag === '--confirm-selection') {
      confirmSelection = true;
      continue;
    }
    if (![
      '--workspace', '--count', '--maximum-attempts', '--batch', '--candidate',
      '--approval-reference', '--output', '--input',
    ].includes(flag)) fail('GREATER_REALM_CLI_ARGUMENTS_INVALID');
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) fail('GREATER_REALM_CLI_ARGUMENTS_INVALID');
    index += 1;
    if (flag === '--workspace') workspaceRoot = value;
    else if (flag === '--count') count = safeInteger(
      value,
      GREATER_REALM_MINIMUM_CANDIDATE_COUNT,
      GREATER_REALM_MAXIMUM_CANDIDATE_COUNT,
    );
    else if (flag === '--maximum-attempts') maximumAttempts = safeInteger(value, 8, 256);
    else if (flag === '--batch') batchHandle = value;
    else if (flag === '--candidate') candidateHandle = value;
    else if (flag === '--approval-reference') approvalReference = value;
    else if (flag === '--output') outputPath = value;
    else if (flag === '--input') inputPath = value;
  }
  if (!isAbsolute(workspaceRoot)) fail('GREATER_REALM_CLI_WORKSPACE_NOT_ABSOLUTE');
  if (batchHandle !== undefined && !BATCH_HANDLE.test(batchHandle)) {
    fail('GREATER_REALM_CLI_BATCH_INVALID');
  }
  if (candidateHandle !== undefined && !CANDIDATE_HANDLE.test(candidateHandle)) {
    fail('GREATER_REALM_CLI_CANDIDATE_INVALID');
  }
  if (approvalReference !== undefined && !APPROVAL_REFERENCE.test(approvalReference)) {
    fail('GREATER_REALM_CLI_APPROVAL_INVALID');
  }
  if (command === 'generate-candidates') {
    if (batchHandle || candidateHandle || approvalReference || outputPath || inputPath || confirmSelection) {
      fail('GREATER_REALM_CLI_ARGUMENTS_INVALID');
    }
    if (count !== undefined && maximumAttempts !== undefined && maximumAttempts < count) {
      fail('GREATER_REALM_CLI_ARGUMENTS_INVALID');
    }
  } else if (command === 'verify-sanitized-review') {
    if (!inputPath || count || maximumAttempts || batchHandle || candidateHandle || approvalReference || outputPath || confirmSelection) {
      fail('GREATER_REALM_CLI_ARGUMENTS_INVALID');
    }
  } else if (command === 'select-candidate') {
    if (!batchHandle || !candidateHandle || !approvalReference || !confirmSelection || count || maximumAttempts || outputPath || inputPath) {
      fail('GREATER_REALM_CLI_ARGUMENTS_INVALID');
    }
  } else if (command === 'export-sanitized-review') {
    if (!batchHandle || !outputPath || count || maximumAttempts || candidateHandle || approvalReference || inputPath || confirmSelection) {
      fail('GREATER_REALM_CLI_ARGUMENTS_INVALID');
    }
  } else if (!batchHandle || count || maximumAttempts || candidateHandle || approvalReference || outputPath || inputPath || confirmSelection) {
    fail('GREATER_REALM_CLI_ARGUMENTS_INVALID');
  }
  return Object.freeze({
    command,
    workspaceRoot,
    ...(count === undefined ? {} : { count }),
    ...(maximumAttempts === undefined ? {} : { maximumAttempts }),
    ...(batchHandle === undefined ? {} : { batchHandle }),
    ...(candidateHandle === undefined ? {} : { candidateHandle }),
    ...(approvalReference === undefined ? {} : { approvalReference }),
    ...(outputPath === undefined ? {} : { outputPath }),
    ...(inputPath === undefined ? {} : { inputPath }),
    confirmSelection,
  });
}

function sourceCommit(): string {
  const topLevel = runGreaterRealmTrustedGit(
    ['rev-parse', '--path-format=absolute', '--show-toplevel'],
    ROOT,
  );
  if (
    topLevel.error
    || topLevel.status !== 0
    || topLevel.stderr.length !== 0
    || resolve(topLevel.stdout.trim()) !== resolve(ROOT)
  ) fail('GREATER_REALM_CLI_SOURCE_COMMIT_FAILED');
  const result = runGreaterRealmTrustedGit(
    ['rev-parse', '--verify', 'HEAD^{commit}'],
    ROOT,
  );
  const value = result.stdout.trim();
  if (
    result.error
    || result.status !== 0
    || result.stderr.length !== 0
    || !/^[0-9a-f]{40}$/u.test(value)
  ) {
    fail('GREATER_REALM_CLI_SOURCE_COMMIT_FAILED');
  }
  const status = runGreaterRealmTrustedGit(
    ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames'],
    ROOT,
  );
  if (
    status.error
    || status.status !== 0
    || status.stderr.length !== 0
    || status.stdout.length !== 0
  ) {
    fail('GREATER_REALM_CLI_SOURCE_TREE_DIRTY');
  }
  return value;
}

const GENERATOR_PROVENANCE_PATHS = Object.freeze([
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'tsconfig.app.json',
  'tsconfig.node.json',
  'scripts/atlas',
  'spacetimedb/src/world.ts',
  'spacetimedb/src/goldSitePolicy.ts',
  'spacetimedb/src/foodSitePolicy.ts',
  'spacetimedb/src/woodSitePolicy.ts',
  'spacetimedb/src/stoneSitePolicy.ts',
  'spacetimedb/src/forestLayoutPolicy.ts',
  'spacetimedb/src/forestLayoutContract.ts',
  'spacetimedb/src/waterWorld.ts',
  'spacetimedb/src/waterRevision.ts',
]);

function assertGeneratorSourceProvenance(commit: string): void {
  if (!/^[0-9a-f]{40}$/u.test(commit)) fail('GREATER_REALM_PRIVATE_SOURCE_INVALID');
  const ancestor = runGreaterRealmTrustedGit(
    ['merge-base', '--is-ancestor', commit, 'HEAD'],
    ROOT,
  );
  const unchanged = runGreaterRealmTrustedGit(
    [
      'diff', '--quiet', '--no-ext-diff', '--no-textconv', commit,
      '--', ...GENERATOR_PROVENANCE_PATHS,
    ],
    ROOT,
  );
  const untracked = runGreaterRealmTrustedGit(
    [
      'ls-files', '--others', '--exclude-standard', '-z',
      '--', ...GENERATOR_PROVENANCE_PATHS,
    ],
    ROOT,
  );
  const ignored = runGreaterRealmTrustedGit(
    [
      'ls-files', '--others', '--ignored', '--exclude-standard', '-z',
      '--', ...GENERATOR_PROVENANCE_PATHS,
    ],
    ROOT,
  );
  if (
    ancestor.error
    || ancestor.status !== 0
    || unchanged.error
    || unchanged.status !== 0
    || untracked.error
    || untracked.status !== 0
    || ignored.error
    || ignored.status !== 0
    || ancestor.stdout.length !== 0
    || unchanged.stdout.length !== 0
    || untracked.stdout.length !== 0
    || ignored.stdout.length !== 0
    || ancestor.stderr.length !== 0
    || unchanged.stderr.length !== 0
    || untracked.stderr.length !== 0
    || ignored.stderr.length !== 0
  ) fail('GREATER_REALM_PRIVATE_SOURCE_MISMATCH');
}

function roundedPerformance(startedAt: bigint): GreaterRealmCandidatePerformance {
  const milliseconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
  const processPeakMemoryMiB = process.resourceUsage().maxRSS / 1_024;
  return Object.freeze({
    generationMilliseconds: Math.max(100, Math.round(milliseconds / 100) * 100),
    processPeakMemoryMiB: Math.max(1, Math.round(processPeakMemoryMiB / 8) * 8),
  });
}

function publicPerformance(performance: GreaterRealmCandidatePerformance) {
  return Object.freeze({
    generationMillisecondsRounded: performance.generationMilliseconds,
    processPeakMemoryMiBRounded: performance.processPeakMemoryMiB,
  });
}

function writePrivateJson(
  workspace: ReturnType<typeof openGreaterRealmPrivateWorkspace>,
  path: string,
  value: unknown,
): void {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
  try {
    workspace.writeFileAtomic(path, bytes, PRIVATE_JSON_MAXIMUM_BYTES);
  } finally {
    bytes.fill(0);
  }
}

async function generateCandidates(arguments_: ParsedArguments): Promise<void> {
  assertGreaterRealmLegacyLowlandsPatchLocked();
  const workspace = openGreaterRealmPrivateWorkspace({
    repositoryRoot: ROOT,
    workspaceRoot: arguments_.workspaceRoot,
  });
  const batchHandle = createGreaterRealmReviewBatchHandle();
  const requestedCount = arguments_.count ?? 1;
  const maximumAttempts = arguments_.maximumAttempts ?? Math.max(128, requestedCount * 16);
  if (maximumAttempts < requestedCount) fail('GREATER_REALM_CLI_ARGUMENTS_INVALID');
  const commit = sourceCommit();
  const rootSeed = randomBytes(32);
  try {
    await workspace.withAtomicDirectoryPublish(
      `batches/${batchHandle}`,
      async stagedWorkspace => {
        await workspace.withExclusiveLock('locks/generate-candidates.lock', async () => {
          const batchSeedEnvelope = encodeGreaterRealmPrivateSeed(rootSeed, 'batch');
          try {
            stagedWorkspace.writeFileAtomic(
              `batches/${batchHandle}/batch-seed.bin`,
              batchSeedEnvelope,
              GREATER_REALM_PRIVATE_SEED_ENVELOPE_BYTES,
            );
          } finally {
            batchSeedEnvelope.fill(0);
          }
          const publicCandidates: GreaterRealmSanitizedCandidateSource[] = [];
          const privateCandidates: Array<Readonly<{
            candidateHandle: string;
            candidateOrdinal: number;
            manifestDigest: string;
            atlasDigest: string;
          }>> = [];
          const rejectedAttempts: GreaterRealmPrivateRejectedAttempt[] = [];
          for (
            let ordinal = 0;
            ordinal < maximumAttempts && publicCandidates.length < requestedCount;
            ordinal += 1
          ) {
            const startedAt = process.hrtime.bigint();
            let candidate: ReturnType<typeof generateGreaterRealmCandidate> | undefined;
            try {
              candidate = generateGreaterRealmCandidate({
                rootSeed,
                candidateOrdinal: ordinal,
              });
              const performance = roundedPerformance(startedAt);
              if (!candidate.aggregate.eligible) {
                rejectedAttempts.push(Object.freeze({
                  kind: 'proof-rejection',
                  candidateOrdinal: ordinal,
                  activeCellCount: candidate.grid.cellCount,
                  failedProofs: candidate.privateMetrics.eligibilityFailureCodes,
                }));
                continue;
              }
              const candidateHandle = createGreaterRealmCandidateHandle();
              const written = await writeGreaterRealmPrivateCandidate({
                workspace: stagedWorkspace,
                batchHandle,
                candidateHandle,
                sourceCommit: commit,
                candidate,
                performance,
              });
              privateCandidates.push(Object.freeze({
                candidateHandle,
                candidateOrdinal: ordinal,
                manifestDigest: written.manifestDigest,
                atlasDigest: written.atlasDigest,
              }));
              publicCandidates.push(Object.freeze({
                candidateHandle,
                ...candidate.aggregate,
                performance: publicPerformance(performance),
              }));
            } catch (error) {
              const rejectionCode = greaterRealmCandidateRejectionCode(error);
              if (rejectionCode === undefined) throw error;
              rejectedAttempts.push(Object.freeze({
                kind: 'geography-exhaustion',
                candidateOrdinal: ordinal,
                rejectionCode,
              }));
            } finally {
              if (candidate) clearGreaterRealmPrivateCandidateBuffers(candidate);
            }
          }
          if (publicCandidates.length !== requestedCount) {
            fail('GREATER_REALM_CANDIDATE_BATCH_INCOMPLETE');
          }
          const review = createGreaterRealmSanitizedReview({
            generatorVersion: GREATER_REALM_GENERATOR_VERSION,
            sourceCommit: commit,
            reviewBatchHandle: batchHandle,
            selectionStatus: 'pending',
            selectedCandidateHandle: null,
            candidates: publicCandidates,
          });
          const sanitizedBytes = Buffer.from(
            serializeGreaterRealmSanitizedReview(review),
            'utf8',
          );
          try {
            stagedWorkspace.writeFileAtomic(
              `batches/${batchHandle}/sanitized-review.json`,
              sanitizedBytes,
              4 * 1024 * 1024,
            );
          } finally {
            sanitizedBytes.fill(0);
          }
          writePrivateJson(
            stagedWorkspace,
            `batches/${batchHandle}/batch.private.json`,
            {
              kind: 'warpkeep.greater-realm.private-batch.v1',
              generatorVersion: GREATER_REALM_GENERATOR_VERSION,
              sourceCommit: commit,
              batchHandle,
              batchSeedDigest: createHash('sha256').update(rootSeed).digest('hex'),
              sanitizedReviewDigest: review.reportDigest,
              requestedCount,
              maximumAttempts,
              attemptsUsed: privateCandidates.length + rejectedAttempts.length,
              candidates: privateCandidates,
              rejectedAttempts,
            },
          );
        });
      },
    );
  } finally {
    rootSeed.fill(0);
  }
  process.stdout.write(`${JSON.stringify({
    batchHandle,
    eligibleCandidates: requestedCount,
    selectionStatus: 'pending',
    productionUntouched: true,
  })}\n`);
}

function reviewRelativePath(batchHandle: string): string {
  return `batches/${batchHandle}/sanitized-review.json`;
}

function selectionRelativePath(batchHandle: string): string {
  return `batches/${batchHandle}/selection.private.json`;
}

function shortlistRelativePath(batchHandle: string): string {
  return `batches/${batchHandle}/shortlist.private.json`;
}

function candidateSource(
  candidate: ReturnType<typeof parseGreaterRealmSanitizedReview>['candidates'][number],
): GreaterRealmSanitizedCandidateSource {
  return Object.freeze({
    candidateHandle: candidate.candidateHandle,
    eligible: candidate.eligible,
    activeCellCount: candidate.activeCellCount,
    landCellCount: candidate.landCellCount,
    waterCellCount: candidate.waterCellCount,
    tierCellCounts: candidate.tierCellCounts,
    regionSizeRanges: candidate.regionSizeRanges,
    hydrology: candidate.hydrology,
    geology: candidate.geology,
    topography: candidate.topography,
    biomes: candidate.biomes,
    quality: candidate.quality,
    gateCount: candidate.gateCount,
    castleSlotCount: candidate.castleSlotCount,
    proofs: candidate.proofs,
    performance: candidate.performance,
  });
}

function candidateAggregateExpectation(
  candidate: ReturnType<typeof parseGreaterRealmSanitizedReview>['candidates'][number],
) {
  return Object.freeze({
    eligible: candidate.eligible,
    activeCellCount: candidate.activeCellCount,
    landCellCount: candidate.landCellCount,
    waterCellCount: candidate.waterCellCount,
    tierCellCounts: candidate.tierCellCounts,
    regionSizeRanges: candidate.regionSizeRanges,
    hydrology: candidate.hydrology,
    geology: candidate.geology,
    topography: candidate.topography,
    biomes: candidate.biomes,
    quality: candidate.quality,
    gateCount: candidate.gateCount,
    castleSlotCount: candidate.castleSlotCount,
    proofs: candidate.proofs,
  });
}

type ShortlistCandidate = Readonly<{
  candidateHandle: string;
  publicCandidate: GreaterRealmSanitizedReview['candidates'][number];
  privateMetrics: GreaterRealmVerifiedPrivateShortlistMetrics;
}>;

const PRIVATE_SHORTLIST_METRIC_KEYS = Object.freeze([
  'candidateHandle',
  'maximumBoundaryRadiusShareBasisPoints',
  'rotationalSimilarityBasisPoints',
  'maximumAlignedBoundaryRun',
  'saltwaterBoundaryBasisPoints',
  'minimumLargestPassableRegionShareBasisPoints',
  'maximumMinorPassableFragmentShareBasisPoints',
  'maximumPassableBoundaryDensityBasisPoints',
  'maximumPassableTendrilShareBasisPoints',
  'throneAnchorBarrierClearance',
  'gateRouteRedundancyProof',
  'measuredMinimumBarrierWidth',
  'measuredMaximumBarrierWidth',
  'chunkCount',
  'chunkPopulationSpread',
  'chunkUpperTailSpread',
  'highlandBarrierShareBasisPoints',
  'barrierMeanElevationAdvantage',
  'barrierMeanUpliftAdvantage',
  'ridgeUpliftAlignmentBasisPoints',
  'riverValleyAlignmentBasisPoints',
  'landformClimateCompatibilityFloorBasisPoints',
  'coastalProximityCompatibilityBasisPoints',
  'coastalClassCount',
] as const);

function validatedPrivateShortlistMetrics(
  value: unknown,
): GreaterRealmVerifiedPrivateShortlistMetrics {
  const row = exactRecord(
    value,
    PRIVATE_SHORTLIST_METRIC_KEYS,
    'GREATER_REALM_PRIVATE_SHORTLIST_INVALID',
  );
  const numericKeys = PRIVATE_SHORTLIST_METRIC_KEYS.filter(key => ![
    'candidateHandle',
    'gateRouteRedundancyProof',
  ].includes(key));
  if (
    typeof row.candidateHandle !== 'string'
    || !CANDIDATE_HANDLE.test(row.candidateHandle)
    || row.gateRouteRedundancyProof !== true
    || numericKeys.some(key => !Number.isSafeInteger(row[key]))
    || (row.measuredMinimumBarrierWidth as number) < 4
    || (row.measuredMaximumBarrierWidth as number) > 8
    || (row.measuredMinimumBarrierWidth as number) > (row.measuredMaximumBarrierWidth as number)
    || (row.chunkCount as number) < 1
    || (row.chunkPopulationSpread as number) < 0
    || (row.chunkUpperTailSpread as number) < 0
    || (row.throneAnchorBarrierClearance as number) < 0
    || (row.coastalClassCount as number) < 1
  ) fail('GREATER_REALM_PRIVATE_SHORTLIST_INVALID');
  for (const key of [
    'maximumBoundaryRadiusShareBasisPoints',
    'rotationalSimilarityBasisPoints',
    'saltwaterBoundaryBasisPoints',
    'minimumLargestPassableRegionShareBasisPoints',
    'maximumMinorPassableFragmentShareBasisPoints',
    'maximumPassableBoundaryDensityBasisPoints',
    'maximumPassableTendrilShareBasisPoints',
    'highlandBarrierShareBasisPoints',
    'ridgeUpliftAlignmentBasisPoints',
    'riverValleyAlignmentBasisPoints',
    'landformClimateCompatibilityFloorBasisPoints',
    'coastalProximityCompatibilityBasisPoints',
  ] as const) {
    if ((row[key] as number) < 0 || (row[key] as number) > 10_000) {
      fail('GREATER_REALM_PRIVATE_SHORTLIST_INVALID');
    }
  }
  return row as unknown as GreaterRealmVerifiedPrivateShortlistMetrics;
}

const PRIVATE_SHORTLIST_OBJECTIVES = Object.freeze([
  Object.freeze({
    code: 'NATURALNESS',
    direction: 'maximize' as const,
    value: (candidate: ShortlistCandidate) => (
      candidate.publicCandidate.quality.naturalnessBasisPoints
    ),
  }),
  Object.freeze({
    code: 'PASSABLE_REGION_COHERENCE',
    direction: 'maximize' as const,
    value: (candidate: ShortlistCandidate) => (
      candidate.privateMetrics.minimumLargestPassableRegionShareBasisPoints
    ),
  }),
  Object.freeze({
    code: 'CHUNK_POPULATION_SPREAD',
    direction: 'minimize' as const,
    value: (candidate: ShortlistCandidate) => candidate.privateMetrics.chunkPopulationSpread,
  }),
  Object.freeze({
    code: 'RIDGE_UPLIFT_ALIGNMENT',
    direction: 'maximize' as const,
    value: (candidate: ShortlistCandidate) => (
      candidate.privateMetrics.ridgeUpliftAlignmentBasisPoints
    ),
  }),
  Object.freeze({
    code: 'BIOME_VISUAL_DIVERSITY',
    direction: 'maximize' as const,
    value: (candidate: ShortlistCandidate) => candidate.publicCandidate.biomes.visualClassCount,
  }),
  Object.freeze({
    code: 'OUTER_BOUNDARY_RADIUS_ARTIFACT',
    direction: 'minimize' as const,
    value: (candidate: ShortlistCandidate) => (
      candidate.privateMetrics.maximumBoundaryRadiusShareBasisPoints
    ),
  }),
  Object.freeze({
    code: 'OUTER_BOUNDARY_ROTATIONAL_ARTIFACT',
    direction: 'minimize' as const,
    value: (candidate: ShortlistCandidate) => (
      candidate.privateMetrics.rotationalSimilarityBasisPoints
    ),
  }),
  Object.freeze({
    code: 'OUTER_BOUNDARY_AXIAL_RUN',
    direction: 'minimize' as const,
    value: (candidate: ShortlistCandidate) => (
      candidate.privateMetrics.maximumAlignedBoundaryRun
    ),
  }),
  Object.freeze({
    code: 'SALTWATER_OUTER_BOUNDARY',
    direction: 'maximize' as const,
    value: (candidate: ShortlistCandidate) => (
      candidate.privateMetrics.saltwaterBoundaryBasisPoints
    ),
  }),
  Object.freeze({
    code: 'COASTAL_PROCESS_COMPATIBILITY',
    direction: 'maximize' as const,
    value: (candidate: ShortlistCandidate) => (
      candidate.privateMetrics.coastalProximityCompatibilityBasisPoints
    ),
  }),
  Object.freeze({
    code: 'COASTAL_CLASS_DIVERSITY',
    direction: 'maximize' as const,
    value: (candidate: ShortlistCandidate) => candidate.privateMetrics.coastalClassCount,
  }),
  Object.freeze({
    code: 'MINOR_PASSABLE_FRAGMENTATION',
    direction: 'minimize' as const,
    value: (candidate: ShortlistCandidate) => (
      candidate.privateMetrics.maximumMinorPassableFragmentShareBasisPoints
    ),
  }),
  Object.freeze({
    code: 'PASSABLE_REGION_BOUNDARY_DENSITY',
    direction: 'minimize' as const,
    value: (candidate: ShortlistCandidate) => (
      candidate.privateMetrics.maximumPassableBoundaryDensityBasisPoints
    ),
  }),
  Object.freeze({
    code: 'PASSABLE_REGION_TENDRILS',
    direction: 'minimize' as const,
    value: (candidate: ShortlistCandidate) => (
      candidate.privateMetrics.maximumPassableTendrilShareBasisPoints
    ),
  }),
  Object.freeze({
    code: 'THRONE_ROUTE_CLEARANCE',
    direction: 'maximize' as const,
    value: (candidate: ShortlistCandidate) => (
      candidate.privateMetrics.throneAnchorBarrierClearance
    ),
  }),
  Object.freeze({
    code: 'CHUNK_UPPER_TAIL_SPREAD',
    direction: 'minimize' as const,
    value: (candidate: ShortlistCandidate) => candidate.privateMetrics.chunkUpperTailSpread,
  }),
  Object.freeze({
    code: 'HIGHLAND_BARRIER_SHARE',
    direction: 'maximize' as const,
    value: (candidate: ShortlistCandidate) => (
      candidate.privateMetrics.highlandBarrierShareBasisPoints
    ),
  }),
  Object.freeze({
    code: 'BARRIER_ELEVATION_ADVANTAGE',
    direction: 'maximize' as const,
    value: (candidate: ShortlistCandidate) => (
      candidate.privateMetrics.barrierMeanElevationAdvantage
    ),
  }),
  Object.freeze({
    code: 'BARRIER_UPLIFT_ADVANTAGE',
    direction: 'maximize' as const,
    value: (candidate: ShortlistCandidate) => (
      candidate.privateMetrics.barrierMeanUpliftAdvantage
    ),
  }),
  Object.freeze({
    code: 'RIVER_VALLEY_ALIGNMENT',
    direction: 'maximize' as const,
    value: (candidate: ShortlistCandidate) => (
      candidate.privateMetrics.riverValleyAlignmentBasisPoints
    ),
  }),
  Object.freeze({
    code: 'LANDFORM_CLIMATE_COMPATIBILITY_FLOOR',
    direction: 'maximize' as const,
    value: (candidate: ShortlistCandidate) => (
      candidate.privateMetrics.landformClimateCompatibilityFloorBasisPoints
    ),
  }),
  Object.freeze({
    code: 'RIDGE_CONTINUITY',
    direction: 'maximize' as const,
    value: (candidate: ShortlistCandidate) => (
      candidate.publicCandidate.quality.ridgeContinuityBasisPoints
    ),
  }),
  Object.freeze({
    code: 'HYDROLOGY_COHERENCE',
    direction: 'maximize' as const,
    value: (candidate: ShortlistCandidate) => (
      candidate.publicCandidate.quality.hydrologyCoherenceBasisPoints
    ),
  }),
  Object.freeze({
    code: 'REGIONAL_BIOME_FLOOR',
    direction: 'maximize' as const,
    value: (candidate: ShortlistCandidate) => (
      candidate.publicCandidate.biomes.minimumPerRegionVisualClassCount
    ),
  }),
  Object.freeze({
    code: 'TIER_I_SINGLE_BIOME_DOMINANCE',
    direction: 'minimize' as const,
    value: (candidate: ShortlistCandidate) => (
      candidate.publicCandidate.biomes.maximumTierISingleBiomeShareBasisPoints
    ),
  }),
] as const);

const PRIVATE_SHORTLIST_HARD_CONSTRAINTS = Object.freeze([
  'equal-zero:INCOMPATIBLE_BIOME_ADJACENCY',
  'equal-zero:INCOMPATIBLE_BIOME_LANDFORM_PAIRING',
  'equal-true:GATE_ROUTE_REDUNDANCY',
  'range-inclusive:MOUNTAIN_BARRIER_WIDTH_4_8',
] as const);

function shortlistObjectiveComparison(
  first: ShortlistCandidate,
  second: ShortlistCandidate,
  objective: typeof PRIVATE_SHORTLIST_OBJECTIVES[number],
): number {
  const firstValue = objective.value(first);
  const secondValue = objective.value(second);
  return objective.direction === 'maximize'
    ? firstValue - secondValue
    : secondValue - firstValue;
}

function shortlistCandidateDominates(
  first: ShortlistCandidate,
  second: ShortlistCandidate,
): boolean {
  let strictlyBetter = false;
  for (const objective of PRIVATE_SHORTLIST_OBJECTIVES) {
    const comparison = shortlistObjectiveComparison(first, second, objective);
    if (comparison < 0) return false;
    if (comparison > 0) strictlyBetter = true;
  }
  return strictlyBetter;
}

function shortlistDiversityDistance(
  first: ShortlistCandidate,
  second: ShortlistCandidate,
  ranges: readonly Readonly<{ minimum: number; span: number }>[],
): number {
  let maximumDistance = 0;
  for (let index = 0; index < PRIVATE_SHORTLIST_OBJECTIVES.length; index += 1) {
    const objective = PRIVATE_SHORTLIST_OBJECTIVES[index]!;
    const range = ranges[index]!;
    const distance = Math.abs(objective.value(first) - objective.value(second)) / range.span;
    maximumDistance = Math.max(maximumDistance, distance);
  }
  return maximumDistance;
}

/**
 * Produces an unranked owner-review set. A single-candidate batch remains a
 * pending owner review; multi-candidate batches use Pareto specialists and
 * vector separation. Neither path recommends or selects a world.
 */
export function buildGreaterRealmPrivateCandidateShortlist(
  review: GreaterRealmSanitizedReview,
  verifiedPrivateMetrics: readonly GreaterRealmVerifiedPrivateShortlistMetrics[],
) {
  if (
    review.selectionStatus !== 'pending'
    || review.selectedCandidateHandle !== null
    || review.candidates.length < GREATER_REALM_MINIMUM_CANDIDATE_COUNT
    || review.candidates.some(candidate => candidate.eligible !== true)
    || review.candidates.some(candidate => (
      candidate.biomes.incompatibleVisualAdjacencyCount !== 0
      || candidate.biomes.incompatibleBiomeLandformPairCount !== 0
    ))
    || !Array.isArray(verifiedPrivateMetrics)
    || verifiedPrivateMetrics.length !== review.candidates.length
  ) fail('GREATER_REALM_PRIVATE_SHORTLIST_INVALID');
  const privateByHandle = new Map<string, GreaterRealmVerifiedPrivateShortlistMetrics>();
  for (const value of verifiedPrivateMetrics) {
    const metrics = validatedPrivateShortlistMetrics(value);
    if (privateByHandle.has(metrics.candidateHandle)) {
      fail('GREATER_REALM_PRIVATE_SHORTLIST_INVALID');
    }
    privateByHandle.set(metrics.candidateHandle, metrics);
  }
  const candidates = review.candidates.map(publicCandidate => {
    const privateMetrics = privateByHandle.get(publicCandidate.candidateHandle);
    if (!privateMetrics) fail('GREATER_REALM_PRIVATE_SHORTLIST_INVALID');
    return Object.freeze({
      candidateHandle: publicCandidate.candidateHandle,
      publicCandidate,
      privateMetrics,
    });
  }).sort((first, second) => first.candidateHandle.localeCompare(second.candidateHandle));
  const paretoFront = candidates.filter(candidate => !candidates.some(other => (
    other !== candidate && shortlistCandidateDominates(other, candidate)
  )));
  const selected = new Map<string, ShortlistCandidate>();
  for (const objective of PRIVATE_SHORTLIST_OBJECTIVES) {
    const specialist = [...paretoFront].sort((first, second) => {
      const comparison = shortlistObjectiveComparison(second, first, objective);
      return comparison === 0
        ? first.candidateHandle.localeCompare(second.candidateHandle)
        : comparison;
    })[0];
    if (specialist) selected.set(specialist.candidateHandle, specialist);
    if (selected.size === 5) break;
  }
  const ranges = PRIVATE_SHORTLIST_OBJECTIVES.map(objective => {
    const values = candidates.map(candidate => objective.value(candidate));
    const minimum = Math.min(...values);
    return Object.freeze({ minimum, span: Math.max(1, Math.max(...values) - minimum) });
  });
  const minimumReviewSetSize = Math.min(3, candidates.length);
  while (selected.size < minimumReviewSetSize) {
    const remaining = candidates.filter(candidate => !selected.has(candidate.candidateHandle));
    if (remaining.length === 0) fail('GREATER_REALM_PRIVATE_SHORTLIST_INVALID');
    const next = remaining.sort((first, second) => {
      const minimumDistance = (candidate: ShortlistCandidate) => Math.min(
        ...[...selected.values()].map(chosen => (
          shortlistDiversityDistance(candidate, chosen, ranges)
        )),
      );
      const firstDistance = selected.size === 0 ? 0 : minimumDistance(first);
      const secondDistance = selected.size === 0 ? 0 : minimumDistance(second);
      return secondDistance === firstDistance
        ? first.candidateHandle.localeCompare(second.candidateHandle)
        : secondDistance - firstDistance;
    })[0]!;
    selected.set(next.candidateHandle, next);
  }
  const candidateHandles = Object.freeze([...selected.keys()].sort());
  return Object.freeze({
    kind: 'warpkeep.greater-realm.private-owner-shortlist.v1' as const,
    method: candidates.length === 1
      ? 'single-candidate-reference-review-v1' as const
      : 'pareto-private-vector-diversity-v2' as const,
    comparisonBasis: 'verified-private-package-aggregate-metrics-v1' as const,
    batchHandle: review.reviewBatchHandle,
    sourceReviewDigest: review.reportDigest,
    selectionStatus: 'pending' as const,
    selectedCandidateHandle: null,
    ranked: false as const,
    automaticSelection: false as const,
    shortlistCount: candidateHandles.length,
    candidateHandles,
    objectiveDirections: Object.freeze(PRIVATE_SHORTLIST_OBJECTIVES.map(objective => (
      `${objective.direction}:${objective.code}`
    ))),
    requiredConstraints: PRIVATE_SHORTLIST_HARD_CONSTRAINTS,
  });
}

function verifyExistingPrivateShortlist(
  workspace: ReturnType<typeof openGreaterRealmPrivateWorkspace>,
  review: GreaterRealmSanitizedReview,
  verifiedPrivateMetrics: readonly GreaterRealmVerifiedPrivateShortlistMetrics[],
): void {
  const path = shortlistRelativePath(review.reviewBatchHandle);
  if (!workspace.hasFile(path)) return;
  const actual = workspace.readFile(path, PRIVATE_JSON_MAXIMUM_BYTES);
  const expected = Buffer.from(
    `${JSON.stringify(buildGreaterRealmPrivateCandidateShortlist(
      review,
      verifiedPrivateMetrics,
    ), null, 2)}\n`,
    'utf8',
  );
  try {
    if (actual.length !== expected.length || !actual.equals(expected)) {
      fail('GREATER_REALM_PRIVATE_SHORTLIST_INVALID');
    }
  } finally {
    actual.fill(0);
    expected.fill(0);
  }
}

function parseOwnerSelection(
  value: unknown,
  batchHandle: string,
  pendingReview: ReturnType<typeof parseGreaterRealmSanitizedReview>,
) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) fail('GREATER_REALM_SELECTION_RECEIPT_INVALID');
  const row = value as Record<string, unknown>;
  const actualKeys = Object.keys(row).sort();
  const expectedKeys = [
    'approvalReference',
    'batchHandle',
    'candidateHandle',
    'generatorVersion',
    'kind',
    'selectedReview',
    'sourceReviewDigest',
  ].sort();
  if (
    actualKeys.length !== expectedKeys.length
    || actualKeys.some((key, index) => key !== expectedKeys[index])
    || row.kind !== 'warpkeep.greater-realm.private-owner-selection.v1'
    || row.batchHandle !== batchHandle
    || row.generatorVersion !== GREATER_REALM_GENERATOR_VERSION
    || typeof row.candidateHandle !== 'string'
    || !CANDIDATE_HANDLE.test(row.candidateHandle)
    || typeof row.approvalReference !== 'string'
    || !APPROVAL_REFERENCE.test(row.approvalReference)
    || row.sourceReviewDigest !== pendingReview.reportDigest
    || pendingReview.selectionStatus !== 'pending'
  ) fail('GREATER_REALM_SELECTION_RECEIPT_INVALID');
  const selectedReview = parseGreaterRealmSanitizedReview(row.selectedReview);
  const expectedReview = createGreaterRealmSanitizedReview({
    generatorVersion: pendingReview.generatorVersion,
    sourceCommit: pendingReview.sourceCommit,
    reviewBatchHandle: pendingReview.reviewBatchHandle,
    selectionStatus: 'selected',
    selectedCandidateHandle: row.candidateHandle,
    candidates: pendingReview.candidates.map(candidateSource),
  });
  if (selectedReview.reportDigest !== expectedReview.reportDigest) {
    fail('GREATER_REALM_SELECTION_RECEIPT_INVALID');
  }
  return selectedReview;
}

function readPendingReview(
  workspace: ReturnType<typeof openGreaterRealmPrivateWorkspace>,
  batchHandle: string,
) {
  const bytes = workspace.readFile(reviewRelativePath(batchHandle), 4 * 1024 * 1024);
  let pendingReview: ReturnType<typeof parseGreaterRealmSanitizedReview>;
  try {
    let parsed: unknown;
    try {
      parsed = JSON.parse(bytes.toString('utf8'));
    } catch {
      fail('GREATER_REALM_PRIVATE_REVIEW_INVALID');
    }
    pendingReview = parseGreaterRealmSanitizedReview(parsed);
  } finally {
    bytes.fill(0);
  }
  if (
    pendingReview.reviewBatchHandle !== batchHandle
    || pendingReview.generatorVersion !== GREATER_REALM_GENERATOR_VERSION
    || pendingReview.selectionStatus !== 'pending'
    || pendingReview.selectedCandidateHandle !== null
  ) fail('GREATER_REALM_PRIVATE_REVIEW_INVALID');
  return pendingReview;
}

function readReview(
  workspace: ReturnType<typeof openGreaterRealmPrivateWorkspace>,
  batchHandle: string,
) {
  const pendingReview = readPendingReview(workspace, batchHandle);
  const selectionPath = selectionRelativePath(batchHandle);
  if (!workspace.hasFile(selectionPath)) return pendingReview;
  const selection = workspace.readFile(selectionPath, 4 * 1024 * 1024);
  try {
    return parseOwnerSelection(
      JSON.parse(selection.toString('utf8')),
      batchHandle,
      pendingReview,
    );
  } catch (error) {
    if (error instanceof SyntaxError) fail('GREATER_REALM_SELECTION_RECEIPT_INVALID');
    throw error;
  } finally {
    selection.fill(0);
  }
}

type GreaterRealmPrivateBatchCandidate = Readonly<{
  candidateHandle: string;
  candidateOrdinal: number;
  manifestDigest: string;
  atlasDigest: string;
}>;

export type GreaterRealmPrivateProofRejectedAttempt = Readonly<{
  kind: 'proof-rejection';
  candidateOrdinal: number;
  activeCellCount: number;
  failedProofs: readonly string[];
}>;

export type GreaterRealmPrivateGeographyRejectedAttempt = Readonly<{
  kind: 'geography-exhaustion';
  candidateOrdinal: number;
  rejectionCode: GreaterRealmCandidateRejectionCode;
}>;

export type GreaterRealmPrivateRejectedAttempt =
  | GreaterRealmPrivateProofRejectedAttempt
  | GreaterRealmPrivateGeographyRejectedAttempt;

export function verifyGreaterRealmPrivateRejectedAttempt(input: Readonly<{
  rootSeed: Uint8Array;
  rejectedAttempt: GreaterRealmPrivateRejectedAttempt;
}>): void {
  let candidate: ReturnType<typeof generateGreaterRealmCandidate> | undefined;
  try {
    candidate = generateGreaterRealmCandidate({
      rootSeed: input.rootSeed,
      candidateOrdinal: input.rejectedAttempt.candidateOrdinal,
    });
    if (input.rejectedAttempt.kind !== 'proof-rejection') {
      fail('GREATER_REALM_PRIVATE_ATTEMPT_LEDGER_INVALID');
    }
    const proofAttempt = input.rejectedAttempt;
    const actualFailures = candidate.privateMetrics.eligibilityFailureCodes;
    if (
      candidate.aggregate.eligible
      || candidate.grid.cellCount !== proofAttempt.activeCellCount
      || actualFailures.length !== proofAttempt.failedProofs.length
      || actualFailures.some((failure, index) => (
        failure !== proofAttempt.failedProofs[index]
      ))
    ) fail('GREATER_REALM_PRIVATE_ATTEMPT_LEDGER_INVALID');
  } catch (error) {
    const actualRejectionCode = greaterRealmCandidateRejectionCode(error);
    if (actualRejectionCode === undefined) throw error;
    if (
      input.rejectedAttempt.kind !== 'geography-exhaustion'
      || input.rejectedAttempt.rejectionCode !== actualRejectionCode
    ) fail('GREATER_REALM_PRIVATE_ATTEMPT_LEDGER_INVALID');
  } finally {
    if (candidate) clearGreaterRealmPrivateCandidateBuffers(candidate);
  }
}

function readPrivateBatch(
  workspace: ReturnType<typeof openGreaterRealmPrivateWorkspace>,
  batchHandle: string,
): Readonly<{
  sourceCommit: string;
  batchSeedDigest: string;
  sanitizedReviewDigest: string;
  requestedCount: number;
  maximumAttempts: number;
  attemptsUsed: number;
  candidates: readonly GreaterRealmPrivateBatchCandidate[];
  rejectedAttempts: readonly GreaterRealmPrivateRejectedAttempt[];
}> {
  const bytes = workspace.readFile(
    `batches/${batchHandle}/batch.private.json`,
    PRIVATE_JSON_MAXIMUM_BYTES,
  );
  let batchSeedEnvelope: Buffer | undefined;
  let batchSeed: Buffer | undefined;
  try {
    let parsed: unknown;
    try {
      parsed = JSON.parse(bytes.toString('utf8'));
    } catch {
      fail('GREATER_REALM_PRIVATE_BATCH_INVALID');
    }
    const row = exactRecord(parsed, [
      'attemptsUsed',
      'batchHandle',
      'batchSeedDigest',
      'candidates',
      'generatorVersion',
      'kind',
      'maximumAttempts',
      'rejectedAttempts',
      'requestedCount',
      'sanitizedReviewDigest',
      'sourceCommit',
    ], 'GREATER_REALM_PRIVATE_BATCH_INVALID');
    if (
      row.kind !== 'warpkeep.greater-realm.private-batch.v1'
      || row.generatorVersion !== GREATER_REALM_GENERATOR_VERSION
      || row.batchHandle !== batchHandle
      || typeof row.sourceCommit !== 'string'
      || !/^[0-9a-f]{40}$/u.test(row.sourceCommit)
      || typeof row.batchSeedDigest !== 'string'
      || !/^[0-9a-f]{64}$/u.test(row.batchSeedDigest)
      || typeof row.sanitizedReviewDigest !== 'string'
      || !/^[0-9a-f]{64}$/u.test(row.sanitizedReviewDigest)
      || !Number.isSafeInteger(row.requestedCount)
      || (row.requestedCount as number) < GREATER_REALM_MINIMUM_CANDIDATE_COUNT
      || (row.requestedCount as number) > GREATER_REALM_MAXIMUM_CANDIDATE_COUNT
      || !Number.isSafeInteger(row.maximumAttempts)
      || (row.maximumAttempts as number) < (row.requestedCount as number)
      || (row.maximumAttempts as number) > 256
      || !Number.isSafeInteger(row.attemptsUsed)
      || (row.attemptsUsed as number) < (row.requestedCount as number)
      || (row.attemptsUsed as number) > (row.maximumAttempts as number)
      || !Array.isArray(row.candidates)
      || row.candidates.length !== row.requestedCount
      || !Array.isArray(row.rejectedAttempts)
      || row.rejectedAttempts.length !== (
        (row.attemptsUsed as number) - (row.requestedCount as number)
      )
    ) fail('GREATER_REALM_PRIVATE_BATCH_INVALID');
    const handles = new Set<string>();
    const ordinals = new Set<number>();
    const candidates = row.candidates.map(value => {
      const candidate = exactRecord(value, [
        'atlasDigest',
        'candidateHandle',
        'candidateOrdinal',
        'manifestDigest',
      ], 'GREATER_REALM_PRIVATE_BATCH_INVALID');
      if (
        typeof candidate.candidateHandle !== 'string'
        || !CANDIDATE_HANDLE.test(candidate.candidateHandle)
        || handles.has(candidate.candidateHandle)
        || !Number.isSafeInteger(candidate.candidateOrdinal)
        || (candidate.candidateOrdinal as number) < 0
        || (candidate.candidateOrdinal as number) >= (row.attemptsUsed as number)
        || ordinals.has(candidate.candidateOrdinal as number)
        || typeof candidate.manifestDigest !== 'string'
        || !/^[0-9a-f]{64}$/u.test(candidate.manifestDigest)
        || typeof candidate.atlasDigest !== 'string'
        || !/^[0-9a-f]{64}$/u.test(candidate.atlasDigest)
      ) fail('GREATER_REALM_PRIVATE_BATCH_INVALID');
      handles.add(candidate.candidateHandle);
      ordinals.add(candidate.candidateOrdinal as number);
      return Object.freeze({
        candidateHandle: candidate.candidateHandle,
        candidateOrdinal: candidate.candidateOrdinal as number,
        manifestDigest: candidate.manifestDigest,
        atlasDigest: candidate.atlasDigest,
      });
    });
    if (candidates.some((candidate, index) => (
      index > 0 && candidate.candidateOrdinal <= candidates[index - 1]!.candidateOrdinal
    ))) fail('GREATER_REALM_PRIVATE_BATCH_INVALID');
    const rejectedOrdinals = new Set<number>();
    const rejectedAttempts: GreaterRealmPrivateRejectedAttempt[] = [];
    for (const value of row.rejectedAttempts) {
      if (
        value === null
        || typeof value !== 'object'
        || Array.isArray(value)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
      ) fail('GREATER_REALM_PRIVATE_BATCH_INVALID');
      const kindDescriptor = Object.getOwnPropertyDescriptor(value, 'kind');
      if (!kindDescriptor || !('value' in kindDescriptor)) {
        fail('GREATER_REALM_PRIVATE_BATCH_INVALID');
      }
      const kind = kindDescriptor.value;
      const rejected = exactRecord(
        value,
        kind === 'proof-rejection'
          ? ['activeCellCount', 'candidateOrdinal', 'failedProofs', 'kind']
          : kind === 'geography-exhaustion'
            ? ['candidateOrdinal', 'kind', 'rejectionCode']
            : [],
        'GREATER_REALM_PRIVATE_BATCH_INVALID',
      );
      if (
        !Number.isSafeInteger(rejected.candidateOrdinal)
        || (rejected.candidateOrdinal as number) < 0
        || (rejected.candidateOrdinal as number) >= (row.attemptsUsed as number)
        || ordinals.has(rejected.candidateOrdinal as number)
        || rejectedOrdinals.has(rejected.candidateOrdinal as number)
      ) fail('GREATER_REALM_PRIVATE_BATCH_INVALID');
      rejectedOrdinals.add(rejected.candidateOrdinal as number);
      if (kind === 'proof-rejection') {
        if (
          !Number.isSafeInteger(rejected.activeCellCount)
          || (rejected.activeCellCount as number) < 1
          || (rejected.activeCellCount as number) > 219_511
          || !Array.isArray(rejected.failedProofs)
          || rejected.failedProofs.length < 1
          || rejected.failedProofs.length > 64
          || new Set(rejected.failedProofs).size !== rejected.failedProofs.length
          || rejected.failedProofs.some(proof => (
            typeof proof !== 'string'
            || !/^[A-Z0-9_:-]{3,160}$/u.test(proof)
          ))
        ) fail('GREATER_REALM_PRIVATE_BATCH_INVALID');
        rejectedAttempts.push(Object.freeze({
          kind,
          candidateOrdinal: rejected.candidateOrdinal as number,
          activeCellCount: rejected.activeCellCount as number,
          failedProofs: Object.freeze([...(rejected.failedProofs as string[])]),
        }));
      } else {
        if (
          typeof rejected.rejectionCode !== 'string'
          || !(GREATER_REALM_CANDIDATE_REJECTION_CODES as readonly string[])
            .includes(rejected.rejectionCode)
        ) fail('GREATER_REALM_PRIVATE_BATCH_INVALID');
        rejectedAttempts.push(Object.freeze({
          kind,
          candidateOrdinal: rejected.candidateOrdinal as number,
          rejectionCode: rejected.rejectionCode as GreaterRealmCandidateRejectionCode,
        }));
      }
    }
    if (rejectedAttempts.some((attempt, index) => (
      index > 0 && attempt.candidateOrdinal <= rejectedAttempts[index - 1]!.candidateOrdinal
    ))) fail('GREATER_REALM_PRIVATE_BATCH_INVALID');
    const everyOrdinal = new Set([...ordinals, ...rejectedOrdinals]);
    for (let ordinal = 0; ordinal < (row.attemptsUsed as number); ordinal += 1) {
      if (!everyOrdinal.has(ordinal)) fail('GREATER_REALM_PRIVATE_BATCH_INVALID');
    }
    if (!ordinals.has((row.attemptsUsed as number) - 1)) {
      fail('GREATER_REALM_PRIVATE_BATCH_INVALID');
    }
    batchSeedEnvelope = workspace.readFile(
      `batches/${batchHandle}/batch-seed.bin`,
      GREATER_REALM_PRIVATE_SEED_ENVELOPE_BYTES,
    );
    batchSeed = decodeGreaterRealmPrivateSeed(batchSeedEnvelope, 'batch');
    if (
      batchSeed.length !== 32
      || createHash('sha256').update(batchSeed).digest('hex') !== row.batchSeedDigest
    ) fail('GREATER_REALM_PRIVATE_BATCH_INVALID');
    return Object.freeze({
      sourceCommit: row.sourceCommit,
      batchSeedDigest: row.batchSeedDigest,
      sanitizedReviewDigest: row.sanitizedReviewDigest,
      requestedCount: row.requestedCount as number,
      maximumAttempts: row.maximumAttempts as number,
      attemptsUsed: row.attemptsUsed as number,
      candidates: Object.freeze(candidates),
      rejectedAttempts: Object.freeze(rejectedAttempts),
    });
  } finally {
    batchSeedEnvelope?.fill(0);
    batchSeed?.fill(0);
    bytes.fill(0);
  }
}

function assertPrivateBatchInventory(
  workspace: ReturnType<typeof openGreaterRealmPrivateWorkspace>,
  batchHandle: string,
  candidateCount: number,
): void {
  const hasSelectionReceipt = workspace.hasFile(selectionRelativePath(batchHandle));
  const hasShortlist = workspace.hasFile(shortlistRelativePath(batchHandle));
  const attestation = workspace.attestTree(`batches/${batchHandle}`);
  const expectedFileCount = 3
    + candidateCount * 9
    + (hasSelectionReceipt ? 1 : 0)
    + (hasShortlist ? 1 : 0);
  const expectedDirectoryCount = 2 + candidateCount * 2;
  if (
    attestation.fileCount !== expectedFileCount
    || attestation.directoryCount !== expectedDirectoryCount
    || attestation.entryCount !== expectedFileCount + expectedDirectoryCount
    || attestation.byteCount < GREATER_REALM_PRIVATE_SEED_ENVELOPE_BYTES
    || attestation.byteCount > PRIVATE_BATCH_MAXIMUM_BYTES
  ) fail('GREATER_REALM_PRIVATE_PACKAGE_INVENTORY_INVALID');
}

async function verifyPrivateReviewBatch(
  workspace: ReturnType<typeof openGreaterRealmPrivateWorkspace>,
  batchHandle: string,
) {
  const review = readPendingReview(workspace, batchHandle);
  const batch = readPrivateBatch(workspace, batchHandle);
  if (
    batch.sourceCommit !== review.sourceCommit
    || batch.sanitizedReviewDigest !== review.reportDigest
    || batch.requestedCount !== review.candidateCount
    || batch.candidates.length !== review.candidateCount
  ) fail('GREATER_REALM_PRIVATE_PACKAGE_INCOMPLETE');
  assertGeneratorSourceProvenance(batch.sourceCommit);
  const reviewByHandle = new Map(review.candidates.map(candidate => [
    candidate.candidateHandle,
    candidate,
  ] as const));
  const verifiedPrivateMetrics: GreaterRealmVerifiedPrivateShortlistMetrics[] = [];
  let batchSeedEnvelope: Buffer | undefined;
  let batchSeed: Buffer | undefined;
  try {
    batchSeedEnvelope = workspace.readFile(
      `batches/${batchHandle}/batch-seed.bin`,
      GREATER_REALM_PRIVATE_SEED_ENVELOPE_BYTES,
    );
    batchSeed = decodeGreaterRealmPrivateSeed(batchSeedEnvelope, 'batch');
    if (
      batchSeed.length !== 32
      || createHash('sha256').update(batchSeed).digest('hex') !== batch.batchSeedDigest
    ) fail('GREATER_REALM_PRIVATE_BATCH_INVALID');
    for (const rejected of batch.rejectedAttempts) {
      verifyGreaterRealmPrivateRejectedAttempt({
        rootSeed: batchSeed,
        rejectedAttempt: rejected,
      });
    }
  } finally {
    batchSeedEnvelope?.fill(0);
    batchSeed?.fill(0);
  }
  for (const privateCandidate of batch.candidates) {
    const candidate = reviewByHandle.get(privateCandidate.candidateHandle);
    if (!candidate || !candidate.eligible) fail('GREATER_REALM_PRIVATE_PACKAGE_INCOMPLETE');
    let comparisonMetrics: GreaterRealmVerifiedPrivateShortlistMetrics | undefined;
    await verifyGreaterRealmPrivateCandidatePackage({
      workspace,
      batchHandle,
      candidateHandle: privateCandidate.candidateHandle,
      expectedCandidateOrdinal: privateCandidate.candidateOrdinal,
      sourceCommit: batch.sourceCommit,
      expectedBatchSeedDigest: batch.batchSeedDigest,
      expectedActiveCellCount: candidate.activeCellCount,
      expectedAggregate: candidateAggregateExpectation(candidate),
      expectedPerformance: Object.freeze({
        generationMilliseconds: candidate.performance.generationMillisecondsRounded,
        processPeakMemoryMiB: candidate.performance.processPeakMemoryMiBRounded,
      }),
      expectedAtlasDigest: privateCandidate.atlasDigest,
      expectedManifestDigest: privateCandidate.manifestDigest,
      onVerifiedPrivateShortlistMetrics: metrics => {
        comparisonMetrics = metrics;
      },
    });
    if (!comparisonMetrics) fail('GREATER_REALM_PRIVATE_PACKAGE_INCOMPLETE');
    verifiedPrivateMetrics.push(comparisonMetrics);
  }
  if (reviewByHandle.size !== batch.candidates.length) {
    fail('GREATER_REALM_PRIVATE_PACKAGE_INCOMPLETE');
  }
  verifyExistingPrivateShortlist(workspace, review, verifiedPrivateMetrics);
  assertPrivateBatchInventory(workspace, batchHandle, review.candidateCount);
  const effectiveReview = workspace.hasFile(selectionRelativePath(batchHandle))
    ? readReview(workspace, batchHandle)
    : review;
  return Object.freeze({
    review: effectiveReview,
    pendingReview: review,
    batch,
    verifiedPrivateMetrics: Object.freeze(verifiedPrivateMetrics),
  });
}

const PUBLIC_EVIDENCE_FILE_MODE = 0o644;
const PUBLIC_EVIDENCE_MAXIMUM_BYTES = 4 * 1024 * 1024;

type PublicEvidenceIdentity = Readonly<{ dev: number; ino: number }>;
type PublicEvidenceDirectoryEntry = Readonly<{
  path: string;
  identity: PublicEvidenceIdentity;
  uid: number;
  mode: number;
}>;
type PublicEvidenceDirectoryAttestation = Readonly<{
  descriptor: number;
  path: string;
  chain: readonly PublicEvidenceDirectoryEntry[];
}>;

function samePublicEvidenceIdentity(
  left: Pick<Stats, 'dev' | 'ino'>,
  right: Pick<Stats, 'dev' | 'ino'>,
): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function assertPublicEvidenceDirectoryStatus(status: Stats): void {
  const currentUser = process.getuid?.();
  const ownerTrusted = currentUser === undefined || status.uid === 0 || status.uid === currentUser;
  const writableByOthers = (status.mode & 0o022) !== 0;
  const protectedStickyRoot = (status.mode & 0o1000) !== 0 && status.uid === 0;
  if (
    !status.isDirectory()
    || status.isSymbolicLink()
    || !ownerTrusted
    || (writableByOthers && !protectedStickyRoot)
  ) fail('GREATER_REALM_PUBLIC_EVIDENCE_DESTINATION_INVALID');
}

function capturePublicEvidenceDirectoryChain(
  evidenceRoot: string,
  repositoryRoot: string,
): readonly PublicEvidenceDirectoryEntry[] {
  const canonicalRepositoryRoot = resolve(repositoryRoot);
  const relation = relative(canonicalRepositoryRoot, evidenceRoot);
  if (
    relation === ''
    || relation === '..'
    || relation.startsWith(`..${sep}`)
    || isAbsolute(relation)
  ) fail('GREATER_REALM_PUBLIC_EVIDENCE_DESTINATION_INVALID');
  const root = parse(canonicalRepositoryRoot).root;
  const components = relative(root, evidenceRoot).split(sep).filter(Boolean);
  let current = root;
  const chain: PublicEvidenceDirectoryEntry[] = [];
  const capture = (path: string): void => {
    if (!existsSync(path)) fail('GREATER_REALM_PUBLIC_EVIDENCE_DESTINATION_INVALID');
    const status = lstatSync(path);
    assertPublicEvidenceDirectoryStatus(status);
    if (realpathSync(path) !== path) {
      fail('GREATER_REALM_PUBLIC_EVIDENCE_DESTINATION_INVALID');
    }
    chain.push(Object.freeze({
      path,
      identity: Object.freeze({ dev: status.dev, ino: status.ino }),
      uid: status.uid,
      mode: status.mode,
    }));
  };
  capture(root);
  for (const component of components) {
    current = resolve(current, component);
    capture(current);
  }
  return Object.freeze(chain);
}

function openPublicEvidenceDirectory(
  evidenceRoot: string,
  repositoryRoot: string,
): PublicEvidenceDirectoryAttestation {
  const chain = capturePublicEvidenceDirectoryChain(evidenceRoot, repositoryRoot);
  let descriptor: number | undefined;
  try {
    descriptor = openSync(
      evidenceRoot,
      constants.O_RDONLY
        | (constants.O_DIRECTORY ?? 0)
        | (constants.O_NOFOLLOW ?? 0),
    );
    const opened = fstatSync(descriptor);
    const expected = chain.at(-1);
    if (expected === undefined) fail('GREATER_REALM_PUBLIC_EVIDENCE_DESTINATION_INVALID');
    assertPublicEvidenceDirectoryStatus(opened);
    if (!samePublicEvidenceIdentity(opened, expected.identity)) {
      fail('GREATER_REALM_PUBLIC_EVIDENCE_DESTINATION_INVALID');
    }
    const result = Object.freeze({ descriptor, path: evidenceRoot, chain });
    descriptor = undefined;
    return result;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('GREATER_REALM_')) throw error;
    return fail('GREATER_REALM_PUBLIC_EVIDENCE_DESTINATION_INVALID');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function attestPublicEvidenceDirectory(
  attestation: PublicEvidenceDirectoryAttestation,
  repositoryRoot: string,
): void {
  const currentChain = capturePublicEvidenceDirectoryChain(attestation.path, repositoryRoot);
  if (
    currentChain.length !== attestation.chain.length
    || currentChain.some((current, index) => {
      const expected = attestation.chain[index];
      return expected === undefined
        || current.path !== expected.path
        || !samePublicEvidenceIdentity(current.identity, expected.identity)
        || current.uid !== expected.uid
        || current.mode !== expected.mode;
    })
  ) fail('GREATER_REALM_PUBLIC_EVIDENCE_DESTINATION_CHANGED');
  const opened = fstatSync(attestation.descriptor);
  const expectedParent = attestation.chain.at(-1);
  assertPublicEvidenceDirectoryStatus(opened);
  if (
    expectedParent === undefined
    || !samePublicEvidenceIdentity(opened, expectedParent.identity)
    || opened.uid !== expectedParent.uid
    || opened.mode !== expectedParent.mode
  ) fail('GREATER_REALM_PUBLIC_EVIDENCE_DESTINATION_CHANGED');
}

function assertPublicEvidenceDirectorySafe(
  evidenceRoot: string,
  repositoryRoot = ROOT,
): void {
  const attestation = openPublicEvidenceDirectory(evidenceRoot, repositoryRoot);
  closeSync(attestation.descriptor);
}

function resolvePublicEvidenceDestination(repositoryRoot: string, path: string): string {
  const absolute = resolve(repositoryRoot, path);
  const evidenceRoot = resolve(repositoryRoot, 'docs', 'evidence', 'greater-realm');
  const name = basename(absolute);
  if (
    dirname(absolute) !== evidenceRoot
    || !/^[a-z0-9][a-z0-9._-]{0,126}\.json$/u.test(name)
  ) fail('GREATER_REALM_PUBLIC_EVIDENCE_DESTINATION_INVALID');
  assertPublicEvidenceDirectorySafe(evidenceRoot, repositoryRoot);
  return absolute;
}

export function resolveGreaterRealmPublicEvidenceDestination(path: string): string {
  return resolvePublicEvidenceDestination(ROOT, path);
}

function readPublicEvidence(path: string): Buffer {
  const absolute = resolveGreaterRealmPublicEvidenceDestination(path);
  let descriptor: number | undefined;
  try {
    descriptor = openSync(absolute, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor);
    if (!before.isFile() || before.size < 1 || before.size > 4 * 1024 * 1024) {
      fail('GREATER_REALM_PUBLIC_EVIDENCE_INPUT_INVALID');
    }
    const bytes = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < bytes.length) {
      const count = readSync(descriptor, bytes, offset, bytes.length - offset, null);
      if (count <= 0) fail('GREATER_REALM_PUBLIC_EVIDENCE_INPUT_INVALID');
      offset += count;
    }
    const after = fstatSync(descriptor);
    const current = lstatSync(absolute);
    if (
      before.dev !== after.dev
      || before.ino !== after.ino
      || before.size !== after.size
      || before.mtimeMs !== after.mtimeMs
      || !current.isFile()
      || current.isSymbolicLink()
      || current.dev !== after.dev
      || current.ino !== after.ino
    ) {
      bytes.fill(0);
      fail('GREATER_REALM_PUBLIC_EVIDENCE_INPUT_INVALID');
    }
    return bytes;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('GREATER_REALM_')) throw error;
    return fail('GREATER_REALM_PUBLIC_EVIDENCE_INPUT_INVALID');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function assertPublicEvidenceFileStatus(
  status: Stats,
  identity: PublicEvidenceIdentity,
  byteLength: number,
  linkCount: number,
): void {
  if (
    !status.isFile()
    || status.isSymbolicLink()
    || !samePublicEvidenceIdentity(status, identity)
    || status.size !== byteLength
    || status.nlink !== linkCount
    || (process.getuid !== undefined && status.uid !== process.getuid())
    || (status.mode & 0o777) !== PUBLIC_EVIDENCE_FILE_MODE
  ) fail('GREATER_REALM_PUBLIC_EVIDENCE_WRITE_FAILED');
}

function attestPublicEvidenceBytes(
  descriptor: number,
  identity: PublicEvidenceIdentity,
  expected: Buffer,
  linkCount: number,
): void {
  const before = fstatSync(descriptor);
  assertPublicEvidenceFileStatus(before, identity, expected.byteLength, linkCount);
  const observed = Buffer.alloc(expected.byteLength);
  try {
    let offset = 0;
    while (offset < observed.byteLength) {
      const count = readSync(
        descriptor,
        observed,
        offset,
        observed.byteLength - offset,
        offset,
      );
      if (count <= 0) fail('GREATER_REALM_PUBLIC_EVIDENCE_WRITE_FAILED');
      offset += count;
    }
    const after = fstatSync(descriptor);
    assertPublicEvidenceFileStatus(after, identity, expected.byteLength, linkCount);
    if (
      before.mtimeMs !== after.mtimeMs
      || before.ctimeMs !== after.ctimeMs
      || !observed.equals(expected)
    ) fail('GREATER_REALM_PUBLIC_EVIDENCE_WRITE_FAILED');
  } finally {
    observed.fill(0);
  }
}

function safeUnlinkPublicEvidenceIdentity(
  path: string,
  identity: PublicEvidenceIdentity,
): void {
  try {
    const current = lstatSync(path);
    if (samePublicEvidenceIdentity(current, identity)) unlinkSync(path);
  } catch {
    // Cleanup never removes a substituted entry.
  }
}

type PublicEvidenceWriteInterlock = (input: Readonly<{
  destinationPath: string;
  parentPath: string;
  temporaryPath: string;
}>) => void;

function writePublicEvidence(
  path: string,
  bytes: Buffer,
  repositoryRoot = ROOT,
  beforeInstall?: PublicEvidenceWriteInterlock,
): void {
  if (bytes.byteLength < 1 || bytes.byteLength > PUBLIC_EVIDENCE_MAXIMUM_BYTES) {
    fail('GREATER_REALM_PUBLIC_EVIDENCE_WRITE_FAILED');
  }
  const destination = resolvePublicEvidenceDestination(repositoryRoot, path);
  const parent = dirname(destination);
  const parentAttestation = openPublicEvidenceDirectory(parent, repositoryRoot);
  if (existsSync(destination)) {
    closeSync(parentAttestation.descriptor);
    fail('GREATER_REALM_PUBLIC_EVIDENCE_DESTINATION_INVALID');
  }
  const temporary = `${destination}.${randomUUID()}.tmp`;
  let descriptor: number | undefined;
  let temporaryIdentity: PublicEvidenceIdentity | undefined;
  let destinationInstalled = false;
  let completed = false;
  try {
    attestPublicEvidenceDirectory(parentAttestation, repositoryRoot);
    descriptor = openSync(
      temporary,
      constants.O_CREAT
        | constants.O_EXCL
        | constants.O_RDWR
        | (constants.O_NOFOLLOW ?? 0),
      PUBLIC_EVIDENCE_FILE_MODE,
    );
    fchmodSync(descriptor, PUBLIC_EVIDENCE_FILE_MODE);
    const created = fstatSync(descriptor);
    temporaryIdentity = Object.freeze({ dev: created.dev, ino: created.ino });
    assertPublicEvidenceFileStatus(created, temporaryIdentity, 0, 1);
    let offset = 0;
    while (offset < bytes.length) {
      const count = writeSync(descriptor, bytes, offset, bytes.length - offset);
      if (count <= 0) fail('GREATER_REALM_PUBLIC_EVIDENCE_WRITE_FAILED');
      offset += count;
    }
    fsyncSync(descriptor);
    attestPublicEvidenceBytes(descriptor, temporaryIdentity, bytes, 1);
    assertPublicEvidenceFileStatus(
      lstatSync(temporary),
      temporaryIdentity,
      bytes.byteLength,
      1,
    );

    beforeInstall?.(Object.freeze({
      destinationPath: destination,
      parentPath: parent,
      temporaryPath: temporary,
    }));

    attestPublicEvidenceDirectory(parentAttestation, repositoryRoot);
    assertPublicEvidenceFileStatus(
      lstatSync(temporary),
      temporaryIdentity,
      bytes.byteLength,
      1,
    );
    attestPublicEvidenceBytes(descriptor, temporaryIdentity, bytes, 1);
    linkSync(temporary, destination);
    destinationInstalled = true;
    const linkedDestination = lstatSync(destination);
    assertPublicEvidenceFileStatus(
      lstatSync(temporary),
      temporaryIdentity,
      bytes.byteLength,
      2,
    );
    assertPublicEvidenceFileStatus(
      linkedDestination,
      temporaryIdentity,
      bytes.byteLength,
      2,
    );
    attestPublicEvidenceBytes(descriptor, temporaryIdentity, bytes, 2);
    attestPublicEvidenceDirectory(parentAttestation, repositoryRoot);
    unlinkSync(temporary);
    assertPublicEvidenceFileStatus(
      lstatSync(destination),
      temporaryIdentity,
      bytes.byteLength,
      1,
    );
    attestPublicEvidenceBytes(descriptor, temporaryIdentity, bytes, 1);
    fsyncSync(descriptor);
    fsyncSync(parentAttestation.descriptor);
    attestPublicEvidenceDirectory(parentAttestation, repositoryRoot);
    completed = true;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('GREATER_REALM_')) throw error;
    if ((error as NodeJS.ErrnoException)?.code === 'EEXIST') {
      fail('GREATER_REALM_PUBLIC_EVIDENCE_DESTINATION_INVALID');
    }
    fail('GREATER_REALM_PUBLIC_EVIDENCE_WRITE_FAILED');
  } finally {
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch { /* Preserve the fixed diagnostic. */ }
    }
    if (!completed && destinationInstalled && temporaryIdentity !== undefined) {
      safeUnlinkPublicEvidenceIdentity(destination, temporaryIdentity);
    }
    if (temporaryIdentity !== undefined) {
      safeUnlinkPublicEvidenceIdentity(temporary, temporaryIdentity);
    }
    try { closeSync(parentAttestation.descriptor); } catch { /* Preserve the fixed diagnostic. */ }
  }
}

/** Executable ESM test seam for deterministic substitution regressions. */
export const greaterRealmPublicEvidenceTestSeams = Object.freeze({
  write(input: Readonly<{
    repositoryRoot: string;
    path: string;
    bytes: Buffer;
    beforeInstall?: PublicEvidenceWriteInterlock;
  }>): void {
    writePublicEvidence(
      resolvePublicEvidenceDestination(input.repositoryRoot, input.path),
      input.bytes,
      input.repositoryRoot,
      input.beforeInstall,
    );
  },
});

async function main(): Promise<void> {
  const rawArguments = process.argv.slice(2);
  assertGreaterRealmPrivateInvocation(rawArguments, process.env);
  const arguments_ = parseArguments(rawArguments);
  if (arguments_.command === 'generate-candidates') {
    await generateCandidates(arguments_);
    return;
  }
  if (arguments_.command === 'verify-sanitized-review') {
    const input = readPublicEvidence(arguments_.inputPath!);
    let report: ReturnType<typeof parseGreaterRealmSanitizedReview>;
    try {
      report = parseGreaterRealmSanitizedReview(JSON.parse(input.toString('utf8')));
    } finally {
      input.fill(0);
    }
    process.stdout.write(`${JSON.stringify({
      candidateCount: report.candidateCount,
      selectionStatus: report.selectionStatus,
      verified: true,
    })}\n`);
    return;
  }
  const workspace = openGreaterRealmPrivateWorkspace({
    repositoryRoot: ROOT,
    workspaceRoot: arguments_.workspaceRoot,
  });
  if (arguments_.command === 'compare-candidates') {
    const batchHandle = arguments_.batchHandle!;
    const shortlist = await workspace.withExclusiveLock(
      `locks/${batchHandle}.selection.lock`,
      async () => {
        const { review, verifiedPrivateMetrics } = await verifyPrivateReviewBatch(
          workspace,
          batchHandle,
        );
        const result = buildGreaterRealmPrivateCandidateShortlist(
          review,
          verifiedPrivateMetrics,
        );
        const path = shortlistRelativePath(batchHandle);
        if (!workspace.hasFile(path)) writePrivateJson(workspace, path, result);
        return result;
      },
    );
    process.stdout.write(`${JSON.stringify({
      batchHandle,
      shortlistCount: shortlist.shortlistCount,
      selectionStatus: shortlist.selectionStatus,
      ranked: shortlist.ranked,
      automaticSelection: shortlist.automaticSelection,
      productionUntouched: true,
    })}\n`);
    return;
  }
  if (arguments_.command === 'verify-private-package') {
    const { review } = await verifyPrivateReviewBatch(
      workspace,
      arguments_.batchHandle!,
    );
    process.stdout.write(`${JSON.stringify({
      candidateCount: review.candidateCount,
      privatePackageVerified: true,
    })}\n`);
    return;
  }
  if (arguments_.command === 'export-sanitized-review') {
    const { review } = await verifyPrivateReviewBatch(workspace, arguments_.batchHandle!);
    const bytes = Buffer.from(serializeGreaterRealmSanitizedReview(review), 'utf8');
    try {
      writePublicEvidence(
        resolveGreaterRealmPublicEvidenceDestination(arguments_.outputPath!),
        bytes,
      );
    } finally {
      bytes.fill(0);
    }
    process.stdout.write(`${JSON.stringify({
      candidateCount: review.candidateCount,
      selectionStatus: review.selectionStatus,
      exported: true,
    })}\n`);
    return;
  }
  const batchHandle = arguments_.batchHandle!;
  const selectedHandle = await workspace.withExclusiveLock(
    `locks/${batchHandle}.selection.lock`,
    async () => {
      if (workspace.hasFile(selectionRelativePath(batchHandle))) {
        fail('GREATER_REALM_SELECTION_INVALID');
      }
      const { review } = await verifyPrivateReviewBatch(workspace, batchHandle);
      const selected = review.candidates.find(candidate => (
        candidate.candidateHandle === arguments_.candidateHandle && candidate.eligible
      ));
      if (!selected || review.selectionStatus !== 'pending') {
        fail('GREATER_REALM_SELECTION_INVALID');
      }
      const selectedReview = createGreaterRealmSanitizedReview({
        generatorVersion: review.generatorVersion,
        sourceCommit: review.sourceCommit,
        reviewBatchHandle: review.reviewBatchHandle,
        selectionStatus: 'selected',
        selectedCandidateHandle: selected.candidateHandle,
        candidates: review.candidates.map(candidateSource),
      });
      writePrivateJson(workspace, selectionRelativePath(batchHandle), {
        kind: 'warpkeep.greater-realm.private-owner-selection.v1',
        batchHandle,
        candidateHandle: arguments_.candidateHandle,
        approvalReference: arguments_.approvalReference,
        generatorVersion: GREATER_REALM_GENERATOR_VERSION,
        sourceReviewDigest: review.reportDigest,
        selectedReview,
      });
      return selected.candidateHandle;
    },
  );
  process.stdout.write(`${JSON.stringify({
    candidateHandle: selectedHandle,
    selectionRecorded: true,
    productionUntouched: true,
  })}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    const code = error instanceof Error && /^[A-Z0-9_:-]{3,160}$/u.test(error.message)
      ? error.message
      : 'GREATER_REALM_CLI_FAILED';
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  });
}
