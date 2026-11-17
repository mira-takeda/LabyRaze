// LABYRAZE protagonist art: seven original 18x24 pixel-art spirits, defined in code.
// Same canvas and animation interface as the previous ghost (2 frames, facings with eye
// adaptation, left shown mirrored), all-new silhouettes. Bodies carry no eyes; eye stamps
// per facing keep every character expressive from every direction. Not traced from any
// mascot or arcade reference: ribbon wisp, lanterns, hood, fox mask, neon shard, blob.
import type { SpriteDef } from './format';
import { sprite } from './format';

export type ProtagonistId =
  | 'maze-spirit-prime'
  | 'maze-spirit'
  | 'lantern-wisp'
  | 'rune-ghost'
  | 'mask-wisp'
  | 'lab-lantern'
  | 'neon-sprite'
  | 'blob-spirit';

export const PROTAGONIST_IDS: readonly ProtagonistId[] = [
  'maze-spirit-prime',
  'maze-spirit',
  'lantern-wisp',
  'rune-ghost',
  'mask-wisp',
  'lab-lantern',
  'neon-sprite',
  'blob-spirit',
];

/** Default player character. */
export const DEFAULT_PROTAGONIST: ProtagonistId = 'maze-spirit-prime';

export const PROTAGONIST_NAME: Readonly<Record<ProtagonistId, string>> = {
  'maze-spirit-prime': 'Maze Spirit',
  'maze-spirit': 'Maze Spirit Classic',
  'lantern-wisp': 'Lantern Wisp',
  'rune-ghost': 'Rune Ghost',
  'mask-wisp': 'Mask Wisp',
  'lab-lantern': 'Lab Lantern',
  'neon-sprite': 'Neon Sprite',
  'blob-spirit': 'Blob Spirit',
};

export const PROTAGONIST_W = 18;
export const PROTAGONIST_H = 24;
export const PROTAGONIST_FRAMES = 2;

export type Facing = 'none' | 'up' | 'down' | 'left' | 'right';
export const FACINGS: readonly Facing[] = ['none', 'up', 'down', 'left', 'right'];

/** Eye pixels [dx, dy] stamped with 'o' at the facing origin ('right' uses 'none'). */
export interface EyeStamp {
  readonly cells: ReadonlyArray<readonly [number, number]>;
  readonly origin: Readonly<Record<'none' | 'up' | 'down', readonly [number, number]>>;
  /** Optional glint pixels stamped with 'G' over the eyes (same origin). */
  readonly spark?: ReadonlyArray<readonly [number, number]>;
}

export interface ProtagonistDef {
  readonly id: ProtagonistId;
  readonly frames: readonly (readonly string[])[];
  readonly eyes: EyeStamp;
  readonly palette: Readonly<Record<string, string>>;
}

const mirror = (rows: readonly string[]): string[] => rows.map((r) => [...r].reverse().join(''));

// ---------------------------------------------------------------------------
// 1. Maze Spirit Classic: a pale wisp head with dark oval eyes, a violet maze
//    ribbon crossing the face diagonally, a tapering tail and sparkles. Kept as an
//    alternative built-in; the prime Maze Spirit is the default.
// ---------------------------------------------------------------------------
const MAZE_SPIRIT_EYES: EyeStamp = {
  cells: [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
    [0, 2],
    [1, 2],
    [3, 0],
    [4, 0],
    [3, 1],
    [4, 1],
    [3, 2],
    [4, 2],
  ],
  origin: { none: [6, 6], up: [6, 5], down: [6, 7] },
};

const MAZE_SPIRIT_F0 = [
  '........WWWW......',
  '......HHWWWWWW....',
  '.....HWWWWWWWWS...',
  '....HWWWWWWWWWSSH.',
  '...HHWWWWWWWWWWS..',
  '...WWWWWWWWWWWWRRr',
  '...WWWWWWWWWWWRRr.',
  '...WWWWWWWWWWRRr..',
  '...WWWWWWWWWRRr...',
  '...WWWWWHWWRRr....',
  '...WWWWWWRRRrWS...',
  '....WWRRRrWWWS....',
  '...RRRWWWWWWS.....',
  '.RRRrWWWWWWS......',
  '....WWWWWWS.......',
  '....WWWWWS....H...',
  '....WWWWWS........',
  '....WWWWS.........',
  '.H.WWWWS..........',
  '...WWWWS..........',
  '...WWWS...........',
  '...WWW............',
  '...WW.............',
  '...W..............',
];

