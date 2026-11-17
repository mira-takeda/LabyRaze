// Task 37.4 guard: the shipped game has no level skip, God Mode or debug query handling, and the
// development-only gallery (tools/gallery) is never part of the production build.
// Feature: kirobit-halloween-maze. **Validates: Requirements 34.6, 33.8, 34.4**
import { describe, expect, it } from 'vitest';
import { build } from 'vite';
import type { Rollup } from 'vite';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();

function walk(dir: string, ext: RegExp, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, ext, out);
    else if (ext.test(name)) out.push(p);
  }
  return out;
}

const srcFiles = walk(join(ROOT, 'src'), /\.ts$/);
const read = (p: string): string => readFileSync(p, 'utf8');
const rel = (p: string): string => relative(ROOT, p).replace(/\\/g, '/');

/** Query parameters the Shell may read: `?perf=1` (perf harness) and `?seed=N` (reproducible runs). */
const ALLOWED_QUERY = ['perf', 'seed'];

describe('no development shortcuts in the shipped game', () => {
  it('scans a non-empty set of source files', () => {
    expect(srcFiles.length).toBeGreaterThan(50);
  });

  it('reads only the documented query parameters (perf, seed)', () => {
    const names = new Set<string>();
    for (const f of srcFiles) {
      const text = read(f);
      for (const m of text.matchAll(/\.(?:get|has)\(\s*['"`]([^'"`]+)['"`]\s*\)/g)) {
        // Only calls on URLSearchParams-like objects: the file must touch the query string.
        if (/URLSearchParams|location\.search/.test(text) && /params|searchParams|query/i.test(text.slice(Math.max(0, m.index! - 20), m.index!))) {
          names.add(m[1]!);
        }
      }
    }
    expect([...names].sort()).toEqual([...ALLOWED_QUERY].sort());
  });

  it('only src/shell/main.ts touches the query string or hash', () => {
    // location.href is only used there as the base URL for the Soundtrack path, never parsed.
    const offenders = srcFiles.filter((f) => /URLSearchParams|location\.search|location\.hash|\.searchParams|document\.location/.test(read(f))).map(rel);
    expect(offenders).toEqual(['src/shell/main.ts']);
    const main = read(join(ROOT, 'src/shell/main.ts'));
    expect(main).not.toMatch(/location\.hash|\.searchParams|document\.location/);
    expect(main).toMatch(/params\.get\('perf'\)/);
  });

  it('has no level skip, God Mode or debug switches', () => {
    const bad = /god[\s_-]?mode|\bgodmode\b|invincib(?:le|ility)\s*(?:=|:)\s*true|skip[\s_-]?level|level[\s_-]?skip|jump[\s_-]?to[\s_-]?level|debug[\s_-]?mode|\?level=|\?skip=|\?god=|\?debug=|get\(\s*['"`](?:level|skip|god|debug|cheat|lives)['"`]\s*\)/i;
    const hits: string[] = [];
    for (const f of srcFiles) {
      read(f)
        .split('\n')
        .forEach((line, i) => {
          if (bad.test(line)) hits.push(`${rel(f)}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(hits).toEqual([]);
  });

  it('keeps the approved 30-lives cheat (typed sequence on the title screen, 30 lives)', () => {
    const cheat = read(join(ROOT, 'src/shell/cheat.ts'));
    expect(cheat).toMatch(/CHEAT_LIVES\s*=\s*30/);
    expect(cheat).toMatch(/KIROGHOST/);
  });

  it('index.html and vite.config.ts do not reference the gallery', () => {
    expect(read(join(ROOT, 'index.html'))).not.toMatch(/gallery/i);
    expect(read(join(ROOT, 'vite.config.ts'))).not.toMatch(/gallery|rollupOptions|\binput\b/i);
  });

  it('the production bundle contains no gallery module or hook', async () => {
    // Force production defines: under vitest NODE_ENV=test, which would otherwise flip
    // import.meta.env.DEV on and keep dev-only branches. `npm run build` sets production.
    const res = await build({ logLevel: 'silent', publicDir: false, define: { 'import.meta.env.DEV': 'false' }, build: { write: false } });
    const outputs = (Array.isArray(res) ? res : [res]) as Rollup.RollupOutput[];
    const files = outputs.flatMap((o) => o.output);
    expect(files.length).toBeGreaterThan(0);
    const codes: string[] = [];
    for (const f of files) {
      expect(f.fileName).not.toMatch(/gallery/i);
      if (f.type === 'chunk') {
        expect(f.code).not.toMatch(/__gallery|tools\/gallery/);
        expect(Object.keys(f.modules).filter((m) => /tools[\\/]gallery/.test(m))).toEqual([]);
        // The live-Run diagnostic stays in dev builds; only the aggregate perf result ships.
        expect(f.code).not.toMatch(/__kirobit(?![A-Za-z0-9_$])/);
        codes.push(f.code);
      }
    }
    expect(codes.join('\n')).toMatch(/__kirobitPerf/);
  }, 120_000);

  it('dist/ (when built) has no gallery files', () => {
    const dist = join(ROOT, 'dist');
    if (!existsSync(dist)) return; // the in-memory build test above covers the bundle itself
    const all = walk(dist, /.*/);
    expect(all.filter((p) => /gallery/i.test(rel(p)))).toEqual([]);
    for (const p of all.filter((x) => /\.(js|html|css)$/.test(x))) expect(read(p)).not.toMatch(/__gallery|tools\/gallery/);
  });
});
