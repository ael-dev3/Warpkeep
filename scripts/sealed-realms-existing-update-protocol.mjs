import { createHash } from 'node:crypto';
import { keccak_256 } from '@noble/hashes/sha3';
import { canonicalTableSchemaBoundary } from './spacetime-table-schema-attestation.mjs';

const fail = () => { throw new Error('SEALED_REALMS_EXISTING_UPDATE_PROTOCOL_INVALID'); };
export const updateSha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const updateProgramHash = bytes => Buffer.from(keccak_256(bytes)).toString('hex');
export const UPDATE_HASH = /^[a-f0-9]{64}$/u;
export function updateCanonical(value) {
  if (Array.isArray(value)) return `[${value.map(updateCanonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${updateCanonical(value[key])}`).join(',')}}`;
  if (!['string', 'number', 'boolean'].includes(typeof value) && value !== null) fail();
  return JSON.stringify(value);
}
export const updateDigest = value => updateSha256(Buffer.from(updateCanonical(value)));
export function updateExact(value, keys) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype
    || Object.keys(value).sort().join('\0') !== [...keys].sort().join('\0')) fail();
  return value;
}

/** Bounded lossless JSON subset for the native protocol; duplicate keys fail. */
export function parseExistingUpdateJson(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 1 || bytes.length > 32 * 1024 * 1024) fail();
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); } catch { fail(); }
  let offset = 0, nodes = 0;
  const space = () => { while (/[\t\r\n ]/u.test(text[offset] ?? '\0')) offset++; };
  const string = () => {
    const start = offset++;
    while (offset < text.length) {
      const character = text[offset++];
      if (character === '\\') { offset++; continue; }
      if (character === '"') {
        let value;
        try { value = JSON.parse(text.slice(start, offset)); } catch { fail(); }
        if (!value.isWellFormed()) fail();
        return value;
      }
    }
    fail();
  };
  const parse = depth => {
    if (depth > 64 || ++nodes > 2_000_000) fail();
    space();
    const character = text[offset];
    if (character === '"') return string();
    if (character === '{') {
      offset++; space(); const value = {};
      if (text[offset] === '}') { offset++; return value; }
      for (;;) {
        space(); if (text[offset] !== '"') fail();
        const key = string(); space();
        if (Object.hasOwn(value, key) || text[offset++] !== ':') fail();
        Object.defineProperty(value, key, { value: parse(depth + 1), enumerable: true });
        space(); const separator = text[offset++];
        if (separator === '}') return value;
        if (separator !== ',') fail();
      }
    }
    if (character === '[') {
      offset++; space(); const value = [];
      if (text[offset] === ']') { offset++; return value; }
      for (;;) {
        value.push(parse(depth + 1)); space(); const separator = text[offset++];
        if (separator === ']') return value;
        if (separator !== ',') fail();
      }
    }
    for (const [literal, value] of [['true', true], ['false', false], ['null', null]]) {
      if (text.startsWith(literal, offset)) { offset += literal.length; return value; }
    }
    const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/u.exec(text.slice(offset));
    if (match === null) fail();
    offset += match[0].length;
    const value = Number(match[0]);
    if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value))) fail();
    return value;
  };
  const result = parse(0); space(); if (offset !== text.length) fail();
  return result;
}

export function decodeExistingUpdateToken(value) {
  if (typeof value !== 'string' || !/^0x[a-f0-9]{1,64}$/u.test(value)) fail();
  return Buffer.from(value.slice(2).padStart(64, '0'), 'hex').reverse().toString('hex');
}
export function existingUpdateTokenDigest(identity, predecessor, candidate) {
  if (![identity, predecessor, candidate].every(value => UPDATE_HASH.test(value))) fail();
  return updateProgramHash(Buffer.from(identity + predecessor + candidate, 'utf8'));
}
export function parseExistingUpdatePlan(bytes, identity, predecessor, candidate) {
  const result = updateExact(parseExistingUpdateJson(bytes), ['AutoMigrate']);
  const plan = updateExact(result.AutoMigrate, ['break_clients', 'major_version_upgrade', 'migrate_plan', 'token']);
  if (plan.break_clients !== false || plan.major_version_upgrade !== false
    || typeof plan.migrate_plan !== 'string' || Buffer.byteLength(plan.migrate_plan) > 128 * 1024
    || decodeExistingUpdateToken(plan.token) !== existingUpdateTokenDigest(identity, predecessor, candidate)) fail();
  return Object.freeze({ token: plan.token, planDigest: updateDigest(result), observation: result });
}

export function parseExistingUpdateSql(bytes) {
  const result = parseExistingUpdateJson(bytes);
  if (!Array.isArray(result) || result.length !== 1) fail();
  const statement = updateExact(result[0], ['schema', 'rows', 'total_duration_micros', 'stats']);
  updateExact(statement.stats, ['rows_inserted', 'rows_deleted', 'rows_updated']);
  if (Object.values(statement.stats).some(value => value !== 0)
    || !Number.isSafeInteger(statement.total_duration_micros) || statement.total_duration_micros < 0
    || !statement.schema || !Array.isArray(statement.schema.elements)
    || !Array.isArray(statement.rows) || statement.rows.length > 500_000) fail();
  const rows = statement.rows.map(row => {
    if (typeof row === 'string') return parseExistingUpdateJson(Buffer.from(row));
    if (!Array.isArray(row) && (row === null || typeof row !== 'object')) fail();
    return row;
  });
  const sorted = rows.map(updateCanonical).sort();
  return Object.freeze({ schema: statement.schema, rows, rowsDigest: updateDigest(sorted), count: rows.length });
}
export function parseExistingUpdateProgram(bytes) {
  const result = parseExistingUpdateSql(bytes);
  if (updateCanonical(result.schema) !== updateCanonical({ elements: [{ name: { some: 'program_hash' }, algebraic_type: { U256: [] } }] })
    || result.rows.length !== 1 || !Array.isArray(result.rows[0]) || result.rows[0].length !== 1) fail();
  return decodeExistingUpdateToken(result.rows[0][0]);
}
export function parseExistingUpdateSchema(bytes) {
  const value = parseExistingUpdateJson(bytes);
  if (!value || !Array.isArray(value.tables) || value.tables.length < 1 || value.tables.length > 128) fail();
  const names = value.tables.map(table => table.name).sort();
  if (new Set(names).size !== names.length || names.some(name => typeof name !== 'string' || !/^[a-z][a-z0-9_]{0,127}$/u.test(name))) fail();
  const boundary = selected => canonicalTableSchemaBoundary({ ...value, tables: value.tables.filter(table => selected.includes(table.name)) }, selected);
  const tableSchemas = Object.fromEntries(names.map(name => [name, updateDigest(boundary([name]))]));
  return Object.freeze({ names: Object.freeze(names), digest: updateDigest(boundary(names)), tableSchemas: Object.freeze(tableSchemas) });
}
export function parseExistingUpdateSuccess(bytes, identity) {
  const result = updateExact(parseExistingUpdateJson(bytes), ['Success']);
  const success = updateExact(result.Success, ['domain', 'database_identity', 'op']);
  if (success.domain !== null || success.database_identity !== identity || success.op !== 'updated') fail();
  return updateDigest(result);
}
