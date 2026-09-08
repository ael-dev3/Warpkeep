import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

function fail() { throw new Error('LOCAL_PREPARED_CLOSURE_SCANNER_ARCHIVE_INVALID'); }
function field(header, offset, length) {
  const bytes = header.subarray(offset, offset + length);
  const zero = bytes.indexOf(0);
  const end = zero === -1 ? bytes.length : zero;
  if (bytes.subarray(end).some(byte => byte !== 0)
    || bytes.subarray(0, end).some(byte => byte < 32 || byte > 126)) fail();
  return bytes.subarray(0, end).toString('ascii');
}
function octal(header, offset, length) {
  const raw = header.subarray(offset, offset + length).toString('ascii').replace(/[\0 ]+$/u, '').trimStart();
  if (!/^[0-7]{1,11}$/u.test(raw)) fail();
  return Number.parseInt(raw, 8);
}

/** Data validation only. The operating caller selects the integrity from its
 * authenticated fixed manifest; returned bytes are never execution authority. */
export function derivePreparedClosureScannerArchiveFiles(archive, integrity) {
  const owned = [];
  let inflated;
  try {
    if (!Buffer.isBuffer(archive) || archive.length < 1 || archive.length > 32 * 1024 * 1024
      || typeof integrity !== 'string' || !/^sha512-[A-Za-z0-9+/]{86}==$/u.test(integrity)
      || `sha512-${createHash('sha512').update(archive).digest('base64')}` !== integrity) fail();
    inflated = gunzipSync(archive, { maxOutputLength: 64 * 1024 * 1024 });
    if (inflated.length % 512 !== 0) fail();
    const seen = new Set();
    let end = false;
    for (let at = 0; at < inflated.length;) {
      const header = inflated.subarray(at, at + 512);
      if (header.every(byte => byte === 0)) {
        if (at + 1024 > inflated.length || inflated.subarray(at).some(byte => byte !== 0)) fail();
        end = true;
        break;
      }
      const checksum = octal(header, 148, 8);
      let actual = 0;
      for (let index = 0; index < 512; index += 1) actual += index >= 148 && index < 156 ? 32 : header[index];
      if (checksum !== actual || ![0, 48].includes(header[156])
        || field(header, 157, 100) !== '' || field(header, 257, 6) !== 'ustar'
        || header.subarray(500).some(byte => byte !== 0)) fail();
      const prefix = field(header, 345, 155);
      const name = `${prefix ? `${prefix}/` : ''}${field(header, 0, 100)}`;
      if (!name.startsWith('package/')) fail();
      const path = name.slice(8);
      if (path.length < 1 || path.length > 240 || !/^[A-Za-z0-9._/-]+$/u.test(path)
        || path.split('/').some(part => !part || part === '.' || part === '..')
        || seen.has(path.toLowerCase())) fail();
      seen.add(path.toLowerCase());
      const size = octal(header, 124, 12);
      const mode = octal(header, 100, 8);
      if (size < 1 || size > 32 * 1024 * 1024 || ![0o644, 0o755].includes(mode)
        || at + 512 + size > inflated.length || seen.size > 1024) fail();
      const next = at + 512 + Math.ceil(size / 512) * 512;
      if (inflated.subarray(at + 512 + size, next).some(byte => byte !== 0)) fail();
      const bytes = Buffer.from(inflated.subarray(at + 512, at + 512 + size));
      owned.push(Object.freeze({ path, bytes }));
      at = next;
    }
    if (!end || owned.length === 0) fail();
    return Object.freeze(owned.sort((a, b) => a.path < b.path ? -1 : 1));
  } catch {
    for (const file of owned) file.bytes.fill(0);
    fail();
  } finally { inflated?.fill(0); }
}
