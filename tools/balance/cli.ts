// Balance_Simulator CLI (task 18.6).
//
//   tsx tools/balance/cli.ts measure   [--n N] [--base-seed S] [--workers K] [--json]
//   tsx tools/balance/cli.ts calibrate <ghostHunt|bombRadius|bombs|wisps|combo> [--n N] [--workers K]
//   tsx tools/balance/cli.ts check     [--n N] [--workers K]
//   tsx tools/balance/cli.ts smoke     [--n N] [--workers K]
//   tsx tools/balance/cli.ts full      (measure with the full seed count, then check)
//   tsx tools/balance/cli.ts probe     [--n N]   (throughput measurement, writes nothing)
//
// Only `measure` (and `full`) rewrite tools/balance/baseline.json. `calibrate` writes
// tools/balance/calibration.json, which `measure` merges into the baseline. `check` and `smoke`
// never write. Exit code 1 on a failed check or an exceeded budget.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG } from '../../src/core/config';
import type { GameConfig } from '../../src/core/config';
import { HUMAN_POLICY_NAMES, HUMAN_PROFILES, POLICY_NAMES } from './policies';
import type { PolicyName } from './policies';
import { defaultWorkerCount, runPool } from './pool';
import {
  ALL_ON,
  FEATURE_KEYS,
  MEASURE_LEVELS,
  aggregate,
  checkReport,
  planUnits,
  proposeBands,
} from './simulator';
import type { Bands, CheckFailure, MeasurePlan, MeasureReport, Unit } from './simulator';
import { calibrate, CALIBRATIONS } from './calibrate';
import { pickN, seedCountTable } from './bootstrap';
import type { SeedCountRow } from './bootstrap';
import type { CalibrationName } from './calibrate';

export const TOOL_VERSION = '1.0.0';
const HERE = dirname(fileURLToPath(import.meta.url));
export const BASELINE_PATH = join(HERE, 'baseline.json');
export const CALIBRATION_PATH = join(HERE, 'calibration.json');

export const SMOKE_BASE_SEED = 900_001;
/** Policy the Balance_Bands are derived from and enforced on. */
export const BAND_POLICY = 'threeKey';
export const SMOKE_SEEDS = 40;
export const SMOKE_LEVELS = [1, 10] as const;
export const SMOKE_POLICIES: readonly PolicyName[] = ['oneKey', 'threeKey', 'bombAggressive', 'ghostHuntOpportunistic'];
export const MEASURE_BASE_SEED = 1;
export const CHECK_BASE_SEED = 500_001;

export interface Baseline {
  schema: 1;
  meta: {
    seedSetHash: string;
    configHash: string;
    gitDescribe: string;
    toolVersion: string;
    n: number;
    baseSeed: number;
    levels: number[];
    policies: string[];
    toggles: string[];
    /** Seeds `check` runs: smallest N whose bootstrap median half-width is within relTol. */
    checkSeeds?: number;
    /** Bootstrap precision table behind checkSeeds (worst relative half-widths). */
    precision?: SeedCountRow[];
  };
  bands: Bands;
  report: MeasureReport;
  calibration: Record<string, unknown>;
}

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * Config hash over every gameplay field. Audio and the balance-tool fields (bands, Seed count,
 * budgets, tolerance) are excluded: they cannot change the Simulation, and the bands are written
 * into the config only after the measurement that produced them.
 */
export function configHash(cfg: GameConfig): string {
  const { audio: _a, balanceBand: _b, balanceFullSeeds: _n, balanceFullBudgetMs: _f, balanceSmokeBudgetMs: _s, balanceRelTol: _r, ...rest } = cfg;
  void [_a, _b, _n, _f, _s, _r];
  return sha256(JSON.stringify(rest)).slice(0, 16);
}

export function seedSetHash(plan: MeasurePlan): string {
  return sha256(JSON.stringify({ b: plan.baseSeed, n: plan.n, l: plan.levels, p: plan.policies, t: plan.toggles })).slice(0, 16);
}

export function readBaseline(path = BASELINE_PATH): Baseline | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8')) as Baseline;
}

/** Equality of two baselines ignoring metadata that is allowed to differ (Property 28). */
export function stripMeta(b: Baseline): Omit<Baseline, 'meta'> & { meta: Omit<Baseline['meta'], 'gitDescribe' | 'toolVersion'> } {
  const { gitDescribe: _g, toolVersion: _t, ...meta } = b.meta;
  void _g;
  void _t;
  return { ...b, meta };
}

