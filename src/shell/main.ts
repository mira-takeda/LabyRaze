// Bootstrap and play loop (tasks 22.7 and 30.1). Wires input, menus, the fixed-Tick loop, the
// Simulation, the sprite Renderer with lighting, particles and effects, the audio engine, high
// scores and the quality controller. The Shell owns all browser APIs; src/core never sees them.

import { createAudioEngine, browserAudioDeps } from '../audio/audioEngine';
import { DEFAULT_CONFIG } from '../core/config';
import type { GameEvent } from '../core/events';
import { setInvariantChecks } from '../core/invariants';
import { createRun, step } from '../core/sim';
import type { Run } from '../core/sim';
import { AllyRenderer } from '../render/allies';
import { DoorsLayer } from '../render/doorsLayer';
import { RoleFlash } from '../render/effects';
import { ExplosionLayer } from '../render/explosion';
import { FeedbackLayer } from '../render/feedback';
import { BiomeFx } from '../render/biomeFx';
import { CelebrationLayer } from '../render/celebration';
import { HudRenderer } from '../render/hudRenderer';
import { canvasSize, domSurfaceFactory } from '../render/layout';
import { Lighting } from '../render/lighting';
import { ParticleBindings } from '../render/particleBindings';
import { Emitters, ParticlePool } from '../render/particles';
import { QualityController } from '../render/quality';
import { Renderer } from '../render/renderer';
import { SpawnFx } from '../render/spawnFx';
import { buildAtlas, createSpriteAdapter } from '../render/spriteAdapter';
import { AudioSettingsPanel, LoadingIndicator } from './audioSettings';
import { CHEAT_SCORE_KEY, CheatState, cheatConfig, drawCheatBadge, drawCheatBanner } from './cheat';
import { celebrationHoldMs, isConfirmCode, loadDisplay, motionFor, pickScale, saveDisplay } from './display';
import { SkinStore } from './skinStore';
import { Workshop } from './workshop';
import { SKIN_KINDS, paletteMap } from '../render/skins';
import { DifficultyStore, difficultyById, difficultyConfig } from './difficulty';
import { HighScoreStore } from './highScores';
import { InputCapture } from './input';
import { KeyBindings } from './keybindings';
import { GameLoop } from './loop';
import { PerfHarness, botDirection } from './perfHarness';
import { ShellUi, drawScreen, drawUi, screenFor } from './screens';

declare global {
  interface Window {
    __kirobitPerf?: unknown;
    __kirobit?: { run: () => Run; ui: () => string; shake: () => { x: number; y: number } };
  }
}

function fail(message: string): void {
  document.body.textContent = message;
}

