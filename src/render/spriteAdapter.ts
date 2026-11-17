// Sprite-backed DrawAdapter (task 24.6). Same interface as the Phase 1 placeholders, drawing
// from the atlas. Animation frames come from render time only; nothing touches the Simulation.

import type { Ctx2D, SurfaceFactory } from './layout';
import { isBuiltinId } from './builtins';
import { dimSprite, fleeingSprite, mirrorRows, skinSprite } from './skins';
import type { SkinKind } from './skins';
import type { CharacterDrawOptions, DrawAdapter, ItemDrawKind, TileInfo } from './placeholders';
import { SpriteAtlas } from './spriteCache';
import { ANTAGONIST_IDS, antagonistSprite } from './sprites/antagonists';
import { ALLY_PALETTES, FACINGS, GHOST_FRAMES, GHOST_W, PLAYER_PALETTE, ghostIconSprite, ghostSprite } from './sprites/ghost';
import type { Facing } from './sprites/ghost';
import { ITEM_SPRITES, WISP_FRAMES } from './sprites/items';
import { PROTAGONIST_IDS, protagonistSprite } from './sprites/protagonists';
import { SQUAREMAN_FRAMES, SQUAREMAN_STATES, squaremanSprite } from './sprites/squareman';
import type { SquaremanState } from './sprites/squareman';
import { DOOR_CLOSED, DOOR_OPEN, DOOR_WARNING, cellHash } from './sprites/world';
import { BIOMES, atlasName } from './biomes';
import type { BiomeId } from './biomes';

/** Item and world sprites are 12x12 drawn at 2x into 24 px tiles. */
export const SPRITE_SCALE = 2;
export const GHOST_FRAME_MS = 260;
export const SQUAREMAN_FRAME_MS = 200;
export const WISP_FRAME_MS = 180;
/** Protagonists are 18x24 art drawn 1:1 (nearest neighbour), centred in the 24 px tile. */
export const GHOST_SCALE = 1;
export const GHOST_OFFSET_X = Math.floor((24 - GHOST_W) / 2);
/** Antagonists are 24x24 art drawn 1:1 into the 24 px tile (same footprint as before). */
export const ANTAGONIST_SCALE = 1;

const PALETTE_KEYS = ['p', 'a0', 'a1', 'a2'] as const;

/** Rasterizes every sprite once. */
export function buildAtlas(factory: SurfaceFactory): SpriteAtlas {
  const atlas = new SpriteAtlas(factory, 512, 512);
  const palettes = [PLAYER_PALETTE, ...ALLY_PALETTES];
  palettes.forEach((pal, pi) => {
    for (let f = 0; f < GHOST_FRAMES; f++) {
      for (const facing of FACINGS) atlas.add(`ghost:${PALETTE_KEYS[pi]}:${f}:${facing}`, ghostSprite(f, facing, pal));
    }
    atlas.add(`ghost-icon:${PALETTE_KEYS[pi]}`, ghostIconSprite(pal));
  });
  for (const st of SQUAREMAN_STATES) {
    for (let f = 0; f < SQUAREMAN_FRAMES; f++) atlas.add(`sq:${st}:${f}`, squaremanSprite(st, f));
  }
  // Built-in characters: every protagonist frame and facing, every antagonist state.
  for (const id of PROTAGONIST_IDS) {
    for (let f = 0; f < GHOST_FRAMES; f++) {
      for (const facing of FACINGS) atlas.add(`ghost:${id}:${f}:${facing}`, protagonistSprite(id, f, facing));
    }
  }
  for (const id of ANTAGONIST_IDS) {
    for (const st of SQUAREMAN_STATES) {
      for (let f = 0; f < SQUAREMAN_FRAMES; f++) atlas.add(`sq:${id}:${st}:${f}`, antagonistSprite(id, st, f));
    }
  }
  for (const [k, def] of Object.entries(ITEM_SPRITES)) atlas.add(`item:${k}`, def);
  WISP_FRAMES.forEach((def, i) => atlas.add(`item:wisp:${i}`, def));
  // World tiles of every biome, namespaced `<name>@<biomeId>`.
  for (const b of BIOMES) {
    const n = (base: string): string => atlasName(base, b.id);
    const s = b.sprites;
    atlas.add(n('wall'), s.wall);
    atlas.add(n('wallHard'), s.hard);
    atlas.add(n('wall:top'), s.wallTop);
    atlas.add(n('wall:bottom'), s.wallBottom);
    atlas.add(n('hard:top'), s.hardTop);
    atlas.add(n('floor:shadow'), s.shadow);
    s.floors.forEach((def, i) => atlas.add(n(`floor:${i}`), def));
    atlas.add(n('rubble'), s.rubble);
    atlas.add(n('cage'), s.cage);
    atlas.add(n('gate'), s.gate);
    atlas.add(n('decor:wall0'), s.wallDecor[0]);
    atlas.add(n('decor:wall1'), s.wallDecor[1]);
    atlas.add(n('decor:floor'), s.floorDecor);
    if (s.ice) atlas.add(n('floor:ice'), s.ice);
  }
  atlas.add('door:open', DOOR_OPEN);
  atlas.add('door:closed', DOOR_CLOSED);
  atlas.add('door:warn', DOOR_WARNING);
  return atlas;
}

