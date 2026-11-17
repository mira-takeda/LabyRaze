// Biome themes (task 36.5). The environment changes every 5 levels:
// biome = floor((level - 1) / 5) mod 6 over haunted, red brick, jungle, metal, snow, neon.
// A BiomeDef holds the world-tile palettes and sprites, decoration, ambient light and the
// ambient particle flavour. All art is original, defined in code as palette-indexed pixels.
// Render-only: nothing here touches the Simulation.

import { BIOME_COUNT, biomeIndex } from '../core/biome';
import { hex } from './particles';
import type { SpriteDef } from './sprites/format';
import { recolor, sprite } from './sprites/format';
import {
  CAGE_GATE,
  CAGE_INTERIOR,
  CANDLE,
  COBWEB,
  FLOORS,
  FLOOR_SHADOW,
  HARD_EDGE_TOP,
  PUMPKIN,
  RUBBLE,
  WALL,
  WALL_EDGE_BOTTOM,
  WALL_EDGE_TOP,
  WALL_HARD,
} from './sprites/world';

export { biomeIndex, BIOME_COUNT };

export type BiomeId = 'haunted' | 'redBrick' | 'jungle' | 'metal' | 'snow' | 'neon';
export type ParticleFlavour = 'dust' | 'embers' | 'fireflies' | 'sparks' | 'snow' | 'neon';
export type Palette = Readonly<Record<string, string>>;

export interface BiomeSprites {
  wall: SpriteDef;
  hard: SpriteDef;
  wallTop: SpriteDef;
  wallBottom: SpriteDef;
  hardTop: SpriteDef;
  shadow: SpriteDef;
  floors: readonly SpriteDef[];
  rubble: SpriteDef;
  cage: SpriteDef;
  gate: SpriteDef;
  /** Drawn on visible wall faces (two variants). */
  wallDecor: readonly [SpriteDef, SpriteDef];
  /** Drawn on floor Cells next to a wall corner. */
  floorDecor: SpriteDef;
  /** Light-blue glossy ice floor tile (snow biome only). */
  ice?: SpriteDef;
}

export interface BiomeDef {
  id: BiomeId;
  index: number;
  /** Display name, e.g. "Red Brick Keep". */
  name: string;
  palettes: {
    wall: Palette;
    hard: Palette;
    floor: Palette;
    rubble: Palette;
    cage: Palette;
    gate: Palette;
  };
  sprites: BiomeSprites;
  /** Ambient light tint laid over the maze (low alpha, keeps readability). */
  ambient: { color: string; alpha: number };
  /** Cool glow colour of Spirit_Wisp lights in this biome (always cool, never warm). */
  wispGlow: string;
  particles: { flavour: ParticleFlavour; colors: readonly number[]; perSecond: number };
}

/** Level-start banner text, e.g. "LEVEL 6 - RED BRICK KEEP". */
export function bannerText(level: number): string {
  return `LEVEL ${Math.max(1, Math.floor(level))} - ${biomeFor(level).name.toUpperCase()}`;
}

// ---------------------------------------------------------------------------------------------
// Pixel helpers
// ---------------------------------------------------------------------------------------------

type SetPx = (x: number, y: number, c: string) => void;

/** Builds a 12x12 sprite on top of `base` rows (or a blank '.' grid) by editing single pixels. */
function art(pal: Palette, edit: (set: SetPx, fill: (x0: number, y0: number, x1: number, y1: number, c: string) => void) => void, base?: readonly string[]): SpriteDef {
  const g = (base ?? Array<string>(12).fill('............')).map((r) => [...r]);
  const set: SetPx = (x, y, c) => {
    if (x >= 0 && y >= 0 && y < 12 && x < 12) g[y]![x] = c;
  };
  const fill = (x0: number, y0: number, x1: number, y1: number, c: string): void => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, c);
  };
  edit(set, fill);
  return sprite(g.map((r) => r.join('')), pal);
}

// ---------------------------------------------------------------------------------------------
// Palettes
// ---------------------------------------------------------------------------------------------

const HAUNTED_PAL = {
  wall: { b: '#3b2a5c', B: '#4c3876', h: '#6a52a0', d: '#251a3c', m: '#2f2149' },
  hard: { s: '#241838', S: '#2f2148', h: '#43336a', d: '#160e24', r: '#7a6aa0' },
  floor: { f: '#140c22', F: '#1a1030', g: '#21153a', x: '#0e0818' },
} as const;

