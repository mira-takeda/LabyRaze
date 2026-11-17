// Level milestone celebrations (Requirement 34). Pure and deterministic.
// Celebration levels: celebrationFirstLevel, then every celebrationEvery levels (100, 150, 200, ...).

import type { GameConfig } from './config';

type MilestoneCfg = Pick<GameConfig, 'celebrationFirstLevel' | 'celebrationEvery'>;

export function isCelebrationLevel(level: number, cfg: MilestoneCfg): boolean {
  if (!Number.isInteger(level) || level < cfg.celebrationFirstLevel) return false;
  return (level - cfg.celebrationFirstLevel) % cfg.celebrationEvery === 0;
}
