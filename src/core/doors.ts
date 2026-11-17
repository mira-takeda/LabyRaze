// Door schedule, warnings and occupancy gate (Requirements 5.1 to 5.5, 5.9).
// Pure and deterministic: no wall clock, no randomness, no mutation of inputs.
//
// Schedule: with phase = (tick + phaseOffset) mod period, a Door is scheduled
// open while phase < openDuration, where openDuration = round(period * openRatio).
// The scheduled change happens on the Tick where the phase hits a boundary.
//
// Warning: `warning` is 0 outside the warn window and rises to 1 as the change
// approaches. `DoorWarning` is emitted once per scheduled change, on the first
// Tick where nextChangeIn <= warnTicks, so it precedes `DoorChanged` by at
// least warnTicks (>= 30) whenever the preceding segment is long enough.
//
// Gating: a scheduled close is postponed (never forced) while any close gate
// refuses it. The occupancy gate is built in. Task 7.3 adds the reachability
// gate through the CloseGate extension point below.
import type { GameConfig } from './config';
import type { GameEvent } from './events';
import { NEIGHBOR_DX, NEIGHBOR_DY, isPassable, wrapPartner } from './grid';
import type { Cell, Character, DerivedNav, DoorSpec, DoorState, Maze, WallLayer } from './types';

/** Minimum warning window in Ticks (Requirement 5.3). */
export const MIN_DOOR_WARN_TICKS = 30;

/** Only the Player and the Hunter can block a close. Allies are never passed in. */
export interface DoorOccupants {
  player: Pick<Character, 'cell' | 'next'>;
  hunter: Pick<Character, 'cell' | 'next'>;
}

/** Everything a close gate may look at when deciding on a scheduled close. */
export interface DoorGateContext {
  doorIndex: number;
  spec: DoorSpec;
  /** Door states as they were at the start of this Tick (before any change). */
  doors: readonly DoorState[];
  tick: number;
  occupants: DoorOccupants;
}

/**
 * Extension point for task 7.3: return true to ALLOW the scheduled close,
 * false to postpone it. The occupancy gate always runs first.
 */
export type CloseGate = (ctx: DoorGateContext) => boolean;

export interface DoorStepResult {
  doors: DoorState[];
  events: GameEvent[];
}

function warnWindow(cfg: Pick<GameConfig, 'doorWarnTicks'>): number {
  return Math.max(MIN_DOOR_WARN_TICKS, Math.floor(cfg.doorWarnTicks));
}

/** Ticks the Door is scheduled open per period. */
export function openDuration(spec: Pick<DoorSpec, 'period' | 'openRatio'>): number {
  return Math.round(spec.period * spec.openRatio);
}

function positiveMod(a: number, m: number): number {
  return ((a % m) + m) % m;
}

/** Schedule lookup at `tick`: scheduled state and Ticks to the next scheduled change (>= 1). */
export function scheduleAt(spec: DoorSpec, tick: number): { open: boolean; nextChangeIn: number } {
  const dur = openDuration(spec);
  if (dur >= spec.period) return { open: true, nextChangeIn: Number.POSITIVE_INFINITY };
  if (dur <= 0) return { open: false, nextChangeIn: Number.POSITIVE_INFINITY };
  const phase = positiveMod(tick + spec.phaseOffset, spec.period);
  return phase < dur
    ? { open: true, nextChangeIn: dur - phase }
    : { open: false, nextChangeIn: spec.period - phase };
}

function warningIntensity(nextChangeIn: number, warnTicks: number): number {
  if (!Number.isFinite(nextChangeIn) || nextChangeIn > warnTicks) return 0;
  return Math.min(1, (warnTicks - nextChangeIn + 1) / warnTicks);
}

/** True when a character stands on the Door Cell or is stepping into it. */
function occupies(c: Pick<Character, 'cell' | 'next'>, door: Cell): boolean {
  return (
    (c.cell.x === door.x && c.cell.y === door.y) ||
    (c.next !== null && c.next.x === door.x && c.next.y === door.y)
  );
}

/** Occupancy gate (Requirement 5.5): true when no Player or Hunter is on or entering the Cell. */
export function occupancyAllowsClose(door: Cell, occupants: DoorOccupants): boolean {
  return !occupies(occupants.player, door) && !occupies(occupants.hunter, door);
}

/** Initial Door states for `tick` (normally 0). Emits no events. */
export function initDoors(specs: readonly DoorSpec[], tick: number, cfg: Pick<GameConfig, 'doorWarnTicks'>): DoorState[] {
  const warn = warnWindow(cfg);
  return specs.map((spec, index) => {
    const s = scheduleAt(spec, tick);
    return {
      index,
      open: s.open,
      nextChangeIn: s.nextChangeIn,
      warning: warningIntensity(s.nextChangeIn, warn),
      postponed: false,
    };
  });
}

