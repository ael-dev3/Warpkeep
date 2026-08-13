import {
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from 'node:fs';
import {
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  isCallExpression,
  isExportDeclaration,
  isIdentifier,
  isImportDeclaration,
  isStringLiteral,
  SyntaxKind,
} from '../services/auth-bridge/node_modules/typescript/dist/ast/index.js';
import {
  createVirtualFileSystem,
} from '../services/auth-bridge/node_modules/typescript/dist/api/fs.js';
import {
  API as TypeScriptAPI,
} from '../services/auth-bridge/node_modules/typescript/dist/api/sync/api.js';
import {
  AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MEMBER_PATHS,
  AuthBridgeNotificationPreparedDeployClosureError,
  verifyAuthBridgeNotificationPreparedDeployClosure,
} from './auth-bridge-notification-prepared-deploy-closure.mjs';

const MEMBER_PATH = /^(?:package(?:-lock)?\.json|(?:\.github\/workflows|scripts|services\/auth-bridge|spacetimedb\/src|src)\/[A-Za-z0-9._/-]+)$/u;
const MAX_MEMBER_BYTES = 4 * 1_024 * 1_024;
const MAX_MEMBERS = 384;
const SCRIPT_GRAPH_ROOTS = Object.freeze([
  'scripts/auth-bridge-notification-prepared-deploy.mjs',
  'scripts/hermes-admin.ts',
  'scripts/notification-pages-build-release-validator.mjs',
  'scripts/notification-pages-deploy-lane.mjs',
  'scripts/notification-pages-private-deploy-launcher.mjs',
]);
const DECLARATION_OPTIONAL_GRAPH_MEMBERS = new Set([
  'scripts/farcaster-miniapp-contract.mjs',
  'scripts/validate-pages-deploy-config.mjs',
  'scripts/verify-alpha-production.mjs',
]);
const WORKER_GRAPH_ROOT = 'services/auth-bridge/src/index.ts';
const WORKER_SOURCE_DIRECTORY = 'services/auth-bridge/src';
const CHECK_SOURCE_DIRECTORIES = Object.freeze([
  'services/auth-bridge/test',
  'services/auth-bridge/test-workerd',
]);
const STATIC_SECURITY_INPUTS = Object.freeze([
  '.github/workflows/deploy-pages.yml',
  '.github/workflows/notification-bridge-prepared.yml',
  '.github/workflows/verify.yml',
  'package-lock.json',
  'package.json',
  'scripts/admission-notifications/recovery-plan.ts',
  'scripts/auth-bridge-notification-prepared-deploy-closure-policy.d.mts',
  'scripts/auth-bridge-notification-prepared-deploy-closure-policy.mjs',
  'scripts/auth-bridge-notification-prepared-deploy-closure.d.mts',
  'scripts/auth-bridge-notification-prepared-deploy-closure.mjs',
  'scripts/auth-bridge-notification-prepared-installed-toolchain-darwin-arm64-v1.json',
  'scripts/auth-bridge-notification-prepared-release-binding.d.mts',
  'scripts/auth-bridge-notification-prepared-release-binding.mjs',
  'scripts/greater-realm-production-bootstrap.mjs',
  'scripts/hermes-admin.ts',
  'scripts/notification-pages-live-hermes-authority.d.mts',
  'scripts/notification-pages-live-hermes-authority.mjs',
  'scripts/notification-pages-live-release-binding.d.mts',
  'scripts/notification-pages-live-release-binding.mjs',
  'scripts/notification-pages-private-release-binding.d.mts',
  'scripts/notification-pages-private-release-binding.mjs',
  'scripts/profiles/founder-admission-plan.ts',
  'scripts/verify-auth-bridge-notification-prepared-policy.d.mts',
  'scripts/verify-auth-bridge-notification-prepared-policy.mjs',
  'services/auth-bridge/package.json',
  'services/auth-bridge/pnpm-lock.yaml',
  'services/auth-bridge/pnpm-workspace.yaml',
  'services/auth-bridge/tsconfig.json',
  'services/auth-bridge/vitest.config.ts',
  'services/auth-bridge/vitest.workerd.config.ts',
  'services/auth-bridge/wrangler.toml',
]);
const ATTESTED_INSTALLED_IMPORTS = new Map([
  ['scripts/auth-bridge-notification-prepared-deploy-closure-policy.mjs', new Set([
    '../services/auth-bridge/node_modules/typescript/dist/ast/index.js',
    '../services/auth-bridge/node_modules/typescript/dist/api/fs.js',
    '../services/auth-bridge/node_modules/typescript/dist/api/sync/api.js',
  ])],
  ['scripts/notification-pages-live-receipt.mjs', new Set([
    '../services/auth-bridge/node_modules/yaml/dist/index.js',
    '../services/auth-bridge/node_modules/typescript/dist/ast/index.js',
    '../services/auth-bridge/node_modules/typescript/dist/api/fs.js',
    '../services/auth-bridge/node_modules/typescript/dist/api/sync/api.js',
  ])],
  ['scripts/notification-pages-release-source-parser.mjs', new Set([
    '../services/auth-bridge/node_modules/yaml/dist/index.js',
    '../services/auth-bridge/node_modules/typescript/dist/ast/index.js',
    '../services/auth-bridge/node_modules/typescript/dist/api/fs.js',
    '../services/auth-bridge/node_modules/typescript/dist/api/sync/api.js',
  ])],
]);

function fail(code) {
  throw new AuthBridgeNotificationPreparedDeployClosureError(code);
}

function canonicalRepository(repositoryRoot) {
  if (typeof repositoryRoot !== 'string' || !isAbsolute(repositoryRoot)) {
    fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_REPOSITORY_INVALID');
  }
  let repository;
  let status;
  try {
    repository = realpathSync(resolve(repositoryRoot));
    status = lstatSync(resolve(repositoryRoot));
  } catch {
    fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_REPOSITORY_INVALID');
  }
  if (
    repository !== resolve(repositoryRoot)
    || status.isSymbolicLink()
    || !status.isDirectory()
  ) fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_REPOSITORY_INVALID');
  return repository;
}

function canonicalMemberPath(repository, memberPath, code) {
  if (
    typeof memberPath !== 'string'
    || !MEMBER_PATH.test(memberPath)
    || memberPath.includes('//')
    || memberPath.split('/').some(part => part === '.' || part === '..')
  ) fail(code);
  const requested = resolve(repository, memberPath);
  let canonical;
  let status;
  try {
    canonical = realpathSync(requested);
    status = lstatSync(requested);
  } catch {
    fail(code);
  }
  const difference = relative(repository, canonical);
  if (
    canonical !== requested
    || difference === ''
    || difference === '..'
    || difference.startsWith(`..${sep}`)
    || isAbsolute(difference)
    || status.isSymbolicLink()
    || !status.isFile()
    || status.size < 1
    || status.size > MAX_MEMBER_BYTES
  ) fail(code);
  return canonical;
}

function source(repository, memberPath, code) {
  const body = readFileSync(canonicalMemberPath(repository, memberPath, code));
  try {
    const value = new TextDecoder('utf-8', { fatal: true }).decode(body);
    if (Buffer.byteLength(value, 'utf8') !== body.byteLength) fail(code);
    return value;
  } catch (error) {
    if (error instanceof AuthBridgeNotificationPreparedDeployClosureError) {
      throw error;
    }
    fail(code);
  } finally {
    body.fill(0);
  }
}

function parseSourceFile(value, memberPath) {
  const code = 'AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_SOURCE_INVALID';
  const fileName = `/auth-bridge-prepared-closure/${memberPath}`;
  let api;
  let snapshot;
  try {
    api = new TypeScriptAPI({
      cwd: dirname(fileName),
      fs: createVirtualFileSystem({ [fileName]: value }),
    });
    snapshot = api.updateSnapshot({ openFiles: [fileName] });
    const project = snapshot.getDefaultProjectForFile(fileName);
    const sourceFile = project?.program.getSourceFile(fileName);
    if (
      project === undefined
      || sourceFile === undefined
      || project.program.getSyntacticDiagnostics(fileName).length !== 0
    ) fail(code);
    return Object.freeze({ api, snapshot, sourceFile });
  } catch (error) {
    try { snapshot?.dispose(); } catch { /* Preserve the primary failure. */ }
    try { api?.close(); } catch { /* Preserve the primary failure. */ }
    if (error instanceof AuthBridgeNotificationPreparedDeployClosureError) {
      throw error;
    }
    fail(code);
  }
}

function sourceModuleSpecifiers(value, memberPath) {
  const parsed = parseSourceFile(value, memberPath);
  const specifiers = [];
  try {
    const visit = node => {
      if (isImportDeclaration(node) || isExportDeclaration(node)) {
        if (node.moduleSpecifier !== undefined) {
          if (!isStringLiteral(node.moduleSpecifier)) {
            fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_IMPORT_INVALID');
          }
          specifiers.push(node.moduleSpecifier.text);
        }
      } else if (
        isCallExpression(node)
        && node.expression.kind === SyntaxKind.ImportKeyword
      ) {
        if (node.arguments.length !== 1 || !isStringLiteral(node.arguments[0])) {
          fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_IMPORT_INVALID');
        }
        specifiers.push(node.arguments[0].text);
      } else if (
        isCallExpression(node)
        && isIdentifier(node.expression)
        && node.expression.text === 'require'
      ) fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_REQUIRE_FORBIDDEN');
      node.forEachChild(visit);
    };
    parsed.sourceFile.forEachChild(visit);
    return Object.freeze(specifiers);
  } finally {
    parsed.snapshot.dispose();
    parsed.api.close();
  }
}

function resolveLocalSpecifier(repository, importer, specifier) {
  if (!specifier.startsWith('.')) return undefined;
  if (specifier.includes('\\') || specifier.includes('\0')) {
    fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_IMPORT_INVALID');
  }
  const base = resolve(repository, dirname(importer), specifier);
  const candidates = /\.(?:mjs|mts|ts|tsx)$/u.test(specifier)
    ? [base]
    : [
      `${base}.mjs`,
      `${base}.mts`,
      `${base}.ts`,
      `${base}.tsx`,
      resolve(base, 'index.ts'),
    ];
  const matches = [];
  for (const candidate of candidates) {
    try {
      const status = lstatSync(candidate);
      if (status.isFile() && !status.isSymbolicLink()) matches.push(candidate);
    } catch { /* Candidate is absent. */ }
  }
  if (matches.length !== 1) {
    fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_IMPORT_UNRESOLVED');
  }
  const memberPath = relative(repository, matches[0]).split(sep).join('/');
  canonicalMemberPath(
    repository,
    memberPath,
    'AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_IMPORT_INVALID',
  );
  return memberPath;
}

function deriveLocalGraph(repository, roots) {
  const pending = [...roots];
  const graph = new Set();
  while (pending.length > 0) {
    const memberPath = pending.shift();
    if (memberPath === undefined || graph.has(memberPath)) continue;
    graph.add(memberPath);
    const value = source(
      repository,
      memberPath,
      'AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_SOURCE_INVALID',
    );
    for (const specifier of sourceModuleSpecifiers(value, memberPath)) {
      if (specifier.includes('/node_modules/')) {
        if (!ATTESTED_INSTALLED_IMPORTS.get(memberPath)?.has(specifier)) {
          fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_INSTALLED_IMPORT_INVALID');
        }
        continue;
      }
      const dependency = resolveLocalSpecifier(repository, memberPath, specifier);
      if (dependency !== undefined && !graph.has(dependency)) pending.push(dependency);
    }
    if (graph.size > MAX_MEMBERS) {
      fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_TOO_LARGE');
    }
  }
  return graph;
}

function namespaceMembers(repository, directoryPath, namePattern, code) {
  const directory = resolve(repository, directoryPath);
  let entries;
  try { entries = readdirSync(directory, { withFileTypes: true }); } catch {
    fail(code);
  }
  if (entries.length < 1 || entries.length > 64) fail(code);
  return new Set(entries.map(entry => {
    if (!entry.isFile() || !namePattern.test(entry.name)) fail(code);
    const memberPath = `${directoryPath}/${entry.name}`;
    canonicalMemberPath(repository, memberPath, code);
    return memberPath;
  }));
}

export function deriveAuthBridgeNotificationPreparedDeployClosurePaths({
  repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..'),
} = {}) {
  const repository = canonicalRepository(repositoryRoot);
  const scriptGraph = deriveLocalGraph(repository, SCRIPT_GRAPH_ROOTS);
  const workerGraph = deriveLocalGraph(repository, [WORKER_GRAPH_ROOT]);
  const workerMembers = namespaceMembers(
    repository,
    WORKER_SOURCE_DIRECTORY,
    /^[A-Za-z][A-Za-z0-9]*\.ts$/u,
    'AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_WORKER_NAMESPACE_INVALID',
  );
  const checkMembers = new Set();
  for (const directory of CHECK_SOURCE_DIRECTORIES) {
    for (const member of namespaceMembers(
      repository,
      directory,
      /^[A-Za-z][A-Za-z0-9.-]*\.(?:ts|json)$/u,
      'AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_CHECK_NAMESPACE_INVALID',
    )) checkMembers.add(member);
  }
  if (
    JSON.stringify([...workerGraph].sort())
      !== JSON.stringify([...workerMembers].sort())
  ) fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_WORKER_GRAPH_INCOMPLETE');
  const members = new Set([
    ...STATIC_SECURITY_INPUTS,
    ...scriptGraph,
    ...workerMembers,
    ...checkMembers,
  ]);
  for (const memberPath of scriptGraph) {
    if (!memberPath.endsWith('.mjs')) continue;
    const declaration = memberPath.replace(/\.mjs$/u, '.d.mts');
    let declarationPresent = false;
    try {
      const status = lstatSync(resolve(repository, declaration));
      declarationPresent = status.isFile() && !status.isSymbolicLink();
    } catch { /* Absence is handled by the exact allowlist below. */ }
    if (!declarationPresent) {
      if (!DECLARATION_OPTIONAL_GRAPH_MEMBERS.has(memberPath)) {
        fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_ABI_MISSING');
      }
      continue;
    }
    if (DECLARATION_OPTIONAL_GRAPH_MEMBERS.has(memberPath)) {
      fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_ABI_NAMESPACE_CHANGED');
    }
    canonicalMemberPath(
      repository,
      declaration,
      'AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_ABI_MISSING',
    );
    members.add(declaration);
  }
  if ([...DECLARATION_OPTIONAL_GRAPH_MEMBERS].some(
    memberPath => !scriptGraph.has(memberPath),
  )) fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_ABI_NAMESPACE_CHANGED');
  if (members.size > MAX_MEMBERS) {
    fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_TOO_LARGE');
  }
  return Object.freeze([...members].sort());
}

export function verifyAuthBridgeNotificationPreparedDeployClosurePolicy({
  repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..'),
} = {}) {
  const derived = deriveAuthBridgeNotificationPreparedDeployClosurePaths({
    repositoryRoot,
  });
  if (
    JSON.stringify(derived)
      !== JSON.stringify(
        AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MEMBER_PATHS,
      )
  ) fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_MEMBER_SET_INVALID');
  return verifyAuthBridgeNotificationPreparedDeployClosure({ repositoryRoot });
}
