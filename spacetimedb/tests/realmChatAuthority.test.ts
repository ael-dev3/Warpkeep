import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

test('v16 appends exactly eight privacy-separated Realm Chat tables after frozen v15', () => {
  const schema = source('../src/schema.ts');
  const v15 = source('../migration-fixtures/additive-v15-schema/src/index.ts');
  const v16 = source('../migration-fixtures/additive-v16-schema/src/index.ts');
  const packageJson = source('../migration-fixtures/additive-v16-schema/package.json');
  const rootPackageJson = source('../../package.json');
  const lock = source('../pnpm-lock.yaml');
  const current = registrations(schema, 'const warpkeep = schema({');
  const predecessor = registrations(v15, 'const db = schema({');
  const fixture = registrations(v16, 'const db = schema({');
  const chatTables = [
    'realmChatStatusV1',
    'realmChatChannelV1',
    'realmChatMessageV1',
    'realmChatRecentV1',
    'realmChatRateEventV1',
    'realmChatSendReceiptV1',
    'realmChatReportV1',
    'realmChatReportRateEventV1',
  ];

  assert.equal(predecessor.length, 64);
  assert.ok(current.length >= fixture.length);
  assert.deepEqual(current.slice(0, fixture.length), fixture);
  assert.deepEqual(current.slice(0, predecessor.length), predecessor);
  assert.deepEqual(current.slice(predecessor.length, fixture.length), chatTables);

  for (const publicName of ['realmChatStatusV1']) {
    assert.match(section(schema, `export const ${publicName} = table(`, '\n);'), /public: true/);
  }
  for (const privateName of [
    'realmChatChannelV1',
    'realmChatMessageV1',
    'realmChatRecentV1',
    'realmChatRateEventV1',
    'realmChatSendReceiptV1',
    'realmChatReportV1',
    'realmChatReportRateEventV1',
  ]) {
    assert.doesNotMatch(
      section(schema, `export const ${privateName} = table(`, '\n);'),
      /public: true/,
    );
  }
  assert.match(
    section(schema, 'export const realmChatReportV1 = table(', '\n);'),
    /status: t\.string\(\)\.index\(\)/,
  );

  assert.match(v16, /fixtureSeedRealmChatSentinelV16/);
  assert.match(v16, /name: 'fixture_seed_realm_chat_sentinel_v16'/);
  for (const tableName of chatTables) {
    assert.match(
      section(v16, 'export const fixtureSeedRealmChatSentinelV16'),
      new RegExp(`ctx\\.db\\.${tableName}\\.insert`),
    );
  }
  assert.match(packageJson, /warpkeep-additive-v16-schema-migration-fixture/);
  assert.match(rootPackageJson, /stdb:build-v16-migration-fixture/);
  assert.match(lock, /migration-fixtures\/additive-v16-schema:/);
});

test('send, recent, history, and reporting derive identity, time, order, and context on the server', () => {
  const reducer = source('../src/reducers/realmChat.ts');
  const send = section(
    reducer,
    'export const sendRealmChatMessageV1',
    'export const getRealmChatRecentV1',
  );
  const recent = section(
    reducer,
    'export const getRealmChatRecentV1',
    'export const getRealmChatHistoryV1',
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
  assert.match(send, /channel\.pendingReports >= REALM_CHAT_REPORT_SEND_PAUSE_THRESHOLD/);
  assert.match(send, /pruneRecentProjection\(ctx\)/);
  assert.match(reducer, /function recentProjectionMatchesArchive/);
  assert.match(reducer, /recentProjectionMatchesArchive\(ctx, channel\)/);

  assert.match(recent, /requireGameplayPlayerV1\(tx\)/);
  assert.match(recent, /requireChannel\(tx, true\)/);
  assert.match(recent, /limit < 1 \|\| limit > REALM_CHAT_RECENT_LIMIT/);
  assert.match(recent, /realmChatRecentV1\.iter\(\)/);
  assert.match(recent, /boundedFidRows\([\s\S]*REALM_CHAT_RECENT_LIMIT/);

  assert.match(history, /requireGameplayPlayerV1\(tx\)/);
  assert.match(history, /limit < 1 \|\| limit > REALM_CHAT_HISTORY_PAGE_LIMIT/);
  assert.match(history, /while \(cursor > 1n && messages\.length < limit\)/);
  assert.match(history, /realmChatMessageV1\.sequence\.find\(cursor\)/);
  assert.doesNotMatch(history, /realmChatMessageV1\.iter\(\)/);

  assert.match(report, /requireGameplayPlayerV1\(ctx\)/);
  assert.match(report, /canonicalMessageId\(messageId\)/);
  assert.match(report, /message\.senderFid === claims\.fid/);
  assert.match(report, /realmChatReportV1\.reportKey\.find\(key\)/);
  assert.match(report, /channel\.pendingReports >= REALM_CHAT_REPORT_PENDING_LIMIT/);
  assert.match(report, /reportsForMessage\.length >= REALM_CHAT_REPORT_MAX_PER_MESSAGE/);
  assert.match(report, /const nowMicros = ctx\.timestamp\.microsSinceUnixEpoch/);
  assert.match(report, /evaluateRealmChatReportRateLimit\(reportRateRows, nowMicros, claims\.fid\)/);
  assert.match(report, /pendingReports: channel\.pendingReports \+ 1/);
  assert.match(reducer, /realmChatReportV1\.status\.filter\('pending'\)/);
  assert.doesNotMatch(
    section(reducer, 'function inspectRealmChat', 'export const adminGetRealmChatStatusV1'),
    /realmChatReportV1\.iter\(\)/,
  );
  assert.match(
    report,
    /realmChatContextBounds\(message\.sequence, channel\.nextSequence - 1n\)/,
  );
  assert.doesNotMatch(report, /visibility:\s*'tombstoned'|realmChatRecentV1\..*update/);
});

test('moderation preserves private evidence while caller-gated tombstones reveal no body', () => {
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

test('server activation is compile-time gated and every operational admin path is audited or read-only', () => {
  const policy = source('../src/realmChatPolicy.ts');
  const legal = source('../../src/legal/realmChatPolicy.ts');
  const reducer = source('../src/reducers/realmChat.ts');
  const activate = section(
    reducer,
    'export const adminActivateRealmChatV1',
    'export const adminDisableRealmChatV1',
  );

  assert.match(policy, /REALM_CHAT_SERVER_ACTIVATION_ALLOWED = false/);
  assert.match(legal, /WARPKEEP_REALM_CHAT_CLIENT_ENTRY_ENABLED = false/);
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
