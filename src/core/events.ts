import type { Cell, Who } from './types';

export type GameEvent =
  | { t: 'PelletCollected'; kind: 'ordinary' | 'power' | 'speed'; by: Who; cell: Cell }
  | { t: 'WispCollected'; cell: Cell; combo: number; points: number; bonus: number }
  | { t: 'ComboReset'; reason: 'expired' | 'playerEaten' }
  | { t: 'BombCollected'; cell: Cell; inventory: number }
  | { t: 'BombActivated'; cell: Cell }
  | { t: 'BombDetonated'; cell: Cell; radius: number; destroyed: Cell[] }
  | { t: 'WallsDestroyed'; cells: Cell[] }
  | { t: 'GhostHuntStarted'; refresh: boolean; ticks: number }
  | { t: 'GhostHuntEnded'; reason: 'expired' | 'levelEnd' }
  | { t: 'KeyCollected'; cell: Cell }
  | { t: 'CaptiveReleased'; index: 0 | 1 | 2 }
  | { t: 'RoleReversed'; to: Who }
  | { t: 'PowerStarted' | 'PowerEnded' | 'SpeedStarted' | 'SpeedEnded'; who: Who }
  | { t: 'PowerDenied'; who: Who }
  | { t: 'DoorWarning' | 'DoorChanged'; doorIndex: number; open: boolean }
  | { t: 'PlayerEaten'; cell: Cell; keysDropped: number }
  | { t: 'HunterEaten'; cell: Cell; by: 'player' | 'ally'; allyId?: 0 | 1 | 2 }
  | { t: 'LevelStarted'; level: number; speedFactor: number }
  | { t: 'LevelEnded'; outcome: 'playerWin' | 'hunterWin'; level: number }
  | { t: 'LevelMilestone'; level: number }
  | { t: 'ExtraLife'; lives: number; milestone: number }
  | { t: 'GameOver'; score: number };

/** Subset emitted by Ghost Hunt logic. */
export type GhostHuntEvent = Extract<GameEvent, { t: 'GhostHuntStarted' | 'GhostHuntEnded' | 'HunterEaten' }>;

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value as object)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

/** Freezes an event (and nested cells/arrays) so subscribers cannot mutate it. */
export function freezeEvent<E extends GameEvent>(event: E): Readonly<E> {
  return deepFreeze(event);
}

/** Freezes every event in a list, and the list itself. */
export function freezeEvents(events: GameEvent[]): ReadonlyArray<GameEvent> {
  for (const e of events) freezeEvent(e);
  return Object.freeze(events);
}
