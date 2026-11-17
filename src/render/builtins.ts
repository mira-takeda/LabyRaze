// Built-in character catalogue (LABYRAZE): 7 protagonists and 6 antagonists, all
// selectable immediately without unlocking. Built-ins live in code (never in storage),
// so they cannot be overwritten or deleted; players edit copies of them. Each built-in
// doubles as a Workshop template: frame 0 mapped onto the fixed Workshop palette.
// Selection ids are the stable strings below; custom skins can never take them.
import type { SpriteDef } from './sprites/format';
import type { SkinDef, SkinKind } from './skins';
import { TRANSPARENT, nearestChar } from './skins';
import { ANTAGONIST_IDS, ANTAGONIST_NAME, antagonistSprite } from './sprites/antagonists';
import type { AntagonistId } from './sprites/antagonists';
import { PROTAGONIST_IDS, PROTAGONIST_NAME, protagonistSprite } from './sprites/protagonists';
import type { ProtagonistId } from './sprites/protagonists';

export interface BuiltinDef {
  readonly id: string;
  readonly kind: SkinKind;
  readonly name: string;
  readonly blurb: string;
  /** Workshop-picture template: frame 0 on the fixed Workshop palette. */
  readonly rows: readonly string[];
}

/** Maps a code sprite onto Workshop picture characters ('.' stays transparent). */
function template(def: SpriteDef): string[] {
  return def.rows.map((r) => [...r].map((c) => (c === '.' ? TRANSPARENT : nearestChar(def.palette[c]!))).join(''));
}

const PROTAG_BLURB: Readonly<Record<ProtagonistId, string>> = {
  'maze-spirit-prime': 'The main hero. A curious sheet-ghost with glowing eyes.',
  'maze-spirit': 'The previous default hero. A ribbon-wrapped maze wisp.',
  'lantern-wisp': 'A bronze lantern with a wisp curled inside.',
  'rune-ghost': 'A hooded spectre with a halo and rune crystal.',
  'mask-wisp': 'A fox mask spirit with a bell and tassels.',
  'lab-lantern': 'A copper lab lantern with a bright specimen.',
  'neon-sprite': 'A shard spirit with orbiting neon cubes.',
  'blob-spirit': 'A round cheerful blob that squashes as it goes.',
};

const ANTAG_BLURB: Readonly<Record<AntagonistId, string>> = {
  'shadow-bite-prime': 'The main hunter. A vengeful shade cube with a flame rim.',
  'lantern-maw': 'An ornate lantern with a glowing zigzag maw.',
  'cursed-mask': 'An oni mask with bead strands and smoke.',
  'shadow-bite': 'The previous default hunter. A smoky cube with ember eyes.',
  'pumpkin-tech': 'A tech housing with a jack-o\u2019-lantern screen.',
  'grave-wisp': 'A cracked tombstone with a crackling maw.',
  'night-idol': 'A shrine idol with a halo and candles.',
};

export const BUILTIN_PROTAGONISTS: readonly BuiltinDef[] = PROTAGONIST_IDS.map((id) => ({
  id,
  kind: 'kiro',
  name: PROTAGONIST_NAME[id],
  blurb: PROTAG_BLURB[id],
  rows: template(protagonistSprite(id, 0, 'none')),
}));

export const BUILTIN_ANTAGONISTS: readonly BuiltinDef[] = ANTAGONIST_IDS.map((id) => ({
  id,
  kind: 'squareman',
  name: ANTAGONIST_NAME[id],
  blurb: ANTAG_BLURB[id],
  rows: template(antagonistSprite(id, 'normal', 0)),
}));

export const BUILTINS: Readonly<Record<SkinKind, readonly BuiltinDef[]>> = {
  kiro: BUILTIN_PROTAGONISTS,
  squareman: BUILTIN_ANTAGONISTS,
};

/** Selection id used when nothing is selected (null in storage): the defaults. */
export const DEFAULT_BUILTIN_ID: Readonly<Record<SkinKind, string>> = { kiro: 'maze-spirit-prime', squareman: 'shadow-bite-prime' };

export function getBuiltin(kind: SkinKind, id: string): BuiltinDef | undefined {
  return BUILTINS[kind].find((b) => b.id === id);
}

export function isBuiltinId(kind: SkinKind, id: string): boolean {
  return getBuiltin(kind, id) !== undefined;
}

/** A built-in as a skin (for selection, editor templates and death particles). */
export function builtinSkin(def: BuiltinDef): SkinDef {
  return { id: def.id, kind: def.kind, name: def.name, rows: [...def.rows] };
}