/**
 * Advances every Door by one Tick. `tick` is the Tick being simulated.
 * Returns new Door states and the DoorWarning / DoorChanged events (in Door order).
 */
export function stepDoors(
  specs: readonly DoorSpec[],
  doors: readonly DoorState[],
  tick: number,
  occupants: DoorOccupants,
  cfg: Pick<GameConfig, 'doorWarnTicks'>,
  gates: readonly CloseGate[] = [],
): DoorStepResult {
  const warn = warnWindow(cfg);
  const events: GameEvent[] = [];
  const out: DoorState[] = [];

  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i]!;
    const prev = doors[i]!;
    const sched = scheduleAt(spec, tick);

    let open = prev.open;
    let postponed = false;
    let changed = false;
    let skipped = false;

    if (sched.open !== prev.open) {
      if (sched.open) {
        open = true;
        changed = true;
      } else if (sched.nextChangeIn < warn) {
        // Too late to close with a full warning before the reopen (a long
        // postponement ate the closed segment): skip this close entirely.
        // Only adds open time, so the open ratio is preserved.
        skipped = true;
      } else {
        const ctx: DoorGateContext = { doorIndex: i, spec, doors, tick, occupants };
        const allowed = occupancyAllowsClose(spec.cell, occupants) && gates.every((g) => g(ctx));
        if (allowed) {
          open = false;
          changed = true;
        } else {
          postponed = true;
        }
      }
    }

    // While postponed the close is retried next Tick.
    const nextChangeIn = postponed ? 1 : sched.nextChangeIn;
    const warning = postponed ? 1 : skipped ? 0 : warningIntensity(sched.nextChangeIn, warn);

    // One DoorWarning per scheduled change: on entering the warn window,
    // or at the change Tick itself when the new segment is already inside it.
    const prevWarning = changed ? 0 : prev.warning;
    if (warning > 0 && !skipped && prevWarning === 0 && !postponed && Number.isFinite(sched.nextChangeIn)) {
      events.push({ t: 'DoorWarning', doorIndex: i, open: !sched.open });
    }
    if (changed) events.push({ t: 'DoorChanged', doorIndex: i, open });

    out.push({ index: i, open, nextChangeIn, warning, postponed });
  }

  return { doors: out, events };
}

// ---------------------------------------------------------------------------
// Task 7.3: connectivity tables and the reachability close gate.
//
// For every doorMask (bit i set = Door i open) the floor graph is flood-filled
// into component labels. `connectivity[mask]` is the number of distinct
// components among the objective Cells (Keys, Cage entrance); 1 (or 0) means
// all objectives are mutually reachable. `restoreTicks[mask]` is the static
// worst-case number of Ticks until the objectives are mutually reachable again
// when every closed Door reopens on schedule (0 when already connected,
// Infinity when no opening sequence restores them).
// ---------------------------------------------------------------------------

/** The part of a Maze the tables need. */
export type DoorNavLayout = Pick<Maze, 'width' | 'height' | 'wrapPairs'>;

/** DerivedNav plus the per-mask component labels the gate reads (extra field is additive). */
export interface DerivedTables extends DerivedNav {
  /** Per doorMask: component label per Cell index, -1 for impassable Cells. */
  labels: Int32Array[];
}

/** Longest stretch a Door stays closed per period, in Ticks. */
function closedLength(spec: DoorSpec): number {
  return Math.max(0, spec.period - openDuration(spec));
}

function labelComponents(
  nav: DoorNavLayout,
  tiles: Uint8Array,
  doors: readonly DoorSpec[],
  mask: number,
): Int32Array {
  const { width, height, wrapPairs } = nav;
  const total = width * height;
  const label = new Int32Array(total).fill(-1);
  const queue = new Int32Array(total);
  let next = 0;
  for (let s = 0; s < total; s++) {
    if (label[s] !== -1) continue;
    const sx = s % width;
    const sy = (s - sx) / width;
    if (!isPassable(tiles, width, height, doors, mask, sx, sy)) continue;
    let head = 0;
    let tail = 0;
    label[s] = next;
    queue[tail++] = s;
    while (head < tail) {
      const cur = queue[head++]!;
      const cx = cur % width;
      const cy = (cur - cx) / width;
      for (let k = 0; k < 4; k++) {
        const nx = cx + NEIGHBOR_DX[k]!;
        const ny = cy + NEIGHBOR_DY[k]!;
        if (!isPassable(tiles, width, height, doors, mask, nx, ny)) continue;
        const j = ny * width + nx;
        if (label[j] !== -1) continue;
        label[j] = next;
        queue[tail++] = j;
      }
      if (wrapPairs.length > 0) {
        const p = wrapPartner(wrapPairs, cx, cy);
        if (p !== null && isPassable(tiles, width, height, doors, mask, p.x, p.y)) {
          const j = p.y * width + p.x;
          if (label[j] === -1) {
            label[j] = next;
            queue[tail++] = j;
          }
        }
      }
    }
    next++;
  }
  return label;
}

