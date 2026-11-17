import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const steeringDir = join(root, '.kiro', 'steering');
const hooksDir = join(root, '.kiro', 'hooks');

const ALWAYS = ['product', 'architecture', 'product-rules', 'technical-constraints', 'art-audio'];
const FILE_MATCH = ['testing', 'performance', 'quality-standards', 'visual-identity', 'audio'];
const MANUAL = ['open-decisions'];
const ALL_STEERING = [...ALWAYS, ...FILE_MATCH, ...MANUAL];

interface FrontMatter {
  inclusion?: string;
  fileMatchPattern?: string | string[];
  [key: string]: unknown;
}

/** Minimal front matter parser: scalars, quoted strings and `- item` lists. */
function parseFrontMatter(text: string): FrontMatter | null {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text);
  if (!m) return null;
  const out: Record<string, unknown> = {};
  let listKey: string | null = null;
  for (const raw of (m[1] ?? '').split(/\r?\n/)) {
    if (raw.trim() === '') continue;
    const item = /^\s+-\s+(.*)$/.exec(raw);
    if (item && listKey) {
      (out[listKey] as string[]).push(unquote(item[1] ?? ''));
      continue;
    }
    const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(raw);
    if (!kv) return null;
    const key = kv[1] as string;
    const value = (kv[2] ?? '').trim();
    if (value === '') {
      out[key] = [];
      listKey = key;
    } else {
      out[key] = unquote(value);
      listKey = null;
    }
  }
  return out as FrontMatter;
}

function unquote(s: string): string {
  const t = s.trim();
  return /^(".*"|'.*')$/.test(t) ? t.slice(1, -1) : t;
}

const steering = new Map<string, string>();
for (const name of ALL_STEERING) {
  const p = join(steeringDir, `${name}.md`);
  if (existsSync(p)) steering.set(name, readFileSync(p, 'utf8'));
}

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
};

interface Hook {
  name: string;
  trigger: string;
  matcher: string;
  action: { type: string; command: string };
  timeout?: number;
}

const hookFiles = readdirSync(hooksDir).filter((f) => f.endsWith('.json'));
const hooks: { file: string; hook: Hook }[] = [];
for (const file of hookFiles) {
  const parsed = JSON.parse(readFileSync(join(hooksDir, file), 'utf8')) as { hooks?: Hook[] };
  for (const hook of parsed.hooks ?? []) hooks.push({ file, hook });
}

const WRITE_VERBS =
  /\b(write|writefile|writefilesync|copy|cp|move|mv|rename|ren|del|delete|rm|rmdir|remove|set-content|out-file|add-content|new-item|mkdir|touch|truncate|tee|unlink|appendfile)\b|>/i;

describe('steering files', () => {
  it('has exactly the 11 expected steering files', () => {
    const present = readdirSync(steeringDir).filter((f) => f.endsWith('.md')).sort();
    expect(present).toEqual(ALL_STEERING.map((n) => `${n}.md`).sort());
  });

  it.each(ALL_STEERING)('%s.md exists with valid front matter and inclusion mode', (name) => {
    const text = steering.get(name);
    expect(text, `${name}.md missing`).toBeDefined();
    const fm = parseFrontMatter(text as string);
    expect(fm, `${name}.md has invalid front matter`).not.toBeNull();
    const expected = ALWAYS.includes(name) ? 'always' : FILE_MATCH.includes(name) ? 'fileMatch' : 'manual';
    expect(fm?.inclusion).toBe(expected);
    if (expected === 'fileMatch') {
      const pat = fm?.fileMatchPattern;
      const patterns = Array.isArray(pat) ? pat : typeof pat === 'string' ? [pat] : [];
      expect(patterns.length).toBeGreaterThan(0);
      for (const p of patterns) expect(p.trim()).not.toBe('');
    }
  });

  it.each(['60', 'PRNG', 'Balance_Baseline', '16.7', 'Pac-Man', 'Pixel Pulse.wav', 'never'])(
    'keyword "%s" appears across the steering set',
    (kw) => {
      const all = [...steering.values()].join('\n');
      const hay = kw === 'never' ? all.toLowerCase() : all;
      expect(hay.includes(kw === 'never' ? 'never' : kw)).toBe(true);
    },
  );
});

describe('hook files', () => {
  it('has 8 hook JSON files', () => {
    expect(hookFiles.length).toBe(8);
  });

  it.each(hooks.map((h) => [h.file + ' :: ' + h.hook.name, h] as const))(
    '%s is valid',
    (_label, { hook }) => {
      for (const key of ['name', 'trigger', 'matcher', 'action'] as const) {
        expect(hook[key], `missing ${key}`).toBeTruthy();
      }
      expect(hook.action.type).toBe('command');
      expect(() => new RegExp(hook.matcher)).not.toThrow();

      const m = /^npm(?:\.cmd)? run ([\w:-]+)\s*$/.exec(hook.action.command);
      expect(m, `command is not an npm script: ${hook.action.command}`).not.toBeNull();
      expect(Object.keys(pkg.scripts)).toContain(m?.[1]);
    },
  );

  it.each(hookFiles)('%s parses with version v1 and a hooks array', (file) => {
    const parsed = JSON.parse(readFileSync(join(hooksDir, file), 'utf8')) as {
      version: string;
      hooks: unknown[];
    };
    expect(parsed.version).toBe('v1');
    expect(Array.isArray(parsed.hooks)).toBe(true);
    expect(parsed.hooks.length).toBeGreaterThan(0);
  });

  it('no hook command or npm script writes to public/audio', () => {
    const commands = [
      ...hooks.map((h) => h.hook.action.command),
      ...Object.values(pkg.scripts),
    ];
    for (const cmd of commands) {
      if (/public[\\/]audio/i.test(cmd)) {
        expect(WRITE_VERBS.test(cmd), `write-like command touches public/audio: ${cmd}`).toBe(false);
      }
    }
  });

  it('write-verb detector flags obvious write commands', () => {
    expect(WRITE_VERBS.test('copy x public/audio/a.wav')).toBe(true);
    expect(WRITE_VERBS.test('tsx tools/checkSoundtrack.ts')).toBe(false);
  });

  it('mechanics hook matches src/core/ghostHunt.ts', () => {
    const h = hooks.find((x) => x.hook.name === 'mechanics-tests-on-save');
    expect(h).toBeDefined();
    const re = new RegExp(h?.hook.matcher as string);
    expect(re.test('src/core/ghostHunt.ts')).toBe(true);
    expect(re.test('src\\core\\ghostHunt.ts')).toBe(true);
    expect(re.test('src/core/sim.ts')).toBe(false);
  });

  it('soundtrack hooks match public/audio/Pixel Pulse.wav and run check:soundtrack', () => {
    const hs = hooks.filter((x) => x.file === 'soundtrack-integrity-on-change.json');
    expect(hs.map((x) => x.hook.trigger).sort()).toEqual([
      'PostFileCreate',
      'PostFileDelete',
      'PostFileSave',
    ]);
    for (const { hook } of hs) {
      expect(new RegExp(hook.matcher).test('public/audio/Pixel Pulse.wav')).toBe(true);
      expect(hook.action.command).toMatch(/run check:soundtrack$/);
    }
  });
});
