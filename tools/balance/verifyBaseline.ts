// Read-only verification that tools/balance/baseline.json corresponds to the current gameplay code
// and configuration (task 19.1). Prints a JSON verdict; never writes the baseline.
//   tsx tools/balance/verifyBaseline.ts
import { DEFAULT_CONFIG } from '../../src/core/config';
import { generateMaze } from '../../src/core/maze/generate';
import { validateMaze } from '../../src/core/maze/validate';
import { readBaseline } from './cli';
import { ALL_ON, FEATURE_KEYS } from './simulator';
import { baselineCompatibility } from './compatibility';
const b = readBaseline();
if (!b) {
  console.log(JSON.stringify({ ok: false, reason: 'no baseline' }));
  process.exit(1);
}
// Same pinned, evidence-backed convention as the consistency test. This establishes config
// compatibility and historical completeness, not a new gameplay measurement.
const { hash: legacyHash, problems } = baselineCompatibility(DEFAULT_CONFIG);
if (legacyHash !== b.meta.configHash) problems.push(`gameplay config differs: legacy hash ${legacyHash} != baseline ${b.meta.configHash}`);
const band = DEFAULT_CONFIG.prefilterBand;
if (band.min > 0 || band.max < 1e5) problems.push(`prefilterBand ${JSON.stringify(band)} is active: generation may differ from the baseline`);
// Completeness: every level x policy cell on the all-features set, every toggle with threeKey.
for (const level of b.meta.levels) {
  for (const policy of b.meta.policies) {
    const cs = b.report.stats[ALL_ON]?.[String(level)]?.[policy];
    const n = cs ? cs.ratioSamples.length + cs.timeouts : 0;
    if (!cs || cs.ratio === null) problems.push(`missing ${policy}@L${level}`);
    else if (cs.ratio.count !== cs.ratioSamples.length) problems.push(`count mismatch ${policy}@L${level}`);
    void n;
  }
  for (const f of FEATURE_KEYS.filter((k) => k !== ALL_ON)) {
    if (!b.report.stats[f]?.[String(level)]?.threeKey) problems.push(`missing toggle ${f}@L${level}`);
  }
}
const counts = b.meta.levels.map((l) => b.report.stats[ALL_ON]![String(l)]!.threeKey!.ratio!.count);
// The permissive pre-filter never rejects a generated Maze (sample of the baseline Seeds).
let rejected = 0;
for (let i = 0; i < 40; i++) {
  const m = generateMaze(b.meta.baseSeed + i, b.meta.levels[i % b.meta.levels.length]!, DEFAULT_CONFIG);
  if (validateMaze(m, DEFAULT_CONFIG).results.find((r) => r.id === '8')?.ok === false) rejected++;
}
if (rejected > 0) problems.push(`check 8 rejects ${rejected} sampled Mazes`);
console.log(JSON.stringify({ ok: problems.length === 0, legacyHash, baselineHash: b.meta.configHash, n: b.meta.n, threeKeyCounts: counts, generationUnits: b.report.generation.units, fallbacks: b.report.generation.fallbackCount, problems }, null, 1));
process.exit(problems.length === 0 ? 0 : 1);