function objectiveComponents(labels: Int32Array, width: number, objectives: readonly Cell[]): number {
  const seen = new Set<number>();
  let blocked = 0;
  for (const o of objectives) {
    const l = labels[o.y * width + o.x]!;
    if (l < 0) blocked++;
    else seen.add(l);
  }
  return seen.size + blocked;
}

/**
 * Builds the per-doorMask connectivity and time-to-restore tables for the live
 * wall layer. Pure; reused by Bombs after a detonation (pass the new `walls`).
 * `doorMask` is the currently open set stored in the result.
 */
export function rebuildDerived(
  walls: WallLayer,
  doors: readonly DoorSpec[],
  nav: DoorNavLayout,
  objectives: readonly Cell[],
  doorMask = 0,
): DerivedTables {
  const masks = 1 << doors.length;
  const labels: Int32Array[] = new Array<Int32Array>(masks);
  const connectivity: number[] = new Array<number>(masks);
  for (let m = 0; m < masks; m++) {
    labels[m] = labelComponents(nav, walls.tiles, doors, m);
    connectivity[m] = objectiveComponents(labels[m]!, nav.width, objectives);
  }
  const restoreTicks: number[] = new Array<number>(masks);
  for (let m = masks - 1; m >= 0; m--) {
    if (connectivity[m]! <= 1) {
      restoreTicks[m] = 0;
      continue;
    }
    let best = Number.POSITIVE_INFINITY;
    for (let d = 0; d < doors.length; d++) {
      if (((m >>> d) & 1) === 1) continue;
      const t = Math.max(closedLength(doors[d]!), restoreTicks[m | (1 << d)]!);
      if (t < best) best = t;
    }
    restoreTicks[m] = best;
  }
  return { doorMask, connectivity, restoreTicks, fieldVersion: walls.version, labels };
}

/** Bitmask of Doors open in `states`. */
export function openMask(states: readonly Pick<DoorState, 'open'>[]): number {
  let m = 0;
  for (let i = 0; i < states.length; i++) if (states[i]!.open) m |= 1 << i;
  return m >>> 0;
}

function characterCell(c: Pick<Character, 'cell' | 'next'>, labels: Int32Array, width: number): number {
  const a = labels[c.cell.y * width + c.cell.x]!;
  if (a >= 0 || c.next === null) return a;
  return labels[c.next.y * width + c.next.x]!;
}

/** True when objectives, Player and Hunter all share one component under `labels`. */
function allTogether(
  labels: Int32Array,
  width: number,
  objectives: readonly Cell[],
  occ: DoorOccupants,
): boolean {
  let ref = -2;
  const check = (l: number): boolean => {
    if (l < 0) return false;
    if (ref === -2) ref = l;
    return l === ref;
  };
  for (const o of objectives) if (!check(labels[o.y * width + o.x]!)) return false;
  const p = characterCell(occ.player, labels, width);
  const h = characterCell(occ.hunter, labels, width);
  // A character standing on an impassable Cell (e.g. a closing Door) is covered by the occupancy gate.
  if (p >= 0 && !check(p)) return false;
  if (h >= 0 && !check(h)) return false;
  return true;
}

/**
 * Reachability CloseGate (Requirements 5.6, 5.7). Allows a close when the
 * resulting state keeps Player, Hunter and objectives in one component, or when
 * the scheduled reopenings restore that within `maxDisconnectTicks`. Otherwise
 * the close is postponed. O(1) when harmless; otherwise a bounded look-ahead of
 * at most `maxDisconnectTicks` schedule lookups per Door.
 */
export function createReachabilityGate(
  tables: DerivedTables,
  specs: readonly DoorSpec[],
  nav: Pick<DoorNavLayout, 'width'>,
  objectives: readonly Cell[],
  maxDisconnectTicks: number,
): CloseGate {
  const { width } = nav;
  return (ctx: DoorGateContext): boolean => {
    const cand = openMask(ctx.doors) & ~(1 << ctx.doorIndex);
    const lab = tables.labels[cand];
    if (lab === undefined) return true;
    if (allTogether(lab, width, objectives, ctx.occupants)) return true;
    for (let t = 1; t <= maxDisconnectTicks; t++) {
      let m = 0;
      for (let j = 0; j < specs.length; j++) {
        if (scheduleAt(specs[j]!, ctx.tick + t).open) m |= 1 << j;
      }
      if (allTogether(tables.labels[m]!, width, objectives, ctx.occupants)) return true;
    }
    return false;
  };
}
