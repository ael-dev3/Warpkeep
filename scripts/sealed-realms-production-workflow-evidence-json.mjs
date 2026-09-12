// Narrow Node-side counterpart of release-recovery/src/http.ts: duplicate keys
// and lossy GitHub identifiers must fail before evidence is interpreted.
// Match actual REST object paths: head_commit.id is a Git SHA, whereas run,
// repository and account IDs are JSON integers. Never coerce quoted claim IDs.
const INTEGER_FIELDS = new Set(['id', 'workflow_id', 'run_attempt', 'run_number',
  'repository/id', 'repository/owner/id', 'head_repository/id', 'head_repository/owner/id',
  'owner/id', 'actor/id', 'triggering_actor/id']);
const integerPath = path => INTEGER_FIELDS.has(path.replace(/^workflow_runs\/\*\//u, ''));
const fail = () => { throw new Error('SEALED_REALMS_WORKFLOW_EVIDENCE_JSON_INVALID'); };

export function parseWorkflowEvidenceJson(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 1 || bytes.byteLength > 512 * 1_024) fail();
  let source;
  try { source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { fail(); }
  let index = 0;
  let nodes = 0;
  const whitespace = () => { while (/[ \t\r\n]/u.test(source[index] ?? '\0')) index++; };
  const string = () => {
    if (source[index] !== '"') fail();
    const start = index++;
    while (index < source.length) {
      const character = source[index++];
      if (character === '\\') { index++; continue; }
      if (character !== '"') continue;
      let result;
      try { result = JSON.parse(source.slice(start, index)); } catch { fail(); }
      for (let cursor = 0; cursor < result.length; cursor++) {
        const code = result.charCodeAt(cursor);
        if (code >= 0xd800 && code <= 0xdbff) {
          const next = result.charCodeAt(++cursor);
          if (!(next >= 0xdc00 && next <= 0xdfff)) fail();
        } else if (code >= 0xdc00 && code <= 0xdfff) fail();
      }
      return result;
    }
    fail();
  };
  const value = (depth, path = '') => {
    if (depth > 64 || ++nodes > 65_536) fail();
    whitespace();
    if (integerPath(path)) {
      const match = /^[1-9][0-9]{0,19}(?=[,}\]\s]|$)/u.exec(source.slice(index));
      if (match === null) fail();
      index += match[0].length;
      return match[0];
    }
    if (source[index] === '"') return string();
    if (source[index] === '{') {
      index++; whitespace();
      const result = Object.create(null);
      if (source[index] === '}') { index++; return Object.freeze(result); }
      for (;;) {
        whitespace(); const name = string(); whitespace();
        if (Object.hasOwn(result, name) || source[index++] !== ':') fail();
        result[name] = value(depth + 1, path === '' ? name : `${path}/${name}`); whitespace();
        if (source[index] === '}') { index++; return Object.freeze(result); }
        if (source[index++] !== ',') fail();
      }
    }
    if (source[index] === '[') {
      index++; whitespace(); const result = [];
      if (source[index] === ']') { index++; return Object.freeze(result); }
      for (;;) {
        result.push(value(depth + 1, `${path}/*`)); whitespace();
        if (source[index] === ']') { index++; return Object.freeze(result); }
        if (source[index++] !== ',') fail();
      }
    }
    for (const [token, primitive] of [['true', true], ['false', false], ['null', null]]) {
      if (source.startsWith(token, index)) { index += token.length; return primitive; }
    }
    const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/u.exec(source.slice(index));
    if (match === null) fail();
    index += match[0].length;
    const number = Number(match[0]);
    if (!Number.isFinite(number) || (Number.isInteger(number) && !Number.isSafeInteger(number))) fail();
    return number;
  };
  const result = value(0); whitespace();
  if (index !== source.length || result === null || typeof result !== 'object' || Array.isArray(result)) fail();
  return result;
}
