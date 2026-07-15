import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import { parseDocument } from 'yaml';

import {
  WARPKEEP_FARCASTER_CHANNEL_URL,
  WARPKEEP_GITHUB_ISSUE_INTAKE_URL
} from '../src/farcaster/farcasterProjectLinks';

const TEMPLATE_DIRECTORY = resolve(process.cwd(), '.github/ISSUE_TEMPLATE');
const FORM_PATHS = readdirSync(TEMPLATE_DIRECTORY, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.yml') && entry.name !== 'config.yml')
  .map((entry) => resolve(TEMPLATE_DIRECTORY, entry.name))
  .sort();

function read(path: string) {
  return readFileSync(path, 'utf8');
}

function parseYaml(path: string) {
  const document = parseDocument(read(path), {
    strict: true,
    uniqueKeys: true
  });
  expect(document.errors, `${path} must be valid strict YAML`).toEqual([]);
  return document.toJS({ maxAliasCount: 0 }) as unknown;
}

function record(value: unknown): Record<string, unknown> {
  expect(value).not.toBeNull();
  expect(Array.isArray(value)).toBe(false);
  expect(typeof value).toBe('object');
  return value as Record<string, unknown>;
}

describe('Realm Council public intake', () => {
  it.each(FORM_PATHS)('keeps %s structured, attachment-free, and privacy bounded', (path) => {
    const form = record(parseYaml(path));
    expect(typeof form.name).toBe('string');
    expect(typeof form.description).toBe('string');
    expect(Array.isArray(form.body)).toBe(true);

    const fields = (form.body as unknown[]).map(record);
    expect(fields.length).toBeGreaterThan(0);
    expect(fields.every((field) => field.type !== 'upload')).toBe(true);

    const ids = fields.flatMap((field) => (
      typeof field.id === 'string' ? [field.id] : []
    ));
    expect(ids).not.toEqual(expect.arrayContaining([
      'contact', 'fid', 'identity', 'logs', 'qr', 'token', 'wallet'
    ]));

    for (const field of fields.filter((candidate) => candidate.type === 'textarea')) {
      expect(record(field.attributes).render).toBe('text');
    }

    const privacy = fields.find((field) => field.id === 'privacy');
    expect(privacy?.type).toBe('checkboxes');
    const privacyOptions = record(privacy?.attributes).options;
    expect(Array.isArray(privacyOptions)).toBe(true);
    expect((privacyOptions as unknown[]).length).toBeGreaterThan(0);
    for (const option of privacyOptions as unknown[]) {
      expect(record(option).required).toBe(true);
    }

    const serializedPrivacy = JSON.stringify(privacyOptions);
    expect(serializedPrivacy).toContain('tokens');
    expect(serializedPrivacy).toContain('QR payloads');
    expect(serializedPrivacy).toContain('private logs');
    expect(serializedPrivacy).toContain('personal data');
    expect(JSON.stringify(form)).toContain('SECURITY.md');
  });

  it('routes conversation, durable intake, and private security reporting distinctly', () => {
    expect(FORM_PATHS.map((path) => path.split('/').pop())).toEqual([
      'bug-report.yml',
      'realm-wish.yml',
      'security-contact.yml'
    ]);
    const config = record(parseYaml(resolve(TEMPLATE_DIRECTORY, 'config.yml')));
    const readme = read(resolve(process.cwd(), 'README.md'));
    const contributing = read(resolve(process.cwd(), 'CONTRIBUTING.md'));

    expect(config.blank_issues_enabled).toBe(false);
    expect(Array.isArray(config.contact_links)).toBe(true);
    const contactUrls = (config.contact_links as unknown[]).map((link) => (
      record(link).url
    ));
    expect(contactUrls).toContain(WARPKEEP_FARCASTER_CHANNEL_URL);
    expect(contactUrls).toContain('https://github.com/ael-dev3/Warpkeep/security/policy');
    expect(readme).toContain(`[Realm Council issue forms](${WARPKEEP_GITHUB_ISSUE_INTAKE_URL})`);
    expect(contributing)
      .toContain(`[Realm Council issue forms](${WARPKEEP_GITHUB_ISSUE_INTAKE_URL})`);
    expect(contributing).toContain('[SECURITY.md](SECURITY.md)');

    for (const url of [
      WARPKEEP_FARCASTER_CHANNEL_URL,
      WARPKEEP_GITHUB_ISSUE_INTAKE_URL,
      'https://github.com/ael-dev3/Warpkeep/security/policy'
    ]) {
      const parsed = new URL(url);
      expect(parsed.protocol).toBe('https:');
      expect(parsed.search).toBe('');
      expect(parsed.hash).toBe('');
      expect(parsed.username).toBe('');
      expect(parsed.password).toBe('');
    }
  });
});
