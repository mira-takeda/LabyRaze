import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/core/config';
import {
  canCollect,
  evaluateOutcome,
  resolveItemsAndRescue,
  resolvePickups,
  resolveRescue,
} from '../../src/core/rules';
import type { RulesResult } from '../../src/core/rules';
import { ItemKind } from '../../src/core/types';
import type { Cell, GameState, Who } from '../../src/core/types';
import { cageState, makeCharacter } from '../helpers/fixtures';

const cfg = DEFAULT_CONFIG;

function at(s: GameState, who: Who, cell: Cell): GameState {
  return { ...s, [who]: makeCharacter(who, cell) };
}

function put(s: GameState, cell: Cell, kind: number): GameState {
  const kinds = s.items.kinds.slice();
  kinds[cell.y * s.maze.width + cell.x] = kind;
  return { ...s, items: { ...s.items, kinds } };
}

const kindAt = (s: GameState, c: Cell): number => s.items.kinds[c.y * s.maze.width + c.x] as number;
const entrance = (s: GameState): Cell => s.maze.cage.entrance;

function deliver(s: GameState, keys: number): RulesResult {
  return resolveRescue({ ...at(s, 'player', entrance(s)), carriedKeys: keys }, cfg);
}

describe('rescue delivery', () => {
  it('one key releases one captive, in index order', () => {
    const r = deliver(cageState(), 1);
    expect(r.state.captives).toEqual([true, false, false]);
    expect(r.state.carriedKeys).toBe(0);
    expect(r.state.phase).toBe('playing');
    expect(r.events).toEqual([{ t: 'CaptiveReleased', index: 0 }]);
  });

  it('two keys release two captives', () => {
    const r = deliver(cageState(), 2);
    expect(r.state.captives).toEqual([true, true, false]);
    expect(r.state.carriedKeys).toBe(0);
    expect(r.state.outcome).toBeNull();
  });

  it('three keys release all and the Player wins', () => {
    const r = deliver(cageState(), 3);
    expect(r.state.captives).toEqual([true, true, true]);
    expect(r.state.phase).toBe('levelEnd');
    expect(r.state.outcome).toBe('playerWin');
    expect(r.events.filter((e) => e.t === 'CaptiveReleased')).toHaveLength(3);
  });

  it('no keys or off the entrance changes nothing', () => {
    const s = cageState();
    const noKeys = resolveRescue(at(s, 'player', entrance(s)), cfg);
    expect(noKeys.state.captives).toEqual([false, false, false]);
    expect(noKeys.events).toEqual([]);
    const off = resolveRescue({ ...s, carriedKeys: 2 }, cfg);
    expect(off.state.captives).toEqual([false, false, false]);
    expect(off.state.carriedKeys).toBe(2);
    expect(off.events).toEqual([]);
  });

  it('captives stay rescued and extra keys are capped by unreleased count', () => {
    let s = deliver(cageState(), 1).state;
    s = resolveRescue({ ...s, carriedKeys: 1 }, cfg).state;
    expect(s.captives).toEqual([true, true, false]);
    // Leaving and re-entering with no keys never un-rescues.
    s = resolveRescue(at(s, 'player', entrance(s)), cfg).state;
    expect(s.captives).toEqual([true, true, false]);
    s = resolveRescue({ ...s, carriedKeys: 3 }, cfg).state;
    expect(s.captives).toEqual([true, true, true]);
    expect(s.carriedKeys).toBe(2); // min(3, 1) consumed
  });

  it('level completes only after three releases (1 + 1 + 1)', () => {
    let s = cageState();
    for (let i = 0; i < 3; i++) {
      expect(s.outcome).toBeNull();
      s = resolveItemsAndRescue({ ...at(s, 'player', entrance(s)), carriedKeys: 1 }, cfg).state;
      s = at(s, 'player', s.maze.playerStart);
      s = resolveItemsAndRescue(s, cfg).state;
    }
    expect(s.captives).toEqual([true, true, true]);
    expect(s.outcome).toBe('playerWin');
  });

  it('picking up a key adds to carriedKeys and removes it from the floor', () => {
    const s = cageState();
    const k = s.items.keys[0] as Cell;
    const r = resolvePickups(at(s, 'player', k), cfg);
    expect(r.state.carriedKeys).toBe(1);
    expect(r.state.items.keys).toHaveLength(2);
    expect(r.events).toContainEqual({ t: 'KeyCollected', cell: k });
  });
});

