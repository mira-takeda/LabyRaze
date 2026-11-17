// Original world art (task 24.3): wall and WallHard tiles with autotile edges, floor tiles,
// Halloween decoration, Cage, Door open / closed / warning frames and destroyed-wall rubble.

import type { SpriteDef } from './format';
import { sprite } from './format';

const WALL_PAL = { b: '#3b2a5c', B: '#4c3876', h: '#6a52a0', d: '#251a3c', m: '#2f2149' } as const;
const HARD_PAL = { s: '#241838', S: '#2f2148', h: '#43336a', d: '#160e24', r: '#7a6aa0' } as const;
const FLOOR_PAL = { f: '#140c22', F: '#1a1030', g: '#21153a', x: '#0e0818' } as const;

/** Destructible wall: purple bricks. */
export const WALL = sprite(
  [
    'BBBBBmBBBBBm',
    'bbbbbmbbbbbm',
    'bbbbbmbbbbbm',
    'mmmmmmmmmmmm',
    'BBmBBBBBmBBB',
    'bbmbbbbbmbbb',
    'bbmbbbbbmbbb',
    'mmmmmmmmmmmm',
    'BBBBBmBBBBBm',
    'bbbbbmbbbbbm',
    'bbbbbmbbbbbm',
    'mmmmmmmmmmmm',
  ],
  WALL_PAL,
);

/** Indestructible wall: riveted stone, visibly different from bricks. */
export const WALL_HARD = sprite(
  [
    'SSSSSSSSSSSS',
    'SrsssssssrsS',
    'SsssssssssdS',
    'SssSSSSSssdS',
    'SssSsssSssdS',
    'SssSsssSssdS',
    'SssSsssSssdS',
    'SssSSSSSssdS',
    'SssssssssddS',
    'SrsssssssrdS',
    'SddddddddddS',
    'SSSSSSSSSSSS',
  ],
  HARD_PAL,
);

/** Light top edge (floor above) and dark bottom edge (floor below) for autotiling. */
export const WALL_EDGE_TOP = sprite(['hhhhhhhhhhhh', 'BBBBBBBBBBBB', ...Array<string>(10).fill('............')], WALL_PAL);
export const WALL_EDGE_BOTTOM = sprite([...Array<string>(10).fill('............'), 'dddddddddddd', 'dddddddddddd'], WALL_PAL);
export const HARD_EDGE_TOP = sprite(['hhhhhhhhhhhh', ...Array<string>(11).fill('............')], HARD_PAL);
/** Shadow cast on a floor Cell below a wall. */
export const FLOOR_SHADOW = sprite(['xxxxxxxxxxxx', 'xxxxxxxxxxxx', 'x.x.x.x.x.x.', ...Array<string>(9).fill('............')], FLOOR_PAL);

/** Four floor variants picked by a deterministic Cell hash. */
export const FLOORS: readonly SpriteDef[] = [
  sprite(Array<string>(12).fill('ffffffffffff'), FLOOR_PAL),
  sprite(['ffffffffffff', 'ffffffffffff', 'fffFffffffff', 'ffffffffffff', 'ffffffffgfff', 'ffffffffffff', 'ffffffffffff', 'fFffffffffff', 'ffffffffffff', 'ffffffFfffff', 'ffffffffffff', 'ffffffffffff'], FLOOR_PAL),
  sprite(['ffffffffffff', 'ffffffffffFf', 'ffffffffffff', 'ffffffffffff', 'fffgffffffff', 'ffffffffffff', 'ffffffffffff', 'ffffffffffff', 'ffffffgfffff', 'ffffffffffff', 'fFffffffffff', 'ffffffffffff'], FLOOR_PAL),
  sprite(['ffffffffffff', 'ffffffffffff', 'ffffffffffff', 'ffffFfffffff', 'ffffffffffff', 'ffffffffffff', 'ffffffffffFf', 'ffffffffffff', 'ffffffffffff', 'ffgfffffffff', 'ffffffffffff', 'ffffffffffff'], FLOOR_PAL),
];

