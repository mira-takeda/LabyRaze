// Dev-only visual gallery (second playtest): renders biomes, sprites, the locator and the death
// effect with the real Renderer so they can be screenshotted without playing. Not shipped:
// the production build only bundles the root index.html.
import { DEFAULT_CONFIG as cfg } from '../../src/core/config';
import type { GameEvent } from '../../src/core/events';
import { buildLevelState } from '../../src/core/sim';
import type { GameState } from '../../src/core/types';
import { AllyRenderer } from '../../src/render/allies';
import { BIOMES } from '../../src/render/biomes';
import { CelebrationLayer } from '../../src/render/celebration';
import { DoorsLayer } from '../../src/render/doorsLayer';
import { FeedbackLayer } from '../../src/render/feedback';
import { HudRenderer } from '../../src/render/hudRenderer';
import { canvasSize, domSurfaceFactory } from '../../src/render/layout';
import { Lighting } from '../../src/render/lighting';
import { ParticleBindings } from '../../src/render/particleBindings';
import { Emitters, ParticlePool } from '../../src/render/particles';
import { Renderer } from '../../src/render/renderer';
import { DEATH_MS, SpawnFx } from '../../src/render/spawnFx';
import { buildAtlas, createSpriteAdapter } from '../../src/render/spriteAdapter';
import { ANTAGONIST_IDS, ANTAGONIST_NAME, ANTAGONIST_STATES } from '../../src/render/sprites/antagonists';
import { FACINGS, GHOST_FRAMES } from '../../src/render/sprites/ghost';
import { PROTAGONIST_IDS, PROTAGONIST_NAME } from '../../src/render/sprites/protagonists';

const out = document.getElementById('out')!;
const atlas = buildAtlas(domSurfaceFactory);

function figure(id: string, label: string, w: number, h: number): CanvasRenderingContext2D {
  const f = document.createElement('figure');
  const c = document.createElement('canvas');
  c.id = id;
  c.width = w;
  c.height = h;
  const cap = document.createElement('figcaption');
  cap.textContent = label;
  f.append(c, cap);
  out.append(f);
  return c.getContext('2d')!;
}

function scene(id: string, label: string, state: GameState, opts: { spawn?: boolean; pool?: ParticlePool } = {}) {
  const size = canvasSize(state.maze.width, state.maze.height);
  const ctx = figure(id, label, size.width, size.height);
  const r = new Renderer(ctx, cfg, domSurfaceFactory, createSpriteAdapter(atlas));
  const pool = opts.pool ?? new ParticlePool(cfg.particleCap);
  const spawn = opts.spawn ? new SpawnFx() : undefined;
  r.layers = {
    doors: new DoorsLayer(),
    allies: new AllyRenderer(),
    feedback: new FeedbackLayer(pool, true),
    lighting: new Lighting(domSurfaceFactory),
    particles: pool,
    hud: new HudRenderer(domSurfaceFactory, size.width, atlas),
    spawn,
  };
  return { r, pool, spawn };
}

const level = (n: number): GameState => buildLevelState(7, { levelNumber: n, retryIndex: 0, lives: 3 }, cfg);

// 1. Every biome, one level each (biome changes every 5 levels).
BIOMES.forEach((b, i) => {
  const n = 1 + i * 5;
  const { r } = scene(`biome-${b.id}`, `L${n} ${b.name}`, level(n));
  r.draw(level(n), { alpha: 0, timeMs: 4000 });
});

