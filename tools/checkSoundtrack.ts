// Read-only integrity check of the shipped Soundtrack (size + SHA-256).
// Never opens public/audio for writing. Also fails when the master WAV is still in
// public/audio: builds must ship the compressed file only.
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = JSON.parse(
  readFileSync(resolve(root, 'tests/fixtures/soundtrack.json'), 'utf8'),
) as { path: string; sizeBytes: number; sha256: string; fallback: { path: string; sizeBytes: number; sha256: string } };
const file = resolve(root, fixture.path);

function fail(message: string): never {
  console.error(`check:soundtrack FAILED: ${message}`);
  process.exit(1);
}

function sha256Of(path: string): Promise<string> {
  return new Promise((ok, err) => {
    const hash = createHash('sha256');
    createReadStream(path, { flags: 'r' })
      .on('data', (chunk) => hash.update(chunk))
      .on('error', err)
      .on('end', () => ok(hash.digest('hex').toUpperCase()));
  });
}

if (!existsSync(file)) fail(`missing file ${fixture.path}`);

const size = statSync(file).size;
if (size !== fixture.sizeBytes) {
  fail(`size changed: expected ${fixture.sizeBytes}, found ${size}`);
}
const sha = await sha256Of(file);
if (sha !== fixture.sha256.toUpperCase()) {
  fail(`SHA-256 changed: expected ${fixture.sha256}, found ${sha}`);
}

for (const f of readdirSync(resolve(root, 'public/audio'))) {
  if (f.toLowerCase().endsWith('.wav')) fail(`master WAV must not ship in public/audio: ${f}`);
}
const fallback = resolve(root, fixture.fallback.path);
if (!existsSync(fallback) || statSync(fallback).size !== fixture.fallback.sizeBytes || await sha256Of(fallback) !== fixture.fallback.sha256) {
  fail('MP3 fallback missing or does not match its fixture');
}
const mp3 = readFileSync(fallback);
if ((mp3.readUInt32BE(0) >>> 21) !== 2047 || mp3.toString('ascii', 0, 3) === 'ID3') fail('MP3 fallback must contain MPEG frames without ID3 metadata');

const assets = readFileSync(resolve(root, 'ASSETS.md'), 'utf8');
if (!assets.includes('Pixel Pulse.opus')) fail('ASSETS.md has no Soundtrack row');
if (!assets.includes(fixture.sizeBytes.toLocaleString('en-US'))) {
  fail('ASSETS.md size does not match the fixture');
}
if (!assets.toUpperCase().includes(fixture.sha256.toUpperCase())) {
  fail('ASSETS.md SHA-256 does not match the fixture');
}

console.log(`check:soundtrack OK: ${size} bytes, SHA-256 ${sha}`);
console.log(`MP3 fallback OK: ${fixture.fallback.sizeBytes} bytes, SHA-256 ${fixture.fallback.sha256}`);
