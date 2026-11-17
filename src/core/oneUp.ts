// Score-based extra lives (1UP), Requirement 33. Pure and deterministic.
// Milestones: the listed thresholds, then every `oneUpRepeat` after the last one
// (default 10000, 25000, 50000, 100000, 150000, ...). With no thresholds the repeat
// series starts at `oneUpRepeat`. `oneUpRepeat` 0 ends the series after the last threshold.

import type { GameConfig } from './config';

type OneUpCfg = Pick<GameConfig, 'oneUpThresholds' | 'oneUpRepeat'>;

/** Score of the milestone with the given 0-based index; Infinity when there is none. */
export function oneUpMilestone(index: number, cfg: OneUpCfg): number {
  const list = cfg.oneUpThresholds;
  if (index < list.length) return list[index]!;
  if (!(cfg.oneUpRepeat > 0)) return Infinity;
  const last = list.length > 0 ? list[list.length - 1]! : 0;
  return last + (index - list.length + 1) * cfg.oneUpRepeat;
}

export interface OneUpAward {
  /** New count of milestones paid out. */
  readonly awarded: number;
  /** Score values of the milestones crossed now, ascending (one life each). */
  readonly milestones: number[];
}

/** Awards every not-yet-awarded milestone that `score` has reached or passed. */
export function awardOneUps(score: number, awarded: number, cfg: OneUpCfg): OneUpAward {
  const milestones: number[] = [];
  let n = awarded;
  for (;;) {
    const m = oneUpMilestone(n, cfg);
    if (!(m <= score)) break;
    milestones.push(m);
    n += 1;
  }
  return { awarded: n, milestones };
}
