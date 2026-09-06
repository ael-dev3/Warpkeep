// @vitest-environment node

import { chmodSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  buildSealedRealmsProductionBundles,
  createSealedRealmsProductionBundleBuildCapability,
} from '../scripts/build-sealed-realms-production-bundles.mjs';
import type { SealedRealmsProductionBundleLane } from
  '../scripts/build-sealed-realms-production-bundles.mjs';
import {
  createSealedRealmsProductionPrivateState,
} from '../scripts/sealed-realms-production-private-state.mjs';

const NODE_ATTESTATION = {
  path: '/private/var/db/warpkeep/runtime/node-v22.22.3-darwin-arm64/bin/node',
  version: 'v22.22.3',
  sha256: '5d9d3872911e2340a43b707962e68143de8a4e8d54628845c0c4f2de1fb7cd5c',
  teamId: 'HX7739G8FX',
} as const;
const GRAPH_COUNTS = { activation: 14, g001: 12, g002: 131, ptr: 131 } as const;
const ENTRY_PATHS = {
  activation: 'scripts/sealed-realms-production-activation-workflow-entry.mjs',
  g001: 'scripts/sealed-realms-production-g001-workflow-entry.mjs',
  g002: 'scripts/sealed-realms-production-g002-workflow-entry.mjs',
  ptr: 'scripts/sealed-realms-production-ptr-workflow-entry.mjs',
} as const;
const PRIVATE_WORKFLOW_MEMBERS = [
  'scripts/sealed-realms-production-workflow-evidence.mjs',
  'scripts/sealed-realms-production-workflow-private-state.mjs',
] as const;
const EXPORT_NAMES = {
  activation: [
    'createSealedRealmsProductionActivationWorkflowRuntime',
    'runSealedRealmsProductionActivationOperation',
  ],
  g001: [
    'createSealedRealmsProductionG001WorkflowRuntime',
    'runSealedRealmsProductionG001Operation',
  ],
  g002: [
    'createSealedRealmsProductionG002WorkflowRuntime',
    'runSealedRealmsProductionG002Operation',
  ],
  ptr: [
    'createSealedRealmsProductionPtrWorkflowRuntime',
    'runSealedRealmsProductionPtrOperation',
  ],
} as const;
const BASENAMES = {
  activation: 'sealed-realms-production-activation-lane.bundle.mjs',
  g001: 'sealed-realms-production-g001-lane.bundle.mjs',
  g002: 'sealed-realms-production-g002-lane.bundle.mjs',
  ptr: 'sealed-realms-production-ptr-lane.bundle.mjs',
} as const;

function buildCapability() {
  return createSealedRealmsProductionBundleBuildCapability({
    attest: () => ({
      profile: 'warpkeep-sealed-realms-pinned-esbuild-v1',
      node: NODE_ATTESTATION,
      tool: 'esbuild',
      version: '0.28.1',
    }),
  });
}

function fixture(testOnlyFsync: (path: string) => void = () => {}) {
  const home = mkdtempSync(join(tmpdir(), 'warpkeep-sealed-bundle-'));
  for (const root of [
    join(home, 'Library', 'Application Support', 'Warpkeep', 'operations', 'audit', 'private'),
    join(home, 'Library', 'Application Support', 'Warpkeep', 'operations', 'runtime'),
    join(home, 'Library', 'Application Support', 'Warpkeep', 'operations', 'cache'),
  ]) {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    chmodSync(root, 0o700);
  }
  return {
    state: createSealedRealmsProductionPrivateState({
      reportedHome: home,
      testOnlyOwnerUid: statSync(home).uid,
      testOnlyFsync,
      testOnlyAllowPlatformMode: true,
    }),
    cleanup: () => rmSync(home, { recursive: true, force: true }),
  };
}