/** Rubble left by a destroyed wall. */
export const RUBBLE = sprite(
  ['ffffffffffff', 'ffbfffffffff', 'fbBbfffffdff', 'ffbffffffBdf', 'ffffffffffff', 'fffffdbfffff', 'ffffdBBdffff', 'fffffddfffff', 'fbffffffffff', 'bBdfffffffbf', 'fbfffffffbBd', 'ffffffffffff'],
  { ...FLOOR_PAL, b: '#4c3876', B: '#6a52a0', d: '#2f2149' },
);

export const CAGE_INTERIOR = sprite(
  ['cccccccccccc', 'cCccccccccCc', 'cccccccccccc', 'cccccccccccc', 'cccccCcccccc', 'cccccccccccc', 'cccccccccccc', 'ccCccccccccc', 'cccccccccccc', 'cccccccccCcc', 'cccccccccccc', 'cccccccccccc'],
  { c: '#14213a', C: '#1c2d4f' },
);

export const CAGE_GATE = sprite(
  ['gggggggggggg', 'g.G..G..G..g', 'g.G..G..G..g', 'g.G..G..G..g', 'g.G..G..G..g', 'g.G..G..G..g', 'g.G..G..G..g', 'g.G..G..G..g', 'g.G..G..G..g', 'g.G..G..G..g', 'g.G..G..G..g', 'gggggggggggg'],
  { g: '#4a5aa0', G: '#9aacff' },
);

/** Doors: open frame (green glow), closed bars (red), warning overlay (amber). */
export const DOOR_OPEN = sprite(
  ['oo........oo', 'o..........o', '............', '............', '............', '............', '............', '............', '............', '............', 'o..........o', 'oo........oo'],
  { o: '#3fd67a' },
);
export const DOOR_CLOSED = sprite(
  ['RRRRRRRRRRRR', 'RrRrRrRrRrRR', 'RrRrRrRrRrRR', 'RrRrRrRrRrRR', 'RRRRRRRRRRRR', 'RrRrRrRrRrRR', 'RrRrRrRrRrRR', 'RrRrRrRrRrRR', 'RRRRRRRRRRRR', 'RrRrRrRrRrRR', 'RrRrRrRrRrRR', 'RRRRRRRRRRRR'],
  { R: '#8a1f24', r: '#d6463f' },
);
export const DOOR_WARNING = sprite(
  ['yyyyyyyyyyyy', 'y..........y', 'y..........y', 'y..........y', 'y..........y', 'y..........y', 'y..........y', 'y..........y', 'y..........y', 'y..........y', 'y..........y', 'yyyyyyyyyyyy'],
  { y: '#ffd23f' },
);

/** Halloween decoration drawn on wall tops and floor corners (static layer only). */
export const PUMPKIN = sprite(
  ['............', '.....s......', '....ss......', '..oooooo....', '.oOoOOoOo...', '.oeOOOOeo...', '.oOOooOOo...', '.ommmmmmo...', '..oooooo....', '............', '............', '............'],
  { s: '#3a7a2a', o: '#c9620f', O: '#ff8a1f', e: '#ffe14a', m: '#ffe14a' },
);
export const CANDLE = sprite(
  ['......y.....', '.....yY.....', '......y.....', '......w.....', '.....www....', '.....wWw....', '.....www....', '.....www....', '....dddd....', '............', '............', '............'],
  { y: '#ff9f2f', Y: '#ffe680', w: '#e6dcc0', W: '#ffffff', d: '#4a3a2a' },
);
export const COBWEB = sprite(
  ['wwwwww......', 'w.w..w......', 'ww.w.w......', 'w.ww.w......', 'w..ww.......', 'wwwww.......', '............', '............', '............', '............', '............', '............'],
  { w: '#6f6890' },
);

/** Deterministic hash of a Cell (render-side decoration only, never the Simulation PRNG). */
export function cellHash(x: number, y: number): number {
  let h = Math.imul(x + 0x9e37, 0x85ebca6b) ^ Math.imul(y + 0x79b9, 0xc2b2ae35);
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2f);
  return (h ^ (h >>> 16)) >>> 0;
}
