// Game_Config: every tunable value of the Simulation, defaults, and validation.
// Self-contained on purpose: no imports from other core modules.
// Pure TypeScript: no DOM, no wall clock, no unseeded randomness.
//
// Ghost Hunt note: no key in this file can alter rescue progress. Rescued allies never
// become imprisoned again, and captive allies return to the Cage when a Ghost Hunt ends.

/** Fixed-point units per Cell (shared constant of the movement design). */
export const CELL_UNITS = 1000;

export type LivesResetPolicy = 'carryPlusExtraEvery5';
export type HunterWinConsequence = 'loseLifeNewMazeSameLevel';
export type PelletStarvedPolicy = 'loseLifeNewMazeSameLevel';
export type GameOverPolicy = 'gameOverThenHighScore';
export type SimultaneousWinTieRule = 'playerWins';
export type QualityTier = 'high' | 'medium' | 'low';

export interface AudioConfig {
  soundtrackUrl: string; // 'audio/Pixel Pulse.opus' (URL-encoded at runtime)
  soundtrackMethod: 'auto' | 'buffer' | 'stream';
  soundtrackLoadTimeoutMs: number;
  soundtrackDistortionMs: number; // validated 50..1000
  soundtrackDistortionIntensity: number;
  soundtrackCrushBits: number;
  soundtrackCrushLowpassHz: number;
  soundtrackCrusher: 'waveshaper' | 'worklet';
  soundtrackMaxRateShift: number; // validated <= 0.08
  soundtrackUrgency: 'off' | 'rate' | 'rate+filter';
  soundtrackUrgencyShelfDb: number;
  levelEndMusicDuck: number;
  pauseOnHidden: boolean;
  maxVoices: number;
  wispPitchStepSemitones: number;
  defaults: { master: number; music: number; sfx: number };
}

export interface GameConfig {
  // Core
  tickRate: 60;
  mazeSize: { w: number; h: number }; // odd x odd
  baseUnitsPerTick: number; // fixed-point movement units per Tick at level speed 1
  doorCount: number;
  doorMinOpenRatio: number; // in (0, 1]
  doorWarnTicks: number; // >= 30
  doorPeriod: { min: number; max: number };
  doorLookaheadTicks: number;
  maxDisconnectTicks: number;
  powerTicks: number;
  speedDurationTicks: number;
  speedMultiplier: number;
  speedIncrement: number;
  speedCap: number;
  powerPelletsPerLevel: number;
  speedPelletsPerLevel: number;
  loopCount: number;
  minLoopSpan: number;
  deadEndRemoval: number;
  maxAttempts: number;
  maxRepairs: number;
  keyFairnessDelta: number;
  keyMinDist: number; // Key graph distance from the Cage entrance, lower bound
  keyMaxDist: number; // Key graph distance from the Cage entrance, upper bound
  keyRouteMin: number; // greedy Key route (Player start -> nearest Keys -> Cage entrance), lower bound (task 36.8)
  keyRouteMax: number; // greedy Key route, upper bound (task 36.8)
  powerMinStartDist: number; // Power_Pellets must be farther than this from both starts
  powerFairnessDelta: number; // max |dist(player) - dist(hunter)| per Power_Pellet
  speedFairnessDelta: number; // max |dist(player) - dist(hunter)| per Speed_Pellet

  // Lives, respawn, dropped keys, level loss (approved initial defaults, configurable)
  invulnerabilityTicks: number;
  /** Fair respawn: preferred minimum path distance (Cells) between the respawn Cell and Squareman; >= 0. */
  respawnMinHunterDist: number;
  droppedKeyPlacement: 'nearestReachable';
  hunterRespawnTicks: number;
  hunterGraceTicks: number;
  hunterChaseDistance: number;
  livesInitial: number;
  livesResetPolicy: LivesResetPolicy;
  hunterWinConsequence: HunterWinConsequence;
  pelletStarvedPolicy: PelletStarvedPolicy;
  gameOverPolicy: GameOverPolicy;
  simultaneousWinTieRule: SimultaneousWinTieRule;

  // Score and render limits
  scoreWeights: { ordinary: number; captive: number; hunterEaten: number; level: number };
  particleCap: number;
  qualityTiers: QualityTier[];

  // Balance (balanceBand, balanceFullSeeds are PROVISIONAL; see defaults)
  balanceBand: { p5Min: number; medianMax: number };
  balanceFullSeeds: number;
  balanceFullBudgetMs: number;
  balanceSmokeBudgetMs: number;
  balanceRelTol: number;

