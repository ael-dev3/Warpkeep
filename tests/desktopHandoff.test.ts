import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const handoff = readFileSync(
  resolve(process.cwd(), 'docs/evidence/0.4.0/desktop-handoff.md'),
  'utf8',
);

describe('credential-free Desktop handoff', () => {
  it('keeps reproducible source, setup and evidence routes visible', () => {
    expect(handoff).toContain('codex/prepared-keep-bindings-fix');
    expect(handoff).toContain('npm ci');
    expect(handoff).toContain('/dev/keep04-qa.html?scenario=all-six-level-five&quality=high');
    expect(handoff).toContain('[`integration.md`](integration.md)');
    expect(handoff).toContain('[`release-freeze.md`](release-freeze.md)');
    expect(handoff).toContain('[`recovery.md`](recovery.md)');
  });

  it('documents sensitive package exclusions and the unreleased boundary', () => {
    expect(handoff).toContain('provider tokens');
    expect(handoff).toContain('player rows');
    expect(handoff).toContain('interim development handoff');
    expect(handoff).toMatch(/does not\s+connect an owner/);
    expect(handoff).toContain('physical-device measurements');
  });
});
