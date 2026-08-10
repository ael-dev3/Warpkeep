import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  constants,
  fstatSync,
  lstatSync,
  openSync,
  closeSync,
  readSync,
  readdirSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { basename, delimiter, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  GREATER_REALM_PRIVATE_MARKER_OVERLAP_BYTES,
  GREATER_REALM_PRIVATE_MARKER_TEXT,
  containsGreaterRealmPrivateMarker,
} from './greater-realm-private-markers.mjs';

const MAXIMUM_GIT_OUTPUT_BYTES = 16 * 1024 * 1024;
const MAXIMUM_GIT_BLOB_BATCH_BYTES = 16 * 1024 * 1024;
const MAXIMUM_SCANNED_TEXT_BYTES = 16 * 1024 * 1024;
const MAXIMUM_SCANNED_BINARY_BYTES = 128 * 1024 * 1024;
const BINARY_SCAN_CHUNK_BYTES = 64 * 1024;
const MAXIMUM_TREE_ENTRIES = 250_000;
const TRUSTED_GIT_CANDIDATES = Object.freeze({
  aix: Object.freeze(['/usr/bin/git', '/usr/local/bin/git']),
  darwin: Object.freeze(['/usr/bin/git']),
  freebsd: Object.freeze(['/usr/local/bin/git', '/usr/bin/git']),
  linux: Object.freeze(['/usr/bin/git']),
  netbsd: Object.freeze(['/usr/pkg/bin/git', '/usr/local/bin/git', '/usr/bin/git']),
  openbsd: Object.freeze(['/usr/local/bin/git', '/usr/bin/git']),
  sunos: Object.freeze(['/usr/bin/git', '/usr/local/bin/git']),
  win32: Object.freeze([
    'C:\\Program Files\\Git\\cmd\\git.exe',
    'C:\\Program Files\\Git\\bin\\git.exe',
    'C:\\Program Files (x86)\\Git\\cmd\\git.exe',
    'C:\\Program Files (x86)\\Git\\bin\\git.exe',
  ]),
});
const TRUSTED_GIT_TIMEOUT_MS = 10_000;
const PRIVATE_PATH_COMPONENTS = new Set([
  '.warpkeep-private',
  'greater-realm-private',
]);
const PRIVATE_EXACT_FILENAMES = new Set([
  'seed.bin',
  'batch-seed.bin',
  'manifest.private.json',
  'batch.private.json',
  'selection.private.json',
  'shortlist.private.json',
]);
const PRIVATE_EXTENSIONS = Object.freeze([
  '.wkgr-atlas',
  '.wkgr-checkpoint',
  '.wkgr-private',
]);
const OWNER_PREVIEW_EXTENSIONS = new Set([
  '.avif',
  '.gif',
  '.html',
  '.jpeg',
  '.jpg',
  '.png',
  '.svg',
  '.webp',
]);
const OPAQUE_ARCHIVE_EXTENSIONS = new Set([
  '.7z',
  '.bz2',
  '.gz',
  '.rar',
  '.tar',
  '.tgz',
  '.xz',
  '.zip',
  '.zst',
]);
const ZIP_LOCAL_FILE_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const ZIP_CENTRAL_DIRECTORY_MAGIC = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
const ZIP_END_OF_CENTRAL_DIRECTORY_MAGIC = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
const OPAQUE_ARCHIVE_PREFIXES = Object.freeze([
  Buffer.from([0x1f, 0x8b, 0x08]),
  Buffer.from([0x28, 0xb5, 0x2f, 0xfd]),
  Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]),
  Buffer.from([0x42, 0x5a, 0x68]),
  ZIP_LOCAL_FILE_MAGIC,
  ZIP_END_OF_CENTRAL_DIRECTORY_MAGIC,
  Buffer.from([0x50, 0x4b, 0x07, 0x08]),
  Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07]),
  Buffer.from([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00]),
]);
const TAR_USTAR_MAGIC = Buffer.from('ustar', 'ascii');
const TAR_USTAR_OFFSET = 257;
const TEXT_EXTENSIONS = new Set([
  '.bash',
  '.cjs',
  '.csv',
  '.cts',
  '.css',
  '.example',
  '.fish',
  '.gql',
  '.graphql',
  '.html',
  '.ini',
  '.js',
  '.json',
  '.jsx',
  '.lock',
  '.md',
  '.mjs',
  '.map',
  '.mts',
  '.ndjson',
  '.properties',
  '.py',
  '.rb',
  '.rs',
  '.sh',
  '.sql',
  '.svelte',
  '.template',
  '.ts',
  '.tsx',
  '.tsv',
  '.toml',
  '.txt',
  '.vue',
  '.xml',
  '.yaml',
  '.yml',
  '.zsh',
]);
const TEXT_EXACT_FILENAMES = new Set([
  'cmakelists.txt',
  'dockerfile',
  'gemfile',
  'justfile',
  'makefile',
  'procfile',
]);
const PRIVATE_TEXT_FIELD = /(?:["'](?:privateSeedHex|seedMaterial|seedBytes|hiddenCellPayload|privateCanvasDescriptor)["']|(?:^|[^\p{ID_Continue}$])(?:privateSeedHex|seedMaterial|seedBytes|hiddenCellPayload|privateCanvasDescriptor))\s*:/mu;
const PRIVATE_EVIDENCE_FIELD = /["'](?:layoutDigest|stageDigest|packageDigest)["']\s*:/u;
const PRIVATE_IDENTIFIER_STRING_VALUE = /(?:(?:\b(?:seed|private)[A-Za-z0-9_$]*\b)|(?:\b[A-Za-z_$][A-Za-z0-9_$]*(?:seed|private)[A-Za-z0-9_$]*\b)|(?:\\?["'`][A-Za-z0-9_$.-]*(?:seed|private)[A-Za-z0-9_$.-]*\\?["'`]))\s*(?::|=)\s*\\?["'`]([A-Za-z0-9+/_=-]{43,64})\\?["'`]/giu;
const INLINE_DATA_SOURCE_MAP = /sourceMappingURL\s*=\s*data:/iu;
const PRIVATE_LIVING_WORLD_AUTHORITY_FIELDS = Object.freeze([
  Object.freeze(['dressingExcluded', 'dressing-excluded']),
  Object.freeze(['ecologyClass', 'ecology-class']),
  Object.freeze(['vegetationDensity', 'vegetation-density']),
  Object.freeze(['routeClass', 'route-class']),
  Object.freeze(['landmarkClass', 'landmark-class']),
  Object.freeze(['ambientLifeClass', 'ambient-life-class']),
]);
const PRIVATE_LIVING_WORLD_DATA_EXTENSIONS = new Set([
  '.csv',
  '.dat',
  '.data',
  '.ini',
  '.json',
  '.ndjson',
  '.properties',
  '.toml',
  '.tsv',
  '.txt',
  '.yaml',
  '.yml',
]);
const PRIVATE_LIVING_WORLD_AUTHORITY_ALIASES = Object.freeze(
  PRIVATE_LIVING_WORLD_AUTHORITY_FIELDS.flat(),
);
const PRIVATE_LIVING_WORLD_AUTHORITY_ALIASES_CASEFOLDED = Object.freeze(
  PRIVATE_LIVING_WORLD_AUTHORITY_ALIASES.map(alias => alias.toLowerCase()),
);
const PRIVATE_LIVING_WORLD_AUTHORITY_ASCII_FIELDS = Object.freeze(
  PRIVATE_LIVING_WORLD_AUTHORITY_FIELDS.map(aliases => Object.freeze(
    aliases.map(alias => Buffer.from(alias.toLowerCase(), 'ascii')),
  )),
);
function utf16BigEndianBytes(text) {
  const bytes = Buffer.from(text, 'utf16le');
  for (let offset = 0; offset < bytes.length; offset += 2) {
    const first = bytes[offset];
    bytes[offset] = bytes[offset + 1];
    bytes[offset + 1] = first;
  }
  return bytes;
}
function utf32Bytes(text, bigEndian) {
  const codePoints = [...text];
  const bytes = Buffer.allocUnsafe(codePoints.length * 4);
  for (let index = 0; index < codePoints.length; index += 1) {
    const value = codePoints[index].codePointAt(0);
    if (bigEndian) bytes.writeUInt32BE(value, index * 4);
    else bytes.writeUInt32LE(value, index * 4);
  }
  return bytes;
}
const PRIVATE_LIVING_WORLD_AUTHORITY_UTF16_FIELDS = Object.freeze(
  PRIVATE_LIVING_WORLD_AUTHORITY_FIELDS.map(aliases => Object.freeze(
    aliases.flatMap(alias => Object.freeze([
      Buffer.from(alias.toLowerCase(), 'utf16le'),
      utf16BigEndianBytes(alias.toLowerCase()),
    ])),
  )),
);
const PRIVATE_LIVING_WORLD_AUTHORITY_UTF32_FIELDS = Object.freeze(
  PRIVATE_LIVING_WORLD_AUTHORITY_FIELDS.map(aliases => Object.freeze(
    aliases.flatMap(alias => Object.freeze([
      utf32Bytes(alias.toLowerCase(), false),
      utf32Bytes(alias.toLowerCase(), true),
    ])),
  )),
);
const PRIVATE_LIVING_WORLD_AUTHORITY_ALIAS_MINIMUM_LENGTH = Math.min(
  ...PRIVATE_LIVING_WORLD_AUTHORITY_ALIASES.map(alias => alias.length),
);
const PRIVATE_LIVING_WORLD_AUTHORITY_ALIAS_MAXIMUM_LENGTH = Math.max(
  ...PRIVATE_LIVING_WORLD_AUTHORITY_ALIASES.map(alias => alias.length),
);
const PRIVATE_LIVING_WORLD_AUTHORITY_FIELD_MASK =
  (1 << PRIVATE_LIVING_WORLD_AUTHORITY_FIELDS.length) - 1;
const PRIVATE_BINARY_SCAN_UTF16_TEXT =
  1 << PRIVATE_LIVING_WORLD_AUTHORITY_FIELDS.length;
const PRIVATE_BINARY_SCAN_STARTED =
  1 << (PRIVATE_LIVING_WORLD_AUTHORITY_FIELDS.length + 1);
const PRIVATE_BINARY_SCAN_ZIP_LOCAL =
  1 << (PRIVATE_LIVING_WORLD_AUTHORITY_FIELDS.length + 2);
const PRIVATE_BINARY_SCAN_ZIP_CENTRAL =
  1 << (PRIVATE_LIVING_WORLD_AUTHORITY_FIELDS.length + 3);
const PRIVATE_BINARY_SCAN_ZIP_END =
  1 << (PRIVATE_LIVING_WORLD_AUTHORITY_FIELDS.length + 4);
const PRIVATE_LIVING_WORLD_AUTHORITY_OVERLAP_BYTES = Math.max(
  ...PRIVATE_LIVING_WORLD_AUTHORITY_ALIASES.map(alias => (
    Buffer.byteLength(alias, 'utf16le') * 2 - 1
  )),
);
const PRIVATE_BINARY_SCAN_OVERLAP_BYTES = Math.ceil(Math.max(
  GREATER_REALM_PRIVATE_MARKER_OVERLAP_BYTES,
  PRIVATE_LIVING_WORLD_AUTHORITY_OVERLAP_BYTES,
) / 4) * 4;
const PRIVATE_LIVING_WORLD_JSON_INITIALIZED_FIELD = new RegExp(
  `["'](?:${PRIVATE_LIVING_WORLD_AUTHORITY_ALIASES.join('|')})["']`
    + '\\s*:',
  'iu',
);
const PRIVATE_LIVING_WORLD_AUTHORITY_FIELD_PATTERNS = Object.freeze(
  PRIVATE_LIVING_WORLD_AUTHORITY_FIELDS.map(aliases => new RegExp(
    `(?:^|[^\\p{ID_Continue}$-])(?:${aliases.join('|')})`
      + '(?=$|[^\\p{ID_Continue}$-])',
    'mu',
  )),
);
const PRIVATE_LIVING_WORLD_AUTHORITY_ARRAY = new RegExp(
  `(?:["'\`](?:${PRIVATE_LIVING_WORLD_AUTHORITY_FIELDS.flat().join('|')})["'\`]`
    + `|(?:^|[^\\p{ID_Continue}$-])(?:${PRIVATE_LIVING_WORLD_AUTHORITY_FIELDS
      .flat()
      .join('|')}))`
    + '\\s*(?::|=)\\s*'
    + '(?:(?:new\\s+)?Uint8Array\\s*\\(\\s*|Uint8Array\\.from\\s*\\(\\s*'
    + '|Buffer\\.from\\s*\\(\\s*)?\\[\\s*[-+]?\\d',
  'mu',
);
const PRIVATE_RELIEF_STRUCTURE_MATRIX_FIELDS = Object.freeze([
  'pairCountsByLagAndAxis',
  'pairCoverageBasisPointsByLagAndAxis',
  'meanSquaredDifferenceByLagAndAxis',
]);
const PRIVATE_RELIEF_STRUCTURE_VECTOR_FIELDS = Object.freeze([
  'lagOneToFourGrowthBasisPointsByAxis',
  'lagFourToTwelveGrowthBasisPointsByAxis',
  'axialAnisotropyBasisPointsByLag',
]);
const PRIVATE_RELIEF_STRUCTURE_BOOLEAN_FIELDS = Object.freeze([
  'pairCoverageProof',
  'scaleGrowthProof',
  'axialAnisotropyProof',
]);
const PRIVATE_RELIEF_STRUCTURE_BINARY_PATTERNS = Object.freeze([
  ...PRIVATE_RELIEF_STRUCTURE_MATRIX_FIELDS,
  ...PRIVATE_RELIEF_STRUCTURE_VECTOR_FIELDS,
  ...PRIVATE_RELIEF_STRUCTURE_BOOLEAN_FIELDS,
  'eligibleCellCount',
].flatMap(field => {
  const casefolded = field.toLowerCase();
  return Object.freeze([
    Buffer.from(casefolded, 'ascii'),
    Buffer.from(casefolded, 'utf16le'),
    utf16BigEndianBytes(casefolded),
    utf32Bytes(casefolded, false),
    utf32Bytes(casefolded, true),
  ]);
}));
const PRIVATE_BINARY_TEXT_FIELD_PATTERNS = Object.freeze([
  'privateSeedHex',
  'seedMaterial',
  'seedBytes',
  'hiddenCellPayload',
  'privateCanvasDescriptor',
].flatMap(field => {
  const casefolded = field.toLowerCase();
  return Object.freeze([
    Buffer.from(casefolded, 'ascii'),
    Buffer.from(casefolded, 'utf16le'),
    utf16BigEndianBytes(casefolded),
    utf32Bytes(casefolded, false),
    utf32Bytes(casefolded, true),
  ]);
}));
const PRIVATE_RELIEF_STRUCTURE_NUMERIC_VALUE =
  '[-+]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:e[-+]?\\d+)?';
const PRIVATE_RELIEF_STRUCTURE_ARRAY_FIELDS = Object.freeze([
  ...PRIVATE_RELIEF_STRUCTURE_MATRIX_FIELDS,
  ...PRIVATE_RELIEF_STRUCTURE_VECTOR_FIELDS,
]);
const PRIVATE_RELIEF_STRUCTURE_NUMERIC_ARRAY_TYPE =
  '(?:Big(?:Int64|Uint64)Array|Float(?:16|32|64)Array|Int(?:8|16|32)Array|Uint8ClampedArray|Uint(?:8|16|32)Array)';
const PRIVATE_RELIEF_STRUCTURE_VALUE_WRAPPERS =
  '(?:(?:Object\\.freeze\\s*\\(\\s*|\\(\\s*)){0,4}';
const PRIVATE_RELIEF_STRUCTURE_INITIALIZED_MATRIX = new RegExp(
  `(?:["'\`](?:${PRIVATE_RELIEF_STRUCTURE_MATRIX_FIELDS.join('|')})["'\`]`
    + `|(?:^|[^\\p{ID_Continue}$-])(?:${PRIVATE_RELIEF_STRUCTURE_MATRIX_FIELDS.join('|')}))`
    + `\\s*(?::|=)\\s*${PRIVATE_RELIEF_STRUCTURE_VALUE_WRAPPERS}`
    + `\\[\\s*\\[\\s*${PRIVATE_RELIEF_STRUCTURE_NUMERIC_VALUE}`,
  'imu',
);
const PRIVATE_RELIEF_STRUCTURE_INITIALIZED_VECTOR = new RegExp(
  `(?:["'\`](?:${PRIVATE_RELIEF_STRUCTURE_VECTOR_FIELDS.join('|')})["'\`]`
    + `|(?:^|[^\\p{ID_Continue}$-])(?:${PRIVATE_RELIEF_STRUCTURE_VECTOR_FIELDS.join('|')}))`
    + `\\s*(?::|=)\\s*${PRIVATE_RELIEF_STRUCTURE_VALUE_WRAPPERS}`
    + `\\[\\s*${PRIVATE_RELIEF_STRUCTURE_NUMERIC_VALUE}`,
  'imu',
);
const PRIVATE_RELIEF_STRUCTURE_INITIALIZED_TYPED_ARRAY = new RegExp(
  `(?:["'\`](?:${PRIVATE_RELIEF_STRUCTURE_ARRAY_FIELDS.join('|')})["'\`]`
    + `|(?:^|[^\\p{ID_Continue}$-])(?:${PRIVATE_RELIEF_STRUCTURE_ARRAY_FIELDS.join('|')}))`
    + '\\s*(?::|=)\\s*'
    + PRIVATE_RELIEF_STRUCTURE_VALUE_WRAPPERS
    + `(?:(?:(?:new\\s+)?${PRIVATE_RELIEF_STRUCTURE_NUMERIC_ARRAY_TYPE}\\s*\\(\\s*`
    + `|(?:${PRIVATE_RELIEF_STRUCTURE_NUMERIC_ARRAY_TYPE}|Array|Buffer)\\.from\\s*\\(\\s*)?`
    + `\\[\\s*(?:\\[\\s*)?${PRIVATE_RELIEF_STRUCTURE_NUMERIC_VALUE}`
    + `|(?:${PRIVATE_RELIEF_STRUCTURE_NUMERIC_ARRAY_TYPE}|Array)\\.of\\s*\\(\\s*`
    + `${PRIVATE_RELIEF_STRUCTURE_NUMERIC_VALUE})`,
  'imu',
);
const PRIVATE_RELIEF_STRUCTURE_INITIALIZED_OBJECT = new RegExp(
  `(?:["'\`](?:${PRIVATE_RELIEF_STRUCTURE_ARRAY_FIELDS.join('|')})["'\`]`
    + `|(?:^|[^\\p{ID_Continue}$-])(?:${PRIVATE_RELIEF_STRUCTURE_ARRAY_FIELDS.join('|')}))`
    + `\\s*(?::|=)\\s*${PRIVATE_RELIEF_STRUCTURE_VALUE_WRAPPERS}\\{\\s*`
    + '(?:["\'`][A-Za-z_$][A-Za-z0-9_$-]*["\'`]|[A-Za-z_$][A-Za-z0-9_$]*)'
    + `\\s*:\\s*(?:\\[\\s*)?${PRIVATE_RELIEF_STRUCTURE_NUMERIC_VALUE}`,
  'imu',
);
const PRIVATE_RELIEF_STRUCTURE_JSON_INITIALIZED_FIELD = new RegExp(
  `["'](?:${[
    ...PRIVATE_RELIEF_STRUCTURE_ARRAY_FIELDS,
    ...PRIVATE_RELIEF_STRUCTURE_BOOLEAN_FIELDS,
    'eligibleCellCount',
  ].join('|')})["']\\s*:`,
  'iu',
);
const PRIVATE_RELIEF_STRUCTURE_INITIALIZED_ELIGIBLE_SCALAR = new RegExp(
  `(?:["'\`]eligibleCellCount["'\`]`
    + '|(?:^|[^\\p{ID_Continue}$-])eligibleCellCount)'
    + `\\s*(?::|=)\\s*${PRIVATE_RELIEF_STRUCTURE_NUMERIC_VALUE}`,
  'imu',
);
const PRIVATE_RELIEF_STRUCTURE_INITIALIZED_SUBPROOF = new RegExp(
  `(?:["'\`](?:${PRIVATE_RELIEF_STRUCTURE_BOOLEAN_FIELDS.join('|')})["'\`]`
    + `|(?:^|[^\\p{ID_Continue}$-])(?:${PRIVATE_RELIEF_STRUCTURE_BOOLEAN_FIELDS.join('|')}))`
    + '\\s*(?::|=)\\s*(?:true|false)',
  'imu',
);
// This runtime-only mirror intentionally fails closed when the public review
// contract changes. Evidence cannot enter either the staged index or worktree
// until this exact schema and its focused parity tests are updated together.
const SANITIZED_REVIEW_EVIDENCE_PATH =
  /^docs\/evidence\/greater-realm\/[a-z0-9][a-z0-9._-]{0,126}\.json$/u;
const SANITIZED_REVIEW_EVIDENCE_PREFIX = 'docs/evidence/greater-realm/';
const SANITIZED_REVIEW_EVIDENCE_README =
  'docs/evidence/greater-realm/README.md';
const SANITIZED_REVIEW_EVIDENCE_README_BYTES = 1_421;
const SANITIZED_REVIEW_EVIDENCE_README_SHA256 =
  'e61fa36df40a8b1a37372ee41b27456b77f49e32480fcd8ba613d29b2914cb79';
const SANITIZED_REVIEW_MAXIMUM_BYTES = 4 * 1024 * 1024;
const SANITIZED_REVIEW_MINIMUM_CANDIDATE_COUNT = 1;
const SANITIZED_REVIEW_MAXIMUM_CANDIDATE_COUNT = 16;
const SANITIZED_REVIEW_SCHEMA = 'warpkeep.greater-realm.candidate-review.v1';
const SANITIZED_REVIEW_PRIVACY_BOUNDARY =
  'aggregate-only-no-private-generation-material-v1';
const SANITIZED_REVIEW_PROOF_KEYS = Object.freeze([
  'activeMaskConnected',
  'advancedGeomorphology',
  'approvedCellRange',
  'barriersHaveNoBypass',
  'biomeCoherence',
  'biomeDiversity',
  'castleCapacity',
  'deepOceanBoundary',
  'dormantThroneAnchor',
  'gateApproaches',
  'gateGraph',
  'geologicalHighlandBarriers',
  'hydrologyAcyclic',
  'hydrologySurfaceConsistency',
  'legacyLowlandsPreserved',
  'naturalLandmassTopology',
  'naturalStrategicRegions',
  'naturalOuterBoundary',
  'regionPassableLand',
  'regionLandCoherence',
  'regionGraph',
  'naturalLandSilhouette',
  'dominantContinentComposition',
  'deepOceanBreathingRoom',
  'forestPatchComposition',
  'mountainSystemComposition',
]);
const SANITIZED_REVIEW_CANDIDATE_KEYS = Object.freeze([
  'candidateHandle',
  'eligible',
  'activeCellCount',
  'landCellCount',
  'waterCellCount',
  'tierCellCounts',
  'regionSizeRanges',
  'hydrology',
  'geology',
  'topography',
  'biomes',
  'quality',
  'gateCount',
  'castleSlotCount',
  'proofs',
  'performance',
  'insideApprovedRange',
  'landBasisPoints',
  'waterBasisPoints',
  'tierBasisPoints',
]);
const SANITIZED_REVIEW_FORBIDDEN_KEY =
  /(?:^|_)(?:q|r|x|y|z)(?:$|_)|coord|latitude|longitude|seed|transform|translation|rotation|chunk|layoutdigest|stagedigest|packagedigest|preview|screenshot|thumbnail|image|filepath|pathname|url/iu;
const SANITIZED_REVIEW_FORBIDDEN_STRING =
  /(?:data:image\/|(?:^|[\\/])[^\r\n]*\.(?:avif|gif|jpe?g|png|svg|webp)(?:$|[?#])|WKGR[_-]PRIVATE|warpkeep\.greater-realm\.private)/iu;
const SANITIZED_REVIEW_CANDIDATE_HANDLE = /^GR-A-[A-Z2-7]{16}$/u;
const SANITIZED_REVIEW_BATCH_HANDLE = /^GR-B-[A-Z2-7]{16}$/u;
const SANITIZED_REVIEW_SOURCE_COMMIT = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u;
const SANITIZED_REVIEW_GENERATOR_VERSION =
  /^[a-z0-9](?:[a-z0-9.-]{0,62}[a-z0-9])?$/u;
const SANITIZED_REVIEW_SHA256 = /^[0-9a-f]{64}$/u;

function privateMarkerText(index) {
  const marker = GREATER_REALM_PRIVATE_MARKER_TEXT[index];
  if (marker === undefined) fail('GREATER_REALM_PUBLIC_BOUNDARY_SOURCE_ALLOWANCE_INVALID');
  return marker;
}

function sourceAllowance(fragment, count = 1) {
  return Object.freeze({ fragment, count });
}

function markerConstAllowance(index) {
  return sourceAllowance(`'${privateMarkerText(index)}' as const`);
}

function privateFieldName(first, second) {
  return `${first}${second}`;
}

// Generator source necessarily declares a small private vocabulary. Allow only
// the exact reviewed source fragments and exact occurrence counts below. The
// rest of each file is scanned normally, so appending a seed, marker, manifest,
// or preview payload to one of these files cannot hide behind a file allowlist.
const TRACKED_PRIVATE_SOURCE_ALLOWANCES = new Map([
  ['scripts/atlas/greater-realm-candidate-generator.ts', Object.freeze([
    markerConstAllowance(2),
    markerConstAllowance(5),
    sourceAllowance(`${privateFieldName('seed', 'Material')}: Buffer;`),
    sourceAllowance(`${privateFieldName('seed', 'Material')}: Uint8Array,`),
  ])],
  ['scripts/atlas/greater-realm-candidate-package.ts', Object.freeze([
    markerConstAllowance(3),
    markerConstAllowance(11),
    markerConstAllowance(12),
    sourceAllowance(`.update('${privateMarkerText(13)}\\0', 'utf8')`),
    sourceAllowance(`${privateFieldName('seed', 'Material')}: Uint8Array;`),
    sourceAllowance(`${privateFieldName('seed', 'Material')}: input.candidate.${privateFieldName('seed', 'Material')},`),
    sourceAllowance(`${privateFieldName('seed', 'Material')}: derivedSeed,`),
  ])],
  ['scripts/atlas/greater-realm-cli.ts', Object.freeze([
    sourceAllowance(`kind: '${privateMarkerText(7)}',`),
    sourceAllowance(`row.kind !== '${privateMarkerText(7)}'`),
    sourceAllowance(`kind: '${privateMarkerText(8)}',`),
    sourceAllowance(`row.kind !== '${privateMarkerText(8)}'`),
    sourceAllowance(`kind: '${privateMarkerText(9)}' as const,`),
  ])],
  ['scripts/atlas/greater-realm-legacy-lowlands.ts', Object.freeze([
    markerConstAllowance(10),
  ])],
  ['scripts/atlas/greater-realm-private-seed.ts', Object.freeze([
    sourceAllowance(`const PRIVATE_SEED_MARKER = '${privateMarkerText(4)}' as const;`),
  ])],
  ['scripts/atlas/greater-realm-private-markers.mjs', Object.freeze([
    ...GREATER_REALM_PRIVATE_MARKER_TEXT.map(marker => sourceAllowance(`'${marker}',`)),
  ])],
  ['tests/greaterRealmCandidateGenerator.test.ts', Object.freeze([
    sourceAllowance(
      `${privateFieldName('seed', 'Material')}: Buffer.from(candidate.${privateFieldName('seed', 'Material')}),`,
    ),
  ])],
]);

export class GreaterRealmPublicBoundaryError extends Error {
  constructor(code) {
    super(code);
    this.name = 'GreaterRealmPublicBoundaryError';
    this.code = code;
  }
}

function fail(code) {
  throw new GreaterRealmPublicBoundaryError(code);
}

function extension(path) {
  const name = basename(path).toLowerCase();
  const index = name.lastIndexOf('.');
  return index < 0 ? '' : name.slice(index);
}

function knownTextPath(path) {
  const name = basename(path).toLowerCase();
  return TEXT_EXTENSIONS.has(extension(path)) || TEXT_EXACT_FILENAMES.has(name);
}

function normalizedRelativePath(path) {
  if (
    typeof path !== 'string'
    || path.length === 0
    || path.length > 4_096
    || path.includes('\0')
    || path.normalize('NFC') !== path
  ) fail('GREATER_REALM_PUBLIC_BOUNDARY_PATH_INVALID');
  const normalized = path.replaceAll('\\', '/');
  const components = normalized.split('/');
  if (components.some(component => (
    component.length === 0
    || component === '.'
    || component === '..'
    || component.normalize('NFC') !== component
  ))) fail('GREATER_REALM_PUBLIC_BOUNDARY_PATH_INVALID');
  return normalized;
}

function privateArtifactPath(relativePath) {
  const normalized = normalizedRelativePath(relativePath);
  const components = normalized.toLowerCase().split('/');
  const name = components.at(-1);
  return components.some(component => PRIVATE_PATH_COMPONENTS.has(component))
    || PRIVATE_EXACT_FILENAMES.has(name)
    || PRIVATE_EXTENSIONS.some(suffix => name.endsWith(suffix))
    || /(?:^|[._-])private-preview(?:[._-]|$)/u.test(name)
    || /(?:^|[._-])atlas-checkpoint(?:[._-]|$)/u.test(name);
}

function ownerPreviewEvidencePath(relativePath) {
  const normalized = normalizedRelativePath(relativePath).toLowerCase();
  if (!normalized.startsWith('docs/evidence/greater-realm/')) return false;
  return OWNER_PREVIEW_EXTENSIONS.has(extension(normalized));
}

function opaqueArchivePath(relativePath) {
  return OPAQUE_ARCHIVE_EXTENSIONS.has(extension(relativePath));
}

function startsWithBytes(bytes, prefix) {
  return bytes.length >= prefix.length
    && bytes.subarray(0, prefix.length).equals(prefix);
}

function containsOpaqueArchiveMagic(bytes) {
  return OPAQUE_ARCHIVE_PREFIXES.some(prefix => startsWithBytes(bytes, prefix))
    || (
      bytes.length >= TAR_USTAR_OFFSET + TAR_USTAR_MAGIC.length
      && bytes.subarray(
        TAR_USTAR_OFFSET,
        TAR_USTAR_OFFSET + TAR_USTAR_MAGIC.length,
      ).equals(TAR_USTAR_MAGIC)
    );
}

function statFingerprint(status) {
  return Object.freeze({
    ctimeMs: status.ctimeMs,
    dev: status.dev,
    gid: status.gid,
    ino: status.ino,
    mode: status.mode,
    mtimeMs: status.mtimeMs,
    size: status.size,
    uid: status.uid,
  });
}

function sameStatFingerprint(left, right) {
  return Object.keys(left).every(key => left[key] === right[key]);
}

function attestTrustedGitCandidate(candidate) {
  try {
    if (resolve(candidate) !== candidate) return undefined;
    let current = candidate;
    let executableStatus;
    while (true) {
      const status = lstatSync(current);
      if (status.isSymbolicLink()) return undefined;
      if (current === candidate) {
        if (!status.isFile()) return undefined;
        executableStatus = status;
        if (process.platform !== 'win32' && (
          status.uid !== 0
          || (status.mode & 0o022) !== 0
          || (status.mode & 0o111) === 0
          || (status.mode & 0o6000) !== 0
        )) return undefined;
      } else if (!status.isDirectory()) {
        return undefined;
      } else if (process.platform !== 'win32' && (
        status.uid !== 0
        || (status.mode & 0o022) !== 0
      )) {
        return undefined;
      }
      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }
    const canonicalCandidate = realpathSync.native(candidate);
    if (
      executableStatus === undefined
      || (process.platform === 'win32'
        ? canonicalCandidate.toLowerCase() !== candidate.toLowerCase()
        : canonicalCandidate !== candidate)
    ) {
      return undefined;
    }
    return Object.freeze({
      path: candidate,
      fingerprint: statFingerprint(executableStatus),
    });
  } catch {
    return undefined;
  }
}

function resolveTrustedGitBinary() {
  // Never fall back to PATH. These are OS/package-manager protected locations;
  // unsupported layouts fail closed with GIT_UNTRUSTED instead of executing an
  // arbitrary developer-controlled binary. Windows intentionally permits only
  // the standard Git for Windows installation on the system drive.
  const candidates = TRUSTED_GIT_CANDIDATES[process.platform];
  if (candidates === undefined) fail('GREATER_REALM_PUBLIC_BOUNDARY_GIT_UNTRUSTED');
  for (const candidate of candidates) {
    const attestation = attestTrustedGitCandidate(candidate);
    if (attestation !== undefined) return attestation;
  }
  fail('GREATER_REALM_PUBLIC_BOUNDARY_GIT_UNTRUSTED');
}

function hardenedGitEnvironment(attestation, repositoryRoot) {
  const windows = process.platform === 'win32';
  let canonicalRepositoryRoot;
  try {
    canonicalRepositoryRoot = realpathSync.native(repositoryRoot);
  } catch {
    fail('GREATER_REALM_PUBLIC_BOUNDARY_GIT_FAILED');
  }
  const environment = {
    GIT_ATTR_NOSYSTEM: '1',
    GIT_CEILING_DIRECTORIES: canonicalRepositoryRoot,
    GIT_CONFIG_GLOBAL: windows ? 'NUL' : '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_DISCOVERY_ACROSS_FILESYSTEM: '0',
    GIT_NO_REPLACE_OBJECTS: '1',
    GIT_OPTIONAL_LOCKS: '0',
    GIT_TERMINAL_PROMPT: '0',
    LANG: 'C',
    LC_ALL: 'C',
    PATH: windows
      ? [dirname(attestation.path), 'C:\\Windows\\System32'].join(delimiter)
      : '/usr/bin:/bin',
  };
  if (windows) {
    environment.SystemRoot = 'C:\\Windows';
    environment.WINDIR = 'C:\\Windows';
  }
  return environment;
}

function hardenedGitArguments(repositoryRoot, commandArguments) {
  const nullPath = process.platform === 'win32' ? 'NUL' : '/dev/null';
  return [
    '--no-pager',
    '--no-replace-objects',
    '--no-optional-locks',
    '--literal-pathspecs',
    `--work-tree=${repositoryRoot}`,
    '-c', 'core.bare=false',
    '-c', 'core.fsmonitor=false',
    '-c', `core.hooksPath=${nullPath}`,
    '-c', 'core.untrackedCache=false',
    '-c', 'core.useReplaceRefs=false',
    '-c', 'maintenance.auto=false',
    '-c', 'gc.auto=0',
    '-c', 'protocol.allow=never',
    ...commandArguments,
  ];
}

function invokeTrustedGit(
  attestation,
  repositoryRoot,
  commandArguments,
  maxBuffer,
  input,
) {
  const result = spawnSync(
    attestation.path,
    hardenedGitArguments(repositoryRoot, commandArguments),
    {
      cwd: repositoryRoot,
      encoding: 'buffer',
      env: hardenedGitEnvironment(attestation, repositoryRoot),
      killSignal: 'SIGKILL',
      maxBuffer,
      shell: false,
      timeout: TRUSTED_GIT_TIMEOUT_MS,
      windowsHide: true,
      ...(input === undefined ? {} : { input }),
    },
  );
  const after = attestTrustedGitCandidate(attestation.path);
  if (
    after === undefined
    || !sameStatFingerprint(attestation.fingerprint, after.fingerprint)
  ) fail('GREATER_REALM_PUBLIC_BOUNDARY_GIT_UNTRUSTED');
  if (
    result.error
    || result.status !== 0
    || result.signal !== null
    || !Buffer.isBuffer(result.stdout)
  ) fail('GREATER_REALM_PUBLIC_BOUNDARY_GIT_FAILED');
  return result.stdout;
}

function enumerateTrackedIndex(repositoryRoot) {
  const attestation = resolveTrustedGitBinary();
  const versionBytes = invokeTrustedGit(
    attestation,
    repositoryRoot,
    ['--version'],
    1_024,
  );
  const version = decodeUtf8Text(versionBytes);
  if (version === undefined || !/^git version [^\0\r\n]{1,160}\r?\n?$/u.test(version)) {
    fail('GREATER_REALM_PUBLIC_BOUNDARY_GIT_UNTRUSTED');
  }
  const topLevelBytes = invokeTrustedGit(
    attestation,
    repositoryRoot,
    ['rev-parse', '--show-toplevel'],
    8_192,
  );
  const topLevelText = decodeUtf8Text(topLevelBytes);
  if (topLevelText === undefined || topLevelText.includes('\0')) {
    fail('GREATER_REALM_PUBLIC_BOUNDARY_GIT_FAILED');
  }
  const topLevel = topLevelText.replace(/\r?\n$/u, '');
  try {
    const actual = realpathSync.native(topLevel);
    const expected = realpathSync.native(repositoryRoot);
    if ((process.platform === 'win32' ? actual.toLowerCase() : actual)
      !== (process.platform === 'win32' ? expected.toLowerCase() : expected)) {
      fail('GREATER_REALM_PUBLIC_BOUNDARY_GIT_FAILED');
    }
  } catch (error) {
    if (error instanceof GreaterRealmPublicBoundaryError) throw error;
    fail('GREATER_REALM_PUBLIC_BOUNDARY_GIT_FAILED');
  }
  const objectFormatBytes = invokeTrustedGit(
    attestation,
    repositoryRoot,
    ['rev-parse', '--show-object-format'],
    1_024,
  );
  const objectFormatText = decodeUtf8Text(objectFormatBytes);
  const objectFormat = objectFormatText?.trim();
  const objectIdLength = objectFormat === 'sha1'
    ? 40
    : objectFormat === 'sha256' ? 64 : 0;
  if (objectIdLength === 0) fail('GREATER_REALM_PUBLIC_BOUNDARY_GIT_UNTRUSTED');
  const trackedBytes = invokeTrustedGit(
    attestation,
    repositoryRoot,
    ['ls-files', '--cached', '--stage', '--full-name', '-z', '--'],
    MAXIMUM_GIT_OUTPUT_BYTES,
  );
  const trackedText = decodeUtf8Text(trackedBytes, true);
  if (trackedText === undefined) fail('GREATER_REALM_PUBLIC_BOUNDARY_GIT_FAILED');
  const entries = [];
  const seenPaths = new Set();
  for (const record of trackedText.split('\0').filter(Boolean)) {
    const tab = record.indexOf('\t');
    if (tab < 0) fail('GREATER_REALM_PUBLIC_BOUNDARY_GIT_FAILED');
    const metadata = record.slice(0, tab);
    const match = /^([0-7]{6}) ([0-9a-f]+) ([0-3])$/u.exec(metadata);
    if (match === null || match[2].length !== objectIdLength) {
      fail('GREATER_REALM_PUBLIC_BOUNDARY_GIT_FAILED');
    }
    const path = normalizedRelativePath(record.slice(tab + 1));
    if (seenPaths.has(path)) fail('GREATER_REALM_PUBLIC_BOUNDARY_SPECIAL_ENTRY');
    seenPaths.add(path);
    if (
      !['100644', '100755'].includes(match[1])
      || match[3] !== '0'
    ) fail('GREATER_REALM_PUBLIC_BOUNDARY_SPECIAL_ENTRY');
    entries.push(Object.freeze({
      objectId: match[2],
      path,
    }));
  }
  return Object.freeze({
    attestation,
    entries: Object.freeze(entries),
    objectIdLength,
  });
}

function exactOccurrenceCount(text, fragment) {
  if (fragment.length === 0) {
    fail('GREATER_REALM_PUBLIC_BOUNDARY_SOURCE_ALLOWANCE_INVALID');
  }
  let count = 0;
  let offset = 0;
  while (offset <= text.length - fragment.length) {
    const found = text.indexOf(fragment, offset);
    if (found < 0) break;
    count += 1;
    offset = found + fragment.length;
  }
  return count;
}

function containsPrivateIdentifierSecretValue(text) {
  for (const match of text.matchAll(PRIVATE_IDENTIFIER_STRING_VALUE)) {
    const value = match[1];
    if (value === undefined) continue;
    if (/^[0-9a-f]{64}$/iu.test(value)) return true;
    if (
      /^[A-Za-z0-9+/_-]{43}=?$/u.test(value)
      && /[A-Z]/u.test(value)
      && /[a-z]/u.test(value)
      && /[0-9]/u.test(value)
    ) return true;
  }
  return false;
}

function scrubExpectedPrivateSourceLiterals(text, relativePath) {
  const allowances = TRACKED_PRIVATE_SOURCE_ALLOWANCES.get(relativePath);
  if (allowances === undefined) return text;
  let scrubbed = text;
  for (const allowance of allowances) {
    if (
      typeof allowance.fragment !== 'string'
      || allowance.fragment.length === 0
      || !Number.isSafeInteger(allowance.count)
      || allowance.count < 1
      || exactOccurrenceCount(text, allowance.fragment) !== allowance.count
    ) fail('GREATER_REALM_PUBLIC_BOUNDARY_SOURCE_ALLOWANCE_INVALID');
    scrubbed = scrubbed.split(allowance.fragment).join(' '.repeat(allowance.fragment.length));
  }
  return scrubbed;
}

function decodeAsciiEscape(_match, braced, fixed, byte) {
  const encoded = braced ?? fixed ?? byte;
  const codePoint = Number.parseInt(encoded, 16);
  return Number.isSafeInteger(codePoint) && codePoint > 0 && codePoint <= 0x7f
    ? String.fromCodePoint(codePoint)
    : _match;
}

function normalizePrivacyScanText(text) {
  let normalized = text.normalize('NFKC');
  for (let pass = 0; pass < 4; pass += 1) {
    const decoded = normalized.replace(
      /\\+u\{([0-9a-f]{1,6})\}|\\+u([0-9a-f]{4})|\\+x([0-9a-f]{2})/giu,
      decodeAsciiEscape,
    );
    if (decoded === normalized) break;
    normalized = decoded;
  }
  for (let pass = 0; pass < 8; pass += 1) {
    const flattened = normalized.replace(/\\*["'`]\s*\+\s*\\*["'`]/gu, '');
    if (flattened === normalized) break;
    normalized = flattened;
  }
  return normalized;
}

function privateLivingWorldDataPath(relativePath, text) {
  const suffix = extension(relativePath);
  if (PRIVATE_LIVING_WORLD_DATA_EXTENSIONS.has(suffix)) return true;
  // A renamed standalone JSON payload remains data even if its extension is
  // unfamiliar. Source maps are deliberately excluded because their embedded
  // source declarations are scanned by the existing marker/secret checks.
  if (suffix === '.map') return false;
  const trimmed = text.trim();
  return (trimmed.startsWith('{') && trimmed.endsWith('}'))
    || (trimmed.startsWith('[') && trimmed.endsWith(']'));
}

function tabularWhitespace(code) {
  return code <= 0x20 || code === 0xfeff;
}

function tabularCellBounds(text, rawStart, rawEnd) {
  let start = rawStart;
  let end = rawEnd;
  while (start < end && tabularWhitespace(text.charCodeAt(start))) start += 1;
  while (end > start && tabularWhitespace(text.charCodeAt(end - 1))) end -= 1;
  if (end - start >= 2) {
    const quote = text[start];
    if (
      (quote === '"' || quote === "'" || quote === '`')
      && text[end - 1] === quote
    ) {
      start += 1;
      end -= 1;
      while (start < end && tabularWhitespace(text.charCodeAt(start))) start += 1;
      while (end > start && tabularWhitespace(text.charCodeAt(end - 1))) end -= 1;
    }
  }
  return { start, end };
}

function tabularCellAuthority(text, start, end) {
  const length = end - start;
  if (
    length < PRIVATE_LIVING_WORLD_AUTHORITY_ALIAS_MINIMUM_LENGTH
    || length > PRIVATE_LIVING_WORLD_AUTHORITY_ALIAS_MAXIMUM_LENGTH
  ) return false;
  return PRIVATE_LIVING_WORLD_AUTHORITY_ALIASES_CASEFOLDED.some(alias => {
    if (alias.length !== length) return false;
    for (let offset = 0; offset < length; offset += 1) {
      const code = text.charCodeAt(start + offset);
      const casefolded = code >= 0x41 && code <= 0x5a ? code + 0x20 : code;
      if (casefolded !== alias.charCodeAt(offset)) return false;
    }
    return true;
  });
}

function tabularCellNumeric(text, start, end) {
  let index = start;
  if (index >= end) return false;
  if (text[index] === '+' || text[index] === '-') index += 1;
  let integerDigits = 0;
  while (
    index < end
    && text.charCodeAt(index) >= 0x30
    && text.charCodeAt(index) <= 0x39
  ) {
    integerDigits += 1;
    index += 1;
  }
  let fractionalDigits = 0;
  if (index < end && text[index] === '.') {
    index += 1;
    while (
      index < end
      && text.charCodeAt(index) >= 0x30
      && text.charCodeAt(index) <= 0x39
    ) {
      fractionalDigits += 1;
      index += 1;
    }
  }
  if (integerDigits === 0 && fractionalDigits === 0) return false;
  if (index < end && (text[index] === 'e' || text[index] === 'E')) {
    index += 1;
    if (index < end && (text[index] === '+' || text[index] === '-')) index += 1;
    let exponentDigits = 0;
    while (
      index < end
      && text.charCodeAt(index) >= 0x30
      && text.charCodeAt(index) <= 0x39
    ) {
      exponentDigits += 1;
      index += 1;
    }
    if (exponentDigits === 0) return false;
  }
  return index === end;
}

function containsDelimitedLivingWorldAuthority(
  text,
  delimiter,
  collapseDelimiters = false,
) {
  const authorityColumns = new Int32Array(
    PRIVATE_LIVING_WORLD_AUTHORITY_ALIASES.length,
  );
  let authorityColumnCount = 0;
  let columnIndex = 0;
  let fieldStart = 0;
  let fieldHasContent = false;
  let inQuotes = false;
  let quote = '';
  let rowHasAuthority = false;
  let rowHasNumeric = false;

  const isDelimiter = collapseDelimiters
    ? character => ' \t,;|:='.includes(character)
    : character => character === delimiter;
  const hasAuthorityColumn = column => {
    for (let index = 0; index < authorityColumnCount; index += 1) {
      if (authorityColumns[index] === column) return true;
    }
    return false;
  };
  const addAuthorityColumn = column => {
    if (hasAuthorityColumn(column)) return false;
    if (authorityColumnCount >= authorityColumns.length) return true;
    authorityColumns[authorityColumnCount] = column;
    authorityColumnCount += 1;
    return false;
  };
  const visitCell = rawEnd => {
    const { start, end } = tabularCellBounds(text, fieldStart, rawEnd);
    const authority = tabularCellAuthority(text, start, end);
    const numeric = tabularCellNumeric(text, start, end);
    rowHasAuthority ||= authority;
    rowHasNumeric ||= numeric;
    if (numeric && hasAuthorityColumn(columnIndex)) return true;
    if (authority && addAuthorityColumn(columnIndex)) return true;
    return false;
  };
  const finishRow = () => {
    const result = rowHasAuthority && rowHasNumeric;
    rowHasAuthority = false;
    rowHasNumeric = false;
    columnIndex = 0;
    return result;
  };

  for (let index = 0; index <= text.length; index += 1) {
    if (index === text.length) {
      if ((!collapseDelimiters || fieldHasContent) && visitCell(index)) return true;
      return finishRow();
    }
    const character = text[index];
    if (inQuotes) {
      if (character === quote) {
        if (text[index + 1] === quote) index += 1;
        else inQuotes = false;
      }
      fieldHasContent = true;
      continue;
    }
    if (
      !fieldHasContent
      && (character === '"' || character === "'" || character === '`')
    ) {
      inQuotes = true;
      quote = character;
      fieldHasContent = true;
      continue;
    }
    if (character === '\r' || character === '\n') {
      if ((!collapseDelimiters || fieldHasContent) && visitCell(index)) return true;
      if (finishRow()) return true;
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      fieldStart = index + 1;
      fieldHasContent = false;
      continue;
    }
    if (isDelimiter(character)) {
      if (!collapseDelimiters || fieldHasContent) {
        if (visitCell(index)) return true;
        columnIndex += 1;
      }
      fieldStart = index + 1;
      fieldHasContent = false;
      continue;
    }
    if (!tabularWhitespace(text.charCodeAt(index))) fieldHasContent = true;
  }
  return false;
}

function containsPrivateLivingWorldTabularAuthority(text, relativePath) {
  const suffix = extension(relativePath);
  if (
    (suffix === '.json' || suffix === '.ndjson'
      || privateLivingWorldDataPath(relativePath, text))
    && PRIVATE_LIVING_WORLD_JSON_INITIALIZED_FIELD.test(text)
  ) {
    return true;
  }
  if (suffix === '.json' || suffix === '.ndjson') return false;
  if (suffix === '.csv') return containsDelimitedLivingWorldAuthority(text, ',');
  if (suffix === '.tsv') return containsDelimitedLivingWorldAuthority(text, '\t');
  // Data-oriented text formats and unfamiliar UTF-8 files are content-sniffed
  // as bounded key/value rows. Source and documentation extensions retain the
  // stricter initialized-array rule so ordinary vocabulary and types remain
  // reviewable without creating an extension-based bypass for renamed data.
  if (
    PRIVATE_LIVING_WORLD_DATA_EXTENSIONS.has(suffix)
    || !knownTextPath(relativePath)
  ) return containsDelimitedLivingWorldAuthority(text, '', true);
  return false;
}

function containsPrivateReliefStructureAuthority(text, relativePath) {
  if (
    PRIVATE_RELIEF_STRUCTURE_INITIALIZED_MATRIX.test(text)
    || PRIVATE_RELIEF_STRUCTURE_INITIALIZED_VECTOR.test(text)
    || PRIVATE_RELIEF_STRUCTURE_INITIALIZED_TYPED_ARRAY.test(text)
    || PRIVATE_RELIEF_STRUCTURE_INITIALIZED_OBJECT.test(text)
    || PRIVATE_RELIEF_STRUCTURE_INITIALIZED_SUBPROOF.test(text)
  ) return true;
  return privateLivingWorldDataPath(relativePath, text) && (
    PRIVATE_RELIEF_STRUCTURE_JSON_INITIALIZED_FIELD.test(text)
    || PRIVATE_RELIEF_STRUCTURE_INITIALIZED_ELIGIBLE_SCALAR.test(text)
  );
}

function containsPrivateLivingWorldAuthority(text, relativePath) {
  // Exact initialized numeric authority arrays remain private even when they
  // are pasted into an otherwise ordinary source module. Requiring the first
  // array element to be numeric preserves type-only tuple declarations.
  if (PRIVATE_LIVING_WORLD_AUTHORITY_ARRAY.test(text)) return true;
  if (containsPrivateLivingWorldTabularAuthority(text, relativePath)) return true;
  if (!privateLivingWorldDataPath(relativePath, text)) return false;

  // Encoded private atlases carry a complete six-name field inventory before
  // their byte arrays. Requiring every exact authority name avoids treating a
  // single word in ordinary content as private, while still catching mixed
  // camel/kebab encodings after an artifact is renamed or its WKGR marker is
  // stripped.
  return PRIVATE_LIVING_WORLD_AUTHORITY_FIELD_PATTERNS.every(pattern => (
    pattern.test(text)
  ));
}

function privateLivingWorldAuthorityByteMask(bytes, initialMask = 0) {
  const casefolded = Buffer.allocUnsafe(bytes.length);
  try {
    for (let offset = 0; offset < bytes.length; offset += 1) {
      const value = bytes[offset];
      casefolded[offset] = value >= 0x41 && value <= 0x5a ? value + 0x20 : value;
    }
    if (
      PRIVATE_RELIEF_STRUCTURE_BINARY_PATTERNS.some(pattern => (
        casefolded.indexOf(pattern) !== -1
      ))
      || PRIVATE_BINARY_TEXT_FIELD_PATTERNS.some(pattern => (
        casefolded.indexOf(pattern) !== -1
      ))
    ) fail('GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_FIELD');
    let mask = initialMask;
    for (let index = 0; index < PRIVATE_LIVING_WORLD_AUTHORITY_FIELDS.length; index += 1) {
      const bit = 1 << index;
      if ((mask & bit) !== 0) continue;
      if (
        PRIVATE_LIVING_WORLD_AUTHORITY_ASCII_FIELDS[index].some(alias => (
          casefolded.indexOf(alias) !== -1
        ))
        || PRIVATE_LIVING_WORLD_AUTHORITY_UTF16_FIELDS[index].some(alias => (
          casefolded.indexOf(alias) !== -1
        ))
        || PRIVATE_LIVING_WORLD_AUTHORITY_UTF32_FIELDS[index].some(alias => (
          casefolded.indexOf(alias) !== -1
        ))
      ) mask |= bit;
    }
    return mask;
  } finally {
    casefolded.fill(0);
  }
}

function scanBinaryBytes(bytes, initialState = 0) {
  let state = initialState;
  if ((state & PRIVATE_BINARY_SCAN_STARTED) === 0) {
    if (containsOpaqueArchiveMagic(bytes)) {
      fail('GREATER_REALM_PUBLIC_BOUNDARY_OPAQUE_ARCHIVE');
    }
    state |= PRIVATE_BINARY_SCAN_STARTED;
  }
  if (bytes.indexOf(ZIP_LOCAL_FILE_MAGIC) !== -1) {
    state |= PRIVATE_BINARY_SCAN_ZIP_LOCAL;
  }
  if (bytes.indexOf(ZIP_CENTRAL_DIRECTORY_MAGIC) !== -1) {
    state |= PRIVATE_BINARY_SCAN_ZIP_CENTRAL;
  }
  if (bytes.indexOf(ZIP_END_OF_CENTRAL_DIRECTORY_MAGIC) !== -1) {
    state |= PRIVATE_BINARY_SCAN_ZIP_END;
  }
  if (
    (state & (
      PRIVATE_BINARY_SCAN_ZIP_LOCAL
      | PRIVATE_BINARY_SCAN_ZIP_CENTRAL
      | PRIVATE_BINARY_SCAN_ZIP_END
    )) === (
      PRIVATE_BINARY_SCAN_ZIP_LOCAL
      | PRIVATE_BINARY_SCAN_ZIP_CENTRAL
      | PRIVATE_BINARY_SCAN_ZIP_END
    )
  ) fail('GREATER_REALM_PUBLIC_BOUNDARY_OPAQUE_ARCHIVE');
  if (containsGreaterRealmPrivateMarker(bytes)) {
    fail('GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_MARKER');
  }
  if (
    (state & PRIVATE_BINARY_SCAN_UTF16_TEXT) === 0
    && (
      likelyUtf16ByteOrder(bytes) !== undefined
      || likelyUtf32ByteOrder(bytes) !== undefined
    )
  ) state |= PRIVATE_BINARY_SCAN_UTF16_TEXT;
  state = privateLivingWorldAuthorityByteMask(bytes, state);
  const authorityMask = state & PRIVATE_LIVING_WORLD_AUTHORITY_FIELD_MASK;
  if (authorityMask !== 0) {
    fail('GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_FIELD');
  }
  return state;
}

function scanBinaryChunk(chunk, priorCarry, priorState) {
  let window;
  try {
    window = priorCarry.length === 0 ? chunk : Buffer.concat([priorCarry, chunk]);
    const state = scanBinaryBytes(window, priorState);
    const carry = Buffer.from(window.subarray(Math.max(
      0,
      window.length - PRIVATE_BINARY_SCAN_OVERLAP_BYTES,
    )));
    return { carry, state };
  } finally {
    priorCarry.fill(0);
    if (window !== undefined && window !== chunk) window.fill(0);
  }
}

function scanBinaryBuffer(bytes) {
  let carry = Buffer.alloc(0);
  let state = 0;
  try {
    for (let offset = 0; offset < bytes.length; offset += BINARY_SCAN_CHUNK_BYTES) {
      const chunk = bytes.subarray(offset, Math.min(
        bytes.length,
        offset + BINARY_SCAN_CHUNK_BYTES,
      ));
      const scanned = scanBinaryChunk(chunk, carry, state);
      carry = scanned.carry;
      state = scanned.state;
    }
  } finally {
    carry.fill(0);
  }
}

function invalidSanitizedReview() {
  fail('GREATER_REALM_PUBLIC_BOUNDARY_SANITIZED_REVIEW_INVALID');
}

function exactSanitizedRecord(value, expectedKeys) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) invalidSanitizedReview();
  const keys = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (
    keys.length !== expected.length
    || keys.some((key, index) => key !== expected[index])
  ) invalidSanitizedReview();
  return value;
}

function sanitizedInteger(value, maximum, minimum = 0) {
  if (
    !Number.isSafeInteger(value)
    || value < minimum
    || value > maximum
  ) invalidSanitizedReview();
  return value;
}

function sanitizedBasisPoints(numerator, denominator) {
  if (denominator <= 0 || numerator < 0 || numerator > denominator) {
    invalidSanitizedReview();
  }
  return Math.round((numerator * 10_000) / denominator);
}

function assertNoSanitizedPrivateMaterial(value, path = [], depth = 0) {
  if (depth > 32) invalidSanitizedReview();
  if (typeof value === 'string') {
    if (value.includes('\0') || SANITIZED_REVIEW_FORBIDDEN_STRING.test(value)) {
      invalidSanitizedReview();
    }
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    const normalizedKey = key
      .replace(/([a-z0-9])([A-Z])/gu, '$1_$2')
      .replaceAll('-', '_');
    const digestAllowed = path.length === 0 && key === 'reportDigest';
    if (!digestAllowed && SANITIZED_REVIEW_FORBIDDEN_KEY.test(normalizedKey)) {
      invalidSanitizedReview();
    }
    assertNoSanitizedPrivateMaterial(entry, [...path, key], depth + 1);
  }
}

function sanitizedTierCounts(value, activeCellCount) {
  const row = exactSanitizedRecord(value, ['tierI', 'tierII', 'tierIII']);
  const result = {
    tierI: sanitizedInteger(row.tierI, activeCellCount),
    tierII: sanitizedInteger(row.tierII, activeCellCount),
    tierIII: sanitizedInteger(row.tierIII, activeCellCount),
  };
  if (result.tierI + result.tierII + result.tierIII !== activeCellCount) {
    invalidSanitizedReview();
  }
  return result;
}

function sanitizedRegionRange(value, tierCount, regionCount) {
  const row = exactSanitizedRecord(value, ['minimum', 'maximum']);
  const result = {
    minimum: sanitizedInteger(row.minimum, tierCount),
    maximum: sanitizedInteger(row.maximum, tierCount),
  };
  if (
    result.minimum === 0
    || result.minimum > result.maximum
    || result.minimum * regionCount > tierCount
    || result.maximum * regionCount < tierCount
  ) invalidSanitizedReview();
  return result;
}

function sanitizedRegionRanges(value, tierCounts) {
  const row = exactSanitizedRecord(value, ['tierI', 'tierII', 'tierIII']);
  const result = {
    tierI: sanitizedRegionRange(row.tierI, tierCounts.tierI, 6),
    tierII: sanitizedRegionRange(row.tierII, tierCounts.tierII, 3),
    tierIII: sanitizedRegionRange(row.tierIII, tierCounts.tierIII, 1),
  };
  if (
    result.tierIII.minimum !== tierCounts.tierIII
    || result.tierIII.maximum !== tierCounts.tierIII
  ) invalidSanitizedReview();
  return result;
}

function sanitizedHydrology(value) {
  const row = exactSanitizedRecord(value, [
    'majorOceanSeaBodies',
    'majorRivers',
    'minorStreams',
    'lakes',
  ]);
  return {
    majorOceanSeaBodies: sanitizedInteger(row.majorOceanSeaBodies, 10_000),
    majorRivers: sanitizedInteger(row.majorRivers, 10_000),
    minorStreams: sanitizedInteger(row.minorStreams, 100_000),
    lakes: sanitizedInteger(row.lakes, 100_000),
  };
}

function sanitizedGeology(value) {
  const row = exactSanitizedRecord(value, [
    'pseudoTectonicDomains',
    'mountainSystems',
    'watersheds',
  ]);
  return {
    pseudoTectonicDomains: sanitizedInteger(row.pseudoTectonicDomains, 1_000),
    mountainSystems: sanitizedInteger(row.mountainSystems, 10_000),
    watersheds: sanitizedInteger(row.watersheds, 100_000),
  };
}

function sanitizedTopography(value, activeCellCount, landCellCount, waterCellCount) {
  const row = exactSanitizedRecord(value, [
    'signedElevationMinimum',
    'signedElevationMaximum',
    'slopeP50',
    'slopeP95',
    'ridgeCellCount',
    'plateauCellCount',
    'basinCellCount',
    'coastCellCount',
  ]);
  const result = {
    signedElevationMinimum: sanitizedInteger(
      row.signedElevationMinimum,
      1_000_000,
      -1_000_000,
    ),
    signedElevationMaximum: sanitizedInteger(
      row.signedElevationMaximum,
      1_000_000,
      -1_000_000,
    ),
    slopeP50: sanitizedInteger(row.slopeP50, 2_000_000),
    slopeP95: sanitizedInteger(row.slopeP95, 2_000_000),
    ridgeCellCount: sanitizedInteger(row.ridgeCellCount, landCellCount),
    plateauCellCount: sanitizedInteger(row.plateauCellCount, landCellCount),
    basinCellCount: sanitizedInteger(row.basinCellCount, landCellCount),
    coastCellCount: sanitizedInteger(row.coastCellCount, activeCellCount),
  };
  if (
    result.signedElevationMinimum >= result.signedElevationMaximum
    || (waterCellCount > 0 && result.signedElevationMinimum > 0)
    || (landCellCount > 0 && result.signedElevationMaximum <= 0)
    || result.slopeP50 > result.slopeP95
    || result.slopeP95
      > result.signedElevationMaximum - result.signedElevationMinimum
  ) invalidSanitizedReview();
  return result;
}

function sanitizedBiomes(value) {
  const row = exactSanitizedRecord(value, [
    'visualClassCount',
    'minimumPerRegionVisualClassCount',
    'minimumTierIVisualClassCount',
    'minimumTierIIVisualClassCount',
    'tierIIIVisualClassCount',
    'minimumTierIMajorVisualClassCount',
    'minimumTierITransitionVisualClassCount',
    'minimumTierIIMajorVisualClassCount',
    'tierIIIMajorVisualClassCount',
    'maximumTierISingleBiomeShareBasisPoints',
    'incompatibleVisualAdjacencyCount',
    'incompatibleBiomeLandformPairCount',
  ]);
  const result = {
    visualClassCount: sanitizedInteger(row.visualClassCount, 256),
    minimumPerRegionVisualClassCount: sanitizedInteger(
      row.minimumPerRegionVisualClassCount,
      256,
    ),
    minimumTierIVisualClassCount: sanitizedInteger(row.minimumTierIVisualClassCount, 256),
    minimumTierIIVisualClassCount: sanitizedInteger(row.minimumTierIIVisualClassCount, 256),
    tierIIIVisualClassCount: sanitizedInteger(row.tierIIIVisualClassCount, 256),
    minimumTierIMajorVisualClassCount: sanitizedInteger(
      row.minimumTierIMajorVisualClassCount,
      256,
    ),
    minimumTierITransitionVisualClassCount: sanitizedInteger(
      row.minimumTierITransitionVisualClassCount,
      256,
    ),
    minimumTierIIMajorVisualClassCount: sanitizedInteger(
      row.minimumTierIIMajorVisualClassCount,
      256,
    ),
    tierIIIMajorVisualClassCount: sanitizedInteger(row.tierIIIMajorVisualClassCount, 256),
    maximumTierISingleBiomeShareBasisPoints: sanitizedInteger(
      row.maximumTierISingleBiomeShareBasisPoints,
      10_000,
    ),
    incompatibleVisualAdjacencyCount: sanitizedInteger(
      row.incompatibleVisualAdjacencyCount,
      1_000_000,
    ),
    incompatibleBiomeLandformPairCount: sanitizedInteger(
      row.incompatibleBiomeLandformPairCount,
      1_000_000,
    ),
  };
  if (
    result.visualClassCount === 0
    || result.minimumPerRegionVisualClassCount === 0
    || result.minimumTierIVisualClassCount === 0
    || result.minimumTierIIVisualClassCount === 0
    || result.tierIIIVisualClassCount === 0
    || result.minimumTierIMajorVisualClassCount === 0
    || result.minimumTierITransitionVisualClassCount === 0
    || result.minimumTierIIMajorVisualClassCount === 0
    || result.tierIIIMajorVisualClassCount === 0
    || result.minimumTierIVisualClassCount > result.visualClassCount
    || result.minimumTierIIVisualClassCount > result.visualClassCount
    || result.tierIIIVisualClassCount > result.visualClassCount
    || result.minimumTierIMajorVisualClassCount > result.minimumTierIVisualClassCount
    || result.minimumTierITransitionVisualClassCount > result.minimumTierIVisualClassCount
    || result.minimumTierIIMajorVisualClassCount > result.minimumTierIIVisualClassCount
    || result.tierIIIMajorVisualClassCount > result.tierIIIVisualClassCount
    || result.minimumPerRegionVisualClassCount !== Math.min(
      result.minimumTierIVisualClassCount,
      result.minimumTierIIVisualClassCount,
      result.tierIIIVisualClassCount,
    )
    || result.maximumTierISingleBiomeShareBasisPoints === 0
  ) invalidSanitizedReview();
  return result;
}

function sanitizedQuality(value) {
  const row = exactSanitizedRecord(value, [
    'naturalnessBasisPoints',
    'axialArtifactBasisPoints',
    'ridgeContinuityBasisPoints',
    'hydrologyCoherenceBasisPoints',
  ]);
  return Object.fromEntries(Object.entries(row).map(([key, entry]) => [
    key,
    sanitizedInteger(entry, 10_000),
  ]));
}

function sanitizedProofs(value) {
  const row = exactSanitizedRecord(value, SANITIZED_REVIEW_PROOF_KEYS);
  for (const key of SANITIZED_REVIEW_PROOF_KEYS) {
    if (typeof row[key] !== 'boolean') invalidSanitizedReview();
  }
  return row;
}

function sanitizedPerformance(value) {
  const row = exactSanitizedRecord(value, [
    'generationMillisecondsRounded',
    'processPeakMemoryMiBRounded',
  ]);
  return {
    generationMillisecondsRounded: sanitizedInteger(
      row.generationMillisecondsRounded,
      7 * 24 * 60 * 60 * 1_000,
    ),
    processPeakMemoryMiBRounded: sanitizedInteger(row.processPeakMemoryMiBRounded, 1_048_576),
  };
}

function validateSanitizedCandidate(value) {
  const row = exactSanitizedRecord(value, SANITIZED_REVIEW_CANDIDATE_KEYS);
  if (
    typeof row.candidateHandle !== 'string'
    || !SANITIZED_REVIEW_CANDIDATE_HANDLE.test(row.candidateHandle)
    || typeof row.eligible !== 'boolean'
  ) invalidSanitizedReview();
  const activeCellCount = sanitizedInteger(row.activeCellCount, 1_000_000, 1);
  const landCellCount = sanitizedInteger(row.landCellCount, activeCellCount);
  const waterCellCount = sanitizedInteger(row.waterCellCount, activeCellCount);
  if (landCellCount + waterCellCount !== activeCellCount) invalidSanitizedReview();
  const tierCellCounts = sanitizedTierCounts(row.tierCellCounts, activeCellCount);
  const tierBasisPoints = {
    tierI: sanitizedBasisPoints(tierCellCounts.tierI, activeCellCount),
    tierII: sanitizedBasisPoints(tierCellCounts.tierII, activeCellCount),
  };
  tierBasisPoints.tierIII = 10_000 - tierBasisPoints.tierI - tierBasisPoints.tierII;
  const providedTierBasisPoints = exactSanitizedRecord(
    row.tierBasisPoints,
    ['tierI', 'tierII', 'tierIII'],
  );
  if (
    providedTierBasisPoints.tierI !== tierBasisPoints.tierI
    || providedTierBasisPoints.tierII !== tierBasisPoints.tierII
    || providedTierBasisPoints.tierIII !== tierBasisPoints.tierIII
  ) invalidSanitizedReview();
  const regionSizeRanges = sanitizedRegionRanges(row.regionSizeRanges, tierCellCounts);
  const hydrology = sanitizedHydrology(row.hydrology);
  const geology = sanitizedGeology(row.geology);
  const topography = sanitizedTopography(
    row.topography,
    activeCellCount,
    landCellCount,
    waterCellCount,
  );
  const biomes = sanitizedBiomes(row.biomes);
  sanitizedQuality(row.quality);
  const proofs = sanitizedProofs(row.proofs);
  sanitizedPerformance(row.performance);
  const gateCount = sanitizedInteger(row.gateCount, 10_000);
  const castleSlotCount = sanitizedInteger(row.castleSlotCount, 100_000);
  const insideApprovedRange = activeCellCount >= 100_000 && activeCellCount <= 150_000;
  const landBasisPoints = sanitizedBasisPoints(landCellCount, activeCellCount);
  if (
    row.insideApprovedRange !== insideApprovedRange
    || row.landBasisPoints !== landBasisPoints
    || row.waterBasisPoints !== 10_000 - landBasisPoints
  ) invalidSanitizedReview();
  if (row.eligible && (
    !insideApprovedRange
    || landBasisPoints < 6_200
    || landBasisPoints > 7_200
    || tierBasisPoints.tierI < 6_800
    || tierBasisPoints.tierI > 7_400
    || tierBasisPoints.tierII < 2_200
    || tierBasisPoints.tierII > 2_700
    || tierBasisPoints.tierIII < 300
    || tierBasisPoints.tierIII > 600
    || regionSizeRanges.tierIII.maximum >= regionSizeRanges.tierI.minimum
    || regionSizeRanges.tierIII.maximum >= regionSizeRanges.tierII.minimum
    || gateCount !== 18
    || castleSlotCount !== 600
    || Object.values(proofs).some(result => result !== true)
    || geology.pseudoTectonicDomains < 7
    || geology.pseudoTectonicDomains > 12
    || hydrology.majorOceanSeaBodies < 4
    || hydrology.majorOceanSeaBodies > 6
    || hydrology.majorRivers < 48
    || hydrology.majorRivers > 72
    || hydrology.minorStreams < 120
    || hydrology.minorStreams > 240
    || hydrology.lakes < 48
    || hydrology.lakes > 96
    || topography.signedElevationMinimum >= 0
    || topography.signedElevationMaximum <= 0
    || topography.slopeP50 === 0
    || topography.slopeP95 <= topography.slopeP50
    || topography.ridgeCellCount === 0
    || topography.plateauCellCount === 0
    || topography.basinCellCount === 0
    || topography.coastCellCount === 0
    || biomes.visualClassCount < 8
    || biomes.minimumPerRegionVisualClassCount < 3
    || biomes.minimumTierIVisualClassCount < 6
    || biomes.minimumTierIIVisualClassCount < 5
    || biomes.tierIIIVisualClassCount < 3
    || biomes.minimumTierIMajorVisualClassCount < 4
    || biomes.minimumTierITransitionVisualClassCount < 2
    || biomes.minimumTierIIMajorVisualClassCount < 5
    || biomes.tierIIIMajorVisualClassCount < 3
    || biomes.maximumTierISingleBiomeShareBasisPoints > 5_500
    || biomes.incompatibleVisualAdjacencyCount !== 0
    || biomes.incompatibleBiomeLandformPairCount !== 0
  )) invalidSanitizedReview();
  return Object.freeze({ candidateHandle: row.candidateHandle, eligible: row.eligible });
}

function canonicalSanitizedValue(value, depth = 0) {
  if (depth > 32) invalidSanitizedReview();
  if (Array.isArray(value)) {
    return value.map(entry => canonicalSanitizedValue(entry, depth + 1));
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => [key, canonicalSanitizedValue(entry, depth + 1)]));
  }
  if (typeof value === 'number' && !Number.isSafeInteger(value)) invalidSanitizedReview();
  return value;
}

function validateSanitizedReviewEvidence(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return invalidSanitizedReview();
  }
  assertNoSanitizedPrivateMaterial(value);
  const row = exactSanitizedRecord(value, [
    'schema',
    'generatorVersion',
    'sourceCommit',
    'reviewBatchHandle',
    'selectionStatus',
    'selectedCandidateHandle',
    'candidateCount',
    'candidates',
    'privacyBoundary',
    'reportDigest',
  ]);
  if (
    row.schema !== SANITIZED_REVIEW_SCHEMA
    || row.privacyBoundary !== SANITIZED_REVIEW_PRIVACY_BOUNDARY
    || typeof row.generatorVersion !== 'string'
    || !SANITIZED_REVIEW_GENERATOR_VERSION.test(row.generatorVersion)
    || typeof row.sourceCommit !== 'string'
    || !SANITIZED_REVIEW_SOURCE_COMMIT.test(row.sourceCommit)
    || typeof row.reviewBatchHandle !== 'string'
    || !SANITIZED_REVIEW_BATCH_HANDLE.test(row.reviewBatchHandle)
    || (row.selectionStatus !== 'pending' && row.selectionStatus !== 'selected')
    || (row.selectedCandidateHandle !== null && (
      typeof row.selectedCandidateHandle !== 'string'
      || !SANITIZED_REVIEW_CANDIDATE_HANDLE.test(row.selectedCandidateHandle)
    ))
    || typeof row.reportDigest !== 'string'
    || !SANITIZED_REVIEW_SHA256.test(row.reportDigest)
    || !Array.isArray(row.candidates)
    || row.candidates.length < SANITIZED_REVIEW_MINIMUM_CANDIDATE_COUNT
    || row.candidates.length > SANITIZED_REVIEW_MAXIMUM_CANDIDATE_COUNT
    || row.candidateCount !== row.candidates.length
  ) invalidSanitizedReview();
  const candidates = row.candidates.map(validateSanitizedCandidate);
  const handles = candidates.map(candidate => candidate.candidateHandle);
  if (
    new Set(handles).size !== handles.length
    || handles.some((handle, index) => index > 0 && handles[index - 1] >= handle)
    || candidates.filter(candidate => candidate.eligible).length
      < SANITIZED_REVIEW_MINIMUM_CANDIDATE_COUNT
    || (row.selectionStatus === 'pending' && row.selectedCandidateHandle !== null)
    || (row.selectionStatus === 'selected' && (
      row.selectedCandidateHandle === null
      || !candidates.some(candidate => (
        candidate.candidateHandle === row.selectedCandidateHandle && candidate.eligible
      ))
    ))
  ) invalidSanitizedReview();
  const { reportDigest, ...body } = row;
  const digest = createHash('sha256')
    .update(JSON.stringify(canonicalSanitizedValue(body)), 'utf8')
    .digest('hex');
  if (digest !== reportDigest) invalidSanitizedReview();
  const canonicalText = `${JSON.stringify(canonicalSanitizedValue(row), null, 2)}\n`;
  if (text !== canonicalText) invalidSanitizedReview();
}

function validateSanitizedReviewEvidenceReadme(bytes) {
  if (
    bytes.length !== SANITIZED_REVIEW_EVIDENCE_README_BYTES
    || createHash('sha256').update(bytes).digest('hex')
      !== SANITIZED_REVIEW_EVIDENCE_README_SHA256
  ) invalidSanitizedReview();
}

function assertSanitizedReviewEvidencePath(relativePath) {
  if (!relativePath.startsWith(SANITIZED_REVIEW_EVIDENCE_PREFIX)) return;
  if (
    relativePath !== SANITIZED_REVIEW_EVIDENCE_README
    && !SANITIZED_REVIEW_EVIDENCE_PATH.test(relativePath)
  ) invalidSanitizedReview();
}

function decodeUtf8Text(bytes, allowNul = false) {
  if (!allowNul && bytes.indexOf(0) !== -1) return undefined;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
}

function likelyUtf16ByteOrder(bytes) {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le';
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be';
  if (bytes.length < 8 || bytes.length % 2 !== 0) return undefined;
  const sampleBytes = Math.min(bytes.length, 4_096) & ~1;
  let evenZeros = 0;
  let oddZeros = 0;
  for (let offset = 0; offset < sampleBytes; offset += 2) {
    if (bytes[offset] === 0) evenZeros += 1;
    if (bytes[offset + 1] === 0) oddZeros += 1;
  }
  const codeUnits = sampleBytes / 2;
  if (oddZeros * 4 >= codeUnits * 3 && evenZeros * 20 <= codeUnits) {
    return 'utf-16le';
  }
  if (evenZeros * 4 >= codeUnits * 3 && oddZeros * 20 <= codeUnits) {
    return 'utf-16be';
  }
  return undefined;
}

function likelyUtf32ByteOrder(bytes) {
  if (
    bytes.length >= 4
    && bytes[0] === 0xff && bytes[1] === 0xfe
    && bytes[2] === 0 && bytes[3] === 0
  ) return 'utf-32le';
  if (
    bytes.length >= 4
    && bytes[0] === 0 && bytes[1] === 0
    && bytes[2] === 0xfe && bytes[3] === 0xff
  ) return 'utf-32be';
  if (bytes.length < 16 || bytes.length % 4 !== 0) return undefined;
  const sampleBytes = Math.min(bytes.length, 4_096) & ~3;
  const laneZeros = [0, 0, 0, 0];
  for (let offset = 0; offset < sampleBytes; offset += 4) {
    for (let lane = 0; lane < 4; lane += 1) {
      if (bytes[offset + lane] === 0) laneZeros[lane] += 1;
    }
  }
  const codeUnits = sampleBytes / 4;
  const mostlyZero = lane => laneZeros[lane] * 4 >= codeUnits * 3;
  const mostlyNonzero = lane => laneZeros[lane] * 20 <= codeUnits;
  if (mostlyNonzero(0) && mostlyZero(1) && mostlyZero(2) && mostlyZero(3)) {
    return 'utf-32le';
  }
  if (mostlyZero(0) && mostlyZero(1) && mostlyZero(2) && mostlyNonzero(3)) {
    return 'utf-32be';
  }
  return undefined;
}

function decodeUtf16Text(bytes) {
  const encoding = likelyUtf16ByteOrder(bytes);
  if (encoding === undefined) return undefined;
  try {
    const text = new TextDecoder(encoding, { fatal: true }).decode(bytes);
    return text.includes('\0') ? undefined : text;
  } catch {
    return undefined;
  }
}

function decodeUtf32Text(bytes) {
  const encoding = likelyUtf32ByteOrder(bytes);
  if (encoding === undefined) return undefined;
  const parts = [];
  let chunk = '';
  try {
    for (let offset = 0; offset < bytes.length; offset += 4) {
      const value = encoding === 'utf-32be'
        ? bytes.readUInt32BE(offset)
        : bytes.readUInt32LE(offset);
      if (offset === 0 && value === 0xfeff) continue;
      if (
        value === 0
        || value > 0x10ffff
        || (value >= 0xd800 && value <= 0xdfff)
      ) return undefined;
      chunk += String.fromCodePoint(value);
      if (chunk.length >= 8_192) {
        parts.push(chunk);
        chunk = '';
      }
    }
    parts.push(chunk);
    return parts.join('');
  } catch {
    return undefined;
  }
}

function scanText(text, relativePath) {
  const scrubbed = normalizePrivacyScanText(
    scrubExpectedPrivateSourceLiterals(text, relativePath),
  );
  if (GREATER_REALM_PRIVATE_MARKER_TEXT.some(marker => scrubbed.includes(marker))) {
    fail('GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_MARKER');
  }
  if (
    PRIVATE_TEXT_FIELD.test(scrubbed)
    || containsPrivateReliefStructureAuthority(scrubbed, relativePath)
    || containsPrivateLivingWorldAuthority(scrubbed, relativePath)
    || containsPrivateIdentifierSecretValue(scrubbed)
    || INLINE_DATA_SOURCE_MAP.test(scrubbed)
    || (
      relativePath.toLowerCase().startsWith('docs/evidence/greater-realm/')
      && PRIVATE_EVIDENCE_FIELD.test(scrubbed)
    )
  ) fail('GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_FIELD');
}

function scanLoadedBytes(bytes, relativePath, knownText) {
  if (relativePath === SANITIZED_REVIEW_EVIDENCE_README) {
    validateSanitizedReviewEvidenceReadme(bytes);
  }
  const encodedUnicodeText = knownText
    ? undefined
    : decodeUtf16Text(bytes) ?? decodeUtf32Text(bytes);
  if (!knownText) scanBinaryBuffer(bytes);
  const text = decodeUtf8Text(bytes);
  if (knownText && text === undefined) {
    fail('GREATER_REALM_PUBLIC_BOUNDARY_TEXT_ENCODING_INVALID');
  }
  if (text !== undefined) {
    scanText(text, relativePath);
    if (SANITIZED_REVIEW_EVIDENCE_PATH.test(relativePath)) {
      if (bytes.length > SANITIZED_REVIEW_MAXIMUM_BYTES) invalidSanitizedReview();
      validateSanitizedReviewEvidence(text);
    }
  } else if (encodedUnicodeText !== undefined) {
    scanText(encodedUnicodeText, relativePath);
  }
}

function scanGitBlob(bytes, relativePath) {
  assertSanitizedReviewEvidencePath(relativePath);
  if (opaqueArchivePath(relativePath)) {
    fail('GREATER_REALM_PUBLIC_BOUNDARY_OPAQUE_ARCHIVE');
  }
  const knownText = knownTextPath(relativePath);
  if (knownText && bytes.length > MAXIMUM_SCANNED_TEXT_BYTES) {
    fail('GREATER_REALM_PUBLIC_BOUNDARY_TEXT_LIMIT');
  }
  if (!knownText && bytes.length > MAXIMUM_SCANNED_BINARY_BYTES) {
    fail('GREATER_REALM_PUBLIC_BOUNDARY_BINARY_LIMIT');
  }
  if (knownText || bytes.length <= MAXIMUM_SCANNED_TEXT_BYTES) {
    scanLoadedBytes(bytes, relativePath, knownText);
  } else {
    scanBinaryBuffer(bytes);
  }
}

function scanFile(path, relativePath) {
  assertSanitizedReviewEvidencePath(relativePath);
  if (opaqueArchivePath(relativePath)) {
    fail('GREATER_REALM_PUBLIC_BOUNDARY_OPAQUE_ARCHIVE');
  }
  const status = lstatSync(path);
  if (!status.isFile() || status.isSymbolicLink()) {
    fail('GREATER_REALM_PUBLIC_BOUNDARY_SPECIAL_ENTRY');
  }
  const knownText = knownTextPath(path);
  if (!Number.isSafeInteger(status.size) || status.size < 0) {
    fail('GREATER_REALM_PUBLIC_BOUNDARY_FILE_LIMIT');
  }
  if (knownText && status.size > MAXIMUM_SCANNED_TEXT_BYTES) {
    fail('GREATER_REALM_PUBLIC_BOUNDARY_TEXT_LIMIT');
  }
  if (!knownText && status.size > MAXIMUM_SCANNED_BINARY_BYTES) {
    fail('GREATER_REALM_PUBLIC_BOUNDARY_BINARY_LIMIT');
  }
  const descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = fstatSync(descriptor);
    if (
      !opened.isFile()
      || opened.dev !== status.dev
      || opened.ino !== status.ino
      || opened.size !== status.size
    ) fail('GREATER_REALM_PUBLIC_BOUNDARY_FILE_CHANGED');
    if (knownText || opened.size <= MAXIMUM_SCANNED_TEXT_BYTES) {
      const bytes = Buffer.alloc(opened.size);
      try {
        let offset = 0;
        while (offset < bytes.byteLength) {
          const count = readSync(descriptor, bytes, offset, bytes.byteLength - offset, null);
          if (count <= 0) fail('GREATER_REALM_PUBLIC_BOUNDARY_READ_FAILED');
          offset += count;
        }
        scanLoadedBytes(bytes, relativePath, knownText);
      } finally {
        bytes.fill(0);
      }
    } else {
      let carry = Buffer.alloc(0);
      let binaryScanState = 0;
      try {
        let remaining = opened.size;
        while (remaining > 0) {
          const chunk = Buffer.alloc(Math.min(BINARY_SCAN_CHUNK_BYTES, remaining));
          try {
            let offset = 0;
            while (offset < chunk.length) {
              const count = readSync(descriptor, chunk, offset, chunk.length - offset, null);
              if (count <= 0) fail('GREATER_REALM_PUBLIC_BOUNDARY_READ_FAILED');
              offset += count;
            }
            remaining -= chunk.length;
            const scanned = scanBinaryChunk(chunk, carry, binaryScanState);
            carry = scanned.carry;
            binaryScanState = scanned.state;
          } finally {
            chunk.fill(0);
          }
        }
      } finally {
        carry.fill(0);
      }
    }
    const after = fstatSync(descriptor);
    const current = lstatSync(path);
    if (
      after.dev !== opened.dev
      || after.ino !== opened.ino
      || after.size !== opened.size
      || after.mtimeMs !== opened.mtimeMs
      || after.ctimeMs !== opened.ctimeMs
      || current.isSymbolicLink()
      || !current.isFile()
      || current.dev !== opened.dev
      || current.ino !== opened.ino
    ) fail('GREATER_REALM_PUBLIC_BOUNDARY_FILE_CHANGED');
  } finally {
    closeSync(descriptor);
  }
}

function trackedObjectPaths(entries) {
  const pathsByObjectId = new Map();
  for (const entry of entries) {
    const paths = pathsByObjectId.get(entry.objectId);
    if (paths === undefined) pathsByObjectId.set(entry.objectId, [entry.path]);
    else paths.push(entry.path);
  }
  return pathsByObjectId;
}

function checkedTrackedObjects(trackedIndex, repositoryRoot, pathsByObjectId) {
  const objectIds = [...pathsByObjectId.keys()];
  if (objectIds.length === 0) return [];
  const input = Buffer.from(`${objectIds.join('\n')}\n`, 'ascii');
  let output;
  try {
    output = invokeTrustedGit(
      trackedIndex.attestation,
      repositoryRoot,
      ['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'],
      MAXIMUM_GIT_OUTPUT_BYTES,
      input,
    );
    const text = decodeUtf8Text(output);
    if (text === undefined) fail('GREATER_REALM_PUBLIC_BOUNDARY_GIT_FAILED');
    const lines = text.split('\n');
    if (lines.at(-1) === '') lines.pop();
    if (lines.length !== objectIds.length) fail('GREATER_REALM_PUBLIC_BOUNDARY_GIT_FAILED');
    return lines.map((line, index) => {
      const match = /^([0-9a-f]+) blob (0|[1-9][0-9]*)$/u.exec(line);
      const expectedObjectId = objectIds[index];
      if (
        match === null
        || match[1] !== expectedObjectId
        || match[1].length !== trackedIndex.objectIdLength
      ) fail('GREATER_REALM_PUBLIC_BOUNDARY_GIT_FAILED');
      const size = Number(match[2]);
      if (!Number.isSafeInteger(size) || size < 0) {
        fail('GREATER_REALM_PUBLIC_BOUNDARY_FILE_LIMIT');
      }
      for (const relativePath of pathsByObjectId.get(expectedObjectId) ?? []) {
        if (knownTextPath(relativePath) && size > MAXIMUM_SCANNED_TEXT_BYTES) {
          fail('GREATER_REALM_PUBLIC_BOUNDARY_TEXT_LIMIT');
        }
        if (!knownTextPath(relativePath) && size > MAXIMUM_SCANNED_BINARY_BYTES) {
          fail('GREATER_REALM_PUBLIC_BOUNDARY_BINARY_LIMIT');
        }
      }
      return Object.freeze({ objectId: expectedObjectId, size });
    });
  } finally {
    input.fill(0);
    output?.fill(0);
  }
}

function scanTrackedObjectBatch(
  trackedIndex,
  repositoryRoot,
  pathsByObjectId,
  objects,
) {
  const input = Buffer.from(`${objects.map(object => object.objectId).join('\n')}\n`, 'ascii');
  const expectedBytes = objects.reduce((total, object) => total + object.size, 0);
  const maximumOutputBytes = expectedBytes
    + objects.length * (trackedIndex.objectIdLength + 64)
    + 1_024;
  let output;
  try {
    output = invokeTrustedGit(
      trackedIndex.attestation,
      repositoryRoot,
      ['cat-file', '--batch'],
      maximumOutputBytes,
      input,
    );
    let offset = 0;
    for (const object of objects) {
      const newline = output.indexOf(0x0a, offset);
      if (newline < 0) fail('GREATER_REALM_PUBLIC_BOUNDARY_GIT_FAILED');
      const header = decodeUtf8Text(output.subarray(offset, newline));
      const match = header === undefined
        ? null
        : /^([0-9a-f]+) blob (0|[1-9][0-9]*)$/u.exec(header);
      if (
        match === null
        || match[1] !== object.objectId
        || Number(match[2]) !== object.size
      ) fail('GREATER_REALM_PUBLIC_BOUNDARY_GIT_FAILED');
      const bodyStart = newline + 1;
      const bodyEnd = bodyStart + object.size;
      if (bodyEnd >= output.length || output[bodyEnd] !== 0x0a) {
        fail('GREATER_REALM_PUBLIC_BOUNDARY_GIT_FAILED');
      }
      const bytes = output.subarray(bodyStart, bodyEnd);
      for (const relativePath of pathsByObjectId.get(object.objectId) ?? []) {
        scanGitBlob(bytes, relativePath);
      }
      offset = bodyEnd + 1;
    }
    if (offset !== output.length) fail('GREATER_REALM_PUBLIC_BOUNDARY_GIT_FAILED');
  } finally {
    input.fill(0);
    output?.fill(0);
  }
}

function scanTrackedIndexBlobs(trackedIndex, repositoryRoot) {
  const pathsByObjectId = trackedObjectPaths(trackedIndex.entries);
  const objects = checkedTrackedObjects(trackedIndex, repositoryRoot, pathsByObjectId);
  let batch = [];
  let batchBytes = 0;
  const flush = () => {
    if (batch.length === 0) return;
    scanTrackedObjectBatch(
      trackedIndex,
      repositoryRoot,
      pathsByObjectId,
      batch,
    );
    batch = [];
    batchBytes = 0;
  };
  for (const object of objects) {
    if (
      batch.length > 0
      && batchBytes + object.size > MAXIMUM_GIT_BLOB_BATCH_BYTES
    ) flush();
    batch.push(object);
    batchBytes += object.size;
  }
  flush();
}

function scanTree(root, repositoryRoot) {
  const rootStatus = lstatSync(root);
  if (!rootStatus.isDirectory() || rootStatus.isSymbolicLink()) {
    fail('GREATER_REALM_PUBLIC_BOUNDARY_SPECIAL_ENTRY');
  }
  let entries = 0;
  const visit = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      entries += 1;
      if (entries > MAXIMUM_TREE_ENTRIES) fail('GREATER_REALM_PUBLIC_BOUNDARY_TREE_LIMIT');
      const path = join(directory, entry.name);
      const status = lstatSync(path);
      if (status.isSymbolicLink()) fail('GREATER_REALM_PUBLIC_BOUNDARY_SPECIAL_ENTRY');
      const relativePath = relative(repositoryRoot, path).replaceAll('\\', '/');
      if (privateArtifactPath(relativePath) || ownerPreviewEvidencePath(relativePath)) {
        fail('GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_PATH');
      }
      if (status.isDirectory()) visit(path);
      else if (status.isFile()) scanFile(path, relativePath);
      else fail('GREATER_REALM_PUBLIC_BOUNDARY_SPECIAL_ENTRY');
    }
  };
  visit(root);
  return entries;
}

export function verifyGreaterRealmPublicBoundary(input = {}) {
  const repositoryRoot = resolve(input.repositoryRoot ?? resolve(import.meta.dirname, '..', '..'));
  const rootStatus = statSync(repositoryRoot, { throwIfNoEntry: false });
  if (!rootStatus?.isDirectory()) fail('GREATER_REALM_PUBLIC_BOUNDARY_ROOT_INVALID');
  const trackedIndex = input.trackedPaths === undefined || input.trackedPaths === null
    ? enumerateTrackedIndex(repositoryRoot)
    : undefined;
  const trackedPaths = input.trackedPaths
    ?? trackedIndex.entries.map(entry => entry.path);
  if (!Array.isArray(trackedPaths) || trackedPaths.length > MAXIMUM_TREE_ENTRIES) {
    fail('GREATER_REALM_PUBLIC_BOUNDARY_TRACKED_PATHS_INVALID');
  }
  const trackedFiles = [];
  for (const path of trackedPaths) {
    if (privateArtifactPath(path) || ownerPreviewEvidencePath(path)) {
      fail('GREATER_REALM_PUBLIC_BOUNDARY_PRIVATE_PATH');
    }
    const trackedFile = resolve(repositoryRoot, path);
    const status = lstatSync(trackedFile, { throwIfNoEntry: false });
    if (!status?.isFile() || status.isSymbolicLink()) {
      fail('GREATER_REALM_PUBLIC_BOUNDARY_SPECIAL_ENTRY');
    }
    trackedFiles.push(Object.freeze({ path, trackedFile }));
  }
  // The index is a separate public surface from the working tree. Scan its
  // exact blob bytes first, then independently scan every tracked worktree file.
  if (trackedIndex !== undefined) scanTrackedIndexBlobs(trackedIndex, repositoryRoot);
  for (const { path, trackedFile } of trackedFiles) {
    scanFile(trackedFile, path);
  }
  const scanRoots = input.scanRoots ?? ['public', 'src', 'dist', 'docs'];
  if (!Array.isArray(scanRoots) || scanRoots.length > 16) {
    fail('GREATER_REALM_PUBLIC_BOUNDARY_SCAN_ROOTS_INVALID');
  }
  let scannedEntries = 0;
  for (const relativeRoot of scanRoots) {
    const normalized = normalizedRelativePath(relativeRoot);
    if (normalized.includes('/')) fail('GREATER_REALM_PUBLIC_BOUNDARY_SCAN_ROOTS_INVALID');
    const root = resolve(repositoryRoot, normalized);
    const status = statSync(root, { throwIfNoEntry: false });
    if (status === undefined) continue;
    scannedEntries += scanTree(root, repositoryRoot);
  }
  return Object.freeze({
    trackedPathCount: trackedPaths.length,
    scannedEntryCount: scannedEntries,
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = verifyGreaterRealmPublicBoundary();
  console.log(
    `Greater Realm public boundary passed (${result.trackedPathCount} tracked paths; ${result.scannedEntryCount} scanned entries).`,
  );
}