  // Bombs
  /**
   * Validity check 8 (analytic race-ratio pre-filter): accepted range of
   * `analyticRaceRatio(maze)`. Set from the measured baseline (task 19.7).
   */
  prefilterBand: { min: number; max: number };

  bombRadius: number; // in (0, 6]
  bombsPerLevel: number;
  bombCapacity: 3;
  bombKey: string; // non-empty
  bombMinStartDist: number;
  bombFairnessDelta: number;
  bombAffectsHunter: boolean;
  bombAffectsPellets: boolean;
  hunterCollectsBombs: boolean;
  screenShake: boolean; // render only

  // Ghost Hunt
  ghostHuntTicks: number; // >= 1
  ghostHuntPerLevel: number;
  ghostHuntMinCageDist: number;
  hunterCollectsGhostHunt: boolean;
  allyFactor: number; // > 0
  /** Squareman speed relative to the level speed, in permille (1000 = normal). Integer 500..2000. */
  hunterSpeedPermille: number;
  allyStaggerTicks: number;
  allyLeaveTicks: number;
  allyLeadTicks: number;
  allyHoldRadius: number;

  // Spirit Wisps and Combo
  wispDensity: number; // in [0, 0.9]
  wispPoints: number;
  comboWindowTicks: number;
  comboCap: number; // >= 1
  comboCapBonus: number; // score-only bonus each time a chain reaches comboCap (>= 0)
  oneUpThresholds: readonly number[]; // ascending score milestones that each give one life
  oneUpRepeat: number; // interval after the last listed milestone (0 = no further milestones)
  celebrationFirstLevel: number; // first level that triggers a LevelMilestone event (>= 1)
  celebrationEvery: number; // interval between later celebration levels (>= 1)
  itemBlock: number;
  coverageBlock: number;
  coverageWindow: number;

  // Snow biome ice (levels 21-25, 51-55, ...): no turning while sliding over an ice patch
  iceEnabled: boolean;
  icePatches: number; // ice patches per snow Maze (>= 0)
  icePatchLen: number; // Cells per patch (>= 1)

  // Audio
  audio: AudioConfig;
}

