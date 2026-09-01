import { describe, expect, it, vi } from 'vitest';

import {
  SEALED_REALMS_ACTIVATED_OPERATIONS,
  SEALED_REALMS_OPERATIONS,
  SealedRealmsProductionSourceAuthorityError,
  authenticateSealedRealmsProductionSourceAuthority,
  preparationSourceCommitFromSealedRealmsProductionAuthority,
  sourceCommitFromSealedRealmsProductionAuthority,
} from '../scripts/sealed-realms-production-source-authority.mjs';

const S = '1'.repeat(40);
const A = '2'.repeat(40);

function rawActivationDiff(entries: readonly string[]) {
  return Buffer.from(entries.join(''), 'utf8');
}

function gitFixture(options: Readonly<{
  head?: string;
  protectedMain?: string;
  parents?: readonly string[];
  diff?: Buffer;
}> = {}) {
  const calls: string[][] = [];
  const git = (arguments_: readonly string[]) => {
    calls.push([...arguments_]);
    if (arguments_.join('\0') === 'rev-parse\0--verify\0HEAD^{commit}') {
      return `${options.head ?? S}\n`;
    }
    if (arguments_.join('\0') === 'rev-parse\0--verify\0refs/remotes/origin/main^{commit}') {
      return `${options.protectedMain ?? S}\n`;
    }
    if (arguments_[0] === 'rev-parse' && arguments_[1] === '--verify') {
      const commit = arguments_[2]?.replace('^{commit}', '');
      if (commit === S || commit === A) return `${commit}\n`;
    }
    if (arguments_.join('|') === 'rev-list|--parents|-n|1|HEAD') {
      return `${options.head ?? S} ${(options.parents ?? [S]).join(' ')}\n`;
    }
    if (arguments_.includes('--raw')) {
      return options.diff ?? rawActivationDiff([
        `:100644 100644 ${'a'.repeat(40)} ${'b'.repeat(40)} M\0`,
        'config/releases/0.4.0-sealed-launch.json\0',
        `:100644 100644 ${'c'.repeat(40)} ${'d'.repeat(40)} M\0`,
        'package-lock.json\0',
        `:100644 100644 ${'e'.repeat(40)} ${'f'.repeat(40)} M\0`,
        'package.json\0',
      ]);
    }
    throw new Error(`unexpected git call ${arguments_.join(' ')}`);
  };
  return { git, calls };
}

function preparationBinding() {
  return Object.freeze({
    schemaVersion: 1,
    profile: 'warpkeep-0.4.0-sealed-launch-v1',
    pagesDeploymentApproved: false,
    preparationSourceCommit: S,
  });
}

function activatedBinding(commit?: string) {
  if (commit === S) return preparationBinding();
  return Object.freeze({
    schemaVersion: 1,
    profile: 'warpkeep-0.4.0-sealed-launch-v1',
    pagesDeploymentApproved: true,
    preparationSourceCommit: S,
  });
}