describe('collector masks', () => {
  const free = (s: GameState, i: number): Cell => s.maze.ordinary[i] as Cell;

  it('mask table matches the design', () => {
    expect(canCollect('player', ItemKind.Ordinary)).toBe(false);
    expect(canCollect('hunter', ItemKind.Ordinary)).toBe(true);
    for (const k of [ItemKind.Bomb, ItemKind.GhostHunt, ItemKind.Wisp]) {
      expect(canCollect('player', k)).toBe(true);
      expect(canCollect('hunter', k)).toBe(false);
    }
    for (const k of [ItemKind.Power, ItemKind.Speed]) {
      expect(canCollect('player', k)).toBe(true);
      expect(canCollect('hunter', k)).toBe(true);
    }
  });

  it('the Player cannot collect Ordinary pellets', () => {
    const s = cageState();
    const c = free(s, 0);
    const r = resolvePickups(at(s, 'player', c), cfg);
    expect(kindAt(r.state, c)).toBe(ItemKind.Ordinary);
    expect(r.state.items.ordinaryRemaining).toBe(s.items.ordinaryRemaining);
    expect(r.events).toEqual([]);
  });

  it('the Hunter collects Ordinary pellets and decrements the count', () => {
    const s = cageState();
    const c = free(s, 0);
    const r = resolvePickups(at(s, 'hunter', c), cfg);
    expect(kindAt(r.state, c)).toBe(ItemKind.None);
    expect(r.state.items.ordinaryRemaining).toBe(s.items.ordinaryRemaining - 1);
  });

  it('the Hunter cannot collect keys, bombs, wisps or Ghost Hunt', () => {
    const s0 = cageState();
    const called: string[] = [];
    const spy = (name: string) => (st: GameState): RulesResult => {
      called.push(name);
      return { state: st, events: [] };
    };
    const handlers = { bomb: spy('bomb'), ghostHunt: spy('gh'), wisp: spy('wisp') };
    const k = s0.items.keys[0] as Cell;
    const rk = resolvePickups(at(s0, 'hunter', k), cfg, handlers);
    expect(rk.state.carriedKeys).toBe(0);
    expect(rk.state.items.keys).toHaveLength(3);
    for (const kind of [ItemKind.Bomb, ItemKind.GhostHunt, ItemKind.Wisp]) {
      const c = free(s0, 1);
      const r = resolvePickups(put(at(s0, 'hunter', c), c, kind), cfg, handlers);
      expect(kindAt(r.state, c)).toBe(kind);
      expect(r.events).toEqual([]);
    }
    expect(called).toEqual([]);
  });

  it('the Player reaches the special handlers (extension point)', () => {
    const s0 = cageState();
    const c = free(s0, 1);
    const seen: string[] = [];
    const mk = (name: string) => (st: GameState, cell: Cell): RulesResult => {
      seen.push(name);
      return { state: st, events: [{ t: 'WallsDestroyed', cells: [cell] }] };
    };
    const handlers = { bomb: mk('bomb'), ghostHunt: mk('gh'), wisp: mk('wisp') };
    for (const kind of [ItemKind.Bomb, ItemKind.GhostHunt, ItemKind.Wisp]) {
      resolvePickups(put(at(s0, 'player', c), c, kind), cfg, handlers);
    }
    expect(seen).toEqual(['bomb', 'gh', 'wisp']);
  });

  it('shared Power and Speed pellets are collected by both', () => {
    const s0 = cageState();
    const c = free(s0, 2);
    for (const who of ['player', 'hunter'] as const) {
      const p = resolvePickups(put(at(s0, who, c), c, ItemKind.Power), cfg);
      expect(p.state[who].power).toBe(cfg.powerTicks);
      expect(kindAt(p.state, c)).toBe(ItemKind.None);
      const sp = resolvePickups(put(at(s0, who, c), c, ItemKind.Speed), cfg);
      expect(sp.state[who].speed).toBe(cfg.speedDurationTicks);
    }
  });
});

describe('ordinary accounting and outcomes', () => {
  it('wisps never change ordinaryRemaining', () => {
    const s0 = cageState();
    const c = s0.maze.ordinary[3] as Cell;
    const consume = (st: GameState, cell: Cell): RulesResult => {
      const kinds = st.items.kinds.slice();
      kinds[cell.y * st.maze.width + cell.x] = ItemKind.None;
      return { state: { ...st, items: { ...st.items, kinds, wispsRemaining: st.items.wispsRemaining - 1 } }, events: [] };
    };
    const s = put({ ...at(s0, 'player', c), items: { ...s0.items, wispsRemaining: 1 } }, c, ItemKind.Wisp);
    const r = resolveItemsAndRescue(s, cfg, { wisp: consume });
    expect(r.state.items.ordinaryRemaining).toBe(s0.items.ordinaryRemaining);
    expect(r.state.outcome).toBeNull();
  });

  it('the Hunter wins when the last Ordinary pellet is eaten', () => {
    const s0 = cageState();
    const c = s0.maze.ordinary[0] as Cell;
    const s = put({ ...at(s0, 'hunter', c), items: { ...s0.items, ordinaryRemaining: 1 } }, c, ItemKind.Ordinary);
    const r = resolveItemsAndRescue(s, cfg);
    expect(r.state.items.ordinaryRemaining).toBe(0);
    expect(r.state.phase).toBe('levelEnd');
    expect(r.state.outcome).toBe('hunterWin');
  });

  it('no win while pellets remain', () => {
    expect(evaluateOutcome(cageState()).state.outcome).toBeNull();
  });

  it('same-Tick tie: the Player wins', () => {
    const s0 = cageState();
    const c = s0.maze.ordinary[0] as Cell;
    let s = put(at(s0, 'hunter', c), c, ItemKind.Ordinary);
    s = {
      ...s,
      player: makeCharacter('player', entrance(s)),
      carriedKeys: 3,
      items: { ...s.items, ordinaryRemaining: 1 },
    };
    const r = resolveItemsAndRescue(s, cfg);
    expect(r.state.items.ordinaryRemaining).toBe(0);
    expect(r.state.captives).toEqual([true, true, true]);
    expect(r.state.outcome).toBe('playerWin');
    expect(r.events.filter((e) => e.t === 'LevelEnded')).toEqual([{ t: 'LevelEnded', outcome: 'playerWin', level: 1 }]);
  });
});
