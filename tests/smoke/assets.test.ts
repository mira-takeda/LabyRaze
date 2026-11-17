// ASSETS.md coverage (task 30.3): every asset category is documented, the Soundtrack row matches
// the read-only fixture, and no sprite or sound effect is loaded from a file.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const assets = readFileSync(join(root, 'ASSETS.md'), 'utf8');
const fixture = JSON.parse(readFileSync(join(root, 'tests/fixtures/soundtrack.json'), 'utf8')) as { sizeBytes: number; sha256: string; path: string };

function files(dir: string): string[] {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)],
  );
}

describe('ASSETS.md', () => {
  it('covers sprites, tiles, music, sound effects and mazes', () => {
    for (const k of ['Sprites', 'Tiles', 'Soundtrack', 'Sound effects', 'Mazes']) expect(assets).toContain(k);
    expect(assets).toMatch(/No Pac-Man material/);
  });

  it('the Soundtrack row still matches the fixture (size and SHA-256)', () => {
    expect(assets).toContain(fixture.path);
    expect(assets).toContain(fixture.sha256);
    expect(assets).toContain(fixture.sizeBytes.toLocaleString('en-US'));
  });

  it('no sprite image or sound-effect file is shipped or imported', () => {
    const pub = files('public');
    expect(pub.filter((f) => !f.endsWith('.gitkeep')).sort()).toEqual([
      join('public', 'audio', 'Pixel Pulse.mp3'), join('public', 'audio', 'Pixel Pulse.opus'),
    ]);
    for (const f of files('src')) {
      if (!f.endsWith('.ts')) continue;
      const text = readFileSync(join(root, f), 'utf8');
      expect(text, f).not.toMatch(/\.(png|gif|jpe?g|webp)['"]/);
      if (!f.endsWith(join('audio', 'soundtrack.ts'))) expect(text, f).not.toMatch(/\.(mp3|ogg)['"]/);
    }
  });
});
