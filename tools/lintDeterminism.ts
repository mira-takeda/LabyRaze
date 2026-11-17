// Determinism lint: scans src/core/**/*.ts for wall-clock, frame-timing and
// unseeded-randomness APIs (Requirements 2.4, 24.4, 24.5).
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface Match {
  line: number;
  pattern: string;
}

const PATTERNS: ReadonlyArray<{ name: string; re: RegExp }> = [
  { name: 'Date.', re: /\bDate\s*\./g },
  { name: 'performance.', re: /\bperformance\s*\./g },
  { name: 'Math.random', re: /\bMath\s*\.\s*random\b/g },
  { name: 'requestAnimationFrame', re: /\brequestAnimationFrame\b/g },
  { name: 'crypto.getRandomValues', re: /\bcrypto\s*\.\s*getRandomValues\b/g },
  { name: 'setTimeout', re: /\bsetTimeout\b/g },
  { name: 'setInterval', re: /\bsetInterval\b/g },
];

/**
 * Replace comments and string/template literal contents with spaces.
 * Newlines are kept so line numbers stay stable. Code inside `${...}` of a
 * template literal is preserved and scanned.
 */
export function stripCommentsAndStrings(src: string): string {
  let out = '';
  let i = 0;
  const n = src.length;
  // Stack of brace depths for template substitutions currently open.
  const templateStack: number[] = [];
  let braceDepth = 0;
  const blank = (c: string | undefined): string => (c === '\n' || c === '\r' ? c : ' ');

  // Consume template text starting after a backtick or after a closing `}` of a substitution.
  const readTemplateText = (): void => {
    while (i < n) {
      const c = src[i];
      if (c === '\\') {
        out += blank(c) + (i + 1 < n ? blank(src[i + 1]) : '');
        // c is '\\' here, so blank(c) is a space
        i += 2;
      } else if (c === '`') {
        out += ' ';
        i++;
        return;
      } else if (c === '$' && src[i + 1] === '{') {
        out += '  ';
        i += 2;
        templateStack.push(braceDepth);
        braceDepth++;
        return;
      } else {
        out += blank(c);
        i++;
      }
    }
  };

  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') {
      while (i < n && src[i] !== '\n') {
        out += blank(src[i]);
        i++;
      }
    } else if (c === '/' && d === '*') {
      out += '  ';
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        out += blank(src[i]);
        i++;
      }
      if (i < n) {
        out += '  ';
        i += 2;
      }
    } else if (c === '"' || c === "'") {
      out += ' ';
      i++;
      while (i < n && src[i] !== c && src[i] !== '\n') {
        if (src[i] === '\\' && i + 1 < n) {
          out += blank(src[i]) + blank(src[i + 1]);
          i += 2;
        } else {
          out += blank(src[i]);
          i++;
        }
      }
      if (i < n && src[i] === c) {
        out += ' ';
        i++;
      }
    } else if (c === '`') {
      out += ' ';
      i++;
      readTemplateText();
    } else if (c === '{') {
      braceDepth++;
      out += c;
      i++;
    } else if (c === '}') {
      braceDepth--;
      if (templateStack.length > 0 && templateStack[templateStack.length - 1] === braceDepth) {
        templateStack.pop();
        out += ' ';
        i++;
        readTemplateText();
      } else {
        out += c;
        i++;
      }
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/** Scan source text; returns one entry per forbidden-API occurrence with a 1-based line. */
export function scanSource(src: string): Match[] {
  const lines = stripCommentsAndStrings(src).split('\n');
  const matches: Match[] = [];
  lines.forEach((text, idx) => {
    for (const { name, re } of PATTERNS) {
      re.lastIndex = 0;
      while (re.exec(text) !== null) {
        matches.push({ line: idx + 1, pattern: name });
      }
    }
  });
  return matches;
}

function collectTsFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectTsFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.ts')) files.push(full);
  }
  return files.sort();
}

/** Scan a directory tree; returns printable `file:line: pattern` strings. */
export function scanDirectory(dir: string, root: string = process.cwd()): string[] {
  if (!existsSync(dir)) return [];
  const report: string[] = [];
  for (const file of collectTsFiles(dir)) {
    const rel = relative(root, file).split('\\').join('/');
    for (const m of scanSource(readFileSync(file, 'utf8'))) {
      report.push(`${rel}:${m.line}: forbidden "${m.pattern}"`);
    }
  }
  return report;
}

/** Run the lint over `dir`, printing `file:line` per match; returns the process exit code. */
export function runLint(dir: string = resolve('src/core'), root: string = process.cwd()): number {
  const report = scanDirectory(dir, root);
  if (report.length > 0) {
    for (const line of report) console.error(line);
    console.error(`lint:determinism failed: ${report.length} match(es)`);
    return 1;
  }
  console.log(`lint:determinism passed: no forbidden APIs in ${relative(root, dir) || '.'}`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exit(runLint());
}
