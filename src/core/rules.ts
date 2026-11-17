// Rules (part 1): item pickup with a single collector-mask check, Key pickup,
// Cage-entrance Rescue, Ordinary_Pellet accounting and the level outcome.
// Pure TypeScript: no DOM, no wall clock, no randomness. Inputs are never mutated.
//
// Rescue reads and writes only `captives` and `carriedKeys`. This module must not
// import ghostHunt.ts: Ghost Hunt is never a Rescue.

import { CELL_UNITS } from './config';
import type { GameConfig } from './config';
import type { GameEvent } from './events';
import { computeDistanceField } from './pathfinding';
import { grantSpeed, resolvePowerPickups } from './powers';
import { unitsPerTick } from './progression';
import { resetComboOnEaten, scoreFor } from './score';
import { COLLECT_HUNTER, COLLECT_PLAYER, COLLECTOR_MASK, ItemKind, Tile } from './types';
import type { Cell, GameState, ItemKindCode, Who } from './types';

/** Result of any rules step: the new state plus the events it produced. */
export interface RulesResult {
  state: GameState;
  events: GameEvent[];
}

/**
 * Extension point for item kinds whose effects live in other modules (task 16.3 wires
 * Bomb, Ghost_Hunt and Wisp). A handler is called only after the collector-mask check
 * passed. It owns consuming the item (a Bomb at capacity stays on its Cell).
 * Without a handler the item is left untouched.
 */
export type SpecialPickupHandler = (state: GameState, cell: Cell) => RulesResult;

export interface PickupHandlers {
  bomb?: SpecialPickupHandler;
  ghostHunt?: SpecialPickupHandler;
  wisp?: SpecialPickupHandler;
}

const COLLECTOR_BIT: Readonly<Record<Who, number>> = { player: COLLECT_PLAYER, hunter: COLLECT_HUNTER };

/** The single collector-mask check. */
export function canCollect(who: Who, kind: ItemKindCode): boolean {
  return (COLLECTOR_MASK[kind] & COLLECTOR_BIT[who]) !== 0;
}

function sameCell(a: Cell, b: Cell): boolean {
  return a.x === b.x && a.y === b.y;
}

function clearItem(state: GameState, index: number, patch: Partial<GameState['items']>): GameState {
  const kinds = state.items.kinds.slice();
  kinds[index] = ItemKind.None;
  return { ...state, items: { ...state.items, ...patch, kinds } };
}

/** Key pickup (Player only): carriedKeys + 1, the Key leaves the floor. */
export function pickupKey(state: GameState): RulesResult {
  const cell = state.player.cell;
  const at = state.items.keys.findIndex((k) => sameCell(k, cell));
  if (at < 0) return { state, events: [] };
  const keys = state.items.keys.filter((_, i) => i !== at);
  return {
    state: { ...state, carriedKeys: state.carriedKeys + 1, items: { ...state.items, keys } },
    events: [{ t: 'KeyCollected', cell: { ...cell } }],
  };
}

interface PickupOutcome {
  state: GameState;
  events: GameEvent[];
  power: boolean;
}

function pickupFor(
  state: GameState,
  who: Who,
  cfg: Pick<GameConfig, 'speedDurationTicks'>,
  handlers: PickupHandlers,
): PickupOutcome {
  const c = state[who];
  if (who === 'hunter' && c.respawnIn > 0) return { state, events: [], power: false };
  const events: GameEvent[] = [];
  let cur = state;

  if (who === 'player') {
    const k = pickupKey(cur);
    cur = k.state;
    events.push(...k.events);
  }

  const cell = c.cell;
  const index = cell.y * state.maze.width + cell.x;
  const kind = cur.items.kinds[index] as ItemKindCode;
  if (kind === ItemKind.None || !canCollect(who, kind)) return { state: cur, events, power: false };

  switch (kind) {
    case ItemKind.Ordinary:
      // Only Ordinary_Pellets feed ordinaryRemaining; no other kind touches it.
      cur = clearItem(cur, index, { ordinaryRemaining: cur.items.ordinaryRemaining - 1 });
      events.push({ t: 'PelletCollected', kind: 'ordinary', by: who, cell: { ...cell } });
      return { state: cur, events, power: false };
    case ItemKind.Power:
      cur = clearItem(cur, index, {});
      events.push({ t: 'PelletCollected', kind: 'power', by: who, cell: { ...cell } });
      return { state: cur, events, power: true }; // granted by the caller (same-Tick tie-break)
    case ItemKind.Speed: {
      cur = clearItem(cur, index, {});
      const g = grantSpeed({ player: cur.player, hunter: cur.hunter }, who, cfg);
      cur = { ...cur, player: g.player, hunter: g.hunter };
      events.push({ t: 'PelletCollected', kind: 'speed', by: who, cell: { ...cell } }, ...g.events);
      return { state: cur, events, power: false };
    }
    case ItemKind.Bomb:
    case ItemKind.GhostHunt:
    case ItemKind.Wisp: {
      const h = kind === ItemKind.Bomb ? handlers.bomb : kind === ItemKind.GhostHunt ? handlers.ghostHunt : handlers.wisp;
      if (!h) return { state: cur, events, power: false };
      const r = h(cur, cell);
      events.push(...r.events);
      return { state: r.state, events, power: false };
    }
    default:
      return { state: cur, events, power: false };
  }
}

