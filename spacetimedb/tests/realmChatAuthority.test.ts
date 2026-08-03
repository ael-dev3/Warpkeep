import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

function section(text: string, start: string, end?: string): string {
  const startAt = text.indexOf(start);
  assert.notEqual(startAt, -1, `missing source marker: ${start}`);
  if (end === undefined) return text.slice(startAt);
  const endAt = text.indexOf(end, startAt + start.length);
  assert.notEqual(endAt, -1, `missing source marker: ${end}`);
  return text.slice(startAt, endAt);
}

function registrations(text: string, marker: string): string[] {
  const registration = section(text, marker, '\n});');
  return registration
    .split(/[\n,]/)
    .map(value => value.trim())
    .filter(value => /^[A-Za-z][A-Za-z0-9]*$/.test(value));
}

test('v15 appends exactly seven privacy-separated Realm Chat tables', () => {
  const schema = source('../src/schema.ts');
  const v14 = source('../migration-fixtures/additive-v14-schema/src/index.ts');
  const v15 = source('../migration-fixtures/additive-v15-schema/src/index.ts');
  const current = registrations(schema, 'const warpkeep = schema({');
  const predecessor = registrations(v14, 'const db = schema({');
  const fixture = registrations(v15, 'const db = schema({');

  assert.deepEqual(current, fixture);
  assert.deepEqual(current.slice(0, predecessor.length), predecessor);
  assert.deepEqual(current.slice(predecessor.length), [
    'realmChatStatusV1',
    'realmChatChannelV1',
    'realmChatMessageV1',
    'realmChatRecentV1',
    'realmChatRateEventV1',
    'realmChatSendReceiptV1',
    'realmChatReportV1',
  ]);

  for (const publicName of ['realmChatStatusV1', 'realmChatRecentV1']) {
    assert.match(section(schema, `export const ${publicName} = table(`, '\n);'), /public: true/);
  }
  for (const privateName of [
    'realmChatChannelV1',
    'realmChatMessageV1',
    'realmChatRateEventV1',
    'realmChatSendReceiptV1',
    'realmChatReportV1',
  ]) {
    assert.doesNotMatch(
      section(schema, `export const ${privateName} = table(`, '\n);'),
      /public: true/,
    );
  }
});

test('send, history, and reporting derive identity, time, order, and context on the server', () => {
  const reducer = source('../src/reducers/realmChat.ts');
  const send = section(
    reducer,
    'export const sendRealmChatMessageV1',
    '/** Caller-gated, exclusive-cursor history.',
  );
  const history = section(
    reducer,
    'export const getRealmChatHistoryV1',
    '/** One private report per caller/message;',
  );
  const report = section(
    reducer,
    'export const reportRealmChatMessageV1',
    'function inspectRealmChat',
  );

  assert.match(send, /\{ requestKey: t\.string\(\), body: t\.string\(\) \}/);
  assert.doesNotMatch(send, /senderFid: t\.|sequence: t\.|sentAt: t\.|channelKey: t\./);
  assert.match(send, /requireGameplayPlayerV1\(ctx\)/);
  assert.match(send, /normalizeRealmChatBody\(body\)/);
  assert.match(send, /evaluateRealmChatRateLimit\(rateRows, nowMicros, digest\)/);
  assert.match(send, /messageId: ctx\.newUuidV7\(\)\.toString\(\)/);
  assert.match(send, /sentAt: ctx\.timestamp/);
  assert.match(send, /sequence: channel\.nextSequence/);
  assert.match(send, /realmChatSendReceiptV1\.operationKey\.find\(operationKey\)/);
  assert.match(send, /pruneRecentProjection\(ctx\)/);
  assert.match(reducer, /function recentProjectionMatchesArchive/);
  assert.match(reducer, /recentProjectionMatchesArchive\(ctx, channel\)/);

  assert.match(history, /requireGameplayPlayerV1\(tx\)/);
  assert.match(history, /limit < 1 \|\| limit > REALM_CHAT_HISTORY_PAGE_LIMIT/);
  assert.match(history, /while \(cursor > 1n && messages\.length < limit\)/);
  assert.match(history, /realmChatMessageV1\.sequence\.find\(cursor\)/);
  assert.doesNotMatch(history, /realmChatMessageV1\.iter\(\)/);

  assert.match(report, /requireGameplayPlayerV1\(ctx\)/);
  assert.match(report, /canonicalMessageId\(messageId\)/);
  assert.match(report, /message\.senderFid === claims\.fid/);
  assert.match(report, /realmChatReportV1\.reportKey\.find\(key\)/);
  assert.match(
    report,
    /realmChatContextBounds\(message\.sequence, channel\.nextSequence - 1n\)/,
  );
  assert.doesNotMatch(report, /visibility:\s*'tombstoned'|realmChatRecentV1\..*update/);
});