const MAZE_SPIRIT_F1 = [
  '........WWWW......',
  '......HHWWWWWW....',
  '.....HWWWWWWWWS...',
  '....HWWWWWWWWWSS..',
  '...HHWWWWWWWWWWS..',
  '...WWWWWWWWWWWWRRr',
  '...WWWWWWWWWWWRRr.',
  '...WWWWWWWWWWRRr..',
  '...WWWWWWWWWRRr...',
  '...WWWWWWWWRRr....',
  '...WWWWWWRHRrWS...',
  '....WWRRRrWWWS....',
  '...RRRWWWWWWS.....',
  '.RRRrWWWWWWS......',
  '....WWWWWWS.......',
  '....WWWWWS....H...',
  '....WWWWWS........',
  '....WWWWS.........',
  '.H.WWWWS..........',
  '...WWWWS..........',
  '....WWWS..........',
  '....WWW...........',
  '....WW............',
  '....W.............',
];

export const MAZE_SPIRIT_PALETTE = {
  W: '#cfe8ff',
  S: '#7f9fe0',
  H: '#ffffff',
  o: '#0b0614',
  R: '#8a4bff',
  r: '#4a2b9e',
} as const;

// ---------------------------------------------------------------------------
// 2. Lantern Wisp: a bronze maze lantern with a glowing wisp curled inside,
//    asymmetric side fins, a hanging rune charm and a dripping light tail.
// ---------------------------------------------------------------------------
const LANTERN_WISP_EYES: EyeStamp = {
  cells: [
    [0, 0],
    [0, 1],
    [3, 0],
    [3, 1],
  ],
  origin: { none: [8, 10], up: [8, 9], down: [8, 11] },
};

const LANTERN_WISP_F0 = [
  '........MM........',
  '.......MMMm.......',
  '......HMMMMMm.....',
  '.....MMMMMMMm.....',
  '....MMMMMMMMMm....',
  '....MGGGGGGGGm....',
  '....MGGGGGGGGmMM..',
  '....MGGWWWWGGmMM..',
  '..MMMGWWWWWWGmMM..',
  '..MMMGWWWWWWGmMM..',
  '..MMMGWWWWWWGm....',
  '..MMMGWWWWWWGm....',
  '.RRRMGWWWWWWGm....',
  '.RHRMGGWWWWGGm....',
  '.RRRMGGGGGGGGm....',
  '.RR.MGGGGGGGGm....',
  '....MMMMMMMMmm....',
  '.....MMMMMMmm.....',
  '.......GGG........',
  '.......GGS........',
  '......GGG.........',
  '.....GGH..........',
  '.....H............',
  '....HH............',
];

const LANTERN_WISP_F1 = [
  '........MM........',
  '.......MMMm.......',
  '......HMMMMMm.....',
  '.....MMMMMMMm.....',
  '....MMMMMMMMMm....',
  '....MGGGGGGGGm....',
  '....MGGGGGGGGmMM..',
  '....MGGWWWWGGmMM..',
  '..MMMGWWWWWWGmMM..',
  '..MMMGWWWWWWGmMM..',
  '..MMMGWWWWWWGm....',
  '..MMMGWGWWWWGm....',
  '.RRRMGWWWWWWGm....',
  '.RHRMGGWWWWGGm....',
  '.RRRMGGGGGGGGm....',
  '..RRMGGGGGGGGm....',
  '....MMMMMMMMmm....',
  '.....MMMMMMmm.....',
  '.......GGG........',
  '.......GGS........',
  '.......GGG........',
  '......GGH.........',
  '......H...........',
  '.....HH...........',
];

