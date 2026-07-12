import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

// The verifier is an executable JavaScript module with an exported test seam.
// @ts-expect-error TypeScript does not emit declarations for repository scripts.
import { verifyLicensePolicy } from '../scripts/verify-license-policy.mjs';

const LEGACY_0BSD = 'fixture historical 0BSD text\n';
const LEGACY_CC0 = 'fixture historical CC0 text\n';
const APACHE_2_0 = 'fixture canonical Apache-2.0 text\n';
const CC_BY_4_0 = 'fixture canonical CC-BY-4.0 text\n';
const CUTOVER_RECORD = 'docs/legal/v0.3.0-cutover.json';
const LEGACY_0BSD_PATH = 'licenses/legacy/LICENSE-0BSD-v0.2.0';
const LEGACY_CC0_PATH = 'licenses/legacy/LICENSE-CC0-1.0-v0.2.0';

function sha256(content: string) {
  return createHash('sha256').update(content).digest('hex');
}

const FIXTURE_HASHES = {
  legacy0Bsd: sha256(LEGACY_0BSD),
  legacyCc0: sha256(LEGACY_CC0),
  apache2: sha256(APACHE_2_0),
  ccBy4: sha256(CC_BY_4_0)
};

const temporaryRoots = new Set<string>();

afterEach(async () => {
  await Promise.all([...temporaryRoots].map((root) => rm(root, { force: true, recursive: true })));
  temporaryRoots.clear();
});

class LicenseFixtureRepository {
  private constructor(readonly root: string) {}

  static async create() {
    const root = await mkdtemp(join(tmpdir(), 'warpkeep-license-policy-'));
    temporaryRoots.add(root);
    const repository = new LicenseFixtureRepository(root);
    repository.git('init', '--initial-branch=main');
    repository.git('config', 'user.name', 'Warpkeep License Test');
    repository.git('config', 'user.email', 'license-test@warpkeep.invalid');

    await repository.writeJson('package.json', {
      name: 'warpkeep',
      private: true,
      version: '0.2.0',
      license: '0BSD'
    });
    await repository.writeJson('services/auth-bridge/package.json', {
      name: '@warpkeep/auth-bridge',
      private: true,
      version: '0.1.0'
    });
    await repository.writeJson('spacetimedb/package.json', {
      name: 'warpkeep-spacetimedb-module',
      private: true,
      version: '0.1.0'
    });
    await repository.write('LICENSE', LEGACY_0BSD);
    await repository.write('LICENSE-CC0', LEGACY_CC0);
    await repository.write(
      'LICENSING.md',
      [
        '# Licensing',
        '',
        'The future v0.3.0 policy uses Apache-2.0 and CC-BY-4.0.',
        '',
        'Historical 0BSD and CC0 grants are not revoked.',
        ''
      ].join('\n')
    );
    await repository.write('ASSETS-LICENSE.md', '# Asset licensing\n');
    await repository.write('CONTRIBUTING.md', '# Contributing\n');
    await repository.write('TRADEMARKS.md', '# Trademarks\n');
    await repository.write(
      'docs/legal/license-inventory.md',
      '# License inventory\n\nApache-2.0 and CC-BY-4.0 are the future active policies.\n'
    );
    await repository.write(
      'docs/legal/v0.3.0-license-cutover.md',
      '# v0.3.0 license cutover\n\nCommit A is followed by attestation Commit B.\n'
    );
    await repository.write(
      'README.md',
      '# Warpkeep\n\n[warpkeep.com](https://warpkeep.com/)\n\n## Architecture\n'
    );
    await repository.commit('prepare licensing policy');
    return repository;
  }