test('moderation preserves private evidence while public tombstones reveal no body', () => {
  const reducer = source('../src/reducers/realmChat.ts');
  const evidence = section(reducer, 'function projectEvidenceMessage', 'function reportEntry');
  const tombstone = section(
    reducer,
    'export const adminTombstoneRealmChatMessageV1',
    'export const adminListRealmChatReportsV1',
  );
  const context = section(
    reducer,
    'export const adminGetRealmChatReportContextV1',
    'export const adminResolveRealmChatReportV1',
  );

  assert.match(evidence, /body: message\.body/);
  assert.match(tombstone, /requireAdmin\(ctx\)/);
  assert.match(tombstone, /realmChatMessageV1\.messageId\.update/);
  assert.match(tombstone, /realmChatRecentV1\.sequence\.update\(\{[\s\S]*body: ''/);
  assert.doesNotMatch(tombstone, /realmChatMessageV1\.messageId\.delete/);
  assert.match(context, /requireAdmin\(tx\)/);
  assert.match(context, /messages\.push\(projectEvidenceMessage\(message\)\)/);
});

test('activation is doubly gated and every operational admin path is audited or read-only', () => {
  const policy = source('../src/realmChatPolicy.ts');
  const legal = source('../../src/legal/realmChatPolicy.ts');
  const publisher = source('../../scripts/publish-spacetime-dev.mjs');
  const reducer = source('../src/reducers/realmChat.ts');
  const activate = section(
    reducer,
    'export const adminActivateRealmChatV1',
    'export const adminDisableRealmChatV1',
  );

  assert.match(policy, /REALM_CHAT_SERVER_ACTIVATION_ALLOWED = false/);
  assert.match(legal, /WARPKEEP_REALM_CHAT_CLIENT_ENTRY_ENABLED = false/);
  assert.match(
    publisher,
    /Realm Chat protocol v15 is review-only and cannot be published by this build/,
  );
  assert.match(activate, /const admin = requireAdmin\(ctx\)/);
  assert.match(activate, /REALM_CHAT_ACTIVATION_NOT_COMPILED/);
  assert.match(activate, /expectedPolicyVersion !== REALM_CHAT_POLICY_VERSION/);
  assert.match(activate, /action: 'realm_chat_activated_v1'/);
  for (const action of [
    'realm_chat_staged_v1',
    'realm_chat_activated_v1',
    'realm_chat_disabled_v1',
    'realm_chat_message_tombstoned_v1',
    'realm_chat_report_resolved_v1',
  ]) assert.match(reducer, new RegExp(`action: '${action}'`));
});

test('player bindings expose only the bounded public pair and caller operations', () => {
  const bindings = source('../../src/spacetime/playerModuleBindings.ts');
  for (const publicName of ['realmChatStatusV1', 'realmChatRecentV1']) {
    assert.match(bindings, new RegExp(`\\b${publicName}\\b`));
  }
  for (const operation of [
    'SendRealmChatMessageV1Reducer',
    'ReportRealmChatMessageV1Reducer',
    'GetRealmChatHistoryV1Procedure',
  ]) assert.match(bindings, new RegExp(`\\b${operation}\\b`));
  for (const privateName of [
    'realmChatChannelV1',
    'realmChatMessageV1',
    'realmChatRateEventV1',
    'realmChatSendReceiptV1',
    'realmChatReportV1',
    'adminActivateRealmChatV1',
    'adminTombstoneRealmChatMessageV1',
  ]) assert.doesNotMatch(bindings, new RegExp(`\\b${privateName}\\b`));

  const root = new URL('../../src/spacetime/module_bindings/', import.meta.url);
  assert.equal(existsSync(new URL('realm_chat_status_v_1_table.ts', root)), true);
  assert.equal(existsSync(new URL('realm_chat_recent_v_1_table.ts', root)), true);
  assert.equal(existsSync(new URL('realm_chat_message_v_1_table.ts', root)), false);
});
