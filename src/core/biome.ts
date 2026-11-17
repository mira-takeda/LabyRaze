// Biome progression (task 36.5): the environment theme changes every 5 levels.
// Pure helper shared by the Simulation (ice Cells) and the Renderer (themes).

export const BIOME_COUNT = 6;
export const LEVELS_PER_BIOME = 5;
/** Index of the snow biome (haunted 0, red brick 1, jungle 2, metal 3, snow 4, neon 5). */
export const SNOW_BIOME = 4;

/** Biome index for a level: floor((level - 1) / 5) mod 6. Levels below 1 map to biome 0. */
export function biomeIndex(level: number): number {
  const l = Math.max(1, Math.floor(level));
  return Math.floor((l - 1) / LEVELS_PER_BIOME) % BIOME_COUNT;
}

export function isSnowLevel(level: number): boolean {
  return biomeIndex(level) === SNOW_BIOME;
}
