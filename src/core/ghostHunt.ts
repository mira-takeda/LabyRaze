// Ghost Hunt state machine: lifecycle (task 12.1) plus ally movement, AI and catches (task 12.2).
//
// Separation rule: this module reads a GhostHuntView (which carries only a READ-ONLY
// `rescued` flag per Captive) and returns a new GhostHuntState. It never writes captives,
// the rescued count or carriedKeys, and a Ghost Hunt is never a Rescue. It never touches
// power fields or items. Allies are non-solid and never collide with the Player.
//
// End-of-effect destinations (user-approved rule):
//  - rescued ally   -> 'leaving' (exit and fade at the Cage entrance, then removed; it is
//                      NEVER put back into the Cage)
//  - imprisoned ally -> 'returning' (walks back into the Cage, becomes an inactive captive)
//
// Movement needs the grid layout. When `view.nav` is absent allies do not walk (a returning
// ally is placed straight back in its cage cell), which keeps the lifecycle tests pure.

import { CELL_UNITS } from './config';
import type { GameConfig } from './config';
import type { GhostHuntEvent } from './events';
import { dirDx, dirDy, isPassable } from './grid';
import { DistanceFieldCache, nextStepIndex } from './pathfinding';
import type { Ally, Cell, Dir, GhostHuntState, GhostHuntView } from './types';
import { CageInterior } from './types';

export type GhostHuntConfig = Pick<
  GameConfig,
  | 'ghostHuntTicks'
  | 'allyStaggerTicks'
  | 'allyLeaveTicks'
  | 'baseUnitsPerTick'
  | 'allyFactor'
  | 'allyLeadTicks'
  | 'allyHoldRadius'
>;

/** One-shot commands for this Tick. Both optional; `levelEnd` wins over `pickup`. */
export interface GhostHuntCommand {
  pickup?: boolean;
  levelEnd?: boolean;
  /** Player base units per Tick including Level_Speed (default: cfg.baseUnitsPerTick). */
  playerUnits?: number;
}

/** An ally touched the Hunter. The shared eaten handler applies HunterEaten { by: 'ally', allyId }. */
export interface AllyCatch {
  allyId: 0 | 1 | 2;
  cell: Cell;
}

export interface GhostHuntResult {
  gh: GhostHuntState;
  events: GhostHuntEvent[];
  /** At most one entry per Tick (the lowest ally id): the Hunter can only be eaten once. */
  catches: AllyCatch[];
}

/** Bounded fallback: a returning ally snaps into the Cage after this many Ticks. */
export const ALLY_RETURN_FALLBACK_TICKS = 600;

const copyCell = (c: Cell): Cell => ({ x: c.x, y: c.y });
const sameCell = (a: Cell, b: Cell): boolean => a.x === b.x && a.y === b.y;

function inactiveAlly(id: 0 | 1 | 2, cell: Cell): Ally {
  return { id, cell: copyCell(cell), next: null, progress: 0, dir: null, mode: 'inactive', spawnIn: 0, leaveIn: 0 };
}

/** The empty (cleaned-up) Ghost Hunt state. Deterministic. */
export function emptyGhostHunt(entrance: Cell): GhostHuntState {
  return { ticksLeft: 0, allies: [inactiveAlly(0, entrance), inactiveAlly(1, entrance), inactiveAlly(2, entrance)] };
}

function copyAlly(a: Ally): Ally {
  return { ...a, cell: copyCell(a.cell), next: a.next ? copyCell(a.next) : null };
}

function isEmpty(gh: GhostHuntState): boolean {
  return gh.ticksLeft === 0 && gh.allies.every((a) => a.mode === 'inactive');
}

function withAllies(gh: GhostHuntState, ticksLeft: number, f: (a: Ally, i: 0 | 1 | 2) => Ally): GhostHuntState {
  const [a0, a1, a2] = gh.allies;
  return { ticksLeft, allies: [f(a0, 0), f(a1, 1), f(a2, 2)] };
}

