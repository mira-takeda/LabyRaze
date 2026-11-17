// Open Design Questions registry (rows 1 to 20 of the requirements table).
// Default values are read from DEFAULT_CONFIG through key paths, never duplicated.
// Pure TypeScript: no DOM, no wall clock, no unseeded randomness.

import { DEFAULT_CONFIG } from './config';

export type QuestionStatus = 'needsDecision' | 'tuning' | 'resolved';

export interface OpenQuestion {
  readonly id: number;
  readonly question: string;
  /** Dot paths into GameConfig, for example "audio.soundtrackDistortionMs". */
  readonly configKeys: readonly string[];
  /** One value per config key, read from DEFAULT_CONFIG. */
  readonly defaultValue: Readonly<Record<string, unknown>>;
  readonly status: QuestionStatus;
  /** True when the user approved the proposed default as a configurable initial default. */
  readonly approvedAsInitialDefault?: true;
  readonly note: string;
}

/** Resolves a dot path against an object; returns undefined when any segment is missing. */
export function getByPath(root: unknown, path: string): unknown {
  let cur: unknown = root;
  for (const seg of path.split('.')) {
    if (typeof cur !== 'object' || cur === null || !(seg in cur)) return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

/** Config keys whose soundtrack settings live under the nested `audio` object. */
const AUDIO_KEYS = new Set(['soundtrackDistortionMs', 'soundtrackMaxRateShift']);

function toPath(key: string): string {
  return AUDIO_KEYS.has(key) ? `audio.${key}` : key;
}

interface Row {
  id: number;
  question: string;
  keys: readonly string[];
  status: QuestionStatus;
  note: string;
}

const APPROVED = 'Approved as initial default; remains needsDecision per the requirements.';

const ROWS: readonly Row[] = [
  { id: 1, question: 'How long is the Player invulnerable after a respawn?', keys: ['invulnerabilityTicks'], status: 'needsDecision', note: '2 seconds, blink distinct from Power_State. ' + APPROVED },
  { id: 2, question: 'Where do dropped Keys return to the Maze when the Player is eaten?', keys: ['droppedKeyPlacement'], status: 'needsDecision', note: 'Nearest reachable floor Cell holding no other Key, never inside the Cage. ' + APPROVED },
  { id: 3, question: 'How long is the Squareman respawn delay after the Player eats Squareman?', keys: ['hunterRespawnTicks'], status: 'needsDecision', note: '3 seconds, then respawn at the Squareman Start_Cell. ' + APPROVED },
  { id: 4, question: 'Do Lives reset at the start of each level?', keys: ['livesResetPolicy'], status: 'needsDecision', note: 'Lives carry across levels; one extra life every 5 levels. ' + APPROVED },
  { id: 5, question: 'What happens when Squareman wins a level by collecting all Ordinary_Pellets?', keys: ['hunterWinConsequence'], status: 'needsDecision', note: 'Lose 1 life, new Maze at the same Level_Number. ' + APPROVED },
  { id: 6, question: 'Does a pellet-starved level restart or cost a life?', keys: ['pelletStarvedPolicy'], status: 'needsDecision', note: 'Costs 1 life, new Maze at the same Level_Number. ' + APPROVED },
  { id: 7, question: 'How does the Run end?', keys: ['gameOverPolicy'], status: 'needsDecision', note: 'Lives reach 0: game over, then high score entry. ' + APPROVED },
  { id: 8, question: 'What is the Level_Speed increment per won level and the cap?', keys: ['speedIncrement', 'speedCap'], status: 'tuning', note: '3 percent per level, capped at 160 percent.' },
  { id: 9, question: 'What is the Speed_State multiplier and Speed_Duration?', keys: ['speedMultiplier', 'speedDurationTicks'], status: 'tuning', note: '1.5 times Level_Speed for 4 seconds.' },
  { id: 10, question: 'What are the Maze dimensions, Door count, and maximum disconnection duration?', keys: ['mazeSize', 'doorCount', 'maxDisconnectTicks', 'doorMinOpenRatio'], status: 'tuning', note: '21 by 21 Cells, 4 Doors, 3 seconds maximum disconnection, open-time ratio 0.5.' },
  { id: 11, question: 'How is the final score computed?', keys: ['scoreWeights'], status: 'resolved', note: '10 per Ordinary_Pellet, 500 per Rescued_Captive, 100 per eaten Squareman, 1000 per level won.' },
  { id: 12, question: 'What is the default Squareman chase distance and flee behavior?', keys: ['hunterChaseDistance'], status: 'tuning', note: 'Chase within 8 Cells while Squareman holds Power_State, flee while the Player holds it.' },
  { id: 13, question: 'What are the particle cap and effect quality tiers?', keys: ['particleCap', 'qualityTiers'], status: 'resolved', note: '500 active particles, three tiers (high, medium, low).' },
  { id: 14, question: 'What is the Blast_Radius of a Bomb?', keys: ['bombRadius'], status: 'tuning', note: 'Tuned (task 19.3): 3.0 Cells. The sweep 1.5 to 3.5 qualifies 1.5 to 3.0; the largest qualifying radius is 3.0 (8.28 walls per Bomb, ratio shift 0.1075). The user approved 3.0 over 2.5.' },
  { id: 15, question: 'Does the explosion affect Squareman or pellets?', keys: ['bombAffectsHunter', 'bombAffectsPellets'], status: 'needsDecision', note: 'No; the explosion only destroys walls. ' + APPROVED },
  { id: 16, question: 'Who can collect Bombs and Ghost_Hunt?', keys: ['hunterCollectsBombs', 'hunterCollectsGhostHunt'], status: 'needsDecision', note: 'Only the Player. ' + APPROVED },
  { id: 17, question: 'How long does Ghost_Hunt last and how many appear per Level?', keys: ['ghostHuntTicks', 'ghostHuntPerLevel'], status: 'tuning', note: 'Kept 480 Ticks (8 s), 1 per Level (task 19.2). No duration from 240 to 1200 satisfied the rule: the Squareman win-rate floor is saturated at 0.' },
  { id: 18, question: 'What are the Spirit_Wisp density, points, and Combo window?', keys: ['wispDensity', 'wispPoints', 'comboWindowTicks', 'comboCap'], status: 'tuning', note: 'Density 0.5 (documented, user-approved deviation from the 0.2 rule pick), 20 points, 120-Tick window, cap 5 kept (task 19.5; window and cap sweeps inconclusive).' },
  { id: 19, question: 'How intense is the Soundtrack processing?', keys: ['soundtrackDistortionMs', 'soundtrackMaxRateShift'], status: 'tuning', note: 'Key distortion 250 ms at low intensity, playbackRate change at most 5 percent.' },
  { id: 20, question: 'How many Bombs appear per Level and what is the Bomb key?', keys: ['bombsPerLevel', 'bombKey'], status: 'tuning', note: '3 per Level, Space key.' },
];

const APPROVED_IDS = new Set([1, 2, 3, 4, 5, 6, 7, 15, 16]);

function build(row: Row): OpenQuestion {
  const configKeys = row.keys.map(toPath);
  const defaultValue: Record<string, unknown> = {};
  for (const path of configKeys) defaultValue[path] = getByPath(DEFAULT_CONFIG, path);
  const base = { id: row.id, question: row.question, configKeys, defaultValue, status: row.status, note: row.note };
  return APPROVED_IDS.has(row.id) ? { ...base, approvedAsInitialDefault: true } : base;
}

export const OPEN_QUESTIONS: readonly OpenQuestion[] = ROWS.map(build);