const REDBRICK_PAL = {
  wall: { b: '#8a3a2c', B: '#a84a38', h: '#cf6a4e', d: '#4e1f19', m: '#b8a48c' },
  hard: { s: '#3a2a2a', S: '#4a3636', h: '#6a5050', d: '#221515', r: '#a08878' },
  floor: { f: '#1c0f0d', F: '#241412', g: '#2e1a16', x: '#120908' },
} as const;

const JUNGLE_PAL = {
  wall: { b: '#3d5a34', B: '#4e7040', h: '#7ab05a', d: '#1f3320', m: '#2a4228', v: '#3fbf4a', V: '#8ae05a' },
  hard: { s: '#2c3a2a', S: '#36483a', h: '#52704a', d: '#16201a', r: '#8aa070' },
  floor: { f: '#0d1a10', F: '#122216', g: '#1a3020', x: '#08110a' },
} as const;

const METAL_PAL = {
  wall: { b: '#4a5560', B: '#5c6874', h: '#8896a4', d: '#2a323a', m: '#363f48', r: '#aab6c2', y: '#e8c030' },
  hard: { s: '#2a3038', S: '#343b44', h: '#4e5864', d: '#171b20', r: '#9aa6b2' },
  floor: { f: '#12161a', F: '#171c21', g: '#1e252b', x: '#0a0d10' },
} as const;

const SNOW_PAL = {
  wall: { b: '#8fb4d6', B: '#a9c9e6', h: '#f4fbff', d: '#5a7da0', m: '#7899bb', w: '#ffffff' },
  hard: { s: '#5a6f8a', S: '#6a809c', h: '#c8dcf0', d: '#364659', r: '#e8f4ff' },
  floor: { f: '#16243a', F: '#1b2c46', g: '#233858', x: '#0e1828' },
} as const;

const NEON_PAL = {
  wall: { b: '#120a30', B: '#1a1048', h: '#ff2bd6', d: '#08041a', m: '#2bf0ff' },
  hard: { s: '#0c0620', S: '#140a34', h: '#7a3cff', d: '#05020f', r: '#2bf0ff' },
  floor: { f: '#07040f', F: '#0b0618', g: '#14083a', x: '#040208' },
} as const;