/** Start or refresh. Returns the new state and whether it was a refresh. */
function startOrRefresh(gh: GhostHuntState, view: GhostHuntView, cfg: GhostHuntConfig): GhostHuntResult {
  const active = gh.ticksLeft > 0 || gh.allies.some((a) => a.mode !== 'inactive');
  const next = withAllies(gh, cfg.ghostHuntTicks, (a, i) => {
    if (a.mode === 'hunting') return copyAlly(a); // keeps its stagger and position
    if (a.mode === 'returning') return { ...copyAlly(a), mode: 'hunting', leaveIn: 0 }; // resumes where it stands
    // inactive or leaving: (re)spawn from the Cage entrance with the stagger
    return {
      id: i,
      cell: copyCell(view.cage.entrance),
      next: null,
      progress: 0,
      dir: null,
      mode: 'hunting',
      spawnIn: i * cfg.allyStaggerTicks,
      leaveIn: 0,
    };
  });
  return { gh: next, events: [{ t: 'GhostHuntStarted', refresh: active, ticks: cfg.ghostHuntTicks }], catches: [] };
}

/** Expiry: choose each ally's destination from the read-only rescued flag. */
function expire(gh: GhostHuntState, view: GhostHuntView, cfg: GhostHuntConfig): GhostHuntState {
  return withAllies(gh, 0, (a, i) => {
    if (a.mode !== 'hunting') return copyAlly(a);
    if (a.spawnIn > 0) return inactiveAlly(i, view.cage.entrance); // never appeared
    if (view.rescued[i]) {
      // Rescued: exit and fade at the entrance. Never imprisoned again, never walks into the Cage.
      return {
        ...copyAlly(a),
        cell: copyCell(view.cage.entrance),
        next: null,
        progress: 0,
        dir: null,
        mode: 'leaving',
        leaveIn: cfg.allyLeaveTicks,
      };
    }
    // Imprisoned: walk back. `leaveIn` is the bounded-return countdown while returning.
    return { ...copyAlly(a), mode: 'returning', leaveIn: ALLY_RETURN_FALLBACK_TICKS };
  });
}

// ---------------------------------------------------------------------------------------
// Ally movement (task 12.2)
// ---------------------------------------------------------------------------------------

/** Memoises BFS fields; keyed by (walls.version, doorMask, size, layout, sources) so it is purely a cache. */
const fieldCache = new DistanceFieldCache(64);

type Nav = NonNullable<GhostHuntView['nav']>;

interface MoveCtx {
  view: GhostHuntView;
  nav: Nav;
  units: number; // ally fixed-point units per Tick
  leadUnits: number; // hunter speed estimate for target prediction
  cfg: GhostHuntConfig;
}

/** Ally speed: player base units x allyFactor, integer, kept below half a Cell (one boundary per Tick). */
export function allySpeedUnits(playerUnits: number, allyFactor: number): number {
  return Math.max(1, Math.min(Math.floor(CELL_UNITS / 2) - 1, Math.round(playerUnits * allyFactor)));
}

function passable(ctx: MoveCtx, c: Cell): boolean {
  const { nav, view } = ctx;
  return isPassable(view.walls.tiles, nav.width, nav.height, nav.doors, view.derived.doorMask, c.x, c.y);
}

function isInterior(ctx: MoveCtx, c: Cell): boolean {
  const { nav, view } = ctx;
  return view.walls.tiles[c.y * nav.width + c.x] === CageInterior;
}

/** Predicted Hunter Cell: walk `lead` Ticks of Hunter travel forward from its committed next Cell. */
function predictedHunterCell(ctx: MoveCtx, lead: number): Cell {
  const h = ctx.view.hunter;
  let cur = copyCell(h.next ?? h.cell);
  let steps = Math.floor((lead * ctx.leadUnits) / CELL_UNITS);
  while (steps > 0 && h.dir !== null) {
    const t = { x: cur.x + dirDx(h.dir), y: cur.y + dirDy(h.dir) };
    if (!passable(ctx, t) || isInterior(ctx, t)) break;
    cur = t;
    steps -= 1;
  }
  return cur;
}

