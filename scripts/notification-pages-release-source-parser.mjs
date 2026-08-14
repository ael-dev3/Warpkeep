import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  isScalar,
  parseDocument,
  Scalar,
} from '../services/auth-bridge/node_modules/yaml/dist/index.js';
import {
  isAsExpression,
  isCallExpression,
  isIdentifier,
  isNullLiteral,
  isNumericLiteral,
  isObjectLiteralExpression,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isStringLiteral,
  isVariableStatement,
  NodeFlags,
  SyntaxKind,
} from '../services/auth-bridge/node_modules/typescript/dist/ast/index.js';
import {
  createVirtualFileSystem,
} from '../services/auth-bridge/node_modules/typescript/dist/api/fs.js';
import {
  API as TypeScriptAPI,
} from '../services/auth-bridge/node_modules/typescript/dist/api/sync/api.js';

export const NOTIFICATION_PAGES_RELEASE_SOURCE_PARSER_PROFILE =
  'warpkeep-notification-pages-release-source-parser-v1';

const MAX_SOURCE_BYTES = 512 * 1_024;
const SHA256 = /^[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const FOUNDER_COUNT = /^(?:[1-9]|[1-9][0-9]|[1-5][0-9]{2}|600)$/u;

export class NotificationPagesReleaseSourceParserError extends Error {
  constructor(code) {
    super(code);
    this.name = 'NotificationPagesReleaseSourceParserError';
    this.code = code;
  }
}

function fail(code) {
  throw new NotificationPagesReleaseSourceParserError(code);
}

function exactSource(value, code) {
  if (
    typeof value !== 'string'
    || value.length < 1
    || value.length > MAX_SOURCE_BYTES
  ) fail(code);
  return value;
}

function exactPagesPresentation(source) {
  const code = 'NOTIFICATION_PAGES_RELEASE_SOURCE_PAGES_INVALID';
  let document;
  try {
    document = parseDocument(exactSource(source, code), {
      prettyErrors: false,
      strict: true,
      uniqueKeys: true,
    });
  } catch {
    fail(code);
  }
  if (document.errors.length !== 0 || document.warnings.length !== 0) fail(code);
  const node = document.getIn([
    'jobs',
    'build',
    'env',
    'VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED',
  ], true);
  if (
    !isScalar(node)
    || node.type !== Scalar.QUOTE_SINGLE
    || (node.value !== 'true' && node.value !== 'false')
  ) fail(code);
  // Job/step shadowing could change build bytes while leaving the intended
  // top-level node intact. The key is therefore permitted exactly once.
  let keyCount = 0;
  document.contents?.items?.forEach(() => undefined);
  const visit = node => {
    if (node === null || typeof node !== 'object') return;
    if (node.key?.value === 'VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED') {
      keyCount += 1;
    }
    if (Array.isArray(node.items)) node.items.forEach(visit);
    if (node.value !== undefined) visit(node.value);
  };
  visit(document.contents);
  if (keyCount !== 1) fail(code);
  return node.value === 'true';
}

function withSourceFile(source, fileName, code, inspect) {
  const path = `/notification-pages-release-source/${fileName}`;
  let api;
  let snapshot;
  try {
    api = new TypeScriptAPI({
      cwd: '/notification-pages-release-source',
      fs: createVirtualFileSystem({ [path]: exactSource(source, code) }),
    });
    snapshot = api.updateSnapshot({ openFiles: [path] });
    const project = snapshot.getDefaultProjectForFile(path);
    const sourceFile = project?.program.getSourceFile(path);
    if (
      project === undefined
      || sourceFile === undefined
      || project.program.getSyntacticDiagnostics(path).length !== 0
    ) fail(code);
    return inspect(sourceFile);
  } catch (error) {
    if (error instanceof NotificationPagesReleaseSourceParserError) throw error;
    fail(code);
  } finally {
    try { snapshot?.dispose(); } catch { /* Preserve the primary failure. */ }
    try { api?.close(); } catch { /* Preserve the primary failure. */ }
  }
}

function exactExportedConst(sourceFile, variableName, code) {
  const matches = [];
  for (const statement of sourceFile.statements) {
    if (
      isVariableStatement(statement)
      && statement.modifiers?.length === 1
      && statement.modifiers[0].kind === SyntaxKind.ExportKeyword
      && (statement.declarationList.flags & NodeFlags.Const) !== 0
      && statement.declarationList.declarations.length === 1
      && isIdentifier(statement.declarationList.declarations[0].name)
      && statement.declarationList.declarations[0].name.text === variableName
      && statement.declarationList.declarations[0].initializer !== undefined
    ) matches.push(statement.declarationList.declarations[0].initializer);
  }
  if (matches.length !== 1) fail(code);
  return matches[0];
}

function exactHermesApproval(source) {
  const code = 'NOTIFICATION_PAGES_RELEASE_SOURCE_HERMES_INVALID';
  return withSourceFile(source, 'hermes-admin.ts', code, sourceFile => {
    const initializer = exactExportedConst(
      sourceFile,
      'FOUNDER_ADMISSION_NOTIFICATION_DELIVERY_APPROVED',
      code,
    );
    if (
      !isAsExpression(initializer)
      || !isIdentifier(initializer.type.typeName)
      || initializer.type.typeName.text !== 'const'
      || ![SyntaxKind.TrueKeyword, SyntaxKind.FalseKeyword]
        .includes(initializer.expression.kind)
    ) fail(code);
    return initializer.expression.kind === SyntaxKind.TrueKeyword;
  });
}

function exactObjectBinding(source, variableName, fields, code) {
  return withSourceFile(source, `${variableName}.mjs`, code, sourceFile => {
    const initializer = exactExportedConst(sourceFile, variableName, code);
    if (
      !isCallExpression(initializer)
      || initializer.arguments.length !== 1
      || !isPropertyAccessExpression(initializer.expression)
      || !isIdentifier(initializer.expression.expression)
      || initializer.expression.expression.text !== 'Object'
      || initializer.expression.name.text !== 'freeze'
      || !isObjectLiteralExpression(initializer.arguments[0])
      || initializer.arguments[0].properties.length !== fields.length
    ) fail(code);
    const result = {};
    for (let index = 0; index < fields.length; index += 1) {
      const [field, type] = fields[index];
      const property = initializer.arguments[0].properties[index];
      if (
        !isPropertyAssignment(property)
        || !isIdentifier(property.name)
        || property.name.text !== field
      ) fail(code);
      const expression = property.initializer;
      let value;
      if (isNullLiteral(expression)) value = null;
      else if (type === 'count' && isNumericLiteral(expression)) {
        if (!FOUNDER_COUNT.test(expression.text)) fail(code);
        value = Number(expression.text);
      } else if (isStringLiteral(expression)) {
        value = expression.text;
        if (!(type === 'digest' ? SHA256 : COMMIT).test(value)) fail(code);
        if (!/^'[^'\r\n]*'$/u.test(expression.getText(sourceFile))) fail(code);
      } else fail(code);
      result[field] = value;
    }
    const values = Object.values(result);
    const allNull = values.every(value => value === null);
    const allPopulated = values.every(value => value !== null);
    if (!allNull && !allPopulated) fail(code);
    return Object.freeze(result);
  });
}

/** Parse authority as data; candidate release modules are never executed. */
export function parseNotificationPagesReleaseSources({
  pagesWorkflowSource,
  hermesSource,
  preparedBindingSource,
  privateBindingSource,
  liveRootBindingSource,
  productionPlayerCanaryBindingSource,
} = {}) {
  return Object.freeze({
    phase: Object.freeze({
      pagesPresentationEnabled: exactPagesPresentation(pagesWorkflowSource),
      hermesExecutionApproved: exactHermesApproval(hermesSource),
    }),
    preparedBinding: exactObjectBinding(
      preparedBindingSource,
      'AUTH_BRIDGE_NOTIFICATION_PREPARED_RELEASE_BINDING',
      [
        ['notificationPreparedReceiptDigest', 'digest'],
        ['notificationPreparedBridgeSourceCommit', 'commit'],
      ],
      'NOTIFICATION_PAGES_RELEASE_SOURCE_PREPARED_BINDING_INVALID',
    ),
    privateBinding: exactObjectBinding(
      privateBindingSource,
      'NOTIFICATION_PAGES_PRIVATE_RELEASE_BINDING',
      [
        ['notificationPagesActiveV17EvidenceDigest', 'digest'],
        ['notificationPagesDeployedModuleReceiptDigest', 'digest'],
        ['notificationPagesExpectedFounderCount', 'count'],
      ],
      'NOTIFICATION_PAGES_RELEASE_SOURCE_PRIVATE_BINDING_INVALID',
    ),
    liveRootBinding: exactObjectBinding(
      liveRootBindingSource,
      'NOTIFICATION_PAGES_LIVE_RELEASE_BINDING',
      [
        ['notificationPagesLiveRootReceiptDigest', 'digest'],
        ['notificationPagesLiveRootPagesSourceCommit', 'commit'],
      ],
      'NOTIFICATION_PAGES_RELEASE_SOURCE_ROOT_BINDING_INVALID',
    ),
    productionPlayerCanaryBinding: exactObjectBinding(
      productionPlayerCanaryBindingSource,
      'PRODUCTION_PLAYER_CANARY_RELEASE_BINDING',
      [
        ['productionPlayerCanaryReceiptDigest', 'digest'],
        ['productionPlayerCanarySourceCommit', 'commit'],
      ],
      'NOTIFICATION_PAGES_RELEASE_SOURCE_PLAYER_CANARY_BINDING_INVALID',
    ),
  });
}

export function readNotificationPagesReleaseSources({ repositoryRoot } = {}) {
  if (typeof repositoryRoot !== 'string' || resolve(repositoryRoot) !== repositoryRoot) {
    fail('NOTIFICATION_PAGES_RELEASE_SOURCE_REPOSITORY_INVALID');
  }
  const source = relative => readFileSync(resolve(repositoryRoot, relative), 'utf8');
  return parseNotificationPagesReleaseSources({
    pagesWorkflowSource: source('.github/workflows/deploy-pages.yml'),
    hermesSource: source('scripts/hermes-admin.ts'),
    preparedBindingSource:
      source('scripts/auth-bridge-notification-prepared-release-binding.mjs'),
    privateBindingSource:
      source('scripts/notification-pages-private-release-binding.mjs'),
    liveRootBindingSource:
      source('scripts/notification-pages-live-release-binding.mjs'),
    productionPlayerCanaryBindingSource:
      source('scripts/production-player-canary-release-binding.mjs'),
  });
}
