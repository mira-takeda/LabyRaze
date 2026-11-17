import { createHash } from 'node:crypto';
import { closeSync, createReadStream, existsSync, openSync, readFileSync, readSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');
const fixture = JSON.parse(readFileSync(resolve(root, 'tests/fixtures/soundtrack.json'), 'utf8'));
const file = resolve(root, fixture.path);

function sha256Of(path: string): Promise<string> {
  return new Promise((ok, err) => {
    const hash = createHash('sha256');
    createReadStream(path)
      .on('data', (c) => hash.update(c))
      .on('error', err)
      .on('end', () => ok(hash.digest('hex').toUpperCase()));
  });
}

function readHeader(): Buffer {
  const fd = openSync(file, 'r'); // read-only
  try {
    const buf = Buffer.alloc(44);
    readSync(fd, buf, 0, 44, 0);
    return buf;
  } finally {
    closeSync(fd);
  }
}

describe('Soundtrack integrity (read-only)', () => {
  it('the MP3 fallback matches its fixture and contains audio frames without ID3 artwork', async () => {
    const mp3 = resolve(root, fixture.fallback.path);
    const bytes = readFileSync(mp3);
    expect(bytes.length).toBe(fixture.fallback.sizeBytes);
    expect(await sha256Of(mp3)).toBe(fixture.fallback.sha256);
    expect(bytes.readUInt32BE(0) >>> 21).toBe(2047);
    expect(bytes.toString('ascii', 0, 3)).not.toBe('ID3');
    expect(bytes.toString('ascii', bytes.length - 128, bytes.length - 125)).not.toBe('TAG');
  });
  it('is present', () => {
    expect(existsSync(file)).toBe(true);
  });

  it('has the recorded size', () => {
    expect(statSync(file).size).toBe(fixture.sizeBytes);
  });

  it('has the recorded SHA-256', async () => {
    expect(await sha256Of(file)).toBe(fixture.sha256.toUpperCase());
  });

  it('has the recorded Ogg/Opus header facts', () => {
    const b = readHeader();
    expect(b.toString('ascii', 0, 4)).toBe(fixture.header.magic);
    expect(b.toString('ascii', 28, 36)).toBe(fixture.header.head);
    expect(b.readUInt8(36)).toBe(fixture.header.version);
    expect(b.readUInt8(37)).toBe(fixture.header.channels);
    expect(b.readUInt32LE(40)).toBe(fixture.header.inputSampleRate);
  });

  it('agrees with ASSETS.md', () => {
    const md = readFileSync(resolve(root, 'ASSETS.md'), 'utf8');
    expect(md).toContain('Pixel Pulse.opus');
    expect(md).toContain(fixture.sizeBytes.toLocaleString('en-US'));
    expect(md.toUpperCase()).toContain(fixture.sha256.toUpperCase());
    expect(md.toUpperCase()).toContain(fixture.master.sha256.toUpperCase());
  });
});