/** Index of the Cell a boundary ally should step to, or -1 to hold. */
function chooseStep(a: Ally, at: Cell, ctx: MoveCtx): number {
  const { nav, view } = ctx;
  const idx = (c: Cell): number => c.y * nav.width + c.x;
  let target: Cell;
  let holdWithin = 0;
  if (a.mode === 'returning') {
    const interior = view.cage.interior;
    target = interior.length > 0 ? interior[a.id % interior.length]! : view.cage.entrance;
  } else {
    const h = view.hunter;
    if (h.respawnIn > 0) {
      // Hunter inactive: gather near the Squareman Start_Cell and wait within the hold radius.
      if (!view.hunterStart) return -1;
      target = view.hunterStart;
      holdWithin = ctx.cfg.allyHoldRadius;
    } else {
      target = predictedHunterCell(ctx, ctx.cfg.allyLeadTicks * a.id);
      if (sameCell(target, at)) target = copyCell(h.cell); // reached the lead point: close in
    }
  }
  const field = fieldCache.get(nav, view.walls, view.derived.doorMask, [idx(target)]);
  if (holdWithin > 0) {
    const d = field.dist[idx(at)]!;
    if (d >= 0 && d <= holdWithin) return -1;
  }
  const j = nextStepIndex(field, nav, at.x, at.y);
  if (j < 0) return -1;
  const c = { x: j % nav.width, y: Math.floor(j / nav.width) };
  if (!passable(ctx, c)) return -1;
  // Hunting allies stay out of the Cage interior (a rescued Kiro never goes back in).
  if (a.mode === 'hunting' && isInterior(ctx, c) && !isInterior(ctx, at)) return -1;
  return j;
}

function startStep(a: Ally, j: number, ctx: MoveCtx, progress: number): Ally {
  const { nav } = ctx;
  const to = { x: j % nav.width, y: Math.floor(j / nav.width) };
  const dir: Dir | null = stepDir(a.cell, to, ctx) ?? a.dir;
  return { ...a, next: to, progress, dir };
}

/** Direction of one step (wrap steps report the edge being left). */
function stepDir(from: Cell, to: Cell, ctx: MoveCtx): Dir | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 1 && dy === 0) return 'right';
  if (dx === -1 && dy === 0) return 'left';
  if (dy === 1 && dx === 0) return 'down';
  if (dy === -1 && dx === 0) return 'up';
  const { width, height } = ctx.nav;
  if (from.x === 0 && to.x > 0) return 'left';
  if (from.x === width - 1 && to.x < width - 1) return 'right';
  if (from.y === 0 && to.y > 0) return 'up';
  if (from.y === height - 1 && to.y < height - 1) return 'down';
  return null;
}

/** Real movement for one hunting or returning ally. Deterministic, walks passable cells only. */
function walkAlly(a0: Ally, ctx: MoveCtx): Ally {
  let a = a0;
  if (a.next === null) {
    const j = chooseStep(a, a.cell, ctx);
    if (j < 0) return { ...a, progress: 0 }; // hold at the boundary
    a = startStep(a, j, ctx, 0);
  }
  const next = a.next!;
  const progress = a.progress + ctx.units;
  if (progress < CELL_UNITS) return { ...a, progress };
  if (!passable(ctx, next)) {
    // A Door closed under the ally: wait at its edge until it opens (never enter a closed Door).
    return { ...a, progress: CELL_UNITS - 1 };
  }
  const arrived: Ally = { ...a, cell: copyCell(next), next: null, progress: 0 };
  const j = chooseStep(arrived, arrived.cell, ctx);
  if (j < 0) return arrived;
  return startStep(arrived, j, ctx, progress - CELL_UNITS);
}

function homeCell(a: Ally, view: GhostHuntView): Cell {
  const interior = view.cage.interior;
  return interior.length > 0 ? interior[a.id % interior.length]! : view.cage.entrance;
}

function toCaptive(a: Ally, view: GhostHuntView): Ally {
  return {
    ...a,
    cell: copyCell(homeCell(a, view)),
    next: null,
    progress: 0,
    dir: null,
    mode: 'inactive',
    spawnIn: 0,
    leaveIn: 0,
  };
}

function moveAlly(a: Ally, ctx: MoveCtx | null, view: GhostHuntView): Ally {
  if (a.mode === 'returning') {
    if (ctx === null) return toCaptive(a, view); // no grid layout: place straight back
    const left = Math.max(0, a.leaveIn - 1);
    if (left === 0) return toCaptive(a, view); // bounded fallback: snap into the Cage
    const w = walkAlly({ ...a, leaveIn: left }, ctx);
    if (w.next === null && sameCell(w.cell, homeCell(a, view))) return toCaptive(w, view);
    return w;
  }
  if (a.mode === 'hunting' && ctx !== null) return walkAlly(a, ctx);
  return a;
}

/** Cell an ally or the Hunter occupies for collision purposes (nearest cell of its step). */
function occupied(cell: Cell, next: Cell | null, progress: number): Cell {
  return next !== null && progress * 2 >= CELL_UNITS ? next : cell;
}

