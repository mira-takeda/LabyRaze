// Balance_Simulator library (tasks 18.3, 18.4). Runs the real createRun / step with policies.
// Pure and deterministic: no clock, no randomness, no I/O (the CLI does I/O and timing).

import { DEFAULT_CONFIG } from '../../src/core/config';
import type { GameConfig } from '../../src/core/config';
import type { Run } from '../../src/core/sim';
import { ItemKind } from '../../src/core/types';
import { makePolicy } from './policies';
import type { PolicyName } from './policies';
import { HUNTER_DISABLED, playLevel, runAtLevel } from './runner';
import { checkBand, checkTolerance, summarize, winRate } from './stats';
import type { BandViolation, DistributionSummary } from './stats';

// ---------------------------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------------------------

export interface FeatureSet {
  bombs: boolean;
  ghostHunt: boolean;
  wisps: boolean;
}

/** Feature-set key, e.g. "B1G1W1" (all on) or "B0G1W1" (Bombs off). */
export function featureKey(f: FeatureSet): string {
  return `B${f.bombs ? 1 : 0}G${f.ghostHunt ? 1 : 0}W${f.wisps ? 1 : 0}`;
}

export function parseFeatureKey(k: string): FeatureSet {
  const m = /^B([01])G([01])W([01])$/.exec(k);
  if (!m) throw new RangeError(`bad feature key ${k}`);
  return { bombs: m[1] === '1', ghostHunt: m[2] === '1', wisps: m[3] === '1' };
}

export const ALL_ON = 'B1G1W1';
export const FEATURE_KEYS: readonly string[] = ['B0G0W0', 'B0G0W1', 'B0G1W0', 'B0G1W1', 'B1G0W0', 'B1G0W1', 'B1G1W0', 'B1G1W1'];

/**
 * The toggles only change item counts (design, Measure mode). Bombs and Ghost_Hunt use their
 * per-level counts. Wisps cannot be switched off through `wispDensity` (the partition keeps at
 * least one Wisp per block by design), so "Wisps off" is applied by `stripWisps` to the very same
 * generated Maze: its Wisp Cells become empty and the Ordinary_Pellets are identical, which makes
 * the with/without comparison an exact A/B on the same layout.
 */
export function configFor(base: GameConfig, features: string): GameConfig {
  const f = parseFeatureKey(features);
  return {
    ...base,
    bombsPerLevel: f.bombs ? base.bombsPerLevel : 0,
    ghostHuntPerLevel: f.ghostHunt ? base.ghostHuntPerLevel : 0,
  };
}

/** Removes every Spirit_Wisp from a level state (balance "Wisps off" toggle). */
export function stripWisps(run: Run): Run {
  const s = run.state;
  const kinds = s.items.kinds.slice();
  for (let i = 0; i < kinds.length; i++) if (kinds[i] === ItemKind.Wisp) kinds[i] = ItemKind.None;
  const maze = { ...s.maze, wisps: [] };
  return { ...run, state: { ...s, maze, items: { ...s.items, kinds, wispsRemaining: 0 } } };
}

/** A unit is either the Hunter-only pellet-clear race or one policy (decoupled + contested). */
export type UnitKind = 'hunter' | PolicyName;

export interface Unit {
  level: number;
  seed: number;
  features: string;
  kind: UnitKind;
}

const KIND_ORDER: readonly UnitKind[] = [
  'hunter',
  'oneKey',
  'twoKey',
  'threeKey',
  'bombAggressive',
  'bombNone',
  'ghostHuntOpportunistic',
  'ghostHuntNone',
  'wispSweep',
  'humanSkilled',
  'humanCasual',
  'humanNovice',
];

/** Canonical order: level, seed, features, kind. Results are always merged in this order. */
export function compareUnits(a: Unit, b: Unit): number {
  return (
    a.level - b.level ||
    a.seed - b.seed ||
    (a.features < b.features ? -1 : a.features > b.features ? 1 : 0) ||
    KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)
  );
}

export function unitKey(u: Unit): string {
  return `${u.level}|${u.seed}|${u.features}|${u.kind}`;
}

export interface MeasurePlan {
  baseSeed: number;
  n: number;
  levels: readonly number[];
  /** Policies run on the all-on feature set. */
  policies: readonly PolicyName[];
  /** Extra feature sets measured with `togglePolicy` only. */
  toggles: readonly string[];
  togglePolicy: PolicyName;
}