export const DEFAULT_CONFIG: GameConfig = {
  tickRate: 60,
  mazeSize: { w: 21, h: 21 },
  baseUnitsPerTick: 125, // 8 Ticks per Cell at level 1
  doorCount: 4,
  doorMinOpenRatio: 0.5,
  doorWarnTicks: 40,
  doorPeriod: { min: 240, max: 480 },
  doorLookaheadTicks: 30,
  maxDisconnectTicks: 180,
  powerTicks: 300,
  speedDurationTicks: 240,
  speedMultiplier: 1.5,
  speedIncrement: 0.03,
  speedCap: 1.6,
  powerPelletsPerLevel: 4,
  speedPelletsPerLevel: 3,
  loopCount: 12,
  minLoopSpan: 8,
  deadEndRemoval: 0.5,
  maxAttempts: 20,
  maxRepairs: 50,
  keyFairnessDelta: 3,
  keyMinDist: 8,
  keyMaxDist: 40,
  keyRouteMin: 34, // measured p2 of 2,500 pre-36.8 Mazes (median 59, min 24 = 0.41x); provisional
  keyRouteMax: 92, // measured p98 (max 109 = 1.85x median); provisional
  powerMinStartDist: 6,
  powerFairnessDelta: 4,
  speedFairnessDelta: 4,

  invulnerabilityTicks: 120,
  respawnMinHunterDist: 8,
  droppedKeyPlacement: 'nearestReachable',
  hunterRespawnTicks: 180,
  hunterGraceTicks: 30,
  hunterChaseDistance: 8,
  livesInitial: 3,
  livesResetPolicy: 'carryPlusExtraEvery5',
  hunterWinConsequence: 'loseLifeNewMazeSameLevel',
  pelletStarvedPolicy: 'loseLifeNewMazeSameLevel',
  gameOverPolicy: 'gameOverThenHighScore',
  simultaneousWinTieRule: 'playerWins',

  scoreWeights: { ordinary: 10, captive: 500, hunterEaten: 100, level: 1000 },
  particleCap: 500,
  qualityTiers: ['high', 'medium', 'low'],

  // Task 19.6: measured bands. Baseline: 500 Seeds x levels 1, 5, 10, 20, 40 (tools/balance/baseline.json, config hash 2f2f11a8aec2760f).
  // p5Min = floor(threeKey p5 * 0.9), medianMax = ceil(threeKey median * 1.1), both at 2 decimals. Replaces the 1.3 / 3.0 placeholders.
  balanceBand: { p5Min: 2.68, medianMax: 5.26 },
  // Task 19.6: 500 Mazes confirmed by the precision table in the baseline (worst-cell p5 error 0.12 at 200 Seeds, 0.09 median).
  balanceFullSeeds: 500,
  // Task 19.6: set from the measured 500-Seed run (3,507,773 ms on 3 workers) with 1.5x headroom; balance-tool field, excluded from the config hash.
  balanceFullBudgetMs: 5_400_000,
  balanceSmokeBudgetMs: 30_000,
  balanceRelTol: 0.15,

  // PROVISIONAL (inactive until task 19.7 sets it from the baseline): accepts every Maze.
  prefilterBand: { min: 0, max: 1_000_000 },

  // Tuned (task 19.3): 3.0 Cells, the largest radius satisfying the rule (8.28 walls per Bomb <= 10, ratio shift 0.1075 <= 0.15).
  // The user approved 3.0 over 2.5 (both qualify). Evidence: tools/balance/calibration.json, open-decisions.md.
  bombRadius: 3,
  // Kept (task 19.4): no combination satisfied the rule (the win-rate criterion is saturated, see calibration.json).
  bombsPerLevel: 3,
  bombCapacity: 3,
  bombKey: 'Space',
  bombMinStartDist: 6,
  bombFairnessDelta: 3,
  bombAffectsHunter: false,
  bombAffectsPellets: false,
  hunterCollectsBombs: false,
  screenShake: true,

  // Kept (task 19.2): 480 Ticks (8 s). No duration from 240 to 1200 satisfied the rule (the Squareman win-rate floor is saturated at 0).
  ghostHuntTicks: 480,
  ghostHuntPerLevel: 1,
  ghostHuntMinCageDist: 8,
  hunterCollectsGhostHunt: false,
  allyFactor: 1.1,
  hunterSpeedPermille: 1000,
  allyStaggerTicks: 20,
  allyLeaveTicks: 30,
  allyLeadTicks: 12,
  allyHoldRadius: 3,

  // Task 19.5, DOCUMENTED DEVIATION approved by the user: the rule picks 0.2 (the only density with a wispSweep slowdown <= 0.1),
  // but 0.5 is kept so the Player has plenty of meaningful collectibles. Measured: slowdown 0.179 at 0.5 vs 0.096 at 0.2, race margin
  // 3.665 vs 4.130 (floor 0.1), pellet-clear median 1887 vs 2075 Ticks, coverage 100% at both. See open-decisions.md and calibration.json (wisps.override).
  wispDensity: 0.5,
  wispPoints: 20,
  // Kept (task 19.5): comboWindowTicks 120, comboCap 5, wispPoints 20. The window and cap sweeps are inconclusive: the median best Combo
  // equals the cap at every window (60 to 180) and every cap (5 to 15), so the criterion cannot discriminate.
  comboWindowTicks: 120,
  comboCap: 5,
  comboCapBonus: 100,
  oneUpThresholds: [10000, 25000, 50000],
  oneUpRepeat: 50000,
  celebrationFirstLevel: 100,
  celebrationEvery: 50,
  itemBlock: 3,
  coverageBlock: 4,
  coverageWindow: 6,

  iceEnabled: true,
  icePatches: 4,
  icePatchLen: 4,

  audio: {
    soundtrackUrl: 'audio/Pixel Pulse.opus',
    soundtrackMethod: 'auto',
    soundtrackLoadTimeoutMs: 30_000,
    soundtrackDistortionMs: 250,
    soundtrackDistortionIntensity: 0.35,
    soundtrackCrushBits: 5,
    soundtrackCrushLowpassHz: 3500,
    soundtrackCrusher: 'waveshaper',
    soundtrackMaxRateShift: 0.05,
    soundtrackUrgency: 'rate+filter',
    soundtrackUrgencyShelfDb: 2,
    levelEndMusicDuck: 0.4,
    pauseOnHidden: true,
    maxVoices: 16,
    wispPitchStepSemitones: 2,
    defaults: { master: 0.8, music: 0.55, sfx: 0.9 },
  },
};

/** Thrown by createRun when validateConfig reports problems. */
export class ConfigError extends Error {
  readonly problems: readonly string[];
  constructor(problems: readonly string[]) {
    super(`Invalid game config: ${problems.join('; ')}`);
    this.name = 'ConfigError';
    this.problems = problems;
  }
}

