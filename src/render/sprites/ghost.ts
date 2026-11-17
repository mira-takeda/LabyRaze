// Maze Spirit art (LABYRAZE): the default protagonist and the canonical ghost of the
// game. 18x24 pixels drawn 1:1 into a 24 px tile with nearest-neighbour scaling: a curious
// sheet-ghost with a top tuft, two big black oval eyes with cyan glints, lavender shading
// and a wavy three-lobe hem. Original pixel art defined in code. Captives and allies share
// the Maze Spirit silhouette in their own colours. This module keeps the historical ghost
// API so the renderer, HUD icons and death particles keep working unchanged.
import type { SpriteDef } from './format';
import { sprite } from './format';
import {
  MAZE_SPIRIT_PRIME_PALETTE,
  PROTAGONIST_FRAMES,
  PROTAGONIST_H,
  PROTAGONIST_W,
  protagonistRows as rows,
  protagonistSprite as make,
} from './protagonists';
import { FACINGS } from './protagonists';
import type { Facing } from './protagonists';

export type { Facing };
export { FACINGS };
export const GHOST_W = PROTAGONIST_W;
export const GHOST_H = PROTAGONIST_H;
export const GHOST_FRAMES = PROTAGONIST_FRAMES;
export const PLAYER_PALETTE = MAZE_SPIRIT_PRIME_PALETTE;
/** Captive / ally palettes over the Maze Spirit keys: index 0 pink, 1 teal (darker body so it differs from Wisp glow), 2 orange. */
export const ALLY_PALETTES: readonly Readonly<Record<string, string>>[] = [
  { W: '#ff6fb5', S: '#d1569b', H: '#ffc7e3', o: '#1a0614', G: '#ffd7f2' },
  { W: '#2fb3a5', S: '#1f7f75', H: '#3fd6c6', o: '#04130f', G: '#bff6ff' },
  { W: '#ff9f43', S: '#d17a2a', H: '#ffd09c', o: '#1a0d02', G: '#ffe680' },
];

export function ghostRows(frame: number, facing: Facing): string[] {
  return rows('maze-spirit-prime', frame, facing);
}

export function ghostSprite(
  frame: number,
  facing: Facing,
  palette: Readonly<Record<string, string>> = PLAYER_PALETTE,
): SpriteDef {
  return make('maze-spirit-prime', frame, facing, palette);
}

/** Half-resolution 9x12 icon for the HUD (lives, rescued ghosts), derived from frame 0. */
export function ghostIconRows(): string[] {
  const src = ghostRows(0, 'none');
  const out: string[] = [];
  for (let y = 0; y < GHOST_H; y += 2) {
    let row = '';
    for (let x = 0; x < GHOST_W; x += 2) {
      const px = [src[y]![x]!, src[y]![x + 1]!, src[y + 1]![x]!, src[y + 1]![x + 1]!];
      const solid = px.filter((c) => c !== '.').length;
      if (px.includes('o')) row += 'o';
      else if (solid >= 2) row += px.filter((c) => c === 'S').length >= 2 ? 'S' : 'W';
      else row += '.';
    }
    out.push(row);
  }
  return out;
}

export function ghostIconSprite(palette: Readonly<Record<string, string>> = PLAYER_PALETTE): SpriteDef {
  return sprite(ghostIconRows(), palette);
}