function facingOf(dir: CharacterDrawOptions['dir']): Facing {
  return dir ?? 'none';
}

export function squaremanStateFor(opts: CharacterDrawOptions): SquaremanState {
  if (opts.frightened) return 'fleeing';
  if (opts.empowered) return 'power';
  if (opts.graced) return 'respawn';
  if (opts.speedy) return 'speed';
  return 'normal';
}

/**
 * `factory` (optional) enables Character Workshop skins: each selected skin is rasterized once into
 * its own small atlas. Skins change pixels only; positions, sizes and every game rule stay the same.
 */
export function createSpriteAdapter(atlas: SpriteAtlas, factory?: SurfaceFactory): DrawAdapter {
  const custom: Partial<Record<SkinKind, SpriteAtlas>> = {};
  const builtin: Partial<Record<SkinKind, string>> = {};
  const draw = (ctx: Ctx2D, name: string, px: number, py: number, alpha = 1): void => {
    atlas.draw(ctx, name, px, py, SPRITE_SCALE, alpha);
  };
  let biome: BiomeId = 'haunted';
  const nm = (base: string): string => atlasName(base, biome);
  return {
    setSkin(kind, skin) {
      if (!skin || skin.kind !== kind || !factory) {
        delete custom[kind];
        delete builtin[kind];
        return;
      }
      // Built-ins animate from the shared atlas; customs rasterize into their own.
      if (isBuiltinId(kind, skin.id)) {
        delete custom[kind];
        builtin[kind] = skin.id;
        return;
      }
      delete builtin[kind];
      const a = new SpriteAtlas(factory, kind === 'kiro' ? 64 : 128, 32);
      a.add('n', skinSprite(skin.rows));
      if (kind === 'kiro') a.add('f', skinSprite(mirrorRows(skin.rows)));
      else {
        a.add('flee', fleeingSprite(skin.rows));
        a.add('dim', dimSprite(skin.rows));
      }
      custom[kind] = a;
    },

    setBiome(index) {
      biome = BIOMES[((Math.floor(index) % BIOMES.length) + BIOMES.length) % BIOMES.length]!.id;
    },

    drawCharacter(ctx, kind, px, py, _size, opts = {}) {
      const t = opts.timeMs ?? 0;
      const alpha = opts.alpha ?? 1;
      if (kind === 'hunter') {
        const sq = custom.squareman;
        if (sq) {
          const st = squaremanStateFor(opts);
          sq.draw(ctx, st === 'fleeing' ? 'flee' : st === 'respawn' ? 'dim' : 'n', px, py, ANTAGONIST_SCALE, alpha);
          return;
        }
        const frame = Math.floor(t / SQUAREMAN_FRAME_MS) % SQUAREMAN_FRAMES;
        const st = squaremanStateFor(opts);
        const id = builtin.squareman;
        const name = id === undefined ? `sq:${st}:${frame}` : `sq:${id}:${st}:${frame}`;
        atlas.draw(ctx, name, px, py, ANTAGONIST_SCALE, alpha);
        return;
      }
      const mine = kind === 'player' ? custom.kiro : undefined;
      if (mine) {
        const bob = Math.round(Math.sin(t / 300));
        mine.draw(ctx, opts.dir === 'left' ? 'f' : 'n', px + GHOST_OFFSET_X, py + bob, GHOST_SCALE, alpha);
        return;
      }
      const id = kind === 'player' ? builtin.kiro : undefined;
      const pal = id ?? (kind === 'player' ? 'p' : `a${(opts.index ?? 0) % 3}`);
      const frame = Math.floor(t / GHOST_FRAME_MS + (opts.index ?? 0) * 0.5) % GHOST_FRAMES;
      // Gentle float: one art pixel up and down.
      const bob = Math.round(Math.sin(t / 300 + (opts.index ?? 0)));
      atlas.draw(ctx, `ghost:${pal}:${frame}:${facingOf(opts.dir)}`, px + GHOST_OFFSET_X, py + bob, GHOST_SCALE, alpha);
    },

    drawItem(ctx, kind: ItemDrawKind, px, py, _size, timeMs) {
      if (kind === 'wisp') {
        const phase = ((px * 7 + py * 13) >>> 0) % 4;
        const f = (Math.floor(timeMs / WISP_FRAME_MS) + phase) % WISP_FRAMES.length;
        draw(ctx, `item:wisp:${f}`, px, py);
        return;
      }
      draw(ctx, `item:${kind}`, px, py);
    },

    drawDoor(ctx, px, py, _size, open, warning, timeMs) {
      draw(ctx, open ? 'door:open' : 'door:closed', px, py, open ? 0.9 : 1);
      if (warning > 0) {
        const pulse = 0.35 + 0.65 * Math.abs(Math.sin(timeMs / 90));
        draw(ctx, 'door:warn', px, py, pulse);
      }
    },

    drawCageInterior(ctx, px, py) {
      draw(ctx, nm('cage'), px, py);
    },

    drawCageGate(ctx, px, py) {
      draw(ctx, nm('gate'), px, py);
    },

    drawWall(ctx, px, py, _size, hard, info?: TileInfo) {
      draw(ctx, hard ? nm('wallHard') : nm('wall'), px, py);
      if (!info) return;
      if (info.openUp) draw(ctx, hard ? nm('hard:top') : nm('wall:top'), px, py);
      if (info.openDown && !hard) draw(ctx, nm('wall:bottom'), px, py);
      // Biome decoration on visible wall faces, chosen by a deterministic Cell hash.
      if (info.openDown && !hard) {
        const h = cellHash(info.x, info.y) % 23;
        if (h === 0) draw(ctx, nm('decor:wall0'), px, py);
        else if (h === 1) draw(ctx, nm('decor:wall1'), px, py);
      }
    },

    drawFloor(ctx, px, py, _size, rubble, info?: TileInfo) {
      if (rubble) draw(ctx, nm('rubble'), px, py);
      else draw(ctx, nm(`floor:${info ? cellHash(info.x, info.y) % 4 : 0}`), px, py);
      if (!info) return;
      if (info.ice) draw(ctx, atlasName('floor:ice', 'snow'), px, py);
      if (info.wallUp) draw(ctx, nm('floor:shadow'), px, py, 0.8);
      if (info.wallUp && info.wallLeft && cellHash(info.y, info.x) % 9 === 0) draw(ctx, nm('decor:floor'), px, py, 0.8);
    },
  };
}