interface Args {
  cmd: string;
  sub?: string;
  n?: number;
  baseSeed?: number;
  workers?: number;
  /** One-off budget override in ms (recorded in the output); the config budget is the default. */
  budgetMs?: number;
  json: boolean;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { cmd: argv[0] ?? 'help', json: false };
  for (let i = 1; i < argv.length; i++) {
    const t = argv[i]!;
    const next = (): number => {
      const v = Number(argv[++i]);
      if (!Number.isFinite(v)) throw new Error(`${t} needs a number`);
      return v;
    };
    if (t === '--n') a.n = next();
    else if (t === '--base-seed') a.baseSeed = next();
    else if (t === '--workers') a.workers = next();
    else if (t === '--budget-ms') a.budgetMs = next();
    else if (t === '--json') a.json = true;
    else if (!t.startsWith('--') && a.sub === undefined) a.sub = t;
    else throw new Error(`unknown argument ${t}`);
  }
  return a;
}

function now(): number {
  return Number(process.hrtime.bigint() / 1_000_000n);
}

function log(msg: string): void {
  process.stdout.write(`${msg}\n`);
}

export function measurePlan(n: number, baseSeed: number): MeasurePlan {
  return {
    baseSeed,
    n,
    levels: MEASURE_LEVELS,
    policies: POLICY_NAMES,
    toggles: FEATURE_KEYS.filter((k) => k !== ALL_ON),
    togglePolicy: 'threeKey',
  };
}

async function runPlan(units: Unit[], cfg: GameConfig, workers: number, budgetMs: number, label: string): Promise<{ report: MeasureReport; ms: number }> {
  const t0 = now();
  let last = t0;
  const results = await runPool(units, cfg, {
    workers,
    onProgress: (done, total) => {
      const t = now();
      if (t - last > 15_000) {
        last = t;
        log(`  ${label}: ${done}/${total} units, ${Math.round((t - t0) / 1000)} s`);
      }
    },
  });
  const ms = now() - t0;
  if (ms > budgetMs) throw new BudgetError(`${label} took ${ms} ms, budget ${budgetMs} ms (${results.length} units completed)`);
  return { report: aggregate(results), ms };
}

class BudgetError extends Error {}

function printFailures(failures: CheckFailure[]): void {
  for (const f of failures) {
    log(
      `FAIL ${f.stat} policy=${f.policy} level=${f.level} features=${f.features} observed=${f.value} expected ${f.expected}` +
        (f.worstSeed !== undefined ? ` worstSeed=${f.worstSeed}` : ''),
    );
  }
}

function table(report: MeasureReport): void {
  const all = report.stats[ALL_ON] ?? {};
  log('level policy            ratio(p5/median/p95)    rescue median  playerWin hunterWin lives');
  for (const level of Object.keys(all).sort((a, b) => Number(a) - Number(b))) {
    for (const [policy, cs] of Object.entries(all[level]!)) {
      const r = cs.ratio ? `${cs.ratio.p5.toFixed(2)}/${cs.ratio.median.toFixed(2)}/${cs.ratio.p95.toFixed(2)}` : 'n/a';
      log(
        `${level.padStart(5)} ${policy.padEnd(22)} ${r.padEnd(22)} ${String(cs.rescueTicks?.median ?? 'n/a').padStart(8)}  ${cs.winRatePlayer.toFixed(3)}     ${cs.winRateHunter.toFixed(3)}    ${cs.livesLostMean.toFixed(2)}`,
      );
    }
  }
}

