import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { runLint, scanSource } from '../../tools/lintDeterminism';

describe('lintDeterminism scanner', () => {
  it('reports nothing for clean code', () => {
    const src = 'export const add = (a: number, b: number): number => a + b;\n';
    expect(scanSource(src)).toEqual([]);
  });

  it('reports every forbidden API with its line number', () => {
    const src = [
      'const a = Date.now();',
      'const b = performance.now();',
      'const c = Math.random();',
      'requestAnimationFrame(() => {});',
      'crypto.getRandomValues(new Uint8Array(1));',
      'setTimeout(() => {}, 1);',
      'setInterval(() => {}, 1);',
    ].join('\n');
    expect(scanSource(src)).toEqual([
      { line: 1, pattern: 'Date.' },
      { line: 2, pattern: 'performance.' },
      { line: 3, pattern: 'Math.random' },
      { line: 4, pattern: 'requestAnimationFrame' },
      { line: 5, pattern: 'crypto.getRandomValues' },
      { line: 6, pattern: 'setTimeout' },
      { line: 7, pattern: 'setInterval' },
    ]);
  });

  it('ignores matches inside comments', () => {
    const src = '// Date.now() Math.random()\n/* setTimeout\n performance.now() */\nconst x = 1;\n';
    expect(scanSource(src)).toEqual([]);
  });

  it('ignores matches inside string literals', () => {
    const src = [
      "const a = 'Date.now()';",
      'const b = "Math.random()";',
      'const c = `setTimeout and performance.now()`;',
    ].join('\n');
    expect(scanSource(src)).toEqual([]);
  });

  it('still flags code inside template substitutions and after comments', () => {
    const src = 'const a = `x ${Math.random()}`; // note\nconst b = Date.now(); // Date.now()\n';
    expect(scanSource(src)).toEqual([
      { line: 1, pattern: 'Math.random' },
      { line: 2, pattern: 'Date.' },
    ]);
  });
});

describe('lintDeterminism runLint', () => {
  // Temporary tree under tests/smoke (never under src/core), removed afterwards.
  const tmp = mkdtempSync(join(fileURLToPath(new URL('.', import.meta.url)), '.lint-tmp-'));
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  it('returns 0 for a clean tree and 1 with file:line output for an offending tree', () => {
    const clean = join(tmp, 'clean');
    const bad = join(tmp, 'bad', 'nested');
    mkdirSync(clean, { recursive: true });
    mkdirSync(bad, { recursive: true });
    writeFileSync(join(clean, 'ok.ts'), '// Math.random()\nexport const s = "Date.now()";\n');
    writeFileSync(join(bad, 'x.ts'), 'export const a = 1;\nexport const t = Date.now();\n');

    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(runLint(clean, tmp)).toBe(0);
      expect(runLint(join(tmp, 'bad'), tmp)).toBe(1);
      expect(err.mock.calls.map((c) => String(c[0]))).toContain('bad/nested/x.ts:2: forbidden "Date."');
    } finally {
      log.mockRestore();
      err.mockRestore();
    }
  });
});
