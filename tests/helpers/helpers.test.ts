import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { validateConfig } from '../../src/core/config';
import { Door, WallHard } from '../../src/core/types';
import {
  arbBombScenario,
  arbComboSequence,
  arbConfig,
  arbEvent,
  arbGhostHuntScenario,
  arbInput,
  arbLoadOutcome,
  arbScoreList,
  arbStorageBlob,
  arbAudioBlob,
} from './arbitraries';
import { cageMaze, cageState, corridorMaze, corridorState } from './fixtures';

describe('fixtures', () => {
  it('builds a corridor maze and state', () => {
    const m = corridorMaze();
    expect(m.width * m.height).toBe(m.tiles.length);
    expect(corridorState().player.cell).toEqual({ x: 0, y: 1 });
  });

  it('builds a cage maze with hard boundary, destructible walls and a door', () => {
    const m = cageMaze();
    expect(m.tiles[0]).toBe(WallHard);
    expect(m.cage.interior).toHaveLength(3);
    expect(m.doors).toHaveLength(1);
    expect(m.tiles[m.doors[0]!.cell.y * m.width + m.doors[0]!.cell.x]).toBe(Door);
    expect(m.keys).toHaveLength(3);
    const s = cageState();
    expect(s.items.ordinaryRemaining).toBe(m.ordinary.length);
    expect(s.doors).toHaveLength(1);
  });
});

describe('arbitraries', () => {
  it('arbConfig always validates', () => {
    fc.assert(
      fc.property(arbConfig, (cfg) => validateConfig(cfg).length === 0),
      { numRuns: 50 },
    );
  });

  it('arbInput produces bomb sometimes but not mostly', () => {
    const inputs = fc.sample(arbInput, { numRuns: 2000, seed: 7 });
    const bombs = inputs.filter((i) => i.bomb).length;
    expect(bombs).toBeGreaterThan(0);
    expect(bombs).toBeLessThan(inputs.length / 4);
  });

  it('other arbitraries generate values', () => {
    for (const a of [arbBombScenario, arbGhostHuntScenario, arbComboSequence, arbEvent, arbAudioBlob, arbLoadOutcome, arbScoreList, arbStorageBlob]) {
      expect(fc.sample(a as fc.Arbitrary<unknown>, { numRuns: 20, seed: 1 })).toHaveLength(20);
    }
  });
});
