// Selectable difficulty (task 40.1). A difficulty only scales Squareman's movement speed
// (GameConfig.hunterSpeedPermille); nothing else in the rules changes. The choice is remembered in
// localStorage `kirobit.difficulty.v1`; a tolerant loader falls back to NORMAL, storage errors to memory.

import type { GameConfig } from '../core/config';

export type DifficultyId = 'normal' | 'veryHard' | 'extreme';

export interface Difficulty {
  id: DifficultyId;
  label: string;
  permille: number;
  /** HUD / screen colour (warning colours for the harder modes). */
  color: string;
}

export const DIFFICULTIES: readonly Difficulty[] = [
  { id: 'normal', label: 'NORMAL', permille: 1000, color: '#8a7fb0' },
  { id: 'veryHard', label: 'VERY HARD', permille: 1150, color: '#ff9f43' },
  { id: 'extreme', label: 'EXTREME', permille: 1250, color: '#ff4d4d' },
];

export const DEFAULT_DIFFICULTY: DifficultyId = 'normal';
export const DIFFICULTY_KEY = 'kirobit.difficulty.v1';

export interface DifficultyStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function difficultyById(id: unknown): Difficulty {
  return DIFFICULTIES.find((d) => d.id === id) ?? DIFFICULTIES[0]!;
}

/** Index in DIFFICULTIES; unknown ids map to NORMAL. */
export function difficultyIndex(id: unknown): number {
  return Math.max(0, DIFFICULTIES.findIndex((d) => d.id === id));
}

/** Parses stored text: `{ "v": 1, "id": "extreme" }`. Anything else is NORMAL. */
export function parseDifficulty(raw: string | null): DifficultyId {
  if (raw === null) return DEFAULT_DIFFICULTY;
  try {
    const data: unknown = JSON.parse(raw);
    if (data !== null && typeof data === 'object' && (data as { v?: unknown }).v === 1) {
      const id = (data as { id?: unknown }).id;
      if (DIFFICULTIES.some((d) => d.id === id)) return id as DifficultyId;
    }
  } catch {
    // corrupt data
  }
  return DEFAULT_DIFFICULTY;
}

export class DifficultyStore {
  private memory: DifficultyId = DEFAULT_DIFFICULTY;

  constructor(private storage: DifficultyStorage | null) {}

  load(): DifficultyId {
    if (this.storage === null) return this.memory;
    try {
      return parseDifficulty(this.storage.getItem(DIFFICULTY_KEY));
    } catch {
      this.storage = null;
      return this.memory;
    }
  }

  save(id: DifficultyId): void {
    this.memory = id;
    if (this.storage === null) return;
    try {
      this.storage.setItem(DIFFICULTY_KEY, JSON.stringify({ v: 1, id }));
    } catch {
      this.storage = null;
    }
  }
}

/** Run config for a difficulty: the base config (normal or cheat) with Squareman's speed scale. */
export function difficultyConfig(base: GameConfig, id: DifficultyId): GameConfig {
  return { ...base, hunterSpeedPermille: difficultyById(id).permille };
}
