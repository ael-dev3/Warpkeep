import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const handoff = readFileSync(
  resolve(process.cwd(), 'docs/evidence/0.4.0/desktop-handoff.md'),
  'utf8',
);

describe('credential-free workspace handoff', () => {
  it('keeps reproducible source, setup and evidence routes visible', () => {
    expect(handoff).toContain('codex/prepared-keep-bindings-fix');
    expect(handoff).toContain('npm ci');
    expect(handoff).toContain('/dev/keep04-qa.html?scenario=all-six-level-five&quality=high');
    expect(handoff).toContain('[`integration.md`](integration.md)');
    expect(handoff).toContain('[`release-freeze.md`](release-freeze.md)');
    expect(handoff).toContain('[`recovery.md`](recovery.md)');
  });

  it('keeps every documented focused Keep04 test path real', () => {
    const focused = [
      'tests/Keep04Screen.test.tsx', 'tests/Keep04Benefits.test.tsx',
      'tests/Keep04PlacementUi.test.tsx', 'tests/Keep04Accessibility.test.tsx',
      'tests/Keep04SceneHost.test.tsx', 'tests/keep04Scene.test.ts',
      'tests/keep04VisualProfile.test.ts', 'tests/keep04Buildings.test.ts',
    ];
    for (const file of focused) {
      expect(handoff).toContain(file);
      expect(existsSync(resolve(process.cwd(), file))).toBe(true);
    }
  });

  it('documents sensitive package exclusions and the unreleased boundary', () => {
    expect(handoff).toContain('provider tokens');
    expect(handoff).toContain('player rows');
    expect(handoff).toContain('interim development handoff');
    expect(handoff).toMatch(/does not\s+connect an owner/);
    expect(handoff).toContain('physical-device measurements');
  });

  it('keeps routine delivery out of the Desktop and bounded to the workspace', () => {
    const workflow = readFileSync(
      resolve(process.cwd(), 'docs/engineering/development-workflow.md'),
      'utf8',
    );
    expect(handoff).toContain('Do not create a new Desktop folder, handoff copy, backup or ZIP.');
    expect(handoff).toContain('artifacts/delivery/0.4.0/');
    expect(workflow).toMatch(/Older\s+plans that require a Desktop package or private Desktop census are superseded\./u);
    expect(workflow).toContain('Do not use blanket');
    expect(workflow).toContain('age-based recursive deletion or a global cache purge.');
  });

  it('keeps current workflows free of Desktop and cloud-sync output paths', () => {
    const workflowPaths = [
      '.github/workflows/verify.yml',
      '.github/workflows/deploy-pages.yml',
      '.github/workflows/notification-bridge-prepared-linux.yml',
      '.github/workflows/sealed-realms-production.yml',
    ];
    for (const workflowPath of workflowPaths) {
      const source = readFileSync(resolve(process.cwd(), workflowPath), 'utf8');
      expect(source).not.toMatch(/Desktop|OneDrive|Рабочий\s+стол/iu);
    }
  });
});
