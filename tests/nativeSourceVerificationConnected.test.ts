// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createNativeConnectedModulePlan } from '../scripts/native-source-verification.mjs';
import {
  NATIVE_CONNECTED_MODULE_PROFILE, NATIVE_CONNECTED_SOURCE_INPUTS, NATIVE_CONNECTED_PREREQUISITES,
  deriveNativeConnectedModuleRecipe, nativeConnectedModuleCommands,
  type NativeConnectedModuleRecipe, type NativeConnectedModuleTools,
} from '../scripts/native-source-verification-connected.mjs';

const repository = process.cwd();
const inputBytes = Object.fromEntries(Object.keys(NATIVE_CONNECTED_SOURCE_INPUTS)
  .map(path => [path, readFileSync(join(repository, path))]));
const inventory = Object.keys(inputBytes);
const root = '/reviewed/repository', stem = root + '/artifacts/qa/connected-check';
const tools: NativeConnectedModuleTools = { node: { path: '/attested/node' },
  spacetime: { path: '/attested/spacetime' }, typescript: { path: '/attested/typescript/bin/tsc' },
  tsx: { path: '/attested/tsx/dist/cli.mjs' } };
const recipe = () => deriveNativeConnectedModuleRecipe(inventory, inputBytes);
const commands = () => nativeConnectedModuleCommands(root, recipe(), tools, stem);
function moduleConfigs(folder: string): string[] {
  return readdirSync(join(repository, folder), { withFileTypes: true }).flatMap(entry => {
    if (['node_modules', 'dist', '.git', 'src', 'tests'].includes(entry.name)) return [];
    const path = folder + '/' + entry.name;
    return entry.isDirectory() ? moduleConfigs(path)
      : ['package.json', 'tsconfig.json'].includes(entry.name) ? [path] : [];
  });
}

const expectedOrder = ['module-types', 'module-build', 'genesis002-types', 'genesis002-build',
  'ptr-types', 'ptr-build', 'module-bindings', 'genesis002-private-loopback', 'fixture-v14-build',
  'fixture-v15-build', 'fixture-v16-build', 'fixture-v17-build', 'fixture-current-inspection-build',
  'worker-migration-static', 'access-request-migration-static', 'admission-cas-rehearsal',
  'additive-migration-rehearsal', 'greater-realm-connected-import',
  'greater-realm-connected-relocation', 'greater-realm-connected-active-population'];