describe('sealed-realms production bundles', () => {
  it('builds four functional deterministic node-only workflow graphs before one family publication', async () => {
    const local = fixture();
    const loadHook = vi.fn(async (request: Parameters<Parameters<
      typeof buildSealedRealmsProductionBundles
    >[0]['loadHook']>[0]) => {
      const module = await import(`data:text/javascript;base64,${Buffer.from(request.bytes).toString('base64')}`);
      expect(Object.keys(module).sort()).toEqual(request.exportNames);
      expect(request.exportNames).toEqual(EXPORT_NAMES[request.lane]);
      const factory = module[request.factoryExport];
      expect(typeof factory).toBe('function');
      await expect(factory({})).rejects.toThrow(request.factoryFailureCode);
      expect(request.graphManifest).toHaveLength(GRAPH_COUNTS[request.lane]);
      expect(request.graphManifest.some(member => member.path === ENTRY_PATHS[request.lane])).toBe(true);
      for (const path of PRIVATE_WORKFLOW_MEMBERS) {
        expect(request.graphManifest.some(member => member.path === path)).toBe(true);
      }
      if (request.lane === 'g002' || request.lane === 'ptr') {
        expect(request.graphManifest.some(member => (
          member.path.endsWith('production-publisher-cli.ts')
        ))).toBe(false);
      }
      const runExport = request.exportNames.find(name => name.startsWith('run'))!;
      expect(typeof module[runExport]).toBe('function');
      await expect(module[runExport]({})).rejects.toMatchObject({
        code: expect.stringMatching(/WORKFLOW_(?:INPUT|RUNTIME)_INVALID$/u),
      });
      return {
        node: NODE_ATTESTATION,
        lane: request.lane,
        byteDigest: request.byteDigest,
        sourceClosureDigest: request.sourceClosureDigest,
        loaded: true as const,
        byteLength: request.bytes.byteLength,
        exportNames: request.exportNames,
        factoryExport: request.factoryExport,
        factoryKind: 'function' as const,
        factoryFailureCode: request.factoryFailureCode,
      };
    });
    try {
      const result = await buildSealedRealmsProductionBundles({
        privateState: local.state,
        buildCapability: buildCapability(),
        loadHook,
      });

      expect(result).toEqual({ lanes: ['activation', 'g001', 'g002', 'ptr'] });
      expect(local.state.list({ root: 'cache', relativeDirectory: 'bundles' }))
        .toEqual(Object.values(BASENAMES).sort());
      expect(loadHook).toHaveBeenCalledTimes(4);
      let observedLegitimateRegex = false;
      for (const lane of ['activation', 'g001', 'g002', 'ptr'] as const satisfies readonly SealedRealmsProductionBundleLane[]) {
        const bytes = local.state.read({ root: 'cache', relativePath: `bundles/${BASENAMES[lane]}` });
        const source = bytes.toString('utf8');
        expect(source.length).toBeGreaterThan(1_000);
        expect(source).not.toContain('sourceMappingURL');
        expect(source).not.toContain('process.argv');
        expect(source).not.toContain('import.meta.url');
        expect(source).not.toContain(process.cwd());
        expect(source).not.toContain(process.cwd().replaceAll('\\', '/'));
        for (const forbidden of ['/Applications/ChatGPT.app/', '/Library/Developer/',
          '/Library/LaunchAgents/', '/bin/launchctl', '/bin/ps', '/bin/sh', '/dev/null',
          '/private/var/', '/usr/bin/env', '/usr/bin/git', '/usr/local/bin/git',
          '/opt/homebrew/bin/git', 'file:///']) expect(source).not.toContain(forbidden);
        observedLegitimateRegex ||= source.includes("replace(/'/g");
        bytes.fill(0);
      }
      expect(observedLegitimateRegex).toBe(true);
    } finally {
      local.cleanup();
    }
  });

  it('does not publish any lane when the fourth functional Node 22 attestation fails', async () => {
    const local = fixture();
    const loadHook = vi.fn(async ({ lane, bytes, byteDigest, sourceClosureDigest,
      exportNames, factoryExport, factoryFailureCode }) => {
      if (lane === 'ptr') throw new Error('fourth lane unavailable');
      return {
        node: NODE_ATTESTATION,
        lane,
        byteDigest,
        sourceClosureDigest,
        loaded: true as const,
        byteLength: bytes.byteLength,
        exportNames,
        factoryExport,
        factoryKind: 'function' as const,
        factoryFailureCode,
      };
    });
    try {
      await expect(buildSealedRealmsProductionBundles({
        privateState: local.state,
        buildCapability: buildCapability(),
        loadHook,
      })).rejects.toMatchObject({
        code: 'SEALED_REALMS_BUNDLES_LOAD_HOOK_INVALID',
      });
      expect(loadHook).toHaveBeenCalledTimes(4);
      expect(local.state.list({ root: 'cache', relativeDirectory: 'bundles' })).toEqual([]);
    } finally {
      local.cleanup();
    }
  });

  it('rejects an unbound loaded flag instead of treating it as a Node 22 attestation', async () => {
    const local = fixture();
    try {
      await expect(buildSealedRealmsProductionBundles({
        privateState: local.state,
        buildCapability: buildCapability(),
        loadHook: (async () => ({ loaded: true })) as never,
      })).rejects.toMatchObject({
        code: 'SEALED_REALMS_BUNDLES_LOAD_HOOK_INVALID',
      });
      expect(local.state.list({ root: 'cache', relativeDirectory: 'bundles' })).toEqual([]);
    } finally {
      local.cleanup();
    }
  });

  it('publishes no final family when the fourth staged member fsync fails', async () => {
    const local = fixture(path => {
      if (path.includes('bundles.stage.')) throw new Error('staged family fsync failed');
    });
    const loadHook = async (request: Parameters<Parameters<
      typeof buildSealedRealmsProductionBundles
    >[0]['loadHook']>[0]) => ({
      node: NODE_ATTESTATION, lane: request.lane, byteDigest: request.byteDigest,
      sourceClosureDigest: request.sourceClosureDigest, loaded: true as const,
      byteLength: request.bytes.byteLength, exportNames: request.exportNames,
      factoryExport: request.factoryExport, factoryKind: 'function' as const,
      factoryFailureCode: request.factoryFailureCode,
    });
    try {
      await expect(buildSealedRealmsProductionBundles({
        privateState: local.state, buildCapability: buildCapability(), loadHook,
      })).rejects.toMatchObject({ code: 'SEALED_REALMS_BUNDLES_EMIT_FAILED' });
      expect(local.state.list({ root: 'cache', relativeDirectory: 'bundles' })).toEqual([]);
    } finally { local.cleanup(); }
  });

  it('allows exactly one complete family under concurrent publication', async () => {
    const local = fixture();
    const loadHook = async (request: Parameters<Parameters<
      typeof buildSealedRealmsProductionBundles
    >[0]['loadHook']>[0]) => ({
      node: NODE_ATTESTATION, lane: request.lane, byteDigest: request.byteDigest,
      sourceClosureDigest: request.sourceClosureDigest, loaded: true as const,
      byteLength: request.bytes.byteLength, exportNames: request.exportNames,
      factoryExport: request.factoryExport, factoryKind: 'function' as const,
      factoryFailureCode: request.factoryFailureCode,
    });
    try {
      const results = await Promise.allSettled([1, 2].map(() => buildSealedRealmsProductionBundles({
        privateState: local.state, buildCapability: buildCapability(), loadHook,
      })));
      expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
      expect(local.state.list({ root: 'cache', relativeDirectory: 'bundles' }))
        .toEqual(Object.values(BASENAMES).sort());
    } finally { local.cleanup(); }
  });
});