/**
 * Resolves pickups of one Tick: Player first (Keys, Power, Speed, special items), then
 * Hunter (Ordinary, Power, Speed). A same-Tick double Power pickup is ordered by tick parity.
 */
export function resolvePickups(
  state: GameState,
  cfg: Pick<GameConfig, 'powerTicks' | 'speedDurationTicks'>,
  handlers: PickupHandlers = {},
): RulesResult {
  const events: GameEvent[] = [];
  const p = pickupFor(state, 'player', cfg, handlers);
  const h = pickupFor(p.state, 'hunter', cfg, handlers);
  events.push(...p.events, ...h.events);
  let cur = h.state;
  if (p.power || h.power) {
    const r = resolvePowerPickups({ player: cur.player, hunter: cur.hunter }, cur.tick, { player: p.power, hunter: h.power }, cfg);
    cur = { ...cur, player: r.player, hunter: r.hunter };
    events.push(...r.events);
  }
  return { state: cur, events };
}

/**
 * Cage-entrance Rescue. With the Player on the entrance and carriedKeys > 0, releases
 * n = min(carriedKeys, unreleased) Captives in index order. `captives` is monotone.
 * The third release sets phase 'levelEnd' and outcome 'playerWin'.
 */
export function resolveRescue(state: GameState, cfg: Pick<GameConfig, 'scoreWeights'>): RulesResult {
  if (state.phase !== 'playing' || state.carriedKeys <= 0) return { state, events: [] };
  if (!sameCell(state.player.cell, state.maze.cage.entrance)) return { state, events: [] };

  const unreleased: Array<0 | 1 | 2> = [];
  state.captives.forEach((released, i) => {
    if (!released) unreleased.push(i as 0 | 1 | 2);
  });
  const n = Math.min(state.carriedKeys, unreleased.length);
  if (n <= 0) return { state, events: [] };

  const captives: [boolean, boolean, boolean] = [state.captives[0], state.captives[1], state.captives[2]];
  const events: GameEvent[] = [];
  for (const index of unreleased.slice(0, n)) {
    captives[index] = true;
    events.push({ t: 'CaptiveReleased', index });
  }
  let next: GameState = {
    ...state,
    captives,
    carriedKeys: state.carriedKeys - n,
    score: state.score + n * scoreFor(cfg.scoreWeights, 'captive'),
  };
  if (captives.every(Boolean)) {
    next = { ...next, phase: 'levelEnd', outcome: 'playerWin' };
    events.push({ t: 'LevelEnded', outcome: 'playerWin', level: next.levelNumber });
  }
  return { state: next, events };
}

/**
 * Level outcome, evaluated once per Tick after pickups and Rescue. Player win (three
 * Captives released) takes precedence over the Squareman win (ordinaryRemaining at 0)
 * per `simultaneousWinTieRule`. Wisps never enter either condition.
 */