/** Run Seed: `?seed=N` for reproducible runs, otherwise derived from the clock (Shell only). */
function runSeed(params: URLSearchParams): number {
  const s = params.get('seed');
  if (s !== null && /^-?\d+$/.test(s)) return Number(s) | 0;
  return (Date.now() ^ Math.floor(performance.now() * 1000)) | 0;
}

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function boot(): void {
  const canvas = document.getElementById('game');
  if (!(canvas instanceof HTMLCanvasElement)) {
    fail('LABYRAZE could not find its game canvas.');
    return;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    fail('LABYRAZE needs a browser with 2D canvas support.');
    return;
  }
  const cfg = DEFAULT_CONFIG;
  setInvariantChecks(import.meta.env.DEV);
  const params = new URLSearchParams(location.search);
  const perfMode = params.get('perf') === '1';
  let run = createRun(runSeed(params), cfg);

  const size = canvasSize(run.state.maze.width, run.state.maze.height);
  canvas.width = size.width;
  canvas.height = size.height;
  // Aspect-correct scaling (no stretch): integer when it fills the space well, else exact fit;
  // image-rendering: pixelated keeps nearest-neighbour pixels. Also used in fullscreen.
  const fit = (): void => {
    const scale = pickScale(innerWidth, innerHeight, size.width, size.height);
    canvas.style.width = `${Math.floor(size.width * scale)}px`;
    canvas.style.height = `${Math.floor(size.height * scale)}px`;
  };
  fit();
  addEventListener('resize', fit);

  // Rendering: sprite atlas, layers, particles, lighting, quality.
  const atlas = buildAtlas(domSurfaceFactory);
  const adapter = createSpriteAdapter(atlas, domSurfaceFactory);
  const renderer = new Renderer(ctx, cfg, domSurfaceFactory, adapter);
  const quality = new QualityController(cfg.qualityTiers, 'high');
  const pool = new ParticlePool(cfg.particleCap);
  const bindings = new ParticleBindings(new Emitters(pool), () => run.state);
  const spawnFx = new SpawnFx();
  const feedback = new FeedbackLayer(pool, cfg.screenShake);
  const celebration = new CelebrationLayer(pool, celebrationHoldMs);
  spawnFx.celebrationMs = celebrationHoldMs;
  const hud = new HudRenderer(domSurfaceFactory, size.width, atlas);
  renderer.layers = {
    celebration,
    doors: new DoorsLayer(),
    allies: new AllyRenderer(),
    explosion: new ExplosionLayer(cfg.screenShake),
    feedback,
    lighting: new Lighting(domSurfaceFactory),
    particles: pool,
    hud,
    biomeFx: new BiomeFx(),
    roleFlash: new RoleFlash(),
    spawn: spawnFx,
    settings: () => quality.settings,
  };

  // Audio: lazy context on the first gesture, never throws.
  const baseUrl = new URL(import.meta.env.BASE_URL, location.href).href;
  const audio = createAudioEngine(browserAudioDeps(cfg.audio, baseUrl), cfg.speedCap);
  const indicator = new LoadingIndicator(document);
  document.body.appendChild(indicator.el);
  audio.onSoundtrack((s) => indicator.update(s));
  document.addEventListener('visibilitychange', () => audio.setVisible(document.visibilityState === 'visible'));
  addEventListener('pagehide', () => audio.flush());
  addEventListener('pointerdown', () => audio.unlock());

  // Menus, high scores, settings.
  const keyBindings = new KeyBindings(safeStorage());
  const ui = new ShellUi(keyBindings);
  const difficultyStore = new DifficultyStore(safeStorage());
  ui.difficulty = difficultyStore.load();
  /** Difficulty of the current Run (Shell only, never in GameState). */
  let runDifficulty = ui.difficulty;
  const scores = new HighScoreStore(safeStorage());
  const cheatScores = new HighScoreStore(safeStorage(), CHEAT_SCORE_KEY);
  let scoreList = scores.load();
  let cheatList = cheatScores.load();
  const cheat = new CheatState();
  /** Whether the current run started with the cheat armed (Shell only, never in GameState). */
  let runCheat = false;
  // Display settings: fullscreen (Settings checkbox or the F key) and reduced motion.
  const displayStore = safeStorage();
  const display = loadDisplay(displayStore, typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  renderer.motion = motionFor(display);
  const isFullscreen = (): boolean => document.fullscreenElement != null;
  const setFullscreen = (on: boolean): void => {
    if (on === isFullscreen()) return;
    const p = on ? document.documentElement.requestFullscreen?.() : document.exitFullscreen?.();
    void p?.catch(() => undefined);
  };
  // Character Workshop skins: cosmetic only (they change drawn pixels, never the Simulation).
  const skinStore = new SkinStore(safeStorage());
  const applySkins = (): void => {
    for (const k of SKIN_KINDS) adapter.setSkin?.(k, skinStore.selected(k));
    const kiro = skinStore.selected('kiro');
    feedback.playerSkin = kiro ? { rows: kiro.rows, palette: paletteMap } : null;
  };
  applySkins();
  const workshop = new Workshop(document, skinStore, {
    onChange: applySkins,
    onClose: () => canvas.focus(),
    download: (fileName, text) => {
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  });
  document.body.appendChild(workshop.root);
  const panel = new AudioSettingsPanel(document, audio, () => canvas.focus(), {
    fullscreen: isFullscreen,
    setFullscreen,
    reducedMotion: () => display.reducedMotion,
    setReducedMotion: (on) => {
      display.reducedMotion = on;
      renderer.motion = motionFor(display);
      saveDisplay(displayStore, display);
    },
  });
  document.addEventListener('fullscreenchange', () => {
    fit();
    panel.sync();
    canvas.focus();
  });
  document.body.appendChild(panel.root);
  canvas.tabIndex = 0;

  const input = new InputCapture(cfg.bombKey, keyBindings);

  // The first game honours ?seed=N (reproducible playtests); later games get a fresh Seed.
  let firstRun = true;
  const newRun = (): void => {
    runCheat = cheat.enabled;
    runDifficulty = ui.difficulty;
    const d = difficultyById(runDifficulty);
    hud.difficulty = { label: d.label, color: d.color };
    renderer.hunterSpeedPermille = d.permille;
    run = createRun(runSeed(firstRun ? params : new URLSearchParams()), difficultyConfig(runCheat ? cheatConfig(cfg) : cfg, runDifficulty));
    firstRun = false;
    renderer.invalidate();
    pool.clear();
    celebration.clear();
    spawnFx.clear();
    input.clear();
  };

  const onGameOver = (score: number, level: number): void => {
    const store = runCheat ? cheatScores : scores;
    if (store.qualifies(score) && score > 0) {
      ui.pendingScore = { score, level };
      ui.setMode('nameEntry', performance.now());
    } else {
      ui.setMode('scores', performance.now());
    }
  };

  addEventListener('keydown', (e: KeyboardEvent) => {
    audio.unlock();
    if (workshop.open) {
      workshop.handleKey(e);
      return;
    }
    if (panel.open) return;
    // F toggles fullscreen anywhere except text entry and key rebinding (and when F is a game key).
    if (e.code === 'KeyF' && !e.repeat && ui.mode !== 'nameEntry' && ui.mode !== 'controls' && keyBindings.actionFor('KeyF') === null) {
      e.preventDefault();
      setFullscreen(!isFullscreen());
      return;
    }
    const now = performance.now();
    if (ui.mode === 'play') {
      const r = ui.onKey(e.code, e.key, now);
      if (r.a !== 'none') {
        e.preventDefault();
        audio.playUi();
        return;
      }
      // The confirm key ends the milestone celebration hold early; play then continues.
      const act = keyBindings.actionFor(e.code);
      if ((act === 'confirm' || (act === null && isConfirmCode(e.code))) && spawnFx.skipCelebration(now)) {
        celebration.finish(now);
        e.preventDefault();
        return;
      }
      input.playing = run.state.phase === 'playing';
      input.onKeyDown(e, now);
      return;
    }
    if (ui.mode === 'title') {
      const c = cheat.onTitleKey(e.code, e.repeat, now);
      if (c !== 'pass') {
        e.preventDefault();
        if (c === 'toggled') audio.playUi();
        return;
      }
    }
    const r = ui.onKey(e.code, e.key, now);
    if (r.a !== 'none') e.preventDefault();
    switch (r.a) {
      case 'start':
        difficultyStore.save(ui.difficulty);
        newRun();
        audio.playUi();
        break;
      case 'quit':
        newRun();
        audio.playUi();
        break;
      case 'submitName':
        if (ui.pendingScore) {
          const entry = { ...ui.pendingScore, name: r.name, date: Date.now(), difficulty: runDifficulty };
          if (runCheat) cheatList = cheatScores.submit(entry);
          else scoreList = scores.submit(entry);
          ui.pendingScore = null;
        }
        audio.playUi();
        break;
      case 'openWorkshop':
        workshop.show();
        audio.playUi();
        break;
      case 'openSettings':
        panel.show();
        audio.playUi();
        break;
      case 'move':
      case 'select':
      case 'resume':
        audio.playUi();
        break;
      default:
        break;
    }
  });

  const perf = perfMode ? new PerfHarness() : null;
  let measuredTicks = 0;
  if (perf) input.observer = {
    queued: (now, ahead) => perf.pressed(now, measuredTicks, ahead),
    consumed: () => perf.consumed(performance.now(), measuredTicks + 1),
    discarded: () => perf.discard(),
  };
  if (perfMode) {
    ui.setMode('play', 0);
  }
  let botN = 0;
  let nextBotAt = 0;
  let frameIndex = 0;
  let levelEndAt = 0;
  let diedThisFrame = false;

  const loop = new GameLoop(
    {
      // The death animation and the respawn / level-start locator hold the Simulation (both
      // characters freeze); input pressed meanwhile stays buffered for the first Tick after it.
      running: () => {
        diedThisFrame = false;
        return ui.mode === 'play' && !panel.open && !spawnFx.holding(performance.now());
      },
      tick: (): GameEvent[] => {
        if (diedThisFrame) return []; // no further Ticks after a death in the same frame
        input.playing = run.state.phase === 'playing';
        const r = step(run, input.nextInput());
        measuredTicks++;
        perf?.ticked(measuredTicks);
        run = r.run;
        if (r.events.some((e) => e.t === 'PlayerEaten')) diedThisFrame = true;
        return r.events;
      },
      render: (alpha, now): void => {
        const t0 = performance.now();
        const settings = quality.settings;
        pool.density = settings.particleDensity;
        bindings.frame(run.state, frameIndex++, settings.trailEvery);
        renderer.draw(run.state, { alpha, timeMs: now });
        const screen = screenFor(run.state, difficultyById(runDifficulty));
        if (screen && run.state.phase === 'levelEnd') {
          drawScreen(ctx, screen, size.width, size.height, now, (now - levelEndAt) / 380);
        }
        if (ui.mode === 'play' && runCheat) drawCheatBadge(ctx, size.width);
        drawUi(ctx, ui, scoreList, size.width, size.height, now, {
          cheatScores: cheatList,
          cheatRun: runCheat,
          difficulty: run.state.phase === 'gameOver' ? difficultyById(runDifficulty) : undefined,
        });
        if (ui.mode === 'title' && cheat.enabled) drawCheatBanner(ctx, size.width, size.height, now);
        quality.record(performance.now() - t0, now);
      },
    },
    {
      request: (cb) => requestAnimationFrame(cb),
      cancel: (id) => cancelAnimationFrame(id),
    },
  );

  loop.bus.subscribe((events) => {
    renderer.onEvents(events, performance.now());
    bindings.handle(events);
    audio.handleEvents(events);
    for (const e of events) {
      if (e.t === 'GameOver') onGameOver(e.score, run.state.levelNumber);
      if (e.t === 'LevelEnded') levelEndAt = performance.now();
    }
  });

  if (perf) {
    const original = loop.frame.bind(loop);
    loop.frame = (now: number): void => {
      const workStart = performance.now();
      perf.pause(workStart, spawnFx.holding(workStart));
      if (now >= nextBotAt && run.state.phase === 'playing') {
        input.onKeyDown({ code: { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }[botDirection(botN++, 7)] }, workStart);
        nextBotAt = now + 400;
      }
      if (run.state.phase === 'levelEnd') input.onKeyDown({ code: 'Enter' });
      if (run.state.phase === 'gameOver') {
        newRun();
        ui.setMode('play', now);
      }
      original(now);
      if (perf.frame(workStart, performance.now(), now) && window.__kirobitPerf === undefined) {
        window.__kirobitPerf = { ...perf.result(), tier: quality.tier };
        console.info('KiroBit perf', window.__kirobitPerf);
      }
    };
  }

  // Read-only diagnostics for automated checks (development builds only). Production keeps
  // only window.__kirobitPerf (aggregate perf numbers for perf:browser); the live Run handle
  // stays out of the shipped bundle. Gallery verification must target the dev server.
  if (import.meta.env.DEV) {
    window.__kirobit = { run: () => run, ui: () => ui.mode, shake: () => ({ ...renderer.lastShake }) };
  }
  canvas.focus();
  loop.start();
}

if (typeof document !== 'undefined' && document.getElementById('game')) boot();
