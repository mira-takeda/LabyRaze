// RELEASE-AUDIT.md coverage (task 38.3): the audit exists, flags the Kiro trademark, records the
// Soundtrack hash, direct dependencies and the explicitly scoped code licence.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const audit = readFileSync(join(root, 'RELEASE-AUDIT.md'), 'utf8');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const fixture = JSON.parse(readFileSync(join(root, 'tests/fixtures/soundtrack.json'), 'utf8')) as { sha256: string };

describe('RELEASE-AUDIT.md', () => {
  it('mentions the Kiro trademark and the Soundtrack SHA-256', () => {
    expect(audit).toMatch(/Kiro[\s\S]*trademark/i);
    expect(audit).toContain(fixture.sha256);
  });

  it('lists every direct dependency', () => {
    for (const name of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) expect(audit).toContain(name);
  });

  it('ships the complete GPLv3 and distinguishes source code from asset rights', () => {
    const license = readFileSync(join(root, 'LICENSE'), 'utf8');
    expect(license).toContain('Version 3, 29 June 2007');
    expect(license).toContain('END OF TERMS AND CONDITIONS');
    const scope = readFileSync(join(root, 'LICENSE-SCOPE.md'), 'utf8');
    expect(scope).toContain('GPL-3.0-only');
    expect(scope).toContain('music');
    expect(scope).toContain('Kiro');
    expect(scope).toContain('THIRD-PARTY-NOTICES.md');
  });
});