export const LANTERN_WISP_PALETTE = {
  M: '#c98a3d',
  m: '#6b4218',
  G: '#54f0e0',
  W: '#e8fff8',
  S: '#2fb3a5',
  H: '#fff3c9',
  o: '#0b3b36',
  R: '#8a4bff',
} as const;

// ---------------------------------------------------------------------------
// 3. Rune Ghost: a hooded spectre with a dark face, glowing cyan eyes, a gold
//    halo and a floating rune crystal on its chest. Tattered cloak hem.
// ---------------------------------------------------------------------------
const RUNE_GHOST_EYES: EyeStamp = {
  cells: [
    [0, 0],
    [0, 1],
    [3, 0],
    [3, 1],
  ],
  origin: { none: [7, 8], up: [7, 7], down: [7, 9] },
};

const RUNE_GHOST_F0 = [
  '......HH..HH......',
  '.....H..WW..H.....',
  '.....H.WWWW.H.....',
  '......WWWWWW......',
  '.....WWWWWWWW.....',
  '....WWWWWWWWWW....',
  '....WWrrrrrrWW....',
  '...WWrrrrrrrrWW...',
  '...WWrrrrrrrrWW...',
  '...WWrrrrrrrrWW...',
  '...WWrrrrrrrrWW...',
  '...WWWrrrrrrWWW...',
  '...WWWrrGGrrWWW...',
  '....WWrGGGGrWW....',
  '....WWrGmmGrWW....',
  '....WWrGGGGrWW....',
  '....WWWrmmGrWW....',
  '....WWWWHHWWW.....',
  '....WWWWWWWWW.....',
  '....WWWWWWWWW.....',
  '...WWWWWWWWWWW....',
  '...WWW.WWWWW......',
  '...WW...WWW.......',
  '....W....W........',
];

const RUNE_GHOST_F1 = [
  '......HH..HH......',
  '.....H..WW..H.....',
  '.....H.WWWW.......',
  '......WWWWWW......',
  '.....WWWWWWWW.....',
  '....WWWWWWWWWW....',
  '....WWrrrrrrWW....',
  '...WWrrrrrrrrWW...',
  '...WWrrrrrrrrWW...',
  '...WWrrrrrrrrWW...',
  '...WWrrrrrrrrWW...',
  '...WWWrrrrrrWWW...',
  '...WWWrrGGrrWWW...',
  '....WWrGGGGrWW....',
  '....WWrGmmGrWW....',
  '....WWrGGGGrWW....',
  '....WWWrmmGrWW....',
  '....WWWWHHWWW.....',
  '....WWWWWWWWW.....',
  '....WWWWWWWWW.....',
  '....WWWWWWWWW.....',
  '...WWW.WWWWW......',
  '...WW...WWW.W.....',
  '....W.............',
];

export const RUNE_GHOST_PALETTE = {
  W: '#e6dcff',
  S: '#9a8fd0',
  r: '#17102b',
  o: '#9ff0ff',
  H: '#ffd400',
  G: '#54e0ff',
  m: '#2b7fb8',
} as const;

// ---------------------------------------------------------------------------
// 4. Mask Wisp: a white fox mask with slanted glowing eyes, a gold bell, a
//    ribbon scarf and tassel, trailing a wisp tail.
// ---------------------------------------------------------------------------
const MASK_WISP_EYES: EyeStamp = {
  cells: [
    [0, 0],
    [1, 0],
    [1, 1],
    [2, 1],
    [4, 1],
    [5, 1],
    [5, 0],
    [6, 0],
  ],
  origin: { none: [5, 8], up: [5, 7], down: [5, 9] },
};