export const MEASURE_LEVELS: readonly number[] = [1, 5, 10, 20, 40];

/** Expands a plan into the canonical, sorted unit list. */
export function planUnits(plan: MeasurePlan): Unit[] {
  const units: Unit[] = [];
  for (const level of plan.levels) {
    for (let i = 0; i < plan.n; i++) {
      const seed = plan.baseSeed + i;
      units.push({ level, seed, features: ALL_ON, kind: 'hunter' });
      for (const p of plan.policies) units.push({ level, seed, features: ALL_ON, kind: p });
      for (const f of plan.toggles) {
        if (f === ALL_ON) continue;
        units.push({ level, seed, features: f, kind: 'hunter' });
        units.push({ level, seed, features: f, kind: plan.togglePolicy });
      }
    }
  }
  return units.sort(compareUnits);
}

// ---------------------------------------------------------------------------------------------
// Running one unit
// ---------------------------------------------------------------------------------------------

export interface RaceLimits {
  /** Tick cap for a decoupled race; a race hitting it is recorded as timed out. */
  decoupledTicks: number;
  /** Tick cap for the contested race. */
  contestedTicks: number;
}

export const DEFAULT_LIMITS: RaceLimits = { decoupledTicks: 30_000, contestedTicks: 30_000 };

export interface HunterResult {
  pelletClearTicks: number | null; // null = timed out
  attempts: number;
  repairs: number;
  fallback: boolean;
  wispsInMaze: number;
}

export interface PolicyResult {
  rescueTicks: number | null; // decoupled race, null = timed out
  contested: {
    outcome: 'playerWin' | 'hunterWin' | 'timeout' | 'gameOver';
    ticks: number;
    livesLost: number;
    ghostHuntPickups: number;
    allyCatches: number;
    bombsCollected: number;
    bombsDetonated: number;
    wallsDestroyed: number;
    wispsCollected: number;
    maxCombo: number;
    wispPoints: number;
    score: number;
  };
  decoupled: { bombsDetonated: number; wallsDestroyed: number; wispsCollected: number };
}

export interface UnitResult {
  unit: Unit;
  hunter?: HunterResult;
  policy?: PolicyResult;
}

/** A run at `level` that never runs out of lives (lives are measured, not enforced). */
function levelRun(unit: Unit, cfg: GameConfig): Run {
  let r = runAtLevel(unit.seed, unit.level, configFor(cfg, unit.features));
  if (!parseFeatureKey(unit.features).wisps) r = stripWisps(r);
  return { ...r, state: { ...r.state, lives: 1_000_000 }, progression: { ...r.progression, lives: 1_000_000 } };
}

function runHunter(unit: Unit, cfg: GameConfig, limits: RaceLimits): HunterResult {
  const base = levelRun(unit, cfg);
  // Player parked at its start and invulnerable: Squareman clears pellets on its own.
  const run: Run = { ...base, state: { ...base.state, player: { ...base.state.player, invulnerable: HUNTER_DISABLED } } };
  const idle = (): { pressed: null; bomb: false; continue: false } => ({ pressed: null, bomb: false, continue: false });
  const { result } = playLevel(run, idle, { maxTicks: limits.decoupledTicks, keepEvents: false });
  const g = base.state.maze.generation;
  return {
    pelletClearTicks: result.outcome === 'hunterWin' ? result.ticks : null,
    attempts: g.attempts,
    repairs: g.repairs,
    fallback: g.fallback === true,
    wispsInMaze: base.state.maze.wisps.length,
  };
}

