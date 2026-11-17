// Real browser decoding/playback of the same source loader; isolated temporary browser profile.
import { existsSync } from 'node:fs';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import { resolve } from 'node:path';

const executablePath = [process.env.KIROBIT_BROWSER ?? '',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => p && existsSync(p));

async function main(): Promise<void> {
  if (!executablePath) throw new Error('Required audio browser check cannot run: no installed browser');
  const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'silent' });
  await server.listen();
  try {
    const address = server.httpServer?.address();
    if (!address || typeof address === 'string') throw new Error('Missing server port');
    console.log('Launching isolated audio browser profile');
    const browser = await puppeteer.launch({ executablePath, headless: true,
      userDataDir: resolve('.release-local/chrome-audio'), timeout: 15_000, protocolTimeout: 15_000,
      args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
    try {
      for (const scenario of ['buffer-opus', 'buffer-mp3', 'stream-opus', 'stream-mp3', 'auto-opus404', 'buffer-all404', 'stream-timeout']) {
        console.log(`START audio scenario ${scenario}`);
        const page = await browser.newPage();
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(String(e)));
        if (scenario.includes('404')) {
          await page.setRequestInterception(true);
          page.on('request', (r) => {
            if (new URL(r.url()).pathname.startsWith('/audio/') && (scenario.includes('all404') || r.url().endsWith('.opus'))) {
              void r.respond({ status: 404, body: 'intentional audio failure' });
            } else void r.continue();
          });
        }
        try {
          await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: 'load' });
          const result = await page.evaluate(async (scenario) => {
            const loaderPath = '/src/audio/soundtrack.ts';
            const enginePath = '/src/audio/audioEngine.ts';
            const configPath = '/src/core/config.ts';
            const { Soundtrack } = await import(loaderPath);
            const { browserAudioDeps } = await import(enginePath);
            const { DEFAULT_CONFIG } = await import(configPath);
            const ctx = new AudioContext({ sampleRate: 48000 });
            await ctx.resume();
            const output = ctx.createGain(); output.connect(ctx.destination);
            const method = scenario.split('-')[0];
            const deps = browserAudioDeps({ ...DEFAULT_CONFIG.audio, soundtrackMethod: method,
              soundtrackLoadTimeoutMs: scenario === 'stream-timeout' ? 100 : 10_000 }, location.origin + '/');
            let disconnected = 0;
            const create = ctx.createMediaElementSource.bind(ctx);
            ctx.createMediaElementSource = (el: HTMLMediaElement) => {
              const node = create(el); const disconnect = node.disconnect.bind(node);
              node.disconnect = () => { disconnected++; disconnect(); };
              return node;
            };
            const elements: HTMLAudioElement[] = [];
            const soundtrack = new Soundtrack({ ...deps, ctx, output,
              canPlayType: (mime: string) => scenario.includes('mp3') && mime.includes('opus') ? '' : new Audio().canPlayType(mime),
              createElement: () => {
                const el = new Audio(); elements.push(el);
                if (scenario === 'stream-timeout') el.play = () => new Promise<void>(() => undefined);
                return el;
              } });
            const state = await soundtrack.load();
            const failed = scenario === 'buffer-all404' || scenario === 'stream-timeout';
            const expectMp3 = scenario.includes('mp3') || scenario.includes('opus404');
            let channels = 0; let duration = 0; let samples = 0; let looping = false; let progressed = false; let codec = '';
            if (soundtrack.buffer) {
              channels = soundtrack.buffer.numberOfChannels; duration = soundtrack.buffer.duration;
              samples = soundtrack.buffer.length; looping = soundtrack.source.loop;
              progressed = ctx.state === 'running' && soundtrack.source.buffer === soundtrack.buffer;
              // Exercise the loop boundary in a native offline graph near the end of the decoded buffer.
              const offline = new OfflineAudioContext(2, 48000, 48000);
              const source = offline.createBufferSource(); source.buffer = soundtrack.buffer;
              source.loop = true; source.connect(offline.destination); source.start(0, duration - 0.025);
              const rendered = await offline.startRendering();
              const actual = rendered.getChannelData(0);
              const expected = soundtrack.buffer.getChannelData(0);
              for (let i = 1400; i < actual.length; i++) {
                if (Math.abs(actual[i]! - expected[i - 1200]!) > 0.001) throw new Error('Loop samples differ after the boundary');
              }
              codec = expectMp3 ? 'mp3' : 'opus';
            } else if (soundtrack.element) {
              const el = soundtrack.element as HTMLAudioElement;
              if (!Number.isFinite(el.duration)) await new Promise<void>((resolve, reject) => {
                el.addEventListener('loadedmetadata', () => resolve(), { once: true });
                setTimeout(() => reject(new Error('No stream metadata')), 5000);
              });
              duration = el.duration; looping = el.loop; codec = el.src.endsWith('.mp3') ? 'mp3' : 'opus';
              el.currentTime = Math.max(0, duration - 0.15);
              await new Promise((r) => setTimeout(r, 700));
              progressed = !el.paused && el.currentTime < 2;
            }
            const cleanup = failed && elements.every((el) => el.paused && !el.hasAttribute('src'));
            const pass = failed ? state.status === 'failed' && (scenario !== 'stream-timeout' || cleanup && disconnected > 0)
              : ['ready', 'streaming'].includes(state.status) && looping && progressed && Math.abs(duration - 171.157333) < 0.15
                && (!channels || channels === 2) && codec === (expectMp3 ? 'mp3' : 'opus');
            soundtrack.element?.pause(); soundtrack.source?.stop(); output.disconnect(); await ctx.close();
            return { scenario, state, channels, duration, samples, looping, progressed, codec, cleanup, disconnected, pass };
          }, scenario);
          console.log(JSON.stringify({ ...result, errors }));
          if (!result.pass || errors.length) throw new Error(`Audio scenario failed: ${scenario}`);
        } finally { await page.close(); }
      }
      console.log('PASS: real-browser audio decode, playback, loop crossing, fallback and timeout cleanup');
    } finally { await browser.close(); }
  } finally { await server.close(); }
}
main().catch((e: unknown) => { console.error('FAIL:', e instanceof Error ? e.stack : String(e)); process.exitCode = 1; });
