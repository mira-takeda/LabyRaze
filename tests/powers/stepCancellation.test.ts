// Same-Tick power cancellation through `step` (task 17.19).
import { describe, expect, it } from 'vitest';
import { CELL_UNITS, DEFAULT_CONFIG } from '../../src/core/config';
import { isPassable } from '../../src/core/grid';
import { createRun, step } from '../../src/core/sim';
import type { Run } from '../../src/core/sim';
import { ItemKind } from '../../src/core/types';
import type { Cell, Character, Dir, GameState, Input } from '../../src/core/types';

const cfg = DEFAULT_CONFIG;
const IDLE: Input = { pressed: null, bomb: false, continue: false };
const DIRS: Array<[Dir, number, number]> = [
  ['up', 0, -1],
  ['right', 1, 0],
  ['down', 0, 1],
  ['left', -1, 0],
];
const BACK: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };

function arriving(s: GameState, c: Character, target: Cell, avoid: Cell[]): Character {
  for (const [dir, dx, dy] of DIRS) {
    const n = { x: target.x + dx, y: target.y + dy };
    if (avoid.some((a) => a.x === n.x && a.y === n.y)) continue;
    if (!isPassable(s.walls.tiles, s.maze.width, s.maze.height, s.maze.doors, s.derived.doorMask, n.x, n.y)) continue;
    if (s.items.kinds[n.y * s.maze.width + n.x] === ItemKind.Power) continue;
    return { ...c, cell: n, next: { ...target }, dir: BACK[dir], buffered: null, progress: CELL_UNITS - 1, power: 0, respawnIn: 0, invulnerable: 0 };
  }
  throw new Error('no approach cell');
}

/** Player and Hunter each one unit before a different Power_Pellet, at Tick `tick`. */
function doublePickup(seed: number, tick: number, ghostHunt: boolean): { run: Run; pp: Cell; hp: Cell } {
  const run = createRun(seed, cfg);
  const s0 = run.state;
  const [pp, hp] = [s0.maze.power[0]!, s0.maze.power[1]!];
  let s: GameState = { ...s0, tick };
  const player = arriving(s, s.player, pp, [hp]);
  const hunter = arriving(s, s.hunter, hp, [pp, player.cell]);
  s = { ...s, player: { ...player, invulnerable: 10_000 }, hunter };
  if (ghostHunt) {
    // Allies hunting but parked inside the Cage interior, far from both characters.
    const home = s.maze.cage.interior;
    const allies = s.ghostHunt.allies.map((a, i) => ({ ...a, cell: { ...home[i % home.length]! }, mode: 'hunting' as const, spawnIn: 10_000 }));
    s = { ...s, ghostHunt: { ticksLeft: 400, allies: allies as GameState['ghostHunt']['allies'] } };
  }
  return { run: { ...run, state: s }, pp, hp };
}

describe('same-Tick power cancellation through step', () => {
  for (const gh of [false, true]) {
    const label = gh ? ' (Ghost Hunt active)' : '';

    it(`even Tick: the Player wins the tie and Squareman gets PowerDenied${label}`, () => {
      const { run, pp, hp } = doublePickup(101, 200, gh);
      const r = step(run, IDLE);
      const s = r.run.state;
      expect(s.items.kinds[pp.y * s.maze.width + pp.x]).toBe(ItemKind.None);
      expect(s.items.kinds[hp.y * s.maze.width + hp.x]).toBe(ItemKind.None);
      expect(r.events).toContainEqual({ t: 'PowerDenied', who: 'hunter' });
      expect(s.player.power).toBe(cfg.powerTicks - 1);
      expect(s.hunter.power).toBe(0);
    });

    it(`odd Tick: Squareman wins the tie and the Player gets PowerDenied${label}`, () => {
      const { run } = doublePickup(102, 201, gh);
      const r = step(run, IDLE);
      const s = r.run.state;
      expect(r.events).toContainEqual({ t: 'PowerDenied', who: 'player' });
      expect(s.hunter.power).toBe(cfg.powerTicks - 1);
      expect(s.player.power).toBe(0);
    });
  }

  it('an active Ghost Hunt does not change either power field', () => {
    for (const tick of [300, 301]) {
      const a = step(doublePickup(103, tick, false).run, IDLE).run.state;
      const b = step(doublePickup(103, tick, true).run, IDLE).run.state;
      expect(b.player.power).toBe(a.player.power);
      expect(b.hunter.power).toBe(a.hunter.power);
    }
  });

  it('a pickup by one side cancels the other side’s power the same Tick (RoleReversed)', () => {
    const run = createRun(104, cfg);
    const s0 = run.state;
    const pp = s0.maze.power[0]!;
    const player = arriving(s0, s0.player, pp, []);
    const s: GameState = { ...s0, player: { ...player, invulnerable: 10_000 }, hunter: { ...s0.hunter, power: 150 } };
    const r = step({ ...run, state: s }, IDLE);
    expect(r.events).toContainEqual({ t: 'RoleReversed', to: 'player' });
    expect(r.run.state.hunter.power).toBe(0);
    expect(r.run.state.player.power).toBe(cfg.powerTicks - 1);
  });
});
