// LABYRAZE antagonist art: six original 24x24 pixel-art haunts, defined in code.
// The hunter canvas grows from 12x12 to 24x24 drawn 1:1 (same 24 px tile footprint,
// same hitboxes); bodies animate over 2 frames and every state (normal, power, speed,
// respawn, fleeing) keeps its own face and palette while the silhouette never changes.
import type { SpriteDef } from './format';
import { overlay, sprite } from './format';

export type AntagonistId =
  | 'shadow-bite-prime'
  | 'lantern-maw'
  | 'cursed-mask'
  | 'shadow-bite'
  | 'pumpkin-tech'
  | 'grave-wisp'
  | 'night-idol';

export const ANTAGONIST_IDS: readonly AntagonistId[] = [
  'shadow-bite-prime',
  'lantern-maw',
  'cursed-mask',
  'shadow-bite',
  'pumpkin-tech',
  'grave-wisp',
  'night-idol',
];

/** Default antagonist. */
export const DEFAULT_ANTAGONIST: AntagonistId = 'shadow-bite-prime';

export const ANTAGONIST_NAME: Readonly<Record<AntagonistId, string>> = {
  'shadow-bite-prime': 'Shadow Bite',
  'lantern-maw': 'Lantern Maw',
  'cursed-mask': 'Cursed Mask',
  'shadow-bite': 'Shadow Bite Classic',
  'pumpkin-tech': 'Pumpkin Tech',
  'grave-wisp': 'Grave Wisp',
  'night-idol': 'Night Idol',
};

export const ANTAGONIST_W = 24;
export const ANTAGONIST_H = 24;
export const ANTAGONIST_FRAMES = 2;

export type AntagonistState = 'normal' | 'power' | 'speed' | 'respawn' | 'fleeing';
export const ANTAGONIST_STATES: readonly AntagonistState[] = ['normal', 'power', 'speed', 'respawn', 'fleeing'];

/**
 * Face patch stamped onto the body per state and frame. power/speed/respawn fall back to
 * the normal geometry (their palettes differ) unless the character defines its own; fleeing
 * always has its own worried face.
 */
export interface FacePatch {
  readonly dx: number;
  readonly dy: number;
  readonly normal: readonly (readonly string[])[];
  readonly fleeing: readonly (readonly string[])[];
  readonly power?: readonly (readonly string[])[];
  readonly respawn?: readonly (readonly string[])[];
}

export interface AntagonistDef {
  readonly id: AntagonistId;
  readonly frames: readonly (readonly string[])[];
  readonly face: FacePatch;
  readonly palettes: Readonly<Record<AntagonistState, Readonly<Record<string, string>>>>;
}