const MASK_WISP_F0 = [
  '...W..........W...',
  '..WWW........WWW..',
  '..WrW........WrW..',
  '.WrrrW......WrrrW.',
  '.WWrrWWWWWWWWrrWW.',
  '..WWWWWWRRWWWWWS..',
  '...WWWWWRWWWWWS...',
  '...WWrrrrrrrrWS...',
  '...WWrrrrrrrrWSRR.',
  '...WWrrrrrrrrWSRR.',
  '..MWWrrrrrrrrWSRR.',
  '.HMM.WWWWWWWWSRR..',
  '.MMm..WWWWWW..RRR.',
  'RRm....WWWW....R..',
  'RR.....WWWWWS.....',
  'RRR....WWWWWS.....',
  '.RRr..WWWWWS......',
  '.R....WWWWS.......',
  '.r....WWWS........',
  '.....WWWS.........',
  '.....WWS..........',
  '....WW............',
  '....W.............',
  '..................',
];

const MASK_WISP_F1 = [
  '...W..........W...',
  '..WWW........WWW..',
  '..WrW........WrW..',
  '.WrrrW......WrrrW.',
  '.WWrrWWWWWWWWrrWW.',
  '..WWWWWWRRWWWWWS..',
  '...WWWWWRWWWWWS...',
  '...WWrrrrrrrrWS...',
  '...WWrrrrrrrrWSRR.',
  '...WWrrrrrrrrWSRR.',
  '..MWWrrrrrrrrWSRR.',
  '.HMM.WWWWWWWWSRR..',
  '.MMm..WWWWWW..RRR.',
  'RRm....WWWW.....R.',
  '.RR....WWWWWS.....',
  '.RRR...WWWWWS.....',
  '..RR..WWWWWS......',
  '..R...WWWWS.......',
  '..r...WWWS........',
  '.....WWWS.........',
  '.....WWS..........',
  '.....WW...........',
  '.....W............',
  '..................',
];

export const MASK_WISP_PALETTE = {
  W: '#f2ecff',
  S: '#b9a8e0',
  r: '#241a3d',
  o: '#54f0ff',
  R: '#8a4bff',
  M: '#d9a800',
  m: '#7a5a00',
  H: '#ffffff',
} as const;

// ---------------------------------------------------------------------------
// 5. Lab Lantern: a copper laboratory lantern with a carry handle, a flask
//    emblem, a teal specimen core with bright eyes, bubbles and nub feet.
// ---------------------------------------------------------------------------
const LAB_LANTERN_EYES: EyeStamp = {
  cells: [
    [0, 0],
    [1, 0],
    [4, 0],
    [5, 0],
    [0, 1],
    [1, 1],
    [4, 1],
    [5, 1],
  ],
  origin: { none: [6, 12], up: [6, 11], down: [6, 13] },
};

const LAB_LANTERN_F0 = [
  '.......MMMM.......',
  '......M....m......',
  '.....M......m.....',
  '.....M......m.....',
  '....MMMMMMMMmm....',
  '....MMMMHHMMMm....',
  '....MMMMHHMMMm....',
  '....MMMHHHHMMm....',
  '...MGGGGGGGGGGm...',
  '...MGHGGGGGGGGm...',
  '...MGGrrrrrrGGm...',
  '...MGGrrrrrrHGm...',
  '...MGGrrrrrrGGm...',
  '...MGGrrrrrrGGm...',
  '...MGWrrrrrrGGm...',
  '...MGGrrrrrrGGm...',
  '...MGGGrrrrGGGm...',
  '...MGGGGGGGGHGm...',
  '...MGGGGGGGGGGm...',
  '...MMMMMMMMMMmm...',
  '....MMMMMMMMmm....',
  '.....MMMMMMMM.....',
  '.....GG...GG......',
  '.....GG...GG......',
];

const LAB_LANTERN_F1 = [
  '.......MMMM.......',
  '......M....m......',
  '.....M......m.....',
  '.....M......m.....',
  '....MMMMMMMMmm....',
  '....MMMMHHMMMm....',
  '....MMMMHHMMMm....',
  '....MMMHHHHMMm....',
  '...MGHGGGGGGGGm...',
  '...MGGGGGGGGGGm...',
  '...MGGrrrrrrHGm...',
  '...MGGrrrrrrGGm...',
  '...MGGrrrrrrGGm...',
  '...MGGrrrrrrGGm...',
  '...MGGrrrrrrGGm...',
  '...MGGrrrrrrHGm...',
  '...MGGGrrrrGGGm...',
  '...MGGGGGGGGGGm...',
  '...MGGGGGGGGGGm...',
  '...MMMMMMMMMMmm...',
  '....MMMMMMMMmm....',
  '.....MMMMMMMM.....',
  '.....GG...GG......',
  '.....GG...GG......',
];

