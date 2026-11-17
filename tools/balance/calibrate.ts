// Calibration sweeps (task 18.4, used by tasks 19.2 to 19.5). Pure apart from the worker pool.
// Every sweep returns the full table, the chosen value, the satisfied constraints and the
// runner-up, so the choice is reproducible and reviewable.

import type { GameConfig } from '../../src/core/config';
import type { PolicyName } from './policies';
import { runPool } from './pool';
import { ALL_ON, aggregate, planUnits } from './simulator';
import type { MeasureReport } from './simulator';

export type CalibrationName = 'ghostHunt' | 'bombRadius' | 'bombs' | 'wisps' | 'combo';
export const CALIBRATIONS: readonly CalibrationName[] = ['ghostHunt', 'bombRadius', 'bombs', 'wisps', 'combo'];

export const CALIBRATION_LEVELS = [1, 10] as const;
export const CALIBRATION_BASE_SEED = 200_001;
export const DEFAULT_CALIBRATION_SEEDS = 100;

/** Selection constants from the design (Calibrate mode). */
export const RULES = {
  ghostHuntMinCatches: 0.5,
  ghostHuntMaxP95: 3,
  hunterWinRateFloor: 0.15,
  bombMaxWalls: 10,
  bombRatioShift: 0.15,
  playerWinRateCeiling: 0.9,
  bombWinMargin: 0.05,
  bandMargin: 0.1,
  wispRescueSlowdownMax: 0.1,
  coverageOkMin: 0.999,
} as const;

export interface CalibrationOutput {
  name: CalibrationName;
  seeds: number;
  levels: number[];
  sweep: Array<Record<string, number | boolean | null>>;
  chosen: Record<string, number> | null;
  runnerUp: Record<string, number> | null;
  /** Provisional value kept when no candidate satisfied the rule. */
  kept?: Record<string, number>;
  justification: string;
  /** combo only: the cap sweep (same evaluation criterion applied to the cap). */
  capSweep?: Array<Record<string, number | boolean>>;
  capJustification?: string;
}

interface Ctx {
  n?: number;
  workers: number;
  log: (m: string) => void;
}

async function measureWith(cfg: GameConfig, policies: readonly PolicyName[], n: number, workers: number): Promise<MeasureReport> {
  const units = planUnits({ baseSeed: CALIBRATION_BASE_SEED, n, levels: CALIBRATION_LEVELS, policies, toggles: [], togglePolicy: 'threeKey' });
  return aggregate(await runPool(units, cfg, { workers }));
}

function cells(r: MeasureReport, policy: string): Array<NonNullable<MeasureReport['stats'][string][string][string]>> {
  return Object.values(r.stats[ALL_ON] ?? {})
    .map((byPolicy) => byPolicy[policy])
    .filter((c): c is NonNullable<typeof c> => c !== undefined);
}

function avg(xs: number[]): number {
  return xs.length === 0 ? 0 : Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 1e4) / 1e4;
}

