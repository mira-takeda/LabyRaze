// Tolerant high score store (task 28.1). Key `kirobit.highscores.v1`,
// JSON { v: 1, scores: [{ score, level, date, name?, seed? }] }. Top 10, sorted descending.
// Missing or corrupt data loads as an empty list; storage errors switch to memory. Never throws.

import { DIFFICULTIES } from './difficulty';
import type { DifficultyId } from './difficulty';

export const HIGH_SCORE_KEY = 'kirobit.highscores.v1';
export const MAX_SCORES = 10;
export const NAME_MAX = 12;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ScoreEntry {
  score: number;
  level: number;
  date: number;
  name?: string;
  seed?: number;
  /** Difficulty of the run; entries saved before difficulties existed load as normal. */
  difficulty?: DifficultyId;
}

function isNonNegInt(x: unknown): x is number {
  return typeof x === 'number' && Number.isInteger(x) && x >= 0 && Number.isFinite(x);
}

/** Strict validator for one entry. */
export function validEntry(x: unknown): x is ScoreEntry {
  if (x === null || typeof x !== 'object' || Array.isArray(x)) return false;
  const o = x as Record<string, unknown>;
  if (!isNonNegInt(o.score) || !isNonNegInt(o.level) || o.level < 1) return false;
  if (typeof o.date !== 'number' || !Number.isFinite(o.date) || o.date < 0) return false;
  if (o.name !== undefined && (typeof o.name !== 'string' || o.name.length > NAME_MAX)) return false;
  if (o.seed !== undefined && (typeof o.seed !== 'number' || !Number.isInteger(o.seed))) return false;
  if (o.difficulty !== undefined && !DIFFICULTIES.some((d) => d.id === o.difficulty)) return false;
  return true;
}

function clean(e: ScoreEntry): ScoreEntry {
  const out: ScoreEntry = { score: e.score, level: e.level, date: e.date, difficulty: e.difficulty ?? 'normal' };
  if (e.name !== undefined) out.name = e.name;
  if (e.seed !== undefined) out.seed = e.seed;
  return out;
}

/** Stable sort descending by score (earlier entries win ties) and cap at 10. */
export function rank(list: readonly ScoreEntry[]): ScoreEntry[] {
  return list
    .map((e, i) => ({ e, i }))
    .sort((a, b) => b.e.score - a.e.score || a.i - b.i)
    .slice(0, MAX_SCORES)
    .map(({ e }) => clean(e));
}

/** Parses stored text; unparseable data yields an empty list, corrupt entries are dropped. */
export function parseScores(raw: string | null): ScoreEntry[] {
  if (raw === null) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  // Accept the versioned object and (tolerantly) a bare array.
  const list = Array.isArray(data) ? data : data !== null && typeof data === 'object' ? (data as { scores?: unknown }).scores : undefined;
  if (!Array.isArray(list) || list.length > 100) return [];
  return rank(list.filter(validEntry));
}

export class HighScoreStore {
  private memory: ScoreEntry[] | null = null;

  constructor(
    private storage: StorageLike | null,
    private readonly key: string = HIGH_SCORE_KEY,
  ) {}

  /** True once a storage error switched the store to memory. */
  get inMemory(): boolean {
    return this.storage === null;
  }

  load(): ScoreEntry[] {
    if (this.storage === null) return [...(this.memory ?? [])];
    try {
      return parseScores(this.storage.getItem(this.key));
    } catch {
      this.storage = null;
      return [...(this.memory ?? [])];
    }
  }

  /** True when `score` would enter the top 10. */
  qualifies(score: number): boolean {
    const list = this.load();
    return list.length < MAX_SCORES || score > list[list.length - 1]!.score;
  }

  submit(entry: ScoreEntry): ScoreEntry[] {
    const e = clean({ ...entry, name: entry.name?.slice(0, NAME_MAX) });
    if (!validEntry(e)) return this.load();
    const next = rank([...this.load(), e]);
    this.memory = next;
    if (this.storage) {
      try {
        this.storage.setItem(this.key, JSON.stringify({ v: 1, scores: next }));
      } catch {
        this.storage = null; // quota or access denied: memory for the rest of the session
      }
    }
    return [...next];
  }
}
