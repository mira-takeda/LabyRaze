// Saved Character Workshop skins (local storage, import/export). Shell only. Tolerant on load
// (bad entries are dropped, never thrown), strict on every skin (validateSkin).
// Built-in characters live in code, never here; the store only resolves their selection ids.
import { builtinSkin, getBuiltin, isBuiltinId } from '../render/builtins';
import { MAX_SKINS_PER_KIND, SKIN_KINDS, upscaleLegacySquareman, validateSkin } from '../render/skins';
import type { SkinCheck, SkinDef, SkinKind } from '../render/skins';
import type { StorageLike } from './highScores';
export const SKINS_KEY = 'kirobit.skins.v1';
export const EXPORT_TAG = 'kirobitSkins';
/** Largest import file accepted (characters). */
export const IMPORT_MAX_CHARS = 200_000;
/** Largest skin list read from one import (extras are reported, never silently kept). */
export const IMPORT_MAX_SKINS = 200;
export interface SkinData {
  skins: SkinDef[];
  selected: Record<SkinKind, string | null>;
}
const emptyData = (): SkinData => ({ skins: [], selected: { kiro: null, squareman: null } });
/** Validated skins from any JSON value: a skin, an array, or { kirobitSkins: 1, skins: [...] }. */
export function skinsFrom(value: unknown): { skins: SkinDef[]; rejected: string[] } {
  let list: unknown[] = [];
  if (Array.isArray(value)) list = value;
  else if (value !== null && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    list = Array.isArray(o.skins) ? o.skins : [value];
  }
  const skins: SkinDef[] = [];
  const rejected: string[] = [];
  for (const x of list.slice(0, IMPORT_MAX_SKINS)) {
    const r = migrateLegacy(x);
    if (r.ok) skins.push(r.skin);
    else rejected.push(r.reason);
  }
  if (list.length > IMPORT_MAX_SKINS) rejected.unshift(`file holds more than ${IMPORT_MAX_SKINS} skins; only the first ${IMPORT_MAX_SKINS} were read`);
  return { skins, rejected };
}
/**
 * Strict validation with one backward-compatible retry: pre-LABYRAZE antagonist pictures
 * were 12x12, so a failing squareman entry is re-validated after a 2x upscale.
 */
function migrateLegacy(x: unknown): SkinCheck {
  const r = validateSkin(x);
  if (r.ok) return r;
  if (x !== null && typeof x === 'object' && !Array.isArray(x)) {
    const o = x as Record<string, unknown>;
    if (o.kind === 'squareman') {
      const up = upscaleLegacySquareman(o.rows);
      if (up !== null) return validateSkin({ ...o, rows: up });
    }
  }
  return r;
}

