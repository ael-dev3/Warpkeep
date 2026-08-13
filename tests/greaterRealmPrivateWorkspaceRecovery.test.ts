import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  constants,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  greaterRealmPrivateWorkspaceTestSeams,
  openGreaterRealmPrivateWorkspace,
} from '../scripts/atlas/greater-realm-private-workspace';

const temporaryRoots: string[] = [];

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'warpkeep-private-recovery-'));
  temporaryRoots.push(root);
  const repositoryRoot = join(root, 'repository');
  const workspaceRoot = join(root, 'workspace');
  mkdirSync(repositoryRoot, { mode: 0o700 });
  return {
    workspace: openGreaterRealmPrivateWorkspace({ repositoryRoot, workspaceRoot }),
    workspaceRoot,
  };
}

function publicationClaimName(component: string): string {
  const digest = createHash('sha256')
    .update('warpkeep-greater-realm-private-publication-claim-v1\0', 'utf8')
    .update(component, 'utf8')
    .digest('hex');
  return `.wk-publish-claim-${digest}`;
}

function writePublicationClaim(parent: string, destinationName: string): string {
  const path = join(parent, publicationClaimName(destinationName));
  writeFileSync(
    path,
    `warpkeep-greater-realm-private-directory-claim-v1\n${destinationName}\n`,
    { mode: 0o600 },
  );
  return path;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

describe('Greater Realm private workspace crash recovery', () => {
  it('recovers a dead-process generation lock while preserving live exclusion', async () => {
    const { workspace } = fixture();
    const locks = workspace.ensureDirectory('locks');
    const deadChild = spawnSync(process.execPath, ['-e', 'process.exit(0)']);
    expect(deadChild.pid).toBeGreaterThan(0);
    writeFileSync(
      join(locks, 'generate-candidates.lock'),
      greaterRealmPrivateWorkspaceTestSeams.lockRecord(deadChild.pid!),
      { mode: 0o600 },
    );

    await expect(workspace.withExclusiveLock(
      'locks/generate-candidates.lock',
      async () => 'resumed',
    )).resolves.toBe('resumed');

    await workspace.withExclusiveLock('locks/generate-candidates.lock', async () => {
      await expect(workspace.withExclusiveLock(
        'locks/generate-candidates.lock',
        async () => 'must-not-enter',
      )).rejects.toThrow('GREATER_REALM_PRIVATE_ALREADY_RUNNING');
    });
  });

  it('retires an uninstalled atomic-write temp and completes a linked install', () => {
    const { workspace } = fixture();
    const parent = workspace.ensureDirectory('checkpoints');
    const relativePath = 'checkpoints/state.wkgr-checkpoint';
    const destination = join(parent, 'state.wkgr-checkpoint');
    const abandoned = join(parent, `.state.wkgr-checkpoint.${randomUUID()}.tmp`);
    writeFileSync(abandoned, Buffer.from('private-abandoned-state'), { mode: 0o600 });

    expect(workspace.recoverAtomicFileWrite(relativePath)).toBe('absent');
    expect(existsSync(abandoned)).toBe(false);
    expect(existsSync(destination)).toBe(false);

    const linked = join(parent, `.state.wkgr-checkpoint.${randomUUID()}.tmp`);
    const expected = Buffer.from('authenticated-private-state');
    writeFileSync(linked, expected, { mode: 0o600 });
    linkSync(linked, destination);
    expect(statSync(linked).nlink).toBe(2);

    expect(workspace.recoverAtomicFileWrite(relativePath)).toBe('installed');
    expect(existsSync(linked)).toBe(false);
    expect(statSync(destination).nlink).toBe(1);
    expect(readFileSync(destination)).toEqual(expected);
  });

  it('fails closed on a matching temp name that is a symbolic link', () => {
    const { workspace, workspaceRoot } = fixture();
    const parent = workspace.ensureDirectory('checkpoints');
    const external = join(workspaceRoot, '..', 'external');
    writeFileSync(external, 'must survive', { mode: 0o600 });
    const temporary = join(parent, `.state.wkgr-checkpoint.${randomUUID()}.tmp`);
    symlinkSync(external, temporary);

    expect(() => workspace.recoverAtomicFileWrite(
      'checkpoints/state.wkgr-checkpoint',
    )).toThrow('GREATER_REALM_PRIVATE_FILE_INVALID');
    expect(readFileSync(external, 'utf8')).toBe('must survive');
    expect(existsSync(temporary)).toBe(true);
  });

  it('retires an authenticated partial publication and permits exact replay', async () => {
    const { workspace } = fixture();
    const parent = workspace.ensureDirectory('batches');
    const destinationName = 'GR-B-AAAAAAAAAAAAAAAA';
    const destination = join(parent, destinationName);
    const claim = writePublicationClaim(parent, destinationName);
    mkdirSync(destination, { mode: 0o700 });
    writeFileSync(
      join(destination, '.wk-publish-envelope-v1'),
      'warpkeep-greater-realm-private-directory-envelope-v1\n',
      { mode: 0o600 },
    );
    const payload = join(
      destination,
      '.wk-publish-payload-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );
    mkdirSync(payload, { mode: 0o700 });
    writeFileSync(join(payload, 'candidate.bin'), Buffer.from([1, 2, 3]), { mode: 0o600 });

    expect(workspace.recoverAtomicDirectoryPublish(
      `batches/${destinationName}`,
    )).toBe('absent');
    expect(existsSync(destination)).toBe(false);
    expect(existsSync(claim)).toBe(false);

    await workspace.withAtomicDirectoryPublish(
      `batches/${destinationName}`,
      async staged => {
        staged.writeFileAtomic(
          `batches/${destinationName}/candidate.bin`,
          Uint8Array.of(4, 5, 6),
        );
      },
    );
    expect(workspace.readFile(`batches/${destinationName}/candidate.bin`))
      .toEqual(Buffer.from([4, 5, 6]));
  });

  it('recovers only the target-bound orphan stage and zeroizes its open inode', () => {
    const { workspace } = fixture();
    const first = 'batches/GR-B-DDDDDDDDDDDDDDDD';
    const second = 'batches/GR-B-EEEEEEEEEEEEEEEE';
    const firstStage = workspace.ensureDirectory(
      `.pending/${greaterRealmPrivateWorkspaceTestSeams.pendingTargetName(first)}/${randomUUID()}`,
    );
    const secondStage = workspace.ensureDirectory(
      `.pending/${greaterRealmPrivateWorkspaceTestSeams.pendingTargetName(second)}/${randomUUID()}`,
    );
    const privateBytes = Buffer.from('private-seed-bearing-stage', 'utf8');
    const firstFile = join(firstStage, 'batch-seed.bin');
    writeFileSync(firstFile, privateBytes, { mode: 0o600 });
    writeFileSync(join(secondStage, 'must-remain.bin'), privateBytes, { mode: 0o600 });
    const descriptor = openSync(firstFile, constants.O_RDONLY);
    try {
      expect(workspace.recoverAtomicDirectoryPublish(first)).toBe('absent');
      expect(existsSync(firstStage)).toBe(false);
      expect(existsSync(secondStage)).toBe(true);
      const observed = Buffer.alloc(privateBytes.byteLength, 0xff);
      try {
        expect(readSync(descriptor, observed, 0, observed.byteLength, 0))
          .toBe(observed.byteLength);
        expect(observed.every(byte => byte === 0)).toBe(true);
      } finally {
        observed.fill(0);
      }
    } finally {
      closeSync(descriptor);
      privateBytes.fill(0);
    }
  });

  it('does not sweep a live stage for a concurrent publication of the same target', async () => {
    const { workspace } = fixture();
    const target = 'batches/GR-B-FFFFFFFFFFFFFFFF';
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const first = workspace.withAtomicDirectoryPublish(target, async staged => {
      staged.writeFileAtomic(`${target}/candidate.bin`, Uint8Array.of(1, 2, 3));
      entered();
      await gate;
    });
    await started;
    await expect(workspace.withAtomicDirectoryPublish(target, async () => undefined))
      .rejects.toThrow('GREATER_REALM_PRIVATE_ALREADY_RUNNING');
    release();
    await expect(first).resolves.toBeUndefined();
    expect(workspace.readFile(`${target}/candidate.bin`)).toEqual(Buffer.from([1, 2, 3]));
  });

  it('retires a strict-prefix claim left before destination creation', () => {
    const { workspace } = fixture();
    const parent = workspace.ensureDirectory('batches');
    const destinationName = 'GR-B-CCCCCCCCCCCCCCCC';
    const claim = join(parent, publicationClaimName(destinationName));
    const expected = Buffer.from(
      `warpkeep-greater-realm-private-directory-claim-v1\n${destinationName}\n`,
      'utf8',
    );
    writeFileSync(claim, expected.subarray(0, 19), { mode: 0o600 });

    expect(workspace.recoverAtomicDirectoryPublish(
      `batches/${destinationName}`,
    )).toBe('absent');
    expect(existsSync(claim)).toBe(false);
    expect(existsSync(join(parent, destinationName))).toBe(false);
    expected.fill(0);
  });

  it('recognizes a committed publication and retires only its stale claim', async () => {
    const { workspace } = fixture();
    const destinationName = 'GR-B-BBBBBBBBBBBBBBBB';
    const relativePath = `batches/${destinationName}`;
    await workspace.withAtomicDirectoryPublish(relativePath, async staged => {
      staged.writeFileAtomic(`${relativePath}/candidate.bin`, Uint8Array.of(7, 8, 9));
    });
    const parent = join(workspace.root, 'batches');
    const destination = join(parent, destinationName);
    const claim = writePublicationClaim(parent, destinationName);

    expect(workspace.recoverAtomicDirectoryPublish(relativePath)).toBe('published');
    expect(existsSync(claim)).toBe(false);
    expect(existsSync(destination)).toBe(true);
    expect(workspace.readFile(`${relativePath}/candidate.bin`))
      .toEqual(Buffer.from([7, 8, 9]));
  });

  it('does not retire an unclaimed partial publication', () => {
    const { workspace } = fixture();
    const destination = workspace.ensureDirectory('batches/partial');
    writeFileSync(
      join(destination, '.wk-publish-envelope-v1'),
      'warpkeep-greater-realm-private-directory-envelope-v1\n',
      { mode: 0o600 },
    );

    expect(() => workspace.recoverAtomicDirectoryPublish('batches/partial'))
      .toThrow('GREATER_REALM_PRIVATE_PUBLICATION_INCOMPLETE');
    expect(existsSync(destination)).toBe(true);
  });
});