function detectCatch(allies: readonly Ally[], view: GhostHuntView): AllyCatch[] {
  const h = view.hunter;
  if (h.respawnIn > 0 || h.invulnerable > 0) return []; // dead or in grace: cannot be eaten
  const hOcc = occupied(h.cell, h.next, h.progress);
  for (const a of allies) {
    if (a.mode !== 'hunting' || a.spawnIn > 0) continue;
    const aOcc = occupied(a.cell, a.next, a.progress);
    const swap = a.next !== null && h.next !== null && sameCell(a.cell, h.next) && sameCell(a.next, h.cell);
    if (sameCell(aOcc, hOcc) || swap) return [{ allyId: a.id, cell: copyCell(hOcc) }];
  }
  return [];
}

function buildCtx(view: GhostHuntView, cfg: GhostHuntConfig, cmd: GhostHuntCommand): MoveCtx | null {
  if (!view.nav) return null;
  const playerUnits = cmd.playerUnits ?? cfg.baseUnitsPerTick;
  return { view, nav: view.nav, units: allySpeedUnits(playerUnits, cfg.allyFactor), leadUnits: playerUnits, cfg };
}

function tickAllies(
  gh: GhostHuntState,
  view: GhostHuntView,
  cfg: GhostHuntConfig,
  cmd: GhostHuntCommand,
): { gh: GhostHuntState; catches: AllyCatch[] } {
  const ctx = buildCtx(view, cfg, cmd);
  const next = withAllies(gh, gh.ticksLeft, (a) => {
    let n = copyAlly(a);
    if (n.mode === 'hunting' && n.spawnIn > 0) {
      n.spawnIn -= 1; // held at the entrance until spawned
    } else if (n.mode === 'leaving') {
      n.leaveIn = Math.max(0, n.leaveIn - 1);
      if (n.leaveIn === 0) {
        n = { ...n, mode: 'inactive', next: null, progress: 0, dir: null, spawnIn: 0 }; // removed from the maze
      }
    } else {
      n = moveAlly(n, ctx, view);
    }
    return n;
  });
  return { gh: next, catches: detectCatch(next.allies, view) };
}

export function stepGhostHunt(
  gh: GhostHuntState,
  view: GhostHuntView,
  cfg: GhostHuntConfig,
  cmd: GhostHuntCommand = {},
): GhostHuntResult {
  if (cmd.levelEnd) {
    const events: GhostHuntEvent[] = isEmpty(gh) ? [] : [{ t: 'GhostHuntEnded', reason: 'levelEnd' }];
    return { gh: emptyGhostHunt(view.cage.entrance), events, catches: [] };
  }
  // Rescue can happen after expiry, while an imprisoned ally is returning or already
  // inactive inside the Cage. Reconcile that read-only flag before movement/refresh;
  // the existing rule is that a rescued ally leaves and is never imprisoned again.
  const inside = (c: Cell): boolean => view.cage.interior.some((p) => sameCell(p, c));
  if (gh.allies.some((a, i) => view.rescued[i] &&
    (a.mode === 'returning' || inside(a.cell) || a.next !== null && inside(a.next)))) {
    gh = withAllies(gh, gh.ticksLeft, (a, i) => {
      if (!view.rescued[i]) return a;
      if (a.mode === 'returning') {
        return { ...inactiveAlly(i, view.cage.entrance), mode: 'leaving', leaveIn: cfg.allyLeaveTicks };
      }
      if (a.mode === 'inactive') return inactiveAlly(i, view.cage.entrance);
      if (inside(a.cell) || a.next !== null && inside(a.next)) {
        return { ...copyAlly(a), cell: copyCell(view.cage.entrance), next: null, progress: 0, dir: null };
      }
      return a;
    });
  }
  if (cmd.pickup) return startOrRefresh(gh, view, cfg);

  const events: GhostHuntEvent[] = [];
  let cur = gh;
  if (cur.ticksLeft > 0) {
    const t = tickAllies(cur, view, cfg, cmd);
    cur = t.gh;
    const left = cur.ticksLeft - 1;
    if (left <= 0) {
      cur = expire(cur, view, cfg);
      events.push({ t: 'GhostHuntEnded', reason: 'expired' });
    } else {
      cur = { ticksLeft: left, allies: cur.allies };
    }
    return { gh: cur, events, catches: t.catches };
  }
  if (cur.allies.some((a) => a.mode !== 'inactive')) cur = tickAllies(cur, view, cfg, cmd).gh;
  else cur = withAllies(cur, 0, copyAlly);
  return { gh: cur, events, catches: [] };
}
