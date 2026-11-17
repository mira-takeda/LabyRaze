import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';

const OPUS_PATH = '/audio/Pixel%20Pulse.opus';
const OPUS_BYTES = 3548469;

let server: ViteDevServer;
let port: number;

function fetchLength(method: 'GET' | 'HEAD'): Promise<{ status: number; length: number }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path: OPUS_PATH, method }, (res) => {
      let length = 0;
      res.on('data', (chunk: Buffer) => {
        length += chunk.length; // count only, never buffer
      });
      res.on('end', () => {
        const header = Number(res.headers['content-length'] ?? -1);
        resolve({ status: res.statusCode ?? 0, length: method === 'HEAD' ? header : length });
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

describe('vite serves public/audio/Pixel Pulse.opus', () => {
  beforeAll(async () => {
    server = await createServer({
      // Uses the real vite.config.ts; only port/host are overridden.
      logLevel: 'silent',
      server: { port: 0, host: '127.0.0.1' },
    });
    await server.listen();
    port = (server.httpServer!.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await server.close();
  });

  // Downloading the file through the dev server can exceed the 5 s default on a loaded machine
  // (it timed out while balance workers saturated the CPU); the check itself is unchanged.
  it('GET returns 200 with the full recorded byte length', async () => {
    const r = await fetchLength('GET');
    expect(r.status).toBe(200);
    expect(r.length).toBe(OPUS_BYTES);
  }, 60_000);

  it('HEAD returns 200 with the recorded Content-Length', async () => {
    const r = await fetchLength('HEAD');
    expect(r.status).toBe(200);
    expect(r.length).toBe(OPUS_BYTES);
  });
});
