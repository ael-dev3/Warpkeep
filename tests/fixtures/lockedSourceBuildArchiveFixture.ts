import { gzipSync } from 'node:zlib';

export type LockedSourceBuildArchiveCorruption = 'path' | 'link';

function tarHeader(path: string, kind: 'directory' | 'file' | 'symlink', size: number): Buffer {
  const header = Buffer.alloc(512);
  header.write(path, 0, 100, 'utf8');
  header.write(`${(kind === 'directory' ? 0o755 : 0o644).toString(8).padStart(7, '0')}\0`, 100, 8, 'ascii');
  header.write('0000000\0', 108, 8, 'ascii');
  header.write('0000000\0', 116, 8, 'ascii');
  header.write(`${size.toString(8).padStart(11, '0')}\0`, 124, 12, 'ascii');
  header.write('00000000000\0', 136, 12, 'ascii');
  header.fill(0x20, 148, 156);
  header[156] = kind === 'directory' ? 0x35 : kind === 'file' ? 0x30 : 0x32;
  header.write('ustar\0', 257, 6, 'ascii');
  header.write('00', 263, 2, 'ascii');
  const checksum = header.reduce((total, value) => total + value, 0);
  header.write(checksum.toString(8).padStart(6, '0'), 148, 6, 'ascii');
  header[154] = 0;
  header[155] = 0x20;
  return header;
}

export function createLockedSourceBuildPackageArchive(input: Readonly<{
  name: string;
  version: string;
  corrupt?: LockedSourceBuildArchiveCorruption;
}>): Buffer {
  if (input.corrupt === 'path') {
    return gzipSync(Buffer.concat([
      tarHeader('package/../escape', 'file', 1), Buffer.from('x'), Buffer.alloc(511),
      Buffer.alloc(1_024),
    ]));
  }
  if (input.corrupt === 'link') {
    return gzipSync(Buffer.concat([
      tarHeader('package/link', 'symlink', 0), Buffer.alloc(1_024),
    ]));
  }
  const files = new Map<string, Buffer>([
    ['package.json', Buffer.from(`${JSON.stringify({ name: input.name, version: input.version })}\n`)],
  ]);
  if (input.name === 'esbuild') files.set('bin/esbuild', Buffer.from('#!/bin/sh\n'));
  if (input.name === 'tsx') files.set('dist/cli.mjs', Buffer.from('export {};\n'));
  if (input.name === 'typescript') {
    files.set('bin/tsc', Buffer.from('#!/bin/sh\n'));
    files.set('bin/tsserver', Buffer.from('#!/bin/sh\n'));
  }
  const directories = new Set<string>(['package']);
  for (const path of files.keys()) {
    const components = path.split('/');
    for (let index = 1; index < components.length; index += 1) {
      directories.add(`package/${components.slice(0, index).join('/')}`);
    }
  }
  const blocks: Buffer[] = [];
  for (const path of [...directories].sort()) blocks.push(tarHeader(`${path}/`, 'directory', 0));
  for (const [path, body] of [...files].sort(([left], [right]) => left.localeCompare(right))) {
    blocks.push(tarHeader(`package/${path}`, 'file', body.byteLength), body);
    if (body.byteLength % 512 !== 0) blocks.push(Buffer.alloc(512 - (body.byteLength % 512)));
  }
  blocks.push(Buffer.alloc(1_024));
  return gzipSync(Buffer.concat(blocks));
}
