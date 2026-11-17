// Custom character skins (Character Workshop). Cosmetic only: a skin is a palette-indexed picture
// that replaces how the protagonist or the antagonist is DRAWN. It never reaches the Simulation, so
// collision (Cell based), movement, abilities, the hunter AI, scoring and victory are unchanged.
// Pure module: no DOM. Validation is strict so imported files can never break the game.
// Kind ids ('kiro', 'squareman') are the stored data format and never change; only display labels do.
import type { SpriteDef } from './sprites/format';
import { sprite } from './sprites/format';
import { ghostRows, PLAYER_PALETTE } from './sprites/ghost';
import { squaremanSprite } from './sprites/squareman';
export type SkinKind = 'kiro' | 'squareman';
export const SKIN_KINDS: readonly SkinKind[] = ['kiro', 'squareman'];
export const SKIN_SIZE: Readonly<Record<SkinKind, { w: number; h: number }>> = {
  kiro: { w: 18, h: 24 },
  squareman: { w: 24, h: 24 },
};
export const SKIN_LABEL: Readonly<Record<SkinKind, string>> = { kiro: 'Protagonist', squareman: 'Antagonist' };
/** Workshop palette. A pixel is one of these characters, or '.' for transparent. */
export const SKIN_PALETTE: readonly string[] = [
  '#0b0614', '#ffffff', '#f6f2ff', '#c9bfe6', '#6a6480', '#ff6fb5', '#c94f8c', '#c0122b', '#ff9f43', '#fff07a',
  '#ffd400', '#d9a800', '#7a5a00', '#7a3d00', '#5fd35f', '#2fb3a5', '#9ff0ff', '#4a6cff', '#8a4bff', '#1a1200',
];
export const PIXEL_CHARS = '0123456789abcdefghij';
export const TRANSPARENT = '.';
export const MAX_SKINS_PER_KIND = 12;
export const NAME_MAX = 16;
/** A protagonist skin needs at least this many pixels so the player stays easy to see. */
export const MIN_PROTAGONIST_PIXELS = 60;
/** An antagonist skin needs at least this many pixels so the hunter stays easy to see. */
export const MIN_ANTAGONIST_PIXELS = 80;
const MIN_PIXELS: Readonly<Record<SkinKind, number>> = { kiro: MIN_PROTAGONIST_PIXELS, squareman: MIN_ANTAGONIST_PIXELS };
const KIND_NOUN: Readonly<Record<SkinKind, string>> = { kiro: 'protagonist', squareman: 'antagonist' };
const NAME_RE = /^[A-Za-z0-9 _\-!?.']+$/;
const ID_RE = /^[a-z0-9-]{1,32}$/;
export interface SkinDef {
  readonly id: string;
  readonly kind: SkinKind;
  readonly name: string;
  readonly rows: readonly string[];
}
export type SkinCheck = { ok: true; skin: SkinDef } | { ok: false; reason: string };
export const paletteMap: Readonly<Record<string, string>> = Object.fromEntries([...PIXEL_CHARS].map((c, i) => [c, SKIN_PALETTE[i]!]));
/** Checks the picture alone (size, characters, readability rules). Returns a reason or null. */
export function checkRows(kind: SkinKind, rows: unknown): string | null {
  const { w, h } = SKIN_SIZE[kind];
  if (!Array.isArray(rows) || rows.length !== h) return `the picture must be ${w}x${h} pixels`;
  let opaque = 0;
  for (let y = 0; y < h; y++) {
    const r: unknown = rows[y];
    if (typeof r !== 'string' || r.length !== w) return `the picture must be ${w}x${h} pixels`;
    for (let x = 0; x < w; x++) {
      const c = r[x]!;
      if (c !== TRANSPARENT && !PIXEL_CHARS.includes(c)) return 'the picture uses an unknown colour';
      if (c !== TRANSPARENT) opaque++;
    }
  }
  if (opaque < MIN_PIXELS[kind]) return `draw at least ${MIN_PIXELS[kind]} pixels so the ${KIND_NOUN[kind]} stays visible`;
  return null;
}
export function cleanName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const n = name.replace(/\s+/g, ' ').trim();
  return n.length >= 1 && n.length <= NAME_MAX && NAME_RE.test(n) ? n : null;
}
/** Strict validator for untrusted data (storage, imported files). Returns a fresh, clean object. */
export function validateSkin(x: unknown): SkinCheck {
  if (x === null || typeof x !== 'object' || Array.isArray(x)) return { ok: false, reason: 'not a skin' };
  const o = x as Record<string, unknown>;
  if (o.kind !== 'kiro' && o.kind !== 'squareman') return { ok: false, reason: 'unknown character type' };
  if (typeof o.id !== 'string' || !ID_RE.test(o.id)) return { ok: false, reason: 'bad id' };
  const name = cleanName(o.name);
  if (name === null) return { ok: false, reason: `name must be 1-${NAME_MAX} letters, digits or spaces` };
  const why = checkRows(o.kind, o.rows);
  if (why !== null) return { ok: false, reason: why };
  return { ok: true, skin: { id: o.id, kind: o.kind, name, rows: (o.rows as string[]).map((r) => String(r)) } };
}
/**
 * Legacy antagonist pictures were 12x12 (drawn at 2x). Upscales one to the current 24x24
 * canvas (drawn 1:1, identical pixels on screen). Returns null unless the input is exactly
 * a 12x12 picture over the Workshop characters. Used for backward-compatible loading of
 * stored and imported skins; never for new saves.
 */
