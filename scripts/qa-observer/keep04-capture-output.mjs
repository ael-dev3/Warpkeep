import { lstat, mkdir, mkdtemp, realpath, writeFile } from 'node:fs/promises';
import { resolve, join, basename } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const runs = new WeakMap();
async function directory(parent, name) {
  const path = join(parent, name); await mkdir(path, { recursive: false }).catch(error => { if (error.code !== 'EEXIST') throw error; });
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (await realpath(path)).toLowerCase() !== path.toLowerCase()) throw new Error('Unsafe keep QA work directory.');
  return path;
}
async function base(first) { const root = await realpath(ROOT); return directory(await directory(root, first), 'keep04-qa'); }
export async function createKeep04CaptureRun(kind = 'windows') {
  if (kind !== 'windows') throw new TypeError('Unknown keep QA run kind.');
  const parent = await base('artifacts'); const path = await mkdtemp(join(parent, 'windows-run-'));
  const handle = Object.freeze({ id: basename(path), directory: path }); runs.set(handle, { path, parent }); return handle;
}
export async function createKeep04WindowsProfile() {
  const parent = await base('.cache'); return mkdtemp(join(parent, 'profile-'));
}
export async function writeKeep04RunFile(run, filename, contents) {
  const owned = runs.get(run);
  if (!owned || typeof filename !== 'string' || !/^(?:run-provenance\.json|synthetic-render-observations\.json|(?:desktop|mobile|mobile-reduced|landscape)-(?:empty|mill-placement|blocked-placement|mill-constructing|mill-complete|all-six-level-five|fallback|reduced-motion|context-cycle)\.png)$/.test(filename)) throw new TypeError('Invalid owned keep QA output.');
  const stat = await lstat(owned.path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (await realpath(owned.path)).toLowerCase() !== owned.path.toLowerCase()) throw new Error('Keep QA run directory changed.');
  const bytes = Buffer.isBuffer(contents) ? contents : Buffer.from(contents);
  if (bytes.length > (filename.endsWith('.png') ? 9 : 4) * 1024 * 1024) throw new RangeError('Keep QA output exceeded its bound.');
  await writeFile(join(owned.path, filename), bytes, { flag: 'wx' });
}