/** Tolerant parser of the stored blob. */
export function parseSkinData(raw: string | null): SkinData {
  const out = emptyData();
  if (raw === null || raw.length > IMPORT_MAX_CHARS * 4) return out;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return out;
  }
  const seen = new Set<string>();
  // A stored custom skin can never keep a built-in id (hand-edited storage only: real
  // saves always generated fresh ids). Renewed ids keep pointing at the same skin.
  const renewed = new Map<string, string>();
  let salt = 0;
  for (const s of skinsFrom(v).skins) {
    let skin = s;
    if (isBuiltinId(s.kind, s.id)) {
      salt++;
      skin = { ...s, id: `r${salt}-${s.id}`.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32) };
      renewed.set(`${s.kind}:${s.id}`, skin.id);
    }
    if (seen.has(skin.id)) continue;
    if (out.skins.filter((k) => k.kind === skin.kind).length >= MAX_SKINS_PER_KIND) continue;
    seen.add(skin.id);
    out.skins.push(skin);
  }
  const sel = v !== null && typeof v === 'object' ? (v as { selected?: Record<string, unknown> }).selected : undefined;
  for (const kind of SKIN_KINDS) {
    const raw = sel?.[kind];
    if (typeof raw !== 'string') continue;
    const id = renewed.get(`${kind}:${raw}`) ?? raw;
    if (out.skins.some((s) => s.id === id && s.kind === kind) || isBuiltinId(kind, id)) out.selected[kind] = id;
  }
  return out;
}
export type SaveResult = { ok: true; skin: SkinDef } | { ok: false; reason: string };
export class SkinStore {
  private data: SkinData;
  private n = 0;
  constructor(
    private readonly storage: StorageLike | null,
    private readonly newId: () => string = () => `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
  ) {
    let raw: string | null = null;
    try {
      raw = storage?.getItem(SKINS_KEY) ?? null;
    } catch {
      raw = null;
    }
    this.data = parseSkinData(raw);
  }
  list(kind: SkinKind): SkinDef[] {
    return this.data.skins.filter((s) => s.kind === kind);
  }
  get(id: string): SkinDef | null {
    return this.data.skins.find((s) => s.id === id) ?? null;
  }
  /** The skin in use for a character: a saved skin, a built-in, or null for the default. */
  selected(kind: SkinKind): SkinDef | null {
    const id = this.data.selected[kind];
    if (id === null) return null;
    const custom = this.get(id);
    if (custom !== null && custom.kind === kind) return custom;
    const builtin = getBuiltin(kind, id);
    return builtin ? builtinSkin(builtin) : null;
  }
  selectedId(kind: SkinKind): string | null {
    return this.data.selected[kind];
  }
  private freshId(kind: SkinKind): string {
    let id = '';
    do id = `${kind === 'kiro' ? 'k' : 's'}-${this.newId()}-${this.n++}`.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32);
    while (this.get(id) !== null || isBuiltinId(kind, id));
    return id;
  }
  /** Saves a picture: overwrites `id` when given and present, otherwise adds a new skin. */
  save(kind: SkinKind, name: string, rows: readonly string[], id?: string | null): SaveResult {
    const existing = id ? this.get(id) : null;
    if (!existing && this.list(kind).length >= MAX_SKINS_PER_KIND) return { ok: false, reason: `at most ${MAX_SKINS_PER_KIND} saved skins per character` };
    const r = validateSkin({ id: existing ? existing.id : this.freshId(kind), kind, name, rows: [...rows] });
    if (!r.ok) return r;
    if (existing) this.data.skins = this.data.skins.map((s) => (s.id === existing.id ? r.skin : s));
    else this.data.skins.push(r.skin);
    this.persist();
    return r;
  }
  remove(id: string): void {
    const s = this.get(id);
    if (!s) return;
    this.data.skins = this.data.skins.filter((k) => k.id !== id);
    if (this.data.selected[s.kind] === id) this.data.selected[s.kind] = null;
    this.persist();
  }
  /** Selects a saved skin or a built-in, or null to restore the default character. */
  select(kind: SkinKind, id: string | null): void {
    this.data.selected[kind] = id !== null && (this.get(id)?.kind === kind || isBuiltinId(kind, id)) ? id : null;
    this.persist();
  }
  exportJson(): string {
    return JSON.stringify({ [EXPORT_TAG]: 1, skins: this.data.skins }, null, 1);
  }
  /** Imports skins from JSON text. Every skin is validated; ids are renewed to avoid clashes. */
  importJson(text: string): { added: number; rejected: number; reasons: string[] } {
    if (text.length > IMPORT_MAX_CHARS) return { added: 0, rejected: 1, reasons: ['file too large'] };
    let v: unknown;
    try {
      v = JSON.parse(text);
    } catch {
      return { added: 0, rejected: 1, reasons: ['not a LABYRAZE skin file'] };
    }
    const { skins, rejected } = skinsFrom(v);
    const reasons = [...rejected];
    let added = 0;
    for (const s of skins) {
      const r = this.save(s.kind, s.name, s.rows);
      if (r.ok) added++;
      else reasons.push(r.reason);
    }
    return { added, rejected: reasons.length, reasons };
  }
  private persist(): void {
    try {
      this.storage?.setItem(SKINS_KEY, JSON.stringify(this.data));
    } catch {
      // Storage full or blocked: skins still work for this session.
    }
  }
}