async function ghostHunt(cfg: GameConfig, ctx: Ctx, n: number): Promise<CalibrationOutput> {
  // Selection uses the design policy (ghostHuntOpportunistic) and the design rule unchanged. The
  // imperfect humanCasual player is measured alongside for information only; it never chooses.
  const sweep: CalibrationOutput['sweep'] = [];
  const durations: number[] = [];
  for (let ticks = 240; ticks <= 900; ticks += 60) durations.push(ticks);
  for (let i = 0; i < durations.length; i++) {
    const ticks = durations[i]!;
    const r = await measureWith({ ...cfg, ghostHuntTicks: ticks }, ['ghostHuntOpportunistic', 'humanCasual'], n, ctx.workers);
    const cs = cells(r, 'ghostHuntOpportunistic');
    const hs = cells(r, 'humanCasual');
    const row = {
      ticks,
      pickups: cs.reduce((a, c) => a + c.ghostHunt.pickups, 0),
      catchesMean: avg(cs.map((c) => c.ghostHunt.catchesPerPickup?.mean ?? 0)),
      catchesP95: Math.max(...cs.map((c) => c.ghostHunt.catchesPerPickup?.p95 ?? 0)),
      zeroCatchFraction: avg(cs.map((c) => c.ghostHunt.zeroCatchFraction)),
      hunterWinRate: avg(cs.map((c) => c.winRateHunter)),
      playerWinRate: avg(cs.map((c) => c.winRatePlayer)),
      rescueMedian: avg(cs.map((c) => c.rescueTicks?.median ?? 0)),
      humanPickups: hs.reduce((a, c) => a + c.ghostHunt.pickups, 0),
      humanCatchesMean: avg(hs.map((c) => c.ghostHunt.catchesPerPickup?.mean ?? 0)),
      humanHunterWinRate: avg(hs.map((c) => c.winRateHunter)),
      humanPlayerWinRate: avg(hs.map((c) => c.winRatePlayer)),
    };
    const ok = row.catchesMean >= RULES.ghostHuntMinCatches && row.catchesP95 <= RULES.ghostHuntMaxP95 && row.hunterWinRate >= RULES.hunterWinRateFloor;
    sweep.push({ ...row, qualifies: ok });
    ctx.log(`  ghostHunt ${ticks}: catches mean ${row.catchesMean} p95 ${row.catchesP95} zero ${row.zeroCatchFraction} hunterWin ${row.hunterWinRate} | humanCasual catches ${row.humanCatchesMean} hunterWin ${row.humanHunterWinRate} ${ok ? 'OK' : ''}`);
    // Design: if no duration qualifies, widen the sweep (up to 1200 Ticks) and report why.
    if (i === durations.length - 1 && !sweep.some((s) => s.qualifies) && ticks < 1200) durations.push(ticks + 60);
  }
  const ok = sweep.filter((s) => s.qualifies);
  const chosen = ok[0];
  const runner = ok[1];
  const hw = sweep.map((s) => s.hunterWinRate as number);
  const hh = sweep.map((s) => s.humanHunterWinRate as number);
  const saturated = hw.every((v) => v < RULES.hunterWinRateFloor)
    ? ` The Squareman win-rate floor ${RULES.hunterWinRateFloor} was not met at any duration (max ${Math.max(...hw)}): the automated policy wins the contested race almost always, so this metric is saturated and cannot rank durations. Reference only, not used to choose: humanCasual Squareman win rate ${Math.min(...hh)} to ${Math.max(...hh)}.`
    : '';
  return {
    name: 'ghostHunt',
    seeds: n,
    levels: [...CALIBRATION_LEVELS],
    sweep,
    chosen: chosen ? { ticks: chosen.ticks as number } : null,
    runnerUp: runner ? { ticks: runner.ticks as number } : null,
    ...(chosen ? {} : { kept: { ticks: cfg.ghostHuntTicks } }),
    justification: chosen
      ? `Smallest duration with mean catches per pickup >= ${RULES.ghostHuntMinCatches} (${chosen.catchesMean}), p95 <= ${RULES.ghostHuntMaxP95} (${chosen.catchesP95}) and Squareman win rate >= ${RULES.hunterWinRateFloor} (${chosen.hunterWinRate}).`
      : `No duration from ${durations[0]} to ${durations[durations.length - 1]} satisfied the design rule; the provisional ghostHuntTicks = ${cfg.ghostHuntTicks} is kept unchanged.${saturated}`,
  };
}
async function bombRadius(cfg: GameConfig, ctx: Ctx, n: number): Promise<CalibrationOutput> {
  const sweep: CalibrationOutput['sweep'] = [];
  for (let r10 = 15; r10 <= 35; r10 += 5) {
    const radius = r10 / 10;
    const r = await measureWith({ ...cfg, bombRadius: radius }, ['bombAggressive', 'bombNone'], n, ctx.workers);
    const agg = cells(r, 'bombAggressive');
    const none = cells(r, 'bombNone');
    const medA = avg(agg.map((c) => c.ratio?.median ?? 0));
    const medN = avg(none.map((c) => c.ratio?.median ?? 0));
    const shift = medN > 0 ? Math.round((Math.abs(medA - medN) / medN) * 1e4) / 1e4 : 0;
    const wallsPerBomb = avg(agg.map((c) => c.bombs.wallsPerBomb));
    const detonated = agg.reduce((a, c) => a + c.bombs.detonated, 0);
    const ok = wallsPerBomb <= RULES.bombMaxWalls && shift <= RULES.bombRatioShift && detonated > 0;
    sweep.push({ radius, wallsPerBomb, detonated, ratioMedianAggressive: medA, ratioMedianNone: medN, ratioShift: shift, qualifies: ok });
    ctx.log(`  bombRadius ${radius}: walls/bomb ${wallsPerBomb} detonated ${detonated} shift ${shift} ${ok ? 'OK' : ''}`);
  }
  const ok = sweep.filter((s) => s.qualifies);
  const chosen = ok[ok.length - 1];
  const runner = ok[ok.length - 2];
  return {
    name: 'bombRadius',
    seeds: n,
    levels: [...CALIBRATION_LEVELS],
    sweep,
    chosen: chosen ? { radius: chosen.radius as number } : null,
    runnerUp: runner ? { radius: runner.radius as number } : null,
    ...(chosen ? {} : { kept: { radius: cfg.bombRadius } }),
    justification: chosen
      ? `Largest radius (most useful to the Player) with mean walls per Bomb <= ${RULES.bombMaxWalls} (${chosen.wallsPerBomb}) and median ratio shift <= ${RULES.bombRatioShift} (${chosen.ratioShift}) versus bombNone.`
      : 'No radius satisfied the constraints; see the sweep table.',
  };
}

