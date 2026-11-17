// Shadow Bite art (LABYRAZE): the default antagonist. 24x24 pixels drawn 1:1 into a
// 24 px tile (same footprint as the previous 12x12 art drawn at 2x; hitboxes unchanged).
// A vengeful shade cube with a flame-licked violet rim, slanted amber eyes and a blocky
// white grin; chase narrows the eyes, scared turns them cyan, defeated crosses them out.
// Original pixel art defined in code. This module keeps the historical Squareman API so
// the renderer, Workshop templates and Hunter-eaten particles keep working unchanged.
import type { SpriteDef } from './format';
import type { AntagonistState } from './antagonists';
import { ANTAGONIST_FRAMES, ANTAGONIST_H, ANTAGONIST_STATES, ANTAGONIST_W, antagonistSprite } from './antagonists';

export type SquaremanState = AntagonistState;
export const SQUAREMAN_STATES: readonly SquaremanState[] = ANTAGONIST_STATES;
export const SQUAREMAN_FRAMES = ANTAGONIST_FRAMES;
export const SQUAREMAN_W = ANTAGONIST_W;
export const SQUAREMAN_H = ANTAGONIST_H;

export function squaremanSprite(state: SquaremanState, frame: number): SpriteDef {
  return antagonistSprite('shadow-bite-prime', state, frame);
}
