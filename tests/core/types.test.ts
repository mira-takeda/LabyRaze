import { describe, expect, it } from 'vitest';
import { freezeEvent, freezeEvents } from '../../src/core/events';
import type { GameEvent } from '../../src/core/events';
import { Tile, COLLECTOR_MASK, ItemKind, COLLECT_HUNTER, COLLECT_PLAYER } from '../../src/core/types';

describe('core types', () => {
  it('tile codes are distinct', () => {
    const codes = Object.values(Tile);
    expect(codes).toHaveLength(6);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('freezeEvent returns a deeply frozen event', () => {
    const e = freezeEvent({
      t: 'BombDetonated',
      cell: { x: 1, y: 2 },
      radius: 2,
      destroyed: [{ x: 3, y: 3 }],
    } as GameEvent);
    expect(Object.isFrozen(e)).toBe(true);
    if (e.t === 'BombDetonated') {
      expect(Object.isFrozen(e.cell)).toBe(true);
      expect(Object.isFrozen(e.destroyed)).toBe(true);
      expect(Object.isFrozen(e.destroyed[0])).toBe(true);
    }
  });

  it('freezeEvents freezes the list and its members', () => {
    const list = freezeEvents([{ t: 'GameOver', score: 5 }]);
    expect(Object.isFrozen(list)).toBe(true);
    expect(Object.isFrozen(list[0])).toBe(true);
  });

  it('collector masks keep Bombs, Ghost_Hunt and Wisps player-only', () => {
    expect(COLLECTOR_MASK[ItemKind.Bomb]).toBe(COLLECT_PLAYER);
    expect(COLLECTOR_MASK[ItemKind.GhostHunt]).toBe(COLLECT_PLAYER);
    expect(COLLECTOR_MASK[ItemKind.Wisp]).toBe(COLLECT_PLAYER);
    expect(COLLECTOR_MASK[ItemKind.Ordinary]).toBe(COLLECT_HUNTER);
  });
});