describe('sealed-realms production source authority', () => {
  it('authenticates S from fixed raw Git queries and a bounded Verify adapter', () => {
    const fixture = gitFixture();
    const verifyEvidence = vi.fn((commit: string) => ({ verifiedSha: commit }));

    const authority = authenticateSealedRealmsProductionSourceAuthority({
      operation: 'g002-publish-inspect',
      workflowInputSha: S,
      readGit: fixture.git,
      readBinding: preparationBinding,
      verifyEvidence,
    });

    expect(sourceCommitFromSealedRealmsProductionAuthority(authority)).toBe(S);
    expect(verifyEvidence).toHaveBeenCalledWith(S);
    expect(fixture.calls).toContainEqual([
      'rev-parse', '--verify', 'refs/remotes/origin/main^{commit}',
    ]);
    expect(SEALED_REALMS_OPERATIONS).toHaveLength(20);
  });

  it('requires an exact activated three-file regular diff and narrows A', () => {
    const fixture = gitFixture({ head: A, protectedMain: A, parents: [S] });
    const authority = authenticateSealedRealmsProductionSourceAuthority({
      operation: 'ptr-live-inspect',
      workflowInputSha: A,
      readGit: fixture.git,
      readBinding: activatedBinding,
      verifyEvidence: (commit: string) => ({ verifiedSha: commit }),
    });

    expect(sourceCommitFromSealedRealmsProductionAuthority(authority)).toBe(A);
    expect(preparationSourceCommitFromSealedRealmsProductionAuthority(authority)).toBe(S);
    expect(SEALED_REALMS_ACTIVATED_OPERATIONS).toEqual([
      'preflight', 'g001-current-state', 'g002-live-inspect', 'ptr-live-inspect',
    ]);
    expect(fixture.calls).toContainEqual([
      'diff-tree', '--no-commit-id', '--raw', '--no-renames', '-r', '-z', S, A,
    ]);
  });

  it('allows every exact S operation and only the four exact A operations', () => {
    for (const operation of SEALED_REALMS_OPERATIONS) {
      const authority = authenticateSealedRealmsProductionSourceAuthority({
        operation,
        workflowInputSha: S,
        readGit: gitFixture().git,
        readBinding: preparationBinding,
        verifyEvidence: commit => ({ verifiedSha: commit }),
      });
      expect(sourceCommitFromSealedRealmsProductionAuthority(authority)).toBe(S);
    }
    for (const operation of SEALED_REALMS_ACTIVATED_OPERATIONS) {
      const authority = authenticateSealedRealmsProductionSourceAuthority({
        operation,
        workflowInputSha: A,
        readGit: gitFixture({ head: A, protectedMain: A, parents: [S] }).git,
        readBinding: activatedBinding,
        verifyEvidence: commit => ({ verifiedSha: commit }),
      });
      expect(sourceCommitFromSealedRealmsProductionAuthority(authority)).toBe(A);
    }
    for (const operation of SEALED_REALMS_OPERATIONS.filter(
      value => !SEALED_REALMS_ACTIVATED_OPERATIONS.includes(value as never),
    )) {
      expect(() => authenticateSealedRealmsProductionSourceAuthority({
        operation: operation as never,
        workflowInputSha: A,
        readGit: gitFixture({ head: A, protectedMain: A, parents: [S] }).git,
        readBinding: activatedBinding,
        verifyEvidence: commit => ({ verifiedSha: commit }),
      })).toThrow('SEALED_REALMS_SOURCE_AUTHORITY_A_OPERATION_FORBIDDEN');
    }
    expect(() => authenticateSealedRealmsProductionSourceAuthority({
      operation: 'g002-live-inspect-now' as never,
      workflowInputSha: S,
      readGit: gitFixture().git,
      readBinding: preparationBinding,
      verifyEvidence: commit => ({ verifiedSha: commit }),
    })).toThrow('SEALED_REALMS_SOURCE_AUTHORITY_OPERATION_INVALID');
  });

  it.each([
    ['wrong protected remote', gitFixture({ protectedMain: A }), preparationBinding, 'g002-publish-inspect'],
    ['wrong Verify SHA', gitFixture(), preparationBinding, 'g002-publish-inspect'],
    ['S-only operation at A', gitFixture({ head: A, protectedMain: A, parents: [S] }), activatedBinding, 'g002-import-apply'],
  ])('fails closed for %s before a lane can run', (_label, fixture, binding, operation) => {
    const lane = vi.fn();
    const verifyEvidence = _label === 'wrong Verify SHA'
      ? () => ({ verifiedSha: A })
      : (commit: string) => ({ verifiedSha: commit });

    expect(() => authenticateSealedRealmsProductionSourceAuthority({
      operation,
      workflowInputSha: _label === 'S-only operation at A' ? A : S,
      readGit: fixture.git,
      readBinding: binding,
      verifyEvidence,
      lane,
    } as never)).toThrow(SealedRealmsProductionSourceAuthorityError);
    expect(lane).not.toHaveBeenCalled();
  });

  it('rejects rename, mode, and extra raw entries in an A diff', () => {
    const regular = (index: number, path: string, mode = '100644') => [
      `:${mode} 100644 ${String.fromCharCode(97 + index).repeat(40)} ${String.fromCharCode(98 + index).repeat(40)} M\0`,
      `${path}\0`,
    ];
    const invalidDiffs: ReadonlyArray<readonly [string, Buffer]> = [
      ['rename', rawActivationDiff([
        `:100644 100644 ${'a'.repeat(40)} ${'b'.repeat(40)} R100\0`,
        'config/releases/0.4.0-sealed-launch.previous.json\0',
        'config/releases/0.4.0-sealed-launch.json\0',
        ...regular(2, 'package-lock.json'),
        ...regular(4, 'package.json'),
      ])],
      ['mode', rawActivationDiff([
        ...regular(0, 'config/releases/0.4.0-sealed-launch.json', '100755'),
        ...regular(2, 'package-lock.json'),
        ...regular(4, 'package.json'),
      ])],
      ['extra', rawActivationDiff([
        ...regular(0, 'src/extra.ts'),
        ...regular(2, 'package-lock.json'),
        ...regular(4, 'package.json'),
      ])],
    ];
    for (const [_label, diff] of invalidDiffs) {
      const fixture = gitFixture({ head: A, protectedMain: A, parents: [S], diff });
      expect(() => authenticateSealedRealmsProductionSourceAuthority({
        operation: 'preflight',
        workflowInputSha: A,
        readGit: fixture.git,
        readBinding: activatedBinding,
        verifyEvidence: (commit: string) => ({ verifiedSha: commit }),
      })).toThrow(/SEALED_REALMS_SOURCE_AUTHORITY_/u);
    }
  });

  it('rejects a noncanonical preparation or activated binding shape', () => {
    const sourceFixture = gitFixture();
    const privateSentinel = '/private/forbidden/source-authority-secret';
    let sourceError: unknown;
    try {
      authenticateSealedRealmsProductionSourceAuthority({
        operation: 'preflight',
        workflowInputSha: S,
        readGit: sourceFixture.git,
        readBinding: () => ({ ...preparationBinding(), privatePath: privateSentinel }),
        verifyEvidence: (commit: string) => ({ verifiedSha: commit }),
      });
    } catch (error) {
      sourceError = error;
    }
    expect(sourceError).toMatchObject({
      code: 'SEALED_REALMS_SOURCE_AUTHORITY_BINDING_INVALID',
    });
    expect(JSON.stringify(sourceError)).not.toContain(privateSentinel);

    const activationFixture = gitFixture({ head: A, protectedMain: A, parents: [S] });
    expect(() => authenticateSealedRealmsProductionSourceAuthority({
      operation: 'preflight',
      workflowInputSha: A,
      readGit: activationFixture.git,
      readBinding: (commit?: string) => commit === S
        ? preparationBinding()
        : ({ ...activatedBinding(), branch: 'main' }),
      verifyEvidence: (commit: string) => ({ verifiedSha: commit }),
    })).toThrow('SEALED_REALMS_SOURCE_AUTHORITY_BINDING_INVALID');
  });

  it.each([
    ['wrong HEAD', gitFixture({ head: A, protectedMain: S }), preparationBinding, S, (commit: string) => ({ verifiedSha: commit })],
    ['wrong workflow input', gitFixture(), preparationBinding, A, (commit: string) => ({ verifiedSha: commit })],
    ['wrong preparation binding', gitFixture({ head: A, protectedMain: A, parents: [S] }), () => activatedBinding(A), A, (commit: string) => ({ verifiedSha: commit })],
    ['wrong preparation Verify', gitFixture({ head: A, protectedMain: A, parents: [S] }), activatedBinding, A, (commit: string) => ({ verifiedSha: commit === S ? A : commit })],
    ['merge parent', gitFixture({ head: A, protectedMain: A, parents: [S, '3'.repeat(40)] }), activatedBinding, A, (commit: string) => ({ verifiedSha: commit })],
  ])('rejects %s without producing an A authority', (
    _label,
    fixture,
    binding,
    workflowInputSha,
    verifyEvidence,
  ) => {
    expect(() => authenticateSealedRealmsProductionSourceAuthority({
      operation: 'preflight',
      workflowInputSha,
      readGit: fixture.git,
      readBinding: binding,
      verifyEvidence,
    })).toThrow(/SEALED_REALMS_SOURCE_AUTHORITY_/u);
  });
});
