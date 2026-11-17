// Original item art (task 24.4). 12x12 sprites drawn at 2x.
// Ordinary_Pellets are warm amber squares; Spirit_Wisps are cool cyan/violet round orbs that bob.

import type { SpriteDef } from './format';
import { sprite } from './format';

const PELLET = sprite(
  ['............', '............', '............', '............', '.....AA.....', '....AHAA....', '....AAAD....', '.....AD.....', '............', '............', '............', '............'],
  { A: '#ffb347', H: '#ffe0a8', D: '#c97a1f' },
);

/** Wisp frames: the orb bobs by one pixel across 4 frames. */
function wispFrame(dy: number): SpriteDef {
  const base = ['....cccc....', '...cCCCCc...', '..cCvvvvCc..', '..cCvVVvCc..', '..cCvVVvCc..', '..cCvvvvCc..', '...cCCCCc...', '....cccc....'];
  const rows: string[] = [];
  for (let y = 0; y < 12; y++) {
    const i = y - 2 - dy;
    rows.push(i >= 0 && i < base.length ? base[i]! : '............');
  }
  return sprite(rows, { c: '#3fb8e0', C: '#7fe8ff', v: '#a77bff', V: '#e4d4ff' });
}
export const WISP_FRAMES: readonly SpriteDef[] = [wispFrame(0), wispFrame(-1), wispFrame(0), wispFrame(1)];

const POWER = sprite(
  ['............', '....pppp....', '...pPPPPp...', '..pPWWPPPp..', '..pPWPPPPp..', '..pPPPPPPp..', '..pPPPPPPp..', '..pPPPPPdp..', '...pPPPdp...', '....pppp....', '............', '............'],
  { p: '#9c1f7d', P: '#ff5ad1', W: '#ffd6f4', d: '#c2309f' },
);

const SPEED = sprite(
  ['......gg....', '.....ggG....', '....ggG.....', '...ggG......', '..ggGGGGg...', '.gGGGGGgg...', '....gGg.....', '...gGg......', '..gGg.......', '.gGg........', '.gg.........', '............'],
  { g: '#1f9c6a', G: '#5affb0' },
);

const KEY = sprite(
  ['............', '..kkk.......', '.kKKKk......', '.kK.Kk......', '.kKKKkkkkkk.', '..kkkKKKKKk.', '......kK.Kk.', '......kk.kk.', '............', '............', '............', '............'],
  { k: '#b38600', K: '#ffe066' },
);

const BOMB = sprite(
  ['........f...', '.......fF...', '......ss....', '....bbssbb..', '...bBBBBBbb.', '..bBWBBBBBb.', '..bBBBBBBBb.', '..bBBBBBBBb.', '..bBBBBBBDb.', '...bBBBBDb..', '....bbbbb...', '............'],
  { b: '#2a2d3a', B: '#5a6075', W: '#c9cede', D: '#3a3e4f', s: '#8a6a3a', f: '#ff7a2f', F: '#ffe14a' },
);

/** Ghost_Hunt item: a lime spirit lantern with a ghost glyph. */
const GHOST_HUNT = sprite(
  ['.....hh.....', '....hllh....', '...hLLLLh...', '..hLgLLgLh..', '..hLLLLLLh..', '..hLLggLLh..', '..hLLLLLLh..', '..hLlLlLlh..', '...h.h.h....', '............', '............', '............'],
  { h: '#5a8a12', L: '#c8ff5a', l: '#e8ffb0', g: '#1a2a04' },
);

export const ITEM_SPRITES = {
  ordinary: PELLET,
  power: POWER,
  speed: SPEED,
  key: KEY,
  bomb: BOMB,
  ghostHunt: GHOST_HUNT,
} as const;