async function cmdMeasure(a: Args, cfg: GameConfig): Promise<number> {
  const n = a.n ?? cfg.balanceFullSeeds;
  const plan = measurePlan(n, a.baseSeed ?? MEASURE_BASE_SEED);
  const units = planUnits(plan);
  const workers = a.workers ?? defaultWorkerCount();
  const budget = a.budgetMs ?? cfg.balanceFullBudgetMs;
  log(`measure: ${units.length} units (${n} seeds x levels ${plan.levels.join(',')}), ${workers} workers, budget ${budget} ms`);
  const { report, ms } = await runPlan(units, cfg, workers, budget, 'measure');
  const calibration = existsSync(CALIBRATION_PATH) ? (JSON.parse(readFileSync(CALIBRATION_PATH, 'utf8')) as Record<string, unknown>) : {};
  const bands = proposeBands(report, BAND_POLICY, 0.1, cfg.balanceRelTol);
  // Precision of the measured statistics for smaller Seed sets (decides the check Seed count).
  const cells: Record<string, number[]> = {};
  for (const [level, byPolicy] of Object.entries(report.stats[ALL_ON] ?? {})) {
    for (const [policy, cs] of Object.entries(byPolicy)) cells[`${policy}@L${level}`] = cs.ratioSamples.map((s) => s.value);
  }
  const precision = seedCountTable(cells, [20, 40, 60, 80, 100, 150, 200].filter((x) => x <= n), 300);
  const checkSeeds = pickN(precision, cfg.balanceRelTol);
  const baseline: Baseline = {
    schema: 1,
    meta: {
      seedSetHash: seedSetHash(plan),
      configHash: configHash(cfg),
      gitDescribe: 'no-git',
      toolVersion: TOOL_VERSION,
      n,
      baseSeed: plan.baseSeed,
      levels: [...plan.levels],
      policies: [...plan.policies],
      toggles: [...plan.toggles],
      checkSeeds,
      precision,
    },
    bands,
    report,
    calibration,
  };
  writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 1)}\n`);
  table(report);
  log(`measure: wrote ${BASELINE_PATH} in ${ms} ms; proposed bands p5Min=${bands.p5Min} medianMax=${bands.medianMax}`);
  return 0;
}

async function cmdCheck(a: Args, cfg: GameConfig, mode: 'check' | 'smoke'): Promise<number> {
  const baseline = readBaseline();
  if (!baseline) {
    log(`${mode}: SKIPPED: no baseline (run "npm run balance:measure" first). This is not a pass.`);
    return 2;
  }
  const workers = a.workers ?? defaultWorkerCount();
  let n = a.n ?? (mode === 'smoke' ? SMOKE_SEEDS : (baseline.meta.checkSeeds ?? Math.max(20, Math.round(baseline.meta.n / 5))));
  let plan: MeasurePlan;
  let budget: number;
  if (mode === 'smoke') {
    // Self-test: time a tiny run and scale the Seed count down on slow machines.
    const probeUnits = planUnits({ baseSeed: SMOKE_BASE_SEED, n: 1, levels: [1], policies: ['threeKey'], toggles: [], togglePolicy: 'threeKey' });
    const t0 = now();
    await runPool(probeUnits, cfg, { workers: 1 });
    const perSeed = (now() - t0) * (SMOKE_POLICIES.length + 1) / 2 * SMOKE_LEVELS.length;
    const affordable = Math.floor((cfg.balanceSmokeBudgetMs * 0.7 * workers) / Math.max(1, perSeed));
    if (affordable < n) {
      log(`smoke: self-test ${Math.round(perSeed)} ms per seed; scaling Seeds ${n} -> ${Math.max(4, affordable)}`);
      n = Math.max(4, affordable);
    }
    plan = { baseSeed: SMOKE_BASE_SEED, n, levels: [...SMOKE_LEVELS], policies: SMOKE_POLICIES, toggles: [], togglePolicy: 'threeKey' };
    budget = cfg.balanceSmokeBudgetMs;
  } else {
    plan = { baseSeed: CHECK_BASE_SEED, n, levels: baseline.meta.levels, policies: baseline.meta.policies as PolicyName[], toggles: [], togglePolicy: 'threeKey' };
    budget = cfg.balanceFullBudgetMs;
  }
  if (configHash(cfg) !== baseline.meta.configHash) log(`${mode}: note: config differs from the baseline config (${baseline.meta.configHash})`);
  const units = planUnits(plan);
  log(`${mode}: ${units.length} units, ${workers} workers`);
  let report: MeasureReport;
  let ms: number;
  try {
    ({ report, ms } = await runPlan(units, cfg, workers, budget, mode));
  } catch (e) {
    if (e instanceof BudgetError) {
      log(`${mode}: FAIL budget: ${e.message}`);
      return 1;
    }
    throw e;
  }
  // The bands are derived from the threeKey ratio (proposeBands in measure), so they apply to
  // threeKey; every policy is still held to its own baseline median by the tolerance check.
  const failures = checkReport(report, baseline.report, baseline.bands, { policies: plan.policies, bandPolicies: [BAND_POLICY] });
  if (a.json) log(JSON.stringify({ failures, ms }, null, 1));
  if (failures.length > 0) {
    printFailures(failures);
    log(`${mode}: FAILED (${failures.length} statistic(s)) in ${ms} ms`);
    return 1;
  }
  log(`${mode}: PASSED in ${ms} ms (${units.length} units)`);
  return 0;
}

async function cmdProbe(a: Args, cfg: GameConfig): Promise<number> {
  const n = a.n ?? 2;
  const plan = measurePlan(n, MEASURE_BASE_SEED);
  const units = planUnits(plan);
  const t0 = now();
  const results = await runPool(units, cfg, { workers: 1 });
  const ms = now() - t0;
  const r = aggregate(results);
  log(`probe: ${units.length} units in ${ms} ms single-threaded (${Math.round(ms / n)} ms per seed)`);
  log(`probe: estimated measure time for ${cfg.balanceFullSeeds} seeds with ${defaultWorkerCount()} workers: ${Math.round((ms / n) * cfg.balanceFullSeeds / defaultWorkerCount() / 1000)} s`);
  table(r);
  return 0;
}

export const HUMAN_PATH = join(HERE, 'human.json');
/**
 * Imperfect-player evidence (not a baseline): the design reference policy threeKey plus the three
 * human-like skill levels, on the same Seeds and levels as the baseline. Writes human.json only.
 */
async function cmdHuman(a: Args, cfg: GameConfig): Promise<number> {
  const n = a.n ?? 100;
  const plan: MeasurePlan = { baseSeed: a.baseSeed ?? MEASURE_BASE_SEED, n, levels: MEASURE_LEVELS, policies: ['threeKey', ...HUMAN_POLICY_NAMES], toggles: [], togglePolicy: 'threeKey' };
  const units = planUnits(plan);
  const workers = a.workers ?? defaultWorkerCount();
  log(`measure-human: ${units.length} units (${n} seeds x levels ${plan.levels.join(',')}), ${workers} workers`);
  const { report, ms } = await runPlan(units, cfg, workers, a.budgetMs ?? cfg.balanceFullBudgetMs, 'measure-human');
  const out = {
    schema: 1,
    meta: { kind: 'human-evidence', configHash: configHash(cfg), seedSetHash: seedSetHash(plan), n, baseSeed: plan.baseSeed, levels: [...plan.levels], policies: [...plan.policies], profiles: HUMAN_PROFILES, toolVersion: TOOL_VERSION },
    report,
  };
  writeFileSync(HUMAN_PATH, `${JSON.stringify(out, null, 1)}\n`);
  table(report);
  log(`measure-human: wrote ${HUMAN_PATH} in ${ms} ms`);
  return 0;
}
async function main(argv: string[]): Promise<number> {
  const a = parseArgs(argv);
  const cfg = DEFAULT_CONFIG;
  switch (a.cmd) {
    case 'measure':
      return cmdMeasure(a, cfg);
    case 'check':
      return cmdCheck(a, cfg, 'check');
    case 'smoke':
      return cmdCheck(a, cfg, 'smoke');
    case 'full': {
      const m = await cmdMeasure(a, cfg);
      return m !== 0 ? m : cmdCheck({ ...a, n: undefined }, cfg, 'check');
    }
    case 'calibrate': {
      const name = a.sub as CalibrationName | undefined;
      if (!name || !CALIBRATIONS.includes(name)) {
        log(`calibrate: name one of ${CALIBRATIONS.join(', ')}`);
        return 1;
      }
      const prev = existsSync(CALIBRATION_PATH) ? (JSON.parse(readFileSync(CALIBRATION_PATH, 'utf8')) as Record<string, unknown>) : {};
      const t0 = now();
      const out = await calibrate(name, cfg, { n: a.n, workers: a.workers ?? defaultWorkerCount(), log });
      const keptOverride = (prev[name] as { override?: unknown } | undefined)?.override;
      prev[name] = keptOverride === undefined ? out : { ...out, override: keptOverride };
      writeFileSync(CALIBRATION_PATH, `${JSON.stringify(prev, null, 1)}\n`);
      log(`calibrate ${name}: wrote ${CALIBRATION_PATH} in ${now() - t0} ms`);
      return 0;
    }
    case 'measure-human':
      return cmdHuman(a, cfg);
    case 'probe':
      return cmdProbe(a, cfg);
    default:
      log('usage: cli.ts measure|calibrate <name>|check|smoke|full|probe [--n N] [--base-seed S] [--workers K] [--json]');
      return a.cmd === 'help' ? 0 : 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1].replace(/\//g, '\\') || process.argv[1]?.endsWith('cli.ts')) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e: unknown) => {
      process.stderr.write(`${e instanceof Error ? e.stack ?? e.message : String(e)}\n`);
      process.exit(1);
    },
  );
}

export { main };
