// Historical configuration compatibility only. Never edits or remeasures the baseline.
import { configHash } from './cli';
import type { GameConfig } from '../../src/core/config';

export function baselineCompatibility(cfg: GameConfig): { hash: string; problems: string[] } {
  const { hunterSpeedPermille, oneUpThresholds, oneUpRepeat, celebrationFirstLevel, celebrationEvery, ...legacy } = cfg;
  const problems: string[] = [];
  if (hunterSpeedPermille !== 1000) problems.push('hunterSpeedPermille differs from NORMAL (1000)');
  if (JSON.stringify(oneUpThresholds) !== '[10000,25000,50000]') problems.push('oneUpThresholds differs from the proven-neutral defaults');
  if (oneUpRepeat !== 50000) problems.push('oneUpRepeat differs from 50000');
  if (celebrationFirstLevel !== 100 || celebrationEvery !== 50) problems.push('celebration schedule differs from the proven-neutral defaults');
  return { hash: configHash(legacy as GameConfig), problems };
}