export const LAB_LANTERN_PALETTE = {
  M: '#d08a4a',
  m: '#6b3d1a',
  G: '#3fe0c8',
  W: '#e8fff8',
  o: '#e8fff8',
  r: '#0f5f52',
  H: '#ffffff',
  S: '#1f8f78',
} as const;

// ---------------------------------------------------------------------------
// 6. Neon Sprite: an angular shard spirit: magenta wing, dark core with cyan
//    eyes, a signal fin and orbiting neon cubes.
// ---------------------------------------------------------------------------
const NEON_SPRITE_EYES: EyeStamp = {
  cells: [
    [0, 0],
    [0, 1],
    [3, 0],
    [3, 1],
  ],
  origin: { none: [8, 9], up: [8, 8], down: [8, 10] },
};

const NEON_SPRITE_F0 = [
  '..................',
  '.........H........',
  '........GGG.......',
  '..RR....GGG.......',
  '..RR...GGGG.......',
  '.......GGGG...H...',
  '.......rrrrrrS....',
  '......rrrrrrrS....',
  '....WRrrrrrrrS....',
  '..WWRRrrrrrrrSRR..',
  '.WWWRRrrrrrrrSRRR.',
  'WWRRRRrrrrrrrS.rr.',
  '..RRRRrrrrrrrSRR..',
  '...RRRrrrrrrrS....',
  '....R..rrrrrrS....',
  '........rrrr......',
  '......R......GG...',
  '.....r.G.....GG...',
  '......GG..........',
  '........R.........',
  '..........R.......',
  '...........r......',
  '..................',
  '..................',
];

const NEON_SPRITE_F1 = [
  '..................',
  '.........G........',
  '........GGG.......',
  '........GGG.......',
  '...RR..GGGG.......',
  '...RR..GGGG...H...',
  '.......rrrrrrS....',
  '......rrrrrrrS....',
  '....WRrrrrrrrS....',
  '..WWRRrrrrrrrSRR..',
  '.WWWRRrrrrrrrSRRR.',
  'WRRRRRrrrrrrrS.rr.',
  '..RRRRrrrrrrrSRR..',
  '...RRRrrrrrrrS....',
  '....R..rrrrrrS....',
  '........rrrrGG....',
  '......R.....GG....',
  '.....r.G..........',
  '......GG..........',
  '........R.........',
  '..........R.......',
  '...........r......',
  '..................',
  '..................',
];

export const NEON_SPRITE_PALETTE = {
  r: '#2a1650',
  R: '#ff4dd8',
  G: '#54f0ff',
  o: '#9ff0ff',
  H: '#ffffff',
  W: '#ff9ff0',
  S: '#170b30',
} as const;

// ---------------------------------------------------------------------------
// 7. Blob Spirit: a round cheerful blob with closed happy eyes, an open smile,
//    a cheek rune, blush and a dripping top droplet. It squashes when it moves.
// ---------------------------------------------------------------------------
const BLOB_SPIRIT_EYES: EyeStamp = {
  cells: [
    [0, 1],
    [1, 0],
    [2, 1],
    [4, 1],
    [5, 0],
    [6, 1],
  ],
  origin: { none: [5, 9], up: [5, 8], down: [5, 10] },
};

const BLOB_SPIRIT_F0 = [
  '............W.....',
  '..........HWW.....',
  '...........WW.....',
  '...........W......',
  '......WWWWWW......',
  '....HHWWWWWWWW....',
  '...HHWWWWWWWWWS...',
  '..WHWWWWWWWWWSS...',
  '..WWWWWWWWWWWWSS..',
  '..WWWWWWWWWWWWSS..',
  '..WWWWWWWWWWWWSS..',
  '..WWWRWWWWWWRWSS..',
  '..WrrWWooooWWWSS..',
  '..WrWWWoRRoWWWSS..',
  '..WWrWWWooWWWWS...',
  '..WWWWWWWWWWWWSS..',
  '..WWWWWWWWWWWSS...',
  '...WWWWWWWWWSS....',
  '....WWWWWWSS......',
  '.....WWWWWW.......',
  '....WW.....WWS....',
  '....SS.....SS.....',
  '..................',
  '..................',
];

