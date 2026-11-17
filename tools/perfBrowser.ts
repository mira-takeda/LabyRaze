// Required browser measurement. --optional reports an unavailable prerequisite as SKIPPED (exit 2).
import { existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { preview } from 'vite';

const candidates = [process.env.KIROBIT_BROWSER ?? '',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

async function main(): Promise<void> {
  const executablePath = candidates.find((p) => p && existsSync(p));
  if (!executablePath || !existsSync('dist/index.html')) {
    console.error('Browser measurement unavailable: installed browser and production build are required.');
    console.log(process.argv.includes('--optional') ? 'SKIPPED (not PASS)' : 'FAIL: required measurement did not run');
    process.exitCode = process.argv.includes('--optional') ? 2 : 1;
    return;
  }
  const puppeteer = (await import('puppeteer-core')).default;
  const server = await preview({ preview: { port: 0, host: '127.0.0.1', strictPort: false }, logLevel: 'silent' });
  try {
    const address = server.httpServer.address();
    if (!address || typeof address === 'string') throw new Error('Preview has no TCP port');
    const browser = await puppeteer.launch({ executablePath, headless: true,
      // waitForFunction awaits the 30-second measurement inside one protocol call.
      // Launch stays bounded at 15 seconds; the measurement needs its full 60-second window.
      userDataDir: resolve('.release-local/chrome-perf'), timeout: 15_000, protocolTimeout: 65_000,
      args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
    try {
      const page = await browser.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto('http://127.0.0.1:' + address.port + '/?perf=1&seed=7', { waitUntil: 'load', timeout: 30_000 });
      try {
        await page.waitForFunction('window.__kirobitPerf !== undefined', { timeout: 60_000, polling: 500 });
      } catch (e) {
        console.error('Page errors before measurement failure:', errors);
        throw e;
      }
      const result = await page.evaluate('window.__kirobitPerf') as { pass: boolean; frames: number; inputs: number };
      if (!result || result.frames < 1 || result.inputs < 1) throw new Error('Measurement produced no frames or consumed inputs');
      console.log(JSON.stringify({ browser: basename(executablePath), ...result, errors }, null, 2));
      const pass = result.pass === true && errors.length === 0;
      console.log(pass ? 'PASS' : 'FAIL');
      process.exitCode = pass ? 0 : 1;
    } finally { await browser.close(); }
  } finally {
    await new Promise<void>((resolve, reject) => server.httpServer.close((e) => e ? reject(e) : resolve()));
  }
}
main().catch((e: unknown) => { console.error('FAIL: browser measurement failed', e); process.exitCode = 1; });