/** Dimmed copy (respawn grace): same 0.55 factor as the Workshop dim. */
function dimPalette(palette: Readonly<Record<string, string>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, hex] of Object.entries(palette)) {
    const v = parseInt(hex.replace('#', ''), 16);
    const f = (n: number): string => Math.round(n * 0.55).toString(16).padStart(2, '0');
    out[k] = `#${f((v >> 16) & 255)}${f((v >> 8) & 255)}${f(v & 255)}`;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Shadow Bite Classic: a smoky dark cube with ember eyes and a jagged
// fang-filled maw. Smoke wisps curl off the silhouette; ichor drips below.
// Kept as an alternative built-in; the prime Shadow Bite is the default.
// ---------------------------------------------------------------------------
const SHADOW_BITE_FACE: FacePatch = {
  dx: 6,
  dy: 9,
  normal: [
    [
      '.eee....eee.',
      '.eee....eee.',
      '............',
      '.mmmmmmmmmm.',
      '.mfmfmfmfmm.',
      '.mmmmmmmmmm.',
      '.mmfmfmffmm.',
      '..mmmmmmmm..',
    ],
    [
      '.eEe....eEe.',
      '.eee....eee.',
      '............',
      '.mmmmmmmmmm.',
      '.mmfmfmfmfm.',
      '.mmmmmmmmmm.',
      '.mfmffmfmfm.',
      '..mmmmmmmm..',
    ],
  ],
  fleeing: [
    [
      '..ee....ee..',
      '............',
      '..ee....ee..',
      '............',
      '.mfmfmfmfmf.',
      '.fmfmfmfmfm.',
      '..mmmmmmmm..',
      '............',
    ],
    [
      '..ee....ee..',
      '............',
      '..ee....ee..',
      '............',
      '.fmfmfmfmfm.',
      '.mfmfmfmfmf.',
      '..mmmmmmmm..',
      '............',
    ],
  ],
};

const SHADOW_BITE_F0 = [
  '.....S............S.....',
  '...SS...........S...S...',
  '..S...S...VVVV...S...S..',
  '.S...VKKKKKKKKKKKKV.....',
  '....VKKKKKKKKKKKKKKD....',
  '.S.VKKKKKKKKKKKKKKKKD.S.',
  '...VKKKKKKKKKKKKKKKKD...',
  '...VVKKKKKKKKKKKKKKKD...',
  '...VKKKKKKKKKKKKKKKKD...',
  '...VKKKKKKKKKKKKKKKKD...',
  '...VKKKKKKKKKKKKKKKKD...',
  '...VKKKKKKKKKKKKKKKKD...',
  '...VKKKKKKKKKKKKKKKKD...',
  '...VKKKKKKKKKKKKKKKKD...',
  '...VKKKKKKKKKKKKKKKKD...',
  '...VKKKKKKKKKKKKKKKKD...',
  '...VKKKKKKKKKKKKKKKKD...',
  '...VKKKKKKKKKKKKKKKKD...',
  '...VVKKKKKKKKKKKKKKDD...',
  '....VKKKKKKKKKKKKKKD....',
  '.....DDDDDDDDDDDDDD.....',
  '.......KK..SS..KK.......',
  '.......K...SS...K.......',
  '............S...........',
];

const SHADOW_BITE_F1 = [
  '......S..........S......',
  '..SS...........S...S....',
  '...S...S..VVVV...S...S..',
  '.S...VKKKKKKKKKKKKV.....',
  '....VKKKKKKKKKKKKKKD....',
  '.S.VKKKKKKKKKKKKKKKKD.S.',
  '...VKKKKKKKKKKKKKKKKD...',
  '...VHKKKKKKKKKKKKKKKD...',
  '...VKKKKKKKKKKKKKKKKD...',
  '...VKKKKKKKKKKKKKKKKD...',
  '...VKKKKKKKKKKKKKKKKD...',
  '...VKKKKKKKKKKKKKKKKD...',
  '...VKKKKKKKKKKKKKKKKD...',
  '...VKKKKKKKKKKKKKKKKD...',
  '...VKKKKKKKKKKKKKKKKD...',
  '...VKKKKKKKKKKKKKKKKD...',
  '...VKKKKKKKKKKKKKKKKD...',
  '...VKKKKKKKKKKKKKKKKD...',
  '...VVKKKKKKKKKKKKKKDD...',
  '....VKKKKKKKKKKKKKKD....',
  '.....DDDDDDDDDDDDDD.....',
  '........KK..SS..KK......',
  '........K...SS...K......',
  '.............S..........',
];

const SHADOW_BITE_NORMAL = {
  K: '#1c1030',
  V: '#7b3fd4',
  H: '#b48cff',
  D: '#0d0716',
  S: '#4a2b8a',
  e: '#ff9f43',
  E: '#ffd400',
  m: '#05030a',
  f: '#e8dcff',
} as const;

const SHADOW_BITE_PALETTES: Readonly<Record<AntagonistState, Readonly<Record<string, string>>>> = {
  normal: SHADOW_BITE_NORMAL,
  power: { ...SHADOW_BITE_NORMAL, e: '#ff2a1a', E: '#ff9f43', m: '#1a0505', f: '#ffffff', V: '#a04df0' },
  speed: { ...SHADOW_BITE_NORMAL, e: '#ffe680', E: '#ffffff', V: '#9f6df0', S: '#6a4ab0' },
  respawn: dimPalette(SHADOW_BITE_NORMAL),
  fleeing: { K: '#2a44c0', V: '#4a6cff', H: '#a8b8ff', D: '#101a5a', S: '#4a6cff', e: '#ffffff', E: '#ffffff', m: '#0a1030', f: '#ffffff' },
};

// ---------------------------------------------------------------------------
// Lantern Maw: an ornate bronze lantern with a dark glass face, glowing cyan
// slits and a zigzag energy maw. Rune tassels hang at both sides.
// ---------------------------------------------------------------------------
const LANTERN_MAW_FACE: FacePatch = {
  dx: 6,
  dy: 6,
  normal: [
    [
      '............',
      '..ee....ee..',
      '..ee....ee..',
      '............',
      '............',
      '............',
      '.mmmmmmmmmm.',
      '.mfmmmmmfmm.',
      '.mmfmmmfmmm.',
      '.mmmffffmmm.',
      '..mmmmmmmm..',
      '............',
    ],
    [
      '............',
      '..ee....ee..',
      '..ee....ee..',
      '............',
      '............',
      '............',
      '.mmmmmmmmmm.',
      '.mmfmmmmfmm.',
      '.mfmfmfmmmm.',
      '.mmmffffmmm.',
      '..mmmmmmmm..',
      '............',
    ],
  ],
  fleeing: [
    [
      '............',
      '..ee....ee..',
      '............',
      '..ee....ee..',
      '............',
      '............',
      '.mmmmmmmmmm.',
      '.mfmfmfmfmf.',
      '.fmfmfmfmfm.',
      '..mmmmmmmm..',
      '............',
      '............',
    ],
    [
      '............',
      '..ee....ee..',
      '............',
      '..ee....ee..',
      '............',
      '............',
      '.mmmmmmmmmm.',
      '.fmfmfmfmfm.',
      '.mfmfmfmfmf.',
      '..mmmmmmmm..',
      '............',
      '............',
    ],
  ],
};

const LANTERN_MAW_F0 = [
  '...........MM...........',
  '..........M..d..........',
  '.CC.....MMMMMM........c.',
  'CC.c....MMMMMMMM....CC..',
  '..c....HMMMMMMMdd....C..',
  '....MMMMMMMMMMMMMMdd....',
  '....MMKKKKKKKKKKKKdd....',
  '....MHKKKKKKKKKKKKdd....',
  '....MMKKKKKKKKKKKKdd....',
  '....MMKKKKKKKKKKKKdd....',
  '..T.MMKKKKKKKKKKKKdd.T..',
  '.TTTMMKKKKKKKKKKKKddTTT.',
  '.THTMMKKKKKKKKKKKKddTHT.',
  '.TTTMMKKKKKKKKKKKKddTTT.',
  '..T.MMKKKKKKKKKKKKdd.T..',
  '.tt.MMKKKKKKKKKKKKdd.tt.',
  '.t..MMKKKKKKKKKKKKdd..t.',
  '....MMKKKKKKKKKKKKdd....',
  '....MMKKKKKKKKKKKKdd....',
  '....MMMMMMMMMMMMMMdd....',
  '......MMM......MMM......',
  '......ddd......ddd......',
  '.......C........C.......',
  '........................',
];

const LANTERN_MAW_F1 = [
  '...........MM...........',
  '..........M..d..........',
  '..CC....MMMMMM.......c..',
  'CC.c....MMMMMMMM...CC...',
  '..c....HMMMMMMMdd...C...',
  '....MMMMMMMMMMMMMMdd....',
  '....MMKKKKKKKKKKKKdd....',
  '....MMKKKKKKKKKKKKdd....',
  '....MHKKKKKKKKKKKKdd....',
  '....MMKKKKKKKKKKKKdd....',
  '..T.MMKKKKKKKKKKKKdd.T..',
  '.TTTMMKKKKKKKKKKKKddTTT.',
  '.THTMMKKKKKKKKKKKKddTHT.',
  '.TTTMMKKKKKKKKKKKKddTTT.',
  '..T.MMKKKKKKKKKKKKdd.T..',
  '..ttMMKKKKKKKKKKKKdd.tt.',
  '..t.MMKKKKKKKKKKKKdd..t.',
  '....MMKKKKKKKKKKKKdd....',
  '....MMKKKKKKKKKKKKdd....',
  '....MMMMMMMMMMMMMMdd....',
  '......MMM......MMM......',
  '......ddd......ddd......',
  '.......C........C.......',
  '........................',
];

const LANTERN_MAW_NORMAL = {
  M: '#e08a3d',
  d: '#7a4a1a',
  K: '#0a1420',
  C: '#54f0ff',
  c: '#1f8fb0',
  T: '#8a4bff',
  t: '#4a2b9e',
  H: '#fff3c9',
  e: '#54f0ff',
  m: '#03181f',
  f: '#d8fbff',
} as const;

const LANTERN_MAW_PALETTES: Readonly<Record<AntagonistState, Readonly<Record<string, string>>>> = {
  normal: LANTERN_MAW_NORMAL,
  power: { ...LANTERN_MAW_NORMAL, e: '#ff5a3d', m: '#1f0803', f: '#ffffff', C: '#7dfcff' },
  speed: { ...LANTERN_MAW_NORMAL, e: '#c8fff8', f: '#ffffff', C: '#9ff0ff' },
  respawn: dimPalette(LANTERN_MAW_NORMAL),
  fleeing: { M: '#2a44c0', d: '#101a5a', K: '#16205c', C: '#a8b8ff', c: '#4a6cff', T: '#4a6cff', t: '#101a5a', H: '#ffffff', e: '#ffffff', m: '#0a1030', f: '#ffffff' },
};

// ---------------------------------------------------------------------------
// Cursed Mask: a white oni mask with slanted magenta eyes and fangs, gold bead
// strands and smoke ribbons curling off the top.
// ---------------------------------------------------------------------------
const CURSED_MASK_FACE: FacePatch = {
  dx: 6,
  dy: 6,
  normal: [
    [
      '............',
      '.ee......ee.',
      '..ee....ee..',
      '............',
      '............',
      '............',
      '.mmmmmmmmmm.',
      '.fmfmmmmfmf.',
      '.mmmmmmmmmm.',
      '..mfmfmfmf..',
    ],
    [
      '............',
      '.ee......ee.',
      '..ee....ee..',
      '............',
      '............',
      '............',
      '.mmmmmmmmmm.',
      '.mfmfmmfmfm.',
      '.mmmmmmmmmm.',
      '..fmfmfmfm..',
    ],
  ],
  fleeing: [
    [
      '............',
      '..ee....ee..',
      '..ee....ee..',
      '............',
      '............',
      '............',
      '.mmmmmmmmmm.',
      '.mfmfmfmfmf.',
      '.fmfmfmfmfm.',
      '..mmmmmmmm..',
    ],
    [
      '............',
      '..ee....ee..',
      '..ee....ee..',
      '............',
      '............',
      '............',
      '.mmmmmmmmmm.',
      '.fmfmfmfmfm.',
      '.mfmfmfmfmf.',
      '..mmmmmmmm..',
    ],
  ],
};

const CURSED_MASK_F0 = [
  '....RRR..........RRR....',
  '...RRRr........rRRR.....',
  '..RR.WW........WW.RR....',
  '..RrWWWW......WWWWrR....',
  '...RWWWWWWWWWWWWWWWR....',
  '....WWWWWWWWWWWWWWWW....',
  '....WWWWWWWWWWWWWWWW....',
  '....WWWWWWWWWWWWWWWW....',
  '...GWWWWWWWWWWWWWWWWG...',
  '...GWWWWWWWWWWWWWWWWG...',
  '...gWWWWWWWWWWWWWWWWg...',
  '..RGWWWWWWWWWWWWWWWWGR..',
  '..RGWWWWWWWWWWWWWWWWGR..',
  '..RgWWWWWWWWWWWWWWWWgR..',
  '..RGWWWWWWWWWWWWWWWWGR..',
  '...GWWWWWWWWWWWWWWWWG...',
  '...gRWWWWWWWWWWWWWWgR...',
  '....RRWWWWWWWWWWWWRR....',
  '.....RRRWWWWWWWWRRR.....',
  '......RRRWWWWWWRRR......',
  '.......RRrWWWWrRR.......',
  '.......RR..WW..RR.......',
  '.......Rr......rR.......',
  '.......R........R.......',
];

const CURSED_MASK_F1 = [
  '.....RRR........RRR.....',
  '....RRRr......rRRR......',
  '..RR.WW........WW.RR....',
  '..RrWWWW......WWWWrR....',
  '...RWWWWWWWWWWWWWWWR....',
  '....WWWWWWWWWWWWWWWW....',
  '....WWWWWWWWWWWWWWWW....',
  '....WWWWWWWWWWWWWWWW....',
  '...GWWWWWWWWWWWWWWWWG...',
  '...GWWWWWWWWWWWWWWWWG...',
  '...gWWWWWWWWWWWWWWWWg...',
  '..RGWWWWWWWWWWWWWWWWGR..',
  '..RGWWWWWWWWWWWWWWWWGR..',
  '..RgWWWWWWWWWWWWWWWWgR..',
  '..RGWWWWWWWWWWWWWWWWGR..',
  '...GWWWWWWWWWWWWWWWWG...',
  '...gRWWWWWWWWWWWWWWgR...',
  '....RRWWWWWWWWWWWWRR....',
  '.....RRRWWWWWWWWRRR.....',
  '......RRRWWWWWWRRR......',
  '.......RRrWWWWrRR.......',
  '........RR..WW..RR......',
  '........Rr......rR......',
  '........R........R......',
];

const CURSED_MASK_NORMAL = {
  W: '#f2ecff',
  R: '#8a4bff',
  r: '#4a2b9e',
  G: '#ffd400',
  g: '#7a5a00',
  e: '#ff4dd8',
  m: '#2a0f1e',
  f: '#ffffff',
} as const;

const CURSED_MASK_PALETTES: Readonly<Record<AntagonistState, Readonly<Record<string, string>>>> = {
  normal: CURSED_MASK_NORMAL,
  power: { ...CURSED_MASK_NORMAL, e: '#ff2a1a', m: '#1a0505', R: '#b44dff' },
  speed: { ...CURSED_MASK_NORMAL, e: '#ffd7f2', R: '#b48cff' },
  respawn: dimPalette(CURSED_MASK_NORMAL),
  fleeing: { W: '#4a6cff', R: '#4a6cff', r: '#101a5a', G: '#a8b8ff', g: '#2a44c0', e: '#ffffff', m: '#0a1030', f: '#ffffff' },
};

// ---------------------------------------------------------------------------
// Pumpkin Tech: a riveted violet tech housing with a jack-o'-lantern screen,
// a leafy stem, glowing side pods and teal feet.
// ---------------------------------------------------------------------------
const PUMPKIN_TECH_FACE: FacePatch = {
  dx: 7,
  dy: 7,
  normal: [
    [
      '..........',
      '.J....J...',
      '.JJ..JJ...',
      '.JJJ.JJJ..',
      '..........',
      '..........',
      '..JJJJJJ..',
      '..JjJJjJ..',
      '..JJJJJJ..',
      '..........',
    ],
    [
      '..........',
      '.J....J...',
      '.JJ..JJ...',
      '.JJJ.JJJ..',
      '..........',
      '..........',
      '..JJJJJJ..',
      '..JJjJjJ..',
      '..JJJJJJ..',
      '..........',
    ],
  ],
  fleeing: [
    [
      '..........',
      '..J....J..',
      '..........',
      '..J....J..',
      '..........',
      '..........',
      '..JJJJJJ..',
      '..JjJJjJ..',
      '..JjJJjJ..',
      '..........',
    ],
    [
      '..........',
      '..J....J..',
      '..........',
      '..J....J..',
      '..........',
      '..........',
      '..JJJJJJ..',
      '..jJJJjJ..',
      '..JJjJJj..',
      '..........',
    ],
  ],
};

const PUMPKIN_TECH_F0 = [
  '...........gg...........',
  '...........gg...........',
  '........LLLggLLL........',
  '.......LLL.gg.LLL.......',
  '....OPPPPPPPPPPPPPPPO...',
  '....PPPPPPPPPPPPPPp.....',
  '....PPPPPPPPPPPPPPp.....',
  '....PPPKKKKKKKKKKPPp....',
  '....PPPKKKKKKKKKKPPp....',
  'pGGpPPPKKKKKKKKKKPPPpGGp',
  'pGGpPPPKKKKKKKKKKPPPpGGp',
  'GGppPPPKKKKKKKKKKPPPppGG',
  'GppGPPPKKKKKKKKKKPPPGppG',
  'pGGpPPPKKKKKKKKKKPPPpGGp',
  'pGppPPPKKKKKKKKKKPPPppGp',
  'ppppPPPKKKKKKKKKKPPPpppp',
  '....PPPKKKKKKKKKKPPP....',
  '....PPPKKKKKKKKKKPPP....',
  '....PppPPPPPPPPPPppP....',
  '....OPPPPPPPPPPPPPPPO...',
  '.....pppppppppppppp.....',
  '......GGG......GGG......',
  '......ggg......ggg......',
  '........................',
];

const PUMPKIN_TECH_F1 = [
  '...........gg...........',
  '...........gg...........',
  '........LLLggLLL........',
  '.......LL..gg..LL.......',
  '....OPPPPPPPPPPPPPPPO...',
  '....PPPPPPPPPPPPPPp.....',
  '....PPPPPPPPPPPPPPp.....',
  '....PPPKKKKKKKKKKPPp....',
  '....PPPKKKKKKKKKKPPp....',
  'pGGpPPPKKKKKKKKKKPPPpppp',
  'pGGpPPPKKKKKKKKKKPPPpGGp',
  'GGppPPPKKKKKKKKKKPPPppGG',
  'GppGPPPKKKKKKKKKKPPPGppG',
  'pGGpPPPKKKKKKKKKKPPPpGGp',
  'ppGpPPPKKKKKKKKKKPPPpGpp',
  'ppppPPPKKKKKKKKKKPPPpppp',
  '....PPPKKKKKKKKKKPPP....',
  '....PPPKKKKKKKKKKPPP....',
  '....PppPPPPPPPPPPppP....',
  '....OPPPPPPPPPPPPPPPO...',
  '.....pppppppppppppp.....',
  '......GGG......GGG......',
  '......ggg......ggg......',
  '........................',
];

const PUMPKIN_TECH_NORMAL = {
  P: '#5a3fa0',
  p: '#2e1f5c',
  O: '#e08a3d',
  J: '#ff9f43',
  j: '#c95a1a',
  K: '#140a20',
  G: '#3fe0c8',
  g: '#1f8f78',
  L: '#5fd35f',
  W: '#fff3c9',
} as const;

const PUMPKIN_TECH_PALETTES: Readonly<Record<AntagonistState, Readonly<Record<string, string>>>> = {
  normal: PUMPKIN_TECH_NORMAL,
  power: { ...PUMPKIN_TECH_NORMAL, J: '#ff5a1a', j: '#7a1e08', G: '#7dfcff' },
  speed: { ...PUMPKIN_TECH_NORMAL, J: '#ffd9a8', j: '#e08a3d' },
  respawn: dimPalette(PUMPKIN_TECH_NORMAL),
  fleeing: { P: '#2a44c0', p: '#101a5a', O: '#4a6cff', J: '#ffffff', j: '#2a44c0', K: '#16205c', G: '#a8b8ff', g: '#2a44c0', L: '#4a6cff', W: '#ffffff' },
};

// ---------------------------------------------------------------------------
// Grave Wisp: a cracked tombstone with hollow socket eyes and a zigzag
// energy maw, small tombs behind and blue flames licking at both sides.
// ---------------------------------------------------------------------------
const GRAVE_WISP_FACE: FacePatch = {
  dx: 6,
  dy: 8,
  normal: [
    [
      '..ee....ee..',
      '..ee....ee..',
      '............',
      '.CCCCCCCCCC.',
      '.CKffKKffKC.',
      '.CKKCCCCKKC.',
      '.CKCCKKCCKC.',
      '.CKKKKKKKKC.',
      '..CCCCCCCC..',
      '............',
    ],
    [
      '..ee....ee..',
      '..ee....ee..',
      '............',
      '.CCCCCCCCCC.',
      '.CKKffKKffC.',
      '.CCCKCCCKCC.',
      '.CKCCKKCCKC.',
      '.CKKKKKKKKC.',
      '..CCCCCCCC..',
      '............',
    ],
  ],
  fleeing: [
    [
      '..ee....ee..',
      '............',
      '..ee....ee..',
      '............',
      '..fmfmfmfm..',
      '..mfmfmfmf..',
      '..fmfmfmfm..',
      '............',
      '............',
      '............',
    ],
    [
      '..ee....ee..',
      '............',
      '..ee....ee..',
      '............',
      '..mfmfmfmf..',
      '..fmfmfmfm..',
      '..mfmfmfmf..',
      '............',
      '............',
      '............',
    ],
  ],
};

const GRAVE_WISP_F0 = [
  '........................',
  '..TTT..............TTT..',
  '.TTWTT............TTWTT.',
  '.TWWWT............TWWWT.',
  '........TTTTTTTT........',
  '......TTTTTTTTTTtt......',
  '..FF..TTTTTTTTTTtt..FF..',
  '.FFd..TTTTTWWTTTtt..dFF.',
  '.FFd..TTTTTTTTTTtt..dFF.',
  '.FdF..TTTTTTTTTTtt..FdF.',
  '.FFd..TTTTTTTTTTtt..dFF.',
  '.dFF..TTTTTTTTTTtt..FFd.',
  '.FFd..TTTTTTTTTTtt..dFF.',
  '.FdF..TTTTTTTTTTtt..FdF.',
  '.FFd..TTTTTTTTTTtt..dFF.',
  '.dFF..TTTTTTTTTTtt..FFd.',
  '.FFd..TTTTTTTTTTtt..dFF.',
  '.FdF..TTTTTTTTTTtt..FdF.',
  '..d...TTTTTTTTTTtt...d..',
  '......TTTTTTTTTtDD......',
  '......TTTTTTTTDDDD......',
  '....DDDWDDDDDDDDWDDD....',
  '.....DDDDDDDDDDDDDD.....',
  '........................',
];

const GRAVE_WISP_F1 = [
  '........................',
  '..TTT..............TTT..',
  '.TTWTT............TTWTT.',
  '.TWWWT............TWWWT.',
  '........TTTTTTTT........',
  '......TTTTTTTTTTtt......',
  '..dF..TTTTTTTTTTtt..Fd..',
  '.dFF..TTTTTWWTTTtt..FFd.',
  '.dFF..TTTTTTTTTTtt..FFd.',
  '.FFd..TTTTTTTTTTtt..dFF.',
  '.dFF..TTTTTTTTTTtt..FFd.',
  '.FFd..TTTTTTTTTTtt..dFF.',
  '.dFF..TTTTTTTTTTtt..FFd.',
  '.FFd..TTTTTTTTTTtt..dFF.',
  '.dFF..TTTTTTTTTTtt..FFd.',
  '.FFd..TTTTTTTTTTtt..dFF.',
  '.dFF..TTTTTTTTTTtt..FFd.',
  '.FFd..TTTTTTTTTTtt..dFF.',
  '...d..TTTTTTTTTTtt..d...',
  '......TTTTTTTTTtDD......',
  '......TTTTTTTTDDDD......',
  '....DDDWDDDDDDDDWDDD....',
  '.....DDDDDDDDDDDDDD.....',
  '........................',
];

const GRAVE_WISP_NORMAL = {
  T: '#b9a8e0',
  t: '#6a5f94',
  C: '#54f0ff',
  K: '#0a1420',
  F: '#9ff0ff',
  d: '#2fb3a5',
  W: '#e8ecff',
  D: '#241a3d',
  e: '#0a1420',
  m: '#0a1420',
  f: '#e8ecff',
} as const;

const GRAVE_WISP_PALETTES: Readonly<Record<AntagonistState, Readonly<Record<string, string>>>> = {
  normal: GRAVE_WISP_NORMAL,
  power: { ...GRAVE_WISP_NORMAL, e: '#ff2a1a', C: '#7dfcff', m: '#1f0803' },
  speed: { ...GRAVE_WISP_NORMAL, e: '#c8fff8', C: '#9ff0ff' },
  respawn: dimPalette(GRAVE_WISP_NORMAL),
  fleeing: { T: '#4a6cff', t: '#2a44c0', C: '#a8b8ff', K: '#16205c', F: '#ffffff', d: '#4a6cff', W: '#ffffff', D: '#101a5a', e: '#ffffff', m: '#0a1030', f: '#ffffff' },
};

// ---------------------------------------------------------------------------
// Night Idol: a violet shrine idol with a gold halo and crown, magenta slit
// eyes, a sigil banner and a candle burning at each side.
// ---------------------------------------------------------------------------
const NIGHT_IDOL_FACE: FacePatch = {
  dx: 7,
  dy: 8,
  normal: [
    [
      '..........',
      '..ee..ee..',
      '..........',
      '..........',
      '..BBBBBB..',
      '..BGooGB..',
      '..BGooGB..',
      '..BGGGGB..',
      '..BBBBBB..',
      '..B.BB.B..',
      '..B....B..',
      '..........',
    ],
    [
      '..........',
      '..ee..ee..',
      '..........',
      '..........',
      '...BBBBBB.',
      '...BGooGB.',
      '...BGooGB.',
      '...BGGGGB.',
      '...BBBBBB.',
      '...B.BB.B.',
      '...B....B.',
      '..........',
    ],
  ],
  fleeing: [
    [
      '..........',
      '..ee..ee..',
      '..........',
      '..........',
      '..BBBBBB..',
      '..BffffB..',
      '..BffffB..',
      '..BBBBBB..',
      '..B.BB.B..',
      '...BBBB...',
      '..........',
      '..........',
    ],
    [
      '..........',
      '..ee..ee..',
      '..........',
      '..........',
      '..BBBBBB..',
      '..BffffB..',
      '..BffffB..',
      '..BBBBBB..',
      '..B.BB.B..',
      '..BBBBB...',
      '..........',
      '..........',
    ],
  ],
};

const NIGHT_IDOL_F0 = [
  '..........HHHH..........',
  '.......GG.HHHH.GG.......',
  '......G..........G......',
  '......GG.GGGGGG.GG......',
  '........GGHHHHGG........',
  '.......GVVVVVVVVG.......',
  '.......GVVVVVVvvG.......',
  '.......GVVVVVVvvG.......',
  '.......GVKKKKKKvG.......',
  '.......GVKKKKKKvG.......',
  '..FF...GVKKKKKKvG...FF..',
  '..FW...GVKKKKKKvG...WF..',
  '..WW...GVVVVVVvvG...WW..',
  '..WW...GVVVVVVvvG...WW..',
  '..WW...GVVVVVVvvG...WW..',
  '..WW...GVVVVVVvvG...WW..',
  '..WW...GVVVVVVvvG...WW..',
  '..WW...GVVVVVVvvG...WW..',
  '..WW...GVVVVVVvvG...WW..',
  '..WW...GVVVVVVvvG...WW..',
  '..GG...GGGGGGGGGG...GG..',
  '........vv....vv........',
  '........................',
  '........................',
];

const NIGHT_IDOL_F1 = [
  '..........GGGG..........',
  '.......GG.HHHH.GG.......',
  '......G..........G......',
  '......GG.GGGGGG.GG......',
  '........GGHHHHGG........',
  '.......GVVVVVVVVG.......',
  '.......GVVVVVVvvG.......',
  '.......GVVVVVVvvG.......',
  '.......GVKKKKKKvG.......',
  '.......GVKKKKKKvG.......',
  '..F....GVKKKKKKvG....F..',
  '...W...GVKKKKKKvG...W...',
  '..WW...GVVVVVVvvG...WW..',
  '..WW...GVVVVVVvvG...WW..',
  '..WW...GVVVVVVvvG...WW..',
  '..WW...GVVVVVVvvG...WW..',
  '..WW...GVVVVVVvvG...WW..',
  '..WW...GVVVVVVvvG...WW..',
  '..WW...GVVVVVVvvG...WW..',
  '..WW...GVVVVVVvvG...WW..',
  '..GG...GGGGGGGGGG...GG..',
  '........vv....vv........',
  '........................',
  '........................',
];

const NIGHT_IDOL_NORMAL = {
  V: '#4a2b8a',
  v: '#241545',
  G: '#ffd400',
  K: '#120a24',
  F: '#ffca7a',
  W: '#e8dcff',
  B: '#8a4bff',
  H: '#fff3c9',
  o: '#54f0ff',
  e: '#ff4dd8',
  m: '#1a0f2e',
  f: '#ffffff',
} as const;

const NIGHT_IDOL_PALETTES: Readonly<Record<AntagonistState, Readonly<Record<string, string>>>> = {
  normal: NIGHT_IDOL_NORMAL,
  power: { ...NIGHT_IDOL_NORMAL, e: '#ff2a1a', f: '#ffffff', o: '#7dfcff', F: '#ff9f43' },
  speed: { ...NIGHT_IDOL_NORMAL, e: '#ffd7f2', F: '#fff3c9' },
  respawn: dimPalette(NIGHT_IDOL_NORMAL),
  fleeing: { V: '#2a44c0', v: '#101a5a', G: '#a8b8ff', K: '#16205c', F: '#ffffff', W: '#4a6cff', B: '#4a6cff', H: '#ffffff', o: '#ffffff', e: '#ffffff', m: '#0a1030', f: '#ffffff' },
};

// ---------------------------------------------------------------------------
// Catalogue and drawing helpers.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Shadow Bite Prime (default): a vengeful shade cube with a flame-licked violet
// rim, slanted amber eyes and a blocky white grin. Chase narrows the eyes;
// scared turns them cyan with rim sparks; defeated crosses them out.
// ---------------------------------------------------------------------------
const SHADOW_BITE_PRIME_FACE: FacePatch = {
  dx: 6,
  dy: 7,
  normal: [
    [
      '............',
      '.ee......ee.',
      '..eE....Ee..',
      '............',
      '............',
      '.mmmmmmmmmm.',
      '.mffmffmffm.',
      '.mmmffmmffm.',
      '..mmmmmmmm..',
      '............',
    ],
    [
      '............',
      '.ee......ee.',
      '..eE....Ee..',
      '............',
      '............',
      '.mmmmmmmmmm.',
      '.mffmffmffm.',
      '.mmffmffmm..',
      '..mmmmmmmm..',
      '............',
    ],
  ],
  power: [
    [
      '............',
      '.ee......ee.',
      '...E....E...',
      '............',
      '............',
      '.mmmmmmmmmm.',
      '.fffffffff..',
      '.mfmfmfmfmf.',
      '..mmmmmmmm..',
      '............',
    ],
    [
      '............',
      '.ee......ee.',
      '...E....E...',
      '............',
      '............',
      '.mmmmmmmmmm.',
      '.fffffffff..',
      '.fmfmfmfmfm.',
      '..mmmmmmmm..',
      '............',
    ],
  ],
  respawn: [
    [
      '............',
      '.e.e....e.e.',
      '..e......e..',
      '............',
      '............',
      '.mmmmmmmmmm.',
      '..mmmmmmmm..',
      '............',
      '............',
      '............',
    ],
    [
      '............',
      '.e.e....e.e.',
      '..e......e..',
      '............',
      '............',
      '.mmmmmmmmmm.',
      '..mmmmmmm...',
      '............',
      '............',
      '............',
    ],
  ],
  fleeing: [
    [
      '..EE....EE..',
      '..ee....ee..',
      '..ee....ee..',
      '............',
      '............',
      '.mmmmmmmmmm.',
      '.mfmfmfmfmf.',
      '.fmfmfmfmfm.',
      '..mmmmmmmm..',
      '............',
    ],
    [
      '.EE......EE.',
      '..ee....ee..',
      '..ee....ee..',
      '............',
      '............',
      '.mmmmmmmmmm.',
      '.fmfmfmfmfm.',
      '.mfmfmfmfmf.',
      '..mmmmmmmm..',
      '............',
    ],
  ],
};

const SHADOW_BITE_PRIME_F0 = [
  '........................',
  '......VVV..H...VVV......',
  '.....VVH..VVVV..HVV.....',
  '....VVH..VVVVVV..HVV....',
  '....VHVVVVHVVVVHVVVV....',
  '.SS.VKKKKKKKKKKKKKKV.SS.',
  '.S.VVKKKKKKKKKKKKKKVV.S.',
  '...VHKKKKKKKKKKKKKKVV...',
  '...VKKKKKKKKKKKKKKKVD...',
  '...VKKKKKKKKKKKKKKKVD...',
  '..EVKKKKKKKKKKKKKKKVD...',
  '...VKKKKKKKKKKKKKKKVD...',
  '...VKKKKKKKKKKKKKKKVD...',
  '...VKKKKKKKKKKKKKKKVDE..',
  '...VKKKKKKKKKKKKKKKVD...',
  '...VKKKKKKKKKKKKKKKVD...',
  '...VVKKKKKKKKKKKKKKDD...',
  '....VKKKKKKKKKKKKKKD....',
  '....VVVVVVVVVVVVVVVV....',
  '.....VVVVVVVVVVVVVV.....',
  '......DDDDDDDDDDDD......',
  '........KK.SS.KK........',
  '........K..SS..K........',
  '........................',
];

const SHADOW_BITE_PRIME_F1 = [
  '........................',
  '......VVV..H...VVV......',
  '.....VVH..VVVV..HVV.....',
  '....VVH..VVVVVV..HVV....',
  '....VHVVVHVVVVHVVVVV....',
  '.SS.VKKKKKKKKKKKKKKV.SS.',
  '.S.VVKKKKKKKKKKKKKKVV.S.',
  '...VVKKKKKKKKKKKKKKVV...',
  '...VKKKKKKKKKKKKKKKVD...',
  '...VKKKKKKKKKKKKKKKVD...',
  '..EVKKKKKKKKKKKKKKKVD...',
  '...VKKKKKKKKKKKKKKKVD...',
  '...VKKKKKKKKKKKKKKKVD...',
  '...VKKKKKKKKKKKKKKKVDE..',
  '...VKKKKKKKKKKKKKKKVD...',
  '...VKKKKKKKKKKKKKKKVD...',
  '...VVKKKKKKKKKKKKKKDD...',
  '....VKKKKKKKKKKKKKKD....',
  '....VVVVVVVVVVVVVVVV....',
  '.....VVVVVVVVVVVVVV.....',
  '......DDDDDDDDDDDD......',
  '.........KKSSKK.........',
  '.........KSSSSK.........',
  '........................',
];

const SHADOW_BITE_PRIME_NORMAL = {
  K: '#150b28',
  V: '#7b3fd4',
  H: '#b48cff',
  D: '#0d0716',
  S: '#4a2b8a',
  E: '#ff7a2f',
  e: '#ffb42d',
  m: '#05030a',
  f: '#ffffff',
} as const;

const SHADOW_BITE_PRIME_PALETTES: Readonly<Record<AntagonistState, Readonly<Record<string, string>>>> = {
  normal: SHADOW_BITE_PRIME_NORMAL,
  power: { ...SHADOW_BITE_PRIME_NORMAL, e: '#ff7a2f', E: '#ff2a1a', V: '#9f4df0', f: '#ffffff' },
  speed: { ...SHADOW_BITE_PRIME_NORMAL, e: '#ffd9a8', E: '#ffb42d', V: '#9f6df0' },
  respawn: { K: '#241a3d', V: '#2e1f5c', H: '#4a3f6b', D: '#0d0716', S: '#241a3d', E: '#8f86a8', e: '#cfc2f2', m: '#0d0716', f: '#8f86a8' },
  fleeing: { K: '#16205c', V: '#4a6cff', H: '#a8b8ff', D: '#101a5a', S: '#4a6cff', E: '#54e0ff', e: '#d8fbff', m: '#0a1030', f: '#ffffff' },
};

const DEFS: Readonly<Record<AntagonistId, AntagonistDef>> = {
  'shadow-bite-prime': {
    id: 'shadow-bite-prime',
    frames: [SHADOW_BITE_PRIME_F0, SHADOW_BITE_PRIME_F1],
    face: SHADOW_BITE_PRIME_FACE,
    palettes: SHADOW_BITE_PRIME_PALETTES,
  },
  'lantern-maw': { id: 'lantern-maw', frames: [LANTERN_MAW_F0, LANTERN_MAW_F1], face: LANTERN_MAW_FACE, palettes: LANTERN_MAW_PALETTES },
  'cursed-mask': { id: 'cursed-mask', frames: [CURSED_MASK_F0, CURSED_MASK_F1], face: CURSED_MASK_FACE, palettes: CURSED_MASK_PALETTES },
  'shadow-bite': { id: 'shadow-bite', frames: [SHADOW_BITE_F0, SHADOW_BITE_F1], face: SHADOW_BITE_FACE, palettes: SHADOW_BITE_PALETTES },
  'pumpkin-tech': { id: 'pumpkin-tech', frames: [PUMPKIN_TECH_F0, PUMPKIN_TECH_F1], face: PUMPKIN_TECH_FACE, palettes: PUMPKIN_TECH_PALETTES },
  'grave-wisp': { id: 'grave-wisp', frames: [GRAVE_WISP_F0, GRAVE_WISP_F1], face: GRAVE_WISP_FACE, palettes: GRAVE_WISP_PALETTES },
  'night-idol': { id: 'night-idol', frames: [NIGHT_IDOL_F0, NIGHT_IDOL_F1], face: NIGHT_IDOL_FACE, palettes: NIGHT_IDOL_PALETTES },
};

export function antagonistDef(id: AntagonistId): AntagonistDef {
  return DEFS[id];
}

/** Body rows for a frame with the state's face stamped on. */
export function antagonistRows(id: AntagonistId, state: AntagonistState, frame: number): string[] {
  const def = DEFS[id];
  const f = frame % ANTAGONIST_FRAMES;
  const set =
    state === 'fleeing'
      ? def.face.fleeing[f]!
      : state === 'power' && def.face.power !== undefined
        ? def.face.power[f]!
        : state === 'respawn' && def.face.respawn !== undefined
          ? def.face.respawn[f]!
          : def.face.normal[f]!;
  return overlay(def.frames[f]!, set, def.face.dx, def.face.dy);
}

export function antagonistSprite(id: AntagonistId, state: AntagonistState, frame: number): SpriteDef {
  const def = DEFS[id];
  return sprite(antagonistRows(id, state, frame), def.palettes[state]);
}