export function upscaleLegacySquareman(rows: unknown): string[] | null {
  if (!Array.isArray(rows) || rows.length !== 12) return null;
  const out: string[] = [];
  for (const r of rows) {
    if (typeof r !== 'string' || r.length !== 12) return null;
    for (const c of r) {
      if (c !== TRANSPARENT && !PIXEL_CHARS.includes(c)) return null;
    }
    const doubled = [...r].map((c) => c + c).join('');
    out.push(doubled, doubled);
  }
  return out;
}
/** Nearest workshop colour to a CSS hex colour. */
export function nearestChar(hexColor: string): string {
  const rgb = (h: string): [number, number, number] => {
    const v = parseInt(h.replace('#', ''), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  };
  const [r, g, b] = rgb(hexColor);
  let best = 0;
  let bestD = Infinity;
  SKIN_PALETTE.forEach((p, i) => {
    const [pr, pg, pb] = rgb(p);
    const d = (pr - r) ** 2 + (pg - g) ** 2 + (pb - b) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return PIXEL_CHARS[best]!;
}
function fromSprite(def: SpriteDef): string[] {
  return def.rows.map((r) => [...r].map((c) => (c === '.' ? TRANSPARENT : nearestChar(def.palette[c]!))).join(''));
}
/** The default character as a workshop picture (nearest Workshop colours). */
export function defaultRows(kind: SkinKind): string[] {
  return kind === 'kiro' ? fromSprite(sprite(ghostRows(0, 'none'), PLAYER_PALETTE)) : fromSprite(squaremanSprite('normal', 0));
}
export function blankRows(kind: SkinKind): string[] {
  const { w, h } = SKIN_SIZE[kind];
  return Array.from({ length: h }, () => TRANSPARENT.repeat(w));
}
export function skinSprite(rows: readonly string[]): SpriteDef {
  return sprite(rows, paletteMap);
}
export function mirrorRows(rows: readonly string[]): string[] {
  return rows.map((r) => [...r].reverse().join(''));
}
const lum = (hexColor: string): number => {
  const v = parseInt(hexColor.replace('#', ''), 16);
  return (0.2126 * ((v >> 16) & 255) + 0.7152 * ((v >> 8) & 255) + 0.0722 * (v & 255)) / 255;
};
/**
 * The antagonist's frightened look for a custom skin: the same picture in the standard frightened blues
 * with dark features turned white, so "he is edible now" reads exactly like the default.
 */
export function fleeingSprite(rows: readonly string[]): SpriteDef {
  const pal: Record<string, string> = {};
  for (const c of PIXEL_CHARS) {
    const l = lum(paletteMap[c]!);
    pal[c] = l < 0.15 ? '#ffffff' : l < 0.45 ? '#101a5a' : l < 0.75 ? '#2a44c0' : l < 0.9 ? '#4a6cff' : '#a8b8ff';
  }
  return sprite(rows, pal);
}
/** Dimmed copy (the antagonist's respawn grace), like the default respawn palette. */
export function dimSprite(rows: readonly string[]): SpriteDef {
  const pal: Record<string, string> = {};
  for (const c of PIXEL_CHARS) {
    const v = parseInt(paletteMap[c]!.replace('#', ''), 16);
    const f = (n: number): string => Math.round(n * 0.55).toString(16).padStart(2, '0');
    pal[c] = `#${f((v >> 16) & 255)}${f((v >> 8) & 255)}${f(v & 255)}`;
  }
  return sprite(rows, pal);
}