describe('fixed native connected module source contract', () => {
  it('binds every current module/fixture config and fixed caller, keeping separate pure tests and authority limits', () => {
    const value = recipe();
    expect(value.profile).toBe(NATIVE_CONNECTED_MODULE_PROFILE);
    expect(value.moduleRoots).toEqual(['spacetimedb', 'spacetimedb/genesis002', 'spacetimedb/ptr']);
    expect(value.migrationFixtureRoots).toHaveLength(18);
    expect(value.buildFixtureRoots).toEqual(['additive-v14-schema', 'additive-v15-schema',
      'additive-v16-schema', 'additive-v17-schema', 'current-candidate-inspection']
      .map(path => 'spacetimedb/migration-fixtures/' + path));
    expect(inventory).toHaveLength(56);
    expect(inventory.filter(path => /^spacetimedb\/(?:.+\/)?(?:package|tsconfig)\.json$/u.test(path)).sort())
      .toEqual(moduleConfigs('spacetimedb').sort());
    expect(value.scriptPaths).toHaveLength(9);
    expect(value.modulePureTests).toBe('separate-source-test-partition');
    expect(value.completeCoverage).toBe(false); expect(value.productionAuthorized).toBe(false);
    expect(Object.isFrozen(value)).toBe(true); expect(Object.isFrozen(value.moduleRoots)).toBe(true);
  });
  it('accepts exact actual byte inputs without depending on Buffer-only string conversion', () => {
    for (const convert of [(body: Buffer) => body, (body: Buffer) => new Uint8Array(body),
      (body: Buffer) => body.toString('utf8')]) {
      expect(deriveNativeConnectedModuleRecipe(inventory,
        Object.fromEntries(Object.entries(inputBytes).map(([path, body]) => [path, convert(body)]))))
        .toEqual(recipe());
    }
  });
  it.each(Object.keys(NATIVE_CONNECTED_SOURCE_INPUTS))('refuses changed actual source input %s', path => {
    expect(() => deriveNativeConnectedModuleRecipe(inventory, { ...inputBytes,
      [path]: Buffer.concat([inputBytes[path], Buffer.from('\n')]) })).toThrow('SOURCE_RECIPE_CHANGED');
  });
  it('requires all source files and exact input keys, refusing malformed or caller recipe data', () => {
    const path = 'spacetimedb/ptr/pnpm-lock.yaml';
    expect(() => deriveNativeConnectedModuleRecipe(inventory.filter(value => value !== path), inputBytes))
      .toThrow('SOURCE_RECIPE_CHANGED');
    const missing = { ...inputBytes }; delete missing[path];
    expect(() => deriveNativeConnectedModuleRecipe(inventory, missing)).toThrow('SOURCE_INPUTS_INVALID');
    expect(() => deriveNativeConnectedModuleRecipe(inventory, { ...inputBytes, 'caller-recipe.json': Buffer.from('{}') }))
      .toThrow('SOURCE_INPUTS_INVALID');
    expect(() => deriveNativeConnectedModuleRecipe(inventory, { ...inputBytes, [path]: 3 } as unknown as typeof inputBytes))
      .toThrow('SOURCE_RECIPE_CHANGED');
    const accessor = { ...inputBytes }; Object.defineProperty(accessor, path, { get() { throw Error('must not invoke'); } });
    expect(() => deriveNativeConnectedModuleRecipe(inventory, accessor)).toThrow('SOURCE_INPUTS_INVALID');
  });
  it.each(['spacetimedb/new-module/package.json', 'spacetimedb/migration-fixtures/new/tsconfig.json',
    'scripts/verify-greater-realm-connected-new.ts', 'scripts/verify-greater-realm-connected-new.tsx'])
  ('refuses an unreviewed module/caller namespace %s', path => {
    expect(() => deriveNativeConnectedModuleRecipe([...inventory, path], inputBytes)).toThrow('MODULE_NAMESPACE_CHANGED');
  });
  it.each(['', '../outside', '/absolute', 'spacetimedb/../other/package.json',
    'spacetimedb\\ptr\\package.json', 'spacetimedb/line\n/package.json'])
  ('rejects noncanonical inventory input %s', path => {
    expect(() => deriveNativeConnectedModuleRecipe([...inventory, path], inputBytes)).toThrow('INVENTORY_INVALID');
  });
  it('refuses duplicates, omitted leaves, environment selectors and invented coverage claims', () => {
    expect(() => deriveNativeConnectedModuleRecipe([...inventory, inventory[0]], inputBytes)).toThrow('INVENTORY_INVALID');
    for (const changed of [{ ...recipe(), buildFixtureRoots: [] }, { ...recipe(), scriptPaths: recipe().scriptPaths.slice(1) },
      { ...recipe(), productionAuthorized: true }, { ...recipe(), environment: { CLOUDFLARE_API_TOKEN: 'unaccepted' } }]) {
      expect(() => nativeConnectedModuleCommands(root, changed as NativeConnectedModuleRecipe, tools, stem))
        .toThrow('RECIPE_CHANGED');
    }
  });
});

