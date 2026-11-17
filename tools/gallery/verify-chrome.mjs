// Chrome verification of the playable build (read-only towards the game). Screenshots go to
// tools/gallery/shots. Usage (from the workspace root): node tools/gallery/verify-chrome.mjs <prodUrl> [galleryUrl]
import puppeteer from 'puppeteer-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const [prod, gallery] = process.argv.slice(2);
const exe = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].find((p) => existsSync(p));
if (!exe) { console.log('NO_CHROME'); process.exit(2); }
const OUT = join(dirname(fileURLToPath(import.meta.url)), 'shots');
mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: exe, headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const report = { browser: exe, errors: [], checks: {} };
const C = report.checks;
const watch = (page) => {
  page.on('pageerror', (e) => report.errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') report.errors.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) report.errors.push(`HTTP ${r.status()} ${r.url()}`); });
};
const shot = (page, name, clip) => page.screenshot({ path: `${OUT}/${name}.png`, ...(clip ? { clip } : {}) });
const step = async (name, fn) => { try { await fn(); } catch (e) { report.errors.push(`${name}: ${e?.message ?? e}`); } };
// ---- 1. Dev-only gallery: biomes, sprites, locator, death.
if (gallery) await step('gallery', async () => {
  const g = await b.newPage();
  watch(g);
  await g.setViewport({ width: 1700, height: 1500 });
  await g.goto(gallery, { waitUntil: 'load' });
  await g.waitForFunction('window.__galleryReady === true', { timeout: 30000 });
  const ids = await g.$$eval('canvas', (cs) => cs.map((c) => c.id));
  for (const id of ids) await (await g.$(`#${id}`)).screenshot({ path: `${OUT}/${id}.png` });
  C.galleryCanvases = ids;
  await g.close();
});
// ---- 1b. Dev-only 1UP and CONGRATULATIONS previews (virtual time, real layers): screenshots at
// 200 / 600 / 1400 ms plus measurements (changed pixels, exact text-colour pixels, particle count).
const HUD_H = 64;
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const GREEN = rgb('#5dff7a'), GOLD = rgb('#ffd95a'), PALE = rgb('#fff4c2');
const TIMES = [200, 600, 1400];
const fail = (msg) => { report.errors.push(`CHECK FAILED: ${msg}`); };
if (gallery) await step('fx', async () => {
  const g = await b.newPage();
  watch(g);
  await g.setViewport({ width: 1700, height: 1500 });
  await g.goto(gallery, { waitUntil: 'load' });
  await g.waitForFunction('window.__galleryReady === true && !!window.__gallery', { timeout: 30000 });
  const snap = () => g.evaluate(() => { const c = document.getElementById('fx-stage'); window.__base = c.getContext('2d').getImageData(0, 0, c.width, c.height); });
  const measure = (region, colours) => g.evaluate(({ region, colours }) => {
    const c = document.getElementById('fx-stage');
    const full = c.getContext('2d').getImageData(0, 0, c.width, c.height);
    const d = full.data, bs = window.__base.data, W = c.width;
    let changed = 0, greenish = 0;
    const exact = colours.map(() => 0);
    for (let y = region.y; y < Math.min(c.height, region.y + region.h); y++) {
      for (let x = region.x; x < Math.min(W, region.x + region.w); x++) {
        const i = (y * W + x) * 4;
        if (Math.abs(d[i] - bs[i]) + Math.abs(d[i + 1] - bs[i + 1]) + Math.abs(d[i + 2] - bs[i + 2]) > 48) {
          changed++;
          // Green-dominant new pixels: the 1UP text is drawn before lighting, so it is tinted, not exact.
          if (d[i + 1] >= 150 && d[i + 1] - d[i] >= 50 && d[i + 1] - d[i + 2] >= 50) greenish++;
        }
        colours.forEach((k, j) => { if (d[i] === k[0] && d[i + 1] === k[1] && d[i + 2] === k[2]) exact[j]++; });
      }
    }
    return { changed, greenish, exact };
  }, { region, colours });
  const dims = () => g.evaluate(() => { const c = document.getElementById('fx-stage'); return { w: c.width, h: c.height }; });
  const stats = () => g.evaluate(() => window.__gallery.stats());
  C.fx = {};
  const cases = [
    { id: '1up', base: [1, 4], show: 'show1UP', arg: [], minText: 40 },
    { id: 'multi1up', base: [1, 6], show: 'showMulti1UP', arg: [], minText: 40 },
    ...[100, 150, 250].map((n) => ({ id: `congrats-L${n}`, base: [n, 3], show: 'showCelebration', arg: [n], level: n })),
  ];
  for (const k of cases) {
    await g.evaluate((a) => { window.__gallery.showBase(...a); window.__gallery.seek(0); }, k.base);
    await snap();
    await g.evaluate(({ show, arg }) => { window.__gallery[show](...arg); }, k);
    const { w, h } = await dims();
    const msg = { x: 0, y: HUD_H, w: 190, h: 70 };
    const pulse = { x: 0, y: 34, w: 150, h: 24 };
    const cy = HUD_H + (h - HUD_H) * 0.38;
    const band = { x: 0, y: Math.round(cy - 54), w, h: 142 };
    const rec = { canvas: { w, h }, times: {} };
    for (const t of TIMES) {
      await g.evaluate((ms) => window.__gallery.seek(ms), t);
      const st = await stats();
      const r = { particles: st.particles, cap: st.cap, dropped: st.dropped };
      if (k.level === undefined) {
        const m = await measure(msg, [GREEN, GOLD]);
        const pu = await measure(pulse, []);
        r.messageRegion = { changedPixels: m.changed, greenTextPixels: m.greenish, exactGreen: m.exact[0], exactGold: m.exact[1] };
        r.hudPulseChangedPixels = pu.changed;
      } else {
        const m = await measure(band, [GOLD, PALE, GREEN]);
        const whole = await measure({ x: 0, y: 0, w, h }, []);
        r.textBand = { changedPixels: m.changed, titleGoldPaleExact: m.exact[0] + m.exact[1], levelGreenExact: m.exact[2] };
        r.wholeCanvasChangedPixels = whole.changed;
      }
      await (await g.$('#fx-stage')).screenshot({ path: `${OUT}/fx-${k.id}-${t}ms.png` });
      rec.times[t] = r;
      if (r.particles > r.cap) fail(`${k.id}@${t}: particles ${r.particles} > cap ${r.cap}`);
    }
    // Pass rules. 1UP: text and particles at 200/600 ms; HUD pulse visible at 200 ms; the single
    // message is gone by 1400 ms (it lasts 1200 ms) while the 3-award queue is still showing.
    const T = rec.times;
    if (k.level === undefined) {
      for (const t of [200, 600]) {
        if (!(T[t].particles > 0)) fail(`${k.id}@${t}: no particles`);
        if (!(T[t].messageRegion.greenTextPixels >= k.minText)) fail(`${k.id}@${t}: 1UP text not found`);
      }
      // The pulse starts with the first queued message.
      const pt = 200;
      if (!(T[pt].hudPulseChangedPixels > 50)) fail(`${k.id}@${pt}: HUD pulse not visible`);
      if (k.id === '1up' && T[1400].messageRegion.greenTextPixels !== 0) fail('1up@1400: message still visible after its lifetime');
      if (k.id === 'multi1up' && !(T[1400].messageRegion.greenTextPixels >= k.minText)) fail('multi1up@1400: queued 1UP text not found');
    } else {
      for (const t of TIMES) {
        if (!(T[t].particles > 0)) fail(`${k.id}@${t}: no particles`);
        if (!(T[t].textBand.titleGoldPaleExact >= 200)) fail(`${k.id}@${t}: CONGRATULATIONS text pixels missing`);
        if (!(T[t].textBand.levelGreenExact >= 150)) fail(`${k.id}@${t}: LEVEL text pixels missing`);
      }
    }
    C.fx[k.id] = rec;
  }
  await g.close();
});
const p = await b.newPage();
watch(p);
await p.setViewport({ width: 1100, height: 1250 });
const fresh = async () => { await p.goto(`${prod}?seed=7`, { waitUntil: 'load' }); await wait(700); };
const key = async (k, n = 1) => { for (let i = 0; i < n; i++) { await p.keyboard.press(k); await wait(70); } };
const st = () => p.evaluate(() => { const s = window.__kirobit.run().state; return { ui: window.__kirobit.ui(), tick: s.tick, lives: s.lives, level: s.levelNumber, phase: s.phase, inv: s.player.invulnerable, cell: s.player.cell }; });
const box = () => p.evaluate(() => { const c = document.getElementById('game'); const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, cw: c.width, ch: c.height, cssW: c.style.width, cssH: c.style.height, rendering: getComputedStyle(c).imageRendering }; });
const playerCrop = async (cell) => { const bx = await box(); const k = bx.w / bx.cw; return { x: bx.x + (cell.x * 24 - 36) * k, y: bx.y + (64 + cell.y * 24 - 36) * k, width: 96 * k, height: 96 * k }; };
// ---- 2. Menus: How to Play and Settings (fresh title each time).
await step('menus', async () => {
  await fresh();
  await shot(p, 'prod-title');
  await key('ArrowDown', 4); await key('Enter'); await wait(300);
  C.helpMode = (await st()).ui;
  await shot(p, 'prod-howto');
  await fresh();
  await key('ArrowDown', 2); await key('Enter'); await wait(300);
  C.settingsPanel = await p.evaluate(() => ({ open: !document.getElementById('audio-settings').hidden, title: document.querySelector('#audio-settings h2')?.textContent, fullscreen: !!document.getElementById('opt-fullscreen'), reduced: !!document.getElementById('opt-reduced-motion') }));
  await shot(p, 'prod-settings');
});
// ---- 2b. Production play-check: normal and cheat Runs start, the HUD lives counter shows the
// lives, and no query parameter or hash acts as a level skip / God Mode / debug switch.
const hudSig = () => p.evaluate(() => {
  const d = document.getElementById('game').getContext('2d').getImageData(0, 34, 170, 24).data;
  let bright = 0, sum = 0;
  for (let i = 0; i < d.length; i += 4) { if (d[i] + d[i + 1] + d[i + 2] > 600) bright++; sum = (sum * 31 + d[i] + d[i + 1] * 3 + d[i + 2] * 7) >>> 0; }
  return { bright, sum };
});
const summary = async () => { const s = await st(); return { ui: s.ui, lives: s.lives, level: s.level, phase: s.phase, hud: await hudSig() }; };
await step('prodChecks', async () => {
  await fresh(); await key('Enter'); await key('Enter'); await wait(1600);
  const normal = await summary();
  await p.screenshot({ path: `${OUT}/prod-normal-run-hud.png` });
  await p.goto(`${prod}?seed=7&level=50&skip=1&god=1&godmode=1&debug=1&cheat=1&lives=99&bombs=3&perf=0#level=50&god=1`, { waitUntil: 'load' });
  await wait(700); await key('Enter'); await key('Enter'); await wait(1600);
  const withParams = await summary();
  await p.screenshot({ path: `${OUT}/prod-query-params-ignored.png` });
  await fresh();
  for (const k of 'KIROGHOST') await key(`Key${k}`);
  await key('Enter'); await key('Enter'); await wait(1600);
  const cheat = await summary();
  await p.screenshot({ path: `${OUT}/prod-cheat-run-hud.png` });
  C.prodChecks = { normal, withParams, cheat };
  if (normal.ui !== 'play' || normal.lives !== 3 || normal.level !== 1) fail(`normal run did not start as expected: ${JSON.stringify(normal)}`);
  if (cheat.ui !== 'play' || cheat.lives !== 30 || cheat.level !== 1) fail(`cheat run did not start as expected: ${JSON.stringify(cheat)}`);
  if (!(cheat.hud.bright > normal.hud.bright) || cheat.hud.sum === normal.hud.sum) fail('HUD lives counter did not change between 3 and 30 lives');
  if (withParams.level !== 1 || withParams.lives !== 3 || withParams.ui !== 'play' || withParams.hud.sum !== normal.hud.sum) fail(`query parameters changed the game: ${JSON.stringify(withParams)}`);
});
// ---- 3. Cheat, level-start locator, gameplay-size sprite, death sequence and camera shake.
await step('play', async () => {
  await fresh();
  for (const k of 'KIROGHOST') await key(`Key${k}`);
  await wait(250);
  await shot(p, 'prod-cheat-banner');
  await key('Enter'); await key('Enter');
  await wait(200);
  const t0 = await st();
  await shot(p, 'prod-level-start-locator');
  await wait(1400);
  const t1 = await st();
  const hudBefore = await hudSig();
  C.cheat = { livesAtStart: t0.lives, mode: t0.ui };
  C.levelStartHold = { tickAt200ms: t0.tick, tickAt1600ms: t1.tick };
  await shot(p, 'prod-playing');
  const crop = await playerCrop(t1.cell);
  await shot(p, 'prod-player-gameplay-size', crop);
  await p.screenshot({ path: `${OUT}/prod-player-zoom4.png`, clip: { ...crop, scale: 4 } });
  // In-page sampler: every frame records lives and the applied camera offset.
  await p.evaluate(() => {
    window.__samples = [];
    const loop = (now) => { const s = window.__kirobit.run().state; window.__samples.push({ t: now, lives: s.lives, ...window.__kirobit.shake() }); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  });
  const waitDeath = async (lives, ms) => { for (let i = 0; i < ms / 40; i++) { await wait(40); const s = await st(); if (s.lives < lives) return s; } return null; };
  const d0 = await waitDeath(t1.lives, 180000);
  C.died = d0 !== null;
  if (!d0) return;
  await shot(p, 'prod-death-impact');
  await wait(220); await shot(p, 'prod-death-300ms');
  await wait(450); await shot(p, 'prod-death-800ms');
  await wait(500); await shot(p, 'prod-death-locator');
  await wait(900);
  const d2 = await st();
  await shot(p, 'prod-after-respawn');
  const hudAfter = await hudSig();
  C.hudLivesAfterDeath = { livesBefore: t1.lives, livesAfter: d2.lives, hudBefore, hudAfter, changed: hudBefore.sum !== hudAfter.sum };
  if (d2.lives < t1.lives && hudBefore.sum === hudAfter.sum) fail('HUD lives counter did not update after losing a life');
  const series = await p.evaluate(() => { const s = window.__samples; const i = s.findIndex((x, k) => k > 0 && x.lives < s[k - 1].lives); return i < 0 ? [] : s.slice(i, i + 80).map((x) => ({ t: Math.round(x.t - s[i].t), x: x.x, y: x.y })); });
  C.deathShake = { peakPx: series.reduce((m, s) => Math.max(m, Math.abs(s.x), Math.abs(s.y)), 0), framesOver4px: series.filter((s) => Math.max(Math.abs(s.x), Math.abs(s.y)) >= 4).length, sample: series.filter((_, i) => i % 4 === 0).slice(0, 14) };
  C.deathSequence = { tickAtDeath: d0.tick, tickAfterLocator: d2.tick, livesAfter: d2.lives, invulnerableAfter: d2.inv, respawnCell: d2.cell };
  await shot(p, 'prod-respawn-player-crop', await playerCrop(d2.cell));
  // Reduced motion: pause, Settings, tick the box, resume, wait for the next death.
  await key('Escape'); await wait(200); await key('ArrowDown', 1); await key('Enter'); await wait(250);
  await p.click('#opt-reduced-motion');
  C.reducedMotionChecked = await p.$eval('#opt-reduced-motion', (e) => e.checked);
  await key('Escape'); await wait(200); await key('Escape'); await wait(300);
  C.resumedMode = (await st()).ui;
  await p.evaluate(() => { window.__samples = []; });
  const r0 = await st();
  const d3 = await waitDeath(r0.lives, 180000);
  if (d3) {
    await wait(900);
    const peak = await p.evaluate(() => { const s = window.__samples; const i = s.findIndex((x, k) => k > 0 && x.lives < s[k - 1].lives); return s.slice(Math.max(0, i), i + 60).reduce((m, x) => Math.max(m, Math.abs(x.x), Math.abs(x.y)), 0); });
    C.reducedMotionDeathPeakPx = peak;
    await shot(p, 'prod-reduced-motion-death');
  } else C.reducedMotionDeathPeakPx = 'no second death within 180 s';
  // Fullscreen with F during play, then windowed scaling at common sizes.
  await key('KeyF'); await wait(700);
  C.fullscreenOn = await p.evaluate(() => document.fullscreenElement !== null);
  C.fullscreenCanvas = await box();
  await shot(p, 'prod-fullscreen');
  await key('KeyF'); await wait(700);
  C.fullscreenOff = await p.evaluate(() => document.fullscreenElement === null);
  C.windowed = {};
  for (const [w, h] of [[1920, 1080], [2560, 1440], [1280, 720], [1100, 1250]]) {
    await p.setViewport({ width: w, height: h }); await wait(300);
    const bx = await box();
    C.windowed[`${w}x${h}`] = { css: `${bx.cssW} x ${bx.cssH}`, scale: +(bx.w / bx.cw).toFixed(3), fits: bx.w <= w && bx.h <= h, rendering: bx.rendering };
  }
  await p.setViewport({ width: 1920, height: 1080 }); await wait(300);
  await shot(p, 'prod-windowed-1920x1080');
  await p.setViewport({ width: 1100, height: 1250 }); await wait(200);
});
// ---- 4. Character Workshop: draw, name, save, use, play with it, reload and keep it.
await step('workshop', async () => {
  await fresh();
  await key('ArrowDown', 5); await key('Enter'); await wait(400);
  C.workshopOpen = await p.evaluate(() => !document.getElementById('workshop').hidden);
  await shot(p, 'workshop-open');
  C.builtinProtagonists = await p.$$eval('#ws-builtins li', (els) => els.map((e) => e.dataset.id));
  await p.click('#ws-builtins li[data-id="lantern-wisp"] .use'); await wait(150);
  C.builtinInUse = await p.$eval('#workshop .ws-inuse', (e) => e.textContent);
  await p.click('.ws-palette button[data-color="5"]');
  const g = await p.$('#ws-grid');
  const gb = await g.boundingBox();
  const cell = gb.width / 18;
  const at = (x, y) => [gb.x + (x + 0.5) * cell, gb.y + (y + 0.5) * cell];
  // A pink stripe across the body and a pink belly patch, drawn with real mouse strokes.
  let [x0, y0] = at(3, 13); await p.mouse.move(x0, y0); await p.mouse.down();
  for (let x = 3; x <= 15; x++) { const [mx, my] = at(x, 13); await p.mouse.move(mx, my); }
  await p.mouse.up();
  for (let y = 15; y <= 17; y++) { [x0, y0] = at(6, y); await p.mouse.move(x0, y0); await p.mouse.down(); const [x1, y1] = at(12, y); await p.mouse.move(x1, y1, { steps: 6 }); await p.mouse.up(); }
  await p.click('#ws-undo'); await p.click('#ws-redo');
  await p.click('#ws-name', { clickCount: 3 });
  await p.keyboard.type('Pink Stripe');
  await p.click('#ws-save'); await wait(150);
  C.workshopAfterSave = await p.evaluate(() => ({ status: document.querySelector('#workshop .ws-status').textContent, listed: [...document.querySelectorAll('#ws-list li .nm')].map((e) => e.textContent) }));
  await p.click('#ws-list li .use'); await wait(150);
  C.workshopInUse = await p.$eval('#workshop .ws-inuse', (e) => e.textContent);
  await shot(p, 'workshop-saved-in-use');
  // Antagonist tab: 24x24 canvas, free drawing (no border rule), blue eyes, save, use.
  await p.click('.ws-tabs button[data-kind="squareman"]'); await wait(100);
  C.builtinAntagonists = await p.$$eval('#ws-builtins li', (els) => els.map((e) => e.dataset.id));
  await p.click('.ws-palette button[data-color="h"]');
  const sb = await g.boundingBox();
  const sc = sb.width / 24;
  for (const [x, y] of [[9, 10], [10, 10], [9, 11], [10, 11], [14, 10], [15, 10], [14, 11], [15, 11]]) await p.mouse.click(sb.x + (x + 0.5) * sc, sb.y + (y + 0.5) * sc);
  await p.click('#ws-name', { clickCount: 3 }); await p.keyboard.type('Blue Eyes');
  await p.click('#ws-save'); await wait(100);
  await p.click('#ws-list li .use'); await wait(100);
  await shot(p, 'workshop-squareman');
  await key('Escape'); await wait(200);
  C.workshopClosed = await p.evaluate(() => document.getElementById('workshop').hidden);
  await key('ArrowDown', 1); await key('Enter'); await key('Enter'); await wait(1600);
  const s = await st();
  C.playWithSkins = { mode: s.ui, lives: s.lives };
  await shot(p, 'prod-custom-skins-playing');
  await shot(p, 'prod-custom-kiro-crop', await playerCrop(s.cell));
  await p.screenshot({ path: `${OUT}/prod-custom-kiro-zoom4.png`, clip: { ...(await playerCrop(s.cell)), scale: 4 } });
  await fresh();
  C.persistedAfterReload = await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('kirobit.skins.v1') ?? '{}'); return { skins: (d.skins ?? []).map((k) => k.name), selected: d.selected }; });
  // Restore the original characters for the user's own playtest.
  await key('ArrowDown', 5); await key('Enter'); await wait(300);
  await p.click('#ws-use-original');
  await p.click('.ws-tabs button[data-kind="squareman"]'); await p.click('#ws-use-original');
  C.restoredOriginals = await p.evaluate(() => JSON.parse(localStorage.getItem('kirobit.skins.v1')).selected);
});
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
await b.close();
process.exit(report.errors.length === 0 ? 0 : 1);
