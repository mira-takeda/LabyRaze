/**
 * Seeded PRNG: mulberry32 with explicit [value, nextState] helpers.
 * Pure, integer math only (Math.imul), no Math.random and no wall clock.
 */

/** A PRNG state is a single unsigned 32-bit integer. */
export type PrngState = number;

/** A draw result: the value and the next state. */
export type Draw<T> = readonly [T, PrngState];

/** Independent substreams. `items` covers Bomb, Ghost_Hunt and Spirit_Wisp placement. */
export type PrngStream = 'maze' | 'doors' | 'hunter' | 'repair' | 'items' | 'ice';

const STREAM_IDS: Readonly<Record<PrngStream, number>> = {
  maze: 1,
  doors: 2,
  hunter: 3,
  repair: 4,
  items: 5,
  ice: 6,
};

const GAMMA = 0x9e3779b9;

/** splitmix32-style integer finalizer. */
function mix32(x: number): number {
  let z = x | 0;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
  return (z ^ (z >>> 16)) >>> 0;
}

/** Normalizes any integer to an unsigned 32-bit state. */
export function seedState(seed: number): PrngState {
  return seed >>> 0;
}

/** One mulberry32 step: returns a uint32 and the next state. */
export function nextUint32(state: PrngState): Draw<number> {
  const s = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return [(t ^ (t >>> 14)) >>> 0, s >>> 0];
}

/** Float in [0, 1). */
export function nextFloat(state: PrngState): Draw<number> {
  const [u, next] = nextUint32(state);
  return [u / 4294967296, next];
}

/** Integer in [min, max] inclusive. Requires min <= max. */
export function nextInt(state: PrngState, min: number, max: number): Draw<number> {
  if (!(min <= max)) throw new RangeError(`nextInt: min ${min} > max ${max}`);
  const span = max - min + 1;
  const [u, next] = nextUint32(state);
  return [min + (u % span), next];
}

/** Picks one element of a non-empty array. */
export function pick<T>(state: PrngState, items: readonly T[]): Draw<T> {
  if (items.length === 0) throw new RangeError('pick: empty array');
  const [i, next] = nextInt(state, 0, items.length - 1);
  return [items[i] as T, next];
}

/** Fisher-Yates shuffle returning a new array; the input is not mutated. */
export function shuffle<T>(state: PrngState, items: readonly T[]): Draw<T[]> {
  const out = items.slice();
  let s = state;
  for (let i = out.length - 1; i > 0; i--) {
    const [j, next] = nextInt(s, 0, i);
    s = next;
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return [out, s];
}

/** Derives a substream seed from (runSeed, levelNumber, stream, retryIndex). */
export function deriveSeed(
  runSeed: number,
  levelNumber: number,
  stream: PrngStream,
  retryIndex = 0,
): PrngState {
  let h = mix32((runSeed | 0) ^ GAMMA);
  h = mix32((h + Math.imul(levelNumber | 0, 0x85ebca6b) + GAMMA) | 0);
  h = mix32((h + Math.imul(STREAM_IDS[stream], 0xc2b2ae35) + GAMMA) | 0);
  h = mix32((h + Math.imul(retryIndex | 0, 0x27d4eb2f) + GAMMA) | 0);
  return h >>> 0;
}