function runPolicy(unit: Unit, cfg: GameConfig, limits: RaceLimits): PolicyResult {
  const name = unit.kind as PolicyName;
  const ucfg = configFor(cfg, unit.features);

  // Decoupled: Squareman parked (inactive), the policy plays alone.
  const dec = { bombsDetonated: 0, wallsDestroyed: 0, wispsCollected: 0 };
  const d = playLevel(levelRun(unit, cfg), makePolicy(name, { bombRadius: ucfg.bombRadius, seed: unit.seed }), {
    mode: 'playerOnly',
    maxTicks: limits.decoupledTicks,
    keepEvents: false,
    onTick: (_s, events) => {
      for (const e of events) {
        if (e.t === 'BombDetonated') dec.bombsDetonated++;
        else if (e.t === 'WallsDestroyed') dec.wallsDestroyed += e.cells.length;
        else if (e.t === 'WispCollected') dec.wispsCollected++;
      }
    },
  }).result;

  // Contested: both act with real collisions, power denial and Ghost Hunt catches.
  const c = {
    ghostHuntPickups: 0,
    allyCatches: 0,
    bombsCollected: 0,
    bombsDetonated: 0,
    wallsDestroyed: 0,
    wispsCollected: 0,
    maxCombo: 1,
    wispPoints: 0,
  };
  const cr = playLevel(levelRun(unit, cfg), makePolicy(name, { bombRadius: ucfg.bombRadius, seed: unit.seed }), {
    maxTicks: limits.contestedTicks,
    keepEvents: false,
    onTick: (_s, events) => {
      for (const e of events) {
        switch (e.t) {
          case 'GhostHuntStarted':
            c.ghostHuntPickups++;
            break;
          case 'HunterEaten':
            if (e.by === 'ally') c.allyCatches++;
            break;
          case 'BombCollected':
            c.bombsCollected++;
            break;
          case 'BombDetonated':
            c.bombsDetonated++;
            break;
          case 'WallsDestroyed':
            c.wallsDestroyed += e.cells.length;
            break;
          case 'WispCollected':
            c.wispsCollected++;
            c.wispPoints += e.points;
            if (e.combo > c.maxCombo) c.maxCombo = e.combo;
            break;
          default:
            break;
        }
      }
    },
  }).result;

  return {
    rescueTicks: d.outcome === 'playerWin' ? d.ticks : null,
    decoupled: dec,
    contested: { outcome: cr.outcome, ticks: cr.ticks, livesLost: cr.livesLost, score: cr.final.score, ...c },
  };
}

export function runUnit(unit: Unit, cfg: GameConfig = DEFAULT_CONFIG, limits: RaceLimits = DEFAULT_LIMITS): UnitResult {
  if (unit.kind === 'hunter') return { unit, hunter: runHunter(unit, cfg, limits) };
  return { unit, policy: runPolicy(unit, cfg, limits) };
}

/** Sequential execution in canonical order (the 1-worker reference). */
export function runUnits(units: readonly Unit[], cfg: GameConfig = DEFAULT_CONFIG, limits: RaceLimits = DEFAULT_LIMITS): UnitResult[] {
  return [...units].sort(compareUnits).map((u) => runUnit(u, cfg, limits));
}

// ---------------------------------------------------------------------------------------------
// Aggregation (measure). No band is enforced here.
// ---------------------------------------------------------------------------------------------

export interface RatioSample {
  seed: number;
  value: number;
}

export interface CellStats {
  /** Per (policy) ratio pelletClearTicks / rescueTicks, null when no finished pairs exist. */
  ratio: DistributionSummary | null;
  ratioSamples: RatioSample[];
  rescueTicks: DistributionSummary | null;
  timeouts: number;
  winRatePlayer: number;
  winRateHunter: number;
  winRatePlayerCI: [number, number];
  livesLostMean: number;
  ghostHunt: { pickups: number; catchesPerPickup: DistributionSummary | null; zeroCatchFraction: number };
  bombs: { collected: number; detonated: number; wallsPerBomb: number };
  wisps: { collectedMean: number; maxComboMedian: number; wispScoreShare: number };
}

export interface MeasureReport {
  schema: 1;
  levels: number[];
  n: number;
  /** stats[features][level][policy] */
  stats: Record<string, Record<string, Record<string, CellStats>>>;
  pelletClear: Record<string, Record<string, DistributionSummary | null>>;
  pelletClearTimeouts: Record<string, Record<string, number>>;
  generation: { attemptsMean: number; repairsMean: number; fallbackCount: number; units: number };
}

function mean0(xs: number[]): number {
  return xs.length === 0 ? 0 : Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 1e6) / 1e6;
}