export function evaluateOutcome(state: GameState): RulesResult {
  if (state.phase !== 'playing') return { state, events: [] };
  // The only tie rule is 'playerWins', so the Player condition is checked first.
  if (state.captives.every(Boolean)) {
    return {
      state: { ...state, phase: 'levelEnd', outcome: 'playerWin' },
      events: [{ t: 'LevelEnded', outcome: 'playerWin', level: state.levelNumber }],
    };
  }
  if (state.items.ordinaryRemaining <= 0) {
    return {
      state: { ...state, phase: 'levelEnd', outcome: 'hunterWin' },
      events: [{ t: 'LevelEnded', outcome: 'hunterWin', level: state.levelNumber }],
    };
  }
  return { state, events: [] };
}

/** Pickups, then Rescue, then the outcome check (design Per-Tick steps 7, 9, 11). */
export function resolveItemsAndRescue(
  state: GameState,
  cfg: Pick<GameConfig, 'powerTicks' | 'speedDurationTicks' | 'scoreWeights'>,
  handlers: PickupHandlers = {},
): RulesResult {
  const a = resolvePickups(state, cfg, handlers);
  const b = resolveRescue(a.state, cfg);
  const c = evaluateOutcome(b.state);
  return { state: c.state, events: [...a.events, ...b.events, ...c.events] };
}

// ---------------------------------------------------------------------------
// Rules (part 2): collisions, eat rules, lives, respawn, dropped Keys.
// ---------------------------------------------------------------------------

/** Cells the two characters occupied at the start of the Tick (for swap detection). */
export interface PreviousCells {
  player: Cell;
  hunter: Cell;
}

/** An ally catch as reported by Ghost Hunt (plain data: this module never imports ghostHunt.ts). */
export interface AllyCatchInput {
  allyId: 0 | 1 | 2;
  cell: Cell;
}

export type CollisionKind = 'sameCell' | 'swap';

/**
 * Same-Cell or swap (cross-through) collision between the Player and the Hunter.
 * `prev` is optional: without it only same-Cell is detected.
 */
export function detectCollision(
  prev: PreviousCells | null,
  player: Cell,
  hunter: Cell,
): CollisionKind | null {
  if (sameCell(player, hunter)) return 'sameCell';
  if (prev !== null && sameCell(prev.player, hunter) && sameCell(prev.hunter, player)) return 'swap';
  return null;
}

/** Hunter can be eaten: alive and not in respawn grace. */
export function hunterEdible(state: GameState): boolean {
  return state.hunter.respawnIn <= 0 && state.hunter.invulnerable <= 0;
}

/**
 * Dropped Keys: nearest reachable floor Cells to `from` (BFS with every Door treated as
 * open), distinct, not holding another Key, never in the Cage. Ties: distance, then index.
 * May return fewer than `count` Cells if not enough exist.
 */
export function droppedKeyCells(state: GameState, from: Cell, count: number): Cell[] {
  if (count <= 0) return [];
  const { width, height, doors } = state.maze;
  const allOpen = doors.length >= 31 ? 0xffffffff : ((1 << doors.length) - 1) >>> 0;
  const field = computeDistanceField(state.maze, state.walls.tiles, allOpen, state.walls.version, [
    from.y * width + from.x,
  ]);
  const taken = new Set<number>(state.items.keys.map((k) => k.y * width + k.x));
  const cage = new Set<number>(state.maze.cage.interior.map((c) => c.y * width + c.x));
  cage.add(state.maze.cage.entrance.y * width + state.maze.cage.entrance.x);
  const candidates: Array<{ d: number; i: number }> = [];
  for (let i = 0; i < width * height; i++) {
    const d = field.dist[i]!;
    if (d < 0 || taken.has(i) || cage.has(i)) continue;
    if (state.walls.tiles[i] !== Tile.Floor) continue;
    candidates.push({ d, i });
  }
  candidates.sort((a, b) => a.d - b.d || a.i - b.i);
  return candidates.slice(0, count).map(({ i }) => ({ x: i % width, y: Math.floor(i / width) }));
}

/**
 * Fair respawn Cell. Candidates are Floor Cells (never Wall, Cage, gate or Door) reachable
 * from the Player start with every Door open, holding no Key (`keys`) and not occupied by
 * Squareman. `playerStart` is preferred when it is at least `minDist` path Cells from
 * Squareman (its Cell or the Cell it is entering). Otherwise the candidate with the largest
 * distance wins; ties go to the Cell closest to `playerStart`, then the lowest index.
 * Falls back to `playerStart` when no candidate exists. Deterministic, no randomness.
 *
 * Preferred first (second playtest): Cells at least `safeDist` path Cells from Squareman with at
 * least two open neighbours (never a dead end), nearest to `playerStart`. With `safeDist` from
 * `respawnSafeDistance`, Squareman cannot reach the Player before the invulnerability ends. The
 * rule above is the fallback when no such Cell exists, so every older guarantee still holds.
 */
