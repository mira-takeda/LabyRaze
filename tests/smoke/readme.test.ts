// README commands, links and sections (tasks 34.1 and 38.2).
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

const readme = readFileSync('README.md', 'utf8');
const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };

describe('README', () => {
  it('every `npm run <script>` named in the README exists in package.json', () => {
    const named = [...readme.matchAll(/npm run ([a-z0-9:]+)/g)].map((m) => m[1]!);
    expect(named.length).toBeGreaterThan(10);
    for (const s of new Set(named)) expect(pkg.scripts[s], s).toBeDefined();
  });

  it('`npm test` exists in package.json', () => {
    expect(readme).toContain('`npm test`');
    expect(pkg.scripts['test']).toBeDefined();
  });

  it('every relative file link resolves, including RELEASE-AUDIT.md', () => {
    const links = [...readme.matchAll(/\]\(([^)\s]+)\)/g)]
      .map((m) => m[1]!)
      .filter((l) => !/^(https?:|mailto:|#)/.test(l));
    expect(links).toContain('RELEASE-AUDIT.md');
    expect(links).toContain('ASSETS.md');
    for (const l of new Set(links)) expect(existsSync(l.split('#')[0]!), l).toBe(true);
  });

  it('has the required sections', () => {
    for (const h of ['Install', 'Controls', 'Character Workshop', 'Development']) {
      expect(readme, h).toMatch(new RegExp(`^#{2,3} ${h}\\s*$`, 'm'));
    }
  });

  it('documents the source license and separate asset scope', () => {
    expect(readme).toContain('GPL-3.0-only');
    expect(readme).toContain('LICENSE-SCOPE.md');
    expect(existsSync('LICENSE')).toBe(true);
  });

  it('documents running, controls, Soundtrack rule, perf harness and assets', () => {
    for (const s of ['npm run dev', 'npm run build', 'npm run preview', 'npm test', 'Space', 'W A S D', 'check:soundtrack', '?perf=1', 'SKIPPED', 'ASSETS.md', 'kirobit.skins.v1', 'CHEAT RUNS']) {
      expect(readme).toContain(s);
    }
    expect(readme).toMatch(/never edit/i);
  });
});