async function bombs(cfg: GameConfig, ctx: Ctx, n: number): Promise<CalibrationOutput> {
  const sweep: CalibrationOutput['sweep'] = [];
  for (let perLevel = 1; perLevel <= 4; perLevel++) {
    for (let delta = 0; delta <= 5; delta++) {
      const r = await measureWith({ ...cfg, bombsPerLevel: perLevel, bombFairnessDelta: delta }, ['bombAggressive', 'bombNone'], n, ctx.workers);
      const wA = avg(cells(r, 'bombAggressive').map((c) => c.winRatePlayer));
      const wN = avg(cells(r, 'bombNone').map((c) => c.winRatePlayer));
      const medA = avg(cells(r, 'bombAggressive').map((c) => c.ratio?.median ?? 0));
      const medN = avg(cells(r, 'bombNone').map((c) => c.ratio?.median ?? 0));
      const shift = medN > 0 ? Math.round((Math.abs(medA - medN) / medN) * 1e4) / 1e4 : 0;
      const ok = wA <= RULES.playerWinRateCeiling && wA >= wN - RULES.bombWinMargin;
      sweep.push({ bombsPerLevel: perLevel, bombFairnessDelta: delta, winAggressive: wA, winNone: wN, ratioShift: shift, fallbacks: r.generation.fallbackCount, qualifies: ok });
      ctx.log(`  bombs ${perLevel}/${delta}: win aggressive ${wA} none ${wN} shift ${shift} fallbacks ${r.generation.fallbackCount} ${ok ? 'OK' : ''}`);
    }
  }
  // The design rule is applied unchanged; no criterion is replaced when it saturates.
  const ok = sweep.filter((s) => s.qualifies);
  const minFallback = Math.min(...ok.map((s) => s.fallbacks as number));
  const ranked = ok
    .filter((s) => s.fallbacks === minFallback)
    .sort((a, b) => (b.bombsPerLevel as number) - (a.bombsPerLevel as number) || (a.bombFairnessDelta as number) - (b.bombFairnessDelta as number));
  const chosen = ranked[0];
  const runner = ranked[1];
  const wins = sweep.map((s) => s.winAggressive as number);
  const saturated = wins.every((v) => v > RULES.playerWinRateCeiling)
    ? ` bombAggressive wins above the ${RULES.playerWinRateCeiling} ceiling at every point (min ${Math.min(...wins)}): the automated Player wins the contested race almost always, so the win-rate criterion is saturated and cannot rank the Bomb parameters.`
    : '';
  return {
    name: 'bombs',
    seeds: n,
    levels: [...CALIBRATION_LEVELS],
    sweep,
    chosen: chosen ? { bombsPerLevel: chosen.bombsPerLevel as number, bombFairnessDelta: chosen.bombFairnessDelta as number } : null,
    runnerUp: runner ? { bombsPerLevel: runner.bombsPerLevel as number, bombFairnessDelta: runner.bombFairnessDelta as number } : null,
    ...(chosen ? {} : { kept: { bombsPerLevel: cfg.bombsPerLevel, bombFairnessDelta: cfg.bombFairnessDelta } }),
    justification: chosen
      ? `Most Bombs per level whose bombAggressive Player win rate (${chosen.winAggressive}) stays <= ${RULES.playerWinRateCeiling} and >= bombNone (${chosen.winNone}) - ${RULES.bombWinMargin}; ties to the smallest fairness delta with the fewest generation fallbacks.`
      : `No combination satisfied the design rule; the provisional bombsPerLevel = ${cfg.bombsPerLevel} and bombFairnessDelta = ${cfg.bombFairnessDelta} are kept unchanged.${saturated}`,
  };
}
async function wisps(cfg: GameConfig, ctx: Ctx, n: number): Promise<CalibrationOutput> {
  const sweep: CalibrationOutput['sweep'] = [];
  for (let d10 = 2; d10 <= 7; d10++) {
    const density = d10 / 10;
    const r = await measureWith({ ...cfg, wispDensity: density }, ['threeKey', 'wispSweep'], n, ctx.workers);
    const three = cells(r, 'threeKey');
    const sweepP = cells(r, 'wispSweep');
    const rescue3 = avg(three.map((c) => c.rescueTicks?.median ?? 0));
    const rescueW = avg(sweepP.map((c) => c.rescueTicks?.median ?? 0));
    const clear = avg(Object.values(r.pelletClear[ALL_ON] ?? {}).map((s) => s?.median ?? 0));
    const margin = rescue3 > 0 ? Math.round((clear / rescue3 - 1) * 1e4) / 1e4 : 0;
    const slowdown = rescue3 > 0 ? Math.round((rescueW / rescue3 - 1) * 1e4) / 1e4 : 0;
    const coverageOk = r.generation.units > 0 ? 1 - r.generation.fallbackCount / r.generation.units : 1;
    // Design constraints: race margin and coverage. The wispSweep slowdown is the selection rule
    // among qualifying densities (Wisps should reward detours without dragging the Player).
    const ok = margin >= RULES.bandMargin && coverageOk >= RULES.coverageOkMin;
    sweep.push({ density, pelletClearMedian: clear, rescueMedianThreeKey: rescue3, rescueMedianWispSweep: rescueW, raceMargin: margin, sweepSlowdown: slowdown, coverageOkFraction: coverageOk, qualifies: ok });
    ctx.log(`  wisps ${density}: clear ${clear} rescue ${rescue3} margin ${margin} slowdown ${slowdown} coverage ${coverageOk} ${ok ? 'OK' : ''}`);
  }
  const ok = sweep
    .filter((s) => s.qualifies)
    .sort((a, b) => {
      const sa = a.sweepSlowdown as number;
      const sb = b.sweepSlowdown as number;
      // Within the slowdown limit prefer the higher density; otherwise the smaller slowdown.
      const ina = sa <= RULES.wispRescueSlowdownMax;
      const inb = sb <= RULES.wispRescueSlowdownMax;
      if (ina !== inb) return ina ? -1 : 1;
      if (ina) return (b.density as number) - (a.density as number);
      return sa - sb;
    });
  const chosen = ok[0];
  const runner = ok[1];
  return {
    name: 'wisps',
    seeds: n,
    levels: [...CALIBRATION_LEVELS],
    sweep,
    chosen: chosen ? { density: chosen.density as number } : null,
    runnerUp: runner ? { density: runner.density as number } : null,
    ...(chosen ? {} : { kept: { density: cfg.wispDensity } }),
    justification: chosen
      ? `Pellet-clear median exceeds the threeKey rescue median by >= ${RULES.bandMargin} (${chosen.raceMargin}) and coverage holds for >= ${RULES.coverageOkMin} of Seeds (${chosen.coverageOkFraction}); among qualifying densities the highest one with a wispSweep slowdown <= ${RULES.wispRescueSlowdownMax}, else the smallest slowdown (${chosen.sweepSlowdown}).`
      : 'No density satisfied the constraints; see the sweep table.',
  };
}