export function fairRespawnCell(
  state: GameState,
  keys: ReadonlyArray<Cell>,
  minDist: number,
  safeDist: number = minDist,
): Cell {
  const { width, height, doors, playerStart } = state.maze;
  const allOpen = doors.length >= 31 ? 0xffffffff : ((1 << doors.length) - 1) >>> 0;
  const startIdx = playerStart.y * width + playerStart.x;
  const h = state.hunter;
  const sources = [h.cell.y * width + h.cell.x];
  if (h.next) sources.push(h.next.y * width + h.next.x);
  const hf = computeDistanceField(state.maze, state.walls.tiles, allOpen, state.walls.version, sources);
  const sf = computeDistanceField(state.maze, state.walls.tiles, allOpen, state.walls.version, [startIdx]);
  const hasKey = new Set<number>(keys.map((k) => k.y * width + k.x));
  const far = (i: number): number => (hf.dist[i]! < 0 ? Number.MAX_SAFE_INTEGER : hf.dist[i]!);
  // Never respawn onto a Player-collectible item (it would be auto-collected).
  const playerItem = (i: number): boolean => (COLLECTOR_MASK[state.items.kinds[i] as ItemKindCode] & COLLECT_PLAYER) !== 0;
  const ok = (i: number): boolean =>
    state.walls.tiles[i] === Tile.Floor && sf.dist[i]! >= 0 && !hasKey.has(i) && !playerItem(i) && hf.dist[i] !== 0;
  const open = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    const tt = state.walls.tiles[y * width + x];
    return tt === Tile.Floor || tt === Tile.Door;
  };
  const exits = (i: number): number => {
    const x = i % width;
    const y = (i - x) / width;
    return Number(open(x, y - 1)) + Number(open(x + 1, y)) + Number(open(x, y + 1)) + Number(open(x - 1, y));
  };
  const safe = (i: number): boolean => ok(i) && far(i) >= safeDist && exits(i) >= 2;
  if (safe(startIdx)) return { ...playerStart };
  let pick = -1;
  for (let i = 0; i < width * height; i++) {
    if (!safe(i)) continue;
    const closer = pick < 0 || sf.dist[i]! < sf.dist[pick]!;
    if (closer || (sf.dist[i] === sf.dist[pick] && far(i) > far(pick))) pick = i;
  }
  if (pick >= 0) return { x: pick % width, y: Math.floor(pick / width) };

  if (ok(startIdx) && far(startIdx) >= minDist) return { ...playerStart };
  let best = -1;
  for (let i = 0; i < width * height; i++) {
    if (!ok(i)) continue;
    if (best < 0) {
      best = i;
      continue;
    }
    const a = far(i);
    const b = far(best);
    // Strict comparisons keep the lowest index on a full tie.
    if (a > b || (a === b && sf.dist[i]! < sf.dist[best]!)) best = i;
  }
  return best < 0 ? { ...playerStart } : { x: best % width, y: Math.floor(best / width) };
}

export type RespawnConfig = Pick<
  GameConfig,
  'invulnerabilityTicks' | 'respawnMinHunterDist' | 'baseUnitsPerTick' | 'speedIncrement' | 'speedCap'
>;

/**
 * Path Cells Squareman covers during the respawn invulnerability at this level's speed (never
 * below `respawnMinHunterDist`). Derived from existing config values; no new tunable.
 */
export function respawnSafeDistance(levelNumber: number, cfg: RespawnConfig): number {
  const cells = Math.ceil((cfg.invulnerabilityTicks * unitsPerTick(levelNumber, cfg)) / CELL_UNITS);
  return Math.max(cfg.respawnMinHunterDist, cells);
}