const BLOB_SPIRIT_F1 = [
  '............W.....',
  '..........HWW.....',
  '...........W......',
  '..................',
  '......WWWWWW......',
  '....HHWWWWWWWW....',
  '...HHWWWWWWWWWS...',
  '..WHWWWWWWWWWSS...',
  '..WWWWWWWWWWWWSS..',
  '..WWWWWWWWWWWWSS..',
  '..WWWWWWWWWWWWSS..',
  '..WWWRWWWWWWRWSS..',
  '..WrrWWooooWWWSS..',
  '..WrWWWoRRoWWWSS..',
  '..WWrWWWooWWWWS...',
  '..WWWWWWWWWWWWSS..',
  '..WWWWWWWWWWWSS...',
  '...WWWWWWWWWSS....',
  '...WWWWWWWWSS.....',
  '....WWWWWWWWSS....',
  '...WW......WWS....',
  '...SS......SS.....',
  '..................',
  '..................',
];

export const BLOB_SPIRIT_PALETTE = {
  W: '#d8ccff',
  S: '#8f7fe0',
  H: '#ffffff',
  o: '#2a1b4a',
  R: '#ff8ab8',
  r: '#6a5aa8',
} as const;

// ---------------------------------------------------------------------------
// 8. Maze Spirit Prime (default): a curious sheet-ghost with a top tuft, two big
//    black oval eyes with cyan glints, lavender shading and a wavy three-lobe hem.
// ---------------------------------------------------------------------------
const MAZE_SPIRIT_PRIME_EYES: EyeStamp = {
  cells: [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
    [0, 2],
    [1, 2],
    [4, 0],
    [5, 0],
    [4, 1],
    [5, 1],
    [4, 2],
    [5, 2],
  ],
  spark: [
    [1, 0],
    [1, 1],
    [4, 0],
    [4, 1],
  ],
  origin: { none: [6, 5], up: [6, 4], down: [6, 6] },
};

const MAZE_SPIRIT_PRIME_F0 = [
  '..............W...',
  '.............WWS..',
  '.......WWWW.WWW...',
  '.....HHWWWWWWWW...',
  '....HWWWWWWWWWS...',
  '...WHWWWWWWWWWSS..',
  '...WWWWWWWWWWWSS..',
  '...WWWWWWWWWWWSS..',
  '...WWWWWWWWWWSSS..',
  '...WWWWWWWWWSSSS..',
  '..WWWWWWWWWWSSSS..',
  '..WWWWWWWWWSSSSS..',
  '..WWWWWWWWWSSSSS..',
  '..WWWWWWWWSSSSSS..',
  '...WWWWWWWSSSSSS..',
  '...WWWWWWWSSSSS...',
  '...WWWWWWSSSSSS...',
  '...WWWWWWSSSSSS...',
  '...WWW.WWWW.SSS...',
  '...WW..WWW..SS....',
  '...W...W...S......',
  '....W......S......',
  '...........S......',
  '..................',
];

const MAZE_SPIRIT_PRIME_F1 = [
  '..............W...',
  '.............WSS..',
  '.......WWWW.WWW...',
  '.....HHWWWWWWWW...',
  '....HWWWWWWWWWS...',
  '...WHWWWWWWWWWSS..',
  '...WWWWWWWWWWWSS..',
  '...WWWWWWWWWWWSS..',
  '...WWWWWWWWWWSSS..',
  '...WWWWWWWWWSSSS..',
  '..WWWWWWWWWWSSSS..',
  '..WWWWWWWWWSSSSS..',
  '..WWWWWWWWWSSSSS..',
  '..WWWWWWWWSSSSSS..',
  '...WWWWWWWSSSSSS..',
  '...WWWWWWWSSSSS...',
  '...WWWWWWSSSSSS...',
  '...WWWWWWSSSSSS...',
  '....WWW.WWW.SSS...',
  '....WW..WW..SS....',
  '....W...W...S.....',
  '.....W....S.......',
  '..........S.......',
  '..................',
];