/** Aggregates unit results (any order; they are re-sorted canonically first). */
export function aggregate(results: readonly UnitResult[]): MeasureReport {
  const sorted = [...results].sort((a, b) => compareUnits(a.unit, b.unit));
  const clear = new Map<string, number | null>(); // features|level|seed -> pelletClearTicks
  const levels = new Set<number>();
  const seeds = new Set<number>();
  let attempts = 0;
  let repairs = 0;
  let fallback = 0;
  let genUnits = 0;
  for (const r of sorted) {
    levels.add(r.unit.level);
    seeds.add(r.unit.seed);
    if (r.hunter) {
      clear.set(`${r.unit.features}|${r.unit.level}|${r.unit.seed}`, r.hunter.pelletClearTicks);
      attempts += r.hunter.attempts;
      repairs += r.hunter.repairs;
      fallback += r.hunter.fallback ? 1 : 0;
      genUnits++;
    }
  }

  type Acc = { results: UnitResult[] };
  const groups = new Map<string, Acc>();
  for (const r of sorted) {
    if (!r.policy) continue;
    const k = `${r.unit.features}|${r.unit.level}|${r.unit.kind}`;
    const g = groups.get(k) ?? { results: [] };
    g.results.push(r);
    groups.set(k, g);
  }

  const stats: MeasureReport['stats'] = {};
  for (const [k, g] of groups) {
    const [features, level, policy] = k.split('|') as [string, string, string];
    const ratioSamples: RatioSample[] = [];
    const rescue: number[] = [];
    let timeouts = 0;
    let pw = 0;
    let hw = 0;
    const lives: number[] = [];
    const catches: number[] = [];
    let ghPickups = 0;
    let bc = 0;
    let bd = 0;
    let walls = 0;
    const wisps: number[] = [];
    const combos: number[] = [];
    let wispPts = 0;
    let scoreTotal = 0;
    for (const r of g.results) {
      const p = r.policy!;
      const pc = clear.get(`${features}|${level}|${r.unit.seed}`) ?? null;
      if (p.rescueTicks === null) timeouts++;
      else rescue.push(p.rescueTicks);
      if (p.rescueTicks !== null && pc !== null) ratioSamples.push({ seed: r.unit.seed, value: Math.round((pc / p.rescueTicks) * 1e6) / 1e6 });
      if (p.contested.outcome === 'playerWin') pw++;
      else if (p.contested.outcome === 'hunterWin') hw++;
      lives.push(p.contested.livesLost);
      ghPickups += p.contested.ghostHuntPickups;
      if (p.contested.ghostHuntPickups > 0) catches.push(p.contested.allyCatches / p.contested.ghostHuntPickups);
      bc += p.contested.bombsCollected;
      bd += p.contested.bombsDetonated;
      walls += p.contested.wallsDestroyed;
      wisps.push(p.contested.wispsCollected);
      combos.push(p.contested.maxCombo);
      wispPts += p.contested.wispPoints;
      scoreTotal += p.contested.score;
    }
    const total = g.results.length;
    const wr = winRate(pw, total);
    const cs: CellStats = {
      ratio: ratioSamples.length > 0 ? summarize(ratioSamples.map((s) => s.value)) : null,
      ratioSamples,
      rescueTicks: rescue.length > 0 ? summarize(rescue) : null,
      timeouts,
      winRatePlayer: wr.rate,
      winRateHunter: Math.round((hw / total) * 1e6) / 1e6,
      winRatePlayerCI: [wr.lo, wr.hi],
      livesLostMean: mean0(lives),
      ghostHunt: {
        pickups: ghPickups,
        catchesPerPickup: catches.length > 0 ? summarize(catches) : null,
        zeroCatchFraction: catches.length > 0 ? mean0(catches.map((c) => (c === 0 ? 1 : 0))) : 0,
      },
      bombs: { collected: bc, detonated: bd, wallsPerBomb: bd > 0 ? Math.round((walls / bd) * 1e6) / 1e6 : 0 },
      wisps: {
        collectedMean: mean0(wisps),
        maxComboMedian: combos.length > 0 ? summarize(combos).median : 1,
        wispScoreShare: scoreTotal > 0 ? Math.round((wispPts / scoreTotal) * 1e6) / 1e6 : 0,
      },
    };
    ((stats[features] ??= {})[level] ??= {})[policy] = cs;
  }

  const pelletClear: MeasureReport['pelletClear'] = {};
  const pelletClearTimeouts: MeasureReport['pelletClearTimeouts'] = {};
  const byFL = new Map<string, Array<number | null>>();
  for (const [k, v] of clear) {
    const [f, l] = k.split('|') as [string, string];
    const key = `${f}|${l}`;
    const arr = byFL.get(key) ?? [];
    arr.push(v);
    byFL.set(key, arr);
  }
  for (const [k, arr] of [...byFL].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const [f, l] = k.split('|') as [string, string];
    const done = arr.filter((x): x is number => x !== null);
    (pelletClear[f] ??= {})[l] = done.length > 0 ? summarize(done) : null;
    (pelletClearTimeouts[f] ??= {})[l] = arr.length - done.length;
  }

  return {
    schema: 1,
    levels: [...levels].sort((a, b) => a - b),
    n: seeds.size,
    stats,
    pelletClear,
    pelletClearTimeouts,
    generation: {
      attemptsMean: genUnits > 0 ? Math.round((attempts / genUnits) * 1e6) / 1e6 : 0,
      repairsMean: genUnits > 0 ? Math.round((repairs / genUnits) * 1e6) / 1e6 : 0,
      fallbackCount: fallback,
      units: genUnits,
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Check mode: committed bands plus tolerance
// ---------------------------------------------------------------------------------------------

export interface Bands {
  p5Min: number;
  medianMax: number;
  relTol: number;
  bandMargin: number;
}

export interface CheckFailure extends BandViolation {
  policy: string;
  level: string;
  features: string;
  expected: string;
}

/**
 * Compares a fresh report against the committed bands and the baseline centre statistics.
 * p5 must be >= p5Min, median <= medianMax (banded) for the band policies (`bandPolicies`, default
 * every policy; the CLI passes the policy the bands were derived from), and each policy/level ratio
 * median must lie within tolerance of the baseline median. Never rewrites anything.
 */
export function checkReport(
  fresh: MeasureReport,
  baseline: MeasureReport,
  bands: Bands,
  opts: { policies?: readonly string[]; absTol?: number; bandPolicies?: readonly string[] } = {},
): CheckFailure[] {
  const out: CheckFailure[] = [];
  const absTol = opts.absTol ?? 0.05;
  for (const [features, byLevel] of Object.entries(fresh.stats)) {
    for (const [level, byPolicy] of Object.entries(byLevel)) {
      for (const [policy, cs] of Object.entries(byPolicy)) {
        if (opts.policies && !opts.policies.includes(policy)) continue;
        if (cs.ratio === null) continue;
        const ctx = { policy, level, features };
        const lowFirst = [...cs.ratioSamples];
        if (!opts.bandPolicies || opts.bandPolicies.includes(policy)) {
          const p5 = checkBand('ratio.p5', cs.ratio.p5, { min: bands.p5Min }, lowFirst);
          if (p5) out.push({ ...p5, ...ctx, expected: `>= ${bands.p5Min}` });
          const med = checkBand('ratio.median', cs.ratio.median, { max: bands.medianMax }, lowFirst);
          if (med) out.push({ ...med, ...ctx, expected: `<= ${bands.medianMax}` });
        }
        const base = baseline.stats[features]?.[level]?.[policy]?.ratio;
        if (base) {
          const tol = checkTolerance('ratio.median~baseline', cs.ratio.median, base.median, absTol, bands.relTol, lowFirst);
          if (tol) out.push({ ...tol, ...ctx, expected: `${base.median} +- max(${absTol}, ${bands.relTol} x)` });
        }
      }
    }
  }
  return out;
}

/** Bands from a measured report (design: p5Min = floor(p5 * (1 - m)), medianMax = ceil(median * (1 + m))). */
export function proposeBands(report: MeasureReport, policy: string, margin: number, relTol: number): Bands {
  let p5 = Infinity;
  let med = 0;
  for (const byLevel of Object.values(report.stats[ALL_ON] ?? {})) {
    const cs = byLevel[policy];
    if (!cs || !cs.ratio) continue;
    p5 = Math.min(p5, cs.ratio.p5);
    med = Math.max(med, cs.ratio.median);
  }
  if (!Number.isFinite(p5)) throw new RangeError(`no ratio data for ${policy}`);
  // Two-decimal floor/ceil keeps the bands readable while following the rounding direction.
  return {
    p5Min: Math.floor(p5 * (1 - margin) * 100) / 100,
    medianMax: Math.ceil(med * (1 + margin) * 100) / 100,
    relTol,
    bandMargin: margin,
  };
}