describe('direct connected leaves and genuine observation requirements', () => {
  it('retains all twenty existing continuation leaves in exact order without an aggregate verifier or test counts', () => {
    const value = commands();
    expect(value.map(command => command.id)).toEqual(expectedOrder);
    expect(value).toHaveLength(20);
    expect(new Set(value.map(command => command.reportPath)).size).toBe(20);
    for (const command of value) {
      expect(command.kind).toBe('terminal-check'); expect(command.files).toEqual([]);
      expect(command.environment).toEqual({ SPACETIME_BIN: tools.spacetime.path });
      expect(command.outputContract.assertionCounts).toBe(false);
      expect(command.outputContract.terminalAndCleanupRequired).toBe(true);
      expect(command.args).not.toContain('verify'); expect(command.args).not.toContain('install');
      expect(command.args).not.toContain('publish'); expect(command.args).not.toContain('--preflight-101');
      expect(Number.isSafeInteger(command.deadlineMs)).toBe(true); expect(command.deadlineMs).toBeGreaterThan(0);
      expect(Object.isFrozen(command)).toBe(true); expect(Object.isFrozen(command.args)).toBe(true);
    }
  });
  it('uses attested TypeScript directly for the three exact declared no-emit checks', () => {
    const typed = commands().filter(command => command.id.endsWith('-types'));
    expect(typed).toHaveLength(3);
    expect(typed.map(command => command.cwd)).toEqual(recipe().moduleRoots.map(path => root + '/' + path));
    for (const command of typed) {
      const metadata = JSON.parse(inputBytes[command.sourcePackagePath!].toString('utf8'));
      expect(metadata.scripts.typecheck).toBe('tsc --noEmit');
      expect(command.executable).toBe(tools.node.path); expect(command.args).toEqual([tools.typescript.path, '--noEmit']);
    }
  });
  it('builds exactly three modules and five explicit fixtures with the attested CLI and fixed output paths', () => {
    const builds = commands().filter(command => command.buildOutput);
    expect(builds).toHaveLength(8);
    expect(builds.map(command => command.moduleRoot)).toEqual([...recipe().moduleRoots, ...recipe().buildFixtureRoots]);
    for (const command of builds) {
      expect(command.executable).toBe(tools.spacetime.path);
      expect(command.args).toEqual(['build', '--module-path', root + '/' + command.moduleRoot]);
      expect(command.buildOutput).toEqual({ path: root + '/' + command.moduleRoot + '/dist/bundle.js', maximumBytes: 16 * 1024 * 1024 });
    }
  });
  it('selects exact existing binding/private/migration/connected callers, adding tsx only for their four TS entries', () => {
    const scripts = commands().filter(command => command.sourcePath);
    expect(scripts).toHaveLength(9);
    expect(scripts.map(command => command.sourcePath).sort()).toEqual([...recipe().scriptPaths].sort());
    const metadata = JSON.parse(inputBytes['package.json'].toString('utf8'));
    const workflow = readFileSync(join(repository, '.github/workflows/verify.yml'), 'utf8');
    for (const command of scripts) {
      const prefix = command.sourcePath!.endsWith('.ts') ? 'tsx' : 'node';
      expect(metadata.scripts[command.sourceScript!]).toBe(prefix + ' ' + command.sourcePath);
      expect(workflow).toContain(command.sourceScript);
      expect(command.executable).toBe(tools.node.path);
      expect(command.args).toEqual([...(prefix === 'tsx' ? [tools.tsx.path] : []), root + '/' + command.sourcePath]);
      expect(command.sourceSha256).toBe(NATIVE_CONNECTED_SOURCE_INPUTS[command.sourcePath!]);
    }
    expect(scripts.filter(command => command.args[0] === tools.tsx.path)).toHaveLength(4);
    // This caller compares temporary generated bindings; it never uses the committed-binding generator.
    expect(scripts.find(command => command.id === 'module-bindings')!.sourcePath).toBe('scripts/verify-spacetime-bindings.mjs');
  });
  it('requires the actual structured G002 receipt plus detached server and CLI group evidence', () => {
    const command = commands().find(value => value.id === 'genesis002-private-loopback')!;
    expect(command.ownership.separateGroupEvidenceRequired).toBe(true);
    expect(command.outputContract).toMatchObject({ kind: 'genesis002-loopback-json', schemaVersion: 1,
      profile: 'warpkeep-genesis-002-private-loopback-v1', tableCount: 23, procedureCount: 2 });
    const source = inputBytes[command.sourcePath!].toString('utf8');
    expect(source).toContain('detached: true');
    const tableBody = source.split('GENESIS_002_PRIVATE_LOOPBACK_TABLES = Object.freeze([')[1].split('] as const)')[0];
    expect(tableBody.match(/^\s+'[^']+',/gmu)).toHaveLength(command.outputContract.tableCount!);
    const procedureBody = source.split('GENESIS_002_PRIVATE_LOOPBACK_PROCEDURES = Object.freeze([')[1].split('] as const)')[0];
    expect(procedureBody.match(/Object\.freeze\(\{ name:/gu)).toHaveLength(command.outputContract.procedureCount!);
    expect(command.outputContract.requiredTrueFields).toHaveLength(9);
    for (const field of command.outputContract.requiredTrueFields!) expect(source).toContain(field + ': true');
    expect(NATIVE_CONNECTED_PREREQUISITES.detachedLoopbackGroupEvidenceRequired).toBe(true);
  });
  it('keeps the existing additive text receipt parser and real connected ceilings instead of substituting a preflight', () => {
    const byId = Object.fromEntries(commands().map(command => [command.id, command]));
    expect(byId['additive-migration-rehearsal'].outputContract).toMatchObject({ kind: 'additive-protocol-v18-receipt',
      parserSourcePath: 'scripts/spacetime-additive-migration-proof.mjs' });
    expect(inputBytes['scripts/spacetime-additive-migration-proof.mjs'].toString('utf8'))
      .toContain('ADDITIVE_MIGRATION_PROOF_PROTOCOL_VERSION = 18');
    expect(byId['admission-cas-rehearsal'].deadlineMs).toBe(360_000);
    expect(byId['additive-migration-rehearsal'].deadlineMs).toBe(3_600_000);
    expect(byId['greater-realm-connected-import'].deadlineMs).toBe(540_000);
    expect(byId['greater-realm-connected-relocation'].deadlineMs).toBe(1_260_000);
    expect(byId['greater-realm-connected-active-population'].deadlineMs).toBe(1_560_000);
    expect(byId['greater-realm-connected-active-population'].args).toHaveLength(2);
  });
  it('declares fixed actual prerequisites without guessing installed binary hashes or granting missing tool waivers', () => {
    const value = NATIVE_CONNECTED_PREREQUISITES;
    expect(value.requiredSourceInputs).toEqual(Object.keys(NATIVE_CONNECTED_SOURCE_INPUTS));
    expect(value.requiredAbsentPaths).toEqual(['spacetimedb/ptr/node_modules']);
    expect(value.standaloneBinaryRequired).toBe(true); expect(value.spacetimeCliVersion).toBe('2.6.1');
    expect(value.forbiddenBinBasenames).toEqual(['node', 'node.exe', 'spacetime', 'spacetime.exe']);
    expect(value.installedInputs.map(tool => [tool.dependency, tool.expectedVersion])).toEqual([
      ['typescript', '5.6.3'], ['tsx', '4.23.0'], ['esbuild', '0.25.12'], ['spacetimedb', '2.6.1']]);
    for (const tool of value.installedInputs) {
      const metadata = JSON.parse(inputBytes[tool.sourcePackagePath].toString('utf8'));
      expect(metadata.dependencies?.[tool.dependency] ?? metadata.devDependencies?.[tool.dependency]).toBe(tool.expectedVersion);
    }
    const rootTsx = value.installedInputs.find(tool => tool.dependency === 'tsx')!;
    expect(rootTsx).toEqual({ dependency: 'tsx', expectedVersion: '4.23.0', sourcePackagePath: 'package.json',
      packagePath: 'node_modules/tsx/package.json', entryPath: 'node_modules/tsx/dist/cli.mjs' });
    // Root npm aliases resolve root tsx; the separate module pure tests retain module tsx 4.20.6.
    expect(JSON.parse(inputBytes['spacetimedb/package.json'].toString('utf8')).devDependencies.tsx).toBe('4.20.6');
    expect(value.completeCoverage).toBe(false); expect(value.productionAuthorized).toBe(false);
  });
  it.each(['relative', '/', '/reviewed/../outside', '/reviewed\\repository', '/reviewed/line\n'])
  ('rejects invalid command root %s', invalid => {
    expect(() => nativeConnectedModuleCommands(invalid, recipe(), tools, stem)).toThrow('COMMAND_ROOT_INVALID');
  });
  it.each(['/outside/artifacts/qa/stem', root + '/artifacts/qa/sub/stem', root + '/artifacts/qa/../stem',
    root + '/artifacts/qa/line\n'])('rejects a report stem outside the direct private QA owner %s', invalid => {
    expect(() => nativeConnectedModuleCommands(root, recipe(), tools, invalid)).toThrow('COMMAND_ROOT_INVALID');
  });
  it.each(['relative', '/attested/../node', '/attested\\node', '/attested/line\n'])
  ('rejects noncanonical attested tool path %s', invalid => {
    expect(() => nativeConnectedModuleCommands(root, recipe(), { ...tools, node: { path: invalid } }, stem))
      .toThrow('TOOL_INPUTS_INVALID');
  });
  it('rejects arbitrary executable recipes, inherited selectors and credential/environment injection before any command exists', () => {
    for (const changed of [{ ...tools, environment: { GH_TOKEN: 'unaccepted' } },
      { ...tools, node: { ...tools.node, environment: { NODE_OPTIONS: '--import outside' } } },
      { ...tools, node: { ...tools.node, args: ['outside'] } }, { ...tools, shell: true },
      Object.create(tools)]) {
      expect(() => nativeConnectedModuleCommands(root, recipe(), changed as NativeConnectedModuleTools, stem))
        .toThrow('TOOL_INPUTS_INVALID');
    }
    const changed = { ...tools }; Object.defineProperty(changed, 'node', { get() { throw Error('must not invoke'); } });
    expect(() => nativeConnectedModuleCommands(root, recipe(), changed, stem)).toThrow('TOOL_INPUTS_INVALID');
  });
});

describe('maintained connected planning CLI boundary', () => {
  it('exports the real planning entry and advertises connected planning without claiming execution', () => {
    expect(typeof createNativeConnectedModulePlan).toBe('function');
    const result = spawnSync(process.execPath, [join(repository, 'scripts/verify-native-source.mjs'), '--help'],
      { cwd: repository, env: {}, shell: false, timeout: 5_000, maxBuffer: 16 * 1024, encoding: 'utf8' });
    expect(result.error).toBeUndefined(); expect(result.status).toBe(0); expect(result.signal).toBeNull();
    expect(result.stderr).toBe(''); expect(result.stdout).toContain('--plan-connected');
    expect(result.stdout).toContain('no release authority');
    // Imported planning is intentionally not invoked: it requires the actual signed native host/source/tool capture.
    // This fixture does not grant containment, connected execution, CI or a source-authority receipt.
  });
});