  git(...args: string[]) {
    return execFileSync('git', args, {
      cwd: this.root,
      encoding: 'utf8',
      env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_NO_REPLACE_OBJECTS: '1' },
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
  }

  async write(relativePath: string, content: string) {
    const path = join(this.root, relativePath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, 'utf8');
  }

  async writeJson(relativePath: string, value: unknown) {
    await this.write(relativePath, `${JSON.stringify(value, null, 2)}\n`);
  }

  async json(relativePath: string) {
    return JSON.parse(await readFile(join(this.root, relativePath), 'utf8')) as Record<string, unknown>;
  }

  async remove(relativePath: string) {
    await rm(join(this.root, relativePath), { force: true, recursive: true });
  }

  async symlink(relativePath: string, target: string) {
    const path = join(this.root, relativePath);
    await this.remove(relativePath);
    await mkdir(dirname(path), { recursive: true });
    await symlink(target, path);
  }

  async commit(message: string) {
    this.git('add', '--all');
    this.git('commit', '--no-gpg-sign', '--message', message);
    return this.git('rev-parse', 'HEAD');
  }

  async setRootVersion(version: unknown) {
    const manifest = await this.json('package.json');
    manifest.version = version;
    await this.writeJson('package.json', manifest);
  }

  async applyValidCutover(version = '0.3.0') {
    for (const manifestPath of [
      'package.json',
      'services/auth-bridge/package.json',
      'spacetimedb/package.json'
    ]) {
      const manifest = await this.json(manifestPath);
      manifest.license = 'Apache-2.0';
      if (manifestPath === 'package.json') manifest.version = version;
      await this.writeJson(manifestPath, manifest);
    }

    await this.write('LICENSE', APACHE_2_0);
    await this.write('LICENSE-CC-BY-4.0', CC_BY_4_0);
    await this.write(LEGACY_0BSD_PATH, LEGACY_0BSD);
    await this.write(LEGACY_CC0_PATH, LEGACY_CC0);
    await this.remove('LICENSE-CC0');
    await this.write('NOTICE', 'Warpkeep\nCopyright Warpkeep contributors\n');
    await this.write(
      'LICENSING.md',
      [
        '# Licensing',
        '',
        'Active software license: Apache-2.0',
        'Active project-owned creative-content license: CC-BY-4.0',
        '',
        `Historical texts: ${LEGACY_0BSD_PATH} and ${LEGACY_CC0_PATH}.`,
        'Historical 0BSD and CC0 grants are not revoked.',
        ''
      ].join('\n')
    );
    await this.write(
      'ASSETS-LICENSE.md',
      '# Asset licensing\n\nActive project-owned creative-content license: CC-BY-4.0\n'
    );
    await this.write(
      'CONTRIBUTING.md',
      [
        '# Contributing',
        '',
        'Active software license: Apache-2.0',
        'Active project-owned creative-content license: CC-BY-4.0',
        ''
      ].join('\n')
    );
    await this.write(
      'docs/legal/license-inventory.md',
      [
        '# License inventory',
        '',
        'Active policies: Apache-2.0 and CC-BY-4.0.',
        `Legacy paths: ${LEGACY_0BSD_PATH} and ${LEGACY_CC0_PATH}.`,
        ''
      ].join('\n')
    );
    await this.write(
      '.reuse/dep5',
      [
        'Format: https://www.debian.org/doc/packaging-manuals/copyright-format/1.0/',
        '',
        'Files: src/** scripts/** tests/**',
        'Copyright: Warpkeep contributors',
        'License: Apache-2.0',
        '',
        'Files: docs/**',
        'Copyright: Warpkeep contributors',
        'License: CC-BY-4.0',
        '',
        `Files: ${LEGACY_0BSD_PATH}`,
        'Copyright: Historical Warpkeep contributors',
        'License: 0BSD',
        '',
        `Files: ${LEGACY_CC0_PATH}`,
        'Copyright: Historical Warpkeep contributors',
        'License: CC0-1.0',
        ''
      ].join('\n')
    );
  }

  async attest(cutoverCommitSha: string, override?: unknown) {
    await this.writeJson(
      CUTOVER_RECORD,
      override ?? {
        schemaVersion: 1,
        cutoverVersion: '0.3.0',
        cutoverCommitSha
      }
    );
    return this.commit('attest v0.3.0 cutover');
  }

  verify() {
    return verifyLicensePolicy({
      repositoryRoot: this.root,
      expectedHashes: FIXTURE_HASHES
    });
  }
}

describe('license policy guard', () => {
  it('accepts the documented pre-v0.3.0 transition state', async () => {
    const repository = await LicenseFixtureRepository.create();
    await expect(repository.verify()).resolves.toMatchObject({
      state: 'preparation',
      version: '0.2.0'
    });
  });

  it.each([
    ['invalid version string', 'not-a-version'],
    ['missing patch version', '0.2'],
    ['NaN-like version', '0.NaN.0'],
    ['negative version', '-1.0.0'],
    ['trailing version garbage', '0.2.0junk']
  ])('fails closed for an %s', async (_label, version) => {
    const repository = await LicenseFixtureRepository.create();
    await repository.setRootVersion(version);
    await repository.commit(`set invalid version ${version}`);
    await expect(repository.verify()).rejects.toThrow(/complete valid SemVer/);
  });

  it('accepts a valid v0.3.0 prerelease/build only with a complete cutover', async () => {
    const repository = await LicenseFixtureRepository.create();
    await repository.applyValidCutover('0.3.0-rc.1+build.7');
    const cutover = await repository.commit('perform prerelease cutover');
    await repository.attest(cutover);
    await expect(repository.verify()).resolves.toMatchObject({
      state: 'cutover',
      version: '0.3.0-rc.1+build.7'
    });
  });

  it('rejects a pre-v0.3.0 repository with a premature cutover record', async () => {
    const repository = await LicenseFixtureRepository.create();
    await repository.writeJson(CUTOVER_RECORD, {
      schemaVersion: 1,
      cutoverVersion: '0.3.0',
      cutoverCommitSha: repository.git('rev-parse', 'HEAD')
    });
    await repository.commit('add premature record');
    await expect(repository.verify()).rejects.toThrow(/must not exist before/);
  });

  it('rejects a missing cutover record', async () => {
    const repository = await LicenseFixtureRepository.create();
    await repository.applyValidCutover();
    await repository.commit('perform cutover without attestation');
    await expect(repository.verify()).rejects.toThrow(/is required on or beyond/);
  });

  it('rejects a malformed cutover record', async () => {
    const repository = await LicenseFixtureRepository.create();
    await repository.applyValidCutover();
    await repository.commit('perform cutover');
    await repository.write(CUTOVER_RECORD, '{not-json\n');
    await repository.commit('add malformed attestation');
    await expect(repository.verify()).rejects.toThrow(/must contain valid JSON/);
  });

  it('rejects an invalid cutover SHA', async () => {
    const repository = await LicenseFixtureRepository.create();
    await repository.applyValidCutover();
    await repository.commit('perform cutover');
    await repository.attest('A'.repeat(40));
    await expect(repository.verify()).rejects.toThrow(/full lowercase commit SHA/);
  });

  it('rejects a nonexistent cutover commit', async () => {
    const repository = await LicenseFixtureRepository.create();
    await repository.applyValidCutover();
    await repository.commit('perform cutover');
    await repository.attest('0'.repeat(40));
    await expect(repository.verify()).rejects.toThrow(/does not exist in Git history/);
  });

  it('rejects a cutover commit that exists but is not an ancestor of HEAD', async () => {
    const repository = await LicenseFixtureRepository.create();
    repository.git('checkout', '--quiet', '-b', 'side-cutover');
    await repository.applyValidCutover();
    const sideCutover = await repository.commit('perform side cutover');

    repository.git('checkout', '--quiet', 'main');
    await repository.applyValidCutover();
    await repository.commit('perform main cutover');
    await repository.attest(sideCutover);
    await expect(repository.verify()).rejects.toThrow(/must be an ancestor/);
  });

  it('rejects a cutover commit with the wrong root license even when HEAD repairs it', async () => {
    const repository = await LicenseFixtureRepository.create();
    await repository.applyValidCutover();
    await repository.write('LICENSE', 'wrong license\n');
    const cutover = await repository.commit('perform cutover with wrong license');
    await repository.write('LICENSE', APACHE_2_0);
    await repository.attest(cutover);
    await expect(repository.verify()).rejects.toThrow(/exact Apache-2.0 text at the attested cutover/);
  });

  it('rejects incomplete package metadata at the cutover commit', async () => {
    const repository = await LicenseFixtureRepository.create();
    await repository.applyValidCutover();
    const moduleManifest = await repository.json('spacetimedb/package.json');
    delete moduleManifest.license;
    await repository.writeJson('spacetimedb/package.json', moduleManifest);
    const cutover = await repository.commit('perform cutover with incomplete package metadata');
    moduleManifest.license = 'Apache-2.0';
    await repository.writeJson('spacetimedb/package.json', moduleManifest);
    await repository.attest(cutover);
    await expect(repository.verify()).rejects.toThrow(/spacetimedb\/package.json must declare Apache-2.0/);
  });

  it('cannot skip a newline-containing package manifest during Git tree enumeration', async () => {
    const repository = await LicenseFixtureRepository.create();
    await repository.applyValidCutover();
    const unusualManifest = 'packages/newline\ncomponent/package.json';
    await repository.writeJson(unusualManifest, {
      name: '@warpkeep/newline-component',
      private: true,
      version: '0.1.0'
    });
    const cutover = await repository.commit('perform cutover with unusual incomplete manifest');
    const manifest = await repository.json(unusualManifest);
    manifest.license = 'Apache-2.0';
    await repository.writeJson(unusualManifest, manifest);
    await repository.attest(cutover);
    await expect(repository.verify()).rejects.toThrow(/must declare Apache-2.0 at the attested cutover/);
  });

  it('rejects a missing legacy license at the cutover commit', async () => {
    const repository = await LicenseFixtureRepository.create();
    await repository.applyValidCutover();
    await repository.remove(LEGACY_CC0_PATH);
    const cutover = await repository.commit('perform cutover without legacy CC0');
    await repository.write(LEGACY_CC0_PATH, LEGACY_CC0);
    await repository.attest(cutover);
    await expect(repository.verify()).rejects.toThrow(/required ordinary cutover file is missing.*legacy.*CC0/is);
  });

  it('rejects stale preparation documents at the cutover commit even when HEAD repairs them', async () => {
    const repository = await LicenseFixtureRepository.create();
    const staleLicensing = await readFile(join(repository.root, 'LICENSING.md'), 'utf8');
    await repository.applyValidCutover();
    await repository.write('LICENSING.md', staleLicensing);
    const cutover = await repository.commit('perform cutover with stale policy wording');
    await repository.applyValidCutover();
    await repository.attest(cutover);
    await expect(repository.verify()).rejects.toThrow(/LICENSING\.md must state the active v0\.3\.0 policy at the attested cutover/);
  });

  it('rejects a retained active root CC0 path at the cutover commit', async () => {
    const repository = await LicenseFixtureRepository.create();
    await repository.applyValidCutover();
    await repository.write('LICENSE-CC0', LEGACY_CC0);
    const cutover = await repository.commit('perform cutover with stale active CC0 path');
    await repository.remove('LICENSE-CC0');
    await repository.attest(cutover);
    await expect(repository.verify()).rejects.toThrow(/root LICENSE-CC0 path must not remain active at the attested cutover/);
  });

  it('rejects a premature cutover record in the cutover commit parent', async () => {
    const repository = await LicenseFixtureRepository.create();
    await repository.writeJson(CUTOVER_RECORD, {
      schemaVersion: 1,
      cutoverVersion: '0.3.0',
      cutoverCommitSha: '0'.repeat(40)
    });
    await repository.commit('add invalid premature cutover record');
    await repository.applyValidCutover();
    await repository.remove(CUTOVER_RECORD);
    const cutover = await repository.commit('perform cutover and remove premature record');
    await repository.attest(cutover);
    await expect(repository.verify()).rejects.toThrow(/parent must not contain a premature cutover record/);
  });

  it('rejects empty path-policy evidence at the cutover commit', async () => {
    const repository = await LicenseFixtureRepository.create();
    await repository.applyValidCutover();
    await repository.write('.reuse/dep5', '');
    const cutover = await repository.commit('perform cutover without path-policy evidence');
    await repository.applyValidCutover();
    await repository.attest(cutover);
    await expect(repository.verify()).rejects.toThrow(/\.reuse\/dep5 must not be empty at the attested cutover/);
  });

  it('rejects nonempty dep5 junk that only mentions the required identifiers', async () => {
    const repository = await LicenseFixtureRepository.create();
    await repository.applyValidCutover();
    await repository.write('.reuse/dep5', 'Apache-2.0 CC-BY-4.0 0BSD CC0-1.0\n');
    const cutover = await repository.commit('perform cutover with unstructured path-policy evidence');
    await repository.applyValidCutover();
    await repository.attest(cutover);
    await expect(repository.verify()).rejects.toThrow(/structured Files\/License mapping/);
  });

  it('rejects a symlink-mode required file at the cutover commit', async () => {
    const repository = await LicenseFixtureRepository.create();
    await repository.applyValidCutover();
    await repository.symlink('NOTICE', 'LICENSING.md');
    const cutover = await repository.commit('perform cutover with symlink notice');
    await repository.remove('NOTICE');
    await repository.write('NOTICE', 'Warpkeep\nCopyright Warpkeep contributors\n');
    await repository.attest(cutover);
    await expect(repository.verify()).rejects.toThrow(/required ordinary cutover file is missing.*NOTICE/is);
  });

  it('accepts a valid two-commit cutover and attestation', async () => {
    const repository = await LicenseFixtureRepository.create();
    await repository.applyValidCutover();
    const cutover = await repository.commit('perform complete v0.3.0 cutover');
    await repository.attest(cutover);
    await expect(repository.verify()).resolves.toMatchObject({
      state: 'cutover',
      version: '0.3.0'
    });
  });

  it('rejects current HEAD when it no longer preserves the attested invariants', async () => {
    const repository = await LicenseFixtureRepository.create();
    await repository.applyValidCutover();
    const cutover = await repository.commit('perform complete v0.3.0 cutover');
    await repository.attest(cutover);
    await repository.write('NOTICE', '');
    await repository.commit('break current notice');
    await expect(repository.verify()).rejects.toThrow(/NOTICE must not be empty at current HEAD/);
  });
});