/** Shared builder: world tiles recoloured and reshaped for one theme. */
function worldSprites(
  p: { wall: Palette; hard: Palette; floor: Palette },
  extra: {
    wall?: SpriteDef;
    floors?: readonly SpriteDef[];
    rubblePal?: Palette;
    cagePal: Palette;
    gatePal: Palette;
    wallDecor: readonly [SpriteDef, SpriteDef];
    floorDecor: SpriteDef;
    ice?: SpriteDef;
  },
): { sprites: BiomeSprites; rubble: Palette } {
  const rubble = { ...p.floor, b: p.wall.B ?? '#444444', B: p.wall.h ?? '#666666', d: p.wall.d ?? '#222222', ...(extra.rubblePal ?? {}) };
  return {
    rubble,
    sprites: {
      wall: extra.wall ?? recolor(WALL, p.wall),
      hard: recolor(WALL_HARD, p.hard),
      wallTop: recolor(WALL_EDGE_TOP, p.wall),
      wallBottom: recolor(WALL_EDGE_BOTTOM, p.wall),
      hardTop: recolor(HARD_EDGE_TOP, p.hard),
      shadow: recolor(FLOOR_SHADOW, p.floor),
      floors: extra.floors ?? FLOORS.map((f) => recolor(f, p.floor)),
      rubble: recolor(RUBBLE, rubble),
      cage: recolor(CAGE_INTERIOR, extra.cagePal),
      gate: recolor(CAGE_GATE, extra.gatePal),
      wallDecor: extra.wallDecor,
      floorDecor: extra.floorDecor,
      ...(extra.ice ? { ice: extra.ice } : {}),
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Decoration sprites
// ---------------------------------------------------------------------------------------------

const TORCH = art({ w: '#7a4a1e', o: '#ff7a1f', y: '#ffe36a', k: '#3a2410' }, (set, fill) => {
  fill(5, 6, 6, 10, 'w');
  fill(4, 10, 7, 10, 'k');
  fill(5, 3, 6, 5, 'o');
  fill(5, 4, 6, 4, 'y');
  set(5, 2, 'o');
});
const BRICK_CRACK = art({ k: '#2a0f0c', c: '#d8c8b0' }, (set) => {
  [[3, 2], [4, 3], [4, 4], [5, 5], [5, 6], [6, 7], [6, 8]].forEach(([x, y]) => set(x!, y!, 'k'));
  set(5, 4, 'c');
});
const STRAW = art({ s: '#6a5030', S: '#8a6a40' }, (set) => {
  [[2, 9], [3, 8], [4, 9], [5, 8], [6, 9], [7, 8]].forEach(([x, y], i) => set(x!, y!, i % 2 ? 'S' : 's'));
});

const VINE = art({ v: '#3fbf4a', V: '#8ae05a' }, (set) => {
  for (let y = 0; y < 9; y++) {
    set(3 + (y % 3 === 1 ? 1 : 0), y, 'v');
    if (y % 4 === 2) set(5, y, 'V');
  }
  for (let y = 0; y < 6; y++) set(8, y, y % 2 ? 'v' : 'V');
});
const FLOWER = art({ g: '#3fbf4a', p: '#ff6fb5', y: '#ffe36a', w: '#fff0f8' }, (set, fill) => {
  fill(6, 6, 6, 10, 'g');
  set(5, 8, 'g');
  set(7, 9, 'g');
  set(6, 4, 'p');
  set(5, 5, 'p');
  set(7, 5, 'p');
  set(6, 6, 'p');
  set(5, 4, 'w');
  set(6, 5, 'y');
});
const MOSS = art({ v: '#2d7a38', V: '#4ea84a' }, (set) => {
  [[1, 9], [2, 8], [2, 9], [3, 9], [4, 10], [3, 10], [9, 9], [10, 10], [9, 10]].forEach(([x, y], i) => set(x!, y!, i % 3 ? 'v' : 'V'));
});

const PIPE = art({ p: '#7a8794', P: '#aab6c2', d: '#2a323a' }, (set, fill) => {
  fill(0, 4, 11, 4, 'P');
  fill(0, 5, 11, 6, 'p');
  fill(0, 7, 11, 7, 'd');
  fill(4, 3, 4, 8, 'd');
  fill(8, 3, 8, 8, 'd');
  set(4, 5, 'P');
});
const HAZARD = art({ y: '#e8c030', k: '#1a1a1a' }, (set, fill) => {
  fill(0, 9, 11, 10, 'y');
  for (let x = 0; x < 12; x += 4) fill(x, 9, Math.min(11, x + 1), 10, 'k');
  set(0, 9, 'k');
});
const GRATE = art({ k: '#05070a', g: '#3a4450' }, (set, fill) => {
  fill(2, 2, 9, 9, 'k');
  for (let x = 2; x <= 9; x += 2) fill(x, 2, x, 9, 'g');
});

const ICICLES = art({ i: '#cfeeff', I: '#ffffff' }, (set) => {
  [[1, 3], [3, 4], [5, 2], [7, 5], [9, 3]].forEach(([x, y]) => {
    for (let k = 0; k < y!; k++) set(x!, k, k === 0 ? 'I' : 'i');
  });
});
const SNOW_LUMP = art({ w: '#ffffff', s: '#cfe6fb' }, (set, fill) => {
  fill(2, 2, 6, 3, 'w');
  fill(1, 3, 7, 3, 'w');
  fill(2, 4, 6, 4, 's');
});
const DRIFT = art({ w: '#e6f4ff', s: '#b4d4f0' }, (set, fill) => {
  fill(1, 9, 5, 10, 'w');
  fill(2, 8, 4, 8, 'w');
  fill(6, 10, 9, 10, 's');
});

const NEON_SIGN = art({ h: '#ff2bd6', m: '#2bf0ff' }, (set, fill) => {
  fill(2, 5, 9, 5, 'h');
  fill(2, 7, 9, 7, 'm');
  set(2, 6, 'h');
  set(9, 6, 'm');
});
const NEON_DOT = art({ h: '#ff2bd6', w: '#ffffff' }, (set, fill) => {
  fill(5, 5, 6, 6, 'h');
  set(5, 5, 'w');
});
const NEON_NODE = art({ m: '#2bf0ff', w: '#ffffff' }, (set, fill) => {
  fill(0, 11, 11, 11, 'm');
  fill(11, 0, 11, 11, 'm');
  set(11, 11, 'w');
});

// ---------------------------------------------------------------------------------------------
// Special wall and floor tiles
// ---------------------------------------------------------------------------------------------

const JUNGLE_WALL = art(JUNGLE_PAL.wall, (set) => {
  [[1, 0], [1, 1], [2, 1], [2, 2], [8, 0], [9, 1], [9, 2], [4, 7], [5, 7], [5, 8], [10, 8], [10, 9], [0, 10], [1, 10]].forEach(([x, y], i) => set(x!, y!, i % 3 === 0 ? 'V' : 'v'));
}, WALL.rows);

const METAL_WALL = art(METAL_PAL.wall, (set, fill) => {
  fill(0, 0, 11, 11, 'b');
  fill(0, 0, 11, 0, 'm');
  fill(0, 11, 11, 11, 'm');
  fill(0, 0, 0, 11, 'm');
  fill(11, 0, 11, 11, 'm');
  fill(1, 1, 10, 1, 'B');
  fill(1, 10, 10, 10, 'd');
  for (let x = 1; x < 11; x++) set(x, 5, x % 2 ? 'y' : 'd'); // hazard stripe band
  for (let x = 1; x < 11; x++) set(x, 6, x % 2 ? 'd' : 'y');
  set(2, 2, 'r');
  set(9, 2, 'r');
  set(2, 9, 'r');
  set(9, 9, 'r');
});

const SNOW_WALL = art(SNOW_PAL.wall, (set, fill) => {
  fill(0, 0, 11, 1, 'w');
  set(1, 2, 'w');
  set(5, 2, 'w');
  set(9, 2, 'w');
  set(3, 3, 'w');
}, WALL.rows);

const NEON_WALL = art(NEON_PAL.wall, (set, fill) => {
  fill(0, 0, 11, 11, 'b');
  fill(1, 1, 10, 10, 'B');
  fill(0, 0, 11, 0, 'h');
  fill(0, 11, 11, 11, 'h');
  fill(0, 0, 0, 11, 'h');
  fill(11, 0, 11, 11, 'h');
  fill(0, 5, 11, 5, 'm');
  fill(5, 0, 5, 11, 'm');
  set(5, 5, 'h');
});

const NEON_FLOORS: readonly SpriteDef[] = [0, 1, 2, 3].map((v) =>
  art(NEON_PAL.floor, (set, fill) => {
    fill(0, 0, 11, 11, 'f');
    // faint glowing grid lines on the Cell edge, one extra node per variant
    fill(0, 0, 11, 0, 'g');
    fill(0, 0, 0, 11, 'g');
    if (v > 0) set(3 * v, 3 * v, 'F');
  }),
);

/** Light-blue glossy ice floor (snow biome). */
const ICE_TILE = art({ a: '#9fd8ff', A: '#c8ecff', w: '#ffffff', d: '#6fb4e8' }, (set, fill) => {
  fill(0, 0, 11, 11, 'a');
  fill(0, 11, 11, 11, 'd');
  fill(11, 0, 11, 11, 'd');
  fill(1, 1, 10, 2, 'A');
  [[2, 2], [3, 3], [4, 4], [5, 5]].forEach(([x, y]) => set(x!, y!, 'w')); // glossy diagonal glint
  [[8, 7], [9, 8]].forEach(([x, y]) => set(x!, y!, 'w'));
});

// ---------------------------------------------------------------------------------------------
// Definitions
// ---------------------------------------------------------------------------------------------

function build(id: BiomeId, index: number, name: string, pal: { wall: Palette; hard: Palette; floor: Palette }, extra: Parameters<typeof worldSprites>[1], rest: Pick<BiomeDef, 'ambient' | 'wispGlow' | 'particles'>): BiomeDef {
  const w = worldSprites(pal, extra);
  return {
    id,
    index,
    name,
    palettes: { wall: pal.wall, hard: pal.hard, floor: pal.floor, rubble: w.rubble, cage: extra.cagePal, gate: extra.gatePal },
    sprites: w.sprites,
    ...rest,
  };
}

const HAUNTED_RUBBLE_PAL = { ...HAUNTED_PAL.floor, b: '#4c3876', B: '#6a52a0', d: '#2f2149' };

export const BIOMES: readonly BiomeDef[] = [
  {
    id: 'haunted',
    index: 0,
    name: 'Haunted Hollow',
    palettes: {
      wall: HAUNTED_PAL.wall,
      hard: HAUNTED_PAL.hard,
      floor: HAUNTED_PAL.floor,
      rubble: HAUNTED_RUBBLE_PAL,
      cage: { c: '#14213a', C: '#1c2d4f' },
      gate: { g: '#4a5aa0', G: '#9aacff' },
    },
    // The current look: reuses the original world sprites unchanged.
    sprites: {
      wall: WALL,
      hard: WALL_HARD,
      wallTop: WALL_EDGE_TOP,
      wallBottom: WALL_EDGE_BOTTOM,
      hardTop: HARD_EDGE_TOP,
      shadow: FLOOR_SHADOW,
      floors: FLOORS,
      rubble: RUBBLE,
      cage: CAGE_INTERIOR,
      gate: CAGE_GATE,
      wallDecor: [CANDLE, PUMPKIN],
      floorDecor: COBWEB,
    },
    ambient: { color: '#7a4cff', alpha: 0.05 },
    wispGlow: '#7fe8ff',
    particles: { flavour: 'dust', colors: [hex('#a58cff'), hex('#6a52a0')], perSecond: 5 },
  },
  build('redBrick', 1, 'Red Brick Keep', REDBRICK_PAL, {
    cagePal: { c: '#1a1c2e', C: '#26293f' },
    gatePal: { g: '#8a6a40', G: '#e0b878' },
    wallDecor: [TORCH, BRICK_CRACK],
    floorDecor: STRAW,
  }, {
    ambient: { color: '#ff6a3a', alpha: 0.06 },
    wispGlow: '#7fd8ff',
    particles: { flavour: 'embers', colors: [hex('#ff7a2f'), hex('#ffc060')], perSecond: 6 },
  }),
  build('jungle', 2, 'Jungle Ruins', JUNGLE_PAL, {
    wall: JUNGLE_WALL,
    cagePal: { c: '#10231c', C: '#18382a' },
    gatePal: { g: '#5a7a3a', G: '#b8e07a' },
    wallDecor: [VINE, FLOWER],
    floorDecor: MOSS,
  }, {
    ambient: { color: '#4aff8a', alpha: 0.05 },
    wispGlow: '#7fe8ff',
    particles: { flavour: 'fireflies', colors: [hex('#d8ff6a'), hex('#8aff5a')], perSecond: 4 },
  }),
  build('metal', 3, 'Iron Foundry', METAL_PAL, {
    wall: METAL_WALL,
    cagePal: { c: '#101a24', C: '#192838' },
    gatePal: { g: '#6a7a8a', G: '#c8d6e6' },
    wallDecor: [PIPE, HAZARD],
    floorDecor: GRATE,
  }, {
    ambient: { color: '#9ad0ff', alpha: 0.05 },
    wispGlow: '#7fe8ff',
    particles: { flavour: 'sparks', colors: [hex('#ffb347'), hex('#fff0c0')], perSecond: 5 },
  }),
  build('snow', 4, 'Frostbite Peaks', SNOW_PAL, {
    wall: SNOW_WALL,
    cagePal: { c: '#13233f', C: '#1d3560' },
    gatePal: { g: '#6a8ac0', G: '#d8ecff' },
    wallDecor: [ICICLES, SNOW_LUMP],
    floorDecor: DRIFT,
    ice: ICE_TILE,
  }, {
    ambient: { color: '#a8d8ff', alpha: 0.07 },
    wispGlow: '#9fe8ff',
    particles: { flavour: 'snow', colors: [hex('#ffffff'), hex('#d8ecff')], perSecond: 12 },
  }),
  build('neon', 5, 'Neon Grid', NEON_PAL, {
    wall: NEON_WALL,
    floors: NEON_FLOORS,
    cagePal: { c: '#0a0a2a', C: '#12124a' },
    gatePal: { g: '#7a3cff', G: '#2bf0ff' },
    wallDecor: [NEON_SIGN, NEON_DOT],
    floorDecor: NEON_NODE,
  }, {
    ambient: { color: '#b24bff', alpha: 0.08 },
    wispGlow: '#5fd0ff',
    particles: { flavour: 'neon', colors: [hex('#ff2bd6'), hex('#2bf0ff'), hex('#b24bff')], perSecond: 7 },
  }),
];

/** Biome for a level: floor((level - 1) / 5) mod 6. */
export function biomeFor(level: number): BiomeDef {
  return BIOMES[biomeIndex(level)]!;
}

/** Atlas name of a world sprite for a biome, e.g. `wall@redBrick`. */
export function atlasName(base: string, id: BiomeId): string {
  return `${base}@${id}`;
}