// 2. Sprite sheets: all 13 LABYRAZE characters. 'sprites' shows every protagonist frame
//    and facing plus every antagonist state at gameplay size (1:1); 'sprites-big' shows
//    each character enlarged 4x with its name.
{
  const ctx = figure('sprites', 'Protagonists: every frame and facing at gameplay size; antagonists: every state', 460, 236);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#1a1030';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  PROTAGONIST_IDS.forEach((id, row) => {
    for (let f = 0; f < GHOST_FRAMES; f++) {
      FACINGS.forEach((facing, k) => atlas.draw(ctx, `ghost:${id}:${f}:${facing}`, 8 + (f * 5 + k) * 26, 6 + row * 28, 1, 1));
    }
  });
  ANTAGONIST_IDS.forEach((id, row) => {
    ANTAGONIST_STATES.forEach((st, k) => atlas.draw(ctx, `sq:${id}:${st}:0`, 292 + k * 30, 6 + row * 28, 1, 1));
  });
}
{
  const ctx = figure('sprites-big', 'All 15 characters enlarged 4x', 968, 264);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#1a1030';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  PROTAGONIST_IDS.forEach((id, k) => {
    const x = 8 + k * 120;
    atlas.draw(ctx, `ghost:${id}:0:none`, x + 24, 8, 4, 1);
    ctx.fillStyle = '#f2e9ff';
    ctx.fillText(PROTAGONIST_NAME[id], x + 60, 108);
  });
  ANTAGONIST_IDS.forEach((id, k) => {
    const x = 8 + k * 120;
    atlas.draw(ctx, `sq:${id}:normal:0`, x + 12, 132, 4, 1);
    ctx.fillStyle = '#f2e9ff';
    ctx.fillText(ANTAGONIST_NAME[id], x + 60, 232);
  });
}
// 3. Level-start locator (mid-animation) and 4. death explosion (mid-effect).
{
  const s = level(1);
  const a = scene('locator', 'Respawn / level-start locator', s, { spawn: true });
  a.spawn!.sync(s, 0);
  a.r.draw(s, { alpha: 0, timeMs: 260 });
}
{
  const s = level(1);
  const b = scene('death', 'Death: shake, flash, disintegration, embers', s, { spawn: true });
  const bindings = new ParticleBindings(new Emitters(b.pool), () => s);
  b.spawn!.sync(s, 0);
  const ev: GameEvent[] = [{ t: 'PlayerEaten', cell: { ...s.player.cell }, keysDropped: 0 }];
  b.r.onEvents(ev, 1000);
  bindings.handle(ev);
  for (let t = 1000; t <= 1000 + 260; t += 16) b.r.draw(s, { alpha: 0, timeMs: t });
  const c = scene('death-locator', 'Death then locator closing on the respawn Cell', s, { spawn: true });
  c.spawn!.sync(s, 0);
  c.r.onEvents(ev, 1000);
  for (let t = 1000; t <= 1000 + DEATH_MS + 300; t += 16) c.r.draw(s, { alpha: 0, timeMs: t });
}
// 5. 1UP and CONGRATULATIONS previews (task 37.4). The real FeedbackLayer, CelebrationLayer,
//    Renderer and ParticlePool run on a real generated level; the only synthetic parts are the
//    events (ExtraLife / LevelMilestone). Time is virtual: seek(ms) renders 16 ms frames up to
//    "ms" after the effect start, so screenshots at 200/600/1400 ms are reproducible.
const STAGE_T0 = 1000;
const STEP_MS = 16;
type Stage = { r: Renderer; pool: ParticlePool; state: GameState; cur: number };
let stageCtx: CanvasRenderingContext2D | null = null;
let stage: Stage | null = null;
let restart: (() => void) | null = null;

function startStage(state: GameState, events: GameEvent[]): void {
  const size = canvasSize(state.maze.width, state.maze.height);
  if (!stageCtx) stageCtx = figure('fx-stage', 'Dev preview: real feedback / celebration layers (virtual time)', size.width, size.height);
  const c = stageCtx.canvas;
  c.width = size.width;
  c.height = size.height;
  const pool = new ParticlePool(cfg.particleCap);
  const r = new Renderer(stageCtx, cfg, domSurfaceFactory, createSpriteAdapter(atlas));
  r.layers = {
    doors: new DoorsLayer(),
    allies: new AllyRenderer(),
    feedback: new FeedbackLayer(pool, true),
    celebration: new CelebrationLayer(pool),
    lighting: new Lighting(domSurfaceFactory),
    particles: pool,
    hud: new HudRenderer(domSurfaceFactory, size.width, atlas),
  };
  r.draw(state, { alpha: 0, timeMs: STAGE_T0 });
  r.onEvents(events, STAGE_T0);
  r.draw(state, { alpha: 0, timeMs: STAGE_T0 });
  stage = { r, pool, state, cur: 0 };
}

function begin(state: GameState, events: GameEvent[]): void {
  restart = () => startStage(state, events);
  restart();
}

function seek(ms: number): void {
  if (!stage || !restart) throw new Error('start a preview first');
  if (ms < stage.cur) restart();
  const s = stage!;
  while (s.cur + STEP_MS < ms) {
    s.cur += STEP_MS;
    s.r.draw(s.state, { alpha: 0, timeMs: STAGE_T0 + s.cur });
  }
  s.cur = ms;
  s.r.draw(s.state, { alpha: 0, timeMs: STAGE_T0 + ms });
}

const withLives = (n: number, lives: number): GameState => ({ ...level(n), lives });

const api = {
  stageId: 'fx-stage',
  show1UP(): void {
    begin(withLives(1, 4), [{ t: 'ExtraLife', lives: 4, milestone: 10000 }]);
  },
  showMulti1UP(): void {
    begin(withLives(1, 6), [
      { t: 'ExtraLife', lives: 4, milestone: 10000 },
      { t: 'ExtraLife', lives: 5, milestone: 20000 },
      { t: 'ExtraLife', lives: 6, milestone: 30000 },
    ]);
  },
  /** Same level and lives with no event: the reference frame for changed-pixel counts. */
  showBase(n: number, lives: number): void {
    begin(withLives(n, lives), []);
  },
  showCelebration(n: number): void {
    begin(level(n), [{ t: 'LevelMilestone', level: n }]);
  },
  seek,
  stats(): { particles: number; cap: number; dropped: number } {
    return { particles: stage?.pool.active ?? 0, cap: cfg.particleCap, dropped: stage?.pool.dropped ?? 0 };
  },
};
(window as unknown as { __gallery: typeof api }).__gallery = api;
(window as unknown as { __galleryReady: boolean }).__galleryReady = true;