async function combo(cfg: GameConfig, ctx: Ctx, n: number): Promise<CalibrationOutput> {
  const sweep: CalibrationOutput['sweep'] = [];
  for (let w = 60; w <= 180; w += 30) {
    const r = await measureWith({ ...cfg, comboWindowTicks: w }, ['wispSweep'], n, ctx.workers);
    const cs = cells(r, 'wispSweep');
    const comboMedian = avg(cs.map((c) => c.wisps.maxComboMedian));
    const share = avg(cs.map((c) => c.wisps.wispScoreShare));
    sweep.push({ comboWindowTicks: w, maxComboMedian: comboMedian, wispScoreShare: share, capReachedTypically: comboMedian >= cfg.comboCap });
    ctx.log(`  combo ${w}: median max combo ${comboMedian} wisp score share ${share}`);
  }
  const at = sweep.find((s) => s.comboWindowTicks === cfg.comboWindowTicks);
  const neverOrAlways = at ? (at.maxComboMedian as number) <= 1 || (at.maxComboMedian as number) >= cfg.comboCap : false;
  let chosen = cfg.comboWindowTicks;
  let why = `Kept comboWindowTicks = ${cfg.comboWindowTicks}: the median best Combo (${at?.maxComboMedian}) lies strictly between 1 and the cap ${cfg.comboCap}, so the cap is neither never nor always reached.`;
  if (neverOrAlways) {
    const mid = sweep.filter((s) => (s.maxComboMedian as number) > 1 && (s.maxComboMedian as number) < cfg.comboCap);
    const pick = mid.sort((a, b) => Math.abs((a.comboWindowTicks as number) - cfg.comboWindowTicks) - Math.abs((b.comboWindowTicks as number) - cfg.comboWindowTicks))[0];
    if (pick) {
      chosen = pick.comboWindowTicks as number;
      why = `Changed comboWindowTicks to ${chosen}: at ${cfg.comboWindowTicks} the median best Combo was ${at?.maxComboMedian} (cap ${cfg.comboCap} never or always reached); ${chosen} is the nearest window with a median strictly between 1 and the cap.`;
    } else why = `No window gives a median best Combo strictly between 1 and the cap; kept ${cfg.comboWindowTicks}.`;
  }
  // Cap sweep (same criterion applied to the cap): the cap is "neither never nor always reached"
  // when the median best Combo lies strictly between 1 and the cap. Keep the current cap when it
  // already satisfies that; else take the smallest larger cap that does; else keep it (inconclusive).
  const capSweep: Array<Record<string, number | boolean>> = [];
  for (const cap of [5, 6, 7, 8, 10, 12, 15]) {
    const r = await measureWith({ ...cfg, comboWindowTicks: chosen, comboCap: cap }, ['wispSweep'], n, ctx.workers);
    const cs = cells(r, 'wispSweep');
    const m = avg(cs.map((c) => c.wisps.maxComboMedian));
    const sh = avg(cs.map((c) => c.wisps.wispScoreShare));
    capSweep.push({ comboCap: cap, maxComboMedian: m, wispScoreShare: sh, capReachedTypically: m >= cap, strictlyBetween: m > 1 && m < cap });
    ctx.log(`  cap ${cap}: median max combo ${m} wisp score share ${sh}`);
  }
  const curCap = capSweep.find((s) => s.comboCap === cfg.comboCap);
  let chosenCap = cfg.comboCap;
  let capWhy: string;
  if (curCap?.strictlyBetween) {
    capWhy = `Kept comboCap = ${cfg.comboCap}: the median best Combo (${curCap.maxComboMedian}) lies strictly between 1 and the cap.`;
  } else {
    const pick = capSweep.filter((s) => (s.comboCap as number) > cfg.comboCap && s.strictlyBetween).sort((a, b) => (a.comboCap as number) - (b.comboCap as number))[0];
    if (pick) {
      chosenCap = pick.comboCap as number;
      capWhy = `Changed comboCap to ${chosenCap}: at ${cfg.comboCap} the median best Combo was ${curCap?.maxComboMedian} (cap always reached); ${chosenCap} is the smallest larger cap with a median strictly between 1 and the cap (${pick.maxComboMedian}).`;
    } else {
      capWhy = `Inconclusive: no cap from 5 to 15 gives a median best Combo strictly between 1 and the cap (the median reaches the cap every time); kept comboCap = ${cfg.comboCap}.`;
    }
  }
  return { name: 'combo', seeds: n, levels: [...CALIBRATION_LEVELS], sweep, capSweep, chosen: { comboWindowTicks: chosen, comboCap: chosenCap }, runnerUp: null, justification: why, capJustification: capWhy };
}

export async function calibrate(name: CalibrationName, cfg: GameConfig, ctx: Ctx): Promise<CalibrationOutput> {
  const n = ctx.n ?? DEFAULT_CALIBRATION_SEEDS;
  ctx.log(`calibrate ${name}: ${n} seeds per point, levels ${CALIBRATION_LEVELS.join(',')}, ${ctx.workers} workers`);
  switch (name) {
    case 'ghostHunt':
      return ghostHunt(cfg, ctx, n);
    case 'bombRadius':
      return bombRadius(cfg, ctx, n);
    case 'bombs':
      return bombs(cfg, ctx, n);
    case 'wisps':
      return wisps(cfg, ctx, n);
    case 'combo':
      return combo(cfg, ctx, n);
  }
}