/** Player eaten: -1 life, respawn with invulnerability, Combo reset, Keys dropped, bombs kept. */
export function applyPlayerEaten(
  state: GameState,
  cfg: RespawnConfig,
): RulesResult {
  const death = { ...state.player.cell };
  const drops = droppedKeyCells(state, death, state.carriedKeys);
  const combo = resetComboOnEaten({ comboCount: state.comboCount, comboTicksLeft: state.comboTicksLeft });
  const lives = Math.max(0, state.lives - 1);
  const safeDist = respawnSafeDistance(state.levelNumber, cfg);
  const start = fairRespawnCell(state, [...state.items.keys, ...drops], cfg.respawnMinHunterDist, safeDist);
  const events: GameEvent[] = [{ t: 'PlayerEaten', cell: death, keysDropped: drops.length }, ...combo.events];
  let next: GameState = {
    ...state,
    lives,
    carriedKeys: state.carriedKeys - drops.length,
    items: { ...state.items, keys: [...state.items.keys, ...drops] },
    comboCount: combo.combo.comboCount,
    comboTicksLeft: combo.combo.comboTicksLeft,
    player: {
      ...state.player,
      cell: { ...start },
      next: null,
      progress: 0,
      dir: null,
      buffered: null,
      invulnerable: cfg.invulnerabilityTicks,
    },
  };
  if (lives <= 0) {
    // (1UP: step() revives this game over if a milestone was crossed on the same Tick.)
    next = { ...next, phase: 'gameOver' };
    events.push({ t: 'GameOver', score: next.score });
  }
  return { state: next, events };
}

/**
 * Shared Hunter-eaten handler (`by: 'player'` or `by: 'ally'`). Score goes to the Player.
 * The Hunter returns to its Start_Cell, stays inactive for `hunterRespawnTicks`, and then
 * cannot be eaten for `hunterGraceTicks` (grace is carried in `invulnerable`, which counts
 * down together with `respawnIn`). Power fields are untouched.
 */
export function applyHunterEaten(
  state: GameState,
  cfg: Pick<GameConfig, 'hunterRespawnTicks' | 'hunterGraceTicks' | 'scoreWeights'>,
  by: 'player' | 'ally',
  allyId?: 0 | 1 | 2,
): RulesResult {
  const cell = { ...state.hunter.cell };
  const event: GameEvent =
    by === 'ally' && allyId !== undefined
      ? { t: 'HunterEaten', cell, by, allyId }
      : { t: 'HunterEaten', cell, by };
  return {
    state: {
      ...state,
      score: state.score + scoreFor(cfg.scoreWeights, 'hunterEaten'),
      hunter: {
        ...state.hunter,
        cell: { ...state.maze.hunterStart },
        next: null,
        progress: 0,
        dir: null,
        respawnIn: cfg.hunterRespawnTicks,
        invulnerable: cfg.hunterRespawnTicks + cfg.hunterGraceTicks,
      },
    },
    events: [event],
  };
}

export type CollisionConfig = Pick<
  GameConfig,
  | 'invulnerabilityTicks'
  | 'respawnMinHunterDist'
  | 'hunterRespawnTicks'
  | 'hunterGraceTicks'
  | 'scoreWeights'
  | 'baseUnitsPerTick'
  | 'speedIncrement'
  | 'speedCap'
>;

/**
 * Collisions of one Tick (design step 8): Player versus Hunter, then ally catches.
 * Allies never evaluate against the Player. `captives` is never read or written.
 */
export function resolveCollisions(
  state: GameState,
  prev: PreviousCells | null,
  cfg: CollisionConfig,
  allyCatches: ReadonlyArray<AllyCatchInput> = [],
): RulesResult {
  if (state.phase !== 'playing') return { state, events: [] };
  const events: GameEvent[] = [];
  let cur = state;

  if (cur.hunter.respawnIn <= 0 && detectCollision(prev, cur.player.cell, cur.hunter.cell) !== null) {
    if (cur.player.power > 0) {
      if (hunterEdible(cur)) {
        const r = applyHunterEaten(cur, cfg, 'player');
        cur = r.state;
        events.push(...r.events);
      }
    } else if (cur.player.invulnerable <= 0) {
      const r = applyPlayerEaten(cur, cfg);
      cur = r.state;
      events.push(...r.events);
    }
  }

  if (cur.phase === 'playing') {
    for (const c of allyCatches) {
      if (!hunterEdible(cur)) break;
      const r = applyHunterEaten(cur, cfg, 'ally', c.allyId);
      cur = r.state;
      events.push(...r.events);
    }
  }
  return { state: cur, events };
}
