// FNV-1a hash of a Maze's generated content (ignores the optional `ice` mask).
import { DEFAULT_CONFIG } from '../../src/core/config';
import { generateMaze } from '../../src/core/maze/generate';

export const REGRESSION_LEVELS = [1, 5, 10, 20, 40] as const;
export const REGRESSION_SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);

export function mazeHash(seeds: readonly number[] = REGRESSION_SEEDS, levels: readonly number[] = REGRESSION_LEVELS): string {
  let h = 0x811c9dc5;
  const feed = (s: string): void => {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  };
  for (const level of levels) {
    for (const seed of seeds) {
      const m = generateMaze(seed, level, DEFAULT_CONFIG);
      const rest: Partial<typeof m> = { ...m };
      delete rest.ice;
      delete rest.tiles;
      feed(Array.from(m.tiles).join(','));
      feed(JSON.stringify(rest));
    }
  }
  return h.toString(16);
}