/** Returns a list of problems; an empty list means the config is valid. */
export function validateConfig(cfg: GameConfig): string[] {
  const p: string[] = [];

  if (!(cfg.doorWarnTicks >= 30)) p.push('doorWarnTicks must be >= 30');
  if (!(cfg.doorMinOpenRatio > 0 && cfg.doorMinOpenRatio <= 1)) {
    p.push('doorMinOpenRatio must be in (0, 1]');
  }

  const { w, h } = cfg.mazeSize;
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 5 || h < 5 || w % 2 === 0 || h % 2 === 0) {
    p.push('mazeSize must be odd integers of at least 5 x 5');
  }

  // Speed cap must stay turnable at 60 Hz: even with Speed_State the per-Tick movement
  // must stay below half a Cell.
  const maxUnitsPerTick = Math.round(
    cfg.baseUnitsPerTick * cfg.speedCap * Math.max(1, cfg.speedMultiplier) * Math.max(1, cfg.hunterSpeedPermille / 1000),
  );
  if (!(cfg.speedCap >= 1) || !(maxUnitsPerTick < CELL_UNITS / 2)) {
    p.push('speedCap too high: maxUnitsPerTick must be < CELL_UNITS / 2 (turnable at 60 Hz)');
  }

  if (!(cfg.bombRadius > 0 && cfg.bombRadius <= 6)) p.push('bombRadius must be in (0, 6]');
  if (cfg.bombCapacity !== 3) p.push('bombCapacity must be 3');
  if (!(cfg.wispDensity >= 0 && cfg.wispDensity <= 0.9)) p.push('wispDensity must be in [0, 0.9]');
  if (!(cfg.respawnMinHunterDist >= 0)) p.push('respawnMinHunterDist must be >= 0');
  if (!Number.isInteger(cfg.icePatches) || cfg.icePatches < 0) p.push('icePatches must be an integer >= 0');
  if (!Number.isInteger(cfg.icePatchLen) || cfg.icePatchLen < 1) p.push('icePatchLen must be an integer >= 1');
  if (!(cfg.comboCap >= 1)) p.push('comboCap must be >= 1');
  if (!(cfg.comboCapBonus >= 0)) p.push('comboCapBonus must be >= 0');
  if (!Array.isArray(cfg.oneUpThresholds) || cfg.oneUpThresholds.some((v, i, a) => !(v > 0) || (i > 0 && !(v > a[i - 1]!)))) {
    p.push('oneUpThresholds must be strictly ascending positive numbers');
  }
  if (!(cfg.oneUpRepeat >= 0)) p.push('oneUpRepeat must be >= 0');
  if (!(cfg.celebrationFirstLevel >= 1)) p.push('celebrationFirstLevel must be >= 1');
  if (!(cfg.celebrationEvery >= 1)) p.push('celebrationEvery must be >= 1');
  if (!(cfg.ghostHuntTicks >= 1)) p.push('ghostHuntTicks must be >= 1');
  if (!(cfg.allyFactor > 0)) p.push('allyFactor must be > 0');
  if (!Number.isInteger(cfg.hunterSpeedPermille) || cfg.hunterSpeedPermille < 500 || cfg.hunterSpeedPermille > 2000) {
    p.push('hunterSpeedPermille must be an integer in 500..2000');
  }
  if (!(cfg.audio.soundtrackMaxRateShift <= 0.08)) {
    p.push('soundtrackMaxRateShift must be <= 0.08');
  }
  const dist = cfg.audio.soundtrackDistortionMs;
  if (!(dist >= 50 && dist <= 1000)) p.push('soundtrackDistortionMs must be in 50..1000');
  if (typeof cfg.bombKey !== 'string' || cfg.bombKey.trim().length === 0) {
    p.push('bombKey must be non-empty');
  }
  if (cfg.livesResetPolicy !== 'carryPlusExtraEvery5') p.push('livesResetPolicy must be carryPlusExtraEvery5');
  if (cfg.hunterWinConsequence !== 'loseLifeNewMazeSameLevel') p.push('hunterWinConsequence must be loseLifeNewMazeSameLevel');
  if (cfg.pelletStarvedPolicy !== 'loseLifeNewMazeSameLevel') p.push('pelletStarvedPolicy must be loseLifeNewMazeSameLevel');
  if (cfg.gameOverPolicy !== 'gameOverThenHighScore') p.push('gameOverPolicy must be gameOverThenHighScore');
  if (cfg.simultaneousWinTieRule !== 'playerWins') p.push('simultaneousWinTieRule must be playerWins');
  if (cfg.droppedKeyPlacement !== 'nearestReachable') p.push('droppedKeyPlacement must be nearestReachable');
  // rebuildDerived enumerates 2^doorCount masks with 1 << doors.length: 31 overflows to a
  // negative length (RangeError) and 32+ wraps the shift (silent wrong tables).
  if (!Number.isInteger(cfg.doorCount) || cfg.doorCount < 0 || cfg.doorCount > 30) {
    p.push('doorCount must be an integer in 0..30');
  }

  return p;
}