export const MAZE_SPIRIT_PRIME_PALETTE = {
  W: '#f2ecff',
  S: '#c2aef0',
  H: '#ffffff',
  o: '#17102b',
  G: '#54e0ff',
} as const;

// ---------------------------------------------------------------------------
// Catalogue and drawing helpers.
// ---------------------------------------------------------------------------
const DEFS: Readonly<Record<ProtagonistId, ProtagonistDef>> = {
  'maze-spirit-prime': {
    id: 'maze-spirit-prime',
    frames: [MAZE_SPIRIT_PRIME_F0, MAZE_SPIRIT_PRIME_F1],
    eyes: MAZE_SPIRIT_PRIME_EYES,
    palette: MAZE_SPIRIT_PRIME_PALETTE,
  },
  'maze-spirit': { id: 'maze-spirit', frames: [MAZE_SPIRIT_F0, MAZE_SPIRIT_F1], eyes: MAZE_SPIRIT_EYES, palette: MAZE_SPIRIT_PALETTE },
  'lantern-wisp': { id: 'lantern-wisp', frames: [LANTERN_WISP_F0, LANTERN_WISP_F1], eyes: LANTERN_WISP_EYES, palette: LANTERN_WISP_PALETTE },
  'rune-ghost': { id: 'rune-ghost', frames: [RUNE_GHOST_F0, RUNE_GHOST_F1], eyes: RUNE_GHOST_EYES, palette: RUNE_GHOST_PALETTE },
  'mask-wisp': { id: 'mask-wisp', frames: [MASK_WISP_F0, MASK_WISP_F1], eyes: MASK_WISP_EYES, palette: MASK_WISP_PALETTE },
  'lab-lantern': { id: 'lab-lantern', frames: [LAB_LANTERN_F0, LAB_LANTERN_F1], eyes: LAB_LANTERN_EYES, palette: LAB_LANTERN_PALETTE },
  'neon-sprite': { id: 'neon-sprite', frames: [NEON_SPRITE_F0, NEON_SPRITE_F1], eyes: NEON_SPRITE_EYES, palette: NEON_SPRITE_PALETTE },
  'blob-spirit': { id: 'blob-spirit', frames: [BLOB_SPIRIT_F0, BLOB_SPIRIT_F1], eyes: BLOB_SPIRIT_EYES, palette: BLOB_SPIRIT_PALETTE },
};

export function protagonistDef(id: ProtagonistId): ProtagonistDef {
  return DEFS[id];
}

/** Body rows for a frame with the facing's eyes stamped ('left' is mirrored). */
export function protagonistRows(id: ProtagonistId, frame: number, facing: Facing): string[] {
  const def = DEFS[id];
  const grid = def.frames[frame % PROTAGONIST_FRAMES]!.map((r) => [...r]);
  const eff = facing === 'left' ? 'none' : facing === 'right' ? 'none' : facing;
  const [ox, oy] = def.eyes.origin[eff];
  for (const [dx, dy] of def.eyes.cells) {
    const x = ox + dx;
    const y = oy + dy;
    if (grid[y]?.[x] !== undefined) grid[y]![x] = 'o';
  }
  for (const [dx, dy] of def.eyes.spark ?? []) {
    const x = ox + dx;
    const y = oy + dy;
    if (grid[y]?.[x] !== undefined) grid[y]![x] = 'G';
  }
  const rows = grid.map((r) => r.join(''));
  return facing === 'left' ? mirror(rows) : rows;
}

export function protagonistSprite(
  id: ProtagonistId,
  frame: number,
  facing: Facing,
  palette: Readonly<Record<string, string>> = DEFS[id]!.palette,
): SpriteDef {
  return sprite(protagonistRows(id, frame, facing), palette);
}
