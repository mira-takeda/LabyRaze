// Balance worker (task 18.5): runs a contiguous chunk of units sequentially and posts the results.
// Shares no state with other workers and reads no clock.
import { parentPort, workerData } from 'node:worker_threads';
import type { GameConfig } from '../../src/core/config';
import { runUnit } from './simulator';
import type { RaceLimits, Unit, UnitResult } from './simulator';

interface WorkerInput {
  units: Unit[];
  cfg: GameConfig;
  limits: RaceLimits;
}

const input = workerData as WorkerInput;
const results: UnitResult[] = [];
for (let i = 0; i < input.units.length; i++) {
  results.push(runUnit(input.units[i]!, input.cfg, input.limits));
  if ((i + 1) % 25 === 0) parentPort?.postMessage({ type: 'progress', done: i + 1 });
}
parentPort?.postMessage({ type: 'done', results });
